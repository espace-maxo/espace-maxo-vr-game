"""
Test suite for OHADA Journal endpoint (GET /api/journal/ohada)
Iteration 85 - Testing OHADA accounting journal features

Tests:
- Basic endpoint with date range
- Response structure validation (entries, total_debit, total_credit, balanced, accounts, ohada_plan)
- Account filter parameter
- Search filter parameter
- Invalid date format returns 400
- Balance verification (debit == credit)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestJournalOhadaEndpoint:
    """Tests for GET /api/journal/ohada endpoint"""

    def test_basic_endpoint_with_date_range(self):
        """Test basic endpoint call with valid date range"""
        response = requests.get(
            f"{BASE_URL}/api/journal/ohada",
            params={"start_date": "2026-01-01", "end_date": "2026-02-28"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "entries" in data, "Response should contain 'entries'"
        assert "total_debit" in data, "Response should contain 'total_debit'"
        assert "total_credit" in data, "Response should contain 'total_credit'"
        assert "balanced" in data, "Response should contain 'balanced'"
        assert "accounts" in data, "Response should contain 'accounts'"
        assert "ohada_plan" in data, "Response should contain 'ohada_plan'"
        assert "start_date" in data, "Response should contain 'start_date'"
        assert "end_date" in data, "Response should contain 'end_date'"
        
        print(f"SUCCESS: Basic endpoint returns correct structure with {len(data['entries'])} entries")

    def test_response_balance_verification(self):
        """Test that total_debit equals total_credit (balanced)"""
        response = requests.get(
            f"{BASE_URL}/api/journal/ohada",
            params={"start_date": "2026-01-01", "end_date": "2026-02-28"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify balance
        assert data["balanced"] == True, "Journal should be balanced"
        assert data["total_debit"] == data["total_credit"], \
            f"Debit ({data['total_debit']}) should equal Credit ({data['total_credit']})"
        
        print(f"SUCCESS: Journal is balanced - Debit: {data['total_debit']}, Credit: {data['total_credit']}")

    def test_entry_structure(self):
        """Test that each entry has the correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/journal/ohada",
            params={"start_date": "2026-01-01", "end_date": "2026-02-28"}
        )
        assert response.status_code == 200
        data = response.json()
        
        if len(data["entries"]) > 0:
            entry = data["entries"][0]
            required_fields = ["date", "libelle", "debit_num", "debit_label", 
                             "credit_num", "credit_label", "amount", "source", "ref_id", "author"]
            for field in required_fields:
                assert field in entry, f"Entry should contain '{field}'"
            
            # Verify amount is positive
            assert entry["amount"] >= 0, "Entry amount should be non-negative"
            
            print(f"SUCCESS: Entry structure is correct with all required fields")
        else:
            print("INFO: No entries found in date range, skipping entry structure test")

    def test_account_filter(self):
        """Test filtering by account number (e.g., 571 for Caisse)"""
        # First get all entries
        response_all = requests.get(
            f"{BASE_URL}/api/journal/ohada",
            params={"start_date": "2026-01-01", "end_date": "2026-02-28"}
        )
        assert response_all.status_code == 200
        data_all = response_all.json()
        
        # Then filter by account 571
        response_filtered = requests.get(
            f"{BASE_URL}/api/journal/ohada",
            params={"start_date": "2026-01-01", "end_date": "2026-02-28", "account": "571"}
        )
        assert response_filtered.status_code == 200
        data_filtered = response_filtered.json()
        
        # Verify all filtered entries have account 571 in debit or credit
        for entry in data_filtered["entries"]:
            assert entry["debit_num"] == "571" or entry["credit_num"] == "571", \
                f"Filtered entry should have account 571 in debit or credit: {entry}"
        
        print(f"SUCCESS: Account filter works - {len(data_filtered['entries'])} entries with account 571")

    def test_search_filter(self):
        """Test search filter on libelle/author/source"""
        # Search for "Admin" in author
        response = requests.get(
            f"{BASE_URL}/api/journal/ohada",
            params={"start_date": "2026-01-01", "end_date": "2026-02-28", "search": "Admin"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify search results contain "admin" (case insensitive)
        for entry in data["entries"]:
            search_text = f"{entry.get('libelle', '')} {entry.get('author', '')} {entry.get('source', '')}".lower()
            assert "admin" in search_text, f"Search result should contain 'admin': {entry}"
        
        print(f"SUCCESS: Search filter works - {len(data['entries'])} entries matching 'Admin'")

    def test_search_filter_facture(self):
        """Test search filter for 'facture' source"""
        response = requests.get(
            f"{BASE_URL}/api/journal/ohada",
            params={"start_date": "2026-01-01", "end_date": "2026-02-28", "search": "facture"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify search results contain "facture"
        for entry in data["entries"]:
            search_text = f"{entry.get('libelle', '')} {entry.get('author', '')} {entry.get('source', '')}".lower()
            assert "facture" in search_text, f"Search result should contain 'facture': {entry}"
        
        print(f"SUCCESS: Search filter for 'facture' works - {len(data['entries'])} entries")

    def test_invalid_date_format_returns_400(self):
        """Test that invalid date format returns 400 error"""
        response = requests.get(
            f"{BASE_URL}/api/journal/ohada",
            params={"start_date": "invalid-date"}
        )
        assert response.status_code == 400, f"Expected 400 for invalid date, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data, "Error response should contain 'detail'"
        assert "Format de date invalide" in data["detail"], \
            f"Error message should mention invalid date format: {data['detail']}"
        
        print(f"SUCCESS: Invalid date format returns 400 with proper error message")

    def test_invalid_date_format_wrong_separator(self):
        """Test that date with wrong separator returns 400"""
        response = requests.get(
            f"{BASE_URL}/api/journal/ohada",
            params={"start_date": "2026/01/01"}
        )
        assert response.status_code == 400, f"Expected 400 for wrong date separator, got {response.status_code}"
        print(f"SUCCESS: Date with wrong separator returns 400")

    def test_accounts_summary(self):
        """Test that accounts summary is correctly calculated"""
        response = requests.get(
            f"{BASE_URL}/api/journal/ohada",
            params={"start_date": "2026-01-01", "end_date": "2026-02-28"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify accounts structure
        for account in data["accounts"]:
            assert "num" in account, "Account should have 'num'"
            assert "label" in account, "Account should have 'label'"
            assert "debit" in account, "Account should have 'debit'"
            assert "credit" in account, "Account should have 'credit'"
            
            # Verify amounts are non-negative
            assert account["debit"] >= 0, f"Account debit should be non-negative: {account}"
            assert account["credit"] >= 0, f"Account credit should be non-negative: {account}"
        
        print(f"SUCCESS: Accounts summary structure is correct with {len(data['accounts'])} accounts")

    def test_ohada_plan_structure(self):
        """Test that OHADA plan is included in response"""
        response = requests.get(
            f"{BASE_URL}/api/journal/ohada",
            params={"start_date": "2026-01-01", "end_date": "2026-02-28"}
        )
        assert response.status_code == 200
        data = response.json()
        
        ohada_plan = data["ohada_plan"]
        assert isinstance(ohada_plan, dict), "OHADA plan should be a dictionary"
        
        # Verify some expected accounts exist
        expected_accounts = ["571_CAISSE", "707_MARCHANDISES", "467_GERANTE"]
        for acc in expected_accounts:
            assert acc in ohada_plan, f"OHADA plan should contain '{acc}'"
            assert "num" in ohada_plan[acc], f"Account {acc} should have 'num'"
            assert "label" in ohada_plan[acc], f"Account {acc} should have 'label'"
        
        print(f"SUCCESS: OHADA plan structure is correct with {len(ohada_plan)} accounts")

    def test_single_date_range(self):
        """Test endpoint with same start and end date"""
        response = requests.get(
            f"{BASE_URL}/api/journal/ohada",
            params={"start_date": "2026-01-15", "end_date": "2026-01-15"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify dates in response
        assert data["start_date"] == "2026-01-15"
        assert data["end_date"] == "2026-01-15"
        
        print(f"SUCCESS: Single date range works - {len(data['entries'])} entries on 2026-01-15")

    def test_empty_date_range(self):
        """Test endpoint with date range that has no data"""
        response = requests.get(
            f"{BASE_URL}/api/journal/ohada",
            params={"start_date": "2020-01-01", "end_date": "2020-01-31"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should return empty entries but valid structure
        assert data["entries"] == [], "Should return empty entries for date range with no data"
        assert data["total_debit"] == 0, "Total debit should be 0 for empty range"
        assert data["total_credit"] == 0, "Total credit should be 0 for empty range"
        assert data["balanced"] == True, "Empty journal should still be balanced"
        
        print(f"SUCCESS: Empty date range returns valid empty response")

    def test_combined_filters(self):
        """Test combining account and search filters"""
        response = requests.get(
            f"{BASE_URL}/api/journal/ohada",
            params={
                "start_date": "2026-01-01", 
                "end_date": "2026-02-28",
                "account": "571",
                "search": "facture"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify all entries match both filters
        for entry in data["entries"]:
            # Check account filter
            assert entry["debit_num"] == "571" or entry["credit_num"] == "571", \
                f"Entry should have account 571: {entry}"
            # Check search filter
            search_text = f"{entry.get('libelle', '')} {entry.get('author', '')} {entry.get('source', '')}".lower()
            assert "facture" in search_text, f"Entry should match search 'facture': {entry}"
        
        print(f"SUCCESS: Combined filters work - {len(data['entries'])} entries matching both criteria")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
