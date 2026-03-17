"""
Test Subscriptions/Recurring Invoices API
Tests CRUD operations for subscriptions and payment recording
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSubscriptionsAPI:
    """Test subscription management endpoints"""
    
    # Store created subscription IDs for cleanup
    created_subscription_ids = []
    
    def test_get_subscriptions_list(self):
        """Test GET /api/subscriptions - list all subscriptions"""
        response = requests.get(f"{BASE_URL}/api/subscriptions")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "subscriptions" in data, "Response should contain 'subscriptions' key"
        assert "alerts" in data, "Response should contain 'alerts' key"
        assert "stats" in data, "Response should contain 'stats' key"
        
        # Verify alerts structure
        alerts = data["alerts"]
        assert "upcoming" in alerts
        assert "overdue" in alerts
        assert "due_today" in alerts
        
        # Verify stats structure
        stats = data["stats"]
        assert "total" in stats
        assert "client_count" in stats
        assert "supplier_count" in stats
        assert "monthly_total_suppliers" in stats
        print(f"✅ GET subscriptions: {len(data['subscriptions'])} subscriptions, {stats['total']} total")
    
    def test_get_subscriptions_filter_by_type(self):
        """Test filtering subscriptions by type (client/supplier)"""
        # Filter by supplier
        response = requests.get(f"{BASE_URL}/api/subscriptions?type=supplier")
        assert response.status_code == 200
        data = response.json()
        
        for sub in data["subscriptions"]:
            assert sub["type"] == "supplier", f"Expected supplier, got {sub['type']}"
        print(f"✅ Filter by supplier: {len(data['subscriptions'])} subscriptions")
    
    def test_get_subscriptions_filter_by_category(self):
        """Test filtering subscriptions by category"""
        response = requests.get(f"{BASE_URL}/api/subscriptions?category=internet")
        assert response.status_code == 200
        data = response.json()
        
        for sub in data["subscriptions"]:
            assert sub["category"] == "internet", f"Expected internet, got {sub['category']}"
        print(f"✅ Filter by category (internet): {len(data['subscriptions'])} subscriptions")
    
    def test_create_subscription_supplier(self):
        """Test POST /api/subscriptions - create a supplier subscription"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "name": f"TEST_Loyer_Local_{unique_id}",
            "type": "supplier",
            "category": "loyer",
            "contact_name": "Propriétaire Test",
            "contact_phone": "+229 97 00 00 00",
            "amount": 150000.0,
            "frequency": "monthly",
            "start_date": "2026-01-01",
            "next_due_date": "2026-04-01",
            "payment_method": "virement",
            "notes": "Test subscription for loyer",
            "is_active": True
        }
        
        response = requests.post(f"{BASE_URL}/api/subscriptions", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["success"] == True
        assert "subscription" in data
        
        subscription = data["subscription"]
        assert subscription["name"] == payload["name"]
        assert subscription["type"] == "supplier"
        assert subscription["category"] == "loyer"
        assert subscription["amount"] == 150000.0
        assert "id" in subscription
        
        # Store for cleanup
        self.__class__.created_subscription_ids.append(subscription["id"])
        print(f"✅ Created supplier subscription: {subscription['name']} (ID: {subscription['id']})")
        return subscription["id"]
    
    def test_create_subscription_client(self):
        """Test creating a client subscription (revenue)"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "name": f"TEST_Abonnement_Client_{unique_id}",
            "type": "client",
            "category": "autre",
            "contact_name": "Client Fidèle Test",
            "contact_phone": "+229 96 00 00 00",
            "amount": 50000.0,
            "frequency": "monthly",
            "start_date": "2026-01-01",
            "next_due_date": "2026-04-01",
            "payment_method": "mobile_money",
            "notes": "Test client subscription",
            "is_active": True
        }
        
        response = requests.post(f"{BASE_URL}/api/subscriptions", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["success"] == True
        subscription = data["subscription"]
        assert subscription["type"] == "client"
        
        self.__class__.created_subscription_ids.append(subscription["id"])
        print(f"✅ Created client subscription: {subscription['name']}")
        return subscription["id"]
    
    def test_get_single_subscription(self):
        """Test GET /api/subscriptions/{id} - get subscription with payment history"""
        # First create a subscription
        unique_id = str(uuid.uuid4())[:8]
        create_payload = {
            "name": f"TEST_Detail_Sub_{unique_id}",
            "type": "supplier",
            "category": "electricite",
            "contact_name": "SBEE Test",
            "amount": 30000.0,
            "frequency": "monthly",
            "start_date": "2026-01-01",
            "next_due_date": "2026-04-01",
            "payment_method": "especes",
            "is_active": True
        }
        
        create_response = requests.post(f"{BASE_URL}/api/subscriptions", json=create_payload)
        assert create_response.status_code == 200
        sub_id = create_response.json()["subscription"]["id"]
        self.__class__.created_subscription_ids.append(sub_id)
        
        # Now get the single subscription
        response = requests.get(f"{BASE_URL}/api/subscriptions/{sub_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "subscription" in data
        assert "payments" in data
        assert data["subscription"]["id"] == sub_id
        assert data["subscription"]["category"] == "electricite"
        print(f"✅ GET single subscription: {data['subscription']['name']}")
    
    def test_get_nonexistent_subscription(self):
        """Test GET subscription that doesn't exist returns 404"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/nonexistent-id-12345")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ GET nonexistent subscription returns 404")
    
    def test_update_subscription(self):
        """Test PUT /api/subscriptions/{id} - update subscription"""
        # First create a subscription
        unique_id = str(uuid.uuid4())[:8]
        create_payload = {
            "name": f"TEST_Update_Sub_{unique_id}",
            "type": "supplier",
            "category": "eau",
            "contact_name": "SONEB Test",
            "amount": 20000.0,
            "frequency": "monthly",
            "start_date": "2026-01-01",
            "next_due_date": "2026-04-01",
            "is_active": True
        }
        
        create_response = requests.post(f"{BASE_URL}/api/subscriptions", json=create_payload)
        sub_id = create_response.json()["subscription"]["id"]
        self.__class__.created_subscription_ids.append(sub_id)
        
        # Update the subscription
        update_payload = {
            "amount": 25000.0,
            "notes": "Montant mis à jour"
        }
        
        response = requests.put(f"{BASE_URL}/api/subscriptions/{sub_id}", json=update_payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["success"] == True
        assert data["subscription"]["amount"] == 25000.0
        assert data["subscription"]["notes"] == "Montant mis à jour"
        print(f"✅ Updated subscription amount to 25000")
    
    def test_record_payment(self):
        """Test POST /api/subscriptions/{id}/pay - record payment"""
        # First create a subscription
        unique_id = str(uuid.uuid4())[:8]
        create_payload = {
            "name": f"TEST_Payment_Sub_{unique_id}",
            "type": "supplier",
            "category": "telephone",
            "contact_name": "MTN Test",
            "amount": 10000.0,
            "frequency": "monthly",
            "start_date": "2026-01-01",
            "next_due_date": "2026-03-15",
            "payment_method": "mobile_money",
            "is_active": True
        }
        
        create_response = requests.post(f"{BASE_URL}/api/subscriptions", json=create_payload)
        sub_id = create_response.json()["subscription"]["id"]
        self.__class__.created_subscription_ids.append(sub_id)
        
        # Record a payment
        payment_payload = {
            "subscription_id": sub_id,
            "amount": 10000.0,
            "payment_date": "2026-03-15",
            "payment_method": "mobile_money",
            "notes": "Paiement test mars"
        }
        
        response = requests.post(f"{BASE_URL}/api/subscriptions/{sub_id}/pay", json=payment_payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["success"] == True
        assert "payment" in data
        assert "next_due_date" in data
        assert data["payment"]["amount"] == 10000.0
        
        # Verify next due date was updated
        verify_response = requests.get(f"{BASE_URL}/api/subscriptions/{sub_id}")
        verify_data = verify_response.json()
        assert verify_data["subscription"]["total_paid"] == 10000.0
        assert verify_data["subscription"]["payment_count"] == 1
        print(f"✅ Payment recorded: {data['payment']['amount']}F, next due: {data['next_due_date']}")
    
    def test_delete_subscription(self):
        """Test DELETE /api/subscriptions/{id}"""
        # First create a subscription to delete
        unique_id = str(uuid.uuid4())[:8]
        create_payload = {
            "name": f"TEST_Delete_Sub_{unique_id}",
            "type": "supplier",
            "category": "assurance",
            "contact_name": "Assurance Test",
            "amount": 50000.0,
            "frequency": "yearly",
            "start_date": "2026-01-01",
            "next_due_date": "2027-01-01",
            "is_active": True
        }
        
        create_response = requests.post(f"{BASE_URL}/api/subscriptions", json=create_payload)
        sub_id = create_response.json()["subscription"]["id"]
        
        # Delete the subscription
        response = requests.delete(f"{BASE_URL}/api/subscriptions/{sub_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["success"] == True
        
        # Verify it's deleted
        verify_response = requests.get(f"{BASE_URL}/api/subscriptions/{sub_id}")
        assert verify_response.status_code == 404, "Deleted subscription should return 404"
        print(f"✅ Deleted subscription successfully")
    
    def test_alerts_summary(self):
        """Test GET /api/subscriptions/alerts/summary"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/alerts/summary")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "overdue" in data
        assert "upcoming" in data
        assert "total_alerts" in data
        assert isinstance(data["overdue"], int)
        assert isinstance(data["upcoming"], int)
        print(f"✅ Alerts summary: {data['overdue']} overdue, {data['upcoming']} upcoming")
    
    def test_payment_history(self):
        """Test GET /api/subscriptions/payments/history"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/payments/history")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "payments" in data
        assert "total" in data
        assert "count" in data
        print(f"✅ Payment history: {data['count']} payments, total: {data['total']}F")
    
    @pytest.fixture(scope="class", autouse=True)
    def cleanup_test_subscriptions(self, request):
        """Cleanup test subscriptions after all tests complete"""
        yield
        # Teardown: Delete all test-created subscriptions
        for sub_id in self.__class__.created_subscription_ids:
            try:
                requests.delete(f"{BASE_URL}/api/subscriptions/{sub_id}")
            except:
                pass
        print(f"\n🧹 Cleaned up {len(self.__class__.created_subscription_ids)} test subscriptions")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
