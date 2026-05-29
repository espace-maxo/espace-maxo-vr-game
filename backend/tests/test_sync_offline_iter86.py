"""
Test Suite for Sync/Offline Mode (Phase 1 & 2) - Iteration 86

Tests:
1. GET /api/sync/ping - returns {ok:true, server_time}
2. GET /api/sync/snapshot - returns products, clients, tables, users (sans pwd hash), quick_products, menu_items, games, day_opening, counts
3. POST /api/sync/queue/process - create_table action
4. POST /api/sync/queue/process - idempotency (duplicate detection)
5. POST /api/sync/queue/process - conflict: table already exists (Admin gagne)
6. POST /api/sync/queue/process - conflict: update_table on non-existent table
7. POST /api/sync/queue/process - delete_table on non-existent table (idempotent OK)
8. POST /api/sync/queue/process - create_invoice when day not open (conflict)
9. POST /api/sync/queue/process - unknown action type (error)
10. GET /api/sync/queue/status - returns recently processed actions
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSyncPing:
    """Test GET /api/sync/ping endpoint"""
    
    def test_ping_returns_ok_and_server_time(self):
        """GET /api/sync/ping retourne {ok:true, server_time}"""
        response = requests.get(f"{BASE_URL}/api/sync/ping", timeout=10)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "ok" in data, "Response should contain 'ok' field"
        assert data["ok"] is True, "ok should be True"
        assert "server_time" in data, "Response should contain 'server_time' field"
        
        # Verify server_time is a valid ISO format
        try:
            datetime.fromisoformat(data["server_time"].replace("Z", "+00:00"))
        except ValueError:
            pytest.fail(f"server_time is not valid ISO format: {data['server_time']}")
        
        print(f"PASS: /api/sync/ping returns ok=True, server_time={data['server_time']}")


class TestSyncSnapshot:
    """Test GET /api/sync/snapshot endpoint"""
    
    def test_snapshot_returns_all_required_fields(self):
        """GET /api/sync/snapshot retourne products, clients, tables, users, quick_products, menu_items, games, day_opening, counts"""
        response = requests.get(f"{BASE_URL}/api/sync/snapshot", timeout=30)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Check all required fields are present
        required_fields = [
            "snapshot_id", "server_time", "today",
            "products", "clients", "tables", "users",
            "quick_products", "menu_items", "games",
            "day_opening", "counts"
        ]
        
        for field in required_fields:
            assert field in data, f"Response should contain '{field}' field"
        
        # Verify counts structure
        assert "counts" in data
        counts = data["counts"]
        count_fields = ["products", "clients", "tables", "users", "quick_products", "menu_items", "games"]
        for field in count_fields:
            assert field in counts, f"counts should contain '{field}'"
            assert isinstance(counts[field], int), f"counts.{field} should be an integer"
        
        print(f"PASS: /api/sync/snapshot returns all required fields")
        print(f"  - products: {counts['products']}, clients: {counts['clients']}, tables: {counts['tables']}")
        print(f"  - users: {counts['users']}, quick_products: {counts['quick_products']}")
        print(f"  - menu_items: {counts['menu_items']}, games: {counts['games']}")
    
    def test_snapshot_users_no_password_hash(self):
        """GET /api/sync/snapshot - users should not contain password_hash (sensitive data)"""
        response = requests.get(f"{BASE_URL}/api/sync/snapshot", timeout=30)
        
        assert response.status_code == 200
        data = response.json()
        
        users = data.get("users", [])
        for user in users:
            # Should NOT have password_hash field
            assert "password_hash" not in user, f"User should not contain password_hash: {user.get('username')}"
            # Should have allowed fields
            allowed_fields = ["id", "username", "full_name", "role", "active", "pin_hash"]
            for key in user.keys():
                assert key in allowed_fields, f"Unexpected field '{key}' in user data"
        
        print(f"PASS: Users in snapshot do not contain password_hash (checked {len(users)} users)")


class TestSyncQueueProcess:
    """Test POST /api/sync/queue/process endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_server_id = f"test_server_{uuid.uuid4().hex[:8]}"
        self.test_table_number = 999  # Use high number to avoid conflicts
    
    def test_create_table_success(self):
        """POST /api/sync/queue/process avec 1 action create_table -> status='ok' avec data persistée"""
        client_id = str(uuid.uuid4())
        table_number = 998  # Use unique table number
        server_id = f"test_server_{uuid.uuid4().hex[:8]}"
        
        payload = {
            "actions": [{
                "client_id": client_id,
                "type": "create_table",
                "payload": {
                    "table_number": table_number,
                    "server_id": server_id,
                    "server_name": "Test Server",
                    "items": [],
                    "client_name": "Test Client"
                },
                "queued_at": datetime.now(timezone.utc).isoformat()
            }]
        }
        
        response = requests.post(f"{BASE_URL}/api/sync/queue/process", json=payload, timeout=15)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "results" in data, "Response should contain 'results'"
        assert len(data["results"]) == 1, "Should have 1 result"
        
        result = data["results"][0]
        assert result["client_id"] == client_id, "client_id should match"
        assert result["status"] == "ok", f"Expected status='ok', got '{result['status']}'"
        assert "data" in result, "Result should contain 'data'"
        
        # Verify offline markers
        table_data = result["data"]
        assert table_data.get("_offline_origin") is True, "Table should have _offline_origin=True"
        assert table_data.get("_offline_client_id") == client_id, "Table should have _offline_client_id"
        
        print(f"PASS: create_table action succeeded with status='ok'")
        print(f"  - Table created with _offline_origin=True, _offline_client_id={client_id}")
        
        # Cleanup: delete the test table
        if table_data.get("id"):
            requests.delete(f"{BASE_URL}/api/caisse/tables/{table_data['id']}", timeout=10)
    
    def test_create_table_duplicate_idempotency(self):
        """POST /api/sync/queue/process REJOUE la même action (même client_id) -> status='duplicate'"""
        client_id = str(uuid.uuid4())
        table_number = 997
        server_id = f"test_server_{uuid.uuid4().hex[:8]}"
        
        payload = {
            "actions": [{
                "client_id": client_id,
                "type": "create_table",
                "payload": {
                    "table_number": table_number,
                    "server_id": server_id,
                    "server_name": "Test Server",
                    "items": []
                },
                "queued_at": datetime.now(timezone.utc).isoformat()
            }]
        }
        
        # First request - should succeed
        response1 = requests.post(f"{BASE_URL}/api/sync/queue/process", json=payload, timeout=15)
        assert response1.status_code == 200
        result1 = response1.json()["results"][0]
        assert result1["status"] == "ok", f"First request should succeed, got {result1['status']}"
        
        table_id = result1["data"].get("id")
        
        # Second request with SAME client_id - should return 'duplicate'
        response2 = requests.post(f"{BASE_URL}/api/sync/queue/process", json=payload, timeout=15)
        assert response2.status_code == 200
        result2 = response2.json()["results"][0]
        assert result2["status"] == "duplicate", f"Expected status='duplicate', got '{result2['status']}'"
        assert result2["client_id"] == client_id
        
        print(f"PASS: Idempotency works - same client_id returns status='duplicate'")
        
        # Cleanup
        if table_id:
            requests.delete(f"{BASE_URL}/api/caisse/tables/{table_id}", timeout=10)
    
    def test_create_table_conflict_already_exists(self):
        """POST /api/sync/queue/process avec type=create_table mais server_id+table_number déjà existant -> status='conflict'"""
        table_number = 996
        server_id = f"test_server_{uuid.uuid4().hex[:8]}"
        
        # First create a table
        client_id_1 = str(uuid.uuid4())
        payload1 = {
            "actions": [{
                "client_id": client_id_1,
                "type": "create_table",
                "payload": {
                    "table_number": table_number,
                    "server_id": server_id,
                    "server_name": "Test Server",
                    "items": []
                },
                "queued_at": datetime.now(timezone.utc).isoformat()
            }]
        }
        
        response1 = requests.post(f"{BASE_URL}/api/sync/queue/process", json=payload1, timeout=15)
        assert response1.status_code == 200
        result1 = response1.json()["results"][0]
        assert result1["status"] == "ok"
        table_id = result1["data"].get("id")
        
        # Try to create another table with SAME server_id + table_number but DIFFERENT client_id
        client_id_2 = str(uuid.uuid4())
        payload2 = {
            "actions": [{
                "client_id": client_id_2,
                "type": "create_table",
                "payload": {
                    "table_number": table_number,
                    "server_id": server_id,
                    "server_name": "Test Server 2",
                    "items": []
                },
                "queued_at": datetime.now(timezone.utc).isoformat()
            }]
        }
        
        response2 = requests.post(f"{BASE_URL}/api/sync/queue/process", json=payload2, timeout=15)
        assert response2.status_code == 200
        result2 = response2.json()["results"][0]
        assert result2["status"] == "conflict", f"Expected status='conflict', got '{result2['status']}'"
        assert "reason" in result2, "Conflict should have a reason"
        
        print(f"PASS: Conflict detected when table with same server_id+table_number exists")
        print(f"  - Reason: {result2.get('reason')}")
        
        # Cleanup
        if table_id:
            requests.delete(f"{BASE_URL}/api/caisse/tables/{table_id}", timeout=10)
    
    def test_update_table_conflict_not_found(self):
        """POST /api/sync/queue/process avec type=update_table d'une table inexistante -> status='conflict'"""
        client_id = str(uuid.uuid4())
        non_existent_table_id = str(uuid.uuid4())
        
        payload = {
            "actions": [{
                "client_id": client_id,
                "type": "update_table",
                "payload": {
                    "id": non_existent_table_id,
                    "items": [{"name": "Test Item", "price": 1000, "quantity": 1}]
                },
                "queued_at": datetime.now(timezone.utc).isoformat()
            }]
        }
        
        response = requests.post(f"{BASE_URL}/api/sync/queue/process", json=payload, timeout=15)
        
        assert response.status_code == 200
        result = response.json()["results"][0]
        assert result["status"] == "conflict", f"Expected status='conflict', got '{result['status']}'"
        assert "reason" in result, "Conflict should have a reason"
        
        print(f"PASS: update_table on non-existent table returns status='conflict'")
        print(f"  - Reason: {result.get('reason')}")
    
    def test_delete_table_idempotent_not_found(self):
        """POST /api/sync/queue/process avec type=delete_table d'une table inexistante -> status='ok' (idempotent)"""
        client_id = str(uuid.uuid4())
        non_existent_table_id = str(uuid.uuid4())
        
        payload = {
            "actions": [{
                "client_id": client_id,
                "type": "delete_table",
                "payload": {
                    "id": non_existent_table_id
                },
                "queued_at": datetime.now(timezone.utc).isoformat()
            }]
        }
        
        response = requests.post(f"{BASE_URL}/api/sync/queue/process", json=payload, timeout=15)
        
        assert response.status_code == 200
        result = response.json()["results"][0]
        assert result["status"] == "ok", f"Expected status='ok' (idempotent), got '{result['status']}'"
        
        print(f"PASS: delete_table on non-existent table returns status='ok' (idempotent)")
    
    def test_create_invoice_conflict_day_not_open(self):
        """POST /api/sync/queue/process avec type=create_invoice MAIS journée non ouverte -> status='conflict'"""
        # First, ensure the day is NOT open by checking current status
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        # Check if day is open
        day_response = requests.get(f"{BASE_URL}/api/day-openings/{today}", timeout=10)
        day_data = day_response.json() if day_response.status_code == 200 else {}
        
        # If day is open, close it temporarily for this test (use mark-closed endpoint)
        was_open = day_data.get("status") == "open"
        if was_open:
            # Close the day using the correct endpoint
            requests.post(f"{BASE_URL}/api/day-openings/{today}/mark-closed", timeout=10)
        
        try:
            client_id = str(uuid.uuid4())
            payload = {
                "actions": [{
                    "client_id": client_id,
                    "type": "create_invoice",
                    "payload": {
                        "customer_name": "Test Customer",
                        "items": [{"name": "Test Item", "price": 1000, "quantity": 1}],
                        "subtotal": 1000,
                        "total": 1000,
                        "payment_method": "cash"
                    },
                    "queued_at": datetime.now(timezone.utc).isoformat()
                }]
            }
            
            response = requests.post(f"{BASE_URL}/api/sync/queue/process", json=payload, timeout=15)
            
            assert response.status_code == 200
            result = response.json()["results"][0]
            assert result["status"] == "conflict", f"Expected status='conflict', got '{result['status']}'"
            assert "reason" in result, "Conflict should have a reason"
            assert "journée" in result["reason"].lower() or "ouverte" in result["reason"].lower(), \
                f"Reason should mention day not open: {result['reason']}"
            
            print(f"PASS: create_invoice when day not open returns status='conflict'")
            print(f"  - Reason: {result.get('reason')}")
        
        finally:
            # Restore day status if it was open
            if was_open:
                open_payload = {
                    "opened_by": "PytestRunner",
                    "opened_by_role": "admin",
                    "initial_cash": 0,
                    "notes": "Auto-opened by pytest",
                    "force": True
                }
                requests.post(f"{BASE_URL}/api/day-openings/{today}/open", json=open_payload, timeout=10)
    
    def test_unknown_action_type_error(self):
        """POST /api/sync/queue/process avec type inconnu -> status='error' reason explicite"""
        client_id = str(uuid.uuid4())
        
        payload = {
            "actions": [{
                "client_id": client_id,
                "type": "unknown_action_type_xyz",
                "payload": {},
                "queued_at": datetime.now(timezone.utc).isoformat()
            }]
        }
        
        response = requests.post(f"{BASE_URL}/api/sync/queue/process", json=payload, timeout=15)
        
        assert response.status_code == 200
        result = response.json()["results"][0]
        assert result["status"] == "error", f"Expected status='error', got '{result['status']}'"
        assert "reason" in result, "Error should have a reason"
        assert "inconnu" in result["reason"].lower() or "unknown" in result["reason"].lower(), \
            f"Reason should mention unknown type: {result['reason']}"
        
        print(f"PASS: Unknown action type returns status='error' with explicit reason")
        print(f"  - Reason: {result.get('reason')}")


