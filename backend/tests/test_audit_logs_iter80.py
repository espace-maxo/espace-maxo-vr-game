"""
Test Audit Logs System - Iteration 80
Tests the new audit logging feature for invoice and table (bon) modifications.
Accessible only by admin role.

Features tested:
- GET /api/audit/logs with role=admin returns 200 with total/by_action/by_actor/logs
- GET /api/audit/logs with role=manager returns 403 (Admin only)
- POST /api/invoices creates audit log with action='create'
- PUT /api/invoices/{id} with validation_status='validated' creates log action='validate'
- PUT /api/invoices/{id} with validation_status='cancelled' creates log action='cancel'
- DELETE /api/invoices/{id} creates log action='delete'
- PUT /api/invoices/{id}/update-items creates log with changes (items diff)
- PUT /api/caisse/tables/{id} creates log entity_type='table' action='update'
- DELETE /api/caisse/tables/{id}?reason=cancelled creates log entity_type='table' action='delete'
- DELETE /api/caisse/tables/{id} (no reason) does NOT create log (cleanup after invoicing)
- Filters: entity_type, actor_role, action, start_date, end_date, search
- ObjectId exclusion: no _id in responses
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
API = f"{BASE_URL}/api"


class TestAuditLogsAccess:
    """Test access control for audit logs endpoint"""
    
    def test_audit_logs_admin_access_returns_200(self):
        """GET /api/audit/logs?role=admin should return 200 with proper structure"""
        response = requests.get(f"{API}/audit/logs", params={"role": "admin"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "total" in data, "Response should contain 'total'"
        assert "by_action" in data, "Response should contain 'by_action'"
        assert "by_actor" in data, "Response should contain 'by_actor'"
        assert "logs" in data, "Response should contain 'logs'"
        assert isinstance(data["logs"], list), "'logs' should be a list"
        print(f"✓ Admin access: total={data['total']}, by_action={data['by_action']}")
    
    def test_audit_logs_manager_access_returns_403(self):
        """GET /api/audit/logs?role=manager should return 403 (Admin only)"""
        response = requests.get(f"{API}/audit/logs", params={"role": "manager"})
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data, "Response should contain error detail"
        assert "administrateur" in data["detail"].lower() or "admin" in data["detail"].lower(), \
            f"Error message should mention admin restriction: {data['detail']}"
        print(f"✓ Manager access denied: {data['detail']}")
    
    def test_audit_logs_server_access_returns_403(self):
        """GET /api/audit/logs?role=server should return 403 (Admin only)"""
        response = requests.get(f"{API}/audit/logs", params={"role": "server"})
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("✓ Server access denied")
    
    def test_audit_logs_no_role_returns_error(self):
        """GET /api/audit/logs without role param should return 422 (required param)"""
        response = requests.get(f"{API}/audit/logs")
        # FastAPI returns 422 for missing required query params
        assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"
        print("✓ Missing role param returns 422")


class TestInvoiceAuditLogging:
    """Test audit logging for invoice operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_actor_name = "TEST_Gérante_Audit"
        self.test_actor_role = "manager"
        self.created_invoice_ids = []
    
    def teardown_method(self, method):
        """Cleanup created invoices"""
        for inv_id in self.created_invoice_ids:
            try:
                requests.delete(f"{API}/invoices/{inv_id}")
            except:
                pass
    
    def test_create_invoice_generates_audit_log(self):
        """POST /api/invoices should create an audit log with action='create'"""
        # Create invoice with actor params
        invoice_data = {
            "customer_name": "TEST_AuditClient",
            "customer_phone": "12345678",
            "items": [{"id": "test1", "name": "Test Item", "price": 1000, "quantity": 2, "department": "bar", "unit": "unité"}],
            "subtotal": 2000,
            "discount": 0,
            "discount_amount": 0,
            "total": 2000,
            "payment_method": "cash",
            "totals_by_department": {"bar": 2000},
            "notes": "Test audit creation",
            "created_by": self.test_actor_name,
            "validation_status": "pending"
        }
        
        response = requests.post(
            f"{API}/invoices",
            json=invoice_data,
            params={"actor_name": self.test_actor_name, "actor_role": self.test_actor_role}
        )
        assert response.status_code == 200, f"Failed to create invoice: {response.text}"
        
        invoice = response.json().get("invoice", {})
        invoice_id = invoice.get("id")
        invoice_number = invoice.get("invoice_number")
        self.created_invoice_ids.append(invoice_id)
        
        # Check audit logs for this invoice
        audit_response = requests.get(f"{API}/audit/logs", params={
            "role": "admin",
            "search": invoice_number,
            "action": "create"
        })
        assert audit_response.status_code == 200
        
        logs = audit_response.json().get("logs", [])
        create_log = next((lg for lg in logs if lg.get("entity_id") == invoice_id and lg.get("action") == "create"), None)
        
        assert create_log is not None, f"No 'create' audit log found for invoice {invoice_id}"
        assert create_log.get("entity_type") == "invoice", "entity_type should be 'invoice'"
        assert create_log.get("actor_name") == self.test_actor_name, f"actor_name mismatch: {create_log.get('actor_name')}"
        assert create_log.get("actor_role") == self.test_actor_role, f"actor_role mismatch: {create_log.get('actor_role')}"
        assert "_id" not in create_log, "Response should not contain MongoDB _id"
        
        print(f"✓ Invoice creation logged: {invoice_number}, actor={self.test_actor_name}")
    
    def test_validate_invoice_generates_validate_log(self):
        """PUT /api/invoices/{id} with validation_status='validated' should create action='validate'"""
        # First create an invoice
        invoice_data = {
            "customer_name": "TEST_ValidateClient",
            "items": [{"id": "test2", "name": "Validate Test", "price": 500, "quantity": 1, "department": "bar", "unit": "unité"}],
            "subtotal": 500,
            "total": 500,
            "payment_method": "cash",
            "created_by": self.test_actor_name,
            "validation_status": "pending"
        }
        
        create_resp = requests.post(f"{API}/invoices", json=invoice_data, params={"actor_name": self.test_actor_name, "actor_role": self.test_actor_role})
        assert create_resp.status_code == 200
        invoice = create_resp.json().get("invoice", {})
        invoice_id = invoice.get("id")
        self.created_invoice_ids.append(invoice_id)
        
        # Validate the invoice
        validate_resp = requests.put(
            f"{API}/invoices/{invoice_id}",
            json={"validation_status": "validated", "validated_by": self.test_actor_name},
            params={"actor_name": self.test_actor_name, "actor_role": self.test_actor_role}
        )
        assert validate_resp.status_code == 200, f"Failed to validate: {validate_resp.text}"
        
        # Check audit logs
        audit_response = requests.get(f"{API}/audit/logs", params={
            "role": "admin",
            "action": "validate"
        })
        logs = audit_response.json().get("logs", [])
        validate_log = next((lg for lg in logs if lg.get("entity_id") == invoice_id and lg.get("action") == "validate"), None)
        
        assert validate_log is not None, f"No 'validate' audit log found for invoice {invoice_id}"
        assert validate_log.get("entity_type") == "invoice"
        
        # Check changes contain validation_status diff
        changes = validate_log.get("changes", {})
        assert "validation_status" in changes, f"Changes should contain validation_status diff: {changes}"
        assert changes["validation_status"]["from"] == "pending"
        assert changes["validation_status"]["to"] == "validated"
        
        print(f"✓ Invoice validation logged with diff: {changes}")
    
    def test_cancel_invoice_generates_cancel_log(self):
        """PUT /api/invoices/{id} with validation_status='cancelled' should create action='cancel'"""
        # Create invoice
        invoice_data = {
            "customer_name": "TEST_CancelClient",
            "items": [{"id": "test3", "name": "Cancel Test", "price": 300, "quantity": 1, "department": "bar", "unit": "unité"}],
            "subtotal": 300,
            "total": 300,
            "payment_method": "cash",
            "created_by": self.test_actor_name,
            "validation_status": "pending"
        }
        
        create_resp = requests.post(f"{API}/invoices", json=invoice_data, params={"actor_name": self.test_actor_name, "actor_role": self.test_actor_role})
        invoice = create_resp.json().get("invoice", {})
        invoice_id = invoice.get("id")
        self.created_invoice_ids.append(invoice_id)
        
        # Cancel the invoice
        cancel_resp = requests.put(
            f"{API}/invoices/{invoice_id}",
            json={"validation_status": "cancelled", "cancelled_by": self.test_actor_name},
            params={"actor_name": self.test_actor_name, "actor_role": self.test_actor_role}
        )
        assert cancel_resp.status_code == 200, f"Failed to cancel: {cancel_resp.text}"
        
        # Check audit logs
        audit_response = requests.get(f"{API}/audit/logs", params={"role": "admin", "action": "cancel"})
        logs = audit_response.json().get("logs", [])
        cancel_log = next((lg for lg in logs if lg.get("entity_id") == invoice_id and lg.get("action") == "cancel"), None)
        
        assert cancel_log is not None, f"No 'cancel' audit log found for invoice {invoice_id}"
        changes = cancel_log.get("changes", {})
        assert "validation_status" in changes
        assert changes["validation_status"]["to"] == "cancelled"
        
        print(f"✓ Invoice cancellation logged with diff: {changes}")
    
    def test_delete_invoice_generates_delete_log(self):
        """DELETE /api/invoices/{id} should create action='delete'"""
        # Create invoice
        invoice_data = {
            "customer_name": "TEST_DeleteClient",
            "items": [{"id": "test4", "name": "Delete Test", "price": 200, "quantity": 1, "department": "bar", "unit": "unité"}],
            "subtotal": 200,
            "total": 200,
            "payment_method": "cash",
            "created_by": self.test_actor_name,
            "validation_status": "pending"
        }
        
        create_resp = requests.post(f"{API}/invoices", json=invoice_data, params={"actor_name": self.test_actor_name, "actor_role": self.test_actor_role})
        invoice = create_resp.json().get("invoice", {})
        invoice_id = invoice.get("id")
        invoice_number = invoice.get("invoice_number")
        # Don't add to cleanup list since we're deleting it
        
        # Delete the invoice
        delete_resp = requests.delete(
            f"{API}/invoices/{invoice_id}",
            params={"actor_name": self.test_actor_name, "actor_role": self.test_actor_role}
        )
        assert delete_resp.status_code == 200, f"Failed to delete: {delete_resp.text}"
        
        # Check audit logs
        audit_response = requests.get(f"{API}/audit/logs", params={"role": "admin", "action": "delete", "entity_type": "invoice"})
        logs = audit_response.json().get("logs", [])
        delete_log = next((lg for lg in logs if lg.get("entity_id") == invoice_id and lg.get("action") == "delete"), None)
        
        assert delete_log is not None, f"No 'delete' audit log found for invoice {invoice_id}"
        assert delete_log.get("entity_type") == "invoice"
        assert delete_log.get("invoice_number") == invoice_number
        
        print(f"✓ Invoice deletion logged: {invoice_number}")


