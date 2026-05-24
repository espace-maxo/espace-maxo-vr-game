"""
Receipt Scanner — Scan de tickets/reçus via Gemini 3.1 Pro Preview (vision).

POST /api/receipt-scan/extract
  body: { image_base64: str, mime_type?: str }
  returns: { supplier, items: [...], total, currency, raw_text? }

L'extraction est ensuite utilisée pour auto-créer une demande d'achat
(expense) en statut "pending" — l'admin valide ensuite normalement.
"""
import base64
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from dotenv import load_dotenv
from emergentintegrations.llm.chat import ImageContent, LlmChat, UserMessage
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

load_dotenv()

router = APIRouter(tags=["receipt-scan"])
db = None
logger = logging.getLogger(__name__)


def set_db(database):
    global db
    db = database


# ============================================================================
# MODELS
# ============================================================================

class ScanPayload(BaseModel):
    image_base64: str
    mime_type: Optional[str] = "image/jpeg"
    auto_create_expense: bool = True  # crée une demande d'achat en pending
    requested_by: Optional[str] = ""
    requested_by_role: Optional[str] = "manager"
    receipt_type: Optional[str] = "auto"  # "auto" | "printed" | "handwritten"
    target: Optional[str] = "expense"  # "expense" | "appro" (liste shopping_list)


# ============================================================================
# PROMPTS
# ============================================================================

PROMPT_PRINTED = """Tu es un assistant d'extraction de données depuis un ticket de caisse imprimé.

L'image est un ticket de caisse / reçu IMPRIMÉ (probablement thermique, contexte béninois, en français).

Schéma de réponse (JSON STRICT, sans markdown, sans texte additionnel) :
{
  "supplier": "Nom du magasin/fournisseur (ex: 'Champion', 'Erevan', 'Marché Tokpa')",
  "items": [ { "description": "...", "quantity": <nb>, "unit_price": <nb F CFA>, "amount": <nb> } ],
  "total": <nb F CFA>,
  "currency": "F CFA",
  "confidence": "high" | "medium" | "low"
}

Règles :
- Prix en F CFA — NE PAS convertir.
- Si quantité absente : quantity=1.
- Regroupe les doublons.
- supplier inconnu → "Inconnu".
- total manquant → calcule la somme.
- Réponds UNIQUEMENT le JSON.
"""

PROMPT_HANDWRITTEN = """Tu es un assistant expert en extraction de données depuis un REÇU MANUSCRIT (écrit à la main).

L'image est un reçu écrit à la main (cahier de marché, bon de livraison fournisseur, ticket manuscrit), souvent en français du Bénin/Afrique de l'Ouest avec des particularités:
  - Écriture parfois inclinée, irrégulière ou en majuscules
  - Orthographe approximative (ex: "tomatte", "ougnons", "huil") — corrige intelligemment vers le mot le plus probable
  - Prix barrés/raturés → utilise le prix FINAL (le plus à droite ou le dernier corrigé)
  - Unités fréquentes : "sac", "kg", "tas", "paquet", "boîte", "pièce", "bidon", "litre"
  - Symbole monétaire varié : "FCFA", "F CFA", "F", parfois rien — toujours considérer F CFA
  - Marqueurs de quantité : "x 3", "x3", "3 x", "(3)" ou simplement "3 sacs", "2 kg"

Schéma de réponse (JSON STRICT, sans markdown, sans texte additionnel) :
{
  "supplier": "Nom du fournisseur ou lieu (ex: 'Marché Dantokpa', 'Mama Ayaba', 'Boutique Erevan')",
  "items": [ { "description": "Description corrigée et lisible", "quantity": <nb>, "unit_price": <nb F CFA>, "amount": <nb> } ],
  "total": <nb F CFA>,
  "currency": "F CFA",
  "confidence": "high" | "medium" | "low"
}

Règles critiques :
- Tous les prix sont en F CFA.
- Corrige l'orthographe vers les mots de cuisine/marché courants ("tomatte" → "Tomates", "ougnons" → "Oignons", "huil" → "Huile").
- Si une ligne est totalement illisible, ignore-la.
- Si tu détectes un total écrit (ex: "Total 12500" ou "T : 12500" ou un montant souligné/encadré), utilise-le. Sinon calcule.
- Confiance : "high" si le reçu est lisible, "medium" si quelques mots sont incertains, "low" si plus de la moitié est illisible/raturée.
- Si le fournisseur est introuvable, mets "Reçu manuscrit".
- Réponds UNIQUEMENT le JSON.
"""

