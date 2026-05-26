"""
Audit Engine — Auditeur intelligent qui recherche les incohérences dans les ventes
sur une période donnée.

Endpoint principal : POST /api/audit/run  {start_date, end_date}
Retourne un rapport structuré avec :
  - findings[]   : liste des incohérences (severity, code, title, detail, amount, actions)
  - summary      : totaux et indicateurs de la période
  - score        : note /100 (heuristique simple : 100 - 5*critical - 2*warning)

Toutes les vérifications sont READ-ONLY (aucune mutation de données).
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, List
import os

from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient

router = APIRouter(tags=["audit"])

mongo_url = os.environ.get("MONGO_URL")
db_name = os.environ.get("DB_NAME")
db_client = AsyncIOMotorClient(mongo_url)
db = db_client[db_name]


# ───────────────────────── Helpers ─────────────────────────

SEV_CRITICAL = "critical"
SEV_WARNING = "warning"
SEV_INFO = "info"

def _iso_range(start_date: str, end_date: str):
    """Convertit (YYYY-MM-DD, YYYY-MM-DD) en (start_iso, end_iso) inclusifs."""
    s = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    e = datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
    return s.isoformat(), e.isoformat()


def _date_strs(start_date: str, end_date: str) -> List[str]:
    s = datetime.strptime(start_date, "%Y-%m-%d").date()
    e = datetime.strptime(end_date, "%Y-%m-%d").date()
    out, cur = [], s
    while cur <= e:
        out.append(cur.strftime("%Y-%m-%d"))
        cur += timedelta(days=1)
    return out


def _amt(d: dict, *keys) -> float:
    for k in keys:
        v = d.get(k)
        if v is not None:
            try: return float(v)
            except: pass
    return 0.0


# ───────────────────────── Checkers ─────────────────────────

async def _check_invoice_billettage_diff(start_iso, end_iso, findings):
    """a) Écart entre total des factures validées et total billettage signé (cash_closures)."""
    invoices = await db.invoices.find({
        "validation_status": "validated",
        "validated_at": {"$gte": start_iso, "$lt": end_iso},
    }, {"_id": 0}).to_list(20000)
    closures = await db.cash_closures.find({
        "closed_at": {"$gte": start_iso, "$lt": end_iso},
    }, {"_id": 0}).to_list(2000)

    total_inv = sum(_amt(i, "total") for i in invoices)
    total_bil = sum(_amt(c, "billettage_total", "counted_cash", "total_counted") for c in closures)
    if total_bil > 0 and abs(total_inv - total_bil) > 1.0:
        gap = total_inv - total_bil
        findings.append({
            "code": "ECART_FACTURES_BILLETTAGE",
            "severity": SEV_CRITICAL if abs(gap) > 5000 else SEV_WARNING,
            "title": "Écart entre les factures validées et le billettage signé",
            "detail": f"Total des factures : {total_inv:.0f} F · Total compté au billettage : {total_bil:.0f} F · Écart : {gap:+.0f} F",
            "amount": abs(gap),
            "actions": ["Comparer chaque facture validée avec son billettage",
                        "Vérifier la répartition des modes de paiement (espèces / mobile / chèque)"],
        })


async def _check_invoice_vs_reversements(start_iso, end_iso, findings):
    """b) Écart entre total factures et total des reversements (financial_points)."""
    invoices = await db.invoices.find({
        "validation_status": "validated",
        "validated_at": {"$gte": start_iso, "$lt": end_iso},
    }, {"_id": 0}).to_list(20000)
    points = await db.financial_points.find({
        "created_at": {"$gte": start_iso, "$lt": end_iso},
    }, {"_id": 0}).to_list(2000)
    total_inv = sum(_amt(i, "total") for i in invoices)
    total_rev = sum(_amt(p, "amount", "total_recorded", "recorded_total") for p in points)
    if total_inv == 0 and total_rev == 0:
        return
    gap = total_inv - total_rev
    if total_inv > 0 and abs(gap) > 1.0:
        findings.append({
            "code": "ECART_FACTURES_REVERSEMENT",
            "severity": SEV_CRITICAL if abs(gap) > 10000 else SEV_WARNING,
            "title": "Écart entre les factures et les reversements (Bar / Menu / Jeux / Locations)",
            "detail": f"Total des factures : {total_inv:.0f} F · Total reversé : {total_rev:.0f} F · Écart : {gap:+.0f} F",
            "amount": abs(gap),
            "actions": ["Vérifier que chaque catégorie a bien été reversée",
                        "Comparer les ventilations par département avec les reversements par catégorie"],
        })


async def _check_pending_invoices(start_iso, end_iso, findings):
    """c) Factures encore en pending sur la période."""
    pending = await db.invoices.find({
        "validation_status": "pending",
        "created_at": {"$gte": start_iso, "$lt": end_iso},
    }, {"_id": 0, "id": 1, "total": 1, "table_number": 1, "created_at": 1, "created_by": 1}).to_list(5000)
    if pending:
        total = sum(_amt(p, "total") for p in pending)
        findings.append({
            "code": "FACTURES_EN_ATTENTE",
            "severity": SEV_WARNING,
            "title": f"{len(pending)} facture(s) encore en attente de validation",
            "detail": f"Total cumulé non encaissé : {total:.0f} F",
            "amount": total,
            "actions": ["Aller dans le menu BONS pour les valider ou les annuler",
                        "Si elles datent de plusieurs jours, demander à la Resp. Op."],
            "items": [{"id": p["id"], "label": f"Table {p.get('table_number','?')} · {_amt(p,'total'):.0f} F", "by": p.get("created_by")} for p in pending[:50]],
        })


async def _check_cancellations_deletions(start_iso, end_iso, findings):
    """d) Annulations/suppressions de factures ou bons effectuées par la Gérante."""
    logs = await db.audit_logs.find({
        "created_at": {"$gte": start_iso, "$lt": end_iso},
        "action": {"$in": ["cancel", "delete"]},
    }, {"_id": 0}).to_list(2000)
    if not logs:
        return
    gerante_logs = [l for l in logs if (l.get("author_role") == "manager") or ("gérante" in (l.get("author") or "").lower())]
    if gerante_logs:
        total = sum(_amt(l.get("entity_snapshot") or {}, "total") for l in gerante_logs)
        action_label = {"cancel": "Annulation", "delete": "Suppression"}
        findings.append({
            "code": "ANNULATIONS_PAR_GERANTE",
            "severity": SEV_CRITICAL,
            "title": f"{len(gerante_logs)} annulation(s) ou suppression(s) par la Resp. Op.",
            "detail": f"Total des factures / bons concernés : {total:.0f} F",
            "amount": total,
            "actions": ["Examiner chaque action dans le journal d'audit pour vérifier la justification",
                        "Si suspect, vérifier avec la Resp. Op. les raisons précises"],
            "items": [{"id": l.get("entity_id"), "label": f"{action_label.get(l.get('action'), l.get('action'))} · {l.get('author')}", "by": l.get("author")} for l in gerante_logs[:50]],
        })


async def _check_price_changes_validated(start_iso, end_iso, findings):
    """e) Modifications de prix sur factures DÉJÀ VALIDÉES."""
    logs = await db.audit_logs.find({
        "created_at": {"$gte": start_iso, "$lt": end_iso},
        "action": "update",
        "entity_type": "invoice",
    }, {"_id": 0}).to_list(5000)
    suspects = []
    for l in logs:
        diff = (l.get("changes") or {})
        snap = (l.get("entity_snapshot") or {})
        if snap.get("validation_status") == "validated" and ("total" in diff or "items" in diff or "subtotal" in diff):
            suspects.append(l)
    if suspects:
        findings.append({
            "code": "PRIX_MODIFIE_FACTURE_VALIDEE",
            "severity": SEV_CRITICAL,
            "title": f"{len(suspects)} modification(s) de prix sur des factures DÉJÀ validées",
            "detail": "Une fois validée, une facture ne devrait plus changer de montant ou d'articles.",
            "amount": 0,
            "actions": ["Identifier l'auteur et le motif de la modification",
                        "Vérifier s'il s'agit d'une fraude potentielle"],
            "items": [{"id": l.get("entity_id"), "label": f"{l.get('author')} · {format_when(l.get('created_at'))}", "by": l.get("author")} for l in suspects[:50]],
        })


async def _check_articles_added_after_validation(start_iso, end_iso, findings):
    """f) Articles ajoutés/retirés d'une commande après validation."""
    logs = await db.audit_logs.find({
        "created_at": {"$gte": start_iso, "$lt": end_iso},
        "action": "update",
        "entity_type": "order",
    }, {"_id": 0}).to_list(5000)
    suspects = []
    for l in logs:
        diff = (l.get("changes") or {})
        snap = (l.get("entity_snapshot") or {})
        if snap.get("status") in ("validated", "sent", "completed") and "items" in diff:
            suspects.append(l)
    if suspects:
        findings.append({
            "code": "ARTICLES_MODIFIES_APRES_ENVOI",
            "severity": SEV_WARNING,
            "title": f"{len(suspects)} commande(s) modifiée(s) après envoi en cuisine",
            "detail": "Des articles ont été ajoutés ou retirés alors que la commande avait déjà été envoyée.",
            "amount": 0,
            "actions": ["Vérifier si ces modifications sont justifiées (oubli, retour client, etc.)"],
            "items": [{"id": l.get("entity_id"), "label": f"{l.get('author')}", "by": l.get("author")} for l in suspects[:50]],
        })


