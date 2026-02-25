"""
Espace Maxo - Models
All Pydantic models for the application
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict
from datetime import datetime, timezone
import uuid

# ============== MENU MODELS ==============

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


# ============== GAME MODELS ==============

class Game(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    game_type: str
    price_per_game: float = 1500.0
    image_url: str
    duration_minutes: int = 15


# ============== BOOKING MODELS ==============

class BookingCreate(BaseModel):
    customer_name: str
    customer_phone: str
    game_type: str
    date: str
    time_slot: str
    number_of_players: int
    number_of_games: int = 1
    pay_full_amount: bool = False
    use_wallet: bool = False

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
    amount_to_pay: float = 500.0
    payment_type: str = "reservation_only"
    payment_status: str = "pending"
    booking_status: str = "active"
    payment_session_id: Optional[str] = None
    wallet_amount_used: float = 0.0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    whatsapp_link: Optional[str] = None
    reschedule_token: Optional[str] = None
    has_been_rescheduled: bool = False
    original_date: Optional[str] = None
    original_time_slot: Optional[str] = None
    rescheduled_at: Optional[str] = None

class BookingUpdate(BaseModel):
    booking_status: Optional[str] = None
    payment_status: Optional[str] = None

class RescheduleRequest(BaseModel):
    new_date: str
    new_time_slot: str

class RescheduleByClientRequest(BaseModel):
    new_date: str
    new_time_slot: str
    phone: str
    name: str

class FindBookingRequest(BaseModel):
    phone: str
    name: str


# ============== WALLET MODELS ==============

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
    service_type: str
    description: str

class WalletOTPRequest(BaseModel):
    phone: str
    name: Optional[str] = None

class WalletOTPVerify(BaseModel):
    phone: str
    otp: str


# ============== PAYMENT MODELS ==============

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


# ============== ADMIN MODELS ==============

class AdminLoginRequest(BaseModel):
    password: str

class AdminLoginResponse(BaseModel):
    token: str
    expires_at: str


# ============== REVIEW MODELS ==============

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
    status: str = "pending"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ReviewUpdate(BaseModel):
    status: str


# ============== LOCATION REQUEST MODELS ==============

class LocationRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    fullName: str
    phone: str
    email: str = ""
    company: str = ""
    eventType: str
    otherEventType: str = ""
    eventDate: str
    startTime: str = ""
    endTime: str = ""
    guestCount: str = ""
    formula: str = ""
    budget: str = ""
    services: List[str] = []
    otherService: str = ""
    message: str = ""
    status: str = "pending"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ============== LOYALTY MODELS ==============

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
