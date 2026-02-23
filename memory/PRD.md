# Espace Maxo - PRD

## Problem Statement
Application pour le restaurant "Espace Maxo" à Cotonou (Bénin) permettant de:
- Proposer des menus détaillés avec photos et descriptions
- Réserver des parties de jeux VR 360° et Simulateur Course
- Prix: 1.500 FCFA/partie, 500 FCFA frais de réservation
- Paiement Mobile Money (MTN, Moov, Celtiis) via Kkiapay
- Dashboard admin sécurisé pour gestion des réservations
- Programme de fidélité automatique
- Système d'avis clients avec validation admin
- Notifications WhatsApp automatiques

## What's Been Implemented

### Phase 1-4 - MVP et Fonctionnalités de base ✅
- Menu complet avec catégories et photos
- Présentation des jeux VR et Simulateur
- Réservation avec calendrier interactif
- Dashboard admin avec statistiques
- Intégration Kkiapay (production)
- Galerie d'images avec lightbox
- Page témoignages et Google Maps

### Phase 5 - Sécurité (23 Feb 2026) ✅
- Authentification admin sécurisée via JWT (bcrypt + tokens)
- Validation du format téléphone (01XXXXXXXX)

### Phase 6 - Programme de Fidélité (23 Feb 2026) ✅
- 1 partie = 1 point, 10 points = 1 partie gratuite
- Carte fidélité sur page de réservation
- Onglet Fidélité dans l'admin dashboard

### Phase 7 - Système d'Avis (23 Feb 2026) ✅
- Formulaire "Laissez votre avis" sur la page /avis
- Gestion admin des avis (approuver/rejeter/supprimer)
- Badge notification pour avis en attente
- **Notification WhatsApp automatique** via CallMeBot
  - Envoi instantané à chaque nouvel avis soumis
  - Message formaté avec nom, note, commentaire

## Configuration

### CallMeBot WhatsApp
- CALLMEBOT_API_KEY: Configuré
- Numéro admin: 01 41 47 00 00

### Kkiapay (Production)
- KKIAPAY_PUBLIC_KEY: Configuré
- KKIAPAY_PRIVATE_KEY: Configuré
- KKIAPAY_SECRET: Configuré
- KKIAPAY_SANDBOX: false

### Admin Authentication
- ADMIN_PASSWORD_HASH: bcrypt hash
- JWT_SECRET_KEY: Configuré
- Password: Nikeland2016

## Prioritized Backlog

### P0 (Completed) ✅
- [x] MVP + Admin Dashboard + Kkiapay
- [x] Sécurité admin (JWT backend)
- [x] Programme de fidélité
- [x] Système d'avis avec validation
- [x] Notifications WhatsApp pour nouveaux avis

### P1 (Blocked - User Action Required)
- [ ] Domaine personnalisé (www.espacemaxo.com) - DNS à configurer
- [ ] Déploiement production - Cliquer sur "Deploy"

### P2 (Future)
- [ ] Section "À propos" de Espace Maxo
- [ ] Interface pour utiliser les parties gratuites
- [ ] Notifications WhatsApp pour nouvelles réservations

## Contact
- WhatsApp: +229 01 41 47 00 00
- Adresse: Fidjrossè Plage, rue EPP Jacquot, Cotonou
- Horaires: 9h - 23h tous les jours
