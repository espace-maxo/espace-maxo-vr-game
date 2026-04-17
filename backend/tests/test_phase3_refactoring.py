"""
Test Phase 3 Refactoring: BonsTab and StatsTab extraction
Tests backend endpoints used by these components and regression tests.
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBackendRegression:
    """Backend regression tests for Phase 3 refactoring"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    # ============== STATS ENDPOINTS (used by StatsTab) ==============
    
    def test_monthly_stats_endpoint(self):
        """Test /api/invoices/stats/monthly returns correct structure"""
        response = self.session.get(f"{BASE_URL}/api/invoices/stats/monthly", params={
            "year": 2026,
            "month": 4
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify structure expected by StatsTab
        assert "total_revenue" in data, "Missing total_revenue"
        assert "total_invoices" in data or "invoice_count" in data, "Missing invoice count"
        assert "by_department" in data, "Missing by_department"
        assert "daily_stats" in data, "Missing daily_stats"
        print(f"✅ Monthly stats: total_revenue={data.get('total_revenue')}, departments={list(data.get('by_department', {}).keys())}")
    
    def test_daily_stats_endpoint(self):
        """Test /api/invoices/stats returns correct structure"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = self.session.get(f"{BASE_URL}/api/invoices/stats", params={"date": today})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "total_revenue" in data, "Missing total_revenue"
        assert "by_department" in data, "Missing by_department"
        print(f"✅ Daily stats: total_revenue={data.get('total_revenue')}")
    
    def test_analytics_dashboard_endpoint(self):
        """Test /api/analytics/dashboard returns correct structure"""
        response = self.session.get(f"{BASE_URL}/api/analytics/dashboard", params={
            "year": 2026,
            "month": 4
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "current" in data, "Missing current period data"
        assert "previous" in data, "Missing previous period data"
        assert "growth" in data, "Missing growth data"
        print(f"✅ Analytics dashboard: current revenue={data.get('current', {}).get('revenue')}")
    
    def test_revenue_by_payment_endpoint(self):
        """Test /api/reports/revenue-by-payment returns correct structure"""
        response = self.session.get(f"{BASE_URL}/api/reports/revenue-by-payment", params={
            "week_start": "2026-04-13"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "total" in data, "Missing total"
        assert "by_method" in data, "Missing by_method"
        print(f"✅ Revenue by payment: total={data.get('total')}")
    
    # ============== INVOICES ENDPOINTS (used by BonsTab) ==============
    
    def test_invoices_list_endpoint(self):
        """Test /api/invoices returns list of invoices"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = self.session.get(f"{BASE_URL}/api/invoices", params={"date": today})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "invoices" in data, "Missing invoices key"
        assert isinstance(data["invoices"], list), "invoices should be a list"
        print(f"✅ Invoices list: {len(data['invoices'])} invoices found")
    
    def test_cancellation_requests_endpoint(self):
        """Test /api/cancellation-requests returns list"""
        response = self.session.get(f"{BASE_URL}/api/cancellation-requests")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "requests" in data, "Missing requests key"
        print(f"✅ Cancellation requests: {len(data['requests'])} requests")
    
    def test_modification_requests_endpoint(self):
        """Test /api/modification-requests returns list"""
        response = self.session.get(f"{BASE_URL}/api/modification-requests")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "requests" in data, "Missing requests key"
        print(f"✅ Modification requests: {len(data['requests'])} requests")
    
    # ============== AUTH ENDPOINTS ==============
    
    def test_admin_login(self):
        """Test admin login with password"""
        response = self.session.post(f"{BASE_URL}/api/caisse/login", json={
            "password": "Caisse2026"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Login should succeed"
        assert data.get("user", {}).get("role") == "admin", "Should be admin role"
        print(f"✅ Admin login successful: {data.get('user', {}).get('username')}")
    
    def test_manager_login_with_pin(self):
        """Test gérante login with PIN 2468"""
        response = self.session.post(f"{BASE_URL}/api/caisse/login", json={
            "pin": "2468"
        })
        assert response.status_code == 200, f"Manager login failed: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Login should succeed"
        assert data.get("user", {}).get("role") == "manager", "Should be manager role"
        print(f"✅ Manager (gérante) login successful: {data.get('user', {}).get('full_name')}")
    
    def test_invalid_pin_login(self):
        """Test login with invalid PIN returns 401"""
        response = self.session.post(f"{BASE_URL}/api/caisse/login", json={
            "pin": "9999"
        })
        assert response.status_code == 401, f"Expected 401 for invalid PIN, got {response.status_code}"
        print("✅ Invalid PIN correctly rejected with 401")
    
    # ============== USERS ENDPOINT ==============
    
    def test_users_list_endpoint(self):
        """Test /api/caisse/users returns users list"""
        response = self.session.get(f"{BASE_URL}/api/caisse/users")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "users" in data, "Missing users key"
        assert isinstance(data["users"], list), "users should be a list"
        
        # Check for different roles
        roles = set(u.get("role") for u in data["users"])
        print(f"✅ Users list: {len(data['users'])} users, roles: {roles}")
    
    # ============== PRODUCTS ENDPOINT ==============
    
    def test_products_list_endpoint(self):
        """Test /api/caisse/products returns products list"""
        response = self.session.get(f"{BASE_URL}/api/caisse/products")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "products" in data, "Missing products key"
        assert isinstance(data["products"], list), "products should be a list"
        print(f"✅ Products list: {len(data['products'])} products")
    
    # ============== CLIENTS ENDPOINT ==============
    
    def test_clients_list_endpoint(self):
        """Test /api/caisse/clients returns clients list"""
        response = self.session.get(f"{BASE_URL}/api/caisse/clients")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "clients" in data, "Missing clients key"
        print(f"✅ Clients list: {len(data['clients'])} clients")


class TestRouteCollisionRegression:
    """Verify route collision fix from Phase 2 still works"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_stats_route_not_confused_with_invoice_id(self):
        """Ensure /api/invoices/stats is not matched by /api/invoices/{invoice_id}"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = self.session.get(f"{BASE_URL}/api/invoices/stats", params={"date": today})
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Should NOT return "Facture non trouvée" error
        assert "detail" not in data or "non trouvée" not in str(data.get("detail", "")), \
            "Route collision: /invoices/stats matched by /invoices/{invoice_id}"
        assert "total_revenue" in data, "Should return stats, not invoice error"
        print("✅ Route collision fix verified: /invoices/stats returns stats correctly")
    
    def test_monthly_stats_route_works(self):
        """Ensure /api/invoices/stats/monthly works"""
        response = self.session.get(f"{BASE_URL}/api/invoices/stats/monthly", params={
            "year": 2026, "month": 4
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "total_revenue" in data, "Should return monthly stats"
        print("✅ Monthly stats route works correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
