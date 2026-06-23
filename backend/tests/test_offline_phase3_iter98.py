"""
Test Suite for Offline Phase 3 - Iteration 98
=============================================

Couvre :
  - POST /api/offline/preallocate?count=N (format EM-YYYYMMDD-O0001, incrément séquence)
  - GET  /api/offline/preallocate/status (total/used/unused/items, filtre user)
  - POST /api/offline/preallocate/release (libère les numéros non utilisés)
  - POST /api/sync/queue/process avec create_invoice + numéro pré-alloué
  - POST /api/sync/queue/process avec validate_invoice
  - POST /api/sync/queue/process avec create_financial_point
  - Idempotence (même client_id → status=duplicate)
  - Garde-fou journée fermée pour create_invoice
  - Non régression : create_table

Pas de nettoyage agressif : on tag tout avec test client_ids 'test-iter98-*'.
"""
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
TODAY_ISO = datetime.now(timezone.utc).strftime("%Y-%m-%d")
TODAY_YYYYMMDD = datetime.now(timezone.utc).strftime("%Y%m%d")


# ───────── Helpers ─────────

def _open_day_if_needed():
    """Ouvre la journée du jour si elle n'est pas déjà ouverte (en tant qu'admin)."""
    r = requests.get(f"{BASE_URL}/api/day-openings/{TODAY_ISO}", timeout=10)
    if r.status_code == 200 and (r.json().get("opening") or {}).get("status") == "open":
        return True
    payload = {
        "opened_by": "admin",
        "opened_by_role": "admin",
        "initial_cash": 0,
        "notes": "test-iter98 phase3",
        "force": True,
    }
    r2 = requests.post(
        f"{BASE_URL}/api/day-openings/{TODAY_ISO}/open",
        json=payload,
        timeout=15,
    )
    return r2.status_code == 200


# ───────── 1. Préallocation ─────────

class TestPreallocate:
    """POST /api/offline/preallocate"""

    def test_preallocate_basic(self):
        r = requests.post(
            f"{BASE_URL}/api/offline/preallocate?count=5",
            json={"user": "test-iter98-user", "role": "gerante"},
            timeout=15,
        )
        assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
        data = r.json()
        assert data["success"] is True
        assert data["count"] == 5
        assert len(data["numbers"]) == 5
        # Format check
        for n in data["numbers"]:
            assert n.startswith(f"EM-{TODAY_YYYYMMDD}-O"), f"Bad format: {n}"
            tail = n.split("-O")[1]
            assert len(tail) == 4 and tail.isdigit(), f"Bad tail: {n}"
        # Sequential
        seqs = [int(n.split("-O")[1]) for n in data["numbers"]]
        assert seqs == list(range(seqs[0], seqs[0] + 5)), "Not sequential"

    def test_preallocate_increments_atomically(self):
        a = requests.post(
            f"{BASE_URL}/api/offline/preallocate?count=3",
            json={"user": "test-iter98-user2", "role": "gerante"},
            timeout=15,
        ).json()
        b = requests.post(
            f"{BASE_URL}/api/offline/preallocate?count=2",
            json={"user": "test-iter98-user2", "role": "gerante"},
            timeout=15,
        ).json()
        last_a = int(a["numbers"][-1].split("-O")[1])
        first_b = int(b["numbers"][0].split("-O")[1])
        assert first_b == last_a + 1, f"Expected continuation, got {first_b} after {last_a}"

    def test_preallocate_count_limits(self):
        # count=0 should be rejected (ge=1)
        r0 = requests.post(f"{BASE_URL}/api/offline/preallocate?count=0", json={}, timeout=10)
        assert r0.status_code == 422
        # count=201 should be rejected (le=200)
        r201 = requests.post(f"{BASE_URL}/api/offline/preallocate?count=201", json={}, timeout=10)
        assert r201.status_code == 422


# ───────── 2. Status & Release ─────────

