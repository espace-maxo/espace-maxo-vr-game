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
- Notifications SMS automatiques aux admins

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

### Phase 9 - Intégration Twilio SMS (25 Feb 2026)
- **OTP par SMS** pour sécuriser l'accès au portefeuille/provision
  - Utilise Twilio Verify API
  - Code à 6 chiffres envoyé par SMS
  - Remplace l'ancien système WhatsApp (CallMeBot)
- **Notifications SMS Admin** pour :
  - Nouvelles réservations payées
  - Nouveaux avis clients
  - Nouvelles demandes de location
- **2 numéros admin configurés** :
  - +229 97 72 08 08
  - +229 91 00 50 84

### Phase 8 - Location Événementielle (23 Feb 2026)
- Page dédiée /location avec formulaire complet
- Notification automatique à chaque nouvelle demande
- Gestion admin des demandes de location

### Phase 7 - Système Provision/Portefeuille (Dec 2025)
- Page `/provision` pour gérer son portefeuille
- Sécurisé par OTP SMS
- Recharge via MTN MoMo, Moov Money, Celtiis
- Historique des transactions
- Affichage des points de fidélité

### Phase 6 - Reprogrammation (Dec 2025)
- Page `/reprogrammer` accessible depuis navbar et footer
- Client et Admin peuvent reprogrammer
- Gratuit si > 15 min avant session

## Configuration

### Twilio SMS
- TWILIO_ACCOUNT_SID: AC1658d13a8d79989f96d5079ca0bd79a0
- TWILIO_VERIFY_SERVICE_SID: VA95338ebd8fe9ee36d1348df714a29e65
- TWILIO_PHONE_NUMBER: +14475742763
- Numéros admin: +22997720808, +22991005084

### Kkiapay (Production)
- Clés configurées
- KKIAPAY_SANDBOX: false

### Admin
- URL: /admin
- Password: Nikeland2016

## APIs Backend

### Wallet/OTP
- POST /api/wallet/send-otp - Envoyer OTP par SMS
- POST /api/wallet/verify-otp - Vérifier OTP
- GET /api/wallet/{phone}/secure - Accès sécurisé au portefeuille
- POST /api/wallet/topup - Recharger le portefeuille

### Réservations
- POST /api/bookings - Créer réservation
- POST /api/bookings/find-for-reschedule - Trouver réservation
- POST /api/bookings/reschedule-by-user - Reprogrammer (client)
- POST /api/bookings/{id}/reschedule-admin - Reprogrammer (admin)

### Admin
- POST /api/admin/login - Connexion admin
- GET /api/admin/bookings - Liste réservations
- DELETE /api/admin/bookings/{id} - Supprimer définitivement
- GET /api/admin/location-requests - Demandes de location

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

### P1 (User Action Required)
- [ ] Déploiement production - Cliquer bouton **"Deploy"** pour mettre à jour espacemaxo.com

### P2 (Future)
- [ ] Section "À propos de nous" avec histoire d'Espace Maxo
- [ ] Refactorisation server.py en modules séparés

## Contact
- SMS Admin: +229 97 72 08 08, +229 91 00 50 84
- Adresse: Fidjrossè Plage, Cotonou
- Horaires: 9h - 23h
