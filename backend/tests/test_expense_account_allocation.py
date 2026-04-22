"""
Test Expense Account Allocation Feature (Iteration 52)
Tests for linking expenses to current accounts as funding sources.

Features tested:
- ExpenseCreate/ExpenseUpdate with funded_by_account_id, funded_by_account_name, funded_affects_ca
- POST /api/expenses with funded_by_account_id → auto-creates allocation repayment
- PUT /api/expenses/{id} with changed funded_by_account_id → removes prior allocation, creates new
- DELETE /api/expenses/{id} → removes allocation
- POST /api/expenses/{id}/allocate-account → retroactive allocation (any status)
- DELETE /api/expenses/{id}/allocate-account → removes funding source
- GET /api/current-accounts returns allocated_to_expenses and balance_available
- Balance integrity: allocating 10k expense to 50k account → balance_available goes from 50k → 40k
- Error handling: 404 for non-existent account/expense
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture(scope="module")
def test_account(api_client):
    """Create a test current account for allocation tests"""
    account_data = {
        "name": f"TEST_Account_{uuid.uuid4().hex[:8]}",
        "total_advance": 50000,
        "received_date": "2026-01-01",
        "description": "Test account for expense allocation",
        "notes": "Created by pytest",
        "auto_deduct_enabled": False
    }
    response = api_client.post(f"{BASE_URL}/api/current-accounts", json=account_data)
    assert response.status_code == 200, f"Failed to create test account: {response.text}"
    data = response.json()
    assert data.get("success") is True
    account = data.get("account")
    assert account is not None
    yield account
    # Cleanup
    try:
        api_client.delete(f"{BASE_URL}/api/current-accounts/{account['id']}")
    except:
        pass

@pytest.fixture(scope="module")
def test_account_2(api_client):
    """Create a second test current account for re-allocation tests"""
    account_data = {
        "name": f"TEST_Account2_{uuid.uuid4().hex[:8]}",
        "total_advance": 30000,
        "received_date": "2026-01-01",
        "description": "Second test account for re-allocation",
        "notes": "Created by pytest",
        "auto_deduct_enabled": False
    }
    response = api_client.post(f"{BASE_URL}/api/current-accounts", json=account_data)
    assert response.status_code == 200, f"Failed to create test account 2: {response.text}"
    data = response.json()
    account = data.get("account")
    yield account
    # Cleanup
    try:
        api_client.delete(f"{BASE_URL}/api/current-accounts/{account['id']}")
    except:
        pass


class TestExpenseCreateWithFunding:
    """Test creating expenses with funding source"""
    
    def test_create_expense_without_funding(self, api_client):
        """Create expense without funding source - should work normally"""
        expense_data = {
            "category": "cuisine",
            "description": f"TEST_Expense_NoFunding_{uuid.uuid4().hex[:8]}",
            "quantity": 1,
            "unit_price": 5000,
            "amount": 5000,
            "requested_by": "Test User"
        }
        response = api_client.post(f"{BASE_URL}/api/expenses", json=expense_data)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data.get("success") is True
        expense = data.get("expense")
        assert expense is not None
        assert expense.get("funded_by_account_id") is None
        assert expense.get("funded_affects_ca") is True  # Default value
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/expenses/{expense['id']}")
    
    def test_create_expense_with_funding_source(self, api_client, test_account):
        """Create expense with funding source - should auto-create allocation"""
        expense_data = {
            "category": "cuisine",
            "description": f"TEST_Expense_WithFunding_{uuid.uuid4().hex[:8]}",
            "quantity": 2,
            "unit_price": 5000,
            "amount": 10000,
            "requested_by": "Test User",
            "funded_by_account_id": test_account["id"],
            "funded_by_account_name": test_account["name"],
            "funded_affects_ca": True
        }
        response = api_client.post(f"{BASE_URL}/api/expenses", json=expense_data)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data.get("success") is True
        expense = data.get("expense")
        assert expense is not None
        assert expense.get("funded_by_account_id") == test_account["id"]
        assert expense.get("funded_by_account_name") == test_account["name"]
        assert expense.get("funded_affects_ca") is True
        
        # Verify allocation was created on the account
        acc_response = api_client.get(f"{BASE_URL}/api/current-accounts/{test_account['id']}")
        assert acc_response.status_code == 200
        acc_data = acc_response.json()
        
        # Check for expense_allocation repayment
        repayments = acc_data.get("repayments", [])
        allocation = next((r for r in repayments if r.get("reference") == f"EXP-{expense['id']}"), None)
        assert allocation is not None, "Allocation repayment not found"
        assert allocation.get("method") == "expense_allocation"
        assert allocation.get("amount") == 10000
        
        # Verify balance_available decreased
        assert acc_data.get("allocated_to_expenses") == 10000
        assert acc_data.get("balance_available") == 40000  # 50000 - 10000
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/expenses/{expense['id']}")
    
    def test_create_expense_with_affects_ca_false(self, api_client, test_account):
        """Create expense with funded_affects_ca=False"""
        expense_data = {
            "category": "paiement",
            "description": f"TEST_Expense_NoCA_{uuid.uuid4().hex[:8]}",
            "quantity": 1,
            "unit_price": 3000,
            "amount": 3000,
            "requested_by": "Test User",
            "funded_by_account_id": test_account["id"],
            "funded_affects_ca": False
        }
        response = api_client.post(f"{BASE_URL}/api/expenses", json=expense_data)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        expense = data.get("expense")
        assert expense.get("funded_affects_ca") is False
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/expenses/{expense['id']}")


class TestExpenseUpdateFunding:
    """Test updating expense funding source"""
    
    def test_update_expense_add_funding(self, api_client, test_account):
        """Update expense to add funding source"""
        # Create expense without funding
        expense_data = {
            "category": "bar",
            "description": f"TEST_Expense_AddFunding_{uuid.uuid4().hex[:8]}",
            "amount": 8000,
            "requested_by": "Test User"
        }
        create_resp = api_client.post(f"{BASE_URL}/api/expenses", json=expense_data)
        assert create_resp.status_code == 200
        expense = create_resp.json().get("expense")
        
        # Update to add funding
        update_resp = api_client.put(f"{BASE_URL}/api/expenses/{expense['id']}", json={
            "funded_by_account_id": test_account["id"],
            "funded_by_account_name": test_account["name"]
        })
        assert update_resp.status_code == 200
        updated = update_resp.json().get("expense")
        assert updated.get("funded_by_account_id") == test_account["id"]
        
        # Verify allocation created
        acc_resp = api_client.get(f"{BASE_URL}/api/current-accounts/{test_account['id']}")
        repayments = acc_resp.json().get("repayments", [])
        allocation = next((r for r in repayments if r.get("reference") == f"EXP-{expense['id']}"), None)
        assert allocation is not None
        assert allocation.get("amount") == 8000
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/expenses/{expense['id']}")
    
    def test_update_expense_change_funding_account(self, api_client, test_account, test_account_2):
        """Update expense to change funding account - should remove old allocation, create new"""
        # Create expense with first account
        expense_data = {
            "category": "cuisine",
            "description": f"TEST_Expense_ChangeFunding_{uuid.uuid4().hex[:8]}",
            "amount": 7000,
            "requested_by": "Test User",
            "funded_by_account_id": test_account["id"]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/expenses", json=expense_data)
        assert create_resp.status_code == 200
        expense = create_resp.json().get("expense")
        
        # Verify allocation on first account
        acc1_resp = api_client.get(f"{BASE_URL}/api/current-accounts/{test_account['id']}")
        repayments1 = acc1_resp.json().get("repayments", [])
        alloc1 = next((r for r in repayments1 if r.get("reference") == f"EXP-{expense['id']}"), None)
        assert alloc1 is not None
        
        # Update to second account
        update_resp = api_client.put(f"{BASE_URL}/api/expenses/{expense['id']}", json={
            "funded_by_account_id": test_account_2["id"],
            "funded_by_account_name": test_account_2["name"]
        })
        assert update_resp.status_code == 200
        
        # Verify allocation removed from first account
        acc1_resp2 = api_client.get(f"{BASE_URL}/api/current-accounts/{test_account['id']}")
        repayments1_after = acc1_resp2.json().get("repayments", [])
        alloc1_after = next((r for r in repayments1_after if r.get("reference") == f"EXP-{expense['id']}"), None)
        assert alloc1_after is None, "Allocation should be removed from first account"
        
        # Verify allocation created on second account
        acc2_resp = api_client.get(f"{BASE_URL}/api/current-accounts/{test_account_2['id']}")
        repayments2 = acc2_resp.json().get("repayments", [])
        alloc2 = next((r for r in repayments2 if r.get("reference") == f"EXP-{expense['id']}"), None)
        assert alloc2 is not None, "Allocation should be created on second account"
        assert alloc2.get("amount") == 7000
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/expenses/{expense['id']}")


class TestExpenseDeleteWithAllocation:
    """Test deleting expense removes allocation"""
    
    def test_delete_expense_removes_allocation(self, api_client, test_account):
        """Delete expense should remove allocation from account"""
        # Create expense with funding
        expense_data = {
            "category": "autres",
            "description": f"TEST_Expense_Delete_{uuid.uuid4().hex[:8]}",
            "amount": 6000,
            "requested_by": "Test User",
            "funded_by_account_id": test_account["id"]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/expenses", json=expense_data)
        assert create_resp.status_code == 200
        expense = create_resp.json().get("expense")
        
        # Verify allocation exists
        acc_resp1 = api_client.get(f"{BASE_URL}/api/current-accounts/{test_account['id']}")
        repayments1 = acc_resp1.json().get("repayments", [])
        alloc = next((r for r in repayments1 if r.get("reference") == f"EXP-{expense['id']}"), None)
        assert alloc is not None
        
        # Delete expense
        del_resp = api_client.delete(f"{BASE_URL}/api/expenses/{expense['id']}")
        assert del_resp.status_code == 200
        
        # Verify allocation removed
        acc_resp2 = api_client.get(f"{BASE_URL}/api/current-accounts/{test_account['id']}")
        repayments2 = acc_resp2.json().get("repayments", [])
        alloc_after = next((r for r in repayments2 if r.get("reference") == f"EXP-{expense['id']}"), None)
        assert alloc_after is None, "Allocation should be removed after expense deletion"


class TestAllocateAccountEndpoint:
    """Test POST/DELETE /api/expenses/{id}/allocate-account endpoints"""
    
    def test_allocate_expense_retroactive(self, api_client, test_account):
        """POST /api/expenses/{id}/allocate-account - retroactive allocation"""
        # Create expense without funding
        expense_data = {
            "category": "cuisine",
            "description": f"TEST_Expense_Retroactive_{uuid.uuid4().hex[:8]}",
            "amount": 12000,
            "requested_by": "Test User"
        }
        create_resp = api_client.post(f"{BASE_URL}/api/expenses", json=expense_data)
        assert create_resp.status_code == 200
        expense = create_resp.json().get("expense")
        
        # Approve the expense (simulate completed status)
        api_client.put(f"{BASE_URL}/api/expenses/{expense['id']}", json={"status": "approved"})
        api_client.put(f"{BASE_URL}/api/expenses/{expense['id']}", json={"status": "completed"})
        
        # Retroactively allocate to account
        alloc_resp = api_client.post(f"{BASE_URL}/api/expenses/{expense['id']}/allocate-account", json={
            "account_id": test_account["id"],
            "account_name": test_account["name"],
            "affects_ca": True
        })
        assert alloc_resp.status_code == 200, f"Failed: {alloc_resp.text}"
        data = alloc_resp.json()
        assert data.get("success") is True
        
        # Verify expense updated
        updated_expense = data.get("expense")
        assert updated_expense.get("funded_by_account_id") == test_account["id"]
        
        # Verify allocation created
        acc_resp = api_client.get(f"{BASE_URL}/api/current-accounts/{test_account['id']}")
        repayments = acc_resp.json().get("repayments", [])
        alloc = next((r for r in repayments if r.get("reference") == f"EXP-{expense['id']}"), None)
        assert alloc is not None
        assert alloc.get("amount") == 12000
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/expenses/{expense['id']}")
    
    def test_allocate_expense_idempotent(self, api_client, test_account):
        """POST /api/expenses/{id}/allocate-account - idempotent (no duplicates)"""
        # Create expense
        expense_data = {
            "category": "bar",
            "description": f"TEST_Expense_Idempotent_{uuid.uuid4().hex[:8]}",
            "amount": 4000,
            "requested_by": "Test User"
        }
        create_resp = api_client.post(f"{BASE_URL}/api/expenses", json=expense_data)
        expense = create_resp.json().get("expense")
        
        # Allocate twice
        api_client.post(f"{BASE_URL}/api/expenses/{expense['id']}/allocate-account", json={
            "account_id": test_account["id"]
        })
        api_client.post(f"{BASE_URL}/api/expenses/{expense['id']}/allocate-account", json={
            "account_id": test_account["id"]
        })
        
        # Verify only one allocation exists
        acc_resp = api_client.get(f"{BASE_URL}/api/current-accounts/{test_account['id']}")
        repayments = acc_resp.json().get("repayments", [])
        allocations = [r for r in repayments if r.get("reference") == f"EXP-{expense['id']}"]
        assert len(allocations) == 1, f"Expected 1 allocation, got {len(allocations)}"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/expenses/{expense['id']}")
    
    def test_unallocate_expense(self, api_client, test_account):
        """DELETE /api/expenses/{id}/allocate-account - removes funding source"""
        # Create expense with funding
        expense_data = {
            "category": "cuisine",
            "description": f"TEST_Expense_Unallocate_{uuid.uuid4().hex[:8]}",
            "amount": 9000,
            "requested_by": "Test User",
            "funded_by_account_id": test_account["id"]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/expenses", json=expense_data)
        expense = create_resp.json().get("expense")
        
        # Unallocate
        unalloc_resp = api_client.delete(f"{BASE_URL}/api/expenses/{expense['id']}/allocate-account")
        assert unalloc_resp.status_code == 200
        assert unalloc_resp.json().get("success") is True
        
        # Verify expense updated
        exp_resp = api_client.get(f"{BASE_URL}/api/expenses")
        expenses = exp_resp.json().get("expenses", [])
        updated = next((e for e in expenses if e.get("id") == expense["id"]), None)
        assert updated is not None
        assert updated.get("funded_by_account_id") is None
        
        # Verify allocation removed
        acc_resp = api_client.get(f"{BASE_URL}/api/current-accounts/{test_account['id']}")
        repayments = acc_resp.json().get("repayments", [])
        alloc = next((r for r in repayments if r.get("reference") == f"EXP-{expense['id']}"), None)
        assert alloc is None
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/expenses/{expense['id']}")


class TestCurrentAccountEnrichment:
    """Test GET /api/current-accounts returns allocated_to_expenses and balance_available"""
    
    def test_account_has_allocation_fields(self, api_client, test_account):
        """Verify account has allocated_to_expenses and balance_available fields"""
        response = api_client.get(f"{BASE_URL}/api/current-accounts/{test_account['id']}")
        assert response.status_code == 200
        data = response.json()
        
        assert "allocated_to_expenses" in data
        assert "balance_available" in data
        assert isinstance(data["allocated_to_expenses"], (int, float))
        assert isinstance(data["balance_available"], (int, float))
    
    def test_balance_integrity(self, api_client, test_account):
        """Allocating 10k expense to 50k account: balance_available goes from 50k → 40k"""
        # Get initial balance
        acc_resp1 = api_client.get(f"{BASE_URL}/api/current-accounts/{test_account['id']}")
        initial_available = acc_resp1.json().get("balance_available")
        initial_allocated = acc_resp1.json().get("allocated_to_expenses", 0)
        
        # Create expense with funding
        expense_data = {
            "category": "cuisine",
            "description": f"TEST_Expense_Balance_{uuid.uuid4().hex[:8]}",
            "amount": 10000,
            "requested_by": "Test User",
            "funded_by_account_id": test_account["id"]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/expenses", json=expense_data)
        expense = create_resp.json().get("expense")
        
        # Check balance decreased
        acc_resp2 = api_client.get(f"{BASE_URL}/api/current-accounts/{test_account['id']}")
        new_available = acc_resp2.json().get("balance_available")
        new_allocated = acc_resp2.json().get("allocated_to_expenses", 0)
        
        assert new_allocated == initial_allocated + 10000
        assert new_available == initial_available - 10000
        
        # Delete expense - balance should restore
        api_client.delete(f"{BASE_URL}/api/expenses/{expense['id']}")
        
        acc_resp3 = api_client.get(f"{BASE_URL}/api/current-accounts/{test_account['id']}")
        restored_available = acc_resp3.json().get("balance_available")
        restored_allocated = acc_resp3.json().get("allocated_to_expenses", 0)
        
        assert restored_allocated == initial_allocated
        assert restored_available == initial_available


class TestErrorHandling:
    """Test error handling for allocation endpoints"""
    
    def test_allocate_nonexistent_expense(self, api_client, test_account):
        """POST /api/expenses/{id}/allocate-account with non-existent expense → 404"""
        fake_id = str(uuid.uuid4())
        response = api_client.post(f"{BASE_URL}/api/expenses/{fake_id}/allocate-account", json={
            "account_id": test_account["id"]
        })
        assert response.status_code == 404
    
    def test_allocate_nonexistent_account(self, api_client):
        """POST /api/expenses/{id}/allocate-account with non-existent account → 404"""
        # Create a real expense first
        expense_data = {
            "category": "autres",
            "description": f"TEST_Expense_404_{uuid.uuid4().hex[:8]}",
            "amount": 1000,
            "requested_by": "Test User"
        }
        create_resp = api_client.post(f"{BASE_URL}/api/expenses", json=expense_data)
        expense = create_resp.json().get("expense")
        
        # Try to allocate to non-existent account
        fake_account_id = str(uuid.uuid4())
        response = api_client.post(f"{BASE_URL}/api/expenses/{expense['id']}/allocate-account", json={
            "account_id": fake_account_id
        })
        assert response.status_code == 404
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/expenses/{expense['id']}")
    
    def test_unallocate_nonexistent_expense(self, api_client):
        """DELETE /api/expenses/{id}/allocate-account with non-existent expense → 404"""
        fake_id = str(uuid.uuid4())
        response = api_client.delete(f"{BASE_URL}/api/expenses/{fake_id}/allocate-account")
        assert response.status_code == 404


class TestListAccountsWithAllocations:
    """Test GET /api/current-accounts list includes allocation data"""
    
    def test_list_accounts_has_allocation_fields(self, api_client):
        """GET /api/current-accounts returns accounts with allocated_to_expenses and balance_available"""
        response = api_client.get(f"{BASE_URL}/api/current-accounts")
        assert response.status_code == 200
        data = response.json()
        
        accounts = data.get("accounts", [])
        if len(accounts) > 0:
            for acc in accounts:
                assert "allocated_to_expenses" in acc, f"Account {acc.get('name')} missing allocated_to_expenses"
                assert "balance_available" in acc, f"Account {acc.get('name')} missing balance_available"
