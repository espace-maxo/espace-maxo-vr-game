"""
Needs Router — Liste de besoins (gérante / admin).

Périmètre :
  - Liste de TOUS les besoins (salle, salle_jeux, jardin, cuisine, toilettes, autres).
  - Gérante crée un besoin (prix optionnel, multi-items), Admin approuve et
    peut convertir automatiquement en demande d'achats (dépense pending).
  - Endpoint /needs/analysis réutilise la logique de forecasts pour :
    doublons (14j, demandes + achats stock), intra-doublons, stock matches,
    redundant items, recent purchases et impact trésorerie.

Statuts : en_attente | traite | annule
"""
from fastapi import APIRouter, HTTPException, Body, Query
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime, timezone, timedelta
from typing import List, Optional
import uuid
import logging

from .forecasts import analyze_single_request, _compute_treasury

router = APIRouter(tags=["needs"])
db = None
logger = logging.getLogger(__name__)


def set_db(database):
    global db
    db = database


# ==================== MODELS ====================

VALID_LOCATIONS = {"salle", "salle_jeux", "jardin", "cuisine", "toilettes", "autres"}
VALID_STATUSES = {"en_attente", "traite", "annule"}
VALID_URGENCY = {"normale", "urgente"}


class NeedItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    location: str = "autres"  # salle | salle_jeux | jardin | cuisine | toilettes | autres
    description: str
    quantity: int = 1
    unit_price: Optional[float] = 0
    amount: Optional[float] = 0
    notes: Optional[str] = ""


class NeedCreate(BaseModel):
    location: str = "autres"
    description: str
    items: Optional[List[NeedItem]] = None
    quantity: Optional[int] = 1
    unit_price: Optional[float] = 0
    amount: Optional[float] = 0
    supplier: Optional[str] = None
    urgency: str = "normale"
    notes: Optional[str] = ""
    requested_by: str


class NeedUpdate(BaseModel):
    location: Optional[str] = None
    description: Optional[str] = None
    items: Optional[List[NeedItem]] = None
    quantity: Optional[int] = None
    unit_price: Optional[float] = None
    amount: Optional[float] = None
    supplier: Optional[str] = None
    urgency: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    admin_notes: Optional[str] = None


# ==================== CRUD ====================

@router.get("/needs")
async def list_needs(status: Optional[str] = None, location: Optional[str] = None):
    """List needs. Optional filters: status, location."""
    try:
        query = {}
        if status:
            query["status"] = status
        if location:
            query["location"] = location
        items = await db.needs.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)
        return {"needs": items}
    except Exception as e:
        logger.error(f"Error listing needs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/needs")
async def create_need(data: NeedCreate):
    try:
        if data.location not in VALID_LOCATIONS:
            data.location = "autres"
        if data.urgency not in VALID_URGENCY:
            data.urgency = "normale"

        doc = {
            "id": str(uuid.uuid4()),
            "location": data.location,
            "description": data.description,
            "items": [it.model_dump() for it in (data.items or [])],
            "quantity": data.quantity or 1,
            "unit_price": data.unit_price or 0,
            "amount": data.amount or 0,
            "supplier": data.supplier,
            "urgency": data.urgency,
            "notes": data.notes or "",
            "requested_by": data.requested_by,
            "status": "en_attente",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.needs.insert_one(doc)
        return {"success": True, "need": {k: v for k, v in doc.items() if k != "_id"}}
    except Exception as e:
        logger.error(f"Error creating need: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/needs/{need_id}")
async def update_need(need_id: str, data: NeedUpdate):
    try:
        update = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
        if "location" in update and update["location"] not in VALID_LOCATIONS:
            update["location"] = "autres"
        if "status" in update and update["status"] not in VALID_STATUSES:
            update["status"] = "en_attente"
        if "urgency" in update and update["urgency"] not in VALID_URGENCY:
            update["urgency"] = "normale"
        if "items" in update and update["items"] is not None:
            update["items"] = [
                it if isinstance(it, dict) else it.model_dump()
                for it in update["items"]
            ]
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        res = await db.needs.update_one({"id": need_id}, {"$set": update})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Besoin non trouvé")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating need: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/needs/{need_id}")
async def delete_need(need_id: str):
    try:
        res = await db.needs.delete_one({"id": need_id})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Besoin non trouvé")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting need: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== ADMIN ACTIONS ====================

