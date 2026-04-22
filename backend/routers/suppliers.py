"""
Suppliers Router — gestion des fournisseurs (côté Caisse Pro).

Collection : caisse_suppliers
Indépendant de stock_suppliers (module stock autonome).
"""
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import Optional
import uuid
import logging

router = APIRouter(tags=["suppliers"])
db = None
logger = logging.getLogger(__name__)


def set_db(database):
    global db
    db = database


VALID_PAYMENT_TERMS = {"comptant", "15j", "30j", "60j", "autre"}
VALID_CATEGORIES = {"cuisine", "boissons", "materiel", "services", "hygiene", "autres"}


class SupplierCreate(BaseModel):
    name: str
    category: str = "autres"
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    ifu: Optional[str] = ""
    payment_terms: str = "comptant"
    notes: Optional[str] = ""
    is_active: bool = True


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    ifu: Optional[str] = None
    payment_terms: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/suppliers")
async def list_suppliers(active_only: bool = True):
    query = {}
    if active_only:
        query["is_active"] = True
    items = await db.caisse_suppliers.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    return {"suppliers": items}


@router.get("/suppliers/{supplier_id}")
async def get_supplier(supplier_id: str):
    s = await db.caisse_suppliers.find_one({"id": supplier_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Fournisseur non trouvé")
    return s


@router.post("/suppliers")
async def create_supplier(data: SupplierCreate):
    try:
        if data.category not in VALID_CATEGORIES:
            data.category = "autres"
        if data.payment_terms not in VALID_PAYMENT_TERMS:
            data.payment_terms = "comptant"
        doc = {
            "id": str(uuid.uuid4()),
            **data.model_dump(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.caisse_suppliers.insert_one(doc)
        doc.pop("_id", None)
        return {"success": True, "supplier": doc}
    except Exception as e:
        logger.error(f"Create supplier error: {e}")
        raise HTTPException(500, str(e))


@router.put("/suppliers/{supplier_id}")
async def update_supplier(supplier_id: str, data: SupplierUpdate):
    try:
        update = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
        if "category" in update and update["category"] not in VALID_CATEGORIES:
            update["category"] = "autres"
        if "payment_terms" in update and update["payment_terms"] not in VALID_PAYMENT_TERMS:
            update["payment_terms"] = "comptant"
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        res = await db.caisse_suppliers.update_one({"id": supplier_id}, {"$set": update})
        if res.matched_count == 0:
            raise HTTPException(404, "Fournisseur non trouvé")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update supplier error: {e}")
        raise HTTPException(500, str(e))


@router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str):
    res = await db.caisse_suppliers.delete_one({"id": supplier_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Fournisseur non trouvé")
    return {"success": True}
