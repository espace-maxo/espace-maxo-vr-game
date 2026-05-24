"""
Cash Closures Router — "Point de la Caisse" (Z journalier).

Endpoints :
- GET  /api/cash-closures/live         → snapshot temps réel pour aujourd'hui (ou date donnée)
- POST /api/cash-closures              → enregistre la clôture (Z) du jour
- GET  /api/cash-closures              → historique des Z (max 60 derniers jours)
- DELETE /api/cash-closures/{id}       → supprime un Z (admin uniquement)
"""
from fastapi import APIRouter, HTTPException, Body, Query
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from typing import Optional, List
import uuid
import logging

router = APIRouter(tags=["cash_closures"])
db = None
logger = logging.getLogger(__name__)


def set_db(database):
    global db
    db = database


# ==================== HELPERS ====================

async def is_date_closed(date_iso: str) -> Optional[dict]:
    """Return the closure document for a given YYYY-MM-DD date, or None if open."""
    if not date_iso:
        return None
    if db is None:
        return None
    try:
        doc = await db.cash_closures.find_one({"date": date_iso}, {"_id": 0})
        return doc
    except Exception:
        return None


def _date_from_iso(iso_str: str) -> Optional[str]:
    """Extract YYYY-MM-DD from any ISO datetime string. Returns None if invalid."""
    if not iso_str:
        return None
    try:
        return str(iso_str)[:10]
    except Exception:
        return None


# Map raw payment_method values used across the app to a normalized 4-bucket key
PAY_METHOD_MAP = {
    # cash
    "cash": "cash",
    "especes": "cash",
    "espèces": "cash",
    # mobile money
    "mobile": "mobile",
    "mobile_money": "mobile",
    "momo": "mobile",
    # card
    "card": "card",
    "carte": "card",
    "carte_bancaire": "card",
    "cb": "card",
    # bank transfer / cheque grouped under "transfer"
    "virement": "transfer",
    "transfer": "transfer",
    "cheque": "transfer",
    "chèque": "transfer",
    # current account
    "compte_courant": "current_account",
}


def _norm_method(raw):
    if not raw:
        return "cash"
    return PAY_METHOD_MAP.get(str(raw).strip().lower(), "other")


