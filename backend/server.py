from fastapi import FastAPI, APIRouter, HTTPException, Request, Query, Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone, timedelta
from urllib.parse import quote
import httpx
import bcrypt
import jwt
import csv
import io
from twilio.rest import Client as TwilioClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Kkiapay configuration (MTN, Moov, Celtiis)
KKIAPAY_PUBLIC_KEY = os.environ.get('KKIAPAY_PUBLIC_KEY', '')
KKIAPAY_PRIVATE_KEY = os.environ.get('KKIAPAY_PRIVATE_KEY', '')
KKIAPAY_SECRET = os.environ.get('KKIAPAY_SECRET', '')
KKIAPAY_SANDBOX = os.environ.get('KKIAPAY_SANDBOX', 'true').lower() == 'true'

# WhatsApp number for Espace Maxo
WHATSAPP_NUMBER = "22901414700"

# Twilio SMS configuration
TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID', '')
TWILIO_AUTH_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN', '')
TWILIO_VERIFY_SERVICE_SID = os.environ.get('TWILIO_VERIFY_SERVICE_SID', '')

# Initialize Twilio client
twilio_client = None
if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
    twilio_client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

# Admin authentication configuration
ADMIN_PASSWORD_HASH = os.environ.get('ADMIN_PASSWORD_HASH', '')
JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'espace-maxo-secret-key-change-in-production')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Security bearer
security = HTTPBearer(auto_error=False)

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============== MODELS ==============

class MenuItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    price: float
    original_price: Optional[float] = None
    category: str
    image_url: str
    is_available: bool = True
    is_combo: bool = False
    persons: Optional[int] = None

class MenuItemCreate(BaseModel):
    name: str
    description: str
    price: float
    original_price: Optional[float] = None
    category: str
    image_url: str
    is_available: bool = True
    is_combo: bool = False
    persons: Optional[int] = None

