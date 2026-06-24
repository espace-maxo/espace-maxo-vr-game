"""
Tests for /api/caisse/login PIN fix (iteration 105).
- PIN 2468 (Mères AHOUANDJINOU / manager) login
- Strip whitespace robustness
- Admin tab fallback: PIN typed into 'password' field
- Master admin password still works
- Bad PIN -> 401
- Empty body -> 401
- Regression: cuisinier (1357) & coach (9876)
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
LOGIN_URL = f"{BASE_URL}/api/caisse/login"


def _post(payload):
    return requests.post(LOGIN_URL, json=payload, timeout=15)


# ============ Manager PIN 2468 ============
class TestManagerPin2468:
    def test_pin_2468_login_success(self):
        r = _post({"pin": "2468"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("success") is True
        u = data["user"]
        assert u["full_name"] == "Mères AHOUANDJINOU"
        assert u["role"] == "manager"
        assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 0

    def test_pin_with_surrounding_spaces(self):
        r = _post({"pin": " 2468 "})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        assert data["user"]["full_name"] == "Mères AHOUANDJINOU"

    def test_pin_in_password_field_fallback(self):
        """User typed PIN in the Admin (password) field by mistake."""
        r = _post({"password": "2468"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        assert data["user"]["full_name"] == "Mères AHOUANDJINOU"
        assert data["user"]["role"] == "manager"


# ============ Admin master password ============
class TestAdminMaster:
    def test_admin_master_password(self):
        r = _post({"password": "Nikeland2026"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        assert data["user"]["role"] == "admin"
        assert data["user"]["full_name"] == "Administrateur"


# ============ Failure cases ============
class TestLoginFailures:
    def test_bad_pin_returns_401(self):
        r = _post({"pin": "9999"})
        assert r.status_code == 401
        body = r.json()
        assert body.get("detail") == "PIN ou mot de passe incorrect"

    def test_empty_body_returns_401(self):
        r = _post({})
        assert r.status_code == 401


# ============ Regression: cuisinier / coach ============
class TestRegressionPins:
    def test_cuisinier_1357(self):
        r = _post({"pin": "1357"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        assert data["user"]["role"] in ("server", "cuisinier", "kitchen")
        # the username/full_name should reference cuisinier
        u = data["user"]
        assert ("cuisinier" in (u.get("username", "") + u.get("full_name", "")).lower())

    def test_coach_9876(self):
        r = _post({"pin": "9876"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        u = data["user"]
        assert ("coach" in (u.get("username", "") + u.get("full_name", "")).lower())
