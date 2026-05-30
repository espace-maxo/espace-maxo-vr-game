"""
Day Openings Router — Ouverture officielle de la journée AVANT toute vente.

Workflow :
1. Responsable Op. & Log OU Admin ouvre la journée : POST /api/day-openings/{date}/open
   → bloqué si la journée précédente (avec activité) n'est PAS fermée.
   → fonds de caisse initial optionnel.
2. Tant qu'aucune ouverture n'existe pour aujourd'hui, la création de
   factures/bons est BLOQUÉE (strict) — voir router invoices.
3. La journée se "ferme" via le router day_closures existant (qui marque
   status=closed dans `day_closures`).

Collection MongoDB :
- day_openings : {
    id, date (YYYY-MM-DD), status (open|closed),
    opened_by, opened_at, initial_cash, notes,
    closed_at (rempli au moment de la fermeture)
  }
"""
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["day-openings"])
db = None
logger = logging.getLogger(__name__)


def set_db(database):
    global db
    db = database


# ============================================================================
# MODELS
# ============================================================================

class DayOpeningCreate(BaseModel):
    opened_by: str
    opened_by_role: Optional[str] = ""  # 'admin' | 'manager'
    initial_cash: Optional[float] = 0
    notes: Optional[str] = ""
    force: bool = False  # Admin uniquement : ignorer la vérif jour précédent
    password: Optional[str] = ""  # Mot de passe Journée — requis sauf admin


# ============================================================================
# HELPERS
# ============================================================================

def _prev_date(date_str: str) -> str:
    d = datetime.strptime(date_str, "%Y-%m-%d")
    return (d - timedelta(days=1)).strftime("%Y-%m-%d")


async def _has_activity_on(date_str: str) -> bool:
    """Y a-t-il eu de l'activité (factures) sur cette date ?"""
    start = f"{date_str}T00:00:00"
    end = f"{date_str}T23:59:59Z"
    n = await db.invoices.count_documents({
        "created_at": {"$gte": start, "$lte": end},
    })
    return n > 0


async def is_day_open(date_str: str) -> bool:
    """Helper exporté : la journée donnée est-elle ouverte ?"""
    if db is None:
        return True  # fail-open si DB pas prête
    op = await db.day_openings.find_one({"date": date_str}, {"_id": 0, "status": 1})
    return bool(op and op.get("status") == "open")


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/day-openings/{date}")
async def get_day_opening(date: str):
    op = await db.day_openings.find_one({"date": date}, {"_id": 0})
    return {"date": date, "opening": op, "status": (op or {}).get("status", "not_opened")}


@router.post("/day-openings/{date}/open")
async def open_day(date: str, data: DayOpeningCreate):
    # Idempotence : si déjà ouverte, on retourne tel quel
    existing = await db.day_openings.find_one({"date": date}, {"_id": 0})
    if existing and existing.get("status") == "open":
        return {"success": True, "already_open": True, "opening": existing}

    # Vérif mot de passe Journée — obligatoire pour les non-admins.
    if (data.opened_by_role or "").lower() != "admin":
        from .journee_settings import is_password_set, verify_password as _verify_pw
        if not await is_password_set():
            raise HTTPException(
                status_code=403,
                detail="Aucun mot de passe Journée n'est défini. Demandez à l'Administrateur d'en créer un (Tab Journée → Paramètres)."
            )
        if not await _verify_pw(data.password or ""):
            raise HTTPException(
                status_code=401,
                detail="Mot de passe Journée incorrect."
            )

    # Garde-fou : jour précédent doit être fermé si activité.
    # NB : on regarde "hier", "avant-hier", etc. jusqu'à 7 jours en arrière.
    if not data.force:
        d_check = _prev_date(date)
        steps = 0
        while steps < 7:
            had_activity = await _has_activity_on(d_check)
            if had_activity:
                closure = await db.day_closures.find_one({"date": d_check}, {"_id": 0, "status": 1})
                if not closure or closure.get("status") != "closed":
                    raise HTTPException(
                        status_code=400,
                        detail=f"Impossible d'ouvrir : la journée du {d_check} a eu de l'activité mais n'est pas fermée. Veuillez la clôturer d'abord."
                    )
                break  # première journée avec activité trouvée → si elle est fermée, OK
            d_check = _prev_date(d_check)
            steps += 1

    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "date": date,
        "status": "open",
        "opened_by": data.opened_by,
        "opened_by_role": data.opened_by_role or "",
        "opened_at": now_iso,
        "initial_cash": float(data.initial_cash or 0),
        "notes": data.notes or "",
        "closed_at": None,
    }
    await db.day_openings.update_one({"date": date}, {"$set": doc}, upsert=True)
    logger.info(f"Day opened: {date} by {data.opened_by} (cash={doc['initial_cash']})")
    return {"success": True, "opening": doc}


@router.post("/day-openings/{date}/mark-closed")
async def mark_closed(date: str):
    """Marque l'ouverture comme close (appelé par day_closures lors du close).
    Idempotent."""
    existing = await db.day_openings.find_one({"date": date}, {"_id": 0})
    if not existing:
        return {"success": True, "skipped": True}
    if existing.get("status") == "closed":
        return {"success": True, "already_closed": True}
    await db.day_openings.update_one(
        {"date": date},
        {"$set": {"status": "closed", "closed_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"success": True}


@router.get("/day-openings/history/list")
async def list_history(limit: int = 60):
    """Liste des ouvertures les plus récentes (avec lien vers la fermeture si dispo)."""
    rows = await db.day_openings.find({}, {"_id": 0}).sort("date", -1).to_list(limit)
    # Enrichir avec info fermeture
    dates = [r["date"] for r in rows]
    closures = {}
    if dates:
        async for c in db.day_closures.find({"date": {"$in": dates}}, {"_id": 0}):
            closures[c["date"]] = c
    for r in rows:
        c = closures.get(r["date"])
        r["closure"] = c if c else None
    return {"history": rows, "total": len(rows)}


@router.delete("/day-openings/{date}")
async def delete_opening(date: str):
    """Admin only — supprimer une ouverture (erreur de saisie)."""
    r = await db.day_openings.delete_one({"date": date})
    if r.deleted_count == 0:
        raise HTTPException(404, "Aucune ouverture trouvée")
    return {"success": True}
