import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { 
  Receipt, Plus, Minus, Trash2, Printer, Save, Search,
  Gamepad2, Wine, TreePine, Calculator, Clock, User, UserCircle,
  CreditCard, Wallet, CheckCircle, X, Eye, Download,
  BarChart3, TrendingUp, Calendar, Filter, Users, Package,
  Edit2, Settings, LogOut, FileText, ChevronLeft, ChevronRight,
  DollarSign, Banknote, Smartphone, ChevronsUpDown, UserPlus, RefreshCw,
  MessageCircle, Send, PieChart as PieChartIcon, UtensilsCrossed,
  ShoppingCart, AlertCircle, AlertTriangle, Image, ArrowUpDown, Activity, LayoutGrid, Timer,
  Building2, MessageSquare, Bell, BellOff, ClipboardList, QrCode, Share2, Truck, Coins, History, BookOpen, Sunrise, CalendarClock, Sparkles
} from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format, subDays, startOfMonth, endOfMonth, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";

// Extracted components
import TablesTab from "./caisse/components/TablesTab";
import RespOpWelcome from "./caisse/components/RespOpWelcome";
import HebdoReport from "./caisse/components/HebdoReport";
import DayClosureGuard from "./caisse/components/DayClosureGuard";
import BillettageGlobalCard from "./caisse/components/BillettageGlobalCard";
import LocationsTab from "./caisse/components/LocationsTab";
import InstructionsTab from "./caisse/components/InstructionsTab";
import ProformaTab from "./caisse/components/ProformaTab";
import ConditioningSuggester from "./caisse/components/ConditioningSuggester";
import SubscriptionsTab from "./caisse/components/SubscriptionsTab";
import ShareModal, { ShareButton } from "./caisse/components/ShareModal";
import MonsieurTab from "./caisse/components/MonsieurTab";
import PointFinancierTab from "./caisse/components/PointFinancierTab";
import PointsHistoryTab from "./caisse/components/PointsHistoryTab";
import ActiviteTab from "./caisse/components/ActiviteTab";
import UsersTab from "./caisse/components/UsersTab";
import ClientsTab from "./caisse/components/ClientsTab";
import PointCaisseTab from "./caisse/components/PointCaisseTab";
import JourneeTab from "./caisse/components/JourneeTab";
import QuickProductPicker from "./caisse/components/QuickProductPicker";
import CoursesTab from "./caisse/components/CoursesTab";
import ClosureLockBanner from "./caisse/components/ClosureLockBanner";
import ProductsTab from "./caisse/components/ProductsTab";
import LinkStockModal from "./caisse/components/LinkStockModal";
import MultiLinkStockModal from "./caisse/components/MultiLinkStockModal";
import BonsTab from "./caisse/components/BonsTab";
import StatsTab from "./caisse/components/StatsTab";
import ForecastsTab from "./caisse/components/ForecastsTab";
import JournalTab from "./caisse/components/JournalTab";
import OfflineIndicator from "../components/OfflineIndicator";
import { trySync } from "../lib/offlineSync";
import RegularizationModal from "../components/RegularizationModal";
import RecoupementPanel from "./caisse/components/RecoupementPanel";
import CuisinePage from "./CuisinePage";
import useReadyNotifications from "../hooks/useReadyNotifications";
import AuditLogsTab from "./caisse/components/AuditLogsTab";
import NeedsTab from "./caisse/components/NeedsTab";
import PurchaseOrdersTab from "./caisse/components/PurchaseOrdersTab";
import CurrentAccountsTab from "./caisse/components/CurrentAccountsTab";
import TipsTab from "./caisse/components/TipsTab";
import AchatsTab from "./caisse/components/AchatsTab";
import CommandeTab from "./caisse/components/CommandeTab";
import { NotifBadge, NotificationBell, CrossRoleBanner } from "./caisse/components/NotificationCenter";
import { useNotifications } from "./caisse/hooks/useNotifications";
import ExpenseAnalysisBadges from "./caisse/components/ExpenseAnalysisBadges";

// Taxonomy (type achat/paiement, destinations, libellés prédéfinis paiements)
import {
  EXPENSE_TYPES,
  DESTINATIONS,
  PREDEFINED_PAYMENTS,
  PAYMENT_GROUPS,
} from "./caisse/constants/expenseTaxonomy";

// Import logo for printing
import { LOGO_BASE64 } from "./caisse/constants_logo";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Helper — Renvoie le libellé de validation avec rôle (utilisé sur les tickets imprimés)
// Ex: "Mères AHOUANDJINOU — Responsable des Opérations & Logistique"
const formatValidatorLabel = (user) => {
  if (!user) return "Utilisateur";
  const name = user.full_name || user.username || "Utilisateur";
  if (user.role === "manager") return `${name} — Responsable des Opérations & Logistique`;
  if (user.role === "admin") return `${name} — Administrateur`;
  return name;
};

// Default catalog items
const DEFAULT_CATALOG = {
  salle_jardin: [
    // === ENTRÉES ===
    { id: "salade_nicoise", name: "Salade niçoise", price: 4000, unit: "portion", category: "Entrées" },
    { id: "salade_crudites", name: "Salade crudités", price: 2500, unit: "portion", category: "Entrées" },
    { id: "salade_cesar", name: "Salade César", price: 4500, unit: "portion", category: "Entrées" },
    { id: "salade_maxo", name: "Salade Maxo", price: 5000, unit: "portion", category: "Entrées" },
    { id: "salade_avocat_crevettes", name: "Salade Avocat crevettes", price: 4500, unit: "portion", category: "Entrées" },
    { id: "salade_thon", name: "Salade au thon", price: 4000, unit: "portion", category: "Entrées" },
    { id: "salade_verte", name: "Salade verte", price: 1500, unit: "portion", category: "Entrées" },
    { id: "samossas_poulet", name: "Samossas au Poulet", price: 2500, unit: "portion", category: "Entrées" },
    { id: "samossas_viande", name: "Samossas à la viande", price: 2500, unit: "portion", category: "Entrées" },
    { id: "neems", name: "Neems Poulet/Viande", price: 2500, unit: "portion", category: "Entrées" },
    // === PLATS PRINCIPAUX ===
    { id: "poulet_curry", name: "Sauce Poulet au Curry", price: 5000, unit: "plat", category: "Plats" },
    { id: "filet_boeuf_champignons", name: "Filet de Boeuf sauce champignons", price: 6000, unit: "plat", category: "Plats" },
    { id: "steaks_grilles", name: "Steaks Grillés", price: 5000, unit: "plat", category: "Plats" },
    { id: "steak_poivre", name: "Steak au poivre", price: 5500, unit: "plat", category: "Plats" },
    { id: "spaghetti_bolognaise", name: "Spaghetti bolognaise", price: 4000, unit: "plat", category: "Plats" },
    { id: "tagliatelles_crevettes", name: "Tagliatelles crevettes", price: 5000, unit: "plat", category: "Plats" },
    { id: "choukouya_mouton", name: "Choukouya Mouton", price: 5000, unit: "plat", category: "Grillades" },
    { id: "choukouya_bicyclette", name: "Choukouya Poulet Bicyclette", price: 6000, unit: "plat", category: "Grillades" },
    { id: "choukouya_chair", name: "Choukouya Poulet Chair (Demi)", price: 5000, unit: "plat", category: "Grillades" },
    { id: "poulet_demi", name: "Poulet Frit/Grillé/BBQ (Demi)", price: 5000, unit: "plat", category: "Grillades" },
    { id: "poulet_complet", name: "Poulet Frit/Grillé/BBQ (Complet)", price: 9000, unit: "plat", category: "Grillades" },
    { id: "poulet_bicyclette", name: "Poulet Bicyclette Complet", price: 6000, unit: "plat", category: "Grillades" },
    { id: "lapin", name: "Lapin frit/Braisé/Grillé", price: 4000, unit: "portion", category: "Grillades" },
    { id: "mouton", name: "Mouton frit/braisé/Grillé", price: 5000, unit: "plat", category: "Grillades" },
    { id: "langue_boeuf", name: "Langue de Boeuf Braisé/Grillé", price: 5000, unit: "plat", category: "Grillades" },
    { id: "poisson", name: "Poisson frit/Braisé/Grillé", price: 6000, unit: "plat", category: "Grillades" },
    { id: "aileron", name: "Aileron Frit/Braisé/Grillé", price: 5000, unit: "plat", category: "Grillades" },
    { id: "agneau", name: "Agneau Frit/Braisé/Grillé", price: 5000, unit: "plat", category: "Grillades" },
    // === SAUCES AFRICAINES ===
    { id: "sauce_legume", name: "Sauce Légume GBOMA/TCHIAVO", price: 5000, unit: "plat", category: "Sauces" },
    { id: "sauce_legume_mixte", name: "Sauce Légume Mixte", price: 5500, unit: "plat", category: "Sauces" },
    { id: "sauce_vassa", name: "Sauce Vassa", price: 5000, unit: "plat", category: "Sauces" },
    { id: "sauce_assrokouin", name: "Sauce Assrokouin", price: 5000, unit: "plat", category: "Sauces" },
    { id: "sauce_arachide", name: "Sauce Arachide", price: 5000, unit: "plat", category: "Sauces" },
    { id: "agneau_arachide", name: "Agneau en Sauce Arachide", price: 5000, unit: "plat", category: "Sauces" },
    { id: "agneau_tomate", name: "Agneau en sauce Tomate", price: 5000, unit: "plat", category: "Sauces" },
    { id: "sauce_goussi", name: "Sauce Goussi (Sésame)", price: 5000, unit: "plat", category: "Sauces" },
    { id: "moyo_poisson", name: "Moyo Poisson", price: 6000, unit: "plat", category: "Sauces" },
    { id: "dakouin", name: "DAKOUIN", price: 6000, unit: "plat", category: "Sauces" },
    // === BURGERS ===
    { id: "meetburger", name: "MeetBurger", price: 2500, unit: "pièce", category: "Burgers" },
    { id: "cheeseburger", name: "CheeseBurger", price: 3000, unit: "pièce", category: "Burgers" },
    { id: "double_cheese", name: "Double Cheese Burger", price: 5000, unit: "pièce", category: "Burgers" },
    { id: "kingburger", name: "KingBurger", price: 3500, unit: "pièce", category: "Burgers" },
    { id: "burger_maxo", name: "Burger Maxo", price: 4000, unit: "pièce", category: "Burgers" },
    // === SANDWICHS ===
    { id: "chawarma_viande", name: "Chawarma Viande", price: 2000, unit: "pièce", category: "Sandwichs" },
    { id: "chawarma_poulet", name: "Chawarma Poulet", price: 2500, unit: "pièce", category: "Sandwichs" },
    { id: "sandwich_poisson", name: "Sandwich au Poisson/Frite", price: 3000, unit: "pièce", category: "Sandwichs" },
    { id: "sandwich_fajitas", name: "Sandwich Fajitas/Frite", price: 3000, unit: "pièce", category: "Sandwichs" },
    { id: "sandwich_philadelphia", name: "Sandwich Philadelphia/Frite", price: 3000, unit: "pièce", category: "Sandwichs" },
    { id: "sandwich_maxo", name: "Sandwich MAXO/Frite", price: 3000, unit: "pièce", category: "Sandwichs" },
    // === PIZZAS ===
    { id: "pizza_reine", name: "Pizza Reine", price: 5000, unit: "pièce", category: "Pizzas" },
    { id: "pizza_4saisons", name: "Pizza 4 saisons", price: 5000, unit: "pièce", category: "Pizzas" },
    { id: "pizza_margherita", name: "Pizza Margherita", price: 4500, unit: "pièce", category: "Pizzas" },
    { id: "pizza_maxo", name: "Pizza Maxo", price: 6000, unit: "pièce", category: "Pizzas" },
    { id: "pizza_vegetarienne", name: "Pizza Végétarienne", price: 5000, unit: "pièce", category: "Pizzas" },
    { id: "pizza_bolognaise", name: "Pizza Bolognaise", price: 5000, unit: "pièce", category: "Pizzas" },
    // === DESSERTS ===
    { id: "crepe_nature", name: "Crêpe Nature", price: 700, unit: "pièce", category: "Desserts" },
    { id: "crepe_nutella", name: "Crêpe au Nutella", price: 1500, unit: "pièce", category: "Desserts" },
    { id: "salade_fruit", name: "Salade de Fruit", price: 1000, unit: "portion", category: "Desserts" },
    { id: "ananas_pirogue", name: "Ananas Pirogue", price: 1000, unit: "portion", category: "Desserts" },
    { id: "assiette_fruit", name: "Assiette de Fruit", price: 1500, unit: "portion", category: "Desserts" },
    { id: "glace_boule", name: "Glace (Chocolat/Fraise/Vanille)", price: 1000, unit: "boule", category: "Desserts" },
    { id: "coupe_glace", name: "Coupe de glace (3 boules)", price: 2500, unit: "coupe", category: "Desserts" },
  ],
  accompagnements: [
    { id: "riz_blanc", name: "Riz blanc", price: 1000, unit: "portion", category: "Riz" },
    { id: "riz_cantonais", name: "Riz Cantonais", price: 1500, unit: "portion", category: "Riz" },
    { id: "riz_legumes", name: "Riz aux légumes", price: 1500, unit: "portion", category: "Riz" },
    { id: "spaghetti_accomp", name: "Spaghetti (Sauté)", price: 1000, unit: "portion", category: "Pâtes" },
    { id: "pate_rouge_blanc", name: "Pâtes (Rouge/Blanc)", price: 1000, unit: "portion", category: "Pâtes" },
    { id: "couscous", name: "Couscous (au gras/Blanc)", price: 1000, unit: "portion", category: "Féculents" },
    { id: "pomme_saute", name: "Pomme sautée", price: 1500, unit: "portion", category: "Frites" },
    { id: "frite_surgelee", name: "Frite surgelée", price: 1000, unit: "portion", category: "Frites" },
    { id: "frite_nature", name: "Frite Nature", price: 1500, unit: "portion", category: "Frites" },
    { id: "atieke", name: "Atiéké", price: 1000, unit: "portion", category: "Traditionnel" },
    { id: "akassa", name: "Akassa", price: 500, unit: "portion", category: "Traditionnel" },
    { id: "pate_blanche", name: "Pâte Blanche (Maïs)", price: 1000, unit: "portion", category: "Traditionnel" },
    { id: "pate_noire", name: "Pâte Noire (Télibo)", price: 1000, unit: "portion", category: "Traditionnel" },
    { id: "pate_rouge", name: "Pâte Rouge (Amiwo)", price: 1000, unit: "portion", category: "Traditionnel" },
  ],
  jeux: [
    { id: "vr360", name: "VR 360°", price: 2000, unit: "partie", category: "Jeux VR" },
    { id: "simulateur", name: "Simulateur Course", price: 1500, unit: "partie", category: "Simulateur" },
  ],
  bar: [
    // === JUS FRAIS ===
    { id: "jus_orange", name: "Jus d'orange", price: 1000, unit: "verre", category: "Jus Frais" },
    { id: "jus_ananas", name: "Jus d'ananas", price: 1000, unit: "verre", category: "Jus Frais" },
    { id: "jus_pasteque", name: "Jus de pastèque", price: 1000, unit: "verre", category: "Jus Frais" },
    { id: "jus_mixte", name: "Jus Mixte (Mélange)", price: 1500, unit: "verre", category: "Jus Frais" },
    // === SODAS ===
    { id: "world_cola", name: "World Cola", price: 1000, unit: "bouteille", category: "Sodas" },
    { id: "coca", name: "Coca-Cola", price: 500, unit: "bouteille", category: "Sodas" },
    { id: "fanta", name: "Fanta", price: 500, unit: "bouteille", category: "Sodas" },
    { id: "sprite", name: "Sprite", price: 500, unit: "bouteille", category: "Sodas" },
    { id: "eau", name: "Eau minérale", price: 300, unit: "bouteille", category: "Boissons" },
    // === BIÈRES ===
    { id: "beninoise", name: "Béninoise 0,33cl", price: 1000, unit: "bouteille", category: "Bières" },
    { id: "sombrero", name: "Sombrero 0,33cl", price: 1000, unit: "bouteille", category: "Bières" },
    { id: "guinness", name: "Guinness 0,33cl", price: 1500, unit: "bouteille", category: "Bières" },
    { id: "chill", name: "Chill 0,33cl", price: 1000, unit: "bouteille", category: "Bières" },
    // === CHAUD ===
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

const DEPARTMENT_CONFIG = {
  salle_jardin: { label: "Plats", icon: UtensilsCrossed, color: "text-green-400", bgColor: "bg-green-500/10", borderColor: "border-green-500/30" },
  accompagnements: { label: "Accomp.", icon: Package, color: "text-yellow-400", bgColor: "bg-yellow-500/10", borderColor: "border-yellow-500/30" },
  jeux: { label: "Jeux", icon: Gamepad2, color: "text-blue-400", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/30" },
  bar: { label: "Bar", icon: Wine, color: "text-orange-400", bgColor: "bg-orange-500/10", borderColor: "border-orange-500/30" },
  location: { label: "Location", icon: Calendar, color: "text-purple-400", bgColor: "bg-purple-500/10", borderColor: "border-purple-500/30" },
  autres: { label: "Autres", icon: Package, color: "text-slate-400", bgColor: "bg-slate-500/10", borderColor: "border-slate-500/30" }
};

const PAYMENT_METHODS = [
  { value: "cash", label: "Espèces", icon: Banknote },
  { value: "card", label: "Carte bancaire", icon: CreditCard },
  { value: "mobile", label: "Mobile Money", icon: Smartphone },
  { value: "wallet", label: "Porte-monnaie", icon: Wallet },
  { value: "check", label: "Chèque", icon: FileText },
];

const CaissePage = () => {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ pin: "", password: "" });
  const [loginMode, setLoginMode] = useState("pin"); // pin or admin
  const [showForgotCodeModal, setShowForgotCodeModal] = useState(false);

  // Audit actor query string (added to mutation URLs so the audit log knows
  // which user performed the action — visible only to admins).
  const actorQs = () => {
    if (!currentUser) return "";
    const name = encodeURIComponent(currentUser.full_name || currentUser.username || "—");
    const role = encodeURIComponent(currentUser.role || "manager");
    return `actor_name=${name}&actor_role=${role}`;
  };
  
  // Main state
  const [activeTab, setActiveTab] = useState("tables");
  const [activeDepartment, setActiveDepartment] = useState("salle_jardin");
  const [productSearch, setProductSearch] = useState("");

  // ============== NOTIFICATIONS (extracted to hook) ==============
  
  // Catalog/Products
  const [products, setProducts] = useState([]);
  const [catalog, setCatalog] = useState(DEFAULT_CATALOG);
  
  // Multi-table system
  const [openTables, setOpenTables] = useState([]); // All open tables from DB
  const [activeTableId, setActiveTableId] = useState(null); // Currently active table ID
  // ── Notifications "Plats prêts" depuis la cuisine ──
  const readyNotif = useReadyNotifications(currentUser);
  // ── Régularisation rétroactive (Admin + Resp. Op.) ──
  const [showRegularizationModal, setShowRegularizationModal] = useState(false);
  const [regularizationMode, setRegularizationMode] = useState("create"); // "create" | "update-date"
  const [regularizationTargetInvoice, setRegularizationTargetInvoice] = useState(null);
  const [showNewTableModal, setShowNewTableModal] = useState(false);
  const [availableTableNumbers, setAvailableTableNumbers] = useState([]);
  
  // Current bill (derived from active table)
  const [currentBill, setCurrentBill] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState("");
  
  // Custom item form (for "Autres" department)
  const [customItem, setCustomItem] = useState({ name: "", price: 0 });
  
  // Data
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [monthlyStats, setMonthlyStats] = useState(null);
  
  // Notification sound for validated invoices
  const [lastValidatedCount, setLastValidatedCount] = useState(0);
  const audioRef = useRef(null);
  
  // Filters
  const [filterDate, setFilterDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [filterMonth, setFilterMonth] = useState(format(new Date(), "yyyy-MM"));
  const [filterValidation, setFilterValidation] = useState("all"); // all, pending, validated

  // Force la Gérante à n'avoir que la date du jour (pas d'historique factures)
  useEffect(() => {
    if (currentUser && currentUser.role !== 'admin') {
      const today = format(new Date(), "yyyy-MM-dd");
      if (filterDate !== today) setFilterDate(today);
    }
  }, [currentUser, filterDate]);
  
  // Modals
  const [viewInvoice, setViewInvoice] = useState(null);
  const [editInvoice, setEditInvoice] = useState(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [stockSuggestions, setStockSuggestions] = useState([]);
  const [showLinkStockModal, setShowLinkStockModal] = useState(false);
  const [linkStockTarget, setLinkStockTarget] = useState(null);
  const [showMultiLinkModal, setShowMultiLinkModal] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showMobilePaymentModal, setShowMobilePaymentModal] = useState(false);
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState(false);
  const [pendingValidationInvoice, setPendingValidationInvoice] = useState(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("cash");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [pendingInvoiceData, setPendingInvoiceData] = useState(null);
  const [editProduct, setEditProduct] = useState(null);
  const [editClient, setEditClient] = useState(null);
  const [editUser, setEditUser] = useState(null);
  
  // Forms
  const [productForm, setProductForm] = useState({ name: "", price: 0, department: "bar", unit: "unité", category: "" });
  const [clientForm, setClientForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [userForm, setUserForm] = useState({ username: "", email: "", password: "", pin: "", role: "server", full_name: "" });
  
  // Rapport Journalier
  const [rapportDate, setRapportDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [rapportData, setRapportData] = useState(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [signatureData, setSignatureData] = useState(null);
  const [signature, setSignature] = useState("");
  const [selectedServerDetail, setSelectedServerDetail] = useState(null);
  const [serverInvoices, setServerInvoices] = useState([]);
  
  // Historique des factures
  const [historyDate, setHistoryDate] = useState(format(subDays(new Date(), 1), "yyyy-MM-dd"));
  const [historyInvoices, setHistoryInvoices] = useState([]);
  
  // Cancellation requests
  const [cancellationRequests, setCancellationRequests] = useState([]);
  const [lastCancellationCount, setLastCancellationCount] = useState(0);
  
  // Modification requests
  const [modificationRequests, setModificationRequests] = useState([]);
  const [lastModificationCount, setLastModificationCount] = useState(0);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [editingItems, setEditingItems] = useState([]);
  
  // Pending orders count for servers
  const [lastPendingCount, setLastPendingCount] = useState(0);

  // ============== MENU NOTIFICATIONS (for Admin) ==============
  const [menuNotifications, setMenuNotifications] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);

  // ============== SERVER DAILY POINT ==============
  const [serverDailyReport, setServerDailyReport] = useState(null);
  const [serverReportDate, setServerReportDate] = useState(format(new Date(), "yyyy-MM-dd"));

  // ============== END OF SERVICE (for servers) ==============
  const [showEndOfServiceModal, setShowEndOfServiceModal] = useState(false);
  const [endOfServiceObservation, setEndOfServiceObservation] = useState("");
  const [isSubmittingEndOfService, setIsSubmittingEndOfService] = useState(false);

  // ============== SERVICE REPORTS (for Manager) ==============
  const [serviceReports, setServiceReports] = useState([]);
  const [unreadServiceReportsCount, setUnreadServiceReportsCount] = useState(0);
  const [showServiceReportsPanel, setShowServiceReportsPanel] = useState(false);
  
  // ============== SHARE MODAL ==============
  const [showShareModal, setShowShareModal] = useState(false);
  
  // ============== NOTES/INSTRUCTIONS NOTIFICATIONS ==============
  const [unreadNotesCount, setUnreadNotesCount] = useState(0);
  
  // Detailed view of a server's point (for Manager)
  const [viewingServerReport, setViewingServerReport] = useState(null);
  const [viewingServerDetailedReport, setViewingServerDetailedReport] = useState(null);
  const [loadingServerDetail, setLoadingServerDetail] = useState(false);

  // ============== EXPENSES (Achats/Dépenses) ==============
  const [expenses, setExpenses] = useState([]);
  const [expenseAnalyses, setExpenseAnalyses] = useState({}); // { [expenseId]: analysis }
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [expenseForm, setExpenseForm] = useState({
    category: "cuisine",
    description: "",
    quantity: 1,
    unit_price: 0,
    amount: 0,
    supplier: "",
    planned_date: format(new Date(), "yyyy-MM-dd"),
    receipt_image: null,
    funded_by_account_id: "",
    funded_by_account_name: "",
    funded_affects_ca: true,
    // Type & destination (29/04/2026)
    expense_type: "achat",
    destination: "cuisine",
    // Stock flow (21/05/2026) — toggle global "Passer en stock"
    to_stock: false,
  });
  // Available current accounts (for funding-source selector)
  const [availableAccounts, setAvailableAccounts] = useState([]);
  
  // Achats communs - multi-items
  const [commonItems, setCommonItems] = useState([]);
  const [commonNewItem, setCommonNewItem] = useState({ category: "cuisine", description: "", quantity: 1, unit_price: 0, expense_type: "achat", destination: "cuisine", passer_en_stock: null });

  // Admin revision modal (modify expense before sending back to manager)
  const [showReviseModal, setShowReviseModal] = useState(false);
  const [revisingExpense, setRevisingExpense] = useState(null);
  const [reviseItems, setReviseItems] = useState([]);
  const [reviseSupplier, setReviseSupplier] = useState("");
  const [reviseNote, setReviseNote] = useState("");
  const [reviseNewItem, setReviseNewItem] = useState({ category: "cuisine", description: "", quantity: 1, unit_price: 0 });

  // Revision notifications for Manager
  const [revisionExpensesCount, setRevisionExpensesCount] = useState(0);
  const [showRevisionPanel, setShowRevisionPanel] = useState(false);
  
  // Liste d'achats multiple
  const [shoppingList, setShoppingList] = useState([]);
  const [showShoppingListModal, setShowShoppingListModal] = useState(false);
  const [shoppingListSupplier, setShoppingListSupplier] = useState("");
  const [shoppingListDate, setShoppingListDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [newListItem, setNewListItem] = useState({ category: "cuisine", description: "", quantity: 1, unit_price: 0, supplier: "" });
  const [showAllExpenses, setShowAllExpenses] = useState(false);
  // Sub-view filter for Achats tab: 'en_cours' (pending/revision/approved) or 'valides' (approved+completed)
  const [achatsSubView, setAchatsSubView] = useState('en_cours');
  
  // Expense week assignment
  const [showWeekAssignModal, setShowWeekAssignModal] = useState(false);
  const [expenseToAssign, setExpenseToAssign] = useState(null);

  // ============== FAIRE LE POINT (Rapport période : jour / semaine / personnalisé) ==============
  const [weeklyReport, setWeeklyReport] = useState(null);
  const [weekStartDate, setWeekStartDate] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  // Sub-tab active inside the "Faire le point" tab ("point-hebdo" | "reversement" | "point-history")
  const [hebdoSubTab, setHebdoSubTab] = useState("point-hebdo");
  // Sub-sub-tab active inside the "Reversement" sub-menu ("bar" | "menu_combos" | "jeux" | "locations")
  const [reversementSubTab, setReversementSubTab] = useState("bar");
  // Date du billettage global (par défaut : aujourd'hui)
  const [billettageDate, setBillettageDate] = useState(format(new Date(), "yyyy-MM-dd"));
  // Force la Resp. Op. sur la date du jour pour le billettage
  useEffect(() => {
    if (currentUser && currentUser.role !== 'admin') {
      const today = format(new Date(), "yyyy-MM-dd");
      if (billettageDate !== today) setBillettageDate(today);
    }
  }, [currentUser, billettageDate]);
  // End date (inclusive). Par défaut = dimanche de la semaine courante (preset "Cette semaine").
  const [weekEndDate, setWeekEndDate] = useState(() => {
    const d = startOfWeek(new Date(), { weekStartsOn: 1 });
    d.setDate(d.getDate() + 6);
    return format(d, "yyyy-MM-dd");
  });
  const [expenseRatioAlert, setExpenseRatioAlert] = useState(null);

  // ============== TABLE STATUS (Suivi Tables) ==============
  const [tablesStatus, setTablesStatus] = useState({ tables: [], stats: { total_tables: 20, occupied: 0, free: 20 } });
  // Statut de la journée courante (utilisé par le welcome banner Resp. Op.)
  const [dayOpening, setDayOpening] = useState(null);
  useEffect(() => {
    if (!isAuthenticated) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    axios.get(`${API}/day-openings/${today}`)
      .then((r) => setDayOpening(r.data || null))
      .catch(() => setDayOpening(null));
  }, [isAuthenticated, activeTab]);

  const formatPrice = (price) => new Intl.NumberFormat('fr-FR').format(price);

  // ============== NOTIFICATION SOUND ==============
  const playNotificationSound = () => {
    try {
      // Create a pleasant "ding" notification sound using Web Audio API
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Create oscillator for the main tone
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Pleasant bell-like sound (C5 note = 523.25 Hz)
      oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime);
      oscillator.type = 'sine';
      
      // Fade in and out for a nice bell effect
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.8);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.8);
      
      // Second tone for a richer sound (E5 = 659.25 Hz)
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

  // ============== AUTH ==============
  const handleLogin = async () => {
    try {
      const response = await axios.post(`${API}/caisse/login`, loginForm);
      if (response.data.success) {
        setIsAuthenticated(true);
        setCurrentUser(response.data.user);
        toast.success(`Bienvenue ${response.data.user.full_name || response.data.user.username}`);
        fetchAllData();
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Identifiants incorrects");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setCurrentBill([]);
    setOpenTables([]);
    setActiveTableId(null);
  };

  // ============== MULTI-TABLE MANAGEMENT ==============
  
  const fetchOpenTables = async (skipAutoSelect = false) => {
    if (!currentUser) return;
    try {
      const serverId = currentUser.id || currentUser.username;
      const [tablesRes, availableRes] = await Promise.all([
        axios.get(`${API}/caisse/tables`, { params: { server_id: serverId } }),
        axios.get(`${API}/caisse/tables/available`, { params: { server_id: serverId } })
      ]);
      
      const tables = tablesRes.data.tables || [];
      setOpenTables(tables);
      setAvailableTableNumbers(availableRes.data.available_tables || []);
      
      // Only auto-select if:
      // - No active table
      // - There are tables available
      // - skipAutoSelect is false
      // - Select only tables that are NOT "invoiced" (still have pending items)
      if (!activeTableId && tables.length > 0 && !skipAutoSelect) {
        const activeTable = tables.find(t => t.status !== 'invoiced' && (t.items?.length > 0));
        if (activeTable) {
          selectTable(activeTable);
        }
        // Don't auto-select invoiced tables - let user choose
      }
    } catch (error) {
      console.error("Error fetching tables:", error);
    }
  };

  const createNewTable = async (tableNumber) => {
    if (!currentUser) return;
    try {
      const payload = {
        id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `t_${Date.now()}`,
        table_number: tableNumber,
        server_id: currentUser.id || currentUser.username,
        server_name: currentUser.full_name || currentUser.username,
        items: [],
        client_name: "Client",
        payment_method: "cash",
        discount: 0,
        notes: ""
      };
      const r = await trySync({
        type: "create_table",
        payload,
        user: { name: currentUser.full_name || currentUser.username, role: currentUser.role },
      });
      if (r.queued) {
        toast.warning(`Table ${tableNumber} créée hors-ligne — sera synchronisée au retour de la connexion`);
        // Optimistic UI: add table locally
        const localTable = { ...payload, _offline_pending: true, created_at: new Date().toISOString() };
        await fetchOpenTables();
        selectTable(localTable);
        setShowNewTableModal(false);
        return;
      }
      if (r.data?.success) {
        toast.success(`Table ${tableNumber} ouverte !`);
        await fetchOpenTables();
        selectTable(r.data.table);
        setShowNewTableModal(false);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de l'ouverture de la table");
    }
  };

  const selectTable = (table) => {
    if (!table) {
      setActiveTableId(null);
      setCurrentBill([]);
      setSelectedClient(null);
      setPaymentMethod("cash");
      setDiscount(0);
      setNotes("");
      return;
    }
    
    setActiveTableId(table.id);
    setCurrentBill(table.items || []);
    setSelectedClient(table.client_id ? clients.find(c => c.id === table.client_id) : null);
    setPaymentMethod(table.payment_method || "cash");
    setDiscount(table.discount || 0);
    setNotes(table.notes || "");
  };

  const saveCurrentTableToDb = async () => {
    if (!activeTableId) return;
    try {
      await axios.put(`${API}/caisse/tables/${activeTableId}?${actorQs()}`, {
        items: currentBill,
        client_id: selectedClient?.id || null,
        client_name: selectedClient?.name || "Client",
        payment_method: paymentMethod,
        discount: discount,
        notes: notes
      });
    } catch (error) {
      console.error("Error saving table:", error);
    }
  };

  const closeTable = async (tableId) => {
    try {
      await axios.delete(`${API}/caisse/tables/${tableId}?${actorQs()}&reason=cancelled`);
      
      // If closing active table, switch to another or clear
      if (tableId === activeTableId) {
        const remainingTables = openTables.filter(t => t.id !== tableId);
        if (remainingTables.length > 0) {
          selectTable(remainingTables[0]);
        } else {
          selectTable(null);
        }
      }
      
      await fetchOpenTables();
    } catch (error) {
      console.error("Error closing table:", error);
    }
  };

  // Auto-save table when bill changes (debounced)
  useEffect(() => {
    if (activeTableId && currentBill.length >= 0) {
      const timeoutId = setTimeout(() => {
        saveCurrentTableToDb();
      }, 500); // Save after 500ms of no changes
      
      return () => clearTimeout(timeoutId);
    }
  }, [currentBill, selectedClient, paymentMethod, discount, notes, activeTableId]);

  // Get current active table object
  const activeTable = openTables.find(t => t.id === activeTableId);

  // ============== DATA FETCHING ==============
  const fetchAllData = async () => {
    try {
      // Build query params for invoices based on user role
      const invoiceParams = { date: filterDate };
      if (currentUser?.role === 'server') {
        invoiceParams.role = 'server';
        invoiceParams.created_by = currentUser?.full_name || currentUser?.username;
      }

      const [invoicesRes, clientsRes, usersRes, productsRes, statsRes] = await Promise.all([
        axios.get(`${API}/invoices`, { params: invoiceParams }),
        axios.get(`${API}/caisse/clients`),
        axios.get(`${API}/caisse/users`),
        axios.get(`${API}/caisse/products`),
        axios.get(`${API}/invoices/stats`, { params: { date: filterDate } })
      ]);
      
      setInvoices(invoicesRes.data.invoices || []);
      setClients(clientsRes.data.clients || []);
      setUsers(usersRes.data.users || []);
      setStats(statsRes.data);
      
      // Check for new validated invoices (for servers)
      const newInvoices = invoicesRes.data.invoices || [];
      const myValidatedInvoices = newInvoices.filter(i => 
        i.validation_status === 'validated' && 
        (currentUser?.role !== 'server' || i.created_by === (currentUser?.full_name || currentUser?.username))
      );
      
      if (myValidatedInvoices.length > lastValidatedCount && lastValidatedCount > 0) {
        // New invoice validated! Play sound and show notification
        playNotificationSound();
        if (currentUser?.role === 'server') {
          toast.success("🧾 Votre commande est devenue une facture définitif !", {
            duration: 5000,
            style: { background: '#166534', color: 'white' }
          });
        } else {
          toast.success("🔔 Bon de commande créé avec succès !", {
            duration: 5000,
            style: { background: '#166534', color: 'white' }
          });
        }
      }
      setLastValidatedCount(myValidatedInvoices.length);
      
      // Check for new pending invoices (for managers/admins)
      if (currentUser?.role === 'manager' || currentUser?.role === 'admin') {
        const pendingInvoices = newInvoices.filter(i => i.validation_status === 'pending');
        if (pendingInvoices.length > lastPendingCount && lastPendingCount > 0) {
          playNotificationSound();
          toast.info("🔔 Nouvelle commande à valider !", {
            duration: 5000,
            style: { background: '#f59e0b', color: 'white' }
          });
        }
        setLastPendingCount(pendingInvoices.length);
      }
      
      // Sync default products to database if needed
      const customProducts = productsRes.data.products || [];
      
      // Check if we need to sync default products (check if plats/accomp/jeux are missing)
      const hasPlats = customProducts.some(p => p.department === 'salle_jardin');
      const hasAccomp = customProducts.some(p => p.department === 'accompagnements');
      const hasJeux = customProducts.some(p => p.department === 'jeux');
      const hasBar = customProducts.some(p => p.department === 'bar');
      
      if (!hasPlats || !hasAccomp || !hasJeux || !hasBar) {
        console.log("Syncing missing default products to database...");
        const allDefaultProducts = [];
        
        // Add salle_jardin (Plats) products if missing
        if (!hasPlats) {
          DEFAULT_CATALOG.salle_jardin.forEach(p => {
            allDefaultProducts.push({ ...p, department: "salle_jardin", isDefault: true });
          });
        }
        
        // Add accompagnements products if missing
        if (!hasAccomp) {
          DEFAULT_CATALOG.accompagnements.forEach(p => {
            allDefaultProducts.push({ ...p, department: "accompagnements", isDefault: true });
          });
        }
        
        // Add jeux products if missing
        if (!hasJeux) {
          DEFAULT_CATALOG.jeux.forEach(p => {
            allDefaultProducts.push({ ...p, department: "jeux", isDefault: true });
          });
        }
        
        // Add bar products if missing
        if (!hasBar) {
          DEFAULT_CATALOG.bar.forEach(p => {
            allDefaultProducts.push({ ...p, department: "bar", isDefault: true });
          });
        }
        
        if (allDefaultProducts.length > 0) {
          try {
            await axios.post(`${API}/caisse/products/sync-defaults`, allDefaultProducts);
            console.log(`Synced ${allDefaultProducts.length} default products!`);
            // Fetch again to get the updated products from DB
            const refreshRes = await axios.get(`${API}/caisse/products`);
            const dbProducts = refreshRes.data.products || [];
            buildCatalogFromProducts(dbProducts);
            setProducts(dbProducts);
          } catch (err) {
            console.error("Error syncing products:", err);
            // Fallback: merge custom products with defaults
            const merged = [...customProducts];
            allDefaultProducts.forEach(dp => {
              if (!merged.find(p => p.id === dp.id)) merged.push(dp);
            });
            buildCatalogFromProducts(merged);
            setProducts(merged);
          }
        } else {
          buildCatalogFromProducts(customProducts);
          setProducts(customProducts);
        }
      } else {
        // All departments have products, use them
        buildCatalogFromProducts(customProducts);
        setProducts(customProducts);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };
  
  // Helper function to build catalog from database products
  const buildCatalogFromProducts = (dbProducts) => {
    const newCatalog = {
      salle_jardin: [],
      accompagnements: [],
      jeux: [],
      bar: [],
      location: [],
      autres: []
    };
    
    dbProducts.forEach(p => {
      const dept = p.department || 'autres';
      if (!newCatalog[dept]) newCatalog[dept] = [];
      newCatalog[dept].push(p);
    });
    
    setCatalog(newCatalog);
  };

  // Lightweight refresh of the caisse products catalog (used after bulk auto-link)
  const refreshCatalog = async () => {
    try {
      const r = await axios.get(`${API}/caisse/products`);
      const dbProducts = r.data.products || [];
      buildCatalogFromProducts(dbProducts);
      setProducts(dbProducts);
    } catch (e) {
      console.error("refreshCatalog failed", e);
    }
  };

  const fetchMonthlyStats = async () => {
    try {
      const [year, month] = filterMonth.split("-");
      const response = await axios.get(`${API}/invoices/stats/monthly`, {
        params: { year: parseInt(year), month: parseInt(month) }
      });
      setMonthlyStats(response.data);
    } catch (error) {
      console.error("Error fetching monthly stats:", error);
    }
  };

  const initialTabSet = useRef(false);
  useEffect(() => {
    if (isAuthenticated) {
      fetchAllData();
      fetchOpenTables();

      // Set default tab ONLY on initial auth, not on every filterDate change
      if (!initialTabSet.current && (currentUser?.role === 'manager' || currentUser?.role === 'admin')) {
        setActiveTab("commande");
        initialTabSet.current = true;
      }
    } else {
      // Reset so the default tab applies again after re-login
      initialTabSet.current = false;
    }
  }, [filterDate, isAuthenticated]);

  // Auto-refresh every 5 seconds for ALL users to see updates in real-time
  useEffect(() => {
    if (isAuthenticated) {
      const interval = setInterval(() => {
        // Refresh invoices and tables for everyone
        fetchAllData();
        fetchOpenTables();
        
        // Refresh cancellation requests for admin
        if (currentUser?.role === 'admin') {
          fetchCancellationRequests();
        }
        
        // Refresh modification requests for managers/admin
        if (currentUser?.role === 'manager' || currentUser?.role === 'admin') {
          fetchModificationRequests();
        }
        
        // Refresh rapport data if on rapport tab
        if (activeTab === 'rapport') {
          fetchRapportData();
        }

        // Refresh expenses list when on the purchases tab (sync admin <-> manager)
        if (activeTab === 'achats') {
          fetchExpenses();
        }
      }, 5000); // Refresh every 5 seconds
      
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, currentUser, activeTab, rapportDate, filterDate]);

  useEffect(() => {
    if (isAuthenticated && activeTab === "stats") {
      fetchMonthlyStats();
    }
  }, [filterMonth, activeTab, isAuthenticated]);

  // Fetch cancellation requests for admin
  useEffect(() => {
    if (isAuthenticated && currentUser?.role === 'admin') {
      fetchCancellationRequests();
    }
  }, [isAuthenticated, currentUser]);

  // Fetch modification requests for managers
  useEffect(() => {
    if (isAuthenticated && (currentUser?.role === 'manager' || currentUser?.role === 'admin')) {
      fetchModificationRequests();
    }
  }, [isAuthenticated, currentUser]);

  // Fetch rapport data when rapport tab is active
  useEffect(() => {
    if (isAuthenticated && activeTab === "rapport") {
      fetchRapportData();
    }
  }, [rapportDate, activeTab, isAuthenticated]);

  // Fetch history invoices when history tab is active
  useEffect(() => {
    if (isAuthenticated && activeTab === "historique") {
      fetchHistoryInvoices();
    }
  }, [historyDate, activeTab, isAuthenticated]);

  // Fetch menu notifications for admin
  useEffect(() => {
    if (isAuthenticated && currentUser?.role === 'admin') {
      fetchMenuNotifications();
      // Refresh notifications every 30 seconds
      const interval = setInterval(fetchMenuNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, currentUser]);

  // Fetch server daily report when "mon_point" tab is active
  useEffect(() => {
    if (isAuthenticated && activeTab === "mon_point" && currentUser?.role === 'server') {
      const serverName = currentUser?.full_name || currentUser?.username;
      if (serverName) {
        fetchServerDailyReport(serverName, serverReportDate);
      }
    }
  }, [serverReportDate, activeTab, isAuthenticated, currentUser]);

  // Fetch service reports for manager
  useEffect(() => {
    if (isAuthenticated && currentUser?.role === 'manager') {
      fetchServiceReports();
      // Refresh service reports every 30 seconds
      const interval = setInterval(fetchServiceReports, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, currentUser]);

  const fetchHistoryInvoices = async () => {
    try {
      const res = await axios.get(`${API}/invoices`, { params: { date: historyDate } });
      // Only show validated invoices in history
      const validated = (res.data.invoices || []).filter(i => i.validation_status === 'validated');
      setHistoryInvoices(validated);
    } catch (error) {
      console.error("Error fetching history invoices:", error);
    }
  };

  // ============== NOTIFICATIONS (extracted to hook) ==============
  const {
    notifLatest,
    effectiveCounts,
    effectiveTotal,
    effectiveCrossRole,
    showNotifCenter,
    setShowNotifCenter,
    notifEnabled,
    notifPermission,
    toggleNotifEnabled,
    markAllNotifsRead,
    openNotifAndNavigate,
    openCrossRoleLatest,
    dismissCrossRoleBanner,
  } = useNotifications({
    isAuthenticated,
    currentUser,
    apiBase: API,
    onNavigateTab: setActiveTab,
  });

  // ============== EXPENSES FUNCTIONS ==============
  
  const fetchExpenses = async () => {
    try {
      const res = await axios.get(`${API}/expenses`);
      const expensesList = res.data.expenses || [];
      setExpenses(expensesList);
      // Update revision count for manager
      setRevisionExpensesCount(expensesList.filter(e => e.status === 'revision_requested').length);
      // Fetch admin analysis for pending/approved expenses
      if (currentUser?.role === 'admin') {
        try {
          const ares = await axios.get(`${API}/expenses/analysis`);
          const map = {};
          (ares.data.analyses || []).forEach(a => { map[a.expense_id] = a; });
          setExpenseAnalyses(map);
        } catch (err) {
          console.error("Error fetching expense analysis:", err);
        }
      }
    } catch (error) {
      console.error("Error fetching expenses:", error);
    }
  };

  // ============== MENU NOTIFICATIONS FUNCTIONS (Admin) ==============
  
  const fetchMenuNotifications = async () => {
    try {
      const res = await axios.get(`${API}/menu-notifications`);
      setMenuNotifications(res.data.notifications || []);
      setUnreadNotificationCount(res.data.unread_count || 0);
    } catch (error) {
      console.error("Error fetching menu notifications:", error);
    }
  };

  const markNotificationRead = async (notificationId) => {
    try {
      await axios.put(`${API}/menu-notifications/${notificationId}/read`);
      fetchMenuNotifications();
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const markAllNotificationsRead = async () => {
    try {
      await axios.put(`${API}/menu-notifications/mark-all-read`);
      fetchMenuNotifications();
      toast.success("Toutes les notifications marquées comme lues");
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
    }
  };

  // ============== NOTES/INSTRUCTIONS NOTIFICATIONS ==============
  
  const fetchUnreadNotesCount = async () => {
    if (!currentUser?.role) return;
    try {
      const res = await axios.get(`${API}/instructions/unread-count`, {
        params: { reader_role: currentUser.role }
      });
      const newCount = res.data.unread_count || 0;
      
      // Play sound if new notes arrived
      if (newCount > unreadNotesCount && unreadNotesCount > 0) {
        playNotificationSound();
        toast.info(`${newCount - unreadNotesCount} nouvelle(s) note(s) reçue(s)`);
      }
      
      setUnreadNotesCount(newCount);
    } catch (error) {
      console.error("Error fetching unread notes count:", error);
    }
  };

  const markAllNotesRead = async () => {
    if (!currentUser?.role) return;
    try {
      await axios.put(`${API}/instructions/mark-all-read`, { reader_role: currentUser.role });
      setUnreadNotesCount(0);
    } catch (error) {
      console.error("Error marking all notes as read:", error);
    }
  };

  // Fetch unread notes count periodically for manager/admin
  useEffect(() => {
    if (isAuthenticated && (currentUser?.role === 'manager' || currentUser?.role === 'admin')) {
      fetchUnreadNotesCount();
      const interval = setInterval(fetchUnreadNotesCount, 15000); // Check every 15 seconds
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, currentUser?.role]);

  // ============== SERVER DAILY REPORT FUNCTIONS ==============
  
  const fetchServerDailyReport = async (serverName, date) => {
    try {
      const targetDate = date || serverReportDate;
      const res = await axios.get(`${API}/server-daily-report/${encodeURIComponent(serverName)}?date=${targetDate}`);
      setServerDailyReport(res.data);
    } catch (error) {
      console.error("Error fetching server daily report:", error);
    }
  };

  // ============== CURRENT ACCOUNTS (for expense funding source) ==============
  const fetchAvailableAccounts = async () => {
    try {
      const res = await axios.get(`${API}/current-accounts`, { params: { include_closed: false, auto_run: false } });
      setAvailableAccounts(res.data.accounts || []);
    } catch (err) {
      console.error("Error fetching accounts:", err);
    }
  };

  const allocateExpenseToAccount = async (expense, accountId, affectsCA = true) => {
    try {
      // Special sentinel value to directly create a new dedicated account
      if (accountId === "__create_new__") {
        const expAmount = parseFloat(expense.amount) || 0;
        const ok = window.confirm(
          `Créer un NOUVEAU compte courant dédié de ${formatPrice(expAmount)} F pour cet achat ?\n\n` +
          `Nom : "Recharge auto pour ${(expense.description || '').slice(0, 60)}"\n` +
          `Solde initial : ${formatPrice(expAmount)} F`
        );
        if (!ok) return;
        const res = await axios.post(`${API}/expenses/${expense.id}/allocate-account-smart`, {
          mode: "create_new",
          new_account_name: `Recharge auto pour ${(expense.description || '').slice(0, 80)}`,
          affects_ca: affectsCA,
        });
        if (res.data?.success) {
          toast.success(`Nouveau compte créé (${formatPrice(expAmount)} F) et dépense imputée.`);
        }
        fetchExpenses();
        fetchAvailableAccounts();
        return;
      }
      if (!accountId) {
        await axios.delete(`${API}/expenses/${expense.id}/allocate-account`);
        toast.success("Compte courant détaché");
        fetchExpenses();
        fetchAvailableAccounts();
        return;
      }
      const acc = availableAccounts.find((a) => a.id === accountId);
      const expAmount = parseFloat(expense.amount) || 0;
      const balance = parseFloat(acc?.balance_available) || 0;
      // If selected account has enough balance, perform standard allocation.
      if (balance >= expAmount) {
        await axios.post(`${API}/expenses/${expense.id}/allocate-account`, {
          account_id: accountId,
          account_name: acc?.name || "",
          affects_ca: affectsCA,
        });
        toast.success(`Dépense imputée sur : ${acc?.name || ""}`);
        fetchExpenses();
        fetchAvailableAccounts();
        return;
      }
      // Insufficient balance — ask admin which strategy to use.
      const missing = expAmount - balance;
      const choice = window.prompt(
        `⚠ Le compte "${acc?.name || ''}" n'a que ${formatPrice(balance)} F disponible.\n` +
        `Il manque ${formatPrice(missing)} F pour couvrir cet achat de ${formatPrice(expAmount)} F.\n\n` +
        `Choisissez votre stratégie en tapant le numéro :\n` +
        `1 — Recharger ce compte de ${formatPrice(missing)} F automatiquement\n` +
        `2 — Créer un NOUVEAU compte courant dédié de ${formatPrice(expAmount)} F\n` +
        `3 — Imputer quand même (le compte ira en négatif)\n` +
        `(annuler pour ne rien faire)`,
        "1"
      );
      if (!choice) return;
      let mode = null;
      if (choice.trim() === "1") mode = "topup_existing";
      else if (choice.trim() === "2") mode = "create_new";
      else if (choice.trim() === "3") mode = "allow_negative";
      else {
        toast.error("Choix invalide.");
        return;
      }
      const body = { mode, affects_ca: affectsCA };
      if (mode === "create_new") {
        body.new_account_name = `Recharge auto pour ${(expense.description || '').slice(0, 80)}`;
      } else {
        body.account_id = accountId;
      }
      const res = await axios.post(`${API}/expenses/${expense.id}/allocate-account-smart`, body);
      const topUp = res.data?.topped_up_amount || 0;
      if (mode === "topup_existing") toast.success(`Compte rechargé de ${formatPrice(topUp)} F et dépense imputée.`);
      else if (mode === "create_new") toast.success(`Nouveau compte créé (${formatPrice(expAmount)} F) et dépense imputée.`);
      else toast.success(`Dépense imputée — le compte est en découvert.`);
      fetchExpenses();
      fetchAvailableAccounts();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur d'imputation");
    }
  };

  useEffect(() => {
    if (isAuthenticated && (currentUser?.role === "admin" || currentUser?.role === "manager")) {
      fetchAvailableAccounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, currentUser]);

  const [expenseSubmitLoading, setExpenseSubmitLoading] = useState(false);
  const createExpense = async () => {
    if (expenseSubmitLoading) return; // prevent double-submit
    try {
      setExpenseSubmitLoading(true);
      // Multi-items mode : Achats communs supports a list of items
      if (commonItems.length > 0) {
        const totalAmount = commonItems.reduce((s, it) => s + (it.quantity || 1) * (it.unit_price || 0), 0);
        const firstCat = commonItems[0]?.category || expenseForm.category || "autres";
        const desc = expenseForm.description?.trim()
          || `Achats communs - ${commonItems.length} article(s) - ${format(new Date(), "dd/MM/yyyy")}`;
        await axios.post(`${API}/expenses?${actorQs()}`, {
          category: firstCat,
          description: desc,
          amount: totalAmount,
          quantity: commonItems.length,
          unit_price: null,
          supplier: expenseForm.supplier || null,
          planned_date: expenseForm.planned_date,
          receipt_image: expenseForm.receipt_image,
          is_group: true,
          items: commonItems.map((it) => ({
            category: it.category || firstCat,
            description: it.description,
            quantity: it.quantity || 1,
            unit_price: it.unit_price || 0,
            amount: (it.quantity || 1) * (it.unit_price || 0),
            expense_type: it.expense_type || expenseForm.expense_type || "achat",
            destination: it.destination || expenseForm.destination || null,
            // Override par item ; null = utilise la valeur globale to_stock
            passer_en_stock: (it.passer_en_stock === null || it.passer_en_stock === undefined) ? null : !!it.passer_en_stock,
          })),
          requested_by: currentUser?.full_name || currentUser?.username || "Gérante",
          funded_by_account_id: expenseForm.funded_by_account_id || null,
          funded_by_account_name: expenseForm.funded_by_account_name || null,
          funded_affects_ca: expenseForm.funded_affects_ca,
          expense_type: expenseForm.expense_type || "achat",
          destination: expenseForm.destination || null,
          to_stock: !!expenseForm.to_stock,
        });
        toast.success(`Achats communs créés avec ${commonItems.length} article(s) !`);
        setShowExpenseModal(false);
        setCommonItems([]);
        setCommonNewItem({ category: "cuisine", description: "", quantity: 1, unit_price: 0, passer_en_stock: null });
        setExpenseForm({
          category: "cuisine",
          description: "",
          quantity: 1,
          unit_price: 0,
          amount: 0,
          supplier: "",
          planned_date: format(new Date(), "yyyy-MM-dd"),
          receipt_image: null,
        });
        fetchExpenses();
        return;
      }

      // Legacy single-item mode (fallback if no items added yet)
      if (!expenseForm.description || expenseForm.unit_price <= 0 || expenseForm.quantity <= 0) {
        toast.error("Ajoutez au moins un article dans la liste");
        return;
      }
      
      const totalAmount = expenseForm.quantity * expenseForm.unit_price;
      
      await axios.post(`${API}/expenses`, {
        ...expenseForm,
        amount: totalAmount,
        requested_by: currentUser?.full_name || currentUser?.username || "Gérante"
      });
      
      toast.success("Demande d'achat créée !");
      setShowExpenseModal(false);
      setExpenseForm({
        category: "cuisine",
        description: "",
        quantity: 1,
        unit_price: 0,
        amount: 0,
        supplier: "",
        planned_date: format(new Date(), "yyyy-MM-dd"),
        receipt_image: null
      });
      fetchExpenses();
    } catch (error) {
      console.error("Error creating expense:", error);
      toast.error("Erreur lors de la création");
    } finally {
      setExpenseSubmitLoading(false);
    }
  };

  // Helpers for multi-item Achats communs modal
  const addCommonItem = () => {
    if (!commonNewItem.description.trim()) {
      toast.error("Description requise");
      return;
    }
    if ((commonNewItem.unit_price || 0) <= 0) {
      toast.error("Prix unitaire requis");
      return;
    }
    const amount = (commonNewItem.quantity || 1) * (commonNewItem.unit_price || 0);
    setCommonItems([...commonItems, { ...commonNewItem, amount, id: Date.now() }]);
    setCommonNewItem({
      category: commonNewItem.category,
      description: "",
      quantity: 1,
      unit_price: 0,
      expense_type: commonNewItem.expense_type,
      destination: commonNewItem.destination,
    });
  };
  const removeCommonItem = (id) => setCommonItems(commonItems.filter((i) => i.id !== id));
  const getCommonTotal = () => commonItems.reduce((s, it) => s + (it.amount || 0), 0);

  // ----- Revise modal helpers -----
  const openReviseModal = (expense) => {
    setRevisingExpense(expense);
    const existingItems = (expense.items && expense.items.length > 0)
      ? expense.items.map((it, i) => ({
          ...it,
          amount: (it.quantity || 1) * (it.unit_price || 0),
          _k: i + Date.now(),
        }))
      : [{
          category: expense.category || "cuisine",
          description: expense.description || "",
          quantity: expense.quantity || 1,
          unit_price: expense.unit_price || 0,
          amount: (expense.quantity || 1) * (expense.unit_price || 0),
          _k: Date.now(),
        }];
    setReviseItems(existingItems);
    setReviseSupplier(expense.supplier || "");
    setReviseNote("");
    setReviseNewItem({ category: "cuisine", description: "", quantity: 1, unit_price: 0 });
    setShowReviseModal(true);
  };
  const addReviseItem = () => {
    if (!reviseNewItem.description.trim()) { toast.error("Description requise"); return; }
    const amt = (reviseNewItem.quantity || 1) * (reviseNewItem.unit_price || 0);
    setReviseItems([...reviseItems, { ...reviseNewItem, amount: amt, _k: Date.now() }]);
    setReviseNewItem({ category: reviseNewItem.category, description: "", quantity: 1, unit_price: 0 });
  };
  const removeReviseItem = (_k) => setReviseItems(reviseItems.filter((i) => i._k !== _k));
  const updateReviseItem = (_k, patch) => setReviseItems(reviseItems.map((it) => {
    if (it._k !== _k) return it;
    const merged = { ...it, ...patch };
    merged.amount = (merged.quantity || 1) * (merged.unit_price || 0);
    return merged;
  }));
  const getReviseTotal = () => reviseItems.reduce((s, it) => s + (it.amount || 0), 0);
  const submitRevision = async (directApprove = false) => {
    if (reviseItems.length === 0) { toast.error("Au moins un article requis"); return; }
    const total = getReviseTotal();
    const payload = {
      status: directApprove ? "approved" : "revision_requested",
      admin_notes: reviseNote || (directApprove ? "Approuvé après modification" : "Veuillez réviser cette demande"),
      amount: total,
      supplier: reviseSupplier || null,
      items: reviseItems.map((it) => ({
        category: it.category,
        description: it.description,
        quantity: it.quantity || 1,
        unit_price: it.unit_price || 0,
        amount: it.amount || (it.quantity || 1) * (it.unit_price || 0),
      })),
    };
    if (directApprove) {
      payload.approved_by = "Administrateur";
    }
    try {
      await axios.put(`${API}/expenses/${revisingExpense.id}`, payload);
      toast.success(directApprove ? "Demande approuvée après modification" : "Demande renvoyée à la gérante pour révision");
      setShowReviseModal(false);
      setRevisingExpense(null);
      fetchExpenses();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const updateExpense = async (expenseId, updateData) => {
    try {
      await axios.put(`${API}/expenses/${expenseId}`, updateData);
      toast.success("Dépense mise à jour !");
      fetchExpenses();
      setEditingExpense(null);
    } catch (error) {
      console.error("Error updating expense:", error);
      toast.error("Erreur lors de la mise à jour");
    }
  };

  // "Recevoir en stock" — déclenche manuellement la mise en stock d'un achat
  // (utile pour les achats boissons reçus physiquement avant validation admin)
  const receiveExpenseStock = async (expenseId) => {
    try {
      const res = await axios.post(`${API}/expenses/${expenseId}/receive-stock`, {
        user_name: currentUser?.full_name || currentUser?.username || "Caisse",
      });
      if (res.data?.already_received) {
        toast.info("Cet achat est déjà en stock");
      } else {
        toast.success(`${res.data?.received_items || 0} article(s) ajouté(s) au stock`);
      }
      fetchExpenses();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur de réception");
    }
  };

  const deleteExpense = async (expenseId) => {
    if (!confirm("Supprimer cette dépense ?")) return;
    try {
      await axios.delete(`${API}/expenses/${expenseId}`);
      toast.success("Dépense supprimée");
      fetchExpenses();
    } catch (error) {
      console.error("Error deleting expense:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  // Convert approved expense into a purchase order
  const convertExpenseToPO = async (expense) => {
    if (expense.converted_to_po_id) {
      toast.info(`Déjà converti en ${expense.converted_to_po_number || "BC"}`);
      return;
    }
    if (!confirm(`Convertir « ${expense.description} » en bon de commande ?`)) return;
    try {
      const res = await axios.post(`${API}/purchase-orders/from-expense/${expense.id}`, {
        created_by: currentUser?.name || currentUser?.username || "Admin",
      });
      if (res.data?.success) {
        toast.success(`Bon de commande créé : ${res.data.purchase_order?.number}`);
        fetchExpenses();
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de la conversion");
    }
  };

  // Assign an expense to a specific week
  const assignExpenseToWeek = async (expenseId, weekStart) => {
    try {
      await axios.put(`${API}/expenses/${expenseId}/assign-week`, { week_start: weekStart });
      toast.success("Dépense rattachée à la semaine");
      fetchExpenses();
    } catch (error) {
      console.error("Error assigning expense to week:", error);
      toast.error("Erreur lors du rattachement");
    }
  };

  // ============== END OF SERVICE FUNCTIONS (Server) ==============

  const submitEndOfService = async () => {
    try {
      setIsSubmittingEndOfService(true);
      const serverName = currentUser?.full_name || currentUser?.username;
      if (!serverName) {
        toast.error("Impossible d'identifier le serveur connecté.");
        setIsSubmittingEndOfService(false);
        return;
      }
      
      await axios.post(`${API}/server-end-of-service`, {
        server_name: serverName,
        server_id: currentUser?.id,
        date: format(new Date(), "yyyy-MM-dd"),
        observation: endOfServiceObservation
      });
      
      toast.success("Votre point journalier a été envoyé à la gérante !");
      setShowEndOfServiceModal(false);
      setEndOfServiceObservation("");
    } catch (error) {
      console.error("Error submitting end of service:", error);
      const detail = error?.response?.data?.detail || error?.message || "Erreur réseau";
      toast.error(`Échec de l'envoi : ${detail}`);
    } finally {
      setIsSubmittingEndOfService(false);
    }
  };

  // ============== SERVICE REPORTS FUNCTIONS (Manager) ==============

  const fetchServiceReports = async () => {
    try {
      const res = await axios.get(`${API}/server-end-of-service-reports`);
      setServiceReports(res.data.reports || []);
      setUnreadServiceReportsCount(res.data.unread_count || 0);
    } catch (error) {
      console.error("Error fetching service reports:", error);
    }
  };

  const markServiceReportRead = async (reportId) => {
    try {
      await axios.put(`${API}/server-end-of-service-reports/${reportId}/read`);
      fetchServiceReports();
    } catch (error) {
      console.error("Error marking service report as read:", error);
    }
  };

  const markAllServiceReportsRead = async () => {
    try {
      await axios.put(`${API}/server-end-of-service-reports/mark-all-read`);
      fetchServiceReports();
      toast.success("Tous les points marqués comme lus");
    } catch (error) {
      console.error("Error marking all service reports as read:", error);
    }
  };

  // Compare server report with actual data
  const compareServerReport = async (report) => {
    try {
      const res = await axios.get(`${API}/server-end-of-service-reports/${report.id}/compare`);
      return res.data;
    } catch (error) {
      console.error("Error comparing report:", error);
      toast.error("Erreur lors de la comparaison");
      return null;
    }
  };

  // Validate, request revision, or reject a report
  const handleReportValidation = async (reportId, action, comment = "") => {
    try {
      await axios.put(`${API}/server-end-of-service-reports/${reportId}/validate`, {
        action,
        comment,
        validated_by: currentUser?.full_name || "Gérante"
      });
      
      const messages = {
        validate: "Point validé avec succès",
        request_revision: "Demande de révision envoyée",
        reject: "Point rejeté"
      };
      
      toast.success(messages[action] || "Action effectuée");
      fetchServiceReports();
      setViewingServerReport(null);
      setViewingServerDetailedReport(null);
      setReportComparison(null);
    } catch (error) {
      console.error("Error validating report:", error);
      toast.error("Erreur lors de la validation");
    }
  };

  // State for report comparison
  const [reportComparison, setReportComparison] = useState(null);
  const [validationComment, setValidationComment] = useState("");
  const [deleteReportCode, setDeleteReportCode] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedReports, setSelectedReports] = useState([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleteCode, setBulkDeleteCode] = useState("");

  // Delete a server report with confirmation code
  const handleDeleteServerReport = async (reportId) => {
    const CORRECT_CODE = "0631";
    
    if (deleteReportCode !== CORRECT_CODE) {
      toast.error("Code de suppression incorrect");
      return;
    }
    
    try {
      await axios.delete(`${API}/server-end-of-service-reports/${reportId}`);
      toast.success("Point supprimé avec succès");
      fetchServiceReports();
      setViewingServerReport(null);
      setViewingServerDetailedReport(null);
      setReportComparison(null);
      setDeleteReportCode("");
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error("Error deleting report:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  // Toggle selection of a report
  const toggleReportSelection = (reportId) => {
    setSelectedReports(prev => 
      prev.includes(reportId) 
        ? prev.filter(id => id !== reportId)
        : [...prev, reportId]
    );
  };

  // Select/Deselect all reports
  const toggleSelectAllReports = () => {
    if (selectedReports.length === serviceReports.length) {
      setSelectedReports([]);
    } else {
      setSelectedReports(serviceReports.map(r => r.id));
    }
  };

  // Bulk delete selected reports
  const handleBulkDeleteReports = async () => {
    const CORRECT_CODE = "0631";
    
    if (bulkDeleteCode !== CORRECT_CODE) {
      toast.error("Code de suppression incorrect");
      return;
    }
    
    if (selectedReports.length === 0) {
      toast.error("Aucun point sélectionné");
      return;
    }
    
    try {
      let successCount = 0;
      let errorCount = 0;
      
      for (const reportId of selectedReports) {
        try {
          await axios.delete(`${API}/server-end-of-service-reports/${reportId}`);
          successCount++;
        } catch (error) {
          errorCount++;
          console.error(`Error deleting report ${reportId}:`, error);
        }
      }
      
      if (successCount > 0) {
        toast.success(`${successCount} point(s) supprimé(s) avec succès`);
      }
      if (errorCount > 0) {
        toast.error(`${errorCount} point(s) n'ont pas pu être supprimés`);
      }
      
      fetchServiceReports();
      setSelectedReports([]);
      setBulkDeleteCode("");
      setShowBulkDeleteConfirm(false);
    } catch (error) {
      console.error("Error in bulk delete:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  // Open detailed view of a server's daily report with comparison
  const openServerReportDetail = async (report) => {
    try {
      setLoadingServerDetail(true);
      setViewingServerReport(report);
      setShowServiceReportsPanel(false);
      setValidationComment("");
      
      // Fetch the detailed daily report for this server
      const res = await axios.get(`${API}/server-daily-report/${encodeURIComponent(report.server_name)}?date=${report.date}`);
      setViewingServerDetailedReport(res.data);
      
      // Fetch comparison with actual data
      const comparison = await compareServerReport(report);
      setReportComparison(comparison);
      
      // Mark as read
      if (!report.is_read) {
        markServiceReportRead(report.id);
      }
    } catch (error) {
      console.error("Error fetching server detail report:", error);
      toast.error("Erreur lors du chargement du rapport détaillé");
    } finally {
      setLoadingServerDetail(false);
    }
  };

  // ============== SHOPPING LIST FUNCTIONS ==============
  
  const addToShoppingList = () => {
    if (!newListItem.description || newListItem.quantity <= 0) {
      toast.error("Description et quantité requises");
      return;
    }
    const totalAmount = (newListItem.quantity || 1) * (newListItem.unit_price || 0);
    const supplier = (newListItem.supplier || shoppingListSupplier || "").trim();
    setShoppingList([...shoppingList, { ...newListItem, supplier, amount: totalAmount, id: Date.now() }]);
    setNewListItem({ category: "cuisine", description: "", quantity: 1, unit_price: 0, supplier: "" });
    toast.success("Article ajouté à la liste");
  };

  const removeFromShoppingList = (itemId) => {
    setShoppingList(shoppingList.filter(item => item.id !== itemId));
  };

  const submitShoppingList = async () => {
    if (shoppingList.length === 0) {
      toast.error("La liste est vide");
      return;
    }

    try {
      // Group items by supplier. An item without supplier falls into "__NO_SUPPLIER__"
      const groups = {};
      shoppingList.forEach((item) => {
        const key = (item.supplier || "").trim() || "__NO_SUPPLIER__";
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
      });

      const groupKeys = Object.keys(groups);
      const now = format(new Date(), "dd/MM/yyyy HH:mm");
      const createdFor = [];

      for (const supKey of groupKeys) {
        const items = groups[supKey];
        const supplierName = supKey === "__NO_SUPPLIER__" ? "" : supKey;
        const groupId = `GRP-${Date.now()}-${supKey.slice(0, 8).replace(/\s/g, "")}`;
        const groupTotal = items.reduce((sum, it) => sum + (it.amount || 0), 0);
        const groupName = supplierName
          ? `Liste ${supplierName} - ${now}`
          : `Liste sans fournisseur - ${now}`;

        await axios.post(`${API}/expenses?${actorQs()}`, {
          category: items[0].category,
          description: groupName,
          quantity: items.length,
          unit_price: groupTotal,
          amount: groupTotal,
          supplier: supplierName || null,
          planned_date: shoppingListDate,
          requested_by: currentUser?.full_name || currentUser?.username || "Gérante",
          is_group: true,
          group_id: groupId,
          items: items.map((it) => ({
            category: it.category,
            description: it.description,
            quantity: it.quantity,
            unit_price: it.unit_price,
            amount: it.amount,
          })),
        });
        createdFor.push(supplierName || "sans fournisseur");
      }

      toast.success(
        createdFor.length === 1
          ? `Demande créée pour ${createdFor[0]} (${shoppingList.length} article(s))`
          : `${createdFor.length} demandes créées — ${createdFor.join(", ")}`
      );
      setShoppingList([]);
      setShoppingListSupplier("");
      setShowShoppingListModal(false);
      fetchExpenses();
    } catch (error) {
      console.error("Error submitting shopping list:", error);
      toast.error("Erreur lors de la soumission");
    }
  };

  const getShoppingListTotal = () => {
    return shoppingList.reduce((sum, item) => sum + item.amount, 0);
  };

  // ============== PRINT EXPENSE PDF ==============
  
  const printExpensePDF = (expense) => {
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
    const categoryLabels = {
      cuisine: 'Cuisine',
      bar: 'Bar',
      paiement: 'Paiement',
      autres: 'Autres'
    };
    
    const catColor = (c) => c === 'cuisine' ? '#22c55e' : c === 'bar' ? '#f97316' : c === 'paiement' ? '#3b82f6' : '#64748b';
    // Hide struck items from PDF preview (consistency with printed approved list)
    const visibleItems = (expense.is_group && Array.isArray(expense.items))
      ? expense.items.filter(it => !it.struck)
      : (expense.items || []);
    const visibleAmount = (expense.is_group && Array.isArray(expense.items))
      ? visibleItems.reduce((s, it) => s + (it.amount || 0), 0) || expense.amount
      : expense.amount;
    const itemsBlock = (expense.is_group && visibleItems.length > 0)
      ? `
        <div class="details">
          <div class="details-title">Détail des articles (${visibleItems.length})</div>
          <table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:9pt;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="padding:5px;text-align:left;border-bottom:1px solid #ccc;">#</th>
                <th style="padding:5px;text-align:left;border-bottom:1px solid #ccc;">Catégorie</th>
                <th style="padding:5px;text-align:left;border-bottom:1px solid #ccc;">Description</th>
                <th style="padding:5px;text-align:right;border-bottom:1px solid #ccc;">Qté</th>
                <th style="padding:5px;text-align:right;border-bottom:1px solid #ccc;">PU</th>
                <th style="padding:5px;text-align:right;border-bottom:1px solid #ccc;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${visibleItems.map((it, idx) => `
                <tr>
                  <td style="padding:4px 5px;border-bottom:1px solid #eee;">${idx + 1}</td>
                  <td style="padding:4px 5px;border-bottom:1px solid #eee;"><span style="background:${catColor(it.category)};color:white;padding:1px 6px;border-radius:8px;font-size:8pt;">${categoryLabels[it.category] || it.category}</span></td>
                  <td style="padding:4px 5px;border-bottom:1px solid #eee;">${it.description}</td>
                  <td style="padding:4px 5px;border-bottom:1px solid #eee;text-align:right;">${it.quantity}</td>
                  <td style="padding:4px 5px;border-bottom:1px solid #eee;text-align:right;">${formatPrice(it.unit_price)} F</td>
                  <td style="padding:4px 5px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${formatPrice(it.amount)} F</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `
      : (expense.quantity && expense.unit_price ? `
        <div class="details">
          <div class="details-title">Quantité & Prix</div>
          <div>Qté ${expense.quantity} × ${formatPrice(expense.unit_price)} F</div>
        </div>
      ` : '');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Bon d'Achat - ${expense.description}</title>
          <meta charset="UTF-8">
          <style>
            @page { size: A5; margin: 10mm; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 20px; background: #fff; color: #333; font-size: 10pt; }
            .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 10px; margin-bottom: 15px; }
            .logo { width: 70px; height: 70px; }
            .logo img { width: 100%; height: 100%; object-fit: contain; }
            .header-right { text-align: right; font-size: 9pt; }
            .doc-title { text-align: center; font-size: 14pt; font-weight: bold; margin: 15px 0; text-transform: uppercase; }
            .badge { display: inline-block; background: #22c55e; color: #fff; padding: 3px 10px; border-radius: 10px; font-size: 9pt; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 15px 0; }
            .info-box { padding: 8px; border: 1px solid #ddd; }
            .info-label { font-size: 8pt; color: #666; text-transform: uppercase; }
            .info-value { font-size: 10pt; font-weight: 600; margin-top: 2px; }
            .amount-box { border: 2px solid #333; padding: 15px; text-align: center; margin: 15px 0; }
            .amount-label { font-size: 9pt; color: #666; }
            .amount-value { font-size: 24pt; font-weight: bold; }
            .details { border: 1px solid #ddd; padding: 10px; margin: 10px 0; }
            .details-title { font-size: 8pt; color: #666; text-transform: uppercase; margin-bottom: 5px; }
            .signatures { display: flex; justify-content: space-between; margin-top: 25px; }
            .signature-box { text-align: center; width: 45%; }
            .signature-line { border-bottom: 1px solid #333; height: 30px; margin-bottom: 3px; }
            .signature-label { font-size: 8pt; color: #666; }
            .print-date { text-align: center; font-size: 8pt; color: #999; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo"><img src="${LOGO_BASE64}" alt="Logo" /></div>
            <div class="header-right">
              <p>Tél: +229 01 4147 0000</p>
              <p>Fidjrossè, Cotonou</p>
            </div>
          </div>

          <div class="doc-title">
            Bon d'Achat <span class="badge" style="background:${expense.status === 'admin_review' ? '#f59e0b' : '#22c55e'};">${expense.status === 'admin_review' ? '⏳ APERÇU (en cours de validation)' : '✓ APPROUVÉ'}</span>
          </div>

          <div class="info-grid">
            <div class="info-box">
              <div class="info-label">Catégorie</div>
              <div class="info-value">${categoryLabels[expense.category] || expense.category}</div>
            </div>
            <div class="info-box">
              <div class="info-label">Date prévue</div>
              <div class="info-value">${expense.planned_date || 'Non spécifiée'}</div>
            </div>
            <div class="info-box">
              <div class="info-label">Demandé par</div>
              <div class="info-value">${expense.requested_by || 'N/A'}</div>
            </div>
            <div class="info-box">
              <div class="info-label">Approuvé par</div>
              <div class="info-value">${expense.approved_by || 'Administrateur'}</div>
            </div>
          </div>

          <div class="details">
            <div class="details-title">Description</div>
            <div>${expense.description}</div>
          </div>

          ${expense.supplier ? `
          <div class="details">
            <div class="details-title">Fournisseur</div>
            <div>${expense.supplier}</div>
          </div>
          ` : ''}

          ${itemsBlock}

          <div class="amount-box">
            <div class="amount-label">${expense.status === 'admin_review' ? 'MONTANT PROVISOIRE (corrigé)' : 'MONTANT APPROUVÉ'}</div>
            <div class="amount-value">${formatPrice(visibleAmount)} F CFA</div>
          </div>

          <div class="signatures">
            <div class="signature-box">
              <div class="signature-line"></div>
              <div class="signature-label">Signature Gérante</div>
            </div>
            <div class="signature-box">
              <div class="signature-line"></div>
              <div class="signature-label">Signature Admin</div>
            </div>
          </div>

          <div class="print-date">
            Imprimé le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}
          </div>

          <script>window.onload = function() { setTimeout(function() { window.print(); }, 300); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Print all approved expenses as a summary PDF
  const printAllApprovedExpenses = () => {
    const approved = expenses.filter(e => e.status === 'approved');
    if (approved.length === 0) {
      toast.error("Aucune demande approuvée à imprimer");
      return;
    }

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    // Helper: keep only non-struck items for grouped expenses
    const keptItems = (e) => (e.items || []).filter(it => !it.struck);
    const expenseAmount = (e) => {
      if (e.is_group && Array.isArray(e.items)) {
        return keptItems(e).reduce((s, it) => s + (it.amount || 0), 0) || e.amount;
      }
      return e.amount;
    };
    const total = approved.reduce((sum, e) => sum + expenseAmount(e), 0);
    
    const categoryLabels = {
      cuisine: 'Cuisine',
      bar: 'Bar',
      paiement: 'Paiement',
      autres: 'Autres'
    };
    
    const catColor = (c) => c === 'cuisine' ? '#22c55e' : c === 'bar' ? '#f97316' : c === 'paiement' ? '#3b82f6' : '#64748b';

    // Compute brief audit summary (counts only — struck motifs deliberately excluded from print)
    const norm = (s) => String(s || '').trim().toLowerCase();
    const briefAudit = (e) => {
      if (!e.is_group || !e.original_items) return null;
      const finals = e.items || [];
      const finalsByDesc = new Map();
      finals.forEach((it, i) => {
        const k = norm(it.description);
        if (!finalsByDesc.has(k)) finalsByDesc.set(k, []);
        finalsByDesc.get(k).push({ ...it, _i: i });
      });
      let added = 0, removed = 0, struck = 0, modified = 0;
      const matched = new Set();
      e.original_items.forEach((orig) => {
        const k = norm(orig.description);
        const cands = finalsByDesc.get(k) || [];
        const m = cands.find((c) => !matched.has(c._i));
        if (!m) { removed += 1; return; }
        matched.add(m._i);
        if (m.struck) { struck += 1; return; }
        if (Number(m.quantity) !== Number(orig.quantity) || Number(m.unit_price) !== Number(orig.unit_price)) modified += 1;
      });
      finals.forEach((it, i) => { if (!matched.has(i) && !it.struck) added += 1; });
      const total = added + removed + struck + modified;
      if (total === 0) return null;
      const parts = [];
      if (added) parts.push(`+${added} ajoutée${added > 1 ? 's' : ''}`);
      if (removed) parts.push(`−${removed} supprimée${removed > 1 ? 's' : ''}`);
      if (struck) parts.push(`${struck} rayée${struck > 1 ? 's' : ''}`);
      if (modified) parts.push(`${modified} modifiée${modified > 1 ? 's' : ''}`);
      return parts.join(', ');
    };

    const itemsHtml = approved.map((expense, index) => {
      const visibleItems = (expense.is_group && Array.isArray(expense.items))
        ? expense.items.filter(it => !it.struck)
        : (expense.items || []);
      const headerAmount = expenseAmount(expense);
      const auditSummary = briefAudit(expense);
      const headerRow = `
        <tr>
          <td style="padding: 10px 8px; border-bottom: 1px solid #eee; vertical-align: top; font-size: 11pt;">${index + 1}</td>
          <td style="padding: 10px 8px; border-bottom: 1px solid #eee; vertical-align: top;">
            <span style="background: ${catColor(expense.category)}; color: white; padding: 3px 10px; border-radius: 10px; font-size: 11pt; font-weight: 600;">
              ${categoryLabels[expense.category] || expense.category}
            </span>
          </td>
          <td style="padding: 10px 8px; border-bottom: 1px solid #eee; vertical-align: top; font-size: 12pt;">
            ${expense.is_group ? '<strong>📦 ' + expense.description + '</strong> <span style="font-size:10pt;color:#666;">(' + visibleItems.length + ' articles)</span>' : expense.description}
            ${auditSummary ? `<div style="margin-top:4px;font-size:9pt;color:#92400e;font-style:italic;">📜 Liste corrigée par admin : ${auditSummary}</div>` : ''}
          </td>
          <td style="padding: 10px 8px; border-bottom: 1px solid #eee; vertical-align: top; font-size: 11pt;">${expense.supplier || '-'}</td>
          <td style="padding: 10px 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: 700; vertical-align: top; font-size: 12pt;">${formatPrice(headerAmount)} F</td>
        </tr>
      `;
      // Expand sub-items for grouped lists (only non-struck items shown — struck items
      // and their reasons are intentionally hidden from the printed approved list)
      if (expense.is_group && visibleItems.length > 0) {
        const subRows = visibleItems.map((it, sIdx) => `
          <tr style="background: #fafafa;">
            <td style="padding: 6px 8px; border-bottom: 1px solid #f0f0f0; text-align: right; font-size: 10pt; color: #666;">${index + 1}.${sIdx + 1}</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid #f0f0f0;">
              <span style="background: ${catColor(it.category)}; opacity: 0.75; color: white; padding: 2px 8px; border-radius: 8px; font-size: 10pt;">
                ${categoryLabels[it.category] || it.category}
              </span>
            </td>
            <td style="padding: 6px 8px 6px 24px; border-bottom: 1px solid #f0f0f0; font-size: 11pt; color: #333;">
              ↳ ${it.description}
              <span style="color: #555; font-size: 10pt;"> — Qté ${it.quantity} × ${formatPrice(it.unit_price)} F</span>
            </td>
            <td style="padding: 6px 8px; border-bottom: 1px solid #f0f0f0;"></td>
            <td style="padding: 6px 8px; border-bottom: 1px solid #f0f0f0; text-align: right; font-size: 11pt; color: #222; font-weight: 600;">${formatPrice(it.amount)} F</td>
          </tr>
        `).join('');
        return headerRow + subRows;
      }
      // Single item: enrich with qty × PU when available
      if (!expense.is_group && expense.quantity && expense.unit_price) {
        const detailRow = `
          <tr style="background: #fafafa;">
            <td></td><td></td>
            <td style="padding: 4px 8px 6px 24px; font-size: 10pt; color: #555; border-bottom: 1px solid #f0f0f0;">
              ↳ Qté ${expense.quantity} × ${formatPrice(expense.unit_price)} F
            </td>
            <td style="border-bottom: 1px solid #f0f0f0;"></td>
            <td style="border-bottom: 1px solid #f0f0f0;"></td>
          </tr>
        `;
        return headerRow + detailRow;
      }
      return headerRow;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Liste des Achats Approuvés</title>
          <meta charset="UTF-8">
          <style>
            @page { size: A4; margin: 15mm; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 20px; background: #fff; color: #333; font-size: 12pt; }
            .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 10px; margin-bottom: 15px; }
            .logo { width: 80px; height: 80px; }
            .logo img { width: 100%; height: 100%; object-fit: contain; }
            .header-right { text-align: right; font-size: 11pt; }
            .doc-title { text-align: center; font-size: 18pt; font-weight: bold; margin: 10px 0; text-transform: uppercase; letter-spacing: 1px; }
            .date-line { text-align: center; font-size: 12pt; color: #555; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 11pt; }
            thead tr { border-top: 2px solid #333; border-bottom: 2px solid #333; }
            th { padding: 10px 8px; text-align: left; font-weight: bold; text-transform: uppercase; font-size: 10pt; }
            td { padding: 8px; border-bottom: 1px solid #ddd; }
            .total-row { border-top: 2px solid #333; }
            .total-row td { font-weight: bold; padding: 12px 8px; font-size: 14pt; }
            .footer { display: flex; justify-content: space-between; margin-top: 30px; }
            .signature-box { text-align: center; width: 30%; }
            .signature-line { border-bottom: 1px solid #333; height: 40px; margin-bottom: 5px; }
            .signature-label { font-size: 11pt; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo"><img src="${LOGO_BASE64}" alt="Logo" /></div>
            <div class="header-right">
              <p>Tél: +229 01 4147 0000</p>
              <p>RCCM RB/COT/22 B 32037</p>
              <p>Fidjrossè, Cotonou</p>
            </div>
          </div>
          
          <div class="doc-title">Liste des Achats Approuvés</div>
          <div class="date-line">${new Date().toLocaleDateString('fr-FR')}</div>

          <table>
            <thead>
              <tr>
                <th style="width: 5%;">#</th>
                <th style="width: 15%;">Catégorie</th>
                <th style="width: 35%;">Description</th>
                <th style="width: 20%;">Fournisseur</th>
                <th style="width: 25%; text-align: right;">Montant</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
              <tr class="total-row">
                <td colspan="4" style="text-align: right;">TOTAL:</td>
                <td style="text-align: right;">${formatPrice(total)} F CFA</td>
              </tr>
            </tbody>
          </table>

          <div class="footer">
            <div class="signature-box">
              <div class="signature-line"></div>
              <div class="signature-label">Gérante</div>
            </div>
            <div class="signature-box">
              <div class="signature-line"></div>
              <div class="signature-label">Administrateur</div>
            </div>
            <div class="signature-box">
              <div class="signature-line"></div>
              <div class="signature-label">Comptable</div>
            </div>
          </div>

          <script>window.onload = function() { setTimeout(function() { window.print(); }, 300); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Print approved expenses — ONE FULL PAGE PER EXPENSE with complete detail
  const printApprovedExpensesDetailed = () => {
    const approved = expenses.filter(e => e.status === 'approved');
    if (approved.length === 0) {
      toast.error("Aucune demande approuvée à imprimer");
      return;
    }
    const categoryLabels = { cuisine: 'Cuisine', bar: 'Bar', paiement: 'Paiement', autres: 'Autres' };
    const catColor = (c) => c === 'cuisine' ? '#22c55e' : c === 'bar' ? '#f97316' : c === 'paiement' ? '#3b82f6' : '#64748b';

    // Brief audit summary (counts only) — used as a small footer note per page.
    const norm = (s) => String(s || '').trim().toLowerCase();
    const briefAudit = (e) => {
      if (!e.is_group || !e.original_items) return null;
      const finals = e.items || [];
      const finalsByDesc = new Map();
      finals.forEach((it, i) => {
        const k = norm(it.description);
        if (!finalsByDesc.has(k)) finalsByDesc.set(k, []);
        finalsByDesc.get(k).push({ ...it, _i: i });
      });
      let added = 0, removed = 0, struck = 0, modified = 0;
      const matched = new Set();
      e.original_items.forEach((orig) => {
        const k = norm(orig.description);
        const cands = finalsByDesc.get(k) || [];
        const m = cands.find((c) => !matched.has(c._i));
        if (!m) { removed += 1; return; }
        matched.add(m._i);
        if (m.struck) { struck += 1; return; }
        if (Number(m.quantity) !== Number(orig.quantity) || Number(m.unit_price) !== Number(orig.unit_price)) modified += 1;
      });
      finals.forEach((it, i) => { if (!matched.has(i) && !it.struck) added += 1; });
      const total = added + removed + struck + modified;
      if (total === 0) return null;
      const parts = [];
      if (added) parts.push(`+${added} ajoutée${added > 1 ? 's' : ''}`);
      if (removed) parts.push(`−${removed} supprimée${removed > 1 ? 's' : ''}`);
      if (struck) parts.push(`${struck} rayée${struck > 1 ? 's' : ''}`);
      if (modified) parts.push(`${modified} modifiée${modified > 1 ? 's' : ''}`);
      return parts.join(', ');
    };

    const pagesHtml = approved.map((e, idx) => {
      // Hide struck items from the printed approved list (per user requirement).
      const visibleItems = (e.is_group && Array.isArray(e.items))
        ? e.items.filter((it) => !it.struck)
        : (e.items || []);
      const visibleAmount = (e.is_group && Array.isArray(e.items))
        ? visibleItems.reduce((s, it) => s + (it.amount || 0), 0) || e.amount
        : e.amount;
      const itemsTable = (e.is_group && visibleItems.length > 0)
        ? `
          <table class="items-table">
            <thead>
              <tr>
                <th style="width:6%">#</th>
                <th style="width:15%">Catégorie</th>
                <th>Description</th>
                <th style="width:10%;text-align:right">Qté</th>
                <th style="width:15%;text-align:right">PU</th>
                <th style="width:18%;text-align:right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${visibleItems.map((it, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td><span class="cat-badge" style="background:${catColor(it.category)}">${categoryLabels[it.category] || it.category}</span></td>
                  <td>${it.description}</td>
                  <td style="text-align:right">${it.quantity}</td>
                  <td style="text-align:right">${formatPrice(it.unit_price)} F</td>
                  <td style="text-align:right;font-weight:600">${formatPrice(it.amount)} F</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `
        : (e.quantity && e.unit_price ? `
          <table class="items-table">
            <thead>
              <tr>
                <th>Description</th>
                <th style="width:15%;text-align:right">Qté</th>
                <th style="width:20%;text-align:right">PU</th>
                <th style="width:20%;text-align:right">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${e.description}</td>
                <td style="text-align:right">${e.quantity}</td>
                <td style="text-align:right">${formatPrice(e.unit_price)} F</td>
                <td style="text-align:right;font-weight:600">${formatPrice(e.amount)} F</td>
              </tr>
            </tbody>
          </table>
        ` : '');

      return `
        <section class="page ${idx < approved.length - 1 ? 'break-after' : ''}">
          <div class="page-header">
            <div class="logo"><img src="${LOGO_BASE64}" alt="Logo" /></div>
            <div class="header-right">
              <p><strong>ESPACE MAXO</strong></p>
              <p>Tél: +229 01 4147 0000</p>
              <p>RCCM RB/COT/22 B 32037</p>
              <p>Fidjrossè, Cotonou</p>
            </div>
          </div>

          <div class="doc-title">Bon d'Achat Approuvé <span class="badge-approved">✓ APPROUVÉ</span></div>
          <div class="doc-sub">Achat ${idx + 1} / ${approved.length} — ${new Date().toLocaleDateString('fr-FR')}</div>

          <div class="meta-grid">
            <div class="meta-box">
              <div class="meta-label">Catégorie</div>
              <div class="meta-value"><span class="cat-badge" style="background:${catColor(e.category)}">${categoryLabels[e.category] || e.category}</span></div>
            </div>
            <div class="meta-box">
              <div class="meta-label">Date prévue</div>
              <div class="meta-value">${e.planned_date || '—'}</div>
            </div>
            <div class="meta-box">
              <div class="meta-label">Demandé par</div>
              <div class="meta-value">${e.requested_by || '—'}</div>
            </div>
            <div class="meta-box">
              <div class="meta-label">Approuvé par</div>
              <div class="meta-value">${e.approved_by || '—'}</div>
            </div>
            <div class="meta-box">
              <div class="meta-label">Fournisseur</div>
              <div class="meta-value">${e.supplier || '—'}</div>
            </div>
            <div class="meta-box">
              <div class="meta-label">Type</div>
              <div class="meta-value">${e.is_group ? '📦 Liste (' + visibleItems.length + ' articles)' : 'Achat unique'}</div>
            </div>
          </div>

          <div class="desc-block">
            <div class="meta-label">Description</div>
            <div class="desc-text">${e.description}</div>
          </div>

          ${itemsTable}

          <div class="amount-box">
            <div class="amount-label">MONTANT TOTAL APPROUVÉ</div>
            <div class="amount-value">${formatPrice(visibleAmount)} F CFA</div>
          </div>

          ${(() => { const a = briefAudit(e); return a ? `
            <div style="margin-top:10px;padding:8px 12px;border-left:3px solid #f59e0b;background:#fffbeb;color:#92400e;font-size:9pt;font-style:italic;">
              📜 Liste corrigée par ${e.approved_by || 'Admin'} : ${a}.
            </div>` : ''; })()}

          <div class="signatures">
            <div class="signature-box">
              <div class="signature-line"></div>
              <div class="signature-label">Gérante</div>
            </div>
            <div class="signature-box">
              <div class="signature-line"></div>
              <div class="signature-label">Administrateur</div>
            </div>
            <div class="signature-box">
              <div class="signature-line"></div>
              <div class="signature-label">Comptable</div>
            </div>
          </div>

          <div class="print-footer">
            Imprimé le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}
          </div>
        </section>
      `;
    }).join('');

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) { toast.error("Popup bloqué! Autorisez les popups pour ce site."); return; }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Détail des Achats Approuvés</title>
          <meta charset="UTF-8">
          <style>
            @page { size: A4; margin: 15mm; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; background: #fff; color: #222; font-size: 12pt; }
            .page { padding: 10px 0; }
            .break-after { page-break-after: always; }
            .page-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 18px; }
            .logo { width: 80px; height: 80px; }
            .logo img { width: 100%; height: 100%; object-fit: contain; }
            .header-right { text-align: right; font-size: 11pt; line-height: 1.5; }
            .doc-title { text-align: center; font-size: 20pt; font-weight: bold; margin: 6px 0 2px; text-transform: uppercase; letter-spacing: 1px; }
            .doc-sub { text-align: center; font-size: 12pt; color: #555; margin-bottom: 18px; }
            .badge-approved { display: inline-block; background: #16a34a; color: #fff; padding: 3px 12px; border-radius: 14px; font-size: 12pt; vertical-align: middle; font-weight: 600; }
            .meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 18px; }
            .meta-box { border: 1px solid #ddd; padding: 10px 12px; border-radius: 4px; background: #fafafa; }
            .meta-label { font-size: 10pt; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; }
            .meta-value { font-size: 13pt; font-weight: 600; color: #222; }
            .cat-badge { display: inline-block; color: white; padding: 3px 12px; border-radius: 12px; font-size: 11pt; font-weight: 600; }
            .desc-block { border-left: 4px solid #4f46e5; padding: 10px 14px; background: #f5f5ff; margin-bottom: 18px; }
            .desc-text { font-size: 14pt; font-weight: 600; color: #1e1b4b; margin-top: 4px; }
            .items-table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 12pt; }
            .items-table thead tr { background: #1e293b; color: white; }
            .items-table th { padding: 10px; text-align: left; font-weight: 600; font-size: 11pt; text-transform: uppercase; letter-spacing: 0.5px; }
            .items-table tbody td { padding: 10px; border-bottom: 1px solid #e5e7eb; font-size: 12pt; }
            .items-table tbody tr:nth-child(even) { background: #f9fafb; }
            .amount-box { border: 3px solid #333; padding: 18px; text-align: center; margin: 18px 0; background: #fffbeb; border-radius: 6px; }
            .amount-label { font-size: 12pt; color: #666; text-transform: uppercase; letter-spacing: 1px; }
            .amount-value { font-size: 30pt; font-weight: 900; margin-top: 6px; color: #b45309; }
            .signatures { display: flex; justify-content: space-between; margin-top: 30px; }
            .signature-box { text-align: center; width: 28%; }
            .signature-line { border-bottom: 1px solid #333; height: 50px; margin-bottom: 5px; }
            .signature-label { font-size: 11pt; color: #555; font-weight: 600; }
            .print-footer { text-align: center; font-size: 10pt; color: #999; margin-top: 20px; font-style: italic; }
          </style>
        </head>
        <body>
          ${pagesHtml}
          <script>window.onload = function() { setTimeout(function() { window.print(); }, 400); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
    toast.success(`Préparation de ${approved.length} bon(s) d'achat détaillé(s)...`);
  };

  // Print a SINGLE expense as 80mm thermal ticket (used in completed list)
  const printSingleExpenseTicket = (expense) => {
    const categoryLabels = { cuisine: 'CUIS', bar: 'BAR', paiement: 'PAIE', autres: 'AUTR' };
    if (!expense) return;

    const isGroup = expense.is_group && expense.items && expense.items.length > 0;
    let totalItems = isGroup ? expense.items.length : 1;
    let itemsHtml = '';

    if (isGroup) {
      itemsHtml = expense.items.map((it, idx) => (
        '<div class="sub-item">' +
        '<div class="sub-item-row">' +
        '<span class="sub-num">' + (idx + 1) + '.</span>' +
        '<span class="sub-cat">[' + (categoryLabels[it.category] || (it.category || '').substring(0, 4).toUpperCase()) + ']</span>' +
        '</div>' +
        '<div class="sub-desc">' + it.description + '</div>' +
        '<div class="sub-detail">' +
        '<span>Qte: ' + it.quantity + '</span>' +
        '<span>PU: ' + formatPrice(it.unit_price) + '</span>' +
        '<span class="sub-total">' + formatPrice(it.amount) + ' F</span>' +
        '</div>' +
        '</div>'
      )).join('');
    } else {
      const qty = expense.quantity || 1;
      const unitPrice = expense.unit_price || expense.amount;
      itemsHtml = '<div class="single-item">' +
        '<div class="cat-tag">[' + (categoryLabels[expense.category] || (expense.category || '').substring(0, 4).toUpperCase()) + ']</div>' +
        '<div class="desc">' + expense.description + '</div>' +
        '<div class="detail-row"><span>Qte: ' + qty + '</span><span>PU: ' + formatPrice(unitPrice) + ' F</span></div>' +
        '</div>';
    }

    const supplierLine = expense.supplier ? '<div class="info">Fourn: ' + expense.supplier + '</div>' : '';
    const dateLine = expense.completed_at ? '<div class="info">Termine le ' + expense.completed_at.slice(0, 10) + '</div>' : '';

    const html = '<!DOCTYPE html><html><head><title>Achat ' + (expense.description || '').slice(0, 20) + '</title><meta charset="UTF-8">' +
      '<style>' +
      '@page { size: 80mm auto; margin: 0; }' +
      '@media print { body { -webkit-print-color-adjust: exact; } }' +
      '* { margin: 0; padding: 0; box-sizing: border-box; }' +
      'body { font-family: "Courier New", monospace; width: 80mm; padding: 3mm; font-size: 11px; line-height: 1.3; background: white; color: black; }' +
      '.header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 8px; }' +
      '.title { font-size: 14px; font-weight: 900; letter-spacing: 1px; }' +
      '.subtitle { font-size: 10px; margin-top: 2px; font-style: italic; }' +
      '.date { font-size: 10px; margin-top: 4px; }' +
      '.status-badge { display: inline-block; border: 2px solid #000; padding: 2px 8px; font-size: 11px; font-weight: bold; margin-top: 4px; }' +
      '.info { font-size: 10px; margin: 3px 0; }' +
      '.cat-tag { font-size: 11px; font-weight: bold; }' +
      '.desc { font-size: 14px; font-weight: bold; margin: 4px 0; text-transform: uppercase; }' +
      '.detail-row { display: flex; justify-content: space-between; font-size: 11px; margin-top: 3px; }' +
      '.single-item { border-bottom: 1px dashed #000; padding: 6px 0; }' +
      '.sub-item { border-bottom: 1px dotted #999; padding: 4px 0; }' +
      '.sub-item-row { display: flex; justify-content: space-between; font-size: 9px; }' +
      '.sub-num { font-weight: bold; } .sub-cat { font-size: 8px; font-weight: bold; }' +
      '.sub-desc { font-size: 11px; font-weight: bold; margin: 2px 0; }' +
      '.sub-detail { display: flex; justify-content: space-between; font-size: 10px; }' +
      '.sub-total { font-weight: bold; }' +
      '.grand-total { border-top: 3px solid #000; margin-top: 10px; padding-top: 8px; text-align: center; }' +
      '.grand-total-label { font-size: 12px; }' +
      '.grand-total-value { font-size: 22px; font-weight: 900; }' +
      '.signature { margin-top: 12px; padding-top: 8px; border-top: 1px dashed #000; }' +
      '.signature-line { border-bottom: 1px solid #000; height: 28px; margin: 8px 0 3px; }' +
      '.signature-label { font-size: 10px; text-align: center; }' +
      '.footer { margin-top: 10px; text-align: center; font-size: 9px; border-top: 1px dashed #000; padding-top: 6px; }' +
      '.cut-line { margin-top: 8px; text-align: center; font-size: 10px; }' +
      '</style></head>' +
      '<body>' +
      '<div class="header">' +
      '<div class="title">ACHAT TERMINE</div>' +
      '<div class="subtitle">Bon d\'achat individuel</div>' +
      '<div class="status-badge">✓ ACHETE</div>' +
      '<div class="date">' + new Date().toLocaleDateString('fr-FR') + ' - ' + new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'}) + '</div>' +
      '</div>' +
      supplierLine + dateLine +
      (isGroup ? '<div class="info" style="font-weight:bold;text-transform:uppercase;font-size:12px;margin:6px 0;">📦 ' + expense.description + ' (' + totalItems + ' articles)</div>' : '') +
      itemsHtml +
      '<div class="grand-total">' +
      '<div class="grand-total-label">MONTANT TOTAL</div>' +
      '<div class="grand-total-value">' + formatPrice(expense.amount) + ' F</div>' +
      '</div>' +
      '<div class="signature">' +
      '<div class="signature-line"></div><div class="signature-label">Acheteur</div>' +
      '</div>' +
      '<div class="footer">Espace Maxo - Caisse Pro<br>- - - - - - - - - - - - - -</div>' +
      '<div class="cut-line">. . . . . . . . . . . . . . .</div>' +
      '<script>window.onload = function() { setTimeout(function() { window.print(); }, 500); }</script>' +
      '</body></html>';

    const printWindow = window.open('', '_blank', 'width=350,height=700');
    if (!printWindow) { toast.error("Popup bloqué! Autorisez les popups."); return; }
    printWindow.document.write(html);
    printWindow.document.close();
    toast.success("Ouverture du ticket d'impression...");
  };

  // Print all expenses (full list)
  const printAllExpensesList = () => {
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    const statusLabels = { pending: 'En attente', approved: 'Approuvée', completed: 'Terminée', revision_requested: 'À réviser', rejected: 'Refusée' };
    const categoryLabels = { cuisine: 'Cuisine', bar: 'Bar', paiement: 'Paiement', autres: 'Autres' };
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    
    const rowsHtml = expenses.map((e, i) => {
      const catColor = e.category === 'cuisine' ? '#22c55e' : e.category === 'bar' ? '#f97316' : e.category === 'paiement' ? '#3b82f6' : '#64748b';
      const statusColor = e.status === 'approved' ? '#22c55e' : e.status === 'pending' ? '#f59e0b' : e.status === 'completed' ? '#64748b' : '#ef4444';
      const headerRow = '<tr style="border-bottom: 1px solid #eee;">' +
        '<td style="padding: 8px; text-align: center; vertical-align: top;">' + (i + 1) + '</td>' +
        '<td style="padding: 8px; vertical-align: top;"><span style="background: ' + catColor + '; color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px;">' + (categoryLabels[e.category] || e.category) + '</span></td>' +
        '<td style="padding: 8px; vertical-align: top;">' + (e.is_group ? '<strong>📦 ' + e.description + '</strong> <span style="font-size:9pt;color:#666;">(' + (e.items?.length || 0) + ' art.)</span>' : e.description) + '</td>' +
        '<td style="padding: 8px; vertical-align: top;">' + (e.supplier || '-') + '</td>' +
        '<td style="padding: 8px; text-align: right; font-weight: 600; vertical-align: top;">' + formatPrice(e.amount) + ' F</td>' +
        '<td style="padding: 8px; vertical-align: top;"><span style="background: ' + statusColor + '; color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px;">' + (statusLabels[e.status] || e.status) + '</span></td>' +
        '<td style="padding: 8px; font-size: 11px; color: #666; vertical-align: top;">' + (e.requested_by || '-') + '</td>' +
        '<td style="padding: 8px; font-size: 11px; color: #666; vertical-align: top;">' + (e.created_at?.slice(0, 10) || '-') + '</td>' +
        '</tr>';
      if (e.is_group && Array.isArray(e.items) && e.items.length > 0) {
        const subs = e.items.map((it, sIdx) => (
          '<tr style="background:#fafafa;border-bottom:1px solid #f3f3f3;">' +
          '<td style="padding:3px 8px;text-align:right;font-size:9pt;color:#666;">' + (i + 1) + '.' + (sIdx + 1) + '</td>' +
          '<td style="padding:3px 8px;"><span style="background:' + (it.category === 'cuisine' ? '#22c55e' : it.category === 'bar' ? '#f97316' : it.category === 'paiement' ? '#3b82f6' : '#64748b') + ';opacity:0.75;color:white;padding:1px 6px;border-radius:8px;font-size:9pt;">' + (categoryLabels[it.category] || it.category) + '</span></td>' +
          '<td style="padding:3px 8px 3px 24px;font-size:9pt;color:#333;">↳ ' + it.description + ' <span style="color:#888;font-size:8pt;">— Qté ' + it.quantity + ' × ' + formatPrice(it.unit_price) + ' F</span></td>' +
          '<td></td>' +
          '<td style="padding:3px 8px;text-align:right;font-size:9pt;color:#444;">' + formatPrice(it.amount) + ' F</td>' +
          '<td colspan="3"></td>' +
          '</tr>'
        )).join('');
        return headerRow + subs;
      }
      return headerRow;
    }).join('');

    const html = '<!DOCTYPE html><html><head><title>Liste Complète des Demandes</title>' +
      '<style>@page { size: A4 landscape; margin: 10mm; } body { font-family: Arial, sans-serif; padding: 15px; } ' +
      '.header { text-align: center; margin-bottom: 20px; } .logo { font-size: 20px; font-weight: 800; color: #4f46e5; } ' +
      'table { width: 100%; border-collapse: collapse; font-size: 12px; } th { background: #4f46e5; color: white; padding: 10px; text-align: left; } ' +
      '.total { background: #f8f9fa; font-weight: 800; }</style></head>' +
      '<body><div class="header"><div class="logo">ESPACE MAXO</div>' +
      '<div>Liste Complète des Demandes - ' + new Date().toLocaleDateString('fr-FR') + '</div></div>' +
      '<table><thead><tr><th>#</th><th>Catégorie</th><th>Description</th><th>Fournisseur</th><th>Montant</th><th>Statut</th><th>Demandé par</th><th>Date</th></tr></thead>' +
      '<tbody>' + rowsHtml + '<tr class="total"><td colspan="4" style="padding: 10px; text-align: right;">TOTAL:</td>' +
      '<td style="padding: 10px; color: #4f46e5;">' + formatPrice(total) + ' F</td><td colspan="3"></td></tr></tbody></table>' +
      '<script>window.onload = function() { setTimeout(function() { window.print(); }, 300); }</script></body></html>';
    
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Print expenses on small thermal printer (80mm) - black & white - APPROVED ONLY for market shopping
  const printExpensesTicket = () => {
    const categoryLabels = { cuisine: 'CUIS', bar: 'BAR', paiement: 'PAIE', autres: 'AUTR' };
    
    // Filter ONLY approved expenses (ready to buy at market)
    const toPrint = expenses.filter(e => e.status === 'approved');
    const total = toPrint.reduce((sum, e) => sum + e.amount, 0);
    
    if (toPrint.length === 0) {
      toast.error("Aucune demande approuvée à imprimer. Approuvez d'abord des demandes.");
      return;
    }
    
    // Count total items including sub-items from grouped lists
    let totalItems = 0;
    
    const itemsHtml = toPrint.map((e, i) => {
      // If it's a grouped list, show all sub-items
      if (e.is_group && e.items && e.items.length > 0) {
        totalItems += e.items.length;
        const subItemsHtml = e.items.map((item, subIdx) => {
          return '<div class="sub-item">' +
            '<div class="sub-item-row">' +
            '<span class="sub-num">' + (subIdx + 1) + '.</span>' +
            '<span class="sub-cat">[' + (categoryLabels[item.category] || item.category.substring(0, 4).toUpperCase()) + ']</span>' +
            '</div>' +
            '<div class="sub-desc">' + item.description + '</div>' +
            '<div class="sub-detail">' +
            '<span>Qte: ' + item.quantity + '</span>' +
            '<span>PU: ' + formatPrice(item.unit_price) + '</span>' +
            '<span class="sub-total">' + formatPrice(item.amount) + ' F</span>' +
            '</div>' +
            '</div>';
        }).join('');
        
        return '<div class="group-item">' +
          '<div class="group-header">' +
          '<span class="group-icon">📦</span>' +
          '<span class="group-title">' + e.description + '</span>' +
          '</div>' +
          (e.supplier ? '<div class="supplier">Fourn: ' + e.supplier + '</div>' : '') +
          '<div class="sub-items">' + subItemsHtml + '</div>' +
          '<div class="group-total">' +
          '<span>TOTAL LISTE:</span>' +
          '<span>' + formatPrice(e.amount) + ' F</span>' +
          '</div>' +
          '</div>';
      } else {
        // Single item
        totalItems += 1;
        const qty = e.quantity || 1;
        const unitPrice = e.unit_price || e.amount;
        const lineTotal = e.amount || (qty * unitPrice);
        return '<div class="item">' +
          '<div class="item-row">' +
          '<span class="num">' + (i + 1) + '.</span>' +
          '<span class="cat">[' + (categoryLabels[e.category] || e.category.substring(0, 4).toUpperCase()) + ']</span>' +
          '</div>' +
          '<div class="desc">' + e.description + '</div>' +
          '<div class="detail-row">' +
          '<span>Qte: ' + qty + '</span>' +
          '<span>PU: ' + formatPrice(unitPrice) + ' F</span>' +
          '</div>' +
          '<div class="total-row">' +
          '<span>TOTAL:</span>' +
          '<span class="line-total">' + formatPrice(lineTotal) + ' F</span>' +
          '</div>' +
          (e.supplier ? '<div class="supplier">Fourn: ' + e.supplier + '</div>' : '') +
          '</div>';
      }
    }).join('');

    const html = '<!DOCTYPE html><html><head><title>Liste Achats Approuves</title><meta charset="UTF-8">' +
      '<style>' +
      '@page { size: 80mm auto; margin: 0; }' +
      '@media print { body { -webkit-print-color-adjust: exact; } }' +
      '* { margin: 0; padding: 0; box-sizing: border-box; }' +
      'body { font-family: "Courier New", monospace; width: 80mm; padding: 3mm; font-size: 11px; line-height: 1.3; background: white; color: black; }' +
      '.header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 8px; }' +
      '.title { font-size: 14px; font-weight: 900; letter-spacing: 1px; }' +
      '.subtitle { font-size: 10px; margin-top: 2px; font-style: italic; }' +
      '.date { font-size: 10px; margin-top: 4px; }' +
      '.count { font-size: 12px; font-weight: bold; margin-top: 4px; border: 1px solid #000; display: inline-block; padding: 2px 8px; }' +
      '.item { border-bottom: 1px dashed #000; padding: 6px 0; }' +
      '.item-row { display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 2px; }' +
      '.num { font-weight: bold; }' +
      '.cat { font-weight: bold; }' +
      '.desc { font-size: 13px; font-weight: bold; margin: 3px 0; text-transform: uppercase; }' +
      '.detail-row { display: flex; justify-content: space-between; font-size: 11px; margin: 2px 0; }' +
      '.total-row { display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; margin-top: 3px; border-top: 1px dotted #000; padding-top: 2px; }' +
      '.line-total { font-size: 13px; }' +
      '.supplier { font-size: 9px; color: #333; margin-top: 2px; }' +
      /* Group styles */
      '.group-item { border: 2px solid #000; padding: 6px; margin-bottom: 8px; }' +
      '.group-header { display: flex; align-items: center; gap: 5px; font-weight: bold; font-size: 12px; border-bottom: 1px solid #000; padding-bottom: 4px; margin-bottom: 4px; }' +
      '.group-icon { font-size: 14px; }' +
      '.group-title { text-transform: uppercase; }' +
      '.sub-items { padding-left: 5px; }' +
      '.sub-item { border-bottom: 1px dotted #999; padding: 3px 0; }' +
      '.sub-item-row { display: flex; justify-content: space-between; font-size: 9px; }' +
      '.sub-num { font-weight: bold; }' +
      '.sub-cat { font-size: 8px; }' +
      '.sub-desc { font-size: 11px; font-weight: bold; margin: 2px 0; }' +
      '.sub-detail { display: flex; justify-content: space-between; font-size: 10px; }' +
      '.sub-total { font-weight: bold; }' +
      '.group-total { display: flex; justify-content: space-between; font-weight: 900; font-size: 12px; border-top: 2px solid #000; margin-top: 4px; padding-top: 4px; }' +
      /* Grand total */
      '.grand-total { border-top: 3px solid #000; margin-top: 10px; padding-top: 8px; text-align: center; }' +
      '.grand-total-label { font-size: 12px; }' +
      '.grand-total-value { font-size: 22px; font-weight: 900; }' +
      '.footer { margin-top: 10px; text-align: center; font-size: 9px; border-top: 1px dashed #000; padding-top: 6px; }' +
      '.cut-line { margin-top: 8px; text-align: center; font-size: 10px; }' +
      '</style></head>' +
      '<body>' +
      '<div class="header">' +
      '<div class="title">LISTE ACHATS</div>' +
      '<div class="subtitle">Demandes Approuvees</div>' +
      '<div class="date">' + new Date().toLocaleDateString('fr-FR') + ' - ' + new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'}) + '</div>' +
      '<div class="count">' + totalItems + ' article(s)</div>' +
      '</div>' +
      itemsHtml +
      '<div class="grand-total">' +
      '<div class="grand-total-label">TOTAL A DEPENSER</div>' +
      '<div class="grand-total-value">' + formatPrice(total) + ' F</div>' +
      '</div>' +
      '<div class="footer">' +
      'Espace Maxo - Caisse Pro<br>' +
      '- - - - - - - - - - - - - -' +
      '</div>' +
      '<div class="cut-line">. . . . . . . . . . . . . . .</div>' +
      '<script>window.onload = function() { setTimeout(function() { window.print(); }, 500); }</script>' +
      '</body></html>';
    
    const printWindow = window.open('', '_blank', 'width=350,height=700');
    if (!printWindow || printWindow.closed || typeof printWindow.closed === 'undefined') {
      toast.error("Popup bloqué! Autorisez les popups pour ce site.");
      return;
    }
    
    printWindow.document.write(html);
    printWindow.document.close();
    toast.success("Ouverture du ticket d'impression...");
  };

  // Print COMPLETED expenses on 80mm thermal — same layout as printExpensesTicket
  const printCompletedExpensesTicket = () => {
    const categoryLabels = { cuisine: 'CUIS', bar: 'BAR', paiement: 'PAIE', autres: 'AUTR' };
    const toPrint = expenses.filter(e => e.status === 'completed');
    const total = toPrint.reduce((sum, e) => sum + (e.amount || 0), 0);
    if (toPrint.length === 0) {
      toast.error("Aucun achat terminé à imprimer.");
      return;
    }
    let totalItems = 0;
    const itemsHtml = toPrint.map((e, i) => {
      const dateLine = e.completed_at ? ('<div class="supplier">Termine le ' + e.completed_at.slice(0, 10) + '</div>') : '';
      if (e.is_group && e.items && e.items.length > 0) {
        totalItems += e.items.length;
        const subItemsHtml = e.items.map((item, subIdx) => (
          '<div class="sub-item">' +
          '<div class="sub-item-row">' +
          '<span class="sub-num">' + (subIdx + 1) + '.</span>' +
          '<span class="sub-cat">[' + (categoryLabels[item.category] || item.category.substring(0, 4).toUpperCase()) + ']</span>' +
          '</div>' +
          '<div class="sub-desc">' + item.description + '</div>' +
          '<div class="sub-detail">' +
          '<span>Qte: ' + item.quantity + '</span>' +
          '<span>PU: ' + formatPrice(item.unit_price) + '</span>' +
          '<span class="sub-total">' + formatPrice(item.amount) + ' F</span>' +
          '</div>' +
          '</div>'
        )).join('');
        return '<div class="group-item">' +
          '<div class="group-header">' +
          '<span class="group-icon">📦</span>' +
          '<span class="group-title">' + e.description + '</span>' +
          '</div>' +
          (e.supplier ? '<div class="supplier">Fourn: ' + e.supplier + '</div>' : '') +
          dateLine +
          '<div class="sub-items">' + subItemsHtml + '</div>' +
          '<div class="group-total">' +
          '<span>TOTAL LISTE:</span>' +
          '<span>' + formatPrice(e.amount) + ' F</span>' +
          '</div>' +
          '</div>';
      }
      totalItems += 1;
      const qty = e.quantity || 1;
      const unitPrice = e.unit_price || e.amount;
      const lineTotal = e.amount || (qty * unitPrice);
      return '<div class="item">' +
        '<div class="item-row">' +
        '<span class="num">' + (i + 1) + '.</span>' +
        '<span class="cat">[' + (categoryLabels[e.category] || e.category.substring(0, 4).toUpperCase()) + ']</span>' +
        '</div>' +
        '<div class="desc">' + e.description + '</div>' +
        '<div class="detail-row">' +
        '<span>Qte: ' + qty + '</span>' +
        '<span>PU: ' + formatPrice(unitPrice) + ' F</span>' +
        '</div>' +
        '<div class="total-row">' +
        '<span>TOTAL:</span>' +
        '<span class="line-total">' + formatPrice(lineTotal) + ' F</span>' +
        '</div>' +
        (e.supplier ? '<div class="supplier">Fourn: ' + e.supplier + '</div>' : '') +
        dateLine +
        '</div>';
    }).join('');

    const html = '<!DOCTYPE html><html><head><title>Achats Termines</title><meta charset="UTF-8">' +
      '<style>' +
      '@page { size: 80mm auto; margin: 0; }' +
      '@media print { body { -webkit-print-color-adjust: exact; } }' +
      '* { margin: 0; padding: 0; box-sizing: border-box; }' +
      'body { font-family: "Courier New", monospace; width: 80mm; padding: 3mm; font-size: 11px; line-height: 1.3; background: white; color: black; }' +
      '.header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 8px; }' +
      '.title { font-size: 14px; font-weight: 900; letter-spacing: 1px; }' +
      '.subtitle { font-size: 10px; margin-top: 2px; font-style: italic; }' +
      '.date { font-size: 10px; margin-top: 4px; }' +
      '.count { font-size: 12px; font-weight: bold; margin-top: 4px; border: 1px solid #000; display: inline-block; padding: 2px 8px; }' +
      '.item { border-bottom: 1px dashed #000; padding: 6px 0; }' +
      '.item-row { display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 2px; }' +
      '.num { font-weight: bold; } .cat { font-weight: bold; }' +
      '.desc { font-size: 13px; font-weight: bold; margin: 3px 0; text-transform: uppercase; }' +
      '.detail-row { display: flex; justify-content: space-between; font-size: 11px; margin: 2px 0; }' +
      '.total-row { display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; margin-top: 3px; border-top: 1px dotted #000; padding-top: 2px; }' +
      '.line-total { font-size: 13px; }' +
      '.supplier { font-size: 9px; color: #333; margin-top: 2px; }' +
      '.group-item { border: 2px solid #000; padding: 6px; margin-bottom: 8px; }' +
      '.group-header { display: flex; align-items: center; gap: 5px; font-weight: bold; font-size: 12px; border-bottom: 1px solid #000; padding-bottom: 4px; margin-bottom: 4px; }' +
      '.group-icon { font-size: 14px; } .group-title { text-transform: uppercase; }' +
      '.sub-items { padding-left: 5px; }' +
      '.sub-item { border-bottom: 1px dotted #999; padding: 3px 0; }' +
      '.sub-item-row { display: flex; justify-content: space-between; font-size: 9px; }' +
      '.sub-num { font-weight: bold; } .sub-cat { font-size: 8px; }' +
      '.sub-desc { font-size: 11px; font-weight: bold; margin: 2px 0; }' +
      '.sub-detail { display: flex; justify-content: space-between; font-size: 10px; }' +
      '.sub-total { font-weight: bold; }' +
      '.group-total { display: flex; justify-content: space-between; font-weight: 900; font-size: 12px; border-top: 2px solid #000; margin-top: 4px; padding-top: 4px; }' +
      '.grand-total { border-top: 3px solid #000; margin-top: 10px; padding-top: 8px; text-align: center; }' +
      '.grand-total-label { font-size: 12px; }' +
      '.grand-total-value { font-size: 22px; font-weight: 900; }' +
      '.footer { margin-top: 10px; text-align: center; font-size: 9px; border-top: 1px dashed #000; padding-top: 6px; }' +
      '.cut-line { margin-top: 8px; text-align: center; font-size: 10px; }' +
      '</style></head>' +
      '<body>' +
      '<div class="header">' +
      '<div class="title">ACHATS TERMINES</div>' +
      '<div class="subtitle">Historique des achats effectues</div>' +
      '<div class="date">' + new Date().toLocaleDateString('fr-FR') + ' - ' + new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'}) + '</div>' +
      '<div class="count">' + totalItems + ' article(s)</div>' +
      '</div>' +
      itemsHtml +
      '<div class="grand-total">' +
      '<div class="grand-total-label">TOTAL DEPENSE</div>' +
      '<div class="grand-total-value">' + formatPrice(total) + ' F</div>' +
      '</div>' +
      '<div class="footer">Espace Maxo - Caisse Pro<br>- - - - - - - - - - - - - -</div>' +
      '<div class="cut-line">. . . . . . . . . . . . . . .</div>' +
      '<script>window.onload = function() { setTimeout(function() { window.print(); }, 500); }</script>' +
      '</body></html>';

    const printWindow = window.open('', '_blank', 'width=350,height=700');
    if (!printWindow || printWindow.closed || typeof printWindow.closed === 'undefined') {
      toast.error("Popup bloqué! Autorisez les popups pour ce site.");
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    toast.success("Ouverture du ticket d'impression...");
  };

  // Print all COMPLETED expenses as an A4 summary (same style as printAllApprovedExpenses)
  const printAllCompletedExpenses = () => {
    const completed = expenses.filter(e => e.status === 'completed');
    if (completed.length === 0) {
      toast.error("Aucun achat terminé à imprimer");
      return;
    }
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    const total = completed.reduce((sum, e) => sum + (e.amount || 0), 0);
    const categoryLabels = { cuisine: 'Cuisine', bar: 'Bar', paiement: 'Paiement', autres: 'Autres' };
    const catColor = (c) => c === 'cuisine' ? '#22c55e' : c === 'bar' ? '#f97316' : c === 'paiement' ? '#3b82f6' : '#64748b';

    const itemsHtml = completed.map((expense, index) => {
      const headerRow = `
        <tr>
          <td style="padding: 10px 8px; border-bottom: 1px solid #eee; vertical-align: top; font-size: 11pt;">${index + 1}</td>
          <td style="padding: 10px 8px; border-bottom: 1px solid #eee; vertical-align: top;">
            <span style="background: ${catColor(expense.category)}; color: white; padding: 3px 10px; border-radius: 10px; font-size: 11pt; font-weight: 600;">
              ${categoryLabels[expense.category] || expense.category}
            </span>
          </td>
          <td style="padding: 10px 8px; border-bottom: 1px solid #eee; vertical-align: top; font-size: 12pt;">
            ${expense.is_group ? '<strong>📦 ' + expense.description + '</strong> <span style="font-size:10pt;color:#666;">(' + (expense.items?.length || 0) + ' articles)</span>' : expense.description}
          </td>
          <td style="padding: 10px 8px; border-bottom: 1px solid #eee; vertical-align: top; font-size: 11pt;">${expense.supplier || '-'}</td>
          <td style="padding: 10px 8px; border-bottom: 1px solid #eee; vertical-align: top; font-size: 11pt; color:#666;">${expense.completed_at?.slice(0, 10) || '-'}</td>
          <td style="padding: 10px 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: 700; vertical-align: top; font-size: 12pt;">${formatPrice(expense.amount)} F</td>
        </tr>
      `;
      if (expense.is_group && Array.isArray(expense.items) && expense.items.length > 0) {
        const subRows = expense.items.map((it, sIdx) => `
          <tr style="background: #fafafa;">
            <td style="padding: 6px 8px; border-bottom: 1px solid #f0f0f0; text-align: right; font-size: 10pt; color: #666;">${index + 1}.${sIdx + 1}</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid #f0f0f0;">
              <span style="background: ${catColor(it.category)}; opacity: 0.75; color: white; padding: 2px 8px; border-radius: 8px; font-size: 10pt;">
                ${categoryLabels[it.category] || it.category}
              </span>
            </td>
            <td style="padding: 6px 8px 6px 24px; border-bottom: 1px solid #f0f0f0; font-size: 11pt; color: #333;">
              ↳ ${it.description}
              <span style="color: #555; font-size: 10pt;"> — Qté ${it.quantity} × ${formatPrice(it.unit_price)} F</span>
            </td>
            <td colspan="2" style="border-bottom: 1px solid #f0f0f0;"></td>
            <td style="padding: 6px 8px; border-bottom: 1px solid #f0f0f0; text-align: right; font-size: 11pt; color: #222; font-weight: 600;">${formatPrice(it.amount)} F</td>
          </tr>
        `).join('');
        return headerRow + subRows;
      }
      return headerRow;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Achats Terminés</title>
          <meta charset="UTF-8">
          <style>
            @page { size: A4; margin: 15mm; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 20px; background: #fff; color: #333; font-size: 12pt; }
            .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 10px; margin-bottom: 15px; }
            .logo { width: 80px; height: 80px; }
            .logo img { width: 100%; height: 100%; object-fit: contain; }
            .header-right { text-align: right; font-size: 11pt; }
            .doc-title { text-align: center; font-size: 18pt; font-weight: bold; margin: 10px 0; text-transform: uppercase; letter-spacing: 1px; }
            .date-line { text-align: center; font-size: 12pt; color: #555; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 11pt; }
            thead tr { border-top: 2px solid #333; border-bottom: 2px solid #333; }
            th { padding: 10px 8px; text-align: left; font-weight: bold; text-transform: uppercase; font-size: 10pt; }
            td { padding: 8px; border-bottom: 1px solid #ddd; }
            .total-row { border-top: 2px solid #333; }
            .total-row td { font-weight: bold; padding: 12px 8px; font-size: 14pt; }
            .footer { display: flex; justify-content: space-between; margin-top: 30px; }
            .signature-box { text-align: center; width: 30%; }
            .signature-line { border-bottom: 1px solid #333; height: 40px; margin-bottom: 5px; }
            .signature-label { font-size: 11pt; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo"><img src="${LOGO_BASE64}" alt="Logo" /></div>
            <div class="header-right">
              <p>Tél: +229 01 4147 0000</p>
              <p>RCCM RB/COT/22 B 32037</p>
              <p>Fidjrossè, Cotonou</p>
            </div>
          </div>
          <div class="doc-title">Historique des Achats Terminés</div>
          <div class="date-line">${new Date().toLocaleDateString('fr-FR')}</div>
          <table>
            <thead>
              <tr>
                <th style="width: 5%;">#</th>
                <th style="width: 12%;">Catégorie</th>
                <th style="width: 33%;">Description</th>
                <th style="width: 18%;">Fournisseur</th>
                <th style="width: 12%;">Terminé le</th>
                <th style="width: 20%; text-align: right;">Montant</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
              <tr class="total-row">
                <td colspan="5" style="text-align: right;">TOTAL:</td>
                <td style="text-align: right;">${formatPrice(total)} F CFA</td>
              </tr>
            </tbody>
          </table>
          <div class="footer">
            <div class="signature-box">
              <div class="signature-line"></div>
              <div class="signature-label">Gérante</div>
            </div>
            <div class="signature-box">
              <div class="signature-line"></div>
              <div class="signature-label">Administrateur</div>
            </div>
            <div class="signature-box">
              <div class="signature-line"></div>
              <div class="signature-label">Comptable</div>
            </div>
          </div>
          <script>window.onload = function() { setTimeout(function() { window.print(); }, 300); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };
  const openExpenseForEdit = (expense) => {
    setExpenseForm({
      category: expense.category,
      description: expense.description,
      quantity: expense.quantity || 1,
      unit_price: expense.unit_price || expense.amount || 0,
      amount: expense.amount,
      supplier: expense.supplier || "",
      planned_date: expense.planned_date || format(new Date(), "yyyy-MM-dd"),
      receipt_image: expense.receipt_image,
      expense_type: expense.expense_type || "achat",
      destination: expense.destination || "cuisine"
    });
    setEditingExpense(expense);
    setShowExpenseModal(true);
  };

  // ============== WEEKLY REPORT FUNCTIONS ==============
  
  const fetchWeeklyReport = async () => {
    try {
      const params = { week_start: weekStartDate };
      if (weekEndDate) params.end_date = weekEndDate;
      const res = await axios.get(`${API}/reports/weekly`, { params });
      setWeeklyReport(res.data);
      
      // Check expense ratio for admin alert (> 40%)
      // Backend /reports/weekly already aggregates ALL expenses of the week
      // (pending + approved + completed + revision_requested), respecting assigned_week.
      // We must NOT add client-side filtered expenses on top (it double-counts the current
      // week and mixes expenses from other weeks against this week's CA).
      if (currentUser?.role === 'admin' && res.data) {
        const weeklyCA = res.data.sales?.total || 0;
        const weeklyExpenses = res.data.expenses?.total || 0;
        
        if (weeklyCA > 0) {
          const ratio = (weeklyExpenses / weeklyCA) * 100;
          setExpenseRatioAlert({
            ratio: ratio.toFixed(1),
            expenses: weeklyExpenses,
            ca: weeklyCA,
            isOverLimit: ratio > 40
          });
        } else {
          // No sales yet → clear the alert
          setExpenseRatioAlert(null);
        }
      }
    } catch (error) {
      console.error("Error fetching weekly report:", error);
    }
  };

  // Generate Weekly Report PDF
  const generateWeeklyPDF = () => {
    if (!weeklyReport) return;
    
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
    // Build daily rows
    const dailyRows = Object.entries(weeklyReport.daily || {}).map(([date, data]) => {
      const expenseDetails = data.expenses?.items?.map(exp => 
        `<div class="expense-item">${exp.is_group ? '📦 ' : ''}${exp.description}: ${formatPrice(exp.amount)} F (${exp.status === 'completed' ? '✓' : exp.status === 'approved' ? '→' : '?'})</div>`
      ).join('') || '-';
      
      return `<tr>
        <td><strong>${data.day_name}</strong></td>
        <td>${data.date_formatted}</td>
        <td class="text-green">${formatPrice(data.sales?.total || 0)} F</td>
        <td class="text-red">${formatPrice(data.expenses?.total || 0)} F</td>
        <td class="${data.result >= 0 ? 'text-green' : 'text-red'}">${data.result >= 0 ? '+' : ''}${formatPrice(data.result)} F</td>
        <td class="expense-details">${expenseDetails}</td>
      </tr>`;
    }).join('');
    
    // Build category summary
    const categoryRows = Object.entries(weeklyReport.expenses?.by_category || {}).map(([cat, amount]) => 
      `<tr><td class="capitalize">${cat}</td><td class="text-red">${formatPrice(amount)} F</td></tr>`
    ).join('') || '<tr><td colspan="2">Aucune dépense</td></tr>';
    
    const html = `<!DOCTYPE html>
    <html><head>
      <title>Faire le point - ${weeklyReport.week_label}</title>
      <meta charset="UTF-8">
      <style>
        @page { size: A4; margin: 15mm; }
        body { font-family: Arial, sans-serif; font-size: 11px; color: #333; padding: 20px; }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 10px; margin-bottom: 15px; }
        .logo { width: 80px; height: 80px; }
        .logo img { width: 100%; height: 100%; object-fit: contain; }
        .header-center { text-align: center; flex: 1; }
        .header-title { font-size: 14pt; font-weight: bold; text-transform: uppercase; }
        .header-period { font-size: 11pt; color: #555; margin-top: 5px; }
        .header-right { text-align: right; font-size: 9pt; }
        .summary { display: flex; justify-content: space-around; margin: 20px 0; }
        .summary-box { text-align: center; padding: 12px 20px; border: 1px solid #ddd; min-width: 130px; }
        .summary-box h3 { margin: 0 0 5px 0; font-size: 9pt; text-transform: uppercase; color: #666; }
        .summary-box .value { font-size: 16pt; font-weight: bold; }
        .summary-box.green .value { color: #16a34a; }
        .summary-box.red .value { color: #dc2626; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 9pt; }
        thead tr { border-top: 2px solid #333; border-bottom: 2px solid #333; }
        th { padding: 8px; text-align: left; font-weight: bold; text-transform: uppercase; font-size: 8pt; }
        td { padding: 6px 8px; border-bottom: 1px solid #ddd; }
        .text-green { color: #16a34a; }
        .text-red { color: #dc2626; }
        .capitalize { text-transform: capitalize; }
        .expense-details { font-size: 8pt; max-width: 180px; }
        .expense-item { background: #f5f5f5; padding: 2px 4px; margin: 1px 0; font-size: 8pt; }
        .total-row { border-top: 2px solid #333; }
        .total-row td { font-weight: bold; padding: 10px 8px; }
        .section-title { font-size: 11pt; font-weight: bold; margin: 20px 0 10px; padding-bottom: 5px; border-bottom: 1px solid #ddd; }
        .footer { margin-top: 20px; text-align: center; font-size: 9pt; color: #666; padding-top: 10px; border-top: 1px solid #ddd; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo"><img src="${LOGO_BASE64}" alt="Logo" /></div>
        <div class="header-center">
          <div class="header-title">Faire le point</div>
          <div class="header-period">${weeklyReport.week_label}</div>
        </div>
        <div class="header-right">
          <p>Tél: +229 01 4147 0000</p>
          <p>Fidjrossè, Cotonou</p>
        </div>
      </div>
      
      <div class="summary">
        <div class="summary-box green">
          <h3>Recettes</h3>
          <div class="value">${formatPrice(weeklyReport.sales?.total || 0)} F</div>
          <div>${weeklyReport.sales?.count || 0} ventes</div>
        </div>
        <div class="summary-box red">
          <h3>Dépenses</h3>
          <div class="value">${formatPrice(weeklyReport.expenses?.total || 0)} F</div>
          <div>${weeklyReport.expenses?.count || 0} achats</div>
        </div>
        <div class="summary-box ${weeklyReport.is_profitable ? 'green' : 'red'}">
          <h3>Résultat</h3>
          <div class="value">${weeklyReport.result >= 0 ? '+' : ''}${formatPrice(weeklyReport.result || 0)} F</div>
          <div>${weeklyReport.is_profitable ? 'Bénéfice' : 'Perte'}</div>
        </div>
      </div>
      
      <div class="section-title">Détail Jour par Jour</div>
      <table>
        <thead>
          <tr>
            <th>Jour</th>
            <th>Date</th>
            <th>Recettes</th>
            <th>Dépenses</th>
            <th>Résultat</th>
            <th>Détails Achats</th>
          </tr>
        </thead>
        <tbody>
          ${dailyRows}
          <tr class="total-row">
            <td colspan="2">TOTAL SEMAINE</td>
            <td class="text-green">${formatPrice(weeklyReport.sales?.total || 0)} F</td>
            <td class="text-red">${formatPrice(weeklyReport.expenses?.total || 0)} F</td>
            <td class="${weeklyReport.is_profitable ? 'text-green' : 'text-red'}">${weeklyReport.result >= 0 ? '+' : ''}${formatPrice(weeklyReport.result || 0)} F</td>
            <td></td>
          </tr>
        </tbody>
      </table>
      
      <div class="section-title">Dépenses par Catégorie</div>
      <table style="width: 50%;">
        <thead>
          <tr>
            <th>Catégorie</th>
            <th>Montant</th>
          </tr>
        </thead>
        <tbody>
          ${categoryRows}
        </tbody>
      </table>
      
      <div class="footer">
        <p>Généré le ${new Date().toLocaleString('fr-FR')}</p>
      </div>
      
      <script>window.onload = function() { setTimeout(function() { window.print(); }, 500); }</script>
    </body></html>`;
    
    printWindow.document.write(html);
    printWindow.document.close();
    toast.success("Génération du PDF en cours...");
  };

  // Send Weekly Report via WhatsApp
  const sendWeeklyWhatsApp = () => {
    if (!weeklyReport) return;
    
    // Build message text
    let message = `📊 *POINT HEBDOMADAIRE*\n`;
    message += `📅 ${weeklyReport.week_label}\n\n`;
    
    message += `💰 *RÉSUMÉ*\n`;
    message += `✅ Recettes: ${formatPrice(weeklyReport.sales?.total || 0)} F (${weeklyReport.sales?.count || 0} ventes)\n`;
    message += `❌ Dépenses: ${formatPrice(weeklyReport.expenses?.total || 0)} F (${weeklyReport.expenses?.count || 0} achats)\n`;
    message += `${weeklyReport.is_profitable ? '📈' : '📉'} Résultat: ${weeklyReport.result >= 0 ? '+' : ''}${formatPrice(weeklyReport.result || 0)} F\n\n`;
    
    message += `📅 *DÉTAIL PAR JOUR*\n`;
    Object.entries(weeklyReport.daily || {}).forEach(([date, data]) => {
      message += `${data.day_name} (${data.date_formatted}):\n`;
      message += `  💵 ${formatPrice(data.sales?.total || 0)} F | 🛒 ${formatPrice(data.expenses?.total || 0)} F\n`;
    });
    
    message += `\n_Espace Maxo - Caisse Pro_`;
    
    // Encode for WhatsApp URL
    const encodedMessage = encodeURIComponent(message);
    
    // Admin phone number (you can customize this)
    const adminPhone = "22991005084"; // Replace with actual admin number
    
    // Open WhatsApp with pre-filled message
    window.open(`https://wa.me/${adminPhone}?text=${encodedMessage}`, '_blank');
    toast.success("Ouverture de WhatsApp...");
  };

  // ============== ACTIVITY REPORT FUNCTIONS (Admin) ==============
  // NOTE: Activite tab now computes totals from live invoices/expenses state,
  // no separate fetch needed.

  // Fetch expenses when authenticated
  useEffect(() => {
    if (isAuthenticated && (currentUser?.role === 'manager' || currentUser?.role === 'admin')) {
      fetchExpenses();
    }
  }, [isAuthenticated, currentUser]);

  // Fetch weekly report when tab is active
  useEffect(() => {
    if (isAuthenticated && activeTab === "hebdo") {
      fetchWeeklyReport();
    }
  }, [weekStartDate, weekEndDate, activeTab, isAuthenticated]);

  // Check expense ratio when on Achats tab (admin only)
  useEffect(() => {
    if (isAuthenticated && activeTab === "achats" && currentUser?.role === 'admin') {
      fetchWeeklyReport(); // This will also calculate the ratio
    }
  }, [activeTab, isAuthenticated, currentUser, expenses]);

  // Fetch tables status
  const fetchTablesStatus = async () => {
    try {
      const res = await axios.get(`${API}/caisse/tables/status`);
      setTablesStatus(res.data);
    } catch (error) {
      console.error("Error fetching tables status:", error);
    }
  };

  // Stop table service (Manager action)
  const stopTableService = async (tableId, tableNumber, silent = false) => {
    try {
      const res = await axios.post(`${API}/caisse/tables/${tableId}/stop-service`);
      if (res.data.success) {
        const { duration_minutes, quality_status } = res.data.service_record;
        const qualityText = quality_status === 'excellent' ? 'Excellent' : quality_status === 'acceptable' ? 'Acceptable' : 'Lent';
        if (!silent) {
          toast.success(`Table ${tableNumber} libérée ! Durée: ${duration_minutes}min (${qualityText})`);
        }
        fetchTablesStatus();
        fetchOpenTables();
      }
    } catch (error) {
      console.error("Error stopping table service:", error);
      if (!silent) {
        toast.error("Erreur lors de l'arrêt du service");
      }
    }
  };

  // Auto-refresh tables status every 10 seconds when on tables tab
  useEffect(() => {
    if (isAuthenticated && activeTab === "tables") {
      fetchTablesStatus(); // Fetch immediately when tab opens
      const interval = setInterval(fetchTablesStatus, 10000); // Refresh every 10 seconds
      return () => clearInterval(interval);
    }
  }, [activeTab, isAuthenticated]);

  const fetchRapportData = async () => {
    try {
      const [invoicesRes, statsRes] = await Promise.all([
        axios.get(`${API}/invoices`, { params: { date: rapportDate } }),
        axios.get(`${API}/invoices/stats`, { params: { date: rapportDate } })
      ]);
      
      const dayInvoices = invoicesRes.data.invoices || [];
      const validatedInvoices = dayInvoices.filter(i => i.validation_status === 'validated');
      const pendingInvoices = dayInvoices.filter(i => i.validation_status === 'pending');
      
      // Group by server
      const byServer = {};
      dayInvoices.forEach(inv => {
        const server = inv.created_by || 'Non assigné';
        if (!byServer[server]) {
          byServer[server] = { count: 0, total: 0, validated: 0, pending: 0 };
        }
        byServer[server].count++;
        byServer[server].total += inv.total || 0;
        if (inv.validation_status === 'validated') byServer[server].validated++;
        else byServer[server].pending++;
      });
      
      // Group by payment method
      const byPayment = {};
      validatedInvoices.forEach(inv => {
        const method = inv.payment_method || 'cash';
        if (!byPayment[method]) byPayment[method] = { count: 0, total: 0 };
        byPayment[method].count++;
        byPayment[method].total += inv.total || 0;
      });
      
      setRapportData({
        date: rapportDate,
        totalInvoices: dayInvoices.length,
        validatedInvoices: validatedInvoices.length,
        pendingInvoices: pendingInvoices.length,
        totalRevenue: statsRes.data.total_revenue || 0,
        validatedRevenue: validatedInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0),
        byDepartment: statsRes.data.by_department || {},
        byServer,
        byPayment,
        invoices: dayInvoices
      });
    } catch (error) {
      console.error("Error fetching rapport data:", error);
      toast.error("Erreur lors du chargement du rapport");
    }
  };

  // Generate PDF report with signature - Download from backend
  const generateRapportPDF = async () => {
    if (!rapportData) {
      toast.error("Données du rapport non disponibles");
      return;
    }
    
    try {
      const response = await axios.get(`${API}/rapport/pdf`, {
        params: { 
          date: rapportDate,
          signature: signature || ""
        },
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `rapport_journalier_${rapportDate}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Rapport PDF téléchargé !");
    } catch (error) {
      console.error("Error generating rapport PDF:", error);
      toast.error("Erreur lors de la génération du PDF");
    }
  };

  // Send rapport summary via WhatsApp to Marcel HOUNHANOU
  const sendRapportWhatsApp = () => {
    if (!rapportData) {
      toast.error("Données du rapport non disponibles");
      return;
    }
    
    const phoneNumber = "2290162396239"; // Marcel HOUNHANOU
    
    // Build summary message
    const deptSummary = Object.entries(rapportData.byDepartment)
      .filter(([_, v]) => v > 0)
      .map(([dept, amount]) => `• ${DEPARTMENT_CONFIG[dept]?.label || dept}: ${formatPrice(amount)} F`)
      .join('\n');
    
    const message = `📊 *RAPPORT JOURNALIER - ESPACE MAXO*
📅 Date: ${rapportData.date}

*RÉSUMÉ:*
• Factures Total: ${rapportData.totalInvoices}
• ✅ Validées: ${rapportData.validatedInvoices}
• ⏳ En attente: ${rapportData.pendingInvoices}
• 💰 CA Validé: ${formatPrice(rapportData.validatedRevenue)} FCFA

*PAR DÉPARTEMENT:*
${deptSummary}

*Signé par:* ${signature || 'Mères AHOUANDJINOU'}
_Gérante - Espace Maxo_

---
📄 Le rapport PDF complet est disponible sur demande.`;

    // Encode message for URL
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
    
    // Open WhatsApp
    window.open(whatsappUrl, '_blank');
    toast.success("WhatsApp ouvert - Envoyez le message à Marcel HOUNHANOU");
  };

  // View server detail - show all invoices for a specific server
  const viewServerDetail = (serverName) => {
    if (!rapportData) return;
    
    const serverInvs = rapportData.invoices.filter(inv => 
      (inv.created_by || 'Non assigné') === serverName
    );
    
    setSelectedServerDetail(serverName);
    setServerInvoices(serverInvs);
  };

  const closeServerDetail = () => {
    setSelectedServerDetail(null);
    setServerInvoices([]);
  };

  // ============== BILL MANAGEMENT ==============
  const addToBill = (item, department) => {
    const existingIndex = currentBill.findIndex(i => i.id === item.id && i.department === department);
    if (existingIndex >= 0) {
      const updated = [...currentBill];
      updated[existingIndex].quantity += 1;
      setCurrentBill(updated);
    } else {
      setCurrentBill([...currentBill, { ...item, department, quantity: 1 }]);
    }
  };

  const updateQuantity = (index, delta) => {
    const updated = [...currentBill];
    updated[index].quantity += delta;
    if (updated[index].quantity <= 0) {
      updated.splice(index, 1);
    }
    setCurrentBill(updated);
  };

  const removeItem = (index) => {
    const updated = [...currentBill];
    updated.splice(index, 1);
    setCurrentBill(updated);
  };

  const clearBill = () => {
    setCurrentBill([]);
    setSelectedClient(null);
    setDiscount(0);
    setNotes("");
  };

  // Calculate totals
  const subtotal = currentBill.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discountAmount = (subtotal * discount) / 100;
  const total = subtotal - discountAmount;

  const totalByDepartment = {
    salle_jardin: currentBill.filter(i => i.department === "salle_jardin").reduce((sum, i) => sum + (i.price * i.quantity), 0),
    jeux: currentBill.filter(i => i.department === "jeux").reduce((sum, i) => sum + (i.price * i.quantity), 0),
    bar: currentBill.filter(i => i.department === "bar").reduce((sum, i) => sum + (i.price * i.quantity), 0),
    location: currentBill.filter(i => i.department === "location").reduce((sum, i) => sum + (i.price * i.quantity), 0),
    autres: currentBill.filter(i => i.department === "autres").reduce((sum, i) => sum + (i.price * i.quantity), 0)
  };

  // Add custom item to bill (for "Autres" department)
  const addCustomItem = () => {
    if (!customItem.name || customItem.price <= 0) {
      toast.error("Veuillez saisir un nom et un prix valide");
      return;
    }
    const newItem = {
      id: `custom-${Date.now()}`,
      name: customItem.name,
      price: customItem.price,
      unit: "unité",
      department: "autres",
      quantity: 1
    };
    setCurrentBill([...currentBill, newItem]);
    setCustomItem({ name: "", price: 0 });
    toast.success(`${customItem.name} ajouté`);
  };

  // Add free accompaniment (Accompagnement gratuit)
  const [showFreeAccompModal, setShowFreeAccompModal] = useState(false);
  
  const addFreeAccompaniment = (accompName) => {
    const newItem = {
      id: `free_accomp_${Date.now()}`,
      name: `${accompName} (GRATUIT)`,
      price: 0,
      unit: "portion",
      department: "accompagnements",
      quantity: 1,
      isFree: true
    };
    setCurrentBill([...currentBill, newItem]);
    setShowFreeAccompModal(false);
    toast.success(`${accompName} gratuit ajouté`);
  };

  // ============== INVOICE ACTIONS ==============
  // (22/05/2026) — Nouveau flow : "ENVOYER LA COMMANDE" n'imprime PLUS la facture en BDD.
  // Elle se contente d'enregistrer les items dans la table + lancer les bons cuisine/bar/jeux.
  // La FACTURE est créée UNIQUEMENT au clic "Imprimer le bon client".

  // Génère un numéro de bon temporaire pour les impressions de production (cuisine/bar/jeux)
  // tant que la facture n'est pas encore créée en BDD.
  const _tempBonNumber = () => `TMP-${Date.now().toString().slice(-6)}`;

  const _buildInvoiceData = () => ({
    customer_name: selectedClient?.name || "Client",
    customer_phone: selectedClient?.phone || "",
    items: currentBill,
    subtotal,
    discount,
    discount_amount: discountAmount,
    total,
    payment_method: paymentMethod,
    totals_by_department: totalByDepartment,
    notes,
    created_by: currentUser?.full_name || currentUser?.username || "admin",
    // (Bug fix) — un bon enregistré reste EN ATTENTE (pending). Il ne sera transformé
    // en facture validée qu'au clic « Imprimer le bon client » (table)
    // ou « Bon-Client » (vente directe, file Bons).
    validation_status: "pending",
    table_number: activeTable?.table_number || null,
  });

  const saveInvoice = async () => {
    if (currentBill.length === 0) {
      toast.error("Le bon est vide");
      return;
    }

    // Mobile Money payment → flow d'attente paiement (création facture après paiement)
    if (paymentMethod === "mobile") {
      const invoiceData = _buildInvoiceData();
      setPendingInvoiceData(invoiceData);
      setShowMobilePaymentModal(true);
      return;
    }

    // Cas "PAS DE TABLE ACTIVE" → vente directe : on crée la facture tout de suite (legacy)
    if (!activeTableId) {
      await createInvoice(_buildInvoiceData());
      return;
    }

    // Cas "TABLE ACTIVE" → flow : on stocke dans la table + impressions production
    // ET on crée immédiatement un bon (pending) visible dans BONS. La facture
    // sera validée par "Imprimer le bon client".
    try {
      // 1. Créer le bon (facture en pending) — visible dans BONS
      const invoiceData = _buildInvoiceData();
      const invResp = await axios.post(`${API}/invoices?${actorQs()}`, invoiceData);
      const createdInvoice = invResp.data?.invoice || null;
      const tempBon = createdInvoice
        ? { invoice_number: createdInvoice.invoice_number, items: currentBill, table_number: activeTable?.table_number }
        : { invoice_number: _tempBonNumber(), items: currentBill, table_number: activeTable?.table_number };

      // 2. Mettre à jour la table : items + ready_to_invoice + lien vers la facture
      await axios.put(`${API}/caisse/tables/${activeTableId}?${actorQs()}`, {
        items: currentBill,
        status: "ready_to_invoice",
        client_name: selectedClient?.name || activeTable?.client_name || "Client",
        last_order_sent_at: new Date().toISOString(),
        pending_invoice_id: createdInvoice?.id || null,
      });

      // 3. Imprimer les bons de production (cuisine / bar / jeux)
      try { printKitchenOrder(tempBon); } catch {}
      try { printBarOrder(tempBon); } catch {}
      try { printGamesOrder(tempBon); } catch {}

      toast.success("✓ Bon créé et commande envoyée en production. Visible dans l'onglet BONS.", {
        duration: 5000,
      });

      // Nettoyer la zone de saisie (la table garde ses items côté serveur)
      selectTable(null);
      clearBill();
      setSelectedClient(null);
      setDiscount(0);
      setNotes("");
      setActiveTableId(null);
      setCurrentBill([]);
      await fetchAllData();
      await fetchOpenTables(true);
    } catch (e) {
      console.error("Error sending order to kitchen:", e);
      const detail = e.response?.data?.detail;
      if (e.response?.status === 423 && detail) {
        toast.error(detail, { duration: 6000 });
      } else {
        toast.error(detail || "Erreur lors de l'envoi en production");
      }
    }
  };

  // Imprime le bon client ET crée la facture en BDD (depuis une table "ready_to_invoice")
  const printClientReceiptAndCreateInvoice = async (table) => {
    if (!table || !table.id) return;
    try {
      // Recharger l'état frais de la table (au cas où)
      const tRes = await axios.get(`${API}/caisse/tables/${table.id}`);
      const fresh = tRes.data?.table || table;
      const items = fresh.items || [];
      if (items.length === 0) {
        toast.error("Cette table n'a pas d'articles");
        return;
      }

      let created = null;

      // Si la table possède déjà un bon pending → on le VALIDE (pas de doublon)
      if (fresh.pending_invoice_id) {
        try {
          const v = await axios.put(`${API}/invoices/${fresh.pending_invoice_id}?${actorQs()}`, {
            validation_status: "validated",
            validated_by: formatValidatorLabel(currentUser),
            validated_at: new Date().toISOString(),
          });
          created = v.data?.invoice || v.data;
        } catch (_vErr) {
          console.warn("Validate pending invoice failed, fallback to create:", _vErr?.response?.data);
        }
      }

      // Fallback : créer une nouvelle facture (legacy ou si pending introuvable)
      if (!created) {
        const subtotalT = items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
        const totals_by_department = items.reduce((acc, it) => {
          const dep = it.department || "autres";
          acc[dep] = (acc[dep] || 0) + (it.price || 0) * (it.quantity || 1);
          return acc;
        }, {});
        const invoiceData = {
          customer_name: fresh.client_name || "Client",
          customer_phone: "",
          items,
          subtotal: subtotalT,
          discount: 0,
          discount_amount: 0,
          total: subtotalT,
          payment_method: "cash",
          totals_by_department,
          notes: "",
          created_by: currentUser?.full_name || currentUser?.username || "admin",
          validation_status: "validated",
          validated_by: formatValidatorLabel(currentUser),
          validated_at: new Date().toISOString(),
          table_number: fresh.table_number,
        };
        const r = await axios.post(`${API}/invoices?${actorQs()}`, invoiceData);
        created = r.data?.invoice || r.data;
      }

      // Imprimer le ticket client
      try { printTicket(created); } catch {}
      // Marquer la table : invoiced + items vidés
      try {
        await axios.put(`${API}/caisse/tables/${fresh.id}?${actorQs()}`, {
          status: "invoiced",
          items: [],
          invoice_created_at: new Date().toISOString(),
          pending_invoice_id: null,
        });
      } catch {}
      toast.success("Bon client imprimé · Facture créée");
      await fetchAllData();
      await fetchOpenTables(true);
      await fetchTablesStatus();
    } catch (e) {
      console.error("printClientReceiptAndCreateInvoice failed:", e);
      toast.error(e?.response?.data?.detail || "Erreur lors de l'impression du bon client");
    }
  };

  const createInvoice = async (invoiceData) => {
    try {
      const enriched = {
        ...invoiceData,
        id: invoiceData.id || ((typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `inv_${Date.now()}`),
      };
      const r = await trySync({
        type: "create_invoice",
        payload: enriched,
        user: { name: currentUser?.full_name || currentUser?.username, role: currentUser?.role },
      });
      if (r.queued) {
        toast.warning("Facture créée hors-ligne — sera synchronisée au retour de la connexion", { duration: 5000 });
        // Skip side-effects requiring server (client stats, table mutation)
        return;
      }
      const response = { data: r.data };
      
      // Update client stats if selected
      if (selectedClient) {
        try {
          await axios.put(`${API}/caisse/clients/${selectedClient.id}`, {
            total_spent: (selectedClient.total_spent || 0) + invoiceData.total,
            visit_count: (selectedClient.visit_count || 0) + 1
          });
        } catch {}
      }
      
      toast.success("✓ Bon enregistré · en attente de validation par la gérante", {
        duration: 4000
      });
      
      // Mark the table as having an invoice but DON'T delete it (keep tracking)
      if (activeTableId) {
        // Update table status to "invoiced" and CLEAR items since they're now in the invoice
        try {
          await axios.put(`${API}/caisse/tables/${activeTableId}?${actorQs()}`, {
            status: "invoiced",
            items: [], // Clear items since the order has been sent
            invoice_created_at: new Date().toISOString()
          });
        } catch (e) {
          console.log("Could not update table status:", e);
        }
        // Clear current selection but keep table in system for tracking
        selectTable(null);
        clearBill();
      } else {
        clearBill();
      }
      
      // Clear other order-related states
      setSelectedClient(null);
      setDiscount(0);
      setNotes("");
      setActiveTableId(null);
      setCurrentBill([]);
      
      // Refresh data immediately to update invoice lists
      await fetchAllData();
      await fetchOpenTables(true); // Skip auto-select after sending order
      setPendingInvoiceData(null);
      
      // For servers, switch to BONS tab to show them their pending invoice
      if (currentUser?.role === 'server') {
        setActiveTab('bons');
      }
      
    } catch (error) {
      console.error("Error saving invoice:", error);
      const detail = error.response?.data?.detail;
      if (error.response?.status === 423 && detail) {
        toast.error(detail, { duration: 6000 });
      } else {
        toast.error(detail || "Erreur lors de l'enregistrement");
      }
    }
  };

  // Kkiapay payment handler
  const handleKkiapayPayment = () => {
    if (!pendingInvoiceData) return;
    
    // Load Kkiapay widget
    if (window.openKkiapayWidget) {
      window.openKkiapayWidget({
        amount: pendingInvoiceData.total,
        position: "center",
        callback: "",
        data: JSON.stringify({ invoice: pendingInvoiceData }),
        theme: "#d4a500",
        key: "4b3fe59844c0f4291c1b285a9485024a1d668c96",
        sandbox: false
      });
      
      // Listen for payment success
      const successHandler = async (event) => {
        const { transactionId } = event.detail;
        pendingInvoiceData.payment_reference = transactionId;
        pendingInvoiceData.payment_status = "paid";
        await createInvoice(pendingInvoiceData);
        setShowMobilePaymentModal(false);
        toast.success("Paiement Kkiapay réussi !");
        window.removeEventListener('successKkiapay', successHandler);
      };
      
      const failHandler = () => {
        toast.error("Paiement échoué");
        window.removeEventListener('failedKkiapay', failHandler);
      };
      
      window.addEventListener('successKkiapay', successHandler);
      window.addEventListener('failedKkiapay', failHandler);
    } else {
      toast.error("Kkiapay non disponible - Veuillez rafraîchir la page");
    }
    setShowMobilePaymentModal(false);
  };

  // Wallet payment handler
  const handleWalletPayment = async () => {
    if (!pendingInvoiceData || !selectedClient) {
      toast.error("Veuillez sélectionner un client avec un porte-monnaie");
      return;
    }
    
    // Check wallet balance
    try {
      const walletRes = await axios.get(`${API}/wallet/${selectedClient.phone}`);
      const walletBalance = walletRes.data.balance || 0;
      
      if (walletBalance < pendingInvoiceData.total) {
        toast.error(`Solde insuffisant (${formatPrice(walletBalance)} F disponible)`);
        return;
      }
      
      // Deduct from wallet
      await axios.post(`${API}/wallet/debit`, {
        phone: selectedClient.phone,
        amount: pendingInvoiceData.total,
        description: `Facture Caisse - ${pendingInvoiceData.items.length} articles`
      });
      
      pendingInvoiceData.payment_method = "wallet";
      pendingInvoiceData.payment_status = "paid";
      await createInvoice(pendingInvoiceData);
      setShowMobilePaymentModal(false);
      toast.success("Paiement par porte-monnaie réussi !");
    } catch (error) {
      console.error("Wallet payment error:", error);
      toast.error("Erreur lors du paiement par porte-monnaie");
    }
  };

  // Pay later (mark as pending payment)
  const handlePayLater = async () => {
    if (!pendingInvoiceData) return;
    pendingInvoiceData.payment_status = "pending";
    await createInvoice(pendingInvoiceData);
    setShowMobilePaymentModal(false);
    toast.info("Bon créé - Paiement en attente");
  };

  // Open payment method modal before validating invoice
  const validateInvoice = (invoiceId) => {
    const invoice = invoices.find(i => i.id === invoiceId);
    if (!invoice) return;
    setPendingValidationInvoice(invoice);
    setSelectedPaymentMethod(invoice.payment_method || "cash");
    // Set invoice date to the original creation date or today
    const originalDate = invoice.created_at ? invoice.created_at.split('T')[0] : new Date().toISOString().split('T')[0];
    setInvoiceDate(originalDate);
    setShowPaymentMethodModal(true);
  };

  // Actually validate the invoice with selected payment method
  const confirmValidateInvoice = async () => {
    if (!pendingValidationInvoice) return;
    
    try {
      // Create the new date with time from original invoice
      const newCreatedAt = invoiceDate + 'T' + (pendingValidationInvoice.created_at?.split('T')[1] || '12:00:00.000Z');
      
      await axios.put(`${API}/invoices/${pendingValidationInvoice.id}?${actorQs()}`, {
        validation_status: "validated",
        validated_by: formatValidatorLabel(currentUser),
        validated_at: new Date().toISOString(),
        payment_method: selectedPaymentMethod,
        created_at: newCreatedAt // Update the invoice date
      });
      
      const dateFormatted = new Date(invoiceDate).toLocaleDateString('fr-FR');
      toast.success(`Bon ${pendingValidationInvoice?.invoice_number || ''} transformé ! Date: ${dateFormatted}, Mode: ${
        selectedPaymentMethod === 'cash' ? 'Espèces' : 
        selectedPaymentMethod === 'mobile' ? 'Mobile Money' : 
        selectedPaymentMethod === 'card' ? 'Carte Bancaire' : selectedPaymentMethod
      }`);
      setShowPaymentMethodModal(false);
      setPendingValidationInvoice(null);
      setSelectedPaymentMethod("cash");
      setInvoiceDate(new Date().toISOString().split('T')[0]);
      fetchAllData();
    } catch (error) {
      console.error("Error validating invoice:", error);
      toast.error("Erreur lors de la transformation en bon");
    }
  };

  // Delete pending invoice (servers can delete their own pending, managers can delete any pending)
  const deleteInvoice = async (invoiceId) => {
    const invoice = invoices.find(i => i.id === invoiceId);
    if (!invoice) return;
    
    // Only admin can delete validated invoices
    if (invoice.validation_status === 'validated' && currentUser?.role !== 'admin') {
      toast.error("Seul l'administrateur peut supprimer une facture validé");
      return;
    }
    
    if (!confirm("Supprimer cette facture ?")) return;
    try {
      await axios.delete(`${API}/invoices/${invoiceId}?${actorQs()}`);
      toast.success("Bon supprimé");
      fetchAllData();
    } catch (error) {
      toast.error("Erreur lors de la suppression");
    }
  };

  // Cancel validated invoice (admin ONLY) - keeps history
  const cancelValidatedInvoice = async (invoiceId) => {
    const invoice = invoices.find(i => i.id === invoiceId);
    if (!invoice) return;
    
    if (currentUser?.role !== 'admin') {
      toast.error("Seul l'administrateur principal peut annuler une facture validé");
      return;
    }
    
    const reason = prompt("Motif d'annulation de la facture :");
    if (!reason) return;
    
    try {
      await axios.put(`${API}/invoices/${invoiceId}?${actorQs()}`, {
        validation_status: "cancelled",
        cancelled_by: currentUser?.full_name || currentUser?.username || "Admin",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason
      });
      toast.success("Bon annulé et archivé");
      fetchAllData();
      fetchCancellationRequests();
    } catch (error) {
      toast.error("Erreur lors de l'annulation");
    }
  };

  // Request cancellation (for managers)
  const requestCancellation = async (invoice) => {
    const reason = prompt("Motif de la demande d'annulation :");
    if (!reason) return;
    
    try {
      await axios.post(`${API}/cancellation-requests`, {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        reason: reason,
        requested_by: currentUser?.full_name || currentUser?.username || "Manager"
      });
      toast.success("Demande d'annulation envoyée à l'administrateur");
      fetchCancellationRequests();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de l'envoi de la demande");
    }
  };

  // Fetch cancellation requests (for admin)
  const fetchCancellationRequests = async () => {
    try {
      const response = await axios.get(`${API}/cancellation-requests`);
      const newRequests = response.data.requests || [];
      
      // Notify admin of new cancellation requests
      if (newRequests.length > lastCancellationCount && lastCancellationCount > 0) {
        playNotificationSound();
        toast.info("🔔 Nouvelle demande d'annulation reçue !", {
          duration: 5000,
          style: { background: '#dc2626', color: 'white' }
        });
      }
      setLastCancellationCount(newRequests.length);
      setCancellationRequests(newRequests);
    } catch (error) {
      console.error("Error fetching cancellation requests:", error);
    }
  };

  // Approve cancellation request (admin only)
  const approveCancellationRequest = async (requestId) => {
    if (!confirm("Approuver cette demande d'annulation ?")) return;
    try {
      await axios.put(`${API}/cancellation-requests/${requestId}/approve?approved_by=${encodeURIComponent(currentUser?.full_name || 'Admin')}`);
      toast.success("Demande approuvée - Bon annulé");
      fetchAllData();
      fetchCancellationRequests();
    } catch (error) {
      toast.error("Erreur lors de l'approbation");
    }
  };

  // Reject cancellation request (admin only)
  const rejectCancellationRequest = async (requestId) => {
    if (!confirm("Rejeter cette demande d'annulation ?")) return;
    try {
      await axios.put(`${API}/cancellation-requests/${requestId}/reject?rejected_by=${encodeURIComponent(currentUser?.full_name || 'Admin')}`);
      toast.success("Demande rejetée");
      fetchCancellationRequests();
    } catch (error) {
      toast.error("Erreur lors du rejet");
    }
  };

  // ============== MODIFICATION REQUESTS ==============
  
  // Request modification (for servers)
  const requestModification = async (invoice) => {
    const reason = prompt("Motif de la demande de modification :");
    if (!reason) return;
    
    try {
      await axios.post(`${API}/modification-requests`, {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        reason: reason,
        requested_by: currentUser?.full_name || currentUser?.username || "Serveur"
      });
      toast.success("Demande de modification envoyée à la gérante");
      fetchModificationRequests();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de l'envoi de la demande");
    }
  };

  // Fetch modification requests (for managers)
  const fetchModificationRequests = async () => {
    try {
      const response = await axios.get(`${API}/modification-requests`);
      const newRequests = response.data.requests || [];
      
      // Notify manager of new modification requests
      if (newRequests.length > lastModificationCount && lastModificationCount > 0) {
        playNotificationSound();
        toast.info("🔔 Nouvelle demande de modification reçue !", {
          duration: 5000,
          style: { background: '#2563eb', color: 'white' }
        });
      }
      setLastModificationCount(newRequests.length);
      setModificationRequests(newRequests);
    } catch (error) {
      console.error("Error fetching modification requests:", error);
    }
  };

  // Approve modification request (manager only)
  const approveModificationRequest = async (requestId) => {
    if (!confirm("Autoriser la modification de cette facture ?")) return;
    try {
      await axios.put(`${API}/modification-requests/${requestId}/approve?approved_by=${encodeURIComponent(currentUser?.full_name || 'Manager')}`);
      toast.success("Modification autorisée - Le serveur peut maintenant modifier la facture");
      fetchAllData();
      fetchModificationRequests();
    } catch (error) {
      toast.error("Erreur lors de l'approbation");
    }
  };

  // Reject modification request (manager only)
  const rejectModificationRequest = async (requestId) => {
    if (!confirm("Rejeter cette demande de modification ?")) return;
    try {
      await axios.put(`${API}/modification-requests/${requestId}/reject?rejected_by=${encodeURIComponent(currentUser?.full_name || 'Manager')}`);
      toast.success("Demande rejetée");
      fetchModificationRequests();
    } catch (error) {
      toast.error("Erreur lors du rejet");
    }
  };

  // Start editing invoice (for servers with modification_allowed)
  const startEditingInvoice = (invoice) => {
    setEditingInvoice(invoice);
    setEditingItems([...invoice.items]);
    setEditingDepartment("salle_jardin"); // Reset to default department
  };

  // State for editing modal - which department is selected for adding
  const [editingDepartment, setEditingDepartment] = useState("salle_jardin");

  // Add product to editing items
  const addProductToEditing = (product, department) => {
    const existingIndex = editingItems.findIndex(item => 
      item.name === product.name && item.department === department
    );
    
    if (existingIndex >= 0) {
      // Increment quantity if already exists
      const newItems = [...editingItems];
      newItems[existingIndex].quantity += 1;
      setEditingItems(newItems);
    } else {
      // Add new item
      setEditingItems([...editingItems, {
        id: product.id || `custom-${Date.now()}`,
        name: product.name,
        price: product.price,
        quantity: 1,
        department: department,
        unit: product.unit || "unité"
      }]);
    }
    toast.success(`${product.name} ajouté`);
  };

  // Update item quantity in editing mode
  const updateEditingItemQuantity = (index, delta) => {
    const newItems = [...editingItems];
    newItems[index].quantity = Math.max(1, newItems[index].quantity + delta);
    setEditingItems(newItems);
  };

  // Remove item in editing mode
  const removeEditingItem = (index) => {
    if (editingItems.length <= 1) {
      toast.error("Le bon doit contenir au moins un article");
      return;
    }
    const newItems = editingItems.filter((_, i) => i !== index);
    setEditingItems(newItems);
  };

  // Save modified invoice
  const saveModifiedInvoice = async () => {
    if (!editingInvoice) return;
    
    const newTotal = editingItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    try {
      await axios.put(`${API}/invoices/${editingInvoice.id}/update-items?${actorQs()}`, {
        items: editingItems,
        total: newTotal
      });
      toast.success("Bon de commande modifié avec succès");
      setEditingInvoice(null);
      setEditingItems([]);
      fetchAllData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de la modification");
    }
  };

  // ============== BON DE COMMANDE CUISINE (80mm) ==============
  const printKitchenOrder = (invoice) => {
    const printWindow = window.open('', '_blank', 'width=350,height=700');
    
    // CUISINE = articles salle_jardin (restaurant) + accompagnements
    const kitchenItems = (invoice.items || []).filter(item => 
      item.department === 'salle_jardin' || item.department === 'accompagnements'
    );
    const totalItems = kitchenItems.reduce((sum, item) => sum + item.quantity, 0);
    
    // If no kitchen items, show message
    if (totalItems === 0) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html><head><title>Aucun article cuisine</title></head>
        <body style="font-family: Arial; padding: 20px; text-align: center;">
          <h2>Aucun article pour la cuisine</h2>
          <p>Cette commande ne contient pas de plats ni d'accompagnements.</p>
          <script>setTimeout(function() { window.close(); }, 2000);</script>
        </body></html>
      `);
      printWindow.document.close();
      return;
    }
    
    // Séparer plats et accompagnements
    const plats = kitchenItems.filter(item => item.department === 'salle_jardin');
    const accompagnements = kitchenItems.filter(item => item.department === 'accompagnements');
    
    const platsHtml = plats.length > 0 ? plats.map(item => `
      <div class="item-row">
        <div class="qty-badge">${item.quantity}</div>
        <div class="item-name">${item.name}</div>
      </div>
    `).join('') : '';
    
    const accompagnementsHtml = accompagnements.length > 0 ? `
      <div class="section-divider">ACCOMPAGNEMENTS</div>
      ${accompagnements.map(item => `
        <div class="item-row accomp">
          <div class="qty-badge accomp-badge">${item.quantity}</div>
          <div class="item-name">${item.name}</div>
        </div>
      `).join('')}
    ` : '';

    // Get table number and time
    const tableNum = invoice.table_number || '—';
    const orderTime = new Date(invoice.created_at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'});
    const orderDate = new Date(invoice.created_at).toLocaleDateString('fr-FR', {day: '2-digit', month: '2-digit'});

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>CUISINE - ${invoice.invoice_number}</title>
          <meta charset="UTF-8">
          <style>
            @page { size: 80mm auto; margin: 0; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Courier New', monospace; width: 80mm; padding: 3mm; font-size: 12px; line-height: 1.3; background: #fff; color: #000; }
            .header { text-align: center; padding: 8px 0; border-bottom: 3px solid #000; margin-bottom: 8px; }
            .kitchen-title { font-size: 28px; font-weight: 900; letter-spacing: 3px; }
            .subtitle { font-size: 11px; margin-top: 2px; }
            .table-box { border: 3px solid #000; text-align: center; padding: 8px; margin: 8px 0; }
            .table-label { font-size: 12px; font-weight: 600; }
            .table-number { font-size: 56px; font-weight: 900; line-height: 1; }
            .table-time { font-size: 14px; font-weight: 600; margin-top: 4px; }
            .meta-section { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #000; margin-bottom: 8px; font-size: 11px; }
            .items-section { border: 2px solid #000; margin: 8px 0; }
            .items-header { background: #000; color: #fff; padding: 6px 8px; display: flex; align-items: center; justify-content: space-between; }
            .items-title { font-size: 13px; font-weight: 800; letter-spacing: 1px; }
            .items-count { background: #fff; color: #000; padding: 2px 8px; font-size: 12px; font-weight: 900; }
            .item-row { display: flex; align-items: center; padding: 6px 8px; border-bottom: 1px dashed #ccc; }
            .item-row:last-child { border-bottom: none; }
            .qty-badge { background: #000; color: #fff; min-width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900; margin-right: 10px; }
            .item-name { font-size: 14px; font-weight: 600; }
            .section-divider { background: #333; color: #fff; padding: 4px 8px; font-size: 11px; font-weight: 700; text-align: center; letter-spacing: 1px; margin-top: 2px; }
            .item-row.accomp { background: #f5f5f5; }
            .accomp-badge { background: #666 !important; }
            .summary-box { border: 3px solid #000; padding: 8px; margin: 10px 0; text-align: center; }
            .summary-label { font-size: 11px; font-weight: 600; }
            .summary-value { font-size: 32px; font-weight: 900; line-height: 1; }
            .footer { text-align: center; margin-top: 8px; padding-top: 8px; border-top: 3px solid #000; }
            .footer-badge { font-size: 12px; font-weight: 800; letter-spacing: 1px; }
            .footer-time { font-size: 9px; margin-top: 4px; }
            .cut-line { margin-top: 10px; padding-top: 6px; border-top: 1px dashed #000; text-align: center; font-size: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="kitchen-title">CUISINE</div>
            <div class="subtitle">Facture</div>
          </div>
          <div class="table-box">
            <div class="table-label">TABLE N°</div>
            <div class="table-number">${tableNum}</div>
            <div class="table-time">${orderTime}</div>
          </div>
          <div class="meta-section">
            <span><strong>Serveur:</strong> ${invoice.created_by || 'N/A'}</span>
            <span><strong>Date:</strong> ${orderDate}</span>
            <span><strong>#${invoice.invoice_number.split('-').pop()}</strong></span>
          </div>
          <div class="items-section">
            <div class="items-header">
              <span class="items-title">PLATS & ACCOMP.</span>
              <span class="items-count">${totalItems}</span>
            </div>
            ${platsHtml}
            ${accompagnementsHtml}
          </div>
          <div class="summary-box">
            <div class="summary-label">TOTAL ARTICLES</div>
            <div class="summary-value">${totalItems}</div>
          </div>
          <div class="footer">
            <div class="footer-badge">*** BON CUISINE ***</div>
            <div class="footer-time">Imprimé ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}</div>
          </div>
          <div class="cut-line">- - - - - - - - - - - - - - - - - -</div>
          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); }, 300);
              setTimeout(function() { window.close(); }, 1000);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // ============== BON DE COMMANDE BAR (80mm) ==============
  const printBarOrder = (invoice) => {
    const printWindow = window.open('', '_blank', 'width=350,height=700');
    
    // Filter only bar items
    const barItems = (invoice.items || []).filter(item => item.department === 'bar');
    const totalItems = barItems.reduce((sum, item) => sum + item.quantity, 0);
    
    // If no bar items, show message
    if (totalItems === 0) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html><head><title>Aucun article bar</title></head>
        <body style="font-family: Arial; padding: 20px; text-align: center;">
          <h2>Aucun article pour le bar</h2>
          <p>Cette commande ne contient pas d'articles Bar.</p>
          <script>setTimeout(function() { window.close(); }, 2000);</script>
        </body></html>
      `);
      printWindow.document.close();
      return;
    }
    
    const itemsHtml = barItems.map(item => `
      <div class="item-row">
        <div class="qty-badge">${item.quantity}</div>
        <div class="item-name">${item.name}</div>
      </div>
    `).join('');

    const tableNum = invoice.table_number || '—';
    const orderTime = new Date(invoice.created_at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'});
    const orderDate = new Date(invoice.created_at).toLocaleDateString('fr-FR', {day: '2-digit', month: '2-digit'});

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>BAR - ${invoice.invoice_number}</title>
          <meta charset="UTF-8">
          <style>
            @page { size: 80mm auto; margin: 0; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Courier New', monospace; width: 80mm; padding: 3mm; font-size: 12px; line-height: 1.3; background: #fff; color: #000; }
            .header { text-align: center; padding: 8px 0; border-bottom: 3px solid #000; margin-bottom: 8px; }
            .bar-title { font-size: 28px; font-weight: 900; letter-spacing: 3px; }
            .subtitle { font-size: 11px; margin-top: 2px; }
            .table-box { border: 3px solid #000; text-align: center; padding: 8px; margin: 8px 0; }
            .table-label { font-size: 12px; font-weight: 600; }
            .table-number { font-size: 56px; font-weight: 900; line-height: 1; }
            .table-time { font-size: 14px; font-weight: 600; margin-top: 4px; }
            .meta-section { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #000; margin-bottom: 8px; font-size: 11px; }
            .items-section { border: 2px solid #000; margin: 8px 0; }
            .items-header { background: #000; color: #fff; padding: 6px 8px; display: flex; align-items: center; justify-content: space-between; }
            .items-title { font-size: 13px; font-weight: 800; letter-spacing: 1px; }
            .items-count { background: #fff; color: #000; padding: 2px 8px; font-size: 12px; font-weight: 900; }
            .item-row { display: flex; align-items: center; padding: 6px 8px; border-bottom: 1px dashed #ccc; }
            .item-row:last-child { border-bottom: none; }
            .qty-badge { background: #000; color: #fff; min-width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900; margin-right: 10px; }
            .item-name { font-size: 14px; font-weight: 600; }
            .summary-box { border: 3px solid #000; padding: 8px; margin: 10px 0; text-align: center; }
            .summary-label { font-size: 11px; font-weight: 600; }
            .summary-value { font-size: 32px; font-weight: 900; line-height: 1; }
            .footer { text-align: center; margin-top: 8px; padding-top: 8px; border-top: 3px solid #000; }
            .footer-badge { font-size: 12px; font-weight: 800; letter-spacing: 1px; }
            .footer-time { font-size: 9px; margin-top: 4px; }
            .cut-line { margin-top: 10px; padding-top: 6px; border-top: 1px dashed #000; text-align: center; font-size: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="bar-title">BAR</div>
            <div class="subtitle">Facture</div>
          </div>
          <div class="table-box">
            <div class="table-label">TABLE N°</div>
            <div class="table-number">${tableNum}</div>
            <div class="table-time">${orderTime}</div>
          </div>
          <div class="meta-section">
            <span><strong>Serveur:</strong> ${invoice.created_by || 'N/A'}</span>
            <span><strong>Date:</strong> ${orderDate}</span>
            <span><strong>#${invoice.invoice_number.split('-').pop()}</strong></span>
          </div>
          <div class="items-section">
            <div class="items-header">
              <span class="items-title">BOISSONS</span>
              <span class="items-count">${totalItems}</span>
            </div>
            ${itemsHtml}
          </div>
          <div class="summary-box">
            <div class="summary-label">TOTAL ARTICLES</div>
            <div class="summary-value">${totalItems}</div>
          </div>
          <div class="footer">
            <div class="footer-badge">*** BON BAR ***</div>
            <div class="footer-time">Imprimé ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}</div>
          </div>
          <div class="cut-line">- - - - - - - - - - - - - - - - - -</div>
          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); }, 300);
              setTimeout(function() { window.close(); }, 1000);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // ============== BON DE COMMANDE JEUX (80mm) ==============
  const printGamesOrder = (invoice) => {
    const printWindow = window.open('', '_blank', 'width=350,height=700');
    
    // Filter only games items
    const gamesItems = (invoice.items || []).filter(item => item.department === 'jeux');
    const totalItems = gamesItems.reduce((sum, item) => sum + item.quantity, 0);
    
    // If no games items, show message
    if (totalItems === 0) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html><head><title>Aucun article jeux</title></head>
        <body style="font-family: Arial; padding: 20px; text-align: center;">
          <h2>Aucun article pour les jeux</h2>
          <p>Cette commande ne contient pas d'articles Jeux.</p>
          <script>setTimeout(function() { window.close(); }, 2000);</script>
        </body></html>
      `);
      printWindow.document.close();
      return;
    }
    
    const itemsHtml = gamesItems.map(item => `
      <div class="item-row">
        <div class="qty-badge">${item.quantity}</div>
        <div class="item-name">${item.name}</div>
      </div>
    `).join('');

    const tableNum = invoice.table_number || '—';
    const orderTime = new Date(invoice.created_at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'});
    const orderDate = new Date(invoice.created_at).toLocaleDateString('fr-FR', {day: '2-digit', month: '2-digit'});

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>JEUX - ${invoice.invoice_number}</title>
          <meta charset="UTF-8">
          <style>
            @page { size: 80mm auto; margin: 0; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Courier New', monospace; width: 80mm; padding: 3mm; font-size: 12px; line-height: 1.3; background: #fff; color: #000; }
            .header { text-align: center; padding: 8px 0; border-bottom: 3px solid #000; margin-bottom: 8px; }
            .games-title { font-size: 28px; font-weight: 900; letter-spacing: 3px; }
            .subtitle { font-size: 11px; margin-top: 2px; }
            .table-box { border: 3px solid #000; text-align: center; padding: 8px; margin: 8px 0; }
            .table-label { font-size: 12px; font-weight: 600; }
            .table-number { font-size: 56px; font-weight: 900; line-height: 1; }
            .table-time { font-size: 14px; font-weight: 600; margin-top: 4px; }
            .meta-section { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #000; margin-bottom: 8px; font-size: 11px; }
            .items-section { border: 2px solid #000; margin: 8px 0; }
            .items-header { background: #000; color: #fff; padding: 6px 8px; display: flex; align-items: center; justify-content: space-between; }
            .items-title { font-size: 13px; font-weight: 800; letter-spacing: 1px; }
            .items-count { background: #fff; color: #000; padding: 2px 8px; font-size: 12px; font-weight: 900; }
            .item-row { display: flex; align-items: center; padding: 6px 8px; border-bottom: 1px dashed #ccc; }
            .item-row:last-child { border-bottom: none; }
            .qty-badge { background: #000; color: #fff; min-width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900; margin-right: 10px; }
            .item-name { font-size: 14px; font-weight: 600; }
            .summary-box { border: 3px solid #000; padding: 8px; margin: 10px 0; text-align: center; }
            .summary-label { font-size: 11px; font-weight: 600; }
            .summary-value { font-size: 32px; font-weight: 900; line-height: 1; }
            .footer { text-align: center; margin-top: 8px; padding-top: 8px; border-top: 3px solid #000; }
            .footer-badge { font-size: 12px; font-weight: 800; letter-spacing: 1px; }
            .footer-time { font-size: 9px; margin-top: 4px; }
            .cut-line { margin-top: 10px; padding-top: 6px; border-top: 1px dashed #000; text-align: center; font-size: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="games-title">JEUX</div>
            <div class="subtitle">Facture</div>
          </div>
          <div class="table-box">
            <div class="table-label">TABLE N°</div>
            <div class="table-number">${tableNum}</div>
            <div class="table-time">${orderTime}</div>
          </div>
          <div class="meta-section">
            <span><strong>Serveur:</strong> ${invoice.created_by || 'N/A'}</span>
            <span><strong>Date:</strong> ${orderDate}</span>
            <span><strong>#${invoice.invoice_number.split('-').pop()}</strong></span>
          </div>
          <div class="items-section">
            <div class="items-header">
              <span class="items-title">SESSIONS</span>
              <span class="items-count">${totalItems}</span>
            </div>
            ${itemsHtml}
          </div>
          <div class="summary-box">
            <div class="summary-label">TOTAL SESSIONS</div>
            <div class="summary-value">${totalItems}</div>
          </div>
          <div class="footer">
            <div class="footer-badge">*** BON JEUX ***</div>
            <div class="footer-time">Imprimé ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}</div>
          </div>
          <div class="cut-line">- - - - - - - - - - - - - - - - - -</div>
          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); }, 300);
              setTimeout(function() { window.close(); }, 1000);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // ============== TICKET THERMIQUE (80mm) ==============
  const printTicket = (invoice) => {
    const printWindow = window.open('', '_blank', 'width=300,height=600');
    const itemsHtml = (invoice.items || []).map(item => `
      <tr>
        <td style="padding: 2px 0; font-size: 11px;">${item.name}</td>
        <td style="padding: 2px 0; text-align: center; font-size: 11px;">${item.quantity}</td>
        <td style="padding: 2px 0; text-align: right; font-size: 11px;">${formatPrice(item.price * item.quantity)}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Bon ${invoice.invoice_number}</title>
          <style>
            @page { size: 80mm auto; margin: 0; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Courier New', monospace; 
              width: 80mm; 
              padding: 5mm; 
              font-size: 12px;
              line-height: 1.3;
            }
            .header { text-align: center; margin-bottom: 8px; border-bottom: 1px dashed #000; padding-bottom: 8px; }
            .logo { width: 50px; height: 50px; margin: 0 auto 5px; }
            .logo img { width: 100%; height: 100%; object-fit: contain; }
            .header p { font-size: 10px; }
            .info { margin: 8px 0; font-size: 11px; }
            .info div { display: flex; justify-content: space-between; }
            table { width: 100%; border-collapse: collapse; margin: 8px 0; }
            th { text-align: left; font-size: 10px; border-bottom: 1px solid #000; padding: 2px 0; }
            .totals { border-top: 1px dashed #000; margin-top: 8px; padding-top: 8px; }
            .totals div { display: flex; justify-content: space-between; font-size: 11px; margin: 2px 0; }
            .grand-total { font-size: 14px !important; font-weight: bold; border-top: 1px solid #000; padding-top: 5px; margin-top: 5px; }
            .footer { text-align: center; margin-top: 10px; font-size: 10px; border-top: 1px dashed #000; padding-top: 8px; }
            .server { font-size: 10px; margin-top: 5px; }
            .validation { font-size: 10px; margin-top: 3px; }
            .doc-title { font-size: 9px; font-weight: bold; text-align: center; margin: 5px 0; letter-spacing: 1px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo"><img src="${LOGO_BASE64}" alt="Logo" /></div>
            <p>Restaurant & Jeux VR</p>
            <p>Tél: +229 01 4147 0000</p>
          </div>
          
          <div class="doc-title">BON DE COMMANDE</div>
          
          <div class="info">
            <div><span>N°:</span><span><b>${invoice.invoice_number}</b></span></div>
            <div><span>Date:</span><span>${format(new Date(invoice.created_at), "dd/MM/yy HH:mm")}</span></div>
            <div><span>Client:</span><span>${invoice.customer_name}</span></div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th style="width: 50%;">Article</th>
                <th style="text-align: center;">Qté</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          
          <div class="totals">
            <div><span>Sous-total:</span><span>${formatPrice(invoice.subtotal)} F</span></div>
            ${invoice.discount > 0 ? `<div><span>Remise (${invoice.discount}%):</span><span>-${formatPrice(invoice.discount_amount)} F</span></div>` : ''}
            <div class="grand-total"><span>TOTAL:</span><span>${formatPrice(invoice.total)} FCFA</span></div>
            <div><span>Paiement:</span><span>${PAYMENT_METHODS.find(p => p.value === invoice.payment_method)?.label || invoice.payment_method}</span></div>
          </div>
          
          <div class="server">
            Serveur: ${invoice.created_by || '-'}
          </div>
          ${invoice.validation_status === 'validated' ? `
          <div class="validation">
            Validé par: ${invoice.validated_by || formatValidatorLabel(currentUser)}
          </div>
          ` : `
          <div class="validation" style="color: red;">
            En attente de validation
          </div>
          `}
          
          <div class="footer">
            <p>Merci de votre visite !</p>
            <p>À bientôt</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  };

  // Download PDF from backend
  const downloadPDF = async (invoice) => {
    if (!invoice.id || invoice.id === "PREVIEW") {
      toast.error("Veuillez d'abord enregistrer le facture");
      return;
    }
    try {
      const response = await axios.get(`${API}/invoices/${invoice.id}/pdf`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `facture_${invoice.invoice_number || invoice.id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("PDF téléchargé");
    } catch (error) {
      console.error("Error downloading PDF:", error);
      toast.error("Erreur lors du téléchargement du PDF");
    }
  };

  // ============== CRUD OPERATIONS ==============
  const saveProduct = async () => {
    try {
      const modifierInfo = {
        modified_by: currentUser?.full_name || currentUser?.username || "Utilisateur",
        modified_by_role: currentUser?.role || "unknown"
      };
      
      // Auto-assign department based on category
      const catToDept = {
        "Plats": "salle_jardin", "Entrees": "salle_jardin", "Grillades": "salle_jardin",
        "Sauces": "salle_jardin", "Desserts": "salle_jardin", "Petit-dejeuner": "salle_jardin",
        "Snacks": "salle_jardin", "Accompagnements": "accompagnements",
        "Boissons": "bar", "Cocktails": "bar"
      };
      const formData = { ...productForm, department: catToDept[productForm.category] || productForm.department || "salle_jardin" };
      
      if (editProduct) {
        await axios.put(`${API}/caisse/products/${editProduct.id}`, {
          ...formData,
          ...modifierInfo
        });
        toast.success("Produit modifié");
      } else {
        await axios.post(`${API}/caisse/products?modified_by=${encodeURIComponent(modifierInfo.modified_by)}&modified_by_role=${modifierInfo.modified_by_role}`, formData);
        toast.success("Produit ajouté");
      }
      setShowProductModal(false);
      setEditProduct(null);
      setProductForm({ name: "", price: 0, department: "bar", unit: "unité", category: "" });
      fetchAllData();
      
      // Refresh notifications if admin
      if (currentUser?.role === 'admin') {
        fetchMenuNotifications();
      }
    } catch (error) {
      toast.error("Erreur");
    }
  };

  const deleteProduct = async (productId) => {
    if (!confirm("Supprimer ce produit ?")) return;
    try {
      const modifierInfo = {
        modified_by: currentUser?.full_name || currentUser?.username || "Utilisateur",
        modified_by_role: currentUser?.role || "unknown"
      };
      
      await axios.delete(`${API}/caisse/products/${productId}?modified_by=${encodeURIComponent(modifierInfo.modified_by)}&modified_by_role=${modifierInfo.modified_by_role}`);
      toast.success("Produit supprimé");
      fetchAllData();
      
      // Refresh notifications if admin
      if (currentUser?.role === 'admin') {
        fetchMenuNotifications();
      }
    } catch (error) {
      toast.error("Erreur");
    }
  };

  const saveClient = async () => {
    try {
      if (editClient) {
        await axios.put(`${API}/caisse/clients/${editClient.id}`, clientForm);
        toast.success("Client modifié");
      } else {
        await axios.post(`${API}/caisse/clients`, clientForm);
        toast.success("Client ajouté");
      }
      setShowClientModal(false);
      setEditClient(null);
      setClientForm({ name: "", phone: "", email: "", notes: "" });
      fetchAllData();
    } catch (error) {
      toast.error("Erreur");
    }
  };

  const deleteClient = async (clientId) => {
    if (!confirm("Supprimer ce client ?")) return;
    try {
      await axios.delete(`${API}/caisse/clients/${clientId}`);
      toast.success("Client supprimé");
      fetchAllData();
    } catch (error) {
      toast.error("Erreur");
    }
  };

  const saveUser = async () => {
    try {
      if (!userForm.username) {
        toast.error("Le nom d'utilisateur est requis");
        return;
      }
      if (!editUser && !userForm.pin) {
        toast.error("Le code PIN est requis");
        return;
      }
      if (userForm.pin && (userForm.pin.length < 4 || userForm.pin.length > 6)) {
        toast.error("Le code PIN doit contenir 4 à 6 chiffres");
        return;
      }
      
      if (editUser) {
        await axios.put(`${API}/caisse/users/${editUser.id}`, userForm);
        toast.success("Utilisateur modifié");
      } else {
        await axios.post(`${API}/caisse/users`, userForm);
        toast.success("Utilisateur créé");
      }
      setShowUserModal(false);
      setEditUser(null);
      setUserForm({ username: "", email: "", password: "", pin: "", role: "server", full_name: "" });
      fetchAllData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur");
    }
  };

  const deleteUser = async (userId) => {
    if (!confirm("Supprimer cet utilisateur ?")) return;
    try {
      await axios.delete(`${API}/caisse/users/${userId}`);
      toast.success("Utilisateur supprimé");
      fetchAllData();
    } catch (error) {
      toast.error("Erreur");
    }
  };

  // ============== RENDER LOGIN ==============
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <Card className="bg-slate-800/80 border-amber-500/30 w-full max-w-md backdrop-blur-sm shadow-2xl">
          <CardHeader className="text-center pb-2">
            <div className="w-24 h-24 bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Receipt className="w-12 h-12 text-white" />
            </div>
            <CardTitle className="text-3xl font-bold text-amber-500">CAISSE PRO</CardTitle>
            <p className="text-xl text-white font-semibold mt-1">Espace Maxo</p>
            <p className="text-slate-400 text-sm">Système de facturation</p>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            {/* Toggle between PIN and Admin login */}
            <div className="flex gap-2 mb-4">
              <Button 
                variant={loginMode === "pin" ? "default" : "outline"}
                onClick={() => setLoginMode("pin")}
                className={loginMode === "pin" ? "flex-1 bg-amber-500 hover:bg-amber-600" : "flex-1 border-slate-600 text-slate-400"}
              >
                Serveur (PIN)
              </Button>
              <Button 
                variant={loginMode === "admin" ? "default" : "outline"}
                onClick={() => setLoginMode("admin")}
                className={loginMode === "admin" ? "flex-1 bg-amber-500 hover:bg-amber-600" : "flex-1 border-slate-600 text-slate-400"}
              >
                Admin
              </Button>
            </div>

            {loginMode === "pin" ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Code PIN (4-6 chiffres)</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={loginForm.pin}
                    onChange={(e) => setLoginForm({ ...loginForm, pin: e.target.value.replace(/\D/g, '') })}
                    onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                    className="bg-slate-700/50 border-slate-600 text-white text-3xl py-8 text-center tracking-[0.5em] font-mono"
                    placeholder="••••••"
                  />
                </div>
                <p className="text-slate-500 text-xs text-center">Entrez votre code PIN personnel</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Mot de passe administrateur</Label>
                  <Input
                    type="password"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                    className="bg-slate-700/50 border-slate-600 text-white text-lg py-6"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            )}

            <Button onClick={handleLogin} className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold py-6 text-lg shadow-lg">
              Se connecter
            </Button>
            
            {/* Code oublié */}
            <div className="text-center pt-2">
              <button 
                onClick={() => setShowForgotCodeModal(true)}
                className="text-amber-400 hover:text-amber-300 text-sm underline"
              >
                Code et identifiant oublié ?
              </button>
            </div>
          </CardContent>
        </Card>
        
        {/* Modal Code Oublié */}
        <Dialog open={showForgotCodeModal} onOpenChange={setShowForgotCodeModal}>
          <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-400">
                <AlertCircle className="w-5 h-5" />
                Code et identifiant oublié
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-slate-300">
                Si vous avez oublié votre code PIN ou votre identifiant, veuillez contacter :
              </p>
              <div className="bg-slate-900/50 p-4 rounded-lg space-y-2">
                <p className="text-white font-medium">L'Administrateur ou la Gérante</p>
                <p className="text-amber-400 flex items-center gap-2">
                  <Smartphone className="w-4 h-4" />
                  +229 01 4147 0000
                </p>
              </div>
              <p className="text-slate-400 text-sm">
                Ils pourront vous communiquer vos identifiants ou réinitialiser votre code PIN.
              </p>
            </div>
            <Button 
              onClick={() => setShowForgotCodeModal(false)} 
              className="w-full bg-amber-500 hover:bg-amber-600"
            >
              Compris
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ============== MAIN RENDER ==============
  // Profile cuisinier → page dédiée
  if (currentUser?.role === "cuisinier") {
    return <CuisinePage currentUser={currentUser} onLogout={() => { setIsAuthenticated(false); setCurrentUser(null); }} />;
  }
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-800/90 border-b border-slate-700 sticky top-0 z-50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <Receipt className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-bold text-amber-500 truncate">CAISSE PRO</h1>
                <p className="text-slate-400 text-[10px] sm:text-xs truncate hidden xs:block">{format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}</p>
              </div>
              {/* Real-time sync + offline indicator (Phase 1) */}
              <OfflineIndicator />
              {/* Plats prêts depuis la cuisine */}
              {readyNotif.unreadCount > 0 && (
                <button
                  type="button"
                  onClick={readyNotif.clear}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-[11px] font-bold animate-pulse"
                  title="Plats prêts par la cuisine — cliquer pour effacer"
                  data-testid="ready-notif-badge"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Plats prêts</span>
                  <span className="bg-emerald-500 text-slate-900 text-[9px] px-1 rounded">{readyNotif.unreadCount}</span>
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              {/* Notification Bell for Admin (Menu modifications) */}
              {currentUser?.role === 'admin' && (
                <div className="relative">
                  <Button 
                    variant="ghost" 
                    onClick={() => setShowNotificationsPanel(!showNotificationsPanel)}
                    className="text-slate-400 hover:text-white hover:bg-slate-700/50 relative"
                  >
                    <Bell className="w-5 h-5" />
                    {unreadNotificationCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold animate-pulse">
                        {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                      </span>
                    )}
                  </Button>
                  
                  {/* Notifications Panel */}
                  {showNotificationsPanel && (
                    <div className="absolute right-0 top-12 w-80 sm:w-96 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
                      <div className="p-3 border-b border-slate-700 flex items-center justify-between">
                        <h3 className="text-white font-semibold flex items-center gap-2">
                          <Bell className="w-4 h-4" />
                          Modifications du Menu
                        </h3>
                        {unreadNotificationCount > 0 && (
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={markAllNotificationsRead}
                            className="text-xs text-blue-400 hover:text-blue-300"
                          >
                            Tout marquer lu
                          </Button>
                        )}
                      </div>
                      <div className="p-2">
                        {menuNotifications.length === 0 ? (
                          <p className="text-slate-500 text-center py-4 text-sm">Aucune notification</p>
                        ) : (
                          menuNotifications.slice(0, 20).map(notif => (
                            <div 
                              key={notif.id}
                              onClick={() => markNotificationRead(notif.id)}
                              className={`p-3 rounded-lg mb-2 cursor-pointer transition-colors ${
                                notif.is_read ? 'bg-slate-700/30' : 'bg-blue-900/30 border border-blue-500/30'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <div className={`w-2 h-2 rounded-full mt-1.5 ${
                                  notif.action === 'created' ? 'bg-green-400' :
                                  notif.action === 'updated' ? 'bg-blue-400' :
                                  'bg-red-400'
                                }`}></div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-white text-sm font-medium">
                                    {notif.action === 'created' && '➕ Nouveau produit'}
                                    {notif.action === 'updated' && '✏️ Produit modifié'}
                                    {notif.action === 'deleted' && '🗑️ Produit supprimé'}
                                  </p>
                                  <p className="text-slate-300 text-sm truncate">{notif.product_name}</p>
                                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                                    <span>Par: {notif.modified_by}</span>
                                    {notif.action === 'updated' && notif.old_price !== notif.new_price && (
                                      <span className="text-amber-400">
                                        {formatPrice(notif.old_price)} → {formatPrice(notif.new_price)} F
                                      </span>
                                    )}
                                    {notif.action === 'created' && notif.new_price && (
                                      <span className="text-green-400">{formatPrice(notif.new_price)} F</span>
                                    )}
                                  </div>
                                  <p className="text-slate-500 text-xs mt-1">
                                    {new Date(notif.created_at).toLocaleString('fr-FR', {
                                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                                    })}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Revision Notifications for Manager (Achats à réviser) — désactivé : la Gérante n'a plus accès à Achats (24/05/2026) */}
              {false && currentUser?.role === 'manager' && revisionExpensesCount > 0 && (
                <Button 
                  variant="ghost" 
                  onClick={() => setActiveTab('achats')}
                  className="text-orange-400 hover:text-orange-300 hover:bg-orange-500/20 relative"
                  title="Achats à réviser"
                >
                  <AlertTriangle className="w-5 h-5" />
                  <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold animate-pulse">
                    {revisionExpensesCount}
                  </span>
                </Button>
              )}

              {/* End of Service Button for Servers */}
              {currentUser?.role === 'server' && (
                <Button 
                  onClick={() => {
                    // Pre-load today's report so the modal shows the summary
                    const serverName = currentUser?.full_name || currentUser?.username;
                    if (serverName) fetchServerDailyReport(serverName, format(new Date(), "yyyy-MM-dd"));
                    setShowEndOfServiceModal(true);
                  }}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-sm"
                  data-testid="terminer-service-btn"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Terminer Service
                </Button>
              )}
              
              <div className="text-right hidden md:block">
                <p className="text-white font-medium flex items-center justify-end gap-2">
                  {currentUser?.full_name || currentUser?.username}
                </p>
                <Badge className={
                  currentUser?.role === 'admin' ? 'bg-amber-500/20 text-amber-400' : 
                  currentUser?.role === 'manager' ? 'bg-blue-500/20 text-blue-400' : 
                  currentUser?.role === 'cuisinier' ? 'bg-green-500/20 text-green-400' :
                  currentUser?.role === 'coach_jeux' ? 'bg-purple-500/20 text-purple-400' :
                  'bg-slate-500/20 text-slate-400'
                }>
                  {currentUser?.role === 'admin' ? 'Administrateur' : 
                   currentUser?.role === 'manager' ? 'Responsable des Opérations & Logistique' : 
                   currentUser?.role === 'cuisinier' ? 'Cuisinier' :
                   currentUser?.role === 'coach_jeux' ? 'Coach Jeux' :
                   'Serveur'}
                </Badge>
              </div>

              {/* NOTIFICATION CENTER — extracted component */}
              <NotificationBell
                effectiveCounts={effectiveCounts}
                effectiveTotal={effectiveTotal}
                notifLatest={notifLatest}
                showNotifCenter={showNotifCenter}
                setShowNotifCenter={setShowNotifCenter}
                onOpenNotif={openNotifAndNavigate}
                onMarkAllRead={markAllNotifsRead}
              />
              {/* Share QR Code Button */}
              <ShareButton onClick={() => setShowShareModal(true)} />

              {/* Toggle ding + browser notifications (admin + manager) */}
              {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
                <Button
                  variant="ghost"
                  onClick={toggleNotifEnabled}
                  title={notifEnabled ? (notifPermission === 'granted' ? "Notifications activées" : "Cliquer pour autoriser les notifications") : "Notifications muettes — cliquer pour réactiver"}
                  className={notifEnabled ? "text-amber-300 hover:bg-amber-500/10" : "text-slate-500 hover:bg-slate-700/40"}
                  data-testid="notif-toggle-btn"
                >
                  {notifEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
                </Button>
              )}

              <Button variant="ghost" onClick={handleLogout} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* ===== Cross-role floating banner (Admin ↔ Gérante) — extracted component ===== */}
      <CrossRoleBanner
        crossRole={effectiveCrossRole}
        role={currentUser?.role}
        onOpenLatest={openCrossRoleLatest}
        onDismiss={dismissCrossRoleBanner}
      />

      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* ==================== CUISINIER VIEW ==================== */}
        {currentUser?.role === 'cuisinier' ? (
          <div className="space-y-4">
            <Card className="bg-gradient-to-br from-green-900/30 to-emerald-900/20 border-green-500/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-green-400 flex items-center gap-2">
                  <Printer className="w-6 h-6" />
                  BONS DE COMMANDE - CUISINE
                  <Badge className="bg-green-500/30 text-green-300 ml-2 text-lg px-3">
                    {invoices.filter(i => i.validation_status === 'pending' && i.items?.some(item => item.department === 'salle_jardin')).length}
                  </Badge>
                </CardTitle>
                <p className="text-slate-400 text-sm">Commandes contenant des plats à préparer</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {invoices.filter(i => i.validation_status === 'pending' && i.items?.some(item => item.department === 'salle_jardin')).length === 0 ? (
                  <p className="text-slate-500 text-center py-8">Aucune commande cuisine en attente</p>
                ) : (
                  invoices.filter(i => i.validation_status === 'pending' && i.items?.some(item => item.department === 'salle_jardin')).map(invoice => {
                    const kitchenItems = invoice.items?.filter(item => item.department === 'salle_jardin') || [];
                    const totalKitchenItems = kitchenItems.reduce((sum, item) => sum + item.quantity, 0);
                    return (
                      <div key={invoice.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-green-900/20 rounded-lg p-4 border border-green-500/30">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white font-bold text-lg">{invoice.invoice_number}</span>
                            {invoice.table_number && (
                              <Badge className="bg-amber-500/30 text-amber-300 text-lg px-3">Table {invoice.table_number}</Badge>
                            )}
                            <Badge className="bg-green-500/20 text-green-400">{totalKitchenItems} plat{totalKitchenItems > 1 ? 's' : ''}</Badge>
                          </div>
                          <div className="mt-2 space-y-1">
                            {kitchenItems.map((item, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-white">
                                <span className="bg-green-600 text-white px-2 py-0.5 rounded font-bold text-sm">{item.quantity}x</span>
                                <span>{item.name}</span>
                              </div>
                            ))}
                          </div>
                          <p className="text-slate-400 text-sm mt-2">
                            Serveur: {invoice.created_by} • {new Date(invoice.created_at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}
                          </p>
                        </div>
                        <Button 
                          onClick={() => printKitchenOrder(invoice)}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <Printer className="w-4 h-4 mr-2" />
                          Imprimer
                        </Button>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        ) : currentUser?.role === 'coach_jeux' ? (
          /* ==================== COACH JEUX VIEW ==================== */
          <div className="space-y-4">
            <Card className="bg-gradient-to-br from-purple-900/30 to-blue-900/20 border-purple-500/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-purple-400 flex items-center gap-2">
                  <Gamepad2 className="w-6 h-6" />
                  BONS DE COMMANDE - JEUX
                  <Badge className="bg-purple-500/30 text-purple-300 ml-2 text-lg px-3">
                    {invoices.filter(i => i.validation_status === 'pending' && i.items?.some(item => item.department === 'jeux')).length}
                  </Badge>
                </CardTitle>
                <p className="text-slate-400 text-sm">Sessions de jeux à préparer</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {invoices.filter(i => i.validation_status === 'pending' && i.items?.some(item => item.department === 'jeux')).length === 0 ? (
                  <p className="text-slate-500 text-center py-8">Aucune session de jeu en attente</p>
                ) : (
                  invoices.filter(i => i.validation_status === 'pending' && i.items?.some(item => item.department === 'jeux')).map(invoice => {
                    const gamesItems = invoice.items?.filter(item => item.department === 'jeux') || [];
                    const totalGamesItems = gamesItems.reduce((sum, item) => sum + item.quantity, 0);
                    return (
                      <div key={invoice.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-purple-900/20 rounded-lg p-4 border border-purple-500/30">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white font-bold text-lg">{invoice.invoice_number}</span>
                            {invoice.table_number && (
                              <Badge className="bg-amber-500/30 text-amber-300 text-lg px-3">Table {invoice.table_number}</Badge>
                            )}
                            <Badge className="bg-purple-500/20 text-purple-400">{totalGamesItems} session{totalGamesItems > 1 ? 's' : ''}</Badge>
                          </div>
                          <div className="mt-2 space-y-1">
                            {gamesItems.map((item, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-white">
                                <span className="bg-purple-600 text-white px-2 py-0.5 rounded font-bold text-sm">{item.quantity}x</span>
                                <span>{item.name}</span>
                              </div>
                            ))}
                          </div>
                          <p className="text-slate-400 text-sm mt-2">
                            Serveur: {invoice.created_by} • {new Date(invoice.created_at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}
                          </p>
                        </div>
                        <Button 
                          onClick={() => printGamesOrder(invoice)}
                          className="bg-purple-600 hover:bg-purple-700 text-white"
                        >
                          <Printer className="w-4 h-4 mr-2" />
                          Imprimer
                        </Button>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
        /* ==================== NORMAL TABS VIEW ==================== */
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Welcome banner Resp. Op. (Gérante) — affiché en haut de toutes les pages (24/05/2026) */}
          {currentUser?.role === 'manager' && (
            <RespOpWelcome
              currentUser={currentUser}
              tables={openTables}
              invoices={invoices}
              effectiveCounts={effectiveCounts}
              isJourneeOpen={dayOpening?.status === 'open'}
              onGoTo={(tab) => setActiveTab(tab)}
            />
          )}
          {/* Closure lock banner (admin only) — affiché si la journée du filtre est clôturée */}
          {currentUser?.role === 'admin' && (
            <ClosureLockBanner
              date={filterDate || undefined}
              onOpenPointCaisse={() => setActiveTab('point_caisse')}
            />
          )}
          <TabsList className="bg-slate-800/50 border border-slate-700 mb-4 flex-wrap h-auto p-1 gap-1 justify-start text-xs sm:text-sm">
            {/* 0. JOURNÉE (Ouverture / Fermeture / Historique) — Admin + Gérante, en PREMIER */}
            {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
              <TabsTrigger value="journee" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white px-2 sm:px-3" data-testid="tab-journee">
                <Sunrise className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">Journée</span>
              </TabsTrigger>
            )}
            {/* 1. TABLES */}
            {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
              <TabsTrigger value="tables" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white px-2 sm:px-3">
                <LayoutGrid className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">Tables</span>
              </TabsTrigger>
            )}
            {/* 2. BONS */}
            <TabsTrigger value="bons" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white px-2 sm:px-3">
              <Printer className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">BONS</span>
              <NotifBadge count={effectiveCounts.invoices} color="orange" testid="badge-bons" />
              {currentUser?.role === 'admin' && (
                <NotifBadge count={(effectiveCounts.cancellation_requests || 0) + (effectiveCounts.modification_requests || 0)} color="red" testid="badge-bons-requests" />
              )}
            </TabsTrigger>
            {/* 3. PRISE DE COMMANDES */}
            {(currentUser?.role === 'server' || currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
              <TabsTrigger value="commande" className="data-[state=active]:bg-amber-500 data-[state=active]:text-white px-2 sm:px-3">
                <Calculator className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">Prise de commandes</span>
              </TabsTrigger>
            )}
            {/* 4. FACTURES */}
            <TabsTrigger value="invoices" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white px-2 sm:px-3">
              <FileText className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">Factures</span>
            </TabsTrigger>
            {/* 4. LOCATIONS */}
            {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
              <TabsTrigger value="locations" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white px-2 sm:px-3">
                <Building2 className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">Locations</span>
              </TabsTrigger>
            )}
            {/* 5. ACHATS — Admin only (24/05/2026) */}
            {currentUser?.role === 'admin' && (
              <TabsTrigger value="achats" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white px-2 sm:px-3">
                <ShoppingCart className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">Achats</span>
                <NotifBadge count={effectiveCounts.expenses} color="purple" testid="badge-achats" />
              </TabsTrigger>
            )}
            {/* 5.1 APPRO MANAGER (Suivi courses + Scan reçus + Transfert vers Achats) — Admin only */}
            {currentUser?.role === 'admin' && (
              <TabsTrigger value="courses" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white px-2 sm:px-3" data-testid="tab-appro-manager">
                <ShoppingCart className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">Appro Manager</span>
              </TabsTrigger>
            )}
            {/* 5.5 LISTE DE BESOINS */}
            {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
              <TabsTrigger value="needs" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white px-2 sm:px-3" data-testid="tab-needs">
                <ClipboardList className="w-4 h-4 mr-2" />Besoins
                {currentUser?.role === 'admin' && (
                  <NotifBadge count={effectiveCounts.needs} color="red" testid="badge-needs" />
                )}
              </TabsTrigger>
            )}
            {/* 5.6 FOURNISSEURS & BC — Admin only (24/05/2026) */}
            {currentUser?.role === 'admin' && (
              <TabsTrigger value="po" className="data-[state=active]:bg-sky-600 data-[state=active]:text-white px-2 sm:px-3" data-testid="tab-po">
                <Truck className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">Fournisseurs</span>
                <NotifBadge count={effectiveCounts.purchase_orders} color="sky" testid="badge-po" />
              </TabsTrigger>
            )}
            {/* 6. PROFORMA */}
            {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
              <TabsTrigger value="proforma" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white px-2 sm:px-3">
                <FileText className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">Proforma</span>
              </TabsTrigger>
            )}
            {/* 7. ACTIVITE & HISTORIQUE */}
            {currentUser?.role !== 'manager' && (
              <TabsTrigger value="activite" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white px-2 sm:px-3">
                <Activity className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">Activite & Historique</span>
              </TabsTrigger>
            )}
            {/* 8. STATISTIQUES & RAPPORT (admin only) */}
            {currentUser?.role === 'admin' && (
              <TabsTrigger value="stats" className="data-[state=active]:bg-green-500 data-[state=active]:text-white px-2 sm:px-3">
                <BarChart3 className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">Statistiques & Rapport</span>
                <NotifBadge count={effectiveCounts.financial_points} color="red" testid="badge-stats" />
              </TabsTrigger>
            )}
            {/* 8.5 POINT DE LA CAISSE (Admin + Gérante) — remplace Analytics */}
            {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
              <TabsTrigger value="point_caisse" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white px-2 sm:px-3" data-testid="tab-point-caisse">
                <Receipt className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">Point de la Caisse</span>
              </TabsTrigger>
            )}
            {/* 8.6 JOURNÉE déplacée tout en haut */}
            {/* 8.7 JOURNAL (ex-Prévisions) (Admin only) */}
            {currentUser?.role === 'admin' && (
              <TabsTrigger value="forecasts" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white px-2 sm:px-3" data-testid="tab-forecasts">
                <BookOpen className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">Journal</span>
              </TabsTrigger>
            )}
            {/* 9. HEBDO */}
            {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
              <TabsTrigger value="hebdo" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white px-2 sm:px-3">
                <BarChart3 className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">Faire le point</span>
              </TabsTrigger>
            )}
            {/* 10. PRODUITS */}
            <TabsTrigger value="products" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white px-2 sm:px-3">
              <Package className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">Produits</span>
            </TabsTrigger>
            {/* 11. CLIENTS */}
            <TabsTrigger value="clients" className="data-[state=active]:bg-pink-500 data-[state=active]:text-white px-2 sm:px-3">
              <Users className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">Clients</span>
            </TabsTrigger>
            {/* 12. ABONNEMENTS */}
            {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
              <TabsTrigger value="subscriptions" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white px-2 sm:px-3">
                <RefreshCw className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">Abonnements</span>
              </TabsTrigger>
            )}
            {/* 13. NOTES */}
            {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
              <TabsTrigger value="instructions" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white px-2 sm:px-3"
                onClick={() => { if (unreadNotesCount > 0) markAllNotesRead(); }}>
                <MessageSquare className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">Notes</span>
                <NotifBadge count={unreadNotesCount || effectiveCounts.notes} color="red" testid="badge-notes" />
              </TabsTrigger>
            )}
            {/* 14. UTILISATEURS */}
            {currentUser?.role === 'admin' && (
              <TabsTrigger value="users" className="data-[state=active]:bg-red-500 data-[state=active]:text-white px-2 sm:px-3">
                <Settings className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">Utilisateurs</span>
              </TabsTrigger>
            )}
            {/* 14.5 AUDIT — Historique des modifications (Admin only) */}
            {currentUser?.role === 'admin' && (
              <TabsTrigger value="audit" className="data-[state=active]:bg-rose-600 data-[state=active]:text-white px-2 sm:px-3" data-testid="tab-audit">
                <ClipboardList className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">Audit</span>
              </TabsTrigger>
            )}
            {/* 14.6 RECOUPEMENT IA — Cuisine & Jeux (Admin only) */}
            {currentUser?.role === 'admin' && (
              <TabsTrigger value="recoupement" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white px-2 sm:px-3" data-testid="tab-recoupement">
                <Sparkles className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">Recoupement IA</span>
              </TabsTrigger>
            )}
            {/* 15. COMPTE COURANT (Admin only) */}
            {currentUser?.role === 'admin' && (
              <TabsTrigger value="current-accounts" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white px-2 sm:px-3" data-testid="tab-current-accounts">
                <Wallet className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">Compte courant</span>
              </TabsTrigger>
            )}
            {/* 15.5 POURBOIRES (tous les rôles) */}
            <TabsTrigger value="tips" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white px-2 sm:px-3" data-testid="tab-tips">
              <Coins className="w-4 h-4 mr-2" />Pourboires
              {currentUser?.role === 'admin' && (
                <NotifBadge count={effectiveCounts.tips_today} color="amber" testid="badge-tips" />
              )}
            </TabsTrigger>
            {/* Server-specific tabs */}
            {currentUser?.role === 'server' && (
              <TabsTrigger value="mon_point" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white px-2 sm:px-3">
                <ClipboardList className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">Mon Point</span>
              </TabsTrigger>
            )}
            {currentUser?.role === 'manager' && (
              <TabsTrigger value="points_serveurs" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white px-2 sm:px-3">
                <ClipboardList className="w-4 h-4 mr-1 sm:mr-2" /><span className="inline text-[11px] sm:text-sm">Points Serveurs</span>
              </TabsTrigger>
            )}
          </TabsList>

          {/* ==================== COMMANDE TAB (Creation only) ==================== */}

          {/* ==================== BONS DE COMMANDE TAB ==================== */}
          <TabsContent value="bons">
            <BonsTab
              currentUser={currentUser}
              invoices={invoices}
              products={products}
              cancellationRequests={cancellationRequests}
              modificationRequests={modificationRequests}
              filterDate={filterDate}
              setFilterDate={setFilterDate}
              approveCancellationRequest={approveCancellationRequest}
              rejectCancellationRequest={rejectCancellationRequest}
              approveModificationRequest={approveModificationRequest}
              rejectModificationRequest={rejectModificationRequest}
              printKitchenOrder={printKitchenOrder}
              printBarOrder={printBarOrder}
              printGamesOrder={printGamesOrder}
              setViewInvoice={setViewInvoice}
              startEditingInvoice={startEditingInvoice}
              requestModification={requestModification}
              requestCancellation={requestCancellation}
              validateInvoice={validateInvoice}
              deleteInvoice={deleteInvoice}
            />
          </TabsContent>

          {/* ==================== INVOICES TAB ==================== */}
          {/* ==================== FACTURES TAB (fusionné avec Commande) ==================== */}

          <TabsContent value="commande">
            <CommandeTab ctx={{
              currentUser,
              cancellationRequests, modificationRequests,
              activeTable, activeTableId,
              activeDepartment, setActiveDepartment,
              currentBill,
              customItem, setCustomItem,
              discount, setDiscount,
              notes, setNotes,
              paymentMethod, setPaymentMethod,
              productSearch, setProductSearch,
              selectedClient, setSelectedClient,
              expenses, expenseAnalyses,
              availableTableNumbers,
              catalog, openTables, clients,
              formatPrice,
              approveCancellationRequest, rejectCancellationRequest,
              approveModificationRequest, rejectModificationRequest,
              printTicket, cancelValidatedInvoice, requestCancellation,
              selectTable, addToBill, addCustomItem, clearBill,
              saveInvoice, updateQuantity, removeItem,
              setShowNewTableModal, setShowFreeAccompModal, setViewInvoice,
              // Additional props needed for CommandeTab
              invoices,
              total,
              subtotal,
              discountAmount,
              totalByDepartment,
              DEPARTMENT_CONFIG,
              PAYMENT_METHODS,
              closeTable,
            }} />
          </TabsContent>

          <TabsContent value="invoices">
            <div className="space-y-4">
              {/* Régularisation rétroactive (Admin + Resp. Op.) */}
              {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
                <div className="flex items-center justify-end">
                  <Button
                    onClick={() => {
                      setRegularizationMode("create");
                      setRegularizationTargetInvoice(null);
                      setShowRegularizationModal(true);
                    }}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm"
                    data-testid="open-regularization-create"
                  >
                    <CalendarClock className="w-4 h-4 mr-1" />
                    Régulariser un bon (date passée)
                  </Button>
                </div>
              )}
              {/* Admin: EN ATTENTE section */}
              {currentUser?.role === 'admin' && (invoices.filter(i => i.validation_status === 'pending').length > 0 || expenses.filter(e => e.status === 'pending' || e.status === 'revision_requested').length > 0) && (
                <Card className="bg-gradient-to-br from-amber-900/20 to-orange-900/10 border-amber-500/40">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-amber-400 flex items-center gap-2">
                      <Clock className="w-6 h-6" /> EN ATTENTE
                      <Badge className="bg-amber-500/30 text-amber-300 ml-2 text-lg px-3">
                        {invoices.filter(i => i.validation_status === 'pending').length + expenses.filter(e => e.status === 'pending' || e.status === 'revision_requested').length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {invoices.filter(i => i.validation_status === 'pending').length > 0 && (
                      <div>
                        <p className="text-orange-400 text-sm font-medium mb-2"><Printer className="w-4 h-4 inline mr-1" />Factures en attente ({invoices.filter(i => i.validation_status === 'pending').length})</p>
                        <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                          {invoices.filter(i => i.validation_status === 'pending').map(inv => (
                            <div key={inv.id} className="flex items-center justify-between bg-orange-900/20 rounded-lg px-3 py-2 border border-orange-500/20">
                              <div className="flex items-center gap-2">
                                <span className="text-white text-sm font-bold">{inv.invoice_number}</span>
                                <span className="text-slate-400 text-xs">par {inv.created_by}</span>
                              </div>
                              <span className="text-orange-400 text-sm font-bold">{formatPrice(inv.total)} F</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {expenses.filter(e => e.status === 'pending' || e.status === 'revision_requested').length > 0 && (
                      <div>
                        <p className="text-yellow-400 text-sm font-medium mb-2"><ShoppingCart className="w-4 h-4 inline mr-1" />Achats en attente ({expenses.filter(e => e.status === 'pending' || e.status === 'revision_requested').length})</p>
                        <div className="space-y-1.5 max-h-[150px] overflow-y-auto">
                          {expenses.filter(e => e.status === 'pending' || e.status === 'revision_requested').map(exp => (
                            <div key={exp.id} className="flex items-center justify-between bg-yellow-900/20 rounded-lg px-3 py-2 border border-yellow-500/20">
                              <span className="text-white text-sm">{exp.description?.slice(0, 40)}</span>
                              <span className="text-yellow-400 text-sm font-bold">{formatPrice(exp.amount)} F</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Filter bar */}
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4 flex-wrap">
                  {/* Date picker — Admin only (la Gérante ne voit que les factures du jour) */}
                  {currentUser?.role === 'admin' && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-slate-400" />
                      <Input
                        type="date"
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                        className="bg-slate-800/50 border-slate-700 text-white w-auto"
                      />
                    </div>
                  )}
                  {currentUser?.role !== 'admin' && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-slate-400" />
                      <Badge className="bg-slate-700 text-slate-300">Aujourd'hui</Badge>
                    </div>
                  )}
                  <Select value={filterValidation} onValueChange={setFilterValidation}>
                    <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="all" className="text-white">Toutes</SelectItem>
                      <SelectItem value="validated" className="text-green-400">Validees</SelectItem>
                      <SelectItem value="cancelled" className="text-red-400">Annulees</SelectItem>
                    </SelectContent>
                  </Select>
                  <Badge className="bg-blue-500/20 text-blue-400">
                    {invoices.filter(i => i.validation_status !== 'pending' && (filterValidation === 'all' || i.validation_status === filterValidation)).length} facture(s)
                  </Badge>
                  {stats && (
                    <Badge className="bg-amber-500/20 text-amber-400">
                      CA: {formatPrice(stats.total_revenue)} F
                    </Badge>
                  )}
                </div>
                {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
                  <Button onClick={() => { setEditingInvoice(null); setActiveTab('bons'); }} className="bg-blue-600 hover:bg-blue-700" data-testid="new-invoice-btn">
                    <Plus className="w-4 h-4 mr-2" />Nouvelle Facture
                  </Button>
                )}
              </div>

              {invoices.filter(i => i.validation_status !== 'pending' && (filterValidation === 'all' || i.validation_status === filterValidation)).length === 0 ? (
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardContent className="py-12 text-center">
                    <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">Aucune facture pour cette date</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {invoices.filter(i => i.validation_status !== 'pending' && (filterValidation === 'all' || i.validation_status === filterValidation)).map((invoice) => (
                    <Card key={invoice.id} className={`bg-slate-800/50 ${invoice.validation_status === 'validated' ? 'border-green-500/30' : invoice.validation_status === 'cancelled' ? 'border-red-500/30' : 'border-yellow-500/30'}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-3 mb-1 flex-wrap">
                              <span className="font-bold text-white">{invoice.invoice_number}</span>
                              <Badge className="bg-amber-500/20 text-amber-400">{formatPrice(invoice.total)} F</Badge>
                              <Badge className={invoice.payment_method === 'cash' ? 'bg-green-500/20 text-green-400' : invoice.payment_method === 'card' ? 'bg-blue-500/20 text-blue-400' : invoice.payment_method === 'mobile' ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-500/20 text-slate-400'}>
                                {PAYMENT_METHODS.find(p => p.value === invoice.payment_method)?.label}
                              </Badge>
                              {invoice.validation_status === 'validated' ? (
                                <Badge className="bg-green-500/20 text-green-400">✓ Validée</Badge>
                              ) : invoice.validation_status === 'cancelled' ? (
                                <Badge className="bg-red-500/20 text-red-400">✗ Annulée</Badge>
                              ) : (
                                <Badge className="bg-yellow-500/20 text-yellow-400">⏳ En attente</Badge>
                              )}
                              {invoice.is_regularized && (
                                <Badge
                                  className="bg-amber-500/30 text-amber-300 border border-amber-500/50"
                                  data-testid={`regul-badge-${invoice.id}`}
                                  title={`Régularisée — ${invoice.regularization_target_date || ''}\nMotif: ${invoice.regularization_reason || ''}`}
                                >
                                  <CalendarClock className="w-3 h-3 mr-1 inline" />
                                  Régularisée
                                </Badge>
                              )}
                            </div>
                            <p className="text-slate-400 text-sm">
                              {invoice.customer_name} • {format(new Date(invoice.created_at), "HH:mm")}
                              {invoice.created_by && ` • Serveur: ${invoice.created_by}`}
                            </p>
                            {invoice.validated_by && (
                              <p className="text-green-400 text-xs mt-1">
                                Validé par: {invoice.validated_by}
                              </p>
                            )}
                            {invoice.validation_status === 'cancelled' && (
                              <div className="mt-2 p-2 bg-red-900/30 rounded border border-red-500/30">
                                <p className="text-red-400 text-xs">
                                  <strong>Annulée par:</strong> {invoice.cancelled_by} le {invoice.cancelled_at ? format(new Date(invoice.cancelled_at), "dd/MM/yyyy HH:mm") : 'N/A'}
                                </p>
                                <p className="text-red-300 text-xs mt-1">
                                  <strong>Motif:</strong> {invoice.cancellation_reason || 'Non spécifié'}
                                </p>
                              </div>
                            )}
                            <div className="flex gap-2 mt-2 flex-wrap">
                              {invoice.totals_by_department?.salle_jardin > 0 && (
                                <Badge className="bg-green-500/20 text-green-400 text-xs">Salle&Jardin: {formatPrice(invoice.totals_by_department.salle_jardin)}</Badge>
                              )}
                              {invoice.totals_by_department?.jeux > 0 && (
                                <Badge className="bg-blue-500/20 text-blue-400 text-xs">Jeux: {formatPrice(invoice.totals_by_department.jeux)}</Badge>
                              )}
                              {invoice.totals_by_department?.bar > 0 && (
                                <Badge className="bg-orange-500/20 text-orange-400 text-xs">Bar: {formatPrice(invoice.totals_by_department.bar)}</Badge>
                              )}
                              {invoice.totals_by_department?.location > 0 && (
                                <Badge className="bg-purple-500/20 text-purple-400 text-xs">Location: {formatPrice(invoice.totals_by_department.location)}</Badge>
                              )}
                              {invoice.totals_by_department?.autres > 0 && (
                                <Badge className="bg-slate-500/20 text-slate-400 text-xs">Autres: {formatPrice(invoice.totals_by_department.autres)}</Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setViewInvoice(invoice)} className="text-slate-400 hover:text-white">
                              <Eye className="w-4 h-4" />
                            </Button>
                            {/* Print button - Manager/Admin only */}
                            {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
                              <Button variant="ghost" size="sm" onClick={() => printTicket(invoice)} className="text-slate-400 hover:text-white" title="Imprimer ticket">
                                <Printer className="w-4 h-4" />
                              </Button>
                            )}
                            {invoice.validation_status !== 'validated' && currentUser?.role === 'admin' && (
                              <Button variant="ghost" size="sm" onClick={() => validateInvoice(invoice.id)} className="text-green-400 hover:text-green-300" title="Valider">
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                            )}
                            {currentUser?.role === 'admin' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setRegularizationMode("update-date");
                                  setRegularizationTargetInvoice(invoice);
                                  setShowRegularizationModal(true);
                                }}
                                className="text-amber-300 hover:text-amber-200"
                                title="Modifier la date du bon (régularisation)"
                                data-testid={`open-regul-update-${invoice.id}`}
                              >
                                <CalendarClock className="w-4 h-4" />
                              </Button>
                            )}
                            {currentUser?.role === 'admin' && (
                              <Button variant="ghost" size="sm" onClick={() => deleteInvoice(invoice.id)} className="text-red-400 hover:text-red-300">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ==================== STATS TAB ==================== */}
          <TabsContent value="stats">
            <StatsTab
              filterMonth={filterMonth}
              setFilterMonth={setFilterMonth}
              monthlyStats={monthlyStats}
              rapportDate={rapportDate}
              setRapportDate={setRapportDate}
              rapportData={rapportData}
              fetchRapportData={fetchRapportData}
              signature={signature}
              setSignature={setSignature}
              generateRapportPDF={generateRapportPDF}
              sendRapportWhatsApp={sendRapportWhatsApp}
              viewServerDetail={viewServerDetail}
            />
          </TabsContent>

          {/* ==================== PRODUCTS TAB ==================== */}
          <TabsContent value="products">
            <ProductsTab
              catalog={catalog}
              departmentConfig={DEPARTMENT_CONFIG}
              canManage={currentUser?.role === 'manager' || currentUser?.role === 'admin'}
              onAddProduct={() => {
                setEditProduct(null);
                setProductForm({ name: "", price: 0, department: "bar", unit: "unité", category: "" });
                setShowProductModal(true);
              }}
              onEditProduct={(product, dept) => {
                setEditProduct(product);
                setProductForm({ ...product, department: dept });
                setShowProductModal(true);
              }}
              onDeleteProduct={deleteProduct}
              onProductsRefresh={refreshCatalog}
              onLinkStock={(product) => {
                setLinkStockTarget(product);
                setShowLinkStockModal(true);
              }}
              onMultiLinkStock={() => setShowMultiLinkModal(true)}
            />
          </TabsContent>

          {/* ==================== CLIENTS TAB ==================== */}
          <TabsContent value="clients">
            <ClientsTab
              clients={clients}
              onAddClient={() => {
                setEditClient(null);
                setClientForm({ name: "", phone: "", email: "", notes: "" });
                setShowClientModal(true);
              }}
              onEditClient={(client) => {
                setEditClient(client);
                setClientForm(client);
                setShowClientModal(true);
              }}
              onDeleteClient={deleteClient}
            />
          </TabsContent>

          {/* ==================== USERS TAB ==================== */}
          {currentUser?.role === 'admin' && (
            <TabsContent value="users">
              <UsersTab
                users={users}
                onAddUser={() => {
                  setEditUser(null);
                  setUserForm({ username: "", email: "", password: "", pin: "", role: "server", full_name: "" });
                  setShowUserModal(true);
                }}
                onEditUser={(user) => {
                  setEditUser(user);
                  setUserForm({ ...user, password: "", pin: user.pin || "" });
                  setShowUserModal(true);
                }}
                onDeleteUser={deleteUser}
              />
            </TabsContent>
          )}

          {/* ==================== AUDIT LOGS TAB (Admin only) ==================== */}
          {currentUser?.role === 'admin' && (
            <TabsContent value="audit">
              <AuditLogsTab currentUser={currentUser} />
            </TabsContent>
          )}

          {/* ==================== RECOUPEMENT IA TAB (ADMIN ONLY) ==================== */}
          {currentUser?.role === 'admin' && (
            <TabsContent value="recoupement">
              <RecoupementPanel currentUser={currentUser} />
            </TabsContent>
          )}

          {/* ==================== HISTORIQUE TAB ==================== */}

          {/* ==================== POINTS DES SERVEURS TAB (MANAGER ONLY) ==================== */}
          {currentUser?.role === 'manager' && (
          <TabsContent value="points_serveurs">
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-xl font-bold text-indigo-300 flex items-center gap-2">
                  <ClipboardList className="w-6 h-6" />
                  Points des Serveurs
                  {selectedReports.length > 0 && (
                    <Badge className="bg-red-500/20 text-red-400 ml-2">
                      {selectedReports.length} sélectionné{selectedReports.length > 1 ? 's' : ''}
                    </Badge>
                  )}
                </h2>
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Select All / Deselect All */}
                  {serviceReports.length > 0 && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={toggleSelectAllReports}
                      className="border-slate-500/50 text-slate-400 hover:bg-slate-500/20"
                    >
                      {selectedReports.length === serviceReports.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                    </Button>
                  )}
                  {/* Bulk Delete Button */}
                  {selectedReports.length > 0 && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => setShowBulkDeleteConfirm(true)}
                      className="border-red-500/50 text-red-400 hover:bg-red-500/20"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Supprimer ({selectedReports.length})
                    </Button>
                  )}
                  {unreadServiceReportsCount > 0 && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={markAllServiceReportsRead}
                      className="border-blue-500/50 text-blue-400 hover:bg-blue-500/20"
                    >
                      Tout marquer lu ({unreadServiceReportsCount})
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={fetchServiceReports}
                    className="border-indigo-500/50 text-indigo-400 hover:bg-indigo-500/20"
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Actualiser
                  </Button>
                </div>
              </div>

              {/* Bulk Delete Confirmation */}
              {showBulkDeleteConfirm && (
                <Card className="bg-red-900/20 border-red-500/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <AlertTriangle className="w-5 h-5 text-red-400" />
                      <span className="text-red-300 font-medium">
                        Supprimer {selectedReports.length} point{selectedReports.length > 1 ? 's' : ''} ?
                      </span>
                    </div>
                    <div className="flex gap-2 items-center">
                      <Input
                        type="password"
                        value={bulkDeleteCode}
                        onChange={(e) => setBulkDeleteCode(e.target.value)}
                        placeholder="Code de suppression (4 chiffres)"
                        className="bg-slate-800 border-slate-600 text-white flex-1 max-w-xs"
                        maxLength={4}
                      />
                      <Button 
                        onClick={handleBulkDeleteReports}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Confirmer
                      </Button>
                      <Button 
                        onClick={() => { setShowBulkDeleteConfirm(false); setBulkDeleteCode(""); }}
                        variant="outline"
                        className="border-slate-500"
                      >
                        Annuler
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Service Reports Grid */}
              {serviceReports.length === 0 ? (
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardContent className="py-12 text-center">
                    <ClipboardList className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">Aucun point de serveur reçu</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {serviceReports.map(report => (
                    <Card 
                      key={report.id}
                      className={`transition-all hover:scale-[1.02] ${
                        selectedReports.includes(report.id)
                          ? 'bg-red-900/20 border-red-500/50'
                          : report.is_read 
                            ? 'bg-slate-800/50 border-slate-700 hover:border-slate-600' 
                            : 'bg-indigo-900/30 border-indigo-500/50 hover:border-indigo-400'
                      }`}
                    >
                      <CardContent className="p-4">
                        {/* Selection Checkbox + Header */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {/* Checkbox */}
                            <div 
                              onClick={(e) => { e.stopPropagation(); toggleReportSelection(report.id); }}
                              className={`w-5 h-5 rounded border-2 cursor-pointer flex items-center justify-center transition-all ${
                                selectedReports.includes(report.id)
                                  ? 'bg-red-500 border-red-500'
                                  : 'border-slate-500 hover:border-slate-400'
                              }`}
                            >
                              {selectedReports.includes(report.id) && (
                                <CheckCircle className="w-4 h-4 text-white" />
                              )}
                            </div>
                            {!report.is_read && (
                              <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></div>
                            )}
                            <p className="text-white font-semibold flex items-center gap-2">
                              <User className="w-4 h-4 text-indigo-400" />
                              {report.server_name}
                            </p>
                          </div>
                          <Badge className={`text-xs ${
                            report.status === 'validated' ? 'bg-green-500/20 text-green-400' :
                            report.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                            report.status === 'revision_requested' ? 'bg-orange-500/20 text-orange-400' :
                            'bg-slate-500/20 text-slate-400'
                          }`}>
                            {report.status === 'validated' ? 'Validé' :
                             report.status === 'rejected' ? 'Rejeté' :
                             report.status === 'revision_requested' ? 'À réviser' :
                             'En attente'}
                          </Badge>
                        </div>
                        
                        {/* Clickable content area */}
                        <div 
                          onClick={() => openServerReportDetail(report)}
                          className="cursor-pointer"
                        >
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            <div className="bg-slate-700/50 rounded p-2 text-center">
                              <p className="text-indigo-400 font-bold text-lg">{report.total_invoices}</p>
                              <p className="text-slate-500 text-xs">Commandes</p>
                            </div>
                            <div className="bg-slate-700/50 rounded p-2 text-center">
                              <p className="text-green-400 font-bold text-lg">{report.validated_invoices}</p>
                              <p className="text-slate-500 text-xs">Validées</p>
                            </div>
                            <div className="bg-slate-700/50 rounded p-2 text-center">
                              <p className="text-amber-400 font-bold text-lg">{formatPrice(report.total_sales)}</p>
                              <p className="text-slate-500 text-xs">CA (F)</p>
                            </div>
                          </div>

                          {report.observation && (
                            <div className="p-2 bg-slate-700/30 rounded text-xs mb-2">
                              <p className="text-slate-400 font-medium mb-1">Observation:</p>
                              <p className="text-slate-300 italic line-clamp-2">"{report.observation}"</p>
                            </div>
                          )}
                          
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(report.created_at).toLocaleString('fr-FR', {
                                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                              })}
                            </span>
                            <span className="text-indigo-400 flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              Voir détails
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
          )}

          {/* ==================== SERVER DAILY REPORT TAB ==================== */}
          {currentUser?.role === 'server' && (
          <TabsContent value="mon_point">
            <div className="space-y-4">
              {/* Header with date selector */}
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-xl font-bold text-indigo-300 flex items-center gap-2">
                  <ClipboardList className="w-6 h-6" />
                  Mon Point Journalier
                </h2>
                <div className="flex items-center gap-3">
                  <Input
                    type="date"
                    value={serverReportDate}
                    onChange={(e) => setServerReportDate(e.target.value)}
                    className="bg-slate-800/50 border-slate-700 text-white w-auto"
                  />
                  <Button 
                    onClick={() => fetchServerDailyReport(currentUser?.full_name || currentUser?.username, serverReportDate)}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Actualiser
                  </Button>
                </div>
              </div>

              {serverDailyReport ? (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card className="bg-gradient-to-br from-indigo-900/30 to-purple-900/20 border-indigo-500/50">
                      <CardContent className="p-4 text-center">
                        <Receipt className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
                        <p className="text-3xl font-bold text-indigo-400">{serverDailyReport.total_invoices}</p>
                        <p className="text-slate-400 text-sm">Commandes créées</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-green-900/30 to-emerald-900/20 border-green-500/50">
                      <CardContent className="p-4 text-center">
                        <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                        <p className="text-3xl font-bold text-green-400">{serverDailyReport.validated_count}</p>
                        <p className="text-slate-400 text-sm">Factures validées</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-amber-900/30 to-orange-900/20 border-amber-500/50">
                      <CardContent className="p-4 text-center">
                        <Clock className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                        <p className="text-3xl font-bold text-amber-400">{serverDailyReport.pending_count}</p>
                        <p className="text-slate-400 text-sm">En attente</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-emerald-900/30 to-teal-900/20 border-emerald-500/50">
                      <CardContent className="p-4 text-center">
                        <DollarSign className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                        <p className="text-3xl font-bold text-emerald-400">{formatPrice(serverDailyReport.total_sales)} F</p>
                        <p className="text-slate-400 text-sm">Total validé</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Breakdown by Department */}
                  {serverDailyReport.department_breakdown && Object.keys(serverDailyReport.department_breakdown).length > 0 && (
                    <Card className="bg-slate-800/50 border-slate-700">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-slate-300 flex items-center gap-2">
                          <BarChart3 className="w-5 h-5" />
                          Répartition par Département
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {Object.entries(serverDailyReport.department_breakdown).map(([dept, data]) => {
                            const deptConfig = DEPARTMENT_CONFIG[dept];
                            return (
                              <div key={dept} className={`p-3 rounded-lg ${deptConfig?.bgColor || 'bg-slate-700/30'} border ${deptConfig?.borderColor || 'border-slate-600'}`}>
                                <p className={`font-medium ${deptConfig?.color || 'text-slate-300'}`}>{deptConfig?.label || dept}</p>
                                <p className="text-white text-lg font-bold">{formatPrice(data.total)} F</p>
                                <p className="text-slate-400 text-xs">{data.count} article(s)</p>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Breakdown by Payment Method */}
                  {serverDailyReport.payment_methods && Object.keys(serverDailyReport.payment_methods).length > 0 && (
                    <Card className="bg-slate-800/50 border-slate-700">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-slate-300 flex items-center gap-2">
                          <Wallet className="w-5 h-5" />
                          Modes de Paiement
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {Object.entries(serverDailyReport.payment_methods).map(([method, data]) => (
                            <div key={method} className="p-3 rounded-lg bg-slate-700/30 border border-slate-600">
                              <p className="text-slate-300 font-medium capitalize">
                                {method === 'cash' ? '💵 Espèces' : 
                                 method === 'card' ? '💳 Carte' : 
                                 method === 'mobile_money' ? '📱 Mobile Money' : 
                                 method === 'cheque' ? '📝 Chèque' : method}
                              </p>
                              <p className="text-white text-lg font-bold">{formatPrice(data.total)} F</p>
                              <p className="text-slate-400 text-xs">{data.count} transaction(s)</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Invoice List */}
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-slate-300 flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        Mes Factures du Jour
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {serverDailyReport.invoices?.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">Aucune facture pour cette date</p>
                      ) : (
                        <div className="space-y-2">
                          {serverDailyReport.invoices?.map((invoice) => (
                            <div key={invoice.id} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                              <div className="flex items-center gap-3">
                                <span className="text-white font-medium">{invoice.invoice_number}</span>
                                <Badge className={
                                  invoice.validation_status === 'validated' ? 'bg-green-500/20 text-green-400' :
                                  invoice.validation_status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                                  'bg-slate-500/20 text-slate-400'
                                }>
                                  {invoice.validation_status === 'validated' ? '✓ Validée' : 
                                   invoice.validation_status === 'pending' ? '⏳ En attente' : invoice.validation_status}
                                </Badge>
                                {invoice.table_number && (
                                  <Badge className="bg-slate-600/50 text-slate-300">Table {invoice.table_number}</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-amber-400 font-bold">{formatPrice(invoice.total)} F</span>
                                <span className="text-slate-500 text-sm">
                                  {new Date(invoice.created_at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Card className="bg-slate-800/30 border-slate-700">
                  <CardContent className="py-12 text-center">
                    <ClipboardList className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-500">Chargement de votre point journalier...</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
          )}

          {/* ==================== TABLES TAB (Manager/Admin) ==================== */}
          {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
          <TabsContent value="tables">
            <TablesTab 
              tablesStatus={tablesStatus}
              fetchTablesStatus={fetchTablesStatus}
              stopTableService={stopTableService}
              formatPrice={formatPrice}
              openTables={openTables}
              currentUser={currentUser}
              onPrintClientReceipt={printClientReceiptAndCreateInvoice}
              onTakeOrder={(tableNumber) => {
                // Navigate to commande tab
                setActiveTab("commande");
                // If a specific table number is provided, we could select it
                // For now, just switch to the commande tab
              }}
            />
          </TabsContent>
          )}

          {/* ==================== ACHATS/DÉPENSES TAB (Admin only) ==================== */}
          {currentUser?.role === 'admin' && (
          <TabsContent value="achats">
            <AchatsTab ctx={{
              currentUser,
              expenses,
              shoppingList,
              achatsSubView, setAchatsSubView,
              showAllExpenses, setShowAllExpenses,
              expenseRatioAlert,
              expenseAnalyses,
              formatPrice,
              setShowExpenseModal,
              setShowShoppingListModal,
              setExpenseToAssign,
              setShowWeekAssignModal,
              printExpensesTicket,
              printAllExpensesList,
              printAllApprovedExpenses,
              printApprovedExpensesDetailed,
              printCompletedExpensesTicket,
              printAllCompletedExpenses,
              printSingleExpenseTicket,
              printExpensePDF,
              openExpenseForEdit,
              deleteExpense,
              updateExpense,
              openReviseModal,
              convertExpenseToPO,
              availableAccounts,
              allocateExpenseToAccount,
              fetchExpenses,
              receiveExpenseStock,
            }} />
          </TabsContent>
          )}

          {/* ==================== POINT HEBDOMADAIRE TAB ==================== */}
          {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
          <TabsContent value="hebdo">
            <Tabs value={hebdoSubTab} onValueChange={setHebdoSubTab} className="w-full">
              <TabsList className="bg-slate-800/50 border border-slate-700 mb-4 flex-wrap h-auto">
                <TabsTrigger value="point-hebdo" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white px-2 sm:px-3">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Faire le point
                </TabsTrigger>
                <TabsTrigger value="reversement" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white px-2 sm:px-3" data-testid="tab-reversement">
                  <Coins className="w-4 h-4 mr-2" />
                  Reversement
                </TabsTrigger>
                {currentUser?.role === 'admin' && (
                  <TabsTrigger value="point-history" className="data-[state=active]:bg-slate-600 data-[state=active]:text-white px-2 sm:px-3" data-testid="tab-point-history">
                    <History className="w-4 h-4 mr-2" />
                    Historique
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="point-hebdo">
                <DayClosureGuard currentUser={currentUser}>
                  <HebdoReport 
                    weeklyReport={weeklyReport}
                    weekStartDate={weekStartDate}
                    setWeekStartDate={setWeekStartDate}
                    weekEndDate={weekEndDate}
                    setWeekEndDate={setWeekEndDate}
                    generateWeeklyPDF={generateWeeklyPDF}
                    sendWeeklyWhatsApp={sendWeeklyWhatsApp}
                    formatPrice={formatPrice}
                    API={API}
                    refreshWeekly={fetchWeeklyReport}
                    isAdmin={currentUser?.role === 'admin'}
                    currentUser={currentUser}
                    onGoToReversement={() => { setHebdoSubTab("reversement"); setReversementSubTab("bar"); }}
                  />
                </DayClosureGuard>
              </TabsContent>

              {/* Sous-menu unique "Reversement" — billettage global + 4 catégories côte à côte */}
              <TabsContent value="reversement">
                <div className="space-y-4">
                  {/* Billettage GLOBAL — unique pour les 4 reversements */}
                  <div className="flex items-center justify-end gap-2 mb-1">
                    <Label className="text-xs text-slate-400">Date du billettage&nbsp;:</Label>
                    {currentUser?.role === 'admin' ? (
                      <Input
                        type="date"
                        value={billettageDate}
                        onChange={(e) => setBillettageDate(e.target.value)}
                        className="bg-slate-800 border-slate-700 text-white h-8 w-[160px]"
                        data-testid="billettage-date-picker"
                      />
                    ) : (
                      <Badge className="bg-slate-700 text-slate-300 h-8 px-3 flex items-center">Aujourd'hui</Badge>
                    )}
                  </div>
                  <BillettageGlobalCard date={billettageDate} currentUser={currentUser} />

                  {/* 4 sous-onglets reversement */}
                  <Tabs value={reversementSubTab} onValueChange={setReversementSubTab} className="w-full">
                    <TabsList className="bg-slate-900/60 border border-slate-700 mb-4 flex-wrap h-auto" data-testid="reversement-subtabs">
                      <TabsTrigger value="bar" className="data-[state=active]:bg-orange-600 data-[state=active]:text-white px-2 sm:px-3" data-testid="rev-subtab-bar">
                        <Wine className="w-4 h-4 mr-1" />
                        Bar
                      </TabsTrigger>
                      <TabsTrigger value="menu_combos" className="data-[state=active]:bg-green-600 data-[state=active]:text-white px-2 sm:px-3" data-testid="rev-subtab-menu">
                        <UtensilsCrossed className="w-4 h-4 mr-1" />
                        Menu &amp; Combos
                      </TabsTrigger>
                      <TabsTrigger value="jeux" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white px-2 sm:px-3" data-testid="rev-subtab-jeux">
                        <Gamepad2 className="w-4 h-4 mr-1" />
                        Jeux
                      </TabsTrigger>
                      <TabsTrigger value="locations" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white px-2 sm:px-3" data-testid="rev-subtab-locations">
                        <Building2 className="w-4 h-4 mr-1" />
                        Locations
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="bar">
                      <PointFinancierTab currentUser={currentUser} fixedCategory="bar" onGotoHebdo={() => setHebdoSubTab("point-hebdo")} hideBillettage={true} />
                    </TabsContent>
                    <TabsContent value="menu_combos">
                      <PointFinancierTab currentUser={currentUser} fixedCategory="menu_combos" onGotoHebdo={() => setHebdoSubTab("point-hebdo")} hideBillettage={true} />
                    </TabsContent>
                    <TabsContent value="jeux">
                      <PointFinancierTab currentUser={currentUser} fixedCategory="jeux" onGotoHebdo={() => setHebdoSubTab("point-hebdo")} hideBillettage={true} />
                    </TabsContent>
                    <TabsContent value="locations">
                      <PointFinancierTab currentUser={currentUser} fixedCategory="locations" onGotoHebdo={() => setHebdoSubTab("point-hebdo")} hideBillettage={true} />
                    </TabsContent>
                  </Tabs>
                </div>
              </TabsContent>

              {currentUser?.role === 'admin' && (
              <TabsContent value="point-history">
                <PointsHistoryTab currentUser={currentUser} />
              </TabsContent>
              )}
            </Tabs>
          </TabsContent>
          )}

          {/* ==================== LOCATIONS TAB (Manager/Admin) ==================== */}
          {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
          <TabsContent value="locations">
            <LocationsTab 
              currentUser={currentUser}
              formatPrice={formatPrice}
            />
          </TabsContent>
          )}

          {/* ==================== PROFORMA TAB (Manager/Admin) ==================== */}
          {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
          <TabsContent value="proforma">
            <ProformaTab 
              currentUser={currentUser}
              formatPrice={formatPrice}
              catalog={catalog}
            />
          </TabsContent>
          )}

          {/* ==================== INSTRUCTIONS TAB (Manager/Admin) ==================== */}
          {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
          <TabsContent value="instructions">
            <InstructionsTab 
              currentUser={currentUser}
              formatPrice={formatPrice}
              onNotesRead={() => setUnreadNotesCount(0)}
            />
          </TabsContent>
          )}

          {/* ==================== ABONNEMENTS TAB (Manager & Admin) ==================== */}
          {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
          <TabsContent value="subscriptions">
            <SubscriptionsTab currentUser={currentUser} />
          </TabsContent>
          )}

          {/* ==================== ACTIVITE & HISTORIQUE TAB ==================== */}
          <TabsContent value="activite">
            <ActiviteTab
              invoices={invoices}
              expenses={expenses}
              historyInvoices={historyInvoices}
              historyDate={historyDate}
              setHistoryDate={setHistoryDate}
            />
          </TabsContent>

          {/* ==================== POINT DE LA CAISSE TAB (Admin + Gérante) — remplace Analytics ==================== */}
          {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
          <TabsContent value="point_caisse">
            <PointCaisseTab currentUser={currentUser} />
          </TabsContent>
          )}

          {/* ==================== JOURNÉE TAB (Ouverture / Fermeture / Historique) ==================== */}
          {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
          <TabsContent value="journee">
            <JourneeTab currentUser={currentUser} />
          </TabsContent>
          )}

          {/* ==================== APPRO MANAGER TAB (Admin only) ==================== */}
          {currentUser?.role === 'admin' && (
          <TabsContent value="courses">
            <CoursesTab currentUser={currentUser} />
          </TabsContent>
          )}

          {/* ==================== PREVISIONS TAB (Admin only) ==================== */}
          {currentUser?.role === 'admin' && (
          <TabsContent value="forecasts">
            <JournalTab />
          </TabsContent>
          )}

          {/* ==================== LISTE DE BESOINS (Manager & Admin) ==================== */}
          {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
          <TabsContent value="needs">
            <NeedsTab currentUser={currentUser} />
          </TabsContent>
          )}

          {/* ==================== FOURNISSEURS & BONS DE COMMANDE (Admin only) ==================== */}
          {currentUser?.role === 'admin' && (
          <TabsContent value="po">
            <PurchaseOrdersTab currentUser={currentUser} />
          </TabsContent>
          )}

          {/* ==================== COMPTE COURANT (Admin only) ==================== */}
          {currentUser?.role === 'admin' && (
          <TabsContent value="current-accounts">
            <CurrentAccountsTab />
          </TabsContent>
          )}

          {/* ==================== POURBOIRES (Admin + Manager + Server) ==================== */}
          <TabsContent value="tips">
            <TipsTab currentUser={currentUser} />
          </TabsContent>
        </Tabs>
        )}
      </div>

      {/* ==================== MODALS ==================== */}

      {/* Payment Method Selection Modal for Bon-Client validation */}
      <Dialog open={showPaymentMethodModal} onOpenChange={(open) => {
        if (!open) {
          setShowPaymentMethodModal(false);
          setPendingValidationInvoice(null);
        }
      }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <CreditCard className="w-5 h-5" />
              Transformer en Bon-Client
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Sélectionnez le mode de paiement pour la facture {pendingValidationInvoice?.invoice_number}
            </DialogDescription>
          </DialogHeader>
          
          {pendingValidationInvoice && (
            <div className="space-y-4">
              {/* Invoice Summary */}
              <div className="bg-slate-900/50 rounded-lg p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Client:</span>
                  <span className="text-white">{pendingValidationInvoice.customer_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Serveur:</span>
                  <span className="text-white">{pendingValidationInvoice.created_by}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Articles:</span>
                  <span className="text-white">{pendingValidationInvoice.items?.length || 0}</span>
                </div>
                <div className="flex justify-between font-bold text-lg border-t border-slate-700 pt-2 mt-2">
                  <span className="text-slate-300">Total:</span>
                  <span className="text-green-400">{formatPrice(pendingValidationInvoice.total)} F</span>
                </div>
              </div>

              {/* Invoice Date Selection */}
              <div className="space-y-2">
                <Label className="text-slate-300 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Date de facturation
                </Label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="bg-slate-900 border-slate-600 text-white"
                />
              </div>
              
              {/* Payment Method Selection */}
              <div className="space-y-3">
                <Label className="text-slate-300">Mode de paiement</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant={selectedPaymentMethod === 'cash' ? 'default' : 'outline'}
                    onClick={() => setSelectedPaymentMethod('cash')}
                    className={`flex flex-col items-center py-4 h-auto ${
                      selectedPaymentMethod === 'cash' 
                        ? 'bg-green-600 hover:bg-green-700 border-green-500' 
                        : 'border-slate-600 hover:bg-slate-700'
                    }`}
                  >
                    <Banknote className="w-6 h-6 mb-1" />
                    <span className="text-xs">Espèces</span>
                  </Button>
                  <Button
                    type="button"
                    variant={selectedPaymentMethod === 'mobile' ? 'default' : 'outline'}
                    onClick={() => setSelectedPaymentMethod('mobile')}
                    className={`flex flex-col items-center py-4 h-auto ${
                      selectedPaymentMethod === 'mobile' 
                        ? 'bg-orange-600 hover:bg-orange-700 border-orange-500' 
                        : 'border-slate-600 hover:bg-slate-700'
                    }`}
                  >
                    <Smartphone className="w-6 h-6 mb-1" />
                    <span className="text-xs">Mobile Money</span>
                  </Button>
                  <Button
                    type="button"
                    variant={selectedPaymentMethod === 'card' ? 'default' : 'outline'}
                    onClick={() => setSelectedPaymentMethod('card')}
                    className={`flex flex-col items-center py-4 h-auto ${
                      selectedPaymentMethod === 'card' 
                        ? 'bg-blue-600 hover:bg-blue-700 border-blue-500' 
                        : 'border-slate-600 hover:bg-slate-700'
                    }`}
                  >
                    <CreditCard className="w-6 h-6 mb-1" />
                    <span className="text-xs">Carte</span>
                  </Button>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowPaymentMethodModal(false);
                    setPendingValidationInvoice(null);
                  }}
                  className="flex-1 border-slate-600"
                >
                  Annuler
                </Button>
                <Button
                  onClick={confirmValidateInvoice}
                  className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Valider
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* View Invoice Modal */}
      <Dialog open={!!viewInvoice} onOpenChange={() => setViewInvoice(null)}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Facture {viewInvoice?.invoice_number}</DialogTitle>
          </DialogHeader>
          {viewInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-400">Client:</span> {viewInvoice.customer_name}</div>
                <div><span className="text-slate-400">Date:</span> {format(new Date(viewInvoice.created_at), "dd/MM/yyyy HH:mm")}</div>
                <div><span className="text-slate-400">Serveur:</span> {viewInvoice.created_by || '-'}</div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Statut:</span>
                  {viewInvoice.validation_status === 'validated' ? (
                    <Badge className="bg-green-500/20 text-green-400">✓ Validée par {viewInvoice.validated_by}</Badge>
                  ) : (
                    <Badge className="bg-yellow-500/20 text-yellow-400">⏳ En attente de validation</Badge>
                  )}
                </div>
              </div>
              <div className="border-t border-slate-700 pt-4">
                {viewInvoice.items?.map((item, idx) => (
                  <div key={idx} className="flex justify-between py-1 text-sm">
                    <span>{item.name} x{item.quantity}</span>
                    <span className="text-amber-400">{formatPrice(item.price * item.quantity)} F</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-700 pt-4 space-y-1">
                <div className="flex justify-between"><span className="text-slate-400">Sous-total</span><span>{formatPrice(viewInvoice.subtotal)} F</span></div>
                {viewInvoice.discount > 0 && <div className="flex justify-between"><span className="text-slate-400">Remise ({viewInvoice.discount}%)</span><span className="text-green-400">-{formatPrice(viewInvoice.discount_amount)} F</span></div>}
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-slate-700"><span>TOTAL</span><span className="text-amber-500">{formatPrice(viewInvoice.total)} FCFA</span></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {/* Print/Download buttons - Manager/Admin only */}
                {(currentUser?.role === 'manager' || currentUser?.role === 'admin') ? (
                  <>
                    <Button onClick={() => printTicket(viewInvoice)} variant="outline" className="border-amber-500 text-amber-500 hover:bg-amber-500/10">
                      <Printer className="w-4 h-4 mr-2" />
                      Ticket 80mm
                    </Button>
                    <Button onClick={() => downloadPDF(viewInvoice)} className="bg-amber-500 hover:bg-amber-600">
                      <Download className="w-4 h-4 mr-2" />
                      PDF A4
                    </Button>
                  </>
                ) : (
                  <div className="col-span-2 text-center py-2">
                    <p className="text-slate-500 text-sm">Contactez la gérante pour imprimer</p>
                  </div>
                )}
              </div>
              {viewInvoice.validation_status !== 'validated' && currentUser?.role === 'admin' && (
                <Button onClick={() => { validateInvoice(viewInvoice.id); setViewInvoice(null); }} className="w-full bg-green-600 hover:bg-green-700">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Valider ce facture
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Product Modal */}
      <Dialog open={showProductModal} onOpenChange={setShowProductModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>{editProduct ? "Modifier le produit" : "Ajouter un produit"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom</Label>
              <Input
                value={productForm.name}
                onChange={(e) => {
                  const v = e.target.value;
                  setProductForm({ ...productForm, name: v });
                  // Fetch stock suggestions on the fly (debounced via short timeout)
                  if (!editProduct && v && v.trim().length >= 2 && !productForm.stock_product_id) {
                    if (window._stockSuggestTimer) clearTimeout(window._stockSuggestTimer);
                    window._stockSuggestTimer = setTimeout(async () => {
                      try {
                        const r = await axios.get(`${API}/caisse/products/stock-suggestions`, {
                          params: { name: v, limit: 5 }
                        });
                        setStockSuggestions(r.data?.suggestions || []);
                      } catch (err) {
                        setStockSuggestions([]);
                      }
                    }, 250);
                  } else {
                    setStockSuggestions([]);
                  }
                }}
                onBlur={() => setTimeout(() => setStockSuggestions([]), 200)}
                className="bg-slate-700 border-slate-600"
                data-testid="product-name-input"
              />
              {!editProduct && stockSuggestions.length > 0 && !productForm.stock_product_id && (
                <div className="bg-slate-900/80 border border-emerald-500/30 rounded p-2 space-y-1" data-testid="stock-suggestions-panel">
                  <div className="text-[11px] text-emerald-300 font-semibold">
                    💡 Lier ce produit à un produit Stock existant ?
                  </div>
                  {stockSuggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setProductForm({ ...productForm, stock_product_id: s.id, stock_product_name: s.name });
                        setStockSuggestions([]);
                        toast.success(`Produit lié à : ${s.name}`);
                      }}
                      className="w-full text-left px-2 py-1 rounded bg-slate-800 hover:bg-emerald-900/40 text-xs text-white flex justify-between items-center"
                      data-testid={`suggest-stock-${s.id}`}
                    >
                      <span>📦 {s.name} <span className="text-slate-400">({s.unit}, qté {s.quantity})</span></span>
                      <span className="text-emerald-400">{Math.round(s.score * 100)}%</span>
                    </button>
                  ))}
                </div>
              )}
              {productForm.stock_product_id && (
                <div className="text-xs text-emerald-300 flex items-center gap-2">
                  🔗 Lié au stock : {productForm.stock_product_name || productForm.stock_product_id}
                  <button
                    type="button"
                    onClick={() => setProductForm({ ...productForm, stock_product_id: null, stock_product_name: null })}
                    className="text-rose-400 hover:underline text-[11px]"
                  >
                    (délier)
                  </button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prix (FCFA)</Label>
                <Input type="number" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: parseFloat(e.target.value) || 0 })} className="bg-slate-700 border-slate-600" />
              </div>
              <div className="space-y-2">
                <Label>Unité</Label>
                <Input value={productForm.unit} onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })} className="bg-slate-700 border-slate-600" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Categorie (carte menu)</Label>
              <Select value={productForm.category || "none"} onValueChange={(v) => setProductForm({ ...productForm, category: v === "none" ? "" : v })}>
                <SelectTrigger className="bg-slate-700 border-slate-600"><SelectValue placeholder="Selectionner une categorie" /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="none">-- Aucune --</SelectItem>
                  <SelectItem value="Plats">Plats</SelectItem>
                  <SelectItem value="Entrees">Entrees</SelectItem>
                  <SelectItem value="Grillades">Grillades</SelectItem>
                  <SelectItem value="Sauces">Sauces</SelectItem>
                  <SelectItem value="Accompagnements">Accompagnements</SelectItem>
                  <SelectItem value="Boissons">Boissons</SelectItem>
                  <SelectItem value="Cocktails">Cocktails</SelectItem>
                  <SelectItem value="Desserts">Desserts</SelectItem>
                  <SelectItem value="Petit-dejeuner">Petit-dejeuner</SelectItem>
                  <SelectItem value="Snacks">Snacks</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={saveProduct} className="w-full bg-purple-500 hover:bg-purple-600">Enregistrer</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Link Stock Modal */}
      <LinkStockModal
        open={showLinkStockModal}
        onClose={() => { setShowLinkStockModal(false); setLinkStockTarget(null); }}
        caisseProduct={linkStockTarget}
        onLinked={async () => {
          try {
            const res = await axios.get(`${API}/caisse/products`);
            const grouped = { bar: [], jardin: [], jeux: [] };
            (res.data || []).forEach(p => { if (grouped[p.department]) grouped[p.department].push(p); });
            setCatalog(grouped);
          } catch (e) { /* silent */ }
        }}
      />

      {/* Multi-Link Stock Modal (lier plusieurs produits caisse au même produit stock) */}
      <MultiLinkStockModal
        open={showMultiLinkModal}
        onClose={() => setShowMultiLinkModal(false)}
        caisseProducts={Object.values(catalog || {}).flat().filter(Boolean)}
        onDone={async () => {
          try {
            const res = await axios.get(`${API}/caisse/products`);
            const grouped = { bar: [], jardin: [], jeux: [] };
            (res.data || []).forEach(p => { if (grouped[p.department]) grouped[p.department].push(p); });
            setCatalog(grouped);
          } catch (e) { /* silent */ }
        }}
      />

      {/* Client Modal */}
      <Dialog open={showClientModal} onOpenChange={setShowClientModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>{editClient ? "Modifier le client" : "Ajouter un client"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom *</Label>
              <Input value={clientForm.name} onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })} className="bg-slate-700 border-slate-600" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input value={clientForm.phone} onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })} className="bg-slate-700 border-slate-600" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={clientForm.email} onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })} className="bg-slate-700 border-slate-600" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={clientForm.notes} onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })} className="bg-slate-700 border-slate-600" />
            </div>
            <Button onClick={saveClient} className="w-full bg-pink-500 hover:bg-pink-600">Enregistrer</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* User Modal */}
      <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>{editUser ? "Modifier l'utilisateur" : "Ajouter un utilisateur"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom complet</Label>
              <Input value={userForm.full_name} onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })} className="bg-slate-700 border-slate-600" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nom d'utilisateur *</Label>
                <Input value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} className="bg-slate-700 border-slate-600" />
              </div>
              <div className="space-y-2">
                <Label>Code PIN (4-6 chiffres) *</Label>
                <Input 
                  type="text" 
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={userForm.pin} 
                  onChange={(e) => setUserForm({ ...userForm, pin: e.target.value.replace(/\D/g, '') })} 
                  className="bg-slate-700 border-slate-600 font-mono tracking-widest" 
                  placeholder="Ex: 1234"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email (optionnel)</Label>
                <Input value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} className="bg-slate-700 border-slate-600" />
              </div>
              <div className="space-y-2">
                <Label>Rôle</Label>
                <Select value={userForm.role} onValueChange={(v) => setUserForm({ ...userForm, role: v })}>
                  <SelectTrigger className="bg-slate-700 border-slate-600"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="server">Serveur</SelectItem>
                    <SelectItem value="cuisinier">Cuisinier</SelectItem>
                    <SelectItem value="coach_jeux">Coach Jeux</SelectItem>
                    <SelectItem value="manager">Responsable des Opérations & Logistique</SelectItem>
                    <SelectItem value="admin">Administrateur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={saveUser} className="w-full bg-red-500 hover:bg-red-600">Enregistrer</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile Payment Options Modal */}
      <Dialog open={showMobilePaymentModal} onOpenChange={setShowMobilePaymentModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-amber-500 text-xl">Paiement Mobile Money</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="text-center mb-4">
              <p className="text-slate-400">Montant à payer</p>
              <p className="text-3xl font-bold text-amber-500">{formatPrice(pendingInvoiceData?.total || 0)} FCFA</p>
            </div>
            
            <div className="space-y-3">
              {/* Kkiapay Option */}
              <Button 
                onClick={handleKkiapayPayment}
                className="w-full h-16 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white"
              >
                <div className="flex items-center justify-center gap-3">
                  <Smartphone className="w-6 h-6" />
                  <div className="text-left">
                    <p className="font-bold">Payer avec Kkiapay</p>
                    <p className="text-xs opacity-80">MTN, Moov, Wave, Carte</p>
                  </div>
                </div>
              </Button>

              {/* Wallet Option */}
              <Button 
                onClick={handleWalletPayment}
                disabled={!selectedClient?.phone}
                className="w-full h-16 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white disabled:opacity-50"
              >
                <div className="flex items-center justify-center gap-3">
                  <Wallet className="w-6 h-6" />
                  <div className="text-left">
                    <p className="font-bold">Porte-monnaie Client</p>
                    <p className="text-xs opacity-80">
                      {selectedClient?.phone ? `Client: ${selectedClient.name}` : "Sélectionnez un client"}
                    </p>
                  </div>
                </div>
              </Button>

              {/* Pay Later Option */}
              <Button 
                onClick={handlePayLater}
                variant="outline"
                className="w-full h-12 border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                <Clock className="w-4 h-4 mr-2" />
                Paiement différé (créer la facture)
              </Button>
            </div>

            <Button 
              onClick={() => setShowMobilePaymentModal(false)}
              variant="ghost"
              className="w-full text-slate-400 hover:text-white"
            >
              Annuler
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Table Modal */}
      <Dialog open={showNewTableModal} onOpenChange={setShowNewTableModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-amber-500 flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Ouvrir une Nouvelle Table
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-slate-400 text-sm mb-4">
              Sélectionnez un numéro de table (1-20) :
            </p>
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: 20 }, (_, i) => i + 1).map(num => {
                const isAvailable = availableTableNumbers.includes(num);
                const isUsed = !isAvailable;
                return (
                  <Button
                    key={num}
                    variant={isUsed ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => isAvailable && createNewTable(num)}
                    disabled={isUsed}
                    className={isUsed 
                      ? "bg-slate-700/50 text-slate-500 cursor-not-allowed" 
                      : "border-amber-500/50 text-amber-400 hover:bg-amber-500 hover:text-white"
                    }
                  >
                    T{num}
                  </Button>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-700">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-amber-500/30 border border-amber-500/50" />
                <span className="text-slate-400 text-xs">Disponible</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-slate-700/50" />
                <span className="text-slate-400 text-xs">Occupée</span>
              </div>
            </div>
          </div>
          <Button 
            variant="outline" 
            onClick={() => setShowNewTableModal(false)}
            className="w-full border-slate-600 text-slate-400"
          >
            Annuler
          </Button>
        </DialogContent>
      </Dialog>

      {/* Invoice Edit Modal */}
      <Dialog open={!!editingInvoice} onOpenChange={(open) => !open && setEditingInvoice(null)}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-blue-400 flex items-center gap-2">
              <Edit2 className="w-5 h-5" />
              Modifier {editingInvoice?.invoice_number}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
              {/* LEFT SIDE: Product Catalog to Add */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Ajouter des produits</h3>
                
                {/* Department Tabs */}
                <div className="flex flex-wrap gap-1">
                  {Object.entries(DEPARTMENT_CONFIG).map(([key, config]) => {
                    const Icon = config.icon;
                    return (
                      <button
                        key={key}
                        onClick={() => setEditingDepartment(key)}
                        className={`px-2 py-1 rounded text-xs font-medium transition-all flex items-center gap-1 ${
                          editingDepartment === key 
                            ? `${config.bgColor} ${config.color} border ${config.borderColor}` 
                            : 'bg-slate-700/50 text-slate-400 hover:text-white'
                        }`}
                      >
                        <Icon className="w-3 h-3" />
                        <span className="inline text-[11px] sm:text-sm">{config.label}</span>
                      </button>
                    );
                  })}
                </div>
                
                {/* Products Grid */}
                <div className="grid grid-cols-2 gap-1.5 max-h-[150px] sm:max-h-[200px] overflow-y-auto pr-1">
                  {(catalog[editingDepartment] || []).map((product, idx) => (
                    <button
                      key={idx}
                      onClick={() => addProductToEditing(product, editingDepartment)}
                      className="bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600 rounded-lg p-1.5 text-left transition-all"
                    >
                      <p className="text-white text-xs font-medium truncate">{product.name}</p>
                      <p className="text-amber-400 text-xs">{formatPrice(product.price)} F</p>
                    </button>
                  ))}
                  {(catalog[editingDepartment] || []).length === 0 && (
                    <p className="col-span-2 text-slate-500 text-xs text-center py-2">Aucun produit</p>
                  )}
                </div>
                
                {/* Custom Item for "Autres" */}
                {/* Custom item in edit mode - Manager/Admin only */}
                {editingDepartment === "autres" && (currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
                  <div className="bg-slate-700/30 rounded-lg p-2 space-y-1">
                    <p className="text-xs text-slate-400 font-medium">Article personnalisé</p>
                    <div className="flex gap-1">
                      <Input
                        placeholder="Nom"
                        value={customItem.name}
                        onChange={(e) => setCustomItem({...customItem, name: e.target.value})}
                        className="bg-slate-700/50 border-slate-600 text-white text-xs h-8 flex-1"
                      />
                      <Input
                        type="number"
                        placeholder="Prix"
                        value={customItem.price || ""}
                        onChange={(e) => setCustomItem({...customItem, price: parseInt(e.target.value) || 0})}
                        className="bg-slate-700/50 border-slate-600 text-white text-xs h-8 w-16"
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          if (customItem.name && customItem.price > 0) {
                            addProductToEditing(customItem, "autres");
                            setCustomItem({ name: "", price: 0 });
                          }
                        }}
                        disabled={!customItem.name || customItem.price <= 0}
                        className="bg-amber-500 hover:bg-amber-600 h-8 px-2"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              
              {/* RIGHT SIDE: Current Items */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Articles ({editingItems.length})
                </h3>
                
                <div className="space-y-1.5 max-h-[150px] sm:max-h-[200px] overflow-y-auto pr-1">
                  {editingItems.map((item, index) => {
                    const deptConfig = DEPARTMENT_CONFIG[item.department] || DEPARTMENT_CONFIG.autres;
                    return (
                      <div key={index} className={`flex items-center justify-between gap-1 rounded-lg p-1.5 border ${deptConfig.borderColor} ${deptConfig.bgColor}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium text-xs truncate">{item.name}</p>
                          <p className={`text-xs ${deptConfig.color}`}>{formatPrice(item.price)} F</p>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => updateEditingItemQuantity(index, -1)}
                            className="text-white h-6 w-6 p-0"
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="text-white font-bold w-5 text-center text-xs">{item.quantity}</span>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => updateEditingItemQuantity(index, 1)}
                            className="text-white h-6 w-6 p-0"
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => removeEditingItem(index)}
                            className="text-red-400 hover:text-red-300 h-6 w-6 p-0"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {editingItems.length === 0 && (
                    <p className="text-slate-500 text-xs text-center py-4">Aucun article</p>
                  )}
                </div>
                
                {/* Total */}
                <div className="border-t border-slate-700 pt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Total:</span>
                    <span className="text-amber-500 font-bold text-lg">
                      {formatPrice(editingItems.reduce((sum, item) => sum + (item.price * item.quantity), 0))} F
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Fixed buttons at bottom */}
          <div className="flex-shrink-0 flex gap-2 pt-3 border-t border-slate-700 bg-slate-800">
            <Button 
              onClick={saveModifiedInvoice}
              className="flex-1 bg-green-600 hover:bg-green-700 h-12 text-base"
              disabled={editingItems.length === 0}
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              OK - Enregistrer
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setEditingInvoice(null)}
              className="border-slate-600 text-slate-400 h-12 px-6"
            >
              Annuler
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Expense Modal */}
      <Dialog open={showExpenseModal} onOpenChange={(open) => {
        if (!open && commonItems.length > 0 && !editingExpense) {
          if (!confirm("Articles non enregistrés. Fermer quand même ?")) return;
        }
        if (!open) {
          setShowExpenseModal(false);
          setEditingExpense(null);
          setCommonItems([]);
          setCommonNewItem({ category: "cuisine", description: "", quantity: 1, unit_price: 0 });
          setExpenseForm({
            category: "cuisine",
            description: "",
            quantity: 1,
            unit_price: 0,
            amount: 0,
            supplier: "",
            planned_date: format(new Date(), "yyyy-MM-dd"),
            receipt_image: null
          });
        }
      }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-purple-400 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              {editingExpense ? 'Modifier la demande' : 'Nouveaux achats communs'}
              {commonItems.length > 0 && !editingExpense && (
                <Badge className="bg-purple-500/30 text-purple-200 ml-2">
                  {commonItems.length} article(s) • {formatPrice(getCommonTotal())} F
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Ajoutez un ou plusieurs articles (catégories différentes possibles). Le fournisseur, la date et le reçu sont communs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {editingExpense ? (
              /* --- EDIT MODE (admin) — single-item legacy + Type/Destination --- */
              <>
                {/* Admin-only: re-classify Achat ↔ Paiement */}
                <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                  <Label className="text-slate-300 text-xs uppercase tracking-wide mb-2 block">Type d'opération (Admin)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {EXPENSE_TYPES.map(t => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setExpenseForm(p => ({ ...p, expense_type: t.value }))}
                        data-testid={`edit-expense-type-${t.value}-btn`}
                        className={`px-3 py-2 rounded-lg border text-left transition-colors ${
                          (expenseForm.expense_type || "achat") === t.value
                            ? (t.value === "paiement"
                                ? "bg-rose-500/20 border-rose-500/60 text-rose-100"
                                : "bg-emerald-500/20 border-emerald-500/60 text-emerald-100")
                            : "bg-slate-900/40 border-slate-700 text-slate-300 hover:border-slate-500"
                        }`}
                      >
                        <span className="text-base mr-1">{t.icon}</span>
                        <span className="font-bold">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-slate-300">Catégorie *</Label>
                    <Select
                      value={expenseForm.category}
                      onValueChange={(v) => setExpenseForm({...expenseForm, category: v})}
                    >
                      <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="cuisine">🍳 Cuisine</SelectItem>
                        <SelectItem value="bar">🍹 Bar</SelectItem>
                        <SelectItem value="paiement">💳 Paiement</SelectItem>
                        <SelectItem value="autres">📦 Autres</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-slate-300">Destination</Label>
                    <Select
                      value={expenseForm.destination || "cuisine"}
                      onValueChange={(v) => setExpenseForm({...expenseForm, destination: v})}
                    >
                      <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white" data-testid="edit-expense-destination-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {DESTINATIONS.map(d => (
                          <SelectItem key={d.value} value={d.value}>{d.icon} {d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-slate-300">Description / Libellé *</Label>
                  <Textarea
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})}
                    placeholder="Ex: Viande de boeuf, légumes frais..."
                    className="bg-slate-700/50 border-slate-600 text-white"
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-slate-300">Quantité *</Label>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={expenseForm.quantity}
                      onChange={(e) => setExpenseForm({...expenseForm, quantity: parseFloat(e.target.value.replace(',', '.')) || 1})}
                      placeholder="1"
                      className="bg-slate-700/50 border-slate-600 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300">Prix unitaire (FCFA) *</Label>
                    <Input
                      type="number"
                      value={expenseForm.unit_price}
                      onChange={(e) => setExpenseForm({...expenseForm, unit_price: parseFloat(e.target.value) || 0})}
                      placeholder="0"
                      className="bg-slate-700/50 border-slate-600 text-white"
                    />
                  </div>
                </div>

                <div className="bg-indigo-900/30 rounded-lg p-3 border border-indigo-500/30">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300">Total calculé:</span>
                    <span className="text-xl font-bold text-indigo-400">
                      {formatPrice(expenseForm.quantity * expenseForm.unit_price)} F
                    </span>
                  </div>
                </div>
              </>
            ) : (
              /* --- CREATE MODE (multi-items + Achat / Paiement) --- */
              <>
                {/* Type toggle : Achat ↔ Paiement (top-level) */}
                <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                  <Label className="text-slate-300 text-xs uppercase tracking-wide mb-2 block">Type d'opération</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {EXPENSE_TYPES.map(t => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => {
                          setExpenseForm(p => ({ ...p, expense_type: t.value }));
                          setCommonNewItem(p => ({ ...p, expense_type: t.value, description: "" }));
                        }}
                        data-testid={`expense-type-${t.value}-btn`}
                        className={`px-4 py-3 rounded-lg border text-left transition-colors ${
                          expenseForm.expense_type === t.value
                            ? (t.value === "paiement"
                                ? "bg-rose-500/20 border-rose-500/60 text-rose-100"
                                : "bg-emerald-500/20 border-emerald-500/60 text-emerald-100")
                            : "bg-slate-900/40 border-slate-700 text-slate-300 hover:border-slate-500"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{t.icon}</span>
                          <span className="font-bold">{t.label}</span>
                        </div>
                        <p className="text-[11px] opacity-75 mt-0.5">{t.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Destination */}
                <div>
                  <Label className="text-slate-300 text-sm">Destination *</Label>
                  <Select
                    value={expenseForm.destination || "cuisine"}
                    onValueChange={(v) => {
                      setExpenseForm(p => ({ ...p, destination: v }));
                      setCommonNewItem(p => ({ ...p, destination: v }));
                    }}
                  >
                    <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white" data-testid="expense-destination-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {DESTINATIONS.map(d => (
                        <SelectItem key={d.value} value={d.value}>{d.icon} {d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-slate-300 text-sm">Libellé global (optionnel)</Label>
                  <Input
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})}
                    placeholder="Ex : Courses du jeudi"
                    className="bg-slate-700/50 border-slate-600 text-white"
                    data-testid="common-description-input"
                  />
                </div>

                {/* Toggle GLOBAL "Passer en stock" — visible UNIQUEMENT pour les achats */}
                {expenseForm.expense_type !== "paiement" && (
                  <div className="bg-emerald-900/15 border border-emerald-500/30 rounded-lg p-3 flex items-start gap-3" data-testid="to-stock-global-toggle-wrap">
                    <button
                      type="button"
                      onClick={() => setExpenseForm(p => ({ ...p, to_stock: !p.to_stock }))}
                      className={`mt-0.5 w-10 h-6 rounded-full transition-colors flex-shrink-0 relative ${expenseForm.to_stock ? "bg-emerald-500" : "bg-slate-600"}`}
                      data-testid="to-stock-global-toggle"
                      aria-pressed={expenseForm.to_stock}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${expenseForm.to_stock ? "translate-x-4" : ""}`} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-emerald-200">
                        Passer en stock {expenseForm.to_stock ? "(activé pour tous les articles)" : "(désactivé par défaut)"}
                      </p>
                      <p className="text-xs text-emerald-100/70 mt-0.5">
                        Si activé, tous les articles iront dans le module Stock (mouvement attendu à l'approbation, validé à la complétion). Vous pouvez ensuite décocher ligne par ligne ci-dessous pour les exclure.
                      </p>
                    </div>
                  </div>
                )}

                {/* Add new article block */}
                <Card className={`${expenseForm.expense_type === "paiement" ? "bg-rose-900/15 border-rose-500/30" : "bg-purple-900/20 border-purple-500/30"}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className={`text-sm flex items-center gap-2 ${expenseForm.expense_type === "paiement" ? "text-rose-200" : "text-purple-300"}`}>
                      <Plus className="w-4 h-4" />
                      {expenseForm.expense_type === "paiement" ? "Ajouter un paiement" : "Ajouter un article"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {expenseForm.expense_type === "paiement" ? (
                      /* PAIEMENT: select from predefined list */
                      <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
                        <Select
                          value={commonNewItem.description || ""}
                          onValueChange={(v) => {
                            const preset = PREDEFINED_PAYMENTS.find(p => p.label === v);
                            setCommonNewItem({
                              ...commonNewItem,
                              description: v,
                              category: "paiement",
                              expense_type: "paiement",
                              destination: preset?.destination || expenseForm.destination || "administratif",
                            });
                          }}
                        >
                          <SelectTrigger className="flex-1 min-w-[200px] bg-slate-700/50 border-slate-600 text-white" data-testid="payment-preset-select">
                            <SelectValue placeholder="Choisir un type de paiement…" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700 max-h-[300px]">
                            {PAYMENT_GROUPS.map(group => (
                              <div key={group}>
                                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500 bg-slate-900/50">{group}</div>
                                {PREDEFINED_PAYMENTS.filter(p => p.group === group).map(p => (
                                  <SelectItem key={p.label} value={p.label} className="text-white text-sm">
                                    {p.label}
                                  </SelectItem>
                                ))}
                              </div>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          value={commonNewItem.unit_price || ""}
                          onChange={(e) => setCommonNewItem({...commonNewItem, quantity: 1, unit_price: parseFloat(e.target.value) || 0})}
                          placeholder="Montant FCFA"
                          className="w-full sm:w-[140px] bg-slate-700/50 border-slate-600 text-white"
                          data-testid="payment-amount-input"
                        />
                        <Button onClick={addCommonItem} className="bg-rose-600 hover:bg-rose-700" data-testid="common-add-item-btn">
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      /* ACHAT: free text + qty + PU (legacy multi-items flow) */
                      <>
                        <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
                          <Select value={commonNewItem.category} onValueChange={(v) => setCommonNewItem({...commonNewItem, category: v})}>
                            <SelectTrigger className="w-full sm:w-[140px] bg-slate-700/50 border-slate-600 text-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-800 border-slate-700">
                              <SelectItem value="cuisine">🍳 Cuisine</SelectItem>
                              <SelectItem value="bar">🍹 Bar</SelectItem>
                              <SelectItem value="paiement">💳 Paiement</SelectItem>
                              <SelectItem value="autres">📦 Autres</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            value={commonNewItem.description}
                            onChange={(e) => setCommonNewItem({...commonNewItem, description: e.target.value})}
                            placeholder="Article / libellé"
                            className="flex-1 min-w-[150px] bg-slate-700/50 border-slate-600 text-white"
                            data-testid="common-new-item-desc"
                          />
                          <Input
                            type="number" min="0" step="any"
                            value={commonNewItem.quantity || ""}
                            onChange={(e) => setCommonNewItem({...commonNewItem, quantity: parseFloat(e.target.value.replace(',', '.')) || 1})}
                            placeholder="Qté"
                            className="w-full sm:w-[70px] bg-slate-700/50 border-slate-600 text-white"
                          />
                          <Input
                            type="number"
                            value={commonNewItem.unit_price || ""}
                            onChange={(e) => setCommonNewItem({...commonNewItem, unit_price: parseFloat(e.target.value) || 0})}
                            placeholder="PU"
                            className="w-full sm:w-[100px] bg-slate-700/50 border-slate-600 text-white"
                          />
                          <div className="flex items-center bg-purple-900/30 rounded px-2 text-purple-300 text-sm">
                            = {formatPrice((commonNewItem.quantity || 1) * (commonNewItem.unit_price || 0))} F
                          </div>
                          <Button onClick={addCommonItem} className="bg-purple-600 hover:bg-purple-700" data-testid="common-add-item-btn">
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                        {/* Conditioning suggestions (persisted + static presets + custom creator) */}
                        <ConditioningSuggester
                          description={commonNewItem.description}
                          category={commonNewItem.category}
                          quantity={commonNewItem.quantity}
                          onApply={(desc, qty) => setCommonNewItem({ ...commonNewItem, description: desc, quantity: qty })}
                          testIdPrefix="common"
                        />
                        {/* Picker rapide de produits du catalogue Marché */}
                        <QuickProductPicker
                          dataTestidPrefix="expense-qpp"
                          onPick={(p) => {
                            setCommonNewItem({
                              ...commonNewItem,
                              description: p.unit ? `${p.name} (${p.unit})` : p.name,
                              unit_price: Number(p.unit_cost || 0),
                              quantity: commonNewItem.quantity || 1,
                            });
                          }}
                        />
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Items list */}
                {commonItems.length > 0 && (
                  <Card className="bg-slate-700/30 border-slate-600">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-slate-300 text-sm">Articles ajoutés</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 max-h-[220px] overflow-y-auto">
                      {commonItems.map((it, idx) => {
                        const catLabel = { cuisine: "🍳 Cuisine", bar: "🍹 Bar", paiement: "💳 Paiement", autres: "📦 Autres" }[it.category] || it.category;
                        // État effectif "passer en stock" : override item OU toggle global
                        const itemToStock = (it.passer_en_stock === null || it.passer_en_stock === undefined) ? !!expenseForm.to_stock : !!it.passer_en_stock;
                        const isPaiement = it.expense_type === "paiement" || it.category === "paiement";
                        return (
                          <div key={it.id} className="flex items-center justify-between gap-2 bg-slate-600/30 rounded-lg p-2">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-slate-400 text-sm font-mono">{idx + 1}.</span>
                              <Badge className="text-xs shrink-0 bg-slate-700/50 text-slate-300">{catLabel}</Badge>
                              <span className="text-white truncate">{it.description}</span>
                              {!isPaiement && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCommonItems(commonItems.map(ci => ci.id === it.id ? { ...ci, passer_en_stock: !itemToStock } : ci));
                                  }}
                                  className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-semibold transition flex-shrink-0 ${itemToStock ? "bg-emerald-500/30 text-emerald-200 hover:bg-emerald-500/40" : "bg-slate-700/40 text-slate-400 hover:bg-slate-700/60"}`}
                                  title={itemToStock ? "Cet article ira en stock — cliquez pour désactiver" : "Cet article n'ira PAS en stock — cliquez pour activer"}
                                  data-testid={`item-stock-toggle-${it.id}`}
                                >
                                  {itemToStock ? "→ stock" : "hors stock"}
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-slate-400 text-xs">
                                {it.quantity} × {formatPrice(it.unit_price)} = {formatPrice(it.amount)} F
                              </span>
                              <Button size="sm" variant="ghost" onClick={() => removeCommonItem(it.id)}
                                className="text-red-400 hover:text-red-300 hover:bg-red-500/20 h-7 w-7 p-0">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex justify-end pt-1 border-t border-slate-600 mt-2">
                        <span className="text-purple-300 font-bold">
                          Total : {formatPrice(getCommonTotal())} F
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            <div>
              <Label className="text-slate-300">Fournisseur</Label>
              <Input
                value={expenseForm.supplier}
                onChange={(e) => setExpenseForm({...expenseForm, supplier: e.target.value})}
                placeholder="Nom du fournisseur"
                className="bg-slate-700/50 border-slate-600 text-white"
              />
            </div>

            <div>
              <Label className="text-slate-300">Date prévue d'achat</Label>
              <Input
                type="date"
                value={expenseForm.planned_date}
                onChange={(e) => setExpenseForm({...expenseForm, planned_date: e.target.value})}
                className="bg-slate-700/50 border-slate-600 text-white"
              />
            </div>

            {/* FINANCEMENT — Source de paiement */}
            <div className="bg-cyan-900/20 border border-cyan-500/30 rounded p-3 space-y-2">
              <Label className="text-cyan-300 text-sm flex items-center gap-2">
                <Wallet className="w-4 h-4" /> Payé depuis (source de financement)
              </Label>
              <select
                value={expenseForm.funded_by_account_id || ""}
                onChange={(e) => {
                  const id = e.target.value;
                  const acc = availableAccounts.find((a) => a.id === id);
                  setExpenseForm({
                    ...expenseForm,
                    funded_by_account_id: id,
                    funded_by_account_name: acc?.name || "",
                  });
                }}
                className="w-full bg-slate-700/50 border border-slate-600 text-white rounded px-3 py-2 text-sm"
                data-testid="expense-funded-by-select"
              >
                <option value="">💰 Recettes de la caisse (par défaut)</option>
                {availableAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    📒 {acc.name} — Dispo : {formatPrice(acc.balance_available || 0)} F
                  </option>
                ))}
              </select>
              {expenseForm.funded_by_account_id && (
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!expenseForm.funded_affects_ca}
                    onChange={(e) => setExpenseForm({ ...expenseForm, funded_affects_ca: e.target.checked })}
                    className="w-3.5 h-3.5 accent-cyan-400"
                    data-testid="expense-funded-affects-ca"
                  />
                  Cette dépense est quand même déduite du CA journalier
                </label>
              )}
            </div>

            <div>
              <Label className="text-slate-300">Photo du reçu/bon (optionnel)</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setExpenseForm({...expenseForm, receipt_image: reader.result});
                    };
                    reader.readAsDataURL(file);
                  }
                }}
                className="bg-slate-700/50 border-slate-600 text-white file:bg-purple-600 file:text-white file:border-0 file:rounded file:mr-2"
              />
              {expenseForm.receipt_image && (
                <div className="mt-2 relative">
                  <img 
                    src={expenseForm.receipt_image} 
                    alt="Reçu" 
                    className="w-full max-h-32 object-cover rounded border border-slate-600"
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    className="absolute top-1 right-1"
                    onClick={() => setExpenseForm({...expenseForm, receipt_image: null})}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-4">
              <Button 
                onClick={() => {
                  if (editingExpense) {
                    updateExpense(editingExpense.id, {
                      ...expenseForm,
                      status: "pending"  // Resubmit for approval
                    });
                    setShowExpenseModal(false);
                  } else {
                    createExpense();
                  }
                }}
                disabled={expenseSubmitLoading}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 disabled:cursor-wait"
                data-testid="save-common-expense-btn"
              >
                {expenseSubmitLoading
                  ? "Envoi en cours..."
                  : editingExpense
                    ? 'Soumettre à nouveau'
                    : `Soumettre ${commonItems.length > 0 ? `${commonItems.length} article(s)` : 'la demande'}`}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setShowExpenseModal(false)}
                className="border-slate-600 text-slate-400"
              >
                Annuler
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Shopping List Modal */}
      <Dialog open={showShoppingListModal} onOpenChange={(open) => {
        if (!open && shoppingList.length > 0) {
          if (!confirm("Vous avez des articles dans la liste. Voulez-vous vraiment fermer ?")) {
            return;
          }
        }
        setShowShoppingListModal(open);
      }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-indigo-400 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Achats Fournisseurs
              {shoppingList.length > 0 && (
                <Badge className="bg-indigo-500/30 text-indigo-300 ml-2">
                  {shoppingList.length} article(s) • Total: {formatPrice(getShoppingListTotal())} F
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Global settings : default supplier + date */}
            <div className="grid grid-cols-2 gap-3 bg-slate-700/30 rounded-lg p-3">
              <div>
                <Label className="text-slate-300 text-sm">Fournisseur par défaut</Label>
                <Input
                  value={shoppingListSupplier}
                  onChange={(e) => setShoppingListSupplier(e.target.value)}
                  placeholder="Pré-rempli pour chaque nouvel article"
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-300 text-sm">Date prévue (commune)</Label>
                <Input
                  type="date"
                  value={shoppingListDate}
                  onChange={(e) => setShoppingListDate(e.target.value)}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
              <div className="col-span-2 text-xs text-indigo-300 bg-indigo-900/20 rounded p-2">
                💡 Une demande d'achat distincte sera créée <b>par fournisseur</b>. Renseignez le fournisseur directement sur chaque article si besoin.
              </div>
            </div>

            {/* Add new item form */}
            <Card className="bg-indigo-900/20 border-indigo-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-indigo-300 text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Ajouter un article
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
                  <Select 
                    value={newListItem.category} 
                    onValueChange={(v) => setNewListItem({...newListItem, category: v})}
                  >
                    <SelectTrigger className="w-full sm:w-[120px] bg-slate-700/50 border-slate-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="cuisine">🍳 Cuisine</SelectItem>
                      <SelectItem value="bar">🍹 Bar</SelectItem>
                      <SelectItem value="paiement">💳 Paiement</SelectItem>
                      <SelectItem value="autres">📦 Autres</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={newListItem.description}
                    onChange={(e) => setNewListItem({...newListItem, description: e.target.value})}
                    placeholder="Libellé article"
                    className="flex-1 min-w-[150px] bg-slate-700/50 border-slate-600 text-white"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={newListItem.quantity || ""}
                    onChange={(e) => setNewListItem({...newListItem, quantity: parseFloat(e.target.value.replace(',', '.')) || 1})}
                    placeholder="Qté"
                    className="w-full sm:w-[70px] bg-slate-700/50 border-slate-600 text-white"
                  />
                  <Input
                    type="number"
                    value={newListItem.unit_price || ""}
                    onChange={(e) => setNewListItem({...newListItem, unit_price: parseFloat(e.target.value) || 0})}
                    placeholder="Prix (opt.)"
                    className="w-full sm:w-[100px] bg-slate-700/50 border-slate-600 text-white"
                  />
                </div>
                {/* Per-item supplier row */}
                <div className="flex gap-2 mt-2 items-center">
                  <Input
                    value={newListItem.supplier || ""}
                    onChange={(e) => setNewListItem({...newListItem, supplier: e.target.value})}
                    placeholder={`Fournisseur de l'article${shoppingListSupplier ? ` (défaut : ${shoppingListSupplier})` : ""}`}
                    className="flex-1 bg-slate-700/50 border-slate-600 text-white"
                    data-testid="list-item-supplier"
                  />
                  <div className="flex items-center bg-indigo-900/30 rounded px-2 text-indigo-300 text-sm shrink-0">
                    = {formatPrice((newListItem.quantity || 1) * (newListItem.unit_price || 0))} F
                  </div>
                  <Button 
                    onClick={addToShoppingList}
                    className="bg-indigo-600 hover:bg-indigo-700 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {/* Conditioning suggestions (persisted + static presets + custom creator) */}
                <ConditioningSuggester
                  description={newListItem.description}
                  category={newListItem.category}
                  quantity={newListItem.quantity}
                  onApply={(desc, qty) => setNewListItem({ ...newListItem, description: desc, quantity: qty })}
                  testIdPrefix="list"
                />
                <p className="text-xs text-slate-500 mt-2">💡 Prix optionnel — laissez vide si inconnu. Fournisseur optionnel (utilise le fournisseur par défaut ci-dessus).</p>
              </CardContent>
            </Card>

            {/* Shopping list items grouped by supplier */}
            {shoppingList.length > 0 ? (
              <Card className="bg-slate-700/30 border-slate-600">
                <CardHeader className="pb-2">
                  <CardTitle className="text-slate-300 text-sm">Articles groupés par fournisseur</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 max-h-[300px] overflow-y-auto">
                  {(() => {
                    const groups = {};
                    shoppingList.forEach((item) => {
                      const key = (item.supplier || "").trim() || "__NO_SUPPLIER__";
                      if (!groups[key]) groups[key] = [];
                      groups[key].push(item);
                    });
                    return Object.entries(groups).map(([supKey, items]) => {
                      const supLabel = supKey === "__NO_SUPPLIER__" ? "Sans fournisseur" : supKey;
                      const groupTotal = items.reduce((s, it) => s + (it.amount || 0), 0);
                      return (
                        <div key={supKey} className="bg-slate-800/40 rounded-lg p-2 border-l-2 border-indigo-500/60">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-3 h-3 text-indigo-400" />
                              <span className="text-indigo-300 font-bold text-sm">{supLabel}</span>
                              <Badge className="bg-slate-700/50 text-slate-300 text-[10px]">
                                {items.length} article(s)
                              </Badge>
                            </div>
                            <span className="text-indigo-300 font-bold text-sm">{formatPrice(groupTotal)} F</span>
                          </div>
                          <div className="space-y-1">
                            {items.map((item) => (
                              <div key={item.id} className="flex items-center justify-between gap-2 bg-slate-700/30 rounded p-1.5">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <Badge className={`text-[10px] shrink-0 ${
                                    item.category === 'cuisine' ? 'bg-green-500/20 text-green-400' :
                                    item.category === 'bar' ? 'bg-orange-500/20 text-orange-400' :
                                    item.category === 'paiement' ? 'bg-blue-500/20 text-blue-400' :
                                    'bg-slate-500/20 text-slate-400'
                                  }`}>{item.category}</Badge>
                                  <span className="text-white text-sm truncate">{item.description}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-slate-400 text-xs">{item.quantity || 1} × {formatPrice(item.unit_price)} = </span>
                                  <span className="text-amber-400 font-bold text-sm">{formatPrice(item.amount)} F</span>
                                  <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    onClick={() => removeFromShoppingList(item.id)}
                                    className="text-red-400 hover:text-red-300 hover:bg-red-500/20 h-6 w-6 p-0"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </CardContent>
              </Card>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Aucun article dans la liste</p>
                <p className="text-sm">Ajoutez des articles ci-dessus</p>
              </div>
            )}

            {/* Summary and submit */}
            {shoppingList.length > 0 && (() => {
              const groups = {};
              shoppingList.forEach((item) => {
                const key = (item.supplier || "").trim() || "__NO_SUPPLIER__";
                groups[key] = (groups[key] || 0) + 1;
              });
              const nbGroups = Object.keys(groups).length;
              return (
              <div className="bg-gradient-to-r from-indigo-900/30 to-purple-900/30 rounded-lg p-4 border border-indigo-500/30">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-slate-300">
                    {nbGroups} fournisseur(s) • {shoppingList.length} article(s) • Total :
                  </span>
                  <span className="text-2xl font-bold text-indigo-400">{formatPrice(getShoppingListTotal())} F</span>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={submitShoppingList}
                    className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Soumettre {nbGroups} demande(s) d'achat
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => {
                      if (confirm("Vider toute la liste ?")) {
                        setShoppingList([]);
                      }
                    }}
                    className="border-red-500/50 text-red-400 hover:bg-red-500/20"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              );
            })()}

            <Button 
              variant="outline" 
              onClick={() => setShowShoppingListModal(false)}
              className="w-full border-slate-600 text-slate-400"
            >
              Fermer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Admin Revise Modal (modify items + supplier before resending to manager) ===== */}
      <Dialog open={showReviseModal} onOpenChange={(open) => { if (!open) { setShowReviseModal(false); setRevisingExpense(null); } }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-amber-300 flex items-center gap-2">
              <Edit2 className="w-5 h-5" />
              Modifier avant renvoi — {revisingExpense?.description || ""}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Ajustez les articles, quantités, prix et le fournisseur. La gérante pourra revoir et resoumettre.
            </DialogDescription>
          </DialogHeader>
          {revisingExpense && (
            <div className="space-y-4">
              <div>
                <Label className="text-slate-300 text-sm">Fournisseur</Label>
                <Input value={reviseSupplier} onChange={(e) => setReviseSupplier(e.target.value)}
                  placeholder="Nom du fournisseur"
                  className="bg-slate-700/50 border-slate-600 text-white"
                  data-testid="revise-supplier-input" />
              </div>

              {/* Existing items editable inline */}
              <Card className="bg-slate-700/30 border-slate-600">
                <CardHeader className="pb-2">
                  <CardTitle className="text-slate-300 text-sm">Articles ({reviseItems.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 max-h-[260px] overflow-y-auto">
                  {reviseItems.map((it, idx) => (
                    <div key={it._k} className="flex items-center gap-2 bg-slate-600/30 rounded p-2 flex-wrap">
                      <span className="text-slate-400 text-xs font-mono w-5">{idx + 1}.</span>
                      <Select value={it.category} onValueChange={(v) => updateReviseItem(it._k, { category: v })}>
                        <SelectTrigger className="w-[110px] bg-slate-700/50 border-slate-600 text-white h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          <SelectItem value="cuisine">🍳 Cuisine</SelectItem>
                          <SelectItem value="bar">🍹 Bar</SelectItem>
                          <SelectItem value="paiement">💳 Paiement</SelectItem>
                          <SelectItem value="autres">📦 Autres</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input value={it.description} onChange={(e) => updateReviseItem(it._k, { description: e.target.value })}
                        className="flex-1 min-w-[120px] bg-slate-700/50 border-slate-600 text-white h-8 text-xs" />
                      <Input type="number" step="any" value={it.quantity || 1}
                        onChange={(e) => updateReviseItem(it._k, { quantity: parseFloat(e.target.value.replace(',', '.')) || 1 })}
                        className="w-[60px] bg-slate-700/50 border-slate-600 text-white h-8 text-xs" />
                      <Input type="number" value={it.unit_price || 0}
                        onChange={(e) => updateReviseItem(it._k, { unit_price: parseFloat(e.target.value) || 0 })}
                        className="w-[90px] bg-slate-700/50 border-slate-600 text-white h-8 text-xs" />
                      <span className="text-amber-300 text-xs w-20 text-right">= {formatPrice(it.amount)} F</span>
                      <Button size="sm" variant="ghost" onClick={() => removeReviseItem(it._k)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/20 h-7 w-7 p-0">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Add new article */}
              <Card className="bg-amber-900/20 border-amber-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-amber-300 text-sm flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Ajouter un article
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <Select value={reviseNewItem.category} onValueChange={(v) => setReviseNewItem({...reviseNewItem, category: v})}>
                      <SelectTrigger className="w-[120px] bg-slate-700/50 border-slate-600 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="cuisine">🍳 Cuisine</SelectItem>
                        <SelectItem value="bar">🍹 Bar</SelectItem>
                        <SelectItem value="paiement">💳 Paiement</SelectItem>
                        <SelectItem value="autres">📦 Autres</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input value={reviseNewItem.description} onChange={(e) => setReviseNewItem({...reviseNewItem, description: e.target.value})}
                      placeholder="Description" className="flex-1 min-w-[150px] bg-slate-700/50 border-slate-600 text-white"
                      data-testid="revise-new-desc" />
                    <Input type="number" step="any" value={reviseNewItem.quantity || ""} onChange={(e) => setReviseNewItem({...reviseNewItem, quantity: parseFloat(e.target.value.replace(',', '.')) || 1})}
                      placeholder="Qté" className="w-[70px] bg-slate-700/50 border-slate-600 text-white" />
                    <Input type="number" value={reviseNewItem.unit_price || ""} onChange={(e) => setReviseNewItem({...reviseNewItem, unit_price: parseFloat(e.target.value) || 0})}
                      placeholder="PU" className="w-[100px] bg-slate-700/50 border-slate-600 text-white" />
                    <Button onClick={addReviseItem} className="bg-amber-600 hover:bg-amber-700" data-testid="revise-add-item-btn">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div>
                <Label className="text-slate-300 text-sm">Note à la gérante</Label>
                <Textarea value={reviseNote} onChange={(e) => setReviseNote(e.target.value)}
                  placeholder="Ex : j'ai ajusté les quantités, merci de vérifier..."
                  className="bg-slate-700/50 border-slate-600 text-white"
                  data-testid="revise-note-input" />
              </div>

              <div className="bg-amber-900/20 rounded-lg p-3 flex justify-between items-center">
                <span className="text-slate-300">Nouveau total :</span>
                <span className="text-xl font-bold text-amber-300">{formatPrice(getReviseTotal())} F</span>
              </div>

              <div className="flex gap-2 justify-end pt-2 flex-wrap">
                <Button variant="outline" onClick={() => setShowReviseModal(false)} className="border-slate-600 text-slate-300">Annuler</Button>
                <Button onClick={() => submitRevision(false)} className="bg-amber-600 hover:bg-amber-700" data-testid="submit-revision-btn">
                  <Edit2 className="w-4 h-4 mr-2" /> Renvoyer à la gérante
                </Button>
                <Button onClick={() => submitRevision(true)} className="bg-green-600 hover:bg-green-700" data-testid="submit-revise-approve-btn">
                  <CheckCircle className="w-4 h-4 mr-2" /> Approuver directement
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Week Assignment Modal for Expenses */}
      <Dialog open={showWeekAssignModal} onOpenChange={(open) => {
        setShowWeekAssignModal(open);
        if (!open) setExpenseToAssign(null);
      }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-cyan-400">
              <Calendar className="w-5 h-5" />
              Rattacher à une semaine
            </DialogTitle>
          </DialogHeader>
          {expenseToAssign && (
            <div className="space-y-4 py-4">
              <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700">
                <p className="text-slate-400 text-sm">Dépense sélectionnée:</p>
                <p className="text-white font-medium">{expenseToAssign.description}</p>
                <p className="text-amber-400 font-bold">{formatPrice(expenseToAssign.amount)} F</p>
              </div>
              
              <div>
                <Label className="text-slate-400 text-sm mb-2 block">Sélectionner la semaine</Label>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {/* Generate last 8 weeks */}
                  {Array.from({ length: 8 }, (_, i) => {
                    const weekStart = new Date();
                    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1 - (i * 7)); // Monday
                    const weekEnd = new Date(weekStart);
                    weekEnd.setDate(weekEnd.getDate() + 6); // Sunday
                    const weekStartStr = format(weekStart, "yyyy-MM-dd");
                    const isCurrentWeek = i === 0;
                    const isSelected = expenseToAssign.assigned_week === weekStartStr;
                    
                    return (
                      <Button
                        key={weekStartStr}
                        variant={isSelected ? "default" : "outline"}
                        className={`w-full justify-start ${
                          isSelected 
                            ? 'bg-cyan-600 text-white' 
                            : 'border-slate-600 text-slate-300 hover:bg-slate-700'
                        }`}
                        onClick={async () => {
                          await assignExpenseToWeek(expenseToAssign.id, weekStartStr);
                          setShowWeekAssignModal(false);
                          setExpenseToAssign(null);
                        }}
                      >
                        <Calendar className="w-4 h-4 mr-2" />
                        {format(weekStart, "dd/MM")} - {format(weekEnd, "dd/MM/yyyy")}
                        {isCurrentWeek && (
                          <Badge className="ml-2 bg-cyan-500/30 text-cyan-300 text-xs">Cette semaine</Badge>
                        )}
                      </Button>
                    );
                  })}
                </div>
              </div>
              
              {expenseToAssign.assigned_week && (
                <Button
                  variant="outline"
                  className="w-full border-red-500/50 text-red-400 hover:bg-red-500/20"
                  onClick={async () => {
                    await assignExpenseToWeek(expenseToAssign.id, null);
                    setShowWeekAssignModal(false);
                    setExpenseToAssign(null);
                  }}
                >
                  <X className="w-4 h-4 mr-2" />
                  Retirer le rattachement
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* End of Service Modal (for Servers) */}
      <Dialog open={showEndOfServiceModal} onOpenChange={setShowEndOfServiceModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <ClipboardList className="w-6 h-6 text-indigo-400" />
              Terminer Mon Service
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Summary Preview */}
            {serverDailyReport ? (
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                <h4 className="text-sm font-medium text-slate-400 mb-3">Résumé de votre journée</h4>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-indigo-900/30 rounded-lg p-2">
                    <p className="text-2xl font-bold text-indigo-400">{serverDailyReport.total_invoices}</p>
                    <p className="text-xs text-slate-500">Commandes</p>
                  </div>
                  <div className="bg-green-900/30 rounded-lg p-2">
                    <p className="text-2xl font-bold text-green-400">{serverDailyReport.validated_count}</p>
                    <p className="text-xs text-slate-500">Validées</p>
                  </div>
                  <div className="bg-amber-900/30 rounded-lg p-2">
                    <p className="text-2xl font-bold text-amber-400">{formatPrice(serverDailyReport.total_sales)} F</p>
                    <p className="text-xs text-slate-500">Total</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900/30 rounded-lg p-3 border border-slate-700 text-center text-slate-400 text-xs">
                Chargement du résumé… (vous pouvez quand même envoyer votre point)
              </div>
            )}

            {/* Observation Field */}
            <div>
              <Label className="text-slate-300 text-sm mb-2 block">
                Observation (optionnel)
              </Label>
              <Textarea
                value={endOfServiceObservation}
                onChange={(e) => setEndOfServiceObservation(e.target.value)}
                placeholder="Ex: Retard livraison fournisseur, problème caisse, incident client..."
                className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 min-h-[100px]"
              />
              <p className="text-xs text-slate-500 mt-1">
                Cette observation sera envoyée à la gérante avec votre point journalier
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowEndOfServiceModal(false)}
              className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Annuler
            </Button>
            <Button
              onClick={submitEndOfService}
              disabled={isSubmittingEndOfService}
              className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
              data-testid="envoyer-point-btn"
            >
              {isSubmittingEndOfService ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Envoyer le Point
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Free Accompaniment Modal */}
      <Dialog open={showFreeAccompModal} onOpenChange={setShowFreeAccompModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl text-yellow-400">
              <Package className="w-6 h-6" />
              Ajouter un Accompagnement Gratuit
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 py-4">
            {DEFAULT_CATALOG.accompagnements.map(accomp => (
              <Button
                key={accomp.id}
                onClick={() => addFreeAccompaniment(accomp.name)}
                variant="outline"
                className="h-auto py-3 border-yellow-500/30 hover:bg-yellow-500/20 text-left justify-start"
              >
                <div>
                  <p className="text-white font-medium text-sm">{accomp.name}</p>
                  <p className="text-yellow-400 text-xs">GRATUIT (au lieu de {formatPrice(accomp.price)} F)</p>
                </div>
              </Button>
            ))}
          </div>
          <Button
            variant="ghost"
            onClick={() => setShowFreeAccompModal(false)}
            className="w-full text-slate-400 hover:text-white"
          >
            Annuler
          </Button>
        </DialogContent>
      </Dialog>

      {/* Server Report Detail Modal (for Manager viewing server's point) */}
      <Dialog open={!!viewingServerReport} onOpenChange={(open) => { if (!open) { setViewingServerReport(null); setViewingServerDetailedReport(null); setReportComparison(null); setValidationComment(""); } }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-xl">
              <div className="p-2 bg-indigo-900/50 rounded-lg">
                <User className="w-6 h-6 text-indigo-400" />
              </div>
              <div className="flex-1">
                <span className="text-white">Point de {viewingServerReport?.server_name}</span>
                <p className="text-sm text-slate-400 font-normal mt-0.5">
                  {viewingServerReport?.date && new Date(viewingServerReport.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
              {/* Status Badge - Always show, default to pending if no status */}
              <Badge className={
                viewingServerReport?.status === 'validated' ? 'bg-green-500/20 text-green-400' :
                viewingServerReport?.status === 'revision_requested' ? 'bg-orange-500/20 text-orange-400' :
                viewingServerReport?.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                'bg-amber-500/20 text-amber-400'
              }>
                {viewingServerReport?.status === 'validated' ? 'Validé' :
                 viewingServerReport?.status === 'revision_requested' ? 'Révision demandée' :
                 viewingServerReport?.status === 'rejected' ? 'Rejeté' :
                 'En attente'}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          
          {loadingServerDetail ? (
            <div className="py-12 text-center">
              <RefreshCw className="w-8 h-8 text-indigo-400 mx-auto animate-spin mb-3" />
              <p className="text-slate-400">Chargement du rapport détaillé...</p>
            </div>
          ) : viewingServerDetailedReport ? (
            <div className="space-y-4 py-4">
              
              {/* COMPARISON SECTION - Declared vs Actual */}
              {reportComparison && (
                <Card className={`border-2 ${reportComparison.discrepancy?.has_discrepancy ? 'border-orange-500/50 bg-orange-900/10' : 'border-green-500/50 bg-green-900/10'}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-white flex items-center gap-2 text-base">
                      <BarChart3 className="w-5 h-5" />
                      Comparaison Déclaré vs Réel
                      {reportComparison.discrepancy?.has_discrepancy ? (
                        <Badge className="bg-orange-500/20 text-orange-400 ml-2">Écarts détectés</Badge>
                      ) : (
                        <Badge className="bg-green-500/20 text-green-400 ml-2">Conforme</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-600">
                            <th className="text-left py-2 text-slate-400"></th>
                            <th className="text-center py-2 text-slate-400">Déclaré</th>
                            <th className="text-center py-2 text-slate-400">Réel (Système)</th>
                            <th className="text-center py-2 text-slate-400">Écart</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-slate-700">
                            <td className="py-3 text-slate-300">Commandes créées</td>
                            <td className="py-3 text-center text-white font-medium">{reportComparison.declared?.total_invoices}</td>
                            <td className="py-3 text-center text-white font-medium">{reportComparison.actual?.total_invoices}</td>
                            <td className={`py-3 text-center font-bold ${reportComparison.discrepancy?.invoices === 0 ? 'text-green-400' : reportComparison.discrepancy?.invoices > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                              {reportComparison.discrepancy?.invoices > 0 ? '+' : ''}{reportComparison.discrepancy?.invoices}
                            </td>
                          </tr>
                          <tr className="border-b border-slate-700">
                            <td className="py-3 text-slate-300">Factures validées</td>
                            <td className="py-3 text-center text-white font-medium">{reportComparison.declared?.validated_invoices}</td>
                            <td className="py-3 text-center text-white font-medium">{reportComparison.actual?.validated_invoices}</td>
                            <td className={`py-3 text-center font-bold ${reportComparison.actual?.validated_invoices === reportComparison.declared?.validated_invoices ? 'text-green-400' : 'text-orange-400'}`}>
                              {reportComparison.actual?.validated_invoices - reportComparison.declared?.validated_invoices > 0 ? '+' : ''}
                              {reportComparison.actual?.validated_invoices - reportComparison.declared?.validated_invoices}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-3 text-slate-300 font-medium">Total des ventes</td>
                            <td className="py-3 text-center text-amber-400 font-bold">{formatPrice(reportComparison.declared?.total_sales)} F</td>
                            <td className="py-3 text-center text-amber-400 font-bold">{formatPrice(reportComparison.actual?.total_sales)} F</td>
                            <td className={`py-3 text-center font-bold ${Math.abs(reportComparison.discrepancy?.sales) < 1 ? 'text-green-400' : reportComparison.discrepancy?.sales > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                              {reportComparison.discrepancy?.sales > 0 ? '+' : ''}{formatPrice(reportComparison.discrepancy?.sales)} F
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    {reportComparison.discrepancy?.has_discrepancy && (
                      <div className="mt-3 p-3 bg-orange-500/10 rounded-lg border border-orange-500/30">
                        <p className="text-orange-400 text-sm flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4" />
                          Des écarts ont été détectés entre les chiffres déclarés et les données du système.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="bg-gradient-to-br from-indigo-900/30 to-purple-900/20 border-indigo-500/50">
                  <CardContent className="p-4 text-center">
                    <Receipt className="w-6 h-6 text-indigo-400 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-indigo-400">{viewingServerDetailedReport.total_invoices}</p>
                    <p className="text-slate-400 text-xs">Commandes créées</p>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-green-900/30 to-emerald-900/20 border-green-500/50">
                  <CardContent className="p-4 text-center">
                    <CheckCircle className="w-6 h-6 text-green-400 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-green-400">{viewingServerDetailedReport.validated_count}</p>
                    <p className="text-slate-400 text-xs">Factures validées</p>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-amber-900/30 to-orange-900/20 border-amber-500/50">
                  <CardContent className="p-4 text-center">
                    <Clock className="w-6 h-6 text-amber-400 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-amber-400">{viewingServerDetailedReport.pending_count}</p>
                    <p className="text-slate-400 text-xs">En attente</p>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-emerald-900/30 to-teal-900/20 border-emerald-500/50">
                  <CardContent className="p-4 text-center">
                    <DollarSign className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-emerald-400">{formatPrice(viewingServerDetailedReport.total_sales)} F</p>
                    <p className="text-slate-400 text-xs">Total validé</p>
                  </CardContent>
                </Card>
              </div>

              {/* Observation from Server */}
              {viewingServerReport?.observation && (
                <Card className="bg-slate-900/50 border-indigo-500/30">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <MessageSquare className="w-5 h-5 text-indigo-400 mt-0.5" />
                      <div>
                        <p className="text-indigo-400 font-medium text-sm mb-1">Observation du serveur</p>
                        <p className="text-white italic">"{viewingServerReport.observation}"</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Breakdown by Department */}
              {viewingServerDetailedReport.department_breakdown && Object.keys(viewingServerDetailedReport.department_breakdown).length > 0 && (
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-slate-300 flex items-center gap-2 text-base">
                      <BarChart3 className="w-5 h-5" />
                      Répartition par Département
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.entries(viewingServerDetailedReport.department_breakdown).map(([dept, data]) => {
                        const deptConfig = DEPARTMENT_CONFIG[dept];
                        return (
                          <div key={dept} className={`p-3 rounded-lg ${deptConfig?.bgColor || 'bg-slate-700/30'} border ${deptConfig?.borderColor || 'border-slate-600'}`}>
                            <p className={`font-medium text-sm ${deptConfig?.color || 'text-slate-300'}`}>{deptConfig?.label || dept}</p>
                            <p className="text-white text-lg font-bold">{formatPrice(data.total)} F</p>
                            <p className="text-slate-400 text-xs">{data.count} article(s)</p>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Breakdown by Payment Method */}
              {viewingServerDetailedReport.payment_methods && Object.keys(viewingServerDetailedReport.payment_methods).length > 0 && (
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-slate-300 flex items-center gap-2 text-base">
                      <Wallet className="w-5 h-5" />
                      Modes de Paiement
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.entries(viewingServerDetailedReport.payment_methods).map(([method, data]) => (
                        <div key={method} className="p-3 rounded-lg bg-slate-700/30 border border-slate-600">
                          <p className="text-slate-300 font-medium capitalize text-sm">
                            {method === 'cash' || method === 'especes' ? 'Espèces' : 
                             method === 'card' || method === 'carte' ? 'Carte' : 
                             method === 'mobile_money' ? 'Mobile Money' : 
                             method === 'cheque' ? 'Chèque' : method}
                          </p>
                          <p className="text-white text-lg font-bold">{formatPrice(data.total)} F</p>
                          <p className="text-slate-400 text-xs">{data.count} transaction(s)</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Invoice List */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-slate-300 flex items-center gap-2 text-base">
                    <FileText className="w-5 h-5" />
                    Factures du Jour ({viewingServerDetailedReport.invoices?.length || 0})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {viewingServerDetailedReport.invoices?.length === 0 ? (
                    <p className="text-slate-500 text-center py-6">Aucune facture pour cette date</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {viewingServerDetailedReport.invoices?.map((invoice) => (
                        <div key={invoice.id} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-white font-medium">{invoice.invoice_number}</span>
                            <Badge className={
                              invoice.validation_status === 'validated' ? 'bg-green-500/20 text-green-400' :
                              invoice.validation_status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                              'bg-slate-500/20 text-slate-400'
                            }>
                              {invoice.validation_status === 'validated' ? 'Validée' : 
                               invoice.validation_status === 'pending' ? 'En attente' : invoice.validation_status}
                            </Badge>
                            {invoice.table_number && (
                              <Badge className="bg-slate-600/50 text-slate-300">Table {invoice.table_number}</Badge>
                            )}
                            {/* Payment Method Badge */}
                            {invoice.payment_method && invoice.validation_status === 'validated' && (
                              <Badge className={
                                invoice.payment_method === 'cash' ? 'bg-green-600/30 text-green-300' :
                                invoice.payment_method === 'mobile' ? 'bg-orange-600/30 text-orange-300' :
                                invoice.payment_method === 'card' ? 'bg-blue-600/30 text-blue-300' :
                                'bg-slate-600/30 text-slate-300'
                              }>
                                {invoice.payment_method === 'cash' ? '💵 Espèces' : 
                                 invoice.payment_method === 'mobile' ? '📱 Mobile' : 
                                 invoice.payment_method === 'card' ? '💳 Carte' : invoice.payment_method}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-amber-400 font-bold">{formatPrice(invoice.total)} F</span>
                            <span className="text-slate-500 text-sm">
                              {new Date(invoice.created_at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* VALIDATION SECTION - Only for manager/admin and pending reports */}
              {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (!viewingServerReport?.status || viewingServerReport?.status === 'pending') && (
                <Card className="bg-slate-900/50 border-slate-600">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-slate-300 flex items-center gap-2 text-base">
                      <CheckCircle className="w-5 h-5" />
                      Valider ce Point
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-slate-400 text-sm">Commentaire (optionnel)</Label>
                      <Textarea
                        value={validationComment}
                        onChange={(e) => setValidationComment(e.target.value)}
                        placeholder="Ajouter un commentaire pour le serveur..."
                        className="bg-slate-800 border-slate-600 text-white mt-1"
                        rows={2}
                      />
                    </div>
                    <div className="flex gap-3">
                      <Button 
                        onClick={() => handleReportValidation(viewingServerReport.id, 'validate', validationComment)}
                        className="flex-1 bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Valider
                      </Button>
                      <Button 
                        onClick={() => handleReportValidation(viewingServerReport.id, 'request_revision', validationComment)}
                        variant="outline"
                        className="flex-1 border-orange-500 text-orange-400 hover:bg-orange-500/20"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Réviser
                      </Button>
                      <Button 
                        onClick={() => handleReportValidation(viewingServerReport.id, 'reject', validationComment)}
                        variant="outline"
                        className="flex-1 border-red-500 text-red-400 hover:bg-red-500/20"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Rejeter
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* DELETE SECTION - For manager with code verification */}
              {currentUser?.role === 'manager' && (
                <Card className="bg-slate-900/50 border-slate-600">
                  <CardContent className="p-4">
                    {!showDeleteConfirm ? (
                      <Button 
                        onClick={() => setShowDeleteConfirm(true)}
                        variant="outline"
                        className="w-full border-red-500/50 text-red-400 hover:bg-red-500/20"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Supprimer ce point
                      </Button>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-red-400 text-sm">
                          <AlertTriangle className="w-4 h-4" />
                          <span>Entrez le code de suppression pour confirmer</span>
                        </div>
                        <div className="flex gap-2">
                          <Input
                            type="password"
                            value={deleteReportCode}
                            onChange={(e) => setDeleteReportCode(e.target.value)}
                            placeholder="Code à 4 chiffres"
                            className="bg-slate-800 border-slate-600 text-white flex-1"
                            maxLength={4}
                          />
                          <Button 
                            onClick={() => handleDeleteServerReport(viewingServerReport.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Confirmer
                          </Button>
                          <Button 
                            onClick={() => { setShowDeleteConfirm(false); setDeleteReportCode(""); }}
                            variant="outline"
                            className="border-slate-500"
                          >
                            Annuler
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Already validated info */}
              {viewingServerReport?.status && viewingServerReport.status !== 'pending' && (
                <Card className={`border ${
                  viewingServerReport.status === 'validated' ? 'bg-green-900/20 border-green-500/50' :
                  viewingServerReport.status === 'revision_requested' ? 'bg-orange-900/20 border-orange-500/50' :
                  'bg-red-900/20 border-red-500/50'
                }`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      {viewingServerReport.status === 'validated' ? (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      ) : viewingServerReport.status === 'revision_requested' ? (
                        <RefreshCw className="w-5 h-5 text-orange-400" />
                      ) : (
                        <X className="w-5 h-5 text-red-400" />
                      )}
                      <div>
                        <p className={`font-medium ${
                          viewingServerReport.status === 'validated' ? 'text-green-400' :
                          viewingServerReport.status === 'revision_requested' ? 'text-orange-400' :
                          'text-red-400'
                        }`}>
                          {viewingServerReport.status === 'validated' ? 'Point validé' :
                           viewingServerReport.status === 'revision_requested' ? 'Révision demandée' :
                           'Point rejeté'}
                        </p>
                        <p className="text-slate-400 text-sm">
                          Par {viewingServerReport.validated_by} le {viewingServerReport.validated_at && new Date(viewingServerReport.validated_at).toLocaleString('fr-FR')}
                        </p>
                        {viewingServerReport.validation_comment && (
                          <p className="text-slate-300 text-sm mt-1 italic">"{viewingServerReport.validation_comment}"</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Timestamp */}
              <p className="text-slate-500 text-xs text-center">
                Point envoyé le {viewingServerReport?.created_at && new Date(viewingServerReport.created_at).toLocaleString('fr-FR', { 
                  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' 
                })}
              </p>
            </div>
          ) : (
            <div className="py-12 text-center">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
              <p className="text-slate-400">Impossible de charger le rapport détaillé</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Share Modal with QR Code */}
      <ShareModal open={showShareModal} onOpenChange={setShowShareModal} />

      {/* Régularisation rétroactive de bons */}
      <RegularizationModal
        open={showRegularizationModal}
        onClose={() => setShowRegularizationModal(false)}
        mode={regularizationMode}
        currentUser={currentUser}
        existingInvoice={regularizationTargetInvoice}
        products={products}
        onSuccess={() => { fetchAllData?.(); }}
      />
    </div>
  );
};

export default CaissePage;
