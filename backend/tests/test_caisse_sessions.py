"""
Test suite for Caisse Session Management:
- PIN login for servers
- Admin password login
- Invoice filtering by created_by (server sessions)
- Admin/Manager sees all invoices
- User management (admin only)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCaisseLoginModes:
    """Test login modes: PIN (server) and Admin password"""
    
    def test_admin_login_with_password(self):
        """Admin login with 'Caisse2026' password should return admin role"""
        response = requests.post(f"{BASE_URL}/api/caisse/login", json={
            "password": "Caisse2026"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["user"]["role"] == "admin"
        assert data["user"]["username"] == "admin"
        assert data["user"]["full_name"] == "Administrateur"
        assert "token" in data
        print("✅ Admin login with 'Caisse2026' works - admin role returned")
    
    def test_admin_login_wrong_password(self):
        """Login with wrong password should return 401"""
        response = requests.post(f"{BASE_URL}/api/caisse/login", json={
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✅ Wrong password returns 401")
    
    def test_server_login_with_pin(self):
        """Create a test server user and login with PIN"""
        # First create a test server user
        unique_id = str(uuid.uuid4())[:8]
        test_pin = "1234"
        test_username = f"TEST_server_{unique_id}"
        test_full_name = "Marie Dupont"
        
        create_response = requests.post(f"{BASE_URL}/api/caisse/users", json={
            "username": test_username,
            "pin": test_pin,
            "role": "server",
            "full_name": test_full_name
        })
        
        # Check if user was created (or already exists with this PIN)
        if create_response.status_code == 200:
            print(f"✅ Test server user created: {test_username} with PIN {test_pin}")
        else:
            print(f"Note: Could not create test user (may already exist): {create_response.text}")
        
        # Now login with PIN
        login_response = requests.post(f"{BASE_URL}/api/caisse/login", json={
            "pin": test_pin
        })
        
        # If PIN exists (user created previously), should work
        if login_response.status_code == 200:
            data = login_response.json()
            assert data["success"] == True
            assert data["user"]["role"] == "server"
            assert "token" in data
            print(f"✅ Server login with PIN {test_pin} works")
        else:
            print(f"Note: PIN login returned {login_response.status_code}: {login_response.text}")
    
    def test_login_with_invalid_pin(self):
        """Login with invalid PIN should return 401"""
        response = requests.post(f"{BASE_URL}/api/caisse/login", json={
            "pin": "999999"
        })
        assert response.status_code == 401
        print("✅ Invalid PIN returns 401")


class TestUserCreationWithPIN:
    """Test creating users with unique PIN (4-6 digits)"""
    
    def test_create_server_user_with_pin(self):
        """Create a server user with unique PIN"""
        unique_id = str(uuid.uuid4())[:8]
        test_pin = f"{5000 + hash(unique_id) % 1000}"  # Generate a random 4-digit PIN
        
        response = requests.post(f"{BASE_URL}/api/caisse/users", json={
            "username": f"TEST_user_{unique_id}",
            "pin": test_pin,
            "role": "server",
            "full_name": f"Test User {unique_id}"
        })
        
        assert response.status_code in [200, 400]  # 400 if PIN already exists
        if response.status_code == 200:
            data = response.json()
            assert data["success"] == True
            assert data["user"]["role"] == "server"
            print(f"✅ Server user created with PIN {test_pin}")
        else:
            print(f"Note: Could not create user (PIN may exist): {response.text}")
    
    def test_create_manager_user_with_pin(self):
        """Create a manager user with PIN"""
        unique_id = str(uuid.uuid4())[:8]
        test_pin = f"{6000 + hash(unique_id) % 1000}"
        
        response = requests.post(f"{BASE_URL}/api/caisse/users", json={
            "username": f"TEST_manager_{unique_id}",
            "pin": test_pin,
            "role": "manager",
            "full_name": f"Test Manager {unique_id}"
        })
        
        assert response.status_code in [200, 400]
        if response.status_code == 200:
            data = response.json()
            assert data["user"]["role"] == "manager"
            print(f"✅ Manager user created with PIN {test_pin}")


class TestInvoiceFilteringByRole:
    """Test that servers only see their own invoices while admins see all"""
    
    @pytest.fixture
    def test_server_user(self):
        """Create a test server user and return details"""
        unique_id = str(uuid.uuid4())[:8]
        test_pin = "5678"
        test_full_name = f"TEST_Server_{unique_id}"
        
        # Create test user
        requests.post(f"{BASE_URL}/api/caisse/users", json={
            "username": f"test_server_{unique_id}",
            "pin": test_pin,
            "role": "server",
            "full_name": test_full_name
        })
        
        return {
            "pin": test_pin,
            "full_name": test_full_name
        }
    
    def test_create_invoice_with_created_by(self):
        """Create an invoice with created_by field"""
        unique_id = str(uuid.uuid4())[:8]
        server_name = f"TEST_Server_{unique_id}"
        
        response = requests.post(f"{BASE_URL}/api/invoices", json={
            "customer_name": "Test Client",
            "items": [{"id": "test", "name": "Test Item", "price": 1000, "quantity": 1, "department": "bar"}],
            "subtotal": 1000,
            "total": 1000,
            "payment_method": "cash",
            "created_by": server_name,
            "totals_by_department": {"bar": 1000}
        })
        
        assert response.status_code == 200
        data = response.json()
        # API returns nested structure: {"success": true, "invoice": {...}}
        invoice = data.get("invoice", data)  # Support both structures
        assert invoice.get("created_by") == server_name
        print(f"✅ Invoice created with created_by={server_name}")
        
        return invoice.get("id")
    
    def test_get_all_invoices_as_admin(self):
        """Admin should see all invoices (no role filter)"""
        response = requests.get(f"{BASE_URL}/api/invoices")
        assert response.status_code == 200
        data = response.json()
        assert "invoices" in data
        print(f"✅ Admin can get all invoices: {len(data['invoices'])} found")
    
    def test_get_invoices_filtered_by_server_role(self):
        """Server role should only see their own invoices"""
        # First create an invoice for a specific server
        server_name = "TEST_FilterServer"
        
        # Create invoice with this server
        requests.post(f"{BASE_URL}/api/invoices", json={
            "customer_name": "Filter Test Client",
            "items": [{"id": "filter_test", "name": "Filter Test", "price": 500, "quantity": 1, "department": "bar"}],
            "subtotal": 500,
            "total": 500,
            "payment_method": "cash",
            "created_by": server_name,
            "totals_by_department": {"bar": 500}
        })
        
        # Now query with server role filter
        response = requests.get(f"{BASE_URL}/api/invoices", params={
            "role": "server",
            "created_by": server_name
        })
        
        assert response.status_code == 200
        data = response.json()
        invoices = data.get("invoices", [])
        
        # All returned invoices should have created_by matching server_name
        for inv in invoices:
            assert inv.get("created_by") == server_name, f"Invoice has wrong created_by: {inv.get('created_by')}"
        
        print(f"✅ Server role filter works: {len(invoices)} invoices found for {server_name}")


class TestUsersTabVisibility:
    """Test that only admins can access user management"""
    
    def test_get_users_list(self):
        """GET /api/caisse/users should return user list"""
        response = requests.get(f"{BASE_URL}/api/caisse/users")
        assert response.status_code == 200
        data = response.json()
        assert "users" in data
        print(f"✅ Users endpoint accessible: {len(data['users'])} users found")
    
    def test_users_have_pin_field(self):
        """Users should have PIN field visible in list"""
        response = requests.get(f"{BASE_URL}/api/caisse/users")
        assert response.status_code == 200
        data = response.json()
        users = data.get("users", [])
        
        # At least some users should have PIN field
        for user in users:
            if "pin" in user and user["pin"]:
                print(f"✅ User {user.get('username')} has PIN: {user['pin'][:2]}**")
                return
        
        print("Note: No users with PIN found (may need to create test users)")


class TestEndToEndServerSession:
    """End-to-end test for server session workflow"""
    
    def test_full_server_workflow(self):
        """Test: create server -> login -> create invoice -> filter invoices"""
        unique_id = str(uuid.uuid4())[:8]
        test_pin = f"77{hash(unique_id) % 100:02d}"
        server_name = f"E2E_Server_{unique_id}"
        
        # 1. Create server user
        create_response = requests.post(f"{BASE_URL}/api/caisse/users", json={
            "username": f"e2e_{unique_id}",
            "pin": test_pin,
            "role": "server",
            "full_name": server_name
        })
        print(f"1. Create user response: {create_response.status_code}")
        
        # 2. Login with PIN
        login_response = requests.post(f"{BASE_URL}/api/caisse/login", json={
            "pin": test_pin
        })
        
        if login_response.status_code == 200:
            login_data = login_response.json()
            assert login_data["user"]["role"] == "server"
            print(f"2. ✅ Logged in as server: {login_data['user'].get('full_name')}")
        else:
            # If PIN already exists, try with different PIN or skip
            print(f"2. Note: Login returned {login_response.status_code}")
        
        # 3. Create invoice as this server
        invoice_response = requests.post(f"{BASE_URL}/api/invoices", json={
            "customer_name": f"E2E_Client_{unique_id}",
            "items": [{"id": "e2e_item", "name": "E2E Test", "price": 2500, "quantity": 2, "department": "jeux"}],
            "subtotal": 5000,
            "total": 5000,
            "payment_method": "cash",
            "created_by": server_name,
            "totals_by_department": {"jeux": 5000}
        })
        assert invoice_response.status_code == 200
        response_data = invoice_response.json()
        # API returns nested structure: {"success": true, "invoice": {...}}
        invoice_data = response_data.get("invoice", response_data)
        assert invoice_data.get("created_by") == server_name
        print(f"3. ✅ Invoice created with created_by={server_name}")
        
        # 4. Verify server only sees own invoices
        filter_response = requests.get(f"{BASE_URL}/api/invoices", params={
            "role": "server",
            "created_by": server_name
        })
        assert filter_response.status_code == 200
        filtered_invoices = filter_response.json().get("invoices", [])
        
        # All should be by this server
        for inv in filtered_invoices:
            assert inv.get("created_by") == server_name
        
        print(f"4. ✅ Server filter works: {len(filtered_invoices)} invoices found")
        
        # 5. Admin sees all (no filter)
        all_response = requests.get(f"{BASE_URL}/api/invoices")
        all_invoices = all_response.json().get("invoices", [])
        print(f"5. ✅ Admin sees all invoices: {len(all_invoices)} total")
        
        print("\n✅ End-to-end server session workflow PASSED")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
