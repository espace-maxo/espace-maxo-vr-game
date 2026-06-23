"""
Offline Pre-allocation Router (Phase 3)
========================================

Permet au frontend de réserver un lot de numéros de facture à l'avance pour
pouvoir en consommer un même en mode hors-ligne.

Format : `EM-{YYYYMMDD}-O{NNNN}`  (le `O` distingue les pré-allocations
des numéros séquentiels classiques, ce qui empêche toute collision).

Endpoints :
  - POST   /api/offline/preallocate?count=N         → réserve N numéros pour la journée courante
  - GET    /api/offline/preallocate/status          → état des réservations actives (last 100)
  - POST   /api/offline/preallocate/release         → libère les numéros non utilisés (cleanup)
"""
from datetime import datetime, timezone
from typing import Optional, List
import os
import logging

from fastapi import APIRouter, Body, HTTPException, Query
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)
router = APIRouter(tags=["offline-prealloc"])

mongo_url = os.environ.get("MONGO_URL")
db_name = os.environ.get("DB_NAME")
_client = AsyncIOMotorClient(mongo_url)
db = _client[db_name]


class PreallocBody(BaseModel):
    user: Optional[str] = None
    role: Optional[str] = None


def _today_yyyymmdd() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d")


async def _next_offline_seq(day_key: str, count: int) -> List[int]:
    """Increments atomically a per-day counter and returns N consecutive values."""
    doc = await db.offline_number_counters.find_one_and_update(
        {"date": day_key},
        {"$inc": {"seq": count}},
        upsert=True,
        return_document=True,  # AFTER
    )
    last = int(doc.get("seq") or 0)
    first = last - count + 1
    return list(range(first, last + 1))


@router.post("/offline/preallocate")
async def preallocate_numbers(
    count: int = Query(20, ge=1, le=200),
    body: PreallocBody = Body(default=PreallocBody()),
):
    """Réserve `count` numéros pour la journée et l'utilisateur. Limites :
    - count maximum : 200
    - les numéros suivent le format `EM-YYYYMMDD-O0001`
    """
    try:
        day = _today_yyyymmdd()
        seqs = await _next_offline_seq(day, count)
        now = datetime.now(timezone.utc).isoformat()
        numbers = [f"EM-{day}-O{n:04d}" for n in seqs]

        docs = [
            {
                "number": num,
                "date": day,
                "reserved_for": (body.user or "").strip(),
                "reserved_role": (body.role or "").strip(),
                "reserved_at": now,
                "used": False,
                "used_at": None,
                "invoice_id": None,
            }
            for num in numbers
        ]
        if docs:
            await db.offline_number_reservations.insert_many(docs)

        return {
            "success": True,
            "count": len(numbers),
            "numbers": numbers,
            "date": day,
            "reserved_at": now,
        }
    except Exception as e:
        logger.error(f"preallocate_numbers failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/offline/preallocate/status")
async def preallocate_status(limit: int = Query(100, ge=1, le=500), user: Optional[str] = None):
    """État global des réservations. Permet à l'Admin de surveiller les pré-allocations."""
    try:
        q = {}
        if user:
            q["reserved_for"] = user
        items = (
            await db.offline_number_reservations.find(q, {"_id": 0})
            .sort("reserved_at", -1)
            .to_list(limit)
        )
        total = await db.offline_number_reservations.count_documents(q or {})
        used = await db.offline_number_reservations.count_documents({**q, "used": True})
        return {
            "total": total,
            "used": used,
            "unused": total - used,
            "items": items,
        }
    except Exception as e:
        logger.error(f"preallocate_status failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/offline/preallocate/release")
async def preallocate_release(numbers: List[str] = Body(..., embed=True)):
    """Libère les numéros non utilisés (nettoyage côté client si jamais consommés)."""
    try:
        if not numbers:
            return {"released": 0}
        r = await db.offline_number_reservations.delete_many(
            {"number": {"$in": numbers}, "used": {"$ne": True}}
        )
        return {"released": r.deleted_count}
    except Exception as e:
        logger.error(f"preallocate_release failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def mark_offline_number_used(number: str, invoice_id: str) -> bool:
    """Marque un numéro pré-alloué comme consommé. Retourne True si la réservation
    existait et était disponible (donc le numéro est légitime), False sinon.
    """
    if not number or not number.startswith("EM-") or "-O" not in number:
        return True  # numéro standard, pas une réservation
    now = datetime.now(timezone.utc).isoformat()
    res = await db.offline_number_reservations.find_one_and_update(
        {"number": number, "used": {"$ne": True}},
        {"$set": {"used": True, "used_at": now, "invoice_id": invoice_id}},
        return_document=True,
    )
    return bool(res)
