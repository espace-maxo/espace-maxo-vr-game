"""
Test Appro Manager (Shopping List) features - Iteration 84

Tests for:
- POST /api/shopping-list/{id}/done with payment_mode (fonds_propres, caisse_restau)
- POST /api/shopping-list/{id}/done with invalid payment_mode → 400
- POST /api/shopping-list/{id}/done without payment_mode (backward compat)
- PATCH /api/shopping-list/{id} with quantity, estimated_unit_price → recalculates estimated_total
- PATCH /api/shopping-list/{id} with real_unit_price → recalculates real_total
- POST /api/shopping-list/{id}/reimburse → sets reimbursed=true, reimbursed_at, reimbursed_by
- POST /api/shopping-list/{id}/reimburse fails if not fonds_propres or already reimbursed
- POST /api/shopping-list/reimburse-all → bulk reimburse, returns count + total_amount
- POST /api/shopping-list/{id}/undo → resets payment_mode, reimbursed, reimbursed_at to null
- GET /api/shopping-list/payment-mode-cumul → returns correct structure
- GET /api/cash-closures/live → includes shopping_list items in fonds_propres totals
- Regression: POST /api/shopping-list/to-expense still works
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestApproManagerDoneWithPaymentMode:
    """Test POST /api/shopping-list/{id}/done with payment_mode"""
    
    def test_mark_done_with_fonds_propres(self, api_client):
        """POST /api/shopping-list/{id}/done with payment_mode=fonds_propres sets payment_mode + reimbursed=false + status=done"""
        # Create test item
        create_resp = api_client.post(f"{BASE_URL}/api/shopping-list", json={
            "name": f"TEST_FP_Item_{uuid.uuid4().hex[:8]}",
            "quantity": 2,
            "estimated_unit_price": 500,
            "scope": "restaurant",
            "created_by": "TestAgent"
        })
        assert create_resp.status_code == 200, f"Create failed: {create_resp.text}"
        item_id = create_resp.json()["item"]["id"]
        
        try:
            # Mark as done with fonds_propres
            done_resp = api_client.post(f"{BASE_URL}/api/shopping-list/{item_id}/done", json={
                "done_by": "TestGerante",
                "real_unit_price": 550,
                "payment_mode": "fonds_propres"
            })
            assert done_resp.status_code == 200, f"Mark done failed: {done_resp.text}"
            data = done_resp.json()
            assert data["success"] is True
            item = data["item"]
            assert item["status"] == "done"
            assert item["payment_mode"] == "fonds_propres"
            assert item["reimbursed"] is False
            assert item["real_unit_price"] == 550
            assert item["real_total"] == 550 * 2  # 1100
            print(f"✓ Mark done with fonds_propres: payment_mode={item['payment_mode']}, reimbursed={item['reimbursed']}")
        finally:
            api_client.delete(f"{BASE_URL}/api/shopping-list/{item_id}")
    
    def test_mark_done_with_caisse_restau(self, api_client):
        """POST /api/shopping-list/{id}/done with payment_mode=caisse_restau sets payment_mode + status=done (no reimbursed field)"""
        # Create test item
        create_resp = api_client.post(f"{BASE_URL}/api/shopping-list", json={
            "name": f"TEST_CR_Item_{uuid.uuid4().hex[:8]}",
            "quantity": 3,
            "estimated_unit_price": 300,
            "scope": "restaurant",
            "created_by": "TestAgent"
        })
        assert create_resp.status_code == 200
        item_id = create_resp.json()["item"]["id"]
        
        try:
            # Mark as done with caisse_restau
            done_resp = api_client.post(f"{BASE_URL}/api/shopping-list/{item_id}/done", json={
                "done_by": "TestGerante",
                "payment_mode": "caisse_restau"
            })
            assert done_resp.status_code == 200
            data = done_resp.json()
            item = data["item"]
            assert item["status"] == "done"
            assert item["payment_mode"] == "caisse_restau"
            # caisse_restau should NOT set reimbursed field
            assert item.get("reimbursed") is None or item.get("reimbursed") is False
            print(f"✓ Mark done with caisse_restau: payment_mode={item['payment_mode']}")
        finally:
            api_client.delete(f"{BASE_URL}/api/shopping-list/{item_id}")
    
    def test_mark_done_invalid_payment_mode_returns_400(self, api_client):
        """POST /api/shopping-list/{id}/done with invalid payment_mode returns 400"""
        # Create test item
        create_resp = api_client.post(f"{BASE_URL}/api/shopping-list", json={
            "name": f"TEST_Invalid_PM_{uuid.uuid4().hex[:8]}",
            "quantity": 1,
            "estimated_unit_price": 100,
            "scope": "restaurant"
        })
        assert create_resp.status_code == 200
        item_id = create_resp.json()["item"]["id"]
        
        try:
            # Try invalid payment_mode
            done_resp = api_client.post(f"{BASE_URL}/api/shopping-list/{item_id}/done", json={
                "done_by": "TestGerante",
                "payment_mode": "invalid_mode"
            })
            assert done_resp.status_code == 400, f"Expected 400, got {done_resp.status_code}"
            print(f"✓ Invalid payment_mode returns 400: {done_resp.json()}")
        finally:
            api_client.delete(f"{BASE_URL}/api/shopping-list/{item_id}")
    
    def test_mark_done_without_payment_mode_backward_compat(self, api_client):
        """POST /api/shopping-list/{id}/done without payment_mode still works (backward compat)"""
        # Create test item
        create_resp = api_client.post(f"{BASE_URL}/api/shopping-list", json={
            "name": f"TEST_NoPM_{uuid.uuid4().hex[:8]}",
            "quantity": 1,
            "estimated_unit_price": 200,
            "scope": "restaurant"
        })
        assert create_resp.status_code == 200
        item_id = create_resp.json()["item"]["id"]
        
        try:
            # Mark done without payment_mode
            done_resp = api_client.post(f"{BASE_URL}/api/shopping-list/{item_id}/done", json={
                "done_by": "TestGerante"
            })
            assert done_resp.status_code == 200
            data = done_resp.json()
            item = data["item"]
            assert item["status"] == "done"
            # payment_mode should be None or not set
            assert item.get("payment_mode") is None
            print(f"✓ Mark done without payment_mode (backward compat): status={item['status']}")
        finally:
            api_client.delete(f"{BASE_URL}/api/shopping-list/{item_id}")


class TestApproManagerPatchItem:
    """Test PATCH /api/shopping-list/{id} for quantity, estimated_unit_price, real_unit_price"""
    
    def test_patch_quantity_and_estimated_unit_price_recalculates_total(self, api_client):
        """PATCH /api/shopping-list/{id} with quantity and estimated_unit_price recalculates estimated_total"""
        # Create test item
        create_resp = api_client.post(f"{BASE_URL}/api/shopping-list", json={
            "name": f"TEST_Patch_Est_{uuid.uuid4().hex[:8]}",
            "quantity": 2,
            "estimated_unit_price": 100,
            "scope": "restaurant"
        })
        assert create_resp.status_code == 200
        item_id = create_resp.json()["item"]["id"]
        
        try:
            # Patch quantity and estimated_unit_price
            patch_resp = api_client.patch(f"{BASE_URL}/api/shopping-list/{item_id}", json={
                "quantity": 5,
                "estimated_unit_price": 250
            })
            assert patch_resp.status_code == 200
            item = patch_resp.json()["item"]
            assert item["quantity"] == 5
            assert item["estimated_unit_price"] == 250
            assert item["estimated_total"] == 5 * 250  # 1250
            print(f"✓ PATCH recalculates estimated_total: {item['estimated_total']}")
        finally:
            api_client.delete(f"{BASE_URL}/api/shopping-list/{item_id}")
    
    def test_patch_real_unit_price_recalculates_real_total(self, api_client):
        """PATCH /api/shopping-list/{id} with real_unit_price recalculates real_total"""
        # Create test item
        create_resp = api_client.post(f"{BASE_URL}/api/shopping-list", json={
            "name": f"TEST_Patch_Real_{uuid.uuid4().hex[:8]}",
            "quantity": 3,
            "estimated_unit_price": 100,
            "scope": "restaurant"
        })
        assert create_resp.status_code == 200
        item_id = create_resp.json()["item"]["id"]
        
        try:
            # Patch real_unit_price
            patch_resp = api_client.patch(f"{BASE_URL}/api/shopping-list/{item_id}", json={
                "real_unit_price": 120
            })
            assert patch_resp.status_code == 200
            item = patch_resp.json()["item"]
            assert item["real_unit_price"] == 120
            assert item["real_total"] == 3 * 120  # 360
            print(f"✓ PATCH recalculates real_total: {item['real_total']}")
        finally:
            api_client.delete(f"{BASE_URL}/api/shopping-list/{item_id}")


class TestApproManagerReimburse:
    """Test POST /api/shopping-list/{id}/reimburse and /reimburse-all"""
    
    def test_reimburse_item_success(self, api_client):
        """POST /api/shopping-list/{id}/reimburse sets reimbursed=true, reimbursed_at, reimbursed_by"""
        # Create and mark done with fonds_propres
        create_resp = api_client.post(f"{BASE_URL}/api/shopping-list", json={
            "name": f"TEST_Reimb_{uuid.uuid4().hex[:8]}",
            "quantity": 2,
            "estimated_unit_price": 500,
            "scope": "restaurant"
        })
        assert create_resp.status_code == 200
        item_id = create_resp.json()["item"]["id"]
        
        try:
            # Mark done with fonds_propres
            api_client.post(f"{BASE_URL}/api/shopping-list/{item_id}/done", json={
                "done_by": "TestGerante",
                "payment_mode": "fonds_propres"
            })
            
            # Reimburse
            reimb_resp = api_client.post(f"{BASE_URL}/api/shopping-list/{item_id}/reimburse", json={
                "reimbursed_by": "TestAdmin"
            })
            assert reimb_resp.status_code == 200
            assert reimb_resp.json()["success"] is True
            
            # Verify item is reimbursed
            get_resp = api_client.get(f"{BASE_URL}/api/shopping-list", params={"status": "done"})
            items = get_resp.json()["items"]
            item = next((i for i in items if i["id"] == item_id), None)
            assert item is not None
            assert item["reimbursed"] is True
            assert item["reimbursed_by"] == "TestAdmin"
            assert item["reimbursed_at"] is not None
            print(f"✓ Reimburse success: reimbursed={item['reimbursed']}, reimbursed_by={item['reimbursed_by']}")
        finally:
            api_client.delete(f"{BASE_URL}/api/shopping-list/{item_id}")
    
    def test_reimburse_fails_if_not_fonds_propres(self, api_client):
        """POST /api/shopping-list/{id}/reimburse fails if payment_mode is not fonds_propres"""
        # Create and mark done with caisse_restau
        create_resp = api_client.post(f"{BASE_URL}/api/shopping-list", json={
            "name": f"TEST_ReimbFail_CR_{uuid.uuid4().hex[:8]}",
            "quantity": 1,
            "estimated_unit_price": 100,
            "scope": "restaurant"
        })
        assert create_resp.status_code == 200
        item_id = create_resp.json()["item"]["id"]
        
        try:
            # Mark done with caisse_restau
            api_client.post(f"{BASE_URL}/api/shopping-list/{item_id}/done", json={
                "done_by": "TestGerante",
                "payment_mode": "caisse_restau"
            })
            
            # Try to reimburse - should fail
            reimb_resp = api_client.post(f"{BASE_URL}/api/shopping-list/{item_id}/reimburse", json={
                "reimbursed_by": "TestAdmin"
            })
            assert reimb_resp.status_code == 400
            print(f"✓ Reimburse fails for caisse_restau: {reimb_resp.json()}")
        finally:
            api_client.delete(f"{BASE_URL}/api/shopping-list/{item_id}")
    
    def test_reimburse_fails_if_already_reimbursed(self, api_client):
        """POST /api/shopping-list/{id}/reimburse fails if already reimbursed"""
        # Create and mark done with fonds_propres
        create_resp = api_client.post(f"{BASE_URL}/api/shopping-list", json={
            "name": f"TEST_ReimbFail_Already_{uuid.uuid4().hex[:8]}",
            "quantity": 1,
            "estimated_unit_price": 100,
            "scope": "restaurant"
        })
        assert create_resp.status_code == 200
        item_id = create_resp.json()["item"]["id"]
        
        try:
            # Mark done with fonds_propres
            api_client.post(f"{BASE_URL}/api/shopping-list/{item_id}/done", json={
                "done_by": "TestGerante",
                "payment_mode": "fonds_propres"
            })
            
            # First reimburse - should succeed
            api_client.post(f"{BASE_URL}/api/shopping-list/{item_id}/reimburse", json={
                "reimbursed_by": "TestAdmin"
            })
            
            # Second reimburse - should fail
            reimb_resp = api_client.post(f"{BASE_URL}/api/shopping-list/{item_id}/reimburse", json={
                "reimbursed_by": "TestAdmin"
            })
            assert reimb_resp.status_code == 400
            print(f"✓ Reimburse fails if already reimbursed: {reimb_resp.json()}")
        finally:
            api_client.delete(f"{BASE_URL}/api/shopping-list/{item_id}")
    
    def test_reimburse_all_bulk(self, api_client):
        """POST /api/shopping-list/reimburse-all reimburses all pending fonds_propres items"""
        # Create multiple items with fonds_propres
        item_ids = []
        for i in range(2):
            create_resp = api_client.post(f"{BASE_URL}/api/shopping-list", json={
                "name": f"TEST_ReimbAll_{i}_{uuid.uuid4().hex[:8]}",
                "quantity": 1,
                "estimated_unit_price": 100 * (i + 1),
                "scope": "restaurant"
            })
            assert create_resp.status_code == 200
            item_id = create_resp.json()["item"]["id"]
            item_ids.append(item_id)
            
            # Mark done with fonds_propres
            api_client.post(f"{BASE_URL}/api/shopping-list/{item_id}/done", json={
                "done_by": "TestGerante",
                "payment_mode": "fonds_propres"
            })
        
        try:
            # Reimburse all
            reimb_resp = api_client.post(f"{BASE_URL}/api/shopping-list/reimburse-all", json={
                "reimbursed_by": "TestAdmin"
            })
            assert reimb_resp.status_code == 200
            data = reimb_resp.json()
            assert data["success"] is True
            assert data["count"] >= 2  # At least our 2 items
            assert data["total_amount"] >= 300  # 100 + 200
            print(f"✓ Reimburse all: count={data['count']}, total_amount={data['total_amount']}")
        finally:
            for item_id in item_ids:
                api_client.delete(f"{BASE_URL}/api/shopping-list/{item_id}")


class TestApproManagerUndo:
    """Test POST /api/shopping-list/{id}/undo resets payment_mode, reimbursed, reimbursed_at"""
    
    def test_undo_resets_payment_fields(self, api_client):
        """POST /api/shopping-list/{id}/undo resets payment_mode, reimbursed, reimbursed_at to null"""
        # Create and mark done with fonds_propres
        create_resp = api_client.post(f"{BASE_URL}/api/shopping-list", json={
            "name": f"TEST_Undo_{uuid.uuid4().hex[:8]}",
            "quantity": 2,
            "estimated_unit_price": 500,
            "scope": "restaurant"
        })
        assert create_resp.status_code == 200
        item_id = create_resp.json()["item"]["id"]
        
        try:
            # Mark done with fonds_propres
            api_client.post(f"{BASE_URL}/api/shopping-list/{item_id}/done", json={
                "done_by": "TestGerante",
                "payment_mode": "fonds_propres"
            })
            
            # Undo
            undo_resp = api_client.post(f"{BASE_URL}/api/shopping-list/{item_id}/undo")
            assert undo_resp.status_code == 200
            item = undo_resp.json()["item"]
            assert item["status"] == "pending"
            assert item.get("payment_mode") is None
            assert item.get("reimbursed") is None
            assert item.get("reimbursed_at") is None
            assert item.get("reimbursed_by") is None
            assert item.get("done_by") is None
            assert item.get("done_at") is None
            print(f"✓ Undo resets all payment fields: status={item['status']}, payment_mode={item.get('payment_mode')}")
        finally:
            api_client.delete(f"{BASE_URL}/api/shopping-list/{item_id}")


class TestApproManagerPaymentModeCumul:
    """Test GET /api/shopping-list/payment-mode-cumul"""
    
    def test_payment_mode_cumul_structure(self, api_client):
        """GET /api/shopping-list/payment-mode-cumul returns correct structure"""
        resp = api_client.get(f"{BASE_URL}/api/shopping-list/payment-mode-cumul")
        assert resp.status_code == 200
        data = resp.json()
        
        # Check fonds_propres structure
        assert "fonds_propres" in data
        fp = data["fonds_propres"]
        assert "total" in fp
        assert "count" in fp
        assert "reimbursed_total" in fp
        assert "reimbursed_count" in fp
        assert "pending_total" in fp
        assert "pending_count" in fp
        
        # Check caisse_restau structure
        assert "caisse_restau" in data
        cr = data["caisse_restau"]
        assert "total" in cr
        assert "count" in cr
        
        print(f"✓ Payment mode cumul structure: fonds_propres={fp}, caisse_restau={cr}")
    
    def test_payment_mode_cumul_with_data(self, api_client):
        """GET /api/shopping-list/payment-mode-cumul returns correct values with test data"""
        # Create items with different payment modes
        item_ids = []
        
        # Item 1: fonds_propres, not reimbursed
        create1 = api_client.post(f"{BASE_URL}/api/shopping-list", json={
            "name": f"TEST_Cumul_FP_{uuid.uuid4().hex[:8]}",
            "quantity": 2,
            "estimated_unit_price": 500,
            "scope": "restaurant"
        })
        item_ids.append(create1.json()["item"]["id"])
        api_client.post(f"{BASE_URL}/api/shopping-list/{item_ids[0]}/done", json={
            "done_by": "Test",
            "payment_mode": "fonds_propres"
        })
        
        # Item 2: caisse_restau
        create2 = api_client.post(f"{BASE_URL}/api/shopping-list", json={
            "name": f"TEST_Cumul_CR_{uuid.uuid4().hex[:8]}",
            "quantity": 3,
            "estimated_unit_price": 300,
            "scope": "restaurant"
        })
        item_ids.append(create2.json()["item"]["id"])
        api_client.post(f"{BASE_URL}/api/shopping-list/{item_ids[1]}/done", json={
            "done_by": "Test",
            "payment_mode": "caisse_restau"
        })
        
        try:
            resp = api_client.get(f"{BASE_URL}/api/shopping-list/payment-mode-cumul")
            assert resp.status_code == 200
            data = resp.json()
            
            # Should have at least our test data
            assert data["fonds_propres"]["count"] >= 1
            assert data["fonds_propres"]["pending_count"] >= 1
            assert data["caisse_restau"]["count"] >= 1
            print(f"✓ Payment mode cumul with data: FP pending={data['fonds_propres']['pending_count']}, CR count={data['caisse_restau']['count']}")
        finally:
            for item_id in item_ids:
                api_client.delete(f"{BASE_URL}/api/shopping-list/{item_id}")


class TestCashClosuresSnapshotWithShoppingList:
    """Test GET /api/cash-closures/live includes shopping_list items in fonds_propres totals"""
    
    def test_snapshot_includes_shopping_list_fonds_propres(self, api_client):
        """GET /api/cash-closures/live includes shopping_list items in fonds_propres_pending_total"""
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Create a fonds_propres item
        create_resp = api_client.post(f"{BASE_URL}/api/shopping-list", json={
            "name": f"TEST_Snapshot_FP_{uuid.uuid4().hex[:8]}",
            "quantity": 2,
            "estimated_unit_price": 750,
            "scope": "restaurant"
        })
        assert create_resp.status_code == 200
        item_id = create_resp.json()["item"]["id"]
        
        try:
            # Mark done with fonds_propres
            api_client.post(f"{BASE_URL}/api/shopping-list/{item_id}/done", json={
                "done_by": "TestGerante",
                "payment_mode": "fonds_propres"
            })
            
            # Get snapshot
            snap_resp = api_client.get(f"{BASE_URL}/api/cash-closures/live", params={"date": today})
            assert snap_resp.status_code == 200
            snap = snap_resp.json()["snapshot"]
            
            # Check fonds_propres fields exist
            assert "fonds_propres_pending_total" in snap
            assert "fonds_propres_pending_count" in snap
            assert "fonds_propres_reimbursed_today_total" in snap
            assert "fonds_propres_reimbursed_today_count" in snap
            
            # Our item should be in pending (1500 = 2 * 750)
            assert snap["fonds_propres_pending_total"] >= 1500
            assert snap["fonds_propres_pending_count"] >= 1
            print(f"✓ Snapshot includes shopping_list fonds_propres: pending_total={snap['fonds_propres_pending_total']}, pending_count={snap['fonds_propres_pending_count']}")
        finally:
            api_client.delete(f"{BASE_URL}/api/shopping-list/{item_id}")


class TestRegressionToExpense:
    """Regression test: POST /api/shopping-list/to-expense still works"""
    
    def test_transfer_to_expense_still_works(self, api_client):
        """POST /api/shopping-list/to-expense transfers items to expense"""
        # Create test items
        item_ids = []
        for i in range(2):
            create_resp = api_client.post(f"{BASE_URL}/api/shopping-list", json={
                "name": f"TEST_Transfer_{i}_{uuid.uuid4().hex[:8]}",
                "quantity": 1,
                "estimated_unit_price": 100 * (i + 1),
                "scope": "restaurant"
            })
            assert create_resp.status_code == 200
            item_ids.append(create_resp.json()["item"]["id"])
        
        expense_id = None
        try:
            # Transfer to expense
            transfer_resp = api_client.post(f"{BASE_URL}/api/shopping-list/to-expense", json={
                "item_ids": item_ids,
                "supplier": "TestSupplier",
                "requested_by": "TestAdmin",
                "mark_done": True
            })
            assert transfer_resp.status_code == 200
            data = transfer_resp.json()
            assert data["success"] is True
            assert data["items_transferred"] == 2
            assert data["expense_total"] == 300  # 100 + 200
            expense_id = data["expense_id"]
            print(f"✓ Transfer to expense works: expense_id={expense_id}, total={data['expense_total']}")
        finally:
            # Cleanup
            for item_id in item_ids:
                api_client.delete(f"{BASE_URL}/api/shopping-list/{item_id}")
            if expense_id:
                api_client.delete(f"{BASE_URL}/api/expenses/{expense_id}")


class TestOldItemsWithoutPaymentMode:
    """Test that old items without payment_mode still display correctly"""
    
    def test_old_items_without_payment_mode_still_work(self, api_client):
        """Items created without payment_mode should still be retrievable and displayable"""
        # Create item without payment_mode
        create_resp = api_client.post(f"{BASE_URL}/api/shopping-list", json={
            "name": f"TEST_OldStyle_{uuid.uuid4().hex[:8]}",
            "quantity": 1,
            "estimated_unit_price": 100,
            "scope": "restaurant"
        })
        assert create_resp.status_code == 200
        item_id = create_resp.json()["item"]["id"]
        
        try:
            # Mark done without payment_mode (old style)
            done_resp = api_client.post(f"{BASE_URL}/api/shopping-list/{item_id}/done", json={
                "done_by": "OldGerante"
            })
            assert done_resp.status_code == 200
            
            # Retrieve and verify
            list_resp = api_client.get(f"{BASE_URL}/api/shopping-list", params={"status": "done"})
            assert list_resp.status_code == 200
            items = list_resp.json()["items"]
            item = next((i for i in items if i["id"] == item_id), None)
            assert item is not None
            assert item["status"] == "done"
            assert item.get("payment_mode") is None  # Should be None for old items
            print(f"✓ Old items without payment_mode still work: status={item['status']}, payment_mode={item.get('payment_mode')}")
        finally:
            api_client.delete(f"{BASE_URL}/api/shopping-list/{item_id}")
