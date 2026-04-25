"""
Test suite for Iteration 61: Smart Expense Allocation to Current Accounts
Tests the new POST /api/expenses/{id}/allocate-account-smart endpoint with 3 modes:
- topup_existing: Auto top-up account if balance insufficient
- create_new: Create new dedicated account
- allow_negative: Allow negative balance (overdraft)

Also tests:
- Regression: Old /api/expenses/{id}/allocate-account still works
- Top-up label format: "Recharge auto pour <description>"
- Account total_advance and top_ups[] array updates
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSmartAllocationEndpoint:
    """Tests for POST /api/expenses/{id}/allocate-account-smart"""
    
    @pytest.fixture(autouse=True)
    def setup_and_cleanup(self):
        """Setup test data and cleanup after each test"""
        self.created_expenses = []
        self.created_accounts = []
        yield
        # Cleanup
        for exp_id in self.created_expenses:
            try:
                requests.delete(f"{BASE_URL}/api/expenses/{exp_id}")
            except:
                pass
        for acc_id in self.created_accounts:
            try:
                requests.delete(f"{BASE_URL}/api/current-accounts/{acc_id}")
            except:
                pass
    
    def create_test_expense(self, amount, description, status='approved'):
        """Helper to create a test expense"""
        resp = requests.post(f"{BASE_URL}/api/expenses", json={
            "category": "cuisine",
            "description": f"TEST iter61 {description}",
            "quantity": 1,
            "unit_price": amount,
            "amount": amount,
            "requested_by": "Test Agent"
        })
        assert resp.status_code == 200, f"Failed to create expense: {resp.text}"
        expense = resp.json()['expense']
        self.created_expenses.append(expense['id'])
        
        # Move to desired status
        if status == 'approved':
            requests.put(f"{BASE_URL}/api/expenses/{expense['id']}", json={"status": "approved", "approved_by": "Admin"})
        elif status == 'completed':
            requests.put(f"{BASE_URL}/api/expenses/{expense['id']}", json={"status": "approved", "approved_by": "Admin"})
            requests.put(f"{BASE_URL}/api/expenses/{expense['id']}", json={"status": "completed"})
        
        # Refresh
        resp = requests.get(f"{BASE_URL}/api/expenses")
        for e in resp.json().get('expenses', []):
            if e['id'] == expense['id']:
                return e
        return expense
    
    def create_test_account(self, name, total_advance):
        """Helper to create a test current account"""
        resp = requests.post(f"{BASE_URL}/api/current-accounts", json={
            "name": f"TEST iter61 {name}",
            "total_advance": total_advance,
            "received_date": datetime.now().strftime("%Y-%m-%d"),
            "description": "Test account for iter61"
        })
        assert resp.status_code == 200, f"Failed to create account: {resp.text}"
        account = resp.json()['account']
        self.created_accounts.append(account['id'])
        return account
    
    def get_account(self, account_id):
        """Helper to fetch account by ID"""
        resp = requests.get(f"{BASE_URL}/api/current-accounts")
        for acc in resp.json().get('accounts', []):
            if acc['id'] == account_id:
                return acc
        return None
    
    # ==================== MODE: topup_existing ====================
    
    def test_topup_existing_insufficient_balance(self):
        """
        Test mode='topup_existing' when account balance is insufficient.
        Account has 10000 F, expense is 50000 F → should top-up by 40000 F.
        """
        # Create account with 10000 F
        account = self.create_test_account("TopUp Test", 10000)
        assert account['total_advance'] == 10000
        
        # Create expense of 50000 F
        expense = self.create_test_expense(50000, "smart alloc topup", status='approved')
        
        # Call smart allocate with mode='topup_existing'
        resp = requests.post(f"{BASE_URL}/api/expenses/{expense['id']}/allocate-account-smart", json={
            "account_id": account['id'],
            "mode": "topup_existing",
            "affects_ca": True
        })
        
        assert resp.status_code == 200, f"Smart allocate failed: {resp.text}"
        data = resp.json()
        
        # Verify response
        assert data['success'] == True
        assert data['mode'] == 'topup_existing'
        assert data['topped_up_amount'] == 40000, f"Expected 40000 top-up, got {data['topped_up_amount']}"
        assert data['account_id'] == account['id']
        
        # Verify account was updated
        updated_account = self.get_account(account['id'])
        assert updated_account is not None
        assert updated_account['total_advance'] == 50000, f"Expected total_advance=50000, got {updated_account['total_advance']}"
        
        # Verify top_ups array has the entry
        top_ups = updated_account.get('top_ups', [])
        assert len(top_ups) >= 1, "Expected at least 1 top_up entry"
        latest_topup = top_ups[-1]
        assert latest_topup['amount'] == 40000
        assert 'Recharge auto pour' in latest_topup['label'], f"Label should contain 'Recharge auto pour', got: {latest_topup['label']}"
        assert expense['id'] in latest_topup.get('expense_id', ''), "Top-up should reference expense_id"
        
        # Verify balance_remaining is 0 after allocation
        # balance_available = total_advance - sum(repayments)
        # After allocation: 50000 - 50000 = 0
        repayments = updated_account.get('repayments', [])
        total_repaid = sum(r.get('amount', 0) for r in repayments)
        balance = updated_account['total_advance'] - total_repaid
        assert balance == 0, f"Expected balance=0 after allocation, got {balance}"
        
        print(f"✓ topup_existing: Account topped up from 10000 to 50000 F, expense allocated")
    
    def test_topup_existing_sufficient_balance(self):
        """
        Test mode='topup_existing' when account has sufficient balance.
        Should NOT top-up, just allocate normally.
        """
        # Create account with 100000 F
        account = self.create_test_account("Sufficient Balance", 100000)
        
        # Create expense of 30000 F
        expense = self.create_test_expense(30000, "sufficient balance test", status='approved')
        
        # Call smart allocate
        resp = requests.post(f"{BASE_URL}/api/expenses/{expense['id']}/allocate-account-smart", json={
            "account_id": account['id'],
            "mode": "topup_existing",
            "affects_ca": True
        })
        
        assert resp.status_code == 200
        data = resp.json()
        
        # Should NOT have topped up
        assert data['topped_up_amount'] == 0, f"Should not top-up when balance sufficient, got {data['topped_up_amount']}"
        
        # Account total_advance should remain unchanged
        updated_account = self.get_account(account['id'])
        assert updated_account['total_advance'] == 100000
        
        print(f"✓ topup_existing with sufficient balance: No top-up, normal allocation")
    
    # ==================== MODE: create_new ====================
    
    def test_create_new_account(self):
        """
        Test mode='create_new' creates a new dedicated account.
        New account should have total_advance = expense.amount and name = 'Recharge auto pour <description>'.
        """
        # Create expense of 80000 F
        expense = self.create_test_expense(80000, "create new account", status='completed')
        
        # Call smart allocate with mode='create_new'
        resp = requests.post(f"{BASE_URL}/api/expenses/{expense['id']}/allocate-account-smart", json={
            "mode": "create_new",
            "affects_ca": True
        })
        
        assert resp.status_code == 200, f"Smart allocate failed: {resp.text}"
        data = resp.json()
        
        # Verify response
        assert data['success'] == True
        assert data['mode'] == 'create_new'
        assert data['topped_up_amount'] == 80000, f"Expected 80000 (full amount), got {data['topped_up_amount']}"
        assert data['created_account'] is not None, "Should return created_account"
        
        # Track for cleanup
        new_account_id = data['account_id']
        self.created_accounts.append(new_account_id)
        
        # Verify new account
        created_account = data['created_account']
        assert created_account['total_advance'] == 80000
        assert 'Recharge auto pour' in created_account['name'], f"Name should contain 'Recharge auto pour', got: {created_account['name']}"
        
        # Verify expense is linked to new account
        assert data['expense']['funded_by_account_id'] == new_account_id
        
        print(f"✓ create_new: New account created with 80000 F, expense allocated")
    
    # ==================== MODE: allow_negative ====================
    
    def test_allow_negative_overdraft(self):
        """
        Test mode='allow_negative' allows account to go negative.
        Account has 5000 F, expense is 25000 F → balance becomes -20000 F.
        """
        # Create account with 5000 F
        account = self.create_test_account("Overdraft Test", 5000)
        
        # Create expense of 25000 F
        expense = self.create_test_expense(25000, "overdraft test", status='approved')
        
        # Call smart allocate with mode='allow_negative'
        resp = requests.post(f"{BASE_URL}/api/expenses/{expense['id']}/allocate-account-smart", json={
            "account_id": account['id'],
            "mode": "allow_negative",
            "affects_ca": True
        })
        
        assert resp.status_code == 200, f"Smart allocate failed: {resp.text}"
        data = resp.json()
        
        # Verify response
        assert data['success'] == True
        assert data['mode'] == 'allow_negative'
        assert data['topped_up_amount'] == 0, "Should NOT top-up in allow_negative mode"
        
        # Verify account total_advance unchanged
        updated_account = self.get_account(account['id'])
        assert updated_account['total_advance'] == 5000, "total_advance should remain 5000"
        
        # Verify balance is negative
        repayments = updated_account.get('repayments', [])
        total_repaid = sum(r.get('amount', 0) for r in repayments)
        balance = updated_account['total_advance'] - total_repaid
        assert balance == -20000, f"Expected balance=-20000 (overdraft), got {balance}"
        
        print(f"✓ allow_negative: Account in overdraft (-20000 F), no top-up")
    
    # ==================== REGRESSION: Old endpoint ====================
    
    def test_regression_old_allocate_endpoint(self):
        """
        Regression test: Old POST /api/expenses/{id}/allocate-account still works
        for cases with sufficient balance.
        """
        # Create account with 50000 F
        account = self.create_test_account("Regression Test", 50000)
        
        # Create expense of 15000 F
        expense = self.create_test_expense(15000, "regression old endpoint", status='approved')
        
        # Use OLD endpoint
        resp = requests.post(f"{BASE_URL}/api/expenses/{expense['id']}/allocate-account", json={
            "account_id": account['id'],
            "account_name": account['name'],
            "affects_ca": True
        })
        
        assert resp.status_code == 200, f"Old allocate endpoint failed: {resp.text}"
        data = resp.json()
        
        assert data['success'] == True
        assert data['expense']['funded_by_account_id'] == account['id']
        
        # Verify repayment was added
        updated_account = self.get_account(account['id'])
        repayments = updated_account.get('repayments', [])
        assert len(repayments) >= 1, "Should have at least 1 repayment"
        
        # Find the expense allocation repayment
        exp_repayment = next((r for r in repayments if r.get('reference') == f"EXP-{expense['id']}"), None)
        assert exp_repayment is not None, "Should have expense allocation repayment"
        assert exp_repayment['amount'] == 15000
        
        print(f"✓ Regression: Old /allocate-account endpoint works correctly")
    
    # ==================== VALIDATION TESTS ====================
    
    def test_invalid_mode_rejected(self):
        """Test that invalid mode is rejected"""
        expense = self.create_test_expense(10000, "invalid mode test", status='approved')
        
        resp = requests.post(f"{BASE_URL}/api/expenses/{expense['id']}/allocate-account-smart", json={
            "mode": "invalid_mode",
            "account_id": "some-id"
        })
        
        assert resp.status_code == 400, f"Should reject invalid mode, got {resp.status_code}"
        print(f"✓ Invalid mode correctly rejected")
    
    def test_missing_account_id_for_topup(self):
        """Test that account_id is required for topup_existing mode"""
        expense = self.create_test_expense(10000, "missing account test", status='approved')
        
        resp = requests.post(f"{BASE_URL}/api/expenses/{expense['id']}/allocate-account-smart", json={
            "mode": "topup_existing"
            # Missing account_id
        })
        
        assert resp.status_code == 400, f"Should require account_id for topup_existing, got {resp.status_code}"
        print(f"✓ Missing account_id correctly rejected for topup_existing")
    
    def test_expense_not_found(self):
        """Test 404 for non-existent expense"""
        fake_id = str(uuid.uuid4())
        
        resp = requests.post(f"{BASE_URL}/api/expenses/{fake_id}/allocate-account-smart", json={
            "mode": "create_new"
        })
        
        assert resp.status_code == 404, f"Should return 404 for non-existent expense, got {resp.status_code}"
        print(f"✓ Non-existent expense returns 404")
    
    def test_account_not_found(self):
        """Test 404 for non-existent account"""
        expense = self.create_test_expense(10000, "account not found test", status='approved')
        fake_account_id = str(uuid.uuid4())
        
        resp = requests.post(f"{BASE_URL}/api/expenses/{expense['id']}/allocate-account-smart", json={
            "account_id": fake_account_id,
            "mode": "topup_existing"
        })
        
        assert resp.status_code == 404, f"Should return 404 for non-existent account, got {resp.status_code}"
        print(f"✓ Non-existent account returns 404")


class TestTopUpLabelFormat:
    """Tests for the top-up label format: 'Recharge auto pour <description>'"""
    
    @pytest.fixture(autouse=True)
    def setup_and_cleanup(self):
        self.created_expenses = []
        self.created_accounts = []
        yield
        for exp_id in self.created_expenses:
            try:
                requests.delete(f"{BASE_URL}/api/expenses/{exp_id}")
            except:
                pass
        for acc_id in self.created_accounts:
            try:
                requests.delete(f"{BASE_URL}/api/current-accounts/{acc_id}")
            except:
                pass
    
    def test_topup_label_contains_description(self):
        """Verify top-up label format is 'Recharge auto pour <description>'"""
        # Create account
        resp = requests.post(f"{BASE_URL}/api/current-accounts", json={
            "name": "TEST Label Format",
            "total_advance": 1000,
            "received_date": datetime.now().strftime("%Y-%m-%d")
        })
        account = resp.json()['account']
        self.created_accounts.append(account['id'])
        
        # Create expense with specific description
        expense_desc = "Achat légumes marché"
        resp = requests.post(f"{BASE_URL}/api/expenses", json={
            "category": "cuisine",
            "description": expense_desc,
            "quantity": 1,
            "unit_price": 5000,
            "amount": 5000,
            "requested_by": "Test"
        })
        expense = resp.json()['expense']
        self.created_expenses.append(expense['id'])
        
        # Approve expense
        requests.put(f"{BASE_URL}/api/expenses/{expense['id']}", json={"status": "approved"})
        
        # Smart allocate with topup
        resp = requests.post(f"{BASE_URL}/api/expenses/{expense['id']}/allocate-account-smart", json={
            "account_id": account['id'],
            "mode": "topup_existing"
        })
        
        assert resp.status_code == 200
        
        # Check top_ups label
        resp = requests.get(f"{BASE_URL}/api/current-accounts")
        updated_account = next((a for a in resp.json()['accounts'] if a['id'] == account['id']), None)
        
        top_ups = updated_account.get('top_ups', [])
        assert len(top_ups) >= 1
        
        label = top_ups[-1]['label']
        assert label.startswith('Recharge auto pour'), f"Label should start with 'Recharge auto pour', got: {label}"
        assert expense_desc in label, f"Label should contain expense description '{expense_desc}', got: {label}"
        
        print(f"✓ Top-up label format correct: '{label}'")


class TestCompletedExpenseAllocation:
    """Tests for allocating completed expenses (new feature in iter61)"""
    
    @pytest.fixture(autouse=True)
    def setup_and_cleanup(self):
        self.created_expenses = []
        self.created_accounts = []
        yield
        for exp_id in self.created_expenses:
            try:
                requests.delete(f"{BASE_URL}/api/expenses/{exp_id}")
            except:
                pass
        for acc_id in self.created_accounts:
            try:
                requests.delete(f"{BASE_URL}/api/current-accounts/{acc_id}")
            except:
                pass
    
    def test_allocate_completed_expense(self):
        """Test that completed expenses can be allocated to accounts"""
        # Create account
        resp = requests.post(f"{BASE_URL}/api/current-accounts", json={
            "name": "TEST Completed Allocation",
            "total_advance": 100000,
            "received_date": datetime.now().strftime("%Y-%m-%d")
        })
        account = resp.json()['account']
        self.created_accounts.append(account['id'])
        
        # Create expense and move to completed
        resp = requests.post(f"{BASE_URL}/api/expenses", json={
            "category": "cuisine",
            "description": "TEST completed expense allocation",
            "quantity": 1,
            "unit_price": 25000,
            "amount": 25000,
            "requested_by": "Test"
        })
        expense = resp.json()['expense']
        self.created_expenses.append(expense['id'])
        
        # Move to approved then completed
        requests.put(f"{BASE_URL}/api/expenses/{expense['id']}", json={"status": "approved"})
        requests.put(f"{BASE_URL}/api/expenses/{expense['id']}", json={"status": "completed"})
        
        # Verify status is completed
        resp = requests.get(f"{BASE_URL}/api/expenses")
        exp = next((e for e in resp.json()['expenses'] if e['id'] == expense['id']), None)
        assert exp['status'] == 'completed', f"Expense should be completed, got {exp['status']}"
        
        # Allocate completed expense using smart endpoint
        resp = requests.post(f"{BASE_URL}/api/expenses/{expense['id']}/allocate-account-smart", json={
            "account_id": account['id'],
            "mode": "topup_existing"
        })
        
        assert resp.status_code == 200, f"Should allow allocating completed expense: {resp.text}"
        data = resp.json()
        assert data['success'] == True
        assert data['expense']['funded_by_account_id'] == account['id']
        
        print(f"✓ Completed expense successfully allocated to account")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
