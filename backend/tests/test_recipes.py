"""
Test Suite for Fiches Techniques / Recettes Feature
Tests Recipe CRUD, seed demo, and invoice validation with recipe deduction
"""
import pytest
import requests
import os
import time
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
STOCK_API = f"{BASE_URL}/api/stock"
CAISSE_API = f"{BASE_URL}/api"

# Test credentials
STOCK_ADMIN = {"username": "admin", "password": "Admin2026"}
CAISSE_PASSWORD = "Caisse2026"


class TestRecipeCRUD:
    """Test Recipe CRUD endpoints"""
    
    def test_get_recipes_list(self):
        """GET /api/stock/recipes - List all recipes"""
        response = requests.get(f"{STOCK_API}/recipes")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "recipes" in data, "Response should contain 'recipes' key"
        print(f"✅ GET /api/stock/recipes - Found {len(data['recipes'])} recipes")
        return data["recipes"]
    
    def test_recipes_have_calculated_fields(self):
        """Verify recipes have cost_price, margin, margin_percent calculated"""
        response = requests.get(f"{STOCK_API}/recipes")
        assert response.status_code == 200
        recipes = response.json()["recipes"]
        
        if len(recipes) > 0:
            recipe = recipes[0]
            assert "cost_price" in recipe, "Recipe should have cost_price"
            assert "margin" in recipe, "Recipe should have margin"
            assert "margin_percent" in recipe, "Recipe should have margin_percent"
            print(f"✅ Recipe '{recipe['name']}' has calculated fields: cost_price={recipe['cost_price']}, margin={recipe['margin']}, margin_percent={recipe['margin_percent']}%")
        else:
            print("⚠️ No recipes found to verify calculated fields")
    
    def test_seed_demo_recipes(self):
        """POST /api/stock/recipes/seed-demo - Seed demo 'Poulet braisé' recipe"""
        response = requests.post(f"{STOCK_API}/recipes/seed-demo")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True, "Seed should succeed"
        print(f"✅ POST /api/stock/recipes/seed-demo - {data.get('message')}")
    
    def test_create_recipe(self):
        """POST /api/stock/recipes - Create a new recipe"""
        # First get a product to use as ingredient
        products_resp = requests.get(f"{STOCK_API}/products", params={"search": "Oignon"})
        products = products_resp.json().get("products", [])
        
        if not products:
            pytest.skip("No products found to create recipe ingredient")
        
        product = products[0]
        test_name = f"TEST_Recipe_{uuid.uuid4().hex[:6]}"
        
        recipe_data = {
            "name": test_name,
            "caisse_product_name": test_name,
            "selling_price": 5000,
            "ingredients": [
                {
                    "product_id": product["id"],
                    "product_name": product["name"],
                    "quantity": 0.5,
                    "unit": product.get("unit", "kg")
                }
            ],
            "notes": "Test recipe for automated testing"
        }
        
        response = requests.post(f"{STOCK_API}/recipes", json=recipe_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True, "Create should succeed"
        assert "recipe" in data, "Response should contain recipe"
        assert data["recipe"]["name"] == test_name
        print(f"✅ POST /api/stock/recipes - Created recipe '{test_name}'")
        return data["recipe"]
    
    def test_update_recipe(self):
        """PUT /api/stock/recipes/{id} - Update a recipe"""
        # First create a recipe
        products_resp = requests.get(f"{STOCK_API}/products", params={"search": "Sel"})
        products = products_resp.json().get("products", [])
        
        if not products:
            pytest.skip("No products found")
        
        product = products[0]
        test_name = f"TEST_Update_{uuid.uuid4().hex[:6]}"
        
        create_data = {
            "name": test_name,
            "caisse_product_name": test_name,
            "selling_price": 3000,
            "ingredients": [{"product_id": product["id"], "product_name": product["name"], "quantity": 0.1, "unit": "kg"}],
            "notes": ""
        }
        create_resp = requests.post(f"{STOCK_API}/recipes", json=create_data)
        assert create_resp.status_code == 200
        recipe_id = create_resp.json()["recipe"]["id"]
        
        # Update the recipe
        update_data = {
            "selling_price": 4000,
            "notes": "Updated notes"
        }
        response = requests.put(f"{STOCK_API}/recipes/{recipe_id}", json=update_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True
        assert data["recipe"]["selling_price"] == 4000
        print(f"✅ PUT /api/stock/recipes/{recipe_id} - Updated selling_price to 4000")
        
        # Cleanup
        requests.delete(f"{STOCK_API}/recipes/{recipe_id}")
    
    def test_delete_recipe(self):
        """DELETE /api/stock/recipes/{id} - Delete a recipe"""
        # First create a recipe
        products_resp = requests.get(f"{STOCK_API}/products", params={"search": "Ail"})
        products = products_resp.json().get("products", [])
        
        if not products:
            pytest.skip("No products found")
        
        product = products[0]
        test_name = f"TEST_Delete_{uuid.uuid4().hex[:6]}"
        
        create_data = {
            "name": test_name,
            "caisse_product_name": test_name,
            "selling_price": 2000,
            "ingredients": [{"product_id": product["id"], "product_name": product["name"], "quantity": 0.05, "unit": "kg"}],
            "notes": ""
        }
        create_resp = requests.post(f"{STOCK_API}/recipes", json=create_data)
        assert create_resp.status_code == 200
        recipe_id = create_resp.json()["recipe"]["id"]
        
        # Delete the recipe
        response = requests.delete(f"{STOCK_API}/recipes/{recipe_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True
        print(f"✅ DELETE /api/stock/recipes/{recipe_id} - Recipe deleted")
        
        # Verify deletion
        get_resp = requests.get(f"{STOCK_API}/recipes")
        recipes = get_resp.json()["recipes"]
        assert not any(r["id"] == recipe_id for r in recipes), "Recipe should be deleted"


class TestPouletBraiseRecipe:
    """Test the demo 'Poulet braisé' recipe specifically"""
    
    def test_poulet_braise_exists(self):
        """Verify Poulet braisé recipe exists with correct structure"""
        response = requests.get(f"{STOCK_API}/recipes")
        assert response.status_code == 200
        recipes = response.json()["recipes"]
        
        poulet_recipe = next((r for r in recipes if "poulet" in r["name"].lower() and "brais" in r["name"].lower()), None)
        
        if not poulet_recipe:
            # Try to seed it
            seed_resp = requests.post(f"{STOCK_API}/recipes/seed-demo")
            assert seed_resp.status_code == 200
            
            # Fetch again
            response = requests.get(f"{STOCK_API}/recipes")
            recipes = response.json()["recipes"]
            poulet_recipe = next((r for r in recipes if "poulet" in r["name"].lower() and "brais" in r["name"].lower()), None)
        
        assert poulet_recipe is not None, "Poulet braisé recipe should exist"
        assert poulet_recipe["caisse_product_name"].lower() == "poulet braise", f"caisse_product_name should be 'Poulet braise', got '{poulet_recipe['caisse_product_name']}'"
        assert poulet_recipe["selling_price"] == 3500, f"selling_price should be 3500, got {poulet_recipe['selling_price']}"
        
        ingredients = poulet_recipe.get("ingredients", [])
        assert len(ingredients) >= 1, f"Should have at least 1 ingredient, got {len(ingredients)}"
        print(f"✅ Poulet braisé recipe exists with {len(ingredients)} ingredients, selling_price=3500")
        return poulet_recipe
    
    def test_poulet_braise_cost_calculation(self):
        """Verify cost_price and margin are calculated correctly"""
        response = requests.get(f"{STOCK_API}/recipes")
        recipes = response.json()["recipes"]
        
        poulet_recipe = next((r for r in recipes if "poulet" in r["name"].lower() and "brais" in r["name"].lower()), None)
        
        if not poulet_recipe:
            pytest.skip("Poulet braisé recipe not found")
        
        assert "cost_price" in poulet_recipe, "Should have cost_price"
        assert "margin" in poulet_recipe, "Should have margin"
        assert "margin_percent" in poulet_recipe, "Should have margin_percent"
        
        # Verify margin calculation
        expected_margin = poulet_recipe["selling_price"] - poulet_recipe["cost_price"]
        assert abs(poulet_recipe["margin"] - expected_margin) < 1, f"Margin calculation incorrect: {poulet_recipe['margin']} vs expected {expected_margin}"
        
        print(f"✅ Poulet braisé: cost_price={poulet_recipe['cost_price']}, margin={poulet_recipe['margin']} ({poulet_recipe['margin_percent']}%)")


class TestRecipeDeductionOnInvoice:
    """Test that validating an invoice with a recipe item deducts ingredients from stock"""
    
    @pytest.fixture
    def caisse_token(self):
        """Get Caisse JWT token"""
        response = requests.post(f"{CAISSE_API}/caisse/login", json={"password": CAISSE_PASSWORD})
        assert response.status_code == 200, f"Caisse login failed: {response.text}"
        return response.json()["token"]
    
    def test_recipe_deduction_flow(self, caisse_token):
        """Full flow: Create invoice with 'Poulet braise' → Validate → Check stock movements"""
        headers = {"Authorization": f"Bearer {caisse_token}"}
        
        # 1. Get the Poulet braisé recipe to know ingredients
        recipes_resp = requests.get(f"{STOCK_API}/recipes")
        recipes = recipes_resp.json()["recipes"]
        poulet_recipe = next((r for r in recipes if "poulet" in r["name"].lower() and "brais" in r["name"].lower()), None)
        
        if not poulet_recipe:
            pytest.skip("Poulet braisé recipe not found")
        
        # 2. Get initial stock quantities for ingredients
        initial_stocks = {}
        for ing in poulet_recipe.get("ingredients", []):
            prod_resp = requests.get(f"{STOCK_API}/products/{ing['product_id']}")
            if prod_resp.status_code == 200:
                initial_stocks[ing["product_id"]] = prod_resp.json().get("quantity", 0)
        
        print(f"Initial stock quantities: {initial_stocks}")
        
        # 3. Create an invoice with 'Poulet braise' (2 portions)
        invoice_data = {
            "customer_name": "TEST_Recipe_Client",
            "customer_phone": "",
            "items": [
                {
                    "id": "test-poulet",
                    "name": "Poulet braise",  # Must match caisse_product_name
                    "price": 3500,
                    "quantity": 2,
                    "department": "jardin",
                    "unit": "portion"
                }
            ],
            "subtotal": 7000,
            "discount": 0,
            "discount_amount": 0,
            "total": 7000,
            "payment_method": "cash",
            "totals_by_department": {"jardin": 7000},
            "notes": "Test recipe deduction",
            "created_by": "TestAgent",
            "validation_status": "pending"
        }
        
        create_resp = requests.post(f"{CAISSE_API}/invoices", json=invoice_data, headers=headers)
        assert create_resp.status_code == 200, f"Invoice creation failed: {create_resp.text}"
        resp_data = create_resp.json()
        invoice = resp_data.get("invoice", resp_data)  # Handle both formats
        invoice_id = invoice["id"]
        print(f"✅ Created invoice {invoice_id} with 2x Poulet braise")
        
        # 4. Validate the invoice
        validate_data = {"validation_status": "validated"}
        validate_resp = requests.put(f"{CAISSE_API}/invoices/{invoice_id}", json=validate_data, headers=headers)
        assert validate_resp.status_code == 200, f"Invoice validation failed: {validate_resp.text}"
        print(f"✅ Validated invoice {invoice_id}")
        
        # 5. Check stock movements for recipe deduction
        time.sleep(0.5)  # Allow time for async operations
        movements_resp = requests.get(f"{STOCK_API}/movements", params={"limit": 50})
        movements = movements_resp.json()["movements"]
        
        # Find movements related to this invoice with recipe
        recipe_movements = [m for m in movements if m.get("invoice_id") == invoice_id and "Recette" in m.get("reason", "")]
        
        assert len(recipe_movements) > 0, f"Should have recipe deduction movements, found {len(recipe_movements)}"
        print(f"✅ Found {len(recipe_movements)} stock movements with 'Recette: Poulet braise' in reason")
        
        # Verify movement details
        for mov in recipe_movements:
            assert mov["movement_type"] == "sortie", f"Movement type should be 'sortie', got {mov['movement_type']}"
            assert "Recette: Poulet braise" in mov["reason"], f"Reason should contain 'Recette: Poulet braise'"
            print(f"  - {mov['product_name']}: -{mov['quantity']} {mov['unit']} (reason: {mov['reason'][:50]}...)")
        
        # 6. Verify stock quantities decreased
        for ing in poulet_recipe.get("ingredients", []):
            if ing["product_id"] in initial_stocks:
                prod_resp = requests.get(f"{STOCK_API}/products/{ing['product_id']}")
                if prod_resp.status_code == 200:
                    new_qty = prod_resp.json().get("quantity", 0)
                    expected_deduction = ing["quantity"] * 2  # 2 portions
                    expected_new_qty = initial_stocks[ing["product_id"]] - expected_deduction
                    # Allow small floating point differences
                    assert abs(new_qty - expected_new_qty) < 0.01, f"Stock for {ing['product_name']} should be ~{expected_new_qty}, got {new_qty}"
        
        print("✅ Stock quantities correctly decreased for all ingredients")


class TestFallbackBehavior:
    """Test fallback behavior when product has no recipe"""
    
    @pytest.fixture
    def caisse_token(self):
        """Get Caisse JWT token"""
        response = requests.post(f"{CAISSE_API}/caisse/login", json={"password": CAISSE_PASSWORD})
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_no_recipe_fallback(self, caisse_token):
        """Selling a product without a recipe should use direct name match"""
        headers = {"Authorization": f"Bearer {caisse_token}"}
        
        # Create invoice with a product that has no recipe (e.g., Soda)
        invoice_data = {
            "customer_name": "TEST_NoRecipe_Client",
            "customer_phone": "",
            "items": [
                {
                    "id": "test-soda",
                    "name": "Soda",  # No recipe for this
                    "price": 1000,
                    "quantity": 1,
                    "department": "bar",
                    "unit": "bouteille"
                }
            ],
            "subtotal": 1000,
            "discount": 0,
            "discount_amount": 0,
            "total": 1000,
            "payment_method": "cash",
            "totals_by_department": {"bar": 1000},
            "notes": "Test no recipe fallback",
            "created_by": "TestAgent",
            "validation_status": "pending"
        }
        
        create_resp = requests.post(f"{CAISSE_API}/invoices", json=invoice_data, headers=headers)
        assert create_resp.status_code == 200
        resp_data = create_resp.json()
        invoice = resp_data.get("invoice", resp_data)
        invoice_id = invoice["id"]
        
        # Validate
        validate_resp = requests.put(f"{CAISSE_API}/invoices/{invoice_id}", json={"validation_status": "validated"}, headers=headers)
        assert validate_resp.status_code == 200
        print(f"✅ Created and validated invoice {invoice_id} with 'Soda' (no recipe)")
        
        # Check movements - should either have direct match or no movement
        time.sleep(0.3)
        movements_resp = requests.get(f"{STOCK_API}/movements", params={"limit": 20})
        movements = movements_resp.json()["movements"]
        
        invoice_movements = [m for m in movements if m.get("invoice_id") == invoice_id]
        
        # If there's a movement, it should NOT have "Recette" in reason
        for mov in invoice_movements:
            assert "Recette" not in mov.get("reason", ""), "Fallback movement should not mention 'Recette'"
        
        print(f"✅ Fallback behavior correct: {len(invoice_movements)} movement(s) without 'Recette' mention")


class TestStockAuth:
    """Test Stock module authentication"""
    
    def test_stock_login_admin(self):
        """POST /api/stock/auth/login - Admin login"""
        response = requests.post(f"{STOCK_API}/auth/login", json=STOCK_ADMIN)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True
        assert data["user"]["role"] == "administrateur"
        print(f"✅ Stock admin login successful: {data['user']['full_name']}")


# Cleanup function
def cleanup_test_recipes():
    """Delete all TEST_ prefixed recipes"""
    response = requests.get(f"{STOCK_API}/recipes")
    if response.status_code == 200:
        recipes = response.json()["recipes"]
        for r in recipes:
            if r["name"].startswith("TEST_"):
                requests.delete(f"{STOCK_API}/recipes/{r['id']}")
                print(f"Cleaned up test recipe: {r['name']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
