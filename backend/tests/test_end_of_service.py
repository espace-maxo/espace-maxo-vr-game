"""
Test suite for Server End of Service Feature
- POST /api/server-end-of-service: Create end-of-service report
- GET /api/server-end-of-service-reports: Get all reports (for Manager/Admin)
- PUT /api/server-end-of-service-reports/{id}/read: Mark report as read
- PUT /api/server-end-of-service-reports/mark-all-read: Mark all reports as read
"""
import pytest
import requests
import os
from datetime import datetime

# Get BASE_URL from environment (without default)
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')
if BASE_URL:
    BASE_URL = BASE_URL.rstrip('/')


class TestEndOfServiceAPI:
    """Test End of Service Report API Endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - verify BASE_URL is available"""
        if not BASE_URL:
            pytest.skip("REACT_APP_BACKEND_URL not set")
        self.created_report_id = None
    
    def test_01_create_end_of_service_report(self):
        """Test creating an end-of-service report for a server"""
        # Test data
        report_data = {
            "server_name": "Marie Dupont",
            "server_id": "test-server-id-001",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "observation": "Test observation: Journée calme, pas de problème particulier"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/server-end-of-service",
            json=report_data
        )
        
        # Status assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data assertions
        data = response.json()
        assert data.get("success") == True, "Expected success=True"
        assert "report" in data, "Expected 'report' in response"
        
        report = data["report"]
        assert report.get("server_name") == "Marie Dupont", "Server name mismatch"
        assert report.get("observation") == report_data["observation"], "Observation mismatch"
        assert report.get("is_read") == False, "New report should be unread"
        assert "total_invoices" in report, "Expected total_invoices in report"
        assert "validated_invoices" in report, "Expected validated_invoices in report"
        assert "total_sales" in report, "Expected total_sales in report"
        
        # Save report ID for later tests
        self.__class__.created_report_id = report.get("id")
        print(f"✅ Created end-of-service report: {report['id']}")
    
    def test_02_get_all_service_reports(self):
        """Test fetching all end-of-service reports"""
        response = requests.get(f"{BASE_URL}/api/server-end-of-service-reports")
        
        # Status assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data assertions
        data = response.json()
        assert "reports" in data, "Expected 'reports' in response"
        assert "unread_count" in data, "Expected 'unread_count' in response"
        assert isinstance(data["reports"], list), "Reports should be a list"
        
        # Verify at least one report exists (from previous test)
        if len(data["reports"]) > 0:
            report = data["reports"][0]
            assert "id" in report, "Report should have 'id'"
            assert "server_name" in report, "Report should have 'server_name'"
            assert "total_invoices" in report, "Report should have 'total_invoices'"
            assert "validated_invoices" in report, "Report should have 'validated_invoices'"
            assert "total_sales" in report, "Report should have 'total_sales'"
            assert "observation" in report, "Report should have 'observation'"
            assert "is_read" in report, "Report should have 'is_read'"
            print(f"✅ Found {len(data['reports'])} report(s), unread: {data['unread_count']}")
        else:
            print("⚠️ No reports found (may be expected if DB is clean)")
    
    def test_03_get_reports_filtered_by_date(self):
        """Test fetching reports filtered by date"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(
            f"{BASE_URL}/api/server-end-of-service-reports",
            params={"date": today}
        )
        
        # Status assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Data assertions
        data = response.json()
        assert "reports" in data, "Expected 'reports' in response"
        
        # All reports should be from today
        for report in data["reports"]:
            assert report.get("date") == today, f"Report date mismatch: expected {today}, got {report.get('date')}"
        
        print(f"✅ Found {len(data['reports'])} report(s) for today ({today})")
    
    def test_04_get_unread_reports_only(self):
        """Test fetching only unread reports"""
        response = requests.get(
            f"{BASE_URL}/api/server-end-of-service-reports",
            params={"unread_only": True}
        )
        
        # Status assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Data assertions
        data = response.json()
        assert "reports" in data, "Expected 'reports' in response"
        
        # All reports should be unread
        for report in data["reports"]:
            assert report.get("is_read") == False, "Expected only unread reports"
        
        print(f"✅ Found {len(data['reports'])} unread report(s)")
    
    def test_05_mark_report_as_read(self):
        """Test marking a specific report as read"""
        # First get a report to mark
        response = requests.get(f"{BASE_URL}/api/server-end-of-service-reports")
        data = response.json()
        
        if len(data["reports"]) == 0:
            pytest.skip("No reports available to mark as read")
        
        # Find an unread report or use the first one
        report_id = None
        for report in data["reports"]:
            if not report.get("is_read"):
                report_id = report["id"]
                break
        
        if not report_id:
            report_id = data["reports"][0]["id"]
        
        # Mark as read
        response = requests.put(f"{BASE_URL}/api/server-end-of-service-reports/{report_id}/read")
        
        # Status assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data assertions
        data = response.json()
        assert data.get("success") == True, "Expected success=True"
        
        # Verify report is now read
        verify_response = requests.get(f"{BASE_URL}/api/server-end-of-service-reports")
        verify_data = verify_response.json()
        
        marked_report = next((r for r in verify_data["reports"] if r["id"] == report_id), None)
        if marked_report:
            assert marked_report.get("is_read") == True, "Report should be marked as read"
        
        print(f"✅ Marked report {report_id} as read")
    
    def test_06_mark_all_reports_read(self):
        """Test marking all reports as read"""
        response = requests.put(f"{BASE_URL}/api/server-end-of-service-reports/mark-all-read")
        
        # Status assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data assertions
        data = response.json()
        assert data.get("success") == True, "Expected success=True"
        
        # Verify all reports are now read
        verify_response = requests.get(f"{BASE_URL}/api/server-end-of-service-reports")
        verify_data = verify_response.json()
        
        assert verify_data.get("unread_count") == 0, "Expected unread_count to be 0"
        
        for report in verify_data["reports"]:
            assert report.get("is_read") == True, "All reports should be marked as read"
        
        print(f"✅ All reports marked as read (count: {data.get('count', 'N/A')})")
    
    def test_07_report_contains_stats(self):
        """Test that created reports contain proper statistics"""
        # Create a new report
        report_data = {
            "server_name": "Test Server Stats",
            "server_id": "test-stats-server",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "observation": "Testing stats collection"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/server-end-of-service",
            json=report_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        report = data.get("report", {})
        
        # Verify all required statistics fields
        assert "total_invoices" in report, "Missing total_invoices"
        assert "validated_invoices" in report, "Missing validated_invoices"
        assert "pending_invoices" in report, "Missing pending_invoices"
        assert "total_sales" in report, "Missing total_sales"
        
        # Types should be correct
        assert isinstance(report["total_invoices"], int), "total_invoices should be int"
        assert isinstance(report["validated_invoices"], int), "validated_invoices should be int"
        assert isinstance(report["pending_invoices"], int), "pending_invoices should be int"
        assert isinstance(report["total_sales"], (int, float)), "total_sales should be numeric"
        
        print(f"✅ Report stats verified: {report['total_invoices']} invoices, {report['validated_invoices']} validated, {report['total_sales']} FCFA")


class TestEndOfServiceIntegration:
    """Integration tests for End of Service feature"""
    
    def test_full_workflow(self):
        """Test complete workflow: Server sends report -> Manager sees it -> Mark as read"""
        if not BASE_URL:
            pytest.skip("REACT_APP_BACKEND_URL not set")
        
        # Step 1: Server creates end-of-service report
        report_data = {
            "server_name": "Marie Dupont",
            "server_id": "server-marie-001",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "observation": "Workflow test: Journée calme, tous les clients satisfaits"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/server-end-of-service",
            json=report_data
        )
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        
        created_report = create_response.json().get("report", {})
        report_id = created_report.get("id")
        print(f"Step 1: Server sent report - ID: {report_id}")
        
        # Step 2: Manager fetches reports (should see unread count)
        get_response = requests.get(f"{BASE_URL}/api/server-end-of-service-reports")
        assert get_response.status_code == 200
        
        reports_data = get_response.json()
        assert reports_data.get("unread_count", 0) >= 1, "Expected at least 1 unread report"
        print(f"Step 2: Manager sees {reports_data['unread_count']} unread report(s)")
        
        # Step 3: Manager views report details (report should contain all info)
        found_report = next((r for r in reports_data["reports"] if r["id"] == report_id), None)
        assert found_report is not None, "Created report should be in the list"
        assert found_report["server_name"] == "Marie Dupont", "Server name mismatch"
        assert found_report["observation"] == report_data["observation"], "Observation mismatch"
        print(f"Step 3: Report contains correct server name and observation")
        
        # Step 4: Manager marks report as read
        read_response = requests.put(f"{BASE_URL}/api/server-end-of-service-reports/{report_id}/read")
        assert read_response.status_code == 200, f"Mark read failed: {read_response.text}"
        print(f"Step 4: Manager marked report as read")
        
        # Step 5: Verify report is now read
        verify_response = requests.get(f"{BASE_URL}/api/server-end-of-service-reports")
        verify_data = verify_response.json()
        
        verified_report = next((r for r in verify_data["reports"] if r["id"] == report_id), None)
        assert verified_report is not None, "Report should still exist"
        assert verified_report.get("is_read") == True, "Report should be marked as read"
        print(f"Step 5: Verified report is now marked as read")
        
        print("✅ Full workflow test passed!")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
