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
    """Retourne la liste des serveurs qui ont **pris des commandes** ce jour-là,
    avec leur statut de validation. Les serveurs sans aucune facture ne sont
    PAS comptés (pas besoin de faire leur point).
    """
    try:
        # 1. Récupérer toutes les factures du jour (validated OU pending)
        start = f"{date}T00:00:00"
        end = f"{date}T23:59:59Z"
        invoices = await db.invoices.find({
            "created_at": {"$gte": start, "$lte": end},
        }, {"_id": 0, "created_by": 1, "total": 1, "validation_status": 1}).to_list(5000)

        # 2. Agréger par created_by (nom du serveur)
        by_name = {}  # name -> {count, amount}
        for inv in invoices:
            name = (inv.get("created_by") or "").strip()
            if not name:
                continue
            by_name.setdefault(name, {"count": 0, "amount": 0})
            by_name[name]["count"] += 1
            if inv.get("validation_status") == "validated":
                by_name[name]["amount"] += inv.get("total", 0)

        if not by_name:
            return {
                "date": date,
                "total_servers": 0,
                "validated_count": 0,
                "all_validated": True,  # personne n'a pris de commande = pas de blocage
                "servers": [],
            }

        # 3. Match avec caisse_users (pour récupérer l'id et confirmer le rôle)
        users = await db.caisse_users.find({}, {"_id": 0}).to_list(500)
        user_by_name = {}
        for u in users:
            uname = (u.get("full_name") or u.get("username") or "").strip()
            if uname:
                user_by_name[uname] = u

        # 4. Points déjà validés pour cette date
        points = await db.server_points.find({"date": date}, {"_id": 0}).to_list(500)
        points_by_name = {p.get("server_name"): p for p in points}
        points_by_id = {p.get("server_id"): p for p in points}

        items = []
        for name, stats in by_name.items():
            user = user_by_name.get(name)
            sid = user.get("id") if user else f"anon_{name}"
            point = points_by_id.get(sid) or points_by_name.get(name)
            items.append({
                "server_id": sid,
                "server_name": name,
                "role": user.get("role") if user else "server",
                "validated": bool(point),
                "validated_at": point.get("validated_at") if point else None,
                "total_invoices": stats["count"],
                "total_amount": stats["amount"],
            })

        items.sort(key=lambda x: x["server_name"])
        total = len(items)
        done = sum(1 for i in items if i["validated"])
        return {
            "date": date,
            "total_servers": total,
            "validated_count": done,
            "all_validated": done == total,
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

        # Vérification : seuls les serveurs qui ont pris des commandes doivent avoir validé
        if not data.force:
            start = f"{date}T00:00:00"
            end = f"{date}T23:59:59Z"
            invoices = await db.invoices.find({
                "created_at": {"$gte": start, "$lte": end},
            }, {"_id": 0, "created_by": 1}).to_list(5000)
            servers_with_orders = set()
            for inv in invoices:
                name = (inv.get("created_by") or "").strip()
                if name:
                    servers_with_orders.add(name)

            if servers_with_orders:
                points = await db.server_points.find({"date": date}, {"_id": 0}).to_list(500)
                done_names = {p.get("server_name") for p in points}
                missing = sorted(servers_with_orders - done_names)
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

        # Marque aussi l'ouverture comme close (si elle existe).
        try:
            await db.day_openings.update_one(
                {"date": date, "status": "open"},
                {"$set": {"status": "closed", "closed_at": now}}
            )
        except Exception as _e:
            logger.warning(f"day_openings update on close failed: {_e}")

        # === AUTO-CRÉATION des 4 reversements (Bar / Menu / Jeux / Locations) ===
        # Pré-rempli à partir des ventes du jour. La Gérante pourra ajuster
        # chaque montant avec un motif obligatoire (traçabilité).
        auto_created = []
        try:
            from .financial_points import reversement_auto_fill as _autofill_fn
            af = await _autofill_fn(date=date, period_type="daily", end_date="")
            categories = af.get("categories", {}) if isinstance(af, dict) else {}
            for cat_key in ("bar", "menu_combos", "jeux", "locations"):
                bucket = categories.get(cat_key, {}) or {}
                # On NE crée PAS si un reversement existe déjà pour cette (date, daily, cat).
                existing_fp = await db.financial_points.find_one({
                    "date": date,
                    "period_type": "daily",
                    "category": cat_key,
                })
                if existing_fp:
                    continue
                cash = float(bucket.get("cash", 0) or 0)
                mobile = float(bucket.get("mobile", 0) or 0)
                cheque = float(bucket.get("cheque", 0) or 0)
                wallet = float(bucket.get("wallet", 0) or 0)
                total = cash + mobile + cheque + wallet
                fp = {
                    "id": str(uuid.uuid4()),
                    "date": date,
                    "end_date": "",
                    "period_type": "daily",
                    "category": cat_key,
                    "cash_amount": cash,
                    "mobile_amount": mobile,
                    "cheque_amount": cheque,
                    "wallet_amount": wallet,
                    "total_amount": total,
                    "notes": "",
                    "created_by": data.closed_by,
                    "created_at": now,
                    "status": "pending",
                    "admin_validated": False,
                    "admin_validated_by": None,
                    "admin_validated_at": None,
                    "signed": False,
                    "signed_by": None,
                    "signed_at": None,
                    "billettage": {},
                    "momo_number": "",
                    "destination": "admin",
                    "adjustments": [],
                    "auto_fill_snapshot": {
                        "cash": cash, "mobile": mobile, "cheque": cheque, "wallet": wallet,
                        "total": total, "computed_at": now,
                    },
                    "auto_created_on_closure": True,
                }
                await db.financial_points.insert_one(fp)
                fp.pop("_id", None)
                auto_created.append(cat_key)
            if auto_created:
                logger.info(f"Auto-created {len(auto_created)} reversements on day closure {date}: {auto_created}")
        except Exception as _e:
            logger.error(f"Auto-create reversements on closure failed for {date}: {_e}")

        return {"success": True, "closure": doc, "auto_created_reversements": auto_created}
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

        # Réouvre aussi l'ouverture (si elle existe).
        try:
            await db.day_openings.update_one(
                {"date": date},
                {"$set": {"status": "open", "closed_at": None}}
            )
        except Exception as _e:
            logger.warning(f"day_openings reopen failed: {_e}")

        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Reopen day error: {e}")
        raise HTTPException(500, str(e))
