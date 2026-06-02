"""
Cuisine — Endpoints dédiés au profil "cuisinier".

Permissions strictes :
  - Le cuisinier peut LIRE les bons de table du jour pour ses départements
  - Marquer un item d'un bon comme "prêt" (ready_at)
  - Marquer tout un bon comme "prêt" / "envoyé"
  - Scanner un bon papier (photo IA OCR → enregistrement dans recoupements)
  - PAS d'accès aux factures, caisse, stocks, statistiques

Endpoints :
  - GET    /api/cuisine/orders                   : bons cuisine du jour
  - PATCH  /api/cuisine/orders/{table_id}/items/{item_index}/ready
  - PATCH  /api/cuisine/orders/{table_id}/ready  : marquer tout le bon prêt
  - POST   /api/cuisine/scan-bon                 : enregistre une photo de bon (kind=cuisine)
  - GET    /api/cuisine/ready-notifications      : pour la salle, items récents passés "prêt"
"""
from datetime import datetime, timezone, timedelta
from typing import Optional
import os
import uuid
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)
router = APIRouter(tags=["cuisine"])

mongo_url = os.environ.get("MONGO_URL")
db_name = os.environ.get("DB_NAME")
db_client = AsyncIOMotorClient(mongo_url)
db = db_client[db_name]

# Départements considérés "cuisine"
CUISINE_DEPTS = {"cuisine", "salle_jardin", "plats", "Plats", "Grillades", "Entrées", "Desserts", "Sauces", "Riz", "Féculents"}


def _is_cuisine_item(it: dict) -> bool:
    dept = (it.get("department") or it.get("category") or "").lower()
    return any(d.lower() == dept for d in CUISINE_DEPTS) or dept in {"plat", "plats"}


def _item_status(it: dict) -> str:
    """Retourne le statut d'un item : received | in_progress | ready | served."""
    if it.get("served_at"):
        return "served"
    if it.get("ready_at"):
        return "ready"
    if it.get("started_at"):
        return "in_progress"
    return "received"


@router.get("/cuisine/orders")
async def list_cuisine_orders(actor_role: str = "", status_filter: str = "active", days: int = 1):
    """Liste les bons de table avec items cuisine.

    Params :
    - status_filter : "active" (par défaut) = bons non encore tous prêts (all_ready_at vide)
                      "done"   = bons terminés (all_ready_at présent)
                      "all"    = tous les bons
    - days : nombre de jours en arrière à inclure (1 = aujourd'hui uniquement).
             Utile pour l'historique cuisinier (ex: 14 jours).
    """
    if actor_role not in ("cuisinier", "admin", "manager"):
        raise HTTPException(403, "Action réservée au cuisinier / admin")
    try:
        days_back = max(1, int(days))
    except Exception:
        days_back = 1
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days_back - 1)).strftime("%Y-%m-%d")
    # Tables actives (non encore facturées)
    tables = await db.caisse_tables.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    out = []
    for t in tables:
        items = t.get("items") or []
        cui_items = [(idx, it) for idx, it in enumerate(items) if _is_cuisine_item(it)]
        if not cui_items:
            continue
        # Filter on date range (cutoff..today)
        t_date = (t.get("created_at") or "")[:10] or (t.get("updated_at") or "")[:10]
        if t_date and t_date < cutoff:
            continue
        # Filter on all_ready status
        is_all_ready = bool(t.get("all_ready_at"))
        if status_filter == "active" and is_all_ready:
            continue
        if status_filter == "done" and not is_all_ready:
            continue
        # Augment items with status info
        items_out = [{
            "index": idx,
            "name": it.get("name"),
            "quantity": it.get("quantity") or 1,
            "price": it.get("price") or 0,
            "department": it.get("department") or it.get("category"),
            "notes": it.get("notes"),
            "status": _item_status(it),
            "ready": bool(it.get("ready_at")),
            "ready_at": it.get("ready_at"),
            "started_at": it.get("started_at"),
            "served_at": it.get("served_at"),
            "served_by": it.get("served_by"),
        } for idx, it in cui_items]
        out.append({
            "id": t.get("id"),
            "table_number": t.get("table_number"),
            "server_name": t.get("server_name"),
            "client_name": t.get("client_name"),
            "created_at": t.get("created_at"),
            "updated_at": t.get("updated_at"),
            "notes": t.get("notes"),
            "all_ready": is_all_ready,
            "all_ready_at": t.get("all_ready_at"),
            "all_served": all(i["status"] == "served" for i in items_out) if items_out else False,
            "items": items_out,
        })
    return {"total": len(out), "orders": out}


# ─────────────────────────────────────────────────────────
# Transitions de statut supplémentaires
# ─────────────────────────────────────────────────────────

