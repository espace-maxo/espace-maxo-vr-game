"""
Tests for revenue group separation in reports (Bar / Menu&Combos / Jeux / Autres).
Validates /api/reports/weekly and /api/invoices/stats/monthly include the by_revenue_group field.
"""
import os
import time
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestRevenueGroups:
    def test_weekly_report_has_by_revenue_group(self):
        r = requests.get(f"{BASE_URL}/api/reports/weekly")
        assert r.status_code == 200
        data = r.json()
        assert "sales" in data
        assert "by_revenue_group" in data["sales"]
        for k in ("bar", "menu_combos", "jeux", "autres"):
            assert k in data["sales"]["by_revenue_group"]
        # Each day too
        for day_data in (data.get("daily") or {}).values():
            assert "by_revenue_group" in day_data["sales"]
            for k in ("bar", "menu_combos", "jeux", "autres"):
                assert k in day_data["sales"]["by_revenue_group"]

    def test_monthly_stats_has_by_revenue_group_and_locations(self):
        r = requests.get(f"{BASE_URL}/api/invoices/stats/monthly", params={"year": 2026, "month": 4})
        assert r.status_code == 200
        data = r.json()
        assert "by_revenue_group" in data
        assert "locations_income" in data
        assert "total_income" in data
        for k in ("bar", "menu_combos", "jeux", "autres"):
            assert k in data["by_revenue_group"]
        # total_income == total_revenue + locations_income
        assert data["total_income"] == data["total_revenue"] + data["locations_income"]

    def test_weekly_split_consistency(self):
        """Sum of revenue_groups must equal sales.total when sales > 0."""
        r = requests.get(f"{BASE_URL}/api/reports/weekly", params={
            "week_start": "2026-04-27", "end_date": "2026-05-03"
        })
        assert r.status_code == 200
        data = r.json()
        sales = data["sales"]
        if sales["total"] > 0:
            grp_sum = sum(sales["by_revenue_group"].values())
            # Allow small rounding diff
            assert abs(grp_sum - sales["total"]) < 1, (
                f"Sum of revenue_groups {grp_sum} != sales.total {sales['total']}"
            )
