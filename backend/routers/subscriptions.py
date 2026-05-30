"""
Caisse Pro - Subscriptions/Recurring Invoices Routes
Handles subscriptions and recurring invoices for clients and suppliers
"""
from fastapi import APIRouter, HTTPException, Query, Body
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from typing import Optional, List
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Subscriptions"])

# Database reference will be set by main app
db = None

def set_db(database):
    global db
    db = database


class SubscriptionCreate(BaseModel):
    name: str  # Name of subscription (e.g., "Internet Orange", "Canal+", "Loyer local")
    type: str  # "client" or "supplier"
    category: str  # "internet", "tv", "loyer", "electricite", "eau", "telephone", "assurance", "autre"
    contact_name: str  # Client name or Supplier name
    contact_phone: str = ""
    amount: float
    frequency: str  # "weekly", "monthly", "quarterly", "yearly"
    start_date: str  # YYYY-MM-DD
    next_due_date: str  # YYYY-MM-DD
    payment_method: str = "especes"  # especes, carte, mobile_money, cheque, virement
    notes: str = ""
    is_active: bool = True


class SubscriptionUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    category: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    amount: Optional[float] = None
    frequency: Optional[str] = None
    next_due_date: Optional[str] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class PaymentRecord(BaseModel):
    subscription_id: str
    amount: float
    payment_date: str  # YYYY-MM-DD
    payment_method: str = "especes"
    notes: str = ""


def calculate_next_due_date(current_date: str, frequency: str) -> str:
    """Calculate the next due date based on frequency"""
    date = datetime.strptime(current_date, "%Y-%m-%d")
    
    if frequency == "weekly":
        next_date = date + timedelta(weeks=1)
    elif frequency == "monthly":
        # Add one month
        month = date.month + 1
        year = date.year
        if month > 12:
            month = 1
            year += 1
        day = min(date.day, 28)  # Safe day for all months
        next_date = date.replace(year=year, month=month, day=day)
    elif frequency == "quarterly":
        # Add 3 months
        month = date.month + 3
        year = date.year
        while month > 12:
            month -= 12
            year += 1
        day = min(date.day, 28)
        next_date = date.replace(year=year, month=month, day=day)
    elif frequency == "yearly":
        next_date = date.replace(year=date.year + 1)
    else:
        next_date = date + timedelta(days=30)  # Default to monthly
    
    return next_date.strftime("%Y-%m-%d")


@router.get("/subscriptions")
async def get_subscriptions(
    type: Optional[str] = None,  # client or supplier
    category: Optional[str] = None,
    active_only: bool = True
):
    """Get all subscriptions with optional filtering"""
    try:
        query = {}
        if type:
            query["type"] = type
        if category:
            query["category"] = category
        if active_only:
            query["is_active"] = True
            
        subscriptions = await db.subscriptions.find(query, {"_id": 0}).sort("next_due_date", 1).to_list(500)
        
        # Calculate alerts
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        today_date = datetime.strptime(today, "%Y-%m-%d")
        
        alerts = {
            "upcoming": [],  # Due within 3 days
            "overdue": [],   # Past due date
            "due_today": []  # Due today
        }
        
        for sub in subscriptions:
            if not sub.get("is_active"):
                continue
                
            due_date_str = sub.get("next_due_date", "")
            if due_date_str:
                due_date = datetime.strptime(due_date_str, "%Y-%m-%d")
                days_until_due = (due_date - today_date).days
                
                sub["days_until_due"] = days_until_due
                
                if days_until_due < 0:
                    alerts["overdue"].append(sub)
                elif days_until_due == 0:
                    alerts["due_today"].append(sub)
                elif days_until_due <= 3:
                    alerts["upcoming"].append(sub)
        
        # Statistics
        stats = {
            "total": len(subscriptions),
            "active": len([s for s in subscriptions if s.get("is_active")]),
            "client_count": len([s for s in subscriptions if s.get("type") == "client"]),
            "supplier_count": len([s for s in subscriptions if s.get("type") == "supplier"]),
            "monthly_total_clients": sum(s.get("amount", 0) for s in subscriptions if s.get("type") == "client" and s.get("frequency") == "monthly" and s.get("is_active")),
            "monthly_total_suppliers": sum(s.get("amount", 0) for s in subscriptions if s.get("type") == "supplier" and s.get("frequency") == "monthly" and s.get("is_active")),
            "overdue_count": len(alerts["overdue"]),
            "upcoming_count": len(alerts["upcoming"]) + len(alerts["due_today"])
        }
        
        return {
            "subscriptions": subscriptions,
            "alerts": alerts,
            "stats": stats
        }
    except Exception as e:
        logger.error(f"Error fetching subscriptions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/subscriptions")