async def _check_tables_closed_without_invoice(start_iso, end_iso, findings):
    """h) Tables fermées sans facture générée."""
    invoices = await db.invoices.find({
        "created_at": {"$gte": start_iso, "$lt": end_iso},
    }, {"_id": 0, "table_number": 1, "id": 1}).to_list(20000)
    tables_with_invoice = {str(i.get("table_number")) for i in invoices if i.get("table_number") is not None}

    # Fallback : si pas d'audit "close table", on utilise les tables "closed" actuellement
    tables = await db.tables.find({"status": "closed"}, {"_id": 0}).to_list(500)
    suspect_tables = []
    for t in tables:
        if str(t.get("number")) not in tables_with_invoice:
            # On compte uniquement si la table a été clôturée sur la période
            closed_at = t.get("closed_at") or t.get("updated_at") or ""
            if start_iso <= closed_at < end_iso:
                suspect_tables.append(t)
    if suspect_tables:
        findings.append({
            "code": "TABLES_FERMEES_SANS_FACTURE",
            "severity": SEV_WARNING,
            "title": f"{len(suspect_tables)} table(s) fermée(s) sans facture générée",
            "detail": "Une table fermée devrait normalement avoir produit au moins une facture.",
            "amount": 0,
            "actions": ["Vérifier si ces tables ont été des essais (consultations sans facturation) ou des oublis"],
            "items": [{"id": t.get("id"), "label": f"Table {t.get('number')}", "by": t.get("closed_by", "")} for t in suspect_tables[:50]],
        })


