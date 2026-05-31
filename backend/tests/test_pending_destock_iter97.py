"""
Test Iteration 97 - Bug 1: pending_destock_quantity (ventes à découvert)
Tests the over_destock mechanism when selling items with stock=0 and the
automatic compensation when adjusting stock via PUT /api/stock/products/{id}.

Scenarios tested:
1. Stock=0, sell 30 units → over_destock=30, pending_destock_quantity=30, quantity stays 0
2. After sale, PUT quantity=65 → compensation_movement (30), adjustment_movement (+35), final quantity=35
3. No pending (pending=0): PUT quantity=100 on stock=50 → simple adjustment (+50), no compensation
4. Adjustment < pending: stock=0, pending=30, PUT quantity=20 → final=0, compensation=30, pending reset
5. PUT without quantity change (just price) → pending unchanged, no compensation
6. Recipe branch: ingredient in rupture sold → pending_destock_quantity incremented
7. Non-regression: bon_number generation, validated_only filter
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
PREFIX = "TEST_ITER97_"


class TestPendingDestockQuantity:
    """Tests for Bug 1: pending_destock_quantity mechanism"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.created_stock_products = []
        self.created_caisse_products = []
        self.created_invoices = []
        yield
        # Cleanup
        for sp_id in self.created_stock_products:
            try:
                self.session.delete(f"{BASE_URL}/api/stock/products/{sp_id}")
            except:
                pass
        for cp_id in self.created_caisse_products:
            try:
                self.session.delete(f"{BASE_URL}/api/caisse/products/{cp_id}")
            except:
                pass
        for inv_id in self.created_invoices:
            try:
                self.session.delete(f"{BASE_URL}/api/invoices/{inv_id}")
            except:
                pass

    def _get_or_create_category(self):
        """Get first category or create one"""
        r = self.session.get(f"{BASE_URL}/api/stock/categories")
        cats = r.json().get("categories", [])
        if cats:
            return cats[0]["id"]
        # Create one
        r = self.session.post(f"{BASE_URL}/api/stock/categories", json={
            "name": f"{PREFIX}TestCategory",
            "description": "Test category",
            "color": "#3b82f6"
        })
        return r.json()["category"]["id"]

    def _create_stock_product(self, name, quantity=0, purchase_price=100, storage_zone="cuisine"):
        """Helper to create a stock product"""
        cat_id = self._get_or_create_category()
        r = self.session.post(f"{BASE_URL}/api/stock/products", json={
            "name": f"{PREFIX}{name}",
            "category_id": cat_id,
            "unit": "kg",
            "quantity": quantity,
            "stock_min": 5,
            "stock_max": 100,
            "purchase_price": purchase_price,
            "storage_zone": storage_zone
        })
        assert r.status_code == 200, f"Failed to create stock product: {r.text}"
        product = r.json()["product"]
        self.created_stock_products.append(product["id"])
        return product

    def _create_caisse_product(self, name, price=1000, stock_links=None, stock_recipe_id=None):
        """Helper to create a caisse product with stock link"""
        payload = {
            "name": f"{PREFIX}{name}",
            "price": price,
            "category": "test",
            "department": "salle_jardin"
        }
        if stock_links:
            payload["stock_links"] = stock_links
        if stock_recipe_id:
            payload["stock_recipe_id"] = stock_recipe_id
        r = self.session.post(f"{BASE_URL}/api/caisse/products", json=payload)
        assert r.status_code == 200, f"Failed to create caisse product: {r.text}"
        product = r.json()["product"]
        self.created_caisse_products.append(product["id"])
        return product

    def _create_and_validate_invoice(self, caisse_product_id, caisse_product_name, quantity, price):
        """Helper to create and validate an invoice using two-step process.
        
        IMPORTANT: Destocking only triggers when transitioning from pending to validated
        via PUT, NOT when creating directly with validation_status='validated'.
        """
        # Step 1: Create invoice with validation_status='pending'
        r = self.session.post(f"{BASE_URL}/api/invoices", json={
            "customer_name": f"{PREFIX}Client",
            "items": [{
                "id": caisse_product_id,
                "product_id": caisse_product_id,
                "name": caisse_product_name,
                "price": price,
                "quantity": quantity,
                "department": "salle_jardin",
                "unit": "portion"
            }],
            "subtotal": price * quantity,
            "total": price * quantity,
            "payment_method": "cash",
            "validation_status": "pending",
            "created_by": "TestAgent"
        })
        assert r.status_code == 200, f"Failed to create invoice: {r.text}"
        invoice = r.json()["invoice"]
        self.created_invoices.append(invoice["id"])
        
        # Step 2: Validate the invoice via PUT (this triggers destocking)
        r2 = self.session.put(f"{BASE_URL}/api/invoices/{invoice['id']}", json={
            "validation_status": "validated",
            "validated_by": "TestAgent",
            "validated_at": datetime.now(timezone.utc).isoformat()
        })
        assert r2.status_code == 200, f"Failed to validate invoice: {r2.text}"
        
        # Fetch updated invoice
        r3 = self.session.get(f"{BASE_URL}/api/invoices/{invoice['id']}")
        if r3.status_code == 200:
            return r3.json()
        return invoice

    def _get_stock_product(self, product_id):
        """Get stock product by ID"""
        r = self.session.get(f"{BASE_URL}/api/stock/products/{product_id}")
        assert r.status_code == 200, f"Failed to get stock product: {r.text}"
        return r.json()

    def _get_movements_for_product(self, product_id, limit=50):
        """Get movements for a product"""
        r = self.session.get(f"{BASE_URL}/api/stock/movements", params={
            "product_id": product_id,
            "limit": limit
        })
        return r.json().get("movements", [])

    # =========================================================================
    # TEST 1: Stock=0, sell 30 units → over_destock=30, pending=30, qty stays 0
    # =========================================================================
    def test_scenario1_sell_with_zero_stock_creates_pending(self):
        """
        Bug 1 - Scenario 1:
        Stock=0, sell 30 units via validated invoice.
        Expected: movement with over_destock=30, stock_product.pending_destock_quantity=30,
        stock_product.quantity remains 0.
        """
        # Create stock product with quantity=0
        sp = self._create_stock_product("Scenario1_ZeroStock", quantity=0)
        sp_id = sp["id"]
        
        # Create caisse product linked to stock product
        cp = self._create_caisse_product("Scenario1_CaisseItem", price=500, stock_links=[sp_id])
        
        # Create and validate invoice with 30 units
        invoice = self._create_and_validate_invoice(cp["id"], cp["name"], quantity=30, price=500)
        
        # Verify stock product state
        sp_after = self._get_stock_product(sp_id)
        
        # Assertions
        assert sp_after["quantity"] == 0, f"Quantity should remain 0, got {sp_after['quantity']}"
        pending = sp_after.get("pending_destock_quantity", 0)
        assert pending == 30, f"pending_destock_quantity should be 30, got {pending}"
        
        # Check movement has over_destock=30
        movements = self._get_movements_for_product(sp_id)
        sale_movements = [m for m in movements if m.get("invoice_id") == invoice["id"]]
        assert len(sale_movements) >= 1, "Should have at least 1 sale movement"
        
        over_destock = sale_movements[0].get("over_destock", 0)
        assert over_destock == 30, f"Movement over_destock should be 30, got {over_destock}"
        
        print(f"✓ Scenario 1 PASSED: stock=0, sold 30, pending={pending}, over_destock={over_destock}")

    # =========================================================================
    # TEST 2: After sale, PUT quantity=65 → compensation + adjustment, final=35
    # =========================================================================
    def test_scenario2_adjustment_applies_pending_backlog(self):
        """
        Bug 1 - Scenario 2:
        After scenario 1 (pending=30), PUT quantity=65.
        Expected: compensation_movement (30), adjustment_movement (+35), final quantity=35,
        pending_destock_quantity reset to 0.
        """
        # Create stock product with quantity=0
        sp = self._create_stock_product("Scenario2_Backlog", quantity=0)
        sp_id = sp["id"]
        
        # Create caisse product linked to stock product
        cp = self._create_caisse_product("Scenario2_CaisseItem", price=500, stock_links=[sp_id])
        
        # Create and validate invoice with 30 units (creates pending=30)
        self._create_and_validate_invoice(cp["id"], cp["name"], quantity=30, price=500)
        
        # Verify pending is set
        sp_mid = self._get_stock_product(sp_id)
        assert sp_mid.get("pending_destock_quantity", 0) == 30, "Pending should be 30 after sale"
        
        # Now PUT quantity=65 (adjustment)
        r = self.session.put(f"{BASE_URL}/api/stock/products/{sp_id}", json={
            "quantity": 65,
            "adjustment_reason": "Inventaire physique",
            "adjustment_user": "TestAgent"
        })
        assert r.status_code == 200, f"PUT failed: {r.text}"
        result = r.json()
        
        # Check response contains compensation_movement and adjustment_movement
        compensation = result.get("compensation_movement")
        adjustment = result.get("adjustment_movement")
        
        assert compensation is not None, "Response should contain compensation_movement"
        assert compensation.get("quantity") == 30, f"Compensation quantity should be 30, got {compensation.get('quantity')}"
        
        assert adjustment is not None, "Response should contain adjustment_movement"
        # Delta should be 35 (from 0 to 35 after compensation)
        adj_delta = adjustment.get("adjustment_delta", 0)
        assert adj_delta == 35, f"Adjustment delta should be 35, got {adj_delta}"
        
        # Verify final product state
        sp_final = self._get_stock_product(sp_id)
        assert sp_final["quantity"] == 35, f"Final quantity should be 35, got {sp_final['quantity']}"
        assert sp_final.get("pending_destock_quantity", 0) == 0, f"Pending should be reset to 0, got {sp_final.get('pending_destock_quantity')}"
        
        print(f"✓ Scenario 2 PASSED: PUT 65 with pending=30 → final qty=35, pending=0")

    # =========================================================================
    # TEST 3: No pending (pending=0): PUT quantity=100 on stock=50 → simple adjustment
    # =========================================================================
    def test_scenario3_no_pending_simple_adjustment(self):
        """
        Bug 1 - Scenario 3:
        Stock=50, pending=0, PUT quantity=100.
        Expected: simple adjustment_movement (+50), no compensation_movement.
        """
        # Create stock product with quantity=50
        sp = self._create_stock_product("Scenario3_NoPending", quantity=50)
        sp_id = sp["id"]
        
        # Verify no pending
        sp_before = self._get_stock_product(sp_id)
        assert sp_before.get("pending_destock_quantity", 0) == 0, "Should have no pending"
        
        # PUT quantity=100
        r = self.session.put(f"{BASE_URL}/api/stock/products/{sp_id}", json={
            "quantity": 100,
            "adjustment_reason": "Réception marchandise",
            "adjustment_user": "TestAgent"
        })
        assert r.status_code == 200, f"PUT failed: {r.text}"
        result = r.json()
        
        # Should have adjustment_movement but NO compensation_movement
        compensation = result.get("compensation_movement")
        adjustment = result.get("adjustment_movement")
        
        assert compensation is None, "Should NOT have compensation_movement when pending=0"
        assert adjustment is not None, "Should have adjustment_movement"
        
        adj_delta = adjustment.get("adjustment_delta", 0)
        assert adj_delta == 50, f"Adjustment delta should be +50, got {adj_delta}"
        
        # Verify final state
        sp_final = self._get_stock_product(sp_id)
        assert sp_final["quantity"] == 100, f"Final quantity should be 100, got {sp_final['quantity']}"
        
        print(f"✓ Scenario 3 PASSED: No pending, simple adjustment +50 → qty=100")

    # =========================================================================
    # TEST 4: Adjustment < pending: stock=0, pending=30, PUT quantity=20 → final=0
    # =========================================================================
    def test_scenario4_adjustment_less_than_pending(self):
        """
        Bug 1 - Scenario 4:
        Stock=0, pending=30, PUT quantity=20.
        Expected: final quantity = max(0, 20-30) = 0, compensation_movement (30),
        pending reset to 0.
        """
        # Create stock product with quantity=0
        sp = self._create_stock_product("Scenario4_LessThanPending", quantity=0)
        sp_id = sp["id"]
        
        # Create caisse product and sell 30 units to create pending=30
        cp = self._create_caisse_product("Scenario4_CaisseItem", price=500, stock_links=[sp_id])
        self._create_and_validate_invoice(cp["id"], cp["name"], quantity=30, price=500)
        
        # Verify pending=30
        sp_mid = self._get_stock_product(sp_id)
        assert sp_mid.get("pending_destock_quantity", 0) == 30, "Pending should be 30"
        
        # PUT quantity=20 (less than pending)
        r = self.session.put(f"{BASE_URL}/api/stock/products/{sp_id}", json={
            "quantity": 20,
            "adjustment_reason": "Inventaire partiel",
            "adjustment_user": "TestAgent"
        })
        assert r.status_code == 200, f"PUT failed: {r.text}"
        result = r.json()
        
        # Check compensation_movement
        compensation = result.get("compensation_movement")
        assert compensation is not None, "Should have compensation_movement"
        assert compensation.get("quantity") == 30, f"Compensation should be 30, got {compensation.get('quantity')}"
        
        # Verify final state: quantity should be max(0, 20-30) = 0
        sp_final = self._get_stock_product(sp_id)
        final_qty = sp_final["quantity"]
        # The logic is: new_qty_val = max(0, 20 - 30) = 0
        # Then adjustment delta = 0 - 0 = 0 (no adjustment movement if delta is 0)
        assert final_qty == 0, f"Final quantity should be 0 (max(0, 20-30)), got {final_qty}"
        assert sp_final.get("pending_destock_quantity", 0) == 0, f"Pending should be reset to 0"
        
        print(f"✓ Scenario 4 PASSED: PUT 20 with pending=30 → final qty=0, pending=0")

    # =========================================================================
    # TEST 5: PUT without quantity change → pending unchanged, no compensation
    # =========================================================================
    def test_scenario5_no_quantity_change_no_compensation(self):
        """
        Bug 1 - Scenario 5:
        Stock=0, pending=30, PUT only price (no quantity change).
        Expected: pending_destock_quantity unchanged, no compensation_movement.
        """
        # Create stock product with quantity=0
        sp = self._create_stock_product("Scenario5_NoQtyChange", quantity=0, purchase_price=100)
        sp_id = sp["id"]
        
        # Create caisse product and sell 30 units to create pending=30
        cp = self._create_caisse_product("Scenario5_CaisseItem", price=500, stock_links=[sp_id])
        self._create_and_validate_invoice(cp["id"], cp["name"], quantity=30, price=500)
        
        # Verify pending=30
        sp_mid = self._get_stock_product(sp_id)
        assert sp_mid.get("pending_destock_quantity", 0) == 30, "Pending should be 30"
        
        # PUT only price change, no quantity
        r = self.session.put(f"{BASE_URL}/api/stock/products/{sp_id}", json={
            "purchase_price": 150  # Only change price
        })
        assert r.status_code == 200, f"PUT failed: {r.text}"
        result = r.json()
        
        # Should NOT have compensation_movement
        compensation = result.get("compensation_movement")
        assert compensation is None, "Should NOT have compensation_movement when quantity unchanged"
        
        # Verify pending unchanged
        sp_final = self._get_stock_product(sp_id)
        assert sp_final.get("pending_destock_quantity", 0) == 30, f"Pending should remain 30, got {sp_final.get('pending_destock_quantity')}"
        assert sp_final["purchase_price"] == 150, f"Price should be updated to 150"
        
        print(f"✓ Scenario 5 PASSED: PUT price only → pending unchanged (30)")

    # =========================================================================
    # TEST 6: Recipe branch - ingredient in rupture sold → pending incremented
    # =========================================================================
    def test_scenario6_recipe_ingredient_pending(self):
        """
        Bug 1 - Scenario 6:
        Caisse product linked to a recipe. Ingredient in rupture (qty=0).
        Sell via invoice → ingredient's pending_destock_quantity incremented.
        """
        # Create stock product (ingredient) with quantity=0
        unique_suffix = str(uuid.uuid4())[:8]
        sp = self._create_stock_product(f"Scenario6_Ingredient_{unique_suffix}", quantity=0)
        sp_id = sp["id"]
        
        # Create a recipe that uses this ingredient
        recipe_payload = {
            "name": f"{PREFIX}Scenario6_Recipe_{unique_suffix}",
            "caisse_product_name": f"{PREFIX}Scenario6_Dish_{unique_suffix}",
            "selling_price": 2000,
            "ingredients": [{
                "product_id": sp_id,
                "product_name": sp["name"],
                "quantity": 2,  # 2 units per dish
                "unit": "kg"
            }],
            "notes": "Test recipe"
        }
        r = self.session.post(f"{BASE_URL}/api/stock/recipes", json=recipe_payload)
        assert r.status_code == 200, f"Failed to create recipe: {r.text}"
        recipe = r.json()["recipe"]
        
        # Create caisse product linked to recipe
        cp = self._create_caisse_product(f"Scenario6_Dish_{unique_suffix}", price=2000, stock_recipe_id=recipe["id"])
        
        # Sell 5 dishes (should deduct 5*2=10 units from ingredient)
        self._create_and_validate_invoice(cp["id"], cp["name"], quantity=5, price=2000)
        
        # Verify ingredient's pending_destock_quantity
        sp_after = self._get_stock_product(sp_id)
        pending = sp_after.get("pending_destock_quantity", 0)
        
        # Expected: 5 dishes * 2 units/dish = 10 units pending
        assert pending == 10, f"Ingredient pending should be 10 (5*2), got {pending}"
        assert sp_after["quantity"] == 0, f"Ingredient quantity should remain 0"
        
        # Cleanup recipe
        self.session.delete(f"{BASE_URL}/api/stock/recipes/{recipe['id']}")
        
        print(f"✓ Scenario 6 PASSED: Recipe ingredient pending={pending} after selling 5 dishes")


