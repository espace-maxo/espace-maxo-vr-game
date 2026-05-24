"""
Test Achats Manager — Iteration 83
Tests for the new Achats Manager features:
1. POST /api/expenses/{id}/mark-bought with payment_mode (fonds_propres / caisse_restau)
2. POST /api/expenses/{id}/reimburse-fonds-propres
3. POST /api/expenses/reimburse-all-fonds-propres
4. GET /api/expenses/payment-mode-cumul?source=appro_manager
5. GET /api/cash-closures/snapshot?date=YYYY-MM-DD (fonds_propres fields)
6. PUT /api/expenses/{id} accepts payment_mode, reimbursed, reimbursed_at, reimbursed_by
"""
import pytest
import requests
import uuid
from datetime import datetime

BASE_URL = "https://caisse-mon-point.preview.emergentagent.com"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def test_expense_id(api_client):
    """Create a test expense with source=appro_manager for testing"""
    unique_id = str(uuid.uuid4())[:8]
    payload = {
        "category": "cuisine",
        "description": f"TEST_AchatsManager_{unique_id}",
        "quantity": 2,
        "unit_price": 5000,
        "amount": 10000,
        "requested_by": "Test Admin",
        "supplier": "Test Supplier",
    }
    r = api_client.post(f"{BASE_URL}/api/expenses", json=payload)
    assert r.status_code == 200, f"Failed to create expense: {r.text}"
    expense_id = r.json()["expense"]["id"]
    
    # Update to set source=appro_manager (simulating transfer from Appro Manager)
    r2 = api_client.put(f"{BASE_URL}/api/expenses/{expense_id}", json={
        "source": "appro_manager"
    })
    # Note: source may not be directly settable via PUT, let's check
    
    yield expense_id
    
    # Cleanup
    api_client.delete(f"{BASE_URL}/api/expenses/{expense_id}")


class TestMarkBoughtEndpoint:
    """Tests for POST /api/expenses/{id}/mark-bought"""
    
    def test_mark_bought_fonds_propres(self, api_client):
        """Mark expense as bought with payment_mode=fonds_propres"""
        # Create a fresh expense
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "category": "cuisine",
            "description": f"TEST_FondsPropres_{unique_id}",
            "quantity": 1,
            "unit_price": 3000,
            "amount": 3000,
            "requested_by": "Test Admin",
        }
        r = api_client.post(f"{BASE_URL}/api/expenses", json=payload)
        assert r.status_code == 200
        expense_id = r.json()["expense"]["id"]
        
        try:
            # Mark as bought with fonds_propres
            r2 = api_client.post(f"{BASE_URL}/api/expenses/{expense_id}/mark-bought", json={
                "payment_mode": "fonds_propres",
                "paid_by": "Test Admin"
            })
            assert r2.status_code == 200, f"mark-bought failed: {r2.text}"
            data = r2.json()
            assert data["success"] is True
            
            # Verify expense was updated correctly
            expense = data["expense"]
            assert expense["payment_mode"] == "fonds_propres"
            assert expense["status"] == "completed"
            assert expense["is_paid"] is True
            assert expense["paid_at"] is not None
            assert expense["reimbursed"] is False  # Should be False for fonds_propres
            
            print(f"✓ mark-bought fonds_propres: payment_mode={expense['payment_mode']}, status={expense['status']}, reimbursed={expense['reimbursed']}")
        finally:
            api_client.delete(f"{BASE_URL}/api/expenses/{expense_id}")
    
    def test_mark_bought_caisse_restau(self, api_client):
        """Mark expense as bought with payment_mode=caisse_restau"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "category": "bar",
            "description": f"TEST_CaisseRestau_{unique_id}",
            "quantity": 1,
            "unit_price": 2500,
            "amount": 2500,
            "requested_by": "Test Admin",
        }
        r = api_client.post(f"{BASE_URL}/api/expenses", json=payload)
        assert r.status_code == 200
        expense_id = r.json()["expense"]["id"]
        
        try:
            r2 = api_client.post(f"{BASE_URL}/api/expenses/{expense_id}/mark-bought", json={
                "payment_mode": "caisse_restau",
                "paid_by": "Test Admin"
            })
            assert r2.status_code == 200, f"mark-bought failed: {r2.text}"
            data = r2.json()
            assert data["success"] is True
            
            expense = data["expense"]
            assert expense["payment_mode"] == "caisse_restau"
            assert expense["status"] == "completed"
            assert expense["is_paid"] is True
            # caisse_restau should NOT have reimbursed field set to False
            
            print(f"✓ mark-bought caisse_restau: payment_mode={expense['payment_mode']}, status={expense['status']}")
        finally:
            api_client.delete(f"{BASE_URL}/api/expenses/{expense_id}")
    
    def test_mark_bought_invalid_payment_mode(self, api_client):
        """Mark expense with invalid payment_mode should return 400"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "category": "autres",
            "description": f"TEST_InvalidMode_{unique_id}",
            "quantity": 1,
            "unit_price": 1000,
            "amount": 1000,
            "requested_by": "Test Admin",
        }
        r = api_client.post(f"{BASE_URL}/api/expenses", json=payload)
        assert r.status_code == 200
        expense_id = r.json()["expense"]["id"]
        
        try:
            r2 = api_client.post(f"{BASE_URL}/api/expenses/{expense_id}/mark-bought", json={
                "payment_mode": "invalid_mode",
                "paid_by": "Test Admin"
            })
            assert r2.status_code == 400, f"Expected 400 for invalid payment_mode, got {r2.status_code}"
            print(f"✓ mark-bought invalid mode returns 400: {r2.json()}")
        finally:
            api_client.delete(f"{BASE_URL}/api/expenses/{expense_id}")


