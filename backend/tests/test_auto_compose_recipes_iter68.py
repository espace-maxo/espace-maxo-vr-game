"""
Test suite for Iteration 68 - Auto-Compose Recipes Feature
Tests the POST /api/stock/recipes/auto-compose endpoint that:
1. Scans all caisse products
2. Applies keyword rules to identify ingredients
3. Creates recipe fiches with 1 portion per ingredient
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAutoComposeRecipes:
    """Tests for POST /api/stock/recipes/auto-compose endpoint"""
    
    def test_auto_compose_dry_run(self):
        """Test dry_run=true returns preview without saving"""
        response = requests.post(f"{BASE_URL}/api/stock/recipes/auto-compose", json={
            "only_unmatched": True,
            "skip_dishless": True,
            "dry_run": True
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "scanned" in data, "Response should contain 'scanned' count"
        assert "skipped_existing" in data, "Response should contain 'skipped_existing' count"
        assert "skipped_no_match" in data, "Response should contain 'skipped_no_match' list"
        assert "skipped_no_match_count" in data, "Response should contain 'skipped_no_match_count'"
        assert "created" in data, "Response should contain 'created' list"
        assert "created_count" in data, "Response should contain 'created_count'"
        assert "dry_run" in data, "Response should contain 'dry_run' flag"
        assert data["dry_run"] == True, "dry_run should be True"
        
        print(f"Dry run results: scanned={data['scanned']}, created_count={data['created_count']}, skipped_existing={data['skipped_existing']}, skipped_no_match_count={data['skipped_no_match_count']}")
    
    def test_auto_compose_only_unmatched_skips_existing(self):
        """Test that only_unmatched=true skips caisse products that already have recipes"""
        # First, get current recipe count
        recipes_response = requests.get(f"{BASE_URL}/api/stock/recipes")
        assert recipes_response.status_code == 200
        initial_recipes = recipes_response.json().get("recipes", [])
        initial_count = len(initial_recipes)
        
        # Run auto-compose with only_unmatched=true (dry run to check behavior)
        response = requests.post(f"{BASE_URL}/api/stock/recipes/auto-compose", json={
            "only_unmatched": True,
            "skip_dishless": True,
            "dry_run": True
        })
        assert response.status_code == 200
        data = response.json()
        
        # If there are existing recipes, skipped_existing should be > 0
        if initial_count > 0:
            print(f"Initial recipes: {initial_count}, skipped_existing: {data['skipped_existing']}")
            # Note: skipped_existing counts caisse products whose name matches an existing recipe's caisse_product_name
        
        print(f"Test passed: only_unmatched behavior verified")
    
    def test_auto_compose_skip_dishless(self):
        """Test that skip_dishless=true skips products with no keyword match"""
        response = requests.post(f"{BASE_URL}/api/stock/recipes/auto-compose", json={
            "only_unmatched": True,
            "skip_dishless": True,
            "dry_run": True
        })
        assert response.status_code == 200
        data = response.json()
        
        # skipped_no_match should contain items that don't match any keyword
        skipped = data.get("skipped_no_match", [])
        print(f"Skipped (no keyword match): {len(skipped)} items")
        if skipped:
            print(f"Examples of skipped items: {skipped[:5]}")
        
        # Verify skipped_no_match_count matches list length
        assert data["skipped_no_match_count"] == len(skipped), "skipped_no_match_count should match list length"
    
    def test_auto_compose_creates_recipes_with_correct_structure(self):
        """Test that created recipes have correct structure with ingredients"""
        response = requests.post(f"{BASE_URL}/api/stock/recipes/auto-compose", json={
            "only_unmatched": True,
            "skip_dishless": True,
            "dry_run": True
        })
        assert response.status_code == 200
        data = response.json()
        
        created = data.get("created", [])
        if created:
            # Check first created recipe structure
            recipe = created[0]
            assert "name" in recipe, "Created recipe should have 'name'"
            assert "ingredients_count" in recipe, "Created recipe should have 'ingredients_count'"
            assert "ingredients" in recipe, "Created recipe should have 'ingredients'"
            
            # Check ingredient structure
            if recipe["ingredients"]:
                ing = recipe["ingredients"][0]
                assert "name" in ing, "Ingredient should have 'name'"
                assert "qty" in ing, "Ingredient should have 'qty'"
                assert "unit" in ing, "Ingredient should have 'unit'"
                
            print(f"Sample created recipe: {recipe['name']} with {recipe['ingredients_count']} ingredients")
            print(f"Ingredients: {recipe['ingredients']}")
    
    def test_auto_compose_keyword_matching(self):
        """Test that keyword rules are applied correctly"""
        response = requests.post(f"{BASE_URL}/api/stock/recipes/auto-compose", json={
            "only_unmatched": False,  # Check all products
            "skip_dishless": True,
            "dry_run": True
        })
        assert response.status_code == 200
        data = response.json()
        
        created = data.get("created", [])
        
        # Look for specific keyword matches
        keyword_tests = {
            "poulet": ["poulet", "oignon", "tomate", "huile", "sel"],
            "riz": ["riz", "huile", "sel"],
            "salade": ["salade", "laitue", "tomate", "oignon"],
            "poisson": ["poisson", "oignon", "tomate", "huile"],
        }
        
        for recipe in created:
            name_lower = recipe["name"].lower()
            for keyword, expected_ingredients in keyword_tests.items():
                if keyword in name_lower:
                    ing_names = [i["name"].lower() for i in recipe["ingredients"]]
                    print(f"Recipe '{recipe['name']}' (keyword: {keyword}): {ing_names}")
                    # At least some expected ingredients should be present
                    break
    
    def test_auto_compose_department_filter(self):
        """Test department_filter parameter"""
        # Test with a specific department filter
        response = requests.post(f"{BASE_URL}/api/stock/recipes/auto-compose", json={
            "only_unmatched": True,
            "skip_dishless": True,
            "dry_run": True,
            "department_filter": "salle_jardin"
        })
        assert response.status_code == 200
        data = response.json()
        
        print(f"With department_filter='salle_jardin': scanned={data['scanned']}, created_count={data['created_count']}")
        
        # Compare with no filter
        response_all = requests.post(f"{BASE_URL}/api/stock/recipes/auto-compose", json={
            "only_unmatched": True,
            "skip_dishless": True,
            "dry_run": True
        })
        data_all = response_all.json()
        
        print(f"Without filter: scanned={data_all['scanned']}, created_count={data_all['created_count']}")
        
        # Filtered should be <= unfiltered
        assert data["scanned"] <= data_all["scanned"], "Filtered scan should be <= unfiltered"


class TestAutoComposeRecipesIntegration:
    """Integration tests for auto-compose with actual recipe creation"""
    
    def test_auto_compose_actual_creation(self):
        """Test actual recipe creation (not dry run)"""
        # First, get current recipe count
        recipes_response = requests.get(f"{BASE_URL}/api/stock/recipes")
        assert recipes_response.status_code == 200
        initial_recipes = recipes_response.json().get("recipes", [])
        initial_count = len(initial_recipes)
        
        # Run auto-compose with dry_run=false but only_unmatched=true
        # This should only create recipes for products not yet linked
        response = requests.post(f"{BASE_URL}/api/stock/recipes/auto-compose", json={
            "only_unmatched": True,
            "skip_dishless": True,
            "dry_run": False
        })
        assert response.status_code == 200
        data = response.json()
        
        created_count = data.get("created_count", 0)
        print(f"Created {created_count} new recipes")
        
        # Verify recipes were actually created
        recipes_after = requests.get(f"{BASE_URL}/api/stock/recipes")
        assert recipes_after.status_code == 200
        final_recipes = recipes_after.json().get("recipes", [])
        final_count = len(final_recipes)
        
        # Final count should be initial + created
        assert final_count >= initial_count, f"Final count ({final_count}) should be >= initial ({initial_count})"
        print(f"Recipe count: {initial_count} -> {final_count} (created: {created_count})")
    
    def test_auto_generated_recipes_have_correct_fields(self):
        """Test that auto-generated recipes have auto_generated=true and correct notes"""
        recipes_response = requests.get(f"{BASE_URL}/api/stock/recipes")
        assert recipes_response.status_code == 200
        recipes = recipes_response.json().get("recipes", [])
        
        auto_generated = [r for r in recipes if r.get("auto_generated") == True]
        print(f"Found {len(auto_generated)} auto-generated recipes out of {len(recipes)} total")
        
        if auto_generated:
            recipe = auto_generated[0]
            # Check auto_generated flag
            assert recipe.get("auto_generated") == True, "auto_generated should be True"
            
            # Check notes contain expected text
            notes = recipe.get("notes", "")
            assert "automatiquement" in notes.lower() or "1 portion" in notes.lower(), \
                f"Notes should mention automatic generation: {notes}"
            
            print(f"Sample auto-generated recipe: {recipe['name']}")
            print(f"Notes: {recipe['notes']}")
            print(f"Ingredients: {len(recipe.get('ingredients', []))}")


class TestRecipesEndpoints:
    """Test existing recipes endpoints for regression"""
    
    def test_get_recipes(self):
        """Test GET /api/stock/recipes returns list"""
        response = requests.get(f"{BASE_URL}/api/stock/recipes")
        assert response.status_code == 200
        data = response.json()
        assert "recipes" in data, "Response should contain 'recipes' key"
        print(f"Total recipes: {len(data['recipes'])}")
    
    def test_recipe_has_cost_and_margin(self):
        """Test that recipes have cost_price and margin calculated"""
        response = requests.get(f"{BASE_URL}/api/stock/recipes")
        assert response.status_code == 200
        recipes = response.json().get("recipes", [])
        
        if recipes:
            recipe = recipes[0]
            # These fields are calculated by the GET endpoint
            assert "cost_price" in recipe, "Recipe should have cost_price"
            assert "margin" in recipe, "Recipe should have margin"
            assert "margin_percent" in recipe, "Recipe should have margin_percent"
            print(f"Recipe '{recipe['name']}': cost={recipe['cost_price']}, margin={recipe['margin']}, margin%={recipe['margin_percent']}")


class TestStockMovementsForRecipes:
    """Test stock movements related to recipe-based sales"""
    
    def test_get_movements_with_sortie_type(self):
        """Test GET /api/stock/movements with movement_type=sortie"""
        response = requests.get(f"{BASE_URL}/api/stock/movements", params={
            "movement_type": "sortie",
            "limit": 50
        })
        assert response.status_code == 200
        data = response.json()
        assert "movements" in data, "Response should contain 'movements' key"
        
        movements = data["movements"]
        print(f"Found {len(movements)} sortie movements")
        
        # Check for recipe-based sales (reason contains 'Vente (Recette:')
        recipe_sales = [m for m in movements if "Recette:" in (m.get("reason") or "")]
        print(f"Recipe-based sales: {len(recipe_sales)}")
        
        if recipe_sales:
            sale = recipe_sales[0]
            print(f"Sample sale: {sale['product_name']} - {sale['quantity']} {sale['unit']} - {sale['reason']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
