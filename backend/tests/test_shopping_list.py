"""Tests pour le suivi des courses (shopping_list)."""
import os
import uuid

import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"


class TestShoppingList:

    def teardown_method(self):
        # Cleanup all test items
        r = requests.get(f"{API}/shopping-list", params={"limit": 500})
        for it in r.json().get("items", []):
            if (it.get("name") or "").startswith("PYTEST_"):
                requests.delete(f"{API}/shopping-list/{it['id']}")

    def test_create_list_filter(self):
        # Create restaurant item
        n = f"PYTEST_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/shopping-list", json={
            "name": n, "quantity": 3, "estimated_unit_price": 500,
            "scope": "restaurant", "created_by": "Test",
        })
        assert r.status_code == 200
        item_id = r.json()["item"]["id"]
        # Filter by scope
        r2 = requests.get(f"{API}/shopping-list", params={"scope": "restaurant"})
        assert any(it["id"] == item_id for it in r2.json()["items"])
        # Stats
        stats = r2.json()["stats"]
        assert stats["pending"] >= 1
        # Cleanup handled by teardown via name prefix

    def test_mark_done_and_undo(self):
        n = f"PYTEST_DONE_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/shopping-list", json={
            "name": n, "quantity": 2, "estimated_unit_price": 1000,
            "scope": "restaurant",
        })
        item_id = r.json()["item"]["id"]
        # Mark done
        r2 = requests.post(f"{API}/shopping-list/{item_id}/done", json={
            "done_by": "Gerante",
            "real_unit_price": 1100,
            "real_supplier": "Dantokpa",
        })
        assert r2.status_code == 200
        item = r2.json()["item"]
        assert item["status"] == "done"
        assert item["done_by"] == "Gerante"
        assert item["real_unit_price"] == 1100
        assert item["real_total"] == 2200
        # Undo
        r3 = requests.post(f"{API}/shopping-list/{item_id}/undo")
        assert r3.status_code == 200
        assert r3.json()["item"]["status"] == "pending"
        assert r3.json()["item"]["done_by"] is None

    def test_scope_validation(self):
        n = f"PYTEST_X_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/shopping-list", json={
            "name": n, "quantity": 1, "scope": "invalid",
        })
        assert r.status_code == 400

    def test_from_reservation_idempotent(self):
        rid = f"pytest-res-{uuid.uuid4().hex[:8]}"
        items = [
            {"label": "PYTEST_RES_Eau", "quantity": 10, "unit_cost": 500},
            {"label": "PYTEST_RES_Glace", "quantity": 5, "unit_cost": 1500},
        ]
        r = requests.post(f"{API}/shopping-list/from-reservation", json={
            "reservation_id": rid,
            "reservation_label": "Test Réservation",
            "items": items,
            "created_by": "Test",
        })
        assert r.status_code == 200
        assert r.json()["inserted"] == 2
        # Re-call → must be idempotent (0 inserted)
        r2 = requests.post(f"{API}/shopping-list/from-reservation", json={
            "reservation_id": rid,
            "items": items,
        })
        assert r2.status_code == 200
        assert r2.json()["inserted"] == 0
        # Items present for that reservation
        r3 = requests.get(f"{API}/shopping-list", params={"reservation_id": rid})
        assert len(r3.json()["items"]) == 2
        # Cleanup
        for it in r3.json()["items"]:
            requests.delete(f"{API}/shopping-list/{it['id']}")

    def test_stats_by_scope(self):
        r = requests.get(f"{API}/shopping-list/stats/by-scope")
        assert r.status_code == 200
        body = r.json()
        assert "restaurant" in body
        assert "by_reservation" in body
        assert isinstance(body["by_reservation"], list)
