"""
Caisse Pro - Request Routes
Handles cancellation and modification requests
"""
from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
import uuid
import logging

from models.caisse import CancellationRequest, ModificationRequest

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Requests"])

# Database reference
db = None

def set_db(database):
    global db
    db = database


# ============== CANCELLATION REQUESTS ==============

@router.get("/cancellation-requests")
async def get_cancellation_requests():
    """Get all pending cancellation requests"""
    try:
        requests = await db.cancellation_requests.find(
            {"status": "pending"}, 
            {"_id": 0}
        ).sort("created_at", -1).to_list(100)
        return {"requests": requests}
    except Exception as e:
        logger.error(f"Error fetching cancellation requests: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cancellation-requests")
async def create_cancellation_request(request: CancellationRequest):
    """Create a new cancellation request"""
    try:
        # Check if request already exists for this invoice
        existing = await db.cancellation_requests.find_one({
            "invoice_id": request.invoice_id,
            "status": "pending"
        })
        if existing:
            raise HTTPException(status_code=400, detail="Une demande est déjà en attente pour cette facture")
        
        request_doc = {
            "id": str(uuid.uuid4()),
            "invoice_id": request.invoice_id,
            "invoice_number": request.invoice_number,
            "reason": request.reason,
            "requested_by": request.requested_by,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.cancellation_requests.insert_one(request_doc)
        if "_id" in request_doc:
            del request_doc["_id"]
        return {"success": True, "request": request_doc}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating cancellation request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/cancellation-requests/{request_id}/approve")
async def approve_cancellation_request(request_id: str, approved_by: str = "Admin"):
    """Approve a cancellation request and cancel the invoice"""
    try:
        request_doc = await db.cancellation_requests.find_one({"id": request_id})
        if not request_doc:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        # Cancel the invoice
        await db.invoices.update_one(
            {"id": request_doc["invoice_id"]},
            {"$set": {
                "validation_status": "cancelled",
                "cancelled_by": approved_by,
                "cancelled_at": datetime.now(timezone.utc).isoformat(),
                "cancellation_reason": request_doc["reason"],
                "cancellation_requested_by": request_doc["requested_by"]
            }}
        )
        
        # Update request status
        await db.cancellation_requests.update_one(
            {"id": request_id},
            {"$set": {
                "status": "approved",
                "approved_by": approved_by,
                "approved_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return {"success": True, "message": "Facture annulée avec succès"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving cancellation request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/cancellation-requests/{request_id}/reject")
async def reject_cancellation_request(request_id: str, rejected_by: str = "Admin"):
    """Reject a cancellation request"""
    try:
        result = await db.cancellation_requests.update_one(
            {"id": request_id},
            {"$set": {
                "status": "rejected",
                "rejected_by": rejected_by,
                "rejected_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        return {"success": True, "message": "Demande rejetée"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rejecting cancellation request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============== MODIFICATION REQUESTS ==============

@router.get("/modification-requests")
async def get_modification_requests():
    """Get all pending modification requests"""
    try:
        requests = await db.modification_requests.find(
            {"status": "pending"}, 
            {"_id": 0}
        ).sort("created_at", -1).to_list(100)
        return {"requests": requests}
    except Exception as e:
        logger.error(f"Error fetching modification requests: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/modification-requests")
async def create_modification_request(request: ModificationRequest):
    """Create a new modification request"""
    try:
        # Check if request already exists for this invoice
        existing = await db.modification_requests.find_one({
            "invoice_id": request.invoice_id,
            "status": "pending"
        })
        if existing:
            raise HTTPException(status_code=400, detail="Une demande est déjà en attente pour cette facture")
        
        request_doc = {
            "id": str(uuid.uuid4()),
            "invoice_id": request.invoice_id,
            "invoice_number": request.invoice_number,
            "reason": request.reason,
            "requested_by": request.requested_by,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.modification_requests.insert_one(request_doc)
        if "_id" in request_doc:
            del request_doc["_id"]
        return {"success": True, "request": request_doc}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating modification request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/modification-requests/{request_id}/approve")
async def approve_modification_request(request_id: str, approved_by: str = "Manager"):
    """Approve a modification request - marks invoice as editable"""
    try:
        request_doc = await db.modification_requests.find_one({"id": request_id})
        if not request_doc:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        # Mark the invoice as editable
        await db.invoices.update_one(
            {"id": request_doc["invoice_id"]},
            {"$set": {
                "modification_allowed": True,
                "modification_allowed_by": approved_by,
                "modification_allowed_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        # Update request status
        await db.modification_requests.update_one(
            {"id": request_id},
            {"$set": {
                "status": "approved",
                "approved_by": approved_by,
                "approved_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return {"success": True, "message": "Modification autorisée"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving modification request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/modification-requests/{request_id}/reject")
async def reject_modification_request(request_id: str, rejected_by: str = "Manager"):
    """Reject a modification request"""
    try:
        result = await db.modification_requests.update_one(
            {"id": request_id},
            {"$set": {
                "status": "rejected",
                "rejected_by": rejected_by,
                "rejected_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        return {"success": True, "message": "Demande rejetée"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rejecting modification request: {e}")
        raise HTTPException(status_code=500, detail=str(e))
