"""
Test garde-fou réconciliation billettage à la validation Admin.
- Bloque si écart sans motif
- Autorise si motif fourni (≥3 caractères)
- Stocke le motif dans adjustments avec type=billettage_gap
"""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"


class TestReconciliationGate:
    DATE = "2099-07-10"

    def _cleanup(self):
        # Delete any existing FPs
        r = requests.get(f"{API}/financial-points", params={"date": self.DATE, "period_type": "daily"})
        if r.status_code == 200:
            for fp in r.json().get("financial_points", []):
                requests.delete(f"{API}/financial-points/{fp['id']}", params={"is_admin": "true"})
        # Clear billettage by upserting empty
        requests.post(f"{API}/billettage", json={"date": self.DATE, "denominations": {}, "actor_name": "cleanup"})

    def setup_method(self):
        self._cleanup()

    def teardown_method(self):
        self._cleanup()

    def _create_signed_fp(self, category, cash):
        fp = requests.post(f"{API}/financial-points", json={
            "date": self.DATE, "period_type": "daily", "category": category,
            "cash_amount": cash, "created_by": "Tester",
        })
        fp_id = fp.json()["financial_point"]["id"]
        # Sign it
        requests.post(f"{API}/financial-points/{fp_id}/sign", json={"signer_name": "Gerante"})
        return fp_id

    def test_block_when_billettage_missing(self):
        """Si cash attendu > 0 et billettage à 0 / inexistant → 400 (Écart)."""
        fp_id = self._create_signed_fp("bar", 5000)
        r = requests.post(f"{API}/financial-points/{fp_id}/admin-validate", json={
            "admin_name": "Admin Test",
        })
        assert r.status_code == 400
        # Soit "Billettage manquant" (aucun doc) soit "Écart billettage" (doc à 0)
        detail = r.json()["detail"]
        assert "Billettage manquant" in detail or "Écart billettage" in detail

    def test_block_when_gap_without_reason(self):
        """Si écart > 0 et pas de motif → 400."""
        fp_id = self._create_signed_fp("bar", 10000)
        # Set billettage = 8000 (gap of -2000)
        requests.post(f"{API}/billettage", json={
            "date": self.DATE,
            "denominations": {"5000": 1, "2000": 1, "1000": 1},  # 8000
            "actor_name": "Cassiere",
        })
        r = requests.post(f"{API}/financial-points/{fp_id}/admin-validate", json={
            "admin_name": "Admin Test",
        })
        assert r.status_code == 400
        assert "Écart billettage" in r.json()["detail"] or "Ecart billettage" in r.json()["detail"]

    def test_allow_when_gap_with_reason(self):
        """Si écart > 0 ET motif fourni → 200 + entrée dans adjustments."""
        fp_id = self._create_signed_fp("bar", 10000)
        requests.post(f"{API}/billettage", json={
            "date": self.DATE,
            "denominations": {"5000": 1, "2000": 1, "1000": 1},  # 8000
            "actor_name": "Cassiere",
        })
        r = requests.post(f"{API}/financial-points/{fp_id}/admin-validate", json={
            "admin_name": "Admin Test",
            "gap_justification": "Billet 1000 manquant constate par Gerante - pourboire serveur Marc",
        })
        assert r.status_code == 200
        fp = r.json()["financial_point"]
        assert fp["admin_validated"] is True
        # Check adjustment recorded
        gap_adjs = [a for a in (fp.get("adjustments") or []) if a.get("type") == "billettage_gap"]
        assert len(gap_adjs) == 1
        assert "Billet 1000 manquant" in gap_adjs[0]["reason"]
        assert gap_adjs[0]["adjusted_by"] == "Admin Test"

    def test_allow_when_no_gap(self):
        """Si compté == attendu → validation directe sans motif."""
        fp_id = self._create_signed_fp("bar", 10000)
        requests.post(f"{API}/billettage", json={
            "date": self.DATE,
            "denominations": {"5000": 2},  # 10000
            "actor_name": "Cassiere",
        })
        r = requests.post(f"{API}/financial-points/{fp_id}/admin-validate", json={
            "admin_name": "Admin Test",
        })
        assert r.status_code == 200
        assert r.json()["financial_point"]["admin_validated"] is True

    def test_weekly_no_gate(self):
        """Les reversements weekly ne sont PAS contraints par le billettage daily."""
        # Create a weekly FP
        fp = requests.post(f"{API}/financial-points", json={
            "date": self.DATE, "end_date": "2099-07-16",
            "period_type": "weekly", "category": "bar",
            "cash_amount": 50000, "created_by": "Tester",
        })
        fp_id = fp.json()["financial_point"]["id"]
        requests.post(f"{API}/financial-points/{fp_id}/sign", json={"signer_name": "Gerante"})
        # No billettage, no daily FPs → should still validate
        r = requests.post(f"{API}/financial-points/{fp_id}/admin-validate", json={
            "admin_name": "Admin Test",
        })
        assert r.status_code == 200
        # cleanup
        requests.delete(f"{API}/financial-points/{fp_id}", params={"is_admin": "true"})
