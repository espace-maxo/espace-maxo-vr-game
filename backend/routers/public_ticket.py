"""
Public Ticket Router — accès public (sans auth) au ticket BON CLIENT.

Workflow QR code :
1. Le ticket BON CLIENT imprimé contient un QR pointant vers /ticket/{invoice_id}
2. Le client scanne → page web publique affichant son ticket + formulaire d'avis
3. Soumission d'avis (1-5 étoiles + commentaire) → stocké dans `customer_reviews`
4. Un seul avis par ticket (clé invoice_id)

Cette route est PUBLIQUE — pas d'auth requise. Seul l'ID du ticket est nécessaire.
On ne retourne que les infos minimum nécessaires à l'affichage.
"""
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid

router = APIRouter(prefix="/public", tags=["public_ticket"])

db = None


def set_db(database):
    global db
    db = database


class ReviewInput(BaseModel):
    rating: int = Field(..., ge=1, le=5, description="Note de 1 à 5 étoiles")
    comment: str = Field("", max_length=1000)
    customer_name: str = Field("", max_length=120)
    customer_phone: str = Field("", max_length=40)


def _sanitize_invoice_for_public(inv: Dict[str, Any]) -> Dict[str, Any]:
    """Retourne uniquement les champs visibles publiquement sur un ticket."""
    return {
        "id": inv.get("id"),
        "invoice_number": inv.get("invoice_number"),
        "bon_number": inv.get("bon_number"),
        "customer_name": inv.get("customer_name") or "Client",
        "items": [
            {
                "name": it.get("name"),
                "quantity": it.get("quantity"),
                "price": it.get("price"),
                "department": it.get("department"),
            }
            for it in (inv.get("items") or [])
        ],
        "subtotal": inv.get("subtotal"),
        "discount": inv.get("discount"),
        "discount_amount": inv.get("discount_amount"),
        "total": inv.get("total"),
        "payment_method": inv.get("payment_method"),
        "table_number": inv.get("table_number"),
        "created_at": inv.get("created_at"),
        "validated_at": inv.get("validated_at"),
    }


@router.get("/ticket/{invoice_id}")
async def get_public_ticket(invoice_id: str):
    """Lecture publique d'un ticket BON CLIENT. Pas d'auth.

    Conditions :
    - L'invoice doit exister
    - Elle doit être validée (validation_status == 'validated') — pas d'accès aux pending
    - Elle ne doit pas être annulée
    """
    if db is None:
        raise HTTPException(status_code=500, detail="DB not initialized")

    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Ticket introuvable")

    if inv.get("validation_status") != "validated":
        raise HTTPException(
            status_code=404,
            detail="Ce ticket n'est pas (encore) disponible. Il sera consultable après validation par notre équipe."
        )

    # Charger l'avis existant si déjà soumis
    review = await db.customer_reviews.find_one(
        {"invoice_id": invoice_id}, {"_id": 0}
    )

    return {
        "ticket": _sanitize_invoice_for_public(inv),
        "review": review,
        "review_submitted": review is not None,
    }


@router.post("/ticket/{invoice_id}/review")
async def submit_public_review(invoice_id: str, payload: ReviewInput = Body(...)):
    """Soumettre un avis client pour un ticket (1 avis max par ticket)."""
    if db is None:
        raise HTTPException(status_code=500, detail="DB not initialized")

    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Ticket introuvable")
    if inv.get("validation_status") != "validated":
        raise HTTPException(status_code=400, detail="Ticket non validé")

    existing = await db.customer_reviews.find_one({"invoice_id": invoice_id})
    if existing:
        raise HTTPException(
            status_code=409,
            detail="Un avis a déjà été déposé pour ce ticket. Merci !"
        )

    review_doc = {
        "id": str(uuid.uuid4()),
        "invoice_id": invoice_id,
        "invoice_number": inv.get("invoice_number"),
        "bon_number": inv.get("bon_number"),
        "table_number": inv.get("table_number"),
        "total": inv.get("total"),
        "rating": int(payload.rating),
        "comment": (payload.comment or "").strip(),
        "customer_name": (payload.customer_name or inv.get("customer_name") or "").strip() or "Client",
        "customer_phone": (payload.customer_phone or "").strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_read": False,
        "is_archived": False,
    }
    await db.customer_reviews.insert_one(review_doc)

    return {
        "success": True,
        "review": {k: v for k, v in review_doc.items() if k != "_id"},
        "message": "Merci pour votre retour !",
    }


@router.get("/reviews")
async def list_reviews(
    limit: int = 200,
    only_unread: bool = False,
    min_rating: Optional[int] = None,
    max_rating: Optional[int] = None,
):
    """Liste des avis clients (consultation Admin/Resp. Op.).

    Cette route reste sous /public pour cohérence mais n'expose aucune info sensible.
    Les filtres permettent la modération.
    """
    if db is None:
        raise HTTPException(status_code=500, detail="DB not initialized")

    query: Dict[str, Any] = {}
    if only_unread:
        query["is_read"] = False
    if min_rating is not None:
        query.setdefault("rating", {})["$gte"] = int(min_rating)
    if max_rating is not None:
        query.setdefault("rating", {})["$lte"] = int(max_rating)

    items = await db.customer_reviews.find(query, {"_id": 0}).sort("created_at", -1).to_list(min(int(limit), 1000))

    total = await db.customer_reviews.count_documents({})
    unread = await db.customer_reviews.count_documents({"is_read": False})
    avg_pipeline = [{"$group": {"_id": None, "avg": {"$avg": "$rating"}}}]
    avg_doc = await db.customer_reviews.aggregate(avg_pipeline).to_list(1)
    avg = round(avg_doc[0]["avg"], 2) if avg_doc else None

    return {
        "items": items,
        "total": total,
        "unread": unread,
        "average_rating": avg,
    }


@router.post("/reviews/{review_id}/read")
async def mark_review_read(review_id: str):
    """Marque un avis comme lu."""
    if db is None:
        raise HTTPException(status_code=500, detail="DB not initialized")
    r = await db.customer_reviews.update_one(
        {"id": review_id},
        {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Avis introuvable")
    return {"success": True}
