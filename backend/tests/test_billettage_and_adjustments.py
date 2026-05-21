"""
Tests pour le billettage global + ajustements financial_points.
Style synchrone (requests), conforme aux autres tests du projet.
"""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"


class TestBillettage:
    DATE_EMPTY = "2099-01-01"
    DATE_UPSERT = "2099-01-02"
    DATE_RECON = "2099-01-03"

    def test_get_empty(self):
        r = requests.get(f"{API}/billettage/{self.DATE_EMPTY}")
        assert r.status_code == 200
        d = r.json()
        assert d["total"] == 0
        assert d["exists"] is False

    def test_upsert_and_recompute_total(self):
        payload = {
            "date": self.DATE_UPSERT,
            "denominations": {"10000": 2, "5000": 4, "1000": 5, "200": 10},
            "actor_name": "TestUser",
        }
        expected = 2 * 10000 + 4 * 5000 + 5 * 1000 + 10 * 200
        r = requests.post(f"{API}/billettage", json=payload)
        assert r.status_code == 200
        d = r.json()
        assert d["success"] is True
        assert d["billettage"]["total"] == expected
        assert d["billettage"]["created_by"] == "TestUser"

        # Update
        r2 = requests.post(f"{API}/billettage", json={
            "date": self.DATE_UPSERT, "denominations": {"10000": 1},
            "actor_name": "TestUser2",
        })
        assert r2.json()["billettage"]["total"] == 10000

    def test_reconciliation(self):
        # Set billettage = 25 000
        requests.post(f"{API}/billettage", json={
            "date": self.DATE_RECON,
            "denominations": {"10000": 2, "5000": 1},
            "actor_name": "TestRec",
        })
        # No FP yet -> expected=0
        r = requests.get(f"{API}/billettage/{self.DATE_RECON}/reconciliation")
        d = r.json()
        assert d["counted"] == 25000
        assert d["expected"] == 0

        # Add a FP daily/bar/cash=10000
        fp = requests.post(f"{API}/financial-points", json={
            "date": self.DATE_RECON, "period_type": "daily", "category": "bar",
            "cash_amount": 10000, "created_by": "Tester",
        })
        assert fp.status_code == 200
        fp_id = fp.json()["financial_point"]["id"]
        try:
            d2 = requests.get(f"{API}/billettage/{self.DATE_RECON}/reconciliation").json()
            assert d2["expected"] == 10000
            assert d2["difference"] == 15000
            assert "bar" in d2["by_category"]
        finally:
            requests.delete(f"{API}/financial-points/{fp_id}", params={"is_admin": "true"})


class TestAdjustments:
    DATE_REASON = "2099-01-04"
    DATE_HISTORY = "2099-01-05"
    DATE_PUT_ADJ = "2099-01-06"

    def test_requires_reason(self):
        fp = requests.post(f"{API}/financial-points", json={
            "date": self.DATE_REASON, "period_type": "daily", "category": "bar",
            "cash_amount": 10000, "created_by": "Tester",
        })
        fp_id = fp.json()["financial_point"]["id"]
        try:
            # No reason → 400
            r = requests.post(f"{API}/financial-points/{fp_id}/adjust", json={
                "field": "cash_amount", "new_value": 12000, "reason": "",
                "adjusted_by": "Test",
            })
            assert r.status_code == 400

            # Too short
            r2 = requests.post(f"{API}/financial-points/{fp_id}/adjust", json={
                "field": "cash_amount", "new_value": 12000, "reason": "ab",
                "adjusted_by": "Test",
            })
            assert r2.status_code == 400

            # Invalid field
            r3 = requests.post(f"{API}/financial-points/{fp_id}/adjust", json={
                "field": "invalid_field", "new_value": 12000,
                "reason": "valid reason here", "adjusted_by": "Test",
            })
            assert r3.status_code == 400
        finally:
            requests.delete(f"{API}/financial-points/{fp_id}", params={"is_admin": "true"})

    def test_records_history(self):
        fp = requests.post(f"{API}/financial-points", json={
            "date": self.DATE_HISTORY, "period_type": "daily", "category": "bar",
            "cash_amount": 10000, "mobile_amount": 5000, "created_by": "Tester",
        })
        fp_id = fp.json()["financial_point"]["id"]
        try:
            r = requests.post(f"{API}/financial-points/{fp_id}/adjust", json={
                "field": "cash_amount", "new_value": 12500,
                "reason": "Erreur saisie table 5", "adjusted_by": "Gerante",
            })
            assert r.status_code == 200
            fp_data = r.json()["financial_point"]
            assert fp_data["cash_amount"] == 12500
            assert fp_data["total_amount"] == 17500
            assert len(fp_data["adjustments"]) == 1
            adj = fp_data["adjustments"][0]
            assert adj["field"] == "cash_amount"
            assert adj["old_value"] == 10000
            assert adj["new_value"] == 12500
            assert adj["reason"] == "Erreur saisie table 5"
            assert adj["adjusted_by"] == "Gerante"

            # Second adjustment
            r2 = requests.post(f"{API}/financial-points/{fp_id}/adjust", json={
                "field": "mobile_amount", "new_value": 7000,
                "reason": "Momo recu apres comptage", "adjusted_by": "Gerante",
            })
            assert len(r2.json()["financial_point"]["adjustments"]) == 2
        finally:
            requests.delete(f"{API}/financial-points/{fp_id}", params={"is_admin": "true"})

    def test_put_with_adjustments_array(self):
        fp = requests.post(f"{API}/financial-points", json={
            "date": self.DATE_PUT_ADJ, "period_type": "daily", "category": "menu_combos",
            "cash_amount": 8000, "mobile_amount": 3000, "created_by": "Tester",
        })
        fp_id = fp.json()["financial_point"]["id"]
        try:
            r = requests.put(f"{API}/financial-points/{fp_id}", json={
                "cash_amount": 10000, "mobile_amount": 5000,
                "_adjustments": [
                    {"field": "cash_amount", "old_value": 8000, "new_value": 10000,
                     "reason": "Correction billettage", "adjusted_by": "Gerante"},
                    {"field": "mobile_amount", "old_value": 3000, "new_value": 5000,
                     "reason": "Momo manquant ajoute", "adjusted_by": "Gerante"},
                ],
            })
            assert r.status_code == 200
            d = r.json()["financial_point"]
            assert d["cash_amount"] == 10000
            assert d["mobile_amount"] == 5000
            assert len(d["adjustments"]) == 2
            assert d["adjustments"][0]["reason"] == "Correction billettage"
        finally:
            requests.delete(f"{API}/financial-points/{fp_id}", params={"is_admin": "true"})
