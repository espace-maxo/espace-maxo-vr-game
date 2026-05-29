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

async def _check_stats_vs_point_caisse(start_iso, end_iso, findings):
    """Écart entre 'Statistiques & Rapport' (toutes factures) et Point de la Caisse (validées).
    Si présent : signale les factures pending qui gonflent les Statistiques mais ne sont pas
    encaissées."""
    all_invoices = await db.invoices.find({
        "created_at": {"$gte": start_iso, "$lt": end_iso},
        "validation_status": {"$nin": ["cancelled", "deleted"]},
    }, {"_id": 0}).to_list(20000)
    pending_invoices = [i for i in all_invoices if i.get("validation_status") == "pending"]
    if not pending_invoices:
        return
    total_pending = sum(_amt(i, "total") for i in pending_invoices)
    total_validated = sum(_amt(i, "total") for i in all_invoices if i.get("validation_status") == "validated")
    if total_pending > 0:
        findings.append({
            "code": "ECART_STATS_POINT_CAISSE",
            "severity": SEV_CRITICAL if total_pending > 5000 else SEV_WARNING,
            "title": "Écart entre Statistiques & Rapport et Point de la Caisse",
            "detail": (
                f"Statistiques (toutes factures non annulées) : {total_validated + total_pending:.0f} F · "
                f"Point de la Caisse (factures validées seulement) : {total_validated:.0f} F · "
                f"Écart : {total_pending:.0f} F dû à {len(pending_invoices)} facture(s) en attente"
            ),
            "amount": total_pending,
            "actions": [
                "Aller dans BONS pour valider ou annuler chaque facture en attente",
                "Les factures pending sont les bons jamais transformés en facture client (pas d'impression)",
            ],
            "items": [
                {"id": p.get("id"), "label": f"Table {p.get('table_number','?')} · {_amt(p,'total'):.0f} F · créée le {(p.get('created_at') or '')[:10]}", "by": p.get("created_by")}
                for p in pending_invoices[:50]
            ],
        })


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
    """d) Toutes les annulations/suppressions de factures et bons sur la période.
    Affiche le détail complet de chaque facture concernée."""
    logs = await db.audit_logs.find({
        "created_at": {"$gte": start_iso, "$lt": end_iso},
        "action": {"$in": ["cancel", "delete"]},
    }, {"_id": 0}).sort("created_at", -1).to_list(2000)
    if not logs:
        return
    action_label = {"cancel": "Annulation", "delete": "Suppression"}
    total = sum(_amt(l.get("snapshot") or {}, "total") for l in logs)
    details = []
    for l in logs:
        snap = l.get("snapshot") or {}
        items = snap.get("items") or []
        items_summary = [
            {
                "name": it.get("name") or it.get("product_name") or "?",
                "quantity": it.get("quantity") or 1,
                "price": _amt(it, "price"),
                "total": _amt(it, "price") * float(it.get("quantity") or 1),
                "department": it.get("department") or it.get("category") or "",
            }
            for it in items[:50]
        ]
        details.append({
            "id": l.get("entity_id"),
            "entity_type": l.get("entity_type"),
            "action": l.get("action"),
            "action_label": action_label.get(l.get("action"), l.get("action")),
            "actor_name": l.get("actor_name") or "—",
            "actor_role": l.get("actor_role") or "—",
            "action_at": l.get("created_at"),
            "action_at_fmt": format_when(l.get("created_at")),
            "invoice_number": snap.get("invoice_number") or l.get("invoice_number"),
            "table_number": snap.get("table_number") or l.get("table_number"),
            "server_name": snap.get("server_name"),
            "client_name": snap.get("client_name"),
            "payment_method": snap.get("payment_method") or "—",
            "validation_status": snap.get("validation_status"),
            "subtotal": snap.get("subtotal"),
            "discount": snap.get("discount"),
            "discount_amount": snap.get("discount_amount"),
            "total": snap.get("total"),
            "items_count": snap.get("items_count") or len(items),
            "items": items_summary,
            "totals_by_department": snap.get("totals_by_department"),
            "created_at": snap.get("created_at"),
            "validated_at": snap.get("validated_at"),
        })
    # Compute role split (informational)
    by_role = {}
    for d in details:
        role = d.get("actor_role") or "—"
        by_role[role] = by_role.get(role, 0) + 1
    findings.append({
        "code": "FACTURES_SUPPRIMEES_OU_ANNULEES",
        "severity": SEV_CRITICAL,
        "title": f"{len(details)} facture(s) / bon(s) supprimé(s) ou annulé(s)",
        "detail": (
            f"Total cumulé : {total:.0f} F · "
            + " · ".join(f"{r}: {n}" for r, n in by_role.items())
        ),
        "amount": total,
        "actions": [
            "Examinez chaque ligne ci-dessous pour vérifier la justification",
            "Si une suppression vous paraît anormale, contactez l'auteur",
        ],
        # Backward-compat: keep `items` simple list for older UI
        "items": [
            {
                "id": d["id"],
                "label": (
                    f"{d['action_label']} · "
                    f"{('Facture ' + (d['invoice_number'] or d['id'] or '?')[:10]) if d['entity_type'] == 'invoice' else 'Bon Table ' + str(d['table_number'] or '?')}"
                    f" · {_amt(d, 'total'):.0f} F · {d['action_at_fmt']}"
                ),
                "by": d["actor_name"],
            }
            for d in details[:50]
        ],
        # NEW: full details for rich UI rendering
        "details": details[:200],
    })


