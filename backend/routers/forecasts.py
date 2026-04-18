"""
Forecasts Router — Prévisions de décaissement (Admin only).

Fonctions :
  - CRUD des prévisions (loyer, salaires, fournisseurs, charges, impôts…)
  - Dashboard prévisionnel : trésorerie disponible, agenda jour par jour sur 30j,
    montant manquant, couverture par catégorie.
  - Analyse d'une demande d'achat (Expense) : doublons, impact stock, impact trésorerie.

Calcul de trésorerie (selon choix utilisateur) :
  treasury = (CA validé semaine) − (dépenses approuvées/terminées semaine)
"""
from fastapi import APIRouter, HTTPException, Body, Query
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime, timezone, timedelta
from typing import List, Optional
import calendar
import uuid
import logging
import re

router = APIRouter(tags=["forecasts"])
db = None
logger = logging.getLogger(__name__)


def set_db(database):
    global db
    db = database


# ==================== MODELS ====================

VALID_CATEGORIES = {"salaires", "loyer", "fournisseur", "charges", "impots", "maintenance", "autre"}
VALID_STATUSES = {"prevu", "paye", "annule", "reporte"}
VALID_RECURRENCE = {"none", "weekly", "monthly"}


class ForecastCreate(BaseModel):
    date: str  # YYYY-MM-DD
    label: str
    amount: float
    category: str = "autre"
    status: str = "prevu"
    recurrence: str = "none"  # none | weekly | monthly
    recurrence_day: Optional[int] = None  # day of month (1-28) if monthly
    notes: str = ""


