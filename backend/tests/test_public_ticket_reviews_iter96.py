"""
Test Public Ticket & Customer Reviews - Iteration 96

Tests for QR code ticket public access and customer review system:
- GET /api/public/ticket/{id} - Public ticket viewing (validated only)
- POST /api/public/ticket/{id}/review - Submit customer review (1 per ticket)
- GET /api/public/reviews - Admin list reviews with filters
- POST /api/public/reviews/{id}/read - Mark review as read

Non-regression tests:
- POST /api/invoices with table_number generates bon_number (Lot 1)
- GET /api/invoices?validated_only=true filters correctly
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data prefix for cleanup
TEST_PREFIX = "TEST_ITER96_"


class TestPublicTicketEndpoints:
    """Tests for GET /api/public/ticket/{id}"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data - create a validated invoice for testing"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Create a validated invoice for testing
        self.test_invoice_id = str(uuid.uuid4())
        invoice_data = {
            "id": self.test_invoice_id,
            "invoice_number": f"{TEST_PREFIX}INV-001",
            "customer_name": f"{TEST_PREFIX}Client Test",
            "table_number": 999,
            "items": [
                {"name": "Burger Test", "quantity": 2, "price": 2500, "department": "bar"},
                {"name": "Soda Test", "quantity": 2, "price": 1000, "department": "bar"}
            ],
            "subtotal": 7000,
            "discount": 0,
            "discount_amount": 0,
            "total": 7000,
            "payment_method": "cash",
            "validation_status": "validated"
        }
        
        # Create invoice via API
        response = self.session.post(f"{BASE_URL}/api/invoices", json=invoice_data)
        if response.status_code in [200, 201]:
            resp_data = response.json()
            # Handle wrapped response format: {"success": true, "invoice": {...}}
            created = resp_data.get("invoice", resp_data)
            self.test_invoice_id = created.get("id", self.test_invoice_id)
            print(f"Created validated invoice: {self.test_invoice_id}")
        else:
            print(f"Warning: Could not create test invoice: {response.status_code} - {response.text}")
        
        yield
        
        # Cleanup - delete test invoice and reviews
        try:
            self.session.delete(f"{BASE_URL}/api/invoices/{self.test_invoice_id}")
            # Clean up any reviews created
            reviews_resp = self.session.get(f"{BASE_URL}/api/public/reviews?limit=100")
            if reviews_resp.status_code == 200:
                reviews = reviews_resp.json().get("items", [])
                for review in reviews:
                    if TEST_PREFIX in review.get("customer_name", ""):
                        # No delete endpoint for reviews, but they'll be orphaned
                        pass
        except Exception as e:
            print(f"Cleanup warning: {e}")
    
    def test_get_validated_ticket_success(self):
        """GET /api/public/ticket/{id} - Validated ticket returns ticket with items, total, bon_number"""
        response = self.session.get(f"{BASE_URL}/api/public/ticket/{self.test_invoice_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "ticket" in data, "Response should contain 'ticket'"
        assert "review_submitted" in data, "Response should contain 'review_submitted'"
        
        ticket = data["ticket"]
        assert ticket.get("id") == self.test_invoice_id
        assert "items" in ticket, "Ticket should have items"
        assert "total" in ticket, "Ticket should have total"
        assert ticket.get("total") == 7000
        
        # review_submitted should be false initially
        assert data["review_submitted"] == False, "review_submitted should be False initially"
        
        print(f"PASSED: GET validated ticket returns correct data")
    
    def test_get_nonexistent_ticket_404(self):
        """GET /api/public/ticket/{id} - Non-existent invoice returns 404"""
        fake_id = str(uuid.uuid4())
        response = self.session.get(f"{BASE_URL}/api/public/ticket/{fake_id}")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"PASSED: Non-existent ticket returns 404")


