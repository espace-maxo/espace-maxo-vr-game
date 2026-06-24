"""
Caisse Pro - Product Workflow Routes (Mar 2026)
================================================

Endpoints supplémentaires liés au catalogue Caisse :
- Workflow d'approbation des produits créés par un non-admin
- Détection et suppression des doublons

Les routes CRUD de base (POST/GET/PUT/DELETE /caisse/products) restent dans
`server.py` car elles gèrent aussi des notifications transverses (menu_notifications).
"""
from typing import Optional, List
from datetime import datetime, timezone
import logging
import re
import unicodedata

from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Caisse Products Workflow"])

# Database reference (injected by server.py)
db = None


def set_db(database):
    global db
    db = database


# ─────────────── Helpers ───────────────

def _norm(name: str) -> str:
    """Nom normalisé : lower + strip + sans accents + espaces collapsés."""
    s = (name or "").strip().lower()
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
    s = re.sub(r"\s+", " ", s)
    return s


async def _count_history(name: str, product_id: str) -> int:
    """Estime l'historique d'un produit (factures + dépenses)."""
    inv_count = await db.invoices.count_documents({
        "$or": [
            {"items.product_id": product_id},
            {"items.name": name},
        ]
    })
    exp_count = await db.expenses.count_documents({
        "$or": [
            {"items.product_id": product_id},
            {"items.name": name},
            {"items.description": name},
        ]
    })
    return inv_count + exp_count


# ─────────────── Models ───────────────

class RejectBody(BaseModel):
    reason: Optional[str] = ""
    actor_name: Optional[str] = ""


class ApproveBody(BaseModel):
    actor_name: Optional[str] = ""


class DedupBody(BaseModel):
    dry_run: bool = False
    actor_name: Optional[str] = ""


# ─────────────── Approval ───────────────

@router.get("/caisse/products/pending")
async def list_pending_products():
    """Liste des produits Caisse en attente d'approbation par l'Admin."""
    try:
        items = await db.caisse_products.find(
            {"status": "pending"}, {"_id": 0}
        ).sort("created_at", -1).to_list(500)
        return {"products": items, "total": len(items)}
    except Exception as e:
        logger.error(f"Error listing pending products: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/caisse/products/{product_id}/approve")
async def approve_caisse_product(product_id: str, body: ApproveBody = Body(default=ApproveBody())):
    """L'admin approuve un produit en attente."""
    try:
        existing = await db.caisse_products.find_one({"id": product_id}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="Produit non trouvé")
        if existing.get("status") == "approved":
            return {"success": True, "already_approved": True}
        now = datetime.now(timezone.utc).isoformat()
        await db.caisse_products.update_one(
            {"id": product_id},
            {"$set": {
                "status": "approved",
                "approved_by": body.actor_name or "Admin",
                "approved_at": now,
                "rejected_by": "",
                "rejected_at": "",
                "rejection_reason": "",
            }},
        )
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving product: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/caisse/products/{product_id}/reject")
async def reject_caisse_product(product_id: str, body: RejectBody = Body(default=RejectBody())):
    """L'admin rejette un produit en attente. Le produit est supprimé, et une
    trace est conservée dans la collection d'audit `caisse_products_rejections`.
    """
    try:
        existing = await db.caisse_products.find_one({"id": product_id}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="Produit non trouvé")
        await db.caisse_products.delete_one({"id": product_id})
        await db.caisse_products_rejections.insert_one({
            "product_id": product_id,
            "name": existing.get("name"),
            "price": existing.get("price"),
            "department": existing.get("department"),
            "category": existing.get("category"),
            "created_by": existing.get("created_by"),
            "created_by_role": existing.get("created_by_role"),
            "rejected_by": body.actor_name or "Admin",
            "rejected_at": datetime.now(timezone.utc).isoformat(),
            "reason": (body.reason or "").strip(),
        })
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rejecting product: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────── Déduplication ───────────────

@router.get("/caisse/products/duplicates")
async def find_duplicate_products():
    """Détecte les doublons (nom normalisé) et renvoie les groupes."""
    try:
        all_products = await db.caisse_products.find({}, {"_id": 0}).to_list(2000)
        groups = {}
        for p in all_products:
            k = _norm(p.get("name"))
            if not k:
                continue
            groups.setdefault(k, []).append(p)

        dup_groups = []
        for k, items in groups.items():
            if len(items) < 2:
                continue
            enriched = []
            for it in items:
                hist = await _count_history(it.get("name", ""), it.get("id", ""))
                enriched.append({**it, "_history_count": hist})
            enriched.sort(key=lambda x: (-x["_history_count"], x.get("created_at") or ""))
            dup_groups.append({
                "normalized": k,
                "count": len(enriched),
                "items": enriched,
                "keeper_id": enriched[0]["id"],
            })
        return {"groups": dup_groups, "total_groups": len(dup_groups)}
    except Exception as e:
        logger.error(f"Error finding duplicates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/caisse/products/deduplicate")
async def deduplicate_products(body: DedupBody = Body(default=DedupBody())):
    """Supprime les doublons en gardant le produit avec le plus d'historique.

    - Critère de regroupement : nom normalisé (lower + sans accents + espaces collapsés).
    - Conservation : produit avec le plus d'historique (factures + dépenses).
      En cas d'égalité, le plus ancien gagne.
    - `dry_run=true` : renvoie le plan sans rien supprimer.
    """
    try:
        all_products = await db.caisse_products.find({}, {"_id": 0}).to_list(2000)
        groups = {}
        for p in all_products:
            k = _norm(p.get("name"))
            if not k:
                continue
            groups.setdefault(k, []).append(p)

        plan = []
        removed_ids: List[str] = []
        for k, items in groups.items():
            if len(items) < 2:
                continue
            enriched = []
            for it in items:
                hist = await _count_history(it.get("name", ""), it.get("id", ""))
                enriched.append({**it, "_history_count": hist})
            enriched.sort(key=lambda x: (-x["_history_count"], x.get("created_at") or ""))
            keeper = enriched[0]
            losers = enriched[1:]
            plan.append({
                "normalized": k,
                "keeper": {
                    "id": keeper["id"],
                    "name": keeper.get("name"),
                    "history": keeper["_history_count"],
                },
                "removed": [
                    {"id": l["id"], "name": l.get("name"), "history": l["_history_count"]}
                    for l in losers
                ],
            })
            removed_ids.extend([l["id"] for l in losers])

        deleted_count = 0
        if not body.dry_run and removed_ids:
            r = await db.caisse_products.delete_many({"id": {"$in": removed_ids}})
            deleted_count = r.deleted_count
            await db.caisse_products_dedup_logs.insert_one({
                "ran_at": datetime.now(timezone.utc).isoformat(),
                "actor_name": body.actor_name or "",
                "deleted_count": deleted_count,
                "groups": plan,
            })

        return {
            "success": True,
            "dry_run": body.dry_run,
            "groups": plan,
            "candidates_removed": len(removed_ids),
            "deleted_count": deleted_count,
        }
    except Exception as e:
        logger.error(f"Error deduplicating products: {e}")
        raise HTTPException(status_code=500, detail=str(e))
