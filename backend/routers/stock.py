from fastapi import APIRouter, HTTPException, Body, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime, timezone, timedelta
import uuid
import random
import bcrypt
import io

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

@router.delete("/movements/{movement_id}")
async def delete_movement(movement_id: str):
    result = await db.stock_movements.delete_one({"id": movement_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Mouvement non trouve")
    return {"success": True}

@router.post("/movements/delete-bulk")
async def delete_movements_bulk(ids: List[str] = Body(..., embed=True)):
    result = await db.stock_movements.delete_many({"id": {"$in": ids}})
    return {"success": True, "deleted": result.deleted_count}

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
    import re as _re
    query = {}
    if supplier_id:
        query["supplier_id"] = supplier_id
    if date_from or date_to:
        dq = {}
        if date_from: dq["$gte"] = date_from
        if date_to: dq["$lte"] = date_to + "T23:59:59"
        query["purchase_date"] = dq
    purchases = await db.stock_purchases.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    # Also include caisse expenses not yet synced to stock_purchases
    # BUT only items that match actual stock products
    synced_expense_ids = {p.get("expense_id") for p in purchases if p.get("expense_id")}
    
    expense_query = {}
    if date_from or date_to:
        eq = {}
        if date_from: eq["$gte"] = date_from
        if date_to: eq["$lte"] = date_to + "T23:59:59"
        expense_query["created_at"] = eq
    
    caisse_expenses = await db.expenses.find(expense_query, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    # Load all stock product names for matching
    all_stock_names = [p["name"].lower() for p in await db.stock_products.find({"is_active": True}, {"name": 1, "_id": 0}).to_list(5000)]
    
    for exp in caisse_expenses:
        if exp.get("id") in synced_expense_ids:
            continue
        
        raw_items = []
        if exp.get("is_group") and exp.get("items"):
            raw_items = exp["items"]
        else:
            raw_items = [{"description": exp.get("description", ""), "quantity": exp.get("quantity", 1), "unit_price": exp.get("unit_price", 0) or exp.get("amount", 0)}]
        
        # Filter: only keep items that match a stock product (exact or starts-with match)
        matched_items = []
        for item in raw_items:
            desc = (item.get("description") or "").strip().lower()
            if not desc or len(desc) < 2:
                continue
            # Exact match or stock product name starts with the description
            found = any(desc == sn or sn.startswith(desc + " ") or sn.startswith(desc + "s") or desc.rstrip("s") == sn for sn in all_stock_names)
            if found:
                matched_items.append({
                    "product_name": item.get("description", ""),
                    "quantity": item.get("quantity", 1),
                    "unit_price": item.get("unit_price", 0)
                })
        
        if not matched_items:
            continue
        
        matched_total = sum(i["quantity"] * i["unit_price"] for i in matched_items)
        status_map = {"pending": "en_attente", "approved": "approuve", "revision_requested": "en_revision", "rejected": "rejete", "completed": "valide"}
        
        purchases.append({
            "id": f"caisse-{exp['id']}",
            "supplier_id": "",
            "supplier_name": exp.get("supplier") or exp.get("description", "Caisse"),
            "purchase_date": exp.get("created_at", "")[:10],
            "items": matched_items,
            "total_amount": matched_total,
            "notes": exp.get("description", ""),
            "user_name": exp.get("requested_by", ""),
            "status": status_map.get(exp.get("status", ""), exp.get("status", "")),
            "source": "caisse",
            "expense_id": exp.get("id"),
            "caisse_status": exp.get("status", ""),
            "created_at": exp.get("created_at", "")
        })
    
    purchases.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
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

@router.delete("/purchases/{purchase_id}")
async def delete_purchase(purchase_id: str):
    result = await db.stock_purchases.delete_one({"id": purchase_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Achat non trouve")
    return {"success": True}

@router.post("/purchases/delete-bulk")
async def delete_purchases_bulk(ids: List[str] = Body(..., embed=True)):
    result = await db.stock_purchases.delete_many({"id": {"$in": ids}})
    return {"success": True, "deleted": result.deleted_count}

# ==================== BULK DELETE (ALL SECTIONS) ====================

@router.post("/products/delete-bulk")
async def delete_products_bulk(ids: List[str] = Body(..., embed=True)):
    result = await db.stock_products.delete_many({"id": {"$in": ids}})
    return {"success": True, "deleted": result.deleted_count}

@router.post("/suppliers/delete-bulk")
async def delete_suppliers_bulk(ids: List[str] = Body(..., embed=True)):
    result = await db.stock_suppliers.delete_many({"id": {"$in": ids}})
    return {"success": True, "deleted": result.deleted_count}

@router.post("/categories/delete-bulk")
async def delete_categories_bulk(ids: List[str] = Body(..., embed=True)):
    result = await db.stock_categories.delete_many({"id": {"$in": ids}})
    return {"success": True, "deleted": result.deleted_count}

@router.post("/recipes/delete-bulk")
async def delete_recipes_bulk(ids: List[str] = Body(..., embed=True)):
    result = await db.stock_recipes.delete_many({"id": {"$in": ids}})
    return {"success": True, "deleted": result.deleted_count}

@router.post("/auth/users/delete-bulk")
async def delete_users_bulk(ids: List[str] = Body(..., embed=True)):
    result = await db.stock_users.delete_many({"id": {"$in": ids}})
    return {"success": True, "deleted": result.deleted_count}

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

# ==================== RECIPES / FICHES TECHNIQUES ====================

class RecipeIngredient(BaseModel):
    product_id: str
    product_name: str = ""
    quantity: float
    unit: str = ""

class StockRecipeCreate(BaseModel):
    name: str
    caisse_product_name: str  # Name as it appears on Caisse invoices
    selling_price: float = 0
    ingredients: List[RecipeIngredient] = []
    notes: str = ""

class StockRecipeUpdate(BaseModel):
    name: Optional[str] = None
    caisse_product_name: Optional[str] = None
    selling_price: Optional[float] = None
    ingredients: Optional[List[RecipeIngredient]] = None
    notes: Optional[str] = None

@router.get("/recipes")
async def get_recipes():
    recipes = await db.stock_recipes.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    # Enrich with current cost prices from products
    all_products = {p["id"]: p for p in await db.stock_products.find({"is_active": True}, {"_id": 0}).to_list(5000)}
    for r in recipes:
        cost = 0
        for ing in r.get("ingredients", []):
            prod = all_products.get(ing.get("product_id"))
            if prod:
                ing["current_stock"] = prod.get("quantity", 0)
                ing["purchase_price"] = prod.get("purchase_price", 0)
                ing["unit"] = ing.get("unit") or prod.get("unit", "")
                cost += ing["quantity"] * prod.get("purchase_price", 0)
            else:
                ing["current_stock"] = 0
                ing["purchase_price"] = 0
        r["cost_price"] = round(cost, 2)
        r["margin"] = round(r.get("selling_price", 0) - cost, 2) if r.get("selling_price") else 0
        r["margin_percent"] = round((r["margin"] / r["selling_price"]) * 100, 1) if r.get("selling_price") and r["selling_price"] > 0 else 0
    return {"recipes": recipes}

@router.post("/recipes")
async def create_recipe(data: StockRecipeCreate):
    existing = await db.stock_recipes.find_one({"caisse_product_name": {"$regex": f"^{data.caisse_product_name}$", "$options": "i"}})
    if existing:
        raise HTTPException(400, f"Une fiche technique existe deja pour '{data.caisse_product_name}'")
    
    recipe = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "caisse_product_name": data.caisse_product_name,
        "selling_price": data.selling_price,
        "ingredients": [ing.dict() for ing in data.ingredients],
        "notes": data.notes,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.stock_recipes.insert_one(recipe)
    recipe.pop("_id", None)
    return {"success": True, "recipe": recipe}

@router.put("/recipes/{recipe_id}")
async def update_recipe(recipe_id: str, data: StockRecipeUpdate):
    recipe = await db.stock_recipes.find_one({"id": recipe_id})
    if not recipe:
        raise HTTPException(404, "Fiche technique non trouvee")
    
    update_data = {}
    for k, v in data.dict().items():
        if v is not None:
            if k == "ingredients":
                update_data[k] = [ing if isinstance(ing, dict) else ing.dict() for ing in v]
            else:
                update_data[k] = v
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.stock_recipes.update_one({"id": recipe_id}, {"$set": update_data})
    updated = await db.stock_recipes.find_one({"id": recipe_id}, {"_id": 0})
    return {"success": True, "recipe": updated}

@router.delete("/recipes/{recipe_id}")
async def delete_recipe(recipe_id: str):
    result = await db.stock_recipes.delete_one({"id": recipe_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Fiche technique non trouvee")
    return {"success": True}

@router.post("/recipes/seed-demo")
async def seed_demo_recipes():
    """Seed demo recipes for Poulet braise"""
    existing = await db.stock_recipes.count_documents({})
    if existing > 0:
        return {"success": True, "message": f"{existing} fiche(s) technique(s) deja presente(s)"}
    
    # Find product IDs for Poulet braisé ingredients
    product_map = {}
    needed = ["Cuisses de poulet", "Oignon local", "Piment frais", "Huile d'arachide", 
              "Concentre de tomate", "Ail local", "Poivron vert", "Sel fin"]
    for name in needed:
        p = await db.stock_products.find_one({"name": name, "is_active": True})
        if p:
            product_map[name] = {"id": p["id"], "unit": p.get("unit", "")}
    
    recipes = []
    if product_map.get("Cuisses de poulet"):
        recipes.append({
            "id": str(uuid.uuid4()),
            "name": "Poulet braise",
            "caisse_product_name": "Poulet braise",
            "selling_price": 3500,
            "ingredients": [
                {"product_id": product_map["Cuisses de poulet"]["id"], "product_name": "Cuisses de poulet", "quantity": 0.5, "unit": "kg"},
                {"product_id": product_map.get("Oignon local", {}).get("id", ""), "product_name": "Oignon local", "quantity": 0.15, "unit": "kg"},
                {"product_id": product_map.get("Piment frais", {}).get("id", ""), "product_name": "Piment frais", "quantity": 0.05, "unit": "kg"},
                {"product_id": product_map.get("Huile d'arachide", {}).get("id", ""), "product_name": "Huile d'arachide", "quantity": 0.1, "unit": "litre"},
                {"product_id": product_map.get("Concentre de tomate", {}).get("id", ""), "product_name": "Concentre de tomate", "quantity": 0.05, "unit": "boite"},
                {"product_id": product_map.get("Ail local", {}).get("id", ""), "product_name": "Ail local", "quantity": 0.02, "unit": "kg"},
                {"product_id": product_map.get("Poivron vert", {}).get("id", ""), "product_name": "Poivron vert", "quantity": 0.1, "unit": "kg"},
                {"product_id": product_map.get("Sel fin", {}).get("id", ""), "product_name": "Sel fin", "quantity": 0.01, "unit": "kg"},
            ],
            "notes": "Recette standard pour 1 portion de poulet braise avec accompagnement",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        })
        # Remove ingredients with empty product_id
        recipes[0]["ingredients"] = [i for i in recipes[0]["ingredients"] if i["product_id"]]
    
    if recipes:
        await db.stock_recipes.insert_many(recipes)
        # Clean _id
        for r in recipes:
            r.pop("_id", None)
    
    return {"success": True, "message": f"{len(recipes)} fiche(s) technique(s) de demo creee(s)", "recipes": recipes}

# ==================== REPORTS / RAPPORTS ====================

@router.get("/reports")
async def get_stock_report(
    type: str = "all",  # all, entree, sortie, perte, casse, ajustement
    date_from: str = None,
    date_to: str = None,
    product_id: str = None,
    search: str = None
):
    """Get filtered stock movements report with aggregated stats"""
    query = {}
    
    if type and type != "all":
        if type == "entree":
            query["movement_type"] = {"$in": ["entree", "retour_fournisseur"]}
        elif type == "sortie":
            query["movement_type"] = "sortie"
        elif type == "perte":
            query["movement_type"] = {"$in": ["perte", "casse"]}
        else:
            query["movement_type"] = type
    
    if date_from or date_to:
        dq = {}
        if date_from:
            dq["$gte"] = date_from
        if date_to:
            dq["$lte"] = date_to + "T23:59:59"
        query["created_at"] = dq
    
    if product_id:
        query["product_id"] = product_id
    
    if search:
        query["product_name"] = {"$regex": search, "$options": "i"}
    
    movements = await db.stock_movements.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)
    
    # Aggregated stats
    total_qty = sum(m.get("quantity", 0) for m in movements)
    total_value = sum(m.get("total_value", 0) for m in movements)
    
    # By type
    by_type = {}
    for m in movements:
        mt = m.get("movement_type", "autre")
        if mt not in by_type:
            by_type[mt] = {"count": 0, "quantity": 0, "value": 0}
        by_type[mt]["count"] += 1
        by_type[mt]["quantity"] += m.get("quantity", 0)
        by_type[mt]["value"] += m.get("total_value", 0)
    
    # By product (top 20)
    by_product = {}
    for m in movements:
        pname = m.get("product_name", "Inconnu")
        if pname not in by_product:
            by_product[pname] = {"count": 0, "quantity": 0, "value": 0}
        by_product[pname]["count"] += 1
        by_product[pname]["quantity"] += m.get("quantity", 0)
        by_product[pname]["value"] += m.get("total_value", 0)
    top_products = sorted(by_product.items(), key=lambda x: x[1]["value"], reverse=True)[:20]
    
    return {
        "movements": movements[:500],
        "total_movements": len(movements),
        "total_quantity": round(total_qty, 2),
        "total_value": round(total_value, 2),
        "by_type": by_type,
        "top_products": [{"name": k, **v} for k, v in top_products],
        "filters": {"type": type, "date_from": date_from, "date_to": date_to, "product_id": product_id, "search": search}
    }

@router.get("/reports/export/pdf")
async def export_report_pdf(
    type: str = "all",
    date_from: str = None,
    date_to: str = None,
    product_id: str = None,
    search: str = None
):
    """Export stock report as PDF"""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    
    # Fetch data
    report = await get_stock_report(type=type, date_from=date_from, date_to=date_to, product_id=product_id, search=search)
    movements = report["movements"]
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=15*mm, bottomMargin=15*mm, leftMargin=15*mm, rightMargin=15*mm)
    styles = getSampleStyleSheet()
    elements = []
    
    # Title
    title_style = ParagraphStyle('ReportTitle', parent=styles['Heading1'], fontSize=16, textColor=colors.HexColor('#1a1a2e'), alignment=1)
    elements.append(Paragraph("Rapport de Stock - Espace Maxo", title_style))
    elements.append(Spacer(1, 5*mm))
    
    # Filters info
    type_labels = {"all": "Tous", "entree": "Entrees", "sortie": "Sorties", "perte": "Pertes/Casses", "ajustement": "Ajustements"}
    filter_text = f"Type: {type_labels.get(type, type)}"
    if date_from:
        filter_text += f" | Du: {date_from}"
    if date_to:
        filter_text += f" | Au: {date_to}"
    filter_text += f" | Total: {report['total_movements']} mouvement(s)"
    
    filter_style = ParagraphStyle('FilterInfo', parent=styles['Normal'], fontSize=9, textColor=colors.grey, alignment=1)
    elements.append(Paragraph(filter_text, filter_style))
    elements.append(Spacer(1, 5*mm))
    
    # Summary table
    summary_data = [["Mouvements", "Quantite totale", "Valeur totale"]]
    summary_data.append([
        str(report["total_movements"]),
        f"{report['total_quantity']:.1f}",
        f"{report['total_value']:,.0f} F".replace(",", " ")
    ])
    summary_table = Table(summary_data, colWidths=[60*mm, 60*mm, 60*mm])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2d3748')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f7fafc')),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 8*mm))
    
    # Movements table
    header = ["Date", "Produit", "Type", "Quantite", "P.U.", "Valeur", "Motif"]
    data = [header]
    type_map = {"entree": "Entree", "sortie": "Sortie", "perte": "Perte", "casse": "Casse", "ajustement": "Ajust.", "retour_fournisseur": "Retour", "inventaire": "Inventaire"}
    
    for m in movements[:200]:
        created = m.get("created_at", "")[:16].replace("T", " ")
        data.append([
            created,
            (m.get("product_name", "")[:25]),
            type_map.get(m.get("movement_type", ""), m.get("movement_type", "")),
            f"{m.get('quantity', 0):.2f} {m.get('unit', '')}",
            f"{m.get('unit_price', 0):,.0f}".replace(",", " "),
            f"{m.get('total_value', 0):,.0f}".replace(",", " "),
            (m.get("reason", "")[:30])
        ])
    
    col_w = [30*mm, 40*mm, 18*mm, 25*mm, 20*mm, 22*mm, 35*mm]
    table = Table(data, colWidths=col_w, repeatRows=1)
    
    type_colors = {"Entree": colors.HexColor('#48bb78'), "Sortie": colors.HexColor('#f56565'), "Perte": colors.HexColor('#ed8936'), "Casse": colors.HexColor('#e53e3e')}
    style_commands = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a202c')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTSIZE', (0, 0), (-1, 0), 7),
        ('FONTSIZE', (0, 1), (-1, -1), 6.5),
        ('ALIGN', (3, 0), (5, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.3, colors.HexColor('#e2e8f0')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f7fafc')]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]
    
    for i, row in enumerate(data[1:], 1):
        tc = type_colors.get(row[2])
        if tc:
            style_commands.append(('TEXTCOLOR', (2, i), (2, i), tc))
    
    table.setStyle(TableStyle(style_commands))
    elements.append(table)
    
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"rapport_stock_{type}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.pdf"
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={filename}"})

@router.get("/reports/export/excel")
async def export_report_excel(
    type: str = "all",
    date_from: str = None,
    date_to: str = None,
    product_id: str = None,
    search: str = None
):
    """Export stock report as Excel"""
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    
    report = await get_stock_report(type=type, date_from=date_from, date_to=date_to, product_id=product_id, search=search)
    movements = report["movements"]
    
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Mouvements"
    
    # Styles
    header_font = Font(bold=True, color="FFFFFF", size=10)
    header_fill = PatternFill(start_color="1a202c", end_color="1a202c", fill_type="solid")
    green_font = Font(color="48bb78", bold=True)
    red_font = Font(color="f56565", bold=True)
    orange_font = Font(color="ed8936", bold=True)
    border = Border(
        left=Side(style='thin', color='e2e8f0'), right=Side(style='thin', color='e2e8f0'),
        top=Side(style='thin', color='e2e8f0'), bottom=Side(style='thin', color='e2e8f0')
    )
    
    # Summary row
    type_labels = {"all": "Tous", "entree": "Entrees", "sortie": "Sorties", "perte": "Pertes/Casses", "ajustement": "Ajustements"}
    ws.append(["Rapport de Stock - Espace Maxo"])
    ws.merge_cells('A1:H1')
    ws['A1'].font = Font(bold=True, size=14)
    ws.append([f"Type: {type_labels.get(type, type)}", f"Du: {date_from or 'Debut'}", f"Au: {date_to or 'Fin'}", f"Total: {report['total_movements']} mouvement(s)", f"Valeur: {report['total_value']:,.0f} F"])
    ws.append([])
    
    # Headers
    headers = ["Date", "Produit", "Code", "Type", "Quantite", "Unite", "Prix Unitaire", "Valeur", "Avant", "Apres", "Motif", "Utilisateur"]
    ws.append(headers)
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=4, column=col)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center')
        cell.border = border
    
    type_map = {"entree": "Entree", "sortie": "Sortie", "perte": "Perte", "casse": "Casse", "ajustement": "Ajustement", "retour_fournisseur": "Retour", "inventaire": "Inventaire"}
    
    for m in movements:
        created = m.get("created_at", "")[:16].replace("T", " ")
        mt = type_map.get(m.get("movement_type", ""), m.get("movement_type", ""))
        row = [
            created,
            m.get("product_name", ""),
            m.get("product_code", ""),
            mt,
            m.get("quantity", 0),
            m.get("unit", ""),
            m.get("unit_price", 0),
            m.get("total_value", 0),
            m.get("previous_quantity", ""),
            m.get("new_quantity", ""),
            m.get("reason", ""),
            m.get("user_name", "")
        ]
        ws.append(row)
        row_num = ws.max_row
        for col in range(1, len(headers) + 1):
            ws.cell(row=row_num, column=col).border = border
        # Color the type column
        type_cell = ws.cell(row=row_num, column=4)
        if mt == "Entree":
            type_cell.font = green_font
        elif mt == "Sortie":
            type_cell.font = red_font
        elif mt in ["Perte", "Casse"]:
            type_cell.font = orange_font
    
    # Auto-width columns
    for col_idx, col in enumerate(ws.columns, 1):
        max_len = 0
        col_letter = openpyxl.utils.get_column_letter(col_idx)
        for cell in col:
            try:
                if cell.value and not isinstance(cell, openpyxl.cell.cell.MergedCell):
                    if len(str(cell.value)) > max_len:
                        max_len = len(str(cell.value))
            except:
                pass
        ws.column_dimensions[col_letter].width = min(max_len + 3, 35)
    
    # Top products sheet
    if report.get("top_products"):
        ws2 = wb.create_sheet("Top Produits")
        ws2.append(["Produit", "Nb mouvements", "Quantite", "Valeur"])
        for col in range(1, 5):
            cell = ws2.cell(row=1, column=col)
            cell.font = header_font
            cell.fill = header_fill
        for tp in report["top_products"]:
            ws2.append([tp["name"], tp["count"], round(tp["quantity"], 2), round(tp["value"], 2)])
    
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    filename = f"rapport_stock_{type}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(buffer, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename={filename}"})

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