async def _check_direct_reversement_with_servers_present(start_iso, end_iso, findings):
    """j) Reversement direct (Sans serveur) effectué alors qu'il y avait des serveurs actifs."""
    direct_revs = await db.financial_points.find({
        "created_at": {"$gte": start_iso, "$lt": end_iso},
        "direct_gerante": True,
    }, {"_id": 0}).to_list(500)
    if not direct_revs:
        return
    suspects = []
    for r in direct_revs:
        d = (r.get("date") or "")[:10]
        if not d: continue
        day_s = datetime.strptime(d, "%Y-%m-%d").replace(tzinfo=timezone.utc).isoformat()
        day_e = (datetime.strptime(d, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)).isoformat()
        invoices = await db.invoices.find({
            "validation_status": "validated",
            "validated_at": {"$gte": day_s, "$lt": day_e},
        }, {"_id": 0, "created_by": 1}).to_list(5000)
        creators = list({(i.get("created_by") or "").strip() for i in invoices if i.get("created_by")})
        users = await db.users.find({"full_name": {"$in": creators}}, {"_id": 0, "full_name": 1, "role": 1}).to_list(200)
        role_map = {u.get("full_name", ""): u.get("role") for u in users}
        servers = [c for c in creators if role_map.get(c) not in ("admin", "manager")]
        if servers:
            suspects.append({**r, "servers_found": servers})
    if suspects:
        total = sum(_amt(s, "amount") for s in suspects)
        findings.append({
            "code": "REVERSEMENT_DIRECT_AVEC_SERVEURS",
            "severity": SEV_CRITICAL,
            "title": f"{len(suspects)} reversement(s) « direct(s) » alors que des serveurs ont vendu",
            "detail": f"Total : {total:.0f} F. La Resp. Op. a fait un reversement « Sans serveur » alors qu'il y avait bien des serveurs actifs.",
            "amount": total,
            "actions": ["Examiner les serveurs ayant fait des ventes ce jour-là",
                        "Demander pourquoi le reversement direct a été choisi à la place"],
            "items": [{"id": s.get("id"), "label": f"{s.get('category')} · serveur(s) ignoré(s) : {', '.join(s.get('servers_found') or [])}", "by": s.get("created_by")} for s in suspects[:50]],
        })


async def _check_day_closed_too_early(start_iso, end_iso, findings):
    """k) Journée fermée trop tôt (avant 18h heure locale Bénin = UTC+1)."""
    closures = await db.day_closures.find({
        "closed_at": {"$gte": start_iso, "$lt": end_iso},
    }, {"_id": 0}).to_list(500)
    suspects = []
    for c in closures:
        try:
            t = datetime.fromisoformat(c["closed_at"].replace("Z", "+00:00"))
            local_hour = (t.hour + 1) % 24  # UTC+1
            if local_hour < 18:
                suspects.append({**c, "_local_hour": local_hour})
        except Exception:
            pass
    if suspects:
        findings.append({
            "code": "JOURNEE_FERMEE_TROP_TOT",
            "severity": SEV_WARNING,
            "title": f"{len(suspects)} fermeture(s) de journée avant 18h",
            "detail": "Une journée normale se ferme après le service du soir.",
            "amount": 0,
            "actions": ["Vérifier si la fermeture anticipée est justifiée (jour férié, panne technique, etc.)"],
            "items": [{"id": s.get("id"), "label": f"Fermée à {s.get('_local_hour')}h (heure locale) par {s.get('closed_by')}", "by": s.get("closed_by")} for s in suspects[:50]],
        })


