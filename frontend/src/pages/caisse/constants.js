/**
 * Caisse Pro - Shared Constants and Configuration
 */
import { 
  Gamepad2, Wine, Calendar, Package, UtensilsCrossed,
  Banknote, CreditCard, Smartphone, Wallet, FileText 
} from "lucide-react";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Default catalog items
export const DEFAULT_CATALOG = {
  salle_jardin: [
    { id: "table_jardin", name: "Table jardin (1h)", price: 2000, unit: "heure", category: "Mobilier" },
    { id: "parasol", name: "Parasol", price: 500, unit: "unité", category: "Mobilier" },
    { id: "chaise_longue", name: "Chaise longue", price: 1000, unit: "heure", category: "Mobilier" },
    { id: "espace_prive", name: "Espace privé (2h)", price: 5000, unit: "réservation", category: "Réservation" },
  ],
  jeux: [
    { id: "vr360", name: "VR 360°", price: 2000, unit: "partie", category: "Jeux VR" },
    { id: "simulateur", name: "Simulateur Course", price: 1500, unit: "partie", category: "Simulateur" },
  ],
  bar: [
    { id: "coca", name: "Coca-Cola", price: 500, unit: "bouteille", category: "Sodas" },
    { id: "fanta", name: "Fanta", price: 500, unit: "bouteille", category: "Sodas" },
    { id: "sprite", name: "Sprite", price: 500, unit: "bouteille", category: "Sodas" },
    { id: "eau", name: "Eau minérale", price: 300, unit: "bouteille", category: "Boissons" },
    { id: "jus_orange", name: "Jus d'orange", price: 800, unit: "verre", category: "Jus" },
    { id: "jus_ananas", name: "Jus d'ananas", price: 800, unit: "verre", category: "Jus" },
    { id: "biere_locale", name: "Bière locale", price: 800, unit: "bouteille", category: "Bières" },
    { id: "biere_import", name: "Bière importée", price: 1500, unit: "bouteille", category: "Bières" },
    { id: "cafe", name: "Café", price: 500, unit: "tasse", category: "Chaud" },
    { id: "the", name: "Thé", price: 400, unit: "tasse", category: "Chaud" },
  ],
  location: [
    { id: "salle_complete", name: "Location salle complète", price: 50000, unit: "journée", category: "Location" },
    { id: "salle_demi", name: "Location demi-journée", price: 30000, unit: "demi-journée", category: "Location" },
    { id: "espace_vip", name: "Espace VIP", price: 25000, unit: "soirée", category: "Location" },
  ],
  autres: []
};

export const DEPARTMENT_CONFIG = {
  salle_jardin: { 
    label: "Salle & Jardin", 
    icon: UtensilsCrossed, 
    color: "text-green-400", 
    bgColor: "bg-green-500/10", 
    borderColor: "border-green-500/30" 
  },
  jeux: { 
    label: "Jeux", 
    icon: Gamepad2, 
    color: "text-blue-400", 
    bgColor: "bg-blue-500/10", 
    borderColor: "border-blue-500/30" 
  },
  bar: { 
    label: "Bar", 
    icon: Wine, 
    color: "text-orange-400", 
    bgColor: "bg-orange-500/10", 
    borderColor: "border-orange-500/30" 
  },
  location: { 
    label: "Location", 
    icon: Calendar, 
    color: "text-purple-400", 
    bgColor: "bg-purple-500/10", 
    borderColor: "border-purple-500/30" 
  },
  autres: { 
    label: "Autres", 
    icon: Package, 
    color: "text-slate-400", 
    bgColor: "bg-slate-500/10", 
    borderColor: "border-slate-500/30" 
  }
};

export const PAYMENT_METHODS = [
  { value: "cash", label: "Espèces", icon: Banknote },
  { value: "card", label: "Carte bancaire", icon: CreditCard },
  { value: "mobile", label: "Mobile Money", icon: Smartphone },
  { value: "wallet", label: "Porte-monnaie", icon: Wallet },
  { value: "check", label: "Chèque", icon: FileText },
];

// Utility functions
export const formatPrice = (price) => new Intl.NumberFormat('fr-FR').format(price);

// Play notification sound
export const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime);
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.8);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.8);
    
    const oscillator2 = audioContext.createOscillator();
    const gainNode2 = audioContext.createGain();
    
    oscillator2.connect(gainNode2);
    gainNode2.connect(audioContext.destination);
    
    oscillator2.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1);
    oscillator2.type = 'sine';
    
    gainNode2.gain.setValueAtTime(0, audioContext.currentTime + 0.1);
    gainNode2.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.15);
    gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.9);
    
    oscillator2.start(audioContext.currentTime + 0.1);
    oscillator2.stop(audioContext.currentTime + 0.9);
  } catch (error) {
    console.log("Audio notification not available");
  }
};
