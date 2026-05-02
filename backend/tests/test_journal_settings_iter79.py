"""
Test Journal Settings & Reset Endpoints - Iteration 79
Tests for:
- GET /api/journal/settings → {cutoff_date, default}
- POST /api/journal/settings → update cutoff_date
- POST /api/journal/reset → delete manual ops + optionally set cutoff
- GET /api/journal/dashboard → includes 'cutoff' field
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestJournalSettings:
    """Tests for GET/POST /api/journal/settings"""
    
    def test_get_settings_returns_cutoff_and_default(self):
        """GET /api/journal/settings returns cutoff_date and default"""
        response = requests.get(f"{BASE_URL}/api/journal/settings")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "cutoff_date" in data, "Response should contain 'cutoff_date'"
        assert "default" in data, "Response should contain 'default'"
        assert data["default"] == "2026-05-01", f"Default should be 2026-05-01, got {data['default']}"
        # cutoff_date should be a valid date string
        assert isinstance(data["cutoff_date"], str), "cutoff_date should be a string"
        print(f"✓ GET /api/journal/settings: cutoff_date={data['cutoff_date']}, default={data['default']}")
    
    def test_post_settings_valid_date(self):
        """POST /api/journal/settings with valid date format succeeds"""
        # First get current cutoff to restore later
        get_resp = requests.get(f"{BASE_URL}/api/journal/settings")
        original_cutoff = get_resp.json().get("cutoff_date", "2026-05-01")
        
        # Set new cutoff
        new_cutoff = "2026-04-01"
        response = requests.post(
            f"{BASE_URL}/api/journal/settings",
            json={"cutoff_date": new_cutoff}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") is True, "Response should have success=true"
        assert data.get("cutoff_date") == new_cutoff, f"cutoff_date should be {new_cutoff}"
        
        # Verify persistence
        verify_resp = requests.get(f"{BASE_URL}/api/journal/settings")
        assert verify_resp.json().get("cutoff_date") == new_cutoff, "Cutoff should be persisted"
        print(f"✓ POST /api/journal/settings: cutoff_date set to {new_cutoff}")
        
        # Restore original cutoff
        requests.post(f"{BASE_URL}/api/journal/settings", json={"cutoff_date": original_cutoff})
    
    def test_post_settings_invalid_format_abc(self):
        """POST /api/journal/settings with 'abc' returns 422"""
        response = requests.post(
            f"{BASE_URL}/api/journal/settings",
            json={"cutoff_date": "abc"}
        )
        assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"
        print("✓ POST /api/journal/settings with 'abc' returns 422")
    
    def test_post_settings_invalid_format_partial(self):
        """POST /api/journal/settings with '2026-04' returns 422"""
        response = requests.post(
            f"{BASE_URL}/api/journal/settings",
            json={"cutoff_date": "2026-04"}
        )
        assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"
        print("✓ POST /api/journal/settings with '2026-04' returns 422")
    
    def test_post_settings_invalid_date_value(self):
        """POST /api/journal/settings with '2026-13-45' returns 422"""
        response = requests.post(
            f"{BASE_URL}/api/journal/settings",
            json={"cutoff_date": "2026-13-45"}
        )
        assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"
        print("✓ POST /api/journal/settings with invalid date '2026-13-45' returns 422")


class TestJournalDashboardCutoff:
    """Tests for GET /api/journal/dashboard including cutoff field"""
    
    def test_dashboard_includes_cutoff_field(self):
        """GET /api/journal/dashboard response includes 'cutoff' field"""
        response = requests.get(f"{BASE_URL}/api/journal/dashboard")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "cutoff" in data, "Dashboard response should include 'cutoff' field"
        assert isinstance(data["cutoff"], str), "cutoff should be a string"
        print(f"✓ GET /api/journal/dashboard includes cutoff={data['cutoff']}")
    
    def test_dashboard_cutoff_matches_settings(self):
        """Dashboard cutoff should match the value from settings"""
        # Get settings cutoff
        settings_resp = requests.get(f"{BASE_URL}/api/journal/settings")
        settings_cutoff = settings_resp.json().get("cutoff_date")
        
        # Get dashboard cutoff
        dashboard_resp = requests.get(f"{BASE_URL}/api/journal/dashboard")
        dashboard_cutoff = dashboard_resp.json().get("cutoff")
        
        assert dashboard_cutoff == settings_cutoff, \
            f"Dashboard cutoff ({dashboard_cutoff}) should match settings ({settings_cutoff})"
        print(f"✓ Dashboard cutoff matches settings: {dashboard_cutoff}")
    
    def test_dashboard_cutoff_updates_after_settings_change(self):
        """Dashboard cutoff should update after changing settings"""
        # Get original cutoff
        original_resp = requests.get(f"{BASE_URL}/api/journal/settings")
        original_cutoff = original_resp.json().get("cutoff_date", "2026-05-01")
        
        # Set new cutoff
        new_cutoff = "2026-03-15"
        requests.post(f"{BASE_URL}/api/journal/settings", json={"cutoff_date": new_cutoff})
        
        # Verify dashboard uses new cutoff
        dashboard_resp = requests.get(f"{BASE_URL}/api/journal/dashboard")
        dashboard_cutoff = dashboard_resp.json().get("cutoff")
        assert dashboard_cutoff == new_cutoff, \
            f"Dashboard should use new cutoff {new_cutoff}, got {dashboard_cutoff}"
        print(f"✓ Dashboard cutoff updated to {new_cutoff}")
        
        # Restore original
        requests.post(f"{BASE_URL}/api/journal/settings", json={"cutoff_date": original_cutoff})


class TestJournalReset:
    """Tests for POST /api/journal/reset"""
    
    def test_reset_with_confirm_false_returns_400(self):
        """POST /api/journal/reset with confirm=false returns 400"""
        response = requests.post(
            f"{BASE_URL}/api/journal/reset",
            json={"confirm": False}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("✓ POST /api/journal/reset with confirm=false returns 400")
    
    def test_reset_with_confirm_true_succeeds(self):
        """POST /api/journal/reset with confirm=true succeeds"""
        # First create a test manual operation
        test_op = {
            "type": "entree",
            "amount": 1000,
            "label": f"TEST_iter79_reset_{uuid.uuid4().hex[:8]}",
            "created_by": "TestAgent"
        }
        create_resp = requests.post(f"{BASE_URL}/api/journal/manual", json=test_op)
        assert create_resp.status_code == 200, f"Failed to create test op: {create_resp.text}"
        
        # Now reset
        response = requests.post(
            f"{BASE_URL}/api/journal/reset",
            json={"confirm": True}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") is True, "Response should have success=true"
        assert "deleted_manual_ops" in data, "Response should include deleted_manual_ops count"
        assert "cutoff_date" in data, "Response should include cutoff_date"
        print(f"✓ POST /api/journal/reset: deleted {data['deleted_manual_ops']} ops, cutoff={data['cutoff_date']}")
    
    def test_reset_with_set_cutoff_to(self):
        """POST /api/journal/reset with set_cutoff_to updates cutoff"""
        # Get original cutoff
        original_resp = requests.get(f"{BASE_URL}/api/journal/settings")
        original_cutoff = original_resp.json().get("cutoff_date", "2026-05-01")
        
        # Reset with new cutoff
        new_cutoff = "2026-05-01"
        response = requests.post(
            f"{BASE_URL}/api/journal/reset",
            json={"confirm": True, "set_cutoff_to": new_cutoff}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("cutoff_date") == new_cutoff, \
            f"cutoff_date should be {new_cutoff}, got {data.get('cutoff_date')}"
        
        # Verify settings updated
        verify_resp = requests.get(f"{BASE_URL}/api/journal/settings")
        assert verify_resp.json().get("cutoff_date") == new_cutoff
        print(f"✓ POST /api/journal/reset with set_cutoff_to={new_cutoff}")
    
    def test_reset_with_invalid_set_cutoff_to_returns_422(self):
        """POST /api/journal/reset with invalid set_cutoff_to returns 422"""
        response = requests.post(
            f"{BASE_URL}/api/journal/reset",
            json={"confirm": True, "set_cutoff_to": "invalid-date"}
        )
        assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"
        print("✓ POST /api/journal/reset with invalid set_cutoff_to returns 422")
    
    def test_reset_deletes_manual_operations(self):
        """Reset should delete all manual operations"""
        # Create test operations
        for i in range(3):
            test_op = {
                "type": "entree" if i % 2 == 0 else "depense",
                "amount": 1000 + i * 100,
                "label": f"TEST_iter79_delete_{uuid.uuid4().hex[:8]}",
                "created_by": "TestAgent"
            }
            requests.post(f"{BASE_URL}/api/journal/manual", json=test_op)
        
        # Get realtime to verify ops exist
        before_resp = requests.get(f"{BASE_URL}/api/journal/realtime", params={"days": 30})
        before_ops = [op for op in before_resp.json().get("operations", []) 
                      if op.get("label", "").startswith("TEST_iter79_delete_")]
        
        # Reset
        reset_resp = requests.post(
            f"{BASE_URL}/api/journal/reset",
            json={"confirm": True, "set_cutoff_to": "2026-05-01"}
        )
        assert reset_resp.status_code == 200
        
        # Verify ops deleted
        after_resp = requests.get(f"{BASE_URL}/api/journal/realtime", params={"days": 30})
        after_ops = [op for op in after_resp.json().get("operations", []) 
                     if op.get("label", "").startswith("TEST_iter79_delete_")]
        
        assert len(after_ops) == 0, f"Expected 0 test ops after reset, found {len(after_ops)}"
        print(f"✓ Reset deleted manual operations (before: {len(before_ops)}, after: {len(after_ops)})")


class TestCleanup:
    """Cleanup: restore cutoff to default"""
    
    def test_zz_restore_cutoff_to_default(self):
        """Restore cutoff to 2026-05-01 after all tests"""
        response = requests.post(
            f"{BASE_URL}/api/journal/settings",
            json={"cutoff_date": "2026-05-01"}
        )
        assert response.status_code == 200
        print("✓ Restored cutoff to 2026-05-01")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
