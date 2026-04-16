# Espace Maxo - PRD

## Problem Statement
Application pour le restaurant "Espace Maxo" à Cotonou (Bénin) permettant de réserver des jeux VR, payer par mobile money, commander des combos avec session de jeu, réserver des tables avec acompte, gérer les réservations, et gérer un système de facturation POS interne.

---
## Recent Updates (16/04/2026 - Session 3)

### Liaison Bidirectionnelle Caisse <-> Stock (DONE)
- **Ventes → Sorties Stock** : Quand une facture est validée dans la Caisse, les articles vendus créent automatiquement des mouvements de sortie dans le Stock
- **Achats → Entrées Stock** : Quand un achat (expense) passe au statut 'completed' dans la Caisse, les articles achetés créent automatiquement des mouvements d'entrée dans le Stock
- Matching des noms de produits par regex (exact → starts-with → contains, insensible à la casse)
- Support des achats groupés (is_group=true avec items[]) et simples
- Articles non liés au stock sont quand même enregistrés comme mouvements tracables
- Protection contre la double synchronisation (idempotent)
- Tests : 9/9 backend + 100% frontend PASSED (iteration_27)

---
## Recent Updates (14/04/2026 - Session 2)

### Reversement des Recettes - Complete (DONE)
- Onglet sous Hebdo, 4 modes de paiement, Billettage FCFA, Numero Momo
- Workflow : Gerante saisit + signe → Admin valide → PDF verrouille
- Tests : 10/10 backend + 100% frontend PASSED

### Module Gestion de Stock - Phase 1 (DONE)
- Route : /stock (page standalone), Backend : /app/backend/routers/stock.py
- 441 produits, 25 categories, Authentification avec roles
- Dashboard, Mouvements, Achats, Fournisseurs, Categories, Utilisateurs

---
## Architecture

```
/app/
├── backend/
│   ├── server.py (~7200 lignes - contient POS + liaison stock)
│   └── routers/
│       ├── stock.py (module stock standalone)
│       ├── stock_data.py (441 produits catalogue)
│       ├── invoices.py, users.py, products.py, clients.py, tables.py
│       ├── requests.py, service_reports.py, subscriptions.py
│       └── export.py
└── frontend/
    └── src/
        ├── pages/
        │   ├── CaissePage.jsx (~8900 lignes - POS monolithique)
        │   ├── StockPage.jsx (~955 lignes - module stock)
        │   └── caisse/components/ (composants extraits)
        └── components/ (Navbar, Footer avec liens caches)
```

## Key API Endpoints - Liaison Caisse <-> Stock
- `PUT /api/expenses/{id}` (status='completed') → Crée des mouvements d'entrée dans stock_movements
- `PUT /api/invoices/{id}` (validation_status='validated') → Crée des mouvements de sortie dans stock_movements
- `GET /api/stock/dashboard` → Affiche entrées/sorties du jour
- `GET /api/stock/movements` → Historique complet des mouvements

## Prioritized Backlog

### P0 (Next)
- [ ] Fiches techniques / Recettes (lier plats Caisse aux ingrédients Stock)
- [ ] Rapports Stock filtrables (Entrées, Sorties, Pertes) avec Export PDF/Excel

### P1
- [ ] Module Inventaire physique (stock réel vs théorique)
- [ ] Alertes de péremption sur le dashboard

### P2
- [ ] Mot de passe oublié via Email (Resend)
- [ ] Refactoring CaissePage.jsx et server.py (architecture monolithique)

### Completed
- [x] Liaison Achats Caisse → Entrées Stock (16/04/2026)
- [x] Liaison Ventes Caisse → Sorties Stock (14/04/2026)
- [x] Module Stock complet Phase 1 (14/04/2026)
- [x] Reversement des Recettes avec PDF (13/04/2026)
- [x] Tout le POS Caisse Pro (Mars 2026)
