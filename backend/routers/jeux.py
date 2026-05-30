"""
Jeux — Module dédié au profil "coach_jeux".

Workflow :
  1. Le coach crée un "bon de jeu" : type de jeu (catalogue caisse_products dept=jeux),
     nombre de parties, joueurs (texte libre), prix unitaire (modifiable, défaut catalogue),
     durée optionnelle, notes.
  2. Le bon est transmis (statut: pending) au Resp. Op./Admin.
  3. Resp. Op. peut :
       - Rattacher le bon à une table existante (les items s'ajoutent à la table)  → status: attached
       - Facturer directement sans table (création d'une invoice pending)         → status: invoiced
       - Refuser le bon avec motif                                                → status: rejected
  4. Une fois transmis, le coach ne peut plus modifier (lecture seule).
  5. Le coach voit l'historique de ses bons avec leur statut.

Endpoints :
  - GET    /api/jeux/catalog                  : produits Caisse dept=jeux
  - GET    /api/jeux/bons                     : liste (filtres status, coach)
  - POST   /api/jeux/bons                     : création (coach)
  - POST   /api/jeux/bons/{id}/attach         : Resp. Op. rattache à une table
  - POST   /api/jeux/bons/{id}/standalone     : Resp. Op. crée facture standalone
  - POST   /api/jeux/bons/{id}/reject         : Resp. Op. refuse
"""
from datetime import datetime, timezone
from typing import Optional, List
import os
import uuid
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)
router = APIRouter(tags=["jeux"])

mongo_url = os.environ.get("MONGO_URL")
db_name = os.environ.get("DB_NAME")
db_client = AsyncIOMotorClient(mongo_url)
db = db_client[db_name]


# ─────────────────────────────────────────────────────────
# Catalogue
# ─────────────────────────────────────────────────────────

@router.get("/jeux/catalog")
async def get_jeux_catalog(actor_role: str = ""):
    """Retourne les produits du département 'jeux' du catalogue Caisse."""
    if actor_role not in ("coach_jeux", "admin", "manager"):
        raise HTTPException(403, "Action réservée")
    products = await db.caisse_products.find(
        {"department": "jeux"},
        {"_id": 0, "id": 1, "name": 1, "price": 1, "category": 1, "department": 1},
    ).sort("name", 1).to_list(200)
    return {"total": len(products), "products": products}


# ─────────────────────────────────────────────────────────
# CRUD Bons Jeux
# ─────────────────────────────────────────────────────────

class JeuxBonItem(BaseModel):
    jeu_product_id: str
    jeu_name: str
    parties: int = Field(..., gt=0, le=100)
    unit_price: float = Field(..., ge=0)
    duration_minutes: Optional[int] = None
    notes: Optional[str] = ""
    billing_mode: Optional[str] = "parties"  # "parties" | "hourly"
    hours: Optional[float] = None  # Si billing_mode='hourly'
    hourly_rate: Optional[float] = None  # Si billing_mode='hourly'


class JeuxBonCreate(BaseModel):
    items: List[JeuxBonItem]
    players: str = ""
    notes: Optional[str] = ""
    coach_name: str
    coach_role: str


@router.post("/jeux/bons")
async def create_bon(body: JeuxBonCreate):
    if body.coach_role not in ("coach_jeux", "admin"):
        raise HTTPException(403, "Action réservée au coach")
    if not body.items:
        raise HTTPException(400, "Au moins une ligne est requise")
    now_iso = datetime.now(timezone.utc).isoformat()
    items_out = []
    total = 0.0
    total_duration = 0
    for it in body.items:
        line_total = round(float(it.unit_price) * int(it.parties), 2)
        total += line_total
        if it.duration_minutes:
            total_duration += int(it.duration_minutes)
        items_out.append({
            "jeu_product_id": it.jeu_product_id,
            "jeu_name": it.jeu_name,
            "parties": int(it.parties),
            "unit_price": float(it.unit_price),
            "total": line_total,
            "duration_minutes": it.duration_minutes,
            "notes": (it.notes or "").strip(),
            "billing_mode": it.billing_mode or "parties",
            "hours": float(it.hours) if it.hours is not None else None,
            "hourly_rate": float(it.hourly_rate) if it.hourly_rate is not None else None,
        })
    bon = {
        "id": str(uuid.uuid4()),
        "items": items_out,
        "total": round(total, 2),
        "total_duration_minutes": total_duration or None,
        "players": (body.players or "").strip(),
        "notes": (body.notes or "").strip(),
        "coach_name": body.coach_name,
        "coach_role": body.coach_role,
        "status": "pending",
        "table_id": None,
        "table_number": None,
        "invoice_id": None,
        "invoice_number": None,
        "rejection_reason": None,
        "processed_by": None,
        "processed_by_role": None,
        "processed_at": None,
        "created_at": now_iso,
    }
    await db.jeux_bons.insert_one(bon)
    bon.pop("_id", None)
    return {"success": True, "bon": bon}


