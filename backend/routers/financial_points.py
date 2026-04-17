"""
Financial Points Router (Point Financier / Reversement)
Extracted from server.py for better modularity.
"""
from fastapi import APIRouter, HTTPException, Body
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid
import io
import logging

router = APIRouter(tags=["financial-points"])
db = None
logger = logging.getLogger(__name__)


def set_db(database):
    global db
    db = database


class FinancialPointCreate(BaseModel):
    date: str
    end_date: str = ""
    period_type: str = "weekly"
    cash_amount: float = 0  # Espèces
    mobile_amount: float = 0  # Mobile Money
    cheque_amount: float = 0  # Chèque
    wallet_amount: float = 0  # Crédit
    notes: str = ""
    created_by: str = ""
    billettage: dict = {}
    momo_number: str = ""
    destination: str = "admin"  # "admin" ou "banque"


@router.get("/financial-points")
async def get_financial_points(date: str = None, status: str = None, period_type: str = None):
    """Get financial points, optionally filtered by date, status, or period_type"""
    try:
        query = {}
        if date:
            query["$or"] = [{"date": date}, {"date": {"$lte": date}, "end_date": {"$gte": date}}]
        if status:
            query["status"] = status
        if period_type:
            query["period_type"] = period_type

        points = await db.financial_points.find(query, {"_id": 0}).sort("date", -1).to_list(100)
        return {"financial_points": points}
    except Exception as e:
        logger.error(f"Error fetching financial points: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/financial-points/{point_id}")
async def get_financial_point(point_id: str):
    """Get a specific financial point"""
    try:
        point = await db.financial_points.find_one({"id": point_id}, {"_id": 0})
        if not point:
            raise HTTPException(status_code=404, detail="Point financier non trouvé")
        return point
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching financial point: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/financial-points")
async def create_financial_point(data: FinancialPointCreate):
    """Create a new financial point (by manager)"""
    try:
        if data.period_type == "weekly" and data.end_date:
            existing = await db.financial_points.find_one({
                "period_type": "weekly",
                "date": data.date,
                "end_date": data.end_date
            })
        else:
            existing = await db.financial_points.find_one({
                "date": data.date,
                "period_type": data.period_type
            })
        if existing:
            raise HTTPException(status_code=400, detail="Un point financier existe déjà pour cette période")

        total = data.cash_amount + data.mobile_amount + data.cheque_amount + data.wallet_amount

        point = {
            "id": str(uuid.uuid4()),
            "date": data.date,
            "end_date": data.end_date,
            "period_type": data.period_type,
            "cash_amount": data.cash_amount,
            "mobile_amount": data.mobile_amount,
            "cheque_amount": data.cheque_amount,
            "wallet_amount": data.wallet_amount,
            "total_amount": total,
            "notes": data.notes,
            "created_by": data.created_by,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": "pending",
            "admin_validated": False,
            "admin_validated_by": None,
            "admin_validated_at": None,
            "signed": False,
            "signed_by": None,
            "signed_at": None,
            "billettage": data.billettage,
            "momo_number": data.momo_number,
            "destination": data.destination
        }

        await db.financial_points.insert_one(point)
        point.pop("_id", None)

        logger.info(f"Financial point created for {data.date} ({data.period_type}) by {data.created_by}")
        return {"success": True, "financial_point": point}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating financial point: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/financial-points/{point_id}")
async def update_financial_point(point_id: str, data: dict = Body(...)):
    """Update a financial point (only if not signed, or by admin)"""
    try:
        point = await db.financial_points.find_one({"id": point_id})
        if not point:
            raise HTTPException(status_code=404, detail="Point financier non trouvé")

        is_admin = data.pop("is_admin", False)
        if point.get("signed") and not is_admin:
            raise HTTPException(status_code=403, detail="Ce point financier est signé et ne peut être modifié que par l'administrateur")

        if any(key in data for key in ["cash_amount", "mobile_amount", "cheque_amount", "wallet_amount"]):
            cash = data.get("cash_amount", point.get("cash_amount", 0))
            mobile = data.get("mobile_amount", point.get("mobile_amount", 0))
            cheque = data.get("cheque_amount", point.get("cheque_amount", 0))
            wallet = data.get("wallet_amount", point.get("wallet_amount", 0))
            data["total_amount"] = cash + mobile + cheque + wallet

        data["updated_at"] = datetime.now(timezone.utc).isoformat()

        await db.financial_points.update_one(
            {"id": point_id},
            {"$set": data}
        )

        updated = await db.financial_points.find_one({"id": point_id}, {"_id": 0})
        return {"success": True, "financial_point": updated}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating financial point: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/financial-points/{point_id}/admin-validate")
