"""
Product Packages — enregistre les conditionnements personnalisés saisis par
l'utilisateur (ex: « Coca-Cola → Casier × 24 ») pour les re-proposer
automatiquement lors de futurs achats du même produit.

Clé de matching : premier(s) mot(s) normalisés de la description (sans accents,
sans le suffixe de conditionnement déjà apposé).
"""
import re
import uuid
import unicodedata
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/product-packages", tags=["product-packages"])

db = None


def set_db(database):
    global db
    db = database


def _normalize_key(s: str) -> str:
    """lowercase, retire accents, retire suffixe (Casier/Pack/…), compresse espaces."""
    s = (s or "").lower().strip()
    s = re.sub(r"\s*\((casier|pack|carton|sac|bidon|bouteille|bac|caisse)[^)]*\)\s*", "", s, flags=re.I)
    s = unicodedata.normalize("NFD", s)
    s = s.encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-z0-9\s\-]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


class PackageCreate(BaseModel):
    description: str
    category: Optional[str] = "bar"
    tag: str           # e.g. "Casier", "Pack", "Carton"
    qty: int           # number of units in the package
    suffix: str        # e.g. "(Casier de 24 bouteilles)"


@router.get("")
async def list_packages(q: str = "", category: Optional[str] = None, limit: int = 10):
    """Retourne les packages déjà enregistrés qui matchent le libellé en cours."""
    key = _normalize_key(q)
    if not key:
        return {"packages": []}

    base_filter = {}
    if category:
        base_filter["category"] = category

    # Prefix match on the FIRST word (plus permissif pour variantes/typos)
    words = key.split()
    if not words:
        return {"packages": []}
    first = words[0]
    # Besoin d'au moins 3 caractères pour éviter du bruit
    if len(first) < 3:
        return {"packages": []}
    pattern = re.escape(first)

    # Exact match first
    exact = await db.product_packages.find(
        {**base_filter, "product_key": key},
        {"_id": 0},
    ).to_list(limit)

    seen_ids = {p["id"] for p in exact}
    prefix_matches = await db.product_packages.find(
        {**base_filter, "product_key": {"$regex": f"^{pattern}", "$options": "i"}, "id": {"$nin": list(seen_ids)}},
        {"_id": 0},
    ).sort("usage_count", -1).to_list(limit)

    results = exact + prefix_matches
    return {"packages": results[:limit]}


@router.post("")
async def create_or_touch_package(data: PackageCreate):
    """Crée un package si absent, sinon incrémente usage_count + last_used."""
    key = _normalize_key(data.description)
    if not key:
        raise HTTPException(status_code=400, detail="Libellé vide après normalisation")
    if data.qty <= 0:
        raise HTTPException(status_code=400, detail="qty doit être > 0")
    if not data.tag.strip():
        raise HTTPException(status_code=400, detail="tag requis")

    now_iso = datetime.now(timezone.utc).isoformat()
    existing = await db.product_packages.find_one({
        "product_key": key,
        "tag": data.tag,
        "qty": data.qty,
    })
    if existing:
        await db.product_packages.update_one(
            {"id": existing["id"]},
            {"$inc": {"usage_count": 1}, "$set": {"last_used": now_iso}},
        )
        updated = await db.product_packages.find_one({"id": existing["id"]}, {"_id": 0})
        return {"package": updated, "created": False}

    new = {
        "id": str(uuid.uuid4()),
        "product_key": key,
        "description_sample": data.description,
        "category": data.category or "bar",
        "tag": data.tag.strip(),
        "qty": int(data.qty),
        "suffix": data.suffix,
        "usage_count": 1,
        "created_at": now_iso,
        "last_used": now_iso,
    }
    # Insert a copy so _id is added to the copy, not to our return dict
    insert_doc = {**new}
    await db.product_packages.insert_one(insert_doc)
    return {"package": new, "created": True}


@router.delete("/{package_id}")
async def delete_package(package_id: str):
    res = await db.product_packages.delete_one({"id": package_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Package non trouvé")
    return {"success": True}
