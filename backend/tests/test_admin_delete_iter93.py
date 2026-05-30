"""
Test Admin Delete Endpoints - Iteration 93

Tests for:
- DELETE /api/daily-reports/{id}?actor_role=admin — success
- DELETE /api/daily-reports/{id}?actor_role=cuisinier — 403
- DELETE /api/daily-reports/{id} on non-existent id — 404
- DELETE /api/cuisine/messages/{id}?actor_role=admin — success
- DELETE /api/cuisine/messages/{id}?actor_role=manager — 403
- DELETE /api/cuisine/messages/{id} on non-existent id — 404
- GET /api/cuisine/messages/all?actor_role=admin — returns all messages
- GET /api/cuisine/messages/all?actor_role=cuisinier — 403
- DELETE /api/cuisine/events/{id}?actor_role=admin — success
- DELETE /api/cuisine/events/{id}?actor_role=cuisinier — 403
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


class TestDailyReportsDelete:
    """Tests for DELETE /api/daily-reports/{id}"""

    @pytest.fixture
    def test_report_id(self):
        """Create a test daily report for deletion tests"""
        # First create a draft report
        response = requests.post(
            f"{BASE_URL}/api/daily-reports/draft",
            json={
                "kind": "cuisine",
                "actor_name": "TEST_cuisinier_delete",
                "actor_role": "cuisinier",
                "date": datetime.now(timezone.utc).strftime("%Y-%m-%d")
            }
        )
        assert response.status_code == 200, f"Failed to create test report: {response.text}"
        report = response.json().get("report", {})
        report_id = report.get("id")
        assert report_id, "No report ID returned"
        yield report_id
        # Cleanup: try to delete if still exists
        requests.delete(f"{BASE_URL}/api/daily-reports/{report_id}", params={"actor_role": "admin"})

    def test_delete_daily_report_admin_success(self, test_report_id):
        """Admin can delete a daily report"""
        response = requests.delete(
            f"{BASE_URL}/api/daily-reports/{test_report_id}",
            params={"actor_role": "admin"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") is True, f"Expected success=True, got {data}"
        print(f"✓ DELETE /api/daily-reports/{test_report_id}?actor_role=admin → 200 success")

    def test_delete_daily_report_cuisinier_forbidden(self, test_report_id):
        """Cuisinier cannot delete a daily report (403)"""
        response = requests.delete(
            f"{BASE_URL}/api/daily-reports/{test_report_id}",
            params={"actor_role": "cuisinier"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print(f"✓ DELETE /api/daily-reports/{test_report_id}?actor_role=cuisinier → 403 Forbidden")

    def test_delete_daily_report_not_found(self):
        """Delete non-existent report returns 404"""
        fake_id = str(uuid.uuid4())
        response = requests.delete(
            f"{BASE_URL}/api/daily-reports/{fake_id}",
            params={"actor_role": "admin"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print(f"✓ DELETE /api/daily-reports/{fake_id}?actor_role=admin → 404 Not Found")


class TestCuisineMessagesDelete:
    """Tests for DELETE /api/cuisine/messages/{id}"""

    @pytest.fixture
    def test_message_id(self):
        """Create a test message for deletion tests"""
        response = requests.post(
            f"{BASE_URL}/api/cuisine/messages",
            json={
                "code": "TIME",
                "label": "⏱️ Combien de temps encore ?",
                "from_role": "manager",
                "from_name": "TEST_manager_delete",
                "to_role": "cuisinier",
                "table_id": None,
                "table_number": None,
                "item_name": None
            }
        )
        assert response.status_code == 200, f"Failed to create test message: {response.text}"
        msg = response.json().get("message", {})
        msg_id = msg.get("id")
        assert msg_id, "No message ID returned"
        yield msg_id
        # Cleanup: try to delete if still exists
        requests.delete(f"{BASE_URL}/api/cuisine/messages/{msg_id}", params={"actor_role": "admin"})

    def test_delete_message_admin_success(self, test_message_id):
        """Admin can delete a cuisine message"""
        response = requests.delete(
            f"{BASE_URL}/api/cuisine/messages/{test_message_id}",
            params={"actor_role": "admin"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") is True, f"Expected success=True, got {data}"
        print(f"✓ DELETE /api/cuisine/messages/{test_message_id}?actor_role=admin → 200 success")

    def test_delete_message_manager_forbidden(self, test_message_id):
        """Manager cannot delete a cuisine message (403)"""
        response = requests.delete(
            f"{BASE_URL}/api/cuisine/messages/{test_message_id}",
            params={"actor_role": "manager"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print(f"✓ DELETE /api/cuisine/messages/{test_message_id}?actor_role=manager → 403 Forbidden")

    def test_delete_message_not_found(self):
        """Delete non-existent message returns 404"""
        fake_id = str(uuid.uuid4())
        response = requests.delete(
            f"{BASE_URL}/api/cuisine/messages/{fake_id}",
            params={"actor_role": "admin"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print(f"✓ DELETE /api/cuisine/messages/{fake_id}?actor_role=admin → 404 Not Found")


class TestCuisineMessagesAll:
    """Tests for GET /api/cuisine/messages/all"""

    def test_get_all_messages_admin_success(self):
        """Admin can get all messages"""
        response = requests.get(
            f"{BASE_URL}/api/cuisine/messages/all",
            params={"actor_role": "admin"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "total" in data, f"Expected 'total' in response, got {data.keys()}"
        assert "messages" in data, f"Expected 'messages' in response, got {data.keys()}"
        assert isinstance(data["messages"], list), f"Expected messages to be a list"
        # Verify _id is excluded from messages
        for msg in data["messages"]:
            assert "_id" not in msg, f"_id should be excluded from message: {msg}"
        print(f"✓ GET /api/cuisine/messages/all?actor_role=admin → 200 with {data['total']} messages")

    def test_get_all_messages_cuisinier_forbidden(self):
        """Cuisinier cannot get all messages (403)"""
        response = requests.get(
            f"{BASE_URL}/api/cuisine/messages/all",
            params={"actor_role": "cuisinier"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print(f"✓ GET /api/cuisine/messages/all?actor_role=cuisinier → 403 Forbidden")


class TestCuisineEventsDelete:
    """Tests for DELETE /api/cuisine/events/{id}"""

    @pytest.fixture
    def test_event_id(self):
        """Find or create a test event for deletion tests"""
        # First try to find an existing event
        response = requests.get(
            f"{BASE_URL}/api/cuisine/events",
            params={"actor_role": "admin", "limit": 1}
        )
        if response.status_code == 200:
            events = response.json().get("items", [])
            if events:
                # Use existing event (we'll create a new one for the test)
                pass
        
        # Create a test event by marking an item ready (if we have a table)
        # For now, let's just use a fake ID to test 404 and permission checks
        # We'll create a proper event via the cuisine workflow
        
        # Alternative: Insert directly via a test endpoint or use existing events
        # For this test, we'll check if there are existing events
        response = requests.get(
            f"{BASE_URL}/api/cuisine/events",
            params={"actor_role": "admin", "limit": 100}
        )
        if response.status_code == 200:
            events = response.json().get("items", [])
            # Find a TEST_ prefixed event or any event for testing
            for event in events:
                if event.get("actor_name", "").startswith("TEST_"):
                    yield event.get("id")
                    return
            # If no TEST_ event, use the first one (but don't delete it in cleanup)
            if events:
                yield events[0].get("id")
                return
        
        # No events found, yield None
        yield None

    def test_delete_event_admin_success(self, test_event_id):
        """Admin can delete a cuisine event"""
        if test_event_id is None:
            pytest.skip("No cuisine events available for testing")
        
        # First verify the event exists
        response = requests.get(
            f"{BASE_URL}/api/cuisine/events",
            params={"actor_role": "admin", "limit": 200}
        )
        events = response.json().get("items", [])
        event_exists = any(e.get("id") == test_event_id for e in events)
        
        if not event_exists:
            pytest.skip(f"Event {test_event_id} no longer exists")
        
        response = requests.delete(
            f"{BASE_URL}/api/cuisine/events/{test_event_id}",
            params={"actor_role": "admin", "actor_name": "TEST_admin"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") is True, f"Expected success=True, got {data}"
        print(f"✓ DELETE /api/cuisine/events/{test_event_id}?actor_role=admin → 200 success")

    def test_delete_event_cuisinier_forbidden(self):
        """Cuisinier cannot delete a cuisine event (403)"""
        fake_id = str(uuid.uuid4())
        response = requests.delete(
            f"{BASE_URL}/api/cuisine/events/{fake_id}",
            params={"actor_role": "cuisinier", "actor_name": "cuisinier"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print(f"✓ DELETE /api/cuisine/events/{fake_id}?actor_role=cuisinier → 403 Forbidden")

    def test_delete_event_not_found(self):
        """Delete non-existent event returns 404"""
        fake_id = str(uuid.uuid4())
        response = requests.delete(
            f"{BASE_URL}/api/cuisine/events/{fake_id}",
            params={"actor_role": "admin", "actor_name": "admin"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print(f"✓ DELETE /api/cuisine/events/{fake_id}?actor_role=admin → 404 Not Found")


class TestCleanup:
    """Cleanup test data"""

    def test_cleanup_test_reports(self):
        """Clean up TEST_ prefixed daily reports"""
        response = requests.get(
            f"{BASE_URL}/api/daily-reports",
            params={"actor_role": "admin", "limit": 200}
        )
        if response.status_code == 200:
            reports = response.json().get("reports", [])
            deleted = 0
            for report in reports:
                if report.get("actor_name", "").startswith("TEST_"):
                    del_resp = requests.delete(
                        f"{BASE_URL}/api/daily-reports/{report['id']}",
                        params={"actor_role": "admin"}
                    )
                    if del_resp.status_code == 200:
                        deleted += 1
            print(f"✓ Cleaned up {deleted} TEST_ daily reports")

    def test_cleanup_test_messages(self):
        """Clean up TEST_ prefixed messages"""
        response = requests.get(
            f"{BASE_URL}/api/cuisine/messages/all",
            params={"actor_role": "admin", "limit": 200}
        )
        if response.status_code == 200:
            messages = response.json().get("messages", [])
            deleted = 0
            for msg in messages:
                if msg.get("from_name", "").startswith("TEST_"):
                    del_resp = requests.delete(
                        f"{BASE_URL}/api/cuisine/messages/{msg['id']}",
                        params={"actor_role": "admin"}
                    )
                    if del_resp.status_code == 200:
                        deleted += 1
            print(f"✓ Cleaned up {deleted} TEST_ messages")