async def admin_validate_financial_point(point_id: str, admin_name: str = Body(..., embed=True)):
    """Admin validates a signed financial point (final step - locks the document)"""
    try:
        point = await db.financial_points.find_one({"id": point_id})
        if not point:
            raise HTTPException(status_code=404, detail="Point financier non trouvé")

        if not point.get("signed"):
            raise HTTPException(status_code=400, detail="Ce point doit d'abord être signé par la gérante")

        if point.get("admin_validated"):
            raise HTTPException(status_code=400, detail="Ce point est déjà validé par l'administrateur")

        await db.financial_points.update_one(
            {"id": point_id},
            {"$set": {
                "admin_validated": True,
                "admin_validated_by": admin_name,
                "admin_validated_at": datetime.now(timezone.utc).isoformat(),
                "status": "admin_validated"
            }}
        )

        updated = await db.financial_points.find_one({"id": point_id}, {"_id": 0})
        logger.info(f"Financial point {point_id} validated by admin {admin_name}")
        return {"success": True, "financial_point": updated}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating financial point: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/financial-points/{point_id}/sign")
async def sign_financial_point(point_id: str, signer_name: str = Body(...), consent_text: str = Body(default="Je certifie l'exactitude des montants")):
    """Manager signs a financial point with consent (before admin validation)"""
    try:
        point = await db.financial_points.find_one({"id": point_id})
        if not point:
            raise HTTPException(status_code=404, detail="Point financier non trouvé")

        if point.get("signed"):
            raise HTTPException(status_code=400, detail="Ce point est déjà signé")

        await db.financial_points.update_one(
            {"id": point_id},
            {"$set": {
                "signed": True,
                "signed_by": signer_name,
                "signed_at": datetime.now(timezone.utc).isoformat(),
                "consent_text": consent_text,
                "status": "signed"
            }}
        )

        updated = await db.financial_points.find_one({"id": point_id}, {"_id": 0})
        logger.info(f"Financial point {point_id} signed by {signer_name}")
        return {"success": True, "financial_point": updated}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error signing financial point: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/financial-points/{point_id}")
async def delete_financial_point(point_id: str, is_admin: bool = False):
    """Delete a financial point (only by admin if signed)"""
    try:
        point = await db.financial_points.find_one({"id": point_id})
        if not point:
            raise HTTPException(status_code=404, detail="Point financier non trouvé")

        if point.get("signed") and not is_admin:
            raise HTTPException(status_code=403, detail="Seul l'administrateur peut supprimer un point financier signé")

        await db.financial_points.delete_one({"id": point_id})
        logger.info(f"Financial point {point_id} deleted")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting financial point: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/financial-points/{point_id}/unlock")
async def unlock_financial_point(point_id: str, admin_name: str = Body(..., embed=True)):
    """Admin unlocks a signed financial point for modification"""
    try:
        point = await db.financial_points.find_one({"id": point_id})
        if not point:
            raise HTTPException(status_code=404, detail="Point financier non trouvé")

        if not point.get("signed"):
            raise HTTPException(status_code=400, detail="Ce point n'est pas signé")

        await db.financial_points.update_one(
            {"id": point_id},
            {"$set": {
                "signed": False,
                "signed_by": None,
                "signed_at": None,
                "consent_text": None,
                "status": "admin_validated",
                "unlocked_by": admin_name,
                "unlocked_at": datetime.now(timezone.utc).isoformat()
            }}
        )

        updated = await db.financial_points.find_one({"id": point_id}, {"_id": 0})
        logger.info(f"Financial point {point_id} unlocked by admin {admin_name}")
        return {"success": True, "financial_point": updated}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unlocking financial point: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/financial-points/{point_id}/pdf")
