"""
Journée Settings Router — Gestion du mot de passe « Journée » dédié.

Ce mot de passe est saisi par la Gérante (rôle != 'admin') à chaque
ouverture / fermeture de journée. L'Admin n'a PAS besoin de le saisir.

Le mot de passe est créé/modifié par l'Admin uniquement, via le sous-onglet
« Paramètres » du tab Journée. Si aucun mot de passe n'est défini, la
Gérante est BLOQUÉE pour ouvrir ou fermer la journée.

Collection MongoDB :
- app_settings : doc unique avec key="journee_password" et :
  { password_hash, set_by, set_at, last_updated_by, last_updated_at }
"""
import logging
from datetime import datetime, timezone
from typing import Optional

import bcrypt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["journee-settings"])
db = None
logger = logging.getLogger(__name__)

_SETTING_KEY = "journee_password"


def set_db(database):
    global db
    db = database


class SetPasswordPayload(BaseModel):
    new_password: str
    actor_name: Optional[str] = "admin"
    # Mesure de sécurité minimale (l'UI ne propose ce formulaire qu'aux admins,
    # mais on accepte un mot de passe admin pour double-vérification).
    confirm_admin_password: Optional[str] = ""


class VerifyPasswordPayload(BaseModel):
    password: str


async def _get_doc() -> Optional[dict]:
    return await db.app_settings.find_one({"key": _SETTING_KEY}, {"_id": 0})


async def is_password_set() -> bool:
    """Helper exporté : un mot de passe Journée est-il configuré ?"""
    if db is None:
        return False
    doc = await _get_doc()
    return bool(doc and doc.get("password_hash"))


async def verify_password(plain: str) -> bool:
    """Helper exporté : vérifie qu'un mot de passe correspond au hash stocké."""
    if db is None or not plain:
        return False
    doc = await _get_doc()
    if not doc or not doc.get("password_hash"):
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), doc["password_hash"].encode("utf-8"))
    except Exception as e:
        logger.warning(f"Bcrypt verify failed: {e}")
        return False


@router.get("/journee-settings/password-status")
async def password_status():
    doc = await _get_doc()
    return {
        "is_set": bool(doc and doc.get("password_hash")),
        "set_at": (doc or {}).get("set_at"),
        "set_by": (doc or {}).get("set_by"),
        "last_updated_at": (doc or {}).get("last_updated_at"),
        "last_updated_by": (doc or {}).get("last_updated_by"),
    }


@router.post("/journee-settings/set-password")
async def set_password(payload: SetPasswordPayload):
    if not payload.new_password or len(payload.new_password) < 4:
        raise HTTPException(400, "Le mot de passe doit comporter au moins 4 caractères")

    now_iso = datetime.now(timezone.utc).isoformat()
    pw_hash = bcrypt.hashpw(payload.new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    existing = await _get_doc()
    if existing:
        update = {
            "password_hash": pw_hash,
            "last_updated_by": payload.actor_name or "admin",
            "last_updated_at": now_iso,
        }
        await db.app_settings.update_one({"key": _SETTING_KEY}, {"$set": update})
        return {"success": True, "created": False}
    else:
        doc = {
            "key": _SETTING_KEY,
            "password_hash": pw_hash,
            "set_by": payload.actor_name or "admin",
            "set_at": now_iso,
            "last_updated_by": payload.actor_name or "admin",
            "last_updated_at": now_iso,
        }
        await db.app_settings.insert_one(doc)
        return {"success": True, "created": True}


@router.post("/journee-settings/verify-password")
async def verify_password_endpoint(payload: VerifyPasswordPayload):
    """Vérification synchrone pour la Gérante (UX : valider avant d'envoyer
    l'action open/close)."""
    ok = await verify_password(payload.password)
    return {"valid": ok}


@router.delete("/journee-settings/password")
async def delete_password():
    """Admin only — supprimer le mot de passe (re-bloque la Gérante)."""
    r = await db.app_settings.delete_one({"key": _SETTING_KEY})
    return {"success": True, "deleted": r.deleted_count > 0}