async def _check_price_changes_validated(start_iso, end_iso, findings):
    """e) Modifications d'articles ou de prix sur les factures (avant ou après validation).
    Affiche le détail complet : auteur, date, items, total avant/après, mode de paiement."""
    logs = await db.audit_logs.find({
        "created_at": {"$gte": start_iso, "$lt": end_iso},
        "action": "update",
        "entity_type": "invoice",
    }, {"_id": 0}).sort("created_at", -1).to_list(5000)
    suspects = []
    for l in logs:
        diff = (l.get("changes") or {})
        # On capte toute modification touchant les items / total / subtotal / discount
        if any(k in diff for k in ("total", "items", "subtotal", "discount", "discount_amount")):
            suspects.append(l)
    if not suspects:
        return
    details = []
    for l in suspects:
        snap = l.get("snapshot") or {}
        diff = l.get("changes") or {}
        items = snap.get("items") or []
        items_summary = [
            {
                "name": it.get("name") or it.get("product_name") or "?",
                "quantity": it.get("quantity") or 1,
                "price": _amt(it, "price"),
                "total": _amt(it, "price") * float(it.get("quantity") or 1),
                "department": it.get("department") or it.get("category") or "",
            }
            for it in items[:50]
        ]
        # Total change (before/after)
        total_change = diff.get("total") if isinstance(diff.get("total"), dict) else None
        items_change = diff.get("items") if isinstance(diff.get("items"), dict) else None
        details.append({
            "id": l.get("entity_id"),
            "entity_type": l.get("entity_type"),
            "action": "update",
            "action_label": "Modification",
            "actor_name": l.get("actor_name") or "—",
            "actor_role": l.get("actor_role") or "—",
            "action_at": l.get("created_at"),
            "action_at_fmt": format_when(l.get("created_at")),
            "invoice_number": snap.get("invoice_number") or l.get("invoice_number"),
            "table_number": snap.get("table_number") or l.get("table_number"),
            "server_name": snap.get("server_name"),
            "client_name": snap.get("client_name"),
            "payment_method": snap.get("payment_method") or "—",
            "validation_status": snap.get("validation_status"),
            "validation_status_when_modified": snap.get("validation_status"),
            "was_validated": snap.get("validation_status") == "validated",
            "subtotal": snap.get("subtotal"),
            "discount": snap.get("discount"),
            "discount_amount": snap.get("discount_amount"),
            "total": snap.get("total"),
            "items_count": snap.get("items_count") or len(items),
            "items": items_summary,
            "totals_by_department": snap.get("totals_by_department"),
            "created_at": snap.get("created_at"),
            "validated_at": snap.get("validated_at"),
            "changes": diff,
            "total_before": (total_change or {}).get("from"),
            "total_after": (total_change or {}).get("to"),
            "items_before": (items_change or {}).get("from"),
            "items_after": (items_change or {}).get("to"),
        })
    n_validated = sum(1 for d in details if d["was_validated"])
    severity = SEV_CRITICAL if n_validated > 0 else SEV_WARNING
    findings.append({
        "code": "FACTURES_MODIFIEES",
        "severity": severity,
        "title": (
            f"{len(details)} facture(s) modifiée(s)"
            + (f" — dont {n_validated} DÉJÀ validée(s) ⚠️" if n_validated else "")
        ),
        "detail": (
            "Modifications d'articles, de prix, de remise ou de total détectées. "
            + ("Des factures déjà validées ont été altérées : à vérifier en priorité." if n_validated else
               "Toutes les modifications concernent des factures non encore validées.")
        ),
        "amount": 0,
        "actions": [
            "Examinez chaque modification : avant / après, articles ajoutés ou retirés",
            "Si la facture était déjà validée, identifier l'auteur et le motif",
        ],
        "items": [
            {
                "id": d["id"],
                "label": (
                    f"{d['action_label']} · Facture {('#' + d['invoice_number']) if d.get('invoice_number') else (d['id'] or '?')[:10]}"
                    f" · {_amt(d, 'total'):.0f} F · {d['action_at_fmt']}"
                    + (" · ⚠️ déjà validée" if d["was_validated"] else "")
                ),
                "by": d["actor_name"],
            }
            for d in details[:50]
        ],
        "details": details[:200],
    })