async def generate_financial_point_pdf(point_id: str):
    """Generate PDF for a signed financial point"""
    try:
        point = await db.financial_points.find_one({"id": point_id}, {"_id": 0})
        if not point:
            raise HTTPException(status_code=404, detail="Point financier non trouvé")

        def fmt_price(val):
            return f"{val:,.0f}".replace(",", " ")

        period_label = ""
        if point.get("period_type") == "weekly":
            try:
                start = datetime.fromisoformat(point["date"]).strftime("%d/%m/%Y")
                end = datetime.fromisoformat(point.get("end_date", point["date"])).strftime("%d/%m/%Y")
                period_label = f"Semaine du {start} au {end}"
            except Exception:
                period_label = f"Semaine du {point['date']}"
        else:
            try:
                d = datetime.fromisoformat(point["date"]).strftime("%d/%m/%Y")
                period_label = f"Journée du {d}"
            except Exception:
                period_label = f"Journée du {point['date']}"

        signed_at_str = ""
        if point.get("signed_at"):
            try:
                sa = datetime.fromisoformat(point["signed_at"].replace("Z", "+00:00"))
                signed_at_str = sa.strftime("%d/%m/%Y à %H:%M")
            except Exception:
                signed_at_str = point["signed_at"]

        validated_at_str = ""
        if point.get("admin_validated_at"):
            try:
                va = datetime.fromisoformat(point["admin_validated_at"].replace("Z", "+00:00"))
                validated_at_str = va.strftime("%d/%m/%Y à %H:%M")
            except Exception:
                validated_at_str = point["admin_validated_at"]

        amounts = [
            ("Espèces", point.get("cash_amount", 0)),
            ("Mobile Money", point.get("mobile_amount", 0)),
            ("Chèque", point.get("cheque_amount", 0)),
            ("Crédit", point.get("wallet_amount", 0)),
        ]

        # Billettage HTML
        billettage_html = ""
        bill_data = point.get("billettage", {})
        if bill_data and any(int(v or 0) > 0 for v in bill_data.values()):
            bill_rows = ""
            for denom in [10000, 5000, 2000, 1000, 500, 200, 100, 50, 25, 10, 5]:
                qty = int(bill_data.get(str(denom), 0))
                if qty > 0:
                    bill_rows += f'<tr><td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;">{fmt_price(denom)} F</td><td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">{qty}</td><td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">{fmt_price(qty * denom)} F</td></tr>'
            if bill_rows:
                billettage_html = f'''<div style="margin:15px 0;"><h3 style="font-size:11pt;color:#059669;margin-bottom:8px;">Billettage des Espèces</h3><table style="width:60%;border-collapse:collapse;font-size:10pt;"><thead><tr style="background:#059669;color:white;"><th style="padding:6px 8px;text-align:left;">Coupure</th><th style="padding:6px 8px;text-align:center;">Quantité</th><th style="padding:6px 8px;text-align:right;">Sous-total</th></tr></thead><tbody>{bill_rows}</tbody></table></div>'''

        rows_html = ""
        for label, amt in amounts:
            if amt > 0:
                rows_html += f'<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">{label}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold;">{fmt_price(amt)} F</td></tr>'

        status_label = "Signé" if point.get("signed") else ("Validé" if point.get("admin_validated") else "En attente")
        status_color = "#059669" if point.get("signed") else ("#2563eb" if point.get("admin_validated") else "#d97706")

        html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  @page {{ size: A4; margin: 20mm; }}
  body {{ font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 0; padding: 20px; }}
  .header {{ text-align: center; border-bottom: 3px solid #0891b2; padding-bottom: 15px; margin-bottom: 25px; }}
  .header h1 {{ color: #0891b2; margin: 0; font-size: 22pt; }}
  .header h2 {{ color: #64748b; margin: 5px 0 0; font-size: 12pt; font-weight: normal; }}
  .meta {{ display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 10pt; color: #64748b; }}
  .meta-item {{ text-align: center; }}
  .meta-item strong {{ display: block; color: #1e293b; font-size: 11pt; }}
  .period {{ background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 12px; text-align: center; font-size: 13pt; font-weight: bold; color: #0369a1; margin-bottom: 20px; }}
  .status {{ display: inline-block; background: {status_color}; color: white; padding: 4px 16px; border-radius: 20px; font-size: 10pt; font-weight: bold; }}
  table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
  thead th {{ background: #0891b2; color: white; padding: 10px 12px; text-align: left; font-size: 11pt; }}
  thead th:last-child {{ text-align: right; }}
  .total-row {{ background: #f0fdf4; }}
  .total-row td {{ padding: 12px; font-size: 14pt; font-weight: bold; color: #059669; border-top: 2px solid #059669; }}
  .notes {{ background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px; margin: 15px 0; font-size: 10pt; }}
  .signatures {{ display: flex; justify-content: space-between; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; }}
  .sig-box {{ text-align: center; width: 45%; }}
  .sig-line {{ border-bottom: 1px solid #94a3b8; height: 40px; margin-bottom: 5px; }}
  .sig-label {{ font-size: 9pt; color: #64748b; }}
  .sig-name {{ font-size: 10pt; font-weight: bold; color: #1e293b; }}
  .consent {{ background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 10px; margin: 15px 0; font-size: 9pt; color: #166534; }}
  .footer {{ text-align: center; margin-top: 30px; font-size: 8pt; color: #94a3b8; }}
</style>
</head><body>
<div class="header">
  <h1>ESPACE MAXO</h1>
  <h2>Reversement des Recettes</h2>
</div>

<div style="text-align:center;margin-bottom:15px;">
  <span class="status">{status_label}</span>
</div>

<div class="period">{period_label}</div>

<div style="display:flex;justify-content:center;gap:20px;margin-bottom:15px;">
  <div style="background:{'#eff6ff' if point.get('destination') == 'banque' else '#ecfdf5'};border:1px solid {'#93c5fd' if point.get('destination') == 'banque' else '#6ee7b7'};border-radius:8px;padding:8px 20px;font-size:11pt;font-weight:bold;color:{'#1d4ed8' if point.get('destination') == 'banque' else '#059669'};">
    {"Verse a la banque" if point.get('destination') == 'banque' else "Remis a l'administrateur"}
  </div>
  {"<div style='background:#fff7ed;border:1px solid #fdba74;border-radius:8px;padding:8px 20px;font-size:11pt;color:#c2410c;'>Momo : " + point.get('momo_number', '') + "</div>" if point.get('momo_number') else ""}
</div>

<table>
  <thead><tr><th>Point du reversement</th><th>Montant</th></tr></thead>
  <tbody>
    {rows_html}
    <tr class="total-row">
      <td>TOTAL REVERSEMENT</td>
      <td style="text-align:right;">{fmt_price(point.get('total_amount', 0))} F</td>
    </tr>
  </tbody>
</table>

{billettage_html}

{"<div class='notes'><strong>Notes :</strong> " + point.get('notes', '') + "</div>" if point.get('notes') else ""}

{"<div class='consent'>Consentement : " + (point.get('consent_text') or 'Je certifie l exactitude des montants reverses') + "</div>" if point.get('signed') else ""}

<div class="signatures">
  <div class="sig-box">
    <div class="sig-name">{point.get('signed_by') or point.get('created_by', '-')}</div>
    <div class="sig-line"></div>
    <div class="sig-label">Gerante{f" - Signe le {signed_at_str}" if signed_at_str else ""}</div>
  </div>
  <div class="sig-box">
    <div class="sig-name">{point.get('admin_validated_by', '-')}</div>
    <div class="sig-line"></div>
    <div class="sig-label">Administrateur{f" - Valide le {validated_at_str}" if validated_at_str else ""}</div>
  </div>
</div>

<div class="footer">
  Document genere automatiquement - Espace Maxo - Caisse Pro<br/>
  {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')}
</div>
</body></html>"""

        pdf_buffer = io.BytesIO()
        try:
            from weasyprint import HTML
            HTML(string=html).write_pdf(pdf_buffer)
        except ImportError:
            pdf_buffer.write(html.encode('utf-8'))
            pdf_buffer.seek(0)
            return StreamingResponse(
                pdf_buffer,
                media_type="text/html",
                headers={"Content-Disposition": f'inline; filename="point_financier_{point["date"]}.html"'}
            )

        pdf_buffer.seek(0)
        filename = f"point_financier_{point['date']}.pdf"
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{filename}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating financial point PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))
