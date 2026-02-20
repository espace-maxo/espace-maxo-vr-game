# Espace Maxo - PRD

## Problem Statement
Application pour le restaurant "Espace Maxo" à Cotonou (Bénin) permettant de:
- Proposer des menus détaillés avec photos et descriptions
- Réserver des parties de jeux VR 360° et Simulateur Course
- Prix: 1.500 FCFA/partie, 500 FCFA frais de réservation
- Paiement en ligne via Stripe
- Dashboard admin pour gestion des réservations
- Notifications WhatsApp automatiques

## User Personas
1. **Clients** - Réservation de sessions gaming + repas
2. **Admin/Gérant** - Gestion des réservations et statistiques

## What's Been Implemented (Février 2026)

### Phase 1 - MVP Initial
- [x] Menu complet avec catégories
- [x] Présentation des jeux VR et Simulateur
- [x] Réservation avec calendrier interactif
- [x] Paiement Stripe (mode test)
- [x] Design cyberpunk/gaming

### Phase 2 - Dashboard Admin & WhatsApp
- [x] Dashboard admin (/admin) avec statistiques complètes
- [x] Gestion des réservations (filtres, modifier, annuler)
- [x] Liens WhatsApp click-to-chat automatiques
- [x] Vrais combos avec images client:
  - Super Combo Solo: 3.500 FCFA
  - Super Combo 2P: 6.000 FCFA (était 9.000)
  - Super Combo 2P Premium: 9.000 FCFA (était 11.500)
  - Combo 4P: 16.000 FCFA (était 21.000)
- [x] Photos réelles de l'établissement
- [x] Adresse mise à jour: Fidjrossè Plage, rue EPP Jacquot

### APIs Backend
- GET /api/menu - Liste des plats et combos
- GET /api/games - Liste des jeux
- GET /api/slots/{date} - Créneaux disponibles
- POST /api/bookings - Créer réservation
- GET /api/bookings/{id} - Détails avec lien WhatsApp
- POST /api/checkout/create - Session Stripe
- GET /api/admin/stats - Statistiques dashboard
- GET /api/admin/bookings - Toutes les réservations
- PUT /api/admin/bookings/{id} - Modifier statut
- DELETE /api/admin/bookings/{id} - Annuler
- GET /api/whatsapp/booking/{id} - Liens WhatsApp

## Prioritized Backlog

### P0 (Déployé) ✅
- MVP complet + Admin Dashboard + WhatsApp

### P1 (Prochaine phase)
- [ ] Clé Stripe production (quand client prêt)
- [ ] Notifications push/email
- [ ] Historique client

### P2 (Futur)
- [ ] Programme fidélité
- [ ] Intégration Twilio WhatsApp API
- [ ] Multi-langue

## Contact Info
- Adresse: Fidjrossè Plage, non loin salle des fêtes Majesctic, rue EPP Jacquot
- Tel: +229 01 41 47 00 00 / +229 01 62 39 62 39
- Horaires: 10h-22h tous les jours