class Forecast(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str
    label: str
    amount: float
    category: str = "autre"
    status: str = "prevu"
    recurrence: str = "none"
    recurrence_day: Optional[int] = None
    notes: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ==================== HELPERS ====================

def _week_monday(d: datetime) -> str:
    return (d - timedelta(days=d.weekday())).strftime("%Y-%m-%d")


async def _compute_treasury(today: datetime) -> dict:
    """Available cash = validated weekly CA − approved/completed weekly expenses.
    Respects assigned_week for both sides."""
    week_start = _week_monday(today)
    week_end = (datetime.fromisoformat(week_start) + timedelta(days=6, hours=23, minutes=59, seconds=59))
    week_end_str = week_end.strftime("%Y-%m-%dT%H:%M:%S")

    # --- Validated sales (same logic as /reports/weekly) ---
    invoices_native = await db.invoices.find({
        "validation_status": "validated",
        "created_at": {"$gte": week_start, "$lte": week_end_str + "Z"},
        "$or": [
            {"assigned_week": {"$exists": False}},
            {"assigned_week": None},
            {"assigned_week": ""},
            {"assigned_week": week_start},
        ]
    }, {"_id": 0, "id": 1, "total": 1}).to_list(5000)

    invoices_assigned = await db.invoices.find({
        "validation_status": "validated",
        "assigned_week": week_start,
    }, {"_id": 0, "id": 1, "total": 1}).to_list(5000)

    seen = set()
    ca = 0
    for inv in invoices_native + invoices_assigned:
        if inv["id"] in seen:
            continue
        seen.add(inv["id"])
        ca += inv.get("total", 0)

    # --- Approved / completed expenses of the week ---
    expenses = await db.expenses.find({
        "status": {"$in": ["approved", "completed"]},
        "$or": [
            {
                "$and": [
                    {"$or": [
                        {"completed_at": {"$gte": week_start, "$lte": week_end_str}},
                        {"approved_at": {"$gte": week_start, "$lte": week_end_str}},
                    ]},
                    {"$or": [
                        {"assigned_week": {"$exists": False}},
                        {"assigned_week": None},
                        {"assigned_week": ""},
                        {"assigned_week": week_start},
                    ]},
                ]
            },
            {"assigned_week": week_start},
        ]
    }, {"_id": 0, "id": 1, "amount": 1}).to_list(5000)

    expenses_seen = set()
    total_exp = 0
    for e in expenses:
        if e["id"] in expenses_seen:
            continue
        expenses_seen.add(e["id"])
        total_exp += e.get("amount", 0)

    return {
        "week_start": week_start,
        "weekly_ca": ca,
        "weekly_expenses": total_exp,
        "available": max(0, ca - total_exp),
    }


def _expand_recurrence(fc: dict, start_date: datetime, end_date: datetime) -> List[dict]:
    """Return synthetic occurrences of a forecast within [start_date, end_date].
    For non-recurring forecasts, returns the original if it falls within.
    """
    out = []
    recurrence = fc.get("recurrence") or "none"

    base_date_str = fc.get("date", "")
    try:
        base_date = datetime.fromisoformat(base_date_str)
        # Make base_date offset-aware if it's naive (date-only strings like "2026-04-18")
        if base_date.tzinfo is None:
            base_date = base_date.replace(tzinfo=timezone.utc)
    except Exception:
        return out

    if recurrence == "none":
        if start_date <= base_date <= end_date:
            out.append({**fc, "occurrence_date": base_date_str})
        return out

    if recurrence == "weekly":
        # Same weekday as base
        d = base_date
        # rewind to first occurrence ≤ start_date
        while d > start_date:
            d = d - timedelta(days=7)
        while d <= end_date:
            if d >= start_date:
                out.append({**fc, "occurrence_date": d.strftime("%Y-%m-%d")})
            d = d + timedelta(days=7)
        return out

    if recurrence == "monthly":
        day_of_month = fc.get("recurrence_day") or base_date.day
        # Walk month by month
        d = start_date.replace(day=1)
        while d <= end_date:
            last = calendar.monthrange(d.year, d.month)[1]
            real_day = min(day_of_month, last)
            occ = d.replace(day=real_day)
            if start_date <= occ <= end_date:
                out.append({**fc, "occurrence_date": occ.strftime("%Y-%m-%d")})
            # Advance to first of next month
            if d.month == 12:
                d = d.replace(year=d.year + 1, month=1, day=1)
            else:
                d = d.replace(month=d.month + 1, day=1)
        return out

    return out


# ==================== CRUD ====================

@router.get("/forecasts")
async def list_forecasts():
    """List all forecasts (admin)."""
    try:
        items = await db.forecasts.find({}, {"_id": 0}).sort("date", 1).to_list(1000)
        return {"forecasts": items}
    except Exception as e:
        logger.error(f"Error listing forecasts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/forecasts")
async def create_forecast(data: ForecastCreate):
    try:
        if data.category not in VALID_CATEGORIES:
            data.category = "autre"
        if data.status not in VALID_STATUSES:
            data.status = "prevu"
        if data.recurrence not in VALID_RECURRENCE:
            data.recurrence = "none"

        fc = Forecast(**data.model_dump()).model_dump()
        await db.forecasts.insert_one(fc)
        return {"success": True, "forecast": {k: v for k, v in fc.items() if k != "_id"}}
    except Exception as e:
        logger.error(f"Error creating forecast: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/forecasts/{forecast_id}")
async def update_forecast(forecast_id: str, data: dict = Body(...)):
    try:
        if "category" in data and data["category"] not in VALID_CATEGORIES:
            data["category"] = "autre"
        if "status" in data and data["status"] not in VALID_STATUSES:
            data["status"] = "prevu"
        if "recurrence" in data and data["recurrence"] not in VALID_RECURRENCE:
            data["recurrence"] = "none"

        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = await db.forecasts.update_one({"id": forecast_id}, {"$set": data})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Prévision non trouvée")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating forecast: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/forecasts/{forecast_id}")
