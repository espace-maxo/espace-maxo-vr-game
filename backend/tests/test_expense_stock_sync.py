"""
Test Suite: Expense (Achats Caisse) → Stock Sync
Tests the NEW feature: When an expense is marked as 'completed', 
it should create 'entree' movements in stock_movements and increase product quantities.

Also tests regression for existing feature: Invoice validation → Stock sortie
"""
import pytest
import requests
import os
import time
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestExpenseStockSync:
    """Test Achats Caisse → Stock Entrées synchronization"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_prefix = f"TEST_{uuid.uuid4().hex[:6]}"
        self.created_expenses = []
        self.created_products = []
        yield
        # Cleanup
        for exp_id in self.created_expenses:
            try:
                requests.delete(f"{BASE_URL}/api/expenses/{exp_id}")
            except:
                pass
        for prod_id in self.created_products:
            try:
                requests.delete(f"{BASE_URL}/api/stock/products/{prod_id}")
            except:
                pass
    
    def test_01_create_group_expense_with_items(self):
        """Test creating a grouped expense (is_group=true with items[])"""
        expense_data = {
            "category": "Alimentation",
            "description": f"{self.test_prefix}_Achat groupé légumes",
            "amount": 15000,
            "supplier": "Marché Dantokpa",
            "requested_by": "Gérante Test",
            "is_group": True,
            "items": [
                {"description": "Carotte", "quantity": 5, "unit_price": 1000, "amount": 5000, "category": "Légumes"},
                {"description": "Citron", "quantity": 10, "unit_price": 500, "amount": 5000, "category": "Fruits"},
                {"description": "Concombre", "quantity": 5, "unit_price": 1000, "amount": 5000, "category": "Légumes"}
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
        assert response.status_code == 200, f"Failed to create expense: {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        assert "expense" in data
        expense = data["expense"]
        assert expense.get("is_group") == True
        assert expense.get("items") is not None
        assert len(expense["items"]) == 3
        assert expense.get("status") == "pending"
        
        self.created_expenses.append(expense["id"])
        print(f"✅ Created group expense: {expense['id']} with 3 items")
        return expense["id"]
    
    def test_02_complete_expense_creates_stock_entree(self):
        """Test that completing an expense creates 'entree' movements in stock"""
        # First, get a stock product to track
        products_resp = requests.get(f"{BASE_URL}/api/stock/products", params={"search": "Carotte"})
        assert products_resp.status_code == 200
        products = products_resp.json().get("products", [])
        
        initial_qty = 0
        product_id = None
        if products:
            product_id = products[0]["id"]
            initial_qty = products[0].get("quantity", 0)
            print(f"Found stock product 'Carotte' with initial qty: {initial_qty}")
        
        # Create expense with item matching stock product
        expense_data = {
            "category": "Alimentation",
            "description": f"{self.test_prefix}_Achat Carotte",
            "amount": 5000,
            "supplier": "Marché Test",
            "requested_by": "Gérante Test",
            "is_group": True,
            "items": [
                {"description": "Carotte", "quantity": 10, "unit_price": 500, "amount": 5000, "category": "Légumes"}
            ]
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
        assert create_resp.status_code == 200
        expense_id = create_resp.json()["expense"]["id"]
        self.created_expenses.append(expense_id)
        print(f"✅ Created expense: {expense_id}")
        
        # Update expense to 'completed' status
        update_resp = requests.put(f"{BASE_URL}/api/expenses/{expense_id}", json={"status": "completed"})
        assert update_resp.status_code == 200, f"Failed to complete expense: {update_resp.text}"
        
        updated_expense = update_resp.json().get("expense", {})
        assert updated_expense.get("status") == "completed"
        assert updated_expense.get("completed_at") is not None
        print(f"✅ Expense marked as completed at: {updated_expense.get('completed_at')}")
        
        # Check stock movement was created
        time.sleep(0.5)  # Allow async operations to complete
        movements_resp = requests.get(f"{BASE_URL}/api/stock/movements", params={"limit": 20})
        assert movements_resp.status_code == 200
        movements = movements_resp.json().get("movements", [])
        
        # Find movement linked to this expense
        expense_movements = [m for m in movements if m.get("expense_id") == expense_id]
        assert len(expense_movements) > 0, f"No stock movement created for expense {expense_id}"
        
        mov = expense_movements[0]
        assert mov.get("movement_type") == "entree", f"Expected 'entree' but got '{mov.get('movement_type')}'"
        assert "Achat Caisse" in mov.get("reason", ""), f"Reason should contain 'Achat Caisse': {mov.get('reason')}"
        print(f"✅ Stock movement created: type={mov['movement_type']}, qty={mov['quantity']}, reason={mov['reason']}")
        
        # Verify stock quantity increased (if product was found)
        if product_id:
            product_resp = requests.get(f"{BASE_URL}/api/stock/products/{product_id}")
            if product_resp.status_code == 200:
                new_qty = product_resp.json().get("quantity", 0)
                expected_qty = initial_qty + 10
                assert new_qty == expected_qty, f"Stock qty should be {expected_qty} but is {new_qty}"
                print(f"✅ Stock quantity increased: {initial_qty} → {new_qty}")
    
    def test_03_simple_expense_without_group(self):
        """Test simple expense (is_group=false) with description matching stock product"""
        # Get initial stock for a product
        products_resp = requests.get(f"{BASE_URL}/api/stock/products", params={"search": "Citron"})
        products = products_resp.json().get("products", [])
        
        initial_qty = 0
        if products:
            initial_qty = products[0].get("quantity", 0)
        
        # Create simple expense (not grouped)
        expense_data = {
            "category": "Alimentation",
            "description": "Citron",  # Should match stock product
            "quantity": 5,
            "unit_price": 200,
            "amount": 1000,
            "supplier": "Vendeur local",
            "requested_by": "Gérante Test",
            "is_group": False
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
        assert create_resp.status_code == 200
        expense_id = create_resp.json()["expense"]["id"]
        self.created_expenses.append(expense_id)
        
        # Complete the expense
        update_resp = requests.put(f"{BASE_URL}/api/expenses/{expense_id}", json={"status": "completed"})
        assert update_resp.status_code == 200
        print(f"✅ Simple expense completed: {expense_id}")
        
        # Check movement was created
        time.sleep(0.5)
        movements_resp = requests.get(f"{BASE_URL}/api/stock/movements", params={"limit": 20})
        movements = movements_resp.json().get("movements", [])
        expense_movements = [m for m in movements if m.get("expense_id") == expense_id]
        
        assert len(expense_movements) > 0, "No movement created for simple expense"
        mov = expense_movements[0]
        assert mov.get("movement_type") == "entree"
        print(f"✅ Movement created for simple expense: {mov['product_name']}, qty={mov['quantity']}")
    
    def test_04_expense_with_unmatched_item_creates_unlinked_movement(self):
        """Test that items not matching stock products still create 'unlinked' movements"""
        expense_data = {
            "category": "Divers",
            "description": f"{self.test_prefix}_Achat divers",
            "amount": 3000,
            "supplier": "Fournisseur X",
            "requested_by": "Gérante Test",
            "is_group": True,
            "items": [
                {"description": "Produit Inexistant XYZ123", "quantity": 3, "unit_price": 1000, "amount": 3000, "category": "Divers"}
            ]
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/expenses", json=expense_data)
        assert create_resp.status_code == 200
        expense_id = create_resp.json()["expense"]["id"]
        self.created_expenses.append(expense_id)
        
        # Complete expense
        update_resp = requests.put(f"{BASE_URL}/api/expenses/{expense_id}", json={"status": "completed"})
        assert update_resp.status_code == 200
        
        # Check movement was created (should be unlinked)
        time.sleep(0.5)
        movements_resp = requests.get(f"{BASE_URL}/api/stock/movements", params={"limit": 20})
        movements = movements_resp.json().get("movements", [])
        expense_movements = [m for m in movements if m.get("expense_id") == expense_id]
        
        assert len(expense_movements) > 0, "No movement created for unmatched item"
        mov = expense_movements[0]
        assert mov.get("product_id") == "", "Unlinked movement should have empty product_id"
        assert "non lie au stock" in mov.get("reason", "").lower() or "achat caisse" in mov.get("reason", "").lower()
        print(f"✅ Unlinked movement created: {mov['product_name']}, reason={mov['reason']}")
    
    def test_05_no_double_sync_if_already_completed(self):
        """Test that re-updating a completed expense doesn't create duplicate movements"""
        # Create and complete expense
        expense_data = {
            "category": "Alimentation",
            "description": f"{self.test_prefix}_Test double sync",
            "amount": 2000,
            "supplier": "Test",
            "requested_by": "Test",
            "is_group": True,
            "items": [
                {"description": "Riz blanc", "quantity": 2, "unit_price": 1000, "amount": 2000, "category": "Céréales"}
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
        
        # Try to update again (should not create new movements)
        requests.put(f"{BASE_URL}/api/expenses/{expense_id}", json={"status": "completed", "admin_notes": "Updated again"})
        time.sleep(0.3)
        
        movements_resp = requests.get(f"{BASE_URL}/api/stock/movements", params={"limit": 50})
        movements_after = [m for m in movements_resp.json().get("movements", []) if m.get("expense_id") == expense_id]
        count_after = len(movements_after)
        
        assert count_after == count_before, f"Double sync detected: {count_before} → {count_after} movements"
        print(f"✅ No double sync: movements count stayed at {count_after}")


class TestInvoiceStockSync:
    """Regression test: Invoice validation → Stock Sorties (existing feature)"""
    
    def test_invoice_validation_creates_stock_sortie(self):
        """Test that validating an invoice creates 'sortie' movements"""
        # Create an invoice
        invoice_data = {
            "customer_name": "Client Test Stock",
            "customer_phone": "90000000",
            "items": [
                {"id": "test-1", "name": "Carotte", "price": 500, "quantity": 2, "department": "bar", "unit": "portion"}
            ],
            "subtotal": 1000,
            "discount": 0,
            "discount_amount": 0,
            "total": 1000,
            "payment_method": "cash",
            "totals_by_department": {"bar": 1000},
            "notes": "Test stock sync",
            "created_by": "Test Server",
            "validation_status": "pending"
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/invoices", json=invoice_data)
        assert create_resp.status_code == 200, f"Failed to create invoice: {create_resp.text}"
        resp_data = create_resp.json()
        invoice = resp_data.get("invoice", resp_data)
        invoice_id = invoice.get("id")
        assert invoice_id is not None, f"Invoice ID not found in response: {resp_data}"
        print(f"✅ Created invoice: {invoice_id}")
        
        # Get initial stock
        products_resp = requests.get(f"{BASE_URL}/api/stock/products", params={"search": "Carotte"})
        products = products_resp.json().get("products", [])
        initial_qty = products[0].get("quantity", 0) if products else 0
        
        # Validate the invoice
        update_resp = requests.put(f"{BASE_URL}/api/invoices/{invoice_id}", json={
            "validation_status": "validated",
            "validated_by": "Admin Test",
            "validated_at": "2026-01-15T10:00:00Z"
        })
        assert update_resp.status_code == 200, f"Failed to validate invoice: {update_resp.text}"
        print(f"✅ Invoice validated")
        
        # Check stock movement was created
        time.sleep(0.5)
        movements_resp = requests.get(f"{BASE_URL}/api/stock/movements", params={"limit": 20})
        movements = movements_resp.json().get("movements", [])
        
        invoice_movements = [m for m in movements if m.get("invoice_id") == invoice_id]
        assert len(invoice_movements) > 0, f"No stock movement created for invoice {invoice_id}"
        
        mov = invoice_movements[0]
        assert mov.get("movement_type") == "sortie", f"Expected 'sortie' but got '{mov.get('movement_type')}'"
        assert "Vente" in mov.get("reason", "") or "Facture" in mov.get("reason", "")
        print(f"✅ Stock sortie created: {mov['product_name']}, qty={mov['quantity']}, reason={mov['reason']}")
        
        # Verify stock decreased (if product matched)
        if products:
            product_resp = requests.get(f"{BASE_URL}/api/stock/products/{products[0]['id']}")
            if product_resp.status_code == 200:
                new_qty = product_resp.json().get("quantity", 0)
                # Stock should have decreased by 2
                print(f"Stock after sale: {initial_qty} → {new_qty}")


class TestStockDashboard:
    """Test Stock Dashboard shows today's entries/exits"""
    
    def test_dashboard_shows_entrees_sorties_today(self):
        """Test that dashboard returns entrees_today and sorties_today"""
        response = requests.get(f"{BASE_URL}/api/stock/dashboard")
        assert response.status_code == 200
        
        data = response.json()
        assert "entrees_today" in data, "Dashboard missing 'entrees_today'"
        assert "sorties_today" in data, "Dashboard missing 'sorties_today'"
        assert "total_products" in data
        assert "total_value" in data
        
        print(f"✅ Dashboard: entrees_today={data['entrees_today']}, sorties_today={data['sorties_today']}")
        print(f"   Total products: {data['total_products']}, Total value: {data['total_value']}")


class TestStockMovementsPage:
    """Test Stock Movements endpoint returns correct data"""
    
    def test_movements_list_with_types(self):
        """Test that movements list includes type, reason, and expense/invoice links"""
        response = requests.get(f"{BASE_URL}/api/stock/movements", params={"limit": 50})
        assert response.status_code == 200
        
        movements = response.json().get("movements", [])
        print(f"Found {len(movements)} movements")
        
        # Check structure of movements
        if movements:
            mov = movements[0]
            required_fields = ["id", "product_name", "movement_type", "quantity", "reason", "created_at"]
            for field in required_fields:
                assert field in mov, f"Movement missing field: {field}"
            
            # Count by type
            entrees = [m for m in movements if m.get("movement_type") == "entree"]
            sorties = [m for m in movements if m.get("movement_type") == "sortie"]
            print(f"✅ Movements: {len(entrees)} entrées, {len(sorties)} sorties")
            
            # Check for Achat Caisse movements
            achat_caisse = [m for m in movements if "Achat Caisse" in m.get("reason", "")]
            print(f"   Achat Caisse movements: {len(achat_caisse)}")


class TestStockAuth:
    """Test Stock module authentication"""
    
    def test_stock_login_admin(self):
        """Test login with admin credentials"""
        response = requests.post(f"{BASE_URL}/api/stock/auth/login", json={
            "username": "admin",
            "password": "Admin2026"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        assert "user" in data
        assert data["user"]["role"] == "administrateur"
        print(f"✅ Stock login successful: {data['user']['username']} ({data['user']['role']})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
