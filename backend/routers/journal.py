"""
Journal Router — Vue consolidée temps réel + prévisionnelle de la trésorerie.

Tableau de bord = "Réel" (factures validées + dépenses payées) + "Prévisionnel"
(forecasts pas encore réglés).

Endpoints :
- GET  /api/journal/dashboard?days=30
- GET  /api/journal/realtime?days=N&since=YYYY-MM-DD
- POST /api/journal/manual          → entrée/sortie saisie à la main (réelle)
- DELETE /api/journal/manual/{id}   → suppression d'une opération manuelle
- POST /api/journal/chat            → assistant conversationnel (LLM)
"""
from fastapi import APIRouter, Query, HTTPException, Body
from pydantic import BaseModel, Field
from datetime import datetime, timezone, timedelta
from typing import Optional
import uuid
import json
import re
import os
import logging

router = APIRouter(tags=["journal"])
db = None
logger = logging.getLogger(__name__)

# Date pivot par défaut. La valeur effective est lue/écrite dans la collection
# `app_settings` (clé "journal_cutoff") pour permettre la modification depuis l'UI.
JOURNAL_CUTOFF_DEFAULT = "2026-05-01"


async def _get_cutoff() -> str:
    """Lit la date pivot active depuis app_settings (avec fallback sur la default)."""
    try:
        doc = await db.app_settings.find_one({"key": "journal_cutoff"}, {"_id": 0})
        if doc and doc.get("value"):
            return str(doc["value"])
    except Exception:
        pass
    return JOURNAL_CUTOFF_DEFAULT


