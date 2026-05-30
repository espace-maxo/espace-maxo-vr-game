"""
Recoupement (Reconciliation) — Comparer le point manuscrit de la cuisine/jeux
avec les ventes enregistrées dans le système.

Workflow :
  1. Resp. Op. prend en photo le cahier du cuisinier / le compteur des jeux
  2. POST /api/recoupement/extract-cuisine    : OCR via Gemini Vision → liste {name, quantity}
     POST /api/recoupement/extract-jeux       : idem pour les compteurs de parties
  3. Côté UI, l'humain corrige les erreurs OCR
  4. POST /api/recoupement/compare-cuisine    : compare la liste corrigée vs ventes système
     POST /api/recoupement/compare-jeux       : idem pour les jeux
  5. Le résultat de la comparaison est enregistré dans `recoupements` (collection)
     + entrée audit_logs si écart > seuil

Seuils :
  - Écart par plat > 1 unité OU > 10% → ligne en alerte
  - Écart CA total cuisine > 5% → finding audit critical
"""
from datetime import datetime, timezone, timedelta
from typing import List, Optional
import os
import uuid
import base64
import logging
import json
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

logger = logging.getLogger(__name__)
router = APIRouter(tags=["recoupement"])

mongo_url = os.environ.get("MONGO_URL")
db_name = os.environ.get("DB_NAME")
db_client = AsyncIOMotorClient(mongo_url)
db = db_client[db_name]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

# Department mappings used in the system
CUISINE_DEPTS = {"cuisine", "salle_jardin", "plats", "Plats", "Grillades", "Entrées", "Desserts"}
JEUX_DEPTS = {"jeux", "Jeux VR", "Jeux", "location"}

DIFF_THRESHOLD_QTY = 1     # 1 unit
DIFF_THRESHOLD_PCT = 0.10  # 10%
TOTAL_DIFF_PCT = 0.05      # 5% CA total


# ─────────────── Models ───────────────

class ExtractBody(BaseModel):
    image_base64: str
    mime_type: Optional[str] = "image/jpeg"
    actor_name: str
    actor_role: str


class CompareItem(BaseModel):
    name: str
    quantity: float
    price: Optional[float] = None  # facultatif si l'OCR/admin l'a renseigné


class CompareBody(BaseModel):
    date: str  # YYYY-MM-DD
    declared: List[CompareItem]  # liste corrigée par l'humain
    notes: Optional[str] = ""
    actor_name: str
    actor_role: str


# ─────────────── Helpers ───────────────

def _norm(s: str) -> str:
    """Normalisation pour matcher 'Poulet Frit' ≈ 'Poulet Frit/Grillé'."""
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def _fuzzy_match(name: str, candidates: List[dict]) -> Optional[dict]:
    """Trouve un produit dont le nom contient ou est contenu dans `name`."""
    n = _norm(name)
    if not n:
        return None
    # exact normalized
    for c in candidates:
        if _norm(c.get("name", "")) == n:
            return c
    # contains
    for c in candidates:
        cn = _norm(c.get("name", ""))
        if cn and (n in cn or cn in n):
            return c
    # token overlap heuristic
    n_tokens = set(n.split())
    best, best_score = None, 0
    for c in candidates:
        cn = _norm(c.get("name", ""))
        if not cn:
            continue
        score = len(n_tokens & set(cn.split()))
        if score > best_score:
            best, best_score = c, score
    return best if best_score >= 2 else None


