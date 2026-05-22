"""
Tests pour le catalogue Quick Products (Marché / Supermarché).
"""
import os
import uuid
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"


class TestQuickProducts:

    def test_seed_populated(self):
        """Le seed doit avoir rempli le catalogue avec au moins 80 produits."""
        r = requests.get(f"{API}/quick-products")
        assert r.status_code == 200
        d = r.json()
        assert d["total"] >= 80, f"Expected >=80 seeded, got {d['total']}"
        # Doit contenir au moins 8 catégories
        cats = {p["category"] for p in d["products"]}
        assert len(cats) >= 8

    def test_seed_contains_known_items(self):
        """Doit contenir des items clés FCFA Bénin (Coca, riz, tomates, sono)."""
        r = requests.get(f"{API}/quick-products").json()
        names_lower = [p["name"].lower() for p in r["products"]]
        for needle in ["coca-cola", "riz", "tomates", "sono"]:
            assert any(needle in n for n in names_lower), f"Missing '{needle}'"

    def test_create_update_delete(self):
        """CRUD complet : create custom, update price, delete."""
        # Create
        suffix = uuid.uuid4().hex[:6]
        r = requests.post(f"{API}/quick-products", json={
            "name": f"Test Product {suffix}",
            "category": "Test Cat",
            "unit_cost": 1234,
            "unit": "pièce",
        })
        assert r.status_code == 200
        prod = r.json()["product"]
        assert prod["source"] == "custom"
        assert prod["unit_cost"] == 1234
        prod_id = prod["id"]

        # Update
        r2 = requests.put(f"{API}/quick-products/{prod_id}", json={"unit_cost": 5678})
        assert r2.json()["product"]["unit_cost"] == 5678

        # Visible in list
        lst = requests.get(f"{API}/quick-products").json()
        assert any(p["id"] == prod_id for p in lst["products"])

        # Delete
        d = requests.delete(f"{API}/quick-products/{prod_id}")
        assert d.status_code == 200
        lst2 = requests.get(f"{API}/quick-products").json()
        assert not any(p["id"] == prod_id for p in lst2["products"])

    def test_create_requires_name(self):
        r = requests.post(f"{API}/quick-products", json={"name": "", "category": "X", "unit_cost": 100})
        assert r.status_code == 400
