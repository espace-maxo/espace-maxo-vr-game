"""
Routeur "Period Assignment" — rattacher manuellement un achat / une dépense / une
facture à un **jour** ou à un **mois** donné, indépendamment de leur date de
création réelle.

Champ écrit sur le document :
  - `assigned_date` : string `"YYYY-MM-DD"` (jour précis)
  - `assignment_precision` : `"day"` ou `"month"` (si `"month"`, le jour stocké
    sera `"01"` du mois — utile uniquement pour l'affichage UI)
  - `assigned_at` : ISO timestamp + `assigned_by` : nom de l'auteur

Collections supportées :
  - `expenses`            (onglet Achats)
  - `shopping_list_items` (onglet Appro Manager)
  - `invoices`            (onglet Factures / recettes)

Les agrégations (rapports mensuels, Compte courant, KPIs) doivent utiliser
`assigned_date || created_at` pour le filtrage par période — voir reports.py
et journal.py.
"""
import logging
from datetime import datetime, timezone
from typing import List, Optional, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

router = APIRouter(tags=["period-assignment"])

db: Optional[AsyncIOMotorDatabase] = None


def set_db(database: AsyncIOMotorDatabase):
    global db
    db = database


ALLOWED_COLLECTIONS = {
    "expenses": "expenses",
    "shopping_list_items": "shopping_list_items",
    "invoices": "invoices",
}


class AssignDateBulkBody(BaseModel):
    collection: Literal["expenses", "shopping_list_items", "invoices"]
    ids: List[str] = Field(..., min_length=1, description="IDs des documents à rattacher")
    assigned_date: Optional[str] = Field(
        None, description="Date YYYY-MM-DD (jour) ou null pour retirer le rattachement"
    )
    precision: Literal["day", "month"] = Field("day", description="Précision : jour ou mois entier")
    actor_role: str = "admin"
    actor_name: Optional[str] = None


def _validate_date(s: str) -> str:
    """Valide & normalise une date YYYY-MM-DD ou YYYY-MM (mois)."""
    s = (s or "").strip()
    # Accepter YYYY-MM (mois) en plus de YYYY-MM-DD
    if len(s) == 7 and s[4] == "-":
        try:
            datetime.strptime(s + "-01", "%Y-%m-%d")
            return s + "-01"
        except ValueError:
            raise HTTPException(400, f"Date mois invalide : {s} (attendu YYYY-MM)")
    try:
        datetime.strptime(s, "%Y-%m-%d")
        return s
    except ValueError:
        raise HTTPException(400, f"Date invalide : {s} (attendu YYYY-MM-DD)")


@router.post("/admin/assign-date/bulk")
async def assign_date_bulk(body: AssignDateBulkBody):
    """Rattache (ou détache) plusieurs documents à une date / un mois donné.

    Si `assigned_date` est null/vide, retire le rattachement.
    """
    coll_name = ALLOWED_COLLECTIONS[body.collection]
    coll = db[coll_name]
    now_iso = datetime.now(timezone.utc).isoformat()
    by = body.actor_name or "Admin"

    if body.assigned_date:
        normalized = _validate_date(body.assigned_date)
        update = {
            "$set": {
                "assigned_date": normalized,
                "assignment_precision": body.precision,
                "assigned_at": now_iso,
                "assigned_by": by,
            }
        }
        action = "assign"
    else:
        update = {
            "$unset": {
                "assigned_date": "",
                "assignment_precision": "",
                "assigned_at": "",
                "assigned_by": "",
            }
        }
        action = "unassign"

    res = await coll.update_many({"id": {"$in": body.ids}}, update)

    try:
        await db.audit_logs.insert_one({
            "action": f"period_assignment.{action}",
            "collection": coll_name,
            "ids": body.ids,
            "assigned_date": body.assigned_date,
            "precision": body.precision,
            "actor_name": by,
            "actor_role": body.actor_role,
            "matched": res.matched_count,
            "modified": res.modified_count,
            "created_at": now_iso,
        })
    except Exception as e:
        logger.error(f"audit_logs insert failed: {e}")

    return {
        "success": True,
        "action": action,
        "collection": coll_name,
        "matched": res.matched_count,
        "modified": res.modified_count,
        "assigned_date": body.assigned_date,
        "precision": body.precision,
        "assigned_by": by,
        "assigned_at": now_iso,
    }


@router.get("/admin/assign-date/{collection}")
async def list_assigned_in_period(
    collection: Literal["expenses", "shopping_list_items", "invoices"],
    month: Optional[str] = None,  # "YYYY-MM"
    day: Optional[str] = None,    # "YYYY-MM-DD"
):
    """Liste les documents rattachés à un mois ou un jour précis."""
    coll = db[ALLOWED_COLLECTIONS[collection]]
    q = {}
    if day:
        q["assigned_date"] = day
    elif month:
        q["assigned_date"] = {"$gte": month + "-01", "$lte": month + "-31"}
    else:
        q["assigned_date"] = {"$exists": True, "$ne": None}
    docs = await coll.find(q, {"_id": 0}).to_list(2000)
    return {"count": len(docs), "items": docs}
