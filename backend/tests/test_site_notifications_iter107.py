"""
iter107 — Test du nouveau type `delivery_orders` dans le site-notifications aggregator
+ collections corrigées (wallets / job_applications) + DeliveryOrder accepte `order_mode`.
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend .env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ────────── Aggregator base structure ──────────
def test_site_notifications_has_delivery_orders_in_summary(session):
    r = session.get(f"{API}/admin/site-notifications", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "summary" in data
    summary = data["summary"]
    # 6 types attendus
    expected = {"bookings", "promo_orders", "delivery_orders", "reviews", "wallets", "joins"}
    missing = expected - set(summary.keys())
    assert not missing, f"Missing keys in summary: {missing} — got {list(summary.keys())}"
    # by_type
    assert "by_type" in data
    for k in expected:
        assert k in data["by_type"], f"by_type missing key {k}"
        assert isinstance(data["by_type"][k], list)
    # Each summary entry should have total/unread
    for k in expected:
        assert "total" in summary[k] and "unread" in summary[k], f"{k} missing total/unread"


# ────────── E2E: créer un delivery_order, doit apparaître ──────────
def test_create_delivery_order_appears_in_notifications(session):
    payload = {
        "customer_name": "Test Livraison",
        "customer_phone": "0197000000",
        "items": [{"name": "Pizza", "price": 5000, "quantity": 2}],
        "subtotal": 10000,
        "total": 10000,
        "delivery_zone": "cotonou",
        "delivery_address": "Test Adresse iter107",
        "order_mode": "delivery",  # champ extra → doit être ignoré sans erreur
    }
    r = session.post(f"{API}/delivery-orders", json=payload, timeout=30)
    assert r.status_code == 200, f"POST /delivery-orders failed: {r.status_code} {r.text}"
    body = r.json()
    assert "id" in body and body["id"], f"missing id: {body}"
    created_id = body["id"]

    # poll up to 5s for notif to surface
    found = None
    for _ in range(5):
        rn = session.get(f"{API}/admin/site-notifications", timeout=30)
        assert rn.status_code == 200, rn.text
        data = rn.json()
        for it in data["by_type"]["delivery_orders"]:
            if it.get("id") == created_id:
                found = it
                break
        if found:
            break
        time.sleep(1)

    assert found is not None, f"created delivery_order {created_id} not found in by_type.delivery_orders"
    assert found["type"] == "delivery_order"
    assert found["title"] == "Test Livraison"
    assert found["amount"] == 10000

    # And summary.delivery_orders.total should be >= 1
    rn2 = session.get(f"{API}/admin/site-notifications", timeout=30)
    s = rn2.json()["summary"]
    assert s["delivery_orders"]["total"] >= 1


# ────────── Pickup mode : order_mode='pickup' + delivery_zone='pickup' ──────────
def test_create_delivery_order_pickup_mode(session):
    payload = {
        "customer_name": "Test Livraison Pickup",
        "customer_phone": "0197000001",
        "items": [{"name": "Burger", "price": 3000, "quantity": 1}],
        "subtotal": 3000,
        "total": 3000,
        "delivery_zone": "pickup",
        "delivery_address": "Retrait sur place",
        "delivery_fee": 0,
        "order_mode": "pickup",
    }
    r = session.post(f"{API}/delivery-orders", json=payload, timeout=30)
    assert r.status_code == 200, f"POST pickup failed: {r.status_code} {r.text}"


# ────────── mark-read flow on a delivery_order ──────────
def test_mark_read_delivery_order(session):
    # Get first delivery_order
    rn = session.get(f"{API}/admin/site-notifications", timeout=30)
    items = rn.json()["by_type"]["delivery_orders"]
    if not items:
        pytest.skip("no delivery_orders to mark-read")
    target = items[0]
    rm = session.post(
        f"{API}/admin/site-notifications/mark-read",
        json={"type": "delivery_order", "id": target["id"], "actor_name": "Tester"},
        timeout=30,
    )
    assert rm.status_code == 200, rm.text
    assert rm.json().get("success") is True
