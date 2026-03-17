"""
Caisse Pro - Service Reports Routes
Handles server daily reports and end-of-service reports
"""
from fastapi import APIRouter, HTTPException, Query, Body
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import Optional
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Service Reports"])

# Database reference will be set by main app
db = None

def set_db(database):
    global db
    db = database


class ReportValidationRequest(BaseModel):
    action: str  # validate, request_revision, reject
    comment: Optional[str] = None
    validated_by: str


@router.get("/server-daily-report/{server_name}")
async def get_server_daily_report(server_name: str, date: Optional[str] = None):
    """Get daily report for a specific server"""
    try:
        target_date = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        # Get all invoices for this server on this date
        invoices = await db.invoices.find({
            "created_by": server_name,
            "created_at": {"$regex": f"^{target_date}"}
        }, {"_id": 0}).to_list(500)
        
        # Calculate stats
        total_invoices = len(invoices)
        validated_invoices = [inv for inv in invoices if inv.get("validation_status") == "validated"]
        pending_invoices = [inv for inv in invoices if inv.get("validation_status") == "pending"]
        
        total_sales = sum(inv.get("total", 0) for inv in validated_invoices)
        
        # Group by department
        dept_sales = {}
        for inv in validated_invoices:
            for item in inv.get("items", []):
                dept = item.get("department", "autres")
                if dept not in dept_sales:
                    dept_sales[dept] = {"count": 0, "total": 0}
                dept_sales[dept]["count"] += item.get("quantity", 1)
                dept_sales[dept]["total"] += item.get("subtotal", 0)
        
        # Group by payment method
        payment_methods = {}
        for inv in validated_invoices:
            method = inv.get("payment_method", "especes")
            if method not in payment_methods:
                payment_methods[method] = {"count": 0, "total": 0}
            payment_methods[method]["count"] += 1
            payment_methods[method]["total"] += inv.get("total", 0)
        
        return {
            "server_name": server_name,
            "date": target_date,
            "total_invoices": total_invoices,
            "validated_count": len(validated_invoices),
            "pending_count": len(pending_invoices),
            "total_sales": total_sales,
            "department_breakdown": dept_sales,
            "payment_methods": payment_methods,
            "invoices": invoices
        }
    except Exception as e:
        logger.error(f"Error fetching server daily report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/server-end-of-service")
