"""
Compte courant — avances du promoteur à l'entreprise.

Plusieurs comptes possibles (ex : "Avance janvier 2026", "Prêt locaux").
Chaque compte :
  - total_advance : montant total avancé
  - schedule : échéancier prévu (liste de dates + montants attendus)
  - repayments : remboursements réellement effectués

Alertes : les échéances `due` dont la date est passée et le cumul remboursé
inférieur au cumul attendu sont marquées `is_late`.
"""
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from datetime import datetime, timezone, date
from typing import List, Optional
import uuid
import logging

router = APIRouter(tags=["current-accounts"])
db = None
logger = logging.getLogger(__name__)


def set_db(database):
    global db
    db = database


class ScheduleEntry(BaseModel):
    label: Optional[str] = ""
    due_date: str  # YYYY-MM-DD
    expected_amount: float


class AccountCreate(BaseModel):
    name: str
    total_advance: float
    received_date: Optional[str] = None  # YYYY-MM-DD
    description: Optional[str] = ""
    notes: Optional[str] = ""
    schedule: Optional[List[ScheduleEntry]] = None


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    total_advance: Optional[float] = None
    received_date: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    schedule: Optional[List[ScheduleEntry]] = None
    is_closed: Optional[bool] = None


class RepaymentCreate(BaseModel):
    repayment_date: str  # YYYY-MM-DD
    amount: float
    method: str = "cash"  # cash, bank_transfer, mobile_money, cheque, autre
    reference: Optional[str] = ""
    notes: Optional[str] = ""
    schedule_id: Optional[str] = None  # optional link to a schedule entry


def _enrich_account(acc: dict) -> dict:
    """Add computed fields: total_repaid, balance_remaining, progress_pct, schedule alerts."""
    today = date.today().isoformat()
    repayments = acc.get("repayments") or []
    schedule = acc.get("schedule") or []

    total_repaid = sum(r.get("amount", 0) or 0 for r in repayments)
    total = acc.get("total_advance", 0) or 0
    balance = total - total_repaid
    progress = (total_repaid / total * 100) if total > 0 else 0

    # Enrich schedule entries
    schedule_sorted = sorted(schedule, key=lambda s: s.get("due_date") or "")
    cumul_expected = 0
    enriched_schedule = []
    for s in schedule_sorted:
        cumul_expected += s.get("expected_amount", 0) or 0
        due = s.get("due_date") or ""
        # An entry is considered "paid" when total_repaid covers the cumulative expected up to this point
        paid = total_repaid >= cumul_expected
        is_late = (not paid) and due and due < today
        enriched_schedule.append({
            **s,
            "cumulative_expected": cumul_expected,
            "paid": paid,
            "is_late": is_late,
        })

    # Next due (first unpaid)
    next_due = next((s for s in enriched_schedule if not s["paid"]), None)
    late_count = sum(1 for s in enriched_schedule if s.get("is_late"))
    late_amount = max(0, (next((s["cumulative_expected"] for s in enriched_schedule if s.get("is_late")), 0) - total_repaid)) if late_count > 0 else 0

    return {
        **acc,
        "schedule": enriched_schedule,
        "total_repaid": total_repaid,
        "balance_remaining": balance,
        "progress_pct": round(progress, 1),
        "next_due_date": (next_due or {}).get("due_date"),
        "next_due_amount": (next_due or {}).get("expected_amount"),
        "is_fully_repaid": total > 0 and total_repaid >= total,
        "late_count": late_count,
        "late_amount": late_amount,
    }


@router.get("/current-accounts")
async def list_accounts(include_closed: bool = True):
    query = {} if include_closed else {"is_closed": {"$ne": True}}
    items = await db.current_accounts.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    enriched = [_enrich_account(a) for a in items]
    # Aggregate totals
    total_advance = sum(a.get("total_advance", 0) or 0 for a in enriched)
    total_repaid = sum(a.get("total_repaid", 0) or 0 for a in enriched)
    total_balance = sum(a.get("balance_remaining", 0) or 0 for a in enriched)
    total_late = sum(a.get("late_amount", 0) or 0 for a in enriched)
    return {
        "accounts": enriched,
        "summary": {
            "count": len(enriched),
            "total_advance": total_advance,
            "total_repaid": total_repaid,
            "total_balance": total_balance,
            "total_late": total_late,
        },
    }


@router.get("/current-accounts/{account_id}")
async def get_account(account_id: str):
    acc = await db.current_accounts.find_one({"id": account_id}, {"_id": 0})
    if not acc:
        raise HTTPException(404, "Compte non trouvé")
    return _enrich_account(acc)


@router.post("/current-accounts")
async def create_account(data: AccountCreate):
    try:
        schedule = []
        for s in (data.schedule or []):
            schedule.append({
                "id": str(uuid.uuid4()),
                "label": s.label or "",
                "due_date": s.due_date,
                "expected_amount": s.expected_amount,
            })
        doc = {
            "id": str(uuid.uuid4()),
            "name": data.name,
            "total_advance": data.total_advance,
            "received_date": data.received_date or date.today().isoformat(),
            "description": data.description or "",
            "notes": data.notes or "",
            "schedule": schedule,
            "repayments": [],
            "is_closed": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.current_accounts.insert_one(doc)
        doc.pop("_id", None)
        return {"success": True, "account": _enrich_account(doc)}
    except Exception as e:
        logger.error(f"Create account error: {e}")
        raise HTTPException(500, str(e))


@router.put("/current-accounts/{account_id}")
async def update_account(account_id: str, data: AccountUpdate):
    try:
        update = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
        if "schedule" in update:
            new_sched = []
            for s in update["schedule"]:
                s_dict = s if isinstance(s, dict) else s.model_dump()
                new_sched.append({
                    "id": s_dict.get("id") or str(uuid.uuid4()),
                    "label": s_dict.get("label") or "",
                    "due_date": s_dict["due_date"],
                    "expected_amount": s_dict["expected_amount"],
                })
            update["schedule"] = new_sched
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        res = await db.current_accounts.update_one({"id": account_id}, {"$set": update})
        if res.matched_count == 0:
            raise HTTPException(404, "Compte non trouvé")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update account error: {e}")
        raise HTTPException(500, str(e))


@router.delete("/current-accounts/{account_id}")
async def delete_account(account_id: str):
    res = await db.current_accounts.delete_one({"id": account_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Compte non trouvé")
    return {"success": True}


@router.post("/current-accounts/{account_id}/repayments")
async def add_repayment(account_id: str, data: RepaymentCreate):
    try:
        acc = await db.current_accounts.find_one({"id": account_id}, {"_id": 0})
        if not acc:
            raise HTTPException(404, "Compte non trouvé")
        repayment = {
            "id": str(uuid.uuid4()),
            "repayment_date": data.repayment_date,
            "amount": data.amount,
            "method": data.method,
            "reference": data.reference or "",
            "notes": data.notes or "",
            "schedule_id": data.schedule_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.current_accounts.update_one(
            {"id": account_id},
            {"$push": {"repayments": repayment}},
        )
        return {"success": True, "repayment": repayment}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Add repayment error: {e}")
        raise HTTPException(500, str(e))


@router.delete("/current-accounts/{account_id}/repayments/{repayment_id}")
async def delete_repayment(account_id: str, repayment_id: str):
    res = await db.current_accounts.update_one(
        {"id": account_id},
        {"$pull": {"repayments": {"id": repayment_id}}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Compte ou remboursement non trouvé")
    return {"success": True}
