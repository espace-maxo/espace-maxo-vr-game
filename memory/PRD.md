# Espace Maxo - PRD

## Problem Statement
Application pour le restaurant "Espace Maxo" à Cotonou (Bénin) permettant de réserver des jeux VR, payer par mobile money, commander des combos avec session de jeu, réserver des tables avec acompte, gérer les réservations, et gérer un système de facturation POS interne.

---
## Recent Updates (16/04/2026 - Session 3)

### Fiches Techniques / Recettes (DONE)
- **Nouvelle section** "Fiches Techniques" dans le module Stock (menu latéral)
- CRUD complet : Créer, modifier, supprimer des fiches techniques
- Chaque fiche lie un **plat de la Caisse** (par nom) à une liste d'**ingrédients du Stock** avec quantités
- **Calcul automatique** du coût de revient, de la marge et du pourcentage de marge
- **Déduction par recette** : Quand un plat avec fiche technique est vendu via la Caisse, les ingrédients sont déduits (pas le plat)
- **Fallback** : Si pas de fiche technique, comportement existant (correspondance par nom)
- **Fiche démo** : "Poulet braisé" avec 8 ingrédients, prix vente 3500 F, coût 1953 F, marge 44.2%
- **Frontend** : Cartes avec prix/coût/marge, tableau ingrédients avec stock actuel, modale de création
- Tous les rôles ont accès aux fiches techniques
- Tests : 11/11 backend + 100% frontend PASSED (iteration_28)

### Liaison Bidirectionnelle Caisse <-> Stock (DONE)
- **Ventes → Sorties Stock** : Via recettes (prioritaire) ou correspondance directe par nom
- **Achats → Entrées Stock** : Quand un achat passe au statut 'completed', entrées automatiques + enregistrement stock_purchases
- Badge "Caisse" dans Stock > Achats pour distinguer les achats venant de la Caisse
- Tests : 9/9 + 15/15 backend PASSED

---
## Recent Updates (14/04/2026 - Session 2)

### Reversement des Recettes - Complete (DONE)
- Onglet sous Hebdo, 4 modes de paiement, Billettage FCFA, Numero Momo
- Workflow : Gerante saisit + signe → Admin valide → PDF verrouille

### Module Gestion de Stock - Phase 1 (DONE)
- Route : /stock (page standalone), Backend : /app/backend/routers/stock.py
- 441 produits, 25 categories, Authentification avec roles

---
## Architecture

```
/app/
├── backend/
│   ├── server.py (~7300 lignes - POS + liaison stock avec recettes)
│   └── routers/
│       ├── stock.py (module stock + fiches techniques)
│       ├── stock_data.py (441 produits catalogue)
│       └── ... (autres routes)
└── frontend/
    └── src/pages/
        ├── CaissePage.jsx (~8900 lignes - POS)
        ├── StockPage.jsx (~1170 lignes - stock + fiches techniques)
        └── caisse/components/ (composants extraits)
```

## Key API Endpoints - Fiches Techniques
- `GET /api/stock/recipes` → Liste des recettes avec coût/marge calculés
- `POST /api/stock/recipes` → Créer une fiche technique
- `PUT /api/stock/recipes/{id}` → Modifier une fiche technique
- `DELETE /api/stock/recipes/{id}` → Supprimer une fiche technique
- `POST /api/stock/recipes/seed-demo` → Charger la fiche démo "Poulet braisé"

## Key DB Collections
- `stock_recipes` : `{ id, name, caisse_product_name, selling_price, ingredients: [{product_id, product_name, quantity, unit}], notes, created_at, updated_at }`

## Prioritized Backlog

### P0 (Completed)
- [x] Fiches Techniques / Recettes (16/04/2026)
- [x] Liaison Achats Caisse → Entrées Stock + stock_purchases (16/04/2026)
- [x] Liaison Ventes Caisse → Sorties Stock via recettes (16/04/2026)
- [x] Module Stock Phase 1 (14/04/2026)
- [x] Reversement des Recettes (13/04/2026)

### P1 (Next)
- [ ] Rapports Stock filtrables (Entrées, Sorties, Pertes) avec Export PDF/Excel
- [ ] Module Inventaire physique (stock réel vs théorique)

### P2
- [ ] Alertes de péremption sur le dashboard Stock
- [ ] Mot de passe oublié via Email (Resend)
- [ ] Refactoring CaissePage.jsx et server.py
