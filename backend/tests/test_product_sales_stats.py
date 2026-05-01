"""
Test suite for GET /api/invoices/stats/by-product endpoint
Tests the new product sales statistics feature for Caisse Pro.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestProductSalesStats:
    """Tests for /api/invoices/stats/by-product endpoint"""
    
    def test_endpoint_returns_200_without_filters(self):
        """Test endpoint returns 200 with no filters"""
        response = requests.get(f"{BASE_URL}/api/invoices/stats/by-product")
        assert response.status_code == 200
        data = response.json()
        
        # Verify top-level structure
        assert "invoices_scanned" in data
        assert "distinct_products" in data
        assert "total_quantity" in data
        assert "total_revenue" in data
        assert "by_department" in data
        assert "products" in data
        assert isinstance(data["products"], list)
        
    def test_endpoint_with_date_filter(self):
        """Test endpoint with start_date and end_date filters"""
        response = requests.get(
            f"{BASE_URL}/api/invoices/stats/by-product",
            params={"start_date": "2026-03-01", "end_date": "2026-04-30"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["start_date"] == "2026-03-01"
        assert data["end_date"] == "2026-04-30"
        assert data["invoices_scanned"] >= 0
        
    def test_endpoint_with_department_filter(self):
        """Test endpoint with department filter"""
        response = requests.get(
            f"{BASE_URL}/api/invoices/stats/by-product",
            params={"department": "bar"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["department_filter"] == "bar"
        # All products should be from bar department
        for product in data["products"]:
            assert product["department"] == "bar"
            
    def test_endpoint_with_validated_only_false(self):
        """Test endpoint includes pending invoices when validated_only=false"""
        # First get validated only
        response_validated = requests.get(
            f"{BASE_URL}/api/invoices/stats/by-product",
            params={"validated_only": "true"}
        )
        assert response_validated.status_code == 200
        data_validated = response_validated.json()
        
        # Then get all including pending
        response_all = requests.get(
            f"{BASE_URL}/api/invoices/stats/by-product",
            params={"validated_only": "false"}
        )
        assert response_all.status_code == 200
        data_all = response_all.json()
        
        assert data_validated["validated_only"] == True
        assert data_all["validated_only"] == False
        # Should have same or more invoices when including pending
        assert data_all["invoices_scanned"] >= data_validated["invoices_scanned"]
        
    def test_product_structure(self):
        """Test each product has required fields"""
        response = requests.get(f"{BASE_URL}/api/invoices/stats/by-product")
        assert response.status_code == 200
        data = response.json()
        
        required_fields = [
            "name", "department", "quantity_sold", "revenue", 
            "invoice_count", "avg_price", "min_price", "max_price",
            "revenue_share_pct", "first_sold_at", "last_sold_at"
        ]
        
        if data["products"]:
            product = data["products"][0]
            for field in required_fields:
                assert field in product, f"Missing field: {field}"
                
    def test_revenue_share_pct_sum(self):
        """Test that revenue_share_pct sums to approximately 100%"""
        response = requests.get(f"{BASE_URL}/api/invoices/stats/by-product")
        assert response.status_code == 200
        data = response.json()
        
        if data["products"]:
            total_share = sum(p["revenue_share_pct"] for p in data["products"])
            # Allow small rounding error
            assert 99.5 <= total_share <= 100.5, f"Revenue share sum is {total_share}%, expected ~100%"
            
    def test_by_department_breakdown(self):
        """Test by_department breakdown structure"""
        response = requests.get(f"{BASE_URL}/api/invoices/stats/by-product")
        assert response.status_code == 200
        data = response.json()
        
        by_dept = data["by_department"]
        assert isinstance(by_dept, dict)
        
        for dept, stats in by_dept.items():
            assert "quantity_sold" in stats
            assert "revenue" in stats
            assert "products" in stats
            assert stats["quantity_sold"] >= 0
            assert stats["revenue"] >= 0
            assert stats["products"] >= 0
            
    def test_products_sorted_by_revenue_desc(self):
        """Test products are sorted by revenue descending"""
        response = requests.get(f"{BASE_URL}/api/invoices/stats/by-product")
        assert response.status_code == 200
        data = response.json()
        
        products = data["products"]
        if len(products) > 1:
            for i in range(len(products) - 1):
                assert products[i]["revenue"] >= products[i+1]["revenue"], \
                    f"Products not sorted by revenue: {products[i]['revenue']} < {products[i+1]['revenue']}"
                    
    def test_endpoint_route_not_conflicting_with_invoice_id(self):
        """Test that /stats/by-product route is placed before /{invoice_id}"""
        # This should return 200, not 404 (which would happen if route conflicts)
        response = requests.get(f"{BASE_URL}/api/invoices/stats/by-product")
        assert response.status_code == 200
        
        # Also verify a non-existent invoice returns 404
        response_404 = requests.get(f"{BASE_URL}/api/invoices/non-existent-id-12345")
        assert response_404.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
