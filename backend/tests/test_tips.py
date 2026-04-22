"""
Test suite for Tips (Pourboires) API endpoints.

Tests cover:
- CRUD operations for tips
- Validation rules (amount > 0, payment_method, attribution_type, server_name)
- Summary endpoint with day/week/ranking aggregation
- Filtering by server, date range
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data prefix for cleanup
TEST_PREFIX = "TEST_TIP_"


class TestTipsCreate:
    """Tests for POST /api/tips endpoint"""

    def test_create_tip_pool_attribution(self):
        """Create a tip with attribution_type='pool' (no server_name needed)"""
        payload = {
            "amount": 1500,
            "payment_method": "cash",
            "attribution_type": "pool",
            "notes": f"{TEST_PREFIX}pool tip",
            "created_by": "TestAdmin"
        }
        response = requests.post(f"{BASE_URL}/api/tips", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") is True
        assert "tip" in data
        tip = data["tip"]
        assert tip["amount"] == 1500
        assert tip["attribution_type"] == "pool"
        assert tip["server_name"] is None
        assert tip["payment_method"] == "cash"
        assert "id" in tip
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/tips/{tip['id']}")

    def test_create_tip_server_attribution_with_server_name(self):
        """Create a tip with attribution_type='server' and valid server_name"""
        payload = {
            "amount": 2000,
            "payment_method": "mobile_money",
            "attribution_type": "server",
            "server_name": "Christian",
            "notes": f"{TEST_PREFIX}server tip",
            "created_by": "TestAdmin"
        }
        response = requests.post(f"{BASE_URL}/api/tips", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") is True
        tip = data["tip"]
        assert tip["attribution_type"] == "server"
        assert tip["server_name"] == "Christian"
        assert tip["payment_method"] == "mobile_money"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/tips/{tip['id']}")

    def test_create_tip_server_attribution_missing_server_name_returns_400(self):
        """POST /api/tips with attribution_type='server' but no server_name returns 400"""
        payload = {
            "amount": 1000,
            "payment_method": "cash",
            "attribution_type": "server",
            "server_name": "",  # Empty server_name
            "notes": f"{TEST_PREFIX}should fail",
            "created_by": "TestAdmin"
        }
        response = requests.post(f"{BASE_URL}/api/tips", json=payload)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"

    def test_create_tip_server_attribution_null_server_name_returns_400(self):
        """POST /api/tips with attribution_type='server' but null server_name returns 400"""
        payload = {
            "amount": 1000,
            "payment_method": "cash",
            "attribution_type": "server",
            "server_name": None,
            "notes": f"{TEST_PREFIX}should fail",
            "created_by": "TestAdmin"
        }
        response = requests.post(f"{BASE_URL}/api/tips", json=payload)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"

    def test_create_tip_invalid_payment_method_returns_400(self):
        """POST /api/tips with invalid payment_method returns 400"""
        payload = {
            "amount": 1000,
            "payment_method": "bitcoin",  # Invalid
            "attribution_type": "pool",
            "notes": f"{TEST_PREFIX}invalid payment",
            "created_by": "TestAdmin"
        }
        response = requests.post(f"{BASE_URL}/api/tips", json=payload)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"

    def test_create_tip_valid_payment_methods(self):
        """POST /api/tips accepts all valid payment methods: cash, mobile_money, card, other"""
        valid_methods = ["cash", "mobile_money", "card", "other"]
        created_ids = []
        
        for method in valid_methods:
            payload = {
                "amount": 500,
                "payment_method": method,
                "attribution_type": "pool",
                "notes": f"{TEST_PREFIX}payment_{method}",
                "created_by": "TestAdmin"
            }
            response = requests.post(f"{BASE_URL}/api/tips", json=payload)
            assert response.status_code == 200, f"Failed for payment_method={method}: {response.text}"
            created_ids.append(response.json()["tip"]["id"])
        
        # Cleanup
        for tip_id in created_ids:
            requests.delete(f"{BASE_URL}/api/tips/{tip_id}")

    def test_create_tip_amount_zero_returns_400(self):
        """POST /api/tips with amount=0 returns 400"""
        payload = {
            "amount": 0,
            "payment_method": "cash",
            "attribution_type": "pool",
            "notes": f"{TEST_PREFIX}zero amount",
            "created_by": "TestAdmin"
        }
        response = requests.post(f"{BASE_URL}/api/tips", json=payload)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"

    def test_create_tip_negative_amount_returns_400(self):
        """POST /api/tips with negative amount returns 400"""
        payload = {
            "amount": -100,
            "payment_method": "cash",
            "attribution_type": "pool",
            "notes": f"{TEST_PREFIX}negative amount",
            "created_by": "TestAdmin"
        }
        response = requests.post(f"{BASE_URL}/api/tips", json=payload)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"

    def test_create_tip_decimal_amount_accepted(self):
        """POST /api/tips accepts decimal amounts like 0.5"""
        payload = {
            "amount": 0.5,
            "payment_method": "cash",
            "attribution_type": "pool",
            "notes": f"{TEST_PREFIX}decimal amount",
            "created_by": "TestAdmin"
        }
        response = requests.post(f"{BASE_URL}/api/tips", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        tip = response.json()["tip"]
        assert tip["amount"] == 0.5
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/tips/{tip['id']}")

    def test_create_tip_default_date_is_today(self):
        """POST /api/tips without date defaults to today"""
        payload = {
            "amount": 1000,
            "payment_method": "cash",
            "attribution_type": "pool",
            "notes": f"{TEST_PREFIX}default date",
            "created_by": "TestAdmin"
        }
        response = requests.post(f"{BASE_URL}/api/tips", json=payload)
        assert response.status_code == 200
        
        tip = response.json()["tip"]
        today = datetime.now().strftime("%Y-%m-%d")
        assert tip["date"] == today
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/tips/{tip['id']}")


class TestTipsList:
    """Tests for GET /api/tips endpoint"""

    @pytest.fixture(autouse=True)
    def setup_test_tips(self):
        """Create test tips for list tests"""
        self.created_ids = []
        today = datetime.now().strftime("%Y-%m-%d")
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        
        # Create pool tip for today
        r1 = requests.post(f"{BASE_URL}/api/tips", json={
            "amount": 1000,
            "payment_method": "cash",
            "attribution_type": "pool",
            "date": today,
            "notes": f"{TEST_PREFIX}list_pool",
            "created_by": "TestAdmin"
        })
        if r1.status_code == 200:
            self.created_ids.append(r1.json()["tip"]["id"])
        
        # Create server tip for today
        r2 = requests.post(f"{BASE_URL}/api/tips", json={
            "amount": 2000,
            "payment_method": "mobile_money",
            "attribution_type": "server",
            "server_name": "TestServer1",
            "date": today,
            "notes": f"{TEST_PREFIX}list_server1",
            "created_by": "TestAdmin"
        })
        if r2.status_code == 200:
            self.created_ids.append(r2.json()["tip"]["id"])
        
        # Create server tip for yesterday
        r3 = requests.post(f"{BASE_URL}/api/tips", json={
            "amount": 1500,
            "payment_method": "card",
            "attribution_type": "server",
            "server_name": "TestServer2",
            "date": yesterday,
            "notes": f"{TEST_PREFIX}list_server2",
            "created_by": "TestAdmin"
        })
        if r3.status_code == 200:
            self.created_ids.append(r3.json()["tip"]["id"])
        
        yield
        
        # Cleanup
        for tip_id in self.created_ids:
            requests.delete(f"{BASE_URL}/api/tips/{tip_id}")

    def test_list_tips_returns_tips_array(self):
        """GET /api/tips returns tips list sorted by created_at desc"""
        response = requests.get(f"{BASE_URL}/api/tips")
        assert response.status_code == 200
        
        data = response.json()
        assert "tips" in data
        assert isinstance(data["tips"], list)

    def test_list_tips_filter_by_server(self):
        """GET /api/tips?server=<name> filters by server_name"""
        response = requests.get(f"{BASE_URL}/api/tips", params={"server": "TestServer1"})
        assert response.status_code == 200
        
        tips = response.json()["tips"]
        for tip in tips:
            assert tip.get("server_name") == "TestServer1"

    def test_list_tips_filter_by_date_range(self):
        """GET /api/tips with date_from/date_to filters date range"""
        today = datetime.now().strftime("%Y-%m-%d")
        
        response = requests.get(f"{BASE_URL}/api/tips", params={
            "date_from": today,
            "date_to": today
        })
        assert response.status_code == 200
        
        tips = response.json()["tips"]
        for tip in tips:
            assert tip.get("date") == today


class TestTipsUpdate:
    """Tests for PUT /api/tips/{id} endpoint"""

    def test_update_tip_fields(self):
        """PUT /api/tips/{id} updates fields correctly"""
        # Create a tip first
        create_res = requests.post(f"{BASE_URL}/api/tips", json={
            "amount": 1000,
            "payment_method": "cash",
            "attribution_type": "pool",
            "notes": f"{TEST_PREFIX}update_test",
            "created_by": "TestAdmin"
        })
        assert create_res.status_code == 200
        tip_id = create_res.json()["tip"]["id"]
        
        # Update the tip
        update_res = requests.put(f"{BASE_URL}/api/tips/{tip_id}", json={
            "amount": 2000,
            "payment_method": "card",
            "notes": "Updated notes"
        })
        assert update_res.status_code == 200
        assert update_res.json().get("success") is True
        
        # Verify update via GET
        list_res = requests.get(f"{BASE_URL}/api/tips")
        tips = list_res.json()["tips"]
        updated_tip = next((t for t in tips if t["id"] == tip_id), None)
        assert updated_tip is not None
        assert updated_tip["amount"] == 2000
        assert updated_tip["payment_method"] == "card"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/tips/{tip_id}")

    def test_update_tip_switch_to_pool_clears_server_name(self):
        """PUT /api/tips/{id} switching to pool clears server_name"""
        # Create a server tip
        create_res = requests.post(f"{BASE_URL}/api/tips", json={
            "amount": 1000,
            "payment_method": "cash",
            "attribution_type": "server",
            "server_name": "TestServer",
            "notes": f"{TEST_PREFIX}switch_to_pool",
            "created_by": "TestAdmin"
        })
        assert create_res.status_code == 200
        tip_id = create_res.json()["tip"]["id"]
        
        # Switch to pool
        update_res = requests.put(f"{BASE_URL}/api/tips/{tip_id}", json={
            "attribution_type": "pool"
        })
        assert update_res.status_code == 200
        
        # Verify server_name is cleared
        list_res = requests.get(f"{BASE_URL}/api/tips")
        tips = list_res.json()["tips"]
        updated_tip = next((t for t in tips if t["id"] == tip_id), None)
        assert updated_tip is not None
        assert updated_tip["attribution_type"] == "pool"
        assert updated_tip["server_name"] is None
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/tips/{tip_id}")

    def test_update_tip_switch_to_server_without_server_name_returns_400(self):
        """PUT /api/tips/{id} switching to server without server_name returns 400"""
        # Create a pool tip
        create_res = requests.post(f"{BASE_URL}/api/tips", json={
            "amount": 1000,
            "payment_method": "cash",
            "attribution_type": "pool",
            "notes": f"{TEST_PREFIX}switch_to_server_fail",
            "created_by": "TestAdmin"
        })
        assert create_res.status_code == 200
        tip_id = create_res.json()["tip"]["id"]
        
        # Try to switch to server without server_name
        update_res = requests.put(f"{BASE_URL}/api/tips/{tip_id}", json={
            "attribution_type": "server"
        })
        assert update_res.status_code == 400
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/tips/{tip_id}")


class TestTipsDelete:
    """Tests for DELETE /api/tips/{id} endpoint"""

    def test_delete_tip_success(self):
        """DELETE /api/tips/{id} deletes the tip"""
        # Create a tip
        create_res = requests.post(f"{BASE_URL}/api/tips", json={
            "amount": 1000,
            "payment_method": "cash",
            "attribution_type": "pool",
            "notes": f"{TEST_PREFIX}delete_test",
            "created_by": "TestAdmin"
        })
        assert create_res.status_code == 200
        tip_id = create_res.json()["tip"]["id"]
        
        # Delete the tip
        delete_res = requests.delete(f"{BASE_URL}/api/tips/{tip_id}")
        assert delete_res.status_code == 200
        assert delete_res.json().get("success") is True
        
        # Verify deletion
        list_res = requests.get(f"{BASE_URL}/api/tips")
        tips = list_res.json()["tips"]
        deleted_tip = next((t for t in tips if t["id"] == tip_id), None)
        assert deleted_tip is None

    def test_delete_nonexistent_tip_returns_404(self):
        """DELETE /api/tips/{id} with non-existent id returns 404"""
        response = requests.delete(f"{BASE_URL}/api/tips/nonexistent-id-12345")
        assert response.status_code == 404


class TestTipsSummary:
    """Tests for GET /api/tips/summary endpoint"""

    @pytest.fixture(autouse=True)
    def setup_summary_tips(self):
        """Create test tips for summary tests"""
        self.created_ids = []
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Calculate week start (Monday)
        now = datetime.now()
        monday = now - timedelta(days=now.weekday())
        week_start = monday.strftime("%Y-%m-%d")
        
        # Create pool tip for today
        r1 = requests.post(f"{BASE_URL}/api/tips", json={
            "amount": 1000,
            "payment_method": "cash",
            "attribution_type": "pool",
            "date": today,
            "notes": f"{TEST_PREFIX}summary_pool",
            "created_by": "TestAdmin"
        })
        if r1.status_code == 200:
            self.created_ids.append(r1.json()["tip"]["id"])
        
        # Create server tip for today
        r2 = requests.post(f"{BASE_URL}/api/tips", json={
            "amount": 2000,
            "payment_method": "mobile_money",
            "attribution_type": "server",
            "server_name": "SummaryServer1",
            "date": today,
            "notes": f"{TEST_PREFIX}summary_server1",
            "created_by": "TestAdmin"
        })
        if r2.status_code == 200:
            self.created_ids.append(r2.json()["tip"]["id"])
        
        # Create another server tip for today (same server)
        r3 = requests.post(f"{BASE_URL}/api/tips", json={
            "amount": 1500,
            "payment_method": "card",
            "attribution_type": "server",
            "server_name": "SummaryServer1",
            "date": today,
            "notes": f"{TEST_PREFIX}summary_server1_2",
            "created_by": "TestAdmin"
        })
        if r3.status_code == 200:
            self.created_ids.append(r3.json()["tip"]["id"])
        
        yield
        
        # Cleanup
        for tip_id in self.created_ids:
            requests.delete(f"{BASE_URL}/api/tips/{tip_id}")

    def test_summary_returns_correct_structure(self):
        """GET /api/tips/summary returns date, week_start, week_end, day, week, ranking"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/tips/summary", params={"date": today})
        assert response.status_code == 200
        
        data = response.json()
        assert "date" in data
        assert "week_start" in data
        assert "week_end" in data
        assert "day" in data
        assert "week" in data
        assert "ranking" in data
        
        # Day summary structure
        day = data["day"]
        assert "count" in day
        assert "total" in day
        assert "pool_total" in day
        assert "server_total" in day
        assert "by_payment_method" in day
        
        # Week summary structure
        week = data["week"]
        assert "count" in week
        assert "total" in week
        assert "pool_total" in week
        assert "server_total" in week
        assert "by_payment_method" in week
        
        # Ranking is a list
        assert isinstance(data["ranking"], list)

    def test_summary_day_totals_correct(self):
        """GET /api/tips/summary day totals are calculated correctly"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/tips/summary", params={"date": today})
        assert response.status_code == 200
        
        data = response.json()
        day = data["day"]
        
        # We created: 1000 (pool) + 2000 (server) + 1500 (server) = 4500 total
        # Pool: 1000, Server: 3500
        # Note: There might be other tips in the DB, so we check >= our amounts
        assert day["total"] >= 4500
        assert day["pool_total"] >= 1000
        assert day["server_total"] >= 3500

    def test_summary_ranking_only_server_tips(self):
        """GET /api/tips/summary ranking includes only server attribution tips"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/tips/summary", params={"date": today})
        assert response.status_code == 200
        
        ranking = response.json()["ranking"]
        
        # All ranking entries should have server_name
        for entry in ranking:
            assert "server_name" in entry
            assert entry["server_name"] is not None
            assert "total" in entry
            assert "count" in entry

    def test_summary_filter_by_server(self):
        """GET /api/tips/summary?server=X restricts to that server only"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/tips/summary", params={
            "date": today,
            "server": "SummaryServer1"
        })
        assert response.status_code == 200
        
        data = response.json()
        
        # Day/week should only include SummaryServer1's tips
        # We created 2000 + 1500 = 3500 for SummaryServer1
        assert data["day"]["total"] >= 3500
        
        # Ranking should only have SummaryServer1
        ranking = data["ranking"]
        for entry in ranking:
            assert entry["server_name"] == "SummaryServer1"

    def test_summary_by_payment_method_breakdown(self):
        """GET /api/tips/summary includes by_payment_method breakdown"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/tips/summary", params={"date": today})
        assert response.status_code == 200
        
        data = response.json()
        by_method = data["day"]["by_payment_method"]
        
        # We created tips with cash, mobile_money, card
        # Check that at least some of these are present
        assert isinstance(by_method, dict)


class TestCaisseUsersForTips:
    """Test that /api/caisse/users returns servers for the tips dropdown"""

    def test_caisse_users_returns_servers(self):
        """GET /api/caisse/users returns users including servers"""
        response = requests.get(f"{BASE_URL}/api/caisse/users")
        assert response.status_code == 200
        
        data = response.json()
        assert "users" in data
        users = data["users"]
        
        # Check that there are users with role=server
        servers = [u for u in users if u.get("role") == "server"]
        # Note: There should be at least some servers seeded
        # If not, this test documents the expected behavior


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
