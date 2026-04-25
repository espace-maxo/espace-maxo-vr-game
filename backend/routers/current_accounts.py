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


VALID_FIXED_PERIODS = {"daily", "weekly", "monthly", "yearly"}


class AccountCreate(BaseModel):
    name: str
    total_advance: float
    received_date: Optional[str] = None  # YYYY-MM-DD
    description: Optional[str] = ""
    notes: Optional[str] = ""
    schedule: Optional[List[ScheduleEntry]] = None
    auto_deduct_enabled: Optional[bool] = False
    # % des recettes journalières (mode cumul journalier)
    repayment_percentage: Optional[float] = None  # 0-100, null = désactivé
    # Montant fixe par période (prélèvement en fin de période)
    repayment_fixed_amount: Optional[float] = None  # null = désactivé
    repayment_fixed_period: Optional[str] = None  # daily | weekly | monthly | yearly
    repayment_fixed_start_date: Optional[str] = None  # YYYY-MM-DD, début effectif


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    total_advance: Optional[float] = None
    received_date: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    schedule: Optional[List[ScheduleEntry]] = None
    is_closed: Optional[bool] = None
    auto_deduct_enabled: Optional[bool] = None
    repayment_percentage: Optional[float] = None
    repayment_fixed_amount: Optional[float] = None
    repayment_fixed_period: Optional[str] = None
    repayment_fixed_start_date: Optional[str] = None


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
    allocated_to_expenses = sum(
        (r.get("amount", 0) or 0)
        for r in repayments
        if r.get("method") == "expense_allocation"
    )
    total = acc.get("total_advance", 0) or 0
    balance = total - total_repaid
    # Amount still available for funding new expenses (promoter money left in the account)
    balance_available = max(0, total - total_repaid)
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
        "allocated_to_expenses": allocated_to_expenses,
        "balance_remaining": balance,
        "balance_available": balance_available,
        "progress_pct": round(progress, 1),
        "next_due_date": (next_due or {}).get("due_date"),
        "next_due_amount": (next_due or {}).get("expected_amount"),
        "is_fully_repaid": total > 0 and total_repaid >= total,
        "late_count": late_count,
        "late_amount": late_amount,
    }


@router.get("/current-accounts")
async def list_accounts(include_closed: bool = True, auto_run: bool = True):
    # Run auto-deduction for accounts with any auto-repayment config (idempotent)
    if auto_run:
        try:
            today = date.today().isoformat()
            enabled = await db.current_accounts.find({
                "$and": [
                    {"is_closed": {"$ne": True}},
                    {"$or": [
                        {"auto_deduct_enabled": True},
                        {"repayment_percentage": {"$gt": 0}},
                        {"repayment_fixed_amount": {"$gt": 0}},
                    ]},
                ],
            }, {"_id": 0}).to_list(500)
            for acc in enabled:
                await _run_auto_deduction_for_account(acc, today)
        except Exception as auto_err:
            logger.warning(f"Auto-deduction during list failed: {auto_err}")

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
            "auto_deduct_enabled": bool(data.auto_deduct_enabled),
            "repayment_percentage": data.repayment_percentage,
            "repayment_fixed_amount": data.repayment_fixed_amount,
            "repayment_fixed_period": data.repayment_fixed_period if data.repayment_fixed_period in VALID_FIXED_PERIODS else None,
            "repayment_fixed_start_date": data.repayment_fixed_start_date,
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
        # Keep None for nullable repayment config fields (to be able to CLEAR them)
        NULLABLE_FIELDS = {"repayment_percentage", "repayment_fixed_amount", "repayment_fixed_period", "repayment_fixed_start_date"}
        raw = data.model_dump(exclude_unset=True)
        update = {k: v for k, v in raw.items() if v is not None or k in NULLABLE_FIELDS}
        # Validate fixed period
        if update.get("repayment_fixed_period") and update["repayment_fixed_period"] not in VALID_FIXED_PERIODS:
            raise HTTPException(400, "repayment_fixed_period invalide")
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



class TopUpBody(BaseModel):
    amount: float
    label: Optional[str] = None
    received_date: Optional[str] = None  # YYYY-MM-DD


