"""
Tests pour le nouveau flow Caisse :
1. Tracking de table : durée figée pour `ready_to_invoice` et `invoiced`
2. Auto-libération des tables `invoiced` anciennes
3. Status `ready_to_invoice` accepté par PUT
"""
import os
import time
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"


def _create_table(table_num=11):
    r = requests.post(f"{API}/caisse/tables", json={
        "table_number": table_num,
        "server_id": "test-srv",
        "server_name": "Test Server",
        "client_name": "Test Client",
    })
    assert r.status_code == 200, r.text
    return r.json()["table"]


def _delete_table(tid):
    requests.delete(f"{API}/caisse/tables/{tid}")


class TestTableTracking:

    def test_status_ready_to_invoice_accepted(self):
        t = _create_table(table_num=11)
        try:
            r = requests.put(f"{API}/caisse/tables/{t['id']}", json={
                "items": [{"product_id": "x", "product_name": "Test", "price": 500, "quantity": 1, "department": "bar", "total": 500}],
                "status": "ready_to_invoice",
                "last_order_sent_at": "2026-05-22T10:00:00Z",
            })
            assert r.status_code == 200
            assert r.json()["table"]["status"] == "ready_to_invoice"
            assert r.json()["table"]["last_order_sent_at"] == "2026-05-22T10:00:00Z"
        finally:
            _delete_table(t["id"])

    def test_duration_frozen_for_ready_to_invoice(self):
        """Le duration ne doit PAS bouger pour une table ready_to_invoice."""
        t = _create_table(table_num=12)
        try:
            # Envoie la commande il y a "déjà" 5 min (depuis created_at)
            sent_at = "2026-05-22T10:05:00Z"
            requests.put(f"{API}/caisse/tables/{t['id']}", json={
                "items": [{"product_id": "x", "product_name": "T", "price": 100, "quantity": 1, "department": "bar", "total": 100}],
                "status": "ready_to_invoice",
                "last_order_sent_at": sent_at,
            })
            # Read 1
            r1 = requests.get(f"{API}/caisse/tables/status").json()
            t12_1 = [x for x in r1["tables"] if x["table_number"] == 12][0]
            d1 = t12_1["duration_minutes"]
            assert t12_1["status"] == "ready_to_invoice"

            # Wait 5 seconds and read again — duration must NOT change
            time.sleep(5)
            r2 = requests.get(f"{API}/caisse/tables/status").json()
            t12_2 = [x for x in r2["tables"] if x["table_number"] == 12][0]
            d2 = t12_2["duration_minutes"]
            assert d1 == d2, f"Duration should be frozen, got {d1} → {d2}"
        finally:
            _delete_table(t["id"])

    def test_duration_frozen_for_invoiced(self):
        """Le duration doit être figé à invoice_created_at pour invoiced."""
        t = _create_table(table_num=13)
        try:
            requests.put(f"{API}/caisse/tables/{t['id']}", json={
                "status": "invoiced",
                "items": [],
                "invoice_created_at": "2026-05-22T10:10:00Z",
            })
            r1 = requests.get(f"{API}/caisse/tables/status").json()
            t13_1 = [x for x in r1["tables"] if x["table_number"] == 13]
            if not t13_1:
                # Possibly already auto-released (>30min). That's the test_auto_release case.
                return
            d1 = t13_1[0]["duration_minutes"]
            time.sleep(5)
            r2 = requests.get(f"{API}/caisse/tables/status").json()
            t13_2 = [x for x in r2["tables"] if x["table_number"] == 13]
            if t13_2:
                d2 = t13_2[0]["duration_minutes"]
                assert d1 == d2
        finally:
            _delete_table(t["id"])

    def test_auto_release_old_invoiced(self):
        """Une table invoiced il y a > 30 min doit être auto-libérée à la lecture."""
        t = _create_table(table_num=14)
        try:
            # Set invoice_created_at = 35 min ago
            from datetime import datetime, timezone, timedelta
            old_iso = (datetime.now(timezone.utc) - timedelta(minutes=35)).isoformat()
            requests.put(f"{API}/caisse/tables/{t['id']}", json={
                "status": "invoiced",
                "items": [],
                "invoice_created_at": old_iso,
            })
            # Reading status should auto-release this table
            r = requests.get(f"{API}/caisse/tables/status").json()
            t14 = [x for x in r["tables"] if x["table_number"] == 14]
            # If auto-released, table_number 14 should be 'free'
            if t14:
                assert t14[0]["status"] == "free", f"Expected free, got {t14[0]['status']}"
        finally:
            # Cleanup just in case
            _delete_table(t["id"])

    def test_invoice_not_created_at_send_order(self):
        """Quand on update une table en ready_to_invoice, AUCUNE facture n'est créée."""
        # Get current invoice count for table=15
        before = requests.get(f"{API}/invoices?table_number=15").json()
        before_count = len(before.get("invoices", []))

        t = _create_table(table_num=15)
        try:
            requests.put(f"{API}/caisse/tables/{t['id']}", json={
                "items": [{"product_id": "x", "product_name": "X", "price": 100, "quantity": 1, "department": "bar", "total": 100}],
                "status": "ready_to_invoice",
                "last_order_sent_at": "2026-05-22T10:00:00Z",
            })
            # Should still be the same number of invoices
            after = requests.get(f"{API}/invoices?table_number=15").json()
            after_count = len(after.get("invoices", []))
            assert before_count == after_count, f"No invoice should be created; before={before_count}, after={after_count}"
        finally:
            _delete_table(t["id"])
