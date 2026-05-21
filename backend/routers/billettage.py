"""
Billettage Global Router — billettage unique par jour pour tous les reversements.

Workflow :
- Un seul billettage (cash count) par date, partagé entre les 4 catégories de reversement.
- Stocke les dénominations (10 000 / 5 000 / 2 000 / 1 000 / 500 / 200 / 100 / 50 / 25 / 10 / 5).
- Le total des espèces du billettage est comparé à la somme attendue des cash_amount
  des 4 reversements (Bar + Menu + Jeux + Locations) pour réconciliation.

Collection MongoDB : billettage_global
{
  id, date, denominations: {10000: int, 5000: int, ...}, total,
  created_by, created_at, updated_at, updated_by, notes
}
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict

from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel

router = APIRouter(tags=["billettage"])
db = None
logger = logging.getLogger(__name__)


def set_db(database):
    global db
    db = database


# Dénominations FCFA (Afrique de l'Ouest) — pièces et billets standard.
ALLOWED_DENOMINATIONS = {10000, 5000, 2000, 1000, 500, 200, 100, 50, 25, 10, 5}


class BillettageUpsert(BaseModel):
    date: str  # YYYY-MM-DD
    denominations: Dict[str, int] = {}  # {"10000": 3, "5000": 5, ...}
    notes: Optional[str] = ""
    actor_name: Optional[str] = ""


def _compute_total(denominations: Dict[str, int]) -> int:
    total = 0
    for k, v in (denominations or {}).items():
        try:
            denom = int(k)
            qty = int(v or 0)
            if denom in ALLOWED_DENOMINATIONS and qty >= 0:
                total += denom * qty
        except (ValueError, TypeError):
            continue
    return total


@router.get("/billettage/{date}")
async def get_billettage(date: str):
    """Retourne le billettage global du jour. Crée un vide si inexistant."""
    try:
        b = await db.billettage_global.find_one({"date": date}, {"_id": 0})
        if not b:
            return {
                "date": date,
                "denominations": {},
                "total": 0,
                "exists": False,
            }
        b["exists"] = True
        return b
    except Exception as e:
        logger.error(f"Error fetching billettage for {date}: {e}")
        raise HTTPException(500, str(e))


@router.post("/billettage")
async def upsert_billettage(data: BillettageUpsert):
    """Crée ou met à jour le billettage global d'une date."""
    try:
        total = _compute_total(data.denominations)
        now = datetime.now(timezone.utc).isoformat()
        existing = await db.billettage_global.find_one({"date": data.date}, {"_id": 0})

        if existing:
            await db.billettage_global.update_one(
                {"date": data.date},
                {"$set": {
                    "denominations": data.denominations or {},
                    "total": total,
                    "notes": data.notes or "",
                    "updated_at": now,
                    "updated_by": data.actor_name or "",
                }},
            )
            doc = await db.billettage_global.find_one({"date": data.date}, {"_id": 0})
            return {"success": True, "billettage": doc}

        doc = {
            "id": str(uuid.uuid4()),
            "date": data.date,
            "denominations": data.denominations or {},
            "total": total,
            "notes": data.notes or "",
            "created_at": now,
            "created_by": data.actor_name or "",
            "updated_at": now,
            "updated_by": data.actor_name or "",
        }
        await db.billettage_global.insert_one(doc)
        doc.pop("_id", None)
        logger.info(f"Billettage global créé pour {data.date} ({total} F)")
        return {"success": True, "billettage": doc}
    except Exception as e:
        logger.error(f"Error upserting billettage: {e}")
        raise HTTPException(500, str(e))


@router.get("/billettage/{date}/reconciliation")
async def billettage_reconciliation(date: str):
    """Réconcile le billettage global avec la somme des cash_amount des 4 reversements du jour.
    Retourne :
    - counted : total espèces compté (billettage)
    - expected : somme des cash_amount des 4 reversements daily du jour
    - difference : counted - expected
    - by_category : détail par catégorie
    """
    try:
        bill = await db.billettage_global.find_one({"date": date}, {"_id": 0})
        counted = bill.get("total", 0) if bill else 0

        points = await db.financial_points.find(
            {"date": date, "period_type": "daily"}, {"_id": 0}
        ).to_list(20)

        expected = 0
        by_category = {}
        for p in points:
            cat = p.get("category", "all")
            cash = p.get("cash_amount", 0) or 0
            expected += cash
            by_category[cat] = {
                "cash_amount": cash,
                "total_amount": p.get("total_amount", 0),
                "status": p.get("status", "pending"),
                "signed": bool(p.get("signed")),
                "admin_validated": bool(p.get("admin_validated")),
            }

        return {
            "date": date,
            "counted": counted,
            "expected": expected,
            "difference": counted - expected,
            "by_category": by_category,
            "billettage_exists": bool(bill),
        }
    except Exception as e:
        logger.error(f"Error reconciling billettage: {e}")
        raise HTTPException(500, str(e))
