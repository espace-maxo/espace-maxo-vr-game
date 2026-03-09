import { 
  TreePine, Gamepad2, Wine, Calendar, Package, UtensilsCrossed,
  Banknote, CreditCard, Smartphone, Wallet
} from "lucide-react";

// API Base URL
export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Department configuration
export const DEPARTMENT_CONFIG = {
  salle_jardin: {
    label: "Salle & Jardin",
    icon: TreePine,
    color: "text-green-400",
    bgColor: "bg-green-900/30",
    borderColor: "border-green-500/50"
  },
  jeux: {
    label: "Jeux",
    icon: Gamepad2,
    color: "text-blue-400",
    bgColor: "bg-blue-900/30",
    borderColor: "border-blue-500/50"
  },
  bar: {
    label: "Bar",
    icon: Wine,
    color: "text-orange-400",
    bgColor: "bg-orange-900/30",
    borderColor: "border-orange-500/50"
  },
  accompagnements: {
    label: "Accompagnements",
    icon: UtensilsCrossed,
    color: "text-yellow-400",
    bgColor: "bg-yellow-900/30",
    borderColor: "border-yellow-500/50"
  },
  location: {
    label: "Location",
    icon: Calendar,
    color: "text-purple-400",
    bgColor: "bg-purple-900/30",
    borderColor: "border-purple-500/50"
  },
  autres: {
    label: "Autres",
    icon: Package,
    color: "text-slate-400",
    bgColor: "bg-slate-700/30",
    borderColor: "border-slate-500/50"
  }
};

// Payment methods
export const PAYMENT_METHODS = [
  { value: "cash", label: "Espèces", icon: Banknote },
  { value: "card", label: "Carte", icon: CreditCard },
  { value: "mobile", label: "Mobile", icon: Smartphone },
  { value: "wallet", label: "Crédit", icon: Wallet }
];

