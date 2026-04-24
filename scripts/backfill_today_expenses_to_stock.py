"""
One-shot : synchronise les achats terminés (status='completed') du jour vers le Stock.

Pour chaque expense complété aujourd'hui :
- Skip si un stock_purchase avec source='caisse' et expense_id=X existe déjà (idempotent).
- Sinon, pour chaque item : match produit existant (exact/prefix/substring) → si trouvé,
  incrémente qty + enregistre mouvement entree ; sinon auto-crée le produit (catégorie
  'Non classé') puis enregistre le mouvement lié.
- Enregistre un stock_purchase synthétique marqué source='caisse'.

Lancer : python3 /app/scripts/backfill_today_expenses_to_stock.py
"""
import asyncio
import os
import re
import sys
import uuid
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    now_iso = datetime.now(timezone.utc).isoformat()

    # Completed expenses with completed_at starting today
    query = {
        "status": "completed",
        "completed_at": {"$regex": f"^{today}"},
    }
    expenses = await db.expenses.find(query, {"_id": 0}).to_list(1000)
    print(f"Found {len(expenses)} expense(s) completed today ({today})")

    if not expenses:
        print("Nothing to do.")
        return

    # Ensure "Non classé" category
    nonclass = await db.stock_categories.find_one({"name": {"$regex": "^Non classé$", "$options": "i"}})
    if not nonclass:
        nonclass = {
            "id": str(uuid.uuid4()),
            "name": "Non classé",
            "description": "Catégorie par défaut pour les produits auto-créés depuis la Caisse",
            "color": "#64748b",
            "icon": "Package",
            "subcategories": [],
            "created_at": now_iso,
        }
        await db.stock_categories.insert_one(nonclass)
        print(f"→ Created category 'Non classé' ({nonclass['id']})")

    processed = 0
    skipped = 0
    total_created = 0
    total_updated = 0

    for exp in expenses:
        expense_id = exp["id"]

        # Idempotency: skip if already synced
        existing_purchase = await db.stock_purchases.find_one({
            "source": "caisse",
            "expense_id": expense_id,
        })
        if existing_purchase:
            skipped += 1
            print(f"  [SKIP] expense {expense_id[:8]} '{exp.get('description')[:40]}' already synced")
            continue

        # Build item list
        if exp.get("is_group") and exp.get("items"):
            items = exp["items"]
        else:
            items = [{
                "description": exp.get("description", ""),
                "quantity": exp.get("quantity", 1),
                "unit_price": exp.get("unit_price") or exp.get("amount", 0),
                "amount": exp.get("amount", 0),
                "category": exp.get("category", ""),
                "unit": exp.get("unit") or "",
            }]

        purchase_items = []
        synced = 0

        for it in items:
            desc = (it.get("description") or "").strip()
            qty = it.get("quantity", 1) or 1
            price = it.get("unit_price", 0) or 0
            if not desc:
                continue

            escaped = re.escape(desc)
            prod = await db.stock_products.find_one({
                "name": {"$regex": f"^{escaped}$", "$options": "i"}, "is_active": True
            })
            if not prod:
                prod = await db.stock_products.find_one({
                    "name": {"$regex": f"^{escaped}", "$options": "i"}, "is_active": True
                })
            if not prod:
                prod = await db.stock_products.find_one({
                    "name": {"$regex": escaped, "$options": "i"}, "is_active": True
                })

            if prod:
                old_qty = prod.get("quantity", 0)
                new_qty = old_qty + qty
                new_price = price if price > 0 else prod.get("purchase_price", 0)
                smin = prod.get("stock_min", 5)
                new_statut = "rupture" if new_qty <= 0 else ("faible" if new_qty <= smin else "normal")
                await db.stock_products.update_one(
                    {"id": prod["id"]},
                    {"$set": {
                        "quantity": new_qty,
                        "purchase_price": new_price,
                        "valeur_stock": new_qty * new_price,
                        "statut": new_statut,
                        "updated_at": now_iso,
                    }},
                )
                await db.stock_movements.insert_one({
                    "id": str(uuid.uuid4()),
                    "product_id": prod["id"],
                    "product_name": prod["name"],
                    "product_code": prod.get("code", ""),
                    "movement_type": "entree",
                    "quantity": qty,
                    "previous_quantity": old_qty,
                    "new_quantity": new_qty,
                    "unit": prod.get("unit", ""),
                    "unit_price": new_price,
                    "total_value": qty * new_price,
                    "reason": f"Achat Caisse (backfill) - {exp.get('supplier', 'N/A')}",
                    "user_name": exp.get("requested_by", "Caisse"),
                    "expense_id": expense_id,
                    "created_at": now_iso,
                })
                purchase_items.append({
                    "product_id": prod["id"],
                    "product_name": prod["name"],
                    "quantity": qty,
                    "unit_price": new_price,
                    "unit": prod.get("unit", ""),
                })
                total_updated += 1
                synced += 1
            else:
                unit = it.get("unit") or "unite"
                new_product = {
                    "id": str(uuid.uuid4()),
                    "code": f"AUTO-{str(uuid.uuid4())[:6].upper()}",
                    "name": desc,
                    "category_id": nonclass["id"],
                    "subcategory": "",
                    "unit": unit,
                    "quantity": qty,
                    "stock_min": 5,
                    "stock_max": max(100, qty * 4),
                    "purchase_price": price,
                    "valeur_stock": qty * price,
                    "supplier_id": "",
                    "storage_location": "",
                    "is_active": True,
                    "photo_url": "",
                    "date_achat": today,
                    "date_peremption": "",
                    "observation": f"Auto-créé depuis Achat Caisse ({exp.get('supplier', 'N/A')})",
                    "statut": "rupture" if qty <= 0 else ("faible" if qty <= 5 else "normal"),
                    "auto_created_from_expense": expense_id,
                    "created_at": now_iso,
                    "updated_at": now_iso,
                }
                await db.stock_products.insert_one(new_product)
                await db.stock_movements.insert_one({
                    "id": str(uuid.uuid4()),
                    "product_id": new_product["id"],
                    "product_name": new_product["name"],
                    "product_code": new_product["code"],
                    "movement_type": "entree",
                    "quantity": qty,
                    "previous_quantity": 0,
                    "new_quantity": qty,
                    "unit": unit,
                    "unit_price": price,
                    "total_value": qty * price,
                    "reason": f"Achat Caisse (backfill, produit auto-créé) - {exp.get('supplier', 'N/A')}",
                    "user_name": exp.get("requested_by", "Caisse"),
                    "expense_id": expense_id,
                    "created_at": now_iso,
                })
                purchase_items.append({
                    "product_id": new_product["id"],
                    "product_name": new_product["name"],
                    "quantity": qty,
                    "unit_price": price,
                    "unit": unit,
                })
                total_created += 1
                synced += 1
                print(f"    + AUTO-CREATED '{desc}' qty={qty} price={price}")

        total_amount = sum(i["quantity"] * i["unit_price"] for i in purchase_items)
        await db.stock_purchases.insert_one({
            "id": str(uuid.uuid4()),
            "supplier_id": "",
            "supplier_name": exp.get("supplier", "") or exp.get("description", "Caisse"),
            "purchase_date": today,
            "items": purchase_items,
            "total_amount": total_amount,
            "notes": f"Backfill Caisse - {exp.get('description', '')}",
            "user_name": exp.get("requested_by", "Caisse"),
            "status": "validated",
            "source": "caisse",
            "expense_id": expense_id,
            "created_at": now_iso,
        })
        processed += 1
        print(f"  [OK] expense {expense_id[:8]} '{exp.get('description')[:40]}' → {synced} item(s) synced")

    print()
    print(f"=== SUMMARY ===")
    print(f"  Processed   : {processed}")
    print(f"  Skipped     : {skipped} (already synced)")
    print(f"  Auto-created: {total_created} product(s)")
    print(f"  Updated     : {total_updated} existing product(s)")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
