"""
Sync Queue — Traitement idempotent des actions mises en file d'attente
côté frontend pendant le mode hors-ligne (Phase 2).

Endpoint : POST /api/sync/queue/process
Body :
{
  "actions": [
    {
      "client_id": "uuid",
      "type": "create_table" | "update_table" | "create_invoice" | "delete_table",
      "payload": {...},
      "queued_at": "ISO date"
    },
    ...
  ]
}

Réponse :
{
  "results": [
    {"client_id": "uuid", "status": "ok" | "duplicate" | "conflict" | "error",
     "data": {...optional...}, "reason": "..."}
  ]
}

Stratégie de conflits ("Admin gagne" — point 2-b du brief) :
- create_table : si une table avec même server_id + table_number existe ET a été
  créée APRÈS le queued_at, on rejette avec status="conflict".
- update_table : si la table n'existe plus (supprimée par Admin), rejet.
- create_invoice : si une facture avec ce client_id existe déjà, on renvoie "duplicate".

Idempotency :
- Chaque action porte un `client_id` UUID généré côté front.
- On stocke l'identifiant dans `sync_queue_processed` après succès.
- Si on revoit la même action, on renvoie status="duplicate" + data persistée.
"""
from datetime import datetime, timezone
from typing import List, Optional, Any
import os
import uuid
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)
router = APIRouter(tags=["sync-queue"])

mongo_url = os.environ.get("MONGO_URL")
db_name = os.environ.get("DB_NAME")
db_client = AsyncIOMotorClient(mongo_url)
db = db_client[db_name]


class QueuedAction(BaseModel):
    client_id: str
    type: str
    payload: dict = Field(default_factory=dict)
    queued_at: Optional[str] = None
    user: Optional[dict] = None  # {"name", "role"}


class QueueProcessBody(BaseModel):
    actions: List[QueuedAction]


async def _get_processed(client_id: str) -> Optional[dict]:
    return await db.sync_queue_processed.find_one(
        {"client_id": client_id}, {"_id": 0}
    )


