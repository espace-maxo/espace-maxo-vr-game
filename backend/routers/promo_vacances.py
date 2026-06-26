"""
Promo Vacances — Endpoints pour la promotion saisonnière "Vacances Maxo".

- `GET  /api/promo-vacances`              → renvoie la config (packs + flag actif)
- `PUT  /api/promo-vacances/toggle`       → admin active/désactive la promo
- `POST /api/promo-vacances/order`        → enregistre une intention de commande (pré-réservation)

La liste des packs est codée en dur côté serveur (changements rares).
Le compteur "X/100 restantes" est volontairement décoratif (faux décompte côté frontend
pour inciter à la conversion, comme demandé par l'utilisateur).
"""
from datetime import datetime, timezone
from typing import List, Optional
import os
import uuid
import logging

from fastapi import APIRouter, HTTPException, Body, Query
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)
router = APIRouter(tags=["promo-vacances"])

mongo_url = os.environ.get("MONGO_URL")
db_name = os.environ.get("DB_NAME")
_client = AsyncIOMotorClient(mongo_url)
db = _client[db_name]


# ─────────────── Catalogue statique des packs ───────────────

PROMO_PACKS = [
    {
        "id": "promo_vacances_25",
        "kind": "discount",
        "title": "Promo Vacances Maxo · -25%",
        "subtitle": "Réservez votre table en ligne",
        "highlight": "-25% sur votre addition",
        "price": None,
        "old_price": None,
        "image": "https://customer-assets.emergentagent.com/job_3de0f0c6-25b2-49f2-827d-b5127dbc79ab/artifacts/agb5ia56_PHOTO-2026-06-21-11-13-38.jpg",
        "description": "Minimum de consommation à partir de 10 000 FCFA. Offre valable pendant toute la durée des vacances. Réservation en ligne obligatoire.",
        "limit_100_first": False,
        "cta_label": "Réserver ma table",
        "booking_param": "promo_vacances_25",
    },
    {
        "id": "pack_game_fresh",
        "kind": "pack",
        "title": "Pack Game Fresh Maxo",
        "subtitle": "1 jeu au choix + 1 jus",
        "highlight": "2 000 FCFA",
        "price": 2000,
        "old_price": 3000,
        "image": "https://customer-assets.emergentagent.com/job_3de0f0c6-25b2-49f2-827d-b5127dbc79ab/artifacts/1l3ba1rv_PHOTO-2026-06-21-11-14-16.jpg",
        "description": "1 jeu au choix (VR 360 ou simulateur de courses) + 1 jus. Offre limitée pendant les vacances.",
        "limit_100_first": False,
        "included_games": 1,
        "included_players": 1,
        "cta_label": "Réserver le Pack Game Fresh",
        "booking_param": "pack_game_fresh",
    },
    {
        "id": "pack_solo_fun",
        "kind": "pack",
        "title": "Pack Solo Fun Maxo",
        "subtitle": "1 panini + 1 jeu au choix + 1 jus",
        "highlight": "3 500 FCFA",
        "price": 3500,
        "old_price": 5000,
        "regular_promo_price": 4000,
        "image": "https://customer-assets.emergentagent.com/job_3de0f0c6-25b2-49f2-827d-b5127dbc79ab/artifacts/c30zz192_PHOTO-2026-06-21-11-14-52.jpg",
        "description": "1 panini + 1 jeu au choix (VR 360 ou simulateur de courses) + 1 jus. 3 500 FCFA pour les 100 premières réservations (puis 4 000 FCFA).",
        "limit_100_first": True,
        "included_games": 1,
        "included_players": 1,
        "cta_label": "Réserver le Pack Solo Fun",
        "booking_param": "pack_solo_fun",
    },
    {
        "id": "pack_duo_snack_vr",
        "kind": "pack",
        "title": "Pack Duo Snack VR",
        "subtitle": "1 jeu VR + 1 burger + 1 chawarma + 2 jus",
        "highlight": "5 500 FCFA",
        "price": 5500,
        "old_price": 8500,
        "regular_promo_price": 6500,
        "image": "https://customer-assets.emergentagent.com/job_3de0f0c6-25b2-49f2-827d-b5127dbc79ab/artifacts/4hm69l6i_PHOTO-2026-06-21-11-15-27.jpg",
        "description": "1 jeu VR + 1 burger + 1 chawarma + 2 jus. 5 500 FCFA pour les 100 premières réservations (puis 6 500 FCFA).",
        "limit_100_first": True,
        "included_games": 1,
        "included_players": 2,
        "cta_label": "Réserver le Pack Duo Snack VR",
        "booking_param": "pack_duo_snack_vr",
    },
    {
        "id": "pack_fun_maxo_vacances",
        "kind": "pack",
        "title": "Pack Fun Maxo Vacances",
        "subtitle": "Pizza + VR + 2 jus",
        "highlight": "6 500 FCFA",
        "price": 6500,
        "old_price": 10000,
        "regular_promo_price": 7500,
        "image": "https://customer-assets.emergentagent.com/job_3de0f0c6-25b2-49f2-827d-b5127dbc79ab/artifacts/x9kbexuk_PHOTO-2026-06-21-11-15-48.jpg",
        "description": "1 Pizza Maxo + 1 jeu VR 360 + 2 jus au choix. 6 500 FCFA pour les 100 premières réservations (puis 7 500 FCFA).",
        "limit_100_first": True,
        "included_games": 1,
        "included_players": 2,
        "cta_label": "Réserver le Pack Fun Maxo",
        "booking_param": "pack_fun_maxo_vacances",
    },
]

SETTINGS_KEY = "promo_vacances"


