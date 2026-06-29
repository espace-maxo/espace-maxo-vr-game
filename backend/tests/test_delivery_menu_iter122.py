"""
Tests pour le nouveau backend "Catalogue de menus de livraison" (iter122).

Endpoints testés :
  - GET    /api/delivery-menu                       (public, auto-seed)
  - GET    /api/admin/delivery-menu                 (admin, Bearer)
  - POST   /api/auth/admin-login                    (récupère le token Bearer)
  - POST   /api/admin/delivery-menu/items           (CREATE)
  - PATCH  /api/admin/delivery-menu/items/{id}      (UPDATE + clear_price)
  - DELETE /api/admin/delivery-menu/items/{id}      (DELETE)
  - POST   /api/delivery-orders                     (validation is_preorder/scheduled_at)
  - Perm   : sans Bearer -> 401, avec readonly -> 403
"""
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend/.env if env not exported
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except FileNotFoundError:
        pass

assert BASE_URL, "REACT_APP_BACKEND_URL must be defined"

ADMIN_PASSWORD = "Nikeland2026"
READONLY_PASSWORD = "MaxoConsult2026"  # admin_readonly per server.py


# ───────────────────────── Fixtures ─────────────────────────
@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/auth/admin-login", json={"password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "role" in data and "expires_at" in data
    assert data["role"] in ("admin_full", "admin")
    return data["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def readonly_token(api):
    r = api.post(f"{BASE_URL}/api/auth/admin-login", json={"password": READONLY_PASSWORD})
    if r.status_code != 200:
        pytest.skip("Readonly password not configured in this env")
    data = r.json()
    if data.get("role") != "admin_readonly":
        pytest.skip(f"Expected admin_readonly role, got {data.get('role')}")
    return data["token"]


# ───────────────────── 1) PUBLIC GET ─────────────────────
class TestPublicMenu:
    def test_get_public_menu_returns_categories_with_seed(self, api):
        r = api.get(f"{BASE_URL}/api/delivery-menu")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items_by_category" in body
        assert "total" in body
        grouped = body["items_by_category"]
        # 15 catégories attendues (au moins celles qui ont des items seedés)
        expected_cats = {
            "salades", "entrees", "volailles", "viandes", "poissons", "divers",
            "locaux", "sauces", "pates", "accompagnements", "burgers", "sandwichs",
            "pizzas", "desserts", "boissons",
        }
        present = set(grouped.keys())
        missing = expected_cats - present
        assert not missing, f"Catégories absentes: {missing}"
        # Total >= 92 (seed initial)
        assert body["total"] >= 92, f"Total items {body['total']} < 92"

    def test_locaux_items_have_null_price(self, api):
        r = api.get(f"{BASE_URL}/api/delivery-menu")
        assert r.status_code == 200
        locaux = r.json()["items_by_category"].get("locaux", [])
        assert len(locaux) >= 8, f"Expected >=8 locaux items, got {len(locaux)}"
        # Tous les items locaux seedés ont price=None
        seeded_locaux = [it for it in locaux if it.get("on_demand") is True]
        assert len(seeded_locaux) >= 8
        for it in seeded_locaux:
            assert it.get("price") is None, f"Local item with non-null price: {it}"
            assert it.get("on_demand") is True


# ───────────────────── 2) ADMIN AUTH ─────────────────────
class TestAdminAuth:
    def test_admin_login_success(self, api):
        r = api.post(f"{BASE_URL}/api/auth/admin-login", json={"password": ADMIN_PASSWORD})
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d["token"], str) and len(d["token"]) > 20
        assert d["role"] in ("admin_full", "admin")

    def test_admin_login_wrong_password(self, api):
        r = api.post(f"{BASE_URL}/api/auth/admin-login", json={"password": "wrong"})
        assert r.status_code == 401

    def test_get_admin_menu_without_auth(self, api):
        r = api.get(f"{BASE_URL}/api/admin/delivery-menu")
        assert r.status_code == 401

    def test_get_admin_menu_with_auth(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/admin/delivery-menu", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert "total" in d and "items_by_category" in d
        assert d["total"] >= 92


# ───────────────────── 3) CRUD ─────────────────────
class TestMenuCRUD:
    created_ids: list = []

    def test_create_item_invalid_category(self, api, admin_headers):
        r = api.post(
            f"{BASE_URL}/api/admin/delivery-menu/items",
            headers=admin_headers,
            json={"category_key": "bogus_cat", "name": "TEST_invalid"},
        )
        assert r.status_code == 400

    def test_create_item_negative_price(self, api, admin_headers):
        r = api.post(
            f"{BASE_URL}/api/admin/delivery-menu/items",
            headers=admin_headers,
            json={"category_key": "divers", "name": "TEST_neg", "price": -10},
        )
        assert r.status_code == 400

    def test_create_item_null_price_accepted(self, api, admin_headers):
        payload = {
            "category_key": "divers",
            "name": "TEST_item_devis",
            "price": None,
            "description": "Sur devis",
            "on_demand": True,
        }
        r = api.post(
            f"{BASE_URL}/api/admin/delivery-menu/items",
            headers=admin_headers,
            json=payload,
        )
        assert r.status_code == 200, r.text
        item = r.json()["item"]
        assert item["price"] is None
        assert item["category_key"] == "divers"
        assert item["name"] == "TEST_item_devis"
        assert "id" in item
        TestMenuCRUD.created_ids.append(item["id"])

        # Persistance : GET public doit l'inclure (active=True par défaut)
        r2 = api.get(f"{BASE_URL}/api/delivery-menu")
        divers = r2.json()["items_by_category"].get("divers", [])
        assert any(i["id"] == item["id"] for i in divers)

    def test_create_item_with_price(self, api, admin_headers):
        payload = {
            "category_key": "divers",
            "name": "TEST_item_price",
            "price": 3500,
            "popular": True,
        }
        r = api.post(
            f"{BASE_URL}/api/admin/delivery-menu/items",
            headers=admin_headers,
            json=payload,
        )
        assert r.status_code == 200
        item = r.json()["item"]
        assert item["price"] == 3500.0
        assert item["popular"] is True
        TestMenuCRUD.created_ids.append(item["id"])

    def test_update_item_fields(self, api, admin_headers):
        # On utilise le 2e item créé
        item_id = TestMenuCRUD.created_ids[-1]
        patch = {
            "name": "TEST_item_renamed",
            "price": 4200,
            "popular": False,
            "on_demand": True,
            "active": True,
        }
        r = api.patch(
            f"{BASE_URL}/api/admin/delivery-menu/items/{item_id}",
            headers=admin_headers,
            json=patch,
        )
        assert r.status_code == 200, r.text
        item = r.json()["item"]
        assert item["name"] == "TEST_item_renamed"
        assert item["price"] == 4200.0
        assert item["popular"] is False
        assert item["on_demand"] is True

    def test_update_item_clear_price(self, api, admin_headers):
        item_id = TestMenuCRUD.created_ids[-1]
        r = api.patch(
            f"{BASE_URL}/api/admin/delivery-menu/items/{item_id}",
            headers=admin_headers,
            json={"clear_price": True},
        )
        assert r.status_code == 200
        item = r.json()["item"]
        assert item["price"] is None, f"clear_price should set price=None, got {item['price']}"

    def test_update_negative_price_rejected(self, api, admin_headers):
        item_id = TestMenuCRUD.created_ids[-1]
        r = api.patch(
            f"{BASE_URL}/api/admin/delivery-menu/items/{item_id}",
            headers=admin_headers,
            json={"price": -50},
        )
        assert r.status_code == 400

    def test_update_unknown_item_404(self, api, admin_headers):
        r = api.patch(
            f"{BASE_URL}/api/admin/delivery-menu/items/non-existing-uuid",
            headers=admin_headers,
            json={"name": "X"},
        )
        assert r.status_code == 404

    def test_delete_items_and_verify(self, api, admin_headers):
        for item_id in TestMenuCRUD.created_ids:
            r = api.delete(
                f"{BASE_URL}/api/admin/delivery-menu/items/{item_id}",
                headers=admin_headers,
            )
            assert r.status_code == 200, f"DELETE {item_id}: {r.text}"
            assert r.json()["deleted_id"] == item_id
            # Re-DELETE -> 404
            r2 = api.delete(
                f"{BASE_URL}/api/admin/delivery-menu/items/{item_id}",
                headers=admin_headers,
            )
            assert r2.status_code == 404
        TestMenuCRUD.created_ids.clear()


# ───────────────────── 4) PERMISSIONS ─────────────────────
class TestPermissions:
    def test_post_without_bearer_401(self, api):
        r = api.post(
            f"{BASE_URL}/api/admin/delivery-menu/items",
            json={"category_key": "divers", "name": "TEST_x"},
        )
        assert r.status_code == 401

    def test_patch_without_bearer_401(self, api):
        r = api.patch(
            f"{BASE_URL}/api/admin/delivery-menu/items/whatever",
            json={"name": "X"},
        )
        assert r.status_code == 401

    def test_delete_without_bearer_401(self, api):
        r = api.delete(f"{BASE_URL}/api/admin/delivery-menu/items/whatever")
        assert r.status_code == 401

    def test_readonly_cannot_create(self, api, readonly_token):
        h = {"Authorization": f"Bearer {readonly_token}", "Content-Type": "application/json"}
        r = api.post(
            f"{BASE_URL}/api/admin/delivery-menu/items",
            headers=h,
            json={"category_key": "divers", "name": "TEST_ro"},
        )
        assert r.status_code == 403
        assert "lecture seule" in r.text.lower() or "read" in r.text.lower()

    def test_readonly_cannot_patch(self, api, readonly_token):
        h = {"Authorization": f"Bearer {readonly_token}", "Content-Type": "application/json"}
        r = api.patch(
            f"{BASE_URL}/api/admin/delivery-menu/items/any",
            headers=h,
            json={"name": "X"},
        )
        assert r.status_code == 403

    def test_readonly_cannot_delete(self, api, readonly_token):
        h = {"Authorization": f"Bearer {readonly_token}"}
        r = api.delete(
            f"{BASE_URL}/api/admin/delivery-menu/items/any",
            headers=h,
        )
        assert r.status_code == 403


# ───────────────────── 5) DELIVERY ORDERS / PREORDER LOCAUX ─────────────────────
def _build_order(items=None, is_preorder=False, scheduled_at=None, order_mode="delivery"):
    items = items or [{"name": "TEST_local", "price": 0, "quantity": 1}]
    return {
        "customer_name": "TEST_Client",
        "customer_phone": "0140000000",
        "delivery_address": "TEST address",
        "delivery_zone": "cotonou",
        "items": items,
        "subtotal": 0.0,
        "delivery_fee": 1000,
        "total": 1000.0,
        "order_mode": order_mode,
        "is_preorder": is_preorder,
        "scheduled_at": scheduled_at,
    }


class TestPreorderValidation:
    def test_preorder_missing_scheduled_at(self, api):
        body = _build_order(is_preorder=True, scheduled_at=None)
        r = api.post(f"{BASE_URL}/api/delivery-orders", json=body)
        assert r.status_code == 400
        msg = r.json().get("detail", "")
        assert "locaux" in msg.lower() or "date" in msg.lower()

    def test_preorder_less_than_24h_rejected(self, api):
        # 12 heures à l'avance
        sched = (datetime.now(timezone.utc) + timedelta(hours=12)).isoformat()
        body = _build_order(is_preorder=True, scheduled_at=sched)
        r = api.post(f"{BASE_URL}/api/delivery-orders", json=body)
        assert r.status_code == 400
        assert "24" in r.text or "avance" in r.text.lower()

    def test_preorder_valid_24h_plus_accepted(self, api):
        # J+1 +1h pour marge
        sched = (datetime.now(timezone.utc) + timedelta(hours=25)).isoformat()
        body = _build_order(is_preorder=True, scheduled_at=sched)
        r = api.post(f"{BASE_URL}/api/delivery-orders", json=body)
        # accept 200 ou 201
        assert r.status_code in (200, 201), f"Expected success, got {r.status_code}: {r.text}"
        d = r.json()
        # Doit retourner l'order ou similar
        assert d, "Empty response"

    def test_non_preorder_order_succeeds_without_scheduled_at(self, api):
        body = _build_order(is_preorder=False, scheduled_at=None, order_mode="delivery")
        r = api.post(f"{BASE_URL}/api/delivery-orders", json=body)
        assert r.status_code in (200, 201), f"Non-preorder should succeed: {r.text}"
