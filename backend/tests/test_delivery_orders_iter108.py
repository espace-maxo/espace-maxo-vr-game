"""
Iteration 108 - Tests pour:
1) POST /api/delivery-orders avec order_mode=pickup, discount_amount, promo_25_applied
2) GET /api/admin/delivery-orders → vérifier persistance des nouveaux champs
3) Aggregator /api/admin/site-notifications → clé delivery_orders avec total + unread
4) Cleanup des delivery_orders TEST_
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://caisse-mon-point.preview.emergentagent.com").rstrip("/")
ADMIN_PASSWORD = "Nikeland2026"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/admin-login", json={"password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data
    return data["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def created_pickup_order_id():
    """Crée une commande pickup avec promo et la retourne pour la suite des tests."""
    payload = {
        "customer_name": "Test PickupClient Iter108",
        "customer_phone": "97000108",
        "delivery_address": "Retrait sur place",
        "delivery_zone": "pickup",
        "order_mode": "pickup",
        "notes": "Test iter108 pickup",
        "items": [
            {"name": "Salade César", "price": 4000, "quantity": 1},
            {"name": "Pizza Maxo", "price": 5400, "quantity": 1},
            {"name": "Sauce Vassa", "price": 4900, "quantity": 1},
        ],
        "subtotal": 14300,
        "discount_amount": 2500,
        "promo_25_applied": True,
        "delivery_fee": 0,
        "total": 11800,
        "payment_status": "pending",
        "payment_transaction_id": None,
        "wallet_amount_used": 0,
    }
    r = requests.post(f"{BASE_URL}/api/delivery-orders", json=payload, timeout=20)
    assert r.status_code == 200, f"POST failed: {r.status_code} {r.text}"
    data = r.json()
    assert "id" in data
    return data["id"]


class TestDeliveryOrderPickupPersistence:
    def test_post_pickup_order_returns_id(self, created_pickup_order_id):
        assert created_pickup_order_id
        assert isinstance(created_pickup_order_id, str)
        assert len(created_pickup_order_id) > 10

    def test_get_admin_delivery_orders_persists_pickup_fields(self, admin_headers, created_pickup_order_id):
        r = requests.get(f"{BASE_URL}/api/admin/delivery-orders", headers=admin_headers, timeout=20)
        assert r.status_code == 200, f"GET failed: {r.status_code} {r.text}"
        data = r.json()
        assert "orders" in data
        order = next((o for o in data["orders"] if o.get("id") == created_pickup_order_id), None)
        assert order is not None, "Created pickup order not found in admin list"

        # Verify the NEW persisted fields (key focus of iter108)
        assert order.get("order_mode") == "pickup", f"order_mode mismatch: {order.get('order_mode')}"
        assert order.get("discount_amount") == 2500, f"discount_amount mismatch: {order.get('discount_amount')}"
        assert order.get("promo_25_applied") is True, f"promo_25_applied mismatch: {order.get('promo_25_applied')}"

        # Sanity checks on existing fields
        assert order.get("delivery_zone") == "pickup"
        assert order.get("delivery_fee") == 0
        assert order.get("total") == 11800
        assert order.get("subtotal") == 14300
        assert order.get("customer_name") == "Test PickupClient Iter108"


class TestDeliveryOrderDeliveryMode:
    """Non-régression: une commande mode delivery doit toujours fonctionner."""

    def test_post_delivery_mode_default(self, admin_headers):
        payload = {
            "customer_name": "Test DeliveryClient Iter108",
            "customer_phone": "97000208",
            "delivery_address": "Cotonou, Akpakpa",
            "delivery_zone": "cotonou",
            "order_mode": "delivery",
            "notes": "Test iter108 delivery",
            "items": [{"name": "Burger Maxo", "price": 3600, "quantity": 3}],
            "subtotal": 10800,
            "discount_amount": 2700,
            "promo_25_applied": True,
            "delivery_fee": 1000,
            "total": 9100,
            "payment_status": "paid",
            "payment_transaction_id": "TEST_TX_108",
            "wallet_amount_used": 0,
        }
        r = requests.post(f"{BASE_URL}/api/delivery-orders", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        oid = r.json().get("id")
        assert oid

        # Verify via GET
        g = requests.get(f"{BASE_URL}/api/admin/delivery-orders", headers=admin_headers, timeout=20)
        assert g.status_code == 200
        order = next((o for o in g.json()["orders"] if o.get("id") == oid), None)
        assert order is not None
        assert order.get("order_mode") == "delivery"
        assert order.get("delivery_fee") == 1000
        assert order.get("discount_amount") == 2700
        assert order.get("promo_25_applied") is True


class TestSiteNotificationsAggregator:
    def test_site_notifications_includes_delivery_orders(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/site-notifications", headers=admin_headers, timeout=20)
        assert r.status_code == 200, f"site-notifications failed: {r.status_code} {r.text}"
        data = r.json()
        # Structure expected: counts per type with delivery_orders present
        # Be permissive about exact shape, but key 'delivery_orders' must exist somewhere
        flat = data
        # Find a dict-of-dicts that contains delivery_orders
        found = False
        if isinstance(data, dict):
            if "delivery_orders" in data:
                node = data["delivery_orders"]
                assert isinstance(node, dict)
                assert "total" in node, f"missing total in delivery_orders: {node}"
                assert "unread" in node, f"missing unread in delivery_orders: {node}"
                found = True
            else:
                # look one level deeper
                for v in data.values():
                    if isinstance(v, dict) and "delivery_orders" in v:
                        node = v["delivery_orders"]
                        assert "total" in node and "unread" in node
                        found = True
                        break
        assert found, f"delivery_orders key not found in site-notifications response: {data}"


class TestCleanup:
    """Cleanup all TEST_ delivery orders created during the run."""

    def test_cleanup_test_delivery_orders(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/delivery-orders", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        orders = r.json().get("orders", [])
        to_delete = [o for o in orders if (o.get("customer_name") or "").startswith("Test ")]
        deleted = 0
        for o in to_delete:
            # Try DELETE endpoint
            d = requests.delete(
                f"{BASE_URL}/api/admin/delivery-orders/{o['id']}",
                headers=admin_headers,
                timeout=15,
            )
            if d.status_code in (200, 204, 404):
                deleted += 1
        print(f"Cleanup attempted: {len(to_delete)} orders, success-ish: {deleted}")
        # We don't fail if DELETE endpoint is absent — cleanup is best-effort
