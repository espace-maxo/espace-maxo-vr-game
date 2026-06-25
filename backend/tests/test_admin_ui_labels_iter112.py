"""Backend tests for /api/admin/ui-labels/{key} (iter 112).

Covers GET defaults, PUT custom, GET custom, DELETE reset, and 404 on unknown key.
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://caisse-mon-point.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
KEY = "caisse_product_add"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    yield s
    # Cleanup: reset to defaults
    try:
        s.delete(f"{API}/admin/ui-labels/{KEY}", timeout=10)
    except Exception:
        pass


class TestAdminUILabels:
    def test_get_defaults_when_no_custom(self, session):
        # Ensure clean state
        session.delete(f"{API}/admin/ui-labels/{KEY}", timeout=10)
        r = session.get(f"{API}/admin/ui-labels/{KEY}", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["key"] == KEY
        assert data["title_create"] == "Ajouter un produit"
        assert data["title_edit"] == "Modifier le produit"
        assert data["description"] == ""
        assert data["is_custom"] is False

    def test_put_custom_labels(self, session):
        payload = {
            "key": KEY,
            "title_create": "Test Article",
            "title_edit": "Editer Test",
            "description": "Renseignez les champs",
            "actor_name": "PytestAdmin",
        }
        r = session.put(f"{API}/admin/ui-labels/{KEY}", json=payload, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["title_create"] == "Test Article"
        assert data["title_edit"] == "Editer Test"
        assert data["description"] == "Renseignez les champs"
        assert data["is_custom"] is True

    def test_get_returns_custom_after_put(self, session):
        r = session.get(f"{API}/admin/ui-labels/{KEY}", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["title_create"] == "Test Article"
        assert data["title_edit"] == "Editer Test"
        assert data["description"] == "Renseignez les champs"
        assert data["is_custom"] is True

    def test_delete_resets_to_defaults(self, session):
        r = session.delete(f"{API}/admin/ui-labels/{KEY}", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["title_create"] == "Ajouter un produit"
        assert data["title_edit"] == "Modifier le produit"
        assert data["description"] == ""
        assert data["is_custom"] is False

        # Double-check via fresh GET
        r2 = session.get(f"{API}/admin/ui-labels/{KEY}", timeout=10)
        assert r2.status_code == 200
        assert r2.json()["is_custom"] is False

    def test_unknown_key_returns_404(self, session):
        r = session.get(f"{API}/admin/ui-labels/unknown_key", timeout=10)
        assert r.status_code == 404
        detail = r.json().get("detail", "")
        assert "Clé inconnue" in detail or "unknown" in detail.lower()

    def test_put_unknown_key_returns_404(self, session):
        r = session.put(
            f"{API}/admin/ui-labels/unknown_key",
            json={"key": "unknown_key", "title_create": "x"},
            timeout=10,
        )
        assert r.status_code == 404

    def test_partial_update_preserves_other_fields(self, session):
        # Set full custom
        session.put(
            f"{API}/admin/ui-labels/{KEY}",
            json={"key": KEY, "title_create": "A", "title_edit": "B", "description": "C"},
            timeout=10,
        )
        # Partial: only update description
        r = session.put(
            f"{API}/admin/ui-labels/{KEY}",
            json={"key": KEY, "description": "D"},
            timeout=10,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["title_create"] == "A"
        assert data["title_edit"] == "B"
        assert data["description"] == "D"
        # cleanup
        session.delete(f"{API}/admin/ui-labels/{KEY}", timeout=10)
