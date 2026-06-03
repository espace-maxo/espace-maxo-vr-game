"""
Routeur Maintenance — opérations administratives sensibles.

Toutes les routes ici exigent :
  - actor_role = "admin"
  - password = mot de passe Admin Full (vérifié via verify_admin_password)

Les opérations sont **non destructives** : on marque les documents `archived: True`
avec horodatage et auteur, de sorte qu'on peut toujours retrouver l'historique
en passant `include_archived=true` aux endpoints concernés.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

router = APIRouter(tags=["maintenance"])

db: Optional[AsyncIOMotorDatabase] = None


def set_db(database: AsyncIOMotorDatabase):
    global db
    db = database


class MaintenanceResetBody(BaseModel):
    actor_role: str = Field(..., description="Doit être 'admin'")
    actor_name: Optional[str] = None
    password: str = Field(..., description="Mot de passe Admin Full")


@router.post("/admin/maintenance/reset-purchases")
async def reset_purchases(body: MaintenanceResetBody):
    """Archive (remise à zéro) toutes les demandes d'Achats + tous les articles
    de l'Appro Manager. Les documents restent en base avec `archived: True`,
    `archived_at`, `archived_by` — donc consultables via `include_archived=true`.

    L'historique des prix (`purchase_price_history`) est **conservé**.
    """
    # Import paresseux pour éviter une dépendance circulaire avec server.py
    from server import verify_admin_password

    if body.actor_role != "admin":
        raise HTTPException(403, "Action réservée à l'administrateur")
    role = verify_admin_password(body.password or "")
    if role != "admin_full":
        raise HTTPException(401, "Mot de passe administrateur invalide ou accès en lecture seule")

    now_iso = datetime.now(timezone.utc).isoformat()
    by = body.actor_name or "Admin"

    expenses_res = await db.expenses.update_many(
        {"archived": {"$ne": True}},
        {"$set": {"archived": True, "archived_at": now_iso, "archived_by": by}},
    )
    appro_res = await db.shopping_list_items.update_many(
        {"archived": {"$ne": True}},
        {"$set": {"archived": True, "archived_at": now_iso, "archived_by": by}},
    )

    logger.warning(
        "MAINTENANCE: reset-purchases by %s — expenses=%d, appro=%d",
        by, expenses_res.modified_count, appro_res.modified_count,
    )

    try:
        await db.audit_logs.insert_one({
            "action": "maintenance.reset_purchases",
            "actor_name": by,
            "actor_role": "admin",
            "expenses_archived": expenses_res.modified_count,
            "appro_archived": appro_res.modified_count,
            "created_at": now_iso,
        })
    except Exception as e:
        logger.error(f"audit_logs insert failed: {e}")

    return {
        "success": True,
        "expenses_archived": expenses_res.modified_count,
        "appro_archived": appro_res.modified_count,
        "archived_at": now_iso,
        "archived_by": by,
    }


@router.post("/admin/maintenance/restore-purchases")
async def restore_purchases(body: MaintenanceResetBody):
    """Annule la dernière "Remise à zéro" : retire le flag `archived` sur tous
    les documents Expenses + Appro Manager.
    """
    from server import verify_admin_password

    if body.actor_role != "admin":
        raise HTTPException(403, "Action réservée à l'administrateur")
    role = verify_admin_password(body.password or "")
    if role != "admin_full":
        raise HTTPException(401, "Mot de passe administrateur invalide")

    expenses_res = await db.expenses.update_many(
        {"archived": True},
        {"$unset": {"archived": "", "archived_at": "", "archived_by": ""}},
    )
    appro_res = await db.shopping_list_items.update_many(
        {"archived": True},
        {"$unset": {"archived": "", "archived_at": "", "archived_by": ""}},
    )
    return {
        "success": True,
        "expenses_restored": expenses_res.modified_count,
        "appro_restored": appro_res.modified_count,
    }


@router.get("/admin/maintenance/archive-summary")
async def archive_summary():
    """Compte ce qui est actuellement archivé (utile pour la confirmation UI)."""
    exp_total = await db.expenses.count_documents({})
    exp_archived = await db.expenses.count_documents({"archived": True})
    appro_total = await db.shopping_list_items.count_documents({})
    appro_archived = await db.shopping_list_items.count_documents({"archived": True})
    return {
        "expenses": {"total": exp_total, "archived": exp_archived, "active": exp_total - exp_archived},
        "appro_manager": {"total": appro_total, "archived": appro_archived, "active": appro_total - appro_archived},
    }


class RestoreOneBody(BaseModel):
    ids: list[str] = Field(..., min_length=1)
    actor_role: str = "admin"
    actor_name: Optional[str] = None


@router.post("/admin/maintenance/restore-one")
async def restore_one_expense(body: RestoreOneBody):
    """Restaure un ou plusieurs expenses archivés (sans mot de passe : action
    réversible et limitée aux admins). Pour restaurer en masse avec mot de passe
    voir /admin/maintenance/restore-purchases.
    """
    if body.actor_role != "admin":
        raise HTTPException(403, "Action réservée à l'administrateur")

    res = await db.expenses.update_many(
        {"id": {"$in": body.ids}, "archived": True},
        {"$unset": {"archived": "", "archived_at": "", "archived_by": ""}},
    )
    return {
        "success": True,
        "restored": res.modified_count,
        "by": body.actor_name or "Admin",
    }
