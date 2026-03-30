"""
Caisse Pro - Full Backend API Tests
Tests all main functionalities: login, tables, invoices, subscriptions
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://caisse-mon-point.preview.emergentagent.com').rstrip('/')

class TestCaisseLogin:
    """Test caisse login endpoints"""
    
    def test_login_gerante_pin_0000(self):
        """Test login with Gérante PIN 0000"""
        response = requests.post(f"{BASE_URL}/api/caisse/login", json={"pin": "0000"})
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert "user" in data
        assert data["user"]["role"] == "manager"
        print(f"✅ Gérante login: {data['user']['full_name']}")
    
    def test_login_serveur_pin_1234(self):
        """Test login with Serveur PIN 1234"""
        response = requests.post(f"{BASE_URL}/api/caisse/login", json={"pin": "1234"})
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert "user" in data
        assert data["user"]["role"] == "server"
        print(f"✅ Serveur login: {data['user']['full_name']}")
    
    def test_login_admin_password(self):
        """Test login with Admin password"""
        response = requests.post(f"{BASE_URL}/api/caisse/login", json={"password": "Caisse2026"})
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["user"]["role"] == "admin"
        print("✅ Admin login successful")
    
    def test_login_invalid_pin(self):
        """Test login with invalid PIN"""
        response = requests.post(f"{BASE_URL}/api/caisse/login", json={"pin": "9999"})
        assert response.status_code == 401
        print("✅ Invalid PIN correctly rejected")


class TestCaisseTables:
    """Test caisse tables endpoints"""
    
    def test_get_tables_status(self):
        """Test getting tables status"""
        response = requests.get(f"{BASE_URL}/api/caisse/tables/status")
        assert response.status_code == 200
        data = response.json()
        assert "tables" in data
        assert "stats" in data
        print(f"✅ Tables status: {data['stats']['total_tables']} total, {data['stats']['occupied']} occupied")
    
    def test_get_available_tables(self):
        """Test getting available tables for a server"""
        response = requests.get(f"{BASE_URL}/api/caisse/tables/available", params={"server_id": "test_server"})
        assert response.status_code == 200
        data = response.json()
        assert "available_tables" in data
        print(f"✅ Available tables: {len(data['available_tables'])} tables")
    
    def test_create_and_delete_table(self):
        """Test creating and deleting a table"""
        # Create table
        create_response = requests.post(f"{BASE_URL}/api/caisse/tables", json={
            "table_number": 99,
            "server_id": "test_server",
            "server_name": "Test Server",
            "items": [],
            "client_name": "Test Client",
            "payment_method": "cash",
            "discount": 0,
            "notes": "Test table"
        })
        assert create_response.status_code == 200
        data = create_response.json()
        assert data["success"] == True
        table_id = data["table"]["id"]
        print(f"✅ Table created: {table_id}")
        
        # Delete table
        delete_response = requests.delete(f"{BASE_URL}/api/caisse/tables/{table_id}")
        assert delete_response.status_code == 200
        print("✅ Table deleted")


class TestCaisseInvoices:
    """Test caisse invoices endpoints"""
    
    def test_get_invoices(self):
        """Test getting invoices for today"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/invoices", params={"date": today})
        assert response.status_code == 200
        data = response.json()
        assert "invoices" in data
        print(f"✅ Invoices for {today}: {len(data['invoices'])} found")
    
    def test_get_invoice_stats(self):
        """Test getting invoice statistics"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/invoices/stats", params={"date": today})
        assert response.status_code == 200
        data = response.json()
        assert "total_revenue" in data or "total" in data
        print(f"✅ Invoice stats retrieved")
    
    def test_create_invoice(self):
        """Test creating an invoice"""
        response = requests.post(f"{BASE_URL}/api/invoices", json={
            "customer_name": "TEST_Client",
            "customer_phone": "",
            "items": [
                {"id": "test_item", "name": "Test Item", "price": 1000, "quantity": 1, "department": "bar", "unit": "unité"}
            ],
            "subtotal": 1000,
            "discount": 0,
            "discount_amount": 0,
            "total": 1000,
            "payment_method": "cash",
            "totals_by_department": {"bar": 1000},
            "notes": "Test invoice",
            "created_by": "Test User",
            "validation_status": "pending"
        })
        assert response.status_code == 200
        data = response.json()
        assert "invoice" in data
        invoice_id = data["invoice"]["id"]
        print(f"✅ Invoice created: {invoice_id}")
        
        # Clean up - delete the test invoice
        delete_response = requests.delete(f"{BASE_URL}/api/invoices/{invoice_id}")
        assert delete_response.status_code == 200
        print("✅ Test invoice deleted")


class TestCaisseProducts:
    """Test caisse products endpoints"""
    
    def test_get_products(self):
        """Test getting all products"""
        response = requests.get(f"{BASE_URL}/api/caisse/products")
        assert response.status_code == 200
        data = response.json()
        assert "products" in data
        print(f"✅ Products: {len(data['products'])} found")
        
        # Check for different departments
        departments = set(p.get("department") for p in data["products"])
        print(f"   Departments: {departments}")


class TestSubscriptions:
    """Test subscriptions endpoints"""
    
    def test_get_subscriptions(self):
        """Test getting all subscriptions"""
        response = requests.get(f"{BASE_URL}/api/subscriptions")
        assert response.status_code == 200
        data = response.json()
        assert "subscriptions" in data
        assert "alerts" in data
        assert "stats" in data
        print(f"✅ Subscriptions: {data['stats']['total']} total, {data['stats']['overdue_count']} overdue")
    
    def test_get_alerts_summary(self):
        """Test getting alerts summary"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/alerts/summary")
        assert response.status_code == 200
        data = response.json()
        assert "overdue" in data
        assert "upcoming" in data
        assert "total_alerts" in data
        print(f"✅ Alerts: {data['overdue']} overdue, {data['upcoming']} upcoming")
    
    def test_create_and_delete_subscription(self):
        """Test creating and deleting a subscription"""
        # Create subscription
        create_response = requests.post(f"{BASE_URL}/api/subscriptions", json={
            "name": "TEST_Subscription",
            "type": "supplier",
            "category": "autre",
            "contact_name": "Test Contact",
            "contact_phone": "12345678",
            "amount": 5000,
            "frequency": "monthly",
            "start_date": "2026-03-30",
            "next_due_date": "2026-04-30",
            "payment_method": "especes",
            "notes": "Test subscription",
            "is_active": True
        })
        assert create_response.status_code == 200
        data = create_response.json()
        assert data["success"] == True
        subscription_id = data["subscription"]["id"]
        print(f"✅ Subscription created: {subscription_id}")
        
        # Delete subscription
        delete_response = requests.delete(f"{BASE_URL}/api/subscriptions/{subscription_id}")
        assert delete_response.status_code == 200
        print("✅ Test subscription deleted")


class TestCaisseUsers:
    """Test caisse users endpoints"""
    
    def test_get_users(self):
        """Test getting all caisse users"""
        response = requests.get(f"{BASE_URL}/api/caisse/users")
        assert response.status_code == 200
        data = response.json()
        assert "users" in data
        print(f"✅ Users: {len(data['users'])} found")
        
        # Check for different roles
        roles = set(u.get("role") for u in data["users"])
        print(f"   Roles: {roles}")


class TestCaisseClients:
    """Test caisse clients endpoints"""
    
    def test_get_clients(self):
        """Test getting all clients"""
        response = requests.get(f"{BASE_URL}/api/caisse/clients")
        assert response.status_code == 200
        data = response.json()
        assert "clients" in data
        print(f"✅ Clients: {len(data['clients'])} found")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