async def _get_settings() -> dict:
    doc = await db.site_settings.find_one({"key": SETTINGS_KEY}, {"_id": 0})
    if not doc:
        return {"key": SETTINGS_KEY, "active": True, "updated_by": "", "updated_at": ""}
    return doc


# ─────────────── Endpoints ───────────────


@router.get("/promo-vacances")
async def get_promo_vacances():
    """Renvoie la liste des packs (avec overrides admin appliqués) et le flag d'activation."""
    try:
        settings = await _get_settings()
        # Charge les overrides admin par pack_id
        overrides = {}
        async for doc in db.promo_pack_overrides.find({}, {"_id": 0}):
            pid = doc.get("pack_id")
            if pid:
                # Retire les champs meta avant de merger
                clean = {k: v for k, v in doc.items() if k not in ("pack_id", "updated_at", "updated_by") and v not in (None, "")}
                overrides[pid] = clean
        # Merge : valeurs par défaut puis overrides (overrides priment sur les défauts)
        merged_packs = []
        for p in PROMO_PACKS:
            ov = overrides.get(p["id"], {})
            merged_packs.append({**p, **ov, "is_customized": p["id"] in overrides})
        return {
            "active": bool(settings.get("active", True)),
            "updated_by": settings.get("updated_by", ""),
            "updated_at": settings.get("updated_at", ""),
            "packs": merged_packs,
        }
    except Exception as e:
        logger.error(f"get_promo_vacances failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class PackUpdateBody(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    highlight: Optional[str] = None
    description: Optional[str] = None
    price: Optional[int] = None
    old_price: Optional[int] = None
    regular_promo_price: Optional[int] = None
    image: Optional[str] = None
    limit_100_first: Optional[bool] = None
    included_games: Optional[int] = None
    included_players: Optional[int] = None
    cta_label: Optional[str] = None
    actor_name: Optional[str] = ""


@router.put("/promo-vacances/pack/{pack_id}")
async def update_promo_pack(pack_id: str, body: PackUpdateBody = Body(...)):
    """Met à jour un pack (admin uniquement — UI réservée). Les champs non-fournis ne sont pas modifiés."""
    try:
        if not any(p["id"] == pack_id for p in PROMO_PACKS):
            raise HTTPException(status_code=404, detail="Pack inconnu")
        update_doc = {"pack_id": pack_id, "updated_at": datetime.now(timezone.utc).isoformat(),
                      "updated_by": (body.actor_name or "").strip() or "Admin"}
        # Garder uniquement les champs renseignés explicitement
        for field in ("title", "subtitle", "highlight", "description", "price", "old_price",
                      "regular_promo_price", "image", "limit_100_first", "included_games",
                      "included_players", "cta_label"):
            v = getattr(body, field, None)
            if v is not None:
                update_doc[field] = v.strip() if isinstance(v, str) else v
        await db.promo_pack_overrides.update_one({"pack_id": pack_id}, {"$set": update_doc}, upsert=True)
        return {"success": True, "pack_id": pack_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_promo_pack failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/promo-vacances/pack/{pack_id}")
async def reset_promo_pack(pack_id: str):
    """Restaure les valeurs par défaut d'un pack."""
    try:
        await db.promo_pack_overrides.delete_one({"pack_id": pack_id})
        return {"success": True}
    except Exception as e:
        logger.error(f"reset_promo_pack failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class ToggleBody(BaseModel):
    active: bool
    actor_name: Optional[str] = ""


@router.put("/promo-vacances/toggle")
async def toggle_promo_vacances(body: ToggleBody = Body(...)):
    """Admin active ou désactive la promo. Pas de check d'auth strict (UI réservée admin)."""
    try:
        now = datetime.now(timezone.utc).isoformat()
        await db.site_settings.update_one(
            {"key": SETTINGS_KEY},
            {"$set": {
                "key": SETTINGS_KEY,
                "active": bool(body.active),
                "updated_by": (body.actor_name or "").strip() or "Admin",
                "updated_at": now,
            }},
            upsert=True,
        )
        return {"success": True, "active": bool(body.active)}
    except Exception as e:
        logger.error(f"toggle_promo_vacances failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class PromoOrderBody(BaseModel):
    pack_id: str
    customer_name: str
    customer_phone: str
    customer_email: Optional[str] = ""
    date: Optional[str] = ""  # YYYY-MM-DD
    time_slot: Optional[str] = ""
    party_size: Optional[int] = 1
    notes: Optional[str] = ""


@router.post("/promo-vacances/order")
async def create_promo_order(body: PromoOrderBody = Body(...)):
    """Enregistre une intention de commande de pack (sans paiement direct).
    Le client est ensuite redirigé vers le flow de réservation/paiement classique.
    """
    try:
        pack = next((p for p in PROMO_PACKS if p["id"] == body.pack_id), None)
        if not pack:
            raise HTTPException(status_code=404, detail="Pack inconnu")

        order = {
            "id": str(uuid.uuid4()),
            "pack_id": body.pack_id,
            "pack_title": pack["title"],
            "pack_price": pack.get("price"),
            "customer_name": (body.customer_name or "").strip(),
            "customer_phone": (body.customer_phone or "").strip(),
            "customer_email": (body.customer_email or "").strip(),
            "date": body.date or "",
            "time_slot": body.time_slot or "",
            "party_size": int(body.party_size or 1),
            "notes": (body.notes or "").strip(),
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.promo_vacances_orders.insert_one(order)
        order.pop("_id", None)
        return {"success": True, "order": order}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"create_promo_order failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/promo-vacances/orders")
async def list_promo_orders(limit: int = Query(100, ge=1, le=500)):
    """Liste les commandes de packs (admin)."""
    try:
        items = await db.promo_vacances_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
        return {"orders": items, "total": len(items)}
    except Exception as e:
        logger.error(f"list_promo_orders failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
