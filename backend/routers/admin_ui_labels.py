"""
admin_ui_labels.py — Stockage MongoDB des libellés personnalisables côté Admin.

Pour l'instant : titre + description du modal "Ajouter un produit" de la Caisse.
Extensible à d'autres modales facilement (la clé `key` identifie l'écran).
"""
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field
from typing import Optional
import logging
import os
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)

mongo_url = os.environ["MONGO_URL"]
db_name = os.environ["DB_NAME"]
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

router = APIRouter()


DEFAULTS = {
    "caisse_product_add": {
        "title_create": "Ajouter un produit",
        "title_edit": "Modifier le produit",
        "description": "",
    },
}


class UILabelsBody(BaseModel):
    key: str
    title_create: Optional[str] = None
    title_edit: Optional[str] = None
    description: Optional[str] = None
    actor_name: Optional[str] = Field(default="Admin")


@router.get("/admin/ui-labels/{key}")
async def get_ui_labels(key: str):
    """Récupère les libellés personnalisés pour un écran donné (avec fallback sur les défauts)."""
    if key not in DEFAULTS:
        raise HTTPException(status_code=404, detail=f"Clé inconnue : {key}")
    doc = await db.admin_ui_labels.find_one({"key": key}, {"_id": 0})
    defaults = DEFAULTS[key]
    if not doc:
        return {"key": key, **defaults, "is_custom": False}
    # Merge avec les défauts pour les champs absents
    merged = {**defaults, **{k: v for k, v in doc.items() if v not in (None, "")}}
    merged["key"] = key
    merged["is_custom"] = True
    return merged


@router.put("/admin/ui-labels/{key}")
async def update_ui_labels(key: str, body: UILabelsBody = Body(...)):
    """Met à jour les libellés (admin uniquement — pas d'auth ici car déjà gérée à l'entrée caisse)."""
    if key not in DEFAULTS:
        raise HTTPException(status_code=404, detail=f"Clé inconnue : {key}")
    payload = {
        "key": key,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "actor_name": body.actor_name or "Admin",
    }
    for field in ("title_create", "title_edit", "description"):
        v = getattr(body, field, None)
        if v is not None:
            payload[field] = v.strip()
    await db.admin_ui_labels.update_one({"key": key}, {"$set": payload}, upsert=True)
    return await get_ui_labels(key)


@router.delete("/admin/ui-labels/{key}")
async def reset_ui_labels(key: str):
    """Restaure les libellés par défaut."""
    if key not in DEFAULTS:
        raise HTTPException(status_code=404, detail=f"Clé inconnue : {key}")
    await db.admin_ui_labels.delete_one({"key": key})
    return await get_ui_labels(key)
