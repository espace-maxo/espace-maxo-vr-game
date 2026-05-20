"""
Tests pour le workflow Day Closure + Server Points.
"""
import os
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


def _cleanup(date):
    # Clean closures
    requests.post(f"{BASE_URL}/api/day-closures/{date}/reopen", json={"reopened_by": "Test", "reason": "cleanup"})
    # Clean server points
    r = requests.get(f"{BASE_URL}/api/server-points/status", params={"date": date})
    for s in r.json().get("servers", []):
        # We don't have the point id directly from status, but we can find via internal list
        pass


class TestDayClosureFlow:
    DATE = "2026-08-22"

    def setup_method(self):
        # Reopen if closed
        requests.post(f"{BASE_URL}/api/day-closures/{self.DATE}/reopen",
                      json={"reopened_by": "Test", "reason": "cleanup"})

    def test_status_endpoint(self):
        r = requests.get(f"{BASE_URL}/api/server-points/status", params={"date": self.DATE})
        assert r.status_code == 200
        d = r.json()
        assert "servers" in d
        assert "validated_count" in d
        assert "total_servers" in d
        assert "all_validated" in d

    def test_day_closure_default_open(self):
        r = requests.get(f"{BASE_URL}/api/day-closures/{self.DATE}")
        assert r.status_code == 200
        assert r.json()["status"] == "open"

    def test_close_blocked_when_servers_missing(self):
        r = requests.post(f"{BASE_URL}/api/day-closures/{self.DATE}/close",
                          json={"closed_by": "TestGerante"})
        # if there are active servers and none validated -> 400
        status = requests.get(f"{BASE_URL}/api/server-points/status", params={"date": self.DATE}).json()
        if status["total_servers"] > 0 and status["validated_count"] < status["total_servers"]:
            assert r.status_code == 400
            assert "Impossible de fermer" in r.json()["detail"]
        else:
            # No servers => allowed
            assert r.status_code == 200

    def test_force_close_admin(self):
        r = requests.post(f"{BASE_URL}/api/day-closures/{self.DATE}/close",
                          json={"closed_by": "Admin", "force": True})
        assert r.status_code == 200
        assert r.json()["closure"]["status"] == "closed"

        # Verify
        r2 = requests.get(f"{BASE_URL}/api/day-closures/{self.DATE}")
        assert r2.json()["status"] == "closed"

        # Reopen
        r3 = requests.post(f"{BASE_URL}/api/day-closures/{self.DATE}/reopen",
                           json={"reopened_by": "Admin", "reason": "test"})
        assert r3.status_code == 200
        r4 = requests.get(f"{BASE_URL}/api/day-closures/{self.DATE}")
        assert r4.json()["status"] == "open"

    def test_force_close_idempotent(self):
        requests.post(f"{BASE_URL}/api/day-closures/{self.DATE}/close",
                      json={"closed_by": "Admin", "force": True})
        r2 = requests.post(f"{BASE_URL}/api/day-closures/{self.DATE}/close",
                           json={"closed_by": "Other", "force": True})
        assert r2.status_code == 200
        assert r2.json().get("already_closed") is True
        # Cleanup
        requests.post(f"{BASE_URL}/api/day-closures/{self.DATE}/reopen",
                      json={"reopened_by": "Admin", "reason": "cleanup"})

    def test_status_only_includes_servers_with_orders(self):
        """Vérifie que seuls les serveurs qui ont effectivement pris des commandes
        ce jour-là apparaissent dans la liste (pas tous les serveurs actifs)."""
        # Date dans le futur lointain, aucun invoice -> aucun serveur
        r = requests.get(f"{BASE_URL}/api/server-points/status", params={"date": "2099-12-31"})
        assert r.status_code == 200
        d = r.json()
        assert d["total_servers"] == 0
        # all_validated doit être True quand personne n'a pris de commande (rien à bloquer)
        assert d["all_validated"] is True

    def test_close_allowed_when_no_servers_took_orders(self):
        """Si personne n'a pris de commande sur la date, la fermeture est autorisée."""
        future_date = "2099-12-31"
        # Cleanup d'abord
        requests.post(f"{BASE_URL}/api/day-closures/{future_date}/reopen",
                      json={"reopened_by": "Test", "reason": "cleanup"})
        r = requests.post(f"{BASE_URL}/api/day-closures/{future_date}/close",
                          json={"closed_by": "TestGerante"})
        assert r.status_code == 200, r.text
        # Cleanup
        requests.post(f"{BASE_URL}/api/day-closures/{future_date}/reopen",
                      json={"reopened_by": "Test", "reason": "cleanup"})
