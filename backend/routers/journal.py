"""
Journal Router — Vue consolidée temps réel + prévisionnelle de la trésorerie.

Tableau de bord = "Réel" (factures validées + dépenses payées) + "Prévisionnel"
(forecasts pas encore réglés).

Endpoints :
- GET /api/journal/dashboard?days=30
    Retourne : solde actuel, projections 7j et 30j, totaux entrées/sorties réelles
    et prévisionnelles, alertes intelligentes (ratio>70%, déficit futur, solde<0).
- GET /api/journal/realtime?days=N
    Liste chronologique des opérations réelles sur N jours.
"""
from fastapi import APIRouter, Query, HTTPException
from datetime import datetime, timezone, timedelta
import logging

router = APIRouter(tags=["journal"])
db = None
logger = logging.getLogger(__name__)


def set_db(database):
    global db
    db = database


def _categorize_expense(category: str | None, description: str | None) -> str:
    """Map back-office categories + textual hints onto: cuisine | charges | salaires | divers."""
    cat = (category or "").lower()
    desc = (description or "").lower()
    if cat in ("cuisine", "bar", "accompagnements"):
        return "cuisine"
    if cat in ("salaires",) or "salaire" in desc or "paie " in desc or "paye " in desc:
        return "salaires"
    if cat in ("loyer", "charges", "impots", "maintenance", "electricite", "eau", "internet"):
        return "charges"
    if any(k in desc for k in ["loyer", "edf", "facture", "internet", "fibre", "eau ", "impot", "csu", "cnss"]):
        return "charges"
    if any(k in desc for k in ["salaire", "salaires", "prime", "paie ", "personnel"]):
        return "salaires"
    return "divers"


@router.get("/journal/dashboard")
async def journal_dashboard(days: int = Query(30, ge=1, le=180)):
    """Vue consolidée : solde, projections, alertes."""
    try:
        now = datetime.now(timezone.utc)
        today_iso = now.strftime("%Y-%m-%d")
        horizon = now + timedelta(days=days)
        horizon_iso = horizon.strftime("%Y-%m-%d")
        seven = (now + timedelta(days=7)).strftime("%Y-%m-%d")

        # ============ RÉEL ============
        # Recettes : factures validées de TOUTE l'histoire (le solde est cumulatif).
        invoices = await db.invoices.find(
            {"validation_status": "validated"},
            {"_id": 0, "total": 1, "total_amount": 1, "items": 1, "created_at": 1, "invoice_number": 1, "tip_total": 1},
        ).to_list(20000)
        total_in_real = 0.0
        for inv in invoices:
            # Le champ historique est `total` (subtotal-discount). Fallback sur total_amount si présent.
            amt = inv.get("total")
            if amt is None:
                amt = inv.get("total_amount") or 0
            total_in_real += float(amt or 0)
            total_in_real += float(inv.get("tip_total") or 0)

        # Dépenses : completed + (paiement & is_paid)
        expenses = await db.expenses.find({}, {"_id": 0}).to_list(20000)
        total_out_real = 0.0
        out_by_category = {"cuisine": 0.0, "charges": 0.0, "salaires": 0.0, "divers": 0.0}
        for e in expenses:
            is_finished = (
                e.get("status") == "completed"
                or (e.get("category") == "paiement" and e.get("is_paid") is True)
            )
            if is_finished:
                amt = float(e.get("amount") or 0)
                total_out_real += amt
                bucket = _categorize_expense(e.get("category"), e.get("description"))
                out_by_category[bucket] = out_by_category.get(bucket, 0) + amt

        balance = total_in_real - total_out_real

        # ============ PRÉVISIONNEL ============
        # Forecasts de status=prevu sur l'horizon (sortie future)
        # ainsi que les "paye" déjà comptés dans le réel : on les ignore ici.
        forecasts = await db.forecasts.find(
            {"date": {"$lte": horizon_iso}},
            {"_id": 0},
        ).to_list(5000)

        out_forecast_7d = 0.0
        out_forecast_30d = 0.0
        in_forecast_7d = 0.0
        in_forecast_30d = 0.0

        for f in forecasts:
            if f.get("status") != "prevu":
                continue
            d = f.get("date", "")
            amt = float(f.get("amount") or 0)
            # Convention métier : un Forecast positif = sortie (loyer, salaires…).
            # Cette appli n'a pas de "Forecast d'entrée" en base, on prévoit donc
            # 0 pour les entrées prévisionnelles. On expose le champ pour que
            # l'extension future (entrée prévue) marche sans changer la structure.
            if d <= horizon_iso:
                out_forecast_30d += amt
                if d <= seven:
                    out_forecast_7d += amt

        # ============ PROJECTIONS ============
        balance_7d = balance - out_forecast_7d + in_forecast_7d
        balance_30d = balance - out_forecast_30d + in_forecast_30d

        # ============ ALERTES INTELLIGENTES ============
        alerts = []
        if balance < 0:
            alerts.append({
                "level": "critical",
                "code": "negative_balance",
                "message": f"Solde négatif : {balance:,.0f} F",
            })
        if total_in_real > 0:
            ratio = (total_out_real / total_in_real) * 100
            if ratio > 70:
                alerts.append({
                    "level": "warning",
                    "code": "high_expense_ratio",
                    "message": f"Les dépenses représentent {ratio:.1f}% des entrées (seuil 70%)",
                })
        if balance_7d < 0:
            alerts.append({
                "level": "warning",
                "code": "deficit_7d",
                "message": f"Déficit prévu à 7 jours : {balance_7d:,.0f} F",
            })
        if balance_30d < 0 and balance_7d >= 0:
            alerts.append({
                "level": "info",
                "code": "deficit_30d",
                "message": f"Déficit prévu à 30 jours : {balance_30d:,.0f} F",
            })

        return {
            "as_of": today_iso,
            "actual": {
                "balance": round(balance, 2),
                "total_in": round(total_in_real, 2),
                "total_out": round(total_out_real, 2),
                "out_by_category": {k: round(v, 2) for k, v in out_by_category.items()},
                "invoices_count": len(invoices),
                "expenses_count": sum(1 for e in expenses if (
                    e.get("status") == "completed"
                    or (e.get("category") == "paiement" and e.get("is_paid") is True)
                )),
            },
            "forecast": {
                "balance_7d": round(balance_7d, 2),
                "balance_30d": round(balance_30d, 2),
                "out_7d": round(out_forecast_7d, 2),
                "out_30d": round(out_forecast_30d, 2),
                "in_7d": round(in_forecast_7d, 2),
                "in_30d": round(in_forecast_30d, 2),
            },
            "alerts": alerts,
        }
    except Exception as e:
        logger.exception("journal dashboard error")
        raise HTTPException(500, str(e))


