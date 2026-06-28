"""
Field Stock Reports — "Point de stock terrain" du Responsable Op. & Log.

Ce point de stock est INDÉPENDANT du stock système (stock_products). Le Resp Op
saisit librement ce qu'il constate physiquement (typiquement boissons + petits
accessoires hors cuisine) et soumet le rapport en justificatif d'approvisionnement.

L'Admin peut :
  - Consulter tous les rapports
  - Optionnellement « rapprocher » un rapport (ajuste le stock système en créant
    des mouvements d'ajustement basés sur les écarts).
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/field-stock", tags=["field-stock"])
db = None


def set_db(database):
    global db
    db = database


# ==================== MODELS ====================

class FieldStockReportItemIn(BaseModel):
    product_id: str
    counted_qty: float


class FieldStockReportCreate(BaseModel):
    category_ids: List[str] = Field(default_factory=list)
    items: List[FieldStockReportItemIn]
    notes: str = ""


# ==================== ENDPOINTS ====================

@router.post("/reports")
async def create_report(payload: FieldStockReportCreate, x_user_id: Optional[str] = None, x_user_name: Optional[str] = None):
    """Crée un nouveau Point de stock terrain. Snapshot la qty système au moment de la soumission."""
    if not payload.items:
        raise HTTPException(400, "Au moins un produit doit être renseigné")

    # Charger les produits cités pour figer name/unit/qty_systeme
    product_ids = [it.product_id for it in payload.items]
    prods = await db.stock_products.find(
        {"id": {"$in": product_ids}},
        {"_id": 0, "id": 1, "name": 1, "unit": 1, "quantity": 1, "category_id": 1}
    ).to_list(5000)
    by_id = {p["id"]: p for p in prods}

    enriched_items = []
    for it in payload.items:
        p = by_id.get(it.product_id)
        if not p:
            continue  # ignore produit introuvable plutôt que de bloquer
        counted = float(it.counted_qty or 0)
        system_qty = float(p.get("quantity") or 0)
        enriched_items.append({
            "product_id": p["id"],
            "product_name": p.get("name", ""),
            "unit": p.get("unit", ""),
            "category_id": p.get("category_id", ""),
            "counted_qty": counted,
            "system_qty_at_submit": system_qty,
            "ecart": round(counted - system_qty, 3),
        })

    if not enriched_items:
        raise HTTPException(400, "Aucun produit valide trouvé pour ce rapport")

    total_ecart_pos = sum(i["ecart"] for i in enriched_items if i["ecart"] > 0)
    total_ecart_neg = sum(i["ecart"] for i in enriched_items if i["ecart"] < 0)
    rupture_count = sum(1 for i in enriched_items if i["counted_qty"] <= 0)

    report = {
        "id": str(uuid.uuid4()),
        "created_by_id": x_user_id or "unknown",
        "created_by_name": x_user_name or "Resp. Op.",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "submitted",
        "category_ids": payload.category_ids,
        "items": enriched_items,
        "items_count": len(enriched_items),
        "rupture_count": rupture_count,
        "total_ecart_positif": round(total_ecart_pos, 3),
        "total_ecart_negatif": round(total_ecart_neg, 3),
        "notes": payload.notes or "",
        "reconciled_at": None,
        "reconciled_by": None,
        "movements_created": [],
    }
    await db.field_stock_reports.insert_one(report)
    report.pop("_id", None)
    return report


@router.get("/reports")
async def list_reports(role: Optional[str] = None, user_id: Optional[str] = None, limit: int = 100):
    """Liste les rapports. Si role=manager + user_id fourni, ne renvoie que les rapports de l'utilisateur.
    Sinon (admin), renvoie tous les rapports.
    """
    q = {}
    if role == "manager" and user_id:
        q["created_by_id"] = user_id
    docs = await db.field_stock_reports.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    # Allégeons la réponse : on ne renvoie pas tous les items, juste un résumé
    summary = [{
        "id": d["id"],
        "created_by_id": d.get("created_by_id"),
        "created_by_name": d.get("created_by_name"),
        "created_at": d.get("created_at"),
        "status": d.get("status"),
        "items_count": d.get("items_count", len(d.get("items", []))),
        "rupture_count": d.get("rupture_count", 0),
        "total_ecart_positif": d.get("total_ecart_positif", 0),
        "total_ecart_negatif": d.get("total_ecart_negatif", 0),
        "notes": d.get("notes", "")[:140],
        "reconciled_at": d.get("reconciled_at"),
        "reconciled_by": d.get("reconciled_by"),
    } for d in docs]
    return {"reports": summary}


@router.get("/reports/summary")
async def reports_summary():
    """Compteur global utilisé pour le badge UI (Admin)."""
    pending = await db.field_stock_reports.count_documents({"status": "submitted"})
    total = await db.field_stock_reports.count_documents({})
    return {"pending": pending, "total": total}


@router.get("/reports/{report_id}")
async def get_report(report_id: str):
    doc = await db.field_stock_reports.find_one({"id": report_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Rapport introuvable")
    return doc


@router.delete("/reports/{report_id}")
async def delete_report(report_id: str, x_user_id: Optional[str] = None, x_user_role: Optional[str] = None):
    doc = await db.field_stock_reports.find_one({"id": report_id}, {"_id": 0, "created_by_id": 1, "status": 1})
    if not doc:
        raise HTTPException(404, "Rapport introuvable")
    # Resp Op ne peut supprimer que son propre rapport non rapproché
    if x_user_role != "admin":
        if doc.get("created_by_id") != x_user_id:
            raise HTTPException(403, "Vous ne pouvez supprimer que vos propres rapports")
        if doc.get("status") == "reconciled":
            raise HTTPException(409, "Un rapport rapproché ne peut plus être supprimé")
    await db.field_stock_reports.delete_one({"id": report_id})
    return {"deleted": True}


@router.post("/reports/{report_id}/reconcile")
async def reconcile_report(report_id: str, x_user_name: Optional[str] = None):
    """Rapproche le stock système au point de stock terrain : crée un mouvement d'ajustement
    pour chaque ligne avec un écart non nul."""
    doc = await db.field_stock_reports.find_one({"id": report_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Rapport introuvable")
    if doc.get("status") == "reconciled":
        raise HTTPException(409, "Rapport déjà rapproché")

    movement_ids = []
    now_iso = datetime.now(timezone.utc).isoformat()
    operator = x_user_name or "Admin"

    for item in doc.get("items", []):
        ecart = float(item.get("ecart") or 0)
        if abs(ecart) < 1e-9:
            continue
        pid = item.get("product_id")
        product = await db.stock_products.find_one({"id": pid}, {"_id": 0, "id": 1, "quantity": 1, "unit": 1, "name": 1})
        if not product:
            continue
        prev_qty = float(product.get("quantity") or 0)
        new_qty = round(prev_qty + ecart, 3)
        mvt = {
            "id": str(uuid.uuid4()),
            "product_id": pid,
            "product_name": product.get("name", item.get("product_name", "")),
            "movement_type": "ajustement",
            "quantity": abs(ecart),
            "unit": product.get("unit", item.get("unit", "")),
            "previous_quantity": prev_qty,
            "new_quantity": new_qty,
            "reason": f"Rapprochement Point de stock terrain ({doc.get('created_by_name', 'Resp. Op.')}) — réf {report_id[:8]}",
            "user_name": operator,
            "created_at": now_iso,
            "source": "field_stock_reconcile",
            "source_ref": report_id,
        }
        await db.stock_movements.insert_one(mvt)
        await db.stock_products.update_one(
            {"id": pid},
            {"$set": {"quantity": new_qty, "updated_at": now_iso}}
        )
        movement_ids.append(mvt["id"])

    await db.field_stock_reports.update_one(
        {"id": report_id},
        {"$set": {
            "status": "reconciled",
            "reconciled_at": now_iso,
            "reconciled_by": operator,
            "movements_created": movement_ids,
        }}
    )
    return {"reconciled": True, "movements_count": len(movement_ids), "movement_ids": movement_ids}
