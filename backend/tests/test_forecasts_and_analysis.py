"""
Test suite for Forecasts and Expense Analysis features.

Tests:
- CRUD operations for forecasts
- Dashboard with treasury calculation
- Recurrence expansion (weekly/monthly)
- Missing amount calculation
- Expense analysis (duplicates, stock matches, treasury impact)
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestForecastsCRUD:
    """Test CRUD operations for forecasts"""
    
    created_forecast_ids = []
    
    def test_list_forecasts(self):
        """GET /api/forecasts returns list of forecasts"""
        response = requests.get(f"{BASE_URL}/api/forecasts")
        assert response.status_code == 200
        data = response.json()
        assert "forecasts" in data
        assert isinstance(data["forecasts"], list)
        print(f"✅ GET /api/forecasts - Found {len(data['forecasts'])} forecasts")
    
    def test_create_forecast_basic(self):
        """POST /api/forecasts creates a new forecast"""
        payload = {
            "date": "2026-05-15",
            "label": "TEST_Forecast_Basic",
            "amount": 50000,
            "category": "autre",
            "status": "prevu",
            "recurrence": "none",
            "notes": "Test forecast"
        }
        response = requests.post(f"{BASE_URL}/api/forecasts", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert "forecast" in data
        assert data["forecast"]["label"] == "TEST_Forecast_Basic"
        assert data["forecast"]["amount"] == 50000
        assert data["forecast"]["category"] == "autre"
        self.created_forecast_ids.append(data["forecast"]["id"])
        print(f"✅ POST /api/forecasts - Created forecast: {data['forecast']['id']}")
    
    def test_create_forecast_with_recurrence_weekly(self):
        """POST /api/forecasts with weekly recurrence"""
        payload = {
            "date": "2026-04-20",
            "label": "TEST_Weekly_Forecast",
            "amount": 25000,
            "category": "charges",
            "status": "prevu",
            "recurrence": "weekly",
            "notes": "Weekly test"
        }
        response = requests.post(f"{BASE_URL}/api/forecasts", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["forecast"]["recurrence"] == "weekly"
        self.created_forecast_ids.append(data["forecast"]["id"])
        print(f"✅ POST /api/forecasts - Created weekly forecast: {data['forecast']['id']}")
    
    def test_create_forecast_with_recurrence_monthly(self):
        """POST /api/forecasts with monthly recurrence"""
        payload = {
            "date": "2026-04-15",
            "label": "TEST_Monthly_Forecast",
            "amount": 100000,
            "category": "salaires",
            "status": "prevu",
            "recurrence": "monthly",
            "recurrence_day": 15,
            "notes": "Monthly salary test"
        }
        response = requests.post(f"{BASE_URL}/api/forecasts", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["forecast"]["recurrence"] == "monthly"
        assert data["forecast"]["recurrence_day"] == 15
        self.created_forecast_ids.append(data["forecast"]["id"])
        print(f"✅ POST /api/forecasts - Created monthly forecast: {data['forecast']['id']}")
    
    def test_create_forecast_invalid_category_defaults_to_autre(self):
        """POST /api/forecasts with invalid category defaults to 'autre'"""
        payload = {
            "date": "2026-05-20",
            "label": "TEST_Invalid_Category",
            "amount": 10000,
            "category": "invalid_category",
            "status": "prevu",
            "recurrence": "none"
        }
        response = requests.post(f"{BASE_URL}/api/forecasts", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["forecast"]["category"] == "autre"
        self.created_forecast_ids.append(data["forecast"]["id"])
        print("✅ POST /api/forecasts - Invalid category defaults to 'autre'")
    
    def test_update_forecast(self):
        """PUT /api/forecasts/{id} updates forecast"""
        # First create a forecast
        payload = {
            "date": "2026-05-25",
            "label": "TEST_Update_Forecast",
            "amount": 30000,
            "category": "loyer",
            "status": "prevu",
            "recurrence": "none"
        }
        create_res = requests.post(f"{BASE_URL}/api/forecasts", json=payload)
        assert create_res.status_code == 200
        forecast_id = create_res.json()["forecast"]["id"]
        self.created_forecast_ids.append(forecast_id)
        
        # Update it
        update_payload = {
            "label": "TEST_Updated_Forecast",
            "amount": 35000,
            "status": "paye"
        }
        update_res = requests.put(f"{BASE_URL}/api/forecasts/{forecast_id}", json=update_payload)
        assert update_res.status_code == 200
        assert update_res.json()["success"] == True
        print(f"✅ PUT /api/forecasts/{forecast_id} - Updated forecast")
    
    def test_update_forecast_not_found(self):
        """PUT /api/forecasts/{id} returns 404 for non-existent forecast"""
        update_payload = {"label": "Test"}
        response = requests.put(f"{BASE_URL}/api/forecasts/non-existent-id", json=update_payload)
        assert response.status_code == 404
        print("✅ PUT /api/forecasts/non-existent-id - Returns 404")
    
    def test_delete_forecast(self):
        """DELETE /api/forecasts/{id} deletes forecast"""
        # Create a forecast to delete
        payload = {
            "date": "2026-06-01",
            "label": "TEST_Delete_Forecast",
            "amount": 5000,
            "category": "autre",
            "status": "prevu",
            "recurrence": "none"
        }
        create_res = requests.post(f"{BASE_URL}/api/forecasts", json=payload)
        assert create_res.status_code == 200
        forecast_id = create_res.json()["forecast"]["id"]
        
        # Delete it
        delete_res = requests.delete(f"{BASE_URL}/api/forecasts/{forecast_id}")
        assert delete_res.status_code == 200
        assert delete_res.json()["success"] == True
        print(f"✅ DELETE /api/forecasts/{forecast_id} - Deleted forecast")
    
    def test_delete_forecast_not_found(self):
        """DELETE /api/forecasts/{id} returns 404 for non-existent forecast"""
        response = requests.delete(f"{BASE_URL}/api/forecasts/non-existent-id")
        assert response.status_code == 404
        print("✅ DELETE /api/forecasts/non-existent-id - Returns 404")


class TestForecastsDashboard:
    """Test forecasts dashboard endpoint"""
    
    def test_dashboard_basic(self):
        """GET /api/forecasts/dashboard returns dashboard data"""
        response = requests.get(f"{BASE_URL}/api/forecasts/dashboard")
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields
        assert "treasury" in data
        assert "available_now" in data
        assert "horizon_days" in data
        assert "per_day" in data
        assert "totals" in data
        assert "min_running_balance" in data
        assert "missing_amount" in data
        
        # Check treasury structure
        assert "week_start" in data["treasury"]
        assert "weekly_ca" in data["treasury"]
        assert "weekly_expenses" in data["treasury"]
        assert "available" in data["treasury"]
        
        # Check totals structure
        assert "total_decaissements" in data["totals"]
        assert "by_category" in data["totals"]
        
        print(f"✅ GET /api/forecasts/dashboard - Treasury: {data['available_now']} F, Missing: {data['missing_amount']} F")
    
    def test_dashboard_with_horizon_7_days(self):
        """GET /api/forecasts/dashboard?horizon_days=7 returns 7-day horizon"""
        response = requests.get(f"{BASE_URL}/api/forecasts/dashboard", params={"horizon_days": 7})
        assert response.status_code == 200
        data = response.json()
        assert data["horizon_days"] == 7
        assert len(data["per_day"]) == 8  # 7 days + today
        print("✅ GET /api/forecasts/dashboard?horizon_days=7 - Returns 7-day horizon")
    
    def test_dashboard_with_horizon_60_days(self):
        """GET /api/forecasts/dashboard?horizon_days=60 returns 60-day horizon"""
        response = requests.get(f"{BASE_URL}/api/forecasts/dashboard", params={"horizon_days": 60})
        assert response.status_code == 200
        data = response.json()
        assert data["horizon_days"] == 60
        assert len(data["per_day"]) == 61  # 60 days + today
        print("✅ GET /api/forecasts/dashboard?horizon_days=60 - Returns 60-day horizon")
    
    def test_dashboard_per_day_structure(self):
        """GET /api/forecasts/dashboard per_day has correct structure"""
        response = requests.get(f"{BASE_URL}/api/forecasts/dashboard", params={"horizon_days": 30})
        assert response.status_code == 200
        data = response.json()
        
        for day in data["per_day"]:
            assert "date" in day
            assert "items" in day
            assert "decaissement" in day
            assert "running_balance" in day
            assert isinstance(day["items"], list)
        
        print("✅ GET /api/forecasts/dashboard - per_day structure is correct")
    
    def test_dashboard_missing_amount_calculation(self):
        """GET /api/forecasts/dashboard calculates missing_amount correctly"""
        response = requests.get(f"{BASE_URL}/api/forecasts/dashboard", params={"horizon_days": 30})
        assert response.status_code == 200
        data = response.json()
        
        # missing_amount should be max(0, -min_running_balance)
        min_balance = data["min_running_balance"]
        expected_missing = max(0, -min_balance)
        assert data["missing_amount"] == expected_missing
        
        print(f"✅ GET /api/forecasts/dashboard - missing_amount={data['missing_amount']} (min_balance={min_balance})")


class TestRecurrenceExpansion:
    """Test that recurrences are correctly expanded in dashboard"""
    
    created_forecast_ids = []
    
    def test_weekly_recurrence_expansion(self):
        """Weekly recurrence appears multiple times in 30-day horizon"""
        # Create a weekly forecast starting today
        today = datetime.now().strftime("%Y-%m-%d")
        payload = {
            "date": today,
            "label": "TEST_Weekly_Expansion",
            "amount": 10000,
            "category": "charges",
            "status": "prevu",
            "recurrence": "weekly"
        }
        create_res = requests.post(f"{BASE_URL}/api/forecasts", json=payload)
        assert create_res.status_code == 200
        forecast_id = create_res.json()["forecast"]["id"]
        self.created_forecast_ids.append(forecast_id)
        
        # Check dashboard
        dash_res = requests.get(f"{BASE_URL}/api/forecasts/dashboard", params={"horizon_days": 30})
        assert dash_res.status_code == 200
        data = dash_res.json()
        
        # Count occurrences of this forecast
        occurrences = 0
        for day in data["per_day"]:
            for item in day["items"]:
                if item["id"] == forecast_id:
                    occurrences += 1
        
        # Should appear at least 4 times in 30 days (weekly)
        assert occurrences >= 4, f"Expected at least 4 weekly occurrences, got {occurrences}"
        print(f"✅ Weekly recurrence expanded to {occurrences} occurrences in 30 days")
    
    def test_monthly_recurrence_expansion(self):
        """Monthly recurrence appears in dashboard when within horizon"""
        # Create a monthly forecast for day 15
        payload = {
            "date": "2026-04-15",
            "label": "TEST_Monthly_Expansion",
            "amount": 80000,
            "category": "salaires",
            "status": "prevu",
            "recurrence": "monthly",
            "recurrence_day": 15
        }
        create_res = requests.post(f"{BASE_URL}/api/forecasts", json=payload)
        assert create_res.status_code == 200
        forecast_id = create_res.json()["forecast"]["id"]
        self.created_forecast_ids.append(forecast_id)
        
        # Check dashboard with 60-day horizon to capture at least 2 months
        dash_res = requests.get(f"{BASE_URL}/api/forecasts/dashboard", params={"horizon_days": 60})
        assert dash_res.status_code == 200
        data = dash_res.json()
        
        # Count occurrences
        occurrences = 0
        for day in data["per_day"]:
            for item in day["items"]:
                if item["id"] == forecast_id:
                    occurrences += 1
        
        # Should appear at least once (possibly twice in 60 days)
        assert occurrences >= 1, f"Expected at least 1 monthly occurrence, got {occurrences}"
        print(f"✅ Monthly recurrence expanded to {occurrences} occurrences in 60 days")


class TestExpenseAnalysis:
    """Test expense analysis endpoint"""
    
    def test_expense_analysis_endpoint(self):
        """GET /api/expenses/analysis returns analysis data"""
        response = requests.get(f"{BASE_URL}/api/expenses/analysis")
        assert response.status_code == 200
        data = response.json()
        
        assert "treasury" in data
        assert "analyses" in data
        assert isinstance(data["analyses"], list)
        
        print(f"✅ GET /api/expenses/analysis - Found {len(data['analyses'])} expense analyses")
    
    def test_expense_analysis_structure(self):
        """GET /api/expenses/analysis returns correct structure for each analysis"""
        response = requests.get(f"{BASE_URL}/api/expenses/analysis")
        assert response.status_code == 200
        data = response.json()
        
        for analysis in data["analyses"]:
            assert "expense_id" in analysis
            assert "duplicates_count" in analysis
            assert "duplicates" in analysis
            assert "stock_matches_count" in analysis
            assert "stock_matches" in analysis
            assert "treasury_impact" in analysis
            
            # Check treasury_impact structure
            ti = analysis["treasury_impact"]
            assert "amount" in ti
            assert "available_now" in ti
            assert "ratio_pct" in ti or ti["ratio_pct"] is None
            assert "level" in ti
            assert "would_remain" in ti
            assert ti["level"] in ["low", "moderate", "warning", "critical"]
        
        print("✅ GET /api/expenses/analysis - Analysis structure is correct")
    
    def test_expense_analysis_treasury_impact_levels(self):
        """Treasury impact levels are calculated correctly"""
        response = requests.get(f"{BASE_URL}/api/expenses/analysis")
        assert response.status_code == 200
        data = response.json()
        
        for analysis in data["analyses"]:
            ti = analysis["treasury_impact"]
            ratio = ti["ratio_pct"]
            level = ti["level"]
            
            # Verify level matches ratio
            if ratio is None:
                assert level == "critical"
            elif ratio > 50:
                assert level == "critical"
            elif ratio > 25:
                assert level == "warning"
            elif ratio > 10:
                assert level == "moderate"
            else:
                assert level == "low"
        
        print("✅ GET /api/expenses/analysis - Treasury impact levels are correct")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_forecasts(self):
        """Delete all TEST_ prefixed forecasts"""
        # Get all forecasts
        response = requests.get(f"{BASE_URL}/api/forecasts")
        assert response.status_code == 200
        forecasts = response.json()["forecasts"]
        
        deleted = 0
        for fc in forecasts:
            if fc["label"].startswith("TEST_"):
                del_res = requests.delete(f"{BASE_URL}/api/forecasts/{fc['id']}")
                if del_res.status_code == 200:
                    deleted += 1
        
        print(f"✅ Cleanup - Deleted {deleted} test forecasts")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
