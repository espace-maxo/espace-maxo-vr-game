"""
Tests for per-category reversements (financial points).
Validates 4 separate reversements can coexist for the same day.
"""
import os
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_DATE = "2026-08-15"
CATEGORIES = ["bar", "menu_combos", "jeux", "locations"]


def _cleanup(date):
    r = requests.get(f"{BASE_URL}/api/financial-points", params={"date": date, "period_type": "daily"})
    for p in r.json().get("financial_points", []):
        requests.delete(f"{BASE_URL}/api/financial-points/{p['id']}", params={"is_admin": True})


class TestReversementCategories:
    def setup_method(self):
        _cleanup(TEST_DATE)

    def teardown_method(self):
        _cleanup(TEST_DATE)

    def test_create_four_category_reversements_same_day(self):
        ids = []
        for cat in CATEGORIES:
            r = requests.post(f"{BASE_URL}/api/financial-points", json={
                "date": TEST_DATE, "period_type": "daily", "category": cat,
                "cash_amount": 1000, "created_by": "TestCat",
            })
            assert r.status_code == 200, f"Create {cat} failed: {r.text}"
            ids.append(r.json()["financial_point"]["id"])
        assert len(set(ids)) == 4

    def test_duplicate_category_rejected(self):
        r1 = requests.post(f"{BASE_URL}/api/financial-points", json={
            "date": TEST_DATE, "period_type": "daily", "category": "bar",
            "cash_amount": 1000, "created_by": "TestCat",
        })
        assert r1.status_code == 200
        r2 = requests.post(f"{BASE_URL}/api/financial-points", json={
            "date": TEST_DATE, "period_type": "daily", "category": "bar",
            "cash_amount": 2000, "created_by": "TestCat",
        })
        assert r2.status_code == 400
        assert "catégorie" in r2.json()["detail"].lower() or "déjà" in r2.json()["detail"].lower()

    def test_filter_by_category(self):
        for cat in CATEGORIES:
            requests.post(f"{BASE_URL}/api/financial-points", json={
                "date": TEST_DATE, "period_type": "daily", "category": cat,
                "cash_amount": 1000, "created_by": "TestCat",
            })
        r = requests.get(f"{BASE_URL}/api/financial-points", params={
            "date": TEST_DATE, "period_type": "daily", "category": "jeux"
        })
        points = r.json().get("financial_points", [])
        assert len(points) == 1
        assert points[0]["category"] == "jeux"

    def test_invalid_category_rejected(self):
        r = requests.post(f"{BASE_URL}/api/financial-points", json={
            "date": TEST_DATE, "period_type": "daily", "category": "invalid_cat",
            "cash_amount": 1000, "created_by": "TestCat",
        })
        assert r.status_code == 400

    def test_combined_pdf_endpoint(self):
        for cat in CATEGORIES[:2]:
            requests.post(f"{BASE_URL}/api/financial-points", json={
                "date": TEST_DATE, "period_type": "daily", "category": cat,
                "cash_amount": 5000, "created_by": "TestCat",
            })
        r = requests.get(f"{BASE_URL}/api/reversements/combined-pdf", params={
            "date": TEST_DATE, "period_type": "daily"
        })
        assert r.status_code == 200
        assert len(r.content) > 1000  # PDF/HTML has content
