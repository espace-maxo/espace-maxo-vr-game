"""
Catalogue de menus de livraison — Espace Maxo.

Gestion dynamique des items affichés sur la page publique /livraison
(carte de menus). Permet à l'administrateur de :
  - Ajouter de nouveaux plats à n'importe quelle catégorie
  - Modifier le nom, la description, le prix d'un plat
  - Toggler "populaire" et "sur commande"
  - Désactiver un plat sans le supprimer
  - Réordonner les plats au sein d'une catégorie

Les catégories restent codées en dur côté frontend (icône + couleur),
seuls les ITEMS sont dynamiques.

Endpoints :
  - GET    /api/delivery-menu                 → publique : tous les items actifs groupés par catégorie
  - GET    /api/admin/delivery-menu           → admin   : tous les items (actifs + inactifs)
  - POST   /api/admin/delivery-menu/items     → admin   : créer un plat
  - PATCH  /api/admin/delivery-menu/items/{id} → admin  : modifier un plat
  - DELETE /api/admin/delivery-menu/items/{id} → admin  : supprimer un plat

Modèle MongoDB `delivery_menu_items` :
  { id, category_key, name, price (Optional[float]), description,
    popular: bool, on_demand: bool, sort_order: int, active: bool,
    created_at, updated_at }
"""
from datetime import datetime, timezone
from typing import Optional
import os
import uuid
import logging

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)
router = APIRouter(tags=["delivery_menu"])

mongo_url = os.environ.get("MONGO_URL")
db_name = os.environ.get("DB_NAME")
db_client = AsyncIOMotorClient(mongo_url)
db = db_client[db_name]


# Catégories valides (correspondent aux clés frontend dans DeliveryPage.jsx)
VALID_CATEGORIES = {
    "salades", "entrees", "volailles", "viandes", "poissons", "divers",
    "locaux", "sauces", "pates", "accompagnements", "burgers", "sandwichs",
    "pizzas", "desserts", "boissons",
}