async def _set_cutoff(new_value: str) -> None:
    await db.app_settings.update_one(
        {"key": "journal_cutoff"},
        {"$set": {"key": "journal_cutoff", "value": new_value, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )


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
        cutoff = await _get_cutoff()

        # ============ RÉEL (depuis cutoff dynamique) ============
        excl_inv = await _excluded_ids("invoice")
        excl_exp = await _excluded_ids("expense")
        # Recettes : factures validées créées à partir de la date pivot.
        inv_query = {
            "validation_status": "validated",
            "created_at": {"$gte": cutoff},
        }
        if excl_inv:
            inv_query["id"] = {"$nin": list(excl_inv)}
        invoices = await db.invoices.find(
            inv_query,
            {"_id": 0, "id": 1, "total": 1, "total_amount": 1, "items": 1, "created_at": 1, "invoice_number": 1, "tip_total": 1},
        ).to_list(20000)
        total_in_real = 0.0
        for inv in invoices:
            # Le champ historique est `total` (subtotal-discount). Fallback sur total_amount si présent.
            amt = inv.get("total")
            if amt is None:
                amt = inv.get("total_amount") or 0
            total_in_real += float(amt or 0)
            total_in_real += float(inv.get("tip_total") or 0)

        # Dépenses : completed + (paiement & is_paid), depuis cutoff aussi.
        exp_query = {"$or": [
            {"completed_at": {"$gte": cutoff}},
            {"paid_at": {"$gte": cutoff}},
            {"created_at": {"$gte": cutoff}},
        ]}
        if excl_exp:
            exp_query["id"] = {"$nin": list(excl_exp)}
        # Déjà liées manuellement ? → on les retire ici pour éviter le doublon
        # (l'op manuelle compte à leur place).
        linked_exp = await _linked_expense_ids()
        if linked_exp:
            prev = exp_query.get("id")
            if prev and isinstance(prev, dict) and "$nin" in prev:
                exp_query["id"] = {"$nin": list(set(prev["$nin"]) | linked_exp)}
            else:
                exp_query["id"] = {"$nin": list(linked_exp)}
        expenses = await db.expenses.find(
            exp_query,
            {"_id": 0},
        ).to_list(20000)
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

        # ============ OPÉRATIONS MANUELLES (saisies via assistant ou bouton) ============
        manual_ops = await db.journal_manual.find(
            {"created_at": {"$gte": cutoff}},
            {"_id": 0},
        ).to_list(5000)
        for m in manual_ops:
            amt = float(m.get("amount") or 0)
            if m.get("type") == "entree":
                total_in_real += amt
                balance += amt
            else:
                total_out_real += amt
                balance -= amt
                bucket = m.get("category") or "divers"
                if bucket in out_by_category:
                    out_by_category[bucket] += amt
                else:
                    out_by_category["divers"] += amt

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
            "cutoff": cutoff,
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
    """Liste chronologique des opérations réelles (factures + dépenses + manuelles), depuis cutoff dynamique."""
    try:
        cutoff_window = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S")
        # On combine : `cutoff de fenêtre temporelle (days)` + `cutoff métier dynamique`.
        # On garde le plus récent des deux pour ne JAMAIS afficher avant la date pivot.
        journal_cutoff = await _get_cutoff()
        cutoff = max(cutoff_window, journal_cutoff)
        excl_inv = await _excluded_ids("invoice")
        excl_exp = await _excluded_ids("expense")
        rows = []

        # Invoices in window
        inv_q = {
            "validation_status": "validated",
            "created_at": {"$gte": cutoff},
        }
        if excl_inv:
            inv_q["id"] = {"$nin": list(excl_inv)}
        invoices = await db.invoices.find(
            inv_q,
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
                "source": "invoice",
                "excludable": True,
            })

        # Expenses in window
        exp_q = {
            "$or": [
                {"status": "completed", "completed_at": {"$gte": cutoff}},
                {"category": "paiement", "is_paid": True, "paid_at": {"$gte": cutoff}},
            ]
        }
        if excl_exp:
            exp_q["id"] = {"$nin": list(excl_exp)}
        # Anti-doublon : dépenses déjà représentées par une op manuelle liée.
        linked_exp = await _linked_expense_ids()
        if linked_exp:
            prev = exp_q.get("id")
            if prev and isinstance(prev, dict) and "$nin" in prev:
                exp_q["id"] = {"$nin": list(set(prev["$nin"]) | linked_exp)}
            else:
                exp_q["id"] = {"$nin": list(linked_exp)}
        expenses = await db.expenses.find(
            exp_q,
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
                "source": "expense",
                "excludable": True,
            })

        # Opérations manuelles (saisies à la main ou via chat)
        manuals = await db.journal_manual.find(
            {"created_at": {"$gte": cutoff}},
            {"_id": 0},
        ).sort("created_at", -1).to_list(limit)
        for m in manuals:
            rows.append({
                "id": "man-" + str(m.get("id", "")),
                "type": m.get("type"),
                "category": m.get("category") or "divers",
                "amount": float(m.get("amount") or 0),
                "label": m.get("label") or "Opération manuelle",
                "ref_id": m.get("id"),
                "created_at": m.get("created_at"),
                "by": m.get("created_by") or "Admin",
                "deletable": True,
                "source": m.get("source") or "manual",
            })

        rows.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
        return {"days": days, "count": len(rows), "operations": rows[:limit]}
    except Exception as e:
        logger.exception("journal realtime error")
        raise HTTPException(500, str(e))


# ==================== OPÉRATIONS MANUELLES ====================

class ManualOpCreate(BaseModel):
    type: str = Field(..., description="entree | depense")
    amount: float = Field(..., gt=0)
    label: str = ""
    category: Optional[str] = None  # cuisine | charges | salaires | divers | ventes
    created_by: Optional[str] = "Admin"
    occurred_at: Optional[str] = None  # ISO date string ; défaut = now


def _auto_category(label: str, type_: str) -> str:
    s = (label or "").lower()
    if type_ == "entree":
        return "ventes"
    if any(k in s for k in ["loyer", "edf", "facture", "internet", "fibre", "eau ", "impot", "csu", "cnss", "charge"]):
        return "charges"
    if any(k in s for k in ["salaire", "salaires", "prime", "paie ", "personnel", "employé"]):
        return "salaires"
    if any(k in s for k in ["cuisine", "marché", "marche", "fournisseur", "achat", "vivres"]):
        return "cuisine"
    return "divers"


