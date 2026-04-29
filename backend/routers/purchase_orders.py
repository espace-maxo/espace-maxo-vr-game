"""
Purchase Orders Router — workflow complet (BC → BL → Paiement).

Workflow :
  1. Admin convertit une dépense approuvée (expense.status='approved') en Bon de Commande.
     → PO status = 'draft'
  2. Admin envoie le BC (imprime/transmet) → status = 'sent'
  3. À la livraison :
     - Admin/gérante saisit les quantités reçues vs commandées.
     - Si toutes livrées → status = 'received' (+ BL émis).
     - Sinon → status = 'partially_received', livraisons successives possibles.
     - Un mouvement stock 'entree' est créé pour chaque article reçu (match sur
       nom normalisé, sinon auto-création d'un produit stock lié).
  4. Admin enregistre le paiement → status = 'paid'.

Collections :
  - purchase_orders : { id, number, supplier_id, supplier_name, expense_id,
                        items: [{description, quantity_ordered, quantity_received,
                                 unit_price, amount, stock_product_id}],
                        status, total_amount, notes,
                        created_at, sent_at, received_at, paid_at,
                        delivery_notes: [ { date, received_items, user } ],
                        payment: { amount, method, date, reference } }
"""
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import List, Optional
import uuid
import logging
import re
import unicodedata

router = APIRouter(tags=["purchase-orders"])
db = None
logger = logging.getLogger(__name__)


def set_db(database):
    global db
    db = database


VALID_STATUSES = {"draft", "sent", "partially_received", "received", "paid", "cancelled"}


def _strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn")


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", _strip_accents(s).lower()).strip()


async def _next_po_number() -> str:
    ym = datetime.now(timezone.utc).strftime("%Y%m")
    prefix = f"BC-{ym}-"
    count = await db.purchase_orders.count_documents({"number": {"$regex": f"^{prefix}"}})
    return f"{prefix}{count + 1:04d}"


# ==================== MODELS ====================

class POItem(BaseModel):
    description: str
    quantity_ordered: float = 1
    quantity_received: float = 0
    unit_price: float = 0
    amount: Optional[float] = None
    unit: Optional[str] = "pcs"
    stock_product_id: Optional[str] = None


class POCreate(BaseModel):
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    expense_id: Optional[str] = None
    items: List[POItem]
    notes: Optional[str] = ""
    created_by: Optional[str] = "Admin"


class PostReceiveItem(BaseModel):
    description: str
    quantity_received: float
    unit_price: Optional[float] = None


class ReceivePayload(BaseModel):
    items: List[PostReceiveItem]
    user_name: Optional[str] = "Admin"
    delivery_note_ref: Optional[str] = ""
    notes: Optional[str] = ""


class PaymentPayload(BaseModel):
    amount: float
    method: str = "cash"  # cash, bank_transfer, mobile_money, cheque, autre
    date: Optional[str] = None
    reference: Optional[str] = ""
    user_name: Optional[str] = "Admin"


# ==================== CRUD ====================

@router.get("/purchase-orders")
async def list_purchase_orders(status: Optional[str] = None, supplier_id: Optional[str] = None):
    query = {}
    if status and status != "all":
        query["status"] = status
    if supplier_id:
        query["supplier_id"] = supplier_id
    items = await db.purchase_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return {"purchase_orders": items}


@router.get("/purchase-orders/{po_id}")
async def get_purchase_order(po_id: str):
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(404, "Bon de commande non trouvé")
    return po


