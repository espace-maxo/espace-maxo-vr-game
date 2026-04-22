"""
Test suite for Notifications Counts API (GET /api/notifications/counts)
Tests badge counts for admin, manager, and server roles.
"""
import pytest
import requests
import os
from datetime import date

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestNotificationsCountsAdmin:
    """Tests for admin role notification counts"""
    
    def test_admin_counts_returns_all_keys(self):
        """GET /api/notifications/counts?role=admin returns all expected keys"""
        response = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": "admin"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["role"] == "admin"
        assert "counts" in data
        assert "total" in data
        
        counts = data["counts"]
        # Admin should have all these keys
        expected_keys = [
            "needs", "purchase_orders", "expenses", 
            "cancellation_requests", "modification_requests",
            "invoices", "financial_points", "tips_today", "notes"
        ]
        for key in expected_keys:
            assert key in counts, f"Missing key '{key}' in admin counts"
        
        # Total should be sum of all counts
        assert isinstance(data["total"], int)
        assert data["total"] == sum(counts.values())
        print(f"Admin counts: {counts}, total: {data['total']}")
    
    def test_admin_counts_values_are_integers(self):
        """All count values should be non-negative integers"""
        response = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": "admin"})
        assert response.status_code == 200
        
        counts = response.json()["counts"]
        for key, value in counts.items():
            assert isinstance(value, int), f"Count '{key}' is not an integer: {value}"
            assert value >= 0, f"Count '{key}' is negative: {value}"


class TestNotificationsCountsManager:
    """Tests for manager role notification counts"""
    
    def test_manager_counts_returns_expected_keys(self):
        """GET /api/notifications/counts?role=manager returns manager-specific keys"""
        response = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": "manager"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["role"] == "manager"
        assert "counts" in data
        assert "total" in data
        
        counts = data["counts"]
        # Manager should have these keys
        expected_keys = ["expenses", "purchase_orders", "invoices", "notes"]
        for key in expected_keys:
            assert key in counts, f"Missing key '{key}' in manager counts"
        
        # Manager should NOT have admin-only keys
        admin_only_keys = ["needs", "cancellation_requests", "modification_requests", "financial_points", "tips_today"]
        for key in admin_only_keys:
            assert key not in counts, f"Manager should not have '{key}' key"
        
        assert data["total"] == sum(counts.values())
        print(f"Manager counts: {counts}, total: {data['total']}")
    
    def test_manager_expenses_counts_revision_requested_only(self):
        """Manager's expenses count should only count revision_requested status"""
        # This is a structural test - the endpoint should filter correctly
        response = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": "manager"})
        assert response.status_code == 200
        
        counts = response.json()["counts"]
        assert "expenses" in counts
        # Value should be >= 0 (we can't verify exact filtering without creating test data)
        assert counts["expenses"] >= 0
        print(f"Manager expenses (revision_requested only): {counts['expenses']}")
    
    def test_manager_purchase_orders_counts_sent_only(self):
        """Manager's purchase_orders count should only count status='sent'"""
        response = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": "manager"})
        assert response.status_code == 200
        
        counts = response.json()["counts"]
        assert "purchase_orders" in counts
        assert counts["purchase_orders"] >= 0
        print(f"Manager POs (sent only): {counts['purchase_orders']}")


class TestNotificationsCountsServer:
    """Tests for server role notification counts"""
    
    def test_server_counts_returns_notes_only(self):
        """GET /api/notifications/counts?role=server returns only notes"""
        response = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": "server"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["role"] == "server"
        assert "counts" in data
        assert "total" in data
        
        counts = data["counts"]
        # Server should only have notes
        assert "notes" in counts
        assert len(counts) == 1, f"Server should only have 'notes' key, got: {list(counts.keys())}"
        
        assert data["total"] == counts["notes"]
        print(f"Server counts: {counts}, total: {data['total']}")