@router.post("/current-accounts/{account_id}/top-up")
async def top_up_account(account_id: str, data: TopUpBody):
    """Manual top-up: increase total_advance by `amount` and record a top_ups[] entry."""
    try:
        if data.amount is None or float(data.amount) <= 0:
            raise HTTPException(400, "Le montant doit être strictement positif")
        acc = await db.current_accounts.find_one({"id": account_id}, {"_id": 0})
        if not acc:
            raise HTTPException(404, "Compte non trouvé")
        now_iso = datetime.now(timezone.utc).isoformat()
        today_iso = datetime.now(timezone.utc).date().isoformat()
        top_up = {
            "id": str(uuid.uuid4()),
            "amount": float(data.amount),
            "label": (data.label or "Recharge manuelle"),
            "received_date": data.received_date or today_iso,
            "created_at": now_iso,
        }
        await db.current_accounts.update_one(
            {"id": account_id},
            {
                "$inc": {"total_advance": float(data.amount)},
                "$push": {"top_ups": top_up},
            },
        )
        refreshed = await db.current_accounts.find_one({"id": account_id}, {"_id": 0})
        return {"success": True, "account": refreshed, "top_up": top_up}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Top-up account error: {e}")
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


# ==================== AUTO-DEDUCTION (from daily revenue) ====================

async def _compute_daily_revenue(target_date: str) -> float:
    """Return today's validated revenue (sum of validated invoices for target_date, YYYY-MM-DD)."""
    try:
        invs = await db.invoices.find({
            "created_at": {"$regex": f"^{target_date}"},
            "validation_status": "validated",
        }, {"_id": 0, "total": 1}).to_list(5000)
        return sum((i.get("total") or 0) for i in invs)
    except Exception:
        return 0


def _fixed_period_key(period: str, run_date: str) -> str:
    """Return a stable string for the period containing `run_date`. Used as idempotency key.
      daily  → 'YYYY-MM-DD'
      weekly → 'YYYY-Wnn' (ISO week)
      monthly→ 'YYYY-MM'
      yearly → 'YYYY'
    """
    try:
        d = datetime.fromisoformat(run_date).date()
        if period == "weekly":
            y, w, _ = d.isocalendar()
            return f"{y:04d}-W{w:02d}"
        if period == "monthly":
            return d.strftime("%Y-%m")
        if period == "yearly":
            return d.strftime("%Y")
        return d.isoformat()
    except Exception:
        return run_date


def _is_end_of_period(period: str, run_date: str) -> bool:
    """Return True if run_date is the LAST day of the given period.
    daily → always True. weekly → Sunday. monthly → last day of month. yearly → 12-31.
    """
    try:
        d = datetime.fromisoformat(run_date).date()
        if period == "daily":
            return True
        if period == "weekly":
            return d.weekday() == 6  # Sunday
        if period == "monthly":
            import calendar
            last = calendar.monthrange(d.year, d.month)[1]
            return d.day == last
        if period == "yearly":
            return d.month == 12 and d.day == 31
    except Exception:
        pass
    return False


