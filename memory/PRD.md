# Espace Maxo - PRD

## Problem Statement
Application pour le restaurant "Espace Maxo" à Cotonou (Bénin) permettant de:
- Proposer des menus détaillés avec photos et descriptions
- Réserver des parties de jeux VR 360° et Simulateur Course
- Paiement Mobile Money (MTN, Moov, Celtiis) via Kkiapay
- Dashboard admin sécurisé
- Programme de fidélité automatique
- Système d'avis clients avec validation admin
- Location événementielle (anniversaires, mariages, séminaires)
- Notifications SMS automatiques aux admins et clients

## What's Been Implemented

### Core Features
- Menu complet avec catégories et photos
- Jeux VR 360° et Simulateur Course
- Réservation avec calendrier interactif
- Paiement Kkiapay (MTN, Moov, Celtiis)
- Dashboard admin sécurisé (JWT)
- Programme de fidélité (1 partie = 1 point, 10 points = 1 gratuite)
- Système d'avis avec validation
- Location événementielle avec formulaire complet

### Phase 10 - Suppression Demandes Location (25 Feb 2026)
- **Endpoint DELETE** `/api/admin/location-requests/{id}` pour supprimer définitivement
- **Bouton poubelle** dans l'admin pour chaque demande de location
- **Modal de confirmation** avant suppression définitive
- Action irréversible avec avertissement clair

### Phase 9 - Intégration Twilio SMS (25 Feb 2026)
- **OTP par SMS** pour sécuriser l'accès au portefeuille/provision
- **Notifications SMS Admin** pour : réservations, avis, locations
- **2 numéros admin** : +229 97 72 08 08, +229 91 00 50 84
- **SMS de confirmation au client** après paiement réussi

### Phase 8 - Location Événementielle (23 Feb 2026)
- Page dédiée /location avec formulaire complet
- Notification automatique à chaque nouvelle demande
- Gestion admin des demandes de location

### Phase 7 - Système Provision/Portefeuille (Dec 2025)
- Page `/provision` pour gérer son portefeuille
- Sécurisé par OTP SMS
- Recharge via MTN MoMo, Moov Money, Celtiis

### Phase 6 - Reprogrammation (Dec 2025)
- Page `/reprogrammer` accessible depuis navbar et footer
- Client et Admin peuvent reprogrammer

### Refactorisation Backend (25 Feb 2026)
- Création structure modulaire :
  - `/backend/models/__init__.py` - Tous les modèles Pydantic
  - `/backend/services/sms_service.py` - Services SMS Twilio
  - `/backend/routers/` - (prévu) Routes séparées

## Configuration

### Twilio SMS
- TWILIO_ACCOUNT_SID: AC1658d13a8d79989f96d5079ca0bd79a0
- TWILIO_VERIFY_SERVICE_SID: VA95338ebd8fe9ee36d1348df714a29e65
- TWILIO_PHONE_NUMBER: +14475742763
- Numéros admin: +22997720808, +22991005084

### Kkiapay (Production)
- KKIAPAY_PUBLIC_KEY: 4b3fe59844c0f4291c1b285a9485024a1d668c96
- KKIAPAY_SANDBOX: false

### Admin
- URL: /admin
- Password: Nikeland2016

## APIs Backend

### Location Requests (Admin)
- GET /api/admin/location-requests - Liste des demandes
- PUT /api/admin/location-requests/{id} - Mettre à jour statut
- DELETE /api/admin/location-requests/{id} - Supprimer définitivement

### Wallet/OTP
- POST /api/wallet/send-otp - Envoyer OTP par SMS
- POST /api/wallet/verify-otp - Vérifier OTP
- GET /api/wallet/{phone}/secure - Accès sécurisé au portefeuille
- POST /api/wallet/topup - Recharger le portefeuille

### Réservations
- POST /api/bookings - Créer réservation
- DELETE /api/admin/bookings/{id} - Supprimer définitivement

### Paiement
- GET /api/payment/config - Configuration Kkiapay
- POST /api/payment/verify - Vérifier paiement (déclenche SMS)

## Frontend Routes
- `/` - Accueil
- `/menu` - Menu restaurant
- `/games` - Jeux VR
- `/booking` - Réservation
- `/provision` - Portefeuille client
- `/reprogrammer` - Reprogrammation
- `/location` - Location événementielle
- `/avis` - Témoignages
- `/admin` - Connexion admin
- `/admin/dashboard` - Dashboard admin

## Prioritized Backlog

### P0 (Completed)
- [x] MVP + Admin + Kkiapay
- [x] Sécurité admin (JWT)
- [x] Programme de fidélité
- [x] Système d'avis
- [x] Location événementielle
- [x] Reprogrammation des réservations
- [x] Système de Provision/Portefeuille
- [x] OTP SMS via Twilio
- [x] Notifications SMS Admin (2 numéros)
- [x] SMS confirmation au client après paiement
- [x] Suppression définitive des demandes de location

### P1 (User Action Required)
- [ ] Déploiement production - Cliquer bouton **"Deploy"** pour mettre à jour espacemaxo.com

### P2 (Future)
- [ ] Section "À propos de nous" avec histoire d'Espace Maxo
- [ ] Refactorisation complète server.py en routers séparés

## Contact
- SMS Admin: +229 97 72 08 08, +229 91 00 50 84
- Adresse: Fidjrossè Plage, Cotonou
- Horaires: 9h - 23h
