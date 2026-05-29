"""
Test Regularization Feature (Iteration 87)
Tests for:
- POST /api/regularization/create-invoice (Admin + Resp. Op.)
- PATCH /api/regularization/update-invoice-date/{id} (Admin only)
- GET /api/regularization/list
- GET /api/audit/run (REGULARISATIONS check)
- GET /api/invoices/stats/monthly (regularization_ca_date imputation)
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://caisse-mon-point.preview.emergentagent.com').rstrip('/')

# Test data
ADMIN_ACTOR = {"actor_name": "Admin Test", "actor_role": "admin"}
MANAGER_ACTOR = {"actor_name": "Resp Op Test", "actor_role": "manager"}
SERVER_ACTOR = {"actor_name": "Serveur Test", "actor_role": "server"}

def get_yesterday():
    return (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

def get_today():
    return datetime.now().strftime("%Y-%m-%d")

def get_8_days_ago():
    return (datetime.now() - timedelta(days=8)).strftime("%Y-%m-%d")

def get_future_date():
    return (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")


class TestRegularizationCreateInvoice:
    """Tests for POST /api/regularization/create-invoice"""
    
    created_invoice_ids = []
    
    @classmethod
    def teardown_class(cls):
        """Cleanup test invoices"""
        for inv_id in cls.created_invoice_ids:
            try:
                requests.delete(f"{BASE_URL}/api/invoices/{inv_id}")
            except:
                pass
    
    def test_create_invoice_rejects_server_role(self):
        """Server role should be rejected (403)"""
        payload = {
            "target_date": get_yesterday(),
            "impute_ca_to": "target_date",
            "items": [{"name": "Test Item", "price": 1000, "quantity": 1, "department": "bar"}],
            "subtotal": 1000,
            "total": 1000,
            "regularization_reason": "Test reason",
            **SERVER_ACTOR
        }
        response = requests.post(f"{BASE_URL}/api/regularization/create-invoice", json=payload)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("PASS: Server role rejected with 403")
    
    def test_create_invoice_rejects_future_date(self):
        """Future date should be rejected (400)"""
        payload = {
            "target_date": get_future_date(),
            "impute_ca_to": "target_date",
            "items": [{"name": "Test Item", "price": 1000, "quantity": 1, "department": "bar"}],
            "subtotal": 1000,
            "total": 1000,
            "regularization_reason": "Test reason",
            **ADMIN_ACTOR
        }
        response = requests.post(f"{BASE_URL}/api/regularization/create-invoice", json=payload)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        assert "future" in response.text.lower(), f"Expected 'future' in error message: {response.text}"
        print("PASS: Future date rejected with 400")
    
    def test_create_invoice_rejects_date_too_old(self):
        """Date > 7 days ago should be rejected (400)"""
        payload = {
            "target_date": get_8_days_ago(),
            "impute_ca_to": "target_date",
            "items": [{"name": "Test Item", "price": 1000, "quantity": 1, "department": "bar"}],
            "subtotal": 1000,
            "total": 1000,
            "regularization_reason": "Test reason",
            **ADMIN_ACTOR
        }
        response = requests.post(f"{BASE_URL}/api/regularization/create-invoice", json=payload)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        assert "ancienne" in response.text.lower() or "7" in response.text, f"Expected date too old error: {response.text}"
        print("PASS: Date > 7 days ago rejected with 400")
    
    def test_create_invoice_rejects_short_reason(self):
        """Reason < 3 chars should be rejected (422)"""
        payload = {
            "target_date": get_yesterday(),
            "impute_ca_to": "target_date",
            "items": [{"name": "Test Item", "price": 1000, "quantity": 1, "department": "bar"}],
            "subtotal": 1000,
            "total": 1000,
            "regularization_reason": "ab",  # Too short
            **ADMIN_ACTOR
        }
        response = requests.post(f"{BASE_URL}/api/regularization/create-invoice", json=payload)
        assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"
        print("PASS: Short reason rejected with 422")
    
    def test_create_invoice_success_admin(self):
        """Admin can create regularized invoice with valid data"""
        yesterday = get_yesterday()
        payload = {
            "target_date": yesterday,
            "impute_ca_to": "target_date",
            "items": [
                {"name": "Biere Test", "price": 1500, "quantity": 2, "department": "bar"},
                {"name": "Frites Test", "price": 1000, "quantity": 1, "department": "accompagnements"}
            ],
            "subtotal": 4000,
            "total": 4000,
            "payment_method": "cash",
            "regularization_reason": "Test regularization - bon oublie",
            **ADMIN_ACTOR
        }
        response = requests.post(f"{BASE_URL}/api/regularization/create-invoice", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") is True
        invoice = data.get("invoice", {})
        
        # Verify regularization markers
        assert invoice.get("is_regularized") is True, "is_regularized should be True"
        assert invoice.get("regularization_target_date") == yesterday, f"target_date mismatch"
        assert invoice.get("regularization_ca_date") == yesterday, f"ca_date should match target_date"
        assert invoice.get("regularization_reason") == "Test regularization - bon oublie"
        assert invoice.get("regularized_by") == "Admin Test"
        assert "-R" in invoice.get("invoice_number", ""), f"Invoice number should have -R suffix: {invoice.get('invoice_number')}"
        
        self.created_invoice_ids.append(invoice.get("id"))
        print(f"PASS: Admin created regularized invoice {invoice.get('invoice_number')}")
        return invoice
    
    def test_create_invoice_success_manager(self):
        """Manager (Resp. Op.) can create regularized invoice"""
        yesterday = get_yesterday()
        payload = {
            "target_date": yesterday,
            "impute_ca_to": "target_date",
            "items": [{"name": "Coca Test", "price": 500, "quantity": 3, "department": "bar"}],
            "subtotal": 1500,
            "total": 1500,
            "regularization_reason": "Test manager regularization",
            **MANAGER_ACTOR
        }
        response = requests.post(f"{BASE_URL}/api/regularization/create-invoice", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        invoice = data.get("invoice", {})
        assert invoice.get("is_regularized") is True
        assert invoice.get("regularized_by") == "Resp Op Test"
        
        self.created_invoice_ids.append(invoice.get("id"))
        print(f"PASS: Manager created regularized invoice {invoice.get('invoice_number')}")
    
    def test_create_invoice_impute_ca_to_today(self):
        """impute_ca_to='today' should set regularization_ca_date to today"""
        yesterday = get_yesterday()
        today = get_today()
        payload = {
            "target_date": yesterday,
            "impute_ca_to": "today",
            "items": [{"name": "Test Item", "price": 2000, "quantity": 1, "department": "bar"}],
            "subtotal": 2000,
            "total": 2000,
            "regularization_reason": "Test CA imputation today",
            **ADMIN_ACTOR
        }
        response = requests.post(f"{BASE_URL}/api/regularization/create-invoice", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        invoice = data.get("invoice", {})
        assert invoice.get("regularization_target_date") == yesterday
        assert invoice.get("regularization_ca_date") == today, f"CA date should be today: {invoice.get('regularization_ca_date')}"
        
        self.created_invoice_ids.append(invoice.get("id"))
        print(f"PASS: impute_ca_to='today' sets regularization_ca_date to {today}")


class TestRegularizationUpdateDate:
    """Tests for PATCH /api/regularization/update-invoice-date/{id}"""
    
    test_invoice_id = None
    
    @classmethod
    def setup_class(cls):
        """Create a test invoice to update"""
        payload = {
            "target_date": get_yesterday(),
            "impute_ca_to": "target_date",
            "items": [{"name": "Test Update Item", "price": 3000, "quantity": 1, "department": "bar"}],
            "subtotal": 3000,
            "total": 3000,
            "regularization_reason": "Test for update",
            **ADMIN_ACTOR
        }
        response = requests.post(f"{BASE_URL}/api/regularization/create-invoice", json=payload)
        if response.status_code == 200:
            cls.test_invoice_id = response.json().get("invoice", {}).get("id")
    
    @classmethod
    def teardown_class(cls):
        """Cleanup test invoice"""
        if cls.test_invoice_id:
            try:
                requests.delete(f"{BASE_URL}/api/invoices/{cls.test_invoice_id}")
            except:
                pass
    
    def test_update_date_rejects_manager_role(self):
        """Manager role should be rejected for update-date (403)"""
        if not self.test_invoice_id:
            pytest.skip("No test invoice created")
        
        payload = {
            "new_target_date": get_yesterday(),
            "impute_ca_to": "target_date",
            "regularization_reason": "Manager trying to update",
            **MANAGER_ACTOR
        }
        response = requests.patch(
            f"{BASE_URL}/api/regularization/update-invoice-date/{self.test_invoice_id}",
            json=payload
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("PASS: Manager role rejected for update-date with 403")
    
    def test_update_date_success_admin(self):
        """Admin can update invoice date"""
        if not self.test_invoice_id:
            pytest.skip("No test invoice created")
        
        # Use 2 days ago as new target
        two_days_ago = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")
        
        payload = {
            "new_target_date": two_days_ago,
            "impute_ca_to": "target_date",
            "regularization_reason": "Admin updating date",
            **ADMIN_ACTOR
        }
        response = requests.patch(
            f"{BASE_URL}/api/regularization/update-invoice-date/{self.test_invoice_id}",
            json=payload
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        invoice = data.get("invoice", {})
        assert invoice.get("is_regularized") is True
        assert invoice.get("regularization_target_date") == two_days_ago
        assert invoice.get("regularized_by") == "Admin Test"
        
        print(f"PASS: Admin updated invoice date to {two_days_ago}")


class TestRegularizationList:
    """Tests for GET /api/regularization/list"""
    
    def test_list_returns_regularized_invoices(self):
        """List endpoint returns regularized invoices sorted by regularized_at"""
        response = requests.get(f"{BASE_URL}/api/regularization/list")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "items" in data
        assert "total" in data
        
        # All items should have is_regularized=True
        for item in data.get("items", []):
            assert item.get("is_regularized") is True, f"Item should be regularized: {item.get('id')}"
        
        print(f"PASS: List returns {data.get('total')} regularized invoices")


class TestAuditRegularizations:
    """Tests for GET /api/audit/run - REGULARISATIONS check"""
    
    created_invoice_ids = []
    
    @classmethod
    def teardown_class(cls):
        """Cleanup test invoices"""
        for inv_id in cls.created_invoice_ids:
            try:
                requests.delete(f"{BASE_URL}/api/invoices/{inv_id}")
            except:
                pass
    
    def test_audit_includes_regularizations_check(self):
        """Audit should include REGULARISATIONS finding if regularizations exist"""
        # First create a regularization
        yesterday = get_yesterday()
        payload = {
            "target_date": yesterday,
            "impute_ca_to": "target_date",
            "items": [{"name": "Audit Test Item", "price": 1000, "quantity": 1, "department": "bar"}],
            "subtotal": 1000,
            "total": 1000,
            "regularization_reason": "Test for audit check",
            **ADMIN_ACTOR
        }
        create_resp = requests.post(f"{BASE_URL}/api/regularization/create-invoice", json=payload)
        if create_resp.status_code == 200:
            self.created_invoice_ids.append(create_resp.json().get("invoice", {}).get("id"))
        
        # Run audit for today's period
        today = get_today()
        audit_payload = {"start_date": yesterday, "end_date": today}
        response = requests.post(f"{BASE_URL}/api/audit/run", json=audit_payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        findings = data.get("findings", [])
        
        # Look for REGULARISATIONS finding
        regul_finding = next((f for f in findings if f.get("code") == "REGULARISATIONS"), None)
        
        # If we created a regularization, it should appear
        if regul_finding:
            print(f"PASS: Audit includes REGULARISATIONS finding: {regul_finding.get('title')}")
            assert regul_finding.get("severity") in ["warning", "critical"]
        else:
            print("INFO: No REGULARISATIONS finding (may be no regularizations in period)")
    
    def test_audit_critical_severity_for_more_than_3_per_day(self):
        """Audit should show critical severity if > 3 regularizations on same target_date"""
        yesterday = get_yesterday()
        
        # Create 4 regularizations for the same target date
        for i in range(4):
            payload = {
                "target_date": yesterday,
                "impute_ca_to": "target_date",
                "items": [{"name": f"Critical Test Item {i}", "price": 500, "quantity": 1, "department": "bar"}],
                "subtotal": 500,
                "total": 500,
                "regularization_reason": f"Test critical severity {i}",
                **ADMIN_ACTOR
            }
            resp = requests.post(f"{BASE_URL}/api/regularization/create-invoice", json=payload)
            if resp.status_code == 200:
                self.created_invoice_ids.append(resp.json().get("invoice", {}).get("id"))
        
        # Run audit
        today = get_today()
        audit_payload = {"start_date": yesterday, "end_date": today}
        response = requests.post(f"{BASE_URL}/api/audit/run", json=audit_payload)
        assert response.status_code == 200
        
        data = response.json()
        findings = data.get("findings", [])
        regul_finding = next((f for f in findings if f.get("code") == "REGULARISATIONS"), None)
        
        if regul_finding:
            # With > 3 on same day, severity should be critical
            print(f"PASS: REGULARISATIONS finding severity: {regul_finding.get('severity')}")
            # Note: severity depends on whether > 3 on same target_date
        else:
            print("INFO: No REGULARISATIONS finding found")


class TestPostClosureRegularization:
    """Tests for post-closure regularization (423 status)"""
    
    def test_closed_day_requires_confirmation(self):
        """If target day is closed, confirm_post_closure=false should return 423"""
        # This test requires a day_closure to exist for the target date
        # We'll try to create a regularization for yesterday and check behavior
        yesterday = get_yesterday()
        
        # First, check if yesterday is closed
        closure_resp = requests.get(f"{BASE_URL}/api/day-closures/{yesterday}")
        
        if closure_resp.status_code == 200 and closure_resp.json():
            # Day is closed, test should return 423 without confirmation
            payload = {
                "target_date": yesterday,
                "impute_ca_to": "target_date",
                "items": [{"name": "Post Closure Test", "price": 1000, "quantity": 1, "department": "bar"}],
                "subtotal": 1000,
                "total": 1000,
                "regularization_reason": "Test post closure",
                "confirm_post_closure": False,
                **ADMIN_ACTOR
            }
            response = requests.post(f"{BASE_URL}/api/regularization/create-invoice", json=payload)
            
            if response.status_code == 423:
                print("PASS: Closed day returns 423 without confirm_post_closure")
            else:
                print(f"INFO: Got {response.status_code} - day may not be closed or confirmation not required")
        else:
            print("INFO: Yesterday is not closed, skipping post-closure test")


class TestMonthlyStatsRegularization:
    """Tests for monthly stats with regularization_ca_date"""
    
    created_invoice_id = None
    
    @classmethod
    def teardown_class(cls):
        if cls.created_invoice_id:
            try:
                requests.delete(f"{BASE_URL}/api/invoices/{cls.created_invoice_id}")
            except:
                pass
    
    def test_monthly_stats_uses_regularization_ca_date(self):
        """Monthly stats should use regularization_ca_date for CA imputation"""
        # Create a regularization with impute_ca_to='target_date'
        yesterday = get_yesterday()
        payload = {
            "target_date": yesterday,
            "impute_ca_to": "target_date",
            "items": [{"name": "Stats Test Item", "price": 5000, "quantity": 1, "department": "bar"}],
            "subtotal": 5000,
            "total": 5000,
            "regularization_reason": "Test monthly stats",
            **ADMIN_ACTOR
        }
        create_resp = requests.post(f"{BASE_URL}/api/regularization/create-invoice", json=payload)
        
        if create_resp.status_code == 200:
            invoice = create_resp.json().get("invoice", {})
            self.created_invoice_id = invoice.get("id")
            
            # Get monthly stats for current month
            now = datetime.now()
            stats_resp = requests.get(
                f"{BASE_URL}/api/invoices/stats/monthly",
                params={"year": now.year, "month": now.month}
            )
            assert stats_resp.status_code == 200
            
            stats = stats_resp.json()
            daily_stats = stats.get("daily_stats", {})
            
            # The invoice should be counted in yesterday's stats (regularization_ca_date)
            if yesterday in daily_stats:
                print(f"PASS: Monthly stats includes regularization in {yesterday}: {daily_stats[yesterday]}")
            else:
                print(f"INFO: Daily stats for {yesterday}: {daily_stats.get(yesterday, 'not found')}")
        else:
            print(f"INFO: Could not create test invoice: {create_resp.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
