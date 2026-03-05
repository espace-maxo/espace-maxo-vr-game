"""
Caisse Pro - User Routes
Handles caisse user management and authentication
"""
from fastapi import APIRouter, HTTPException, Body
from datetime import datetime, timezone
import logging

from models.caisse import CaisseUserCreate, CaisseUser, CaisseLoginRequest

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Caisse Users"])

# Database reference
db = None

def set_db(database):
    global db
    db = database


@router.post("/caisse/login")
async def caisse_login(login_data: CaisseLoginRequest):
    """Login to caisse system via PIN or password"""
    try:
        user = None
        
        if login_data.pin:
            user = await db.caisse_users.find_one({"pin": login_data.pin, "is_active": True}, {"_id": 0})
        elif login_data.password:
            # Admin password check
            CAISSE_ADMIN_PASSWORD = "Caisse2026"
            ADMIN_PASSWORD_FULL = "Esp@ceM@xo2026"
            
            if login_data.password in [CAISSE_ADMIN_PASSWORD, ADMIN_PASSWORD_FULL]:
                return {
                    "success": True,
                    "user": {
                        "id": "admin",
                        "username": "admin",
                        "full_name": "Administrateur",
                        "role": "admin",
                        "is_active": True
                    }
                }
        
        if not user:
            raise HTTPException(status_code=401, detail="Identifiants incorrects")
        
        return {"success": True, "user": user}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during caisse login: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/caisse/users")
async def get_caisse_users():
    """Get all caisse users"""
    try:
        users = await db.caisse_users.find({}, {"_id": 0, "password_hash": 0}).to_list(100)
        return {"users": users}
    except Exception as e:
        logger.error(f"Error fetching caisse users: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/caisse/users")
async def create_caisse_user(user_data: CaisseUserCreate):
    """Create a new caisse user"""
    try:
        # Check if PIN already exists
        if user_data.pin:
            existing = await db.caisse_users.find_one({"pin": user_data.pin})
            if existing:
                raise HTTPException(status_code=400, detail="Ce code PIN est déjà utilisé")
        
        user = CaisseUser(**user_data.model_dump())
        user_dict = user.model_dump()
        
        await db.caisse_users.insert_one(user_dict)
        
        user_dict.pop("password_hash", None)
        return {"success": True, "user": {k: v for k, v in user_dict.items() if k != "_id"}}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating caisse user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/caisse/users/{user_id}")
async def update_caisse_user(user_id: str, user_data: dict = Body(...)):
    """Update a caisse user"""
    try:
        # Check PIN uniqueness if changing
        if "pin" in user_data and user_data["pin"]:
            existing = await db.caisse_users.find_one({
                "pin": user_data["pin"],
                "id": {"$ne": user_id}
            })
            if existing:
                raise HTTPException(status_code=400, detail="Ce code PIN est déjà utilisé")
        
        result = await db.caisse_users.update_one({"id": user_id}, {"$set": user_data})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating caisse user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/caisse/users/{user_id}")
async def delete_caisse_user(user_id: str):
    """Delete a caisse user"""
    try:
        result = await db.caisse_users.delete_one({"id": user_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting caisse user: {e}")
        raise HTTPException(status_code=500, detail=str(e))
