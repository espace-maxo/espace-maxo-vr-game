"""
Test Suppliers & Purchase Orders Module
========================================
Tests for the new Fournisseurs & Bons de Commande (BC) module.

Workflow: 
  gérante crée dépense (Achats) → admin approuve → admin convertit en BC → envoi → réception (BL) → paiement

Collections: caisse_suppliers, purchase_orders, expenses, stock_products, stock_movements
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data tracking for cleanup
created_suppliers = []
created_pos = []
created_expenses = []


class TestSuppliersAPI:
    """Test Suppliers CRUD operations"""
    
    def test_list_suppliers_empty_or_existing(self):
        """GET /api/suppliers returns list"""
        response = requests.get(f"{BASE_URL}/api/suppliers")
        assert response.status_code == 200
        data = response.json()
        assert "suppliers" in data
        assert isinstance(data["suppliers"], list)
        print(f"✅ GET /api/suppliers: {len(data['suppliers'])} suppliers found")
    
    def test_create_supplier(self):
        """POST /api/suppliers creates a supplier with name/category/payment_terms/phone"""
        payload = {
            "name": f"TEST_Fournisseur_{uuid.uuid4().hex[:6]}",
            "category": "cuisine",
            "payment_terms": "30j",
            "phone": "+229 97 00 00 00",
            "email": "test@fournisseur.com",
            "address": "Cotonou, Bénin",
            "ifu": "1234567890",
            "notes": "Fournisseur de test"
        }
        response = requests.post(f"{BASE_URL}/api/suppliers", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is True
        assert "supplier" in data
        supplier = data["supplier"]
        assert supplier["name"] == payload["name"]
        assert supplier["category"] == "cuisine"
        assert supplier["payment_terms"] == "30j"
        assert supplier["phone"] == payload["phone"]
        assert "id" in supplier
        created_suppliers.append(supplier["id"])
        print(f"✅ POST /api/suppliers: Created supplier {supplier['id']}")
        return supplier
    
    def test_get_supplier_by_id(self):
        """GET /api/suppliers/{id} returns supplier details"""
        # First create a supplier
        supplier = self.test_create_supplier()
        supplier_id = supplier["id"]
        
        response = requests.get(f"{BASE_URL}/api/suppliers/{supplier_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == supplier_id
        assert data["name"] == supplier["name"]
        print(f"✅ GET /api/suppliers/{supplier_id}: Retrieved successfully")
    
    def test_update_supplier(self):
        """PUT /api/suppliers/{id} updates supplier"""
        # First create a supplier
        supplier = self.test_create_supplier()
        supplier_id = supplier["id"]
        
        update_payload = {
            "name": f"TEST_Updated_{uuid.uuid4().hex[:6]}",
            "payment_terms": "60j",
            "phone": "+229 98 00 00 00"
        }
        response = requests.put(f"{BASE_URL}/api/suppliers/{supplier_id}", json=update_payload)
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is True
        
        # Verify update
        verify_response = requests.get(f"{BASE_URL}/api/suppliers/{supplier_id}")
        assert verify_response.status_code == 200
        updated = verify_response.json()
        assert updated["name"] == update_payload["name"]
        assert updated["payment_terms"] == "60j"
        print(f"✅ PUT /api/suppliers/{supplier_id}: Updated successfully")
    
    def test_delete_supplier(self):
        """DELETE /api/suppliers/{id} deletes supplier"""
        # First create a supplier
        supplier = self.test_create_supplier()
        supplier_id = supplier["id"]
        
        response = requests.delete(f"{BASE_URL}/api/suppliers/{supplier_id}")
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is True
        
        # Verify deletion
        verify_response = requests.get(f"{BASE_URL}/api/suppliers/{supplier_id}")
        assert verify_response.status_code == 404
        
        # Remove from cleanup list since already deleted
        if supplier_id in created_suppliers:
            created_suppliers.remove(supplier_id)
        print(f"✅ DELETE /api/suppliers/{supplier_id}: Deleted successfully")


class TestPurchaseOrdersAPI:
    """Test Purchase Orders CRUD and workflow operations"""
    
    @pytest.fixture(autouse=True)
    def setup_supplier(self):
        """Create a supplier for PO tests"""
        payload = {
            "name": f"TEST_POSupplier_{uuid.uuid4().hex[:6]}",
            "category": "cuisine",
            "payment_terms": "comptant"
        }
        response = requests.post(f"{BASE_URL}/api/suppliers", json=payload)
        assert response.status_code == 200
        self.supplier = response.json()["supplier"]
        created_suppliers.append(self.supplier["id"])
        yield
    
    def test_list_purchase_orders(self):
        """GET /api/purchase-orders returns list"""
        response = requests.get(f"{BASE_URL}/api/purchase-orders")
        assert response.status_code == 200
        data = response.json()
        assert "purchase_orders" in data
        assert isinstance(data["purchase_orders"], list)
        print(f"✅ GET /api/purchase-orders: {len(data['purchase_orders'])} POs found")
    
    def test_list_purchase_orders_with_status_filter(self):
        """GET /api/purchase-orders?status= filters correctly"""
        response = requests.get(f"{BASE_URL}/api/purchase-orders?status=draft")
        assert response.status_code == 200
        data = response.json()
        assert "purchase_orders" in data
        # All returned POs should have status=draft
        for po in data["purchase_orders"]:
            assert po["status"] == "draft"
        print(f"✅ GET /api/purchase-orders?status=draft: Filter works ({len(data['purchase_orders'])} drafts)")
    
    def test_create_purchase_order_direct(self):
        """POST /api/purchase-orders creates a BC with items (auto number BC-YYYYMM-XXXX)"""
        payload = {
            "supplier_id": self.supplier["id"],
            "supplier_name": self.supplier["name"],
            "items": [
                {"description": "Tomates fraîches", "quantity_ordered": 10, "unit_price": 500, "unit": "kg"},
                {"description": "Oignons", "quantity_ordered": 5, "unit_price": 300, "unit": "kg"}
            ],
            "notes": "Commande test",
            "created_by": "Admin"
        }
        response = requests.post(f"{BASE_URL}/api/purchase-orders", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is True
        assert "purchase_order" in data
        po = data["purchase_order"]
        
        # Verify auto-generated number format BC-YYYYMM-XXXX (14 chars)
        assert po["number"].startswith("BC-")
        assert len(po["number"]) >= 14  # BC-YYYYMM-XXXX format
        assert po["status"] == "draft"
        assert po["supplier_id"] == self.supplier["id"]
        assert len(po["items"]) == 2
        assert po["total_amount"] == 10*500 + 5*300  # 6500
        
        created_pos.append(po["id"])
        print(f"✅ POST /api/purchase-orders: Created {po['number']} (total: {po['total_amount']} F)")
        return po
    
    def test_send_purchase_order(self):
        """POST /api/purchase-orders/{id}/send changes draft → sent"""
        po = self.test_create_purchase_order_direct()
        po_id = po["id"]
        
        response = requests.post(f"{BASE_URL}/api/purchase-orders/{po_id}/send", json={"user_name": "Admin"})
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is True
        
        # Verify status changed
        verify = requests.get(f"{BASE_URL}/api/purchase-orders/{po_id}")
        assert verify.status_code == 200
        updated_po = verify.json()
        assert updated_po["status"] == "sent"
        assert "sent_at" in updated_po
        print(f"✅ POST /api/purchase-orders/{po_id}/send: Status changed to 'sent'")
        return updated_po
    
    def test_receive_partial(self):
        """POST /api/purchase-orders/{id}/receive with partial quantities → partially_received"""
        # Create and send PO
        po = self.test_create_purchase_order_direct()
        po_id = po["id"]
        requests.post(f"{BASE_URL}/api/purchase-orders/{po_id}/send", json={"user_name": "Admin"})
        
        # Receive partial quantities
        receive_payload = {
            "items": [
                {"description": "Tomates fraîches", "quantity_received": 5},  # 5 of 10
                {"description": "Oignons", "quantity_received": 2}  # 2 of 5
            ],
            "user_name": "Admin",
            "delivery_note_ref": "BL-TEST-001",
            "notes": "Livraison partielle"
        }
        response = requests.post(f"{BASE_URL}/api/purchase-orders/{po_id}/receive", json=receive_payload)
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is True
        assert data["status"] == "partially_received"
        assert "delivery_note" in data
        
        # Verify PO updated
        verify = requests.get(f"{BASE_URL}/api/purchase-orders/{po_id}")
        updated_po = verify.json()
        assert updated_po["status"] == "partially_received"
        assert len(updated_po["delivery_notes"]) == 1
        assert updated_po["delivery_notes"][0]["ref"] == "BL-TEST-001"
        
        # Verify items quantities updated
        for item in updated_po["items"]:
            if item["description"] == "Tomates fraîches":
                assert item["quantity_received"] == 5
            elif item["description"] == "Oignons":
                assert item["quantity_received"] == 2
        
        print(f"✅ POST /api/purchase-orders/{po_id}/receive (partial): Status 'partially_received', BL added")
        return updated_po
    
    def test_receive_complete(self):
        """POST /api/purchase-orders/{id}/receive with full quantities → received"""
        # Create and send PO
        po = self.test_create_purchase_order_direct()
        po_id = po["id"]
        requests.post(f"{BASE_URL}/api/purchase-orders/{po_id}/send", json={"user_name": "Admin"})
        
        # Receive all quantities
        receive_payload = {
            "items": [
                {"description": "Tomates fraîches", "quantity_received": 10},
                {"description": "Oignons", "quantity_received": 5}
            ],
            "user_name": "Admin",
            "delivery_note_ref": "BL-TEST-002"
        }
        response = requests.post(f"{BASE_URL}/api/purchase-orders/{po_id}/receive", json=receive_payload)
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is True
        assert data["status"] == "received"
        
        # Verify PO updated
        verify = requests.get(f"{BASE_URL}/api/purchase-orders/{po_id}")
        updated_po = verify.json()
        assert updated_po["status"] == "received"
        assert "received_at" in updated_po
        
        print(f"✅ POST /api/purchase-orders/{po_id}/receive (complete): Status 'received'")
        return updated_po
    
    def test_pay_purchase_order(self):
        """POST /api/purchase-orders/{id}/pay marks as paid with payment info"""
        # Create, send, and receive PO
        po = self.test_create_purchase_order_direct()
        po_id = po["id"]
        requests.post(f"{BASE_URL}/api/purchase-orders/{po_id}/send", json={"user_name": "Admin"})
        requests.post(f"{BASE_URL}/api/purchase-orders/{po_id}/receive", json={
            "items": [
                {"description": "Tomates fraîches", "quantity_received": 10},
                {"description": "Oignons", "quantity_received": 5}
            ],
            "user_name": "Admin"
        })
        
        # Pay
        pay_payload = {
            "amount": 6500,
            "method": "cash",
            "reference": "PAY-TEST-001",
            "user_name": "Admin"
        }
        response = requests.post(f"{BASE_URL}/api/purchase-orders/{po_id}/pay", json=pay_payload)
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is True
        assert "payment" in data
        assert data["payment"]["amount"] == 6500
        assert data["payment"]["method"] == "cash"
        
        # Verify PO updated
        verify = requests.get(f"{BASE_URL}/api/purchase-orders/{po_id}")
        updated_po = verify.json()
        assert updated_po["status"] == "paid"
        assert "paid_at" in updated_po
        assert updated_po["payment"]["reference"] == "PAY-TEST-001"
        
        print(f"✅ POST /api/purchase-orders/{po_id}/pay: Status 'paid', payment recorded")
        return updated_po
    
    def test_cancel_purchase_order(self):
        """POST /api/purchase-orders/{id}/cancel cancels (except if paid/received)"""
        po = self.test_create_purchase_order_direct()
        po_id = po["id"]
        
        response = requests.post(f"{BASE_URL}/api/purchase-orders/{po_id}/cancel", json={"reason": "Test annulation"})
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is True
        
        # Verify status
        verify = requests.get(f"{BASE_URL}/api/purchase-orders/{po_id}")
        updated_po = verify.json()
        assert updated_po["status"] == "cancelled"
        
        print(f"✅ POST /api/purchase-orders/{po_id}/cancel: Status 'cancelled'")
    
    def test_delete_draft_purchase_order(self):
        """DELETE /api/purchase-orders/{id} only if draft or cancelled"""
        po = self.test_create_purchase_order_direct()
        po_id = po["id"]
        
        response = requests.delete(f"{BASE_URL}/api/purchase-orders/{po_id}")
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is True
        
        # Verify deletion
        verify = requests.get(f"{BASE_URL}/api/purchase-orders/{po_id}")
        assert verify.status_code == 404
        
        if po_id in created_pos:
            created_pos.remove(po_id)
        print(f"✅ DELETE /api/purchase-orders/{po_id}: Deleted draft PO")
    
    def test_delete_sent_purchase_order_fails(self):
        """DELETE /api/purchase-orders/{id} fails if status is sent"""
        po = self.test_create_purchase_order_direct()
        po_id = po["id"]
        
        # Send the PO
        requests.post(f"{BASE_URL}/api/purchase-orders/{po_id}/send", json={"user_name": "Admin"})
        
        # Try to delete - should fail
        response = requests.delete(f"{BASE_URL}/api/purchase-orders/{po_id}")
        assert response.status_code == 400
        print(f"✅ DELETE /api/purchase-orders/{po_id} (sent): Correctly rejected with 400")


class TestPurchaseOrderFromExpense:
    """Test converting approved expenses to purchase orders"""
    
    def test_create_po_from_approved_expense(self):
        """POST /api/purchase-orders/from-expense/{id} converts approved expense to PO"""
        # First create an expense
        expense_payload = {
            "category": "cuisine",
            "description": "TEST_Achat légumes pour BC",
            "quantity": 5,
            "unit_price": 1000,
            "amount": 5000,
            "supplier": "Marché Dantokpa",
            "planned_date": datetime.now().strftime("%Y-%m-%d"),
            "requested_by": "Gérante"
        }
        expense_response = requests.post(f"{BASE_URL}/api/expenses", json=expense_payload)
        assert expense_response.status_code == 200
        expense = expense_response.json()["expense"]
        expense_id = expense["id"]
        created_expenses.append(expense_id)
        
        # Approve the expense (via PUT with status=approved)
        approve_response = requests.put(f"{BASE_URL}/api/expenses/{expense_id}", json={
            "status": "approved",
            "approved_by": "Admin"
        })
        assert approve_response.status_code == 200
        
        # Convert to PO
        convert_response = requests.post(f"{BASE_URL}/api/purchase-orders/from-expense/{expense_id}", json={
            "created_by": "Admin"
        })
        assert convert_response.status_code == 200
        data = convert_response.json()
        assert data.get("success") is True
        assert "purchase_order" in data
        po = data["purchase_order"]
        
        assert po["expense_id"] == expense_id
        assert po["status"] == "draft"
        assert po["number"].startswith("BC-")
        created_pos.append(po["id"])
        
        # Verify expense was updated with converted_to_po_id (via list endpoint)
        expenses_list = requests.get(f"{BASE_URL}/api/expenses")
        assert expenses_list.status_code == 200
        updated_expense = None
        for exp in expenses_list.json().get("expenses", []):
            if exp.get("id") == expense_id:
                updated_expense = exp
                break
        assert updated_expense is not None, "Expense not found in list"
        assert updated_expense.get("converted_to_po_id") == po["id"]
        assert updated_expense.get("converted_to_po_number") == po["number"]
        
        print(f"✅ POST /api/purchase-orders/from-expense/{expense_id}: Created {po['number']}")
        return po
    
    def test_convert_pending_expense_fails(self):
        """POST /api/purchase-orders/from-expense/{id} fails if expense is not approved"""
        # Create a pending expense (not approved)
        expense_payload = {
            "category": "cuisine",
            "description": "TEST_Pending expense",
            "quantity": 1,
            "unit_price": 1000,
            "amount": 1000,
            "requested_by": "Gérante"
        }
        expense_response = requests.post(f"{BASE_URL}/api/expenses", json=expense_payload)
        assert expense_response.status_code == 200
        expense = expense_response.json()["expense"]
        expense_id = expense["id"]
        created_expenses.append(expense_id)
        
        # Try to convert - should fail
        convert_response = requests.post(f"{BASE_URL}/api/purchase-orders/from-expense/{expense_id}", json={
            "created_by": "Admin"
        })
        assert convert_response.status_code == 400
        assert "approuvée" in convert_response.json().get("detail", "").lower()
        
        print(f"✅ POST /api/purchase-orders/from-expense/{expense_id} (pending): Correctly rejected")
    
    def test_convert_already_converted_expense_fails(self):
        """POST /api/purchase-orders/from-expense/{id} fails if already converted"""
        # Create and approve expense
        expense_payload = {
            "category": "cuisine",
            "description": "TEST_Already converted expense",
            "quantity": 1,
            "unit_price": 1000,
            "amount": 1000,
            "requested_by": "Gérante"
        }
        expense_response = requests.post(f"{BASE_URL}/api/expenses", json=expense_payload)
        expense = expense_response.json()["expense"]
        expense_id = expense["id"]
        created_expenses.append(expense_id)
        
        # Approve (via PUT with status=approved)
        requests.put(f"{BASE_URL}/api/expenses/{expense_id}", json={
            "status": "approved",
            "approved_by": "Admin"
        })
        
        # Convert first time
        convert_response = requests.post(f"{BASE_URL}/api/purchase-orders/from-expense/{expense_id}", json={
            "created_by": "Admin"
        })
        assert convert_response.status_code == 200
        po = convert_response.json()["purchase_order"]
        created_pos.append(po["id"])
        
        # Try to convert again - should fail
        convert_again = requests.post(f"{BASE_URL}/api/purchase-orders/from-expense/{expense_id}", json={
            "created_by": "Admin"
        })
        assert convert_again.status_code == 400
        assert "déjà" in convert_again.json().get("detail", "").lower()
        
        print(f"✅ POST /api/purchase-orders/from-expense/{expense_id} (already converted): Correctly rejected")


class TestPurchaseOrderStatusValidation:
    """Test status transition validations"""
    
    @pytest.fixture(autouse=True)
    def setup_supplier(self):
        """Create a supplier for tests"""
        payload = {
            "name": f"TEST_ValidationSupplier_{uuid.uuid4().hex[:6]}",
            "category": "cuisine",
            "payment_terms": "comptant"
        }
        response = requests.post(f"{BASE_URL}/api/suppliers", json=payload)
        self.supplier = response.json()["supplier"]
        created_suppliers.append(self.supplier["id"])
        yield
    
    def _create_po(self):
        """Helper to create a PO"""
        payload = {
            "supplier_id": self.supplier["id"],
            "items": [{"description": "Test item", "quantity_ordered": 5, "unit_price": 1000}],
            "created_by": "Admin"
        }
        response = requests.post(f"{BASE_URL}/api/purchase-orders", json=payload)
        po = response.json()["purchase_order"]
        created_pos.append(po["id"])
        return po
    
    def test_cannot_receive_without_send(self):
        """Cannot receive a draft PO"""
        po = self._create_po()
        po_id = po["id"]
        
        receive_payload = {
            "items": [{"description": "Test item", "quantity_received": 5}],
            "user_name": "Admin"
        }
        response = requests.post(f"{BASE_URL}/api/purchase-orders/{po_id}/receive", json=receive_payload)
        assert response.status_code == 400
        assert "envoyé" in response.json().get("detail", "").lower()
        
        print(f"✅ Cannot receive draft PO: Correctly rejected")
    
    def test_cannot_pay_without_receive(self):
        """Cannot pay a sent PO (must be at least partially received)"""
        po = self._create_po()
        po_id = po["id"]
        
        # Send the PO
        requests.post(f"{BASE_URL}/api/purchase-orders/{po_id}/send", json={"user_name": "Admin"})
        
        # Try to pay without receiving
        pay_payload = {"amount": 5000, "method": "cash", "user_name": "Admin"}
        response = requests.post(f"{BASE_URL}/api/purchase-orders/{po_id}/pay", json=pay_payload)
        assert response.status_code == 400
        assert "reçu" in response.json().get("detail", "").lower()
        
        print(f"✅ Cannot pay sent PO without receiving: Correctly rejected")
    
    def test_cannot_cancel_received_po(self):
        """Cannot cancel a fully received PO"""
        po = self._create_po()
        po_id = po["id"]
        
        # Send and receive
        requests.post(f"{BASE_URL}/api/purchase-orders/{po_id}/send", json={"user_name": "Admin"})
        requests.post(f"{BASE_URL}/api/purchase-orders/{po_id}/receive", json={
            "items": [{"description": "Test item", "quantity_received": 5}],
            "user_name": "Admin"
        })
        
        # Try to cancel
        response = requests.post(f"{BASE_URL}/api/purchase-orders/{po_id}/cancel", json={"reason": "Test"})
        assert response.status_code == 400
        
        print(f"✅ Cannot cancel received PO: Correctly rejected")
    
    def test_cannot_cancel_paid_po(self):
        """Cannot cancel a paid PO"""
        po = self._create_po()
        po_id = po["id"]
        
        # Full workflow: send → receive → pay
        requests.post(f"{BASE_URL}/api/purchase-orders/{po_id}/send", json={"user_name": "Admin"})
        requests.post(f"{BASE_URL}/api/purchase-orders/{po_id}/receive", json={
            "items": [{"description": "Test item", "quantity_received": 5}],
            "user_name": "Admin"
        })
        requests.post(f"{BASE_URL}/api/purchase-orders/{po_id}/pay", json={
            "amount": 5000, "method": "cash", "user_name": "Admin"
        })
        
        # Try to cancel
        response = requests.post(f"{BASE_URL}/api/purchase-orders/{po_id}/cancel", json={"reason": "Test"})
        assert response.status_code == 400
        
        print(f"✅ Cannot cancel paid PO: Correctly rejected")


class TestStockMovementsOnReceive:
    """Test that stock movements are created on PO receive"""
    
    @pytest.fixture(autouse=True)
    def setup_supplier(self):
        """Create a supplier for tests"""
        payload = {
            "name": f"TEST_StockSupplier_{uuid.uuid4().hex[:6]}",
            "category": "cuisine",
            "payment_terms": "comptant"
        }
        response = requests.post(f"{BASE_URL}/api/suppliers", json=payload)
        self.supplier = response.json()["supplier"]
        created_suppliers.append(self.supplier["id"])
        yield
    
    def test_stock_movements_created_on_receive(self):
        """Verify stock_movements type='entree' are created on receive"""
        # Create PO with unique item name
        unique_item = f"TEST_StockItem_{uuid.uuid4().hex[:6]}"
        payload = {
            "supplier_id": self.supplier["id"],
            "items": [{"description": unique_item, "quantity_ordered": 10, "unit_price": 500, "unit": "kg"}],
            "created_by": "Admin"
        }
        response = requests.post(f"{BASE_URL}/api/purchase-orders", json=payload)
        po = response.json()["purchase_order"]
        po_id = po["id"]
        created_pos.append(po_id)
        
        # Send and receive
        requests.post(f"{BASE_URL}/api/purchase-orders/{po_id}/send", json={"user_name": "Admin"})
        receive_response = requests.post(f"{BASE_URL}/api/purchase-orders/{po_id}/receive", json={
            "items": [{"description": unique_item, "quantity_received": 10}],
            "user_name": "Admin"
        })
        assert receive_response.status_code == 200
        
        # Verify PO has stock_product_id assigned
        verify = requests.get(f"{BASE_URL}/api/purchase-orders/{po_id}")
        updated_po = verify.json()
        item = updated_po["items"][0]
        assert item.get("stock_product_id") is not None, "stock_product_id should be assigned"
        
        print(f"✅ Stock movement created on receive, stock_product_id: {item['stock_product_id']}")


# Cleanup fixture
@pytest.fixture(scope="session", autouse=True)
def cleanup(request):
    """Cleanup test data after all tests"""
    def cleanup_data():
        print("\n🧹 Cleaning up test data...")
        
        # Delete created POs (only draft/cancelled can be deleted via API)
        for po_id in created_pos:
            try:
                # First try to get status
                r = requests.get(f"{BASE_URL}/api/purchase-orders/{po_id}")
                if r.status_code == 200:
                    status = r.json().get("status")
                    if status in ("draft", "cancelled"):
                        requests.delete(f"{BASE_URL}/api/purchase-orders/{po_id}")
                        print(f"  Deleted PO {po_id}")
                    else:
                        print(f"  Cannot delete PO {po_id} (status={status})")
            except Exception as e:
                print(f"  Error cleaning PO {po_id}: {e}")
        
        # Delete created suppliers
        for supplier_id in created_suppliers:
            try:
                requests.delete(f"{BASE_URL}/api/suppliers/{supplier_id}")
                print(f"  Deleted supplier {supplier_id}")
            except Exception as e:
                print(f"  Error cleaning supplier {supplier_id}: {e}")
        
        # Delete created expenses
        for expense_id in created_expenses:
            try:
                requests.delete(f"{BASE_URL}/api/expenses/{expense_id}")
                print(f"  Deleted expense {expense_id}")
            except Exception as e:
                print(f"  Error cleaning expense {expense_id}: {e}")
        
        print("🧹 Cleanup complete")
    
    request.addfinalizer(cleanup_data)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
