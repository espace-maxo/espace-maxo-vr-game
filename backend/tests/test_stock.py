"""
Stock Management Module Tests
Tests for: Dashboard, Products, Categories, Suppliers, Movements, Purchases
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
API = f"{BASE_URL}/api/stock"

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

# ==================== DASHBOARD TESTS ====================
class TestDashboard:
    """Dashboard endpoint tests"""
    
    def test_dashboard_returns_200(self, api_client):
        """GET /api/stock/dashboard returns 200"""
        response = api_client.get(f"{API}/dashboard")
        assert response.status_code == 200
        print("✅ Dashboard returns 200")
    
    def test_dashboard_has_required_fields(self, api_client):
        """Dashboard contains all required fields"""
        response = api_client.get(f"{API}/dashboard")
        data = response.json()
        
        required_fields = ["total_products", "critical_products", "total_value", 
                          "entrees_today", "sorties_today", "rupture", "faible", 
                          "recent_movements", "recent_purchases", "stock_by_category"]
        
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        print(f"✅ Dashboard has all required fields: {required_fields}")
    
    def test_dashboard_rupture_and_faible_are_lists(self, api_client):
        """Rupture and faible alerts are lists"""
        response = api_client.get(f"{API}/dashboard")
        data = response.json()
        
        assert isinstance(data["rupture"], list)
        assert isinstance(data["faible"], list)
        print(f"✅ Rupture: {len(data['rupture'])} items, Faible: {len(data['faible'])} items")
    
    def test_dashboard_stock_by_category_structure(self, api_client):
        """Stock by category has correct structure"""
        response = api_client.get(f"{API}/dashboard")
        data = response.json()
        
        assert isinstance(data["stock_by_category"], dict)
        for cat_name, cat_data in data["stock_by_category"].items():
            assert "count" in cat_data
            assert "value" in cat_data
        print(f"✅ Stock by category: {len(data['stock_by_category'])} categories")

# ==================== CATEGORIES TESTS ====================
class TestCategories:
    """Category CRUD tests"""
    
    def test_get_categories(self, api_client):
        """GET /api/stock/categories returns list"""
        response = api_client.get(f"{API}/categories")
        assert response.status_code == 200
        data = response.json()
        assert "categories" in data
        assert isinstance(data["categories"], list)
        print(f"✅ GET categories: {len(data['categories'])} categories")
    
    def test_create_category(self, api_client):
        """POST /api/stock/categories creates new category"""
        payload = {
            "name": f"TEST_Category_{uuid.uuid4().hex[:6]}",
            "description": "Test category description",
            "color": "#ff5733"
        }
        response = api_client.post(f"{API}/categories", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["category"]["name"] == payload["name"]
        print(f"✅ Created category: {data['category']['name']}")
        return data["category"]["id"]
    
    def test_update_category(self, api_client):
        """PUT /api/stock/categories/{id} updates category"""
        # First create a category
        create_payload = {"name": f"TEST_Update_{uuid.uuid4().hex[:6]}", "description": "Original"}
        create_resp = api_client.post(f"{API}/categories", json=create_payload)
        cat_id = create_resp.json()["category"]["id"]
        
        # Update it
        update_payload = {"description": "Updated description"}
        response = api_client.put(f"{API}/categories/{cat_id}", json=update_payload)
        assert response.status_code == 200
        assert response.json()["category"]["description"] == "Updated description"
        print(f"✅ Updated category: {cat_id}")
        
        # Cleanup
        api_client.delete(f"{API}/categories/{cat_id}")
    
    def test_delete_category_without_products(self, api_client):
        """DELETE /api/stock/categories/{id} deletes empty category"""
        # Create a category
        create_payload = {"name": f"TEST_Delete_{uuid.uuid4().hex[:6]}"}
        create_resp = api_client.post(f"{API}/categories", json=create_payload)
        cat_id = create_resp.json()["category"]["id"]
        
        # Delete it
        response = api_client.delete(f"{API}/categories/{cat_id}")
        assert response.status_code == 200
        assert response.json()["success"] == True
        print(f"✅ Deleted category: {cat_id}")

# ==================== SUPPLIERS TESTS ====================
class TestSuppliers:
    """Supplier CRUD tests"""
    
    def test_get_suppliers(self, api_client):
        """GET /api/stock/suppliers returns list"""
        response = api_client.get(f"{API}/suppliers")
        assert response.status_code == 200
        data = response.json()
        assert "suppliers" in data
        assert isinstance(data["suppliers"], list)
        print(f"✅ GET suppliers: {len(data['suppliers'])} suppliers")
    
    def test_create_supplier(self, api_client):
        """POST /api/stock/suppliers creates new supplier"""
        payload = {
            "name": f"TEST_Supplier_{uuid.uuid4().hex[:6]}",
            "phone": "+229 97 00 00 00",
            "email": "test@supplier.com",
            "address": "Test Address",
            "product_types": "Test Products"
        }
        response = api_client.post(f"{API}/suppliers", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["supplier"]["name"] == payload["name"]
        print(f"✅ Created supplier: {data['supplier']['name']}")
        
        # Cleanup
        api_client.delete(f"{API}/suppliers/{data['supplier']['id']}")
    
    def test_update_supplier(self, api_client):
        """PUT /api/stock/suppliers/{id} updates supplier"""
        # Create
        create_payload = {"name": f"TEST_SupUpdate_{uuid.uuid4().hex[:6]}"}
        create_resp = api_client.post(f"{API}/suppliers", json=create_payload)
        sup_id = create_resp.json()["supplier"]["id"]
        
        # Update
        update_payload = {"phone": "+229 99 99 99 99"}
        response = api_client.put(f"{API}/suppliers/{sup_id}", json=update_payload)
        assert response.status_code == 200
        assert response.json()["supplier"]["phone"] == "+229 99 99 99 99"
        print(f"✅ Updated supplier: {sup_id}")
        
        # Cleanup
        api_client.delete(f"{API}/suppliers/{sup_id}")
    
    def test_delete_supplier(self, api_client):
        """DELETE /api/stock/suppliers/{id} deletes supplier"""
        # Create
        create_payload = {"name": f"TEST_SupDel_{uuid.uuid4().hex[:6]}"}
        create_resp = api_client.post(f"{API}/suppliers", json=create_payload)
        sup_id = create_resp.json()["supplier"]["id"]
        
        # Delete
        response = api_client.delete(f"{API}/suppliers/{sup_id}")
        assert response.status_code == 200
        assert response.json()["success"] == True
        print(f"✅ Deleted supplier: {sup_id}")

# ==================== PRODUCTS TESTS ====================
class TestProducts:
    """Product CRUD tests"""
    
    @pytest.fixture
    def test_category_id(self, api_client):
        """Get first category ID for product tests"""
        response = api_client.get(f"{API}/categories")
        categories = response.json()["categories"]
        if categories:
            return categories[0]["id"]
        # Create one if none exist
        create_resp = api_client.post(f"{API}/categories", json={"name": "TEST_ProductCat"})
        return create_resp.json()["category"]["id"]
    
    def test_get_products(self, api_client):
        """GET /api/stock/products returns list"""
        response = api_client.get(f"{API}/products")
        assert response.status_code == 200
        data = response.json()
        assert "products" in data
        assert isinstance(data["products"], list)
        print(f"✅ GET products: {len(data['products'])} products")
    
    def test_get_products_with_search(self, api_client):
        """GET /api/stock/products with search filter"""
        response = api_client.get(f"{API}/products", params={"search": "Riz"})
        assert response.status_code == 200
        products = response.json()["products"]
        # Should find products with "Riz" in name
        print(f"✅ Search 'Riz': {len(products)} products found")
    
    def test_get_products_with_category_filter(self, api_client, test_category_id):
        """GET /api/stock/products with category filter"""
        response = api_client.get(f"{API}/products", params={"category_id": test_category_id})
        assert response.status_code == 200
        print(f"✅ Category filter: {len(response.json()['products'])} products")
    
    def test_get_products_with_alert_filter_rupture(self, api_client):
        """GET /api/stock/products with alert=rupture filter"""
        response = api_client.get(f"{API}/products", params={"alert": "rupture"})
        assert response.status_code == 200
        products = response.json()["products"]
        # All returned products should have quantity <= 0
        for p in products:
            assert p["quantity"] <= 0, f"Product {p['name']} has quantity {p['quantity']}"
        print(f"✅ Alert rupture filter: {len(products)} products")
    
    def test_get_products_with_alert_filter_faible(self, api_client):
        """GET /api/stock/products with alert=faible filter"""
        response = api_client.get(f"{API}/products", params={"alert": "faible"})
        assert response.status_code == 200
        products = response.json()["products"]
        # All returned products should have 0 < quantity <= stock_min
        for p in products:
            assert 0 < p["quantity"] <= p["stock_min"], f"Product {p['name']} qty={p['quantity']} min={p['stock_min']}"
        print(f"✅ Alert faible filter: {len(products)} products")
    
    def test_create_product(self, api_client, test_category_id):
        """POST /api/stock/products creates new product"""
        payload = {
            "name": f"TEST_Product_{uuid.uuid4().hex[:6]}",
            "category_id": test_category_id,
            "unit": "kg",
            "quantity": 10,
            "stock_min": 5,
            "stock_max": 50,
            "purchase_price": 1000
        }
        response = api_client.post(f"{API}/products", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["product"]["name"] == payload["name"]
        assert data["product"]["quantity"] == 10
        print(f"✅ Created product: {data['product']['name']}")
        
        # Cleanup
        api_client.delete(f"{API}/products/{data['product']['id']}")
    
    def test_create_product_auto_generates_code(self, api_client, test_category_id):
        """Product code is auto-generated if not provided"""
        payload = {
            "name": f"TEST_AutoCode_{uuid.uuid4().hex[:6]}",
            "category_id": test_category_id,
            "unit": "piece"
        }
        response = api_client.post(f"{API}/products", json=payload)
        assert response.status_code == 200
        product = response.json()["product"]
        assert product["code"].startswith("PRD-")
        print(f"✅ Auto-generated code: {product['code']}")
        
        # Cleanup
        api_client.delete(f"{API}/products/{product['id']}")
    
    def test_update_product(self, api_client, test_category_id):
        """PUT /api/stock/products/{id} updates product"""
        # Create
        create_payload = {"name": f"TEST_ProdUpdate_{uuid.uuid4().hex[:6]}", "category_id": test_category_id}
        create_resp = api_client.post(f"{API}/products", json=create_payload)
        prod_id = create_resp.json()["product"]["id"]
        
        # Update
        update_payload = {"purchase_price": 5000, "stock_min": 10}
        response = api_client.put(f"{API}/products/{prod_id}", json=update_payload)
        assert response.status_code == 200
        updated = response.json()["product"]
        assert updated["purchase_price"] == 5000
        assert updated["stock_min"] == 10
        print(f"✅ Updated product: {prod_id}")
        
        # Cleanup
        api_client.delete(f"{API}/products/{prod_id}")
    
    def test_delete_product(self, api_client, test_category_id):
        """DELETE /api/stock/products/{id} deletes product"""
        # Create
        create_payload = {"name": f"TEST_ProdDel_{uuid.uuid4().hex[:6]}", "category_id": test_category_id}
        create_resp = api_client.post(f"{API}/products", json=create_payload)
        prod_id = create_resp.json()["product"]["id"]
        
        # Delete
        response = api_client.delete(f"{API}/products/{prod_id}")
        assert response.status_code == 200
        assert response.json()["success"] == True
        print(f"✅ Deleted product: {prod_id}")
    
    def test_get_single_product(self, api_client, test_category_id):
        """GET /api/stock/products/{id} returns single product"""
        # Create
        create_payload = {"name": f"TEST_SingleProd_{uuid.uuid4().hex[:6]}", "category_id": test_category_id}
        create_resp = api_client.post(f"{API}/products", json=create_payload)
        prod_id = create_resp.json()["product"]["id"]
        
        # Get single
        response = api_client.get(f"{API}/products/{prod_id}")
        assert response.status_code == 200
        product = response.json()
        assert product["id"] == prod_id
        print(f"✅ GET single product: {product['name']}")
        
        # Cleanup
        api_client.delete(f"{API}/products/{prod_id}")
    
    def test_get_nonexistent_product_returns_404(self, api_client):
        """GET /api/stock/products/{id} returns 404 for nonexistent"""
        response = api_client.get(f"{API}/products/nonexistent-id-12345")
        assert response.status_code == 404
        print("✅ Nonexistent product returns 404")

# ==================== MOVEMENTS TESTS ====================
class TestMovements:
    """Stock movement tests"""
    
    @pytest.fixture
    def test_product(self, api_client):
        """Create a test product for movement tests"""
        # Get a category
        cat_resp = api_client.get(f"{API}/categories")
        cat_id = cat_resp.json()["categories"][0]["id"]
        
        # Create product with initial stock
        payload = {
            "name": f"TEST_MovProd_{uuid.uuid4().hex[:6]}",
            "category_id": cat_id,
            "unit": "kg",
            "quantity": 50,
            "stock_min": 5,
            "purchase_price": 1000
        }
        response = api_client.post(f"{API}/products", json=payload)
        product = response.json()["product"]
        yield product
        # Cleanup
        api_client.delete(f"{API}/products/{product['id']}")
    
    def test_get_movements(self, api_client):
        """GET /api/stock/movements returns list"""
        response = api_client.get(f"{API}/movements")
        assert response.status_code == 200
        data = response.json()
        assert "movements" in data
        assert isinstance(data["movements"], list)
        print(f"✅ GET movements: {len(data['movements'])} movements")
    
    def test_create_movement_entree(self, api_client, test_product):
        """POST /api/stock/movements - entree increases stock"""
        initial_qty = test_product["quantity"]
        
        payload = {
            "product_id": test_product["id"],
            "movement_type": "entree",
            "quantity": 10,
            "unit_price": 1000,
            "reason": "Test entry"
        }
        response = api_client.post(f"{API}/movements", json=payload)
        assert response.status_code == 200
        movement = response.json()["movement"]
        
        assert movement["previous_quantity"] == initial_qty
        assert movement["new_quantity"] == initial_qty + 10
        assert movement["movement_type"] == "entree"
        print(f"✅ Entree movement: {initial_qty} -> {movement['new_quantity']}")
    
    def test_create_movement_sortie(self, api_client, test_product):
        """POST /api/stock/movements - sortie decreases stock"""
        # Get current quantity
        prod_resp = api_client.get(f"{API}/products/{test_product['id']}")
        current_qty = prod_resp.json()["quantity"]
        
        payload = {
            "product_id": test_product["id"],
            "movement_type": "sortie",
            "quantity": 5,
            "reason": "Test exit"
        }
        response = api_client.post(f"{API}/movements", json=payload)
        assert response.status_code == 200
        movement = response.json()["movement"]
        
        assert movement["new_quantity"] == current_qty - 5
        print(f"✅ Sortie movement: {current_qty} -> {movement['new_quantity']}")
    
    def test_create_movement_sortie_insufficient_stock(self, api_client, test_product):
        """POST /api/stock/movements - sortie blocked if insufficient stock"""
        # Get current quantity
        prod_resp = api_client.get(f"{API}/products/{test_product['id']}")
        current_qty = prod_resp.json()["quantity"]
        
        payload = {
            "product_id": test_product["id"],
            "movement_type": "sortie",
            "quantity": current_qty + 100,  # More than available
            "reason": "Test insufficient"
        }
        response = api_client.post(f"{API}/movements", json=payload)
        assert response.status_code == 400
        assert "insuffisant" in response.json()["detail"].lower()
        print(f"✅ Sortie blocked for insufficient stock (tried {current_qty + 100}, available {current_qty})")
    
    def test_create_movement_ajustement(self, api_client, test_product):
        """POST /api/stock/movements - ajustement sets exact quantity"""
        payload = {
            "product_id": test_product["id"],
            "movement_type": "ajustement",
            "quantity": 25,  # Set to exactly 25
            "reason": "Inventory adjustment"
        }
        response = api_client.post(f"{API}/movements", json=payload)
        assert response.status_code == 200
        movement = response.json()["movement"]
        
        assert movement["new_quantity"] == 25
        print(f"✅ Ajustement movement: set to {movement['new_quantity']}")
    
    def test_create_movement_perte(self, api_client, test_product):
        """POST /api/stock/movements - perte decreases stock"""
        # Get current quantity
        prod_resp = api_client.get(f"{API}/products/{test_product['id']}")
        current_qty = prod_resp.json()["quantity"]
        
        payload = {
            "product_id": test_product["id"],
            "movement_type": "perte",
            "quantity": 2,
            "reason": "Damaged goods"
        }
        response = api_client.post(f"{API}/movements", json=payload)
        assert response.status_code == 200
        movement = response.json()["movement"]
        
        assert movement["new_quantity"] == current_qty - 2
        print(f"✅ Perte movement: {current_qty} -> {movement['new_quantity']}")
    
    def test_create_movement_nonexistent_product(self, api_client):
        """POST /api/stock/movements - returns 404 for nonexistent product"""
        payload = {
            "product_id": "nonexistent-product-id",
            "movement_type": "entree",
            "quantity": 10
        }
        response = api_client.post(f"{API}/movements", json=payload)
        assert response.status_code == 404
        print("✅ Movement for nonexistent product returns 404")

# ==================== PURCHASES TESTS ====================
class TestPurchases:
    """Purchase tests"""
    
    @pytest.fixture
    def test_product_for_purchase(self, api_client):
        """Create a test product for purchase tests"""
        cat_resp = api_client.get(f"{API}/categories")
        cat_id = cat_resp.json()["categories"][0]["id"]
        
        payload = {
            "name": f"TEST_PurchProd_{uuid.uuid4().hex[:6]}",
            "category_id": cat_id,
            "unit": "piece",
            "quantity": 10,
            "purchase_price": 500
        }
        response = api_client.post(f"{API}/products", json=payload)
        product = response.json()["product"]
        yield product
        api_client.delete(f"{API}/products/{product['id']}")
    
    def test_get_purchases(self, api_client):
        """GET /api/stock/purchases returns list"""
        response = api_client.get(f"{API}/purchases")
        assert response.status_code == 200
        data = response.json()
        assert "purchases" in data
        assert isinstance(data["purchases"], list)
        print(f"✅ GET purchases: {len(data['purchases'])} purchases")
    
    def test_create_purchase_updates_stock(self, api_client, test_product_for_purchase):
        """POST /api/stock/purchases creates purchase and updates stock"""
        product = test_product_for_purchase
        initial_qty = product["quantity"]
        
        payload = {
            "supplier_name": "Test Supplier",
            "purchase_date": "2026-01-15",
            "items": [
                {
                    "product_id": product["id"],
                    "product_name": product["name"],
                    "quantity": 20,
                    "unit_price": 600
                }
            ],
            "notes": "Test purchase"
        }
        response = api_client.post(f"{API}/purchases", json=payload)
        assert response.status_code == 200
        purchase = response.json()["purchase"]
        
        assert purchase["total_amount"] == 20 * 600
        assert len(purchase["items"]) == 1
        
        # Verify stock was updated
        prod_resp = api_client.get(f"{API}/products/{product['id']}")
        new_qty = prod_resp.json()["quantity"]
        assert new_qty == initial_qty + 20
        print(f"✅ Purchase created, stock updated: {initial_qty} -> {new_qty}")
    
    def test_create_purchase_creates_movement(self, api_client, test_product_for_purchase):
        """POST /api/stock/purchases creates entree movement"""
        product = test_product_for_purchase
        
        payload = {
            "supplier_name": "Movement Test Supplier",
            "items": [
                {
                    "product_id": product["id"],
                    "product_name": product["name"],
                    "quantity": 5,
                    "unit_price": 500
                }
            ]
        }
        response = api_client.post(f"{API}/purchases", json=payload)
        assert response.status_code == 200
        
        # Check movements for this product
        mov_resp = api_client.get(f"{API}/movements", params={"product_id": product["id"]})
        movements = mov_resp.json()["movements"]
        
        # Should have at least one entree movement
        entree_movements = [m for m in movements if m["movement_type"] == "entree"]
        assert len(entree_movements) > 0
        print(f"✅ Purchase created entree movement")

# ==================== SEED TESTS ====================
class TestSeed:
    """Seed endpoint tests"""
    
    def test_seed_returns_already_present_message(self, api_client):
        """POST /api/stock/seed returns message when data exists"""
        response = api_client.post(f"{API}/seed")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        # Should say data already present since we have seeded data
        print(f"✅ Seed response: {data.get('message', 'OK')}")

# ==================== CLEANUP ====================
@pytest.fixture(scope="module", autouse=True)
def cleanup_test_data(api_client):
    """Cleanup TEST_ prefixed data after all tests"""
    yield
    # Cleanup products
    try:
        products_resp = api_client.get(f"{API}/products")
        for p in products_resp.json().get("products", []):
            if p["name"].startswith("TEST_"):
                api_client.delete(f"{API}/products/{p['id']}")
    except:
        pass
    
    # Cleanup categories
    try:
        cats_resp = api_client.get(f"{API}/categories")
        for c in cats_resp.json().get("categories", []):
            if c["name"].startswith("TEST_"):
                api_client.delete(f"{API}/categories/{c['id']}")
    except:
        pass
    
    # Cleanup suppliers
    try:
        sups_resp = api_client.get(f"{API}/suppliers")
        for s in sups_resp.json().get("suppliers", []):
            if s["name"].startswith("TEST_"):
                api_client.delete(f"{API}/suppliers/{s['id']}")
    except:
        pass
    
    print("✅ Cleanup completed")
