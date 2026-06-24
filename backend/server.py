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
import re
from twilio.rest import Client as TwilioClient

# Import modular routers
from routers.service_reports import router as service_reports_router, set_db as set_service_reports_db
from routers.subscriptions import router as subscriptions_router, set_db as set_subscriptions_db
from routers.stock import router as stock_router, set_db as set_stock_db
from routers.financial_points import router as financial_points_router, set_db as set_financial_points_db
from routers.caisse_users import router as caisse_users_router, set_db as set_caisse_users_db
from routers.reports import router as reports_router, set_db as set_reports_db
from routers.invoices import router as invoices_router, set_db as set_invoices_db
from routers.forecasts import router as forecasts_router, set_db as set_forecasts_db
from routers.expenses import router as expenses_router, set_db as set_expenses_db
from routers.needs import router as needs_router, set_db as set_needs_db
from routers.suppliers import router as suppliers_router, set_db as set_suppliers_db
from routers.purchase_orders import router as purchase_orders_router, set_db as set_po_db
from routers.current_accounts import router as current_accounts_router, set_db as set_ca_db
from routers.tips import router as tips_router, set_db as set_tips_db
from routers.notifications import router as notifications_router, set_db as set_notifications_db
from routers.product_packages import router as product_packages_router, set_db as set_product_packages_db
from routers.cash_closures import router as cash_closures_router, set_db as set_cash_closures_db
from routers.gerante_advances import router as gerante_advances_router, set_db as set_gerante_advances_db
from routers.journal import router as journal_router, set_db as set_journal_db
from routers.day_closures import router as day_closures_router, set_db as set_day_closures_db
from routers.billettage import router as billettage_router, set_db as set_billettage_db
from routers.location_simulations import router as location_sim_router, set_db as set_location_sim_db
from routers.quick_products import router as quick_products_router, set_db as set_quick_products_db, seed_if_empty as seed_quick_products
from routers.purchase_price_history import router as price_history_router, set_db as set_price_history_db, record_expense_completion as _record_purchase_price
from routers.day_openings import router as day_openings_router, set_db as set_day_openings_db, is_day_open as _is_day_open
from routers.journee_settings import router as journee_settings_router, set_db as set_journee_settings_db, verify_password as _verify_journee_pw, is_password_set as _is_journee_pw_set
from routers.shopping_list import router as shopping_list_router, set_db as set_shopping_list_db
from routers.receipt_scan import router as receipt_scan_router, set_db as set_receipt_scan_db
from routers.audit_engine import router as audit_engine_router
from routers.journal_ohada import router as journal_ohada_router
from routers.sync_snapshot import router as sync_snapshot_router
from routers.sync_queue import router as sync_queue_router
from routers.regularization import router as regularization_router
from routers.recoupement import router as recoupement_router
from routers.cuisine import router as cuisine_router
from routers.jeux import router as jeux_router
from routers.daily_reports import router as daily_reports_router
from routers.coach_sessions import router as coach_sessions_router
from routers.public_ticket import router as public_ticket_router, set_db as set_public_ticket_db
from routers.maintenance import router as maintenance_router, set_db as set_maintenance_db
from routers.period_assignment import router as period_assignment_router, set_db as set_period_assignment_db
from routers.offline_prealloc import router as offline_prealloc_router
from routers.products import router as caisse_products_router, set_db as set_caisse_products_db
from routers.promo_vacances import router as promo_vacances_router
from routers.admin_site_notifications import router as admin_site_notifications_router

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Initialize router databases
set_service_reports_db(db)
set_subscriptions_db(db)
set_stock_db(db)
set_financial_points_db(db)
set_caisse_users_db(db)
set_reports_db(db)
set_invoices_db(db)
set_forecasts_db(db)
set_expenses_db(db)
set_needs_db(db)
set_suppliers_db(db)
set_po_db(db)
set_ca_db(db)
set_tips_db(db)
set_notifications_db(db)
set_product_packages_db(db)
set_cash_closures_db(db)
set_gerante_advances_db(db)
set_journal_db(db)
set_day_closures_db(db)
set_billettage_db(db)
set_location_sim_db(db)
set_quick_products_db(db)
set_price_history_db(db)
set_day_openings_db(db)
set_journee_settings_db(db)
set_shopping_list_db(db)
set_receipt_scan_db(db)
set_public_ticket_db(db)
set_maintenance_db(db)
set_period_assignment_db(db)
set_caisse_products_db(db)

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


# ─────────────── Liveness / readiness endpoints (Kubernetes probes) ───────────────
# Réponses ultra-légères (pas d'accès DB) pour que le health-check passe
# AVANT et PENDANT que les 47 routers se finissent d'initialiser.

@app.get("/")
async def root_probe():
    return {"status": "ok", "service": "espace-maxo-api"}


@app.get("/health")
async def health_probe():
    return {"status": "healthy"}


@app.get("/api")
async def api_root_probe():
    return {"status": "ok", "service": "espace-maxo-api"}


@app.get("/api/health")
async def api_health_probe():
    return {"status": "healthy"}


@app.on_event("startup")
async def _seed_initial_data():
    # Le seed est lancé en arrière-plan pour ne pas bloquer le startup
    # (Kubernetes attend que startup termine avant de marquer le pod ready).
    import asyncio

    async def _bg_seed():
        try:
            await seed_quick_products()
        except Exception as e:
            logger.error(f"Background seed failed: {e}")

    try:
        asyncio.create_task(_bg_seed())
    except Exception as e:
        logger.error(f"Could not schedule background seed: {e}")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Include modular routers FIRST so their static paths (e.g. /invoices/stats) take
# precedence over inline dynamic paths (e.g. /invoices/{invoice_id}) defined later.
api_router.include_router(reports_router)
api_router.include_router(invoices_router)
api_router.include_router(forecasts_router)
api_router.include_router(expenses_router)
api_router.include_router(needs_router)
api_router.include_router(suppliers_router)
api_router.include_router(purchase_orders_router)
api_router.include_router(current_accounts_router)
api_router.include_router(tips_router)
api_router.include_router(notifications_router)
api_router.include_router(product_packages_router)
api_router.include_router(caisse_users_router)
api_router.include_router(financial_points_router)
api_router.include_router(service_reports_router)
api_router.include_router(subscriptions_router)
api_router.include_router(stock_router)
api_router.include_router(cash_closures_router)
api_router.include_router(gerante_advances_router)
api_router.include_router(journal_router)
api_router.include_router(day_closures_router)
api_router.include_router(billettage_router)
api_router.include_router(location_sim_router)
api_router.include_router(quick_products_router)
api_router.include_router(price_history_router)
api_router.include_router(day_openings_router)
api_router.include_router(journee_settings_router)
api_router.include_router(shopping_list_router)
api_router.include_router(receipt_scan_router)
api_router.include_router(audit_engine_router)
api_router.include_router(journal_ohada_router)
api_router.include_router(sync_snapshot_router)
api_router.include_router(sync_queue_router)
api_router.include_router(regularization_router)
api_router.include_router(recoupement_router)
api_router.include_router(cuisine_router)
api_router.include_router(jeux_router)
api_router.include_router(daily_reports_router)
api_router.include_router(coach_sessions_router)
api_router.include_router(public_ticket_router)
api_router.include_router(maintenance_router)
api_router.include_router(period_assignment_router)
api_router.include_router(offline_prealloc_router)
# Caisse products workflow (pending/approve/reject/duplicates/deduplicate) — DOIT être inclus
# AVANT les routes inline /caisse/products de server.py pour que les chemins statiques
# /caisse/products/pending et /caisse/products/duplicates aient la priorité sur /caisse/products/{id}.
api_router.include_router(caisse_products_router)
api_router.include_router(promo_vacances_router)
api_router.include_router(admin_site_notifications_router)

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

# Invoice models moved to routers/invoices.py (InvoiceItemCreate, InvoiceCreate, Invoice).

# Caisse User Model (moved to routers/caisse_users.py)
# CaisseUserCreate and CaisseUser classes are now in the dedicated router module.

# Caisse Product Model
class CaisseProductCreate(BaseModel):
    name: str
    price: float
    department: str  # jeux, bar, jardin
    unit: str = "unité"
    category: str = ""
    is_available: bool = True
    stock_product_id: str = ""  # DEPRECATED legacy single link (kept for backwards compat). Migrated to stock_links on read.
    stock_recipe_id: str = ""  # Optional link to a stock_recipe (composed product). Mutually exclusive with stock_links.
    stock_links: List[str] = Field(default_factory=list)  # Multi-link: list of stock_product ids decremented on sale (qty=item_qty each).
    no_stock_tracking: bool = False  # True for service products (games, fees, etc.) — excluded from "unlinked" stats and never destocked.

