# Espace Maxo - PRD

## Problem Statement
Application pour le restaurant "Espace Maxo" à Cotonou (Bénin) permettant de réserver des jeux VR, payer par mobile money, commander des combos avec session de jeu, réserver des tables avec acompte, gérer les réservations, et gérer un système de facturation POS interne.

---
## Recent Updates (13/04/2026 - Session 2)

### Point Financier / Reversement des Recettes - Complete (DONE)
- **Renomme** : "Point Financier" → "Reversement des Recettes"
- **Sous-onglet Hebdo** : Accessible via Hebdo > Point Financier
- **4 modes de paiement** : Especes, Mobile Money, Cheque, Portefeuille/Credit (Carte Bancaire et Autres supprimes)
- **Workflow inverse** :
  1. Gerante saisit les montants reverses
  2. **Gerante signe** (consentement par checkbox)
  3. **Admin valide** (verrouillage final + PDF)
- **Comparaison automatique** : Tableau montrant les ecarts entre le reversement et les recettes enregistrees dans le systeme (Point Hebdo) par mode de paiement
- Endpoint `/api/reports/revenue-by-payment` pour les donnees de comparaison
- Seul l'admin peut supprimer ou autoriser la modification
- **Tests** : 10/10 backend + 22/22 frontend PASSED

---
## Recent Updates (13/04/2026 - Session 1)

### Rapport - Nouveau Sous-menu "Point Financier"
- L'onglet Rapport contient maintenant 2 sous-onglets :
  - **Rapport Journalier** : Point de caisse quotidien existant
  - **Point Financier** (nouveau) : Remise de fonds par mode de paiement
- Le Point Financier affiche :
  - Total des recettes validées du jour
  - Répartition par mode : **Espèces**, **Mobile Money**, **Carte Bancaire**, **Chèque**, **Porte-monnaie/Crédit**
  - Tableau détaillé des transactions validées

### Prise de Commande - Instructions Particulières Client
- Nouveau champ **"Instructions particulières du client"** ajouté avant le bouton "ENVOYER LA COMMANDE"
- Placeholder : "Ex: Sans oignon, bien cuit, allergie aux arachides..."
- Les instructions sont enregistrées avec la commande

### Correction API Activité - Total Dépenses
- Requête MongoDB modifiée pour rechercher les dépenses par `completed_at` OU `created_at`

---
## Recent Updates (12/04/2026)

### Mode de Paiement à la Validation Bon-Client
- **Modal de sélection** du mode de paiement affichée au clic sur "Bon-Client"
- Récapitulatif de la facture (Client, Serveur, Articles, Total)
- 3 modes de paiement : **Espèces**, **Mobile Money**, **Carte**
- Le mode de paiement est enregistré dans la facture
- Visible dans le **Point du serveur** avec badge coloré par mode de paiement
  - 💵 Espèces (vert), 📱 Mobile (orange), 💳 Carte (bleu)

### Gestion des Points Serveurs - Actions Complètes
- **Valider** : Approuver le point du serveur
- **Réviser** : Demander une modification/explication au serveur
- **Rejeter** : Refuser le point avec commentaire
- **Supprimer** : Suppression sécurisée avec code **0631** requis
- Notifications envoyées au serveur si révision demandée ou rejet

