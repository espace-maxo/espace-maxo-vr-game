"""
Shopping List Router — Suivi des achats à faire pour le Restaurant et les Réservations.

Chaque item peut être :
  - lié à une demande d'achat (expense_id, item_index) — généré automatiquement
    à la création/validation d'une expense, ou ajouté manuellement.
  - lié à une réservation Location (reservation_id) — généré par conversion
    d'une simulation, ou ajouté manuellement.
  - autonome (scope="restaurant", sans expense_id) — ajout libre.

Workflow :
  1. La Responsable Op. & Log consulte la liste des items "à acheter" (filtre status=pending).
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


# Achats Manager Cumul — corrections de mode de paiement (25/05/2026)
class PaymentModeSwitch(BaseModel):
    target_mode: str  # "fonds_propres" | "caisse_restau"
    switched_by: Optional[str] = None


class PaymentModeTransfer(BaseModel):
    from_mode: str  # "fonds_propres" | "caisse_restau"
    to_mode: str    # "fonds_propres" | "caisse_restau"
    amount: float
    note: Optional[str] = None
    created_by: Optional[str] = None


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
    """Cumul des items shopping_list achetés par mode de paiement, avec ajustements de transfert."""
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

    # Ajustements via transferts manuels (corrections d'erreurs)
    # On déduit/ajoute UNIQUEMENT sur le pending de fonds_propres (cf. règle métier 2-a)
    transfers = await db.payment_mode_transfers.find({}, {"_id": 0}).to_list(5000)
    fp_to_cr = sum(float(t.get("amount") or 0) for t in transfers
                   if t.get("from_mode") == "fonds_propres" and t.get("to_mode") == "caisse_restau")
    cr_to_fp = sum(float(t.get("amount") or 0) for t in transfers
                   if t.get("from_mode") == "caisse_restau" and t.get("to_mode") == "fonds_propres")

    fonds_total = sum(_amt(r) for r in fonds)
    fonds_reimb_total = sum(_amt(r) for r in fonds_reimb)
    fonds_pending_total = sum(_amt(r) for r in fonds_pending)
    caisse_total = sum(_amt(r) for r in caisse)

    # Application des ajustements
    fonds_pending_total = fonds_pending_total - fp_to_cr + cr_to_fp
    fonds_total = fonds_reimb_total + fonds_pending_total
    caisse_total = caisse_total + fp_to_cr - cr_to_fp

    return {
        "fonds_propres": {
            "total": fonds_total,
            "count": len(fonds),
            "reimbursed_total": fonds_reimb_total,
            "reimbursed_count": len(fonds_reimb),
            "pending_total": fonds_pending_total,
            "pending_count": len(fonds_pending),
        },
        "caisse_restau": {
            "total": caisse_total,
            "count": len(caisse),
        },
        "transfers_adjustment": {
            "fp_to_cr": fp_to_cr,
            "cr_to_fp": cr_to_fp,
        },
    }


@router.post("/shopping-list/{item_id}/switch-payment-mode")
async def switch_payment_mode(item_id: str, data: PaymentModeSwitch):
    """Bascule le mode de paiement d'un item (Fonds Propres ↔ Caisse Restau).
    Règle métier : seul un item Fonds Propres NON remboursé peut basculer vers Caisse Restau.
    """
    if data.target_mode not in ("fonds_propres", "caisse_restau"):
        raise HTTPException(400, "target_mode invalide")
    existing = await db.shopping_list_items.find_one({"id": item_id})
    if not existing:
        raise HTTPException(404, "Item non trouvé")
    if existing.get("status") != "done":
        raise HTTPException(400, "Item non finalisé (status != done)")
    current = existing.get("payment_mode")
    if current == data.target_mode:
        return {"success": True, "noop": True}
    if current == "fonds_propres" and existing.get("reimbursed"):
        raise HTTPException(400, "Cet item Fonds Propres a déjà été remboursé, impossible de basculer")
    now = datetime.now(timezone.utc).isoformat()
    update = {"payment_mode": data.target_mode, "switched_at": now,
              "switched_by": (data.switched_by or "Administrateur")}
    if data.target_mode == "fonds_propres":
        update["reimbursed"] = False
        update["reimbursed_at"] = None
        update["reimbursed_by"] = None
    else:  # caisse_restau
        update["reimbursed"] = None
        update["reimbursed_at"] = None
        update["reimbursed_by"] = None
    await db.shopping_list_items.update_one({"id": item_id}, {"$set": update})
    doc = await db.shopping_list_items.find_one({"id": item_id}, {"_id": 0})
    return {"success": True, "item": doc}


@router.post("/shopping-list/payment-mode-transfer")
async def create_payment_mode_transfer(data: PaymentModeTransfer):
    """Crée un transfert (ajustement) entre Fonds Propres et Caisse Restau (ou inverse).
    N'altère AUCUN item — l'ajustement est purement comptable et impacte le cumul.
    Cas d'usage : corriger une erreur de saisie sans avoir à retoucher chaque item.
    """
    if data.from_mode == data.to_mode:
        raise HTTPException(400, "from_mode et to_mode doivent être différents")
    for m in (data.from_mode, data.to_mode):
        if m not in ("fonds_propres", "caisse_restau"):
            raise HTTPException(400, f"Mode invalide : {m}")
    amount = float(data.amount or 0)
    if amount <= 0:
        raise HTTPException(400, "Montant doit être > 0")

    # Vérification du solde disponible avant transfert
    cumul = await shopping_payment_mode_cumul()
    if data.from_mode == "fonds_propres":
        available = float(cumul["fonds_propres"]["pending_total"])
        if amount > available + 0.01:
            raise HTTPException(400, f"Solde Fonds Propres (pending) insuffisant : {available:.0f} F disponibles")
    else:
        available = float(cumul["caisse_restau"]["total"])
        if amount > available + 0.01:
            raise HTTPException(400, f"Solde Caisse Restau insuffisant : {available:.0f} F disponibles")

    transfer_doc = {
        "id": str(uuid.uuid4()),
        "from_mode": data.from_mode,
        "to_mode": data.to_mode,
        "amount": amount,
        "note": (data.note or "").strip(),
        "created_by": (data.created_by or "Administrateur"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "scope": "appro_manager",
    }
    await db.payment_mode_transfers.insert_one(transfer_doc.copy())
    return {"success": True, "transfer": transfer_doc}


@router.get("/shopping-list/payment-mode-transfers")
async def list_payment_mode_transfers():
    rows = await db.payment_mode_transfers.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"transfers": rows, "count": len(rows)}


@router.delete("/shopping-list/payment-mode-transfers/{transfer_id}")
async def delete_payment_mode_transfer(transfer_id: str):
    r = await db.payment_mode_transfers.delete_one({"id": transfer_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Transfert introuvable")
    return {"success": True}


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


# ========== TRANSFERT CAISSE RESTAU → ACHATS MANAGER (25/05/2026) ==========
# Pour chaque item Acheté en mode Caisse Restau, crée UNE dépense par item
# dans Achats > Achats Manager (visible dans le sous-onglet "Acheté").
# L'item Appro Manager reste mais est marqué `transferred_to_achat=true`.

class TransferCaisseToAchatPayload(BaseModel):
    item_ids: List[str] = []
    requested_by: Optional[str] = "Administrateur"


async def _transfer_one_caisse_item(item: dict, requested_by: str) -> Optional[dict]:
    """Crée une dépense individuelle dans Achats Manager pour un item shopping_list
    payé en Caisse Restau. Retourne le doc d'expense créé, ou None si déjà transféré."""
    if item.get("transferred_to_achat") and item.get("transferred_expense_id"):
        return None
    qty = float(item.get("quantity") or 1)
    unit = float(item.get("real_unit_price")
                 if item.get("real_unit_price") is not None
                 else (item.get("estimated_unit_price") or 0))
    amount = qty * unit
    now = datetime.now(timezone.utc).isoformat()
    # Mappe la catégorie shopping_list vers la catégorie expense (cuisine/bar/autres)
    raw_cat = (item.get("category") or "").lower()
    if raw_cat in ("bar", "boisson", "drink"):
        category = "bar"
    elif raw_cat in ("cuisine", "alimentaire", "food"):
        category = "cuisine"
    else:
        category = "autres"
    doc = {
        "id": str(uuid.uuid4()),
        "description": item.get("name") or "Achat Restau",
        "amount": amount,
        "quantity": qty,
        "unit_price": unit,
        "supplier": item.get("real_supplier") or item.get("scan_supplier") or "",
        "category": category,
        "expense_type": "courant",
        "is_group": False,
        "items": [],
        "status": "completed",
        "is_paid": True,
        "paid_at": now,
        "paid_by": item.get("done_by") or requested_by,
        "payment_mode": "caisse_restau",
        "completed_at": now,
        "source": "appro_manager",
        "requested_by": item.get("done_by") or requested_by,
        "requested_by_role": "admin",
        "created_at": now,
        "updated_at": now,
        "origin_shopping_item_id": item["id"],
    }
    await db.expenses.insert_one(doc.copy())
    # Marque l'item Appro Manager comme transféré (badge "Transféré en Achats")
    await db.shopping_list_items.update_one(
        {"id": item["id"]},
        {"$set": {
            "transferred_to_achat": True,
            "transferred_expense_id": doc["id"],
            "transferred_at": now,
            "transferred_by": requested_by,
        }},
    )
    return {k: v for k, v in doc.items() if k != "_id"}


