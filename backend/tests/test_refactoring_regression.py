"""
Refactoring Phase 2 Regression Tests
Tests for:
- reports.py router endpoints (invoice stats, monthly stats, analytics dashboard, revenue by payment)
- caisse_users.py router endpoints (users CRUD, login with PIN/password)
- Route collision fix verification (/invoices/stats vs /invoices/{invoice_id})
- Other routers still working (financial-points, stock, subscriptions)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestRouteCollisionFix:
    """Critical: Verify /invoices/stats is NOT matched by /invoices/{invoice_id}"""
    
    def test_invoices_stats_returns_stats_not_404(self):
        """GET /api/invoices/stats should return stats, not 'Facture non trouvée'"""
        response = requests.get(f"{BASE_URL}/api/invoices/stats?date=2026-04-16")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        # Should have stats fields, not error
        assert "total_revenue" in data, f"Missing total_revenue in response: {data}"
        assert "invoice_count" in data, f"Missing invoice_count in response: {data}"
        assert "by_department" in data, f"Missing by_department in response: {data}"
        print(f"✅ /invoices/stats returns stats correctly: revenue={data['total_revenue']}, count={data['invoice_count']}")
    
    def test_invoices_stats_monthly_returns_stats(self):
        """GET /api/invoices/stats/monthly should return monthly stats"""
        response = requests.get(f"{BASE_URL}/api/invoices/stats/monthly?year=2026&month=4")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "total_revenue" in data, f"Missing total_revenue: {data}"
        assert "invoice_count" in data, f"Missing invoice_count: {data}"
        assert "by_department" in data, f"Missing by_department: {data}"
        assert "daily_stats" in data, f"Missing daily_stats: {data}"
        print(f"✅ /invoices/stats/monthly returns stats: revenue={data['total_revenue']}, count={data['invoice_count']}")
    
    def test_invoices_by_id_still_works_valid_id(self):
        """GET /api/invoices/{invoice_id} should still work for valid IDs"""
        # First get a valid invoice ID
        response = requests.get(f"{BASE_URL}/api/invoices?date=2026-04-16")
        if response.status_code == 200:
            invoices = response.json().get("invoices", [])
            if invoices:
                invoice_id = invoices[0].get("id")
                response = requests.get(f"{BASE_URL}/api/invoices/{invoice_id}")
                assert response.status_code == 200, f"Expected 200 for valid ID, got {response.status_code}"
                data = response.json()
                assert data.get("id") == invoice_id
                print(f"✅ /invoices/{{invoice_id}} works for valid ID: {invoice_id[:8]}...")
            else:
                print("⚠️ No invoices found to test /invoices/{invoice_id}")
        else:
            print(f"⚠️ Could not fetch invoices list: {response.status_code}")
    
    def test_invoices_by_id_returns_404_for_invalid_id(self):
        """GET /api/invoices/{invoice_id} should return 404 for invalid ID"""
        response = requests.get(f"{BASE_URL}/api/invoices/invalid-uuid-12345")
        assert response.status_code == 404, f"Expected 404 for invalid ID, got {response.status_code}"
        print("✅ /invoices/{invoice_id} returns 404 for invalid ID")


class TestReportsRouter:
    """Test reports.py router endpoints"""
    
    def test_analytics_dashboard(self):
        """GET /api/analytics/dashboard should return current, previous, growth"""
        response = requests.get(f"{BASE_URL}/api/analytics/dashboard?year=2026&month=4")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "current" in data, f"Missing 'current' in response: {data}"
        assert "previous" in data, f"Missing 'previous' in response: {data}"
        assert "growth" in data, f"Missing 'growth' in response: {data}"
        # Verify current month structure
        current = data["current"]
        assert "total_revenue" in current
        assert "invoice_count" in current
        assert "by_department" in current
        print(f"✅ /analytics/dashboard returns correct structure: current revenue={current['total_revenue']}")
    
    def test_revenue_by_payment(self):
        """GET /api/reports/revenue-by-payment should work with week_start"""
        response = requests.get(f"{BASE_URL}/api/reports/revenue-by-payment?week_start=2026-04-13")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "total" in data, f"Missing 'total' in response: {data}"
        assert "by_method" in data, f"Missing 'by_method' in response: {data}"
        assert "period_start" in data, f"Missing 'period_start' in response: {data}"
        print(f"✅ /reports/revenue-by-payment works: total={data['total']}, methods={list(data['by_method'].keys())}")


class TestCaisseUsersRouter:
    """Test caisse_users.py router endpoints"""
    
    def test_get_caisse_users(self):
        """GET /api/caisse/users should return users list"""
        response = requests.get(f"{BASE_URL}/api/caisse/users")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "users" in data, f"Missing 'users' in response: {data}"
        print(f"✅ /caisse/users returns {len(data['users'])} users")
    
    def test_caisse_login_admin_password(self):
        """POST /api/caisse/login with admin password Caisse2026"""
        response = requests.post(f"{BASE_URL}/api/caisse/login", json={"password": "Caisse2026"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True, f"Login should succeed: {data}"
        assert "user" in data, f"Missing 'user' in response: {data}"
        assert "token" in data, f"Missing 'token' in response: {data}"
        assert data["user"]["role"] == "admin", f"Expected admin role: {data['user']}"
        print(f"✅ Admin login with Caisse2026 works: role={data['user']['role']}")
    
    def test_caisse_login_gerante_pin(self):
        """POST /api/caisse/login with gérante PIN 2468"""
        response = requests.post(f"{BASE_URL}/api/caisse/login", json={"pin": "2468"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True, f"Login should succeed: {data}"
        assert "user" in data, f"Missing 'user' in response: {data}"
        assert "token" in data, f"Missing 'token' in response: {data}"
        print(f"✅ Gérante login with PIN 2468 works: username={data['user'].get('username')}, role={data['user'].get('role')}")
    
    def test_caisse_login_invalid_credentials(self):
        """POST /api/caisse/login with invalid credentials should return 401"""
        response = requests.post(f"{BASE_URL}/api/caisse/login", json={"pin": "9999"})
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("✅ Invalid PIN returns 401")


class TestOtherRoutersRegression:
    """Verify other routers still work after include_router reordering"""
    
    def test_financial_points_endpoint(self):
        """GET /api/financial-points should work"""
        response = requests.get(f"{BASE_URL}/api/financial-points")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✅ /financial-points endpoint works")
    
    def test_stock_products_endpoint(self):
        """GET /api/stock/products should work"""
        response = requests.get(f"{BASE_URL}/api/stock/products")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✅ /stock/products endpoint works")
    
    def test_subscriptions_endpoint(self):
        """GET /api/subscriptions should work"""
        response = requests.get(f"{BASE_URL}/api/subscriptions")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✅ /subscriptions endpoint works")
    
    def test_invoices_list_endpoint(self):
        """GET /api/invoices should work"""
        response = requests.get(f"{BASE_URL}/api/invoices")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "invoices" in data
        print(f"✅ /invoices list endpoint works: {len(data['invoices'])} invoices")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
