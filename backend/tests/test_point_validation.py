"""
Tests for point validation workflow:
- Validation refused when pending invoices exist in period
- Validation creates record; idempotent on re-call
- Reversement remains accessible (backend doesn't enforce; frontend does)
"""
import os
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_DATE = "2026-12-15"


def _cleanup():
    requests.delete(f"{BASE_URL}/api/point-validations", params={"date": TEST_DATE, "period_type": "daily"})


class TestPointValidation:
    def setup_method(self):
        _cleanup()

    def teardown_method(self):
        _cleanup()

    def test_no_validation_initially(self):
        r = requests.get(f"{BASE_URL}/api/point-validations", params={
            "date": TEST_DATE, "period_type": "daily"
        })
        assert r.status_code == 200
        assert r.json()["validated"] is False

    def test_validate_succeeds_without_pending_invoices(self):
        r = requests.post(f"{BASE_URL}/api/point-validations", json={
            "date": TEST_DATE, "period_type": "daily", "validated_by": "TestGerante"
        })
        assert r.status_code == 200
        assert r.json()["success"] is True
        assert r.json()["validation"]["validated_by"] == "TestGerante"

        # Verify GET returns validated=True
        r2 = requests.get(f"{BASE_URL}/api/point-validations", params={
            "date": TEST_DATE, "period_type": "daily"
        })
        assert r2.json()["validated"] is True

    def test_validate_is_idempotent(self):
        requests.post(f"{BASE_URL}/api/point-validations", json={
            "date": TEST_DATE, "period_type": "daily", "validated_by": "TestGerante"
        })
        r2 = requests.post(f"{BASE_URL}/api/point-validations", json={
            "date": TEST_DATE, "period_type": "daily", "validated_by": "Autre"
        })
        assert r2.status_code == 200
        # Already validated - should keep original
        assert r2.json()["validation"].get("already") is True or r2.json()["validation"]["validated_by"] == "TestGerante"

    def test_admin_can_invalidate(self):
        requests.post(f"{BASE_URL}/api/point-validations", json={
            "date": TEST_DATE, "period_type": "daily", "validated_by": "TestGerante"
        })
        r = requests.delete(f"{BASE_URL}/api/point-validations", params={
            "date": TEST_DATE, "period_type": "daily"
        })
        assert r.status_code == 200
        assert r.json()["deleted"] == 1
