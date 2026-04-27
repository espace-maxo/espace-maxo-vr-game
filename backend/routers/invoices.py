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

router = APIRouter(tags=["invoices"])
db = None
logger = logging.getLogger(__name__)


def set_db(database):
    global db
    db = database


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
    table_number: Optional[int] = None


class Invoice(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_number: str = ""
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
async def create_invoice(invoice_data: InvoiceCreate):
    """Create a new invoice"""
    try:
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        count = await db.invoices.count_documents({
            "created_at": {"$regex": f"^{datetime.now(timezone.utc).strftime('%Y-%m-%d')}"}
        })
        invoice_number = f"EM-{today}-{count + 1:04d}"

        invoice = Invoice(
            invoice_number=invoice_number,
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
            table_number=invoice_data.table_number
        )

        invoice_dict = invoice.model_dump()
        await db.invoices.insert_one(invoice_dict)
        return {"success": True, "invoice": {k: v for k, v in invoice_dict.items() if k != "_id"}}
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
):
    """Get invoices, optionally filtered by date and user.
    Respects assigned_week: excludes invoices transferred to another week.
    """
    try:
        if role == "server" and created_by:
            base_query = {}
            if date:
                base_query["created_at"] = {"$regex": f"^{date}"}

            pending_query = {**base_query, "created_by": created_by, "validation_status": {"$ne": "validated"}}
            pending_invoices = await db.invoices.find(pending_query, {"_id": 0}).sort("created_at", -1).to_list(1000)

            validated_query = {**base_query, "validation_status": "validated"}
            validated_invoices = await db.invoices.find(validated_query, {"_id": 0}).sort("created_at", -1).to_list(1000)

            return {"invoices": validated_invoices + pending_invoices}

        if date_from and date_to:
            invoices = await db.invoices.find({
                "created_at": {"$gte": date_from, "$lte": date_to + "T23:59:59Z"}
            }, {"_id": 0}).sort("created_at", -1).to_list(1000)
        elif date:
            invoices_by_date = await db.invoices.find({
                "created_at": {"$regex": f"^{date}"},
                "$or": [
                    {"assigned_week": {"$exists": False}},
                    {"assigned_week": None},
                    {"assigned_week": ""}
                ]
            }, {"_id": 0}).sort("created_at", -1).to_list(1000)

            d = datetime.fromisoformat(date)
            week_monday = (d - timedelta(days=d.weekday())).strftime("%Y-%m-%d")
            invoices_assigned_here = await db.invoices.find({
                "assigned_week": week_monday,
                "created_at": {"$not": {"$regex": f"^{date}"}}
            }, {"_id": 0}).sort("created_at", -1).to_list(1000)

            seen = set()
            invoices = []
            for inv in invoices_by_date + invoices_assigned_here:
                if inv.get("id") not in seen:
                    seen.add(inv.get("id"))
                    invoices.append(inv)
        else:
            invoices = await db.invoices.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)

        return {"invoices": invoices}
    except Exception as e:
        logger.error(f"Error fetching invoices: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
async def update_invoice(invoice_id: str, invoice_data: dict = Body(...)):
    """Update an existing invoice.
    If validation status changes to 'validated':
      - Auto-stop the associated table and record service_stats
      - Sync each sold item to Stock (via recipe or direct name match)
    """
    try:
        current_invoice = await db.invoices.find_one({"id": invoice_id})

        invoice_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = await db.invoices.update_one({"id": invoice_id}, {"$set": invoice_data})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Facture non trouvée")

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
                items = current_invoice.get("items", [])
                invoice_number = current_invoice.get("invoice_number", "")
                now_iso = datetime.now(timezone.utc).isoformat()

                for item in items:
                    item_name = item.get("name", "")
                    item_qty = item.get("quantity", 1)
                    item_price = item.get("price", 0)

                    # 1) EXPLICIT LINK: if the caisse product is linked to a stock product, use that directly.
                    linked_stock_product = None
                    linked_recipe = None
                    caisse_product_id = item.get("product_id") or item.get("id")
                    if caisse_product_id:
                        caisse_prod = await db.caisse_products.find_one({"id": caisse_product_id})
                        if caisse_prod:
                            if caisse_prod.get("stock_product_id"):
                                linked_stock_product = await db.stock_products.find_one({
                                    "id": caisse_prod["stock_product_id"], "is_active": True
                                })
                            # Explicit link to a recipe (composed product)
                            elif caisse_prod.get("stock_recipe_id"):
                                linked_recipe = await db.stock_recipes.find_one({
                                    "id": caisse_prod["stock_recipe_id"]
                                })

                    if linked_stock_product:
                        sp = linked_stock_product
                        old_qty = sp.get("quantity", 0)
                        new_qty = max(0, old_qty - item_qty)
                        new_valeur = new_qty * sp.get("purchase_price", 0)
                        smin = sp.get("stock_min", 5)
                        new_statut = "rupture" if new_qty <= 0 else ("faible" if new_qty <= smin else "normal")
                        await db.stock_movements.insert_one({
                            "id": str(uuid.uuid4()),
                            "product_id": sp["id"],
                            "product_name": sp["name"],
                            "product_code": sp.get("code", ""),
                            "movement_type": "sortie",
                            "quantity": item_qty,
                            "previous_quantity": old_qty,
                            "new_quantity": new_qty,
                            "unit": sp.get("unit", ""),
                            "unit_price": sp.get("purchase_price", 0),
                            "total_value": item_qty * sp.get("purchase_price", 0),
                            "reason": f"Vente (lien direct) - Facture {invoice_number}",
                            "user_name": current_invoice.get("created_by", "Caisse"),
                            "invoice_id": invoice_id,
                            "caisse_product_id": caisse_product_id,
                            "created_at": now_iso,
                        })
                        await db.stock_products.update_one(
                            {"id": sp["id"]},
                            {"$set": {
                                "quantity": new_qty,
                                "valeur_stock": new_valeur,
                                "statut": new_statut,
                                "updated_at": now_iso,
                            }}
                        )
                        logger.info(f"Stock linked deduction: {sp['name']} {old_qty} -> {new_qty} (invoice {invoice_number})")
                        continue  # skip fallback logic

                    # 1bis) EXPLICIT RECIPE LINK: deduct all ingredients of the explicitly linked recipe.
                    if linked_recipe:
                        for ing in linked_recipe.get("ingredients", []):
                            ing_product = await db.stock_products.find_one({"id": ing["product_id"], "is_active": True})
                            if ing_product:
                                ing_qty = ing["quantity"] * item_qty
                                old_qty = ing_product.get("quantity", 0)
                                new_qty = max(0, old_qty - ing_qty)
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
                                    "unit": ing_product.get("unit", ""),
                                    "unit_price": ing_product.get("purchase_price", 0),
                                    "total_value": round(ing_qty * ing_product.get("purchase_price", 0), 2),
                                    "reason": f"Vente (Recette liée: {linked_recipe['name']}) - Facture {invoice_number}",
                                    "user_name": current_invoice.get("created_by", "Caisse"),
                                    "invoice_id": invoice_id,
                                    "caisse_product_id": caisse_product_id,
                                    "recipe_id": linked_recipe["id"],
                                    "created_at": now_iso,
                                })
                                await db.stock_products.update_one(
                                    {"id": ing_product["id"]},
                                    {"$set": {
                                        "quantity": round(new_qty, 3),
                                        "valeur_stock": round(new_valeur, 2),
                                        "statut": new_statut,
                                        "updated_at": now_iso,
                                    }}
                                )
                        logger.info(f"Stock recipe-linked deduction: recipe={linked_recipe['name']} items={len(linked_recipe.get('ingredients', []))} (invoice {invoice_number})")
                        continue  # skip fallback logic

                    recipe = await db.stock_recipes.find_one({
                        "caisse_product_name": {"$regex": f"^{re.escape(item_name)}$", "$options": "i"}
                    })

                    if recipe:
                        for ing in recipe.get("ingredients", []):
                            ing_product = await db.stock_products.find_one({"id": ing["product_id"], "is_active": True})
                            if ing_product:
                                ing_qty = ing["quantity"] * item_qty
                                old_qty = ing_product.get("quantity", 0)
                                new_qty = max(0, old_qty - ing_qty)
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
                                    "unit": ing_product.get("unit", ""),
                                    "unit_price": ing_product.get("purchase_price", 0),
                                    "total_value": round(ing_qty * ing_product.get("purchase_price", 0), 2),
                                    "reason": f"Vente (Recette: {recipe['name']}) - Facture {invoice_number}",
                                    "user_name": current_invoice.get("created_by", "Caisse"),
                                    "invoice_id": invoice_id,
                                    "recipe_id": recipe["id"],
                                    "created_at": now_iso,
                                }
                                await db.stock_movements.insert_one(stock_mov)
                                await db.stock_products.update_one(
                                    {"id": ing_product["id"]},
                                    {"$set": {
                                        "quantity": round(new_qty, 3),
                                        "valeur_stock": round(new_valeur, 2),
                                        "statut": new_statut,
                                        "updated_at": now_iso,
                                    }}
                                )
                                logger.info(f"Stock recipe deduction: {ing_product['name']} {old_qty} -> {round(new_qty, 3)} (recipe: {recipe['name']}, invoice {invoice_number})")
                    else:
                        stock_product = await db.stock_products.find_one({
                            "name": {"$regex": f"^{re.escape(item_name[:20])}", "$options": "i"},
                            "is_active": True
                        })
                        if stock_product:
                            old_qty = stock_product.get("quantity", 0)
                            new_qty = max(0, old_qty - item_qty)
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
                                "unit": stock_product.get("unit", ""),
                                "unit_price": item_price,
                                "total_value": item_qty * item_price,
                                "reason": f"Vente - Facture {invoice_number}",
                                "user_name": current_invoice.get("created_by", "Caisse"),
                                "invoice_id": invoice_id,
                                "created_at": now_iso,
                            }
                            await db.stock_movements.insert_one(stock_mov)
                            await db.stock_products.update_one(
                                {"id": stock_product["id"]},
                                {"$set": {
                                    "quantity": new_qty,
                                    "valeur_stock": new_valeur,
                                    "statut": new_statut,
                                    "updated_at": now_iso,
                                }}
                            )
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
            except Exception as stock_err:
                logger.error(f"Error syncing invoice to stock: {stock_err}")

        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str):
    """Delete an invoice"""
    try:
        result = await db.invoices.delete_one({"id": invoice_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Facture non trouvée")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== UPDATE ITEMS ====================

@router.put("/invoices/{invoice_id}/update-items")
async def update_invoice_items(invoice_id: str, data: dict = Body(...)):
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

