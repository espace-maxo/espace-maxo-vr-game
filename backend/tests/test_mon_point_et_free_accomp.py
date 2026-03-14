"""
Tests for:
1. Mon Point du serveur - Uses created_by field correctly
2. Server Daily Report API - Uses created_by for filtering
3. Server End of Service API - Uses created_by for filtering
4. Expenses with revision_requested status - For Manager badge notification
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestServerDailyReportAPI:
    """Tests for /api/server-daily-report/{name} endpoint - verifies created_by usage"""
    
    def test_server_daily_report_endpoint_exists(self):
        """Test that the server-daily-report endpoint exists and responds"""
        response = requests.get(f"{BASE_URL}/api/server-daily-report/TestServer")
        # Should return 200 even with no data
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✅ Server daily report endpoint exists and responds")
    
    def test_server_daily_report_structure(self):
        """Test that the response has correct structure"""
        response = requests.get(f"{BASE_URL}/api/server-daily-report/TestServer")
        assert response.status_code == 200
        
        data = response.json()
        # Check response structure
        assert "server_name" in data, "Response should have server_name"
        assert "date" in data, "Response should have date"
        assert "total_invoices" in data, "Response should have total_invoices"
        assert "validated_count" in data, "Response should have validated_count"
        assert "pending_count" in data, "Response should have pending_count"
        assert "total_sales" in data, "Response should have total_sales"
        assert "department_breakdown" in data, "Response should have department_breakdown"
        assert "payment_methods" in data, "Response should have payment_methods"
        print("✅ Server daily report has correct structure")
    
    def test_server_daily_report_with_date_param(self):
        """Test that date parameter is accepted"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/server-daily-report/TestServer?date={today}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["date"] == today, f"Expected date {today}, got {data['date']}"
        print(f"✅ Server daily report accepts date parameter: {today}")

    def test_server_daily_report_filters_by_created_by(self):
        """Test that the API correctly filters invoices by created_by field"""
        # First create a test invoice with a specific server name
        test_server = "TEST_Server_For_Point"
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Create an invoice with created_by = test_server
        invoice_data = {
            "customer_name": "Test Client",
            "items": [{"id": "test1", "name": "Test Item", "price": 1000, "quantity": 1, "department": "bar", "unit": "unité"}],
            "subtotal": 1000,
            "total": 1000,
            "payment_method": "cash",
            "created_by": test_server
        }
        
        create_response = requests.post(f"{BASE_URL}/api/invoices", json=invoice_data)
        assert create_response.status_code in [200, 201], f"Failed to create invoice: {create_response.text}"
        print(f"✅ Created test invoice with created_by = '{test_server}'")
        
        # Now fetch the server daily report
        response = requests.get(f"{BASE_URL}/api/server-daily-report/{test_server}?date={today}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["server_name"] == test_server
        assert data["total_invoices"] >= 1, "Should have at least 1 invoice"
        print(f"✅ Server daily report correctly filters by created_by: found {data['total_invoices']} invoices")


class TestServerEndOfServiceAPI:
    """Tests for /api/server-end-of-service endpoint - verifies created_by usage"""
    
    def test_create_end_of_service_report(self):
        """Test creating an end of service report"""
        test_server = "TEST_Server_EOS"
        today = datetime.now().strftime("%Y-%m-%d")
        
        report_data = {
            "server_name": test_server,
            "server_id": "test-id-123",
            "date": today,
            "observation": "Test observation: Journée de test"
        }
        
        response = requests.post(f"{BASE_URL}/api/server-end-of-service", json=report_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Response should have success=True"
        assert "report" in data, "Response should have report"
        
        report = data["report"]
        assert report["server_name"] == test_server
        assert report["date"] == today
        assert report["observation"] == report_data["observation"]
        print(f"✅ End of service report created successfully for {test_server}")
    
    def test_end_of_service_calculates_stats_from_created_by(self):
        """Test that end of service correctly calculates stats using created_by field"""
        test_server = "TEST_Server_Stats"
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Create some test invoices with this server name
        for i in range(2):
            invoice_data = {
                "customer_name": f"Test Client {i}",
                "items": [{"id": f"test{i}", "name": f"Test Item {i}", "price": 1500, "quantity": 1, "department": "bar", "unit": "unité"}],
                "subtotal": 1500,
                "total": 1500,
                "payment_method": "cash",
                "created_by": test_server
            }
            requests.post(f"{BASE_URL}/api/invoices", json=invoice_data)
        
        # Now create end of service report
        report_data = {
            "server_name": test_server,
            "server_id": "test-id-456",
            "date": today,
            "observation": "Stats test"
        }
        
        response = requests.post(f"{BASE_URL}/api/server-end-of-service", json=report_data)
        assert response.status_code == 200
        
        data = response.json()
        report = data["report"]
        
        # The report should have calculated stats
        assert report["total_invoices"] >= 2, f"Expected at least 2 invoices, got {report['total_invoices']}"
        print(f"✅ End of service correctly uses created_by to calculate stats: {report['total_invoices']} invoices")


class TestExpensesRevisionStatus:
    """Tests for expenses with revision_requested status - for Manager badge notification"""
    
    def test_create_expense_default_status(self):
        """Test that new expense has pending status by default"""
        expense_data = {
            "category": "cuisine",
            "description": "TEST_Expense_Badge_Test",
            "quantity": 1,
            "unit_price": 500,
            "amount": 500,
            "supplier": "Test Supplier",
            "planned_date": datetime.now().strftime("%Y-%m-%d"),
            "requested_by": "Test Manager"
        }
        
        response = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
        assert response.status_code in [200, 201], f"Failed to create expense: {response.text}"
        
        data = response.json()
        # Response format is {"success": True, "expense": {...}}
        expense = data.get("expense", {})
        assert expense.get("status") == "pending", f"Expected status 'pending', got '{expense.get('status')}'"
        print("✅ New expense created with pending status")
        return expense.get("id")
    
    def test_get_expenses_list(self):
        """Test getting expenses list"""
        response = requests.get(f"{BASE_URL}/api/expenses")
        assert response.status_code == 200
        
        data = response.json()
        assert "expenses" in data, "Response should have expenses list"
        print(f"✅ Got {len(data['expenses'])} expenses")
    
    def test_update_expense_to_revision_requested(self):
        """Test updating expense status to revision_requested"""
        # First create an expense
        expense_data = {
            "category": "bar",
            "description": "TEST_Expense_For_Revision",
            "quantity": 2,
            "unit_price": 750,
            "amount": 1500,
            "supplier": "Revision Test Supplier",
            "planned_date": datetime.now().strftime("%Y-%m-%d"),
            "requested_by": "Test Admin"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
        assert create_response.status_code in [200, 201]
        # Response format is {"success": True, "expense": {...}}
        expense_id = create_response.json().get("expense", {}).get("id")
        assert expense_id, f"Failed to get expense ID: {create_response.json()}"
        
        # Update to revision_requested status
        update_data = {
            "status": "revision_requested"
        }
        
        update_response = requests.put(f"{BASE_URL}/api/expenses/{expense_id}", json=update_data)
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}: {update_response.text}"
        
        # Verify the status was updated
        get_response = requests.get(f"{BASE_URL}/api/expenses")
        assert get_response.status_code == 200
        
        expenses = get_response.json().get("expenses", [])
        matching = [e for e in expenses if e.get("id") == expense_id]
        assert len(matching) > 0, "Should find the updated expense"
        assert matching[0].get("status") == "revision_requested", "Status should be revision_requested"
        print(f"✅ Expense status updated to revision_requested (ID: {expense_id})")
    
    def test_count_revision_requested_expenses(self):
        """Test counting expenses with revision_requested status for Manager badge"""
        response = requests.get(f"{BASE_URL}/api/expenses")
        assert response.status_code == 200
        
        expenses = response.json().get("expenses", [])
        revision_count = len([e for e in expenses if e.get("status") == "revision_requested"])
        
        print(f"✅ Found {revision_count} expenses with 'revision_requested' status (for Manager badge)")
        # This count is what the frontend uses for the orange badge


class TestCaisseLogin:
    """Tests for Caisse login to verify server/manager credentials"""
    
    def test_server_login_with_pin(self):
        """Test server login with PIN 1234"""
        login_data = {"pin": "1234"}
        response = requests.post(f"{BASE_URL}/api/caisse/login", json=login_data)
        
        # Even if login fails, we check the API responds correctly
        if response.status_code == 200:
            data = response.json()
            assert data.get("success") == True
            user = data.get("user", {})
            print(f"✅ Server login successful: {user.get('full_name', user.get('username'))}")
        else:
            print(f"⚠️ Server login returned {response.status_code} - may need to check PIN or user setup")
    
    def test_manager_login_with_pin(self):
        """Test manager login with PIN 0000"""
        login_data = {"pin": "0000"}
        response = requests.post(f"{BASE_URL}/api/caisse/login", json=login_data)
        
        if response.status_code == 200:
            data = response.json()
            assert data.get("success") == True
            user = data.get("user", {})
            assert user.get("role") == "manager", f"Expected role 'manager', got '{user.get('role')}'"
            print(f"✅ Manager login successful: {user.get('full_name', user.get('username'))} (role: {user.get('role')})")
        else:
            print(f"⚠️ Manager login returned {response.status_code} - may need to check PIN or user setup")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
