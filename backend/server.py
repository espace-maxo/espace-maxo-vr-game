from fastapi import FastAPI, APIRouter, HTTPException, Request, Query, Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
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
    price_per_game: float = 1500.0
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
    payment_status: str = "pending"
    booking_status: str = "active"  # active, completed, cancelled
    payment_session_id: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    whatsapp_link: Optional[str] = None

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
        "image_url": "https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/zkga8jv7_tchoukouya.JPG",
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
        "price_per_game": 1500,
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

def create_admin_token() -> tuple[str, datetime]:
    """Create a JWT token for admin access"""
    expiration = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {
        "role": "admin",
        "exp": expiration,
        "iat": datetime.now(timezone.utc)
    }
    token = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return token, expiration

def verify_admin_token(token: str) -> bool:
    """Verify a JWT token"""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload.get("role") == "admin"
    except jwt.ExpiredSignatureError:
        return False
    except jwt.InvalidTokenError:
        return False

def verify_admin_password(password: str) -> bool:
    """Verify the admin password against the stored hash"""
    if not ADMIN_PASSWORD_HASH:
        # Fallback for backwards compatibility - hash of "Nikeland2016"
        default_hash = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4Y5yw3hPmF2LqxGe"
        return bcrypt.checkpw(password.encode('utf-8'), default_hash.encode('utf-8'))
    return bcrypt.checkpw(password.encode('utf-8'), ADMIN_PASSWORD_HASH.encode('utf-8'))

async def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)) -> bool:
    """Dependency to verify admin authentication"""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentification requise")
    
    if not verify_admin_token(credentials.credentials):
        raise HTTPException(status_code=401, detail="Token invalide ou expiré")
    
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
    
    game_price = 1500.0
    total_game_price = game_price * booking_data.number_of_games * booking_data.number_of_players
    reservation_fee = 500.0
    total_amount = total_game_price + reservation_fee
    
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
        total_amount=total_amount
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

# ============== ADMIN ROUTES ==============

# Admin authentication
@api_router.post("/auth/admin-login", response_model=AdminLoginResponse)
async def admin_login(request: AdminLoginRequest):
    """Authenticate admin and return JWT token"""
    if not verify_admin_password(request.password):
        raise HTTPException(status_code=401, detail="Mot de passe incorrect")
    
    token, expiration = create_admin_token()
    return AdminLoginResponse(
        token=token,
        expires_at=expiration.isoformat()
    )

@api_router.get("/auth/verify")
async def verify_auth(is_admin: bool = Depends(get_current_admin)):
    """Verify if the current token is valid"""
    return {"valid": True, "role": "admin"}

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
async def update_booking(booking_id: str, update_data: BookingUpdate, is_admin: bool = Depends(get_current_admin)):
    """Update booking status (admin only)"""
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
async def cancel_booking(booking_id: str, is_admin: bool = Depends(get_current_admin)):
    """Cancel a booking (soft delete)"""
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"booking_status": "cancelled"}}
    )
    
    return {"message": "Réservation annulée", "booking_id": booking_id}

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

# Reseed menu data
@api_router.post("/admin/reseed-menu")
async def reseed_menu(is_admin: bool = Depends(get_current_admin)):
    """Reseed menu with updated items (admin only)"""
    await db.menu_items.delete_many({})
    for item in MENU_ITEMS:
        await db.menu_items.insert_one(item)
    
    await db.games.delete_many({})
    for game in GAMES:
        await db.games.insert_one(game)
    
    return {"message": "Menu et jeux mis à jour", "items_count": len(MENU_ITEMS), "games_count": len(GAMES)}

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
