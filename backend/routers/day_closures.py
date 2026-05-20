"""
Day Closures Router — Fermeture de la journée AVANT "Faire le point".

Workflow :
1. Chaque serveur fait son point : POST /api/server-points {date, server_id, server_name}
   → enregistre que ce serveur a validé son service du jour
2. La Gérante (ou Admin) ferme la journée : POST /api/day-closures/{date}/close
   → bloquée si un serveur (rôle 'server' actif) n'a pas validé son point
3. Une fois fermée, la journée est en lecture seule (statut = closed)
4. Seul l'Admin peut rouvrir la journée : POST /api/day-closures/{date}/reopen

Collections MongoDB :
- server_points : { id, date, server_id, server_name, total_invoices, total_amount, validated_at, validated_by }
- day_closures  : { id, date, status (open|closed), closed_by, closed_at, reopened_by, reopened_at, notes }
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["day-closures"])
db = None
logger = logging.getLogger(__name__)


def set_db(database):
    global db
    db = database


# ============================================================================
# MODELS
# ============================================================================

class ServerPointCreate(BaseModel):
    date: str  # YYYY-MM-DD
    server_id: str
    server_name: str
    notes: Optional[str] = ""


class DayClosureClose(BaseModel):
    closed_by: str
    notes: Optional[str] = ""
    force: bool = False  # Admin uniquement : ignorer la vérification serveurs


class DayClosureReopen(BaseModel):
    reopened_by: str
    reason: Optional[str] = ""


# ============================================================================
# SERVER POINTS — chaque serveur valide son point du jour
# ============================================================================

@router.get("/server-points/status")
async def get_server_points_status(date: str):
    """Retourne la liste de TOUS les serveurs actifs avec leur statut pour la date donnée.
    Permet à l'UI d'afficher "X/Y serveurs ont fait leur point".
    """
    try:
        # Tous les utilisateurs serveurs actifs
        servers = await db.caisse_users.find({
            "role": "server", "is_active": {"$ne": False}
        }, {"_id": 0}).to_list(500)

        # Points validés à cette date
        points = await db.server_points.find({"date": date}, {"_id": 0}).to_list(500)
        points_by_id = {p["server_id"]: p for p in points}

        items = []
        for s in servers:
            sid = s["id"]
            point = points_by_id.get(sid)
            items.append({
                "server_id": sid,
                "server_name": s.get("full_name") or s.get("username") or "Serveur",
                "validated": bool(point),
                "validated_at": point.get("validated_at") if point else None,
                "total_invoices": point.get("total_invoices", 0) if point else 0,
                "total_amount": point.get("total_amount", 0) if point else 0,
            })

        # Inclure les serveurs qui ont validé mais ne sont plus actifs
        known_ids = {s["id"] for s in servers}
        for p in points:
            if p["server_id"] not in known_ids:
                items.append({
                    "server_id": p["server_id"],
                    "server_name": p.get("server_name", "Serveur inconnu"),
                    "validated": True,
                    "validated_at": p.get("validated_at"),
                    "total_invoices": p.get("total_invoices", 0),
                    "total_amount": p.get("total_amount", 0),
                })

        total = len(items)
        done = sum(1 for i in items if i["validated"])
        return {
            "date": date,
            "total_servers": total,
            "validated_count": done,
            "all_validated": (done == total and total > 0) or (total == 0),
            "servers": items,
        }
    except Exception as e:
        logger.error(f"Error fetching server points status: {e}")
        raise HTTPException(500, str(e))


@router.post("/server-points")
async def create_server_point(data: ServerPointCreate):
    """Un serveur valide son point pour la journée."""
    try:
        existing = await db.server_points.find_one({
            "date": data.date, "server_id": data.server_id,
        })
        if existing:
            return {"success": True, "already": True, "point": {**existing, "_id": None}}

        # Stats automatiques : nombre de factures + montant pour ce serveur ce jour-là
        start = f"{data.date}T00:00:00"
        end = f"{data.date}T23:59:59Z"
        invoices = await db.invoices.find({
            "created_by": data.server_name,
            "created_at": {"$gte": start, "$lte": end},
        }, {"_id": 0}).to_list(2000)
        validated_inv = [i for i in invoices if i.get("validation_status") == "validated"]
        total_amount = sum(i.get("total", 0) for i in validated_inv)

        doc = {
            "id": str(uuid.uuid4()),
            "date": data.date,
            "server_id": data.server_id,
            "server_name": data.server_name,
            "total_invoices": len(validated_inv),
            "total_amount": total_amount,
            "notes": data.notes or "",
            "validated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.server_points.insert_one(doc)
        doc.pop("_id", None)
        logger.info(f"Server point: {data.server_name} for {data.date} ({len(validated_inv)} fac)")
        return {"success": True, "point": doc}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Server point create error: {e}")
        raise HTTPException(500, str(e))


@router.delete("/server-points/{point_id}")
async def delete_server_point(point_id: str, is_admin: bool = False):
    """Annule un point serveur (admin uniquement, ou la Gérante si la journée n'est pas fermée)."""
    try:
        if not is_admin:
            point = await db.server_points.find_one({"id": point_id}, {"_id": 0})
            if not point:
                raise HTTPException(404, "Point introuvable")
            closure = await db.day_closures.find_one({"date": point["date"]}, {"_id": 0})
            if closure and closure.get("status") == "closed":
                raise HTTPException(403, "Journée fermée — seul l'Admin peut annuler ce point")
        r = await db.server_points.delete_one({"id": point_id})
        return {"success": True, "deleted": r.deleted_count}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# ============================================================================
# DAY CLOSURES — fermeture / ré-ouverture de la journée
# ============================================================================

@router.get("/day-closures/{date}")
async def get_day_closure(date: str):
    """Retourne le statut d'une journée. Par défaut : 'open'."""
    try:
        c = await db.day_closures.find_one({"date": date}, {"_id": 0})
        if not c:
            return {"date": date, "status": "open", "closure": None}
        return {"date": date, "status": c.get("status", "open"), "closure": c}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/day-closures/{date}/close")
async def close_day(date: str, data: DayClosureClose):
    """Ferme la journée. Bloque si un serveur actif n'a pas fait son point (sauf force=True + admin)."""
    try:
        # Idempotence
        existing = await db.day_closures.find_one({"date": date}, {"_id": 0})
        if existing and existing.get("status") == "closed":
            return {"success": True, "already_closed": True, "closure": existing}

        # Vérification : tous les serveurs ont validé
        if not data.force:
            servers = await db.caisse_users.find({
                "role": "server", "is_active": {"$ne": False}
            }, {"_id": 0}).to_list(500)
            if servers:
                points = await db.server_points.find({"date": date}, {"_id": 0}).to_list(500)
                done_ids = {p["server_id"] for p in points}
                missing = [s.get("full_name") or s.get("username") for s in servers if s["id"] not in done_ids]
                if missing:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Impossible de fermer : {len(missing)} serveur(s) n'ont pas fait leur point ({', '.join(missing[:3])}{'...' if len(missing) > 3 else ''})"
                    )

        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": existing.get("id") if existing else str(uuid.uuid4()),
            "date": date,
            "status": "closed",
            "closed_by": data.closed_by,
            "closed_at": now,
            "reopened_by": None,
            "reopened_at": None,
            "notes": data.notes or "",
        }
        await db.day_closures.update_one({"date": date}, {"$set": doc}, upsert=True)
        logger.info(f"Day {date} closed by {data.closed_by}")
        return {"success": True, "closure": doc}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Close day error: {e}")
        raise HTTPException(500, str(e))


@router.post("/day-closures/{date}/reopen")
async def reopen_day(date: str, data: DayClosureReopen):
    """Ré-ouvre une journée fermée — Admin uniquement (le frontend force is_admin=true via le contexte)."""
    try:
        existing = await db.day_closures.find_one({"date": date}, {"_id": 0})
        if not existing or existing.get("status") != "closed":
            raise HTTPException(400, "La journée n'est pas fermée")

        now = datetime.now(timezone.utc).isoformat()
        await db.day_closures.update_one({"date": date}, {"$set": {
            "status": "open",
            "reopened_by": data.reopened_by,
            "reopened_at": now,
            "reopen_reason": data.reason or "",
        }})
        logger.info(f"Day {date} reopened by {data.reopened_by}")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Reopen day error: {e}")
        raise HTTPException(500, str(e))
