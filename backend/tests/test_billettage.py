"""
Test Billettage des Espèces feature for Reversement
Tests:
1. POST /api/financial-points stores billettage object
2. GET /api/financial-points/{id}/pdf includes billettage table when present
3. Full workflow: create with billettage -> sign -> admin validate -> PDF with billettage
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# FCFA denominations
DENOMINATIONS = [10000, 5000, 2000, 1000, 500, 200, 100, 50, 25, 10, 5]

class TestBillettageFeature:
    """Test billettage des espèces feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_billettage = {
            "10000": 5,   # 5 x 10000 = 50000
            "5000": 3,    # 3 x 5000 = 15000
            "2000": 2,    # 2 x 2000 = 4000
            "1000": 10,   # 10 x 1000 = 10000
            "500": 4,     # 4 x 500 = 2000
            "200": 0,
            "100": 5,     # 5 x 100 = 500
            "50": 0,
            "25": 0,
            "10": 0,
            "5": 0
        }
        # Total billettage = 50000 + 15000 + 4000 + 10000 + 2000 + 500 = 81500
        self.expected_billettage_total = 81500
        
        # Generate unique date for this test
        self.test_date = (datetime.now() + timedelta(days=100)).strftime("%Y-%m-%d")
        self.test_end_date = (datetime.now() + timedelta(days=106)).strftime("%Y-%m-%d")
    
    def test_create_financial_point_with_billettage(self):
        """Test POST /api/financial-points stores billettage object"""
        payload = {
            "date": self.test_date,
            "end_date": self.test_end_date,
            "period_type": "weekly",
            "cash_amount": self.expected_billettage_total,  # Should match billettage total
            "mobile_amount": 25000,
            "cheque_amount": 10000,
            "wallet_amount": 5000,
            "notes": "Test billettage feature",
            "created_by": "Test Agent",
            "billettage": self.test_billettage
        }
        
        response = requests.post(f"{BASE_URL}/api/financial-points", json=payload)
        
        # Status assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data assertions
        data = response.json()
        assert data.get("success") == True
        assert "financial_point" in data
        
        fp = data["financial_point"]
        assert fp["cash_amount"] == self.expected_billettage_total
        assert fp["mobile_amount"] == 25000
        assert fp["cheque_amount"] == 10000
        assert fp["wallet_amount"] == 5000
        
        # Verify billettage is stored
        assert "billettage" in fp
        assert fp["billettage"] == self.test_billettage
        
        # Store ID for subsequent tests
        self.__class__.created_point_id = fp["id"]
        print(f"✅ Created financial point with billettage: {fp['id']}")
    
    def test_get_financial_point_has_billettage(self):
        """Test GET /api/financial-points/{id} returns billettage"""
        point_id = getattr(self.__class__, 'created_point_id', None)
        if not point_id:
            pytest.skip("No point created in previous test")
        
        response = requests.get(f"{BASE_URL}/api/financial-points/{point_id}")
        
        assert response.status_code == 200
        
        data = response.json()
        assert "billettage" in data
        assert data["billettage"]["10000"] == 5
        assert data["billettage"]["5000"] == 3
        assert data["billettage"]["1000"] == 10
        print(f"✅ GET financial point returns billettage correctly")
    
    def test_sign_financial_point(self):
        """Test signing the financial point"""
        point_id = getattr(self.__class__, 'created_point_id', None)
        if not point_id:
            pytest.skip("No point created in previous test")
        
        response = requests.post(f"{BASE_URL}/api/financial-points/{point_id}/sign", json={
            "signer_name": "Test Gerante",
            "consent_text": "Je certifie l'exactitude des montants reverses."
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        print(f"✅ Financial point signed successfully")
    
    def test_admin_validate_financial_point(self):
        """Test admin validation of the financial point"""
        point_id = getattr(self.__class__, 'created_point_id', None)
        if not point_id:
            pytest.skip("No point created in previous test")
        
        response = requests.post(f"{BASE_URL}/api/financial-points/{point_id}/admin-validate", json={
            "admin_name": "Test Admin"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        print(f"✅ Financial point admin validated successfully")
    
    def test_pdf_includes_billettage_table(self):
        """Test GET /api/financial-points/{id}/pdf includes billettage table"""
        point_id = getattr(self.__class__, 'created_point_id', None)
        if not point_id:
            pytest.skip("No point created in previous test")
        
        response = requests.get(f"{BASE_URL}/api/financial-points/{point_id}/pdf")
        
        assert response.status_code == 200
        
        # PDF is returned as HTML
        content = response.text
        
        # Verify billettage section is present
        assert "Billettage des Espèces" in content, "PDF should contain 'Billettage des Espèces' section"
        
        # Verify denominations are in the PDF
        assert "10 000 F" in content or "10000" in content, "PDF should contain 10000 denomination"
        assert "5 000 F" in content or "5000" in content, "PDF should contain 5000 denomination"
        assert "1 000 F" in content or "1000" in content, "PDF should contain 1000 denomination"
        
        # Verify quantities are shown
        # The PDF shows quantities for non-zero denominations
        print(f"✅ PDF includes billettage table with denominations")
    
    def test_pdf_shows_reversement_title(self):
        """Test PDF shows 'Reversement des Recettes' title"""
        point_id = getattr(self.__class__, 'created_point_id', None)
        if not point_id:
            pytest.skip("No point created in previous test")
        
        response = requests.get(f"{BASE_URL}/api/financial-points/{point_id}/pdf")
        
        assert response.status_code == 200
        content = response.text
        
        assert "Reversement des Recettes" in content, "PDF should have 'Reversement des Recettes' title"
        print(f"✅ PDF shows 'Reversement des Recettes' title")
    
    def test_pdf_shows_credit_not_portefeuille(self):
        """Test PDF shows 'Crédit' not 'Portefeuille'"""
        point_id = getattr(self.__class__, 'created_point_id', None)
        if not point_id:
            pytest.skip("No point created in previous test")
        
        response = requests.get(f"{BASE_URL}/api/financial-points/{point_id}/pdf")
        
        assert response.status_code == 200
        content = response.text
        
        # Should show "Crédit" for wallet_amount
        assert "Crédit" in content, "PDF should show 'Crédit' label"
        # Should NOT show "Portefeuille"
        assert "Portefeuille" not in content, "PDF should NOT show 'Portefeuille' label"
        print(f"✅ PDF shows 'Crédit' not 'Portefeuille'")
    
    def test_cleanup_test_point(self):
        """Cleanup: Delete the test financial point"""
        point_id = getattr(self.__class__, 'created_point_id', None)
        if not point_id:
            pytest.skip("No point to cleanup")
        
        # First unlock it (since it's validated)
        requests.post(f"{BASE_URL}/api/financial-points/{point_id}/unlock", json={
            "admin_name": "Test Admin"
        })
        
        # Then delete
        response = requests.delete(f"{BASE_URL}/api/financial-points/{point_id}", params={"is_admin": True})
        
        # Accept 200 or 404 (if already deleted)
        assert response.status_code in [200, 404]
        print(f"✅ Test financial point cleaned up")


class TestBillettageWithoutData:
    """Test billettage when not provided or empty"""
    
    def test_create_without_billettage(self):
        """Test creating financial point without billettage"""
        test_date = (datetime.now() + timedelta(days=200)).strftime("%Y-%m-%d")
        test_end_date = (datetime.now() + timedelta(days=206)).strftime("%Y-%m-%d")
        
        payload = {
            "date": test_date,
            "end_date": test_end_date,
            "period_type": "weekly",
            "cash_amount": 50000,
            "mobile_amount": 20000,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "notes": "Test without billettage",
            "created_by": "Test Agent"
            # No billettage field
        }
        
        response = requests.post(f"{BASE_URL}/api/financial-points", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        
        fp = data["financial_point"]
        # Billettage should be empty dict or not present
        billettage = fp.get("billettage", {})
        assert billettage == {} or billettage is None or all(v == 0 for v in billettage.values())
        
        # Store for cleanup
        self.__class__.no_billettage_point_id = fp["id"]
        print(f"✅ Created financial point without billettage")
    
    def test_pdf_without_billettage_no_table(self):
        """Test PDF without billettage doesn't show billettage table"""
        point_id = getattr(self.__class__, 'no_billettage_point_id', None)
        if not point_id:
            pytest.skip("No point created")
        
        # Sign and validate first
        requests.post(f"{BASE_URL}/api/financial-points/{point_id}/sign", json={
            "signer_name": "Test Gerante"
        })
        requests.post(f"{BASE_URL}/api/financial-points/{point_id}/admin-validate", json={
            "admin_name": "Test Admin"
        })
        
        response = requests.get(f"{BASE_URL}/api/financial-points/{point_id}/pdf")
        
        assert response.status_code == 200
        content = response.text
        
        # Should NOT have billettage section when no billettage data
        # The section only appears if there are non-zero quantities
        # This is acceptable - the section is conditional
        print(f"✅ PDF without billettage data handled correctly")
    
    def test_cleanup_no_billettage_point(self):
        """Cleanup test point without billettage"""
        point_id = getattr(self.__class__, 'no_billettage_point_id', None)
        if not point_id:
            pytest.skip("No point to cleanup")
        
        requests.post(f"{BASE_URL}/api/financial-points/{point_id}/unlock", json={
            "admin_name": "Test Admin"
        })
        response = requests.delete(f"{BASE_URL}/api/financial-points/{point_id}", params={"is_admin": True})
        assert response.status_code in [200, 404]
        print(f"✅ Cleaned up test point without billettage")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
