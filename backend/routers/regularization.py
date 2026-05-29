"""
Régularisation des bons — Création rétroactive ou modification de date.

Endpoints :
  - POST  /api/regularization/create-invoice    (Admin + Resp. Op.)
      Crée un bon à une date passée (max 7j). Choix du CA cible.
  - PATCH /api/regularization/update-invoice-date/{invoice_id}  (Admin uniquement)
      Modifie la date d'un bon existant.

Règles métier :
  - Plage : aujourd'hui-7j ≤ target_date ≤ aujourd'hui
  - Motif obligatoire (regularization_reason)
  - Si la journée cible est CLÔTURÉE (Z imprimé), exiger confirm_post_closure=true
  - Marqueurs : is_regularized=true + regularization_target_date (CA imputé à cette date)
  - Audit log automatique
"""
from datetime import datetime, timezone, timedelta, date as date_cls
from typing import Optional, List
import os
import uuid
import logging

from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)
router = APIRouter(tags=["regularization"])

mongo_url = os.environ.get("MONGO_URL")
db_name = os.environ.get("DB_NAME")
db_client = AsyncIOMotorClient(mongo_url)
db = db_client[db_name]

MAX_BACKDATE_DAYS = 7


def _parse_date(s: str) -> date_cls:
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(400, "Format de date invalide (YYYY-MM-DD)")


def _validate_target_date(target_date_str: str) -> str:
    """Vérifie que la date cible est dans la plage autorisée (≤ aujourd'hui, ≥ J-7).
    Retourne la date au format YYYY-MM-DD."""
    target = _parse_date(target_date_str)
    today = datetime.now(timezone.utc).date()
    if target > today:
        raise HTTPException(400, "Impossible de régulariser une date future")
    delta = (today - target).days
    if delta > MAX_BACKDATE_DAYS:
        raise HTTPException(
            400,
            f"Date trop ancienne. Régularisation autorisée jusqu'à {MAX_BACKDATE_DAYS} jours en arrière (max : {(today - timedelta(days=MAX_BACKDATE_DAYS)).isoformat()})"
        )
    return target.isoformat()


async def _is_day_closed(day_str: str) -> bool:
    """True si une fermeture (Z) existe pour ce jour."""
    closure = await db.day_closures.find_one({"date": day_str}, {"_id": 0, "status": 1})
    return bool(closure)


