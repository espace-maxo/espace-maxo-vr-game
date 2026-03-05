"""
Caisse Pro - Table Routes
Handles multi-table draft invoice system
"""
from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
from typing import Optional
import uuid
import logging

from models.caisse import CaisseTableCreate, CaisseTableUpdate

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
async def update_caisse_table(table_id: str, table_data: CaisseTableUpdate):
    """Update a table/draft invoice"""
    try:
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
        return {"success": True, "table": updated_table}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating table: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/caisse/tables/{table_id}")
async def delete_caisse_table(table_id: str):
    """Delete a table/draft (when converted to invoice or cancelled)"""
    try:
        result = await db.caisse_tables.delete_one({"id": table_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Table non trouvée")
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