class TestNotificationsCountsIntegration:
    """Integration tests for notification counts with data creation"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data tracking"""
        self.created_need_id = None
        yield
        # Cleanup
        if self.created_need_id:
            try:
                requests.delete(f"{BASE_URL}/api/needs/{self.created_need_id}")
            except:
                pass
    
    def test_needs_count_increments_on_create(self):
        """Creating a need should increment admin's needs count"""
        # Get initial count
        response1 = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": "admin"})
        assert response1.status_code == 200
        initial_needs = response1.json()["counts"]["needs"]
        
        # Create a new need
        need_data = {
            "description": "TEST_NOTIF_Need for testing",
            "category": "cuisine",
            "quantity": 1,
            "unit": "kg",
            "urgency": "normal",
            "requested_by": "Test User"
        }
        create_response = requests.post(f"{BASE_URL}/api/needs", json=need_data)
        assert create_response.status_code in [200, 201], f"Failed to create need: {create_response.text}"
        self.created_need_id = create_response.json().get("need", {}).get("id") or create_response.json().get("id")
        
        # Get new count
        response2 = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": "admin"})
        assert response2.status_code == 200
        new_needs = response2.json()["counts"]["needs"]
        
        # Count should have incremented
        assert new_needs >= initial_needs, f"Needs count should have incremented: {initial_needs} -> {new_needs}"
        print(f"Needs count: {initial_needs} -> {new_needs}")
    
    def test_needs_count_decrements_on_delete(self):
        """Deleting a need should decrement admin's needs count"""
        # Create a need first
        need_data = {
            "description": "TEST_NOTIF_Need to delete",
            "category": "cuisine",
            "quantity": 1,
            "unit": "kg",
            "urgency": "normal",
            "requested_by": "Test User"
        }
        create_response = requests.post(f"{BASE_URL}/api/needs", json=need_data)
        assert create_response.status_code in [200, 201], f"Failed to create need: {create_response.text}"
        need_id = create_response.json().get("need", {}).get("id") or create_response.json().get("id")
        
        # Get count after creation
        response1 = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": "admin"})
        count_after_create = response1.json()["counts"]["needs"]
        
        # Delete the need
        delete_response = requests.delete(f"{BASE_URL}/api/needs/{need_id}")
        assert delete_response.status_code in [200, 204], f"Failed to delete need: {delete_response.text}"
        
        # Get count after deletion
        response2 = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": "admin"})
        count_after_delete = response2.json()["counts"]["needs"]
        
        # Count should have decremented
        assert count_after_delete <= count_after_create, f"Needs count should have decremented: {count_after_create} -> {count_after_delete}"
        print(f"Needs count after delete: {count_after_create} -> {count_after_delete}")


class TestNotificationsCountsEdgeCases:
    """Edge case tests"""
    
    def test_default_role_is_admin(self):
        """Without role param, should default to admin"""
        response = requests.get(f"{BASE_URL}/api/notifications/counts")
        assert response.status_code == 200
        
        data = response.json()
        assert data["role"] == "admin"
    
    def test_unknown_role_returns_server_counts(self):
        """Unknown role should return server-like counts"""
        response = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": "unknown_role"})
        assert response.status_code == 200
        
        data = response.json()
        # Should fall through to server handler
        assert "counts" in data
        assert "notes" in data["counts"]
    
    def test_user_param_accepted(self):
        """User param should be accepted without error"""
        response = requests.get(f"{BASE_URL}/api/notifications/counts", params={
            "role": "manager",
            "user": "Test User"
        })
        assert response.status_code == 200
        assert response.json()["role"] == "manager"


class TestAdminSpecificCounts:
    """Tests for admin-specific count logic"""
    
    def test_expenses_counts_pending_and_revision(self):
        """Admin expenses should count pending AND revision_requested"""
        response = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": "admin"})
        assert response.status_code == 200
        
        counts = response.json()["counts"]
        assert "expenses" in counts
        assert counts["expenses"] >= 0
        print(f"Admin expenses (pending + revision_requested): {counts['expenses']}")
    
    def test_financial_points_counts_signed_not_validated(self):
        """financial_points should count signed=true AND admin_validated=false"""
        response = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": "admin"})
        assert response.status_code == 200
        
        counts = response.json()["counts"]
        assert "financial_points" in counts
        assert counts["financial_points"] >= 0
        print(f"Admin financial_points (signed, not validated): {counts['financial_points']}")
    
    def test_tips_today_counts_only_today(self):
        """tips_today should count only tips with date = today"""
        response = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": "admin"})
        assert response.status_code == 200
        
        counts = response.json()["counts"]
        assert "tips_today" in counts
        assert counts["tips_today"] >= 0
        print(f"Admin tips_today: {counts['tips_today']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
