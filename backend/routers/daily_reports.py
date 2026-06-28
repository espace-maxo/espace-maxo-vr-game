"""
Daily Reports — Rapports de fin de journée transmis par cuisinier/coach à l'admin.

Workflow (3-A) :
  - 1 rapport unique par (date, kind, actor_name)
  - Auto-généré à partir des actions du jour (1-A : auto-summary + observations libres)
  - Transmission → status: submitted (édition bloquée)
  - Admin voit + comparaison automatique (2-C) : par item + total global

Endpoints :
  - GET   /api/daily-reports/draft               : récupère ou crée le brouillon du jour
  - POST  /api/daily-reports/{id}/observations   : MAJ observations (draft only)
  - POST  /api/daily-reports/{id}/submit         : transmet à l'admin
  - GET   /api/daily-reports                     : liste (admin)
  - GET   /api/daily-reports/{id}                : détail avec comparaison auto
"""
from datetime import datetime, timezone
from typing import Optional
import os
import uuid
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)
router = APIRouter(tags=["daily_reports"])

mongo_url = os.environ.get("MONGO_URL")
db_name = os.environ.get("DB_NAME")
db_client = AsyncIOMotorClient(mongo_url)
db = db_client[db_name]


# ─────────────────────────────────────────────────────────
# Auto-génération du résumé
# ─────────────────────────────────────────────────────────

CUISINE_DEPTS = {"plats", "cuisine", "grillades", "entrées", "desserts", "sauces", "riz", "féculents", "salle_jardin"}


def _is_plat(it: dict) -> bool:
    d = (it.get("department") or it.get("category") or "").lower()
    return d in CUISINE_DEPTS or d == "plat"


def _is_jeu(it: dict) -> bool:
    d = (it.get("department") or it.get("category") or "").lower()
    return d == "jeux"


async def _build_cuisine_summary(date_str: str, actor_name: str) -> dict:
    """Résumé auto du cuisinier : plats préparés (cuisine_events action=item_ready/all_ready) du jour."""
    start = f"{date_str}T00:00:00"
    end = f"{date_str}T23:59:59.999"
    # Plats préparés (item_ready)
    events = await db.cuisine_events.find(
        {"actor_name": actor_name, "created_at": {"$gte": start, "$lte": end}},
        {"_id": 0},
    ).to_list(2000)
    by_item = {}
    for e in events:
        if e.get("action") == "item_ready":
            n = (e.get("item_name") or "").strip()
            if not n:
                continue
            q = int(e.get("item_quantity") or 1)
            by_item[n] = by_item.get(n, 0) + q
    items = [{"name": n, "quantity": q} for n, q in sorted(by_item.items(), key=lambda x: -x[1])]
    scans = sum(1 for e in events if e.get("action") == "scan_bon")
    return {
        "items": items,
        "total_quantity": sum(it["quantity"] for it in items),
        "items_count": len(items),
        "scans_count": scans,
    }


async def _build_coach_summary(date_str: str, actor_name: str) -> dict:
    """Résumé auto du coach : bons transmis dans la journée + agrégation par jeu."""
    start = f"{date_str}T00:00:00"
    end = f"{date_str}T23:59:59.999"
    bons = await db.jeux_bons.find(
        {"coach_name": actor_name, "created_at": {"$gte": start, "$lte": end}},
        {"_id": 0},
    ).to_list(500)
    by_jeu = {}
    total_revenue = 0.0
    bons_pending = 0
    bons_attached = 0
    bons_invoiced = 0
    bons_rejected = 0
    for b in bons:
        status = b.get("status")
        if status == "pending":
            bons_pending += 1
        elif status == "attached":
            bons_attached += 1
        elif status == "invoiced":
            bons_invoiced += 1
        elif status == "rejected":
            bons_rejected += 1
        items = b.get("items") or []
        if not items and b.get("jeu_product_id"):
            items = [{"jeu_name": b.get("jeu_name"), "parties": b.get("parties", 0), "total": b.get("total", 0)}]
        # On exclut systématiquement les bons rejetés des agrégats par jeu et du
        # total revenu (sinon : la somme des lignes affichées ≠ total revenu)
        if status == "rejected":
            continue
        for it in items:
            name = (it.get("jeu_name") or "").strip()
            if not name:
                continue
            entry = by_jeu.setdefault(name, {"name": name, "quantity": 0, "total": 0.0})
            entry["quantity"] += int(it.get("parties") or 0)
            entry["total"] += float(it.get("total") or 0)
            total_revenue += float(it.get("total") or 0)
    items_list = [
        {"name": v["name"], "quantity": v["quantity"], "total": round(v["total"], 2)}
        for v in sorted(by_jeu.values(), key=lambda x: -x["quantity"])
    ]
    return {
        "items": items_list,
        "bons_total": len(bons),
        "bons_pending": bons_pending,
        "bons_attached": bons_attached,
        "bons_invoiced": bons_invoiced,
        "bons_rejected": bons_rejected,
        "total_quantity": sum(it["quantity"] for it in items_list),
        "total_revenue": round(total_revenue, 2),
    }