# ────────────────────────────────────────────────────────────────────
# Seed initial — exécuté au premier appel de GET /api/delivery-menu
# si la collection est vide. Réplique du menuData hardcoded actuel.
# ────────────────────────────────────────────────────────────────────
SEED_ITEMS = [
    # Salades
    ("salades", "Salade niçoise", 3600, None, False, False),
    ("salades", "Salade crudités", 2200, None, False, False),
    ("salades", "Salade César", 4000, None, False, False),
    ("salades", "Salade Maxo", 4500, None, True, False),
    ("salades", "Salade Avocat crevettes", 4000, None, False, False),
    ("salades", "Salade au thon", 3600, None, False, False),
    # Entrées
    ("entrees", "Samossas au Poulet", 2200, None, False, False),
    ("entrees", "Samossas à la viande", 2200, None, False, False),
    ("entrees", "Neems Poulet ou Viande", 2200, None, False, False),
    # Volailles
    ("volailles", "Sauce Poulet au Curry", 4900, "Poulet Chair ou Bicyclette", False, False),
    ("volailles", "Choukouya Poulet Bicyclette", 5400, None, True, False),
    ("volailles", "Choukouya Poulet Chair (Demi)", 4500, None, False, False),
    ("volailles", "Poulet chair Frit/Grillé/BFW (Demi)", 4500, None, False, False),
    ("volailles", "Poulet chair Frit/Grillé/BFW (Complet)", 8100, None, False, False),
    ("volailles", "Poulet Bicyclette Frit/Braisé/Grillé", 5400, None, False, False),
    # Viandes
    ("viandes", "Filet de Boeuf sauce champignons", 5400, "Sauce crème aux champignons", False, False),
    ("viandes", "Steaks Grillés", 4900, None, False, False),
    ("viandes", "Steak au poivre", 4900, None, True, False),
    ("viandes", "Choukouya Mouton", 4500, None, False, False),
    ("viandes", "Mouton frit/braisé/Grillé", 4500, None, False, False),
    ("viandes", "Langue de Boeuf Braisé/Grillé", 4500, None, False, False),
    ("viandes", "Agneau Frit/Braisé/Grillé", 4500, None, False, False),
    # Poissons
    ("poissons", "Poisson frit/Braisé/Grillé", 5400, None, False, False),
    ("poissons", "Moyo Poisson", 5400, "Poisson au choix", False, False),
    # Divers
    ("divers", "Lapin frit/Braisé/Grillé (Portion)", 3600, None, False, False),
    ("divers", "Aileron Frit/Braisé/Grillé", 4500, None, False, False),
    # Plats locaux sur commande — PAS DE PRIX (sur devis)
    ("locaux", "Wagasi grillé (fromage peulh)", None, "Servi avec piment & oignon", False, True),
    ("locaux", "Tchitchinga (brochettes pimentées de bœuf)", None, "Brochettes épicées à la béninoise", True, True),
    ("locaux", "Pintade braisée à la béninoise", None, "Pintade entière marinée, braisée au feu de bois", True, True),
    ("locaux", "Wo (pâte d'igname) + sauce arachide", None, "Pâte d'igname pilée, sauce arachide traditionnelle", False, True),
    ("locaux", "Igname pilée + sauce graine", None, "Igname pilée à la main, sauce graine de palme", False, True),
    ("locaux", "Watché complet (riz-haricots, poisson, sauce gboma)", None, "Plat complet de la tradition béninoise", False, True),
    ("locaux", "Gboma Dessi (sauce épinards locaux)", None, "Sauce épinards GBOMA, viande ou poisson", False, True),
    ("locaux", "Akpan local (yaourt traditionnel)", None, "Dessert traditionnel à base de maïs fermenté", False, True),
    # Sauces
    ("sauces", "Sauce Légume GBOMA/TCHIAVO/AMANVIVÈ", 4500, None, False, False),
    ("sauces", "Sauce Légume Mixte", 4900, "Au choix de légume", False, False),
    ("sauces", "Sauce Vassa", 4900, "Poulet Chair ou Bicyclette", True, False),
    ("sauces", "Sauce Assrokouin", 4500, None, False, False),
    ("sauces", "Sauce Arachide (Fromage/Poisson)", 4500, None, False, False),
    ("sauces", "Agneau en Sauce Arachide", 4500, None, False, False),
    ("sauces", "Agneau en Sauce Tomate", 4500, None, False, False),
    ("sauces", "Sauce Goussi (Sésame)", 4500, None, False, False),
    # Pâtes
    ("pates", "Spaghetti bolognaise", 3600, None, False, False),
    ("pates", "Tagliatelles crevettes", 4500, None, False, False),
    ("pates", "Spaghetti (Sauté au beurre/au gras)", 900, None, False, False),
    ("pates", "Pïron (Rouge/Blanc)", 900, None, False, False),
    ("pates", "Couscous (au gras/Blanc)", 900, None, False, False),
    ("pates", "Pâte Blanche (Pâte de Maïs)", 900, None, False, False),
    ("pates", "Pâte Noire (Télibo)", 900, None, False, False),
    ("pates", "Pâte Rouge (Amiwo)", 900, None, False, False),
    # Accompagnements
    ("accompagnements", "Riz blanc", 900, None, False, False),
    ("accompagnements", "Riz Cantonais", 1300, None, False, False),
    ("accompagnements", "Riz aux légumes", 1300, None, False, False),
    ("accompagnements", "Pomme sautée", 1300, None, False, False),
    ("accompagnements", "Frite surgelée", 900, None, False, False),
    ("accompagnements", "Frite Nature", 1300, None, False, False),
    ("accompagnements", "Atiékè", 900, None, False, False),
    ("accompagnements", "Akassa", 400, None, False, False),
    ("accompagnements", "Salade verte", 1300, None, False, False),
    # Burgers
    ("burgers", "MeetBurger", 2200, "Viande burger, oignons, tomate, cornichons, salade", False, False),
    ("burgers", "CheeseBurger", 2700, "Viande burger, cheese, oignons, tomate, cornichons", False, False),
    ("burgers", "Double Cheese Burger", 4500, "Double viande, double cheese", True, False),
    ("burgers", "KingBurger", 3100, "Viande, cheese, oeuf, oignons, tomate, cornichons", False, False),
    ("burgers", "Burger Maxo", 3600, "Poulet crispy, cheese, oeuf, oignons, tomate", True, False),
    # Sandwichs
    ("sandwichs", "Chawarma Viande", 1800, None, False, False),
    ("sandwichs", "Chawarma Poulet", 1800, None, False, False),
    ("sandwichs", "Sandwich au Poisson + Frite", 2700, None, False, False),
    ("sandwichs", "Sandwich Fajitas + Frite", 2700, None, False, False),
    ("sandwichs", "Sandwich Philadelphia + Frite", 2700, None, False, False),
    ("sandwichs", "Sandwich MAXO + Frite", 2700, None, True, False),
    # Pizzas
    ("pizzas", "Pizza Reine", 4500, "Sauce tomate, Jambon, Champignon, fromage", False, False),
    ("pizzas", "Pizza 4 saisons", 4500, "Jambon, artichaut, champignon, poivron", False, False),
    ("pizzas", "Pizza Margherita", 4000, "Sauce tomate, olive, origan, fromage", False, False),
    ("pizzas", "Pizza Maxo", 5400, "Chorizo, champignon, poulet, origan, olive", True, False),
    ("pizzas", "Pizza Végétarienne", 4500, "Oignon, champignon, maïs, poivron, olive", False, False),
    ("pizzas", "Pizza Bolognaise", 4500, "Sauce tomate, viande hachée, fromage", False, False),
    # Desserts
    ("desserts", "Crêpe Nature (1 pièce)", 600, None, False, False),
    ("desserts", "Crêpe au Nutella (1 pièce)", 1300, None, False, False),
    ("desserts", "Salade de Fruit", 900, None, False, False),
    ("desserts", "Ananas Pirogue", 900, None, False, False),
    ("desserts", "Assiette de Fruit", 1300, None, False, False),
    ("desserts", "Glace Chocolat/Fraise/Vanille (boule)", 900, None, False, False),
    ("desserts", "Coupe de glace (3 boules + chantilly)", 2200, None, True, False),
    # Boissons
    ("boissons", "Majestic / World cola", 900, None, False, False),
    ("boissons", "Jus d'orange", 900, None, False, False),
    ("boissons", "Jus d'ananas", 900, None, False, False),
    ("boissons", "Jus de pastèque", 900, None, False, False),
    ("boissons", "Jus Mixte (Mélange au choix)", 1300, None, False, False),
    ("boissons", "Béninoises 0,33 cl", 900, None, False, False),
    ("boissons", "Sombreros 0,33 cl", 900, None, False, False),
    ("boissons", "Guinness 0,33 cl", 1300, None, False, False),
    ("boissons", "Chill 0,33 cl", 900, None, False, False),
]


