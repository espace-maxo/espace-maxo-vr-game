"""
OHADA Journal — Génère un brouillard comptable selon le plan OHADA.

Endpoint principal : GET /api/journal/ohada?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&account=X&search=Y

Sources mappées en écritures comptables :
  - Factures validées        → 571 Caisse (D) / 707 Ventes (C)
  - Achats finalisés         → 6xx Charges (D) / 571 Caisse OU 467 Comptes courants (C)
  - Reversements responsable op. & log     → 571 Caisse Admin (D) / 467 Responsable Op. & Log (C)
  - Avances Responsable Op. & Log          → 467 Responsable Op. & Log (D) / 571 Caisse (C)
  - Fonds Propres            → 6xx Charges (D) / 467 Fonds Propres (C)
  - Remb. Fonds Propres      → 467 Fonds Propres (D) / 571 Caisse (C)
  - Ouverture journée + fond → 571 Caisse (D) / 581 Caisse en transit (C)

Tous les calculs sont READ-ONLY.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, List
import os

from fastapi import APIRouter, Query, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient

router = APIRouter(tags=["journal-ohada"])

mongo_url = os.environ.get("MONGO_URL")
db_name = os.environ.get("DB_NAME")
db_client = AsyncIOMotorClient(mongo_url)
db = db_client[db_name]


# ────────── Plan OHADA simplifié (mapping standard) ──────────
OHADA = {
    "571_CAISSE":          {"num": "571", "label": "Caisse"},
    "521_BANQUES":         {"num": "521", "label": "Banques"},
    "411_CLIENTS":         {"num": "411", "label": "Clients"},
    "467_GERANTE":         {"num": "467", "label": "Compte courant Responsable Op. & Log"},
    "467_FONDS_PROPRES":   {"num": "467", "label": "Fonds propres exploitant"},
    "70_VENTES":           {"num": "70",  "label": "Ventes (chiffre d'affaires)"},
    "707_MARCHANDISES":    {"num": "707", "label": "Ventes marchandises (Bar)"},
    "706_SERVICES":        {"num": "706", "label": "Prestations de service (Menu/Jeux/Loc)"},
    "601_ACHATS":          {"num": "601", "label": "Achats marchandises"},
    "604_ACHATS_CONSO":    {"num": "604", "label": "Achats stockés consommables"},
    "61_SERVICES_EXT":     {"num": "61",  "label": "Services extérieurs"},
    "658_DIVERS":          {"num": "658", "label": "Charges diverses d'exploitation"},
    "581_CAISSE_TRANSIT":  {"num": "581", "label": "Virement de fonds"},
}


def _make_entry(date_iso: str, libelle: str, account_debit: dict, account_credit: dict,
                amount: float, source: str, ref_id: str = "", author: str = "") -> dict:
    return {
        "date": date_iso,
        "libelle": libelle,
        "debit_num": account_debit["num"],
        "debit_label": account_debit["label"],
        "credit_num": account_credit["num"],
        "credit_label": account_credit["label"],
        "amount": float(amount or 0),
        "source": source,
        "ref_id": ref_id,
        "author": author,
    }


def _category_to_charge_account(cat: str) -> dict:
    cat = (cat or "").lower()
    if cat in ("cuisine", "alimentaire", "food"):
        return OHADA["601_ACHATS"]
    if cat in ("bar", "boisson", "drink"):
        return OHADA["601_ACHATS"]
    if cat in ("consommable", "fourniture"):
        return OHADA["604_ACHATS_CONSO"]
    if cat in ("service", "entretien", "transport"):
        return OHADA["61_SERVICES_EXT"]
    return OHADA["658_DIVERS"]


def _invoice_revenue_account(inv: dict) -> dict:
    # Si la facture provient majoritairement du bar, on bascule vers 707
    items = inv.get("items") or []
    bar_total = 0.0
    other = 0.0
    for it in items:
        dept = (it.get("department") or it.get("category") or "").lower()
        amt = float(it.get("price") or 0) * float(it.get("quantity") or 1)
        if dept in ("bar", "boisson", "drink"): bar_total += amt
        else: other += amt
    return OHADA["707_MARCHANDISES"] if bar_total >= other else OHADA["706_SERVICES"]


def _within(iso: str, start: str, end: str) -> bool:
    if not iso: return False
    return start <= iso < end


async def _collect_entries(start_iso: str, end_iso: str) -> List[dict]:
    entries: List[dict] = []

    # 1) Factures validées → D Caisse / C Ventes
    invoices = await db.invoices.find({
        "validation_status": "validated",
        "validated_at": {"$gte": start_iso, "$lt": end_iso},
    }, {"_id": 0}).to_list(50000)
    for inv in invoices:
        date_iso = inv.get("validated_at") or inv.get("created_at")
        ventes = _invoice_revenue_account(inv)
        # Mode de paiement → Caisse (espèces) ou Banques (mobile/cheque)
        pmode = (inv.get("payment_method") or "cash").lower()
        compte_debit = OHADA["521_BANQUES"] if pmode in ("mobile", "cheque", "wallet", "credit") else OHADA["571_CAISSE"]
        entries.append(_make_entry(
            date_iso=date_iso,
            libelle=f"Facture #{inv.get('id','')[:8]} · Table {inv.get('table_number','?')}",
            account_debit=compte_debit,
            account_credit=ventes,
            amount=float(inv.get("total") or 0),
            source="facture",
            ref_id=inv.get("id", ""),
            author=inv.get("validated_by") or inv.get("created_by") or "",
        ))

    # 2) Achats finalisés (expenses status=completed OU is_paid=true) → D Charges / C Caisse|467
    expenses = await db.expenses.find({
        "$or": [
            {"completed_at": {"$gte": start_iso, "$lt": end_iso}},
            {"paid_at": {"$gte": start_iso, "$lt": end_iso}},
        ],
        "status": {"$in": ["completed", "approved"]},
    }, {"_id": 0}).to_list(20000)
    for exp in expenses:
        date_iso = exp.get("paid_at") or exp.get("completed_at") or exp.get("created_at")
        charge = _category_to_charge_account(exp.get("category"))
        pmode = exp.get("payment_mode")
        if pmode == "fonds_propres":
            credit = OHADA["467_FONDS_PROPRES"]
        else:
            credit = OHADA["571_CAISSE"]
        entries.append(_make_entry(
            date_iso=date_iso,
            libelle=f"Achat · {exp.get('description','')}",
            account_debit=charge,
            account_credit=credit,
            amount=float(exp.get("amount") or 0),
            source="achat",
            ref_id=exp.get("id", ""),
            author=exp.get("paid_by") or exp.get("requested_by") or "",
        ))

    # 3) Reversements (financial_points) → D Caisse Admin / C 467 Responsable Op. & Log
    revs = await db.financial_points.find({
        "created_at": {"$gte": start_iso, "$lt": end_iso},
    }, {"_id": 0}).to_list(5000)
    for r in revs:
        amt = float(r.get("amount") or r.get("total_recorded") or 0)
        if amt <= 0: continue
        entries.append(_make_entry(
            date_iso=r.get("created_at"),
            libelle=f"Reversement {r.get('category','')} · {r.get('period_type','daily')}",
            account_debit=OHADA["571_CAISSE"],
            account_credit=OHADA["467_GERANTE"],
            amount=amt,
            source="reversement",
            ref_id=r.get("id", ""),
            author=r.get("created_by") or "",
        ))

    # 4) Avances Responsable Op. & Log (gerante_advances)
    try:
        advances = await db.gerante_advances.find({
            "created_at": {"$gte": start_iso, "$lt": end_iso},
        }, {"_id": 0}).to_list(5000)
        for a in advances:
            entries.append(_make_entry(
                date_iso=a.get("created_at"),
                libelle=f"Avance Responsable Op. & Log · {a.get('purpose','')}",
                account_debit=OHADA["467_GERANTE"],
                account_credit=OHADA["571_CAISSE"],
                amount=float(a.get("amount") or 0),
                source="avance_gerante",
                ref_id=a.get("id", ""),
                author=a.get("created_by") or "",
            ))
            if a.get("reimbursed_at") and _within(a.get("reimbursed_at"), start_iso, end_iso):
                entries.append(_make_entry(
                    date_iso=a.get("reimbursed_at"),
                    libelle=f"Remboursement avance Responsable Op. & Log · {a.get('purpose','')}",
                    account_debit=OHADA["571_CAISSE"],
                    account_credit=OHADA["467_GERANTE"],
                    amount=float(a.get("amount") or 0),
                    source="remboursement_avance",
                    ref_id=a.get("id", ""),
                    author=a.get("reimbursed_by") or "",
                ))
    except Exception:
        pass

    # 5) Remboursements Fonds Propres (depuis shopping_list items + expenses)
    fp_items = await db.shopping_list_items.find({
        "payment_mode": "fonds_propres",
        "reimbursed": True,
        "reimbursed_at": {"$gte": start_iso, "$lt": end_iso},
    }, {"_id": 0}).to_list(5000)
    for it in fp_items:
        amt = float(it.get("real_total") if it.get("real_total") is not None else (it.get("estimated_total") or 0))
        if amt <= 0: continue
        entries.append(_make_entry(
            date_iso=it.get("reimbursed_at"),
            libelle=f"Remboursement Fonds Propres · {it.get('name','')}",
            account_debit=OHADA["467_FONDS_PROPRES"],
            account_credit=OHADA["571_CAISSE"],
            amount=amt,
            source="remb_fonds_propres",
            ref_id=it.get("id", ""),
            author=it.get("reimbursed_by") or "",
        ))
    fp_exps = await db.expenses.find({
        "payment_mode": "fonds_propres",
        "reimbursed": True,
        "reimbursed_at": {"$gte": start_iso, "$lt": end_iso},
    }, {"_id": 0}).to_list(5000)
    for e in fp_exps:
        amt = float(e.get("amount") or 0)
        if amt <= 0: continue
        entries.append(_make_entry(
            date_iso=e.get("reimbursed_at"),
            libelle=f"Remboursement Fonds Propres · {e.get('description','')}",
            account_debit=OHADA["467_FONDS_PROPRES"],
            account_credit=OHADA["571_CAISSE"],
            amount=amt,
            source="remb_fonds_propres",
            ref_id=e.get("id", ""),
            author=e.get("reimbursed_by") or "",
        ))

    # 6) Ouvertures de journée avec fond de caisse initial
    openings = await db.day_openings.find({
        "opened_at": {"$gte": start_iso, "$lt": end_iso},
    }, {"_id": 0}).to_list(500)
    for o in openings:
        fund = float(o.get("initial_cash") or 0)
        if fund <= 0: continue
        entries.append(_make_entry(
            date_iso=o.get("opened_at"),
            libelle=f"Fond de caisse initial · journée {o.get('date','')}",
            account_debit=OHADA["571_CAISSE"],
            account_credit=OHADA["581_CAISSE_TRANSIT"],
            amount=fund,
            source="ouverture_journee",
            ref_id=o.get("id", ""),
            author=o.get("opened_by") or "",
        ))

    # Tri chronologique
    entries.sort(key=lambda e: (e.get("date") or "", e.get("libelle") or ""))
    return entries


@router.get("/journal/ohada")
async def journal_ohada(
    start_date: str = Query(...),
    end_date: Optional[str] = Query(None),
    account: Optional[str] = Query(None, description="Filtrer par numéro de compte (ex: 571)"),
    search: Optional[str] = Query(None, description="Recherche libre dans libellé"),
):
    """Retourne le brouillard comptable OHADA pour la période, avec totaux par compte."""
    try:
        s = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        e_end_str = end_date or start_date
        e = datetime.strptime(e_end_str, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
    except ValueError:
        raise HTTPException(400, "Format de date invalide (YYYY-MM-DD)")

    entries = await _collect_entries(s.isoformat(), e.isoformat())

    # Filtre par compte
    if account:
        entries = [x for x in entries if x["debit_num"] == account or x["credit_num"] == account]

    # Filtre recherche
    if search:
        q = search.lower().strip()
        entries = [x for x in entries if q in (x.get("libelle") or "").lower()
                   or q in (x.get("author") or "").lower()
                   or q in (x.get("source") or "").lower()]

    # Totaux par compte
    totals_by_account: dict = {}
    for x in entries:
        for side, num, label in (("debit", x["debit_num"], x["debit_label"]),
                                 ("credit", x["credit_num"], x["credit_label"])):
            key = num
            totals_by_account.setdefault(key, {"num": num, "label": label, "debit": 0, "credit": 0})
            totals_by_account[key][side] += x["amount"]
    accounts = sorted(totals_by_account.values(), key=lambda a: a["num"])

    total_debit = sum(x["amount"] for x in entries)
    total_credit = total_debit  # par construction équilibré (partie double)

    return {
        "start_date": start_date,
        "end_date": e_end_str,
        "entries": entries,
        "total_debit": total_debit,
        "total_credit": total_credit,
        "balanced": True,
        "accounts": accounts,
        "ohada_plan": OHADA,
    }