async def delete_forecast(forecast_id: str):
    try:
        result = await db.forecasts.delete_one({"id": forecast_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Prévision non trouvée")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting forecast: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== DASHBOARD ====================

@router.get("/forecasts/dashboard")
async def forecasts_dashboard(horizon_days: int = Query(30, ge=7, le=90)):
    """Global prévisionnel dashboard.
    Returns:
      - treasury: available cash now (CA semaine - dépenses approuvées)
      - horizon_days of the upcoming calendar
      - per_day: list of {date, decaissements, running_balance}
      - totals: total_decaissements, total_by_category
      - missing_amount: max shortfall on any day (if balance < 0)
    """
    try:
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        end = today + timedelta(days=horizon_days)

        treasury = await _compute_treasury(today)
        available = treasury["available"]

        # Load all forecasts
        forecasts = await db.forecasts.find({"status": {"$ne": "annule"}}, {"_id": 0}).to_list(2000)

        # Expand recurrence into occurrences
        occurrences = []
        for fc in forecasts:
            occurrences.extend(_expand_recurrence(fc, today, end))

        # Agenda day by day
        per_day = []
        balance = available
        total_by_cat = {}
        total_dec = 0

        for i in range(horizon_days + 1):
            d = today + timedelta(days=i)
            dstr = d.strftime("%Y-%m-%d")
            day_items = [o for o in occurrences if o["occurrence_date"] == dstr]
            day_total = sum(o.get("amount", 0) for o in day_items if o.get("status") != "paye")

            balance -= day_total
            total_dec += day_total
            for o in day_items:
                if o.get("status") == "paye":
                    continue
                cat = o.get("category", "autre")
                total_by_cat[cat] = total_by_cat.get(cat, 0) + o.get("amount", 0)

            per_day.append({
                "date": dstr,
                "items": [
                    {
                        "id": o.get("id"),
                        "label": o.get("label"),
                        "amount": o.get("amount", 0),
                        "category": o.get("category", "autre"),
                        "status": o.get("status", "prevu"),
                        "recurrence": o.get("recurrence", "none"),
                    }
                    for o in day_items
                ],
                "decaissement": day_total,
                "running_balance": balance,
            })

        # Missing amount: largest negative balance during horizon
        min_balance = min(d["running_balance"] for d in per_day) if per_day else balance
        missing = max(0, -min_balance)

        return {
            "treasury": treasury,
            "available_now": available,
            "horizon_days": horizon_days,
            "per_day": per_day,
            "totals": {
                "total_decaissements": total_dec,
                "by_category": total_by_cat,
            },
            "min_running_balance": min_balance,
            "missing_amount": missing,
        }
    except Exception as e:
        logger.error(f"Error building forecasts dashboard: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== EXPENSE ANALYSIS ====================

@router.get("/expenses/analysis")
async def expenses_analysis():
    """Deep analysis for every pending/approved/revision_requested expense.
    Returns duplicates (14d), stock_matches, redundant_items (overstock waste),
    recent_purchases (same products 14d), treasury_impact.
    """
    try:
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        lookback = today - timedelta(days=14)
        lookback_str = lookback.strftime("%Y-%m-%d")

        treasury = await _compute_treasury(today)
        available = treasury["available"]

        exp = await db.expenses.find({
            "status": {"$in": ["pending", "revision_requested", "approved"]}
        }, {"_id": 0}).to_list(500)

        recent = await db.expenses.find({
            "created_at": {"$gte": lookback_str}
        }, {"_id": 0}).to_list(1000)

        stock_products = await db.stock_products.find({"is_active": True}, {"_id": 0}).to_list(2000)

        recent_purchases = await db.stock_purchases.find({
            "created_at": {"$gte": lookback_str}
        }, {"_id": 0}).sort("created_at", -1).to_list(500)

        analyses = []

        def _get_item_name(it):
            return ((it.get("name") or it.get("description")) or "").strip().lower()

        for e in exp:
            eid = e.get("id")
            desc = (e.get("description") or "").strip().lower()
            supplier = (e.get("supplier") or "").strip().lower()
            items = e.get("items") or []

            # ---- DUPLICATES (threshold lowered to 30+) ----
            duplicates = []
            for other in recent:
                if other.get("id") == eid or other.get("status") == "cancelled":
                    continue
                score = 0
                reasons = []
                other_desc = (other.get("description") or "").strip().lower()
                other_sup = (other.get("supplier") or "").strip().lower()
                other_items = other.get("items") or []

                if desc and other_desc:
                    if desc == other_desc:
                        score += 50
                        reasons.append("description identique")
                    elif desc in other_desc or other_desc in desc:
                        score += 30
                        reasons.append("description similaire")
                if supplier and other_sup and supplier == other_sup:
                    score += 25
                    reasons.append("meme fournisseur")

                names_a = {_get_item_name(i) for i in items}
                names_a.discard("")
                names_b = {_get_item_name(i) for i in other_items}
                names_b.discard("")
                if names_a and names_b:
                    common = names_a & names_b
                    if common:
                        overlap = len(common) / max(1, min(len(names_a), len(names_b)))
                        if overlap >= 0.5:
                            score += 35
                            reasons.append(f"{len(common)} produit(s) en commun sur {min(len(names_a), len(names_b))}")
                        elif len(common) >= 2:
                            score += 20
                            reasons.append(f"{len(common)} produit(s) en commun")

                e_day = (e.get("created_at") or "")[:10]
                o_day = (other.get("created_at") or "")[:10]
                if e_day and o_day and e_day == o_day:
                    score += 10
                    reasons.append("meme jour")

                if score >= 30:
                    duplicates.append({
                        "id": other.get("id"),
                        "description": other.get("description"),
                        "supplier": other.get("supplier"),
                        "amount": other.get("amount"),
                        "status": other.get("status"),
                        "created_at": other.get("created_at"),
                        "requested_by": other.get("requested_by"),
                        "score": min(100, score),
                        "reasons": reasons,
                        "level": "certain" if score >= 70 else ("probable" if score >= 50 else "possible"),
                    })
            duplicates.sort(key=lambda d: -d["score"])

            # ---- STOCK MATCHES & REDUNDANT ITEMS ----
            stock_matches = []
            redundant_items = []
            items_to_check = list(items)
            if not items_to_check and desc:
                items_to_check = [{"name": desc, "quantity": e.get("quantity", 1), "unit_price": e.get("unit_price", 0)}]

            for item in items_to_check:
                iname = _get_item_name(item)
                if len(iname) < 3:
                    continue
                iqty = item.get("quantity", 1) or 1
                for sp in stock_products:
                    sp_name = (sp.get("name") or "").strip().lower()
                    if not sp_name:
                        continue
                    if iname == sp_name or iname in sp_name or sp_name in iname:
                        last_entry = await db.stock_movements.find_one({
                            "product_id": sp.get("id"),
                            "movement_type": "entree"
                        }, {"_id": 0}, sort=[("created_at", -1)])

                        current_qty = sp.get("quantity", 0)
                        stock_min = sp.get("stock_min", 0)
                        unit = sp.get("unit", "")
                        is_warning = current_qty > (stock_min * 1.5)

                        match = {
                            "product_name": sp.get("name"),
                            "current_quantity": current_qty,
                            "unit": unit,
                            "stock_min": stock_min,
                            "statut": sp.get("statut", "normal"),
                            "last_entry_date": (last_entry or {}).get("created_at", ""),
                            "last_entry_qty": (last_entry or {}).get("quantity", 0),
                            "warning": is_warning,
                            "requested_item": item.get("name") or item.get("description"),
                            "requested_qty": iqty,
                        }
                        stock_matches.append(match)

                        if is_warning:
                            redundant_items.append({
                                **match,
                                "estimated_waste": iqty * (item.get("unit_price", 0) or 0),
                            })
                        break

            # ---- RECENT PURCHASES HISTORY ----
            recent_history = []
            for item in items_to_check:
                iname = _get_item_name(item)
                if len(iname) < 3:
                    continue
                for p in recent_purchases:
                    for pi in p.get("items", []):
                        pi_name = ((pi.get("product_name") or pi.get("name")) or "").strip().lower()
                        if pi_name and (iname == pi_name or iname in pi_name or pi_name in iname):
                            recent_history.append({
                                "product_name": pi.get("product_name") or pi.get("name"),
                                "quantity": pi.get("quantity", 0),
                                "unit": pi.get("unit", ""),
                                "unit_price": pi.get("unit_price", 0),
                                "purchase_date": (p.get("purchase_date") or p.get("created_at", ""))[:10],
                                "supplier_name": p.get("supplier_name", "-"),
                            })
                            break
            seen_h = set()
            deduped_hist = []
            for h in recent_history:
                k = (h["product_name"], h["purchase_date"])
                if k in seen_h:
                    continue
                seen_h.add(k)
                deduped_hist.append(h)
            recent_history = deduped_hist[:15]

            # ---- TREASURY IMPACT ----
            amount = e.get("amount", 0)
            ratio = (amount / available * 100) if available > 0 else None
            if ratio is None:
                level = "critical"
            elif ratio > 50:
                level = "critical"
            elif ratio > 25:
                level = "warning"
            elif ratio > 10:
                level = "moderate"
            else:
                level = "low"

            total_waste = sum(r.get("estimated_waste", 0) for r in redundant_items)

            analyses.append({
                "expense_id": eid,
                "duplicates_count": len(duplicates),
                "duplicates": duplicates[:8],
                "stock_matches_count": len(stock_matches),
                "stock_matches": stock_matches[:20],
                "redundant_items_count": len(redundant_items),
                "redundant_items": redundant_items,
                "redundant_estimated_waste": total_waste,
                "recent_purchases_count": len(recent_history),
                "recent_purchases": recent_history,
                "treasury_impact": {
                    "amount": amount,
                    "available_now": available,
                    "ratio_pct": round(ratio, 1) if ratio is not None else None,
                    "level": level,
                    "would_remain": available - amount,
                }
            })

        return {"treasury": treasury, "analyses": analyses}
    except Exception as e:
        logger.error(f"Error building expenses analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))