async def _seed_if_empty():
    """Insère les items par défaut si la collection est vide."""
    count = await db.delivery_menu_items.count_documents({})
    if count > 0:
        return
    now_iso = datetime.now(timezone.utc).isoformat()
    docs = []
    for sort_idx, (cat, name, price, desc, popular, on_demand) in enumerate(SEED_ITEMS):
        docs.append({
            "id": str(uuid.uuid4()),
            "category_key": cat,
            "name": name,
            "price": float(price) if price is not None else None,
            "description": desc or "",
            "popular": bool(popular),
            "on_demand": bool(on_demand),
            "sort_order": sort_idx,
            "active": True,
            "created_at": now_iso,
            "updated_at": now_iso,
        })
    if docs:
        await db.delivery_menu_items.insert_many(docs)
        logger.info(f"delivery_menu_items seeded: {len(docs)} items")


# ────────────────────────────────────────────────────────────────────
# Auth admin — Bearer JWT (réutilise la logique de server.py)
# server.py injecte la vraie dépendance via set_admin_dependency().
# ────────────────────────────────────────────────────────────────────
_admin_dep_holder = {"dep": None}


def set_admin_dependency(dep):
    """Appelé depuis server.py pour injecter la vraie dépendance JWT."""
    _admin_dep_holder["dep"] = dep


async def require_admin(request: Request):
    """Dépendance dynamique : appelle la vraie fonction admin injectée."""
    real_dep = _admin_dep_holder["dep"]
    if real_dep is None:
        raise HTTPException(503, "Auth admin non configurée")
    # Construit manuellement le credentials Bearer pour appeler la dep
    from fastapi.security import HTTPAuthorizationCredentials
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(401, "Authentification requise")
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=auth.split(" ", 1)[1])
    return await real_dep(credentials=creds)


# ────────────────────────────────────────────────────────────────────
# Schémas Pydantic
# ────────────────────────────────────────────────────────────────────
class MenuItemCreate(BaseModel):
    category_key: str
    name: str = Field(..., min_length=1, max_length=200)
    price: Optional[float] = None  # None = "Sur devis"
    description: str = ""
    popular: bool = False
    on_demand: bool = False
    sort_order: Optional[int] = None
    active: bool = True


class MenuItemUpdate(BaseModel):
    category_key: Optional[str] = None
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    price: Optional[float] = None
    description: Optional[str] = None
    popular: Optional[bool] = None
    on_demand: Optional[bool] = None
    sort_order: Optional[int] = None
    active: Optional[bool] = None
    # Pour vider explicitement le prix (= "Sur devis"), passer clear_price=True
    clear_price: bool = False


