# Espace Maxo - PRD

## Problem Statement
Application pour le restaurant "Espace Maxo" à Cotonou (Bénin) permettant de:
- Proposer des menus détaillés avec photos et descriptions
- Réserver des parties de jeux VR 360° et Simulateur Course
- Prix: 1.500 FCFA/partie, 500 FCFA frais de réservation
- Paiement Mobile Money (MTN, Moov, Celtiis) via Kkiapay
- Dashboard admin sécurisé pour gestion des réservations
- Notifications WhatsApp automatiques

## What's Been Implemented

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
- [x] Clés de production configurées
- [x] Numéro WhatsApp unique: 01 41 47 00 00

### Phase 4 - Galerie & Mises à jour (20 Feb 2026)
- [x] Galerie d'images intérieures du restaurant (5 photos)
- [x] Mise à jour des heures d'ouverture: 9h - 23h tous les jours
- [x] Lightbox interactif (zoom, navigation flèches, miniatures)
- [x] Page témoignages clients (/avis) avec 6 avis exemples
- [x] Section témoignages sur la page d'accueil (3 avis + statistiques)
- [x] Intégration Google Maps (section "Trouvez-nous à Cotonou")
- [x] Boutons "Itinéraire" et "WhatsApp" rapides
- [x] Blocage des créneaux horaires passés sur la page de réservation

### Phase 5 - Sécurité & Validation (23 Feb 2026)
- [x] **Authentification admin sécurisée via JWT** 
  - Mot de passe hashé avec bcrypt stocké en backend (.env)
  - Génération de tokens JWT avec expiration 24h
  - Protection de toutes les routes admin avec middleware
  - Déconnexion avec suppression du token
- [x] **Validation du format téléphone**
  - Format requis: 01XXXXXXXX (10 chiffres commençant par 01)
  - Indicateur visuel de validation (vert=valide, jaune=invalide)
  - Blocage du bouton "Continuer" si format invalide

### APIs Backend
- GET /api/menu - Liste des plats et combos
- GET /api/games - Liste des jeux
- GET /api/slots/{date} - Créneaux disponibles
- POST /api/bookings - Créer réservation
- GET /api/bookings/{id} - Détails avec lien WhatsApp
- GET /api/payment/config - Config Kkiapay
- POST /api/payment/verify - Vérifier paiement
- GET /api/payment/status/{id} - Statut paiement
- **POST /api/auth/admin-login - Authentification admin (retourne JWT)**
- **GET /api/auth/verify - Vérifier validité du token**
- GET /api/admin/stats - Statistiques dashboard (protégé JWT)
- GET /api/admin/bookings - Toutes les réservations (protégé JWT)
- PUT /api/admin/bookings/{id} - Modifier réservation (protégé JWT)
- DELETE /api/admin/bookings/{id} - Annuler réservation (protégé JWT)

## Configuration

### Kkiapay (Production)
- KKIAPAY_PUBLIC_KEY: Configuré
- KKIAPAY_PRIVATE_KEY: Configuré
- KKIAPAY_SECRET: Configuré
- KKIAPAY_SANDBOX: false

### Admin Authentication
- ADMIN_PASSWORD_HASH: bcrypt hash du mot de passe
- JWT_SECRET_KEY: Clé secrète pour tokens JWT
- Password: Nikeland2016

## Prioritized Backlog

### P0 (Completed) ✅
- [x] MVP + Admin Dashboard + Kkiapay production
- [x] Sécurité admin (JWT backend)
- [x] Format téléphone 10 chiffres

### P1 (Blocked - User Action Required)
- [ ] Domaine personnalisé (www.espacemaxo.com) - DNS à configurer
- [ ] Déploiement production - Cliquer sur "Deploy"

### P2 (Future)
- [ ] Section "À propos" de Espace Maxo
- [ ] Notifications SMS automatiques
- [ ] Programme fidélité
- [ ] Multi-langue

## Contact
- WhatsApp: +229 01 41 47 00 00
- Adresse: Fidjrossè Plage, rue EPP Jacquot, Cotonou
- Horaires: 9h - 23h tous les jours