async def _run_auto_deduction_for_account(acc: dict, run_date: str) -> dict:
    """Run all enabled auto-deduction modes for a single account (schedule, percentage, fixed-recurring).

    All modes are idempotent per day/period via distinct `reference` prefixes:
      - schedule: AUTO-{schedule_id}-{date}
      - percentage: AUTO-PCT-{date}
      - fixed_recurring: AUTO-FIX-{period_key}

    Returns a summary dict aggregating created repayments.
    """
    if acc.get("is_closed"):
        return {"created": 0, "reason": "closed"}

    total_advance = acc.get("total_advance", 0) or 0
    repayments = list(acc.get("repayments") or [])
    total_repaid = sum(r.get("amount", 0) or 0 for r in repayments)

    created_entries = []
    daily_revenue = await _compute_daily_revenue(run_date)
    used_revenue = 0  # tracks how much of today's revenue we've allocated

    def _remaining_cap() -> float:
        """Amount still repayable without exceeding total_advance."""
        return max(0, total_advance - total_repaid - sum(r["amount"] for r in created_entries))

    # ---- MODE 1: Schedule-based (existing) ----
    if acc.get("auto_deduct_enabled"):
        schedule = sorted(acc.get("schedule") or [], key=lambda s: s.get("due_date") or "")
        cumul = 0
        for s in schedule:
            cumul += s.get("expected_amount", 0) or 0
            due = s.get("due_date") or ""
            if not due or due > run_date:
                continue
            if total_repaid >= cumul:
                continue
            sched_id = s.get("id") or ""
            already = any((r.get("reference") or "").startswith(f"AUTO-{sched_id}") for r in repayments)
            if already:
                continue
            missing = cumul - total_repaid
            remaining_revenue = max(0, daily_revenue - used_revenue)
            if remaining_revenue <= 0:
                break
            deduct = min(missing, remaining_revenue, _remaining_cap())
            if deduct <= 0:
                continue
            repayment = {
                "id": str(uuid.uuid4()),
                "repayment_date": run_date,
                "amount": round(deduct, 2),
                "method": "auto_deduction",
                "reference": f"AUTO-{sched_id}-{run_date}",
                "notes": f"Prélèvement planning du {run_date}",
                "schedule_id": sched_id,
                "auto": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            created_entries.append(repayment)
            used_revenue += deduct

    # ---- MODE 2: Percentage of daily revenue (cumul journalier) ----
    pct = acc.get("repayment_percentage")
    if pct and pct > 0:
        ref_today = f"AUTO-PCT-{run_date}"
        already_pct = any(r.get("reference") == ref_today for r in repayments + created_entries)
        if not already_pct:
            # Percentage applied to TODAY's revenue minus amount already used by schedule mode
            remaining_revenue = max(0, daily_revenue - used_revenue)
            deduct = min(
                remaining_revenue * float(pct) / 100.0,
                _remaining_cap(),
            )
            if deduct > 0:
                repayment = {
                    "id": str(uuid.uuid4()),
                    "repayment_date": run_date,
                    "amount": round(deduct, 2),
                    "method": "auto_percentage",
                    "reference": ref_today,
                    "notes": f"Prélèvement {pct}% des recettes du {run_date}",
                    "auto": True,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                created_entries.append(repayment)
                used_revenue += deduct

    # ---- MODE 3: Fixed amount at end of period ----
    fixed_amount = acc.get("repayment_fixed_amount")
    fixed_period = acc.get("repayment_fixed_period")
    fixed_start = acc.get("repayment_fixed_start_date")
    if fixed_amount and fixed_amount > 0 and fixed_period in VALID_FIXED_PERIODS:
        # Only deduct if run_date is at the end of the period AND start_date has been reached
        if _is_end_of_period(fixed_period, run_date) and (not fixed_start or fixed_start <= run_date):
            period_key = _fixed_period_key(fixed_period, run_date)
            ref_period = f"AUTO-FIX-{period_key}"
            already_fix = any(r.get("reference") == ref_period for r in repayments + created_entries)
            if not already_fix:
                deduct = min(float(fixed_amount), _remaining_cap())
                if deduct > 0:
                    repayment = {
                        "id": str(uuid.uuid4()),
                        "repayment_date": run_date,
                        "amount": round(deduct, 2),
                        "method": "auto_fixed",
                        "reference": ref_period,
                        "notes": f"Prélèvement fixe ({fixed_period}) — période {period_key}",
                        "auto": True,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    }
                    created_entries.append(repayment)

    if created_entries:
        await db.current_accounts.update_one(
            {"id": acc["id"]},
            {"$push": {"repayments": {"$each": created_entries}}},
        )
    return {
        "created": len(created_entries),
        "amount_deducted": sum(r["amount"] for r in created_entries),
        "revenue_used": used_revenue,
        "daily_revenue": daily_revenue,
    }


@router.post("/current-accounts/run-auto-deduction")
async def run_auto_deduction(body: dict = Body(default={})):
    """Trigger auto-deduction manually. Body can provide target_date (YYYY-MM-DD), default today."""
    try:
        target_date = (body or {}).get("date") or date.today().isoformat()
        accounts = await db.current_accounts.find({
            "$and": [
                {"is_closed": {"$ne": True}},
                {"$or": [
                    {"auto_deduct_enabled": True},
                    {"repayment_percentage": {"$gt": 0}},
                    {"repayment_fixed_amount": {"$gt": 0}},
                ]},
            ],
        }, {"_id": 0}).to_list(500)
        results = []
        total_created = 0
        total_amount = 0
        for acc in accounts:
            r = await _run_auto_deduction_for_account(acc, target_date)
            results.append({"account_id": acc["id"], "name": acc.get("name"), **r})
            total_created += r.get("created", 0)
            total_amount += r.get("amount_deducted", 0)
        return {
            "success": True,
            "date": target_date,
            "accounts_processed": len(accounts),
            "repayments_created": total_created,
            "total_deducted": total_amount,
            "results": results,
        }
    except Exception as e:
        logger.error(f"Auto-deduction error: {e}")
        raise HTTPException(500, str(e))
