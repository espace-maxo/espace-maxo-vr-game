"""
Tests pour le workflow STOCK FLOW :
1. to_stock=false (global) + no override → aucun mouvement stock
2. to_stock=true (global) → tous les items vont en stock
3. Mix : to_stock=true mais 1 item avec passer_en_stock=false → seul l'item autorisé va en stock
4. Approbation marque reception_status='expected'
5. Complétion marque reception_status='received' et crée stock_movements
"""
import os
import time
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"


def _create_expense(items, to_stock=False):
    total = sum((it.get("quantity", 1) * it.get("unit_price", 0)) for it in items)
    payload = {
        "category": items[0].get("category", "cuisine"),
        "description": f"TEST_StockFlow_{int(time.time()*1000)}",
        "amount": total,
        "is_group": True,
        "items": items,
        "requested_by": "Test",
        "to_stock": to_stock,
    }
    r = requests.post(f"{API}/expenses", json=payload)
    assert r.status_code == 200, r.text
    return r.json()["expense"]["id"]


def _approve(eid):
    return requests.put(f"{API}/expenses/{eid}", json={"status": "approved", "approved_by": "Admin"}).json()


def _complete(eid):
    return requests.put(f"{API}/expenses/{eid}", json={"status": "completed"}).json()


def _cleanup(eid):
    requests.delete(f"{API}/expenses/{eid}")


class TestStockFlow:

    def test_no_stock_when_global_false_no_override(self):
        """to_stock=False + items sans override → aucune sync stock."""
        eid = _create_expense([
            {"category": "autres", "description": "Service ménage", "quantity": 1, "unit_price": 3000, "amount": 3000},
        ], to_stock=False)
        try:
            _approve(eid)
            after = _complete(eid)
            assert after["expense"].get("stock_reception_status") in (None, "")

            # Aucun stock_movement créé
            movs = requests.get(f"{API}/stock/movements?limit=200").json().get("movements", [])
            my_movs = [m for m in movs if m.get("expense_id") == eid]
            assert len(my_movs) == 0

            # Pas visible dans /stock/purchases comme caisse pending
            purchases = requests.get(f"{API}/stock/purchases").json().get("purchases", [])
            caisse_match = [p for p in purchases if p.get("expense_id") == eid]
            assert len(caisse_match) == 0
        finally:
            _cleanup(eid)

    def test_stock_when_global_true(self):
        """to_stock=True + items sans override → tous les items vont en stock."""
        eid = _create_expense([
            {"category": "cuisine", "description": "Tomates fraîches", "quantity": 2, "unit_price": 1500, "amount": 3000},
            {"category": "cuisine", "description": "Oignons rouges", "quantity": 1, "unit_price": 2000, "amount": 2000},
        ], to_stock=True)
        try:
            r1 = _approve(eid)
            assert r1["expense"]["stock_reception_status"] == "expected"

            r2 = _complete(eid)
            assert r2["expense"]["stock_reception_status"] == "received"

            movs = requests.get(f"{API}/stock/movements?limit=200").json().get("movements", [])
            my_movs = [m for m in movs if m.get("expense_id") == eid]
            assert len(my_movs) == 2
        finally:
            _cleanup(eid)

    def test_item_override_overrides_global(self):
        """to_stock=True mais 1 item avec passer_en_stock=False → seul l'autre va en stock."""
        eid = _create_expense([
            {"category": "cuisine", "description": "Riz parfumé", "quantity": 5, "unit_price": 1000, "amount": 5000, "passer_en_stock": True},
            {"category": "autres", "description": "Pourboire livreur", "quantity": 1, "unit_price": 500, "amount": 500, "passer_en_stock": False},
        ], to_stock=True)
        try:
            _approve(eid)
            _complete(eid)
            movs = requests.get(f"{API}/stock/movements?limit=200").json().get("movements", [])
            my_movs = [m for m in movs if m.get("expense_id") == eid]
            assert len(my_movs) == 1
            assert "Riz" in my_movs[0]["product_name"]
        finally:
            _cleanup(eid)

    def test_item_can_force_stock_when_global_false(self):
        """to_stock=False mais 1 item avec passer_en_stock=True → seul cet item va en stock."""
        eid = _create_expense([
            {"category": "autres", "description": "Frais transport", "quantity": 1, "unit_price": 2000, "amount": 2000},
            {"category": "cuisine", "description": "Pain baguettes", "quantity": 10, "unit_price": 250, "amount": 2500, "passer_en_stock": True},
        ], to_stock=False)
        try:
            r1 = _approve(eid)
            # Au moins 1 item va en stock → reception_status='expected'
            assert r1["expense"]["stock_reception_status"] == "expected"
            _complete(eid)
            movs = requests.get(f"{API}/stock/movements?limit=200").json().get("movements", [])
            my_movs = [m for m in movs if m.get("expense_id") == eid]
            assert len(my_movs) == 1
            assert "Pain" in my_movs[0]["product_name"]
        finally:
            _cleanup(eid)

    def test_caisse_expense_visible_in_purchases_when_to_stock_true(self):
        """Un achat Caisse pending avec to_stock=true apparaît dans /stock/purchases."""
        eid = _create_expense([
            {"category": "cuisine", "description": "Sel fin", "quantity": 1, "unit_price": 800, "amount": 800},
        ], to_stock=True)
        try:
            # Pending, pas encore complété → visible mais pas reçu
            purchases = requests.get(f"{API}/stock/purchases").json().get("purchases", [])
            match = [p for p in purchases if p.get("expense_id") == eid]
            assert len(match) == 1
            assert match[0]["source"] == "caisse"
            assert match[0]["to_stock"] is True
        finally:
            _cleanup(eid)

    def test_caisse_expense_hidden_when_to_stock_false(self):
        """Un achat Caisse avec to_stock=false N'apparaît PAS dans /stock/purchases."""
        eid = _create_expense([
            {"category": "autres", "description": "Réparation chaise", "quantity": 1, "unit_price": 5000, "amount": 5000},
        ], to_stock=False)
        try:
            purchases = requests.get(f"{API}/stock/purchases").json().get("purchases", [])
            match = [p for p in purchases if p.get("expense_id") == eid]
            assert len(match) == 0
        finally:
            _cleanup(eid)
