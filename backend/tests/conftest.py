"""Pytest conftest — ouvre la journée pour permettre les ventes de test.

La création de factures et de tables est bloquée par défaut si la journée
n'est pas ouverte (cf. day_openings.py). Ce conftest ouvre la journée du
jour pour TOUS les tests à l'échelle de la session.
"""
import os
import datetime as _dt
import pytest
import requests


@pytest.fixture(scope="session", autouse=True)
def ensure_day_opened():
    base = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
    if not base:
        yield
        return
    api = f"{base}/api"
    today = _dt.datetime.utcnow().strftime("%Y-%m-%d")
    try:
        requests.post(
            f"{api}/day-openings/{today}/open",
            json={
                "opened_by": "PytestRunner",
                "opened_by_role": "admin",
                "initial_cash": 0,
                "notes": "Auto-opened by pytest",
                "force": True,
            },
            timeout=10,
        )
    except Exception:
        pass
    yield
