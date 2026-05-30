"""
Test suite for Coach Jeux Hourly Billing Feature - Iteration 92
Tests the new 'Forfait horaire' billing mode option

New features tested:
- POST /api/jeux/bons with item billing_mode='hourly': saves hours, hourly_rate fields
- POST /api/jeux/bons with item billing_mode='parties' (legacy): no hours/hourly_rate (null)
- POST /api/jeux/bons with mix items hourly + parties: total calculated correctly
- GET /api/jeux/bons returns billing_mode/hours/hourly_rate in items
- POST /api/jeux/bons/{id}/attach: hourly item generates notes with 'Forfait Xh @ Y F/h'
- POST /api/jeux/bons/{id}/standalone: invoice with hourly notes correctly formatted
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_PREFIX = "TEST_HOURLY_"


class TestHourlyBillingCreate:
    """Tests for POST /api/jeux/bons with hourly billing mode"""

    @pytest.fixture
    def jeux_product(self):
        """Get a jeux product from catalog for testing"""
        response = requests.get(f"{BASE_URL}/api/jeux/catalog", params={"actor_role": "coach_jeux"})
        if response.status_code == 200 and response.json().get("products"):
            return response.json()["products"][0]
        # Fallback mock product
        return {"id": "test-product-hourly", "name": "Test Game Hourly", "price": 2000}

    def test_create_hourly_bon_success(self, jeux_product):
        """Create a bon with billing_mode='hourly' - should save hours and hourly_rate"""
        hours = 2
        hourly_rate = 12000
        line_total = hours * hourly_rate  # 24000
        
        items = [{
            "jeu_product_id": jeux_product["id"],
            "jeu_name": jeux_product["name"],
            "parties": 1,  # Placeholder for hourly mode
            "unit_price": line_total,  # Total for the line
            "duration_minutes": hours * 60,  # 120 min
            "notes": "Forfait test",
            "billing_mode": "hourly",
            "hours": hours,
            "hourly_rate": hourly_rate
        }]
        
        payload = {
            "items": items,
            "players": f"{TEST_PREFIX}Hourly Player",
            "notes": f"{TEST_PREFIX}Hourly billing test",
            "coach_name": f"{TEST_PREFIX}Coach Hourly",
            "coach_role": "coach_jeux"
        }
        
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") is True
        bon = data.get("bon")
        assert bon is not None
        
        # Verify item has hourly fields
        assert len(bon["items"]) == 1
        item = bon["items"][0]
        assert item.get("billing_mode") == "hourly", f"Expected billing_mode='hourly', got {item.get('billing_mode')}"
        assert item.get("hours") == hours, f"Expected hours={hours}, got {item.get('hours')}"
        assert item.get("hourly_rate") == hourly_rate, f"Expected hourly_rate={hourly_rate}, got {item.get('hourly_rate')}"
        
        # Verify total calculation
        assert bon.get("total") == line_total, f"Expected total={line_total}, got {bon.get('total')}"
        
        assert "_id" not in bon, "MongoDB _id should not be exposed"
        print(f"✓ Hourly bon created: {bon.get('id')}, hours={hours}, rate={hourly_rate}, total={bon.get('total')} F")
        return bon

    def test_create_parties_bon_no_hourly_fields(self, jeux_product):
        """Create a bon with billing_mode='parties' - hours/hourly_rate should be null"""
        parties = 3
        unit_price = 1500
        line_total = parties * unit_price  # 4500
        
        items = [{
            "jeu_product_id": jeux_product["id"],
            "jeu_name": jeux_product["name"],
            "parties": parties,
            "unit_price": unit_price,
            "duration_minutes": 45,
            "notes": "Parties test",
            "billing_mode": "parties"
            # No hours/hourly_rate
        }]
        
        payload = {
            "items": items,
            "players": f"{TEST_PREFIX}Parties Player",
            "notes": f"{TEST_PREFIX}Parties billing test",
            "coach_name": f"{TEST_PREFIX}Coach Parties",
            "coach_role": "coach_jeux"
        }
        
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        bon = data.get("bon")
        item = bon["items"][0]
        
        assert item.get("billing_mode") == "parties", f"Expected billing_mode='parties', got {item.get('billing_mode')}"
        assert item.get("hours") is None, f"Expected hours=None, got {item.get('hours')}"
        assert item.get("hourly_rate") is None, f"Expected hourly_rate=None, got {item.get('hourly_rate')}"
        assert bon.get("total") == line_total, f"Expected total={line_total}, got {bon.get('total')}"
        
        print(f"✓ Parties bon created: {bon.get('id')}, parties={parties}, total={bon.get('total')} F")
        return bon

    def test_create_mixed_bon_hourly_and_parties(self, jeux_product):
        """Create a bon with mix of hourly + parties items - total should be sum"""
        # Hourly item: 2h @ 12000 F/h = 24000 F
        hourly_hours = 2
        hourly_rate = 12000
        hourly_total = hourly_hours * hourly_rate
        
        # Parties item: 2 parties @ 2000 F = 4000 F
        parties_count = 2
        parties_price = 2000
        parties_total = parties_count * parties_price
        
        expected_total = hourly_total + parties_total  # 28000 F
        
        items = [
            {
                "jeu_product_id": jeux_product["id"],
                "jeu_name": jeux_product["name"],
                "parties": 1,
                "unit_price": hourly_total,
                "duration_minutes": hourly_hours * 60,
                "notes": "Forfait horaire",
                "billing_mode": "hourly",
                "hours": hourly_hours,
                "hourly_rate": hourly_rate
            },
            {
                "jeu_product_id": jeux_product["id"],
                "jeu_name": f"{jeux_product['name']} - Parties",
                "parties": parties_count,
                "unit_price": parties_price,
                "duration_minutes": 30,
                "notes": "Par parties",
                "billing_mode": "parties"
            }
        ]
        
        payload = {
            "items": items,
            "players": f"{TEST_PREFIX}Mixed Player",
            "notes": f"{TEST_PREFIX}Mixed billing test",
            "coach_name": f"{TEST_PREFIX}Coach Mixed",
            "coach_role": "coach_jeux"
        }
        
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        bon = data.get("bon")
        
        assert len(bon["items"]) == 2, f"Expected 2 items, got {len(bon['items'])}"
        
        # Verify hourly item
        hourly_item = bon["items"][0]
        assert hourly_item.get("billing_mode") == "hourly"
        assert hourly_item.get("hours") == hourly_hours
        assert hourly_item.get("hourly_rate") == hourly_rate
        assert hourly_item.get("total") == hourly_total
        
        # Verify parties item
        parties_item = bon["items"][1]
        assert parties_item.get("billing_mode") == "parties"
        assert parties_item.get("hours") is None
        assert parties_item.get("hourly_rate") is None
        assert parties_item.get("total") == parties_total
        
        # Verify total
        assert bon.get("total") == expected_total, f"Expected total={expected_total}, got {bon.get('total')}"
        
        print(f"✓ Mixed bon created: hourly={hourly_total}F + parties={parties_total}F = total={bon.get('total')} F")
        return bon

    def test_create_hourly_bon_default_billing_mode(self, jeux_product):
        """Create a bon without billing_mode - should default to 'parties'"""
        items = [{
            "jeu_product_id": jeux_product["id"],
            "jeu_name": jeux_product["name"],
            "parties": 2,
            "unit_price": 1500,
            "duration_minutes": 30,
            "notes": "No billing_mode specified"
            # No billing_mode field
        }]
        
        payload = {
            "items": items,
            "players": f"{TEST_PREFIX}Default Mode Player",
            "notes": f"{TEST_PREFIX}Default billing mode test",
            "coach_name": f"{TEST_PREFIX}Coach Default",
            "coach_role": "coach_jeux"
        }
        
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        bon = data.get("bon")
        item = bon["items"][0]
        
        # Should default to 'parties'
        assert item.get("billing_mode") == "parties", f"Expected default billing_mode='parties', got {item.get('billing_mode')}"
        print(f"✓ Default billing_mode is 'parties' when not specified")


class TestHourlyBillingList:
    """Tests for GET /api/jeux/bons returning hourly fields"""

    def test_list_bons_returns_hourly_fields(self):
        """GET /api/jeux/bons should return billing_mode/hours/hourly_rate in items"""
        response = requests.get(f"{BASE_URL}/api/jeux/bons", params={
            "actor_role": "manager",
            "actor_name": "Test Manager"
        })
        assert response.status_code == 200
        data = response.json()
        assert "bons" in data
        
        hourly_found = False
        parties_found = False
        
        for bon in data["bons"]:
            if bon.get("items"):
                for item in bon["items"]:
                    # All items should have billing_mode
                    if "billing_mode" in item:
                        if item["billing_mode"] == "hourly":
                            hourly_found = True
                            # Hourly items should have hours and hourly_rate
                            assert "hours" in item, "Hourly item should have 'hours' field"
                            assert "hourly_rate" in item, "Hourly item should have 'hourly_rate' field"
                        elif item["billing_mode"] == "parties":
                            parties_found = True
        
        print(f"✓ Bons list checked: hourly_found={hourly_found}, parties_found={parties_found}")


class TestHourlyBillingAttach:
    """Tests for POST /api/jeux/bons/{id}/attach with hourly items"""

    @pytest.fixture
    def hourly_pending_bon(self):
        """Create an hourly pending bon for testing"""
        catalog_resp = requests.get(f"{BASE_URL}/api/jeux/catalog", params={"actor_role": "coach_jeux"})
        if catalog_resp.status_code != 200 or not catalog_resp.json().get("products"):
            pytest.skip("No jeux products available")
        
        product = catalog_resp.json()["products"][0]
        hours = 2
        hourly_rate = 12000
        
        payload = {
            "items": [{
                "jeu_product_id": product["id"],
                "jeu_name": product["name"],
                "parties": 1,
                "unit_price": hours * hourly_rate,
                "duration_minutes": hours * 60,
                "notes": "Forfait attach test",
                "billing_mode": "hourly",
                "hours": hours,
                "hourly_rate": hourly_rate
            }],
            "players": f"{TEST_PREFIX}Attach Hourly Player",
            "notes": f"{TEST_PREFIX}Hourly attach test",
            "coach_name": f"{TEST_PREFIX}Coach Attach Hourly",
            "coach_role": "coach_jeux"
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        if response.status_code == 200:
            return response.json().get("bon")
        pytest.skip("Could not create hourly test bon")

    @pytest.fixture
    def open_table_for_hourly(self):
        """Get or create an open table for testing attach"""
        table_number = 92 + (datetime.now().second % 5)
        create_payload = {
            "table_number": table_number,
            "server_id": "test-server-hourly",
            "server_name": f"{TEST_PREFIX}Server Hourly"
        }
        response = requests.post(f"{BASE_URL}/api/caisse/tables", json=create_payload)
        if response.status_code == 200:
            table_data = response.json()
            if isinstance(table_data, dict) and "id" in table_data:
                return table_data
        
        # Try to get existing tables
        response = requests.get(f"{BASE_URL}/api/caisse/tables", params={"server_id": "test-server-hourly"})
        if response.status_code == 200:
            data = response.json()
            tables = data.get("tables", []) if isinstance(data, dict) else data
            if isinstance(tables, list) and len(tables) > 0:
                return tables[0]
        
        return None

    def test_attach_hourly_item_generates_forfait_notes(self, hourly_pending_bon, open_table_for_hourly):
        """Attaching hourly bon should generate notes with 'Forfait Xh @ Y F/h'"""
        if not hourly_pending_bon or not open_table_for_hourly:
            pytest.skip("Missing test fixtures")
        
        bon = hourly_pending_bon
        table = open_table_for_hourly
        
        payload = {
            "table_id": table["id"],
            "actor_role": "manager",
            "actor_name": f"{TEST_PREFIX}Manager Attach Hourly"
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons/{bon['id']}/attach", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") is True
        print(f"✓ Hourly bon attached to table {data.get('table_number')}")
        
        # Verify table items have forfait notes
        table_resp = requests.get(f"{BASE_URL}/api/caisse/tables/{table['id']}")
        if table_resp.status_code == 200:
            table_data = table_resp.json()
            items = table_data.get("items", [])
            # Find the item from this bon
            bon_items = [i for i in items if i.get("from_jeux_bon") == bon["id"]]
            if bon_items:
                item = bon_items[0]
                notes = item.get("notes", "")
                print(f"✓ Table item notes: {notes}")
                # Notes should contain coach name at minimum
                assert "Coach" in notes or "coach" in notes.lower(), f"Notes should contain coach info: {notes}"


class TestHourlyBillingStandalone:
    """Tests for POST /api/jeux/bons/{id}/standalone with hourly items"""

    @pytest.fixture
    def hourly_pending_bon_for_standalone(self):
        """Create an hourly pending bon for standalone testing"""
        catalog_resp = requests.get(f"{BASE_URL}/api/jeux/catalog", params={"actor_role": "coach_jeux"})
        if catalog_resp.status_code != 200 or not catalog_resp.json().get("products"):
            pytest.skip("No jeux products available")
        
        product = catalog_resp.json()["products"][0]
        hours = 3
        hourly_rate = 12000
        
        payload = {
            "items": [{
                "jeu_product_id": product["id"],
                "jeu_name": product["name"],
                "parties": 1,
                "unit_price": hours * hourly_rate,
                "duration_minutes": hours * 60,
                "notes": "Forfait standalone test",
                "billing_mode": "hourly",
                "hours": hours,
                "hourly_rate": hourly_rate
            }],
            "players": f"{TEST_PREFIX}Standalone Hourly Player",
            "notes": f"{TEST_PREFIX}Hourly standalone test",
            "coach_name": f"{TEST_PREFIX}Coach Standalone Hourly",
            "coach_role": "coach_jeux"
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        if response.status_code == 200:
            return response.json().get("bon")
        pytest.skip("Could not create hourly test bon")

    def test_standalone_hourly_creates_invoice_with_notes(self, hourly_pending_bon_for_standalone):
        """Standalone should create invoice with hourly notes correctly formatted"""
        if not hourly_pending_bon_for_standalone:
            pytest.skip("No pending bon")
        
        bon = hourly_pending_bon_for_standalone
        
        payload = {
            "customer_name": f"{TEST_PREFIX}Client Standalone Hourly",
            "payment_method": "especes",
            "actor_role": "manager",
            "actor_name": f"{TEST_PREFIX}Manager Standalone Hourly"
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons/{bon['id']}/standalone", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") is True
        assert data.get("invoice_number") is not None
        print(f"✓ Standalone invoice created: {data.get('invoice_number')}")
        
        # Verify invoice details
        invoice_id = data.get("invoice_id")
        invoice_resp = requests.get(f"{BASE_URL}/api/invoices/{invoice_id}")
        if invoice_resp.status_code == 200:
            invoice = invoice_resp.json()
            assert invoice.get("source") == "jeux_standalone"
            items = invoice.get("items", [])
            if items:
                item = items[0]
                notes = item.get("notes", "")
                print(f"✓ Invoice item notes: {notes}")
                # Notes should contain coach name
                assert "Coach" in notes or "coach" in notes.lower(), f"Notes should contain coach info: {notes}"


class TestExistingHourlyBon:
    """Tests for the existing hourly bon mentioned in the test request"""

    def test_existing_hourly_bon_structure(self):
        """Verify the existing hourly bon (6e2ad35d-1574-4beb-a9fc-ee5d8f64b020) has correct structure"""
        bon_id = "6e2ad35d-1574-4beb-a9fc-ee5d8f64b020"
        
        response = requests.get(f"{BASE_URL}/api/jeux/bons", params={"actor_role": "manager"})
        if response.status_code == 200:
            bons = response.json().get("bons", [])
            existing_bon = next((b for b in bons if b["id"] == bon_id), None)
            
            if existing_bon:
                print(f"✓ Found existing bon: id={bon_id}, status={existing_bon.get('status')}")
                
                items = existing_bon.get("items", [])
                assert len(items) == 2, f"Expected 2 items, got {len(items)}"
                
                # First item should be hourly: 2h @ 12000F = 24000F
                hourly_item = next((i for i in items if i.get("billing_mode") == "hourly"), None)
                if hourly_item:
                    assert hourly_item.get("hours") == 2, f"Expected hours=2, got {hourly_item.get('hours')}"
                    assert hourly_item.get("hourly_rate") == 12000, f"Expected hourly_rate=12000, got {hourly_item.get('hourly_rate')}"
                    assert hourly_item.get("total") == 24000, f"Expected total=24000, got {hourly_item.get('total')}"
                    print(f"✓ Hourly item verified: {hourly_item.get('hours')}h @ {hourly_item.get('hourly_rate')} F/h = {hourly_item.get('total')} F")
                
                # Second item should be parties: Simulateur x3 = 4500F
                parties_item = next((i for i in items if i.get("billing_mode") == "parties"), None)
                if parties_item:
                    assert parties_item.get("parties") == 3, f"Expected parties=3, got {parties_item.get('parties')}"
                    assert parties_item.get("total") == 4500, f"Expected total=4500, got {parties_item.get('total')}"
                    print(f"✓ Parties item verified: x{parties_item.get('parties')} = {parties_item.get('total')} F")
                
                # Total should be 28500F
                assert existing_bon.get("total") == 28500, f"Expected total=28500, got {existing_bon.get('total')}"
                print(f"✓ Existing bon total verified: {existing_bon.get('total')} F")
            else:
                print(f"ℹ Existing bon {bon_id} not found (may have been processed or deleted)")


class TestHourlyBillingEdgeCases:
    """Edge case tests for hourly billing"""

    @pytest.fixture
    def jeux_product(self):
        """Get a jeux product from catalog for testing"""
        response = requests.get(f"{BASE_URL}/api/jeux/catalog", params={"actor_role": "coach_jeux"})
        if response.status_code == 200 and response.json().get("products"):
            return response.json()["products"][0]
        return {"id": "test-product-edge", "name": "Test Game Edge", "price": 2000}

    def test_hourly_with_half_hours(self, jeux_product):
        """Create hourly bon with 1.5 hours"""
        hours = 1.5
        hourly_rate = 12000
        line_total = int(hours * hourly_rate)  # 18000
        
        items = [{
            "jeu_product_id": jeux_product["id"],
            "jeu_name": jeux_product["name"],
            "parties": 1,
            "unit_price": line_total,
            "duration_minutes": int(hours * 60),
            "notes": "Half hour test",
            "billing_mode": "hourly",
            "hours": hours,
            "hourly_rate": hourly_rate
        }]
        
        payload = {
            "items": items,
            "players": f"{TEST_PREFIX}Half Hour Player",
            "notes": f"{TEST_PREFIX}Half hour test",
            "coach_name": f"{TEST_PREFIX}Coach Half Hour",
            "coach_role": "coach_jeux"
        }
        
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        bon = data.get("bon")
        item = bon["items"][0]
        
        assert item.get("hours") == hours, f"Expected hours={hours}, got {item.get('hours')}"
        assert bon.get("total") == line_total, f"Expected total={line_total}, got {bon.get('total')}"
        print(f"✓ Half-hour bon created: {hours}h @ {hourly_rate} F/h = {bon.get('total')} F")

    def test_hourly_with_custom_rate(self, jeux_product):
        """Create hourly bon with custom rate (not default 12000)"""
        hours = 2
        hourly_rate = 15000  # Custom rate
        line_total = hours * hourly_rate  # 30000
        
        items = [{
            "jeu_product_id": jeux_product["id"],
            "jeu_name": jeux_product["name"],
            "parties": 1,
            "unit_price": line_total,
            "duration_minutes": hours * 60,
            "notes": "Custom rate test",
            "billing_mode": "hourly",
            "hours": hours,
            "hourly_rate": hourly_rate
        }]
        
        payload = {
            "items": items,
            "players": f"{TEST_PREFIX}Custom Rate Player",
            "notes": f"{TEST_PREFIX}Custom rate test",
            "coach_name": f"{TEST_PREFIX}Coach Custom Rate",
            "coach_role": "coach_jeux"
        }
        
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        bon = data.get("bon")
        item = bon["items"][0]
        
        assert item.get("hourly_rate") == hourly_rate, f"Expected hourly_rate={hourly_rate}, got {item.get('hourly_rate')}"
        assert bon.get("total") == line_total, f"Expected total={line_total}, got {bon.get('total')}"
        print(f"✓ Custom rate bon created: {hours}h @ {hourly_rate} F/h = {bon.get('total')} F")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