def _ensure_items(bon: dict) -> list:
    """Retourne la liste des items du bon (supporte ancien format mono-jeu)."""
    if bon.get("items"):
        return bon["items"]
    # Legacy fallback : ancien format avec champs top-level
    if bon.get("jeu_product_id"):
        return [{
            "jeu_product_id": bon["jeu_product_id"],
            "jeu_name": bon.get("jeu_name", ""),
            "parties": bon.get("parties", 1),
            "unit_price": bon.get("unit_price", 0),
            "total": bon.get("total", 0),
            "duration_minutes": bon.get("duration_minutes"),
            "notes": "",
        }]
    return []


@router.get("/jeux/bons")
async def list_bons(
    actor_role: str = "",
    actor_name: str = "",
    status: Optional[str] = None,
    limit: int = 200,
):
    """Liste les bons.
    - coach_jeux : voit ses propres bons uniquement
    - admin/manager : voit tout (filtrable par status)
    """
    if actor_role not in ("coach_jeux", "admin", "manager"):
        raise HTTPException(403, "Action réservée")
    q = {}
    if actor_role == "coach_jeux":
        q["coach_name"] = actor_name or ""
    if status:
        q["status"] = status
    bons = await db.jeux_bons.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    pending = sum(1 for b in bons if b.get("status") == "pending")
    return {"total": len(bons), "pending": pending, "bons": bons}


# ─────────────────────────────────────────────────────────
# Actions Resp. Op.
# ─────────────────────────────────────────────────────────

class AttachBody(BaseModel):
    table_id: str
    actor_role: str
    actor_name: str


@router.post("/jeux/bons/{bon_id}/attach")
async def attach_bon_to_table(bon_id: str, body: AttachBody):
    if body.actor_role not in ("admin", "manager"):
        raise HTTPException(403, "Action réservée à l'admin / Resp. Op.")
    bon = await db.jeux_bons.find_one({"id": bon_id}, {"_id": 0})
    if not bon:
        raise HTTPException(404, "Bon introuvable")
    if bon.get("status") != "pending":
        raise HTTPException(400, f"Bon déjà traité (statut: {bon.get('status')})")
    table = await db.caisse_tables.find_one({"id": body.table_id}, {"_id": 0})
    if not table:
        raise HTTPException(404, "Table introuvable")

    now_iso = datetime.now(timezone.utc).isoformat()
    items_list = _ensure_items(bon)
    new_items = []
    for it in items_list:
        new_items.append({
            "id": str(uuid.uuid4()),
            "product_id": it["jeu_product_id"],
            "name": it["jeu_name"],
            "quantity": it["parties"],
            "price": it["unit_price"],
            "total": it["total"],
            "department": "jeux",
            "category": "jeux",
            "notes": _format_item_notes(it, bon),
            "from_jeux_bon": bon_id,
            "added_at": now_iso,
            "added_by": body.actor_name,
        })
    items = (table.get("items") or []) + new_items
    await db.caisse_tables.update_one(
        {"id": body.table_id},
        {"$set": {"items": items, "updated_at": now_iso}},
    )
    await db.jeux_bons.update_one(
        {"id": bon_id},
        {"$set": {
            "status": "attached",
            "table_id": body.table_id,
            "table_number": table.get("table_number"),
            "processed_by": body.actor_name,
            "processed_by_role": body.actor_role,
            "processed_at": now_iso,
        }},
    )
    return {"success": True, "table_number": table.get("table_number"), "items_added": len(new_items)}


class StandaloneBody(BaseModel):
    customer_name: Optional[str] = "Client de passage"
    customer_phone: Optional[str] = ""
    payment_method: str = "especes"  # especes | mobile | cb
    actor_role: str
    actor_name: str


