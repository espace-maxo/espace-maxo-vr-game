from fastapi import APIRouter, HTTPException, Body, UploadFile, File, Form
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime, timezone, timedelta
import uuid
import random
import bcrypt

router = APIRouter(prefix="/stock", tags=["stock"])
db = None

def set_db(database):
    global db
    db = database

# ==================== AUTH MODELS ====================

class StockUserCreate(BaseModel):
    username: str
    password: str
    full_name: str = ""
    role: str = "consultation"  # administrateur, gerant, magasinier, consultation

class StockLoginRequest(BaseModel):
    username: str
    password: str

# ==================== AUTH ENDPOINTS ====================

@router.post("/auth/login")
async def stock_login(data: StockLoginRequest):
    user = await db.stock_users.find_one({"username": data.username, "is_active": True})
    if not user:
        raise HTTPException(401, "Identifiants incorrects")
    
    if not bcrypt.checkpw(data.password.encode('utf-8'), user["password_hash"].encode('utf-8')):
        raise HTTPException(401, "Identifiants incorrects")
    
    # Update last login
    await db.stock_users.update_one({"id": user["id"]}, {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}})
    
    return {
        "success": True,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "full_name": user["full_name"],
            "role": user["role"]
        }
    }

@router.get("/auth/users")
async def get_stock_users():
    users = await db.stock_users.find({}, {"_id": 0, "password_hash": 0}).sort("full_name", 1).to_list(100)
    return {"users": users}