class TestNonRegression:
    """Non-regression tests for Lot 1 features"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.created_invoices = []
        yield
        # Cleanup
        for inv_id in self.created_invoices:
            try:
                self.session.delete(f"{BASE_URL}/api/invoices/{inv_id}")
            except:
                pass

    def test_bon_number_generation_with_table_number(self):
        """
        Non-regression: POST /api/invoices with table_number generates bon_number.
        """
        r = self.session.post(f"{BASE_URL}/api/invoices", json={
            "customer_name": f"{PREFIX}BonTest",
            "items": [{
                "id": "test-item-1",
                "name": "Test Item",
                "price": 1000,
                "quantity": 1,
                "department": "salle_jardin",
                "unit": "portion"
            }],
            "subtotal": 1000,
            "total": 1000,
            "payment_method": "cash",
            "validation_status": "pending",
            "table_number": 99,  # This should trigger bon_number generation
            "created_by": "TestAgent"
        })
        assert r.status_code == 200, f"Failed to create invoice: {r.text}"
        invoice = r.json()["invoice"]
        self.created_invoices.append(invoice["id"])
        
        bon_number = invoice.get("bon_number", "")
        assert bon_number != "", "bon_number should be generated when table_number is provided"
        assert bon_number.startswith("BON-"), f"bon_number should start with 'BON-', got {bon_number}"
        
        print(f"✓ Non-regression: bon_number={bon_number} generated for table_number=99")

    def test_validated_only_filter(self):
        """
        Non-regression: GET /api/invoices?validated_only=true returns only validated invoices.
        """
        # Create a pending invoice
        r1 = self.session.post(f"{BASE_URL}/api/invoices", json={
            "customer_name": f"{PREFIX}PendingInvoice",
            "items": [{"id": "p1", "name": "Pending Item", "price": 500, "quantity": 1, "department": "salle_jardin", "unit": "portion"}],
            "subtotal": 500,
            "total": 500,
            "payment_method": "cash",
            "validation_status": "pending",
            "created_by": "TestAgent"
        })
        assert r1.status_code == 200
        pending_inv = r1.json()["invoice"]
        self.created_invoices.append(pending_inv["id"])
        
        # Create a validated invoice
        r2 = self.session.post(f"{BASE_URL}/api/invoices", json={
            "customer_name": f"{PREFIX}ValidatedInvoice",
            "items": [{"id": "v1", "name": "Validated Item", "price": 1000, "quantity": 1, "department": "salle_jardin", "unit": "portion"}],
            "subtotal": 1000,
            "total": 1000,
            "payment_method": "cash",
            "validation_status": "validated",
            "created_by": "TestAgent"
        })
        assert r2.status_code == 200
        validated_inv = r2.json()["invoice"]
        self.created_invoices.append(validated_inv["id"])
        
        # GET with validated_only=true
        r = self.session.get(f"{BASE_URL}/api/invoices", params={"validated_only": "true"})
        assert r.status_code == 200
        invoices = r.json().get("invoices", [])
        
        # All returned invoices should be validated
        for inv in invoices:
            assert inv.get("validation_status") == "validated", f"Found non-validated invoice: {inv.get('id')}"
        
        # Our pending invoice should NOT be in the list
        pending_ids = [inv["id"] for inv in invoices if inv.get("validation_status") != "validated"]
        assert len(pending_ids) == 0, f"Found {len(pending_ids)} non-validated invoices in validated_only=true response"
        
        print(f"✓ Non-regression: validated_only=true filter working ({len(invoices)} validated invoices)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