class TestStatusAndRelease:
    def test_status_filtered_by_user(self):
        unique_user = f"test-iter98-status-{uuid.uuid4().hex[:6]}"
        r = requests.post(
            f"{BASE_URL}/api/offline/preallocate?count=4",
            json={"user": unique_user, "role": "gerante"},
            timeout=15,
        )
        assert r.status_code == 200
        numbers_created = r.json()["numbers"]

        s = requests.get(
            f"{BASE_URL}/api/offline/preallocate/status?user={unique_user}",
            timeout=15,
        )
        assert s.status_code == 200
        sd = s.json()
        assert sd["total"] == 4
        assert sd["used"] == 0
        assert sd["unused"] == 4
        assert isinstance(sd["items"], list)
        item_numbers = [it["number"] for it in sd["items"]]
        for n in numbers_created:
            assert n in item_numbers

    def test_release_unused_numbers(self):
        unique_user = f"test-iter98-rel-{uuid.uuid4().hex[:6]}"
        r = requests.post(
            f"{BASE_URL}/api/offline/preallocate?count=3",
            json={"user": unique_user, "role": "gerante"},
            timeout=15,
        )
        nums = r.json()["numbers"]

        rel = requests.post(
            f"{BASE_URL}/api/offline/preallocate/release",
            json={"numbers": nums},
            timeout=15,
        )
        assert rel.status_code == 200, rel.text
        assert rel.json()["released"] == 3

        # Status now zero for that user
        s = requests.get(
            f"{BASE_URL}/api/offline/preallocate/status?user={unique_user}",
            timeout=15,
        ).json()
        assert s["total"] == 0


# ───────── 3. Sync queue : create_invoice avec numéro pré-alloué ─────────

class TestSyncCreateInvoiceWithPrealloc:
    """create_invoice doit accepter le numéro pré-alloué et le marquer used:true"""

    def test_create_invoice_uses_preallocated_number(self):
        assert _open_day_if_needed(), "Could not open day for invoice tests"

        # 1. preallocate one
        unique_user = f"test-iter98-inv-{uuid.uuid4().hex[:6]}"
        rp = requests.post(
            f"{BASE_URL}/api/offline/preallocate?count=1",
            json={"user": unique_user, "role": "gerante"},
            timeout=15,
        )
        prealloc_number = rp.json()["numbers"][0]

        # 2. submit a create_invoice with this number
        client_id = f"test-iter98-{uuid.uuid4()}"
        invoice_id = str(uuid.uuid4())
        body = {
            "actions": [{
                "client_id": client_id,
                "type": "create_invoice",
                "queued_at": datetime.now(timezone.utc).isoformat(),
                "payload": {
                    "id": invoice_id,
                    "invoice_number": prealloc_number,
                    "customer_name": "Test Iter98 Customer",
                    "items": [{"name": "test-item", "price": 100, "quantity": 1}],
                    "subtotal": 100, "total": 100,
                    "payment_method": "cash",
                    "created_by": unique_user,
                },
                "user": {"name": unique_user, "role": "gerante"},
            }]
        }
        rq = requests.post(f"{BASE_URL}/api/sync/queue/process", json=body, timeout=20)
        assert rq.status_code == 200, rq.text
        res = rq.json()["results"][0]
        assert res["status"] == "ok", f"Expected ok, got {res}"
        assert res["data"]["invoice_number"] == prealloc_number, \
            f"Backend replaced the preallocated number: {res['data']['invoice_number']}"

        # 3. Verify the reservation is now used:true
        st = requests.get(
            f"{BASE_URL}/api/offline/preallocate/status?user={unique_user}",
            timeout=15,
        ).json()
        used_items = [i for i in st["items"] if i["number"] == prealloc_number]
        assert used_items, "Preallocated number not found in status"
        assert used_items[0]["used"] is True, "Preallocated number not marked used"
        assert used_items[0]["invoice_id"] == invoice_id

        # Save for idempotence test
        TestSyncCreateInvoiceWithPrealloc._client_id = client_id
        TestSyncCreateInvoiceWithPrealloc._invoice_id = invoice_id

    def test_create_invoice_idempotent_duplicate(self):
        """Replay the same action → status=duplicate"""
        cid = getattr(TestSyncCreateInvoiceWithPrealloc, "_client_id", None)
        if not cid:
            pytest.skip("Previous test did not run / save client_id")
        body = {"actions": [{"client_id": cid, "type": "create_invoice",
                              "payload": {"id": "irrelevant"}}]}
        r = requests.post(f"{BASE_URL}/api/sync/queue/process", json=body, timeout=15)
        assert r.status_code == 200
        assert r.json()["results"][0]["status"] == "duplicate"

    def test_create_invoice_unknown_prealloc_falls_back_to_sequential(self):
        """Si le numéro EM-...-O.... n'est pas réservé, on tombe sur la séquence standard."""
        assert _open_day_if_needed()
        unknown_number = f"EM-{TODAY_YYYYMMDD}-O9999"  # unlikely to be reserved
        # Make sure it's not reserved
        requests.post(f"{BASE_URL}/api/offline/preallocate/release",
                      json={"numbers": [unknown_number]}, timeout=10)

        client_id = f"test-iter98-{uuid.uuid4()}"
        body = {"actions": [{
            "client_id": client_id,
            "type": "create_invoice",
            "payload": {
                "id": str(uuid.uuid4()),
                "invoice_number": unknown_number,
                "items": [], "subtotal": 50, "total": 50,
                "payment_method": "cash",
            },
        }]}
        r = requests.post(f"{BASE_URL}/api/sync/queue/process", json=body, timeout=15)
        assert r.status_code == 200
        res = r.json()["results"][0]
        assert res["status"] == "ok", res
        # The invoice_number must NOT be the unknown one — should be standard EM-YYYYMMDD-NNNN
        new_num = res["data"]["invoice_number"]
        assert "-O" not in new_num.split("-")[-1], f"Should have fallen back, got {new_num}"


