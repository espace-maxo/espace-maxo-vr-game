# Espace Maxo - PRD

## Problem Statement
Application pour le restaurant "Espace Maxo" à Cotonou (Bénin) permettant de:
- Proposer des menus détaillés avec photos et descriptions
- Réserver des parties de jeux VR 360° et Simulateur Course
- Prix: 1.500 FCFA/partie, 500 FCFA frais de réservation
- Paiement Mobile Money (MTN, Moov, Celtiis) via Kkiapay
- Dashboard admin pour gestion des réservations
- Notifications WhatsApp automatiques

## What's Been Implemented (Février 2026)

### Phase 1 - MVP Initial
- [x] Menu complet avec catégories et vraies photos
- [x] Présentation des jeux VR et Simulateur
- [x] Réservation avec calendrier interactif
- [x] Design cyberpunk/gaming

### Phase 2 - Dashboard Admin & WhatsApp
- [x] Dashboard admin (/admin) avec statistiques
- [x] Gestion des réservations (filtres, modifier, annuler)
- [x] Liens WhatsApp click-to-chat automatiques
- [x] Vrais combos avec prix promos

### Phase 3 - Paiements Mobile Money
- [x] Intégration Kkiapay (MTN MoMo, Moov Money, Celtiis)
- [x] Widget de paiement mobile money
- [x] Mode sandbox activé (en attente activation compte)
- [x] Numéro WhatsApp unique: 01 41 47 00 00

### APIs Backend
- GET /api/menu - Liste des plats et combos
- GET /api/games - Liste des jeux
- GET /api/slots/{date} - Créneaux disponibles
- POST /api/bookings - Créer réservation
- GET /api/bookings/{id} - Détails avec lien WhatsApp
- GET /api/payment/config - Config Kkiapay
- POST /api/payment/verify - Vérifier paiement
- GET /api/payment/status/{id} - Statut paiement
- GET /api/admin/stats - Statistiques dashboard
- GET /api/admin/bookings - Toutes les réservations

## Configuration Kkiapay
Variables d'environnement à remplir après activation:
- KKIAPAY_PUBLIC_KEY
- KKIAPAY_PRIVATE_KEY
- KKIAPAY_SECRET
- KKIAPAY_SANDBOX=false (passer à false en production)

## Prioritized Backlog

### P0 (Déployé) ✅
- MVP + Admin Dashboard + Kkiapay (sandbox)

### P1 (Quand compte Kkiapay activé)
- [ ] Ajouter les clés API Kkiapay de production
- [ ] Passer KKIAPAY_SANDBOX à false
- [ ] Tester un vrai paiement

### P2 (Futur)
- [ ] Notifications SMS automatiques
- [ ] Programme fidélité
- [ ] Multi-langue

## Contact
- WhatsApp: +229 01 41 47 00 00
- Adresse: Fidjrossè Plage, rue EPP Jacquot, Cotonou
- Horaires: 10h-22h tous les jours
