"""
Tests for Cuisine Close-Day workflow (iter121).

Coverage:
  - GET /api/cuisine/orders (active / done filters)
  - POST /api/cuisine/close-day (success + empty → 400)
  - Orders are hidden from cuisinier but still visible to admin after close-day
  - GET /api/cuisine/day-closures (admin)
  - GET /api/cuisine/day-closures/{id} (admin, with orders)
  - DELETE /api/cuisine/day-closures/{id} (admin) + audit_logs entry
  - Permission: GET /api/cuisine/day-closures?actor_role=cuisinier → 403
"""
import os
import uuid
import requests
import pytest
from datetime import datetime, timezone
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://caisse-mon-point.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Direct Mongo for seeding caisse_tables (workflow requires real data with cuisine items)
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
_mongo = MongoClient(MONGO_URL)
_db = _mongo[DB_NAME]

TEST_TAG = "TEST_ITER121"


def _make_table(table_number: int, all_ready: bool = False, with_cuisine: bool = True):
    """Insert a caisse_tables doc with cuisine items for the day."""
    now_iso = datetime.now(timezone.utc).isoformat()
    items = []
    if with_cuisine:
        items.append({
            "id": str(uuid.uuid4()),
            "name": f"{TEST_TAG}_Poulet braisé",
            "quantity": 2,
            "price": 5000,
            "department": "Plats",
            "ready_at": now_iso if all_ready else None,
            "ready_by": "Chef" if all_ready else None,
        })
        items.append({
            "id": str(uuid.uuid4()),
            "name": f"{TEST_TAG}_Riz sauté",
            "quantity": 1,
            "price": 2500,
            "department": "Riz",
            "ready_at": now_iso if all_ready else None,
        })
    doc = {
        "id": str(uuid.uuid4()),
        "table_number": table_number,
        "server_name": f"{TEST_TAG}_Serveur",
        "client_name": f"{TEST_TAG}_Client",
        "items": items,
        "created_at": now_iso,
        "updated_at": now_iso,
        "all_ready_at": now_iso if all_ready else None,
    }
    _db.caisse_tables.insert_one(doc)
    return doc["id"]


@pytest.fixture(scope="module", autouse=True)
def cleanup_and_seed():
    """Cleanup any prior test data, seed fresh data; teardown removes everything."""
    # Pre-clean
    _db.caisse_tables.delete_many({"server_name": f"{TEST_TAG}_Serveur"})
    _db.cuisine_day_closures.delete_many({"closed_by": f"{TEST_TAG}_Chef"})
    _db.cuisine_events.delete_many({"actor_name": f"{TEST_TAG}_Chef"})
    _db.audit_logs.delete_many({"actor_name": f"{TEST_TAG}_Chef"})

    # Seed: 2 active tables (not all_ready) + 1 done table
    ids = {
        "active1": _make_table(901, all_ready=False),
        "active2": _make_table(902, all_ready=False),
        "done1": _make_table(903, all_ready=True),
    }
    yield ids

    # Teardown
    _db.caisse_tables.delete_many({"server_name": f"{TEST_TAG}_Serveur"})
    _db.cuisine_day_closures.delete_many({"closed_by": f"{TEST_TAG}_Chef"})
    _db.cuisine_events.delete_many({"actor_name": f"{TEST_TAG}_Chef"})
    _db.audit_logs.delete_many({"actor_name": f"{TEST_TAG}_Chef"})


# ─────────────── GET /api/cuisine/orders ───────────────