async def create_end_of_service_report(report_data: dict = Body(...)):
    """Create an end of service report for a server and notify manager"""
    try:
        server_name = report_data.get("server_name")
        server_id = report_data.get("server_id")
        observation = report_data.get("observation", "")
        target_date = report_data.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
        
        # Get server's daily stats
        invoices = await db.invoices.find({
            "created_by": server_name,
            "created_at": {"$regex": f"^{target_date}"}
        }, {"_id": 0}).to_list(500)
        
        total_invoices = len(invoices)
        validated_invoices = len([inv for inv in invoices if inv.get("validation_status") == "validated"])
        pending_invoices = len([inv for inv in invoices if inv.get("validation_status") == "pending"])
        total_sales = sum(inv.get("total", 0) for inv in invoices if inv.get("validation_status") == "validated")
        
        # Create the report
        report = {
            "id": str(uuid.uuid4()),
            "server_name": server_name,
            "server_id": server_id,
            "date": target_date,
            "total_invoices": total_invoices,
            "validated_invoices": validated_invoices,
            "pending_invoices": pending_invoices,
            "total_sales": total_sales,
            "observation": observation,
            "status": "pending",  # Add default status
            "is_read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.server_end_of_service_reports.insert_one(report)
        
        return {
            "success": True,
            "report": {k: v for k, v in report.items() if k != "_id"}
        }
    except Exception as e:
        logger.error(f"Error creating end of service report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/server-end-of-service-reports")
async def get_end_of_service_reports(unread_only: bool = False, date: Optional[str] = None):
    """Get all end of service reports (for Manager/Admin)"""
    try:
        query = {}
        if unread_only:
            query["is_read"] = False
        if date:
            query["date"] = date
            
        reports = await db.server_end_of_service_reports.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
        unread_count = await db.server_end_of_service_reports.count_documents({"is_read": False})
        return {"reports": reports, "unread_count": unread_count}
    except Exception as e:
        logger.error(f"Error fetching end of service reports: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/server-end-of-service-reports/{report_id}/read")
async def mark_service_report_read(report_id: str):
    """Mark a service report as read"""
    try:
        await db.server_end_of_service_reports.update_one(
            {"id": report_id},
            {"$set": {"is_read": True}}
        )
        return {"success": True}
    except Exception as e:
        logger.error(f"Error marking report as read: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/server-end-of-service-reports/mark-all-read")
async def mark_all_service_reports_read():
    """Mark all service reports as read"""
    try:
        result = await db.server_end_of_service_reports.update_many(
            {"is_read": False},
            {"$set": {"is_read": True}}
        )
        return {"success": True, "count": result.modified_count}
    except Exception as e:
        logger.error(f"Error marking all reports as read: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/server-end-of-service-reports/{report_id}/compare")
async def compare_service_report(report_id: str):
    """Compare server's declared report with actual data from invoices"""
    try:
        report = await db.server_end_of_service_reports.find_one({"id": report_id}, {"_id": 0})
        if not report:
            raise HTTPException(status_code=404, detail="Rapport non trouvé")
        
        server_name = report.get("server_name")
        report_date = report.get("date")
        
        # Get actual invoices created by this server on this date
        date_start = f"{report_date}T00:00:00"
        date_end = f"{report_date}T23:59:59"
        
        actual_invoices = await db.invoices.find({
            "created_by": server_name,
            "created_at": {"$gte": date_start, "$lte": date_end}
        }, {"_id": 0}).to_list(500)
        
        actual_count = len(actual_invoices)
        actual_validated = len([inv for inv in actual_invoices if inv.get("validation_status") == "validated"])
        actual_sales = sum(inv.get("total", 0) for inv in actual_invoices if inv.get("validation_status") == "validated")
        
        # Calculate discrepancies
        declared_invoices = report.get("total_invoices", 0)
        declared_sales = report.get("total_sales", 0)
        
        discrepancy_invoices = actual_count - declared_invoices
        discrepancy_sales = actual_sales - declared_sales
        
        comparison = {
            "report_id": report_id,
            "server_name": server_name,
            "date": report_date,
            "declared": {
                "total_invoices": declared_invoices,
                "validated_invoices": report.get("validated_invoices", 0),
                "total_sales": declared_sales
            },
            "actual": {
                "total_invoices": actual_count,
                "validated_invoices": actual_validated,
                "total_sales": actual_sales
            },
            "discrepancy": {
                "invoices": discrepancy_invoices,
                "sales": discrepancy_sales,
                "has_discrepancy": discrepancy_invoices != 0 or abs(discrepancy_sales) > 1
            },
            "invoices_detail": actual_invoices
        }
        
        # Update the report with actual data
        await db.server_end_of_service_reports.update_one(
            {"id": report_id},
            {"$set": {
                "actual_invoices": actual_count,
                "actual_validated": actual_validated,
                "actual_sales": actual_sales,
                "discrepancy_invoices": discrepancy_invoices,
                "discrepancy_sales": discrepancy_sales
            }}
        )
        
        return comparison
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error comparing service report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/server-end-of-service-reports/{report_id}/validate")
async def validate_service_report(report_id: str, request: ReportValidationRequest):
    """Validate, request revision, or reject a service report"""
    try:
        report = await db.server_end_of_service_reports.find_one({"id": report_id})
        if not report:
            raise HTTPException(status_code=404, detail="Rapport non trouvé")
        
        status_map = {
            "validate": "validated",
            "request_revision": "revision_requested",
            "reject": "rejected"
        }
        
        new_status = status_map.get(request.action)
        if not new_status:
            raise HTTPException(status_code=400, detail="Action invalide. Utilisez: validate, request_revision, ou reject")
        
        update_data = {
            "status": new_status,
            "validation_comment": request.comment,
            "validated_by": request.validated_by,
            "validated_at": datetime.now(timezone.utc).isoformat(),
            "is_read": True
        }
        
        await db.server_end_of_service_reports.update_one(
            {"id": report_id},
            {"$set": update_data}
        )
        
        # Create notification for the server if revision requested or rejected
        if new_status in ["revision_requested", "rejected"]:
            notification = {
                "id": str(uuid.uuid4()),
                "type": "report_feedback",
                "server_name": report.get("server_name"),
                "status": new_status,
                "comment": request.comment,
                "from": request.validated_by,
                "report_date": report.get("date"),
                "is_read": False,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.server_notifications.insert_one(notification)
        
        return {"success": True, "status": new_status, "message": f"Rapport {new_status}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating service report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/server-notifications/{server_name}")
async def get_server_notifications(server_name: str):
    """Get notifications for a specific server"""
    try:
        notifications = await db.server_notifications.find(
            {"server_name": server_name, "is_read": False},
            {"_id": 0}
        ).sort("created_at", -1).to_list(50)
        return {"notifications": notifications}
    except Exception as e:
        logger.error(f"Error fetching server notifications: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/server-notifications/{notification_id}/read")
async def mark_server_notification_read(notification_id: str):
    """Mark a server notification as read"""
    try:
        await db.server_notifications.update_one(
            {"id": notification_id},
            {"$set": {"is_read": True}}
        )
        return {"success": True}
    except Exception as e:
        logger.error(f"Error marking notification as read: {e}")
        raise HTTPException(status_code=500, detail=str(e))