@router.post("/purchase-orders")
async def create_purchase_order(data: POCreate):
    try:
        total = 0
        items_out = []
        for it in data.items:
            qty = it.quantity_ordered or 1
            up = it.unit_price or 0
            amt = it.amount if it.amount is not None else qty * up
            items_out.append({
                "description": it.description,
                "quantity_ordered": qty,
                "quantity_received": it.quantity_received or 0,
                "unit_price": up,
                "amount": amt,
                "unit": it.unit or "pcs",
                "stock_product_id": it.stock_product_id,
            })
            total += amt

        supplier_name = data.supplier_name
        if data.supplier_id and not supplier_name:
            s = await db.caisse_suppliers.find_one({"id": data.supplier_id}, {"_id": 0})
            if s:
                supplier_name = s.get("name")

        doc = {
            "id": str(uuid.uuid4()),
            "number": await _next_po_number(),
            "supplier_id": data.supplier_id,
            "supplier_name": supplier_name or "-",
            "expense_id": data.expense_id,
            "items": items_out,
            "status": "draft",
            "total_amount": total,
            "notes": data.notes or "",
            "created_by": data.created_by,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "delivery_notes": [],
            "payment": None,
        }
        await db.purchase_orders.insert_one(doc)
        doc.pop("_id", None)
        return {"success": True, "purchase_order": doc}
    except Exception as e:
        logger.error(f"Create PO error: {e}")
        raise HTTPException(500, str(e))


@router.post("/purchase-orders/from-expense/{expense_id}")
async def create_po_from_expense(expense_id: str, body: dict = Body(default={})):
    try:
        e = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
        if not e:
            raise HTTPException(404, "Dépense non trouvée")
        if e.get("status") != "approved":
            raise HTTPException(400, "La dépense doit être approuvée avant conversion en BC")
        if e.get("converted_to_po_id"):
            raise HTTPException(400, "Cette dépense est déjà convertie en BC")

        items_src = e.get("items") or []
        if not items_src:
            items_src = [{
                "description": e.get("description", ""),
                "quantity": e.get("quantity", 1) or 1,
                "unit_price": e.get("unit_price", 0) or 0,
                "amount": e.get("amount", 0) or 0,
            }]

        items_out = []
        for it in items_src:
            qty = it.get("quantity", 1) or 1
            up = it.get("unit_price", 0) or 0
            amt = it.get("amount") or qty * up
            items_out.append({
                "description": it.get("description") or it.get("name") or "",
                "quantity_ordered": qty,
                "quantity_received": 0,
                "unit_price": up,
                "amount": amt,
                "unit": it.get("unit") or "pcs",
                "stock_product_id": None,
            })

        supplier_id = (body or {}).get("supplier_id") or e.get("supplier_id")
        supplier_name = (body or {}).get("supplier_name") or e.get("supplier")
        if supplier_id and not supplier_name:
            s = await db.caisse_suppliers.find_one({"id": supplier_id}, {"_id": 0})
            if s:
                supplier_name = s.get("name")

        doc = {
            "id": str(uuid.uuid4()),
            "number": await _next_po_number(),
            "supplier_id": supplier_id,
            "supplier_name": supplier_name or "-",
            "expense_id": expense_id,
            "items": items_out,
            "status": "draft",
            "total_amount": sum(i["amount"] for i in items_out),
            "notes": e.get("description", ""),
            "created_by": (body or {}).get("created_by") or "Admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "delivery_notes": [],
            "payment": None,
        }
        await db.purchase_orders.insert_one(doc)
        doc.pop("_id", None)
        await db.expenses.update_one(
            {"id": expense_id},
            {"$set": {"converted_to_po_id": doc["id"], "converted_to_po_number": doc["number"]}}
        )
        return {"success": True, "purchase_order": doc}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"from-expense PO error: {e}")
        raise HTTPException(500, str(e))


@router.put("/purchase-orders/{po_id}")
async def update_purchase_order(po_id: str, data: dict = Body(...)):
    """Update draft PO (items/notes/supplier). Not allowed after 'sent'."""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(404, "BC non trouvé")
    if po.get("status") not in ("draft",):
        raise HTTPException(400, "Seuls les BC en brouillon peuvent être modifiés")

    allowed = {"supplier_id", "supplier_name", "notes", "items"}
    update = {k: v for k, v in data.items() if k in allowed}
    if "items" in update:
        total = 0
        for it in update["items"]:
            qty = it.get("quantity_ordered", 1) or 1
            up = it.get("unit_price", 0) or 0
            amt = it.get("amount") if it.get("amount") is not None else qty * up
            it["quantity_ordered"] = qty
            it["unit_price"] = up
            it["amount"] = amt
            it.setdefault("quantity_received", 0)
            it.setdefault("unit", "pcs")
            it.setdefault("stock_product_id", None)
            total += amt
        update["total_amount"] = total
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.purchase_orders.update_one({"id": po_id}, {"$set": update})
    return {"success": True}


