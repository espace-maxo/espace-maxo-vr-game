"""
Quick Products — Catalogue de produits courants Marché / Supermarché.

Référentiel de produits couramment achetés au Bénin (Dantokpa, Erevan, Champion).
Utilisé dans le Simulateur de devis Locations pour clics rapides.

Collection : quick_products
{
  id, name, category, unit_cost, unit, source ("benin_market"), is_active,
  created_at, updated_at
}

Seed automatique au démarrage si la collection est vide (~85 produits FCFA).
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel

router = APIRouter(tags=["quick_products"])
db = None
logger = logging.getLogger(__name__)


def set_db(database):
    global db
    db = database


# ============================================================================
# Référentiel initial (prix moyens FCFA observés Bénin - marché/supermarché)
# ============================================================================
SEED_PRODUCTS = [
    # === BOISSONS — Eaux & Soft ===
    {"name": "Eau minérale 1.5L", "category": "Boissons", "unit_cost": 500, "unit": "bouteille"},
    {"name": "Eau minérale 0.5L", "category": "Boissons", "unit_cost": 250, "unit": "bouteille"},
    {"name": "Eau gazeuse 1L", "category": "Boissons", "unit_cost": 1000, "unit": "bouteille"},
    {"name": "Coca-Cola 1.5L", "category": "Boissons", "unit_cost": 1000, "unit": "bouteille"},
    {"name": "Coca-Cola 33cl", "category": "Boissons", "unit_cost": 500, "unit": "bouteille"},
    {"name": "Coca Zero 33cl", "category": "Boissons", "unit_cost": 500, "unit": "bouteille"},
    {"name": "Fanta 1.5L", "category": "Boissons", "unit_cost": 1000, "unit": "bouteille"},
    {"name": "Fanta 33cl", "category": "Boissons", "unit_cost": 500, "unit": "bouteille"},
    {"name": "Sprite 1.5L", "category": "Boissons", "unit_cost": 1000, "unit": "bouteille"},
    {"name": "Sprite 33cl", "category": "Boissons", "unit_cost": 500, "unit": "bouteille"},
    {"name": "Schweppes 33cl", "category": "Boissons", "unit_cost": 500, "unit": "bouteille"},
    {"name": "Tonic 33cl", "category": "Boissons", "unit_cost": 600, "unit": "bouteille"},
    {"name": "Youki 33cl", "category": "Boissons", "unit_cost": 400, "unit": "bouteille"},
    {"name": "Bissap 1L (maison)", "category": "Boissons", "unit_cost": 1500, "unit": "litre"},
    {"name": "Gingembre 1L (maison)", "category": "Boissons", "unit_cost": 1500, "unit": "litre"},
    # === BOISSONS — Jus ===
    {"name": "Jus d'orange 1L", "category": "Boissons", "unit_cost": 1500, "unit": "bouteille"},
    {"name": "Jus de mangue 1L", "category": "Boissons", "unit_cost": 1500, "unit": "bouteille"},
    {"name": "Jus d'ananas 1L", "category": "Boissons", "unit_cost": 1500, "unit": "bouteille"},
    {"name": "Jus multifruits 1L", "category": "Boissons", "unit_cost": 1500, "unit": "bouteille"},
    {"name": "Sirop grenadine 75cl", "category": "Boissons", "unit_cost": 2500, "unit": "bouteille"},
    {"name": "Sirop menthe 75cl", "category": "Boissons", "unit_cost": 2500, "unit": "bouteille"},
    # === BOISSONS — Énergie & chaudes ===
    {"name": "Red Bull 25cl", "category": "Boissons", "unit_cost": 1500, "unit": "canette"},
    {"name": "XXL Energy 50cl", "category": "Boissons", "unit_cost": 1000, "unit": "canette"},
    {"name": "Café moulu 250g", "category": "Boissons", "unit_cost": 2500, "unit": "paquet"},
    {"name": "Café soluble 100g", "category": "Boissons", "unit_cost": 3000, "unit": "boîte"},
    {"name": "Thé Lipton (25 sachets)", "category": "Boissons", "unit_cost": 1500, "unit": "boîte"},
    {"name": "Chocolat en poudre 500g", "category": "Boissons", "unit_cost": 3500, "unit": "boîte"},
    # === BOISSONS — Bières / Alcools ===
    {"name": "Bière La Béninoise 65cl", "category": "Boissons", "unit_cost": 800, "unit": "bouteille"},
    {"name": "Bière La Béninoise 33cl", "category": "Boissons", "unit_cost": 500, "unit": "bouteille"},
    {"name": "Bière Castel 65cl", "category": "Boissons", "unit_cost": 800, "unit": "bouteille"},
    {"name": "Bière Castel 33cl", "category": "Boissons", "unit_cost": 500, "unit": "bouteille"},
    {"name": "Bière Heineken 33cl", "category": "Boissons", "unit_cost": 1000, "unit": "bouteille"},
    {"name": "Bière Guinness 33cl", "category": "Boissons", "unit_cost": 1200, "unit": "bouteille"},
    {"name": "Vin rouge 75cl", "category": "Boissons", "unit_cost": 4500, "unit": "bouteille"},
    {"name": "Vin blanc 75cl", "category": "Boissons", "unit_cost": 4500, "unit": "bouteille"},
    {"name": "Vin rosé 75cl", "category": "Boissons", "unit_cost": 4500, "unit": "bouteille"},
    {"name": "Champagne 75cl", "category": "Boissons", "unit_cost": 12000, "unit": "bouteille"},
    {"name": "Whisky 70cl", "category": "Boissons", "unit_cost": 15000, "unit": "bouteille"},
    {"name": "Vodka 70cl", "category": "Boissons", "unit_cost": 12000, "unit": "bouteille"},
    {"name": "Gin 70cl", "category": "Boissons", "unit_cost": 12000, "unit": "bouteille"},
    {"name": "Rhum 70cl", "category": "Boissons", "unit_cost": 10000, "unit": "bouteille"},
    {"name": "Sodabi 1L", "category": "Boissons", "unit_cost": 2000, "unit": "litre"},
    {"name": "Liqueur (Baileys, Amarula) 70cl", "category": "Boissons", "unit_cost": 18000, "unit": "bouteille"},

    # === VIANDES & POISSONS ===
    {"name": "Poulet entier", "category": "Viandes & Poissons", "unit_cost": 4000, "unit": "pièce"},
    {"name": "Poulet découpé 1kg", "category": "Viandes & Poissons", "unit_cost": 3500, "unit": "kg"},
    {"name": "Cuisses de poulet", "category": "Viandes & Poissons", "unit_cost": 3500, "unit": "kg"},
    {"name": "Ailes de poulet", "category": "Viandes & Poissons", "unit_cost": 3500, "unit": "kg"},
    {"name": "Pilon de poulet", "category": "Viandes & Poissons", "unit_cost": 3000, "unit": "kg"},
    {"name": "Filet de bœuf", "category": "Viandes & Poissons", "unit_cost": 5500, "unit": "kg"},
    {"name": "Bœuf à mijoter", "category": "Viandes & Poissons", "unit_cost": 4000, "unit": "kg"},
    {"name": "Bœuf haché", "category": "Viandes & Poissons", "unit_cost": 4500, "unit": "kg"},
    {"name": "Brochettes de bœuf", "category": "Viandes & Poissons", "unit_cost": 5000, "unit": "kg"},
    {"name": "Mouton", "category": "Viandes & Poissons", "unit_cost": 5000, "unit": "kg"},
    {"name": "Côtes de mouton", "category": "Viandes & Poissons", "unit_cost": 5500, "unit": "kg"},
    {"name": "Porc", "category": "Viandes & Poissons", "unit_cost": 4500, "unit": "kg"},
    {"name": "Côtes de porc", "category": "Viandes & Poissons", "unit_cost": 5000, "unit": "kg"},
    {"name": "Lardons fumés 200g", "category": "Viandes & Poissons", "unit_cost": 2500, "unit": "paquet"},
    {"name": "Jambon 200g", "category": "Viandes & Poissons", "unit_cost": 2500, "unit": "paquet"},
    {"name": "Saucisses (lot)", "category": "Viandes & Poissons", "unit_cost": 3500, "unit": "paquet"},
    {"name": "Agouti", "category": "Viandes & Poissons", "unit_cost": 6000, "unit": "kg"},
    {"name": "Lapin", "category": "Viandes & Poissons", "unit_cost": 5000, "unit": "kg"},
    {"name": "Tilapia", "category": "Viandes & Poissons", "unit_cost": 3500, "unit": "kg"},
    {"name": "Bar (poisson)", "category": "Viandes & Poissons", "unit_cost": 4500, "unit": "kg"},
    {"name": "Capitaine (poisson)", "category": "Viandes & Poissons", "unit_cost": 5000, "unit": "kg"},
    {"name": "Carpe", "category": "Viandes & Poissons", "unit_cost": 3500, "unit": "kg"},
    {"name": "Crevettes", "category": "Viandes & Poissons", "unit_cost": 8000, "unit": "kg"},
    {"name": "Calamars", "category": "Viandes & Poissons", "unit_cost": 6000, "unit": "kg"},
    {"name": "Saumon fumé 200g", "category": "Viandes & Poissons", "unit_cost": 3500, "unit": "paquet"},
    {"name": "Thon en boîte 140g", "category": "Viandes & Poissons", "unit_cost": 1000, "unit": "boîte"},
    {"name": "Sardines en boîte", "category": "Viandes & Poissons", "unit_cost": 700, "unit": "boîte"},
    {"name": "Poisson fumé", "category": "Viandes & Poissons", "unit_cost": 3000, "unit": "kg"},
    {"name": "Poisson séché", "category": "Viandes & Poissons", "unit_cost": 4000, "unit": "kg"},
    {"name": "Foie", "category": "Viandes & Poissons", "unit_cost": 3000, "unit": "kg"},

    # === LÉGUMES ===
    {"name": "Tomates", "category": "Légumes", "unit_cost": 1000, "unit": "kg"},
    {"name": "Oignons", "category": "Légumes", "unit_cost": 800, "unit": "kg"},
    {"name": "Échalote", "category": "Légumes", "unit_cost": 2000, "unit": "kg"},
    {"name": "Pomme de terre", "category": "Légumes", "unit_cost": 1000, "unit": "kg"},
    {"name": "Carottes", "category": "Légumes", "unit_cost": 1500, "unit": "kg"},
    {"name": "Salade verte", "category": "Légumes", "unit_cost": 500, "unit": "pièce"},
    {"name": "Concombre", "category": "Légumes", "unit_cost": 300, "unit": "pièce"},
    {"name": "Poivron", "category": "Légumes", "unit_cost": 2000, "unit": "kg"},
    {"name": "Piment 100g", "category": "Légumes", "unit_cost": 300, "unit": "paquet"},
    {"name": "Gombo", "category": "Légumes", "unit_cost": 1500, "unit": "kg"},
    {"name": "Aubergine", "category": "Légumes", "unit_cost": 1000, "unit": "kg"},
    {"name": "Manioc", "category": "Légumes", "unit_cost": 500, "unit": "kg"},
    {"name": "Igname", "category": "Légumes", "unit_cost": 800, "unit": "kg"},
    {"name": "Patate douce", "category": "Légumes", "unit_cost": 700, "unit": "kg"},
    {"name": "Ail", "category": "Légumes", "unit_cost": 3000, "unit": "kg"},
    {"name": "Gingembre frais", "category": "Légumes", "unit_cost": 2000, "unit": "kg"},
    {"name": "Persil (botte)", "category": "Légumes", "unit_cost": 300, "unit": "botte"},
    {"name": "Basilic (botte)", "category": "Légumes", "unit_cost": 300, "unit": "botte"},
    {"name": "Coriandre (botte)", "category": "Légumes", "unit_cost": 300, "unit": "botte"},
    {"name": "Feuilles de patate (gboman)", "category": "Légumes", "unit_cost": 500, "unit": "botte"},
    {"name": "Crincrin (corette potagère)", "category": "Légumes", "unit_cost": 500, "unit": "botte"},
    {"name": "Choux blanc", "category": "Légumes", "unit_cost": 1000, "unit": "pièce"},
    {"name": "Haricots verts", "category": "Légumes", "unit_cost": 2500, "unit": "kg"},
    {"name": "Petits pois (boîte)", "category": "Légumes", "unit_cost": 1500, "unit": "boîte"},
    {"name": "Maïs (boîte)", "category": "Légumes", "unit_cost": 1500, "unit": "boîte"},
    {"name": "Champignon (boîte)", "category": "Légumes", "unit_cost": 2000, "unit": "boîte"},
    {"name": "Olives noires 200g", "category": "Légumes", "unit_cost": 2500, "unit": "boîte"},

    # === FRUITS ===
    {"name": "Banane", "category": "Fruits", "unit_cost": 700, "unit": "kg"},
    {"name": "Banane plantain", "category": "Fruits", "unit_cost": 800, "unit": "kg"},
    {"name": "Orange", "category": "Fruits", "unit_cost": 1000, "unit": "kg"},
    {"name": "Mandarine", "category": "Fruits", "unit_cost": 1500, "unit": "kg"},
    {"name": "Mangue", "category": "Fruits", "unit_cost": 1000, "unit": "kg"},
    {"name": "Ananas", "category": "Fruits", "unit_cost": 1500, "unit": "pièce"},
    {"name": "Papaye", "category": "Fruits", "unit_cost": 1000, "unit": "pièce"},
    {"name": "Pastèque", "category": "Fruits", "unit_cost": 2000, "unit": "pièce"},
    {"name": "Melon", "category": "Fruits", "unit_cost": 2500, "unit": "pièce"},
    {"name": "Avocat", "category": "Fruits", "unit_cost": 500, "unit": "pièce"},
    {"name": "Citron", "category": "Fruits", "unit_cost": 1500, "unit": "kg"},
    {"name": "Coco", "category": "Fruits", "unit_cost": 1000, "unit": "pièce"},
    {"name": "Goyave", "category": "Fruits", "unit_cost": 1500, "unit": "kg"},
    {"name": "Pomme (Granny/Royal)", "category": "Fruits", "unit_cost": 2500, "unit": "kg"},
    {"name": "Raisin", "category": "Fruits", "unit_cost": 3500, "unit": "kg"},
    {"name": "Fraise", "category": "Fruits", "unit_cost": 5000, "unit": "kg"},

    # === ÉPICERIE — Féculents ===
    {"name": "Riz parfumé 5kg", "category": "Épicerie", "unit_cost": 4500, "unit": "sac"},
    {"name": "Riz local", "category": "Épicerie", "unit_cost": 650, "unit": "kg"},
    {"name": "Riz basmati 5kg", "category": "Épicerie", "unit_cost": 9000, "unit": "sac"},
    {"name": "Pâtes spaghetti 500g", "category": "Épicerie", "unit_cost": 800, "unit": "paquet"},
    {"name": "Pâtes macaroni 500g", "category": "Épicerie", "unit_cost": 800, "unit": "paquet"},
    {"name": "Pâtes pennes 500g", "category": "Épicerie", "unit_cost": 800, "unit": "paquet"},
    {"name": "Couscous 1kg", "category": "Épicerie", "unit_cost": 1500, "unit": "paquet"},
    {"name": "Semoule 1kg", "category": "Épicerie", "unit_cost": 1500, "unit": "paquet"},
    {"name": "Farine de blé", "category": "Épicerie", "unit_cost": 700, "unit": "kg"},
    {"name": "Farine de maïs", "category": "Épicerie", "unit_cost": 500, "unit": "kg"},
    {"name": "Gari", "category": "Épicerie", "unit_cost": 800, "unit": "kg"},
    {"name": "Pâte d'amande / akpan 1kg", "category": "Épicerie", "unit_cost": 1200, "unit": "kg"},
    # === ÉPICERIE — Bases ===
    {"name": "Sucre", "category": "Épicerie", "unit_cost": 700, "unit": "kg"},
    {"name": "Sel", "category": "Épicerie", "unit_cost": 300, "unit": "kg"},
    {"name": "Huile de palme 1L", "category": "Épicerie", "unit_cost": 1500, "unit": "bouteille"},
    {"name": "Huile végétale 1L", "category": "Épicerie", "unit_cost": 1800, "unit": "bouteille"},
    {"name": "Huile d'olive 1L", "category": "Épicerie", "unit_cost": 6500, "unit": "bouteille"},
    {"name": "Beurre 200g", "category": "Épicerie", "unit_cost": 1500, "unit": "paquet"},
    {"name": "Margarine 250g", "category": "Épicerie", "unit_cost": 1200, "unit": "paquet"},
    {"name": "Œufs (douzaine)", "category": "Épicerie", "unit_cost": 2000, "unit": "douzaine"},
    {"name": "Pain baguette", "category": "Épicerie", "unit_cost": 250, "unit": "pièce"},
    {"name": "Pain rond", "category": "Épicerie", "unit_cost": 200, "unit": "pièce"},
    {"name": "Pain de mie", "category": "Épicerie", "unit_cost": 1500, "unit": "paquet"},
    {"name": "Pain burger (lot 6)", "category": "Épicerie", "unit_cost": 1500, "unit": "paquet"},
    # === ÉPICERIE — Sauces & Condiments ===
    {"name": "Tomate concentrée 70g", "category": "Épicerie", "unit_cost": 200, "unit": "boîte"},
    {"name": "Tomate concentrée 400g", "category": "Épicerie", "unit_cost": 1000, "unit": "boîte"},
    {"name": "Mayonnaise 500g", "category": "Épicerie", "unit_cost": 2500, "unit": "pot"},
    {"name": "Ketchup 500g", "category": "Épicerie", "unit_cost": 2500, "unit": "bouteille"},
    {"name": "Moutarde 250g", "category": "Épicerie", "unit_cost": 1500, "unit": "pot"},
    {"name": "Sauce soja 500ml", "category": "Épicerie", "unit_cost": 2000, "unit": "bouteille"},
    {"name": "Sauce piquante (Maggi)", "category": "Épicerie", "unit_cost": 1500, "unit": "bouteille"},
    {"name": "Vinaigre 1L", "category": "Épicerie", "unit_cost": 800, "unit": "bouteille"},
    {"name": "Bouillon (cube)", "category": "Épicerie", "unit_cost": 50, "unit": "cube"},
    {"name": "Maggi (sachet 100 cubes)", "category": "Épicerie", "unit_cost": 4500, "unit": "sachet"},
    {"name": "Épices à riz 100g", "category": "Épicerie", "unit_cost": 800, "unit": "paquet"},
    {"name": "Poivre noir 100g", "category": "Épicerie", "unit_cost": 1500, "unit": "paquet"},
    {"name": "Curry 100g", "category": "Épicerie", "unit_cost": 800, "unit": "paquet"},
    {"name": "Paprika 100g", "category": "Épicerie", "unit_cost": 800, "unit": "paquet"},
    {"name": "Cumin 100g", "category": "Épicerie", "unit_cost": 1000, "unit": "paquet"},
    {"name": "Feuille de laurier", "category": "Épicerie", "unit_cost": 500, "unit": "paquet"},
    # === ÉPICERIE — Laitiers & Conserves ===
    {"name": "Lait concentré 410g", "category": "Épicerie", "unit_cost": 1500, "unit": "boîte"},
    {"name": "Lait en poudre 400g", "category": "Épicerie", "unit_cost": 2500, "unit": "boîte"},
    {"name": "Lait UHT 1L", "category": "Épicerie", "unit_cost": 1500, "unit": "brique"},
    {"name": "Crème fraîche 200ml", "category": "Épicerie", "unit_cost": 1500, "unit": "pot"},
    {"name": "Yaourt nature (pack 4)", "category": "Épicerie", "unit_cost": 2000, "unit": "pack"},
    {"name": "Fromage râpé 200g", "category": "Épicerie", "unit_cost": 3000, "unit": "paquet"},
    {"name": "Fromage Vache qui Rit (24p)", "category": "Épicerie", "unit_cost": 3000, "unit": "boîte"},
    {"name": "Confiture 500g", "category": "Épicerie", "unit_cost": 2500, "unit": "pot"},
    {"name": "Miel 500g", "category": "Épicerie", "unit_cost": 4000, "unit": "pot"},
    {"name": "Cornichons 500g", "category": "Épicerie", "unit_cost": 2500, "unit": "bocal"},
    # === ÉPICERIE — Snacks & Goûters ===
    {"name": "Biscuits (paquet)", "category": "Snacks & Pâtisseries", "unit_cost": 500, "unit": "paquet"},
    {"name": "Chocolat tablette 100g", "category": "Snacks & Pâtisseries", "unit_cost": 1500, "unit": "tablette"},
    {"name": "Chips 100g", "category": "Snacks & Pâtisseries", "unit_cost": 1000, "unit": "paquet"},
    {"name": "Cacahuètes grillées 100g", "category": "Snacks & Pâtisseries", "unit_cost": 500, "unit": "paquet"},
    {"name": "Croissants (lot 4)", "category": "Snacks & Pâtisseries", "unit_cost": 2000, "unit": "lot"},
    {"name": "Pain au chocolat (lot 4)", "category": "Snacks & Pâtisseries", "unit_cost": 2000, "unit": "lot"},
    {"name": "Cake / gâteau 500g", "category": "Snacks & Pâtisseries", "unit_cost": 4000, "unit": "pièce"},
    {"name": "Glace pot 500ml", "category": "Snacks & Pâtisseries", "unit_cost": 3500, "unit": "pot"},

    # === DÉCORATION & FÊTE ===
    {"name": "Ballons (lot 50)", "category": "Décoration & Fête", "unit_cost": 3000, "unit": "lot"},
    {"name": "Guirlandes (lot)", "category": "Décoration & Fête", "unit_cost": 5000, "unit": "lot"},
    {"name": "Banderole personnalisée", "category": "Décoration & Fête", "unit_cost": 15000, "unit": "pièce"},
    {"name": "Bougies anniversaire", "category": "Décoration & Fête", "unit_cost": 1500, "unit": "lot"},
    {"name": "Confettis (sachet)", "category": "Décoration & Fête", "unit_cost": 2000, "unit": "sachet"},
    {"name": "Bouquet de fleurs", "category": "Décoration & Fête", "unit_cost": 8000, "unit": "bouquet"},
    {"name": "Centre de table", "category": "Décoration & Fête", "unit_cost": 5000, "unit": "pièce"},

    # === VAISSELLE & SERVICE ===
    {"name": "Assiettes jetables (lot 50)", "category": "Vaisselle & Service", "unit_cost": 2500, "unit": "lot"},
    {"name": "Verres jetables (lot 50)", "category": "Vaisselle & Service", "unit_cost": 2000, "unit": "lot"},
    {"name": "Couverts jetables (lot 100)", "category": "Vaisselle & Service", "unit_cost": 3000, "unit": "lot"},
    {"name": "Nappes (lot 10)", "category": "Vaisselle & Service", "unit_cost": 5000, "unit": "lot"},
    {"name": "Serviettes en papier (lot 100)", "category": "Vaisselle & Service", "unit_cost": 1500, "unit": "lot"},
    {"name": "Gobelets carton (lot 50)", "category": "Vaisselle & Service", "unit_cost": 3000, "unit": "lot"},
    {"name": "Cure-dents (boîte)", "category": "Vaisselle & Service", "unit_cost": 500, "unit": "boîte"},
    {"name": "Pailles (lot 100)", "category": "Vaisselle & Service", "unit_cost": 1000, "unit": "lot"},
    {"name": "Film alimentaire", "category": "Vaisselle & Service", "unit_cost": 2500, "unit": "rouleau"},
    {"name": "Papier aluminium", "category": "Vaisselle & Service", "unit_cost": 2500, "unit": "rouleau"},
    {"name": "Sacs poubelles (lot 50)", "category": "Vaisselle & Service", "unit_cost": 2000, "unit": "lot"},

    # === HYGIÈNE & ENTRETIEN ===
    {"name": "Savon liquide 1L", "category": "Hygiène & Entretien", "unit_cost": 2500, "unit": "bouteille"},
    {"name": "Liquide vaisselle 1L", "category": "Hygiène & Entretien", "unit_cost": 1500, "unit": "bouteille"},
    {"name": "Eau de Javel 1L", "category": "Hygiène & Entretien", "unit_cost": 800, "unit": "bouteille"},
    {"name": "Papier toilette (lot 12)", "category": "Hygiène & Entretien", "unit_cost": 3500, "unit": "lot"},
    {"name": "Essuie-tout (lot 4)", "category": "Hygiène & Entretien", "unit_cost": 3000, "unit": "lot"},
    {"name": "Éponges (lot 6)", "category": "Hygiène & Entretien", "unit_cost": 1500, "unit": "lot"},
    {"name": "Gants jetables (lot 100)", "category": "Hygiène & Entretien", "unit_cost": 2500, "unit": "lot"},

    # === SERVICES & ANIMATION ===
    {"name": "Sono pack 4h", "category": "Services & Animation", "unit_cost": 50000, "unit": "prestation"},
    {"name": "DJ 4h", "category": "Services & Animation", "unit_cost": 75000, "unit": "prestation"},
    {"name": "Animateur 4h", "category": "Services & Animation", "unit_cost": 40000, "unit": "prestation"},
    {"name": "Photographe", "category": "Services & Animation", "unit_cost": 50000, "unit": "prestation"},
    {"name": "Vidéaste", "category": "Services & Animation", "unit_cost": 75000, "unit": "prestation"},
    {"name": "Serveur (par personne / soirée)", "category": "Services & Animation", "unit_cost": 10000, "unit": "personne"},
    {"name": "Cuisinier (soirée)", "category": "Services & Animation", "unit_cost": 25000, "unit": "personne"},

    # === GLACE & COMBUSTIBLE ===
    {"name": "Sac de glace 5kg", "category": "Glace & Combustible", "unit_cost": 1500, "unit": "sac"},
    {"name": "Glace pilée 10kg", "category": "Glace & Combustible", "unit_cost": 3000, "unit": "sac"},
    {"name": "Sac de charbon 25kg", "category": "Glace & Combustible", "unit_cost": 4000, "unit": "sac"},
    {"name": "Bois de cuisson (1 fagot)", "category": "Glace & Combustible", "unit_cost": 1500, "unit": "fagot"},
    {"name": "Bouteille de gaz 12.5kg", "category": "Glace & Combustible", "unit_cost": 6500, "unit": "bouteille"},
    {"name": "Recharge gaz 6kg", "category": "Glace & Combustible", "unit_cost": 4500, "unit": "bouteille"},
]


class QuickProductCreate(BaseModel):
    name: str
    category: str
    unit_cost: float = 0
    unit: Optional[str] = ""
    is_active: Optional[bool] = True


class QuickProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    unit_cost: Optional[float] = None
    unit: Optional[str] = None
    is_active: Optional[bool] = None


async def seed_if_empty():
    """Au démarrage : si la collection est vide, on insère le référentiel par défaut."""
    try:
        count = await db.quick_products.count_documents({})
        if count > 0:
            return
        now = datetime.now(timezone.utc).isoformat()
        docs = [
            {
                "id": str(uuid.uuid4()),
                "name": p["name"],
                "category": p["category"],
                "unit_cost": p["unit_cost"],
                "unit": p["unit"],
                "source": "benin_market",
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            }
            for p in SEED_PRODUCTS
        ]
        if docs:
            await db.quick_products.insert_many(docs)
            logger.info(f"Quick products seeded: {len(docs)} entries")
    except Exception as e:
        logger.error(f"seed_if_empty failed: {e}")


@router.get("/quick-products")
async def list_quick_products(active_only: bool = True):
    q = {"is_active": True} if active_only else {}
    docs = await db.quick_products.find(q, {"_id": 0}).sort([("category", 1), ("name", 1)]).to_list(500)
    return {"products": docs, "total": len(docs)}


@router.post("/quick-products")
async def create_quick_product(data: QuickProductCreate):
    if not (data.name or "").strip():
        raise HTTPException(400, "Nom obligatoire")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "name": data.name.strip(),
        "category": (data.category or "Autres").strip(),
        "unit_cost": float(data.unit_cost or 0),
        "unit": (data.unit or "").strip(),
        "source": "custom",
        "is_active": data.is_active if data.is_active is not None else True,
        "created_at": now,
        "updated_at": now,
    }
    await db.quick_products.insert_one(doc)
    doc.pop("_id", None)
    return {"success": True, "product": doc}


@router.put("/quick-products/{prod_id}")
async def update_quick_product(prod_id: str, data: QuickProductUpdate):
    existing = await db.quick_products.find_one({"id": prod_id})
    if not existing:
        raise HTTPException(404, "Produit non trouvé")
    update = {}
    if data.name is not None: update["name"] = data.name.strip()
    if data.category is not None: update["category"] = (data.category or "Autres").strip()
    if data.unit_cost is not None: update["unit_cost"] = float(data.unit_cost)
    if data.unit is not None: update["unit"] = (data.unit or "").strip()
    if data.is_active is not None: update["is_active"] = bool(data.is_active)
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.quick_products.update_one({"id": prod_id}, {"$set": update})
    doc = await db.quick_products.find_one({"id": prod_id}, {"_id": 0})
    return {"success": True, "product": doc}


@router.delete("/quick-products/{prod_id}")
async def delete_quick_product(prod_id: str):
    r = await db.quick_products.delete_one({"id": prod_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Produit non trouvé")
    return {"success": True}


@router.post("/quick-products/import-missing")
async def import_missing():
    """Import idempotent : ajoute uniquement les produits du référentiel
    absents de la collection (matching par nom, casse-insensible).
    Préserve les produits déjà édités par l'utilisateur."""
    # Existing names (lowercase)
    existing = await db.quick_products.find({}, {"_id": 0, "name": 1}).to_list(2000)
    existing_names = {(p.get("name") or "").strip().lower() for p in existing}

    to_insert = []
    now = datetime.now(timezone.utc).isoformat()
    for p in SEED_PRODUCTS:
        key = (p["name"] or "").strip().lower()
        if key in existing_names:
            continue
        to_insert.append({
            "id": str(uuid.uuid4()),
            "name": p["name"],
            "category": p["category"],
            "unit_cost": p["unit_cost"],
            "unit": p["unit"],
            "source": "benin_market",
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        })

    if to_insert:
        await db.quick_products.insert_many(to_insert)
    return {
        "success": True,
        "inserted": len(to_insert),
        "skipped_existing": len(SEED_PRODUCTS) - len(to_insert),
        "catalog_size": len(SEED_PRODUCTS),
    }


@router.post("/quick-products/reseed")
async def reseed_quick_products():
    """Force le re-seed COMPLET (utilitaire admin). ⚠️ Remplace tous les
    produits 'benin_market'. Ne touche pas aux produits 'custom'."""
    # Garde les custom, supprime les benin_market
    await db.quick_products.delete_many({"source": "benin_market"})
    now = datetime.now(timezone.utc).isoformat()
    docs = [
        {
            "id": str(uuid.uuid4()),
            "name": p["name"],
            "category": p["category"],
            "unit_cost": p["unit_cost"],
            "unit": p["unit"],
            "source": "benin_market",
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }
        for p in SEED_PRODUCTS
    ]
    await db.quick_products.insert_many(docs)
    return {"success": True, "seeded": len(docs)}
