"""
Test suite for Iteration 64: Exclude from Week functionality
Bug fix: Removing purchases from weekly report should NOT delete them from the global list.
New mechanism: excluded_from_weeks[] array instead of unassigning.

Tests:
- POST /api/expenses/exclude-from-week-bulk: adds week_start to excluded_from_weeks[]
- POST /api/expenses/include-in-week-bulk: removes week_start from excluded_from_weeks[]
- POST /api/invoices/exclude-from-week-bulk: same for invoices
- POST /api/invoices/include-in-week-bulk: same for invoices
- GET /api/reports/weekly: filters out excluded items
- GET /api/expenses: still returns excluded items (they are NOT deleted)
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Calculate current week's Monday
today = datetime.now()
monday = today - timedelta(days=today.weekday())
WEEK_START = monday.strftime("%Y-%m-%d")


class TestExcludeFromWeekExpenses:
    """Test exclude/include functionality for expenses"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Create a test expense for each test"""
        self.test_expense_id = None
        yield
        # Cleanup
        if self.test_expense_id:
            try:
                requests.delete(f"{BASE_URL}/api/expenses/{self.test_expense_id}")
            except:
                pass
    
    def create_test_expense(self, amount=12345, status="completed"):
        """Helper to create a test expense"""
        response = requests.post(f"{BASE_URL}/api/expenses", json={
            "category": "TEST_ITER64",
            "description": f"TEST_ITER64_Expense_{datetime.now().timestamp()}",
            "quantity": 1,
            "unit_price": amount,
            "amount": amount,
            "requested_by": "Test User"
        })
        assert response.status_code == 200, f"Failed to create expense: {response.text}"
        expense = response.json().get("expense", {})
        self.test_expense_id = expense.get("id")
        
        # Update to completed status if needed
        if status == "completed":
            update_resp = requests.put(f"{BASE_URL}/api/expenses/{self.test_expense_id}", json={
                "status": "completed"
            })
            assert update_resp.status_code == 200
        
        return expense
    
    def test_exclude_expense_from_week_adds_to_array(self):
        """POST /api/expenses/exclude-from-week-bulk should add week_start to excluded_from_weeks[]"""
        expense = self.create_test_expense(amount=12345)
        expense_id = expense["id"]
        
        # Exclude from current week
        response = requests.post(f"{BASE_URL}/api/expenses/exclude-from-week-bulk", json={
            "ids": [expense_id],
            "week_start": WEEK_START
        })
        assert response.status_code == 200, f"Exclude failed: {response.text}"
        data = response.json()
        assert data.get("success") == True
        assert data.get("modified") >= 1
        
        # Verify the expense now has excluded_from_weeks containing WEEK_START
        get_resp = requests.get(f"{BASE_URL}/api/expenses")
        assert get_resp.status_code == 200
        expenses = get_resp.json().get("expenses", [])
        found = next((e for e in expenses if e.get("id") == expense_id), None)
        assert found is not None, "Expense should still exist in global list"
        assert WEEK_START in (found.get("excluded_from_weeks") or []), \
            f"excluded_from_weeks should contain {WEEK_START}, got: {found.get('excluded_from_weeks')}"
    
    def test_exclude_is_idempotent(self):
        """Calling exclude twice should not duplicate the week_start in the array"""
        expense = self.create_test_expense(amount=5000)
        expense_id = expense["id"]
        
        # Exclude twice
        for _ in range(2):
            response = requests.post(f"{BASE_URL}/api/expenses/exclude-from-week-bulk", json={
                "ids": [expense_id],
                "week_start": WEEK_START
            })
            assert response.status_code == 200
        
        # Verify only one entry in excluded_from_weeks
        get_resp = requests.get(f"{BASE_URL}/api/expenses")
        expenses = get_resp.json().get("expenses", [])
        found = next((e for e in expenses if e.get("id") == expense_id), None)
        excluded_weeks = found.get("excluded_from_weeks") or []
        count = excluded_weeks.count(WEEK_START)
        assert count == 1, f"Week should appear only once, found {count} times"
    
    def test_include_expense_in_week_removes_from_array(self):
        """POST /api/expenses/include-in-week-bulk should remove week_start from excluded_from_weeks[]"""
        expense = self.create_test_expense(amount=8000)
        expense_id = expense["id"]
        
        # First exclude
        requests.post(f"{BASE_URL}/api/expenses/exclude-from-week-bulk", json={
            "ids": [expense_id],
            "week_start": WEEK_START
        })
        
        # Then include back
        response = requests.post(f"{BASE_URL}/api/expenses/include-in-week-bulk", json={
            "ids": [expense_id],
            "week_start": WEEK_START
        })
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        
        # Verify excluded_from_weeks no longer contains WEEK_START
        get_resp = requests.get(f"{BASE_URL}/api/expenses")
        expenses = get_resp.json().get("expenses", [])
        found = next((e for e in expenses if e.get("id") == expense_id), None)
        excluded_weeks = found.get("excluded_from_weeks") or []
        assert WEEK_START not in excluded_weeks, \
            f"Week should be removed from excluded_from_weeks, got: {excluded_weeks}"
    
    def test_exclude_requires_week_start(self):
        """Exclude endpoint should require week_start parameter"""
        expense = self.create_test_expense()
        
        # Try without week_start
        response = requests.post(f"{BASE_URL}/api/expenses/exclude-from-week-bulk", json={
            "ids": [expense["id"]],
            "week_start": ""
        })
        assert response.status_code == 400, "Should reject empty week_start"


