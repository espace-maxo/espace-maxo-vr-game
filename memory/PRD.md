# Espace Maxo - PRD

## Problem Statement
Application pour le restaurant "Espace Maxo" à Cotonou (Bénin) permettant de réserver des jeux VR, payer par mobile money, commander des combos avec session de jeu, réserver des tables avec acompte, et gérer les réservations.

## What's Been Implemented

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

### Nouvelles APIs (Phase 15)
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
│   ├── server.py
│   └── tests/
│       └── test_combo_table.py
└── frontend/
    ├── .env
    ├── package.json
    └── src/
        ├── App.js
        ├── components/
        │   ├── Navbar.jsx
        │   └── ...
        └── pages/
            ├── AdminPage.jsx
            ├── BookingPage.jsx
            ├── DeliveryPage.jsx
            ├── HomePage.jsx
            ├── MenuPage.jsx (Combos uniquement)
            ├── RejoindrePage.jsx
            ├── TableReservationPage.jsx (NOUVEAU)
            └── WalletPage.jsx
```

## Contact
- SMS Admin: +229 97 72 08 08, +229 91 00 50 84
- Adresse: Fidjrossè Plage, Cotonou
