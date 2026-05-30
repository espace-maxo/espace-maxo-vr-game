"""
Simulateur de devis Locations.

Workflow :
- La Responsable Op. & Log compose une simulation avec :
  - articles libres (libellé + coût unitaire + quantité)
  - articles depuis le catalogue Stock (cost = prix d'achat du produit)
  - articles depuis le catalogue produits Caisse (cost = prix d'achat)
- Saisit le nombre de personnes
- Choisit une marge en pourcentage (%) OU en montant fixe (F)
- Reçoit : prix de revient total, prix de vente global, prix par personne
- Peut sauvegarder la simulation (CRUD)

Collection : location_simulations
{
  id, name, client_name, event_date,
  num_persons,
  items: [{type: 'libre'|'stock'|'caisse', ref_id?, label, unit_cost, quantity, total_cost}],
  margin_type: 'percent' | 'fixed',
  margin_value: float,
  total_cost, sale_price_global, sale_price_per_person,
  notes, created_by, created_at, updated_at
}
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field

router = APIRouter(tags=["location_simulations"])
db = None
logger = logging.getLogger(__name__)


def set_db(database):
    global db
    db = database


class SimItem(BaseModel):
    type: str = "libre"  # 'libre' | 'stock' | 'caisse'
    ref_id: Optional[str] = None  # id du produit stock/caisse si applicable
    label: str
    unit_cost: float = 0
    quantity: float = 1


class SimulationCreate(BaseModel):
    name: str
    client_name: Optional[str] = ""
    event_date: Optional[str] = ""
    num_persons: int = 1
    items: List[SimItem] = Field(default_factory=list)
    margin_type: str = "percent"  # 'percent' | 'fixed'
    margin_value: float = 0
    notes: Optional[str] = ""
    created_by: Optional[str] = ""


def _compute(items: List[dict], margin_type: str, margin_value: float, num_persons: int) -> dict:
    total_cost = 0.0
    enriched = []
    for it in items:
        unit = float(it.get("unit_cost", 0) or 0)
        qty = float(it.get("quantity", 0) or 0)
        line_total = unit * qty
        total_cost += line_total
        enriched.append({**it, "total_cost": line_total})
    if margin_type == "fixed":
        sale_global = total_cost + float(margin_value or 0)
    else:
        sale_global = total_cost * (1 + (float(margin_value or 0) / 100.0))
    persons = max(1, int(num_persons or 1))
    return {
        "items": enriched,
        "total_cost": round(total_cost, 2),
        "sale_price_global": round(sale_global, 2),
        "sale_price_per_person": round(sale_global / persons, 2),
        "margin_amount": round(sale_global - total_cost, 2),
    }


@router.get("/location-simulations")
async def list_simulations(limit: int = 100):
    docs = await db.location_simulations.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {"simulations": docs}


@router.get("/location-simulations/{sim_id}")
async def get_simulation(sim_id: str):
    doc = await db.location_simulations.find_one({"id": sim_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Simulation non trouvée")
    return {"simulation": doc}


@router.post("/location-simulations/compute")
async def compute_only(data: SimulationCreate):
    """Calcul ÉPHÉMÈRE (pas de sauvegarde) — pour preview live au remplissage."""
    items = [it.model_dump() for it in data.items]
    return _compute(items, data.margin_type, data.margin_value, data.num_persons)


@router.post("/location-simulations")
async def create_simulation(data: SimulationCreate):
    items = [it.model_dump() for it in data.items]
    calc = _compute(items, data.margin_type, data.margin_value, data.num_persons)
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "client_name": data.client_name or "",
        "event_date": data.event_date or "",
        "num_persons": data.num_persons,
        "items": calc["items"],
        "margin_type": data.margin_type,
        "margin_value": data.margin_value,
        "total_cost": calc["total_cost"],
        "sale_price_global": calc["sale_price_global"],
        "sale_price_per_person": calc["sale_price_per_person"],
        "margin_amount": calc["margin_amount"],
        "notes": data.notes or "",
        "created_by": data.created_by or "",
        "created_at": now,
        "updated_at": now,
    }
    await db.location_simulations.insert_one(doc)
    doc.pop("_id", None)
    return {"success": True, "simulation": doc}


@router.put("/location-simulations/{sim_id}")
async def update_simulation(sim_id: str, data: SimulationCreate):
    existing = await db.location_simulations.find_one({"id": sim_id})
    if not existing:
        raise HTTPException(404, "Simulation non trouvée")
    items = [it.model_dump() for it in data.items]
    calc = _compute(items, data.margin_type, data.margin_value, data.num_persons)
    update = {
        "name": data.name,
        "client_name": data.client_name or "",
        "event_date": data.event_date or "",
        "num_persons": data.num_persons,
        "items": calc["items"],
        "margin_type": data.margin_type,
        "margin_value": data.margin_value,
        "total_cost": calc["total_cost"],
        "sale_price_global": calc["sale_price_global"],
        "sale_price_per_person": calc["sale_price_per_person"],
        "margin_amount": calc["margin_amount"],
        "notes": data.notes or "",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.location_simulations.update_one({"id": sim_id}, {"$set": update})
    doc = await db.location_simulations.find_one({"id": sim_id}, {"_id": 0})
    return {"success": True, "simulation": doc}


@router.delete("/location-simulations/{sim_id}")
async def delete_simulation(sim_id: str):
    r = await db.location_simulations.delete_one({"id": sim_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Simulation non trouvée")
    return {"success": True}
