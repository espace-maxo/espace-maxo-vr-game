# PRD - Caisse Pro / Espace Maxo

## Original problem statement
L'application POS ("Caisse Pro") et le module de Gestion de Stock (Espace Maxo) nécessitent une stricte séparation des recettes, un contrôle rigoureux du workflow financier, et une synchronisation intelligente entre la Caisse et le Stock.

## Core requirements
- Haute fiabilité financière, comptabilité OHADA exportable
- Résilience réseau (offline mode)
- Réservations de tables et commandes en ligne avec système de promotion dynamique
- Centralisation des notifications pour l'Admin
- Pilotage fin des statistiques et de l'historique

## Recent changes (Feb 2026)
- **Point de stock terrain (Resp Op)** : nouveau bouton 📋 dans la top bar de Caisse Pro (manager + admin). Modal avec 3 onglets : Nouveau relevé (catégories sélectionnables · saisie qty libre · notes justificatives), Mes/Tous les rapports, Détail. Backend `routers/field_stock.py` avec création, listing filtré par rôle, détail, suppression, et `POST /reconcile` (Admin) créant des mouvements d'ajustement pour rapprocher le stock système.
- **Suivi sélectif des Prévisions d'épuisement** : nouveau champ `is_tracked` sur stock_products. Endpoints `PATCH /api/stock/products/{id}/track` et `GET /api/stock/products/tracked-count`. Le forecast filtre `is_tracked=True`. Bouton Target dans Produits & Mouvements, empty state + CTA dans Prévisions.
- **Fix bug stock forecast** : mapping `quantity` / `stock_min` corrigé dans `GET /api/stock/forecast`
- **Refonte navigation Stock** (Feb 2026) :
  - Catalogue : 5 → 3 onglets (Produits & Catégories / Recettes & Portions / Liaisons Caisse↔Stock)
  - Stocks : 6 → 3 onglets (Stock & Mouvements / Inventaire & Appro / Prévisions épuisement)
  - Segmented control interne pour les sous-vues fusionnées
- **Épuration page Produits** : 5 → 3 KPIs (Catalogue, Valeur du stock, Alertes), filtres compactés avec bouton "Plus de filtres"

## Roadmap
- **P2** : Export PDF/Excel du "Compte courant"
- **P3** : Email "Mot de passe oublié" via Resend
- **P4** : Refactoring fichiers monolithiques (CaissePage, StockPage, BookingPage, DeliveryPage)

## Credentials
Voir `/app/memory/test_credentials.md`
