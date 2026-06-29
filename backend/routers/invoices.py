"""
Invoices Router - Toute la logique de facturation Caisse Pro.
Endpoints : CRUD factures, update-items, PDF, assign-week (+ bulk).
Le PUT /invoices/{id} contient aussi la synchronisation avec les tables et le module Stock.
"""
from fastapi import APIRouter, HTTPException, Query, Body
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict
import uuid
import re
import io
import logging

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

# Cross-router helper for cash closure lock
try:
    from routers.cash_closures import is_date_closed, _date_from_iso
except Exception:  # pragma: no cover
    async def is_date_closed(_d):
        return None
    def _date_from_iso(s):
        return (str(s) or "")[:10] if s else None

router = APIRouter(tags=["invoices"])
db = None
logger = logging.getLogger(__name__)


def set_db(database):
    global db
    db = database


def _diff_invoice(before: dict, after_patch: dict) -> dict:
    """Compute a compact field-level diff between the previous invoice doc and the
    incoming patch (only the fields the user actually changed).
    Returns {field: {"from": old_value, "to": new_value}}.
    Sensitive/internal fields (_id, updated_at) are filtered out.
    """
    skip = {"_id", "updated_at"}
    out = {}
    for k, v in (after_patch or {}).items():
        if k in skip:
            continue
        old = before.get(k) if before else None
        if k == "items":
            # For items, summarise to (count, total_qty, total_amount) to keep payload small
            old_summary = {
                "count": len(old or []),
                "qty": sum(float(i.get("quantity") or 0) for i in (old or [])),
                "amount": sum(float(i.get("price") or 0) * float(i.get("quantity") or 0) for i in (old or [])),
            }
            new_summary = {
                "count": len(v or []),
                "qty": sum(float(i.get("quantity") or 0) for i in (v or [])),
                "amount": sum(float(i.get("price") or 0) * float(i.get("quantity") or 0) for i in (v or [])),
            }
            if old_summary != new_summary:
                out[k] = {"from": old_summary, "to": new_summary}
            continue
        if old != v:
            out[k] = {"from": old, "to": v}
    return out