@router.post("/auth/users")
async def create_stock_user(data: StockUserCreate):
    existing = await db.stock_users.find_one({"username": data.username})
    if existing:
        raise HTTPException(400, f"Le nom d'utilisateur '{data.username}' existe deja")
    
    password_hash = bcrypt.hashpw(data.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    user = {
        "id": str(uuid.uuid4()),
        "username": data.username,
        "password_hash": password_hash,
        "full_name": data.full_name or data.username,
        "role": data.role,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_login": None
    }
    await db.stock_users.insert_one(user)
    user.pop("_id", None)
    user.pop("password_hash", None)
    return {"success": True, "user": user}

@router.put("/auth/users/{user_id}")
async def update_stock_user(user_id: str, data: dict = Body(...)):
    data.pop("_id", None)
    data.pop("id", None)
    data.pop("password_hash", None)
    # If password is being changed
    if "password" in data and data["password"]:
        data["password_hash"] = bcrypt.hashpw(data.pop("password").encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    else:
        data.pop("password", None)
    await db.stock_users.update_one({"id": user_id}, {"$set": data})
    updated = await db.stock_users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return {"success": True, "user": updated}

@router.delete("/auth/users/{user_id}")
async def delete_stock_user(user_id: str):
    await db.stock_users.delete_one({"id": user_id})
    return {"success": True}

@router.post("/auth/seed-users")
async def seed_stock_users():
    """Create default stock users if none exist"""
    existing = await db.stock_users.count_documents({})
    if existing > 0:
        return {"success": True, "message": f"{existing} utilisateurs deja presents"}
    
    default_users = [
        {"username": "admin", "password": "Admin2026", "full_name": "Administrateur", "role": "administrateur"},
        {"username": "gerante", "password": "Gerante2026", "full_name": "Gerante", "role": "gerant"},
        {"username": "magasinier", "password": "Magasin2026", "full_name": "Magasinier", "role": "magasinier"},
        {"username": "consultation", "password": "Consult2026", "full_name": "Consultation", "role": "consultation"},
    ]
    
    for u in default_users:
        pw_hash = bcrypt.hashpw(u["password"].encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        await db.stock_users.insert_one({
            "id": str(uuid.uuid4()),
            "username": u["username"],
            "password_hash": pw_hash,
            "full_name": u["full_name"],
            "role": u["role"],
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_login": None
        })
    
    return {"success": True, "message": f"{len(default_users)} utilisateurs crees"}

# ==================== MODELS ====================

class StockCategoryCreate(BaseModel):
    name: str
    description: str = ""
    color: str = "#3b82f6"
    icon: str = "Package"
    subcategories: list = []

class StockProductCreate(BaseModel):
    code: str = ""
    name: str
    category_id: str
    subcategory: str = ""
    unit: str = "kg"
    quantity: float = 0
    stock_min: float = 5
    stock_max: float = 100
    purchase_price: float = 0
    supplier_id: str = ""
    storage_location: str = ""
    is_active: bool = True
    photo_url: str = ""
    date_achat: str = ""
    date_peremption: str = ""
    observation: str = ""

class StockMovementCreate(BaseModel):
    product_id: str
    movement_type: str  # entree, sortie, ajustement, perte, casse, retour_fournisseur, inventaire
    quantity: float
    unit_price: float = 0
    reason: str = ""
    user_name: str = ""

class StockPurchaseCreate(BaseModel):
    supplier_id: str = ""
    supplier_name: str = ""
    purchase_date: str = ""
    items: List[Dict] = []  # [{product_id, product_name, quantity, unit_price}]
    notes: str = ""
    user_name: str = ""

class StockSupplierCreate(BaseModel):
    name: str
    phone: str = ""
    email: str = ""
    address: str = ""
    product_types: str = ""
    notes: str = ""

# ==================== CATEGORIES ====================

@router.get("/categories")
async def get_categories():
    cats = await db.stock_categories.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    return {"categories": cats}

@router.post("/categories")
async def create_category(data: StockCategoryCreate):
    cat = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "description": data.description,
        "color": data.color,
        "icon": data.icon,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.stock_categories.insert_one(cat)
    cat.pop("_id", None)
    return {"success": True, "category": cat}

@router.put("/categories/{cat_id}")
async def update_category(cat_id: str, data: dict = Body(...)):
    await db.stock_categories.update_one({"id": cat_id}, {"$set": data})
    updated = await db.stock_categories.find_one({"id": cat_id}, {"_id": 0})
    return {"success": True, "category": updated}

@router.delete("/categories/{cat_id}")
async def delete_category(cat_id: str):
    count = await db.stock_products.count_documents({"category_id": cat_id})
    if count > 0:
        raise HTTPException(400, f"Impossible de supprimer : {count} produit(s) dans cette catégorie")
    await db.stock_categories.delete_one({"id": cat_id})
    return {"success": True}

# ==================== PRODUCTS ====================

@router.get("/products")
async def get_products(category_id: str = None, status: str = None, search: str = None, alert: str = None):
    query = {}
    if category_id:
        query["category_id"] = category_id
    if status == "active":
        query["is_active"] = True
    elif status == "inactive":
        query["is_active"] = False
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"code": {"$regex": search, "$options": "i"}}
        ]
    
    products = await db.stock_products.find(query, {"_id": 0}).sort("name", 1).to_list(2000)
    
    if alert == "rupture":
        products = [p for p in products if p.get("quantity", 0) <= 0]
    elif alert == "faible":
        products = [p for p in products if 0 < p.get("quantity", 0) <= p.get("stock_min", 5)]
    
    return {"products": products}

@router.get("/products/{product_id}")
async def get_product(product_id: str):
    p = await db.stock_products.find_one({"id": product_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Produit non trouvé")
    return p

@router.post("/products")
async def create_product(data: StockProductCreate):
    if data.code:
        existing = await db.stock_products.find_one({"code": data.code})
        if existing:
            raise HTTPException(400, f"Le code produit '{data.code}' existe déjà")
    
    product = {
        "id": str(uuid.uuid4()),
        "code": data.code or f"PRD-{str(uuid.uuid4())[:6].upper()}",
        "name": data.name,
        "category_id": data.category_id,
        "subcategory": data.subcategory,
        "unit": data.unit,
        "quantity": data.quantity,
        "stock_min": data.stock_min,
        "stock_max": data.stock_max,
        "purchase_price": data.purchase_price,
        "valeur_stock": data.quantity * data.purchase_price,
        "supplier_id": data.supplier_id,
        "storage_location": data.storage_location,
        "is_active": data.is_active,
        "photo_url": data.photo_url,
        "date_achat": data.date_achat,
        "date_peremption": data.date_peremption,
        "observation": data.observation,
        "statut": "rupture" if data.quantity <= 0 else ("faible" if data.quantity <= data.stock_min else "normal"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.stock_products.insert_one(product)
    product.pop("_id", None)
    return {"success": True, "product": product}

@router.put("/products/{product_id}")
async def update_product(product_id: str, data: dict = Body(...)):
    data.pop("_id", None)
    data.pop("id", None)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    # Recalculate valeur_stock and statut
    product = await db.stock_products.find_one({"id": product_id})
    if not product:
        raise HTTPException(404, "Produit non trouve")
    qty = data.get("quantity", product.get("quantity", 0))
    price = data.get("purchase_price", product.get("purchase_price", 0))
    smin = data.get("stock_min", product.get("stock_min", 5))
    data["valeur_stock"] = qty * price
    data["statut"] = "rupture" if qty <= 0 else ("faible" if qty <= smin else "normal")
    await db.stock_products.update_one({"id": product_id}, {"$set": data})
    updated = await db.stock_products.find_one({"id": product_id}, {"_id": 0})
    return {"success": True, "product": updated}

@router.delete("/products/{product_id}")
async def delete_product(product_id: str):
    await db.stock_products.delete_one({"id": product_id})
    return {"success": True}

# ==================== MOVEMENTS ====================

@router.get("/movements")
async def get_movements(product_id: str = None, movement_type: str = None, date_from: str = None, date_to: str = None, limit: int = 100):
    query = {}
    if product_id:
        query["product_id"] = product_id
    if movement_type:
        query["movement_type"] = movement_type
    if date_from or date_to:
        date_q = {}
        if date_from:
            date_q["$gte"] = date_from
        if date_to:
            date_q["$lte"] = date_to + "T23:59:59"
        query["created_at"] = date_q
    
    movements = await db.stock_movements.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {"movements": movements}

@router.post("/movements")
async def create_movement(data: StockMovementCreate):
    product = await db.stock_products.find_one({"id": data.product_id})
    if not product:
        raise HTTPException(404, "Produit non trouvé")
    
    current_qty = product.get("quantity", 0)
    
    # Calculate new quantity
    if data.movement_type in ["entree", "retour_fournisseur"]:
        new_qty = current_qty + data.quantity
    elif data.movement_type in ["sortie", "perte", "casse"]:
        if data.quantity > current_qty:
            raise HTTPException(400, f"Stock insuffisant. Disponible: {current_qty} {product.get('unit', '')}")
        new_qty = current_qty - data.quantity
    elif data.movement_type == "ajustement":
        new_qty = data.quantity  # Direct set
    elif data.movement_type == "inventaire":
        new_qty = data.quantity  # Set to physical count
    else:
        raise HTTPException(400, f"Type de mouvement invalide: {data.movement_type}")
    
    movement = {
        "id": str(uuid.uuid4()),
        "product_id": data.product_id,
        "product_name": product.get("name", ""),
        "product_code": product.get("code", ""),
        "movement_type": data.movement_type,
        "quantity": data.quantity,
        "previous_quantity": current_qty,
        "new_quantity": new_qty,
        "unit": product.get("unit", ""),
        "unit_price": data.unit_price,
        "total_value": data.quantity * data.unit_price,
        "reason": data.reason,
        "user_name": data.user_name,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.stock_movements.insert_one(movement)
    movement.pop("_id", None)
    
    # Update product quantity + valeur_stock + statut
    new_valeur = new_qty * product.get("purchase_price", 0)
    new_statut = "rupture" if new_qty <= 0 else ("faible" if new_qty <= product.get("stock_min", 5) else "normal")
    await db.stock_products.update_one(
        {"id": data.product_id},
        {"$set": {"quantity": new_qty, "valeur_stock": new_valeur, "statut": new_statut, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"success": True, "movement": movement}

# ==================== SUPPLIERS ====================

@router.get("/suppliers")
async def get_suppliers():
    suppliers = await db.stock_suppliers.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    return {"suppliers": suppliers}

@router.post("/suppliers")
async def create_supplier(data: StockSupplierCreate):
    supplier = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "phone": data.phone,
        "email": data.email,
        "address": data.address,
        "product_types": data.product_types,
        "notes": data.notes,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.stock_suppliers.insert_one(supplier)
    supplier.pop("_id", None)
    return {"success": True, "supplier": supplier}

@router.put("/suppliers/{supplier_id}")
async def update_supplier(supplier_id: str, data: dict = Body(...)):
    data.pop("_id", None)
    data.pop("id", None)
    await db.stock_suppliers.update_one({"id": supplier_id}, {"$set": data})
    updated = await db.stock_suppliers.find_one({"id": supplier_id}, {"_id": 0})
    return {"success": True, "supplier": updated}

@router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str):
    await db.stock_suppliers.delete_one({"id": supplier_id})
    return {"success": True}

# ==================== PURCHASES ====================

@router.get("/purchases")
async def get_purchases(supplier_id: str = None, date_from: str = None, date_to: str = None):
    query = {}
    if supplier_id:
        query["supplier_id"] = supplier_id
    if date_from or date_to:
        dq = {}
        if date_from: dq["$gte"] = date_from
        if date_to: dq["$lte"] = date_to + "T23:59:59"
        query["purchase_date"] = dq
    purchases = await db.stock_purchases.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"purchases": purchases}

@router.post("/purchases")
async def create_purchase(data: StockPurchaseCreate):
    total = sum(item.get("quantity", 0) * item.get("unit_price", 0) for item in data.items)
    
    purchase = {
        "id": str(uuid.uuid4()),
        "supplier_id": data.supplier_id,
        "supplier_name": data.supplier_name,
        "purchase_date": data.purchase_date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "items": data.items,
        "total_amount": total,
        "notes": data.notes,
        "user_name": data.user_name,
        "status": "validated",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.stock_purchases.insert_one(purchase)
    purchase.pop("_id", None)
    
    # Update stock for each item
    for item in data.items:
        pid = item.get("product_id")
        qty = item.get("quantity", 0)
        price = item.get("unit_price", 0)
        if pid and qty > 0:
            product = await db.stock_products.find_one({"id": pid})
            if product:
                old_qty = product.get("quantity", 0)
                new_qty = old_qty + qty
                await db.stock_products.update_one(
                    {"id": pid},
                    {"$set": {"quantity": new_qty, "purchase_price": price, "updated_at": datetime.now(timezone.utc).isoformat()}}
                )
                # Create movement
                mov = {
                    "id": str(uuid.uuid4()),
                    "product_id": pid,
                    "product_name": product.get("name", ""),
                    "product_code": product.get("code", ""),
                    "movement_type": "entree",
                    "quantity": qty,
                    "previous_quantity": old_qty,
                    "new_quantity": new_qty,
                    "unit": product.get("unit", ""),
                    "unit_price": price,
                    "total_value": qty * price,
                    "reason": f"Achat - {data.supplier_name}",
                    "user_name": data.user_name,
                    "purchase_id": purchase["id"],
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.stock_movements.insert_one(mov)
    
    return {"success": True, "purchase": purchase}

# ==================== DASHBOARD ====================

@router.get("/dashboard")
async def get_dashboard():
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    peremption_limit = (datetime.now(timezone.utc) + timedelta(days=7)).strftime("%Y-%m-%d")
    
    products = await db.stock_products.find({"is_active": True}, {"_id": 0}).to_list(5000)
    categories = await db.stock_categories.find({}, {"_id": 0}).to_list(100)
    
    total_products = len(products)
    total_value = sum(p.get("quantity", 0) * p.get("purchase_price", 0) for p in products)
    
    rupture = [p for p in products if p.get("quantity", 0) <= 0]
    faible = [p for p in products if 0 < p.get("quantity", 0) <= p.get("stock_min", 5)]
    critical = len(rupture) + len(faible)
    
    # Products near expiry
    peremption_proche = [p for p in products if p.get("date_peremption") and p["date_peremption"] <= peremption_limit and p["date_peremption"] >= today]
    expired = [p for p in products if p.get("date_peremption") and p["date_peremption"] < today]
    
    # Today's movements
    today_movements = await db.stock_movements.find(
        {"created_at": {"$gte": today}}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    
    entrees_today = sum(1 for m in today_movements if m.get("movement_type") in ["entree", "retour_fournisseur"])
    sorties_today = sum(1 for m in today_movements if m.get("movement_type") in ["sortie", "perte", "casse"])
    
    recent_movements = await db.stock_movements.find({}, {"_id": 0}).sort("created_at", -1).to_list(10)
    recent_purchases = await db.stock_purchases.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    
    # Stock by category
    cat_map = {c["id"]: c["name"] for c in categories}
    stock_by_category = {}
    for p in products:
        cname = cat_map.get(p.get("category_id"), "Autre")
        if cname not in stock_by_category:
            stock_by_category[cname] = {"count": 0, "value": 0}
        stock_by_category[cname]["count"] += 1
        stock_by_category[cname]["value"] += p.get("quantity", 0) * p.get("purchase_price", 0)
    
    # Top sorted products (most movements)
    top_sorted = await db.stock_movements.aggregate([
        {"$match": {"movement_type": "sortie"}},
        {"$group": {"_id": "$product_name", "total": {"$sum": "$quantity"}}},
        {"$sort": {"total": -1}},
        {"$limit": 10}
    ]).to_list(10)
    
    # Today's sales from Caisse
    today_sales = await db.stock_movements.find(
        {"created_at": {"$gte": today}, "invoice_id": {"$exists": True}}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    ventes_caisse_today = len(today_sales)
    ventes_caisse_value = sum(m.get("total_value", 0) for m in today_sales)
    
    return {
        "total_products": total_products,
        "critical_products": critical,
        "total_value": total_value,
        "entrees_today": entrees_today,
        "sorties_today": sorties_today,
        "ventes_caisse_today": ventes_caisse_today,
        "ventes_caisse_value": ventes_caisse_value,
        "rupture": [{"id": p["id"], "name": p["name"], "code": p.get("code", ""), "unit": p.get("unit", "")} for p in rupture[:20]],
        "faible": [{"id": p["id"], "name": p["name"], "quantity": p["quantity"], "stock_min": p.get("stock_min", 5), "unit": p.get("unit", "")} for p in faible[:20]],
        "peremption_proche": [{"id": p["id"], "name": p["name"], "date_peremption": p["date_peremption"]} for p in peremption_proche[:10]],
        "expired": [{"id": p["id"], "name": p["name"], "date_peremption": p["date_peremption"]} for p in expired[:10]],
        "recent_movements": recent_movements,
        "recent_purchases": recent_purchases,
        "stock_by_category": stock_by_category,
        "top_sorted": top_sorted
    }

# ==================== SEED DATA ====================

@router.post("/seed")
async def seed_full_data(force: bool = False):
    """Seed the complete restaurant stock database with 25 categories and ~500 products"""
    from routers.stock_data import CATEGORIES, SUPPLIERS, P
    
    existing = await db.stock_products.count_documents({})
    if existing > 0 and not force:
        return {"success": True, "message": f"Donnees deja presentes ({existing} produits). Utilisez force=true pour reinitialiser."}
    
    # Clear existing data if forcing
    if force and existing > 0:
        await db.stock_products.delete_many({})
        await db.stock_categories.delete_many({})
        await db.stock_suppliers.delete_many({})
        await db.stock_movements.delete_many({})
        await db.stock_purchases.delete_many({})
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Create categories
    cat_docs = []
    for c in CATEGORIES:
        cat_docs.append({
            "id": str(uuid.uuid4()),
            "name": c["name"],
            "description": c["description"],
            "color": c["color"],
            "icon": "Package",
            "subcategories": c.get("subcategories", []),
            "created_at": now
        })
    await db.stock_categories.insert_many(cat_docs)
    cat_ids = [c["id"] for c in cat_docs]
    
    # Create suppliers
    sup_docs = []
    for s in SUPPLIERS:
        sup_docs.append({**s, "id": str(uuid.uuid4()), "email": "", "notes": "", "created_at": now})
    await db.stock_suppliers.insert_many(sup_docs)
    
    # Create products
    product_docs = []
    counters = {}
    prefixes = ["CF","LG","FR","LM","VI","VO","PM","PL","OE","HG","EC","BP","SG","BN","BA","CB","EM","EH","GE","AT","PD","SL","SF","FA","SR"]
    for cat_idx, name, unit, smin, price, loc in P:
        pf = prefixes[cat_idx]
        if pf not in counters:
            counters[pf] = 0
        counters[pf] += 1
        code = f"{pf}-{counters[pf]:03d}"
        
        smax = max(smin * 4, 20)
        r = random.random()
        if r < 0.05:
            qty = 0
        elif r < 0.18:
            qty = random.randint(0, max(1, smin - 1))
        else:
            qty = random.randint(smin, smax)
        
        valeur = qty * price
        statut = "rupture" if qty <= 0 else ("faible" if qty <= smin else "normal")
        
        product_docs.append({
            "id": str(uuid.uuid4()), "code": code, "name": name,
            "category_id": cat_ids[cat_idx], "subcategory": "",
            "unit": unit, "quantity": qty, "stock_min": smin, "stock_max": smax,
            "purchase_price": price, "valeur_stock": valeur,
            "supplier_id": "", "storage_location": loc,
            "is_active": True, "photo_url": "",
            "date_achat": "", "date_peremption": "", "observation": "",
            "statut": statut, "created_at": now, "updated_at": now
        })
    
    await db.stock_products.insert_many(product_docs)
    
    return {
        "success": True,
        "message": f"{len(product_docs)} produits, {len(cat_docs)} categories, {len(sup_docs)} fournisseurs crees"
    }

