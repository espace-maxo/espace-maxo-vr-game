# Espace Maxo - PRD

## Problem Statement
Application pour le restaurant "Espace Maxo" à Cotonou (Bénin) permettant de réserver des jeux VR, payer par mobile money, commander des combos avec session de jeu, réserver des tables avec acompte, gérer les réservations, et gérer un système de facturation POS interne.


## 04/05/2026 — Locations : Calendrier de disponibilité (DONE)

**Demande utilisateur** : « Dans Location, mettre un sous-menu pour voir les dates de réservation y compris les dates de demande proforma pour vérifier la disponibilité du site. »

**Livré** :
- `LocationsTab` passe en **sous-onglets** : `Liste des réservations` (vue existante) + `Calendrier de disponibilité` (nouveau).
- Nouveau composant `LocationCalendarTab.jsx` : vue calendaire mensuelle combinant `locations` et `proforma_invoices`, avec extraction auto des dates d'événement (regex sur titre/notes/items).
- KPIs : dates réservées, sollicitées, **conflits**, événements totaux.
- Filtres : Tous/Réservations/Proformas + option "proformas liées à une location uniquement".
- Code couleur : violet=réservation, ambre=proforma date événement, rose=conflit.
- Panneau latéral : détails du jour cliqué (client, espace, heures, invités, type, montant, phone).

**Vérifié visuellement ✅** : 31 jours rendus, 3 événements affichés, KPIs corrects. Lint OK.

### ⚠️ Déploiement
Redéployez via **Deploy** pour propager sur `espacemaxo.com`.


## 04/05/2026 — Journal : Lier un achat par 1 clic (DONE)

