"""
Notifications Router — Compteurs agrégés pour badges UI.

GET /api/notifications/counts?role=<admin|manager|server>&user=<name>
 → renvoie un dict de compteurs utiles pour afficher des badges animés
   sur la barre d'onglets.

Lightweight : compte seulement, pas de payload volumineux.
"""
from fastapi import APIRouter, HTTPException, Query
from datetime import date as date_cls
from typing import Optional
import logging

router = APIRouter(tags=["notifications"])
db = None
logger = logging.getLogger(__name__)


def set_db(database):
    global db
    db = database


async def _latest_date(collection_name: str, query: dict) -> str:
    """Return ISO created_at of the most recent document matching query, or empty string."""
    try:
        doc = await db[collection_name].find_one(query, sort=[("created_at", -1)])
        if not doc:
            return ""
        return doc.get("created_at") or ""
    except Exception:
        return ""


async def _admin_counts() -> dict:
    today = date_cls.today().isoformat()
    needs_pending = await db.needs.count_documents({"status": "en_attente"})
    po_draft = await db.purchase_orders.count_documents({"status": "draft"})
    expenses_pending = await db.expenses.count_documents({
        "status": {"$in": ["pending", "revision_requested"]}
    })
    cancellation_pending = await db.cancellation_requests.count_documents({"status": "pending"})
    modification_pending = await db.modification_requests.count_documents({"status": "pending"})
    invoices_pending = await db.invoices.count_documents({"validation_status": "pending"})
    fp_pending = await db.financial_points.count_documents({
        "signed": True,
        "admin_validated": False,
    })
    tips_today = await db.tips.count_documents({"date": today})
    try:
        notes_unread = await db.instructions.count_documents({
            "$and": [
                {"$or": [{"read": False}, {"read": {"$exists": False}}]},
                {"sender_role": {"$ne": "admin"}},
            ]
        })
    except Exception:
        notes_unread = 0

    # Latest timestamps per category
    latest = {
        "needs": await _latest_date("needs", {"status": "en_attente"}),
        "purchase_orders": await _latest_date("purchase_orders", {"status": "draft"}),
        "expenses": await _latest_date("expenses", {"status": {"$in": ["pending", "revision_requested"]}}),
        "cancellation_requests": await _latest_date("cancellation_requests", {"status": "pending"}),
        "modification_requests": await _latest_date("modification_requests", {"status": "pending"}),
        "invoices": await _latest_date("invoices", {"validation_status": "pending"}),
        "financial_points": await _latest_date("financial_points", {"signed": True, "admin_validated": False}),
        "tips_today": await _latest_date("tips", {"date": today}),
        "notes": await _latest_date("instructions", {"sender_role": {"$ne": "admin"}}),
    }

    return {
        "counts": {
            "needs": needs_pending,
            "purchase_orders": po_draft,
            "expenses": expenses_pending,
            "cancellation_requests": cancellation_pending,
            "modification_requests": modification_pending,
            "invoices": invoices_pending,
            "financial_points": fp_pending,
            "tips_today": tips_today,
            "notes": notes_unread,
        },
        "latest_by_category": latest,
    }


async def _manager_counts(user_name: Optional[str] = None) -> dict:
    expenses_revision = await db.expenses.count_documents({"status": "revision_requested"})
    po_sent = await db.purchase_orders.count_documents({"status": "sent"})
    invoices_pending = await db.invoices.count_documents({"validation_status": "pending"})
    try:
        notes_unread = await db.instructions.count_documents({
            "$and": [
                {"$or": [{"read": False}, {"read": {"$exists": False}}]},
                {"sender_role": "admin"},
            ]
        })
    except Exception:
        notes_unread = 0
    latest = {
        "expenses": await _latest_date("expenses", {"status": "revision_requested"}),
        "purchase_orders": await _latest_date("purchase_orders", {"status": "sent"}),
        "invoices": await _latest_date("invoices", {"validation_status": "pending"}),
        "notes": await _latest_date("instructions", {"sender_role": "admin"}),
    }
    return {
        "counts": {
            "expenses": expenses_revision,
            "purchase_orders": po_sent,
            "invoices": invoices_pending,
            "notes": notes_unread,
        },
        "latest_by_category": latest,
    }


async def _server_counts(user_name: Optional[str] = None) -> dict:
    try:
        notes_unread = await db.instructions.count_documents({
            "$and": [
                {"$or": [{"read": False}, {"read": {"$exists": False}}]},
                {"sender_role": {"$ne": "server"}},
            ]
        })
    except Exception:
        notes_unread = 0
    latest = {
        "notes": await _latest_date("instructions", {"sender_role": {"$ne": "server"}}),
    }
    return {"counts": {"notes": notes_unread}, "latest_by_category": latest}


@router.get("/notifications/counts")
async def notifications_counts(
    role: str = Query("admin", description="admin | manager | server"),
    user: Optional[str] = None,
):
    try:
        if role == "admin":
            result = await _admin_counts()
        elif role == "manager":
            result = await _manager_counts(user)
        else:
            result = await _server_counts(user)
        counts = result["counts"]
        total = sum(counts.values())
        return {
            "role": role,
            "counts": counts,
            "latest_by_category": result["latest_by_category"],
            "total": total,
        }
    except Exception as e:
        logger.error(f"notifications/counts error: {e}")
        raise HTTPException(500, str(e))