async def _check_multiple_day_openings(start_iso, end_iso, findings):
    """l) Plusieurs ouvertures/fermetures de journée le même jour."""
    dates = _date_strs(start_iso[:10], (datetime.fromisoformat(end_iso.replace("Z","+00:00"))-timedelta(days=1)).strftime("%Y-%m-%d"))
    suspects = []
    for d in dates:
        openings = await db.day_openings.find({"date": d}, {"_id": 0}).to_list(50)
        closures = await db.day_closures.find({"date": d}, {"_id": 0}).to_list(50)
        if len(openings) > 1:
            suspects.append({"date": d, "kind": "ouvertures", "count": len(openings)})
        if len(closures) > 1:
            suspects.append({"date": d, "kind": "fermetures", "count": len(closures)})
    if suspects:
        findings.append({
            "code": "OUVERTURES_FERMETURES_MULTIPLES",
            "severity": SEV_WARNING,
            "title": "Plusieurs ouvertures / fermetures de journée sur une même date",
            "detail": f"{len(suspects)} occurrence(s) de double action.",
            "amount": 0,
            "actions": ["Demander la raison à la Resp. Op."],
            "items": [{"id": s["date"], "label": f"{s['date']} — {s['count']} {s['kind']}", "by": ""} for s in suspects],
        })


def format_when(s):
    if not s: return ""
    try:
        d = datetime.fromisoformat(s.replace("Z","+00:00"))
        return d.strftime("%d/%m %H:%M")
    except Exception:
        return s


# ───────────────────────── Main endpoint ─────────────────────────

class AuditRequest(BaseModel):
    start_date: str
    end_date: Optional[str] = None


@router.post("/audit/run")
async def run_audit(payload: AuditRequest):
    """Lance l'auditeur sur la période fournie et retourne un rapport structuré."""
    sd = payload.start_date
    ed = payload.end_date or sd
    try:
        start_iso, end_iso = _iso_range(sd, ed)
    except ValueError:
        raise HTTPException(400, "Format de date invalide (attendu YYYY-MM-DD)")

    findings: List[dict] = []

    # Exécute toutes les vérifications (séquentiel mais rapide car les collections
    # sont petites et indexées).
    checks = [
        _check_invoice_billettage_diff,
        _check_invoice_vs_reversements,
        _check_pending_invoices,
        _check_cancellations_deletions,
        _check_price_changes_validated,
        _check_articles_added_after_validation,
        _check_tables_closed_without_invoice,
        _check_direct_reversement_with_servers_present,
        _check_day_closed_too_early,
        _check_multiple_day_openings,
    ]
    for check in checks:
        try:
            await check(start_iso, end_iso, findings)
        except Exception as e:
            findings.append({
                "code": "ERREUR_DE_CONTROLE",
                "severity": SEV_INFO,
                "title": f"Erreur lors de la vérification ({check.__name__})",
                "detail": str(e),
                "amount": 0,
                "actions": [],
            })

    # Summary
    invoices = await db.invoices.find(
        {"validation_status": "validated", "validated_at": {"$gte": start_iso, "$lt": end_iso}},
        {"_id": 0, "total": 1}
    ).to_list(20000)
    pending = await db.invoices.count_documents(
        {"validation_status": "pending", "created_at": {"$gte": start_iso, "$lt": end_iso}}
    )
    summary = {
        "invoices_validated": len(invoices),
        "invoices_pending": pending,
        "ca_validated": sum(_amt(i, "total") for i in invoices),
    }

    # Score sur 100 : 100 - 5 par critical - 2 par warning (plancher 0)
    n_crit = sum(1 for f in findings if f["severity"] == SEV_CRITICAL)
    n_warn = sum(1 for f in findings if f["severity"] == SEV_WARNING)
    score = max(0, 100 - 5 * n_crit - 2 * n_warn)

    return {
        "start_date": sd,
        "end_date": ed,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "score": score,
        "summary": summary,
        "findings": findings,
        "counts": {
            "critical": n_crit,
            "warning": n_warn,
            "info": sum(1 for f in findings if f["severity"] == SEV_INFO),
            "total": len(findings),
        },
    }
