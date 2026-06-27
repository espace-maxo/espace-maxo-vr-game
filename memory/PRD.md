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
