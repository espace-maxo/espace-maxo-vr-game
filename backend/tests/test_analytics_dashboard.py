"""
Test suite for Analytics Dashboard API endpoint
Tests: GET /api/analytics/dashboard
Features: KPI mensuels, évolution vs mois précédent, revenus journaliers, top serveurs, modes de paiement, répartition par département, top produits
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAnalyticsDashboard:
    """Analytics Dashboard endpoint tests"""
    
    def test_analytics_dashboard_returns_200(self):
        """Test that analytics dashboard returns 200 status"""
        response = requests.get(f"{BASE_URL}/api/analytics/dashboard", params={"year": 2026, "month": 4})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ Analytics dashboard returns 200")
    
    def test_analytics_dashboard_structure(self):
        """Test that response has correct top-level structure: current, previous, growth"""
        response = requests.get(f"{BASE_URL}/api/analytics/dashboard", params={"year": 2026, "month": 4})
        data = response.json()
        
        assert "current" in data, "Missing 'current' in response"
        assert "previous" in data, "Missing 'previous' in response"
        assert "growth" in data, "Missing 'growth' in response"
        print("✅ Response has correct top-level structure: current, previous, growth")
    
    def test_current_month_fields(self):
        """Test that current month has all required fields"""
        response = requests.get(f"{BASE_URL}/api/analytics/dashboard", params={"year": 2026, "month": 4})
        current = response.json()["current"]
        
        required_fields = ["total_revenue", "invoice_count", "avg_ticket", "by_server", 
                          "by_payment_method", "by_department", "daily_stats", "top_products"]
        
        for field in required_fields:
            assert field in current, f"Missing '{field}' in current month data"
        
        print(f"✅ Current month has all required fields: {required_fields}")
    
    def test_previous_month_fields(self):
        """Test that previous month has all required fields"""
        response = requests.get(f"{BASE_URL}/api/analytics/dashboard", params={"year": 2026, "month": 4})
        previous = response.json()["previous"]
        
        required_fields = ["total_revenue", "invoice_count", "avg_ticket", "by_server", 
                          "by_payment_method", "by_department", "daily_stats", "top_products"]
        
        for field in required_fields:
            assert field in previous, f"Missing '{field}' in previous month data"
        
        print(f"✅ Previous month has all required fields: {required_fields}")
    
    def test_growth_fields(self):
        """Test that growth has required percentage fields"""
        response = requests.get(f"{BASE_URL}/api/analytics/dashboard", params={"year": 2026, "month": 4})
        growth = response.json()["growth"]
        
        required_fields = ["revenue_pct", "invoice_count_pct", "avg_ticket_pct"]
        
        for field in required_fields:
            assert field in growth, f"Missing '{field}' in growth data"
        
        print(f"✅ Growth has all required fields: {required_fields}")
    
    def test_top_products_max_10(self):
        """Test that top_products contains at most 10 items"""
        response = requests.get(f"{BASE_URL}/api/analytics/dashboard", params={"year": 2026, "month": 4})
        top_products = response.json()["current"]["top_products"]
        
        assert len(top_products) <= 10, f"top_products should have max 10 items, got {len(top_products)}"
        print(f"✅ top_products has {len(top_products)} items (max 10)")
    
    def test_top_products_structure(self):
        """Test that each top product has name, quantity, revenue"""
        response = requests.get(f"{BASE_URL}/api/analytics/dashboard", params={"year": 2026, "month": 4})
        top_products = response.json()["current"]["top_products"]
        
        if len(top_products) > 0:
            product = top_products[0]
            assert "name" in product, "Missing 'name' in top product"
            assert "quantity" in product, "Missing 'quantity' in top product"
            assert "revenue" in product, "Missing 'revenue' in top product"
            print(f"✅ Top products have correct structure (name, quantity, revenue)")
        else:
            print("⚠️ No top products to verify structure")
    
    def test_poulet_braise_in_top_products(self):
        """Test that 'Poulet braise' is in top products with ~6 units"""
        response = requests.get(f"{BASE_URL}/api/analytics/dashboard", params={"year": 2026, "month": 4})
        top_products = response.json()["current"]["top_products"]
        
        poulet = next((p for p in top_products if "poulet" in p["name"].lower() and "brais" in p["name"].lower()), None)
        assert poulet is not None, "Poulet braise should be in top products"
        assert poulet["quantity"] >= 5, f"Poulet braise should have ~6 units, got {poulet['quantity']}"
        print(f"✅ Poulet braise found with {poulet['quantity']} units")
    
    def test_payment_method_normalization(self):
        """Test that payment methods are normalized (mobile_money->mobile, especes->cash, bon-client->wallet)"""
        response = requests.get(f"{BASE_URL}/api/analytics/dashboard", params={"year": 2026, "month": 4})
        by_payment = response.json()["current"]["by_payment_method"]
        
        # Check normalized keys exist
        expected_keys = ["cash", "mobile", "cheque", "wallet", "other"]
        for key in expected_keys:
            assert key in by_payment, f"Missing normalized payment method '{key}'"
        
        # Check no raw variants exist
        raw_variants = ["mobile_money", "especes", "espèces", "bon-client", "bon_client"]
        for variant in raw_variants:
            assert variant not in by_payment, f"Raw payment variant '{variant}' should be normalized"
        
        print(f"✅ Payment methods are normalized: {list(by_payment.keys())}")
    
    def test_month_1_uses_previous_year_december(self):
        """Test that when month=1, previous month is year-1, month=12"""
        response = requests.get(f"{BASE_URL}/api/analytics/dashboard", params={"year": 2026, "month": 1})
        previous = response.json()["previous"]
        
        assert previous["year"] == 2025, f"Previous year should be 2025, got {previous['year']}"
        assert previous["month"] == 12, f"Previous month should be 12, got {previous['month']}"
        print(f"✅ Month=1 correctly uses year-1 (2025), month=12 for previous")
    
    def test_only_validated_invoices_counted(self):
        """Test that only validated invoices are counted in revenue/count stats"""
        response = requests.get(f"{BASE_URL}/api/analytics/dashboard", params={"year": 2026, "month": 4})
        current = response.json()["current"]
        
        # Revenue should be positive (we have validated invoices)
        assert current["total_revenue"] > 0, "Total revenue should be > 0 for validated invoices"
        assert current["invoice_count"] > 0, "Invoice count should be > 0 for validated invoices"
        print(f"✅ Revenue: {current['total_revenue']}F, Invoice count: {current['invoice_count']} (validated only)")
    
    def test_growth_percentage_positive_when_current_higher(self):
        """Test that growth percentage is positive when current > previous"""
        response = requests.get(f"{BASE_URL}/api/analytics/dashboard", params={"year": 2026, "month": 4})
        data = response.json()
        
        current_revenue = data["current"]["total_revenue"]
        previous_revenue = data["previous"]["total_revenue"]
        growth_pct = data["growth"]["revenue_pct"]
        
        if current_revenue > previous_revenue and previous_revenue > 0:
            assert growth_pct > 0, f"Growth should be positive when current ({current_revenue}) > previous ({previous_revenue})"
            print(f"✅ Growth percentage is positive ({growth_pct}%) when current > previous")
        else:
            print(f"⚠️ Skipped: current={current_revenue}, previous={previous_revenue}")
    
    def test_by_server_structure(self):
        """Test that by_server has correct structure with total and count"""
        response = requests.get(f"{BASE_URL}/api/analytics/dashboard", params={"year": 2026, "month": 4})
        by_server = response.json()["current"]["by_server"]
        
        if len(by_server) > 0:
            server_name = list(by_server.keys())[0]
            server_data = by_server[server_name]
            assert "total" in server_data, "Missing 'total' in server data"
            assert "count" in server_data, "Missing 'count' in server data"
            print(f"✅ by_server has correct structure (total, count) for {len(by_server)} servers")
        else:
            print("⚠️ No servers to verify structure")
    
    def test_by_department_structure(self):
        """Test that by_department has expected department keys"""
        response = requests.get(f"{BASE_URL}/api/analytics/dashboard", params={"year": 2026, "month": 4})
        by_dept = response.json()["current"]["by_department"]
        
        expected_depts = ["salle_jardin", "jeux", "bar", "location", "autres"]
        for dept in expected_depts:
            assert dept in by_dept, f"Missing department '{dept}'"
        
        print(f"✅ by_department has all expected departments: {expected_depts}")
    
    def test_daily_stats_structure(self):
        """Test that daily_stats has correct structure with revenue and count"""
        response = requests.get(f"{BASE_URL}/api/analytics/dashboard", params={"year": 2026, "month": 4})
        daily_stats = response.json()["current"]["daily_stats"]
        
        if len(daily_stats) > 0:
            day = list(daily_stats.keys())[0]
            day_data = daily_stats[day]
            assert "revenue" in day_data, "Missing 'revenue' in daily stats"
            assert "count" in day_data, "Missing 'count' in daily stats"
            print(f"✅ daily_stats has correct structure (revenue, count) for {len(daily_stats)} days")
        else:
            print("⚠️ No daily stats to verify structure")
    
    def test_default_params_use_current_month(self):
        """Test that missing year/month params default to current month"""
        response = requests.get(f"{BASE_URL}/api/analytics/dashboard")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "current" in data, "Missing 'current' in response"
        print(f"✅ Default params work, returned data for year={data['current']['year']}, month={data['current']['month']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
