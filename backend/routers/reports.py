"""
Reports Router - Endpoints d'agrégation et d'analytics (read-only).
Contient: invoice stats (daily/monthly), analytics dashboard, revenue by payment.
Tous respectent le champ assigned_week pour la cohérence cross-semaine.
"""
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timezone, timedelta
import calendar
import logging

router = APIRouter(tags=["reports"])
db = None
logger = logging.getLogger(__name__)


def set_db(database):
    global db
    db = database


# ==================== HELPERS ====================

def normalize_payment_method(raw: str) -> str:
    """Normalize payment method variants to canonical form."""
    method = (raw or "cash").lower().strip()
    if method in ("mobile_money", "momo", "mobilemoney"):
        return "mobile"
    if method in ("especes", "espèces", "espece", "espèce"):
        return "cash"
    if method in ("cheque", "chèque", "check"):
        return "cheque"
    if method in ("bon", "bon-client", "bon_client", "credit"):
        return "wallet"
    return method


def extract_department_totals(invoice: dict) -> dict:
    """Return dict of department totals from an invoice's totals_by_department."""
    dt = invoice.get("totals_by_department", {}) or {}
    return {
        "salle_jardin": dt.get("salle_jardin", 0) + dt.get("jardin", 0),
        "accompagnements": dt.get("accompagnements", 0),
        "jeux": dt.get("jeux", 0),
        "bar": dt.get("bar", 0),
        "location": dt.get("location", 0),
        "autres": dt.get("autres", 0),
    }


# Regroupement métier pour "Faire le point" et "Statistiques & Rapport"
# - bar         : boissons
# - menu_combos : Plats (salle_jardin / jardin) + Accompagnements (frites, sauces…)
# - jeux        : sessions de jeux
# - autres      : items divers (location item à la caisse, autres)
# Les locations de salle/jardin proviennent d'une collection séparée et ne sont
# PAS comptées ici (cf. server.py get_weekly_report -> locations).
def extract_revenue_groups(invoice: dict) -> dict:
    """Return dict with 4 business revenue groups from an invoice."""
    d = extract_department_totals(invoice)
    return {
        "bar": d["bar"],
        "menu_combos": d["salle_jardin"] + d["accompagnements"],
        "jeux": d["jeux"],
        "autres": d["location"] + d["autres"],
    }


# ==================== ENDPOINTS ====================

@router.get("/invoices/stats")
async def get_invoice_stats(date: str = Query(None)):
    """Get invoice statistics by date, respecting assigned_week transfers"""
    try:
        if date:
            invoices_by_date = await db.invoices.find({
                "created_at": {"$regex": f"^{date}"},
                "$or": [
                    {"assigned_week": {"$exists": False}},
                    {"assigned_week": None},
                    {"assigned_week": ""}
                ]
            }, {"_id": 0}).to_list(1000)

            d = datetime.fromisoformat(date)
            week_monday = (d - timedelta(days=d.weekday())).strftime("%Y-%m-%d")
            invoices_assigned = await db.invoices.find({
                "assigned_week": week_monday,
                "created_at": {"$regex": f"^{date}"}
            }, {"_id": 0}).to_list(1000)

            seen = set()
            invoices = []
            for inv in invoices_by_date + invoices_assigned:
                if inv.get("id") not in seen:
                    seen.add(inv.get("id"))
                    invoices.append(inv)
        else:
            invoices = await db.invoices.find({}, {"_id": 0}).to_list(1000)

        total_revenue = sum(inv.get("total", 0) for inv in invoices)
        total_discounts = sum(inv.get("discount_amount", 0) for inv in invoices)

        by_department = {"salle_jardin": 0, "accompagnements": 0, "jeux": 0, "bar": 0, "location": 0, "autres": 0}
        by_revenue_group = {"bar": 0, "menu_combos": 0, "jeux": 0, "autres": 0}
        for inv in invoices:
            d = extract_department_totals(inv)
            for k in by_department:
                by_department[k] += d[k]
            g = extract_revenue_groups(inv)
            for k in by_revenue_group:
                by_revenue_group[k] += g[k]

        invoice_count = len(invoices)
        average_ticket = total_revenue / invoice_count if invoice_count > 0 else 0

        return {
            "total_revenue": total_revenue,
            "total_discounts": total_discounts,
            "by_department": by_department,
            "by_revenue_group": by_revenue_group,
            "invoice_count": invoice_count,
            "average_ticket": average_ticket
        }
    except Exception as e:
        logger.error(f"Error fetching invoice stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/invoices/stats/monthly")
