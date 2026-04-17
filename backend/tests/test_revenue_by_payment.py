"""
Test suite for revenue-by-payment endpoint and its consistency with weekly report.
Tests the P0 bug fix: assigned_week field must be respected in revenue calculations.
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestRevenueByPaymentEndpoint:
    """Test GET /api/reports/revenue-by-payment endpoint"""
    
    def test_revenue_by_payment_returns_200(self):
        """Basic endpoint availability test"""
        response = requests.get(f"{BASE_URL}/api/reports/revenue-by-payment")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "total" in data, "Response should contain 'total'"
        assert "by_method" in data, "Response should contain 'by_method'"
        assert "count" in data, "Response should contain 'count'"
        print(f"✅ revenue-by-payment returns 200 with total={data['total']}, count={data['count']}")
    
    def test_revenue_by_payment_with_week_start(self):
        """Test with explicit week_start parameter"""
        # Get current week's Monday
        today = datetime.now()
        monday = today - timedelta(days=today.weekday())
        week_start = monday.strftime("%Y-%m-%d")
        
        response = requests.get(f"{BASE_URL}/api/reports/revenue-by-payment", params={"week_start": week_start})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("period_start") == week_start, f"period_start should be {week_start}"
        print(f"✅ revenue-by-payment with week_start={week_start}: total={data['total']}")
    
    def test_revenue_by_payment_with_date(self):
        """Test with single date parameter"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/reports/revenue-by-payment", params={"date": today})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("period_start") == today, f"period_start should be {today}"
        print(f"✅ revenue-by-payment with date={today}: total={data['total']}")
    
    def test_payment_method_normalization(self):
        """Test that payment methods are normalized correctly"""
        response = requests.get(f"{BASE_URL}/api/reports/revenue-by-payment")
        assert response.status_code == 200
        data = response.json()
        by_method = data.get("by_method", {})
        
        # Check expected normalized keys exist
        expected_keys = ["cash", "mobile", "cheque", "wallet"]
        for key in expected_keys:
            assert key in by_method, f"by_method should contain '{key}'"
        
        # Verify no raw variants exist
        raw_variants = ["mobile_money", "especes", "espèces", "bon-client", "credit"]
        for variant in raw_variants:
            assert variant not in by_method, f"Raw variant '{variant}' should be normalized"
        
        print(f"✅ Payment methods normalized correctly: {list(by_method.keys())}")


class TestWeeklyReportEndpoint:
    """Test GET /api/reports/weekly endpoint"""
    
    def test_weekly_report_returns_200(self):
        """Basic endpoint availability test"""
        response = requests.get(f"{BASE_URL}/api/reports/weekly")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "sales" in data, "Response should contain 'sales'"
        assert "daily" in data, "Response should contain 'daily'"
        sales_total = data.get("sales", {}).get("total", 0)
        print(f"✅ weekly report returns 200 with sales.total={sales_total}")
    
    def test_weekly_report_with_week_start(self):
        """Test with explicit week_start parameter"""
        today = datetime.now()
        monday = today - timedelta(days=today.weekday())
        week_start = monday.strftime("%Y-%m-%d")
        
        response = requests.get(f"{BASE_URL}/api/reports/weekly", params={"week_start": week_start})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("week_start") == week_start, f"week_start should be {week_start}"
        sales_total = data.get("sales", {}).get("total", 0)
        print(f"✅ weekly report with week_start={week_start}: sales.total={sales_total}")


class TestRevenueConsistency:
    """Test that revenue-by-payment totals match weekly report totals (P0 bug fix)"""
    
    def test_weekly_totals_match(self):
        """CRITICAL: revenue-by-payment total must equal weekly report sales.total for same week"""
        today = datetime.now()
        monday = today - timedelta(days=today.weekday())
        week_start = monday.strftime("%Y-%m-%d")
        
        # Get revenue-by-payment
        rbp_response = requests.get(f"{BASE_URL}/api/reports/revenue-by-payment", params={"week_start": week_start})
        assert rbp_response.status_code == 200, f"revenue-by-payment failed: {rbp_response.text}"
        rbp_data = rbp_response.json()
        
        # Get weekly report
        weekly_response = requests.get(f"{BASE_URL}/api/reports/weekly", params={"week_start": week_start})
        assert weekly_response.status_code == 200, f"weekly report failed: {weekly_response.text}"
        weekly_data = weekly_response.json()
        
        rbp_total = rbp_data.get("total", 0)
        weekly_total = weekly_data.get("sales", {}).get("total", 0)
        
        print(f"revenue-by-payment total: {rbp_total}")
        print(f"weekly report sales.total: {weekly_total}")
        
        assert rbp_total == weekly_total, f"MISMATCH! revenue-by-payment ({rbp_total}) != weekly ({weekly_total})"
        print(f"✅ Totals match for week {week_start}: {rbp_total} F")
    
    def test_previous_week_totals_match(self):
        """Test consistency for previous week as well"""
        today = datetime.now()
        monday = today - timedelta(days=today.weekday())
        prev_monday = monday - timedelta(days=7)
        week_start = prev_monday.strftime("%Y-%m-%d")
        
        rbp_response = requests.get(f"{BASE_URL}/api/reports/revenue-by-payment", params={"week_start": week_start})
        assert rbp_response.status_code == 200
        rbp_data = rbp_response.json()
        
        weekly_response = requests.get(f"{BASE_URL}/api/reports/weekly", params={"week_start": week_start})
        assert weekly_response.status_code == 200
        weekly_data = weekly_response.json()
        
        rbp_total = rbp_data.get("total", 0)
        weekly_total = weekly_data.get("sales", {}).get("total", 0)
        
        print(f"Previous week {week_start}:")
        print(f"  revenue-by-payment total: {rbp_total}")
        print(f"  weekly report sales.total: {weekly_total}")
        
        assert rbp_total == weekly_total, f"MISMATCH for prev week! ({rbp_total}) != ({weekly_total})"
        print(f"✅ Previous week totals match: {rbp_total} F")


