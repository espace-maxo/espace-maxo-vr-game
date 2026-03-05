# Espace Maxo - PRD

## Problem Statement
Application pour le restaurant "Espace Maxo" à Cotonou (Bénin) permettant de réserver des jeux VR, payer par mobile money, commander des combos avec session de jeu, réserver des tables avec acompte, gérer les réservations, et gérer un système de facturation POS interne.

## What's Been Implemented

### Phase 16 - Logiciel Caisse Pro (Mars 2026)
- **Système POS Complet** : `/caisse` - Application standalone de facturation
  - Connexion par mot de passe (Caisse2026 ou Esp@ceM@xo2026)
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
  - Gestion multi-utilisateurs (serveurs, managers, admins)
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

### P1 (User Action Required)
- [ ] Déploiement production - Cliquer **"Deploy"**
- [ ] Tester SMS de confirmation client après paiement

### P2 (Future)
- [ ] Section "À propos de nous"
- [ ] Graphiques de revenus
- [ ] Refactorisation de `server.py` (2500+ lignes)
- [ ] Refactorisation de `AdminPage.jsx` (1500+ lignes)

## Architecture

```
/app/
├── backend/
│   ├── .env
│   ├── requirements.txt
│   ├── server.py (~3700 lignes)
│   └── tests/
│       ├── test_combo_table.py
│       └── test_caisse.py (NOUVEAU)
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
            ├── CaissePage.jsx (NOUVEAU - POS System)
            ├── DeliveryPage.jsx
            ├── HomePage.jsx
            ├── MenuPage.jsx (Combos uniquement)
            ├── RejoindrePage.jsx
            ├── TableReservationPage.jsx
            └── WalletPage.jsx
```

## Contact
- SMS Admin: +229 97 72 08 08, +229 91 00 50 84
- Adresse: Fidjrossè Plage, Cotonou
