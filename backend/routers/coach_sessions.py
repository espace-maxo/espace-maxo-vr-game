"""
Coach Sessions — Suivi de la consommation par joueur côté Coach Jeux.

Workflow (1-b par joueur, 2-c onglet + compteur live, 3-ok transmission groupée) :
  1. Coach crée un "joueur" (ouvert) avec un nom
  2. Il ajoute des consommations (jeu + parties OU forfait horaire) au joueur
  3. Le total live se met à jour
  4. À la transmission, il choisit 1 ou plusieurs joueurs → fusion en 1 bon multi-lignes
     (chaque consommation devient une ligne du bon Jeux, le nom du joueur préfixe la note)

Endpoints :
  - POST   /api/coach/players                        : créer un joueur
  - GET    /api/coach/players?actor_name=...         : liste des joueurs ouverts du coach
  - POST   /api/coach/players/{id}/consume           : ajouter une consommation
  - DELETE /api/coach/players/{id}/consume/{idx}     : retirer une consommation
  - DELETE /api/coach/players/{id}                   : annuler un joueur
  - POST   /api/coach/players/transmit               : transmettre N joueurs en 1 bon
"""
from datetime import datetime, timezone
from typing import Optional, List
import os
import uuid
import logging
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)
router = APIRouter(tags=["coach_sessions"])

mongo_url = os.environ.get("MONGO_URL")
db_name = os.environ.get("DB_NAME")
db_client = AsyncIOMotorClient(mongo_url)
db = db_client[db_name]


class PlayerCreate(BaseModel):
    player_name: str
    coach_name: str
    coach_role: str
    table_number: Optional[int] = None
    notes: Optional[str] = ""


@router.post("/coach/players")
async def create_player(body: PlayerCreate):
    if body.coach_role not in ("coach_jeux", "admin"):
        raise HTTPException(403, "Action réservée au coach")
    # Le nom du joueur est désormais OPTIONNEL : si vide, on auto-génère un libellé
    # générique "Joueur N" basé sur le nombre de joueurs ouverts. Cas d'usage typique :
    # un client vient juste jouer 1 partie rapide sans donner son nom.
    raw_name = (body.player_name or "").strip()
    if not raw_name:
        open_count = await db.coach_players.count_documents({"status": "open"})
        raw_name = f"Joueur {open_count + 1}"
    now_iso = datetime.now(timezone.utc).isoformat()
    player = {
        "id": str(uuid.uuid4()),
        "player_name": raw_name,
        "coach_name": body.coach_name,
        "coach_role": body.coach_role,
        "table_number": body.table_number,
        "notes": (body.notes or "").strip(),
        "items": [],
        "total": 0.0,
        "status": "open",
        "created_at": now_iso,
        "updated_at": now_iso,
        "transmitted_at": None,
        "bon_id": None,
    }
    await db.coach_players.insert_one(player)
    player.pop("_id", None)
    return {"success": True, "player": player}


@router.get("/coach/players")
async def list_players(actor_role: str = "", actor_name: str = "", status: str = "open"):
    if actor_role not in ("coach_jeux", "admin"):
        raise HTTPException(403, "Action réservée")
    q = {"status": status}
    if actor_role != "admin":
        q["coach_name"] = actor_name
    players = await db.coach_players.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"total": len(players), "players": players}


@router.get("/coach/players/by-table/{table_number}")
async def players_on_table(table_number: int):
    """Récupère tous les joueurs ouverts (non transmis) rattachés à un n° de table.

    Endpoint léger sans contrôle d'accès strict — utilisé par la CaissePage
    (agent/Resp. Op.) pour afficher la consommation jeux sur la table en cours,
    avant impression du BON CLIENT. Cela permet une vue 360° du ticket.
    """
    players = await db.coach_players.find(
        {"table_number": int(table_number), "status": "open"},
        {"_id": 0}
    ).sort("created_at", 1).to_list(50)
    grand_total = sum(float(p.get("total") or 0) for p in players)
    return {"table_number": int(table_number), "players": players, "count": len(players), "grand_total": grand_total}


