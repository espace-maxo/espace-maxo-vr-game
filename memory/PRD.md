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
- Export CSV des données pour comptabilité

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

### Phase 11 - Export CSV & Refactorisation (25 Feb 2026)
- **Export CSV Réservations** : `/api/admin/export/bookings`
- **Export CSV Demandes de Location** : `/api/admin/export/location-requests`
- **Export CSV Fidélité** : `/api/admin/export/loyalty`
- **Boutons d'export** dans chaque onglet du dashboard admin
- **Refactorisation partielle** :
  - `/backend/config.py` - Configuration centralisée
  - `/backend/auth.py` - Authentification JWT
  - `/backend/models/__init__.py` - Modèles Pydantic
  - `/backend/services/sms_service.py` - Services SMS Twilio
  - `/backend/routers/export.py` - Routes d'export (référence)

### Phase 10 - Suppression Demandes Location (25 Feb 2026)
- Endpoint DELETE pour supprimer définitivement les demandes
- Bouton poubelle dans l'admin avec modal de confirmation

### Phase 9 - Intégration Twilio SMS (25 Feb 2026)
- OTP par SMS pour sécuriser l'accès au portefeuille
- Notifications SMS Admin (2 numéros)
- SMS de confirmation au client après paiement

### Phases Précédentes
- Phase 8: Location événementielle
- Phase 7: Système Provision/Portefeuille
- Phase 6: Reprogrammation des réservations
- Phases 1-5: MVP, Admin, Kkiapay, Fidélité, Avis

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

### Export CSV (Admin)
- GET /api/admin/export/bookings - Export réservations
- GET /api/admin/export/location-requests - Export demandes location
- GET /api/admin/export/loyalty - Export comptes fidélité

### Location Requests (Admin)
- GET /api/admin/location-requests - Liste des demandes
- PUT /api/admin/location-requests/{id} - Mettre à jour statut
- DELETE /api/admin/location-requests/{id} - Supprimer définitivement

### Wallet/OTP
- POST /api/wallet/send-otp - Envoyer OTP par SMS
- POST /api/wallet/verify-otp - Vérifier OTP

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
- [x] Export CSV (réservations, locations, fidélité)
- [x] Refactorisation backend (partielle)

### P1 (User Action Required)
- [ ] Déploiement production - Cliquer bouton **"Deploy"** pour mettre à jour espacemaxo.com

### P2 (Future)
- [ ] Section "À propos de nous" avec histoire d'Espace Maxo
- [ ] Export Excel (format .xlsx) en plus du CSV

## Architecture Backend

```
/app/backend/
├── server.py          # Point d'entrée principal (~2400 lignes)
├── config.py          # Configuration centralisée
├── auth.py            # Authentification JWT
├── models/
│   └── __init__.py    # Modèles Pydantic
├── services/
│   ├── __init__.py
│   └── sms_service.py # Services SMS Twilio
└── routers/
    └── export.py      # Routes d'export (référence)
```

## Contact
- SMS Admin: +229 97 72 08 08, +229 91 00 50 84
- Adresse: Fidjrossè Plage, Cotonou
- Horaires: 9h - 23h
