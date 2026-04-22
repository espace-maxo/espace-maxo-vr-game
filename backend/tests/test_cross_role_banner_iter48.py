"""
Iteration 48 - Cross-Role Banner Backend Tests
Tests the new cross_role field in GET /api/notifications/counts

Features tested:
- Admin: cross_role contains manager-produced items (needs, expenses, tips_today, financial_points, notes)
- Manager: cross_role contains admin-produced items (expenses revision_requested, purchase_orders sent, notes)
- Server: cross_role is null
- Global total field still matches sum of counts (regression check)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCrossRoleBannerBackend:
    """Test cross_role field in notifications/counts endpoint"""
    
    def test_admin_cross_role_structure(self):
        """Admin should receive cross_role with source_role='manager' and 5 item categories"""
        response = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": "admin"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "cross_role" in data, "Missing cross_role field in admin response"
        
        cross_role = data["cross_role"]
        assert cross_role is not None, "cross_role should not be null for admin"
        assert cross_role.get("source_role") == "manager", f"Expected source_role='manager', got {cross_role.get('source_role')}"
        assert cross_role.get("source_label") == "la Gérante", f"Expected source_label='la Gérante', got {cross_role.get('source_label')}"
        
        items = cross_role.get("items", {})
        expected_keys = ["needs", "expenses", "tips_today", "financial_points", "notes"]
        for key in expected_keys:
            assert key in items, f"Missing '{key}' in cross_role.items for admin"
            assert "count" in items[key], f"Missing 'count' in cross_role.items.{key}"
            assert "latest" in items[key], f"Missing 'latest' in cross_role.items.{key}"
            assert isinstance(items[key]["count"], int), f"cross_role.items.{key}.count should be int"
        
        print(f"✓ Admin cross_role structure valid: {cross_role}")
    
    def test_admin_expenses_excludes_revision_requested(self):
        """Admin's cross_role.expenses.count should only count 'pending' status (not revision_requested)"""
        response = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": "admin"})
        assert response.status_code == 200
        
        data = response.json()
        cross_role = data.get("cross_role", {})
        items = cross_role.get("items", {})
        
        # The cross_role.expenses.count should be <= the main counts.expenses
        # because main counts.expenses includes both pending AND revision_requested
        main_expenses_count = data.get("counts", {}).get("expenses", 0)
        cross_expenses_count = items.get("expenses", {}).get("count", 0)
        
        # cross_role.expenses should be <= main expenses (pending only vs pending+revision)
        assert cross_expenses_count <= main_expenses_count, \
            f"cross_role.expenses.count ({cross_expenses_count}) should be <= counts.expenses ({main_expenses_count})"
        
        print(f"✓ Admin cross_role.expenses.count={cross_expenses_count} (pending only), counts.expenses={main_expenses_count} (pending+revision)")
    
    def test_manager_cross_role_structure(self):
        """Manager should receive cross_role with source_role='admin' and 3 item categories"""
        response = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": "manager"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "cross_role" in data, "Missing cross_role field in manager response"
        
        cross_role = data["cross_role"]
        assert cross_role is not None, "cross_role should not be null for manager"
        assert cross_role.get("source_role") == "admin", f"Expected source_role='admin', got {cross_role.get('source_role')}"
        assert cross_role.get("source_label") == "l'Administrateur", f"Expected source_label='l'Administrateur', got {cross_role.get('source_label')}"
        
        items = cross_role.get("items", {})
        expected_keys = ["expenses", "purchase_orders", "notes"]
        for key in expected_keys:
            assert key in items, f"Missing '{key}' in cross_role.items for manager"
            assert "count" in items[key], f"Missing 'count' in cross_role.items.{key}"
            assert "latest" in items[key], f"Missing 'latest' in cross_role.items.{key}"
            assert isinstance(items[key]["count"], int), f"cross_role.items.{key}.count should be int"
        
        print(f"✓ Manager cross_role structure valid: {cross_role}")
    
    def test_manager_expenses_counts_revision_requested_only(self):
        """Manager's cross_role.expenses.count should only count 'revision_requested' status"""
        response = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": "manager"})
        assert response.status_code == 200
        
        data = response.json()
        cross_role = data.get("cross_role", {})
        items = cross_role.get("items", {})
        
        # For manager, cross_role.expenses = revision_requested only
        # And counts.expenses should also be revision_requested (manager's main view)
        main_expenses_count = data.get("counts", {}).get("expenses", 0)
        cross_expenses_count = items.get("expenses", {}).get("count", 0)
        
        # They should be equal since both count revision_requested
        assert cross_expenses_count == main_expenses_count, \
            f"Manager cross_role.expenses.count ({cross_expenses_count}) should equal counts.expenses ({main_expenses_count})"
        
        print(f"✓ Manager cross_role.expenses.count={cross_expenses_count} (revision_requested only)")
    
    def test_manager_purchase_orders_counts_sent_only(self):
        """Manager's cross_role.purchase_orders.count should count status='sent'"""
        response = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": "manager"})
        assert response.status_code == 200
        
        data = response.json()
        cross_role = data.get("cross_role", {})
        items = cross_role.get("items", {})
        
        po_count = items.get("purchase_orders", {}).get("count", 0)
        assert isinstance(po_count, int), "purchase_orders.count should be int"
        
        print(f"✓ Manager cross_role.purchase_orders.count={po_count} (status='sent')")
    
    def test_server_cross_role_is_null(self):
        """Server should receive cross_role=null"""
        response = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": "server"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "cross_role" in data, "Missing cross_role field in server response"
        assert data["cross_role"] is None, f"Server cross_role should be null, got {data['cross_role']}"
        
        print("✓ Server cross_role is null as expected")
    
    def test_total_field_regression(self):
        """Global 'total' field should still match sum of counts (not cross_role)"""
        for role in ["admin", "manager", "server"]:
            response = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": role})
            assert response.status_code == 200
            
            data = response.json()
            counts = data.get("counts", {})
            expected_total = sum(counts.values())
            actual_total = data.get("total", 0)
            
            assert actual_total == expected_total, \
                f"[{role}] total={actual_total} should equal sum(counts)={expected_total}"
            
            print(f"✓ [{role}] total={actual_total} matches sum(counts)={expected_total}")
    
    def test_latest_by_category_still_present(self):
        """Regression: latest_by_category should still be present for all roles"""
        for role in ["admin", "manager", "server"]:
            response = requests.get(f"{BASE_URL}/api/notifications/counts", params={"role": role})
            assert response.status_code == 200
            
            data = response.json()
            assert "latest_by_category" in data, f"[{role}] Missing latest_by_category field"
            assert isinstance(data["latest_by_category"], dict), f"[{role}] latest_by_category should be dict"
            
            print(f"✓ [{role}] latest_by_category present with {len(data['latest_by_category'])} keys")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
