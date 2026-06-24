"""Backend tests for soft-delete of admin site notifications (iter 109).

Covers:
  - POST /api/admin/site-notifications/delete hides item from GET list
  - POST /api/admin/site-notifications/restore makes it reappear
  - delete is idempotent (second call OK)
  - mark-read still works after delete/restore (regression)
"""
import os
import uuid
import time
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://caisse-mon-point.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def seed_booking(session):
    """Create a real booking via public endpoint so it shows up in /admin/site-notifications."""
    payload = {
        "customer_name": "TEST_NotifDelete_" + uuid.uuid4().hex[:6],
        "customer_phone": "+22997000000",
        "customer_email": "test_notifdelete@example.com",
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "time_slot": "18:00",
        "number_of_players": 2,
        "table_id": "TEST",
    }
    # Try a few likely endpoints
    candidates = [
        f"{API}/bookings",
        f"{API}/public/bookings",
        f"{API}/site/bookings",
    ]
    for url in candidates:
        try:
            r = session.post(url, json=payload, timeout=10)
            if r.status_code in (200, 201):
                data = r.json()
                bid = data.get("id") or data.get("booking_id") or (data.get("booking") or {}).get("id")
                if bid:
                    return {"id": bid, "type": "booking"}
        except Exception:
            continue
    # Fallback: pick any existing booking from the listing
    r = session.get(f"{API}/admin/site-notifications?since_hours=2160&limit_per_type=50")
    assert r.status_code == 200, r.text
    items = (r.json().get("by_type") or {}).get("bookings") or []
    if not items:
        pytest.skip("No booking seedable nor existing — cannot test delete flow")
    return {"id": items[0]["id"], "type": "booking"}


def _list_ids(session, item_type: str):
    r = session.get(f"{API}/admin/site-notifications?since_hours=2160&limit_per_type=50")
    assert r.status_code == 200, r.text
    key = {
        "booking": "bookings",
        "promo_order": "promo_orders",
        "delivery_order": "delivery_orders",
        "review": "reviews",
        "wallet": "wallets",
        "join": "joins",
    }[item_type]
    items = (r.json().get("by_type") or {}).get(key) or []
    return [it["id"] for it in items]


class TestSiteNotificationDelete:
    def test_list_endpoint_alive(self, session):
        r = session.get(f"{API}/admin/site-notifications?since_hours=168&limit_per_type=10")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "summary" in body and "items" in body and "by_type" in body

    def test_delete_hides_item(self, session, seed_booking):
        target_id = seed_booking["id"]
        target_type = seed_booking["type"]

        # Make sure restored at start
        session.post(f"{API}/admin/site-notifications/restore",
                     json={"type": target_type, "id": target_id, "actor_name": "pytest"})
        time.sleep(0.3)
        before_ids = _list_ids(session, target_type)
        assert target_id in before_ids, f"Seed booking {target_id} not visible in list (have {before_ids[:5]})"

        # DELETE
        r = session.post(f"{API}/admin/site-notifications/delete",
                         json={"type": target_type, "id": target_id, "actor_name": "pytest"})
        assert r.status_code == 200, r.text
        assert r.json().get("success") is True

        # Confirm hidden
        time.sleep(0.3)
        after_ids = _list_ids(session, target_type)
        assert target_id not in after_ids, "Notification still visible after delete"

    def test_delete_is_idempotent(self, session, seed_booking):
        target_id = seed_booking["id"]
        target_type = seed_booking["type"]
        # Second delete call must not crash and must return success
        r = session.post(f"{API}/admin/site-notifications/delete",
                         json={"type": target_type, "id": target_id, "actor_name": "pytest"})
        assert r.status_code == 200, r.text
        assert r.json().get("success") is True
        # Still hidden
        time.sleep(0.2)
        assert target_id not in _list_ids(session, target_type)

    def test_restore_makes_it_visible_again(self, session, seed_booking):
        target_id = seed_booking["id"]
        target_type = seed_booking["type"]
        r = session.post(f"{API}/admin/site-notifications/restore",
                         json={"type": target_type, "id": target_id, "actor_name": "pytest"})
        assert r.status_code == 200, r.text
        assert r.json().get("success") is True
        time.sleep(0.3)
        ids = _list_ids(session, target_type)
        assert target_id in ids, "Notification not restored"

    def test_mark_read_still_works_after_restore(self, session, seed_booking):
        target_id = seed_booking["id"]
        target_type = seed_booking["type"]
        r = session.post(f"{API}/admin/site-notifications/mark-read",
                         json={"type": target_type, "id": target_id, "actor_name": "pytest"})
        assert r.status_code == 200, r.text
        assert r.json().get("success") is True

    def test_delete_validates_payload(self, session):
        # Missing required fields should produce 422
        r = session.post(f"{API}/admin/site-notifications/delete", json={"type": "booking"})
        assert r.status_code in (400, 422)
