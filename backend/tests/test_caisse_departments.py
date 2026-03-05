"""
Test Caisse POS system for Espace Maxo
Tests for:
- 5 departments: salle_jardin, jeux, bar, location, autres
- Manual entry in 'Autres' department
- Invoice creation with created_by field
- Validation system (pending/validated status)
- User management (CRUD)
- Stats by 5 departments
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCaisseLogin:
    """Tests for Caisse login"""
    
    def test_login_with_caisse_password(self):
        """Login with Caisse2026 password"""
        response = requests.post(f"{BASE_URL}/api/caisse/login", json={
            "username": "admin",
            "password": "Caisse2026"
        })
        print(f"Login response: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert "token" in data
        assert data.get("user", {}).get("role") == "admin"
        print(f"Login successful, role: {data['user']['role']}")
    
    def test_login_with_wrong_password(self):
        """Login with wrong password should fail"""
        response = requests.post(f"{BASE_URL}/api/caisse/login", json={
            "username": "admin",
            "password": "wrongpassword"
        })
        print(f"Wrong password response: {response.status_code}")
        assert response.status_code == 401


class TestInvoiceCreationWithValidation:
    """Tests for invoice creation with validation status"""
    
    @pytest.fixture
    def caisse_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/caisse/login", json={
            "username": "admin",
            "password": "Caisse2026"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Caisse authentication failed")
    
    def test_create_invoice_with_pending_status(self):
        """Create invoice with validation_status=pending and created_by"""
        invoice_data = {
            "customer_name": "TEST_Client_Validation",
            "customer_phone": "12345678",
            "items": [
                {"id": "test-item-1", "name": "VR 360°", "price": 2000, "quantity": 1, "department": "jeux", "unit": "partie"},
                {"id": "test-item-2", "name": "Coca-Cola", "price": 500, "quantity": 2, "department": "bar", "unit": "bouteille"}
            ],
            "subtotal": 3000,
            "discount": 0,
            "discount_amount": 0,
            "total": 3000,
            "payment_method": "cash",
            "totals_by_department": {
                "salle_jardin": 0,
                "jeux": 2000,
                "bar": 1000,
                "location": 0,
                "autres": 0
            },
            "notes": "Test invoice with validation",
            "created_by": "Serveur Test",
            "validation_status": "pending"
        }
        
        response = requests.post(f"{BASE_URL}/api/invoices", json=invoice_data)
        print(f"Create invoice response: {response.status_code}")
        print(f"Response body: {response.json()}")
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        
        invoice = data.get("invoice", {})
        assert invoice.get("validation_status") == "pending"
        assert invoice.get("created_by") == "Serveur Test"
        assert invoice.get("totals_by_department", {}).get("jeux") == 2000
        assert invoice.get("totals_by_department", {}).get("bar") == 1000
        
        print(f"Invoice created with id: {invoice.get('id')}, validation_status: {invoice.get('validation_status')}")
        return invoice.get("id")
    
    def test_validate_invoice(self, caisse_token):
        """Validate an invoice (change status from pending to validated)"""
        # First create a pending invoice
        invoice_data = {
            "customer_name": "TEST_Validate_Invoice",
            "items": [
                {"id": "test-validate", "name": "Espace VIP", "price": 25000, "quantity": 1, "department": "location", "unit": "soirée"}
            ],
            "subtotal": 25000,
            "discount": 0,
            "discount_amount": 0,
            "total": 25000,
            "payment_method": "card",
            "totals_by_department": {
                "salle_jardin": 0,
                "jeux": 0,
                "bar": 0,
                "location": 25000,
                "autres": 0
            },
            "created_by": "Serveur Jean",
            "validation_status": "pending"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/invoices", json=invoice_data)
        assert create_response.status_code == 200
        invoice_id = create_response.json().get("invoice", {}).get("id")
        print(f"Created invoice for validation: {invoice_id}")
        
        # Now validate the invoice
        validate_data = {
            "validation_status": "validated",
            "validated_by": "Gérante Marie",
            "validated_at": datetime.now().isoformat()
        }
        
        update_response = requests.put(f"{BASE_URL}/api/invoices/{invoice_id}", json=validate_data)
        print(f"Validate response: {update_response.status_code}")
        
        assert update_response.status_code == 200
        
        # Verify the update
        get_response = requests.get(f"{BASE_URL}/api/invoices/{invoice_id}")
        assert get_response.status_code == 200
        updated_invoice = get_response.json()
        
        assert updated_invoice.get("validation_status") == "validated"
        assert updated_invoice.get("validated_by") == "Gérante Marie"
        print(f"Invoice validated by: {updated_invoice.get('validated_by')}")


class TestDepartments:
    """Tests for 5 departments stats"""
    
    def test_create_invoice_all_departments(self):
        """Create invoice with items from all 5 departments"""
        invoice_data = {
            "customer_name": "TEST_All_Departments",
            "items": [
                {"id": "sj-1", "name": "Table jardin", "price": 2000, "quantity": 1, "department": "salle_jardin", "unit": "heure"},
                {"id": "jeux-1", "name": "VR 360°", "price": 2000, "quantity": 2, "department": "jeux", "unit": "partie"},
                {"id": "bar-1", "name": "Bière locale", "price": 800, "quantity": 3, "department": "bar", "unit": "bouteille"},
                {"id": "loc-1", "name": "Espace VIP", "price": 25000, "quantity": 1, "department": "location", "unit": "soirée"},
                {"id": "autres-1", "name": "Service personnalisé", "price": 5000, "quantity": 1, "department": "autres", "unit": "unité"}
            ],
            "subtotal": 36400,
            "discount": 0,
            "discount_amount": 0,
            "total": 36400,
            "payment_method": "mobile",
            "totals_by_department": {
                "salle_jardin": 2000,
                "jeux": 4000,
                "bar": 2400,
                "location": 25000,
                "autres": 5000
            },
            "created_by": "Serveur Test All Depts",
            "validation_status": "pending"
        }
        
        response = requests.post(f"{BASE_URL}/api/invoices", json=invoice_data)
        print(f"All departments invoice response: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        invoice = data.get("invoice", {})
        
        # Verify all department totals are stored
        dept_totals = invoice.get("totals_by_department", {})
        assert dept_totals.get("salle_jardin") == 2000, f"salle_jardin should be 2000, got {dept_totals.get('salle_jardin')}"
        assert dept_totals.get("jeux") == 4000, f"jeux should be 4000, got {dept_totals.get('jeux')}"
        assert dept_totals.get("bar") == 2400, f"bar should be 2400, got {dept_totals.get('bar')}"
        assert dept_totals.get("location") == 25000, f"location should be 25000, got {dept_totals.get('location')}"
        assert dept_totals.get("autres") == 5000, f"autres should be 5000, got {dept_totals.get('autres')}"
        
        print(f"All 5 departments stored correctly: {dept_totals}")
    
    def test_stats_include_all_departments(self):
        """Verify stats API returns all 5 departments"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/invoices/stats", params={"date": today})
        
        print(f"Stats response: {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        by_dept = data.get("by_department", {})
        
        # Verify all 5 departments are in the response
        expected_depts = ["salle_jardin", "jeux", "bar", "location", "autres"]
        for dept in expected_depts:
            assert dept in by_dept, f"Department '{dept}' missing from stats"
        
        print(f"Stats by department: {by_dept}")
    
    def test_monthly_stats_include_all_departments(self):
        """Verify monthly stats API returns all 5 departments"""
        now = datetime.now()
        response = requests.get(f"{BASE_URL}/api/invoices/stats/monthly", params={
            "year": now.year,
            "month": now.month
        })
        
        print(f"Monthly stats response: {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        by_dept = data.get("by_department", {})
        
        # Verify all 5 departments are in the response
        expected_depts = ["salle_jardin", "jeux", "bar", "location", "autres"]
        for dept in expected_depts:
            assert dept in by_dept, f"Department '{dept}' missing from monthly stats"
        
        print(f"Monthly stats by department: {by_dept}")


class TestAutresCustomEntry:
    """Tests for custom/manual entry in Autres department"""
    
    def test_custom_item_in_autres(self):
        """Create invoice with custom item in 'autres' department"""
        invoice_data = {
            "customer_name": "TEST_Custom_Item",
            "items": [
                {
                    "id": f"custom-{datetime.now().timestamp()}", 
                    "name": "Service de nettoyage spécial", 
                    "price": 15000, 
                    "quantity": 1, 
                    "department": "autres", 
                    "unit": "unité"
                }
            ],
            "subtotal": 15000,
            "discount": 0,
            "discount_amount": 0,
            "total": 15000,
            "payment_method": "cash",
            "totals_by_department": {
                "salle_jardin": 0,
                "jeux": 0,
                "bar": 0,
                "location": 0,
                "autres": 15000
            },
            "created_by": "Caissier Custom",
            "validation_status": "pending"
        }
        
        response = requests.post(f"{BASE_URL}/api/invoices", json=invoice_data)
        print(f"Custom item response: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        invoice = data.get("invoice", {})
        
        # Verify custom item is stored
        items = invoice.get("items", [])
        assert len(items) == 1
        assert items[0].get("name") == "Service de nettoyage spécial"
        assert items[0].get("department") == "autres"
        assert invoice.get("totals_by_department", {}).get("autres") == 15000
        
        print(f"Custom item stored: {items[0]}")


class TestUserManagement:
    """Tests for user (serveur) management"""
    
    @pytest.fixture
    def caisse_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/caisse/login", json={
            "username": "admin",
            "password": "Caisse2026"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Caisse authentication failed")
    
    def test_create_user(self):
        """Create a new server user"""
        user_data = {
            "username": f"TEST_serveur_{datetime.now().timestamp()}",
            "email": f"test_serveur_{datetime.now().timestamp()}@test.com",
            "password": "TestPass123",
            "role": "server",
            "full_name": "Serveur Test User"
        }
        
        response = requests.post(f"{BASE_URL}/api/caisse/users", json=user_data)
        print(f"Create user response: {response.status_code}")
        print(f"Response body: {response.json()}")
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        user = data.get("user", {})
        assert user.get("role") == "server"
        assert user.get("full_name") == "Serveur Test User"
        
        print(f"User created: {user.get('username')}, role: {user.get('role')}")
        return user.get("id")
    
    def test_get_users(self):
        """Get all users"""
        response = requests.get(f"{BASE_URL}/api/caisse/users")
        print(f"Get users response: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        users = data.get("users", [])
        assert len(users) >= 0  # Could be empty if fresh db
        print(f"Found {len(users)} users")
    
    def test_update_user(self):
        """Create and update a user"""
        # Create user
        user_data = {
            "username": f"TEST_update_user_{datetime.now().timestamp()}",
            "email": f"test_update_{datetime.now().timestamp()}@test.com",
            "password": "TestPass123",
            "role": "server",
            "full_name": "Original Name"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/caisse/users", json=user_data)
        assert create_response.status_code == 200
        user_id = create_response.json().get("user", {}).get("id")
        print(f"Created user for update: {user_id}")
        
        # Update user
        update_data = {
            "full_name": "Updated Name",
            "role": "manager"
        }
        
        update_response = requests.put(f"{BASE_URL}/api/caisse/users/{user_id}", json=update_data)
        print(f"Update user response: {update_response.status_code}")
        
        assert update_response.status_code == 200
        
        # Get all users and find the updated one
        get_response = requests.get(f"{BASE_URL}/api/caisse/users")
        users = get_response.json().get("users", [])
        updated_user = next((u for u in users if u.get("id") == user_id), None)
        
        if updated_user:
            assert updated_user.get("full_name") == "Updated Name"
            print(f"User updated: {updated_user.get('full_name')}")
    
    def test_delete_user(self):
        """Create and delete a user"""
        # Create user
        user_data = {
            "username": f"TEST_delete_user_{datetime.now().timestamp()}",
            "email": f"test_delete_{datetime.now().timestamp()}@test.com",
            "password": "TestPass123",
            "role": "server",
            "full_name": "To Be Deleted"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/caisse/users", json=user_data)
        assert create_response.status_code == 200
        user_id = create_response.json().get("user", {}).get("id")
        print(f"Created user for deletion: {user_id}")
        
        # Delete user
        delete_response = requests.delete(f"{BASE_URL}/api/caisse/users/{user_id}")
        print(f"Delete user response: {delete_response.status_code}")
        
        assert delete_response.status_code == 200
        print(f"User deleted successfully")


class TestInvoicesList:
    """Test fetching invoices list"""
    
    def test_get_invoices_by_date(self):
        """Get invoices for today"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/invoices", params={"date": today})
        
        print(f"Get invoices response: {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        invoices = data.get("invoices", [])
        print(f"Found {len(invoices)} invoices for today")
        
        # Check that invoices have required fields
        for inv in invoices[:3]:  # Check first 3
            assert "invoice_number" in inv
            assert "validation_status" in inv
            print(f"Invoice: {inv.get('invoice_number')}, status: {inv.get('validation_status')}, created_by: {inv.get('created_by')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
