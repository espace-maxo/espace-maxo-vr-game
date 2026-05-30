"""
Test suite for Cuisine/Kitchen Tracker feature (Iteration 88)

Tests:
- GET /api/cuisine/messages/presets — returns 2 lists (manager_to_cuisinier 5 items, cuisinier_to_manager 6 items)
- POST /api/cuisine/messages — create a message
- GET /api/cuisine/messages — retrieve messages for actor role
- POST /api/cuisine/messages/{id}/read — mark message read
- POST /api/cuisine/messages/read-all — mark all messages read
- GET /api/cuisine/orders — manager can see kitchen orders
- PATCH /api/cuisine/orders/{table_id}/items/{idx}/start — cuisinier marks item in_progress
- PATCH /api/cuisine/orders/{table_id}/items/{idx}/served — manager confirms served (requires ready_at)
- Permission tests: invalid code, wrong role for served/start
- Workflow: create table → start → ready → served
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

class TestCuisineMessagesPresets:
    """Test GET /api/cuisine/messages/presets"""
    
    def test_presets_returns_both_lists_for_manager(self):
        """Manager should get both manager_to_cuisinier (5) and cuisinier_to_manager (6) presets"""
        response = requests.get(f"{BASE_URL}/api/cuisine/messages/presets", params={"actor_role": "manager"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "manager_to_cuisinier" in data
        assert "cuisinier_to_manager" in data
        assert len(data["manager_to_cuisinier"]) == 5, f"Expected 5 manager presets, got {len(data['manager_to_cuisinier'])}"
        assert len(data["cuisinier_to_manager"]) == 6, f"Expected 6 cuisinier presets, got {len(data['cuisinier_to_manager'])}"
        
        # Verify manager preset codes
        manager_codes = [p["code"] for p in data["manager_to_cuisinier"]]
        assert "TIME" in manager_codes
        assert "URGENT" in manager_codes
        assert "CONFIRM" in manager_codes
        assert "REDO" in manager_codes
        assert "CANCEL" in manager_codes
        
        # Verify cuisinier preset codes
        cuisinier_codes = [p["code"] for p in data["cuisinier_to_manager"]]
        assert "OK" in cuisinier_codes
        assert "5MIN" in cuisinier_codes
        assert "10MIN" in cuisinier_codes
        assert "15MIN" in cuisinier_codes
        assert "OUT" in cuisinier_codes
        assert "SOON" in cuisinier_codes
        print("PASS: Presets returns correct lists for manager")
    
    def test_presets_returns_both_lists_for_cuisinier(self):
        """Cuisinier should also get both lists"""
        response = requests.get(f"{BASE_URL}/api/cuisine/messages/presets", params={"actor_role": "cuisinier"})
        assert response.status_code == 200
        
        data = response.json()
        assert len(data["manager_to_cuisinier"]) == 5
        assert len(data["cuisinier_to_manager"]) == 6
        print("PASS: Presets returns correct lists for cuisinier")
    
    def test_presets_rejects_invalid_role(self):
        """Invalid role should be rejected with 403"""
        response = requests.get(f"{BASE_URL}/api/cuisine/messages/presets", params={"actor_role": "server"})
        assert response.status_code == 403, f"Expected 403 for server role, got {response.status_code}"
        print("PASS: Presets rejects invalid role")


class TestCuisineMessages:
    """Test POST/GET /api/cuisine/messages"""
    
    def test_create_message_manager_to_cuisinier(self):
        """Manager can send TIME message to cuisinier"""
        payload = {
            "code": "TIME",
            "label": "⏱️ Combien de temps encore ?",
            "from_role": "manager",
            "from_name": "Gérante",
            "to_role": "cuisinier",
            "table_number": 5
        }
        response = requests.post(f"{BASE_URL}/api/cuisine/messages", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["success"] is True
        assert "message" in data
        assert data["message"]["code"] == "TIME"
        assert data["message"]["from_role"] == "manager"
        assert data["message"]["to_role"] == "cuisinier"
        assert data["message"]["table_number"] == 5
        # Verify no _id exposed
        assert "_id" not in data["message"], "MongoDB _id should not be exposed"
        print("PASS: Manager can create TIME message to cuisinier")
        return data["message"]["id"]
    
    def test_create_message_cuisinier_to_manager(self):
        """Cuisinier can send OK message to manager"""
        payload = {
            "code": "OK",
            "label": "✅ OK, c'est noté",
            "from_role": "cuisinier",
            "from_name": "Cuisinier",
            "to_role": "manager"
        }
        response = requests.post(f"{BASE_URL}/api/cuisine/messages", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        assert data["message"]["code"] == "OK"
        print("PASS: Cuisinier can create OK message to manager")
    
    def test_create_message_invalid_code_for_role(self):
        """Cuisinier cannot use manager codes (TIME)"""
        payload = {
            "code": "TIME",  # Manager code
            "label": "⏱️ Combien de temps encore ?",
            "from_role": "cuisinier",  # But from cuisinier
            "from_name": "Cuisinier",
            "to_role": "manager"
        }
        response = requests.post(f"{BASE_URL}/api/cuisine/messages", json=payload)
        assert response.status_code == 400, f"Expected 400 for invalid code, got {response.status_code}"
        print("PASS: Cuisinier cannot use manager codes")
    
    def test_create_message_invalid_code(self):
        """Invalid code should be rejected"""
        payload = {
            "code": "INVALID",
            "label": "Invalid message",
            "from_role": "manager",
            "from_name": "Gérante",
            "to_role": "cuisinier"
        }
        response = requests.post(f"{BASE_URL}/api/cuisine/messages", json=payload)
        assert response.status_code == 400, f"Expected 400 for invalid code, got {response.status_code}"
        print("PASS: Invalid code rejected with 400")
    
    def test_get_messages_for_cuisinier(self):
        """Cuisinier can retrieve messages destined to them"""
        # First create a message to cuisinier
        payload = {
            "code": "URGENT",
            "label": "🚨 Urgent, client pressé",
            "from_role": "manager",
            "from_name": "Gérante",
            "to_role": "cuisinier",
            "table_number": 7
        }
        requests.post(f"{BASE_URL}/api/cuisine/messages", json=payload)
        
        # Now fetch messages as cuisinier
        response = requests.get(f"{BASE_URL}/api/cuisine/messages", params={"actor_role": "cuisinier"})
        assert response.status_code == 200
        
        data = response.json()
        assert "messages" in data
        assert "unread" in data
        assert "total" in data
        # Verify no _id in messages
        for msg in data["messages"]:
            assert "_id" not in msg, "MongoDB _id should not be exposed in messages list"
        print(f"PASS: Cuisinier can retrieve messages (total: {data['total']}, unread: {data['unread']})")
    
    def test_mark_message_read(self):
        """Can mark a specific message as read"""
        # Create a message
        payload = {
            "code": "CONFIRM",
            "label": "❓ Le plat est-il bien noté ?",
            "from_role": "manager",
            "from_name": "Gérante",
            "to_role": "cuisinier"
        }
        create_res = requests.post(f"{BASE_URL}/api/cuisine/messages", json=payload)
        msg_id = create_res.json()["message"]["id"]
        
        # Mark as read
        response = requests.post(f"{BASE_URL}/api/cuisine/messages/{msg_id}/read", params={"actor_role": "cuisinier"})
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        print("PASS: Can mark message as read")
    
    def test_mark_all_messages_read(self):
        """Can mark all messages as read for a role"""
        response = requests.post(f"{BASE_URL}/api/cuisine/messages/read-all", params={"actor_role": "cuisinier"})
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        print(f"PASS: Marked all messages read (modified: {data['modified']})")


class TestCuisineOrders:
    """Test GET /api/cuisine/orders and status transitions"""
    
    @pytest.fixture(autouse=True)
    def setup_test_table(self):
        """Create a test table with cuisine items for testing"""
        import random
        self.table_number = random.randint(200, 999)  # Use random high number to avoid conflicts
        
        # Create table with cuisine items
        payload = {
            "table_number": self.table_number,
            "server_id": "test_server",
            "server_name": "Test Server",
            "items": [
                {"name": "Poulet Grillé", "price": 5000, "quantity": 1, "department": "Plats"},
                {"name": "Riz Cantonais", "price": 1500, "quantity": 2, "department": "Riz"},
            ],
            "client_name": "Test Client",
            "payment_method": "cash",
            "discount": 0,
            "notes": "Test order for cuisine"
        }
        response = requests.post(f"{BASE_URL}/api/caisse/tables", json=payload)
        if response.status_code in [200, 201]:
            data = response.json()
            self.table_id = data.get("table", {}).get("id")
            print(f"Created test table with id={self.table_id}, table_number={self.table_number}")
        else:
            print(f"Warning: Could not create test table: {response.text}")
            self.table_id = None
        
        yield
        
        # Cleanup
        if self.table_id:
            try:
                requests.delete(f"{BASE_URL}/api/caisse/tables/{self.table_id}?reason=test_cleanup")
            except:
                pass
    
    def test_manager_can_see_orders(self):
        """Manager can see cuisine orders"""
        response = requests.get(f"{BASE_URL}/api/cuisine/orders", params={"actor_role": "manager"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "orders" in data
        assert "total" in data
        print(f"PASS: Manager can see cuisine orders (total: {data['total']})")
    
    def test_cuisinier_can_see_orders(self):
        """Cuisinier can see cuisine orders"""
        response = requests.get(f"{BASE_URL}/api/cuisine/orders", params={"actor_role": "cuisinier"})
        assert response.status_code == 200
        
        data = response.json()
        assert "orders" in data
        print(f"PASS: Cuisinier can see cuisine orders (total: {data['total']})")
    
    def test_server_cannot_see_orders(self):
        """Server role should be rejected"""
        response = requests.get(f"{BASE_URL}/api/cuisine/orders", params={"actor_role": "server"})
        assert response.status_code == 403, f"Expected 403 for server role, got {response.status_code}"
        print("PASS: Server cannot see cuisine orders")
    
    def test_start_item_cuisinier(self):
        """Cuisinier can mark item as in_progress (started_at)"""
        if not self.table_id:
            pytest.skip("Test table not created")
        response = requests.patch(
            f"{BASE_URL}/api/cuisine/orders/{self.table_id}/items/0/start",
            params={"actor_role": "cuisinier", "actor_name": "Test Cuisinier"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["success"] is True
        assert "item" in data
        assert data["item"].get("started_at") is not None
        print("PASS: Cuisinier can start item (mark in_progress)")
    
    def test_start_item_manager_forbidden(self):
        """Manager cannot start items (only cuisinier)"""
        if not self.table_id:
            pytest.skip("Test table not created")
        response = requests.patch(
            f"{BASE_URL}/api/cuisine/orders/{self.table_id}/items/0/start",
            params={"actor_role": "manager", "actor_name": "Gérante"}
        )
        assert response.status_code == 403, f"Expected 403 for manager starting item, got {response.status_code}"
        print("PASS: Manager cannot start items (403)")
    
    def test_served_requires_ready(self):
        """Cannot mark served if not ready"""
        if not self.table_id:
            pytest.skip("Test table not created")
        # Try to mark served without ready_at
        response = requests.patch(
            f"{BASE_URL}/api/cuisine/orders/{self.table_id}/items/1/served",
            params={"actor_role": "manager", "actor_name": "Gérante"}
        )
        assert response.status_code == 400, f"Expected 400 (not ready), got {response.status_code}: {response.text}"
        print("PASS: Cannot mark served if not ready (400)")
    
    def test_served_cuisinier_forbidden(self):
        """Cuisinier cannot mark items as served"""
        if not self.table_id:
            pytest.skip("Test table not created")
        response = requests.patch(
            f"{BASE_URL}/api/cuisine/orders/{self.table_id}/items/0/served",
            params={"actor_role": "cuisinier", "actor_name": "Cuisinier"}
        )
        assert response.status_code == 403, f"Expected 403 for cuisinier serving, got {response.status_code}"
        print("PASS: Cuisinier cannot mark served (403)")


class TestCuisineWorkflow:
    """Test complete workflow: create table → start → ready → served"""
    
    def test_complete_workflow(self):
        """Full workflow: received → in_progress → ready → served"""
        import random
        table_number = random.randint(300, 999)  # Use random high number to avoid conflicts
        
        # Step 1: Create table with cuisine item
        create_payload = {
            "table_number": table_number,
            "server_id": "workflow_server",
            "server_name": "Workflow Server",
            "items": [
                {"name": "Steak Grillé", "price": 6000, "quantity": 1, "department": "Grillades"},
            ],
            "client_name": "Workflow Client",
            "payment_method": "cash",
            "discount": 0,
            "notes": ""
        }
        create_res = requests.post(f"{BASE_URL}/api/caisse/tables", json=create_payload)
        assert create_res.status_code in [200, 201], f"Failed to create table: {create_res.text}"
        table_id = create_res.json().get("table", {}).get("id")
        assert table_id, "No table ID returned"
        print(f"Step 1: Table created with id={table_id}, table_number={table_number}")
        
        # Step 2: Verify initial status is 'received'
        orders_res = requests.get(f"{BASE_URL}/api/cuisine/orders", params={"actor_role": "cuisinier"})
        assert orders_res.status_code == 200
        orders = orders_res.json()["orders"]
        test_order = next((o for o in orders if o["id"] == table_id), None)
        if test_order:
            assert test_order["items"][0]["status"] == "received", f"Expected 'received', got {test_order['items'][0]['status']}"
            print("Step 2: Initial status is 'received'")
        
        # Step 3: Cuisinier starts item (in_progress)
        start_res = requests.patch(
            f"{BASE_URL}/api/cuisine/orders/{table_id}/items/0/start",
            params={"actor_role": "cuisinier", "actor_name": "Test Cuisinier"}
        )
        assert start_res.status_code == 200, f"Failed to start: {start_res.text}"
        print("Step 3: Item marked in_progress (started_at set)")
        
        # Verify status is now 'in_progress'
        orders_res = requests.get(f"{BASE_URL}/api/cuisine/orders", params={"actor_role": "cuisinier"})
        orders = orders_res.json()["orders"]
        test_order = next((o for o in orders if o["id"] == table_id), None)
        if test_order:
            assert test_order["items"][0]["status"] == "in_progress", f"Expected 'in_progress', got {test_order['items'][0]['status']}"
        
        # Step 4: Cuisinier marks item ready
        ready_res = requests.patch(
            f"{BASE_URL}/api/cuisine/orders/{table_id}/items/0/ready",
            params={"actor_role": "cuisinier", "actor_name": "Test Cuisinier"}
        )
        assert ready_res.status_code == 200, f"Failed to mark ready: {ready_res.text}"
        print("Step 4: Item marked ready (ready_at set)")
        
        # Verify status is now 'ready'
        orders_res = requests.get(f"{BASE_URL}/api/cuisine/orders", params={"actor_role": "manager"})
        orders = orders_res.json()["orders"]
        test_order = next((o for o in orders if o["id"] == table_id), None)
        if test_order:
            assert test_order["items"][0]["status"] == "ready", f"Expected 'ready', got {test_order['items'][0]['status']}"
        
        # Step 5: Manager marks item served
        served_res = requests.patch(
            f"{BASE_URL}/api/cuisine/orders/{table_id}/items/0/served",
            params={"actor_role": "manager", "actor_name": "Gérante"}
        )
        assert served_res.status_code == 200, f"Failed to mark served: {served_res.text}"
        print("Step 5: Item marked served (served_at set)")
        
        # Verify status is now 'served'
        orders_res = requests.get(f"{BASE_URL}/api/cuisine/orders", params={"actor_role": "manager"})
        orders = orders_res.json()["orders"]
        test_order = next((o for o in orders if o["id"] == table_id), None)
        if test_order:
            assert test_order["items"][0]["status"] == "served", f"Expected 'served', got {test_order['items'][0]['status']}"
        
        print("PASS: Complete workflow received → in_progress → ready → served")
        
        # Cleanup
        try:
            requests.delete(f"{BASE_URL}/api/caisse/tables/{table_id}?reason=test_cleanup")
        except:
            pass


class TestCuisineSecurityAndValidation:
    """Security and validation tests"""
    
    def test_messages_no_mongodb_id_exposed(self):
        """Verify _id is not exposed in message responses"""
        # Create a message
        payload = {
            "code": "5MIN",
            "label": "⏱️ 5 minutes",
            "from_role": "cuisinier",
            "from_name": "Cuisinier",
            "to_role": "manager"
        }
        create_res = requests.post(f"{BASE_URL}/api/cuisine/messages", json=payload)
        assert create_res.status_code == 200
        assert "_id" not in create_res.json()["message"]
        
        # Get messages
        get_res = requests.get(f"{BASE_URL}/api/cuisine/messages", params={"actor_role": "manager"})
        assert get_res.status_code == 200
        for msg in get_res.json()["messages"]:
            assert "_id" not in msg, "MongoDB _id should not be exposed"
        
        print("PASS: MongoDB _id not exposed in cuisine_messages")
    
    def test_invalid_to_role_rejected(self):
        """Invalid to_role should be rejected"""
        payload = {
            "code": "TIME",
            "label": "⏱️ Combien de temps encore ?",
            "from_role": "manager",
            "from_name": "Gérante",
            "to_role": "server"  # Invalid - should be cuisinier or manager
        }
        response = requests.post(f"{BASE_URL}/api/cuisine/messages", json=payload)
        assert response.status_code == 400, f"Expected 400 for invalid to_role, got {response.status_code}"
        print("PASS: Invalid to_role rejected")
    
    def test_invalid_from_role_rejected(self):
        """Invalid from_role should be rejected"""
        payload = {
            "code": "TIME",
            "label": "⏱️ Combien de temps encore ?",
            "from_role": "server",  # Invalid
            "from_name": "Server",
            "to_role": "cuisinier"
        }
        response = requests.post(f"{BASE_URL}/api/cuisine/messages", json=payload)
        assert response.status_code == 403, f"Expected 403 for invalid from_role, got {response.status_code}"
        print("PASS: Invalid from_role rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
