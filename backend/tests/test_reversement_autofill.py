"""
Tests for reversement auto-fill from validated sales.
"""
import os
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestReversementAutoFill:
    def test_endpoint_returns_4_categories(self):
        r = requests.get(f"{BASE_URL}/api/reversements/auto-fill", params={
            "date": "2026-05-21", "period_type": "daily"
        })
        assert r.status_code == 200
        data = r.json()
        assert "categories" in data
        cats = data["categories"]
        for c in ("bar", "menu_combos", "jeux", "locations"):
            assert c in cats
            for k in ("cash", "mobile", "cheque", "wallet", "total"):
                assert k in cats[c]

    def test_autofill_with_existing_data(self):
        # Period that has known validated invoices
        r = requests.get(f"{BASE_URL}/api/reversements/auto-fill", params={
            "date": "2026-04-27", "end_date": "2026-05-03", "period_type": "weekly"
        })
        assert r.status_code == 200
        data = r.json()
        # menu_combos should have some non-zero values based on existing test data
        # (from earlier seeding); we just verify the structure & sum coherence
        for cat in data["categories"].values():
            total = cat["cash"] + cat["mobile"] + cat["cheque"] + cat["wallet"]
            assert abs(total - cat["total"]) < 1, f"Sum mismatch: {cat}"

    def test_payment_method_normalization(self):
        # endpoint should work even if no validated invoices
        r = requests.get(f"{BASE_URL}/api/reversements/auto-fill", params={
            "date": "2030-01-01", "period_type": "daily"
        })
        assert r.status_code == 200
        # All should be zero
        for cat in r.json()["categories"].values():
            assert cat["total"] == 0

    def test_location_department_routed_to_locations_category(self):
        """REGRESSION : les factures avec totals_by_department.location doivent
        alimenter la catégorie 'locations' (pas être perdues)."""
        # Use a date with known location invoice (#EM-20260520-0005 location=25000)
        r = requests.get(f"{BASE_URL}/api/reversements/auto-fill", params={
            "date": "2026-05-20", "period_type": "daily"
        })
        d = r.json()
        # Au moins la catégorie locations ne doit pas être 0 si tbd.location > 0
        # (la facture 0005 a 25000 en location, payée par carte → cheque bucket)
        assert d["categories"]["locations"]["total"] > 0, \
            f"Location must be ventilated, got {d['categories']['locations']}"

    def test_card_payment_routed_to_cheque(self):
        """REGRESSION : pm='card' (carte bancaire) doit aller dans le bucket cheque."""
        r = requests.get(f"{BASE_URL}/api/reversements/auto-fill", params={
            "date": "2026-05-20", "period_type": "daily"
        })
        # The 25000 location invoice is paid by card → must be in cheque
        loc = r.json()["categories"]["locations"]
        assert loc["cheque"] > 0, f"Card payment must go to cheque, got {loc}"
        assert loc["cash"] == 0, f"Card must NOT go to cash, got {loc}"