### Interface Gérante - Simplification
- **Suppression menus Historique et Statistiques** pour la gérante
- **Nouvel onglet "Points Serveurs"** créé avec vue en grille des rapports de fin de service
- **Suppression des graphiques** dans l'onglet Rapport pour la gérante (conservés uniquement pour l'admin)
- **Retrait de la notification Points** de la barre supérieure (remplacé par l'onglet dédié)

### Suivi des Tables - Arrêt Automatique Amélioré
- **Arrêt automatique** : Les tables sont maintenant automatiquement libérées lorsque leur facture est validée par la gérante
- Le numéro de table est maintenant stocké dans chaque facture pour permettre le suivi
- Les statistiques de qualité de service sont enregistrées automatiquement (durée, qualité: excellent/acceptable/lent)
- **Arrêt manuel** : Le bouton "Arrêter" reste disponible dans l'onglet Tables pour arrêter manuellement si nécessaire
- Toggle "Arrêt auto" toujours disponible pour arrêter les tables facturées automatiquement depuis l'onglet Tables

### Gérante - Accès à la Prise de Commandes
- L'onglet **"Commande"** est maintenant visible et accessible pour la gérante (manager)
- La gérante voit la même interface que les serveurs pour prendre des commandes
- Bouton **"Prendre une commande"** ajouté dans l'onglet "Tables" pour un accès rapide
- Dans le tableau des tables occupées : bouton **"Commander"** pour reprendre une commande existante
- L'onglet par défaut pour la gérante est désormais "Commande" (au lieu de "BONS")

---
## Recent Updates (11/04/2026)

### Rapport Hebdomadaire - Recettes Locations Intégrées
- Ajout d'une nouvelle carte "Locations" (violette) dans le résumé du rapport hebdomadaire
- Ajout d'une carte "Total Recettes" (cyan) qui combine ventes + locations
- Nouvelle colonne "Locations" dans le tableau jour par jour
- Section détaillée "Locations par Espace" avec liste des réservations de la semaine
- Le bénéfice/résultat inclut désormais les recettes des locations

### Restriction Factures Location - Gérante Uniquement (Confirmée)
- Seule la gérante (manager) peut générer des factures pour les locations
- L'admin peut toujours gérer les locations (créer, modifier, supprimer) mais ne voit pas le bouton "Facture"
- Variable `canGenerateLocationInvoices` ajoutée dans `LocationsTab.jsx`

---
## Recent Updates (08/04/2026)

### Bug Fix Critique - Interface Réparée
- **Problème**: Erreur JSX "Adjacent JSX elements must be wrapped" qui rendait les onglets (Factures → Historique) invisibles
- **Cause**: Structure `<Tabs>` mal fermée suite à l'ajout des sous-onglets "Monsieur"
- **Solution**: Ajout du `)}` manquant pour fermer correctement le bloc ternaire principal du composant

### Restriction Factures Location - Gérante Uniquement
- **Nouvelle règle métier**: Seule la gérante (manager) peut générer des factures pour les locations
- L'admin peut toujours gérer les locations (créer, modifier, supprimer) mais ne peut PAS générer de factures
- Les boutons "Facture" dans l'onglet Locations ne sont visibles que pour le rôle "manager"

---

## What's Been Implemented

### Phase 16 - Logiciel Caisse Pro (Mars 2026)
- **Système POS Complet** : `/caisse` - Application standalone de facturation
  - **Système de sessions par serveur** :
    - Connexion par code PIN (4-6 chiffres) pour les serveurs
    - Connexion par mot de passe pour les admins (Caisse2026 ou Esp@ceM@xo2026)
    - Les serveurs ne voient QUE leurs propres factures
    - Les managers et admins voient TOUTES les factures
  - **Workflow de facturation en 3 étapes** :
    1. Serveur crée facture → Bouton "CRÉER FACTURE" → Statut "En attente"
    2. Gérante valide la facture (onglet Factures)
    3. Facture revient au serveur dans "FACTURES À IMPRIMER" avec bouton "IMPRIMER"
  - **Notification sonore** : Son de cloche + toast vert quand une facture est validée (auto-refresh toutes les 10s)
  - Interface avec 6 onglets : Caisse, Factures, Statistiques, Produits, Clients, Utilisateurs
  - **5 départements** : Salle & Jardin, Jeux, Bar, Location, Autres
  - **Saisie manuelle** : Département "Autres" permet de saisir librement nom et prix
  - **Traçabilité serveur** : Chaque facture enregistre le nom du serveur
  - **Validation gérante** : Toutes les factures nécessitent validation par un admin
    - Statuts : "⏳ En attente" (pending) → "✓ Validée" (validated)
    - Nom du validateur affiché sur la facture validée
  - **Impression ticket 80mm** : Format compact pour imprimante thermique à rouleau
  - Gestion CRUD des factures avec numérotation automatique (EM-YYYYMMDD-XXXX)
  - Gestion des produits avec prix et unités
  - Gestion des clients
  - Gestion multi-utilisateurs (serveurs, managers, admins) avec PIN unique
  - Statistiques journalières et mensuelles par département
  - Export PDF A4 des factures (via reportlab)
  - Modes de paiement : Espèces, Carte, Mobile Money, Chèque
  - Remises en pourcentage
- **Lien discret** : "•" dans le footer du site principal vers /caisse

### Phase 15 - Combos + Jeu et Réservation Table (Fév 2026)
- **Paiement Combos en ligne** : Les clients peuvent commander des combos et réserver une session de jeu en un seul clic
  - Page `/menu` affiche uniquement les combos (autres plats supprimés)
  - Panier flottant avec récapitulatif
  - Sélection du type de jeu (VR 360° / Simulateur) avec tarifs
  - Sélection de date et créneau horaire
  - Paiement via Kkiapay ou Porte-monnaie
- **Réservation Table avec acompte** : Nouvelle fonctionnalité à `/reserver-table`
  - Formulaire complet (nom, téléphone, date, heure, nombre de personnes, occasion)
  - Acompte déductible de 5 000 à 25 000 FCFA
  - Paiement via Kkiapay ou Porte-monnaie
  - L'acompte est déduit de l'addition finale
- **Admin Dashboard** : Nouveaux onglets
  - Onglet "Combos" pour gérer les commandes combo+jeu
  - Onglet "Tables" pour gérer les réservations de table

### Phase 14 - Section "Nous Rejoindre" (Déc 2025)
- **Nouvelle page `/rejoindre`** : Formulaire de candidature complet
- **Upload CV** : Support des fichiers PDF jusqu'à 5 Mo
- **SMS Admin** : Notification automatique à chaque nouvelle candidature
- **Panel Admin** : Onglet "Candidatures" avec gestion complète

### Phase 13 - Portefeuille Livraison (Déc 2025)
- Intégration du paiement par porte-monnaie pour les livraisons
- Message d'information si solde insuffisant

### Phases précédentes
- Dual Admin Roles (accès complet / lecture seule)
- Modales "Voir détails" pour toutes les sections admin
- Location événementielle
- Système Provision/Portefeuille avec OTP SMS
- Reprogrammation des réservations
- MVP, Admin, Kkiapay, Fidélité, Avis

## Configuration

### Admin
- URL: /admin
- **Accès Complet**: `Esp@ceM@xo2026`
- **Lecture Seule**: `MaxoConsult2026`

### Caisse Pro
- URL: /caisse
- **Admin**: Mot de passe `Caisse2026`
- **Manager (Gérante)**: PIN `0000`
- **Serveur (Christian)**: PIN `1111`
- **Cuisinier (Chef Test)**: PIN `2222` - Ne voit que les bons cuisine
- **Coach Jeux (Coach Test)**: PIN `3333` - Ne voit que les bons jeux

### Rôles Caisse Pro
| Rôle | Permissions |
|------|-------------|
| **admin** | Accès total, validation factures, annulation directe, gestion utilisateurs |
| **manager** | Validation factures, demande annulation à admin, rapport journalier |
| **server** | Création factures, modification (après autorisation), impression |
| **cuisinier** | Vue simplifiée - Uniquement bons cuisine (salle_jardin) |
| **coach_jeux** | Vue simplifiée - Uniquement bons jeux |
- **Mot de passe**: `Caisse2026` ou `Esp@ceM@xo2026`

### Twilio SMS
- Numéros admin: +22997720808, +22991005084
- TWILIO_PHONE_NUMBER: +14475742763

### Kkiapay (Production)
- KKIAPAY_SANDBOX: false

## Prix des Jeux
- **VR 360°**: 2 000 FCFA / partie
- **Simulateur Course**: 1 500 FCFA / partie

## Frais de reprogrammation
- **Gratuit** : Si > 15 min avant la session
- **500 FCFA** : Si < 15 min avant la session
- **Maximum 1 reprogrammation** par réservation

## APIs Backend

### Nouvelles APIs (Phase 16 - Caisse Pro)
- `POST /api/caisse/login` - Connexion au POS
- `GET /api/invoices` - Liste des factures (avec paramètre date)
- `POST /api/invoices` - Créer une facture
- `GET /api/invoices/{id}` - Détails d'une facture
- `GET /api/invoices/{id}/pdf` - Export PDF d'une facture
- `GET /api/invoices/stats` - Statistiques journalières
- `GET /api/invoices/stats/monthly` - Statistiques mensuelles
- `GET /api/caisse/products` - Liste des produits
- `POST /api/caisse/products` - Créer un produit
- `PUT /api/caisse/products/{id}` - Modifier un produit
- `DELETE /api/caisse/products/{id}` - Supprimer un produit
- `GET /api/caisse/clients` - Liste des clients
- `POST /api/caisse/clients` - Créer un client
- `PUT /api/caisse/clients/{id}` - Modifier un client
- `DELETE /api/caisse/clients/{id}` - Supprimer un client
- `GET /api/caisse/users` - Liste des utilisateurs
- `POST /api/caisse/users` - Créer un utilisateur
- `PUT /api/caisse/users/{id}` - Modifier un utilisateur
- `DELETE /api/caisse/users/{id}` - Supprimer un utilisateur

### APIs (Phase 15)
- `POST /api/combo-orders` - Créer commande combo + jeu
- `GET /api/admin/combo-orders` - Liste des commandes combo (admin)
- `POST /api/table-reservations` - Créer réservation de table
- `GET /api/admin/table-reservations` - Liste des réservations (admin)
- `PUT /api/admin/table-reservations/{id}` - Mettre à jour le statut
- `DELETE /api/admin/table-reservations/{id}` - Supprimer une réservation

### APIs Existantes
- `/api/bookings` - Réservations de jeux
- `/api/bookings/find-for-reschedule` - Rechercher pour reprogrammer
- `/api/wallet/*` - Gestion du porte-monnaie
- `/api/delivery-orders` - Commandes de livraison
- `/api/applications` - Candidatures
- `/api/admin/export/*` - Export CSV

### APIs Menu Notifications & Server Point (Mars 2026)
- `GET /api/menu-notifications` - Liste des notifications de modifications du menu (Admin)
- `PUT /api/menu-notifications/{id}/read` - Marquer une notification comme lue
- `PUT /api/menu-notifications/mark-all-read` - Marquer toutes les notifications comme lues
- `DELETE /api/menu-notifications/{id}` - Supprimer une notification
- `GET /api/server-daily-report/{server_name}?date=YYYY-MM-DD` - Point journalier d'un serveur
- `POST /api/server-end-of-service` - Créer un rapport de fin de service (envoi point à la gérante)
- `GET /api/server-end-of-service-reports` - Liste des rapports de fin de service (Gérante)
- `PUT /api/server-end-of-service-reports/{id}/read` - Marquer un rapport comme lu
- `PUT /api/server-end-of-service-reports/mark-all-read` - Marquer tous les rapports comme lus

## Prioritized Backlog

### P0 (Completed)
- [x] MVP + Admin + Kkiapay
- [x] SMS OTP et notifications
- [x] Export CSV
- [x] Section "Nous Rejoindre" avec dépôt CV
- [x] **Paiement Combos + Session de jeu**
- [x] **Réservation Table avec acompte**
- [x] **Admin tabs Combos et Tables**
- [x] **Caisse Pro - Logiciel de facturation POS**
- [x] **Export PDF des factures**
- [x] **Lien discret vers caisse sur page d'accueil**
- [x] **Vue détaillée par serveur dans Rapport Journalier** (Mars 2026)
  - Cliquer sur un serveur affiche toutes ses factures du jour
  - Résumé des performances (nombre, total, statuts)
  - Actions: voir détails, imprimer, valider
- [x] **Graphiques visuels dans Rapport Journalier** (Mars 2026)
  - Camembert: Répartition par Département (avec couleurs et pourcentages)
  - Barres horizontales: Performance par Serveur (top 6)
  - Camembert + Détails: Répartition par Mode de Paiement
- [x] **Système de Tables Multiples** (Mars 2026)
  - Les serveurs peuvent ouvrir jusqu'à 20 tables simultanées (T1-T20)
  - Barre d'onglets cliquable pour basculer entre tables
  - Badge indiquant le nombre d'articles par table
  - Sauvegarde automatique en base de données (persistance)
  - Fermeture automatique de la table après création de facture
- [x] **Réorganisation UI - Séparation Commande/Bons** (Mars 2026)
  - Onglet "Commande" dédié à la création de factures (demandes modification, factures à imprimer)
  - Onglet "Bons" dédié à la liste des bons de commande en attente de validation
  - Boutons d'impression séparés (Cuisine, Bar, Jeux) sur chaque bon
- [x] **Impression améliorée des bons de cuisine** (Mars 2026)
  - Le bon Cuisine inclut maintenant les accompagnements avec les plats
  - Séparation visuelle entre plats et accompagnements
  - Bon Bar = uniquement articles bar
  - Bon Jeux = uniquement articles jeux
- [x] **Factures définitives pour serveurs** (Mars 2026)
  - Une fois validée, la facture remplace le bon de commande pour le serveur
  - Section "FACTURES DÉFINITIVES DU JOUR" en lecture seule
  - Les serveurs voient TOUTES les factures validées du jour (pas seulement les leurs)
  - Bouton "Voir" uniquement (pas d'impression ni modification)
- [x] **Onglet Historique** (Mars 2026)
  - Nouvel onglet "Historique" avec sélecteur de date (calendrier)
  - Affiche uniquement les factures validées de la date sélectionnée
  - Accessible à tous les utilisateurs
  - Totaux journaliers calculés automatiquement
- [x] **Workflow Bon → Facture optimisé** (Mars 2026)
  - Bouton "Facture" (anciennement "Valider") avec icône document et gradient vert
  - Message de workflow clair pour la gérante : "1. Imprimer bons → 2. Cliquer Facture"
  - Notification sonore + toast pour le serveur quand sa commande devient facture
  - Serveur voit les factures définitives en lecture seule (bouton "Voir" uniquement)
- [x] **Gestion des Achats/Dépenses** (Mars 2026)
  - Nouvel onglet "Achats" pour la gérante et l'admin
  - Catégories : Cuisine, Bar, **Paiement** (anciennement Jeux), Autres
  - Workflow complet : pending → approved → completed (ou revision_requested)
  - L'admin peut approuver, refuser ou demander une révision avec notes
  - **Admin peut modifier le montant directement** avant validation
  - **Affichage détaillé** : description, fournisseur, date prévue, photo du reçu
  - Upload de photo de reçu/facture
  - Historique des achats complétés
  - **Onglet Commande masqué pour la gérante** (elle n'en a pas besoin)
  - **Liste d'achats multiple** : La gérante peut créer une longue liste d'articles avec fournisseur et date communs, puis soumettre toutes les demandes en une seule fois
  - **Vue complète détaillée** : Tableau avec toutes les demandes (#, Catégorie, Description, Fournisseur, Montant, Statut, Demandé par, Date) + bouton "Imprimer tout"
  - **Impression PDF** : Chaque demande approuvée peut être imprimée en PDF individuel ou en liste complète
  - **Alerte ratio Dépenses/CA > 40%** : L'admin reçoit une alerte visuelle rouge clignotante quand le total des demandes d'achats dépasse 40% du CA de la semaine
  - **Clic pour modifier** : Cliquer sur n'importe quelle ligne dans la Vue Complète ouvre le modal de modification avec les données pré-remplies
  - **Impression Ticket Thermique** : Nouveau bouton "Ticket 80mm" pour imprimer la liste des achats en attente/approuvés au format thermique (noir et blanc, police monospace)
- [x] **Point Hebdomadaire** (Mars 2026)
  - Nouvel onglet "Hebdo" pour manager et admin
  - Affiche Recettes, Dépenses et Résultat de la semaine
  - Navigation entre les semaines avec sélecteur de date
  - Badge Bénéfice/Perte automatique
- [x] **Suivi d'Activité (Admin)** (Mars 2026)
  - Nouvel onglet "Activité" réservé à l'admin
  - Période sélectionnable : Jour, Semaine, Mois
  - Détail des recettes : Caisse, Réservations Jeux, Tables, Combos
  - Détail par département, mode de paiement, serveur
  - Résultat net et marge automatiques

### P1 (User Action Required)
- [ ] Déploiement production - Cliquer **"Deploy"**
- [ ] Tester SMS de confirmation client après paiement
- [ ] **Vérifier le paiement Kkiapay en production** - Tester manuellement un paiement Mobile Money
- [x] **Interface de modification de facture améliorée** - Serveurs peuvent ajouter tout type de produit

### P2 (Future)
- [ ] Section "À propos de nous"
- [ ] Graphiques de revenus
- [ ] Refactorisation de `server.py` (4350+ lignes) - Structure modulaire préparée
- [ ] Refactorisation de `AdminPage.jsx` (1500+ lignes)
- [x] **Phase 1 - Refactorisation CaissePage.jsx** (Mars 2026)
  - Extraction de `TablesTab.jsx` (onglet Suivi des Tables)
  - Extraction de `HebdoReport.jsx` (Point Hebdomadaire)
  - Création de `constants.js` (configuration partagée)
  - Réduction du fichier principal de 7321 à 6816 lignes (-7%)
- [x] **Gestion des Locations** (Mars 2026) - NOUVEAU
  - Onglet "Locations" pour Salle de Fête, Espace Jardin, Salle de Jeux
  - Admin et Gérante: Créer, Modifier, Supprimer les réservations
  - Champs: Client, téléphone, date, horaires, invités, type événement, montant, acompte, solde
- [x] **Locations Combinées** (Mars 2026) - NOUVEAU
  - Sélection multiple d'espaces dans une seule réservation (Pack combiné)
  - Calcul automatique du prix total (50000 + 30000 + 25000 = 105000 F)
  - Badge "📦 Pack combiné" et affichage du label complet "Salle de Fête + Espace Jardin + Salle de Jeux"
  - Statistiques dédiées pour les packs combinés
  - Filtrage par espace individuel ou par "Packs combinés"
  - Contrats avec clauses spécifiques de chaque espace inclus
  - Factures A4 et tickets thermiques pour packs combinés
- [x] **Instructions & Notes** (Mars 2026) - NOUVEAU
  - Communication bidirectionnelle Admin ↔ Gérante
  - Types: Notes simples et Listes de tâches avec cases à cocher
  - Priorités: Basse, Normale, Haute, Urgente
  - Archivage et historique daté
- [x] **Gestion du Menu par la Gérante** (Mars 2026) - NOUVEAU
  - La Gérante peut accéder à l'onglet Produits (catalogue du POS)
  - Ajout, modification et suppression de produits
  - Modifications immédiates sans validation préalable
  - Notifications automatiques à l'Admin via icône cloche
- [x] **Notifications Menu pour Admin** (Mars 2026) - NOUVEAU
  - Icône cloche avec badge indiquant le nombre de notifications non lues
  - Panneau des notifications : "Modifications du Menu"
  - Détails : action (créé/modifié/supprimé), nom du produit, par qui, prix ancien/nouveau
  - Marquer comme lu (individuel ou tout)
  - Rafraîchissement automatique toutes les 30 secondes
- [x] **Point Journalier Serveur** (Mars 2026) - NOUVEAU
  - Nouvel onglet "Mon Point" visible uniquement pour les serveurs
  - 4 cartes statistiques : Commandes créées, Factures validées, En attente, Total validé
  - Répartition par département (Cuisine, Bar, Jeux, etc.)
  - Répartition par mode de paiement
  - Sélecteur de date pour consulter l'historique
  - Liste des factures du jour avec statut et montants
- [x] **Envoi Point Fin de Service à la Gérante** (Mars 2026) - NOUVEAU
  - Bouton "Terminer Service" (violet/indigo) visible pour les serveurs dans le header
  - Modal avec résumé de la journée (Commandes, Validées, Total)
  - Champ "Observation" optionnel pour notes (retard fournisseur, incident, etc.)
  - Envoi automatique du point à la Gérante avec notification in-app
  - Gérante reçoit notification avec badge sur icône 📋 (Points des Serveurs)
  - Panneau listant tous les points reçus avec: nom serveur, statistiques, observation, date/heure
  - Option "Marquer comme lu" individuel ou global
- [x] **Accompagnement Gratuit** (Mars 2026) - NOUVEAU
  - Bouton "+ Accomp. Gratuit" (jaune) visible quand la commande a des articles
  - Modal avec 14 accompagnements disponibles (Riz, Frites, Pâtes, etc.)
  - Ajoute l'accompagnement avec "(GRATUIT)" et prix 0 F
- [x] **Clic sur Table pour Détails (Gérante)** (Mars 2026) - NOUVEAU
  - Dans l'onglet "Tables", la gérante peut cliquer sur une table occupée
  - Modal avec détails: Serveur, Client, Durée, Couleur chronomètre
  - Liste des articles de la commande en cours avec quantités et prix
  - Total de la commande
- [x] **Badge Achats en Révision (Gérante)** (Mars 2026) - NOUVEAU
  - Badge orange dans le header quand des achats ont le statut "revision_requested"
  - Clic redirige vers l'onglet Achats
  - Section "À RÉVISER" visible dans l'onglet Achats
- [x] **Bug Fix: Mon Point Serveur** (Mars 2026)
  - Corrigé le filtre backend: utilise `created_by` au lieu de `server_name`
  - Corrigé le filtre date: utilise regex sur `created_at` au lieu de `date` inexistant
- [x] **Factures Proforma avec saisie manuelle** (Mars 2026) - NOUVEAU
  - Onglet "Proforma" pour la Gérante et l'Admin
  - Création de devis/factures proforma avec saisie manuelle des articles
  - Champs par article : Désignation, Quantité, Prix unitaire, Montant (calculé)
  - Totaux avec option TVA : Sous-total, Remise, Montant HT, TVA (18%), Montant TTC
  - Toggle TVA activé/désactivé pour les clients exonérés
  - Impression PDF avec détails complets HT/TVA/TTC
  - Workflow : Brouillon → Envoyée → Acceptée/Refusée → Convertie en facture
  - Statistiques : Total, Brouillons, Envoyées, Acceptées, Valeur totale

### APIs Proforma Invoices (Mars 2026)
- `GET /api/proforma-invoices` - Liste des proformas avec statistiques
- `POST /api/proforma-invoices` - Créer une proforma
- `GET /api/proforma-invoices/{id}` - Détails d'une proforma
- `PUT /api/proforma-invoices/{id}` - Modifier une proforma (statut, items, etc.)
- `DELETE /api/proforma-invoices/{id}` - Supprimer une proforma
- `POST /api/proforma-invoices/{id}/convert` - Convertir en facture définitive

## Architecture

```
/app/
├── backend/
│   ├── .env
│   ├── requirements.txt
│   ├── server.py (~4350 lignes - refactorisation en cours)
│   ├── models/
│   │   ├── __init__.py
│   │   └── caisse.py (Modèles Pydantic)
│   ├── routers/ (Structure modulaire préparée)
│   │   ├── __init__.py
│   │   ├── invoices.py
│   │   ├── users.py
│   │   ├── products.py
│   │   ├── clients.py
│   │   ├── tables.py
│   │   └── requests.py
│   └── tests/
│       ├── test_combo_table.py
│       └── test_caisse.py
└── frontend/
    ├── .env
    ├── package.json
    └── src/
        ├── App.js
        ├── components/
        │   ├── Navbar.jsx
        │   ├── Footer.jsx (lien discret vers /caisse)
        │   └── ...
        └── pages/
            ├── AdminPage.jsx
            ├── BookingPage.jsx
            ├── CaissePage.jsx (~6816 lignes - REFACTORISÉ)
            ├── caisse/ (Composants modulaires)
            │   ├── constants.js (Configuration, catalogue)
            │   └── components/
            │       ├── TablesTab.jsx (Suivi des Tables - NOUVEAU)
            │       ├── HebdoReport.jsx (Point Hebdomadaire - NOUVEAU)
            │       ├── ProformaTab.jsx (Factures Proforma - NOUVEAU)
            │       ├── InstructionsTab.jsx (Notes & Instructions)
            │       ├── LocationsTab.jsx (Gestion Locations)
            │       ├── LoginView.jsx
            │       ├── TableBar.jsx
            │       ├── BillPanel.jsx
            │       └── index.js
            ├── DeliveryPage.jsx
            ├── HomePage.jsx
            ├── MenuPage.jsx (Combos uniquement)
            ├── RejoindrePage.jsx
            ├── TableReservationPage.jsx
            └── WalletPage.jsx
```

## Corrections appliquées (Mars 2026)
- [x] "Coupé de glace" → "Coupe de glace" (correction orthographe)
- [x] Import manquant `AlertTriangle` ajouté
- [x] Correction des fonctions `approveCancellation` → `approveCancellationRequest`
- [x] Correction des fonctions `rejectCancellation` → `rejectCancellationRequest`
- [x] Correction de `approveModification` → `approveModificationRequest`
- [x] Correction de `rejectModification` → `rejectModificationRequest`

## Contact
- SMS Admin: +229 97 72 08 08, +229 91 00 50 84
- Adresse: Fidjrossè Plage, Cotonou

## Dernières mises à jour (Session Actuelle - Décembre 2025)

### Fonctionnalité "Mon Point" - Validation par la Gérante ✅
- **Validation complète des rapports de fin de service**
  - La Gérante peut Valider, Demander une révision ou Rejeter les rapports des serveurs
  - Comparaison automatique Déclaré vs Réel avec détection des écarts
  - Interface avec tableau de comparaison (Commandes créées, Factures validées, Total des ventes)
  - Badge de statut dynamique (En attente, Validé, Révision demandée, Rejeté)
  - Commentaire optionnel lors de la validation
  - Notification automatique au serveur en cas de révision/rejet

### Refactoring Backend - Phase 1 ✅
- **Création du module `/app/backend/routers/service_reports.py`**
  - Extraction de ~300 lignes de code de server.py
  - Endpoints pour les rapports de service maintenant modulaires
  - `server.py` réduit de 6306 à 6007 lignes
  - Architecture plus maintenable

### APIs "Mon Point" Validation
- `GET /api/server-end-of-service-reports/{report_id}/compare` - Comparaison déclaré vs réel
- `PUT /api/server-end-of-service-reports/{report_id}/validate` - Valider/Réviser/Rejeter

### Prochaines étapes de Refactoring
1. **P1:** Continuer l'extraction des modules de server.py vers /backend/routers/
2. **P2:** Refactorer CaissePage.jsx (>8000 lignes)
3. **P3:** Corriger le bug de disparition des tables après impression bon cuisine
4. **P4:** Améliorer l'UX mobile (indicateur de défilement horizontal sur onglets)

### Fonctionnalité "Abonnements & Factures Récurrentes" ✅ (Décembre 2025)
- **Nouvel onglet "Abonnements"** pour la Gérante et l'Admin
- **Types supportés**: 
  - Clients (recettes récurrentes)
  - Fournisseurs (charges: Internet, Canal+, loyer, électricité, eau, téléphone, assurance, autre)
- **Fonctionnalités**:
  - Création/Modification/Suppression d'abonnements
  - Enregistrement des paiements avec calcul automatique de la prochaine échéance
  - Alertes visuelles : En retard (rouge), Aujourd'hui (orange), Prochains 3 jours (jaune)
  - Statistiques : Total, Clients, Fournisseurs, Charges mensuelles
  - Filtres par type et catégorie
  - Historique des paiements par abonnement
  - Icônes par catégorie (Wifi, TV, Home, Zap, etc.)

### APIs Abonnements
- `GET /api/subscriptions` - Liste avec alertes et stats
- `POST /api/subscriptions` - Créer un abonnement
- `GET /api/subscriptions/{id}` - Détails avec historique paiements
- `PUT /api/subscriptions/{id}` - Modifier
- `DELETE /api/subscriptions/{id}` - Supprimer
- `POST /api/subscriptions/{id}/pay` - Enregistrer un paiement
- `GET /api/subscriptions/alerts/summary` - Résumé alertes pour badge
- `GET /api/subscriptions/payments/history` - Historique paiements

### Fichiers créés
- `/app/backend/routers/subscriptions.py` - API backend
- `/app/frontend/src/pages/caisse/components/SubscriptionsTab.jsx` - Composant frontend
