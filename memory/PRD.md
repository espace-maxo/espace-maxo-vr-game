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

## Backlog (Priorisé)
- **P1** : Alertes de péremption produits (dashboard Stock)
- **P2** : Export PDF/Excel du Compte courant (relevé bancaire)
- **P3** : Intégration Resend pour mot de passe oublié
- **P4** : Refactoring continu `CaissePage.jsx` / `StockPage.jsx`
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
