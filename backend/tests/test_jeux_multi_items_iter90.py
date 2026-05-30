"""
Test suite for Coach Jeux Multi-Items Feature - Iteration 90
Tests the new multi-line bon creation and processing

New features tested:
- POST /api/jeux/bons with items[] array (multi-line bons)
- Validation: items=[] (empty) returns 400
- Validation: items=[{parties:0}] returns 422 (Pydantic)
- Validation: coach_role='server' returns 403
- GET /api/jeux/bons returns items[] array for each bon
- POST /api/jeux/bons/{id}/attach adds ALL items to table
- POST /api/jeux/bons/{id}/standalone creates invoice with ALL items
- Legacy compatibility: old bons with jeu_product_id top-level still work
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_PREFIX = "TEST_MULTI_"


class TestMultiItemsBonCreate:
    """Tests for POST /api/jeux/bons with multi-items"""

    @pytest.fixture
    def jeux_products(self):
        """Get multiple jeux products from catalog for testing"""
        response = requests.get(f"{BASE_URL}/api/jeux/catalog", params={"actor_role": "coach_jeux"})
        if response.status_code == 200 and response.json().get("products"):
            products = response.json()["products"]
            if len(products) >= 2:
                return products[:2]
            elif len(products) == 1:
                # Duplicate for testing
                return [products[0], products[0]]
        # Fallback mock products
        return [
            {"id": "test-product-1", "name": "Test Game 1", "price": 2000},
            {"id": "test-product-2", "name": "Test Game 2", "price": 1500}
        ]

    def test_create_multi_items_bon_success(self, jeux_products):
        """Create a bon with multiple items (2 lines)"""
        items = [
            {
                "jeu_product_id": jeux_products[0]["id"],
                "jeu_name": jeux_products[0]["name"],
                "parties": 2,
                "unit_price": jeux_products[0].get("price", 2000),
                "duration_minutes": 30,
                "notes": "Ligne 1 test"
            },
            {
                "jeu_product_id": jeux_products[1]["id"],
                "jeu_name": jeux_products[1]["name"],
                "parties": 3,
                "unit_price": jeux_products[1].get("price", 1500),
                "duration_minutes": 45,
                "notes": "Ligne 2 test"
            }
        ]
        payload = {
            "items": items,
            "players": f"{TEST_PREFIX}Jean, Marie, Paul",
            "notes": f"{TEST_PREFIX}Multi-items test bon",
            "coach_name": f"{TEST_PREFIX}Coach Multi",
            "coach_role": "coach_jeux"
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") is True
        bon = data.get("bon")
        assert bon is not None
        assert bon.get("status") == "pending"
        
        # Verify items array
        assert "items" in bon, "Bon should have 'items' array"
        assert len(bon["items"]) == 2, f"Expected 2 items, got {len(bon['items'])}"
        
        # Verify total calculation: sum of all line totals
        line1_total = items[0]["parties"] * items[0]["unit_price"]
        line2_total = items[1]["parties"] * items[1]["unit_price"]
        expected_total = line1_total + line2_total
        assert bon.get("total") == expected_total, f"Expected total {expected_total}, got {bon.get('total')}"
        
        # Verify total_duration_minutes
        expected_duration = items[0]["duration_minutes"] + items[1]["duration_minutes"]
        assert bon.get("total_duration_minutes") == expected_duration, f"Expected duration {expected_duration}, got {bon.get('total_duration_minutes')}"
        
        # Verify each item has correct structure
        for i, item in enumerate(bon["items"]):
            assert item.get("jeu_product_id") == items[i]["jeu_product_id"]
            assert item.get("jeu_name") == items[i]["jeu_name"]
            assert item.get("parties") == items[i]["parties"]
            assert item.get("unit_price") == items[i]["unit_price"]
            assert item.get("total") == items[i]["parties"] * items[i]["unit_price"]
        
        assert "_id" not in bon, "MongoDB _id should not be exposed"
        print(f"✓ Multi-items bon created: {bon.get('id')}, {len(bon['items'])} items, total={bon.get('total')} F, duration={bon.get('total_duration_minutes')} min")
        return bon

    def test_create_bon_empty_items_returns_400(self):
        """Creating bon with items=[] should return 400"""
        payload = {
            "items": [],  # Empty items array
            "players": "Test",
            "notes": "",
            "coach_name": f"{TEST_PREFIX}Coach Empty",
            "coach_role": "coach_jeux"
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        assert "Au moins une ligne" in response.text or "requise" in response.text.lower()
        print("✓ Empty items array correctly rejected with 400")

    def test_create_bon_zero_parties_returns_422(self, jeux_products):
        """Creating bon with items=[{parties:0}] should return 422 (Pydantic validation)"""
        payload = {
            "items": [{
                "jeu_product_id": jeux_products[0]["id"],
                "jeu_name": jeux_products[0]["name"],
                "parties": 0,  # Invalid: must be > 0
                "unit_price": 2000,
                "duration_minutes": None,
                "notes": ""
            }],
            "players": "Test",
            "notes": "",
            "coach_name": f"{TEST_PREFIX}Coach Zero",
            "coach_role": "coach_jeux"
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"
        print("✓ Zero parties in item correctly rejected with 422 (Pydantic)")

    def test_create_bon_server_role_returns_403(self, jeux_products):
        """Creating bon with coach_role='server' should return 403"""
        payload = {
            "items": [{
                "jeu_product_id": jeux_products[0]["id"],
                "jeu_name": jeux_products[0]["name"],
                "parties": 1,
                "unit_price": 2000,
                "duration_minutes": None,
                "notes": ""
            }],
            "players": "Test",
            "notes": "",
            "coach_name": "Server Test",
            "coach_role": "server"  # Invalid role
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("✓ Server role correctly rejected with 403")

    def test_create_bon_single_item_success(self, jeux_products):
        """Create a bon with single item (backward compatible)"""
        payload = {
            "items": [{
                "jeu_product_id": jeux_products[0]["id"],
                "jeu_name": jeux_products[0]["name"],
                "parties": 4,
                "unit_price": jeux_products[0].get("price", 2000),
                "duration_minutes": 60,
                "notes": "Single item test"
            }],
            "players": f"{TEST_PREFIX}Single Player",
            "notes": f"{TEST_PREFIX}Single item bon",
            "coach_name": f"{TEST_PREFIX}Coach Single",
            "coach_role": "coach_jeux"
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        bon = data.get("bon")
        assert len(bon["items"]) == 1
        expected_total = 4 * jeux_products[0].get("price", 2000)
        assert bon.get("total") == expected_total
        print(f"✓ Single-item bon created: total={bon.get('total')} F")


class TestMultiItemsBonsList:
    """Tests for GET /api/jeux/bons with multi-items"""

    def test_list_bons_returns_items_array(self):
        """GET /api/jeux/bons should return items[] for each bon"""
        response = requests.get(f"{BASE_URL}/api/jeux/bons", params={
            "actor_role": "manager",
            "actor_name": "Test Manager"
        })
        assert response.status_code == 200
        data = response.json()
        assert "bons" in data
        
        # Check that new bons have items array
        for bon in data["bons"]:
            # New bons should have items array
            if bon.get("items"):
                assert isinstance(bon["items"], list), f"items should be a list, got {type(bon['items'])}"
                for item in bon["items"]:
                    assert "jeu_product_id" in item
                    assert "jeu_name" in item
                    assert "parties" in item
                    assert "unit_price" in item
                    assert "total" in item
        print(f"✓ Bons list returns items array: {len(data['bons'])} bons checked")


class TestMultiItemsAttach:
    """Tests for POST /api/jeux/bons/{id}/attach with multi-items"""

    @pytest.fixture
    def multi_items_pending_bon(self):
        """Create a multi-items pending bon for testing"""
        catalog_resp = requests.get(f"{BASE_URL}/api/jeux/catalog", params={"actor_role": "coach_jeux"})
        if catalog_resp.status_code != 200 or not catalog_resp.json().get("products"):
            pytest.skip("No jeux products available")
        
        products = catalog_resp.json()["products"]
        items = []
        for i, p in enumerate(products[:2]):  # Use up to 2 products
            items.append({
                "jeu_product_id": p["id"],
                "jeu_name": p["name"],
                "parties": i + 2,  # 2, 3 parties
                "unit_price": p.get("price", 2000),
                "duration_minutes": (i + 1) * 15,
                "notes": f"Item {i+1} for attach test"
            })
        
        if len(items) < 2:
            # Duplicate first item if only one product
            items.append({
                "jeu_product_id": products[0]["id"],
                "jeu_name": products[0]["name"],
                "parties": 3,
                "unit_price": products[0].get("price", 2000),
                "duration_minutes": 30,
                "notes": "Duplicate item for attach test"
            })
        
        payload = {
            "items": items,
            "players": f"{TEST_PREFIX}Attach Multi Players",
            "notes": f"{TEST_PREFIX}Multi-items attach test",
            "coach_name": f"{TEST_PREFIX}Coach Attach Multi",
            "coach_role": "coach_jeux"
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        if response.status_code == 200:
            return response.json().get("bon")
        pytest.skip("Could not create multi-items test bon")

    @pytest.fixture
    def open_table_for_attach(self):
        """Get or create an open table for testing attach"""
        # Create a new table specifically for this test
        table_number = 90 + (datetime.now().second % 10)  # Random table number 90-99
        create_payload = {
            "table_number": table_number,
            "server_id": "test-server-multi",
            "server_name": f"{TEST_PREFIX}Server Multi"
        }
        response = requests.post(f"{BASE_URL}/api/caisse/tables", json=create_payload)
        if response.status_code == 200:
            table_data = response.json()
            if isinstance(table_data, dict) and "id" in table_data:
                return table_data
        
        # Try to get existing tables
        response = requests.get(f"{BASE_URL}/api/caisse/tables", params={"server_id": "test-server-multi"})
        if response.status_code == 200:
            data = response.json()
            tables = data.get("tables", []) if isinstance(data, dict) else data
            if isinstance(tables, list) and len(tables) > 0:
                return tables[0]
        
        # Fallback: try master server
        response = requests.get(f"{BASE_URL}/api/caisse/tables", params={"server_id": "master"})
        if response.status_code == 200:
            data = response.json()
            tables = data.get("tables", []) if isinstance(data, dict) else data
            if isinstance(tables, list) and len(tables) > 0:
                return tables[0]
        
        return None

    def test_attach_multi_items_adds_all_to_table(self, multi_items_pending_bon, open_table_for_attach):
        """Attaching multi-items bon should add ALL items to table"""
        if not multi_items_pending_bon or not open_table_for_attach:
            pytest.skip("Missing test fixtures")
        
        bon = multi_items_pending_bon
        table = open_table_for_attach
        num_items = len(bon.get("items", []))
        
        # Get table items count before attach
        table_before = requests.get(f"{BASE_URL}/api/caisse/tables/{table['id']}")
        items_before = 0
        if table_before.status_code == 200:
            items_before = len(table_before.json().get("items", []))
        
        # Attach the bon
        payload = {
            "table_id": table["id"],
            "actor_role": "manager",
            "actor_name": f"{TEST_PREFIX}Manager Attach Multi"
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons/{bon['id']}/attach", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") is True
        assert data.get("items_added") == num_items, f"Expected items_added={num_items}, got {data.get('items_added')}"
        print(f"✓ Attach response: items_added={data.get('items_added')}, table_number={data.get('table_number')}")
        
        # Verify table items increased by num_items
        table_after = requests.get(f"{BASE_URL}/api/caisse/tables/{table['id']}")
        if table_after.status_code == 200:
            items_after = len(table_after.json().get("items", []))
            assert items_after >= items_before + num_items, f"Table items should increase by {num_items}: before={items_before}, after={items_after}"
            print(f"✓ Table items verified: before={items_before}, after={items_after}, added={items_after - items_before}")


class TestMultiItemsStandalone:
    """Tests for POST /api/jeux/bons/{id}/standalone with multi-items"""

    @pytest.fixture
    def multi_items_pending_bon_for_standalone(self):
        """Create a multi-items pending bon for standalone testing"""
        catalog_resp = requests.get(f"{BASE_URL}/api/jeux/catalog", params={"actor_role": "coach_jeux"})
        if catalog_resp.status_code != 200 or not catalog_resp.json().get("products"):
            pytest.skip("No jeux products available")
        
        products = catalog_resp.json()["products"]
        items = []
        for i, p in enumerate(products[:3]):  # Use up to 3 products
            items.append({
                "jeu_product_id": p["id"],
                "jeu_name": p["name"],
                "parties": i + 1,  # 1, 2, 3 parties
                "unit_price": p.get("price", 2000),
                "duration_minutes": (i + 1) * 20,
                "notes": f"Item {i+1} for standalone test"
            })
        
        if len(items) < 2:
            items.append({
                "jeu_product_id": products[0]["id"],
                "jeu_name": products[0]["name"],
                "parties": 2,
                "unit_price": products[0].get("price", 2000),
                "duration_minutes": 40,
                "notes": "Extra item for standalone test"
            })
        
        payload = {
            "items": items,
            "players": f"{TEST_PREFIX}Standalone Multi Players",
            "notes": f"{TEST_PREFIX}Multi-items standalone test",
            "coach_name": f"{TEST_PREFIX}Coach Standalone Multi",
            "coach_role": "coach_jeux"
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        if response.status_code == 200:
            return response.json().get("bon")
        pytest.skip("Could not create multi-items test bon")

    def test_standalone_creates_invoice_with_all_items(self, multi_items_pending_bon_for_standalone):
        """Standalone should create invoice with ALL items from bon"""
        if not multi_items_pending_bon_for_standalone:
            pytest.skip("No pending bon")
        
        bon = multi_items_pending_bon_for_standalone
        num_items = len(bon.get("items", []))
        bon_total = bon.get("total", 0)
        
        payload = {
            "customer_name": f"{TEST_PREFIX}Client Standalone Multi",
            "payment_method": "especes",
            "actor_role": "manager",
            "actor_name": f"{TEST_PREFIX}Manager Standalone Multi"
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons/{bon['id']}/standalone", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") is True
        assert data.get("invoice_number") is not None
        assert data.get("items_count") == num_items, f"Expected items_count={num_items}, got {data.get('items_count')}"
        print(f"✓ Standalone response: invoice_number={data.get('invoice_number')}, items_count={data.get('items_count')}")
        
        # Verify invoice details
        invoice_id = data.get("invoice_id")
        invoice_resp = requests.get(f"{BASE_URL}/api/invoices/{invoice_id}")
        if invoice_resp.status_code == 200:
            invoice = invoice_resp.json()
            assert invoice.get("source") == "jeux_standalone"
            assert invoice.get("validation_status") == "pending"
            assert len(invoice.get("items", [])) == num_items, f"Invoice should have {num_items} items"
            assert invoice.get("subtotal") == bon_total, f"Invoice subtotal should be {bon_total}"
            assert invoice.get("total") == bon_total, f"Invoice total should be {bon_total}"
            print(f"✓ Invoice verified: {num_items} items, subtotal={invoice.get('subtotal')}, total={invoice.get('total')}")


class TestLegacyBonsCompatibility:
    """Tests for backward compatibility with old bons (jeu_product_id top-level)"""

    def test_legacy_bons_still_listable(self):
        """Old bons with jeu_product_id top-level should still be listable"""
        response = requests.get(f"{BASE_URL}/api/jeux/bons", params={
            "actor_role": "manager",
            "limit": 200
        })
        assert response.status_code == 200
        data = response.json()
        
        # Check for any legacy bons (have jeu_product_id but no items array)
        legacy_count = 0
        new_count = 0
        for bon in data["bons"]:
            if bon.get("items") and len(bon["items"]) > 0:
                new_count += 1
            elif bon.get("jeu_product_id"):
                legacy_count += 1
        
        print(f"✓ Bons listed: {len(data['bons'])} total, {new_count} new format, {legacy_count} legacy format")
        # Both formats should be listable without errors
        assert response.status_code == 200

    def test_existing_multi_items_bon_processable(self):
        """The existing multi-items bon (5f357946-98f2-4461-9c33-12b2340807e8) should be processable"""
        # This bon was mentioned in the test request as existing with 2 items, total 8500F
        bon_id = "5f357946-98f2-4461-9c33-12b2340807e8"
        
        # First check if it exists and its status
        response = requests.get(f"{BASE_URL}/api/jeux/bons", params={"actor_role": "manager"})
        if response.status_code == 200:
            bons = response.json().get("bons", [])
            existing_bon = next((b for b in bons if b["id"] == bon_id), None)
            if existing_bon:
                print(f"✓ Found existing bon: id={bon_id}, status={existing_bon.get('status')}, items={len(existing_bon.get('items', []))}")
                if existing_bon.get("items"):
                    assert len(existing_bon["items"]) == 2, "Expected 2 items"
                    assert existing_bon.get("total") == 8500, f"Expected total 8500, got {existing_bon.get('total')}"
                    print(f"✓ Existing bon verified: 2 items, total=8500 F")
            else:
                print(f"ℹ Existing bon {bon_id} not found (may have been processed)")


class TestRejectStillWorks:
    """Tests for POST /api/jeux/bons/{id}/reject (no changes expected)"""

    @pytest.fixture
    def pending_bon_for_reject(self):
        """Create a pending bon for reject testing"""
        catalog_resp = requests.get(f"{BASE_URL}/api/jeux/catalog", params={"actor_role": "coach_jeux"})
        if catalog_resp.status_code != 200 or not catalog_resp.json().get("products"):
            pytest.skip("No jeux products available")
        
        product = catalog_resp.json()["products"][0]
        payload = {
            "items": [{
                "jeu_product_id": product["id"],
                "jeu_name": product["name"],
                "parties": 1,
                "unit_price": product.get("price", 2000),
                "duration_minutes": None,
                "notes": ""
            }],
            "players": f"{TEST_PREFIX}Reject Test Player",
            "notes": "",
            "coach_name": f"{TEST_PREFIX}Coach Reject Multi",
            "coach_role": "coach_jeux"
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        if response.status_code == 200:
            return response.json().get("bon")
        pytest.skip("Could not create test bon")

    def test_reject_multi_items_bon_success(self, pending_bon_for_reject):
        """Reject should still work for multi-items bons"""
        if not pending_bon_for_reject:
            pytest.skip("No pending bon")
        
        payload = {
            "reason": f"{TEST_PREFIX}Test rejection for multi-items bon",
            "actor_role": "manager",
            "actor_name": f"{TEST_PREFIX}Manager Reject Multi"
        }
        response = requests.post(
            f"{BASE_URL}/api/jeux/bons/{pending_bon_for_reject['id']}/reject",
            json=payload
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") is True
        print("✓ Multi-items bon rejected successfully")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