# ─────────────────────────────────────────────────────────
# Comparaison auto avec ventes système
# ─────────────────────────────────────────────────────────

def _norm(s: str) -> str:
    import unicodedata
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return " ".join(s.split())


async def _build_comparison(date_str: str, kind: str, declared_items: list) -> dict:
    """Compare les items déclarés avec les ventes système (factures validées du jour).
    Status par item : ok | over_declared (déclaré > système) | under_declared | missing_in_system | missing_in_declaration
    """
    invoices = await db.invoices.find(
        {"date": date_str, "validation_status": "validated"},
        {"_id": 0, "items": 1, "total": 1, "subtotal": 1, "discount": 1},
    ).to_list(2000)
    by_sys = {}
    for inv in invoices:
        for it in (inv.get("items") or []):
            if kind == "cuisine" and not _is_plat(it):
                continue
            if kind == "coach_jeux" and not _is_jeu(it):
                continue
            name = (it.get("name") or "").strip()
            if not name:
                continue
            key = _norm(name)
            entry = by_sys.setdefault(key, {"name": name, "quantity": 0, "total": 0.0})
            entry["quantity"] += int(it.get("quantity") or 1)
            entry["total"] += float(it.get("total") or (it.get("quantity") or 1) * float(it.get("price") or 0))

    # Index déclaré
    by_decl = {}
    for it in declared_items:
        key = _norm(it.get("name", ""))
        if not key:
            continue
        entry = by_decl.setdefault(key, {"name": it["name"], "quantity": 0, "total": 0.0})
        entry["quantity"] += int(it.get("quantity") or 0)
        entry["total"] += float(it.get("total") or 0)

    rows = []
    all_keys = set(by_decl.keys()) | set(by_sys.keys())
    alerts = 0
    for k in sorted(all_keys):
        d = by_decl.get(k)
        s = by_sys.get(k)
        if d and s:
            qty_d = d["quantity"]
            qty_s = s["quantity"]
            gap = qty_d - qty_s
            if qty_d == qty_s:
                status = "ok"
            elif qty_d > qty_s:
                status = "over_declared"
                alerts += 1
            else:
                status = "under_declared"
                alerts += 1
            rows.append({
                "name": d["name"] or s["name"],
                "qty_declared": qty_d,
                "qty_system": qty_s,
                "total_declared": round(d["total"], 2),
                "total_system": round(s["total"], 2),
                "gap": gap,
                "status": status,
            })
        elif d:
            rows.append({
                "name": d["name"],
                "qty_declared": d["quantity"],
                "qty_system": 0,
                "total_declared": round(d["total"], 2),
                "total_system": 0,
                "gap": d["quantity"],
                "status": "missing_in_system",
            })
            alerts += 1
        else:
            rows.append({
                "name": s["name"],
                "qty_declared": 0,
                "qty_system": s["quantity"],
                "total_declared": 0,
                "total_system": round(s["total"], 2),
                "gap": -s["quantity"],
                "status": "missing_in_declaration",
            })
            alerts += 1

    total_declared = round(sum(r["total_declared"] for r in rows), 2)
    total_system = round(sum(r["total_system"] for r in rows), 2)
    return {
        "rows": rows,
        "total_declared_qty": sum(r["qty_declared"] for r in rows),
        "total_system_qty": sum(r["qty_system"] for r in rows),
        "total_declared_revenue": total_declared,
        "total_system_revenue": total_system,
        "global_gap": round(total_declared - total_system, 2),
        "alerts_count": alerts,
    }


# ─────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────

class DraftQuery(BaseModel):
    kind: str  # cuisine | coach_jeux
    actor_name: str
    actor_role: str
    date: Optional[str] = None  # YYYY-MM-DD, défaut aujourd'hui


