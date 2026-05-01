"""
Gerante Cash Advances Router — Avances personnelles de la Gérante pour rendre la monnaie.

Cas d'usage :
- Un client doit recevoir 2 000 F de monnaie
- La caisse n'a pas de petites coupures
- La Gérante donne 2 000 F de sa poche au client
- Le client a quand même payé la totalité en caisse → surplus physique
- Plus tard, la Gérante prend 2 000 F dans la caisse pour se rembourser

Endpoints :
- POST   /api/gerante-advances               → créer une avance
- GET    /api/gerante-advances               → lister (filtres date, status)
- GET    /api/gerante-advances/summary       → totaux (pending + remboursées du jour)
- POST   /api/gerante-advances/{id}/reimburse → marquer remboursée
- POST   /api/gerante-advances/reimburse-all → tout rembourser (pending → reimbursed)
- DELETE /api/gerante-advances/{id}          → supprimer (admin / gérante)
"""
from fastapi import APIRouter, HTTPException, Query, Body
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from typing import Optional, List
import uuid
import logging

router = APIRouter(tags=["gerante_advances"])
db = None
logger = logging.getLogger(__name__)


def set_db(database):
    global db
    db = database


# ==================== MODELS ====================

class AdvanceCreate(BaseModel):
    amount: float = Field(..., gt=0, description="Montant avancé en F")
    reason: str = Field("", description="Motif : ex. 'Monnaie client facture #0012'")
    created_by: Optional[str] = "Gérante"
    invoice_id: Optional[str] = None
    invoice_number: Optional[str] = None


class ReimburseRequest(BaseModel):
    reimbursed_by: Optional[str] = "Gérante"
    notes: Optional[str] = None


# ==================== ENDPOINTS ====================

@router.post("/gerante-advances")
async def create_advance(payload: AdvanceCreate):
    """Enregistre une avance de la Gérante (fonds personnels pour rendre la monnaie)."""
    try:
        now = datetime.now(timezone.utc)
        doc = {
            "id": str(uuid.uuid4()),
            "date": now.strftime("%Y-%m-%d"),
            "amount": float(payload.amount),
            "reason": (payload.reason or "").strip(),
            "invoice_id": payload.invoice_id,
            "invoice_number": payload.invoice_number,
            "created_by": payload.created_by or "Gérante",
            "status": "pending",
            "created_at": now.isoformat(),
            "reimbursed_at": None,
            "reimbursed_by": None,
            "reimbursed_in_closure_id": None,
            "notes": None,
        }
        await db.gerante_advances.insert_one(doc.copy())
        doc.pop("_id", None)
        return {"success": True, "advance": doc}
    except Exception as e:
        logger.error(f"Error creating gerante advance: {e}")
        raise HTTPException(500, str(e))


@router.get("/gerante-advances")
async def list_advances(
    status: Optional[str] = Query(None, description="pending | reimbursed | all"),
    date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
):
    try:
        q = {}
        if status and status != "all":
            q["status"] = status
        if date:
            q["date"] = date
        elif date_from or date_to:
            dq = {}
            if date_from:
                dq["$gte"] = date_from
            if date_to:
                dq["$lte"] = date_to
            q["date"] = dq
        rows = await db.gerante_advances.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
        return {"success": True, "advances": rows}
    except Exception as e:
        logger.error(f"Error listing gerante advances: {e}")
        raise HTTPException(500, str(e))


@router.get("/gerante-advances/summary")
async def advances_summary(date: Optional[str] = Query(None)):
    """Résumé rapide : pending total (global + du jour), remboursées du jour."""
    try:
        day = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")

        pending_all = await db.gerante_advances.find({"status": "pending"}, {"_id": 0}).to_list(5000)
        pending_total = sum(float(a.get("amount") or 0) for a in pending_all)
        pending_count = len(pending_all)

        pending_today = [a for a in pending_all if a.get("date") == day]
        pending_today_total = sum(float(a.get("amount") or 0) for a in pending_today)

        reimb_today = await db.gerante_advances.find(
            {"status": "reimbursed", "reimbursed_at": {"$regex": f"^{day}"}},
            {"_id": 0},
        ).to_list(1000)
        reimbursed_today_total = sum(float(a.get("amount") or 0) for a in reimb_today)

        return {
            "success": True,
            "date": day,
            "pending_total": pending_total,
            "pending_count": pending_count,
            "pending_today_total": pending_today_total,
            "pending_today_count": len(pending_today),
            "reimbursed_today_total": reimbursed_today_total,
            "reimbursed_today_count": len(reimb_today),
        }
    except Exception as e:
        logger.error(f"Error advances summary: {e}")
        raise HTTPException(500, str(e))


@router.post("/gerante-advances/{advance_id}/reimburse")
async def reimburse_advance(advance_id: str, payload: ReimburseRequest = Body(default=None)):
    """Marque une avance comme remboursée (la Gérante a pris l'argent de la caisse)."""
    try:
        payload = payload or ReimburseRequest()
        existing = await db.gerante_advances.find_one({"id": advance_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Avance introuvable")
        if existing.get("status") == "reimbursed":
            raise HTTPException(409, "Cette avance est déjà remboursée")
        now = datetime.now(timezone.utc).isoformat()
        await db.gerante_advances.update_one(
            {"id": advance_id},
            {"$set": {
                "status": "reimbursed",
                "reimbursed_at": now,
                "reimbursed_by": payload.reimbursed_by or "Gérante",
                "notes": payload.notes,
            }},
        )
        doc = await db.gerante_advances.find_one({"id": advance_id}, {"_id": 0})
        return {"success": True, "advance": doc}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reimbursing advance: {e}")
        raise HTTPException(500, str(e))


@router.post("/gerante-advances/reimburse-all")
async def reimburse_all(
    reimbursed_by: str = Body("Gérante", embed=True),
    date: Optional[str] = Body(None, embed=True),
):
    """Rembourse toutes les avances pending (optionnellement limitées à une date)."""
    try:
        q = {"status": "pending"}
        if date:
            q["date"] = date
        pending = await db.gerante_advances.find(q, {"_id": 0}).to_list(5000)
        if not pending:
            return {"success": True, "count": 0, "total_amount": 0}
        now = datetime.now(timezone.utc).isoformat()
        ids = [a["id"] for a in pending]
        total = sum(float(a.get("amount") or 0) for a in pending)
        await db.gerante_advances.update_many(
            {"id": {"$in": ids}},
            {"$set": {
                "status": "reimbursed",
                "reimbursed_at": now,
                "reimbursed_by": reimbursed_by or "Gérante",
            }},
        )
        return {"success": True, "count": len(ids), "total_amount": total}
    except Exception as e:
        logger.error(f"Error reimburse-all: {e}")
        raise HTTPException(500, str(e))


@router.delete("/gerante-advances/{advance_id}")
async def delete_advance(advance_id: str):
    try:
        res = await db.gerante_advances.delete_one({"id": advance_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Avance introuvable")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting advance: {e}")
        raise HTTPException(500, str(e))
