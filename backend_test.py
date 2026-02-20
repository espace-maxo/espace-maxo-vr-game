import requests
import sys
import json
from datetime import datetime, timedelta

class EspaceMaxoAPITester:
    def __init__(self, base_url="https://vr-gaming-hub-1.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.booking_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}" if endpoint else self.base_url
        if headers is None:
            headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)

            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return True, response.json()
                except:
                    return True, response.text
            else:
                error_msg = f"Expected {expected_status}, got {response.status_code}"
                print(f"❌ Failed - {error_msg}")
                self.failed_tests.append({
                    "test": name,
                    "error": error_msg,
                    "endpoint": url,
                    "response": response.text[:200] if response.text else ""
                })
                return False, {}

        except Exception as e:
            error_msg = f"Request failed: {str(e)}"
            print(f"❌ Failed - {error_msg}")
            self.failed_tests.append({
                "test": name,
                "error": error_msg,
                "endpoint": url
            })
            return False, {}

    def test_api_root(self):
        """Test API root endpoint"""
        success, response = self.run_test("API Root", "GET", "", 200)
        return success

    def test_menu_endpoints(self):
        """Test menu-related endpoints"""
        results = []
        
        # Test get all menu items
        success, menu_data = self.run_test("Get Menu Items", "GET", "menu", 200)
        results.append(success)
        
        if success and menu_data:
            print(f"   📋 Found {len(menu_data)} menu items")
            # Validate menu item structure
            if menu_data and isinstance(menu_data, list):
                sample_item = menu_data[0]
                required_fields = ['id', 'name', 'description', 'price', 'category', 'image_url']
                missing_fields = [f for f in required_fields if f not in sample_item]
                if missing_fields:
                    print(f"   ⚠️  Missing fields in menu items: {missing_fields}")
                else:
                    print(f"   ✅ Menu item structure is correct")
        
        # Test get menu categories
        success, categories_data = self.run_test("Get Menu Categories", "GET", "menu/categories", 200)
        results.append(success)
        
        if success and categories_data:
            categories = categories_data.get('categories', [])
            print(f"   📂 Found categories: {categories}")
        
        # Test get specific menu item (if we have menu data)
        if menu_data and len(menu_data) > 0:
            item_id = menu_data[0]['id']
            success, item_data = self.run_test("Get Single Menu Item", "GET", f"menu/{item_id}", 200)
            results.append(success)
        
        return all(results)

    def test_games_endpoints(self):
        """Test games-related endpoints"""
        results = []
        
        # Test get all games
        success, games_data = self.run_test("Get Games", "GET", "games", 200)
        results.append(success)
        
        if success and games_data:
            print(f"   🎮 Found {len(games_data)} games")
            # Validate games structure
            if games_data and isinstance(games_data, list):
                for game in games_data:
                    required_fields = ['id', 'name', 'game_type', 'price_per_game', 'image_url', 'duration_minutes']
                    missing_fields = [f for f in required_fields if f not in game]
                    if missing_fields:
                        print(f"   ⚠️  Missing fields in game {game.get('name', 'Unknown')}: {missing_fields}")
                    else:
                        print(f"   ✅ Game {game['name']} structure is correct")
                        print(f"      - Type: {game['game_type']}, Price: {game['price_per_game']} FCFA")
        
        # Test get specific game (if we have games data)
        if games_data and len(games_data) > 0:
            game_id = games_data[0]['id']
            success, game_data = self.run_test("Get Single Game", "GET", f"games/{game_id}", 200)
            results.append(success)
        
        return all(results)

    def test_slots_endpoint(self):
        """Test time slots endpoint"""
        # Test with today's date
        today = datetime.now().strftime('%Y-%m-%d')
        success, slots_data = self.run_test("Get Time Slots", "GET", f"slots/{today}", 200)
        
        if success and slots_data:
            slots = slots_data.get('slots', [])
            print(f"   ⏰ Found {len(slots)} time slots for {today}")
            available_slots = [s for s in slots if s.get('available')]
            print(f"   ✅ {len(available_slots)} slots are available")
        
        return success

    def test_booking_flow(self):
        """Test the complete booking flow"""
        results = []
        
        # Create a test booking
        tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        
        booking_data = {
            "customer_name": "Test Customer",
            "customer_phone": "01234567890",
            "game_type": "VR_360",
            "date": tomorrow,
            "time_slot": "14:00",
            "number_of_players": 2,
            "number_of_games": 1
        }
        
        success, booking_response = self.run_test("Create Booking", "POST", "bookings", 200, booking_data)
        results.append(success)
        
        if success and booking_response:
            self.booking_id = booking_response.get('id')
            print(f"   📝 Created booking with ID: {self.booking_id}")
            print(f"   💰 Total amount: {booking_response.get('total_amount')} FCFA")
            
            # Validate booking response structure
            required_fields = ['id', 'customer_name', 'game_type', 'date', 'time_slot', 'total_amount']
            missing_fields = [f for f in required_fields if f not in booking_response]
            if missing_fields:
                print(f"   ⚠️  Missing fields in booking response: {missing_fields}")
            else:
                print(f"   ✅ Booking structure is correct")
            
            # Test get booking details
            success, booking_details = self.run_test("Get Booking Details", "GET", f"bookings/{self.booking_id}", 200)
            results.append(success)
            
        return all(results)

    def test_checkout_flow(self):
        """Test checkout/payment flow"""
        if not self.booking_id:
            print("❌ Cannot test checkout - no booking ID available")
            return False
        
        results = []
        
        # Test create checkout session
        checkout_data = {
            "booking_id": self.booking_id,
            "origin_url": "https://vr-gaming-hub-1.preview.emergentagent.com"
        }
        
        success, checkout_response = self.run_test("Create Checkout Session", "POST", "checkout/create", 200, checkout_data)
        results.append(success)
        
        session_id = None
        if success and checkout_response:
            session_id = checkout_response.get('session_id')
            stripe_url = checkout_response.get('url')
            print(f"   💳 Created checkout session: {session_id}")
            print(f"   🔗 Stripe URL generated: {'Yes' if stripe_url else 'No'}")
            
            # Test get checkout status
            if session_id:
                success, status_response = self.run_test("Get Checkout Status", "GET", f"checkout/status/{session_id}", 200)
                results.append(success)
                
                if success and status_response:
                    payment_status = status_response.get('payment_status')
                    print(f"   📊 Payment status: {payment_status}")
        
        return all(results)

    def test_error_handling(self):
        """Test error handling"""
        results = []
        
        # Test invalid endpoints
        success, _ = self.run_test("Invalid Endpoint", "GET", "nonexistent", 404)
        results.append(success)
        
        # Test invalid booking data
        invalid_booking = {
            "customer_name": "",  # Empty name should fail
            "game_type": "INVALID_GAME"
        }
        success, _ = self.run_test("Invalid Booking Data", "POST", "bookings", 422, invalid_booking)
        # Note: We expect either 400 or 422 for validation errors
        if not success:
            # Try with 400 status code
            success, _ = self.run_test("Invalid Booking Data (400)", "POST", "bookings", 400, invalid_booking)
        results.append(success)
        
        return all(results)

    def print_summary(self):
        """Print test summary"""
        print(f"\n{'='*60}")
        print(f"🏁 TEST SUMMARY")
        print(f"{'='*60}")
        print(f"📊 Tests passed: {self.tests_passed}/{self.tests_run}")
        print(f"✅ Success rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        
        if self.failed_tests:
            print(f"\n❌ FAILED TESTS:")
            for failure in self.failed_tests:
                print(f"   • {failure['test']}: {failure['error']}")
                if failure.get('response'):
                    print(f"     Response: {failure['response']}")
        
        return self.tests_passed == self.tests_run

def main():
    print("🚀 Starting Espace Maxo API Testing")
    print("=" * 60)
    
    tester = EspaceMaxoAPITester()
    
    # Run all tests
    all_tests_passed = True
    
    print("\n📡 Testing API Connection...")
    if not tester.test_api_root():
        print("❌ API connection failed - stopping tests")
        return 1
    
    print("\n🍽️  Testing Menu Endpoints...")
    all_tests_passed &= tester.test_menu_endpoints()
    
    print("\n🎮 Testing Games Endpoints...")
    all_tests_passed &= tester.test_games_endpoints()
    
    print("\n⏰ Testing Slots Endpoint...")
    all_tests_passed &= tester.test_slots_endpoint()
    
    print("\n📝 Testing Booking Flow...")
    all_tests_passed &= tester.test_booking_flow()
    
    print("\n💳 Testing Checkout Flow...")
    all_tests_passed &= tester.test_checkout_flow()
    
    print("\n🚫 Testing Error Handling...")
    all_tests_passed &= tester.test_error_handling()
    
    # Print final summary
    success = tester.print_summary()
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())