async def _mark_processed(client_id: str, status: str, data: Any = None, reason: str = ""):
    await db.sync_queue_processed.update_one(
        {"client_id": client_id},
        {"$set": {
            "client_id": client_id,
            "status": status,
            "data": data,
            "reason": reason,
            "processed_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )


# ─────────────── Handlers ───────────────

async def _handle_create_table(action: QueuedAction) -> dict:
    p = action.payload or {}
    # Conflit : table existe déjà avec ce server_id+table_number
    existing = await db.caisse_tables.find_one(
        {"server_id": p.get("server_id"), "table_number": p.get("table_number")},
        {"_id": 0},
    )
    if existing:
        return {"status": "conflict", "reason": "Une table avec ce numéro est déjà ouverte par ce serveur", "data": existing}
    doc = {
        "id": p.get("id") or str(uuid.uuid4()),
        "table_number": p.get("table_number"),
        "server_id": p.get("server_id"),
        "server_name": p.get("server_name"),
        "items": p.get("items") or [],
        "client_id": p.get("client_id"),
        "client_name": p.get("client_name") or "Client",
        "payment_method": p.get("payment_method"),
        "discount": p.get("discount") or 0,
        "notes": p.get("notes") or "",
        "created_at": action.queued_at or datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "_offline_origin": True,
        "_offline_client_id": action.client_id,
    }
    await db.caisse_tables.insert_one(doc)
    doc.pop("_id", None)
    return {"status": "ok", "data": doc}


async def _handle_update_table(action: QueuedAction) -> dict:
    p = action.payload or {}
    table_id = p.get("id")
    if not table_id:
        return {"status": "error", "reason": "id manquant"}
    existing = await db.caisse_tables.find_one({"id": table_id}, {"_id": 0})
    if not existing:
        # Conflit : table supprimée par Admin
        return {"status": "conflict", "reason": "Table introuvable (probablement supprimée par l'administrateur)"}
    patch = {
        k: v for k, v in p.items()
        if k in ("items", "client_id", "client_name", "payment_method", "discount", "notes")
        and v is not None
    }
    if patch:
        patch["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.caisse_tables.update_one({"id": table_id}, {"$set": patch})
    refreshed = await db.caisse_tables.find_one({"id": table_id}, {"_id": 0})
    return {"status": "ok", "data": refreshed}


async def _handle_delete_table(action: QueuedAction) -> dict:
    p = action.payload or {}
    table_id = p.get("id")
    if not table_id:
        return {"status": "error", "reason": "id manquant"}
    existing = await db.caisse_tables.find_one({"id": table_id}, {"_id": 0})
    if not existing:
        # Si déjà absente, traiter comme "ok" idempotent
        return {"status": "ok", "data": {"deleted": True}}
    await db.caisse_tables.delete_one({"id": table_id})
    return {"status": "ok", "data": {"deleted": True}}


async def _handle_create_invoice(action: QueuedAction) -> dict:
    p = action.payload or {}
    # Garde-fou journée : Admin gagne, donc si la journée n'est pas ouverte au moment du sync, rejet
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    opening = await db.day_openings.find_one({"date": today_str}, {"_id": 0, "status": 1})
    if not opening or opening.get("status") != "open":
        return {"status": "conflict", "reason": "La journée n'est pas ouverte sur le serveur. Action rejetée."}

    today_yyyymmdd = datetime.now(timezone.utc).strftime("%Y%m%d")
    count = await db.invoices.count_documents({
        "created_at": {"$regex": f"^{today_str}"}
    })
    invoice_number = p.get("invoice_number") or f"EM-{today_yyyymmdd}-{count + 1:04d}"

    invoice = {
        "id": p.get("id") or str(uuid.uuid4()),
        "invoice_number": invoice_number,
        "customer_name": p.get("customer_name") or "",
        "customer_phone": p.get("customer_phone") or "",
        "items": p.get("items") or [],
        "subtotal": float(p.get("subtotal") or 0),
        "discount": float(p.get("discount") or 0),
        "discount_amount": float(p.get("discount_amount") or 0),
        "total": float(p.get("total") or 0),
        "payment_method": p.get("payment_method") or "cash",
        "totals_by_department": p.get("totals_by_department") or {},
        "notes": p.get("notes") or "",
        "created_by": p.get("created_by") or (action.user or {}).get("name") or "",
        "table_number": p.get("table_number"),
        "validation_status": p.get("validation_status") or "pending",
        "validated_by": p.get("validated_by") or "",
        "validated_at": p.get("validated_at") or "",
        "created_at": action.queued_at or datetime.now(timezone.utc).isoformat(),
        "_offline_origin": True,
        "_offline_client_id": action.client_id,
    }
    await db.invoices.insert_one(invoice)
    invoice.pop("_id", None)
    return {"status": "ok", "data": invoice}


HANDLERS = {
    "create_table": _handle_create_table,
    "update_table": _handle_update_table,
    "delete_table": _handle_delete_table,
    "create_invoice": _handle_create_invoice,
}


# ─────────────── Main endpoint ───────────────

@router.post("/sync/queue/process")
async def process_queue(body: QueueProcessBody):
    """Traite un batch d'actions hors-ligne de façon idempotente."""
    results = []
    for action in body.actions:
        # Idempotency check
        prev = await _get_processed(action.client_id)
        if prev:
            results.append({
                "client_id": action.client_id,
                "status": "duplicate",
                "data": prev.get("data"),
                "reason": "Action déjà traitée précédemment",
            })
            continue

        handler = HANDLERS.get(action.type)
        if not handler:
            res = {"status": "error", "reason": f"Type d'action inconnu : {action.type}"}
        else:
            try:
                res = await handler(action)
            except Exception as e:
                logger.error(f"Queue handler {action.type} failed: {e}")
                res = {"status": "error", "reason": str(e)}

        await _mark_processed(action.client_id, res.get("status"), res.get("data"), res.get("reason", ""))
        results.append({"client_id": action.client_id, **res})

    return {"processed": len(results), "results": results}


@router.get("/sync/queue/status")
async def queue_status(limit: int = 50):
    """Renvoie les dernières actions traitées (debug + audit)."""
    items = await db.sync_queue_processed.find({}, {"_id": 0}).sort("processed_at", -1).to_list(limit)
    return {"total": len(items), "items": items}
