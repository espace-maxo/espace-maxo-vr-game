"""
Test suite for Financial Points (Point Financier) feature
Tests the complete workflow: Create -> Admin Validate -> Sign -> Lock

Endpoints tested:
- POST /api/financial-points (create with period_type weekly/daily)
- GET /api/financial-points (retrieve with filters)
- GET /api/financial-points/{id} (get single point)
- PUT /api/financial-points/{id} (update, blocked after signing for non-admin)
- POST /api/financial-points/{id}/admin-validate (admin validation)
- POST /api/financial-points/{id}/sign (signing after admin validation)
- DELETE /api/financial-points/{id} (only admin can delete signed points)
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://caisse-mon-point.preview.emergentagent.com')

@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def unique_date():
    """Generate a unique date for testing to avoid conflicts"""
    # Use a date far in the future to avoid conflicts with existing data
    future_date = datetime.now() + timedelta(days=365 + int(uuid.uuid4().hex[:4], 16) % 365)
    return future_date.strftime("%Y-%m-%d")

@pytest.fixture
def unique_week_dates():
    """Generate unique week start/end dates for testing"""
    # Use a date far in the future
    future_date = datetime.now() + timedelta(days=730 + int(uuid.uuid4().hex[:4], 16) % 365)
    # Find Monday of that week
    monday = future_date - timedelta(days=future_date.weekday())
    sunday = monday + timedelta(days=6)
    return {
        "start": monday.strftime("%Y-%m-%d"),
        "end": sunday.strftime("%Y-%m-%d")
    }

class TestFinancialPointsCreate:
    """Tests for creating financial points"""
    
    def test_create_weekly_financial_point(self, api_client, unique_week_dates):
        """Test creating a weekly financial point"""
        payload = {
            "date": unique_week_dates["start"],
            "end_date": unique_week_dates["end"],
            "period_type": "weekly",
            "cash_amount": 50000,
            "mobile_amount": 25000,
            "card_amount": 15000,
            "cheque_amount": 5000,
            "wallet_amount": 3000,
            "other_amount": 2000,
            "notes": "Test weekly point",
            "created_by": "Test Manager"
        }
        
        response = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("success") == True
        assert "financial_point" in data
        
        point = data["financial_point"]
        assert point["date"] == unique_week_dates["start"]
        assert point["end_date"] == unique_week_dates["end"]
        assert point["period_type"] == "weekly"
        assert point["cash_amount"] == 50000
        assert point["mobile_amount"] == 25000
        assert point["card_amount"] == 15000
        assert point["cheque_amount"] == 5000
        assert point["wallet_amount"] == 3000
        assert point["other_amount"] == 2000
        assert point["total_amount"] == 100000  # Sum of all amounts
        assert point["status"] == "pending"
        assert point["admin_validated"] == False
        assert point["signed"] == False
        assert "id" in point
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/financial-points/{point['id']}?is_admin=true")
        print("✅ test_create_weekly_financial_point PASSED")
    
    def test_create_daily_financial_point(self, api_client, unique_date):
        """Test creating a daily financial point"""
        payload = {
            "date": unique_date,
            "end_date": "",
            "period_type": "daily",
            "cash_amount": 10000,
            "mobile_amount": 5000,
            "card_amount": 3000,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "other_amount": 0,
            "notes": "Test daily point",
            "created_by": "Test Manager"
        }
        
        response = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("success") == True
        point = data["financial_point"]
        assert point["period_type"] == "daily"
        assert point["total_amount"] == 18000
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/financial-points/{point['id']}?is_admin=true")
        print("✅ test_create_daily_financial_point PASSED")
    
    def test_create_duplicate_point_fails(self, api_client, unique_date):
        """Test that creating a duplicate point for same date fails"""
        payload = {
            "date": unique_date,
            "end_date": "",
            "period_type": "daily",
            "cash_amount": 10000,
            "mobile_amount": 0,
            "card_amount": 0,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "other_amount": 0,
            "notes": "First point",
            "created_by": "Test Manager"
        }
        
        # Create first point
        response1 = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        assert response1.status_code == 200
        point_id = response1.json()["financial_point"]["id"]
        
        # Try to create duplicate
        payload["notes"] = "Duplicate point"
        response2 = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        
        assert response2.status_code == 400
        assert "existe déjà" in response2.json().get("detail", "")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/financial-points/{point_id}?is_admin=true")
        print("✅ test_create_duplicate_point_fails PASSED")


class TestFinancialPointsRetrieve:
    """Tests for retrieving financial points"""
    
    def test_get_all_financial_points(self, api_client):
        """Test retrieving all financial points"""
        response = api_client.get(f"{BASE_URL}/api/financial-points")
        
        assert response.status_code == 200
        data = response.json()
        assert "financial_points" in data
        assert isinstance(data["financial_points"], list)
        print("✅ test_get_all_financial_points PASSED")
    
    def test_get_financial_points_by_date(self, api_client, unique_date):
        """Test retrieving financial points filtered by date"""
        # Create a point first
        payload = {
            "date": unique_date,
            "end_date": "",
            "period_type": "daily",
            "cash_amount": 5000,
            "mobile_amount": 0,
            "card_amount": 0,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "other_amount": 0,
            "notes": "Test point for date filter",
            "created_by": "Test Manager"
        }
        create_response = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        assert create_response.status_code == 200
        point_id = create_response.json()["financial_point"]["id"]
        
        # Get by date
        response = api_client.get(f"{BASE_URL}/api/financial-points", params={"date": unique_date})
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["financial_points"]) >= 1
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/financial-points/{point_id}?is_admin=true")
        print("✅ test_get_financial_points_by_date PASSED")
    
    def test_get_financial_points_by_period_type(self, api_client):
        """Test retrieving financial points filtered by period_type"""
        response = api_client.get(f"{BASE_URL}/api/financial-points", params={"period_type": "weekly"})
        
        assert response.status_code == 200
        data = response.json()
        # All returned points should be weekly
        for point in data["financial_points"]:
            assert point["period_type"] == "weekly"
        print("✅ test_get_financial_points_by_period_type PASSED")
    
    def test_get_single_financial_point(self, api_client, unique_date):
        """Test retrieving a single financial point by ID"""
        # Create a point first
        payload = {
            "date": unique_date,
            "end_date": "",
            "period_type": "daily",
            "cash_amount": 7500,
            "mobile_amount": 2500,
            "card_amount": 0,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "other_amount": 0,
            "notes": "Test single point retrieval",
            "created_by": "Test Manager"
        }
        create_response = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        assert create_response.status_code == 200
        point_id = create_response.json()["financial_point"]["id"]
        
        # Get single point
        response = api_client.get(f"{BASE_URL}/api/financial-points/{point_id}")
        
        assert response.status_code == 200
        point = response.json()
        assert point["id"] == point_id
        assert point["cash_amount"] == 7500
        assert point["mobile_amount"] == 2500
        assert point["total_amount"] == 10000
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/financial-points/{point_id}?is_admin=true")
        print("✅ test_get_single_financial_point PASSED")
    
    def test_get_nonexistent_point_returns_404(self, api_client):
        """Test that getting a non-existent point returns 404"""
        response = api_client.get(f"{BASE_URL}/api/financial-points/nonexistent-id-12345")
        
        assert response.status_code == 404
        print("✅ test_get_nonexistent_point_returns_404 PASSED")


class TestFinancialPointsWorkflow:
    """Tests for the complete workflow: Create -> Admin Validate -> Sign"""
    
    def test_complete_workflow(self, api_client, unique_date):
        """Test the complete workflow: create -> admin validate -> sign"""
        # Step 1: Create a financial point
        payload = {
            "date": unique_date,
            "end_date": "",
            "period_type": "daily",
            "cash_amount": 20000,
            "mobile_amount": 10000,
            "card_amount": 5000,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "other_amount": 0,
            "notes": "Complete workflow test",
            "created_by": "Test Manager"
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        assert create_response.status_code == 200
        point = create_response.json()["financial_point"]
        point_id = point["id"]
        
        assert point["status"] == "pending"
        assert point["admin_validated"] == False
        assert point["signed"] == False
        
        # Step 2: Admin validates the point
        validate_response = api_client.post(
            f"{BASE_URL}/api/financial-points/{point_id}/admin-validate",
            json={"admin_name": "Test Admin"}
        )
        assert validate_response.status_code == 200
        validated_point = validate_response.json()["financial_point"]
        
        assert validated_point["admin_validated"] == True
        assert validated_point["admin_validated_by"] == "Test Admin"
        assert validated_point["status"] == "admin_validated"
        assert validated_point["signed"] == False
        
        # Step 3: Sign the point
        sign_response = api_client.post(
            f"{BASE_URL}/api/financial-points/{point_id}/sign",
            json={
                "signature_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                "signer_name": "Test Signer"
            }
        )
        assert sign_response.status_code == 200
        signed_point = sign_response.json()["financial_point"]
        
        assert signed_point["signed"] == True
        assert signed_point["signed_by"] == "Test Signer"
        assert signed_point["status"] == "signed"
        assert signed_point["signature_data"] is not None
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/financial-points/{point_id}?is_admin=true")
        print("✅ test_complete_workflow PASSED")
    
    def test_cannot_sign_without_admin_validation(self, api_client, unique_date):
        """Test that signing fails without admin validation"""
        # Create a point
        payload = {
            "date": unique_date,
            "end_date": "",
            "period_type": "daily",
            "cash_amount": 15000,
            "mobile_amount": 0,
            "card_amount": 0,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "other_amount": 0,
            "notes": "Test sign without validation",
            "created_by": "Test Manager"
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        assert create_response.status_code == 200
        point_id = create_response.json()["financial_point"]["id"]
        
        # Try to sign without admin validation
        sign_response = api_client.post(
            f"{BASE_URL}/api/financial-points/{point_id}/sign",
            json={
                "signature_data": "data:image/png;base64,test",
                "signer_name": "Test Signer"
            }
        )
        
        assert sign_response.status_code == 400
        assert "validé par l'administrateur" in sign_response.json().get("detail", "")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/financial-points/{point_id}?is_admin=true")
        print("✅ test_cannot_sign_without_admin_validation PASSED")
    
    def test_cannot_validate_twice(self, api_client, unique_date):
        """Test that admin validation cannot be done twice"""
        # Create and validate a point
        payload = {
            "date": unique_date,
            "end_date": "",
            "period_type": "daily",
            "cash_amount": 12000,
            "mobile_amount": 0,
            "card_amount": 0,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "other_amount": 0,
            "notes": "Test double validation",
            "created_by": "Test Manager"
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        assert create_response.status_code == 200
        point_id = create_response.json()["financial_point"]["id"]
        
        # First validation
        validate_response1 = api_client.post(
            f"{BASE_URL}/api/financial-points/{point_id}/admin-validate",
            json={"admin_name": "Admin 1"}
        )
        assert validate_response1.status_code == 200
        
        # Second validation should fail
        validate_response2 = api_client.post(
            f"{BASE_URL}/api/financial-points/{point_id}/admin-validate",
            json={"admin_name": "Admin 2"}
        )
        assert validate_response2.status_code == 400
        assert "déjà validé" in validate_response2.json().get("detail", "")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/financial-points/{point_id}?is_admin=true")
        print("✅ test_cannot_validate_twice PASSED")
    
    def test_cannot_sign_twice(self, api_client, unique_date):
        """Test that signing cannot be done twice"""
        # Create, validate, and sign a point
        payload = {
            "date": unique_date,
            "end_date": "",
            "period_type": "daily",
            "cash_amount": 8000,
            "mobile_amount": 0,
            "card_amount": 0,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "other_amount": 0,
            "notes": "Test double sign",
            "created_by": "Test Manager"
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        assert create_response.status_code == 200
        point_id = create_response.json()["financial_point"]["id"]
        
        # Validate
        api_client.post(
            f"{BASE_URL}/api/financial-points/{point_id}/admin-validate",
            json={"admin_name": "Test Admin"}
        )
        
        # First sign
        sign_response1 = api_client.post(
            f"{BASE_URL}/api/financial-points/{point_id}/sign",
            json={"signature_data": "data:image/png;base64,test", "signer_name": "Signer 1"}
        )
        assert sign_response1.status_code == 200
        
        # Second sign should fail
        sign_response2 = api_client.post(
            f"{BASE_URL}/api/financial-points/{point_id}/sign",
            json={"signature_data": "data:image/png;base64,test2", "signer_name": "Signer 2"}
        )
        assert sign_response2.status_code == 400
        assert "déjà signé" in sign_response2.json().get("detail", "")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/financial-points/{point_id}?is_admin=true")
        print("✅ test_cannot_sign_twice PASSED")


class TestFinancialPointsUpdate:
    """Tests for updating financial points"""
    
    def test_update_pending_point(self, api_client, unique_date):
        """Test updating a pending (not signed) financial point"""
        # Create a point
        payload = {
            "date": unique_date,
            "end_date": "",
            "period_type": "daily",
            "cash_amount": 10000,
            "mobile_amount": 0,
            "card_amount": 0,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "other_amount": 0,
            "notes": "Original notes",
            "created_by": "Test Manager"
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        assert create_response.status_code == 200
        point_id = create_response.json()["financial_point"]["id"]
        
        # Update the point
        update_response = api_client.put(
            f"{BASE_URL}/api/financial-points/{point_id}",
            json={
                "cash_amount": 15000,
                "mobile_amount": 5000,
                "notes": "Updated notes"
            }
        )
        
        assert update_response.status_code == 200
        updated_point = update_response.json()["financial_point"]
        assert updated_point["cash_amount"] == 15000
        assert updated_point["mobile_amount"] == 5000
        assert updated_point["total_amount"] == 20000  # Recalculated
        assert updated_point["notes"] == "Updated notes"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/financial-points/{point_id}?is_admin=true")
        print("✅ test_update_pending_point PASSED")
    
    def test_non_admin_cannot_update_signed_point(self, api_client, unique_date):
        """Test that non-admin cannot update a signed point"""
        # Create, validate, and sign a point
        payload = {
            "date": unique_date,
            "end_date": "",
            "period_type": "daily",
            "cash_amount": 10000,
            "mobile_amount": 0,
            "card_amount": 0,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "other_amount": 0,
            "notes": "Test locked point",
            "created_by": "Test Manager"
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        assert create_response.status_code == 200
        point_id = create_response.json()["financial_point"]["id"]
        
        # Validate and sign
        api_client.post(
            f"{BASE_URL}/api/financial-points/{point_id}/admin-validate",
            json={"admin_name": "Test Admin"}
        )
        api_client.post(
            f"{BASE_URL}/api/financial-points/{point_id}/sign",
            json={"signature_data": "data:image/png;base64,test", "signer_name": "Test Signer"}
        )
        
        # Try to update without admin flag
        update_response = api_client.put(
            f"{BASE_URL}/api/financial-points/{point_id}",
            json={"cash_amount": 20000, "is_admin": False}
        )
        
        assert update_response.status_code == 403
        assert "signé" in update_response.json().get("detail", "")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/financial-points/{point_id}?is_admin=true")
        print("✅ test_non_admin_cannot_update_signed_point PASSED")
    
    def test_admin_can_update_signed_point(self, api_client, unique_date):
        """Test that admin CAN update a signed point"""
        # Create, validate, and sign a point
        payload = {
            "date": unique_date,
            "end_date": "",
            "period_type": "daily",
            "cash_amount": 10000,
            "mobile_amount": 0,
            "card_amount": 0,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "other_amount": 0,
            "notes": "Test admin update",
            "created_by": "Test Manager"
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        assert create_response.status_code == 200
        point_id = create_response.json()["financial_point"]["id"]
        
        # Validate and sign
        api_client.post(
            f"{BASE_URL}/api/financial-points/{point_id}/admin-validate",
            json={"admin_name": "Test Admin"}
        )
        api_client.post(
            f"{BASE_URL}/api/financial-points/{point_id}/sign",
            json={"signature_data": "data:image/png;base64,test", "signer_name": "Test Signer"}
        )
        
        # Admin can update
        update_response = api_client.put(
            f"{BASE_URL}/api/financial-points/{point_id}",
            json={"cash_amount": 25000, "is_admin": True}
        )
        
        assert update_response.status_code == 200
        updated_point = update_response.json()["financial_point"]
        assert updated_point["cash_amount"] == 25000
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/financial-points/{point_id}?is_admin=true")
        print("✅ test_admin_can_update_signed_point PASSED")


class TestFinancialPointsDelete:
    """Tests for deleting financial points"""
    
    def test_delete_pending_point(self, api_client, unique_date):
        """Test deleting a pending (not signed) point"""
        # Create a point
        payload = {
            "date": unique_date,
            "end_date": "",
            "period_type": "daily",
            "cash_amount": 5000,
            "mobile_amount": 0,
            "card_amount": 0,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "other_amount": 0,
            "notes": "Test delete",
            "created_by": "Test Manager"
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        assert create_response.status_code == 200
        point_id = create_response.json()["financial_point"]["id"]
        
        # Delete without admin flag (should work for pending)
        delete_response = api_client.delete(f"{BASE_URL}/api/financial-points/{point_id}")
        
        assert delete_response.status_code == 200
        assert delete_response.json().get("success") == True
        
        # Verify deleted
        get_response = api_client.get(f"{BASE_URL}/api/financial-points/{point_id}")
        assert get_response.status_code == 404
        print("✅ test_delete_pending_point PASSED")
    
    def test_non_admin_cannot_delete_signed_point(self, api_client, unique_date):
        """Test that non-admin cannot delete a signed point"""
        # Create, validate, and sign a point
        payload = {
            "date": unique_date,
            "end_date": "",
            "period_type": "daily",
            "cash_amount": 5000,
            "mobile_amount": 0,
            "card_amount": 0,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "other_amount": 0,
            "notes": "Test delete signed",
            "created_by": "Test Manager"
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        assert create_response.status_code == 200
        point_id = create_response.json()["financial_point"]["id"]
        
        # Validate and sign
        api_client.post(
            f"{BASE_URL}/api/financial-points/{point_id}/admin-validate",
            json={"admin_name": "Test Admin"}
        )
        api_client.post(
            f"{BASE_URL}/api/financial-points/{point_id}/sign",
            json={"signature_data": "data:image/png;base64,test", "signer_name": "Test Signer"}
        )
        
        # Try to delete without admin flag
        delete_response = api_client.delete(f"{BASE_URL}/api/financial-points/{point_id}")
        
        assert delete_response.status_code == 403
        assert "administrateur" in delete_response.json().get("detail", "")
        
        # Cleanup with admin flag
        api_client.delete(f"{BASE_URL}/api/financial-points/{point_id}?is_admin=true")
        print("✅ test_non_admin_cannot_delete_signed_point PASSED")
    
    def test_admin_can_delete_signed_point(self, api_client, unique_date):
        """Test that admin CAN delete a signed point"""
        # Create, validate, and sign a point
        payload = {
            "date": unique_date,
            "end_date": "",
            "period_type": "daily",
            "cash_amount": 5000,
            "mobile_amount": 0,
            "card_amount": 0,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "other_amount": 0,
            "notes": "Test admin delete",
            "created_by": "Test Manager"
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        assert create_response.status_code == 200
        point_id = create_response.json()["financial_point"]["id"]
        
        # Validate and sign
        api_client.post(
            f"{BASE_URL}/api/financial-points/{point_id}/admin-validate",
            json={"admin_name": "Test Admin"}
        )
        api_client.post(
            f"{BASE_URL}/api/financial-points/{point_id}/sign",
            json={"signature_data": "data:image/png;base64,test", "signer_name": "Test Signer"}
        )
        
        # Admin can delete
        delete_response = api_client.delete(f"{BASE_URL}/api/financial-points/{point_id}?is_admin=true")
        
        assert delete_response.status_code == 200
        assert delete_response.json().get("success") == True
        
        # Verify deleted
        get_response = api_client.get(f"{BASE_URL}/api/financial-points/{point_id}")
        assert get_response.status_code == 404
        print("✅ test_admin_can_delete_signed_point PASSED")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
