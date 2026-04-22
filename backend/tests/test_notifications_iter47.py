"""
Iteration 47 - Notification Center Tests
Tests for:
1. GET /api/notifications/counts returns latest_by_category for all roles
2. Verify correct categories per role
3. Verify timestamps are ISO-8601 format
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestNotificationCounts:
    """Test notification counts endpoint with latest_by_category"""
    
    def test_admin_notifications_counts(self):
        """Admin should get all 9 categories with latest_by_category"""
        response = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": "admin"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Verify structure
        assert "role" in data
        assert data["role"] == "admin"
        assert "counts" in data
        assert "latest_by_category" in data
        assert "total" in data
        
        # Verify admin has all 9 categories
        expected_categories = [
            "needs", "purchase_orders", "expenses", "cancellation_requests",
            "modification_requests", "invoices", "financial_points", "tips_today", "notes"
        ]
        
        for cat in expected_categories:
            assert cat in data["counts"], f"Missing category '{cat}' in counts"
            assert cat in data["latest_by_category"], f"Missing category '{cat}' in latest_by_category"
        
        # Verify latest_by_category values are either empty string or ISO-8601 timestamps
        for cat, ts in data["latest_by_category"].items():
            if ts:  # Non-empty timestamp
                try:
                    # Try parsing as ISO-8601
                    datetime.fromisoformat(ts.replace('Z', '+00:00'))
                except ValueError:
                    pytest.fail(f"Invalid timestamp format for {cat}: {ts}")
        
        print(f"Admin counts: {data['counts']}")
        print(f"Admin latest_by_category: {data['latest_by_category']}")
        print(f"Admin total: {data['total']}")
    
    def test_manager_notifications_counts(self):
        """Manager should get 4 categories: expenses, purchase_orders, invoices, notes"""
        response = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": "manager"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Verify structure
        assert "role" in data
        assert data["role"] == "manager"
        assert "counts" in data
        assert "latest_by_category" in data
        assert "total" in data
        
        # Verify manager has exactly 4 categories
        expected_categories = ["expenses", "purchase_orders", "invoices", "notes"]
        
        for cat in expected_categories:
            assert cat in data["counts"], f"Missing category '{cat}' in counts"
            assert cat in data["latest_by_category"], f"Missing category '{cat}' in latest_by_category"
        
        # Verify no extra categories
        assert len(data["counts"]) == 4, f"Expected 4 categories, got {len(data['counts'])}"
        assert len(data["latest_by_category"]) == 4, f"Expected 4 latest_by_category, got {len(data['latest_by_category'])}"
        
        print(f"Manager counts: {data['counts']}")
        print(f"Manager latest_by_category: {data['latest_by_category']}")
        print(f"Manager total: {data['total']}")
    
    def test_server_notifications_counts(self):
        """Server should get only 1 category: notes"""
        response = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": "server"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Verify structure
        assert "role" in data
        assert data["role"] == "server"
        assert "counts" in data
        assert "latest_by_category" in data
        assert "total" in data
        
        # Verify server has only 'notes' category
        assert "notes" in data["counts"], "Missing 'notes' in counts"
        assert "notes" in data["latest_by_category"], "Missing 'notes' in latest_by_category"
        
        # Verify only 1 category
        assert len(data["counts"]) == 1, f"Expected 1 category, got {len(data['counts'])}"
        assert len(data["latest_by_category"]) == 1, f"Expected 1 latest_by_category, got {len(data['latest_by_category'])}"
        
        print(f"Server counts: {data['counts']}")
        print(f"Server latest_by_category: {data['latest_by_category']}")
        print(f"Server total: {data['total']}")
    
    def test_total_matches_sum_of_counts(self):
        """Verify total equals sum of all counts"""
        for role in ["admin", "manager", "server"]:
            response = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": role})
            assert response.status_code == 200
            
            data = response.json()
            expected_total = sum(data["counts"].values())
            assert data["total"] == expected_total, f"Total mismatch for {role}: expected {expected_total}, got {data['total']}"
            print(f"{role} total verified: {data['total']}")


class TestNotificationTimestamps:
    """Test that timestamps are properly formatted"""
    
    def test_timestamps_are_iso8601_or_empty(self):
        """All timestamps should be ISO-8601 format or empty string"""
        response = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": "admin"})
        assert response.status_code == 200
        
        data = response.json()
        
        for cat, ts in data["latest_by_category"].items():
            if ts:  # Non-empty
                # Should be parseable as ISO-8601
                try:
                    parsed = datetime.fromisoformat(ts.replace('Z', '+00:00'))
                    assert parsed is not None
                    print(f"{cat}: {ts} -> parsed OK")
                except ValueError as e:
                    pytest.fail(f"Invalid timestamp for {cat}: {ts} - {e}")
            else:
                print(f"{cat}: empty (no matching documents)")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
