/**
 * Taxonomy for the Achats / Paiements module.
 *
 * - EXPENSE_TYPES        : top-level "Achat" vs "Paiement"
 *   • Achat   → flux qui alimente le Stock (matières, ingrédients, conso bar…)
 *   • Paiement → flux qui ne touche PAS le Stock (loyer, salaires, électricité…)
 *
 * - DESTINATIONS         : où va la dépense (Cuisine, Bar, Salle, Jeux VR, Jardin, Administratif)
 *
 * - PREDEFINED_PAYMENTS  : libellés prédéfinis (typologie restauration + jeux VR)
 *   organisés en groupes pour faciliter le choix par la responsable op. & log.
 */

export const EXPENSE_TYPES = [
  { value: "achat",    label: "Achat",    icon: "🛒", desc: "Approvisionnement (impacte le stock)" },
  { value: "paiement", label: "Paiement", icon: "💳", desc: "Charge / Service (sans impact stock)" },
];

export const DESTINATIONS = [
  { value: "cuisine",        label: "Cuisine",       icon: "🍳" },
  { value: "bar",            label: "Bar",           icon: "🍹" },
  { value: "salle",          label: "Salle",         icon: "🪑" },
  { value: "jeux_vr",        label: "Jeux VR",       icon: "🎮" },
  { value: "jardin",         label: "Jardin",        icon: "🌳" },
  { value: "administratif",  label: "Administratif", icon: "📋" },
];

/**
 * Liste prédéfinie pour les PAIEMENTS d'un restaurant + bar + jeux VR.
 * Chaque entrée fournit un libellé prêt à l'emploi et la destination la plus probable.
 */
export const PREDEFINED_PAYMENTS = [
  // Charges fixes
  { group: "Charges fixes", label: "Loyer du local",                 destination: "administratif" },
  { group: "Charges fixes", label: "Électricité (SBEE)",             destination: "administratif" },
  { group: "Charges fixes", label: "Eau (SONEB)",                    destination: "administratif" },
  { group: "Charges fixes", label: "Internet / WiFi",                destination: "administratif" },
  { group: "Charges fixes", label: "Téléphone",                      destination: "administratif" },
  { group: "Charges fixes", label: "Assurance",                      destination: "administratif" },
  { group: "Charges fixes", label: "Sécurité / Gardiennage",         destination: "administratif" },

  // Personnel
  { group: "Personnel",     label: "Salaires personnel",             destination: "administratif" },
  { group: "Personnel",     label: "Pourboires reversés",            destination: "salle" },
  { group: "Personnel",     label: "Uniformes / Tenues",             destination: "salle" },
  { group: "Personnel",     label: "Formation personnel",            destination: "administratif" },
  { group: "Personnel",     label: "Frais médicaux personnel",       destination: "administratif" },
  { group: "Personnel",     label: "Transport personnel",            destination: "administratif" },

  // Maintenance
  { group: "Maintenance",   label: "Maintenance casques VR",         destination: "jeux_vr" },
  { group: "Maintenance",   label: "Maintenance frigos / clim.",     destination: "cuisine" },
  { group: "Maintenance",   label: "Maintenance plomberie",          destination: "administratif" },
  { group: "Maintenance",   label: "Maintenance électrique",         destination: "administratif" },
  { group: "Maintenance",   label: "Maintenance bâtiment / peinture",destination: "administratif" },
  { group: "Maintenance",   label: "Réparations diverses",           destination: "administratif" },

  // Administratif
  { group: "Administratif", label: "Honoraires comptable",           destination: "administratif" },
  { group: "Administratif", label: "Impôts / TPS / Patente",         destination: "administratif" },
  { group: "Administratif", label: "Frais bancaires",                destination: "administratif" },
  { group: "Administratif", label: "Frais Mobile Money",             destination: "administratif" },
  { group: "Administratif", label: "Abonnements logiciels",          destination: "administratif" },

  // Approvisionnement non-stock
  { group: "Approvisionnement non-stock", label: "Carburant groupe électrogène", destination: "administratif" },
  { group: "Approvisionnement non-stock", label: "Bouteilles de gaz (échange)",  destination: "cuisine" },
  { group: "Approvisionnement non-stock", label: "Produits d'entretien",         destination: "salle" },
  { group: "Approvisionnement non-stock", label: "Lessive / Blanchisserie",      destination: "salle" },
  { group: "Approvisionnement non-stock", label: "Petit matériel cuisine",       destination: "cuisine" },
  { group: "Approvisionnement non-stock", label: "Vaisselle / Verres / Couverts",destination: "salle" },
  { group: "Approvisionnement non-stock", label: "Décoration / Aménagement",     destination: "salle" },

  // Commercial & Divers
  { group: "Commercial & Divers", label: "Marketing / Publicité",     destination: "administratif" },
  { group: "Commercial & Divers", label: "Cadeaux clients",           destination: "salle" },
  { group: "Commercial & Divers", label: "Animations / Événements",   destination: "salle" },
  { group: "Commercial & Divers", label: "Don / Dédommagement client",destination: "salle" },
  { group: "Commercial & Divers", label: "Frais divers / Autres",     destination: "administratif" },
];

export const PAYMENT_GROUPS = [...new Set(PREDEFINED_PAYMENTS.map(p => p.group))];

export const getDestinationLabel = (value) => {
  const d = DESTINATIONS.find(x => x.value === value);
  return d ? `${d.icon} ${d.label}` : (value || "—");
};

export const getTypeLabel = (value) => {
  const t = EXPENSE_TYPES.find(x => x.value === value);
  return t ? `${t.icon} ${t.label}` : (value || "—");
};
