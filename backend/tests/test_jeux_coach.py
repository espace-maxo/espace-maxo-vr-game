"""
Test suite for Coach Jeux feature - Jeux Bons management
Tests all endpoints in /api/jeux/* router

Endpoints tested:
- GET /api/jeux/catalog - Get jeux products catalog
- POST /api/jeux/bons - Create a new bon
- GET /api/jeux/bons - List bons (filtered by role/status)
- POST /api/jeux/bons/{id}/attach - Attach bon to table
- POST /api/jeux/bons/{id}/standalone - Create standalone invoice
- POST /api/jeux/bons/{id}/reject - Reject bon with reason
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data prefix for cleanup
TEST_PREFIX = "TEST_JEUX_"


class TestJeuxCatalog:
    """Tests for GET /api/jeux/catalog endpoint"""

    def test_catalog_coach_jeux_access(self):
        """Coach jeux can access the catalog"""
        response = requests.get(f"{BASE_URL}/api/jeux/catalog", params={"actor_role": "coach_jeux"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "products" in data
        assert "total" in data
        # Verify products are from jeux department
        for product in data["products"]:
            assert product.get("department") == "jeux", f"Product {product.get('name')} is not from jeux department"
        print(f"✓ Coach jeux can access catalog: {data['total']} products found")

    def test_catalog_admin_access(self):
        """Admin can access the catalog"""
        response = requests.get(f"{BASE_URL}/api/jeux/catalog", params={"actor_role": "admin"})
        assert response.status_code == 200
        data = response.json()
        assert "products" in data
        print(f"✓ Admin can access catalog: {data['total']} products")

    def test_catalog_manager_access(self):
        """Manager can access the catalog"""
        response = requests.get(f"{BASE_URL}/api/jeux/catalog", params={"actor_role": "manager"})
        assert response.status_code == 200
        data = response.json()
        assert "products" in data
        print(f"✓ Manager can access catalog: {data['total']} products")

    def test_catalog_server_forbidden(self):
        """Server role should get 403 Forbidden"""
        response = requests.get(f"{BASE_URL}/api/jeux/catalog", params={"actor_role": "server"})
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("✓ Server role correctly denied access to catalog (403)")

    def test_catalog_empty_role_forbidden(self):
        """Empty role should get 403 Forbidden"""
        response = requests.get(f"{BASE_URL}/api/jeux/catalog", params={"actor_role": ""})
        assert response.status_code == 403
        print("✓ Empty role correctly denied access to catalog (403)")


class TestJeuxBonsCreate:
    """Tests for POST /api/jeux/bons endpoint"""

    @pytest.fixture
    def jeux_product(self):
        """Get a jeux product from catalog for testing"""
        response = requests.get(f"{BASE_URL}/api/jeux/catalog", params={"actor_role": "coach_jeux"})
        if response.status_code == 200 and response.json().get("products"):
            return response.json()["products"][0]
        # Fallback to mock product
        return {"id": "test-product-id", "name": "Test Game", "price": 2000}

    def test_create_bon_success(self, jeux_product):
        """Create a bon with valid data"""
        payload = {
            "jeu_product_id": jeux_product["id"],
            "jeu_name": jeux_product["name"],
            "parties": 3,
            "unit_price": jeux_product.get("price", 2000),
            "players": f"{TEST_PREFIX}Jean, Marie, Paul",
            "duration_minutes": 45,
            "notes": f"{TEST_PREFIX}Test bon creation",
            "coach_name": f"{TEST_PREFIX}Coach Test",
            "coach_role": "coach_jeux"
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") is True
        bon = data.get("bon")
        assert bon is not None
        assert bon.get("status") == "pending"
        assert bon.get("parties") == 3
        # Verify total calculation: parties * unit_price
        expected_total = 3 * jeux_product.get("price", 2000)
        assert bon.get("total") == expected_total, f"Expected total {expected_total}, got {bon.get('total')}"
        assert bon.get("id") is not None
        assert "_id" not in bon, "MongoDB _id should not be exposed"
        print(f"✓ Bon created successfully: {bon.get('id')}, total={bon.get('total')}")
        return bon

    def test_create_bon_zero_parties_validation(self, jeux_product):
        """Creating bon with parties=0 should return 422 validation error"""
        payload = {
            "jeu_product_id": jeux_product["id"],
            "jeu_name": jeux_product["name"],
            "parties": 0,  # Invalid: must be > 0
            "unit_price": 2000,
            "players": "Test",
            "coach_name": "Test Coach",
            "coach_role": "coach_jeux"
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"
        print("✓ Zero parties correctly rejected with 422")

    def test_create_bon_negative_parties_validation(self, jeux_product):
        """Creating bon with negative parties should return 422"""
        payload = {
            "jeu_product_id": jeux_product["id"],
            "jeu_name": jeux_product["name"],
            "parties": -1,
            "unit_price": 2000,
            "players": "Test",
            "coach_name": "Test Coach",
            "coach_role": "coach_jeux"
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        assert response.status_code == 422
        print("✓ Negative parties correctly rejected with 422")

    def test_create_bon_server_role_forbidden(self, jeux_product):
        """Server role should not be able to create bons"""
        payload = {
            "jeu_product_id": jeux_product["id"],
            "jeu_name": jeux_product["name"],
            "parties": 1,
            "unit_price": 2000,
            "players": "Test",
            "coach_name": "Test Server",
            "coach_role": "server"  # Invalid role
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("✓ Server role correctly denied bon creation (403)")

    def test_create_bon_admin_allowed(self, jeux_product):
        """Admin should be able to create bons"""
        payload = {
            "jeu_product_id": jeux_product["id"],
            "jeu_name": jeux_product["name"],
            "parties": 2,
            "unit_price": 1500,
            "players": f"{TEST_PREFIX}Admin Test Player",
            "coach_name": f"{TEST_PREFIX}Admin",
            "coach_role": "admin"
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is True
        print("✓ Admin can create bons")


class TestJeuxBonsList:
    """Tests for GET /api/jeux/bons endpoint"""

    def test_list_bons_coach_sees_own(self):
        """Coach should only see their own bons"""
        coach_name = f"{TEST_PREFIX}Coach_List_Test_{uuid.uuid4().hex[:6]}"
        
        # First create a bon for this coach
        catalog_resp = requests.get(f"{BASE_URL}/api/jeux/catalog", params={"actor_role": "coach_jeux"})
        if catalog_resp.status_code == 200 and catalog_resp.json().get("products"):
            product = catalog_resp.json()["products"][0]
            create_payload = {
                "jeu_product_id": product["id"],
                "jeu_name": product["name"],
                "parties": 1,
                "unit_price": product.get("price", 2000),
                "players": "Test Player",
                "coach_name": coach_name,
                "coach_role": "coach_jeux"
            }
            requests.post(f"{BASE_URL}/api/jeux/bons", json=create_payload)
        
        # Now list bons for this coach
        response = requests.get(f"{BASE_URL}/api/jeux/bons", params={
            "actor_role": "coach_jeux",
            "actor_name": coach_name
        })
        assert response.status_code == 200
        data = response.json()
        assert "bons" in data
        # All bons should belong to this coach
        for bon in data["bons"]:
            assert bon.get("coach_name") == coach_name, f"Coach sees bon from another coach: {bon.get('coach_name')}"
        print(f"✓ Coach sees only their own bons: {len(data['bons'])} bons")

    def test_list_bons_manager_sees_all(self):
        """Manager should see all bons"""
        response = requests.get(f"{BASE_URL}/api/jeux/bons", params={
            "actor_role": "manager",
            "actor_name": "Test Manager"
        })
        assert response.status_code == 200
        data = response.json()
        assert "bons" in data
        assert "total" in data
        assert "pending" in data
        print(f"✓ Manager sees all bons: {data['total']} total, {data['pending']} pending")

    def test_list_bons_manager_filter_pending(self):
        """Manager can filter by status=pending"""
        response = requests.get(f"{BASE_URL}/api/jeux/bons", params={
            "actor_role": "manager",
            "status": "pending"
        })
        assert response.status_code == 200
        data = response.json()
        # All returned bons should be pending
        for bon in data["bons"]:
            assert bon.get("status") == "pending", f"Non-pending bon returned: {bon.get('status')}"
        print(f"✓ Manager filter by pending works: {len(data['bons'])} pending bons")

    def test_list_bons_server_forbidden(self):
        """Server role should be denied"""
        response = requests.get(f"{BASE_URL}/api/jeux/bons", params={"actor_role": "server"})
        assert response.status_code == 403
        print("✓ Server role correctly denied listing bons (403)")


class TestJeuxBonsAttach:
    """Tests for POST /api/jeux/bons/{id}/attach endpoint"""

    @pytest.fixture
    def pending_bon(self):
        """Create a pending bon for testing"""
        catalog_resp = requests.get(f"{BASE_URL}/api/jeux/catalog", params={"actor_role": "coach_jeux"})
        if catalog_resp.status_code != 200 or not catalog_resp.json().get("products"):
            pytest.skip("No jeux products available")
        
        product = catalog_resp.json()["products"][0]
        payload = {
            "jeu_product_id": product["id"],
            "jeu_name": product["name"],
            "parties": 2,
            "unit_price": product.get("price", 2000),
            "players": f"{TEST_PREFIX}Attach Test Player",
            "coach_name": f"{TEST_PREFIX}Coach Attach",
            "coach_role": "coach_jeux"
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        if response.status_code == 200:
            return response.json().get("bon")
        pytest.skip("Could not create test bon")

    @pytest.fixture
    def open_table(self):
        """Get or create an open table for testing"""
        # Try to get existing open tables from test-server
        response = requests.get(f"{BASE_URL}/api/caisse/tables", params={"server_id": "test-server"})
        if response.status_code == 200:
            data = response.json()
            tables = data.get("tables", []) if isinstance(data, dict) else data
            if isinstance(tables, list) and len(tables) > 0:
                return tables[0]
        
        # Try master server
        response = requests.get(f"{BASE_URL}/api/caisse/tables", params={"server_id": "master"})
        if response.status_code == 200:
            data = response.json()
            tables = data.get("tables", []) if isinstance(data, dict) else data
            if isinstance(tables, list) and len(tables) > 0:
                return tables[0]
        
        # Create a new table
        create_payload = {
            "table_number": 98,
            "server_id": "test-server",
            "server_name": f"{TEST_PREFIX}Test Server"
        }
        response = requests.post(f"{BASE_URL}/api/caisse/tables", json=create_payload)
        if response.status_code == 200:
            table_data = response.json()
            if isinstance(table_data, dict) and "id" in table_data:
                return table_data
            # If creation returns something else, try to fetch it
            response = requests.get(f"{BASE_URL}/api/caisse/tables", params={"server_id": "test-server"})
            if response.status_code == 200:
                data = response.json()
                tables = data.get("tables", []) if isinstance(data, dict) else data
                if isinstance(tables, list) and len(tables) > 0:
                    return tables[0]
        return None

    def test_attach_bon_success(self, pending_bon, open_table):
        """Manager can attach a pending bon to a table"""
        if not pending_bon or not open_table:
            pytest.skip("Missing test fixtures")
        
        payload = {
            "table_id": open_table["id"],
            "actor_role": "manager",
            "actor_name": f"{TEST_PREFIX}Manager Test"
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons/{pending_bon['id']}/attach", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") is True
        assert data.get("table_number") is not None
        print(f"✓ Bon attached to table {data.get('table_number')}")
        
        # Verify bon status changed
        list_resp = requests.get(f"{BASE_URL}/api/jeux/bons", params={"actor_role": "manager"})
        if list_resp.status_code == 200:
            bons = list_resp.json().get("bons", [])
            attached_bon = next((b for b in bons if b["id"] == pending_bon["id"]), None)
            if attached_bon:
                assert attached_bon.get("status") == "attached"
                assert attached_bon.get("table_number") is not None
                print(f"✓ Bon status verified: {attached_bon.get('status')}, table: {attached_bon.get('table_number')}")

    def test_attach_bon_server_forbidden(self, pending_bon, open_table):
        """Server role should not be able to attach bons"""
        if not pending_bon or not open_table:
            pytest.skip("Missing test fixtures")
        
        payload = {
            "table_id": open_table["id"],
            "actor_role": "server",  # Invalid role
            "actor_name": "Test Server"
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons/{pending_bon['id']}/attach", json=payload)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Server role correctly denied attach action (403)")

    def test_attach_non_pending_bon_fails(self, open_table):
        """Attaching a non-pending bon should fail with 400"""
        if not open_table:
            pytest.skip("No open table available")
        
        # First create and attach a bon
        catalog_resp = requests.get(f"{BASE_URL}/api/jeux/catalog", params={"actor_role": "coach_jeux"})
        if catalog_resp.status_code != 200 or not catalog_resp.json().get("products"):
            pytest.skip("No jeux products")
        
        product = catalog_resp.json()["products"][0]
        create_payload = {
            "jeu_product_id": product["id"],
            "jeu_name": product["name"],
            "parties": 1,
            "unit_price": 2000,
            "players": "Test",
            "coach_name": f"{TEST_PREFIX}Coach Double Attach",
            "coach_role": "coach_jeux"
        }
        create_resp = requests.post(f"{BASE_URL}/api/jeux/bons", json=create_payload)
        if create_resp.status_code != 200:
            pytest.skip("Could not create bon")
        
        bon = create_resp.json().get("bon")
        
        # Attach it first time
        attach_payload = {
            "table_id": open_table["id"],
            "actor_role": "manager",
            "actor_name": "Manager"
        }
        first_attach = requests.post(f"{BASE_URL}/api/jeux/bons/{bon['id']}/attach", json=attach_payload)
        if first_attach.status_code != 200:
            pytest.skip("First attach failed")
        
        # Try to attach again - should fail
        second_attach = requests.post(f"{BASE_URL}/api/jeux/bons/{bon['id']}/attach", json=attach_payload)
        assert second_attach.status_code == 400, f"Expected 400, got {second_attach.status_code}"
        print("✓ Double attach correctly rejected (400)")


class TestJeuxBonsStandalone:
    """Tests for POST /api/jeux/bons/{id}/standalone endpoint"""

    @pytest.fixture
    def pending_bon_for_standalone(self):
        """Create a pending bon for standalone testing"""
        catalog_resp = requests.get(f"{BASE_URL}/api/jeux/catalog", params={"actor_role": "coach_jeux"})
        if catalog_resp.status_code != 200 or not catalog_resp.json().get("products"):
            pytest.skip("No jeux products available")
        
        product = catalog_resp.json()["products"][0]
        payload = {
            "jeu_product_id": product["id"],
            "jeu_name": product["name"],
            "parties": 3,
            "unit_price": product.get("price", 2000),
            "players": f"{TEST_PREFIX}Standalone Test Player",
            "coach_name": f"{TEST_PREFIX}Coach Standalone",
            "coach_role": "coach_jeux"
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        if response.status_code == 200:
            return response.json().get("bon")
        pytest.skip("Could not create test bon")

    def test_standalone_invoice_success(self, pending_bon_for_standalone):
        """Manager can create standalone invoice from bon"""
        if not pending_bon_for_standalone:
            pytest.skip("No pending bon")
        
        payload = {
            "customer_name": f"{TEST_PREFIX}Client Standalone",
            "payment_method": "especes",
            "actor_role": "manager",
            "actor_name": f"{TEST_PREFIX}Manager Standalone"
        }
        response = requests.post(
            f"{BASE_URL}/api/jeux/bons/{pending_bon_for_standalone['id']}/standalone",
            json=payload
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") is True
        assert data.get("invoice_number") is not None
        assert data.get("invoice_id") is not None
        print(f"✓ Standalone invoice created: {data.get('invoice_number')}")
        
        # Verify bon status changed to invoiced
        list_resp = requests.get(f"{BASE_URL}/api/jeux/bons", params={"actor_role": "manager"})
        if list_resp.status_code == 200:
            bons = list_resp.json().get("bons", [])
            invoiced_bon = next((b for b in bons if b["id"] == pending_bon_for_standalone["id"]), None)
            if invoiced_bon:
                assert invoiced_bon.get("status") == "invoiced"
                assert invoiced_bon.get("invoice_number") == data.get("invoice_number")
                print(f"✓ Bon status verified: invoiced, invoice: {invoiced_bon.get('invoice_number')}")
        
        # Verify invoice was created with correct attributes
        invoice_id = data.get("invoice_id")
        invoice_resp = requests.get(f"{BASE_URL}/api/invoices/{invoice_id}")
        if invoice_resp.status_code == 200:
            invoice = invoice_resp.json()
            assert invoice.get("source") == "jeux_standalone"
            assert invoice.get("validation_status") == "pending"
            assert invoice.get("from_jeux_bon") == pending_bon_for_standalone["id"]
            items = invoice.get("items", [])
            assert len(items) > 0
            assert items[0].get("department") == "jeux"
            assert items[0].get("from_jeux_bon") == pending_bon_for_standalone["id"]
            print(f"✓ Invoice attributes verified: source=jeux_standalone, validation_status=pending")


class TestJeuxBonsReject:
    """Tests for POST /api/jeux/bons/{id}/reject endpoint"""

    @pytest.fixture
    def pending_bon_for_reject(self):
        """Create a pending bon for reject testing"""
        catalog_resp = requests.get(f"{BASE_URL}/api/jeux/catalog", params={"actor_role": "coach_jeux"})
        if catalog_resp.status_code != 200 or not catalog_resp.json().get("products"):
            pytest.skip("No jeux products available")
        
        product = catalog_resp.json()["products"][0]
        payload = {
            "jeu_product_id": product["id"],
            "jeu_name": product["name"],
            "parties": 1,
            "unit_price": product.get("price", 2000),
            "players": f"{TEST_PREFIX}Reject Test Player",
            "coach_name": f"{TEST_PREFIX}Coach Reject",
            "coach_role": "coach_jeux"
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        if response.status_code == 200:
            return response.json().get("bon")
        pytest.skip("Could not create test bon")

    def test_reject_bon_success(self, pending_bon_for_reject):
        """Manager can reject a bon with reason"""
        if not pending_bon_for_reject:
            pytest.skip("No pending bon")
        
        payload = {
            "reason": f"{TEST_PREFIX}Client absent - test rejection",
            "actor_role": "manager",
            "actor_name": f"{TEST_PREFIX}Manager Reject"
        }
        response = requests.post(
            f"{BASE_URL}/api/jeux/bons/{pending_bon_for_reject['id']}/reject",
            json=payload
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") is True
        print("✓ Bon rejected successfully")
        
        # Verify bon status changed to rejected
        list_resp = requests.get(f"{BASE_URL}/api/jeux/bons", params={"actor_role": "manager"})
        if list_resp.status_code == 200:
            bons = list_resp.json().get("bons", [])
            rejected_bon = next((b for b in bons if b["id"] == pending_bon_for_reject["id"]), None)
            if rejected_bon:
                assert rejected_bon.get("status") == "rejected"
                assert rejected_bon.get("rejection_reason") is not None
                print(f"✓ Bon status verified: rejected, reason: {rejected_bon.get('rejection_reason')}")

    def test_reject_bon_empty_reason_fails(self, pending_bon_for_reject):
        """Rejecting with empty reason should fail with 400"""
        if not pending_bon_for_reject:
            pytest.skip("No pending bon")
        
        payload = {
            "reason": "",  # Empty reason
            "actor_role": "manager",
            "actor_name": "Manager"
        }
        response = requests.post(
            f"{BASE_URL}/api/jeux/bons/{pending_bon_for_reject['id']}/reject",
            json=payload
        )
        # Note: The bon might already be rejected from previous test, so we accept 400 for either case
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Empty reason correctly rejected (400)")

    def test_reject_bon_whitespace_reason_fails(self):
        """Rejecting with whitespace-only reason should fail"""
        # Create a fresh bon
        catalog_resp = requests.get(f"{BASE_URL}/api/jeux/catalog", params={"actor_role": "coach_jeux"})
        if catalog_resp.status_code != 200 or not catalog_resp.json().get("products"):
            pytest.skip("No jeux products")
        
        product = catalog_resp.json()["products"][0]
        create_payload = {
            "jeu_product_id": product["id"],
            "jeu_name": product["name"],
            "parties": 1,
            "unit_price": 2000,
            "players": "Test",
            "coach_name": f"{TEST_PREFIX}Coach Whitespace",
            "coach_role": "coach_jeux"
        }
        create_resp = requests.post(f"{BASE_URL}/api/jeux/bons", json=create_payload)
        if create_resp.status_code != 200:
            pytest.skip("Could not create bon")
        
        bon = create_resp.json().get("bon")
        
        payload = {
            "reason": "   ",  # Whitespace only
            "actor_role": "manager",
            "actor_name": "Manager"
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons/{bon['id']}/reject", json=payload)
        assert response.status_code == 400
        print("✓ Whitespace-only reason correctly rejected (400)")


class TestMongoDBSecurity:
    """Tests to verify MongoDB _id is not exposed in responses"""

    def test_catalog_no_mongodb_id(self):
        """Catalog response should not contain _id"""
        response = requests.get(f"{BASE_URL}/api/jeux/catalog", params={"actor_role": "coach_jeux"})
        if response.status_code == 200:
            data = response.json()
            for product in data.get("products", []):
                assert "_id" not in product, f"MongoDB _id exposed in product: {product}"
        print("✓ Catalog does not expose MongoDB _id")

    def test_bons_list_no_mongodb_id(self):
        """Bons list response should not contain _id"""
        response = requests.get(f"{BASE_URL}/api/jeux/bons", params={"actor_role": "manager"})
        if response.status_code == 200:
            data = response.json()
            for bon in data.get("bons", []):
                assert "_id" not in bon, f"MongoDB _id exposed in bon: {bon}"
        print("✓ Bons list does not expose MongoDB _id")

    def test_create_bon_no_mongodb_id(self):
        """Created bon response should not contain _id"""
        catalog_resp = requests.get(f"{BASE_URL}/api/jeux/catalog", params={"actor_role": "coach_jeux"})
        if catalog_resp.status_code != 200 or not catalog_resp.json().get("products"):
            pytest.skip("No jeux products")
        
        product = catalog_resp.json()["products"][0]
        payload = {
            "jeu_product_id": product["id"],
            "jeu_name": product["name"],
            "parties": 1,
            "unit_price": 2000,
            "players": "Test",
            "coach_name": f"{TEST_PREFIX}Coach Security",
            "coach_role": "coach_jeux"
        }
        response = requests.post(f"{BASE_URL}/api/jeux/bons", json=payload)
        if response.status_code == 200:
            bon = response.json().get("bon")
            assert "_id" not in bon, f"MongoDB _id exposed in created bon"
        print("✓ Created bon does not expose MongoDB _id")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
