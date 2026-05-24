"""
Shopping List Router — Suivi des achats à faire pour le Restaurant et les Réservations.

Chaque item peut être :
  - lié à une demande d'achat (expense_id, item_index) — généré automatiquement
    à la création/validation d'une expense, ou ajouté manuellement.
  - lié à une réservation Location (reservation_id) — généré par conversion
    d'une simulation, ou ajouté manuellement.
  - autonome (scope="restaurant", sans expense_id) — ajout libre.

Workflow :
  1. La Gérante consulte la liste des items "à acheter" (filtre status=pending).
  2. Quand elle achète un article, elle coche → saisit le vrai prix payé +
     fournisseur réel (optionnels).
  3. On enregistre done_by + done_at + real_unit_price + real_supplier.
  4. Possibilité de "décocher" pour annuler.

Collection MongoDB : shopping_list_items
{
  id, name, quantity, unit, estimated_unit_price, estimated_total,
  scope ("restaurant" | "reservation"),
  reservation_id (optional), reservation_label (optional),
  expense_id (optional), expense_item_index (optional),
  category, notes,
  status ("pending" | "done"), done_by, done_at,
  real_unit_price, real_supplier, real_total,
  created_at, created_by
}
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["shopping-list"])
db = None
logger = logging.getLogger(__name__)


def set_db(database):
    global db
    db = database


# ============================================================================
# MODELS
# ============================================================================

class ShoppingItemCreate(BaseModel):
    name: str
    quantity: float = 1
    unit: Optional[str] = ""
    estimated_unit_price: float = 0
    scope: str = "restaurant"  # "restaurant" | "reservation"
    reservation_id: Optional[str] = None
    reservation_label: Optional[str] = None
    expense_id: Optional[str] = None
    expense_item_index: Optional[int] = None
    category: Optional[str] = ""
    notes: Optional[str] = ""
    created_by: Optional[str] = ""


class ShoppingItemMarkDone(BaseModel):
    done_by: str
    real_unit_price: Optional[float] = None
    real_supplier: Optional[str] = ""
    notes: Optional[str] = None
    # Achats Manager / Appro Manager — mode de paiement (24/05/2026)
    payment_mode: Optional[str] = None  # "fonds_propres" | "caisse_restau"


class ShoppingItemUpdate(BaseModel):
    name: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    estimated_unit_price: Optional[float] = None
    real_unit_price: Optional[float] = None
    category: Optional[str] = None
    notes: Optional[str] = None
    payment_mode: Optional[str] = None


class ShoppingItemReimburse(BaseModel):
    reimbursed_by: Optional[str] = None


# ============================================================================
# HELPERS
# ============================================================================

def _serialize(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/shopping-list")
async def list_items(
    scope: Optional[str] = None,           # 'restaurant' | 'reservation'
    status: Optional[str] = None,          # 'pending' | 'done'
    reservation_id: Optional[str] = None,
    expense_id: Optional[str] = None,
    limit: int = 500,
):
    q = {}
    if scope:
        q["scope"] = scope
    if status:
        q["status"] = status
    if reservation_id:
        q["reservation_id"] = reservation_id
    if expense_id:
        q["expense_id"] = expense_id
    rows = await db.shopping_list_items.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)

    # Aggregate stats
    total = len(rows)
    done_count = sum(1 for r in rows if r.get("status") == "done")
    pending_count = total - done_count
    estimated_total = sum((r.get("estimated_unit_price") or 0) * (r.get("quantity") or 0) for r in rows)
    real_total = sum((r.get("real_unit_price") or 0) * (r.get("quantity") or 0) for r in rows if r.get("status") == "done")
    return {
        "items": rows,
        "stats": {
            "total": total,
            "done": done_count,
            "pending": pending_count,
            "estimated_total": estimated_total,
            "real_total_spent": real_total,
        },
    }


@router.post("/shopping-list")
async def create_item(data: ShoppingItemCreate):
    if not (data.name or "").strip():
        raise HTTPException(400, "Le nom de l'article est requis")
    if data.scope not in ("restaurant", "reservation"):
        raise HTTPException(400, "scope doit être 'restaurant' ou 'reservation'")

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "name": data.name.strip(),
        "quantity": float(data.quantity or 1),
        "unit": (data.unit or "").strip(),
        "estimated_unit_price": float(data.estimated_unit_price or 0),
        "estimated_total": float(data.estimated_unit_price or 0) * float(data.quantity or 1),
        "scope": data.scope,
        "reservation_id": data.reservation_id,
        "reservation_label": data.reservation_label,
        "expense_id": data.expense_id,
        "expense_item_index": data.expense_item_index,
        "category": (data.category or "").strip(),
        "notes": (data.notes or "").strip(),
        "status": "pending",
        "done_by": None,
        "done_at": None,
        "real_unit_price": None,
        "real_supplier": "",
        "real_total": None,
        "created_at": now,
        "created_by": (data.created_by or "").strip(),
    }
    await db.shopping_list_items.insert_one(doc)
    return {"success": True, "item": _serialize(doc)}


@router.patch("/shopping-list/{item_id}")
async def update_item(item_id: str, data: ShoppingItemUpdate):
    existing = await db.shopping_list_items.find_one({"id": item_id})
    if not existing:
        raise HTTPException(404, "Item non trouvé")
    update = {}
    if data.name is not None: update["name"] = data.name.strip()
    if data.quantity is not None: update["quantity"] = float(data.quantity)
    if data.unit is not None: update["unit"] = data.unit.strip()
    if data.estimated_unit_price is not None:
        update["estimated_unit_price"] = float(data.estimated_unit_price)
    if data.real_unit_price is not None:
        update["real_unit_price"] = float(data.real_unit_price)
    if data.category is not None: update["category"] = data.category.strip()
    if data.notes is not None: update["notes"] = data.notes.strip()
    if data.payment_mode is not None:
        if data.payment_mode not in ("fonds_propres", "caisse_restau", ""):
            raise HTTPException(400, "payment_mode invalide")
        update["payment_mode"] = data.payment_mode or None
        if data.payment_mode == "fonds_propres" and existing.get("reimbursed") is None:
            update["reimbursed"] = False
    # Recompute estimated_total
    qty = update.get("quantity", existing.get("quantity") or 0)
    eup = update.get("estimated_unit_price", existing.get("estimated_unit_price") or 0)
    update["estimated_total"] = qty * eup
    # Recompute real_total if needed
    rup = update.get("real_unit_price", existing.get("real_unit_price"))
    if rup is not None:
        update["real_total"] = qty * rup
    await db.shopping_list_items.update_one({"id": item_id}, {"$set": update})
    doc = await db.shopping_list_items.find_one({"id": item_id}, {"_id": 0})
    return {"success": True, "item": doc}


@router.post("/shopping-list/{item_id}/done")
async def mark_done(item_id: str, data: ShoppingItemMarkDone):
    existing = await db.shopping_list_items.find_one({"id": item_id})
    if not existing:
        raise HTTPException(404, "Item non trouvé")
    if existing.get("status") == "done":
        return {"success": True, "already_done": True}
    now = datetime.now(timezone.utc).isoformat()
    real_unit = float(data.real_unit_price) if data.real_unit_price is not None else float(existing.get("estimated_unit_price") or 0)
    qty = float(existing.get("quantity") or 0)
    update = {
        "status": "done",
        "done_by": (data.done_by or "").strip() or "—",
        "done_at": now,
        "real_unit_price": real_unit,
        "real_supplier": (data.real_supplier or "").strip(),
        "real_total": real_unit * qty,
    }
    # Mode de paiement (optionnel mais recommandé)
    if data.payment_mode:
        if data.payment_mode not in ("fonds_propres", "caisse_restau"):
            raise HTTPException(400, "payment_mode invalide (fonds_propres | caisse_restau)")
        update["payment_mode"] = data.payment_mode
        if data.payment_mode == "fonds_propres":
            update["reimbursed"] = False
    if data.notes is not None:
        update["notes"] = (data.notes or "").strip()
    await db.shopping_list_items.update_one({"id": item_id}, {"$set": update})
    doc = await db.shopping_list_items.find_one({"id": item_id}, {"_id": 0})
    return {"success": True, "item": doc}


@router.post("/shopping-list/{item_id}/undo")
async def mark_undone(item_id: str):
    existing = await db.shopping_list_items.find_one({"id": item_id})
    if not existing:
        raise HTTPException(404, "Item non trouvé")
    await db.shopping_list_items.update_one(
        {"id": item_id},
        {"$set": {
            "status": "pending",
            "done_by": None,
            "done_at": None,
            "real_unit_price": None,
            "real_supplier": "",
            "real_total": None,
            "payment_mode": None,
            "reimbursed": None,
            "reimbursed_at": None,
            "reimbursed_by": None,
        }},
    )
    doc = await db.shopping_list_items.find_one({"id": item_id}, {"_id": 0})
    return {"success": True, "item": doc}


@router.post("/shopping-list/{item_id}/reimburse")
async def reimburse_item(item_id: str, data: ShoppingItemReimburse):
    """Marque un item Fonds Propres comme remboursé depuis la caisse.
    Apparaîtra dans le Point de la Caisse du jour."""
    existing = await db.shopping_list_items.find_one({"id": item_id})
    if not existing:
        raise HTTPException(404, "Item non trouvé")
    if existing.get("payment_mode") != "fonds_propres":
        raise HTTPException(400, "Cet item n'est pas en Fonds Propres")
    if existing.get("reimbursed"):
        raise HTTPException(400, "Déjà remboursé")
    now = datetime.now(timezone.utc).isoformat()
    await db.shopping_list_items.update_one(
        {"id": item_id},
        {"$set": {
            "reimbursed": True,
            "reimbursed_at": now,
            "reimbursed_by": (data.reimbursed_by or "Administrateur"),
        }},
    )
    return {"success": True}


@router.post("/shopping-list/reimburse-all")
async def reimburse_all_items(data: ShoppingItemReimburse):
    """Rembourse en bloc tous les items Fonds Propres pending (non remboursés)."""
    now = datetime.now(timezone.utc).isoformat()
    by = data.reimbursed_by or "Administrateur"
    cursor = db.shopping_list_items.find(
        {"payment_mode": "fonds_propres", "reimbursed": {"$ne": True}, "status": "done"},
        {"_id": 0},
    )
    docs = await cursor.to_list(5000)
    if not docs:
        return {"success": True, "count": 0, "total_amount": 0}
    ids = [d["id"] for d in docs]
    total = sum(float(d.get("real_total") or d.get("estimated_total") or 0) for d in docs)
    await db.shopping_list_items.update_many(
        {"id": {"$in": ids}},
        {"$set": {
            "reimbursed": True,
            "reimbursed_at": now,
            "reimbursed_by": by,
        }},
    )
    return {"success": True, "count": len(ids), "total_amount": total}


@router.get("/shopping-list/payment-mode-cumul")
async def shopping_payment_mode_cumul():
    """Cumul des items shopping_list achetés par mode de paiement."""
    rows = await db.shopping_list_items.find(
        {"status": "done", "payment_mode": {"$in": ["fonds_propres", "caisse_restau"]}},
        {"_id": 0},
    ).to_list(10000)
    def _amt(r):
        return float(r.get("real_total") if r.get("real_total") is not None else (r.get("estimated_total") or 0))
    fonds = [r for r in rows if r.get("payment_mode") == "fonds_propres"]
    caisse = [r for r in rows if r.get("payment_mode") == "caisse_restau"]
    fonds_reimb = [r for r in fonds if r.get("reimbursed")]
    fonds_pending = [r for r in fonds if not r.get("reimbursed")]
    return {
        "fonds_propres": {
            "total": sum(_amt(r) for r in fonds),
            "count": len(fonds),
            "reimbursed_total": sum(_amt(r) for r in fonds_reimb),
            "reimbursed_count": len(fonds_reimb),
            "pending_total": sum(_amt(r) for r in fonds_pending),
            "pending_count": len(fonds_pending),
        },
        "caisse_restau": {
            "total": sum(_amt(r) for r in caisse),
            "count": len(caisse),
        },
    }


@router.delete("/shopping-list/{item_id}")
async def delete_item(item_id: str):
    r = await db.shopping_list_items.delete_one({"id": item_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Item non trouvé")
    return {"success": True}


# ----------------------------------------------------------------------------
# IMPORTS — depuis une demande d'achat ou une simulation/réservation
# ----------------------------------------------------------------------------

class ImportFromExpensePayload(BaseModel):
    expense_id: str
    created_by: Optional[str] = ""


@router.post("/shopping-list/from-expense")
async def from_expense(data: ImportFromExpensePayload):
    """Convertit chaque item (non payment) d'une demande d'achat en items
    de courses à faire. Idempotent : ignore les items déjà importés."""
    exp = await db.expenses.find_one({"id": data.expense_id}, {"_id": 0})
    if not exp:
        raise HTTPException(404, "Demande d'achat introuvable")

    existing = await db.shopping_list_items.find(
        {"expense_id": data.expense_id},
        {"_id": 0, "expense_item_index": 1},
    ).to_list(500)
    existing_indexes = {e.get("expense_item_index") for e in existing}

    items = exp.get("items") or []
    if not items:
        # Single-item expense (legacy)
        items = [{
            "description": exp.get("description") or "",
            "quantity": exp.get("quantity", 1),
            "unit_price": exp.get("unit_price", exp.get("amount", 0)),
            "category": exp.get("category", ""),
        }]
    now = datetime.now(timezone.utc).isoformat()
    inserted = 0
    docs_to_insert = []
    for idx, it in enumerate(items):
        if it.get("category") == "paiement" or it.get("expense_type") == "paiement":
            continue
        if idx in existing_indexes:
            continue
        qty = float(it.get("quantity") or 1)
        unit = float(it.get("unit_price") or 0)
        docs_to_insert.append({
            "id": str(uuid.uuid4()),
            "name": (it.get("description") or "").strip() or "Article",
            "quantity": qty,
            "unit": "",
            "estimated_unit_price": unit,
            "estimated_total": qty * unit,
            "scope": "restaurant",
            "reservation_id": None,
            "reservation_label": None,
            "expense_id": data.expense_id,
            "expense_item_index": idx,
            "category": (it.get("category") or "").strip(),
            "notes": "",
            "status": "pending",
            "done_by": None,
            "done_at": None,
            "real_unit_price": None,
            "real_supplier": "",
            "real_total": None,
            "created_at": now,
            "created_by": (data.created_by or "").strip(),
        })
    if docs_to_insert:
        await db.shopping_list_items.insert_many(docs_to_insert)
        inserted = len(docs_to_insert)
    return {"success": True, "inserted": inserted, "skipped": len(existing_indexes)}


class ImportFromReservationPayload(BaseModel):
    reservation_id: str
    reservation_label: Optional[str] = ""
    items: List[dict]  # liste { name, quantity, unit_cost, source_type? }
    created_by: Optional[str] = ""


@router.post("/shopping-list/from-reservation")
async def from_reservation(data: ImportFromReservationPayload):
    """Crée des items de courses pour une réservation. Idempotent par nom
    sur la même réservation."""
    existing = await db.shopping_list_items.find(
        {"reservation_id": data.reservation_id},
        {"_id": 0, "name": 1},
    ).to_list(500)
    existing_names = {(e.get("name") or "").strip().lower() for e in existing}

    now = datetime.now(timezone.utc).isoformat()
    docs_to_insert = []
    for it in data.items or []:
        name = (it.get("label") or it.get("name") or "").strip()
        if not name:
            continue
        if name.lower() in existing_names:
            continue
        qty = float(it.get("quantity") or 1)
        unit = float(it.get("unit_cost") or 0)
        docs_to_insert.append({
            "id": str(uuid.uuid4()),
            "name": name,
            "quantity": qty,
            "unit": (it.get("unit") or "").strip(),
            "estimated_unit_price": unit,
            "estimated_total": qty * unit,
            "scope": "reservation",
            "reservation_id": data.reservation_id,
            "reservation_label": data.reservation_label or "",
            "expense_id": None,
            "expense_item_index": None,
            "category": "",
            "notes": "",
            "status": "pending",
            "done_by": None,
            "done_at": None,
            "real_unit_price": None,
            "real_supplier": "",
            "real_total": None,
            "created_at": now,
            "created_by": (data.created_by or "").strip(),
        })
    if docs_to_insert:
        await db.shopping_list_items.insert_many(docs_to_insert)
    return {"success": True, "inserted": len(docs_to_insert)}


@router.get("/shopping-list/stats/by-scope")
async def stats_by_scope():
    rows = await db.shopping_list_items.find({}, {"_id": 0}).to_list(2000)
    out = {
        "restaurant": {"total": 0, "done": 0, "pending": 0},
        "by_reservation": {},
    }
    for r in rows:
        if r.get("scope") == "restaurant":
            out["restaurant"]["total"] += 1
            if r.get("status") == "done":
                out["restaurant"]["done"] += 1
            else:
                out["restaurant"]["pending"] += 1
        elif r.get("scope") == "reservation":
            rid = r.get("reservation_id") or "unknown"
            key = rid
            if key not in out["by_reservation"]:
                out["by_reservation"][key] = {
                    "reservation_id": rid,
                    "reservation_label": r.get("reservation_label") or "",
                    "total": 0, "done": 0, "pending": 0,
                }
            out["by_reservation"][key]["total"] += 1
            if r.get("status") == "done":
                out["by_reservation"][key]["done"] += 1
            else:
                out["by_reservation"][key]["pending"] += 1
    out["by_reservation"] = list(out["by_reservation"].values())
    return out


class TransferToExpensePayload(BaseModel):
    item_ids: List[str]
    supplier: Optional[str] = ""
    description: Optional[str] = ""
    requested_by: Optional[str] = ""
    requested_by_role: Optional[str] = "admin"
    mark_done: bool = True  # marque les items shopping_list comme "done" après transfert


@router.post("/shopping-list/to-expense")
async def to_expense(data: TransferToExpensePayload):
    """Crée une demande d'achat (expense) à partir d'items sélectionnés
    dans Appro Manager. Marque les items comme « done » (rangés dans achats)
    sauf si mark_done=False."""
    if not data.item_ids:
        raise HTTPException(400, "Aucun item sélectionné")

    rows = await db.shopping_list_items.find(
        {"id": {"$in": data.item_ids}}, {"_id": 0}
    ).to_list(500)
    if not rows:
        raise HTTPException(404, "Items introuvables")

    now = datetime.now(timezone.utc).isoformat()
    # Heuristique fournisseur : utilise data.supplier sinon le scan_supplier
    # commun des items sinon "Multi"
    supplier = (data.supplier or "").strip()
    if not supplier:
        suppliers = set(filter(None, [(r.get("scan_supplier") or r.get("real_supplier") or "").strip() for r in rows]))
        supplier = suppliers.pop() if len(suppliers) == 1 else "Multi"

    expense_items = []
    total = 0.0
    for r in rows:
        qty = float(r.get("quantity") or 1)
        # Préfère le prix réel s'il existe, sinon estimé
        unit = float(r.get("real_unit_price") if r.get("real_unit_price") is not None else (r.get("estimated_unit_price") or 0))
        amount = qty * unit
        total += amount
        expense_items.append({
            "id": str(uuid.uuid4()),
            "description": r.get("name"),
            "quantity": qty,
            "unit_price": unit,
            "amount": amount,
            "category": r.get("category") or "fournitures",
            "expense_type": "courant",
        })

    desc = (data.description or "").strip() or f"Transfert Appro Manager — {supplier}"
    doc = {
        "id": str(uuid.uuid4()),
        "description": desc,
        "amount": total,
        "supplier": supplier,
        "category": "fournitures",
        "expense_type": "courant",
        "is_group": True,
        "items": expense_items,
        "original_items": [dict(it, id=str(uuid.uuid4())) for it in expense_items],
        "status": "pending",
        "requested_by": data.requested_by or "Admin",
        "requested_by_role": data.requested_by_role or "admin",
        "created_at": now,
        "updated_at": now,
        "source": "appro_manager",
    }
    await db.expenses.insert_one(doc)

    # Marquer les items comme done + lien vers l'expense
    if data.mark_done:
        await db.shopping_list_items.update_many(
            {"id": {"$in": data.item_ids}},
            {"$set": {
                "status": "done",
                "done_by": data.requested_by or "Admin",
                "done_at": now,
                "expense_id": doc["id"],
            }},
        )

    return {
        "success": True,
        "expense_id": doc["id"],
        "expense_total": total,
        "items_transferred": len(expense_items),
    }