class TestAssignedWeekBehavior:
    """Test that assigned_week field is properly respected"""
    
    @pytest.fixture
    def test_invoice_id(self):
        """Get a validated invoice ID for testing"""
        # Get invoices list
        response = requests.get(f"{BASE_URL}/api/invoices", params={"validation_status": "validated", "limit": 5})
        if response.status_code != 200:
            pytest.skip("Cannot fetch invoices")
        
        data = response.json()
        # Handle both list and dict responses
        invoices = data.get("invoices", []) if isinstance(data, dict) else data
        if not invoices:
            pytest.skip("No validated invoices available for testing")
        
        inv = invoices[0]
        return inv.get("id"), inv.get("total", 0), inv.get("created_at", "")[:10]
    
    def test_assign_week_endpoint_exists(self):
        """Test that assign-week endpoint exists"""
        # Just check the endpoint pattern exists (we'll test with actual data separately)
        response = requests.put(f"{BASE_URL}/api/invoices/nonexistent-id/assign-week", json={"week_start": "2026-01-06"})
        # Should return 404 for nonexistent invoice, not 405 (method not allowed)
        assert response.status_code in [404, 400, 500], f"Unexpected status: {response.status_code}"
        print(f"✅ assign-week endpoint exists (returned {response.status_code} for nonexistent ID)")
    
    def test_unassign_week_bulk_endpoint_exists(self):
        """Test that unassign-week-bulk endpoint exists"""
        response = requests.post(f"{BASE_URL}/api/invoices/unassign-week-bulk", json={"ids": []})
        # Should return 200 with empty list
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✅ unassign-week-bulk endpoint exists and works with empty list")
    
    def test_assign_and_verify_exclusion(self, test_invoice_id):
        """Test that assigning invoice to different week excludes it from original week"""
        invoice_id, invoice_total, original_date = test_invoice_id
        
        # Calculate original week and a different target week
        original_dt = datetime.fromisoformat(original_date)
        original_monday = (original_dt - timedelta(days=original_dt.weekday())).strftime("%Y-%m-%d")
        
        # Target week: 2 weeks before original
        target_monday = (datetime.fromisoformat(original_monday) - timedelta(days=14)).strftime("%Y-%m-%d")
        
        # Get original week total BEFORE assignment
        rbp_before = requests.get(f"{BASE_URL}/api/reports/revenue-by-payment", params={"week_start": original_monday})
        assert rbp_before.status_code == 200
        total_before = rbp_before.json().get("total", 0)
        
        # Assign invoice to different week
        assign_response = requests.put(
            f"{BASE_URL}/api/invoices/{invoice_id}/assign-week",
            json={"week_start": target_monday}
        )
        assert assign_response.status_code == 200, f"Assign failed: {assign_response.text}"
        print(f"Assigned invoice {invoice_id} (total={invoice_total}) to week {target_monday}")
        
        # Get original week total AFTER assignment
        rbp_after = requests.get(f"{BASE_URL}/api/reports/revenue-by-payment", params={"week_start": original_monday})
        assert rbp_after.status_code == 200
        total_after = rbp_after.json().get("total", 0)
        
        # Get target week total
        rbp_target = requests.get(f"{BASE_URL}/api/reports/revenue-by-payment", params={"week_start": target_monday})
        assert rbp_target.status_code == 200
        target_total = rbp_target.json().get("total", 0)
        
        print(f"Original week {original_monday}: before={total_before}, after={total_after}")
        print(f"Target week {target_monday}: total={target_total}")
        
        # Verify invoice was excluded from original week
        expected_after = total_before - invoice_total
        assert total_after == expected_after, f"Invoice not excluded! Expected {expected_after}, got {total_after}"
        
        # Verify invoice is included in target week
        assert target_total >= invoice_total, f"Invoice not included in target week!"
        
        # CLEANUP: Restore original state
        unassign_response = requests.post(
            f"{BASE_URL}/api/invoices/unassign-week-bulk",
            json={"ids": [invoice_id]}
        )
        assert unassign_response.status_code == 200, f"Unassign failed: {unassign_response.text}"
        print(f"✅ Restored invoice {invoice_id} to original week")
        
        # Verify restoration
        rbp_restored = requests.get(f"{BASE_URL}/api/reports/revenue-by-payment", params={"week_start": original_monday})
        restored_total = rbp_restored.json().get("total", 0)
        assert restored_total == total_before, f"Restoration failed! Expected {total_before}, got {restored_total}"
        print(f"✅ assigned_week behavior verified correctly")


class TestDailyModeConsistency:
    """Test daily mode consistency"""
    
    def test_daily_revenue_by_payment(self):
        """Test revenue-by-payment in daily mode"""
        today = datetime.now().strftime("%Y-%m-%d")
        
        response = requests.get(f"{BASE_URL}/api/reports/revenue-by-payment", params={"date": today})
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("period_start") == today
        print(f"✅ Daily mode works: date={today}, total={data.get('total', 0)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
