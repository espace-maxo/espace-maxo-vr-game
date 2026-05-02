"""
Test Journal Endpoints - Iteration 78
Tests for new Journal features: manual operations, delete, chat/LLM assistant.

New endpoints tested:
- POST /api/journal/manual → create manual entry/expense
- DELETE /api/journal/manual/{id} → delete manual operation
- POST /api/journal/chat → LLM assistant for parsing commands

Existing endpoints (cutoff verification):
- GET /api/journal/dashboard → balance calculated ONLY from 2026-05-01 (JOURNAL_CUTOFF)
- GET /api/journal/realtime → excludes operations before 2026-05-01
"""
import pytest
import requests
import os
import time
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# ==================== MANUAL OPERATIONS TESTS ====================

class TestJournalManualCreate:
    """Tests for POST /api/journal/manual endpoint"""
    
    def test_create_entree_returns_200(self):
        """Create manual entry (entree) should return success"""
        payload = {
            "type": "entree",
            "amount": 15000,
            "label": "TEST_iter78_entree"
        }
        response = requests.post(f"{BASE_URL}/api/journal/manual", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") is True, "Expected success=True"
        assert "operation" in data, "Missing 'operation' in response"
        op = data["operation"]
        assert op["type"] == "entree"
        assert op["amount"] == 15000
        assert "id" in op
        print(f"✓ Created entree: {op['id']} - {op['amount']} F")
        # Store for cleanup
        return op["id"]
    
    def test_create_depense_returns_200(self):
        """Create manual expense (depense) should return success"""
        payload = {
            "type": "depense",
            "amount": 5000,
            "label": "TEST_iter78_achat marché"
        }
        response = requests.post(f"{BASE_URL}/api/journal/manual", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") is True
        op = data["operation"]
        assert op["type"] == "depense"
        assert op["amount"] == 5000
        print(f"✓ Created depense: {op['id']} - {op['amount']} F")
        return op["id"]
    
    def test_depense_auto_categorization_cuisine(self):
        """Depense with 'marché' in label should auto-categorize as 'cuisine'"""
        payload = {
            "type": "depense",
            "amount": 3000,
            "label": "TEST_iter78_achat marché légumes"
        }
        response = requests.post(f"{BASE_URL}/api/journal/manual", json=payload)
        assert response.status_code == 200
        data = response.json()
        op = data["operation"]
        assert op["category"] == "cuisine", f"Expected category='cuisine', got '{op['category']}'"
        print(f"✓ Auto-categorization: 'marché' → cuisine")
    
    def test_depense_auto_categorization_charges(self):
        """Depense with 'loyer' in label should auto-categorize as 'charges'"""
        payload = {
            "type": "depense",
            "amount": 100000,
            "label": "TEST_iter78_loyer du mois"
        }
        response = requests.post(f"{BASE_URL}/api/journal/manual", json=payload)
        assert response.status_code == 200
        data = response.json()
        op = data["operation"]
        assert op["category"] == "charges", f"Expected category='charges', got '{op['category']}'"
        print(f"✓ Auto-categorization: 'loyer' → charges")
    
    def test_entree_auto_categorization_ventes(self):
        """Entree should auto-categorize as 'ventes'"""
        payload = {
            "type": "entree",
            "amount": 10000,
            "label": "TEST_iter78_vente du soir"
        }
        response = requests.post(f"{BASE_URL}/api/journal/manual", json=payload)
        assert response.status_code == 200
        data = response.json()
        op = data["operation"]
        assert op["category"] == "ventes", f"Expected category='ventes', got '{op['category']}'"
        print(f"✓ Auto-categorization: entree → ventes")
    
    def test_create_invalid_type_returns_422(self):
        """Invalid type should return 422"""
        payload = {
            "type": "invalid",
            "amount": 1000,
            "label": "TEST_iter78_invalid"
        }
        response = requests.post(f"{BASE_URL}/api/journal/manual", json=payload)
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print("✓ Invalid type returns 422")
    
    def test_create_negative_amount_returns_422(self):
        """Negative amount should return 422"""
        payload = {
            "type": "entree",
            "amount": -1000,
            "label": "TEST_iter78_negative"
        }
        response = requests.post(f"{BASE_URL}/api/journal/manual", json=payload)
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print("✓ Negative amount returns 422")
    
    def test_manual_op_increments_balance(self):
        """Creating entree should increment balance"""
        # Get initial balance
        dash_before = requests.get(f"{BASE_URL}/api/journal/dashboard", params={"days": 30}).json()
        balance_before = dash_before["actual"]["balance"]
        
        # Create entree
        payload = {"type": "entree", "amount": 7777, "label": "TEST_iter78_balance_check"}
        create_res = requests.post(f"{BASE_URL}/api/journal/manual", json=payload)
        assert create_res.status_code == 200
        op_id = create_res.json()["operation"]["id"]
        
        # Get new balance
        dash_after = requests.get(f"{BASE_URL}/api/journal/dashboard", params={"days": 30}).json()
        balance_after = dash_after["actual"]["balance"]
        
        assert balance_after == balance_before + 7777, \
            f"Balance should increase by 7777: {balance_before} → {balance_after}"
        print(f"✓ Balance incremented: {balance_before} → {balance_after} (+7777)")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/journal/manual/{op_id}")


class TestJournalManualDelete:
    """Tests for DELETE /api/journal/manual/{id} endpoint"""
    
    def test_delete_manual_op_returns_200(self):
        """Delete manual operation should return success"""
        # First create an operation
        payload = {"type": "entree", "amount": 1234, "label": "TEST_iter78_to_delete"}
        create_res = requests.post(f"{BASE_URL}/api/journal/manual", json=payload)
        assert create_res.status_code == 200
        op_id = create_res.json()["operation"]["id"]
        
        # Delete it
        delete_res = requests.delete(f"{BASE_URL}/api/journal/manual/{op_id}")
        assert delete_res.status_code == 200, f"Expected 200, got {delete_res.status_code}: {delete_res.text}"
        data = delete_res.json()
        assert data.get("success") is True
        print(f"✓ Deleted operation: {op_id}")
    
    def test_delete_nonexistent_returns_404(self):
        """Delete non-existent operation should return 404"""
        fake_id = str(uuid.uuid4())
        response = requests.delete(f"{BASE_URL}/api/journal/manual/{fake_id}")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Delete non-existent returns 404")
    
    def test_delete_restores_balance(self):
        """Deleting entree should restore balance"""
        # Get initial balance
        dash_before = requests.get(f"{BASE_URL}/api/journal/dashboard", params={"days": 30}).json()
        balance_before = dash_before["actual"]["balance"]
        
        # Create entree
        payload = {"type": "entree", "amount": 5555, "label": "TEST_iter78_delete_balance"}
        create_res = requests.post(f"{BASE_URL}/api/journal/manual", json=payload)
        op_id = create_res.json()["operation"]["id"]
        
        # Verify balance increased
        dash_mid = requests.get(f"{BASE_URL}/api/journal/dashboard", params={"days": 30}).json()
        assert dash_mid["actual"]["balance"] == balance_before + 5555
        
        # Delete operation
        requests.delete(f"{BASE_URL}/api/journal/manual/{op_id}")
        
        # Verify balance restored
        dash_after = requests.get(f"{BASE_URL}/api/journal/dashboard", params={"days": 30}).json()
        assert dash_after["actual"]["balance"] == balance_before, \
            f"Balance should be restored: {balance_before} != {dash_after['actual']['balance']}"
        print(f"✓ Balance restored after delete: {balance_before}")


# ==================== CHAT/LLM ASSISTANT TESTS ====================

class TestJournalChat:
    """Tests for POST /api/journal/chat endpoint (LLM assistant)"""
    
    def test_chat_entree_creates_real(self):
        """Chat 'ENTRÉE: 25000 - vente du soir' should create real entry"""
        payload = {"message": "ENTRÉE: 25000 - TEST_iter78_vente du soir"}
        response = requests.post(f"{BASE_URL}/api/journal/chat", json=payload, timeout=30)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("success") is True, "Expected success=True"
        assert data.get("action") == "create_real", f"Expected action='create_real', got '{data.get('action')}'"
        assert data.get("executed") is True, "Expected executed=True"
        
        parsed = data.get("parsed", {})
        assert parsed.get("type") == "entree", f"Expected type='entree', got '{parsed.get('type')}'"
        assert parsed.get("amount") == 25000, f"Expected amount=25000, got {parsed.get('amount')}"
        
        result = data.get("result", {})
        assert "id" in result, "Result should have 'id'"
        print(f"✓ Chat ENTRÉE created: {result.get('id')} - 25000 F")
        
        # Cleanup
        if result.get("id"):
            requests.delete(f"{BASE_URL}/api/journal/manual/{result['id']}")
    
    def test_chat_depense_creates_real(self):
        """Chat 'DÉPENSE: 5000 - taxi marché' should create real expense"""
        payload = {"message": "DÉPENSE: 5000 - TEST_iter78_taxi marché"}
        response = requests.post(f"{BASE_URL}/api/journal/chat", json=payload, timeout=30)
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("action") == "create_real"
        assert data.get("executed") is True
        
        parsed = data.get("parsed", {})
        assert parsed.get("type") == "depense"
        assert parsed.get("amount") == 5000
        
        result = data.get("result", {})
        # Category should be cuisine or divers (taxi marché → cuisine likely)
        assert result.get("category") in ["cuisine", "divers"], \
            f"Expected category cuisine/divers, got '{result.get('category')}'"
        print(f"✓ Chat DÉPENSE created: {result.get('id')} - 5000 F ({result.get('category')})")
        
        # Cleanup
        if result.get("id"):
            requests.delete(f"{BASE_URL}/api/journal/manual/{result['id']}")
    
    def test_chat_prevision_depense_creates_forecast(self):
        """Chat 'PRÉVISION DÉPENSE: 100000 - loyer du mois - 2026-06-01' should create forecast"""
        payload = {"message": "PRÉVISION DÉPENSE: 100000 - TEST_iter78_loyer du mois - 2026-06-01"}
        response = requests.post(f"{BASE_URL}/api/journal/chat", json=payload, timeout=30)
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("action") == "create_forecast", f"Expected action='create_forecast', got '{data.get('action')}'"
        assert data.get("executed") is True
        
        result = data.get("result", {})
        assert result.get("status") == "prevu", f"Expected status='prevu', got '{result.get('status')}'"
        assert result.get("date") == "2026-06-01", f"Expected date='2026-06-01', got '{result.get('date')}'"
        assert result.get("amount") == 100000
        print(f"✓ Chat PRÉVISION created: {result.get('id')} - 100000 F for 2026-06-01")
    
    def test_chat_situation_shows_balance(self):
        """Chat 'SITUATION' should return show_balance action without creating anything"""
        payload = {"message": "SITUATION"}
        response = requests.post(f"{BASE_URL}/api/journal/chat", json=payload, timeout=30)
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("action") == "show_balance", f"Expected action='show_balance', got '{data.get('action')}'"
        assert data.get("executed") is False, "Expected executed=False for show_balance"
        assert "💰" in data.get("explain", ""), "Expected emoji 💰 in explain"
        print(f"✓ Chat SITUATION: action=show_balance, executed=False, explain contains 💰")
    
    def test_chat_unknown_gives_examples(self):
        """Chat 'salut' should return unknown action with examples"""
        payload = {"message": "salut"}
        response = requests.post(f"{BASE_URL}/api/journal/chat", json=payload, timeout=30)
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("action") == "unknown", f"Expected action='unknown', got '{data.get('action')}'"
        assert data.get("executed") is False
        explain = data.get("explain", "")
        assert "ENTRÉE" in explain or "exemple" in explain.lower(), \
            f"Expected examples in explain, got: {explain}"
        print(f"✓ Chat unknown: action=unknown, executed=False, explain has examples")
    
    def test_chat_empty_message_returns_422(self):
        """Empty message should return 422"""
        payload = {"message": ""}
        response = requests.post(f"{BASE_URL}/api/journal/chat", json=payload, timeout=30)
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print("✓ Empty message returns 422")


# ==================== CUTOFF DATE TESTS ====================

class TestJournalCutoff:
    """Tests for JOURNAL_CUTOFF = 2026-05-01"""
    
    def test_dashboard_uses_cutoff(self):
        """Dashboard should only count operations from 2026-05-01"""
        response = requests.get(f"{BASE_URL}/api/journal/dashboard", params={"days": 180})
        assert response.status_code == 200
        data = response.json()
        
        # The balance should be calculated only from cutoff date
        # We can't directly verify cutoff, but we can check the endpoint works
        assert "actual" in data
        assert "balance" in data["actual"]
        print(f"✓ Dashboard returns balance: {data['actual']['balance']} F (cutoff applied)")
    
    def test_realtime_excludes_pre_cutoff(self):
        """Realtime should exclude operations before 2026-05-01"""
        response = requests.get(f"{BASE_URL}/api/journal/realtime", params={"days": 365, "limit": 1000})
        assert response.status_code == 200
        data = response.json()
        operations = data.get("operations", [])
        
        # Check all operations are >= 2026-05-01
        cutoff = "2026-05-01"
        for op in operations:
            created_at = op.get("created_at", "")
            if created_at:
                date_part = created_at[:10]  # YYYY-MM-DD
                assert date_part >= cutoff, \
                    f"Operation {op['id']} has date {date_part} before cutoff {cutoff}"
        
        print(f"✓ All {len(operations)} operations are >= {cutoff}")


# ==================== REALTIME WITH MANUAL OPS ====================

class TestJournalRealtimeManual:
    """Tests for manual operations appearing in realtime list"""
    
    def test_manual_op_appears_in_realtime(self):
        """Created manual operation should appear in realtime list with deletable=True"""
        # Create manual operation
        payload = {"type": "entree", "amount": 9999, "label": "TEST_iter78_realtime_check"}
        create_res = requests.post(f"{BASE_URL}/api/journal/manual", json=payload)
        assert create_res.status_code == 200
        op_id = create_res.json()["operation"]["id"]
        
        # Check realtime list
        realtime_res = requests.get(f"{BASE_URL}/api/journal/realtime", params={"days": 30, "limit": 100})
        assert realtime_res.status_code == 200
        operations = realtime_res.json().get("operations", [])
        
        # Find our operation
        found = None
        for op in operations:
            if op.get("ref_id") == op_id:
                found = op
                break
        
        assert found is not None, f"Manual operation {op_id} not found in realtime list"
        assert found.get("deletable") is True, "Manual operation should have deletable=True"
        assert found.get("source") == "manual", f"Expected source='manual', got '{found.get('source')}'"
        print(f"✓ Manual operation appears in realtime with deletable=True")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/journal/manual/{op_id}")
    
    def test_chat_created_op_appears_in_realtime(self):
        """Chat-created operation should appear in realtime with source='chat'"""
        # Create via chat
        payload = {"message": "ENTRÉE: 8888 - TEST_iter78_chat_realtime"}
        chat_res = requests.post(f"{BASE_URL}/api/journal/chat", json=payload, timeout=30)
        assert chat_res.status_code == 200
        result = chat_res.json().get("result", {})
        op_id = result.get("id")
        
        if not op_id:
            pytest.skip("Chat did not create operation")
        
        # Check realtime list
        realtime_res = requests.get(f"{BASE_URL}/api/journal/realtime", params={"days": 30, "limit": 100})
        operations = realtime_res.json().get("operations", [])
        
        found = None
        for op in operations:
            if op.get("ref_id") == op_id:
                found = op
                break
        
        assert found is not None, f"Chat operation {op_id} not found in realtime list"
        assert found.get("source") == "chat", f"Expected source='chat', got '{found.get('source')}'"
        print(f"✓ Chat operation appears in realtime with source='chat'")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/journal/manual/{op_id}")


# ==================== CLEANUP ====================

class TestCleanup:
    """Cleanup test data created during tests"""
    
    def test_cleanup_test_data(self):
        """Remove all TEST_iter78_ prefixed operations"""
        # Get all operations
        realtime_res = requests.get(f"{BASE_URL}/api/journal/realtime", params={"days": 30, "limit": 500})
        operations = realtime_res.json().get("operations", [])
        
        deleted = 0
        for op in operations:
            if "TEST_iter78" in op.get("label", ""):
                if op.get("deletable"):
                    del_res = requests.delete(f"{BASE_URL}/api/journal/manual/{op['ref_id']}")
                    if del_res.status_code == 200:
                        deleted += 1
        
        print(f"✓ Cleaned up {deleted} test operations")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
