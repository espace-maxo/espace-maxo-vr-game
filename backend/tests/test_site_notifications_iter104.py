"""
Tests for iter104: Promo -25% banner + Site Notifications Aggregator (Admin).

Coverage:
  - GET  /api/admin/site-notifications  (summary/items/by_type structure)
  - POST /api/admin/site-notifications/mark-read
  - POST /api/admin/site-notifications/mark-all-read
  - Functional flow: create promo order -> appears in notifs unread -> mark-read ->
    becomes read, then cleanup test data.
"""
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL"):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

TEST_CUSTOMER_NAME = "Test Notif iter104"


@pytest.fixture(scope="module")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def mongo():
    # backend/.env may have different DB_NAME
    db_name = DB_NAME
    try:
        with open("/app/backend/.env") as f:
            for line in f:
                if line.startswith("DB_NAME"):
                    db_name = line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    client = MongoClient(MONGO_URL)
    return client[db_name]


@pytest.fixture(scope="module", autouse=True)
def cleanup(mongo):
    yield
    # teardown: remove TEST data
    try:
        ids = [
            d["id"]
            for d in mongo.promo_vacances_orders.find(
                {"customer_name": TEST_CUSTOMER_NAME}, {"id": 1}
            )
        ]
        if ids:
            mongo.admin_notif_reads.delete_many({"type": "promo_order", "id": {"$in": ids}})
        mongo.promo_vacances_orders.delete_many({"customer_name": TEST_CUSTOMER_NAME})
    except Exception as e:
        print(f"cleanup failed: {e}")


# ───────────────────────── GET aggregator ──────────────────────────
class TestSiteNotificationsList:
    def test_get_structure(self, http):
        r = http.get(f"{BASE_URL}/api/admin/site-notifications")
        assert r.status_code == 200, r.text
        data = r.json()
        # summary
        assert "summary" in data
        for k in ["bookings", "promo_orders", "reviews", "wallets", "joins"]:
            assert k in data["summary"], f"summary missing {k}"
            assert "total" in data["summary"][k]
            assert "unread" in data["summary"][k]
        assert "unread_total" in data["summary"]
        # items
        assert "items" in data and isinstance(data["items"], list)
        # by_type
        assert "by_type" in data
        for k in ["bookings", "promo_orders", "reviews", "wallets", "joins"]:
            assert k in data["by_type"]
            assert isinstance(data["by_type"][k], list)

    def test_no_mongo_objectid_leak(self, http):
        r = http.get(f"{BASE_URL}/api/admin/site-notifications")
        assert r.status_code == 200
        body = r.text
        assert "ObjectId" not in body
        for item in r.json().get("items", []):
            assert "_id" not in item


# ───────────────────────── Functional flow ─────────────────────────
class TestPromoNotificationFlow:
    created_id = None

    def test_create_promo_order_then_visible_as_unread(self, http, mongo):
        # 1. Create a promo order
        payload = {
            "pack_id": "pack_solo_fun",
            "customer_name": TEST_CUSTOMER_NAME,
            "customer_phone": "0197000000",
            "date": "2026-12-25",
            "time_slot": "18:00",
        }
        r = http.post(f"{BASE_URL}/api/promo-vacances/order", json=payload)
        assert r.status_code in (200, 201), f"create promo failed: {r.status_code} {r.text}"
        body = r.json()
        order_id = body.get("id") or body.get("order_id") or (body.get("order") or {}).get("id")
        if not order_id:
            # fetch directly from DB
            doc = mongo.promo_vacances_orders.find_one(
                {"customer_name": TEST_CUSTOMER_NAME}, sort=[("created_at", -1)]
            )
            assert doc, "promo order not found in DB"
            order_id = doc["id"]
        TestPromoNotificationFlow.created_id = order_id
        time.sleep(0.5)

        # 2. Fetch notifs and find our promo
        r2 = http.get(f"{BASE_URL}/api/admin/site-notifications")
        assert r2.status_code == 200
        promos = r2.json()["by_type"]["promo_orders"]
        ours = [p for p in promos if p.get("id") == order_id]
        assert ours, f"promo order {order_id} not in by_type.promo_orders"
        item = ours[0]
        assert item["type"] == "promo_order"
        assert item.get("read") is False, "freshly-created order should be unread"
        assert TEST_CUSTOMER_NAME in (item.get("title") or "")

    def test_mark_read(self, http):
        oid = TestPromoNotificationFlow.created_id
        assert oid
        r = http.post(
            f"{BASE_URL}/api/admin/site-notifications/mark-read",
            json={"type": "promo_order", "id": oid, "actor_name": "pytest"},
        )
        assert r.status_code == 200, r.text
        assert r.json().get("success") is True

        # verify read
        r2 = http.get(f"{BASE_URL}/api/admin/site-notifications")
        promos = r2.json()["by_type"]["promo_orders"]
        ours = [p for p in promos if p.get("id") == oid]
        assert ours and ours[0]["read"] is True

    def test_mark_read_idempotent(self, http):
        oid = TestPromoNotificationFlow.created_id
        r = http.post(
            f"{BASE_URL}/api/admin/site-notifications/mark-read",
            json={"type": "promo_order", "id": oid, "actor_name": "pytest"},
        )
        assert r.status_code == 200


# ───────────────────────── mark-all-read ───────────────────────────
class TestMarkAllRead:
    def test_create_second_order_and_mark_all(self, http, mongo):
        payload = {
            "pack_id": "pack_solo_fun",
            "customer_name": TEST_CUSTOMER_NAME,
            "customer_phone": "0197000001",
            "date": "2026-12-26",
            "time_slot": "19:00",
        }
        r = http.post(f"{BASE_URL}/api/promo-vacances/order", json=payload)
        assert r.status_code in (200, 201)
        time.sleep(0.3)

        # mark all
        r2 = http.post(
            f"{BASE_URL}/api/admin/site-notifications/mark-all-read",
            json={"actor_name": "pytest"},
        )
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body.get("success") is True
        assert isinstance(body.get("marked"), int)
        assert body["marked"] >= 1

        # verify nothing unread remains
        r3 = http.get(f"{BASE_URL}/api/admin/site-notifications")
        unread = r3.json()["summary"]["unread_total"]
        assert unread == 0, f"unread_total expected 0 after mark-all, got {unread}"