PROMPT_AUTO = """Tu es un assistant d'extraction de données depuis un ticket/reçu d'achat.

Détecte automatiquement si le document est :
- un ticket IMPRIMÉ (ticket de caisse thermique, facture imprimée) ;
- ou un reçu MANUSCRIT (cahier marché, bon de livraison fournisseur écrit à la main).

Contexte : Bénin, français. Tous les prix sont en F CFA (jamais en €).

Schéma JSON STRICT (sans markdown, sans texte additionnel) :
{
  "supplier": "Nom du magasin OU lieu OU 'Reçu manuscrit' OU 'Inconnu'",
  "items": [ { "description": "...", "quantity": <nb>, "unit_price": <nb F CFA>, "amount": <nb> } ],
  "total": <nb F CFA>,
  "currency": "F CFA",
  "confidence": "high" | "medium" | "low"
}

Règles :
- Si manuscrit : corrige intelligemment l'orthographe vers des termes de cuisine/marché courants (ex: "tomatte" → "Tomates", "ougnons" → "Oignons", "huil" → "Huile végétale"). Utilise le PRIX FINAL si plusieurs sont barrés/raturés.
- Si quantité absente, mets 1.
- Si total absent, calcule la somme des amounts.
- Regroupe les doublons.
- Ignore les lignes totalement illisibles (manuscrit).
- Réponds UNIQUEMENT le JSON.
"""


def _prompt_for(receipt_type: str) -> str:
    rt = (receipt_type or "auto").lower()
    if rt == "handwritten" or rt == "manuscrit":
        return PROMPT_HANDWRITTEN
    if rt == "printed" or rt == "imprime" or rt == "imprimé":
        return PROMPT_PRINTED
    return PROMPT_AUTO


def _strip_markdown(text: str) -> str:
    """Enlève d'éventuels blocs markdown ```json ... ``` autour de la réponse."""
    s = (text or "").strip()
    s = re.sub(r"^```(?:json)?\s*", "", s)
    s = re.sub(r"\s*```\s*$", "", s)
    return s.strip()