async def get_monthly_stats(year: int = Query(None), month: int = Query(None)):
    """Get monthly statistics, respecting assigned_week transfers"""
    try:
        now = datetime.now(timezone.utc)
        year = year or now.year
        month = month or now.month

        date_prefix = f"{year}-{month:02d}"

        invoices_native = await db.invoices.find({
            "created_at": {"$regex": f"^{date_prefix}"},
            "$or": [
                {"assigned_week": {"$exists": False}},
                {"assigned_week": None},
                {"assigned_week": ""}
            ]
        }, {"_id": 0}).to_list(10000)

        first_day = datetime(year, month, 1)
        last_day_num = calendar.monthrange(year, month)[1]
        last_day = datetime(year, month, last_day_num)

        mondays = []
        d = first_day
        while d <= last_day:
            if d.weekday() == 0:
                mondays.append(d.strftime("%Y-%m-%d"))
            d += timedelta(days=1)

        invoices_assigned = []
        if mondays:
            invoices_assigned = await db.invoices.find({
                "assigned_week": {"$in": mondays}
            }, {"_id": 0}).to_list(10000)

        seen = set()
        invoices = []
        for inv in invoices_native + invoices_assigned:
            if inv.get("id") not in seen:
                seen.add(inv.get("id"))
                invoices.append(inv)

        invoices_transferred_out = await db.invoices.find({
            "created_at": {"$regex": f"^{date_prefix}"},
            "assigned_week": {"$exists": True, "$nin": [None, ""], "$not": {"$in": mondays + [""]}}
        }, {"_id": 0, "id": 1}).to_list(10000)
        transferred_ids = {inv["id"] for inv in invoices_transferred_out}
        invoices = [inv for inv in invoices if inv.get("id") not in transferred_ids]

        daily_stats = {}
        for inv in invoices:
            day = inv.get("created_at", "")[:10]
            if day not in daily_stats:
                daily_stats[day] = {
                    "revenue": 0, "count": 0,
                    "by_revenue_group": {"bar": 0, "menu_combos": 0, "jeux": 0, "autres": 0},
                }
            daily_stats[day]["revenue"] += inv.get("total", 0)
            daily_stats[day]["count"] += 1
            g = extract_revenue_groups(inv)
            for k in daily_stats[day]["by_revenue_group"]:
                daily_stats[day]["by_revenue_group"][k] += g[k]

        total_revenue = sum(inv.get("total", 0) for inv in invoices)

        by_department = {"salle_jardin": 0, "accompagnements": 0, "jeux": 0, "bar": 0, "location": 0, "autres": 0}
        by_revenue_group = {"bar": 0, "menu_combos": 0, "jeux": 0, "autres": 0}
        for inv in invoices:
            d = extract_department_totals(inv)
            for k in by_department:
                by_department[k] += d[k]
            g = extract_revenue_groups(inv)
            for k in by_revenue_group:
                by_revenue_group[k] += g[k]

        # Recettes Locations & Réservations (collection séparée) sur le mois
        # On prend toutes les réservations payées dans le mois (settled_at) OU dont la
        # date de réservation tombe dans le mois (statut != cancelled).
        month_start = f"{date_prefix}-01"
        month_end = f"{date_prefix}-{last_day_num:02d}"
        loc_reservations = await db.location_reservations.find({
            "status": {"$nin": ["cancelled", "annule", "annulee"]},
            "$or": [
                {"reservation_date": {"$gte": month_start, "$lte": month_end}},
                {"settled_at": {"$gte": month_start, "$lte": month_end + "T23:59:59"}},
            ],
        }, {"_id": 0}).to_list(2000)
        _seen = set()
        locations_income = 0
        locations_count = 0
        for loc in loc_reservations:
            lid = loc.get("id")
            if lid in _seen:
                continue
            _seen.add(lid)
            locations_income += loc.get("rental_amount", 0) or 0
            locations_count += 1

        return {
            "year": year,
            "month": month,
            "total_revenue": total_revenue,
            "invoice_count": len(invoices),
            "by_department": by_department,
            "by_revenue_group": by_revenue_group,
            "locations_income": locations_income,
            "locations_count": locations_count,
            "total_income": total_revenue + locations_income,
            "daily_stats": daily_stats
        }
    except Exception as e:
        logger.error(f"Error fetching monthly stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/dashboard")
