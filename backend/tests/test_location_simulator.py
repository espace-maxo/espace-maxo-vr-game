"""
Tests pour le simulateur de devis Locations.
"""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"


class TestLocationSimulator:

    def test_compute_percent_margin(self):
        """Calcul éphémère avec marge % : 100 000 + 30% → 130 000, 6 500 / pers."""
        r = requests.post(f"{API}/location-simulations/compute", json={
            "name": "T",
            "num_persons": 20,
            "items": [
                {"type": "libre", "label": "Salle", "unit_cost": 50000, "quantity": 1},
                {"type": "libre", "label": "Bouteilles", "unit_cost": 1250, "quantity": 40},
            ],
            "margin_type": "percent",
            "margin_value": 30,
        })
        assert r.status_code == 200
        d = r.json()
        assert d["total_cost"] == 100000
        assert d["sale_price_global"] == 130000
        assert d["sale_price_per_person"] == 6500
        assert d["margin_amount"] == 30000

    def test_compute_fixed_margin(self):
        """Calcul avec marge fixe : 50 000 + 25 000 = 75 000."""
        r = requests.post(f"{API}/location-simulations/compute", json={
            "name": "T",
            "num_persons": 5,
            "items": [{"type": "libre", "label": "X", "unit_cost": 50000, "quantity": 1}],
            "margin_type": "fixed",
            "margin_value": 25000,
        })
        assert r.json()["sale_price_global"] == 75000
        assert r.json()["sale_price_per_person"] == 15000

    def test_persons_minimum_1(self):
        """num_persons=0 → divisé par 1 quand même."""
        r = requests.post(f"{API}/location-simulations/compute", json={
            "name": "T", "num_persons": 0,
            "items": [{"type": "libre", "label": "X", "unit_cost": 10000, "quantity": 1}],
            "margin_type": "percent", "margin_value": 0,
        })
        assert r.json()["sale_price_per_person"] == 10000

    def test_save_load_delete(self):
        """CRUD complet : save, list, get, update, delete."""
        # Create
        create = requests.post(f"{API}/location-simulations", json={
            "name": "Anniversaire Sarah",
            "client_name": "Sarah Aho",
            "event_date": "2026-06-15",
            "num_persons": 10,
            "items": [{"type": "libre", "label": "Salle", "unit_cost": 20000, "quantity": 1}],
            "margin_type": "percent", "margin_value": 25,
            "created_by": "Test",
        })
        assert create.status_code == 200
        sim = create.json()["simulation"]
        sid = sim["id"]
        assert sim["total_cost"] == 20000
        assert sim["sale_price_global"] == 25000

        # List
        lst = requests.get(f"{API}/location-simulations").json()
        assert any(s["id"] == sid for s in lst.get("simulations", []))

        # Get
        g = requests.get(f"{API}/location-simulations/{sid}").json()
        assert g["simulation"]["name"] == "Anniversaire Sarah"

        # Update (add an item)
        u = requests.put(f"{API}/location-simulations/{sid}", json={
            "name": "Anniversaire Sarah",
            "client_name": "Sarah Aho",
            "event_date": "2026-06-15",
            "num_persons": 10,
            "items": [
                {"type": "libre", "label": "Salle", "unit_cost": 20000, "quantity": 1},
                {"type": "libre", "label": "Gâteau", "unit_cost": 15000, "quantity": 1},
            ],
            "margin_type": "percent", "margin_value": 25,
        })
        assert u.json()["simulation"]["total_cost"] == 35000

        # Delete
        d = requests.delete(f"{API}/location-simulations/{sid}")
        assert d.status_code == 200
        g2 = requests.get(f"{API}/location-simulations/{sid}")
        assert g2.status_code == 404
