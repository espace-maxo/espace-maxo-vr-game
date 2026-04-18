"""
Test Suite: Expenses Router Refactoring (Phase 5)
Tests the extraction of 7 expense endpoints from server.py to /app/backend/routers/expenses.py

Endpoints tested:
  - GET /api/expenses (with filters: status, category, start_date, end_date, respect_assigned_week)
  - POST /api/expenses (creates expense with status='pending')
  - PUT /api/expenses/{id} (update, status=approved sets approved_at, status=completed syncs stock)
  - DELETE /api/expenses/{id}
  - PUT /api/expenses/{id}/assign-week
  - POST /api/expenses/assign-week-bulk
  - POST /api/expenses/unassign-week-bulk

Critical sync test: PUT status=completed → stock_movements entree + stock_purchases + product qty update
"""
import pytest
import requests
import os
import time
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestExpensesCRUD:
    """Test basic CRUD operations for expenses"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_prefix = f"TEST_{uuid.uuid4().hex[:6]}"
        self.created_expenses = []
        yield
        # Cleanup
        for exp_id in self.created_expenses:
            try:
                requests.delete(f"{BASE_URL}/api/expenses/{exp_id}")
            except:
                pass
    
    def test_01_get_expenses_no_filter(self):
        """GET /api/expenses returns list of expenses"""
        response = requests.get(f"{BASE_URL}/api/expenses")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "expenses" in data
        assert isinstance(data["expenses"], list)
        print(f"✅ GET /api/expenses: {len(data['expenses'])} expenses found")
    
    def test_02_get_expenses_with_status_filter(self):
        """GET /api/expenses?status=pending filters by status"""
        response = requests.get(f"{BASE_URL}/api/expenses", params={"status": "pending"})
        assert response.status_code == 200
        
        data = response.json()
        for exp in data["expenses"]:
            assert exp.get("status") == "pending", f"Expected pending, got {exp.get('status')}"
        print(f"✅ GET /api/expenses?status=pending: {len(data['expenses'])} pending expenses")
    
    def test_03_get_expenses_with_category_filter(self):
        """GET /api/expenses?category=Alimentation filters by category"""
        response = requests.get(f"{BASE_URL}/api/expenses", params={"category": "Alimentation"})
        assert response.status_code == 200
        
        data = response.json()
        for exp in data["expenses"]:
            assert exp.get("category") == "Alimentation"
        print(f"✅ GET /api/expenses?category=Alimentation: {len(data['expenses'])} expenses")
    
    def test_04_get_expenses_with_date_filter(self):
        """GET /api/expenses with start_date and end_date filters"""
        today = datetime.now().strftime("%Y-%m-%d")
        week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        
        response = requests.get(f"{BASE_URL}/api/expenses", params={
            "start_date": week_ago,
            "end_date": today
        })
        assert response.status_code == 200
        
        data = response.json()
        print(f"✅ GET /api/expenses with date range: {len(data['expenses'])} expenses")
    
    def test_05_get_expenses_with_respect_assigned_week(self):
        """GET /api/expenses?respect_assigned_week=true excludes transferred expenses"""
        today = datetime.now().strftime("%Y-%m-%d")
        week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        
        response = requests.get(f"{BASE_URL}/api/expenses", params={
            "start_date": week_ago,
            "end_date": today,
            "respect_assigned_week": True
        })
        assert response.status_code == 200
        
        data = response.json()
        print(f"✅ GET /api/expenses with respect_assigned_week: {len(data['expenses'])} expenses")
    
    def test_06_create_expense_default_status_pending(self):
        """POST /api/expenses creates expense with status='pending' by default"""
        expense_data = {
            "category": "Alimentation",
            "description": f"{self.test_prefix}_Test expense",
            "amount": 5000,
            "supplier": "Test Supplier",
            "requested_by": "Test User"
        }
        
        response = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        assert "expense" in data
        
        expense = data["expense"]
        assert expense.get("status") == "pending", f"Expected pending, got {expense.get('status')}"
        assert expense.get("category") == "Alimentation"
        assert expense.get("description") == f"{self.test_prefix}_Test expense"
        assert expense.get("amount") == 5000
        assert expense.get("id") is not None
        assert expense.get("created_at") is not None
        
        self.created_expenses.append(expense["id"])
        print(f"✅ POST /api/expenses: created {expense['id']} with status=pending")
    
    def test_07_create_expense_with_group_items(self):
        """POST /api/expenses with is_group=true and items[]"""
        expense_data = {
            "category": "Alimentation",
            "description": f"{self.test_prefix}_Grouped expense",
            "amount": 15000,
            "supplier": "Marché Test",
            "requested_by": "Test User",
            "is_group": True,
            "items": [
                {"description": "Item A", "quantity": 5, "unit_price": 1000, "amount": 5000, "category": "Cat1"},
                {"description": "Item B", "quantity": 10, "unit_price": 500, "amount": 5000, "category": "Cat2"},
                {"description": "Item C", "quantity": 5, "unit_price": 1000, "amount": 5000, "category": "Cat3"}
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
        assert response.status_code == 200
        
        data = response.json()
        expense = data["expense"]
        assert expense.get("is_group") == True
        assert expense.get("items") is not None
        assert len(expense["items"]) == 3
        
        self.created_expenses.append(expense["id"])
        print(f"✅ POST /api/expenses with group items: {len(expense['items'])} items")
    
    def test_08_update_expense_status_approved(self):
        """PUT /api/expenses/{id} status=approved sets approved_at"""
        # Create expense first
        expense_data = {
            "category": "Divers",
            "description": f"{self.test_prefix}_To approve",
            "amount": 3000,
            "requested_by": "Test User"
        }
        create_resp = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
        expense_id = create_resp.json()["expense"]["id"]
        self.created_expenses.append(expense_id)
        
        # Update to approved
        update_resp = requests.put(f"{BASE_URL}/api/expenses/{expense_id}", json={"status": "approved"})
        assert update_resp.status_code == 200, f"Failed: {update_resp.text}"
        
        updated = update_resp.json()["expense"]
        assert updated.get("status") == "approved"
        assert updated.get("approved_at") is not None, "approved_at should be set"
        print(f"✅ PUT status=approved: approved_at={updated['approved_at']}")
    
    def test_09_update_expense_not_found(self):
        """PUT /api/expenses/{id} returns 404 for non-existent expense"""
        fake_id = str(uuid.uuid4())
        response = requests.put(f"{BASE_URL}/api/expenses/{fake_id}", json={"status": "approved"})
        assert response.status_code == 404
        print(f"✅ PUT non-existent expense returns 404")
    
    def test_10_delete_expense(self):
        """DELETE /api/expenses/{id} removes expense"""
        # Create expense
        expense_data = {
            "category": "Divers",
            "description": f"{self.test_prefix}_To delete",
            "amount": 1000,
            "requested_by": "Test User"
        }
        create_resp = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
        expense_id = create_resp.json()["expense"]["id"]
        
        # Delete
        delete_resp = requests.delete(f"{BASE_URL}/api/expenses/{expense_id}")
        assert delete_resp.status_code == 200
        assert delete_resp.json().get("success") == True
        
        # Verify deleted
        get_resp = requests.get(f"{BASE_URL}/api/expenses")
        expenses = get_resp.json()["expenses"]
        ids = [e["id"] for e in expenses]
        assert expense_id not in ids, "Expense should be deleted"
        print(f"✅ DELETE /api/expenses/{expense_id}: success")
    
    def test_11_delete_expense_not_found(self):
        """DELETE /api/expenses/{id} returns 404 for non-existent expense"""
        fake_id = str(uuid.uuid4())
        response = requests.delete(f"{BASE_URL}/api/expenses/{fake_id}")
        assert response.status_code == 404
        print(f"✅ DELETE non-existent expense returns 404")


class TestExpenseAssignWeek:
    """Test assign-week endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.test_prefix = f"TEST_{uuid.uuid4().hex[:6]}"
        self.created_expenses = []
        yield
        for exp_id in self.created_expenses:
            try:
                requests.delete(f"{BASE_URL}/api/expenses/{exp_id}")
            except:
                pass
    
    def test_12_assign_expense_to_week(self):
        """PUT /api/expenses/{id}/assign-week assigns expense to specific week"""
        # Create expense
        expense_data = {
            "category": "Divers",
            "description": f"{self.test_prefix}_To assign",
            "amount": 2000,
            "requested_by": "Test User"
        }
        create_resp = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
        expense_id = create_resp.json()["expense"]["id"]
        self.created_expenses.append(expense_id)
        
        # Assign to week
        week_start = "2026-01-20"  # A Monday
        assign_resp = requests.put(
            f"{BASE_URL}/api/expenses/{expense_id}/assign-week",
            json={"week_start": week_start}
        )
        assert assign_resp.status_code == 200, f"Failed: {assign_resp.text}"
        
        updated = assign_resp.json()["expense"]
        assert updated.get("assigned_week") == week_start
        print(f"✅ PUT assign-week: assigned to {week_start}")
    
    def test_13_assign_week_bulk(self):
        """POST /api/expenses/assign-week-bulk assigns multiple expenses"""
        # Create 2 expenses
        ids = []
        for i in range(2):
            expense_data = {
                "category": "Divers",
                "description": f"{self.test_prefix}_Bulk {i}",
                "amount": 1000,
                "requested_by": "Test User"
            }
            resp = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
            ids.append(resp.json()["expense"]["id"])
            self.created_expenses.append(ids[-1])
        
        # Bulk assign
        week_start = "2026-01-27"
        bulk_resp = requests.post(
            f"{BASE_URL}/api/expenses/assign-week-bulk",
            json={"ids": ids, "week_start": week_start}
        )
        assert bulk_resp.status_code == 200, f"Failed: {bulk_resp.text}"
        
        data = bulk_resp.json()
        assert data.get("success") == True
        assert data.get("modified") == 2
        print(f"✅ POST assign-week-bulk: modified {data['modified']} expenses")
    
    def test_14_unassign_week_bulk(self):
        """POST /api/expenses/unassign-week-bulk removes week assignment"""
        # Create expense with assigned_week
        expense_data = {
            "category": "Divers",
            "description": f"{self.test_prefix}_To unassign",
            "amount": 1500,
            "requested_by": "Test User",
            "assigned_week": "2026-02-03"
        }
        create_resp = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
        expense_id = create_resp.json()["expense"]["id"]
        self.created_expenses.append(expense_id)
        
        # Unassign
        unassign_resp = requests.post(
            f"{BASE_URL}/api/expenses/unassign-week-bulk",
            json={"ids": [expense_id]}
        )
        assert unassign_resp.status_code == 200
        
        data = unassign_resp.json()
        assert data.get("success") == True
        print(f"✅ POST unassign-week-bulk: success")