async def get_analytics_dashboard(year: int = Query(None), month: int = Query(None)):
    """Aggregated analytics dashboard data for a given month (admin).
    Returns current month stats + previous month stats + growth percentages.
    Respects assigned_week: weeks assigned to another month are excluded from the native month.
    """
    try:
        now = datetime.now(timezone.utc)
        year = year or now.year
        month = month or now.month

        async def compute_month(y, m):
            date_prefix = f"{y}-{m:02d}"
            native = await db.invoices.find({
                "created_at": {"$regex": f"^{date_prefix}"},
                "$or": [
                    {"assigned_week": {"$exists": False}},
                    {"assigned_week": None},
                    {"assigned_week": ""}
                ]
            }, {"_id": 0}).to_list(10000)

            last_day = calendar.monthrange(y, m)[1]
            first = datetime(y, m, 1)
            mondays = []
            d = first
            while d <= datetime(y, m, last_day):
                if d.weekday() == 0:
                    mondays.append(d.strftime("%Y-%m-%d"))
                d += timedelta(days=1)
            assigned_in = []
            if mondays:
                assigned_in = await db.invoices.find({
                    "assigned_week": {"$in": mondays}
                }, {"_id": 0}).to_list(10000)

            seen = set()
            invoices = []
            for inv in native + assigned_in:
                if inv.get("id") not in seen:
                    seen.add(inv.get("id"))
                    invoices.append(inv)

            transferred_out_ids = {
                inv["id"] for inv in await db.invoices.find({
                    "created_at": {"$regex": f"^{date_prefix}"},
                    "assigned_week": {"$exists": True, "$nin": [None, ""], "$not": {"$in": mondays + [""]}}
                }, {"_id": 0, "id": 1}).to_list(10000)
            }
            invoices = [inv for inv in invoices if inv.get("id") not in transferred_out_ids]

            validated = [inv for inv in invoices if inv.get("validation_status") == "validated"]

            total_revenue = sum(inv.get("total", 0) for inv in validated)
            invoice_count = len(validated)
            avg_ticket = (total_revenue / invoice_count) if invoice_count else 0

            by_server = {}
            for inv in validated:
                srv = inv.get("created_by") or "Inconnu"
                if srv not in by_server:
                    by_server[srv] = {"total": 0, "count": 0}
                by_server[srv]["total"] += inv.get("total", 0)
                by_server[srv]["count"] += 1

            by_payment = {"cash": 0, "mobile": 0, "cheque": 0, "wallet": 0, "other": 0}
            for inv in validated:
                pm = normalize_payment_method(inv.get("payment_method") or inv.get("payment_mode"))
                if pm in by_payment:
                    by_payment[pm] += inv.get("total", 0)
                else:
                    by_payment["other"] += inv.get("total", 0)

            by_department = {"salle_jardin": 0, "accompagnements": 0, "jeux": 0, "bar": 0, "location": 0, "autres": 0}
            by_revenue_group = {"bar": 0, "menu_combos": 0, "jeux": 0, "autres": 0}
            for inv in validated:
                dept = extract_department_totals(inv)
                for k in by_department:
                    by_department[k] += dept[k]
                g = extract_revenue_groups(inv)
                for k in by_revenue_group:
                    by_revenue_group[k] += g[k]

            daily = {}
            for inv in validated:
                day = (inv.get("assigned_week") or "")[:10] if inv.get("assigned_week") else inv.get("created_at", "")[:10]
                cday = inv.get("created_at", "")[:10]
                if cday.startswith(date_prefix):
                    day = cday
                if not day:
                    continue
                if day not in daily:
                    daily[day] = {"revenue": 0, "count": 0}
                daily[day]["revenue"] += inv.get("total", 0)
                daily[day]["count"] += 1

            product_stats = {}
            for inv in validated:
                for item in inv.get("items", []) or []:
                    name = item.get("name") or item.get("product_name") or "-"
                    qty = item.get("quantity", 1) or 1
                    subtotal = (item.get("price", 0) or 0) * qty
                    if name not in product_stats:
                        product_stats[name] = {"quantity": 0, "revenue": 0}
                    product_stats[name]["quantity"] += qty
                    product_stats[name]["revenue"] += subtotal

            top_products = sorted(
                [{"name": k, **v} for k, v in product_stats.items()],
                key=lambda x: x["revenue"], reverse=True
            )[:10]

            return {
                "year": y,
                "month": m,
                "total_revenue": total_revenue,
                "invoice_count": invoice_count,
                "avg_ticket": round(avg_ticket, 2),
                "by_server": by_server,
                "by_payment_method": by_payment,
                "by_department": by_department,
                "by_revenue_group": by_revenue_group,
                "daily_stats": daily,
                "top_products": top_products,
            }

        if month == 1:
            prev_y, prev_m = year - 1, 12
        else:
            prev_y, prev_m = year, month - 1

        current = await compute_month(year, month)
        previous = await compute_month(prev_y, prev_m)

        def growth_pct(cur, prev):
            if not prev:
                return None if cur == 0 else 100.0
            return round(((cur - prev) / prev) * 100, 2)

        growth = {
            "revenue_pct": growth_pct(current["total_revenue"], previous["total_revenue"]),
            "invoice_count_pct": growth_pct(current["invoice_count"], previous["invoice_count"]),
            "avg_ticket_pct": growth_pct(current["avg_ticket"], previous["avg_ticket"]),
        }

        return {"current": current, "previous": previous, "growth": growth}
    except Exception as e:
        logger.error(f"Error building analytics dashboard: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reports/revenue-by-payment")
