"""
Tests for iteration 119:
- GET/PUT/DELETE /api/admin/caisse-thresholds
- Validation (rates, caps)
- manager-orders cap-status uses dynamic threshold
- monsieur-orders applies 50% discount automatically
- manager-orders enforces dynamic cap with discount applied
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://caisse-mon-point.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module", autouse=True)
def restore_defaults_after_tests():
    """Make sure thresholds get reset to defaults at the end of this module."""
    yield
    try:
        requests.delete(f"{API}/admin/caisse-thresholds", timeout=15)
    except Exception:
        pass


# --- Section: GET defaults & customization flag ---

class TestThresholdsDefaultsAndCRUD:
    def test_reset_then_get_defaults(self):
        # ensure clean state
        r = requests.delete(f"{API}/admin/caisse-thresholds", timeout=15)
        assert r.status_code == 200, r.text

        r = requests.get(f"{API}/admin/caisse-thresholds", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["manager_monthly_cap"] == 15000.0
        assert data["manager_discount_rate"] == 0.5
        assert data["director_monthly_cap"] == 0.0
        assert data["director_discount_rate"] == 0.5
        assert data["employee_monthly_cap"] == 10000.0
        assert data["employee_discount_rate"] == 0.5
        assert data["is_customized"] is False

    def test_put_then_get_persists(self):
        r = requests.put(f"{API}/admin/caisse-thresholds",
                         json={"manager_monthly_cap": 20000}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["manager_monthly_cap"] == 20000.0
        assert data["is_customized"] is True

        r2 = requests.get(f"{API}/admin/caisse-thresholds", timeout=15)
        assert r2.status_code == 200
        assert r2.json()["manager_monthly_cap"] == 20000.0
        assert r2.json()["is_customized"] is True

    def test_delete_resets_to_defaults(self):
        r = requests.delete(f"{API}/admin/caisse-thresholds", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["manager_monthly_cap"] == 15000.0
        assert data["is_customized"] is False


# --- Section: Validation ---

class TestThresholdsValidation:
    def test_invalid_rate_too_high(self):
        r = requests.put(f"{API}/admin/caisse-thresholds",
                         json={"manager_discount_rate": 1.5}, timeout=15)
        assert r.status_code == 400
        assert "entre 0 et 1" in r.text

    def test_invalid_negative_cap(self):
        r = requests.put(f"{API}/admin/caisse-thresholds",
                         json={"director_monthly_cap": -100}, timeout=15)
        assert r.status_code == 400
        assert "≥ 0" in r.text or ">= 0" in r.text or "doit" in r.text


# --- Section: Manager cap-status reflects dynamic threshold ---

class TestManagerCapStatusDynamic:
    def test_cap_status_default(self):
        # ensure default
        requests.delete(f"{API}/admin/caisse-thresholds", timeout=15)
        r = requests.get(f"{API}/manager-orders/cap-status",
                         params={"employee_name": "TEST_Threshold_User"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        # accept 'max' or 'cap' field naming
        cap = data.get("max", data.get("cap"))
        assert cap == 15000.0, f"Expected 15000, got {data}"

    def test_cap_status_after_update(self):
        requests.put(f"{API}/admin/caisse-thresholds",
                     json={"manager_monthly_cap": 22000}, timeout=15)
        r = requests.get(f"{API}/manager-orders/cap-status",
                         params={"employee_name": "TEST_Threshold_User"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        cap = data.get("max", data.get("cap"))
        assert cap == 22000.0, f"Expected 22000, got {data}"
        # cleanup
        requests.delete(f"{API}/admin/caisse-thresholds", timeout=15)


# --- Section: Monsieur orders auto 50% discount ---

class TestMonsieurOrdersDiscount:
    def test_monsieur_order_applies_50pct_discount(self):
        requests.delete(f"{API}/admin/caisse-thresholds", timeout=15)
        payload = {
            "items": [{"name": "TEST_Item", "price": 5000, "quantity": 2}],
            "total": 10000,
            "created_by": "TEST_Admin",
            "notes": "test discount 50%",
        }
        r = requests.post(f"{API}/monsieur-orders", json=payload, timeout=20)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert body.get("success") is True, f"Response success flag false: {body}"
        data = body.get("order") or {}
        # Verify discount fields
        assert data.get("subtotal") == 10000, f"subtotal mismatch: {data}"
        assert data.get("discount_amount") == 5000, f"discount_amount mismatch: {data}"
        rate = data.get("discount_rate")
        assert rate in (0.5, 50, 50.0), f"discount_rate mismatch: {data}"
        assert data.get("total") == 5000, f"total mismatch: {data}"

        # cleanup created order if possible
        oid = data.get("id") or data.get("_id")
        if oid:
            try:
                requests.delete(f"{API}/monsieur-orders/{oid}", timeout=10)
            except Exception:
                pass


# --- Section: Manager orders cap enforcement w/ 50% discount ---

class TestManagerOrdersCapEnforcement:
    def _unique_name(self):
        import uuid
        return f"TEST_Mgr_{uuid.uuid4().hex[:8]}"

    def test_at_limit_accepted_and_over_limit_rejected(self):
        # default cap = 15000 after 50% discount -> subtotal 30000 ok, 30002 rejected
        requests.delete(f"{API}/admin/caisse-thresholds", timeout=15)
        name = self._unique_name()
        # accepted at exact limit
        payload_ok = {
            "employee_name": name,
            "employee_position": "Responsable Op. & Log",
            "items": [{"name": "TEST_X", "price": 30000, "quantity": 1}],
            "notes": "test at limit",
            "created_by": "TEST_Admin",
        }
        r_ok = requests.post(f"{API}/manager-orders", json=payload_ok, timeout=20)
        assert r_ok.status_code == 200, f"Expected 200 at limit, got {r_ok.status_code}: {r_ok.text}"
        body = r_ok.json()
        order = body.get("order") or {}
        assert order.get("subtotal") == 30000
        assert order.get("total") == 15000
        assert order.get("discount_rate") == 50

        # next request with another order would exceed cap. Use new user to avoid additivity.
        name2 = self._unique_name()
        payload_over = {
            "employee_name": name2,
            "employee_position": "Responsable Op. & Log",
            "items": [{"name": "TEST_X", "price": 30002, "quantity": 1}],
            "notes": "test over limit",
            "created_by": "TEST_Admin",
        }
        r_over = requests.post(f"{API}/manager-orders", json=payload_over, timeout=20)
        assert r_over.status_code == 400, f"Expected 400 over limit, got {r_over.status_code}: {r_over.text}"
        assert "Plafond" in r_over.text or "dépassé" in r_over.text


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
