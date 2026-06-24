"""
Caisse Users Router
Endpoints pour la gestion des utilisateurs Caisse Pro + login PIN/password.
"""
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime, timezone
import uuid
import hashlib
import os
import logging
import jwt

router = APIRouter(tags=["caisse-users"])
db = None
logger = logging.getLogger(__name__)

JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'espace-maxo-secret-key-change-in-production')


def set_db(database):
    global db
    db = database


# ==================== MODELS ====================

class CaisseUserCreate(BaseModel):
    username: str
    email: str = ""
    password: str = ""
    pin: str = ""  # 4-6 digit PIN for quick login
    role: str = "server"  # admin, manager, server
    full_name: str = ""


class CaisseUser(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    email: str = ""
    password_hash: str = ""
    pin: str = ""
    role: str = "server"
    full_name: str = ""
    is_active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ==================== ENDPOINTS ====================

@router.post("/caisse/users")
async def create_caisse_user(user_data: CaisseUserCreate):
    """Create a new caisse user"""
    try:
        existing = await db.caisse_users.find_one({"username": user_data.username})
        if existing:
            raise HTTPException(status_code=400, detail="Nom d'utilisateur déjà existant")

        if user_data.pin:
            existing_pin = await db.caisse_users.find_one({"pin": user_data.pin})
            if existing_pin:
                raise HTTPException(status_code=400, detail="Ce PIN est déjà utilisé")

        password_hash = ""
        if user_data.password:
            password_hash = hashlib.sha256(user_data.password.encode()).hexdigest()

        user = CaisseUser(
            username=user_data.username,
            email=user_data.email,
            password_hash=password_hash,
            pin=user_data.pin,
            role=user_data.role,
            full_name=user_data.full_name
        )

        user_dict = user.model_dump()
        await db.caisse_users.insert_one(user_dict)

        del user_dict["password_hash"]
        return {"success": True, "user": {k: v for k, v in user_dict.items() if k != "_id"}}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating caisse user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/caisse/login")
async def caisse_login(credentials: dict = Body(...)):
    """Login for caisse users - supports PIN or password.

    Robustesse :
      - .strip() systématique pour ignorer les espaces invisibles
      - Si le 'password' saisi est en réalité un PIN purement numérique (4-6 chiffres),
        on tente aussi de le matcher comme PIN — évite les blocages quand l'utilisateur
        clique par erreur sur l'onglet "Admin" et y saisit son code PIN à 4 chiffres.
    """
    try:
        pin = (credentials.get("pin") or "").strip()
        password = (credentials.get("password") or "").strip()

        # Master admin password
        if password == "Nikeland2026" or password == "Esp@ceM@xo2026":
            return {
                "success": True,
                "user": {
                    "id": "master",
                    "username": "admin",
                    "role": "admin",
                    "full_name": "Administrateur"
                },
                "token": jwt.encode({"role": "admin", "username": "admin", "user_id": "master"}, JWT_SECRET_KEY, algorithm="HS256")
            }

        # PIN login
        if pin:
            user = await db.caisse_users.find_one({
                "pin": pin,
                "is_active": True
            }, {"_id": 0, "password_hash": 0})

            if user:
                token = jwt.encode({
                    "role": user["role"],
                    "username": user["username"],
                    "user_id": user["id"],
                    "full_name": user.get("full_name", user["username"])
                }, JWT_SECRET_KEY, algorithm="HS256")
                return {"success": True, "user": user, "token": token}

        # Password login (avec fallback PIN si purement numérique)
        if password:
            password_hash = hashlib.sha256(password.encode()).hexdigest()
            user = await db.caisse_users.find_one({
                "password_hash": password_hash,
                "is_active": True
            }, {"_id": 0, "password_hash": 0})

            if user:
                token = jwt.encode({
                    "role": user["role"],
                    "username": user["username"],
                    "user_id": user["id"],
                    "full_name": user.get("full_name", user["username"])
                }, JWT_SECRET_KEY, algorithm="HS256")
                return {"success": True, "user": user, "token": token}

            # Fallback : si l'utilisateur a tapé son PIN dans le champ password
            if password.isdigit() and 3 <= len(password) <= 8:
                user_pin = await db.caisse_users.find_one({
                    "pin": password,
                    "is_active": True
                }, {"_id": 0, "password_hash": 0})
                if user_pin:
                    token = jwt.encode({
                        "role": user_pin["role"],
                        "username": user_pin["username"],
                        "user_id": user_pin["id"],
                        "full_name": user_pin.get("full_name", user_pin["username"])
                    }, JWT_SECRET_KEY, algorithm="HS256")
                    return {"success": True, "user": user_pin, "token": token}

        raise HTTPException(status_code=401, detail="PIN ou mot de passe incorrect")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in caisse login: {e}")
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


@router.put("/caisse/users/{user_id}")
async def update_caisse_user(user_id: str, user_data: dict = Body(...)):
    """Update a caisse user"""
    try:
        if "pin" in user_data and user_data["pin"]:
            existing_pin = await db.caisse_users.find_one({
                "pin": user_data["pin"],
                "id": {"$ne": user_id}
            })
            if existing_pin:
                raise HTTPException(status_code=400, detail="Ce PIN est déjà utilisé")

        if "password" in user_data and user_data["password"]:
            user_data["password_hash"] = hashlib.sha256(user_data["password"].encode()).hexdigest()
            del user_data["password"]
        elif "password" in user_data:
            del user_data["password"]

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
