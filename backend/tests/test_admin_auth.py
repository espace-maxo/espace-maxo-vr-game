"""
Test Suite for Admin Authentication (JWT-based) and Admin Routes Protection
- Admin login with correct/wrong password
- Admin routes protection
- Token validation
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAdminAuthentication:
    """Test admin login endpoint with JWT authentication"""
    
    def test_admin_login_correct_password(self):
        """Test login with correct password 'Nikeland2016' returns JWT token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/admin-login",
            json={"password": "Nikeland2016"},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "token" in data, "Response should contain 'token' field"
        assert "expires_at" in data, "Response should contain 'expires_at' field"
        assert len(data["token"]) > 0, "Token should not be empty"
        assert data["token"].count('.') == 2, "Token should be a valid JWT format (3 parts)"
        print(f"✅ Admin login successful, token received: {data['token'][:50]}...")
    
    def test_admin_login_wrong_password(self):
        """Test login with wrong password returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/auth/admin-login",
            json={"password": "wrongpassword"},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 401, f"Expected 401 for wrong password, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data, "Response should contain error detail"
        assert "incorrect" in data["detail"].lower() or "mot de passe" in data["detail"].lower(), \
            f"Error message should indicate wrong password: {data['detail']}"
        print(f"✅ Correct 401 response for wrong password: {data['detail']}")
    
    def test_admin_login_empty_password(self):
        """Test login with empty password returns error"""
        response = requests.post(
            f"{BASE_URL}/api/auth/admin-login",
            json={"password": ""},
            headers={"Content-Type": "application/json"}
        )
        # Should return 401 (incorrect password) or 422 (validation error)
        assert response.status_code in [401, 422], f"Expected 401 or 422 for empty password, got {response.status_code}"
        print(f"✅ Empty password correctly rejected with status {response.status_code}")


class TestAdminRoutesProtection:
    """Test that admin routes require valid JWT token"""
    
    @pytest.fixture
    def valid_token(self):
        """Get a valid admin token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/admin-login",
            json={"password": "Nikeland2016"},
            headers={"Content-Type": "application/json"}
        )
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Cannot get admin token")
    
    def test_admin_stats_without_token(self):
        """GET /api/admin/stats without token should return 401"""
        response = requests.get(f"{BASE_URL}/api/admin/stats")
        assert response.status_code == 401, f"Expected 401 without token, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data
        print(f"✅ Admin stats protected: {data['detail']}")
    
    def test_admin_stats_with_valid_token(self, valid_token):
        """GET /api/admin/stats with valid token should return stats"""
        response = requests.get(
            f"{BASE_URL}/api/admin/stats",
            headers={"Authorization": f"Bearer {valid_token}"}
        )
        assert response.status_code == 200, f"Expected 200 with valid token, got {response.status_code}"
        
        data = response.json()
        assert "total_bookings" in data, "Stats should contain total_bookings"
        assert "today_bookings" in data, "Stats should contain today_bookings"
        assert "paid_bookings" in data, "Stats should contain paid_bookings"
        assert "total_revenue" in data, "Stats should contain total_revenue"
        print(f"✅ Admin stats accessible with token: {data}")
    
    def test_admin_stats_with_invalid_token(self):
        """GET /api/admin/stats with invalid token should return 401"""
        response = requests.get(
            f"{BASE_URL}/api/admin/stats",
            headers={"Authorization": "Bearer invalid.token.here"}
        )
        assert response.status_code == 401, f"Expected 401 with invalid token, got {response.status_code}"
        print("✅ Invalid token correctly rejected")
    
    def test_admin_bookings_without_token(self):
        """GET /api/admin/bookings without token should return 401"""
        response = requests.get(f"{BASE_URL}/api/admin/bookings")
        assert response.status_code == 401, f"Expected 401 without token, got {response.status_code}"
        print("✅ Admin bookings protected")
    
    def test_admin_bookings_with_valid_token(self, valid_token):
        """GET /api/admin/bookings with valid token should return bookings"""
        response = requests.get(
            f"{BASE_URL}/api/admin/bookings",
            headers={"Authorization": f"Bearer {valid_token}"}
        )
        assert response.status_code == 200, f"Expected 200 with valid token, got {response.status_code}"
        
        data = response.json()
        assert "bookings" in data, "Response should contain 'bookings' field"
        assert "total" in data, "Response should contain 'total' field"
        print(f"✅ Admin bookings accessible: {len(data['bookings'])} bookings found")


class TestTokenVerification:
    """Test token verification endpoint"""
    
    @pytest.fixture
    def valid_token(self):
        """Get a valid admin token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/admin-login",
            json={"password": "Nikeland2016"},
            headers={"Content-Type": "application/json"}
        )
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Cannot get admin token")
    
    def test_verify_auth_without_token(self):
        """GET /api/auth/verify without token should return 401"""
        response = requests.get(f"{BASE_URL}/api/auth/verify")
        assert response.status_code == 401, f"Expected 401 without token, got {response.status_code}"
        print("✅ Auth verify requires token")
    
    def test_verify_auth_with_valid_token(self, valid_token):
        """GET /api/auth/verify with valid token should return valid=true"""
        response = requests.get(
            f"{BASE_URL}/api/auth/verify",
            headers={"Authorization": f"Bearer {valid_token}"}
        )
        assert response.status_code == 200, f"Expected 200 with valid token, got {response.status_code}"
        
        data = response.json()
        assert data.get("valid") == True, "Should return valid=true"
        assert data.get("role") == "admin", "Should return role=admin"
        print(f"✅ Token verification successful: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
