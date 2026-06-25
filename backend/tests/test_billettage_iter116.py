"""
Iter 116 — Backend tests for Billettage with enriched notes containing "[Écart confirmé]".
Validates POST /api/billettage and GET /api/billettage/{date} preserve the enriched notes.
"""
import os
import datetime
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://caisse-mon-point.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def test_date():
    # Use a fixed past test date to avoid clashing with prod data
    return "2026-01-15"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def test_billettage_post_with_ecart_confirme_note(session, test_date):
    """POST /api/billettage with notes containing '[Écart confirmé] {motif}'"""
    payload = {
        "date": test_date,
        "denominations": {"10000": 1},  # total compté = 10000
        "notes": "[Écart confirmé] TEST_iter116 Pourboire client non comptabilisé",
        "actor_name": "TEST_iter116_gerante",
    }
    r = session.post(f"{API}/billettage", json=payload, timeout=20)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    data = r.json()
    assert data.get("success") is True, f"success != True: {data}"


def test_billettage_get_returns_ecart_note(session, test_date):
    """GET /api/billettage/{date} returns the enriched notes including '[Écart confirmé]'"""
    r = session.get(f"{API}/billettage/{test_date}", timeout=15)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    body = r.json()
    notes = body.get("notes", "")
    assert "[Écart confirmé]" in notes, f"Enriched note marker not found in notes={notes!r}"
    assert "TEST_iter116" in notes, f"Marker TEST_iter116 missing in notes={notes!r}"
    denoms = body.get("denominations", {})
    # Accept either string or int key
    assert (denoms.get("10000") == 1) or (denoms.get(10000) == 1), f"denoms={denoms}"


def test_billettage_post_overwrites_notes(session, test_date):
    """POST again with different motif should upsert and overwrite notes correctly."""
    payload = {
        "date": test_date,
        "denominations": {"5000": 2},  # total compté = 10000
        "notes": "[Écart confirmé] TEST_iter116 Erreur de dénomination",
        "actor_name": "TEST_iter116_gerante",
    }
    r = session.post(f"{API}/billettage", json=payload, timeout=20)
    assert r.status_code == 200
    # Verify
    g = session.get(f"{API}/billettage/{test_date}", timeout=15)
    assert g.status_code == 200
    notes = g.json().get("notes", "")
    assert "Erreur de dénomination" in notes
    assert "[Écart confirmé]" in notes


def test_billettage_reconciliation_endpoint(session, test_date):
    """GET /api/billettage/{date}/reconciliation should return expected/counted/difference."""
    r = session.get(f"{API}/billettage/{test_date}/reconciliation", timeout=15)
    assert r.status_code == 200, f"got {r.status_code}: {r.text}"
    data = r.json()
    assert "expected" in data, f"expected key missing: {data}"
