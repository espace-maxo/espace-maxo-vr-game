"""
Test auto-création des 4 reversements daily lors de la fermeture de journée.
"""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"


class TestAutoCreateOnClosure:
    DATE = "2099-06-15"

    def _cleanup(self):
        # Delete any existing FPs for this date
        r = requests.get(f"{API}/financial-points", params={"date": self.DATE, "period_type": "daily"})
        if r.status_code == 200:
            for fp in r.json().get("financial_points", []):
                requests.delete(f"{API}/financial-points/{fp['id']}", params={"is_admin": "true"})
        # Reopen day if closed
        requests.post(f"{API}/day-closures/{self.DATE}/reopen",
                      json={"reopened_by": "Test", "reason": "cleanup"})

    def setup_method(self):
        self._cleanup()

    def teardown_method(self):
        self._cleanup()

    def test_auto_create_4_reversements(self):
        """À la fermeture, les 4 reversements daily sont créés automatiquement
        avec auto_fill_snapshot rempli."""
        # No invoices → all amounts will be 0, but the 4 FPs must still be created
        r = requests.post(f"{API}/day-closures/{self.DATE}/close", json={
            "closed_by": "Test Closer", "force": True,
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        # 4 reversements créés
        assert "auto_created_reversements" in data
        created = data["auto_created_reversements"]
        assert set(created) == {"bar", "menu_combos", "jeux", "locations"}

        # Vérifier que les 4 FP existent en DB
        r2 = requests.get(f"{API}/financial-points",
                          params={"date": self.DATE, "period_type": "daily"})
        fps = r2.json()["financial_points"]
        assert len(fps) == 4
        cats = {fp["category"] for fp in fps}
        assert cats == {"bar", "menu_combos", "jeux", "locations"}
        # auto_fill_snapshot doit être présent
        for fp in fps:
            assert fp.get("auto_fill_snapshot") is not None
            assert fp.get("auto_created_on_closure") is True
            assert fp.get("adjustments") == []

    def test_no_duplicate_on_second_closure(self):
        """Fermer 2 fois ne crée pas de doublons (idempotence)."""
        # First close
        r1 = requests.post(f"{API}/day-closures/{self.DATE}/close", json={
            "closed_by": "Test Closer", "force": True,
        })
        assert r1.status_code == 200
        # Re-open then close again
        requests.post(f"{API}/day-closures/{self.DATE}/reopen",
                      json={"reopened_by": "Test", "reason": "retest"})
        r2 = requests.post(f"{API}/day-closures/{self.DATE}/close", json={
            "closed_by": "Test Closer 2", "force": True,
        })
        # No new ones should be created (already exist)
        assert r2.status_code == 200
        # FP count remains 4
        fps = requests.get(f"{API}/financial-points",
                           params={"date": self.DATE, "period_type": "daily"}).json()["financial_points"]
        assert len(fps) == 4