class CaisseProduct(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    price: float
    department: str
    unit: str = "unité"
    category: str = ""
    is_available: bool = True
    stock_product_id: str = ""  # DEPRECATED legacy single link
    stock_recipe_id: str = ""
    stock_links: List[str] = Field(default_factory=list)
    no_stock_tracking: bool = False
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

    # Mot de passe Admin "Caisse Pro" (identique au login /caisse/login).
    # Permet d'utiliser le même mot de passe partout (connexion + actions sensibles).
    if password == "Nikeland2026":
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
ADMIN_PHONE_NUMBERS = ["+22997720808", "+22966269565", "+22941530000"]

async def send_admin_sms_notification(message: str):
    """[DÉSACTIVÉ] Les notifications Twilio (SMS / WhatsApp) sont volontairement désactivées.
    Réactiver en posant TWILIO_NOTIFICATIONS_ENABLED=true dans backend/.env.
    """
    if os.environ.get("TWILIO_NOTIFICATIONS_ENABLED", "").lower() not in ("1", "true", "yes"):
        logger.debug("Twilio notifications disabled (admin) — skipping message")
        return False
    try:
        from services.sms_service import send_admin_sms_notification as _svc_send
        return await _svc_send(message)
    except Exception as e:
        logger.error(f"send_admin_sms_notification failed: {e}")
        return False

# Keep old function name for backward compatibility
async def send_whatsapp_notification(message: str):
    """[DÉSACTIVÉ] Les notifications WhatsApp via Twilio sont désactivées."""
    return await send_admin_sms_notification(message)

async def send_client_sms_confirmation(phone: str, message: str):
    """[DÉSACTIVÉ] Les SMS clients via Twilio sont désactivés.
    Réactiver via TWILIO_NOTIFICATIONS_ENABLED=true dans backend/.env.
    """
    if os.environ.get("TWILIO_NOTIFICATIONS_ENABLED", "").lower() not in ("1", "true", "yes"):
        logger.debug(f"Twilio notifications disabled (client {phone}) — skipping SMS")
        return False
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

# ============== CAISSE PRODUCTS ENDPOINTS ==============

@api_router.post("/caisse/products")
async def create_caisse_product(product_data: CaisseProductCreate, modified_by: str = "", modified_by_role: str = ""):
    """Create a new caisse product.

    Workflow d'approbation : si l'auteur n'est pas Admin, le produit est créé
    avec status="pending" et reste invisible aux serveurs (Caisse/POS) tant qu'il
    n'a pas été validé par l'Admin via POST /caisse/products/{id}/approve.
    """
    try:
        product = CaisseProduct(**product_data.model_dump())
        product_dict = product.model_dump()
        is_admin = (modified_by_role or "").strip().lower() == "admin"
        now_iso = datetime.now(timezone.utc).isoformat()
        product_dict["created_by"] = (modified_by or "").strip()
        product_dict["created_by_role"] = (modified_by_role or "").strip()
        if is_admin:
            product_dict["status"] = "approved"
            product_dict["approved_by"] = (modified_by or "Admin").strip() or "Admin"
            product_dict["approved_at"] = now_iso
        else:
            product_dict["status"] = "pending"
        await db.caisse_products.insert_one(product_dict)

        # Create notification for admin (always, but flag pending in action label)
        if modified_by and modified_by_role:
            notification = {
                "id": str(uuid.uuid4()),
                "action": "created_pending" if product_dict["status"] == "pending" else "created",
                "product_name": product_dict.get("name", ""),
                "product_id": product_dict.get("id", ""),
                "department": product_dict.get("department", ""),
                "old_price": None,
                "new_price": product_dict.get("price", 0),
                "modified_by": modified_by,
                "modified_by_role": modified_by_role,
                "is_read": False,
                "created_at": now_iso
            }
            await db.menu_notifications.insert_one(notification)

        return {
            "success": True,
            "pending": product_dict["status"] == "pending",
            "product": {k: v for k, v in product_dict.items() if k != "_id"},
        }
    except Exception as e:
        logger.error(f"Error creating caisse product: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/caisse/products")
async def get_caisse_products(include_pending: bool = False, status: Optional[str] = None):
    """Get caisse products. Par défaut : uniquement les produits approuvés.

    - `?include_pending=true` ou `?status=all` : renvoie aussi les produits en attente.
    - `?status=pending` : uniquement les produits en attente.
    """
    try:
        if status == "all" or include_pending:
            query = {}
        elif status == "pending":
            query = {"status": "pending"}
        else:
            # Compat : produits legacy sans champ status sont considérés approved
            query = {"$or": [{"status": "approved"}, {"status": {"$exists": False}}]}
        products = await db.caisse_products.find(query, {"_id": 0}).to_list(1000)
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

        # Mutual exclusion: stock_links (multi), stock_recipe_id, and legacy stock_product_id cannot coexist.
        # If the caller sets stock_links to a non-empty list, clear the others.
        # If the caller sets stock_recipe_id, clear the others.
        # If the caller sets legacy stock_product_id, migrate it transparently to stock_links: [id].
        if "stock_links" in product_data:
            sl = product_data.get("stock_links") or []
            if isinstance(sl, list) and len(sl) > 0:
                product_data["stock_recipe_id"] = ""
                product_data["stock_product_id"] = ""  # legacy cleared
        if product_data.get("stock_recipe_id"):
            product_data["stock_links"] = []
            product_data["stock_product_id"] = ""
        # Legacy compatibility: convert stock_product_id (single) -> stock_links: [id]
        if product_data.get("stock_product_id"):
            product_data["stock_links"] = [product_data["stock_product_id"]]
            product_data["stock_recipe_id"] = ""
            product_data["stock_product_id"] = ""

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



@api_router.post("/caisse/products/auto-link-to-stock")
async def auto_link_caisse_products_to_stock(
    threshold: float = 0.80,
    dry_run: bool = False,
):
    """Auto-link caisse products to stock products by name similarity.

    For every caisse product with no stock_product_id, find the best stock_product
    whose name similarity (difflib SequenceMatcher) is >= `threshold`. If found,
    set stock_product_id on the caisse product (unless dry_run=True).

    Returns a report: linked, ambiguous (multiple high matches), no_match, already_linked.
    """
    from difflib import SequenceMatcher

    def norm(s: str) -> str:
        return (s or "").strip().lower()

    try:
        caisse_products = await db.caisse_products.find({}, {"_id": 0}).to_list(2000)
        stock_products = await db.stock_products.find(
            {"is_active": True}, {"_id": 0}
        ).to_list(2000)

        report = {
            "scanned": len(caisse_products),
            "already_linked": 0,
            "linked": [],
            "ambiguous": [],
            "no_match": [],
            "threshold": threshold,
            "dry_run": dry_run,
        }

        for cp in caisse_products:
            cp_name = norm(cp.get("name"))
            if not cp_name:
                continue
            if cp.get("stock_links") or cp.get("stock_product_id") or cp.get("stock_recipe_id"):
                report["already_linked"] += 1
                continue

            # Score every stock product
            scores = []
            for sp in stock_products:
                ratio = SequenceMatcher(None, cp_name, norm(sp.get("name"))).ratio()
                if ratio >= threshold:
                    scores.append((ratio, sp))
            scores.sort(key=lambda x: x[0], reverse=True)

            if not scores:
                report["no_match"].append({"caisse_id": cp["id"], "caisse_name": cp.get("name")})
                continue

            best_ratio, best_sp = scores[0]

            # Mark as ambiguous if 2+ stock products have very high (>=0.95) score
            high_matches = [s for s in scores if s[0] >= 0.95]
            if len(high_matches) > 1 and abs(scores[0][0] - scores[1][0]) < 0.02:
                report["ambiguous"].append({
                    "caisse_id": cp["id"],
                    "caisse_name": cp.get("name"),
                    "candidates": [
                        {"stock_id": s.get("id"), "stock_name": s.get("name"), "score": round(r, 3)}
                        for r, s in high_matches[:5]
                    ],
                })
                continue

            entry = {
                "caisse_id": cp["id"],
                "caisse_name": cp.get("name"),
                "stock_id": best_sp.get("id"),
                "stock_name": best_sp.get("name"),
                "score": round(best_ratio, 3),
            }
            if not dry_run:
                await db.caisse_products.update_one(
                    {"id": cp["id"]},
                    {"$set": {
                        "stock_links": [best_sp["id"]],
                        "stock_product_id": "",
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }},
                )
            report["linked"].append(entry)

        report["linked_count"] = len(report["linked"])
        report["ambiguous_count"] = len(report["ambiguous"])
        report["no_match_count"] = len(report["no_match"])
        return report
    except Exception as e:
        logger.error(f"Auto-link caisse products error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/caisse/products/smart-link-to-stock")
async def smart_link_caisse_products_to_stock(dry_run: bool = False):
    """Smart linking using a keyword dictionary tailored for the menu.

    Strategy:
    1) Build keyword rules (caisse keyword -> preferred stock name fragments).
    2) For each unlinked caisse product, find a matching rule.
    3) If a rule matches, find the best stock product whose name contains the
       preferred stock fragment (case-insensitive). Pick the shortest match
       so generic items (e.g., "Poulet entier") win over qualifiers.
    4) Skip when no rule matches OR no stock product is found.
    """
    # Ordered: more specific first.
    RULES = [
        # (caisse keyword, list of candidate stock fragments — first found wins)
        ("poulet bicyclette", ["poulet bicyclette"]),
        ("poulet chair", ["poulet de chair", "poulet entier"]),
        ("poulet", ["poulet entier", "poulet de chair"]),
        ("aileron", ["ailes de poulet", "ailerons"]),
        ("filet de boeuf", ["filet de boeuf"]),
        ("langue de boeuf", ["langue de boeuf"]),
        ("steak", ["filet de boeuf", "boeuf sans os"]),
        ("boeuf", ["boeuf sans os", "boeuf avec os"]),
        ("agneau", ["mouton"]),
        ("mouton", ["mouton"]),
        ("lapin", ["lapin"]),
        ("porc", ["porc"]),
        ("poulpe", ["poulpe"]),
        ("crevette", ["crevettes"]),
        ("poisson", ["poisson frais", "poisson congele"]),
        # Accompagnements
        ("frite", ["frites surgelees", "frites"]),
        ("pomme sautée", ["pomme de terre"]),
        ("riz cantonais", ["riz parfume", "riz blanc"]),
        ("riz blanc", ["riz blanc"]),
        ("riz aux légumes", ["riz blanc"]),
        ("riz", ["riz blanc"]),
        ("alloco", ["banane plantain mure", "banane plantain"]),
        ("igname", ["igname"]),
        ("couscous", ["semoule de couscous", "semoule"]),
        ("spaghetti", ["spaghetti"]),
        ("pâtes", ["spaghetti", "pates"]),
        ("tagliatelles", ["tagliatelles", "spaghetti"]),
        ("atiéké", ["attieke", "atieke"]),
        ("akassa", ["mais en grains", "farine de mais"]),
        # Boissons (au cas où)
        ("coca", ["coca"]),
        ("fanta", ["fanta"]),
        ("sprite", ["sprite"]),
        ("heineken", ["heineken"]),
        ("beaufort", ["beaufort"]),
        ("possotomé", ["possotome"]),
        ("eau gazeuse", ["eau gazeuse"]),
        ("eau plate", ["eau plate", "eau minerale"]),
        ("vin rouge", ["vin rouge"]),
        ("vin blanc", ["vin blanc"]),
        ("vin rosé", ["vin rose"]),
        ("jus", ["jus en brique", "jus d'orange"]),
        ("bissap", ["bissap"]),
    ]

    def norm(s: str) -> str:
        return (s or "").strip().lower()

    try:
        caisse_products = await db.caisse_products.find({}, {"_id": 0}).to_list(2000)
        stock_products = await db.stock_products.find({"is_active": True}, {"_id": 0}).to_list(2000)
        sp_by_norm = [(norm(sp.get("name")), sp) for sp in stock_products]

        report = {
            "scanned": len(caisse_products),
            "already_linked": 0,
            "linked": [],
            "no_match": [],
            "dry_run": dry_run,
        }

        for cp in caisse_products:
            cp_name = norm(cp.get("name"))
            if not cp_name:
                continue
            if cp.get("stock_links") or cp.get("stock_product_id") or cp.get("stock_recipe_id"):
                report["already_linked"] += 1
                continue

            matched_sp = None
            matched_rule = None
            for kw, candidates in RULES:
                if kw in cp_name:
                    # Found a matching keyword. Try its candidates.
                    for frag in candidates:
                        # Pick shortest stock name that contains the fragment (more generic wins)
                        hits = [sp for sn, sp in sp_by_norm if frag in sn]
                        if hits:
                            hits.sort(key=lambda s: len(s.get("name", "")))
                            matched_sp = hits[0]
                            matched_rule = f"{kw} → {frag}"
                            break
                    # IMPORTANT: stop here even if no candidate matched.
                    # The keyword is specific (rules are ordered specific→generic);
                    # falling back to a less-specific rule would produce wrong mappings
                    # (ex: "langue de boeuf" with no matching stock → falsely mapped to "boeuf sans os").
                    break

            if not matched_sp:
                report["no_match"].append({"caisse_id": cp["id"], "caisse_name": cp.get("name")})
                continue

            entry = {
                "caisse_id": cp["id"],
                "caisse_name": cp.get("name"),
                "stock_id": matched_sp.get("id"),
                "stock_name": matched_sp.get("name"),
                "rule": matched_rule,
            }
            if not dry_run:
                await db.caisse_products.update_one(
                    {"id": cp["id"]},
                    {"$set": {
                        "stock_links": [matched_sp["id"]],
                        "stock_product_id": "",
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }},
                )
            report["linked"].append(entry)

        report["linked_count"] = len(report["linked"])
        report["no_match_count"] = len(report["no_match"])
        return report
    except Exception as e:
        logger.error(f"Smart-link caisse products error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/caisse/products/health-check")
async def caisse_stock_health_check():
    """Diagnostique la santé des liaisons Caisse↔Stock.

    Retourne :
    - `unlinked`       : produits Caisse actifs sans stock_links/stock_recipe_id (sauf no_stock_tracking)
    - `orphans`        : produits Caisse dont les stock_links pointent vers des stock_products inexistants/inactifs
    - `duplicates`     : cas où plusieurs produits Caisse pointent vers le même stock_product (risque de double déduction si mal géré)
    - `stock_unused`   : produits Stock actifs non liés à aucun produit Caisse (si `storage_zone=cuisine`)
    """
    try:
        caisse_products = await db.caisse_products.find({"is_active": {"$ne": False}}, {"_id": 0}).to_list(2000)
        stock_products = await db.stock_products.find({"is_active": True}, {"_id": 0}).to_list(2000)
        stock_ids = {sp["id"] for sp in stock_products}
        stock_by_id = {sp["id"]: sp for sp in stock_products}

        unlinked = []       # [{id, name, category}]
        orphans = []        # [{caisse_id, caisse_name, broken_link_ids: [..]}]
        duplicates_map = {}  # stock_id -> [caisse_product summary]

        for cp in caisse_products:
            if cp.get("no_stock_tracking"):
                continue
            links = cp.get("stock_links") or []
            if not links and cp.get("stock_product_id"):
                links = [cp["stock_product_id"]]
            recipe = cp.get("stock_recipe_id")

            if not links and not recipe:
                unlinked.append({
                    "id": cp.get("id"),
                    "name": cp.get("name"),
                    "category": cp.get("category", ""),
                    "price": cp.get("price", 0),
                })
                continue

            broken = [lid for lid in links if lid not in stock_ids]
            if broken:
                orphans.append({
                    "caisse_id": cp.get("id"),
                    "caisse_name": cp.get("name"),
                    "broken_link_ids": broken,
                    "valid_link_ids": [lid for lid in links if lid in stock_ids],
                })

            # Track duplicates
            for lid in links:
                if lid in stock_ids:
                    duplicates_map.setdefault(lid, []).append({
                        "caisse_id": cp.get("id"),
                        "caisse_name": cp.get("name"),
                        "category": cp.get("category", ""),
                    })

        duplicates = []
        for sid, consumers in duplicates_map.items():
            if len(consumers) > 1:
                sp = stock_by_id.get(sid, {})
                duplicates.append({
                    "stock_id": sid,
                    "stock_name": sp.get("name"),
                    "consumers": consumers,
                    "count": len(consumers),
                })

        # Unused stock products (cuisine only — magasin is detached by design)
        linked_stock_ids = set()
        for cp in caisse_products:
            for lid in (cp.get("stock_links") or []):
                linked_stock_ids.add(lid)
            if cp.get("stock_product_id"):
                linked_stock_ids.add(cp["stock_product_id"])
        stock_unused = [
            {"id": sp["id"], "name": sp["name"], "code": sp.get("code", ""), "quantity": sp.get("quantity", 0)}
            for sp in stock_products
            if sp.get("storage_zone", "cuisine") == "cuisine" and sp["id"] not in linked_stock_ids
        ]

        return {
            "summary": {
                "caisse_products_active": len(caisse_products),
                "stock_products_active": len(stock_products),
                "unlinked_count": len(unlinked),
                "orphans_count": len(orphans),
                "duplicates_count": len(duplicates),
                "stock_unused_count": len(stock_unused),
                "health_score": _compute_health_score(len(caisse_products), len(unlinked), len(orphans)),
            },
            "unlinked": unlinked,
            "orphans": orphans,
            "duplicates": duplicates,
            "stock_unused": stock_unused,
        }
    except Exception as e:
        logger.error(f"Health-check caisse/stock error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _compute_health_score(total_caisse: int, unlinked: int, orphans: int) -> int:
    """Score 0-100 basé sur le ratio de produits Caisse bien liés."""
    if total_caisse == 0:
        return 100
    issues = unlinked + orphans * 2  # les orphans pèsent plus lourd
    ratio = max(0.0, 1.0 - (issues / (total_caisse * 2)))
    return int(round(ratio * 100))


@api_router.post("/caisse/products/health-repair-orphans")
async def repair_orphan_links(dry_run: bool = False):
    """Nettoie les `stock_links` qui pointent vers des stock_products inexistants/inactifs."""
    try:
        stock_products = await db.stock_products.find({"is_active": True}, {"_id": 0, "id": 1}).to_list(2000)
        valid_ids = {sp["id"] for sp in stock_products}
        caisse_products = await db.caisse_products.find({"is_active": {"$ne": False}}, {"_id": 0}).to_list(2000)

        repaired = []
        for cp in caisse_products:
            links = cp.get("stock_links") or []
            broken = [lid for lid in links if lid not in valid_ids]
            if not broken:
                # Also clean legacy stock_product_id if broken
                spid = cp.get("stock_product_id")
                if spid and spid not in valid_ids:
                    if not dry_run:
                        await db.caisse_products.update_one(
                            {"id": cp["id"]},
                            {"$set": {"stock_product_id": "", "updated_at": datetime.now(timezone.utc).isoformat()}},
                        )
                    repaired.append({"caisse_id": cp["id"], "caisse_name": cp["name"], "cleaned_legacy_id": spid})
                continue
            kept = [lid for lid in links if lid in valid_ids]
            if not dry_run:
                await db.caisse_products.update_one(
                    {"id": cp["id"]},
                    {"$set": {
                        "stock_links": kept,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }},
                )
            repaired.append({
                "caisse_id": cp["id"],
                "caisse_name": cp["name"],
                "removed_links": broken,
                "kept_links": kept,
            })
        return {"success": True, "repaired_count": len(repaired), "repaired": repaired, "dry_run": dry_run}
    except Exception as e:
        logger.error(f"Repair orphans error: {e}")
        raise HTTPException(status_code=500, detail=str(e))




@api_router.get("/caisse/products/stock-suggestions")
async def stock_suggestions_for_caisse_product(
    name: str,
    limit: int = 5,
    threshold: float = 0.40,
):
    """Return top stock products matching a candidate name (used for autocomplete on creation).

    Scoring prioritizes substring/prefix matches over pure SequenceMatcher to give
    relevant suggestions for short queries (e.g., 'poulet' should rank 'Poulet entier'
    above 'Poulpe').
    """
    from difflib import SequenceMatcher

    if not name or len(name.strip()) < 2:
        return {"suggestions": []}
    cand = name.strip().lower()
    stock_products = await db.stock_products.find(
        {"is_active": True}, {"_id": 0}
    ).to_list(2000)
    scored = []
    for sp in stock_products:
        sp_name = (sp.get("name") or "").strip().lower()
        if not sp_name:
            continue
        ratio = SequenceMatcher(None, cand, sp_name).ratio()
        boosted = ratio
        if sp_name == cand:
            boosted = 1.0
        elif sp_name.startswith(cand):
            boosted = max(ratio, 0.92)
        elif cand in sp_name:
            boosted = max(ratio, 0.85)
        elif sp_name in cand:
            boosted = max(ratio, 0.75)
        if boosted >= threshold:
            scored.append((boosted, ratio, sp))
    scored.sort(key=lambda x: x[0], reverse=True)
    return {
        "suggestions": [
            {
                "id": sp.get("id"),
                "name": sp.get("name"),
                "unit": sp.get("unit"),
                "quantity": sp.get("quantity"),
                "score": round(boost, 3),
            }
            for boost, ratio, sp in scored[:limit]
        ]
    }


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
    status: Optional[str] = None  # "open" | "ready_to_invoice" | "invoiced" | "closed"
    invoice_created_at: Optional[str] = None
    last_order_sent_at: Optional[str] = None  # Timestamp dernier "ENVOYER LA COMMANDE"
    pending_invoice_id: Optional[str] = None  # Bon en attente lié à la table (ready_to_invoice)

@api_router.get("/caisse/tables/status")
async def get_tables_status():
    """Get status of all 20 tables (free/occupied/invoiced with timing).

    AUTO-LIBÉRATION : les tables `invoiced` depuis plus de 30 minutes sont
    automatiquement libérées (supprimées) pour éviter qu'elles restent
    indéfiniment dans la collection si l'auto-stop frontend n'est pas activé.
    """
    try:
        # Auto-libérer les tables invoiced > 30 min (avant lecture)
        now_iso = datetime.now(timezone.utc).isoformat()
        threshold = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
        try:
            # Tables invoiced anciennes (avec ou sans invoice_created_at)
            stale = await db.caisse_tables.find({
                "status": "invoiced",
                "$or": [
                    {"invoice_created_at": {"$lt": threshold}},
                    {"invoice_created_at": {"$exists": False}},
                    {"invoice_created_at": None},
                ],
            }, {"_id": 0}).to_list(50)
            # Pour les tables sans invoice_created_at, on filtre par created_at > 30 min
            stale = [
                s for s in stale
                if s.get("invoice_created_at") or (
                    s.get("created_at") and s["created_at"] < threshold
                )
            ]
            for s in stale:
                # Archive in service_stats avant suppression
                try:
                    created_at = datetime.fromisoformat(s["created_at"].replace("Z", "+00:00"))
                    inv_at = datetime.fromisoformat(s.get("invoice_created_at", now_iso).replace("Z", "+00:00"))
                    duration = max(0, int((inv_at - created_at).total_seconds() / 60))
                    await db.service_stats.insert_one({
                        "id": str(uuid.uuid4()),
                        "table_number": s.get("table_number"),
                        "server_id": s.get("server_id", ""),
                        "server_name": s.get("server_name", ""),
                        "client_name": s.get("client_name", "Client"),
                        "items_count": 0,
                        "total_amount": 0,
                        "duration_minutes": duration,
                        "quality_status": "excellent" if duration < 15 else ("acceptable" if duration < 30 else "slow"),
                        "started_at": s["created_at"],
                        "stopped_at": now_iso,
                        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                        "auto_released": True,
                    })
                except Exception as _e:
                    logger.warning(f"Auto-release stats save failed for table {s.get('table_number')}: {_e}")
            if stale:
                stale_ids = [s["id"] for s in stale]
                deleted = await db.caisse_tables.delete_many({"id": {"$in": stale_ids}})
                logger.info(f"Auto-released {deleted.deleted_count} stale invoiced tables")
        except Exception as _e:
            logger.warning(f"Auto-release of stale invoiced tables failed: {_e}")

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
                # IMPORTANT: pour les tables FACTURÉES, on FIGE le timer à invoice_created_at.
                # Pour les tables READY_TO_INVOICE, on FIGE à last_order_sent_at (commande envoyée).
                # Sinon le timer continue de tourner indéfiniment et fausse les statistiques.
                created_at = datetime.fromisoformat(table["created_at"].replace("Z", "+00:00"))
                if table_status == "invoiced" and table.get("invoice_created_at"):
                    try:
                        end_at = datetime.fromisoformat(table["invoice_created_at"].replace("Z", "+00:00"))
                    except Exception:
                        end_at = now
                elif table_status == "ready_to_invoice" and table.get("last_order_sent_at"):
                    try:
                        end_at = datetime.fromisoformat(table["last_order_sent_at"].replace("Z", "+00:00"))
                    except Exception:
                        end_at = now
                else:
                    end_at = now
                duration_seconds = (end_at - created_at).total_seconds()
                duration_minutes = max(0, int(duration_seconds / 60))
                
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
                    # Conserver le statut sémantique pour l'UI : "occupied" | "ready_to_invoice" | "invoiced"
                    "status": (
                        "invoiced" if table_status == "invoiced"
                        else "ready_to_invoice" if table_status == "ready_to_invoice"
                        else "occupied"
                    ),
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
async def get_caisse_tables(server_id: Optional[str] = None, actor_role: Optional[str] = None):
    """Get tables. Si actor_role admin/manager : toutes les tables (ignore server_id filter)."""
    try:
        query = {}
        if actor_role in ("admin", "manager"):
            pass  # No filter - all tables
        elif server_id:
            query["server_id"] = server_id
        
        tables = await db.caisse_tables.find(query, {"_id": 0}).sort("table_number", 1).to_list(200)
        return {"tables": tables}
    except Exception as e:
        logger.error(f"Error fetching tables: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/caisse/tables")
async def create_caisse_table(table_data: CaisseTableCreate):
    """Create a new table/draft invoice"""
    try:
        # === Garde-fou : journée du jour DOIT être ouverte ===
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        opening = await db.day_openings.find_one({"date": today_str}, {"_id": 0, "status": 1})
        if not opening or opening.get("status") != "open":
            raise HTTPException(
                status_code=423,
                detail="La journée n'est pas ouverte. Veuillez ouvrir la journée avant d'ouvrir une table."
            )

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
async def update_caisse_table(
    table_id: str,
    table_data: CaisseTableUpdate,
    actor_name: Optional[str] = Query(None),
    actor_role: Optional[str] = Query(None),
):
    """Update a table/draft invoice"""
    try:
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
        if table_data.status is not None:
            update_data["status"] = table_data.status
        if table_data.invoice_created_at is not None:
            update_data["invoice_created_at"] = table_data.invoice_created_at
        if table_data.last_order_sent_at is not None:
            update_data["last_order_sent_at"] = table_data.last_order_sent_at
        # Accept pending_invoice_id = "" or None to clear it
        if table_data.pending_invoice_id is not None:
            update_data["pending_invoice_id"] = table_data.pending_invoice_id or None
        
        result = await db.caisse_tables.update_one(
            {"id": table_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Table non trouvée")
        
        updated_table = await db.caisse_tables.find_one({"id": table_id}, {"_id": 0})

        # Audit (skip the silent post-invoicing cleanup: status='invoiced' + items=[])
        try:
            from routers.invoices import _log_audit as _log_audit_fn
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
                # Don't log the auto post-invoice cleanup (status->invoiced + items emptied)
                is_invoice_cleanup = (
                    update_data.get("status") == "invoiced"
                    and update_data.get("items") == []
                )
                if changes and not is_invoice_cleanup:
                    await _log_audit_fn(
                        "table",
                        updated_table or before,
                        "update",
                        {"name": actor_name, "role": actor_role},
                        changes,
                    )
        except Exception as _audit_err:
            logger.error(f"table audit failed: {_audit_err}")

        return {"success": True, "table": updated_table}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating table: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/caisse/tables/{table_id}")
async def delete_caisse_table(
    table_id: str,
    actor_name: Optional[str] = Query(None),
    actor_role: Optional[str] = Query(None),
    reason: Optional[str] = Query(None),
    force: bool = Query(False),
):
    """Delete a table/draft (when converted to invoice or cancelled).
    Empêche la suppression si un item cuisine a déjà été démarré (started_at)
    sauf si force=true (admin override avec confirmation explicite).
    """
    try:
        existing = await db.caisse_tables.find_one({"id": table_id}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="Table non trouvée")
        # Protection : bon avec items démarrés en cuisine
        started_items = [
            it for it in (existing.get("items") or [])
            if it.get("started_at") and not it.get("ready_at") and not it.get("served_at")
        ]
        if started_items and not force:
            names = ", ".join((it.get("name") or "?") for it in started_items[:5])
            raise HTTPException(
                status_code=409,
                detail=f"Suppression bloquée : {len(started_items)} plat(s) en cours de préparation en cuisine ({names}). Utilisez force=true (admin) pour forcer.",
            )
        result = await db.caisse_tables.delete_one({"id": table_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Table non trouvée")
        # Only log explicit cancellations (manual close from UI)
        if (reason or "").lower() == "cancelled":
            try:
                from routers.invoices import _log_audit as _log_audit_fn
                await _log_audit_fn(
                    "table",
                    existing,
                    "delete",
                    {"name": actor_name, "role": actor_role},
                    None,
                )
            except Exception as _audit_err:
                logger.error(f"table audit failed: {_audit_err}")
        return {"success": True, "started_items_warned": len(started_items)}
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

# ============== PDF EXPORT ==============
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

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
            ['La Responsable Op. & Log:', '', "L'Administrateur:", ''],
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

# Expense models moved to routers/expenses.py

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
    unit_price: float = 0  # Allow 0 for label-only lines
    subtotal: float = 0
    department: str = "autres"
    is_label: bool = False  # True for label-only lines (section/note without price)
    preset_kind: Optional[str] = None  # 'equipment' | 'service' | None for preset items
    provided_status: Optional[str] = None  # 'fourni' | 'non_fourni' | None (only for preset items)

class ProformaInvoiceCreate(BaseModel):
    client_name: str
    client_phone: Optional[str] = ""
    client_email: Optional[str] = ""
    client_address: Optional[str] = ""
    client_ifu: Optional[str] = ""
    proforma_title: Optional[str] = ""  # Optional general title (reservation purpose)
    items: List[ProformaInvoiceItem]
    subtotal: float
    discount: float = 0
    tax: float = 0
    total: float
    notes: Optional[str] = ""
    validity_days: int = 30  # Validity period in days
    created_by: str = ""
    apply_tva: bool = True  # Option to apply/not apply TVA
    tva_exempt_mention: str = "exonere"  # 'exonere' | 'non_applicable' (shown when apply_tva=False)
    payment_mode: str = "total"  # 'total' = full payment | 'percent' = acompte
    payment_percentage: int = 50
    payment_methods: List[str] = Field(default_factory=lambda: ["especes", "virement", "mobile_money"])  # subset of: especes, cheque, virement, mobile_money

class ProformaInvoiceUpdate(BaseModel):
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    client_email: Optional[str] = None
    client_address: Optional[str] = None
    client_ifu: Optional[str] = None
    proforma_title: Optional[str] = None
    items: Optional[List[dict]] = None
    subtotal: Optional[float] = None
    discount: Optional[float] = None
    tax: Optional[float] = None
    total: Optional[float] = None
    notes: Optional[str] = None
    validity_days: Optional[int] = None
    status: Optional[str] = None  # draft, sent, accepted, rejected, converted
    apply_tva: Optional[bool] = None  # Option to apply/not apply TVA
    tva_exempt_mention: Optional[str] = None
    payment_mode: Optional[str] = None
    payment_percentage: Optional[int] = None
    payment_methods: Optional[List[str]] = None

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

@api_router.get("/reports/weekly/duplicates")
async def detect_weekly_duplicates(week_start: str):
    """Detect invoices/expenses appearing in multiple weeks"""
    from datetime import timedelta as td
    start = datetime.fromisoformat(week_start)
    end = start + td(days=6, hours=23, minutes=59, seconds=59)
    start_str = start.strftime("%Y-%m-%d")
    end_str = end.strftime("%Y-%m-%d") + "T23:59:59"
    
    # Get invoices for this week (by date OR assigned)
    invoices = await db.invoices.find({
        "$or": [
            {"validation_status": "validated", "created_at": {"$gte": start_str, "$lte": end_str + "Z"}},
            {"validation_status": "validated", "assigned_week": start_str}
        ]
    }, {"_id": 0, "id": 1, "invoice_number": 1, "total": 1, "created_at": 1, "assigned_week": 1}).to_list(2000)
    
    # Detect duplicates: invoices that appear in this week by date AND are assigned to another week
    duplicates = []
    for inv in invoices:
        inv_date = (inv.get("created_at") or "")[:10]
        assigned = inv.get("assigned_week")
        in_range = inv_date >= start_str and inv_date <= end_str[:10]
        
        if assigned and assigned != start_str and in_range:
            # This invoice's natural date is in this week but it's assigned to another week
            duplicates.append({
                "id": inv["id"],
                "type": "invoice",
                "invoice_number": inv.get("invoice_number", ""),
                "total": inv.get("total", 0),
                "created_at": inv.get("created_at", ""),
                "assigned_week": assigned,
                "issue": f"Date naturelle dans cette semaine mais assignee a la semaine du {assigned}"
            })
        elif assigned == start_str and not in_range:
            # Assigned here but date is outside - this is normal (intentional transfer), not a duplicate
            pass
    
    # Also check if any invoice appears assigned to 2+ weeks (data integrity)
    assigned_invs = await db.invoices.find({"assigned_week": {"$exists": True, "$ne": None}}, {"_id": 0, "id": 1, "invoice_number": 1, "total": 1, "created_at": 1, "assigned_week": 1}).to_list(5000)
    
    # Check for invoices whose natural date falls in a different week than assigned
    seen_ids = set()
    for inv in invoices:
        if inv["id"] in seen_ids:
            duplicates.append({
                "id": inv["id"],
                "type": "invoice",
                "invoice_number": inv.get("invoice_number", ""),
                "total": inv.get("total", 0),
                "created_at": inv.get("created_at", ""),
                "assigned_week": inv.get("assigned_week"),
                "issue": "Doublon detecte dans la meme semaine"
            })
        seen_ids.add(inv["id"])
    
    # Same for expenses (archivés exclus)
    expenses = await db.expenses.find({
        "archived": {"$ne": True},
        "$or": [
            {"created_at": {"$gte": start_str, "$lte": end_str}},
            {"assigned_week": start_str}
        ]
    }, {"_id": 0, "id": 1, "description": 1, "amount": 1, "created_at": 1, "assigned_week": 1}).to_list(1000)
    
    exp_seen = set()
    for exp in expenses:
        exp_date = (exp.get("created_at") or "")[:10]
        assigned = exp.get("assigned_week")
        in_range = exp_date >= start_str and exp_date <= end_str[:10]
        
        if assigned and assigned != start_str and in_range:
            duplicates.append({
                "id": exp["id"],
                "type": "expense",
                "description": exp.get("description", ""),
                "amount": exp.get("amount", 0),
                "created_at": exp.get("created_at", ""),
                "assigned_week": assigned,
                "issue": f"Date naturelle dans cette semaine mais assignee a la semaine du {assigned}"
            })
        if exp["id"] in exp_seen:
            duplicates.append({
                "id": exp["id"],
                "type": "expense",
                "description": exp.get("description", ""),
                "amount": exp.get("amount", 0),
                "issue": "Doublon detecte"
            })
        exp_seen.add(exp["id"])
    
    return {"duplicates": duplicates, "count": len(duplicates)}

# ============== MONSIEUR ORDERS (Owner's meal orders) ==============

@api_router.get("/monsieur-orders")
async def get_monsieur_orders(include_archived: bool = False):
    """Get all owner meal orders tracked by manager. By default excludes archived
    (orders that were unpaid when a financial point was signed → moved to admin-only view)."""
    try:
        q = {} if include_archived else {"archived_after_point": {"$ne": True}}
        orders = await db.monsieur_orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)

        total_unpaid = sum(o.get("total", 0) for o in orders if o.get("status") == "non_regle")
        total_paid = sum(o.get("total", 0) for o in orders if o.get("status") == "regle")

        return {
            "orders": orders,
            "stats": {
                "total_unpaid": total_unpaid,
                "total_paid": total_paid,
                "total": total_unpaid + total_paid,
                "count_unpaid": len([o for o in orders if o.get("status") == "non_regle"]),
                "count_paid": len([o for o in orders if o.get("status") == "regle"])
            }
        }
    except Exception as e:
        logger.error(f"Error fetching monsieur orders: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/monsieur-orders/archived")
async def get_archived_monsieur_orders():
    """Admin-only view of archived unpaid DG orders (moved here when a point was signed)."""
    try:
        orders = await db.monsieur_orders.find({"archived_after_point": True}, {"_id": 0}).sort("archived_at", -1).to_list(2000)
        return {
            "orders": orders,
            "stats": {
                "count": len(orders),
                "total": sum(o.get("total", 0) for o in orders if o.get("status") == "non_regle"),
                "count_unpaid": len([o for o in orders if o.get("status") == "non_regle"]),
                "count_paid": len([o for o in orders if o.get("status") == "regle"]),
            }
        }
    except Exception as e:
        logger.error(f"Error fetching archived monsieur orders: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/monsieur-orders/archive-for-point")
async def archive_monsieur_orders_for_point(
    point_id: str = Body(...),
    point_date: str = Body(...),         # YYYY-MM-DD (debut de la periode)
    end_date: Optional[str] = Body(None),  # YYYY-MM-DD (fin inclusif), defaut = point_date
):
    """Archive all NON-PAID DG orders dated within the period covered by a financial point.
    Idempotent: if an order is already archived, it stays archived (no double-archiving)."""
    try:
        if not point_id or not point_date:
            raise HTTPException(status_code=400, detail="point_id et point_date requis")
        end = end_date or point_date
        # On compare sur la date YYYY-MM-DD du created_at ISO (les 10 premiers chars)
        q = {
            "status": "non_regle",
            "archived_after_point": {"$ne": True},
            "$expr": {
                "$and": [
                    {"$gte": [{"$substr": ["$created_at", 0, 10]}, point_date]},
                    {"$lte": [{"$substr": ["$created_at", 0, 10]}, end]},
                ]
            },
        }
        now_iso = datetime.now(timezone.utc).isoformat()
        result = await db.monsieur_orders.update_many(
            q,
            {"$set": {
                "archived_after_point": True,
                "archived_point_id": point_id,
                "archived_at": now_iso,
            }}
        )
        logger.info(f"Archived {result.modified_count} unpaid DG orders for point {point_id} ({point_date} → {end})")
        return {"success": True, "archived_count": result.modified_count, "point_id": point_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error archiving DG orders for point: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/monsieur-orders/{order_id}/unarchive")
async def unarchive_monsieur_order(order_id: str):
    """Admin-only: send an archived DG order back to the active 'Mme la D.G.' tab
    (e.g. if the admin wants to settle it via the normal flow)."""
    try:
        order = await db.monsieur_orders.find_one({"id": order_id})
        if not order:
            raise HTTPException(status_code=404, detail="Commande introuvable")
        await db.monsieur_orders.update_one(
            {"id": order_id},
            {"$set": {"archived_after_point": False, "unarchived_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unarchiving DG order: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/monsieur-orders")
async def create_monsieur_order(
    items: list = Body(...),
    total: float = Body(...),
    notes: str = Body(None),
    created_by: str = Body(...)
):
    """Create a new owner meal order. Stock is deducted IMMEDIATELY (regardless of payment)."""
    try:
        order_id = str(uuid.uuid4())
        order = {
            "id": order_id,
            "items": items,
            "total": total,
            "notes": notes,
            "status": "non_regle",  # non_regle or regle
            "created_by": created_by,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "paid_at": None,
            "paid_by": None,
            "payment_method": None,
            "linked_invoice_id": None,
            "stock_deducted": True,  # marks the deduction as done at creation
        }

        # Deduct stock immediately for each linked caisse product
        now_iso = datetime.now(timezone.utc).isoformat()
        for it in items or []:
            cp_id = it.get("product_id") or it.get("id")
            qty = it.get("quantity", 1) or 1
            cp = None
            if cp_id:
                cp = await db.caisse_products.find_one({"id": cp_id})
            if not cp and it.get("name"):
                cp = await db.caisse_products.find_one({
                    "name": {"$regex": f"^{re.escape(it['name'])}$", "$options": "i"}
                })
            if not cp or cp.get("no_stock_tracking"):
                continue
            link_ids = cp.get("stock_links") or []
            if not link_ids and cp.get("stock_product_id"):
                link_ids = [cp["stock_product_id"]]
            if not link_ids:
                continue
            async for sp in db.stock_products.find({"id": {"$in": link_ids}, "is_active": True}, {"_id": 0}):
                old_qty = sp.get("quantity", 0)
                new_qty = max(0, old_qty - qty)
                smin = sp.get("stock_min", 5)
                new_statut = "rupture" if new_qty <= 0 else ("faible" if new_qty <= smin else "normal")
                new_valeur = new_qty * sp.get("purchase_price", 0)
                await db.stock_movements.insert_one({
                    "id": str(uuid.uuid4()),
                    "product_id": sp["id"],
                    "product_name": sp["name"],
                    "product_code": sp.get("code", ""),
                    "movement_type": "sortie",
                    "quantity": qty,
                    "previous_quantity": old_qty,
                    "new_quantity": new_qty,
                    "unit": sp.get("unit", ""),
                    "unit_price": sp.get("purchase_price", 0),
                    "total_value": qty * sp.get("purchase_price", 0),
                    "reason": f"Mme la Directrice Générale - Commande #{order_id[:8]} (stock auto)",
                    "user_name": created_by,
                    "monsieur_order_id": order_id,
                    "created_at": now_iso,
                })
                await db.stock_products.update_one(
                    {"id": sp["id"]},
                    {"$set": {"quantity": new_qty, "valeur_stock": new_valeur, "statut": new_statut, "updated_at": now_iso}}
                )

        await db.monsieur_orders.insert_one(order)
        if "_id" in order:
            del order["_id"]

        return {"success": True, "order": order}
    except Exception as e:
        logger.error(f"Error creating monsieur order: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/monsieur-orders/{order_id}")
async def update_monsieur_order(
    order_id: str,
    items: list = Body(None),
    total: float = Body(None),
    notes: str = Body(None),
    status: str = Body(None),
    paid_by: str = Body(None),
    payment_method: str = Body(None),
):
    """Update an owner meal order.
    On status='regle' transition: create a Caisse invoice (client_name='Manager General')
    with the chosen payment_method. Stock is NOT deducted again (already done at creation).
    On status='non_regle' transition (annul): mark the linked invoice as cancelled (status='cancelled')
    but keep it in the audit trail.
    """
    try:
        order = await db.monsieur_orders.find_one({"id": order_id})
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        update_data = {}
        if items is not None:
            update_data["items"] = items
        if total is not None:
            update_data["total"] = total
        if notes is not None:
            update_data["notes"] = notes

        # Handle paid -> unpaid (cancel linked invoice without touching stock)
        if status == "non_regle" and order.get("status") == "regle":
            inv_id = order.get("linked_invoice_id")
            if inv_id:
                await db.invoices.update_one(
                    {"id": inv_id},
                    {"$set": {
                        "validation_status": "cancelled",
                        "status": "cancelled",
                        "cancelled_at": datetime.now(timezone.utc).isoformat(),
                        "cancellation_reason": f"Annulation règlement Mme la Directrice Générale #{order_id[:8]}",
                    }}
                )
            update_data["status"] = "non_regle"
            update_data["paid_at"] = None
            update_data["paid_by"] = None
            update_data["payment_method"] = None
            update_data["linked_invoice_id"] = None

        # Handle unpaid -> paid (create a Caisse invoice mirror — stock NOT re-deducted)
        elif status == "regle" and order.get("status") != "regle":
            now_iso = datetime.now(timezone.utc).isoformat()
            today = datetime.now(timezone.utc).strftime("%Y%m%d")
            # Generate invoice number
            count_today = await db.invoices.count_documents({"invoice_number": {"$regex": f"^EM-{today}-"}})
            inv_number = f"EM-{today}-{count_today + 1:04d}"
            inv_id = str(uuid.uuid4())
            inv_items = []
            for it in (order.get("items") or []):
                inv_items.append({
                    "product_id": it.get("product_id") or it.get("id"),
                    "name": it.get("name", ""),
                    "price": it.get("price", 0),
                    "quantity": it.get("quantity", 1),
                    "subtotal": (it.get("price", 0) or 0) * (it.get("quantity", 1) or 1),
                    "department": it.get("department", "autres"),
                })
            invoice_doc = {
                "id": inv_id,
                "invoice_number": inv_number,
                "customer_name": "Mme la Directrice Générale",
                "client_name": "Mme la Directrice Générale",
                "items": inv_items,
                "subtotal": order.get("total", 0),
                "total": order.get("total", 0),
                "discount": 0,
                "tax": 0,
                "payment_method": payment_method or "especes",
                "status": "paid",
                "validation_status": "validated",
                "modification_allowed": False,
                "stock_deducted": True,  # already deducted at order creation
                "skip_stock_deduction": True,  # safeguard
                "monsieur_order_id": order_id,
                "created_by": paid_by or order.get("created_by", "admin"),
                "created_at": now_iso,
                "validated_at": now_iso,
            }
            await db.invoices.insert_one(invoice_doc)
            update_data["status"] = "regle"
            update_data["paid_at"] = now_iso
            update_data["paid_by"] = paid_by
            update_data["payment_method"] = payment_method or "especes"
            update_data["linked_invoice_id"] = inv_id
        elif status is not None:
            update_data["status"] = status

        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

        await db.monsieur_orders.update_one(
            {"id": order_id},
            {"$set": update_data}
        )

        updated = await db.monsieur_orders.find_one({"id": order_id}, {"_id": 0})
        return {"success": True, "order": updated}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating monsieur order: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/monsieur-orders/{order_id}")
async def delete_monsieur_order(order_id: str):
    """Delete an owner meal order"""
    try:
        result = await db.monsieur_orders.delete_one({"id": order_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Order not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting monsieur order: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============== MONSIEUR PURCHASES (Owner's unpaid invoices) ==============

@api_router.get("/monsieur-purchases")
async def get_monsieur_purchases():
    """Get all owner purchases tracked by manager"""
    try:
        purchases = await db.monsieur_purchases.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
        
        # Calculate totals
        total_unpaid = sum(p.get("amount", 0) for p in purchases if p.get("status") == "non_regle")
        total_paid = sum(p.get("amount", 0) for p in purchases if p.get("status") == "regle")
        
        return {
            "purchases": purchases,
            "stats": {
                "total_unpaid": total_unpaid,
                "total_paid": total_paid,
                "total": total_unpaid + total_paid,
                "count_unpaid": len([p for p in purchases if p.get("status") == "non_regle"]),
                "count_paid": len([p for p in purchases if p.get("status") == "regle"])
            }
        }
    except Exception as e:
        logger.error(f"Error fetching monsieur purchases: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/monsieur-purchases")
async def create_monsieur_purchase(
    description: str = Body(...),
    amount: float = Body(...),
    supplier: str = Body(None),
    invoice_number: str = Body(None),
    invoice_date: str = Body(None),
    notes: str = Body(None),
    created_by: str = Body(...)
):
    """Create a new owner purchase record"""
    try:
        purchase = {
            "id": str(uuid.uuid4()),
            "description": description,
            "amount": amount,
            "supplier": supplier,
            "invoice_number": invoice_number,
            "invoice_date": invoice_date,
            "notes": notes,
            "status": "non_regle",  # non_regle or regle
            "created_by": created_by,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "paid_at": None,
            "paid_by": None
        }
        
        await db.monsieur_purchases.insert_one(purchase)
        if "_id" in purchase:
            del purchase["_id"]
        
        return {"success": True, "purchase": purchase}
    except Exception as e:
        logger.error(f"Error creating monsieur purchase: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/monsieur-purchases/{purchase_id}")
async def update_monsieur_purchase(
    purchase_id: str,
    description: str = Body(None),
    amount: float = Body(None),
    supplier: str = Body(None),
    invoice_number: str = Body(None),
    invoice_date: str = Body(None),
    notes: str = Body(None),
    status: str = Body(None),
    paid_by: str = Body(None)
):
    """Update an owner purchase record"""
    try:
        purchase = await db.monsieur_purchases.find_one({"id": purchase_id})
        if not purchase:
            raise HTTPException(status_code=404, detail="Purchase not found")
        
        update_data = {}
        if description is not None:
            update_data["description"] = description
        if amount is not None:
            update_data["amount"] = amount
        if supplier is not None:
            update_data["supplier"] = supplier
        if invoice_number is not None:
            update_data["invoice_number"] = invoice_number
        if invoice_date is not None:
            update_data["invoice_date"] = invoice_date
        if notes is not None:
            update_data["notes"] = notes
        if status is not None:
            update_data["status"] = status
            if status == "regle":
                update_data["paid_at"] = datetime.now(timezone.utc).isoformat()
                update_data["paid_by"] = paid_by
            elif status == "non_regle":
                update_data["paid_at"] = None
                update_data["paid_by"] = None
        
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.monsieur_purchases.update_one(
            {"id": purchase_id},
            {"$set": update_data}
        )
        
        updated = await db.monsieur_purchases.find_one({"id": purchase_id}, {"_id": 0})
        return {"success": True, "purchase": updated}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating monsieur purchase: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/monsieur-purchases/{purchase_id}")
async def delete_monsieur_purchase(purchase_id: str):
    """Delete an owner purchase record"""
    try:
        result = await db.monsieur_purchases.delete_one({"id": purchase_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Purchase not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting monsieur purchase: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# EMPLOYEE ORDERS (Bons EMPLOYÉS — repas employés à crédit sur salaire)
# ============================================================================
# Workflow :
#   1. Responsable Op. & Log saisit la commande employé (nom + poste obligatoires)
#   2. Status = "pending_manager" — Responsable Op. & Log doit autoriser en 1er
#   3. Responsable Op. & Log autorise → status = "pending_director" — Directrice (admin) doit autoriser
#   4. Directrice autorise → status = "authorized" → STOCK décrémenté
#   5. Fin de mois → bouton "Clôturer le mois" → toutes les commandes "authorized"
#      du mois passent en "settled" (déduites du salaire). Génère un PDF récap.
# Règles :
#   - Remise fixe : 50% (total = subtotal × 0.5)
#   - Plafond mensuel : 10 000 F après remise par employé (compte toutes commandes
#     non annulées du mois calendaire)

EMPLOYEE_MONTHLY_CAP = 10000.0
EMPLOYEE_DISCOUNT_RATE = 0.50  # 50%

def _employee_month_key(dt: Optional[datetime] = None) -> str:
    d = dt or datetime.now(timezone.utc)
    return d.strftime("%Y-%m")

async def _employee_month_used(employee_name: str, month_key: str, exclude_id: Optional[str] = None) -> float:
    """Sum of total (after discount) for all non-cancelled orders of this employee for the given month."""
    q = {
        "employee_name": employee_name,
        "month_period": month_key,
        "status": {"$ne": "cancelled"},
    }
    if exclude_id:
        q["id"] = {"$ne": exclude_id}
    used = 0.0
    async for o in db.employee_orders.find(q, {"_id": 0, "total": 1}):
        used += float(o.get("total", 0) or 0)
    return used


@api_router.get("/employee-orders")
async def get_employee_orders(
    month: Optional[str] = None,           # YYYY-MM
    employee_name: Optional[str] = None,
    status: Optional[str] = None,
):
    try:
        q = {}
        if month:
            q["month_period"] = month
        if employee_name:
            q["employee_name"] = employee_name
        if status:
            q["status"] = status
        orders = await db.employee_orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)

        # Stats globales
        stats = {
            "count_pending_manager": sum(1 for o in orders if o.get("status") == "pending_manager"),
            "count_pending_director": sum(1 for o in orders if o.get("status") == "pending_director"),
            "count_authorized": sum(1 for o in orders if o.get("status") == "authorized"),
            "count_settled": sum(1 for o in orders if o.get("status") == "settled"),
            "total_pending": sum(o.get("total", 0) for o in orders if o.get("status") in ("pending_manager", "pending_director")),
            "total_authorized": sum(o.get("total", 0) for o in orders if o.get("status") == "authorized"),
            "total_settled": sum(o.get("total", 0) for o in orders if o.get("status") == "settled"),
        }
        return {"orders": orders, "stats": stats}
    except Exception as e:
        logger.error(f"Error fetching employee orders: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/employee-orders/cap-status")
async def get_employee_cap_status(employee_name: str, month: Optional[str] = None):
    """Return monthly cap usage for a given employee."""
    try:
        if not employee_name or not employee_name.strip():
            raise HTTPException(status_code=400, detail="employee_name requis")
        month_key = month or _employee_month_key()
        used = await _employee_month_used(employee_name.strip(), month_key)
        return {
            "employee_name": employee_name.strip(),
            "month": month_key,
            "max": EMPLOYEE_MONTHLY_CAP,
            "used": round(used, 2),
            "remaining": round(EMPLOYEE_MONTHLY_CAP - used, 2),
            "is_capped": used >= EMPLOYEE_MONTHLY_CAP,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching employee cap status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/employee-orders")
async def create_employee_order(
    employee_name: str = Body(...),
    employee_position: str = Body(...),
    items: list = Body(...),
    notes: str = Body(""),
    created_by: str = Body(...),
):
    """Create an employee order. Validates monthly cap. Stock NOT yet deducted (waits for both authorizations)."""
    try:
        # Validations
        if not employee_name or not employee_name.strip():
            raise HTTPException(status_code=400, detail="Le nom de l'employé est obligatoire")
        if not employee_position or not employee_position.strip():
            raise HTTPException(status_code=400, detail="Le poste de l'employé est obligatoire")
        if not items or not isinstance(items, list) or len(items) == 0:
            raise HTTPException(status_code=400, detail="Au moins un article est requis")

        # Compute amounts
        subtotal = 0.0
        for it in items:
            qty = float(it.get("quantity", 0) or 0)
            price = float(it.get("price", 0) or 0)
            subtotal += qty * price
        if subtotal <= 0:
            raise HTTPException(status_code=400, detail="Le sous-total doit être supérieur à 0")
        discount_amount = round(subtotal * EMPLOYEE_DISCOUNT_RATE, 2)
        total_after_discount = round(subtotal - discount_amount, 2)

        # Plafond mensuel — toutes commandes non annulées du mois
        month_key = _employee_month_key()
        used = await _employee_month_used(employee_name.strip(), month_key)
        if used + total_after_discount > EMPLOYEE_MONTHLY_CAP + 0.01:  # tolérance flottante
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Plafond mensuel dépassé. Déjà utilisé : {used:.0f} F. "
                    f"Cette commande : {total_after_discount:.0f} F. "
                    f"Maximum : {int(EMPLOYEE_MONTHLY_CAP)} F après remise."
                ),
            )

        order_id = str(uuid.uuid4())
        now_iso = datetime.now(timezone.utc).isoformat()
        order = {
            "id": order_id,
            "employee_name": employee_name.strip(),
            "employee_position": employee_position.strip(),
            "items": items,
            "subtotal": round(subtotal, 2),
            "discount_rate": int(EMPLOYEE_DISCOUNT_RATE * 100),
            "discount_amount": discount_amount,
            "total": total_after_discount,  # montant qui sera retenu sur le salaire
            "month_period": month_key,
            "status": "pending_manager",  # Responsable Op. & Log doit autoriser en 1er
            "authorizations": {"manager": None, "director": None},
            "stock_deducted": False,
            "notes": notes or "",
            "created_by": created_by,
            "created_at": now_iso,
            "updated_at": now_iso,
            "settled_at": None,
            "settlement_batch_id": None,
        }
        await db.employee_orders.insert_one(order)
        if "_id" in order:
            del order["_id"]
        return {"success": True, "order": order}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating employee order: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.put("/employee-orders/{order_id}")
async def update_employee_order(
    order_id: str,
    employee_name: Optional[str] = Body(None),
    employee_position: Optional[str] = Body(None),
    items: Optional[list] = Body(None),
    notes: Optional[str] = Body(None),
):
    """Edit an employee order. Only allowed while status == 'pending_manager' (before any authorization)."""
    try:
        order = await db.employee_orders.find_one({"id": order_id})
        if not order:
            raise HTTPException(status_code=404, detail="Commande introuvable")
        if order.get("status") != "pending_manager":
            raise HTTPException(status_code=423, detail="Cette commande ne peut plus être modifiée (déjà engagée dans le workflow d'autorisation)")

        update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
        if employee_name is not None:
            if not employee_name.strip():
                raise HTTPException(status_code=400, detail="Le nom de l'employé est obligatoire")
            update_data["employee_name"] = employee_name.strip()
        if employee_position is not None:
            if not employee_position.strip():
                raise HTTPException(status_code=400, detail="Le poste de l'employé est obligatoire")
            update_data["employee_position"] = employee_position.strip()
        if notes is not None:
            update_data["notes"] = notes
        if items is not None:
            if not items or len(items) == 0:
                raise HTTPException(status_code=400, detail="Au moins un article est requis")
            subtotal = sum(float(it.get("quantity", 0) or 0) * float(it.get("price", 0) or 0) for it in items)
            if subtotal <= 0:
                raise HTTPException(status_code=400, detail="Le sous-total doit être supérieur à 0")
            discount_amount = round(subtotal * EMPLOYEE_DISCOUNT_RATE, 2)
            total_after_discount = round(subtotal - discount_amount, 2)
            # Re-check cap (excluding this order)
            target_employee = update_data.get("employee_name") or order.get("employee_name")
            month_key = order.get("month_period") or _employee_month_key()
            used_excl = await _employee_month_used(target_employee, month_key, exclude_id=order_id)
            if used_excl + total_after_discount > EMPLOYEE_MONTHLY_CAP + 0.01:
                raise HTTPException(
                    status_code=400,
                    detail=(f"Plafond mensuel dépassé. Déjà utilisé (hors cette commande) : {used_excl:.0f} F. "
                            f"Modification : {total_after_discount:.0f} F. Maximum : {int(EMPLOYEE_MONTHLY_CAP)} F."),
                )
            update_data["items"] = items
            update_data["subtotal"] = round(subtotal, 2)
            update_data["discount_amount"] = discount_amount
            update_data["total"] = total_after_discount

        await db.employee_orders.update_one({"id": order_id}, {"$set": update_data})
        updated = await db.employee_orders.find_one({"id": order_id}, {"_id": 0})
        return {"success": True, "order": updated}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating employee order: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.put("/employee-orders/{order_id}/authorize")
async def authorize_employee_order(
    order_id: str,
    by_role: str = Body(...),       # "manager" or "director"
    signer_name: str = Body(...),
):
    """Sequential authorization. Manager FIRST, then Director.
    Stock is deducted only when the second authorization (director) is given."""
    try:
        order = await db.employee_orders.find_one({"id": order_id})
        if not order:
            raise HTTPException(status_code=404, detail="Commande introuvable")
        role = (by_role or "").strip().lower()
        if role not in ("manager", "director"):
            raise HTTPException(status_code=400, detail="by_role doit être 'manager' ou 'director'")
        if not signer_name or not signer_name.strip():
            raise HTTPException(status_code=400, detail="signer_name requis")

        current_status = order.get("status")
        now_iso = datetime.now(timezone.utc).isoformat()
        auths = order.get("authorizations") or {"manager": None, "director": None}

        if role == "manager":
            if current_status != "pending_manager":
                raise HTTPException(status_code=409, detail="Autorisation Responsable Op. & Log déjà donnée ou commande à un autre stade")
            auths["manager"] = {"name": signer_name.strip(), "at": now_iso}
            new_status = "pending_director"
        else:  # director
            if current_status != "pending_director":
                raise HTTPException(status_code=409, detail="La Responsable Op. & Log doit autoriser AVANT la Directrice Générale")
            auths["director"] = {"name": signer_name.strip(), "at": now_iso}
            new_status = "authorized"

        update = {"authorizations": auths, "status": new_status, "updated_at": now_iso}

        # Si on vient de passer en "authorized", on déduit le stock maintenant.
        if new_status == "authorized" and not order.get("stock_deducted"):
            for it in order.get("items", []) or []:
                cp_id = it.get("product_id") or it.get("id")
                qty = float(it.get("quantity", 1) or 1)
                cp = None
                if cp_id:
                    cp = await db.caisse_products.find_one({"id": cp_id})
                if not cp and it.get("name"):
                    cp = await db.caisse_products.find_one({
                        "name": {"$regex": f"^{re.escape(it['name'])}$", "$options": "i"}
                    })
                if not cp or cp.get("no_stock_tracking"):
                    continue
                link_ids = cp.get("stock_links") or []
                if not link_ids and cp.get("stock_product_id"):
                    link_ids = [cp["stock_product_id"]]
                if not link_ids:
                    continue
                async for sp in db.stock_products.find({"id": {"$in": link_ids}, "is_active": True}, {"_id": 0}):
                    old_qty = sp.get("quantity", 0)
                    new_qty = max(0, old_qty - qty)
                    smin = sp.get("stock_min", 5)
                    new_statut = "rupture" if new_qty <= 0 else ("faible" if new_qty <= smin else "normal")
                    new_valeur = new_qty * sp.get("purchase_price", 0)
                    await db.stock_movements.insert_one({
                        "id": str(uuid.uuid4()),
                        "product_id": sp["id"],
                        "product_name": sp["name"],
                        "product_code": sp.get("code", ""),
                        "movement_type": "sortie",
                        "quantity": qty,
                        "previous_quantity": old_qty,
                        "new_quantity": new_qty,
                        "unit": sp.get("unit", ""),
                        "unit_price": sp.get("purchase_price", 0),
                        "total_value": qty * sp.get("purchase_price", 0),
                        "reason": f"Bon EMPLOYÉ {order.get('employee_name')} - #{order_id[:8]} (autorisé)",
                        "user_name": signer_name.strip(),
                        "employee_order_id": order_id,
                        "created_at": now_iso,
                    })
                    await db.stock_products.update_one(
                        {"id": sp["id"]},
                        {"$set": {"quantity": new_qty, "valeur_stock": new_valeur, "statut": new_statut, "updated_at": now_iso}},
                    )
            update["stock_deducted"] = True

        await db.employee_orders.update_one({"id": order_id}, {"$set": update})
        updated = await db.employee_orders.find_one({"id": order_id}, {"_id": 0})
        return {"success": True, "order": updated}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error authorizing employee order: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/employee-orders/{order_id}")
async def delete_employee_order(order_id: str, by_role: str = "admin"):
    """Cancel/delete an employee order. If stock was deducted, the order is just marked 'cancelled'
    (audit trail) — stock is not automatically restored (ops must do it manually if needed)."""
    try:
        order = await db.employee_orders.find_one({"id": order_id})
        if not order:
            raise HTTPException(status_code=404, detail="Commande introuvable")
        if order.get("status") == "settled":
            raise HTTPException(status_code=423, detail="Commande déjà clôturée (réglée sur salaire)")
        if order.get("stock_deducted"):
            await db.employee_orders.update_one(
                {"id": order_id},
                {"$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc).isoformat()}},
            )
        else:
            await db.employee_orders.delete_one({"id": order_id})
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting employee order: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/employee-orders/close-month")
async def close_employee_month(month: str = Body(...), closed_by: str = Body(...)):
    """Bulk-settle all 'authorized' employee orders for a given month (YYYY-MM)."""
    try:
        if not month or len(month) != 7:
            raise HTTPException(status_code=400, detail="month doit être au format YYYY-MM")
        batch_id = str(uuid.uuid4())
        now_iso = datetime.now(timezone.utc).isoformat()
        cursor = db.employee_orders.find(
            {"month_period": month, "status": "authorized"}, {"_id": 0}
        )
        affected = []
        async for o in cursor:
            affected.append(o)

        if not affected:
            return {"success": True, "settled_count": 0, "by_employee": [], "batch_id": None, "message": "Aucune commande autorisée à clôturer pour ce mois"}

        await db.employee_orders.update_many(
            {"month_period": month, "status": "authorized"},
            {"$set": {"status": "settled", "settled_at": now_iso, "settlement_batch_id": batch_id}},
        )

        # Récap par employé
        by_emp = {}
        for o in affected:
            key = o.get("employee_name", "?")
            if key not in by_emp:
                by_emp[key] = {
                    "employee_name": key,
                    "employee_position": o.get("employee_position", ""),
                    "count": 0,
                    "total_subtotal": 0,
                    "total_after_discount": 0,
                }
            by_emp[key]["count"] += 1
            by_emp[key]["total_subtotal"] += float(o.get("subtotal", 0) or 0)
            by_emp[key]["total_after_discount"] += float(o.get("total", 0) or 0)
        by_employee = sorted(by_emp.values(), key=lambda x: x["employee_name"])

        # Trace
        await db.employee_settlements.insert_one({
            "id": batch_id,
            "month": month,
            "closed_at": now_iso,
            "closed_by": closed_by,
            "settled_count": len(affected),
            "total_amount": round(sum(o.get("total", 0) for o in affected), 2),
            "by_employee": by_employee,
        })

        return {
            "success": True,
            "settled_count": len(affected),
            "total_amount": round(sum(o.get("total", 0) for o in affected), 2),
            "by_employee": by_employee,
            "batch_id": batch_id,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error closing employee month: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/employee-orders/closure-pdf")
async def get_employee_closure_pdf(month: str):
    """Generate an HTML/PDF summary of the month's settled employee orders, grouped by employee."""
    try:
        from fastapi.responses import HTMLResponse
        if not month or len(month) != 7:
            raise HTTPException(status_code=400, detail="month doit être au format YYYY-MM")
        orders = await db.employee_orders.find(
            {"month_period": month, "status": "settled"}, {"_id": 0}
        ).sort("employee_name", 1).to_list(2000)
        # Regrouper par employé
        by_emp = {}
        for o in orders:
            key = o.get("employee_name", "?")
            if key not in by_emp:
                by_emp[key] = {"position": o.get("employee_position", ""), "orders": []}
            by_emp[key]["orders"].append(o)

        # HTML simple imprimable (le client peut faire Ctrl+P → PDF)
        rows_html = ""
        grand_total = 0.0
        for emp_name in sorted(by_emp.keys()):
            data = by_emp[emp_name]
            emp_total = sum(float(o.get("total", 0)) for o in data["orders"])
            grand_total += emp_total
            rows_html += f"""
                <tr class="emp-header"><td colspan="4"><strong>{emp_name}</strong> — <em>{data['position']}</em></td></tr>
            """
            for o in data["orders"]:
                items_str = ", ".join(f"{it.get('quantity', 1)}× {it.get('name', '')}" for it in (o.get("items") or []))
                rows_html += f"""
                <tr>
                    <td>{o.get('created_at', '')[:10]}</td>
                    <td>{items_str}</td>
                    <td class="num">{o.get('subtotal', 0):,.0f} F</td>
                    <td class="num">{o.get('total', 0):,.0f} F</td>
                </tr>
                """
            rows_html += f"""
                <tr class="emp-total"><td colspan="3"><strong>Total {emp_name}</strong></td>
                <td class="num"><strong>{emp_total:,.0f} F</strong></td></tr>
            """

        html = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>Clôture EMPLOYÉS - {month}</title>
        <style>
            body {{ font-family: Arial, sans-serif; padding: 30px; color: #222; }}
            h1 {{ color: #6d28d9; border-bottom: 2px solid #6d28d9; padding-bottom: 8px; }}
            .meta {{ color: #555; font-size: 14px; margin-bottom: 20px; }}
            table {{ width: 100%; border-collapse: collapse; }}
            th {{ background: #f3f0ff; color: #6d28d9; padding: 8px; text-align: left; border-bottom: 2px solid #6d28d9; }}
            td {{ padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }}
            .num {{ text-align: right; }}
            .emp-header td {{ background: #ede9fe; }}
            .emp-total td {{ background: #f9f5ff; font-weight: bold; }}
            .grand {{ margin-top: 20px; padding: 12px; background: #6d28d9; color: white; border-radius: 6px; font-size: 18px; text-align: right; }}
            .footer {{ margin-top: 30px; font-size: 12px; color: #777; border-top: 1px dashed #ccc; padding-top: 10px; }}
        </style></head><body>
            <h1>Clôture mensuelle — Bons EMPLOYÉS</h1>
            <p class="meta">Mois : <strong>{month}</strong> · Généré le {datetime.now(timezone.utc).strftime('%d/%m/%Y à %H:%M')}</p>
            <table>
                <thead><tr><th>Date</th><th>Articles</th><th class="num">Sous-total</th><th class="num">À retenir (-50%)</th></tr></thead>
                <tbody>{rows_html or '<tr><td colspan="4" style="text-align:center;color:#999;padding:20px">Aucune commande clôturée pour ce mois</td></tr>'}</tbody>
            </table>
            <div class="grand">Total à retenir sur les salaires : <strong>{grand_total:,.0f} F</strong></div>
            <p class="footer">Ce document récapitule les bons EMPLOYÉS clôturés (déduits sur salaire). Espace Maxo.</p>
        </body></html>"""
        return HTMLResponse(content=html)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating closure PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# MANAGER ORDERS (Bons RESPONSABLE OP. & LOG — repas responsable op. & log à crédit sur salaire)
# ============================================================================
# Même workflow que les bons EMPLOYÉS, plafond mensuel = 25 000 F (après remise 50%).
# Collection MongoDB : `manager_orders`. Endpoints sous /api/manager-orders.

MANAGER_MONTHLY_CAP = 25000.0
MANAGER_DISCOUNT_RATE = 0.50

async def _manager_month_used(employee_name: str, month_key: str, exclude_id: Optional[str] = None) -> float:
    q = {"employee_name": employee_name, "month_period": month_key, "status": {"$ne": "cancelled"}}
    if exclude_id:
        q["id"] = {"$ne": exclude_id}
    used = 0.0
    async for o in db.manager_orders.find(q, {"_id": 0, "total": 1}):
        used += float(o.get("total", 0) or 0)
    return used


@api_router.get("/manager-orders")
async def get_manager_orders(month: Optional[str] = None, employee_name: Optional[str] = None, status: Optional[str] = None):
    try:
        q = {}
        if month: q["month_period"] = month
        if employee_name: q["employee_name"] = employee_name
        if status: q["status"] = status
        orders = await db.manager_orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
        stats = {
            "count_pending_manager": sum(1 for o in orders if o.get("status") == "pending_manager"),
            "count_pending_director": sum(1 for o in orders if o.get("status") == "pending_director"),
            "count_authorized": sum(1 for o in orders if o.get("status") == "authorized"),
            "count_settled": sum(1 for o in orders if o.get("status") == "settled"),
            "total_pending": sum(o.get("total", 0) for o in orders if o.get("status") in ("pending_manager", "pending_director")),
            "total_authorized": sum(o.get("total", 0) for o in orders if o.get("status") == "authorized"),
            "total_settled": sum(o.get("total", 0) for o in orders if o.get("status") == "settled"),
        }
        return {"orders": orders, "stats": stats}
    except Exception as e:
        logger.error(f"Error fetching manager orders: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/manager-orders/cap-status")
async def get_manager_cap_status(employee_name: str, month: Optional[str] = None):
    try:
        if not employee_name or not employee_name.strip():
            raise HTTPException(status_code=400, detail="employee_name requis")
        month_key = month or _employee_month_key()
        used = await _manager_month_used(employee_name.strip(), month_key)
        return {
            "employee_name": employee_name.strip(),
            "month": month_key,
            "max": MANAGER_MONTHLY_CAP,
            "used": round(used, 2),
            "remaining": round(MANAGER_MONTHLY_CAP - used, 2),
            "is_capped": used >= MANAGER_MONTHLY_CAP,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching manager cap status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/manager-orders")
async def create_manager_order(
    employee_name: str = Body(...),
    employee_position: str = Body("Responsable Op. & Log"),
    items: list = Body(...),
    notes: str = Body(""),
    created_by: str = Body(...),
):
    try:
        if not employee_name or not employee_name.strip():
            raise HTTPException(status_code=400, detail="Le nom de la responsable op. & log est obligatoire")
        if not items or len(items) == 0:
            raise HTTPException(status_code=400, detail="Au moins un article est requis")

        subtotal = 0.0
        for it in items:
            qty = float(it.get("quantity", 0) or 0)
            price = float(it.get("price", 0) or 0)
            subtotal += qty * price
        if subtotal <= 0:
            raise HTTPException(status_code=400, detail="Le sous-total doit être supérieur à 0")
        discount_amount = round(subtotal * MANAGER_DISCOUNT_RATE, 2)
        total_after_discount = round(subtotal - discount_amount, 2)

        month_key = _employee_month_key()
        used = await _manager_month_used(employee_name.strip(), month_key)
        if used + total_after_discount > MANAGER_MONTHLY_CAP + 0.01:
            raise HTTPException(
                status_code=400,
                detail=(f"Plafond mensuel dépassé. Déjà utilisé : {used:.0f} F. "
                        f"Cette commande : {total_after_discount:.0f} F. "
                        f"Maximum : {int(MANAGER_MONTHLY_CAP)} F après remise."),
            )

        order_id = str(uuid.uuid4())
        now_iso = datetime.now(timezone.utc).isoformat()
        order = {
            "id": order_id,
            "employee_name": employee_name.strip(),
            "employee_position": (employee_position or "Responsable Op. & Log").strip(),
            "items": items,
            "subtotal": round(subtotal, 2),
            "discount_rate": int(MANAGER_DISCOUNT_RATE * 100),
            "discount_amount": discount_amount,
            "total": total_after_discount,
            "month_period": month_key,
            "status": "pending_manager",
            "authorizations": {"manager": None, "director": None},
            "stock_deducted": False,
            "notes": notes or "",
            "created_by": created_by,
            "created_at": now_iso,
            "updated_at": now_iso,
            "settled_at": None,
            "settlement_batch_id": None,
        }
        await db.manager_orders.insert_one(order)
        if "_id" in order:
            del order["_id"]
        return {"success": True, "order": order}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating manager order: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.put("/manager-orders/{order_id}")
async def update_manager_order(
    order_id: str,
    employee_name: Optional[str] = Body(None),
    employee_position: Optional[str] = Body(None),
    items: Optional[list] = Body(None),
    notes: Optional[str] = Body(None),
):
    try:
        order = await db.manager_orders.find_one({"id": order_id})
        if not order:
            raise HTTPException(status_code=404, detail="Commande introuvable")
        if order.get("status") != "pending_manager":
            raise HTTPException(status_code=423, detail="Cette commande ne peut plus être modifiée")
        update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
        if employee_name is not None:
            if not employee_name.strip():
                raise HTTPException(status_code=400, detail="Le nom est obligatoire")
            update_data["employee_name"] = employee_name.strip()
        if employee_position is not None and employee_position.strip():
            update_data["employee_position"] = employee_position.strip()
        if notes is not None:
            update_data["notes"] = notes
        if items is not None:
            if not items or len(items) == 0:
                raise HTTPException(status_code=400, detail="Au moins un article est requis")
            subtotal = sum(float(it.get("quantity", 0) or 0) * float(it.get("price", 0) or 0) for it in items)
            if subtotal <= 0:
                raise HTTPException(status_code=400, detail="Le sous-total doit être supérieur à 0")
            discount_amount = round(subtotal * MANAGER_DISCOUNT_RATE, 2)
            total_after_discount = round(subtotal - discount_amount, 2)
            target = update_data.get("employee_name") or order.get("employee_name")
            month_key = order.get("month_period") or _employee_month_key()
            used_excl = await _manager_month_used(target, month_key, exclude_id=order_id)
            if used_excl + total_after_discount > MANAGER_MONTHLY_CAP + 0.01:
                raise HTTPException(status_code=400, detail=(f"Plafond mensuel dépassé. Déjà utilisé (hors cette commande) : {used_excl:.0f} F. Modification : {total_after_discount:.0f} F. Maximum : {int(MANAGER_MONTHLY_CAP)} F."))
            update_data["items"] = items
            update_data["subtotal"] = round(subtotal, 2)
            update_data["discount_amount"] = discount_amount
            update_data["total"] = total_after_discount
        await db.manager_orders.update_one({"id": order_id}, {"$set": update_data})
        updated = await db.manager_orders.find_one({"id": order_id}, {"_id": 0})
        return {"success": True, "order": updated}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating manager order: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.put("/manager-orders/{order_id}/authorize")
async def authorize_manager_order(
    order_id: str,
    by_role: str = Body(...),
    signer_name: str = Body(...),
):
    """Sequential authorization. Manager (Responsable Op. & Log self-confirms) FIRST, then Director.
    Stock is deducted only when the second authorization (director) is given."""
    try:
        order = await db.manager_orders.find_one({"id": order_id})
        if not order:
            raise HTTPException(status_code=404, detail="Commande introuvable")
        role = (by_role or "").strip().lower()
        if role not in ("manager", "director"):
            raise HTTPException(status_code=400, detail="by_role doit être 'manager' ou 'director'")
        if not signer_name or not signer_name.strip():
            raise HTTPException(status_code=400, detail="signer_name requis")
        current_status = order.get("status")
        now_iso = datetime.now(timezone.utc).isoformat()
        auths = order.get("authorizations") or {"manager": None, "director": None}
        if role == "manager":
            if current_status != "pending_manager":
                raise HTTPException(status_code=409, detail="Auto-confirmation Responsable Op. & Log déjà donnée ou commande à un autre stade")
            auths["manager"] = {"name": signer_name.strip(), "at": now_iso}
            new_status = "pending_director"
        else:
            if current_status != "pending_director":
                raise HTTPException(status_code=409, detail="La Responsable Op. & Log doit confirmer AVANT la Directrice Générale")
            auths["director"] = {"name": signer_name.strip(), "at": now_iso}
            new_status = "authorized"
        update = {"authorizations": auths, "status": new_status, "updated_at": now_iso}
        if new_status == "authorized" and not order.get("stock_deducted"):
            for it in order.get("items", []) or []:
                cp_id = it.get("product_id") or it.get("id")
                qty = float(it.get("quantity", 1) or 1)
                cp = None
                if cp_id:
                    cp = await db.caisse_products.find_one({"id": cp_id})
                if not cp and it.get("name"):
                    cp = await db.caisse_products.find_one({"name": {"$regex": f"^{re.escape(it['name'])}$", "$options": "i"}})
                if not cp or cp.get("no_stock_tracking"):
                    continue
                link_ids = cp.get("stock_links") or []
                if not link_ids and cp.get("stock_product_id"):
                    link_ids = [cp["stock_product_id"]]
                if not link_ids:
                    continue
                async for sp in db.stock_products.find({"id": {"$in": link_ids}, "is_active": True}, {"_id": 0}):
                    old_qty = sp.get("quantity", 0)
                    new_qty = max(0, old_qty - qty)
                    smin = sp.get("stock_min", 5)
                    new_statut = "rupture" if new_qty <= 0 else ("faible" if new_qty <= smin else "normal")
                    new_valeur = new_qty * sp.get("purchase_price", 0)
                    await db.stock_movements.insert_one({
                        "id": str(uuid.uuid4()),
                        "product_id": sp["id"], "product_name": sp["name"], "product_code": sp.get("code", ""),
                        "movement_type": "sortie", "quantity": qty,
                        "previous_quantity": old_qty, "new_quantity": new_qty,
                        "unit": sp.get("unit", ""), "unit_price": sp.get("purchase_price", 0),
                        "total_value": qty * sp.get("purchase_price", 0),
                        "reason": f"Bon RESPONSABLE OP. & LOG {order.get('employee_name')} - #{order_id[:8]} (autorisé)",
                        "user_name": signer_name.strip(),
                        "manager_order_id": order_id,
                        "created_at": now_iso,
                    })
                    await db.stock_products.update_one(
                        {"id": sp["id"]},
                        {"$set": {"quantity": new_qty, "valeur_stock": new_valeur, "statut": new_statut, "updated_at": now_iso}},
                    )
            update["stock_deducted"] = True
        await db.manager_orders.update_one({"id": order_id}, {"$set": update})
        updated = await db.manager_orders.find_one({"id": order_id}, {"_id": 0})
        return {"success": True, "order": updated}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error authorizing manager order: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/manager-orders/{order_id}")
async def delete_manager_order(order_id: str, by_role: str = "admin"):
    try:
        order = await db.manager_orders.find_one({"id": order_id})
        if not order:
            raise HTTPException(status_code=404, detail="Commande introuvable")
        if order.get("status") == "settled":
            raise HTTPException(status_code=423, detail="Commande déjà clôturée")
        if order.get("stock_deducted"):
            await db.manager_orders.update_one(
                {"id": order_id},
                {"$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc).isoformat()}},
            )
        else:
            await db.manager_orders.delete_one({"id": order_id})
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting manager order: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/manager-orders/close-month")
async def close_manager_month(month: str = Body(...), closed_by: str = Body(...)):
    try:
        if not month or len(month) != 7:
            raise HTTPException(status_code=400, detail="month doit être au format YYYY-MM")
        batch_id = str(uuid.uuid4())
        now_iso = datetime.now(timezone.utc).isoformat()
        affected = []
        async for o in db.manager_orders.find({"month_period": month, "status": "authorized"}, {"_id": 0}):
            affected.append(o)
        if not affected:
            return {"success": True, "settled_count": 0, "by_employee": [], "batch_id": None, "message": "Aucune commande autorisée à clôturer"}
        await db.manager_orders.update_many(
            {"month_period": month, "status": "authorized"},
            {"$set": {"status": "settled", "settled_at": now_iso, "settlement_batch_id": batch_id}},
        )
        by_emp = {}
        for o in affected:
            key = o.get("employee_name", "?")
            if key not in by_emp:
                by_emp[key] = {"employee_name": key, "employee_position": o.get("employee_position", ""), "count": 0, "total_subtotal": 0, "total_after_discount": 0}
            by_emp[key]["count"] += 1
            by_emp[key]["total_subtotal"] += float(o.get("subtotal", 0) or 0)
            by_emp[key]["total_after_discount"] += float(o.get("total", 0) or 0)
        by_employee = sorted(by_emp.values(), key=lambda x: x["employee_name"])
        await db.manager_settlements.insert_one({
            "id": batch_id, "month": month, "closed_at": now_iso, "closed_by": closed_by,
            "settled_count": len(affected),
            "total_amount": round(sum(o.get("total", 0) for o in affected), 2),
            "by_employee": by_employee,
        })
        return {
            "success": True, "settled_count": len(affected),
            "total_amount": round(sum(o.get("total", 0) for o in affected), 2),
            "by_employee": by_employee, "batch_id": batch_id,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error closing manager month: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/manager-orders/closure-pdf")
async def get_manager_closure_pdf(month: str):
    try:
        from fastapi.responses import HTMLResponse
        if not month or len(month) != 7:
            raise HTTPException(status_code=400, detail="month doit être au format YYYY-MM")
        orders = await db.manager_orders.find({"month_period": month, "status": "settled"}, {"_id": 0}).sort("employee_name", 1).to_list(2000)
        by_emp = {}
        for o in orders:
            key = o.get("employee_name", "?")
            if key not in by_emp:
                by_emp[key] = {"position": o.get("employee_position", ""), "orders": []}
            by_emp[key]["orders"].append(o)
        rows_html = ""
        grand_total = 0.0
        for emp_name in sorted(by_emp.keys()):
            data = by_emp[emp_name]
            emp_total = sum(float(o.get("total", 0)) for o in data["orders"])
            grand_total += emp_total
            rows_html += f"""<tr class="emp-header"><td colspan="4"><strong>{emp_name}</strong> — <em>{data['position']}</em></td></tr>"""
            for o in data["orders"]:
                items_str = ", ".join(f"{it.get('quantity', 1)}× {it.get('name', '')}" for it in (o.get("items") or []))
                rows_html += f"""<tr><td>{o.get('created_at', '')[:10]}</td><td>{items_str}</td><td class="num">{o.get('subtotal', 0):,.0f} F</td><td class="num">{o.get('total', 0):,.0f} F</td></tr>"""
            rows_html += f"""<tr class="emp-total"><td colspan="3"><strong>Total {emp_name}</strong></td><td class="num"><strong>{emp_total:,.0f} F</strong></td></tr>"""
        html = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>Clôture RESPONSABLE OP. & LOG - {month}</title>
        <style>
            body {{ font-family: Arial, sans-serif; padding: 30px; color: #222; }}
            h1 {{ color: #7c3aed; border-bottom: 2px solid #7c3aed; padding-bottom: 8px; }}
            .meta {{ color: #555; font-size: 14px; margin-bottom: 20px; }}
            table {{ width: 100%; border-collapse: collapse; }}
            th {{ background: #f3e8ff; color: #7c3aed; padding: 8px; text-align: left; border-bottom: 2px solid #7c3aed; }}
            td {{ padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }}
            .num {{ text-align: right; }}
            .emp-header td {{ background: #ede9fe; }}
            .emp-total td {{ background: #f5f3ff; font-weight: bold; }}
            .grand {{ margin-top: 20px; padding: 12px; background: #7c3aed; color: white; border-radius: 6px; font-size: 18px; text-align: right; }}
            .footer {{ margin-top: 30px; font-size: 12px; color: #777; border-top: 1px dashed #ccc; padding-top: 10px; }}
        </style></head><body>
            <h1>Clôture mensuelle — Bons RESPONSABLE OP. & LOG</h1>
            <p class="meta">Mois : <strong>{month}</strong> · Plafond mensuel : 25 000 F · Généré le {datetime.now(timezone.utc).strftime('%d/%m/%Y à %H:%M')}</p>
            <table>
                <thead><tr><th>Date</th><th>Articles</th><th class="num">Sous-total</th><th class="num">À retenir (-50%)</th></tr></thead>
                <tbody>{rows_html or '<tr><td colspan="4" style="text-align:center;color:#999;padding:20px">Aucune commande clôturée pour ce mois</td></tr>'}</tbody>
            </table>
            <div class="grand">Total à retenir sur le salaire : <strong>{grand_total:,.0f} F</strong></div>
            <p class="footer">Ce document récapitule les bons RESPONSABLE OP. & LOG clôturés. Espace Maxo.</p>
        </body></html>"""
        return HTMLResponse(content=html)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating manager closure PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))





# ============== WEEKLY SUMMARY ENDPOINT ==============

@api_router.get("/reports/weekly")
async def get_weekly_report(week_start: Optional[str] = None, end_date: Optional[str] = None):
    """Get summary (sales + expenses + result) day-by-day.

    - `week_start` : start date (default = current Monday). If `end_date` is omitted, span = 7 days.
    - `end_date`   : optional custom end date → enables 1-day / custom-range reports
                     (YYYY-MM-DD, inclusive). If provided, `week_start` becomes required.
    """
    try:
        # Calculate week start (Monday) if not provided
        if week_start:
            start_date = datetime.fromisoformat(week_start.replace('Z', '+00:00'))
        else:
            today = datetime.now(timezone.utc)
            start_date = today - timedelta(days=today.weekday())  # Monday

        start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)

        if end_date:
            try:
                end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            except Exception:
                raise HTTPException(400, f"end_date invalide: {end_date}")
            end_date_computed = end_dt.replace(hour=23, minute=59, second=59, microsecond=0)
        else:
            end_date_computed = start_date + timedelta(days=6, hours=23, minutes=59, seconds=59)

        # Use date strings without timezone for comparison (format: YYYY-MM-DD)
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date_computed.strftime("%Y-%m-%d") + "T23:59:59"
        
        # Get validated invoices (sales) for the week
        # Strategy: 2 queries then merge
        # Common filter: exclude invoices/expenses explicitly excluded from this week.
        not_excluded_filter = {"$or": [
            {"excluded_from_weeks": {"$exists": False}},
            {"excluded_from_weeks": {"$nin": [start_str]}},
        ]}
        # 1. Invoices in date range that are NOT assigned to another week
        invoices_by_date = await db.invoices.find({
            "validation_status": "validated",
            "created_at": {"$gte": start_str, "$lte": end_str + "Z"},
            "$or": [
                {"assigned_week": {"$exists": False}},
                {"assigned_week": None},
                {"assigned_week": ""},
                {"assigned_week": start_str}
            ],
            "$and": [not_excluded_filter],
        }, {"_id": 0}).to_list(1000)
        
        # 2. Invoices explicitly assigned to this week (from any date)
        invoices_assigned = await db.invoices.find({
            "validation_status": "validated",
            "assigned_week": start_str,
            "$and": [not_excluded_filter],
        }, {"_id": 0}).to_list(1000)
        
        # Merge and deduplicate
        seen_ids = set()
        invoices = []
        for inv in invoices_by_date + invoices_assigned:
            iid = inv.get("id", "")
            if iid and iid not in seen_ids:
                seen_ids.add(iid)
                invoices.append(inv)
        
        # Get ALL expenses for the week.
        # Règle d'attribution (par ordre de priorité) :
        #   1. `planned_date`    : date métier saisie par l'utilisateur (ex: "Achat du 02/05")
        #   2. `created_at`      : date de création technique (fallback)
        # `completed_at` / `approved_at` ne sont JAMAIS utilisés (timestamps administratifs).
        # 1. Expenses whose effective date falls in the period AND not assigned elsewhere.
        #    MongoDB doesn't support "coalesce" directly in filters, so we accept BOTH
        #    (planned_date in period) OR (no planned_date AND created_at in period).
        expenses_by_date = await db.expenses.find({
            "status": {"$in": ["completed", "approved", "pending", "revision_requested"]},
            "archived": {"$ne": True},
            "$or": [
                {"planned_date": {"$gte": start_str, "$lte": end_str[:10]}},
                {
                    "$and": [
                        {"$or": [
                            {"planned_date": {"$exists": False}},
                            {"planned_date": None},
                            {"planned_date": ""},
                        ]},
                        {"created_at": {"$gte": start_str, "$lte": end_str}},
                    ]
                },
            ],
            "$and": [
                {"$or": [
                    {"assigned_week": {"$exists": False}},
                    {"assigned_week": None},
                    {"assigned_week": ""},
                    {"assigned_week": start_str}
                ]},
                not_excluded_filter,
            ]
        }, {"_id": 0}).to_list(500)
        
        # 2. Expenses explicitly assigned to this week (any date, but ONLY active statuses)
        # Without this status filter, rejected/cancelled/draft expenses with a stale
        # assigned_week could pollute the period total.
        expenses_assigned = await db.expenses.find({
            "assigned_week": start_str,
            "status": {"$in": ["completed", "approved", "pending", "revision_requested"]},
            "archived": {"$ne": True},
            "$and": [not_excluded_filter],
        }, {"_id": 0}).to_list(500)
        
        # Merge and deduplicate
        seen_exp = set()
        all_expenses = []
        for exp in expenses_by_date + expenses_assigned:
            eid = exp.get("id", "")
            if eid and eid not in seen_exp:
                seen_exp.add(eid)
                all_expenses.append(exp)
        
        # Initialize daily data for each day of the range
        daily_data = {}
        day_names_fr = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]

        # Number of days covered by the report (1 to 31)
        nb_days = max(1, (end_date_computed.date() - start_date.date()).days + 1)
        for i in range(nb_days):
            day_date = start_date + timedelta(days=i)
            date_str = day_date.strftime("%Y-%m-%d")
            daily_data[date_str] = {
                "day_name": day_names_fr[day_date.weekday()],
                "date": date_str,
                "date_formatted": day_date.strftime("%d/%m/%Y"),
                "sales": {"count": 0, "total": 0, "items": []},
                "expenses": {"count": 0, "total": 0, "items": []},
                "result": 0
            }
        
        # Aggregate sales by day
        total_sales = 0
        # Aggregation au niveau global par groupe de recettes (Bar / Menu&Combos / Jeux / Autres)
        sales_by_revenue_group_total = {"bar": 0, "menu_combos": 0, "jeux": 0, "autres": 0}
        for invoice in invoices:
            # Determine date: assigned_week takes priority
            if invoice.get("assigned_week") == start_str:
                inv_date = invoice.get("created_at", "")[:10]
                if inv_date < start_str or inv_date > end_str[:10]:
                    inv_date = start_str  # Assign to Monday if outside week
            else:
                inv_date = invoice.get("created_at", "")[:10]

            # Compute revenue groups for this invoice (utilise totals_by_department si présent,
            # sinon retombe sur les items.department pour les anciennes factures).
            tbd = invoice.get("totals_by_department") or {}
            if not tbd:
                tbd = {}
                for it in (invoice.get("items") or []):
                    dep = (it.get("department") or "autres")
                    amt = (it.get("price", 0) or 0) * (it.get("quantity", 1) or 0)
                    tbd[dep] = tbd.get(dep, 0) + amt
            inv_groups = {
                "bar": tbd.get("bar", 0),
                "menu_combos": tbd.get("salle_jardin", 0) + tbd.get("jardin", 0) + tbd.get("accompagnements", 0),
                "jeux": tbd.get("jeux", 0),
                "autres": tbd.get("location", 0) + tbd.get("autres", 0),
            }

            if inv_date in daily_data:
                # Init revenue group bucket once
                if "by_revenue_group" not in daily_data[inv_date]["sales"]:
                    daily_data[inv_date]["sales"]["by_revenue_group"] = {"bar": 0, "menu_combos": 0, "jeux": 0, "autres": 0}
                daily_data[inv_date]["sales"]["count"] += 1
                daily_data[inv_date]["sales"]["total"] += invoice.get("total", 0)
                for k in inv_groups:
                    daily_data[inv_date]["sales"]["by_revenue_group"][k] += inv_groups[k]
                daily_data[inv_date]["sales"]["items"].append({
                    "id": invoice.get("id"),
                    "invoice_number": invoice.get("invoice_number"),
                    "total": invoice.get("total", 0),
                    "items_count": len(invoice.get("items", [])),
                    "assigned_week": invoice.get("assigned_week"),
                    "by_revenue_group": inv_groups,
                })
            total_sales += invoice.get("total", 0)
            for k in sales_by_revenue_group_total:
                sales_by_revenue_group_total[k] += inv_groups[k]

        # Assurer le champ by_revenue_group sur tous les jours (même vides)
        for date in daily_data:
            if "by_revenue_group" not in daily_data[date]["sales"]:
                daily_data[date]["sales"]["by_revenue_group"] = {"bar": 0, "menu_combos": 0, "jeux": 0, "autres": 0}
        
        # Aggregate expenses by day
        total_expenses = 0
        expenses_by_category = {}
        expenses_by_status = {"completed": 0, "approved": 0, "pending": 0, "revision_requested": 0}
        
        for expense in all_expenses:
            # Determine which day to attribute this expense to.
            # ORDRE DE PRIORITÉ :
            #   1. `assigned_week` (re-assignation manuelle par admin) - avec fallback
            #      sur planned_date/created_at si cohérent avec la période cible.
            #   2. `planned_date` (date métier saisie par l'utilisateur)
            #   3. `created_at`  (date de création technique)
            # `completed_at` / `approved_at` ne sont JAMAIS utilisés.
            effective = (expense.get("planned_date") or "")[:10] or (expense.get("created_at") or "")[:10]
            expense_date = None

            if expense.get("assigned_week"):
                if effective and effective >= start_str and effective <= end_str[:10]:
                    expense_date = effective
                else:
                    expense_date = expense.get("assigned_week")[:10]
            else:
                expense_date = effective
            
            # Count completed AND approved expenses in totals (both are validated expenses)
            if expense.get("status") in ["completed", "approved"]:
                total_expenses += expense.get("amount", 0)
                cat = expense.get("category", "autres")
                expenses_by_category[cat] = expenses_by_category.get(cat, 0) + expense.get("amount", 0)
            
            # Track by status
            status = expense.get("status", "pending")
            expenses_by_status[status] = expenses_by_status.get(status, 0) + expense.get("amount", 0)
            
            # Add to daily data if date is within our week range AND status is active.
            # Pending / revision_requested expenses no longer pollute the daily count :
            # they don't contribute to the total either, so showing "Charges (3) — 0 F"
            # was misleading.
            if expense_date and expense_date in daily_data and expense.get("status") in ["completed", "approved"]:
                daily_data[expense_date]["expenses"]["count"] += 1
                daily_data[expense_date]["expenses"]["total"] += expense.get("amount", 0)
                daily_data[expense_date]["expenses"]["items"].append({
                    "id": expense.get("id"),
                    "description": expense.get("description"),
                    "amount": expense.get("amount", 0),
                    "category": expense.get("category"),
                    "status": expense.get("status"),
                    "is_group": expense.get("is_group", False),
                    "items": expense.get("items"),
                    "assigned_week": expense.get("assigned_week")
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
        
        # ============== LOCATIONS (RENTALS) INCOME ==============
        # Inclut TOUS les statuts utiles (pending/confirmed/completed) pour que
        # toute demande de location renseignée par la responsable op. & log soit visible dans
        # le rapport. Les statuts annulés (cancelled) sont exclus.
        locations_window = await db.location_reservations.find({
            "status": {"$nin": ["cancelled", "annule", "annulee"]},
            "$or": [
                {"reservation_date": {"$gte": start_str, "$lte": end_str[:10]}},
                {"settled_at": {"$gte": start_str, "$lte": end_str[:10] + "T23:59:59"}},
            ]
        }, {"_id": 0}).to_list(1000)
        # Dédup par id (l'un peut matcher les deux conditions)
        _seen = set()
        locations = []
        for _l in locations_window:
            _lid = _l.get("id")
            if _lid in _seen:
                continue
            _seen.add(_lid)
            locations.append(_l)
        
        # Calculate total locations income
        total_locations_amount = 0       # somme rental_amount (total des locations)
        total_locations_advances = 0     # somme deposit_paid (avances reçues)
        total_locations_balance_due = 0  # solde à payer
        locations_count = 0
        locations_by_space = {}
        locations_details = []
        
        # Initialize locations in daily data
        for date in daily_data:
            daily_data[date]["locations"] = {"count": 0, "total": 0, "advances": 0, "balance_due": 0, "items": []}
        
        for loc in locations:
            rental_amount = float(loc.get("rental_amount", 0) or 0)
            deposit_paid = float(loc.get("deposit_paid", 0) or 0)
            balance_remaining = float(loc.get("balance_remaining", rental_amount - deposit_paid) or 0)
            
            total_locations_amount += rental_amount
            total_locations_advances += deposit_paid
            total_locations_balance_due += balance_remaining
            locations_count += 1
            
            # Track by space type
            space_type = loc.get("space_type", "autre")
            # Handle combined spaces
            if "+" in space_type:
                space_label = "Pack combiné"
            else:
                space_labels = {
                    "salle_fete": "Salle de Fête",
                    "espace_jardin": "Espace Jardin", 
                    "salle_jeux": "Salle de Jeux"
                }
                space_label = space_labels.get(space_type, space_type)
            
            locations_by_space[space_label] = locations_by_space.get(space_label, 0) + rental_amount
            
            # Add to daily data — la recette est rattachée à la date de solde si présente,
            # sinon à la date de réservation (comportement historique).
            settled_at = loc.get("settled_at") or ""
            res_date = (settled_at[:10] if settled_at else (loc.get("reservation_date", "") or "")[:10])
            if res_date in daily_data:
                daily_data[res_date]["locations"]["count"] += 1
                daily_data[res_date]["locations"]["total"] += rental_amount       # total contractuel
                daily_data[res_date]["locations"]["advances"] += deposit_paid      # avances reçues
                daily_data[res_date]["locations"]["balance_due"] += balance_remaining
                daily_data[res_date]["locations"]["items"].append({
                    "id": loc.get("id"),
                    "customer_name": loc.get("customer_name"),
                    "space_type": space_label,
                    "rental_amount": rental_amount,
                    "deposit_paid": deposit_paid,
                    "balance_remaining": balance_remaining,
                    "event_type": loc.get("event_type")
                })
            
            locations_details.append({
                "id": loc.get("id"),
                "customer_name": loc.get("customer_name"),
                "space_type": space_label,
                "reservation_date": loc.get("reservation_date"),
                "rental_amount": rental_amount,
                "deposit_paid": deposit_paid,
                "balance_remaining": balance_remaining,
                "event_type": loc.get("event_type"),
                "status": loc.get("status")
            })
        
        # Recalculate daily results including locations
        for date in daily_data:
            # Le résultat journalier reflète l'argent réellement encaissé (avances), pas le total contractuel
            advances = daily_data[date]["locations"].get("advances", 0)
            daily_data[date]["result"] = (
                daily_data[date]["sales"]["total"] + 
                advances - 
                daily_data[date]["expenses"]["total"]
            )
        
        # ============== MANAGER GENERAL (Commandes & Achats) ==============
        # Strict period filter + honor excluded_from_weeks like expenses do, so a Mme la D.G.
        # order/purchase explicitly detached from this week disappears from the report.
        mg_not_excluded = {"$or": [
            {"excluded_from_weeks": {"$exists": False}},
            {"excluded_from_weeks": {"$nin": [start_str]}},
        ]}
        mg_orders = await db.monsieur_orders.find({
            "created_at": {"$gte": start_str, "$lte": end_str + "Z"},
            "$and": [mg_not_excluded],
        }, {"_id": 0}).to_list(500)

        mg_purchases = await db.monsieur_purchases.find({
            "created_at": {"$gte": start_str, "$lte": end_str + "Z"},
            "$and": [mg_not_excluded],
        }, {"_id": 0}).to_list(500)
        
        mg_orders_total = sum(o.get("total", 0) for o in mg_orders if o.get("status") == "regle")
        mg_orders_unpaid = sum(o.get("total", 0) for o in mg_orders if o.get("status") == "non_regle")
        mg_orders_paid = sum(o.get("total", 0) for o in mg_orders if o.get("status") == "regle")
        mg_purchases_total = sum(p.get("amount", 0) for p in mg_purchases)
        mg_purchases_unpaid = sum(p.get("amount", 0) for p in mg_purchases if p.get("status") == "non_regle")
        
        # Add to daily data
        for date in daily_data:
            daily_data[date]["manager_general"] = {"orders_count": 0, "orders_total": 0, "purchases_count": 0, "purchases_total": 0}
        
        for o in mg_orders:
            # Only count paid orders in the daily/weekly point — unpaid ones don't contribute to revenue.
            if o.get("status") != "regle":
                continue
            odate = (o.get("created_at") or "")[:10]
            if odate in daily_data:
                daily_data[odate]["manager_general"]["orders_count"] += 1
                daily_data[odate]["manager_general"]["orders_total"] += o.get("total", 0)
        
        for p in mg_purchases:
            pdate = (p.get("created_at") or "")[:10]
            if pdate in daily_data:
                daily_data[pdate]["manager_general"]["purchases_count"] += 1
                daily_data[pdate]["manager_general"]["purchases_total"] += p.get("amount", 0)
        
        # Recalculate total result including locations — n'inclut QUE les avances réellement encaissées
        total_income = total_sales + total_locations_advances
        result = total_income - total_expenses
        
        return {
            "week_start": start_str,
            "week_end": end_str[:10],
            "week_label": f"Période du {start_date.strftime('%d/%m')} au {end_date_computed.strftime('%d/%m/%Y')}",
            "sales": {
                "total": total_sales,
                "count": len(invoices),
                "by_revenue_group": sales_by_revenue_group_total,
            },
            "locations": {
                "total": total_locations_amount,           # total des locations (rental_amount cumulé)
                "advances": total_locations_advances,      # avances reçues (deposit_paid cumulé)
                "balance_due": total_locations_balance_due, # solde à payer
                "count": locations_count,
                "by_space": locations_by_space,
                "details": locations_details
            },
            "expenses": {
                "total": total_expenses,
                "count": len([e for e in all_expenses if e.get("status") == "completed"]),
                "by_category": expenses_by_category,
                "by_status": expenses_by_status,
                "all_count": len(all_expenses)
            },
            "manager_general": {
                "orders_total": mg_orders_total,
                "orders_count": len(mg_orders),
                "orders_unpaid": mg_orders_unpaid,
                "orders_paid": mg_orders_paid,
                "purchases_total": mg_purchases_total,
                "purchases_count": len(mg_purchases),
                "purchases_unpaid": mg_purchases_unpaid,
                "orders": mg_orders,
                "purchases": mg_purchases
            },
            "daily": daily_data,
            "service_quality": service_stats,
            "total_income": total_income,
            "result": result,
            "is_profitable": result >= 0
        }
    except HTTPException:
        raise
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
        
        # Completed expenses (archivés exclus)
        expenses = await db.expenses.find({
            "status": "completed",
            "archived": {"$ne": True},
            "$or": [
                {"completed_at": {"$gte": start_str, "$lte": end_str}},
                {"created_at": {"$gte": start_str, "$lte": end_str}}
            ]
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
        
        # ============== PENDING OPERATIONS (En attente) ==============
        
        # Pending invoices (not yet validated)
        pending_invoices = await db.invoices.find({
            "validation_status": "pending",
            "created_at": {"$gte": start_str, "$lte": end_str}
        }, {"_id": 0, "id": 1, "invoice_number": 1, "total": 1, "created_by": 1, "created_at": 1}).to_list(500)
        
        # Pending expenses (not yet completed) — archivés exclus
        pending_expenses = await db.expenses.find({
            "status": {"$in": ["pending", "approved", "revision_requested"]},
            "archived": {"$ne": True},
            "created_at": {"$gte": start_str, "$lte": end_str}
        }, {"_id": 0, "id": 1, "description": 1, "amount": 1, "status": 1, "requested_by": 1, "created_at": 1}).to_list(500)
        
        pending_invoices_total = sum(i.get("total", 0) for i in pending_invoices)
        pending_expenses_total = sum(e.get("amount", 0) for e in pending_expenses)
        
        # ============== MANAGER GENERAL ==============
        
        mg_orders = await db.monsieur_orders.find({
            "created_at": {"$gte": start_str, "$lte": end_str}
        }, {"_id": 0}).to_list(500)
        
        mg_purchases = await db.monsieur_purchases.find({
            "created_at": {"$gte": start_str, "$lte": end_str}
        }, {"_id": 0}).to_list(500)
        
        # Manager General orders: only paid orders count in totals/point
        mg_orders_total = sum(o.get("total", 0) for o in mg_orders if o.get("status") == "regle")
        mg_orders_unpaid = sum(o.get("total", 0) for o in mg_orders if o.get("status") == "non_regle")
        mg_purchases_total = sum(p.get("amount", 0) for p in mg_purchases)
        mg_purchases_unpaid = sum(p.get("amount", 0) for p in mg_purchases if p.get("status") == "non_regle")
        
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
            "pending": {
                "invoices_count": len(pending_invoices),
                "invoices_total": pending_invoices_total,
                "invoices": pending_invoices,
                "expenses_count": len(pending_expenses),
                "expenses_total": pending_expenses_total,
                "expenses": pending_expenses,
                "total": pending_invoices_total + pending_expenses_total
            },
            "manager_general": {
                "orders_total": mg_orders_total,
                "orders_count": len(mg_orders),
                "orders_unpaid": mg_orders_unpaid,
                "purchases_total": mg_purchases_total,
                "purchases_count": len(mg_purchases),
                "purchases_unpaid": mg_purchases_unpaid,
                "orders": mg_orders,
                "purchases": mg_purchases
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
            "client_ifu": proforma_data.client_ifu,
            "proforma_title": proforma_data.proforma_title,
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
            "apply_tva": proforma_data.apply_tva,
            "tva_exempt_mention": proforma_data.tva_exempt_mention,
            "payment_mode": proforma_data.payment_mode,
            "payment_percentage": proforma_data.payment_percentage,
            "payment_methods": proforma_data.payment_methods,
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
async def create_location(
    location: LocationReservationCreate,
    actor_name: Optional[str] = Query(None),
    actor_role: Optional[str] = Query(None),
):
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
        try:
            from routers.invoices import _log_audit as _log_audit_fn
            snapshot_doc = {
                "id": location_dict["id"],
                "invoice_number": location_dict.get("id", "")[:8],
                "table_number": None,
                "total": location_dict.get("rental_amount"),
                "items": [],
                "client_name": location_dict.get("customer_name"),
                "validation_status": location_dict.get("status"),
            }
            await _log_audit_fn(
                "location", snapshot_doc, "create",
                {"name": actor_name, "role": actor_role},
                {"reservation_date": {"from": None, "to": location_dict.get("reservation_date")},
                 "space_type": {"from": None, "to": location_dict.get("space_type")},
                 "amount": {"from": None, "to": location_dict.get("rental_amount")}},
            )
        except Exception as _e:
            logger.error(f"location audit failed: {_e}")
        return {"success": True, "location": {k: v for k, v in location_dict.items() if k != "_id"}}
    except Exception as e:
        logger.error(f"Error creating location: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/locations/{location_id}")
async def update_location(
    location_id: str,
    update: LocationReservationUpdate,
    actor_name: Optional[str] = Query(None),
    actor_role: Optional[str] = Query(None),
):
    """Update a location reservation (Admin only)"""
    try:
        update_dict = {k: v for k, v in update.model_dump().items() if v is not None}
        if not update_dict:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        before = await db.location_reservations.find_one({"id": location_id}, {"_id": 0})
        update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        # Sync deposit_amount → deposit_paid (le formulaire d'édition envoie deposit_amount).
        # Cela évite que le solde reste figé quand on modifie l'avance via l'UI Locations.
        if "deposit_amount" in update_dict and "deposit_paid" not in update_dict:
            update_dict["deposit_paid"] = update_dict["deposit_amount"]
        
        # Recalculate balance if amounts changed
        if "rental_amount" in update_dict or "deposit_paid" in update_dict or "deposit_amount" in update_dict:
            existing = await db.location_reservations.find_one({"id": location_id})
            if existing:
                rental = float(update_dict.get("rental_amount", existing.get("rental_amount", 0)) or 0)
                deposit = float(update_dict.get("deposit_paid", existing.get("deposit_paid", 0)) or 0)
                update_dict["balance_remaining"] = max(0, rental - deposit)
                # Si tout est payé, marquer settled_at automatiquement (utile pour les rapports)
                if update_dict["balance_remaining"] == 0 and deposit > 0 and not existing.get("settled_at"):
                    update_dict["settled_at"] = update_dict["updated_at"]
        
        result = await db.location_reservations.update_one(
            {"id": location_id},
            {"$set": update_dict}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Location not found")
        
        updated = await db.location_reservations.find_one({"id": location_id}, {"_id": 0})
        if before and updated:
            try:
                from routers.invoices import _log_audit as _log_audit_fn
                changes = {}
                for k, v in update_dict.items():
                    if k == "updated_at":
                        continue
                    if before.get(k) != v:
                        changes[k] = {"from": before.get(k), "to": v}
                if changes:
                    snapshot_doc = {
                        "id": updated.get("id"),
                        "invoice_number": (updated.get("id", "") or "")[:8],
                        "total": updated.get("rental_amount"),
                        "items": [],
                        "client_name": updated.get("customer_name"),
                        "validation_status": updated.get("status"),
                    }
                    await _log_audit_fn(
                        "location", snapshot_doc, "update",
                        {"name": actor_name, "role": actor_role}, changes,
                    )
            except Exception as _e:
                logger.error(f"location audit failed: {_e}")
        return {"success": True, "location": updated}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating location: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/locations/{location_id}/add-payment")
async def add_payment_to_location(
    location_id: str,
    amount: float = Body(..., embed=True),
    actor_name: Optional[str] = Query(None),
    actor_role: Optional[str] = Query(None),
):
    """Ajouter un paiement partiel sur une réservation.

    Le montant `amount` est ajouté à `deposit_paid` (cumulatif).
    `balance_remaining` est recalculé. Si tout est payé, on marque settled_at.
    """
    if amount is None or float(amount) <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide")
    existing = await db.location_reservations.find_one({"id": location_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Location non trouvée")

    rental = float(existing.get("rental_amount") or 0)
    prev_paid = float(existing.get("deposit_paid") or 0)
    new_paid = prev_paid + float(amount)
    if new_paid > rental:
        new_paid = rental  # plafond
    new_balance = max(0.0, rental - new_paid)
    now_iso = datetime.now(timezone.utc).isoformat()

    update = {
        "deposit_paid": new_paid,
        "deposit_amount": new_paid,  # garde la cohérence avec l'UI
        "balance_remaining": new_balance,
        "updated_at": now_iso,
    }
    if new_balance == 0:
        update["status"] = "completed"
        update["settled_at"] = now_iso

    await db.location_reservations.update_one({"id": location_id}, {"$set": update})
    updated = await db.location_reservations.find_one({"id": location_id}, {"_id": 0})

    try:
        from routers.invoices import _log_audit as _log_audit_fn
        snapshot_doc = {
            "id": updated.get("id"),
            "invoice_number": (updated.get("id", "") or "")[:8],
            "total": updated.get("rental_amount"),
            "items": [],
            "client_name": updated.get("customer_name"),
            "validation_status": updated.get("status"),
        }
        await _log_audit_fn(
            "location", snapshot_doc, "add_payment",
            {"name": actor_name, "role": actor_role},
            {"deposit_paid": {"from": prev_paid, "to": new_paid},
             "balance_remaining": {"from": existing.get("balance_remaining"), "to": new_balance},
             "payment_added": float(amount)},
        )
    except Exception as _e:
        logger.error(f"location add-payment audit failed: {_e}")
    return {"success": True, "location": updated, "payment_added": float(amount), "fully_settled": new_balance == 0}


@api_router.post("/locations/{location_id}/settle")
async def settle_location(
    location_id: str,
    actor_name: Optional[str] = Query(None),
    actor_role: Optional[str] = Query(None),
):
    """Solder une réservation en 1 clic.

    Effets :
      - status = 'completed'
      - deposit_paid = rental_amount (solde réglé)
      - balance_remaining = 0
      - settled_at = now (utilisé pour la date de recette du jour)
    """
    existing = await db.location_reservations.find_one({"id": location_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Location non trouvée")
    if existing.get("status") == "completed" and float(existing.get("balance_remaining") or 0) == 0:
        return {"success": True, "already_settled": True, "location": {k: v for k, v in existing.items() if k != "_id"}}

    rental = float(existing.get("rental_amount") or 0)
    now_iso = datetime.now(timezone.utc).isoformat()
    update = {
        "status": "completed",
        "deposit_paid": rental,
        "balance_remaining": 0,
        "settled_at": now_iso,
        "updated_at": now_iso,
    }
    await db.location_reservations.update_one({"id": location_id}, {"$set": update})

    updated = await db.location_reservations.find_one({"id": location_id}, {"_id": 0})
    try:
        from routers.invoices import _log_audit as _log_audit_fn
        snapshot_doc = {
            "id": updated.get("id"),
            "invoice_number": (updated.get("id", "") or "")[:8],
            "total": updated.get("rental_amount"),
            "items": [],
            "client_name": updated.get("customer_name"),
            "validation_status": "completed",
        }
        await _log_audit_fn(
            "location", snapshot_doc, "settle",
            {"name": actor_name, "role": actor_role},
            {"status": {"from": existing.get("status"), "to": "completed"},
             "balance_remaining": {"from": existing.get("balance_remaining"), "to": 0},
             "settled_at": {"from": None, "to": now_iso}},
        )
    except Exception as _e:
        logger.error(f"location audit failed: {_e}")
    return {"success": True, "location": updated}


@api_router.delete("/locations/{location_id}")
async def delete_location(
    location_id: str,
    actor_name: Optional[str] = Query(None),
    actor_role: Optional[str] = Query(None),
):
    """Delete a location reservation (Admin only)"""
    try:
        existing = await db.location_reservations.find_one({"id": location_id}, {"_id": 0})
        result = await db.location_reservations.delete_one({"id": location_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Location not found")
        if existing:
            try:
                from routers.invoices import _log_audit as _log_audit_fn
                snapshot_doc = {
                    "id": existing.get("id"),
                    "invoice_number": (existing.get("id", "") or "")[:8],
                    "total": existing.get("rental_amount"),
                    "items": [],
                    "client_name": existing.get("customer_name"),
                    "validation_status": existing.get("status"),
                }
                await _log_audit_fn(
                    "location", snapshot_doc, "delete",
                    {"name": actor_name, "role": actor_role}, None,
                )
            except Exception as _e:
                logger.error(f"location audit failed: {_e}")
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
    priority: Optional[str] = None,
    reader_role: Optional[str] = None
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
        
        # Calculate unread count for the requesting role
        unread_count = 0
        for inst in instructions:
            read_by = inst.get("read_by", [])
            # A note is unread for a role if:
            # - The role didn't create it (sender_role != reader_role)
            # - The role hasn't read it yet (not in read_by)
            if reader_role and inst.get("sender_role") != reader_role and reader_role not in read_by:
                unread_count += 1
        
        return {"instructions": instructions, "unread_count": unread_count}
    except Exception as e:
        logger.error(f"Error fetching instructions: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/instructions/unread-count")
async def get_instructions_unread_count(reader_role: str):
    """Get count of unread instructions for a specific role"""
    try:
        # Get all non-archived instructions
        instructions = await db.instructions.find(
            {"is_archived": {"$ne": True}}, 
            {"_id": 0, "sender_role": 1, "read_by": 1}
        ).to_list(500)
        
        unread_count = 0
        for inst in instructions:
            read_by = inst.get("read_by", [])
            # Count as unread if: sender is different role AND current role hasn't read it
            if inst.get("sender_role") != reader_role and reader_role not in read_by:
                unread_count += 1
        
        return {"unread_count": unread_count}
    except Exception as e:
        logger.error(f"Error getting unread count: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/instructions/{instruction_id}/mark-read")
async def mark_instruction_read(instruction_id: str, reader_role: str = Body(..., embed=True)):
    """Mark an instruction as read by a specific role"""
    try:
        instruction = await db.instructions.find_one({"id": instruction_id})
        if not instruction:
            raise HTTPException(status_code=404, detail="Instruction not found")
        
        read_by = instruction.get("read_by", [])
        if reader_role not in read_by:
            read_by.append(reader_role)
            await db.instructions.update_one(
                {"id": instruction_id},
                {"$set": {"read_by": read_by}}
            )
        
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error marking instruction as read: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/instructions/mark-all-read")
async def mark_all_instructions_read(reader_role: str = Body(..., embed=True)):
    """Mark all instructions as read by a specific role"""
    try:
        # Find all instructions not created by this role that aren't marked as read by them
        instructions = await db.instructions.find(
            {"sender_role": {"$ne": reader_role}},
            {"_id": 0, "id": 1, "read_by": 1}
        ).to_list(500)
        
        for inst in instructions:
            read_by = inst.get("read_by", [])
            if reader_role not in read_by:
                read_by.append(reader_role)
                await db.instructions.update_one(
                    {"id": inst["id"]},
                    {"$set": {"read_by": read_by}}
                )
        
        return {"success": True}
    except Exception as e:
        logger.error(f"Error marking all instructions as read: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/instructions")
async def create_instruction(instruction: InstructionCreate):
    """Create a new instruction/note"""
    try:
        instruction_dict = instruction.model_dump()
        instruction_dict["id"] = str(uuid.uuid4())
        instruction_dict["is_read"] = False
        instruction_dict["read_by"] = []  # Track which roles have read this
        instruction_dict["is_archived"] = False
        instruction_dict["created_at"] = datetime.now(timezone.utc).isoformat()
        instruction_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        # Initialize tasks if task_list type
        if instruction_dict.get("instruction_type") == "task_list" and not instruction_dict.get("tasks"):
            instruction_dict["tasks"] = []
        
        await db.instructions.insert_one(instruction_dict)

        # SMS admin notification when note comes from a non-admin role
        try:
            if (instruction_dict.get("sender_role") or "").lower() != "admin":
                kind = "Liste de taches" if instruction_dict.get("instruction_type") == "task_list" else "Note"
                prio = (instruction_dict.get("priority") or "normal").upper()
                msg = (
                    f"[{kind}] Nouvelle Espace Maxo\n"
                    f"Titre: {(instruction_dict.get('title') or '')[:80]}\n"
                    f"Priorite: {prio}\n"
                    f"De: {instruction_dict.get('sender_name', '-')} ({instruction_dict.get('sender_role', '-')})\n"
                    f"Contenu: {(instruction_dict.get('content') or '')[:200]}"
                )
                if instruction_dict.get("instruction_type") == "task_list":
                    tasks = instruction_dict.get("tasks") or []
                    if tasks:
                        msg += f"\nTaches ({len(tasks)}):"
                        for t in tasks[:5]:
                            txt = (t.get("text") or "").strip()[:50] if isinstance(t, dict) else ""
                            if txt:
                                msg += f"\n- {txt}"
                        if len(tasks) > 5:
                            msg += f"\n+ {len(tasks) - 5} autre(s)..."
                await send_admin_sms_notification(msg)
        except Exception as notif_err:
            logger.error(f"SMS new note notification failed: {notif_err}")

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


# ==================== FINANCIAL POINT (Point Financier / Reversement) ====================

# Sub-routers are included early (at module top) — see block after api_router creation.

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
