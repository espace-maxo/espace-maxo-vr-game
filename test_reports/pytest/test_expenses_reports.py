"""
Backend tests for Expenses/Purchases management and Reports endpoints
Testing: /api/expenses, /api/reports/weekly, /api/reports/activity
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestExpenseEndpoints:
    """Tests for /api/expenses CRUD operations"""
    
    created_expense_id = None
    
    def test_get_expenses_empty(self):
        """GET /api/expenses - should return list (may be empty initially)"""
        response = requests.get(f"{BASE_URL}/api/expenses")
        print(f"GET /api/expenses: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        assert "expenses" in data
        assert isinstance(data["expenses"], list)
        print(f"Found {len(data['expenses'])} existing expenses")
    
    def test_create_expense_cuisine(self):
        """POST /api/expenses - create a new expense request for cuisine"""
        expense_data = {
            "category": "cuisine",
            "description": "TEST_Achats de tomates et légumes",
            "amount": 15000,
            "supplier": "Marché Dantokpa",
            "planned_date": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d"),
            "requested_by": "TEST_Manager"
        }
        response = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
        print(f"POST /api/expenses: {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("success") == True
        assert "expense" in data
        assert data["expense"]["category"] == "cuisine"
        assert data["expense"]["description"] == "TEST_Achats de tomates et légumes"
        assert data["expense"]["amount"] == 15000
        assert data["expense"]["status"] == "pending"
        assert "id" in data["expense"]
        
        TestExpenseEndpoints.created_expense_id = data["expense"]["id"]
        print(f"Created expense ID: {TestExpenseEndpoints.created_expense_id}")
    
    def test_create_expense_bar(self):
        """POST /api/expenses - create expense for bar category"""
        expense_data = {
            "category": "bar",
            "description": "TEST_Achat de boissons sodas",
            "amount": 25000,
            "supplier": "Distributeur Coca-Cola",
            "requested_by": "TEST_Manager"
        }
        response = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
        print(f"POST /api/expenses (bar): {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        assert data["expense"]["category"] == "bar"
        print(f"Created bar expense")
    
    def test_create_expense_jeux(self):
        """POST /api/expenses - create expense for jeux category"""
        expense_data = {
            "category": "jeux",
            "description": "TEST_Maintenance simulateur VR",
            "amount": 50000,
            "supplier": "Tech VR Benin",
            "requested_by": "TEST_Manager"
        }
        response = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
        print(f"POST /api/expenses (jeux): {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        assert data["expense"]["category"] == "jeux"
        print(f"Created jeux expense")
    
    def test_get_expenses_with_created(self):
        """GET /api/expenses - verify created expenses are returned"""
        response = requests.get(f"{BASE_URL}/api/expenses")
        assert response.status_code == 200
        data = response.json()
        
        # Find our test expenses
        test_expenses = [e for e in data["expenses"] if "TEST_" in e.get("description", "")]
        print(f"Found {len(test_expenses)} TEST_ expenses")
        assert len(test_expenses) >= 1
    
    def test_filter_expenses_by_status(self):
        """GET /api/expenses?status=pending - filter by status"""
        response = requests.get(f"{BASE_URL}/api/expenses", params={"status": "pending"})
        print(f"GET /api/expenses?status=pending: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        
        # All returned expenses should have pending status
        for expense in data["expenses"]:
            assert expense.get("status") == "pending"
        print(f"Found {len(data['expenses'])} pending expenses")
    
    def test_filter_expenses_by_category(self):
        """GET /api/expenses?category=cuisine - filter by category"""
        response = requests.get(f"{BASE_URL}/api/expenses", params={"category": "cuisine"})
        print(f"GET /api/expenses?category=cuisine: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        
        for expense in data["expenses"]:
            assert expense.get("category") == "cuisine"
        print(f"Found {len(data['expenses'])} cuisine expenses")
    
    def test_update_expense_approve(self):
        """PUT /api/expenses/{id} - approve expense by admin"""
        if not TestExpenseEndpoints.created_expense_id:
            pytest.skip("No expense ID to update")
        
        update_data = {
            "status": "approved",
            "approved_by": "TEST_Admin"
        }
        response = requests.put(
            f"{BASE_URL}/api/expenses/{TestExpenseEndpoints.created_expense_id}", 
            json=update_data
        )
        print(f"PUT /api/expenses/{TestExpenseEndpoints.created_expense_id}: {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("success") == True
        assert data["expense"]["status"] == "approved"
        assert data["expense"].get("approved_at") is not None
        print("Expense approved successfully")
    
    def test_update_expense_revision_requested(self):
        """PUT /api/expenses/{id} - admin requests revision"""
        # Create a new expense to request revision
        expense_data = {
            "category": "autres",
            "description": "TEST_Needs revision expense",
            "amount": 10000,
            "requested_by": "TEST_Manager"
        }
        create_resp = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
        assert create_resp.status_code == 200
        expense_id = create_resp.json()["expense"]["id"]
        
        # Admin requests revision
        update_data = {
            "status": "revision_requested",
            "admin_notes": "Veuillez préciser le fournisseur"
        }
        response = requests.put(f"{BASE_URL}/api/expenses/{expense_id}", json=update_data)
        print(f"PUT /api/expenses (revision): {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["expense"]["status"] == "revision_requested"
        assert data["expense"]["admin_notes"] == "Veuillez préciser le fournisseur"
        print("Revision requested successfully")
    
    def test_update_expense_complete(self):
        """PUT /api/expenses/{id} - mark expense as completed"""
        if not TestExpenseEndpoints.created_expense_id:
            pytest.skip("No expense ID to update")
        
        update_data = {
            "status": "completed"
        }
        response = requests.put(
            f"{BASE_URL}/api/expenses/{TestExpenseEndpoints.created_expense_id}", 
            json=update_data
        )
        print(f"PUT /api/expenses (complete): {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["expense"]["status"] == "completed"
        assert data["expense"].get("completed_at") is not None
        print("Expense marked as completed")
    
    def test_delete_expense(self):
        """DELETE /api/expenses/{id} - delete an expense"""
        # Create an expense to delete
        expense_data = {
            "category": "autres",
            "description": "TEST_To be deleted expense",
            "amount": 5000,
            "requested_by": "TEST_Manager"
        }
        create_resp = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
        assert create_resp.status_code == 200
        expense_id = create_resp.json()["expense"]["id"]
        
        # Delete
        response = requests.delete(f"{BASE_URL}/api/expenses/{expense_id}")
        print(f"DELETE /api/expenses/{expense_id}: {response.status_code}")
        assert response.status_code == 200
        assert response.json().get("success") == True
        print("Expense deleted successfully")
        
        # Verify deletion
        get_resp = requests.get(f"{BASE_URL}/api/expenses")
        deleted = [e for e in get_resp.json()["expenses"] if e.get("id") == expense_id]
        assert len(deleted) == 0
        print("Deletion verified - expense not found in list")
    
    def test_delete_expense_not_found(self):
        """DELETE /api/expenses/{id} - delete non-existent expense returns 404"""
        response = requests.delete(f"{BASE_URL}/api/expenses/non-existent-id-12345")
        print(f"DELETE /api/expenses/non-existent: {response.status_code}")
        assert response.status_code == 404
        print("Correctly returned 404 for non-existent expense")


class TestWeeklyReport:
    """Tests for /api/reports/weekly endpoint"""
    
    def test_get_weekly_report_default(self):
        """GET /api/reports/weekly - get current week report"""
        response = requests.get(f"{BASE_URL}/api/reports/weekly")
        print(f"GET /api/reports/weekly: {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        # Verify response structure
        assert "week_start" in data
        assert "week_end" in data
        assert "sales" in data
        assert "expenses" in data
        assert "result" in data
        assert "is_profitable" in data
        
        # Verify sales structure
        assert "total" in data["sales"]
        assert "count" in data["sales"]
        assert "daily" in data["sales"]
        
        # Verify expenses structure
        assert "total" in data["expenses"]
        assert "count" in data["expenses"]
        assert "by_category" in data["expenses"]
        
        print(f"Week: {data['week_start']} to {data['week_end']}")
        print(f"Sales: {data['sales']['total']} F ({data['sales']['count']} factures)")
        print(f"Expenses: {data['expenses']['total']} F ({data['expenses']['count']} achats)")
        print(f"Result: {data['result']} F (Profitable: {data['is_profitable']})")
    
    def test_get_weekly_report_with_date(self):
        """GET /api/reports/weekly?week_start=2025-01-06 - get specific week"""
        week_start = "2025-01-06"
        response = requests.get(f"{BASE_URL}/api/reports/weekly", params={"week_start": week_start})
        print(f"GET /api/reports/weekly?week_start={week_start}: {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        assert "sales" in data
        assert "expenses" in data
        print(f"Week report retrieved for {week_start}")
    
    def test_weekly_report_result_calculation(self):
        """Verify result = sales - expenses"""
        response = requests.get(f"{BASE_URL}/api/reports/weekly")
        assert response.status_code == 200
        
        data = response.json()
        calculated_result = data["sales"]["total"] - data["expenses"]["total"]
        
        # Allow small float precision difference
        assert abs(data["result"] - calculated_result) < 0.01
        print(f"Result calculation verified: {data['sales']['total']} - {data['expenses']['total']} = {data['result']}")


class TestActivityReport:
    """Tests for /api/reports/activity endpoint (Admin suivi d'activité)"""
    
    def test_get_activity_report_day(self):
        """GET /api/reports/activity?period=day - daily activity report"""
        response = requests.get(f"{BASE_URL}/api/reports/activity", params={"period": "day"})
        print(f"GET /api/reports/activity?period=day: {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        # Verify response structure
        assert data["period"] == "day"
        assert "period_label" in data
        assert "start_date" in data
        assert "end_date" in data
        assert "income" in data
        assert "expenses" in data
        assert "result" in data
        
        # Verify income structure
        assert "total" in data["income"]
        assert "caisse" in data["income"]
        assert "reservations_jeux" in data["income"]
        assert "reservations_tables" in data["income"]
        assert "combos" in data["income"]
        
        # Verify caisse details
        caisse = data["income"]["caisse"]
        assert "total" in caisse
        assert "count" in caisse
        assert "by_department" in caisse
        assert "by_payment_method" in caisse
        assert "by_server" in caisse
        
        # Verify result structure
        assert "net" in data["result"]
        assert "margin_percent" in data["result"]
        assert "is_profitable" in data["result"]
        
        print(f"Daily activity: {data['period_label']}")
        print(f"Income: {data['income']['total']} F")
        print(f"Expenses: {data['expenses']['total']} F")
        print(f"Net Result: {data['result']['net']} F ({data['result']['margin_percent']}% margin)")
    
    def test_get_activity_report_week(self):
        """GET /api/reports/activity?period=week - weekly activity report"""
        response = requests.get(f"{BASE_URL}/api/reports/activity", params={"period": "week"})
        print(f"GET /api/reports/activity?period=week: {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["period"] == "week"
        assert "Semaine" in data["period_label"]
        print(f"Weekly activity: {data['period_label']}")
    
    def test_get_activity_report_month(self):
        """GET /api/reports/activity?period=month - monthly activity report"""
        response = requests.get(f"{BASE_URL}/api/reports/activity", params={"period": "month"})
        print(f"GET /api/reports/activity?period=month: {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["period"] == "month"
        print(f"Monthly activity: {data['period_label']}")
    
    def test_get_activity_report_with_date(self):
        """GET /api/reports/activity?period=day&date=2025-03-08 - specific date"""
        target_date = "2025-03-08"
        response = requests.get(
            f"{BASE_URL}/api/reports/activity", 
            params={"period": "day", "date": target_date}
        )
        print(f"GET /api/reports/activity?date={target_date}: {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["start_date"] == target_date
        print(f"Activity report for {target_date} retrieved")
    
    def test_activity_report_income_breakdown(self):
        """Verify income breakdown adds up to total"""
        response = requests.get(f"{BASE_URL}/api/reports/activity", params={"period": "day"})
        assert response.status_code == 200
        
        data = response.json()
        income = data["income"]
        
        calculated_total = (
            income["caisse"]["total"] + 
            income["reservations_jeux"]["total"] + 
            income["reservations_tables"]["total"] + 
            income["combos"]["total"]
        )
        
        # Allow small float precision difference
        assert abs(income["total"] - calculated_total) < 0.01
        print(f"Income breakdown verified:")
        print(f"  Caisse: {income['caisse']['total']} F")
        print(f"  Réservations jeux: {income['reservations_jeux']['total']} F")
        print(f"  Réservations tables: {income['reservations_tables']['total']} F")
        print(f"  Combos: {income['combos']['total']} F")
        print(f"  Total: {income['total']} F")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_expenses(self):
        """Delete all TEST_ prefixed expenses"""
        response = requests.get(f"{BASE_URL}/api/expenses")
        assert response.status_code == 200
        
        test_expenses = [e for e in response.json()["expenses"] if "TEST_" in str(e.get("description", "")) or "TEST_" in str(e.get("requested_by", ""))]
        
        deleted_count = 0
        for expense in test_expenses:
            del_resp = requests.delete(f"{BASE_URL}/api/expenses/{expense['id']}")
            if del_resp.status_code == 200:
                deleted_count += 1
        
        print(f"Cleaned up {deleted_count} test expenses")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
