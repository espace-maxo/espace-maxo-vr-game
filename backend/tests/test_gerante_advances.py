"""
Test suite for Gerante Advances feature (Avances de la Gérante pour rendre la monnaie).

Tests:
- POST /api/gerante-advances - Create advance
- GET /api/gerante-advances - List advances with filters
- GET /api/gerante-advances/summary - Get summary totals
- POST /api/gerante-advances/{id}/reimburse - Reimburse single advance
- POST /api/gerante-advances/reimburse-all - Reimburse all pending
- DELETE /api/gerante-advances/{id} - Delete advance
- GET /api/cash-closures/live - Verify expected_cash_in_drawer includes advances
- POST /api/cash-closures - Verify gap_cash uses expected_cash_in_drawer
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestGeranteAdvancesCreate:
    """Test POST /api/gerante-advances - Create advance"""
    
    def test_create_advance_success(self):
        """Create advance with valid amount and reason"""
        payload = {
            "amount": 2000,
            "reason": f"TEST_Monnaie client facture {uuid.uuid4().hex[:8]}"
        }
        response = requests.post(f"{BASE_URL}/api/gerante-advances", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") is True
        assert "advance" in data
        
        advance = data["advance"]
        assert advance["amount"] == 2000
        assert "TEST_" in advance["reason"]
        assert advance["status"] == "pending"
        assert "id" in advance
        assert "created_at" in advance
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/gerante-advances/{advance['id']}")
    
    def test_create_advance_zero_amount_fails(self):
        """Create advance with amount=0 should fail with 422"""
        payload = {"amount": 0, "reason": "TEST_Invalid"}
        response = requests.post(f"{BASE_URL}/api/gerante-advances", json=payload)
        assert response.status_code == 422, f"Expected 422 for zero amount, got {response.status_code}"
    
    def test_create_advance_negative_amount_fails(self):
        """Create advance with negative amount should fail with 422"""
        payload = {"amount": -500, "reason": "TEST_Invalid"}
        response = requests.post(f"{BASE_URL}/api/gerante-advances", json=payload)
        assert response.status_code == 422, f"Expected 422 for negative amount, got {response.status_code}"


class TestGeranteAdvancesList:
    """Test GET /api/gerante-advances - List advances"""
    
    @pytest.fixture(autouse=True)
    def setup_test_advance(self):
        """Create a test advance before each test"""
        payload = {"amount": 1500, "reason": f"TEST_List_{uuid.uuid4().hex[:6]}"}
        r = requests.post(f"{BASE_URL}/api/gerante-advances", json=payload)
        self.test_advance_id = r.json().get("advance", {}).get("id")
        yield
        # Cleanup
        if self.test_advance_id:
            requests.delete(f"{BASE_URL}/api/gerante-advances/{self.test_advance_id}")
    
    def test_list_all_advances(self):
        """List all advances without filters"""
        response = requests.get(f"{BASE_URL}/api/gerante-advances")
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("success") is True
        assert "advances" in data
        assert isinstance(data["advances"], list)
    
    def test_list_pending_advances(self):
        """List only pending advances"""
        response = requests.get(f"{BASE_URL}/api/gerante-advances", params={"status": "pending"})
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("success") is True
        # All returned advances should be pending
        for adv in data["advances"]:
            assert adv["status"] == "pending"


class TestGeranteAdvancesSummary:
    """Test GET /api/gerante-advances/summary"""
    
    def test_summary_returns_expected_fields(self):
        """Summary should return pending_total, pending_count, etc."""
        response = requests.get(f"{BASE_URL}/api/gerante-advances/summary")
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("success") is True
        
        # Check required fields
        assert "pending_total" in data
        assert "pending_count" in data
        assert "pending_today_total" in data
        assert "reimbursed_today_total" in data
        
        # Values should be numbers
        assert isinstance(data["pending_total"], (int, float))
        assert isinstance(data["pending_count"], int)


class TestGeranteAdvancesReimburse:
    """Test POST /api/gerante-advances/{id}/reimburse"""
    
    def test_reimburse_advance_success(self):
        """Reimburse a pending advance"""
        # Create advance
        payload = {"amount": 3000, "reason": f"TEST_Reimburse_{uuid.uuid4().hex[:6]}"}
        create_r = requests.post(f"{BASE_URL}/api/gerante-advances", json=payload)
        advance_id = create_r.json()["advance"]["id"]
        
        # Reimburse
        reimburse_r = requests.post(f"{BASE_URL}/api/gerante-advances/{advance_id}/reimburse", json={})
        assert reimburse_r.status_code == 200, f"Expected 200, got {reimburse_r.status_code}: {reimburse_r.text}"
        
        data = reimburse_r.json()
        assert data.get("success") is True
        assert data["advance"]["status"] == "reimbursed"
        assert data["advance"]["reimbursed_at"] is not None
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/gerante-advances/{advance_id}")
    
    def test_reimburse_already_reimbursed_fails(self):
        """Reimburse an already reimbursed advance should fail with 409"""
        # Create and reimburse
        payload = {"amount": 1000, "reason": f"TEST_DoubleReimburse_{uuid.uuid4().hex[:6]}"}
        create_r = requests.post(f"{BASE_URL}/api/gerante-advances", json=payload)
        advance_id = create_r.json()["advance"]["id"]
        requests.post(f"{BASE_URL}/api/gerante-advances/{advance_id}/reimburse", json={})
        
        # Try to reimburse again
        second_r = requests.post(f"{BASE_URL}/api/gerante-advances/{advance_id}/reimburse", json={})
        assert second_r.status_code == 409, f"Expected 409 for double reimburse, got {second_r.status_code}"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/gerante-advances/{advance_id}")
    
    def test_reimburse_nonexistent_fails(self):
        """Reimburse non-existent advance should fail with 404"""
        fake_id = str(uuid.uuid4())
        response = requests.post(f"{BASE_URL}/api/gerante-advances/{fake_id}/reimburse", json={})
        assert response.status_code == 404


class TestGeranteAdvancesReimburseAll:
    """Test POST /api/gerante-advances/reimburse-all"""
    
    def test_reimburse_all_pending(self):
        """Reimburse all pending advances"""
        # Create 2 test advances
        ids = []
        for i in range(2):
            payload = {"amount": 500 * (i + 1), "reason": f"TEST_ReimburseAll_{i}_{uuid.uuid4().hex[:4]}"}
            r = requests.post(f"{BASE_URL}/api/gerante-advances", json=payload)
            ids.append(r.json()["advance"]["id"])
        
        # Reimburse all
        response = requests.post(f"{BASE_URL}/api/gerante-advances/reimburse-all", json={})
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("success") is True
        assert "count" in data
        assert "total_amount" in data
        
        # Verify all are reimbursed
        for adv_id in ids:
            check_r = requests.get(f"{BASE_URL}/api/gerante-advances", params={"status": "pending"})
            pending_ids = [a["id"] for a in check_r.json().get("advances", [])]
            assert adv_id not in pending_ids, f"Advance {adv_id} should be reimbursed"
        
        # Cleanup
        for adv_id in ids:
            requests.delete(f"{BASE_URL}/api/gerante-advances/{adv_id}")


class TestGeranteAdvancesDelete:
    """Test DELETE /api/gerante-advances/{id}"""
    
    def test_delete_advance_success(self):
        """Delete an advance"""
        # Create
        payload = {"amount": 750, "reason": f"TEST_Delete_{uuid.uuid4().hex[:6]}"}
        create_r = requests.post(f"{BASE_URL}/api/gerante-advances", json=payload)
        advance_id = create_r.json()["advance"]["id"]
        
        # Delete
        delete_r = requests.delete(f"{BASE_URL}/api/gerante-advances/{advance_id}")
        assert delete_r.status_code == 200
        assert delete_r.json().get("success") is True
        
        # Verify deleted
        list_r = requests.get(f"{BASE_URL}/api/gerante-advances")
        ids = [a["id"] for a in list_r.json().get("advances", [])]
        assert advance_id not in ids
    
    def test_delete_nonexistent_fails(self):
        """Delete non-existent advance should fail with 404"""
        fake_id = str(uuid.uuid4())
        response = requests.delete(f"{BASE_URL}/api/gerante-advances/{fake_id}")
        assert response.status_code == 404


class TestCashClosuresLiveWithAdvances:
    """Test GET /api/cash-closures/live includes gerante advances in expected_cash_in_drawer"""
    
    def test_live_snapshot_includes_gerante_fields(self):
        """Live snapshot should include gerante_pending_total, expected_cash_in_drawer"""
        response = requests.get(f"{BASE_URL}/api/cash-closures/live")
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("success") is True
        snapshot = data.get("snapshot", {})
        
        # Check gerante fields exist
        assert "gerante_pending_total" in snapshot
        assert "gerante_pending_count" in snapshot
        assert "gerante_reimbursed_today_total" in snapshot
        assert "gerante_reimbursed_today_count" in snapshot
        assert "expected_cash_in_drawer" in snapshot
    
    def test_expected_cash_includes_pending_advance(self):
        """When advance is pending, expected_cash_in_drawer = cash + pending_total"""
        # Get initial snapshot
        initial_r = requests.get(f"{BASE_URL}/api/cash-closures/live")
        initial_snap = initial_r.json()["snapshot"]
        initial_expected = initial_snap["expected_cash_in_drawer"]
        initial_pending = initial_snap["gerante_pending_total"]
        
        # Create a pending advance
        payload = {"amount": 2000, "reason": f"TEST_ExpectedCash_{uuid.uuid4().hex[:6]}"}
        create_r = requests.post(f"{BASE_URL}/api/gerante-advances", json=payload)
        advance_id = create_r.json()["advance"]["id"]
        
        # Get new snapshot
        new_r = requests.get(f"{BASE_URL}/api/cash-closures/live")
        new_snap = new_r.json()["snapshot"]
        new_expected = new_snap["expected_cash_in_drawer"]
        new_pending = new_snap["gerante_pending_total"]
        
        # Pending total should increase by 2000
        assert new_pending == initial_pending + 2000, f"Pending should increase by 2000: {initial_pending} -> {new_pending}"
        
        # Expected cash should also increase by 2000
        assert new_expected == initial_expected + 2000, f"Expected cash should increase by 2000: {initial_expected} -> {new_expected}"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/gerante-advances/{advance_id}")


class TestCashClosureGapCalculation:
    """Test POST /api/cash-closures uses expected_cash_in_drawer for gap_cash"""
    
    def test_gap_cash_uses_expected_cash(self):
        """gap_cash = declared_cash - expected_cash_in_drawer (not just per_method.cash)"""
        from datetime import datetime, timedelta
        
        # Use a test date in the past to avoid conflicts
        test_date = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")
        
        # First delete any existing closure for this date
        closures_r = requests.get(f"{BASE_URL}/api/cash-closures")
        for c in closures_r.json().get("closures", []):
            if c.get("date") == test_date:
                requests.delete(f"{BASE_URL}/api/cash-closures/{c['id']}")
        
        # Get live snapshot for that date
        snap_r = requests.get(f"{BASE_URL}/api/cash-closures/live", params={"date": test_date})
        snap = snap_r.json()["snapshot"]
        expected_cash = snap["expected_cash_in_drawer"]
        
        # Create closure with declared_cash = expected_cash (should have gap=0)
        payload = {
            "date": test_date,
            "declared_cash": expected_cash,
            "notes": "TEST_GapCalculation"
        }
        create_r = requests.post(f"{BASE_URL}/api/cash-closures", json=payload)
        
        if create_r.status_code == 200:
            closure = create_r.json()["closure"]
            # Gap should be 0 when declared = expected
            assert closure["gap_cash"] == 0, f"Gap should be 0 when declared=expected, got {closure['gap_cash']}"
            
            # Cleanup
            requests.delete(f"{BASE_URL}/api/cash-closures/{closure['id']}")
        else:
            # If closure already exists, that's ok for this test
            assert create_r.status_code == 409, f"Unexpected error: {create_r.status_code} - {create_r.text}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