class TestExcludeFromWeekInvoices:
    """Test exclude/include functionality for invoices"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Create a test invoice for each test"""
        self.test_invoice_id = None
        yield
        # Cleanup
        if self.test_invoice_id:
            try:
                requests.delete(f"{BASE_URL}/api/invoices/{self.test_invoice_id}")
            except:
                pass
    
    def create_test_invoice(self, total=15000):
        """Helper to create a test invoice"""
        response = requests.post(f"{BASE_URL}/api/invoices", json={
            "customer_name": "TEST_ITER64_Client",
            "items": [{"name": "Test Item", "price": total, "quantity": 1, "department": "test"}],
            "subtotal": total,
            "total": total,
            "payment_method": "cash",
            "created_by": "Test",
            "validation_status": "validated"
        })
        assert response.status_code == 200, f"Failed to create invoice: {response.text}"
        invoice = response.json().get("invoice", {})
        self.test_invoice_id = invoice.get("id")
        return invoice
    
    def test_exclude_invoice_from_week(self):
        """POST /api/invoices/exclude-from-week-bulk should add week_start to excluded_from_weeks[]"""
        invoice = self.create_test_invoice(total=15000)
        invoice_id = invoice["id"]
        
        # Exclude from current week
        response = requests.post(f"{BASE_URL}/api/invoices/exclude-from-week-bulk", json={
            "ids": [invoice_id],
            "week_start": WEEK_START
        })
        assert response.status_code == 200, f"Exclude failed: {response.text}"
        data = response.json()
        assert data.get("success") == True
        
        # Verify invoice still exists
        get_resp = requests.get(f"{BASE_URL}/api/invoices/{invoice_id}")
        assert get_resp.status_code == 200
        found = get_resp.json()
        assert WEEK_START in (found.get("excluded_from_weeks") or [])
    
    def test_include_invoice_in_week(self):
        """POST /api/invoices/include-in-week-bulk should remove week_start from excluded_from_weeks[]"""
        invoice = self.create_test_invoice(total=20000)
        invoice_id = invoice["id"]
        
        # Exclude then include
        requests.post(f"{BASE_URL}/api/invoices/exclude-from-week-bulk", json={
            "ids": [invoice_id],
            "week_start": WEEK_START
        })
        
        response = requests.post(f"{BASE_URL}/api/invoices/include-in-week-bulk", json={
            "ids": [invoice_id],
            "week_start": WEEK_START
        })
        assert response.status_code == 200
        
        # Verify
        get_resp = requests.get(f"{BASE_URL}/api/invoices/{invoice_id}")
        found = get_resp.json()
        excluded_weeks = found.get("excluded_from_weeks") or []
        assert WEEK_START not in excluded_weeks