@router.patch("/cuisine/orders/{table_id}/items/{item_index}/start")
async def mark_item_in_progress(table_id: str, item_index: int, actor_role: str = "", actor_name: str = ""):
    """Cuisinier marque un plat 'en préparation'."""
    if actor_role not in ("cuisinier", "admin"):
        raise HTTPException(403, "Action réservée au cuisinier")
    t = await db.caisse_tables.find_one({"id": table_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Table introuvable")
    items = t.get("items") or []
    if item_index < 0 or item_index >= len(items):
        raise HTTPException(400, "Index invalide")
    now_iso = datetime.now(timezone.utc).isoformat()
    if not items[item_index].get("started_at"):
        items[item_index]["started_at"] = now_iso
        items[item_index]["started_by"] = actor_name or "cuisinier"
    await db.caisse_tables.update_one({"id": table_id}, {"$set": {"items": items, "updated_at": now_iso}})
    try:
        await db.cuisine_events.insert_one({
            "id": str(uuid.uuid4()),
            "action": "item_in_progress",
            "table_id": table_id,
            "table_number": t.get("table_number"),
            "server_name": t.get("server_name"),
            "item_name": items[item_index].get("name"),
            "item_quantity": items[item_index].get("quantity") or 1,
            "actor_name": actor_name or "cuisinier",
            "actor_role": actor_role,
            "created_at": now_iso,
        })
    except Exception as e:
        logger.error(f"cuisine event log fail: {e}")
    return {"success": True, "item": items[item_index]}


@router.patch("/cuisine/orders/{table_id}/items/{item_index}/served")
async def mark_item_served(table_id: str, item_index: int, actor_role: str = "", actor_name: str = ""):
    """Resp. Op. / Agent confirme que le plat a été apporté au client."""
    if actor_role not in ("manager", "admin", "server"):
        raise HTTPException(403, "Action réservée au Resp. Op. / Agent")
    t = await db.caisse_tables.find_one({"id": table_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Table introuvable")
    items = t.get("items") or []
    if item_index < 0 or item_index >= len(items):
        raise HTTPException(400, "Index invalide")
    if not items[item_index].get("ready_at"):
        raise HTTPException(400, "Le plat n'est pas encore marqué prêt par la cuisine")
    now_iso = datetime.now(timezone.utc).isoformat()
    items[item_index]["served_at"] = now_iso
    items[item_index]["served_by"] = actor_name or actor_role
    await db.caisse_tables.update_one({"id": table_id}, {"$set": {"items": items, "updated_at": now_iso}})
    try:
        await db.cuisine_events.insert_one({
            "id": str(uuid.uuid4()),
            "action": "item_served",
            "table_id": table_id,
            "table_number": t.get("table_number"),
            "server_name": t.get("server_name"),
            "item_name": items[item_index].get("name"),
            "item_quantity": items[item_index].get("quantity") or 1,
            "actor_name": actor_name or actor_role,
            "actor_role": actor_role,
            "created_at": now_iso,
        })
    except Exception as e:
        logger.error(f"cuisine event log fail: {e}")
    return {"success": True, "item": items[item_index]}


# ─────────────────────────────────────────────────────────
# Messages préenregistrés Resp. Op. ⇄ Cuisinier
# ─────────────────────────────────────────────────────────

MANAGER_PRESETS = [
    {"code": "TIME",    "label": "⏱️ Combien de temps encore ?"},
    {"code": "URGENT",  "label": "🚨 Urgent, client pressé"},
    {"code": "CONFIRM", "label": "❓ Le plat est-il bien noté ?"},
    {"code": "REDO",    "label": "🔁 Veuillez refaire (mauvais)"},
    {"code": "CANCEL",  "label": "✋ Annulez ce plat"},
]

CUISINIER_PRESETS = [
    {"code": "OK",     "label": "✅ OK, c'est noté"},
    {"code": "5MIN",   "label": "⏱️ 5 minutes"},
    {"code": "10MIN",  "label": "⏱️ 10 minutes"},
    {"code": "15MIN",  "label": "⏱️ 15 minutes"},
    {"code": "OUT",    "label": "❌ Rupture de stock"},
    {"code": "SOON",   "label": "👨‍🍳 Bientôt prêt"},
]


@router.get("/cuisine/messages/presets")
async def get_message_presets(actor_role: str = ""):
    """Retourne les formules préenregistrées disponibles pour le rôle."""
    if actor_role not in ("cuisinier", "admin", "manager"):
        raise HTTPException(403, "Action réservée")
    return {
        "manager_to_cuisinier": MANAGER_PRESETS,
        "cuisinier_to_manager": CUISINIER_PRESETS,
    }


class SendMessageBody(BaseModel):
    code: str
    label: str
    from_role: str
    from_name: str
    to_role: str  # "cuisinier" ou "manager"
    table_id: Optional[str] = None
    table_number: Optional[int] = None
    item_name: Optional[str] = None


@router.post("/cuisine/messages")
async def send_kitchen_message(body: SendMessageBody):
    """Envoie un message préenregistré au cuisinier ou au Resp. Op."""
    if body.from_role not in ("cuisinier", "admin", "manager"):
        raise HTTPException(403, "Action réservée")
    if body.to_role not in ("cuisinier", "manager"):
        raise HTTPException(400, "Destinataire invalide")
    valid_codes = (
        [p["code"] for p in MANAGER_PRESETS]
        if body.from_role in ("manager", "admin")
        else [p["code"] for p in CUISINIER_PRESETS]
    )
    if body.code not in valid_codes:
        raise HTTPException(400, "Code de message invalide")
    msg = {
        "id": str(uuid.uuid4()),
        "code": body.code,
        "label": body.label,
        "from_role": body.from_role,
        "from_name": body.from_name,
        "to_role": body.to_role,
        "table_id": body.table_id,
        "table_number": body.table_number,
        "item_name": body.item_name,
        "read_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.cuisine_messages.insert_one(msg)
    msg.pop("_id", None)
    return {"success": True, "message": msg}


@router.get("/cuisine/messages")
async def list_kitchen_messages(actor_role: str = "", since_minutes: int = 240, limit: int = 100):
    """Liste les messages reçus par mon rôle (les 4 dernières heures par défaut)."""
    if actor_role not in ("cuisinier", "admin", "manager"):
        raise HTTPException(403, "Action réservée")
    # admin voit les messages destinés au manager (vue Resp. Op.)
    target = "manager" if actor_role in ("manager", "admin") else "cuisinier"
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=since_minutes)).isoformat()
    msgs = await db.cuisine_messages.find(
        {"to_role": target, "created_at": {"$gte": cutoff}},
        {"_id": 0},
    ).sort("created_at", -1).to_list(limit)
    unread = sum(1 for m in msgs if not m.get("read_at"))
    return {"total": len(msgs), "unread": unread, "messages": msgs}


@router.post("/cuisine/messages/{message_id}/read")
async def mark_message_read(message_id: str, actor_role: str = ""):
    if actor_role not in ("cuisinier", "admin", "manager"):
        raise HTTPException(403, "Action réservée")
    now_iso = datetime.now(timezone.utc).isoformat()
    res = await db.cuisine_messages.update_one(
        {"id": message_id, "read_at": None},
        {"$set": {"read_at": now_iso}},
    )
    return {"success": True, "modified": res.modified_count}


@router.post("/cuisine/messages/read-all")
async def mark_all_messages_read(actor_role: str = ""):
    if actor_role not in ("cuisinier", "admin", "manager"):
        raise HTTPException(403, "Action réservée")
    target = "manager" if actor_role in ("manager", "admin") else "cuisinier"
    now_iso = datetime.now(timezone.utc).isoformat()
    res = await db.cuisine_messages.update_many(
        {"to_role": target, "read_at": None},
        {"$set": {"read_at": now_iso}},
    )
    return {"success": True, "modified": res.modified_count}


@router.delete("/cuisine/messages/{message_id}")
async def delete_cuisine_message(message_id: str, actor_role: str = ""):
    """Admin uniquement : suppression d'un message."""
    if actor_role != "admin":
        raise HTTPException(403, "Action réservée à l'admin")
    existing = await db.cuisine_messages.find_one({"id": message_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Message introuvable")
    await db.cuisine_messages.delete_one({"id": message_id})
    return {"success": True}


@router.get("/cuisine/messages/all")
async def list_all_messages(actor_role: str = "", limit: int = 200):
    """Admin uniquement : liste tous les messages (entrants et sortants)."""
    if actor_role != "admin":
        raise HTTPException(403, "Action réservée à l'admin")
    msgs = await db.cuisine_messages.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {"total": len(msgs), "messages": msgs}


@router.patch("/cuisine/orders/{table_id}/items/{item_index}/ready")
async def mark_item_ready(table_id: str, item_index: int, actor_role: str = "", actor_name: str = ""):
    if actor_role not in ("cuisinier", "admin"):
        raise HTTPException(403, "Action réservée au cuisinier")
    t = await db.caisse_tables.find_one({"id": table_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Table introuvable")
    items = t.get("items") or []
    if item_index < 0 or item_index >= len(items):
        raise HTTPException(400, "Index invalide")
    now_iso = datetime.now(timezone.utc).isoformat()
    items[item_index]["ready_at"] = now_iso
    items[item_index]["ready_by"] = actor_name or "cuisinier"
    cui_indexes = [i for i, it in enumerate(items) if _is_cuisine_item(it)]
    all_ready = all(items[i].get("ready_at") for i in cui_indexes)
    patch = {"items": items, "updated_at": now_iso}
    if all_ready and cui_indexes:
        patch["all_ready_at"] = now_iso
    await db.caisse_tables.update_one({"id": table_id}, {"$set": patch})
    # Historique
    try:
        await db.cuisine_events.insert_one({
            "id": str(uuid.uuid4()),
            "action": "item_ready",
            "table_id": table_id,
            "table_number": t.get("table_number"),
            "server_name": t.get("server_name"),
            "item_name": items[item_index].get("name"),
            "item_quantity": items[item_index].get("quantity") or 1,
            "actor_name": actor_name or "cuisinier",
            "actor_role": actor_role,
            "created_at": now_iso,
        })
    except Exception as e:
        logger.error(f"cuisine event log fail: {e}")
    return {"success": True, "all_ready": all_ready, "item": items[item_index]}


@router.patch("/cuisine/orders/{table_id}/ready")
async def mark_all_items_ready(table_id: str, actor_role: str = "", actor_name: str = ""):
    if actor_role not in ("cuisinier", "admin"):
        raise HTTPException(403, "Action réservée au cuisinier")
    t = await db.caisse_tables.find_one({"id": table_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Table introuvable")
    items = t.get("items") or []
    now_iso = datetime.now(timezone.utc).isoformat()
    marked_names = []
    for i, it in enumerate(items):
        if _is_cuisine_item(it) and not it.get("ready_at"):
            items[i]["ready_at"] = now_iso
            items[i]["ready_by"] = actor_name or "cuisinier"
            marked_names.append(it.get("name"))
    await db.caisse_tables.update_one(
        {"id": table_id},
        {"$set": {"items": items, "all_ready_at": now_iso, "updated_at": now_iso}}
    )
    try:
        await db.cuisine_events.insert_one({
            "id": str(uuid.uuid4()),
            "action": "all_ready",
            "table_id": table_id,
            "table_number": t.get("table_number"),
            "server_name": t.get("server_name"),
            "items_names": marked_names,
            "items_count": len(marked_names),
            "actor_name": actor_name or "cuisinier",
            "actor_role": actor_role,
            "created_at": now_iso,
        })
    except Exception as e:
        logger.error(f"cuisine event log fail: {e}")
    return {"success": True, "all_ready_at": now_iso}


@router.get("/cuisine/events")
async def list_cuisine_events(actor_role: str = "", actor_name: str = "", start_date: Optional[str] = None, end_date: Optional[str] = None, limit: int = 200):
    """Historique des actions cuisine. Admin voit tout, cuisinier voit ses propres actions."""
    if actor_role not in ("admin", "cuisinier"):
        raise HTTPException(403, "Action réservée")
    q = {}
    if actor_role == "cuisinier":
        q["actor_name"] = actor_name or ""
    if start_date and end_date:
        q["created_at"] = {"$gte": f"{start_date}T00:00:00", "$lte": f"{end_date}T23:59:59.999"}
    items = await db.cuisine_events.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {"total": len(items), "items": items}


@router.delete("/cuisine/events/{event_id}")
async def delete_cuisine_event(event_id: str, actor_role: str = "", actor_name: str = ""):
    """Supprime une entrée d'historique cuisine. Admin uniquement."""
    if actor_role != "admin":
        raise HTTPException(403, "Action réservée à l'administrateur")
    existing = await db.cuisine_events.find_one({"id": event_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Événement introuvable")
    await db.cuisine_events.delete_one({"id": event_id})
    try:
        await db.audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "entity_type": "cuisine_event",
            "entity_id": event_id,
            "action": "delete",
            "actor_name": actor_name or "—",
            "actor_role": "admin",
            "snapshot": existing,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.error(f"audit log delete cuisine event fail: {e}")
    return {"success": True}


class ScanBonBody(BaseModel):
    image_base64: str
    mime_type: Optional[str] = "image/jpeg"
    actor_name: str
    actor_role: str
    date: Optional[str] = None  # YYYY-MM-DD, défaut aujourd'hui


@router.post("/cuisine/scan-bon")
async def scan_bon(body: ScanBonBody):
    """Le cuisinier scanne un bon papier. La photo est archivée dans `recoupements`
    avec kind="cuisine_scan" pour qu'à tout moment l'admin puisse y revenir.
    On lance aussi l'OCR pour extraire les items (best effort)."""
    if body.actor_role not in ("cuisinier", "admin", "manager"):
        raise HTTPException(403, "Action réservée")
    date_str = body.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Best-effort OCR (réutilise l'IA de recoupement)
    items = []
    notes = ""
    try:
        from routers.recoupement import _ocr_extract  # type: ignore
        sys_prompt = (
            "Tu lis un bon papier de cuisine d'un restaurant. "
            "Extrais la liste des plats et leur quantité. "
            "Réponds en JSON STRICT: {\"items\":[{\"name\":\"...\",\"quantity\":1}], \"notes\":\"...\"}"
        )
        user_prompt = "Photo d'un bon de cuisine. Extrais les plats et quantités."
        data = await _ocr_extract(body.image_base64, sys_prompt, user_prompt)
        items = data.get("items") or []
        notes = data.get("notes") or ""
    except Exception as e:
        logger.warning(f"OCR scan-bon failed: {e}")
        notes = "OCR indisponible — bon archivé sans extraction"

    rec = {
        "id": str(uuid.uuid4()),
        "kind": "cuisine_scan",
        "date": date_str,
        "declared": items,
        "declared_total_revenue": None,
        "image_base64": body.image_base64,  # archive de la photo
        "mime_type": body.mime_type,
        "summary": {
            "rows": [],
            "total_declared_qty": sum(float(it.get("quantity") or 0) for it in items),
            "total_system_qty": 0,
            "total_system_revenue": 0,
            "alerts_count": 0,
            "financial_evaluation": None,
        },
        "notes": notes,
        "actor_name": body.actor_name,
        "actor_role": body.actor_role,
        "scanned_only": True,
        "validated_by_cuisinier": False,
        "validated_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.recoupements.insert_one(rec)
    rec.pop("_id", None)
    rec.pop("image_base64", None)
    # Historique
    try:
        await db.cuisine_events.insert_one({
            "id": str(uuid.uuid4()),
            "action": "scan_bon",
            "recoupement_id": rec["id"],
            "items_count": len(items),
            "actor_name": body.actor_name,
            "actor_role": body.actor_role,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.error(f"cuisine event log scan: {e}")
    return {"success": True, "recoupement_id": rec["id"], "items_extracted": len(items), "items": items}


class ScanValidateBody(BaseModel):
    items: list[dict] = Field(default_factory=list)  # [{name, quantity}]
    notes: str = ""
    actor_name: str = ""
    actor_role: str = "cuisinier"


@router.patch("/cuisine/scan-bon/{rec_id}/validate")
async def validate_scan_bon(rec_id: str, body: ScanValidateBody):
    """Le cuisinier valide la liste extraite (éventuellement corrigée) et l'envoie à l'admin.

    Met à jour les items du recoupement, calcule total_declared_qty et marque
    validated_by_cuisinier=True. Le scan devient alors visible côté admin
    dans la section "Scans cuisinier".
    """
    if body.actor_role not in ("cuisinier", "admin", "manager"):
        raise HTTPException(403, "Action réservée")
    rec = await db.recoupements.find_one({"id": rec_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Scan introuvable")
    if rec.get("kind") != "cuisine_scan":
        raise HTTPException(400, "Cet enregistrement n'est pas un scan cuisinier")

    # Normalise items
    clean_items = []
    for it in body.items:
        name = (it.get("name") or "").strip()
        if not name:
            continue
        try:
            qty = float(it.get("quantity") or 0)
        except Exception:
            qty = 0
        clean_items.append({"name": name, "quantity": qty})

    now_iso = datetime.now(timezone.utc).isoformat()
    update = {
        "declared": clean_items,
        "summary.total_declared_qty": sum(it["quantity"] for it in clean_items),
        "summary.rows": [],
        "notes": (body.notes or "").strip(),
        "validated_by_cuisinier": True,
        "validated_at": now_iso,
        "validated_by": body.actor_name or rec.get("actor_name") or "Cuisinier",
    }
    await db.recoupements.update_one({"id": rec_id}, {"$set": update})

    # Trace dans l'historique cuisinier
    try:
        await db.cuisine_events.insert_one({
            "id": str(uuid.uuid4()),
            "action": "scan_validated",
            "recoupement_id": rec_id,
            "items_count": len(clean_items),
            "actor_name": body.actor_name or rec.get("actor_name"),
            "actor_role": body.actor_role,
            "created_at": now_iso,
        })
    except Exception as e:
        logger.error(f"cuisine event log validate: {e}")

    updated = await db.recoupements.find_one({"id": rec_id}, {"_id": 0, "image_base64": 0})
    return {"success": True, "recoupement": updated}


@router.delete("/cuisine/scan-bon/{rec_id}")
async def delete_scan_bon(rec_id: str, actor_role: str = ""):
    """Supprime un scan non validé (cuisinier peut annuler avant validation).

    Admin peut toujours supprimer.
    """
    if actor_role not in ("cuisinier", "admin"):
        raise HTTPException(403, "Action réservée")
    rec = await db.recoupements.find_one({"id": rec_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Scan introuvable")
    if rec.get("kind") != "cuisine_scan":
        raise HTTPException(400, "Cet enregistrement n'est pas un scan cuisinier")
    if actor_role == "cuisinier" and rec.get("validated_by_cuisinier"):
        raise HTTPException(400, "Scan déjà validé — l'admin doit le supprimer")
    await db.recoupements.delete_one({"id": rec_id})
    return {"success": True}


@router.get("/cuisine/scans/list")
async def list_cuisine_scans(validated_only: bool = True, limit: int = 100):
    """Liste les scans cuisinier (par défaut, uniquement les validés envoyés à l'admin)."""
    q: dict = {"kind": "cuisine_scan"}
    if validated_only:
        q["validated_by_cuisinier"] = True
    items = await db.recoupements.find(
        q, {"_id": 0, "image_base64": 0}
    ).sort("created_at", -1).to_list(min(int(limit), 500))
    return {"total": len(items), "items": items}


@router.get("/cuisine/ready-notifications")
async def ready_notifications(actor_role: str = "", since_seconds: int = 60):
    """Pour la salle/admin : items passés "prêt" récemment.
    Renvoie les events récents (par défaut < 60s)."""
    if actor_role not in ("server", "manager", "admin", "cuisinier"):
        raise HTTPException(403, "Action réservée")
    cutoff_dt = datetime.now(timezone.utc) - timedelta(seconds=since_seconds)
    cutoff_iso = cutoff_dt.isoformat()
    tables = await db.caisse_tables.find({
        "$or": [
            {"items.ready_at": {"$gte": cutoff_iso}},
            {"all_ready_at": {"$gte": cutoff_iso}},
        ]
    }, {"_id": 0}).to_list(200)
    out = []
    for t in tables:
        ready_items = [it for it in (t.get("items") or []) if it.get("ready_at") and it["ready_at"] >= cutoff_iso]
        if not ready_items and not (t.get("all_ready_at") and t["all_ready_at"] >= cutoff_iso):
            continue
        out.append({
            "table_id": t.get("id"),
            "table_number": t.get("table_number"),
            "server_name": t.get("server_name"),
            "all_ready": bool(t.get("all_ready_at") and t["all_ready_at"] >= cutoff_iso),
            "ready_items": [{
                "name": it.get("name"),
                "quantity": it.get("quantity") or 1,
                "ready_at": it.get("ready_at"),
            } for it in ready_items],
        })
    return {"total": len(out), "notifications": out}


# ==================== BESOINS EN CUISINE ====================
# Le cuisinier peut transmettre à l'administrateur la liste des produits dont il
# a besoin (réapprovisionnement, manque urgent, etc.). Chaque "besoin" est une
# demande regroupant plusieurs lignes (produit + qty + unité + urgence).
#
# Workflow :
#   1. Cuisinier ouvre l'onglet "Besoin en cuisine", sélectionne des produits
#      depuis la liste exhaustive (zone="cuisine"), saisit qty, urgence, note.
#   2. Soumission → status="pending" + alerte côté Admin (compteur badge).
#   3. Admin lit → marque "seen", puis "fulfilled" quand l'approvisionnement
#      est terminé. À tout moment l'admin peut "rejeter" avec motif.
#
# Collection : cuisine_needs
#   { id, requested_by, requested_at, status, urgency, items: [{product_id,
#     product_name, quantity, unit, observed_stock, note}], notes, seen_at,
#     seen_by, fulfilled_at, fulfilled_by, rejection_reason }

class NeedLine(BaseModel):
    product_id: Optional[str] = None
    product_name: str
    quantity: float = Field(gt=0)
    unit: str = ""
    observed_stock: Optional[float] = None  # stock que le cuisinier voit (informatif)
    note: str = ""


class NeedCreate(BaseModel):
    requested_by: str
    items: list[NeedLine] = Field(..., min_length=1)
    urgency: str = Field("normal", description="normal | urgent")
    notes: str = ""


@router.get("/cuisine/products")
async def list_cuisine_products(search: str = ""):
    """Catalogue minimal pour la saisie 'Besoin cuisine' du cuisinier.

    IMPORTANT : ne retourne PAS la quantité ni le statut du stock administratif.
    Le cuisinier doit gérer son propre inventaire via `/cuisine/inventory`.
    Cette route sert uniquement à proposer un dropdown de NOMS de produits.
    """
    # Par défaut, on inclut tous les produits actifs hors magasin (zone null/cuisine/None).
    # Le magasin est exclu car c'est l'inventaire général, pas le périmètre du cuisinier.
    q = {"is_active": True, "storage_zone": {"$ne": "magasin"}}
    if search:
        import re as _re
        q["name"] = {"$regex": _re.escape(search), "$options": "i"}
    products = await db.stock_products.find(
        q,
        {"_id": 0, "id": 1, "name": 1, "unit": 1}  # SANS quantity ni statut
    ).sort("name", 1).to_list(2000)
    return {"total": len(products), "products": products}


# ==================== STOCK PERSONNEL DU CUISINIER ====================
# Le cuisinier renseigne et voit son propre inventaire (séparé du stock admin).
# Collection : cuisine_inventory
#   { id, product_name, unit, quantity, low_threshold, owner, notes,
#     created_at, updated_at, last_observed_at, history: [{at, qty, by, action}] }

class InventoryItemBody(BaseModel):
    product_name: str
    unit: str = ""
    quantity: float = 0
    low_threshold: float = 0
    notes: str = ""
    owner: str = ""


@router.get("/cuisine/inventory")
async def list_inventory(owner: str = "", search: str = ""):
    """Inventaire perso du cuisinier (séparé du stock admin)."""
    q: dict = {}
    if owner:
        q["owner"] = owner
    if search:
        import re as _re
        q["product_name"] = {"$regex": _re.escape(search), "$options": "i"}
    items = await db.cuisine_inventory.find(q, {"_id": 0}).sort("product_name", 1).to_list(1000)
    # Statistiques rapides
    low_count = sum(1 for it in items if (it.get("low_threshold") or 0) > 0 and (it.get("quantity") or 0) <= (it.get("low_threshold") or 0))
    return {
        "total": len(items),
        "items": items,
        "low_count": low_count,
    }


@router.post("/cuisine/inventory")
async def create_inventory_item(body: InventoryItemBody):
    """Crée une ligne d'inventaire perso. Idempotent par (owner, product_name)."""
    name = (body.product_name or "").strip()
    if not name:
        raise HTTPException(400, "Nom du produit requis")
    owner = (body.owner or "Cuisinier").strip()
    existing = await db.cuisine_inventory.find_one({
        "owner": owner,
        "product_name": {"$regex": f"^{name}$", "$options": "i"}
    })
    if existing:
        raise HTTPException(409, f"'{name}' existe déjà dans votre inventaire")
    now_iso = datetime.now(timezone.utc).isoformat()
    item = {
        "id": str(uuid.uuid4()),
        "owner": owner,
        "product_name": name,
        "unit": (body.unit or "").strip(),
        "quantity": float(body.quantity),
        "low_threshold": float(body.low_threshold),
        "notes": (body.notes or "").strip(),
        "created_at": now_iso,
        "updated_at": now_iso,
        "last_observed_at": now_iso,
        "history": [{
            "at": now_iso,
            "qty": float(body.quantity),
            "by": owner,
            "action": "init",
        }],
    }
    await db.cuisine_inventory.insert_one(item)
    item.pop("_id", None)
    return {"success": True, "item": item}


class InventoryUpdateBody(BaseModel):
    quantity: Optional[float] = None
    low_threshold: Optional[float] = None
    unit: Optional[str] = None
    notes: Optional[str] = None
    by: str = "Cuisinier"
    action: str = "update"  # update | consume | refill


@router.patch("/cuisine/inventory/{item_id}")
async def update_inventory_item(item_id: str, body: InventoryUpdateBody):
    """Met à jour une ligne d'inventaire. La quantité crée une entrée dans l'historique."""
    item = await db.cuisine_inventory.find_one({"id": item_id})
    if not item:
        raise HTTPException(404, "Produit introuvable")
    now_iso = datetime.now(timezone.utc).isoformat()
    update: dict = {"updated_at": now_iso}
    push_history = None
    if body.quantity is not None:
        update["quantity"] = float(body.quantity)
        update["last_observed_at"] = now_iso
        push_history = {
            "at": now_iso,
            "qty": float(body.quantity),
            "previous_qty": float(item.get("quantity") or 0),
            "by": (body.by or "Cuisinier").strip() or "Cuisinier",
            "action": body.action or "update",
        }
    if body.low_threshold is not None:
        update["low_threshold"] = float(body.low_threshold)
    if body.unit is not None:
        update["unit"] = (body.unit or "").strip()
    if body.notes is not None:
        update["notes"] = (body.notes or "").strip()

    ops: dict = {"$set": update}
    if push_history:
        # Garde max 50 entrées d'historique
        ops["$push"] = {"history": {"$each": [push_history], "$slice": -50}}
    await db.cuisine_inventory.update_one({"id": item_id}, ops)
    updated = await db.cuisine_inventory.find_one({"id": item_id}, {"_id": 0})
    return {"success": True, "item": updated}


@router.delete("/cuisine/inventory/{item_id}")
async def delete_inventory_item(item_id: str, owner: str = ""):
    """Suppression d'un produit de l'inventaire perso."""
    q = {"id": item_id}
    if owner:
        q["owner"] = owner
    r = await db.cuisine_inventory.delete_one(q)
    if r.deleted_count == 0:
        raise HTTPException(404, "Produit introuvable")
    return {"success": True}


@router.post("/cuisine/needs")
async def create_need(body: NeedCreate):
    """Cuisinier transmet un besoin à l'administrateur. Crée une alerte (status=pending)."""
    requester = (body.requested_by or "").strip() or "Cuisinier"
    now_iso = datetime.now(timezone.utc).isoformat()
    need = {
        "id": str(uuid.uuid4()),
        "requested_by": requester,
        "requested_at": now_iso,
        "urgency": "urgent" if body.urgency == "urgent" else "normal",
        "status": "pending",
        "items": [it.model_dump() for it in body.items],
        "notes": (body.notes or "").strip(),
        "items_count": len(body.items),
        "total_quantity": sum(float(it.quantity) for it in body.items),
        "seen_at": None,
        "seen_by": None,
        "fulfilled_at": None,
        "fulfilled_by": None,
        "rejection_reason": None,
    }
    await db.cuisine_needs.insert_one(need)
    need.pop("_id", None)
    return {"success": True, "need": need}


@router.get("/cuisine/needs")
async def list_needs(status: Optional[str] = None, requested_by: Optional[str] = None, limit: int = 100):
    """Liste les besoins. Filtres optionnels par statut et par cuisinier."""
    q = {}
    if status:
        q["status"] = status
    if requested_by:
        q["requested_by"] = requested_by
    items = await db.cuisine_needs.find(q, {"_id": 0}).sort("requested_at", -1).to_list(min(int(limit), 500))
    counts_pipeline = [{"$group": {"_id": "$status", "n": {"$sum": 1}}}]
    counts = {c["_id"]: c["n"] async for c in db.cuisine_needs.aggregate(counts_pipeline)}
    return {
        "items": items,
        "total": len(items),
        "counts_by_status": counts,
        "pending_count": counts.get("pending", 0),
        "urgent_pending_count": await db.cuisine_needs.count_documents({"status": "pending", "urgency": "urgent"}),
    }


@router.patch("/cuisine/needs/{need_id}")
async def update_need_status(need_id: str, payload: dict):
    """Admin met à jour le statut d'un besoin (seen / fulfilled / rejected)."""
    actor_role = (payload.get("actor_role") or "").strip()
    if actor_role not in ("admin", "manager"):
        raise HTTPException(403, "Action réservée")
    new_status = (payload.get("status") or "").strip()
    if new_status not in ("seen", "fulfilled", "rejected", "pending"):
        raise HTTPException(400, "Statut invalide")
    need = await db.cuisine_needs.find_one({"id": need_id}, {"_id": 0})
    if not need:
        raise HTTPException(404, "Besoin introuvable")

    actor_name = (payload.get("actor_name") or "Admin").strip()
    now_iso = datetime.now(timezone.utc).isoformat()
    update = {"status": new_status}
    if new_status == "seen":
        update["seen_at"] = now_iso
        update["seen_by"] = actor_name
    elif new_status == "fulfilled":
        update["fulfilled_at"] = now_iso
        update["fulfilled_by"] = actor_name
        if not need.get("seen_at"):
            update["seen_at"] = now_iso
            update["seen_by"] = actor_name
    elif new_status == "rejected":
        update["rejection_reason"] = (payload.get("rejection_reason") or "Refusé").strip()
        update["fulfilled_at"] = now_iso
        update["fulfilled_by"] = actor_name

    await db.cuisine_needs.update_one({"id": need_id}, {"$set": update})
    updated = await db.cuisine_needs.find_one({"id": need_id}, {"_id": 0})
    return {"success": True, "need": updated}


@router.delete("/cuisine/needs/{need_id}")
async def delete_need(need_id: str, actor_role: str = ""):
    if actor_role not in ("admin", "cuisinier"):
        raise HTTPException(403, "Action réservée")
    need = await db.cuisine_needs.find_one({"id": need_id})
    if not need:
        raise HTTPException(404, "Besoin introuvable")
    # Cuisinier ne peut supprimer que ses propres besoins pending
    if actor_role == "cuisinier" and need.get("status") != "pending":
        raise HTTPException(400, "Vous ne pouvez supprimer qu'un besoin en attente")
    await db.cuisine_needs.delete_one({"id": need_id})
    return {"success": True}
