# Espace Maxo - PRD

## Problem Statement
Application pour le restaurant "Espace Maxo" à Cotonou (Bénin) permettant de réserver des jeux VR, payer par mobile money, commander des combos avec session de jeu, réserver des tables avec acompte, gérer les réservations, et gérer un système de facturation POS interne.

---
## 22/04/2026 — Centre de notifications cliquable (DONE)

**Feature — Badge de notification global + dropdown** :
- Gros bouton Bell (testid=`notif-center-btn`) dans le header avec **badge rouge animé** (testid=`notif-center-badge`) affichant le total des notifications effectives.
- Clic sur le bouton → **dropdown** (testid=`notif-center-dropdown`) listant chaque catégorie non-vide avec :
  - Pastille colorée + libellé + compteur + chevron
  - Tri par ordre décroissant
  - Clic sur une ligne → navigue automatiquement vers l'onglet concerné (`setActiveTab`) ET marque cette catégorie comme lue
- Bouton **« Tout marquer lu »** (testid=`notif-mark-all-read`) remet tous les compteurs à 0.
- **Persistance** : baseline `caisse_notif_ack` stocké dans localStorage — les badges restent clearés jusqu'à nouvelle activité.
- **Effective counts** : tous les badges d'onglets (iter 44) utilisent désormais `effectiveCount = max(0, raw - ack)`.
- **Tous rôles** (admin + gérante + serveur). Serveur ne voit que la catégorie `notes`.
- Empty state : message « Aucune notification en attente » avec CheckCircle vert quand total=0.

**Mapping catégorie → onglet** : needs→Besoins, purchase_orders→Fournisseurs, expenses→Achats, invoices/cancel/mod→Bons, financial_points→Stats, tips_today→Pourboires, notes→Instructions.

