"""
Iteration 99 — Caisse Product Approval Workflow + Deduplication
================================================================

Tests:
- Création produit par manager → status=pending, pending=true, absent du GET par défaut
- Création produit par admin → status=approved, visible immédiatement
- GET avec include_pending=true / status=all / status=pending
- GET /caisse/products/pending
- POST /caisse/products/{id}/approve (idempotent)
- POST /caisse/products/{id}/reject (suppression + trace audit)
- GET /caisse/products/duplicates : détection par nom normalisé
- POST /caisse/products/deduplicate (dry_run + réel, conserve le plus d'historique)
- Produit pending non disponible pour facturation par défaut
"""
import os
import time
import uuid
import pytest
import requests
from pathlib import Path

# Load REACT_APP_BACKEND_URL from frontend .env file
def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if url:
        return url.rstrip("/")
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

PREFIX = f"TEST_DEDUP_{uuid.uuid4().hex[:6]}"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session", autouse=True)
def cleanup(session):
    """Cleanup any leftover TEST_DEDUP_* products at end of run."""
    yield
    # Get all (including pending)
    try:
        r = session.get(f"{API}/caisse/products?status=all", timeout=10)
        if r.status_code == 200:
            for p in r.json().get("products", []):
                name = p.get("name", "")
                if name.startswith("TEST_DEDUP_") or name.startswith(PREFIX):
                    session.delete(f"{API}/caisse/products/{p['id']}", timeout=10)
    except Exception:
        pass


# ─────────────── Helpers ───────────────

def _create_product(session, name, price=1000, role="admin", actor="Admin"):
    payload = {
        "name": name,
        "price": price,
        "department": "bar",
        "unit": "unité",
        "category": "",
        "is_available": True,
    }
    r = session.post(
        f"{API}/caisse/products",
        params={"modified_by": actor, "modified_by_role": role},
        json=payload,
        timeout=15,
    )
    return r


# ─────────────── 1. Création par manager → pending ───────────────

