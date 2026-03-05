"""
Caisse Pro - Client Routes
Handles client management
"""
from fastapi import APIRouter, HTTPException, Body
import logging

from models.caisse import CaisseClientCreate, CaisseClient

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Caisse Clients"])

# Database reference
db = None

def set_db(database):
    global db
    db = database


@router.post("/caisse/clients")
async def create_caisse_client(client_data: CaisseClientCreate):
    """Create a new client"""
    try:
        client = CaisseClient(**client_data.model_dump())
        client_dict = client.model_dump()
        await db.caisse_clients.insert_one(client_dict)
        return {"success": True, "client": {k: v for k, v in client_dict.items() if k != "_id"}}
    except Exception as e:
        logger.error(f"Error creating client: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/caisse/clients")
async def get_caisse_clients():
    """Get all clients"""
    try:
        clients = await db.caisse_clients.find({}, {"_id": 0}).to_list(1000)
        return {"clients": clients}
    except Exception as e:
        logger.error(f"Error fetching clients: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/caisse/clients/{client_id}")
async def update_caisse_client(client_id: str, client_data: dict = Body(...)):
    """Update a client"""
    try:
        result = await db.caisse_clients.update_one({"id": client_id}, {"$set": client_data})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Client non trouvé")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating client: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/caisse/clients/{client_id}")
async def delete_caisse_client(client_id: str):
    """Delete a client"""
    try:
        result = await db.caisse_clients.delete_one({"id": client_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Client non trouvé")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting client: {e}")
        raise HTTPException(status_code=500, detail=str(e))