async def _compute_live_snapshot(date_iso: str) -> dict:
    """Compute the live cash position for a given YYYY-MM-DD date.

    Returns a dict with:
      - date
      - per_method : {cash, mobile, card, transfer, current_account, other} → amount + count
      - invoices_count, invoices_total
      - tips_total
      - expenses_total (only completed expenses tied to the day)
      - net_cash (theoretical : encaissé - dépenses payées en espèces)
      - net_balance (theoretical : encaissé - dépenses)
    """
    day_start = f"{date_iso}T00:00:00"
    day_end = f"{date_iso}T23:59:59.999"

    # 1. Validated invoices for the day
    invoice_query = {
        "validation_status": "validated",
        "created_at": {"$gte": day_start, "$lte": day_end},
    }
    invoices = await db.invoices.find(invoice_query, {"_id": 0}).to_list(2000)

    per_method = {
        "cash": {"amount": 0.0, "count": 0},
        "mobile": {"amount": 0.0, "count": 0},
        "card": {"amount": 0.0, "count": 0},
        "transfer": {"amount": 0.0, "count": 0},
        "current_account": {"amount": 0.0, "count": 0},
        "other": {"amount": 0.0, "count": 0},
    }
    total_invoices = 0.0
    for inv in invoices:
        amount = float(inv.get("total") or 0)
        method = _norm_method(inv.get("payment_method"))
        per_method[method]["amount"] += amount
        per_method[method]["count"] += 1
        total_invoices += amount

    # 2. Tips collected the same day
    tips_total = 0.0
    try:
        tips = await db.tips.find(
            {"created_at": {"$gte": day_start, "$lte": day_end}},
            {"_id": 0},
        ).to_list(500)
        tips_total = sum(float(t.get("amount") or 0) for t in tips)
    except Exception:
        pass

    # 3. Completed expenses (cash outflows) — uses `completed_at` if present, else created_at
    expenses_total = 0.0
    expenses_count = 0
    try:
        # Match completed in the day (completed_at) OR created the day if completed without timestamp
        exp_query = {
            "status": "completed",
            "$or": [
                {"completed_at": {"$gte": day_start, "$lte": day_end}},
                {"created_at": {"$gte": day_start, "$lte": day_end}, "completed_at": {"$exists": False}},
            ],
        }
        expenses = await db.expenses.find(exp_query, {"_id": 0}).to_list(500)
        for exp in expenses:
            # Skip expenses funded by a current account that are not affecting CA
            if exp.get("funded_by_account_id") and exp.get("funded_affects_ca") is False:
                continue
            expenses_total += float(exp.get("amount") or 0)
            expenses_count += 1
    except Exception:
        pass

    net_cash_theoretical = per_method["cash"]["amount"] + tips_total - expenses_total
    net_balance = total_invoices + tips_total - expenses_total

    # 4. Gerante personal advances (she lent cash from her pocket to give change)
    # Pending advances means the register physically holds MORE cash than the
    # theoretical "per_method.cash" because the customer paid full amount but the
    # change went from her pocket, not from the register.
    gerante_pending_total = 0.0
    gerante_pending_count = 0
    gerante_reimbursed_today_total = 0.0
    gerante_reimbursed_today_count = 0
    try:
        pending_advances = await db.gerante_advances.find(
            {"status": "pending"},
            {"_id": 0},
        ).to_list(5000)
        gerante_pending_total = sum(float(a.get("amount") or 0) for a in pending_advances)
        gerante_pending_count = len(pending_advances)

        reimbursed_today = await db.gerante_advances.find(
            {"status": "reimbursed", "reimbursed_at": {"$regex": f"^{date_iso}"}},
            {"_id": 0},
        ).to_list(1000)
        gerante_reimbursed_today_total = sum(float(a.get("amount") or 0) for a in reimbursed_today)
        gerante_reimbursed_today_count = len(reimbursed_today)
    except Exception:
        pass

    # Expected physical cash in the drawer = theoretical cash from invoices
    #   + pending Gérante advances (surplus she hasn't been reimbursed for yet)
    #   - cash reimbursements she took today (already out of the drawer)
    expected_cash_in_drawer = (
        per_method["cash"]["amount"]
        + gerante_pending_total
        - gerante_reimbursed_today_total
    )

    # 5. Fonds Propres (Achats Manager) — remboursements effectués aujourd'hui
    fonds_propres_reimbursed_today_total = 0.0
    fonds_propres_reimbursed_today_count = 0
    fonds_propres_pending_total = 0.0
    fonds_propres_pending_count = 0
    try:
        fp_today = await db.expenses.find(
            {"payment_mode": "fonds_propres", "reimbursed": True,
             "reimbursed_at": {"$regex": f"^{date_iso}"}},
            {"_id": 0},
        ).to_list(2000)
        fonds_propres_reimbursed_today_total = sum(float(a.get("amount") or 0) for a in fp_today)
        fonds_propres_reimbursed_today_count = len(fp_today)

        fp_pending = await db.expenses.find(
            {"payment_mode": "fonds_propres", "reimbursed": {"$ne": True}},
            {"_id": 0},
        ).to_list(5000)
        fonds_propres_pending_total = sum(float(a.get("amount") or 0) for a in fp_pending)
        fonds_propres_pending_count = len(fp_pending)

        # Also include shopping_list items (Appro Manager direct buys)
        def _amt(r):
            return float(r.get("real_total") if r.get("real_total") is not None else (r.get("estimated_total") or 0))
        sl_today = await db.shopping_list_items.find(
            {"payment_mode": "fonds_propres", "reimbursed": True,
             "reimbursed_at": {"$regex": f"^{date_iso}"}},
            {"_id": 0},
        ).to_list(2000)
        fonds_propres_reimbursed_today_total += sum(_amt(a) for a in sl_today)
        fonds_propres_reimbursed_today_count += len(sl_today)

        sl_pending = await db.shopping_list_items.find(
            {"payment_mode": "fonds_propres", "reimbursed": {"$ne": True}, "status": "done"},
            {"_id": 0},
        ).to_list(5000)
        fonds_propres_pending_total += sum(_amt(a) for a in sl_pending)
        fonds_propres_pending_count += len(sl_pending)
    except Exception:
        pass

    return {
        "date": date_iso,
        "per_method": per_method,
        "invoices_count": len(invoices),
        "invoices_total": total_invoices,
        "tips_total": tips_total,
        "expenses_total": expenses_total,
        "expenses_count": expenses_count,
        "net_cash_theoretical": net_cash_theoretical,
        "net_balance": net_balance,
        "gerante_pending_total": gerante_pending_total,
        "gerante_pending_count": gerante_pending_count,
        "gerante_reimbursed_today_total": gerante_reimbursed_today_total,
        "gerante_reimbursed_today_count": gerante_reimbursed_today_count,
        "expected_cash_in_drawer": expected_cash_in_drawer,
        "fonds_propres_reimbursed_today_total": fonds_propres_reimbursed_today_total,
        "fonds_propres_reimbursed_today_count": fonds_propres_reimbursed_today_count,
        "fonds_propres_pending_total": fonds_propres_pending_total,
        "fonds_propres_pending_count": fonds_propres_pending_count,
    }