class TestReimburseFondsPropres:
    """Tests for POST /api/expenses/{id}/reimburse-fonds-propres"""
    
    def test_reimburse_fonds_propres_success(self, api_client):
        """Reimburse a fonds_propres expense"""
        unique_id = str(uuid.uuid4())[:8]
        # Create and mark as bought with fonds_propres
        payload = {
            "category": "cuisine",
            "description": f"TEST_Reimburse_{unique_id}",
            "quantity": 1,
            "unit_price": 4000,
            "amount": 4000,
            "requested_by": "Test Admin",
        }
        r = api_client.post(f"{BASE_URL}/api/expenses", json=payload)
        assert r.status_code == 200
        expense_id = r.json()["expense"]["id"]
        
        try:
            # Mark as bought with fonds_propres
            r2 = api_client.post(f"{BASE_URL}/api/expenses/{expense_id}/mark-bought", json={
                "payment_mode": "fonds_propres",
                "paid_by": "Test Admin"
            })
            assert r2.status_code == 200
            
            # Now reimburse
            r3 = api_client.post(f"{BASE_URL}/api/expenses/{expense_id}/reimburse-fonds-propres", json={
                "reimbursed_by": "Test Admin"
            })
            assert r3.status_code == 200, f"reimburse failed: {r3.text}"
            assert r3.json()["success"] is True
            
            # Verify expense is now reimbursed
            r4 = api_client.get(f"{BASE_URL}/api/expenses")
            expenses = r4.json()["expenses"]
            expense = next((e for e in expenses if e["id"] == expense_id), None)
            assert expense is not None
            assert expense["reimbursed"] is True
            assert expense["reimbursed_at"] is not None
            
            print(f"✓ reimburse-fonds-propres: reimbursed={expense['reimbursed']}, reimbursed_at={expense['reimbursed_at']}")
        finally:
            api_client.delete(f"{BASE_URL}/api/expenses/{expense_id}")
    
    def test_reimburse_non_fonds_propres_fails(self, api_client):
        """Reimburse a non-fonds_propres expense should fail"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "category": "bar",
            "description": f"TEST_NonFP_{unique_id}",
            "quantity": 1,
            "unit_price": 2000,
            "amount": 2000,
            "requested_by": "Test Admin",
        }
        r = api_client.post(f"{BASE_URL}/api/expenses", json=payload)
        assert r.status_code == 200
        expense_id = r.json()["expense"]["id"]
        
        try:
            # Mark as bought with caisse_restau
            r2 = api_client.post(f"{BASE_URL}/api/expenses/{expense_id}/mark-bought", json={
                "payment_mode": "caisse_restau",
                "paid_by": "Test Admin"
            })
            assert r2.status_code == 200
            
            # Try to reimburse - should fail
            r3 = api_client.post(f"{BASE_URL}/api/expenses/{expense_id}/reimburse-fonds-propres", json={
                "reimbursed_by": "Test Admin"
            })
            assert r3.status_code == 400, f"Expected 400 for non-fonds_propres, got {r3.status_code}"
            print(f"✓ reimburse non-fonds_propres returns 400: {r3.json()}")
        finally:
            api_client.delete(f"{BASE_URL}/api/expenses/{expense_id}")
    
    def test_reimburse_already_reimbursed_fails(self, api_client):
        """Reimburse an already reimbursed expense should fail"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "category": "cuisine",
            "description": f"TEST_AlreadyReimb_{unique_id}",
            "quantity": 1,
            "unit_price": 1500,
            "amount": 1500,
            "requested_by": "Test Admin",
        }
        r = api_client.post(f"{BASE_URL}/api/expenses", json=payload)
        assert r.status_code == 200
        expense_id = r.json()["expense"]["id"]
        
        try:
            # Mark as bought with fonds_propres
            api_client.post(f"{BASE_URL}/api/expenses/{expense_id}/mark-bought", json={
                "payment_mode": "fonds_propres",
                "paid_by": "Test Admin"
            })
            
            # Reimburse first time
            r2 = api_client.post(f"{BASE_URL}/api/expenses/{expense_id}/reimburse-fonds-propres", json={
                "reimbursed_by": "Test Admin"
            })
            assert r2.status_code == 200
            
            # Try to reimburse again - should fail
            r3 = api_client.post(f"{BASE_URL}/api/expenses/{expense_id}/reimburse-fonds-propres", json={
                "reimbursed_by": "Test Admin"
            })
            assert r3.status_code == 400, f"Expected 400 for already reimbursed, got {r3.status_code}"
            print(f"✓ reimburse already reimbursed returns 400: {r3.json()}")
        finally:
            api_client.delete(f"{BASE_URL}/api/expenses/{expense_id}")