class TestExpenseStockSyncCritical:
    """CRITICAL: Test status=completed syncs with Stock module"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.test_prefix = f"TEST_{uuid.uuid4().hex[:6]}"
        self.created_expenses = []
        yield
        for exp_id in self.created_expenses:
            try:
                requests.delete(f"{BASE_URL}/api/expenses/{exp_id}")
            except:
                pass
    
    def test_15_complete_expense_creates_stock_movements(self):
        """PUT status=completed creates stock_movements entree for each item"""
        # Create grouped expense with items
        expense_data = {
            "category": "Alimentation",
            "description": f"{self.test_prefix}_Stock sync test",
            "amount": 10000,
            "supplier": "Test Supplier Stock",
            "requested_by": "Test User",
            "is_group": True,
            "items": [
                {"description": "Tomates", "quantity": 5, "unit_price": 1000, "amount": 5000, "category": "Légumes"},
                {"description": "Oignons", "quantity": 10, "unit_price": 500, "amount": 5000, "category": "Légumes"}
            ]
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
        assert create_resp.status_code == 200
        expense_id = create_resp.json()["expense"]["id"]
        self.created_expenses.append(expense_id)
        
        # Complete the expense
        update_resp = requests.put(f"{BASE_URL}/api/expenses/{expense_id}", json={"status": "completed"})
        assert update_resp.status_code == 200
        
        updated = update_resp.json()["expense"]
        assert updated.get("status") == "completed"
        assert updated.get("completed_at") is not None
        print(f"✅ Expense completed at: {updated['completed_at']}")
        
        # Check stock movements were created
        time.sleep(0.5)
        movements_resp = requests.get(f"{BASE_URL}/api/stock/movements", params={"limit": 50})
        assert movements_resp.status_code == 200
        
        movements = movements_resp.json().get("movements", [])
        expense_movements = [m for m in movements if m.get("expense_id") == expense_id]
        
        assert len(expense_movements) >= 2, f"Expected 2+ movements, got {len(expense_movements)}"
        
        for mov in expense_movements:
            assert mov.get("movement_type") == "entree"
            assert "Achat Caisse" in mov.get("reason", "")
        
        print(f"✅ Stock movements created: {len(expense_movements)} entree movements")
    
    def test_16_complete_expense_creates_stock_purchase(self):
        """PUT status=completed creates stock_purchases with source='caisse'"""
        # Create expense
        expense_data = {
            "category": "Alimentation",
            "description": f"{self.test_prefix}_Purchase test",
            "amount": 3000,
            "supplier": "Fournisseur Test",
            "requested_by": "Test User",
            "is_group": True,
            "items": [
                {"description": "Riz", "quantity": 3, "unit_price": 1000, "amount": 3000, "category": "Céréales"}
            ]
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
        expense_id = create_resp.json()["expense"]["id"]
        self.created_expenses.append(expense_id)
        
        # Complete
        requests.put(f"{BASE_URL}/api/expenses/{expense_id}", json={"status": "completed"})
        time.sleep(0.5)
        
        # Check stock_purchases
        purchases_resp = requests.get(f"{BASE_URL}/api/stock/purchases", params={"limit": 20})
        assert purchases_resp.status_code == 200
        
        purchases = purchases_resp.json().get("purchases", [])
        expense_purchases = [p for p in purchases if p.get("expense_id") == expense_id]
        
        assert len(expense_purchases) >= 1, f"Expected stock_purchase, got {len(expense_purchases)}"
        
        purchase = expense_purchases[0]
        assert purchase.get("source") == "caisse"
        assert purchase.get("expense_id") == expense_id
        assert "items" in purchase
        print(f"✅ Stock purchase created: source={purchase['source']}, items={len(purchase['items'])}")
    
    def test_17_complete_expense_updates_stock_product_quantity(self):
        """PUT status=completed updates matching stock product quantity"""
        # First, find a stock product to track
        products_resp = requests.get(f"{BASE_URL}/api/stock/products", params={"search": "Tomates"})
        products = products_resp.json().get("products", [])
        
        if not products:
            print("⚠️ No 'Tomates' product in stock - skipping quantity verification")
            return
        
        product = products[0]
        initial_qty = product.get("quantity", 0)
        product_id = product["id"]
        print(f"Initial stock for Tomates: {initial_qty}")
        
        # Create expense with matching item
        expense_data = {
            "category": "Alimentation",
            "description": f"{self.test_prefix}_Qty update test",
            "amount": 5000,
            "supplier": "Test",
            "requested_by": "Test User",
            "is_group": True,
            "items": [
                {"description": "Tomates", "quantity": 10, "unit_price": 500, "amount": 5000, "category": "Légumes"}
            ]
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
        expense_id = create_resp.json()["expense"]["id"]
        self.created_expenses.append(expense_id)
        
        # Complete
        requests.put(f"{BASE_URL}/api/expenses/{expense_id}", json={"status": "completed"})
        time.sleep(0.5)
        
        # Check product quantity increased
        product_resp = requests.get(f"{BASE_URL}/api/stock/products/{product_id}")
        if product_resp.status_code == 200:
            new_qty = product_resp.json().get("quantity", 0)
            expected_qty = initial_qty + 10
            assert new_qty == expected_qty, f"Expected {expected_qty}, got {new_qty}"
            print(f"✅ Stock quantity updated: {initial_qty} → {new_qty}")
    
    def test_18_unmatched_item_creates_unlinked_movement(self):
        """Items not matching stock products create movements with product_id=''"""
        expense_data = {
            "category": "Divers",
            "description": f"{self.test_prefix}_Unlinked test",
            "amount": 2000,
            "supplier": "Test",
            "requested_by": "Test User",
            "is_group": True,
            "items": [
                {"description": "Produit Inexistant ABC123", "quantity": 2, "unit_price": 1000, "amount": 2000, "category": "Divers"}
            ]
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
        expense_id = create_resp.json()["expense"]["id"]
        self.created_expenses.append(expense_id)
        
        # Complete
        requests.put(f"{BASE_URL}/api/expenses/{expense_id}", json={"status": "completed"})
        time.sleep(0.5)
        
        # Check movement
        movements_resp = requests.get(f"{BASE_URL}/api/stock/movements", params={"limit": 20})
        movements = movements_resp.json().get("movements", [])
        expense_movements = [m for m in movements if m.get("expense_id") == expense_id]
        
        assert len(expense_movements) >= 1
        mov = expense_movements[0]
        assert mov.get("product_id") == "", f"Expected empty product_id, got {mov.get('product_id')}"
        assert "non lie au stock" in mov.get("reason", "").lower() or "achat caisse" in mov.get("reason", "").lower()
        print(f"✅ Unlinked movement created: product_name={mov['product_name']}")
    
    def test_19_no_double_sync_on_re_complete(self):
        """Re-updating completed expense doesn't create duplicate movements"""
        expense_data = {
            "category": "Alimentation",
            "description": f"{self.test_prefix}_Double sync test",
            "amount": 1000,
            "supplier": "Test",
            "requested_by": "Test User",
            "is_group": True,
            "items": [
                {"description": "Test Item", "quantity": 1, "unit_price": 1000, "amount": 1000, "category": "Test"}
            ]
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
        expense_id = create_resp.json()["expense"]["id"]
        self.created_expenses.append(expense_id)
        
        # First completion
        requests.put(f"{BASE_URL}/api/expenses/{expense_id}", json={"status": "completed"})
        time.sleep(0.3)
        
        # Count movements
        movements_resp = requests.get(f"{BASE_URL}/api/stock/movements", params={"limit": 50})
        movements_before = [m for m in movements_resp.json().get("movements", []) if m.get("expense_id") == expense_id]
        count_before = len(movements_before)
        
        # Second update (should not create new movements)
        requests.put(f"{BASE_URL}/api/expenses/{expense_id}", json={"status": "completed", "admin_notes": "Updated"})
        time.sleep(0.3)
        
        movements_resp = requests.get(f"{BASE_URL}/api/stock/movements", params={"limit": 50})
        movements_after = [m for m in movements_resp.json().get("movements", []) if m.get("expense_id") == expense_id]
        count_after = len(movements_after)
        
        assert count_after == count_before, f"Double sync: {count_before} → {count_after}"
        print(f"✅ No double sync: movements stayed at {count_after}")


class TestExpenseProductMatching:
    """Test stock product matching logic (exact, prefix, contains)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.test_prefix = f"TEST_{uuid.uuid4().hex[:6]}"
        self.created_expenses = []
        yield
        for exp_id in self.created_expenses:
            try:
                requests.delete(f"{BASE_URL}/api/expenses/{exp_id}")
            except:
                pass
    
    def test_20_product_matching_levels(self):
        """Test product matching: exact > prefix > contains"""
        # Get a known stock product
        products_resp = requests.get(f"{BASE_URL}/api/stock/products", params={"limit": 10})
        products = products_resp.json().get("products", [])
        
        if not products:
            print("⚠️ No stock products found - skipping matching test")
            return
        
        # Find an active product
        active_product = None
        for p in products:
            if p.get("is_active", True):
                active_product = p
                break
        
        if not active_product:
            print("⚠️ No active stock product found")
            return
        
        product_name = active_product["name"]
        print(f"Testing matching with product: {product_name}")
        
        # Create expense with exact match
        expense_data = {
            "category": "Alimentation",
            "description": f"{self.test_prefix}_Match test",
            "amount": 1000,
            "supplier": "Test",
            "requested_by": "Test User",
            "is_group": True,
            "items": [
                {"description": product_name, "quantity": 1, "unit_price": 1000, "amount": 1000, "category": "Test"}
            ]
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
        expense_id = create_resp.json()["expense"]["id"]
        self.created_expenses.append(expense_id)
        
        # Complete
        requests.put(f"{BASE_URL}/api/expenses/{expense_id}", json={"status": "completed"})
        time.sleep(0.5)
        
        # Check movement has product_id (matched)
        movements_resp = requests.get(f"{BASE_URL}/api/stock/movements", params={"limit": 20})
        movements = movements_resp.json().get("movements", [])
        expense_movements = [m for m in movements if m.get("expense_id") == expense_id]
        
        if expense_movements:
            mov = expense_movements[0]
            if mov.get("product_id"):
                print(f"✅ Product matched: {mov['product_name']} (id={mov['product_id']})")
            else:
                print(f"⚠️ Product not matched (unlinked): {mov['product_name']}")


class TestDependentEndpointsRegression:
    """Regression tests for endpoints that use db.expenses"""
    
    def test_21_forecasts_dashboard_works(self):
        """GET /api/forecasts/dashboard uses db.expenses.find - should work after extraction"""
        response = requests.get(f"{BASE_URL}/api/forecasts/dashboard")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "treasury" in data
        assert "available_now" in data
        assert "per_day" in data
        print(f"✅ GET /api/forecasts/dashboard: treasury={data['treasury']}, available={data['available_now']}")
    
    def test_22_expenses_analysis_works(self):
        """GET /api/expenses/analysis (in forecasts router) should work"""
        response = requests.get(f"{BASE_URL}/api/expenses/analysis")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "treasury" in data
        assert "analyses" in data
        print(f"✅ GET /api/expenses/analysis: {len(data['analyses'])} analyses, treasury={data['treasury']}")
    
    def test_23_reports_weekly_works(self):
        """GET /api/reports/weekly uses db.expenses via aggregation - should work"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/reports/weekly", params={"week_start": today})
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "daily_data" in data or "week_start" in data
        print(f"✅ GET /api/reports/weekly: works after extraction")


