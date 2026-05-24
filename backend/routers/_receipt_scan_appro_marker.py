"""Endpoint séparé : POST /api/receipt-scan/to-appro
Lit un reçu et insère les articles directement dans la liste Appro Manager
(shopping_list_items, scope=restaurant, statut=pending) — au lieu de
créer immédiatement une demande d'achat.
"""
# (vide — la logique est inline dans receipt_scan.py)
