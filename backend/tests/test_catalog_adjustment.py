"""
Tests : ajustement automatique de quantité dans le catalogue Stock.
- Édition produit avec changement de quantity → crée un movement type='ajustement'
- Sans changement de quantity → aucun mouvement créé
- Le motif est obligatoire (sinon défaut "Ajustement manuel catalogue")
- Le mouvement contient delta signé, previous_quantity, new_quantity
- Le stock_products.quantity reflète bien la nouvelle valeur
"""
import os
import uuid
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"


def _create_product(name, qty=10):
    # Need a category first
    cats = requests.get(f"{API}/stock/categories").json().get("categories", [])
    if not cats:
        cr = requests.post(f"{API}/stock/categories", json={"name": "TestCat", "color": "#888", "icon": "Package"})
        cat_id = cr.json()["category"]["id"]
    else:
        cat_id = cats[0]["id"]
    payload = {
        "code": f"T-{uuid.uuid4().hex[:6].upper()}",
        "name": name,
        "category_id": cat_id,
        "unit": "unite",
        "quantity": qty,
        "stock_min": 5,
        "stock_max": 100,
        "purchase_price": 1000,
        "is_active": True,
    }
    r = requests.post(f"{API}/stock/products", json=payload)
    assert r.status_code == 200, r.text
    return r.json()["product"]


def _delete_product(pid):
    requests.delete(f"{API}/stock/products/{pid}")


def _get_movements_for_product(pid):
    r = requests.get(f"{API}/stock/movements", params={"product_id": pid, "limit": 50})
    return r.json().get("movements", [])


class TestCatalogAdjustment:

    def test_quantity_change_creates_adjustment_movement(self):
        p = _create_product(f"AdjTest-{uuid.uuid4().hex[:4]}", qty=20)
        try:
            # Update quantity from 20 → 35 (delta +15)
            r = requests.put(f"{API}/stock/products/{p['id']}", json={
                **p, "quantity": 35,
                "adjustment_reason": "Inventaire physique",
                "adjustment_user": "Admin Test",
            })
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["success"] is True
            assert data["product"]["quantity"] == 35
            adj = data.get("adjustment_movement")
            assert adj is not None
            assert adj["movement_type"] == "ajustement"
            assert adj["previous_quantity"] == 20
            assert adj["new_quantity"] == 35
            assert adj["adjustment_delta"] == 15
            assert adj["quantity"] == 15
            assert adj["reason"] == "Inventaire physique"
            assert adj["user_name"] == "Admin Test"
            assert adj["source"] == "catalog_edit"

            # Vérifier qu'il est bien dans la liste des mouvements
            movs = _get_movements_for_product(p["id"])
            adj_movs = [m for m in movs if m.get("movement_type") == "ajustement" and m.get("source") == "catalog_edit"]
            assert len(adj_movs) >= 1
        finally:
            _delete_product(p["id"])

    def test_quantity_decrease_creates_negative_adjustment(self):
        p = _create_product(f"AdjTest-{uuid.uuid4().hex[:4]}", qty=50)
        try:
            r = requests.put(f"{API}/stock/products/{p['id']}", json={
                **p, "quantity": 30,
                "adjustment_reason": "Casse / Avarie",
                "adjustment_user": "Admin",
            })
            adj = r.json()["adjustment_movement"]
            assert adj["adjustment_delta"] == -20
            assert adj["quantity"] == 20  # toujours positive
            assert adj["new_quantity"] == 30
        finally:
            _delete_product(p["id"])

    def test_no_movement_when_quantity_unchanged(self):
        p = _create_product(f"AdjTest-{uuid.uuid4().hex[:4]}", qty=15)
        try:
            # Edit other fields, keep quantity
            r = requests.put(f"{API}/stock/products/{p['id']}", json={
                **p, "stock_min": 8,  # changed
                "adjustment_reason": "Should not be used",
            })
            assert r.json()["adjustment_movement"] is None
            movs = _get_movements_for_product(p["id"])
            adj_movs = [m for m in movs if m.get("source") == "catalog_edit"]
            assert len(adj_movs) == 0
        finally:
            _delete_product(p["id"])

    def test_default_reason_if_missing(self):
        p = _create_product(f"AdjTest-{uuid.uuid4().hex[:4]}", qty=10)
        try:
            r = requests.put(f"{API}/stock/products/{p['id']}", json={
                **p, "quantity": 12,
            })
            adj = r.json()["adjustment_movement"]
            assert adj is not None
            assert adj["reason"] == "Ajustement manuel catalogue"
        finally:
            _delete_product(p["id"])