async def create_subscription(data: SubscriptionCreate):
    """Create a new subscription"""
    try:
        subscription = {
            "id": str(uuid.uuid4()),
            **data.model_dump(),
            "total_paid": 0,
            "payment_count": 0,
            "last_payment_date": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": "Responsable Op. & Log"
        }
        
        await db.subscriptions.insert_one(subscription)
        
        return {"success": True, "subscription": {k: v for k, v in subscription.items() if k != "_id"}}
    except Exception as e:
        logger.error(f"Error creating subscription: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/subscriptions/{subscription_id}")
async def get_subscription(subscription_id: str):
    """Get a single subscription with payment history"""
    try:
        subscription = await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
        if not subscription:
            raise HTTPException(status_code=404, detail="Abonnement non trouvé")
        
        # Get payment history
        payments = await db.subscription_payments.find(
            {"subscription_id": subscription_id},
            {"_id": 0}
        ).sort("payment_date", -1).to_list(100)
        
        return {"subscription": subscription, "payments": payments}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching subscription: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/subscriptions/{subscription_id}")
async def update_subscription(subscription_id: str, data: SubscriptionUpdate):
    """Update a subscription"""
    try:
        update_data = {k: v for k, v in data.model_dump().items() if v is not None}
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        result = await db.subscriptions.update_one(
            {"id": subscription_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Abonnement non trouvé")
        
        updated = await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
        return {"success": True, "subscription": updated}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating subscription: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/subscriptions/{subscription_id}")
async def delete_subscription(subscription_id: str):
    """Delete a subscription"""
    try:
        result = await db.subscriptions.delete_one({"id": subscription_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Abonnement non trouvé")
        
        # Also delete payment history
        await db.subscription_payments.delete_many({"subscription_id": subscription_id})
        
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting subscription: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/subscriptions/{subscription_id}/pay")
async def record_payment(subscription_id: str, payment: PaymentRecord):
    """Record a payment for a subscription and update next due date"""
    try:
        subscription = await db.subscriptions.find_one({"id": subscription_id})
        if not subscription:
            raise HTTPException(status_code=404, detail="Abonnement non trouvé")
        
        # Create payment record
        payment_record = {
            "id": str(uuid.uuid4()),
            "subscription_id": subscription_id,
            "subscription_name": subscription.get("name"),
            "amount": payment.amount,
            "payment_date": payment.payment_date,
            "payment_method": payment.payment_method,
            "notes": payment.notes,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.subscription_payments.insert_one(payment_record)
        
        # Calculate next due date
        current_due = subscription.get("next_due_date", payment.payment_date)
        frequency = subscription.get("frequency", "monthly")
        next_due = calculate_next_due_date(current_due, frequency)
        
        # Update subscription
        await db.subscriptions.update_one(
            {"id": subscription_id},
            {"$set": {
                "next_due_date": next_due,
                "last_payment_date": payment.payment_date,
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            "$inc": {
                "total_paid": payment.amount,
                "payment_count": 1
            }}
        )
        
        return {
            "success": True,
            "payment": {k: v for k, v in payment_record.items() if k != "_id"},
            "next_due_date": next_due
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error recording payment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/subscriptions/alerts/summary")
async def get_alerts_summary():
    """Get a quick summary of subscription alerts for the header badge"""
    try:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        today_date = datetime.strptime(today, "%Y-%m-%d")
        alert_threshold = (today_date + timedelta(days=3)).strftime("%Y-%m-%d")
        
        # Count overdue
        overdue_count = await db.subscriptions.count_documents({
            "is_active": True,
            "next_due_date": {"$lt": today}
        })
        
        # Count upcoming (within 3 days including today)
        upcoming_count = await db.subscriptions.count_documents({
            "is_active": True,
            "next_due_date": {"$gte": today, "$lte": alert_threshold}
        })
        
        return {
            "overdue": overdue_count,
            "upcoming": upcoming_count,
            "total_alerts": overdue_count + upcoming_count
        }
    except Exception as e:
        logger.error(f"Error fetching alerts summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/subscriptions/payments/history")
async def get_payment_history(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    subscription_id: Optional[str] = None
):
    """Get payment history with optional filtering"""
    try:
        query = {}
        if subscription_id:
            query["subscription_id"] = subscription_id
        if start_date:
            query["payment_date"] = {"$gte": start_date}
        if end_date:
            if "payment_date" in query:
                query["payment_date"]["$lte"] = end_date
            else:
                query["payment_date"] = {"$lte": end_date}
        
        payments = await db.subscription_payments.find(query, {"_id": 0}).sort("payment_date", -1).to_list(500)
        
        total = sum(p.get("amount", 0) for p in payments)
        
        return {"payments": payments, "total": total, "count": len(payments)}
    except Exception as e:
        logger.error(f"Error fetching payment history: {e}")
        raise HTTPException(status_code=500, detail=str(e))