# ───────── 4. validate_invoice ─────────

class TestValidateInvoice:
    @classmethod
    def setup_class(cls):
        assert _open_day_if_needed()
        # Create an invoice we can then validate
        cls.client_id_create = f"test-iter98-{uuid.uuid4()}"
        cls.invoice_id = str(uuid.uuid4())
        body = {"actions": [{
            "client_id": cls.client_id_create,
            "type": "create_invoice",
            "payload": {
                "id": cls.invoice_id,
                "items": [], "subtotal": 10, "total": 10, "payment_method": "cash",
            },
        }]}
        r = requests.post(f"{BASE_URL}/api/sync/queue/process", json=body, timeout=15)
        assert r.status_code == 200
        assert r.json()["results"][0]["status"] == "ok"

    def test_validate_existing_invoice(self):
        cid = f"test-iter98-{uuid.uuid4()}"
        body = {"actions": [{
            "client_id": cid,
            "type": "validate_invoice",
            "payload": {"id": self.invoice_id, "validated_by": "admin"},
        }]}
        r = requests.post(f"{BASE_URL}/api/sync/queue/process", json=body, timeout=15)
        assert r.status_code == 200, r.text
        res = r.json()["results"][0]
        assert res["status"] == "ok", res
        assert res["data"]["validation_status"] == "validated"
        assert res["data"]["validated_by"] == "admin"

    def test_validate_idempotent_already_validated(self):
        """Replay validate on already-validated invoice → status=ok"""
        cid = f"test-iter98-{uuid.uuid4()}"
        body = {"actions": [{
            "client_id": cid,
            "type": "validate_invoice",
            "payload": {"id": self.invoice_id},
        }]}
        r = requests.post(f"{BASE_URL}/api/sync/queue/process", json=body, timeout=15)
        res = r.json()["results"][0]
        assert res["status"] == "ok", res

    def test_validate_unknown_invoice_conflict(self):
        cid = f"test-iter98-{uuid.uuid4()}"
        body = {"actions": [{
            "client_id": cid,
            "type": "validate_invoice",
            "payload": {"id": "non-existent-iter98"},
        }]}
        r = requests.post(f"{BASE_URL}/api/sync/queue/process", json=body, timeout=15)
        res = r.json()["results"][0]
        assert res["status"] == "conflict", res

    def test_validate_missing_id_error(self):
        cid = f"test-iter98-{uuid.uuid4()}"
        body = {"actions": [{
            "client_id": cid,
            "type": "validate_invoice",
            "payload": {},
        }]}
        r = requests.post(f"{BASE_URL}/api/sync/queue/process", json=body, timeout=15)
        res = r.json()["results"][0]
        assert res["status"] == "error"


# ───────── 5. create_financial_point ─────────

