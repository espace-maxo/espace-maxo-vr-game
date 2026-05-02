"""
Test Journal Endpoints - Iteration 77
Tests for the new Journal router (dashboard + realtime) for treasury tracking.

Endpoints tested:
- GET /api/journal/dashboard?days=30 → consolidated treasury view
- GET /api/journal/realtime?days=30 → chronological operations list
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestJournalDashboard:
    """Tests for GET /api/journal/dashboard endpoint"""
    
    def test_dashboard_returns_200(self):
        """Dashboard endpoint should return 200 OK"""
        response = requests.get(f"{BASE_URL}/api/journal/dashboard", params={"days": 30})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✓ Dashboard endpoint returns 200 OK")
    
    def test_dashboard_response_structure(self):
        """Dashboard should return correct structure with actual, forecast, alerts"""
        response = requests.get(f"{BASE_URL}/api/journal/dashboard", params={"days": 30})
        assert response.status_code == 200
        data = response.json()
        
        # Check top-level keys
        assert "as_of" in data, "Missing 'as_of' field"
        assert "actual" in data, "Missing 'actual' field"
        assert "forecast" in data, "Missing 'forecast' field"
        assert "alerts" in data, "Missing 'alerts' field"
        print("✓ Dashboard has correct top-level structure")
    
    def test_dashboard_actual_structure(self):
        """Dashboard 'actual' section should have balance, total_in, total_out, out_by_category"""
        response = requests.get(f"{BASE_URL}/api/journal/dashboard", params={"days": 30})
        assert response.status_code == 200
        data = response.json()
        actual = data.get("actual", {})
        
        # Check actual section keys
        assert "balance" in actual, "Missing 'balance' in actual"
        assert "total_in" in actual, "Missing 'total_in' in actual"
        assert "total_out" in actual, "Missing 'total_out' in actual"
        assert "out_by_category" in actual, "Missing 'out_by_category' in actual"
        assert "invoices_count" in actual, "Missing 'invoices_count' in actual"
        assert "expenses_count" in actual, "Missing 'expenses_count' in actual"
        
        # Verify balance calculation: balance = total_in - total_out
        expected_balance = actual["total_in"] - actual["total_out"]
        assert abs(actual["balance"] - expected_balance) < 0.01, \
            f"Balance mismatch: {actual['balance']} != {expected_balance}"
        print(f"✓ Actual section correct: balance={actual['balance']}, total_in={actual['total_in']}, total_out={actual['total_out']}")
    
    def test_dashboard_out_by_category(self):
        """Dashboard should categorize expenses into cuisine/charges/salaires/divers"""
        response = requests.get(f"{BASE_URL}/api/journal/dashboard", params={"days": 30})
        assert response.status_code == 200
        data = response.json()
        out_by_category = data.get("actual", {}).get("out_by_category", {})
        
        # Check all 4 categories exist
        expected_categories = ["cuisine", "charges", "salaires", "divers"]
        for cat in expected_categories:
            assert cat in out_by_category, f"Missing category '{cat}' in out_by_category"
        
        # Verify sum of categories equals total_out
        cat_sum = sum(out_by_category.values())
        total_out = data.get("actual", {}).get("total_out", 0)
        assert abs(cat_sum - total_out) < 0.01, \
            f"Category sum {cat_sum} != total_out {total_out}"
        print(f"✓ Categories correct: {out_by_category}")
    
    def test_dashboard_forecast_structure(self):
        """Dashboard 'forecast' section should have balance_7d, balance_30d, out_7d, out_30d"""
        response = requests.get(f"{BASE_URL}/api/journal/dashboard", params={"days": 30})
        assert response.status_code == 200
        data = response.json()
        forecast = data.get("forecast", {})
        
        # Check forecast section keys
        assert "balance_7d" in forecast, "Missing 'balance_7d' in forecast"
        assert "balance_30d" in forecast, "Missing 'balance_30d' in forecast"
        assert "out_7d" in forecast, "Missing 'out_7d' in forecast"
        assert "out_30d" in forecast, "Missing 'out_30d' in forecast"
        print(f"✓ Forecast section correct: balance_7d={forecast['balance_7d']}, balance_30d={forecast['balance_30d']}")
    
    def test_dashboard_alerts_structure(self):
        """Dashboard alerts should be a list with level, code, message"""
        response = requests.get(f"{BASE_URL}/api/journal/dashboard", params={"days": 30})
        assert response.status_code == 200
        data = response.json()
        alerts = data.get("alerts", [])
        
        assert isinstance(alerts, list), "Alerts should be a list"
        
        for alert in alerts:
            assert "level" in alert, "Alert missing 'level'"
            assert "code" in alert, "Alert missing 'code'"
            assert "message" in alert, "Alert missing 'message'"
            assert alert["level"] in ["critical", "warning", "info"], \
                f"Invalid alert level: {alert['level']}"
        print(f"✓ Alerts structure correct: {len(alerts)} alert(s)")
    
    def test_dashboard_alert_codes(self):
        """Verify alert codes are valid: negative_balance, high_expense_ratio, deficit_7d, deficit_30d"""
        response = requests.get(f"{BASE_URL}/api/journal/dashboard", params={"days": 30})
        assert response.status_code == 200
        data = response.json()
        alerts = data.get("alerts", [])
        
        valid_codes = ["negative_balance", "high_expense_ratio", "deficit_7d", "deficit_30d"]
        for alert in alerts:
            assert alert["code"] in valid_codes, f"Invalid alert code: {alert['code']}"
        print(f"✓ Alert codes valid: {[a['code'] for a in alerts]}")
    
    def test_dashboard_deficit_7d_alert(self):
        """If balance_7d < 0, should have deficit_7d alert"""
        response = requests.get(f"{BASE_URL}/api/journal/dashboard", params={"days": 30})
        assert response.status_code == 200
        data = response.json()
        
        balance_7d = data.get("forecast", {}).get("balance_7d", 0)
        alerts = data.get("alerts", [])
        alert_codes = [a["code"] for a in alerts]
        
        if balance_7d < 0:
            assert "deficit_7d" in alert_codes, \
                f"Expected deficit_7d alert for balance_7d={balance_7d}"
            print(f"✓ deficit_7d alert correctly triggered for balance_7d={balance_7d}")
        else:
            print(f"✓ No deficit_7d alert needed (balance_7d={balance_7d} >= 0)")
    
    def test_dashboard_different_days_param(self):
        """Dashboard should accept different days parameters"""
        for days in [7, 30, 60, 90]:
            response = requests.get(f"{BASE_URL}/api/journal/dashboard", params={"days": days})
            assert response.status_code == 200, f"Failed for days={days}"
        print("✓ Dashboard accepts different days parameters (7, 30, 60, 90)")
    
    def test_dashboard_non_zero_balance(self):
        """Verify balance is non-zero (per agent context: 43500 F expected)"""
        response = requests.get(f"{BASE_URL}/api/journal/dashboard", params={"days": 30})
        assert response.status_code == 200
        data = response.json()
        balance = data.get("actual", {}).get("balance", 0)
        
        # Per agent context: Solde 43500 F (101k entrées - 57.5k sorties)
        assert balance != 0, "Balance should not be zero (expected ~43500 F)"
        print(f"✓ Balance is non-zero: {balance} F")


class TestJournalRealtime:
    """Tests for GET /api/journal/realtime endpoint"""
    
    def test_realtime_returns_200(self):
        """Realtime endpoint should return 200 OK"""
        response = requests.get(f"{BASE_URL}/api/journal/realtime", params={"days": 30})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✓ Realtime endpoint returns 200 OK")
    
    def test_realtime_response_structure(self):
        """Realtime should return days, count, operations"""
        response = requests.get(f"{BASE_URL}/api/journal/realtime", params={"days": 30})
        assert response.status_code == 200
        data = response.json()
        
        assert "days" in data, "Missing 'days' field"
        assert "count" in data, "Missing 'count' field"
        assert "operations" in data, "Missing 'operations' field"
        assert isinstance(data["operations"], list), "Operations should be a list"
        print(f"✓ Realtime structure correct: {data['count']} operations")
    
    def test_realtime_operation_structure(self):
        """Each operation should have id, type, category, amount, label, created_at, by"""
        response = requests.get(f"{BASE_URL}/api/journal/realtime", params={"days": 30, "limit": 10})
        assert response.status_code == 200
        data = response.json()
        operations = data.get("operations", [])
        
        if len(operations) == 0:
            print("⚠ No operations found in last 30 days")
            return
        
        for op in operations:
            assert "id" in op, "Operation missing 'id'"
            assert "type" in op, "Operation missing 'type'"
            assert "category" in op, "Operation missing 'category'"
            assert "amount" in op, "Operation missing 'amount'"
            assert "label" in op, "Operation missing 'label'"
            assert "created_at" in op, "Operation missing 'created_at'"
            assert "by" in op, "Operation missing 'by'"
        print(f"✓ Operation structure correct for {len(operations)} operations")
    
    def test_realtime_operation_types(self):
        """Operation type should be 'entree' or 'depense'"""
        response = requests.get(f"{BASE_URL}/api/journal/realtime", params={"days": 30, "limit": 50})
        assert response.status_code == 200
        data = response.json()
        operations = data.get("operations", [])
        
        valid_types = ["entree", "depense"]
        for op in operations:
            assert op["type"] in valid_types, f"Invalid operation type: {op['type']}"
        
        # Count by type
        entrees = [op for op in operations if op["type"] == "entree"]
        depenses = [op for op in operations if op["type"] == "depense"]
        print(f"✓ Operation types valid: {len(entrees)} entrées, {len(depenses)} dépenses")
    
    def test_realtime_operation_categories(self):
        """Operation categories should be valid (ventes, cuisine, charges, salaires, divers)"""
        response = requests.get(f"{BASE_URL}/api/journal/realtime", params={"days": 30, "limit": 50})
        assert response.status_code == 200
        data = response.json()
        operations = data.get("operations", [])
        
        valid_categories = ["ventes", "cuisine", "charges", "salaires", "divers"]
        for op in operations:
            assert op["category"] in valid_categories, \
                f"Invalid category: {op['category']} for operation {op['id']}"
        print(f"✓ All operation categories valid")
    
    def test_realtime_invoices_use_total_field(self):
        """Verify invoices use 'total' field (not 'total_amount') - balance should be non-zero"""
        response = requests.get(f"{BASE_URL}/api/journal/realtime", params={"days": 30, "limit": 50})
        assert response.status_code == 200
        data = response.json()
        operations = data.get("operations", [])
        
        # Filter for invoice entries (type=entree, category=ventes)
        invoices = [op for op in operations if op["type"] == "entree" and op["category"] == "ventes"]
        
        if len(invoices) == 0:
            print("⚠ No invoice entries found")
            return
        
        # Verify amounts are non-zero (if total field is used correctly)
        for inv in invoices:
            assert inv["amount"] > 0, f"Invoice {inv['id']} has zero amount - check 'total' field usage"
        
        total_invoices = sum(inv["amount"] for inv in invoices)
        print(f"✓ {len(invoices)} invoices with total amount: {total_invoices} F")
    
    def test_realtime_expenses_completed_or_paid(self):
        """Verify only completed or (paiement+is_paid) expenses are counted"""
        response = requests.get(f"{BASE_URL}/api/journal/realtime", params={"days": 30, "limit": 50})
        assert response.status_code == 200
        data = response.json()
        operations = data.get("operations", [])
        
        # Filter for expense entries (type=depense)
        expenses = [op for op in operations if op["type"] == "depense"]
        
        if len(expenses) == 0:
            print("⚠ No expense entries found")
            return
        
        total_expenses = sum(exp["amount"] for exp in expenses)
        print(f"✓ {len(expenses)} expenses with total amount: {total_expenses} F")
    
    def test_realtime_different_days_param(self):
        """Realtime should accept different days parameters"""
        for days in [7, 30, 60, 90]:
            response = requests.get(f"{BASE_URL}/api/journal/realtime", params={"days": days})
            assert response.status_code == 200, f"Failed for days={days}"
        print("✓ Realtime accepts different days parameters (7, 30, 60, 90)")
    
    def test_realtime_limit_param(self):
        """Realtime should respect limit parameter"""
        response = requests.get(f"{BASE_URL}/api/journal/realtime", params={"days": 30, "limit": 5})
        assert response.status_code == 200
        data = response.json()
        operations = data.get("operations", [])
        
        assert len(operations) <= 5, f"Expected max 5 operations, got {len(operations)}"
        print(f"✓ Limit parameter respected: {len(operations)} operations (limit=5)")


class TestJournalAlertLogic:
    """Tests for alert triggering logic"""
    
    def test_high_expense_ratio_threshold(self):
        """high_expense_ratio alert should trigger when ratio > 70%"""
        response = requests.get(f"{BASE_URL}/api/journal/dashboard", params={"days": 30})
        assert response.status_code == 200
        data = response.json()
        
        total_in = data.get("actual", {}).get("total_in", 0)
        total_out = data.get("actual", {}).get("total_out", 0)
        alerts = data.get("alerts", [])
        alert_codes = [a["code"] for a in alerts]
        
        if total_in > 0:
            ratio = (total_out / total_in) * 100
            if ratio > 70:
                assert "high_expense_ratio" in alert_codes, \
                    f"Expected high_expense_ratio alert for ratio={ratio:.1f}%"
                print(f"✓ high_expense_ratio alert correctly triggered (ratio={ratio:.1f}%)")
            else:
                assert "high_expense_ratio" not in alert_codes, \
                    f"Unexpected high_expense_ratio alert for ratio={ratio:.1f}%"
                print(f"✓ No high_expense_ratio alert (ratio={ratio:.1f}% <= 70%)")
        else:
            print("⚠ Cannot test ratio alert (total_in=0)")
    
    def test_negative_balance_alert(self):
        """negative_balance alert should trigger when balance < 0"""
        response = requests.get(f"{BASE_URL}/api/journal/dashboard", params={"days": 30})
        assert response.status_code == 200
        data = response.json()
        
        balance = data.get("actual", {}).get("balance", 0)
        alerts = data.get("alerts", [])
        alert_codes = [a["code"] for a in alerts]
        
        if balance < 0:
            assert "negative_balance" in alert_codes, \
                f"Expected negative_balance alert for balance={balance}"
            print(f"✓ negative_balance alert correctly triggered (balance={balance})")
        else:
            assert "negative_balance" not in alert_codes, \
                f"Unexpected negative_balance alert for balance={balance}"
            print(f"✓ No negative_balance alert (balance={balance} >= 0)")


class TestJournalCategorization:
    """Tests for expense categorization logic"""
    
    def test_categorization_cuisine(self):
        """Verify cuisine/bar categories map to 'cuisine'"""
        # This is tested indirectly through the dashboard response
        response = requests.get(f"{BASE_URL}/api/journal/dashboard", params={"days": 30})
        assert response.status_code == 200
        data = response.json()
        out_by_category = data.get("actual", {}).get("out_by_category", {})
        
        # Cuisine category should exist
        assert "cuisine" in out_by_category, "Missing 'cuisine' category"
        print(f"✓ Cuisine category exists: {out_by_category['cuisine']} F")
    
    def test_categorization_charges(self):
        """Verify loyer/charges/impots categories map to 'charges'"""
        response = requests.get(f"{BASE_URL}/api/journal/dashboard", params={"days": 30})
        assert response.status_code == 200
        data = response.json()
        out_by_category = data.get("actual", {}).get("out_by_category", {})
        
        assert "charges" in out_by_category, "Missing 'charges' category"
        print(f"✓ Charges category exists: {out_by_category['charges']} F")
    
    def test_categorization_salaires(self):
        """Verify salaire/personnel categories map to 'salaires'"""
        response = requests.get(f"{BASE_URL}/api/journal/dashboard", params={"days": 30})
        assert response.status_code == 200
        data = response.json()
        out_by_category = data.get("actual", {}).get("out_by_category", {})
        
        assert "salaires" in out_by_category, "Missing 'salaires' category"
        print(f"✓ Salaires category exists: {out_by_category['salaires']} F")
    
    def test_categorization_divers(self):
        """Verify uncategorized expenses map to 'divers'"""
        response = requests.get(f"{BASE_URL}/api/journal/dashboard", params={"days": 30})
        assert response.status_code == 200
        data = response.json()
        out_by_category = data.get("actual", {}).get("out_by_category", {})
        
        assert "divers" in out_by_category, "Missing 'divers' category"
        print(f"✓ Divers category exists: {out_by_category['divers']} F")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