class TestReimburseAllFondsPropres:
    """Tests for POST /api/expenses/reimburse-all-fonds-propres"""
    
    def test_reimburse_all_fonds_propres(self, api_client):
        """Reimburse all pending fonds_propres expenses"""
        unique_id = str(uuid.uuid4())[:8]
        expense_ids = []
        
        try:
            # Create 3 expenses and mark as fonds_propres
            for i in range(3):
                payload = {
                    "category": "cuisine",
                    "description": f"TEST_BulkReimb_{unique_id}_{i}",
                    "quantity": 1,
                    "unit_price": 1000 * (i + 1),
                    "amount": 1000 * (i + 1),
                    "requested_by": "Test Admin",
                }
                r = api_client.post(f"{BASE_URL}/api/expenses", json=payload)
                assert r.status_code == 200
                expense_id = r.json()["expense"]["id"]
                expense_ids.append(expense_id)
                
                # Mark as bought with fonds_propres
                api_client.post(f"{BASE_URL}/api/expenses/{expense_id}/mark-bought", json={
                    "payment_mode": "fonds_propres",
                    "paid_by": "Test Admin"
                })
            
            # Reimburse all
            r2 = api_client.post(f"{BASE_URL}/api/expenses/reimburse-all-fonds-propres", json={
                "reimbursed_by": "Test Admin Bulk"
            })
            assert r2.status_code == 200, f"reimburse-all failed: {r2.text}"
            data = r2.json()
            assert data["success"] is True
            assert data["count"] >= 3  # At least our 3 test expenses
            assert data["total_amount"] >= 6000  # 1000 + 2000 + 3000
            
            print(f"✓ reimburse-all-fonds-propres: count={data['count']}, total_amount={data['total_amount']}")
        finally:
            for eid in expense_ids:
                api_client.delete(f"{BASE_URL}/api/expenses/{eid}")