@router.post("/journal/manual")
async def create_manual_op(payload: ManualOpCreate):
    """Crée une opération manuelle (entrée ou sortie réelle)."""
    if payload.type not in ("entree", "depense"):
        raise HTTPException(422, "type doit être 'entree' ou 'depense'")
    now = datetime.now(timezone.utc)
    occurred = payload.occurred_at or now.isoformat()
    cat = payload.category or _auto_category(payload.label, payload.type)
    cutoff = await _get_cutoff()
    doc = {
        "id": str(uuid.uuid4()),
        "type": payload.type,
        "amount": float(payload.amount),
        "label": (payload.label or "").strip() or ("Entrée manuelle" if payload.type == "entree" else "Dépense manuelle"),
        "category": cat,
        "created_by": payload.created_by or "Admin",
        "created_at": occurred if occurred >= cutoff else now.isoformat(),
        "source": "manual",
    }
    await db.journal_manual.insert_one(doc.copy())
    doc.pop("_id", None)
    return {"success": True, "operation": doc}


@router.delete("/journal/manual/{op_id}")
async def delete_manual_op(op_id: str):
    res = await db.journal_manual.delete_one({"id": op_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Opération introuvable")
    return {"success": True}


# ==================== EXCLUSIONS (auto-entries: invoices & expenses) ====================

class ExcludePayload(BaseModel):
    source: str = Field(..., description="invoice | expense")
    ref_id: str = Field(..., min_length=1)
    excluded_by: Optional[str] = "Admin"
    reason: Optional[str] = None


@router.post("/journal/exclude")
async def exclude_from_journal(payload: ExcludePayload):
    """Masque une facture ou une dépense du journal de trésorerie.

    La facture/dépense reste intacte dans la caisse (source de vérité) ;
    elle est simplement retirée des agrégats et de la liste du journal.
    Idempotent : plusieurs appels ne créent qu'une seule exclusion.
    """
    src = (payload.source or "").lower()
    if src not in ("invoice", "expense"):
        raise HTTPException(422, "source doit être 'invoice' ou 'expense'")
    key = {"source": src, "ref_id": payload.ref_id}
    await db.journal_excluded.update_one(
        key,
        {"$set": {
            **key,
            "excluded_by": payload.excluded_by or "Admin",
            "reason": payload.reason,
            "excluded_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"success": True, "source": src, "ref_id": payload.ref_id}


@router.post("/journal/include")
async def include_in_journal(payload: ExcludePayload):
    """Réintègre une facture/dépense précédemment exclue du journal."""
    src = (payload.source or "").lower()
    if src not in ("invoice", "expense"):
        raise HTTPException(422, "source doit être 'invoice' ou 'expense'")
    res = await db.journal_excluded.delete_one({"source": src, "ref_id": payload.ref_id})
    return {"success": True, "removed": res.deleted_count}


@router.get("/journal/exclusions")
async def list_exclusions():
    items = await db.journal_excluded.find({}, {"_id": 0}).sort("excluded_at", -1).to_list(2000)
    return {"count": len(items), "exclusions": items}


async def _linked_expense_ids() -> set:
    """IDs des dépenses déjà rattachées au journal via un journal_manual."""
    try:
        rows = await db.journal_manual.find(
            {"linked_expense_id": {"$ne": None}},
            {"_id": 0, "linked_expense_id": 1},
        ).to_list(10000)
        return {r.get("linked_expense_id") for r in rows if r.get("linked_expense_id")}
    except Exception:
        return set()


@router.get("/journal/available-expenses")
async def list_available_expenses(
    search: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
):
    """Liste les achats/dépenses du module Achats que l'admin peut lier au journal.

    Chaque ligne retourne aussi un flag `already_in_journal` pour indiquer :
    - si elle est déjà comptée automatiquement (status=completed ou paid),
    - ou déjà liée manuellement via `journal_manual.linked_expense_id`.
    """
    query = {}
    if search:
        rgx = {"$regex": re.escape(search.strip()), "$options": "i"}
        query["$or"] = [
            {"description": rgx},
            {"category": rgx},
            {"supplier": rgx},
            {"reference": rgx},
        ]
    expenses = await db.expenses.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    linked = await _linked_expense_ids()
    excluded = await _excluded_ids("expense")

    rows = []
    for e in expenses:
        eid = e.get("id")
        is_completed = e.get("status") == "completed"
        is_paid = e.get("category") == "paiement" and e.get("is_paid") is True
        is_linked = eid in linked
        is_excluded = eid in excluded
        rows.append({
            "id": eid,
            "description": e.get("description") or "—",
            "category": e.get("category") or "autres",
            "supplier": e.get("supplier") or "",
            "amount": float(e.get("amount") or 0),
            "status": e.get("status") or "pending",
            "created_at": e.get("created_at"),
            "completed_at": e.get("completed_at"),
            "paid_at": e.get("paid_at"),
            "is_paid": bool(e.get("is_paid")),
            "is_completed": is_completed,
            "already_in_journal": (is_completed or is_paid or is_linked) and not is_excluded,
            "already_linked": is_linked,
            "excluded": is_excluded,
        })
    return {"count": len(rows), "expenses": rows}


class LinkExpensePayload(BaseModel):
    expense_id: str = Field(..., min_length=1)
    linked_by: Optional[str] = "Admin"


@router.post("/journal/link-expense")
async def link_expense_to_journal(payload: LinkExpensePayload):
    """Crée une opération manuelle dans le journal pointant vers une dépense
    existante (`linked_expense_id`). L'anti-doublon du dashboard ignorera
    ensuite la dépense auto quand elle sera marquée completed/paid.
    """
    exp = await db.expenses.find_one({"id": payload.expense_id}, {"_id": 0})
    if not exp:
        raise HTTPException(404, "Achat introuvable")

    # Idempotence : si déjà lié, ne rien faire et renvoyer l'op existante.
    existing = await db.journal_manual.find_one(
        {"linked_expense_id": payload.expense_id},
        {"_id": 0},
    )
    if existing:
        return {"success": True, "already_linked": True, "operation": existing}

    amount = float(exp.get("amount") or 0)
    if amount <= 0:
        raise HTTPException(422, "Montant invalide (0)")

    cat = _categorize_expense(exp.get("category"), exp.get("description"))
    now = datetime.now(timezone.utc)
    cutoff = await _get_cutoff()
    created_raw = exp.get("created_at") or now.isoformat()
    # Normalise (même format que cutoff "YYYY-MM-DD")
    created_at = created_raw if str(created_raw) >= cutoff else now.isoformat()

    doc = {
        "id": str(uuid.uuid4()),
        "type": "depense",
        "amount": amount,
        "label": exp.get("description") or "Dépense liée",
        "category": cat,
        "created_by": payload.linked_by or "Admin",
        "created_at": created_at,
        "source": "expense_link",
        "linked_expense_id": payload.expense_id,
    }
    await db.journal_manual.insert_one(doc.copy())
    doc.pop("_id", None)
    return {"success": True, "operation": doc}


async def _excluded_ids(source: str) -> set:
    try:
        rows = await db.journal_excluded.find(
            {"source": source}, {"_id": 0, "ref_id": 1}
        ).to_list(10000)
        return {r.get("ref_id") for r in rows if r.get("ref_id")}
    except Exception:
        return set()


# ==================== PARAMÈTRES (date de début + reset) ====================

class CutoffPayload(BaseModel):
    cutoff_date: str = Field(..., description="YYYY-MM-DD ; nouvelle date de début du journal")


@router.get("/journal/settings")
async def get_journal_settings():
    """Renvoie la date de début active du journal."""
    cutoff = await _get_cutoff()
    return {"cutoff_date": cutoff, "default": JOURNAL_CUTOFF_DEFAULT}


@router.post("/journal/settings")
async def update_journal_settings(payload: CutoffPayload):
    """Modifie la date de début du journal. Format strict : YYYY-MM-DD."""
    val = (payload.cutoff_date or "").strip()
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", val):
        raise HTTPException(422, "Format attendu : YYYY-MM-DD")
    try:
        # Validation parse
        datetime.strptime(val, "%Y-%m-%d")
    except Exception:
        raise HTTPException(422, "Date invalide")
    await _set_cutoff(val)
    return {"success": True, "cutoff_date": val}


class ResetPayload(BaseModel):
    confirm: bool = Field(..., description="Doit être true pour confirmer la suppression")
    set_cutoff_to: Optional[str] = Field(None, description="Optionnel : nouvelle date pivot après reset")


@router.post("/journal/reset")
async def reset_journal(payload: ResetPayload):
    """Réinitialise le journal :
    - supprime toutes les opérations manuelles (collection journal_manual),
    - optionnellement repositionne la date de début (`set_cutoff_to`).
    Les factures et dépenses NE SONT PAS supprimées (sources de vérité).
    """
    if not payload.confirm:
        raise HTTPException(400, "confirm doit être true")
    res = await db.journal_manual.delete_many({})
    new_cutoff = None
    if payload.set_cutoff_to:
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", payload.set_cutoff_to):
            raise HTTPException(422, "set_cutoff_to format YYYY-MM-DD")
        await _set_cutoff(payload.set_cutoff_to)
        new_cutoff = payload.set_cutoff_to
    return {
        "success": True,
        "deleted_manual_ops": res.deleted_count,
        "cutoff_date": new_cutoff or await _get_cutoff(),
    }


# ==================== ASSISTANT CONVERSATIONNEL (LLM) ====================

class ChatRequest(BaseModel):
    message: str
    user: Optional[str] = "Admin"


def _strip_code_fence(s: str) -> str:
    s = (s or "").strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.IGNORECASE)
        s = re.sub(r"\s*```$", "", s)
    return s.strip()


@router.post("/journal/chat")
async def journal_chat(payload: ChatRequest = Body(...)):
    """Assistant : parse une commande FR puis exécute (création réelle ou prévisionnelle)."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:  # pragma: no cover
        raise HTTPException(500, f"emergentintegrations indisponible : {e}")

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(500, "EMERGENT_LLM_KEY non configurée")

    msg = (payload.message or "").strip()
    if not msg:
        raise HTTPException(422, "Message vide")

    today_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    system = (
        "Tu es un parseur de commandes financières en français pour un POS de restaurant. "
        "Tu dois traduire le message de l'utilisateur en JSON STRICT (pas de prose), schema :\n"
        '{"action": "create_real" | "create_forecast" | "show_balance" | "show_journal" | "show_forecasts" | "show_report" | "unknown",\n'
        ' "type": "entree" | "depense" | null,\n'
        ' "amount": number | null,\n'
        ' "label": string,\n'
        ' "category": "cuisine" | "charges" | "salaires" | "divers" | "ventes" | null,\n'
        ' "date": "YYYY-MM-DD" | null }\n\n'
        "Règles : \n"
        "- ENTRÉE/RECETTE → action=create_real, type=entree.\n"
        "- DÉPENSE/SORTIE → action=create_real, type=depense.\n"
        "- PRÉVISION ENTRÉE → action=create_forecast, type=entree (date obligatoire).\n"
        "- PRÉVISION DÉPENSE → action=create_forecast, type=depense (date obligatoire).\n"
        "- SITUATION/SOLDE → action=show_balance.\n"
        "- JOURNAL → action=show_journal.\n"
        "- PRÉVISIONS → action=show_forecasts.\n"
        "- RAPPORT JOURNALIER/HEBDOMADAIRE/PRÉVISIONNEL → action=show_report.\n"
        "- Sinon action=unknown.\n"
        f"- Date par défaut si absente : {today_iso}.\n"
        "- Catégorie : déduire de la description ; ventes pour les recettes.\n"
        "- amount : nombre uniquement (pas de FCFA, pas d'espaces). Convertir 25 000 ou 25k → 25000.\n"
        "Réponds UNIQUEMENT avec le JSON, rien d'autre."
    )
    chat = LlmChat(api_key=api_key, session_id=f"journal-{uuid.uuid4()}", system_message=system).with_model(
        "anthropic", "claude-sonnet-4-5-20250929"
    )
    raw = await chat.send_message(UserMessage(text=msg))
    text = _strip_code_fence(raw)

    try:
        parsed = json.loads(text)
    except Exception:
        return {"success": False, "action": "unknown", "raw": raw, "executed": False, "explain": "Désolé, je n'ai pas compris votre commande."}

    action = parsed.get("action") or "unknown"
    type_ = parsed.get("type")
    amount = parsed.get("amount")
    label = parsed.get("label") or ""
    category = parsed.get("category")
    date_str = parsed.get("date") or today_iso
    executed = False
    result = None
    explain = ""

    try:
        if action == "create_real" and type_ in ("entree", "depense") and amount and amount > 0:
            doc = {
                "id": str(uuid.uuid4()),
                "type": type_,
                "amount": float(amount),
                "label": label or ("Entrée manuelle" if type_ == "entree" else "Dépense manuelle"),
                "category": category or _auto_category(label, type_),
                "created_by": payload.user or "Admin",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "source": "chat",
            }
            await db.journal_manual.insert_one(doc.copy())
            doc.pop("_id", None)
            result = doc
            executed = True
            verb = "Entrée" if type_ == "entree" else "Dépense"
            explain = f"✅ {verb} de {int(amount):,} F enregistrée — \"{doc['label']}\" ({doc['category']})."
        elif action == "create_forecast" and type_ in ("entree", "depense") and amount and amount > 0:
            cat = category or _auto_category(label, type_)
            fdoc = {
                "id": str(uuid.uuid4()),
                "date": date_str,
                "label": label or ("Prévision entrée" if type_ == "entree" else "Prévision dépense"),
                "amount": float(amount),
                "category": cat if cat in ("salaires", "loyer", "fournisseur", "charges", "impots", "maintenance", "autre") else "autre",
                "status": "prevu",
                "recurrence": "none",
                "notes": f"type={type_} (créé via chat)",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.forecasts.insert_one(fdoc.copy())
            fdoc.pop("_id", None)
            result = fdoc
            executed = True
            verb = "entrée" if type_ == "entree" else "sortie"
            explain = f"📅 Prévision de {verb} ({int(amount):,} F) enregistrée pour le {date_str}."
        elif action == "show_balance":
            explain = "💰 Voir le bandeau \"Solde actuel\" en haut du Journal."
        elif action == "show_journal":
            explain = "📖 Le journal complet est affiché juste en-dessous."
        elif action == "show_forecasts":
            explain = "📅 Voir l'onglet \"Prévisionnel\"."
        elif action == "show_report":
            explain = "📊 Utilisez l'onglet \"Faire le point\" pour générer un rapport (PDF / WhatsApp)."
        else:
            explain = "🤔 Je n'ai pas compris. Exemples : \"ENTRÉE: 25000 - vente du soir\", \"DÉPENSE: 5000 - taxi\", \"PRÉVISION DÉPENSE: 100000 - loyer - 2026-06-01\"."
    except Exception as e:
        logger.exception("chat exec error")
        explain = f"❌ Erreur lors de l'exécution : {e}"

    return {
        "success": True,
        "action": action,
        "executed": executed,
        "parsed": parsed,
        "result": result,
        "explain": explain,
    }
