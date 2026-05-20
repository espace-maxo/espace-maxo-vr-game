"""
Tests pour le flux Achat Boissons avec lien direct au stock par id.
"""
import os
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


def _get_first_drink_product():
    r = requests.get(f"{BASE_URL}/api/stock/drinks-products")
    assert r.status_code == 200
    products = r.json().get("products", [])
    assert len(products) > 0, "No drink products in DB - seed needed"
    return products[0]


def _cleanup_expense(expense_id):
    requests.delete(f"{BASE_URL}/api/expenses/{expense_id}", params={"is_admin": True})


class TestDrinksPurchase:
    def test_drinks_products_endpoint(self):
        r = requests.get(f"{BASE_URL}/api/stock/drinks-products")
        assert r.status_code == 200
        d = r.json()
        assert "products" in d
        assert "count" in d
        assert isinstance(d["products"], list)
        if d["products"]:
            p = d["products"][0]
            for key in ("id", "name", "unit", "quantity", "purchase_price", "category_name", "subtype"):
                assert key in p

    def test_create_drinks_purchase(self):
        p = _get_first_drink_product()
        r = requests.post(f"{BASE_URL}/api/expenses/drinks", json={
            "items": [{"stock_product_id": p["id"], "quantity": 10, "unit_price": 500}],
            "supplier": "Test Supplier",
            "requested_by": "TestSuite",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["success"] is True
        exp = d["expense"]
        assert exp["status"] == "pending"
        assert exp["is_drinks_purchase"] is True
        assert exp["expense_type"] == "achat"
        assert exp["items"][0]["stock_product_id"] == p["id"]
        assert exp["amount"] == 5000
        _cleanup_expense(exp["id"])

    def test_create_drinks_purchase_invalid_product(self):
        r = requests.post(f"{BASE_URL}/api/expenses/drinks", json={
            "items": [{"stock_product_id": "non-existent-id-xyz", "quantity": 1, "unit_price": 100}],
            "requested_by": "TestSuite",
        })
        assert r.status_code == 404

    def test_receive_stock_increments_quantity(self):
        p = _get_first_drink_product()
        qty_before = p["quantity"]

        # Create purchase
        r = requests.post(f"{BASE_URL}/api/expenses/drinks", json={
            "items": [{"stock_product_id": p["id"], "quantity": 5, "unit_price": 100}],
            "supplier": "Test Receive",
            "requested_by": "TestSuite",
        })
        exp_id = r.json()["expense"]["id"]

        # Receive
        r2 = requests.post(f"{BASE_URL}/api/expenses/{exp_id}/receive-stock", json={"user_name": "Tester"})
        assert r2.status_code == 200
        assert r2.json()["received_items"] == 1

        # Check stock updated
        products = requests.get(f"{BASE_URL}/api/stock/drinks-products").json()["products"]
        p_after = next(pp for pp in products if pp["id"] == p["id"])
        assert p_after["quantity"] == qty_before + 5

        # Idempotency
        r3 = requests.post(f"{BASE_URL}/api/expenses/{exp_id}/receive-stock", json={})
        assert r3.status_code == 200
        assert r3.json().get("already_received") is True
        products2 = requests.get(f"{BASE_URL}/api/stock/drinks-products").json()["products"]
        p_after2 = next(pp for pp in products2 if pp["id"] == p["id"])
        assert p_after2["quantity"] == qty_before + 5  # No double-add

        # Cleanup: revert stock + delete expense
        requests.post(f"{BASE_URL}/api/stock/products/{p['id']}/adjust",
                      json={"new_quantity": qty_before, "reason": "Test cleanup"})
        _cleanup_expense(exp_id)
