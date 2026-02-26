"""
Tests for Combo Orders and Table Reservations API endpoints.
Testing the new features:
1. Combo orders with game session booking
2. Table reservations with deposit
3. Admin endpoints for managing these orders
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin credentials
ADMIN_PASSWORD_FULL = "Esp@ceM@xo2026"
ADMIN_PASSWORD_READONLY = "MaxoConsult2026"


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def admin_token(api_client):
    """Get authentication token for full admin access"""
    response = api_client.post(f"{BASE_URL}/api/auth/admin-login", json={
        "password": ADMIN_PASSWORD_FULL
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Admin authentication failed - skipping authenticated tests")


@pytest.fixture
def readonly_token(api_client):
    """Get authentication token for read-only admin access"""
    response = api_client.post(f"{BASE_URL}/api/auth/admin-login", json={
        "password": ADMIN_PASSWORD_READONLY
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Read-only admin authentication failed")


@pytest.fixture
def authenticated_client(api_client, admin_token):
    """Session with admin auth header"""
    api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
    return api_client


def get_future_date(days_ahead=7):
    """Get a date in the future for bookings"""
    future = datetime.now() + timedelta(days=days_ahead)
    return future.strftime("%Y-%m-%d")


class TestMenuCombosOnly:
    """Test that menu endpoint filters combos correctly"""
    
    def test_menu_returns_combos_with_is_combo_flag(self, api_client):
        """GET /api/menu should return items with is_combo field"""
        response = api_client.get(f"{BASE_URL}/api/menu")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        
        # Check that menu items have is_combo field
        for item in data:
            assert "is_combo" in item
            assert "id" in item
            assert "name" in item
            assert "price" in item
        
        # Count combos
        combos = [item for item in data if item.get("is_combo") == True]
        print(f"Found {len(combos)} combos out of {len(data)} total items")
        assert len(combos) > 0, "Should have at least one combo in menu"


class TestComboOrdersAPI:
    """Test Combo Orders endpoints - POST /api/combo-orders and GET /api/admin/combo-orders"""
    
    def test_create_combo_order_missing_fields(self, api_client):
        """POST /api/combo-orders should reject missing required fields"""
        response = api_client.post(f"{BASE_URL}/api/combo-orders", json={
            "customer_name": "",
            "customer_phone": ""
        })
        assert response.status_code in [400, 422]
    
    def test_create_combo_order_no_items(self, api_client):
        """POST /api/combo-orders should reject orders without items"""
        response = api_client.post(f"{BASE_URL}/api/combo-orders", json={
            "customer_name": "TEST_Client",
            "customer_phone": "97000001",
            "items": [],
            "game_type": "VR_360",
            "booking_date": get_future_date(),
            "time_slot": "14:00"
        })
        assert response.status_code == 400
        assert "combo" in response.json().get("detail", "").lower()
    
    def test_create_combo_order_success(self, api_client):
        """POST /api/combo-orders should create order successfully"""
        import random
        test_date = get_future_date(20 + random.randint(1, 10))  # Random date 20-30 days ahead
        time_slot = f"{random.randint(10, 18):02d}:{random.choice(['00', '30'])}"  # Random time slot
        response = api_client.post(f"{BASE_URL}/api/combo-orders", json={
            "customer_name": f"TEST_ComboClient_{random.randint(1000, 9999)}",
            "customer_phone": f"97{random.randint(100000, 999999)}",
            "items": [
                {"name": "Super Combo Solo", "price": 3500, "quantity": 1}
            ],
            "game_type": "VR_360",
            "number_of_players": 1,
            "number_of_games": 1,
            "booking_date": test_date,
            "time_slot": time_slot,
            "notes": "Test order",
            "payment_transaction_id": f"test_tx_{random.randint(1000, 9999)}",
            "wallet_amount_used": 0
        })
        
        print(f"Create combo order response: {response.status_code} - {response.text}")
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("success") == True
        assert "order_id" in data
        assert data.get("total") == 3500 + 2000  # combo + VR game
    
    def test_create_combo_order_with_simulator(self, api_client):
        """POST /api/combo-orders with RACING_SIMULATOR should use 1500 FCFA game price"""
        import random
        test_date = get_future_date(25 + random.randint(1, 5))  # Random date 25-30 days ahead
        time_slot = f"{random.randint(10, 18):02d}:{random.choice(['00', '30'])}"  # Random time slot
        response = api_client.post(f"{BASE_URL}/api/combo-orders", json={
            "customer_name": f"TEST_SimClient_{random.randint(1000, 9999)}",
            "customer_phone": f"97{random.randint(100000, 999999)}",
            "items": [
                {"name": "Super Combo 2 Personnes", "price": 6000, "quantity": 1}
            ],
            "game_type": "RACING_SIMULATOR",
            "number_of_players": 2,
            "number_of_games": 1,
            "booking_date": test_date,
            "time_slot": time_slot,
            "payment_transaction_id": f"test_tx_{random.randint(1000, 9999)}"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        # 6000 combo + (1500 * 2 players * 1 game) = 6000 + 3000 = 9000
        assert data.get("total") == 9000
    
    def test_admin_get_combo_orders_without_auth(self, api_client):
        """GET /api/admin/combo-orders without auth should return 401"""
        response = api_client.get(f"{BASE_URL}/api/admin/combo-orders")
        assert response.status_code == 401
    
    def test_admin_get_combo_orders_with_auth(self, authenticated_client):
        """GET /api/admin/combo-orders with auth should return orders list"""
        response = authenticated_client.get(f"{BASE_URL}/api/admin/combo-orders")
        
        assert response.status_code == 200
        data = response.json()
        assert "orders" in data
        assert isinstance(data["orders"], list)
        print(f"Found {len(data['orders'])} combo orders")


class TestTableReservationsAPI:
    """Test Table Reservations endpoints - POST /api/table-reservations and GET /api/admin/table-reservations"""
    
    def test_create_table_reservation_missing_fields(self, api_client):
        """POST /api/table-reservations should reject missing required fields"""
        response = api_client.post(f"{BASE_URL}/api/table-reservations", json={
            "customer_name": "",
            "customer_phone": ""
        })
        assert response.status_code in [400, 422]
    
    def test_create_table_reservation_invalid_deposit(self, api_client):
        """POST /api/table-reservations should reject invalid deposit amounts"""
        response = api_client.post(f"{BASE_URL}/api/table-reservations", json={
            "customer_name": "TEST_TableClient",
            "customer_phone": "97333444",
            "reservation_date": get_future_date(),
            "reservation_time": "19:00",
            "number_of_guests": 4,
            "deposit_amount": 3000  # Invalid - not in [5000, 10000, 15000, 20000, 25000]
        })
        assert response.status_code == 400
        assert "acompte" in response.json().get("detail", "").lower() or "deposit" in response.json().get("detail", "").lower()
    
    def test_create_table_reservation_5000_deposit(self, api_client):
        """POST /api/table-reservations with 5000 FCFA deposit should succeed"""
        test_date = get_future_date(5)
        response = api_client.post(f"{BASE_URL}/api/table-reservations", json={
            "customer_name": "TEST_Table5000",
            "customer_phone": "97444555",
            "reservation_date": test_date,
            "reservation_time": "19:00",
            "number_of_guests": 2,
            "special_occasion": "anniversaire",
            "notes": "Test reservation",
            "deposit_amount": 5000,
            "payment_transaction_id": "test_tx_table_1"
        })
        
        print(f"Create table reservation response: {response.status_code} - {response.text}")
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("success") == True
        assert "reservation_id" in data
    
    def test_create_table_reservation_25000_deposit(self, api_client):
        """POST /api/table-reservations with 25000 FCFA max deposit should succeed"""
        test_date = get_future_date(6)
        response = api_client.post(f"{BASE_URL}/api/table-reservations", json={
            "customer_name": "TEST_Table25000",
            "customer_phone": "97555666",
            "reservation_date": test_date,
            "reservation_time": "20:00",
            "number_of_guests": 10,
            "special_occasion": "mariage",
            "deposit_amount": 25000,
            "payment_transaction_id": "test_tx_table_2"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
    
    def test_create_table_reservation_no_occasion(self, api_client):
        """POST /api/table-reservations without special occasion should succeed"""
        test_date = get_future_date(7)
        response = api_client.post(f"{BASE_URL}/api/table-reservations", json={
            "customer_name": "TEST_TableNoOccasion",
            "customer_phone": "97666777",
            "reservation_date": test_date,
            "reservation_time": "12:30",
            "number_of_guests": 4,
            "special_occasion": "",
            "deposit_amount": 10000,
            "payment_transaction_id": "test_tx_table_3"
        })
        
        assert response.status_code == 200
    
    def test_admin_get_table_reservations_without_auth(self, api_client):
        """GET /api/admin/table-reservations without auth should return 401"""
        response = api_client.get(f"{BASE_URL}/api/admin/table-reservations")
        assert response.status_code == 401
    
    def test_admin_get_table_reservations_with_auth(self, authenticated_client):
        """GET /api/admin/table-reservations with auth should return reservations list"""
        response = authenticated_client.get(f"{BASE_URL}/api/admin/table-reservations")
        
        assert response.status_code == 200
        data = response.json()
        assert "reservations" in data
        assert "stats" in data
        assert isinstance(data["reservations"], list)
        print(f"Found {len(data['reservations'])} table reservations")
        print(f"Stats: {data['stats']}")


class TestAdminTabsAccess:
    """Test admin dashboard tabs functionality"""
    
    def test_admin_login_full_access(self, api_client):
        """Admin login with full password should return admin_full role"""
        response = api_client.post(f"{BASE_URL}/api/auth/admin-login", json={
            "password": ADMIN_PASSWORD_FULL
        })
        assert response.status_code == 200
        
        data = response.json()
        assert "token" in data
        assert data.get("role") == "admin_full"
    
    def test_admin_login_readonly_access(self, api_client):
        """Admin login with readonly password should return admin_readonly role"""
        response = api_client.post(f"{BASE_URL}/api/auth/admin-login", json={
            "password": ADMIN_PASSWORD_READONLY
        })
        assert response.status_code == 200
        
        data = response.json()
        assert "token" in data
        assert data.get("role") == "admin_readonly"
    
    def test_admin_stats_includes_new_data(self, authenticated_client):
        """GET /api/admin/stats should work with authentication"""
        response = authenticated_client.get(f"{BASE_URL}/api/admin/stats")
        
        assert response.status_code == 200
        data = response.json()
        assert "today_bookings" in data
        assert "total_bookings" in data


class TestSlotsAPI:
    """Test slots availability endpoint"""
    
    def test_get_slots_for_future_date(self, api_client):
        """GET /api/slots/{date} should return available time slots"""
        test_date = get_future_date(14)
        response = api_client.get(f"{BASE_URL}/api/slots/{test_date}")
        
        assert response.status_code == 200
        data = response.json()
        assert "date" in data
        assert "slots" in data
        assert isinstance(data["slots"], list)
        
        # Check slot structure
        if len(data["slots"]) > 0:
            slot = data["slots"][0]
            assert "time" in slot
            assert "available" in slot
