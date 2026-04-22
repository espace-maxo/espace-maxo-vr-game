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


async def _admin_counts() -> dict:
    today = date_cls.today().isoformat()
    # Parallel-safe Motor calls
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
    # Unread notes (for admin, count notes with read=false targeted to admin or broadcast)
    try:
        notes_unread = await db.instructions.count_documents({
            "$and": [
                {"$or": [{"read": False}, {"read": {"$exists": False}}]},
                {"sender_role": {"$ne": "admin"}},
            ]
        })
    except Exception:
        notes_unread = 0

    return {
        "needs": needs_pending,
        "purchase_orders": po_draft,
        "expenses": expenses_pending,
        "cancellation_requests": cancellation_pending,
        "modification_requests": modification_pending,
        "invoices": invoices_pending,
        "financial_points": fp_pending,
        "tips_today": tips_today,
        "notes": notes_unread,
    }


async def _manager_counts(user_name: Optional[str] = None) -> dict:
    # Manager: achats à réviser + notes admin non lues + BC récents (sent)
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
    return {
        "expenses": expenses_revision,
        "purchase_orders": po_sent,
        "invoices": invoices_pending,
        "notes": notes_unread,
    }


async def _server_counts(user_name: Optional[str] = None) -> dict:
    # Server: unread notes targeted to them + their own pending tips count (info)
    try:
        notes_unread = await db.instructions.count_documents({
            "$and": [
                {"$or": [{"read": False}, {"read": {"$exists": False}}]},
                {"sender_role": {"$ne": "server"}},
            ]
        })
    except Exception:
        notes_unread = 0
    return {"notes": notes_unread}


@router.get("/notifications/counts")
async def notifications_counts(
    role: str = Query("admin", description="admin | manager | server"),
    user: Optional[str] = None,
):
    try:
        if role == "admin":
            counts = await _admin_counts()
        elif role == "manager":
            counts = await _manager_counts(user)
        else:
            counts = await _server_counts(user)
        total = sum(counts.values())
        return {"role": role, "counts": counts, "total": total}
    except Exception as e:
        logger.error(f"notifications/counts error: {e}")
        raise HTTPException(500, str(e))
