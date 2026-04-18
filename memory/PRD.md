# Espace Maxo - PRD

## Problem Statement
Application pour le restaurant "Espace Maxo" à Cotonou (Bénin) permettant de réserver des jeux VR, payer par mobile money, commander des combos avec session de jeu, réserver des tables avec acompte, gérer les réservations, et gérer un système de facturation POS interne.

---
## Recent Updates (17/04/2026 - Session 4)

### Refactoring Phase 5 — Expenses Router (DONE)
Extraction du CRUD dépenses dans un router dédié.

**Backend** (`server.py`: 6344 → 6002 lignes, **-342**) :
- `routers/expenses.py` (369 lignes) - **7 endpoints** extraits :
  - `GET /expenses` (filtres status/category/dates/respect_assigned_week)
  - `POST /expenses`, `PUT /expenses/{id}`, `DELETE /expenses/{id}`
  - `PUT /expenses/{id}/assign-week`, `POST /expenses/assign-week-bulk`, `POST /expenses/unassign-week-bulk`
- **Logique critique préservée** : PUT status='completed' synchronise avec Stock (stock_movements entree + stock_purchases + update produit)
- Modèles `ExpenseItem`, `ExpenseCreate`, `ExpenseUpdate` déplacés

Régression validée : **30/30 tests** passés (iteration_37), aucun bug, sync stock vérifié.

### Module PRÉVISIONS + Analyse Demandes d'achat (DONE)
Deux features majeures pour la **gestion financière prévisionnelle**.

**Backend** — `routers/forecasts.py` (nouveau, 6 endpoints) :
- CRUD `/forecasts` avec catégories (salaires/loyer/fournisseur/charges/impots/maintenance/autre), statuts (prevu/paye/annule/reporte), récurrence (none/weekly/monthly).
- `GET /forecasts/dashboard?horizon_days=` — Retourne `{treasury, available_now, per_day, totals, missing_amount, min_running_balance}`.
- `GET /expenses/analysis` — Pour chaque demande pending/approved, retourne :
  * **Doublons** (score basé sur description + fournisseur + produits communs + jour) sur les 7 derniers jours
  * **Correspondances stock** (quantité actuelle, dernière entrée, warning si qty > min×1.5)
  * **Impact trésorerie** (ratio %, niveau low/moderate/warning/critical)
- Calcul trésorerie : **CA validé semaine − dépenses approuvées/terminées** (respecte `assigned_week`).

**Frontend** :
- `ForecastsTab.jsx` (~430 lignes) — 4 KPI cards + alerte trésorerie + LineChart solde + agenda jour par jour + liste CRUD + répartition par catégorie + modal création/édition.
- `ExpenseAnalysisBadges.jsx` — 3 badges contextuels (doublons, stock, impact) avec **tooltips détaillés** au survol.
- Onglet Prévisions visible **admin uniquement**.
- Badges intégrés automatiquement dans la page d'accueil admin sur les sections "Achats en attente" et "Achats à réviser".

Régression validée : **20/20 backend** + UI 100% (iteration_36). Bugfix timezone appliqué par testing agent sur `_expand_recurrence`.

### Bug Fix : Alerte Ratio Dépenses/CA (DONE)
Le calcul du ratio dans l'onglet Achats (Caisse Pro) était incorrect :
- **Avant** : `weeklyExpenses + totalPendingExpenses` où `totalPendingExpenses` filtrait TOUTES les dépenses (pending + approved) sans filtre de semaine → double-comptage de la semaine courante + pollution par les dépenses d'autres semaines.
- **Après** : utilise uniquement `res.data.expenses.total` du backend, qui agrège déjà correctement les dépenses de la semaine (tous statuts, respecte `assigned_week`).
- Libellé clarifié : "Ratio Dépenses/CA (semaine)" et "Dépenses semaine" pour éviter toute confusion.
- data-testid ajoutés : `expense-ratio-alert`, `expense-ratio-ok`.

### Refactoring Phase 4 — Invoices Router (DONE)
Le plus gros refactoring backend de la session.

**Backend** (`server.py`: 6889 → 6340 lignes, **-549**) :
- `routers/invoices.py` (568 lignes) - **10 endpoints extraits** :
  - `POST /invoices` (création)
  - `GET /invoices` (liste avec filtres date, date_from/date_to, role=server)
  - `GET /invoices/{id}`, `PUT /invoices/{id}`, `DELETE /invoices/{id}`
  - `PUT /invoices/{id}/update-items` (modification items)
  - `GET /invoices/{id}/pdf` (export PDF reportlab)
  - `PUT /invoices/{id}/assign-week`, `POST /invoices/assign-week-bulk`, `POST /invoices/unassign-week-bulk`
- **Logique critique préservée** : PUT avec `validation_status=validated` auto-stop la table + sync avec Stock (via recettes OU direct name match)
- Modèles `Invoice`, `InvoiceCreate`, `InvoiceItemCreate` déplacés dans le router

Régression validée : **26/26 tests backend** passés (iteration_35), 0 bug, incluant le test critique de non-collision de routes.

### Refactoring Phase 3 (DONE)
Extraction des deux plus gros onglets restants.

**Frontend** (`CaissePage.jsx`: 8318 → 7834 lignes, -484) :
- `BonsTab.jsx` (284 lignes) - Bons de commande avec sous-onglets Factures/MANAGER GENERAL. data-testid: `bons-tab`, `bons-filter-date`
- `StatsTab.jsx` (285 lignes) - Statistiques & Rapport avec rapport journalier signable. data-testid: `stats-tab`, `stats-month-picker`, `stats-rapport-date`, `stats-rapport-refresh`, `stats-signature-input`, `stats-rapport-section`

**Bug corrigé en cours** : l'onglet Statistiques & Rapport était visible aux serveurs alors qu'il doit être admin-only. Condition corrigée ligne 3774.

Régression validée : 15/15 tests backend + 25+ UI (iteration_34).

### Refactoring Phase 2 (DONE)
Continuation du refactoring pour réduire les monolithes.

**Frontend** (`CaissePage.jsx`: 8348 → 8318 lignes) :
- `ProductsTab.jsx` (102 lignes) - Gestion des produits par département avec data-testid `products-tab`, `add-product-btn`, `edit-product-{id}`, `delete-product-{id}`

**Backend** (`server.py`: 7311 → 6889 lignes, -422) :
- `routers/caisse_users.py` (203 lignes) - 5 endpoints + models CaisseUser/CaisseUserCreate
- `routers/reports.py` (416 lignes) - 4 endpoints : `/invoices/stats`, `/invoices/stats/monthly`, `/analytics/dashboard`, `/reports/revenue-by-payment`
- **Fix critique** : `api_router.include_router()` déplacés en haut du fichier pour garantir que les paths statiques (ex: `/invoices/stats`) prennent la priorité sur les dynamiques (`/invoices/{invoice_id}`).

Régression validée : 14/14 tests backend + toute UI (iteration_33).

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