@router.get("/coach/timeline")
async def coach_timeline(
    coach_name: str = "",
    actor_role: str = "",
    date: Optional[str] = None,
):
    """Reconstruit la timeline horodatée de la séance du Coach pour une date donnée.

    Agrège tous les évènements pour donner un journal visuel :
      - player_added : joueur créé (heure + nom + table optionnelle)
      - consume : item consommé (+1 partie, +1h forfait) avec montant
      - transmitted : joueur transmis (bon créé) avec total
      - bon_attached : bon transmis directement à une table (Caisse one-click)
      - bon_processed : bon attaché/standalone/rejeté côté Resp. Op.

    Tous les évènements sont triés par horodatage (ASC).
    """
    if actor_role not in ("coach_jeux", "admin", "manager"):
        raise HTTPException(403, "Action réservée")
    if not date:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    # Filtre jour : tout évènement dont created_at ou added_at commence par YYYY-MM-DD
    date_regex = f"^{re.escape(date)}"

    # Filtre par coach (admin/manager voient tout)
    coach_filter = {} if actor_role != "coach_jeux" else {"coach_name": coach_name}

    events: List[dict] = []
    total_day = 0.0
    transmitted_total = 0.0

    # 1) Joueurs créés ce jour
    players_today = await db.coach_players.find(
        {**coach_filter, "created_at": {"$regex": date_regex}},
        {"_id": 0}
    ).to_list(500)

    # 2) Joueurs transmis ce jour mais créés avant (au cas où la séance commence avant minuit)
    transmitted_today = await db.coach_players.find(
        {**coach_filter, "transmitted_at": {"$regex": date_regex}, "created_at": {"$not": {"$regex": date_regex}}},
        {"_id": 0}
    ).to_list(500)

    all_players = players_today + transmitted_today

    for p in all_players:
        pname = p.get("player_name", "?")
        if p.get("created_at", "").startswith(date):
            events.append({
                "type": "player_added",
                "at": p["created_at"],
                "player_id": p["id"],
                "player_name": pname,
                "table_number": p.get("table_number"),
                "label": f"Joueur {pname} ajouté"
                         + (f" → T{p['table_number']}" if p.get("table_number") else ""),
                "icon": "user-plus",
                "color": "purple",
            })
        for it in (p.get("items") or []):
            added_at = it.get("added_at", "")
            if added_at.startswith(date):
                total_day += float(it.get("total") or 0)
                if it.get("billing_mode") == "hourly":
                    detail = f"+{it.get('hours', 0):g}h forfait {it.get('jeu_name', '')}"
                else:
                    detail = f"+{it.get('parties', 0)} partie(s) {it.get('jeu_name', '')}"
                events.append({
                    "type": "consume",
                    "at": added_at,
                    "player_id": p["id"],
                    "player_name": pname,
                    "jeu_name": it.get("jeu_name"),
                    "billing_mode": it.get("billing_mode") or "parties",
                    "amount": float(it.get("total") or 0),
                    "label": f"{pname} · {detail}",
                    "icon": "plus-circle",
                    "color": "emerald",
                })
        if (p.get("transmitted_at") or "").startswith(date):
            t = float(p.get("total") or 0)
            transmitted_total += t
            events.append({
                "type": "transmitted",
                "at": p["transmitted_at"],
                "player_id": p["id"],
                "player_name": pname,
                "amount": t,
                "bon_id": p.get("bon_id"),
                "label": f"{pname} transmis · {t:,.0f} F".replace(",", " "),
                "icon": "send",
                "color": "blue",
            })

    # 3) Bons traités ce jour (statut attached/standalone/rejected)
    bons_today = await db.jeux_bons.find(
        {"processed_at": {"$regex": date_regex}},
        {"_id": 0}
    ).to_list(500)
    for b in bons_today:
        # Filtre coach
        if actor_role == "coach_jeux" and b.get("coach_name") != coach_name and b.get("coach_name") != "(transmis depuis Caisse)":
            continue
        status = b.get("status")
        if status == "attached":
            label = f"Bon attaché à T{b.get('table_number','?')} · {float(b.get('total') or 0):,.0f} F".replace(",", " ")
            icon, color = "link", "amber"
        elif status == "standalone":
            label = f"Facture standalone créée · {float(b.get('total') or 0):,.0f} F".replace(",", " ")
            icon, color = "receipt", "amber"
        elif status == "rejected":
            label = f"Bon rejeté · motif : {b.get('rejection_reason') or 'n/a'}"
            icon, color = "x-circle", "rose"
        else:
            continue
        events.append({
            "type": f"bon_{status}",
            "at": b.get("processed_at"),
            "bon_id": b.get("id"),
            "table_number": b.get("table_number"),
            "amount": float(b.get("total") or 0),
            "label": label,
            "icon": icon,
            "color": color,
        })

    # Tri ASC
    events.sort(key=lambda e: e.get("at") or "")

    # Stats récap
    consumed_count = sum(1 for e in events if e["type"] == "consume")
    players_count = sum(1 for e in events if e["type"] == "player_added")
    transmitted_count = sum(1 for e in events if e["type"] == "transmitted")

    return {
        "date": date,
        "coach_name": coach_name if actor_role == "coach_jeux" else "(tous)",
        "events": events,
        "stats": {
            "total_day": round(total_day, 2),  # somme des montants des items consommés du jour
            "transmitted_total": round(transmitted_total, 2),  # déjà transmis (= soumis pour facturation)
            "open_amount": round(max(0.0, total_day - transmitted_total), 2),  # encore en cours
            "players_count": players_count,
            "consumed_count": consumed_count,
            "transmitted_count": transmitted_count,
            "events_count": len(events),
        },
    }


