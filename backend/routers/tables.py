"""
Caisse Pro - Table Routes
Handles multi-table draft invoice system
"""
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timezone
from typing import Optional
import uuid
import logging

from models.caisse import CaisseTableCreate, CaisseTableUpdate

# Audit helper (centralised in invoices router)
try:
    from routers.invoices import _log_audit
except Exception:  # pragma: no cover
    async def _log_audit(*_a, **_kw):
        return None

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Caisse Tables"])

# Database reference
db = None

def set_db(database):
    global db
    db = database


@router.get("/caisse/tables")
async def get_caisse_tables(server_id: Optional[str] = None):
    """Get all open tables/drafts for a server"""
    try:
        query = {}
        if server_id:
            query["server_id"] = server_id
        
        tables = await db.caisse_tables.find(query, {"_id": 0}).sort("table_number", 1).to_list(100)
        return {"tables": tables}
    except Exception as e:
        logger.error(f"Error fetching tables: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/caisse/tables")
async def create_caisse_table(table_data: CaisseTableCreate):
    """Create a new table/draft invoice"""
    try:
        # Check if table number is already in use by this server
        existing = await db.caisse_tables.find_one({
            "server_id": table_data.server_id,
            "table_number": table_data.table_number
        })
        if existing:
            raise HTTPException(status_code=400, detail=f"La table {table_data.table_number} est déjà ouverte")
        
        # Check max tables (20)
        server_tables = await db.caisse_tables.count_documents({"server_id": table_data.server_id})
        if server_tables >= 20:
            raise HTTPException(status_code=400, detail="Maximum 20 tables simultanées atteint")
        
        table_doc = {
            "id": str(uuid.uuid4()),
            "table_number": table_data.table_number,
            "server_id": table_data.server_id,
            "server_name": table_data.server_name,
            "items": table_data.items,
            "client_id": table_data.client_id,
            "client_name": table_data.client_name or "Client",
            "payment_method": table_data.payment_method,
            "discount": table_data.discount,
            "notes": table_data.notes,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.caisse_tables.insert_one(table_doc)
        if "_id" in table_doc:
            del table_doc["_id"]
        return {"success": True, "table": table_doc}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating table: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/caisse/tables/{table_id}")
async def update_caisse_table(
    table_id: str,
    table_data: CaisseTableUpdate,
    actor_name: Optional[str] = Query(None),
    actor_role: Optional[str] = Query(None),
):
    """Update a table/draft invoice"""
    try:
        # Snapshot before
        before = await db.caisse_tables.find_one({"id": table_id}, {"_id": 0})

        update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
        
        if table_data.items is not None:
            update_data["items"] = table_data.items
        if table_data.client_id is not None:
            update_data["client_id"] = table_data.client_id
        if table_data.client_name is not None:
            update_data["client_name"] = table_data.client_name
        if table_data.payment_method is not None:
            update_data["payment_method"] = table_data.payment_method
        if table_data.discount is not None:
            update_data["discount"] = table_data.discount
        if table_data.notes is not None:
            update_data["notes"] = table_data.notes
        
        result = await db.caisse_tables.update_one(
            {"id": table_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Table non trouvée")
        
        updated_table = await db.caisse_tables.find_one({"id": table_id}, {"_id": 0})

        # Audit only meaningful changes (skip pure timestamp/items length parity)
        if before:
            changes = {}
            for k, v in update_data.items():
                if k == "updated_at":
                    continue
                if k == "items":
                    old_summary = {
                        "count": len(before.get("items") or []),
                        "qty": sum(float(i.get("quantity") or 0) for i in (before.get("items") or [])),
                    }
                    new_summary = {
                        "count": len(v or []),
                        "qty": sum(float(i.get("quantity") or 0) for i in (v or [])),
                    }
                    if old_summary != new_summary:
                        changes[k] = {"from": old_summary, "to": new_summary}
                    continue
                if before.get(k) != v:
                    changes[k] = {"from": before.get(k), "to": v}
            if changes:
                await _log_audit(
                    "table",
                    updated_table or before,
                    "update",
                    {"name": actor_name, "role": actor_role},
                    changes,
                )
        return {"success": True, "table": updated_table}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating table: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/caisse/tables/{table_id}")
async def delete_caisse_table(
    table_id: str,
    actor_name: Optional[str] = Query(None),
    actor_role: Optional[str] = Query(None),
    reason: Optional[str] = Query(None, description="converted | cancelled | other"),
):
    """Delete a table/draft (when converted to invoice or cancelled)"""
    try:
        existing = await db.caisse_tables.find_one({"id": table_id}, {"_id": 0})
        result = await db.caisse_tables.delete_one({"id": table_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Table non trouvée")
        # Only log explicit cancellations (manual delete from UI), not the silent
        # cleanup that follows an invoice conversion — caller passes reason='cancelled'.
        if existing and (reason or "").lower() == "cancelled":
            await _log_audit(
                "table",
                existing,
                "delete",
                {"name": actor_name, "role": actor_role},
                None,
            )
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting table: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/caisse/tables/available")
async def get_available_tables(server_id: str):
    """Get list of available table numbers (1-20) for a server"""
    try:
        used_tables = await db.caisse_tables.find(
            {"server_id": server_id},
            {"table_number": 1, "_id": 0}
        ).to_list(20)
        
        used_numbers = set(t["table_number"] for t in used_tables)
        available = [n for n in range(1, 21) if n not in used_numbers]
        
        return {"available_tables": available, "used_tables": list(used_numbers)}
    except Exception as e:
        logger.error(f"Error fetching available tables: {e}")
        raise HTTPException(status_code=500, detail=str(e))
