"""
Purchase Price History — Répertoire des prix d'achat.

Alimentation automatique : à chaque expense Caisse passée en status='completed',
on insère une entrée par item (avec qté + prix unitaire + total + fournisseur + date).

Collection : purchase_price_history
{
  id, expense_id, expense_item_index,
  product_name, supplier, category,
  quantity, unit_price, total_amount,
  purchase_date, created_by, created_at
}

Endpoints :
- GET /api/purchase-price-history : liste plate filtrable
- GET /api/purchase-price-history/by-product : groupé par produit (stats min/max/avg/last)
- POST /api/purchase-price-history/backfill : régénère depuis les expenses passées
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["purchase_price_history"])
db = None
logger = logging.getLogger(__name__)


def set_db(database):
    global db
    db = database


def _normalize_name(name: str) -> str:
    return (name or "").strip().lower()


async def record_expense_completion(expense: dict):
    """Appelée depuis expenses.py au moment où une expense passe en 'completed'.
    Crée 1 entrée par item dans purchase_price_history.
    Idempotent : évite les doublons si la même expense est re-syncée.
    """
    if not expense or expense.get("expense_type") == "paiement":
        return 0  # Ne pas tracker les paiements de services
    expense_id = expense.get("id")
    if not expense_id:
        return 0

    # Idempotence
    existing = await db.purchase_price_history.find({"expense_id": expense_id}, {"_id": 0}).to_list(50)
    if existing:
        return 0

    now = datetime.now(timezone.utc).isoformat()
    supplier = (expense.get("supplier") or "").strip()
    purchase_date = expense.get("completed_at") or expense.get("approved_at") or expense.get("created_at") or now

    raw_items = []
    if expense.get("is_group") and expense.get("items"):
        raw_items = expense["items"]
    else:
        raw_items = [{
            "category": expense.get("category", ""),
            "description": expense.get("description", ""),
            "quantity": expense.get("quantity", 1),
            "unit_price": expense.get("unit_price") or expense.get("amount", 0),
            "amount": expense.get("amount", 0),
        }]

    docs = []
    for idx, it in enumerate(raw_items):
        if it.get("struck"):
            continue
        product_name = (it.get("description") or "").strip()
        if not product_name:
            continue
        qty = float(it.get("quantity") or 1)
        unit = float(it.get("unit_price") or 0)
        amt = float(it.get("amount") or (qty * unit))
        docs.append({
            "id": str(uuid.uuid4()),
            "expense_id": expense_id,
            "expense_item_index": idx,
            "product_name": product_name,
            "product_name_lower": _normalize_name(product_name),
            "supplier": supplier,
            "supplier_lower": _normalize_name(supplier),
            "category": it.get("category") or expense.get("category", ""),
            "quantity": qty,
            "unit_price": unit,
            "total_amount": amt,
            "purchase_date": purchase_date[:10],
            "created_by": expense.get("requested_by") or "",
            "created_at": now,
        })
    if docs:
        await db.purchase_price_history.insert_many(docs)
        logger.info(f"Purchase price history: inserted {len(docs)} rows for expense {expense_id}")
    return len(docs)


@router.get("/purchase-price-history")
async def list_history(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    product_name: Optional[str] = None,
    supplier: Optional[str] = None,
    limit: int = 500,
):
    q = {}
    if date_from:
        q.setdefault("purchase_date", {})["$gte"] = date_from
    if date_to:
        q.setdefault("purchase_date", {})["$lte"] = date_to
    if product_name:
        q["product_name_lower"] = {"$regex": _normalize_name(product_name), "$options": "i"}
    if supplier:
        q["supplier_lower"] = {"$regex": _normalize_name(supplier), "$options": "i"}
    rows = await db.purchase_price_history.find(q, {"_id": 0}).sort("purchase_date", -1).to_list(limit)
    return {"history": rows, "total": len(rows)}


@router.get("/purchase-price-history/by-product")
async def by_product(date_from: Optional[str] = None, date_to: Optional[str] = None):
    """Groupé par produit avec stats : min/max/avg/last + nb d'achats + dernier fournisseur."""
    q = {}
    if date_from:
        q.setdefault("purchase_date", {})["$gte"] = date_from
    if date_to:
        q.setdefault("purchase_date", {})["$lte"] = date_to
    rows = await db.purchase_price_history.find(q, {"_id": 0}).sort("purchase_date", -1).to_list(5000)

    groups: dict = {}
    for r in rows:
        key = r.get("product_name_lower") or _normalize_name(r.get("product_name", ""))
        if not key:
            continue
        if key not in groups:
            groups[key] = {
                "product_name": r.get("product_name", ""),
                "purchases": [],
            }
        groups[key]["purchases"].append(r)

    result = []
    for key, g in groups.items():
        prices = [p["unit_price"] for p in g["purchases"] if p.get("unit_price")]
        last = g["purchases"][0] if g["purchases"] else None
        result.append({
            "product_name": g["product_name"],
            "count": len(g["purchases"]),
            "min_price": min(prices) if prices else 0,
            "max_price": max(prices) if prices else 0,
            "avg_price": (sum(prices) / len(prices)) if prices else 0,
            "last_price": last.get("unit_price", 0) if last else 0,
            "last_date": last.get("purchase_date", "") if last else "",
            "last_supplier": last.get("supplier", "") if last else "",
            "total_qty": sum(p.get("quantity", 0) for p in g["purchases"]),
            "total_spent": sum(p.get("total_amount", 0) for p in g["purchases"]),
        })
    # Sort by count desc
    result.sort(key=lambda x: (-x["count"], x["product_name"]))
    return {"products": result, "total": len(result)}


@router.post("/purchase-price-history/backfill")
async def backfill():
    """Régénère le répertoire depuis les expenses 'completed' passées.
    Idempotent : ignore les expenses déjà tracées."""
    completed = await db.expenses.find({"status": "completed"}, {"_id": 0}).to_list(5000)
    inserted_total = 0
    for exp in completed:
        n = await record_expense_completion(exp)
        inserted_total += n
    return {"success": True, "scanned": len(completed), "inserted": inserted_total}


@router.delete("/purchase-price-history/{entry_id}")
async def delete_entry(entry_id: str):
    r = await db.purchase_price_history.delete_one({"id": entry_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Entrée non trouvée")
    return {"success": True}
