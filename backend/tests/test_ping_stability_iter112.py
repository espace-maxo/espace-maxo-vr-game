"""
Iter 112 - Vérification de la stabilité du ping /api/sync/ping utilisé
par useOnlineStatus côté Caisse (anti-faux-positif offline).
"""
import os
import time
import statistics
import requests

API_URL = os.environ.get(
    "BACKEND_URL",
    "https://caisse-mon-point.preview.emergentagent.com",
).rstrip("/") + "/api"


def test_ping_returns_200():
    r = requests.get(f"{API_URL}/sync/ping", timeout=10)
    assert r.status_code == 200, f"ping failed: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("ok") is True
    assert "server_time" in body


def test_ping_latency_under_2s_p95():
    """20 pings consecutifs : la p95 doit etre sous 2s pour eviter les faux offline."""
    latencies = []
    for _ in range(20):
        t0 = time.perf_counter()
        r = requests.get(f"{API_URL}/sync/ping", timeout=10)
        latencies.append((time.perf_counter() - t0) * 1000)
        assert r.status_code == 200
        time.sleep(0.05)
    p95 = sorted(latencies)[int(len(latencies) * 0.95) - 1]
    p99 = sorted(latencies)[-1]
    avg = statistics.mean(latencies)
    print(f"\nPing latency: avg={avg:.0f}ms p95={p95:.0f}ms p99={p99:.0f}ms")
    assert p95 < 2000, f"p95 too high: {p95:.0f}ms"


def test_ping_consistent_20_calls():
    """Tous les 20 pings consecutifs doivent reussir (aucun timeout, aucune 5xx)."""
    ok = 0
    for _ in range(20):
        r = requests.get(f"{API_URL}/sync/ping", timeout=10)
        if r.status_code == 200:
            ok += 1
        time.sleep(0.1)
    assert ok == 20, f"only {ok}/20 pings succeeded"
