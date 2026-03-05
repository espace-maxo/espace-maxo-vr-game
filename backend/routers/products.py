"""
Caisse Pro - Product Routes
Handles product management
"""
from fastapi import APIRouter, HTTPException, Body
import logging

from models.caisse import CaisseProductCreate, CaisseProduct

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Caisse Products"])

# Database reference
db = None

def set_db(database):
    global db
    db = database


@router.post("/caisse/products")
async def create_caisse_product(product_data: CaisseProductCreate):
    """Create a new caisse product"""
    try:
        product = CaisseProduct(**product_data.model_dump())
        product_dict = product.model_dump()
        await db.caisse_products.insert_one(product_dict)
        return {"success": True, "product": {k: v for k, v in product_dict.items() if k != "_id"}}
    except Exception as e:
        logger.error(f"Error creating caisse product: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/caisse/products")
async def get_caisse_products():
    """Get all caisse products"""
    try:
        products = await db.caisse_products.find({}, {"_id": 0}).to_list(500)
        return {"products": products}
    except Exception as e:
        logger.error(f"Error fetching caisse products: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/caisse/products/{product_id}")
async def update_caisse_product(product_id: str, product_data: dict = Body(...)):
    """Update a caisse product"""
    try:
        result = await db.caisse_products.update_one({"id": product_id}, {"$set": product_data})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Produit non trouvé")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating caisse product: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/caisse/products/{product_id}")
async def delete_caisse_product(product_id: str):
    """Delete a caisse product"""
    try:
        result = await db.caisse_products.delete_one({"id": product_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Produit non trouvé")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting caisse product: {e}")
        raise HTTPException(status_code=500, detail=str(e))
