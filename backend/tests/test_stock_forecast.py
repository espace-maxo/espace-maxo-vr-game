"""Tests for the new GET /api/stock/forecast endpoint and manual consumption fallback."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


class TestForecastEndpoint:
    def test_forecast_basic_structure(self, api):
        r = api.get(f"{BASE_URL}/api/stock/forecast?window_days=30")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "summary" in data and "items" in data
        s = data["summary"]
        for k in ("total_products", "critical", "warning", "ok", "no_data", "window_days"):
            assert k in s, f"missing summary key {k}"
        assert s["window_days"] == 30
        assert isinstance(data["items"], list)
        if data["items"]:
            it = data["items"][0]
            for k in ("product_id", "name", "current_quantity", "unit", "daily_avg",
                     "daily_avg_movements", "daily_consumption_manual", "source",
                     "days_remaining", "urgency", "window_days"):
                assert k in it, f"missing item key {k}"

    def test_forecast_sorting_critical_first(self, api):
        r = api.get(f"{BASE_URL}/api/stock/forecast?window_days=30")
        data = r.json()
        items = data["items"]
        order = {"critical": 0, "warning": 1, "ok": 2, "no_data": 3}
        prev = -1
        for it in items:
            cur = order.get(it["urgency"], 99)
            assert cur >= prev, f"sort order broken at {it}"
            prev = cur

    def test_forecast_top_limit(self, api):
        r = api.get(f"{BASE_URL}/api/stock/forecast?window_days=30&top=5")
        data = r.json()
        assert len(data["items"]) <= 5

    def test_current_quantity_field_present_and_correct(self, api):
        """The forecast item.current_quantity must reflect the actual stock product's quantity.
        Pick a real product with quantity > 0 from /api/stock/products and verify
        the forecast returns the same quantity."""
        prods = api.get(f"{BASE_URL}/api/stock/products").json()["products"]
        pos = [p for p in prods if (p.get("quantity") or 0) > 0]
        if not pos:
            pytest.skip("no positive-quantity product to verify")
        sample = pos[0]
        r = api.get(f"{BASE_URL}/api/stock/forecast?window_days=30").json()
        match = next((i for i in r["items"] if i["product_id"] == sample["id"]), None)
        assert match is not None, "sample product not present in forecast"
        # BUG check: forecast must read product.quantity, not product.current_quantity
        assert match["current_quantity"] == pytest.approx(sample["quantity"], rel=0.01), (
            f"BUG: forecast current_quantity={match['current_quantity']} but stock product "
            f"quantity={sample['quantity']} (likely reading wrong field name 'current_quantity' "
            f"instead of 'quantity' in stock.py)"
        )


class TestManualConsumption:
    def test_manual_consumption_persistence_and_source(self, api):
        prods = api.get(f"{BASE_URL}/api/stock/products").json()["products"]
        # find a product with no movements (no_data) candidate
        forecast = api.get(f"{BASE_URL}/api/stock/forecast?window_days=30").json()
        nodata_ids = [i["product_id"] for i in forecast["items"] if i["urgency"] == "no_data"]
        if not nodata_ids:
            pytest.skip("no no_data product to test manual override")
        target_id = nodata_ids[0]
        # PUT manual consumption
        r = api.put(f"{BASE_URL}/api/stock/products/{target_id}",
                    json={"daily_consumption_manual": 2.5})
        assert r.status_code == 200, r.text
        # verify persistence
        p = api.get(f"{BASE_URL}/api/stock/products/{target_id}").json()
        assert float(p.get("daily_consumption_manual", 0)) == 2.5
        # verify forecast picks it up with source=manual
        f2 = api.get(f"{BASE_URL}/api/stock/forecast?window_days=30").json()
        match = next((i for i in f2["items"] if i["product_id"] == target_id), None)
        assert match is not None
        # Only assert source=manual if no movements
        if match["daily_avg_movements"] == 0:
            assert match["source"] == "manual", f"expected source=manual, got {match['source']}"
            assert match["daily_avg"] == 2.5
        # cleanup
        api.put(f"{BASE_URL}/api/stock/products/{target_id}",
                json={"daily_consumption_manual": None})

    def test_movements_priority_over_manual(self, api):
        forecast = api.get(f"{BASE_URL}/api/stock/forecast?window_days=30").json()
        with_movs = [i for i in forecast["items"] if i["daily_avg_movements"] > 0]
        if not with_movs:
            pytest.skip("no product with recent movements")
        target = with_movs[0]
        # set a manual value lower than movements
        api.put(f"{BASE_URL}/api/stock/products/{target['product_id']}",
                json={"daily_consumption_manual": 0.0001})
        f2 = api.get(f"{BASE_URL}/api/stock/forecast?window_days=30").json()
        match = next((i for i in f2["items"] if i["product_id"] == target["product_id"]), None)
        assert match["source"] == "movements"
        # cleanup
        api.put(f"{BASE_URL}/api/stock/products/{target['product_id']}",
                json={"daily_consumption_manual": None})