# ==================== MODELS ====================

class CashClosureCreate(BaseModel):
    date: Optional[str] = None  # YYYY-MM-DD, default = today
    declared_cash: Optional[float] = 0.0  # cash physically counted by Gérante
    notes: Optional[str] = None
    closed_by: Optional[str] = "Administrateur"


# ==================== ENDPOINTS ====================

@router.get("/cash-closures/live")
async def get_live_snapshot(date: Optional[str] = Query(None)):
    """Live snapshot for a given date (defaults to today). Read-only, not persisted."""
    try:
        day = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        snap = await _compute_live_snapshot(day)
        # Indicate whether a Z has already been recorded for that date
        existing = await db.cash_closures.find_one({"date": day}, {"_id": 0})
        snap["already_closed"] = bool(existing)
        snap["existing_closure_id"] = existing.get("id") if existing else None
        return {"success": True, "snapshot": snap}
    except Exception as e:
        logger.error(f"Error computing live snapshot: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cash-closures")
async def create_cash_closure(payload: CashClosureCreate):
    """Persist a Z (cash closure) for the given day. Idempotent per date (one Z/day max)."""
    try:
        day = payload.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # If a closure already exists for that date, refuse (use DELETE first)
        existing = await db.cash_closures.find_one({"date": day})
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"Une clôture existe déjà pour le {day}. Supprimez-la d'abord pour rouvrir."
            )

        snap = await _compute_live_snapshot(day)
        declared = float(payload.declared_cash or 0)
        # Expected cash = theoretical cash + pending Gérante advances - her reimbursements today
        expected_cash = snap.get("expected_cash_in_drawer", snap["per_method"]["cash"]["amount"])
        gap_cash = declared - expected_cash

        doc = {
            "id": str(uuid.uuid4()),
            "date": day,
            "snapshot": snap,
            "declared_cash": declared,
            "gap_cash": gap_cash,  # positif = excédent / négatif = manquant
            "notes": payload.notes,
            "closed_by": payload.closed_by or "Administrateur",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.cash_closures.insert_one(doc.copy())
        doc.pop("_id", None)
        logger.info(f"Cash closure created for {day} (gap_cash={gap_cash:.0f})")
        return {"success": True, "closure": doc}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating cash closure: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cash-closures")
async def list_cash_closures(limit: int = Query(60, ge=1, le=365)):
    """History of recent closures (default last 60)."""
    try:
        rows = await db.cash_closures.find({}, {"_id": 0}).sort("date", -1).limit(limit).to_list(limit)
        return {"success": True, "closures": rows}
    except Exception as e:
        logger.error(f"Error listing cash closures: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cash-closures/{closure_id}")
async def get_cash_closure(closure_id: str):
    try:
        row = await db.cash_closures.find_one({"id": closure_id}, {"_id": 0})
        if not row:
            raise HTTPException(404, "Clôture introuvable")
        return {"success": True, "closure": row}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error get cash closure: {e}")
        raise HTTPException(500, str(e))


@router.delete("/cash-closures/{closure_id}")
async def delete_cash_closure(closure_id: str):
    """Delete a closure (admin only — used to re-open the day)."""
    try:
        res = await db.cash_closures.delete_one({"id": closure_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Clôture introuvable")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting cash closure: {e}")
        raise HTTPException(500, str(e))