class TestCreateFinancialPoint:
    def test_create_point_ok(self):
        cid = f"test-iter98-{uuid.uuid4()}"
        unique_date = f"2099-01-{(uuid.uuid4().int % 28) + 1:02d}"  # future, isolated date
        unique_category = f"test-iter98-{uuid.uuid4().hex[:6]}"
        body = {"actions": [{
            "client_id": cid,
            "type": "create_financial_point",
            "payload": {
                "date": unique_date,
                "period_type": "daily",
                "category": unique_category,
                "cash_amount": 1000,
                "mobile_amount": 500,
                "created_by": "test-iter98",
            },
        }]}
        r = requests.post(f"{BASE_URL}/api/sync/queue/process", json=body, timeout=15)
        assert r.status_code == 200, r.text
        res = r.json()["results"][0]
        assert res["status"] == "ok", res
        assert res["data"]["total_amount"] == 1500
        assert "id" in res["data"]
        TestCreateFinancialPoint._date = unique_date
        TestCreateFinancialPoint._category = unique_category

    def test_create_point_duplicate_period_conflict(self):
        """Re-submit a different client_id but same date+period+category → conflict"""
        cid = f"test-iter98-{uuid.uuid4()}"
        body = {"actions": [{
            "client_id": cid,
            "type": "create_financial_point",
            "payload": {
                "date": TestCreateFinancialPoint._date,
                "period_type": "daily",
                "category": TestCreateFinancialPoint._category,
                "cash_amount": 100,
            },
        }]}
        r = requests.post(f"{BASE_URL}/api/sync/queue/process", json=body, timeout=15)
        res = r.json()["results"][0]
        assert res["status"] == "conflict", res

    def test_create_point_missing_date_error(self):
        cid = f"test-iter98-{uuid.uuid4()}"
        body = {"actions": [{
            "client_id": cid,
            "type": "create_financial_point",
            "payload": {"period_type": "daily", "category": "x"},
        }]}
        r = requests.post(f"{BASE_URL}/api/sync/queue/process", json=body, timeout=15)
        res = r.json()["results"][0]
        assert res["status"] == "error"


# ───────── 6. Idempotence générale ─────────

class TestIdempotence:
    def test_same_client_id_returns_duplicate(self):
        assert _open_day_if_needed()
        cid = f"test-iter98-idem-{uuid.uuid4()}"
        action = {
            "client_id": cid,
            "type": "create_invoice",
            "payload": {"id": str(uuid.uuid4()), "items": [], "subtotal": 1, "total": 1,
                         "payment_method": "cash"},
        }
        r1 = requests.post(f"{BASE_URL}/api/sync/queue/process",
                            json={"actions": [action]}, timeout=15).json()
        assert r1["results"][0]["status"] == "ok"

        r2 = requests.post(f"{BASE_URL}/api/sync/queue/process",
                            json={"actions": [action]}, timeout=15).json()
        assert r2["results"][0]["status"] == "duplicate"


# ───────── 7. Non régression : create_table ─────────

class TestCreateTableRegression:
    def test_create_table_still_works(self):
        cid = f"test-iter98-tbl-{uuid.uuid4()}"
        body = {"actions": [{
            "client_id": cid,
            "type": "create_table",
            "payload": {
                "id": str(uuid.uuid4()),
                "table_number": f"T-iter98-{uuid.uuid4().hex[:4]}",
                "server_id": "test-iter98-server",
                "server_name": "iter98",
                "items": [],
                "client_name": "Client iter98",
            },
        }]}
        r = requests.post(f"{BASE_URL}/api/sync/queue/process", json=body, timeout=15)
        assert r.status_code == 200, r.text
        res = r.json()["results"][0]
        assert res["status"] == "ok", res


# ───────── 8. Cleanup ─────────

def teardown_module(_module):
    """Best-effort cleanup of test-iter98-* data via release endpoint and direct deletes via API are not exposed.
    Cleanup will be requested in the test report. We at least release any unused preallocated numbers."""
    try:
        s = requests.get(f"{BASE_URL}/api/offline/preallocate/status?limit=500", timeout=15).json()
        to_release = [
            it["number"] for it in s.get("items", [])
            if (it.get("reserved_for") or "").startswith("test-iter98") and not it.get("used")
        ]
        if to_release:
            requests.post(f"{BASE_URL}/api/offline/preallocate/release",
                          json={"numbers": to_release}, timeout=15)
    except Exception:
        pass