@router.post("/jeux/bons/{bon_id}/standalone")
async def make_standalone_invoice(bon_id: str, body: StandaloneBody):
    """Crée une facture standalone (sans table) en statut pending pour ce bon."""
    if body.actor_role not in ("admin", "manager"):
        raise HTTPException(403, "Action réservée")
    bon = await db.jeux_bons.find_one({"id": bon_id}, {"_id": 0})
    if not bon:
        raise HTTPException(404, "Bon introuvable")
    if bon.get("status") != "pending":
        raise HTTPException(400, f"Bon déjà traité (statut: {bon.get('status')})")

    today = datetime.now(timezone.utc)
    date_prefix = today.strftime("%Y%m%d")
    count = await db.invoices.count_documents({"invoice_number": {"$regex": f"^EM-{date_prefix}"}})
    invoice_number = f"EM-{date_prefix}-{str(count + 1).zfill(4)}"
    now_iso = today.isoformat()

    items_list = _ensure_items(bon)
    inv_items = []
    subtotal = 0.0
    for it in items_list:
        line_total = float(it.get("total") or 0)
        subtotal += line_total
        inv_items.append({
            "id": str(uuid.uuid4()),
            "product_id": it["jeu_product_id"],
            "name": it["jeu_name"],
            "quantity": it["parties"],
            "price": it["unit_price"],
            "total": line_total,
            "department": "jeux",
            "category": "jeux",
            "notes": _format_item_notes(it, bon),
            "from_jeux_bon": bon_id,
        })
    invoice = {
        "id": str(uuid.uuid4()),
        "invoice_number": invoice_number,
        "customer_name": (body.customer_name or "Client de passage").strip() or "Client de passage",
        "customer_phone": body.customer_phone or "",
        "items": inv_items,
        "subtotal": round(subtotal, 2),
        "discount": 0,
        "total": round(subtotal, 2),
        "payment_method": body.payment_method,
        "validation_status": "pending",
        "created_by": body.actor_name,
        "created_by_role": body.actor_role,
        "date": today.strftime("%Y-%m-%d"),
        "created_at": now_iso,
        "from_jeux_bon": bon_id,
        "source": "jeux_standalone",
    }
    await db.invoices.insert_one(invoice)
    await db.jeux_bons.update_one(
        {"id": bon_id},
        {"$set": {
            "status": "invoiced",
            "invoice_id": invoice["id"],
            "invoice_number": invoice_number,
            "processed_by": body.actor_name,
            "processed_by_role": body.actor_role,
            "processed_at": now_iso,
        }},
    )
    return {"success": True, "invoice_number": invoice_number, "invoice_id": invoice["id"], "items_count": len(inv_items)}


class RejectBody(BaseModel):
    reason: str
    actor_role: str
    actor_name: str


@router.post("/jeux/bons/{bon_id}/reject")
async def reject_bon(bon_id: str, body: RejectBody):
    if body.actor_role not in ("admin", "manager"):
        raise HTTPException(403, "Action réservée")
    bon = await db.jeux_bons.find_one({"id": bon_id}, {"_id": 0})
    if not bon:
        raise HTTPException(404, "Bon introuvable")
    if bon.get("status") != "pending":
        raise HTTPException(400, f"Bon déjà traité (statut: {bon.get('status')})")
    if not (body.reason or "").strip():
        raise HTTPException(400, "Motif de refus requis")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.jeux_bons.update_one(
        {"id": bon_id},
        {"$set": {
            "status": "rejected",
            "rejection_reason": body.reason.strip(),
            "processed_by": body.actor_name,
            "processed_by_role": body.actor_role,
            "processed_at": now_iso,
        }},
    )
    return {"success": True}


def _format_item_notes(item: dict, bon: dict) -> str:
    """Note enrichie d'un item-jeu pour l'affichage table/facture."""
    parts = []
    if bon.get("players"):
        parts.append(f"Joueurs: {bon['players']}")
    if item.get("duration_minutes"):
        parts.append(f"Durée: {item['duration_minutes']} min")
    if item.get("notes"):
        parts.append(item["notes"])
    if bon.get("notes"):
        parts.append(bon["notes"])
    parts.append(f"Coach: {bon.get('coach_name','?')}")
    return " · ".join(parts)
