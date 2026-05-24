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
