import requests
import sys
import json
from datetime import datetime, timedelta

class EspaceMaxoAPITester:
    def __init__(self, base_url="https://caisse-mon-point.preview.emergentagent.com/api"):
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

    def test_kkiapay_payment_flow(self):
        """Test Kkiapay payment configuration and flow"""
        results = []
        
        # Test payment configuration endpoint
        success, config_data = self.run_test("Get Payment Config", "GET", "payment/config", 200)
        results.append(success)
        
        if success and config_data:
            sandbox_mode = config_data.get('sandbox')
            whatsapp_number = config_data.get('whatsapp_number')
            public_key = config_data.get('public_key')
            
            print(f"   🏖️  Sandbox mode: {sandbox_mode}")
            print(f"   📱 WhatsApp number: {whatsapp_number}")
            print(f"   🔑 Public key present: {'Yes' if public_key else 'No (Demo mode)'}")
            
            # Validate WhatsApp number is correct
            if whatsapp_number == "22901414700":
                print(f"   ✅ WhatsApp number is correct: {whatsapp_number}")
            else:
                print(f"   ❌ WhatsApp number incorrect! Expected: 22901414700, Got: {whatsapp_number}")
            
            # Validate sandbox mode
            if sandbox_mode is True:
                print(f"   ✅ Sandbox mode enabled correctly")
            else:
                print(f"   ⚠️  Sandbox mode: {sandbox_mode}")
        
        if not self.booking_id:
            print("   ⚠️  Cannot test payment verification - no booking ID available")
            return all(results)
        
        # Test payment status endpoint
        success, status_response = self.run_test("Get Payment Status", "GET", f"payment/status/{self.booking_id}", 200)
        results.append(success)
        
        if success and status_response:
            payment_status = status_response.get('payment_status')
            booking_id = status_response.get('booking_id')
            print(f"   📊 Payment status for booking {booking_id}: {payment_status}")
            
            if payment_status == "pending":
                print(f"   ✅ Initial payment status is pending (expected)")
            
        # Test payment verification (simulate success)
        verify_data = {
            "transaction_id": f"TEST_TX_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "booking_id": self.booking_id
        }
        
        success, verify_response = self.run_test("Verify Payment", "POST", "payment/verify", 200, verify_data)
        results.append(success)
        
        if success and verify_response:
            verify_status = verify_response.get('status')
            message = verify_response.get('message')
            print(f"   ✅ Payment verification status: {verify_status}")
            print(f"   📝 Message: {message}")
            
            # Check if booking was updated
            if verify_status == "success":
                # Recheck payment status
                success2, status_response2 = self.run_test("Get Updated Payment Status", "GET", f"payment/status/{self.booking_id}", 200)
                if success2 and status_response2:
                    updated_status = status_response2.get('payment_status')
                    print(f"   🔄 Updated payment status: {updated_status}")
                    if updated_status == "paid":
                        print(f"   ✅ Payment status updated correctly to 'paid'")
        
        return all(results)

    def test_admin_endpoints(self):
        """Test admin dashboard endpoints"""
        results = []
        
        # Test get admin statistics
        success, stats_data = self.run_test("Get Admin Stats", "GET", "admin/stats", 200)
        results.append(success)
        
        if success and stats_data:
            print(f"   📊 Stats retrieved successfully")
            required_fields = ['total_bookings', 'today_bookings', 'paid_bookings', 
                             'pending_bookings', 'total_revenue', 'bookings_by_game']
            missing_fields = [f for f in required_fields if f not in stats_data]
            if missing_fields:
                print(f"   ⚠️  Missing fields in stats: {missing_fields}")
            else:
                print(f"   ✅ Stats structure is correct")
                print(f"      - Total bookings: {stats_data.get('total_bookings', 0)}")
                print(f"      - Paid bookings: {stats_data.get('paid_bookings', 0)}")
                print(f"      - Total revenue: {stats_data.get('total_revenue', 0)} FCFA")
        
        # Test get admin bookings (all)
        success, bookings_data = self.run_test("Get Admin Bookings", "GET", "admin/bookings", 200)
        results.append(success)
        
        if success and bookings_data:
            bookings = bookings_data.get('bookings', [])
            print(f"   📋 Found {len(bookings)} bookings in admin view")
            print(f"   📊 Total count: {bookings_data.get('total', 0)}")
        
        # Test get admin bookings with filters
        success, filtered_data = self.run_test("Get Admin Bookings (Pending)", "GET", "admin/bookings?status=pending", 200)
        results.append(success)
        
        if success and filtered_data:
            pending_bookings = filtered_data.get('bookings', [])
            print(f"   ⏳ Found {len(pending_bookings)} pending bookings")
        
        # Test update booking status (if we have a booking)
        if self.booking_id:
            update_data = {"booking_status": "completed"}
            success, updated_booking = self.run_test("Update Booking Status", "PUT", f"admin/bookings/{self.booking_id}", 200, update_data)
            results.append(success)
            
            if success and updated_booking:
                new_status = updated_booking.get('booking_status')
                print(f"   ✅ Updated booking status to: {new_status}")
        
        # Test admin reseed menu endpoint
        success, reseed_response = self.run_test("Admin Reseed Menu", "POST", "admin/reseed-menu", 200)
        results.append(success)
        
        if success and reseed_response:
            items_count = reseed_response.get('items_count', 0)
            games_count = reseed_response.get('games_count', 0)
            print(f"   🔄 Reseeded {items_count} menu items and {games_count} games")
        
        return all(results)

    def test_whatsapp_links(self):
        """Test WhatsApp link generation with updated number"""
        if not self.booking_id:
            print("❌ Cannot test WhatsApp links - no booking ID available")
            return False
        
        success, whatsapp_data = self.run_test("Get WhatsApp Links", "GET", f"whatsapp/booking/{self.booking_id}", 200)
        
        if success and whatsapp_data:
            customer_link = whatsapp_data.get('customer_link')
            admin_link = whatsapp_data.get('admin_notification_link')
            whatsapp_number = whatsapp_data.get('whatsapp_number')
            
            print(f"   💬 Customer WhatsApp link: {'Generated' if customer_link else 'Missing'}")
            print(f"   📱 Admin notification link: {'Generated' if admin_link else 'Missing'}")
            print(f"   📞 WhatsApp number: {whatsapp_number}")
            
            # Validate WhatsApp number is updated to new number
            if whatsapp_number == "22901414700":
                print(f"   ✅ WhatsApp number updated correctly to: {whatsapp_number}")
            else:
                print(f"   ❌ WhatsApp number incorrect! Expected: 22901414700, Got: {whatsapp_number}")
            
            # Validate WhatsApp link format and contains correct number
            if customer_link and 'wa.me/22901414700' in customer_link:
                print(f"   ✅ Customer link format and number correct")
            else:
                print(f"   ⚠️  Customer link format or number may be incorrect")
                
            if admin_link and 'wa.me/22901414700' in admin_link:
                print(f"   ✅ Admin link format and number correct")
            else:
                print(f"   ⚠️  Admin link format or number may be incorrect")
        
        return success

    def test_menu_combos(self):
        """Test menu combos with specific pricing"""
        success, menu_data = self.run_test("Get Menu for Combo Validation", "GET", "menu", 200)
        
        if success and menu_data:
            combos = [item for item in menu_data if item.get('is_combo', False)]
            print(f"   🍽️  Found {len(combos)} combo items")
            
            # Expected combo prices
            expected_combos = {
                "combo-solo": 3500,
                "combo-2p-eco": 6000,
                "combo-2p-premium": 9000,
                "combo-4p": 16000
            }
            
            for combo in combos:
                combo_id = combo.get('id')
                price = combo.get('price')
                original_price = combo.get('original_price')
                persons = combo.get('persons')
                
                print(f"   🎯 {combo.get('name', 'Unknown')}: {price} FCFA")
                if combo_id in expected_combos:
                    if price == expected_combos[combo_id]:
                        print(f"      ✅ Price matches expected: {price} FCFA")
                    else:
                        print(f"      ❌ Price mismatch! Expected: {expected_combos[combo_id]}, Got: {price}")
                
                if original_price:
                    print(f"      💸 Original price (strikethrough): {original_price} FCFA")
                
                if persons:
                    print(f"      👥 Persons: {persons}")
        
        return success

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
    
    print("\n💳 Testing Kkiapay Payment Flow...")
    all_tests_passed &= tester.test_kkiapay_payment_flow()
    
    print("\n👨‍💼 Testing Admin Endpoints...")
    all_tests_passed &= tester.test_admin_endpoints()
    
    print("\n💬 Testing WhatsApp Links...")
    all_tests_passed &= tester.test_whatsapp_links()
    
    print("\n🍽️  Testing Menu Combos...")
    all_tests_passed &= tester.test_menu_combos()
    
    print("\n🚫 Testing Error Handling...")
    all_tests_passed &= tester.test_error_handling()
    
    # Print final summary
    success = tester.print_summary()
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())