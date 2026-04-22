"""
Tips Router — Gestion des pourboires (Caisse Pro).

Par défaut : pool commun. Option : attribution à un serveur spécifique.
Modes de paiement : cash, mobile_money, card, other.
Lecture : admin & gérante voient tout ; serveur voit uniquement ses propres pourboires.

Collection: `tips`
Schema: { id, date (YYYY-MM-DD), amount, payment_method, attribution_type ('pool'|'server'),
          server_name, notes, created_by, created_by_role, created_at }
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta, date as date_cls
from typing import Optional, List
import uuid
import logging

router = APIRouter(tags=["tips"])
db = None
logger = logging.getLogger(__name__)


def set_db(database):
    global db
    db = database


VALID_PAYMENT_METHODS = {"cash", "mobile_money", "card", "other"}
VALID_ATTRIBUTIONS = {"pool", "server"}


class TipCreate(BaseModel):
    date: Optional[str] = None  # YYYY-MM-DD, default today
    amount: float
    payment_method: str = "cash"
    attribution_type: str = "pool"  # pool | server
    server_name: Optional[str] = None
    notes: Optional[str] = ""
    created_by: str


class TipUpdate(BaseModel):
    date: Optional[str] = None
    amount: Optional[float] = None
    payment_method: Optional[str] = None
    attribution_type: Optional[str] = None
    server_name: Optional[str] = None
    notes: Optional[str] = None


def _iso_today() -> str:
    return date_cls.today().isoformat()


def _week_start(iso_date: str) -> str:
    d = datetime.fromisoformat(iso_date).date()
    monday = d - timedelta(days=d.weekday())
    return monday.isoformat()


@router.get("/tips")
async def list_tips(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    server: Optional[str] = Query(None, description="Filter by server_name (exact match)"),
    attribution: Optional[str] = None,
):
    """List tips with optional filters. Used by admin/manager for full list,
    and by server with server=<name> to get their own.
    """
    try:
        query = {}
        if date_from or date_to:
            rng = {}
            if date_from:
                rng["$gte"] = date_from
            if date_to:
                rng["$lte"] = date_to
            query["date"] = rng
        if server:
            query["server_name"] = server
        if attribution and attribution in VALID_ATTRIBUTIONS:
            query["attribution_type"] = attribution
        items = await db.tips.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)
        return {"tips": items}
    except Exception as e:
        logger.error(f"Error listing tips: {e}")
        raise HTTPException(500, str(e))


@router.post("/tips")
async def create_tip(data: TipCreate):
    try:
        if data.payment_method not in VALID_PAYMENT_METHODS:
            raise HTTPException(400, f"payment_method invalide ({data.payment_method})")
        if data.attribution_type not in VALID_ATTRIBUTIONS:
            raise HTTPException(400, f"attribution_type invalide ({data.attribution_type})")
        if data.amount is None or data.amount <= 0:
            raise HTTPException(400, "Montant requis (> 0)")
        if data.attribution_type == "server" and not (data.server_name or "").strip():
            raise HTTPException(400, "server_name requis lorsque attribution_type='server'")

        doc = {
            "id": str(uuid.uuid4()),
            "date": data.date or _iso_today(),
            "amount": float(data.amount),
            "payment_method": data.payment_method,
            "attribution_type": data.attribution_type,
            "server_name": (data.server_name or "").strip() if data.attribution_type == "server" else None,
            "notes": data.notes or "",
            "created_by": data.created_by,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.tips.insert_one(doc)
        doc.pop("_id", None)
        return {"success": True, "tip": doc}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating tip: {e}")
        raise HTTPException(500, str(e))


@router.put("/tips/{tip_id}")
async def update_tip(tip_id: str, data: TipUpdate):
    try:
        existing = await db.tips.find_one({"id": tip_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Pourboire non trouvé")
        update = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
        if "payment_method" in update and update["payment_method"] not in VALID_PAYMENT_METHODS:
            raise HTTPException(400, "payment_method invalide")
        if "attribution_type" in update and update["attribution_type"] not in VALID_ATTRIBUTIONS:
            raise HTTPException(400, "attribution_type invalide")
        # Coherence: if final attribution is server, server_name must be present
        final_attr = update.get("attribution_type", existing.get("attribution_type"))
        final_server = update.get("server_name", existing.get("server_name"))
        if final_attr == "server" and not (final_server or "").strip():
            raise HTTPException(400, "server_name requis pour attribution 'server'")
        if final_attr == "pool":
            update["server_name"] = None
        if "amount" in update:
            update["amount"] = float(update["amount"])
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.tips.update_one({"id": tip_id}, {"$set": update})
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating tip: {e}")
        raise HTTPException(500, str(e))


@router.delete("/tips/{tip_id}")
async def delete_tip(tip_id: str):
    try:
        res = await db.tips.delete_one({"id": tip_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Pourboire non trouvé")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting tip: {e}")
        raise HTTPException(500, str(e))


@router.get("/tips/summary")
async def tips_summary(
    date: Optional[str] = None,
    server: Optional[str] = None,
):
    """Aggregate summary for today + week of the given date, plus ranking per server.
    If `server` is set, returns only summary/ranking restricted to that server (for servers).
    """
    try:
        target = date or _iso_today()
        week_start = _week_start(target)
        d = datetime.fromisoformat(target).date()
        week_end = (d + timedelta(days=6 - d.weekday())).isoformat()

        base = {}
        if server:
            base["server_name"] = server

        # Fetch day + week rows
        day_rows = await db.tips.find({**base, "date": target}, {"_id": 0}).to_list(2000)
        week_rows = await db.tips.find({**base, "date": {"$gte": week_start, "$lte": week_end}}, {"_id": 0}).to_list(5000)

        def _summarize(rows):
            total = sum(r.get("amount", 0) or 0 for r in rows)
            pool = sum(r.get("amount", 0) or 0 for r in rows if r.get("attribution_type") == "pool")
            server_total = total - pool
            by_method = {}
            for r in rows:
                m = r.get("payment_method", "cash")
                by_method[m] = by_method.get(m, 0) + (r.get("amount", 0) or 0)
            return {
                "count": len(rows),
                "total": total,
                "pool_total": pool,
                "server_total": server_total,
                "by_payment_method": by_method,
            }

        # Ranking: servers only (attribution_type=server) within the week
        ranking_map = {}
        for r in week_rows:
            if r.get("attribution_type") == "server" and r.get("server_name"):
                s = r["server_name"]
                entry = ranking_map.setdefault(s, {"server_name": s, "count": 0, "total": 0})
                entry["count"] += 1
                entry["total"] += r.get("amount", 0) or 0
        ranking = sorted(ranking_map.values(), key=lambda x: x["total"], reverse=True)

        return {
            "date": target,
            "week_start": week_start,
            "week_end": week_end,
            "day": _summarize(day_rows),
            "week": _summarize(week_rows),
            "ranking": ranking,
        }
    except Exception as e:
        logger.error(f"Error building tips summary: {e}")
        raise HTTPException(500, str(e))
