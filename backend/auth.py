"""
Espace Maxo - Authentication
JWT authentication helpers for admin routes
"""
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import logging

from config import ADMIN_PASSWORD_HASH, JWT_SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRATION_HOURS

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)


def verify_admin_password(password: str) -> bool:
    """Verify admin password against stored hash"""
    if not ADMIN_PASSWORD_HASH:
        return False
    try:
        return bcrypt.checkpw(password.encode('utf-8'), ADMIN_PASSWORD_HASH.encode('utf-8'))
    except Exception as e:
        logger.error(f"Password verification error: {e}")
        return False


def create_admin_token() -> tuple[str, datetime]:
    """Create a JWT token for admin authentication"""
    expiration = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {
        "sub": "admin",
        "exp": expiration,
        "iat": datetime.now(timezone.utc)
    }
    token = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return token, expiration


def verify_admin_token(token: str) -> bool:
    """Verify JWT token validity"""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload.get("sub") == "admin"
    except jwt.ExpiredSignatureError:
        return False
    except jwt.InvalidTokenError:
        return False


async def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)) -> bool:
    """Dependency to verify admin authentication"""
    if not credentials:
        raise HTTPException(status_code=401, detail="Non authentifié")
    
    if not verify_admin_token(credentials.credentials):
        raise HTTPException(status_code=401, detail="Token invalide ou expiré")
    
    return True
