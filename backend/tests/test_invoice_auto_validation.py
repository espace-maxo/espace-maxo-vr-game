"""
Tests pour l'auto-validation des factures à l'émission du bon client.
"""
import os
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


def _cleanup(invoice_id):
    requests.delete(f"{BASE_URL}/api/invoices/{invoice_id}",
                    params={"actor_name": "admin", "actor_role": "admin"})


class TestInvoiceAutoValidation:
    def test_create_invoice_with_validated_status(self):
        r = requests.post(
            f"{BASE_URL}/api/invoices",
            params={"actor_name": "AutoTestServer", "actor_role": "server"},
            json={
                "customer_name": "Test Auto",
                "items": [{"name": "Beer", "price": 500, "quantity": 1, "department": "bar", "unit": "unite"}],
                "subtotal": 500, "total": 500,
                "payment_method": "cash",
                "totals_by_department": {"bar": 500},
                "created_by": "AutoTestServer",
                "validation_status": "validated",
                "validated_by": "AutoTestServer",
                "validated_at": "2026-05-21T10:00:00Z",
            }
        )
        assert r.status_code == 200, r.text
        inv = r.json()["invoice"]
        assert inv["validation_status"] == "validated"
        assert inv["validated_by"] == "AutoTestServer"
        assert inv["validated_at"] == "2026-05-21T10:00:00Z"
        _cleanup(inv["id"])

    def test_create_invoice_default_pending_still_works(self):
        """Backward compat : sans validation_status, la facture reste en pending."""
        r = requests.post(
            f"{BASE_URL}/api/invoices",
            params={"actor_name": "Test", "actor_role": "server"},
            json={
                "customer_name": "Test Pending",
                "items": [{"name": "X", "price": 100, "quantity": 1, "department": "bar", "unit": "unite"}],
                "subtotal": 100, "total": 100,
                "payment_method": "cash",
                "totals_by_department": {"bar": 100},
                "created_by": "Test",
                # validation_status omitted - should default to pending
            }
        )
        assert r.status_code == 200
        inv = r.json()["invoice"]
        assert inv["validation_status"] == "pending"
        _cleanup(inv["id"])

    def test_auto_validation_default_fills_validated_at(self):
        """Si validation_status=validated sans validated_at, le backend remplit auto."""
        r = requests.post(
            f"{BASE_URL}/api/invoices",
            params={"actor_name": "Test", "actor_role": "server"},
            json={
                "customer_name": "Test Auto2",
                "items": [{"name": "Y", "price": 200, "quantity": 1, "department": "bar", "unit": "unite"}],
                "subtotal": 200, "total": 200,
                "payment_method": "cash",
                "totals_by_department": {"bar": 200},
                "created_by": "Test",
                "validation_status": "validated",
                # validated_by and validated_at OMITTED → backend fills them
            }
        )
        assert r.status_code == 200
        inv = r.json()["invoice"]
        assert inv["validation_status"] == "validated"
        assert inv["validated_by"] == "Test"  # uses created_by as fallback
        assert inv["validated_at"]  # not empty
        _cleanup(inv["id"])