class TestWeeklyReportExclusion:
    """Test that weekly report correctly filters excluded items"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Track created items for cleanup"""
        self.created_expense_ids = []
        self.created_invoice_ids = []
        yield
        # Cleanup
        for eid in self.created_expense_ids:
            try:
                requests.delete(f"{BASE_URL}/api/expenses/{eid}")
            except:
                pass
        for iid in self.created_invoice_ids:
            try:
                requests.delete(f"{BASE_URL}/api/invoices/{iid}")
            except:
                pass
    
    def test_excluded_expense_not_in_weekly_report(self):
        """Excluded expense should NOT appear in weekly report but SHOULD appear in global list"""
        # Create expense
        resp = requests.post(f"{BASE_URL}/api/expenses", json={
            "category": "TEST_ITER64_REPORT",
            "description": f"TEST_ITER64_WeeklyReport_{datetime.now().timestamp()}",
            "quantity": 1,
            "unit_price": 99999,
            "amount": 99999,
            "requested_by": "Test"
        })
        expense = resp.json().get("expense", {})
        expense_id = expense["id"]
        self.created_expense_ids.append(expense_id)
        
        # Mark as completed
        requests.put(f"{BASE_URL}/api/expenses/{expense_id}", json={"status": "completed"})
        
        # Get weekly report BEFORE exclusion
        report_before = requests.get(f"{BASE_URL}/api/reports/weekly", params={"week_start": WEEK_START})
        assert report_before.status_code == 200
        data_before = report_before.json()
        
        # Check if expense is in the report (look in daily data)
        expense_in_report_before = False
        for day_data in (data_before.get("daily") or {}).values():
            items = (day_data.get("expenses") or {}).get("items") or []
            if any(e.get("id") == expense_id for e in items):
                expense_in_report_before = True
                break
        
        # Exclude from week
        exclude_resp = requests.post(f"{BASE_URL}/api/expenses/exclude-from-week-bulk", json={
            "ids": [expense_id],
            "week_start": WEEK_START
        })
        assert exclude_resp.status_code == 200
        
        # Get weekly report AFTER exclusion
        report_after = requests.get(f"{BASE_URL}/api/reports/weekly", params={"week_start": WEEK_START})
        assert report_after.status_code == 200
        data_after = report_after.json()
        
        # Check expense is NOT in the report anymore
        expense_in_report_after = False
        for day_data in (data_after.get("daily") or {}).values():
            items = (day_data.get("expenses") or {}).get("items") or []
            if any(e.get("id") == expense_id for e in items):
                expense_in_report_after = True
                break
        
        assert not expense_in_report_after, "Excluded expense should NOT appear in weekly report"
        
        # But expense should STILL be in global list
        global_resp = requests.get(f"{BASE_URL}/api/expenses")
        assert global_resp.status_code == 200
        all_expenses = global_resp.json().get("expenses", [])
        found_in_global = any(e.get("id") == expense_id for e in all_expenses)
        assert found_in_global, "Expense should STILL exist in global expenses list"
    
    def test_excluded_invoice_not_in_weekly_report(self):
        """Excluded invoice should NOT appear in weekly report"""
        # Create invoice
        resp = requests.post(f"{BASE_URL}/api/invoices", json={
            "customer_name": "TEST_ITER64_WeeklyReport",
            "items": [{"name": "Test", "price": 88888, "quantity": 1, "department": "test"}],
            "subtotal": 88888,
            "total": 88888,
            "payment_method": "cash",
            "created_by": "Test",
            "validation_status": "validated"
        })
        invoice = resp.json().get("invoice", {})
        invoice_id = invoice["id"]
        self.created_invoice_ids.append(invoice_id)
        
        # Exclude from week
        exclude_resp = requests.post(f"{BASE_URL}/api/invoices/exclude-from-week-bulk", json={
            "ids": [invoice_id],
            "week_start": WEEK_START
        })
        assert exclude_resp.status_code == 200
        
        # Get weekly report
        report = requests.get(f"{BASE_URL}/api/reports/weekly", params={"week_start": WEEK_START})
        assert report.status_code == 200
        data = report.json()
        
        # Check invoice is NOT in the report
        invoice_in_report = False
        for day_data in (data.get("daily") or {}).values():
            items = (day_data.get("sales") or {}).get("items") or []
            if any(i.get("id") == invoice_id for i in items):
                invoice_in_report = True
                break
        
        assert not invoice_in_report, "Excluded invoice should NOT appear in weekly report"
        
        # But invoice should STILL exist
        get_resp = requests.get(f"{BASE_URL}/api/invoices/{invoice_id}")
        assert get_resp.status_code == 200, "Invoice should still exist"
    
    def test_reinclusion_restores_in_weekly_report(self):
        """After include-in-week-bulk, item should reappear in weekly report"""
        # Create expense
        resp = requests.post(f"{BASE_URL}/api/expenses", json={
            "category": "TEST_ITER64_REINCLUSION",
            "description": f"TEST_ITER64_Reinclusion_{datetime.now().timestamp()}",
            "quantity": 1,
            "unit_price": 77777,
            "amount": 77777,
            "requested_by": "Test"
        })
        expense = resp.json().get("expense", {})
        expense_id = expense["id"]
        self.created_expense_ids.append(expense_id)
        
        # Mark as completed
        requests.put(f"{BASE_URL}/api/expenses/{expense_id}", json={"status": "completed"})
        
        # Exclude
        requests.post(f"{BASE_URL}/api/expenses/exclude-from-week-bulk", json={
            "ids": [expense_id],
            "week_start": WEEK_START
        })
        
        # Re-include
        include_resp = requests.post(f"{BASE_URL}/api/expenses/include-in-week-bulk", json={
            "ids": [expense_id],
            "week_start": WEEK_START
        })
        assert include_resp.status_code == 200
        
        # Verify expense no longer has the exclusion marker
        get_resp = requests.get(f"{BASE_URL}/api/expenses")
        expenses = get_resp.json().get("expenses", [])
        found = next((e for e in expenses if e.get("id") == expense_id), None)
        assert found is not None
        excluded_weeks = found.get("excluded_from_weeks") or []
        assert WEEK_START not in excluded_weeks, "Week should be removed after re-inclusion"