def _validate_base64(b64: str) -> bytes:
    """Valide qu'on a bien un base64 décodable et un payload non-vide raisonnable."""
    try:
        # Strip data URL prefix if any
        if "," in b64 and b64.lower().startswith("data:"):
            b64 = b64.split(",", 1)[1]
        raw = base64.b64decode(b64, validate=True)
    except Exception as e:
        raise HTTPException(400, f"Image base64 invalide : {e}")
    if len(raw) < 100:
        raise HTTPException(400, "Image trop petite ou vide")
    if len(raw) > 12 * 1024 * 1024:
        raise HTTPException(400, "Image trop volumineuse (max 12 Mo)")
    return raw


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/receipt-scan/extract")
async def extract_receipt(payload: ScanPayload):
    """Scan d'un ticket → extraction structurée + optionnellement
    création d'une demande d'achat (expense pending)."""
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "EMERGENT_LLM_KEY non configurée")

    # Sanity-check image
    _validate_base64(payload.image_base64)

    # Strip data URL prefix if present
    img_b64 = payload.image_base64
    if "," in img_b64 and img_b64.lower().startswith("data:"):
        img_b64 = img_b64.split(",", 1)[1]

    # Call Gemini
    chat = LlmChat(
        api_key=key,
        session_id=f"receipt-{uuid.uuid4().hex[:8]}",
        system_message="Tu es un expert en extraction de données de tickets imprimés ET de reçus manuscrits (contexte béninois). Tu réponds UNIQUEMENT en JSON valide.",
    ).with_model("gemini", "gemini-3.1-pro-preview")

    img = ImageContent(image_base64=img_b64)
    prompt = _prompt_for(payload.receipt_type or "auto")
    msg = UserMessage(text=prompt, file_contents=[img])

    try:
        response_text = await chat.send_message(msg)
    except Exception as e:
        logger.error(f"Gemini call failed: {e}")
        raise HTTPException(502, f"Erreur lecture du ticket : {e}")

    parsed = _strip_markdown(response_text)
    try:
        data: dict = json.loads(parsed)
    except Exception as e:
        logger.error(f"Gemini JSON parse failed. Response: {response_text[:500]}")
        raise HTTPException(502, f"Impossible de parser la réponse IA : {e}")

    # Sanitize / normalize
    supplier = (data.get("supplier") or "Inconnu").strip() or "Inconnu"
    raw_items = data.get("items") or []
    items: list[dict[str, Any]] = []
    for it in raw_items:
        desc = (it.get("description") or "").strip()
        if not desc:
            continue
        try:
            qty = float(it.get("quantity") or 1)
            unit = float(it.get("unit_price") or 0)
        except Exception:
            continue
        amount = float(it.get("amount") or (qty * unit))
        items.append({
            "description": desc,
            "quantity": qty,
            "unit_price": unit,
            "amount": amount,
            "category": "fournitures",  # default catégorie côté backend
        })
    total = float(data.get("total") or sum(i["amount"] for i in items))
    confidence = (data.get("confidence") or "medium").lower()

    extracted = {
        "supplier": supplier,
        "items": items,
        "total": total,
        "currency": "F CFA",
        "confidence": confidence,
    }

    # Optionnel : créer une demande d'achat OU insérer en liste Appro Manager
    created_expense_id = None
    appro_inserted = 0
    target_mode = (payload.target or "expense").lower()
    if payload.auto_create_expense and items:
        if target_mode == "appro":
            # Insérer chaque item dans shopping_list_items (Appro Manager)
            try:
                now_iso = datetime.now(timezone.utc).isoformat()
                docs = []
                for it in items:
                    qty = float(it["quantity"] or 1)
                    unit = float(it["unit_price"] or 0)
                    docs.append({
                        "id": str(uuid.uuid4()),
                        "name": it["description"],
                        "quantity": qty,
                        "unit": "",
                        "estimated_unit_price": unit,
                        "estimated_total": qty * unit,
                        "scope": "restaurant",
                        "reservation_id": None,
                        "reservation_label": None,
                        "expense_id": None,
                        "expense_item_index": None,
                        "category": it.get("category") or "",
                        "notes": f"Importé du scan ticket — {supplier}",
                        "status": "pending",
                        "done_by": None,
                        "done_at": None,
                        "real_unit_price": None,
                        "real_supplier": supplier,  # pré-remplit le fournisseur
                        "real_total": None,
                        "created_at": now_iso,
                        "created_by": (payload.requested_by or "Gérante"),
                        "scan_supplier": supplier,
                    })
                if docs:
                    await db.shopping_list_items.insert_many(docs)
                    appro_inserted = len(docs)
            except Exception as e:
                logger.error(f"Appro insert failed: {e}")
        else:
            try:
                now = datetime.now(timezone.utc).isoformat()
                doc = {
                    "id": str(uuid.uuid4()),
                    "description": f"Scan ticket — {supplier}",
                    "amount": total,
                    "supplier": supplier,
                    "category": "fournitures",
                    "expense_type": "courant",
                    "is_group": True,
                    "items": [
                        {**it, "id": str(uuid.uuid4()), "expense_type": "courant"}
                        for it in items
                    ],
                    "original_items": [
                        {**it, "id": str(uuid.uuid4()), "expense_type": "courant"}
                        for it in items
                    ],
                    "status": "pending",
                    "requested_by": payload.requested_by or "Gérante",
                    "requested_by_role": payload.requested_by_role or "manager",
                    "created_at": now,
                    "updated_at": now,
                    "source": "receipt_scan",
                }
                await db.expenses.insert_one(doc)
                created_expense_id = doc["id"]
            except Exception as e:
                logger.error(f"Auto-create expense failed: {e}")

    return {
        "success": True,
        "extracted": extracted,
        "expense_id": created_expense_id,
        "appro_inserted": appro_inserted,
        "target": target_mode,
    }
