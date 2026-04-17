"""
Test Suite for Invoices Router Refactoring (Phase 4)
Tests all 10 endpoints extracted to /app/backend/routers/invoices.py:
- POST /api/invoices (create)
- GET /api/invoices (list with filters)
- GET /api/invoices/{id} (get single)
- PUT /api/invoices/{id} (update with validation/stock sync)
- DELETE /api/invoices/{id} (delete)
- PUT /api/invoices/{id}/update-items (modify items)
- GET /api/invoices/{id}/pdf (generate PDF)
- PUT /api/invoices/{id}/assign-week (assign to week)
- POST /api/invoices/assign-week-bulk (bulk assign)
- POST /api/invoices/unassign-week-bulk (bulk unassign)

Also tests route collision fix: /api/invoices/stats should NOT be intercepted by /api/invoices/{id}
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestInvoicesRouterRefactoring:
    """Test suite for invoices router after Phase 4 refactoring"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_invoice_ids = []
        yield
        # Cleanup test invoices
        for inv_id in self.test_invoice_ids:
            try:
                requests.delete(f"{BASE_URL}/api/invoices/{inv_id}")
            except:
                pass
    
    # ==================== ROUTE COLLISION TESTS ====================
    
    def test_route_collision_invoices_stats_not_intercepted(self):
        """CRITICAL: /api/invoices/stats should NOT be intercepted by /api/invoices/{id}"""
        response = requests.get(f"{BASE_URL}/api/invoices/stats")
        assert response.status_code == 200, f"Route collision! /invoices/stats returned {response.status_code}: {response.text}"
        data = response.json()
        # Should return stats structure, not 404 or invoice data
        assert "total_revenue" in data or "invoice_count" in data, f"Wrong response structure: {data}"
        print("✅ Route collision test passed: /invoices/stats works correctly")
    
    def test_route_collision_invoices_stats_monthly(self):
        """CRITICAL: /api/invoices/stats/monthly should work"""
        response = requests.get(f"{BASE_URL}/api/invoices/stats/monthly")
        assert response.status_code == 200, f"Route collision! /invoices/stats/monthly returned {response.status_code}"
        data = response.json()
        assert "total_revenue" in data or "by_department" in data, f"Wrong response: {data}"
        print("✅ Route collision test passed: /invoices/stats/monthly works correctly")
    
    # ==================== POST /api/invoices ====================
    
    def test_create_invoice_success(self):
        """POST /api/invoices creates invoice with generated invoice_number (EM-YYYYMMDD-XXXX)"""
        payload = {
            "customer_name": "TEST_Client Refactoring",
            "customer_phone": "99001122",
            "items": [
                {"id": "item1", "name": "Coca-Cola", "price": 1000, "quantity": 2, "department": "bar", "unit": "bouteille"},
                {"id": "item2", "name": "Pizza", "price": 5000, "quantity": 1, "department": "salle_jardin", "unit": "portion"}
            ],
            "subtotal": 7000,
            "discount": 0,
            "discount_amount": 0,
            "total": 7000,
            "payment_method": "cash",
            "totals_by_department": {"bar": 2000, "salle_jardin": 5000},
            "notes": "Test refactoring Phase 4",
            "created_by": "TestAgent",
            "validation_status": "pending",
            "table_number": 5
        }
        
        response = requests.post(f"{BASE_URL}/api/invoices", json=payload)
        assert response.status_code == 200, f"Create invoice failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert data.get("success") == True, f"Response not successful: {data}"
        assert "invoice" in data, f"No invoice in response: {data}"
        
        invoice = data["invoice"]
        assert "id" in invoice, "Invoice missing id"
        assert "invoice_number" in invoice, "Invoice missing invoice_number"
        
        # Verify invoice_number format: EM-YYYYMMDD-XXXX
        inv_num = invoice["invoice_number"]
        assert inv_num.startswith("EM-"), f"Invoice number should start with EM-: {inv_num}"
        today = datetime.now().strftime("%Y%m%d")
        assert today in inv_num, f"Invoice number should contain today's date {today}: {inv_num}"
        
        self.test_invoice_ids.append(invoice["id"])
        print(f"✅ Create invoice success: {inv_num}")
        return invoice["id"]
    
    # ==================== GET /api/invoices ====================
    
    def test_get_invoices_list(self):
        """GET /api/invoices returns list of invoices"""
        response = requests.get(f"{BASE_URL}/api/invoices")
        assert response.status_code == 200, f"Get invoices failed: {response.status_code}"
        
        data = response.json()
        assert "invoices" in data, f"No invoices key in response: {data}"
        assert isinstance(data["invoices"], list), "Invoices should be a list"
        print(f"✅ Get invoices list: {len(data['invoices'])} invoices")
    
    def test_get_invoices_filter_by_date(self):
        """GET /api/invoices?date=YYYY-MM-DD filters by date"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/invoices", params={"date": today})
        assert response.status_code == 200, f"Get invoices by date failed: {response.status_code}"
        
        data = response.json()
        assert "invoices" in data, f"No invoices key: {data}"
        print(f"✅ Get invoices by date ({today}): {len(data['invoices'])} invoices")
    
    def test_get_invoices_filter_by_date_range(self):
        """GET /api/invoices?date_from=X&date_to=Y filters by date range"""
        today = datetime.now().strftime("%Y-%m-%d")
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        
        response = requests.get(f"{BASE_URL}/api/invoices", params={
            "date_from": yesterday,
            "date_to": today
        })
        assert response.status_code == 200, f"Get invoices by date range failed: {response.status_code}"
        
        data = response.json()
        assert "invoices" in data, f"No invoices key: {data}"
        print(f"✅ Get invoices by date range ({yesterday} to {today}): {len(data['invoices'])} invoices")
    
    def test_get_invoices_server_role_filter(self):
        """GET /api/invoices with role=server returns validated + own pending"""
        response = requests.get(f"{BASE_URL}/api/invoices", params={
            "role": "server",
            "created_by": "TestServer"
        })
        assert response.status_code == 200, f"Get invoices for server failed: {response.status_code}"
        
        data = response.json()
        assert "invoices" in data, f"No invoices key: {data}"
        print(f"✅ Get invoices for server role: {len(data['invoices'])} invoices")
    
    # ==================== GET /api/invoices/{id} ====================
    
    def test_get_invoice_by_id_success(self):
        """GET /api/invoices/{id} returns single invoice"""
        # First create an invoice
        payload = {
            "customer_name": "TEST_GetById",
            "items": [{"id": "i1", "name": "Test Item", "price": 1000, "quantity": 1, "department": "bar", "unit": "u"}],
            "subtotal": 1000,
            "total": 1000,
            "payment_method": "cash",
            "created_by": "TestAgent"
        }
        create_resp = requests.post(f"{BASE_URL}/api/invoices", json=payload)
        assert create_resp.status_code == 200
        invoice_id = create_resp.json()["invoice"]["id"]
        self.test_invoice_ids.append(invoice_id)
        
        # Get by ID
        response = requests.get(f"{BASE_URL}/api/invoices/{invoice_id}")
        assert response.status_code == 200, f"Get invoice by ID failed: {response.status_code}"
        
        data = response.json()
        assert data.get("id") == invoice_id, f"Wrong invoice returned: {data}"
        assert data.get("customer_name") == "TEST_GetById", f"Wrong customer name: {data}"
        print(f"✅ Get invoice by ID success: {invoice_id}")
    
    def test_get_invoice_by_id_not_found(self):
        """GET /api/invoices/{id} returns 404 for invalid ID"""
        fake_id = str(uuid.uuid4())
        response = requests.get(f"{BASE_URL}/api/invoices/{fake_id}")
        assert response.status_code == 404, f"Should return 404, got {response.status_code}"
        print("✅ Get invoice by invalid ID returns 404")
    
    # ==================== PUT /api/invoices/{id} ====================
    
    def test_update_invoice_basic(self):
        """PUT /api/invoices/{id} updates invoice fields"""
        # Create invoice
        payload = {
            "customer_name": "TEST_UpdateBasic",
            "items": [{"id": "i1", "name": "Item", "price": 2000, "quantity": 1, "department": "bar", "unit": "u"}],
            "subtotal": 2000,
            "total": 2000,
            "payment_method": "cash",
            "created_by": "TestAgent",
            "validation_status": "pending"
        }
        create_resp = requests.post(f"{BASE_URL}/api/invoices", json=payload)
        invoice_id = create_resp.json()["invoice"]["id"]
        self.test_invoice_ids.append(invoice_id)
        
        # Update
        update_payload = {
            "customer_name": "TEST_UpdateBasic_Modified",
            "notes": "Updated notes"
        }
        response = requests.put(f"{BASE_URL}/api/invoices/{invoice_id}", json=update_payload)
        assert response.status_code == 200, f"Update failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert data.get("success") == True, f"Update not successful: {data}"
        
        # Verify update
        get_resp = requests.get(f"{BASE_URL}/api/invoices/{invoice_id}")
        updated = get_resp.json()
        assert updated.get("customer_name") == "TEST_UpdateBasic_Modified", f"Name not updated: {updated}"
        assert updated.get("notes") == "Updated notes", f"Notes not updated: {updated}"
        print("✅ Update invoice basic fields success")
    
    def test_update_invoice_not_found(self):
        """PUT /api/invoices/{id} returns 404 for invalid ID"""
        fake_id = str(uuid.uuid4())
        response = requests.put(f"{BASE_URL}/api/invoices/{fake_id}", json={"notes": "test"})
        assert response.status_code == 404, f"Should return 404, got {response.status_code}"
        print("✅ Update invoice with invalid ID returns 404")
    
    # ==================== DELETE /api/invoices/{id} ====================
    
    def test_delete_invoice_success(self):
        """DELETE /api/invoices/{id} deletes invoice"""
        # Create invoice
        payload = {
            "customer_name": "TEST_ToDelete",
            "items": [{"id": "i1", "name": "Item", "price": 1000, "quantity": 1, "department": "bar", "unit": "u"}],
            "subtotal": 1000,
            "total": 1000,
            "payment_method": "cash",
            "created_by": "TestAgent"
        }
        create_resp = requests.post(f"{BASE_URL}/api/invoices", json=payload)
        invoice_id = create_resp.json()["invoice"]["id"]
        
        # Delete
        response = requests.delete(f"{BASE_URL}/api/invoices/{invoice_id}")
        assert response.status_code == 200, f"Delete failed: {response.status_code}"
        
        data = response.json()
        assert data.get("success") == True, f"Delete not successful: {data}"
        
        # Verify deleted
        get_resp = requests.get(f"{BASE_URL}/api/invoices/{invoice_id}")
        assert get_resp.status_code == 404, "Invoice should be deleted"
        print("✅ Delete invoice success")
    
    def test_delete_invoice_not_found(self):
        """DELETE /api/invoices/{id} returns 404 for invalid ID"""
        fake_id = str(uuid.uuid4())
        response = requests.delete(f"{BASE_URL}/api/invoices/{fake_id}")
        assert response.status_code == 404, f"Should return 404, got {response.status_code}"
        print("✅ Delete invoice with invalid ID returns 404")
    
    # ==================== PUT /api/invoices/{id}/update-items ====================
    
    def test_update_items_requires_modification_allowed(self):
        """PUT /api/invoices/{id}/update-items requires modification_allowed=true"""
        # Create invoice without modification_allowed
        payload = {
            "customer_name": "TEST_UpdateItems",
            "items": [{"id": "i1", "name": "Item", "price": 1000, "quantity": 1, "department": "bar", "unit": "u"}],
            "subtotal": 1000,
            "total": 1000,
            "payment_method": "cash",
            "created_by": "TestAgent"
        }
        create_resp = requests.post(f"{BASE_URL}/api/invoices", json=payload)
        invoice_id = create_resp.json()["invoice"]["id"]
        self.test_invoice_ids.append(invoice_id)
        
        # Try to update items (should fail - modification_allowed is false by default)
        update_payload = {
            "items": [{"id": "i2", "name": "New Item", "price": 2000, "quantity": 1, "department": "bar", "unit": "u"}]
        }
        response = requests.put(f"{BASE_URL}/api/invoices/{invoice_id}/update-items", json=update_payload)
        assert response.status_code == 403, f"Should return 403, got {response.status_code}: {response.text}"
        print("✅ Update items requires modification_allowed=true")
    
    # ==================== GET /api/invoices/{id}/pdf ====================
    
    def test_generate_pdf_success(self):
        """GET /api/invoices/{id}/pdf generates PDF with correct content-type"""
        # Create invoice
        payload = {
            "customer_name": "TEST_PDF_Generation",
            "customer_phone": "99887766",
            "items": [
                {"id": "i1", "name": "Coca-Cola", "price": 1000, "quantity": 2, "department": "bar", "unit": "bouteille"},
                {"id": "i2", "name": "Pizza Maxo", "price": 5500, "quantity": 1, "department": "salle_jardin", "unit": "portion"}
            ],
            "subtotal": 7500,
            "discount": 10,
            "discount_amount": 750,
            "total": 6750,
            "payment_method": "mobile",
            "totals_by_department": {"bar": 2000, "salle_jardin": 5500},
            "created_by": "TestAgent"
        }
        create_resp = requests.post(f"{BASE_URL}/api/invoices", json=payload)
        invoice = create_resp.json()["invoice"]
        invoice_id = invoice["id"]
        self.test_invoice_ids.append(invoice_id)
        
        # Generate PDF
        response = requests.get(f"{BASE_URL}/api/invoices/{invoice_id}/pdf")
        assert response.status_code == 200, f"PDF generation failed: {response.status_code} - {response.text}"
        
        # Check content type
        content_type = response.headers.get("content-type", "")
        assert "application/pdf" in content_type, f"Wrong content-type: {content_type}"
        
        # Check content-disposition header for filename
        content_disp = response.headers.get("content-disposition", "")
        assert "attachment" in content_disp, f"Missing attachment disposition: {content_disp}"
        assert "facture_" in content_disp, f"Missing facture_ in filename: {content_disp}"
        
        # Check PDF content starts with %PDF
        assert response.content[:4] == b'%PDF', "Response is not a valid PDF"
        
        print(f"✅ PDF generation success: {len(response.content)} bytes, filename in {content_disp}")
    
    def test_generate_pdf_not_found(self):
        """GET /api/invoices/{id}/pdf returns 404 for invalid ID"""
        fake_id = str(uuid.uuid4())
        response = requests.get(f"{BASE_URL}/api/invoices/{fake_id}/pdf")
        assert response.status_code == 404, f"Should return 404, got {response.status_code}"
        print("✅ PDF generation with invalid ID returns 404")
    
    # ==================== PUT /api/invoices/{id}/assign-week ====================
    
    def test_assign_week_success(self):
        """PUT /api/invoices/{id}/assign-week assigns invoice to a week"""
        # Create invoice
        payload = {
            "customer_name": "TEST_AssignWeek",
            "items": [{"id": "i1", "name": "Item", "price": 1000, "quantity": 1, "department": "bar", "unit": "u"}],
            "subtotal": 1000,
            "total": 1000,
            "payment_method": "cash",
            "created_by": "TestAgent"
        }
        create_resp = requests.post(f"{BASE_URL}/api/invoices", json=payload)
        invoice_id = create_resp.json()["invoice"]["id"]
        self.test_invoice_ids.append(invoice_id)
        
        # Assign to a week (Monday of current week)
        today = datetime.now()
        monday = today - timedelta(days=today.weekday())
        week_start = monday.strftime("%Y-%m-%d")
        
        response = requests.put(
            f"{BASE_URL}/api/invoices/{invoice_id}/assign-week",
            json={"week_start": week_start}
        )
        assert response.status_code == 200, f"Assign week failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert data.get("success") == True, f"Assign week not successful: {data}"
        
        # Verify assignment
        get_resp = requests.get(f"{BASE_URL}/api/invoices/{invoice_id}")
        updated = get_resp.json()
        assert updated.get("assigned_week") == week_start, f"Week not assigned: {updated}"
        print(f"✅ Assign week success: {week_start}")
    
    def test_assign_week_not_found(self):
        """PUT /api/invoices/{id}/assign-week returns 404 for invalid ID"""
        fake_id = str(uuid.uuid4())
        response = requests.put(
            f"{BASE_URL}/api/invoices/{fake_id}/assign-week",
            json={"week_start": "2025-01-06"}
        )
        assert response.status_code == 404, f"Should return 404, got {response.status_code}"
        print("✅ Assign week with invalid ID returns 404")
    
    # ==================== POST /api/invoices/assign-week-bulk ====================
    
    def test_assign_week_bulk_success(self):
        """POST /api/invoices/assign-week-bulk assigns multiple invoices"""
        # Create 2 invoices
        invoice_ids = []
        for i in range(2):
            payload = {
                "customer_name": f"TEST_BulkAssign_{i}",
                "items": [{"id": "i1", "name": "Item", "price": 1000, "quantity": 1, "department": "bar", "unit": "u"}],
                "subtotal": 1000,
                "total": 1000,
                "payment_method": "cash",
                "created_by": "TestAgent"
            }
            create_resp = requests.post(f"{BASE_URL}/api/invoices", json=payload)
            inv_id = create_resp.json()["invoice"]["id"]
            invoice_ids.append(inv_id)
            self.test_invoice_ids.append(inv_id)
        
        # Bulk assign
        today = datetime.now()
        monday = today - timedelta(days=today.weekday())
        week_start = monday.strftime("%Y-%m-%d")
        
        response = requests.post(
            f"{BASE_URL}/api/invoices/assign-week-bulk",
            json={"ids": invoice_ids, "week_start": week_start}
        )
        assert response.status_code == 200, f"Bulk assign failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert data.get("success") == True, f"Bulk assign not successful: {data}"
        assert data.get("modified") == 2, f"Should modify 2 invoices: {data}"
        print(f"✅ Bulk assign week success: {data.get('modified')} invoices")
    
    # ==================== POST /api/invoices/unassign-week-bulk ====================
    
    def test_unassign_week_bulk_success(self):
        """POST /api/invoices/unassign-week-bulk removes week assignment"""
        # Create and assign invoice
        payload = {
            "customer_name": "TEST_BulkUnassign",
            "items": [{"id": "i1", "name": "Item", "price": 1000, "quantity": 1, "department": "bar", "unit": "u"}],
            "subtotal": 1000,
            "total": 1000,
            "payment_method": "cash",
            "created_by": "TestAgent"
        }
        create_resp = requests.post(f"{BASE_URL}/api/invoices", json=payload)
        invoice_id = create_resp.json()["invoice"]["id"]
        self.test_invoice_ids.append(invoice_id)
        
        # First assign
        today = datetime.now()
        monday = today - timedelta(days=today.weekday())
        week_start = monday.strftime("%Y-%m-%d")
        requests.put(
            f"{BASE_URL}/api/invoices/{invoice_id}/assign-week",
            json={"week_start": week_start}
        )
        
        # Bulk unassign
        response = requests.post(
            f"{BASE_URL}/api/invoices/unassign-week-bulk",
            json={"ids": [invoice_id]}
        )
        assert response.status_code == 200, f"Bulk unassign failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert data.get("success") == True, f"Bulk unassign not successful: {data}"
        
        # Verify unassignment
        get_resp = requests.get(f"{BASE_URL}/api/invoices/{invoice_id}")
        updated = get_resp.json()
        assert updated.get("assigned_week") in [None, ""], f"Week should be unassigned: {updated}"
        print("✅ Bulk unassign week success")


class TestOtherEndpointsRegression:
    """Test that other endpoints still work after refactoring"""
    
    def test_analytics_dashboard(self):
        """GET /api/analytics/dashboard still works"""
        response = requests.get(f"{BASE_URL}/api/analytics/dashboard")
        assert response.status_code == 200, f"Analytics dashboard failed: {response.status_code}"
        data = response.json()
        assert "current" in data or "total_revenue" in data, f"Wrong structure: {data}"
        print("✅ Analytics dashboard works")
    
    def test_reports_revenue_by_payment(self):
        """GET /api/reports/revenue-by-payment still works"""
        response = requests.get(f"{BASE_URL}/api/reports/revenue-by-payment")
        assert response.status_code == 200, f"Revenue by payment failed: {response.status_code}"
        data = response.json()
        assert "total" in data or "by_method" in data, f"Wrong structure: {data}"
        print("✅ Revenue by payment works")
    
    def test_financial_points(self):
        """GET /api/financial-points still works"""
        response = requests.get(f"{BASE_URL}/api/financial-points")
        assert response.status_code == 200, f"Financial points failed: {response.status_code}"
        print("✅ Financial points works")
    
    def test_caisse_users(self):
        """GET /api/caisse/users still works"""
        response = requests.get(f"{BASE_URL}/api/caisse/users")
        assert response.status_code == 200, f"Caisse users failed: {response.status_code}"
        data = response.json()
        assert "users" in data, f"Wrong structure: {data}"
        print("✅ Caisse users works")
    
    def test_caisse_login_admin(self):
        """POST /api/caisse/login with admin password works"""
        response = requests.post(f"{BASE_URL}/api/caisse/login", json={"password": "Caisse2026"})
        assert response.status_code == 200, f"Admin login failed: {response.status_code}"
        data = response.json()
        assert data.get("success") == True, f"Login not successful: {data}"
        assert data.get("user", {}).get("role") == "admin", f"Wrong role: {data}"
        print("✅ Caisse admin login works")
    
    def test_caisse_login_manager(self):
        """POST /api/caisse/login with manager PIN works"""
        response = requests.post(f"{BASE_URL}/api/caisse/login", json={"pin": "2468"})
        assert response.status_code == 200, f"Manager login failed: {response.status_code}"
        data = response.json()
        assert data.get("success") == True, f"Login not successful: {data}"
        assert data.get("user", {}).get("role") == "manager", f"Wrong role: {data}"
        print("✅ Caisse manager login works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