async def get_revenue_by_payment_method(week_start: str = None, date: str = None):
    """Get validated invoice revenue grouped by payment method for comparison with reversement.
    Respects assigned_week: includes invoices transferred into the period and excludes those transferred out.
    """
    try:
        is_weekly = False
        if week_start:
            is_weekly = True
            start = datetime.fromisoformat(week_start)
            start = start.replace(hour=0, minute=0, second=0, microsecond=0)
            end = start + timedelta(days=6, hours=23, minutes=59, seconds=59)
            start_str = start.strftime("%Y-%m-%d")
            end_str = end.strftime("%Y-%m-%d") + "T23:59:59Z"
            week_monday_str = start_str
        elif date:
            start_str = date
            end_str = date + "T23:59:59Z"
            d = datetime.fromisoformat(date)
            week_monday_str = (d - timedelta(days=d.weekday())).strftime("%Y-%m-%d")
        else:
            is_weekly = True
            today = datetime.now(timezone.utc)
            start = today - timedelta(days=today.weekday())
            start = start.replace(hour=0, minute=0, second=0, microsecond=0)
            end = start + timedelta(days=6, hours=23, minutes=59, seconds=59)
            start_str = start.strftime("%Y-%m-%d")
            end_str = end.strftime("%Y-%m-%d") + "T23:59:59Z"
            week_monday_str = start_str

        native_invoices = await db.invoices.find({
            "validation_status": "validated",
            "created_at": {"$gte": start_str, "$lte": end_str},
            "$or": [
                {"assigned_week": {"$exists": False}},
                {"assigned_week": None},
                {"assigned_week": ""},
                {"assigned_week": week_monday_str}
            ]
        }, {"_id": 0, "id": 1, "total": 1, "payment_method": 1, "payment_mode": 1, "created_at": 1, "assigned_week": 1}).to_list(5000)

        if is_weekly:
            assigned_invoices = await db.invoices.find({
                "validation_status": "validated",
                "assigned_week": week_monday_str,
                "$or": [
                    {"created_at": {"$lt": start_str}},
                    {"created_at": {"$gt": end_str}}
                ]
            }, {"_id": 0, "id": 1, "total": 1, "payment_method": 1, "payment_mode": 1, "created_at": 1, "assigned_week": 1}).to_list(5000)
        else:
            assigned_invoices = []

        seen = set()
        invoices = []
        for inv in native_invoices + assigned_invoices:
            if inv.get("id") not in seen:
                seen.add(inv.get("id"))
                invoices.append(inv)

        by_method = {"cash": 0, "mobile": 0, "card": 0, "cheque": 0, "wallet": 0, "credit": 0, "other": 0}
        total = 0
        for inv in invoices:
            method = normalize_payment_method(inv.get("payment_method") or inv.get("payment_mode"))
            amt = inv.get("total", 0)
            total += amt
            if method in by_method:
                by_method[method] += amt
            else:
                by_method["other"] += amt

        by_method["wallet"] = by_method.get("wallet", 0) + by_method.pop("credit", 0)

        return {
            "period_start": start_str,
            "total": total,
            "count": len(invoices),
            "by_method": {
                "cash": by_method.get("cash", 0),
                "mobile": by_method.get("mobile", 0),
                "cheque": by_method.get("cheque", 0),
                "wallet": by_method.get("wallet", 0),
            }
        }
    except Exception as e:
        logger.error(f"Error getting revenue by payment: {e}")
        raise HTTPException(status_code=500, detail=str(e))