class TestPublicTicketPendingAccess:
    """Tests for pending invoice access denial"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - create a pending invoice"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Create a pending invoice
        self.pending_invoice_id = str(uuid.uuid4())
        invoice_data = {
            "id": self.pending_invoice_id,
            "invoice_number": f"{TEST_PREFIX}PENDING-001",
            "customer_name": f"{TEST_PREFIX}Client Pending",
            "table_number": 998,
            "items": [{"name": "Item Test", "quantity": 1, "price": 1000, "department": "bar"}],
            "subtotal": 1000,
            "total": 1000,
            "payment_method": "cash",
            "validation_status": "pending"
        }
        
        response = self.session.post(f"{BASE_URL}/api/invoices", json=invoice_data)
        if response.status_code in [200, 201]:
            resp_data = response.json()
            created = resp_data.get("invoice", resp_data)
            self.pending_invoice_id = created.get("id", self.pending_invoice_id)
            print(f"Created pending invoice: {self.pending_invoice_id}")
        
        yield
        
        # Cleanup
        try:
            self.session.delete(f"{BASE_URL}/api/invoices/{self.pending_invoice_id}")
        except:
            pass
    
    def test_get_pending_ticket_returns_404(self):
        """GET /api/public/ticket/{id} - Pending invoice returns 404 (access denied)"""
        response = self.session.get(f"{BASE_URL}/api/public/ticket/{self.pending_invoice_id}")
        
        assert response.status_code == 404, f"Expected 404 for pending invoice, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data
        # Should indicate ticket not available yet
        print(f"PASSED: Pending ticket returns 404 with message: {data.get('detail')}")


class TestReviewSubmission:
    """Tests for POST /api/public/ticket/{id}/review"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - create validated invoice for review testing"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Create a fresh validated invoice for review testing
        self.review_invoice_id = str(uuid.uuid4())
        invoice_data = {
            "id": self.review_invoice_id,
            "invoice_number": f"{TEST_PREFIX}REVIEW-{uuid.uuid4().hex[:6]}",
            "customer_name": f"{TEST_PREFIX}Client Review",
            "table_number": 997,
            "items": [{"name": "Plat Test", "quantity": 1, "price": 3500, "department": "bar"}],
            "subtotal": 3500,
            "total": 3500,
            "payment_method": "cash",
            "validation_status": "validated"
        }
        
        response = self.session.post(f"{BASE_URL}/api/invoices", json=invoice_data)
        if response.status_code in [200, 201]:
            resp_data = response.json()
            created = resp_data.get("invoice", resp_data)
            self.review_invoice_id = created.get("id", self.review_invoice_id)
            print(f"Created invoice for review: {self.review_invoice_id}")
        
        self.created_review_id = None
        
        yield
        
        # Cleanup
        try:
            self.session.delete(f"{BASE_URL}/api/invoices/{self.review_invoice_id}")
        except:
            pass
    
    def test_submit_review_success(self):
        """POST /api/public/ticket/{id}/review - Submit review with rating=5, comment, name, phone"""
        review_data = {
            "rating": 5,
            "comment": "Excellent service ! Très satisfait.",
            "customer_name": f"{TEST_PREFIX}Jean Dupont",
            "customer_phone": "22990123456"
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/public/ticket/{self.review_invoice_id}/review",
            json=review_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Response should have success=true"
        assert "review" in data, "Response should contain review object"
        assert "message" in data, "Response should contain message"
        
        review = data["review"]
        assert review.get("rating") == 5
        assert review.get("comment") == "Excellent service ! Très satisfait."
        assert review.get("invoice_id") == self.review_invoice_id
        assert review.get("is_read") == False
        
        self.created_review_id = review.get("id")
        print(f"PASSED: Review submitted successfully with id: {self.created_review_id}")
    
    def test_submit_duplicate_review_409(self):
        """POST /api/public/ticket/{id}/review - Second submission returns 409"""
        # First submission
        review_data = {
            "rating": 4,
            "comment": "Bon service",
            "customer_name": f"{TEST_PREFIX}Marie Test",
            "customer_phone": "22990111222"
        }
        
        first_response = self.session.post(
            f"{BASE_URL}/api/public/ticket/{self.review_invoice_id}/review",
            json=review_data
        )
        assert first_response.status_code == 200, f"First review should succeed: {first_response.text}"
        
        # Second submission - should fail with 409
        second_response = self.session.post(
            f"{BASE_URL}/api/public/ticket/{self.review_invoice_id}/review",
            json=review_data
        )
        
        assert second_response.status_code == 409, f"Expected 409 for duplicate, got {second_response.status_code}"
        
        data = second_response.json()
        assert "déjà" in data.get("detail", "").lower() or "already" in data.get("detail", "").lower(), \
            f"Error message should indicate review already exists: {data}"
        
        print(f"PASSED: Duplicate review returns 409 with message: {data.get('detail')}")
    
    def test_submit_review_invalid_rating_0(self):
        """POST /api/public/ticket/{id}/review - Rating 0 returns 422 validation error"""
        review_data = {
            "rating": 0,
            "comment": "Test",
            "customer_name": f"{TEST_PREFIX}Invalid Rating",
            "customer_phone": ""
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/public/ticket/{self.review_invoice_id}/review",
            json=review_data
        )
        
        assert response.status_code == 422, f"Expected 422 for rating=0, got {response.status_code}"
        print(f"PASSED: Rating 0 returns 422 validation error")
    
    def test_submit_review_invalid_rating_6(self):
        """POST /api/public/ticket/{id}/review - Rating 6 returns 422 validation error"""
        review_data = {
            "rating": 6,
            "comment": "Test",
            "customer_name": f"{TEST_PREFIX}Invalid Rating 6",
            "customer_phone": ""
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/public/ticket/{self.review_invoice_id}/review",
            json=review_data
        )
        
        assert response.status_code == 422, f"Expected 422 for rating=6, got {response.status_code}"
        print(f"PASSED: Rating 6 returns 422 validation error")
    
    def test_submit_review_nonexistent_ticket_404(self):
        """POST /api/public/ticket/{id}/review - Non-existent ticket returns 404"""
        fake_id = str(uuid.uuid4())
        review_data = {
            "rating": 5,
            "comment": "Test",
            "customer_name": f"{TEST_PREFIX}Fake Ticket",
            "customer_phone": ""
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/public/ticket/{fake_id}/review",
            json=review_data
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"PASSED: Review on non-existent ticket returns 404")


class TestReviewOnPendingTicket:
    """Test review submission on pending (non-validated) ticket"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Create pending invoice
        self.pending_id = str(uuid.uuid4())
        invoice_data = {
            "id": self.pending_id,
            "invoice_number": f"{TEST_PREFIX}PENDING-REVIEW",
            "customer_name": f"{TEST_PREFIX}Pending Review Test",
            "table_number": 996,
            "items": [{"name": "Item", "quantity": 1, "price": 1000, "department": "bar"}],
            "subtotal": 1000,
            "total": 1000,
            "payment_method": "cash",
            "validation_status": "pending"
        }
        
        response = self.session.post(f"{BASE_URL}/api/invoices", json=invoice_data)
        if response.status_code in [200, 201]:
            resp_data = response.json()
            created = resp_data.get("invoice", resp_data)
            self.pending_id = created.get("id", self.pending_id)
        
        yield
        
        try:
            self.session.delete(f"{BASE_URL}/api/invoices/{self.pending_id}")
        except:
            pass
    
    def test_submit_review_on_pending_ticket_400(self):
        """POST /api/public/ticket/{id}/review - Review on pending ticket returns 400"""
        review_data = {
            "rating": 5,
            "comment": "Should fail",
            "customer_name": f"{TEST_PREFIX}Pending Test",
            "customer_phone": ""
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/public/ticket/{self.pending_id}/review",
            json=review_data
        )
        
        assert response.status_code == 400, f"Expected 400 for pending ticket, got {response.status_code}"
        print(f"PASSED: Review on pending ticket returns 400")


class TestReviewsListEndpoint:
    """Tests for GET /api/public/reviews"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Create multiple validated invoices and reviews for testing filters
        self.test_invoices = []
        self.test_reviews = []
        
        for i, rating in enumerate([5, 4, 3, 2, 1]):
            invoice_id = str(uuid.uuid4())
            invoice_data = {
                "id": invoice_id,
                "invoice_number": f"{TEST_PREFIX}FILTER-{i}",
                "customer_name": f"{TEST_PREFIX}Filter Client {i}",
                "table_number": 990 + i,
                "items": [{"name": "Item", "quantity": 1, "price": 1000, "department": "bar"}],
                "subtotal": 1000,
                "total": 1000,
                "payment_method": "cash",
                "validation_status": "validated"
            }
            
            resp = self.session.post(f"{BASE_URL}/api/invoices", json=invoice_data)
            if resp.status_code in [200, 201]:
                resp_data = resp.json()
                created = resp_data.get("invoice", resp_data)
                created_id = created.get("id", invoice_id)
                self.test_invoices.append(created_id)
                
                # Submit review
                review_data = {
                    "rating": rating,
                    "comment": f"Test review rating {rating}",
                    "customer_name": f"{TEST_PREFIX}Reviewer {i}",
                    "customer_phone": f"2299000{i}000"
                }
                review_resp = self.session.post(
                    f"{BASE_URL}/api/public/ticket/{created_id}/review",
                    json=review_data
                )
                if review_resp.status_code == 200:
                    review_id = review_resp.json().get("review", {}).get("id")
                    self.test_reviews.append(review_id)
        
        yield
        
        # Cleanup
        for inv_id in self.test_invoices:
            try:
                self.session.delete(f"{BASE_URL}/api/invoices/{inv_id}")
            except:
                pass
    
    def test_get_reviews_list(self):
        """GET /api/public/reviews - Returns list with total, unread, average_rating"""
        response = self.session.get(f"{BASE_URL}/api/public/reviews")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "items" in data, "Response should have 'items'"
        assert "total" in data, "Response should have 'total'"
        assert "unread" in data, "Response should have 'unread'"
        assert "average_rating" in data, "Response should have 'average_rating'"
        
        assert isinstance(data["items"], list)
        assert isinstance(data["total"], int)
        assert isinstance(data["unread"], int)
        
        print(f"PASSED: GET /api/public/reviews returns total={data['total']}, unread={data['unread']}, avg={data['average_rating']}")
    
    def test_get_reviews_only_unread_filter(self):
        """GET /api/public/reviews?only_unread=true - Filters unread reviews"""
        response = self.session.get(f"{BASE_URL}/api/public/reviews?only_unread=true")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        items = data.get("items", [])
        
        # All returned items should have is_read=False
        for item in items:
            assert item.get("is_read") == False, f"Unread filter should only return is_read=False items"
        
        print(f"PASSED: only_unread=true filter works, returned {len(items)} unread reviews")
    
    def test_get_reviews_min_rating_filter(self):
        """GET /api/public/reviews?min_rating=4 - Filters by minimum rating"""
        response = self.session.get(f"{BASE_URL}/api/public/reviews?min_rating=4")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        items = data.get("items", [])
        
        # All returned items should have rating >= 4
        for item in items:
            assert item.get("rating", 0) >= 4, f"min_rating=4 filter should only return rating >= 4"
        
        print(f"PASSED: min_rating=4 filter works, returned {len(items)} reviews with rating >= 4")


class TestMarkReviewRead:
    """Tests for POST /api/public/reviews/{id}/read"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Create invoice and review
        self.invoice_id = str(uuid.uuid4())
        invoice_data = {
            "id": self.invoice_id,
            "invoice_number": f"{TEST_PREFIX}MARKREAD",
            "customer_name": f"{TEST_PREFIX}Mark Read Test",
            "table_number": 985,
            "items": [{"name": "Item", "quantity": 1, "price": 1000, "department": "bar"}],
            "subtotal": 1000,
            "total": 1000,
            "payment_method": "cash",
            "validation_status": "validated"
        }
        
        resp = self.session.post(f"{BASE_URL}/api/invoices", json=invoice_data)
        if resp.status_code in [200, 201]:
            resp_data = resp.json()
            created = resp_data.get("invoice", resp_data)
            self.invoice_id = created.get("id", self.invoice_id)
        
        # Submit review
        review_data = {
            "rating": 5,
            "comment": "Test for mark read",
            "customer_name": f"{TEST_PREFIX}Mark Read Reviewer",
            "customer_phone": ""
        }
        review_resp = self.session.post(
            f"{BASE_URL}/api/public/ticket/{self.invoice_id}/review",
            json=review_data
        )
        
        self.review_id = None
        if review_resp.status_code == 200:
            self.review_id = review_resp.json().get("review", {}).get("id")
        
        yield
        
        try:
            self.session.delete(f"{BASE_URL}/api/invoices/{self.invoice_id}")
        except:
            pass
    
    def test_mark_review_as_read(self):
        """POST /api/public/reviews/{id}/read - Marks review as read (is_read=true)"""
        if not self.review_id:
            pytest.skip("Review not created")
        
        response = self.session.post(f"{BASE_URL}/api/public/reviews/{self.review_id}/read")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get("success") == True
        
        # Verify by fetching reviews
        reviews_resp = self.session.get(f"{BASE_URL}/api/public/reviews")
        if reviews_resp.status_code == 200:
            items = reviews_resp.json().get("items", [])
            for item in items:
                if item.get("id") == self.review_id:
                    assert item.get("is_read") == True, "Review should be marked as read"
                    break
        
        print(f"PASSED: Review {self.review_id} marked as read")
    
    def test_mark_nonexistent_review_404(self):
        """POST /api/public/reviews/{id}/read - Non-existent review returns 404"""
        fake_id = str(uuid.uuid4())
        response = self.session.post(f"{BASE_URL}/api/public/reviews/{fake_id}/read")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"PASSED: Mark non-existent review returns 404")


class TestNonRegressionLot1:
    """Non-regression tests for Lot 1 (Tables → Bons → Factures)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.created_invoice_id = None
        
        yield
        
        if self.created_invoice_id:
            try:
                self.session.delete(f"{BASE_URL}/api/invoices/{self.created_invoice_id}")
            except:
                pass
    
    def test_invoice_with_table_number_generates_bon_number(self):
        """POST /api/invoices with table_number generates bon_number (BON-YYYYMMDD-NNNN)"""
        invoice_data = {
            "invoice_number": f"{TEST_PREFIX}BON-GEN-TEST",
            "customer_name": f"{TEST_PREFIX}Bon Generation",
            "table_number": 950,
            "items": [{"name": "Test Item", "quantity": 1, "price": 2000, "department": "bar"}],
            "subtotal": 2000,
            "total": 2000,
            "payment_method": "cash",
            "validation_status": "validated"
        }
        
        response = self.session.post(f"{BASE_URL}/api/invoices", json=invoice_data)
        
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        resp_data = response.json()
        data = resp_data.get("invoice", resp_data)
        self.created_invoice_id = data.get("id")
        
        # Check bon_number is generated
        bon_number = data.get("bon_number")
        assert bon_number is not None, "Invoice with table_number should have bon_number"
        assert bon_number.startswith("BON-"), f"bon_number should start with 'BON-', got: {bon_number}"
        
        # Verify format BON-YYYYMMDD-NNNN
        parts = bon_number.split("-")
        assert len(parts) == 3, f"bon_number format should be BON-YYYYMMDD-NNNN, got: {bon_number}"
        assert parts[0] == "BON"
        assert len(parts[1]) == 8, f"Date part should be 8 digits (YYYYMMDD), got: {parts[1]}"
        
        print(f"PASSED: Invoice with table_number generates bon_number: {bon_number}")
    
    def test_validated_only_filter(self):
        """GET /api/invoices?validated_only=true filters correctly"""
        # Create one pending and one validated invoice
        pending_id = str(uuid.uuid4())
        validated_id = str(uuid.uuid4())
        
        # Create pending
        pending_data = {
            "id": pending_id,
            "invoice_number": f"{TEST_PREFIX}FILTER-PENDING",
            "customer_name": f"{TEST_PREFIX}Filter Pending",
            "table_number": 940,
            "items": [{"name": "Item", "quantity": 1, "price": 1000, "department": "bar"}],
            "subtotal": 1000,
            "total": 1000,
            "payment_method": "cash",
            "validation_status": "pending"
        }
        self.session.post(f"{BASE_URL}/api/invoices", json=pending_data)
        
        # Create validated
        validated_data = {
            "id": validated_id,
            "invoice_number": f"{TEST_PREFIX}FILTER-VALIDATED",
            "customer_name": f"{TEST_PREFIX}Filter Validated",
            "table_number": 941,
            "items": [{"name": "Item", "quantity": 1, "price": 1000, "department": "bar"}],
            "subtotal": 1000,
            "total": 1000,
            "payment_method": "cash",
            "validation_status": "validated"
        }
        self.session.post(f"{BASE_URL}/api/invoices", json=validated_data)
        
        # Test validated_only=true
        response = self.session.get(f"{BASE_URL}/api/invoices?validated_only=true")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        invoices = data if isinstance(data, list) else data.get("invoices", data.get("items", []))
        
        # Check that all returned invoices are validated
        pending_found = False
        for inv in invoices:
            if inv.get("validation_status") == "pending":
                pending_found = True
                break
        
        # Cleanup
        try:
            self.session.delete(f"{BASE_URL}/api/invoices/{pending_id}")
            self.session.delete(f"{BASE_URL}/api/invoices/{validated_id}")
        except:
            pass
        
        if pending_found:
            print(f"WARNING: validated_only=true filter NOT working - pending invoices returned")
            # This was a known issue from iteration 95, check if fixed
            pytest.fail("validated_only=true filter not working - returns pending invoices")
        else:
            print(f"PASSED: validated_only=true filter works correctly")


class TestReviewSubmittedFlag:
    """Test that review_submitted flag updates after review submission"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        self.invoice_id = str(uuid.uuid4())
        invoice_data = {
            "id": self.invoice_id,
            "invoice_number": f"{TEST_PREFIX}REVIEW-FLAG",
            "customer_name": f"{TEST_PREFIX}Review Flag Test",
            "table_number": 930,
            "items": [{"name": "Item", "quantity": 1, "price": 1000, "department": "bar"}],
            "subtotal": 1000,
            "total": 1000,
            "payment_method": "cash",
            "validation_status": "validated"
        }
        
        resp = self.session.post(f"{BASE_URL}/api/invoices", json=invoice_data)
        if resp.status_code in [200, 201]:
            resp_data = resp.json()
            created = resp_data.get("invoice", resp_data)
            self.invoice_id = created.get("id", self.invoice_id)
        
        yield
        
        try:
            self.session.delete(f"{BASE_URL}/api/invoices/{self.invoice_id}")
        except:
            pass
    
    def test_review_submitted_flag_updates(self):
        """After review submission, GET ticket shows review_submitted=true"""
        # Check initial state
        initial_resp = self.session.get(f"{BASE_URL}/api/public/ticket/{self.invoice_id}")
        assert initial_resp.status_code == 200
        assert initial_resp.json().get("review_submitted") == False
        
        # Submit review
        review_data = {
            "rating": 5,
            "comment": "Great!",
            "customer_name": f"{TEST_PREFIX}Flag Tester",
            "customer_phone": ""
        }
        submit_resp = self.session.post(
            f"{BASE_URL}/api/public/ticket/{self.invoice_id}/review",
            json=review_data
        )
        assert submit_resp.status_code == 200
        
        # Check updated state
        updated_resp = self.session.get(f"{BASE_URL}/api/public/ticket/{self.invoice_id}")
        assert updated_resp.status_code == 200
        
        data = updated_resp.json()
        assert data.get("review_submitted") == True, "review_submitted should be True after submission"
        assert data.get("review") is not None, "review object should be present"
        
        print(f"PASSED: review_submitted flag updates correctly after submission")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
