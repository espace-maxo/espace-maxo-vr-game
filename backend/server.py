from fastapi import FastAPI, APIRouter, HTTPException, Request
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
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, 
    CheckoutSessionResponse, 
    CheckoutStatusResponse, 
    CheckoutSessionRequest
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Stripe
stripe_api_key = os.environ.get('STRIPE_API_KEY')

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
    category: str
    image_url: str
    is_available: bool = True

class MenuItemCreate(BaseModel):
    name: str
    description: str
    price: float
    category: str
    image_url: str
    is_available: bool = True

class Game(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    game_type: str  # "VR_360" or "RACING_SIMULATOR"
    price_per_game: float = 1500.0
    image_url: str
    duration_minutes: int = 15

class TimeSlot(BaseModel):
    time: str  # "09:00", "09:30", etc.
    available: bool = True
    booking_id: Optional[str] = None

class BookingCreate(BaseModel):
    customer_name: str
    customer_phone: str
    game_type: str
    date: str  # "2024-01-15"
    time_slot: str  # "09:00"
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
    payment_session_id: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

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

# ============== SEED DATA ==============

MENU_ITEMS = [
    {
        "id": "menu-1",
        "name": "Burger Maxo Deluxe",
        "description": "Double steak haché, cheddar fondu, bacon croustillant, sauce spéciale maison, salade fraîche et tomates",
        "price": 3500,
        "category": "Burgers",
        "image_url": "https://images.unsplash.com/photo-1662452883375-9226ea22c765?crop=entropy&cs=srgb&fm=jpg",
        "is_available": True
    },
    {
        "id": "menu-2",
        "name": "Burger Chicken VR",
        "description": "Poulet croustillant pané, sauce épicée, coleslaw maison, cornichons",
        "price": 3000,
        "category": "Burgers",
        "image_url": "https://images.pexels.com/photos/35832466/pexels-photo-35832466.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "is_available": True
    },
    {
        "id": "menu-3",
        "name": "Pizza Gamer",
        "description": "Pepperoni, mozzarella, poivrons, champignons, olives noires",
        "price": 5500,
        "category": "Pizzas",
        "image_url": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?crop=entropy&cs=srgb&fm=jpg",
        "is_available": True
    },
    {
        "id": "menu-4",
        "name": "Ailes de Poulet Épicées",
        "description": "8 ailes de poulet marinées et grillées, sauce buffalo maison",
        "price": 4000,
        "category": "Entrées",
        "image_url": "https://images.unsplash.com/photo-1608039829572-9f7b0ca93af8?crop=entropy&cs=srgb&fm=jpg",
        "is_available": True
    },
    {
        "id": "menu-5",
        "name": "Cocktail Neon",
        "description": "Cocktail signature aux fruits exotiques, sirop de grenadine et sprite",
        "price": 2500,
        "category": "Boissons",
        "image_url": "https://images.pexels.com/photos/33826046/pexels-photo-33826046.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "is_available": True
    },
    {
        "id": "menu-6",
        "name": "Mocktail Sunset",
        "description": "Jus d'orange, passion, sirop de mangue, glaçons",
        "price": 2000,
        "category": "Boissons",
        "image_url": "https://images.unsplash.com/photo-1570204865352-934c744d682c?crop=entropy&cs=srgb&fm=jpg",
        "is_available": True
    },
    {
        "id": "menu-7",
        "name": "Frites Maison",
        "description": "Pommes de terre fraîches, assaisonnement spécial, sauce au choix",
        "price": 1500,
        "category": "Accompagnements",
        "image_url": "https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?crop=entropy&cs=srgb&fm=jpg",
        "is_available": True
    },
    {
        "id": "menu-8",
        "name": "Sundae Chocolat",
        "description": "Glace vanille, sauce chocolat chaud, chantilly, éclats de noisettes",
        "price": 2500,
        "category": "Desserts",
        "image_url": "https://images.unsplash.com/photo-1563805042-7684c019e1cb?crop=entropy&cs=srgb&fm=jpg",
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
        "image_url": "https://images.pexels.com/photos/8728558/pexels-photo-8728558.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "duration_minutes": 15
    },
    {
        "id": "game-racing",
        "name": "Simulateur Course SONY",
        "description": "Vivez l'adrénaline de la course automobile avec notre simulateur SONY professionnel. Volant, pédales et siège baquet pour une expérience ultra-réaliste!",
        "game_type": "RACING_SIMULATOR",
        "price_per_game": 1500,
        "image_url": "https://images.pexels.com/photos/13251222/pexels-photo-13251222.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "duration_minutes": 15
    }
]

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
    # Generate time slots from 10:00 to 22:00
    slots = []
    for hour in range(10, 22):
        for minute in [0, 30]:
            time_str = f"{hour:02d}:{minute:02d}"
            # Check if slot is booked
            booking = await db.bookings.find_one({
                "date": date, 
                "time_slot": time_str,
                "payment_status": {"$in": ["completed", "paid"]}
            })
            slots.append({
                "time": time_str,
                "available": booking is None
            })
    return {"date": date, "slots": slots}

@api_router.post("/bookings", response_model=Booking)
async def create_booking(booking_data: BookingCreate):
    """Create a new booking"""
    # Check if slot is available
    existing = await db.bookings.find_one({
        "date": booking_data.date,
        "time_slot": booking_data.time_slot,
        "payment_status": {"$in": ["completed", "paid"]}
    })
    if existing:
        raise HTTPException(status_code=400, detail="Ce créneau est déjà réservé")
    
    # Calculate prices
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
    
    await db.bookings.insert_one(booking.model_dump())
    return booking

@api_router.get("/bookings/{booking_id}", response_model=Booking)
async def get_booking(booking_id: str):
    """Get booking details"""
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    return booking

# Payment routes
@api_router.post("/checkout/create")
async def create_checkout_session(request: Request, checkout_data: CheckoutRequest):
    """Create Stripe checkout session"""
    # Get booking
    booking = await db.bookings.find_one({"id": checkout_data.booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    
    if booking.get("payment_status") in ["completed", "paid"]:
        raise HTTPException(status_code=400, detail="Cette réservation est déjà payée")
    
    # Initialize Stripe
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
    
    # Build URLs from frontend origin
    success_url = f"{checkout_data.origin_url}/booking/confirmation?session_id={{CHECKOUT_SESSION_ID}}&booking_id={checkout_data.booking_id}"
    cancel_url = f"{checkout_data.origin_url}/booking?cancelled=true"
    
    # Create checkout session - amount is reservation fee only (500 FCFA)
    # Converting FCFA to USD for Stripe (approximate rate: 1 USD = 600 FCFA)
    amount_in_usd = float(booking["reservation_fee"]) / 600.0
    
    checkout_request = CheckoutSessionRequest(
        amount=round(amount_in_usd, 2),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "booking_id": checkout_data.booking_id,
            "customer_name": booking["customer_name"],
            "customer_phone": booking["customer_phone"],
            "game_type": booking["game_type"],
            "date": booking["date"],
            "time_slot": booking["time_slot"]
        }
    )
    
    session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(checkout_request)
    
    # Create payment transaction record
    transaction = PaymentTransaction(
        booking_id=checkout_data.booking_id,
        session_id=session.session_id,
        amount=booking["reservation_fee"],
        currency="XOF",
        payment_status="initiated",
        metadata={
            "booking_id": checkout_data.booking_id,
            "stripe_session_id": session.session_id
        }
    )
    await db.payment_transactions.insert_one(transaction.model_dump())
    
    # Update booking with session id
    await db.bookings.update_one(
        {"id": checkout_data.booking_id},
        {"$set": {"payment_session_id": session.session_id}}
    )
    
    return {"url": session.url, "session_id": session.session_id}

@api_router.get("/checkout/status/{session_id}")
async def get_checkout_status(request: Request, session_id: str):
    """Get checkout session status"""
    # Check if already processed
    transaction = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if transaction and transaction.get("payment_status") in ["paid", "completed"]:
        return {
            "status": "complete",
            "payment_status": transaction["payment_status"],
            "booking_id": transaction["booking_id"]
        }
    
    # Initialize Stripe and check status
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
    
    try:
        status: CheckoutStatusResponse = await stripe_checkout.get_checkout_status(session_id)
        
        # Update transaction and booking if paid
        if status.payment_status == "paid":
            await db.payment_transactions.update_one(
                {"session_id": session_id},
                {"$set": {
                    "payment_status": "paid",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            
            # Get booking_id from transaction
            if transaction:
                await db.bookings.update_one(
                    {"id": transaction["booking_id"]},
                    {"$set": {"payment_status": "paid"}}
                )
                return {
                    "status": status.status,
                    "payment_status": status.payment_status,
                    "booking_id": transaction["booking_id"]
                }
        
        return {
            "status": status.status,
            "payment_status": status.payment_status,
            "booking_id": transaction["booking_id"] if transaction else None
        }
    except Exception as e:
        logger.error(f"Error checking checkout status: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de la vérification du paiement")

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhooks"""
    try:
        body = await request.body()
        signature = request.headers.get("Stripe-Signature")
        
        host_url = str(request.base_url).rstrip("/")
        webhook_url = f"{host_url}/api/webhook/stripe"
        stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
        
        webhook_response = await stripe_checkout.handle_webhook(body, signature)
        
        if webhook_response.payment_status == "paid":
            session_id = webhook_response.session_id
            booking_id = webhook_response.metadata.get("booking_id")
            
            # Update transaction
            await db.payment_transactions.update_one(
                {"session_id": session_id},
                {"$set": {
                    "payment_status": "paid",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            
            # Update booking
            if booking_id:
                await db.bookings.update_one(
                    {"id": booking_id},
                    {"$set": {"payment_status": "paid"}}
                )
        
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"status": "error", "message": str(e)}

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