class ConsumeBody(BaseModel):
    jeu_product_id: str
    jeu_name: str
    billing_mode: str = "parties"  # "parties" | "hourly"
    parties: int = 1
    unit_price: float = 0
    hours: Optional[float] = None
    hourly_rate: Optional[float] = None
    duration_minutes: Optional[int] = None
    notes: Optional[str] = ""
    actor_name: str
    actor_role: str


def _compute_line_total(c: dict) -> float:
    if c.get("billing_mode") == "hourly":
        return round(float(c.get("hours") or 0) * float(c.get("hourly_rate") or 0), 2)
    return round(float(c.get("unit_price") or 0) * int(c.get("parties") or 0), 2)


@router.post("/coach/players/{player_id}/consume")
async def add_consumption(player_id: str, body: ConsumeBody):
    if body.actor_role not in ("coach_jeux", "admin"):
        raise HTTPException(403, "Action réservée")
    p = await db.coach_players.find_one({"id": player_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Joueur introuvable")
    if p.get("status") != "open":
        raise HTTPException(400, "Joueur déjà transmis ou clos")
    now_iso = datetime.now(timezone.utc).isoformat()
    if body.billing_mode == "hourly":
        if not body.hours or body.hours <= 0:
            raise HTTPException(400, "Nb d'heures invalide")
        line_total = round(float(body.hours) * float(body.hourly_rate or 0), 2)
        item = {
            "jeu_product_id": body.jeu_product_id,
            "jeu_name": body.jeu_name,
            "billing_mode": "hourly",
            "parties": 1,
            "unit_price": line_total,
            "hours": float(body.hours),
            "hourly_rate": float(body.hourly_rate or 0),
            "duration_minutes": int(round(float(body.hours) * 60)),
            "total": line_total,
            "notes": (body.notes or "").strip(),
            "added_at": now_iso,
        }
    else:
        if not body.parties or body.parties < 1:
            raise HTTPException(400, "Nb parties invalide")
        line_total = round(float(body.unit_price) * int(body.parties), 2)
        item = {
            "jeu_product_id": body.jeu_product_id,
            "jeu_name": body.jeu_name,
            "billing_mode": "parties",
            "parties": int(body.parties),
            "unit_price": float(body.unit_price),
            "hours": None,
            "hourly_rate": None,
            "duration_minutes": int(body.duration_minutes or 0) or None,
            "total": line_total,
            "notes": (body.notes or "").strip(),
            "added_at": now_iso,
        }
    items = (p.get("items") or []) + [item]
    new_total = round(sum(float(it.get("total") or 0) for it in items), 2)
    await db.coach_players.update_one(
        {"id": player_id},
        {"$set": {"items": items, "total": new_total, "updated_at": now_iso}},
    )
    return {"success": True, "item": item, "new_total": new_total}


@router.delete("/coach/players/{player_id}/consume/{item_index}")
async def remove_consumption(player_id: str, item_index: int, actor_role: str = ""):
    if actor_role not in ("coach_jeux", "admin"):
        raise HTTPException(403, "Action réservée")
    p = await db.coach_players.find_one({"id": player_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Joueur introuvable")
    if p.get("status") != "open":
        raise HTTPException(400, "Joueur déjà transmis")
    items = p.get("items") or []
    if item_index < 0 or item_index >= len(items):
        raise HTTPException(400, "Index invalide")
    items.pop(item_index)
    new_total = round(sum(float(it.get("total") or 0) for it in items), 2)
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.coach_players.update_one(
        {"id": player_id},
        {"$set": {"items": items, "total": new_total, "updated_at": now_iso}},
    )
    return {"success": True, "new_total": new_total}


@router.delete("/coach/players/{player_id}")
async def delete_player(player_id: str, actor_role: str = ""):
    if actor_role not in ("coach_jeux", "admin"):
        raise HTTPException(403, "Action réservée")
    p = await db.coach_players.find_one({"id": player_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Joueur introuvable")
    if p.get("status") != "open" and actor_role != "admin":
        raise HTTPException(400, "Joueur déjà transmis (admin requis)")
    await db.coach_players.delete_one({"id": player_id})
    return {"success": True}


class UpdatePlayerBody(BaseModel):
    table_number: Optional[int] = None
    actor_role: str = ""


@router.patch("/coach/players/{player_id}")
async def update_player(player_id: str, body: UpdatePlayerBody):
    """Met à jour les méta-données d'un joueur (actuellement uniquement table_number).

    Permet au Coach de rattacher / changer la table d'un joueur en cours après création.
    """
    if body.actor_role not in ("coach_jeux", "admin"):
        raise HTTPException(403, "Action réservée")
    p = await db.coach_players.find_one({"id": player_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Joueur introuvable")
    if p.get("status") != "open":
        raise HTTPException(400, "Joueur déjà transmis — modification impossible")

    update = {}
    # Permet de fixer une table ou de la retirer (table_number=null)
    update["table_number"] = body.table_number if body.table_number is not None else None
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.coach_players.update_one({"id": player_id}, {"$set": update})
    updated = await db.coach_players.find_one({"id": player_id}, {"_id": 0})
    return {"success": True, "player": updated}


class TransmitBody(BaseModel):
    player_ids: List[str]
    actor_name: str
    actor_role: str
    bon_notes: Optional[str] = ""


@router.post("/coach/players/transmit")
async def transmit_players(body: TransmitBody):
    if body.actor_role not in ("coach_jeux", "admin"):
        raise HTTPException(403, "Action réservée")
    if not body.player_ids:
        raise HTTPException(400, "Sélectionnez au moins un joueur")
    players = await db.coach_players.find(
        {"id": {"$in": body.player_ids}, "status": "open"},
        {"_id": 0},
    ).to_list(50)
    if not players:
        raise HTTPException(404, "Aucun joueur trouvé/encore ouvert")

    # Construit les items + la liste des joueurs
    bon_items = []
    player_names = []
    for p in players:
        pname = p.get("player_name", "")
        player_names.append(pname)
        for it in p.get("items") or []:
            note = it.get("notes", "")
            # Préfixe par joueur
            note_with = f"[{pname}]" + (f" {note}" if note else "")
            bon_items.append({
                "jeu_product_id": it.get("jeu_product_id"),
                "jeu_name": it.get("jeu_name"),
                "parties": int(it.get("parties") or 1),
                "unit_price": float(it.get("unit_price") or 0),
                "duration_minutes": it.get("duration_minutes"),
                "notes": note_with,
                "billing_mode": it.get("billing_mode") or "parties",
                "hours": it.get("hours"),
                "hourly_rate": it.get("hourly_rate"),
            })
    if not bon_items:
        raise HTTPException(400, "Aucune consommation à transmettre")

    now_iso = datetime.now(timezone.utc).isoformat()
    total = round(sum(float(it.get("unit_price") or 0) * int(it.get("parties") or 1) for it in bon_items), 2)
    total_duration = sum(int(it.get("duration_minutes") or 0) for it in bon_items) or None
    # Crée le bon Jeux directement (pas via HTTP, en interne)
    bon = {
        "id": str(uuid.uuid4()),
        "items": [
            {**it, "total": round(float(it["unit_price"]) * int(it["parties"]), 2)}
            for it in bon_items
        ],
        "total": total,
        "total_duration_minutes": total_duration,
        "players": ", ".join(player_names),
        "notes": (body.bon_notes or "").strip(),
        "coach_name": body.actor_name,
        "coach_role": body.actor_role,
        "status": "pending",
        "table_id": None,
        "table_number": None,
        "invoice_id": None,
        "invoice_number": None,
        "rejection_reason": None,
        "processed_by": None,
        "processed_by_role": None,
        "processed_at": None,
        "created_at": now_iso,
    }
    await db.jeux_bons.insert_one(bon)
    # Marque les joueurs transmis
    await db.coach_players.update_many(
        {"id": {"$in": [p["id"] for p in players]}},
        {"$set": {"status": "transmitted", "transmitted_at": now_iso, "bon_id": bon["id"], "updated_at": now_iso}},
    )
    bon.pop("_id", None)
    return {"success": True, "bon_id": bon["id"], "transmitted_count": len(players), "total": total}


class TransmitAndAttachBody(BaseModel):
    table_id: str
    actor_name: str
    actor_role: str  # admin | manager | server (les agents peuvent aussi facturer un bon)
    bon_notes: Optional[str] = ""


@router.post("/coach/players/transmit-to-table")
async def transmit_players_to_table(body: TransmitAndAttachBody):
    """One-click depuis la CaissePage : transmet TOUS les joueurs ouverts rattachés
    à la table puis attache directement le bon à cette table (équivalent
    transmit + attach en un seul appel).

    Cas d'usage : l'agent / Resp. Op. voit le panneau violet "🎮 X joueurs sur cette
    table" et clique "Facturer maintenant". Les articles jeux sont ajoutés à la
    commande en cours sans passer par le menu Coach.
    """
    if body.actor_role not in ("admin", "manager", "server"):
        raise HTTPException(403, "Action réservée")

    table = await db.caisse_tables.find_one({"id": body.table_id}, {"_id": 0})
    if not table:
        raise HTTPException(404, "Table introuvable")
    table_number = table.get("table_number")
    if table_number is None:
        raise HTTPException(400, "Table sans numéro")

    # Récupère tous les joueurs ouverts sur cette table
    players = await db.coach_players.find(
        {"table_number": int(table_number), "status": "open"}, {"_id": 0}
    ).to_list(50)
    if not players:
        raise HTTPException(404, f"Aucun joueur ouvert sur la table {table_number}")

    # Construit les items du bon (réutilise la logique de transmit_players)
    bon_items = []
    player_names = []
    for p in players:
        pname = p.get("player_name", "")
        player_names.append(pname)
        for it in p.get("items") or []:
            note = it.get("notes", "")
            note_with = f"[{pname}]" + (f" {note}" if note else "")
            bon_items.append({
                "jeu_product_id": it.get("jeu_product_id"),
                "jeu_name": it.get("jeu_name"),
                "parties": int(it.get("parties") or 1),
                "unit_price": float(it.get("unit_price") or 0),
                "duration_minutes": it.get("duration_minutes"),
                "notes": note_with,
                "billing_mode": it.get("billing_mode") or "parties",
                "hours": it.get("hours"),
                "hourly_rate": it.get("hourly_rate"),
            })
    if not bon_items:
        raise HTTPException(400, "Aucune consommation à transmettre")

    now_iso = datetime.now(timezone.utc).isoformat()
    total = round(sum(
        (float(it.get("hours") or 0) * float(it.get("hourly_rate") or 0))
        if it.get("billing_mode") == "hourly"
        else (float(it.get("unit_price") or 0) * int(it.get("parties") or 1))
        for it in bon_items
    ), 2)
    total_duration = sum(int(it.get("duration_minutes") or 0) for it in bon_items) or None

    bon_id = str(uuid.uuid4())
    bon = {
        "id": bon_id,
        "items": [
            {**it, "total": round(
                (float(it["hours"] or 0) * float(it["hourly_rate"] or 0))
                if it.get("billing_mode") == "hourly"
                else (float(it["unit_price"]) * int(it["parties"])), 2
            )}
            for it in bon_items
        ],
        "total": total,
        "total_duration_minutes": total_duration,
        "players": ", ".join(player_names),
        "notes": (body.bon_notes or "").strip(),
        "coach_name": "(transmis depuis Caisse)",
        "coach_role": "coach_jeux",
        # Bon directement attaché à la table : status = attached
        "status": "attached",
        "table_id": body.table_id,
        "table_number": table_number,
        "invoice_id": None,
        "invoice_number": None,
        "rejection_reason": None,
        "processed_by": body.actor_name,
        "processed_by_role": body.actor_role,
        "processed_at": now_iso,
        "created_at": now_iso,
    }
    await db.jeux_bons.insert_one(bon)

    # Marque les joueurs comme transmis
    await db.coach_players.update_many(
        {"id": {"$in": [p["id"] for p in players]}},
        {"$set": {"status": "transmitted", "transmitted_at": now_iso, "bon_id": bon_id, "updated_at": now_iso}},
    )

    # Ajoute les items à la table active
    new_items = []
    for it in bon["items"]:
        new_items.append({
            "id": str(uuid.uuid4()),
            "product_id": it.get("jeu_product_id"),
            "name": it.get("jeu_name"),
            "quantity": int(it.get("parties") or 1),
            "price": float(it.get("unit_price") or 0),
            "total": float(it.get("total") or 0),
            "department": "jeux",
            "category": "jeux",
            "notes": it.get("notes", ""),
            "from_jeux_bon": bon_id,
            "added_at": now_iso,
            "added_by": body.actor_name,
        })
    items = (table.get("items") or []) + new_items
    await db.caisse_tables.update_one(
        {"id": body.table_id},
        {"$set": {"items": items, "updated_at": now_iso}},
    )

    return {
        "success": True,
        "bon_id": bon_id,
        "transmitted_players": len(players),
        "items_added": len(new_items),
        "total": total,
        "table_number": table_number,
    }