async def _log_audit(
    entity_type: str,
    entity_doc: dict,
    action: str,
    actor: dict | None,
    changes: dict | None = None,
):
    """Persist a unified audit line for an invoice or table (bon) modification.

    entity_type: "invoice" | "table"
    actor: {"name": str, "role": str, "user_id": Optional[str]}
    action: "create" | "update" | "delete" | "validate" | "cancel"
    """
    try:
        if db is None:
            return
        entry = {
            "id": str(uuid.uuid4()),
            "entity_type": entity_type,
            "entity_id": entity_doc.get("id"),
            "invoice_number": entity_doc.get("invoice_number"),
            "table_number": entity_doc.get("table_number"),
            "action": action,
            "actor_name": (actor or {}).get("name") or entity_doc.get("created_by") or entity_doc.get("server_name") or "—",
            "actor_role": (actor or {}).get("role") or "manager",
            "actor_id": (actor or {}).get("user_id"),
            "changes": changes or {},
            "snapshot": {
                "total": entity_doc.get("total"),
                "subtotal": entity_doc.get("subtotal"),
                "discount": entity_doc.get("discount"),
                "discount_amount": entity_doc.get("discount_amount"),
                "items": entity_doc.get("items") or [],
                "items_count": len(entity_doc.get("items") or []),
                "validation_status": entity_doc.get("validation_status"),
                "payment_method": entity_doc.get("payment_method"),
                "client_name": entity_doc.get("client_name") or entity_doc.get("customer_name"),
                "server_name": entity_doc.get("server_name"),
                "table_number": entity_doc.get("table_number"),
                "invoice_number": entity_doc.get("invoice_number"),
                "created_at": entity_doc.get("created_at"),
                "validated_at": entity_doc.get("validated_at"),
                "totals_by_department": entity_doc.get("totals_by_department"),
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.audit_logs.insert_one(entry)
    except Exception as e:
        # Never break a write because of audit logging
        logger.error(f"audit log failed: {e}")


# Backward-compat alias used elsewhere in this router
async def _log_invoice_audit(invoice_doc: dict, action: str, actor: dict | None, changes: dict | None = None):
    await _log_audit("invoice", invoice_doc, action, actor, changes)


# ==================== MODELS ====================

class InvoiceItemCreate(BaseModel):
    id: str
    name: str
    price: float
    quantity: int
    department: str
    unit: str = "unité"


class InvoiceCreate(BaseModel):
    customer_name: str = "Client"
    customer_phone: str = ""
    items: List[Dict]
    subtotal: float
    discount: float = 0
    discount_amount: float = 0
    total: float
    payment_method: str = "cash"
    totals_by_department: Dict = {}
    notes: str = ""
    created_by: str = ""
    validation_status: str = "pending"
    # Auto-validation à l'émission du bon client (optionnel)
    validated_by: str = ""
    validated_at: str = ""
    table_number: Optional[int] = None


class Invoice(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_number: str = ""
    bon_number: str = ""  # Numéro de bon client (BON-YYYYMMDD-NNNN) si issue d'une table
    customer_name: str = "Client"
    customer_phone: str = ""
    items: List[Dict] = []
    subtotal: float = 0.0
    discount: float = 0
    discount_amount: float = 0
    total: float = 0.0
    payment_method: str = "cash"
    payment_status: str = "paid"
    totals_by_department: Dict = {}
    notes: str = ""
    created_by: str = ""
    validation_status: str = "pending"
    validated_by: str = ""
    validated_at: str = ""
    table_number: Optional[int] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ==================== CRUD ====================

@router.post("/invoices")
async def create_invoice(
    invoice_data: InvoiceCreate,
    actor_name: Optional[str] = Query(None),
    actor_role: Optional[str] = Query(None),
):
    """Create a new invoice"""
    try:
        # === Garde-fou : journée du jour DOIT être ouverte (strict) ===
        # Bypass pour les ventes "tagged-date" (back-fill) via `assigned_date` ? non, on bloque sur today.
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        opening = await db.day_openings.find_one({"date": today_str}, {"_id": 0, "status": 1})
        if not opening or opening.get("status") != "open":
            raise HTTPException(
                status_code=423,  # 423 Locked
                detail="La journée n'est pas ouverte. La Responsable Op. & Log doit ouvrir la journée avant toute saisie de vente."
            )

        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        count = await db.invoices.count_documents({
            "created_at": {"$regex": f"^{datetime.now(timezone.utc).strftime('%Y-%m-%d')}"}
        })
        invoice_number = f"EM-{today}-{count + 1:04d}"

        # Génération auto du numéro de bon client si la facture est issue d'une table
        bon_number = ""
        if invoice_data.table_number is not None:
            bon_count = await db.invoices.count_documents({
                "bon_number": {"$regex": f"^BON-{today}-"}
            })
            bon_number = f"BON-{today}-{bon_count + 1:04d}"

        invoice = Invoice(
            invoice_number=invoice_number,
            bon_number=bon_number,
            customer_name=invoice_data.customer_name,
            customer_phone=invoice_data.customer_phone,
            items=invoice_data.items,
            subtotal=invoice_data.subtotal,
            discount=invoice_data.discount,
            discount_amount=invoice_data.discount_amount,
            total=invoice_data.total,
            payment_method=invoice_data.payment_method,
            totals_by_department=invoice_data.totals_by_department,
            notes=invoice_data.notes,
            created_by=invoice_data.created_by,
            validation_status=invoice_data.validation_status,
            validated_by=invoice_data.validated_by or (invoice_data.created_by if invoice_data.validation_status == "validated" else ""),
            validated_at=invoice_data.validated_at or (datetime.now(timezone.utc).isoformat() if invoice_data.validation_status == "validated" else ""),
            table_number=invoice_data.table_number
        )

        invoice_dict = invoice.model_dump()
        await db.invoices.insert_one(invoice_dict)

        # ── PATCH BUG (Feb 2026) : assurer la visibilité côté Cuisinier ──
        # Quand une vente directe (sans table active) contient des items "cuisine",
        # créer une `caisse_tables` virtuelle pour que GET /api/cuisine/orders
        # retourne ce bon au profil Chef Cuisinier (sinon il ne voit RIEN).
        # Si une table existe déjà (table_number présent), on n'agit pas car
        # le flow saveInvoice côté frontend a déjà appelé PUT /caisse/tables.
        try:
            from routers.cuisine import _is_cuisine_item, CUISINE_DEPTS  # noqa
            has_cuisine_items = any(_is_cuisine_item(it) for it in (invoice_data.items or []))
            if has_cuisine_items and not invoice_data.table_number:
                now_iso = datetime.now(timezone.utc).isoformat()
                virtual_table = {
                    "id": f"virt-inv-{invoice.id}",
                    "table_number": invoice_data.table_number or 0,  # 0 = vente directe
                    "server_name": invoice_data.created_by or "Vente directe",
                    "client_name": invoice_data.customer_name or "Client",
                    "items": [dict(it) for it in invoice_data.items],
                    "status": "ready_to_invoice",
                    "created_at": now_iso,
                    "updated_at": now_iso,
                    "from_invoice_id": invoice.id,
                    "is_virtual_cuisine_table": True,
                    "all_ready_at": None,
                    "notes": invoice_data.notes or "",
                }
                await db.caisse_tables.insert_one(virtual_table)
                logger.info(f"Virtual cuisine table created for direct-sale invoice {invoice.invoice_number}")
        except Exception as _virt_err:
            # Ne JAMAIS bloquer la facturation pour ce side-effect
            logger.warning(f"virtual cuisine table creation failed: {_virt_err}")

        # Audit : creation
        await _log_audit(
            "invoice",
            invoice_dict,
            "create",
            {"name": actor_name or invoice_data.created_by, "role": actor_role or "manager"},
            None,
        )
        return {"success": True, "invoice": {k: v for k, v in invoice_dict.items() if k != "_id"}}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/invoices")
async def get_invoices(
    date: str = Query(None),
    user_id: str = Query(None),
    role: str = Query(None),
    created_by: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    validated_only: bool = Query(False, description="If true, return only validated invoices (BON CLIENT). Used by Factures tab."),
):
    """Get invoices, optionally filtered by date and user.
    Respects assigned_week: excludes invoices transferred to another week.

    - validated_only=true → ne retourne QUE les factures validées (workflow strict
      BONS vs FACTURES : l'onglet 'Factures' ne doit afficher que les factures émises).
    """
    try:
        # Filtre global applicable à toutes les branches
        status_filter = {"validation_status": "validated"} if validated_only else None

        if role == "server" and created_by:
            base_query = {}
            if date:
                base_query["created_at"] = {"$regex": f"^{date}"}

            if validated_only:
                validated_query = {**base_query, "validation_status": "validated"}
                validated_invoices = await db.invoices.find(validated_query, {"_id": 0}).sort("created_at", -1).to_list(1000)
                return {"invoices": validated_invoices}

            pending_query = {**base_query, "created_by": created_by, "validation_status": {"$ne": "validated"}}
            pending_invoices = await db.invoices.find(pending_query, {"_id": 0}).sort("created_at", -1).to_list(1000)

            validated_query = {**base_query, "validation_status": "validated"}
            validated_invoices = await db.invoices.find(validated_query, {"_id": 0}).sort("created_at", -1).to_list(1000)

            return {"invoices": validated_invoices + pending_invoices}

        if date_from and date_to:
            query = {"created_at": {"$gte": date_from, "$lte": date_to + "T23:59:59Z"}}
            if status_filter:
                query.update(status_filter)
            invoices = await db.invoices.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
        elif date:
            base_by_date = {
                "created_at": {"$regex": f"^{date}"},
                "$or": [
                    {"assigned_week": {"$exists": False}},
                    {"assigned_week": None},
                    {"assigned_week": ""}
                ]
            }
            if status_filter:
                base_by_date.update(status_filter)
            invoices_by_date = await db.invoices.find(base_by_date, {"_id": 0}).sort("created_at", -1).to_list(1000)

            d = datetime.fromisoformat(date)
            week_monday = (d - timedelta(days=d.weekday())).strftime("%Y-%m-%d")
            assigned_q = {
                "assigned_week": week_monday,
                "created_at": {"$not": {"$regex": f"^{date}"}}
            }
            if status_filter:
                assigned_q.update(status_filter)
            invoices_assigned_here = await db.invoices.find(assigned_q, {"_id": 0}).sort("created_at", -1).to_list(1000)

            seen = set()
            invoices = []
            for inv in invoices_by_date + invoices_assigned_here:
                if inv.get("id") not in seen:
                    seen.add(inv.get("id"))
                    invoices.append(inv)
        else:
            query = status_filter or {}
            invoices = await db.invoices.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)

        return {"invoices": invoices}
    except Exception as e:
        logger.error(f"Error fetching invoices: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== AUDIT LOGS (Admin only) ====================

@router.get("/audit/logs")
async def get_audit_logs(
    role: str = Query(..., description="Caller role - must be 'admin'"),
    entity_type: Optional[str] = Query(None, description="invoice | table"),
    actor_role: Optional[str] = Query(None, description="manager | server | admin"),
    action: Optional[str] = Query(None, description="create|update|delete|validate|cancel"),
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    search: Optional[str] = Query(None, description="search by invoice_number or actor_name"),
    limit: int = Query(500, ge=1, le=2000),
):
    """Return audit logs of order/invoice/bon modifications.

    Restricted to admin (role param check). Filters by entity_type, actor_role,
    action, date range, and free-text search on invoice_number/actor_name.
    """
    if role != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé à l'administrateur")

    query: Dict = {}
    if entity_type:
        query["entity_type"] = entity_type
    if actor_role:
        query["actor_role"] = actor_role
    if action:
        query["action"] = action
    if start_date or end_date:
        date_q: Dict = {}
        if start_date:
            date_q["$gte"] = f"{start_date}T00:00:00"
        if end_date:
            date_q["$lte"] = f"{end_date}T23:59:59.999"
        query["created_at"] = date_q
    if search:
        rgx = {"$regex": re.escape(search), "$options": "i"}
        query["$or"] = [
            {"invoice_number": rgx},
            {"actor_name": rgx},
        ]

    logs = await db.audit_logs.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    # Stats
    total = len(logs)
    by_action: Dict[str, int] = {}
    by_actor: Dict[str, int] = {}
    for lg in logs:
        a = lg.get("action") or "?"
        by_action[a] = by_action.get(a, 0) + 1
        nm = lg.get("actor_name") or "—"
        by_actor[nm] = by_actor.get(nm, 0) + 1
    return {
        "total": total,
        "by_action": by_action,
        "by_actor": by_actor,
        "logs": logs,
    }


@router.get("/invoices/stats/by-product")
async def get_sales_stats_by_product(
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    department: Optional[str] = Query(None),
    validated_only: bool = Query(True),
):
    """Statistiques de vente par produit sur une période.

    Agrège les items de toutes les factures (par défaut : uniquement validées) et
    retourne pour chaque produit : quantité totale vendue, chiffre d'affaires,
    nombre de factures distinctes, prix moyen, dernière vente, département, etc.

    Filtres optionnels :
      - start_date / end_date (inclusive)
      - department (salle_jardin, bar, jeux, location, autres, accompagnements)
      - validated_only (true par défaut ; mettre false pour inclure les pending)
    """
    query: Dict = {}
    if validated_only:
        query["validation_status"] = "validated"
    if start_date or end_date:
        date_q: Dict = {}
        if start_date:
            date_q["$gte"] = f"{start_date}T00:00:00"
        if end_date:
            date_q["$lte"] = f"{end_date}T23:59:59.999"
        query["created_at"] = date_q

    invoices = await db.invoices.find(query, {"_id": 0}).to_list(10000)

    # Aggregate per (name + department) — same name across depts stays separate (rare but safe)
    agg: Dict[str, Dict] = {}
    for inv in invoices:
        inv_id = inv.get("id")
        inv_date = inv.get("created_at", "")
        for item in inv.get("items") or []:
            item_name = (item.get("name") or "").strip()
            if not item_name:
                continue
            item_dept = item.get("department") or "autres"
            if department and item_dept != department:
                continue
            try:
                qty = float(item.get("quantity") or 0)
            except Exception:
                qty = 0.0
            try:
                price = float(item.get("price") or 0)
            except Exception:
                price = 0.0
            revenue = qty * price
            key = f"{item_name}::{item_dept}"
            bucket = agg.get(key)
            if not bucket:
                bucket = {
                    "name": item_name,
                    "department": item_dept,
                    "unit": item.get("unit") or "unité",
                    "quantity_sold": 0.0,
                    "revenue": 0.0,
                    "invoice_ids": set(),
                    "first_sold_at": inv_date,
                    "last_sold_at": inv_date,
                    "min_price": price if price > 0 else None,
                    "max_price": price,
                }
                agg[key] = bucket
            bucket["quantity_sold"] += qty
            bucket["revenue"] += revenue
            if inv_id:
                bucket["invoice_ids"].add(inv_id)
            if inv_date and inv_date > (bucket["last_sold_at"] or ""):
                bucket["last_sold_at"] = inv_date
            if inv_date and (not bucket["first_sold_at"] or inv_date < bucket["first_sold_at"]):
                bucket["first_sold_at"] = inv_date
            if price > 0:
                bucket["min_price"] = price if bucket["min_price"] is None else min(bucket["min_price"], price)
                bucket["max_price"] = max(bucket["max_price"] or 0, price)

    # Flatten + compute derived fields
    rows = []
    total_qty = 0.0
    total_revenue = 0.0
    for b in agg.values():
        inv_count = len(b["invoice_ids"])
        qty = round(b["quantity_sold"], 3)
        rev = round(b["revenue"], 2)
        avg = round(rev / qty, 2) if qty > 0 else 0
        total_qty += qty
        total_revenue += rev
        rows.append({
            "name": b["name"],
            "department": b["department"],
            "unit": b["unit"],
            "quantity_sold": qty,
            "revenue": rev,
            "invoice_count": inv_count,
            "avg_price": avg,
            "min_price": round(b["min_price"], 2) if b["min_price"] is not None else None,
            "max_price": round(b["max_price"], 2) if b["max_price"] is not None else None,
            "first_sold_at": b["first_sold_at"],
            "last_sold_at": b["last_sold_at"],
        })

    # Share of revenue
    total_revenue_f = float(total_revenue) if total_revenue > 0 else 1.0
    for r in rows:
        r["revenue_share_pct"] = round((r["revenue"] / total_revenue_f) * 100, 2) if total_revenue > 0 else 0

    # Sort by revenue desc by default
    rows.sort(key=lambda r: r["revenue"], reverse=True)

    # Breakdown by department
    by_department: Dict[str, Dict] = {}
    for r in rows:
        d = r["department"] or "autres"
        agg_d = by_department.setdefault(d, {"quantity_sold": 0.0, "revenue": 0.0, "products": 0})
        agg_d["quantity_sold"] = round(agg_d["quantity_sold"] + r["quantity_sold"], 3)
        agg_d["revenue"] = round(agg_d["revenue"] + r["revenue"], 2)
        agg_d["products"] += 1

    return {
        "start_date": start_date,
        "end_date": end_date,
        "department_filter": department,
        "validated_only": validated_only,
        "invoices_scanned": len(invoices),
        "distinct_products": len(rows),
        "total_quantity": round(total_qty, 3),
        "total_revenue": round(total_revenue, 2),
        "by_department": by_department,
        "products": rows,
    }


@router.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: str):
    """Get a single invoice by ID"""
    try:
        invoice = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
        if not invoice:
            raise HTTPException(status_code=404, detail="Facture non trouvée")
        return invoice
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/invoices/{invoice_id}")
async def update_invoice(
    invoice_id: str,
    invoice_data: dict = Body(...),
    actor_name: Optional[str] = Query(None),
    actor_role: Optional[str] = Query(None),
):
    """Update an existing invoice.
    If validation status changes to 'validated':
      - Auto-stop the associated table and record service_stats
      - Sync each sold item to Stock (via recipe or direct name match)
    """
    try:
        current_invoice = await db.invoices.find_one({"id": invoice_id})
        if not current_invoice:
            raise HTTPException(status_code=404, detail="Facture non trouvée")

        # Cash closure lock : block edits on a day already Z-closed
        invoice_date = _date_from_iso(current_invoice.get("created_at"))
        closure = await is_date_closed(invoice_date)
        if closure:
            raise HTTPException(
                status_code=423,
                detail=f"Caisse clôturée pour le {invoice_date}. Rouvrez le Z dans 'Point de la Caisse' avant de modifier cette facture."
            )

        # Compute diff BEFORE applying patch
        diff = _diff_invoice(current_invoice, invoice_data)

        invoice_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = await db.invoices.update_one({"id": invoice_id}, {"$set": invoice_data})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Facture non trouvée")

        # Determine action label for audit
        action_label = "update"
        new_status = invoice_data.get("validation_status")
        old_status = current_invoice.get("validation_status")
        if new_status == "validated" and old_status != "validated":
            action_label = "validate"
        elif new_status == "cancelled" and old_status != "cancelled":
            action_label = "cancel"

        # Refresh doc for snapshot
        refreshed = {**current_invoice, **invoice_data}
        await _log_audit(
            "invoice",
            refreshed,
            action_label,
            {"name": actor_name, "role": actor_role},
            diff,
        )

        if (invoice_data.get("validation_status") == "validated"
                and current_invoice
                and current_invoice.get("validation_status") != "validated"):
            table_number = current_invoice.get("table_number")
            if table_number:
                table = await db.caisse_tables.find_one({"table_number": table_number})
                if table:
                    created_at = datetime.fromisoformat(table["created_at"].replace("Z", "+00:00"))
                    now = datetime.now(timezone.utc)
                    duration_seconds = (now - created_at).total_seconds()
                    duration_minutes = int(duration_seconds / 60)

                    if duration_minutes < 15:
                        quality_status = "excellent"
                    elif duration_minutes < 30:
                        quality_status = "acceptable"
                    else:
                        quality_status = "slow"

                    total = current_invoice.get("total", 0)
                    service_record = {
                        "id": str(uuid.uuid4()),
                        "table_number": table["table_number"],
                        "server_id": table.get("server_id", ""),
                        "server_name": table.get("server_name", ""),
                        "client_name": table.get("client_name", "Client"),
                        "items_count": len(current_invoice.get("items", [])),
                        "total_amount": total,
                        "duration_minutes": duration_minutes,
                        "quality_status": quality_status,
                        "started_at": table["created_at"],
                        "stopped_at": now.isoformat(),
                        "date": now.strftime("%Y-%m-%d"),
                    }
                    await db.service_stats.insert_one(service_record)
                    await db.caisse_tables.delete_one({"id": table["id"]})
                    logger.info(f"Auto-stopped table {table_number} after invoice validation")

            try:
                await _apply_destocking_for_invoice(current_invoice, db, logger)
            except Exception as stock_err:
                logger.error(f"Error syncing invoice to stock: {stock_err}")

        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _apply_destocking_for_invoice(current_invoice, db, logger):
    """Shared helper: apply stock destocking for a single invoice. Idempotent-check on caller side.

    Extracted from update_invoice so it can be reused by the 'resync' endpoint.
    """
    items = current_invoice.get("items", [])
    invoice_id = current_invoice.get("id")
    invoice_number = current_invoice.get("invoice_number", "")
    now_iso = datetime.now(timezone.utc).isoformat()

    for item in items:
        item_name = item.get("name", "")
        item_qty = item.get("quantity", 1)
        item_price = item.get("price", 0)

        # 1) EXPLICIT LINK: if the caisse product is linked to one or more stock products, deduct each.
        linked_stock_products = []
        linked_recipe = None
        caisse_product_id = item.get("product_id") or item.get("id")
        caisse_prod = None
        if caisse_product_id:
            caisse_prod = await db.caisse_products.find_one({"id": caisse_product_id})
        # Fallback: some legacy invoices (or manually-added items) carry no product_id —
        # try to match by exact name (case-insensitive). Useful for 'free items' typed into the cart.
        if not caisse_prod and item_name:
            caisse_prod = await db.caisse_products.find_one({
                "name": {"$regex": f"^{re.escape(item_name)}$", "$options": "i"}
            })
            if caisse_prod:
                caisse_product_id = caisse_prod.get("id")
                logger.info(f"Stock deduction: matched item '{item_name}' to caisse product '{caisse_prod.get('name')}' by name (no product_id in invoice item)")
        if caisse_prod:
            # Resolve stock_links (multi). Backwards-compat: fallback to legacy single stock_product_id.
            link_ids = caisse_prod.get("stock_links") or []
            if not link_ids and caisse_prod.get("stock_product_id"):
                link_ids = [caisse_prod["stock_product_id"]]
            if link_ids:
                async for sp in db.stock_products.find({
                    "id": {"$in": link_ids}, "is_active": True,
                    "storage_zone": {"$ne": "magasin"}
                }, {"_id": 0}):
                    linked_stock_products.append(sp)
            # Explicit link to a recipe (composed product) — only if no direct links.
            elif caisse_prod.get("stock_recipe_id"):
                linked_recipe = await db.stock_recipes.find_one({
                    "id": caisse_prod["stock_recipe_id"]
                })

        if linked_stock_products:
            for sp in linked_stock_products:
                old_qty = sp.get("quantity", 0)
                new_qty = max(0, old_qty - item_qty)
                # Si la demande dépasse le stock disponible, on garde la dette dans
                # `pending_destock_quantity` afin qu'elle soit appliquée au prochain
                # ajustement manuel de stock (correction d'inventaire).
                over_destock = max(0.0, float(item_qty) - float(old_qty))
                new_valeur = new_qty * sp.get("purchase_price", 0)
                smin = sp.get("stock_min", 5)
                new_statut = "rupture" if new_qty <= 0 else ("faible" if new_qty <= smin else "normal")
                multi_suffix = " (multi-lien)" if len(linked_stock_products) > 1 else ""
                await db.stock_movements.insert_one({
                    "id": str(uuid.uuid4()),
                    "product_id": sp["id"],
                    "product_name": sp["name"],
                    "product_code": sp.get("code", ""),
                    "movement_type": "sortie",
                    "quantity": item_qty,
                    "previous_quantity": old_qty,
                    "new_quantity": new_qty,
                    "over_destock": over_destock,
                    "unit": sp.get("unit", ""),
                    "unit_price": sp.get("purchase_price", 0),
                    "total_value": item_qty * sp.get("purchase_price", 0),
                    "reason": (
                        f"Vente (lien direct{multi_suffix}) - Facture {invoice_number}"
                        + (f" — {over_destock:g} en attente d'ajustement" if over_destock > 0 else "")
                    ),
                    "user_name": current_invoice.get("created_by", "Caisse"),
                    "invoice_id": invoice_id,
                    "caisse_product_id": caisse_product_id,
                    "created_at": now_iso,
                })
                update_set = {
                    "quantity": new_qty,
                    "valeur_stock": new_valeur,
                    "statut": new_statut,
                    "updated_at": now_iso,
                }
                update_ops = {"$set": update_set}
                if over_destock > 0:
                    update_ops["$inc"] = {"pending_destock_quantity": over_destock}
                await db.stock_products.update_one({"id": sp["id"]}, update_ops)
                logger.info(
                    f"Stock linked deduction: {sp['name']} {old_qty} -> {new_qty} "
                    f"(invoice {invoice_number})"
                    + (f" [PENDING +{over_destock:g}]" if over_destock > 0 else "")
                )
            continue  # skip fallback logic

        # 1bis) EXPLICIT RECIPE LINK: deduct all ingredients of the explicitly linked recipe.
        if linked_recipe:
            for ing in linked_recipe.get("ingredients", []):
                ing_product = await db.stock_products.find_one({"id": ing["product_id"], "is_active": True, "storage_zone": {"$ne": "magasin"}})
                if ing_product:
                    ing_qty = ing["quantity"] * item_qty
                    old_qty = ing_product.get("quantity", 0)
                    new_qty = max(0, old_qty - ing_qty)
                    over_destock = max(0.0, float(ing_qty) - float(old_qty))
                    new_valeur = new_qty * ing_product.get("purchase_price", 0)
                    smin = ing_product.get("stock_min", 5)
                    new_statut = "rupture" if new_qty <= 0 else ("faible" if new_qty <= smin else "normal")
                    await db.stock_movements.insert_one({
                        "id": str(uuid.uuid4()),
                        "product_id": ing_product["id"],
                        "product_name": ing_product["name"],
                        "product_code": ing_product.get("code", ""),
                        "movement_type": "sortie",
                        "quantity": round(ing_qty, 3),
                        "previous_quantity": old_qty,
                        "new_quantity": new_qty,
                        "over_destock": round(over_destock, 3),
                        "unit": ing_product.get("unit", ""),
                        "unit_price": ing_product.get("purchase_price", 0),
                        "total_value": round(ing_qty * ing_product.get("purchase_price", 0), 2),
                        "reason": (
                            f"Vente (Recette liée: {linked_recipe['name']}) - Facture {invoice_number}"
                            + (f" — {over_destock:g} en attente d'ajustement" if over_destock > 0 else "")
                        ),
                        "user_name": current_invoice.get("created_by", "Caisse"),
                        "invoice_id": invoice_id,
                        "caisse_product_id": caisse_product_id,
                        "recipe_id": linked_recipe["id"],
                        "created_at": now_iso,
                    })
                    update_ops = {"$set": {
                        "quantity": round(new_qty, 3),
                        "valeur_stock": round(new_valeur, 2),
                        "statut": new_statut,
                        "updated_at": now_iso,
                    }}
                    if over_destock > 0:
                        update_ops["$inc"] = {"pending_destock_quantity": round(over_destock, 3)}
                    await db.stock_products.update_one({"id": ing_product["id"]}, update_ops)
            logger.info(f"Stock recipe-linked deduction: recipe={linked_recipe['name']} items={len(linked_recipe.get('ingredients', []))} (invoice {invoice_number})")
            continue  # skip fallback logic

        recipe = await db.stock_recipes.find_one({
            "caisse_product_name": {"$regex": f"^{re.escape(item_name)}$", "$options": "i"}
        })

        if recipe:
            for ing in recipe.get("ingredients", []):
                ing_product = await db.stock_products.find_one({"id": ing["product_id"], "is_active": True, "storage_zone": {"$ne": "magasin"}})
                if ing_product:
                    ing_qty = ing["quantity"] * item_qty
                    old_qty = ing_product.get("quantity", 0)
                    new_qty = max(0, old_qty - ing_qty)
                    over_destock = max(0.0, float(ing_qty) - float(old_qty))
                    new_valeur = new_qty * ing_product.get("purchase_price", 0)
                    smin = ing_product.get("stock_min", 5)
                    new_statut = "rupture" if new_qty <= 0 else ("faible" if new_qty <= smin else "normal")

                    stock_mov = {
                        "id": str(uuid.uuid4()),
                        "product_id": ing_product["id"],
                        "product_name": ing_product["name"],
                        "product_code": ing_product.get("code", ""),
                        "movement_type": "sortie",
                        "quantity": round(ing_qty, 3),
                        "previous_quantity": old_qty,
                        "new_quantity": new_qty,
                        "over_destock": round(over_destock, 3),
                        "unit": ing_product.get("unit", ""),
                        "unit_price": ing_product.get("purchase_price", 0),
                        "total_value": round(ing_qty * ing_product.get("purchase_price", 0), 2),
                        "reason": (
                            f"Vente (Recette: {recipe['name']}) - Facture {invoice_number}"
                            + (f" — {over_destock:g} en attente d'ajustement" if over_destock > 0 else "")
                        ),
                        "user_name": current_invoice.get("created_by", "Caisse"),
                        "invoice_id": invoice_id,
                        "recipe_id": recipe["id"],
                        "created_at": now_iso,
                    }
                    await db.stock_movements.insert_one(stock_mov)
                    update_ops = {"$set": {
                        "quantity": round(new_qty, 3),
                        "valeur_stock": round(new_valeur, 2),
                        "statut": new_statut,
                        "updated_at": now_iso,
                    }}
                    if over_destock > 0:
                        update_ops["$inc"] = {"pending_destock_quantity": round(over_destock, 3)}
                    await db.stock_products.update_one({"id": ing_product["id"]}, update_ops)
                    logger.info(f"Stock recipe deduction: {ing_product['name']} {old_qty} -> {round(new_qty, 3)} (recipe: {recipe['name']}, invoice {invoice_number})")
        else:
            stock_product = await db.stock_products.find_one({
                "name": {"$regex": f"^{re.escape(item_name[:20])}", "$options": "i"},
                "is_active": True,
                "storage_zone": {"$ne": "magasin"}
            })
            if stock_product:
                old_qty = stock_product.get("quantity", 0)
                new_qty = max(0, old_qty - item_qty)
                over_destock = max(0.0, float(item_qty) - float(old_qty))
                new_valeur = new_qty * stock_product.get("purchase_price", 0)
                smin = stock_product.get("stock_min", 5)
                new_statut = "rupture" if new_qty <= 0 else ("faible" if new_qty <= smin else "normal")

                stock_mov = {
                    "id": str(uuid.uuid4()),
                    "product_id": stock_product["id"],
                    "product_name": stock_product["name"],
                    "product_code": stock_product.get("code", ""),
                    "movement_type": "sortie",
                    "quantity": item_qty,
                    "previous_quantity": old_qty,
                    "new_quantity": new_qty,
                    "over_destock": round(over_destock, 3),
                    "unit": stock_product.get("unit", ""),
                    "unit_price": item_price,
                    "total_value": item_qty * item_price,
                    "reason": (
                        f"Vente - Facture {invoice_number}"
                        + (f" — {over_destock:g} en attente d'ajustement" if over_destock > 0 else "")
                    ),
                    "user_name": current_invoice.get("created_by", "Caisse"),
                    "invoice_id": invoice_id,
                    "created_at": now_iso,
                }
                await db.stock_movements.insert_one(stock_mov)
                update_ops = {"$set": {
                    "quantity": new_qty,
                    "valeur_stock": new_valeur,
                    "statut": new_statut,
                    "updated_at": now_iso,
                }}
                if over_destock > 0:
                    update_ops["$inc"] = {"pending_destock_quantity": round(over_destock, 3)}
                await db.stock_products.update_one({"id": stock_product["id"]}, update_ops)
                logger.info(f"Stock updated: {stock_product['name']} {old_qty} -> {new_qty} (invoice {invoice_number})")
            else:
                sale_record = {
                    "id": str(uuid.uuid4()),
                    "product_id": "",
                    "product_name": item_name,
                    "product_code": "",
                    "movement_type": "sortie",
                    "quantity": item_qty,
                    "previous_quantity": 0,
                    "new_quantity": 0,
                    "unit": item.get("unit", "portion"),
                    "unit_price": item_price,
                    "total_value": item_qty * item_price,
                    "reason": f"Vente (non lie au stock) - Facture {invoice_number}",
                    "user_name": current_invoice.get("created_by", "Caisse"),
                    "invoice_id": invoice_id,
                    "created_at": now_iso,
                }
                await db.stock_movements.insert_one(sale_record)


@router.post("/invoices/resync-destockage")
async def resync_destockage(date: Optional[str] = None, all_past: bool = False, force: bool = False):
    """Re-apply stock destocking for validated invoices.

    - By default: processes all validated invoices of the given day (or today).
    - `all_past=true`: processes ALL validated invoices regardless of date (still idempotent).
    - `force=true`: deletes existing movements linked to each invoice and re-applies
      destocking from scratch. Use this AFTER creating/updating recipes to retro-apply
      the new stock deductions on invoices that were previously marked "non lié au stock".

    Idempotent (unless force=true): skips invoices that already have at least one linked stock_movement.
    """
    from datetime import datetime as _dt, timezone as _tz

    query = {"validation_status": "validated"}
    day = None
    if not all_past:
        day = date or _dt.now(_tz.utc).strftime("%Y-%m-%d")
        day_start = f"{day}T00:00:00"
        day_end = f"{day}T23:59:59.999"
        query["created_at"] = {"$gte": day_start, "$lte": day_end}

    invoices = await db.invoices.find(query, {"_id": 0}).sort("created_at", 1).to_list(5000)

    processed = 0
    skipped = 0
    errors = 0
    error_details = []
    movements_deleted = 0
    for inv in invoices:
        inv_id = inv.get("id")
        inv_number = inv.get("invoice_number", "")

        if force:
            # Supprime tous les mouvements liés à cette facture (par invoice_id ou par
            # mention du numéro dans le motif) — puis réapplique le destockage à neuf.
            del_q = {"$or": [{"invoice_id": inv_id}]}
            if inv_number:
                del_q["$or"].append({"reason": {"$regex": inv_number, "$options": "i"}})
            r = await db.stock_movements.delete_many(del_q)
            movements_deleted += r.deleted_count
        else:
            # Idempotence: skip if a movement already references this invoice,
            # either by explicit invoice_id field, or by invoice_number in reason text (legacy rows).
            idem_query = {"$or": [{"invoice_id": inv_id}]}
            if inv_number:
                idem_query["$or"].append({"reason": {"$regex": inv_number, "$options": "i"}})
            existing_mv = await db.stock_movements.count_documents(idem_query)
            if existing_mv > 0:
                skipped += 1
                continue
        try:
            await _apply_destocking_for_invoice(inv, db, logger)
            processed += 1
        except Exception as e:
            errors += 1
            error_details.append({"invoice_id": inv_id, "error": str(e)[:200]})
            logger.error(f"Resync error for invoice {inv_id}: {e}")

    return {
        "success": True,
        "date": day,
        "all_past": all_past,
        "force": force,
        "total_invoices": len(invoices),
        "processed": processed,
        "skipped_already_destocked": skipped,
        "movements_deleted": movements_deleted,
        "errors": errors,
        "error_details": error_details[:20],
    }


@router.delete("/invoices/{invoice_id}")
async def delete_invoice(
    invoice_id: str,
    actor_name: Optional[str] = Query(None),
    actor_role: Optional[str] = Query(None),
):
    """Delete an invoice"""
    try:
        existing = await db.invoices.find_one({"id": invoice_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Facture non trouvée")

        # Cash closure lock
        invoice_date = _date_from_iso(existing.get("created_at"))
        closure = await is_date_closed(invoice_date)
        if closure:
            raise HTTPException(
                status_code=423,
                detail=f"Caisse clôturée pour le {invoice_date}. Rouvrez le Z avant de supprimer cette facture."
            )

        result = await db.invoices.delete_one({"id": invoice_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Facture non trouvée")

        await _log_audit(
            "invoice",
            existing,
            "delete",
            {"name": actor_name, "role": actor_role},
            None,
        )
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== UPDATE ITEMS ====================

@router.put("/invoices/{invoice_id}/update-items")
async def update_invoice_items(
    invoice_id: str,
    data: dict = Body(...),
    actor_name: Optional[str] = Query(None),
    actor_role: Optional[str] = Query(None),
):
    """Update invoice items (only if modification_allowed)"""
    try:
        items = data.get("items", [])
        invoice = await db.invoices.find_one({"id": invoice_id})
        if not invoice:
            raise HTTPException(status_code=404, detail="Facture non trouvée")
        if not invoice.get("modification_allowed"):
            raise HTTPException(status_code=403, detail="Modification non autorisée")

        subtotal = sum(item.get("price", 0) * item.get("quantity", 1) for item in items)
        discount = invoice.get("discount", 0)
        discount_amount = subtotal * discount / 100
        new_total = subtotal - discount_amount

        totals_by_department = {}
        for item in items:
            dept = item.get("department", "autres")
            totals_by_department[dept] = totals_by_department.get(dept, 0) + (item.get("price", 0) * item.get("quantity", 1))

        # Diff before mutation
        patch = {
            "items": items,
            "subtotal": subtotal,
            "discount_amount": discount_amount,
            "total": new_total,
            "totals_by_department": totals_by_department,
        }
        diff = _diff_invoice(invoice, patch)

        await db.invoices.update_one(
            {"id": invoice_id},
            {"$set": {
                "items": items,
                "subtotal": subtotal,
                "discount_amount": discount_amount,
                "total": new_total,
                "totals_by_department": totals_by_department,
                "modification_allowed": False,
                "modified_at": datetime.now(timezone.utc).isoformat(),
                "validation_status": "pending"
            }}
        )

        refreshed = {**invoice, **patch, "validation_status": "pending"}
        await _log_audit(
            "invoice",
            refreshed,
            "update",
            {"name": actor_name, "role": actor_role},
            diff,
        )
        return {"success": True, "message": "Facture modifiée"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating invoice items: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== PDF ====================

@router.get("/invoices/{invoice_id}/pdf")
async def generate_invoice_pdf(invoice_id: str):
    """Generate PDF for an invoice"""
    try:
        invoice = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
        if not invoice:
            raise HTTPException(status_code=404, detail="Facture non trouvée")

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=20*mm, leftMargin=20*mm, topMargin=20*mm, bottomMargin=20*mm)

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=18, alignment=1, spaceAfter=10)
        subtitle_style = ParagraphStyle('Subtitle', parent=styles['Normal'], fontSize=10, alignment=1, spaceAfter=20)

        elements = []
        elements.append(Paragraph("ESPACE MAXO", title_style))
        elements.append(Paragraph("Restaurant & Centre de Jeux VR", subtitle_style))
        elements.append(Paragraph(
            f"Facture N° {invoice.get('invoice_number', invoice['id'][:8].upper())}",
            ParagraphStyle('InvoiceNum', parent=styles['Heading2'], alignment=1)
        ))
        elements.append(Spacer(1, 10*mm))

        date_str = invoice.get('created_at', '')[:10] if invoice.get('created_at') else ''
        info_data = [
            [f"Date: {date_str}", f"Client: {invoice.get('customer_name', 'Client')}"],
            [f"Mode de paiement: {invoice.get('payment_method', 'cash').upper()}", f"Tél: {invoice.get('customer_phone', '-')}"]
        ]
        info_table = Table(info_data, colWidths=[90*mm, 80*mm])
        info_table.setStyle(TableStyle([
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]))
        elements.append(info_table)
        elements.append(Spacer(1, 10*mm))

        items_data = [['Article', 'Qté', 'Prix Unit.', 'Total']]
        for item in invoice.get('items', []):
            items_data.append([
                item.get('name', ''),
                str(item.get('quantity', 1)),
                f"{int(item.get('price', 0)):,} FCFA".replace(',', ' '),
                f"{int(item.get('price', 0) * item.get('quantity', 1)):,} FCFA".replace(',', ' ')
            ])

        items_table = Table(items_data, colWidths=[80*mm, 20*mm, 35*mm, 35*mm])
        items_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a5f')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
            ('FONTSIZE', (0, 0), (-1, 0), 11),
            ('FONTSIZE', (0, 1), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('TOPPADDING', (0, 0), (-1, 0), 10),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
        ]))
        elements.append(items_table)
        elements.append(Spacer(1, 5*mm))

        subtotal = invoice.get('subtotal', 0)
        discount_amount = invoice.get('discount_amount', 0)
        total = invoice.get('total', 0)

        totals_data = [
            ['', '', 'Sous-total:', f"{int(subtotal):,} FCFA".replace(',', ' ')],
        ]
        if discount_amount > 0:
            totals_data.append(['', '', f"Remise ({invoice.get('discount', 0)}%):", f"-{int(discount_amount):,} FCFA".replace(',', ' ')])
        totals_data.append(['', '', 'TOTAL:', f"{int(total):,} FCFA".replace(',', ' ')])

        totals_table = Table(totals_data, colWidths=[80*mm, 20*mm, 35*mm, 35*mm])
        totals_table.setStyle(TableStyle([
            ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
            ('FONTSIZE', (0, 0), (-1, -2), 10),
            ('FONTSIZE', (0, -1), (-1, -1), 12),
            ('FONTNAME', (2, -1), (-1, -1), 'Helvetica-Bold'),
            ('LINEABOVE', (2, -1), (-1, -1), 1, colors.black),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]))
        elements.append(totals_table)
        elements.append(Spacer(1, 15*mm))

        footer_style = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=9, alignment=1, textColor=colors.grey)
        elements.append(Paragraph("Merci de votre visite chez Espace Maxo!", footer_style))
        elements.append(Paragraph("Adresse: À côté de la Pharmacie Fidjrossè Plage, Cotonou", footer_style))
        elements.append(Paragraph("Tél: 01 41 47 00 00 / 01 62 39 62 39", footer_style))

        doc.build(elements)
        buffer.seek(0)

        filename = f"facture_{invoice.get('invoice_number', invoice['id'][:8])}.pdf"
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== ASSIGN WEEK ====================

@router.put("/invoices/{invoice_id}/assign-week")
async def assign_invoice_to_week(invoice_id: str, week_start: str = Body(..., embed=True)):
    """Assign an invoice to a specific week"""
    try:
        invoice = await db.invoices.find_one({"id": invoice_id})
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        await db.invoices.update_one({"id": invoice_id}, {"$set": {"assigned_week": week_start}})
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/invoices/assign-week-bulk")
async def assign_invoices_bulk(ids: List[str] = Body(...), week_start: str = Body(...)):
    """Assign multiple invoices to a specific week"""
    result = await db.invoices.update_many({"id": {"$in": ids}}, {"$set": {"assigned_week": week_start}})
    return {"success": True, "modified": result.modified_count}


@router.post("/invoices/unassign-week-bulk")
async def unassign_invoices_bulk(ids: List[str] = Body(..., embed=True)):
    """Remove week assignment from invoices (they return to their original date)"""
    result = await db.invoices.update_many({"id": {"$in": ids}}, {"$unset": {"assigned_week": ""}})
    return {"success": True, "modified": result.modified_count}


@router.post("/invoices/exclude-from-week-bulk")
async def exclude_invoices_from_week_bulk(
    ids: List[str] = Body(...),
    week_start: str = Body(...),
):
    """Hide invoices from a specific week's report WITHOUT deleting/unassigning them."""
    if not week_start:
        raise HTTPException(400, "week_start requis")
    result = await db.invoices.update_many(
        {"id": {"$in": ids}},
        {"$addToSet": {"excluded_from_weeks": week_start}},
    )
    return {"success": True, "modified": result.modified_count}


@router.post("/invoices/include-in-week-bulk")
async def include_invoices_in_week_bulk(
    ids: List[str] = Body(...),
    week_start: str = Body(...),
):
    """Reverse exclusion."""
    if not week_start:
        raise HTTPException(400, "week_start requis")
    result = await db.invoices.update_many(
        {"id": {"$in": ids}},
        {"$pull": {"excluded_from_weeks": week_start}},
    )
    return {"success": True, "modified": result.modified_count}