@router.post("/shopping-list/{item_id}/transfer-to-achat-restau")
async def transfer_item_to_achat_restau(item_id: str, data: TransferCaisseToAchatPayload):
    """Transfère un item Caisse Restau Acheté vers Achats Manager (1 dépense)."""
    item = await db.shopping_list_items.find_one({"id": item_id})
    if not item:
        raise HTTPException(404, "Item introuvable")
    if item.get("status") != "done":
        raise HTTPException(400, "L'item n'est pas marqué comme acheté")
    if item.get("payment_mode") != "caisse_restau":
        raise HTTPException(400, "Seuls les items en Caisse Restau peuvent être transférés en Achat Restau")
    if item.get("transferred_to_achat"):
        raise HTTPException(400, "Item déjà transféré dans Achats Manager")
    created = await _transfer_one_caisse_item(item, data.requested_by or "Administrateur")
    return {"success": True, "expense": created}


@router.post("/shopping-list/transfer-all-caisse-to-achat-restau")
async def transfer_all_caisse_to_achat_restau(data: TransferCaisseToAchatPayload):
    """Transfère tous les items Caisse Restau Achetés (non encore transférés) vers Achats Manager."""
    query = {"status": "done", "payment_mode": "caisse_restau",
             "transferred_to_achat": {"$ne": True}}
    if data.item_ids:
        query["id"] = {"$in": data.item_ids}
    items = await db.shopping_list_items.find(query, {"_id": 0}).to_list(2000)
    created_list = []
    total = 0.0
    for it in items:
        r = await _transfer_one_caisse_item(it, data.requested_by or "Administrateur")
        if r:
            created_list.append(r)
            total += float(r.get("amount") or 0)
    return {
        "success": True,
        "count": len(created_list),
        "total_amount": total,
    }
