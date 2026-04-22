"""
Expenses Router - Gestion des dépenses/achats Caisse Pro.
Endpoints: CRUD + assign-week + bulk ops.
Le PUT status='completed' synchronise avec le module Stock (Entrées + stock_purchases).
"""
from fastapi import APIRouter, HTTPException, Body
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

router = APIRouter(tags=["expenses"])
db = None
logger = logging.getLogger(__name__)


def set_db(database):
    global db
    db = database


# ==================== MODELS ====================

class ExpenseItem(BaseModel):
    category: str
    description: str
    quantity: float = 1
    unit_price: float
    amount: float


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
async def create_expense(expense: ExpenseCreate):
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
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        await db.expenses.insert_one(expense_doc)
        expense_doc.pop("_id", None)

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

        was_completed_before = expense.get("status") == "completed"

        update_data = {}
        for k, v in update.model_dump().items():
            if v is not None:
                if k == "items" and v:
                    update_data[k] = [item if isinstance(item, dict) else item.model_dump() for item in v]
                else:
                    update_data[k] = v

        if update.status == "approved":
            update_data["approved_at"] = datetime.now(timezone.utc).isoformat()
        elif update.status == "completed":
            update_data["completed_at"] = datetime.now(timezone.utc).isoformat()

        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

        await db.expenses.update_one({"id": expense_id}, {"$set": update_data})

        # === SYNC WITH STOCK MODULE (Achats Caisse → Entrées Stock) ===
        if update.status == "completed" and not was_completed_before:
            try:
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
                    item_desc = exp_item.get("description", "").strip()
                    item_qty = exp_item.get("quantity", 1) or 1
                    item_price = exp_item.get("unit_price", 0) or 0

                    if not item_desc:
                        continue

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
                        unlinked_mov = {
                            "id": str(uuid.uuid4()),
                            "product_id": "",
                            "product_name": item_desc,
                            "product_code": "",
                            "movement_type": "entree",
                            "quantity": item_qty,
                            "previous_quantity": 0,
                            "new_quantity": item_qty,
                            "unit": "unite",
                            "unit_price": item_price,
                            "total_value": item_qty * item_price,
                            "reason": f"Achat Caisse (non lie au stock) - {updated_expense.get('supplier', 'N/A')}",
                            "user_name": updated_expense.get("requested_by", "Caisse"),
                            "expense_id": expense_id,
                            "created_at": now_iso,
                        }
                        await db.stock_movements.insert_one(unlinked_mov)
                        purchase_items_for_stock.append({
                            "product_id": "",
                            "product_name": item_desc,
                            "quantity": item_qty,
                            "unit_price": item_price,
                            "unit": "unite",
                        })

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