class TestSyncQueueStatus:
    """Test GET /api/sync/queue/status endpoint"""
    
    def test_queue_status_returns_processed_actions(self):
        """GET /api/sync/queue/status renvoie la liste des actions traitées récemment"""
        response = requests.get(f"{BASE_URL}/api/sync/queue/status", timeout=10)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "total" in data, "Response should contain 'total'"
        assert "items" in data, "Response should contain 'items'"
        assert isinstance(data["items"], list), "items should be a list"
        
        # If there are items, verify structure
        if len(data["items"]) > 0:
            item = data["items"][0]
            assert "client_id" in item, "Item should have client_id"
            assert "status" in item, "Item should have status"
            assert "processed_at" in item, "Item should have processed_at"
        
        print(f"PASS: /api/sync/queue/status returns {data['total']} processed actions")


class TestSyncQueueCreateInvoiceWithDayOpen:
    """Test create_invoice when day IS open"""
    
    def test_create_invoice_success_when_day_open(self):
        """POST /api/sync/queue/process avec type=create_invoice quand journée ouverte -> status='ok'"""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        # Ensure day is open (requires body with opened_by, opened_by_role)
        open_payload = {
            "opened_by": "PytestRunner",
            "opened_by_role": "admin",
            "initial_cash": 0,
            "notes": "Auto-opened by pytest for sync test",
            "force": True
        }
        requests.post(f"{BASE_URL}/api/day-openings/{today}/open", json=open_payload, timeout=10)
        
        client_id = str(uuid.uuid4())
        payload = {
            "actions": [{
                "client_id": client_id,
                "type": "create_invoice",
                "payload": {
                    "customer_name": "Test Offline Customer",
                    "items": [{"name": "Test Offline Item", "price": 2500, "quantity": 2}],
                    "subtotal": 5000,
                    "total": 5000,
                    "payment_method": "cash",
                    "created_by": "Test Offline User"
                },
                "queued_at": datetime.now(timezone.utc).isoformat()
            }]
        }
        
        response = requests.post(f"{BASE_URL}/api/sync/queue/process", json=payload, timeout=15)
        
        assert response.status_code == 200
        result = response.json()["results"][0]
        assert result["status"] == "ok", f"Expected status='ok', got '{result['status']}': {result.get('reason')}"
        
        # Verify offline markers
        invoice_data = result.get("data", {})
        assert invoice_data.get("_offline_origin") is True, "Invoice should have _offline_origin=True"
        assert invoice_data.get("_offline_client_id") == client_id, "Invoice should have _offline_client_id"
        
        print(f"PASS: create_invoice when day is open returns status='ok'")
        print(f"  - Invoice created with _offline_origin=True")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