class TestTableAuditLogging:
    """Test audit logging for table (bon) operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_server_id = f"TEST_SERVER_{uuid.uuid4().hex[:8]}"
        self.test_server_name = "TEST_Serveur_Audit"
        self.test_actor_role = "server"
        self.created_table_ids = []
    
    def teardown_method(self, method):
        """Cleanup created tables"""
        for table_id in self.created_table_ids:
            try:
                requests.delete(f"{API}/caisse/tables/{table_id}")
            except:
                pass
    
    def test_update_table_generates_audit_log(self):
        """PUT /api/caisse/tables/{id} should create audit log with entity_type='table' action='update'"""
        # Create a table first
        table_data = {
            "table_number": 19,  # Use high number to avoid conflicts
            "server_id": self.test_server_id,
            "server_name": self.test_server_name,
            "items": [{"id": "item1", "name": "Initial Item", "price": 1000, "quantity": 1}],
            "client_name": "TEST_TableClient",
            "payment_method": "cash",
            "discount": 0,
            "notes": ""
        }
        
        create_resp = requests.post(f"{API}/caisse/tables", json=table_data)
        assert create_resp.status_code == 200, f"Failed to create table: {create_resp.text}"
        table = create_resp.json().get("table", {})
        table_id = table.get("id")
        self.created_table_ids.append(table_id)
        
        # Update the table with actor params
        update_data = {
            "items": [
                {"id": "item1", "name": "Initial Item", "price": 1000, "quantity": 1},
                {"id": "item2", "name": "New Item", "price": 500, "quantity": 2}
            ],
            "client_name": "TEST_UpdatedClient"
        }
        
        update_resp = requests.put(
            f"{API}/caisse/tables/{table_id}",
            json=update_data,
            params={"actor_name": self.test_server_name, "actor_role": self.test_actor_role}
        )
        assert update_resp.status_code == 200, f"Failed to update table: {update_resp.text}"
        
        # Check audit logs
        audit_response = requests.get(f"{API}/audit/logs", params={
            "role": "admin",
            "entity_type": "table",
            "action": "update"
        })
        logs = audit_response.json().get("logs", [])
        update_log = next((lg for lg in logs if lg.get("entity_id") == table_id and lg.get("action") == "update"), None)
        
        assert update_log is not None, f"No 'update' audit log found for table {table_id}"
        assert update_log.get("entity_type") == "table"
        assert update_log.get("actor_name") == self.test_server_name
        
        # Check changes contain items diff
        changes = update_log.get("changes", {})
        # Items change should show count/qty summary
        if "items" in changes:
            assert "from" in changes["items"] and "to" in changes["items"]
            print(f"✓ Table update logged with items diff: {changes['items']}")
        if "client_name" in changes:
            assert changes["client_name"]["from"] == "TEST_TableClient"
            assert changes["client_name"]["to"] == "TEST_UpdatedClient"
            print(f"✓ Table update logged with client_name diff")
        
        print(f"✓ Table update logged: table_id={table_id}")
    
    def test_delete_table_with_reason_cancelled_generates_log(self):
        """DELETE /api/caisse/tables/{id}?reason=cancelled should create audit log"""
        # Create a table
        table_data = {
            "table_number": 18,
            "server_id": self.test_server_id,
            "server_name": self.test_server_name,
            "items": [{"id": "item1", "name": "Cancel Item", "price": 800, "quantity": 1}],
            "client_name": "TEST_CancelTableClient",
            "payment_method": "cash",
            "discount": 0,
            "notes": ""
        }
        
        create_resp = requests.post(f"{API}/caisse/tables", json=table_data)
        assert create_resp.status_code == 200
        table = create_resp.json().get("table", {})
        table_id = table.get("id")
        table_number = table.get("table_number")
        # Don't add to cleanup since we're deleting
        
        # Delete with reason=cancelled
        delete_resp = requests.delete(
            f"{API}/caisse/tables/{table_id}",
            params={"actor_name": self.test_server_name, "actor_role": self.test_actor_role, "reason": "cancelled"}
        )
        assert delete_resp.status_code == 200, f"Failed to delete table: {delete_resp.text}"
        
        # Check audit logs
        audit_response = requests.get(f"{API}/audit/logs", params={
            "role": "admin",
            "entity_type": "table",
            "action": "delete"
        })
        logs = audit_response.json().get("logs", [])
        delete_log = next((lg for lg in logs if lg.get("entity_id") == table_id and lg.get("action") == "delete"), None)
        
        assert delete_log is not None, f"No 'delete' audit log found for table {table_id}"
        assert delete_log.get("entity_type") == "table"
        assert delete_log.get("table_number") == table_number
        
        print(f"✓ Table deletion (cancelled) logged: table_number={table_number}")
    
    def test_delete_table_without_reason_does_not_log(self):
        """DELETE /api/caisse/tables/{id} without reason should NOT create audit log (cleanup after invoicing)"""
        # Create a table
        table_data = {
            "table_number": 17,
            "server_id": self.test_server_id,
            "server_name": self.test_server_name,
            "items": [{"id": "item1", "name": "Cleanup Item", "price": 600, "quantity": 1}],
            "client_name": "TEST_CleanupClient",
            "payment_method": "cash",
            "discount": 0,
            "notes": ""
        }
        
        create_resp = requests.post(f"{API}/caisse/tables", json=table_data)
        assert create_resp.status_code == 200
        table = create_resp.json().get("table", {})
        table_id = table.get("id")
        
        # Get current audit log count for this table
        audit_before = requests.get(f"{API}/audit/logs", params={"role": "admin", "entity_type": "table", "action": "delete"})
        logs_before = [lg for lg in audit_before.json().get("logs", []) if lg.get("entity_id") == table_id]
        
        # Delete WITHOUT reason (simulates cleanup after invoice conversion)
        delete_resp = requests.delete(f"{API}/caisse/tables/{table_id}")
        assert delete_resp.status_code == 200
        
        # Check audit logs - should NOT have a new delete log for this table
        audit_after = requests.get(f"{API}/audit/logs", params={"role": "admin", "entity_type": "table", "action": "delete"})
        logs_after = [lg for lg in audit_after.json().get("logs", []) if lg.get("entity_id") == table_id]
        
        assert len(logs_after) == len(logs_before), \
            f"Delete without reason should NOT create audit log. Before: {len(logs_before)}, After: {len(logs_after)}"
        
        print(f"✓ Table deletion without reason (cleanup) did NOT create audit log")


class TestAuditLogsFilters:
    """Test audit logs filtering capabilities"""
    
    def test_filter_by_entity_type_invoice(self):
        """Filter by entity_type=invoice should only return invoice logs"""
        response = requests.get(f"{API}/audit/logs", params={"role": "admin", "entity_type": "invoice"})
        assert response.status_code == 200
        
        logs = response.json().get("logs", [])
        for lg in logs:
            assert lg.get("entity_type") == "invoice", f"Expected entity_type='invoice', got {lg.get('entity_type')}"
        
        print(f"✓ Filter entity_type=invoice: {len(logs)} logs")
    
    def test_filter_by_entity_type_table(self):
        """Filter by entity_type=table should only return table logs"""
        response = requests.get(f"{API}/audit/logs", params={"role": "admin", "entity_type": "table"})
        assert response.status_code == 200
        
        logs = response.json().get("logs", [])
        for lg in logs:
            assert lg.get("entity_type") == "table", f"Expected entity_type='table', got {lg.get('entity_type')}"
        
        print(f"✓ Filter entity_type=table: {len(logs)} logs")
    
    def test_filter_by_actor_role_manager(self):
        """Filter by actor_role=manager should only return manager logs"""
        response = requests.get(f"{API}/audit/logs", params={"role": "admin", "actor_role": "manager"})
        assert response.status_code == 200
        
        logs = response.json().get("logs", [])
        for lg in logs:
            assert lg.get("actor_role") == "manager", f"Expected actor_role='manager', got {lg.get('actor_role')}"
        
        print(f"✓ Filter actor_role=manager: {len(logs)} logs")
    
    def test_filter_by_actor_role_server(self):
        """Filter by actor_role=server should only return server logs"""
        response = requests.get(f"{API}/audit/logs", params={"role": "admin", "actor_role": "server"})
        assert response.status_code == 200
        
        logs = response.json().get("logs", [])
        for lg in logs:
            assert lg.get("actor_role") == "server", f"Expected actor_role='server', got {lg.get('actor_role')}"
        
        print(f"✓ Filter actor_role=server: {len(logs)} logs")
    
    def test_filter_by_action_create(self):
        """Filter by action=create should only return create logs"""
        response = requests.get(f"{API}/audit/logs", params={"role": "admin", "action": "create"})
        assert response.status_code == 200
        
        logs = response.json().get("logs", [])
        for lg in logs:
            assert lg.get("action") == "create", f"Expected action='create', got {lg.get('action')}"
        
        print(f"✓ Filter action=create: {len(logs)} logs")
    
    def test_filter_by_action_validate(self):
        """Filter by action=validate should only return validate logs"""
        response = requests.get(f"{API}/audit/logs", params={"role": "admin", "action": "validate"})
        assert response.status_code == 200
        
        logs = response.json().get("logs", [])
        for lg in logs:
            assert lg.get("action") == "validate", f"Expected action='validate', got {lg.get('action')}"
        
        print(f"✓ Filter action=validate: {len(logs)} logs")
    
    def test_filter_by_date_range(self):
        """Filter by start_date and end_date should return logs within range"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(f"{API}/audit/logs", params={
            "role": "admin",
            "start_date": today,
            "end_date": today
        })
        assert response.status_code == 200
        
        logs = response.json().get("logs", [])
        for lg in logs:
            created_at = lg.get("created_at", "")
            assert created_at.startswith(today), f"Log date {created_at} not in range {today}"
        
        print(f"✓ Filter date range ({today}): {len(logs)} logs")
    
    def test_filter_by_search_invoice_number(self):
        """Filter by search should match invoice_number"""
        # First get any existing invoice number
        all_logs = requests.get(f"{API}/audit/logs", params={"role": "admin", "limit": 10})
        logs = all_logs.json().get("logs", [])
        
        if logs:
            sample_invoice_number = logs[0].get("invoice_number")
            if sample_invoice_number:
                response = requests.get(f"{API}/audit/logs", params={
                    "role": "admin",
                    "search": sample_invoice_number
                })
                assert response.status_code == 200
                
                search_logs = response.json().get("logs", [])
                assert len(search_logs) > 0, f"Search for {sample_invoice_number} should return results"
                
                for lg in search_logs:
                    assert sample_invoice_number in (lg.get("invoice_number") or "") or \
                           sample_invoice_number in (lg.get("actor_name") or ""), \
                           f"Search result should match {sample_invoice_number}"
                
                print(f"✓ Search filter for '{sample_invoice_number}': {len(search_logs)} logs")
            else:
                print("⚠ No invoice_number in sample logs to test search")
        else:
            print("⚠ No logs available to test search filter")
    
    def test_combined_filters(self):
        """Test combining multiple filters"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(f"{API}/audit/logs", params={
            "role": "admin",
            "entity_type": "invoice",
            "action": "create",
            "start_date": today,
            "end_date": today
        })
        assert response.status_code == 200
        
        logs = response.json().get("logs", [])
        for lg in logs:
            assert lg.get("entity_type") == "invoice"
            assert lg.get("action") == "create"
            assert lg.get("created_at", "").startswith(today)
        
        print(f"✓ Combined filters (invoice+create+today): {len(logs)} logs")


class TestAuditLogsDataIntegrity:
    """Test data integrity and structure of audit logs"""
    
    def test_no_mongodb_id_in_response(self):
        """Audit logs should not contain MongoDB _id field"""
        response = requests.get(f"{API}/audit/logs", params={"role": "admin", "limit": 50})
        assert response.status_code == 200
        
        logs = response.json().get("logs", [])
        for lg in logs:
            assert "_id" not in lg, f"Response should not contain _id: {lg.keys()}"
        
        print(f"✓ No _id in {len(logs)} audit logs")
    
    def test_audit_log_structure(self):
        """Verify audit log has required fields"""
        response = requests.get(f"{API}/audit/logs", params={"role": "admin", "limit": 10})
        assert response.status_code == 200
        
        logs = response.json().get("logs", [])
        required_fields = ["id", "entity_type", "entity_id", "action", "actor_name", "actor_role", "created_at"]
        
        for lg in logs:
            for field in required_fields:
                assert field in lg, f"Audit log missing required field '{field}': {lg.keys()}"
        
        print(f"✓ All {len(logs)} logs have required fields: {required_fields}")
    
    def test_snapshot_contains_useful_data(self):
        """Verify snapshot field contains useful invoice/table data"""
        response = requests.get(f"{API}/audit/logs", params={"role": "admin", "limit": 20})
        assert response.status_code == 200
        
        logs = response.json().get("logs", [])
        logs_with_snapshot = [lg for lg in logs if lg.get("snapshot")]
        
        for lg in logs_with_snapshot:
            snapshot = lg.get("snapshot", {})
            # Snapshot should have at least some useful fields
            useful_fields = ["total", "items_count", "validation_status", "client_name", "server_name"]
            has_useful = any(snapshot.get(f) is not None for f in useful_fields)
            assert has_useful, f"Snapshot should have useful data: {snapshot}"
        
        print(f"✓ {len(logs_with_snapshot)} logs have useful snapshot data")


class TestUpdateItemsAuditLogging:
    """Test audit logging for update-items endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.test_actor_name = "TEST_Gérante_Items"
        self.test_actor_role = "manager"
        self.created_invoice_ids = []
    
    def teardown_method(self, method):
        for inv_id in self.created_invoice_ids:
            try:
                requests.delete(f"{API}/invoices/{inv_id}")
            except:
                pass
    
    def test_update_items_generates_audit_log_with_diff(self):
        """PUT /api/invoices/{id}/update-items should create audit log with items diff"""
        # Create invoice with modification_allowed=True
        invoice_data = {
            "customer_name": "TEST_ItemsClient",
            "items": [{"id": "item1", "name": "Original Item", "price": 1000, "quantity": 2, "department": "bar", "unit": "unité"}],
            "subtotal": 2000,
            "total": 2000,
            "payment_method": "cash",
            "created_by": self.test_actor_name,
            "validation_status": "pending"
        }
        
        create_resp = requests.post(f"{API}/invoices", json=invoice_data, params={"actor_name": self.test_actor_name, "actor_role": self.test_actor_role})
        assert create_resp.status_code == 200
        invoice = create_resp.json().get("invoice", {})
        invoice_id = invoice.get("id")
        self.created_invoice_ids.append(invoice_id)
        
        # Enable modification
        requests.put(f"{API}/invoices/{invoice_id}", json={"modification_allowed": True})
        
        # Update items
        new_items = [
            {"id": "item1", "name": "Original Item", "price": 1000, "quantity": 3, "department": "bar", "unit": "unité"},
            {"id": "item2", "name": "New Item", "price": 500, "quantity": 1, "department": "bar", "unit": "unité"}
        ]
        
        update_resp = requests.put(
            f"{API}/invoices/{invoice_id}/update-items",
            json={"items": new_items},
            params={"actor_name": self.test_actor_name, "actor_role": self.test_actor_role}
        )
        assert update_resp.status_code == 200, f"Failed to update items: {update_resp.text}"
        
        # Check audit logs
        audit_response = requests.get(f"{API}/audit/logs", params={"role": "admin", "action": "update"})
        logs = audit_response.json().get("logs", [])
        update_log = next((lg for lg in logs if lg.get("entity_id") == invoice_id and lg.get("action") == "update"), None)
        
        assert update_log is not None, f"No 'update' audit log found for invoice {invoice_id}"
        
        changes = update_log.get("changes", {})
        # Items diff should show summary (count, qty, amount)
        if "items" in changes:
            items_diff = changes["items"]
            assert "from" in items_diff and "to" in items_diff
            # From: 1 item, qty=2, amount=2000
            # To: 2 items, qty=4, amount=3500
            print(f"✓ Update-items logged with items diff: from={items_diff['from']} to={items_diff['to']}")
        else:
            # At minimum, total should have changed
            assert "total" in changes or "subtotal" in changes, f"Changes should contain total or items diff: {changes}"
            print(f"✓ Update-items logged with changes: {changes}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
