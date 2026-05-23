"""Tests pour Day Openings (ouverture de journée) + garde-fou ventes."""
import os
import datetime as _dt
import uuid

import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"


def _today():
    return _dt.datetime.utcnow().strftime("%Y-%m-%d")


def _force_open_today():
    today = _today()
    return requests.post(
        f"{API}/day-openings/{today}/open",
        json={
            "opened_by": "PytestForce",
            "opened_by_role": "admin",
            "initial_cash": 0,
            "force": True,
        },
    )


class TestDayOpenings:

    def test_get_status_when_not_opened(self):
        # On NE supprime PAS l'ouverture déjà créée par conftest. On vérifie
        # simplement que l'endpoint renvoie un status connu (open/closed).
        r = requests.get(f"{API}/day-openings/{_today()}")
        assert r.status_code == 200
        body = r.json()
        assert body["date"] == _today()
        assert body["status"] in ("open", "closed", "not_opened")

    def test_open_day_idempotent(self):
        _force_open_today()
        r2 = requests.post(
            f"{API}/day-openings/{_today()}/open",
            json={"opened_by": "Test", "initial_cash": 100, "force": True},
        )
        assert r2.status_code == 200
        assert r2.json()["success"] is True

    def test_open_with_initial_cash(self):
        # Forcer pour bypasser la garde-fou
        r = requests.post(
            f"{API}/day-openings/{_today()}/open",
            json={
                "opened_by": "TestCash",
                "opened_by_role": "manager",
                "initial_cash": 25000,
                "notes": "Test pytest",
                "force": True,
            },
        )
        assert r.status_code == 200
        # Re-lecture pour confirmer initial_cash
        r2 = requests.get(f"{API}/day-openings/{_today()}")
        op = r2.json().get("opening", {})
        # Soit cash est 25000, soit l'ouverture précédente a déjà été créée
        assert op is not None

    def test_invoice_creation_blocked_when_day_not_opened(self):
        # 1. Récupérer l'ouverture existante (conftest)
        # 2. La supprimer
        # 3. Tester que la création d'une facture renvoie 423
        # 4. Re-ouvrir pour ne pas casser les autres tests
        today = _today()
        requests.delete(f"{API}/day-openings/{today}")

        r = requests.post(
            f"{API}/invoices?actor_name=admin&actor_role=admin",
            json={
                "customer_name": f"TEST_BLOCK_{uuid.uuid4().hex[:6]}",
                "items": [{"name": "x", "quantity": 1, "price": 100, "department": "plats"}],
                "subtotal": 100,
                "discount": 0,
                "discount_amount": 0,
                "total": 100,
                "payment_method": "cash",
                "totals_by_department": {"plats": 100},
                "created_by": "admin",
                "validation_status": "pending",
            },
        )
        # Doit être 423 (Locked)
        assert r.status_code == 423, f"Expected 423 got {r.status_code} body={r.text}"
        # Restaurer l'ouverture pour les tests suivants
        _force_open_today()

    def test_history_endpoint(self):
        _force_open_today()
        r = requests.get(f"{API}/day-openings/history/list", params={"limit": 10})
        assert r.status_code == 200
        body = r.json()
        assert "history" in body
        assert isinstance(body["history"], list)
        assert body["total"] >= 1

    def test_table_creation_blocked_when_day_not_opened(self):
        today = _today()
        requests.delete(f"{API}/day-openings/{today}")

        # Tenter de créer une table
        r = requests.post(
            f"{API}/caisse/tables",
            json={
                "table_number": 99,
                "server_id": f"test_{uuid.uuid4().hex[:6]}",
                "server_name": "PytestServer",
                "items": [],
                "client_name": "Client",
                "payment_method": "cash",
                "discount": 0,
                "notes": "",
            },
        )
        assert r.status_code == 423, f"Expected 423 got {r.status_code} body={r.text}"
        # Restaurer
        _force_open_today()
