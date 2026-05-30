# PRD — Caisse Pro + Gestion Stock (Espace Maxo)

## Original Problem Statement
Application POS ("Caisse Pro") + module Gestion de Stock avec stricte séparation des recettes, contrôle financier rigoureux, et synchronisation Caisse ↔ Stock.

## Personae
- Administrateur : supervision, validation, réconciliation.
- Gérante (manager) : gestion quotidienne, prises de commandes, achats, journée.
- Serveuses (server, PIN) : prises de commandes uniquement.

## Core Requirements
- Workflow d'ouverture/fermeture de journée avec garde-fous stricts.
- Billettage global unique + traçabilité des ajustements.
- Workflow Achats → Validation Admin → Sync Stock conditionnelle.
- Facturation différée à l'impression du bon client.
- Simulateur de devis Location (Stock + Marché).
- Répertoire historique des prix d'achat.

## What's Implemented (Stable)
- Billettage global unique + auto-création + traçabilité ajustements
- Réconciliation garde-fou (justification écarts par l'admin)
- Sync Caisse ↔ Stock (toggle "Passer en stock" sur items d'achat)
- Auto-ajustement stock lors modification catalogue
- Facture créée uniquement à l'impression du bon client (vente sur table)
- Bons en VENTE DIRECTE restent `pending` jusqu'à validation gérante
- Onglet Factures n'affiche plus les bons `pending`
- Tracking figé des tables (last_order_sent_at)
- Simulateur devis Locations + création réservation
- Catalogue produits cliquable Stock + Marché (93 produits Marché seedés)
- Notifications Twilio désactivées (kill-switch)
- Répertoire des prix d'achat (5/5 tests Pytest)
- **MODULE JOURNÉE (Ouverture / Fermeture / Historique)** — implémenté le 23/05/2026
  - Nouveau tab "Journée" visible Gérante + Admin
  - Ouverture avec fonds de caisse OPTIONNEL et notes
  - **Blocage strict (423 LOCKED)** : impossible de créer facture ou table sans ouverture
  - Garde-fou : impossible d'ouvrir si jour précédent (avec activité) non fermé (admin peut forcer)
  - Hook bidirectionnel : la fermeture (day_closures) marque l'ouverture comme `closed`, la réouverture inversement
  - 21 tests Pytest + 35 tests regression — tous verts (testing agent itération 82)
- **NAVIGATION ACHATS — 4 sous-menus + isolation rôle (24/05/2026)**
  - 4 sous-menus dans Achats : À valider / Validés / Historique / **Achats Manager**
  - "Achats Manager" (4ᵉ sous-menu) **invisible pour la Gérante** (Admin only)
  - "Appro Manager" (menu principal) déjà **invisible pour la Gérante** (Admin only)
  - Vérifié via screenshots admin (4 sous-tabs) + gérante (3 sous-tabs)
- **ACHATS MANAGER — Workflow paiement complet (24/05/2026)**
  - 3 sous-onglets dans Achats Manager : **À acheter** / **Acheté** / **Cumul mode de paiement**
  - Modal d'édition PU/Qté (items simples + liste groupée) avec calcul auto du total
  - Modal "Marquer acheté" : choix du mode **Fonds Propres** (remboursable) ou **Caisse Restau** (déduit du CA)
  - Remboursement individuel ou groupé des Fonds Propres
  - Point de la Caisse : nouvelles cartes "Fonds Propres remboursés (jour)" + "Fonds Propres en attente"
  - 11/11 tests backend (test_achats_manager_iter83.py) — visibility role-based 100%
  - Endpoints : `POST /api/expenses/{id}/mark-bought`, `/reimburse-fonds-propres`, `/reimburse-all-fonds-propres`, `GET /api/expenses/payment-mode-cumul`
- **APPRO MANAGER — Même workflow paiement (24/05/2026)**
  - 3 sous-onglets dans Appro Manager (menu principal Admin only) : **À ACHETER** / **ACHETÉ** / **CUMUL MODE DE PAIEMENT**
  - Édition PU/Qté inline via modal avec total auto
  - Choix Fonds Propres / Caisse Restau lors du "Marquer comme acheté"
  - Remboursement individuel (bouton sur ligne FP non remboursée) + groupé
  - Snapshot Point de la Caisse fusionne maintenant `expenses` + `shopping_list_items` pour fonds_propres
  - 16/16 tests backend (iteration_84) — Gérante n'a pas accès à Appro Manager
  - Endpoints : `POST /api/shopping-list/{id}/reimburse`, `/reimburse-all`, `GET /api/shopping-list/payment-mode-cumul` + extensions de `/done`, `PATCH`, `/undo`
- **GÉRANTE — Restriction renforcée des menus (24/05/2026)**
  - Menus cachés à la Gérante : Achats, Appro Manager, Fournisseurs, Activité & Historique, Statistiques & Rapport, Journal, Utilisateurs, Audit, Compte courant
  - Menus visibles : Journée, Tables, BONS, Prise de commandes, Factures, Locations, Besoins, Proforma, Point de la Caisse, Faire le point, Produits, Clients, Abonnements, Notes, Pourboires, Points Serveurs
- **GÉRANTE — Suppression des historiques sensibles (24/05/2026)**
  - Point de la Caisse : onglet "Historique" caché pour la Gérante (Admin only)
  - Faire le point : onglet "Historique" caché pour la Gérante (Admin only)
  - Factures : date picker masqué + force la Gérante sur la date du jour (impossible de voir les factures passées)
- **GÉRANTE — Plus de suppression directe de bons/factures (24/05/2026)**
  - La Gérante voit désormais "Demander suppression" (au lieu du Trash2 direct) sur ses bons
  - Le bouton crée une `cancellation_request` → notification Admin qui valide/refuse
  - Admin garde le Trash2 direct + workflow d'approbation existant (reuses `requestCancellation` + `cancellationRequests`)
  - Factures validées déjà admin-only (inchangé)
- **PROFIL Resp. Op. (24/05/2026)**
  - Renommage du badge profil "Manager" → "**Resp. Op.**" (Responsable Opérationnelle)
  - Nouveau **bandeau d'accueil personnalisé** (`RespOpWelcome.jsx`) :
    - Salutation contextuelle (Bonjour/Bonsoir/Bon après-midi) + nom + date complète
    - 5 KPI cliquables : Journée / Tables ouvertes / Bons à valider / Besoins en attente / Pourboires du jour
    - Animation rouge pulsante si journée non ouverte / besoins en attente / bons > 5
    - Collapsible (bouton chevron)
    - Visible UNIQUEMENT pour la Resp. Op. (role='manager')
  - Date pickers verrouillés sur "Aujourd'hui" : Point de la Caisse + Reversement billettage + Factures
- **REVERSEMENT DIRECT — Resp. Op. peut bypasser "Faire le point" (25/05/2026)**
  - Si **aucun serveur n'a vendu** sur la période (`servers_with_sales=0`), la Resp. Op. peut faire un reversement directement
  - Le reversement est marqué `direct_gerante: true` + `created_by: "Reversement direct (Sans serveur) — [Nom]"`
  - Bandeau visuel violet "MODE REVERSEMENT DIRECT (SANS SERVEUR)" affiché dans la page
  - Endpoint `/reports/revenue-by-payment` retourne maintenant `servers_with_sales`
  - Le check exclut les rôles admin/manager — compte les ventes faites par les serveurs uniquement
- **AUDITEUR INTELLIGENT (26/05/2026)**
  - Backend `/api/audit/run` qui scrute les incohérences de la journée (factures pending, écarts de caisse, clôtures anticipées)
  - Frontend `AuditorPanel.jsx` (Admin only) avec checks traduits en français
- **STATISTIQUES — Fix critique (26/05/2026)**
  - Les statistiques excluaient à tort les factures `pending`; correction du CA dans `/reports/*` pour ne compter que `validated`
- **JOURNAL COMPTABLE OHADA (27/05/2026)** ✅ Complet
  - Backend `/api/journal/ohada?start_date=&end_date=&account=&search=` : transforme factures, achats, reversements, avances gérante, fonds propres, ouvertures de journée en écritures à double entrée (D/C)
  - Mapping comptes OHADA : 571 Caisse · 521 Banques · 467 Compte courant (Gérante/FP) · 70x Ventes · 60x Achats · 61x Services · 658 Divers · 581 Virement de fonds
  - Frontend `OhadaJournal.jsx` intégré en 3ème sous-onglet "Plan OHADA" du menu Journal (Admin only)
  - Vue Brouillard (5 colonnes : Date / Libellé / Compte D / Compte C / Montant) + Vue 2 colonnes (Débit / Crédit côte à côte)
  - Filtres : période (presets Aujourd'hui/Hier/7j/Mois) + numéro de compte + recherche libre
  - KPI : Total Débit, Total Crédit, Nombre d'écritures, Équilibre (✓ OK)
  - Soldes par compte affichés (D, C, Solde)
  - **Export Excel (CSV UTF-8 BOM)** et **Export PDF (impression navigateur)** opérationnels
  - Itération 85 : 13/13 tests backend ✓ · UI 100% vérifiée
- **AUDITEUR — Détails complets des factures supprimées/modifiées (27/05/2026)** ✅
  - `_log_audit` enrichi : snapshot contient désormais items, payment_method, subtotal, discount, table_number, invoice_number, dates création/validation, ventilation par département
  - `audit_engine.py` : 2 contrôles enrichis (FACTURES_SUPPRIMEES_OU_ANNULEES, FACTURES_MODIFIEES) avec `details[]`
  - Frontend `AuditorPanel.jsx` : composant `FactureCard` expansible avec détails complets
  - Modal "Détails" enrichi dans `AuditLogsTab.jsx` : sections monétaires + articles + message explicite si snapshot legacy
- **STATISTIQUES — Date du jour toujours affichée (28/05/2026)** ✅
  - `reports.py`: `daily_stats` inclut la date du jour même sans facture validée (consultation mois en cours)
  - Frontend `StatsTab.jsx` : badge vert "AUJOURD'HUI" + fond émeraude + message "aucune facture validée pour l'instant"
- **MODE HORS-LIGNE — Phase 1 + Phase 2 (29/05/2026)** ✅
  - Backend : sync_snapshot.py + sync_queue.py (idempotent, Admin-gagne)
  - Frontend : OfflineIndicator + IndexedDB + auto-sync au retour
  - Itération 86 : 12/12 backend ✓
- **RÉGULARISATION DE BONS À DATE PASSÉE (29/05/2026)** ✅
  - Création rétroactive (max 7 jours) + modif date (admin) + audit + alerte >3/jour
  - Sélecteur d'articles enrichi : recherche + onglets catégories + grille (style prise de commande)
  - Itération 87 : 14/14 backend ✓, 11/11 frontend ✓
- **RECOUPEMENT IA CUISINE & JEUX (30/05/2026)** ✅
  - Backend `recoupement.py` : POST /extract-cuisine + /extract-jeux (OCR Gemini 3.1 Pro Vision), POST /compare-cuisine + /compare-jeux, GET /list
  - Workflow : Photo → OCR IA → Tableau éditable (correction humaine) → Comparaison auto vs ventes système → Rapport d'écarts + entrée audit
  - Seuils : alerte si écart > 1 unité OU > 10% par item ; audit critical si ≥ 3 alertes
  - Matching fuzzy de noms (normalisation + tokens overlap)
  - Frontend `RecoupementPanel.jsx` : intégré sous l'onglet Audit, deux cartes (Cuisine ambre + Jeux violet), upload PNG/JPEG/WEBP, prévisualisation, tableau d'items éditable, rapport coloré (vert OK / rouge alerte / orange absent système)
  - Statuts détectés : ok, over_declared, under_declared, missing_in_system, missing_in_declaration
  - Intégration : Emergent LLM Key (EMERGENT_LLM_KEY) avec emergentintegrations, modèle `gemini-3.1-pro-preview`
- **JOURNAL COMPTABLE OHADA (27/05/2026)** ✅ Complet
  - `_log_audit` enrichi : snapshot contient désormais items, payment_method, subtotal, discount, table_number, invoice_number, dates création/validation, ventilation par département
  - `audit_engine.py` : 2 contrôles enrichis
    - `FACTURES_SUPPRIMEES_OU_ANNULEES` (anciennement filtré aux gérantes) — affiche TOUTES les annulations/suppressions sans filtre, avec auteur et rôle
    - `FACTURES_MODIFIEES` (anciennement uniquement validées) — capte toute modification d'items/prix/total/discount; sévérité critique si la facture était déjà validée
  - Frontend `AuditorPanel.jsx` : nouveau composant `FactureCard` expansible avec n° facture, table, serveur, client, mode de paiement, dates, articles détaillés (qté/PU/total/département), ventilation par département, before/after du total si modifié
  - Fix bug field-name : `actor_role`/`snapshot` (au lieu de `author_role`/`entity_snapshot` qui n'existaient pas)

## Backlog (Priorisé)
- **P0-OFFLINE Phase 3** : Validation factures + reversements + résolution conflits + n° factures pré-alloués par blocs de 50
- **P1** : Alertes de péremption produits (dashboard Stock)
- **P2** : Export PDF/Excel du Compte courant (relevé bancaire)
- **P3** : Intégration Resend pour mot de passe oublié
- **P4** : Refactoring continu `CaissePage.jsx` (>8000 lignes) / `StockPage.jsx`
- **P2 (legacy)** : Clarifier règles de portioning ("b")

## Architecture
- Backend : FastAPI + MongoDB (motor) — routes dans `/app/backend/routers/`
- Frontend : React + Tailwind + shadcn/ui — pages dans `/app/frontend/src/pages/`
- Tests : Pytest dans `/app/backend/tests/` (≥36 fichiers, tous verts)

## Key Endpoints (récents)
- `GET /api/day-openings/{date}` · `POST /api/day-openings/{date}/open` · `GET /api/day-openings/history/list`
- `GET /api/purchase-price-history` (+ `/by-product`, `/backfill`)
- `GET /api/quick-products/`
- `POST /api/location-simulations/`
- `POST /api/billettage/close-day-auto-fill`

## DB Schema (récent)
- `day_openings` : `{ id, date, status (open/closed), opened_by, opened_by_role, opened_at, initial_cash, notes, closed_at }`

## Integrations
- Twilio (DISABLED via kill-switch)
- Resend (future P3)
- Emergent LLM Key (JournalTab)

## Credentials (dev)
Voir `/app/memory/test_credentials.md`