async def _ocr_extract(image_base64: str, system_prompt: str, user_prompt: str) -> dict:
    """Wrapper d'appel à Gemini Vision pour extraire une liste structurée."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "Clé LLM non configurée")
    session_id = f"recoup-{uuid.uuid4().hex[:8]}"
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system_prompt,
    ).with_model("gemini", "gemini-3.1-pro-preview")

    image = ImageContent(image_base64=image_base64)
    msg = UserMessage(text=user_prompt, file_contents=[image])
    try:
        text = await chat.send_message(msg)
    except Exception as e:
        logger.error(f"OCR LLM error: {e}")
        raise HTTPException(502, f"Erreur d'extraction IA : {e}")
    # Tente de parser du JSON dans la réponse
    cleaned = (text or "").strip()
    # Strip code fences
    m = re.search(r"```(?:json)?\s*(.+?)```", cleaned, re.DOTALL)
    if m:
        cleaned = m.group(1).strip()
    try:
        data = json.loads(cleaned)
    except Exception:
        # Tente trouver le premier objet JSON
        m2 = re.search(r"\{[\s\S]+\}", cleaned)
        if m2:
            try:
                data = json.loads(m2.group(0))
            except Exception:
                data = {"items": [], "raw": text}
        else:
            data = {"items": [], "raw": text}
    return data


# ─────────────── Extraction endpoints ───────────────

@router.post("/recoupement/extract-cuisine")
async def extract_cuisine(body: ExtractBody):
    """Extrait la liste des plats déclarés par le cuisinier depuis une photo."""
    if body.actor_role not in ("admin", "manager"):
        raise HTTPException(403, "Action réservée à l'admin et à la Resp. Op.")
    sys_prompt = (
        "Tu es un assistant qui lit le point manuscrit d'un cuisinier dans un restaurant. "
        "L'écriture peut être en français, parfois rapide ou abrégée. "
        "Tu dois extraire la liste des plats et leur quantité (entier ou décimal). "
        "Réponds STRICTEMENT au format JSON suivant, sans aucun texte autour : "
        '{"items": [{"name": "Nom du plat", "quantity": 3}, ...], "notes": "remarques éventuelles"}'
    )
    user_prompt = (
        "Lis cette photo du cahier de la cuisine et extrais chaque plat avec sa quantité. "
        "Ignore les ratures. Si une quantité est illisible, mets 0 et précise dans 'notes'. "
        "Garde le nom EXACTEMENT comme écrit (sans corriger l'orthographe), en français."
    )
    data = await _ocr_extract(body.image_base64, sys_prompt, user_prompt)
    return {
        "items": data.get("items") or [],
        "notes": data.get("notes") or "",
        "raw": data.get("raw"),
    }


@router.post("/recoupement/extract-jeux")
async def extract_jeux(body: ExtractBody):
    """Extrait le compteur de parties par jeu/machine depuis une photo."""
    if body.actor_role not in ("admin", "manager"):
        raise HTTPException(403, "Action réservée à l'admin et à la Resp. Op.")
    sys_prompt = (
        "Tu lis un tableau ou cahier manuscrit qui liste le nombre de parties jouées "
        "par machine/jeu dans un restaurant-bar (ex: PS5, Babyfoot, Billard, VR). "
        "Tu dois extraire un objet JSON STRICTEMENT au format : "
        '{"items": [{"name": "PS5", "quantity": 12}, {"name": "Babyfoot", "quantity": 8}, ...], "notes": "..."}'
    )
    user_prompt = (
        "Lis cette photo et extrais chaque machine/jeu avec le nombre de parties. "
        "Si un nombre est illisible mets 0 et signale-le dans 'notes'."
    )
    data = await _ocr_extract(body.image_base64, sys_prompt, user_prompt)
    return {
        "items": data.get("items") or [],
        "notes": data.get("notes") or "",
        "raw": data.get("raw"),
    }


# ─────────────── Compare endpoints ───────────────

async def _system_sales_by_item(date_str: str, dept_filter: set) -> dict:
    """Agrège les ventes système par nom de produit, restreint à un set de départements.
    Retourne {nom_produit: {"quantity": N, "revenue": F, "department": ...}}."""
    start = f"{date_str}T00:00:00"
    end = f"{date_str}T23:59:59.999999"
    invoices = await db.invoices.find({
        "created_at": {"$gte": start, "$lte": end},
        "validation_status": "validated",
    }, {"_id": 0, "items": 1, "totals_by_department": 1, "total": 1}).to_list(5000)

    by_item = {}
    for inv in invoices:
        for it in (inv.get("items") or []):
            dept = it.get("department") or it.get("category") or ""
            # On filtre soit par dept_filter, soit on prend tout (filtrage côté caller)
            if dept_filter and not any(d.lower() == dept.lower() for d in dept_filter):
                # Vérifie aussi si le nom contient un mot-clé typique
                pass  # On garde quand même pour l'instant et filtre côté match
            name = it.get("name") or ""
            if not name:
                continue
            q = float(it.get("quantity") or 0)
            p = float(it.get("price") or 0)
            entry = by_item.setdefault(name, {"quantity": 0, "revenue": 0, "department": dept})
            entry["quantity"] += q
            entry["revenue"] += q * p
            entry["department"] = entry["department"] or dept
    return by_item


def _build_compare_rows(declared: List[CompareItem], system_by_item: dict) -> dict:
    """Construit le tableau comparatif + agrégats."""
    candidates = [{"name": k, **v} for k, v in system_by_item.items()]
    used_keys = set()
    rows = []
    total_declared_qty = 0
    total_system_qty = 0
    total_system_revenue = 0

    for d in declared:
        match = _fuzzy_match(d.name, candidates)
        if match:
            used_keys.add(match["name"])
            sys_qty = match["quantity"]
            sys_rev = match["revenue"]
        else:
            sys_qty = 0
            sys_rev = 0
        diff = d.quantity - sys_qty
        pct = (abs(diff) / sys_qty) if sys_qty > 0 else (1.0 if diff != 0 else 0)
        alert = (abs(diff) > DIFF_THRESHOLD_QTY) or (pct > DIFF_THRESHOLD_PCT and abs(diff) >= 1)
        rows.append({
            "name_declared": d.name,
            "name_system": match["name"] if match else None,
            "quantity_declared": d.quantity,
            "quantity_system": sys_qty,
            "diff_quantity": diff,
            "diff_pct": round(pct * 100, 1),
            "system_revenue": sys_rev,
            "department": (match or {}).get("department"),
            "alert": alert,
            "status": "missing_in_system" if not match else ("over_declared" if diff > 0 else ("under_declared" if diff < 0 else "ok")),
        })
        total_declared_qty += d.quantity
        total_system_qty += sys_qty
        total_system_revenue += sys_rev

    # Articles vendus en système mais NON déclarés par le cuisinier
    for k, v in system_by_item.items():
        if k in used_keys:
            continue
        rows.append({
            "name_declared": None,
            "name_system": k,
            "quantity_declared": 0,
            "quantity_system": v["quantity"],
            "diff_quantity": -v["quantity"],
            "diff_pct": 100.0 if v["quantity"] > 0 else 0,
            "system_revenue": v["revenue"],
            "department": v.get("department"),
            "alert": v["quantity"] > 0,
            "status": "missing_in_declaration",
        })
        total_system_qty += v["quantity"]
        total_system_revenue += v["revenue"]

    return {
        "rows": rows,
        "total_declared_qty": total_declared_qty,
        "total_system_qty": total_system_qty,
        "total_system_revenue": total_system_revenue,
        "alerts_count": sum(1 for r in rows if r["alert"]),
    }


async def _save_and_audit(kind: str, date_str: str, summary: dict, body: CompareBody, audit_threshold_breached: bool):
    rec = {
        "id": str(uuid.uuid4()),
        "kind": kind,  # "cuisine" | "jeux"
        "date": date_str,
        "declared": [d.model_dump() for d in body.declared],
        "summary": summary,
        "notes": body.notes,
        "actor_name": body.actor_name,
        "actor_role": body.actor_role,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.recoupements.insert_one(rec)
    rec.pop("_id", None)

    # Audit log
    try:
        sev = "critical" if audit_threshold_breached else ("warning" if summary["alerts_count"] > 0 else "info")
        await db.audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "entity_type": f"recoupement_{kind}",
            "entity_id": rec["id"],
            "action": "compare",
            "actor_name": body.actor_name,
            "actor_role": body.actor_role,
            "severity": sev,
            "snapshot": {
                "date": date_str,
                "alerts_count": summary["alerts_count"],
                "total_system_revenue": summary["total_system_revenue"],
                "total_declared_qty": summary["total_declared_qty"],
                "total_system_qty": summary["total_system_qty"],
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.error(f"audit log save failed: {e}")
    return rec


@router.post("/recoupement/compare-cuisine")
async def compare_cuisine(body: CompareBody):
    if body.actor_role not in ("admin", "manager"):
        raise HTTPException(403, "Action réservée")
    system = await _system_sales_by_item(body.date, CUISINE_DEPTS)
    summary = _build_compare_rows(body.declared, system)
    # CA total cuisine (système) — pas de CA "déclaré" car le cuisinier ne saisit pas de prix
    breached = summary["alerts_count"] >= 3  # > 2 alertes → critical
    rec = await _save_and_audit("cuisine", body.date, summary, body, breached)
    return {"ok": True, "recoupement": rec, "summary": summary, "audit_critical": breached}


@router.post("/recoupement/compare-jeux")
async def compare_jeux(body: CompareBody):
    if body.actor_role not in ("admin", "manager"):
        raise HTTPException(403, "Action réservée")
    system = await _system_sales_by_item(body.date, JEUX_DEPTS)
    summary = _build_compare_rows(body.declared, system)
    breached = summary["alerts_count"] >= 3
    rec = await _save_and_audit("jeux", body.date, summary, body, breached)
    return {"ok": True, "recoupement": rec, "summary": summary, "audit_critical": breached}


@router.get("/recoupement/list")
async def list_recoupements(kind: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None, limit: int = 100):
    q = {}
    if kind:
        q["kind"] = kind
    if start_date and end_date:
        q["date"] = {"$gte": start_date, "$lte": end_date}
    items = await db.recoupements.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {"total": len(items), "items": items}
