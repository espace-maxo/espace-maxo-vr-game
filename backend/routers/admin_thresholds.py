"""
admin_thresholds.py — Seuils configurables des bons à crédit (Responsable Op. & Log, Direction).

Permet à l'admin de modifier en runtime :
- manager_monthly_cap   : plafond mensuel bons Responsable Op. (défaut 15 000 F)
- manager_discount_rate : remise % sur bons Responsable Op. (défaut 50%)
- director_monthly_cap  : plafond mensuel bons "la Direction" (défaut 0 = pas de plafond)
- director_discount_rate: remise % sur bons "la Direction" (défaut 50%)
- employee_monthly_cap  : plafond mensuel bons employé (défaut 10 000 F)
- employee_discount_rate: remise % bons employé (défaut 50%)

Stockage : collection MongoDB `caisse_thresholds` (singleton key='current').
"""
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging

logger = logging.getLogger(__name__)

mongo_url = os.environ["MONGO_URL"]
db_name = os.environ["DB_NAME"]
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

router = APIRouter()

DEFAULTS = {
    "manager_monthly_cap": 15000.0,
    "manager_discount_rate": 0.50,
    "director_monthly_cap": 0.0,  # 0 = pas de plafond
    "director_discount_rate": 0.50,
    "employee_monthly_cap": 10000.0,
    "employee_discount_rate": 0.50,
}


async def get_thresholds() -> dict:
    """Helper public : retourne les seuils actuels (merge defaults + override)."""
    doc = await db.caisse_thresholds.find_one({"key": "current"}, {"_id": 0})
    if not doc:
        return {**DEFAULTS}
    merged = {**DEFAULTS}
    for k in DEFAULTS:
        v = doc.get(k)
        if v is not None and v != "":
            try:
                merged[k] = float(v)
            except (ValueError, TypeError):
                pass
    return merged


class ThresholdsBody(BaseModel):
    manager_monthly_cap: Optional[float] = None
    manager_discount_rate: Optional[float] = None
    director_monthly_cap: Optional[float] = None
    director_discount_rate: Optional[float] = None
    employee_monthly_cap: Optional[float] = None
    employee_discount_rate: Optional[float] = None
    actor_name: Optional[str] = Field(default="Admin")


@router.get("/admin/caisse-thresholds")
async def api_get_thresholds():
    """Renvoie les seuils actuels + un flag indiquant si certains champs sont customisés."""
    thresholds = await get_thresholds()
    doc = await db.caisse_thresholds.find_one({"key": "current"}, {"_id": 0})
    return {
        **thresholds,
        "is_customized": bool(doc),
        "updated_at": (doc or {}).get("updated_at"),
        "updated_by": (doc or {}).get("updated_by"),
    }


@router.put("/admin/caisse-thresholds")
async def api_update_thresholds(body: ThresholdsBody = Body(...)):
    """Met à jour les seuils (admin uniquement — UI gérée côté frontend)."""
    update_doc = {
        "key": "current",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": (body.actor_name or "").strip() or "Admin",
    }
    for field in ("manager_monthly_cap", "manager_discount_rate",
                  "director_monthly_cap", "director_discount_rate",
                  "employee_monthly_cap", "employee_discount_rate"):
        v = getattr(body, field, None)
        if v is None:
            continue
        try:
            val = float(v)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail=f"{field} invalide")
        # Validation : caps >= 0, rates entre 0 et 1
        if "cap" in field and val < 0:
            raise HTTPException(status_code=400, detail=f"{field} doit être ≥ 0")
        if "rate" in field and (val < 0 or val > 1):
            raise HTTPException(status_code=400, detail=f"{field} doit être entre 0 et 1")
        update_doc[field] = val
    await db.caisse_thresholds.update_one({"key": "current"}, {"$set": update_doc}, upsert=True)
    return await api_get_thresholds()


@router.delete("/admin/caisse-thresholds")
async def api_reset_thresholds():
    """Restaure les valeurs par défaut."""
    await db.caisse_thresholds.delete_one({"key": "current"})
    return await api_get_thresholds()