**Demande utilisateur** : « Dans le journal, donner la possibilité d'aller chercher des achats à lier par un clic. » Choix : `c` (n'importe quel achat) + `a` (crée une op journal, évite le doublon si l'achat est payé ensuite).

**Backend** (`/app/backend/routers/journal.py`) :
- `GET /api/journal/available-expenses?search=&limit=` — liste tous les achats avec flags `already_in_journal`, `already_linked`, `excluded`, `is_completed`, `is_paid`, `status`.
- `POST /api/journal/link-expense {expense_id}` — crée une op `journal_manual` avec `source="expense_link"` + `linked_expense_id`. Idempotent (renvoie `already_linked=true` si déjà lié).
- **Anti-doublon** : le dashboard et realtime excluent désormais via `$nin` les expenses ayant un `linked_expense_id` dans `journal_manual`. Quand l'achat lié passe en `completed/paid` plus tard, aucun double comptage.

**Frontend** (`JournalTab.jsx`) :
- Nouveau bouton toolbar **"Lier un achat"** (emerald, icône Link) à côté de "Début du journal" / "Réinitialiser".
- Ouvre un Dialog avec recherche + liste paginée.
- Chaque ligne affiche : description, date, fournisseur, catégorie, statut, montant.
- Bouton **"Lier"** par ligne → 1 clic → ajout au journal. Badge **"Déjà dans le journal"** pour les lignes déjà comptées.

**Validation end-to-end ✅** : achat pending 3000F (total_out=0) → link → total_out=3000F → idempotence OK → passage en completed → total_out reste 3000F (**pas de doublon**). UI : modal fonctionnelle, 4 lignes listées, 3 boutons "Lier" + 1 "Déjà dans le journal".

### ⚠️ Déploiement
Redéployez via **Deploy** pour propager sur `espacemaxo.com`.


## 04/05/2026 — Journal : Exclure factures & dépenses auto (DONE)

**Demande utilisateur** : « Dans le menu journal, donner la possibilité de supprimer des achats enregistrés automatiquement de même que des recettes. »

**Implémentation (soft-exclude)** : pour préserver l'intégrité comptable, la suppression depuis le journal = exclusion (la facture/dépense reste dans la caisse, juste masquée du journal de trésorerie).

**Backend** (`/app/backend/routers/journal.py`) :
- Nouveau endpoint `POST /api/journal/exclude` `{source: "invoice"|"expense", ref_id, excluded_by, reason?}` — idempotent via upsert.
- `POST /api/journal/include` pour réintégrer.
- `GET /api/journal/exclusions` pour lister les exclusions actives.
- Collection `journal_excluded` — clé (`source`, `ref_id`).
- `journal/dashboard` et `journal/realtime` filtrent automatiquement les IDs exclus (via `$nin`).
- Les lignes de factures/dépenses dans `/realtime` exposent désormais `excludable: true` et `source`.

**Frontend** (`JournalTab.jsx`) :
- Le bouton poubelle apparaît maintenant sur **toutes** les lignes (manuelles + factures + dépenses).
- Pour les ops manuelles : delete définitif (comme avant).
- Pour les factures/dépenses auto : confirmation explicite *« ... reste enregistrée dans la caisse, juste masquée du journal »* → POST `/journal/exclude`.

**Validation curl end-to-end** : dashboard `total_in=5000F, invoices_count=1` → après exclusion `total_in=0F, invoices_count=0` → `include` restaure. Lint FE/BE OK.

### ⚠️ Déploiement
Redéployez via **Deploy** pour propager sur `espacemaxo.com`.


## 02/05/2026 — Boutons suppression Détail Jour par Jour (DONE)

**Demande utilisateur** : « Mets des boutons de suppression pour le détail jour par jour de faire le point. »

Ajout d'icônes poubelle (admin only) sur chaque ligne Ventes/Charges dans le détail journalier de "Faire le point" (`HebdoReport.jsx`). Suppression auto-tracée dans l'audit. Confirmation + refresh auto.


## 02/05/2026 — Lisibilité mobile des onglets Caisse (DONE)

Tous les TabsTrigger de CaissePage passent en `text-[11px] sm:text-sm` avec icône + nom visible sur téléphone. Plus d'onglets "icône-seule" illisibles.


## 02/05/2026 — Audit : Historique des modifications de factures & bons (DONE)

**Demande utilisateur** : « Permettre d'avoir l'historique des modifications de factures et des bons par la gérante et les serveurs uniquement dans le profil administrateur. »

**Backend** (`/app/backend/routers/invoices.py`, `/app/backend/server.py`) :
- Nouvelle fonction `_log_audit(entity_type, doc, action, actor, changes)` qui écrit dans la collection `audit_logs`.
- Audit déclenché automatiquement sur :
  - `POST /api/invoices` → action `create`
  - `PUT /api/invoices/{id}` → action `update` / `validate` / `cancel` (auto-détectée selon `validation_status`) avec **diff champ par champ**
  - `DELETE /api/invoices/{id}` → action `delete`
  - `PUT /api/invoices/{id}/update-items` → action `update` avec diff items (count/qty/amount)
  - `PUT /api/caisse/tables/{id}` → action `update` (entity_type=`table`) avec diff
  - `DELETE /api/caisse/tables/{id}?reason=cancelled` → action `delete`
  - **Exclusion intelligente** : le cleanup automatique post-facturation (`status=invoiced` + `items=[]`) et le delete sans `reason` ne sont PAS loggés.
- Nouvel endpoint **admin-only** : `GET /api/audit/logs?role=admin` avec filtres `entity_type`, `actor_role`, `action`, `start_date`, `end_date`, `search`. Retourne `{total, by_action, by_actor, logs}`. Renvoie 403 si role≠admin.
- Helper `_diff_invoice` calcule un diff compact (résumé pour `items` : count/qty/amount).

**Frontend** (`AuditLogsTab.jsx` nouveau, `CaissePage.jsx`) :
- Nouveau composant `AuditLogsTab` réservé à l'admin, accessible via onglet **"Audit"** (badge rouge).
- KPIs : Total + compteurs par action (Création / Modification / Validation / Annulation / Suppression).
- Filtres : recherche libre, type (facture / bon), auteur (par défaut "Gérante & serveurs", masque admin), action, période.
- Liste : badge action coloré, n° facture, table, **diff inline** (champ : ancien → nouveau), snapshot (total / lignes / client), modal détail.
- Auto-refresh 60s.
- Toutes les mutations (POST/PUT/DELETE invoices, PUT/DELETE caisse/tables) passent désormais `?actor_name=X&actor_role=Y` via le helper `actorQs()`.

**Validation** : testing agent → **iter80 22/24 + iter81 24/24 backend (100%)** — frontend 100%. Toutes les actions tracées correctement, exclusions respectées, accès admin only confirmé.

### ⚠️ Déploiement
Redéployez via **Deploy** pour propager sur `espacemaxo.com`.


## 02/05/2026 — Journal : Boutons "Début du journal" + "Réinitialiser" (DONE)

**Demande utilisateur** : « Mettre un bouton de suppression et de début du journal. »

**Backend** :
- Refactor : `JOURNAL_CUTOFF` hardcodé → fonctions async `_get_cutoff()` / `_set_cutoff()` qui persistent la valeur dans la collection `app_settings` (clé `journal_cutoff`).
- Nouveaux endpoints :
  - `GET /api/journal/settings` → `{cutoff_date, default}`
  - `POST /api/journal/settings` (validation YYYY-MM-DD) → met à jour la date pivot
  - `POST /api/journal/reset` `{confirm:true, set_cutoff_to?:str}` → vide la collection `journal_manual` + optionnellement repositionne le cutoff
- Le dashboard renvoie désormais le champ `cutoff` pour affichage.

**Frontend** (`JournalTab.jsx`) :
- Sous-titre affiche dynamiquement « Début du journal : AAAA-MM-JJ ».
- Bouton **"Début du journal"** (cyan, icône CalendarRange) ouvre un éditeur déployable avec input date + Enregistrer/Annuler.
- Bouton **"Réinitialiser"** (rose, icône Trash2) avec confirm() → supprime les opérations manuelles + vide l'historique chat.

**Validation** : testing agent → **14/14 backend PASSED + 100% frontend PASSED**. Validation YYYY-MM-DD stricte (rejette "abc", "2026-04", "2026-13-45"), persistence OK, reset propre.

### ⚠️ Déploiement
Redéployez via **Deploy** pour propager sur `espacemaxo.com`.


## 02/05/2026 — Journal : Assistant LLM + Suppression + Cutoff 01/05/2026 (DONE)

**Demande utilisateur** : « Oui (option C) et aussi bouton de suppression. Prends le journal à partir du 01/05/2026. »

**Backend** (`/app/backend/routers/journal.py`) :
- Constante `JOURNAL_CUTOFF = "2026-05-01"` appliquée aux requêtes invoices/expenses/manual du dashboard et de realtime → seules les opérations à partir du 01/05/2026 sont comptées.
- Nouveaux endpoints :
  - `POST /api/journal/manual` : création d'une opération réelle (entrée/sortie) avec catégorisation auto.
  - `DELETE /api/journal/manual/{id}` : suppression d'une opération manuelle.
  - `POST /api/journal/chat` : **assistant LLM** (Claude Sonnet 4.5 via EMERGENT_LLM_KEY) qui parse une commande FR ("ENTRÉE/DÉPENSE/PRÉVISION/SITUATION") en JSON puis l'exécute. Crée l'opération dans `journal_manual` ou `forecasts` selon l'intention.
- Collection nouvelle : `journal_manual` (id, type, amount, label, category, created_by, created_at, source: manual|chat).

**Frontend** (`JournalTab.jsx`) :
- Card violette "Assistant financier" en tête de la vue Réel : input texte, historique des 8 derniers messages, bouton Send (icône ✈/loader).
- Bouton **trash** sur chaque opération manuelle (`deletable=true`) avec confirmation.
- Rechargement auto du dashboard après chaque action (chat ou suppression).

**Validation** : testing agent → **22/22 backend PASSED + tous frontend tests PASSED** (100%). Catégorisation auto OK, cutoff OK, LLM OK.

### ⚠️ Déploiement
Redéployez via **Deploy** pour propager sur `espacemaxo.com`.


## 02/05/2026 — Renommage "Prévisions" → "Journal" + vue Réel (DONE)

**Demande utilisateur** : Renommer + ajouter vue Réel auto + KPIs + alertes intelligentes (option B).

**Backend** (`/app/backend/routers/journal.py` — nouveau) :
- `GET /api/journal/dashboard?days=30` : solde actuel (somme factures validées − dépenses terminées/payées), projections 7j/30j (à partir des forecasts `prevu`), alertes intelligentes (`negative_balance`, `high_expense_ratio` >70%, `deficit_7d`, `deficit_30d`), catégorisation auto des sorties (cuisine/charges/salaires/divers).
- `GET /api/journal/realtime?days=N&limit=M` : liste chronologique des opérations (factures + dépenses validées).
- Branché dans `server.py` (import + set_db + include_router).

**Frontend** (`JournalTab.jsx` — nouveau) :
- Onglet "Prévisions" → "Journal" (icône `BookOpen`).
- 4 KPI cards : Solde actuel · Solde 7j · Solde 30j · Sorties cumulées (avec ratio CA).
- Bandeau alertes (codes critical/warning/info).
- Toggle "Journal réel" / "Prévisionnel" (réutilise `ForecastsTab`).
- Vue Réel : répartition par catégorie + liste chronologique des opérations.
- Sélecteur horizon (7/30/60/90j).

**Validation** : testing agent → **25/25 backend PASSED + tous frontend tests PASSED** (100%). Solde correct (43 500 F = 101 000 − 57 500). Alerte `deficit_7d` active correctement.

### ⚠️ Déploiement
Redéployez via **Deploy** pour propager sur `espacemaxo.com`.


## 02/05/2026 — Achats : la Gérante ne voit JAMAIS le détail des terminés (DONE)

**Demande utilisateur** : « La gérante ne peut pas voir aussi le détail des achats et prestations terminés ».

**Fix** (`AchatsTab.jsx`) : ajout d'une garde de rôle sur le rendu de la section "termines" (ligne ~1957). Désormais le bloc complet (Card "Achats & prestations terminés" + sa liste détaillée) n'est plus rendu DU TOUT pour la Gérante, même si `achatsSubView === 'termines'` (cas où elle hériterait de cette valeur d'un précédent état persisté). Combiné avec :
- onglet caché pour la Gérante,
- KPIs filtrés (visibleExpenses),
- liste "Approuvés" excluant les prestations payées,
→ la Gérante n'a aucun accès, ni visuel ni détaillé, aux dépenses terminées/payées.

Lint OK, compile OK.

### ⚠️ Déploiement
Redéployez via **Deploy** pour propager sur `espacemaxo.com`.


## 02/05/2026 — Achats : prestations payées rejoignent "terminés", masquées chez la Gérante (DONE)

**Demande utilisateur** : « Les prestations payées aussi doivent être achevées dans achats et prestations terminés. La gérante ne les verra plus. »

**Fix** (`AchatsTab.jsx`) :
- Helper `isFinished(e)` : `status === 'completed' OU (category === 'paiement' && is_paid === true)`.
- **Onglet "Achats terminés"** renommé **"Achats & prestations terminés"** (admin uniquement) :
  - Compteur + total + liste utilisent `expenses.filter(isFinished)` au lieu du seul `status === 'completed'`.
- **Liste "Approuvés - Prêts à acheter"** : pour la Gérante, on filtre `status === 'approved'` ET on exclut les prestations payées (`!(category === 'paiement' && is_paid === true)`).
- KPI : `visibleExpenses` exclut désormais tout ce qui matche `isFinished` pour la Gérante (et plus seulement `completed`).
- Message vide mis à jour : "Aucun achat ni prestation terminé".

Lint OK, compile OK.

### ⚠️ Déploiement
Redéployez via **Deploy** pour propager sur `espacemaxo.com`.


## 02/05/2026 — Gérante : masquer les achats terminés (DONE)

**Demande utilisateur** : « Fais disparaître les achats terminés du profil de la gérante. »

**Fix** (`AchatsTab.jsx`) :
1. Onglet **"Achats terminés"** maintenant rendu uniquement si `currentUser.role === 'admin'`.
2. KPIs : pour la Gérante, le compteur "Validés" filtre uniquement les `status === 'approved'` (plus de `completed` cumulé). Pour l'admin, le comportement reste inchangé (Validés & terminés).
3. KPI "Total général" calculé à partir d'une liste `visibleExpenses` (filtrée des `completed` pour la Gérante).
4. Le libellé du KPI passe de "Validés & terminés" à "Validés" pour la Gérante.

Lint OK, compile OK.

### ⚠️ Déploiement
Redéployez via **Deploy** pour propager sur `espacemaxo.com`.


## 02/05/2026 — UX : "Aujourd'hui" par défaut au lieu de "Cette semaine" (DONE)

**Demande utilisateur** : « Affichage aujourd'hui par défaut pour faire mon point. »

**Fix** (`HebdoReport.jsx`) : `periodPreset` initialisé à `"today"` au lieu de `"week"`. Ajout d'un `useEffect` de montage qui resynchronise `weekStartDate`/`weekEndDate` sur la date du jour si elles diffèrent (compense les valeurs initiales du parent CaissePage). Lint OK, compile OK.


## 02/05/2026 — Nouveau sous-onglet "Historique" des reversements (DONE)

**Demande utilisateur** : « Prévoir historique des points dans un sous-menu. »

**Frontend** : nouveau composant `PointsHistoryTab.jsx` (~330 lignes) branché dans `CaissePage.jsx` comme 3ème sous-onglet (après "Faire le point" et "Reversement", couleur slate + icône History).

**Contenu** :
- 4 KPIs : Brouillons / En attente DG / Validés / Montant total
- Filtres : recherche texte (signataire, notes, date, momo), statut (tous/brouillon/signé/validé), type de période (tous/daily/weekly), plage Du/Au, bouton Reset
- Liste triée par date desc avec pour chaque point :
  - Badge de statut coloré + type de période + label formaté (ex: "27/04 → 03/05/2026")
  - Créé par / Signé par (+date) / Validé par (+date) / Notes tronquées
  - Montant total en gros
  - Ventilation compacte par mode (espèces/mobile/chèque/crédit) si > 0
  - Actions : Voir PDF, Télécharger PDF
  - Actions admin : Rouvrir (unlock) pour points validés, Supprimer (rouge)

**Validation** : lint OK, compile OK.

### ⚠️ Déploiement
Redéployez via **Deploy** pour propager ce nouveau sous-onglet sur `espacemaxo.com`.


## 02/05/2026 — BUG : Bouton "Valider (Admin)" invisible pour la DG (DONE sur preview)

**Rapport utilisateur** : « La validation du point par la directrice générale ne fonctionne pas. Rien ne s'affiche, le bouton vert "Valider (Admin)" n'apparaît pas. »

**Root cause** : Le bouton "Valider (Admin)" s'affiche UNIQUEMENT dans la branche `isSigned && !isAdminValidated && currentPoint`. Or `currentPoint` est chargé en fonction de la période sélectionnée (par défaut = semaine en cours). Si la Gérante a signé un point sur une semaine passée, l'Admin qui ouvre Reversement ne voit rien — le bouton est absent car `currentPoint` est null pour la période courante.

**Fix** (`PointFinancierTab.jsx`) : ajout d'une **bannière ambre "En attente de validation"** visible SEULEMENT pour l'admin, en tête de toutes les branches (CREATE/EDIT + SIGNED + ADMIN_VALIDATED). Cette bannière :
- Liste tous les reversements avec `signed=true && admin_validated=false` (tri date DESC).
- Indique le nombre de reversements, le total cumulé, le signataire et la date de signature.
- Clic sur une ligne → `goToPoint()` change la période active → le point s'ouvre → la branche SIGNED s'affiche → le bouton "Valider (Admin)" devient visible.
- Se rafraîchit après chaque validation (la ligne disparaît dès que la DG valide).

**Validation** : preview OK. ⚠️ **Redéploiement requis** sur espacemaxo.com.


## 02/05/2026 — Fix #2 : `planned_date` prioritaire pour l'attribution (DONE sur preview)

**Rapport utilisateur après premier fix** : « Les charges demeurent toujours ».

**Diagnostic** : 1 charge résiduelle sur 01/05 (58 500 F). Examen du document :
```
description  : "Achats communs - 12 article(s) - 02/05/2026"
planned_date : 2026-05-02          ← date métier saisie
created_at   : 2026-05-01T23:32    ← UTC (00:32 heure Bénin = 02/05 local)
```
→ La charge était créée le **2 mai à 00h32 heure locale** (Bénin UTC+1) mais stockée comme `2026-05-01T23:32 UTC` à cause du décalage horaire. Le fix #1 utilisait `created_at`, donc elle restait sur le 01/05.

**Fix #2** (`server.py`) : priorité absolue à **`planned_date`** (date métier), fallback sur `created_at`. La query Mongo utilise `$or` pour filtrer correctement :
- `planned_date` dans la période, OU
- pas de `planned_date` ET `created_at` dans la période.

La logique `expense_date` applique le même ordre : `planned_date > created_at`. `assigned_week` garde la priorité absolue si défini.

**Validation preview** : 01/05/2026 → 0 F, 0 charge ✓.

### ⚠️ Action requise : Redéployer à nouveau
Comme le précédent fix, ce changement doit être redéployé via **Deploy** pour toucher `espacemaxo.com`.


## 02/05/2026 — BUG MAJEUR : Charges attribuées au mauvais jour (DONE sur preview)

**Rapport utilisateur** : « Le point du 01/05/2026 a intégré des charges qui ne sont pas liées à cette journée. » Capture d'écran prouvant que 8 charges du 27/04, 30/04, 02/05 apparaissaient dans le point du 01/05 pour un total de 163 850 F (sur espacemaxo.com).

**Root cause** : dans `/api/reports/weekly` (`server.py`), l'attribution des dépenses à un jour utilisait `completed_at` (pour completed) ou `approved_at` (pour approved) — des **timestamps administratifs** (date de validation/paiement), PAS la date réelle de la charge. Exemple réel trouvé :
```
"Liste Menusier - 30/04/2026" :
  created_at  = 2026-04-30  ← vraie date
  approved_at = 2026-04-30
  completed_at= 2026-05-01T18:07:49  ← date du paiement administratif
```
→ Cette charge était rattachée au **01/05** au lieu du **30/04**.

**Fix** (`server.py` `get_weekly_report`) :
1. Query `expenses_by_date` : filtre désormais UNIQUEMENT sur `created_at` dans la période (plus sur completed_at/approved_at).
2. Logique d'attribution `expense_date` : utilise UNIQUEMENT `created_at` (avec fallback sur `assigned_week` si manuellement re-assigné).
3. Les statuts sont limités à `completed | approved | pending | revision_requested`.

**Validation** via curl sur preview backend : endpoints répondent correctement. ATTENTION : la prod `espacemaxo.com` est une instance **distincte** (33 expenses vs 2 sur preview) → l'utilisateur doit **redéployer via le bouton Deploy** pour propager le fix en production.

### Bonus : Bouton "Valider et passer au Reversement"
- Ajouté dans `HebdoReport.jsx` (bouton vert avec icône Check, `data-testid=validate-and-revers-btn`).
- Bascule automatiquement vers le sous-onglet Reversement via `onGoToReversement()` contrôlé par `hebdoSubTab` state dans `CaissePage.jsx`.


## 02/05/2026 — Faire le point : strict période sur les achats (DONE)

**Demande utilisateur** : « Supprime des points tout achat qui n'est pas lié à la période. »

**Root cause identifié** dans `/app/backend/server.py` (`/api/reports/weekly`) :
1. **`expenses_assigned`** (Block 2) ne filtrait pas par statut → dépenses *rejected/cancelled/draft* avec un `assigned_week` obsolète polluaient le total.
2. **`monsieur_orders` / `monsieur_purchases`** ne respectaient PAS `excluded_from_weeks` → impossible de détacher manuellement un achat Mme la D.G. d'une semaine.
3. Dans la ventilation **par jour**, les dépenses *pending / revision_requested* incrémentaient `count` mais pas `total` → affichage trompeur "Charges (3) — 0 F".

**Fixes appliqués** :
1. Filtre `status ∈ {completed, approved, pending, revision_requested}` ajouté à `expenses_assigned`.
2. Ajout de `excluded_from_weeks` au filtre des `mg_orders` et `mg_purchases`.
3. Daily breakdown : `count` et `items` n'incluent plus que les dépenses *completed* / *approved* (cohérent avec le total quotidien).

**Validation** via curl sur les semaines de mars-avril 2026 :
- Achat Mme la D.G. de 75 000 F (créé le 03/04) → apparaît UNIQUEMENT semaine du 30/03 ✓ — invisible des autres semaines.
- Commandes Mme la D.G. → bornées strictement à leur semaine de création ✓.
- Total expenses cohérent avec daily breakdown ✓.


## 02/05/2026 — UX Fix : Signature "Faire le point" en 1 clic (DONE)

**Rapport utilisateur** : « Faire le point ne marche pas correctement » — la signature/clôture ne fonctionnait pas chez l'admin et la Gérante.

**Root cause** (UX) : Le flux exigeait deux clics distincts :
1. Saisir cash + billetage → cliquer **"Mettre à jour"**
2. Puis cliquer **"Signer"** (qui sinon affichait un warning "Veuillez d'abord effectuer le billettage").

Si l'utilisateur cliquait directement "Signer" après avoir saisi le billetage, le bouton vérifiait `billettageTotal === parseFloat(form.cash_amount)` (égalité stricte sur floats) — la condition était fausse et un warning s'affichait, donnant l'impression que la signature ne marchait pas.

**Fix** (`/app/frontend/src/pages/caisse/components/PointFinancierTab.jsx`) :
1. **Auto-save dans `signPoint()`** : avant l'appel `/sign`, si le formulaire est dirty (cash/mobile/cheque/wallet/momo/destination/notes/billettage) on appelle `savePoint(silent=true)` automatiquement et on récupère l'`id` retourné par le backend.
2. **`savePoint(silent)`** retourne désormais le `financial_point` persisté et met à jour `currentPoint`/`form`/`billettage` immédiatement (plus besoin d'attendre le prochain `fetchPoints`).
3. **Auto-ajustement du billetage** dans `handleSignClick()` : si `billettageTotal !== cash_amount`, on aligne `cash_amount = billettageTotal` au lieu de bloquer avec un warning. Toast : "Espèces ajustées au billetage : X F".
4. **Tolérance float 0.5 F** sur la comparaison `cashMatches` (plus d'égalité stricte).
5. **Bouton "Signer" toujours visible** dès que `canEdit && !isSigned && computedTotal > 0` (n'attend plus l'existence d'un `currentPoint`).

**Validation** : testing agent → **100% PASSED**. Toutes les étapes vérifiées :
- Admin : flow 1-clic (saisir + billetage → Signer) ✅
- Gérante : même flow ✅
- Edge cas : cash=0 (mobile money seul) → modale directe ✅
- Edge cas : billetage vide alors que cash>0 → warning bloquant conservé ✅
- Admin-validate après signature ✅


## 02/05/2026 — Caisse : "Point de la Caisse" visible pour la Gérante (DONE)

**Demande utilisateur** : « Point de la caisse à rendre visible chez la gérante. »

**Fix** (`/app/frontend/src/pages/CaissePage.jsx`) :
- Ligne ~4979 : condition `TabsTrigger` passée de `currentUser?.role === 'admin'` à `(currentUser?.role === 'admin' || currentUser?.role === 'manager')`.
- Ligne ~5899 : même changement pour le `TabsContent` (le contenu n'était rendu que si admin).
- `PointCaisseTab` ne contient aucune autre restriction interne → la Gérante a accès à toutes les fonctionnalités (snapshot live, clôture Z, avances Gérante, historique).

**Validation** : lint + compile OK. Changement minimal et ciblé, pas besoin du testing agent.


## 02/05/2026 — Stock Mouvements : Séparation Boissons / Autres produits (DONE)

**Demande utilisateur** : « Donne les mouvements des boissons à part et des autres produits à part. »

**Frontend** (`/app/frontend/src/pages/StockPage.jsx`) :
- Nouveau state `movementCategoryView` ∈ {`all`, `boissons`, `autres`}.
- Fonction de classification `isBeverage(m)` côté client, basée sur :
  - Unités de conditionnement typiques boisson : `bouteille`, `brique`, `canette`, `litre`, `cl`, `l`.
  - Regex de mots-clés sur le nom : coca, fanta, sprite, pepsi, schweppes, jus, eau, bière, vin, whisky, rhum, gin, vodka, champagne, cognac, martini, cocktail, soda, limonade, smoothie, café, thé, lait, yaourt, boisson.
- Barre de 3 boutons de toggle au-dessus des filtres :
  - **Tout (N)** — badge slate
  - **🍹 Boissons (M)** — badge orange
  - **🍽️ Autres produits (N−M)** — badge emerald
- Sélecteur actif coloré selon la catégorie, libellé explicatif ("Classification automatique par unité…").
- Le compteur de la bannière "Historique restaurant · X ligne(s) affichée(s)" s'adapte à la catégorie.
- Le tri DESC + auto-refresh 60s sont conservés.

**Validation** : testing agent → **11/11 tests frontend PASSED** (100 %). Sur les 180 mouvements visibles : 16 boissons + 164 autres = 180 ✓.


## 02/05/2026 — Enhancement : Avances Gérante visibles dans le Compte Courant (DONE)

**Demande utilisateur** : Oui à la suggestion « avances non remboursées apparaissent aussi dans le Compte Courant Gérante comme une ligne 'Dette caisse → Gérante' ».

**Frontend** (`/app/frontend/src/pages/caisse/components/CurrentAccountsTab.jsx`) :
- Nouvelle Card violette **"Dette caisse → Gérante"** placée en tout début de l'onglet "Compte courant", au-dessus du summary existant.
- Affichage **lecture seule** (les actions CRUD restent dans "Point de la Caisse" pour éviter la duplication de source de vérité).
- 4 KPIs : En cours · Remboursées (vue) · Total cumulé · Statut (badge "Dette active" ou "Tout est réglé ✓").
- Filtre : Dettes en cours / Remboursées / Tout l'historique.
- Historique expandable (bouton "Détails") avec table complète : Date · Motif · Montant · Statut · Remboursée le · Par.
- Bouton "Gérer" qui redirige l'utilisateur vers l'onglet Point de la Caisse pour effectuer les actions.

**Validation** : testing agent → **10/10 tests frontend PASSED** (100 %). Backend pas retesté (déjà 15/15 à l'itération 72).


## 02/05/2026 — Caisse : Avances Gérante sur fonds personnels (DONE)

**Demande utilisateur** : « Dans le point de la caisse prévoir la possibilité de faire de la monnaie par la gérante. Par exemple pour rendre la monnaie au client, la gérante peut recourir à ses propres fonds et les soustraire par la suite. Ex, elle doit rendre 2 000 mais le restau n'en a pas donc elle utilise ses 2 000 et après se fait rembourser. »

**Backend** :
- Nouveau router `/app/backend/routers/gerante_advances.py` + collection MongoDB `gerante_advances`.
- Endpoints :
  - `POST /api/gerante-advances` — créer (montant, motif, statut `pending`)
  - `GET /api/gerante-advances?status=pending|reimbursed|all&date=...`
  - `GET /api/gerante-advances/summary` — pending total, reimbursed today, etc.
  - `POST /api/gerante-advances/{id}/reimburse` — marque comme remboursée (409 si déjà faite)
  - `POST /api/gerante-advances/reimburse-all` — tout rembourser d'un coup
  - `DELETE /api/gerante-advances/{id}` — suppression
- `cash_closures.py` : `_compute_live_snapshot()` étendu avec `gerante_pending_total`, `gerante_reimbursed_today_total`, et **`expected_cash_in_drawer` = per_method.cash.amount + gerante_pending_total − gerante_reimbursed_today_total**. `create_cash_closure` utilise cet `expected_cash_in_drawer` pour calculer le `gap_cash`.
- Router branché dans `server.py` (import + set_db + include_router).

**Frontend** (`/app/frontend/src/pages/caisse/components/PointCaisseTab.jsx`) :
- Nouvelle Card violette **"Avances de la Gérante (monnaie sur fonds personnels)"** insérée entre la Synthèse et la Clôture.
- Formulaire inline "+ Nouvelle avance" (montant + motif).
- Liste des avances en attente avec boutons **Rembourser** (individuel) et **Tout rembourser** (en masse).
- Affichage "Espèces attendues dans la caisse" remplace l'ancien "Espèces théoriques" avec explication dynamique : `= X F encaissés + Y F avance(s) Gérante en attente − Z F remboursement(s) du jour`.
- Compteur "N avance(s) déjà remboursée(s) aujourd'hui pour total Y F".
- Le calcul de l'écart prévu à la clôture est automatique et correct.

**Validation** : testing agent → **15/15 backend PASSED + tous les tests frontend PASSED** (100 %).


## 02/05/2026 — Module Vente : Statistiques de ventes par produit (DONE)

**Demande utilisateur** : « Dans le module vente, donne la possibilité d'avoir des statistiques de vente par produit (en quantité et en valeur). »

**Backend** (`/app/backend/routers/invoices.py`) :
- Nouvel endpoint **`GET /api/invoices/stats/by-product`** avec filtres : `start_date`, `end_date`, `department`, `validated_only` (défaut `true`).
- Agrège les items de toutes les factures et retourne par produit : `quantity_sold`, `revenue`, `invoice_count`, `avg_price`, `min_price`, `max_price`, `revenue_share_pct`, `first_sold_at`, `last_sold_at`, `unit`, `department`.
- Retourne aussi les totaux globaux + une répartition `by_department` (CA, quantité, nb produits).
- Route placée AVANT `GET /invoices/{invoice_id}` pour éviter tout conflit dynamique.

**Frontend** :
- Nouveau composant `/app/frontend/src/pages/caisse/components/ProductSalesTab.jsx` (~340 lignes) :
  - 5 presets rapides (7j · 30j · Mois en cours · Mois précédent · 90j) + sélection date custom.
  - Filtres : département (tous + 6 départements), statut factures (validées uniquement / toutes).
  - Recherche texte en direct sur le nom/département.
  - Tri cliquable par Nom · Quantité · CA · Factures · Prix moyen.
  - **4 KPI cards** : CA total · Quantité totale · Produits distincts · Panier moyen par unité.
  - **Répartition visuelle par département** (6 cards colorées).
  - Tableau avec **barre de progression de la part CA** par produit (%).
  - Export CSV des résultats filtrés.
- Intégré dans `StatsTab.jsx` via un **toggle de sous-vue** en haut ("Vue mensuelle & rapport" / "Ventes par produit") — aucun changement de navigation requis.

**Validation** :
- Backend testé via curl : 19 factures scannées → 17 produits distincts, CA cumulé 101 000 F sur mars-avril 2026. Top produit "Choukouya Mouton" = 4 unités / 20 000 F.
- Frontend compile sans erreur (lint OK).
- Default preset changé à "30 derniers jours" pour voir des données dès l'ouverture.


## 02/05/2026 — BUGFIX : Mouvements de stock non actualisés / vieux mouvements en premier (DONE)

**Rapport utilisateur** : « Les mouvements de stock ne sont pas actualisés. Les vieux mouvements apparaissent en premier. »

**Root cause** : L'onglet "Mouvements" ne faisait PAS de fetch lors de son activation. `fetchMovements` n'était appelée qu'au montage initial du composant (`fetchAll`) ou manuellement via le bouton "Actualiser". Résultat : après création de factures via la Caisse (qui génère des mouvements en backend), l'utilisateur revenant sur l'onglet Mouvements voyait les données mises en cache (vieilles) avec les "nouveaux" mouvements backdatés par le resync mélangés au milieu de la liste → impression de "vieux mouvements en premier".

**Fix** (`/app/frontend/src/pages/StockPage.jsx`) :
1. **Auto-sync au passage sur l'onglet** : nouveau `useEffect` qui, lors de `activeSection === "movements"`, déclenche en parallèle `POST /invoices/resync-destockage` + `POST /stock/portionnement/apply-daily` (idempotents), puis rafraîchit `fetchMovements` + `fetchProducts` + `fetchDashboard`.
2. **Tri DESC filet de sécurité côté client** : `visibleMovements` re-trie désormais explicitement par `created_at` desc, même si le backend renvoyait des dates mixtes ou si des mouvements sont backdatés.
3. **Indicateur visuel** : affichage "⏳ Synchronisation en cours…" puis "Dernière synchro : HH:MM:SS — tri du plus récent au plus ancien" sous le titre (`data-testid="movements-last-refresh"`).

**Validation** : compilation OK, lint OK. L'utilisateur verra désormais systématiquement les derniers mouvements en haut dès qu'il entre sur l'onglet.


## 01/05/2026 — BUGFIX : Restauration du corps de `destock_live_dashboard` (DONE)

**Rapport utilisateur** : « Les mouvements ne sont plus ordonnés et je retrouve d'anciens mouvements en tête. »

**Root cause** : Lors de l'ajout de l'endpoint `/api/stock/products/{id}/analysis` (menu Analyse produit), l'outil `mcp_insert_text` a injecté le nouveau code à la ligne 378 mais a écrasé ~85 lignes du corps de la fonction `destock_live_dashboard()` juste au-dessus. Résultat :
- `/api/stock/destock-live` renvoyait silencieusement `None` ou échouait (le front affichait des données figées / partielles).
- Les mouvements récents d'auto-déductions journalières n'étaient plus déclenchés (la fonction `_apply_daily_deductions_internal(silent=True)` ne s'exécutait plus → les déstockages automatiques quotidiens n'étaient plus créés → l'utilisateur voyait uniquement les anciens mouvements manuels en tête).

**Fix** :
- Extraction du corps original de la fonction depuis `git show f37edbd:backend/routers/stock.py`.
- Re-injection du corps complet (88 lignes) entre la signature et l'endpoint `/analysis` via script Python (remplacement contrôlé par markers `async def destock_live_dashboard` et `@router.get("/products/{product_id}/analysis")`).
- Syntaxe vérifiée (`python -m py_compile` OK).

**Validation** :
- `GET /api/stock/destock-live` : renvoie correctement `recent_sales`, `linked_count`, `unlinked_caisse_products`, etc.
- `GET /api/stock/movements?limit=5` : ordre confirmé DESC sur `created_at` — top = `2026-05-01 00:01:17`, plus récent à ancien.
- `GET /api/stock/products/{id}/analysis` : non impacté, fonctionne toujours.
- Distribution des mouvements par date vérifiée en base : cohérente, aucun pattern anormal.



## 01/05/2026 — Stock : Menu Analyse produit (entrées/sorties + détection anomalies) (DONE)

**Demande utilisateur** : « Crée un menu pour permettre d'avoir toutes les quantités sorties et entrées d'un produit selon une période donnée et voir s'il y a gaspillage ou pas, anormal, alerte ou pas. »

**Backend** (`/app/backend/routers/stock.py`) :
- Nouvel endpoint **`GET /api/stock/products/{id}/analysis?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`** :
  - Agrège tous les `stock_movements` du produit sur la période.
  - Calcule : solde d'ouverture (via `previous_quantity` du premier mouvement), solde théorique (ouverture + entrées − sorties), solde réel à la fin (`new_quantity` du dernier mouvement), **écart théorique vs réel**.
  - Breakdown par type : entree / retour_fournisseur / transfert_entree / ajustement_positif / sortie / perte / casse / transfert_sortie / ajustement_negatif / inventaire.
  - Breakdown des sorties : auto (facture), manuelles, transferts, autres.
  - Évolution quotidienne (jours avec mouvements).
  - **5 règles d'anomalies automatiques** :
    1. `ecart_stock` (critical si > 5% des entrées, sinon warning)
    2. `pertes_elevees` (>15% critical, >5% warning)
    3. `sorties_sans_couverture` (critical — incohérence)
    4. `rupture` (critical, stock actuel ≤ 0) / `stock_faible` (warning, ≤ stock_min)
    5. `produit_dormant` (warning — aucun mouvement sur la période)
  - `severity` globale : `ok` | `warning` | `critical`.

**Frontend** :
- Nouveau composant `/app/frontend/src/pages/stock/components/ProductAnalysisView.jsx` (~260 lignes).
  - Sélecteur produit avec recherche en direct + filtre top 50.
  - 4 presets de période : 7 jours · 30 jours · Mois en cours · 90 jours + inputs de dates custom.
  - **Banner sévérité** (vert/ambre/rouge) avec liste des anomalies détaillées.
  - **5 KPI cards** : Entrées · Sorties · Net · Solde actuel · Écart (couleur dynamique selon signe/valeur).
  - Grille 10 types de mouvements avec code couleur.
  - Répartition visuelle des sorties (4 badges).
  - Tableau "Évolution quotidienne" (date + entrées + sorties + net).
- Intégré dans la sidebar via `NAV_GROUPS` → "Rapports & Admin" → **"Analyse produit"** (icône `BarChart3`).

**Test réel sur "Abats de boeuf"** (période 2026) :
- 🔴 3 anomalies détectées : écart +1.00, sorties > disponible, rupture actuelle.
- 1 entrée, 3 sorties (100% auto factures), net -2, solde 0, min 3.

**Tests** Playwright **12/12** : navigation → sous-onglet visible → controls présents → recherche → sélection produit → presets → run → banner + KPIs + détails + daily table tous rendus.



## 01/05/2026 — Stock : Refonte Phase 4 — Diagnostic santé Caisse↔Stock + Pagination (DONE)

### Diagnostic santé (outil de vérification des liaisons)

**Backend** (`/app/backend/server.py`, après `smart-link-to-stock`) :
- **`GET /api/caisse/products/health-check`** : analyse la santé des liaisons Caisse↔Stock et retourne :
  - `summary` : `health_score` (0-100), compteurs de chaque catégorie d'anomalie.
  - `unlinked` : produits Caisse actifs sans liaison ni recette (hors `no_stock_tracking`).
  - `orphans` : produits Caisse avec `stock_links` pointant vers des stock_products inexistants/inactifs.
  - `duplicates` : stock partagé par plusieurs produits Caisse (info, pas forcément un bug).
  - `stock_unused` : produits Stock "cuisine" actifs non liés à aucun produit Caisse.
- **`POST /api/caisse/products/health-repair-orphans`** (`?dry_run=true` possible) : nettoie les `stock_links` cassés + le `stock_product_id` legacy invalide. Retourne la liste des produits réparés.
- Helper `_compute_health_score(total, unlinked, orphans)` : score 0-100, les orphelins pèsent 2×.

**Frontend** (`/app/frontend/src/pages/stock/components/CaisseStockLinksOverview.jsx`) :
- Nouvelle carte "Diagnostic santé" avec bordure colorée dynamique (vert ≥90, ambre ≥70, rouge <70).
- 3 boutons d'action : **Rediagnostiquer** · **Auto-lier (N)** (déclenche `smart-link-to-stock` existant) · **Réparer orphelins (N)** (déclenche `health-repair-orphans`).
- Zone détails dépliable : liste des produits non liés (badges rouges), orphelins (format "X → N liaisons cassées"), stock partagés (format "Stock ← plat1 · plat2").
- Premier diagnostic réel : **76/100** · 41 non liés · 11 doublons · 452 stock inutilisés (ingrédients bruts normalement non liés).

### Pagination Produits (perf)

**Frontend** (`/app/frontend/src/pages/StockPage.jsx`) :
- `PRODUCTS_PER_PAGE = 50`, état `productPage` auto-reset à 1 quand un filtre change.
- `paginatedProducts` via `useMemo` à partir de `sortedProducts`.
- Barre de pagination en bas de la table : affichage `Page 1/10 (1-50 sur 470)` + boutons `« · Précédent · Suivant · »`.
- Impact : rendu initial passe de 470 lignes (avec miniatures photo, badges, barres de progression) à 50 lignes → **chargement ~10× plus fluide**.
- Note : le "select all" et les stats restent basés sur `sortedProducts` (tous les filtrés, pas juste la page courante) — comportement attendu.

**Tests** Playwright **6/6** : pagination visible + navigable sur 470 produits, carte diagnostic + boutons Auto-lier/Réparer/Rediagnostiquer + détails dépliables OK.

**Phase 4 livrée. Refonte module Stock COMPLÈTE (phases 1→4).**



## 01/05/2026 — Stock : Refonte Phase 3 — Photos produits (DONE)

**Modifications** (`/app/frontend/src/pages/StockPage.jsx`) :

**Upload** :
- Ajout du champ `photo_url` dans l'état `productForm` (initial, edit, reset).
- Nouvelle section dans la modale Create/Edit produit : zone drop-photo 80×80 + preview + bouton "Charger une photo" / "Remplacer" + croix pour retirer.
- Pipeline d'upload : FileReader → Canvas resize à 500 px max (conserve ratio) → JPEG qualité 80% → base64 stocké dans `productForm.photo_url`.
- Validation : max 2 Mo avant compression, types JPEG/PNG.

**Affichage** :
- Nouvelle **miniature 40×40** en tête de la colonne "Produit" (placeholder pointillé + icône Image si pas de photo, sinon miniature cliquable).
- **Modale Zoom** : au clic sur la miniature, image pleine taille (max 70vh) dans une `Dialog` noire, avec nom du produit dans le header.
- État `photoZoom = { url, name } | null` pilote la modale.

**Backend** : aucun changement — `photo_url` existait déjà sur `StockProductCreate` et `PUT /stock/products/{id}` accepte `data: dict`.

**Tests** :
- Backend curl : POST `/api/stock/products` avec `photo_url` base64 (118 chars) → stocké ✅ → PUT vide → effacé ✅ → DELETE ✅.
- Frontend Playwright 3/3 : miniatures rendues sur 470 produits (placeholder), modale produit avec bouton upload + input file.

**Limitation connue** : stockage base64 dans MongoDB. Acceptable pour la taille actuelle (500 px max → ~30-80 Ko/photo, 470 produits ≈ 40 Mo max). Si le besoin grandit, migration vers S3/Cloudinary en Phase 4+.



## 01/05/2026 — Stock : Refonte Phase 2 — Filtres enrichis sur Produits (DONE)

**Modifications** (`/app/frontend/src/pages/StockPage.jsx`) :
- **3 nouveaux filtres** côté client dans la section Catalogue → Produits (en complément des 3 existants Recherche/Catégorie/Alerte) :
  - **Zone** : Toutes zones / Restau / Magasin (via `storage_zone`)
  - **Fournisseur** : Tous / liste dynamique (via `supplier_id`)
  - **État** : Tous / Renseignés / Non renseignés (détecte les produits avec `quantity=0 && purchase_price=0`)
- **Bouton "Réinitialiser"** ambré, visible uniquement quand ≥1 filtre actif, avec badge comptant les filtres actifs.
- **Compteur intelligent** : "X produits" devient "X / Y produits (filtrés)" quand un filtre est actif.
- `useMemo` pour `sortedProducts` (applique les 3 filtres clients après le sort), plus `activeFiltersCount` + `resetAllFilters` helpers.

**Tests** Playwright **8/8** : tous les filtres présents, bouton reset apparaît à l'activation d'un filtre, disparaît au reset.

**Note** : Les Mouvements ont déjà un système de filtres complet (produit, type, dates) — pas touché. Les autres sections (Magasin, Achats, Fournisseurs) seront auditées en Phase 2.b si besoin.



## 01/05/2026 — Stock : Refonte Phase 1 — Navigation simplifiée (DONE)

**Demande utilisateur** : Refonte du module Stock. Insatisfactions relevées : sections trop nombreuses, cards/tableaux peu lisibles, filtres insuffisants, pas de photos, sync Caisse↔Stock pas fiable, performance lente. Plan en 4 phases validé. **Phase 1** = simplification nav.

**Avant** : 10 sections en sidebar + 1 groupe implicite avec 5 sous-onglets.

**Après** : 5 groupes logiques en sidebar, chacun avec sous-onglets affichés dans une barre horizontale :
1. **Tableau de bord** → `Vue d'ensemble` · `Déstockage live`
2. **Catalogue** → `Produits` · `Fiches Techniques` · `Portionnement` · `Liaisons Caisse↔Stock` · `Catégories`
3. **Stocks** → `Stock Magasin` · `Mouvements` · `Inventaire`
4. **Approvisionnement** → `Achats` · `Fournisseurs`
5. **Rapports & Admin** → `Rapports` · `Utilisateurs` (admin only)

**Modifications** (`/app/frontend/src/pages/StockPage.jsx`) :
- Remplacement de `NAV_ITEMS` + `PRODUCTS_RECIPES_SUBTABS` + `PRODUCTS_RECIPES_IDS` par une structure unifiée `NAV_GROUPS = [{id, label, icon, subtabs: [...]}]`.
- Helper `findGroupForSection(id)` pour retrouver le groupe parent d'une section.
- Sidebar : boucle sur `NAV_GROUPS`, filtre les groupes vides après filtrage admin-only, click navigue vers le premier sous-onglet visible du groupe.
- Sub-nav horizontale : désormais générique (affichée pour TOUT groupe ayant 2+ sous-onglets visibles), plus seulement pour Produits & Recettes.
- Support admin-only au niveau sous-onglet (propriété `adminOnly: true` sur un sub-tab).
- Aucune logique métier modifiée — les conditions `activeSection === "products"` etc. restent inchangées dans le body.

**Tests** Playwright **18/18** : 5 groupes présents, tous les sous-onglets de chaque groupe accessibles, admin voit bien "Utilisateurs" dans Rapports & Admin, navigation fluide entre groupes.

**Phases suivantes à venir** :
- Phase 2 : Lisibilité tables/cards + Filtres combinables
- Phase 3 : Photos produits (base64 + miniatures)
- Phase 4 : Vérificateur de liaisons Caisse↔Stock + Refacto performance



## 01/05/2026 — Caisse : Réorganisation menu BONS (5 → 3 onglets) (DONE)

**Demande utilisateur** : « Dans le menu BONS, réorganise les menus et sous-menus. Ce qu'on peut supprimer comme ce qu'on peut fusionner. »

**Audit & action** : 5 sous-onglets → 3 sous-onglets principaux + sous-onglets internes.

**Avant** :
1. Factures · 2. MME LA DIRECTRICE GÉNÉRALE · 3. EMPLOYÉS · 4. GÉRANTE · 5. FACTURES IMPAYÉES D.G.

**Après** (3 onglets) :
1. **Factures** (orange, inchangé)
2. **MME LA D.G.** (violet) → onglets internes : `Actives` + `Archivées (admin)`
3. **BONS À CRÉDIT** (rose, icône `CreditCard`) → onglets internes : `Employés (10 000 F/mois)` + `Gérante (25 000 F/mois)` (pills affichant les plafonds en libellé)

**Modifications** :
- Nouveau composant `/app/frontend/src/pages/caisse/components/DGGroupedTab.jsx` : wrapper avec inner `Tabs` rendant `MonsieurTab` (Actives) + `ArchivedDGTab` (Archivées, admin only).
- Nouveau composant `/app/frontend/src/pages/caisse/components/CreditOrdersGroupedTab.jsx` : wrapper avec inner `Tabs` rendant `EmployeeOrdersTab` + `ManagerOrdersTab` (plafonds visibles dans les pills).
- `BonsTab.jsx` : 4 imports remplacés par 2 wrappers, 4 `TabsTrigger` + 4 `TabsContent` réduits à 2 chacun. Imports inutilisés supprimés (`Users`, `UserCog`, `FileWarning`).
- Aucune perte de fonctionnalité — la mécanique métier reste 100% intacte (workflow d'autorisation, plafonds, archivage post-signature, banner admin).

**Tests** :
- Frontend Playwright 9/9 : 3 onglets principaux présents, anciens onglets disparus, navigation interne D.G. (Actives↔Archivées) et Crédit (Employés↔Gérante) fonctionnelle, contenus chargent correctement.



## 01/05/2026 — Caisse : Archivage automatique des factures D.G. impayées post-signature (DONE)

**Demande utilisateur** : « Une fois le point effectué et qui englobe les bons de la directrice générale, le point des impayés disparaissent et vont se loger dans un autre sous menu de l'administrateur dénommé Factures impayées D.G. »

**Mécanique** :
- Lorsqu'une gérante **signe** un point financier (`POST /api/financial-points/{id}/sign`), un **hook** archive automatiquement toutes les commandes Mme la D.G. en statut `non_regle` dont la date (`created_at`) tombe dans la période couverte (`date` → `end_date`).
- Les commandes archivées disparaissent de l'onglet "Mme la Directrice Générale" (filtré par défaut).
- Elles apparaissent dans un nouveau sous-onglet **admin uniquement** "FACTURES IMPAYÉES D.G." avec possibilité de **« Remettre en actif »** pour relancer le règlement via le flux normal.

**Backend** :
- `/app/backend/server.py` :
  - `GET /api/monsieur-orders` accepte `?include_archived=true` (défaut: `false`) → exclut désormais les archivées.
  - Nouveau `GET /api/monsieur-orders/archived` → liste admin des archivées + stats.
  - Nouveau `POST /api/monsieur-orders/archive-for-point` (idempotent, body: `point_id`, `point_date`, `end_date`).
  - Nouveau `POST /api/monsieur-orders/{id}/unarchive` (admin remet en actif).
  - Champs MongoDB ajoutés sur `monsieur_orders` : `archived_after_point` (bool), `archived_point_id`, `archived_at`, `unarchived_at`.
- `/app/backend/routers/financial_points.py` :
  - Hook dans `sign_financial_point` qui exécute `update_many({status: "non_regle", date in [point_date, end_date]}, {archived_after_point: true, ...})`. Erreur d'archivage non bloquante (logguée).

**Frontend** :
- Nouveau composant : `/app/frontend/src/pages/caisse/components/ArchivedDGTab.jsx` (~140 lignes).
  - Header ambre + badge "Archives admin · post-signature".
  - 3 cartes stats (Total impayé / Commandes archivées / Non réglées).
  - Bouton "Remettre en actif" par commande (toast + refresh).
  - État vide propre.
- `BonsTab.jsx` : nouveau 5ᵉ sous-onglet "FACTURES IMPAYÉES D.G." (orange ambré, icône `FileWarning`, **`isAdmin` only**).

**Tests** :
- Backend curl 8/8 : création commande D.G. impayée → visible en actif → invisible en archivé. Création + signature point → commande disparaît de l'actif → apparaît en archivé (5 000 F). Unarchive → revient en actif.
- Frontend Playwright 4/4 : sous-onglet visible, page chargée, bouton actualiser, carte total.



## 01/05/2026 — Caisse : Banner « Crédits sur salaires du mois » (admin only) (DONE)

**Demande utilisateur** : OK pour la suggestion de mini tableau de bord, **uniquement sur le profil administrateur**.

**Modifications** :
- Nouveau composant : `/app/frontend/src/pages/caisse/components/SalaryCreditsBanner.jsx` (~110 lignes).
  - Fetch parallèle des collections `employee-orders` et `manager-orders` du mois courant.
  - Auto-refresh toutes les 30 secondes (live).
  - Cache automatique si 0 commande dans le mois (pas de bruit visuel).
  - 3 cellules colorées :
    - **EMPLOYÉS** (rose) : montant `authorized_total` + complément `pending_total` "en attente".
    - **GÉRANTE** (violet) : idem.
    - **TOTAL À RETENIR** (vert émeraude, bordure double) : somme des 2 catégories autorisées + alerte si pending.
- Intégration dans `BonsTab.jsx` : rendu conditionnel `{isAdmin && <SalaryCreditsBanner />}` au-dessus de `TabsList`.

**Tests** :
- Frontend Playwright : banner VISIBLE pour admin avec montants exacts (3 000 F employés autorisés + 2 000 F pending, 6 000 F gérante autorisés + 4 000 F pending, total 9 000 F + 6 000 F en attente). Banner ABSENT pour la gérante (`role=manager`).



## 01/05/2026 — Caisse : Bons GÉRANTE (jumeau de EMPLOYÉS, plafond 25 000 F/mois) (DONE)

**Demande utilisateur** : « Crée un autre sous menu pour la gérante dans les mêmes formes que pour les employés mais avec un plafond de 25.000 F. »

**Backend** (`/app/backend/server.py`, +330 lignes après les endpoints `employee-orders/closure-pdf`) :
- Nouvelle collection MongoDB : `manager_orders` + `manager_settlements`.
- Constantes : `MANAGER_MONTHLY_CAP = 25000.0`, `MANAGER_DISCOUNT_RATE = 0.50`.
- 7 endpoints jumeaux des EMPLOYÉS, sous `/api/manager-orders` :
  - `GET /api/manager-orders`, `GET /api/manager-orders/cap-status`
  - `POST /api/manager-orders` (poste par défaut "Gérante")
  - `PUT /api/manager-orders/{id}`, `PUT /api/manager-orders/{id}/authorize`
  - `DELETE /api/manager-orders/{id}`
  - `POST /api/manager-orders/close-month`, `GET /api/manager-orders/closure-pdf`
- Workflow séquentiel identique : `pending_manager` (auto-confirmation Gérante) → `pending_director` → `authorized` (stock déduit) → `settled` (déduit du salaire mensuel).

**Frontend** :
- Nouveau composant : `/app/frontend/src/pages/caisse/components/ManagerOrdersTab.jsx` (~440 lignes), clone d'`EmployeeOrdersTab` adapté :
  - Couleur violet/purple, icône `UserCog`.
  - Plafond affiché : 25 000 F.
  - Nom de la gérante auto-rempli depuis `currentUser.full_name` (modifiable).
  - Poste verrouillé sur "Gérante" (input `disabled`).
  - Statut `pending_manager` libellé "Auto-confirmation Gérante en attente".
  - Bouton d'autorisation Gérante libellé "Auto-confirmer (Gérante)".
- Intégration : `/app/frontend/src/pages/caisse/components/BonsTab.jsx` — 4ᵉ sous-onglet "GÉRANTE" après EMPLOYÉS.

**Tests** :
- Backend curl 7/7 : création (3 000 F après remise), cap_status (max=25 000), Director-d'abord = 409 ✅, workflow séquentiel OK, plafond 25 000 F respecté avec message clair ("Déjà utilisé : 14000 F. Cette commande : 15000 F. Maximum : 25000 F").
- Frontend Playwright 8/8 : sous-onglet GÉRANTE visible, page chargée, badge "25 000 F/mois", boutons création + clôture, modale avec nom pré-rempli et poste verrouillé sur "Gérante".



## 01/05/2026 — Caisse : Bons EMPLOYÉS (crédit salaire avec plafond + double autorisation) (DONE)

**Demande utilisateur** : « Dans les bons crée un sous menu EMPLOYÉS avec les mêmes caractéristiques que pour Mme la Directrice Générale. Mais le remboursement se fera sur les salaires versés en fin de mois. Dans ce menu impose que la vente débute nécessairement par le nom de l'employé et son poste. La vente sera facturée à 50% avec un maximum de 10.000 F par mois (après réduction). La vente sera autorisée par la gérante et la directrice générale. »

**Choix utilisateur** :
- Poste : liste prédéfinie (Serveur/Cuisinier/Caissier/Plongeur/Sécurité/Ménage/Manager) + option "Autre" → saisie libre.
- Plafond 10 000 F/mois : compte TOUTES les commandes du mois (pending + autorisées + réglées) hors annulées.
- Clôture : un bouton "Clôturer le mois" qui passe TOUTES les commandes autorisées à "Réglé sur salaire" + génère un PDF récap par employé.
- Autorisations : SÉQUENTIELLES — Gérante d'abord, puis Directrice Générale.
- Stock : décrémenté UNIQUEMENT après les 2 autorisations.

**Backend** (`/app/backend/server.py`, +400 lignes après les endpoints `monsieur-purchases`) :
- Nouvelle collection MongoDB : `employee_orders` + `employee_settlements` (audit clôtures).
- Schéma : `id`, `employee_name`, `employee_position`, `items`, `subtotal`, `discount_rate=50`, `discount_amount`, `total` (= subtotal × 0.5, montant retenu sur salaire), `month_period` (YYYY-MM), `status`, `authorizations: {manager, director}`, `stock_deducted`, `created_by`, `settled_at`, `settlement_batch_id`.
- Statuts : `pending_manager` → `pending_director` → `authorized` → `settled` (ou `cancelled`).
- Endpoints :
  - `GET /api/employee-orders` (filtres month/employee/status + stats globales)
  - `GET /api/employee-orders/cap-status?employee_name=X&month=YYYY-MM`
  - `POST /api/employee-orders` — valide nom+poste obligatoires, calcule remise 50%, vérifie plafond mensuel
  - `PUT /api/employee-orders/{id}` (modif autorisée seulement si status=`pending_manager`)
  - `PUT /api/employee-orders/{id}/authorize` (body: `by_role` + `signer_name`) — ordre séquentiel strict, déduit le stock à la 2ᵉ auth
  - `DELETE /api/employee-orders/{id}` (annule, garde audit si stock déjà déduit)
  - `POST /api/employee-orders/close-month` (batch settle + audit dans `employee_settlements`)
  - `GET /api/employee-orders/closure-pdf?month=YYYY-MM` — HTML imprimable avec récap par employé
- Constantes : `EMPLOYEE_MONTHLY_CAP = 10000.0`, `EMPLOYEE_DISCOUNT_RATE = 0.50`.

**Frontend** :
- Nouveau composant : `/app/frontend/src/pages/caisse/components/EmployeeOrdersTab.jsx` (~450 lignes).
  - Header : titre "Bons EMPLOYÉS" + badge "Crédit salaire" + filtre mois (`<input type=month>`) + boutons "Nouvelle commande" et "Clôturer le mois" (admin only).
  - 4 cartes stats : En attente (G+D) · Autorisés · Réglés sur salaire · Mois courant + plafond 10 000 F.
  - Modale création : section dédiée "Identité de l'employé (obligatoire)" en HAUT du formulaire (nom + Select poste avec option "Autre" → input libre), puis recherche produits, panier avec récap (subtotal → remise 50% → total à retenir), barre de progression du plafond LIVE avec couleur dynamique (rose normal, rouge si dépassement projeté), bouton submit désactivé tant qu'incomplet.
  - Liste : badges de statut colorés, montants, traîne d'autorisations (qui a signé + quand), boutons d'autorisation contextuels selon rôle/statut.
  - Modale clôture : aperçu par employé (count + total) avant confirmation. Au clic "Confirmer", appel batch + ouverture PDF dans nouvel onglet.
- Intégration : `/app/frontend/src/pages/caisse/components/BonsTab.jsx` — nouveau sous-onglet "EMPLOYÉS" (rose) à côté de "MME LA DIRECTRICE GÉNÉRALE".

**Tests** :
- Backend curl 9/9 : création → cap_status (3 000 F utilisés) → tentative auth Director-d'abord = 409 ✅ → Manager autorise = pending_director ✅ → Director autorise = authorized + stock déduit ✅ → tentative dépassement 10 000 F = HTTP 400 avec message clair ✅ → clôture mois batch (2 commandes settled) → PDF généré (HTML 200, contient noms employés et totaux).
- Frontend Playwright 9/9 : sous-onglet EMPLOYÉS visible, page chargée, boutons Nouvelle commande + Clôturer le mois (admin), filtre mois, modale avec inputs nom/poste, bouton submit désactivé tant que poste non choisi.



## 01/05/2026 — Caisse : Récap. billetage détaillé sur la modale de signature (DONE)

**Demande utilisateur** : OK pour l'amélioration suggérée — afficher un mini-récap visuel du billetage (denominations + total) avant que la gérante coche « Je certifie l'exactitude ».

**Modifications** (`/app/frontend/src/pages/caisse/components/PointFinancierTab.jsx`) :
- Nouvelle section `[data-testid="fp-billettage-recap"]` ajoutée dans la modale de signature.
- Visible uniquement si `billettageRequired && billettageTotal > 0` (espèces > 0 ET billetage saisi).
- Liste ligne par ligne chaque dénomination utilisée avec :
  - Quantité + label "billet"/"pièce" (singulier/pluriel auto) + valeur faciale + sous-total.
  - Couleur verte pour billets (10000/5000/2000/1000/500), ambre pour pièces (200/100/50/25/10/5).
- Badge dynamique « Cohérent » (vert) ou « Écart » (ambre) selon `billettageTotal === cash_amount`.
- Total billetage affiché en gras avec séparateur visuel.

**Test** Playwright 6/7 passés (1 faux négatif sur recherche "6500" vs "6 500" avec espace insécable français — le rendu est correct). Vérifié visuellement via `inner_text()` :
```
RÉCAP. BILLETAGE DES ESPÈCES                  [Cohérent]
1 billet de 5 000 F                            5 000 F
1 billet de 1 000 F                            1 000 F
1 pièce de 500 F                                 500 F
Total billetage                                6 500 F
```



## 01/05/2026 — Caisse : Billetage obligatoire + renommage Mme la Directrice Générale (DONE)

**Demandes utilisateur** :
1. « Lorsque la gérante finit son point, en cliquant sur OK, que l'application la renvoie nécessairement sur le billetage avant que le point ne se transmette à l'administrateur et que son point soit complet. »
2. « Change le nom du Manager Général par Mme la Directrice Générale. »

**1. Billetage obligatoire avant signature** (`/app/frontend/src/pages/caisse/components/PointFinancierTab.jsx`) :
- Nouveau handler `handleSignClick()` intercepte le bouton "Signer (Gérante)".
- Règle : si `cash_amount > 0` mais `billettageTotal === 0` → ouvre la section Billettage, scroll dessus, toast d'avertissement, **bloque la modale de signature**.
- Si billetage saisi mais ≠ cash_amount (utilisateur a oublié "Appliquer aux Espèces") → idem avec scroll vers le bouton Appliquer.
- Sinon → ouvre la modale de consentement comme avant.
- **Bouton dynamique** : libellé "Compléter le billetage" (ambre) tant que billetage incomplet, puis "Signer (Gerante)" (vert) une fois cohérent. Logique basée sur `cashMatches = billettageTotal === cash_amount`.
- Aucun changement backend (le payload `billettage` était déjà envoyé via `savePoint`).

**2. Renommage Manager Général → Mme la Directrice Générale** (UI display only, schémas DB inchangés) :
- Frontend :
  - `BonsTab.jsx` : sous-onglet "MANAGER GENERAL" → "MME LA DIRECTRICE GÉNÉRALE".
  - `MonsieurTab.jsx` : header "Commandes Manager General", titres modaux, toasts, badge "Promoteur" → "Direction", title PDF/print, libellé info.
  - `HebdoReport.jsx` : carte résumé, colonne "Manager G." → "Mme la D.G.", section détail jour, titre "Situation Manager General".
- Backend (`server.py`) : défauts pour les NOUVELLES factures Manager → "Mme la Directrice Générale" (`customer_name`, `client_name`, `reason` mouvement stock, `cancellation_reason`).
- Les enregistrements historiques (anciennes factures avec `customer_name="Manager General"`) restent intacts en base.

**Tests** :
- Frontend Playwright 4/4 (renommage UI) : sous-onglet, colonne "Mme la D.G.", absence de l'ancien libellé "Manager G."
- Frontend Playwright 7/7 (flux billetage) : sauvegarde sans billetage, bouton "Compléter le billetage" affiché, modale bloquée, section billetage auto-ouverte, billetage rempli + appliqué + sauvegardé, bouton repasse à "Signer (Gerante)", modale s'ouvre normalement.
- Test point créé/supprimé proprement après tests.



## 01/05/2026 — Caisse : « Faire le point » (renommé Hebdo) avec plages de dates (DONE)

**Demande utilisateur** : « dans le module caisse, renommer Hebdo par Faire le point. Dans ce menu, donne la possibilité de faire le point journalier, le point d'une période a choisir, ou hebdomadaire ».

**Backend** (`/app/backend/server.py`) :
- `GET /api/reports/weekly` accepte un nouveau paramètre optionnel `end_date` (YYYY-MM-DD, inclusif). Sans `end_date`, le comportement reste 7 jours (Lundi → Dimanche). Avec `end_date`, la plage est de 1 à 31 jours.
- Refactor `nb_days = (end_date - start_date).days + 1` pour que toutes les boucles (`daily_data`, agrégation jours) supportent dynamiquement la plage.
- **Bugfix critique** (L5571) : `end_date.strftime` (paramètre str/None) → `end_date_computed.strftime` (datetime calculé). L'endpoint était cassé en HTTP 500 « 'NoneType'/'str' object has no attribute strftime ».
- `week_label` mis à jour : « Période du 27/04 au 03/05/2026 » (au lieu de « Semaine du… »).
- Ajout `except HTTPException: raise` pour préserver les `400` (validation `end_date` invalide).

**Frontend** :
- `CaissePage.jsx` :
  - Nouvel état `weekEndDate` (par défaut = dimanche de la semaine courante).
  - `fetchWeeklyReport()` envoie `end_date` quand renseigné.
  - `useEffect` re-fetch sur changement de `weekStartDate || weekEndDate`.
  - Tab trigger renommé « Hebdo » → « **Faire le point** » (label uniquement, value `hebdo` conservée pour compat).
  - Sous-onglet renommé « Point Hebdomadaire » → « **Faire le point** ».
  - Titre PDF mis à jour idem.
- `caisse/components/HebdoReport.jsx` :
  - Nouvelle UI **Card de période** : 4 boutons presets (Aujourd'hui / Cette semaine / Mois en cours / Personnalisée) + 2 inputs de date (Du / Au) + flèches navigation prev/next + libellé courant lisible.
  - `applyPreset(preset)` : règle weekStart/weekEnd selon le preset.
  - `navigatePeriod(direction)` : décale la plage de N jours = taille de la plage actuelle (cohérent pour journalier, hebdo et custom).
  - Title H2 « Point Hebdomadaire » → « Faire le point ».
  - Tous les éléments ont `data-testid` (preset-today/week/month/custom, period-start-date, period-end-date, period-prev-btn, period-next-btn, period-current-label).

**Tests** :
- Backend curl 7/7 : default (7j), week_start only (7j), single day (1j), 15 jours, 31 jours, end_date invalide (HTTP 400 propre), régression ISO format.
- Frontend Playwright 17/17 : login admin, libellé « Faire le point » présent, 4 presets + inputs présents, click Aujourd'hui = 1 jour, Cette semaine = 7j, Mois en cours = 1er→fin de mois, plage custom rendue correctement, navigation prev décale bien la plage entière.



## 29/04/2026 — Manager Général : masquer les commandes réglées (DONE)

**Demande utilisateur** : « les factures reglees doivent disparaître seules les non reglees restent ».

**Contexte** : depuis la refonte du flow Manager Général, l'encaissement d'une commande crée automatiquement une facture Caisse standard. Les commandes réglées sont donc redondantes ici → la vue doit être épurée pour ne montrer que les dettes en attente.

**Modifications** (`/app/frontend/src/pages/caisse/components/MonsieurTab.jsx`) :
- Suppression de l'état `filter` et des 3 onglets (Tous / Non réglés / Réglés).
- Filtrage strict : `visibleOrders = orders.filter(o => o.status !== "regle")`.
- Stats simplifiées : 2 cartes (À encaisser / Déjà réglées (compteur info)) au lieu de 3.
- Empty state mis à jour : « Aucune commande en attente de paiement » + sous-texte explicatif.
- Bandeau d'info adapté : explique le basculement automatique vers les Factures du jour.
- Nettoyage des branches mortes du rendu (badges/boutons « Annuler le règlement » / « Inclus dans le point » → uniquement vue non réglée). Bouton « Facture » retiré du rendu (devenu superflu, l'encaissement crée la facture).
- Conservation des fonctions back-compat (`toggleStatus` annulation, `convertToInvoice`) sans rendu UI, pour ne pas casser d'éventuels appels résiduels.

**Test** : screenshot validé — 3 commandes réglées en base masquées, état vide affiché correctement, stats à jour.


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
- [x] **Regroupement des Reversements** : Sous-menu unique "Reversement" (Bar/Menu/Jeux/Locations) + Historique groupé par jour avec les 4 catégories côte à côte (21/05/2026)
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