class TestBulkOperations:
    """Test bulk exclude/include operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.created_ids = []
        yield
        for eid in self.created_ids:
            try:
                requests.delete(f"{BASE_URL}/api/expenses/{eid}")
            except:
                pass
    
    def test_bulk_exclude_multiple_expenses(self):
        """Should be able to exclude multiple expenses at once"""
        # Create 3 expenses
        ids = []
        for i in range(3):
            resp = requests.post(f"{BASE_URL}/api/expenses", json={
                "category": "TEST_ITER64_BULK",
                "description": f"TEST_ITER64_Bulk_{i}_{datetime.now().timestamp()}",
                "quantity": 1,
                "unit_price": 1000 * (i + 1),
                "amount": 1000 * (i + 1),
                "requested_by": "Test"
            })
            expense = resp.json().get("expense", {})
            ids.append(expense["id"])
            self.created_ids.append(expense["id"])
        
        # Bulk exclude
        response = requests.post(f"{BASE_URL}/api/expenses/exclude-from-week-bulk", json={
            "ids": ids,
            "week_start": WEEK_START
        })
        assert response.status_code == 200
        data = response.json()
        assert data.get("modified") == 3, f"Should modify 3 expenses, got {data.get('modified')}"
        
        # Verify all have the exclusion
        get_resp = requests.get(f"{BASE_URL}/api/expenses")
        expenses = get_resp.json().get("expenses", [])
        for eid in ids:
            found = next((e for e in expenses if e.get("id") == eid), None)
            assert found is not None
            assert WEEK_START in (found.get("excluded_from_weeks") or [])


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
