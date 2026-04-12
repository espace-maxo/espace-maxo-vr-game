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
  Building2, MessageSquare, Bell, ClipboardList, QrCode, Share2
} from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format, subDays, startOfMonth, endOfMonth, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";

// Extracted components
import TablesTab from "./caisse/components/TablesTab";
import HebdoReport from "./caisse/components/HebdoReport";
import LocationsTab from "./caisse/components/LocationsTab";
import InstructionsTab from "./caisse/components/InstructionsTab";
import ProformaTab from "./caisse/components/ProformaTab";
import SubscriptionsTab from "./caisse/components/SubscriptionsTab";
import ShareModal, { ShareButton } from "./caisse/components/ShareModal";
import MonsieurTab from "./caisse/components/MonsieurTab";

// Import logo for printing
import { LOGO_BASE64 } from "./caisse/constants_logo";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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
  
  // Main state
  const [activeTab, setActiveTab] = useState("commande");
  const [activeDepartment, setActiveDepartment] = useState("salle_jardin");
  const [productSearch, setProductSearch] = useState("");
  
  // Catalog/Products
  const [products, setProducts] = useState([]);
  const [catalog, setCatalog] = useState(DEFAULT_CATALOG);
  
  // Multi-table system
  const [openTables, setOpenTables] = useState([]); // All open tables from DB
  const [activeTableId, setActiveTableId] = useState(null); // Currently active table ID
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
  
  // Modals
  const [viewInvoice, setViewInvoice] = useState(null);
  const [editInvoice, setEditInvoice] = useState(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showMobilePaymentModal, setShowMobilePaymentModal] = useState(false);
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
    receipt_image: null
  });
  
  // Revision notifications for Manager
  const [revisionExpensesCount, setRevisionExpensesCount] = useState(0);
  const [showRevisionPanel, setShowRevisionPanel] = useState(false);
  
  // Liste d'achats multiple
  const [shoppingList, setShoppingList] = useState([]);
  const [showShoppingListModal, setShowShoppingListModal] = useState(false);
  const [shoppingListSupplier, setShoppingListSupplier] = useState("");
  const [shoppingListDate, setShoppingListDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [newListItem, setNewListItem] = useState({ category: "cuisine", description: "", quantity: 1, unit_price: 0 });
  const [showAllExpenses, setShowAllExpenses] = useState(false);
  
  // Expense week assignment
  const [showWeekAssignModal, setShowWeekAssignModal] = useState(false);
  const [expenseToAssign, setExpenseToAssign] = useState(null);

  // ============== WEEKLY REPORT (Point Hebdomadaire) ==============
  const [weeklyReport, setWeeklyReport] = useState(null);
  const [weekStartDate, setWeekStartDate] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [expenseRatioAlert, setExpenseRatioAlert] = useState(null);

  // ============== ACTIVITY TRACKING (Admin) ==============
  const [activityReport, setActivityReport] = useState(null);
  const [activityPeriod, setActivityPeriod] = useState("day");
  const [activityDate, setActivityDate] = useState(format(new Date(), "yyyy-MM-dd"));

  // ============== TABLE STATUS (Suivi Tables) ==============
  const [tablesStatus, setTablesStatus] = useState({ tables: [], stats: { total_tables: 20, occupied: 0, free: 20 } });

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
      const response = await axios.post(`${API}/caisse/tables`, {
        table_number: tableNumber,
        server_id: currentUser.id || currentUser.username,
        server_name: currentUser.full_name || currentUser.username,
        items: [],
        client_name: "Client",
        payment_method: "cash",
        discount: 0,
        notes: ""
      });
      
      if (response.data.success) {
        toast.success(`Table ${tableNumber} ouverte !`);
        await fetchOpenTables();
        selectTable(response.data.table);
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
      await axios.put(`${API}/caisse/tables/${activeTableId}`, {
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
      await axios.delete(`${API}/caisse/tables/${tableId}`);
      
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

  useEffect(() => {
    if (isAuthenticated) {
      fetchAllData();
      fetchOpenTables();
      
      // Set default tab based on role
      if (currentUser?.role === 'manager') {
        setActiveTab("commande"); // Manager starts on Commande tab (can take orders)
      }
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

  // ============== EXPENSES FUNCTIONS ==============
  
  const fetchExpenses = async () => {
    try {
      const res = await axios.get(`${API}/expenses`);
      const expensesList = res.data.expenses || [];
      setExpenses(expensesList);
      // Update revision count for manager
      setRevisionExpensesCount(expensesList.filter(e => e.status === 'revision_requested').length);
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

  const createExpense = async () => {
    try {
      if (!expenseForm.description || expenseForm.unit_price <= 0 || expenseForm.quantity <= 0) {
        toast.error("Veuillez remplir la description, la quantité et le prix unitaire");
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
      toast.error("Erreur lors de l'envoi du point");
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
    if (!newListItem.description || newListItem.unit_price <= 0 || newListItem.quantity <= 0) {
      toast.error("Veuillez remplir la description, la quantité et le prix unitaire");
      return;
    }
    const totalAmount = newListItem.quantity * newListItem.unit_price;
    setShoppingList([...shoppingList, { ...newListItem, amount: totalAmount, id: Date.now() }]);
    setNewListItem({ category: "cuisine", description: "", quantity: 1, unit_price: 0 });
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
      // Generate a unique group ID for this shopping list
      const groupId = `GRP-${Date.now()}`;
      const groupName = shoppingListSupplier ? `Liste - ${shoppingListSupplier}` : `Liste du ${format(new Date(), "dd/MM/yyyy HH:mm")}`;
      
      // Calculate total for the group
      const groupTotal = shoppingList.reduce((sum, item) => sum + item.amount, 0);
      
      // Create a single expense with all items as a group
      await axios.post(`${API}/expenses`, {
        category: shoppingList[0].category, // Use first item's category as main
        description: groupName,
        quantity: shoppingList.length,
        unit_price: groupTotal,
        amount: groupTotal,
        supplier: shoppingListSupplier,
        planned_date: shoppingListDate,
        requested_by: currentUser?.full_name || currentUser?.username || "Gérante",
        is_group: true,
        group_id: groupId,
        items: shoppingList.map(item => ({
          category: item.category,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          amount: item.amount
        }))
      });
      
      toast.success(`Liste d'achats créée avec ${shoppingList.length} article(s) !`);
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
            Bon d'Achat <span class="badge">✓ APPROUVÉ</span>
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

          <div class="amount-box">
            <div class="amount-label">MONTANT APPROUVÉ</div>
            <div class="amount-value">${formatPrice(expense.amount)} F CFA</div>
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
    const total = approved.reduce((sum, e) => sum + e.amount, 0);
    
    const categoryLabels = {
      cuisine: 'Cuisine',
      bar: 'Bar',
      paiement: 'Paiement',
      autres: 'Autres'
    };
    
    const itemsHtml = approved.map((expense, index) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${index + 1}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">
          <span style="background: ${expense.category === 'cuisine' ? '#22c55e' : expense.category === 'bar' ? '#f97316' : expense.category === 'paiement' ? '#3b82f6' : '#64748b'}; color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px;">
            ${categoryLabels[expense.category] || expense.category}
          </span>
        </td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${expense.description}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${expense.supplier || '-'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">${formatPrice(expense.amount)} F</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Liste des Achats Approuvés</title>
          <meta charset="UTF-8">
          <style>
            @page { size: A4; margin: 15mm; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 20px; background: #fff; color: #333; font-size: 10pt; }
            .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 10px; margin-bottom: 15px; }
            .logo { width: 80px; height: 80px; }
            .logo img { width: 100%; height: 100%; object-fit: contain; }
            .header-right { text-align: right; font-size: 9pt; }
            .doc-title { text-align: center; font-size: 14pt; font-weight: bold; margin: 10px 0; text-transform: uppercase; }
            .date-line { text-align: center; font-size: 10pt; color: #555; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 9pt; }
            thead tr { border-top: 2px solid #333; border-bottom: 2px solid #333; }
            th { padding: 8px; text-align: left; font-weight: bold; text-transform: uppercase; font-size: 8pt; }
            td { padding: 6px 8px; border-bottom: 1px solid #ddd; }
            .total-row { border-top: 2px solid #333; }
            .total-row td { font-weight: bold; padding: 10px 8px; }
            .footer { display: flex; justify-content: space-between; margin-top: 30px; }
            .signature-box { text-align: center; width: 30%; }
            .signature-line { border-bottom: 1px solid #333; height: 40px; margin-bottom: 5px; }
            .signature-label { font-size: 8pt; color: #666; }
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

  // Print all expenses (full list)
  const printAllExpensesList = () => {
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    const statusLabels = { pending: 'En attente', approved: 'Approuvée', completed: 'Terminée', revision_requested: 'À réviser', rejected: 'Refusée' };
    const categoryLabels = { cuisine: 'Cuisine', bar: 'Bar', paiement: 'Paiement', autres: 'Autres' };
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    
    const rowsHtml = expenses.map((e, i) => {
      const catColor = e.category === 'cuisine' ? '#22c55e' : e.category === 'bar' ? '#f97316' : e.category === 'paiement' ? '#3b82f6' : '#64748b';
      const statusColor = e.status === 'approved' ? '#22c55e' : e.status === 'pending' ? '#f59e0b' : e.status === 'completed' ? '#64748b' : '#ef4444';
      return '<tr style="border-bottom: 1px solid #eee;">' +
        '<td style="padding: 8px; text-align: center;">' + (i + 1) + '</td>' +
        '<td style="padding: 8px;"><span style="background: ' + catColor + '; color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px;">' + (categoryLabels[e.category] || e.category) + '</span></td>' +
        '<td style="padding: 8px;">' + e.description + '</td>' +
        '<td style="padding: 8px;">' + (e.supplier || '-') + '</td>' +
        '<td style="padding: 8px; text-align: right; font-weight: 600;">' + formatPrice(e.amount) + ' F</td>' +
        '<td style="padding: 8px;"><span style="background: ' + statusColor + '; color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px;">' + (statusLabels[e.status] || e.status) + '</span></td>' +
        '<td style="padding: 8px; font-size: 11px; color: #666;">' + (e.requested_by || '-') + '</td>' +
        '<td style="padding: 8px; font-size: 11px; color: #666;">' + (e.created_at?.slice(0, 10) || '-') + '</td>' +
        '</tr>';
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

  // Open expense for editing
  const openExpenseForEdit = (expense) => {
    setExpenseForm({
      category: expense.category,
      description: expense.description,
      quantity: expense.quantity || 1,
      unit_price: expense.unit_price || expense.amount || 0,
      amount: expense.amount,
      supplier: expense.supplier || "",
      planned_date: expense.planned_date || format(new Date(), "yyyy-MM-dd"),
      receipt_image: expense.receipt_image
    });
    setEditingExpense(expense);
    setShowExpenseModal(true);
  };

  // ============== WEEKLY REPORT FUNCTIONS ==============
  
  const fetchWeeklyReport = async () => {
    try {
      const res = await axios.get(`${API}/reports/weekly`, { params: { week_start: weekStartDate } });
      setWeeklyReport(res.data);
      
      // Check expense ratio for admin alert (> 40%)
      if (currentUser?.role === 'admin' && res.data) {
        const weeklyCA = res.data.sales?.total || 0;
        const weeklyExpenses = res.data.expenses?.total || 0;
        const totalPendingExpenses = expenses.filter(e => e.status === 'pending' || e.status === 'approved').reduce((sum, e) => sum + e.amount, 0);
        const totalExpenses = weeklyExpenses + totalPendingExpenses;
        
        if (weeklyCA > 0) {
          const ratio = (totalExpenses / weeklyCA) * 100;
          if (ratio > 40) {
            setExpenseRatioAlert({
              ratio: ratio.toFixed(1),
              expenses: totalExpenses,
              ca: weeklyCA,
              isOverLimit: true
            });
          } else {
            setExpenseRatioAlert({
              ratio: ratio.toFixed(1),
              expenses: totalExpenses,
              ca: weeklyCA,
              isOverLimit: false
            });
          }
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
      <title>Point Hebdomadaire - ${weeklyReport.week_label}</title>
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
          <div class="header-title">Point Hebdomadaire</div>
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
  
  const fetchActivityReport = async () => {
    try {
      const res = await axios.get(`${API}/reports/activity`, { 
        params: { period: activityPeriod, date: activityDate } 
      });
      setActivityReport(res.data);
    } catch (error) {
      console.error("Error fetching activity report:", error);
    }
  };

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
  }, [weekStartDate, activeTab, isAuthenticated]);

  // Check expense ratio when on Achats tab (admin only)
  useEffect(() => {
    if (isAuthenticated && activeTab === "achats" && currentUser?.role === 'admin') {
      fetchWeeklyReport(); // This will also calculate the ratio
    }
  }, [activeTab, isAuthenticated, currentUser, expenses]);

  // Fetch activity report when tab is active (admin only)
  useEffect(() => {
    if (isAuthenticated && activeTab === "activite" && currentUser?.role === 'admin') {
      fetchActivityReport();
    }
  }, [activityPeriod, activityDate, activeTab, isAuthenticated, currentUser]);

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
  const saveInvoice = async () => {
    if (currentBill.length === 0) {
      toast.error("Le bon est vide");
      return;
    }

    // If Mobile Money payment, show payment options modal
    if (paymentMethod === "mobile") {
      const invoiceData = {
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
        validation_status: "pending",
        table_number: activeTable?.table_number || null
      };
      setPendingInvoiceData(invoiceData);
      setShowMobilePaymentModal(true);
      return;
    }

    await createInvoice({
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
      validation_status: "pending",
      table_number: activeTable?.table_number || null
    });
  };

  const createInvoice = async (invoiceData) => {
    try {
      const response = await axios.post(`${API}/invoices`, invoiceData);
      
      // Update client stats if selected
      if (selectedClient) {
        await axios.put(`${API}/caisse/clients/${selectedClient.id}`, {
          total_spent: (selectedClient.total_spent || 0) + invoiceData.total,
          visit_count: (selectedClient.visit_count || 0) + 1
        });
      }
      
      toast.success("✓ Commande envoyée avec succès ! En attente de validation par la gérante.", {
        duration: 4000
      });
      
      // Mark the table as having an invoice but DON'T delete it (keep tracking)
      if (activeTableId) {
        // Update table status to "invoiced" and CLEAR items since they're now in the invoice
        try {
          await axios.put(`${API}/caisse/tables/${activeTableId}`, {
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
      toast.error("Erreur lors de l'enregistrement");
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

  const validateInvoice = async (invoiceId) => {
    try {
      const invoice = invoices.find(i => i.id === invoiceId);
      await axios.put(`${API}/invoices/${invoiceId}`, {
        validation_status: "validated",
        validated_by: currentUser?.full_name || currentUser?.username || "Gérante",
        validated_at: new Date().toISOString()
      });
      toast.success(`Bon ${invoice?.invoice_number || ''} transformé ! Le serveur ${invoice?.created_by || ''} va recevoir une notification.`);
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
      await axios.delete(`${API}/invoices/${invoiceId}`);
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
      await axios.put(`${API}/invoices/${invoiceId}`, {
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
      await axios.put(`${API}/invoices/${editingInvoice.id}/update-items`, {
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
            Validé par: ${invoice.validated_by || 'Gérante'}
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
      
      if (editProduct) {
        await axios.put(`${API}/caisse/products/${editProduct.id}`, {
          ...productForm,
          ...modifierInfo
        });
        toast.success("Produit modifié");
      } else {
        await axios.post(`${API}/caisse/products?modified_by=${encodeURIComponent(modifierInfo.modified_by)}&modified_by_role=${modifierInfo.modified_by_role}`, productForm);
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
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-800/90 border-b border-slate-700 sticky top-0 z-50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg flex items-center justify-center">
                <Receipt className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-amber-500">CAISSE PRO</h1>
                <p className="text-slate-400 text-xs">{format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}</p>
              </div>
              {/* Real-time sync indicator */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/30">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span className="text-green-400 text-xs font-medium">Sync auto</span>
              </div>
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

              {/* Revision Notifications for Manager (Achats à réviser) */}
              {currentUser?.role === 'manager' && revisionExpensesCount > 0 && (
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
                  onClick={() => setShowEndOfServiceModal(true)}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-sm"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Terminer Service
                </Button>
              )}
              
              <div className="text-right hidden md:block">
                <p className="text-white font-medium">{currentUser?.full_name || currentUser?.username}</p>
                <Badge className={
                  currentUser?.role === 'admin' ? 'bg-amber-500/20 text-amber-400' : 
                  currentUser?.role === 'manager' ? 'bg-blue-500/20 text-blue-400' : 
                  currentUser?.role === 'cuisinier' ? 'bg-green-500/20 text-green-400' :
                  currentUser?.role === 'coach_jeux' ? 'bg-purple-500/20 text-purple-400' :
                  'bg-slate-500/20 text-slate-400'
                }>
                  {currentUser?.role === 'admin' ? 'Administrateur' : 
                   currentUser?.role === 'manager' ? 'Manager' : 
                   currentUser?.role === 'cuisinier' ? 'Cuisinier' :
                   currentUser?.role === 'coach_jeux' ? 'Coach Jeux' :
                   'Serveur'}
                </Badge>
              </div>
              {/* Share QR Code Button */}
              <ShareButton onClick={() => setShowShareModal(true)} />
              <Button variant="ghost" onClick={handleLogout} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

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
          <TabsList className="bg-slate-800/50 border border-slate-700 mb-4 flex-wrap h-auto p-1">
            {/* Commande tab - visible for servers and manager */}
            {(currentUser?.role === 'server' || currentUser?.role === 'manager') && (
              <TabsTrigger value="commande" className="data-[state=active]:bg-amber-500 data-[state=active]:text-white">
                <Calculator className="w-4 h-4 mr-2" />Commande
              </TabsTrigger>
            )}
            <TabsTrigger value="bons" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">
              <Printer className="w-4 h-4 mr-2" />BONS
              {invoices.filter(i => i.validation_status === 'pending').length > 0 && (
                <Badge className="ml-1 bg-orange-600 text-white text-xs">{invoices.filter(i => i.validation_status === 'pending').length}</Badge>
              )}
            </TabsTrigger>
            {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
              <TabsTrigger value="tables" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white">
                <LayoutGrid className="w-4 h-4 mr-2" />Tables
              </TabsTrigger>
            )}
            <TabsTrigger value="invoices" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">
              <FileText className="w-4 h-4 mr-2" />Factures
            </TabsTrigger>
            {currentUser?.role !== 'manager' && (
            <TabsTrigger value="stats" className="data-[state=active]:bg-green-500 data-[state=active]:text-white">
              <BarChart3 className="w-4 h-4 mr-2" />Statistiques
            </TabsTrigger>
            )}
            <TabsTrigger value="products" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
              <Package className="w-4 h-4 mr-2" />Produits
            </TabsTrigger>
            <TabsTrigger value="clients" className="data-[state=active]:bg-pink-500 data-[state=active]:text-white">
              <Users className="w-4 h-4 mr-2" />Clients
            </TabsTrigger>
            {currentUser?.role === 'admin' && (
              <TabsTrigger value="users" className="data-[state=active]:bg-red-500 data-[state=active]:text-white">
                <Settings className="w-4 h-4 mr-2" />Utilisateurs
              </TabsTrigger>
            )}
            {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
              <TabsTrigger value="rapport" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white">
                <FileText className="w-4 h-4 mr-2" />Rapport
              </TabsTrigger>
            )}
            {currentUser?.role !== 'manager' && (
            <TabsTrigger value="historique" className="data-[state=active]:bg-slate-600 data-[state=active]:text-white">
              <Calendar className="w-4 h-4 mr-2" />Historique
            </TabsTrigger>
            )}
            {/* Server Daily Report - Only for servers */}
            {currentUser?.role === 'server' && (
              <TabsTrigger value="mon_point" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                <ClipboardList className="w-4 h-4 mr-2" />Mon Point
              </TabsTrigger>
            )}
            {/* Points des Serveurs - Only for manager */}
            {currentUser?.role === 'manager' && (
              <TabsTrigger value="points_serveurs" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                <ClipboardList className="w-4 h-4 mr-2" />Points Serveurs
              </TabsTrigger>
            )}
            {/* Manager: Achats/Dépenses */}
            {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
              <TabsTrigger value="achats" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                <ShoppingCart className="w-4 h-4 mr-2" />Achats
                {expenses.filter(e => e.status === 'pending' || e.status === 'revision_requested').length > 0 && (
                  <Badge className="ml-1 bg-purple-500 text-white text-xs">
                    {expenses.filter(e => e.status === 'pending' || e.status === 'revision_requested').length}
                  </Badge>
                )}
              </TabsTrigger>
            )}
            {/* Point Hebdomadaire */}
            {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
              <TabsTrigger value="hebdo" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white">
                <BarChart3 className="w-4 h-4 mr-2" />Hebdo
              </TabsTrigger>
            )}
            {/* Locations (Salle, Jardin, Jeux) - Manager & Admin */}
            {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
              <TabsTrigger value="locations" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                <Building2 className="w-4 h-4 mr-2" />Locations
              </TabsTrigger>
            )}
            {/* Factures Proforma - Manager & Admin */}
            {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
              <TabsTrigger value="proforma" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <FileText className="w-4 h-4 mr-2" />Proforma
              </TabsTrigger>
            )}
            {/* Instructions & Notes - Manager & Admin */}
            {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
              <TabsTrigger 
                value="instructions" 
                className="data-[state=active]:bg-teal-600 data-[state=active]:text-white"
                onClick={() => {
                  // Mark all notes as read when opening the tab
                  if (unreadNotesCount > 0) {
                    markAllNotesRead();
                  }
                }}
              >
                <MessageSquare className="w-4 h-4 mr-2" />Notes
                {unreadNotesCount > 0 && (
                  <Badge className="ml-1 bg-red-500 text-white text-xs animate-pulse">
                    {unreadNotesCount > 9 ? '9+' : unreadNotesCount}
                  </Badge>
                )}
              </TabsTrigger>
            )}
            {/* Abonnements & Factures Récurrentes - Manager & Admin */}
            {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
              <TabsTrigger value="subscriptions" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white">
                <RefreshCw className="w-4 h-4 mr-2" />Abonnements
              </TabsTrigger>
            )}
            {/* Admin only: Suivi Activité */}
            {currentUser?.role === 'admin' && (
              <TabsTrigger value="activite" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                <Activity className="w-4 h-4 mr-2" />Activité
              </TabsTrigger>
            )}
          </TabsList>

          {/* ==================== COMMANDE TAB (Creation only) ==================== */}
          <TabsContent value="commande">
            {/* ============== ADMIN VIEW: Priority on validations ============== */}
            {currentUser?.role === 'admin' ? (
              <div className="space-y-4">
                {/* ADMIN ONLY: Cancellation Requests */}
                {currentUser?.role === 'admin' && cancellationRequests.length > 0 && (
                  <Card className="bg-gradient-to-br from-red-900/30 to-orange-900/20 border-red-500/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-red-400 flex items-center gap-2">
                        <MessageCircle className="w-6 h-6" />
                        DEMANDES D'ANNULATION
                        <Badge className="bg-red-500/30 text-red-300 ml-2 text-lg px-3 animate-pulse">
                          {cancellationRequests.length}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {cancellationRequests.map(request => (
                        <div key={request.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-red-900/30 rounded-lg p-3 border border-red-500/30">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white font-bold">{request.invoice_number}</span>
                              <Badge className="bg-orange-500/20 text-orange-400 text-xs">Demande d'annulation</Badge>
                            </div>
                            <p className="text-slate-400 text-sm mt-1">
                              <strong>Demandé par:</strong> {request.requested_by}
                            </p>
                            <p className="text-red-300 text-sm">
                              <strong>Motif:</strong> {request.reason}
                            </p>
                            <p className="text-slate-500 text-xs mt-1">
                              {request.created_at && format(new Date(request.created_at), "dd/MM/yyyy HH:mm")}
                            </p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button 
                              size="sm"
                              onClick={() => approveCancellationRequest(request.id)}
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Approuver
                            </Button>
                            <Button 
                              size="sm"
                              variant="ghost"
                              onClick={() => rejectCancellationRequest(request.id)}
                              className="text-red-400 hover:bg-red-500/20"
                            >
                              <X className="w-4 h-4 mr-1" />
                              Rejeter
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* MANAGER: Modification Requests from Servers */}
                {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && modificationRequests.length > 0 && (
                  <Card className="bg-gradient-to-br from-blue-900/30 to-cyan-900/20 border-blue-500/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-blue-400 flex items-center gap-2">
                        <Edit2 className="w-6 h-6" />
                        DEMANDES DE MODIFICATION
                        <Badge className="bg-blue-500/30 text-blue-300 ml-2 text-lg px-3 animate-pulse">
                          {modificationRequests.length}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {modificationRequests.map(request => (
                        <div key={request.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-blue-900/30 rounded-lg p-3 border border-blue-500/30">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white font-bold">{request.invoice_number}</span>
                              <Badge className="bg-blue-500/20 text-blue-400 text-xs">Demande de modification</Badge>
                            </div>
                            <p className="text-slate-400 text-sm mt-1">
                              <strong>Demandé par:</strong> {request.requested_by}
                            </p>
                            <p className="text-blue-300 text-sm">
                              <strong>Motif:</strong> {request.reason}
                            </p>
                            <p className="text-slate-500 text-xs mt-1">
                              {request.created_at && format(new Date(request.created_at), "dd/MM/yyyy HH:mm")}
                            </p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button 
                              size="sm"
                              onClick={() => approveModificationRequest(request.id)}
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Autoriser
                            </Button>
                            <Button 
                              size="sm"
                              variant="ghost"
                              onClick={() => rejectModificationRequest(request.id)}
                              className="text-red-400 hover:bg-red-500/20"
                            >
                              <X className="w-4 h-4 mr-1" />
                              Refuser
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Priority Section: Invoices to Print */}
                <Card className="bg-gradient-to-br from-green-900/30 to-emerald-900/20 border-green-500/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-green-400 flex items-center gap-2">
                      <Printer className="w-6 h-6" />
                      FACTURES À IMPRIMER
                      <Badge className="bg-green-500/30 text-green-300 ml-2 text-lg px-3">
                        {invoices.filter(i => i.validation_status === 'validated').length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {invoices.filter(i => i.validation_status === 'validated').length === 0 ? (
                      <p className="text-slate-400 text-center py-4">Aucune facture validé à imprimer</p>
                    ) : (
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {invoices.filter(i => i.validation_status === 'validated').map(invoice => (
                          <div key={invoice.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-green-900/30 rounded-lg p-3 border border-green-500/30">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-white font-bold">{invoice.invoice_number}</span>
                                <Badge className="bg-green-500/30 text-green-300 text-xs">✓ Validée</Badge>
                              </div>
                              <p className="text-slate-400 text-sm">
                                {invoice.customer_name} • <span className="text-green-400 font-bold">{formatPrice(invoice.total)} F</span>
                              </p>
                              <p className="text-slate-500 text-xs">
                                Par: {invoice.created_by} • Validée par: {invoice.validated_by}
                              </p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              {/* Print button - Manager/Admin only */}
                              {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
                                <Button 
                                  onClick={() => printTicket(invoice)} 
                                  className="bg-green-600 hover:bg-green-700 text-white"
                                  size="sm"
                                >
                                  <Printer className="w-4 h-4 mr-2" />
                                  IMPRIMER
                                </Button>
                              )}
                              {/* Admin can cancel directly, Manager can request cancellation */}
                              {currentUser?.role === 'admin' ? (
                                <Button 
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => cancelValidatedInvoice(invoice.id)}
                                  className="text-red-400 hover:text-red-300 hover:bg-red-500/20"
                                  title="Annuler cette facture"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              ) : currentUser?.role === 'manager' && (
                                <Button 
                                  size="sm"
                                  variant="outline"
                                  onClick={() => requestCancellation(invoice)}
                                  className="border-orange-500/50 text-orange-400 hover:bg-orange-500/20"
                                  title="Demander l'annulation à l'admin"
                                  disabled={cancellationRequests.some(r => r.invoice_id === invoice.id)}
                                >
                                  {cancellationRequests.some(r => r.invoice_id === invoice.id) ? (
                                    <span className="text-xs">Demande envoyée</span>
                                  ) : (
                                    <>
                                      <MessageCircle className="w-4 h-4 mr-1" />
                                      <span className="text-xs">Demander</span>
                                    </>
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Collapsible: Create Invoice (Secondary for managers) */}
                <details className="bg-slate-800/30 rounded-lg border border-slate-700">
                  <summary className="p-4 cursor-pointer text-slate-400 hover:text-white flex items-center gap-2">
                    <Plus className="w-5 h-5" />
                    <span>Créer une facture (optionnel)</span>
                  </summary>
                  <div className="p-4 pt-0">
                    {/* Multi-Table Bar */}
                    <div className="mb-4 bg-slate-800/70 rounded-lg border border-slate-700 p-2">
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        <span className="text-slate-400 text-sm font-medium px-2 whitespace-nowrap">Tables:</span>
                        
                        {openTables.map(table => (
                          <div
                            key={table.id}
                            className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer transition-all whitespace-nowrap ${
                              activeTableId === table.id
                                ? 'bg-amber-500 text-white shadow-lg'
                                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'
                            }`}
                            onClick={() => selectTable(table)}
                          >
                            <span className="font-bold">T{table.table_number}</span>
                            {table.items?.length > 0 && (
                              <Badge className={`ml-1 ${activeTableId === table.id ? 'bg-white/20 text-white' : 'bg-amber-500/20 text-amber-400'}`}>
                                {table.items.length}
                              </Badge>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (table.items?.length > 0) {
                                  if (confirm(`Fermer la Table ${table.table_number} ?`)) {
                                    closeTable(table.id);
                                  }
                                } else {
                                  closeTable(table.id);
                                }
                              }}
                              className={`ml-1 p-0.5 rounded hover:bg-red-500/30 ${activeTableId === table.id ? 'text-white/70 hover:text-white' : 'text-slate-500 hover:text-red-400'}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowNewTableModal(true)}
                          className="border-dashed border-slate-600 text-slate-400 hover:text-white hover:border-amber-500 whitespace-nowrap"
                          disabled={availableTableNumbers.length === 0}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Nouvelle Table
                        </Button>
                      </div>
                    </div>

                    {/* Compact product grid for managers */}
                    {activeTableId && (
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="lg:col-span-2">
                          <div className="flex gap-2 flex-wrap mb-2">
                            {Object.entries(DEPARTMENT_CONFIG).map(([key, config]) => {
                              const Icon = config.icon;
                              return (
                                <Button
                                  key={key}
                                  variant={activeDepartment === key ? "default" : "ghost"}
                                  size="sm"
                                  onClick={() => setActiveDepartment(key)}
                                  className={activeDepartment === key ? "bg-amber-500 text-white" : "text-slate-400"}
                                >
                                  <Icon className="w-4 h-4 mr-1" />
                                  {config.label}
                                </Button>
                              );
                            })}
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1">
                            {(catalog[activeDepartment] || []).slice(0, 8).map((item) => (
                              <button
                                key={`${activeDepartment}-${item.id}`}
                                onClick={() => addToBill(item, activeDepartment)}
                                className="p-2 rounded bg-slate-700/50 hover:bg-slate-600/50 text-left text-xs"
                              >
                                <p className="text-slate-300 truncate">{item.name}</p>
                                <p className="text-amber-400 font-bold">{formatPrice(item.price)} F</p>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <Card className="bg-slate-800/50 border-amber-500/30">
                            <CardHeader className="py-2">
                              <CardTitle className="text-amber-500 text-sm">Table {activeTable?.table_number}</CardTitle>
                            </CardHeader>
                            <CardContent className="py-2">
                              {currentBill.length === 0 ? (
                                <p className="text-slate-500 text-xs">Aucun article</p>
                              ) : (
                                <>
                                  {currentBill.map((item, idx) => (
                                    <div key={idx} className="flex justify-between text-xs py-1">
                                      <span className="text-slate-300">{item.quantity}x {item.name}</span>
                                      <span className="text-amber-400">{formatPrice(item.price * item.quantity)}</span>
                                    </div>
                                  ))}
                                  <div className="border-t border-slate-700 mt-2 pt-2 flex justify-between font-bold">
                                    <span className="text-white">TOTAL</span>
                                    <span className="text-amber-500">{formatPrice(total)} F</span>
                                  </div>
                                  <Button onClick={saveInvoice} className="w-full mt-2 bg-amber-500 hover:bg-amber-600" size="sm">
                                    CRÉER FACTURE
                                  </Button>
                                </>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            ) : (
              /* ============== SERVER VIEW: Focus on creating invoices ============== */
              <>
            {/* Multi-Table Bar */}
            <div className="mb-4 bg-slate-800/70 rounded-lg border border-slate-700 p-2">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <span className="text-slate-400 text-sm font-medium px-2 whitespace-nowrap">Tables:</span>
                
                {openTables.map(table => (
                  <div
                    key={table.id}
                    className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer transition-all whitespace-nowrap ${
                      activeTableId === table.id
                        ? 'bg-amber-500 text-white shadow-lg'
                        : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'
                    }`}
                    onClick={() => selectTable(table)}
                  >
                    <span className="font-bold">T{table.table_number}</span>
                    {table.items?.length > 0 && (
                      <Badge className={`ml-1 ${activeTableId === table.id ? 'bg-white/20 text-white' : 'bg-amber-500/20 text-amber-400'}`}>
                        {table.items.length}
                      </Badge>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (table.items?.length > 0) {
                          if (confirm(`Fermer la Table ${table.table_number} ? Les articles non facturés seront perdus.`)) {
                            closeTable(table.id);
                          }
                        } else {
                          closeTable(table.id);
                        }
                      }}
                      className={`ml-1 p-0.5 rounded hover:bg-red-500/30 ${activeTableId === table.id ? 'text-white/70 hover:text-white' : 'text-slate-500 hover:text-red-400'}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                
                {/* New Table Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowNewTableModal(true)}
                  className="border-dashed border-slate-600 text-slate-400 hover:text-white hover:border-amber-500 whitespace-nowrap"
                  disabled={availableTableNumbers.length === 0}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Nouvelle Table
                </Button>
                
                {openTables.length === 0 && (
                  <span className="text-slate-500 text-sm italic">Aucune table ouverte - Cliquez sur "Nouvelle Table" pour commencer</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Left: Products */}
              <div className="lg:col-span-2 space-y-4">
                {/* Search bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Rechercher un produit... (ex: poulet, pizza, bière)"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="pl-10 bg-slate-800/50 border-slate-700 text-white h-12 text-lg"
                    disabled={!activeTableId}
                  />
                  {productSearch && (
                    <button 
                      onClick={() => setProductSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>

                {/* Search Results */}
                {productSearch.length >= 2 && activeTableId && (
                  <Card className="bg-amber-500/10 border-amber-500/30">
                    <CardHeader className="py-2 px-4">
                      <CardTitle className="text-amber-400 text-sm flex items-center gap-2">
                        <Search className="w-4 h-4" />
                        Résultats pour "{productSearch}"
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-2">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[200px] overflow-y-auto">
                        {(() => {
                          const searchLower = productSearch.toLowerCase();
                          const results = [];
                          Object.entries(catalog).forEach(([dept, items]) => {
                            (items || []).forEach(item => {
                              if (item.name.toLowerCase().includes(searchLower) || 
                                  (item.category && item.category.toLowerCase().includes(searchLower))) {
                                results.push({ ...item, department: dept });
                              }
                            });
                          });
                          if (results.length === 0) {
                            return <p className="col-span-full text-slate-400 text-center py-4">Aucun résultat</p>;
                          }
                          return results.slice(0, 12).map((item, idx) => {
                            const config = DEPARTMENT_CONFIG[item.department] || DEPARTMENT_CONFIG.autres;
                            return (
                              <button
                                key={`search-${idx}`}
                                onClick={() => {
                                  addToBill(item, item.department);
                                  setProductSearch("");
                                }}
                                className={`p-2 rounded-lg ${config.bgColor} border ${config.borderColor} hover:scale-[1.02] transition-all text-left`}
                              >
                                <p className={`font-semibold text-xs ${config.color}`}>{item.name}</p>
                                <p className="text-white font-bold text-sm">{formatPrice(item.price)} F</p>
                                <p className="text-slate-500 text-xs">{config.label}</p>
                              </button>
                            );
                          });
                        })()}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Department tabs */}
                <div className="flex gap-2 flex-wrap bg-slate-800/50 p-2 rounded-lg border border-slate-700">
                  {Object.entries(DEPARTMENT_CONFIG).map(([key, config]) => {
                    const Icon = config.icon;
                    return (
                      <Button
                        key={key}
                        variant={activeDepartment === key ? "default" : "ghost"}
                        onClick={() => { setActiveDepartment(key); setProductSearch(""); }}
                        className={activeDepartment === key 
                          ? `bg-gradient-to-r ${key === 'jeux' ? 'from-blue-500 to-blue-600' : key === 'bar' ? 'from-orange-500 to-orange-600' : key === 'accompagnements' ? 'from-yellow-500 to-yellow-600' : 'from-green-500 to-green-600'} text-white` 
                          : "text-slate-300 hover:text-white"
                        }
                        disabled={!activeTableId}
                      >
                        <Icon className="w-4 h-4 mr-2" />
                        {config.label}
                      </Button>
                    );
                  })}
                </div>

                {/* Products grid */}
                {activeTableId ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {(catalog[activeDepartment] || []).map((item) => {
                      const config = DEPARTMENT_CONFIG[activeDepartment];
                      return (
                        <button
                          key={`${activeDepartment}-${item.id}`}
                          onClick={() => addToBill(item, activeDepartment)}
                          className={`p-3 rounded-lg ${config.bgColor} border ${config.borderColor} hover:scale-[1.02] transition-all text-left`}
                        >
                          <p className={`font-semibold text-sm ${config.color}`}>{item.name}</p>
                          <p className="text-white font-bold">{formatPrice(item.price)} F</p>
                          <p className="text-slate-500 text-xs">/{item.unit}</p>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <Card className="bg-slate-800/30 border-slate-700 border-dashed">
                    <CardContent className="py-12 text-center">
                      <Calculator className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                      <p className="text-slate-400 mb-4">Sélectionnez ou créez une table pour commencer</p>
                      <Button onClick={() => setShowNewTableModal(true)} className="bg-amber-500 hover:bg-amber-600">
                        <Plus className="w-4 h-4 mr-2" />
                        Ouvrir une Table
                      </Button>
                    </CardContent>
                  </Card>
                )}
                
                {/* Custom item form for "Autres" department - Manager/Admin only */}
                {activeDepartment === "autres" && activeTableId && (currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
                  <Card className="mt-4 bg-slate-700/30 border-slate-600">
                    <CardContent className="p-4">
                      <h4 className="text-slate-300 font-semibold mb-3">Saisie manuelle</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-slate-400 text-xs">Nom du produit</Label>
                          <Input
                            value={customItem.name}
                            onChange={(e) => setCustomItem({ ...customItem, name: e.target.value })}
                            placeholder="Ex: Service spécial"
                            className="bg-slate-800 border-slate-600 text-white mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-slate-400 text-xs">Prix (FCFA)</Label>
                          <Input
                            type="number"
                            value={customItem.price || ""}
                            onChange={(e) => setCustomItem({ ...customItem, price: parseInt(e.target.value) || 0 })}
                            placeholder="0"
                            className="bg-slate-800 border-slate-600 text-white mt-1"
                          />
                        </div>
                      </div>
                      <Button 
                        onClick={addCustomItem} 
                        className="w-full mt-3 bg-slate-600 hover:bg-slate-500"
                        disabled={!customItem.name || customItem.price <= 0}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Ajouter à la facture
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Right: Current Bill - Fixed on desktop */}
              <div className="lg:col-span-1">
                <div className="lg:sticky lg:top-20 space-y-4">
                  <Card className="bg-slate-800/50 border-amber-500/30">
                    <CardHeader className="border-b border-slate-700 py-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-amber-500 flex items-center gap-2 text-lg">
                          <Receipt className="w-5 h-5" />
                          {activeTable ? `Table ${activeTable.table_number}` : 'Facture'}
                        </CardTitle>
                        {currentBill.length > 0 && (
                          <Button variant="ghost" size="sm" onClick={clearBill} className="text-red-400 hover:text-red-300">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      
                      {/* Client selector */}
                      <Select 
                        value={selectedClient?.id || "anonymous"} 
                        onValueChange={(v) => setSelectedClient(v === "anonymous" ? null : clients.find(c => c.id === v) || null)}
                        disabled={!activeTableId}
                      >
                        <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white mt-2">
                          <SelectValue placeholder="Sélectionner un client (optionnel)" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          <SelectItem value="anonymous" className="text-white">Client anonyme</SelectItem>
                          {clients.map(client => (
                            <SelectItem key={client.id} value={client.id} className="text-white">
                              {client.name} {client.phone && `(${client.phone})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </CardHeader>
                  
                  <CardContent className="p-3">
                    {!activeTableId ? (
                      <p className="text-slate-500 text-center py-8">Ouvrez une table pour commencer</p>
                    ) : currentBill.length === 0 ? (
                      <p className="text-slate-500 text-center py-8">Aucun article</p>
                    ) : (
                      <div className="space-y-2 max-h-[250px] overflow-y-auto">
                        {currentBill.map((item, index) => {
                          const config = DEPARTMENT_CONFIG[item.department];
                          return (
                            <div key={index} className="flex items-center justify-between bg-slate-700/30 rounded-lg p-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-medium truncate">{item.name}</p>
                                <p className={`text-xs ${config.color}`}>{config.label}</p>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button size="icon" variant="ghost" onClick={() => updateQuantity(index, -1)} className="w-6 h-6 text-slate-400">
                                  <Minus className="w-3 h-3" />
                                </Button>
                                <span className="text-white w-6 text-center text-sm">{item.quantity}</span>
                                <Button size="icon" variant="ghost" onClick={() => updateQuantity(index, 1)} className="w-6 h-6 text-slate-400">
                                  <Plus className="w-3 h-3" />
                                </Button>
                                <span className="text-amber-400 font-bold text-sm w-14 text-right">
                                  {formatPrice(item.price * item.quantity)}
                                </span>
                                <Button size="icon" variant="ghost" onClick={() => removeItem(index)} className="w-6 h-6 text-red-400">
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {currentBill.length > 0 && (
                      <>
                        {/* Free Accompaniment Button */}
                        <Button
                          onClick={() => setShowFreeAccompModal(true)}
                          variant="outline"
                          size="sm"
                          className="w-full mt-2 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/20"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Accomp. Gratuit
                        </Button>
                        
                        {/* Totals by department */}
                        <div className="mt-3 pt-3 border-t border-slate-700 space-y-1">
                          {Object.entries(totalByDepartment).map(([dept, amount]) => {
                            if (amount === 0) return null;
                            const config = DEPARTMENT_CONFIG[dept];
                            return (
                              <div key={dept} className="flex justify-between text-xs">
                                <span className={config.color}>{config.label}</span>
                                <span className="text-white">{formatPrice(amount)} F</span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Discount & Payment */}
                        <div className="mt-3 pt-3 border-t border-slate-700 space-y-3">
                          <div className="flex items-center gap-2">
                            <Label className="text-slate-400 text-xs">Remise %</Label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={discount}
                              onChange={(e) => setDiscount(parseInt(e.target.value) || 0)}
                              className="w-16 bg-slate-700/50 border-slate-600 text-white text-sm h-8"
                            />
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-400">Sous-total</span>
                              <span className="text-white">{formatPrice(subtotal)} F</span>
                            </div>
                            {discount > 0 && (
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Remise ({discount}%)</span>
                                <span className="text-green-400">-{formatPrice(discountAmount)} F</span>
                              </div>
                            )}
                            <div className="flex justify-between text-lg font-bold pt-2 border-t border-slate-700">
                              <span className="text-white">TOTAL</span>
                              <span className="text-amber-500">{formatPrice(total)} FCFA</span>
                            </div>
                          </div>

                          {/* Payment method */}
                          <div className="grid grid-cols-2 gap-1">
                            {PAYMENT_METHODS.map(method => {
                              const Icon = method.icon;
                              return (
                                <Button
                                  key={method.value}
                                  variant={paymentMethod === method.value ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => setPaymentMethod(method.value)}
                                  className={paymentMethod === method.value ? "bg-amber-500 text-white" : "border-slate-600 text-slate-300"}
                                >
                                  <Icon className="w-3 h-3 mr-1" />
                                  {method.label}
                                </Button>
                              );
                            })}
                          </div>

                          {/* Actions */}
                          <div className="pt-2">
                            <Button onClick={saveInvoice} className="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-white font-bold py-6 text-lg">
                              <Send className="w-5 h-5 mr-2" />
                              ENVOYER LA COMMANDE
                            </Button>
                            <p className="text-slate-500 text-xs text-center mt-2">
                              La commande sera envoyée à la gérante pour validation
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* ============== FACTURES À IMPRIMER (Validated invoices) - Admin/Manager only ============== */}
                {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && 
                  invoices.filter(i => i.validation_status === 'validated').length > 0 && (
                  <Card className="bg-gradient-to-br from-green-900/30 to-green-800/20 border-green-500/50 mt-4">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-green-400 flex items-center gap-2 text-base">
                        <Printer className="w-5 h-5" />
                        FACTURES À IMPRIMER
                        <Badge className="bg-green-500/30 text-green-300 ml-2">
                          {invoices.filter(i => i.validation_status === 'validated').length}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 max-h-[250px] overflow-y-auto">
                      {invoices.filter(i => i.validation_status === 'validated').slice(0, 5).map(invoice => (
                        <div key={invoice.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-green-900/30 rounded-lg p-3 border border-green-500/30">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white font-bold text-sm">{invoice.invoice_number}</span>
                              <Badge className="bg-green-500/30 text-green-300 text-xs">✓ Validée</Badge>
                            </div>
                            <p className="text-slate-400 text-xs mt-1 truncate">
                              {invoice.customer_name} • {formatPrice(invoice.total)} FCFA
                            </p>
                          </div>
                          <Button 
                            onClick={() => printTicket(invoice)} 
                            className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto shrink-0"
                            size="sm"
                          >
                            <Printer className="w-4 h-4 mr-2" />
                            IMPRIMER
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* ============== FACTURES DÉFINITIVES DU JOUR (Server view - read only) ============== */}
                {currentUser?.role === 'server' && 
                  invoices.filter(i => i.validation_status === 'validated').length > 0 && (
                  <Card className="bg-gradient-to-br from-slate-800/50 to-slate-700/30 border-slate-600/50 mt-4">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-slate-300 flex items-center gap-2 text-base">
                        <FileText className="w-5 h-5" />
                        FACTURES DÉFINITIVES DU JOUR
                        <Badge className="bg-slate-600/50 text-slate-300 ml-2">
                          {invoices.filter(i => i.validation_status === 'validated').length}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
                      {invoices.filter(i => i.validation_status === 'validated').map(invoice => (
                        <div key={invoice.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-700/30 rounded-lg p-3 border border-slate-600/30">
                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setViewInvoice(invoice)}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white font-bold text-sm">{invoice.invoice_number}</span>
                              <Badge className="bg-green-500/30 text-green-300 text-xs">✓ Définitive</Badge>
                              {invoice.table_number && (
                                <Badge className="bg-amber-500/20 text-amber-400 text-xs">Table {invoice.table_number}</Badge>
                              )}
                            </div>
                            <p className="text-slate-400 text-xs mt-1">
                              {invoice.customer_name} • <span className="text-amber-400 font-semibold">{formatPrice(invoice.total)} F</span>
                            </p>
                            <p className="text-slate-500 text-xs">
                              Serveur: {invoice.created_by} • Validé par: {invoice.validated_by}
                            </p>
                          </div>
                          <Button 
                            variant="outline"
                            onClick={() => setViewInvoice(invoice)} 
                            className="border-slate-600 text-slate-300 hover:bg-slate-700 w-full sm:w-auto shrink-0"
                            size="sm"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Voir
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                </div>
              </div>
            </div>
              </>
            )}
          </TabsContent>

          {/* ==================== BONS DE COMMANDE TAB ==================== */}
          <TabsContent value="bons">
            {/* Sub-tabs for Factures and Monsieur */}
            <Tabs defaultValue="bons-factures" className="w-full">
              <TabsList className="bg-slate-800/50 border-b border-slate-700 w-full justify-start mb-4">
                <TabsTrigger 
                  value="bons-factures" 
                  className="data-[state=active]:bg-orange-500 data-[state=active]:text-white"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Factures
                  {invoices.filter(i => i.validation_status === 'pending').length > 0 && (
                    <Badge className="ml-1 bg-orange-600 text-white text-xs">
                      {invoices.filter(i => i.validation_status === 'pending').length}
                    </Badge>
                  )}
                </TabsTrigger>
                {currentUser?.role === 'manager' && (
                  <TabsTrigger 
                    value="bons-monsieur" 
                    className="data-[state=active]:bg-purple-500 data-[state=active]:text-white"
                  >
                    <UserCircle className="w-4 h-4 mr-2" />
                    Monsieur
                  </TabsTrigger>
                )}
              </TabsList>

              {/* Factures Sub-tab */}
              <TabsContent value="bons-factures">
            <div className="space-y-4">
              {/* Header with date filter */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-xl font-bold text-orange-400 flex items-center gap-2">
                  <Printer className="w-6 h-6" />
                  Factures
                  <Badge className="bg-orange-500/20 text-orange-300 text-lg px-3">
                    {invoices.filter(i => i.validation_status === 'pending').length}
                  </Badge>
                </h2>
                <Input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="bg-slate-800/50 border-slate-700 text-white w-auto"
                />
              </div>

              {/* ADMIN: Cancellation Requests */}
              {currentUser?.role === 'admin' && cancellationRequests.length > 0 && (
                <Card className="bg-gradient-to-br from-red-900/30 to-orange-900/20 border-red-500/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-red-400 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      DEMANDES D'ANNULATION
                      <Badge className="bg-red-500/30 text-red-300 ml-2">{cancellationRequests.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {cancellationRequests.map(req => (
                      <div key={req.id} className="flex items-center justify-between gap-2 bg-red-900/20 rounded-lg p-3 border border-red-500/30">
                        <div className="flex-1">
                          <p className="text-white font-medium">{req.invoice_number}</p>
                          <p className="text-slate-400 text-sm">Demandé par: {req.requested_by} • Motif: {req.reason}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => approveCancellationRequest(req.id)} className="bg-red-600 hover:bg-red-700">
                            <CheckCircle className="w-4 h-4 mr-1" />Annuler Facture
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => rejectCancellationRequest(req.id)} className="border-slate-600 text-slate-400">
                            Refuser
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* MANAGER/ADMIN: Modification Requests */}
              {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && modificationRequests.length > 0 && (
                <Card className="bg-gradient-to-br from-blue-900/30 to-indigo-900/20 border-blue-500/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-blue-400 flex items-center gap-2">
                      <Edit2 className="w-5 h-5" />
                      DEMANDES DE MODIFICATION
                      <Badge className="bg-blue-500/30 text-blue-300 ml-2">{modificationRequests.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {modificationRequests.map(req => (
                      <div key={req.id} className="flex items-center justify-between gap-2 bg-blue-900/20 rounded-lg p-3 border border-blue-500/30">
                        <div className="flex-1">
                          <p className="text-white font-medium">{req.invoice_number}</p>
                          <p className="text-slate-400 text-sm">Demandé par: {req.requested_by} • Motif: {req.reason}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => approveModificationRequest(req.id)} className="bg-blue-600 hover:bg-blue-700">
                            <CheckCircle className="w-4 h-4 mr-1" />Autoriser
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => rejectModificationRequest(req.id)} className="border-slate-600 text-slate-400">
                            Refuser
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* All pending invoices */}
              {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
                <div className="mb-4 p-3 bg-orange-900/20 border border-orange-500/30 rounded-lg">
                  <p className="text-orange-300 text-sm flex items-center gap-2">
                    <Printer className="w-4 h-4" />
                    <span><strong>Workflow:</strong> 1. Imprimer les bons (Cuisine/Bar/Jeux) → 2. Cliquer sur "Bon-Client" pour transformer le bon en facture définitive</span>
                  </p>
                </div>
              )}
              {invoices.filter(i => i.validation_status === 'pending' && 
                (currentUser?.role !== 'server' || i.created_by === (currentUser?.full_name || currentUser?.username))
              ).length === 0 ? (
                <Card className="bg-slate-800/30 border-slate-700">
                  <CardContent className="py-12 text-center">
                    <Printer className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-500">Aucun facture en attente</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {invoices.filter(i => i.validation_status === 'pending' && 
                    (currentUser?.role !== 'server' || i.created_by === (currentUser?.full_name || currentUser?.username))
                  ).map(invoice => (
                    <Card key={invoice.id} className="bg-gradient-to-br from-orange-900/20 to-amber-800/10 border-orange-500/30">
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex-1 cursor-pointer min-w-0" onClick={() => setViewInvoice(invoice)}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white font-bold text-lg">{invoice.invoice_number}</span>
                              {invoice.table_number && (
                                <Badge className="bg-amber-500/30 text-amber-300">Table {invoice.table_number}</Badge>
                              )}
                              {invoice.modification_allowed && (
                                <Badge className="bg-green-500/20 text-green-400 text-xs">✓ Modif. autorisée</Badge>
                              )}
                            </div>
                            <p className="text-slate-400 text-sm">
                              {invoice.customer_name} • <span className="text-amber-400 font-bold">{formatPrice(invoice.total)} F</span>
                            </p>
                            <p className="text-slate-500 text-xs">
                              Par: {invoice.created_by} • {new Date(invoice.created_at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}
                            </p>
                            {/* Show items preview */}
                            <div className="flex flex-wrap gap-1 mt-2">
                              {invoice.items?.slice(0, 4).map((item, idx) => (
                                <span key={idx} className="text-xs bg-slate-700/50 text-slate-300 px-2 py-0.5 rounded">
                                  {item.quantity}x {item.name}
                                </span>
                              ))}
                              {invoice.items?.length > 4 && (
                                <span className="text-xs text-slate-500">+{invoice.items.length - 4} autres</span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0 flex-wrap">
                            {/* Print buttons - Manager/Admin only */}
                            {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
                              <>
                                <Button 
                                  size="sm"
                                  variant="outline"
                                  onClick={() => printKitchenOrder(invoice)}
                                  className="border-green-500/50 text-green-400 hover:bg-green-500/20"
                                  title="Cuisine"
                                >
                                  <Printer className="w-4 h-4 mr-1" />
                                  <span className="hidden sm:inline">Cuisine</span>
                                </Button>
                                <Button 
                                  size="sm"
                                  variant="outline"
                                  onClick={() => printBarOrder(invoice)}
                                  className="border-orange-500/50 text-orange-400 hover:bg-orange-500/20"
                                  title="Bar"
                                >
                                  <Wine className="w-4 h-4 mr-1" />
                                  <span className="hidden sm:inline">Bar</span>
                                </Button>
                                <Button 
                                  size="sm"
                                  variant="outline"
                                  onClick={() => printGamesOrder(invoice)}
                                  className="border-blue-500/50 text-blue-400 hover:bg-blue-500/20"
                                  title="Jeux"
                                >
                                  <Gamepad2 className="w-4 h-4 mr-1" />
                                  <span className="hidden sm:inline">Jeux</span>
                                </Button>
                              </>
                            )}
                            <Button 
                              size="sm"
                              variant="ghost"
                              onClick={() => setViewInvoice(invoice)}
                              className="text-slate-400 hover:text-white"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {/* Server: request or edit */}
                            {currentUser?.role === 'server' && invoice.created_by === (currentUser?.full_name || currentUser?.username) && (
                              invoice.modification_allowed ? (
                                <Button 
                                  size="sm"
                                  onClick={() => startEditingInvoice(invoice)}
                                  className="bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                  <Edit2 className="w-4 h-4 mr-1" />
                                  Modifier
                                </Button>
                              ) : (
                                <Button 
                                  size="sm"
                                  variant="outline"
                                  onClick={() => requestModification(invoice)}
                                  className="border-blue-500/50 text-blue-400 hover:bg-blue-500/20"
                                  disabled={modificationRequests.some(r => r.invoice_id === invoice.id)}
                                >
                                  {modificationRequests.some(r => r.invoice_id === invoice.id) ? (
                                    <span className="text-xs">Envoyé</span>
                                  ) : (
                                    <span className="text-xs">Demander modif.</span>
                                  )}
                                </Button>
                              )
                            )}
                            {/* Manager/Admin: Transform to Invoice */}
                            {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
                              <>
                                <Button 
                                  size="sm"
                                  onClick={() => validateInvoice(invoice.id)}
                                  className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white"
                                >
                                  <FileText className="w-4 h-4 mr-1" />
                                  Bon-Client
                                </Button>
                                <Button 
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => deleteInvoice(invoice.id)}
                                  className="text-red-400 hover:text-red-300"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </>
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

              {/* Monsieur Sub-tab - Manager only */}
              {currentUser?.role === 'manager' && (
                <TabsContent value="bons-monsieur">
                  <MonsieurTab 
                    currentUser={currentUser}
                    formatPrice={formatPrice}
                    products={products}
                  />
                </TabsContent>
              )}
            </Tabs>
          </TabsContent>

          {/* ==================== INVOICES TAB ==================== */}
          <TabsContent value="invoices">
            <div className="space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-slate-400" />
                  <Input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="bg-slate-800/50 border-slate-700 text-white w-auto"
                  />
                </div>
                <Select value={filterValidation} onValueChange={setFilterValidation}>
                  <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="all" className="text-white">Toutes</SelectItem>
                    <SelectItem value="pending" className="text-yellow-400">En attente</SelectItem>
                    <SelectItem value="validated" className="text-green-400">Validées</SelectItem>
                    <SelectItem value="cancelled" className="text-red-400">Annulées</SelectItem>
                  </SelectContent>
                </Select>
                <Badge className="bg-blue-500/20 text-blue-400">
                  {invoices.filter(i => filterValidation === 'all' || i.validation_status === filterValidation).length} facture(s)
                </Badge>
                {stats && (
                  <Badge className="bg-amber-500/20 text-amber-400">
                    CA: {formatPrice(stats.total_revenue)} F
                  </Badge>
                )}
              </div>

              {invoices.filter(i => filterValidation === 'all' || i.validation_status === filterValidation).length === 0 ? (
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardContent className="py-12 text-center">
                    <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">Aucune facture pour cette date</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {invoices.filter(i => filterValidation === 'all' || i.validation_status === filterValidation).map((invoice) => (
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
            <div className="space-y-4">
              {/* Month selector - full width on mobile */}
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-slate-400 hidden sm:block" />
                <Input
                  type="month"
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className="bg-slate-800/50 border-slate-700 text-white w-full sm:w-auto"
                />
              </div>

              {monthlyStats && (
                <>
                  {/* Main revenue card - prominent on mobile */}
                  <Card className="bg-gradient-to-br from-amber-500/20 to-amber-600/10 border-amber-500/30">
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-slate-400 text-sm">Chiffre d'affaires du mois</p>
                          <p className="text-2xl sm:text-3xl font-bold text-amber-500">{formatPrice(monthlyStats.total_revenue)} F</p>
                        </div>
                        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-amber-500/20 rounded-full flex items-center justify-center">
                          <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500" />
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-amber-500/20">
                        <p className="text-slate-400 text-xs">
                          {monthlyStats.validated_invoices} factures validées sur {monthlyStats.total_invoices} total
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Department breakdown - 2 columns on mobile, 5 on desktop */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                    <Card className="bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/30">
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <TreePine className="w-4 h-4 sm:w-5 sm:h-5 text-green-400" />
                          <p className="text-slate-400 text-xs">Salle & Jardin</p>
                        </div>
                        <p className="text-base sm:text-lg font-bold text-green-400">{formatPrice(monthlyStats.by_department?.salle_jardin || 0)} F</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/30">
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Gamepad2 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
                          <p className="text-slate-400 text-xs">Jeux</p>
                        </div>
                        <p className="text-base sm:text-lg font-bold text-blue-400">{formatPrice(monthlyStats.by_department?.jeux || 0)} F</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-orange-500/20 to-orange-600/10 border-orange-500/30">
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Wine className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400" />
                          <p className="text-slate-400 text-xs">Bar</p>
                        </div>
                        <p className="text-base sm:text-lg font-bold text-orange-400">{formatPrice(monthlyStats.by_department?.bar || 0)} F</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/30">
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
                          <p className="text-slate-400 text-xs">Location</p>
                        </div>
                        <p className="text-base sm:text-lg font-bold text-purple-400">{formatPrice(monthlyStats.by_department?.location || 0)} F</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-slate-500/20 to-slate-600/10 border-slate-500/30 col-span-2 sm:col-span-1">
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Package className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
                          <p className="text-slate-400 text-xs">Autres</p>
                        </div>
                        <p className="text-base sm:text-lg font-bold text-slate-400">{formatPrice(monthlyStats.by_department?.autres || 0)} F</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Daily breakdown - mobile optimized */}
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardHeader className="pb-2 px-3 sm:px-6">
                      <CardTitle className="text-white text-base sm:text-lg flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
                        Détail par jour
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-2 sm:px-6">
                      <div className="space-y-1.5 sm:space-y-2 max-h-[350px] sm:max-h-[400px] overflow-y-auto">
                        {Object.entries(monthlyStats.daily_stats || {}).sort((a, b) => b[0].localeCompare(a[0])).map(([date, data]) => (
                          <div key={date} className="flex items-center justify-between bg-slate-700/30 rounded-lg p-2.5 sm:p-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-white font-medium text-sm sm:text-base truncate">
                                {format(new Date(date), "EEE d MMM", { locale: fr })}
                              </p>
                              <p className="text-slate-400 text-xs">{data.count} bon{data.count > 1 ? 's' : ''}</p>
                            </div>
                            <p className="text-amber-500 font-bold text-sm sm:text-lg ml-2 whitespace-nowrap">
                              {formatPrice(data.revenue)} F
                            </p>
                          </div>
                        ))}
                        {Object.keys(monthlyStats.daily_stats || {}).length === 0 && (
                          <p className="text-slate-500 text-center py-8 text-sm">Aucune donnée pour ce mois</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}

              {!monthlyStats && (
                <div className="text-center py-12">
                  <BarChart3 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-500">Chargement des statistiques...</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ==================== PRODUCTS TAB ==================== */}
          <TabsContent value="products">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">Gestion des produits</h2>
                {/* Add product button - Manager/Admin only */}
                {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
                  <Button onClick={() => { setEditProduct(null); setProductForm({ name: "", price: 0, department: "bar", unit: "unité", category: "" }); setShowProductModal(true); }} className="bg-purple-500 hover:bg-purple-600">
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter un produit
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.entries(DEPARTMENT_CONFIG).map(([dept, config]) => {
                  const Icon = config.icon;
                  // Use catalog which contains all products (default + custom)
                  const deptProducts = catalog[dept] || [];
                  return (
                    <Card key={dept} className={`bg-slate-800/50 ${config.borderColor} border`}>
                      <CardHeader className="py-3">
                        <CardTitle className={`${config.color} flex items-center gap-2`}>
                          <Icon className="w-5 h-5" />
                          {config.label} ({deptProducts.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 max-h-96 overflow-y-auto">
                        {deptProducts.map((product, idx) => (
                          <div key={`${dept}-${product.id}-${idx}`} className="flex items-center justify-between bg-slate-700/30 rounded-lg p-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm truncate">{product.name}</p>
                              <div className="flex items-center gap-2">
                                <p className="text-slate-400 text-xs">{formatPrice(product.price)} F/{product.unit}</p>
                                {product.category && (
                                  <Badge className="bg-slate-600/50 text-slate-300 text-xs">{product.category}</Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-1 ml-2">
                              {/* Edit/Delete buttons - Manager/Admin only */}
                              {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
                                <>
                                  <Button size="icon" variant="ghost" onClick={() => { setEditProduct(product); setProductForm({...product, department: dept}); setShowProductModal(true); }} className="w-7 h-7 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20">
                                    <Edit2 className="w-3 h-3" />
                                  </Button>
                                  <Button size="icon" variant="ghost" onClick={() => deleteProduct(product.id)} className="w-7 h-7 text-red-400 hover:text-red-300 hover:bg-red-500/20">
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                        {deptProducts.length === 0 && (
                          <p className="text-slate-500 text-center py-4 text-sm">Aucun produit</p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* ==================== CLIENTS TAB ==================== */}
          <TabsContent value="clients">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">Gestion des clients</h2>
                <Button onClick={() => { setEditClient(null); setClientForm({ name: "", phone: "", email: "", notes: "" }); setShowClientModal(true); }} className="bg-pink-500 hover:bg-pink-600">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Ajouter un client
                </Button>
              </div>

              <div className="grid gap-3">
                {clients.map(client => (
                  <Card key={client.id} className="bg-slate-800/50 border-slate-700">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium">{client.name}</p>
                          <p className="text-slate-400 text-sm">
                            {client.phone && `📞 ${client.phone}`}
                            {client.email && ` • ✉️ ${client.email}`}
                          </p>
                          <div className="flex gap-2 mt-1">
                            <Badge className="bg-amber-500/20 text-amber-400 text-xs">
                              Total: {formatPrice(client.total_spent || 0)} F
                            </Badge>
                            <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                              {client.visit_count || 0} visite{(client.visit_count || 0) > 1 ? 's' : ''}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => { setEditClient(client); setClientForm(client); setShowClientModal(true); }} className="text-slate-400">
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => deleteClient(client.id)} className="text-red-400">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {clients.length === 0 && (
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardContent className="py-12 text-center">
                      <Users className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                      <p className="text-slate-400">Aucun client enregistré</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ==================== USERS TAB ==================== */}
          {currentUser?.role === 'admin' && (
            <TabsContent value="users">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-white">Gestion des utilisateurs</h2>
                  <Button onClick={() => { setEditUser(null); setUserForm({ username: "", email: "", password: "", pin: "", role: "server", full_name: "" }); setShowUserModal(true); }} className="bg-red-500 hover:bg-red-600">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Ajouter un utilisateur
                  </Button>
                </div>

                <div className="grid gap-3">
                  {users.map(user => (
                    <Card key={user.id} className="bg-slate-800/50 border-slate-700">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-white font-medium">{user.full_name || user.username}</p>
                              <Badge className={
                                user.role === 'admin' ? 'bg-amber-500/20 text-amber-400' : 
                                user.role === 'manager' ? 'bg-blue-500/20 text-blue-400' : 
                                user.role === 'cuisinier' ? 'bg-green-500/20 text-green-400' :
                                user.role === 'coach_jeux' ? 'bg-purple-500/20 text-purple-400' :
                                'bg-slate-500/20 text-slate-400'
                              }>
                                {user.role === 'admin' ? 'Admin' : 
                                 user.role === 'manager' ? 'Manager' : 
                                 user.role === 'cuisinier' ? 'Cuisinier' :
                                 user.role === 'coach_jeux' ? 'Coach Jeux' :
                                 'Serveur'}
                              </Badge>
                              {!user.is_active && <Badge className="bg-red-500/20 text-red-400">Inactif</Badge>}
                            </div>
                            <p className="text-slate-400 text-sm">
                              @{user.username}
                              {user.pin && <span className="ml-2 font-mono bg-slate-700 px-2 py-0.5 rounded text-xs">PIN: {user.pin}</span>}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => { setEditUser(user); setUserForm({ ...user, password: "", pin: user.pin || "" }); setShowUserModal(true); }} className="text-slate-400">
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => deleteUser(user.id)} className="text-red-400">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </TabsContent>
          )}

          {/* ==================== RAPPORT JOURNALIER TAB ==================== */}
          {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
            <TabsContent value="rapport">
              <div className="space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-white">Rapport Journalier</h2>
                    <p className="text-slate-400 text-sm">Point de caisse quotidien</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <Input
                      type="date"
                      value={rapportDate}
                      onChange={(e) => setRapportDate(e.target.value)}
                      className="bg-slate-800/50 border-slate-700 text-white"
                    />
                    <Button onClick={() => fetchRapportData()} variant="outline" className="border-slate-600 text-slate-300">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Actualiser
                    </Button>
                  </div>
                </div>

                {rapportData ? (
                  <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/30">
                        <CardContent className="p-4 text-center">
                          <FileText className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                          <p className="text-3xl font-bold text-blue-400">{rapportData.totalInvoices}</p>
                          <p className="text-slate-400 text-sm">Factures Total</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/30">
                        <CardContent className="p-4 text-center">
                          <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                          <p className="text-3xl font-bold text-green-400">{rapportData.validatedInvoices}</p>
                          <p className="text-slate-400 text-sm">Validées</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border-yellow-500/30">
                        <CardContent className="p-4 text-center">
                          <Clock className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                          <p className="text-3xl font-bold text-yellow-400">{rapportData.pendingInvoices}</p>
                          <p className="text-slate-400 text-sm">En attente</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-gradient-to-br from-amber-500/20 to-amber-600/10 border-amber-500/30">
                        <CardContent className="p-4 text-center">
                          <TrendingUp className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                          <p className="text-2xl font-bold text-amber-500">{formatPrice(rapportData.validatedRevenue)} F</p>
                          <p className="text-slate-400 text-sm">CA Validé</p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* By Server */}
                    <Card className="bg-slate-800/50 border-slate-700">
                      <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                          <Users className="w-5 h-5 text-blue-400" />
                          Récapitulatif par Serveur
                          <span className="text-slate-500 text-sm font-normal ml-2">(Cliquez pour voir le détail)</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-slate-700">
                              <th className="text-left py-2 text-slate-400 text-sm">Serveur</th>
                              <th className="text-center py-2 text-slate-400 text-sm">Factures</th>
                              <th className="text-center py-2 text-slate-400 text-sm">Validées</th>
                              <th className="text-center py-2 text-slate-400 text-sm">En attente</th>
                              <th className="text-right py-2 text-slate-400 text-sm">Total</th>
                              <th className="text-center py-2 text-slate-400 text-sm">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(rapportData.byServer).map(([server, data]) => (
                              <tr 
                                key={server} 
                                className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer transition-colors"
                                onClick={() => viewServerDetail(server)}
                              >
                                <td className="py-3 text-white font-medium">{server}</td>
                                <td className="py-3 text-center text-slate-300">{data.count}</td>
                                <td className="py-3 text-center text-green-400">{data.validated}</td>
                                <td className="py-3 text-center text-yellow-400">{data.pending}</td>
                                <td className="py-3 text-right text-amber-400 font-bold">{formatPrice(data.total)} F</td>
                                <td className="py-3 text-center">
                                  <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    className="text-blue-400 hover:text-blue-300"
                                    onClick={(e) => { e.stopPropagation(); viewServerDetail(server); }}
                                  >
                                    <Eye className="w-4 h-4 mr-1" />
                                    Détail
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </CardContent>
                    </Card>

                    {/* Server Detail View */}
                    {selectedServerDetail && (
                      <Card className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 border-blue-500/30">
                        <CardHeader className="flex flex-row items-center justify-between">
                          <div>
                            <CardTitle className="text-blue-400 flex items-center gap-2">
                              <User className="w-5 h-5" />
                              Détail des factures - {selectedServerDetail}
                            </CardTitle>
                            <p className="text-slate-400 text-sm mt-1">
                              {serverInvoices.length} facture(s) • Total: {formatPrice(serverInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0))} F
                            </p>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={closeServerDetail}
                            className="text-slate-400 hover:text-white"
                          >
                            <X className="w-5 h-5" />
                          </Button>
                        </CardHeader>
                        <CardContent className="space-y-3 max-h-[400px] overflow-y-auto">
                          {serverInvoices.length === 0 ? (
                            <p className="text-slate-400 text-center py-4">Aucune facture pour ce serveur</p>
                          ) : (
                            serverInvoices.map(invoice => (
                              <div 
                                key={invoice.id} 
                                className={`p-3 rounded-lg border ${invoice.validation_status === 'validated' ? 'bg-green-900/20 border-green-500/30' : 'bg-yellow-900/20 border-yellow-500/30'}`}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-white font-bold">{invoice.invoice_number}</span>
                                      {invoice.validation_status === 'validated' ? (
                                        <Badge className="bg-green-500/20 text-green-400 text-xs">✓ Validée</Badge>
                                      ) : (
                                        <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">⏳ En attente</Badge>
                                      )}
                                    </div>
                                    <p className="text-slate-400 text-sm">
                                      {invoice.customer_name} • {format(new Date(invoice.created_at), "HH:mm")}
                                    </p>
                                    <div className="flex gap-2 mt-1 flex-wrap">
                                      {invoice.totals_by_department?.salle_jardin > 0 && (
                                        <Badge className="bg-green-500/20 text-green-400 text-xs">S&J: {formatPrice(invoice.totals_by_department.salle_jardin)}</Badge>
                                      )}
                                      {invoice.totals_by_department?.jeux > 0 && (
                                        <Badge className="bg-blue-500/20 text-blue-400 text-xs">Jeux: {formatPrice(invoice.totals_by_department.jeux)}</Badge>
                                      )}
                                      {invoice.totals_by_department?.bar > 0 && (
                                        <Badge className="bg-orange-500/20 text-orange-400 text-xs">Bar: {formatPrice(invoice.totals_by_department.bar)}</Badge>
                                      )}
                                      {invoice.totals_by_department?.location > 0 && (
                                        <Badge className="bg-purple-500/20 text-purple-400 text-xs">Loc: {formatPrice(invoice.totals_by_department.location)}</Badge>
                                      )}
                                      {invoice.totals_by_department?.autres > 0 && (
                                        <Badge className="bg-slate-500/20 text-slate-400 text-xs">Autres: {formatPrice(invoice.totals_by_department.autres)}</Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xl font-bold text-amber-500">{formatPrice(invoice.total)} F</p>
                                    <p className="text-slate-500 text-xs">
                                      {PAYMENT_METHODS.find(p => p.value === invoice.payment_method)?.label || invoice.payment_method}
                                    </p>
                                    <div className="flex gap-1 mt-2 justify-end">
                                      <Button 
                                        size="sm" 
                                        variant="ghost" 
                                        onClick={() => setViewInvoice(invoice)}
                                        className="text-slate-400 hover:text-white h-7 px-2"
                                      >
                                        <Eye className="w-3 h-3" />
                                      </Button>
                                      {/* Print button - Manager/Admin only */}
                                      {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
                                        <Button 
                                          size="sm" 
                                          variant="ghost" 
                                          onClick={() => printTicket(invoice)}
                                          className="text-slate-400 hover:text-white h-7 px-2"
                                        >
                                          <Printer className="w-3 h-3" />
                                        </Button>
                                      )}
                                      {invoice.validation_status !== 'validated' && (
                                        <Button 
                                          size="sm" 
                                          onClick={() => validateInvoice(invoice.id)}
                                          className="bg-green-600 hover:bg-green-700 h-7 px-2"
                                        >
                                          <CheckCircle className="w-3 h-3" />
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* Charts Section - Admin Only */}
                    {currentUser?.role === 'admin' && (
                    <div className="grid md:grid-cols-2 gap-4">
                      {/* Pie Chart - By Department */}
                      <Card className="bg-slate-800/50 border-slate-700">
                        <CardHeader>
                          <CardTitle className="text-white text-lg flex items-center gap-2">
                            <PieChartIcon className="w-5 h-5 text-amber-400" />
                            Répartition par Département
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {(() => {
                            const DEPT_COLORS = {
                              salle_jardin: '#22c55e',
                              jeux: '#3b82f6', 
                              bar: '#f97316',
                              location: '#a855f7',
                              autres: '#64748b'
                            };
                            const deptData = Object.entries(rapportData.byDepartment)
                              .filter(([_, v]) => v > 0)
                              .map(([dept, amount]) => ({
                                name: DEPARTMENT_CONFIG[dept]?.label || dept,
                                value: amount,
                                color: DEPT_COLORS[dept] || '#64748b'
                              }));
                            
                            if (deptData.length === 0) {
                              return <p className="text-slate-400 text-center py-8">Aucune donnée</p>;
                            }
                            
                            return (
                              <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    <Pie
                                      data={deptData}
                                      cx="50%"
                                      cy="50%"
                                      innerRadius={50}
                                      outerRadius={80}
                                      paddingAngle={3}
                                      dataKey="value"
                                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                                      labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                                    >
                                      {deptData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                      ))}
                                    </Pie>
                                    <Tooltip 
                                      formatter={(value) => [`${formatPrice(value)} F`, 'Montant']}
                                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                                      labelStyle={{ color: '#f1f5f9' }}
                                    />
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>
                            );
                          })()}
                          <div className="grid grid-cols-2 gap-2 mt-4">
                            {Object.entries(rapportData.byDepartment).filter(([_, v]) => v > 0).map(([dept, amount]) => (
                              <div key={dept} className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${dept === 'salle_jardin' ? 'bg-green-500' : dept === 'jeux' ? 'bg-blue-500' : dept === 'bar' ? 'bg-orange-500' : dept === 'location' ? 'bg-purple-500' : 'bg-slate-500'}`} />
                                <span className="text-slate-300 text-sm truncate">{DEPARTMENT_CONFIG[dept]?.label}</span>
                                <span className="text-amber-400 text-sm font-bold ml-auto">{formatPrice(amount)}</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Bar Chart - By Server Performance */}
                      <Card className="bg-slate-800/50 border-slate-700">
                        <CardHeader>
                          <CardTitle className="text-white text-lg flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-blue-400" />
                            Performance par Serveur
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {(() => {
                            const serverData = Object.entries(rapportData.byServer)
                              .map(([server, data]) => ({
                                name: server.length > 12 ? server.slice(0, 12) + '...' : server,
                                fullName: server,
                                total: data.total,
                                validated: data.validated,
                                pending: data.pending
                              }))
                              .sort((a, b) => b.total - a.total)
                              .slice(0, 6);
                            
                            if (serverData.length === 0) {
                              return <p className="text-slate-400 text-center py-8">Aucune donnée</p>;
                            }
                            
                            return (
                              <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={serverData} layout="vertical" margin={{ left: 10, right: 10 }}>
                                    <XAxis type="number" stroke="#94a3b8" tickFormatter={(v) => formatPrice(v)} fontSize={10} />
                                    <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} width={80} />
                                    <Tooltip 
                                      formatter={(value) => [`${formatPrice(value)} F`, 'CA Total']}
                                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                                      labelStyle={{ color: '#f1f5f9' }}
                                      labelFormatter={(label, payload) => payload[0]?.payload?.fullName || label}
                                    />
                                    <Bar dataKey="total" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                            );
                          })()}
                        </CardContent>
                      </Card>
                    </div>
                    )}

                    {/* Payment Methods Pie Chart - Admin Only */}
                    {currentUser?.role === 'admin' && (
                    <Card className="bg-slate-800/50 border-slate-700">
                      <CardHeader>
                        <CardTitle className="text-white text-lg flex items-center gap-2">
                          <CreditCard className="w-5 h-5 text-green-400" />
                          Répartition par Mode de Paiement
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid md:grid-cols-2 gap-4">
                          {(() => {
                            const PAYMENT_COLORS = {
                              cash: '#22c55e',
                              card: '#3b82f6',
                              mobile: '#f97316',
                              wallet: '#a855f7',
                              check: '#64748b'
                            };
                            const paymentData = Object.entries(rapportData.byPayment)
                              .map(([method, data]) => ({
                                name: PAYMENT_METHODS.find(p => p.value === method)?.label || method,
                                value: data.total,
                                count: data.count,
                                color: PAYMENT_COLORS[method] || '#64748b'
                              }));
                            
                            if (paymentData.length === 0) {
                              return <p className="text-slate-400 text-center py-8 col-span-2">Aucun paiement validé</p>;
                            }
                            
                            return (
                              <>
                                <div className="h-48">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                      <Pie
                                        data={paymentData}
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={70}
                                        dataKey="value"
                                        label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                                      >
                                        {paymentData.map((entry, index) => (
                                          <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                      </Pie>
                                      <Tooltip 
                                        formatter={(value, name, props) => [`${formatPrice(value)} F (${props.payload.count} factures)`, 'Montant']}
                                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                                      />
                                    </PieChart>
                                  </ResponsiveContainer>
                                </div>
                                <div className="space-y-3">
                                  {paymentData.map((payment, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-700/30">
                                      <div className="flex items-center gap-3">
                                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: payment.color }} />
                                        <span className="text-slate-300">{payment.name}</span>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-amber-400 font-bold">{formatPrice(payment.value)} F</p>
                                        <p className="text-slate-500 text-xs">{payment.count} facture(s)</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </CardContent>
                    </Card>
                    )}

                    {/* Signature & Generate PDF */}
                    <Card className="bg-gradient-to-br from-amber-900/30 to-amber-800/20 border-amber-500/30">
                      <CardHeader>
                        <CardTitle className="text-amber-400">Générer le Rapport PDF</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-slate-300">Signature numérique (Gérante)</Label>
                          <Input
                            value={signature}
                            onChange={(e) => setSignature(e.target.value)}
                            placeholder="Tapez votre nom pour signer..."
                            className="bg-slate-700/50 border-slate-600 text-white font-serif italic text-lg"
                          />
                          <p className="text-slate-500 text-xs">Cette signature apparaîtra sur le rapport PDF</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <Button 
                            onClick={generateRapportPDF}
                            className="bg-amber-500 hover:bg-amber-600 text-white"
                          >
                            <Printer className="w-4 h-4 mr-2" />
                            Imprimer le Rapport
                          </Button>
                          <Button 
                            onClick={generateRapportPDF}
                            variant="outline"
                            className="border-amber-500 text-amber-500 hover:bg-amber-500/10"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Télécharger PDF
                          </Button>
                        </div>
                        <Button 
                          onClick={sendRapportWhatsApp}
                          className="w-full bg-green-600 hover:bg-green-700 text-white"
                        >
                          <MessageCircle className="w-5 h-5 mr-2" />
                          Envoyer par WhatsApp à Marcel HOUNHANOU
                        </Button>
                        <p className="text-slate-400 text-sm text-center">
                          📱 +229 01 62 39 62 39
                        </p>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardContent className="py-12 text-center">
                      <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                      <p className="text-slate-400">Chargement du rapport...</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          )}

          {/* ==================== HISTORIQUE TAB ==================== */}
          <TabsContent value="historique">
            <div className="space-y-4">
              {/* Header avec sélecteur de date */}
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-xl font-bold text-slate-300 flex items-center gap-2">
                  <Calendar className="w-6 h-6" />
                  Historique des Factures
                </h2>
                <div className="flex items-center gap-3">
                  <Input
                    type="date"
                    value={historyDate}
                    onChange={(e) => setHistoryDate(e.target.value)}
                    className="bg-slate-800/50 border-slate-700 text-white w-auto"
                  />
                  <Badge className="bg-slate-600/50 text-slate-300">
                    {historyInvoices.length} facture(s)
                  </Badge>
                  {historyInvoices.length > 0 && (
                    <Badge className="bg-green-500/20 text-green-400">
                      Total: {formatPrice(historyInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0))} F
                    </Badge>
                  )}
                </div>
              </div>

              {/* Liste des bons archivés */}
              {historyInvoices.length === 0 ? (
                <Card className="bg-slate-800/30 border-slate-700">
                  <CardContent className="py-12 text-center">
                    <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-500">Aucune facture validé pour cette date</p>
                    <p className="text-slate-600 text-sm mt-2">Sélectionnez une autre date dans le calendrier</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {historyInvoices.map((invoice) => (
                    <Card key={invoice.id} className="bg-gradient-to-br from-slate-800/50 to-slate-700/30 border-slate-600/50">
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white font-bold">{invoice.invoice_number}</span>
                              <Badge className="bg-green-500/20 text-green-400">Validée</Badge>
                              <Badge className="bg-amber-500/20 text-amber-400">{formatPrice(invoice.total)} F</Badge>
                              {invoice.table_number && (
                                <Badge className="bg-slate-500/30 text-slate-300">Table {invoice.table_number}</Badge>
                              )}
                            </div>
                            <p className="text-slate-400 text-sm mt-1">
                              Client: {invoice.customer_name} • {format(new Date(invoice.created_at), "HH:mm")}
                            </p>
                            <p className="text-slate-500 text-xs">
                              Serveur: {invoice.created_by} • Validé par: {invoice.validated_by}
                            </p>
                            {/* Résumé des articles */}
                            <div className="flex flex-wrap gap-1 mt-2">
                              {invoice.items?.slice(0, 3).map((item, idx) => (
                                <span key={idx} className="text-xs bg-slate-700/50 text-slate-300 px-2 py-0.5 rounded">
                                  {item.quantity}x {item.name}
                                </span>
                              ))}
                              {invoice.items?.length > 3 && (
                                <span className="text-xs text-slate-500">+{invoice.items.length - 3} autres</span>
                              )}
                            </div>
                            {/* Totaux par département */}
                            <div className="flex flex-wrap gap-2 mt-2">
                              {invoice.totals_by_department?.salle_jardin > 0 && (
                                <span className="text-xs text-green-400">Cuisine: {formatPrice(invoice.totals_by_department.salle_jardin)}F</span>
                              )}
                              {invoice.totals_by_department?.bar > 0 && (
                                <span className="text-xs text-orange-400">Bar: {formatPrice(invoice.totals_by_department.bar)}F</span>
                              )}
                              {invoice.totals_by_department?.jeux > 0 && (
                                <span className="text-xs text-blue-400">Jeux: {formatPrice(invoice.totals_by_department.jeux)}F</span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button 
                              variant="outline"
                              size="sm"
                              onClick={() => setViewInvoice(invoice)}
                              className="border-slate-600 text-slate-300 hover:bg-slate-700"
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              Voir
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ==================== POINTS DES SERVEURS TAB (MANAGER ONLY) ==================== */}
          {currentUser?.role === 'manager' && (
          <TabsContent value="points_serveurs">
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-xl font-bold text-indigo-300 flex items-center gap-2">
                  <ClipboardList className="w-6 h-6" />
                  Points des Serveurs
                </h2>
                <div className="flex items-center gap-3">
                  {unreadServiceReportsCount > 0 && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={markAllServiceReportsRead}
                      className="border-blue-500/50 text-blue-400 hover:bg-blue-500/20"
                    >
                      Tout marquer lu ({unreadServiceReportsCount} non lu{unreadServiceReportsCount > 1 ? 's' : ''})
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
                      onClick={() => openServerReportDetail(report)}
                      className={`cursor-pointer transition-all hover:scale-[1.02] ${
                        report.is_read 
                          ? 'bg-slate-800/50 border-slate-700 hover:border-slate-600' 
                          : 'bg-indigo-900/30 border-indigo-500/50 hover:border-indigo-400'
                      }`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
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
              onTakeOrder={(tableNumber) => {
                // Navigate to commande tab
                setActiveTab("commande");
                // If a specific table number is provided, we could select it
                // For now, just switch to the commande tab
              }}
            />
          </TabsContent>
          )}

          {/* ==================== ACHATS/DÉPENSES TAB (Manager) ==================== */}
          {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
          <TabsContent value="achats">
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-xl font-bold text-purple-300 flex items-center gap-2">
                  <ShoppingCart className="w-6 h-6" />
                  Achats & Dépenses
                </h2>
                {currentUser?.role === 'manager' && (
                  <div className="flex gap-2 flex-wrap">
                    <Button 
                      onClick={() => setShowExpenseModal(true)}
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Demande unique
                    </Button>
                    <Button 
                      onClick={() => setShowShoppingListModal(true)}
                      className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                    >
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      Liste d'achats
                      {shoppingList.length > 0 && (
                        <Badge className="ml-2 bg-white/20 text-white">{shoppingList.length}</Badge>
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {/* Categories legend */}
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <div className="flex flex-wrap gap-2">
                  <Badge className="bg-green-500/20 text-green-400">Cuisine</Badge>
                  <Badge className="bg-orange-500/20 text-orange-400">Bar</Badge>
                  <Badge className="bg-blue-500/20 text-blue-400">Paiement</Badge>
                  <Badge className="bg-slate-500/20 text-slate-400">Autres</Badge>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowAllExpenses(!showAllExpenses)}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  <Eye className="w-4 h-4 mr-1" />
                  {showAllExpenses ? 'Masquer détails' : 'Voir tout en détail'}
                </Button>
              </div>

              {/* ALERT: Expense ratio > 40% */}
              {currentUser?.role === 'admin' && expenseRatioAlert?.isOverLimit && (
                <Card className="bg-gradient-to-br from-red-900/40 to-rose-900/30 border-red-500/70 animate-pulse">
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-red-500 rounded-full p-2">
                        <AlertCircle className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-red-400 font-bold text-lg">⚠️ ALERTE : Ratio Dépenses/CA élevé</p>
                        <p className="text-red-300">
                          Les demandes d'achats représentent <span className="font-bold text-xl">{expenseRatioAlert.ratio}%</span> du CA de la semaine
                        </p>
                        <p className="text-slate-400 text-sm mt-1">
                          Dépenses: {formatPrice(expenseRatioAlert.expenses)} F | CA semaine: {formatPrice(expenseRatioAlert.ca)} F | Seuil: 40%
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Ratio indicator (non-alert) */}
              {currentUser?.role === 'admin' && expenseRatioAlert && !expenseRatioAlert.isOverLimit && (
                <div className="flex items-center gap-2 text-sm bg-slate-800/30 rounded-lg p-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-slate-400">Ratio Dépenses/CA: </span>
                  <span className="text-green-400 font-bold">{expenseRatioAlert.ratio}%</span>
                  <span className="text-slate-500">(seuil: 40%)</span>
                </div>
              )}

              {/* Summary stats */}
              <div className="flex items-center gap-2 text-sm text-slate-400 flex-wrap">
                <span>Total: <span className="text-white font-bold">{expenses.length}</span> demandes</span>
                <span>•</span>
                <span className="text-amber-400">{expenses.filter(e => e.status === 'pending').length} en attente</span>
                <span>•</span>
                <span className="text-orange-400">{expenses.filter(e => e.status === 'revision_requested').length} à réviser</span>
                <span>•</span>
                <span className="text-green-400">{expenses.filter(e => e.status === 'approved').length} approuvées</span>
                <span>•</span>
                <span className="text-slate-500">{expenses.filter(e => e.status === 'completed').length} terminées</span>
              </div>

              {/* Summary card with totals */}
              {expenses.length > 0 && (
                <Card className="bg-slate-800/30 border-slate-700">
                  <CardContent className="py-3">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
                      <div>
                        <p className="text-slate-500 text-xs">En attente</p>
                        <p className="text-amber-400 font-bold">{formatPrice(expenses.filter(e => e.status === 'pending').reduce((sum, e) => sum + e.amount, 0))} F</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">À réviser</p>
                        <p className="text-orange-400 font-bold">{formatPrice(expenses.filter(e => e.status === 'revision_requested').reduce((sum, e) => sum + e.amount, 0))} F</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Approuvées</p>
                        <p className="text-green-400 font-bold">{formatPrice(expenses.filter(e => e.status === 'approved').reduce((sum, e) => sum + e.amount, 0))} F</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Terminées</p>
                        <p className="text-slate-400 font-bold">{formatPrice(expenses.filter(e => e.status === 'completed').reduce((sum, e) => sum + e.amount, 0))} F</p>
                      </div>
                      <div className="border-l border-slate-700 pl-4">
                        <p className="text-slate-500 text-xs">TOTAL GÉNÉRAL</p>
                        <p className="text-white font-bold text-lg">{formatPrice(expenses.reduce((sum, e) => sum + e.amount, 0))} F</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* FULL DETAIL VIEW - All expenses */}
              {showAllExpenses && expenses.length > 0 && (
                <Card className="bg-gradient-to-br from-indigo-900/20 to-purple-900/20 border-indigo-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-indigo-400 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        VUE COMPLÈTE - Toutes les demandes ({expenses.length})
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          size="sm"
                          variant="outline"
                          onClick={printExpensesTicket}
                          className="border-amber-500/50 text-amber-400 hover:bg-amber-500/20"
                          title="Format ticket thermique 80mm"
                        >
                          <Receipt className="w-4 h-4 mr-1" />
                          Ticket 80mm
                        </Button>
                        <Button 
                          size="sm"
                          variant="outline"
                          onClick={printAllExpensesList}
                          className="border-indigo-500/50 text-indigo-400 hover:bg-indigo-500/20"
                        >
                          <Printer className="w-4 h-4 mr-1" />
                          Imprimer A4
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-[500px] overflow-y-auto">
                    <p className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                      <Edit2 className="w-3 h-3" />
                      Cliquez sur une ligne pour modifier la demande
                    </p>
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-800">
                        <tr className="text-left text-slate-400 border-b border-slate-700">
                          <th className="p-2">#</th>
                          <th className="p-2">Catégorie</th>
                          <th className="p-2">Libellé</th>
                          <th className="p-2 text-center">Qté</th>
                          <th className="p-2 text-right">P.U.</th>
                          <th className="p-2 text-right">Total</th>
                          <th className="p-2">Statut</th>
                          <th className="p-2">Semaine</th>
                          {currentUser?.role === 'admin' && <th className="p-2 text-center">Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.map((expense, index) => (
                          <>
                            <tr 
                              key={expense.id} 
                              className={`border-b border-slate-700/50 hover:bg-indigo-500/10 cursor-pointer transition-colors group ${expense.is_group ? 'bg-indigo-900/20' : ''}`}
                              onClick={() => openExpenseForEdit(expense)}
                              title="Cliquer pour modifier"
                            >
                              <td className="p-2 text-slate-500">{index + 1}</td>
                              <td className="p-2">
                                {expense.is_group ? (
                                  <Badge className="text-xs bg-indigo-500/30 text-indigo-300">
                                    📦 Liste
                                  </Badge>
                                ) : (
                                  <Badge className={`text-xs ${
                                    expense.category === 'cuisine' ? 'bg-green-500/20 text-green-400' :
                                    expense.category === 'bar' ? 'bg-orange-500/20 text-orange-400' :
                                    expense.category === 'paiement' ? 'bg-blue-500/20 text-blue-400' :
                                    'bg-slate-500/20 text-slate-400'
                                  }`}>{expense.category}</Badge>
                                )}
                              </td>
                              <td className="p-2 text-white flex items-center gap-2">
                                {expense.is_group ? (
                                  <span className="font-semibold">{expense.description} ({expense.items?.length || 0} articles)</span>
                                ) : expense.description}
                                <Edit2 className="w-3 h-3 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </td>
                              <td className="p-2 text-center text-slate-300">{expense.is_group ? expense.items?.length : (expense.quantity || 1)}</td>
                              <td className="p-2 text-right text-slate-400">{expense.is_group ? '-' : formatPrice(expense.unit_price || expense.amount) + ' F'}</td>
                              <td className="p-2 text-right font-bold text-amber-400">{formatPrice(expense.amount)} F</td>
                              <td className="p-2">
                                <Badge className={`text-xs ${
                                  expense.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                                  expense.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                                  expense.status === 'completed' ? 'bg-slate-500/20 text-slate-400' :
                                  expense.status === 'revision_requested' ? 'bg-orange-500/20 text-orange-400' :
                                  'bg-red-500/20 text-red-400'
                                }`}>
                                  {expense.status === 'pending' ? 'En attente' :
                                   expense.status === 'approved' ? 'Approuvée' :
                                   expense.status === 'completed' ? 'Terminée' :
                                   expense.status === 'revision_requested' ? 'À réviser' : 'Refusée'}
                                </Badge>
                              </td>
                              <td className="p-2">
                                {expense.assigned_week ? (
                                  <Badge className="text-xs bg-cyan-500/20 text-cyan-400">
                                    {format(new Date(expense.assigned_week), "dd/MM")}
                                  </Badge>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={(e) => { 
                                      e.stopPropagation(); 
                                      setExpenseToAssign(expense);
                                      setShowWeekAssignModal(true);
                                    }}
                                    className="h-6 text-xs text-slate-500 hover:text-cyan-400 p-1"
                                  >
                                    <Calendar className="w-3 h-3 mr-1" />
                                    Rattacher
                                  </Button>
                                )}
                              </td>
                              {currentUser?.role === 'admin' && (
                                <td className="p-2 text-center">
                                  <Button 
                                    size="sm"
                                    variant="ghost"
                                    onClick={(e) => { e.stopPropagation(); deleteExpense(expense.id); }}
                                    className="h-7 w-7 p-0 text-red-500 hover:bg-red-700/20"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </td>
                              )}
                            </tr>
                            {/* Show sub-items for grouped lists */}
                            {expense.is_group && expense.items && expense.items.map((item, subIndex) => (
                              <tr key={`${expense.id}-${subIndex}`} className="bg-slate-800/30 border-b border-slate-700/30 text-xs">
                                <td className="p-1 pl-6 text-slate-600">↳</td>
                                <td className="p-1">
                                  <Badge className={`text-xs ${
                                    item.category === 'cuisine' ? 'bg-green-500/10 text-green-500' :
                                    item.category === 'bar' ? 'bg-orange-500/10 text-orange-500' :
                                    item.category === 'paiement' ? 'bg-blue-500/10 text-blue-500' :
                                    'bg-slate-500/10 text-slate-500'
                                  }`}>{item.category}</Badge>
                                </td>
                                <td className="p-1 text-slate-400">{item.description}</td>
                                <td className="p-1 text-center text-slate-500">{item.quantity}</td>
                                <td className="p-1 text-right text-slate-500">{formatPrice(item.unit_price)} F</td>
                                <td className="p-1 text-right text-slate-400">{formatPrice(item.amount)} F</td>
                                <td className="p-1"></td>
                                <td className="p-1"></td>
                                {currentUser?.role === 'admin' && <td className="p-1"></td>}
                              </tr>
                            ))}
                          </>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-800 font-bold">
                          <td colSpan="5" className="p-2 text-right text-slate-400">TOTAL GÉNÉRAL:</td>
                          <td className="p-2 text-right text-lg text-indigo-400">{formatPrice(expenses.reduce((sum, e) => sum + e.amount, 0))} F</td>
                          <td colSpan={currentUser?.role === 'admin' ? 3 : 2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </CardContent>
                </Card>
              )}

              {/* Pending expenses that need manager revision (revision_requested) */}
              {currentUser?.role === 'manager' && expenses.filter(e => e.status === 'revision_requested').length > 0 && (
                <Card className="bg-gradient-to-br from-amber-900/30 to-orange-900/20 border-amber-500/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-amber-400 flex items-center gap-2">
                      <AlertCircle className="w-5 h-5" />
                      À RÉVISER
                      <Badge className="bg-amber-500/30 text-amber-300 ml-2">
                        {expenses.filter(e => e.status === 'revision_requested').length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {expenses.filter(e => e.status === 'revision_requested').map(expense => (
                      <div key={expense.id} className="bg-amber-900/20 rounded-lg p-3 border border-amber-500/30">
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {expense.is_group ? (
                                  <Badge className="text-xs bg-indigo-500/30 text-indigo-300">📦 Liste</Badge>
                                ) : (
                                  <Badge className={`text-xs ${
                                    expense.category === 'cuisine' ? 'bg-green-500/20 text-green-400' :
                                    expense.category === 'bar' ? 'bg-orange-500/20 text-orange-400' :
                                    expense.category === 'paiement' ? 'bg-blue-500/20 text-blue-400' :
                                    'bg-slate-500/20 text-slate-400'
                                  }`}>{expense.category}</Badge>
                                )}
                                <span className="text-white font-medium">{expense.description}</span>
                              </div>
                              {!expense.is_group && (
                                <div className="text-slate-400 text-sm mt-1">
                                  Qté: <span className="text-white">{expense.quantity || 1}</span> × 
                                  PU: <span className="text-white">{formatPrice(expense.unit_price || expense.amount)} F</span>
                                </div>
                              )}
                              <p className="text-amber-400 font-bold text-lg">{formatPrice(expense.amount)} F</p>
                              {expense.admin_notes && (
                                <p className="text-amber-300 text-sm mt-1">
                                  <strong>Note admin:</strong> {expense.admin_notes}
                                </p>
                              )}
                            </div>
                            <Button 
                              size="sm"
                              onClick={() => openExpenseForEdit(expense)}
                              className="bg-amber-600 hover:bg-amber-700"
                            >
                              <Edit2 className="w-4 h-4 mr-1" />
                              Modifier
                            </Button>
                          </div>
                          {/* Show sub-items for grouped lists */}
                          {expense.is_group && expense.items && expense.items.length > 0 && (
                            <div className="bg-slate-800/50 rounded p-2 mt-1">
                              <p className="text-xs text-slate-400 mb-2">Détails de la liste ({expense.items.length} articles):</p>
                              <div className="space-y-1">
                                {expense.items.map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-sm border-b border-slate-700/50 pb-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-slate-500">{idx + 1}.</span>
                                      <Badge className={`text-xs ${
                                        item.category === 'cuisine' ? 'bg-green-500/10 text-green-500' :
                                        item.category === 'bar' ? 'bg-orange-500/10 text-orange-500' :
                                        item.category === 'paiement' ? 'bg-blue-500/10 text-blue-500' :
                                        'bg-slate-500/10 text-slate-500'
                                      }`}>{item.category}</Badge>
                                      <span className="text-white">{item.description}</span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-slate-400 text-xs">{item.quantity} × {formatPrice(item.unit_price)} = </span>
                                      <span className="text-amber-400 font-bold">{formatPrice(item.amount)} F</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Admin view: Pending approvals */}
              {currentUser?.role === 'admin' && expenses.filter(e => e.status === 'pending').length > 0 && (
                <Card className="bg-gradient-to-br from-purple-900/30 to-indigo-900/20 border-purple-500/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-purple-400 flex items-center gap-2">
                      <ShoppingCart className="w-5 h-5" />
                      DEMANDES À VALIDER
                      <Badge className="bg-purple-500/30 text-purple-300 ml-2">
                        {expenses.filter(e => e.status === 'pending').length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {expenses.filter(e => e.status === 'pending').map(expense => (
                      <div key={expense.id} className="bg-purple-900/20 rounded-lg p-4 border border-purple-500/30">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {expense.is_group ? (
                                  <Badge className="text-xs bg-indigo-500/30 text-indigo-300">📦 Liste ({expense.items?.length || 0} articles)</Badge>
                                ) : (
                                  <Badge className={`text-xs ${
                                    expense.category === 'cuisine' ? 'bg-green-500/20 text-green-400' :
                                    expense.category === 'bar' ? 'bg-orange-500/20 text-orange-400' :
                                    expense.category === 'paiement' ? 'bg-blue-500/20 text-blue-400' :
                                    'bg-slate-500/20 text-slate-400'
                                  }`}>{expense.category}</Badge>
                                )}
                                <span className="text-white font-bold">{expense.description}</span>
                              </div>
                              {/* Show quantity and unit price for single items */}
                              {!expense.is_group && (
                                <div className="text-slate-300 text-sm mt-1 bg-slate-800/50 rounded px-2 py-1 inline-block">
                                  <span className="text-slate-400">Qté:</span> <span className="font-bold">{expense.quantity || 1}</span>
                                  <span className="mx-2">×</span>
                                  <span className="text-slate-400">PU:</span> <span className="font-bold">{formatPrice(expense.unit_price || expense.amount)} F</span>
                                  <span className="mx-2">=</span>
                                  <span className="text-amber-400 font-bold">{formatPrice(expense.amount)} F</span>
                                </div>
                              )}
                              {expense.is_group && (
                                <p className="text-amber-400 font-bold text-lg mt-1">Total: {formatPrice(expense.amount)} F</p>
                              )}
                              <p className="text-slate-400 text-sm mt-1">
                                Demandé par: {expense.requested_by} • {new Date(expense.created_at).toLocaleDateString('fr-FR')}
                              </p>
                              {expense.supplier && <p className="text-slate-500 text-sm">Fournisseur: {expense.supplier}</p>}
                              {expense.planned_date && <p className="text-slate-500 text-sm">Prévu le: {expense.planned_date}</p>}
                              {expense.receipt_image && (
                                <div className="mt-2">
                                  <img 
                                    src={expense.receipt_image} 
                                    alt="Reçu" 
                                    className="max-w-[200px] max-h-[100px] object-cover rounded border border-slate-600 cursor-pointer"
                                    onClick={() => window.open(expense.receipt_image, '_blank')}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                          {/* Show sub-items for grouped lists */}
                          {expense.is_group && expense.items && expense.items.length > 0 && (
                            <div className="bg-slate-800/50 rounded p-3 border border-slate-700">
                              <p className="text-xs text-slate-400 mb-2 font-semibold">📋 Détails de la liste:</p>
                              <div className="space-y-2">
                                {expense.items.map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-sm bg-slate-900/30 rounded p-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-slate-500 font-mono">{idx + 1}.</span>
                                      <Badge className={`text-xs ${
                                        item.category === 'cuisine' ? 'bg-green-500/20 text-green-400' :
                                        item.category === 'bar' ? 'bg-orange-500/20 text-orange-400' :
                                        item.category === 'paiement' ? 'bg-blue-500/20 text-blue-400' :
                                        'bg-slate-500/20 text-slate-400'
                                      }`}>{item.category}</Badge>
                                      <span className="text-white font-medium">{item.description}</span>
                                    </div>
                                    <div className="text-right flex items-center gap-2">
                                      <span className="text-slate-400 text-xs">
                                        {item.quantity} × {formatPrice(item.unit_price)} F
                                      </span>
                                      <span className="text-amber-400 font-bold">{formatPrice(item.amount)} F</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="border-t border-slate-700 mt-2 pt-2 flex justify-end">
                                <span className="text-slate-400">Total liste:</span>
                                <span className="text-amber-400 font-bold ml-2">{formatPrice(expense.amount)} F</span>
                              </div>
                            </div>
                          )}
                          {/* Admin: Montant modifiable directement */}
                          <div className="flex items-center gap-3 flex-wrap bg-slate-800/50 rounded-lg p-3">
                            <div className="flex items-center gap-2">
                              <Label className="text-slate-400 text-sm">Montant total:</Label>
                              <Input
                                type="number"
                                defaultValue={expense.amount}
                                className="w-32 bg-slate-700/50 border-slate-600 text-white text-lg font-bold"
                                id={`admin-amount-${expense.id}`}
                              />
                              <span className="text-slate-400">F</span>
                            </div>
                            <Input
                              placeholder="Note pour la gérante (optionnel)"
                              className="flex-1 min-w-[200px] bg-slate-700/50 border-slate-600 text-white text-sm"
                              id={`admin-note-${expense.id}`}
                            />
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <Button 
                              size="sm"
                              onClick={() => {
                                const newAmount = parseFloat(document.getElementById(`admin-amount-${expense.id}`)?.value) || expense.amount;
                                updateExpense(expense.id, { status: "approved", approved_by: "Administrateur", amount: newAmount });
                              }}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Approuver
                            </Button>
                            <Button 
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const note = document.getElementById(`admin-note-${expense.id}`)?.value;
                                const newAmount = parseFloat(document.getElementById(`admin-amount-${expense.id}`)?.value) || expense.amount;
                                updateExpense(expense.id, { 
                                  status: "revision_requested", 
                                  admin_notes: note || "Veuillez réviser cette demande",
                                  amount: newAmount
                                });
                              }}
                              className="border-amber-500/50 text-amber-400 hover:bg-amber-500/20"
                            >
                              <Edit2 className="w-4 h-4 mr-1" />
                              Renvoyer pour révision
                            </Button>
                            <Button 
                              size="sm"
                              variant="outline"
                              onClick={() => updateExpense(expense.id, { status: "rejected" })}
                              className="border-red-500/50 text-red-400 hover:bg-red-500/20"
                            >
                              <X className="w-4 h-4 mr-1" />
                              Refuser
                            </Button>
                            <Button 
                              size="sm"
                              variant="outline"
                              onClick={() => deleteExpense(expense.id)}
                              className="border-red-700/50 text-red-500 hover:bg-red-700/20"
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Supprimer
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Approved expenses (ready for purchase) */}
              {expenses.filter(e => e.status === 'approved').length > 0 && (
                <Card className="bg-gradient-to-br from-green-900/30 to-emerald-900/20 border-green-500/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-green-400 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5" />
                        APPROUVÉS - Prêts à acheter
                        <Badge className="bg-green-500/30 text-green-300 ml-2">
                          {expenses.filter(e => e.status === 'approved').length}
                        </Badge>
                        <Badge className="bg-emerald-500/30 text-emerald-300">
                          Total: {formatPrice(expenses.filter(e => e.status === 'approved').reduce((sum, e) => sum + e.amount, 0))} F
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          size="sm"
                          variant="outline"
                          onClick={printExpensesTicket}
                          className="border-amber-500/50 text-amber-400 hover:bg-amber-500/20"
                        >
                          <Receipt className="w-4 h-4 mr-1" />
                          Ticket 80mm
                        </Button>
                        <Button 
                          size="sm"
                          onClick={printAllApprovedExpenses}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Printer className="w-4 h-4 mr-1" />
                          Imprimer A4
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {expenses.filter(e => e.status === 'approved').map(expense => (
                      <div key={expense.id} className="bg-green-900/20 rounded-lg p-3 border border-green-500/30">
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {expense.is_group ? (
                                  <Badge className="text-xs bg-indigo-500/30 text-indigo-300">📦 Liste ({expense.items?.length || 0} articles)</Badge>
                                ) : (
                                  <Badge className={`text-xs ${
                                    expense.category === 'cuisine' ? 'bg-green-500/20 text-green-400' :
                                    expense.category === 'bar' ? 'bg-orange-500/20 text-orange-400' :
                                    expense.category === 'paiement' ? 'bg-blue-500/20 text-blue-400' :
                                    'bg-slate-500/20 text-slate-400'
                                  }`}>{expense.category}</Badge>
                                )}
                                <span className="text-white font-medium">{expense.description}</span>
                              </div>
                              {/* Show quantity and unit price for single items */}
                              {!expense.is_group && (
                                <div className="text-slate-300 text-sm mt-1">
                                  <span className="text-slate-400">Qté:</span> <span className="font-bold">{expense.quantity || 1}</span>
                                  <span className="mx-2">×</span>
                                  <span className="text-slate-400">PU:</span> <span className="font-bold">{formatPrice(expense.unit_price || expense.amount)} F</span>
                                </div>
                              )}
                              <p className="text-green-400 font-bold text-lg">{formatPrice(expense.amount)} F</p>
                              {expense.supplier && <p className="text-slate-500 text-sm">Fournisseur: {expense.supplier}</p>}
                              {expense.planned_date && <p className="text-slate-500 text-sm">Prévu le: {expense.planned_date}</p>}
                              <p className="text-slate-500 text-xs">Approuvé par: {expense.approved_by}</p>
                            </div>
                            <div className="flex gap-2 flex-wrap shrink-0">
                              {/* Week assignment button */}
                              <Button 
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setExpenseToAssign(expense);
                                  setShowWeekAssignModal(true);
                                }}
                                className={`border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/20 ${expense.assigned_week ? 'bg-cyan-500/20' : ''}`}
                              >
                                <Calendar className="w-4 h-4 mr-1" />
                                {expense.assigned_week ? format(new Date(expense.assigned_week), "dd/MM") : 'Semaine'}
                              </Button>
                              <Button 
                                size="sm"
                                variant="outline"
                                onClick={() => printExpensePDF(expense)}
                                className="border-green-500/50 text-green-400 hover:bg-green-500/20"
                              >
                                <Printer className="w-4 h-4 mr-1" />
                                PDF
                              </Button>
                              {currentUser?.role === 'manager' && (
                                <Button 
                                  size="sm"
                                  onClick={() => updateExpense(expense.id, { status: "completed" })}
                                  className="bg-emerald-600 hover:bg-emerald-700"
                                >
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  Acheté
                                </Button>
                              )}
                              {currentUser?.role === 'admin' && (
                                <Button 
                                  size="sm"
                                  variant="outline"
                                  onClick={() => deleteExpense(expense.id)}
                                  className="border-red-700/50 text-red-500 hover:bg-red-700/20"
                                >
                                  <Trash2 className="w-4 h-4 mr-1" />
                                  Supprimer
                                </Button>
                              )}
                            </div>
                          </div>
                          {/* Show sub-items for grouped lists */}
                          {expense.is_group && expense.items && expense.items.length > 0 && (
                            <div className="bg-slate-800/50 rounded p-2 mt-1">
                              <p className="text-xs text-slate-400 mb-2">📋 Détails de la liste:</p>
                              <div className="space-y-1">
                                {expense.items.map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-sm border-b border-slate-700/50 pb-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-slate-500">{idx + 1}.</span>
                                      <Badge className={`text-xs ${
                                        item.category === 'cuisine' ? 'bg-green-500/10 text-green-500' :
                                        item.category === 'bar' ? 'bg-orange-500/10 text-orange-500' :
                                        item.category === 'paiement' ? 'bg-blue-500/10 text-blue-500' :
                                        'bg-slate-500/10 text-slate-500'
                                      }`}>{item.category}</Badge>
                                      <span className="text-white">{item.description}</span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-slate-400 text-xs">{item.quantity} × {formatPrice(item.unit_price)} = </span>
                                      <span className="text-green-400 font-bold">{formatPrice(item.amount)} F</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Completed expenses (history) */}
              {expenses.filter(e => e.status === 'completed').length > 0 && (
                <Card className="bg-slate-800/30 border-slate-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-slate-400 flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Historique des achats
                      <Badge className="bg-slate-600/50 text-slate-300 ml-2">
                        {expenses.filter(e => e.status === 'completed').length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
                    {expenses.filter(e => e.status === 'completed').slice(0, 20).map(expense => (
                      <div key={expense.id} className="flex items-center justify-between gap-2 bg-slate-700/30 rounded-lg p-2 border border-slate-600/30">
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs ${
                            expense.category === 'cuisine' ? 'bg-green-500/20 text-green-400' :
                            expense.category === 'bar' ? 'bg-orange-500/20 text-orange-400' :
                            expense.category === 'jeux' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-slate-500/20 text-slate-400'
                          }`}>{expense.category}</Badge>
                          <span className="text-slate-300 text-sm">{expense.description}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 text-sm">{formatPrice(expense.amount)} F</span>
                          <span className="text-slate-500 text-xs">{expense.completed_at?.slice(0, 10)}</span>
                          {currentUser?.role === 'admin' && (
                            <Button 
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteExpense(expense.id)}
                              className="h-6 w-6 p-0 text-red-500 hover:bg-red-700/20"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {expenses.length === 0 && (
                <Card className="bg-slate-800/30 border-slate-700">
                  <CardContent className="py-12 text-center">
                    <ShoppingCart className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-500">Aucune demande d'achat</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
          )}

          {/* ==================== POINT HEBDOMADAIRE TAB ==================== */}
          {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
          <TabsContent value="hebdo">
            <HebdoReport 
              weeklyReport={weeklyReport}
              weekStartDate={weekStartDate}
              setWeekStartDate={setWeekStartDate}
              generateWeeklyPDF={generateWeeklyPDF}
              sendWeeklyWhatsApp={sendWeeklyWhatsApp}
              formatPrice={formatPrice}
            />
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

          {/* ==================== ACTIVITÉ TAB (Admin only) ==================== */}
          {currentUser?.role === 'admin' && (
          <TabsContent value="activite">
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-xl font-bold text-emerald-300 flex items-center gap-2">
                  <Activity className="w-6 h-6" />
                  Suivi d'Activité
                </h2>
                <div className="flex items-center gap-3 flex-wrap">
                  <Select value={activityPeriod} onValueChange={setActivityPeriod}>
                    <SelectTrigger className="w-[120px] bg-slate-800/50 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="day">Jour</SelectItem>
                      <SelectItem value="week">Semaine</SelectItem>
                      <SelectItem value="month">Mois</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="date"
                    value={activityDate}
                    onChange={(e) => setActivityDate(e.target.value)}
                    className="bg-slate-800/50 border-slate-700 text-white w-auto"
                  />
                  <Button onClick={fetchActivityReport} variant="outline" className="border-slate-600 text-slate-300">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {activityReport ? (
                <div className="space-y-4">
                  {/* Period label */}
                  <div className="text-center">
                    <Badge className="bg-emerald-500/20 text-emerald-300 text-lg px-4 py-1">
                      {activityReport.period_label}
                    </Badge>
                  </div>

                  {/* Summary cards */}
                  <div className="grid gap-4 md:grid-cols-3">
                    {/* Total Recettes */}
                    <Card className="bg-gradient-to-br from-green-900/30 to-emerald-900/20 border-green-500/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-green-400 text-sm">TOTAL RECETTES</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-3xl font-bold text-green-400">{formatPrice(activityReport.income?.total || 0)} F</p>
                      </CardContent>
                    </Card>

                    {/* Total Dépenses */}
                    <Card className="bg-gradient-to-br from-red-900/30 to-orange-900/20 border-red-500/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-red-400 text-sm">TOTAL DÉPENSES</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-3xl font-bold text-red-400">{formatPrice(activityReport.expenses?.total || 0)} F</p>
                      </CardContent>
                    </Card>

                    {/* Résultat Net */}
                    <Card className={`bg-gradient-to-br ${activityReport.result?.is_profitable ? 'from-emerald-900/30 to-green-900/20 border-emerald-500/50' : 'from-red-900/30 to-rose-900/20 border-red-500/50'}`}>
                      <CardHeader className="pb-2">
                        <CardTitle className={`text-sm ${activityReport.result?.is_profitable ? 'text-emerald-400' : 'text-red-400'}`}>
                          RÉSULTAT NET
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className={`text-3xl font-bold ${activityReport.result?.is_profitable ? 'text-emerald-400' : 'text-red-400'}`}>
                          {activityReport.result?.net >= 0 ? '+' : ''}{formatPrice(activityReport.result?.net || 0)} F
                        </p>
                        <p className="text-slate-400 text-sm">Marge: {activityReport.result?.margin_percent || 0}%</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Detailed breakdown */}
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Recettes détaillées */}
                    <Card className="bg-slate-800/50 border-slate-700">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-green-400 flex items-center gap-2">
                          <TrendingUp className="w-5 h-5" />
                          Détail Recettes
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* Caisse */}
                        <div className="bg-green-900/20 rounded-lg p-3 border border-green-500/30">
                          <div className="flex justify-between items-center">
                            <span className="text-white font-medium">Caisse (Bons)</span>
                            <span className="text-green-400 font-bold">{formatPrice(activityReport.income?.caisse?.total || 0)} F</span>
                          </div>
                          <p className="text-slate-400 text-sm">{activityReport.income?.caisse?.count || 0} factures</p>
                          {/* By department */}
                          <div className="mt-2 space-y-1">
                            {Object.entries(activityReport.income?.caisse?.by_department || {}).map(([dept, amount]) => (
                              <div key={dept} className="flex justify-between text-xs">
                                <span className="text-slate-500 capitalize">{dept.replace('_', ' ')}</span>
                                <span className="text-green-300">{formatPrice(amount)} F</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Réservations */}
                        <div className="flex justify-between items-center bg-slate-700/30 rounded p-2">
                          <span className="text-slate-300">Réservations Jeux</span>
                          <span className="text-green-300">{formatPrice(activityReport.income?.reservations_jeux?.total || 0)} F</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-700/30 rounded p-2">
                          <span className="text-slate-300">Réservations Tables</span>
                          <span className="text-green-300">{formatPrice(activityReport.income?.reservations_tables?.total || 0)} F</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-700/30 rounded p-2">
                          <span className="text-slate-300">Combos</span>
                          <span className="text-green-300">{formatPrice(activityReport.income?.combos?.total || 0)} F</span>
                        </div>

                        {/* By payment method */}
                        {Object.keys(activityReport.income?.caisse?.by_payment_method || {}).length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-700">
                            <p className="text-slate-400 text-sm mb-2">Par mode de paiement:</p>
                            {Object.entries(activityReport.income?.caisse?.by_payment_method || {}).map(([method, amount]) => (
                              <div key={method} className="flex justify-between text-sm">
                                <span className="text-slate-500">{method}</span>
                                <span className="text-slate-300">{formatPrice(amount)} F</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Dépenses détaillées */}
                    <Card className="bg-slate-800/50 border-slate-700">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-red-400 flex items-center gap-2">
                          <ShoppingCart className="w-5 h-5" />
                          Détail Dépenses
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {Object.entries(activityReport.expenses?.by_category || {}).length > 0 ? (
                          Object.entries(activityReport.expenses?.by_category || {}).map(([cat, data]) => (
                            <div key={cat} className="bg-red-900/20 rounded-lg p-3 border border-red-500/30">
                              <div className="flex justify-between items-center">
                                <span className="text-white font-medium capitalize">{cat}</span>
                                <span className="text-red-400 font-bold">{formatPrice(data.total)} F</span>
                              </div>
                              <p className="text-slate-400 text-sm">{data.count} achat(s)</p>
                              {/* Items */}
                              <div className="mt-2 space-y-1">
                                {data.items?.slice(0, 5).map((item, idx) => (
                                  <div key={idx} className="flex justify-between text-xs">
                                    <span className="text-slate-500">{item.description}</span>
                                    <span className="text-red-300">{formatPrice(item.amount)} F</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-4 text-slate-500">
                            Aucune dépense enregistrée
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Performance by server */}
                  {Object.keys(activityReport.income?.caisse?.by_server || {}).length > 0 && (
                    <Card className="bg-slate-800/50 border-slate-700">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-slate-300 flex items-center gap-2">
                          <Users className="w-5 h-5" />
                          Performance par Serveur
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                          {Object.entries(activityReport.income?.caisse?.by_server || {}).map(([server, data]) => (
                            <div key={server} className="bg-slate-700/30 rounded-lg p-3">
                              <p className="text-white font-medium">{server}</p>
                              <p className="text-green-400 font-bold">{formatPrice(data.total)} F</p>
                              <p className="text-slate-500 text-sm">{data.count} factures</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <Card className="bg-slate-800/30 border-slate-700">
                  <CardContent className="py-12 text-center">
                    <Activity className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-500">Chargement des données...</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
          )}
        </Tabs>
        )}
      </div>

      {/* ==================== MODALS ==================== */}
      
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
              <Input value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} className="bg-slate-700 border-slate-600" />
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
              <Label>Département</Label>
              <Select value={productForm.department} onValueChange={(v) => setProductForm({ ...productForm, department: v })}>
                <SelectTrigger className="bg-slate-700 border-slate-600"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="salle_jardin">Salle & Jardin</SelectItem>
                  <SelectItem value="jeux">Jeux</SelectItem>
                  <SelectItem value="bar">Bar</SelectItem>
                  <SelectItem value="location">Location</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={saveProduct} className="w-full bg-purple-500 hover:bg-purple-600">Enregistrer</Button>
          </div>
        </DialogContent>
      </Dialog>

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
                    <SelectItem value="manager">Manager</SelectItem>
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
                        <span className="hidden sm:inline">{config.label}</span>
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
        if (!open) {
          setShowExpenseModal(false);
          setEditingExpense(null);
          setExpenseForm({
            category: "cuisine",
            description: "",
            amount: 0,
            supplier: "",
            planned_date: format(new Date(), "yyyy-MM-dd"),
            receipt_image: null
          });
        }
      }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-purple-400 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              {editingExpense ? 'Modifier la demande' : 'Nouvelle demande d\'achat'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
                  min="1"
                  value={expenseForm.quantity}
                  onChange={(e) => setExpenseForm({...expenseForm, quantity: parseInt(e.target.value) || 1})}
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
                className="flex-1 bg-purple-600 hover:bg-purple-700"
              >
                {editingExpense ? 'Soumettre à nouveau' : 'Créer la demande'}
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
              Liste d'Achats
              {shoppingList.length > 0 && (
                <Badge className="bg-indigo-500/30 text-indigo-300 ml-2">
                  {shoppingList.length} article(s) • Total: {formatPrice(getShoppingListTotal())} F
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Global settings for the list */}
            <div className="grid grid-cols-2 gap-3 bg-slate-700/30 rounded-lg p-3">
              <div>
                <Label className="text-slate-300 text-sm">Fournisseur (commun)</Label>
                <Input
                  value={shoppingListSupplier}
                  onChange={(e) => setShoppingListSupplier(e.target.value)}
                  placeholder="Nom du fournisseur"
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
                    min="1"
                    value={newListItem.quantity || ""}
                    onChange={(e) => setNewListItem({...newListItem, quantity: parseInt(e.target.value) || 1})}
                    placeholder="Qté"
                    className="w-full sm:w-[70px] bg-slate-700/50 border-slate-600 text-white"
                  />
                  <Input
                    type="number"
                    value={newListItem.unit_price || ""}
                    onChange={(e) => setNewListItem({...newListItem, unit_price: parseFloat(e.target.value) || 0})}
                    placeholder="Prix unit."
                    className="w-full sm:w-[100px] bg-slate-700/50 border-slate-600 text-white"
                  />
                  <div className="flex items-center bg-indigo-900/30 rounded px-2 text-indigo-300 text-sm">
                    = {formatPrice((newListItem.quantity || 1) * (newListItem.unit_price || 0))} F
                  </div>
                  <Button 
                    onClick={addToShoppingList}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Shopping list items */}
            {shoppingList.length > 0 ? (
              <Card className="bg-slate-700/30 border-slate-600">
                <CardHeader className="pb-2">
                  <CardTitle className="text-slate-300 text-sm">Articles dans la liste</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 max-h-[250px] overflow-y-auto">
                  {shoppingList.map((item, index) => (
                    <div key={item.id} className="flex items-center justify-between gap-2 bg-slate-600/30 rounded-lg p-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-slate-400 text-sm font-mono">{index + 1}.</span>
                        <Badge className={`text-xs shrink-0 ${
                          item.category === 'cuisine' ? 'bg-green-500/20 text-green-400' :
                          item.category === 'bar' ? 'bg-orange-500/20 text-orange-400' :
                          item.category === 'paiement' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-slate-500/20 text-slate-400'
                        }`}>{item.category}</Badge>
                        <span className="text-white truncate">{item.description}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-slate-400 text-xs">{item.quantity || 1} x {formatPrice(item.unit_price || item.amount)} =</span>
                        <span className="text-amber-400 font-bold">{formatPrice(item.amount)} F</span>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => removeFromShoppingList(item.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/20 h-7 w-7 p-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
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
            {shoppingList.length > 0 && (
              <div className="bg-gradient-to-r from-indigo-900/30 to-purple-900/30 rounded-lg p-4 border border-indigo-500/30">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-slate-300">Total de la liste:</span>
                  <span className="text-2xl font-bold text-indigo-400">{formatPrice(getShoppingListTotal())} F</span>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={submitShoppingList}
                    className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Soumettre {shoppingList.length} demande(s)
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
            )}

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
            {serverDailyReport && (
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
                          <div className="flex items-center gap-3">
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
    </div>
  );
};

export default CaissePage;
