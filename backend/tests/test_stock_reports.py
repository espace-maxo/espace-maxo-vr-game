"""
Test Stock Reports Feature - Rapports Stock filtrables avec export PDF et Excel
Tests: GET /api/stock/reports with filters, PDF export, Excel export
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestStockReportsAPI:
    """Test GET /api/stock/reports endpoint with various filters"""
    
    def test_reports_basic(self):
        """Test basic reports endpoint returns expected structure"""
        response = requests.get(f"{BASE_URL}/api/stock/reports")
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "movements" in data
        assert "total_movements" in data
        assert "total_quantity" in data
        assert "total_value" in data
        assert "by_type" in data
        assert "top_products" in data
        assert "filters" in data
        
        # Verify data types
        assert isinstance(data["movements"], list)
        assert isinstance(data["total_movements"], int)
        assert isinstance(data["total_quantity"], (int, float))
        assert isinstance(data["total_value"], (int, float))
        assert isinstance(data["by_type"], dict)
        assert isinstance(data["top_products"], list)
    
    def test_reports_filter_type_entree(self):
        """Test filtering by type=entree returns only entries"""
        response = requests.get(f"{BASE_URL}/api/stock/reports?type=entree")
        assert response.status_code == 200
        data = response.json()
        
        # Verify filter is applied
        assert data["filters"]["type"] == "entree"
        
        # Verify all movements are entries
        for m in data["movements"]:
            assert m["movement_type"] in ["entree", "retour_fournisseur"], f"Expected entree/retour_fournisseur, got {m['movement_type']}"
    
    def test_reports_filter_type_sortie(self):
        """Test filtering by type=sortie returns only exits"""
        response = requests.get(f"{BASE_URL}/api/stock/reports?type=sortie")
        assert response.status_code == 200
        data = response.json()
        
        # Verify filter is applied
        assert data["filters"]["type"] == "sortie"
        
        # Verify all movements are sorties
        for m in data["movements"]:
            assert m["movement_type"] == "sortie", f"Expected sortie, got {m['movement_type']}"
    
    def test_reports_filter_search_product(self):
        """Test filtering by product name search"""
        response = requests.get(f"{BASE_URL}/api/stock/reports?search=Poulet")
        assert response.status_code == 200
        data = response.json()
        
        # Verify filter is applied
        assert data["filters"]["search"] == "Poulet"
        
        # Verify all movements contain Poulet in product_name
        for m in data["movements"]:
            assert "poulet" in m["product_name"].lower(), f"Expected Poulet in name, got {m['product_name']}"
    
    def test_reports_filter_date_from(self):
        """Test filtering by date_from"""
        response = requests.get(f"{BASE_URL}/api/stock/reports?date_from=2026-04-16")
        assert response.status_code == 200
        data = response.json()
        
        # Verify filter is applied
        assert data["filters"]["date_from"] == "2026-04-16"
        
        # Verify all movements are on or after the date
        for m in data["movements"]:
            assert m["created_at"] >= "2026-04-16", f"Movement date {m['created_at']} is before filter date"
    
    def test_reports_by_type_aggregation(self):
        """Test that by_type aggregation is correct"""
        response = requests.get(f"{BASE_URL}/api/stock/reports")
        assert response.status_code == 200
        data = response.json()
        
        # Verify by_type structure
        for type_name, type_data in data["by_type"].items():
            assert "count" in type_data
            assert "quantity" in type_data
            assert "value" in type_data
            assert isinstance(type_data["count"], int)
            assert isinstance(type_data["quantity"], (int, float))
            assert isinstance(type_data["value"], (int, float))
    
    def test_reports_top_products(self):
        """Test that top_products is returned and sorted by value"""
        response = requests.get(f"{BASE_URL}/api/stock/reports")
        assert response.status_code == 200
        data = response.json()
        
        if len(data["top_products"]) > 1:
            # Verify sorted by value descending
            for i in range(len(data["top_products"]) - 1):
                assert data["top_products"][i]["value"] >= data["top_products"][i+1]["value"], "top_products not sorted by value"
        
        # Verify structure
        for tp in data["top_products"]:
            assert "name" in tp
            assert "count" in tp
            assert "quantity" in tp
            assert "value" in tp


class TestStockReportsExportPDF:
    """Test GET /api/stock/reports/export/pdf endpoint"""
    
    def test_export_pdf_basic(self):
        """Test PDF export returns valid PDF"""
        response = requests.get(f"{BASE_URL}/api/stock/reports/export/pdf")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert len(response.content) > 0
        
        # Verify PDF header
        assert response.content[:4] == b'%PDF', "Response is not a valid PDF"
    
    def test_export_pdf_with_type_filter(self):
        """Test PDF export with type filter"""
        response = requests.get(f"{BASE_URL}/api/stock/reports/export/pdf?type=entree")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert response.content[:4] == b'%PDF'
    
    def test_export_pdf_with_date_filter(self):
        """Test PDF export with date filter"""
        response = requests.get(f"{BASE_URL}/api/stock/reports/export/pdf?date_from=2026-04-16")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
    
    def test_export_pdf_with_search_filter(self):
        """Test PDF export with search filter"""
        response = requests.get(f"{BASE_URL}/api/stock/reports/export/pdf?search=Poulet")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"


class TestStockReportsExportExcel:
    """Test GET /api/stock/reports/export/excel endpoint"""
    
    def test_export_excel_basic(self):
        """Test Excel export returns valid xlsx"""
        response = requests.get(f"{BASE_URL}/api/stock/reports/export/excel")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        assert len(response.content) > 0
        
        # Verify xlsx header (PK zip signature)
        assert response.content[:2] == b'PK', "Response is not a valid xlsx (zip) file"
    
    def test_export_excel_with_type_filter(self):
        """Test Excel export with type filter"""
        response = requests.get(f"{BASE_URL}/api/stock/reports/export/excel?type=sortie")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        assert response.content[:2] == b'PK'
    
    def test_export_excel_with_date_filter(self):
        """Test Excel export with date filter"""
        response = requests.get(f"{BASE_URL}/api/stock/reports/export/excel?date_from=2026-04-16&date_to=2026-04-16")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    
    def test_export_excel_with_search_filter(self):
        """Test Excel export with search filter"""
        response = requests.get(f"{BASE_URL}/api/stock/reports/export/excel?search=Poulet")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class TestStockAuth:
    """Test stock authentication for reports access"""
    
    def test_login_admin(self):
        """Test admin login works"""
        response = requests.post(f"{BASE_URL}/api/stock/auth/login", json={
            "username": "admin",
            "password": "Admin2026"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["user"]["username"] == "admin"
        assert data["user"]["role"] == "administrateur"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
