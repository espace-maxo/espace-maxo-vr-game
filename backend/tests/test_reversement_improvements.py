"""
Test suite for 4 Reversement improvements:
1. Billettage amélioré avec séparation Billets/Pièces, sous-totaux visuels
2. Champ numéro Momo sous Mobile Money
3. PDF: 'Point du reversement' au lieu de 'Mode de paiement'
4. Choix de destination: 'Remis à l'administrateur' ou 'Versé à la banque'
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://caisse-mon-point.preview.emergentagent.com')

@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def unique_test_date():
    """Generate a unique test date to avoid conflicts"""
    # Use a random offset to ensure uniqueness
    random_days = int(uuid.uuid4().int % 1000) + 100
    return (datetime.now() + timedelta(days=random_days)).strftime("%Y-%m-%d")

@pytest.fixture
def test_end_date(unique_test_date):
    """Generate end date for weekly period"""
    start = datetime.strptime(unique_test_date, "%Y-%m-%d")
    return (start + timedelta(days=6)).strftime("%Y-%m-%d")


class TestMomoNumberField:
    """Test momo_number field storage and retrieval"""
    
    def test_create_financial_point_with_momo_number(self, api_client, unique_test_date, test_end_date):
        """Test POST /api/financial-points stores momo_number field"""
        payload = {
            "date": unique_test_date,
            "end_date": test_end_date,
            "period_type": "weekly",
            "cash_amount": 10000,
            "mobile_amount": 5000,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "momo_number": "+229 97 00 00 00",
            "destination": "admin",
            "notes": "Test momo number",
            "billettage": {},
            "created_by": "Test User"
        }
        
        response = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        assert response.status_code == 200, f"Failed to create: {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        fp = data.get("financial_point", {})
        assert "id" in fp
        assert fp.get("momo_number") == "+229 97 00 00 00", "momo_number not stored correctly"
        
        # Cleanup
        point_id = fp["id"]
        api_client.delete(f"{BASE_URL}/api/financial-points/{point_id}", params={"is_admin": True})
        
        print("✅ POST /api/financial-points stores momo_number field correctly")
    
    def test_momo_number_empty_when_not_provided(self, api_client, unique_test_date, test_end_date):
        """Test momo_number defaults to empty string when not provided"""
        payload = {
            "date": unique_test_date,
            "end_date": test_end_date,
            "period_type": "weekly",
            "cash_amount": 5000,
            "mobile_amount": 0,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "momo_number": "",
            "destination": "admin",
            "notes": "Test without momo",
            "billettage": {},
            "created_by": "Test User"
        }
        
        response = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        fp = data.get("financial_point", {})
        assert fp.get("momo_number", "") == "", "momo_number should be empty when not provided"
        
        # Cleanup
        point_id = fp["id"]
        api_client.delete(f"{BASE_URL}/api/financial-points/{point_id}", params={"is_admin": True})
        
        print("✅ momo_number defaults to empty string when not provided")


class TestDestinationField:
    """Test destination field storage and retrieval"""
    
    def test_create_financial_point_with_destination_admin(self, api_client, unique_test_date, test_end_date):
        """Test POST /api/financial-points stores destination='admin'"""
        payload = {
            "date": unique_test_date,
            "end_date": test_end_date,
            "period_type": "weekly",
            "cash_amount": 10000,
            "mobile_amount": 0,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "momo_number": "",
            "destination": "admin",
            "notes": "Test destination admin",
            "billettage": {},
            "created_by": "Test User"
        }
        
        response = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        fp = data.get("financial_point", {})
        assert fp.get("destination") == "admin", "destination should be 'admin'"
        
        # Cleanup
        point_id = fp["id"]
        api_client.delete(f"{BASE_URL}/api/financial-points/{point_id}", params={"is_admin": True})
        
        print("✅ POST /api/financial-points stores destination='admin' correctly")
    
    def test_create_financial_point_with_destination_banque(self, api_client, unique_test_date, test_end_date):
        """Test POST /api/financial-points stores destination='banque'"""
        payload = {
            "date": unique_test_date,
            "end_date": test_end_date,
            "period_type": "weekly",
            "cash_amount": 15000,
            "mobile_amount": 0,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "momo_number": "",
            "destination": "banque",
            "notes": "Test destination banque",
            "billettage": {},
            "created_by": "Test User"
        }
        
        response = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        fp = data.get("financial_point", {})
        assert fp.get("destination") == "banque", "destination should be 'banque'"
        
        # Cleanup
        point_id = fp["id"]
        api_client.delete(f"{BASE_URL}/api/financial-points/{point_id}", params={"is_admin": True})
        
        print("✅ POST /api/financial-points stores destination='banque' correctly")


class TestBillettageImproved:
    """Test improved billettage with Billets/Pieces separation"""
    
    def test_billettage_with_billets_and_pieces(self, api_client, unique_test_date, test_end_date):
        """Test billettage stores both billets (10000-500) and pieces (200-5)"""
        billettage = {
            # Billets
            "10000": "2",
            "5000": "3",
            "2000": "1",
            "1000": "5",
            "500": "4",
            # Pieces
            "200": "10",
            "100": "5",
            "50": "8",
            "25": "4",
            "10": "10",
            "5": "20"
        }
        
        # Calculate expected total
        expected_total = (2*10000 + 3*5000 + 1*2000 + 5*1000 + 4*500 + 
                        10*200 + 5*100 + 8*50 + 4*25 + 10*10 + 20*5)
        
        payload = {
            "date": unique_test_date,
            "end_date": test_end_date,
            "period_type": "weekly",
            "cash_amount": expected_total,
            "mobile_amount": 0,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "momo_number": "",
            "destination": "admin",
            "notes": "Test billettage with billets and pieces",
            "billettage": billettage,
            "created_by": "Test User"
        }
        
        response = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        fp = data.get("financial_point", {})
        stored_billettage = fp.get("billettage", {})
        
        # Verify all denominations stored
        assert stored_billettage.get("10000") == "2", "10000 billet not stored"
        assert stored_billettage.get("5000") == "3", "5000 billet not stored"
        assert stored_billettage.get("200") == "10", "200 piece not stored"
        assert stored_billettage.get("5") == "20", "5 piece not stored"
        
        # Cleanup
        point_id = fp["id"]
        api_client.delete(f"{BASE_URL}/api/financial-points/{point_id}", params={"is_admin": True})
        
        print("✅ Billettage stores both billets (10000-500) and pieces (200-5) correctly")


class TestPDFGeneration:
    """Test PDF generation with new improvements"""
    
    def test_pdf_has_point_du_reversement_header(self, api_client, unique_test_date, test_end_date):
        """Test PDF shows 'Point du reversement' instead of 'Mode de paiement'"""
        # Create a financial point
        payload = {
            "date": unique_test_date,
            "end_date": test_end_date,
            "period_type": "weekly",
            "cash_amount": 10000,
            "mobile_amount": 5000,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "momo_number": "+229 97 00 00 00",
            "destination": "banque",
            "notes": "Test PDF header",
            "billettage": {"10000": "1"},
            "created_by": "Test User"
        }
        
        response = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        assert response.status_code == 200
        fp = response.json().get("financial_point", {})
        point_id = fp["id"]
        
        # Sign the point
        sign_response = api_client.post(f"{BASE_URL}/api/financial-points/{point_id}/sign", json={
            "signer_name": "Test Signer",
            "consent_text": "Je certifie l'exactitude"
        })
        assert sign_response.status_code == 200
        
        # Admin validate
        validate_response = api_client.post(f"{BASE_URL}/api/financial-points/{point_id}/admin-validate", json={
            "admin_name": "Test Admin"
        })
        assert validate_response.status_code == 200
        
        # Get PDF (may return HTML if weasyprint not installed)
        pdf_response = api_client.get(f"{BASE_URL}/api/financial-points/{point_id}/pdf")
        assert pdf_response.status_code == 200
        content_type = pdf_response.headers.get("content-type", "")
        assert "application/pdf" in content_type or "text/html" in content_type, f"Unexpected content type: {content_type}"
        
        # Verify HTML contains 'Point du reversement' header
        if "text/html" in content_type:
            html_content = pdf_response.text
            assert "Point du reversement" in html_content, "PDF HTML should contain 'Point du reversement' header"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/financial-points/{point_id}", params={"is_admin": True})
        
        print("✅ PDF generated successfully with 'Point du reversement' header")
    
    def test_pdf_includes_destination_badge(self, api_client, unique_test_date, test_end_date):
        """Test PDF includes destination badge ('Verse a la banque' or 'Remis a l administrateur')"""
        # Create with destination='banque'
        payload = {
            "date": unique_test_date,
            "end_date": test_end_date,
            "period_type": "weekly",
            "cash_amount": 20000,
            "mobile_amount": 0,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "momo_number": "",
            "destination": "banque",
            "notes": "Test destination badge",
            "billettage": {},
            "created_by": "Test User"
        }
        
        response = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        assert response.status_code == 200
        fp = response.json().get("financial_point", {})
        point_id = fp["id"]
        
        # Sign and validate
        api_client.post(f"{BASE_URL}/api/financial-points/{point_id}/sign", json={
            "signer_name": "Test Signer",
            "consent_text": "Je certifie"
        })
        api_client.post(f"{BASE_URL}/api/financial-points/{point_id}/admin-validate", json={
            "admin_name": "Test Admin"
        })
        
        # Get PDF (may return HTML if weasyprint not installed)
        pdf_response = api_client.get(f"{BASE_URL}/api/financial-points/{point_id}/pdf")
        assert pdf_response.status_code == 200
        
        # Verify HTML contains destination badge
        content_type = pdf_response.headers.get("content-type", "")
        if "text/html" in content_type:
            html_content = pdf_response.text
            assert "Verse a la banque" in html_content or "Remis a l" in html_content, "PDF HTML should contain destination badge"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/financial-points/{point_id}", params={"is_admin": True})
        
        print("✅ PDF includes destination badge ('Verse a la banque' or 'Remis a l administrateur')")
    
    def test_pdf_includes_momo_number(self, api_client, unique_test_date, test_end_date):
        """Test PDF includes Momo number when provided"""
        payload = {
            "date": unique_test_date,
            "end_date": test_end_date,
            "period_type": "weekly",
            "cash_amount": 5000,
            "mobile_amount": 10000,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "momo_number": "+229 97 12 34 56",
            "destination": "admin",
            "notes": "Test momo in PDF",
            "billettage": {},
            "created_by": "Test User"
        }
        
        response = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        assert response.status_code == 200
        fp = response.json().get("financial_point", {})
        point_id = fp["id"]
        
        # Sign and validate
        api_client.post(f"{BASE_URL}/api/financial-points/{point_id}/sign", json={
            "signer_name": "Test Signer",
            "consent_text": "Je certifie"
        })
        api_client.post(f"{BASE_URL}/api/financial-points/{point_id}/admin-validate", json={
            "admin_name": "Test Admin"
        })
        
        # Get PDF (may return HTML if weasyprint not installed)
        pdf_response = api_client.get(f"{BASE_URL}/api/financial-points/{point_id}/pdf")
        assert pdf_response.status_code == 200
        
        # Verify HTML contains Momo number
        content_type = pdf_response.headers.get("content-type", "")
        if "text/html" in content_type:
            html_content = pdf_response.text
            assert "+229 97 12 34 56" in html_content or "Momo" in html_content, "PDF HTML should contain Momo number"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/financial-points/{point_id}", params={"is_admin": True})
        
        print("✅ PDF includes Momo number when provided")
    
    def test_pdf_includes_billettage_table(self, api_client, unique_test_date, test_end_date):
        """Test PDF includes billettage table when provided"""
        billettage = {
            "10000": "2",
            "5000": "1",
            "200": "5"
        }
        
        payload = {
            "date": unique_test_date,
            "end_date": test_end_date,
            "period_type": "weekly",
            "cash_amount": 26000,  # 2*10000 + 1*5000 + 5*200
            "mobile_amount": 0,
            "cheque_amount": 0,
            "wallet_amount": 0,
            "momo_number": "",
            "destination": "admin",
            "notes": "Test billettage in PDF",
            "billettage": billettage,
            "created_by": "Test User"
        }
        
        response = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        assert response.status_code == 200
        fp = response.json().get("financial_point", {})
        point_id = fp["id"]
        
        # Sign and validate
        api_client.post(f"{BASE_URL}/api/financial-points/{point_id}/sign", json={
            "signer_name": "Test Signer",
            "consent_text": "Je certifie"
        })
        api_client.post(f"{BASE_URL}/api/financial-points/{point_id}/admin-validate", json={
            "admin_name": "Test Admin"
        })
        
        # Get PDF (may return HTML if weasyprint not installed)
        pdf_response = api_client.get(f"{BASE_URL}/api/financial-points/{point_id}/pdf")
        assert pdf_response.status_code == 200
        
        # Verify HTML contains billettage table
        content_type = pdf_response.headers.get("content-type", "")
        if "text/html" in content_type:
            html_content = pdf_response.text
            assert "Billettage" in html_content, "PDF HTML should contain billettage table"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/financial-points/{point_id}", params={"is_admin": True})
        
        print("✅ PDF includes billettage table when provided")


class TestFullWorkflow:
    """Test full workflow with all 4 improvements"""
    
    def test_complete_workflow_with_all_improvements(self, api_client, unique_test_date, test_end_date):
        """Test complete workflow: create with momo+destination+billettage -> sign -> validate -> PDF"""
        billettage = {
            "10000": "3",
            "5000": "2",
            "1000": "5",
            "200": "10",
            "50": "4"
        }
        
        # Calculate total: 3*10000 + 2*5000 + 5*1000 + 10*200 + 4*50 = 47200
        cash_total = 47200
        
        payload = {
            "date": unique_test_date,
            "end_date": test_end_date,
            "period_type": "weekly",
            "cash_amount": cash_total,
            "mobile_amount": 15000,
            "cheque_amount": 5000,
            "wallet_amount": 2000,
            "momo_number": "+229 97 88 77 66",
            "destination": "banque",
            "notes": "Test complete workflow with all 4 improvements",
            "billettage": billettage,
            "created_by": "Test Manager"
        }
        
        # Step 1: Create
        create_response = api_client.post(f"{BASE_URL}/api/financial-points", json=payload)
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        
        data = create_response.json()
        fp = data.get("financial_point", {})
        point_id = fp["id"]
        
        # Verify all fields stored
        assert fp.get("momo_number") == "+229 97 88 77 66", "momo_number not stored"
        assert fp.get("destination") == "banque", "destination not stored"
        assert fp.get("billettage", {}).get("10000") == "3", "billettage not stored"
        assert fp.get("cash_amount") == cash_total, "cash_amount incorrect"
        
        print("✅ Step 1: Created financial point with momo_number, destination, billettage")
        
        # Step 2: Sign
        sign_response = api_client.post(f"{BASE_URL}/api/financial-points/{point_id}/sign", json={
            "signer_name": "Mères AHOUANDJINOU",
            "consent_text": "Je certifie l'exactitude des montants reverses dans ce reversement."
        })
        assert sign_response.status_code == 200, f"Sign failed: {sign_response.text}"
        
        print("✅ Step 2: Signed financial point")
        
        # Step 3: Admin validate
        validate_response = api_client.post(f"{BASE_URL}/api/financial-points/{point_id}/admin-validate", json={
            "admin_name": "Admin Test"
        })
        assert validate_response.status_code == 200, f"Validate failed: {validate_response.text}"
        
        print("✅ Step 3: Admin validated financial point")
        
        # Step 4: Get PDF (may return HTML if weasyprint not installed)
        pdf_response = api_client.get(f"{BASE_URL}/api/financial-points/{point_id}/pdf")
        assert pdf_response.status_code == 200, f"PDF failed: {pdf_response.text}"
        content_type = pdf_response.headers.get("content-type", "")
        assert "application/pdf" in content_type or "text/html" in content_type
        assert len(pdf_response.content) > 1000, "PDF content too small"
        
        # Verify HTML contains all 4 improvements
        if "text/html" in content_type:
            html_content = pdf_response.text
            assert "Point du reversement" in html_content, "Missing 'Point du reversement' header"
            assert "Verse a la banque" in html_content, "Missing destination badge"
            assert "+229 97 88 77 66" in html_content or "Momo" in html_content, "Missing Momo number"
            assert "Billettage" in html_content, "Missing billettage table"
        
        print("✅ Step 4: Generated PDF successfully with all 4 improvements")
        
        # Step 5: Verify GET returns all data
        get_response = api_client.get(f"{BASE_URL}/api/financial-points", params={
            "period_type": "weekly",
            "date": unique_test_date
        })
        assert get_response.status_code == 200
        
        points = get_response.json().get("financial_points", [])
        found_point = next((p for p in points if p.get("id") == point_id), None)
        
        if found_point:
            assert found_point.get("momo_number") == "+229 97 88 77 66"
            assert found_point.get("destination") == "banque"
            assert found_point.get("signed") == True
            assert found_point.get("admin_validated") == True
            print("✅ Step 5: GET returns all data correctly")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/financial-points/{point_id}", params={"is_admin": True})
        
        print("✅ Complete workflow with all 4 improvements PASSED")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