# ────────────────────────────────────────────────────────────────────
# ROUTES PUBLIQUES
# ────────────────────────────────────────────────────────────────────
@router.get("/delivery-menu")
async def get_public_menu():
    """Retourne tous les items ACTIFS groupés par category_key.

    Format de sortie : { "salades": [items...], "entrees": [...], ... }
    Triés par sort_order ASC puis created_at ASC.
    """
    await _seed_if_empty()
    cursor = db.delivery_menu_items.find(
        {"active": True}, {"_id": 0}
    ).sort([("sort_order", 1), ("created_at", 1)])
    items = await cursor.to_list(2000)
    grouped: dict = {}
    for it in items:
        cat = it.get("category_key", "divers")
        grouped.setdefault(cat, []).append(it)
    return {"total": len(items), "items_by_category": grouped}


# ────────────────────────────────────────────────────────────────────
# ROUTES ADMIN
# ────────────────────────────────────────────────────────────────────
@router.get("/admin/delivery-menu", dependencies=[Depends(require_admin)])
async def get_admin_menu():
    """Admin : retourne TOUS les items (actifs + inactifs) avec total."""
    await _seed_if_empty()
    cursor = db.delivery_menu_items.find({}, {"_id": 0}).sort(
        [("category_key", 1), ("sort_order", 1), ("created_at", 1)]
    )
    items = await cursor.to_list(5000)
    grouped: dict = {}
    for it in items:
        cat = it.get("category_key", "divers")
        grouped.setdefault(cat, []).append(it)
    return {"total": len(items), "items_by_category": grouped}


@router.post("/admin/delivery-menu/items", dependencies=[Depends(require_admin)])
async def create_menu_item(body: MenuItemCreate):
    """Admin : créer un nouveau plat dans le menu."""
    if body.category_key not in VALID_CATEGORIES:
        raise HTTPException(
            400, f"Catégorie invalide. Valeurs autorisées : {sorted(VALID_CATEGORIES)}"
        )
    if body.price is not None and body.price < 0:
        raise HTTPException(400, "Le prix ne peut pas être négatif")

    # sort_order auto = max+1 dans la catégorie
    if body.sort_order is None:
        last = await db.delivery_menu_items.find_one(
            {"category_key": body.category_key},
            sort=[("sort_order", -1)],
        )
        next_order = (last.get("sort_order", 0) + 1) if last else 0
    else:
        next_order = body.sort_order

    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "category_key": body.category_key,
        "name": body.name.strip(),
        "price": float(body.price) if body.price is not None else None,
        "description": (body.description or "").strip(),
        "popular": bool(body.popular),
        "on_demand": bool(body.on_demand),
        "sort_order": int(next_order),
        "active": bool(body.active),
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.delivery_menu_items.insert_one(dict(doc))
    doc.pop("_id", None)
    return {"success": True, "item": doc}


@router.patch("/admin/delivery-menu/items/{item_id}", dependencies=[Depends(require_admin)])
async def update_menu_item(item_id: str, body: MenuItemUpdate):
    """Admin : modifier un plat existant."""
    existing = await db.delivery_menu_items.find_one({"id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Plat introuvable")

    update: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.category_key is not None:
        if body.category_key not in VALID_CATEGORIES:
            raise HTTPException(400, "Catégorie invalide")
        update["category_key"] = body.category_key
    if body.name is not None:
        update["name"] = body.name.strip()
    if body.clear_price:
        update["price"] = None
    elif body.price is not None:
        if body.price < 0:
            raise HTTPException(400, "Le prix ne peut pas être négatif")
        update["price"] = float(body.price)
    if body.description is not None:
        update["description"] = body.description.strip()
    if body.popular is not None:
        update["popular"] = bool(body.popular)
    if body.on_demand is not None:
        update["on_demand"] = bool(body.on_demand)
    if body.sort_order is not None:
        update["sort_order"] = int(body.sort_order)
    if body.active is not None:
        update["active"] = bool(body.active)

    await db.delivery_menu_items.update_one({"id": item_id}, {"$set": update})
    updated = await db.delivery_menu_items.find_one({"id": item_id}, {"_id": 0})
    return {"success": True, "item": updated}


@router.delete("/admin/delivery-menu/items/{item_id}", dependencies=[Depends(require_admin)])
async def delete_menu_item(item_id: str):
    """Admin : supprimer définitivement un plat."""
    existing = await db.delivery_menu_items.find_one({"id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Plat introuvable")
    await db.delivery_menu_items.delete_one({"id": item_id})
    return {"success": True, "deleted_id": item_id}


@router.get("/admin/delivery-menu/categories", dependencies=[Depends(require_admin)])
async def list_categories():
    """Retourne les clés de catégorie valides (utile pour le dropdown admin)."""
    return {"categories": sorted(VALID_CATEGORIES)}
