"""
Iteration 66 - Test Caisse Products Stock Linking Features
Tests for:
1. POST /api/caisse/products/auto-link-to-stock - Auto-link caisse products to stock
2. GET /api/caisse/products/stock-suggestions - Autocomplete suggestions for stock products
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestAutoLinkToStock:
    """Tests for POST /api/caisse/products/auto-link-to-stock endpoint"""

    def test_auto_link_dry_run(self):
        """Test auto-link with dry_run=true - should not modify data"""
        response = requests.post(
            f"{BASE_URL}/api/caisse/products/auto-link-to-stock",
            params={"threshold": 0.80, "dry_run": True}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "scanned" in data, "Response should contain 'scanned' count"
        assert "already_linked" in data, "Response should contain 'already_linked' count"
        assert "linked" in data, "Response should contain 'linked' list"
        assert "ambiguous" in data, "Response should contain 'ambiguous' list"
        assert "no_match" in data, "Response should contain 'no_match' list"
        assert "threshold" in data, "Response should contain 'threshold'"
        assert "dry_run" in data, "Response should contain 'dry_run'"
        assert "linked_count" in data, "Response should contain 'linked_count'"
        assert "ambiguous_count" in data, "Response should contain 'ambiguous_count'"
        assert "no_match_count" in data, "Response should contain 'no_match_count'"
        
        # Verify dry_run flag is True
        assert data["dry_run"] == True, "dry_run should be True"
        assert data["threshold"] == 0.80, "threshold should be 0.80"
        
        print(f"✓ Auto-link dry run: scanned={data['scanned']}, linked={data['linked_count']}, "
              f"ambiguous={data['ambiguous_count']}, no_match={data['no_match_count']}, "
              f"already_linked={data['already_linked']}")

    def test_auto_link_with_lower_threshold(self):
        """Test auto-link with lower threshold (0.60) - should find more matches"""
        response = requests.post(
            f"{BASE_URL}/api/caisse/products/auto-link-to-stock",
            params={"threshold": 0.60, "dry_run": True}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["threshold"] == 0.60, "threshold should be 0.60"
        print(f"✓ Auto-link with threshold 0.60: linked={data['linked_count']}, no_match={data['no_match_count']}")

    def test_auto_link_linked_items_structure(self):
        """Verify structure of linked items in response"""
        response = requests.post(
            f"{BASE_URL}/api/caisse/products/auto-link-to-stock",
            params={"threshold": 0.80, "dry_run": True}
        )
        assert response.status_code == 200
        
        data = response.json()
        if data["linked"]:
            linked_item = data["linked"][0]
            assert "caisse_id" in linked_item, "Linked item should have caisse_id"
            assert "caisse_name" in linked_item, "Linked item should have caisse_name"
            assert "stock_id" in linked_item, "Linked item should have stock_id"
            assert "stock_name" in linked_item, "Linked item should have stock_name"
            assert "score" in linked_item, "Linked item should have score"
            assert linked_item["score"] >= 0.80, f"Score should be >= 0.80, got {linked_item['score']}"
            print(f"✓ Linked item structure verified: {linked_item['caisse_name']} → {linked_item['stock_name']} ({linked_item['score']})")
        else:
            print("✓ No linked items found (all may be already linked or no matches)")


class TestStockSuggestions:
    """Tests for GET /api/caisse/products/stock-suggestions endpoint"""

    def test_suggestions_for_poulet(self):
        """Test suggestions for 'poulet' - should return chicken products"""
        response = requests.get(
            f"{BASE_URL}/api/caisse/products/stock-suggestions",
            params={"name": "poulet", "limit": 5}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "suggestions" in data, "Response should contain 'suggestions'"
        
        suggestions = data["suggestions"]
        print(f"✓ Suggestions for 'poulet': {len(suggestions)} results")
        
        if suggestions:
            # Verify structure
            first = suggestions[0]
            assert "id" in first, "Suggestion should have id"
            assert "name" in first, "Suggestion should have name"
            assert "unit" in first, "Suggestion should have unit"
            assert "score" in first, "Suggestion should have score"
            
            # Verify relevance - should contain poulet-related products
            names = [s["name"].lower() for s in suggestions]
            print(f"  Suggestions: {[s['name'] for s in suggestions]}")
            
            # Score should be boosted for prefix/contains matches
            assert first["score"] >= 0.85, f"First suggestion score should be >= 0.85 (startswith/contains boost), got {first['score']}"

    def test_suggestions_for_riz(self):
        """Test suggestions for 'riz' - should return rice products"""
        response = requests.get(
            f"{BASE_URL}/api/caisse/products/stock-suggestions",
            params={"name": "riz", "limit": 5}
        )
        assert response.status_code == 200
        
        data = response.json()
        suggestions = data["suggestions"]
        print(f"✓ Suggestions for 'riz': {len(suggestions)} results")
        
        if suggestions:
            print(f"  Suggestions: {[s['name'] for s in suggestions]}")
            # Should find rice products with high score
            assert suggestions[0]["score"] >= 0.85, "First suggestion should have high score"

    def test_suggestions_short_query(self):
        """Test that queries < 2 chars return empty suggestions"""
        response = requests.get(
            f"{BASE_URL}/api/caisse/products/stock-suggestions",
            params={"name": "a", "limit": 5}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["suggestions"] == [], "Single char query should return empty suggestions"
        print("✓ Short query (1 char) returns empty suggestions")

    def test_suggestions_empty_query(self):
        """Test that empty query returns empty suggestions"""
        response = requests.get(
            f"{BASE_URL}/api/caisse/products/stock-suggestions",
            params={"name": "", "limit": 5}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["suggestions"] == [], "Empty query should return empty suggestions"
        print("✓ Empty query returns empty suggestions")

    def test_suggestions_limit_parameter(self):
        """Test that limit parameter is respected"""
        response = requests.get(
            f"{BASE_URL}/api/caisse/products/stock-suggestions",
            params={"name": "poulet", "limit": 3}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert len(data["suggestions"]) <= 3, f"Should return at most 3 suggestions, got {len(data['suggestions'])}"
        print(f"✓ Limit parameter respected: {len(data['suggestions'])} <= 3")


class TestCaisseProductsCRUD:
    """Regression tests for caisse products CRUD operations"""

    def test_get_caisse_products(self):
        """Test GET /api/caisse/products - should return products list"""
        response = requests.get(f"{BASE_URL}/api/caisse/products")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "products" in data, "Response should contain 'products'"
        print(f"✓ GET caisse products: {len(data['products'])} products found")

    def test_create_and_delete_product(self):
        """Test creating and deleting a caisse product"""
        # Create a test product
        test_product = {
            "name": "TEST_Product_Iter66",
            "price": 1500,
            "department": "bar",
            "unit": "unité",
            "category": "Test",
            "is_available": True,
            "stock_product_id": ""
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/caisse/products",
            json=test_product
        )
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        
        created = create_response.json()
        # API returns {"product": {...}, "success": true}
        assert "product" in created or "id" in created, "Response should contain product data"
        product_data = created.get("product", created)
        assert "id" in product_data, "Created product should have id"
        product_id = product_data["id"]
        print(f"✓ Created test product: {product_id}")
        
        # Verify it exists
        get_response = requests.get(f"{BASE_URL}/api/caisse/products")
        products = get_response.json().get("products", [])
        found = any(p["id"] == product_id for p in products)
        assert found, "Created product should be in products list"
        print("✓ Product found in list")
        
        # Delete the test product
        delete_response = requests.delete(f"{BASE_URL}/api/caisse/products/{product_id}")
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        print(f"✓ Deleted test product: {product_id}")
        
        # Verify it's gone
        get_response2 = requests.get(f"{BASE_URL}/api/caisse/products")
        products2 = get_response2.json().get("products", [])
        found2 = any(p["id"] == product_id for p in products2)
        assert not found2, "Deleted product should not be in products list"
        print("✓ Product no longer in list after deletion")

    def test_create_product_with_stock_link(self):
        """Test creating a caisse product with stock_product_id"""
        # First get a stock product to link to
        stock_response = requests.get(f"{BASE_URL}/api/stock/products")
        if stock_response.status_code != 200:
            pytest.skip("Stock products endpoint not available")
        
        stock_products = stock_response.json().get("products", [])
        if not stock_products:
            pytest.skip("No stock products available to link")
        
        stock_product = stock_products[0]
        stock_id = stock_product.get("id")
        
        # Create a caisse product linked to stock
        test_product = {
            "name": "TEST_Linked_Product_Iter66",
            "price": 2000,
            "department": "bar",
            "unit": "unité",
            "category": "Test",
            "is_available": True,
            "stock_product_id": stock_id
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/caisse/products",
            json=test_product
        )
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        
        created = create_response.json()
        # API returns {"product": {...}, "success": true}
        product_data = created.get("product", created)
        product_id = product_data["id"]
        
        # Verify the stock_product_id was saved
        get_response = requests.get(f"{BASE_URL}/api/caisse/products")
        products = get_response.json().get("products", [])
        found_product = next((p for p in products if p["id"] == product_id), None)
        
        assert found_product is not None, "Created product should be in list"
        assert found_product.get("stock_product_id") == stock_id, \
            f"stock_product_id should be {stock_id}, got {found_product.get('stock_product_id')}"
        print(f"✓ Created product with stock link: {product_id} → {stock_id}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/caisse/products/{product_id}")
        print("✓ Cleaned up test product")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
