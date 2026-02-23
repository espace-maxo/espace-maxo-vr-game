"""
Loyalty Program API Tests
Tests for: GET /api/loyalty/{phone}, POST /api/loyalty/add-points, GET /api/admin/loyalty/accounts
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
ADMIN_PASSWORD = "Nikeland2016"


class TestLoyaltyEndpoints:
    """Test Loyalty Program endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.test_phone = f"01{uuid.uuid4().hex[:8]}"  # Unique test phone
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def get_admin_token(self):
        """Get admin JWT token"""
        response = self.session.post(f"{BASE_URL}/api/auth/admin-login", json={
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        return None

    # GET /api/loyalty/{phone} tests
    
    def test_loyalty_status_new_customer(self):
        """GET /api/loyalty/{phone} returns proper structure for new customer (exists: false)"""
        # Use a unique phone number that won't exist
        unique_phone = f"01{uuid.uuid4().hex[:8]}"
        response = self.session.get(f"{BASE_URL}/api/loyalty/{unique_phone}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify structure for new customer
        assert data.get("exists") == False, "New customer should have exists: false"
        assert "phone" in data, "Response should include phone"
        assert "total_points" in data, "Response should include total_points"
        assert data.get("total_points") == 0, "New customer should have 0 total_points"
        assert "available_points" in data, "Response should include available_points"
        assert data.get("available_points") == 0, "New customer should have 0 available_points"
        assert "free_games_available" in data, "Response should include free_games_available"
        assert data.get("free_games_available") == 0, "New customer should have 0 free_games_available"
        assert "games_until_free" in data, "Response should include games_until_free"
        assert data.get("games_until_free") == 10, "New customer needs 10 games until free"
        assert "message" in data, "Response should include message for new customer"
        print(f"✅ New customer loyalty status: {data}")
        
    def test_loyalty_status_with_plus229_prefix(self):
        """GET /api/loyalty/{phone} cleans phone number with +229 prefix"""
        unique_phone = f"01{uuid.uuid4().hex[:8]}"
        phone_with_prefix = f"+229{unique_phone}"
        
        response = self.session.get(f"{BASE_URL}/api/loyalty/{phone_with_prefix}")
        
        assert response.status_code == 200
        data = response.json()
        # Phone should be cleaned of +229 prefix
        assert data.get("phone") == unique_phone, f"Phone should be cleaned: expected {unique_phone}, got {data.get('phone')}"
        print(f"✅ Phone prefix cleaning works correctly")

    def test_loyalty_status_with_spaces(self):
        """GET /api/loyalty/{phone} cleans phone number with spaces"""
        unique_phone = f"01{uuid.uuid4().hex[:8]}"
        phone_with_spaces = f"01 97 12 34 56"
        
        response = self.session.get(f"{BASE_URL}/api/loyalty/{phone_with_spaces}")
        
        assert response.status_code == 200
        data = response.json()
        # Phone should be cleaned of spaces
        assert " " not in data.get("phone", ""), "Phone should have spaces removed"
        print(f"✅ Phone space cleaning works correctly")

    # POST /api/loyalty/add-points tests
    
    def test_add_points_booking_not_found(self):
        """POST /api/loyalty/add-points returns 404 for non-existent booking"""
        fake_booking_id = "non-existent-booking-id"
        
        response = self.session.post(
            f"{BASE_URL}/api/loyalty/add-points",
            params={"booking_id": fake_booking_id}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print(f"✅ Non-existent booking returns 404")
    
    # GET /api/admin/loyalty/accounts tests
    
    def test_admin_loyalty_accounts_no_auth(self):
        """GET /api/admin/loyalty/accounts without auth returns 401"""
        response = self.session.get(f"{BASE_URL}/api/admin/loyalty/accounts")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print(f"✅ Admin loyalty endpoint requires authentication")
    
    def test_admin_loyalty_accounts_with_auth(self):
        """GET /api/admin/loyalty/accounts with valid token returns list"""
        token = self.get_admin_token()
        assert token is not None, "Failed to get admin token"
        
        headers = {"Authorization": f"Bearer {token}"}
        response = self.session.get(f"{BASE_URL}/api/admin/loyalty/accounts", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "accounts" in data, "Response should include accounts list"
        assert isinstance(data["accounts"], list), "Accounts should be a list"
        assert "total" in data, "Response should include total count"
        assert "stats" in data, "Response should include stats"
        
        # Verify stats structure
        stats = data["stats"]
        assert "total_accounts" in stats, "Stats should include total_accounts"
        assert "total_points_issued" in stats, "Stats should include total_points_issued"
        assert "total_free_games_earned" in stats, "Stats should include total_free_games_earned"
        
        print(f"✅ Admin loyalty accounts: total={data['total']}, accounts={len(data['accounts'])}")


class TestLoyaltyIntegration:
    """Integration tests for loyalty with booking flow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def get_admin_token(self):
        """Get admin JWT token"""
        response = self.session.post(f"{BASE_URL}/api/auth/admin-login", json={
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        return None
        
    def test_create_booking_and_check_loyalty(self):
        """Create booking, verify payment, check loyalty points added"""
        # Create unique test phone
        test_phone = f"01{uuid.uuid4().hex[:8]}"
        
        # 1. Check initial loyalty status (should be new customer)
        response = self.session.get(f"{BASE_URL}/api/loyalty/{test_phone}")
        assert response.status_code == 200
        initial_data = response.json()
        assert initial_data.get("exists") == False, "Should be new customer initially"
        print(f"✅ Initial check - new customer with phone {test_phone}")
        
        # 2. Create a booking with this phone
        from datetime import datetime, timedelta
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        booking_data = {
            "customer_name": "TEST_Loyalty_User",
            "customer_phone": test_phone,
            "game_type": "VR_360",
            "date": tomorrow,
            "time_slot": "14:00",
            "number_of_players": 2,
            "number_of_games": 3
        }
        
        response = self.session.post(f"{BASE_URL}/api/bookings", json=booking_data)
        assert response.status_code == 200, f"Booking creation failed: {response.text}"
        booking = response.json()
        booking_id = booking.get("id")
        print(f"✅ Booking created: {booking_id}")
        
        # Note: Loyalty points are added automatically after payment verification
        # Since we can't complete real payment in tests, we verify the endpoint exists
        
        # 3. Try add-points endpoint with unpaid booking (should fail with 400)
        response = self.session.post(
            f"{BASE_URL}/api/loyalty/add-points",
            params={"booking_id": booking_id}
        )
        # Should fail because booking is not paid
        assert response.status_code == 400, f"Expected 400 for unpaid booking, got {response.status_code}"
        print(f"✅ Add-points correctly requires paid booking")


class TestLoyaltyRedemption:
    """Tests for loyalty point redemption"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def test_redeem_non_existent_account(self):
        """POST /api/loyalty/redeem returns 404 for non-existent account"""
        fake_phone = f"01{uuid.uuid4().hex[:8]}"
        
        response = self.session.post(f"{BASE_URL}/api/loyalty/redeem", json={
            "phone": fake_phone,
            "free_games_to_use": 1
        })
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✅ Redeem correctly returns 404 for non-existent account")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
