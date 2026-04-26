"""
Iteration 69 - Schedule Edit, Mark-Paid, Delete Tests
Tests for:
1. PUT /api/current-accounts/{accountId}/schedule/{scheduleId} - Edit schedule entry
2. POST /api/current-accounts/{accountId}/schedule/{scheduleId}/mark-paid - Mark as paid
3. DELETE /api/current-accounts/{accountId}/schedule/{scheduleId} - Delete schedule entry
4. Enrich logic: schedule entry is 'paid' if repayment has matching schedule_id OR cumulative logic
5. Idempotency: mark-paid returns already_paid=true if repayment exists
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestScheduleEditMarkPaidDelete:
    """Tests for schedule inline edit, mark-paid, and delete features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data - create a test account with schedule"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.test_account_id = None
        self.test_schedule_ids = []
        
        # Create test account with 3 schedule entries
        today = datetime.now()
        schedule = [
            {
                "label": "Acompte 1",
                "due_date": (today + timedelta(days=30)).strftime("%Y-%m-%d"),
                "expected_amount": 10000
            },
            {
                "label": "Acompte 2",
                "due_date": (today + timedelta(days=60)).strftime("%Y-%m-%d"),
                "expected_amount": 15000
            },
            {
                "label": "Solde final",
                "due_date": (today + timedelta(days=90)).strftime("%Y-%m-%d"),
                "expected_amount": 25000
            }
        ]
        
        payload = {
            "name": f"TEST_Iter69_Schedule_{uuid.uuid4().hex[:8]}",
            "total_advance": 50000,
            "received_date": today.strftime("%Y-%m-%d"),
            "description": "Test account for schedule edit/mark-paid/delete",
            "schedule": schedule
        }
        
        response = self.session.post(f"{BASE_URL}/api/current-accounts", json=payload)
        assert response.status_code == 200, f"Failed to create test account: {response.text}"
        data = response.json()
        self.test_account_id = data["account"]["id"]
        self.test_schedule_ids = [s["id"] for s in data["account"]["schedule"]]
        
        yield
        
        # Cleanup - delete test account
        if self.test_account_id:
            try:
                self.session.delete(f"{BASE_URL}/api/current-accounts/{self.test_account_id}")
            except:
                pass
    
    # ==================== PUT /schedule/{scheduleId} Tests ====================
    
    def test_update_schedule_entry_label(self):
        """Test updating schedule entry label"""
        schedule_id = self.test_schedule_ids[0]
        
        response = self.session.put(
            f"{BASE_URL}/api/current-accounts/{self.test_account_id}/schedule/{schedule_id}",
            json={"label": "Acompte 1 réajusté"}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["success"] == True
        
        # Verify the change persisted
        get_response = self.session.get(f"{BASE_URL}/api/current-accounts/{self.test_account_id}")
        assert get_response.status_code == 200
        account = get_response.json()
        updated_entry = next((s for s in account["schedule"] if s["id"] == schedule_id), None)
        assert updated_entry is not None
        assert updated_entry["label"] == "Acompte 1 réajusté"
        print("✓ Schedule entry label updated successfully")
    
    def test_update_schedule_entry_due_date(self):
        """Test updating schedule entry due_date"""
        schedule_id = self.test_schedule_ids[0]
        new_date = (datetime.now() + timedelta(days=45)).strftime("%Y-%m-%d")
        
        response = self.session.put(
            f"{BASE_URL}/api/current-accounts/{self.test_account_id}/schedule/{schedule_id}",
            json={"due_date": new_date}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        
        # Verify the change persisted
        get_response = self.session.get(f"{BASE_URL}/api/current-accounts/{self.test_account_id}")
        account = get_response.json()
        updated_entry = next((s for s in account["schedule"] if s["id"] == schedule_id), None)
        assert updated_entry["due_date"] == new_date
        print(f"✓ Schedule entry due_date updated to {new_date}")
    
    def test_update_schedule_entry_expected_amount(self):
        """Test updating schedule entry expected_amount"""
        schedule_id = self.test_schedule_ids[0]
        
        response = self.session.put(
            f"{BASE_URL}/api/current-accounts/{self.test_account_id}/schedule/{schedule_id}",
            json={"expected_amount": 12000}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        
        # Verify the change persisted
        get_response = self.session.get(f"{BASE_URL}/api/current-accounts/{self.test_account_id}")
        account = get_response.json()
        updated_entry = next((s for s in account["schedule"] if s["id"] == schedule_id), None)
        assert updated_entry["expected_amount"] == 12000
        print("✓ Schedule entry expected_amount updated to 12000")
    
    def test_update_schedule_entry_all_fields(self):
        """Test updating all fields at once"""
        schedule_id = self.test_schedule_ids[1]
        new_date = (datetime.now() + timedelta(days=75)).strftime("%Y-%m-%d")
        
        response = self.session.put(
            f"{BASE_URL}/api/current-accounts/{self.test_account_id}/schedule/{schedule_id}",
            json={
                "label": "Acompte 2 modifié",
                "due_date": new_date,
                "expected_amount": 18000
            }
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        
        # Verify all changes persisted
        get_response = self.session.get(f"{BASE_URL}/api/current-accounts/{self.test_account_id}")
        account = get_response.json()
        updated_entry = next((s for s in account["schedule"] if s["id"] == schedule_id), None)
        assert updated_entry["label"] == "Acompte 2 modifié"
        assert updated_entry["due_date"] == new_date
        assert updated_entry["expected_amount"] == 18000
        print("✓ All schedule entry fields updated successfully")
    
    def test_update_schedule_entry_not_found(self):
        """Test updating non-existent schedule entry returns 404"""
        fake_schedule_id = str(uuid.uuid4())
        
        response = self.session.put(
            f"{BASE_URL}/api/current-accounts/{self.test_account_id}/schedule/{fake_schedule_id}",
            json={"label": "Test"}
        )
        
        assert response.status_code == 404
        print("✓ Non-existent schedule entry returns 404")
    
    def test_update_schedule_account_not_found(self):
        """Test updating schedule on non-existent account returns 404"""
        fake_account_id = str(uuid.uuid4())
        
        response = self.session.put(
            f"{BASE_URL}/api/current-accounts/{fake_account_id}/schedule/{self.test_schedule_ids[0]}",
            json={"label": "Test"}
        )
        
        assert response.status_code == 404
        print("✓ Non-existent account returns 404")
    
    # ==================== POST /schedule/{scheduleId}/mark-paid Tests ====================
    
    def test_mark_schedule_as_paid_creates_repayment(self):
        """Test marking schedule as paid creates a repayment with schedule_id"""
        schedule_id = self.test_schedule_ids[0]
        
        # Get original expected_amount
        get_response = self.session.get(f"{BASE_URL}/api/current-accounts/{self.test_account_id}")
        account = get_response.json()
        schedule_entry = next((s for s in account["schedule"] if s["id"] == schedule_id), None)
        expected_amount = schedule_entry["expected_amount"]
        
        response = self.session.post(
            f"{BASE_URL}/api/current-accounts/{self.test_account_id}/schedule/{schedule_id}/mark-paid",
            json={"method": "mobile_money", "reference": "TEST-REF-001"}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["success"] == True
        assert "repayment" in data
        assert data["repayment"]["schedule_id"] == schedule_id
        assert data["repayment"]["amount"] == expected_amount
        assert data["repayment"]["method"] == "mobile_money"
        assert data["repayment"]["reference"] == "TEST-REF-001"
        assert data.get("already_paid") != True  # First time marking
        
        # Verify schedule entry is now marked as paid
        get_response = self.session.get(f"{BASE_URL}/api/current-accounts/{self.test_account_id}")
        account = get_response.json()
        updated_entry = next((s for s in account["schedule"] if s["id"] == schedule_id), None)
        assert updated_entry["paid"] == True
        print(f"✓ Schedule marked as paid, repayment created with amount {expected_amount}")
    
    def test_mark_schedule_as_paid_idempotent(self):
        """Test marking same schedule as paid twice returns already_paid=true"""
        schedule_id = self.test_schedule_ids[1]
        
        # First mark as paid
        response1 = self.session.post(
            f"{BASE_URL}/api/current-accounts/{self.test_account_id}/schedule/{schedule_id}/mark-paid",
            json={}
        )
        assert response1.status_code == 200
        assert response1.json().get("already_paid") != True
        
        # Second mark as paid - should be idempotent
        response2 = self.session.post(
            f"{BASE_URL}/api/current-accounts/{self.test_account_id}/schedule/{schedule_id}/mark-paid",
            json={}
        )
        assert response2.status_code == 200
        data = response2.json()
        assert data["success"] == True
        assert data["already_paid"] == True
        print("✓ Mark-paid is idempotent - second call returns already_paid=true")
    
    def test_mark_schedule_as_paid_with_amount_override(self):
        """Test marking schedule as paid with custom amount"""
        schedule_id = self.test_schedule_ids[2]
        custom_amount = 20000  # Different from expected_amount (25000)
        
        response = self.session.post(
            f"{BASE_URL}/api/current-accounts/{self.test_account_id}/schedule/{schedule_id}/mark-paid",
            json={"amount_override": custom_amount, "notes": "Partial payment"}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["repayment"]["amount"] == custom_amount
        assert data["repayment"]["notes"] == "Partial payment"
        print(f"✓ Mark-paid with amount_override={custom_amount} works")
    
    def test_mark_schedule_as_paid_not_found(self):
        """Test marking non-existent schedule returns 404"""
        fake_schedule_id = str(uuid.uuid4())
        
        response = self.session.post(
            f"{BASE_URL}/api/current-accounts/{self.test_account_id}/schedule/{fake_schedule_id}/mark-paid",
            json={}
        )
        
        assert response.status_code == 404
        print("✓ Non-existent schedule returns 404 for mark-paid")
    
    # ==================== DELETE /schedule/{scheduleId} Tests ====================
    
    def test_delete_schedule_entry(self):
        """Test deleting a schedule entry"""
        # Create a new account for this test to avoid conflicts
        today = datetime.now()
        payload = {
            "name": f"TEST_Delete_Schedule_{uuid.uuid4().hex[:8]}",
            "total_advance": 30000,
            "received_date": today.strftime("%Y-%m-%d"),
            "schedule": [
                {"label": "Entry 1", "due_date": (today + timedelta(days=30)).strftime("%Y-%m-%d"), "expected_amount": 10000},
                {"label": "Entry 2", "due_date": (today + timedelta(days=60)).strftime("%Y-%m-%d"), "expected_amount": 20000}
            ]
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/current-accounts", json=payload)
        assert create_response.status_code == 200
        account = create_response.json()["account"]
        account_id = account["id"]
        schedule_ids = [s["id"] for s in account["schedule"]]
        
        try:
            # Delete first schedule entry
            delete_response = self.session.delete(
                f"{BASE_URL}/api/current-accounts/{account_id}/schedule/{schedule_ids[0]}"
            )
            assert delete_response.status_code == 200
            assert delete_response.json()["success"] == True
            
            # Verify entry is deleted
            get_response = self.session.get(f"{BASE_URL}/api/current-accounts/{account_id}")
            updated_account = get_response.json()
            assert len(updated_account["schedule"]) == 1
            assert updated_account["schedule"][0]["id"] == schedule_ids[1]
            print("✓ Schedule entry deleted successfully")
        finally:
            # Cleanup
            self.session.delete(f"{BASE_URL}/api/current-accounts/{account_id}")
    
    def test_delete_schedule_entry_not_found(self):
        """Test deleting non-existent schedule entry"""
        fake_schedule_id = str(uuid.uuid4())
        
        # Note: The current implementation returns 200 even if schedule_id doesn't exist
        # because $pull doesn't fail if element not found. This is acceptable behavior.
        response = self.session.delete(
            f"{BASE_URL}/api/current-accounts/{self.test_account_id}/schedule/{fake_schedule_id}"
        )
        
        # Should return 200 (MongoDB $pull is idempotent)
        assert response.status_code == 200
        print("✓ Delete non-existent schedule entry is idempotent (returns 200)")
    
    def test_delete_schedule_account_not_found(self):
        """Test deleting schedule on non-existent account returns 404"""
        fake_account_id = str(uuid.uuid4())
        
        response = self.session.delete(
            f"{BASE_URL}/api/current-accounts/{fake_account_id}/schedule/{self.test_schedule_ids[0]}"
        )
        
        assert response.status_code == 404
        print("✓ Non-existent account returns 404 for delete schedule")
    
    # ==================== Enrich Logic Tests ====================
    
    def test_enrich_paid_via_schedule_id(self):
        """Test that schedule entry is marked paid when repayment has matching schedule_id"""
        # Create fresh account
        today = datetime.now()
        payload = {
            "name": f"TEST_Enrich_ScheduleId_{uuid.uuid4().hex[:8]}",
            "total_advance": 50000,
            "received_date": today.strftime("%Y-%m-%d"),
            "schedule": [
                {"label": "Entry 1", "due_date": (today + timedelta(days=30)).strftime("%Y-%m-%d"), "expected_amount": 10000},
                {"label": "Entry 2", "due_date": (today + timedelta(days=60)).strftime("%Y-%m-%d"), "expected_amount": 20000}
            ]
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/current-accounts", json=payload)
        account = create_response.json()["account"]
        account_id = account["id"]
        schedule_id_1 = account["schedule"][0]["id"]
        
        try:
            # Initially, both entries should be unpaid
            get_response = self.session.get(f"{BASE_URL}/api/current-accounts/{account_id}")
            account = get_response.json()
            assert account["schedule"][0]["paid"] == False
            assert account["schedule"][1]["paid"] == False
            
            # Mark first entry as paid
            self.session.post(
                f"{BASE_URL}/api/current-accounts/{account_id}/schedule/{schedule_id_1}/mark-paid",
                json={}
            )
            
            # Now first entry should be paid (via schedule_id), second still unpaid
            get_response = self.session.get(f"{BASE_URL}/api/current-accounts/{account_id}")
            account = get_response.json()
            entry_1 = next(s for s in account["schedule"] if s["id"] == schedule_id_1)
            entry_2 = next(s for s in account["schedule"] if s["id"] != schedule_id_1)
            
            assert entry_1["paid"] == True, "Entry 1 should be paid via schedule_id"
            assert entry_2["paid"] == False, "Entry 2 should still be unpaid"
            print("✓ Enrich logic correctly marks entry as paid via schedule_id")
        finally:
            self.session.delete(f"{BASE_URL}/api/current-accounts/{account_id}")
    
    def test_enrich_paid_via_cumulative_logic(self):
        """Test that schedule entry is marked paid when total_repaid >= cumulative_expected"""
        # Create fresh account
        today = datetime.now()
        payload = {
            "name": f"TEST_Enrich_Cumulative_{uuid.uuid4().hex[:8]}",
            "total_advance": 50000,
            "received_date": today.strftime("%Y-%m-%d"),
            "schedule": [
                {"label": "Entry 1", "due_date": (today + timedelta(days=30)).strftime("%Y-%m-%d"), "expected_amount": 10000},
                {"label": "Entry 2", "due_date": (today + timedelta(days=60)).strftime("%Y-%m-%d"), "expected_amount": 15000}
            ]
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/current-accounts", json=payload)
        account = create_response.json()["account"]
        account_id = account["id"]
        
        try:
            # Add a manual repayment of 25000 (covers both entries: 10000 + 15000 = 25000)
            repay_response = self.session.post(
                f"{BASE_URL}/api/current-accounts/{account_id}/repayments",
                json={
                    "repayment_date": today.strftime("%Y-%m-%d"),
                    "amount": 25000,
                    "method": "cash",
                    "reference": "Manual payment"
                }
            )
            assert repay_response.status_code == 200
            
            # Both entries should now be paid via cumulative logic
            get_response = self.session.get(f"{BASE_URL}/api/current-accounts/{account_id}")
            account = get_response.json()
            
            assert account["schedule"][0]["paid"] == True, "Entry 1 should be paid (cumulative)"
            assert account["schedule"][1]["paid"] == True, "Entry 2 should be paid (cumulative)"
            assert account["total_repaid"] == 25000
            print("✓ Enrich logic correctly marks entries as paid via cumulative logic")
        finally:
            self.session.delete(f"{BASE_URL}/api/current-accounts/{account_id}")


class TestRegressionExistingFeatures:
    """Regression tests to ensure existing features still work"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.test_account_ids = []
        yield
        # Cleanup
        for acc_id in self.test_account_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/current-accounts/{acc_id}")
            except:
                pass
    
    def test_create_account_with_schedule(self):
        """Regression: Creating account with schedule still works"""
        today = datetime.now()
        payload = {
            "name": f"TEST_Regression_Create_{uuid.uuid4().hex[:8]}",
            "total_advance": 100000,
            "received_date": today.strftime("%Y-%m-%d"),
            "schedule": [
                {"label": "Month 1", "due_date": (today + timedelta(days=30)).strftime("%Y-%m-%d"), "expected_amount": 25000},
                {"label": "Month 2", "due_date": (today + timedelta(days=60)).strftime("%Y-%m-%d"), "expected_amount": 25000}
            ]
        }
        
        response = self.session.post(f"{BASE_URL}/api/current-accounts", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert len(data["account"]["schedule"]) == 2
        self.test_account_ids.append(data["account"]["id"])
        print("✓ Regression: Create account with schedule works")
    
    def test_update_account_schedule_via_put(self):
        """Regression: Updating entire schedule via PUT /current-accounts/{id} still works"""
        today = datetime.now()
        
        # Create account
        create_payload = {
            "name": f"TEST_Regression_Update_{uuid.uuid4().hex[:8]}",
            "total_advance": 50000,
            "schedule": [
                {"label": "Old Entry", "due_date": (today + timedelta(days=30)).strftime("%Y-%m-%d"), "expected_amount": 10000}
            ]
        }
        create_response = self.session.post(f"{BASE_URL}/api/current-accounts", json=create_payload)
        account_id = create_response.json()["account"]["id"]
        self.test_account_ids.append(account_id)
        
        # Update entire schedule
        update_payload = {
            "schedule": [
                {"label": "New Entry 1", "due_date": (today + timedelta(days=45)).strftime("%Y-%m-%d"), "expected_amount": 15000},
                {"label": "New Entry 2", "due_date": (today + timedelta(days=90)).strftime("%Y-%m-%d"), "expected_amount": 35000}
            ]
        }
        update_response = self.session.put(f"{BASE_URL}/api/current-accounts/{account_id}", json=update_payload)
        assert update_response.status_code == 200
        
        # Verify
        get_response = self.session.get(f"{BASE_URL}/api/current-accounts/{account_id}")
        account = get_response.json()
        assert len(account["schedule"]) == 2
        assert account["schedule"][0]["label"] == "New Entry 1"
        print("✓ Regression: Update entire schedule via PUT works")
    
    def test_add_manual_repayment(self):
        """Regression: Adding manual repayment still works"""
        today = datetime.now()
        
        # Create account
        create_payload = {
            "name": f"TEST_Regression_Repay_{uuid.uuid4().hex[:8]}",
            "total_advance": 50000
        }
        create_response = self.session.post(f"{BASE_URL}/api/current-accounts", json=create_payload)
        account_id = create_response.json()["account"]["id"]
        self.test_account_ids.append(account_id)
        
        # Add repayment
        repay_response = self.session.post(
            f"{BASE_URL}/api/current-accounts/{account_id}/repayments",
            json={
                "repayment_date": today.strftime("%Y-%m-%d"),
                "amount": 10000,
                "method": "bank_transfer",
                "reference": "VIR-001"
            }
        )
        assert repay_response.status_code == 200
        
        # Verify
        get_response = self.session.get(f"{BASE_URL}/api/current-accounts/{account_id}")
        account = get_response.json()
        assert account["total_repaid"] == 10000
        assert len(account["repayments"]) == 1
        print("✓ Regression: Add manual repayment works")
    
    def test_delete_repayment(self):
        """Regression: Deleting repayment still works"""
        today = datetime.now()
        
        # Create account with repayment
        create_payload = {
            "name": f"TEST_Regression_DeleteRepay_{uuid.uuid4().hex[:8]}",
            "total_advance": 50000
        }
        create_response = self.session.post(f"{BASE_URL}/api/current-accounts", json=create_payload)
        account_id = create_response.json()["account"]["id"]
        self.test_account_ids.append(account_id)
        
        # Add repayment
        repay_response = self.session.post(
            f"{BASE_URL}/api/current-accounts/{account_id}/repayments",
            json={"repayment_date": today.strftime("%Y-%m-%d"), "amount": 5000, "method": "cash"}
        )
        repayment_id = repay_response.json()["repayment"]["id"]
        
        # Delete repayment
        delete_response = self.session.delete(
            f"{BASE_URL}/api/current-accounts/{account_id}/repayments/{repayment_id}"
        )
        assert delete_response.status_code == 200
        
        # Verify
        get_response = self.session.get(f"{BASE_URL}/api/current-accounts/{account_id}")
        account = get_response.json()
        assert account["total_repaid"] == 0
        assert len(account["repayments"]) == 0
        print("✓ Regression: Delete repayment works")
    
    def test_auto_deduction_endpoint(self):
        """Regression: Auto-deduction endpoint still works"""
        response = self.session.post(
            f"{BASE_URL}/api/current-accounts/run-auto-deduction",
            json={"date": datetime.now().strftime("%Y-%m-%d")}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert "accounts_processed" in data
        print("✓ Regression: Auto-deduction endpoint works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
