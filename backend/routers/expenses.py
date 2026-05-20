"""
Expenses Router - Gestion des dépenses/achats Caisse Pro.
Endpoints: CRUD + assign-week + bulk ops.
Le PUT status='completed' synchronise avec le module Stock (Entrées + stock_purchases).
"""
from fastapi import APIRouter, HTTPException, Body, Query
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import List, Optional
import uuid
import re
import logging

try:
    from services.sms_service import send_admin_sms_notification
except Exception:  # pragma: no cover
    async def send_admin_sms_notification(_msg: str) -> bool:
        return False

# Cash closure lock helper
try:
    from routers.cash_closures import is_date_closed
except Exception:  # pragma: no cover
    async def is_date_closed(_d):
        return None

router = APIRouter(tags=["expenses"])
db = None
logger = logging.getLogger(__name__)


def set_db(database):
    global db
    db = database


# ==================== PACKAGE CONDITIONING HELPERS ====================

# Matches suffixes like "(Casier de 24 bouteilles)", "(Pack de 6 bouteilles)",
# "(Carton de 12 sachets)", etc. Captures <tag>, <count>, <inner_unit>.
_COND_RE = re.compile(
    r"\s*\((casier|pack|carton|bac|caisse|sac|bidon|pot|plateau|paquet|lot)"
    r"\s+(?:de|of)\s+(\d+)\s+([a-zéèàâêîôûçùïüœ]+)\s*\)\s*",
    re.IGNORECASE,
)


def _expand_conditioning(description: str, quantity: float, unit_price: float, unit: str):
    """Si la description contient un suffixe du type '(Casier de 24 bouteilles)',
    multiplie la quantité par 24 et divise le prix unitaire par 24 pour obtenir
    la quantité et le prix par bouteille. Force aussi l'unité sur le contenu
    (bouteille, sachet, …) si l'unité d'origine n'est pas déjà cohérente.

    Retourne (clean_description, new_quantity, new_unit_price, new_unit, expanded_flag).
    Si rien n'est détecté, retourne les valeurs inchangées et expanded_flag=False.
    """
    if not description:
        return description, quantity, unit_price, unit, False

    m = _COND_RE.search(description)
    if not m:
        return description, quantity, unit_price, unit, False

    try:
        bundle_size = int(m.group(2))
    except (TypeError, ValueError):
        return description, quantity, unit_price, unit, False
    if bundle_size <= 0:
        return description, quantity, unit_price, unit, False

    inner_unit = m.group(3).lower().rstrip("s")  # "bouteilles" -> "bouteille"
    clean_desc = _COND_RE.sub(" ", description).strip()
    # Collapse any double spaces
    clean_desc = re.sub(r"\s+", " ", clean_desc)

    new_qty = (quantity or 0) * bundle_size
    new_price = (unit_price or 0) / bundle_size if unit_price else 0.0
    # Force unit to the inner unit (so stock tracks individual items, not packages)
    new_unit = inner_unit or (unit or "unite")

    return clean_desc, new_qty, new_price, new_unit, True


# ==================== CURRENT-ACCOUNT ALLOCATION HELPERS ====================

