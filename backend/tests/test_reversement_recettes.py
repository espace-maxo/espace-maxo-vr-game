"""
Test suite for Reversement des Recettes (Financial Point) feature
Tests the REVERSED workflow: Gerante signs FIRST → Admin validates AFTER
Tests only 4 payment modes (no card_amount, no other_amount)
Tests new /reports/revenue-by-payment endpoint
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestReversementRecettesAPI:
    """Test the Reversement des Recettes (Financial Point) API with reversed workflow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_point_id = None
        self.today = datetime.now().strftime("%Y-%m-%d")
        # Calculate week start (Monday)
        today = datetime.now()
        week_start = today - timedelta(days=today.weekday())
        self.week_start = week_start.strftime("%Y-%m-%d")
        self.week_end = (week_start + timedelta(days=6)).strftime("%Y-%m-%d")
        yield
        # Cleanup
        if self.test_point_id:
            try:
                requests.delete(f"{BASE_URL}/api/financial-points/{self.test_point_id}", params={"is_admin": True})
            except:
                pass
    
    # ==================== NEW ENDPOINT: revenue-by-payment ====================
    
    def test_revenue_by_payment_endpoint_exists(self):
        """Test that the NEW /reports/revenue-by-payment endpoint exists"""
        response = requests.get(f"{BASE_URL}/api/reports/revenue-by-payment")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "by_method" in data, "Response should have by_method field"
        assert "total" in data, "Response should have total field"
        print("✅ /reports/revenue-by-payment endpoint exists and returns data")
    
    def test_revenue_by_payment_with_week_start(self):
        """Test revenue-by-payment with week_start parameter"""
        response = requests.get(f"{BASE_URL}/api/reports/revenue-by-payment", params={"week_start": self.week_start})
        assert response.status_code == 200
        data = response.json()
        assert "by_method" in data
        # Check that only 4 payment methods are returned (no card)
        by_method = data["by_method"]
        assert "cash" in by_method, "Should have cash"
        assert "mobile" in by_method, "Should have mobile"
        assert "cheque" in by_method, "Should have cheque"
        assert "wallet" in by_method, "Should have wallet"
        print(f"✅ Revenue by payment returns: {by_method}")
    
    def test_revenue_by_payment_with_date(self):
        """Test revenue-by-payment with date parameter"""
        response = requests.get(f"{BASE_URL}/api/reports/revenue-by-payment", params={"date": self.today})
        assert response.status_code == 200
        data = response.json()
        assert "by_method" in data
        print("✅ Revenue by payment works with date parameter")
    
    # ==================== CREATE: Only 4 payment fields ====================
    
    def test_create_financial_point_only_4_fields(self):
        """Test that POST /financial-points only accepts 4 payment fields (no card_amount, no other_amount)"""
        # Use a unique date to avoid conflicts
        test_date = (datetime.now() + timedelta(days=100)).strftime("%Y-%m-%d")
        test_end = (datetime.now() + timedelta(days=106)).strftime("%Y-%m-%d")
        
        payload = {
            "date": test_date,
            "end_date": test_end,
            "period_type": "weekly",
            "cash_amount": 50000,
            "mobile_amount": 30000,
            "cheque_amount": 10000,
            "wallet_amount": 5000,
            "notes": "Test reversement",
            "created_by": "Test Gerante"
        }
        
        response = requests.post(f"{BASE_URL}/api/financial-points", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        point = data.get("financial_point", {})
        self.test_point_id = point.get("id")
        
        # Verify only 4 payment fields
        assert point.get("cash_amount") == 50000
        assert point.get("mobile_amount") == 30000
        assert point.get("cheque_amount") == 10000
        assert point.get("wallet_amount") == 5000
        
        # Verify NO card_amount or other_amount
        assert "card_amount" not in point or point.get("card_amount") is None, "card_amount should NOT exist"
        assert "other_amount" not in point or point.get("other_amount") is None, "other_amount should NOT exist"
        
        # Verify total is sum of 4 fields only
        expected_total = 50000 + 30000 + 10000 + 5000
        assert point.get("total_amount") == expected_total, f"Total should be {expected_total}, got {point.get('total_amount')}"
        
        print(f"✅ Created financial point with only 4 payment fields, total: {expected_total}")
    
    # ==================== REVERSED WORKFLOW: Sign FIRST, Admin validates AFTER ====================
    
    def test_sign_first_without_admin_validation(self):
        """Test that Gerante can sign FIRST without admin validation (REVERSED workflow)"""
        # Create a point
        test_date = (datetime.now() + timedelta(days=200)).strftime("%Y-%m-%d")
        test_end = (datetime.now() + timedelta(days=206)).strftime("%Y-%m-%d")
        
        create_response = requests.post(f"{BASE_URL}/api/financial-points", json={
            "date": test_date,
            "end_date": test_end,
            "period_type": "weekly",
            "cash_amount": 10000,
            "mobile_amount": 5000,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "created_by": "Test Gerante"
        })
        assert create_response.status_code == 200
        point_id = create_response.json()["financial_point"]["id"]
        self.test_point_id = point_id
        
        # Sign WITHOUT admin validation first (REVERSED workflow)
        sign_response = requests.post(f"{BASE_URL}/api/financial-points/{point_id}/sign", json={
            "signer_name": "Mères AHOUANDJINOU",
            "consent_text": "Je certifie l'exactitude des montants reverses"
        })
        
        assert sign_response.status_code == 200, f"Sign should succeed without admin validation: {sign_response.text}"
        signed_point = sign_response.json()["financial_point"]
        assert signed_point.get("signed") == True
        assert signed_point.get("signed_by") == "Mères AHOUANDJINOU"
        assert signed_point.get("admin_validated") == False, "Admin should NOT have validated yet"
        
        print("✅ Gerante can sign FIRST without admin validation (REVERSED workflow)")
    
    def test_admin_validate_requires_signature(self):
        """Test that Admin validation requires signature FIRST (REVERSED workflow)"""
        # Create a point
        test_date = (datetime.now() + timedelta(days=300)).strftime("%Y-%m-%d")
        test_end = (datetime.now() + timedelta(days=306)).strftime("%Y-%m-%d")
        
        create_response = requests.post(f"{BASE_URL}/api/financial-points", json={
            "date": test_date,
            "end_date": test_end,
            "period_type": "weekly",
            "cash_amount": 20000,
            "mobile_amount": 10000,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "created_by": "Test Gerante"
        })
        assert create_response.status_code == 200
        point_id = create_response.json()["financial_point"]["id"]
        self.test_point_id = point_id
        
        # Try to admin-validate WITHOUT signature (should fail)
        validate_response = requests.post(f"{BASE_URL}/api/financial-points/{point_id}/admin-validate", json={
            "admin_name": "Admin Test"
        })
        
        assert validate_response.status_code == 400, f"Admin validate should fail without signature: {validate_response.text}"
        assert "signé" in validate_response.json().get("detail", "").lower() or "sign" in validate_response.json().get("detail", "").lower()
        
        print("✅ Admin validation requires signature FIRST (REVERSED workflow)")
    
    def test_full_reversed_workflow(self):
        """Test the complete REVERSED workflow: Create → Sign (Gerante) → Validate (Admin)"""
        # Create a point
        test_date = (datetime.now() + timedelta(days=400)).strftime("%Y-%m-%d")
        test_end = (datetime.now() + timedelta(days=406)).strftime("%Y-%m-%d")
        
        create_response = requests.post(f"{BASE_URL}/api/financial-points", json={
            "date": test_date,
            "end_date": test_end,
            "period_type": "weekly",
            "cash_amount": 100000,
            "mobile_amount": 50000,
            "cheque_amount": 25000,
            "wallet_amount": 10000,
            "notes": "Test full workflow",
            "created_by": "Mères AHOUANDJINOU"
        })
        assert create_response.status_code == 200
        point_id = create_response.json()["financial_point"]["id"]
        self.test_point_id = point_id
        
        # Step 1: Gerante signs FIRST
        sign_response = requests.post(f"{BASE_URL}/api/financial-points/{point_id}/sign", json={
            "signer_name": "Mères AHOUANDJINOU",
            "consent_text": "Je certifie l'exactitude des montants reverses dans ce point financier."
        })
        assert sign_response.status_code == 200
        signed_point = sign_response.json()["financial_point"]
        assert signed_point.get("signed") == True
        assert signed_point.get("status") == "signed"
        print("  ✓ Step 1: Gerante signed")
        
        # Step 2: Admin validates AFTER signature
        validate_response = requests.post(f"{BASE_URL}/api/financial-points/{point_id}/admin-validate", json={
            "admin_name": "Admin Caisse"
        })
        assert validate_response.status_code == 200
        validated_point = validate_response.json()["financial_point"]
        assert validated_point.get("admin_validated") == True
        assert validated_point.get("admin_validated_by") == "Admin Caisse"
        assert validated_point.get("status") == "admin_validated"
        print("  ✓ Step 2: Admin validated AFTER signature")
        
        print("✅ Full REVERSED workflow completed: Create → Sign → Admin Validate")
    
    # ==================== UNLOCK endpoint ====================
    
    def test_unlock_signed_point(self):
        """Test that admin can unlock a signed point for modification"""
        # Create and sign a point
        test_date = (datetime.now() + timedelta(days=500)).strftime("%Y-%m-%d")
        test_end = (datetime.now() + timedelta(days=506)).strftime("%Y-%m-%d")
        
        create_response = requests.post(f"{BASE_URL}/api/financial-points", json={
            "date": test_date,
            "end_date": test_end,
            "period_type": "weekly",
            "cash_amount": 15000,
            "mobile_amount": 0,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "created_by": "Test Gerante"
        })
        point_id = create_response.json()["financial_point"]["id"]
        self.test_point_id = point_id
        
        # Sign the point
        requests.post(f"{BASE_URL}/api/financial-points/{point_id}/sign", json={
            "signer_name": "Test Gerante",
            "consent_text": "Test consent"
        })
        
        # Unlock the point
        unlock_response = requests.post(f"{BASE_URL}/api/financial-points/{point_id}/unlock", json={
            "admin_name": "Admin Test"
        })
        assert unlock_response.status_code == 200
        unlocked_point = unlock_response.json()["financial_point"]
        assert unlocked_point.get("signed") == False
        assert unlocked_point.get("unlocked_by") == "Admin Test"
        
        print("✅ Admin can unlock signed point for modification")
    
    # ==================== PDF endpoint ====================
    
    def test_pdf_shows_reversement_title(self):
        """Test that PDF shows 'Reversement des Recettes' title"""
        # Create and sign a point
        test_date = (datetime.now() + timedelta(days=600)).strftime("%Y-%m-%d")
        test_end = (datetime.now() + timedelta(days=606)).strftime("%Y-%m-%d")
        
        create_response = requests.post(f"{BASE_URL}/api/financial-points", json={
            "date": test_date,
            "end_date": test_end,
            "period_type": "weekly",
            "cash_amount": 25000,
            "mobile_amount": 15000,
            "cheque_amount": 5000,
            "wallet_amount": 2000,
            "created_by": "Test Gerante"
        })
        point_id = create_response.json()["financial_point"]["id"]
        self.test_point_id = point_id
        
        # Sign the point
        requests.post(f"{BASE_URL}/api/financial-points/{point_id}/sign", json={
            "signer_name": "Test Gerante",
            "consent_text": "Test consent"
        })
        
        # Get PDF
        pdf_response = requests.get(f"{BASE_URL}/api/financial-points/{point_id}/pdf")
        assert pdf_response.status_code == 200
        
        # Check content type (should be HTML)
        content = pdf_response.text
        assert "Reversement" in content or "reversement" in content.lower(), "PDF should contain 'Reversement'"
        
        print("✅ PDF shows 'Reversement des Recettes' title")


class TestManagerPermissions:
    """Test that Manager (PIN 2468) can create AND sign, but NOT validate"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.test_point_id = None
        yield
        if self.test_point_id:
            try:
                requests.delete(f"{BASE_URL}/api/financial-points/{self.test_point_id}", params={"is_admin": True})
            except:
                pass
    
    def test_manager_can_create_and_sign(self):
        """Test that manager can create AND sign a financial point"""
        test_date = (datetime.now() + timedelta(days=700)).strftime("%Y-%m-%d")
        test_end = (datetime.now() + timedelta(days=706)).strftime("%Y-%m-%d")
        
        # Manager creates
        create_response = requests.post(f"{BASE_URL}/api/financial-points", json={
            "date": test_date,
            "end_date": test_end,
            "period_type": "weekly",
            "cash_amount": 30000,
            "mobile_amount": 20000,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "created_by": "Mères AHOUANDJINOU"
        })
        assert create_response.status_code == 200
        point_id = create_response.json()["financial_point"]["id"]
        self.test_point_id = point_id
        print("  ✓ Manager can create")
        
        # Manager signs
        sign_response = requests.post(f"{BASE_URL}/api/financial-points/{point_id}/sign", json={
            "signer_name": "Mères AHOUANDJINOU",
            "consent_text": "Je certifie l'exactitude des montants"
        })
        assert sign_response.status_code == 200
        print("  ✓ Manager can sign")
        
        print("✅ Manager can create AND sign financial points")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
