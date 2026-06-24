"""
Site Notifications Aggregator (Admin)
======================================

Endpoint unifié qui agrège toutes les notifications côté Admin venant
du site public (www.espacemaxo.com) :
  - Réservations de table (collection `bookings`)
  - Commandes de packs promo (collection `promo_vacances_orders`)
  - Avis clients (collection `customer_reviews`)
  - Provisions Mobile Money / wallet (collection `wallet_transactions`)
  - Candidatures "Nous rejoindre" (collection `join_requests`)

Endpoints :
  - GET  /api/admin/site-notifications        → liste + compteurs (par type)
  - POST /api/admin/site-notifications/mark-read → marque comme lu un item donné
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, List
import os
import logging

from fastapi import APIRouter, HTTPException, Body, Query
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)
router = APIRouter(tags=["admin-notifications"])

mongo_url = os.environ.get("MONGO_URL")
db_name = os.environ.get("DB_NAME")
_client = AsyncIOMotorClient(mongo_url)
db = _client[db_name]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _is_read(item_type: str, item_id: str) -> bool:
    doc = await db.admin_notif_reads.find_one({"type": item_type, "id": item_id})
    return bool(doc)


async def _enrich_read_status(items: List[dict], item_type: str) -> List[dict]:
    if not items:
        return items
    ids = [i["id"] for i in items if i.get("id")]
    reads = set()
    async for r in db.admin_notif_reads.find(
        {"type": item_type, "id": {"$in": ids}}, {"_id": 0, "id": 1}
    ):
        reads.add(r["id"])
    for it in items:
        it["read"] = it.get("id") in reads
    return items


def _bbox(s: Optional[str], limit: int = 120) -> str:
    s = (s or "").strip()
    return s[: limit - 1] + "…" if len(s) > limit else s


@router.get("/admin/site-notifications")
async def list_site_notifications(
    since_hours: int = Query(168, ge=1, le=2160, description="Plage temporelle (h)"),
    limit_per_type: int = Query(20, ge=1, le=100),
):
    """Renvoie un résumé + les items récents par type."""
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=since_hours)).isoformat()

        # ─── Réservations (bookings) ───
        bookings_raw = await db.bookings.find(
            {"created_at": {"$gte": cutoff}}, {"_id": 0}
        ).sort("created_at", -1).to_list(limit_per_type)
        bookings = [
            {
                "id": b.get("id"),
                "type": "booking",
                "title": b.get("customer_name") or "Réservation",
                "subtitle": (
                    f"{b.get('date', '')} {b.get('time_slot', '')} · "
                    f"{b.get('number_of_players', 1)} joueur(s) · {b.get('customer_phone', '')}"
                ),
                "amount": b.get("total_amount"),
                "status": b.get("payment_status") or b.get("status") or "pending",
                "created_at": b.get("created_at"),
            }
            for b in bookings_raw
        ]
        bookings = await _enrich_read_status(bookings, "booking")

        # ─── Commandes packs promo ───
        promo_raw = await db.promo_vacances_orders.find(
            {"created_at": {"$gte": cutoff}}, {"_id": 0}
        ).sort("created_at", -1).to_list(limit_per_type)
        promos = [
            {
                "id": p.get("id"),
                "type": "promo_order",
                "title": p.get("customer_name") or "Commande Pack",
                "subtitle": (
                    f"{p.get('pack_title', '')} · {p.get('pack_price') or 0} F · "
                    f"{p.get('date', '')} {p.get('time_slot', '')} · {p.get('customer_phone', '')}"
                ),
                "amount": p.get("pack_price"),
                "status": p.get("status") or "pending",
                "created_at": p.get("created_at"),
            }
            for p in promo_raw
        ]
        promos = await _enrich_read_status(promos, "promo_order")

        # ─── Avis clients ───
        reviews_raw = await db.customer_reviews.find(
            {"created_at": {"$gte": cutoff}}, {"_id": 0}
        ).sort("created_at", -1).to_list(limit_per_type)
        reviews = [
            {
                "id": r.get("id"),
                "type": "review",
                "title": f"{r.get('customer_name') or 'Anonyme'} · {r.get('rating', 0)}★",
                "subtitle": _bbox(r.get("comment"), 160),
                "amount": None,
                "status": r.get("status") or "new",
                "created_at": r.get("created_at"),
            }
            for r in reviews_raw
        ]
        reviews = await _enrich_read_status(reviews, "review")

        # ─── Provisions wallet (Mobile Money) ───
        wallet_raw = await db.wallet_transactions.find(
            {"created_at": {"$gte": cutoff}, "kind": {"$in": ["provision", "deposit", "credit"]}},
            {"_id": 0},
        ).sort("created_at", -1).to_list(limit_per_type)
        wallets = [
            {
                "id": w.get("id"),
                "type": "wallet",
                "title": w.get("customer_name") or w.get("customer_phone") or "Provision",
                "subtitle": (
                    f"{w.get('amount', 0)} F · {w.get('provider', 'Mobile Money')} · "
                    f"{w.get('reference', '')}"
                ),
                "amount": w.get("amount"),
                "status": w.get("status") or "pending",
                "created_at": w.get("created_at"),
            }
            for w in wallet_raw
        ]
        wallets = await _enrich_read_status(wallets, "wallet")

        # ─── Candidatures "Nous rejoindre" ───
        joins_raw = await db.join_requests.find(
            {"created_at": {"$gte": cutoff}}, {"_id": 0}
        ).sort("created_at", -1).to_list(limit_per_type)
        joins = [
            {
                "id": j.get("id"),
                "type": "join",
                "title": j.get("full_name") or j.get("name") or "Candidature",
                "subtitle": (
                    f"{j.get('position') or j.get('role') or 'Candidature'} · {j.get('phone', '')} · "
                    f"{j.get('email', '')}"
                ),
                "amount": None,
                "status": j.get("status") or "new",
                "created_at": j.get("created_at"),
            }
            for j in joins_raw
        ]
        joins = await _enrich_read_status(joins, "join")

        # Fusion + tri global pour la cloche
        all_items = bookings + promos + reviews + wallets + joins
        all_items.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        unread_total = sum(1 for x in all_items if not x.get("read"))

        return {
            "summary": {
                "bookings": {"total": len(bookings), "unread": sum(1 for x in bookings if not x.get("read"))},
                "promo_orders": {"total": len(promos), "unread": sum(1 for x in promos if not x.get("read"))},
                "reviews": {"total": len(reviews), "unread": sum(1 for x in reviews if not x.get("read"))},
                "wallets": {"total": len(wallets), "unread": sum(1 for x in wallets if not x.get("read"))},
                "joins": {"total": len(joins), "unread": sum(1 for x in joins if not x.get("read"))},
                "unread_total": unread_total,
            },
            "items": all_items[: limit_per_type * 3],
            "by_type": {
                "bookings": bookings,
                "promo_orders": promos,
                "reviews": reviews,
                "wallets": wallets,
                "joins": joins,
            },
        }
    except Exception as e:
        logger.error(f"list_site_notifications failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class MarkReadBody(BaseModel):
    type: str
    id: str
    actor_name: Optional[str] = ""


@router.post("/admin/site-notifications/mark-read")
async def mark_site_notification_read(body: MarkReadBody = Body(...)):
    """Marque une notification comme lue (idempotent)."""
    try:
        await db.admin_notif_reads.update_one(
            {"type": body.type, "id": body.id},
            {"$set": {"type": body.type, "id": body.id, "read_at": _now_iso(), "actor_name": body.actor_name or ""}},
            upsert=True,
        )
        return {"success": True}
    except Exception as e:
        logger.error(f"mark_site_notification_read failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/site-notifications/mark-all-read")
async def mark_all_read(body: dict = Body(default={})):
    """Marque tout comme lu (clear de la cloche)."""
    try:
        since_hours = int(body.get("since_hours") or 168)
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=since_hours)).isoformat()
        actor = (body.get("actor_name") or "Admin").strip() or "Admin"

        collections = {
            "booking": "bookings",
            "promo_order": "promo_vacances_orders",
            "review": "customer_reviews",
            "wallet": "wallet_transactions",
            "join": "join_requests",
        }
        operations = []
        for t, col in collections.items():
            cur = db[col].find({"created_at": {"$gte": cutoff}}, {"_id": 0, "id": 1})
            async for d in cur:
                if d.get("id"):
                    operations.append({"type": t, "id": d["id"]})

        for op in operations:
            await db.admin_notif_reads.update_one(
                {"type": op["type"], "id": op["id"]},
                {"$set": {"type": op["type"], "id": op["id"], "read_at": _now_iso(), "actor_name": actor}},
                upsert=True,
            )
        return {"success": True, "marked": len(operations)}
    except Exception as e:
        logger.error(f"mark_all_read failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
