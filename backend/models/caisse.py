"""
Caisse Pro - Pydantic Models
All data models for the POS system
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone


# ============== INVOICE MODELS ==============

class InvoiceItemCreate(BaseModel):
    id: str
    name: str
    price: float
    quantity: int
    department: str
    unit: str = "unité"


class InvoiceCreate(BaseModel):
    customer_name: str = "Client"
    customer_phone: str = ""
    items: List[Dict]
    subtotal: float
    discount: float = 0
    discount_amount: float = 0
    total: float
    payment_method: str = "cash"
    totals_by_department: Dict = {}
    notes: str = ""
    created_by: str = ""
    validation_status: str = "pending"
    table_number: Optional[int] = None


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
    payment_method: str = "cash"
    payment_status: str = "paid"
    totals_by_department: Dict = {}
    notes: str = ""
    created_by: str = ""
    validation_status: str = "pending"
    validated_by: str = ""
    validated_at: str = ""
    table_number: Optional[int] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ============== USER MODELS ==============

class CaisseUserCreate(BaseModel):
    username: str
    email: str = ""
    password: str = ""
    pin: str = ""
    role: str = "server"
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


# ============== PRODUCT MODELS ==============

class CaisseProductCreate(BaseModel):
    name: str
    price: float
    department: str
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


# ============== CLIENT MODELS ==============

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


# ============== TABLE MODELS ==============

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


# ============== REQUEST MODELS ==============

class CancellationRequest(BaseModel):
    invoice_id: str
    invoice_number: str
    reason: str
    requested_by: str


class ModificationRequest(BaseModel):
    invoice_id: str
    invoice_number: str
    reason: str
    requested_by: str


# ============== AUTH MODELS ==============

class CaisseLoginRequest(BaseModel):
    pin: str = ""
    password: str = ""
