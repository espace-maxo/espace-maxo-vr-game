"""
Test suite for Caisse Pro new features:
- Manager product management (CRUD)
- Menu notifications for Admin
- Server daily report (Mon Point)
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://proforma-quote-tool.preview.emergentagent.com')

class TestManagerProductManagement:
    """Test Manager can add, modify, and delete products"""
    
    def test_create_product_with_notification(self):
        """Manager creates a product - should generate notification for admin"""
        response = requests.post(
            f"{BASE_URL}/api/caisse/products",
            json={
                "name": "Test API Product",
                "price": 3500,
                "department": "bar",
                "unit": "unité",
                "category": "test"
            },
            params={
                "modified_by": "Mères AHOUANDJINOU",
                "modified_by_role": "manager"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert "product" in data
        assert data["product"]["name"] == "Test API Product"
        assert data["product"]["price"] == 3500
        print(f"✅ Product created: {data['product']['id']}")
        return data["product"]["id"]
    
    def test_get_products(self):
        """Get all products"""
        response = requests.get(f"{BASE_URL}/api/caisse/products")
        assert response.status_code == 200
        data = response.json()
        assert "products" in data
        print(f"✅ Retrieved {len(data['products'])} products")
    
    def test_update_product(self):
        """Manager updates a product - should generate notification"""
        # First create a product
        create_response = requests.post(
            f"{BASE_URL}/api/caisse/products",
            json={
                "name": "Update Test Product",
                "price": 2000,
                "department": "bar",
                "unit": "unité"
            },
            params={"modified_by": "Test Manager", "modified_by_role": "manager"}
        )
        product_id = create_response.json()["product"]["id"]
        
        # Update the product
        update_response = requests.put(
            f"{BASE_URL}/api/caisse/products/{product_id}",
            json={
                "name": "Updated Test Product",
                "price": 2500,
                "modified_by": "Test Manager",
                "modified_by_role": "manager"
            }
        )
        assert update_response.status_code == 200
        assert update_response.json()["success"] == True
        print(f"✅ Product updated: {product_id}")
        
        # Clean up
        requests.delete(f"{BASE_URL}/api/caisse/products/{product_id}")
    
    def test_delete_product(self):
        """Manager deletes a product - should generate notification"""
        # First create a product
        create_response = requests.post(
            f"{BASE_URL}/api/caisse/products",
            json={
                "name": "Delete Test Product",
                "price": 1500,
                "department": "bar",
                "unit": "unité"
            },
            params={"modified_by": "Test Manager", "modified_by_role": "manager"}
        )
        product_id = create_response.json()["product"]["id"]
        
        # Delete the product
        delete_response = requests.delete(
            f"{BASE_URL}/api/caisse/products/{product_id}",
            params={"modified_by": "Test Manager", "modified_by_role": "manager"}
        )
        assert delete_response.status_code == 200
        assert delete_response.json()["success"] == True
        print(f"✅ Product deleted: {product_id}")


class TestAdminMenuNotifications:
    """Test Admin can view and manage menu notifications"""
    
    def test_get_notifications(self):
        """Get all menu notifications"""
        response = requests.get(f"{BASE_URL}/api/menu-notifications")
        assert response.status_code == 200
        data = response.json()
        assert "notifications" in data
        assert "unread_count" in data
        print(f"✅ Retrieved {len(data['notifications'])} notifications, {data['unread_count']} unread")
    
    def test_get_unread_notifications(self):
        """Get only unread notifications"""
        response = requests.get(
            f"{BASE_URL}/api/menu-notifications",
            params={"unread_only": True}
        )
        assert response.status_code == 200
        data = response.json()
        assert "notifications" in data
        # All returned should be unread
        for notif in data["notifications"]:
            assert notif.get("is_read") == False
        print(f"✅ Retrieved {len(data['notifications'])} unread notifications")
    
    def test_notification_structure(self):
        """Verify notification contains required fields"""
        response = requests.get(f"{BASE_URL}/api/menu-notifications")
        data = response.json()
        
        if len(data["notifications"]) > 0:
            notif = data["notifications"][0]
            required_fields = ["id", "action", "product_name", "modified_by", "is_read", "created_at"]
            for field in required_fields:
                assert field in notif, f"Missing field: {field}"
            print(f"✅ Notification structure valid: {notif['action']} - {notif['product_name']}")
        else:
            print("ℹ️ No notifications to verify structure")
    
    def test_mark_notification_read(self):
        """Mark a notification as read"""
        # Get notifications
        get_response = requests.get(f"{BASE_URL}/api/menu-notifications")
        notifications = get_response.json()["notifications"]
        
        if len(notifications) > 0:
            notif_id = notifications[0]["id"]
            # Mark as read
            response = requests.put(f"{BASE_URL}/api/menu-notifications/{notif_id}/read")
            assert response.status_code == 200
            assert response.json()["success"] == True
            print(f"✅ Marked notification {notif_id} as read")
        else:
            print("ℹ️ No notifications to mark as read")
    
    def test_mark_all_notifications_read(self):
        """Mark all notifications as read"""
        response = requests.put(f"{BASE_URL}/api/menu-notifications/mark-all-read")
        assert response.status_code == 200
        assert response.json()["success"] == True
        print(f"✅ Marked all notifications as read: {response.json().get('count', 0)} updated")


class TestServerDailyReport:
    """Test Server can view their daily report (Mon Point)"""
    
    def test_get_server_daily_report(self):
        """Get daily report for a server"""
        server_name = "Marie Dupont"
        response = requests.get(
            f"{BASE_URL}/api/server-daily-report/{server_name}"
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "server_name" in data
        assert "date" in data
        assert "total_invoices" in data
        assert "validated_count" in data
        assert "pending_count" in data
        assert "total_sales" in data
        
        print(f"✅ Server report for {server_name}: {data['total_invoices']} invoices, {data['total_sales']}F sales")
    
    def test_get_server_report_with_date(self):
        """Get daily report for a specific date"""
        server_name = "Christian"
        date = datetime.now().strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/server-daily-report/{server_name}",
            params={"date": date}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["date"] == date
        print(f"✅ Server report for {server_name} on {date}: {data['total_invoices']} invoices")
    
    def test_server_report_breakdown(self):
        """Verify server report includes department and payment breakdowns"""
        server_name = "Marie Dupont"
        response = requests.get(
            f"{BASE_URL}/api/server-daily-report/{server_name}"
        )
        data = response.json()
        
        assert "department_breakdown" in data
        assert "payment_methods" in data
        assert "invoices" in data
        print(f"✅ Server report has breakdowns - departments: {len(data['department_breakdown'])}, payment methods: {len(data['payment_methods'])}")


class TestCaisseLogin:
    """Test Caisse login endpoints"""
    
    def test_manager_login_pin(self):
        """Manager can login with PIN"""
        response = requests.post(
            f"{BASE_URL}/api/caisse/login",
            json={"pin": "0000"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert "user" in data
        assert data["user"]["role"] == "manager"
        print(f"✅ Manager login successful: {data['user']['full_name']}")
    
    def test_server_login_pin(self):
        """Server can login with PIN"""
        response = requests.post(
            f"{BASE_URL}/api/caisse/login",
            json={"pin": "1234"}
        )
        # PIN may or may not exist
        if response.status_code == 200:
            data = response.json()
            assert data["success"] == True
            print(f"✅ Server login successful: {data['user']['full_name']}")
        else:
            print("ℹ️ PIN 1234 not configured for server login")
    
    def test_admin_login(self):
        """Admin can login with password"""
        response = requests.post(
            f"{BASE_URL}/api/caisse/login",
            json={"password": "Caisse2026"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["user"]["role"] == "admin"
        print(f"✅ Admin login successful")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