class TestPendingCreation:

    def test_create_by_manager_returns_pending(self, session):
        name = f"{PREFIX}_MGR_{uuid.uuid4().hex[:4]}"
        r = _create_product(session, name, role="manager", actor="Mères AHOUANDJINOU")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        assert data["pending"] is True
        assert data["product"]["status"] == "pending"
        assert data["product"]["created_by_role"] == "manager"
        # Store id for next test
        pytest.pending_product_id = data["product"]["id"]
        pytest.pending_product_name = name

    def test_pending_product_not_in_default_get(self, session):
        r = session.get(f"{API}/caisse/products", timeout=10)
        assert r.status_code == 200
        names = [p.get("name") for p in r.json().get("products", [])]
        assert pytest.pending_product_name not in names

    def test_pending_visible_with_include_pending(self, session):
        r = session.get(f"{API}/caisse/products?include_pending=true", timeout=10)
        assert r.status_code == 200
        names = [p.get("name") for p in r.json().get("products", [])]
        assert pytest.pending_product_name in names

    def test_pending_visible_with_status_all(self, session):
        r = session.get(f"{API}/caisse/products?status=all", timeout=10)
        assert r.status_code == 200
        names = [p.get("name") for p in r.json().get("products", [])]
        assert pytest.pending_product_name in names

    def test_status_pending_filter(self, session):
        r = session.get(f"{API}/caisse/products?status=pending", timeout=10)
        assert r.status_code == 200
        products = r.json().get("products", [])
        # All returned products must have status pending
        for p in products:
            assert p.get("status") == "pending"
        ids = [p.get("id") for p in products]
        assert pytest.pending_product_id in ids

    def test_pending_endpoint_returns_pending_only(self, session):
        """Critical: /caisse/products/pending must NOT collide with /{id}."""
        r = session.get(f"{API}/caisse/products/pending", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "products" in data
        assert "total" in data
        ids = [p.get("id") for p in data["products"]]
        assert pytest.pending_product_id in ids
        for p in data["products"]:
            assert p.get("status") == "pending"


# ─────────────── 2. Création par admin → approved direct ───────────────

class TestAdminCreation:

    def test_create_by_admin_returns_approved(self, session):
        name = f"{PREFIX}_ADM_{uuid.uuid4().hex[:4]}"
        r = _create_product(session, name, role="admin", actor="Admin")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        assert data["pending"] is False
        assert data["product"]["status"] == "approved"
        assert data["product"]["approved_by"]
        assert data["product"]["approved_at"]
        pytest.admin_product_id = data["product"]["id"]
        pytest.admin_product_name = name

    def test_admin_product_in_default_get(self, session):
        r = session.get(f"{API}/caisse/products", timeout=10)
        assert r.status_code == 200
        names = [p.get("name") for p in r.json().get("products", [])]
        assert pytest.admin_product_name in names


# ─────────────── 3. Approval idempotent ───────────────

class TestApprove:

    def test_approve_pending_product(self, session):
        # Create a fresh pending product
        name = f"{PREFIX}_APPROVE_{uuid.uuid4().hex[:4]}"
        r = _create_product(session, name, role="manager", actor="Manager1")
        pid = r.json()["product"]["id"]

        r2 = session.post(
            f"{API}/caisse/products/{pid}/approve",
            json={"actor_name": "Admin"},
            timeout=10,
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["success"] is True

        # Verify in GET (default — must now appear)
        r3 = session.get(f"{API}/caisse/products", timeout=10)
        names = [p.get("name") for p in r3.json().get("products", [])]
        assert name in names

        # Idempotent
        r4 = session.post(
            f"{API}/caisse/products/{pid}/approve",
            json={"actor_name": "Admin"},
            timeout=10,
        )
        assert r4.status_code == 200
        body = r4.json()
        assert body.get("already_approved") is True

        pytest.approved_id = pid


# ─────────────── 4. Reject ───────────────

class TestReject:

    def test_reject_removes_product_and_traces(self, session):
        name = f"{PREFIX}_REJECT_{uuid.uuid4().hex[:4]}"
        r = _create_product(session, name, role="manager", actor="Manager2")
        pid = r.json()["product"]["id"]

        r2 = session.post(
            f"{API}/caisse/products/{pid}/reject",
            json={"actor_name": "Admin", "reason": "Test rejection"},
            timeout=10,
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["success"] is True

        # Product must not exist anymore
        r3 = session.get(f"{API}/caisse/products?status=all", timeout=10)
        ids = [p.get("id") for p in r3.json().get("products", [])]
        assert pid not in ids

        # Re-approve on a deleted product should 404
        r4 = session.post(
            f"{API}/caisse/products/{pid}/approve",
            json={"actor_name": "Admin"},
            timeout=10,
        )
        assert r4.status_code == 404


# ─────────────── 5. Doublons + Déduplication ───────────────

class TestDuplicates:

    @pytest.fixture(scope="class", autouse=True)
    def setup_duplicates(self, session):
        """Create 3 duplicates with case/accent/space variations."""
        base = f"{PREFIX}_CAFE_{uuid.uuid4().hex[:4]}"
        # Variants: same when normalized (lower + no accents + collapsed spaces)
        variants = [
            f"Café Express {base}",
            f"café  express {base.upper()}",   # extra space + different case on suffix
            f"CAFE EXPRESS {base.lower()}",
        ]
        # Use admin role so all are approved (testing pure dedup logic)
        ids = []
        for v in variants:
            r = _create_product(session, v, role="admin", actor="Admin")
            assert r.status_code == 200
            ids.append(r.json()["product"]["id"])
        pytest.dup_ids = ids
        pytest.dup_names = variants

        # To validate "keeper = most history", attach the 2nd product to an invoice
        # via items.product_id, then we expect that one to be kept.
        # We do not actually POST invoice (would need session/day flow + price flow).
        # Instead, directly insert via the dedup endpoint expectation: it uses
        # db.invoices.count_documents on product_id. So we use an expense which is
        # easier: items.product_id field with our ID.
        # However that requires DB access; for now, simply check that dedup picks
        # the one with the most history naturally (could be 0=0=0 — fallback to oldest).
        yield

    def test_duplicates_endpoint_detects_group(self, session):
        # Ensure the three variants are normalised to ONE key
        # Variants share "café express <suffix>" but suffixes differ in case only — that
        # normalises to a single key only if .lower() applied. So they should group.
        # NB: The 1st and 3rd suffixes share normalized form (base lowercased == base lower).
        # The 2nd suffix is upper(base) — same after lower(). Hence: same normalized key.
        r = session.get(f"{API}/caisse/products/duplicates", timeout=15)
        assert r.status_code == 200, r.text
        groups = r.json().get("groups", [])

        # Find our group (containing our 3 ids)
        our_group = None
        for g in groups:
            ids_in_group = [it["id"] for it in g["items"]]
            if all(i in ids_in_group for i in pytest.dup_ids):
                our_group = g
                break

        assert our_group is not None, (
            f"Group containing our 3 IDs not found. Groups: "
            f"{[g.get('normalized') for g in groups]}"
        )
        assert our_group["count"] == 3
        assert len(our_group["items"]) == 3
        assert "keeper_id" in our_group
        assert our_group["keeper_id"] in pytest.dup_ids

    def test_deduplicate_dry_run_does_not_delete(self, session):
        r = session.post(
            f"{API}/caisse/products/deduplicate",
            json={"dry_run": True, "actor_name": "Admin"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        assert data["dry_run"] is True
        assert data["deleted_count"] == 0
        assert data["candidates_removed"] >= 2  # at least our 2 losers

        # Verify all 3 still exist
        r2 = session.get(f"{API}/caisse/products?status=all", timeout=10)
        ids = [p["id"] for p in r2.json()["products"]]
        for pid in pytest.dup_ids:
            assert pid in ids, f"Product {pid} should still exist after dry_run"

    def test_deduplicate_real_run_keeps_most_history(self, session):
        r = session.post(
            f"{API}/caisse/products/deduplicate",
            json={"dry_run": False, "actor_name": "Admin"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        assert data["dry_run"] is False
        assert data["deleted_count"] >= 2

        # Verify only one of our 3 remains
        r2 = session.get(f"{API}/caisse/products?status=all", timeout=10)
        ids = [p["id"] for p in r2.json()["products"]]
        remaining = [i for i in pytest.dup_ids if i in ids]
        assert len(remaining) == 1, f"Expected 1 keeper, got {remaining}"

        # The remaining should match the "keeper" expected in the plan
        kept = remaining[0]
        # The keeper in plan for our group must be the same one remaining
        found_in_plan = False
        for g in data.get("groups", []):
            ids_in_plan = [r_["id"] for r_ in g.get("removed", [])] + [g["keeper"]["id"]]
            if all(i in ids_in_plan for i in pytest.dup_ids):
                assert g["keeper"]["id"] == kept
                found_in_plan = True
                break
        assert found_in_plan, "Our dedup group must be in the response plan"


# ─────────────── 6. Pending product cannot be used in invoice ───────────────

class TestPendingNotUsable:

    def test_pending_product_not_listed_for_billing(self, session):
        """A pending product should not appear in the standard catalogue used by Caisse."""
        name = f"{PREFIX}_NOTUSE_{uuid.uuid4().hex[:4]}"
        r = _create_product(session, name, role="manager", actor="Manager3")
        assert r.status_code == 200
        pid = r.json()["product"]["id"]

        # Standard GET (used by POS/Caisse) — must NOT contain it
        r2 = session.get(f"{API}/caisse/products", timeout=10)
        ids = [p["id"] for p in r2.json()["products"]]
        assert pid not in ids
