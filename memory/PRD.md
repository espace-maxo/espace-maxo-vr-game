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
- **🆕 Catalogue de menus dynamique + Admin CRUD (Feb 2026)** :
  - Nouveau backend `routers/delivery_menu.py` : collection MongoDB `delivery_menu_items` (auto-seed 92 items au 1er appel).
  - Endpoints : `GET /api/delivery-menu` (public), `GET/POST/PATCH/DELETE /api/admin/delivery-menu/items[/{id}]` (JWT Bearer admin write-access).
  - **Plats locaux sur commande sans prix** : `price=null` → affichage public « Sur devis · contactez-nous » + bouton **Devis WhatsApp** (lien wa.me pré-rempli avec nom du plat).
  - **Page publique `/livraison`** désormais dynamique : `useEffect` charge `dynamicItems`, fusionne avec META catégories (icônes/couleurs en dur) pour produire `liveMenuData`. Fallback sur menu hardcoded si l'API échoue.
  - **Nouveau panel Admin** `/admin/dashboard` → onglet « Carte de menus » : composant `MenuManagerPanel.jsx` avec CRUD complet (modifier prix, ajouter plat, masquer/réafficher, supprimer), filtre par catégorie, toggle "Sur devis" via prix vide.
  - **Tests** : 25/25 pytest backend ✅ (iter122).
- **🆕 Workflow Cuisine — Clôture de journée Chef (Feb 2026)** :
  - Le Chef Cuisinier dispose désormais d'un bouton **CLÔTURER** dans le header de son dashboard.
  - Modal de confirmation simple → POST `/api/cuisine/close-day` agrège tous les bons cuisine du jour, calcule (total_orders, total_items, total_quantity, total_revenue, top_items), enregistre dans la collection `cuisine_day_closures`, et marque les `caisse_tables` avec `cuisine_day_closed_at`.
  - Effet côté Chef : onglets **Commandes** et **Historique** se vident automatiquement (filtre `cuisine_day_closed_at` exclu pour `actor_role=cuisinier`). L'Admin conserve la visibilité complète.
  - Menu Admin renommé **"Rapports Cuisine & Jeux"** (anciennement "Cuisine & Jeux").
  - Nouvel onglet **"Clôtures Chef"** dans RecoupementPanel (1ère position, defaultValue) avec :
    - Vue résumé agrégée (bons, lignes, plats préparés, CA cuisine)
    - Liste des clôtures avec top plats inline
    - Filtres date_from / date_to
    - Modal détail : KPIs, top 10 plats préparés, détail bon par bon avec items
    - Suppression (admin) avec audit_log
  - Endpoints : `POST /api/cuisine/close-day`, `GET /api/cuisine/day-closures`, `GET /api/cuisine/day-closures/{id}`, `DELETE /api/cuisine/day-closures/{id}`.
  - Composant frontend : `/app/frontend/src/pages/caisse/components/CuisineDayClosuresList.jsx`
  - **Tests** : 16/16 pytest passent (iter121).
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
