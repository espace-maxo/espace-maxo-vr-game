"""
Caisse Pro - Invoice Routes
Handles all invoice-related endpoints
"""
from fastapi import APIRouter, HTTPException, Query, Body
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
import uuid
import io
import logging

from models.caisse import InvoiceCreate, Invoice

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Invoices"])

# Database reference will be set by main app
db = None

def set_db(database):
    global db
    db = database


@router.post("/invoices")
async def create_invoice(invoice_data: InvoiceCreate):
    """Create a new invoice (pending validation)"""
    try:
        # Generate invoice number (EM-YYYYMMDD-XXXX)
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        count = await db.invoices.count_documents({"created_at": {"$regex": f"^{today[:4]}-{today[4:6]}-{today[6:8]}"}})
        invoice_number = f"EM-{today}-{count + 1:04d}"
        
        invoice = Invoice(
            **invoice_data.model_dump(),
            invoice_number=invoice_number
        )
        
        invoice_dict = invoice.model_dump()
        await db.invoices.insert_one(invoice_dict)
        
        return {"success": True, "invoice": {k: v for k, v in invoice_dict.items() if k != "_id"}}
    except Exception as e:
        logger.error(f"Error creating invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/invoices")
async def get_invoices(
    date: str = None,
    role: str = None,
    created_by: str = None
):
    """Get invoices with optional filtering"""
    try:
        query = {}
        
        if date:
            query["created_at"] = {"$regex": f"^{date}"}
        
        if role == 'server' and created_by:
            query["created_by"] = created_by
        
        invoices = await db.invoices.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
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
    """Update an invoice (validation, etc.)"""
    try:
        invoice_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = await db.invoices.update_one({"id": invoice_id}, {"$set": invoice_data})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Facture non trouvée")
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
        discount_amount = invoice.get("discount_amount", 0)
        new_total = subtotal - discount_amount
        
        await db.invoices.update_one(
            {"id": invoice_id},
            {"$set": {
                "items": items,
                "subtotal": subtotal,
                "total": new_total,
                "modification_allowed": False,
                "modified_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return {"success": True, "message": "Facture modifiée"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating invoice items: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/invoices/stats")
async def get_invoice_stats(date: str = Query(...)):
    """Get daily invoice statistics"""
    try:
        invoices = await db.invoices.find(
            {"created_at": {"$regex": f"^{date}"}},
            {"_id": 0}
        ).to_list(1000)
        
        validated = [i for i in invoices if i.get('validation_status') == 'validated']
        
        total_revenue = sum(i.get('total', 0) for i in validated)
        
        by_department = {"salle_jardin": 0, "jeux": 0, "bar": 0, "location": 0, "autres": 0}
        for inv in validated:
            dept_totals = inv.get('totals_by_department', {})
            by_department["salle_jardin"] += dept_totals.get("salle_jardin", 0) + dept_totals.get("jardin", 0)
            by_department["jeux"] += dept_totals.get("jeux", 0)
            by_department["bar"] += dept_totals.get("bar", 0)
            by_department["location"] += dept_totals.get("location", 0)
            by_department["autres"] += dept_totals.get("autres", 0)
        
        return {
            "date": date,
            "total_invoices": len(invoices),
            "validated_invoices": len(validated),
            "total_revenue": total_revenue,
            "by_department": by_department
        }
    except Exception as e:
        logger.error(f"Error fetching stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/invoices/stats/monthly")
async def get_monthly_stats(year: int = Query(...), month: int = Query(...)):
    """Get monthly invoice statistics"""
    try:
        date_prefix = f"{year}-{month:02d}"
        invoices = await db.invoices.find(
            {"created_at": {"$regex": f"^{date_prefix}"}},
            {"_id": 0}
        ).to_list(5000)
        
        validated = [i for i in invoices if i.get('validation_status') == 'validated']
        
        total_revenue = sum(i.get('total', 0) for i in validated)
        
        by_department = {"salle_jardin": 0, "jeux": 0, "bar": 0, "location": 0, "autres": 0}
        for inv in validated:
            dept_totals = inv.get('totals_by_department', {})
            by_department["salle_jardin"] += dept_totals.get("salle_jardin", 0) + dept_totals.get("jardin", 0)
            by_department["jeux"] += dept_totals.get("jeux", 0)
            by_department["bar"] += dept_totals.get("bar", 0)
            by_department["location"] += dept_totals.get("location", 0)
            by_department["autres"] += dept_totals.get("autres", 0)
        
        daily_stats = {}
        for inv in validated:
            day = inv.get('created_at', '')[:10]
            if day not in daily_stats:
                daily_stats[day] = {'count': 0, 'revenue': 0}
            daily_stats[day]['count'] += 1
            daily_stats[day]['revenue'] += inv.get('total', 0)
        
        return {
            "year": year,
            "month": month,
            "total_invoices": len(invoices),
            "validated_invoices": len(validated),
            "total_revenue": total_revenue,
            "by_department": by_department,
            "daily_stats": daily_stats
        }
    except Exception as e:
        logger.error(f"Error fetching monthly stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))
