"""
Sync Snapshot — Renvoie en un appel toutes les données nécessaires au mode
hors-ligne (Phase 1 du mode offline).

Endpoint principal : GET /api/sync/snapshot
Contenu :
  - products        : catalogue produits (caisse_products)
  - clients         : clients enregistrés
  - tables          : tables (caisse_tables)
  - users           : autres utilisateurs (caisse_users) pour PIN local
  - day_opening     : état de la journée en cours
  - quick_products  : produits rapides (pour menus / bar)
  - menu_items      : items menu (combos / formules)
  - games           : jeux (location, billard, etc.)
  - settings        : flags actifs (kill-switches, etc.)
  - server_time     : horodatage serveur (pour synchroniser les horloges)

Tout est en lecture seule. Aucune ObjectId n'est renvoyé.
"""
from datetime import datetime, timezone
from typing import Optional
import os

from fastapi import APIRouter, Query
from motor.motor_asyncio import AsyncIOMotorClient

router = APIRouter(tags=["sync"])

mongo_url = os.environ.get("MONGO_URL")
db_name = os.environ.get("DB_NAME")
db_client = AsyncIOMotorClient(mongo_url)
db = db_client[db_name]


async def _safe_list(collection: str, limit: int = 10000) -> list:
    """Liste tous les documents d'une collection sans _id."""
    try:
        return await db[collection].find({}, {"_id": 0}).to_list(limit)
    except Exception:
        return []


@router.get("/sync/snapshot")
async def sync_snapshot(role: Optional[str] = Query(None)):
    """Renvoie le snapshot complet pour le mode hors-ligne."""
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    products = await _safe_list("caisse_products", 5000)
    clients = await _safe_list("caisse_clients", 5000)
    tables = await _safe_list("caisse_tables", 1000)
    users = await _safe_list("caisse_users", 200)
    quick_products = await _safe_list("quick_products", 2000)
    menu_items = await _safe_list("menu_items", 2000)
    games = await _safe_list("games", 500)
    product_packages = await _safe_list("product_packages", 1000)

    # Strip sensitive fields from users (no password hash sent)
    sanitized_users = []
    for u in users:
        sanitized_users.append({
            "id": u.get("id"),
            "username": u.get("username"),
            "full_name": u.get("full_name"),
            "role": u.get("role"),
            "active": u.get("active", True),
            # NB: on conserve pin_hash pour permettre la vérification locale
            # côté frontend uniquement si offline (vérification cryptographique)
            "pin_hash": u.get("pin_hash"),
        })

    # Journée en cours
    day_opening = await db.day_openings.find_one(
        {"date": today_str}, {"_id": 0}
    )

    return {
        "snapshot_id": str(datetime.now(timezone.utc).timestamp()),
        "server_time": datetime.now(timezone.utc).isoformat(),
        "today": today_str,
        "products": products,
        "clients": clients,
        "tables": tables,
        "users": sanitized_users,
        "quick_products": quick_products,
        "menu_items": menu_items,
        "games": games,
        "product_packages": product_packages,
        "day_opening": day_opening,
        "counts": {
            "products": len(products),
            "clients": len(clients),
            "tables": len(tables),
            "users": len(sanitized_users),
            "quick_products": len(quick_products),
            "menu_items": len(menu_items),
            "games": len(games),
        },
    }


@router.get("/sync/ping")
async def sync_ping():
    """Petit ping rapide pour vérifier la connectivité serveur."""
    return {
        "ok": True,
        "server_time": datetime.now(timezone.utc).isoformat(),
    }
