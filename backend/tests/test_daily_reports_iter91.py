"""
Test Daily Reports Feature (Iteration 91)

Tests for the daily_reports endpoints:
- POST /api/daily-reports/draft - Create/retrieve draft with auto_summary
- POST /api/daily-reports/{id}/observations - Update observations (draft only)
- POST /api/daily-reports/{id}/submit - Submit report (locks it)
- GET /api/daily-reports - List reports (admin sees all, others see own)
- GET /api/daily-reports/{id} - Detail with comparison to system sales

Roles tested: cuisinier, coach_jeux, admin
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Generate unique suffix for test actor names to avoid conflicts with existing data
TEST_SUFFIX = str(uuid.uuid4())[:8]

class TestDailyReportsDraft:
    """Tests for POST /api/daily-reports/draft endpoint"""
    
    def test_create_cuisine_draft_success(self):
        """Cuisinier can create/retrieve a cuisine draft with auto_summary"""
        response = requests.post(f"{BASE_URL}/api/daily-reports/draft", json={
            "kind": "cuisine",
            "actor_name": "Test Cuisinier",
            "actor_role": "cuisinier"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "report" in data
        report = data["report"]
        assert report["kind"] == "cuisine"
        assert report["actor_name"] == "Test Cuisinier"
        assert report["status"] == "draft"
        assert "auto_summary" in report
        # Cuisine auto_summary should have items, total_quantity, items_count, scans_count
        summary = report["auto_summary"]
        assert "items" in summary
        assert "total_quantity" in summary
        assert "items_count" in summary
        assert "scans_count" in summary
        # No MongoDB _id exposed
        assert "_id" not in report
        print(f"✓ Cuisine draft created: id={report['id']}, items_count={summary.get('items_count', 0)}")
        return report
    
    def test_create_coach_jeux_draft_success(self):
        """Coach jeux can create/retrieve a coach_jeux draft with auto_summary"""
        response = requests.post(f"{BASE_URL}/api/daily-reports/draft", json={
            "kind": "coach_jeux",
            "actor_name": "TEST_Coach_Jeux_Draft",
            "actor_role": "coach_jeux"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "report" in data
        report = data["report"]
        assert report["kind"] == "coach_jeux"
        assert report["actor_name"] == "TEST_Coach_Jeux_Draft"
        # Status could be draft or submitted if already exists
        assert report["status"] in ("draft", "submitted")
        assert "auto_summary" in report
        # Coach auto_summary should have items, bons_total, total_quantity, total_revenue
        summary = report["auto_summary"]
        assert "items" in summary
        assert "bons_total" in summary
        assert "total_quantity" in summary
        assert "total_revenue" in summary
        # No MongoDB _id exposed
        assert "_id" not in report
        print(f"✓ Coach draft created: id={report['id']}, bons_total={summary.get('bons_total', 0)}")
        return report
    
    def test_draft_invalid_kind_returns_400(self):
        """Invalid kind should return 400"""
        response = requests.post(f"{BASE_URL}/api/daily-reports/draft", json={
            "kind": "invalid_kind",
            "actor_name": "Test User",
            "actor_role": "cuisinier"
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("✓ Invalid kind returns 400")
    
    def test_draft_server_role_returns_403(self):
        """Server role should return 403 (not allowed)"""
        response = requests.post(f"{BASE_URL}/api/daily-reports/draft", json={
            "kind": "cuisine",
            "actor_name": "Test Server",
            "actor_role": "server"
        })
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("✓ Server role returns 403")
    
    def test_draft_idempotence_same_date_kind_actor(self):
        """Second call for same date+kind+actor_name returns same draft (refreshed auto_summary)"""
        # First call
        response1 = requests.post(f"{BASE_URL}/api/daily-reports/draft", json={
            "kind": "cuisine",
            "actor_name": "TEST_Idempotent_Cuisinier",
            "actor_role": "cuisinier"
        })
        assert response1.status_code == 200
        report1 = response1.json()["report"]
        
        # Second call - should return same report
        response2 = requests.post(f"{BASE_URL}/api/daily-reports/draft", json={
            "kind": "cuisine",
            "actor_name": "TEST_Idempotent_Cuisinier",
            "actor_role": "cuisinier"
        })
        assert response2.status_code == 200
        report2 = response2.json()["report"]
        
        # Same report ID
        assert report1["id"] == report2["id"], "Expected same report ID for idempotent call"
        print(f"✓ Idempotent draft: same id={report1['id']}")


class TestDailyReportsObservations:
    """Tests for POST /api/daily-reports/{id}/observations endpoint"""
    
    def test_save_observations_on_draft(self):
        """Can save observations on a draft report"""
        # Create draft first
        draft_resp = requests.post(f"{BASE_URL}/api/daily-reports/draft", json={
            "kind": "cuisine",
            "actor_name": "TEST_Obs_Cuisinier",
            "actor_role": "cuisinier"
        })
        assert draft_resp.status_code == 200
        report = draft_resp.json()["report"]
        report_id = report["id"]
        
        # Save observations
        obs_resp = requests.post(f"{BASE_URL}/api/daily-reports/{report_id}/observations", json={
            "observations": "Test observations - tout va bien aujourd'hui",
            "actor_name": "TEST_Obs_Cuisinier",
            "actor_role": "cuisinier"
        })
        assert obs_resp.status_code == 200, f"Expected 200, got {obs_resp.status_code}: {obs_resp.text}"
        data = obs_resp.json()
        assert data.get("success") == True
        print(f"✓ Observations saved on draft {report_id}")
        return report_id
    
    def test_observations_different_actor_returns_403(self):
        """Different actor (not admin) cannot update observations"""
        # Create draft
        draft_resp = requests.post(f"{BASE_URL}/api/daily-reports/draft", json={
            "kind": "cuisine",
            "actor_name": "TEST_Obs_Owner",
            "actor_role": "cuisinier"
        })
        assert draft_resp.status_code == 200
        report_id = draft_resp.json()["report"]["id"]
        
        # Try to update with different actor
        obs_resp = requests.post(f"{BASE_URL}/api/daily-reports/{report_id}/observations", json={
            "observations": "Trying to update someone else's report",
            "actor_name": "Different_Person",
            "actor_role": "cuisinier"
        })
        assert obs_resp.status_code == 403, f"Expected 403, got {obs_resp.status_code}: {obs_resp.text}"
        print("✓ Different actor returns 403 for observations")


class TestDailyReportsSubmit:
    """Tests for POST /api/daily-reports/{id}/submit endpoint"""
    
    def test_submit_report_success(self):
        """Can submit a draft report - status becomes submitted"""
        # Create draft with unique actor name
        actor_name = f"TEST_Submit_Coach_{TEST_SUFFIX}"
        draft_resp = requests.post(f"{BASE_URL}/api/daily-reports/draft", json={
            "kind": "coach_jeux",
            "actor_name": actor_name,
            "actor_role": "coach_jeux"
        })
        assert draft_resp.status_code == 200
        report = draft_resp.json()["report"]
        report_id = report["id"]
        
        # Submit
        submit_resp = requests.post(f"{BASE_URL}/api/daily-reports/{report_id}/submit", json={
            "actor_name": actor_name,
            "actor_role": "coach_jeux"
        })
        assert submit_resp.status_code == 200, f"Expected 200, got {submit_resp.status_code}: {submit_resp.text}"
        data = submit_resp.json()
        assert data.get("success") == True
        assert "submitted_at" in data
        print(f"✓ Report submitted: {report_id}, submitted_at={data['submitted_at']}")
        return report_id
    
    def test_submit_twice_returns_400(self):
        """Submitting an already submitted report returns 400"""
        # Create and submit with unique actor name
        actor_name = f"TEST_DoubleSubmit_{TEST_SUFFIX}"
        draft_resp = requests.post(f"{BASE_URL}/api/daily-reports/draft", json={
            "kind": "cuisine",
            "actor_name": actor_name,
            "actor_role": "cuisinier"
        })
        assert draft_resp.status_code == 200
        report_id = draft_resp.json()["report"]["id"]
        
        # First submit
        submit1 = requests.post(f"{BASE_URL}/api/daily-reports/{report_id}/submit", json={
            "actor_name": actor_name,
            "actor_role": "cuisinier"
        })
        assert submit1.status_code == 200
        
        # Second submit - should fail
        submit2 = requests.post(f"{BASE_URL}/api/daily-reports/{report_id}/submit", json={
            "actor_name": actor_name,
            "actor_role": "cuisinier"
        })
        assert submit2.status_code == 400, f"Expected 400, got {submit2.status_code}: {submit2.text}"
        print("✓ Double submit returns 400")
    
    def test_observations_on_submitted_returns_400(self):
        """Cannot update observations on a submitted report"""
        # Create and submit with unique actor name
        actor_name = f"TEST_ObsAfterSubmit_{TEST_SUFFIX}"
        draft_resp = requests.post(f"{BASE_URL}/api/daily-reports/draft", json={
            "kind": "cuisine",
            "actor_name": actor_name,
            "actor_role": "cuisinier"
        })
        assert draft_resp.status_code == 200
        report_id = draft_resp.json()["report"]["id"]
        
        # Submit
        submit_resp = requests.post(f"{BASE_URL}/api/daily-reports/{report_id}/submit", json={
            "actor_name": actor_name,
            "actor_role": "cuisinier"
        })
        assert submit_resp.status_code == 200
        
        # Try to update observations
        obs_resp = requests.post(f"{BASE_URL}/api/daily-reports/{report_id}/observations", json={
            "observations": "Trying to update after submit",
            "actor_name": actor_name,
            "actor_role": "cuisinier"
        })
        assert obs_resp.status_code == 400, f"Expected 400, got {obs_resp.status_code}: {obs_resp.text}"
        print("✓ Observations on submitted report returns 400")


class TestDailyReportsList:
    """Tests for GET /api/daily-reports endpoint"""
    
    def test_admin_sees_all_reports(self):
        """Admin can see all reports"""
        response = requests.get(f"{BASE_URL}/api/daily-reports", params={
            "actor_role": "admin"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "reports" in data
        assert "total" in data
        # No MongoDB _id exposed in any report
        for report in data["reports"]:
            assert "_id" not in report
        print(f"✓ Admin sees {data['total']} reports")
    
    def test_cuisinier_sees_only_own_reports(self):
        """Cuisinier can only see their own reports"""
        response = requests.get(f"{BASE_URL}/api/daily-reports", params={
            "actor_role": "cuisinier",
            "actor_name": "TEST_Cuisinier_List"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "reports" in data
        # All reports should belong to this actor
        for report in data["reports"]:
            assert report["actor_name"] == "TEST_Cuisinier_List" or data["total"] == 0
        print(f"✓ Cuisinier sees only own reports: {data['total']}")
    
    def test_admin_filter_by_kind_date_status(self):
        """Admin can filter by kind, date, status"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/daily-reports", params={
            "actor_role": "admin",
            "kind": "cuisine",
            "date": today,
            "status": "submitted"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "reports" in data
        # All returned reports should match filters
        for report in data["reports"]:
            assert report["kind"] == "cuisine"
            assert report["date"] == today
            assert report["status"] == "submitted"
        print(f"✓ Admin filter works: {data['total']} cuisine/submitted reports for {today}")


class TestDailyReportsDetail:
    """Tests for GET /api/daily-reports/{id} endpoint with comparison"""
    
    def test_admin_gets_detail_with_comparison(self):
        """Admin can get report detail with comparison to system sales"""
        # First create and submit a report with unique actor name
        actor_name = f"TEST_Detail_Coach_{TEST_SUFFIX}"
        draft_resp = requests.post(f"{BASE_URL}/api/daily-reports/draft", json={
            "kind": "coach_jeux",
            "actor_name": actor_name,
            "actor_role": "coach_jeux"
        })
        assert draft_resp.status_code == 200
        report_id = draft_resp.json()["report"]["id"]
        
        # Submit it
        submit_resp = requests.post(f"{BASE_URL}/api/daily-reports/{report_id}/submit", json={
            "actor_name": actor_name,
            "actor_role": "coach_jeux"
        })
        assert submit_resp.status_code == 200
        
        # Get detail as admin
        detail_resp = requests.get(f"{BASE_URL}/api/daily-reports/{report_id}", params={
            "actor_role": "admin"
        })
        assert detail_resp.status_code == 200, f"Expected 200, got {detail_resp.status_code}: {detail_resp.text}"
        data = detail_resp.json()
        
        # Should have report and comparison
        assert "report" in data
        assert "comparison" in data
        
        report = data["report"]
        comparison = data["comparison"]
        
        # Report should not expose _id
        assert "_id" not in report
        
        # Comparison should have expected fields
        assert "rows" in comparison
        assert "total_declared_qty" in comparison
        assert "total_system_qty" in comparison
        assert "total_declared_revenue" in comparison
        assert "total_system_revenue" in comparison
        assert "global_gap" in comparison
        assert "alerts_count" in comparison
        
        print(f"✓ Detail with comparison: declared_qty={comparison['total_declared_qty']}, system_qty={comparison['total_system_qty']}, alerts={comparison['alerts_count']}")
        
        # Check comparison rows have correct status values
        valid_statuses = {"ok", "over_declared", "under_declared", "missing_in_system", "missing_in_declaration"}
        for row in comparison["rows"]:
            assert row["status"] in valid_statuses, f"Invalid status: {row['status']}"
        
        return report_id


class TestDailyReportsSecurityNoMongoId:
    """Security tests - ensure no MongoDB _id is exposed"""
    
    def test_draft_no_mongo_id(self):
        """Draft response should not contain _id"""
        response = requests.post(f"{BASE_URL}/api/daily-reports/draft", json={
            "kind": "cuisine",
            "actor_name": "TEST_Security_Cuisinier",
            "actor_role": "cuisinier"
        })
        assert response.status_code == 200
        report = response.json()["report"]
        assert "_id" not in report, "MongoDB _id should not be exposed in draft response"
        print("✓ No _id in draft response")
    
    def test_list_no_mongo_id(self):
        """List response should not contain _id in any report"""
        response = requests.get(f"{BASE_URL}/api/daily-reports", params={
            "actor_role": "admin"
        })
        assert response.status_code == 200
        for report in response.json()["reports"]:
            assert "_id" not in report, "MongoDB _id should not be exposed in list response"
        print("✓ No _id in list response")
    
    def test_detail_no_mongo_id(self):
        """Detail response should not contain _id"""
        # Create a report first
        draft_resp = requests.post(f"{BASE_URL}/api/daily-reports/draft", json={
            "kind": "cuisine",
            "actor_name": "TEST_Security_Detail",
            "actor_role": "cuisinier"
        })
        assert draft_resp.status_code == 200
        report_id = draft_resp.json()["report"]["id"]
        
        # Get detail
        detail_resp = requests.get(f"{BASE_URL}/api/daily-reports/{report_id}", params={
            "actor_role": "admin"
        })
        assert detail_resp.status_code == 200
        report = detail_resp.json()["report"]
        assert "_id" not in report, "MongoDB _id should not be exposed in detail response"
        print("✓ No _id in detail response")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
