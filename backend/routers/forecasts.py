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
from difflib import SequenceMatcher
import calendar
import uuid
import logging
import re
import unicodedata

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


# ---------- Fuzzy item matching helpers ----------

_STOPWORDS = {
    "de", "du", "des", "la", "le", "les", "l", "d", "pour", "avec", "sans", "sur",
    "et", "ou", "en", "un", "une", "au", "aux", "location", "locations", "achat",
    "achats", "liste", "reservation", "reservations", "vente", "ventes", "lot",
    "lots", "paquet", "paquets", "sac", "sacs", "kg", "g", "l", "ml", "cl",
    "piece", "pieces", "unite", "unites", "u",
}


def _strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )


def _normalize_item_name(raw: str) -> str:
    """Lowercase, strip accents, split on non-alpha chars, remove stopwords & trailing 's'."""
    if not raw:
        return ""
    s = _strip_accents(str(raw)).lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    tokens = []
    for t in s.split():
        if t in _STOPWORDS or len(t) < 2:
            continue
        # naive plural strip
        if len(t) > 3 and t.endswith("s"):
            t = t[:-1]
        tokens.append(t)
    return " ".join(tokens)


def _items_match(a_norm: str, b_norm: str, threshold: float = 0.9) -> bool:
    """Match two normalized item names (token-level).
    - Exact token intersection, OR
    - Token prefix match (len ≥ 4) to catch "nappe" vs "nappes" edge cases, OR
    - Per-token fuzzy ratio ≥ threshold (typo tolerance only).
    No substring-anywhere fallback — prevents "oeuf" matching "boeuf".
    """
    if not a_norm or not b_norm:
        return False
    if a_norm == b_norm:
        return True
    a_tokens = [t for t in a_norm.split() if len(t) >= 2]
    b_tokens = [t for t in b_norm.split() if len(t) >= 2]
    if not a_tokens or not b_tokens:
        return False
    if set(a_tokens) & set(b_tokens):
        return True
    for at in a_tokens:
        for bt in b_tokens:
            if len(at) < 4 or len(bt) < 4:
                continue
            if at.startswith(bt) or bt.startswith(at):
                return True
            if SequenceMatcher(None, at, bt).ratio() >= threshold:
                return True
    return False


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

            # Pre-normalize items of current expense (keep index to compute amounts)
            cur_items_norm = []
            for idx, it in enumerate(items):
                raw = it.get("name") or it.get("description") or ""
                norm = _normalize_item_name(raw)
                if norm:
                    cur_items_norm.append({
                        "index": idx,
                        "raw": raw,
                        "norm": norm,
                        "quantity": it.get("quantity", 1) or 1,
                        "unit_price": it.get("unit_price", 0) or 0,
                        "amount": it.get("amount", 0) or 0,
                    })

            # ---- INTRA-LIST DUPLICATES (same article listed twice in this expense) ----
            intra_duplicates = []
            intra_seen_indices = set()
            for i in range(len(cur_items_norm)):
                if cur_items_norm[i]["index"] in intra_seen_indices:
                    continue
                group = [cur_items_norm[i]]
                for j in range(i + 1, len(cur_items_norm)):
                    if cur_items_norm[j]["index"] in intra_seen_indices:
                        continue
                    if _items_match(cur_items_norm[i]["norm"], cur_items_norm[j]["norm"]):
                        group.append(cur_items_norm[j])
                        intra_seen_indices.add(cur_items_norm[j]["index"])
                if len(group) >= 2:
                    intra_seen_indices.add(cur_items_norm[i]["index"])
                    total_qty = sum(g["quantity"] for g in group)
                    total_amount = sum(g["amount"] or (g["quantity"] * g["unit_price"]) for g in group)
                    intra_duplicates.append({
                        "items": [
                            {
                                "name": g["raw"],
                                "quantity": g["quantity"],
                                "unit_price": g["unit_price"],
                                "amount": g["amount"] or (g["quantity"] * g["unit_price"]),
                            } for g in group
                        ],
                        "count": len(group),
                        "total_quantity": total_qty,
                        "total_amount": total_amount,
                    })

            # ---- DUPLICATE ITEMS (item-level fuzzy match vs other recent requests) ----
            duplicate_items = []
            seen_dup_keys = set()

            def _add_dup_item(cur_raw, match_raw, source, source_label, source_date,
                              source_qty, source_unit_price, source_id=None, source_amount=None):
                key = (cur_raw.lower(), source, source_id or source_label, source_date)
                if key in seen_dup_keys:
                    return
                seen_dup_keys.add(key)
                duplicate_items.append({
                    "current_item": cur_raw,
                    "matched_item": match_raw,
                    "source": source,  # "request" | "purchase"
                    "source_label": source_label,
                    "source_date": source_date,
                    "source_quantity": source_qty,
                    "source_unit_price": source_unit_price,
                    "source_id": source_id,
                    "source_amount": source_amount,
                })

            # Compare against other recent expenses (requests)
            for other in recent:
                if other.get("id") == eid or other.get("status") == "cancelled":
                    continue
                o_date = (other.get("created_at") or "")[:10]
                o_desc = other.get("description") or ""
                for oit in other.get("items") or []:
                    o_raw = oit.get("name") or oit.get("description") or ""
                    o_norm = _normalize_item_name(o_raw)
                    if not o_norm:
                        continue
                    for cur in cur_items_norm:
                        if _items_match(cur["norm"], o_norm):
                            _add_dup_item(
                                cur_raw=cur["raw"],
                                match_raw=o_raw,
                                source="request",
                                source_label=o_desc,
                                source_date=o_date,
                                source_qty=oit.get("quantity", 0),
                                source_unit_price=oit.get("unit_price", 0),
                                source_id=other.get("id"),
                                source_amount=oit.get("amount"),
                            )
                            break

            # Compare against recent stock_purchases (already bought)
            for p in recent_purchases:
                p_date = (p.get("purchase_date") or p.get("created_at", ""))[:10]
                p_sup = p.get("supplier_name", "-") or "-"
                for pi in p.get("items", []) or []:
                    p_raw = pi.get("product_name") or pi.get("name") or ""
                    p_norm = _normalize_item_name(p_raw)
                    if not p_norm:
                        continue
                    for cur in cur_items_norm:
                        if _items_match(cur["norm"], p_norm):
                            _add_dup_item(
                                cur_raw=cur["raw"],
                                match_raw=p_raw,
                                source="purchase",
                                source_label=f"Achat • {p_sup}",
                                source_date=p_date,
                                source_qty=pi.get("quantity", 0),
                                source_unit_price=pi.get("unit_price", 0),
                                source_id=p.get("id"),
                                source_amount=(pi.get("quantity", 0) or 0) * (pi.get("unit_price", 0) or 0),
                            )
                            break

            # ---- DUPLICATES at expense level (aggregated) ----
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
                    reasons.append("même fournisseur")

                # item-level fuzzy overlap
                other_norms = []
                for oit in other_items:
                    n = _normalize_item_name(oit.get("name") or oit.get("description") or "")
                    if n:
                        other_norms.append(n)
                if cur_items_norm and other_norms:
                    matched = 0
                    match_examples = []
                    for cur in cur_items_norm:
                        for on in other_norms:
                            if _items_match(cur["norm"], on):
                                matched += 1
                                if len(match_examples) < 3:
                                    match_examples.append(cur["raw"])
                                break
                    if matched > 0:
                        denom = max(1, min(len(cur_items_norm), len(other_norms)))
                        overlap = matched / denom
                        if overlap >= 0.5 or matched >= 3:
                            score += 40
                            reasons.append(f"{matched} article(s) en commun ({', '.join(match_examples)})")
                        elif matched >= 2:
                            score += 25
                            reasons.append(f"{matched} articles en commun ({', '.join(match_examples)})")
                        else:
                            score += 15
                            reasons.append(f"article en commun : {match_examples[0]}")

                e_day = (e.get("created_at") or "")[:10]
                o_day = (other.get("created_at") or "")[:10]
                if e_day and o_day and e_day == o_day:
                    score += 10
                    reasons.append("même jour")

                if score >= 20:
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
                        "level": "certain" if score >= 70 else ("probable" if score >= 45 else "possible"),
                    })
            duplicates.sort(key=lambda d: -d["score"])

            # ---- STOCK MATCHES & REDUNDANT ITEMS ----
            stock_matches = []
            redundant_items = []
            items_to_check = list(items)
            if not items_to_check and desc:
                items_to_check = [{"name": desc, "quantity": e.get("quantity", 1), "unit_price": e.get("unit_price", 0)}]

            for item in items_to_check:
                iname_raw = item.get("name") or item.get("description") or ""
                iname_norm = _normalize_item_name(iname_raw)
                if len(iname_norm) < 2:
                    continue
                iqty = item.get("quantity", 1) or 1
                for sp in stock_products:
                    sp_norm = _normalize_item_name(sp.get("name") or "")
                    if not sp_norm:
                        continue
                    if _items_match(iname_norm, sp_norm):
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
                            "requested_item": iname_raw,
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
                iname_raw = item.get("name") or item.get("description") or ""
                iname_norm = _normalize_item_name(iname_raw)
                if len(iname_norm) < 2:
                    continue
                for p in recent_purchases:
                    for pi in p.get("items", []):
                        pi_raw = pi.get("product_name") or pi.get("name") or ""
                        pi_norm = _normalize_item_name(pi_raw)
                        if pi_norm and _items_match(iname_norm, pi_norm):
                            recent_history.append({
                                "product_name": pi_raw,
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
                "duplicate_items_count": len(duplicate_items),
                "duplicate_items": duplicate_items[:30],
                "intra_duplicates_count": len(intra_duplicates),
                "intra_duplicates": intra_duplicates,
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
