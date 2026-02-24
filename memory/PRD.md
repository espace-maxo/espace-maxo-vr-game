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
- Notifications WhatsApp automatiques

## What's Been Implemented

### Core Features ✅
- Menu complet avec catégories et photos
- Jeux VR 360° et Simulateur Course
- Réservation avec calendrier interactif
- Paiement Kkiapay (MTN, Moov, Celtiis)
- Dashboard admin sécurisé (JWT)
- Programme de fidélité (1 partie = 1 point, 10 points = 1 gratuite)
- Système d'avis avec validation
- Notifications WhatsApp (avis, locations)

### Phase 8 - Location Événementielle (23 Feb 2026) ✅
- **Page dédiée /location** avec formulaire complet :
  - Section 1: Informations du demandeur (nom, téléphone, email, entreprise)
  - Section 2: Informations événement (type, date, horaires, invités)
  - Section 3: Formule souhaitée (location simple, +restauration, +boissons, personnalisée)
  - Section 4: Budget estimatif (4 tranches de 300k à +1.5M FCFA)
  - Section 5: Services additionnels (DJ, décoration, vidéoprojecteur, photographe, etc.)
  - Section 6: Message complémentaire + validation
- **Section sur la page d'accueil** avec bouton "Demander un devis"
- **Notification WhatsApp automatique** à chaque nouvelle demande
- **Gestion admin** des demandes de location

### APIs Backend
- POST /api/location-requests - Soumettre demande de location
- GET /api/admin/location-requests - Liste des demandes (protégé)
- PUT /api/admin/location-requests/{id} - Mettre à jour statut (protégé)

## Configuration

### CallMeBot WhatsApp
- CALLMEBOT_API_KEY: 9381691
- Numéro admin: 01 41 47 00 00

### Kkiapay (Production)
- Clés configurées
- KKIAPAY_SANDBOX: false

### Admin
- Password: Nikeland2016

## Prioritized Backlog

### P0 (Completed) ✅
- [x] MVP + Admin + Kkiapay
- [x] Sécurité admin (JWT)
- [x] Programme de fidélité
- [x] Système d'avis
- [x] Notifications WhatsApp
- [x] Location événementielle
- [x] Texte "Carte de menus à consulter sur place" sur page Menu (Dec 2025)
- [x] Onglet admin "Location" pour gérer les demandes de location (Dec 2025)

### P1 (User Action Required)
- [ ] Domaine (www.espacemaxo.com) - Configurer DNS
- [ ] Déploiement production - Cliquer bouton **"Deploy"**

### P2 (Future)
- [ ] Section "À propos de nous" avec histoire d'Espace Maxo
- [ ] Notifications WhatsApp pour réservations payées

## Contact
- WhatsApp: +229 01 41 47 00 00
- Adresse: Fidjrossè Plage, Cotonou
- Horaires: 9h - 23h