// Default catalog items
export const DEFAULT_CATALOG = {
  salle_jardin: [
    { id: "poulet_braise", name: "Poulet braisé", price: 3500, unit: "portion", category: "Viandes" },
    { id: "poisson_braise", name: "Poisson braisé", price: 4000, unit: "portion", category: "Poissons" },
    { id: "riz_sauce", name: "Riz sauce", price: 1500, unit: "plat", category: "Accompagnements" },
    { id: "pate_rouge", name: "Pâte rouge", price: 1200, unit: "plat", category: "Accompagnements" },
    { id: "salade", name: "Salade composée", price: 1500, unit: "plat", category: "Entrées" },
    { id: "soupe", name: "Soupe de légumes", price: 1000, unit: "bol", category: "Entrées" },
    { id: "spaghetti", name: "Spaghetti bolognaise", price: 2500, unit: "plat", category: "Pâtes" },
    { id: "pizza", name: "Pizza Margherita", price: 3500, unit: "unité", category: "Pizzas" },
    { id: "burger", name: "Burger classique", price: 3000, unit: "unité", category: "Fast Food" },
    { id: "frites", name: "Frites", price: 1000, unit: "portion", category: "Accompagnements" },
    { id: "omelette", name: "Omelette", price: 1500, unit: "plat", category: "Oeufs" },
    { id: "viande_grillee", name: "Viande grillée", price: 4500, unit: "portion", category: "Viandes" },
    { id: "brochettes", name: "Brochettes (3 pcs)", price: 2500, unit: "assiette", category: "Grillades" },
    { id: "thiep", name: "Thiep bou dien", price: 3000, unit: "plat", category: "Spécialités" },
    { id: "yassa", name: "Yassa poulet", price: 3500, unit: "plat", category: "Spécialités" },
    { id: "mafe", name: "Mafé", price: 3000, unit: "plat", category: "Spécialités" },
    { id: "coupe_glace", name: "Coupe de glace (3 boules)", price: 2500, unit: "coupe", category: "Desserts" },
    { id: "fruit_saison", name: "Fruits de saison", price: 1500, unit: "assiette", category: "Desserts" },
    { id: "gateau", name: "Part de gâteau", price: 1500, unit: "part", category: "Desserts" },
    { id: "crepe", name: "Crêpe sucrée", price: 1000, unit: "unité", category: "Desserts" }
  ],
  accompagnements: [
    { id: "riz_blanc", name: "Riz blanc", price: 500, unit: "portion", category: "Féculents" },
    { id: "riz_gras", name: "Riz gras", price: 800, unit: "portion", category: "Féculents" },
    { id: "pate_arachide", name: "Pâte d'arachide", price: 700, unit: "portion", category: "Sauces" },
    { id: "sauce_tomate", name: "Sauce tomate", price: 500, unit: "portion", category: "Sauces" },
    { id: "sauce_legumes", name: "Sauce légumes", price: 600, unit: "portion", category: "Sauces" },
    { id: "igname", name: "Igname pilée", price: 800, unit: "portion", category: "Féculents" },
    { id: "banane_plantain", name: "Banane plantain frite", price: 600, unit: "portion", category: "Féculents" },
    { id: "attiéké", name: "Attiéké", price: 500, unit: "portion", category: "Féculents" },
    { id: "couscous", name: "Couscous", price: 600, unit: "portion", category: "Féculents" },
    { id: "haricots", name: "Haricots", price: 500, unit: "portion", category: "Légumes" },
    { id: "legumes_sautes", name: "Légumes sautés", price: 700, unit: "portion", category: "Légumes" },
    { id: "aloko", name: "Alloco (banane frite)", price: 600, unit: "portion", category: "Féculents" }
  ],
  jeux: [
    { id: "vr_30", name: "Session VR 30min", price: 5000, unit: "session" },
    { id: "vr_60", name: "Session VR 1h", price: 8000, unit: "session" },
    { id: "ps5_30", name: "PS5 30min", price: 2000, unit: "session" },
    { id: "ps5_60", name: "PS5 1h", price: 3500, unit: "session" },
    { id: "billard_30", name: "Billard 30min", price: 1500, unit: "session" },
    { id: "billard_60", name: "Billard 1h", price: 2500, unit: "session" },
    { id: "baby_foot", name: "Baby-foot", price: 500, unit: "partie" },
    { id: "flechettes", name: "Fléchettes", price: 500, unit: "partie" }
  ],
  bar: [
    { id: "coca", name: "Coca-Cola", price: 500, unit: "bouteille" },
    { id: "fanta", name: "Fanta", price: 500, unit: "bouteille" },
    { id: "sprite", name: "Sprite", price: 500, unit: "bouteille" },
    { id: "eau", name: "Eau minérale", price: 300, unit: "bouteille" },
    { id: "jus_orange", name: "Jus d'orange", price: 800, unit: "verre" },
    { id: "jus_mangue", name: "Jus de mangue", price: 800, unit: "verre" },
    { id: "bissap", name: "Bissap", price: 500, unit: "verre" },
    { id: "gingembre", name: "Gingembre", price: 500, unit: "verre" },
    { id: "cafe", name: "Café", price: 300, unit: "tasse" },
    { id: "the", name: "Thé", price: 300, unit: "tasse" },
    { id: "biere_flag", name: "Bière Flag", price: 800, unit: "bouteille" },
    { id: "biere_castel", name: "Bière Castel", price: 800, unit: "bouteille" },
    { id: "biere_beninoise", name: "Bière Béninoise", price: 700, unit: "bouteille" },
    { id: "guinness", name: "Guinness", price: 1000, unit: "bouteille" },
    { id: "vin_rouge", name: "Vin rouge (verre)", price: 1500, unit: "verre" },
    { id: "vin_blanc", name: "Vin blanc (verre)", price: 1500, unit: "verre" },
    { id: "champagne", name: "Champagne (bouteille)", price: 25000, unit: "bouteille" },
    { id: "cocktail", name: "Cocktail maison", price: 3000, unit: "verre" },
    { id: "mojito", name: "Mojito", price: 3500, unit: "verre" },
    { id: "whisky", name: "Whisky", price: 2000, unit: "verre" },
    { id: "rhum", name: "Rhum", price: 1500, unit: "verre" },
    { id: "vodka", name: "Vodka", price: 1500, unit: "verre" },
    { id: "gin", name: "Gin", price: 1500, unit: "verre" },
    { id: "energy_drink", name: "Energy Drink", price: 1500, unit: "canette" }
  ],
  location: [
    { id: "salle_reunion", name: "Salle réunion (1h)", price: 10000, unit: "heure" },
    { id: "salle_fete", name: "Salle fête (demi-journée)", price: 50000, unit: "demi-journée" },
    { id: "espace_jardin", name: "Espace jardin (2h)", price: 15000, unit: "2 heures" },
    { id: "anniversaire_pack", name: "Pack anniversaire", price: 75000, unit: "pack" }
  ],
  autres: []
};

// Helper function to format price
export const formatPrice = (price) => {
  if (price === undefined || price === null || isNaN(price)) return "0";
  return new Intl.NumberFormat('fr-FR').format(Math.round(price));
};
