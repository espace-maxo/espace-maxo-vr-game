"""
Test iteration 63: Top-up feature for current accounts
- POST /api/current-accounts/{id}/top-up endpoint
- Validates amount > 0
- Records top_ups[] entry with label
- Increments total_advance
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestTopUpEndpoint:
    """Test the new POST /api/current-accounts/{id}/top-up endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup_test_account(self):
        """Create a test account before each test and clean up after"""
        self.test_account_id = None
        # Create test account
        payload = {
            "name": f"TEST_TopUp_Account_{uuid.uuid4().hex[:8]}",
            "total_advance": 5000,
            "received_date": "2026-01-15",
            "description": "Test account for top-up testing"
        }
        response = requests.post(f"{BASE_URL}/api/current-accounts", json=payload)
        assert response.status_code == 200, f"Failed to create test account: {response.text}"
        self.test_account_id = response.json()["account"]["id"]
        self.initial_advance = 5000
        yield
        # Cleanup
        if self.test_account_id:
            requests.delete(f"{BASE_URL}/api/current-accounts/{self.test_account_id}")
    
    def test_topup_success_basic(self):
        """Test basic top-up with amount and default label"""
        response = requests.post(
            f"{BASE_URL}/api/current-accounts/{self.test_account_id}/top-up",
            json={"amount": 15000}
        )
        assert response.status_code == 200, f"Top-up failed: {response.text}"
        data = response.json()
        assert data["success"] is True
        assert data["top_up"]["amount"] == 15000
        assert data["top_up"]["label"] == "Recharge manuelle"  # default label
        
        # Verify total_advance increased
        get_resp = requests.get(f"{BASE_URL}/api/current-accounts/{self.test_account_id}")
        assert get_resp.status_code == 200
        account = get_resp.json()
        assert account["total_advance"] == 5000 + 15000  # 20000
        print(f"✓ Top-up success: total_advance = {account['total_advance']} F")
    
    def test_topup_with_custom_label(self):
        """Test top-up with custom label"""
        response = requests.post(
            f"{BASE_URL}/api/current-accounts/{self.test_account_id}/top-up",
            json={"amount": 10000, "label": "Recharge mensuelle"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["top_up"]["label"] == "Recharge mensuelle"
        print(f"✓ Custom label: {data['top_up']['label']}")
    
    def test_topup_with_received_date(self):
        """Test top-up with custom received_date"""
        response = requests.post(
            f"{BASE_URL}/api/current-accounts/{self.test_account_id}/top-up",
            json={"amount": 5000, "label": "Recharge janvier", "received_date": "2026-01-20"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["top_up"]["received_date"] == "2026-01-20"
        print(f"✓ Custom received_date: {data['top_up']['received_date']}")
    
    def test_topup_negative_amount_rejected(self):
        """Test that negative amount is rejected with 400"""
        response = requests.post(
            f"{BASE_URL}/api/current-accounts/{self.test_account_id}/top-up",
            json={"amount": -5000}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print(f"✓ Negative amount rejected: {response.json()}")
    
    def test_topup_zero_amount_rejected(self):
        """Test that zero amount is rejected with 400"""
        response = requests.post(
            f"{BASE_URL}/api/current-accounts/{self.test_account_id}/top-up",
            json={"amount": 0}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print(f"✓ Zero amount rejected: {response.json()}")
    
    def test_topup_creates_topups_array_entry(self):
        """Test that top-up creates entry in top_ups[] array"""
        # First top-up
        response1 = requests.post(
            f"{BASE_URL}/api/current-accounts/{self.test_account_id}/top-up",
            json={"amount": 10000, "label": "Première recharge"}
        )
        assert response1.status_code == 200
        
        # Second top-up
        response2 = requests.post(
            f"{BASE_URL}/api/current-accounts/{self.test_account_id}/top-up",
            json={"amount": 5000, "label": "Deuxième recharge"}
        )
        assert response2.status_code == 200
        
        # Verify top_ups array
        get_resp = requests.get(f"{BASE_URL}/api/current-accounts/{self.test_account_id}")
        account = get_resp.json()
        top_ups = account.get("top_ups", [])
        assert len(top_ups) == 2, f"Expected 2 top_ups, got {len(top_ups)}"
        assert top_ups[0]["amount"] == 10000
        assert top_ups[0]["label"] == "Première recharge"
        assert top_ups[1]["amount"] == 5000
        assert top_ups[1]["label"] == "Deuxième recharge"
        print(f"✓ top_ups[] array has {len(top_ups)} entries")
    
    def test_topup_account_not_found(self):
        """Test 404 for non-existent account"""
        fake_id = str(uuid.uuid4())
        response = requests.post(
            f"{BASE_URL}/api/current-accounts/{fake_id}/top-up",
            json={"amount": 5000}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ Non-existent account returns 404")
    
    def test_topup_fully_repaid_account(self):
        """Test that top-up works even on fully repaid account"""
        # First, add repayment to make account fully repaid
        requests.post(
            f"{BASE_URL}/api/current-accounts/{self.test_account_id}/repayments",
            json={"repayment_date": "2026-01-15", "amount": 5000, "method": "cash"}
        )
        
        # Verify account is fully repaid
        get_resp = requests.get(f"{BASE_URL}/api/current-accounts/{self.test_account_id}")
        account = get_resp.json()
        assert account["is_fully_repaid"] is True, "Account should be fully repaid"
        
        # Now top-up should still work
        response = requests.post(
            f"{BASE_URL}/api/current-accounts/{self.test_account_id}/top-up",
            json={"amount": 10000, "label": "Relance compte clôturé"}
        )
        assert response.status_code == 200, f"Top-up on fully repaid account failed: {response.text}"
        
        # Verify new total_advance
        get_resp2 = requests.get(f"{BASE_URL}/api/current-accounts/{self.test_account_id}")
        account2 = get_resp2.json()
        assert account2["total_advance"] == 15000  # 5000 + 10000
        assert account2["is_fully_repaid"] is False  # No longer fully repaid
        print(f"✓ Top-up on fully repaid account works: new total_advance = {account2['total_advance']} F")


class TestTopUpIntegrationWithSmartAllocate:
    """Test that auto top-ups from smart-allocate also appear in top_ups[]"""
    
    @pytest.fixture(autouse=True)
    def setup_test_data(self):
        """Create test account and expense"""
        self.test_account_id = None
        self.test_expense_id = None
        
        # Create test account with low balance
        acc_payload = {
            "name": f"TEST_SmartAlloc_Account_{uuid.uuid4().hex[:8]}",
            "total_advance": 10000,
            "received_date": "2026-01-15"
        }
        acc_resp = requests.post(f"{BASE_URL}/api/current-accounts", json=acc_payload)
        assert acc_resp.status_code == 200
        self.test_account_id = acc_resp.json()["account"]["id"]
        
        # Create test expense larger than account balance (using correct format)
        exp_payload = {
            "description": f"TEST_Expense_SmartAlloc_{uuid.uuid4().hex[:8]}",
            "quantity": 1,
            "unit_price": 25000,
            "amount": 25000,
            "category": "cuisine",
            "supplier": "Test Supplier",
            "planned_date": "2026-01-20",
            "requested_by": "Admin"
        }
        exp_resp = requests.post(f"{BASE_URL}/api/expenses", json=exp_payload)
        assert exp_resp.status_code == 200, f"Failed to create expense: {exp_resp.text}"
        self.test_expense_id = exp_resp.json()["expense"]["id"]
        
        # Validate the expense so it can be allocated
        validate_resp = requests.put(
            f"{BASE_URL}/api/expenses/{self.test_expense_id}",
            json={"status": "validated"}
        )
        assert validate_resp.status_code == 200, f"Failed to validate expense: {validate_resp.text}"
        
        yield
        
        # Cleanup
        if self.test_account_id:
            requests.delete(f"{BASE_URL}/api/current-accounts/{self.test_account_id}")
        if self.test_expense_id:
            requests.delete(f"{BASE_URL}/api/expenses/{self.test_expense_id}")
    
    def test_smart_allocate_topup_existing_creates_topups_entry(self):
        """Test that smart-allocate with mode='topup_existing' creates top_ups[] entry"""
        # Use smart-allocate with topup_existing mode
        response = requests.post(
            f"{BASE_URL}/api/expenses/{self.test_expense_id}/allocate-account-smart",
            json={
                "account_id": self.test_account_id,
                "mode": "topup_existing"
            }
        )
        assert response.status_code == 200, f"Smart allocate failed: {response.text}"
        
        # Verify top_ups[] entry was created
        get_resp = requests.get(f"{BASE_URL}/api/current-accounts/{self.test_account_id}")
        account = get_resp.json()
        top_ups = account.get("top_ups", [])
        assert len(top_ups) >= 1, f"Expected at least 1 top_up entry, got {len(top_ups)}"
        
        # Find the auto top-up entry
        auto_topup = next((t for t in top_ups if "Recharge auto" in t.get("label", "")), None)
        assert auto_topup is not None, "Auto top-up entry not found in top_ups[]"
        assert auto_topup["amount"] == 15000  # 25000 - 10000 = 15000 missing
        print(f"✓ Smart-allocate created top_ups[] entry: {auto_topup['label']} = {auto_topup['amount']} F")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