**Tests** : iteration_46 → frontend 100%, 0 bug fonctionnel. Le ding + browser Notification (iter 45) continue de fonctionner sur les deltas raw (indépendamment de l'ack).

---
## 22/04/2026 — Son ding + notifications navigateur (DONE)

**Feature — Alertes sonores et notifications système** :
- Son « ding » discret généré via **Web Audio API** (oscillateur sine 880→1320Hz, 400ms, pas d'asset externe, CSP-friendly).
- **Notification navigateur** (API `Notification`) avec titre + détails des deltas (« 1 nouveau besoin », « 2 nouvelles demandes d'achats », etc.).
- Déclenchement : uniquement lorsqu'un compteur augmente entre 2 polls (delta strict, `notifInitRef` garde pour éviter les faux alertes au 1er chargement).
- Permissions : `Notification.requestPermission()` auto-demandé 1,5s après login pour admin/manager uniquement.
- **Toggle cloche** dans le header (testid=`notif-toggle-btn`) — admin + manager. État persisté dans `localStorage` (`caisse_notif_enabled`). Icône Bell/BellOff.
- Bugfix stale-closure : `notifEnabledRef` synchronisé à chaque toggle pour que l'intervalle lise la valeur à jour (détecté et corrigé par le testing agent).

**Tests** : iteration_45 → 100% frontend, 0 bug résiduel. Backend inchangé (endpoint notifications/counts existant depuis iter 44).

---
## 22/04/2026 — Badges de notification animés (DONE)

**Feature — Notifications visuelles temps réel** :
- Backend : `routers/notifications.py` (nouveau) — endpoint unique `GET /api/notifications/counts?role=<admin|manager|server>&user=`.
  - Admin (f) : needs en_attente, PO draft, expenses pending+revision, cancellation/modification requests, invoices pending, financial_points signés non-validés, tips_today, notes unread.
  - Manager (d) : expenses revision_requested, PO sent, invoices pending, admin notes unread.
  - Server : admin/manager notes unread.
- Frontend : composant `NotifBadge` (pulse `animate-ping` + chiffre) color-codé par type (red/orange/amber/sky/purple/emerald).
- Polling 10s dans `CaissePage.jsx` (`fetchNotifCounts`) → état `notifCounts` → badges sur 7 onglets (BONS, Achats, Besoins, Fournisseurs, Stats, Pourboires, Notes) + icône Bell globale sur le profil avec total agrégé.
- Badge caché si count=0. Affichage `99+` si >99.

**Tests** : iteration_44 → 14/14 backend + frontend 100%. Polling + 2 rôles vérifiés.

---
## 22/04/2026 — Gestion des pourboires / TipsTab (DONE)

**Feature — Gestion complète des pourboires** :
- Backend : `routers/tips.py` — CRUD + summary.
  - Collection `tips` : `{ id, date, amount, payment_method, attribution_type ('pool'|'server'), server_name, notes, created_by, created_at }`.
  - Endpoints : `GET/POST /tips`, `PUT/DELETE /tips/{id}`, `GET /tips/summary?date=&server=`.
  - Validation : `payment_method ∈ {cash, mobile_money, card, other}`, amount > 0, `server_name` requis si `attribution_type='server'`.
  - Filtres liste : `date_from/date_to`, `server`, `attribution`.
- Frontend : `TipsTab.jsx` (nouveau composant dédié, rôle-aware).
  - Admin + Gérante : CRUD complet, voient TOUT, voient le classement serveurs hebdo.
  - Serveur : voit UNIQUEMENT ses propres pourboires (badge `Vue personnelle`, boutons create/edit/delete cachés, pas de ranking).
  - 4 cartes KPI : Aujourd'hui / Semaine / Pool / Serveurs, avec compteurs.
  - Classement serveurs hebdo (médailles 1-2-3).
  - Modal création/édition : attribution toggle Pool (défaut) / Serveur, select serveur filtré par `role=server`, step="any" pour décimales.
- Onglet `Pourboires` visible pour tous les rôles (data-testid=`tab-tips`).

**Tests** : iteration_43 → 24/24 backend + frontend 100%. Role-based access vérifié.

---
## 22/04/2026 — Sync automatique Achats + Compte courant auto-prélèvement + Décimales + Sous-menu Achats validés (DONE)

**Feature 1 — Synchronisation automatique des achats (P0)** :
- `fetchExpenses()` ajouté au polling 5s existant dans `CaissePage.jsx` (quand `activeTab === 'achats'`).
- L'admin et la gérante voient instantanément les changements (création, modification, approbation) sans refresh manuel.

**Feature 2 — Compte courant : prélèvements automatiques + remboursements manuels (P0)** :
- Nouveau champ `auto_deduct_enabled` sur `AccountCreate` / `AccountUpdate`.
- Nouveau helper `_run_auto_deduction_for_account(acc, run_date)` : pour chaque échéance due et non couverte, crée une repayment `method="auto_deduction"` avec `reference=AUTO-{schedule_id}-{date}` (idempotent).
- Revenue journalier = somme des `invoices.total` (validation_status='validated') pour la date du jour.
- Nouveau endpoint `POST /api/current-accounts/run-auto-deduction` (date optionnelle dans le body) → traite tous les comptes avec `auto_deduct_enabled=true`.
- `GET /api/current-accounts?auto_run=true` (défaut) déclenche automatiquement le prélèvement à la première consultation du jour.
- UI : toggle `Prélèvement automatique` dans le modal de création/édition d'un compte + bouton `Prélèvement auto du jour` + badges `Auto` sur les cartes + distinction `AUTO` dans l'historique.

**Feature 3 — Admin voit les achats modifiés et peut les re-approuver ou re-réviser** :
- Nouvelle card `MODIFIÉS — EN COURS DE RÉVISION CHEZ LA GÉRANTE` (admin-only, sous-tab En cours) avec boutons `Approuver` (vert) et `Nouvelle révision` (amber).
- Le modal `Modifier & renvoyer` a désormais 3 boutons : `Annuler`, `Renvoyer à la gérante`, `Approuver directement` (admin peut modifier puis approuver en une étape).

**Feature 4 — Support décimales (0,5) (P1)** :
- Backend : `quantity: int` → `float` dans `expenses.ExpenseItem/Create/Update` et `needs.NeedItem/Create/Update`.
- Frontend : tous les champs `quantity` utilisent `type="number" step="any"` + `parseFloat(e.target.value.replace(',','.'))` (CaissePage.jsx expense modal, shopping list, revise modal ; NeedsTab new-item).

**Feature 5 — Sous-menu Achats validés (P1)** :
- State `achatsSubView` avec 2 valeurs (`en_cours` | `valides`).
- Sous-navigation sous le header de l'onglet Achats avec compteurs.
- `en_cours` → cards pending + revision_requested (gérante) + admin-revision card.
- `valides` → cards approved + completed.

**Tests** : iteration_42 → 100% backend + 100% frontend (auto-deduction idempotence vérifiée, decimals 0.5 acceptés, UI sub-tabs visibles, revise modal 3 boutons).

---
## 22/04/2026 — Révision admin + Compte courant (DONE)

**Feature 1 — Modification admin des demandes avant renvoi** :
- Nouveau modal "Modifier & renvoyer" (remplace l'ancien "Renvoyer pour révision") sur les dépenses en attente.
- Admin peut : éditer tous les items (catégorie, description, qté, PU), ajouter/supprimer des articles, modifier le fournisseur, saisir une note.
- Validation renvoie la dépense à la gérante avec `status=revision_requested` + items/supplier/amount mis à jour.

**Feature 2 — Module Compte courant (admin-only)** :
- Nouveau router `routers/current_accounts.py`.
- Collection `current_accounts` : { id, name, total_advance, received_date, description, schedule[], repayments[] }.
- Enrichissement dynamique côté backend : `total_repaid`, `balance_remaining`, `progress_pct`, `next_due_date/amount`, `late_count`, `is_fully_repaid`, schedule avec flag `paid` et `is_late`.
- Échéancier (optionnel) + remboursements libres (méthode cash/virement/mobile money/chèque, référence).
- UI : onglet Compte courant (admin-only), 4 KPIs globaux, liste des comptes avec progress bar, échéancier déroulable, historique des remboursements, alertes retard.

**Tests** : iteration_41 = 100% backend + frontend (admin + visibilité gérante).

---
## 22/04/2026 — Module Fournisseurs & Bons de Commande (DONE)

Workflow procurement complet : **Demande d'achats → Approbation → Bon de Commande → Envoi → Réception (BL) → Paiement**.

**Backend** :
- `routers/suppliers.py` : CRUD `caisse_suppliers` (name, category, payment_terms, phone, email, address, ifu, notes).
- `routers/purchase_orders.py` :
  - Statuts : `draft → sent → partially_received → received → paid` + `cancelled`.
  - Numérotation auto `BC-YYYYMM-XXXX`.
  - `POST /purchase-orders/from-expense/{id}` : convertit une dépense approved en BC, marque `converted_to_po_id` sur l'expense.
  - `POST /.../receive` : saisie quantités reçues, append un `delivery_note`, crée un mouvement stock `entree` par item, auto-crée le stock_product si pas de match (fuzzy normalisé).
  - `POST /.../pay` : enregistre paiement (cash/virement/mobile_money/chèque), verrouille le BC.
  - Validations strictes des transitions (pas de receive avant send, pas de pay avant receive, pas de delete après send).

**Frontend** (`PurchaseOrdersTab.jsx`) :
- Sous-onglets : Bons de commande + Fournisseurs (CRUD complet).
- Cards BC avec statuts colorés, tableau items (cmd/reçu/PU/total), historique BL, infos paiement.
- Modals : création BC, réception (avec quantités restantes pré-remplies), paiement.
- **Impression 80mm** (format ticket thermique) : BC et BL séparés, en-tête Espace Maxo.
- Bouton **"Convertir en BC"** dans l'onglet Achats sur chaque dépense approved.

**Permissions** :
- Admin : contrôle total.
- Gérante : lecture seule + peut **réceptionner** les livraisons (met à jour le stock).

**Tests** : 23/23 pytest backend + Frontend Admin + Gérante 100% (iteration_40).

---
## Recent Updates (19/04/2026)

### Updates 20/04/2026 — Visibilité achats gérante + notifications besoins (DONE)

**1. Gérante : consultation des achats en attente** (`CaissePage.jsx`) :
- La section "DEMANDES À VALIDER" (pending) est désormais visible pour la gérante en **lecture seule** (titre "EN ATTENTE DE VALIDATION" + badge "Lecture seule")
- Les contrôles admin (input montant, boutons Approuver/Réviser/Refuser/Supprimer) sont cachés pour les managers
- Remplacés par un bandeau informatif : "Demande transmise à l'administrateur — en attente de validation."

**2. Notifications besoins étendues** (`routers/needs.py`) :
- Suppression du filtre `urgency='urgente'` : **tous** les nouveaux besoins déclenchent désormais une notification admin (comme les achats et les notes)
- Préfixe `[URGENT]` conservé pour les besoins urgents, `[BESOIN]` pour les normaux
- Test validé : besoin normal → WhatsApp delivered téléphone 1, SMS fallback téléphone 2

### Notifications SMS/WhatsApp admin (DONE)
Notifications SMS Twilio automatiques envoyées aux 2 numéros admin (`+22997720808`, `+22966269565`) pour 3 événements :

1. **Besoin urgent créé** (`POST /needs` avec `urgency='urgente'`) — SMS avec espace, demande, auteur, articles (max 6) + montant estimé.
2. **Nouvelle demande d'achats** (`POST /expenses`) — SMS avec catégorie, demande, auteur, montant total, articles (max 6), fournisseur.
3. **Nouvelle note/liste de tâches** (`POST /instructions`) — SMS uniquement si `sender_role != admin`. Inclut titre, priorité, auteur, contenu (200 chars) + tâches (max 5) si task_list.

**Bugfix critique** (`services/sms_service.py`) : client Twilio lazy-instancié (les imports routers dans `server.py` précèdent `load_dotenv()`).

**Tests validés Twilio en production** :
- Besoin urgent → 2 SMS (201 OK)
- Besoin normal → 0 SMS
- Demande d'achats → 2 SMS
- Note manager → 2 SMS
- Note admin → 0 SMS (pas d'auto-notification)

### Feature : Liste de besoins (gérante + admin) (DONE)
Nouveau menu dédié à la gestion des besoins de TOUS les espaces (salle, salle de jeux, jardin, cuisine, toilettes, autres), distinct mais intégré avec la Liste d'achats.

**Backend** (`/app/backend/routers/needs.py`) :
- Modèles : `Need` / `NeedItem` avec `location`, `description`, `items[]`, `urgency`, `supplier`, `notes`, `status` (en_attente|traite|annule).
- CRUD : `GET/POST /needs`, `PUT/DELETE /needs/{id}` (filtres status + location)
- Admin : `POST /needs/{id}/cancel`, `POST /needs/{id}/convert-to-expense` (convertit en expense pending + marque need "traite" avec `converted_to_expense_id`)
- `GET /needs/analysis` — analyse identique à `/expenses/analysis` : doublons (contre needs + expenses récents 14j), intra-doublons, stock_matches, redundant_items, recent_purchases, impact trésorerie.
- **Exports** : `GET /needs/export/pdf` et `GET /needs/export/excel` (filtres status/location/date_from/date_to). PDF reportlab (KPI + tableau principal + détail articles). Excel openpyxl (2 feuilles : Besoins + Articles détaillés) avec couleurs urgence/statut.
- **SMS urgent** : quand un besoin est créé avec `urgency='urgente'`, SMS Twilio envoyé aux 2 numéros admin (`+22997720808`, `+22991005084`) avec espace, demande, auteur, articles (max 6) et montant estimé. Best-effort (non bloquant). Validé en production : SIDs Twilio retournés 201 OK.
- **Bugfix** `services/sms_service.py` : client Twilio lazy-initialisé (les variables d'env sont chargées *après* les imports de routers dans `server.py`, l'ancienne initialisation au chargement du module retournait "Twilio not configured").

**Refactoring** (`forecasts.py`) :
- Extraction de la logique d'analyse en fonction réutilisable `analyze_single_request(db, e, recent_requests, recent_purchases, stock_products, available, id_field, self_ref)`.
- `/expenses/analysis` et `/needs/analysis` partagent la même logique (zéro duplication).

**Frontend** (`NeedsTab.jsx`) :
- Même configuration que la Liste d'achats (multi-items, fournisseur, modal, résumé).
- 6 catégories d'espaces avec icônes (Home/Gamepad2/TreePine/UtensilsCrossed/Droplets/Package).
- Urgence (normale|urgente) avec badge 🔥 si urgent.
- Prix optionnel sur chaque item ("laissez vide si inconnu").
- Admin voit l'analyse (ExpenseAnalysisBadges) + boutons "Convertir en achats" / "Annuler".
- Gérante voit ses besoins avec boutons Modifier/Supprimer (si en_attente).
- Onglet "Besoins" visible manager + admin (data-testid `tab-needs`).

**Tests** : 10/10 pytest toujours verts + curl end-to-end (CRUD + analyse + conversion + cleanup) validés. Backend expenses/analysis régression OK (même logique, toujours 10 duplicate_items + 18 stock matches).

---
## Recent Updates (18/04/2026 - Session fix doublons)

### Fix P0 : Détection des doublons item-par-item (DONE)
Les demandes d'achat ne remontaient aucun doublon alors que des items évidents étaient dupliqués.

**Cause racine** :
- Set-intersection sur noms bruts : `{"Nappe"}` ≠ `{"Location nappe"}` → aucun match
- Seuil à 30 trop élevé, score max atteignable sur items était 20

**Correctif backend** (`/app/backend/routers/forecasts.py`) :
- Nouveaux helpers : `_strip_accents`, `_normalize_item_name` (minuscules, accents, mots vides `location/achat/liste/de/du…`, pluriel final `s`)
- `_items_match` : exact token-intersection + prefix (≥ 4 chars) + `SequenceMatcher` ≥ 0.9 par token
- **Pas de substring-anywhere** pour éviter `oeuf`↔`boeuf`, `table`↔`jetables`
- Nouveau champ `duplicate_items` (max 30) : pour chaque article demandé, liste des correspondances (source = `request` ou `purchase`, date, label, qty, unit_price, amount)
- `stock_matches` et `recent_purchases` utilisent aussi le normalisateur (plus précis)
- Détection niveau demande : seuil abaissé à 20, items fuzzy comptés via `_items_match`

**Frontend** (`ExpenseAnalysisBadges.jsx`) :
- Badge doublon affiche désormais le nb d'**articles en doublon** (prioritaire sur nb de demandes)
- Chip rouge en résumé : « N articles déjà demandés/achetés (14j) »
- Section détaillée « Articles en doublon » groupée par item, avec tag `Acheté` (bleu) ou `Demandé` (ambre), date, label et quantités

**Tests** : 9/9 pytest `backend/tests/test_duplicate_items.py` (plurals, accents, stopwords, pas de faux positifs).

**Validation réelle** : sur les 2 demandes actuelles, l'endpoint remonte `Nappe ↔ Location nappe`, `Tomate ↔ Tomates`, `Oignon ↔ Oignons`, `Citron ↔ Citron`, etc. — plus aucun faux positif détecté.

---
## Recent Updates (18/04/2026)

### Analyse des demandes d'achats - Enrichissement complet (DONE)
L'utilisateur a signalé que l'analyse était incomplète. Refonte majeure du backend ET du frontend :

**Backend** (`/api/expenses/analysis` enrichi) :
- Doublons : lookback étendu à **14 jours** (au lieu de 7), seuil abaissé à 30% (certain/probable/possible)
- **Redundant items** : liste explicite des items avec stock suffisant + calcul du montant évitable (`estimated_waste`)
- **Recent purchases** : historique des achats récents (stock_purchases 14j) pour chaque produit demandé (date, qté, PU, fournisseur)
- Stock matches enrichi avec `requested_qty` pour comparer demandé vs disponible
- Normalisation name/description cohérente

**Frontend** (`ExpenseAnalysisBadges.jsx` réécrit) :
- Mode **compact** : 4 badges (doublons, stock + en trop, trésorerie, achats récents) + chips de synthèse (montant évitable, déficit)
- Mode **détaillé** (bouton "Détails") avec :
  * Carte impact trésorerie (demandé / dispo / resterait)
  * Liste des doublons avec score + level + raisons
  * Tableau **Stock déjà suffisant** (demandé vs en stock vs min)
  * Grille des correspondances stock avec warning visuel
  * Tableau des **achats récents** (date, produit, qté, PU, fournisseur)
  * Note explicative du scoring

Résultat vérifié : ~37 500 F évitables détectés sur une seule demande, nappe achetée il y a 2 jours flaggée automatiquement.

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
