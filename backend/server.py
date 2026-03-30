from fastapi import FastAPI, APIRouter, HTTPException, Request, Query, Depends, Header, Body
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
import hashlib
from twilio.rest import Client as TwilioClient

# Import modular routers
from routers.service_reports import router as service_reports_router, set_db as set_service_reports_db
from routers.subscriptions import router as subscriptions_router, set_db as set_subscriptions_db

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Initialize router databases
set_service_reports_db(db)
set_subscriptions_db(db)

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

# Invoice Models (for Caisse/Billing)
class InvoiceItemCreate(BaseModel):
    id: str
    name: str
    price: float
    quantity: int
    department: str  # jeux, bar, jardin
    unit: str = "unité"

class InvoiceCreate(BaseModel):
    customer_name: str = "Client"
    customer_phone: str = ""
    items: List[Dict]
    subtotal: float
    discount: float = 0
    discount_amount: float = 0
    total: float
    payment_method: str = "cash"  # cash, mobile, card
    totals_by_department: Dict = {}
    notes: str = ""
    created_by: str = ""  # Server/cashier name
    validation_status: str = "pending"  # pending, validated

class Invoice(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_number: str = ""
    customer_name: str = "Client"
    customer_phone: str = ""
    items: List[Dict] = []
    subtotal: float = 0.0
    discount: float = 0
    discount_amount: float = 0
    total: float = 0.0
    payment_method: str = "cash"  # cash, card, mobile, check
    payment_status: str = "paid"  # paid, pending, partial
    totals_by_department: Dict = {}
    notes: str = ""
    created_by: str = ""
    validation_status: str = "pending"  # pending, validated
    validated_by: str = ""
    validated_at: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# Caisse User Model
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
    pin: str = ""  # Stored as plain text for simplicity (4-6 digits)
    role: str = "server"
    full_name: str = ""
    is_active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# Caisse Product Model
class CaisseProductCreate(BaseModel):
    name: str
    price: float
    department: str  # jeux, bar, jardin
    unit: str = "unité"
    category: str = ""
    is_available: bool = True

class CaisseProduct(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    price: float
    department: str
    unit: str = "unité"
    category: str = ""
    is_available: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# Caisse Client Model
class CaisseClientCreate(BaseModel):
    name: str
    phone: str = ""
    email: str = ""
    notes: str = ""

class CaisseClient(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: str = ""
    email: str = ""
    notes: str = ""
    total_spent: float = 0.0
    visit_count: int = 0
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




# ============== INVOICE/BILLING ENDPOINTS ==============

@api_router.post("/invoices")
async def create_invoice(invoice_data: InvoiceCreate):
    """Create a new invoice"""
    try:
        # Generate invoice number
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        count = await db.invoices.count_documents({
            "created_at": {"$regex": f"^{datetime.now(timezone.utc).strftime('%Y-%m-%d')}"}
        })
        invoice_number = f"EM-{today}-{count + 1:04d}"
        
        invoice = Invoice(
            invoice_number=invoice_number,
            customer_name=invoice_data.customer_name,
            customer_phone=invoice_data.customer_phone,
            items=invoice_data.items,
            subtotal=invoice_data.subtotal,
            discount=invoice_data.discount,
            discount_amount=invoice_data.discount_amount,
            total=invoice_data.total,
            payment_method=invoice_data.payment_method,
            totals_by_department=invoice_data.totals_by_department,
            notes=invoice_data.notes,
            created_by=invoice_data.created_by,
            validation_status=invoice_data.validation_status
        )
        
        invoice_dict = invoice.model_dump()
        await db.invoices.insert_one(invoice_dict)
        
        return {"success": True, "invoice": {k: v for k, v in invoice_dict.items() if k != "_id"}}
    except Exception as e:
        logger.error(f"Error creating invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/invoices")
async def get_invoices(date: str = Query(None), user_id: str = Query(None), role: str = Query(None), created_by: str = Query(None)):
    """Get invoices, optionally filtered by date and user
    For servers: shows their own pending invoices + ALL validated invoices
    For admin/manager: shows ALL invoices
    """
    try:
        if role == "server" and created_by:
            # For servers: fetch their own pending + ALL validated invoices
            base_query = {}
            if date:
                base_query["created_at"] = {"$regex": f"^{date}"}
            
            # Query 1: Server's own pending invoices
            pending_query = {**base_query, "created_by": created_by, "validation_status": {"$ne": "validated"}}
            pending_invoices = await db.invoices.find(pending_query, {"_id": 0}).sort("created_at", -1).to_list(1000)
            
            # Query 2: ALL validated invoices (from all servers)
            validated_query = {**base_query, "validation_status": "validated"}
            validated_invoices = await db.invoices.find(validated_query, {"_id": 0}).sort("created_at", -1).to_list(1000)
            
            # Combine and deduplicate (validated ones may include server's own)
            all_invoices = validated_invoices + pending_invoices
            return {"invoices": all_invoices}
        else:
            # For admin/manager: return ALL invoices
            query = {}
            if date:
                query["created_at"] = {"$regex": f"^{date}"}
            
            invoices = await db.invoices.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
            return {"invoices": invoices}
    except Exception as e:
        logger.error(f"Error fetching invoices: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/invoices/stats")
async def get_invoice_stats(date: str = Query(None)):
    """Get invoice statistics by date"""
    try:
        query = {}
        if date:
            query["created_at"] = {"$regex": f"^{date}"}
        
        invoices = await db.invoices.find(query, {"_id": 0}).to_list(1000)
        
        total_revenue = sum(inv.get("total", 0) for inv in invoices)
        total_discounts = sum(inv.get("discount_amount", 0) for inv in invoices)
        
        by_department = {"salle_jardin": 0, "jeux": 0, "bar": 0, "location": 0, "autres": 0}
        for inv in invoices:
            dept_totals = inv.get("totals_by_department", {})
            by_department["salle_jardin"] += dept_totals.get("salle_jardin", 0) + dept_totals.get("jardin", 0)
            by_department["jeux"] += dept_totals.get("jeux", 0)
            by_department["bar"] += dept_totals.get("bar", 0)
            by_department["location"] += dept_totals.get("location", 0)
            by_department["autres"] += dept_totals.get("autres", 0)
        
        invoice_count = len(invoices)
        average_ticket = total_revenue / invoice_count if invoice_count > 0 else 0
        
        return {
            "total_revenue": total_revenue,
            "total_discounts": total_discounts,
            "by_department": by_department,
            "invoice_count": invoice_count,
            "average_ticket": average_ticket
        }
    except Exception as e:
        logger.error(f"Error fetching invoice stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: str):
    """Get a single invoice by ID"""
    try:
        invoice = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
        if not invoice:
            raise HTTPException(status_code=404, detail="Facture non trouvée")
        return invoice
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, invoice_data: dict = Body(...)):
    """Update an existing invoice"""
    try:
        invoice_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = await db.invoices.update_one(
            {"id": invoice_id},
            {"$set": invoice_data}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Facture non trouvée")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str):
    """Delete an invoice"""
    try:
        result = await db.invoices.delete_one({"id": invoice_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Facture non trouvée")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/invoices/stats/monthly")
async def get_monthly_stats(year: int = Query(None), month: int = Query(None)):
    """Get monthly statistics"""
    try:
        now = datetime.now(timezone.utc)
        year = year or now.year
        month = month or now.month
        
        date_prefix = f"{year}-{month:02d}"
        invoices = await db.invoices.find(
            {"created_at": {"$regex": f"^{date_prefix}"}},
            {"_id": 0}
        ).to_list(10000)
        
        # Group by day
        daily_stats = {}
        for inv in invoices:
            day = inv.get("created_at", "")[:10]
            if day not in daily_stats:
                daily_stats[day] = {"revenue": 0, "count": 0}
            daily_stats[day]["revenue"] += inv.get("total", 0)
            daily_stats[day]["count"] += 1
        
        total_revenue = sum(inv.get("total", 0) for inv in invoices)
        
        by_department = {"salle_jardin": 0, "jeux": 0, "bar": 0, "location": 0, "autres": 0}
        for inv in invoices:
            dept_totals = inv.get("totals_by_department", {})
            by_department["salle_jardin"] += dept_totals.get("salle_jardin", 0) + dept_totals.get("jardin", 0)
            by_department["jeux"] += dept_totals.get("jeux", 0)
            by_department["bar"] += dept_totals.get("bar", 0)
            by_department["location"] += dept_totals.get("location", 0)
            by_department["autres"] += dept_totals.get("autres", 0)
        
        return {
            "year": year,
            "month": month,
            "total_revenue": total_revenue,
            "invoice_count": len(invoices),
            "by_department": by_department,
            "daily_stats": daily_stats
        }
    except Exception as e:
        logger.error(f"Error fetching monthly stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============== CAISSE USERS ENDPOINTS ==============

@api_router.post("/caisse/users")
async def create_caisse_user(user_data: CaisseUserCreate):
    """Create a new caisse user"""
    try:
        # Check if username already exists
        existing = await db.caisse_users.find_one({"username": user_data.username})
        if existing:
            raise HTTPException(status_code=400, detail="Nom d'utilisateur déjà existant")
        
        # Check if PIN already exists (if provided)
        if user_data.pin:
            existing_pin = await db.caisse_users.find_one({"pin": user_data.pin})
            if existing_pin:
                raise HTTPException(status_code=400, detail="Ce PIN est déjà utilisé")
        
        # Hash password if provided
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
        
        # Don't return password hash
        del user_dict["password_hash"]
        return {"success": True, "user": {k: v for k, v in user_dict.items() if k != "_id"}}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating caisse user: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/caisse/login")
async def caisse_login(credentials: dict = Body(...)):
    """Login for caisse users - supports PIN or password"""
    try:
        pin = credentials.get("pin", "")
        password = credentials.get("password", "")
        
        # Check for master admin password
        if password == "Caisse2026" or password == "Esp@ceM@xo2026":
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
        
        # Check for PIN login (for servers)
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
        
        # Check for password login (legacy)
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
        
        raise HTTPException(status_code=401, detail="PIN ou mot de passe incorrect")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in caisse login: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/caisse/users")
async def get_caisse_users():
    """Get all caisse users"""
    try:
        users = await db.caisse_users.find({}, {"_id": 0, "password_hash": 0}).to_list(100)
        return {"users": users}
    except Exception as e:
        logger.error(f"Error fetching caisse users: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/caisse/users/{user_id}")
async def update_caisse_user(user_id: str, user_data: dict = Body(...)):
    """Update a caisse user"""
    try:
        # Check if PIN already exists for another user
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

@api_router.delete("/caisse/users/{user_id}")
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


# ============== CAISSE PRODUCTS ENDPOINTS ==============

@api_router.post("/caisse/products")
async def create_caisse_product(product_data: CaisseProductCreate, modified_by: str = "", modified_by_role: str = ""):
    """Create a new caisse product"""
    try:
        product = CaisseProduct(**product_data.model_dump())
        product_dict = product.model_dump()
        await db.caisse_products.insert_one(product_dict)
        
        # Create notification for admin
        if modified_by and modified_by_role:
            notification = {
                "id": str(uuid.uuid4()),
                "action": "created",
                "product_name": product_dict.get("name", ""),
                "product_id": product_dict.get("id", ""),
                "department": product_dict.get("department", ""),
                "old_price": None,
                "new_price": product_dict.get("price", 0),
                "modified_by": modified_by,
                "modified_by_role": modified_by_role,
                "is_read": False,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.menu_notifications.insert_one(notification)
        
        return {"success": True, "product": {k: v for k, v in product_dict.items() if k != "_id"}}
    except Exception as e:
        logger.error(f"Error creating caisse product: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/caisse/products")
async def get_caisse_products():
    """Get all caisse products"""
    try:
        products = await db.caisse_products.find({}, {"_id": 0}).to_list(500)
        return {"products": products}
    except Exception as e:
        logger.error(f"Error fetching caisse products: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/caisse/products/{product_id}")
async def update_caisse_product(product_id: str, product_data: dict = Body(...)):
    """Update a caisse product"""
    try:
        # Get old product data for notification
        old_product = await db.caisse_products.find_one({"id": product_id}, {"_id": 0})
        
        result = await db.caisse_products.update_one({"id": product_id}, {"$set": product_data})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Produit non trouvé")
        
        # Create notification for admin if modified_by is provided
        modified_by = product_data.pop("modified_by", None)
        modified_by_role = product_data.pop("modified_by_role", None)
        if modified_by and modified_by_role and old_product:
            notification = {
                "id": str(uuid.uuid4()),
                "action": "updated",
                "product_name": product_data.get("name", old_product.get("name", "")),
                "product_id": product_id,
                "department": product_data.get("department", old_product.get("department", "")),
                "old_price": old_product.get("price"),
                "new_price": product_data.get("price", old_product.get("price")),
                "modified_by": modified_by,
                "modified_by_role": modified_by_role,
                "is_read": False,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.menu_notifications.insert_one(notification)
        
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating caisse product: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/caisse/products/{product_id}")
async def delete_caisse_product(product_id: str, modified_by: str = "", modified_by_role: str = ""):
    """Delete a caisse product"""
    try:
        # Get product data for notification before deleting
        product = await db.caisse_products.find_one({"id": product_id}, {"_id": 0})
        
        result = await db.caisse_products.delete_one({"id": product_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Produit non trouvé")
        
        # Create notification for admin
        if modified_by and modified_by_role and product:
            notification = {
                "id": str(uuid.uuid4()),
                "action": "deleted",
                "product_name": product.get("name", ""),
                "product_id": product_id,
                "department": product.get("department", ""),
                "old_price": product.get("price"),
                "new_price": None,
                "modified_by": modified_by,
                "modified_by_role": modified_by_role,
                "is_read": False,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.menu_notifications.insert_one(notification)
        
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting caisse product: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/caisse/products/init-default")
async def init_default_products(products: List[dict] = Body(...)):
    """Initialize default products in database (one-time migration)"""
    try:
        # Check if products already exist
        existing_count = await db.caisse_products.count_documents({})
        if existing_count > 0:
            # Return existing products count
            return {"success": True, "message": "Products already initialized", "count": existing_count}
        
        # Insert all products
        if products:
            for product in products:
                product["id"] = product.get("id", str(uuid.uuid4()))
            await db.caisse_products.insert_many(products)
        
        return {"success": True, "message": f"Initialized {len(products)} products", "count": len(products)}
    except Exception as e:
        logger.error(f"Error initializing default products: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/caisse/products/sync-defaults")
async def sync_default_products(products: List[dict] = Body(...)):
    """Sync default products - add missing ones without overwriting existing"""
    try:
        added_count = 0
        for product in products:
            # Check if product already exists by id
            existing = await db.caisse_products.find_one({"id": product.get("id")})
            if not existing:
                product["id"] = product.get("id", str(uuid.uuid4()))
                await db.caisse_products.insert_one(product)
                added_count += 1
        
        total = await db.caisse_products.count_documents({})
        return {"success": True, "added": added_count, "total": total}
    except Exception as e:
        logger.error(f"Error syncing default products: {e}")
        raise HTTPException(status_code=500, detail=str(e))
        
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting caisse product: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============== MENU NOTIFICATIONS ENDPOINTS ==============

@api_router.get("/menu-notifications")
async def get_menu_notifications(unread_only: bool = False):
    """Get all menu modification notifications (for Admin)"""
    try:
        query = {"is_read": False} if unread_only else {}
        notifications = await db.menu_notifications.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
        unread_count = await db.menu_notifications.count_documents({"is_read": False})
        return {"notifications": notifications, "unread_count": unread_count}
    except Exception as e:
        logger.error(f"Error fetching menu notifications: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/menu-notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str):
    """Mark a notification as read"""
    try:
        result = await db.menu_notifications.update_one(
            {"id": notification_id},
            {"$set": {"is_read": True}}
        )
        return {"success": True}
    except Exception as e:
        logger.error(f"Error marking notification as read: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/menu-notifications/mark-all-read")
async def mark_all_notifications_read():
    """Mark all notifications as read"""
    try:
        result = await db.menu_notifications.update_many(
            {"is_read": False},
            {"$set": {"is_read": True}}
        )
        return {"success": True, "count": result.modified_count}
    except Exception as e:
        logger.error(f"Error marking all notifications as read: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/menu-notifications/{notification_id}")
async def delete_notification(notification_id: str):
    """Delete a notification"""
    try:
        result = await db.menu_notifications.delete_one({"id": notification_id})
        return {"success": True}
    except Exception as e:
        logger.error(f"Error deleting notification: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============== SERVICE REPORTS ENDPOINTS (Now in routers/service_reports.py) ==============

# ============== CAISSE CLIENTS ENDPOINTS ==============

@api_router.post("/caisse/clients")
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

@api_router.get("/caisse/clients")
async def get_caisse_clients():
    """Get all clients"""
    try:
        clients = await db.caisse_clients.find({}, {"_id": 0}).to_list(1000)
        return {"clients": clients}
    except Exception as e:
        logger.error(f"Error fetching clients: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/caisse/clients/{client_id}")
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

@api_router.delete("/caisse/clients/{client_id}")
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


# ============== CAISSE TABLES (DRAFT INVOICES) ==============

class CaisseTableCreate(BaseModel):
    table_number: int
    server_id: str
    server_name: str
    items: list = []
    client_id: Optional[str] = None
    client_name: Optional[str] = "Client"
    payment_method: str = "cash"
    discount: int = 0
    notes: str = ""

class CaisseTableUpdate(BaseModel):
    items: Optional[list] = None
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    payment_method: Optional[str] = None
    discount: Optional[int] = None
    notes: Optional[str] = None
    status: Optional[str] = None  # "open", "invoiced", "closed"
    invoice_created_at: Optional[str] = None

@api_router.get("/caisse/tables/status")
async def get_tables_status():
    """Get status of all 20 tables (free/occupied/invoiced with timing)"""
    try:
        # Get all tables (occupied or invoiced)
        all_tables = await db.caisse_tables.find({}, {"_id": 0}).to_list(100)
        
        # Create a map of tables by table number
        tables_map = {}
        for table in all_tables:
            tables_map[table["table_number"]] = table
        
        # Generate status for all 20 tables
        tables_status = []
        now = datetime.now(timezone.utc)
        
        for i in range(1, 21):
            if i in tables_map:
                table = tables_map[i]
                table_status = table.get("status", "occupied")  # Default to occupied for backwards compatibility
                
                # Calculate service duration in minutes
                created_at = datetime.fromisoformat(table["created_at"].replace("Z", "+00:00"))
                duration_seconds = (now - created_at).total_seconds()
                duration_minutes = int(duration_seconds / 60)
                
                # Determine status color based on duration and invoice status
                if table_status == "invoiced":
                    status_color = "blue"  # Blue for invoiced tables
                elif duration_minutes < 15:
                    status_color = "green"
                elif duration_minutes < 30:
                    status_color = "orange"
                else:
                    status_color = "red"
                
                # Calculate total amount
                total = sum(item.get("price", 0) * item.get("quantity", 1) for item in table.get("items", []))
                
                tables_status.append({
                    "table_number": i,
                    "status": table_status if table_status == "invoiced" else "occupied",
                    "status_color": status_color,
                    "server_name": table.get("server_name", ""),
                    "server_id": table.get("server_id", ""),
                    "client_name": table.get("client_name", "Client"),
                    "items_count": len(table.get("items", [])),
                    "total": total,
                    "duration_minutes": duration_minutes,
                    "duration_formatted": f"{duration_minutes // 60}h{duration_minutes % 60:02d}" if duration_minutes >= 60 else f"{duration_minutes}min",
                    "created_at": table.get("created_at"),
                    "table_id": table.get("id"),
                    "invoice_created_at": table.get("invoice_created_at")
                })
            else:
                tables_status.append({
                    "table_number": i,
                    "status": "free",
                    "status_color": "gray",
                    "server_name": None,
                    "server_id": None,
                    "client_name": None,
                    "items_count": 0,
                    "total": 0,
                    "duration_minutes": 0,
                    "duration_formatted": "-",
                    "created_at": None,
                    "table_id": None
                })
        
        # Calculate statistics
        occupied_count = len([t for t in tables_status if t["status"] in ("occupied", "invoiced")])
        free_count = 20 - occupied_count
        
        # Average service time for occupied tables
        total_duration = sum(t["duration_minutes"] for t in tables_status if t["status"] in ("occupied", "invoiced"))
        avg_duration = total_duration / occupied_count if occupied_count > 0 else 0
        
        # Count by status color
        green_count = len([t for t in tables_status if t["status_color"] == "green"])
        orange_count = len([t for t in tables_status if t["status_color"] == "orange"])
        red_count = len([t for t in tables_status if t["status_color"] == "red"])
        blue_count = len([t for t in tables_status if t["status_color"] == "blue"])
        
        return {
            "tables": tables_status,
            "stats": {
                "total_tables": 20,
                "occupied": occupied_count,
                "free": free_count,
                "avg_duration_minutes": round(avg_duration, 1),
                "service_quality": {
                    "green": green_count,  # < 15min - Excellent
                    "orange": orange_count,  # 15-30min - À surveiller
                    "red": red_count  # > 30min - Critique
                }
            }
        }
    except Exception as e:
        logger.error(f"Error fetching tables status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/caisse/tables")
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

@api_router.post("/caisse/tables")
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

@api_router.put("/caisse/tables/{table_id}")
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
        if table_data.status is not None:
            update_data["status"] = table_data.status
        if table_data.invoice_created_at is not None:
            update_data["invoice_created_at"] = table_data.invoice_created_at
        
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

@api_router.delete("/caisse/tables/{table_id}")
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

@api_router.post("/caisse/tables/{table_id}/stop-service")
async def stop_table_service(table_id: str):
    """Stop the service timer for a table and record the duration"""
    try:
        table = await db.caisse_tables.find_one({"id": table_id})
        if not table:
            raise HTTPException(status_code=404, detail="Table non trouvée")
        
        # Calculate service duration
        created_at = datetime.fromisoformat(table["created_at"].replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        duration_seconds = (now - created_at).total_seconds()
        duration_minutes = int(duration_seconds / 60)
        
        # Determine quality status
        if duration_minutes < 15:
            quality_status = "excellent"
        elif duration_minutes < 30:
            quality_status = "acceptable"
        else:
            quality_status = "slow"
        
        # Calculate total amount
        total = sum(item.get("price", 0) * item.get("quantity", 1) for item in table.get("items", []))
        
        # Record service stats
        service_record = {
            "id": str(uuid.uuid4()),
            "table_number": table["table_number"],
            "server_id": table["server_id"],
            "server_name": table["server_name"],
            "client_name": table.get("client_name", "Client"),
            "items_count": len(table.get("items", [])),
            "total_amount": total,
            "duration_minutes": duration_minutes,
            "quality_status": quality_status,
            "started_at": table["created_at"],
            "stopped_at": now.isoformat(),
            "date": now.strftime("%Y-%m-%d")
        }
        
        # Save to service_stats collection
        await db.service_stats.insert_one(service_record)
        
        # Delete the table (service completed)
        await db.caisse_tables.delete_one({"id": table_id})
        
        return {
            "success": True, 
            "service_record": {
                "table_number": service_record["table_number"],
                "duration_minutes": duration_minutes,
                "quality_status": quality_status
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error stopping table service: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/service-stats/daily")
async def get_daily_service_stats(date: Optional[str] = None):
    """Get service quality statistics for a specific day"""
    try:
        if date:
            target_date = date
        else:
            target_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        # Get all service records for the day
        records = await db.service_stats.find({"date": target_date}, {"_id": 0}).to_list(500)
        
        if not records:
            return {
                "date": target_date,
                "total_services": 0,
                "avg_duration": 0,
                "quality_breakdown": {"excellent": 0, "acceptable": 0, "slow": 0},
                "quality_percentage": {"excellent": 0, "acceptable": 0, "slow": 0},
                "by_server": {},
                "records": []
            }
        
        # Calculate statistics
        total_services = len(records)
        total_duration = sum(r.get("duration_minutes", 0) for r in records)
        avg_duration = total_duration / total_services if total_services > 0 else 0
        
        # Quality breakdown
        quality_breakdown = {"excellent": 0, "acceptable": 0, "slow": 0}
        for r in records:
            status = r.get("quality_status", "slow")
            quality_breakdown[status] = quality_breakdown.get(status, 0) + 1
        
        # Quality percentages
        quality_percentage = {
            k: round((v / total_services) * 100, 1) if total_services > 0 else 0 
            for k, v in quality_breakdown.items()
        }
        
        # By server
        by_server = {}
        for r in records:
            server = r.get("server_name", "Inconnu")
            if server not in by_server:
                by_server[server] = {"count": 0, "total_duration": 0, "excellent": 0, "acceptable": 0, "slow": 0}
            by_server[server]["count"] += 1
            by_server[server]["total_duration"] += r.get("duration_minutes", 0)
            by_server[server][r.get("quality_status", "slow")] += 1
        
        # Calculate avg duration per server
        for server in by_server:
            by_server[server]["avg_duration"] = round(by_server[server]["total_duration"] / by_server[server]["count"], 1)
        
        return {
            "date": target_date,
            "total_services": total_services,
            "avg_duration": round(avg_duration, 1),
            "quality_breakdown": quality_breakdown,
            "quality_percentage": quality_percentage,
            "by_server": by_server,
            "records": records
        }
    except Exception as e:
        logger.error(f"Error fetching daily service stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/service-stats/weekly")
async def get_weekly_service_stats(week_start: Optional[str] = None):
    """Get service quality statistics for a week"""
    try:
        if week_start:
            start_date = datetime.fromisoformat(week_start.replace('Z', '+00:00'))
        else:
            today = datetime.now(timezone.utc)
            start_date = today - timedelta(days=today.weekday())
        
        start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = start_date + timedelta(days=6)
        
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d")
        
        # Get all service records for the week
        records = await db.service_stats.find({
            "date": {"$gte": start_str, "$lte": end_str}
        }, {"_id": 0}).to_list(1000)
        
        # Initialize daily data
        day_names_fr = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
        daily_stats = {}
        
        for i in range(7):
            day_date = start_date + timedelta(days=i)
            date_str = day_date.strftime("%Y-%m-%d")
            daily_stats[date_str] = {
                "day_name": day_names_fr[i],
                "date": date_str,
                "total_services": 0,
                "avg_duration": 0,
                "excellent": 0,
                "acceptable": 0,
                "slow": 0
            }
        
        # Aggregate by day
        for r in records:
            date = r.get("date")
            if date in daily_stats:
                daily_stats[date]["total_services"] += 1
                daily_stats[date]["avg_duration"] += r.get("duration_minutes", 0)
                daily_stats[date][r.get("quality_status", "slow")] += 1
        
        # Calculate averages
        for date in daily_stats:
            if daily_stats[date]["total_services"] > 0:
                daily_stats[date]["avg_duration"] = round(
                    daily_stats[date]["avg_duration"] / daily_stats[date]["total_services"], 1
                )
        
        # Overall stats
        total_services = len(records)
        total_duration = sum(r.get("duration_minutes", 0) for r in records)
        avg_duration = round(total_duration / total_services, 1) if total_services > 0 else 0
        
        quality_breakdown = {"excellent": 0, "acceptable": 0, "slow": 0}
        for r in records:
            quality_breakdown[r.get("quality_status", "slow")] += 1
        
        return {
            "week_start": start_str,
            "week_end": end_str,
            "total_services": total_services,
            "avg_duration": avg_duration,
            "quality_breakdown": quality_breakdown,
            "daily": daily_stats
        }
    except Exception as e:
        logger.error(f"Error fetching weekly service stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/caisse/tables/available")
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


# ============== CANCELLATION REQUESTS ==============

class CancellationRequest(BaseModel):
    invoice_id: str
    invoice_number: str
    reason: str
    requested_by: str

@api_router.get("/cancellation-requests")
async def get_cancellation_requests():
    """Get all pending cancellation requests"""
    try:
        requests = await db.cancellation_requests.find(
            {"status": "pending"}, 
            {"_id": 0}
        ).sort("created_at", -1).to_list(100)
        return {"requests": requests}
    except Exception as e:
        logger.error(f"Error fetching cancellation requests: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/cancellation-requests")
async def create_cancellation_request(request: CancellationRequest):
    """Create a new cancellation request"""
    try:
        # Check if request already exists for this invoice
        existing = await db.cancellation_requests.find_one({
            "invoice_id": request.invoice_id,
            "status": "pending"
        })
        if existing:
            raise HTTPException(status_code=400, detail="Une demande est déjà en attente pour cette facture")
        
        request_doc = {
            "id": str(uuid.uuid4()),
            "invoice_id": request.invoice_id,
            "invoice_number": request.invoice_number,
            "reason": request.reason,
            "requested_by": request.requested_by,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.cancellation_requests.insert_one(request_doc)
        if "_id" in request_doc:
            del request_doc["_id"]
        return {"success": True, "request": request_doc}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating cancellation request: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/cancellation-requests/{request_id}/approve")
async def approve_cancellation_request(request_id: str, approved_by: str = "Admin"):
    """Approve a cancellation request and cancel the invoice"""
    try:
        request_doc = await db.cancellation_requests.find_one({"id": request_id})
        if not request_doc:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        # Cancel the invoice
        await db.invoices.update_one(
            {"id": request_doc["invoice_id"]},
            {"$set": {
                "validation_status": "cancelled",
                "cancelled_by": approved_by,
                "cancelled_at": datetime.now(timezone.utc).isoformat(),
                "cancellation_reason": request_doc["reason"],
                "cancellation_requested_by": request_doc["requested_by"]
            }}
        )
        
        # Update request status
        await db.cancellation_requests.update_one(
            {"id": request_id},
            {"$set": {
                "status": "approved",
                "approved_by": approved_by,
                "approved_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return {"success": True, "message": "Facture annulée avec succès"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving cancellation request: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/cancellation-requests/{request_id}/reject")
async def reject_cancellation_request(request_id: str, rejected_by: str = "Admin"):
    """Reject a cancellation request"""
    try:
        result = await db.cancellation_requests.update_one(
            {"id": request_id},
            {"$set": {
                "status": "rejected",
                "rejected_by": rejected_by,
                "rejected_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        return {"success": True, "message": "Demande rejetée"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rejecting cancellation request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============== MODIFICATION REQUESTS ==============

class ModificationRequest(BaseModel):
    invoice_id: str
    invoice_number: str
    reason: str
    requested_by: str

@api_router.get("/modification-requests")
async def get_modification_requests():
    """Get all pending modification requests"""
    try:
        requests = await db.modification_requests.find(
            {"status": "pending"}, 
            {"_id": 0}
        ).sort("created_at", -1).to_list(100)
        return {"requests": requests}
    except Exception as e:
        logger.error(f"Error fetching modification requests: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/modification-requests")
async def create_modification_request(request: ModificationRequest):
    """Create a new modification request"""
    try:
        # Check if request already exists for this invoice
        existing = await db.modification_requests.find_one({
            "invoice_id": request.invoice_id,
            "status": "pending"
        })
        if existing:
            raise HTTPException(status_code=400, detail="Une demande est déjà en attente pour cette facture")
        
        request_doc = {
            "id": str(uuid.uuid4()),
            "invoice_id": request.invoice_id,
            "invoice_number": request.invoice_number,
            "reason": request.reason,
            "requested_by": request.requested_by,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.modification_requests.insert_one(request_doc)
        if "_id" in request_doc:
            del request_doc["_id"]
        return {"success": True, "request": request_doc}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating modification request: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/modification-requests/{request_id}/approve")
async def approve_modification_request(request_id: str, approved_by: str = "Manager"):
    """Approve a modification request - marks invoice as editable"""
    try:
        request_doc = await db.modification_requests.find_one({"id": request_id})
        if not request_doc:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        # Mark the invoice as editable (add modification_allowed flag)
        await db.invoices.update_one(
            {"id": request_doc["invoice_id"]},
            {"$set": {
                "modification_allowed": True,
                "modification_allowed_by": approved_by,
                "modification_allowed_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        # Update request status
        await db.modification_requests.update_one(
            {"id": request_id},
            {"$set": {
                "status": "approved",
                "approved_by": approved_by,
                "approved_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return {"success": True, "message": "Modification autorisée"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving modification request: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/modification-requests/{request_id}/reject")
async def reject_modification_request(request_id: str, rejected_by: str = "Manager"):
    """Reject a modification request"""
    try:
        result = await db.modification_requests.update_one(
            {"id": request_id},
            {"$set": {
                "status": "rejected",
                "rejected_by": rejected_by,
                "rejected_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        return {"success": True, "message": "Demande rejetée"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rejecting modification request: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/invoices/{invoice_id}/update-items")
async def update_invoice_items(invoice_id: str, data: dict = Body(...)):
    """Update invoice items (only if modification_allowed)"""
    try:
        items = data.get("items", [])
        
        invoice = await db.invoices.find_one({"id": invoice_id})
        if not invoice:
            raise HTTPException(status_code=404, detail="Facture non trouvée")
        
        if not invoice.get("modification_allowed"):
            raise HTTPException(status_code=403, detail="Modification non autorisée")
        
        # Calculate new totals
        subtotal = sum(item.get("price", 0) * item.get("quantity", 1) for item in items)
        discount = invoice.get("discount", 0)
        discount_amount = subtotal * discount / 100
        new_total = subtotal - discount_amount
        
        # Calculate totals by department
        totals_by_department = {}
        for item in items:
            dept = item.get("department", "autres")
            totals_by_department[dept] = totals_by_department.get(dept, 0) + (item.get("price", 0) * item.get("quantity", 1))
        
        await db.invoices.update_one(
            {"id": invoice_id},
            {"$set": {
                "items": items,
                "subtotal": subtotal,
                "discount_amount": discount_amount,
                "total": new_total,
                "totals_by_department": totals_by_department,
                "modification_allowed": False,
                "modified_at": datetime.now(timezone.utc).isoformat(),
                "validation_status": "pending"  # Ensure it stays pending for manager
            }}
        )
        
        return {"success": True, "message": "Facture modifiée"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating invoice items: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============== PDF EXPORT ==============
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

@api_router.get("/invoices/{invoice_id}/pdf")
async def generate_invoice_pdf(invoice_id: str):
    """Generate PDF for an invoice"""
    try:
        invoice = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
        if not invoice:
            raise HTTPException(status_code=404, detail="Facture non trouvée")
        
        # Create PDF in memory
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=20*mm, leftMargin=20*mm, topMargin=20*mm, bottomMargin=20*mm)
        
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=18, alignment=1, spaceAfter=10)
        subtitle_style = ParagraphStyle('Subtitle', parent=styles['Normal'], fontSize=10, alignment=1, spaceAfter=20)
        
        elements = []
        
        # Header
        elements.append(Paragraph("ESPACE MAXO", title_style))
        elements.append(Paragraph("Restaurant & Centre de Jeux VR", subtitle_style))
        elements.append(Paragraph(f"Facture N° {invoice.get('invoice_number', invoice['id'][:8].upper())}", 
                                  ParagraphStyle('InvoiceNum', parent=styles['Heading2'], alignment=1)))
        elements.append(Spacer(1, 10*mm))
        
        # Date and client info
        date_str = invoice.get('created_at', '')[:10] if invoice.get('created_at') else ''
        info_data = [
            [f"Date: {date_str}", f"Client: {invoice.get('customer_name', 'Client')}"],
            [f"Mode de paiement: {invoice.get('payment_method', 'cash').upper()}", f"Tél: {invoice.get('customer_phone', '-')}"]
        ]
        info_table = Table(info_data, colWidths=[90*mm, 80*mm])
        info_table.setStyle(TableStyle([
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]))
        elements.append(info_table)
        elements.append(Spacer(1, 10*mm))
        
        # Items table
        items_data = [['Article', 'Qté', 'Prix Unit.', 'Total']]
        for item in invoice.get('items', []):
            items_data.append([
                item.get('name', ''),
                str(item.get('quantity', 1)),
                f"{int(item.get('price', 0)):,} FCFA".replace(',', ' '),
                f"{int(item.get('price', 0) * item.get('quantity', 1)):,} FCFA".replace(',', ' ')
            ])
        
        items_table = Table(items_data, colWidths=[80*mm, 20*mm, 35*mm, 35*mm])
        items_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a5f')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
            ('FONTSIZE', (0, 0), (-1, 0), 11),
            ('FONTSIZE', (0, 1), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('TOPPADDING', (0, 0), (-1, 0), 10),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
        ]))
        elements.append(items_table)
        elements.append(Spacer(1, 5*mm))
        
        # Totals
        subtotal = invoice.get('subtotal', 0)
        discount_amount = invoice.get('discount_amount', 0)
        total = invoice.get('total', 0)
        
        totals_data = [
            ['', '', 'Sous-total:', f"{int(subtotal):,} FCFA".replace(',', ' ')],
        ]
        if discount_amount > 0:
            totals_data.append(['', '', f"Remise ({invoice.get('discount', 0)}%):", f"-{int(discount_amount):,} FCFA".replace(',', ' ')])
        totals_data.append(['', '', 'TOTAL:', f"{int(total):,} FCFA".replace(',', ' ')])
        
        totals_table = Table(totals_data, colWidths=[80*mm, 20*mm, 35*mm, 35*mm])
        totals_table.setStyle(TableStyle([
            ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
            ('FONTSIZE', (0, 0), (-1, -2), 10),
            ('FONTSIZE', (0, -1), (-1, -1), 12),
            ('FONTNAME', (2, -1), (-1, -1), 'Helvetica-Bold'),
            ('LINEABOVE', (2, -1), (-1, -1), 1, colors.black),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]))
        elements.append(totals_table)
        elements.append(Spacer(1, 15*mm))
        
        # Footer
        footer_style = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=9, alignment=1, textColor=colors.grey)
        elements.append(Paragraph("Merci de votre visite chez Espace Maxo!", footer_style))
        elements.append(Paragraph("Adresse: À côté de la Pharmacie Fidjrossè Plage, Cotonou", footer_style))
        elements.append(Paragraph("Tél: 01 41 47 00 00 / 01 62 39 62 39", footer_style))
        
        doc.build(elements)
        buffer.seek(0)
        
        filename = f"facture_{invoice.get('invoice_number', invoice['id'][:8])}.pdf"
        
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============== DAILY REPORT PDF ==============
@api_router.get("/rapport/pdf")
async def generate_rapport_pdf(date: str = Query(...), signature: str = Query("")):
    """Generate daily report PDF"""
    try:
        # Get all invoices for the date
        invoices = await db.invoices.find(
            {"created_at": {"$regex": f"^{date}"}},
            {"_id": 0}
        ).to_list(1000)
        
        validated_invoices = [i for i in invoices if i.get('validation_status') == 'validated']
        pending_invoices = [i for i in invoices if i.get('validation_status') == 'pending']
        
        # Calculate stats
        total_revenue = sum(i.get('total', 0) for i in invoices)
        validated_revenue = sum(i.get('total', 0) for i in validated_invoices)
        
        # Group by server
        by_server = {}
        for inv in invoices:
            server = inv.get('created_by') or 'Non assigné'
            if server not in by_server:
                by_server[server] = {'count': 0, 'total': 0, 'validated': 0, 'pending': 0}
            by_server[server]['count'] += 1
            by_server[server]['total'] += inv.get('total', 0)
            if inv.get('validation_status') == 'validated':
                by_server[server]['validated'] += 1
            else:
                by_server[server]['pending'] += 1
        
        # Group by department
        by_dept = {"salle_jardin": 0, "jeux": 0, "bar": 0, "location": 0, "autres": 0}
        for inv in validated_invoices:
            dept_totals = inv.get('totals_by_department', {})
            by_dept["salle_jardin"] += dept_totals.get("salle_jardin", 0) + dept_totals.get("jardin", 0)
            by_dept["jeux"] += dept_totals.get("jeux", 0)
            by_dept["bar"] += dept_totals.get("bar", 0)
            by_dept["location"] += dept_totals.get("location", 0)
            by_dept["autres"] += dept_totals.get("autres", 0)
        
        # Group by payment method
        by_payment = {}
        for inv in validated_invoices:
            method = inv.get('payment_method', 'cash')
            if method not in by_payment:
                by_payment[method] = {'count': 0, 'total': 0}
            by_payment[method]['count'] += 1
            by_payment[method]['total'] += inv.get('total', 0)
        
        # Create PDF
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=15*mm, leftMargin=15*mm, topMargin=15*mm, bottomMargin=15*mm)
        
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=20, alignment=1, spaceAfter=5, textColor=colors.HexColor('#d4a500'))
        subtitle_style = ParagraphStyle('Subtitle', parent=styles['Heading2'], fontSize=14, alignment=1, spaceAfter=15)
        section_style = ParagraphStyle('Section', parent=styles['Heading3'], fontSize=12, spaceAfter=8, spaceBefore=15, textColor=colors.HexColor('#333333'))
        
        elements = []
        
        # Header
        elements.append(Paragraph("ESPACE MAXO", title_style))
        elements.append(Paragraph("RAPPORT JOURNALIER DE CAISSE", subtitle_style))
        elements.append(Paragraph(f"Date: {date}", ParagraphStyle('Date', parent=styles['Normal'], fontSize=11, alignment=1)))
        elements.append(Paragraph(f"Généré le: {datetime.now(timezone.utc).strftime('%d/%m/%Y à %H:%M')}", ParagraphStyle('Generated', parent=styles['Normal'], fontSize=10, alignment=1, textColor=colors.grey)))
        elements.append(Spacer(1, 10*mm))
        
        # Summary table
        summary_data = [
            ['Factures Total', 'Validées', 'En attente', 'CA Validé'],
            [str(len(invoices)), str(len(validated_invoices)), str(len(pending_invoices)), f"{int(validated_revenue):,} F".replace(',', ' ')]
        ]
        summary_table = Table(summary_data, colWidths=[45*mm, 45*mm, 45*mm, 45*mm])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f0f0f0')),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('FONTSIZE', (0, 1), (-1, 1), 14),
            ('FONTNAME', (0, 1), (-1, 1), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        elements.append(summary_table)
        elements.append(Spacer(1, 8*mm))
        
        # By Server
        elements.append(Paragraph("Récapitulatif par Serveur", section_style))
        server_data = [['Serveur', 'Factures', 'Validées', 'En attente', 'Total']]
        for server, data in by_server.items():
            server_data.append([server, str(data['count']), str(data['validated']), str(data['pending']), f"{int(data['total']):,} F".replace(',', ' ')])
        server_table = Table(server_data, colWidths=[50*mm, 30*mm, 30*mm, 30*mm, 40*mm])
        server_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a5f')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
            ('ALIGN', (-1, 1), (-1, -1), 'RIGHT'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
        ]))
        elements.append(server_table)
        elements.append(Spacer(1, 6*mm))
        
        # By Department
        dept_labels = {"salle_jardin": "Salle & Jardin", "jeux": "Jeux", "bar": "Bar", "location": "Location", "autres": "Autres"}
        elements.append(Paragraph("Par Département", section_style))
        dept_data = [['Département', 'Montant']]
        for dept, amount in by_dept.items():
            if amount > 0:
                dept_data.append([dept_labels.get(dept, dept), f"{int(amount):,} F".replace(',', ' ')])
        dept_table = Table(dept_data, colWidths=[100*mm, 80*mm])
        dept_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f0f0f0')),
            ('ALIGN', (-1, 0), (-1, -1), 'RIGHT'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ]))
        elements.append(dept_table)
        elements.append(Spacer(1, 6*mm))
        
        # By Payment
        payment_labels = {"cash": "Espèces", "card": "Carte", "mobile": "Mobile Money", "wallet": "Porte-monnaie", "check": "Chèque"}
        elements.append(Paragraph("Par Mode de Paiement", section_style))
        payment_data = [['Mode', 'Nb', 'Montant']]
        for method, data in by_payment.items():
            payment_data.append([payment_labels.get(method, method), str(data['count']), f"{int(data['total']):,} F".replace(',', ' ')])
        payment_table = Table(payment_data, colWidths=[80*mm, 40*mm, 60*mm])
        payment_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f0f0f0')),
            ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
            ('ALIGN', (-1, 1), (-1, -1), 'RIGHT'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ]))
        elements.append(payment_table)
        elements.append(Spacer(1, 15*mm))
        
        # Signatures section
        elements.append(Paragraph("Validation et Signatures", section_style))
        elements.append(Spacer(1, 5*mm))
        
        sig_data = [
            ['La Gérante:', '', "L'Administrateur:", ''],
            ['', '', '', ''],
            [signature if signature else '____________________', '', '____________________', ''],
            ['Mères AHOUANDJINOU', '', 'Marcel HOUNHANOU', '']
        ]
        sig_table = Table(sig_data, colWidths=[60*mm, 30*mm, 60*mm, 30*mm])
        sig_table.setStyle(TableStyle([
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('FONTNAME', (0, 2), (0, 2), 'Times-Italic'),
            ('FONTSIZE', (0, 2), (0, 2), 14),
            ('FONTNAME', (0, 3), (0, 3), 'Helvetica-Bold'),
            ('FONTNAME', (2, 3), (2, 3), 'Helvetica-Bold'),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 1), (-1, 1), 20),
        ]))
        elements.append(sig_table)
        
        # Footer
        elements.append(Spacer(1, 10*mm))
        footer_style = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8, alignment=1, textColor=colors.grey)
        elements.append(Paragraph("Document généré automatiquement par CAISSE PRO - Espace Maxo", footer_style))
        elements.append(Paragraph("Fidjrossè Plage, Cotonou | Tél: 01 41 47 00 00", footer_style))
        
        doc.build(elements)
        buffer.seek(0)
        
        filename = f"rapport_journalier_{date}.pdf"
        
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        logger.error(f"Error generating rapport PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Include the router in the main app

# ============== EXPENSE/PURCHASE MODELS ==============

class ExpenseItem(BaseModel):
    category: str
    description: str
    quantity: int = 1
    unit_price: float
    amount: float

class ExpenseCreate(BaseModel):
    category: str  # cuisine, bar, jeux, autres
    description: str
    quantity: Optional[int] = 1
    unit_price: Optional[float] = None
    amount: float
    supplier: Optional[str] = None
    planned_date: Optional[str] = None
    receipt_image: Optional[str] = None  # Base64 or URL
    requested_by: str
    is_group: Optional[bool] = False
    group_id: Optional[str] = None
    items: Optional[List[ExpenseItem]] = None

class ExpenseUpdate(BaseModel):
    category: Optional[str] = None
    description: Optional[str] = None
    quantity: Optional[int] = None
    unit_price: Optional[float] = None
    amount: Optional[float] = None
    supplier: Optional[str] = None
    planned_date: Optional[str] = None
    receipt_image: Optional[str] = None
    admin_notes: Optional[str] = None
    status: Optional[str] = None  # pending, approved, rejected, revision_requested, completed
    is_group: Optional[bool] = None
    items: Optional[List[ExpenseItem]] = None

# ============== LOCATION MODELS (Salle, Jardin, Jeux) ==============

class LocationReservationCreate(BaseModel):
    space_type: str  # salle_fete, espace_jardin, salle_jeux
    customer_name: str
    customer_phone: str
    reservation_date: str
    start_time: str
    end_time: str
    number_of_guests: int
    event_type: str = ""  # anniversaire, reunion, mariage, bapteme, etc.
    rental_amount: float
    deposit_amount: float = 0
    notes: str = ""

class LocationReservationUpdate(BaseModel):
    space_type: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    reservation_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    number_of_guests: Optional[int] = None
    event_type: Optional[str] = None
    rental_amount: Optional[float] = None
    deposit_amount: Optional[float] = None
    deposit_paid: Optional[float] = None
    balance_remaining: Optional[float] = None
    status: Optional[str] = None  # confirmed, completed, cancelled
    notes: Optional[str] = None

# ============== PROFORMA INVOICE MODELS ==============

class ProformaInvoiceItem(BaseModel):
    name: str
    quantity: int = 1
    unit_price: float
    subtotal: float
    department: str = "autres"

class ProformaInvoiceCreate(BaseModel):
    client_name: str
    client_phone: Optional[str] = ""
    client_email: Optional[str] = ""
    client_address: Optional[str] = ""
    items: List[ProformaInvoiceItem]
    subtotal: float
    discount: float = 0
    tax: float = 0
    total: float
    notes: Optional[str] = ""
    validity_days: int = 30  # Validity period in days
    created_by: str = ""
    apply_tva: bool = True  # Option to apply/not apply TVA

class ProformaInvoiceUpdate(BaseModel):
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    client_email: Optional[str] = None
    client_address: Optional[str] = None
    items: Optional[List[dict]] = None
    subtotal: Optional[float] = None
    discount: Optional[float] = None
    tax: Optional[float] = None
    total: Optional[float] = None
    notes: Optional[str] = None
    validity_days: Optional[int] = None
    status: Optional[str] = None  # draft, sent, accepted, rejected, converted
    apply_tva: Optional[bool] = None  # Option to apply/not apply TVA

# ============== INSTRUCTIONS & NOTES MODELS ==============

class InstructionCreate(BaseModel):
    title: str
    content: str
    instruction_type: str = "note"  # note, task_list
    tasks: Optional[List[Dict]] = None  # For task lists: [{"text": "...", "completed": false}]
    sender_role: str  # admin, manager
    sender_name: str
    priority: str = "normal"  # low, normal, high, urgent

class InstructionUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    instruction_type: Optional[str] = None
    tasks: Optional[List[Dict]] = None
    is_read: Optional[bool] = None
    is_archived: Optional[bool] = None
    priority: Optional[str] = None

# ============== MENU NOTIFICATIONS MODELS ==============

class MenuNotification(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    action: str  # created, updated, deleted
    product_name: str
    product_id: str
    department: str
    old_price: Optional[float] = None
    new_price: Optional[float] = None
    modified_by: str  # User name
    modified_by_role: str  # manager or admin
    is_read: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# ============== SERVER END OF SERVICE REPORT MODEL ==============

class ServerEndOfServiceReport(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    server_name: str
    server_id: Optional[str] = None
    date: str  # YYYY-MM-DD
    total_invoices: int
    validated_invoices: int
    pending_invoices: int
    total_sales: float
    observation: Optional[str] = None
    is_read: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    # New fields for validation workflow
    status: str = "pending"  # pending, validated, revision_requested, rejected
    validation_comment: Optional[str] = None
    validated_by: Optional[str] = None
    validated_at: Optional[str] = None
    # Comparison with actual data
    actual_invoices: Optional[int] = None
    actual_validated: Optional[int] = None
    actual_sales: Optional[float] = None
    discrepancy_invoices: Optional[int] = None
    discrepancy_sales: Optional[float] = None

# ============== EXPENSE ENDPOINTS ==============

@api_router.get("/expenses")
async def get_expenses(
    status: Optional[str] = None,
    category: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """Get all expenses with optional filters"""
    try:
        query = {}
        if status:
            query["status"] = status
        if category:
            query["category"] = category
        if start_date:
            query["created_at"] = {"$gte": start_date}
        if end_date:
            if "created_at" in query:
                query["created_at"]["$lte"] = end_date + "T23:59:59"
            else:
                query["created_at"] = {"$lte": end_date + "T23:59:59"}
        
        expenses = await db.expenses.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
        return {"expenses": expenses}
    except Exception as e:
        logger.error(f"Error fetching expenses: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/expenses")
async def create_expense(expense: ExpenseCreate):
    """Create a new expense request (by manager)"""
    try:
        expense_doc = {
            "id": str(uuid.uuid4()),
            "category": expense.category,
            "description": expense.description,
            "quantity": expense.quantity or 1,
            "unit_price": expense.unit_price or expense.amount,
            "amount": expense.amount,
            "supplier": expense.supplier,
            "planned_date": expense.planned_date,
            "receipt_image": expense.receipt_image,
            "requested_by": expense.requested_by,
            "is_group": expense.is_group or False,
            "group_id": expense.group_id,
            "items": [item.dict() for item in expense.items] if expense.items else None,
            "status": "pending",  # pending, approved, rejected, revision_requested, completed
            "admin_notes": None,
            "approved_by": None,
            "approved_at": None,
            "completed_at": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.expenses.insert_one(expense_doc)
        if "_id" in expense_doc:
            del expense_doc["_id"]
        return {"success": True, "expense": expense_doc}
    except Exception as e:
        logger.error(f"Error creating expense: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/expenses/{expense_id}")
async def update_expense(expense_id: str, update: ExpenseUpdate):
    """Update an expense (admin can modify and request revision)"""
    try:
        expense = await db.expenses.find_one({"id": expense_id})
        if not expense:
            raise HTTPException(status_code=404, detail="Expense not found")
        
        update_data = {}
        for k, v in update.dict().items():
            if v is not None:
                if k == "items" and v:
                    update_data[k] = [item if isinstance(item, dict) else item.dict() for item in v]
                else:
                    update_data[k] = v
        
        if update.status == "approved":
            update_data["approved_at"] = datetime.now(timezone.utc).isoformat()
        elif update.status == "completed":
            update_data["completed_at"] = datetime.now(timezone.utc).isoformat()
        
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.expenses.update_one(
            {"id": expense_id},
            {"$set": update_data}
        )
        
        updated = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
        return {"success": True, "expense": updated}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating expense: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str):
    """Delete an expense"""
    try:
        result = await db.expenses.delete_one({"id": expense_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Expense not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting expense: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============== WEEKLY SUMMARY ENDPOINT ==============

@api_router.get("/reports/weekly")
async def get_weekly_report(week_start: Optional[str] = None):
    """Get weekly summary: sales, expenses, and result - DAY BY DAY"""
    try:
        # Calculate week start (Monday) if not provided
        if week_start:
            start_date = datetime.fromisoformat(week_start.replace('Z', '+00:00'))
        else:
            today = datetime.now(timezone.utc)
            start_date = today - timedelta(days=today.weekday())  # Monday
        
        start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = start_date + timedelta(days=6, hours=23, minutes=59, seconds=59)
        
        # Use date strings without timezone for comparison (format: YYYY-MM-DD)
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d") + "T23:59:59"
        
        # Get validated invoices (sales) for the week
        invoices = await db.invoices.find({
            "validation_status": "validated",
            "created_at": {"$gte": start_str, "$lte": end_str + "Z"}
        }, {"_id": 0}).to_list(1000)
        
        # Get ALL expenses for the week (completed for actual, approved for pending)
        all_expenses = await db.expenses.find({
            "$or": [
                {"status": "completed", "completed_at": {"$gte": start_str, "$lte": end_str}},
                {"status": "approved", "approved_at": {"$gte": start_str, "$lte": end_str}},
                {"status": "pending", "created_at": {"$gte": start_str, "$lte": end_str}},
                {"status": "revision_requested", "created_at": {"$gte": start_str, "$lte": end_str}}
            ]
        }, {"_id": 0}).to_list(500)
        
        # Initialize daily data for each day of the week
        daily_data = {}
        day_names_fr = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
        
        for i in range(7):
            day_date = start_date + timedelta(days=i)
            date_str = day_date.strftime("%Y-%m-%d")
            daily_data[date_str] = {
                "day_name": day_names_fr[i],
                "date": date_str,
                "date_formatted": day_date.strftime("%d/%m/%Y"),
                "sales": {"count": 0, "total": 0, "items": []},
                "expenses": {"count": 0, "total": 0, "items": []},
                "result": 0
            }
        
        # Aggregate sales by day
        total_sales = 0
        for invoice in invoices:
            date = invoice.get("created_at", "")[:10]
            if date in daily_data:
                daily_data[date]["sales"]["count"] += 1
                daily_data[date]["sales"]["total"] += invoice.get("total", 0)
                daily_data[date]["sales"]["items"].append({
                    "invoice_id": invoice.get("invoice_id"),
                    "total": invoice.get("total", 0),
                    "items_count": len(invoice.get("items", []))
                })
            total_sales += invoice.get("total", 0)
        
        # Aggregate expenses by day
        total_expenses = 0
        expenses_by_category = {}
        expenses_by_status = {"completed": 0, "approved": 0, "pending": 0, "revision_requested": 0}
        
        for expense in all_expenses:
            # Use completed_at, approved_at, or created_at depending on status
            if expense.get("status") == "completed":
                date = (expense.get("completed_at") or expense.get("created_at", ""))[:10]
            elif expense.get("status") == "approved":
                date = (expense.get("approved_at") or expense.get("created_at", ""))[:10]
            else:
                date = expense.get("created_at", "")[:10]
            
            # Only count completed expenses in totals
            if expense.get("status") == "completed":
                total_expenses += expense.get("amount", 0)
                cat = expense.get("category", "autres")
                expenses_by_category[cat] = expenses_by_category.get(cat, 0) + expense.get("amount", 0)
            
            # Track by status
            status = expense.get("status", "pending")
            expenses_by_status[status] = expenses_by_status.get(status, 0) + expense.get("amount", 0)
            
            if date in daily_data:
                daily_data[date]["expenses"]["count"] += 1
                daily_data[date]["expenses"]["total"] += expense.get("amount", 0) if expense.get("status") == "completed" else 0
                daily_data[date]["expenses"]["items"].append({
                    "id": expense.get("id"),
                    "description": expense.get("description"),
                    "amount": expense.get("amount", 0),
                    "category": expense.get("category"),
                    "status": expense.get("status"),
                    "is_group": expense.get("is_group", False),
                    "items": expense.get("items")
                })
        
        # Calculate daily results
        for date in daily_data:
            daily_data[date]["result"] = daily_data[date]["sales"]["total"] - daily_data[date]["expenses"]["total"]
        
        # Calculate result
        result = total_sales - total_expenses
        
        # Get service quality stats for the week
        service_records = await db.service_stats.find({
            "date": {"$gte": start_str, "$lte": end_str[:10]}
        }, {"_id": 0}).to_list(1000)
        
        # Calculate service quality stats
        service_stats = {
            "total_services": len(service_records),
            "avg_duration": 0,
            "quality_breakdown": {"excellent": 0, "acceptable": 0, "slow": 0},
            "by_day": {}
        }
        
        if service_records:
            total_duration = sum(r.get("duration_minutes", 0) for r in service_records)
            service_stats["avg_duration"] = round(total_duration / len(service_records), 1)
            
            for r in service_records:
                service_stats["quality_breakdown"][r.get("quality_status", "slow")] += 1
                
                # By day
                date = r.get("date")
                if date not in service_stats["by_day"]:
                    service_stats["by_day"][date] = {"count": 0, "avg_duration": 0, "excellent": 0, "acceptable": 0, "slow": 0}
                service_stats["by_day"][date]["count"] += 1
                service_stats["by_day"][date]["avg_duration"] += r.get("duration_minutes", 0)
                service_stats["by_day"][date][r.get("quality_status", "slow")] += 1
            
            # Calculate daily averages
            for date in service_stats["by_day"]:
                if service_stats["by_day"][date]["count"] > 0:
                    service_stats["by_day"][date]["avg_duration"] = round(
                        service_stats["by_day"][date]["avg_duration"] / service_stats["by_day"][date]["count"], 1
                    )
        
        # Add service stats to daily data
        for date in daily_data:
            if date in service_stats["by_day"]:
                daily_data[date]["service"] = service_stats["by_day"][date]
            else:
                daily_data[date]["service"] = {"count": 0, "avg_duration": 0, "excellent": 0, "acceptable": 0, "slow": 0}
        
        return {
            "week_start": start_str,
            "week_end": end_str[:10],
            "week_label": f"Semaine du {start_date.strftime('%d/%m')} au {end_date.strftime('%d/%m/%Y')}",
            "sales": {
                "total": total_sales,
                "count": len(invoices),
            },
            "expenses": {
                "total": total_expenses,
                "count": len([e for e in all_expenses if e.get("status") == "completed"]),
                "by_category": expenses_by_category,
                "by_status": expenses_by_status,
                "all_count": len(all_expenses)
            },
            "daily": daily_data,
            "service_quality": service_stats,
            "result": result,
            "is_profitable": result >= 0
        }
    except Exception as e:
        logger.error(f"Error generating weekly report: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============== ACTIVITY TRACKING (ADMIN) ==============

@api_router.get("/reports/activity")
async def get_activity_report(
    period: str = "day",  # day, week, month
    date: Optional[str] = None
):
    """Get detailed activity report: income, expenses, and result"""
    try:
        # Calculate date range based on period
        if date:
            base_date = datetime.fromisoformat(date.replace('Z', '+00:00'))
        else:
            base_date = datetime.now(timezone.utc)
        
        base_date = base_date.replace(hour=0, minute=0, second=0, microsecond=0)
        
        if period == "day":
            start_date = base_date
            end_date = base_date + timedelta(hours=23, minutes=59, seconds=59)
            period_label = base_date.strftime("%d/%m/%Y")
        elif period == "week":
            start_date = base_date - timedelta(days=base_date.weekday())  # Monday
            end_date = start_date + timedelta(days=6, hours=23, minutes=59, seconds=59)
            period_label = f"Semaine du {start_date.strftime('%d/%m')} au {end_date.strftime('%d/%m/%Y')}"
        else:  # month
            start_date = base_date.replace(day=1)
            # Last day of month
            if base_date.month == 12:
                end_date = base_date.replace(year=base_date.year + 1, month=1, day=1) - timedelta(seconds=1)
            else:
                end_date = base_date.replace(month=base_date.month + 1, day=1) - timedelta(seconds=1)
            period_label = base_date.strftime("%B %Y")
        
        start_str = start_date.isoformat()
        end_str = end_date.isoformat()
        
        # ============== INCOME (Recettes) ==============
        
        # 1. Validated invoices (Caisse)
        invoices = await db.invoices.find({
            "validation_status": "validated",
            "created_at": {"$gte": start_str, "$lte": end_str}
        }, {"_id": 0}).to_list(2000)
        
        caisse_total = sum(inv.get("total", 0) for inv in invoices)
        caisse_by_department = {}
        caisse_by_payment = {}
        caisse_by_server = {}
        
        for inv in invoices:
            # By department
            totals = inv.get("totals_by_department", {})
            for dept, amount in totals.items():
                if dept not in caisse_by_department:
                    caisse_by_department[dept] = 0
                caisse_by_department[dept] += amount
            
            # By payment method
            payment = inv.get("payment_method", "Espèces")
            if payment not in caisse_by_payment:
                caisse_by_payment[payment] = 0
            caisse_by_payment[payment] += inv.get("total", 0)
            
            # By server
            server = inv.get("created_by", "Inconnu")
            if server not in caisse_by_server:
                caisse_by_server[server] = {"count": 0, "total": 0}
            caisse_by_server[server]["count"] += 1
            caisse_by_server[server]["total"] += inv.get("total", 0)
        
        # 2. Game bookings (paid)
        bookings = await db.bookings.find({
            "payment_status": "completed",
            "created_at": {"$gte": start_str, "$lte": end_str}
        }, {"_id": 0}).to_list(500)
        
        bookings_total = sum(b.get("amount_to_pay", 0) for b in bookings)
        
        # 3. Table reservations (paid)
        table_reservations = await db.table_reservations.find({
            "payment_status": "completed",
            "created_at": {"$gte": start_str, "$lte": end_str}
        }, {"_id": 0}).to_list(500)
        
        tables_total = sum(t.get("amount_paid", 0) for t in table_reservations)
        
        # 4. Combo orders (paid)
        combos = await db.combo_orders.find({
            "payment_status": "completed",
            "created_at": {"$gte": start_str, "$lte": end_str}
        }, {"_id": 0}).to_list(500)
        
        combos_total = sum(c.get("total_price", 0) for c in combos)
        
        total_income = caisse_total + bookings_total + tables_total + combos_total
        
        # ============== EXPENSES (Dépenses) ==============
        
        expenses = await db.expenses.find({
            "status": "completed",
            "completed_at": {"$gte": start_str, "$lte": end_str}
        }, {"_id": 0}).to_list(500)
        
        total_expenses = sum(e.get("amount", 0) for e in expenses)
        expenses_by_category = {}
        
        for exp in expenses:
            cat = exp.get("category", "autres")
            if cat not in expenses_by_category:
                expenses_by_category[cat] = {"count": 0, "total": 0, "items": []}
            expenses_by_category[cat]["count"] += 1
            expenses_by_category[cat]["total"] += exp.get("amount", 0)
            expenses_by_category[cat]["items"].append({
                "description": exp.get("description"),
                "amount": exp.get("amount"),
                "supplier": exp.get("supplier"),
                "date": exp.get("completed_at", "")[:10]
            })
        
        # ============== RESULT ==============
        
        result = total_income - total_expenses
        margin = (result / total_income * 100) if total_income > 0 else 0
        
        return {
            "period": period,
            "period_label": period_label,
            "start_date": start_str[:10],
            "end_date": end_str[:10],
            "income": {
                "total": total_income,
                "caisse": {
                    "total": caisse_total,
                    "count": len(invoices),
                    "by_department": caisse_by_department,
                    "by_payment_method": caisse_by_payment,
                    "by_server": caisse_by_server
                },
                "reservations_jeux": {
                    "total": bookings_total,
                    "count": len(bookings)
                },
                "reservations_tables": {
                    "total": tables_total,
                    "count": len(table_reservations)
                },
                "combos": {
                    "total": combos_total,
                    "count": len(combos)
                }
            },
            "expenses": {
                "total": total_expenses,
                "count": len(expenses),
                "by_category": expenses_by_category
            },
            "result": {
                "net": result,
                "margin_percent": round(margin, 2),
                "is_profitable": result >= 0
            }
        }
    except Exception as e:
        logger.error(f"Error generating activity report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============== LOCATION RESERVATION ENDPOINTS ==============

LOCATION_SPACES = {
    "salle_fete": {"name": "Salle de Fête", "default_price": 50000},
    "espace_jardin": {"name": "Espace Jardin", "default_price": 30000},
    "salle_jeux": {"name": "Salle de Jeux", "default_price": 25000}
}


# ============== PROFORMA INVOICES ENDPOINTS ==============

@api_router.get("/proforma-invoices")
async def get_proforma_invoices(status: Optional[str] = None):
    """Get all proforma invoices"""
    try:
        query = {}
        if status:
            query["status"] = status
        
        proformas = await db.proforma_invoices.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
        
        # Calculate stats
        total_count = len(proformas)
        draft_count = len([p for p in proformas if p.get("status") == "draft"])
        sent_count = len([p for p in proformas if p.get("status") == "sent"])
        accepted_count = len([p for p in proformas if p.get("status") == "accepted"])
        converted_count = len([p for p in proformas if p.get("status") == "converted"])
        total_value = sum(p.get("total", 0) for p in proformas if p.get("status") in ["sent", "accepted"])
        
        return {
            "proformas": proformas,
            "stats": {
                "total": total_count,
                "draft": draft_count,
                "sent": sent_count,
                "accepted": accepted_count,
                "converted": converted_count,
                "total_value": total_value
            }
        }
    except Exception as e:
        logger.error(f"Error fetching proforma invoices: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/proforma-invoices")
async def create_proforma_invoice(proforma_data: ProformaInvoiceCreate):
    """Create a new proforma invoice"""
    try:
        # Generate proforma number
        today = datetime.now(timezone.utc)
        date_prefix = today.strftime("%Y%m%d")
        
        # Get count for today
        count = await db.proforma_invoices.count_documents({
            "proforma_number": {"$regex": f"^PRO-{date_prefix}"}
        })
        proforma_number = f"PRO-{date_prefix}-{str(count + 1).zfill(4)}"
        
        proforma = {
            "id": str(uuid.uuid4()),
            "proforma_number": proforma_number,
            "client_name": proforma_data.client_name,
            "client_phone": proforma_data.client_phone,
            "client_email": proforma_data.client_email,
            "client_address": proforma_data.client_address,
            "items": [item.model_dump() for item in proforma_data.items],
            "subtotal": proforma_data.subtotal,
            "discount": proforma_data.discount,
            "tax": proforma_data.tax,
            "total": proforma_data.total,
            "notes": proforma_data.notes,
            "validity_days": proforma_data.validity_days,
            "valid_until": (today + timedelta(days=proforma_data.validity_days)).strftime("%Y-%m-%d"),
            "status": "draft",
            "created_by": proforma_data.created_by,
            "created_at": today.isoformat(),
            "updated_at": today.isoformat(),
            "apply_tva": proforma_data.apply_tva
        }
        
        await db.proforma_invoices.insert_one(proforma)
        
        return {"success": True, "proforma": {k: v for k, v in proforma.items() if k != "_id"}}
    except Exception as e:
        logger.error(f"Error creating proforma invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/proforma-invoices/{proforma_id}")
async def get_proforma_invoice(proforma_id: str):
    """Get a single proforma invoice"""
    try:
        proforma = await db.proforma_invoices.find_one({"id": proforma_id}, {"_id": 0})
        if not proforma:
            raise HTTPException(status_code=404, detail="Proforma non trouvée")
        return {"proforma": proforma}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching proforma invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.put("/proforma-invoices/{proforma_id}")
async def update_proforma_invoice(proforma_id: str, update_data: ProformaInvoiceUpdate):
    """Update a proforma invoice"""
    try:
        update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
        update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        # Recalculate validity if validity_days changed
        if "validity_days" in update_dict:
            proforma = await db.proforma_invoices.find_one({"id": proforma_id})
            if proforma:
                created = datetime.fromisoformat(proforma["created_at"].replace("Z", "+00:00"))
                update_dict["valid_until"] = (created + timedelta(days=update_dict["validity_days"])).strftime("%Y-%m-%d")
        
        result = await db.proforma_invoices.update_one(
            {"id": proforma_id},
            {"$set": update_dict}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Proforma non trouvée")
        
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating proforma invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/proforma-invoices/{proforma_id}")
async def delete_proforma_invoice(proforma_id: str):
    """Delete a proforma invoice"""
    try:
        result = await db.proforma_invoices.delete_one({"id": proforma_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Proforma non trouvée")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting proforma invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/proforma-invoices/{proforma_id}/convert")
async def convert_proforma_to_invoice(proforma_id: str, converted_by: str = ""):
    """Convert a proforma invoice to a real invoice"""
    try:
        proforma = await db.proforma_invoices.find_one({"id": proforma_id}, {"_id": 0})
        if not proforma:
            raise HTTPException(status_code=404, detail="Proforma non trouvée")
        
        # Generate invoice number
        today = datetime.now(timezone.utc)
        date_prefix = today.strftime("%Y%m%d")
        count = await db.invoices.count_documents({
            "invoice_number": {"$regex": f"^EM-{date_prefix}"}
        })
        invoice_number = f"EM-{date_prefix}-{str(count + 1).zfill(4)}"
        
        # Create invoice from proforma
        invoice = {
            "id": str(uuid.uuid4()),
            "invoice_number": invoice_number,
            "customer_name": proforma["client_name"],
            "customer_phone": proforma.get("client_phone", ""),
            "items": proforma["items"],
            "subtotal": proforma["subtotal"],
            "discount": proforma.get("discount", 0),
            "total": proforma["total"],
            "payment_method": "especes",
            "validation_status": "pending",
            "created_by": converted_by or proforma.get("created_by", ""),
            "date": today.strftime("%Y-%m-%d"),
            "created_at": today.isoformat(),
            "from_proforma": proforma["proforma_number"]
        }
        
        await db.invoices.insert_one(invoice)
        
        # Update proforma status
        await db.proforma_invoices.update_one(
            {"id": proforma_id},
            {"$set": {
                "status": "converted",
                "converted_to_invoice": invoice_number,
                "converted_at": today.isoformat(),
                "updated_at": today.isoformat()
            }}
        )
        
        return {
            "success": True,
            "invoice": {k: v for k, v in invoice.items() if k != "_id"},
            "message": f"Proforma convertie en facture {invoice_number}"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error converting proforma to invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== PROFORMA DELETE REQUESTS ====================

class ProformaDeleteRequest(BaseModel):
    proforma_id: str
    proforma_number: str
    client_name: str
    total: float
    requested_by: str

@api_router.post("/proforma-delete-requests")
async def create_delete_request(request: ProformaDeleteRequest):
    """Create a delete request for a proforma (manager requests, admin approves)"""
    try:
        # Check if request already exists
        existing = await db.proforma_delete_requests.find_one({
            "proforma_id": request.proforma_id,
            "status": "pending"
        })
        if existing:
            raise HTTPException(status_code=400, detail="Une demande de suppression est déjà en attente pour cette proforma")
        
        delete_request = {
            "id": str(uuid.uuid4()),
            "proforma_id": request.proforma_id,
            "proforma_number": request.proforma_number,
            "client_name": request.client_name,
            "total": request.total,
            "requested_by": request.requested_by,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.proforma_delete_requests.insert_one(delete_request)
        
        return {"success": True, "message": "Demande de suppression envoyée"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating delete request: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/proforma-delete-requests")
async def get_delete_requests():
    """Get all pending delete requests (for admin)"""
    try:
        requests = await db.proforma_delete_requests.find(
            {"status": "pending"},
            {"_id": 0}
        ).sort("created_at", -1).to_list(100)
        
        return {"requests": requests}
    except Exception as e:
        logger.error(f"Error fetching delete requests: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/proforma-delete-requests/{request_id}/approve")
async def approve_delete_request(request_id: str, approved_by: str = ""):
    """Approve a delete request and delete the proforma (admin only)"""
    try:
        # Find the request
        delete_request = await db.proforma_delete_requests.find_one({"id": request_id})
        if not delete_request:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        if delete_request["status"] != "pending":
            raise HTTPException(status_code=400, detail="Cette demande a déjà été traitée")
        
        # Delete the proforma
        result = await db.proforma_invoices.delete_one({"id": delete_request["proforma_id"]})
        
        if result.deleted_count == 0:
            # Proforma already deleted, just update request status
            pass
        
        # Update request status
        await db.proforma_delete_requests.update_one(
            {"id": request_id},
            {"$set": {
                "status": "approved",
                "approved_by": approved_by,
                "approved_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return {"success": True, "message": "Proforma supprimée avec succès"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving delete request: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/proforma-delete-requests/{request_id}/reject")
async def reject_delete_request(request_id: str, rejected_by: str = ""):
    """Reject a delete request (admin only)"""
    try:
        result = await db.proforma_delete_requests.update_one(
            {"id": request_id, "status": "pending"},
            {"$set": {
                "status": "rejected",
                "rejected_by": rejected_by,
                "rejected_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Demande non trouvée ou déjà traitée")
        
        return {"success": True, "message": "Demande rejetée"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rejecting delete request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/locations")
async def get_locations(
    status: Optional[str] = None,
    space_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """Get all location reservations with optional filters"""
    try:
        query = {}
        if status:
            query["status"] = status
        if space_type:
            query["space_type"] = space_type
        if start_date:
            query["reservation_date"] = {"$gte": start_date}
        if end_date:
            if "reservation_date" in query:
                query["reservation_date"]["$lte"] = end_date
            else:
                query["reservation_date"] = {"$lte": end_date}
        
        locations = await db.location_reservations.find(query, {"_id": 0}).sort("reservation_date", -1).to_list(500)
        return {"locations": locations, "spaces": LOCATION_SPACES}
    except Exception as e:
        logger.error(f"Error fetching locations: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/locations")
async def create_location(location: LocationReservationCreate):
    """Create a new location reservation (Admin only)"""
    try:
        location_dict = location.model_dump()
        location_dict["id"] = str(uuid.uuid4())
        location_dict["status"] = "confirmed"
        location_dict["deposit_paid"] = location_dict.get("deposit_amount", 0)
        location_dict["balance_remaining"] = location_dict["rental_amount"] - location_dict["deposit_paid"]
        location_dict["created_at"] = datetime.now(timezone.utc).isoformat()
        location_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.location_reservations.insert_one(location_dict)
        return {"success": True, "location": {k: v for k, v in location_dict.items() if k != "_id"}}
    except Exception as e:
        logger.error(f"Error creating location: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/locations/{location_id}")
async def update_location(location_id: str, update: LocationReservationUpdate):
    """Update a location reservation (Admin only)"""
    try:
        update_dict = {k: v for k, v in update.model_dump().items() if v is not None}
        if not update_dict:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        # Recalculate balance if amounts changed
        if "rental_amount" in update_dict or "deposit_paid" in update_dict:
            existing = await db.location_reservations.find_one({"id": location_id})
            if existing:
                rental = update_dict.get("rental_amount", existing.get("rental_amount", 0))
                deposit = update_dict.get("deposit_paid", existing.get("deposit_paid", 0))
                update_dict["balance_remaining"] = rental - deposit
        
        result = await db.location_reservations.update_one(
            {"id": location_id},
            {"$set": update_dict}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Location not found")
        
        updated = await db.location_reservations.find_one({"id": location_id}, {"_id": 0})
        return {"success": True, "location": updated}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating location: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/locations/{location_id}")
async def delete_location(location_id: str):
    """Delete a location reservation (Admin only)"""
    try:
        result = await db.location_reservations.delete_one({"id": location_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Location not found")
        return {"success": True, "message": "Location deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting location: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============== INSTRUCTIONS & NOTES ENDPOINTS ==============

@api_router.get("/instructions")
async def get_instructions(
    is_archived: Optional[bool] = None,
    sender_role: Optional[str] = None,
    priority: Optional[str] = None
):
    """Get all instructions/notes"""
    try:
        query = {}
        if is_archived is not None:
            query["is_archived"] = is_archived
        if sender_role:
            query["sender_role"] = sender_role
        if priority:
            query["priority"] = priority
        
        instructions = await db.instructions.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
        return {"instructions": instructions}
    except Exception as e:
        logger.error(f"Error fetching instructions: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/instructions")
async def create_instruction(instruction: InstructionCreate):
    """Create a new instruction/note"""
    try:
        instruction_dict = instruction.model_dump()
        instruction_dict["id"] = str(uuid.uuid4())
        instruction_dict["is_read"] = False
        instruction_dict["is_archived"] = False
        instruction_dict["created_at"] = datetime.now(timezone.utc).isoformat()
        instruction_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        # Initialize tasks if task_list type
        if instruction_dict.get("instruction_type") == "task_list" and not instruction_dict.get("tasks"):
            instruction_dict["tasks"] = []
        
        await db.instructions.insert_one(instruction_dict)
        return {"success": True, "instruction": {k: v for k, v in instruction_dict.items() if k != "_id"}}
    except Exception as e:
        logger.error(f"Error creating instruction: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/instructions/{instruction_id}")
async def update_instruction(instruction_id: str, update: InstructionUpdate):
    """Update an instruction/note"""
    try:
        update_dict = {k: v for k, v in update.model_dump().items() if v is not None}
        if not update_dict:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        result = await db.instructions.update_one(
            {"id": instruction_id},
            {"$set": update_dict}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Instruction not found")
        
        updated = await db.instructions.find_one({"id": instruction_id}, {"_id": 0})
        return {"success": True, "instruction": updated}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating instruction: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/instructions/{instruction_id}")
async def delete_instruction(instruction_id: str):
    """Delete an instruction/note"""
    try:
        result = await db.instructions.delete_one({"id": instruction_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Instruction not found")
        return {"success": True, "message": "Instruction deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting instruction: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/instructions/{instruction_id}/task/{task_index}")
async def toggle_task(instruction_id: str, task_index: int, completed: bool = Body(..., embed=True)):
    """Toggle a task completion status in a task list"""
    try:
        instruction = await db.instructions.find_one({"id": instruction_id})
        if not instruction:
            raise HTTPException(status_code=404, detail="Instruction not found")
        
        tasks = instruction.get("tasks", [])
        if task_index < 0 or task_index >= len(tasks):
            raise HTTPException(status_code=400, detail="Invalid task index")
        
        tasks[task_index]["completed"] = completed
        
        await db.instructions.update_one(
            {"id": instruction_id},
            {"$set": {"tasks": tasks, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        
        updated = await db.instructions.find_one({"id": instruction_id}, {"_id": 0})
        return {"success": True, "instruction": updated}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling task: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Include modular routers with /api prefix
api_router.include_router(service_reports_router)
api_router.include_router(subscriptions_router)

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
