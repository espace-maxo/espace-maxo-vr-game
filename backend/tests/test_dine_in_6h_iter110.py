"""
Tests iteration 110: Validation de la règle des 6h pour dine_in (consommation sur place)
et pour les bookings, dans le fuseau du Bénin (UTC+1).
"""
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://caisse-mon-point.preview.emergentagent.com").rstrip("/")
BENIN_TZ = timezone(timedelta(hours=1))


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _benin_now():
    return datetime.now(timezone.utc).astimezone(BENIN_TZ)


def _iso_local_benin(offset_hours: float) -> str:
    """Return naive ISO datetime in local Benin time, offset_hours from now."""
    dt = _benin_now() + timedelta(hours=offset_hours)
    return dt.replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%S")


# ---------------- DELIVERY ORDERS / dine_in ----------------

def _base_order(mode: str, scheduled_at=None, extra=None):
    payload = {
        "customer_name": "TEST_DineIn",
        "customer_phone": "+22990000001",
        "delivery_address": "" if mode != "delivery" else "TEST adresse Cotonou",
        "items": [{"name": "Salade", "quantity": 1, "price": 2000, "total": 2000}],
        "subtotal": 2000,
        "delivery_fee": 0,
        "total": 2000,
        "order_mode": mode,
        "payment_status": "pending",
    }
    if mode == "delivery":
        payload["delivery_zone"] = "cotonou"
        payload["delivery_fee"] = 1000
        payload["total"] = 3000
    if scheduled_at:
        payload["scheduled_at"] = scheduled_at
    if extra:
        payload.update(extra)
    return payload


def test_dine_in_too_soon_returns_400(api):
    payload = _base_order("dine_in", scheduled_at=_iso_local_benin(2))
    r = api.post(f"{BASE_URL}/api/delivery-orders", json=payload)
    assert r.status_code == 400, f"Got {r.status_code}: {r.text}"
    detail = r.json().get("detail", "")
    assert "Complet" in detail and "6 heures" in detail, detail


def test_dine_in_valid_8h_creates(api):
    payload = _base_order("dine_in", scheduled_at=_iso_local_benin(8))
    r = api.post(f"{BASE_URL}/api/delivery-orders", json=payload)
    assert r.status_code in (200, 201), f"Got {r.status_code}: {r.text}"
    data = r.json()
    assert "id" in data


def test_dine_in_missing_scheduled_at_returns_400(api):
    payload = _base_order("dine_in")  # pas de scheduled_at
    r = api.post(f"{BASE_URL}/api/delivery-orders", json=payload)
    assert r.status_code == 400, f"Got {r.status_code}: {r.text}"
    detail = r.json().get("detail", "")
    assert "consommation sur place" in detail.lower() or "date et une heure" in detail.lower(), detail


def test_pickup_without_scheduled_at_succeeds(api):
    payload = _base_order("pickup")
    r = api.post(f"{BASE_URL}/api/delivery-orders", json=payload)
    assert r.status_code in (200, 201), f"Got {r.status_code}: {r.text}"
    assert "id" in r.json()


def test_delivery_without_scheduled_at_succeeds(api):
    payload = _base_order("delivery")
    r = api.post(f"{BASE_URL}/api/delivery-orders", json=payload)
    assert r.status_code in (200, 201), f"Got {r.status_code}: {r.text}"
    assert "id" in r.json()


# ---------------- BOOKINGS ----------------

def _benin_today_str():
    return _benin_now().strftime("%Y-%m-%d")


def _benin_tomorrow_str():
    return (_benin_now() + timedelta(days=1)).strftime("%Y-%m-%d")


def test_booking_today_too_soon_returns_400(api):
    # créneau aujourd'hui +2h
    target = (_benin_now() + timedelta(hours=2)).replace(minute=0, second=0, microsecond=0)
    payload = {
        "customer_name": "TEST_BookingSoon",
        "customer_phone": "+22990000002",
        "game_type": "vr_360",
        "date": target.strftime("%Y-%m-%d"),
        "time_slot": target.strftime("%H:%M"),
        "number_of_players": 1,
    }
    r = api.post(f"{BASE_URL}/api/bookings", json=payload)
    assert r.status_code == 400, f"Got {r.status_code}: {r.text}"
    detail = r.json().get("detail", "")
    assert "Complet" in detail and "6 heures" in detail, detail


def test_booking_tomorrow_15h_succeeds(api):
    payload = {
        "customer_name": "TEST_BookingOK",
        "customer_phone": "+22990000003",
        "game_type": "vr_360",
        "date": _benin_tomorrow_str(),
        "time_slot": "15:00",
        "number_of_players": 1,
    }
    r = api.post(f"{BASE_URL}/api/bookings", json=payload)
    # Possible conflit si déjà réservé : on accepte alors 400 "déjà réservé"
    if r.status_code == 400 and "déjà réservé" in r.json().get("detail", ""):
        pytest.skip("Créneau demain 15:00 déjà réservé - regression toujours validée")
    assert r.status_code in (200, 201), f"Got {r.status_code}: {r.text}"
    data = r.json()
    assert data.get("date") == _benin_tomorrow_str()
    assert data.get("time_slot") == "15:00"
