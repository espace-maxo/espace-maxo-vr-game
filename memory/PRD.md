# PRD — Caisse Pro + Gestion Stock (Espace Maxo)

## Original Problem Statement
Application POS ("Caisse Pro") et module Gestion de Stock nécessitant stricte séparation des recettes, contrôle rigoureux du workflow financier, et synchronisation intelligente entre Caisse et Stock.

## Personae
- Administrateur : supervise, valide, fait la réconciliation.
- Gérante / Serveuse (PIN) : prises de commandes, achats, journées, billettage.

## Core Requirements
- Fermeture de journée fiable, billettage global unique, traçabilité des ajustements.
- Workflow Achats → Validation Admin → Sync conditionnelle vers Stock.
- Facturation différée à l'impression du bon client.
- Simulateur de devis Location (Stock + Marché) sans impact stock.
- Répertoire historique des prix d'achat alimenté automatiquement.
- Kill-switch SMS Twilio (désactivé en dur).

## What's Implemented (Stable)
- Billettage global unique + auto-création + traçabilité des ajustements
- Réconciliation garde-fou (admin doit justifier les écarts)
- Sync Caisse ↔ Stock (toggle "Passer en stock" sur les items d'achat)
- Auto-ajustement stock lors d'une modification du catalogue
- Facture générée uniquement à l'impression du bon client
- Tracking figé des durées d'occupation tables (last_order_sent_at)
- Simulateur devis Locations + création de réservation depuis simulation
- Catalogue produits cliquable Stock + Marché dans le simulateur
- Catalogue Marché/Supermarché (93 produits seedés)
- Notifications Twilio totalement désactivées (kill-switch)
- **Répertoire des prix d'achat** : backend (`purchase_price_history.py`) + UI (`PurchasePriceHistoryTab.jsx`), branché sur expense.completed, 5/5 tests Pytest OK
- **Nettoyage données de test PPH effectué le 22/05/2026** (12 entrées test purgées)

## Backlog (Priorisé)
- **P1** : Alertes de péremption produits sur dashboard Stock
- **P2** : Export PDF/Excel du Compte courant (relevé bancaire)
- **P3** : Intégration Resend pour mot de passe oublié
- **P4** : Refactoring continu `CaissePage.jsx` / `StockPage.jsx`
- **P2 (legacy)** : Clarifier règles de portioning ("b")

## Architecture
- Backend : FastAPI + MongoDB (motor) — routes dans `/app/backend/routers/`
- Frontend : React + Tailwind + shadcn/ui — pages dans `/app/frontend/src/pages/`
- Tests : Pytest dans `/app/backend/tests/` (≥30 tests, tous verts)

## Key Endpoints
- `GET /api/purchase-price-history` (+ `/by-product`, `/backfill`)
- `GET /api/quick-products/`
- `POST /api/location-simulations/`
- `POST /api/billettage/close-day-auto-fill`

## Integrations
- Twilio (DISABLED via kill-switch)
- Resend (future P3)
- Emergent LLM Key (JournalTab)

## Credentials (dev)
Voir `/app/memory/test_credentials.md`