async def _log_regul_audit(invoice_doc: dict, action: str, actor: dict, extra: Optional[dict] = None):
    try:
        entry = {
            "id": str(uuid.uuid4()),
            "entity_type": "invoice",
            "entity_id": invoice_doc.get("id"),
            "invoice_number": invoice_doc.get("invoice_number"),
            "table_number": invoice_doc.get("table_number"),
            "action": action,  # "regularize_create" | "regularize_update_date"
            "actor_name": actor.get("name") or "—",
            "actor_role": actor.get("role") or "manager",
            "actor_id": actor.get("user_id"),
            "changes": extra or {},
            "snapshot": {
                "total": invoice_doc.get("total"),
                "subtotal": invoice_doc.get("subtotal"),
                "items": invoice_doc.get("items") or [],
                "items_count": len(invoice_doc.get("items") or []),
                "validation_status": invoice_doc.get("validation_status"),
                "payment_method": invoice_doc.get("payment_method"),
                "client_name": invoice_doc.get("customer_name"),
                "invoice_number": invoice_doc.get("invoice_number"),
                "table_number": invoice_doc.get("table_number"),
                "is_regularized": True,
                "regularization_target_date": invoice_doc.get("regularization_target_date"),
                "regularization_reason": invoice_doc.get("regularization_reason"),
                "totals_by_department": invoice_doc.get("totals_by_department"),
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.audit_logs.insert_one(entry)
    except Exception as e:
        logger.error(f"Regularization audit log failed: {e}")


# ─────────────── Models ───────────────

class RegularizeCreateBody(BaseModel):
    target_date: str = Field(..., description="Date du bon (YYYY-MM-DD) — celle où la vente a EU lieu")
    impute_ca_to: str = Field(
        "target_date",
        description="'target_date' : impute le CA à la date cible (rétroactif). 'today' : impute au CA du jour avec mention 'Régularisation du XX/XX'."
    )
    items: List[dict]
    subtotal: float
    discount: Optional[float] = 0
    discount_amount: Optional[float] = 0
    total: float
    payment_method: Optional[str] = "cash"
    customer_name: Optional[str] = ""
    customer_phone: Optional[str] = ""
    table_number: Optional[int] = None
    totals_by_department: Optional[dict] = None
    notes: Optional[str] = ""
    regularization_reason: str = Field(..., min_length=3, description="Motif obligatoire de la régularisation")
    confirm_post_closure: Optional[bool] = False
    actor_name: str
    actor_role: str  # "admin" | "manager"
    validation_status: Optional[str] = "validated"  # défaut: validée immédiatement


class RegularizeUpdateDateBody(BaseModel):
    new_target_date: str
    impute_ca_to: str = "target_date"
    regularization_reason: str = Field(..., min_length=3)
    confirm_post_closure: Optional[bool] = False
    actor_name: str
    actor_role: str  # MUST be "admin" pour ce endpoint


# ─────────────── Endpoints ───────────────

@router.post("/regularization/create-invoice")
async def regularize_create_invoice(body: RegularizeCreateBody):
    """Crée un bon rétroactif. Accessible Admin + Resp. Op.."""
    if body.actor_role not in ("admin", "manager"):
        raise HTTPException(403, "Action réservée à l'administrateur ou à la Responsable des Opérations")

    target_iso = _validate_target_date(body.target_date)
    today_iso = datetime.now(timezone.utc).date().isoformat()

    # Vérifier la journée cible
    target_closed = await _is_day_closed(target_iso)
    if target_closed and not body.confirm_post_closure:
        raise HTTPException(
            423,
            f"La journée {target_iso} est clôturée (Z imprimé). Demandez à l'administrateur de confirmer la régularisation post-clôture."
        )

    # Pour le CA, si "today", on stocke avec date du jour mais on marque l'origine
    ca_date = target_iso if body.impute_ca_to == "target_date" else today_iso

    # Génération du numéro de facture basé sur la date du bon (cohérence chronologique)
    yyyymmdd = target_iso.replace("-", "")
    count = await db.invoices.count_documents({"created_at": {"$regex": f"^{target_iso}"}})
    invoice_number = f"EM-{yyyymmdd}-{count + 1:04d}-R"  # suffixe -R pour "Régularisation"

    # Timestamps : on utilise la date cible à 12h00 UTC (milieu de journée) pour created_at
    created_at_dt = datetime.combine(_parse_date(target_iso), datetime.min.time()).replace(
        hour=12, tzinfo=timezone.utc
    )
    created_at_iso = created_at_dt.isoformat()

    invoice = {
        "id": str(uuid.uuid4()),
        "invoice_number": invoice_number,
        "customer_name": body.customer_name or "",
        "customer_phone": body.customer_phone or "",
        "items": body.items,
        "subtotal": float(body.subtotal),
        "discount": float(body.discount or 0),
        "discount_amount": float(body.discount_amount or 0),
        "total": float(body.total),
        "payment_method": body.payment_method or "cash",
        "totals_by_department": body.totals_by_department or {},
        "notes": body.notes or "",
        "created_by": body.actor_name,
        "table_number": body.table_number,
        "validation_status": body.validation_status or "validated",
        "validated_by": body.actor_name if body.validation_status == "validated" else "",
        "validated_at": datetime.now(timezone.utc).isoformat() if body.validation_status == "validated" else "",
        "created_at": created_at_iso,
        # ── Marqueurs régularisation ──
        "is_regularized": True,
        "regularization_target_date": target_iso,
        "regularization_ca_date": ca_date,
        "regularization_reason": body.regularization_reason,
        "regularized_by": body.actor_name,
        "regularized_by_role": body.actor_role,
        "regularized_at": datetime.now(timezone.utc).isoformat(),
        "regularization_post_closure": bool(target_closed),
    }
    await db.invoices.insert_one(invoice)
    invoice.pop("_id", None)

    await _log_regul_audit(
        invoice, "regularize_create",
        {"name": body.actor_name, "role": body.actor_role},
        {"target_date": target_iso, "impute_ca_to": body.impute_ca_to, "reason": body.regularization_reason},
    )

    return {
        "success": True,
        "invoice": invoice,
        "warnings": ["Journée cible clôturée — confirmation post-clôture acceptée"] if target_closed else [],
    }


@router.patch("/regularization/update-invoice-date/{invoice_id}")
async def regularize_update_date(invoice_id: str, body: RegularizeUpdateDateBody):
    """Modifie la date d'imputation d'un bon existant. ADMIN uniquement."""
    if body.actor_role != "admin":
        raise HTTPException(403, "La modification de date d'un bon existant est réservée à l'administrateur")

    invoice = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(404, "Bon introuvable")

    new_target_iso = _validate_target_date(body.new_target_date)
    today_iso = datetime.now(timezone.utc).date().isoformat()

    # Vérifier clôtures sur l'ancienne ET la nouvelle date
    new_closed = await _is_day_closed(new_target_iso)
    if new_closed and not body.confirm_post_closure:
        raise HTTPException(
            423,
            f"La journée {new_target_iso} est clôturée. Confirmez la régularisation post-clôture."
        )

    old_created_at = invoice.get("created_at")
    new_created_dt = datetime.combine(_parse_date(new_target_iso), datetime.min.time()).replace(
        hour=12, tzinfo=timezone.utc
    )
    new_created_iso = new_created_dt.isoformat()
    ca_date = new_target_iso if body.impute_ca_to == "target_date" else today_iso

    patch = {
        "created_at": new_created_iso,
        "is_regularized": True,
        "regularization_target_date": new_target_iso,
        "regularization_ca_date": ca_date,
        "regularization_reason": body.regularization_reason,
        "regularized_by": body.actor_name,
        "regularized_by_role": "admin",
        "regularized_at": datetime.now(timezone.utc).isoformat(),
        "regularization_post_closure": bool(new_closed),
    }
    await db.invoices.update_one({"id": invoice_id}, {"$set": patch})

    refreshed = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    await _log_regul_audit(
        refreshed, "regularize_update_date",
        {"name": body.actor_name, "role": "admin"},
        {"old_created_at": old_created_at, "new_target_date": new_target_iso,
         "impute_ca_to": body.impute_ca_to, "reason": body.regularization_reason},
    )
    return {
        "success": True,
        "invoice": refreshed,
        "warnings": ["Journée cible clôturée — confirmation post-clôture acceptée"] if new_closed else [],
    }


@router.get("/regularization/list")
async def regularization_list(start_date: Optional[str] = None, end_date: Optional[str] = None, limit: int = 200):
    """Liste les factures régularisées récentes (pour vue audit / suivi)."""
    q = {"is_regularized": True}
    if start_date and end_date:
        q["regularization_target_date"] = {"$gte": start_date, "$lte": end_date}
    items = await db.invoices.find(q, {"_id": 0}).sort("regularized_at", -1).to_list(limit)
    return {"total": len(items), "items": items}
