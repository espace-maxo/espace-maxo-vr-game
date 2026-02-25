# Espace Maxo - PRD

## Problem Statement
Application pour le restaurant "Espace Maxo" à Cotonou (Bénin) permettant de réserver des jeux VR, payer par mobile money, et gérer les réservations.

## What's Been Implemented

### Phase 12 - Corrections (25 Feb 2026)
- **Frais de reprogrammation** : Paiement Kkiapay obligatoire si < 15 min avant session (500 FCFA)
- **Format date français** : jj/mm/aaaa partout dans l'application
- **Nouveau mot de passe admin** : Esp@ceM@xo2026

### Phase 11 - Export CSV & Refactorisation
- Export CSV (réservations, locations, fidélité)
- Refactorisation backend partielle

### Phase 10 - Suppression définitive
- Suppression des demandes de location avec confirmation

### Phase 9 - Intégration Twilio SMS
- OTP par SMS pour portefeuille
- Notifications SMS Admin (2 numéros)
- SMS de confirmation client après paiement

### Phases précédentes
- Location événementielle
- Système Provision/Portefeuille
- Reprogrammation des réservations
- MVP, Admin, Kkiapay, Fidélité, Avis

## Configuration

### Admin
- URL: /admin
- Password: **Esp@ceM@xo2026**

### Twilio SMS
- Numéros admin: +22997720808, +22991005084
- TWILIO_PHONE_NUMBER: +14475742763

### Kkiapay (Production)
- KKIAPAY_SANDBOX: false

## Frais de reprogrammation
- **Gratuit** : Si > 15 min avant la session
- **500 FCFA** : Si < 15 min avant la session (paiement Kkiapay obligatoire)
- **Maximum 1 reprogrammation** par réservation

## APIs Backend

### Reprogrammation
- POST /api/bookings/find-for-reschedule - Rechercher réservation
- POST /api/bookings/{id}/reschedule-by-client - Reprogrammer (avec payment_transaction_id si frais requis)

### Export CSV
- GET /api/admin/export/bookings
- GET /api/admin/export/location-requests
- GET /api/admin/export/loyalty

## Prioritized Backlog

### P0 (Completed)
- [x] MVP + Admin + Kkiapay
- [x] SMS OTP et notifications
- [x] Export CSV
- [x] Suppression demandes location
- [x] **Frais reprogrammation avec paiement Kkiapay**
- [x] **Format date jj/mm/aaaa**
- [x] **Nouveau mot de passe admin**

### P1 (User Action Required)
- [ ] Déploiement production - Cliquer **"Deploy"**

### P2 (Future)
- [ ] Section "À propos de nous"
- [ ] Graphiques de revenus

## Contact
- SMS Admin: +229 97 72 08 08, +229 91 00 50 84
- Adresse: Fidjrossè Plage, Cotonou