class Game(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    game_type: str
    price_per_game: float = 2000.0
    image_url: str
    duration_minutes: int = 15

class BookingCreate(BaseModel):
    customer_name: str
    customer_phone: str
    game_type: str
    date: str
    time_slot: str
    number_of_players: int
    number_of_games: int = 1
    pay_full_amount: bool = False  # Option to pay total amount instead of just reservation fee
    use_wallet: bool = False  # Option to use wallet balance

class Booking(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_name: str
    customer_phone: str
    game_type: str
    date: str
    time_slot: str
    number_of_players: int
    number_of_games: int
    total_game_price: float
    reservation_fee: float = 500.0
    total_amount: float
    amount_to_pay: float = 500.0  # Amount to pay online (can be reservation_fee or total_amount)
    payment_type: str = "reservation_only"  # reservation_only or full_payment
    payment_status: str = "pending"
    booking_status: str = "active"  # active, completed, cancelled
    payment_session_id: Optional[str] = None
    wallet_amount_used: float = 0.0  # Amount paid from wallet
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    whatsapp_link: Optional[str] = None
    # Rescheduling fields
    reschedule_token: Optional[str] = None
    has_been_rescheduled: bool = False
    original_date: Optional[str] = None
    original_time_slot: Optional[str] = None
    rescheduled_at: Optional[str] = None

# Wallet/Provision Models
class WalletCreate(BaseModel):
    phone: str
    name: str

class WalletTopUp(BaseModel):
    phone: str
    amount: float
    transaction_id: str

class WalletUse(BaseModel):
    phone: str
    amount: float
    service_type: str  # games, menu, event, reservation
    description: str

class RescheduleRequest(BaseModel):
    new_date: str
    new_time_slot: str

class RescheduleByClientRequest(BaseModel):
    new_date: str
    new_time_slot: str
    phone: str
    name: str
    payment_transaction_id: Optional[str] = None  # Required if fee_required

class FindBookingRequest(BaseModel):
    phone: str
    name: str

class BookingUpdate(BaseModel):
    booking_status: Optional[str] = None
    payment_status: Optional[str] = None

class PaymentTransaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    booking_id: str
    session_id: str
    amount: float
    currency: str = "XOF"
    payment_status: str = "initiated"
    metadata: Dict = {}
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class CheckoutRequest(BaseModel):
    booking_id: str
    origin_url: str

class AdminLoginRequest(BaseModel):
    password: str

class AdminLoginResponse(BaseModel):
    token: str
    expires_at: str
    role: str  # admin_full or admin_readonly

# Review Models
class ReviewCreate(BaseModel):
    customer_name: str
    rating: int = Field(ge=1, le=5)
    comment: str

class Review(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_name: str
    rating: int
    comment: str
    status: str = "pending"  # pending, approved, rejected
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ReviewUpdate(BaseModel):
    status: str  # approved or rejected

# Location Request Models
class LocationRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    # Section 1
    fullName: str
    phone: str
    email: str = ""
    company: str = ""
    # Section 2
    eventType: str
    otherEventType: str = ""
    eventDate: str
    startTime: str = ""
    endTime: str = ""
    guestCount: str = ""
    # Section 3
    formula: str = ""
    budget: str = ""
    # Section 4
    services: List[str] = []
    otherService: str = ""
    # Section 5
    message: str = ""
    # Meta
    status: str = "pending"  # pending, contacted, confirmed, cancelled
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# Loyalty Program Models
class LoyaltyAccount(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    phone: str
    customer_name: str
    total_points: int = 0
    redeemed_points: int = 0
    available_points: int = 0
    total_games_played: int = 0
    free_games_earned: int = 0
    free_games_used: int = 0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class LoyaltyRedemption(BaseModel):
    phone: str
    free_games_to_use: int = 1

# Delivery Order Models
class DeliveryOrderItem(BaseModel):
    name: str
    price: float
    quantity: int

class DeliveryOrder(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_name: str
    customer_phone: str
    delivery_address: str
    delivery_zone: str = "cotonou"  # cotonou or outside
    notes: str = ""
    items: List[Dict] = []
    subtotal: float
    delivery_fee: float = 1000
    total: float
    status: str = "pending"  # pending, pending_validation, confirmed, preparing, delivered, cancelled
    payment_status: str = "pending"  # pending, pending_validation, paid
    payment_transaction_id: Optional[str] = None
    wallet_amount_used: float = 0.0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# Job Application Models
class JobApplicationCreate(BaseModel):
    full_name: str
    phone: str
    email: str
    position: str  # serveur, cuisinier, barman, etc.
    message: str = ""
    cv_filename: Optional[str] = None
    cv_data: Optional[str] = None  # Base64 encoded PDF

class JobApplication(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    full_name: str
    phone: str
    email: str
    position: str
    message: str = ""
    cv_filename: Optional[str] = None
    cv_url: Optional[str] = None
    status: str = "pending"  # pending, reviewed, contacted, hired, rejected
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())



# Combo Order Models (with game session)
class ComboOrderCreate(BaseModel):
    customer_name: str
    customer_phone: str
    items: List[Dict]  # [{name, price, quantity}]
    game_type: str  # VR_360 or RACING_SIMULATOR
    number_of_players: int = 1
    number_of_games: int = 1
    booking_date: str
    time_slot: str
    notes: str = ""
    payment_transaction_id: Optional[str] = None
    wallet_amount_used: float = 0.0

class ComboOrder(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_name: str
    customer_phone: str
    items: List[Dict] = []
    combo_total: float = 0.0
    game_type: str
    number_of_players: int = 1
    number_of_games: int = 1
    game_total: float = 0.0
    booking_date: str
    time_slot: str
    total: float = 0.0
    notes: str = ""
    status: str = "confirmed"  # confirmed, completed, cancelled
    payment_status: str = "paid"
    payment_transaction_id: Optional[str] = None
    wallet_amount_used: float = 0.0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# Table Reservation Models
class TableReservationCreate(BaseModel):
    customer_name: str
    customer_phone: str
    reservation_date: str
    reservation_time: str
    number_of_guests: int
    special_occasion: str = ""  # anniversaire, mariage, etc.
    notes: str = ""
    deposit_amount: float  # 5000, 10000, 15000, 20000, 25000
    payment_transaction_id: Optional[str] = None
    wallet_amount_used: float = 0.0

class TableReservation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_name: str
    customer_phone: str
    reservation_date: str
    reservation_time: str
    number_of_guests: int
    special_occasion: str = ""
    notes: str = ""
    deposit_amount: float
    deposit_used: float = 0.0  # Amount already deducted from final bill
    status: str = "confirmed"  # confirmed, completed, cancelled, no_show
    payment_status: str = "paid"
    payment_transaction_id: Optional[str] = None
    wallet_amount_used: float = 0.0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ============== SEED DATA ==============

MENU_ITEMS = [
    # COMBOS
    {
        "id": "combo-solo",
        "name": "Super Combo Solo",
        "description": "1 Burger + 1 Soda + 1 Jeux VR - L'offre parfaite pour les gamers solo!",
        "price": 3500,
        "original_price": None,
        "category": "Combos",
        "image_url": "https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/zovejuia_Combo%204.JPG",
        "is_available": True,
        "is_combo": True,
        "persons": 1
    },
    {
        "id": "combo-2p-eco",
        "name": "Super Combo 2 Personnes",
        "description": "Chawarma + 1 Burger + 2 Sodas + 1 Jeux VR - Idéal pour partager!",
        "price": 6000,
        "original_price": 9000,
        "category": "Combos",
        "image_url": "https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/pegoox6o_Combo1.JPG",
        "is_available": True,
        "is_combo": True,
        "persons": 2
    },
    {
        "id": "combo-2p-premium",
        "name": "Super Combo 2 Personnes Premium",
        "description": "Tchoucouya - Riz + Cuisse de poulet - Riz + 1 plat de frites + 2 Sodas + 1 Jeux VR",
        "price": 9000,
        "original_price": 11500,
        "category": "Combos",
        "image_url": "https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/p1ujq5ff_Combo%203.JPG",
        "is_available": True,
        "is_combo": True,
        "persons": 2
    },
    {
        "id": "combo-4p",
        "name": "Combo 4 Personnes",
        "description": "Aileron + Frites + Choukouya Riz + Escargot + Atièkè + Poulet pané frites + 1 Eau + 2 Jeux VR",
        "price": 16000,
        "original_price": 21000,
        "category": "Combos",
        "image_url": "https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/0pnd2nx6_Combo%202.JPG",
        "is_available": True,
        "is_combo": True,
        "persons": 4
    },
    # PLATS PRINCIPAUX
    {
        "id": "menu-tchoucouya",
        "name": "Tchoucouya - Riz",
        "description": "Viande de boeuf grillée façon tchoukouya avec riz parfumé et sauce",
        "price": 3500,
        "category": "Plats",
        "image_url": "https://customer-assets.emergentagent.com/job_b1e2bc04-e6b7-4a48-a3cc-c08b10f16c04/artifacts/29w643ay_00e90209-d838-44b8-9eae-d41b695f844f%202.JPG",
        "is_available": True
    },
    {
        "id": "menu-poulet-riz",
        "name": "Cuisse de Poulet - Riz",
        "description": "Cuisse de poulet grillée accompagnée de riz et sauce tomate",
        "price": 3000,
        "category": "Plats",
        "image_url": "https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/0ma3ucad_e9788b87-62c9-4840-bdd3-5badadfd9845.JPG",
        "is_available": True
    },
    {
        "id": "menu-pizza",
        "name": "Pizza Maxo",
        "description": "Grande pizza généreuse avec fromage fondu, olives, oignons et sauce tomate",
        "price": 5500,
        "category": "Plats",
        "image_url": "https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/4loxglzc_PIZZA.JPG",
        "is_available": True
    },
    {
        "id": "menu-aileron",
        "name": "Ailerons de Poulet",
        "description": "Ailerons de poulet croustillants dorés avec frites et crudités",
        "price": 3500,
        "category": "Plats",
        "image_url": "https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/lf2x1p6q_ailerons.jpg",
        "is_available": True
    },
    {
        "id": "menu-poulet-pane",
        "name": "Poulet Pané + Frites",
        "description": "Poulet croustillant pané accompagné de frites dorées",
        "price": 3500,
        "category": "Plats",
        "image_url": "https://images.unsplash.com/photo-1562967914-608f82629710?crop=entropy&cs=srgb&fm=jpg",
        "is_available": True
    },
    # BURGERS & CHAWARMA
    {
        "id": "menu-burger",
        "name": "Burger Maxo",
        "description": "Burger maison avec steak haché, cheddar, salade, tomate et frites",
        "price": 2500,
        "category": "Burgers",
        "image_url": "https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/phwdbby5_BURGER.JPG",
        "is_available": True
    },
    {
        "id": "menu-chawarma",
        "name": "Chawarma",
        "description": "Chawarma généreux avec viande marinée, crudités et sauce",
        "price": 2000,
        "category": "Burgers",
        "image_url": "https://images.unsplash.com/photo-1529006557810-274b9b2fc783?crop=entropy&cs=srgb&fm=jpg",
        "is_available": True
    },
    # ACCOMPAGNEMENTS & BOISSONS
    {
        "id": "menu-frites",
        "name": "Frites Maison",
        "description": "Pommes de terre fraîches frites, croustillantes",
        "price": 1500,
        "category": "Accompagnements",
        "image_url": "https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?crop=entropy&cs=srgb&fm=jpg",
        "is_available": True
    },
    {
        "id": "menu-soda",
        "name": "Soda",
        "description": "Coca-Cola, Fanta, Sprite ou Fifa",
        "price": 1000,
        "category": "Boissons",
        "image_url": "https://images.unsplash.com/photo-1581636625402-29b2a704ef13?crop=entropy&cs=srgb&fm=jpg",
        "is_available": True
    },
    {
        "id": "menu-cocktail-fruits",
        "name": "Cocktail de Fruits",
        "description": "Délicieux mélange de fruits frais de saison servi dans un verre élégant",
        "price": 2000,
        "category": "Boissons",
        "image_url": "https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/vd62gmoj_COCKTAIL%20DE%20FRUITS.JPG",
        "is_available": True
    },
    {
        "id": "menu-eau",
        "name": "Eau Minérale",
        "description": "Eau minérale fraîche (1.5L)",
        "price": 1000,
        "category": "Boissons",
        "image_url": "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?crop=entropy&cs=srgb&fm=jpg",
        "is_available": True
    }
]

GAMES = [
    {
        "id": "game-vr",
        "name": "VR 360° Immersif",
        "description": "Plongez dans des mondes virtuels époustouflants avec notre casque VR dernière génération. Combattez des zombies, explorez l'espace ou visitez des mondes fantastiques!",
        "game_type": "VR_360",
        "price_per_game": 2000,
        "image_url": "https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/caxe4zas_52ccd1b2-bdd5-4dc7-835c-75cef471dbeb%202.JPG",
        "duration_minutes": 15
    },
    {
        "id": "game-racing",
        "name": "Simulateur Course",
        "description": "Vivez l'adrénaline de la course automobile avec notre simulateur professionnel. Volant, pédales et siège baquet pour une expérience ultra-réaliste!",
        "game_type": "RACING_SIMULATOR",
        "price_per_game": 1500,
        "image_url": "https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/caxe4zas_52ccd1b2-bdd5-4dc7-835c-75cef471dbeb%202.JPG",
        "duration_minutes": 15
    }
]

# ============== HELPER FUNCTIONS ==============

def create_admin_token(role: str = "admin_full") -> tuple[str, datetime]:
    """Create a JWT token for admin access
    role can be: admin_full (full access) or admin_readonly (read only)
    """
    expiration = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {
        "role": role,
        "exp": expiration,
        "iat": datetime.now(timezone.utc)
    }
    token = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return token, expiration

def verify_admin_token(token: str) -> dict:
    """Verify a JWT token and return payload"""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        role = payload.get("role", "")
        if role in ["admin", "admin_full", "admin_readonly"]:
            return {"valid": True, "role": role}
        return {"valid": False, "role": None}
    except jwt.ExpiredSignatureError:
        return {"valid": False, "role": None}
    except jwt.InvalidTokenError:
        return {"valid": False, "role": None}

# Admin passwords - Full access and Read-only
ADMIN_PASSWORD_FULL = os.environ.get("ADMIN_PASSWORD_FULL", "Esp@ceM@xo2026")
ADMIN_PASSWORD_READONLY = os.environ.get("ADMIN_PASSWORD_READONLY", "MaxoConsult2026")

def verify_admin_password(password: str) -> str:
    """Verify the admin password and return role type
    Returns: 'admin_full', 'admin_readonly', or None if invalid
    """
    # Check full access password
    if password == ADMIN_PASSWORD_FULL:
        return "admin_full"
    
    # Check read-only password
    if password == ADMIN_PASSWORD_READONLY:
        return "admin_readonly"
    
    # Legacy password check
    ADMIN_PASSWORD_PLAIN = "Nikeland2016"
    if password == ADMIN_PASSWORD_PLAIN:
        return "admin_full"
    
    if ADMIN_PASSWORD_HASH:
        try:
            if bcrypt.checkpw(password.encode('utf-8'), ADMIN_PASSWORD_HASH.encode('utf-8')):
                return "admin_full"
        except Exception as e:
            logger.error(f"Password verification error: {e}")
    
    return None

async def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Dependency to verify admin authentication - returns role info"""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentification requise")
    
    token_info = verify_admin_token(credentials.credentials)
    if not token_info["valid"]:
        raise HTTPException(status_code=401, detail="Token invalide ou expiré")
    
    return {"authenticated": True, "role": token_info["role"]}

async def get_admin_write_access(credentials: HTTPAuthorizationCredentials = Depends(security)) -> bool:
    """Dependency to verify admin has write access (not read-only)"""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentification requise")
    
    token_info = verify_admin_token(credentials.credentials)
    if not token_info["valid"]:
        raise HTTPException(status_code=401, detail="Token invalide ou expiré")
    
    if token_info["role"] == "admin_readonly":
        raise HTTPException(status_code=403, detail="Accès en lecture seule - Modification non autorisée")
    
    return True

def generate_whatsapp_link(booking: dict, for_customer: bool = True) -> str:
    """Generate WhatsApp click-to-chat link for booking confirmation"""
    game_type_label = "VR 360°" if booking["game_type"] == "VR_360" else "Simulateur Course"
    
    if for_customer:
        # Message for customer to contact restaurant
        message = f"""🎮 *Confirmation de Réservation - Espace Maxo*

Bonjour, je confirme ma réservation:
- *Nom:* {booking["customer_name"]}
- *Date:* {booking["date"]}
- *Heure:* {booking["time_slot"]}
- *Jeu:* {game_type_label}
- *Joueurs:* {booking["number_of_players"]}
- *Parties:* {booking["number_of_games"]}

Merci!"""
    else:
        # Message for restaurant notification
        message = f"""🎮 *Nouvelle Réservation!*

- *Client:* {booking["customer_name"]}
- *Téléphone:* {booking["customer_phone"]}
- *Date:* {booking["date"]}
- *Heure:* {booking["time_slot"]}
- *Jeu:* {game_type_label}
- *Joueurs:* {booking["number_of_players"]}
- *Parties:* {booking["number_of_games"]}
- *Total:* {int(booking["total_amount"])} FCFA"""
    
    encoded_message = quote(message)
    return f"https://wa.me/{WHATSAPP_NUMBER}?text={encoded_message}"

def generate_admin_whatsapp_notification(booking: dict) -> str:
    """Generate WhatsApp notification link for admin"""
    game_type_label = "VR 360°" if booking["game_type"] == "VR_360" else "Simulateur Course"
    message = f"""✅ *Nouvelle Réservation Payée!*

👤 *Client:* {booking["customer_name"]}
📱 *Tel:* {booking["customer_phone"]}
📅 *Date:* {booking["date"]} à {booking["time_slot"]}
🎮 *Jeu:* {game_type_label}
👥 *Joueurs:* {booking["number_of_players"]} x {booking["number_of_games"]} parties
💰 *Total à payer sur place:* {int(booking["total_game_price"])} FCFA
✅ *Frais réservation payés:* {int(booking["reservation_fee"])} FCFA"""
    
    encoded_message = quote(message)
    return f"https://wa.me/{WHATSAPP_NUMBER}?text={encoded_message}"

async def verify_kkiapay_transaction(transaction_id: str) -> dict:
    """Verify a Kkiapay transaction"""
    if not KKIAPAY_PRIVATE_KEY:
        # Sandbox mode - simulate success
        return {"status": "SUCCESS", "amount": 500, "transactionId": transaction_id}
    
    url = "https://api.kkiapay.me/api/v1/transactions/status"
    headers = {
        "x-private-key": KKIAPAY_PRIVATE_KEY,
        "x-secret-key": KKIAPAY_SECRET,
        "Content-Type": "application/json"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json={"transactionId": transaction_id}, headers=headers)
        if response.status_code == 200:
            return response.json()
        else:
            logger.error(f"Kkiapay verification failed: {response.text}")
            return {"status": "FAILED", "error": response.text}

# ============== ROUTES ==============

@api_router.get("/")
async def root():
    return {"message": "Bienvenue à Espace Maxo API"}

# Menu routes
@api_router.get("/menu", response_model=List[MenuItem])
async def get_menu():
    """Get all menu items"""
    menu = await db.menu_items.find({}, {"_id": 0}).to_list(100)
    if not menu:
        # Seed data if empty
        for item in MENU_ITEMS:
            await db.menu_items.insert_one(item)
        menu = MENU_ITEMS
    return menu

@api_router.get("/menu/categories")
async def get_menu_categories():
    """Get unique categories"""
    menu = await db.menu_items.find({}, {"_id": 0, "category": 1}).to_list(100)
    if not menu:
        categories = list(set(item["category"] for item in MENU_ITEMS))
    else:
        categories = list(set(item["category"] for item in menu))
    return {"categories": categories}

@api_router.get("/menu/{item_id}", response_model=MenuItem)
async def get_menu_item(item_id: str):
    """Get single menu item"""
    item = await db.menu_items.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item

# Games routes
@api_router.get("/games", response_model=List[Game])
async def get_games():
    """Get all games"""
    games = await db.games.find({}, {"_id": 0}).to_list(100)
    if not games:
        # Seed data if empty
        for game in GAMES:
            await db.games.insert_one(game)
        games = GAMES
    return games

@api_router.get("/games/{game_id}", response_model=Game)
async def get_game(game_id: str):
    """Get single game"""
    game = await db.games.find_one({"id": game_id}, {"_id": 0})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    return game

# Booking routes
@api_router.get("/slots/{date}")
async def get_available_slots(date: str):
    """Get available time slots for a date"""
    slots = []
    
    # Get current time in Benin timezone (UTC+1)
    now = datetime.now(timezone.utc) + timedelta(hours=1)
    current_date = now.strftime("%Y-%m-%d")
    current_hour = now.hour
    current_minute = now.minute
    
    is_today = date == current_date
    
    for hour in range(10, 22):
        for minute in [0, 30]:
            time_str = f"{hour:02d}:{minute:02d}"
            
            # Check if slot is in the past (only for today)
            is_past = False
            if is_today:
                if hour < current_hour:
                    is_past = True
                elif hour == current_hour and minute <= current_minute:
                    is_past = True
            
            # Check if slot is already booked
            booking = await db.bookings.find_one({
                "date": date, 
                "time_slot": time_str,
                "payment_status": {"$in": ["completed", "paid"]},
                "booking_status": {"$ne": "cancelled"}
            })
            
            # Slot is unavailable if it's booked OR if it's in the past
            is_available = booking is None and not is_past
            
            slots.append({
                "time": time_str,
                "available": is_available,
                "is_past": is_past
            })
    return {"date": date, "slots": slots}

@api_router.post("/bookings", response_model=Booking)
async def create_booking(booking_data: BookingCreate):
    """Create a new booking"""
    existing = await db.bookings.find_one({
        "date": booking_data.date,
        "time_slot": booking_data.time_slot,
        "payment_status": {"$in": ["completed", "paid"]},
        "booking_status": {"$ne": "cancelled"}
    })
    if existing:
        raise HTTPException(status_code=400, detail="Ce créneau est déjà réservé")
    
    # Prix différent selon le type de jeu
    game_price = 1500.0 if booking_data.game_type == "RACING_SIMULATOR" else 2000.0
    total_game_price = game_price * booking_data.number_of_games * booking_data.number_of_players
    reservation_fee = 500.0
    total_amount = total_game_price + reservation_fee
    
    # Determine amount to pay based on options
    wallet_amount_used = 0.0
    amount_to_pay = reservation_fee  # Default: just reservation fee
    payment_type = "reservation_only"
    
    if booking_data.pay_full_amount:
        amount_to_pay = total_amount
        payment_type = "full_payment"
    
    # Check wallet balance if user wants to use it
    if booking_data.use_wallet:
        phone = booking_data.customer_phone.replace(" ", "").replace("+229", "")
        wallet = await db.wallets.find_one({"phone": {"$regex": f".*{phone}$"}})
        if wallet and wallet.get("balance", 0) > 0:
            available_balance = wallet.get("balance", 0)
            if available_balance >= amount_to_pay:
                wallet_amount_used = amount_to_pay
                amount_to_pay = 0
            else:
                wallet_amount_used = available_balance
                amount_to_pay = amount_to_pay - available_balance
    
    # Generate unique reschedule token
    reschedule_token = str(uuid.uuid4())[:8].upper()
    
    booking = Booking(
        customer_name=booking_data.customer_name,
        customer_phone=booking_data.customer_phone,
        game_type=booking_data.game_type,
        date=booking_data.date,
        time_slot=booking_data.time_slot,
        number_of_players=booking_data.number_of_players,
        number_of_games=booking_data.number_of_games,
        total_game_price=total_game_price,
        reservation_fee=reservation_fee,
        total_amount=total_amount,
        amount_to_pay=amount_to_pay,
        payment_type=payment_type,
        wallet_amount_used=wallet_amount_used,
        reschedule_token=reschedule_token
    )
    
    booking_dict = booking.model_dump()
    booking_dict["whatsapp_link"] = generate_whatsapp_link(booking_dict)
    
    await db.bookings.insert_one(booking_dict)
    return Booking(**booking_dict)

@api_router.get("/bookings/{booking_id}")
async def get_booking(booking_id: str):
    """Get booking details with WhatsApp links"""
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    
    # Add WhatsApp links
    booking["whatsapp_link"] = generate_whatsapp_link(booking)
    booking["whatsapp_admin_link"] = generate_admin_whatsapp_notification(booking)
    
    return booking

# ============== WALLET/PROVISION ROUTES ==============

import random

# Store OTPs temporarily (in production, use Redis with TTL)
wallet_otps = {}

class WalletOTPRequest(BaseModel):
    phone: str
    name: Optional[str] = None

class WalletOTPVerify(BaseModel):
    phone: str
    otp: str

@api_router.post("/wallet/send-otp")
async def send_wallet_otp(request: WalletOTPRequest):
    """Send OTP to phone via SMS using Twilio Verify"""
    clean_phone = request.phone.replace(" ", "").replace("+229", "")
    
    # Format phone number for Twilio (E.164 format: +229XXXXXXXX)
    formatted_phone = f"+229{clean_phone}" if not clean_phone.startswith("+") else clean_phone
    
    # Store name for later use when verifying
    wallet_otps[clean_phone] = {
        "name": request.name,
        "created_at": datetime.now(timezone.utc)
    }
    
    # Send OTP via Twilio Verify SMS
    try:
        if not twilio_client or not TWILIO_VERIFY_SERVICE_SID:
            logger.error("Twilio not configured")
            raise HTTPException(status_code=500, detail="Service SMS non configuré")
        
        verification = twilio_client.verify.v2.services(TWILIO_VERIFY_SERVICE_SID) \
            .verifications.create(to=formatted_phone, channel="sms")
        
        logger.info(f"OTP SMS sent for wallet access: {clean_phone}, status: {verification.status}")
        
        return {
            "success": True,
            "message": "Code envoyé par SMS",
            "phone": clean_phone
        }
    except Exception as e:
        logger.error(f"Error sending OTP via Twilio: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'envoi du SMS: {str(e)}")

@api_router.post("/wallet/verify-otp")
async def verify_wallet_otp(request: WalletOTPVerify):
    """Verify OTP for wallet access using Twilio Verify"""
    clean_phone = request.phone.replace(" ", "").replace("+229", "")
    formatted_phone = f"+229{clean_phone}" if not clean_phone.startswith("+") else clean_phone
    
    stored = wallet_otps.get(clean_phone)
    name = stored.get("name") if stored else None
    
    # Verify OTP with Twilio
    try:
        if not twilio_client or not TWILIO_VERIFY_SERVICE_SID:
            raise HTTPException(status_code=500, detail="Service SMS non configuré")
        
        verification_check = twilio_client.verify.v2.services(TWILIO_VERIFY_SERVICE_SID) \
            .verification_checks.create(to=formatted_phone, code=request.otp)
        
        if verification_check.status != "approved":
            raise HTTPException(status_code=400, detail="Code incorrect ou expiré")
        
        logger.info(f"OTP verified for wallet access: {clean_phone}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying OTP: {e}")
        raise HTTPException(status_code=400, detail="Code incorrect ou expiré")
    
    # OTP is valid - clean up stored data
    if clean_phone in wallet_otps:
        del wallet_otps[clean_phone]
    
    # Check if wallet exists
    wallet = await db.wallets.find_one({"phone": {"$regex": f".*{clean_phone}$"}}, {"_id": 0})
    
    if not wallet and name:
        # Create wallet
        wallet = {
            "id": str(uuid.uuid4()),
            "phone": clean_phone,
            "name": name,
            "balance": 0,
            "transactions": [],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.wallets.insert_one(wallet)
        wallet = await db.wallets.find_one({"phone": {"$regex": f".*{clean_phone}$"}}, {"_id": 0})
    
    # Generate session token for this wallet access
    session_token = str(uuid.uuid4())
    
    # Store session (valid for 30 minutes)
    await db.wallet_sessions.update_one(
        {"phone": clean_phone},
        {
            "$set": {
                "token": session_token,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
            }
        },
        upsert=True
    )
    
    # Get loyalty points
    loyalty = await db.loyalty_accounts.find_one({"phone_number": {"$regex": f".*{clean_phone}$"}}, {"_id": 0})
    loyalty_points = loyalty.get("points", 0) if loyalty else 0
    free_games = loyalty_points // 100  # 100 points = 1 free game
    
    return {
        "success": True,
        "message": "Code vérifié avec succès",
        "session_token": session_token,
        "wallet": {
            "exists": wallet is not None,
            "balance": wallet.get("balance", 0) if wallet else 0,
            "phone": clean_phone,
            "name": wallet.get("name") if wallet else name,
            "transactions": wallet.get("transactions", [])[-10:] if wallet else []
        },
        "loyalty": {
            "points": loyalty_points,
            "free_games_available": free_games
        }
    }

@api_router.get("/wallet/{phone}/secure")
async def get_wallet_secure(phone: str, token: str = Query(...)):
    """Get wallet with session token verification"""
    clean_phone = phone.replace(" ", "").replace("+229", "")
    
    # Verify session token
    session = await db.wallet_sessions.find_one({"phone": clean_phone, "token": token})
    
    if not session:
        raise HTTPException(status_code=401, detail="Session invalide. Veuillez vous reconnecter.")
    
    # Check expiration
    expires_at = datetime.fromisoformat(session["expires_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) > expires_at:
        await db.wallet_sessions.delete_one({"phone": clean_phone})
        raise HTTPException(status_code=401, detail="Session expirée. Veuillez vous reconnecter.")
    
    wallet = await db.wallets.find_one({"phone": {"$regex": f".*{clean_phone}$"}}, {"_id": 0})
    
    # Get loyalty points
    loyalty = await db.loyalty_accounts.find_one({"phone_number": {"$regex": f".*{clean_phone}$"}}, {"_id": 0})
    loyalty_points = loyalty.get("points", 0) if loyalty else 0
    free_games = loyalty_points // 100
    
    if not wallet:
        return {
            "exists": False, 
            "balance": 0, 
            "phone": clean_phone,
            "loyalty": {
                "points": loyalty_points,
                "free_games_available": free_games
            }
        }
    
    return {
        "exists": True,
        "balance": wallet.get("balance", 0),
        "phone": wallet.get("phone"),
        "name": wallet.get("name"),
        "transactions": wallet.get("transactions", [])[-10:],
        "loyalty": {
            "points": loyalty_points,
            "free_games_available": free_games
        }
    }

@api_router.get("/wallet/{phone}")
async def get_wallet(phone: str):
    """Get wallet balance by phone number (basic check - no sensitive data)"""
    clean_phone = phone.replace(" ", "").replace("+229", "")
    wallet = await db.wallets.find_one({"phone": {"$regex": f".*{clean_phone}$"}}, {"_id": 0})
    
    if not wallet:
        return {"exists": False, "balance": 0, "phone": clean_phone}
    
    # Only return basic info without full transaction history
    return {
        "exists": True,
        "balance": wallet.get("balance", 0),
        "phone": wallet.get("phone"),
        "name": wallet.get("name")
    }

@api_router.post("/wallet/create")
async def create_wallet(wallet_data: WalletCreate):
    """Create a new wallet"""
    clean_phone = wallet_data.phone.replace(" ", "").replace("+229", "")
    
    existing = await db.wallets.find_one({"phone": {"$regex": f".*{clean_phone}$"}})
    if existing:
        return {
            "message": "Portefeuille existant",
            "balance": existing.get("balance", 0),
            "phone": existing.get("phone")
        }
    
    wallet = {
        "id": str(uuid.uuid4()),
        "phone": clean_phone,
        "name": wallet_data.name,
        "balance": 0,
        "transactions": [],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.wallets.insert_one(wallet)
    
    return {
        "message": "Portefeuille créé avec succès",
        "balance": 0,
        "phone": clean_phone
    }

@api_router.post("/wallet/topup")
async def topup_wallet(topup_data: WalletTopUp):
    """Add funds to wallet after Kkiapay payment"""
    clean_phone = topup_data.phone.replace(" ", "").replace("+229", "")
    
    wallet = await db.wallets.find_one({"phone": {"$regex": f".*{clean_phone}$"}})
    
    if not wallet:
        # Create wallet if doesn't exist
        wallet = {
            "id": str(uuid.uuid4()),
            "phone": clean_phone,
            "name": "Client",
            "balance": 0,
            "transactions": [],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.wallets.insert_one(wallet)
    
    # Add transaction
    transaction = {
        "id": str(uuid.uuid4()),
        "type": "topup",
        "amount": topup_data.amount,
        "kkiapay_transaction_id": topup_data.transaction_id,
        "date": datetime.now(timezone.utc).isoformat(),
        "description": f"Recharge de {int(topup_data.amount)} FCFA"
    }
    
    new_balance = wallet.get("balance", 0) + topup_data.amount
    
    await db.wallets.update_one(
        {"phone": {"$regex": f".*{clean_phone}$"}},
        {
            "$set": {"balance": new_balance},
            "$push": {"transactions": transaction}
        }
    )
    
    # Send WhatsApp notification
    notification = f"💰 RECHARGE PORTEFEUILLE\n\n📱 {clean_phone}\n💵 Montant: {int(topup_data.amount)} FCFA\n🏦 Nouveau solde: {int(new_balance)} FCFA"
    await send_whatsapp_notification(notification)
    
    logger.info(f"Wallet topped up: {clean_phone} +{topup_data.amount} FCFA")
    
    return {
        "message": "Recharge effectuée avec succès",
        "new_balance": new_balance,
        "amount_added": topup_data.amount
    }

@api_router.post("/wallet/use")
async def use_wallet(use_data: WalletUse):
    """Use wallet balance for a service"""
    clean_phone = use_data.phone.replace(" ", "").replace("+229", "")
    
    wallet = await db.wallets.find_one({"phone": {"$regex": f".*{clean_phone}$"}})
    
    if not wallet:
        raise HTTPException(status_code=404, detail="Portefeuille non trouvé")
    
    current_balance = wallet.get("balance", 0)
    if current_balance < use_data.amount:
        raise HTTPException(status_code=400, detail=f"Solde insuffisant. Disponible: {int(current_balance)} FCFA")
    
    # Add transaction
    transaction = {
        "id": str(uuid.uuid4()),
        "type": "payment",
        "amount": -use_data.amount,
        "service_type": use_data.service_type,
        "date": datetime.now(timezone.utc).isoformat(),
        "description": use_data.description
    }
    
    new_balance = current_balance - use_data.amount
    
    await db.wallets.update_one(
        {"phone": {"$regex": f".*{clean_phone}$"}},
        {
            "$set": {"balance": new_balance},
            "$push": {"transactions": transaction}
        }
    )
    
    logger.info(f"Wallet used: {clean_phone} -{use_data.amount} FCFA for {use_data.service_type}")
    
    return {
        "message": "Paiement effectué avec succès",
        "new_balance": new_balance,
        "amount_used": use_data.amount
    }

@api_router.get("/admin/wallets")
async def get_all_wallets(is_admin: bool = Depends(get_current_admin)):
    """Get all wallets for admin"""
    wallets = await db.wallets.find({}, {"_id": 0}).to_list(100)
    
    total_balance = sum(w.get("balance", 0) for w in wallets)
    
    return {
        "wallets": wallets,
        "stats": {
            "total_wallets": len(wallets),
            "total_balance": total_balance
        }
    }

# ============== RESCHEDULING ROUTES ==============

def check_reschedule_fee_required(booking: dict) -> tuple:
    """
    Check if rescheduling fee is required (less than 15 minutes before session).
    Returns (fee_required: bool, fee_amount: int, minutes_until_session: int or None)
    """
    try:
        booking_date = booking.get("date")  # Format: YYYY-MM-DD
        time_slot = booking.get("time_slot")  # Format: HH:MM
        
        if not booking_date or not time_slot:
            return False, 0, None
        
        # Parse session datetime
        session_datetime = datetime.strptime(f"{booking_date} {time_slot}", "%Y-%m-%d %H:%M")
        session_datetime = session_datetime.replace(tzinfo=timezone.utc)
        
        now = datetime.now(timezone.utc)
        time_diff = session_datetime - now
        minutes_until_session = int(time_diff.total_seconds() / 60)
        
        # Fee required if less than 15 minutes before session
        if minutes_until_session < 15:
            return True, 500, minutes_until_session
        
        return False, 0, minutes_until_session
    except Exception as e:
        logger.error(f"Error checking reschedule fee: {e}")
        return False, 0, None

@api_router.post("/bookings/find-for-reschedule")
async def find_booking_for_reschedule(request_data: FindBookingRequest):
    """Find a booking by phone and name for rescheduling"""
    # Clean phone number
    phone = request_data.phone.replace(" ", "").replace("+229", "")
    name = request_data.name.strip()
    
    # Search for booking with exact phone and name (case insensitive)
    # Allow both paid and pending reservations that are active
    booking = await db.bookings.find_one({
        "customer_phone": {"$regex": f".*{phone}$", "$options": "i"},
        "customer_name": {"$regex": f"^{name}$", "$options": "i"},
        "booking_status": "active",
        "has_been_rescheduled": {"$ne": True}
    }, {"_id": 0})
    
    if not booking:
        # Try to find any booking to give more specific error
        any_booking = await db.bookings.find_one({
            "customer_phone": {"$regex": f".*{phone}$", "$options": "i"},
            "customer_name": {"$regex": f"^{name}$", "$options": "i"}
        })
        
        if any_booking:
            if any_booking.get("booking_status") == "cancelled":
                raise HTTPException(status_code=400, detail="Cette réservation a été annulée")
            if any_booking.get("booking_status") == "completed":
                raise HTTPException(status_code=400, detail="Cette réservation est déjà terminée")
            if any_booking.get("has_been_rescheduled"):
                raise HTTPException(status_code=400, detail="Cette réservation a déjà été reprogrammée une fois. Les frais de réservation ne sont pas remboursables.")
        
        raise HTTPException(status_code=404, detail="Aucune réservation trouvée avec ce nom et numéro de téléphone")
    
    fee_required, fee_amount, minutes_until = check_reschedule_fee_required(booking)
    
    return {
        "booking": {
            "id": booking["id"],
            "customer_name": booking["customer_name"],
            "customer_phone": booking["customer_phone"],
            "game_type": booking["game_type"],
            "date": booking["date"],
            "time_slot": booking["time_slot"],
            "number_of_players": booking["number_of_players"],
            "number_of_games": booking["number_of_games"],
            "payment_status": booking.get("payment_status", "pending")
        },
        "can_reschedule": True,
        "fee_required": fee_required,
        "fee_amount": fee_amount,
        "minutes_until_session": minutes_until,
        "warning_message": "⚠️ Attention: Vous ne pouvez reprogrammer qu'une seule fois. Après cette reprogrammation, les frais de réservation ne seront pas remboursables." if not fee_required else "⚠️ Attention: La session commence dans moins de 15 minutes. Des frais de 500 FCFA seront appliqués. Vous ne pouvez reprogrammer qu'une seule fois."
    }

@api_router.post("/bookings/{booking_id}/reschedule-by-client")
async def reschedule_booking_by_phone_name(
    booking_id: str, 
    reschedule_data: RescheduleByClientRequest
):
    """Client reschedules their booking using phone and name verification"""
    # Clean phone number
    phone = reschedule_data.phone.replace(" ", "").replace("+229", "")
    name = reschedule_data.name.strip()
    
    booking = await db.bookings.find_one({"id": booking_id})
    
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    
    # Verify phone and name match
    booking_phone = booking.get("customer_phone", "").replace(" ", "").replace("+229", "")
    if not booking_phone.endswith(phone) or booking.get("customer_name", "").lower() != name.lower():
        raise HTTPException(status_code=403, detail="Les informations ne correspondent pas à cette réservation")
    
    if booking.get("booking_status") in ["cancelled", "completed"]:
        raise HTTPException(status_code=400, detail="Cette réservation ne peut plus être modifiée")
    
    if booking.get("has_been_rescheduled"):
        raise HTTPException(
            status_code=400, 
            detail="Cette réservation a déjà été reprogrammée. Les frais de réservation ne sont pas remboursables."
        )
    
    # Check if new slot is available
    existing = await db.bookings.find_one({
        "date": reschedule_data.new_date,
        "time_slot": reschedule_data.new_time_slot,
        "booking_status": {"$ne": "cancelled"},
        "id": {"$ne": booking_id}
    })
    if existing:
        raise HTTPException(status_code=400, detail="Ce créneau est déjà réservé")
    
    fee_required, fee_amount, _ = check_reschedule_fee_required(booking)
    
    # Verify payment if fee is required
    if fee_required and fee_amount > 0:
        if not reschedule_data.payment_transaction_id:
            raise HTTPException(
                status_code=400, 
                detail=f"Le paiement des frais de reprogrammation ({fee_amount} FCFA) est requis. Veuillez effectuer le paiement."
            )
        
        # Verify the transaction with Kkiapay
        try:
            async with httpx.AsyncClient() as client:
                verify_response = await client.get(
                    f"https://api.kkiapay.me/api/v1/transactions/status/{reschedule_data.payment_transaction_id}",
                    headers={"x-private-key": KKIAPAY_PRIVATE_KEY}
                )
                if verify_response.status_code == 200:
                    tx_data = verify_response.json()
                    if tx_data.get("status") != "SUCCESS":
                        raise HTTPException(status_code=400, detail="Le paiement n'a pas été validé")
                    if tx_data.get("amount") < fee_amount:
                        raise HTTPException(status_code=400, detail="Le montant payé est insuffisant")
                else:
                    logger.error(f"Kkiapay verification failed: {verify_response.text}")
                    # Allow reschedule but log the issue
                    logger.warning(f"Could not verify payment {reschedule_data.payment_transaction_id}, proceeding anyway")
        except httpx.RequestError as e:
            logger.error(f"Error verifying payment: {e}")
            # Allow reschedule but log the issue
    
    # Update booking
    update_data = {
        "original_date": booking["date"],
        "original_time_slot": booking["time_slot"],
        "date": reschedule_data.new_date,
        "time_slot": reschedule_data.new_time_slot,
        "has_been_rescheduled": True,
        "rescheduled_at": datetime.now(timezone.utc).isoformat(),
        "reschedule_fee_paid": fee_amount if fee_required else 0,
        "reschedule_payment_id": reschedule_data.payment_transaction_id if fee_required else None,
        "rescheduled_by": "client"
    }
    
    await db.bookings.update_one({"id": booking_id}, {"$set": update_data})
    
    # Format dates for notification
    def format_date_fr(date_str):
        if not date_str:
            return ""
        year, month, day = date_str.split("-")
        return f"{day}/{month}/{year}"
    
    # Send SMS notification to admin
    game_type_label = "VR 360°" if booking.get("game_type") == "VR_360" else "Simulateur"
    admin_notification = (
        f"REPROGRAMMATION CLIENT\n\n"
        f"Client: {booking['customer_name']}\n"
        f"Tel: {booking['customer_phone']}\n"
        f"Jeu: {game_type_label}\n\n"
        f"Ancienne date: {format_date_fr(booking['date'])} a {booking['time_slot']}\n"
        f"Nouvelle date: {format_date_fr(reschedule_data.new_date)} a {reschedule_data.new_time_slot}\n"
        f"{'Frais: 500 FCFA PAYES' if fee_required else 'Gratuit (> 15 min avant)'}"
    )
    await send_whatsapp_notification(admin_notification)
    
    return {
        "status": "success",
        "message": "Réservation reprogrammée avec succès",
        "fee_charged": fee_amount if fee_required else 0,
        "new_date": reschedule_data.new_date,
        "new_time_slot": reschedule_data.new_time_slot,
        "warning": "⚠️ Cette réservation ne peut plus être reprogrammée. Les frais de réservation ne sont pas remboursables."
    }

@api_router.get("/bookings/{booking_id}/reschedule-info")
async def get_reschedule_info(booking_id: str, token: str = Query(...)):
    """Get booking info for rescheduling (client access via token)"""
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    
    if booking.get("reschedule_token") != token:
        raise HTTPException(status_code=403, detail="Token de reprogrammation invalide")
    
    if booking.get("payment_status") != "paid":
        raise HTTPException(status_code=400, detail="Seules les réservations payées peuvent être reprogrammées")
    
    if booking.get("booking_status") == "cancelled":
        raise HTTPException(status_code=400, detail="Cette réservation a été annulée")
    
    if booking.get("booking_status") == "completed":
        raise HTTPException(status_code=400, detail="Cette réservation est déjà terminée")
    
    if booking.get("has_been_rescheduled"):
        raise HTTPException(
            status_code=400, 
            detail="Cette réservation a déjà été reprogrammée une fois. Les frais de réservation ne sont pas remboursables."
        )
    
    fee_required, fee_amount, minutes_until = check_reschedule_fee_required(booking)
    
    return {
        "booking": {
            "id": booking["id"],
            "customer_name": booking["customer_name"],
            "game_type": booking["game_type"],
            "date": booking["date"],
            "time_slot": booking["time_slot"],
            "number_of_players": booking["number_of_players"],
            "number_of_games": booking["number_of_games"]
        },
        "can_reschedule": True,
        "fee_required": fee_required,
        "fee_amount": fee_amount,
        "minutes_until_session": minutes_until,
        "warning_message": "⚠️ Attention: Vous ne pouvez reprogrammer qu'une seule fois. Après cette reprogrammation, les frais de réservation ne seront pas remboursables." if not fee_required else "⚠️ Attention: La session commence dans moins de 15 minutes. Des frais de 500 FCFA seront appliqués. Vous ne pouvez reprogrammer qu'une seule fois."
    }

@api_router.post("/bookings/{booking_id}/reschedule")
async def reschedule_booking_by_client(
    booking_id: str, 
    reschedule_data: RescheduleRequest,
    token: str = Query(...)
):
    """Client reschedules their booking using token"""
    booking = await db.bookings.find_one({"id": booking_id})
    
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    
    if booking.get("reschedule_token") != token:
        raise HTTPException(status_code=403, detail="Token de reprogrammation invalide")
    
    if booking.get("payment_status") != "paid":
        raise HTTPException(status_code=400, detail="Seules les réservations payées peuvent être reprogrammées")
    
    if booking.get("booking_status") in ["cancelled", "completed"]:
        raise HTTPException(status_code=400, detail="Cette réservation ne peut plus être modifiée")
    
    if booking.get("has_been_rescheduled"):
        raise HTTPException(
            status_code=400, 
            detail="Cette réservation a déjà été reprogrammée. Les frais de réservation ne sont pas remboursables."
        )
    
    # Check if new slot is available
    existing = await db.bookings.find_one({
        "date": reschedule_data.new_date,
        "time_slot": reschedule_data.new_time_slot,
        "payment_status": {"$in": ["completed", "paid"]},
        "booking_status": {"$ne": "cancelled"},
        "id": {"$ne": booking_id}
    })
    if existing:
        raise HTTPException(status_code=400, detail="Ce créneau est déjà réservé")
    
    fee_required, fee_amount, _ = check_reschedule_fee_required(booking)
    
    # Update booking
    update_data = {
        "original_date": booking["date"],
        "original_time_slot": booking["time_slot"],
        "date": reschedule_data.new_date,
        "time_slot": reschedule_data.new_time_slot,
        "has_been_rescheduled": True,
        "rescheduled_at": datetime.now(timezone.utc).isoformat(),
        "reschedule_fee_paid": fee_amount if fee_required else 0
    }
    
    await db.bookings.update_one({"id": booking_id}, {"$set": update_data})
    
    # Send WhatsApp notification to admin
    game_type_label = "VR 360°" if booking.get("game_type") == "VR_360" else "Simulateur"
    admin_notification = (
        f"📅 REPROGRAMMATION CLIENT\n\n"
        f"👤 {booking['customer_name']}\n"
        f"📱 {booking['customer_phone']}\n"
        f"🎯 {game_type_label}\n\n"
        f"❌ Ancienne date: {booking['date']} à {booking['time_slot']}\n"
        f"✅ Nouvelle date: {reschedule_data.new_date} à {reschedule_data.new_time_slot}\n"
        f"{'💰 Frais: 500 FCFA' if fee_required else '✨ Gratuit (> 15 min avant)'}"
    )
    await send_whatsapp_notification(admin_notification)
    
    # Generate WhatsApp message for client confirmation
    client_message = (
        f"Bonjour {booking['customer_name']}, votre réservation a été reprogrammée avec succès!\n\n"
        f"🎯 Jeu: {game_type_label}\n"
        f"📅 Nouvelle date: {reschedule_data.new_date}\n"
        f"⏰ Nouveau créneau: {reschedule_data.new_time_slot}\n\n"
        f"⚠️ Rappel: Cette réservation ne peut plus être reprogrammée. Les frais de réservation ne sont pas remboursables.\n\n"
        f"À bientôt chez Espace Maxo!"
    )
    
    return {
        "status": "success",
        "message": "Réservation reprogrammée avec succès",
        "fee_charged": fee_amount if fee_required else 0,
        "new_date": reschedule_data.new_date,
        "new_time_slot": reschedule_data.new_time_slot,
        "client_notification": client_message,
        "warning": "⚠️ Cette réservation ne peut plus être reprogrammée. Les frais de réservation ne sont pas remboursables."
    }

@api_router.post("/admin/bookings/{booking_id}/reschedule")
async def reschedule_booking_by_admin(
    booking_id: str, 
    reschedule_data: RescheduleRequest,
    is_admin: bool = Depends(get_current_admin)
):
    """Admin reschedules a booking"""
    booking = await db.bookings.find_one({"id": booking_id})
    
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    
    if booking.get("payment_status") != "paid":
        raise HTTPException(status_code=400, detail="Seules les réservations payées peuvent être reprogrammées")
    
    if booking.get("booking_status") in ["cancelled", "completed"]:
        raise HTTPException(status_code=400, detail="Cette réservation ne peut plus être modifiée")
    
    if booking.get("has_been_rescheduled"):
        raise HTTPException(
            status_code=400, 
            detail="Cette réservation a déjà été reprogrammée. Les frais de réservation ne sont pas remboursables."
        )
    
    # Check if new slot is available
    existing = await db.bookings.find_one({
        "date": reschedule_data.new_date,
        "time_slot": reschedule_data.new_time_slot,
        "payment_status": {"$in": ["completed", "paid"]},
        "booking_status": {"$ne": "cancelled"},
        "id": {"$ne": booking_id}
    })
    if existing:
        raise HTTPException(status_code=400, detail="Ce créneau est déjà réservé")
    
    fee_required, fee_amount, _ = check_reschedule_fee_required(booking)
    
    # Update booking
    update_data = {
        "original_date": booking["date"],
        "original_time_slot": booking["time_slot"],
        "date": reschedule_data.new_date,
        "time_slot": reschedule_data.new_time_slot,
        "has_been_rescheduled": True,
        "rescheduled_at": datetime.now(timezone.utc).isoformat(),
        "reschedule_fee_paid": fee_amount if fee_required else 0,
        "rescheduled_by": "admin"
    }
    
    await db.bookings.update_one({"id": booking_id}, {"$set": update_data})
    
    # Send WhatsApp notification to client
    game_type_label = "VR 360°" if booking.get("game_type") == "VR_360" else "Simulateur"
    phone = booking["customer_phone"].replace(" ", "").replace("+229", "")
    client_notification = (
        f"Bonjour {booking['customer_name']},\n\n"
        f"Votre réservation chez Espace Maxo a été reprogrammée:\n\n"
        f"🎯 Jeu: {game_type_label}\n"
        f"❌ Ancienne date: {booking['date']} à {booking['time_slot']}\n"
        f"✅ Nouvelle date: {reschedule_data.new_date} à {reschedule_data.new_time_slot}\n\n"
        f"⚠️ Rappel: Les frais de réservation ne sont pas remboursables.\n\n"
        f"À bientôt!"
    )
    
    # Send WhatsApp to client via CallMeBot (admin's configured number - they will forward to client)
    await send_whatsapp_notification(f"📤 MESSAGE POUR CLIENT:\n\n{client_notification}")
    
    return {
        "status": "success",
        "message": "Réservation reprogrammée avec succès",
        "fee_charged": fee_amount if fee_required else 0,
        "new_date": reschedule_data.new_date,
        "new_time_slot": reschedule_data.new_time_slot,
        "client_whatsapp_link": f"https://wa.me/229{phone}?text={quote(client_notification)}"
    }

# Admin authentication
@api_router.post("/auth/admin-login", response_model=AdminLoginResponse)
async def admin_login(request: AdminLoginRequest):
    """Authenticate admin and return JWT token"""
    role = verify_admin_password(request.password)
    if not role:
        raise HTTPException(status_code=401, detail="Mot de passe incorrect")
    
    token, expiration = create_admin_token(role)
    return AdminLoginResponse(
        token=token,
        expires_at=expiration.isoformat(),
        role=role
    )

@api_router.get("/auth/verify")
async def verify_auth(admin_info: dict = Depends(get_current_admin)):
    """Verify if the current token is valid"""
    return {"valid": True, "role": admin_info.get("role", "admin_full")}

@api_router.get("/admin/bookings")
async def get_all_bookings(
    status: Optional[str] = Query(None, description="Filter by payment_status"),
    booking_status: Optional[str] = Query(None, description="Filter by booking_status"),
    date: Optional[str] = Query(None, description="Filter by date"),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    is_admin: bool = Depends(get_current_admin)
):
    """Get all bookings for admin dashboard"""
    query = {}
    if status:
        query["payment_status"] = status
    if booking_status:
        query["booking_status"] = booking_status
    if date:
        query["date"] = date
    
    bookings = await db.bookings.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.bookings.count_documents(query)
    
    # Add WhatsApp links to each booking
    for booking in bookings:
        booking["whatsapp_link"] = generate_whatsapp_link(booking)
    
    return {
        "bookings": bookings,
        "total": total,
        "limit": limit,
        "skip": skip
    }

@api_router.get("/admin/stats")
async def get_admin_stats(is_admin: bool = Depends(get_current_admin)):
    """Get statistics for admin dashboard"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Total bookings
    total_bookings = await db.bookings.count_documents({})
    
    # Today's bookings
    today_bookings = await db.bookings.count_documents({"date": today})
    
    # Paid bookings
    paid_bookings = await db.bookings.count_documents({"payment_status": "paid"})
    
    # Pending bookings
    pending_bookings = await db.bookings.count_documents({"payment_status": "pending"})
    
    # Cancelled bookings
    cancelled_bookings = await db.bookings.count_documents({"booking_status": "cancelled"})
    
    # Total revenue (from paid bookings)
    pipeline = [
        {"$match": {"payment_status": "paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
    ]
    revenue_result = await db.bookings.aggregate(pipeline).to_list(1)
    total_revenue = revenue_result[0]["total"] if revenue_result else 0
    
    # Revenue from reservation fees only
    pipeline_fees = [
        {"$match": {"payment_status": "paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$reservation_fee"}}}
    ]
    fees_result = await db.bookings.aggregate(pipeline_fees).to_list(1)
    total_fees = fees_result[0]["total"] if fees_result else 0
    
    # Bookings by game type
    pipeline_games = [
        {"$match": {"payment_status": "paid"}},
        {"$group": {"_id": "$game_type", "count": {"$sum": 1}}}
    ]
    games_result = await db.bookings.aggregate(pipeline_games).to_list(10)
    bookings_by_game = {item["_id"]: item["count"] for item in games_result}
    
    # Recent bookings (last 7 days)
    seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
    recent_bookings = await db.bookings.count_documents({
        "date": {"$gte": seven_days_ago},
        "payment_status": "paid"
    })
    
    return {
        "total_bookings": total_bookings,
        "today_bookings": today_bookings,
        "paid_bookings": paid_bookings,
        "pending_bookings": pending_bookings,
        "cancelled_bookings": cancelled_bookings,
        "total_revenue": total_revenue,
        "total_fees_collected": total_fees,
        "bookings_by_game": bookings_by_game,
        "recent_bookings_7_days": recent_bookings,
        "today": today
    }

@api_router.put("/admin/bookings/{booking_id}")
async def update_booking(booking_id: str, update_data: BookingUpdate, has_write_access: bool = Depends(get_admin_write_access)):
    """Update booking status (admin with write access only)"""
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    
    update_dict = {}
    if update_data.booking_status:
        update_dict["booking_status"] = update_data.booking_status
    if update_data.payment_status:
        update_dict["payment_status"] = update_data.payment_status
    
    if update_dict:
        await db.bookings.update_one({"id": booking_id}, {"$set": update_dict})
    
    updated = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    return updated

@api_router.delete("/admin/bookings/{booking_id}")
async def cancel_booking(booking_id: str, has_write_access: bool = Depends(get_admin_write_access)):
    """Cancel a booking (soft delete) - admin with write access only"""
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"booking_status": "cancelled"}}
    )
    
    return {"message": "Réservation annulée", "booking_id": booking_id}

@api_router.delete("/admin/bookings/{booking_id}/permanent")
async def delete_booking_permanently(booking_id: str, has_write_access: bool = Depends(get_admin_write_access)):
    """Permanently delete a booking from database - admin with write access only"""
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    
    # Permanently delete from database
    await db.bookings.delete_one({"id": booking_id})
    
    logger.info(f"Booking {booking_id} permanently deleted by admin")
    
    return {"message": "Réservation supprimée définitivement", "booking_id": booking_id}

# WhatsApp link generator
@api_router.get("/whatsapp/booking/{booking_id}")
async def get_whatsapp_links(booking_id: str):
    """Get WhatsApp links for a booking"""
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    
    return {
        "customer_link": generate_whatsapp_link(booking, for_customer=True),
        "admin_notification_link": generate_admin_whatsapp_notification(booking),
        "whatsapp_number": WHATSAPP_NUMBER
    }

# Kkiapay configuration endpoint
@api_router.get("/payment/config")
async def get_payment_config():
    """Get Kkiapay configuration for frontend"""
    return {
        "public_key": KKIAPAY_PUBLIC_KEY,
        "sandbox": KKIAPAY_SANDBOX,
        "whatsapp_number": WHATSAPP_NUMBER
    }

# Kkiapay payment verification
@api_router.post("/payment/verify")
async def verify_payment(request: Request):
    """Verify Kkiapay payment and update booking"""
    data = await request.json()
    transaction_id = data.get("transaction_id")
    booking_id = data.get("booking_id")
    
    if not transaction_id or not booking_id:
        raise HTTPException(status_code=400, detail="transaction_id et booking_id requis")
    
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    
    # Verify with Kkiapay
    verification = await verify_kkiapay_transaction(transaction_id)
    
    if verification.get("status") == "SUCCESS":
        # Update booking
        await db.bookings.update_one(
            {"id": booking_id},
            {"$set": {
                "payment_status": "paid",
                "payment_session_id": transaction_id
            }}
        )
        
        # Create transaction record
        transaction = PaymentTransaction(
            booking_id=booking_id,
            session_id=transaction_id,
            amount=booking["reservation_fee"],
            currency="XOF",
            payment_status="paid",
            metadata={
                "booking_id": booking_id,
                "kkiapay_transaction_id": transaction_id,
                "payment_method": "mobile_money"
            }
        )
        await db.payment_transactions.insert_one(transaction.model_dump())
        
        # Add loyalty points automatically
        try:
            phone = booking["customer_phone"].replace(" ", "").replace("+229", "")
            customer_name = booking["customer_name"]
            total_games = booking["number_of_players"] * booking["number_of_games"]
            points_earned = total_games * 1  # 1 point per game
            
            account = await db.loyalty_accounts.find_one({"phone": phone})
            if account:
                new_total = account.get("total_points", 0) + points_earned
                new_available = account.get("available_points", 0) + points_earned
                new_games_played = account.get("total_games_played", 0) + total_games
                old_free_games = account.get("available_points", 0) // 10
                new_free_games = new_available // 10
                additional_free_games = new_free_games - old_free_games
                
                await db.loyalty_accounts.update_one(
                    {"phone": phone},
                    {"$set": {
                        "customer_name": customer_name,
                        "total_points": new_total,
                        "available_points": new_available,
                        "total_games_played": new_games_played,
                        "free_games_earned": account.get("free_games_earned", 0) + additional_free_games,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
            else:
                free_games = points_earned // 10
                new_account = LoyaltyAccount(
                    phone=phone,
                    customer_name=customer_name,
                    total_points=points_earned,
                    available_points=points_earned,
                    total_games_played=total_games,
                    free_games_earned=free_games
                )
                await db.loyalty_accounts.insert_one(new_account.model_dump())
            
            # Mark booking
            await db.bookings.update_one(
                {"id": booking_id},
                {"$set": {"loyalty_points_added": True, "loyalty_points_earned": points_earned}}
            )
            logger.info(f"Loyalty points added: {points_earned} for phone {phone}")
        except Exception as e:
            logger.error(f"Error adding loyalty points: {e}")
        
        # Send WhatsApp notification to admin for new paid booking
        try:
            game_type_label = "VR 360°" if booking.get("game_type") == "VR_360" else "Simulateur"
            notification_message = (
                f"🎮 NOUVELLE RÉSERVATION PAYÉE!\n\n"
                f"👤 Client: {booking.get('customer_name')}\n"
                f"📱 Tél: {booking.get('customer_phone')}\n"
                f"🎯 Jeu: {game_type_label}\n"
                f"📅 Date: {booking.get('date')}\n"
                f"⏰ Créneau: {booking.get('time_slot')}\n"
                f"👥 {booking.get('number_of_players')} joueur(s) x {booking.get('number_of_games')} partie(s)\n"
                f"💰 Montant: {booking.get('reservation_fee')} FCFA\n\n"
                f"✅ Paiement confirmé!"
            )
            await send_whatsapp_notification(notification_message)
            logger.info(f"WhatsApp notification sent for booking {booking_id}")
        except Exception as e:
            logger.error(f"Error sending WhatsApp notification: {e}")
        
        # Send SMS confirmation to client
        try:
            game_type_label = "VR 360°" if booking.get("game_type") == "VR_360" else "Simulateur"
            client_message = (
                f"ESPACE MAXO - Confirmation\n\n"
                f"Votre reservation est confirmee!\n\n"
                f"Jeu: {game_type_label}\n"
                f"Date: {booking.get('date')}\n"
                f"Heure: {booking.get('time_slot')}\n"
                f"Joueurs: {booking.get('number_of_players')}\n"
                f"Parties: {booking.get('number_of_games')}\n\n"
                f"Montant paye: {booking.get('reservation_fee')} FCFA\n\n"
                f"Adresse: Fidjrosse Plage, Cotonou\n"
                f"A bientot!"
            )
            await send_client_sms_confirmation(booking.get('customer_phone'), client_message)
            logger.info(f"Client SMS confirmation sent for booking {booking_id}")
        except Exception as e:
            logger.error(f"Error sending client SMS confirmation: {e}")
        
        # Get updated booking
        updated_booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
        
        return {
            "status": "success",
            "message": "Paiement vérifié avec succès",
            "booking": updated_booking,
            "whatsapp_link": generate_whatsapp_link(updated_booking)
        }
    else:
        return {
            "status": "failed",
            "message": "Le paiement n'a pas pu être vérifié",
            "details": verification
        }

@api_router.get("/payment/status/{booking_id}")
async def get_payment_status(booking_id: str):
    """Get payment status for a booking"""
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    
    return {
        "booking_id": booking_id,
        "payment_status": booking.get("payment_status", "pending"),
        "whatsapp_link": generate_whatsapp_link(booking) if booking.get("payment_status") == "paid" else None
    }

# ============== WHATSAPP NOTIFICATION ==============

CALLMEBOT_API_KEY = os.environ.get('CALLMEBOT_API_KEY', '')
# Admin phone numbers for SMS notifications (format: +229XXXXXXXX)
ADMIN_PHONE_NUMBERS = ["+22997720808", "+22991005084"]

async def send_admin_sms_notification(message: str):
    """Send SMS notification to admin phone numbers via Twilio"""
    if not twilio_client:
        logger.warning("Twilio not configured, skipping SMS notification")
        return False
    
    # Get Twilio phone number for sending
    twilio_phone_number = os.environ.get('TWILIO_PHONE_NUMBER', '')
    if not twilio_phone_number:
        # Use Twilio Messaging Service or default sender
        logger.warning("Twilio phone number not configured, trying without sender ID")
    
    success_count = 0
    for admin_phone in ADMIN_PHONE_NUMBERS:
        try:
            # Clean the message for SMS (remove emojis that might cause issues)
            clean_message = message.replace("*", "").replace("👤", "").replace("⭐", "*").replace("💬", "").replace("👉", "->").replace("🆕", "[NOUVEAU]").replace("🎮", "[JEUX]").replace("📅", "").replace("⏰", "").replace("👥", "").replace("💰", "").replace("📱", "Tel:").replace("📍", "").replace("🏠", "[LOCATION]").replace("📝", "")
            
            msg_params = {
                "body": clean_message[:1600],  # SMS limit
                "to": admin_phone
            }
            
            if twilio_phone_number:
                msg_params["from_"] = twilio_phone_number
            else:
                # Use messaging service if available
                messaging_service_sid = os.environ.get('TWILIO_MESSAGING_SERVICE_SID', '')
                if messaging_service_sid:
                    msg_params["messaging_service_sid"] = messaging_service_sid
                else:
                    logger.error(f"No Twilio sender configured for {admin_phone}")
                    continue
            
            message_response = twilio_client.messages.create(**msg_params)
            logger.info(f"SMS notification sent to {admin_phone}, SID: {message_response.sid}")
            success_count += 1
        except Exception as e:
            logger.error(f"Error sending SMS to {admin_phone}: {e}")
    
    return success_count > 0

# Keep old function name for backward compatibility
async def send_whatsapp_notification(message: str):
    """Deprecated: Now sends SMS instead of WhatsApp"""
    return await send_admin_sms_notification(message)

async def send_client_sms_confirmation(phone: str, message: str):
    """Send SMS confirmation to client via Twilio"""
    if not twilio_client:
        logger.warning("Twilio not configured, skipping client SMS")
        return False
    
    twilio_phone_number = os.environ.get('TWILIO_PHONE_NUMBER', '')
    if not twilio_phone_number:
        logger.error("Twilio phone number not configured")
        return False
    
    # Format phone number for Benin
    clean_phone = phone.replace(" ", "").replace("+229", "")
    formatted_phone = f"+229{clean_phone}"
    
    try:
        # Clean message for SMS
        clean_message = message.replace("✅", "[OK]").replace("🎮", "").replace("📅", "").replace("⏰", "").replace("👥", "").replace("💰", "").replace("📍", "").replace("🎯", "")
        
        msg_response = twilio_client.messages.create(
            body=clean_message[:1600],
            to=formatted_phone,
            from_=twilio_phone_number
        )
        logger.info(f"Client SMS sent to {formatted_phone}, SID: {msg_response.sid}")
        return True
    except Exception as e:
        logger.error(f"Error sending SMS to client {formatted_phone}: {e}")
        return False

# ============== REVIEWS ROUTES ==============

@api_router.post("/reviews", response_model=Review)
async def create_review(review_data: ReviewCreate):
    """Submit a new review (pending approval)"""
    if not review_data.customer_name or not review_data.comment:
        raise HTTPException(status_code=400, detail="Nom et commentaire requis")
    
    if review_data.rating < 1 or review_data.rating > 5:
        raise HTTPException(status_code=400, detail="Note entre 1 et 5 requise")
    
    review = Review(
        customer_name=review_data.customer_name,
        rating=review_data.rating,
        comment=review_data.comment,
        status="pending"
    )
    
    await db.reviews.insert_one(review.model_dump())
    
    # Send WhatsApp notification to admin
    stars = "⭐" * review_data.rating
    notification_message = f"""🆕 *Nouvel avis reçu!*

👤 *{review_data.customer_name}*
{stars} ({review_data.rating}/5)

💬 "{review_data.comment[:100]}{'...' if len(review_data.comment) > 100 else ''}"

👉 Connectez-vous à l'admin pour approuver ou rejeter cet avis."""

    await send_whatsapp_notification(notification_message)
    
    return review

@api_router.get("/reviews")
async def get_approved_reviews():
    """Get all approved reviews for public display"""
    reviews = await db.reviews.find({"status": "approved"}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"reviews": reviews}

@api_router.get("/admin/reviews")
async def get_all_reviews(
    status: Optional[str] = Query(None, description="Filter by status: pending, approved, rejected"),
    is_admin: bool = Depends(get_current_admin)
):
    """Get all reviews for admin (protected)"""
    query = {}
    if status:
        query["status"] = status
    
    reviews = await db.reviews.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Count by status
    pending_count = await db.reviews.count_documents({"status": "pending"})
    approved_count = await db.reviews.count_documents({"status": "approved"})
    rejected_count = await db.reviews.count_documents({"status": "rejected"})
    
    return {
        "reviews": reviews,
        "stats": {
            "pending": pending_count,
            "approved": approved_count,
            "rejected": rejected_count,
            "total": pending_count + approved_count + rejected_count
        }
    }

@api_router.put("/admin/reviews/{review_id}")
async def update_review_status(review_id: str, update_data: ReviewUpdate, has_write_access: bool = Depends(get_admin_write_access)):
    """Approve or reject a review (admin with write access only)"""
    if update_data.status not in ["approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Statut invalide. Utilisez 'approved' ou 'rejected'")
    
    review = await db.reviews.find_one({"id": review_id})
    if not review:
        raise HTTPException(status_code=404, detail="Avis non trouvé")
    
    await db.reviews.update_one(
        {"id": review_id},
        {"$set": {"status": update_data.status}}
    )
    
    updated = await db.reviews.find_one({"id": review_id}, {"_id": 0})
    return updated

@api_router.delete("/admin/reviews/{review_id}")
async def delete_review(review_id: str, has_write_access: bool = Depends(get_admin_write_access)):
    """Delete a review (admin with write access only)"""
    review = await db.reviews.find_one({"id": review_id})
    if not review:
        raise HTTPException(status_code=404, detail="Avis non trouvé")
    
    await db.reviews.delete_one({"id": review_id})
    return {"message": "Avis supprimé", "review_id": review_id}

# Reseed menu data
@api_router.post("/admin/reseed-menu")
async def reseed_menu(has_write_access: bool = Depends(get_admin_write_access)):
    """Reseed menu with updated items (admin with write access only)"""
    await db.menu_items.delete_many({})
    for item in MENU_ITEMS:
        await db.menu_items.insert_one(item)
    
    await db.games.delete_many({})
    for game in GAMES:
        await db.games.insert_one(game)
    
    return {"message": "Menu et jeux mis à jour", "items_count": len(MENU_ITEMS), "games_count": len(GAMES)}

# ============== LOCATION REQUEST ROUTES ==============

EVENT_TYPE_LABELS = {
    "anniversaire": "Anniversaire",
    "mariage": "Mariage / Fiançailles",
    "seminaire": "Séminaire / Formation",
    "afterwork": "Afterwork",
    "soiree": "Soirée privée",
    "lancement": "Lancement de produit",
    "autre": "Autre"
}

BUDGET_LABELS = {
    "moins_300k": "Moins de 300.000 FCFA",
    "300k_700k": "300.000 – 700.000 FCFA",
    "700k_1500k": "700.000 – 1.500.000 FCFA",
    "plus_1500k": "Plus de 1.500.000 FCFA"
}

@api_router.post("/location-requests")
async def create_location_request(request_data: LocationRequest):
    """Submit a new location/event request"""
    if not request_data.fullName or not request_data.phone:
        raise HTTPException(status_code=400, detail="Nom et téléphone requis")
    
    await db.location_requests.insert_one(request_data.model_dump())
    
    # Send WhatsApp notification
    event_label = EVENT_TYPE_LABELS.get(request_data.eventType, request_data.eventType)
    if request_data.eventType == "autre" and request_data.otherEventType:
        event_label = request_data.otherEventType
    
    budget_label = BUDGET_LABELS.get(request_data.budget, "Non précisé")
    
    notification_message = f"""🎉 *Nouvelle Demande de Location!*

👤 *{request_data.fullName}*
📞 {request_data.phone}
🏢 {request_data.company if request_data.company else "Particulier"}

📅 *Événement:* {event_label}
📆 *Date:* {request_data.eventDate}
⏰ *Horaire:* {request_data.startTime or "?"} - {request_data.endTime or "?"}
👥 *Invités:* {request_data.guestCount or "Non précisé"}

💰 *Budget:* {budget_label}

💬 *Message:*
{request_data.message[:150] if request_data.message else "Aucun message"}

👉 Connectez-vous à l'admin pour voir les détails."""

    await send_whatsapp_notification(notification_message)
    
    return {"message": "Demande envoyée avec succès", "id": request_data.id}

# ============== DELIVERY ORDERS ROUTES ==============

@api_router.post("/delivery-orders")
async def create_delivery_order(order: DeliveryOrder):
    """Create a new delivery order"""
    order_dict = order.model_dump()
    await db.delivery_orders.insert_one(order_dict)
    
    # Format items list for notification
    items_text = "\n".join([f"  - {item['name']} x{item['quantity']}" for item in order.items[:5]])
    if len(order.items) > 5:
        items_text += f"\n  ... et {len(order.items) - 5} autres"
    
    # Determine zone and payment status
    zone_label = "COTONOU" if order.delivery_zone == "cotonou" else "HORS COTONOU"
    payment_label = "PAYE" if order.payment_status == "paid" else "A VALIDER"
    
    # Send SMS notification to admin
    notification_message = f"""COMMANDE LIVRAISON [{zone_label}]

Statut: {payment_label}
Client: {order.customer_name}
Tel: {order.customer_phone}

Articles:
{items_text}

Total: {int(order.total)} FCFA
Livraison: {int(order.delivery_fee)} FCFA

Adresse: {order.delivery_address[:80]}

{'PAIEMENT CONFIRME - A preparer!' if order.payment_status == 'paid' else 'HORS COTONOU - Contacter le client pour confirmer'}"""
    
    await send_whatsapp_notification(notification_message)
    logger.info(f"Delivery order created: {order.id}")
    
    return {"message": "Commande créée avec succès", "id": order.id}

@api_router.get("/admin/delivery-orders")
async def get_delivery_orders(
    status: Optional[str] = Query(None),
    is_admin: bool = Depends(get_current_admin)
):
    """Get all delivery orders (admin only)"""
    query = {}
    if status:
        query["status"] = status
    
    orders = await db.delivery_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(length=200)
    
    # Stats
    total = len(orders)
    pending = sum(1 for o in orders if o.get("status") == "pending")
    
    return {
        "orders": orders,
        "total": total,
        "stats": {
            "pending": pending,
            "total": total
        }
    }

@api_router.put("/admin/delivery-orders/{order_id}")
async def update_delivery_order_status(
    order_id: str, 
    update_data: dict,
    has_write_access: bool = Depends(get_admin_write_access)
):
    """Update delivery order status (admin with write access only)"""
    order = await db.delivery_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Commande non trouvée")
    
    status = update_data.get("status")
    if not status:
        raise HTTPException(status_code=400, detail="Statut requis")
    
    await db.delivery_orders.update_one(
        {"id": order_id},
        {"$set": {"status": status}}
    )
    
    return {"message": "Statut mis à jour", "status": status}

@api_router.get("/admin/location-requests")
async def get_all_location_requests(
    status: Optional[str] = Query(None),
    admin_info: dict = Depends(get_current_admin)
):
    """Get all location requests (admin only)"""
    query = {}
    if status:
        query["status"] = status
    
    requests = await db.location_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    pending_count = await db.location_requests.count_documents({"status": "pending"})
    total_count = await db.location_requests.count_documents({})
    
    return {
        "requests": requests,
        "stats": {
            "pending": pending_count,
            "total": total_count
        }
    }

@api_router.put("/admin/location-requests/{request_id}")
async def update_location_request(request_id: str, status: str, has_write_access: bool = Depends(get_admin_write_access)):
    """Update location request status (admin with write access only)"""
    request = await db.location_requests.find_one({"id": request_id})
    if not request:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    await db.location_requests.update_one(
        {"id": request_id},
        {"$set": {"status": status}}
    )
    
    return {"message": "Statut mis à jour", "status": status}

@api_router.delete("/admin/location-requests/{request_id}")
async def delete_location_request(request_id: str, has_write_access: bool = Depends(get_admin_write_access)):
    """Permanently delete a location request (admin with write access only)"""
    request = await db.location_requests.find_one({"id": request_id})
    if not request:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    result = await db.location_requests.delete_one({"id": request_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=500, detail="Erreur lors de la suppression")
    
    logger.info(f"Location request {request_id} permanently deleted by admin")
    
    return {"message": "Demande supprimée définitivement", "id": request_id}

# ============== LOYALTY PROGRAM ROUTES ==============

POINTS_PER_GAME = 1  # 1 game = 1 point
POINTS_FOR_FREE_GAME = 10  # 10 points = 1 free game

@api_router.get("/loyalty/{phone}")
async def get_loyalty_status(phone: str):
    """Get loyalty account status by phone number"""
    # Clean phone number
    clean_phone = phone.replace(" ", "").replace("+229", "")
    
    account = await db.loyalty_accounts.find_one({"phone": clean_phone}, {"_id": 0})
    
    if not account:
        return {
            "exists": False,
            "phone": clean_phone,
            "total_points": 0,
            "available_points": 0,
            "free_games_available": 0,
            "games_until_free": POINTS_FOR_FREE_GAME,
            "message": "Aucun compte fidélité trouvé. Il sera créé automatiquement lors de votre première réservation payée."
        }
    
    free_games_available = account.get("free_games_earned", 0) - account.get("free_games_used", 0)
    games_until_free = POINTS_FOR_FREE_GAME - (account.get("available_points", 0) % POINTS_FOR_FREE_GAME)
    if games_until_free == POINTS_FOR_FREE_GAME and account.get("available_points", 0) > 0:
        games_until_free = 0
    
    return {
        "exists": True,
        "phone": clean_phone,
        "customer_name": account.get("customer_name", ""),
        "total_points": account.get("total_points", 0),
        "available_points": account.get("available_points", 0),
        "redeemed_points": account.get("redeemed_points", 0),
        "total_games_played": account.get("total_games_played", 0),
        "free_games_earned": account.get("free_games_earned", 0),
        "free_games_used": account.get("free_games_used", 0),
        "free_games_available": free_games_available,
        "games_until_free": games_until_free,
        "points_per_game": POINTS_PER_GAME,
        "points_for_free_game": POINTS_FOR_FREE_GAME
    }

@api_router.post("/loyalty/add-points")
async def add_loyalty_points(booking_id: str):
    """Add loyalty points after successful payment (called automatically)"""
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    
    if booking.get("payment_status") != "paid":
        raise HTTPException(status_code=400, detail="La réservation n'est pas payée")
    
    # Check if points already added for this booking
    if booking.get("loyalty_points_added"):
        return {"message": "Points déjà ajoutés pour cette réservation"}
    
    phone = booking["customer_phone"].replace(" ", "").replace("+229", "")
    customer_name = booking["customer_name"]
    total_games = booking["number_of_players"] * booking["number_of_games"]
    points_earned = total_games * POINTS_PER_GAME
    
    # Find or create loyalty account
    account = await db.loyalty_accounts.find_one({"phone": phone})
    
    if account:
        new_total = account.get("total_points", 0) + points_earned
        new_available = account.get("available_points", 0) + points_earned
        new_games_played = account.get("total_games_played", 0) + total_games
        
        # Calculate free games earned
        old_free_games = account.get("available_points", 0) // POINTS_FOR_FREE_GAME
        new_free_games = new_available // POINTS_FOR_FREE_GAME
        additional_free_games = new_free_games - old_free_games
        
        await db.loyalty_accounts.update_one(
            {"phone": phone},
            {"$set": {
                "customer_name": customer_name,
                "total_points": new_total,
                "available_points": new_available,
                "total_games_played": new_games_played,
                "free_games_earned": account.get("free_games_earned", 0) + additional_free_games,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    else:
        # Create new account
        free_games = points_earned // POINTS_FOR_FREE_GAME
        new_account = LoyaltyAccount(
            phone=phone,
            customer_name=customer_name,
            total_points=points_earned,
            available_points=points_earned,
            total_games_played=total_games,
            free_games_earned=free_games
        )
        await db.loyalty_accounts.insert_one(new_account.model_dump())
    
    # Mark booking as loyalty points added
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"loyalty_points_added": True, "loyalty_points_earned": points_earned}}
    )
    
    # Get updated account
    updated_account = await db.loyalty_accounts.find_one({"phone": phone}, {"_id": 0})
    free_games_available = updated_account.get("free_games_earned", 0) - updated_account.get("free_games_used", 0)
    
    return {
        "message": f"🎉 {points_earned} point(s) fidélité ajouté(s) !",
        "points_earned": points_earned,
        "total_points": updated_account.get("total_points", 0),
        "available_points": updated_account.get("available_points", 0),
        "free_games_available": free_games_available,
        "games_until_free": POINTS_FOR_FREE_GAME - (updated_account.get("available_points", 0) % POINTS_FOR_FREE_GAME)
    }

@api_router.post("/loyalty/redeem")
async def redeem_free_game(redemption: LoyaltyRedemption):
    """Redeem points for a free game"""
    phone = redemption.phone.replace(" ", "").replace("+229", "")
    
    account = await db.loyalty_accounts.find_one({"phone": phone})
    if not account:
        raise HTTPException(status_code=404, detail="Aucun compte fidélité trouvé")
    
    free_games_available = account.get("free_games_earned", 0) - account.get("free_games_used", 0)
    
    if free_games_available < redemption.free_games_to_use:
        raise HTTPException(
            status_code=400, 
            detail=f"Pas assez de parties gratuites. Disponibles: {free_games_available}"
        )
    
    # Update account
    points_to_redeem = redemption.free_games_to_use * POINTS_FOR_FREE_GAME
    await db.loyalty_accounts.update_one(
        {"phone": phone},
        {"$set": {
            "free_games_used": account.get("free_games_used", 0) + redemption.free_games_to_use,
            "redeemed_points": account.get("redeemed_points", 0) + points_to_redeem,
            "available_points": account.get("available_points", 0) - points_to_redeem,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {
        "message": f"🎁 {redemption.free_games_to_use} partie(s) gratuite(s) utilisée(s) !",
        "free_games_redeemed": redemption.free_games_to_use,
        "free_games_remaining": free_games_available - redemption.free_games_to_use
    }

@api_router.get("/admin/loyalty/accounts")
async def get_all_loyalty_accounts(
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    is_admin: bool = Depends(get_current_admin)
):
    """Get all loyalty accounts (admin only)"""
    accounts = await db.loyalty_accounts.find({}, {"_id": 0}).sort("total_points", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.loyalty_accounts.count_documents({})
    
    # Calculate stats
    total_points_issued = sum(a.get("total_points", 0) for a in accounts)
    total_free_games = sum(a.get("free_games_earned", 0) for a in accounts)
    
    return {
        "accounts": accounts,
        "total": total,
        "stats": {
            "total_accounts": total,
            "total_points_issued": total_points_issued,
            "total_free_games_earned": total_free_games
        }
    }

# ============== EXPORT CSV ROUTES ==============

@api_router.get("/admin/export/bookings")
async def export_bookings_csv(is_admin: bool = Depends(get_current_admin)):
    """Export all bookings to CSV"""
    try:
        bookings = await db.bookings.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=5000)
        
        if not bookings:
            raise HTTPException(status_code=404, detail="Aucune réservation à exporter")
        
        output = io.StringIO()
        fieldnames = [
            "ID", "Client", "Téléphone", "Type de Jeu", "Date", "Créneau",
            "Joueurs", "Parties", "Prix Total", "Frais Réservation", 
            "Montant Payé", "Statut Paiement", "Statut Réservation",
            "Reprogrammé", "Créé le"
        ]
        
        writer = csv.DictWriter(output, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()
        
        for booking in bookings:
            game_type = "VR 360°" if booking.get("game_type") == "VR_360" else "Simulateur"
            writer.writerow({
                "ID": booking.get("id", "")[:8],
                "Client": booking.get("customer_name", ""),
                "Téléphone": booking.get("customer_phone", ""),
                "Type de Jeu": game_type,
                "Date": booking.get("date", ""),
                "Créneau": booking.get("time_slot", ""),
                "Joueurs": booking.get("number_of_players", 0),
                "Parties": booking.get("number_of_games", 0),
                "Prix Total": f"{booking.get('total_game_price', 0)} FCFA",
                "Frais Réservation": f"{booking.get('reservation_fee', 0)} FCFA",
                "Montant Payé": f"{booking.get('amount_to_pay', 0)} FCFA",
                "Statut Paiement": "Payé" if booking.get("payment_status") == "paid" else "En attente",
                "Statut Réservation": booking.get("booking_status", "active"),
                "Reprogrammé": "Oui" if booking.get("has_been_rescheduled") else "Non",
                "Créé le": booking.get("created_at", "")[:19].replace("T", " ")
            })
        
        output.seek(0)
        filename = f"reservations_espace_maxo_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
        
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting bookings: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de l'export")


@api_router.get("/admin/export/location-requests")
async def export_location_requests_csv(is_admin: bool = Depends(get_current_admin)):
    """Export all location requests to CSV"""
    try:
        requests = await db.location_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=5000)
        
        if not requests:
            raise HTTPException(status_code=404, detail="Aucune demande à exporter")
        
        output = io.StringIO()
        fieldnames = [
            "ID", "Nom", "Téléphone", "Email", "Entreprise",
            "Type Événement", "Date", "Heure Début", "Heure Fin",
            "Nombre Invités", "Formule", "Budget", "Services",
            "Message", "Statut", "Créé le"
        ]
        
        writer = csv.DictWriter(output, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()
        
        formula_labels = {
            "location_simple": "Location simple",
            "location_restauration": "Location + Restauration",
            "location_boissons": "Location + Boissons",
            "personnalisee": "Formule personnalisée"
        }
        
        status_labels = {
            "pending": "En attente",
            "contacted": "Contacté",
            "confirmed": "Confirmé",
            "rejected": "Rejeté"
        }
        
        for req in requests:
            services = ", ".join(req.get("services", [])) if req.get("services") else ""
            writer.writerow({
                "ID": req.get("id", "")[:8],
                "Nom": req.get("fullName", ""),
                "Téléphone": req.get("phone", ""),
                "Email": req.get("email", ""),
                "Entreprise": req.get("company", ""),
                "Type Événement": req.get("eventType", ""),
                "Date": req.get("eventDate", ""),
                "Heure Début": req.get("startTime", ""),
                "Heure Fin": req.get("endTime", ""),
                "Nombre Invités": req.get("guestCount", ""),
                "Formule": formula_labels.get(req.get("formula", ""), req.get("formula", "")),
                "Budget": req.get("budget", ""),
                "Services": services,
                "Message": req.get("message", "")[:200],
                "Statut": status_labels.get(req.get("status", ""), req.get("status", "")),
                "Créé le": req.get("created_at", "")[:19].replace("T", " ")
            })
        
        output.seek(0)
        filename = f"demandes_location_espace_maxo_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
        
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting location requests: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de l'export")


@api_router.get("/admin/export/loyalty")
async def export_loyalty_csv(is_admin: bool = Depends(get_current_admin)):
    """Export all loyalty accounts to CSV"""
    try:
        accounts = await db.loyalty_accounts.find({}, {"_id": 0}).sort("total_points", -1).to_list(length=5000)
        
        if not accounts:
            raise HTTPException(status_code=404, detail="Aucun compte fidélité à exporter")
        
        output = io.StringIO()
        fieldnames = [
            "Téléphone", "Nom", "Points Total", "Points Disponibles",
            "Parties Jouées", "Parties Gratuites Gagnées", "Parties Gratuites Utilisées",
            "Créé le"
        ]
        
        writer = csv.DictWriter(output, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()
        
        for account in accounts:
            writer.writerow({
                "Téléphone": account.get("phone", ""),
                "Nom": account.get("customer_name", ""),
                "Points Total": account.get("total_points", 0),
                "Points Disponibles": account.get("available_points", 0),
                "Parties Jouées": account.get("total_games_played", 0),
                "Parties Gratuites Gagnées": account.get("free_games_earned", 0),
                "Parties Gratuites Utilisées": account.get("free_games_used", 0),
                "Créé le": account.get("created_at", "")[:19].replace("T", " ")
            })
        
        output.seek(0)
        filename = f"fidelite_espace_maxo_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
        
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting loyalty: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de l'export")

# ============== JOB APPLICATIONS ROUTES ==============

@api_router.post("/job-applications")
async def submit_job_application(application: JobApplicationCreate):
    """Submit a job application"""
    if not application.full_name or not application.phone or not application.email or not application.position:
        raise HTTPException(status_code=400, detail="Tous les champs obligatoires doivent être remplis")
    
    # Create application record
    job_app = JobApplication(
        full_name=application.full_name,
        phone=application.phone,
        email=application.email,
        position=application.position,
        message=application.message,
        cv_filename=application.cv_filename
    )
    
    # If CV data is provided (base64), store it
    if application.cv_data and application.cv_filename:
        # Store the CV data in the database (base64 encoded)
        job_app_dict = job_app.model_dump()
        job_app_dict["cv_data"] = application.cv_data
        await db.job_applications.insert_one(job_app_dict)
    else:
        await db.job_applications.insert_one(job_app.model_dump())
    
    # Send SMS notification to admin
    notification_message = f"""[CANDIDATURE] Nouvelle candidature reçue!

Nom: {application.full_name}
Tel: {application.phone}
Email: {application.email}
Poste: {application.position}
CV: {'Oui' if application.cv_filename else 'Non'}

Connectez-vous au panel admin pour voir les détails."""
    
    await send_admin_sms_notification(notification_message)
    
    return {
        "success": True,
        "message": "Votre candidature a été envoyée avec succès. Nous vous contacterons bientôt."
    }


@api_router.get("/admin/job-applications")
async def get_job_applications(is_admin: bool = Depends(get_current_admin)):
    """Get all job applications (admin only)"""
    applications = await db.job_applications.find({}, {"_id": 0, "cv_data": 0}).sort("created_at", -1).to_list(length=500)
    return applications


@api_router.get("/admin/job-applications/{application_id}")
async def get_job_application_detail(application_id: str, is_admin: bool = Depends(get_current_admin)):
    """Get a specific job application with CV data (admin only)"""
    application = await db.job_applications.find_one({"id": application_id}, {"_id": 0})
    if not application:
        raise HTTPException(status_code=404, detail="Candidature non trouvée")
    return application


@api_router.put("/admin/job-applications/{application_id}/status")
async def update_job_application_status(
    application_id: str, 
    status_update: dict,
    has_write_access: bool = Depends(get_admin_write_access)
):
    """Update job application status (admin with write access only)"""
    valid_statuses = ["pending", "reviewed", "contacted", "hired", "rejected"]
    new_status = status_update.get("status")
    
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Statut invalide. Statuts valides: {', '.join(valid_statuses)}")
    
    result = await db.job_applications.update_one(
        {"id": application_id},
        {"$set": {"status": new_status}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Candidature non trouvée")
    
    return {"success": True, "message": f"Statut mis à jour: {new_status}"}


@api_router.delete("/admin/job-applications/{application_id}")
async def delete_job_application(application_id: str, has_write_access: bool = Depends(get_admin_write_access)):
    """Delete a job application (admin with write access only)"""
    result = await db.job_applications.delete_one({"id": application_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Candidature non trouvée")
    
    return {"success": True, "message": "Candidature supprimée"}


@api_router.get("/admin/export/job-applications")
async def export_job_applications_csv(is_admin: bool = Depends(get_current_admin)):
    """Export all job applications to CSV"""
    try:
        applications = await db.job_applications.find({}, {"_id": 0, "cv_data": 0}).sort("created_at", -1).to_list(length=5000)
        
        if not applications:
            raise HTTPException(status_code=404, detail="Aucune candidature à exporter")
        
        output = io.StringIO()
        fieldnames = [
            "ID", "Nom", "Téléphone", "Email", "Poste Souhaité", 
            "Message", "CV", "Statut", "Date Candidature"
        ]
        
        writer = csv.DictWriter(output, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()
        
        status_labels = {
            "pending": "En attente",
            "reviewed": "Examiné",
            "contacted": "Contacté",
            "hired": "Embauché",
            "rejected": "Rejeté"
        }
        
        for app in applications:
            writer.writerow({
                "ID": app.get("id", "")[:8],
                "Nom": app.get("full_name", ""),
                "Téléphone": app.get("phone", ""),
                "Email": app.get("email", ""),
                "Poste Souhaité": app.get("position", ""),
                "Message": app.get("message", "")[:200],
                "CV": "Oui" if app.get("cv_filename") else "Non",
                "Statut": status_labels.get(app.get("status", ""), app.get("status", "")),
                "Date Candidature": app.get("created_at", "")[:19].replace("T", " ")
            })
        
        output.seek(0)
        filename = f"candidatures_espace_maxo_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
        
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting job applications: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de l'export")



# ============== COMBO ORDERS ROUTES ==============

@api_router.post("/combo-orders")
async def create_combo_order(order_data: ComboOrderCreate):
    """Create a combo order with game session"""
    if not order_data.customer_name or not order_data.customer_phone:
        raise HTTPException(status_code=400, detail="Nom et téléphone requis")
    
    if not order_data.items or len(order_data.items) == 0:
        raise HTTPException(status_code=400, detail="Veuillez sélectionner au moins un combo")
    
    # Check if time slot is available
    existing = await db.bookings.find_one({
        "date": order_data.booking_date,
        "time_slot": order_data.time_slot,
        "booking_status": {"$in": ["active", "confirmed"]}
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Ce créneau horaire est déjà réservé")
    
    # Calculate totals
    combo_total = sum(item.get("price", 0) * item.get("quantity", 1) for item in order_data.items)
    game_price = 1500.0 if order_data.game_type == "RACING_SIMULATOR" else 2000.0
    game_total = game_price * order_data.number_of_games * order_data.number_of_players
    total = combo_total + game_total
    
    # Create combo order
    combo_order = ComboOrder(
        customer_name=order_data.customer_name,
        customer_phone=order_data.customer_phone,
        items=order_data.items,
        combo_total=combo_total,
        game_type=order_data.game_type,
        number_of_players=order_data.number_of_players,
        number_of_games=order_data.number_of_games,
        game_total=game_total,
        booking_date=order_data.booking_date,
        time_slot=order_data.time_slot,
        total=total,
        notes=order_data.notes,
        payment_transaction_id=order_data.payment_transaction_id,
        wallet_amount_used=order_data.wallet_amount_used
    )
    
    await db.combo_orders.insert_one(combo_order.model_dump())
    
    # Also create a booking entry for the game session
    booking = Booking(
        customer_name=order_data.customer_name,
        customer_phone=order_data.customer_phone,
        game_type=order_data.game_type,
        number_of_players=order_data.number_of_players,
        number_of_games=order_data.number_of_games,
        date=order_data.booking_date,
        time_slot=order_data.time_slot,
        total_game_price=game_total,
        reservation_fee=0.0,  # No reservation fee for combo orders
        total_amount=total,
        amount_to_pay=total,
        payment_type="full_payment",
        payment_status="paid",
        booking_status="active",
        payment_session_id=order_data.payment_transaction_id
    )
    await db.bookings.insert_one(booking.model_dump())
    
    # Send SMS notification to admin
    notification_message = f"""[COMBO+JEU] Nouvelle commande!

Client: {order_data.customer_name}
Tel: {order_data.customer_phone}
Date: {order_data.booking_date}
Heure: {order_data.time_slot}
Combos: {combo_total} FCFA
Jeux: {game_total} FCFA
Total: {total} FCFA"""
    
    await send_admin_sms_notification(notification_message)
    
    return {
        "success": True,
        "message": "Commande confirmée! Vos combos vous attendent.",
        "order_id": combo_order.id,
        "total": total
    }

@api_router.get("/admin/combo-orders")
async def get_combo_orders(admin_info: dict = Depends(get_current_admin)):
    """Get all combo orders (admin only)"""
    orders = await db.combo_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"orders": orders}


# ============== TABLE RESERVATIONS ROUTES ==============

@api_router.post("/table-reservations")
async def create_table_reservation(reservation_data: TableReservationCreate):
    """Create a table reservation with deposit"""
    if not reservation_data.customer_name or not reservation_data.customer_phone:
        raise HTTPException(status_code=400, detail="Nom et téléphone requis")
    
    # Validate deposit amount (multiples of 5000, max 25000)
    valid_deposits = [5000, 10000, 15000, 20000, 25000]
    if reservation_data.deposit_amount not in valid_deposits:
        raise HTTPException(status_code=400, detail="Montant d'acompte invalide. Choisissez entre 5000, 10000, 15000, 20000 ou 25000 FCFA")
    
    # Create reservation
    reservation = TableReservation(
        customer_name=reservation_data.customer_name,
        customer_phone=reservation_data.customer_phone,
        reservation_date=reservation_data.reservation_date,
        reservation_time=reservation_data.reservation_time,
        number_of_guests=reservation_data.number_of_guests,
        special_occasion=reservation_data.special_occasion,
        notes=reservation_data.notes,
        deposit_amount=reservation_data.deposit_amount,
        payment_transaction_id=reservation_data.payment_transaction_id,
        wallet_amount_used=reservation_data.wallet_amount_used
    )
    
    await db.table_reservations.insert_one(reservation.model_dump())
    
    # Send SMS notification to admin
    notification_message = f"""[TABLE] Nouvelle réservation!

Client: {reservation_data.customer_name}
Tel: {reservation_data.customer_phone}
Date: {reservation_data.reservation_date}
Heure: {reservation_data.reservation_time}
Personnes: {reservation_data.number_of_guests}
Acompte: {reservation_data.deposit_amount} FCFA
{f"Occasion: {reservation_data.special_occasion}" if reservation_data.special_occasion else ""}"""
    
    await send_admin_sms_notification(notification_message)
    
    return {
        "success": True,
        "message": f"Table réservée! Acompte de {reservation_data.deposit_amount} FCFA sera déduit de votre addition.",
        "reservation_id": reservation.id
    }

@api_router.get("/admin/table-reservations")
async def get_table_reservations(admin_info: dict = Depends(get_current_admin)):
    """Get all table reservations (admin only)"""
    reservations = await db.table_reservations.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    
    pending_count = await db.table_reservations.count_documents({"status": "confirmed"})
    
    return {
        "reservations": reservations,
        "stats": {
            "pending": pending_count,
            "total": len(reservations)
        }
    }

@api_router.put("/admin/table-reservations/{reservation_id}")
async def update_table_reservation(
    reservation_id: str, 
    update_data: dict,
    has_write_access: bool = Depends(get_admin_write_access)
):
    """Update table reservation status (admin with write access only)"""
    reservation = await db.table_reservations.find_one({"id": reservation_id})
    if not reservation:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    
    update_fields = {}
    if "status" in update_data:
        update_fields["status"] = update_data["status"]
    if "deposit_used" in update_data:
        update_fields["deposit_used"] = update_data["deposit_used"]
    
    if update_fields:
        await db.table_reservations.update_one(
            {"id": reservation_id},
            {"$set": update_fields}
        )
    
    return {"success": True, "message": "Réservation mise à jour"}

@api_router.delete("/admin/table-reservations/{reservation_id}")
async def delete_table_reservation(reservation_id: str, has_write_access: bool = Depends(get_admin_write_access)):
    """Delete a table reservation (admin with write access only)"""
    result = await db.table_reservations.delete_one({"id": reservation_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    
    return {"success": True, "message": "Réservation supprimée"}




# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
