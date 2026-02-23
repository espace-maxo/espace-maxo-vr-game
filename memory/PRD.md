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
- **Formulaire "Laissez votre avis"** sur la page /avis
  - Champs: Nom, Note (étoiles), Commentaire
  - Soumission avec validation
- **Gestion admin des avis**
  - Onglet "Avis" dans le dashboard admin
  - Badge notification pour avis en attente
  - Boutons Approuver / Rejeter / Supprimer
  - Statistiques en temps réel
- **Affichage public**
  - Seuls les avis approuvés sont visibles
  - Témoignages par défaut si aucun avis approuvé

### APIs Backend - Avis
- POST /api/reviews - Soumettre un avis (status: pending)
- GET /api/reviews - Récupérer les avis approuvés (public)
- GET /api/admin/reviews - Tous les avis (protégé)
- PUT /api/admin/reviews/{id} - Approuver/Rejeter (protégé)
- DELETE /api/admin/reviews/{id} - Supprimer (protégé)

## Prioritized Backlog

### P0 (Completed) ✅
- [x] MVP + Admin Dashboard + Kkiapay
- [x] Sécurité admin (JWT backend)
- [x] Programme de fidélité
- [x] Système d'avis avec validation

### P1 (Blocked - User Action Required)
- [ ] Domaine personnalisé (www.espacemaxo.com) - DNS à configurer
- [ ] Déploiement production - Cliquer sur "Deploy"

### P2 (Future)
- [ ] Section "À propos" de Espace Maxo
- [ ] Interface pour utiliser les parties gratuites lors de la réservation
- [ ] Notifications SMS automatiques

## Contact
- WhatsApp: +229 01 41 47 00 00
- Adresse: Fidjrossè Plage, rue EPP Jacquot, Cotonou
- Horaires: 9h - 23h tous les jours
