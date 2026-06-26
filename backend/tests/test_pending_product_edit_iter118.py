"""
Iter 118 — Édition admin des produits Caisse en attente d'approbation.

Backend coverage:
- POST /api/caisse/products (non-admin) → status="pending"
- GET /api/caisse/products/pending → contains the new product
- PUT /api/caisse/products/{id} → updates name/price/unit/category/department
  WITHOUT touching status (product remains pending)
- POST /api/caisse/products/{id}/approve → status becomes "approved"
- Cleanup: tagged products created with TEST_iter118 are deleted at teardown.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
TAG = "TEST_iter118"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    yield s
    # Cleanup: remove any TEST_iter118 leftover (both pending and approved)
    try:
        r = s.get(f"{API}/caisse/products", params={"include_pending": "true"}, timeout=10)
        if r.status_code == 200:
            for p in (r.json().get("products") or []):
                if TAG in (p.get("name") or ""):
                    pid = p.get("id")
                    if pid:
                        s.delete(f"{API}/caisse/products/{pid}", timeout=10)
    except Exception:
        pass


def _create_pending(session, name_suffix="jus orange p"):
    payload = {
        "name": f"{TAG} {name_suffix}",
        "price": 1500,
        "department": "bar",
        "category": "Boissons",
        "unit": "unité",
    }
    # query params used to indicate non-admin author (so server marks pending)
    r = session.post(
        f"{API}/caisse/products",
        params={"modified_by": "Mères AHOUANDJINOU", "modified_by_role": "manager"},
        json=payload,
        timeout=30,
    )
    assert r.status_code == 200, f"Create failed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("success") is True
    assert data.get("pending") is True, "Non-admin creation should yield pending=True"
    product = data.get("product") or {}
    assert product.get("id"), "Created product must have id"
    assert product.get("status") == "pending"
    return product


class TestPendingProductEdit:
    """Iter 118 — Admin can edit pending products before approval."""

    def test_create_pending_appears_in_pending_list(self, session):
        prod = _create_pending(session)
        pid = prod["id"]

        # GET /pending must include this product
        r = session.get(f"{API}/caisse/products/pending", timeout=10)
        assert r.status_code == 200
        items = r.json().get("products") or []
        found = next((p for p in items if p.get("id") == pid), None)
        assert found is not None, f"New pending product {pid} not in /pending list"
        assert found.get("status") == "pending"
        assert found.get("name") == prod["name"]
        assert found.get("price") == 1500

    def test_put_updates_fields_without_changing_status(self, session):
        prod = _create_pending(session, "jus orange p edit")
        pid = prod["id"]

        new_name = f"{TAG} jus d'orange pressé"
        update_payload = {
            "name": new_name,
            "price": 1800,
            "unit": "verre",
            "category": "Jus frais",
            "department": "bar",
        }
        r = session.put(f"{API}/caisse/products/{pid}", json=update_payload, timeout=10)
        assert r.status_code == 200, f"PUT failed: {r.status_code} {r.text}"
        assert r.json().get("success") is True

        # GET pending again — must still contain the product, with new data + status="pending"
        r2 = session.get(f"{API}/caisse/products/pending", timeout=10)
        assert r2.status_code == 200
        items = r2.json().get("products") or []
        found = next((p for p in items if p.get("id") == pid), None)
        assert found is not None, "PUT must NOT remove product from pending list"
        assert found.get("status") == "pending", \
            f"PUT should NOT change status. Got status={found.get('status')}"
        assert found.get("name") == new_name
        assert found.get("price") == 1800
        assert found.get("unit") == "verre"
        assert found.get("category") == "Jus frais"
        assert found.get("department") == "bar"

    def test_approve_changes_status_and_removes_from_pending(self, session):
        prod = _create_pending(session, "to approve")
        pid = prod["id"]

        # Approve
        r = session.post(
            f"{API}/caisse/products/{pid}/approve",
            json={"actor_name": "Admin"},
            timeout=10,
        )
        assert r.status_code == 200, f"approve failed: {r.status_code} {r.text}"
        assert r.json().get("success") is True

        # GET /pending — must NOT contain the product anymore
        r2 = session.get(f"{API}/caisse/products/pending", timeout=10)
        assert r2.status_code == 200
        items = r2.json().get("products") or []
        assert all(p.get("id") != pid for p in items), \
            "Approved product must disappear from pending list"

        # Verify product is now approved (visible in default /caisse/products)
        r3 = session.get(f"{API}/caisse/products", timeout=10)
        assert r3.status_code == 200
        approved_items = r3.json().get("products") or []
        found = next((p for p in approved_items if p.get("id") == pid), None)
        assert found is not None, "Approved product must be visible in default catalog"
        assert found.get("status") == "approved"

    def test_put_then_approve_chain(self, session):
        """Full workflow: edit (PUT) then approve in sequence (mirrors 'Enregistrer et approuver')."""
        prod = _create_pending(session, "chain edit approve")
        pid = prod["id"]

        # Step 1: PUT
        edit_payload = {
            "name": f"{TAG} chain edited",
            "price": 2500,
            "unit": "kg",
            "category": "Plats",
            "department": "cuisine",
        }
        r1 = session.put(f"{API}/caisse/products/{pid}", json=edit_payload, timeout=10)
        assert r1.status_code == 200

        # Step 2: Approve
        r2 = session.post(
            f"{API}/caisse/products/{pid}/approve",
            json={"actor_name": "Admin"},
            timeout=10,
        )
        assert r2.status_code == 200

        # Verify approved + has edited fields
        r3 = session.get(f"{API}/caisse/products", timeout=10)
        items = r3.json().get("products") or []
        found = next((p for p in items if p.get("id") == pid), None)
        assert found is not None
        assert found.get("status") == "approved"
        assert found.get("name") == edit_payload["name"]
        assert found.get("price") == 2500
        assert found.get("unit") == "kg"
