# Espace Maxo - PRD

## Problem Statement
Application pour le restaurant "Espace Maxo" à Cotonou (Bénin) permettant de:
- Proposer des menus détaillés avec photos et descriptions
- Réserver des parties de jeux VR 360° et Simulateur Course SONY
- Prix: 1.500 FCFA/partie, 500 FCFA frais de réservation
- Paiement en ligne via Stripe

## User Personas
1. **Jeunes adultes (18-35 ans)** - Passionnés de gaming cherchant une expérience VR
2. **Familles** - Parents avec enfants souhaitant une sortie divertissante
3. **Groupes d'amis** - Réservations pour sessions gaming

## Core Requirements
- Menu du restaurant avec catégories et prix
- Présentation des jeux (VR 360°, Simulateur Course)
- Calendrier interactif de réservation
- Formulaire simple (sans authentification)
- Paiement Stripe pour frais de réservation
- Design cyberpunk/gaming

## What's Been Implemented (January 2026)

### Backend (FastAPI + MongoDB)
- [x] API Menu (/api/menu) - CRUD complet
- [x] API Games (/api/games)
- [x] API Slots (/api/slots/{date}) - Créneaux disponibles
- [x] API Bookings (/api/bookings) - Création réservation
- [x] API Checkout (/api/checkout/create) - Session Stripe
- [x] API Status (/api/checkout/status/{session_id})
- [x] Webhook Stripe (/api/webhook/stripe)
- [x] Collection payment_transactions

### Frontend (React + Tailwind)
- [x] HomePage - Hero section, features, CTA
- [x] MenuPage - Grille de plats avec filtres catégories
- [x] GamesPage - Présentation VR et Simulateur
- [x] BookingPage - Formulaire 3 étapes avec calendrier
- [x] ConfirmationPage - Polling statut paiement
- [x] Navbar + Footer avec infos contact
- [x] Design cyberpunk (Orbitron, neon colors)

### Intégrations
- [x] Stripe Checkout (test mode)
- [x] MongoDB (données seed automatiques)

## Prioritized Backlog

### P0 (Déployé)
- ✅ MVP complet

### P1 (Prochaine phase)
- [ ] Admin dashboard pour gérer réservations
- [ ] Notifications WhatsApp automatiques
- [ ] Galerie photos de l'établissement

### P2 (Futur)
- [ ] Programme de fidélité
- [ ] Système d'avis clients
- [ ] Multi-langue (Français/Anglais)

## Contact Info
- Adresse: Rue allant à la pharmacie Fidjrossè Plage, Cotonou
- Tel: 0141470000 / 0162396239
- Horaires: 10h-22h tous les jours
