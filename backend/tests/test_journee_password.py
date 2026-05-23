"""Tests pour le mot de passe Journée (journee_settings) +
intégration avec day_openings.open et day_closures.close."""
import os
import datetime as _dt

import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"


def _today():
    return _dt.datetime.utcnow().strftime("%Y-%m-%d")


def _force_open():
    requests.post(
        f"{API}/day-openings/{_today()}/open",
        json={"opened_by": "Pytest", "opened_by_role": "admin", "force": True},
    )


def _force_close():
    requests.post(
        f"{API}/day-closures/{_today()}/close",
        json={"closed_by": "Pytest", "closed_by_role": "admin", "force": True},
    )


def _force_reopen():
    requests.post(
        f"{API}/day-closures/{_today()}/reopen",
        json={"reopened_by": "Pytest", "reason": "cleanup"},
    )


class TestJourneePassword:

    PW = "secret-journee-2026"

    def setup_method(self):
        # Ensure pw is set with known value before each test
        requests.post(
            f"{API}/journee-settings/set-password",
            json={"new_password": self.PW, "actor_name": "Admin"},
        )

    def teardown_method(self):
        # Restore day open state
        _force_reopen()
        _force_open()

    def test_set_password_creates(self):
        # Delete first
        requests.delete(f"{API}/journee-settings/password")
        r0 = requests.get(f"{API}/journee-settings/password-status")
        assert r0.json()["is_set"] is False

        r = requests.post(
            f"{API}/journee-settings/set-password",
            json={"new_password": "abcd", "actor_name": "Admin"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["success"] is True
        assert body["created"] is True

        # Status
        s = requests.get(f"{API}/journee-settings/password-status").json()
        assert s["is_set"] is True
        assert s["set_by"] == "Admin"

    def test_set_password_too_short(self):
        r = requests.post(
            f"{API}/journee-settings/set-password",
            json={"new_password": "ab", "actor_name": "Admin"},
        )
        assert r.status_code == 400

    def test_verify_password_ok(self):
        r = requests.post(
            f"{API}/journee-settings/verify-password",
            json={"password": self.PW},
        )
        assert r.status_code == 200
        assert r.json()["valid"] is True

    def test_verify_password_wrong(self):
        r = requests.post(
            f"{API}/journee-settings/verify-password",
            json={"password": "WRONG"},
        )
        assert r.status_code == 200
        assert r.json()["valid"] is False

    # ------------------------------------------------------------------
    # day_openings.open enforcement
    # ------------------------------------------------------------------
    def test_open_day_as_manager_requires_password(self):
        # Reset day state (delete opening for today)
        requests.delete(f"{API}/day-openings/{_today()}")

        # Without password → 401
        r = requests.post(
            f"{API}/day-openings/{_today()}/open",
            json={"opened_by": "Gerante", "opened_by_role": "manager", "force": True},
        )
        assert r.status_code == 401, r.text
        assert "Mot de passe" in r.json()["detail"]

        # Wrong password → 401
        r2 = requests.post(
            f"{API}/day-openings/{_today()}/open",
            json={"opened_by": "Gerante", "opened_by_role": "manager", "password": "WRONG", "force": True},
        )
        assert r2.status_code == 401

        # Correct password → 200
        r3 = requests.post(
            f"{API}/day-openings/{_today()}/open",
            json={"opened_by": "Gerante", "opened_by_role": "manager", "password": self.PW, "force": True},
        )
        assert r3.status_code == 200, r3.text

    def test_open_day_as_admin_bypasses_password(self):
        # Reset
        requests.delete(f"{API}/day-openings/{_today()}")
        r = requests.post(
            f"{API}/day-openings/{_today()}/open",
            json={"opened_by": "Admin", "opened_by_role": "admin", "force": True},
        )
        assert r.status_code == 200, r.text

    def test_open_day_blocked_if_no_password_set(self):
        # Delete password
        requests.delete(f"{API}/journee-settings/password")
        requests.delete(f"{API}/day-openings/{_today()}")

        r = requests.post(
            f"{API}/day-openings/{_today()}/open",
            json={"opened_by": "Gerante", "opened_by_role": "manager", "force": True},
        )
        assert r.status_code == 403, r.text
        assert "Aucun mot de passe" in r.json()["detail"]

        # Restore for other tests
        requests.post(
            f"{API}/journee-settings/set-password",
            json={"new_password": self.PW, "actor_name": "Admin"},
        )

    # ------------------------------------------------------------------
    # day_closures.close enforcement
    # ------------------------------------------------------------------
    def test_close_day_as_manager_requires_password(self):
        # Ensure day open via admin
        _force_reopen()
        _force_open()

        # Without password → 401
        future = "2099-12-30"
        r = requests.post(
            f"{API}/day-closures/{future}/close",
            json={"closed_by": "Gerante", "closed_by_role": "manager"},
        )
        assert r.status_code == 401, r.text

        # Correct password → 200
        r2 = requests.post(
            f"{API}/day-closures/{future}/close",
            json={"closed_by": "Gerante", "closed_by_role": "manager", "password": self.PW},
        )
        assert r2.status_code == 200, r2.text

        # cleanup
        requests.post(
            f"{API}/day-closures/{future}/reopen",
            json={"reopened_by": "Pytest", "reason": "cleanup"},
        )