async def _allocate_expense_to_account(expense_doc: dict, account_id: str) -> None:
    """Register an 'expense_allocation' repayment on the given current account.

    Idempotent: if a previous allocation exists for this expense on this account, do nothing.
    The allocation has:
      method='expense_allocation', reference='EXP-{expense_id}', amount=expense.amount
    """
    if not account_id or not expense_doc:
        return
    expense_id = expense_doc.get("id")
    if not expense_id:
        return
    # Remove any prior allocations for this expense (across accounts) to avoid duplicates
    await db.current_accounts.update_many(
        {"repayments.reference": f"EXP-{expense_id}"},
        {"$pull": {"repayments": {"reference": f"EXP-{expense_id}"}}},
    )
    repayment = {
        "id": str(uuid.uuid4()),
        "repayment_date": datetime.now(timezone.utc).date().isoformat(),
        "amount": float(expense_doc.get("amount") or 0),
        "method": "expense_allocation",
        "reference": f"EXP-{expense_id}",
        "notes": f"Achat: {(expense_doc.get('description') or '')[:80]}",
        "expense_id": expense_id,
        "auto": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.current_accounts.update_one(
        {"id": account_id},
        {"$push": {"repayments": repayment}},
    )


async def _unallocate_expense_from_accounts(expense_id: str) -> None:
    """Remove any 'expense_allocation' repayment linked to this expense, on any account."""
    if not expense_id:
        return
    await db.current_accounts.update_many(
        {"repayments.reference": f"EXP-{expense_id}"},
        {"$pull": {"repayments": {"reference": f"EXP-{expense_id}"}}},
    )


# ==================== MODELS ====================

class ExpenseItem(BaseModel):
    category: str
    description: str
    quantity: float = 1
    unit_price: float
    amount: float
    struck: Optional[bool] = False
    strike_reason: Optional[str] = None
    expense_type: Optional[str] = None  # 'achat' | 'paiement'
    destination: Optional[str] = None  # 'cuisine'|'bar'|'salle'|'jeux_vr'|'jardin'|'administratif'
    # === DRINKS PURCHASE LINK === (added 20/05/2026)
    # Si renseigné, la synchro stock se fait DIRECTEMENT par id (plus de matching nom).
    stock_product_id: Optional[str] = None
    unit: Optional[str] = None  # ex: "bouteille", "casier"


class ExpenseCreate(BaseModel):
    category: str
    description: str
    quantity: Optional[float] = 1
    unit_price: Optional[float] = None
    amount: float
    supplier: Optional[str] = None
    planned_date: Optional[str] = None
    receipt_image: Optional[str] = None
    requested_by: str
    is_group: Optional[bool] = False
    group_id: Optional[str] = None
    items: Optional[List[ExpenseItem]] = None
    assigned_week: Optional[str] = None
    # Funding source — optional link to a current account
    funded_by_account_id: Optional[str] = None
    funded_by_account_name: Optional[str] = None
    funded_affects_ca: Optional[bool] = True  # if True, expense still deducted from daily CA
    # Type & destination (added 29/04/2026)
    expense_type: Optional[str] = "achat"  # 'achat' | 'paiement'
    destination: Optional[str] = None  # 'cuisine' | 'bar' | 'salle' | 'jeux_vr' | 'jardin' | 'administratif'


class ExpenseUpdate(BaseModel):
    category: Optional[str] = None
    description: Optional[str] = None
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    amount: Optional[float] = None
    supplier: Optional[str] = None
    planned_date: Optional[str] = None
    receipt_image: Optional[str] = None
    admin_notes: Optional[str] = None
    status: Optional[str] = None
    is_group: Optional[bool] = None
    items: Optional[List[ExpenseItem]] = None
    funded_by_account_id: Optional[str] = None
    funded_by_account_name: Optional[str] = None
    funded_affects_ca: Optional[bool] = None
    is_paid: Optional[bool] = None
    paid_at: Optional[str] = None
    paid_by: Optional[str] = None
    approved_by: Optional[str] = None
    # Admin can re-classify (added 29/04/2026)
    expense_type: Optional[str] = None
    destination: Optional[str] = None


# ==================== CRUD ====================

@router.get("/expenses")
async def get_expenses(
    status: Optional[str] = None,
    category: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    respect_assigned_week: Optional[bool] = None,
):
    """Get all expenses with optional filters. If respect_assigned_week=true, excludes expenses transferred to another week."""
    try:
        query = {}
        if status:
            query["status"] = status
        if category:
            query["category"] = category
        if start_date:
            query["created_at"] = {"$gte": start_date}
        if end_date:
            if "created_at" in query:
                query["created_at"]["$lte"] = end_date + "T23:59:59"
            else:
                query["created_at"] = {"$lte": end_date + "T23:59:59"}

        expenses = await db.expenses.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)

        if respect_assigned_week and (start_date or end_date):
            filtered = []
            for exp in expenses:
                aw = exp.get("assigned_week")
                if aw and aw != "" and aw is not None:
                    if start_date and end_date:
                        if aw < start_date or aw > end_date:
                            continue
                    elif start_date:
                        if aw < start_date:
                            continue
                filtered.append(exp)
            expenses = filtered

        return {"expenses": expenses}
    except Exception as e:
        logger.error(f"Error fetching expenses: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/expenses")
