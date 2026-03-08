"""
Test suite for Caisse POS System - Espace Maxo
Tests: Login, Invoices CRUD, PDF Export, Products, Clients, Users
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://order-management-66.preview.emergentagent.com').rstrip('/')

class TestCaisseLogin:
    """Test Caisse login functionality"""
    
    def test_login_with_master_password_caisse2026(self):
        """Login with Caisse2026 password should work"""
        response = requests.post(f"{BASE_URL}/api/caisse/login", json={
            "username": "admin",
            "password": "Caisse2026"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["user"]["role"] == "admin"
        assert data["user"]["full_name"] == "Administrateur"
        assert "token" in data
        print("✅ Login with Caisse2026 works correctly")
    
    def test_login_with_master_password_espacemaxo(self):
        """Login with Esp@ceM@xo2026 password should also work"""
        response = requests.post(f"{BASE_URL}/api/caisse/login", json={
            "username": "admin",
            "password": "Esp@ceM@xo2026"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["user"]["role"] == "admin"
        print("✅ Login with Esp@ceM@xo2026 works correctly")
    
    def test_login_with_wrong_password_fails(self):
        """Login with wrong password should fail"""
        response = requests.post(f"{BASE_URL}/api/caisse/login", json={
            "username": "admin",
            "password": "WrongPassword"
        })
        assert response.status_code == 401
        print("✅ Login with wrong password correctly returns 401")


class TestInvoices:
    """Test Invoice CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for protected routes if needed"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_get_invoices(self):
        """GET /api/invoices should return list of invoices"""
        response = self.session.get(f"{BASE_URL}/api/invoices")
        assert response.status_code == 200
        data = response.json()
        assert "invoices" in data
        assert isinstance(data["invoices"], list)
        print(f"✅ GET /api/invoices returns {len(data['invoices'])} invoices")
    
    def test_create_invoice(self):
        """POST /api/invoices should create a new invoice"""
        invoice_data = {
            "customer_name": "TEST_Client",
            "items": [
                {"id": "vr360", "name": "VR 360°", "price": 2000, "quantity": 2, "department": "jeux", "unit": "partie"},
                {"id": "coca", "name": "Coca-Cola", "price": 500, "quantity": 3, "department": "bar", "unit": "bouteille"}
            ],
            "subtotal": 5500,
            "discount": 10,
            "discount_amount": 550,
            "total": 4950,
            "payment_method": "cash",
            "totals_by_department": {"jeux": 4000, "bar": 1500, "jardin": 0},
            "notes": "Test invoice",
            "created_by": "admin"
        }
        response = self.session.post(f"{BASE_URL}/api/invoices", json=invoice_data)
        assert response.status_code == 200
        data = response.json()
        
        # API returns {"invoice": {...}, "success": true}
        assert data.get("success") == True or "invoice" in data
        invoice = data.get("invoice", data)
        assert "id" in invoice
        assert "invoice_number" in invoice
        assert invoice["customer_name"] == "TEST_Client"
        assert invoice["total"] == 4950
        
        print(f"✅ Created invoice: {invoice['invoice_number']}")
        return invoice["id"]
    
    def test_get_invoice_by_id(self):
        """GET /api/invoices/{id} should return the invoice"""
        # First create an invoice
        invoice_id = self.test_create_invoice()
        
        response = self.session.get(f"{BASE_URL}/api/invoices/{invoice_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == invoice_id
        print(f"✅ GET /api/invoices/{invoice_id} returns correct invoice")
    
    def test_get_invoice_stats(self):
        """GET /api/invoices/stats should return daily stats"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = self.session.get(f"{BASE_URL}/api/invoices/stats", params={"date": today})
        assert response.status_code == 200
        data = response.json()
        assert "total_revenue" in data
        assert "invoice_count" in data
        assert "by_department" in data
        print(f"✅ GET /api/invoices/stats - Total revenue: {data['total_revenue']} FCFA")
    
    def test_get_monthly_stats(self):
        """GET /api/invoices/stats/monthly should return monthly stats"""
        year = datetime.now().year
        month = datetime.now().month
        response = self.session.get(f"{BASE_URL}/api/invoices/stats/monthly", params={"year": year, "month": month})
        assert response.status_code == 200
        data = response.json()
        assert "total_revenue" in data
        assert "invoice_count" in data
        assert "by_department" in data
        print(f"✅ GET /api/invoices/stats/monthly - {data['invoice_count']} invoices this month")


class TestInvoicePDF:
    """Test Invoice PDF Export functionality"""
    
    def test_pdf_export_existing_invoice(self):
        """GET /api/invoices/{id}/pdf should return valid PDF"""
        # First get an existing invoice
        response = requests.get(f"{BASE_URL}/api/invoices")
        invoices = response.json().get("invoices", [])
        
        if not invoices:
            # Create one first
            invoice_data = {
                "customer_name": "TEST_PDF_Client",
                "items": [{"id": "coca", "name": "Coca-Cola", "price": 500, "quantity": 1, "department": "bar", "unit": "bouteille"}],
                "subtotal": 500,
                "discount": 0,
                "discount_amount": 0,
                "total": 500,
                "payment_method": "cash",
                "totals_by_department": {"bar": 500}
            }
            create_response = requests.post(f"{BASE_URL}/api/invoices", json=invoice_data)
            resp_data = create_response.json()
            invoice_id = resp_data.get("invoice", resp_data).get("id")
        else:
            invoice_id = invoices[0]["id"]
        
        # Test PDF export
        response = requests.get(f"{BASE_URL}/api/invoices/{invoice_id}/pdf")
        assert response.status_code == 200
        assert response.headers.get("content-type") == "application/pdf"
        
        # Verify PDF header
        assert response.content[:5] == b'%PDF-'
        print(f"✅ PDF export works - Generated {len(response.content)} bytes")
    
    def test_pdf_export_nonexistent_invoice(self):
        """GET /api/invoices/{id}/pdf for non-existent invoice should return 404"""
        response = requests.get(f"{BASE_URL}/api/invoices/non-existent-id-12345/pdf")
        assert response.status_code == 404
        print("✅ PDF export returns 404 for non-existent invoice")


class TestCaisseProducts:
    """Test Caisse Products CRUD"""
    
    def test_get_products(self):
        """GET /api/caisse/products should return list"""
        response = requests.get(f"{BASE_URL}/api/caisse/products")
        assert response.status_code == 200
        data = response.json()
        assert "products" in data
        print(f"✅ GET /api/caisse/products returns {len(data['products'])} products")
    
    def test_create_product(self):
        """POST /api/caisse/products should create product"""
        product_data = {
            "name": "TEST_Jus de Mangue",
            "price": 800,
            "department": "bar",
            "unit": "verre",
            "category": "Jus"
        }
        response = requests.post(f"{BASE_URL}/api/caisse/products", json=product_data)
        assert response.status_code == 200
        data = response.json()
        # API returns {"product": {...}, "success": true}
        product = data.get("product", data)
        assert "id" in product
        print(f"✅ Created product: {product['name']}")
    
    def test_delete_product(self):
        """DELETE /api/caisse/products/{id} should delete product"""
        # First create a product to delete
        product_data = {
            "name": "TEST_Product_To_Delete",
            "price": 100,
            "department": "bar",
            "unit": "unité"
        }
        create_response = requests.post(f"{BASE_URL}/api/caisse/products", json=product_data)
        resp_data = create_response.json()
        product_id = resp_data.get("product", resp_data).get("id")
        
        # Delete it
        response = requests.delete(f"{BASE_URL}/api/caisse/products/{product_id}")
        assert response.status_code == 200
        print(f"✅ Deleted product: {product_id}")


class TestCaisseClients:
    """Test Caisse Clients CRUD"""
    
    def test_get_clients(self):
        """GET /api/caisse/clients should return list"""
        response = requests.get(f"{BASE_URL}/api/caisse/clients")
        assert response.status_code == 200
        data = response.json()
        assert "clients" in data
        print(f"✅ GET /api/caisse/clients returns {len(data['clients'])} clients")
    
    def test_create_client(self):
        """POST /api/caisse/clients should create client"""
        client_data = {
            "name": "TEST_Jean Dupont",
            "phone": "0191234567",
            "email": "test@example.com",
            "notes": "Client de test"
        }
        response = requests.post(f"{BASE_URL}/api/caisse/clients", json=client_data)
        assert response.status_code == 200
        data = response.json()
        # API returns {"client": {...}, "success": true}
        client = data.get("client", data)
        assert "id" in client
        print(f"✅ Created client: {client['name']}")


class TestCaisseUsers:
    """Test Caisse Users CRUD"""
    
    def test_get_users(self):
        """GET /api/caisse/users should return list"""
        response = requests.get(f"{BASE_URL}/api/caisse/users")
        assert response.status_code == 200
        data = response.json()
        assert "users" in data
        print(f"✅ GET /api/caisse/users returns {len(data['users'])} users")
    
    def test_create_user(self):
        """POST /api/caisse/users should create user"""
        import uuid
        unique_username = f"test_user_{uuid.uuid4().hex[:8]}"
        user_data = {
            "username": unique_username,
            "email": f"{unique_username}@test.com",
            "password": "Test1234",
            "role": "server",
            "full_name": "TEST User"
        }
        response = requests.post(f"{BASE_URL}/api/caisse/users", json=user_data)
        assert response.status_code == 200
        data = response.json()
        # API returns {"user": {...}, "success": true}
        user = data.get("user", data)
        assert "id" in user
        print(f"✅ Created user: {user['username']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