class TestCuisineOrdersListing:
    def test_active_orders_cuisinier(self):
        r = requests.get(f"{API}/cuisine/orders",
                         params={"actor_role": "cuisinier", "status_filter": "active"})
        assert r.status_code == 200, r.text
        data = r.json()
        # Should include our 2 active TEST tables
        servers = [o.get("server_name") for o in data["orders"]]
        active_test = [o for o in data["orders"] if o.get("server_name") == f"{TEST_TAG}_Serveur" and not o.get("all_ready")]
        assert len(active_test) >= 2, f"Expected ≥2 active TEST orders, got {len(active_test)} (servers={servers})"

    def test_done_orders_cuisinier(self):
        r = requests.get(f"{API}/cuisine/orders",
                         params={"actor_role": "cuisinier", "status_filter": "done"})
        assert r.status_code == 200, r.text
        data = r.json()
        done_test = [o for o in data["orders"] if o.get("server_name") == f"{TEST_TAG}_Serveur" and o.get("all_ready")]
        assert len(done_test) >= 1
        assert done_test[0].get("all_ready_at"), "done order must have all_ready_at"


# ─────────────── POST /api/cuisine/close-day ───────────────

class TestCloseDay:
    closure_id = None

    def test_close_day_success(self):
        r = requests.post(f"{API}/cuisine/close-day", json={
            "actor_role": "cuisinier",
            "actor_name": f"{TEST_TAG}_Chef",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("success") is True
        c = data["closure"]
        # Required fields
        for k in ("id", "date", "closed_at", "closed_by", "closed_by_role",
                  "total_orders", "total_items", "total_quantity", "total_revenue",
                  "top_items", "orders"):
            assert k in c, f"missing field {k}"
        assert c["closed_by"] == f"{TEST_TAG}_Chef"
        assert c["closed_by_role"] == "cuisinier"
        assert c["total_orders"] >= 3
        # We seeded 3 cuisine items × multiple tables; each table has 2 cuisine items
        assert c["total_items"] >= 6
        # Revenue: 2 tables active (2*5000 + 1*2500 = 12500 each) + 1 done = 3*12500 = 37500
        assert c["total_revenue"] >= 37500, f"revenue={c['total_revenue']}"
        assert isinstance(c["orders"], list) and len(c["orders"]) >= 3
        assert isinstance(c["top_items"], list)
        TestCloseDay.closure_id = c["id"]

    def test_close_day_empty_returns_400(self):
        # Second call now that everything is marked closed → no items left
        r = requests.post(f"{API}/cuisine/close-day", json={
            "actor_role": "cuisinier",
            "actor_name": f"{TEST_TAG}_Chef",
        })
        assert r.status_code == 400, r.text
        assert "aucun bon" in r.text.lower() or "no" in r.text.lower()

    def test_close_day_forbidden_for_other_roles(self):
        r = requests.post(f"{API}/cuisine/close-day", json={
            "actor_role": "server",
            "actor_name": "X",
        })
        assert r.status_code == 403


# ─────────────── After close-day: cuisinier vs admin views ───────────────

class TestPostClosureVisibility:
    def test_cuisinier_active_now_empty_for_test_tables(self):
        r = requests.get(f"{API}/cuisine/orders",
                         params={"actor_role": "cuisinier", "status_filter": "active"})
        assert r.status_code == 200, r.text
        leaking = [o for o in r.json()["orders"] if o.get("server_name") == f"{TEST_TAG}_Serveur"]
        assert leaking == [], f"Cuisinier should not see closed tables: {leaking}"

    def test_cuisinier_done_now_empty_for_test_tables(self):
        r = requests.get(f"{API}/cuisine/orders",
                         params={"actor_role": "cuisinier", "status_filter": "done"})
        assert r.status_code == 200, r.text
        leaking = [o for o in r.json()["orders"] if o.get("server_name") == f"{TEST_TAG}_Serveur"]
        assert leaking == []

    def test_admin_still_sees_all(self):
        # admin status_filter=all should still see them
        r = requests.get(f"{API}/cuisine/orders",
                         params={"actor_role": "admin", "status_filter": "all"})
        assert r.status_code == 200, r.text
        visible = [o for o in r.json()["orders"] if o.get("server_name") == f"{TEST_TAG}_Serveur"]
        assert len(visible) >= 3, f"Admin must still see closed tables, got {len(visible)}"


# ─────────────── Day-closures admin endpoints ───────────────

class TestDayClosuresAdmin:
    def test_list_day_closures_admin(self):
        r = requests.get(f"{API}/cuisine/day-closures", params={"actor_role": "admin"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "closures" in data and "total" in data
        ours = [c for c in data["closures"] if c.get("closed_by") == f"{TEST_TAG}_Chef"]
        assert len(ours) >= 1
        # orders detail should be excluded from list endpoint
        assert "orders" not in ours[0], "orders should be hidden in list view"
        # but summary fields present
        assert "total_orders" in ours[0]
        assert "total_revenue" in ours[0]

    def test_list_day_closures_with_date_filter(self):
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        r = requests.get(f"{API}/cuisine/day-closures",
                         params={"actor_role": "admin", "date_from": today, "date_to": today})
        assert r.status_code == 200, r.text
        ours = [c for c in r.json()["closures"] if c.get("closed_by") == f"{TEST_TAG}_Chef"]
        assert len(ours) >= 1

    def test_list_day_closures_forbidden_cuisinier(self):
        r = requests.get(f"{API}/cuisine/day-closures", params={"actor_role": "cuisinier"})
        assert r.status_code == 403

    def test_get_day_closure_detail(self):
        cid = TestCloseDay.closure_id
        assert cid, "closure id must be set by previous test"
        r = requests.get(f"{API}/cuisine/day-closures/{cid}", params={"actor_role": "admin"})
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["id"] == cid
        assert isinstance(doc.get("orders"), list)
        assert len(doc["orders"]) >= 3
        # Each order should have items
        for o in doc["orders"]:
            assert "items" in o
            assert "table_number" in o

    def test_get_day_closure_not_found(self):
        r = requests.get(f"{API}/cuisine/day-closures/does-not-exist-xyz",
                         params={"actor_role": "admin"})
        assert r.status_code == 404

    def test_get_day_closure_forbidden(self):
        cid = TestCloseDay.closure_id
        r = requests.get(f"{API}/cuisine/day-closures/{cid}", params={"actor_role": "cuisinier"})
        assert r.status_code == 403


# ─────────────── DELETE closure with audit ───────────────

class TestDeleteClosure:
    def test_delete_closure_admin_creates_audit(self):
        cid = TestCloseDay.closure_id
        assert cid
        # Count audit logs before
        before = _db.audit_logs.count_documents({
            "entity_type": "cuisine_day_closure",
            "entity_id": cid,
        })
        r = requests.delete(f"{API}/cuisine/day-closures/{cid}",
                            params={"actor_role": "admin", "actor_name": f"{TEST_TAG}_Chef"})
        assert r.status_code == 200, r.text
        assert r.json().get("success") is True

        # Verify deletion persisted
        verify = requests.get(f"{API}/cuisine/day-closures/{cid}", params={"actor_role": "admin"})
        assert verify.status_code == 404

        # Verify audit log created
        after = _db.audit_logs.count_documents({
            "entity_type": "cuisine_day_closure",
            "entity_id": cid,
        })
        assert after == before + 1, f"expected audit log to be inserted (before={before}, after={after})"

    def test_delete_closure_forbidden_cuisinier(self):
        # Recreate a closure quickly via direct insert for permission test
        cid = str(uuid.uuid4())
        _db.cuisine_day_closures.insert_one({
            "id": cid,
            "date": "2026-01-01",
            "closed_by": f"{TEST_TAG}_Chef",
            "closed_by_role": "cuisinier",
            "total_orders": 0, "total_items": 0, "total_quantity": 0, "total_revenue": 0,
            "top_items": [], "orders": [],
            "closed_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            r = requests.delete(f"{API}/cuisine/day-closures/{cid}",
                                params={"actor_role": "cuisinier", "actor_name": "X"})
            assert r.status_code == 403
        finally:
            _db.cuisine_day_closures.delete_one({"id": cid})
