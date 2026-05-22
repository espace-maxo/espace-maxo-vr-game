"""
Tests pour le répertoire des prix d'achat (purchase_price_history).
"""
import os
import uuid
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"


class TestPurchasePriceHistory:

    def _create_and_complete(self, items, supplier="Fournisseur Test"):
        # 1) Create expense
        total = sum(i["quantity"] * i["unit_price"] for i in items)
        r = requests.post(f"{API}/expenses", json={
            "category": items[0].get("category", "cuisine"),
            "description": f"TEST_PPH_{uuid.uuid4().hex[:6]}",
            "amount": total,
            "is_group": True,
            "items": items,
            "supplier": supplier,
            "requested_by": "Test",
            "to_stock": False,  # disable stock sync to keep test focused on PPH
        })
        eid = r.json()["expense"]["id"]
        # 2) Approve & complete
        requests.put(f"{API}/expenses/{eid}", json={"status": "approved", "approved_by": "Admin"})
        requests.put(f"{API}/expenses/{eid}", json={"status": "completed"})
        return eid

    def test_records_on_completion(self):
        """Au moment du completion, 1 entrée par item est créée dans purchase_price_history."""
        eid = self._create_and_complete([
            {"category": "cuisine", "description": "PPHTomates", "quantity": 5, "unit_price": 1000, "amount": 5000},
            {"category": "cuisine", "description": "PPHOignons", "quantity": 3, "unit_price": 800, "amount": 2400},
        ], supplier="Marché Dantokpa")
        try:
            r = requests.get(f"{API}/purchase-price-history", params={"product_name": "PPHTomates"})
            rows = r.json()["history"]
            tomate_rows = [h for h in rows if h["expense_id"] == eid]
            assert len(tomate_rows) == 1
            t = tomate_rows[0]
            assert t["product_name"] == "PPHTomates"
            assert t["quantity"] == 5
            assert t["unit_price"] == 1000
            assert t["total_amount"] == 5000
            assert t["supplier"] == "Marché Dantokpa"
        finally:
            requests.delete(f"{API}/expenses/{eid}")

    def test_filter_by_supplier(self):
        eid = self._create_and_complete([
            {"category": "cuisine", "description": f"PPHUnique{uuid.uuid4().hex[:4]}", "quantity": 1, "unit_price": 500, "amount": 500},
        ], supplier="Erevan")
        try:
            r = requests.get(f"{API}/purchase-price-history", params={"supplier": "Erevan"})
            ids = [h["expense_id"] for h in r.json()["history"]]
            assert eid in ids
            # Wrong filter returns no row from this expense
            r2 = requests.get(f"{API}/purchase-price-history", params={"supplier": "NoSuchSupplier"})
            ids2 = [h["expense_id"] for h in r2.json()["history"]]
            assert eid not in ids2
        finally:
            requests.delete(f"{API}/expenses/{eid}")

    def test_by_product_stats(self):
        """Vue groupée fournit min/max/avg/last/count."""
        prod_name = f"PPHProd{uuid.uuid4().hex[:4]}"
        e1 = self._create_and_complete([
            {"category": "cuisine", "description": prod_name, "quantity": 2, "unit_price": 1000, "amount": 2000},
        ])
        e2 = self._create_and_complete([
            {"category": "cuisine", "description": prod_name, "quantity": 5, "unit_price": 1200, "amount": 6000},
        ])
        try:
            r = requests.get(f"{API}/purchase-price-history/by-product").json()
            match = [p for p in r["products"] if p["product_name"] == prod_name]
            assert len(match) == 1
            p = match[0]
            assert p["count"] == 2
            assert p["min_price"] == 1000
            assert p["max_price"] == 1200
            assert p["avg_price"] == 1100
            assert p["total_qty"] == 7
            assert p["total_spent"] == 8000
        finally:
            requests.delete(f"{API}/expenses/{e1}")
            requests.delete(f"{API}/expenses/{e2}")

    def test_no_record_for_paiement(self):
        """Les expenses de type 'paiement' ne sont pas tracées dans PPH."""
        r = requests.post(f"{API}/expenses", json={
            "category": "paiement",
            "description": f"PPH_paiement_{uuid.uuid4().hex[:4]}",
            "amount": 5000,
            "is_group": False,
            "expense_type": "paiement",
            "requested_by": "Test",
        })
        eid = r.json()["expense"]["id"]
        try:
            requests.put(f"{API}/expenses/{eid}", json={"status": "approved"})
            requests.put(f"{API}/expenses/{eid}", json={"status": "completed"})
            r2 = requests.get(f"{API}/purchase-price-history").json()
            assert not any(h["expense_id"] == eid for h in r2["history"])
        finally:
            requests.delete(f"{API}/expenses/{eid}")

    def test_backfill_is_idempotent(self):
        """Le backfill ne crée pas de doublons sur expenses déjà tracées."""
        eid = self._create_and_complete([
            {"category": "cuisine", "description": f"PPHBack{uuid.uuid4().hex[:4]}", "quantity": 1, "unit_price": 100, "amount": 100},
        ])
        try:
            before = requests.get(f"{API}/purchase-price-history").json()["total"]
            r = requests.post(f"{API}/purchase-price-history/backfill")
            after = requests.get(f"{API}/purchase-price-history").json()["total"]
            # backfill should NOT add new entries for already-tracked expense
            # (may add for other already-completed-but-not-tracked expenses in DB; we just verify our own is not duplicated)
            our_rows = [h for h in requests.get(f"{API}/purchase-price-history").json()["history"] if h["expense_id"] == eid]
            assert len(our_rows) == 1
        finally:
            requests.delete(f"{API}/expenses/{eid}")