async def _check_articles_added_after_validation(start_iso, end_iso, findings):
    """f) Articles ajoutés/retirés d'une commande après envoi en cuisine."""
    logs = await db.audit_logs.find({
        "created_at": {"$gte": start_iso, "$lt": end_iso},
        "action": "update",
        "entity_type": "order",
    }, {"_id": 0}).to_list(5000)
    suspects = []
    for l in logs:
        diff = (l.get("changes") or {})
        snap = (l.get("snapshot") or {})
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
            "items": [{"id": l.get("entity_id"), "label": f"{l.get('actor_name') or '—'} · {format_when(l.get('created_at'))}", "by": l.get("actor_name")} for l in suspects[:50]],
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


async def _check_regularizations(start_iso, end_iso, findings):
    """m) Bons régularisés sur la période — alerte si > 3 par jour cible."""
    regs = await db.invoices.find({
        "is_regularized": True,
        "regularized_at": {"$gte": start_iso, "$lt": end_iso},
    }, {"_id": 0}).to_list(2000)
    if not regs:
        return
    # Group par regularization_target_date pour détecter excès
    by_day = {}
    for r in regs:
        d = r.get("regularization_target_date") or (r.get("created_at") or "")[:10]
        by_day.setdefault(d, []).append(r)
    suspect_days = {d: items for d, items in by_day.items() if len(items) > 3}
    total_amount = sum(_amt(r, "total") for r in regs)
    severity = SEV_CRITICAL if suspect_days else SEV_WARNING
    details = [
        {
            "id": r.get("id"),
            "entity_type": "invoice",
            "action": "regularize",
            "action_label": "Régularisation",
            "actor_name": r.get("regularized_by") or "—",
            "actor_role": r.get("regularized_by_role") or "—",
            "action_at": r.get("regularized_at"),
            "action_at_fmt": format_when(r.get("regularized_at")),
            "invoice_number": r.get("invoice_number"),
            "table_number": r.get("table_number"),
            "regularization_target_date": r.get("regularization_target_date"),
            "regularization_ca_date": r.get("regularization_ca_date"),
            "regularization_reason": r.get("regularization_reason"),
            "regularization_post_closure": r.get("regularization_post_closure"),
            "payment_method": r.get("payment_method"),
            "validation_status": r.get("validation_status"),
            "total": r.get("total"),
            "subtotal": r.get("subtotal"),
            "items": (r.get("items") or [])[:50],
            "items_count": len(r.get("items") or []),
            "totals_by_department": r.get("totals_by_department"),
        }
        for r in regs
    ]
    msg_parts = [f"{len(regs)} régularisation(s) · Total {total_amount:.0f} F"]
    if suspect_days:
        days_str = ", ".join(f"{d} ({len(it)})" for d, it in suspect_days.items())
        msg_parts.append(f"⚠️ Jours avec > 3 régularisations : {days_str}")
    findings.append({
        "code": "REGULARISATIONS",
        "severity": severity,
        "title": f"{len(regs)} bon(s) régularisé(s) sur la période",
        "detail": " · ".join(msg_parts),
        "amount": total_amount,
        "actions": [
            "Vérifier que chaque régularisation correspond à une vente réelle (preuve/justificatif)",
            "Si un jour donné a plus de 3 régularisations, demander des précisions",
        ],
        "items": [
            {"id": d["id"], "label": (
                f"{d['action_label']} · Facture {d.get('invoice_number','?')} · "
                f"date cible {d.get('regularization_target_date','?')} · "
                f"{_amt(d,'total'):.0f} F"
            ), "by": d["actor_name"]}
            for d in details[:50]
        ],
        "details": details[:200],
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
        _check_stats_vs_point_caisse,
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
        _check_regularizations,
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