@router.post("/daily-reports/draft")
async def get_or_create_draft(body: DraftQuery):
    if body.kind not in ("cuisine", "coach_jeux"):
        raise HTTPException(400, "Kind invalide")
    if body.actor_role not in ("cuisinier", "coach_jeux", "admin"):
        raise HTTPException(403, "Action réservée")
    date_str = body.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    existing = await db.daily_reports.find_one(
        {"kind": body.kind, "actor_name": body.actor_name, "date": date_str},
        {"_id": 0},
    )
    if existing:
        # Rafraîchit l'auto-summary si encore en brouillon
        if existing.get("status") == "draft":
            summary = await (_build_cuisine_summary(date_str, body.actor_name) if body.kind == "cuisine" else _build_coach_summary(date_str, body.actor_name))
            await db.daily_reports.update_one(
                {"id": existing["id"]},
                {"$set": {"auto_summary": summary, "updated_at": datetime.now(timezone.utc).isoformat()}},
            )
            existing["auto_summary"] = summary
        return {"report": existing}

    summary = await (_build_cuisine_summary(date_str, body.actor_name) if body.kind == "cuisine" else _build_coach_summary(date_str, body.actor_name))
    now_iso = datetime.now(timezone.utc).isoformat()
    rep = {
        "id": str(uuid.uuid4()),
        "date": date_str,
        "kind": body.kind,
        "actor_name": body.actor_name,
        "actor_role": body.actor_role,
        "observations": "",
        "auto_summary": summary,
        "status": "draft",
        "submitted_at": None,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.daily_reports.insert_one(rep)
    rep.pop("_id", None)
    return {"report": rep}


class ObservationsBody(BaseModel):
    observations: str
    actor_name: str
    actor_role: str


@router.post("/daily-reports/{report_id}/observations")
async def update_observations(report_id: str, body: ObservationsBody):
    rep = await db.daily_reports.find_one({"id": report_id}, {"_id": 0})
    if not rep:
        raise HTTPException(404, "Rapport introuvable")
    if rep.get("status") != "draft":
        raise HTTPException(400, "Rapport déjà transmis (lecture seule)")
    if rep.get("actor_name") != body.actor_name and body.actor_role != "admin":
        raise HTTPException(403, "Action réservée à l'auteur")
    await db.daily_reports.update_one(
        {"id": report_id},
        {"$set": {"observations": body.observations or "", "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"success": True}


class SubmitBody(BaseModel):
    actor_name: str
    actor_role: str


@router.post("/daily-reports/{report_id}/submit")
async def submit_report(report_id: str, body: SubmitBody):
    rep = await db.daily_reports.find_one({"id": report_id}, {"_id": 0})
    if not rep:
        raise HTTPException(404, "Rapport introuvable")
    if rep.get("status") != "draft":
        raise HTTPException(400, "Déjà transmis")
    if rep.get("actor_name") != body.actor_name and body.actor_role != "admin":
        raise HTTPException(403, "Action réservée à l'auteur")
    # Rafraîchit auto_summary une dernière fois pour figer
    summary = await (_build_cuisine_summary(rep["date"], rep["actor_name"]) if rep["kind"] == "cuisine" else _build_coach_summary(rep["date"], rep["actor_name"]))
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.daily_reports.update_one(
        {"id": report_id},
        {"$set": {
            "auto_summary": summary,
            "status": "submitted",
            "submitted_at": now_iso,
            "updated_at": now_iso,
        }},
    )
    return {"success": True, "submitted_at": now_iso}


@router.get("/daily-reports")
async def list_reports(
    actor_role: str = "",
    actor_name: str = "",
    kind: Optional[str] = None,
    date: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
):
    """Liste les rapports.
    - admin : tout
    - cuisinier/coach_jeux : uniquement les siens
    """
    if actor_role not in ("admin", "cuisinier", "coach_jeux"):
        raise HTTPException(403, "Action réservée")
    q = {}
    if actor_role != "admin":
        q["actor_name"] = actor_name or ""
    if kind:
        q["kind"] = kind
    if date:
        q["date"] = date
    if status:
        q["status"] = status
    reports = await db.daily_reports.find(q, {"_id": 0}).sort("submitted_at", -1).to_list(limit)
    # Toujours afficher submitted avant draft
    reports.sort(key=lambda r: (r.get("status") != "submitted", -(int((r.get("submitted_at") or r.get("created_at") or "").replace("-", "").replace(":", "").replace("T", "").replace(".", "")[:14] or "0"))))
    submitted_count = sum(1 for r in reports if r.get("status") == "submitted")
    return {"total": len(reports), "submitted": submitted_count, "reports": reports}


@router.get("/daily-reports/{report_id}")
async def get_report_with_comparison(report_id: str, actor_role: str = ""):
    """Détail d'un rapport avec comparaison automatique aux ventes système."""
    if actor_role not in ("admin", "cuisinier", "coach_jeux"):
        raise HTTPException(403, "Action réservée")
    rep = await db.daily_reports.find_one({"id": report_id}, {"_id": 0})
    if not rep:
        raise HTTPException(404, "Rapport introuvable")
    declared = (rep.get("auto_summary") or {}).get("items") or []
    comparison = await _build_comparison(rep["date"], rep["kind"], declared)
    return {"report": rep, "comparison": comparison}


@router.delete("/daily-reports/{report_id}")
async def delete_report(report_id: str, actor_role: str = ""):
    """Admin uniquement : suppression d'un rapport (transmis ou brouillon)."""
    if actor_role != "admin":
        raise HTTPException(403, "Action réservée à l'admin")
    existing = await db.daily_reports.find_one({"id": report_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Rapport introuvable")
    await db.daily_reports.delete_one({"id": report_id})
    return {"success": True}