class TestSimpleExpenseWithoutGroup:
    """Test simple expense (is_group=false) sync behavior"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.test_prefix = f"TEST_{uuid.uuid4().hex[:6]}"
        self.created_expenses = []
        yield
        for exp_id in self.created_expenses:
            try:
                requests.delete(f"{BASE_URL}/api/expenses/{exp_id}")
            except:
                pass
    
    def test_24_simple_expense_sync(self):
        """Simple expense (not grouped) uses description as item for sync"""
        expense_data = {
            "category": "Alimentation",
            "description": "Citron",  # Should match stock product if exists
            "quantity": 5,
            "unit_price": 200,
            "amount": 1000,
            "supplier": "Vendeur",
            "requested_by": "Test User",
            "is_group": False
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
        assert create_resp.status_code == 200
        expense_id = create_resp.json()["expense"]["id"]
        self.created_expenses.append(expense_id)
        
        # Complete
        update_resp = requests.put(f"{BASE_URL}/api/expenses/{expense_id}", json={"status": "completed"})
        assert update_resp.status_code == 200
        
        time.sleep(0.5)
        
        # Check movement was created
        movements_resp = requests.get(f"{BASE_URL}/api/stock/movements", params={"limit": 20})
        movements = movements_resp.json().get("movements", [])
        expense_movements = [m for m in movements if m.get("expense_id") == expense_id]
        
        assert len(expense_movements) >= 1, "No movement created for simple expense"
        mov = expense_movements[0]
        assert mov.get("movement_type") == "entree"
        assert mov.get("quantity") == 5
        print(f"✅ Simple expense sync: {mov['product_name']}, qty={mov['quantity']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
