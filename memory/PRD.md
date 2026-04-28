# Espace Maxo - PRD

## Problem Statement
Application pour le restaurant "Espace Maxo" à Cotonou (Bénin) permettant de réserver des jeux VR, payer par mobile money, commander des combos avec session de jeu, réserver des tables avec acompte, gérer les réservations, et gérer un système de facturation POS interne.


## 28/04/2026 — Stock : Liaison multi-cible Caisse↔Stock (bidirectionnel) (DONE)

**Demande utilisateur** : « dans stock permettre de lier un produit caisse a plusieurs produits stock cible et vice versa ».

**UX retenue (1b + 2c + 3b + 4a)** : 1 produit Caisse peut être lié à **N produits Stock** sans passer par une recette ; chaque cible est décrémentée d'1 × qté vendue à chaque vente. UI éditable des **deux côtés** (Caisse et Stock). Le multi-stock + recette remplacent l'ancien `stock_product_id` (legacy lu de manière transparente). Vue inversée disponible côté Stock (Stock → Caisse).

**Backend** :
- `server.py` `CaisseProduct[Create]` : nouveau champ `stock_links: List[str]` (tableau d'IDs stock). Le legacy `stock_product_id` est conservé pour rétrocompatibilité (lu et migré à la volée).
- `PUT /api/caisse/products/{id}` : exclusion mutuelle stricte entre `stock_links` (multi), `stock_recipe_id` (recette) et legacy `stock_product_id`. Si legacy reçu, migré automatiquement vers `stock_links: [id]`.
- `auto-link-to-stock` & `smart-link-to-stock` (server.py) : écrivent désormais dans `stock_links: [matched_id]` au lieu de `stock_product_id`. La détection `already_linked` couvre tous les types (`stock_links`, `stock_product_id`, `stock_recipe_id`).
- `routers/invoices.py` (déstockage automatique sur validation) : la logique `linked_stock_product` (singulier) est devenue `linked_stock_products` (liste). Boucle sur chaque cible : 1 mouvement `sortie` par stock + update `quantity/valeur_stock/statut`. Fallback legacy `stock_product_id` conservé pour les vieux docs non migrés. Le `reason` du mouvement est suffixé `(multi-lien)` quand la liste contient ≥ 2 cibles, pour audit clair.
- `routers/stock.py` :
  - `GET /api/stock/destock-live` : `linked` détecté désormais sur `stock_links OR stock_product_id OR stock_recipe_id`. Réponse enrichie avec `stock_links`/`stock_recipe_id` par produit.
  - **Nouveau endpoint** `GET /api/stock/links-overview` : vue bidirectionnelle complète. Retourne :
    - `caisse_to_stock` : chaque produit Caisse + ses cibles stock résolues (nom, qty, unit, code).
    - `stock_to_caisse` : chaque produit Stock + ses consommateurs Caisse (calculé par traversée inverse).
    - `recipes` : produits Caisse liés via recette (séparés).
    - `summary` : KPIs (total Caisse, liés, multi-cibles, via recette, stocks consommés).

**Frontend** :
- **Côté Caisse** (`LinkStockModal.jsx` réécrit) : passage du single-click au **multi-select** (cases à cocher). Liste des stocks sélectionnés affichée en chips (avec X pour retirer un lien). Bouton "Enregistrer" actif uniquement si changement détecté. Le legacy `stock_product_id` est seedé automatiquement comme cible unique. Mode "Recette composée" préservé en exclusion mutuelle.
- **Côté Stock** : nouveau composant `pages/stock/components/CaisseStockLinksOverview.jsx` + nouvel onglet **"Liaisons Caisse↔Stock"** dans `StockPage.jsx`. 2 vues commutables :
  - "Caisse → Stock" : liste des produits Caisse avec leurs cibles (chips vertes) + badge `N cibles` pour multi-link.
  - "Stock → Caisse" : liste des produits Stock avec leurs consommateurs Caisse (chips cyan) + badge `N consommateurs`.
  - Recherche transverse (filtre sur les noms et les chips).
  - Bouton "Modifier" sur chaque ligne ouvre un modal d'édition multi-select unifié (côté Caisse → coche les stocks ; côté Stock → coche les produits Caisse, et le backend met à jour leurs `stock_links` respectifs).
  - 5 KPI cards : Produits Caisse, Caisse liés, Multi-cibles, Via Recette, Stocks consommés.

**Test end-to-end** :
- Backend curl :
  - `PUT /caisse/products/{id}` avec `stock_links: [SP1, SP2]` → vérifié, persiste correctement, vide `stock_product_id`.
  - `GET /stock/links-overview` → 39 caisse liés / 1 multi-cibles / 18 stocks consommés / 6 consommateurs sur "Poulet entier".
  - **Test déstockage multi-cible** : facture `EM-20260428-0001` validée avec 1× "Test Produit Manager" (lié à Abats de boeuf + Ail) → Abats de boeuf 2→1 ✅, Ail 6→5 ✅, 2 mouvements `sortie` créés avec reason `(multi-lien)` ✅.
- Frontend Playwright :
  - Onglet "Liaisons Caisse↔Stock" dans Stock affiche les bons KPIs et les chips.
  - Vue inverse "Stock → Caisse" : Poulet entier → 6 consommateurs visibles, etc.
  - Modal d'édition s'ouvre avec les coches pré-cochées sur les liens existants.



## 28/04/2026 — Proforma : Statut "Fourni" / "Non fourni" sur les presets équipements/services (DONE)

**Demande utilisateur** : « pour les équipements et autres services proposer des boutons Fourni et Non Fourni ».

**UX retenue (1c + 2c + 3c + 4b)** : clic sur un preset = ajout direct dans la liste avec statut **Fourni** par défaut ; toggle dans la ligne du tableau pour basculer Fourni ↔ Non fourni ; statut purement informatif (prix libre) ; appliqué uniquement aux 20 presets (pas aux articles manuels).

**Backend** (`/app/backend/server.py`) :
- `ProformaInvoiceItem` : 2 nouveaux champs optionnels `preset_kind: Optional[str]` (`'equipment'|'service'|None`) et `provided_status: Optional[str]` (`'fourni'|'non_fourni'|None`).

**Frontend `ProformaTab.jsx`** :
- Nouvelle fonction `addPresetItem(name, kind)` : ajoute la ligne avec `preset_kind` + `provided_status: 'fourni'` (default), `unit_price: 0`. Si même preset existe déjà, on incrémente la quantité.
- Nouvelle fonction `togglePresetStatus(index)` : bascule `fourni` ↔ `non_fourni`.
- Les 20 boutons presets (`preset-eq-*`, `preset-svc-*`) appellent maintenant `addPresetItem(...)` au lieu de pré-remplir le formulaire manuel.
- Détection mise à jour : `isLabel = !isPreset && (item.is_label || price <= 0)` → un preset à 0 F n'est plus traité comme un libellé.
- Rendu de chaque ligne preset : badge `✓ Fourni` (vert) ou `✗ Non fourni` (rouge), cliquable pour basculer (`data-testid=toggle-status-{index}`). Fond de ligne tinté en vert/rouge.
- `saveEditingItem` préserve `preset_kind` / `provided_status` lors de l'édition inline.
- PDF : badge inline "Fourni" / "Non fourni" (pastille colorée) accolé au nom de l'article dans la colonne Description. Si prix=0 → "—" pour P.U. et Montant.

**Frontend `ProformaPublicView.jsx`** :
- Affichage du badge Fourni/Non fourni en pastille colorée sur la vue publique partagée par QR Code.
- Lignes preset à 0 F : "Quantité : N" en italique (au lieu d'un calcul de prix).

**Test** :
- Backend : `POST /api/proforma-invoices` avec items `preset_kind`/`provided_status` → persistés et restitués correctement par `GET /api/proforma-invoices/{id}` (proforma `PRO-20260428-0002`).
- Frontend (screenshot Playwright) : modal "Nouvelle Proforma", 4 presets cliqués (2 équipements + 2 services), 2 toggles vers "Non fourni" → badges et fond de ligne corrects. Vue publique `/proforma/{id}` : badges visibles côté client.


---
## 25/04/2026 — Modifier conditions de remboursement + Marquer comme payé (DONE)

**Demande utilisateur** : "dans le module caisse, dans le menu compte courant, permettre de modifier les conditions de remboursement et aussi de marquer comme payé".

**Backend** (`/app/backend/routers/current_accounts.py`) :
- Modèle `ScheduleEntryUpdate { label?, due_date?, expected_amount? }` + endpoint `PUT /api/current-accounts/{id}/schedule/{schedule_id}` : édition partielle d'une échéance.
- `DELETE /api/current-accounts/{id}/schedule/{schedule_id}` : suppression d'une échéance via `$pull`.
- Modèle `MarkScheduleAsPaidBody { repayment_date?, method?, reference?, notes?, amount_override? }` + endpoint `POST /api/current-accounts/{id}/schedule/{schedule_id}/mark-paid` : crée un repayment lié (`schedule_id`). **Idempotent** : si un repayment référence déjà cette échéance, retourne `already_paid=true`.
- Enrich logic mise à jour : une échéance est `paid=true` si un repayment a son `schedule_id` **OU** si la logique cumulative la couvre.

**Frontend** (`/app/frontend/src/pages/caisse/components/CurrentAccountsTab.jsx`) :
- State `editingScheduleId` + helpers `startEditSchedule` / `saveScheduleEdit` / `deleteScheduleEntry` / `markScheduleAsPaid`.
- 3 nouvelles actions sur chaque échéance (admin only, déplié):
  - **CheckCircle vert** (data-testid `schedule-mark-paid-{id}`) : marquer comme payé (avec confirm preview + toast).
  - **Edit2 bleu** (data-testid `schedule-edit-btn-{id}`) : passe la ligne en mode édition inline (3 inputs : date, libellé, montant + Save/Cancel).
  - **Trash2 rose** (data-testid `schedule-delete-{id}`) : supprimer l'échéance.
- Le bouton "Marquer comme payé" est masqué pour les échéances déjà payées (ligne barrée verte).
- Imports ajoutés : `Save`, `X`.

**Test end-to-end** :
- Backend : 20/20 tests pytest dans `/app/backend/tests/test_schedule_edit_markpaid_iter69.py`. Curl validé : édition (10000→12000, date+label), mark-paid avec idempotency, ré-paiement bloqué proprement.
- Testing agent (iter. 69) : 100% backend + 100% frontend. Régression : prélèvement automatique, repayments existants, création/édition de compte intacts.


---
## 25/04/2026 — Composition automatique de fiches techniques (DONE)

**Demande utilisateur** : "compose moi des fiches de recettes en te basant sur une portion de chaque ingrédient pour pouvoir décrémenter le stock". Implémenté un moteur de génération automatique par analyse du nom du plat.

**Backend** (`/app/backend/routers/stock.py`) :
- Constante `_DISH_KEYWORD_RULES` : table de 35+ règles mappant un mot-clé (poulet, riz, salade, sauce, biere, etc.) vers une liste d'ingrédients avec quantité par défaut. Ex : "poulet" → blanc de poulet 0.25 kg + oignon 0.05 kg + tomate 0.04 kg + huile 0.04 L + sel 0.005 kg.
- Fonction `_compose_ingredients_for_dish(dish_name, stock_products)` : applique toutes les règles dont le mot-clé apparaît dans le nom du plat, sélectionne le meilleur produit Stock pour chaque ingrédient (préfère même unité + en stock), retourne la liste {product_id, product_name, quantity, unit}.
- Endpoint `POST /api/stock/recipes/auto-compose` avec `{only_unmatched, skip_dishless, dry_run, department_filter, selling_price_default}`. Retourne rapport `{scanned, skipped_existing, created, skipped_no_match, created_count}`.
- Intégration `logging` (logger ajouté).

**Frontend** (`/app/frontend/src/pages/StockPage.jsx`) :
- Bouton **"Composer auto"** (ambre, BookOpen icon, admin-only, `data-testid="auto-compose-recipes-btn"`) sur l'onglet **Fiches Techniques**.
- Confirmation explicative : "L'algorithme analyse le nom de chaque plat… 1 portion par défaut… Vous pourrez ensuite ajuster chaque fiche manuellement."
- Toast détaillé : "X fiche(s) créée(s) · Y déjà existantes ignorées · Z sans correspondance".

**Résultat sur le terrain** :
- 83 fiches générées du premier coup pour les 85 produits Caisse (2 fiches existantes préservées). Total 85 recettes en base.
- Décrément stock automatique au fil des ventes : déjà câblé dans `invoices.py` lignes 307-350 (recipe matching par `caisse_product_name`).

**Test end-to-end** :
- Backend : 11/11 tests pytest dans `/app/backend/tests/test_auto_compose_recipes_iter68.py`. Curl validé : Salade niçoise → 5 ingrédients pertinents, Samossas Poulet → 8 ingrédients, etc.
- Testing agent (iter. 68) : 100% backend + 100% frontend. Vérifications : keyword matching, dry_run, only_unmatched, skip_dishless, department_filter, frontend bouton admin-only, régression recettes existantes.


---
## 25/04/2026 — Détail des sorties sur le tableau de bord Stock (DONE)

**Demande utilisateur** : "fais moi le détail de la liste des sorties sur le tableau de bord". Choix : (1) tableau détaillé avec Date / Produit / Qté / Motif / Montant + filtres période/produit.

**Frontend** (`/app/frontend/src/pages/StockPage.jsx`) :
- KPI card **"Sorties Aujourd'hui"** désormais cliquable (data-testid `sorties-today-card`) avec texte d'aide "⤵ Cliquer pour le détail" / "Masquer le détail".
- Panneau **"Détail des sorties"** (data-testid `sorties-detail-panel`) s'ouvre au clic, sous les KPIs, contenant :
  - **Filtres** : Du (date), Au (date), Motif (Tous / Sortie-Vente / Perte / Casse), Produit (recherche client-side)
  - **Bouton "Filtrer"** (data-testid `sorties-refresh-btn`)
  - **Récap** : X mouvement(s) · Y unités · Valeur totale Z F
  - **Tableau** (data-testid `sorties-table`) avec colonnes Date / Produit / Qté / Motif / PU / Total / Réf-Utilisateur
- Badges colorés par motif : sortie=rouge, perte=ambre, casse=rose, 🛒 Vente si reason contient "Vente"
- État défaut : Du=Au=aujourd'hui, Motif=Tous

**Test end-to-end** :
- Backend : GET `/api/stock/movements?movement_type=sortie&date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&limit=500` validé via curl (5 sorties retournées avec product_name, quantity, unit, unit_price, total_value, reason).
- Testing agent (iter. 67) : 100% frontend. Toutes les fonctionnalités vérifiées (clic, filtres, récap, badges, toggle, fermeture, régression).


---
## 25/04/2026 — Liaison ventes → stock (auto-link, badge, filtre, autocomplete) (DONE)

**Demande utilisateur** : "LIER les ventes au stock". État initial : la mécanique de décrémentation auto via `stock_product_id` existait déjà mais 0/81 produits étaient liés. Choix utilisateur : (1b) liaison auto silencieuse pour matches >= 80%, (2a) badge + filtre, (3a) autocomplete création.

**Backend** (`/app/backend/server.py`) :
- `POST /api/caisse/products/auto-link-to-stock?threshold=0.80&dry_run=false` : scanne tous les caisse products non liés, pour chacun calcule la similarité `difflib.SequenceMatcher` vs chaque stock product actif, prend le meilleur match >= seuil. Détecte ambiguïtés (2+ matches >= 0.95 trop proches). Retourne rapport `{scanned, already_linked, linked[], ambiguous[], no_match[], threshold, dry_run}`.
- `GET /api/caisse/products/stock-suggestions?name=X&limit=5&threshold=0.40` : autocomplete avec **scoring boosté** — exact=1.0, prefix=0.92, contains=0.85, inverse-contains=0.75. Évite le bruit pour requêtes courtes ('poulet' → 'Poulet entier' au lieu de 'Poulpe').

**Frontend** (`/app/frontend/src/pages/caisse/components/ProductsTab.jsx`) :
- Badge `X/Y liés au stock` (ambre si <100%, vert sinon).
- Badge cliquable `Voir uniquement les X non liés` qui filtre la vue.
- Bouton **"🔗 Lier automatiquement"** (admin/manager only) qui appelle l'endpoint avec confirmation, affiche un toast détaillé avec les compteurs et rafraîchit le catalog.

**Frontend** (`/app/frontend/src/pages/CaissePage.jsx`) :
- Modal Création produit : autocomplete sur le champ Nom (debounce 250ms, >= 2 caractères). Panneau "💡 Lier ce produit à un produit Stock existant ?" avec jusqu'à 5 suggestions cliquables (% similarité affiché).
- Cliquer une suggestion pré-remplit `stock_product_id`. Affichage `🔗 Lié au stock : <nom>` + bouton (délier).
- Helper `refreshCatalog()` ajouté pour rafraîchissement après auto-link.

**Test end-to-end** :
- Backend : 11/11 tests pytest dans `/app/backend/tests/test_stock_link_iter66.py`. Auto-link a effectivement créé 3 liens (Poulet Bicyclette Complet→Poulet bicyclette 0.81, Riz blanc→Riz blanc 1.0, Frite surgelée→Frites surgelees 0.867). État : 4/83 produits liés.
- Testing agent (iter. 66) : 100% backend + 100% frontend. Vérifié : badge, filtre, bouton auto-link, autocomplete, (délier), régression LinkStockModal manuel.


---
## 25/04/2026 — Bug fix : URL double `/stock/stock/` dans StockPage.jsx (DONE)

**Bug rapporté** : "ça affiche un message d'erreur" lors de la validation d'une conversion (📦) sur le produit Beaufort. Le toast disait "Erreur lors de la conversion".

**Cause racine** : le constant `API` dans `/app/frontend/src/pages/StockPage.jsx` est défini comme `${REACT_APP_BACKEND_URL}/api/stock`. Mais 3 lignes appelaient `${API}/stock/products/...` → URL finale `/api/stock/stock/products/...` qui retourne **404 Not Found**. Les autres axios calls utilisaient correctement `${API}/products/...`.

**Fix** :
- Ligne 173 : `${API}/products/{id}/add-package` (bouton + d'ajout package)
- Ligne 199 : `${API}/products/convert-unit-bulk` (conversion en lot)
- Ligne 236 : `${API}/products/{id}/convert-unit` (bouton 📦 individuel)

**Bonus** : amélioration du toast d'erreur pour remonter le détail backend (au lieu d'un message générique). Try/catch isolé pour ne pas surfacer un échec de `fetchProducts`/`fetchDashboard` post-conversion comme une erreur de conversion.

**Test** : curl validé — `POST /api/stock/products/5bcde970.../convert-unit {multiplier:1,new_unit:'unite'}` retourne 200 OK. URL erronée `/api/stock/stock/products/...` retournait bien 404.


---
## 25/04/2026 — Bug fix : Bouton 📦 (Conversion casier→bouteille) sur toutes les lignes (DONE)

**Bug rapporté avec capture** : "Le bouton pour transformer les casiers en bouteilles n'est pas partout et se trouve au mauvais endroit".

**Cause** : 
1. Le bouton 📦 (Package icon) n'apparaissait que pour 11 unités prédéfinies (casier/pack/carton/sac/bidon/pot/plateau/paquet/lot/bac/caisse). Les produits 'unite', 'bouteille', 'kg' n'avaient pas le bouton.
2. Le bouton était dans la colonne ACTIONS (loin du bouton + d'ajout de package qui est dans la colonne STOCK).

**Fix** (`/app/frontend/src/pages/StockPage.jsx`) :
- Bouton 📦 désormais affiché sur **TOUTES les lignes admin**, sans filtre d'unité.
- Bouton 📦 **déplacé dans la colonne STOCK**, immédiatement à côté du bouton vert "+" (les deux actions de packaging groupées).
- Smart defaults étendus dans `openConvertUnit()` pour couvrir tous les types : casier→24/bouteille, pack→6/bouteille, carton→12/bouteille, sac→25/kg, bidon→20/litre, lot→12/unite, paquet→12/unite, boite→6/unite, pot→1/kg, douzaine→12/unite, fallback générique→1/unite.

**Test end-to-end** :
- Testing agent (iter. 65) : 100% frontend. Vérifié : bouton 📦 visible sur toutes lignes (unite, bouteille, kg, casier, lot, etc.), placé dans STOCK column, absent de ACTIONS, admin-only, smart defaults corrects.


---
## 25/04/2026 — Bug fix : Suppression d'achats du point hebdomadaire (DONE)

**Bug rapporté** : "la suppression des achats des points hebdomadaires ne fonctionne pas. NB : cette suppression ne doit pas entrainer la disparition des achats de la liste des achats".

**Cause racine** : l'ancien endpoint `unassign-week-bulk` faisait un `$unset` sur `assigned_week`. Mais comme la dépense avait un `created_at`/`completed_at` dans la semaine en cours, la query du rapport hebdo la **réincluait automatiquement par date**. → Le bouton "Retirer" ne semblait avoir aucun effet visible.

**Fix** : nouveau mécanisme d'exclusion via un champ array `excluded_from_weeks: [str]`.
- Backend : nouveaux endpoints `POST /api/expenses/exclude-from-week-bulk` et `/include-in-week-bulk` (idempotent via `$addToSet` / `$pull`). Identiques pour `/invoices/`.
- Backend : `GET /api/reports/weekly` ajoute un filtre `not_excluded_filter` (`excluded_from_weeks: {$nin: [start_str]}`) à toutes les queries invoices et expenses.
- Frontend : `HebdoReport.jsx` `removeFromWeek()` appelle désormais `exclude-from-week-bulk` avec `week_start`. Confirmation explicite : "L'achat reste disponible dans la liste des achats — il est juste masqué de ce point hebdomadaire."

**Test end-to-end** :
- Backend : 10/10 tests pytest dans `/app/backend/tests/test_exclude_from_week_iter64.py`. Curl validé : avant=12345 F, après exclude=0 F dans le rapport, mais `GET /api/expenses` retourne toujours la dépense avec `excluded_from_weeks=['2026-04-20']`.
- Testing agent (iter. 64) : 100% backend + 100% frontend (sélection cases, bouton, confirm message, toast, refresh, présence dans liste globale après exclusion).


---
## 25/04/2026 — Recharge manuelle des comptes courants (DONE)

**Demande utilisateur** : "oui" en réponse à la suggestion "ajouter un bouton 'Recharger' sur la page de détail d'un compte courant pour top-up en une étape sans passer par un achat".

**Backend** (`/app/backend/routers/current_accounts.py`) :
- Nouveau modèle `TopUpBody { amount, label?, received_date? }`.
- Nouveau endpoint `POST /api/current-accounts/{id}/top-up` : valide montant > 0, incrémente `total_advance`, push une entrée dans `top_ups[]`.

**Frontend** (`/app/frontend/src/pages/caisse/components/CurrentAccountsTab.jsx`) :
- Nouveau bouton **"➕ Recharger"** (ambre, `data-testid="topup-btn-{id}"`) à côté du bouton Remboursement sur chaque compte (visible même si entièrement remboursé — utile pour relancer).
- Modal **TOP-UP** (autoFocus sur montant) avec **calcul live** du solde après recharge.
- Nouvelle section **"Recharges"** dans le panneau Détails (fond ambre) listant tous les `top_ups[]` (recharges manuelles + recharges auto issues de l'allocation intelligente d'iter. 61).

**Test end-to-end** :
- Backend : 9/9 tests pytest dans `/app/backend/tests/test_topup_iter63.py`. Curl validé : 5000 → 20000 après recharge 15000, label persisté, montant négatif rejeté avec 400.
- Testing agent (iter. 63) : 100% backend + 100% frontend. Vérifié : bouton sur tous comptes (y compris fully repaid), validation zéro/négatif, modal live preview, section Détails, régression OK.


---
## 25/04/2026 — Bug fix : Création directe d'un nouveau compte courant (DONE)

**Bug rapporté** : "le compte ne se créé pas automatiquement". Cause racine : dans iter. 61, le mode `create_new` n'était accessible qu'en sélectionnant un compte existant avec solde insuffisant. Si AUCUN compte n'existait, ou si tous les comptes avaient un solde suffisant, l'admin n'avait aucun moyen de déclencher le mode `create_new`. De plus, le dropdown était caché si `availableAccounts.length === 0`.

**Fix** :
- Frontend : ajout d'une option `__create_new__` directe dans le dropdown : `➕ Créer un nouveau compte courant (XXX F)` (en vert). Cliquer dessus déclenche `window.confirm` puis crée immédiatement un compte dédié sans dépendre d'un compte existant.
- Frontend : retrait du gating `availableAccounts.length > 0` sur les deux dropdowns (validés + terminés). Le dropdown est désormais visible même sans compte existant, l'admin peut donc créer un compte directement depuis l'achat.

**Test** :
- Backend : curl validé (création compte 42000 F sans `account_id` passé). Iter. 61 pytest 11/11 toujours OK.
- Testing agent (iter. 62) : 100% frontend. Vérifications : option visible dans les 2 vues, confirm message correct, toast OK, compte créé en base, allocation effectuée, annulation = no-op, régression du window.prompt 3-options OK.


---
## 25/04/2026 — Imputation intelligente d'une dépense au compte courant (DONE)

**Demande utilisateur** : "permettre de rattacher le paiement des achats déjà validés ou terminés au compte courant (le créer par la valeur si le compte courant n'est pas suffisant)" — Choix : (1c) dropdown sur validés ET terminés. (2b+2c+2d) 3 stratégies offertes à l'admin via prompt si solde insuffisant : top-up auto, création de compte dédié, allocation négative. (3a) label "Recharge auto pour <description>".

**Backend** (`/app/backend/routers/expenses.py`) :
- Nouveau modèle `SmartAllocateBody { account_id?, new_account_name?, mode, affects_ca? }`.
- Nouveau endpoint `POST /api/expenses/{id}/allocate-account-smart`.
- Mode `topup_existing` : calcule le manque, incrémente `total_advance` du compte, push une entrée `top_ups[]` avec `{ id, amount, label="Recharge auto pour…", expense_id, created_at }`.
- Mode `create_new` : crée un nouveau compte courant dédié avec `total_advance = expense.amount`, name = "Recharge auto pour <description>", flag `auto_top_up=true`.
- Mode `allow_negative` : alloue sans top-up (balance négative tolérée).
- L'ancien endpoint `POST /api/expenses/{id}/allocate-account` reste fonctionnel pour les cas avec solde suffisant.

**Frontend** (`/app/frontend/src/pages/CaissePage.jsx`) :
- `allocateExpenseToAccount(expense, accountId, affectsCA)` étendu : compare `acc.balance_available` vs `expense.amount`. Si suffisant → POST allocate-account standard. Sinon → `window.prompt` avec 3 choix numérotés (1/2/3) → POST allocate-account-smart avec mode correspondant.
- Toast adapté au mode utilisé.

**Frontend** (`/app/frontend/src/pages/caisse/components/AchatsTab.jsx`) :
- Dropdown "💰 Payé depuis :" ajouté sur la vue **Achats terminés** (admin only, `data-testid="funding-source-completed-{id}"`). Le dropdown sur les Achats validés existait déjà.

**Test end-to-end** :
- Backend : 11/11 tests pytest dans `/app/backend/tests/test_smart_allocation_iter61.py` (créé par testing agent). Validé via curl : 10000 → 50000 (top-up de 40000), création compte 80000 F dédié, allocation négative.
- Testing agent (iter. 61) : 100% backend + 100% frontend (Admin voit le dropdown sur validés et terminés, Gérante ne voit rien, prompt fonctionne, toast OK).


---
## 25/04/2026 — Vue mobile améliorée + Toggle "Liste d'origine / Liste corrigée" (DONE)

**Demandes utilisateur** : (1a) "améliore la vue sur le tel" pour la zone Achats & Dépenses entière, (2c) "permet aussi une vue de la demande modifiée" — toggle visible aux deux rôles (admin + gérante) sur les dépenses `admin_review`.

**Frontend Mobile** (`AchatsTab.jsx`) :
- Éditeur admin "EN COURS DE CORRECTION" : layout reorganisé en **2 sous-rangées** par ligne. Rangée 1 : checkbox + #idx + Description (flex-1) + bouton supprimer. Rangée 2 : select catégorie + Qté + × + PU + = + Total. Plus de débordement horizontal sur 390px.
- Liste pending (Validation en cours) : items utilisent `flex-col sm:flex-row` (description d'abord, qté×PU à la ligne suivante en mobile).
- `truncate` ajouté sur les descriptions longues; `shrink-0` sur badges/boutons fixes.

**Frontend Toggle** :
- Nouveau state `reviewViewMode[expenseId]` avec helpers `getReviewViewMode` / `setReviewViewModeFor`.
- Defaults : Admin = "corrected" (édition active), Gérante = "original" (lecture seule).
- UI : 2 boutons rond pill `📋 Liste d'origine` / `✏️ Liste corrigée` (data-testid `review-view-toggle-{id}`).
- En mode "original" : éditeur admin masqué, vue lecture seule de `original_items` pour les deux rôles.
- En mode "corrected" : Admin voit l'éditeur libre; Gérante voit `items` actuels (lecture seule) avec items rayés en rouge barré.
- Total label adaptatif : "Total d'origine" (montant snapshot) ou "Total corrigé" (montant actuel).

**Test end-to-end** :
- Testing agent (iter. 60) : 100% frontend. 30 scénarios validés sur viewport 390x844 (Admin + Gérante).
- Régressions vérifiées : Première validation, édition libre, Aperçu PDF, Envoyer à la gérante, audit trail.


---
## 25/04/2026 — Trace d'audit des corrections admin (DONE)

**Demande utilisateur** : "trace d'audit" — afficher sur les dépenses approuvées un récapitulatif des modifications faites par l'admin, en comparant `original_items` (snapshot soumis par la gérante au passage admin_review) avec `items` (version finale).

**Frontend Helper** (`AchatsTab.jsx`) :
- `computeAuditTrail(expense)` retourne `{ added, removed, struck, modified, unchangedCount, hasChanges }`. Matching par description normalisée (lowercase + trim).
- Détecte 4 types de changements : ＋Ajoutée, −Supprimée, 🚫 Rayée (avec motif), ✎ Modifiée (qté/PU avant→après en barré).

**Frontend UI** (Vue "Achats validés") :
- Bloc `<details>` "📜 Liste corrigée par {approved_by}" affiché uniquement si `hasChanges=true`.
- Summary court : "+X ajoutée, −Y supprimée, Z rayée, W modifiée".
- Détails au clic, color-coded : vert (ajoutée), rose (supprimée), rouge (rayée), bleu (modifiée).
- **Motifs de rayage** affichés UNIQUEMENT pour l'admin (`showDetails` flag) — la gérante voit "Rayée : <description>" sans motif.

**Frontend Print** (`CaissePage.jsx`) :
- Helper `briefAudit(e)` calcule un résumé en COMPTES UNIQUEMENT (pas de motifs).
- `printAllApprovedExpenses` (A4) : ligne italique orange "📜 Liste corrigée par admin : +X..., ..." sous la description du header.
- `printApprovedExpensesDetailed` : encart italique orange sous la box du montant.
- Respecte la règle initiale : "l'impression ne doit pas faire ressortir les motifs de rayage".

**Bug fix mineur** (par testing agent) :
- Ajout du champ `approved_by: Optional[str]` au modèle `ExpenseUpdate` (`/app/backend/routers/expenses.py` ligne 174). Avant le fix, l'`approved_by` envoyé par le front était ignoré.

**Test end-to-end** :
- Backend curl : 4 items soumis → +Pomme, −Oignon, Sucre rayé (motif a_reporter), Riz qté 10→15 → final amount=45000 F (vs original 50000 F). ✓
- Testing agent (iter. 59) : 100% backend + 100% frontend, vérifications spécifiques :
  - Admin voit motifs / Gérante ne voit pas motifs ✓
  - Print A4/Détail affichent uniquement les compteurs (sans motifs) ✓
  - Régression : badge 🚫 X ligne(s) rayée(s) toujours visible ✓


---
## 25/04/2026 — Workflow à 2 étapes : Première validation puis envoi à la gérante (DONE)

**Demande utilisateur** : "permettre une première validation qui reste dans le profil de l'administrateur qu'on peut encore modifier indéfiniment avant de l'envoyer à la gérante." — Choix : (1b+1c) Gérante voit la liste d'origine en lecture seule + badge "🔒 En cours de validation par l'admin"; (2c) Édition complète des lignes (qty, prix, ajout/suppression) + rayage; (3) Boutons simplifiés "Modifier" + "Envoyer", aperçu PDF avant envoi.

**Backend** (`/app/backend/routers/expenses.py`) :
- Nouveau status accepté : `admin_review` (intermédiaire entre `pending` et `approved`).
- Au passage `pending → admin_review` (PREMIÈRE FOIS uniquement), snapshot des `original_items` + `original_amount` (la gérante continuera de voir l'original). Les modifications ultérieures n'écrasent jamais ce snapshot.
- À chaque modification en `admin_review`, recompute `amount` = somme des items non-rayés.
- Au passage final `approved`, recompute `amount` une dernière fois et set `approved_at`.

**Frontend** (`/app/frontend/src/pages/caisse/components/AchatsTab.jsx`) :
- Bouton "Approuver" sur les pending → renommé **"Première validation"** (ambre, `bg-amber-600`).
- Nouvelle section admin-only "EN COURS DE CORRECTION (votre profil)" affichée dans le sub-tab "Validation en cours".
- Éditeur inline complet par ligne : Checkbox rayage / Select catégorie / Input description / Input qté / Input PU / Total auto-calculé / Trash supprimer + bouton "Ajouter une ligne".
- Pour les lignes rayées : Select motif (Pas opportun/À reporter/À abandonner/Autres) + champ libre si Autres.
- Boutons d'action : "Enregistrer modifications" (gris), **"Aperçu PDF"** (bleu — ouvre `printExpensePDF` avec snapshot édité), **"Envoyer à la gérante"** (vert, confirmation), "Annuler validation" (violet, retour à pending).
- Vue Gérante de l'admin_review : section "EN COURS DE VALIDATION PAR L'ADMIN" (fond ardoise) avec `original_items` en lecture seule + badge `🔒 En cours de validation par l'admin`.
- Compteur du sub-tab "Validation en cours" inclut désormais `pending + admin_review`.

**Frontend Print** (`/app/frontend/src/pages/CaissePage.jsx`) :
- `printExpensePDF` filtre les items struck (consistance) et affiche un badge `⏳ APERÇU (en cours de validation)` au lieu de `✓ APPROUVÉ` quand `status === 'admin_review'`.

**Test end-to-end** :
- Backend curl : 50000 → admin_review (Sucre rayé) 40000 → modif Riz qty 48000 → approved 48000. `original_amount=50000` préservé. ✓
- Testing agent (iter. 58) : 100% frontend + 100% backend, scénario complet validé (Première validation → édition → envoi → vue Gérante).


---
## 25/04/2026 — Rayage des lignes en validation par l'admin (DONE)

**Demande utilisateur** : "permettre à l'administrateur de cocher dans les achats en cours de validation des lignes à rayer avec des observations à cocher (pas opportun, à reporter, à abandonner, autres). Mais l'impression de la liste approuvée ne doit pas faire ressortir ces mentions."

**Backend** (`/app/backend/routers/expenses.py`) :
- `ExpenseItem` étendu : `struck: bool = False`, `strike_reason: Optional[str]`.
- `PUT /api/expenses/{id}` lors de l'approbation d'une dépense groupée recalcule automatiquement `amount` = somme des items non-rayés. Les items rayés restent stockés (traçabilité) avec leur motif.
- Sync stock (`status="completed"`) ignore les items struck (pas d'entrée stock pour les lignes abandonnées).

**Frontend** (`/app/frontend/src/pages/caisse/components/AchatsTab.jsx`) :
- Constante `STRIKE_REASONS` : "Pas opportun", "À reporter", "À abandonner", "Autres".
- `useState(strikeEdits)` : édits locaux par dépense en attente.
- Pour chaque item d'une dépense groupée pendante (admin uniquement) : Checkbox rouge + `<select>` motif + champ texte libre si "Autres".
- Style ligne rayée : `line-through` + fond rouge transparent + opacité 0.6.
- "Total à approuver" recalculé en temps réel + message "X ligne(s) rayée(s) — total recalculé".
- Vue approuvée : badge `📦 Liste (X articles)` n'affiche que le compte des items non-rayés, plus badge admin-only `🚫 X ligne(s) rayée(s) (masquée(s) à l'impression)`.

**Frontend Print** (`/app/frontend/src/pages/CaissePage.jsx`) :
- `printAllApprovedExpenses` (A4) et `printApprovedExpensesDetailed` (1 page/achat) filtrent les items struck. Aucun motif ni mention de rayage n'apparaît à l'impression. Total et compte d'articles recalculés.

**Test end-to-end** :
- Backend curl : 30000 F initial, 1 ligne rayée à 6000 F → amount approuvé = 24000 F ✓.
- Testing agent (iter. 57) : 100% frontend + 100% backend, 28 scénarios validés (Admin + Gérante + impressions A4/Détail).


---
## 25/04/2026 — Bouton "Payé" pour les prestations (DONE)

**Demande utilisateur** : ajouter un bouton "Payé" distinct du bouton "Acheté" pour différencier paiement physique vs paiement financier. Choix utilisateur (option b) : limiter le bouton aux dépenses de **catégorie `paiement`** uniquement (loyer, abonnements, prestations).

**Backend** (`/app/backend/routers/expenses.py`) :
- `ExpenseUpdate` : champs `is_paid: bool`, `paid_at: str (ISO)`, `paid_by: str` ajoutés.
- `PUT /api/expenses/{id}` persiste correctement les 3 champs (validé par curl).

**Frontend** (`/app/frontend/src/pages/caisse/components/AchatsTab.jsx`) :
- Import de l'icône `Wallet` (lucide-react) ajouté.
- Bouton "Payé" affiché conditionnellement : `currentUser.role ∈ {manager, admin}` ET `expense.category === 'paiement'`.
- Toggle on/off avec confirmation `window.confirm`. Au paiement, envoie `{ is_paid: true, paid_at: ISOnow, paid_by: username }`.
- Badge `💰 Payé` (ambre) ajouté à côté de la description quand `is_paid === true`.
- Bouton bascule en variant ambre rempli (`bg-amber-600`) avec libellé "Payé ✓" lorsque payé.

**Test end-to-end** :
- Curl PUT/GET : OK (toggle on/off, persistance MongoDB).
- Testing agent (iter. 56) : 100% backend + 100% frontend (Admin + Gérante).


---
## 24/04/2026 — Caisse↔Stock : lien explicite pour décrément automatique (DONE)

**Demande utilisateur** : permettre à chaque produit Caisse d'être lié à un produit Stock pour qu'1 vente = -1 décrément automatique dans le stock.

**Backend** :
- `server.py` : ajout du champ `stock_product_id` (string, default "") sur `CaisseProductCreate` + `CaisseProduct`.
- `routers/invoices.py` : nouvelle logique prioritaire dans la validation de facture. Avant le match par recette ou par nom, vérifie si le produit Caisse a un `stock_product_id` renseigné → si oui, décrément direct du stock lié. Trace `stock_movements` avec `movement_type=sortie` et motif « Vente (lien direct) ».
- `PUT /api/caisse/products/{id}` accepte déjà un dict → on lui envoie `{stock_product_id: "..."}` pour lier/délier.

**Frontend** :
- `ProductsTab.jsx` mis à jour : nouvelle prop `onLinkStock`. Chaque produit affiche une icône Link2/Link2Off (verte si lié, grise sinon) + badge Link2 à côté du nom si lié.
- Nouveau composant `LinkStockModal.jsx` : modal de sélection avec barre de recherche (préfillée avec les 2 premiers mots du nom Caisse), liste filtrée des produits Stock, clic sur un produit → liaison, bouton *Délier* rouge si déjà lié.
- Intégré dans `CaissePage.jsx` via `useState showLinkStockModal + linkStockTarget`. Callback `onLinked` rafraîchit le catalogue.

**Test end-to-end** via curl :
- Link caisse → stock OK, DB persiste, unlink OK.
- Lint JS + Python propres.

**Utilisation** : *Caisse → Gestion des produits* → cliquer sur l'icône chaîne (Link2Off grise) à droite d'un produit → sélectionner le produit stock correspondant → à chaque vente validée, le stock se décrémente automatiquement.

---
## 24/04/2026 — Stock : conversion par lot + bouton individuel (DONE)

**Demandes utilisateur consécutives** :
1. Convertir manuellement les boissons existantes de casier/pack vers bouteille.
2. Ajouter un bouton « Convertir par lot » filtré par catégorie.

**Backend** (`/app/backend/routers/stock.py`) :
- `POST /api/stock/products/{id}/convert-unit` — conversion individuelle `{multiplier, new_unit}`.
- `POST /api/stock/products/convert-unit-bulk` — conversion en masse `{category_id?, from_unit, multiplier, new_unit}` (toutes les occurrences matchantes).
- Valeur comptable préservée. Trace `stock_movements` de type `conversion` pour audit.
- Ajout de `import re` manquant (bug 500 corrigé).

**Frontend** (`/app/frontend/src/pages/StockPage.jsx`) :
- **Bouton icône Package violet** dans chaque ligne produit (si unit ∈ {casier, pack, carton, bac, caisse, sac, bidon, pot, plateau, paquet, lot} + admin) → modal individuelle avec aperçu en direct.
- **Bouton « Convertir par lot »** violet dans la barre d'actions en haut (admin uniquement).
- Modal bulk avec :
  - Select catégorie (ou « toutes »)
  - Select unité de départ (`casier`, `pack`, `carton`, `bac`, `caisse`, `sac`, `bidon`, `pot`, `plateau`, `paquet`, `lot`)
  - Défauts intelligents auto-remplis selon l'unité choisie (casier=24, pack=6, carton=12, sac=25kg, bidon=20L, …)
  - Champ multiplicateur + nouvelle unité
  - **Liste preview** violette montrant jusqu'à 6 produits affectés avec nouvelle qté calculée en live
- Rafraîchissement auto après conversion.

**Tests end-to-end validés** :
- Individuel : `Soda tonic` 6 casier × 6 000 F → 144 bouteille × 250 F = 36 000 F ✅
- Bulk : catégorie *Boissons non alcoolisées* + casier → bouteille × 24 → 3 produits convertis (Soda cola, Soda orange, Soda citron), valeurs préservées (0 / 90 000 / 66 000 F) ✅

---
## 24/04/2026 — Stock : conversion manuelle d'unité (casier → bouteille) (DONE)

**Demande utilisateur** : convertir manuellement les boissons existantes du stock qui sont en *casier/pack/carton* pour passer en *bouteille* (nombre de bouteilles × nombre de casiers).

**Backend** (`/app/backend/routers/stock.py`) :
- Nouvel endpoint `POST /api/stock/products/{id}/convert-unit` avec body `{multiplier: int, new_unit: str}`.
- Applique la conversion :
  - `quantity × multiplier`, `purchase_price / multiplier`, `stock_min × multiplier`, `stock_max × multiplier`
  - Change `unit` vers la nouvelle unité
  - Recalcule `valeur_stock` et `statut`
  - Trace une `stock_movements` de type `conversion` pour audit
  - Ajoute une note d'observation sur le produit
- **Valeur comptable préservée** (qty × price reste identique).

**Frontend** (`/app/frontend/src/pages/StockPage.jsx`) :
- Nouveau bouton **icône Package violet** dans chaque ligne produit (visible seulement si unit ∈ {casier, pack, carton, bac, caisse, sac, bidon, pot, plateau, paquet, lot} et pour admin).
- **Modal de conversion** (testid `convert-unit-modal`) avec :
  - Résumé avant (qty actuelle × prix actuel = valeur).
  - 2 champs : *Nombre par <unit>* (auto-rempli intelligemment : casier=24, pack=6, carton=12, sac=25kg, bidon=20L) et *Nouvelle unité* (bouteille par défaut).
  - **Aperçu violet** qui calcule en live la future qty/prix/valeur.
  - Bouton *Convertir* violet (testid `convert-submit-btn`).

**Test end-to-end** validé :
- `Soda tonic` : 6 casier × 6 000 F = 36 000 F → 144 bouteille × 250 F = 36 000 F ✅

---
## 24/04/2026 — Sync Caisse→Stock : expansion automatique des conditionnements (DONE)

**Demande utilisateur** : dans stock, renseigner les quantités des boissons en nombre de bouteilles contenues dans les casiers/packs (pas en nombre de casiers).

**Changement** (`backend/routers/expenses.py`) :
- Nouvelle fonction utilitaire `_expand_conditioning(description, quantity, unit_price, unit)`.
- Regex `_COND_RE` reconnaît les suffixes `(Casier|Pack|Carton|Bac|Caisse|Sac|Bidon|Pot|Plateau|Paquet|Lot) de N <unité>` dans la description.
- Si détecté :
  - `quantity × N` (2 casiers × 24 bouteilles = 48 bouteilles)
  - `unit_price / N` (7 200 F/casier / 24 = 300 F/bouteille)
  - `unit` forcée sur l'unité intérieure singulière (ex. « bouteilles » → « bouteille »)
  - Description nettoyée du suffixe
- **Cohérence comptable préservée** : valeur totale inchangée (qté × PU reste identique).
- Appliqué aux 2 branches de la sync Caisse→Stock : produit existant (entrée + MAJ qty) et produit auto-créé.

**Test end-to-end** validé via curl :
- Input : « Coca-Cola (Casier de 24 bouteilles) » × 2 casiers @ 7 200 F (total 14 400 F).
- Stock : nom = « Coca-Cola », qty = 48, unit = « bouteille », PU = 300 F, valeur = 14 400 F ✅.

---
## 24/04/2026 — Achats : conditionnement personnalisé + persistance par produit (DONE)

**Demande utilisateur** : permettre d'ajouter un package personnalisé pour les produits du bar, et une fois renseigné, le re-proposer automatiquement pour les mêmes produits à venir.

**Backend** (`routers/product_packages.py` — nouveau) :
- Collection `product_packages` avec `{id, product_key, description_sample, category, tag, qty, suffix, usage_count, created_at, last_used}`.
- `GET /api/product-packages?q=<libellé>&category=bar` : retourne les packages matchant le premier mot normalisé (accents retirés, lowercase). Priorise exact match puis prefix par `usage_count` desc.
- `POST /api/product-packages` : crée un nouveau package OU incrémente `usage_count` + met à jour `last_used` si même clé/tag/qty existe.
- `DELETE /api/product-packages/{id}` : supprime un package enregistré.
- Enregistré dans `server.py` avec `set_db`.

**Frontend** (`ConditioningSuggester.jsx` — nouveau composant réutilisable) :
- Remplace les 2 blocs inline dans les modals d'achat.
- Fetch debounced (400ms) des packages persistés dès que description >= 3 caractères.
- Affichage composite :
  1. **Packages enregistrés** (violets) avec badge `×N` (usage_count) et icône poubelle au hover pour les supprimer.
  2. **Presets statiques** selon mot-clé détecté (ambre pour bière/soda, sky pour eau) OU systématique si catégorie=bar (orange).
  3. **Bouton « + Autre »** qui ouvre un formulaire inline : Select tag (Casier/Pack/Carton/Bac/Caisse/Sac/Bidon) + input qty + input unité libre (bouteilles, litres…) + bouton *Enregistrer*.
- **Workflow apprentissage** : chaque clic sur un preset (persisté OU statique OU custom) fait un POST qui incrémente `usage_count`. Le tri par usage_count met en tête les conditionnements les plus utilisés pour ce produit.
- Test backend end-to-end validé via curl : POST + GET sur variantes orthographiques (« Youki » match « youki cocktail » stocké).

**Testing** : lint JS/Python propre, app charge correctement, endpoints testés OK.

**Changement** (`CaissePage.jsx`) :
- Nouveau helper `detectConditioningPresets(description)` qui détecte via regex :
  - **Bières/Sodas** : `biere, bière, beaufort, castel, heineken, flag, 33, eku, guinness, awooyo, coca, fanta, sprite, schweppes, youki, malta, mirinda, 7up, pepsi, ginger, bissap, jus, bmalt, malt` → presets **Casier × 12** / **Casier × 24** (fond ambre).
  - **Eau minérale** : `eau, eau minérale, possotome, okuta, oasis, awa, volvic, evian, aveyron, source` → presets **Pack × 6** / **Pack × 12** / **Pack × 24** (fond sky).
- Skip si la description contient déjà une mention « Casier de N » ou « Pack de N ».
- Affichage **dans les 2 modals** d'achats :
  - Modal « Achats communs » (multi-items) → testid `common-conditioning-suggest` + boutons `common-cond-{casier|pack}-{qty}`.
  - Modal « Achats Fournisseurs » (shopping list) → testid `list-conditioning-suggest` + boutons `list-cond-{casier|pack}-{qty}`.
- 1 clic sur un preset → suffixe ajouté à la description (ex: « Bière Beaufort **(Casier de 24 bouteilles)** ») + quantité initialisée à 1 si vide.
- UX non-intrusive : suggesteur caché si pas de match, affiché en petite bande colorée sous le formulaire d'ajout.

**Tests** : lint JS propre, app charge correctement.

---
## 24/04/2026 — Backfill sync Caisse→Stock + garde idempotente (DONE)

**Demandes utilisateur** :
1. Faire passer les achats du jour au stock.
2. (Précédent) Auto-créer les produits manquants dans le stock.

**Livraisons** :

**1. Script de backfill one-shot** (`/app/scripts/backfill_today_expenses_to_stock.py`) :
- Trouve les expenses `completed` du jour.
- Pour chaque item, match fuzzy (exact/prefix/substring) avec `stock_products`.
- Si match → `entree` + incrément qty/valeur.
- Sinon → auto-création produit (code `AUTO-XXXXXX`, catégorie « Non classé » créée si absente) + `entree` lié.
- Enregistre un `stock_purchases` synthétique avec `source=caisse` + `expense_id`.
- **Idempotent** : skip si un `stock_purchases` existe déjà pour cet expense_id.

**2. Exécution** sur la base actuelle :
- 1 expense complété « Liste - Location du 04/04/2026 » (57 500 F, 4 items) traité.
- 2 produits existants mis à jour : *Serviettes de table* +25, *Nappes jetables* +25.
- 2 produits auto-créés : *Chaise* (100 u @ 150 F) et *Transport* (1 u @ 5 000 F).

**3. Garde idempotente dans le backend** (`expenses.py`, PUT `/expenses/{id}`) :
- Avant exécution du bloc de sync, vérifie s'il existe déjà un `stock_purchases` avec `source=caisse` et `expense_id=X`.
- Si oui → log `already synced, skipping` sans rien écrire. Évite les doublons lors des hot-reloads ou retry HTTP.
- Validé par test cycle `approved → completed → approved → completed` : les compteurs restent à 4/1/2.

---
## 24/04/2026 — Caisse → Stock : auto-création des produits manquants à la complétion (DONE)

**Demande utilisateur** : faire entrer automatiquement les achats validés dans le stock (quantité + valeur) à partir du 24/04/2026. Si le produit n'existe pas, le créer aussitôt avec sa fiche de stock correspondante.

**Changement** (`backend/routers/expenses.py`, bloc `PUT /expenses/{id}` avec `status="completed"`) :
- Avant : quand un item d'achat ne matchait aucun produit stock, un mouvement **non lié** (`product_id=""`) était enregistré → aucune fiche créée, produit « invisible » dans le catalogue.
- Après : auto-création complète :
  1. Garantit l'existence de la catégorie stock **« Non classé »** (slate `#64748b`, icône Package), créée à la volée si absente.
  2. Crée un `stock_products` avec : code généré `AUTO-XXXXXX`, nom = description de l'item, catégorie « Non classé », unité = `unit` de l'item (ou `unite`), quantité initiale = qté achetée, `purchase_price` = prix unitaire, `valeur_stock` calculé, `stock_min=5`, `stock_max=max(100, qty×4)`, `date_achat=today`, observation « Auto-créé depuis Achat Caisse », et traçabilité via `auto_created_from_expense=expense_id`.
  3. Enregistre un mouvement `entree` **lié** au nouveau produit (avec product_id réel).
  4. Ajoute la ligne à `stock_purchases` pour les rapports.
- **Date pivot naturelle** : le code ne se déclenche qu'à la transition `status → completed and not was_completed_before`. Les complétions antérieures ne sont pas rejouées → comportement = « à partir d'aujourd'hui » demandé.

**Tests** : lint Python propre. Test end-to-end curl validé :
- Création expense « Cacahuetes grillees test » (qty=3, pu=500) → approved → completed
- Fiche stock auto-créée : code `AUTO-77515F`, qty=3, prix=500, valeur=1500, cat='Non classé', trace `auto_created_from_expense=...`
- Catégorie « Non classé » bien créée automatiquement

---
## 24/04/2026 — Impression achats : police agrandie + bouton « Détail par achat » (DONE)

**Demandes utilisateur** :
1. Augmenter la taille de la police sur l'impression des achats.
2. Imprimer les achats validés un par un avec leur détail complet.

**Changements** :

**1. Police agrandie** (`CaissePage.jsx`) sur les 2 fonctions A4 `printAllApprovedExpenses` et `printAllCompletedExpenses` :
- Body : 10pt → **12pt**
- Titre document : 14pt → **18pt** avec letter-spacing
- Date : 10pt → **12pt**
- En-têtes de colonnes : 8pt → **10pt**
- Cellules : 9pt → **11-12pt**
- Ligne total : non renseigné → **14pt bold**
- Badges catégorie : 11px → **11pt** avec font-weight 600 + padding augmenté
- Labels signatures : 8pt → **11pt**
- Sous-lignes items groupés : 9pt → **10-11pt** avec montant en gras 600

**2. Nouveau bouton « Détail par achat »** (testid=`print-approved-detailed-btn`, bouton indigo dans la carte APPROUVÉS) :
- Fonction `printApprovedExpensesDetailed` : génère **une page A4 complète par achat validé** avec saut de page automatique (`page-break-after: always` sauf pour le dernier).
- Chaque page contient :
  - En-tête Espace Maxo (logo + coordonnées)
  - Titre « Bon d'Achat Approuvé » + badge ✓ APPROUVÉ émeraude
  - Indicateur « Achat N / M »
  - **Grille meta 3×2** : Catégorie, Date prévue, Demandé par, Approuvé par, Fournisseur, Type (unique ou liste)
  - Bloc description (fond lavande, bordure gauche indigo, 14pt)
  - **Tableau d'articles** détaillé si liste groupée (#, catégorie, description, Qté, PU, Total) — ou tableau simple pour un item unique
  - **Cadre MONTANT TOTAL APPROUVÉ** (fond ambre, bordure 3px, police 30pt)
  - 3 cadres signature (Gérante, Administrateur, Comptable)
  - Footer avec date+heure d'impression
- Toast de confirmation : « Préparation de N bon(s) d'achat détaillé(s)... »

**Tests** : lint propre sur les 2 fichiers, smoke-test OK. Pas de testing agent (fix purement d'affichage HTML généré, aucun impact API/state).

---
## 24/04/2026 — Stock : refonte de la présentation du menu Produits (DONE)

**Demande utilisateur** : améliorer la présentation du menu Produits (module Stock).

**Changements** (`StockPage.jsx`) :
- **4 KPI cards en tête** (testid=`products-kpi-cards`) avec dégradés colorés :
  - *Total produits* (icône Package, neutre)
  - *Renseignés* (émeraude) : nombre + pourcentage (quantité > 0 OU prix > 0)
  - *Valeur totale* (cyan) : somme quantity × purchase_price en F CFA
  - *Alertes* (rouge si rupture, ambre sinon) : breakdown rupture + stock faible
- **Table refondue** : 12 colonnes denses → **7 colonnes hiérarchisées** :
  - *Produit* : nom en blanc + code monospace en petit + badge « Non renseigné » si vide
  - *Catégorie* : badge indigo avec sous-catégorie en dessous
  - *Stock* : quantité + unité + min à droite + **mini-barre de progression** colorée (vert/orange/rouge selon statut vs stock_min)
  - *Prix achat* / *Valeur* : alignés droite, placeholder « — » si vide
  - *Statut* / *Lieu* / *Actions* : inchangés mais resserrés
- **Lignes zébrées** (slate-900/40 vs slate-900/10) + hover slate-800/50.
- **Produits non renseignés** (quantity=0 ET price=0) : opacité 60% + badge slate « Non renseigné ».
- **Header sticky** (`sticky top-0 z-10`) pour garder les colonnes visibles lors du scroll.
- En-tête visuel : titre avec icône Package émeraude + sous-titre descriptif.

**Tests** : lint propre, smoke-test visuel admin (447 produits affichés, toutes les KPI cards correctes, barres de progression fonctionnelles, tri `sortedProducts` conservé).

---
## 24/04/2026 — Stock : tri des produits renseignés en premier (DONE)

**Demande utilisateur** : dans la gestion de stock, mettre en premier les produits renseignés (quantité > 0 OU prix > 0 OU les deux), les produits "vides" en fin de liste.

**Changement** (`StockPage.jsx`) :
- Ajout de `useMemo` à l'import React.
- Nouveau `sortedProducts` memoïsé : calcule un score `(quantity > 0 ? 1 : 0) + (purchase_price > 0 ? 1 : 0)` et trie décroissant (les produits "0+0" finissent en bas). `Array.prototype.sort` étant stable (ES2019+), l'ordre d'origine est préservé au sein de chaque groupe.
- Table produits : `products.map` → `sortedProducts.map`, checkbox "select all" aussi basculé sur `sortedProducts`.

**Tests** : lint propre. Aucune régression logique possible (pur reorder côté affichage — les actions CRUD et filtres restent inchangés).

---
## 24/04/2026 — Sous-menu « Achats terminés » + Impression ticket 80mm + Fix détail articles A4 (DONE)

**Demandes utilisateur** :
1. L'impression des achats validés ne montrait que le résumé global, sans le détail des articles des listes groupées.
2. Créer un **sous-menu dédié « Achats terminés »** avec option d'impression en **format ticket**.

**Changements** :

**1. Fix du détail des articles à l'impression** (`CaissePage.jsx`) :
- `printAllApprovedExpenses` (bouton *Imprimer A4* sur carte APPROUVÉS) : chaque demande `is_group=true` génère désormais des sous-lignes `#.1`, `#.2`, … (fond gris clair) avec catégorie colorée, description, Qté × PU et montant. Badge 📦 + compteur sur la ligne mère. Items simples affichent aussi Qté × PU.
- `printAllExpensesList` (A4 paysage — liste complète) : idem, sous-lignes détaillées.
- `printExpensePDF` (bon A5 individuel) : nouveau tableau **« Détail des articles (N) »** (# / catégorie / description / Qté / PU / Total) inséré avant le montant approuvé, pour les demandes `is_group=true`.

**2. Nouveau sous-onglet « Achats terminés »** (`AchatsTab.jsx` + `CaissePage.jsx`) :
- 5ᵉ sous-onglet `achats-subtab-termines` (icône FileText, couleur slate) après *Achats validés* et avant *Rejetés*, avec badge compteur des `completed`.
- Le sous-onglet `achats-subtab-valides` ne comptabilise désormais QUE les `approved` (plus les `completed`).
- Nouvelle carte dédiée `completed-expenses-card` avec :
  - Total agrégé affiché
  - Bouton `print-completed-ticket-btn` → **Ticket 80 mm thermique** (fonction `printCompletedExpensesTicket` : titre « ACHATS TERMINES », sous-titre, date, articles détaillés pour `is_group`, total général, footer Espace Maxo)
  - Bouton `print-completed-a4-btn` → **A4 signature-ready** (fonction `printAllCompletedExpenses` : en-tête logo, tableau avec colonne « Terminé le », total et 3 cadres signature Gérante/Admin/Comptable)
  - Bouton **PDF** individuel par achat (via `printExpensePDF` qui bénéficie du fix détail articles)
- Chaque expense affichée avec `completed-expense-<id>` ; sous-items visibles pour les listes groupées.
- Empty state « Aucun achat terminé » si aucun `completed`.

**Tests** : iteration_55 → **100% frontend** (Admin + Gérante). Tous les scénarios validés (empty state, completed avec sous-items, ticket 80mm via `window.open` + toast, A4 via `window.open`, décompte badges, non-régression autres sous-onglets). Lint propre sur les 2 fichiers modifiés.

---
## 22/04/2026 — Compte courant : 3 modes de remboursement avancés (DONE)

**Demande utilisateur** : prévoir des options de remboursement flexibles pour les avances en compte courant :
1. % des recettes journalières
2. Montant fixe par période (jour / semaine / mois / année)
3. Remboursement manuel (conservé)
Les 3 modes doivent pouvoir coexister sur un même compte.

**Backend** (`routers/current_accounts.py`) :
- Nouveaux champs sur `AccountCreate`/`AccountUpdate` : `repayment_percentage`, `repayment_fixed_amount`, `repayment_fixed_period` (`daily|weekly|monthly|yearly`), `repayment_fixed_start_date`.
- `NULLABLE_FIELDS` : permet de *clearer* un champ via PUT avec `null` (pour désactiver un mode).
- `_run_auto_deduction_for_account` enrichi :
  - **Mode % recettes** : lit revenue du jour, crée une repayment `method="auto_deduction"` avec `reference=AUTO-PCT-{date}`. Idempotent par jour.
  - **Mode fixe** : déclenche uniquement en fin de période (daily=tous les jours ; weekly=dimanche weekday=6 ; monthly=dernier jour du mois ; yearly=31 déc). Références uniques (`AUTO-FIX-YYYY-MM-DD`, `AUTO-FIX-YYYY-Wnn`, `AUTO-FIX-YYYY-MM`, `AUTO-FIX-YYYY`). Respecte `repayment_fixed_start_date`.
  - **Cap de remboursement** : les déductions ne dépassent jamais `total_advance - already_repaid`.
- Filtre auto-déduction élargi : `auto_deduct_enabled OR repayment_percentage>0 OR repayment_fixed_amount>0`.
- Validation période invalide : nullifié en création, erreur 400 en update.

**Frontend** (`CurrentAccountsTab.jsx`) :
- Modal création/édition : 3 blocs de configuration colorés :
  - 🔵 cyan — Échéancier (toggle `auto-deduct-toggle`).
  - 🟣 violet — Pourcentage (toggle `pct-mode-toggle` + input `pct-value-input`, pré-rempli à **5%**).
  - 🟠 ambre — Montant fixe (toggle `fixed-mode-toggle` + input `fixed-amount-input` (pré-rempli **10 000 F**) + select période `fixed-period-select` (défaut `weekly`) + date `fixed-start-input`).
- Cartes comptes : 3 badges possibles (`auto-deduct-badge-{id}`, `pct-badge-{id}`, `fixed-badge-{id}`) pouvant apparaître ensemble.
- Modal d'édition recharge correctement les valeurs sauvegardées.

**Tests** : iteration_54 → **21/21 backend PASSED** + frontend 100%. Tous les scénarios validés (idempotence, fin de période, start_date, cap, combinaison des 3 modes, manual coexistence).

---
## 22/04/2026 — Sous-menus Achats remaniés + badges fixés + anti-slow-click (DONE)

**Demandes utilisateur** :
1. Renommer « En cours » → « Validation en cours »
2. Ajouter sous-menu « À réviser » (status=revision_requested)
3. Ajouter sous-menu « Rejetés » (status=rejected)
4. Badges de notification disparus → restaurer
5. App ralentie lors du clic sur « Envoyer la demande d'achat »

**Changements** :
- **AchatsTab.jsx** : 4 sous-tabs désormais (Validation en cours / À réviser / Achats validés / Rejetés), chacun avec son compteur + couleur distincte (violet/ambre/vert/rose). Les sections `revision_requested` (manager « À RÉVISER » + admin « MODIFIÉS EN COURS DE RÉVISION ») déplacées sous `a_reviser`. Nouvelle carte `rejected-expenses-card` pour l'onglet Rejetés listant les demandes avec description, notes admin et bouton delete (admin only).
- **useNotifications.js** : auto-clamp du `acknowledgedCounts` — si le compteur brut décroît (items traités/supprimés), l'ack est automatiquement clampé. Ainsi, quand une nouvelle demande arrive, le badge réapparaît correctement au premier delta positif.
- **CaissePage.jsx** : `createExpense` enveloppé dans un state `expenseSubmitLoading` — le bouton « Soumettre » passe à disabled + label « Envoi en cours... » pendant l'API call, évitant le double-clic et donnant un feedback visuel clair au ralentissement.

**Tests** : iteration_53 → 100% frontend, 0 bug fonctionnel. Warnings hydration mineurs pré-existants (shadcn Select) non liés.

---
## 22/04/2026 — Compte courant : trésorerie utilisable pour les achats (DONE)

**Objectif** : permettre à l'admin de lier une dépense (achat/paiement) à un compte courant (avance promoteur) comme source de financement, même rétroactivement sur des achats déjà réalisés.

**Backend** :
- `expenses.py` : nouveaux champs `funded_by_account_id`, `funded_by_account_name`, `funded_affects_ca` (bool, défaut True) sur ExpenseCreate/Update.
- Helpers `_allocate_expense_to_account` et `_unallocate_expense_from_accounts` : créent/suppriment une repayment de méthode `expense_allocation` avec référence `EXP-{expense_id}` (idempotent, de-dup cross-comptes).
- Hooks automatiques : création/update/delete d'une dépense met à jour le compte lié en conséquence.
- Nouveaux endpoints dédiés :
  - `POST /api/expenses/{id}/allocate-account {account_id, account_name, affects_ca}` — rétroactif, fonctionne sur n'importe quel statut (y compris `completed`).
  - `DELETE /api/expenses/{id}/allocate-account` — retire le lien.
- `current_accounts.py` : `_enrich_account` retourne désormais `allocated_to_expenses` + `balance_available` (max 0, total_advance − total_repaid).

**Frontend** :
- **Modal création d'achat** : nouvelle section « Payé depuis » (testid=`expense-funded-by-select`) avec dropdown « 💰 Recettes de la caisse » (défaut) + liste des comptes courants avec leur `balance_available` inline, et checkbox « Affecte quand même le CA » (testid=`expense-funded-affects-ca`).
- **AchatsTab (admin)** : sur chaque dépense approved/completed, ligne « 💰 Payé depuis : » avec select (testid=`funding-source-<id>`) permettant l'imputation/désimputation en temps réel. Badge « imputé » quand rattaché.
- **Compte courant** : chaque carte affiche désormais trois lignes : Solde restant (dette), « ↳ X F utilisés pour achats » (testid=`allocated-<id>`), « Disponible : X F » (testid=`available-<id>`, vert).

**Tests** : iteration_52 → 15/15 backend + frontend 100% fonctionnel (un warning hydration mineur pré-existant sur un Select shadcn, non lié à cette feature).

---
## 22/04/2026 — Refactoring étape C : extraction onglet Commande/FACTURES (DONE)

**Contexte** : les onglets Bons/Stats/Notes étaient en réalité **déjà extraits** (BonsTab, StatsTab, InstructionsTab). J'ai donc continué avec le plus gros bloc inline restant : l'onglet **Commande/FACTURES** (907 lignes).

**Résultat** :
- `CaissePage.jsx` : 7748 → **6874 lignes** (-874 lignes cette étape)
- Nouveau `CommandeTab.jsx` (980 lignes) — reçoit un prop `ctx` avec 40+ state/handlers (cancellation/modification requests, table+bill state, catalog, custom items, save/clear/updateQty handlers, DEPARTMENT_CONFIG, PAYMENT_METHODS, ...).

**Bugs corrigés par le testing agent** :
1. Imports manquants : format, AlertTriangle, Receipt, Calculator, Send, Eye, Textarea
2. Props ctx manquants : invoices, total, subtotal, discountAmount, totalByDepartment, DEPARTMENT_CONFIG, PAYMENT_METHODS, closeTable
3. Mauvais nom : DEPARTMENTS → DEPARTMENT_CONFIG

**Total refactoring A+B+C** : **CaissePage.jsx 9050 → 6874 lignes (-24%, -2176 lignes)** répartis sur 5 nouveaux fichiers (`AchatsTab`, `CommandeTab`, `NotificationCenter`, `useNotifications`, `utils/notifications`).

**Objectif <3500 lignes non encore atteint** — les plus gros blocs restants sont des modals :
- Server Report Detail Modal (408 lignes)
- Expense Modal (294 lignes)
- Shopping List Modal (237 lignes)
- Invoice Edit Modal (173 lignes)
- Admin Revise Modal (115 lignes)
- Onglets points_serveurs (202), invoices (180), mon_point (165)

**Tests** : iteration_51 → 100% frontend, ZÉRO régression.

---
## 22/04/2026 — Refactoring étape B : extraction onglet Achats (DONE)

**Objectif** : Extraire les 907 lignes de JSX de l'onglet Achats dans un composant dédié `AchatsTab.jsx`.

**Résultat** :
- `CaissePage.jsx` : 8629 → **7748 lignes** (-880 lignes)
- Nouveau fichier : `AchatsTab.jsx` (959 lignes)
- Signature : `AchatsTab = ({ ctx })` — reçoit un prop `ctx` contenant tous les state/handlers requis.
- Destructure 21 identifiants : currentUser, expenses, shoppingList, achatsSubView(+setter), showAllExpenses(+setter), expenseRatioAlert, formatPrice, expenseAnalyses, setShowExpenseModal, setShowShoppingListModal, setExpenseToAssign, setShowWeekAssignModal, printExpensesTicket, printAllExpensesList, printAllApprovedExpenses, printExpensePDF, openExpenseForEdit, deleteExpense, updateExpense, openReviseModal, convertExpenseToPO.
- Imports : Button, Badge, Card*, Input, Label, 12 icônes lucide, ExpenseAnalysisBadges.

**Bugs corrigés par le testing agent** :
1. Signature de composant (passé par déstructuration `{ ctx }`)
2. Imports manquants Label/Input
3. Prop `expenseAnalyses` manquant dans le ctx

**Total refactoring A+B** : CaissePage.jsx 9050 → 7748 lignes (**-1302 lignes, -14%**).

**Tests** : iteration_50 → 100% frontend, ZÉRO régression. Un warning HTML cosmétique (span dans tr/td) non-bloquant.

---
## 22/04/2026 — Refactoring étape A : extraction système de notifications (DONE)

**Objectif** : Réduire la taille de `CaissePage.jsx` (9050 lignes) en extrayant le système de notifications dans des fichiers dédiés, sans régression.

**Fichiers créés** :
- `/app/frontend/src/pages/caisse/utils/notifications.js` (128 lignes)
  - Constantes : `COUNT_LABELS`, `COUNT_TO_TAB`, `COUNT_META`, `COLOR_BG`, `COLOR_BADGE`
  - Helpers purs : `playDing`, `sendBrowserNotification`, `formatRelativeTime`
- `/app/frontend/src/pages/caisse/hooks/useNotifications.js` (232 lignes)
  - Hook custom : state, polling 10s, delta-detection + ding, mark-read, cross-role memos
- `/app/frontend/src/pages/caisse/components/NotificationCenter.jsx` (193 lignes)
  - Composants : `NotifBadge`, `NotificationBell`, `CrossRoleBanner`

**Fichier modifié** :
- `CaissePage.jsx` : 9050 → **8629 lignes** (~420 lignes extraites / -4,7%)

**Bugfix testing agent** : destructuration de `notifPermission` manquante → ajoutée.

**Tests** : iteration_49 → 100% frontend, ZÉRO régression sur les itérations 42-48.

---
## 22/04/2026 — Bannière flottante cross-rôle Admin ↔ Gérante (DONE)

**Feature — Badge flottant grand format sous le header** :
- Bannière **pleine largeur**, sticky sous le header (`top-[60px] z-[80]`), pulsante (`animate-pulse` + pastille `animate-ping`).
- **Admin** : gradient émeraude, texte « Nouvelle(s) information(s) de **la Gérante** ». Périmètre : needs, expenses (pending uniquement, pas revision_requested), tips_today, financial_points, notes.
- **Gérante** : gradient ambre/orange, texte « Nouvelle(s) information(s) de **l'Administrateur** ». Périmètre : expenses (revision_requested), purchase_orders (sent), notes (sender_role=admin).
- **Serveur** : pas de bannière (cross_role=null).
- **Clic sur le lien** : navigue vers l'onglet de la catégorie avec le timestamp le plus récent, et marque cette catégorie comme lue.
- **Bouton X** : acquitte TOUTES les catégories cross-rôle d'un coup — la bannière disparaît jusqu'à nouvelle activité.
- **Affichage** : total pill blanc, libellé principal + breakdown (`4 besoins • 2 notes — il y a 12 min`).

**Backend** : nouveau champ `cross_role: {source_role, source_label, items:{key:{count,latest}}}` dans `/api/notifications/counts`. Pour admin, `expenses.count` est strictement `pending` (exclut les `revision_requested` qui proviennent de l'admin lui-même).

**Tests** : iteration_48 → 100% backend + frontend. Différenciation stricte des 3 rôles vérifiée.

---
## 22/04/2026 — Bugfix click notifications + horodatages relatifs (DONE)

**Bug report utilisateur** : « je n'arrive pas à cliquer sur les notifications » — dans le dropdown du centre de notifications, les clics sur les items ne déclenchaient pas la navigation.

**Root cause & correctifs** :
- Le `<span>` animé `animate-ping` sur le gros badge rouge interceptait des clics sur le bouton Bell → ajout de `pointer-events-none`.
- Collision potentielle de z-index entre le header (z-50), la TabsList, et le dropdown (z-50) → dropdown remonté à `z-[100]`.
- Ajout d'un **backdrop** `fixed inset-0 z-[90]` (testid=`notif-center-backdrop`) qui capte les clics extérieurs et ferme le dropdown proprement.
- Ajout de `onClick={(e) => e.stopPropagation()}` sur le panneau dropdown + `type="button"` explicite sur chaque ligne cliquable.
- `max-w-[calc(100vw-1rem)]` pour éviter le débordement sur mobile.

**Nouvelle feature approuvée** : horodatages relatifs par catégorie.
- Backend : `_latest_date(collection, query)` helper + `latest_by_category` renvoyé dans `/api/notifications/counts` pour chaque rôle.
- Frontend : `formatRelativeTime(iso)` helper (à l'instant / il y a X min / h / j / date) affiché en petit gris sous chaque libellé de catégorie (testid=`notif-item-<key>-ts`).

**Tests** : iteration_47 → 100% backend + frontend. Bug confirmé corrigé en environnement réel.

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
- [x] Validation Achats 2 étapes + audit trail + version originale/corrigée mobile (Feb/2026)
- [x] Comptes Courants : Allocation intelligente + Top-up + Édition échéancier + Marquer payé (Feb/2026)
- [x] Stock : Fix bug 404 double-slash + Bouton 📦 conversion + Détails sorties dashboard (Feb/2026)
- [x] Caisse↔Stock : Auto-link similarité + Auto-compose recettes (1 portion/ingrédient) (Feb/2026)
- [x] Bug : Exclusion stricte achats rejetés/reportés du rapport hebdomadaire (Feb/2026)
- [x] **"Valider sans modifier"** : Bouton vert sur achats pending → approved direct, sans audit trail. Tests 100% (iter70). (Feb/2026)

### P1 (Next)
- [x] Module Inventaire physique (DONE session précédente)
- [ ] Alertes de péremption sur le dashboard Stock (produits proches de la DLC)

### P2
- [ ] Mot de passe oublie via Email (Resend)
- [ ] Refactoring CaissePage.jsx (~8900 lignes) et server.py (~7700 lignes)