@router.post("/needs/{need_id}/cancel")
async def cancel_need(need_id: str, body: dict = Body(default={})):
    """Admin cancels (annule) a need."""
    try:
        reason = (body or {}).get("reason") or ""
        res = await db.needs.update_one(
            {"id": need_id},
            {"$set": {
                "status": "annule",
                "admin_notes": reason,
                "cancelled_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Besoin non trouvé")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling need: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/needs/{need_id}/convert-to-expense")
async def convert_need_to_expense(need_id: str, body: dict = Body(default={})):
    """Admin: convertit un besoin en demande d'achats (expense pending) et marque le besoin 'traite'.

    Le body peut contenir: category (défaut "autres"), overrides unit_price/amount si gérante n'a pas renseigné.
    """
    try:
        need = await db.needs.find_one({"id": need_id}, {"_id": 0})
        if not need:
            raise HTTPException(status_code=404, detail="Besoin non trouvé")
        if need.get("status") == "traite":
            raise HTTPException(status_code=400, detail="Besoin déjà traité")

        category = (body or {}).get("category") or "autres"
        # Build expense items list from need.items or fallback single item
        src_items = need.get("items") or []
        exp_items = []
        total_amount = 0
        if src_items:
            for it in src_items:
                qty = it.get("quantity", 1) or 1
                up = it.get("unit_price", 0) or 0
                amt = it.get("amount") or (qty * up)
                exp_items.append({
                    "category": category,
                    "description": it.get("description") or "",
                    "quantity": qty,
                    "unit_price": up,
                    "amount": amt,
                })
                total_amount += amt
        else:
            qty = need.get("quantity", 1) or 1
            up = need.get("unit_price", 0) or 0
            amt = need.get("amount") or (qty * up)
            exp_items.append({
                "category": category,
                "description": need.get("description") or "",
                "quantity": qty,
                "unit_price": up,
                "amount": amt,
            })
            total_amount = amt

        expense_doc = {
            "id": str(uuid.uuid4()),
            "category": category,
            "description": f"Besoin {need.get('location', 'autres')} - {need.get('description') or ''}",
            "quantity": len(exp_items),
            "unit_price": None,
            "amount": total_amount,
            "supplier": need.get("supplier"),
            "planned_date": None,
            "receipt_image": None,
            "requested_by": need.get("requested_by"),
            "is_group": True,
            "group_id": need.get("id"),
            "items": exp_items,
            "status": "pending",
            "source_need_id": need_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.expenses.insert_one(expense_doc)

        await db.needs.update_one(
            {"id": need_id},
            {"$set": {
                "status": "traite",
                "converted_to_expense_id": expense_doc["id"],
                "converted_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
        return {
            "success": True,
            "expense_id": expense_doc["id"],
            "expense": {k: v for k, v in expense_doc.items() if k != "_id"},
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error converting need: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== ANALYSIS ====================

@router.get("/needs/analysis")
async def needs_analysis():
    """Analyse chaque besoin 'en_attente' contre :
    - Les autres besoins récents (14j)
    - Les demandes d'achats récentes (expenses 14j)
    - Les achats stock réels (stock_purchases 14j)
    - Le stock actuel
    - La trésorerie disponible
    """
    try:
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        lookback = today - timedelta(days=14)
        lookback_str = lookback.strftime("%Y-%m-%d")

        treasury = await _compute_treasury(today)
        available = treasury["available"]

        needs_pending = await db.needs.find({"status": "en_attente"}, {"_id": 0}).to_list(500)
        recent_needs = await db.needs.find({"created_at": {"$gte": lookback_str}}, {"_id": 0}).to_list(1000)
        recent_expenses = await db.expenses.find({"created_at": {"$gte": lookback_str}}, {"_id": 0}).to_list(1000)
        # Merge both as "recent_requests"
        recent_requests = list(recent_needs) + list(recent_expenses)

        stock_products = await db.stock_products.find({"is_active": True}, {"_id": 0}).to_list(2000)
        recent_purchases = await db.stock_purchases.find(
            {"created_at": {"$gte": lookback_str}}, {"_id": 0}
        ).sort("created_at", -1).to_list(500)

        analyses = []
        for n in needs_pending:
            analyses.append(await analyze_single_request(
                db, n, recent_requests, recent_purchases, stock_products, available,
                id_field="id", self_ref="need_id",
            ))
        return {"treasury": treasury, "analyses": analyses}
    except Exception as e:
        logger.error(f"Error building needs analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))