@router.get("/journal/realtime")
async def journal_realtime(days: int = Query(30, ge=1, le=365), limit: int = Query(500, ge=1, le=2000)):
    """Liste chronologique des opérations réelles (factures + dépenses validées)."""
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S")
        rows = []

        # Invoices in window
        invoices = await db.invoices.find(
            {
                "validation_status": "validated",
                "created_at": {"$gte": cutoff},
            },
            {"_id": 0, "id": 1, "invoice_number": 1, "total": 1, "total_amount": 1, "created_at": 1, "server_name": 1, "tip_total": 1, "created_by": 1},
        ).sort("created_at", -1).to_list(limit)
        for inv in invoices:
            base = inv.get("total") if inv.get("total") is not None else (inv.get("total_amount") or 0)
            rows.append({
                "id": "inv-" + str(inv.get("id", "")),
                "type": "entree",
                "category": "ventes",
                "amount": float(base or 0) + float(inv.get("tip_total") or 0),
                "label": f"Facture #{inv.get('invoice_number') or inv.get('id','')[:8]}",
                "ref_id": inv.get("id"),
                "created_at": inv.get("created_at"),
                "by": inv.get("server_name") or inv.get("created_by") or "Caisse",
            })

        # Expenses in window
        expenses = await db.expenses.find(
            {
                "$or": [
                    {"status": "completed", "completed_at": {"$gte": cutoff}},
                    {"category": "paiement", "is_paid": True, "paid_at": {"$gte": cutoff}},
                ]
            },
            {"_id": 0},
        ).sort("created_at", -1).to_list(limit)
        for e in expenses:
            ts = e.get("completed_at") or e.get("paid_at") or e.get("created_at")
            rows.append({
                "id": "exp-" + str(e.get("id", "")),
                "type": "depense",
                "category": _categorize_expense(e.get("category"), e.get("description")),
                "amount": float(e.get("amount") or 0),
                "label": e.get("description") or "Dépense",
                "ref_id": e.get("id"),
                "created_at": ts,
                "by": e.get("paid_by") or e.get("created_by") or "—",
            })

        rows.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
        return {"days": days, "count": len(rows), "operations": rows[:limit]}
    except Exception as e:
        logger.exception("journal realtime error")
        raise HTTPException(500, str(e))