async def create_expense(
    expense: ExpenseCreate,
    actor_name: Optional[str] = Query(None),
    actor_role: Optional[str] = Query(None),
):
    """Create a new expense request (by manager)"""
    try:
        expense_doc = {
            "id": str(uuid.uuid4()),
            "category": expense.category,
            "description": expense.description,
            "quantity": expense.quantity or 1,
            "unit_price": expense.unit_price or expense.amount,
            "amount": expense.amount,
            "supplier": expense.supplier,
            "planned_date": expense.planned_date,
            "receipt_image": expense.receipt_image,
            "requested_by": expense.requested_by,
            "is_group": expense.is_group or False,
            "group_id": expense.group_id,
            "items": [item.model_dump() for item in expense.items] if expense.items else None,
            "status": "pending",
            "admin_notes": None,
            "approved_by": None,
            "approved_at": None,
            "completed_at": None,
            "assigned_week": expense.assigned_week,
            "funded_by_account_id": expense.funded_by_account_id,
            "funded_by_account_name": expense.funded_by_account_name,
            "funded_affects_ca": bool(expense.funded_affects_ca) if expense.funded_affects_ca is not None else True,
            # Type & destination
            "expense_type": expense.expense_type or "achat",
            "destination": expense.destination,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        await db.expenses.insert_one(expense_doc)
        expense_doc.pop("_id", None)

        # Audit trail (visible by admin only)
        try:
            from routers.invoices import _log_audit as _log_audit_fn
            snapshot_doc = {
                "id": expense_doc["id"],
                "invoice_number": (expense_doc.get("description") or "")[:40],
                "total": expense_doc.get("amount"),
                "items": [],
                "client_name": expense_doc.get("supplier"),
                "validation_status": expense_doc.get("status"),
            }
            await _log_audit_fn(
                "expense", snapshot_doc, "create",
                {"name": actor_name or expense_doc.get("requested_by"), "role": actor_role or "manager"},
                {"amount": {"from": None, "to": expense_doc.get("amount")},
                 "category": {"from": None, "to": expense_doc.get("category")},
                 "supplier": {"from": None, "to": expense_doc.get("supplier")},
                 "expense_type": {"from": None, "to": expense_doc.get("expense_type")}},
            )
        except Exception as _e:
            logger.error(f"expense audit failed: {_e}")

        # If funding source set → allocate on that current account now
        if expense_doc.get("funded_by_account_id"):
            try:
                await _allocate_expense_to_account(expense_doc, expense_doc["funded_by_account_id"])
            except Exception as alloc_err:
                logger.warning(f"Expense allocation failed: {alloc_err}")

        # SMS admin notification (new purchase request)
        try:
            items_lines = []
            for it in expense_doc.get("items") or []:
                q = it.get("quantity") or 1
                desc = (it.get("description") or "").strip()[:40]
                if desc:
                    items_lines.append(f"- {desc} x{q}")
            items_block = "\n".join(items_lines[:6]) or "(demande simple)"
            extra_count = max(0, len(expense_doc.get("items") or []) - 6)
            extra = f"\n+ {extra_count} autre(s)..." if extra_count > 0 else ""

            msg = (
                "[ACHATS] Nouvelle demande Espace Maxo\n"
                f"Categorie: {expense_doc.get('category', '-')}\n"
                f"Demande: {(expense_doc.get('description') or '')[:80]}\n"
                f"Par: {expense_doc.get('requested_by', '-')}\n"
                f"Montant: {(expense_doc.get('amount') or 0):,.0f} F".replace(",", " ")
                + f"\nArticles ({len(expense_doc.get('items') or [])}):\n"
                + f"{items_block}{extra}"
            )
            if expense_doc.get("supplier"):
                msg += f"\nFournisseur: {expense_doc['supplier'][:40]}"
            await send_admin_sms_notification(msg)
        except Exception as notif_err:
            logger.error(f"SMS new expense notification failed: {notif_err}")

        return {"success": True, "expense": expense_doc}
    except Exception as e:
        logger.error(f"Error creating expense: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/expenses/{expense_id}")
async def update_expense(expense_id: str, update: ExpenseUpdate):
    """Update an expense (admin can modify and request revision)"""
    try:
        expense = await db.expenses.find_one({"id": expense_id})
        if not expense:
            raise HTTPException(status_code=404, detail="Expense not found")

        # Cash closure lock : block edits if the expense's effective day is closed.
        # We protect modification of completed expenses on closed days; pending edits remain free.
        ref_date = (expense.get("completed_at") or expense.get("created_at") or "")[:10]
        closure = await is_date_closed(ref_date) if ref_date else None
        if closure and expense.get("status") == "completed":
            raise HTTPException(
                status_code=423,
                detail=f"Caisse clôturée pour le {ref_date}. Rouvrez le Z avant de modifier cette dépense."
            )

        was_completed_before = expense.get("status") == "completed"

        update_data = {}
        for k, v in update.model_dump().items():
            if v is not None:
                if k == "items" and v:
                    update_data[k] = [item if isinstance(item, dict) else item.model_dump() for item in v]
                else:
                    update_data[k] = v

        if update.status == "admin_review":
            # First validation by admin: snapshot the manager's original list (only once),
            # so the manager can keep seeing the original list in read-only.
            if not expense.get("original_items") and expense.get("is_group") and expense.get("items"):
                update_data["original_items"] = expense.get("items")
                update_data["original_amount"] = expense.get("amount")
            update_data["admin_review_at"] = datetime.now(timezone.utc).isoformat()
            # Recompute "working" amount excluding struck items, so admin sees the running total.
            try:
                items_for_total = update_data.get("items") or expense.get("items") or []
                if items_for_total:
                    kept_total = sum(
                        float(it.get("amount") or 0)
                        for it in items_for_total
                        if not it.get("struck")
                    )
                    if kept_total > 0:
                        update_data["amount"] = kept_total
            except Exception as recalc_err:
                logger.warning(f"Admin-review amount recompute failed: {recalc_err}")
        elif update.status == "approved":
            update_data["approved_at"] = datetime.now(timezone.utc).isoformat()
            # If grouped expense with items, recompute amount excluding struck items.
            # This guarantees the approved total matches what will actually be purchased.
            try:
                items_for_total = update_data.get("items")
                if items_for_total is None and expense.get("is_group"):
                    items_for_total = expense.get("items") or []
                if items_for_total:
                    kept_total = sum(
                        float(it.get("amount") or 0)
                        for it in items_for_total
                        if not it.get("struck")
                    )
                    if kept_total > 0:
                        update_data["amount"] = kept_total
            except Exception as recalc_err:
                logger.warning(f"Approval amount recompute failed: {recalc_err}")
        elif update.status == "completed":
            update_data["completed_at"] = datetime.now(timezone.utc).isoformat()

        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

        await db.expenses.update_one({"id": expense_id}, {"$set": update_data})

        # === Handle funding-source (current-account) allocation ===
        try:
            old_account = expense.get("funded_by_account_id")
            # Did the client request a change? Note: None in update means no-op; empty string means clear.
            new_account = update_data.get("funded_by_account_id", old_account)
            # Amount might have changed as well
            if new_account != old_account or "amount" in update_data:
                # Always unallocate first (idempotent)
                await _unallocate_expense_from_accounts(expense_id)
                if new_account:
                    refreshed = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
                    if refreshed:
                        await _allocate_expense_to_account(refreshed, new_account)
        except Exception as alloc_err:
            logger.warning(f"Expense funding-alloc sync failed: {alloc_err}")

        # === SYNC WITH STOCK MODULE (Achats Caisse → Entrées Stock) ===
        # Skip stock sync for "paiement" expenses (charges/services without inventory impact).
        is_paiement = (update_data.get("expense_type") or expense.get("expense_type")) == "paiement"
        if update.status == "completed" and not was_completed_before and not is_paiement:
            try:
                # Idempotency guard: skip if this expense was already synced (e.g. on hot-reload replay)
                already_synced = await db.stock_purchases.find_one({
                    "source": "caisse",
                    "expense_id": expense_id,
                })
                if already_synced:
                    logger.info(f"Expense {expense_id} already synced to stock, skipping")
                else:
                    updated_expense = await db.expenses.find_one({"id": expense_id})

                    if updated_expense.get("is_group") and updated_expense.get("items"):
                        expense_items = updated_expense["items"]
                    else:
                        expense_items = [{
                            "description": updated_expense.get("description", ""),
                            "quantity": updated_expense.get("quantity", 1),
                            "unit_price": updated_expense.get("unit_price") or updated_expense.get("amount", 0),
                            "amount": updated_expense.get("amount", 0),
                            "category": updated_expense.get("category", ""),
                        }]
    
                    stock_synced = 0
                    purchase_items_for_stock = []
                    now_iso = datetime.now(timezone.utc).isoformat()
    
                    for exp_item in expense_items:
                        # Skip lines marked as struck (rejected during admin validation)
                        if exp_item.get("struck"):
                            continue
                        item_desc = exp_item.get("description", "").strip()
                        item_qty = exp_item.get("quantity", 1) or 1
                        item_price = exp_item.get("unit_price", 0) or 0
                        item_unit_hint = exp_item.get("unit") or ""

                        if not item_desc and not exp_item.get("stock_product_id"):
                            continue

                        # === FAST-PATH : item lié à un produit Stock (Achat Boissons) ===
                        # Si stock_product_id est fourni, on saute le matching nom et on
                        # utilise directement l'id du produit (fiabilité 100%).
                        stock_product = None
                        if exp_item.get("stock_product_id"):
                            stock_product = await db.stock_products.find_one({
                                "id": exp_item["stock_product_id"],
                                "is_active": True,
                            })

                        if not stock_product:
                            # Expand package conditioning: "(Casier de 24 bouteilles)" → qty × 24
                            item_desc, item_qty, item_price, item_unit_hint, was_expanded = _expand_conditioning(
                                item_desc, item_qty, item_price, item_unit_hint
                            )
                            if was_expanded:
                                logger.info(
                                    f"Conditioning expanded: '{exp_item.get('description')}' "
                                    f"→ '{item_desc}' qty={item_qty} pu={item_price} unit={item_unit_hint}"
                                )

                            escaped = re.escape(item_desc)
                            stock_product = await db.stock_products.find_one({
                                "name": {"$regex": f"^{escaped}$", "$options": "i"},
                                "is_active": True,
                            })
                            if not stock_product:
                                stock_product = await db.stock_products.find_one({
                                    "name": {"$regex": f"^{escaped}", "$options": "i"},
                                    "is_active": True,
                                })
                            if not stock_product:
                                stock_product = await db.stock_products.find_one({
                                    "name": {"$regex": escaped, "$options": "i"},
                                    "is_active": True,
                                })
    
                        if stock_product:
                            old_qty = stock_product.get("quantity", 0)
                            new_qty = old_qty + item_qty
                            new_price = item_price if item_price > 0 else stock_product.get("purchase_price", 0)
                            new_valeur = new_qty * new_price
                            smin = stock_product.get("stock_min", 5)
                            new_statut = "rupture" if new_qty <= 0 else ("faible" if new_qty <= smin else "normal")
    
                            stock_mov = {
                                "id": str(uuid.uuid4()),
                                "product_id": stock_product["id"],
                                "product_name": stock_product["name"],
                                "product_code": stock_product.get("code", ""),
                                "movement_type": "entree",
                                "quantity": item_qty,
                                "previous_quantity": old_qty,
                                "new_quantity": new_qty,
                                "unit": stock_product.get("unit", ""),
                                "unit_price": new_price,
                                "total_value": item_qty * new_price,
                                "reason": f"Achat Caisse - {updated_expense.get('supplier', 'N/A')}",
                                "user_name": updated_expense.get("requested_by", "Caisse"),
                                "expense_id": expense_id,
                                "created_at": now_iso,
                            }
                            await db.stock_movements.insert_one(stock_mov)
    
                            await db.stock_products.update_one(
                                {"id": stock_product["id"]},
                                {"$set": {
                                    "quantity": new_qty,
                                    "purchase_price": new_price,
                                    "valeur_stock": new_valeur,
                                    "statut": new_statut,
                                    "updated_at": now_iso,
                                }}
                            )
                            purchase_items_for_stock.append({
                                "product_id": stock_product["id"],
                                "product_name": stock_product["name"],
                                "quantity": item_qty,
                                "unit_price": new_price,
                                "unit": stock_product.get("unit", ""),
                            })
                            stock_synced += 1
                            logger.info(f"Stock entree: {stock_product['name']} {old_qty} -> {new_qty} (expense {expense_id})")
                        else:
                            # Auto-create stock product (from 24/04/2026 onwards per user request)
                            # Ensure "Non classé" category exists
                            nonclass_cat = await db.stock_categories.find_one({
                                "name": {"$regex": "^Non classé$", "$options": "i"}
                            })
                            if not nonclass_cat:
                                nonclass_cat = {
                                    "id": str(uuid.uuid4()),
                                    "name": "Non classé",
                                    "description": "Catégorie par défaut pour les produits auto-créés depuis la Caisse",
                                    "color": "#64748b",
                                    "icon": "Package",
                                    "subcategories": [],
                                    "created_at": now_iso,
                                }
                                await db.stock_categories.insert_one(nonclass_cat)
                                logger.info("Auto-created stock category 'Non classé' for Caisse sync")
    
                            exp_unit = item_unit_hint or exp_item.get("unit") or "unite"
                            new_product = {
                                "id": str(uuid.uuid4()),
                                "code": f"AUTO-{str(uuid.uuid4())[:6].upper()}",
                                "name": item_desc,
                                "category_id": nonclass_cat["id"],
                                "subcategory": "",
                                "unit": exp_unit,
                                "quantity": item_qty,
                                "stock_min": 5,
                                "stock_max": max(100, item_qty * 4),
                                "purchase_price": item_price,
                                "valeur_stock": item_qty * item_price,
                                "supplier_id": "",
                                "storage_location": "",
                                "is_active": True,
                                "photo_url": "",
                                "date_achat": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                                "date_peremption": "",
                                "observation": f"Auto-créé depuis Achat Caisse ({updated_expense.get('supplier', 'N/A')})",
                                "statut": "rupture" if item_qty <= 0 else ("faible" if item_qty <= 5 else "normal"),
                                "auto_created_from_expense": expense_id,
                                "created_at": now_iso,
                                "updated_at": now_iso,
                            }
                            await db.stock_products.insert_one(new_product)
                            logger.info(f"Auto-created stock product '{item_desc}' (qty={item_qty}, price={item_price}) from expense {expense_id}")
    
                            # Movement linked to the new product
                            linked_mov = {
                                "id": str(uuid.uuid4()),
                                "product_id": new_product["id"],
                                "product_name": new_product["name"],
                                "product_code": new_product["code"],
                                "movement_type": "entree",
                                "quantity": item_qty,
                                "previous_quantity": 0,
                                "new_quantity": item_qty,
                                "unit": exp_unit,
                                "unit_price": item_price,
                                "total_value": item_qty * item_price,
                                "reason": f"Achat Caisse (produit auto-créé) - {updated_expense.get('supplier', 'N/A')}",
                                "user_name": updated_expense.get("requested_by", "Caisse"),
                                "expense_id": expense_id,
                                "created_at": now_iso,
                            }
                            await db.stock_movements.insert_one(linked_mov)
                            purchase_items_for_stock.append({
                                "product_id": new_product["id"],
                                "product_name": new_product["name"],
                                "quantity": item_qty,
                                "unit_price": item_price,
                                "unit": exp_unit,
                            })
                            stock_synced += 1
    
                    total_amount = sum(i.get("quantity", 0) * i.get("unit_price", 0) for i in purchase_items_for_stock)
                    stock_purchase = {
                        "id": str(uuid.uuid4()),
                        "supplier_id": "",
                        "supplier_name": updated_expense.get("supplier", "") or updated_expense.get("description", "Caisse"),
                        "purchase_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                        "items": purchase_items_for_stock,
                        "total_amount": total_amount,
                        "notes": f"Achat depuis la Caisse - {updated_expense.get('description', '')}",
                        "user_name": updated_expense.get("requested_by", "Caisse"),
                        "status": "validated",
                        "source": "caisse",
                        "expense_id": expense_id,
                        "created_at": now_iso,
                    }
                    await db.stock_purchases.insert_one(stock_purchase)
                    stock_purchase.pop("_id", None)
    
                    logger.info(f"Expense {expense_id} synced to stock: {stock_synced} products matched")
            except Exception as stock_err:
                logger.error(f"Error syncing expense to stock: {stock_err}")

        updated = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
        return {"success": True, "expense": updated}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating expense: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str):
    """Delete an expense"""
    try:
        # Cash closure lock for completed expenses
        existing = await db.expenses.find_one({"id": expense_id})
        if existing and existing.get("status") == "completed":
            ref_date = (existing.get("completed_at") or existing.get("created_at") or "")[:10]
            closure = await is_date_closed(ref_date) if ref_date else None
            if closure:
                raise HTTPException(
                    status_code=423,
                    detail=f"Caisse clôturée pour le {ref_date}. Rouvrez le Z avant de supprimer cette dépense."
                )

        # Unallocate from current account first (if any)
        try:
            await _unallocate_expense_from_accounts(expense_id)
        except Exception as alloc_err:
            logger.warning(f"Expense unalloc on delete failed: {alloc_err}")
        result = await db.expenses.delete_one({"id": expense_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Expense not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting expense: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== ASSIGN WEEK ====================

@router.put("/expenses/{expense_id}/assign-week")
async def assign_expense_to_week(expense_id: str, week_start: str = Body(..., embed=True)):
    """Assign an expense to a specific week (week_start = Monday's YYYY-MM-DD)"""
    try:
        expense = await db.expenses.find_one({"id": expense_id})
        if not expense:
            raise HTTPException(status_code=404, detail="Expense not found")

        await db.expenses.update_one({"id": expense_id}, {"$set": {"assigned_week": week_start}})

        updated = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
        return {"success": True, "expense": updated}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error assigning expense to week: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/expenses/assign-week-bulk")
async def assign_expenses_bulk(ids: List[str] = Body(...), week_start: str = Body(...)):
    """Assign multiple expenses to a specific week"""
    result = await db.expenses.update_many({"id": {"$in": ids}}, {"$set": {"assigned_week": week_start}})
    return {"success": True, "modified": result.modified_count}


@router.post("/expenses/unassign-week-bulk")
async def unassign_expenses_bulk(ids: List[str] = Body(..., embed=True)):
    """Remove week assignment from expenses"""
    result = await db.expenses.update_many({"id": {"$in": ids}}, {"$unset": {"assigned_week": ""}})
    return {"success": True, "modified": result.modified_count}


@router.post("/expenses/exclude-from-week-bulk")
async def exclude_expenses_from_week_bulk(
    ids: List[str] = Body(...),
    week_start: str = Body(...),
):
    """Hide expenses from a specific week's report WITHOUT deleting them from the global expense list.
    The expense remains intact (any 'assigned_week' is preserved); we just push the
    week_start into excluded_from_weeks[]. The /reports/weekly endpoint filters this out.
    """
    if not week_start:
        raise HTTPException(400, "week_start requis")
    result = await db.expenses.update_many(
        {"id": {"$in": ids}},
        {"$addToSet": {"excluded_from_weeks": week_start}},
    )
    return {"success": True, "modified": result.modified_count}


@router.post("/expenses/include-in-week-bulk")
async def include_expenses_in_week_bulk(
    ids: List[str] = Body(...),
    week_start: str = Body(...),
):
    """Reverse exclusion: re-include expenses in the given week's report."""
    if not week_start:
        raise HTTPException(400, "week_start requis")
    result = await db.expenses.update_many(
        {"id": {"$in": ids}},
        {"$pull": {"excluded_from_weeks": week_start}},
    )
    return {"success": True, "modified": result.modified_count}



# ==================== ALLOCATE EXPENSE TO CURRENT ACCOUNT ====================

class AllocateExpenseBody(BaseModel):
    account_id: str
    account_name: Optional[str] = None
    affects_ca: Optional[bool] = True


@router.post("/expenses/{expense_id}/allocate-account")
async def allocate_expense_to_current_account(expense_id: str, body: AllocateExpenseBody):
    """Link an expense to a current account as funding source. Works on any status
    (including 'completed' for retroactive assignment). Idempotent."""
    try:
        expense = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
        if not expense:
            raise HTTPException(404, "Dépense non trouvée")
        account = await db.current_accounts.find_one({"id": body.account_id}, {"_id": 0})
        if not account:
            raise HTTPException(404, "Compte courant non trouvé")

        # Update expense with funding info
        await db.expenses.update_one(
            {"id": expense_id},
            {"$set": {
                "funded_by_account_id": body.account_id,
                "funded_by_account_name": body.account_name or account.get("name"),
                "funded_affects_ca": bool(body.affects_ca) if body.affects_ca is not None else True,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        # Re-fetch with new values, then allocate
        refreshed = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
        await _allocate_expense_to_account(refreshed, body.account_id)

        return {"success": True, "expense": refreshed}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Allocate expense error: {e}")
        raise HTTPException(500, str(e))


# ==================== SMART ALLOCATE (handles insufficient balance) ====================

class SmartAllocateBody(BaseModel):
    account_id: Optional[str] = None  # required for 'topup_existing' & 'allow_negative'
    new_account_name: Optional[str] = None  # used for 'create_new'
    mode: str  # 'topup_existing' | 'create_new' | 'allow_negative'
    affects_ca: Optional[bool] = True


@router.post("/expenses/{expense_id}/allocate-account-smart")
async def smart_allocate_expense_to_account(expense_id: str, body: SmartAllocateBody):
    """Smart-allocate an approved/completed expense to a current account.

    Modes when the chosen account does NOT have enough balance:
      - 'topup_existing': bumps the account's `total_advance` by the missing amount
        and records a top_up entry "Recharge auto pour {description}".
      - 'create_new': creates a fresh dedicated current account with total_advance =
        expense.amount, named "Recharge auto pour {description}".
      - 'allow_negative': just performs the allocation; the account balance can go
        negative (records a debt against the account).
    """
    try:
        if body.mode not in ("topup_existing", "create_new", "allow_negative"):
            raise HTTPException(400, "Mode invalide")

        expense = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
        if not expense:
            raise HTTPException(404, "Dépense non trouvée")
        amount = float(expense.get("amount") or 0)
        description = (expense.get("description") or "").strip()
        now_iso = datetime.now(timezone.utc).isoformat()
        today_iso = datetime.now(timezone.utc).date().isoformat()
        target_account_id = body.account_id
        topped_up_amount = 0.0
        created_account = None

        if body.mode == "create_new":
            label = (body.new_account_name or f"Recharge auto pour {description[:80]}").strip()
            new_account = {
                "id": str(uuid.uuid4()),
                "name": label or "Recharge auto",
                "total_advance": amount,
                "received_date": today_iso,
                "description": f"Compte créé automatiquement pour financer : {description}"[:240],
                "notes": "",
                "schedule": [],
                "repayments": [],
                "top_ups": [{
                    "id": str(uuid.uuid4()),
                    "amount": amount,
                    "label": f"Recharge auto pour {description[:80]}",
                    "expense_id": expense_id,
                    "created_at": now_iso,
                }],
                "is_closed": False,
                "auto_top_up": True,
                "created_at": now_iso,
            }
            await db.current_accounts.insert_one(new_account.copy())
            target_account_id = new_account["id"]
            created_account = {**new_account}
            created_account.pop("_id", None)
            topped_up_amount = amount
        else:
            if not target_account_id:
                raise HTTPException(400, "account_id requis")
            account = await db.current_accounts.find_one({"id": target_account_id}, {"_id": 0})
            if not account:
                raise HTTPException(404, "Compte courant non trouvé")
            if body.mode == "topup_existing":
                # Compute current available balance (excluding this expense if already allocated)
                repayments = account.get("repayments") or []
                allocated_for_self = sum(
                    float(r.get("amount") or 0)
                    for r in repayments
                    if r.get("reference") == f"EXP-{expense_id}"
                )
                total_repaid = sum(float(r.get("amount") or 0) for r in repayments) - allocated_for_self
                balance_available = float(account.get("total_advance") or 0) - total_repaid
                missing = max(0.0, amount - balance_available)
                if missing > 0:
                    await db.current_accounts.update_one(
                        {"id": target_account_id},
                        {
                            "$inc": {"total_advance": missing},
                            "$push": {"top_ups": {
                                "id": str(uuid.uuid4()),
                                "amount": missing,
                                "label": f"Recharge auto pour {description[:80]}",
                                "expense_id": expense_id,
                                "created_at": now_iso,
                            }},
                        },
                    )
                    topped_up_amount = missing
            # 'allow_negative' falls through with no top-up

        # Persist the funding link on the expense
        target_account = await db.current_accounts.find_one({"id": target_account_id}, {"_id": 0})
        await db.expenses.update_one(
            {"id": expense_id},
            {"$set": {
                "funded_by_account_id": target_account_id,
                "funded_by_account_name": (target_account or {}).get("name"),
                "funded_affects_ca": bool(body.affects_ca) if body.affects_ca is not None else True,
                "updated_at": now_iso,
            }},
        )
        refreshed = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
        await _allocate_expense_to_account(refreshed, target_account_id)

        return {
            "success": True,
            "expense": refreshed,
            "account_id": target_account_id,
            "topped_up_amount": topped_up_amount,
            "mode": body.mode,
            "created_account": created_account,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Smart-allocate expense error: {e}")
        raise HTTPException(500, str(e))


@router.delete("/expenses/{expense_id}/allocate-account")
async def unallocate_expense_from_current_account(expense_id: str):
    """Remove the funding-source link for an expense (restores default = recettes)."""
    try:
        expense = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
        if not expense:
            raise HTTPException(404, "Dépense non trouvée")
        await _unallocate_expense_from_accounts(expense_id)
        await db.expenses.update_one(
            {"id": expense_id},
            {"$set": {
                "funded_by_account_id": None,
                "funded_by_account_name": None,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unallocate expense error: {e}")
        raise HTTPException(500, str(e))


# ============================================================================
# === ACHAT BOISSONS — flux dédié avec lien direct au stock ===
# ============================================================================

class DrinkPurchaseItem(BaseModel):
    stock_product_id: str
    quantity: float = 1  # nombre total de bouteilles (4b)
    unit_price: float = 0  # prix unitaire (par bouteille)


class DrinkPurchaseCreate(BaseModel):
    items: List[DrinkPurchaseItem]
    supplier: Optional[str] = ""
    planned_date: Optional[str] = ""
    requested_by: str
    funded_by_account_id: Optional[str] = None
    funded_by_account_name: Optional[str] = None
    funded_affects_ca: Optional[bool] = True
    notes: Optional[str] = ""


@router.post("/expenses/drinks")
async def create_drinks_purchase(data: DrinkPurchaseCreate):
    """Crée un achat de boissons rattaché DIRECTEMENT à des produits Stock (id-based).

    Le statut initial est "pending". Une fois validé (status=completed), les bouteilles
    sont automatiquement ajoutées au stock via la logique existante (qui utilise
    stock_product_id en priorité).
    """
    try:
        if not data.items:
            raise HTTPException(400, "Aucun article")

        # Vérifie et enrichit chaque ligne avec le nom + unité du produit
        items_payload = []
        total_amount = 0.0
        for it in data.items:
            prod = await db.stock_products.find_one({
                "id": it.stock_product_id, "is_active": True
            }, {"_id": 0})
            if not prod:
                raise HTTPException(404, f"Produit Stock introuvable : {it.stock_product_id}")
            qty = it.quantity or 1
            pu = it.unit_price if (it.unit_price and it.unit_price > 0) else (prod.get("purchase_price", 0) or 0)
            amount = qty * pu
            total_amount += amount
            items_payload.append({
                "category": "Boissons",
                "description": prod["name"],
                "quantity": qty,
                "unit_price": pu,
                "amount": amount,
                "stock_product_id": prod["id"],
                "unit": prod.get("unit", "bouteille"),
                "destination": "bar",
                "expense_type": "achat",
            })

        expense_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        expense = {
            "id": expense_id,
            "category": "Boissons",
            "description": f"Achat boissons ({len(items_payload)} article(s))",
            "quantity": 1,
            "unit_price": total_amount,
            "amount": total_amount,
            "supplier": data.supplier or "",
            "planned_date": data.planned_date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "requested_by": data.requested_by,
            "status": "pending",
            "is_group": True,
            "items": items_payload,
            "expense_type": "achat",
            "destination": "bar",
            "is_drinks_purchase": True,  # marqueur pour l'UI
            "funded_by_account_id": data.funded_by_account_id,
            "funded_by_account_name": data.funded_by_account_name,
            "funded_affects_ca": data.funded_affects_ca if data.funded_affects_ca is not None else True,
            "notes": data.notes or "",
            "created_at": now,
            "updated_at": now,
        }
        await db.expenses.insert_one(expense)
        expense.pop("_id", None)
        logger.info(f"Drinks purchase created: {expense_id} by {data.requested_by} total={total_amount}")
        return {"success": True, "expense": expense}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Drinks purchase create error: {e}")
        raise HTTPException(500, str(e))


@router.post("/expenses/{expense_id}/receive-stock")
async def receive_stock_for_expense(expense_id: str, body: dict = Body(default={})):
    """Bouton "Recevoir en stock" — Force la mise en stock d'un achat sans changer son
    status. Idempotent : si déjà reçu, ne refait rien.
    Utile pour les achats de boissons reçus physiquement avant validation admin.
    """
    try:
        expense = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
        if not expense:
            raise HTTPException(404, "Achat introuvable")
        if expense.get("expense_type") == "paiement":
            raise HTTPException(400, "Les paiements ne génèrent pas d'entrée en stock")

        already_synced = await db.stock_purchases.find_one({
            "source": "caisse", "expense_id": expense_id,
        })
        if already_synced:
            return {"success": True, "already_received": True, "purchase_id": already_synced.get("id")}

        # Réutilise la logique de sync en passant par PUT status=completed sans changer le statut visible
        items = expense.get("items") if expense.get("is_group") else [{
            "description": expense.get("description", ""),
            "quantity": expense.get("quantity", 1),
            "unit_price": expense.get("unit_price") or expense.get("amount", 0),
            "amount": expense.get("amount", 0),
            "category": expense.get("category", ""),
            "stock_product_id": expense.get("stock_product_id"),
        }]

        now_iso = datetime.now(timezone.utc).isoformat()
        received_by = (body or {}).get("user_name") or expense.get("requested_by", "Caisse")
        purchase_items = []
        for ei in items:
            if ei.get("struck"):
                continue
            qty = ei.get("quantity", 1) or 1
            pu = ei.get("unit_price", 0) or 0
            stock_product = None
            if ei.get("stock_product_id"):
                stock_product = await db.stock_products.find_one({"id": ei["stock_product_id"], "is_active": True})
            if not stock_product:
                # Fallback name match
                desc = (ei.get("description") or "").strip()
                if desc:
                    stock_product = await db.stock_products.find_one({
                        "name": {"$regex": f"^{re.escape(desc)}$", "$options": "i"},
                        "is_active": True,
                    })
            if not stock_product:
                logger.warning(f"receive-stock: product not found for item {ei}")
                continue

            old_qty = stock_product.get("quantity", 0)
            new_qty = old_qty + qty
            smin = stock_product.get("stock_min", 5)
            new_statut = "rupture" if new_qty <= 0 else ("faible" if new_qty <= smin else "normal")

            await db.stock_products.update_one({"id": stock_product["id"]}, {"$set": {
                "quantity": new_qty,
                "purchase_price": pu if pu > 0 else stock_product.get("purchase_price", 0),
                "valeur_totale": new_qty * (pu if pu > 0 else stock_product.get("purchase_price", 0)),
                "statut": new_statut,
                "updated_at": now_iso,
            }})

            await db.stock_movements.insert_one({
                "id": str(uuid.uuid4()),
                "product_id": stock_product["id"],
                "product_name": stock_product["name"],
                "product_code": stock_product.get("code", ""),
                "movement_type": "entree",
                "quantity": qty,
                "previous_quantity": old_qty,
                "new_quantity": new_qty,
                "unit": stock_product.get("unit", ""),
                "unit_price": pu or stock_product.get("purchase_price", 0),
                "total_value": qty * (pu or stock_product.get("purchase_price", 0)),
                "reason": f"Réception manuelle - {expense.get('supplier', 'N/A')}",
                "user_name": received_by,
                "expense_id": expense_id,
                "source": "caisse_manual",
                "created_at": now_iso,
            })
            purchase_items.append({
                "product_id": stock_product["id"],
                "product_name": stock_product["name"],
                "quantity": qty,
                "unit_price": pu,
                "total": qty * pu,
            })

        if not purchase_items:
            raise HTTPException(400, "Aucun article rattaché au stock")

        # Idempotency record
        purchase_doc = {
            "id": str(uuid.uuid4()),
            "expense_id": expense_id,
            "source": "caisse",
            "supplier": expense.get("supplier", ""),
            "purchase_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "items": purchase_items,
            "total_amount": sum(i["total"] for i in purchase_items),
            "user_name": received_by,
            "received_manually": True,
            "created_at": now_iso,
        }
        await db.stock_purchases.insert_one(purchase_doc)

        # Marque l'expense comme reçu sans changer son statut
        await db.expenses.update_one({"id": expense_id}, {"$set": {
            "stock_received": True,
            "stock_received_at": now_iso,
            "stock_received_by": received_by,
            "updated_at": now_iso,
        }})

        return {"success": True, "received_items": len(purchase_items), "purchase_id": purchase_doc["id"]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Receive stock error: {e}")
        raise HTTPException(500, str(e))
