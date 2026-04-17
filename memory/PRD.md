# Espace Maxo - PRD

## Problem Statement
Application pour le restaurant "Espace Maxo" à Cotonou (Bénin) permettant de réserver des jeux VR, payer par mobile money, commander des combos avec session de jeu, réserver des tables avec acompte, gérer les réservations, et gérer un système de facturation POS interne.

---
## Recent Updates (17/04/2026 - Session 4)

### Dashboard Analytics Admin (DONE)
Nouveau module analytics visible UNIQUEMENT pour l'admin.

**Frontend** — `AnalyticsTab.jsx` (~340 lignes) avec recharts :
- 4 KPI cards : CA, Factures, Panier moyen, Serveurs actifs (+ badges croissance MoM)
- BarChart revenus journaliers du mois
- BarChart horizontal top 5 serveurs
- PieChart modes de paiement normalisés
- PieChart répartition par département
- Tableau top 10 produits (quantité + CA)
- Comparaison vs mois précédent (3 cellules)
- Sélecteur de mois
- data-testid : `tab-analytics`, `analytics-tab`, `analytics-kpis`, `analytics-daily-chart`, `analytics-top-servers`, `analytics-payment-pie`, `analytics-dept-pie`, `analytics-top-products`, `analytics-comparison`, `analytics-month-picker`

**Backend** — Endpoint `GET /api/analytics/dashboard?year=&month=` :
- Retourne `{current, previous, growth}` avec stats mois courant + mois précédent + % croissance
- Respecte `assigned_week` (factures transférées inclues/exclues correctement)
- Normalise modes de paiement (mobile_money→mobile, especes→cash, bon-client→wallet)
- Gère la bordure année (month=1 → year-1, month=12 pour previous)
- Uniquement factures validées comptées

Tests : 16/16 backend + toute UI vérifiée (iteration_32).

### Refactoring Progressif - Phase 1 (DONE)
Extraction de tabs et endpoints depuis les monolithes pour réduire le contexte et prévenir les régressions (problème récurrent x8).

**Frontend** (`CaissePage.jsx`: 8657 → 8348 lignes, -309) :
- `ActiviteTab.jsx` (301 lignes) - data-testid `activite-tab`
- `UsersTab.jsx` (92 lignes) - data-testid `users-tab`, `add-user-btn`, `edit-user-{id}`, `delete-user-{id}`
- `ClientsTab.jsx` (83 lignes) - data-testid `clients-tab`, `add-client-btn`, `edit-client-{id}`, `delete-client-{id}`

**Backend** (`server.py`: 7747 → 7311 lignes, -436) :
- `routers/financial_points.py` (460 lignes) - 9 endpoints migrés vers un router dédié :
  `GET/POST /financial-points`, `GET/PUT/DELETE /financial-points/{id}`,
  `POST /financial-points/{id}/sign`, `/admin-validate`, `/unlock`, `GET /financial-points/{id}/pdf`

Régression validée : 26/26 tests passés (iteration_31).

### Bug Fix P0 - Reversement/Hebdo Concordance (DONE)
- **Bug**: `/api/reports/revenue-by-payment` ignorait `assigned_week`, contrairement à `/api/reports/weekly`. Les totaux du Reversement ne concordaient donc plus avec Hebdo quand des factures étaient rattachées à une autre semaine.
- **Fix**: L'endpoint respecte désormais `assigned_week` en excluant les factures transférées vers d'autres semaines et en incluant celles rattachées à la semaine courante (mode weekly) ou au jour considéré (mode daily).
- **Normalisation ajoutée**: `mobile_money→mobile`, `especes/espèces→cash`, `cheque/chèque→cheque`, `bon-client/credit→wallet`.
- Tests : 12/12 backend + UI PASSED (iteration_30)

### Détail dans "Activité & Historique" (DONE)
- Ajout d'un tableau détaillé des **factures validées** du jour (data-testid=`activity-validated-invoices`) : Facture, Client, Serveur, Mode, Total, Heure.
- Ajout d'un tableau détaillé des **dépenses complétées** du jour (data-testid=`activity-completed-expenses`) : Description, Fournisseur, Catégorie, Montant, Heure.
- Les totaux affichés dans les titres concordent avec les cartes résumés (CA VALIDÉ / DÉPENSES).

---
## Recent Updates (16/04/2026 - Session 3)

### Rapports Stock Filtrables avec Export PDF/Excel (DONE)
- **Nouvelle section** "Rapports" dans le module Stock
- Filtres : Type (Entrees/Sorties/Pertes/Ajustements), Periode (date du/au), Recherche produit
- Statistiques agregees : Total mouvements, Quantite totale, Valeur totale, repartition par type
- Top Produits (par valeur) en grille
- Tableau detaille des mouvements avec type color-code
- **Export PDF** : Document formaté avec tableaux couleur
- **Export Excel** : 2 feuilles (Mouvements + Top Produits) avec styles
- Tests : 16/16 backend + 100% frontend PASSED (iteration_29)

### Fiches Techniques / Recettes (DONE)
- Section "Fiches Techniques" dans le module Stock
- CRUD complet, deduction par recette lors des ventes
- Calcul automatique cout de revient / marge
- Fiche demo "Poulet braise" (8 ingredients, marge 44.2%)
- Tests : 11/11 backend + 100% frontend PASSED (iteration_28)

### Liaison Bidirectionnelle Caisse <-> Stock (DONE)
- Ventes → Sorties Stock (via recettes ou nom direct)
- Achats → Entrees Stock + stock_purchases avec badge "Caisse"
- Tests : 9/9 + 15/15 backend PASSED (iteration_27)

---
## Architecture

```
/app/
├── backend/
│   ├── server.py (~7300 lignes)
│   └── routers/
│       ├── stock.py (stock + fiches techniques + rapports + exports)
│       └── stock_data.py (441 produits catalogue)
└── frontend/
    └── src/pages/
        ├── StockPage.jsx (~1300 lignes - stock complet)
        └── CaissePage.jsx (~8900 lignes - POS)
```

## Key API Endpoints - Rapports
- `GET /api/stock/reports` → Rapport filtrable avec stats agregees
- `GET /api/stock/reports/export/pdf` → Export PDF
- `GET /api/stock/reports/export/excel` → Export Excel

## Prioritized Backlog

### P0 (Completed)
- [x] Dashboard Analytics Admin avec graphiques + MoM (17/04/2026)
- [x] Refactoring Phase 1 : 3 tabs frontend + 1 router backend (17/04/2026)
- [x] Bug Reversement/Hebdo concordance via assigned_week (17/04/2026)
- [x] Détail factures/dépenses dans Activité & Historique (17/04/2026)
- [x] Rapports Stock filtrables + Export PDF/Excel (16/04/2026)
- [x] Fiches Techniques / Recettes (16/04/2026)
- [x] Liaison Achats/Ventes Caisse <-> Stock (16/04/2026)

### P1 (Next)
- [x] Module Inventaire physique (DONE session précédente)
- [ ] Alertes de péremption sur le dashboard Stock (produits proches de la DLC)

### P2
- [ ] Mot de passe oublie via Email (Resend)
- [ ] Refactoring CaissePage.jsx (~8900 lignes) et server.py (~7700 lignes)