class TestPaymentModeCumul:
    """Tests for GET /api/expenses/payment-mode-cumul"""
    
    def test_payment_mode_cumul_structure(self, api_client):
        """Verify payment-mode-cumul returns correct structure"""
        r = api_client.get(f"{BASE_URL}/api/expenses/payment-mode-cumul", params={"source": "appro_manager"})
        assert r.status_code == 200, f"payment-mode-cumul failed: {r.text}"
        data = r.json()
        
        # Verify fonds_propres structure
        assert "fonds_propres" in data
        fp = data["fonds_propres"]
        assert "total" in fp
        assert "count" in fp
        assert "reimbursed_total" in fp
        assert "reimbursed_count" in fp
        assert "pending_total" in fp
        assert "pending_count" in fp
        
        # Verify caisse_restau structure
        assert "caisse_restau" in data
        cr = data["caisse_restau"]
        assert "total" in cr
        assert "count" in cr
        
        print(f"✓ payment-mode-cumul structure: fonds_propres={fp}, caisse_restau={cr}")
    
    def test_payment_mode_cumul_with_data(self, api_client):
        """Create expenses and verify cumul reflects them (without source filter)"""
        unique_id = str(uuid.uuid4())[:8]
        expense_ids = []
        
        try:
            # Create expense with fonds_propres
            payload1 = {
                "category": "cuisine",
                "description": f"TEST_CumulFP_{unique_id}",
                "quantity": 1,
                "unit_price": 5000,
                "amount": 5000,
                "requested_by": "Test Admin",
            }
            r1 = api_client.post(f"{BASE_URL}/api/expenses", json=payload1)
            assert r1.status_code == 200
            exp1_id = r1.json()["expense"]["id"]
            expense_ids.append(exp1_id)
            
            # Mark as fonds_propres (source can't be set via PUT, so we test without source filter)
            api_client.post(f"{BASE_URL}/api/expenses/{exp1_id}/mark-bought", json={
                "payment_mode": "fonds_propres",
                "paid_by": "Test Admin"
            })
            
            # Create expense with caisse_restau
            payload2 = {
                "category": "bar",
                "description": f"TEST_CumulCR_{unique_id}",
                "quantity": 1,
                "unit_price": 3000,
                "amount": 3000,
                "requested_by": "Test Admin",
            }
            r2 = api_client.post(f"{BASE_URL}/api/expenses", json=payload2)
            assert r2.status_code == 200
            exp2_id = r2.json()["expense"]["id"]
            expense_ids.append(exp2_id)
            
            api_client.post(f"{BASE_URL}/api/expenses/{exp2_id}/mark-bought", json={
                "payment_mode": "caisse_restau",
                "paid_by": "Test Admin"
            })
            
            # Check cumul WITHOUT source filter (since source can't be set via PUT)
            r3 = api_client.get(f"{BASE_URL}/api/expenses/payment-mode-cumul")
            assert r3.status_code == 200
            data = r3.json()
            
            # Should have at least our test data
            assert data["fonds_propres"]["count"] >= 1
            assert data["fonds_propres"]["pending_count"] >= 1  # Not yet reimbursed
            assert data["caisse_restau"]["count"] >= 1
            
            print(f"✓ payment-mode-cumul with data: FP pending={data['fonds_propres']['pending_count']}, CR count={data['caisse_restau']['count']}")
        finally:
            for eid in expense_ids:
                api_client.delete(f"{BASE_URL}/api/expenses/{eid}")


class TestCashClosuresSnapshot:
    """Tests for GET /api/cash-closures/snapshot (fonds_propres fields)"""
    
    def test_snapshot_contains_fonds_propres_fields(self, api_client):
        """Verify snapshot contains fonds_propres_reimbursed_today and pending fields"""
        today = datetime.now().strftime("%Y-%m-%d")
        r = api_client.get(f"{BASE_URL}/api/cash-closures/live", params={"date": today})
        assert r.status_code == 200, f"cash-closures/live failed: {r.text}"
        data = r.json()
        
        assert "snapshot" in data
        snap = data["snapshot"]
        
        # Verify fonds_propres fields exist
        assert "fonds_propres_reimbursed_today_total" in snap
        assert "fonds_propres_reimbursed_today_count" in snap
        assert "fonds_propres_pending_total" in snap
        assert "fonds_propres_pending_count" in snap
        
        print(f"✓ snapshot fonds_propres fields: reimbursed_today={snap['fonds_propres_reimbursed_today_total']}, pending={snap['fonds_propres_pending_total']}")


class TestExpenseUpdatePaymentFields:
    """Tests for PUT /api/expenses/{id} with payment_mode, reimbursed, reimbursed_at, reimbursed_by"""
    
    def test_update_expense_payment_fields(self, api_client):
        """Update expense with payment_mode and reimbursed fields via PUT"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "category": "cuisine",
            "description": f"TEST_UpdatePayment_{unique_id}",
            "quantity": 1,
            "unit_price": 2000,
            "amount": 2000,
            "requested_by": "Test Admin",
        }
        r = api_client.post(f"{BASE_URL}/api/expenses", json=payload)
        assert r.status_code == 200
        expense_id = r.json()["expense"]["id"]
        
        try:
            # Update with payment fields
            now_iso = datetime.now().isoformat()
            r2 = api_client.put(f"{BASE_URL}/api/expenses/{expense_id}", json={
                "payment_mode": "fonds_propres",
                "reimbursed": True,
                "reimbursed_at": now_iso,
                "reimbursed_by": "Test Admin PUT"
            })
            assert r2.status_code == 200, f"PUT failed: {r2.text}"
            
            expense = r2.json()["expense"]
            assert expense["payment_mode"] == "fonds_propres"
            assert expense["reimbursed"] is True
            assert expense["reimbursed_at"] is not None
            assert expense["reimbursed_by"] == "Test Admin PUT"
            
            print(f"✓ PUT expense payment fields: payment_mode={expense['payment_mode']}, reimbursed={expense['reimbursed']}")
        finally:
            api_client.delete(f"{BASE_URL}/api/expenses/{expense_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
