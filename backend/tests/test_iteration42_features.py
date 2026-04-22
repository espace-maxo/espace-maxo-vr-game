"""
Iteration 42 Backend Tests:
1. Decimal support (float) for expenses and needs quantities
2. Current accounts auto_deduct_enabled field and run-auto-deduction endpoint
3. Expenses and needs CRUD regression
"""
import pytest
import requests
import os
from datetime import date

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestExpensesDecimalQuantity:
    """Test that expenses accept float quantities (0.5)"""
    
    def test_create_expense_with_decimal_quantity(self, api_client):
        """POST /api/expenses accepts quantity=0.5 (float)"""
        payload = {
            "category": "cuisine",
            "description": "TEST_Decimal_Expense_0.5",
            "quantity": 0.5,
            "unit_price": 1000,
            "amount": 500,
            "requested_by": "Test User"
        }
        response = api_client.post(f"{BASE_URL}/api/expenses", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") is True
        expense = data.get("expense", {})
        
        # Verify quantity is stored as 0.5 (not rounded)
        assert expense.get("quantity") == 0.5, f"Expected quantity=0.5, got {expense.get('quantity')}"
        assert expense.get("id") is not None
        
        # Cleanup
        expense_id = expense.get("id")
        if expense_id:
            api_client.delete(f"{BASE_URL}/api/expenses/{expense_id}")
    
    def test_create_grouped_expense_with_decimal_items(self, api_client):
        """POST /api/expenses with items[] containing float quantities"""
        payload = {
            "category": "cuisine",
            "description": "TEST_Grouped_Decimal_Expense",
            "quantity": 1,
            "amount": 2500,
            "requested_by": "Test User",
            "is_group": True,
            "items": [
                {"category": "cuisine", "description": "Item A", "quantity": 0.5, "unit_price": 2000, "amount": 1000},
                {"category": "bar", "description": "Item B", "quantity": 1.5, "unit_price": 1000, "amount": 1500}
            ]
        }
        response = api_client.post(f"{BASE_URL}/api/expenses", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        expense = data.get("expense", {})
        items = expense.get("items", [])
        
        assert len(items) == 2
        assert items[0].get("quantity") == 0.5, f"Item 0 quantity should be 0.5, got {items[0].get('quantity')}"
        assert items[1].get("quantity") == 1.5, f"Item 1 quantity should be 1.5, got {items[1].get('quantity')}"
        
        # Cleanup
        expense_id = expense.get("id")
        if expense_id:
            api_client.delete(f"{BASE_URL}/api/expenses/{expense_id}")
    
    def test_update_expense_with_decimal_quantity_items(self, api_client):
        """PUT /api/expenses/{id} accepts quantity float in items list"""
        # First create
        create_payload = {
            "category": "cuisine",
            "description": "TEST_Update_Decimal",
            "quantity": 1,
            "amount": 1000,
            "requested_by": "Test User",
            "is_group": True,
            "items": [{"category": "cuisine", "description": "Original", "quantity": 1, "unit_price": 1000, "amount": 1000}]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/expenses", json=create_payload)
        assert create_resp.status_code == 200
        expense_id = create_resp.json().get("expense", {}).get("id")
        
        # Update with decimal quantity
        update_payload = {
            "items": [
                {"category": "cuisine", "description": "Updated", "quantity": 0.75, "unit_price": 2000, "amount": 1500}
            ]
        }
        update_resp = api_client.put(f"{BASE_URL}/api/expenses/{expense_id}", json=update_payload)
        assert update_resp.status_code == 200, f"Expected 200, got {update_resp.status_code}: {update_resp.text}"
        
        updated = update_resp.json().get("expense", {})
        items = updated.get("items", [])
        assert len(items) == 1
        assert items[0].get("quantity") == 0.75, f"Expected 0.75, got {items[0].get('quantity')}"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/expenses/{expense_id}")


class TestNeedsDecimalQuantity:
    """Test that needs accept float quantities (0.5)"""
    
    def test_create_need_with_decimal_quantity(self, api_client):
        """POST /api/needs accepts quantity=0.5 at need level"""
        payload = {
            "location": "cuisine",
            "description": "TEST_Decimal_Need_0.5",
            "quantity": 0.5,
            "unit_price": 1000,
            "amount": 500,
            "requested_by": "Test User"
        }
        response = api_client.post(f"{BASE_URL}/api/needs", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") is True
        need = data.get("need", {})
        
        # Verify quantity is stored as 0.5
        assert need.get("quantity") == 0.5, f"Expected quantity=0.5, got {need.get('quantity')}"
        
        # Cleanup
        need_id = need.get("id")
        if need_id:
            api_client.delete(f"{BASE_URL}/api/needs/{need_id}")
    
    def test_create_need_with_decimal_items(self, api_client):
        """POST /api/needs accepts quantity=0.5 inside items[]"""
        payload = {
            "location": "salle",
            "description": "TEST_Need_Decimal_Items",
            "requested_by": "Test User",
            "items": [
                {"location": "salle", "description": "Item X", "quantity": 0.5, "unit_price": 500, "amount": 250},
                {"location": "cuisine", "description": "Item Y", "quantity": 2.5, "unit_price": 200, "amount": 500}
            ]
        }
        response = api_client.post(f"{BASE_URL}/api/needs", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        need = data.get("need", {})
        items = need.get("items", [])
        
        assert len(items) == 2
        assert items[0].get("quantity") == 0.5, f"Item 0 quantity should be 0.5, got {items[0].get('quantity')}"
        assert items[1].get("quantity") == 2.5, f"Item 1 quantity should be 2.5, got {items[1].get('quantity')}"
        
        # Cleanup
        need_id = need.get("id")
        if need_id:
            api_client.delete(f"{BASE_URL}/api/needs/{need_id}")
    
    def test_update_need_with_decimal_quantity(self, api_client):
        """PUT /api/needs/{id} accepts float quantity"""
        # Create
        create_payload = {
            "location": "autres",
            "description": "TEST_Update_Need_Decimal",
            "quantity": 1,
            "requested_by": "Test User"
        }
        create_resp = api_client.post(f"{BASE_URL}/api/needs", json=create_payload)
        assert create_resp.status_code == 200
        need_id = create_resp.json().get("need", {}).get("id")
        
        # Update with decimal
        update_payload = {"quantity": 0.25}
        update_resp = api_client.put(f"{BASE_URL}/api/needs/{need_id}", json=update_payload)
        assert update_resp.status_code == 200, f"Expected 200, got {update_resp.status_code}: {update_resp.text}"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/needs/{need_id}")


class TestCurrentAccountsAutoDeduct:
    """Test auto_deduct_enabled field and run-auto-deduction endpoint"""
    
    def test_create_account_with_auto_deduct_enabled(self, api_client):
        """POST /api/current-accounts accepts auto_deduct_enabled=true"""
        today = date.today().isoformat()
        payload = {
            "name": "TEST_Auto_Deduct_Account",
            "total_advance": 100000,
            "received_date": today,
            "auto_deduct_enabled": True,
            "schedule": [
                {"label": "Month 1", "due_date": today, "expected_amount": 50000}
            ]
        }
        response = api_client.post(f"{BASE_URL}/api/current-accounts", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") is True
        account = data.get("account", {})
        
        # Verify auto_deduct_enabled is persisted
        assert account.get("auto_deduct_enabled") is True, f"Expected auto_deduct_enabled=True, got {account.get('auto_deduct_enabled')}"
        
        account_id = account.get("id")
        
        # Verify GET returns auto_deduct_enabled
        get_resp = api_client.get(f"{BASE_URL}/api/current-accounts/{account_id}")
        assert get_resp.status_code == 200
        get_data = get_resp.json()
        assert get_data.get("auto_deduct_enabled") is True
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/current-accounts/{account_id}")
    
    def test_update_account_toggle_auto_deduct(self, api_client):
        """PUT /api/current-accounts/{id} can toggle auto_deduct_enabled"""
        today = date.today().isoformat()
        # Create with auto_deduct_enabled=False
        create_payload = {
            "name": "TEST_Toggle_Auto_Deduct",
            "total_advance": 50000,
            "received_date": today,
            "auto_deduct_enabled": False
        }
        create_resp = api_client.post(f"{BASE_URL}/api/current-accounts", json=create_payload)
        assert create_resp.status_code == 200
        account_id = create_resp.json().get("account", {}).get("id")
        
        # Update to enable auto_deduct
        update_resp = api_client.put(f"{BASE_URL}/api/current-accounts/{account_id}", json={"auto_deduct_enabled": True})
        assert update_resp.status_code == 200, f"Expected 200, got {update_resp.status_code}: {update_resp.text}"
        
        # Verify change
        get_resp = api_client.get(f"{BASE_URL}/api/current-accounts/{account_id}")
        assert get_resp.json().get("auto_deduct_enabled") is True
        
        # Toggle back to False
        update_resp2 = api_client.put(f"{BASE_URL}/api/current-accounts/{account_id}", json={"auto_deduct_enabled": False})
        assert update_resp2.status_code == 200
        
        get_resp2 = api_client.get(f"{BASE_URL}/api/current-accounts/{account_id}")
        assert get_resp2.json().get("auto_deduct_enabled") is False
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/current-accounts/{account_id}")
    
    def test_run_auto_deduction_endpoint(self, api_client):
        """POST /api/current-accounts/run-auto-deduction returns proper structure"""
        response = api_client.post(f"{BASE_URL}/api/current-accounts/run-auto-deduction", json={})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") is True
        assert "repayments_created" in data
        assert "total_deducted" in data
        assert "results" in data
        assert "date" in data
    
    def test_run_auto_deduction_idempotency(self, api_client):
        """Running auto-deduction twice should NOT create duplicate AUTO repayments"""
        today = date.today().isoformat()
        
        # Create account with auto_deduct_enabled and a due schedule entry
        create_payload = {
            "name": "TEST_Idempotency_Account",
            "total_advance": 10000,
            "received_date": today,
            "auto_deduct_enabled": True,
            "schedule": [
                {"label": "Due Today", "due_date": today, "expected_amount": 5000}
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/current-accounts", json=create_payload)
        assert create_resp.status_code == 200
        account_id = create_resp.json().get("account", {}).get("id")
        
        # Run auto-deduction first time
        run1 = api_client.post(f"{BASE_URL}/api/current-accounts/run-auto-deduction", json={"date": today})
        assert run1.status_code == 200
        created1 = run1.json().get("repayments_created", 0)
        
        # Run auto-deduction second time (should be idempotent)
        run2 = api_client.post(f"{BASE_URL}/api/current-accounts/run-auto-deduction", json={"date": today})
        assert run2.status_code == 200
        created2 = run2.json().get("repayments_created", 0)
        
        # Second run should create 0 new repayments (idempotent)
        assert created2 == 0, f"Expected 0 repayments on second run (idempotent), got {created2}"
        
        # Verify account has at most 1 AUTO repayment for this schedule entry
        get_resp = api_client.get(f"{BASE_URL}/api/current-accounts/{account_id}")
        repayments = get_resp.json().get("repayments", [])
        auto_repayments = [r for r in repayments if r.get("auto") or (r.get("reference") or "").startswith("AUTO-")]
        
        # Should have at most 1 AUTO repayment (or 0 if no revenue)
        assert len(auto_repayments) <= 1, f"Expected at most 1 AUTO repayment, got {len(auto_repayments)}"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/current-accounts/{account_id}")
    
    def test_get_accounts_with_auto_run_false(self, api_client):
        """GET /api/current-accounts?auto_run=false should NOT trigger auto-deduction"""
        response = api_client.get(f"{BASE_URL}/api/current-accounts?auto_run=false")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "accounts" in data
        assert "summary" in data
    
    def test_get_accounts_default_auto_run(self, api_client):
        """GET /api/current-accounts (default auto_run=true) should work without errors"""
        response = api_client.get(f"{BASE_URL}/api/current-accounts")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "accounts" in data
        assert "summary" in data


class TestExpensesRegression:
    """Regression tests for expenses CRUD"""
    
    def test_get_expenses(self, api_client):
        """GET /api/expenses works"""
        response = api_client.get(f"{BASE_URL}/api/expenses")
        assert response.status_code == 200
        assert "expenses" in response.json()
    
    def test_expense_crud_flow(self, api_client):
        """Full CRUD flow for expenses"""
        # Create
        create_payload = {
            "category": "autres",
            "description": "TEST_CRUD_Expense",
            "quantity": 1,
            "amount": 1000,
            "requested_by": "Test"
        }
        create_resp = api_client.post(f"{BASE_URL}/api/expenses", json=create_payload)
        assert create_resp.status_code == 200
        expense_id = create_resp.json().get("expense", {}).get("id")
        assert expense_id is not None
        
        # Update
        update_resp = api_client.put(f"{BASE_URL}/api/expenses/{expense_id}", json={"amount": 2000})
        assert update_resp.status_code == 200
        
        # Delete
        delete_resp = api_client.delete(f"{BASE_URL}/api/expenses/{expense_id}")
        assert delete_resp.status_code == 200


class TestNeedsRegression:
    """Regression tests for needs CRUD"""
    
    def test_get_needs(self, api_client):
        """GET /api/needs works"""
        response = api_client.get(f"{BASE_URL}/api/needs")
        assert response.status_code == 200
        assert "needs" in response.json()
    
    def test_needs_crud_flow(self, api_client):
        """Full CRUD flow for needs"""
        # Create
        create_payload = {
            "location": "autres",
            "description": "TEST_CRUD_Need",
            "requested_by": "Test"
        }
        create_resp = api_client.post(f"{BASE_URL}/api/needs", json=create_payload)
        assert create_resp.status_code == 200
        need_id = create_resp.json().get("need", {}).get("id")
        assert need_id is not None
        
        # Update
        update_resp = api_client.put(f"{BASE_URL}/api/needs/{need_id}", json={"notes": "Updated"})
        assert update_resp.status_code == 200
        
        # Delete
        delete_resp = api_client.delete(f"{BASE_URL}/api/needs/{need_id}")
        assert delete_resp.status_code == 200