@router.post("/purchase-orders/{po_id}/send")
async def mark_po_sent(po_id: str, body: dict = Body(default={})):
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(404, "BC non trouvé")
    if po["status"] != "draft":
        raise HTTPException(400, "Seuls les BC en brouillon peuvent être envoyés")
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {
            "status": "sent",
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "sent_by": (body or {}).get("user_name", "Admin"),
        }}
    )
    return {"success": True}


@router.post("/purchase-orders/{po_id}/cancel")
async def cancel_po(po_id: str, body: dict = Body(default={})):
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(404, "BC non trouvé")
    if po["status"] in ("received", "paid"):
        raise HTTPException(400, "Impossible d'annuler un BC déjà reçu/payé")
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {
            "status": "cancelled",
            "cancelled_at": datetime.now(timezone.utc).isoformat(),
            "cancel_reason": (body or {}).get("reason", ""),
        }}
    )
    return {"success": True}


# ==================== RECEPTION (BL) ====================

async def _create_or_match_stock_product(description: str, unit_price: float, unit: str):
    """Find a stock product by normalized name; return its id or create one."""
    target = _norm(description)
    if not target:
        return None
    # Try exact normalized match
    prods = await db.stock_products.find({"is_active": True}, {"_id": 0}).to_list(5000)
    for p in prods:
        if _norm(p.get("name", "")) == target:
            return p["id"]
    # Fuzzy-ish: substring (last resort)
    for p in prods:
        if target and target in _norm(p.get("name", "")):
            return p["id"]
    # Create a new stock product in the "Autres"/default category if any
    default_cat = await db.stock_categories.find_one({}, {"_id": 0})
    if not default_cat:
        return None
    new = {
        "id": str(uuid.uuid4()),
        "code": "",
        "name": description,
        "category_id": default_cat["id"],
        "subcategory": "",
        "unit": unit or "pcs",
        "quantity": 0,
        "stock_min": 1,
        "stock_max": 100,
        "purchase_price": unit_price or 0,
        "supplier_id": "",
        "storage_location": "",
        "is_active": True,
        "photo_url": "",
        "date_achat": "",
        "date_peremption": "",
        "observation": "Auto-créé depuis BC",
        "statut": "normal",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.stock_products.insert_one(new)
    return new["id"]


@router.post("/purchase-orders/{po_id}/receive")
async def receive_purchase_order(po_id: str, data: ReceivePayload):
    """Émet un bordereau de livraison : enregistre qtés reçues, crée mouvements stock,
    met à jour le statut du BC (partially_received / received)."""
    try:
        po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
        if not po:
            raise HTTPException(404, "BC non trouvé")
        if po["status"] in ("draft",):
            raise HTTPException(400, "Le BC doit d'abord être envoyé avant la réception")
        if po["status"] in ("received", "paid", "cancelled"):
            raise HTTPException(400, "BC déjà clôturé")

        items = list(po["items"])
        received_log = []
        for rec in data.items:
            if rec.quantity_received <= 0:
                continue
            # find matching item by description (case-insensitive normalized)
            target = _norm(rec.description)
            matched = None
            for it in items:
                if _norm(it["description"]) == target:
                    matched = it
                    break
            if not matched:
                continue
            new_qty = (matched.get("quantity_received", 0) or 0) + rec.quantity_received
            # cap at quantity_ordered
            matched["quantity_received"] = min(new_qty, matched["quantity_ordered"])

            # Ensure/match stock product
            sp_id = matched.get("stock_product_id")
            if not sp_id:
                sp_id = await _create_or_match_stock_product(
                    matched["description"], matched["unit_price"], matched.get("unit", "pcs")
                )
                matched["stock_product_id"] = sp_id

            # Create stock movement "entree"
            if sp_id:
                # Apply portionnement rule: convert purchase qty into portions for non-liquid products.
                # The rule lookup is local to this file via stock_products + portion_* collections.
                sp_doc = await db.stock_products.find_one({"id": sp_id}, {"_id": 0}) or {}
                # Inline resolve of portion factor (avoid circular import with stock router)
                category_id = sp_doc.get("category_id", "")
                override = await db.portion_product_overrides.find_one({"stock_product_id": sp_id}, {"_id": 0})
                cat_rule = await db.portion_category_rules.find_one({"category_id": category_id}, {"_id": 0}) if category_id else None
                portion_factor = 1.0
                is_liquid = False
                if override:
                    portion_factor = float(override.get("portions_per_unit", 1.0) or 1.0)
                    is_liquid = override.get("is_liquid")
                    if is_liquid is None:
                        is_liquid = bool((cat_rule or {}).get("is_liquid", False))
                elif cat_rule:
                    portion_factor = float(cat_rule.get("portions_per_unit", 1.0) or 1.0)
                    is_liquid = bool(cat_rule.get("is_liquid", False))

                effective_qty = rec.quantity_received if is_liquid else rec.quantity_received * portion_factor
                mvt = {
                    "id": str(uuid.uuid4()),
                    "product_id": sp_id,
                    "movement_type": "entree",
                    "quantity": effective_qty,
                    "unit_price": (rec.unit_price if rec.unit_price is not None else matched["unit_price"]) / (portion_factor if (not is_liquid and portion_factor) else 1),
                    "reason": (
                        f"Réception BC {po['number']} ({rec.quantity_received} × {portion_factor} portion/u = {effective_qty} portions)"
                        if (not is_liquid and portion_factor != 1.0)
                        else f"Réception BC {po['number']}"
                    ),
                    "user_name": data.user_name,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.stock_movements.insert_one(mvt)
                await db.stock_products.update_one(
                    {"id": sp_id},
                    {"$inc": {"quantity": effective_qty}}
                )

            received_log.append({
                "description": matched["description"],
                "quantity": rec.quantity_received,
                "unit_price": rec.unit_price if rec.unit_price is not None else matched["unit_price"],
                "stock_product_id": sp_id,
            })

        # Determine new status
        all_received = all(it["quantity_received"] >= it["quantity_ordered"] for it in items)
        new_status = "received" if all_received else "partially_received"

        delivery_note = {
            "id": str(uuid.uuid4()),
            "date": datetime.now(timezone.utc).isoformat(),
            "user_name": data.user_name,
            "ref": data.delivery_note_ref or "",
            "notes": data.notes or "",
            "received_items": received_log,
        }

        update = {
            "items": items,
            "status": new_status,
        }
        if new_status == "received":
            update["received_at"] = datetime.now(timezone.utc).isoformat()

        await db.purchase_orders.update_one(
            {"id": po_id},
            {"$set": update, "$push": {"delivery_notes": delivery_note}}
        )

        return {
            "success": True,
            "status": new_status,
            "delivery_note": delivery_note,
            "received_count": len(received_log),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Receive PO error: {e}")
        raise HTTPException(500, str(e))


# ==================== PAYMENT ====================

@router.post("/purchase-orders/{po_id}/pay")
async def mark_po_paid(po_id: str, data: PaymentPayload):
    try:
        po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
        if not po:
            raise HTTPException(404, "BC non trouvé")
        if po["status"] not in ("received", "partially_received"):
            raise HTTPException(400, "Le BC doit être au moins partiellement reçu avant paiement")
        payment = {
            "amount": data.amount,
            "method": data.method,
            "date": data.date or datetime.now(timezone.utc).isoformat(),
            "reference": data.reference or "",
            "user_name": data.user_name,
        }
        await db.purchase_orders.update_one(
            {"id": po_id},
            {"$set": {
                "payment": payment,
                "status": "paid",
                "paid_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
        return {"success": True, "payment": payment}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Pay PO error: {e}")
        raise HTTPException(500, str(e))


@router.delete("/purchase-orders/{po_id}")
async def delete_purchase_order(po_id: str):
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(404, "BC non trouvé")
    if po["status"] not in ("draft", "cancelled"):
        raise HTTPException(400, "Seuls les BC en brouillon ou annulés peuvent être supprimés")
    await db.purchase_orders.delete_one({"id": po_id})
    return {"success": True}
