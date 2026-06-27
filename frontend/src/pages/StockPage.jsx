import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import {
  Package, BarChart3, TrendingUp, TrendingDown, AlertTriangle,
  Plus, Search, Filter, Edit2, Trash2, ArrowUpDown, ShoppingCart,
  Truck, ClipboardList, Settings, LogOut, Warehouse, ArrowDown, ArrowUp,
  RefreshCw, X, Save, Eye, ChevronDown, Users, BookOpen, FileText, Download, ClipboardCheck, CheckSquare,
  Activity, Link2, Zap, Scale, Image as ImageIcon, Upload, Clock, PackageCheck, AlertCircle, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import CaisseStockLinksOverview from "./stock/components/CaisseStockLinksOverview";
import PortionnementTab from "./stock/components/PortionnementTab";
import ProductAnalysisView from "./stock/components/ProductAnalysisView";
import StockForecastPanel from "./stock/components/StockForecastPanel";
import DrinksRestockTab from "./stock/DrinksRestockTab";

const API = `${process.env.REACT_APP_BACKEND_URL}/api/stock`;
const formatPrice = (p) => new Intl.NumberFormat('fr-FR').format(p || 0);

// Accepte les nombres saisis avec virgule (FR) ou point. Retourne 0 si invalide.
// Ex: parseDecimal("0,12") = 0.12, parseDecimal("1 500,5") = 1500.5
const parseDecimal = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  const s = String(v).replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

// Composant input décimal qui maintient son texte interne (permet de taper "0,12"
// sans que React n'efface la virgule pendant la frappe). Émet un nombre via onChange.
const DecimalInput = React.forwardRef(({ value, onChange, ...rest }, ref) => {
  const [text, setText] = React.useState(() => {
    if (value === undefined || value === null || value === 0 || value === "") return "";
    return String(value).replace(".", ",");
  });
  // Sync from outside when the parent resets the value (e.g., form reset)
  React.useEffect(() => {
    const cur = parseDecimal(text);
    if (cur !== Number(value || 0)) {
      if (value === undefined || value === null || value === 0 || value === "") {
        setText("");
      } else {
        setText(String(value).replace(".", ","));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      ref={ref}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw !== "" && !/^[0-9]*[.,]?[0-9]*$/.test(raw)) return;
        setText(raw);
        onChange?.(parseDecimal(raw));
      }}
      {...rest}
    />
  );
});

const UNITS = ["kg","g","litre","ml","bouteille","casier","carton","sachet","paquet","piece","portion","bac","sac","bidon","pot","pack","unite","regime","botte","boite","plateau","paire","rame","cartouche","rouleau","bloc","lot","aerosol","douzaine","barquette","brique","plaquette","bombe","fagot","flacon","tablette"];
const MOVEMENT_TYPES = [
  { value: "entree", label: "Entree", color: "emerald", icon: ArrowDown },
  { value: "sortie", label: "Sortie", color: "red", icon: ArrowUp },
  { value: "perte", label: "Perte", color: "orange", icon: AlertTriangle },
  { value: "casse", label: "Casse", color: "red", icon: X },
  { value: "ajustement", label: "Ajustement", color: "blue", icon: ArrowUpDown },
  { value: "retour_fournisseur", label: "Retour fournisseur", color: "purple", icon: Truck },
  { value: "transfert_sortie", label: "Transfert (sortie Magasin)", color: "amber", icon: ArrowUp },
  { value: "transfert_entree", label: "Transfert (entrée Restau)", color: "amber", icon: ArrowDown },
];

// ============================================================================
// NAVIGATION : 5 groupes principaux avec sous-onglets (refonte Phase 1)
// ============================================================================
const NAV_GROUPS = [
  {
    id: "dashboard_group",
    label: "Tableau de bord",
    icon: BarChart3,
    subtabs: [
      { id: "dashboard", label: "Vue d'ensemble", icon: BarChart3 },
      { id: "destock_live", label: "Déstockage live", icon: Activity },
    ],
  },
  {
    id: "catalogue",
    label: "Catalogue",
    icon: Package,
    subtabs: [
      { id: "products", label: "Produits", icon: Package },
      { id: "recipes", label: "Fiches Techniques", icon: BookOpen },
      { id: "portionnement", label: "Portionnement", icon: Scale },
      { id: "caisse_links", label: "Liaisons Caisse↔Stock", icon: Link2 },
      { id: "categories", label: "Catégories", icon: ClipboardList },
    ],
  },
  {
    id: "stocks",
    label: "Stocks",
    icon: Warehouse,
    subtabs: [
      { id: "magasin", label: "Stock Magasin", icon: Warehouse },
      { id: "movements", label: "Mouvements", icon: ArrowUpDown },
      { id: "inventory", label: "Inventaire", icon: ClipboardCheck },
      { id: "snapshot", label: "Stock à une date", icon: Clock },
      { id: "drinks_restock", label: "Appro. Boissons", icon: PackageCheck },
      { id: "forecast", label: "Prévisions épuisement", icon: TrendingDown },
    ],
  },
  {
    id: "admin_group",
    label: "Rapports & Admin",
    icon: FileText,
    subtabs: [
      { id: "reports", label: "Rapports", icon: FileText },
      { id: "product_analysis", label: "Analyse produit", icon: BarChart3 },
      { id: "users", label: "Utilisateurs", icon: Users, adminOnly: true },
    ],
  },
];

// Helper : retrouve le groupe qui contient une section donnée
const findGroupForSection = (sectionId) =>
  NAV_GROUPS.find((g) => g.subtabs.some((s) => s.id === sectionId));

const ROLES = [
  { value: "administrateur", label: "Administrateur", desc: "Acces complet" },
  { value: "gerant", label: "Gerant", desc: "Gestion stock, achats, mouvements" },
  { value: "magasinier", label: "Magasinier", desc: "Entrees, sorties, inventaire" },
  { value: "consultation", label: "Consultation", desc: "Lecture seule" },
];

export default function StockPage() {
  // Auth
  const [currentUser, setCurrentUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [activeSection, setActiveSection] = useState("dashboard");
  const [dashboard, setDashboard] = useState(null);
  const [products, setProducts] = useState([]);
  // Liste exhaustive des produits (sans filtre catalogue) — utilisée par les modales
  // Fiche Technique et Mouvement qui doivent pouvoir lister TOUS les ingrédients
  // même quand un filtre est actif dans l'onglet Produits.
  const [allProducts, setAllProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [movements, setMovements] = useState([]);
  const [purchases, setPurchases] = useState([]);
  // Filtre "Source" pour la vue Approvisionnement : "all" | "caisse" | "stock"
  const [purchaseSourceFilter, setPurchaseSourceFilter] = useState("all");
  // Filtre statut réception : "all" | "expected" | "received"
  const [purchaseReceptionFilter, setPurchaseReceptionFilter] = useState("all");
  const [stockUsers, setStockUsers] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [report, setReport] = useState(null);
  const [reportFilters, setReportFilters] = useState({ type: "all", date_from: "", date_to: "", search: "" });
  const [reportLoading, setReportLoading] = useState(false);
  const [inventories, setInventories] = useState([]);
  const [activeInventory, setActiveInventory] = useState(null);
  const [inventorySearch, setInventorySearch] = useState("");
  const [loading, setLoading] = useState(false);

  // Déstockage live dashboard
  const [destockLive, setDestockLive] = useState(null);
  const [destockLiveLoading, setDestockLiveLoading] = useState(false);
  // Snapshot stock à une date (boissons)
  const [snapshotDate, setSnapshotDate] = useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
  });
  const [snapshotData, setSnapshotData] = useState(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotSearch, setSnapshotSearch] = useState("");
  const [snapshotShowZero, setSnapshotShowZero] = useState(false);
  const [snapshotOnlyDrinks, setSnapshotOnlyDrinks] = useState(true);
  const [snapshotCategoryId, setSnapshotCategoryId] = useState("all");
  // Mobile sidebar drawer
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Manual link modal (per unlinked product)
  const [linkModalCp, setLinkModalCp] = useState(null); // {id, name, category, price}
  const [linkSearchQuery, setLinkSearchQuery] = useState("");
  const [linkSearchResults, setLinkSearchResults] = useState([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const fetchDestockLive = useCallback(async () => {
    setDestockLiveLoading(true);
    try {
      const r = await axios.get(`${API}/destock-live`, { params: { limit: 30 } });
      setDestockLive(r.data);
    } catch (e) {
      toast.error("Erreur de chargement du dashboard live");
    } finally {
      setDestockLiveLoading(false);
    }
  }, []);
  const runSmartLink = async () => {
    if (!window.confirm("Lier automatiquement les produits Caisse non liés au Stock par mots-clés (poulet, poisson, frite, riz, etc.) ?")) return;
    try {
      const baseApi = (process.env.REACT_APP_BACKEND_URL || "") + "/api";
      const { data } = await axios.post(`${baseApi}/caisse/products/smart-link-to-stock`);
      toast.success(`✓ ${data.linked_count} liaisons créées (${data.no_match_count} sans correspondance)`);
      fetchDestockLive();
    } catch (e) {
      toast.error("Erreur lors de la liaison automatique");
    }
  };
  // Open the per-product link modal and pre-load suggestions based on the caisse name
  const openLinkModal = (cp) => {
    setLinkModalCp(cp);
    setLinkSearchQuery(cp.name || "");
    setLinkSearchResults([]);
    // Pre-search using the caisse product name
    setLinkSearching(true);
    const baseApi = (process.env.REACT_APP_BACKEND_URL || "") + "/api";
    axios.get(`${baseApi}/caisse/products/stock-suggestions`, { params: { name: cp.name, limit: 10 } })
      .then((res) => setLinkSearchResults(res.data.suggestions || []))
      .catch(() => setLinkSearchResults([]))
      .finally(() => setLinkSearching(false));
  };
  const searchStockForLink = async (q) => {
    setLinkSearchQuery(q);
    if (!q || q.length < 2) {
      setLinkSearchResults([]);
      return;
    }
    setLinkSearching(true);
    try {
      const baseApi = (process.env.REACT_APP_BACKEND_URL || "") + "/api";
      const { data } = await axios.get(`${baseApi}/caisse/products/stock-suggestions`,
        { params: { name: q, limit: 10 } });
      setLinkSearchResults(data.suggestions || []);
    } catch (e) {
      setLinkSearchResults([]);
    } finally {
      setLinkSearching(false);
    }
  };
  const confirmManualLink = async (sp) => {
    if (!linkModalCp) return;
    try {
      const baseApi = (process.env.REACT_APP_BACKEND_URL || "") + "/api";
      await axios.put(`${baseApi}/caisse/products/${linkModalCp.id}`,
        { stock_product_id: sp.id });
      toast.success(`Lié : ${linkModalCp.name} → ${sp.name}`);
      setLinkModalCp(null);
      setLinkSearchQuery("");
      setLinkSearchResults([]);
      fetchDestockLive();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur lors de la liaison");
    }
  };

  // Sorties detail panel (dashboard)
  const today_iso = new Date().toISOString().slice(0, 10);
  const [showSortiesDetail, setShowSortiesDetail] = useState(false);
  const [sortiesDetail, setSortiesDetail] = useState([]);
  const [sortiesLoading, setSortiesLoading] = useState(false);
  const [sortiesFilters, setSortiesFilters] = useState({
    date_from: today_iso,
    date_to: today_iso,
    product_q: "",
    motif: "all", // 'all' | 'sortie' | 'perte' | 'casse' | 'sale'
  });

  const fetchSortiesDetail = async () => {
    setSortiesLoading(true);
    try {
      // Fetch each movement type and merge (backend filters one at a time)
      const types = sortiesFilters.motif === "all"
        ? ["sortie", "perte", "casse"]
        : [sortiesFilters.motif];
      const results = await Promise.all(
        types.map((t) => axios.get(`${API}/movements`, {
          params: {
            movement_type: t,
            date_from: sortiesFilters.date_from || undefined,
            date_to: sortiesFilters.date_to || undefined,
            limit: 500,
          },
        }))
      );
      let all = results.flatMap((r) => r.data.movements || []);
      const q = (sortiesFilters.product_q || "").trim().toLowerCase();
      if (q) all = all.filter((m) => (m.product_name || "").toLowerCase().includes(q));
      all.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      setSortiesDetail(all);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur de chargement des sorties");
    } finally {
      setSortiesLoading(false);
    }
  };
  const [seeded, setSeeded] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterAlert, setFilterAlert] = useState("all");
  // Filtres additionnels (Phase 2) - appliqués côté client après fetch
  const [filterZone, setFilterZone] = useState("all");          // all | cuisine | magasin
  const [filterSupplier, setFilterSupplier] = useState("all");  // all | <supplier_id>
  const [filterRenseigned, setFilterRenseigned] = useState("all"); // all | yes | no
  // Pagination Phase 4 (perf) — 50 lignes à la fois
  const [productPage, setProductPage] = useState(1);
  const PRODUCTS_PER_PAGE = 50;

  // Modals
  const [showProductModal, setShowProductModal] = useState(false);
  const [photoZoom, setPhotoZoom] = useState(null); // { url, name } | null
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [movementProductSearch, setMovementProductSearch] = useState("");
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Unit conversion modal (casier → bouteille, pack → bouteille, …)
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [convertTarget, setConvertTarget] = useState(null);
  const [convertForm, setConvertForm] = useState({ multiplier: 24, new_unit: "bouteille" });

  // Bulk unit conversion modal (convert all products with unit=X in category=Y)
  const [showBulkConvertModal, setShowBulkConvertModal] = useState(false);
  const [bulkConvertForm, setBulkConvertForm] = useState({
    category_id: "all",
    from_unit: "casier",
    multiplier: 24,
    new_unit: "bouteille",
  });

  // Add package entry modal (quick package-based stock input from product row)
  const [showAddPackageModal, setShowAddPackageModal] = useState(false);
  const [addPackageTarget, setAddPackageTarget] = useState(null);
  const [addPackageForm, setAddPackageForm] = useState({ package_qty: 1, package_price: 0, items_per_package: 24 });

  const openAddPackage = (p) => {
    setAddPackageTarget(p);
    // Smart default for items_per_package: if stock_min is > 1 and seems like a package ref, use it
    const smartItems = p.stock_min && p.stock_min >= 6 && p.stock_min <= 48 ? p.stock_min : 24;
    setAddPackageForm({ package_qty: 1, package_price: 0, items_per_package: smartItems });
    setShowAddPackageModal(true);
  };

  const submitAddPackage = async () => {
    const pq = parseFloat(addPackageForm.package_qty);
    const pp = parseFloat(addPackageForm.package_price);
    const ipp = parseInt(addPackageForm.items_per_package, 10);
    if (!pq || pq <= 0) { toast.error("Nombre de packages > 0"); return; }
    if (!ipp || ipp <= 0) { toast.error("Unités par package > 0"); return; }
    if (pp < 0) { toast.error("Prix invalide"); return; }
    try {
      await axios.post(`${API}/products/${addPackageTarget.id}/add-package`, {
        package_qty: pq,
        package_price: pp,
        items_per_package: ipp,
      });
      toast.success(`+${pq * ipp} ${addPackageTarget.unit} ajoutés à ${addPackageTarget.name}`);
      setShowAddPackageModal(false);
      setAddPackageTarget(null);
      fetchProducts();
      fetchDashboard();
    } catch (e) {
      toast.error("Erreur lors de l'ajout");
    }
  };

  const submitBulkConvert = async () => {
    const m = parseInt(bulkConvertForm.multiplier, 10);
    const nu = (bulkConvertForm.new_unit || "").trim();
    const fu = (bulkConvertForm.from_unit || "").trim();
    if (!m || m <= 0) { toast.error("Le multiplicateur doit être > 0"); return; }
    if (!nu || !fu) { toast.error("Unités requises"); return; }
    const payload = { from_unit: fu, multiplier: m, new_unit: nu };
    if (bulkConvertForm.category_id && bulkConvertForm.category_id !== "all") {
      payload.category_id = bulkConvertForm.category_id;
    }
    try {
      const { data } = await axios.post(`${API}/products/convert-unit-bulk`, payload);
      toast.success(`${data.converted} produit(s) converti(s)`);
      setShowBulkConvertModal(false);
      fetchProducts();
      fetchDashboard();
    } catch (e) {
      toast.error("Erreur lors de la conversion en lot");
    }
  };

  const openConvertUnit = (p) => {
    setConvertTarget(p);
    // Smart defaults by current unit
    const u = (p.unit || "").toLowerCase();
    let m = 24, nu = "bouteille";
    if (u === "casier" || u === "caisse") { m = 24; nu = "bouteille"; }
    else if (u === "pack") { m = 6; nu = "bouteille"; }
    else if (u === "carton") { m = 12; nu = "bouteille"; }
    else if (u === "sac") { m = 25; nu = "kg"; }
    else if (u === "bidon") { m = 20; nu = "litre"; }
    else if (u === "lot") { m = 12; nu = "unite"; }
    else if (u === "paquet" || u === "plateau" || u === "bac") { m = 12; nu = "unite"; }
    else if (u === "boite" || u === "barquette") { m = 6; nu = "unite"; }
    else if (u === "pot") { m = 1; nu = "kg"; }
    else if (u === "douzaine") { m = 12; nu = "unite"; }
    else { m = 1; nu = "unite"; }  // generic fallback for unit, bouteille, kg, etc.
    setConvertForm({ multiplier: m, new_unit: nu });
    setShowConvertModal(true);
  };

  const submitConvertUnit = async () => {
    if (!convertTarget) return;
    const m = parseInt(convertForm.multiplier, 10);
    const nu = (convertForm.new_unit || "").trim();
    if (!m || m <= 0) { toast.error("Le multiplicateur doit être > 0"); return; }
    if (!nu) { toast.error("La nouvelle unité est requise"); return; }
    try {
      await axios.post(`${API}/products/${convertTarget.id}/convert-unit`, { multiplier: m, new_unit: nu });
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.message || "Erreur inconnue";
      toast.error(`Erreur lors de la conversion : ${detail}`);
      console.error("convert-unit failed", e?.response?.status, e?.response?.data);
      return;
    }
    // Success path — refresh views (safe: any refresh error is logged but not surfaced as conversion error)
    toast.success(`${convertTarget.name} converti en ${nu}`);
    setShowConvertModal(false);
    setConvertTarget(null);
    try { await fetchProducts(); } catch (err) { console.error("fetchProducts after convert", err); }
    try { await fetchDashboard(); } catch (err) { console.error("fetchDashboard after convert", err); }
  };

  // Forms
  const [productForm, setProductForm] = useState({ code: "", name: "", category_id: "", subcategory: "", unit: "kg", quantity: 0, stock_min: 5, stock_max: 100, purchase_price: 0, sale_price: 0, supplier_id: "", storage_location: "", storage_zone: "cuisine", date_achat: "", date_peremption: "", observation: "", photo_url: "" });
  const [movementForm, setMovementForm] = useState({ product_id: "", movement_type: "entree", quantity: 0, unit_price: 0, reason: "" });
  const [purchaseForm, setPurchaseForm] = useState({ supplier_id: "", supplier_name: "", purchase_date: "", items: [], notes: "" });
  const [purchaseItem, setPurchaseItem] = useState({ product_id: "", quantity: 0, unit_price: 0 });
  const [supplierForm, setSupplierForm] = useState({ name: "", phone: "", email: "", address: "", product_types: "", notes: "" });
  const [categoryForm, setCategoryForm] = useState({ name: "", description: "", color: "#3b82f6" });
  const [userForm, setUserForm] = useState({ username: "", password: "", full_name: "", role: "magasinier" });
  const [recipeForm, setRecipeForm] = useState({ name: "", caisse_product_name: "", selling_price: 0, ingredients: [], notes: "" });
  const [recipeIngredient, setRecipeIngredient] = useState({ product_id: "", quantity: 0 });
  const [expandedPurchase, setExpandedPurchase] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);

  // Role permissions
  const isAdmin = currentUser?.role === "administrateur";
  const isGerant = currentUser?.role === "gerant";
  const canWrite = isAdmin || isGerant || currentUser?.role === "magasinier";
  const canManage = isAdmin || isGerant;

  // Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      // Seed users first (in case DB is empty)
      await axios.post(`${API}/auth/seed-users`).catch(() => {});
      const res = await axios.post(`${API}/auth/login`, loginForm);
      setCurrentUser(res.data.user);
      setLoginForm({ username: "", password: "" });
    } catch (err) {
      setLoginError(err.response?.data?.detail || "Identifiants incorrects");
    } finally { setLoginLoading(false); }
  };

  const handleLogout = () => { setCurrentUser(null); setActiveSection("dashboard"); };

  const seed = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/seed`);
      setSeeded(true);
      fetchAll();
      toast.success("Donnees de demonstration chargees - 441 produits");
    } catch { toast.error("Erreur"); }
    finally { setLoading(false); }
  };

  const fetchDashboard = useCallback(async () => {
    try { const r = await axios.get(`${API}/dashboard`); setDashboard(r.data); } catch {}
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      const params = {};
      if (searchQuery) params.search = searchQuery;
      if (filterCategory !== "all") params.category_id = filterCategory;
      if (filterAlert !== "all") params.alert = filterAlert;
      const r = await axios.get(`${API}/products`, { params });
      setProducts(r.data.products);
    } catch {}
  }, [searchQuery, filterCategory, filterAlert]);

  // Charge la liste complète des produits (sans aucun filtre catalogue).
  // Indispensable pour les modales Fiche Technique / Mouvement : si l'utilisateur
  // a un filtre actif sur l'onglet Produits, `products` est tronqué et le dropdown
  // de sélection d'ingrédient apparaît vide ou incomplet.
  const fetchAllProducts = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/products`, { params: {} });
      setAllProducts(r.data.products || []);
    } catch {}
  }, []);

  const fetchCategories = useCallback(async () => {
    try { const r = await axios.get(`${API}/categories`); setCategories(r.data.categories); } catch {}
  }, []);

  const fetchSuppliers = useCallback(async () => {
    try { const r = await axios.get(`${API}/suppliers`); setSuppliers(r.data.suppliers); } catch {}
  }, []);

  const [movementFilters, setMovementFilters] = useState({
    product_id: "",
    movement_type: "",
    date_from: "",
    date_to: "",
    limit: 200,
  });
  // Boissons vs Autres produits filter ("all" | "boissons" | "autres")
  const [movementCategoryView, setMovementCategoryView] = useState("all");
  // Filtres avancés repliés par défaut pour aérer la vue Mouvements
  const [showMovementFilters, setShowMovementFilters] = useState(false);

  // "Stock magasin" zone (manual-only stock — no auto-destock from invoices)
  const [magasinProducts, setMagasinProducts] = useState([]);
  const [magasinMovements, setMagasinMovements] = useState([]);
  const [magasinSearch, setMagasinSearch] = useState("");

  // Transfer Magasin → Cuisine
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({
    source_product_id: "",
    source_product_name: "",
    source_quantity: 0,
    source_unit: "",
    target_mode: "existing", // 'existing' | 'new'
    target_product_id: "",
    target_name: "",
    quantity: "",
    reason: "",
  });

  const fetchMagasinProducts = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/products`, { params: { storage_zone: "magasin" } });
      setMagasinProducts(r.data.products || []);
    } catch {}
  }, []);

  const fetchMagasinMovements = useCallback(async () => {
    try {
      // Fetch all recent movements and keep only those on magasin products
      const r = await axios.get(`${API}/movements`, { params: { limit: 500 } });
      setMagasinMovements(r.data.movements || []);
    } catch {}
  }, []);

  const submitTransfer = async () => {
    const qty = parseFloat(String(transferForm.quantity).replace(',', '.'));
    if (!qty || qty <= 0) { toast.error("Quantité invalide"); return; }
    if (qty > transferForm.source_quantity) {
      toast.error(`Stock insuffisant. Disponible: ${transferForm.source_quantity} ${transferForm.source_unit}`);
      return;
    }
    try {
      const payload = {
        source_product_id: transferForm.source_product_id,
        quantity: qty,
        reason: transferForm.reason || null,
        user_name: currentUser?.full_name || currentUser?.username || "Administrateur",
      };
      if (transferForm.target_mode === "existing" && transferForm.target_product_id) {
        payload.target_product_id = transferForm.target_product_id;
      } else {
        payload.target_name = transferForm.target_name || transferForm.source_product_name;
      }
      const r = await axios.post(`${API}/transfer-magasin-cuisine`, payload);
      if (r.data?.success) {
        toast.success(`Transféré ${qty} ${transferForm.source_unit} de Magasin vers Restau`);
        setShowTransferModal(false);
        fetchMagasinProducts();
        fetchMagasinMovements();
        fetchProducts();
        fetchMovements();
        fetchDashboard();
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur de transfert");
    }
  };

  const fetchSnapshot = useCallback(async () => {
    if (!snapshotDate) return;
    setSnapshotLoading(true);
    try {
      const r = await axios.get(`${API}/snapshot`, {
        params: { at: snapshotDate, only_drinks: snapshotOnlyDrinks },
      });
      setSnapshotData(r.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur lors du calcul du stock à cette date");
    } finally {
      setSnapshotLoading(false);
    }
  }, [snapshotDate, snapshotOnlyDrinks]);

  const fetchMovements = useCallback(async () => {
    try {
      const params = { limit: movementFilters.limit || 200 };
      if (movementFilters.product_id) params.product_id = movementFilters.product_id;
      if (movementFilters.movement_type) params.movement_type = movementFilters.movement_type;
      if (movementFilters.date_from) params.date_from = movementFilters.date_from;
      if (movementFilters.date_to) params.date_to = movementFilters.date_to;
      const r = await axios.get(`${API}/movements`, { params });
      setMovements(r.data.movements);
    } catch {}
  }, [movementFilters]);

  const fetchPurchases = useCallback(async () => {
    try { const r = await axios.get(`${API}/purchases`); setPurchases(r.data.purchases); } catch {}  }, []);

  const fetchUsers = useCallback(async () => {
    try { const r = await axios.get(`${API}/auth/users`); setStockUsers(r.data.users); } catch {}
  }, []);

  const fetchRecipes = useCallback(async () => {
    try { const r = await axios.get(`${API}/recipes`); setRecipes(r.data.recipes); } catch {}
  }, []);

  const fetchInventories = useCallback(async () => {
    try { const r = await axios.get(`${API}/inventories`); setInventories(r.data.inventories); } catch {}
  }, []);

  const fetchAll = useCallback(() => {
    fetchDashboard(); fetchProducts(); fetchAllProducts(); fetchCategories(); fetchSuppliers(); fetchMovements(); fetchPurchases(); fetchUsers(); fetchRecipes(); fetchInventories(); fetchMagasinProducts();
  }, [fetchDashboard, fetchProducts, fetchAllProducts, fetchCategories, fetchSuppliers, fetchMovements, fetchPurchases, fetchUsers, fetchRecipes, fetchInventories]);

  // Enhanced refresh with loading state, last-refreshed timestamp, and toast feedback
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  const refreshAll = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchDashboard(), fetchProducts(), fetchCategories(), fetchSuppliers(),
        fetchMovements(), fetchPurchases(), fetchUsers(), fetchRecipes(), fetchInventories(),
      ]);
      setLastRefresh(new Date());
      toast.success("Stock actualisé", {
        description: "Produits, catégories, mouvements, fournisseurs et fiches techniques rechargés.",
        duration: 2500,
      });
    } catch (e) {
      toast.error("Erreur lors de l'actualisation");
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, fetchDashboard, fetchProducts, fetchCategories, fetchSuppliers, fetchMovements, fetchPurchases, fetchUsers, fetchRecipes, fetchInventories]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { fetchProducts(); }, [searchQuery, filterCategory, filterAlert, fetchProducts]);
  // Auto-fetch destockage live when entering the tab
  useEffect(() => {
    if (activeSection === "destock_live" && !destockLive) fetchDestockLive();
    if (activeSection === "snapshot" && !snapshotData) fetchSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  // Recompute snapshot when scope (drinks vs all) changes while on the tab
  useEffect(() => {
    if (activeSection === "snapshot" && snapshotData) fetchSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotOnlyDrinks]);

  // Auto-fetch magasin data when entering the tab
  useEffect(() => {
    if (activeSection === "magasin") {
      fetchMagasinProducts();
      fetchMagasinMovements();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  // Auto-refresh movements when entering the "Mouvements" tab + polling every 60s while active:
  //  - trigger resync of today's invoices + daily portion deductions (idempotent)
  //  - refetch movements + products + dashboard to ensure freshness
  // This prevents stale data from showing up when users navigate back or stay on the tab during service.
  const [movementsLastRefresh, setMovementsLastRefresh] = useState(null);
  const [movementsAutoSyncing, setMovementsAutoSyncing] = useState(false);
  useEffect(() => {
    if (activeSection !== "movements") return;
    let cancelled = false;

    const runSync = async ({ withResync = true } = {}) => {
      if (cancelled) return;
      setMovementsAutoSyncing(true);
      try {
        if (withResync) {
          await Promise.allSettled([
            axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/invoices/resync-destockage`),
            axios.post(`${API}/stock/portionnement/apply-daily`),
          ]);
        }
      } catch {}
      if (cancelled) return;
      await Promise.all([fetchMovements(), fetchProducts(), fetchDashboard()]);
      if (!cancelled) {
        setMovementsLastRefresh(new Date());
        setMovementsAutoSyncing(false);
      }
    };

    // Initial sync: full resync + refetch
    runSync({ withResync: true });

    // Polling every 60s: resync + refetch (kept lightweight - backend endpoints are idempotent)
    const intervalId = setInterval(() => {
      // Skip polling if tab is hidden to save bandwidth
      if (document.visibilityState === "hidden") return;
      runSync({ withResync: true });
    }, 60000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  // Products sorted so that items with a filled quantity or purchase_price appear first.
  // "Filled" score: +2 if both quantity and price > 0, +1 if only one, 0 if empty.
  // Array.prototype.sort is stable (ES2019+) so original order is kept within each score group.
  const sortedProducts = useMemo(() => {
    const score = (p) => (p.quantity > 0 ? 1 : 0) + (p.purchase_price > 0 ? 1 : 0);
    let arr = [...products];
    // Filtres additionnels (Phase 2, côté client)
    if (filterZone !== "all") {
      arr = arr.filter(p => (p.storage_zone || "cuisine") === filterZone);
    }
    if (filterSupplier !== "all") {
      arr = arr.filter(p => (p.supplier_id || "") === filterSupplier);
    }
    if (filterRenseigned === "yes") {
      arr = arr.filter(p => p.quantity > 0 || p.purchase_price > 0);
    } else if (filterRenseigned === "no") {
      arr = arr.filter(p => !(p.quantity > 0) && !(p.purchase_price > 0));
    }
    return arr.sort((a, b) => score(b) - score(a));
  }, [products, filterZone, filterSupplier, filterRenseigned]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setProductPage(1);
  }, [searchQuery, filterCategory, filterAlert, filterZone, filterSupplier, filterRenseigned]);

  const totalPages = Math.max(1, Math.ceil(sortedProducts.length / PRODUCTS_PER_PAGE));
  const paginatedProducts = useMemo(() => {
    const start = (productPage - 1) * PRODUCTS_PER_PAGE;
    return sortedProducts.slice(start, start + PRODUCTS_PER_PAGE);
  }, [sortedProducts, productPage]);

  const activeFiltersCount = useMemo(() => {
    let c = 0;
    if (searchQuery) c++;
    if (filterCategory !== "all") c++;
    if (filterAlert !== "all") c++;
    if (filterZone !== "all") c++;
    if (filterSupplier !== "all") c++;
    if (filterRenseigned !== "all") c++;
    return c;
  }, [searchQuery, filterCategory, filterAlert, filterZone, filterSupplier, filterRenseigned]);

  const resetAllFilters = () => {
    setSearchQuery("");
    setFilterCategory("all");
    setFilterAlert("all");
    setFilterZone("all");
    setFilterSupplier("all");
    setFilterRenseigned("all");
  };

  // Auto-seed if database is empty on first load
  useEffect(() => {
    if (dashboard && dashboard.total_products === 0 && !seeded && !loading) {
      seed();
    }
  }, [dashboard]);

  // Product CRUD
  // === ADJUSTMENT MODAL STATE (22/05/2026) ===
  // Quand l'admin modifie la quantité d'un produit dans le catalogue, on demande
  // un motif clair avant d'envoyer le PUT (qui créera un mouvement type 'ajustement').
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustInfo, setAdjustInfo] = useState({ old: 0, new: 0, delta: 0, name: "" });
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustCustomReason, setAdjustCustomReason] = useState("");

  const ADJUST_REASONS = [
    "Inventaire physique",
    "Casse / Avarie",
    "Vol / Perte",
    "Erreur de saisie",
    "Don / Offre",
    "Retour fournisseur",
    "Autre (préciser)",
  ];

  const performProductSave = async (extraPayload = {}) => {
    await axios.put(`${API}/products/${editingItem.id}`, { ...productForm, ...extraPayload });
    toast.success("Produit mis a jour");
    setShowProductModal(false); setEditingItem(null);
    fetchProducts(); fetchDashboard(); fetchMovements();
  };

  const saveProduct = async () => {
    try {
      if (editingItem) {
        const oldQty = Number(editingItem.quantity || 0);
        const newQty = Number(productForm.quantity || 0);
        const delta = newQty - oldQty;
        // Si la quantité change, on demande d'abord un motif (ouvre une modale)
        if (Math.abs(delta) > 0.0001) {
          setAdjustInfo({ old: oldQty, new: newQty, delta, name: editingItem.name });
          setAdjustReason("");
          setAdjustCustomReason("");
          setAdjustModalOpen(true);
          return; // L'envoi se fera après confirmation du motif
        }
        await performProductSave();
      } else {
        await axios.post(`${API}/products`, productForm);
        toast.success("Produit cree");
        setShowProductModal(false); setEditingItem(null); fetchProducts(); fetchDashboard();
      }
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const confirmAdjustmentAndSave = async () => {
    let reason = adjustReason;
    if (adjustReason === "Autre (préciser)") {
      reason = (adjustCustomReason || "").trim();
    }
    if (!reason || reason.length < 3) {
      toast.error("Motif obligatoire (min. 3 caractères)");
      return;
    }
    try {
      await performProductSave({
        adjustment_reason: reason,
        adjustment_user: "Administrateur",
      });
      setAdjustModalOpen(false);
      setAdjustReason("");
      setAdjustCustomReason("");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de l'ajustement");
    }
  };

  const deleteProduct = async (id) => {
    if (!window.confirm("Supprimer ce produit ?")) return;
    try { await axios.delete(`${API}/products/${id}`); toast.success("Produit supprime"); fetchProducts(); fetchDashboard(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const openEditProduct = (p) => {
    setEditingItem(p);
    setProductForm({ code: p.code, name: p.name, category_id: p.category_id, subcategory: p.subcategory || "", unit: p.unit, quantity: p.quantity, stock_min: p.stock_min, stock_max: p.stock_max, purchase_price: p.purchase_price, sale_price: p.sale_price || 0, supplier_id: p.supplier_id || "", storage_location: p.storage_location || "", storage_zone: p.storage_zone || "cuisine", date_achat: p.date_achat || "", date_peremption: p.date_peremption || "", observation: p.observation || "", photo_url: p.photo_url || "" });
    setShowProductModal(true);
  };

  // Movement
  const saveMovement = async () => {
    if (!movementForm.product_id || movementForm.quantity <= 0) { toast.error("Selectionnez un produit et une quantite"); return; }
    try {
      await axios.post(`${API}/movements`, { ...movementForm, user_name: "Administrateur" });
      toast.success("Mouvement enregistre");
      setShowMovementModal(false); fetchMovements(); fetchProducts(); fetchDashboard(); fetchMagasinProducts(); fetchMagasinMovements();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  // Purchase
  const addPurchaseItem = () => {
    if (!purchaseItem.product_id || purchaseItem.quantity <= 0) return;
    const p = products.find(x => x.id === purchaseItem.product_id);
    setPurchaseForm(prev => ({
      ...prev,
      items: [...prev.items, { ...purchaseItem, product_name: p?.name || "" }]
    }));
    setPurchaseItem({ product_id: "", quantity: 0, unit_price: 0 });
  };

  const savePurchase = async () => {
    if (purchaseForm.items.length === 0) { toast.error("Ajoutez au moins un article"); return; }
    try {
      await axios.post(`${API}/purchases`, { ...purchaseForm, user_name: "Administrateur" });
      toast.success("Achat enregistre - Stock mis a jour");
      setShowPurchaseModal(false);
      setPurchaseForm({ supplier_id: "", supplier_name: "", purchase_date: "", items: [], notes: "" });
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  // Supplier
  const saveSupplier = async () => {
    try {
      if (editingItem) {
        await axios.put(`${API}/suppliers/${editingItem.id}`, supplierForm);
        toast.success("Fournisseur mis a jour");
      } else {
        await axios.post(`${API}/suppliers`, supplierForm);
        toast.success("Fournisseur cree");
      }
      setShowSupplierModal(false); setEditingItem(null); fetchSuppliers();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  // Category
  const saveCategory = async () => {
    try {
      if (editingItem) {
        await axios.put(`${API}/categories/${editingItem.id}`, categoryForm);
        toast.success("Categorie mise a jour");
      } else {
        await axios.post(`${API}/categories`, categoryForm);
        toast.success("Categorie creee");
      }
      setShowCategoryModal(false); setEditingItem(null); fetchCategories();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const deleteCategory = async (id) => {
    if (!window.confirm("Supprimer cette categorie ?")) return;
    try { await axios.delete(`${API}/categories/${id}`); toast.success("Categorie supprimee"); fetchCategories(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const deleteSupplier = async (id) => {
    if (!window.confirm("Supprimer ce fournisseur ?")) return;
    try { await axios.delete(`${API}/suppliers/${id}`); toast.success("Fournisseur supprime"); fetchSuppliers(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  // Users CRUD
  const saveUser = async () => {
    try {
      if (editingItem) {
        await axios.put(`${API}/auth/users/${editingItem.id}`, userForm);
        toast.success("Utilisateur mis a jour");
      } else {
        if (!userForm.password) { toast.error("Le mot de passe est requis"); return; }
        await axios.post(`${API}/auth/users`, userForm);
        toast.success("Utilisateur cree");
      }
      setShowUserModal(false); setEditingItem(null); fetchUsers();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const deleteUser = async (id) => {
    if (!window.confirm("Supprimer cet utilisateur ?")) return;
    try { await axios.delete(`${API}/auth/users/${id}`); toast.success("Utilisateur supprime"); fetchUsers(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  // Recipe CRUD
  const addRecipeIngredient = () => {
    if (!recipeIngredient.product_id || recipeIngredient.quantity <= 0) return;
    // Cherche d'abord dans la liste exhaustive (allProducts) — celle filtrée
    // (`products`) peut ne pas contenir le produit si un filtre est actif.
    const pool = allProducts.length > 0 ? allProducts : products;
    const p = pool.find(x => x.id === recipeIngredient.product_id);
    setRecipeForm(prev => ({
      ...prev,
      ingredients: [...prev.ingredients, { product_id: recipeIngredient.product_id, product_name: p?.name || "", quantity: recipeIngredient.quantity, unit: p?.unit || "" }]
    }));
    setRecipeIngredient({ product_id: "", quantity: 0 });
  };

  const saveRecipe = async () => {
    if (!recipeForm.name || !recipeForm.caisse_product_name) { toast.error("Nom et nom Caisse requis"); return; }
    if (recipeForm.ingredients.length === 0) { toast.error("Ajoutez au moins un ingredient"); return; }
    try {
      if (editingItem) {
        await axios.put(`${API}/recipes/${editingItem.id}`, recipeForm);
        toast.success("Fiche technique mise a jour");
      } else {
        await axios.post(`${API}/recipes`, recipeForm);
        toast.success("Fiche technique creee");
      }
      setShowRecipeModal(false); setEditingItem(null); fetchRecipes();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const deleteRecipe = async (id) => {
    if (!window.confirm("Supprimer cette fiche technique ?")) return;
    try { await axios.delete(`${API}/recipes/${id}`); toast.success("Fiche supprimee"); fetchRecipes(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const openEditRecipe = (r) => {
    setEditingItem(r);
    setRecipeForm({ name: r.name, caisse_product_name: r.caisse_product_name, selling_price: r.selling_price || 0, ingredients: r.ingredients || [], notes: r.notes || "" });
    // Rafraîchit la liste exhaustive — au cas où des produits auraient été créés
    // depuis le dernier mount, ils doivent apparaître dans le dropdown.
    fetchAllProducts();
    setShowRecipeModal(true);
  };

  const seedDemoRecipes = async () => {
    try {
      const r = await axios.post(`${API}/recipes/seed-demo`);
      toast.success(r.data.message);
      fetchRecipes();
    } catch (e) { toast.error("Erreur lors du chargement des fiches demo"); }
  };

  // Reports
  const fetchReport = async (filters = reportFilters) => {
    setReportLoading(true);
    try {
      const params = {};
      if (filters.type && filters.type !== "all") params.type = filters.type;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      if (filters.search) params.search = filters.search;
      const r = await axios.get(`${API}/reports`, { params });
      setReport(r.data);
    } catch { toast.error("Erreur chargement rapport"); }
    finally { setReportLoading(false); }
  };

  const exportReport = (format) => {
    const params = new URLSearchParams();
    if (reportFilters.type && reportFilters.type !== "all") params.set("type", reportFilters.type);
    if (reportFilters.date_from) params.set("date_from", reportFilters.date_from);
    if (reportFilters.date_to) params.set("date_to", reportFilters.date_to);
    if (reportFilters.search) params.set("search", reportFilters.search);
    window.open(`${API}/reports/export/${format}?${params.toString()}`, "_blank");
  };

  // Inventory
  const createInventory = async (categoryId = "") => {
    try {
      const r = await axios.post(`${API}/inventories`, { category_id: categoryId, user_name: currentUser?.full_name || "Admin" });
      toast.success("Inventaire cree");
      setActiveInventory(r.data.inventory);
      fetchInventories();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const openInventory = async (id) => {
    try {
      const r = await axios.get(`${API}/inventories/${id}`);
      setActiveInventory(r.data.inventory);
    } catch (e) { toast.error("Erreur chargement"); }
  };

  const updateCount = async (productId, physicalQty) => {
    if (!activeInventory) return;
    try {
      await axios.put(`${API}/inventories/${activeInventory.id}/count`, { items: [{ product_id: productId, physical_quantity: parseFloat(physicalQty) || 0 }] });
      // Update local state
      setActiveInventory(prev => {
        const items = prev.items.map(i => {
          if (i.product_id === productId) {
            const pq = parseFloat(physicalQty) || 0;
            return { ...i, physical_quantity: pq, counted: true, ecart: parseFloat((pq - i.theoretical_quantity).toFixed(3)), ecart_value: parseFloat(((pq - i.theoretical_quantity) * i.purchase_price).toFixed(2)) };
          }
          return i;
        });
        return { ...prev, items, counted_products: items.filter(i => i.counted).length, total_ecart_value: items.filter(i => i.counted).reduce((s, i) => s + (i.ecart_value || 0), 0) };
      });
    } catch {}
  };

  const validateInventory = async () => {
    if (!activeInventory) return;
    if (!window.confirm("Valider cet inventaire ? Les stocks seront ajustes selon les quantites physiques saisies.")) return;
    try {
      const r = await axios.put(`${API}/inventories/${activeInventory.id}/validate`, { user_name: currentUser?.full_name || "Admin" });
      toast.success(r.data.message);
      setActiveInventory(prev => ({ ...prev, status: "valide" }));
      fetchInventories(); fetchProducts(); fetchDashboard();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const deleteInventory = async (id) => {
    if (!window.confirm("Supprimer cet inventaire ?")) return;
    try {
      await axios.delete(`${API}/inventories/${id}`);
      toast.success("Inventaire supprime");
      if (activeInventory?.id === id) setActiveInventory(null);
      fetchInventories();
    } catch (e) { toast.error("Erreur"); }
  };

  const catName = (id) => categories.find(c => c.id === id)?.name || "-";
  const supName = (id) => suppliers.find(s => s.id === id)?.name || "-";

  // Selection & Bulk delete
  const toggleSelect = (id) => setSelectedItems(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = (ids) => {
    const allSelected = ids.every(id => selectedItems.includes(id));
    setSelectedItems(allSelected ? selectedItems.filter(x => !ids.includes(x)) : [...new Set([...selectedItems, ...ids])]);
  };
  const clearSelection = () => setSelectedItems([]);

  const bulkDelete = async (endpoint, ids, label, refreshFn) => {
    if (!window.confirm(`Supprimer ${ids.length} ${label} ?`)) return;
    try {
      await axios.post(`${API}/${endpoint}`, { ids });
      toast.success(`${ids.length} ${label} supprime(s)`);
      clearSelection();
      refreshFn();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur suppression"); }
  };

  const deleteMovement = async (id) => {
    if (!window.confirm("Supprimer ce mouvement ?")) return;
    try { await axios.delete(`${API}/movements/${id}`); toast.success("Mouvement supprime"); fetchMovements(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const deletePurchase = async (id) => {
    if (!window.confirm("Supprimer cet achat ?")) return;
    try { await axios.delete(`${API}/purchases/${id}`); toast.success("Achat supprime"); fetchPurchases(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const resetQuantities = async (ids) => {
    if (!window.confirm(`Remettre a zero le stock de ${ids.length} produit(s) ?`)) return;
    try {
      const r = await axios.post(`${API}/products/reset-quantities`, { ids });
      toast.success(`${r.data.reset} produit(s) remis a zero`);
      clearSelection();
      fetchProducts(); fetchDashboard();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const resetSingleProduct = async (id) => {
    if (!window.confirm("Remettre ce produit a zero ?")) return;
    try {
      await axios.post(`${API}/products/reset-quantities`, { ids: [id] });
      toast.success(`Produit remis a zero`);
      fetchProducts(); fetchDashboard();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const resetPrices = async (ids) => {
    if (!window.confirm(`Remettre a zero le prix d'achat de ${ids.length} produit(s) ?`)) return;
    try {
      const r = await axios.post(`${API}/products/reset-prices`, { ids });
      toast.success(`${r.data.reset} prix remis a zero`);
      clearSelection();
      fetchProducts(); fetchDashboard();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const resetSinglePrice = async (id) => {
    if (!window.confirm("Remettre le prix d'achat a zero ?")) return;
    try {
      await axios.post(`${API}/products/reset-prices`, { ids: [id] });
      toast.success(`Prix remis a zero`);
      fetchProducts(); fetchDashboard();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  // Helper component for bulk delete bar
  const BulkBar = ({ count, label, endpoint, ids, refreshFn }) => count > 0 ? (
    <div className="flex items-center gap-3 bg-red-900/30 border border-red-700/50 rounded-lg px-4 py-2">
      <span className="text-red-400 text-sm font-medium">{count} selectionne(s)</span>
      <Button size="sm" className="bg-red-600 hover:bg-red-700 h-7 text-xs" onClick={() => bulkDelete(endpoint, ids, label, refreshFn)} data-testid="bulk-delete-btn">
        <Trash2 className="w-3 h-3 mr-1" /> Supprimer la selection
      </Button>
      <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-400" onClick={clearSelection}>Annuler</Button>
    </div>
  ) : null;

  const stockStatus = (p) => {
    if (p.quantity <= 0) return { label: "Rupture", color: "bg-red-500/20 text-red-400" };
    if (p.quantity <= p.stock_min) return { label: "Faible", color: "bg-orange-500/20 text-orange-400" };
    return { label: "Normal", color: "bg-emerald-500/20 text-emerald-400" };
  };

  return (
    <div className="min-h-screen bg-slate-950" data-testid="stock-page">
      <Toaster richColors position="top-right" />

      {/* LOGIN SCREEN */}
      {!currentUser && (
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="bg-slate-900 border-slate-800 w-full max-w-md">
            <CardContent className="p-8">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Warehouse className="w-8 h-8 text-emerald-400" />
                </div>
                <h1 className="text-2xl font-bold text-white">Gestion de Stock</h1>
                <p className="text-slate-400 text-sm mt-1">Espace Maxo - Connexion</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <Label className="text-slate-300 text-sm">Nom d'utilisateur</Label>
                  <Input data-testid="stock-login-username" value={loginForm.username} onChange={e => setLoginForm(p => ({...p, username: e.target.value}))}
                    className="bg-slate-800 border-slate-700 text-white mt-1" placeholder="Entrez votre identifiant" autoFocus />
                </div>
                <div>
                  <Label className="text-slate-300 text-sm">Mot de passe</Label>
                  <Input data-testid="stock-login-password" type="password" value={loginForm.password} onChange={e => setLoginForm(p => ({...p, password: e.target.value}))}
                    className="bg-slate-800 border-slate-700 text-white mt-1" placeholder="Entrez votre mot de passe" />
                </div>
                {loginError && <p className="text-red-400 text-sm" data-testid="stock-login-error">{loginError}</p>}
                <Button data-testid="stock-login-submit" type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" disabled={loginLoading}>
                  {loginLoading ? "Connexion..." : "Se connecter"}
                </Button>
              </form>
              <div className="mt-4 text-center">
                <a href="/" className="text-slate-500 hover:text-slate-300 text-xs">Retour a l'accueil</a>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* MAIN APP - Only shown when authenticated */}
      {currentUser && (
      <div className="flex min-h-screen">
      {/* Mobile overlay (clickable to close) */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
          data-testid="mobile-overlay"
        />
      )}
      {/* Sidebar */}
      <aside
        className={`bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 transition-transform z-40
          fixed md:sticky inset-y-0 left-0 top-0 h-screen w-72 md:w-64
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
      >
        <div className="p-5 border-b border-slate-800">
          <h1 className="text-xl font-bold text-white flex items-center gap-2"><Warehouse className="w-6 h-6 text-emerald-400" /> Gestion Stock</h1>
          <p className="text-slate-500 text-xs mt-1">Espace Maxo</p>
        </div>
        <div className="px-4 py-3 border-b border-slate-800">
          <p className="text-white text-sm font-medium">{currentUser.full_name}</p>
          <Badge className="bg-emerald-500/20 text-emerald-400 text-xs mt-1">{currentUser.role}</Badge>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV_GROUPS.map((group) => {
            // Si le groupe ne contient que des onglets admin-only et qu'on n'est pas admin, on le filtre
            const visibleSubtabs = group.subtabs.filter((s) => !s.adminOnly || isAdmin);
            if (visibleSubtabs.length === 0) return null;

            const isActiveGroup = visibleSubtabs.some((s) => s.id === activeSection);
            return (
              <button
                key={group.id}
                onClick={() => {
                  // Aller au premier sous-onglet visible du groupe
                  setActiveSection(visibleSubtabs[0].id);
                  clearSelection();
                  setMobileMenuOpen(false);
                }}
                data-testid={`nav-${group.id}`}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  isActiveGroup
                    ? 'bg-emerald-500/15 text-emerald-400 font-medium'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <group.icon className="w-4 h-4" /> {group.label}
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-800 space-y-1">
          <button onClick={handleLogout} className="flex items-center gap-2 text-slate-500 hover:text-white text-sm px-3 py-2 w-full"><LogOut className="w-4 h-4" /> Deconnexion</button>
          <a href="/caisse" className="flex items-center gap-2 text-slate-500 hover:text-white text-sm px-3 py-2"><LogOut className="w-4 h-4" /> Retour Caisse</a>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-6 overflow-auto w-full md:w-auto min-w-0">
        {/* Mobile top bar with hamburger */}
        <div className="md:hidden flex items-center justify-between mb-4 -mt-1">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="bg-slate-800 hover:bg-slate-700 text-white p-2 rounded-lg flex items-center gap-2"
            data-testid="mobile-menu-btn"
            aria-label="Ouvrir le menu"
          >
            <Filter className="w-5 h-5" />
            <span className="text-sm font-medium">Menu</span>
          </button>
          <span className="text-emerald-400 text-sm font-medium">
            {(() => {
              const g = findGroupForSection(activeSection);
              const s = g?.subtabs.find((x) => x.id === activeSection);
              return g && s ? `${g.label} · ${s.label}` : (s?.label || activeSection);
            })()}
          </span>
        </div>

        {/* Sub-navigation : affichée pour tout groupe qui a 2+ sous-onglets visibles
            Aération : flex-wrap (multi-lignes au lieu de scroll), padding+gap plus généreux, icônes plus visibles. */}
        {(() => {
          const g = findGroupForSection(activeSection);
          if (!g) return null;
          const visibleSubtabs = g.subtabs.filter((s) => !s.adminOnly || isAdmin);
          if (visibleSubtabs.length < 2) return null;
          return (
            <div className="mb-6" data-testid={`subnav-${g.id}`}>
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2 flex items-center gap-1.5">
                <g.icon className="w-3.5 h-3.5" /> {g.label}
              </p>
              <div className="flex items-center gap-2 flex-wrap border-b border-slate-800 pb-3">
                {visibleSubtabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setActiveSection(t.id); clearSelection(); }}
                    data-testid={`subnav-${t.id}`}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                      activeSection === t.id
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30 ring-1 ring-emerald-400/30'
                        : 'bg-slate-800/40 text-slate-300 hover:text-white hover:bg-slate-700/60 border border-slate-700/40'
                    }`}
                  >
                    <t.icon className="w-4 h-4" /> {t.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
        {/* DASHBOARD */}
        {activeSection === "dashboard" && (
          <div className="space-y-4 md:space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xl md:text-2xl font-bold text-white">Tableau de Bord</h2>
              <div className="flex gap-2">
                {!seeded && (!dashboard || dashboard.total_products === 0) && (
                  <Button onClick={seed} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="seed-btn"><Plus className="w-4 h-4 mr-1" /> Charger donnees demo</Button>
                )}
                <Button
                  variant="outline"
                  className="border-emerald-700/40 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200 disabled:opacity-50"
                  onClick={refreshAll}
                  disabled={isRefreshing}
                  title={lastRefresh ? `Dernière actualisation : ${lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : "Actualiser toutes les données"}
                  data-testid="refresh-all-btn"
                >
                  <RefreshCw className={`w-4 h-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
                  {isRefreshing ? "Actualisation..." : "Actualiser"}
                  {lastRefresh && !isRefreshing && (
                    <span className="ml-2 text-[10px] text-emerald-400/60 hidden sm:inline">
                      ({lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})
                    </span>
                  )}
                </Button>
              </div>
            </div>

            {dashboard && (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-4">
                  {[
                    { label: "Produits", value: dashboard.total_products, icon: Package, color: "blue" },
                    { label: "Critiques", value: dashboard.critical_products, icon: AlertTriangle, color: "red" },
                    { label: "Valeur Stock", value: `${formatPrice(dashboard.total_value)} F`, icon: TrendingUp, color: "emerald", small: true },
                    { label: "Entrees Auj.", value: dashboard.entrees_today, icon: ArrowDown, color: "green" },
                    { label: "Sorties Auj.", value: dashboard.sorties_today, icon: ArrowUp, color: "orange",
                      onClick: () => {
                        const next = !showSortiesDetail;
                        setShowSortiesDetail(next);
                        if (next) fetchSortiesDetail();
                      },
                      testid: "sorties-today-card",
                    },
                  ].map((c, i) => (
                    <Card
                      key={i}
                      className={`bg-slate-900/80 border-slate-800 ${c.onClick ? 'cursor-pointer hover:border-orange-500/50 transition' : ''}`}
                      onClick={c.onClick}
                      data-testid={c.testid}
                    >
                      <CardContent className="p-3 md:p-4">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-slate-400 text-[11px] md:text-xs leading-tight">{c.label}</span>
                          <c.icon className={`w-3.5 h-3.5 md:w-4 md:h-4 text-${c.color}-400 flex-shrink-0`} />
                        </div>
                        <p className={`${c.small ? 'text-sm md:text-lg' : 'text-lg md:text-2xl'} font-bold text-white truncate`}>{c.value}</p>
                        {c.onClick && (
                          <p className="text-orange-300/70 text-[9px] md:text-[10px] mt-1 leading-tight">{showSortiesDetail ? "Masquer" : "Voir détail"}</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* === DÉTAIL DES SORTIES === */}
                {showSortiesDetail && (
                  <Card className="bg-slate-900/80 border-orange-500/30" data-testid="sorties-detail-panel">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-orange-300 flex items-center gap-2">
                          <ArrowUp className="w-4 h-4" /> Détail des sorties
                        </CardTitle>
                        <Button size="sm" variant="ghost" onClick={() => setShowSortiesDetail(false)} className="text-slate-400 hover:text-white">
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Filtres */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-400">Du</label>
                          <Input type="date" value={sortiesFilters.date_from}
                            onChange={(e) => setSortiesFilters({...sortiesFilters, date_from: e.target.value})}
                            className="bg-slate-800 border-slate-700 text-white text-xs h-8" />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400">Au</label>
                          <Input type="date" value={sortiesFilters.date_to}
                            onChange={(e) => setSortiesFilters({...sortiesFilters, date_to: e.target.value})}
                            className="bg-slate-800 border-slate-700 text-white text-xs h-8" />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400">Motif</label>
                          <select value={sortiesFilters.motif}
                            onChange={(e) => setSortiesFilters({...sortiesFilters, motif: e.target.value})}
                            className="w-full bg-slate-800 border border-slate-700 rounded text-white text-xs h-8 px-2">
                            <option value="all">Tous</option>
                            <option value="sortie">Sortie / Vente</option>
                            <option value="perte">Perte</option>
                            <option value="casse">Casse</option>
                          </select>
                        </div>
                        <div className="md:col-span-1">
                          <label className="text-[10px] text-slate-400">Produit</label>
                          <Input value={sortiesFilters.product_q}
                            placeholder="Rechercher…"
                            onChange={(e) => setSortiesFilters({...sortiesFilters, product_q: e.target.value})}
                            className="bg-slate-800 border-slate-700 text-white text-xs h-8" />
                        </div>
                        <div className="flex items-end gap-1">
                          <Button size="sm" onClick={fetchSortiesDetail} disabled={sortiesLoading}
                            className="bg-orange-600 hover:bg-orange-700 h-8" data-testid="sorties-refresh-btn">
                            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${sortiesLoading ? 'animate-spin' : ''}`} />
                            Filtrer
                          </Button>
                        </div>
                      </div>

                      {/* Récap */}
                      <div className="flex items-center justify-between bg-orange-900/15 border border-orange-500/20 rounded p-2 flex-wrap gap-2">
                        <div className="text-xs text-slate-300">
                          <span className="text-orange-300 font-semibold">{sortiesDetail.length}</span> mouvement(s) ·
                          <span className="text-orange-300 font-semibold mx-1">
                            {sortiesDetail.reduce((s, m) => s + (m.quantity || 0), 0).toFixed(2)}
                          </span> unités
                        </div>
                        <div className="text-xs text-slate-300">
                          Valeur totale :
                          <span className="text-orange-300 font-bold ml-1">
                            {formatPrice(sortiesDetail.reduce((s, m) => s + (m.total_value || (m.quantity * m.unit_price) || 0), 0))} F
                          </span>
                        </div>
                      </div>

                      {/* Tableau */}
                      <div className="overflow-x-auto rounded border border-slate-800">
                        <table className="w-full text-xs" data-testid="sorties-table">
                          <thead className="bg-slate-800/50">
                            <tr>
                              <th className="text-left p-2 text-slate-400 font-medium">Date</th>
                              <th className="text-left p-2 text-slate-400 font-medium">Produit</th>
                              <th className="text-right p-2 text-slate-400 font-medium">Qté</th>
                              <th className="text-left p-2 text-slate-400 font-medium">Motif</th>
                              <th className="text-right p-2 text-slate-400 font-medium">PU</th>
                              <th className="text-right p-2 text-slate-400 font-medium">Total</th>
                              <th className="text-left p-2 text-slate-400 font-medium hidden md:table-cell">Réf / Utilisateur</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortiesDetail.length === 0 && (
                              <tr><td colSpan={7} className="text-center text-slate-500 py-6">
                                {sortiesLoading ? "Chargement…" : "Aucune sortie sur cette période"}
                              </td></tr>
                            )}
                            {sortiesDetail.map((m) => (
                              <tr key={m.id} className="border-t border-slate-800 hover:bg-slate-800/30">
                                <td className="p-2 text-slate-300 whitespace-nowrap">
                                  {new Date(m.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td className="p-2 text-white">{m.product_name}</td>
                                <td className="p-2 text-right text-orange-300 font-semibold">{m.quantity} {m.unit}</td>
                                <td className="p-2">
                                  <Badge className={`text-[10px] ${
                                    m.movement_type === 'sortie' ? 'bg-red-500/20 text-red-300' :
                                    m.movement_type === 'perte' ? 'bg-amber-500/20 text-amber-300' :
                                    m.movement_type === 'casse' ? 'bg-rose-500/20 text-rose-300' :
                                    'bg-slate-500/20 text-slate-300'
                                  }`}>
                                    {(m.reason || '').toLowerCase().includes('vente') ? '🛒 Vente' : MOVEMENT_TYPES.find(t => t.value === m.movement_type)?.label || m.movement_type}
                                  </Badge>
                                </td>
                                <td className="p-2 text-right text-slate-300">{formatPrice(m.unit_price || 0)} F</td>
                                <td className="p-2 text-right text-orange-200 font-bold">{formatPrice(m.total_value || (m.quantity * m.unit_price) || 0)} F</td>
                                <td className="p-2 text-slate-500 hidden md:table-cell text-[11px]">
                                  {m.reason && <div className="truncate max-w-[200px]" title={m.reason}>{m.reason}</div>}
                                  {m.user_name && <div className="text-slate-600">par {m.user_name}</div>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Caisse Sales Card */}
                {(dashboard.ventes_caisse_today > 0 || dashboard.ventes_caisse_value > 0) && (
                  <Card className="bg-gradient-to-r from-amber-900/20 to-orange-900/20 border-amber-500/30">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center">
                          <ShoppingCart className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                          <p className="text-amber-400 font-bold text-sm">Ventes Caisse du jour</p>
                          <p className="text-slate-400 text-xs">{dashboard.ventes_caisse_today} article(s) vendu(s) depuis la caisse</p>
                        </div>
                      </div>
                      <p className="text-amber-400 font-bold text-xl">{formatPrice(dashboard.ventes_caisse_value)} F</p>
                    </CardContent>
                  </Card>
                )}

                {/* Alerts */}
                <div className="grid md:grid-cols-2 gap-4">
                  {dashboard.rupture?.length > 0 && (
                    <Card className="bg-red-950/30 border-red-500/30">
                      <CardHeader className="pb-2"><CardTitle className="text-red-400 text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Rupture de stock ({dashboard.rupture.length})</CardTitle></CardHeader>
                      <CardContent className="space-y-1">
                        {dashboard.rupture.map(p => (
                          <div key={p.id} className="flex items-center justify-between py-1 px-2 bg-red-950/30 rounded text-sm">
                            <span className="text-white">{p.name}</span>
                            <Badge className="bg-red-500/20 text-red-400">0 {p.unit}</Badge>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                  {dashboard.faible?.length > 0 && (
                    <Card className="bg-orange-950/30 border-orange-500/30">
                      <CardHeader className="pb-2"><CardTitle className="text-orange-400 text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Stock faible ({dashboard.faible.length})</CardTitle></CardHeader>
                      <CardContent className="space-y-1">
                        {dashboard.faible.map(p => (
                          <div key={p.id} className="flex items-center justify-between py-1 px-2 bg-orange-950/30 rounded text-sm">
                            <span className="text-white">{p.name}</span>
                            <Badge className="bg-orange-500/20 text-orange-400">{p.quantity} / min {p.stock_min} {p.unit}</Badge>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                  {dashboard.expired?.length > 0 && (
                    <Card className="bg-rose-950/40 border-rose-500/50 animate-pulse-slow" data-testid="dashboard-expired-card">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-rose-300 text-sm flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 animate-pulse" />
                          Produits expir&eacute;s ({dashboard.expired_total ?? dashboard.expired.length})
                          <Badge className="ml-auto bg-rose-500/30 text-rose-200 text-[10px]">URGENT</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        {dashboard.expired.map(p => (
                          <div key={p.id} className="flex items-center justify-between gap-2 py-1 px-2 bg-rose-950/40 rounded text-sm" data-testid={`expired-row-${p.id}`}>
                            <div className="min-w-0 flex-1">
                              <p className="text-white truncate">{p.name}</p>
                              <p className="text-[10px] text-rose-300/70 font-mono">{p.date_peremption}{p.days_since > 0 ? ` · expir\u00e9 il y a ${p.days_since}j` : ""}</p>
                            </div>
                            <Badge className="bg-rose-500/30 text-rose-100 whitespace-nowrap">{p.quantity} {p.unit}</Badge>
                          </div>
                        ))}
                        {dashboard.expired_total > dashboard.expired.length && (
                          <p className="text-[10px] text-rose-300/60 italic text-center pt-1">
                            + {dashboard.expired_total - dashboard.expired.length} autre(s)&hellip;
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )}
                  {dashboard.peremption_proche?.length > 0 && (
                    <Card className="bg-amber-950/30 border-amber-500/40" data-testid="dashboard-peremption-card">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-amber-300 text-sm flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4" />
                          P&eacute;remption proche &le; 7j ({dashboard.peremption_proche_total ?? dashboard.peremption_proche.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        {dashboard.peremption_proche.map(p => {
                          const d = p.days_until ?? 0;
                          const label = d <= 0 ? "aujourd'hui" : (d === 1 ? "demain" : `dans ${d}j`);
                          const urgent = d <= 2;
                          return (
                            <div key={p.id} className={`flex items-center justify-between gap-2 py-1 px-2 rounded text-sm ${urgent ? "bg-amber-900/50" : "bg-amber-950/40"}`} data-testid={`peremption-row-${p.id}`}>
                              <div className="min-w-0 flex-1">
                                <p className="text-white truncate">{p.name}</p>
                                <p className="text-[10px] text-amber-300/70 font-mono">{p.date_peremption} &middot; {label}</p>
                              </div>
                              <Badge className={`whitespace-nowrap ${urgent ? "bg-amber-500/40 text-amber-100" : "bg-amber-500/20 text-amber-200"}`}>{p.quantity} {p.unit}</Badge>
                            </div>
                          );
                        })}
                        {dashboard.peremption_proche_total > dashboard.peremption_proche.length && (
                          <p className="text-[10px] text-amber-300/60 italic text-center pt-1">
                            + {dashboard.peremption_proche_total - dashboard.peremption_proche.length} autre(s)&hellip;
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Stock by Category */}
                {dashboard.stock_by_category && Object.keys(dashboard.stock_by_category).length > 0 && (
                  <Card className="bg-slate-900/80 border-slate-800">
                    <CardHeader><CardTitle className="text-white text-sm">Stock par Categorie</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.entries(dashboard.stock_by_category).map(([name, data]) => (
                          <div key={name} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                            <p className="text-slate-400 text-xs">{name}</p>
                            <p className="text-white font-bold">{data.count} produits</p>
                            <p className="text-emerald-400 text-sm">{formatPrice(data.value)} F</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Recent Movements */}
                {dashboard.recent_movements?.length > 0 && (
                  <Card className="bg-slate-900/80 border-slate-800">
                    <CardHeader><CardTitle className="text-white text-sm">Derniers Mouvements</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {dashboard.recent_movements.slice(0, 8).map(m => (
                          <div key={m.id} className="flex items-center justify-between py-2 px-3 bg-slate-800/30 rounded-lg text-sm">
                            <div className="flex items-center gap-3">
                              <Badge className={`text-xs ${m.movement_type === 'entree' || m.movement_type === 'retour_fournisseur' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                {MOVEMENT_TYPES.find(t => t.value === m.movement_type)?.label || m.movement_type}
                              </Badge>
                              <span className="text-white">{m.product_name}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-slate-400">{m.quantity} {m.unit}</span>
                              <span className="text-slate-600 text-xs">{new Date(m.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        )}


        {/* LIAISONS CAISSE↔STOCK (bidirectionnel) */}
        {activeSection === "caisse_links" && (
          <CaisseStockLinksOverview />
        )}

        {/* PORTIONNEMENT */}
        {activeSection === "portionnement" && (
          <PortionnementTab />
        )}


        {/* DÉSTOCKAGE LIVE */}
        {activeSection === "destock_live" && (
          <div className="space-y-4" data-testid="destock-live-tab">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Activity className="w-6 h-6 text-cyan-400" />
                  Déstockage Live
                </h2>
                <p className="text-slate-500 text-sm mt-0.5">
                  Visibilité temps réel sur les ventes qui déstockent automatiquement le stock
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={fetchDestockLive} variant="outline"
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                  disabled={destockLiveLoading} data-testid="destock-refresh-btn">
                  <RefreshCw className={`w-4 h-4 mr-1 ${destockLiveLoading ? 'animate-spin' : ''}`} />
                  Actualiser
                </Button>
                <Button onClick={runSmartLink} className="bg-amber-600 hover:bg-amber-700"
                  data-testid="destock-smart-link-btn">
                  <Zap className="w-4 h-4 mr-1" /> Lier produits non liés
                </Button>
              </div>
            </div>

            {destockLive && (
              <>
                {/* Summary KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="destock-kpis">
                  <Card className="bg-emerald-900/20 border-emerald-500/40">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-emerald-300/80 text-xs uppercase tracking-wider">Liés au stock</p>
                          <p className="text-emerald-300 font-bold text-3xl mt-1">
                            {destockLive.summary.linked_count}
                            <span className="text-base text-emerald-400/70">/{destockLive.summary.total_caisse_products}</span>
                          </p>
                        </div>
                        <Link2 className="w-8 h-8 text-emerald-400/60" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-rose-900/20 border-rose-500/40">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-rose-300/80 text-xs uppercase tracking-wider">Non liés (≠ déstockent)</p>
                          <p className="text-rose-300 font-bold text-3xl mt-1">{destockLive.summary.unlinked_count}</p>
                        </div>
                        <AlertTriangle className="w-8 h-8 text-rose-400/60" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-cyan-900/20 border-cyan-500/40">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-cyan-300/80 text-xs uppercase tracking-wider">Sorties auto récentes</p>
                          <p className="text-cyan-300 font-bold text-3xl mt-1">{destockLive.summary.recent_sales_count}</p>
                        </div>
                        <Activity className="w-8 h-8 text-cyan-400/60" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-amber-900/20 border-amber-500/40">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-amber-300/80 text-xs uppercase tracking-wider">Liés sans vente 30j</p>
                          <p className="text-amber-300 font-bold text-3xl mt-1">{destockLive.summary.linked_no_sales_count}</p>
                        </div>
                        <TrendingDown className="w-8 h-8 text-amber-400/60" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Recent sales table */}
                <Card className="bg-slate-800/50 border-slate-700" data-testid="destock-recent-sales">
                  <CardHeader>
                    <CardTitle className="text-cyan-400 flex items-center gap-2">
                      <Activity className="w-5 h-5" /> Sorties auto-déstockées (récentes)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {destockLive.recent_sales.length === 0 ? (
                      <p className="text-slate-500 text-sm italic text-center py-4">
                        Aucune sortie auto enregistrée. Les ventes validées (statut "validated") déstockeront ici.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-slate-400 border-b border-slate-700">
                              <th className="p-2">Date</th>
                              <th className="p-2">Produit Stock</th>
                              <th className="p-2 text-right">Quantité</th>
                              <th className="p-2">Type</th>
                              <th className="p-2">Facture</th>
                            </tr>
                          </thead>
                          <tbody>
                            {destockLive.recent_sales.map((m) => {
                              const reason = m.reason || "";
                              const isDirect = reason.includes("lien direct");
                              const isRecipe = reason.includes("Recette");
                              const factureMatch = reason.match(/Facture (\S+)/);
                              return (
                                <tr key={m.id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                                  <td className="p-2 text-slate-300 text-xs">{m.created_at?.slice(0, 16).replace("T", " ")}</td>
                                  <td className="p-2 text-white font-medium">{m.product_name}</td>
                                  <td className="p-2 text-right text-rose-300 font-bold">-{m.quantity} {m.unit}</td>
                                  <td className="p-2">
                                    {isDirect && <Badge className="bg-emerald-500/20 text-emerald-300">Lien direct</Badge>}
                                    {isRecipe && <Badge className="bg-purple-500/20 text-purple-300">Recette</Badge>}
                                    {!isDirect && !isRecipe && <Badge className="bg-slate-500/20 text-slate-300">Autre</Badge>}
                                  </td>
                                  <td className="p-2 text-cyan-400 text-xs">{factureMatch ? factureMatch[1] : "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Unlinked caisse products */}
                {destockLive.unlinked_caisse_products.length > 0 && (
                  <Card className="bg-rose-900/10 border-rose-500/30" data-testid="destock-unlinked">
                    <CardHeader>
                      <CardTitle className="text-rose-300 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" />
                        Produits Caisse non liés ({destockLive.unlinked_caisse_products.length})
                      </CardTitle>
                      <p className="text-slate-400 text-xs mt-1">
                        Ces produits ne déstockent jamais. Cliquez sur "Lier produits non liés" en haut pour tenter une liaison automatique par mot-clé,
                        ou liez-les manuellement depuis l'onglet Caisse → Produits.
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {destockLive.unlinked_caisse_products.map((cp) => (
                          <div key={cp.id} className="bg-slate-800/50 rounded p-2 text-xs flex items-center gap-2"
                               data-testid={`unlinked-card-${cp.id}`}>
                            <div className="flex-1 min-w-0">
                              <p className="text-white truncate font-medium">{cp.name}</p>
                              <p className="text-slate-500">{cp.category || "Sans catégorie"} · {formatPrice(cp.price)} F</p>
                            </div>
                            <Button size="sm" onClick={() => openLinkModal(cp)}
                              className="bg-emerald-600 hover:bg-emerald-700 h-7 px-2 text-xs"
                              data-testid={`link-btn-${cp.id}`}>
                              <Link2 className="w-3 h-3 mr-1" /> Lier
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* Modal: Manual link an unlinked caisse product to a stock product */}
            <Dialog open={!!linkModalCp} onOpenChange={(open) => { if (!open) setLinkModalCp(null); }}>
              <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-lg" data-testid="link-modal">
                <DialogHeader>
                  <DialogTitle className="text-emerald-400 flex items-center gap-2">
                    <Link2 className="w-5 h-5" />
                    Lier au stock : {linkModalCp?.name}
                  </DialogTitle>
                  <DialogDescription className="text-slate-400">
                    Cherchez le produit Stock à associer. Une fois lié, chaque vente déstockera automatiquement.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <Input
                    autoFocus
                    placeholder="Nom du produit stock (ex: poulet, frites…)"
                    value={linkSearchQuery}
                    onChange={(e) => searchStockForLink(e.target.value)}
                    className="bg-slate-800 border-slate-600 text-white"
                    data-testid="link-search-input"
                  />
                  {linkSearching && <p className="text-slate-500 text-xs italic">Recherche…</p>}
                  <div className="max-h-72 overflow-y-auto space-y-1">
                    {linkSearchResults.length === 0 && !linkSearching && (
                      <p className="text-slate-500 text-sm italic text-center py-4">
                        {linkSearchQuery.length < 2 ? "Tapez au moins 2 caractères" : "Aucun produit stock trouvé"}
                      </p>
                    )}
                    {linkSearchResults.map((sp) => (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => confirmManualLink(sp)}
                        className="w-full text-left bg-slate-800 hover:bg-emerald-900/40 border border-slate-700 hover:border-emerald-500 rounded p-2 transition-colors"
                        data-testid={`link-result-${sp.id}`}
                      >
                        <div className="flex justify-between items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium truncate">{sp.name}</p>
                            <p className="text-slate-400 text-xs">
                              {sp.category || "—"} · {sp.quantity ?? 0} {sp.unit || ""}
                              {sp.score ? ` · score ${Math.round(sp.score * 100)}%` : ""}
                            </p>
                          </div>
                          <CheckSquare className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* PRODUCTS */}
        {activeSection === "products" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Package className="w-6 h-6 text-emerald-400" />
                  Produits
                </h2>
                <p className="text-slate-500 text-sm mt-0.5">Gestion du catalogue et des niveaux de stock</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => { setShowMovementModal(true); setMovementForm({ product_id: "", movement_type: "entree", quantity: 0, unit_price: 0, reason: "" }); setMovementProductSearch(""); }}
                  className="bg-blue-600 hover:bg-blue-700" data-testid="new-movement-btn"><ArrowUpDown className="w-4 h-4 mr-1" /> Mouvement</Button>
                {isAdmin && (
                  <Button onClick={() => setShowBulkConvertModal(true)}
                    className="bg-violet-600 hover:bg-violet-700" data-testid="bulk-convert-btn" title="Convertir toutes les unités package d'une catégorie en unité interne">
                    <Package className="w-4 h-4 mr-1" /> Convertir par lot
                  </Button>
                )}
                <Button onClick={() => { setEditingItem(null); setProductForm({ code: "", name: "", category_id: categories[0]?.id || "", subcategory: "", unit: "kg", quantity: 0, stock_min: 5, stock_max: 100, purchase_price: 0, sale_price: 0, supplier_id: "", storage_location: "", date_achat: "", date_peremption: "", observation: "", photo_url: "" }); setShowProductModal(true); }}
                  className="bg-emerald-600 hover:bg-emerald-700" data-testid="new-product-btn"><Plus className="w-4 h-4 mr-1" /> Nouveau Produit</Button>
              </div>
            </div>

            {/* KPI Summary Cards */}
            {products.length > 0 && (() => {
              const totalProducts = products.length;
              const renseigned = products.filter(p => p.quantity > 0 || p.purchase_price > 0).length;
              const totalValue = products.reduce((s, p) => s + (p.quantity * p.purchase_price || 0), 0);
              const totalValueVente = products.reduce((s, p) => s + (p.quantity * (p.sale_price || 0) || 0), 0);
              const margin = totalValueVente - totalValue;
              const rupture = products.filter(p => p.quantity <= 0).length;
              const faible = products.filter(p => p.quantity > 0 && p.quantity <= p.stock_min).length;
              return (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="products-kpi-cards">
                  <Card className="bg-gradient-to-br from-slate-800/60 to-slate-900/80 border-slate-700">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-slate-400 text-xs uppercase tracking-wider">Total produits</p>
                          <p className="text-2xl font-bold text-white mt-1" data-testid="kpi-total">{totalProducts}</p>
                        </div>
                        <Package className="w-8 h-8 text-slate-500" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-emerald-900/40 to-slate-900/80 border-emerald-700/40">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-emerald-300 text-xs uppercase tracking-wider">Renseignés</p>
                          <p className="text-2xl font-bold text-white mt-1" data-testid="kpi-renseigned">{renseigned}</p>
                          <p className="text-slate-500 text-[11px] mt-0.5">sur {totalProducts} ({totalProducts > 0 ? Math.round(renseigned / totalProducts * 100) : 0}%)</p>
                        </div>
                        <CheckSquare className="w-8 h-8 text-emerald-400/60" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-cyan-900/40 to-slate-900/80 border-cyan-700/40">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-cyan-300 text-xs uppercase tracking-wider">Valeur achat</p>
                          <p className="text-2xl font-bold text-white mt-1" data-testid="kpi-value">{formatPrice(totalValue)}</p>
                          <p className="text-slate-500 text-[11px] mt-0.5">F CFA · au coût</p>
                        </div>
                        <TrendingUp className="w-8 h-8 text-cyan-400/60" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-emerald-900/40 to-slate-900/80 border-emerald-700/40">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-emerald-300 text-xs uppercase tracking-wider">Valeur vente</p>
                          <p className="text-2xl font-bold text-white mt-1" data-testid="kpi-value-vente">{formatPrice(totalValueVente)}</p>
                          <p className="text-slate-500 text-[11px] mt-0.5">F CFA · au prix de vente</p>
                          {margin !== 0 && (
                            <p className={`text-[11px] mt-0.5 font-semibold ${margin >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {margin >= 0 ? "+" : ""}{formatPrice(margin)} F · marge potentielle
                            </p>
                          )}
                        </div>
                        <TrendingUp className="w-8 h-8 text-emerald-400/60" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card className={`bg-gradient-to-br ${rupture > 0 ? 'from-red-900/50 to-slate-900/80 border-red-600/50' : 'from-amber-900/30 to-slate-900/80 border-amber-700/40'}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={`${rupture > 0 ? 'text-red-300' : 'text-amber-300'} text-xs uppercase tracking-wider`}>Alertes</p>
                          <p className="text-2xl font-bold text-white mt-1" data-testid="kpi-alerts">{rupture + faible}</p>
                          <p className="text-slate-500 text-[11px] mt-0.5">
                            {rupture > 0 && <span className="text-red-400">{rupture} rupture</span>}
                            {rupture > 0 && faible > 0 && <span> · </span>}
                            {faible > 0 && <span className="text-orange-400">{faible} faible</span>}
                            {rupture === 0 && faible === 0 && <span className="text-emerald-400">Aucune</span>}
                          </p>
                        </div>
                        <AlertTriangle className={`w-8 h-8 ${rupture > 0 ? 'text-red-400/70' : 'text-amber-400/60'}`} />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}

            {/* Filters */}
            <div className="flex gap-2 flex-wrap items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Rechercher un produit..."
                  className="bg-slate-900 border-slate-700 text-white pl-9" data-testid="product-search" />
              </div>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-white w-[180px]" data-testid="filter-category"><SelectValue placeholder="Categorie" /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all" className="text-white">Toutes catégories</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={c.id} className="text-white">{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterAlert} onValueChange={setFilterAlert}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-white w-[160px]" data-testid="filter-alert"><SelectValue placeholder="Alerte" /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all" className="text-white">Tous niveaux</SelectItem>
                  <SelectItem value="rupture" className="text-red-400">Rupture</SelectItem>
                  <SelectItem value="faible" className="text-orange-400">Stock faible</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterZone} onValueChange={setFilterZone}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-white w-[140px]" data-testid="filter-zone"><SelectValue placeholder="Zone" /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all" className="text-white">Toutes zones</SelectItem>
                  <SelectItem value="cuisine" className="text-emerald-400">Restau</SelectItem>
                  <SelectItem value="magasin" className="text-cyan-400">Magasin</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-white w-[180px]" data-testid="filter-supplier"><SelectValue placeholder="Fournisseur" /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 max-h-[300px]">
                  <SelectItem value="all" className="text-white">Tous fournisseurs</SelectItem>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id} className="text-white">{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterRenseigned} onValueChange={setFilterRenseigned}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-white w-[150px]" data-testid="filter-renseigned"><SelectValue placeholder="État" /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all" className="text-white">Tous</SelectItem>
                  <SelectItem value="yes" className="text-emerald-400">Renseignés</SelectItem>
                  <SelectItem value="no" className="text-slate-400">Non renseignés</SelectItem>
                </SelectContent>
              </Select>
              {activeFiltersCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetAllFilters}
                  className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                  data-testid="filter-reset"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" /> Réinitialiser
                  <Badge className="ml-1.5 bg-amber-500/20 text-amber-300 text-[10px]">{activeFiltersCount}</Badge>
                </Button>
              )}
            </div>

            <div className="text-slate-500 text-sm flex items-center gap-3">
              <span>
                {sortedProducts.length === products.length
                  ? `${products.length} produit${products.length > 1 ? 's' : ''}`
                  : `${sortedProducts.length} / ${products.length} produit${products.length > 1 ? 's' : ''} (filtré${sortedProducts.length > 1 ? 's' : ''})`}
              </span>
              {isAdmin && (() => {
                const sel = selectedItems.filter(id => products.some(p => p.id === id));
                return sel.length > 0 ? (
                  <div className="flex items-center gap-3 bg-slate-800/80 border border-slate-700/50 rounded-lg px-4 py-2">
                    <span className="text-amber-400 text-sm font-medium">{sel.length} selectionne(s)</span>
                    <Button size="sm" className="bg-orange-600 hover:bg-orange-700 h-7 text-xs" onClick={() => resetQuantities(sel)} data-testid="bulk-reset-btn">
                      <RefreshCw className="w-3 h-3 mr-1" /> RAZ Quantites
                    </Button>
                    <Button size="sm" className="bg-amber-600 hover:bg-amber-700 h-7 text-xs" onClick={() => resetPrices(sel)} data-testid="bulk-reset-prices-btn">
                      <RefreshCw className="w-3 h-3 mr-1" /> RAZ Prix
                    </Button>
                    <Button size="sm" className="bg-red-600 hover:bg-red-700 h-7 text-xs" onClick={() => bulkDelete("products/delete-bulk", sel, "produit(s)", () => { fetchProducts(); fetchDashboard(); })} data-testid="bulk-delete-btn">
                      <Trash2 className="w-3 h-3 mr-1" /> Supprimer
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-400" onClick={clearSelection}>Annuler</Button>
                  </div>
                ) : null;
              })()}
            </div>

            {/* Empty state with seed button */}
            {products.length === 0 && (
              <Card className="bg-slate-900/80 border-slate-800">
                <CardContent className="py-12 text-center">
                  <Package className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 mb-4">Aucun produit trouve dans la base de donnees.</p>
                  <Button onClick={seed} className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={loading}>
                    <Plus className="w-4 h-4 mr-2" /> {loading ? "Chargement en cours..." : "Charger les 441 produits de demonstration"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Product Table — refined presentation */}
            {products.length > 0 && (
            <Card className="bg-slate-900/80 border-slate-800 overflow-hidden">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="text-left text-slate-400 border-b border-slate-800 bg-slate-900">
                        {isAdmin && <th className="p-3 w-8"><input type="checkbox" className="rounded bg-slate-800 border-slate-600" checked={sortedProducts.length > 0 && sortedProducts.every(p => selectedItems.includes(p.id))} onChange={() => toggleSelectAll(sortedProducts.map(p => p.id))} /></th>}
                        <th className="p-3 font-semibold uppercase text-[11px] tracking-wider">Produit</th>
                        <th className="p-3 font-semibold uppercase text-[11px] tracking-wider">Catégorie</th>
                        <th className="p-3 font-semibold uppercase text-[11px] tracking-wider w-[200px]">Stock</th>
                        <th className="p-3 font-semibold uppercase text-[11px] tracking-wider text-right">Prix achat</th>
                        <th className="p-3 font-semibold uppercase text-[11px] tracking-wider text-right">Prix vente</th>
                        <th className="p-3 font-semibold uppercase text-[11px] tracking-wider text-right">Valeur achat</th>
                        <th className="p-3 font-semibold uppercase text-[11px] tracking-wider text-right">Valeur vente</th>
                        <th className="p-3 font-semibold uppercase text-[11px] tracking-wider">Statut</th>
                        <th className="p-3 font-semibold uppercase text-[11px] tracking-wider">Lieu</th>
                        <th className="p-3 font-semibold uppercase text-[11px] tracking-wider"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedProducts.map((p, idx) => {
                        const status = stockStatus(p);
                        const isEmpty = !(p.quantity > 0) && !(p.purchase_price > 0);
                        const stockMax = Math.max(p.stock_max || 0, p.stock_min * 4 || 20, p.quantity || 0);
                        const stockPct = stockMax > 0 ? Math.min(100, (p.quantity / stockMax) * 100) : 0;
                        const barColor = p.quantity <= 0 ? 'bg-red-500' : p.quantity <= p.stock_min ? 'bg-orange-500' : 'bg-emerald-500';
                        const selected = selectedItems.includes(p.id);
                        return (
                          <tr
                            key={p.id}
                            className={`border-b border-slate-800/60 transition-colors ${selected ? 'bg-emerald-900/10' : (idx % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/10')} hover:bg-slate-800/50 ${isEmpty ? 'opacity-60' : ''}`}
                            data-testid={`product-row-${p.id}`}
                          >
                            {isAdmin && <td className="p-3"><input type="checkbox" className="rounded bg-slate-800 border-slate-600" checked={selected} onChange={() => toggleSelect(p.id)} /></td>}
                            {/* Produit: photo + code + nom */}
                            <td className="p-3">
                              <div className="flex items-center gap-3">
                                {p.photo_url ? (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setPhotoZoom({ url: p.photo_url, name: p.name }); }}
                                    className="w-10 h-10 rounded-md overflow-hidden border border-slate-700 hover:border-emerald-500 transition-colors flex-shrink-0"
                                    data-testid={`product-thumb-${p.id}`}
                                    title="Agrandir"
                                  >
                                    <img src={p.photo_url} alt={p.name} className="w-full h-full object-cover" />
                                  </button>
                                ) : (
                                  <div className="w-10 h-10 rounded-md border border-dashed border-slate-700 bg-slate-800/40 flex items-center justify-center flex-shrink-0">
                                    <ImageIcon className="w-4 h-4 text-slate-600" />
                                  </div>
                                )}
                                <div className="flex flex-col min-w-0">
                                  <span className="text-white font-medium leading-tight truncate">{p.name}</span>
                                  <span className="text-slate-500 font-mono text-[11px] mt-0.5">{p.code}</span>
                                  {isEmpty && <Badge className="bg-slate-700/60 text-slate-400 text-[9px] mt-1 w-fit border border-slate-600/40">Non renseigné</Badge>}
                                </div>
                              </div>
                            </td>
                            {/* Catégorie + sous-cat */}
                            <td className="p-3">
                              <div className="flex flex-col gap-1">
                                <Badge className="bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[10px] w-fit">{catName(p.category_id)}</Badge>
                                {p.subcategory && <span className="text-slate-500 text-[10px]">{p.subcategory}</span>}
                              </div>
                            </td>
                            {/* Stock: quantité + unité + barre de progression vs max */}
                            <td className="p-3">
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-baseline gap-1.5">
                                  <span className={`font-bold text-base ${p.quantity <= 0 ? 'text-red-400' : p.quantity <= p.stock_min ? 'text-orange-400' : 'text-emerald-400'}`}>{p.quantity}</span>
                                  <span className="text-slate-500 text-xs">{p.unit}</span>
                                  {isAdmin && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 p-0 text-emerald-400/70 hover:text-emerald-300 hover:bg-emerald-500/20"
                                      onClick={(e) => { e.stopPropagation(); openAddPackage(p); }}
                                      title="Ajouter par package (casier, pack, carton...)"
                                      data-testid={`add-pkg-${p.id}`}
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                  {isAdmin && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 p-0 text-violet-400/70 hover:text-violet-300 hover:bg-violet-500/20"
                                      onClick={(e) => { e.stopPropagation(); openConvertUnit(p); }}
                                      title="Convertir en unité interne (ex: casier → bouteille, lot → unité…)"
                                      data-testid={`convert-unit-${p.id}`}
                                    >
                                      <Package className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                  <span className="text-slate-600 text-[10px] ml-auto">min: {p.stock_min}</span>
                                </div>
                                <div className="h-1.5 bg-slate-800/80 rounded-full overflow-hidden">
                                  <div className={`h-full ${barColor} transition-all`} style={{ width: `${stockPct}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-right">
                              <span className={p.purchase_price > 0 ? 'text-slate-200 font-medium' : 'text-slate-600 italic text-xs'}>
                                {p.purchase_price > 0 ? `${formatPrice(p.purchase_price)} F` : '—'}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <span className={p.sale_price > 0 ? 'text-emerald-300 font-medium' : 'text-slate-600 italic text-xs'}>
                                {p.sale_price > 0 ? `${formatPrice(p.sale_price)} F` : '—'}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <span className={p.quantity * p.purchase_price > 0 ? 'text-cyan-300 font-semibold' : 'text-slate-600'}>
                                {p.quantity * p.purchase_price > 0 ? `${formatPrice(p.quantity * p.purchase_price)} F` : '—'}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <span className={p.quantity * (p.sale_price || 0) > 0 ? 'text-emerald-400 font-semibold' : 'text-slate-600'}>
                                {p.quantity * (p.sale_price || 0) > 0 ? `${formatPrice(p.quantity * (p.sale_price || 0))} F` : '—'}
                              </span>
                            </td>
                            <td className="p-3"><Badge className={status.color + " text-[10px] border border-current/20"}>{status.label}</Badge></td>
                            <td className="p-3 text-slate-500 text-xs">{p.storage_location || '—'}</td>
                            <td className="p-3">
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10" onClick={() => openEditProduct(p)} title="Modifier"><Edit2 className="w-3.5 h-3.5" /></Button>
                                {isAdmin && p.quantity > 0 && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-orange-400 hover:bg-orange-500/10" onClick={() => resetSingleProduct(p.id)} title="RAZ quantité"><RefreshCw className="w-3.5 h-3.5" /></Button>}
                                {isAdmin && p.purchase_price > 0 && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10" onClick={() => resetSinglePrice(p.id)} title="RAZ prix"><X className="w-3.5 h-3.5" /></Button>}
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-red-400 hover:bg-red-500/10" onClick={() => deleteProduct(p.id)} title="Supprimer"><Trash2 className="w-3.5 h-3.5" /></Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination (Phase 4 perf) */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between p-3 border-t border-slate-700/50 bg-slate-900/30" data-testid="products-pagination">
                    <span className="text-slate-400 text-sm">
                      Page <span className="text-white font-medium">{productPage}</span> / {totalPages}
                      <span className="text-slate-500 text-xs ml-2">
                        ({((productPage - 1) * PRODUCTS_PER_PAGE) + 1}-{Math.min(productPage * PRODUCTS_PER_PAGE, sortedProducts.length)} sur {sortedProducts.length})
                      </span>
                    </span>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setProductPage(1)} disabled={productPage === 1} className="border-slate-600 text-slate-300 h-8" data-testid="pagination-first">«</Button>
                      <Button size="sm" variant="outline" onClick={() => setProductPage(p => Math.max(1, p - 1))} disabled={productPage === 1} className="border-slate-600 text-slate-300 h-8" data-testid="pagination-prev">Précédent</Button>
                      <Button size="sm" variant="outline" onClick={() => setProductPage(p => Math.min(totalPages, p + 1))} disabled={productPage === totalPages} className="border-slate-600 text-slate-300 h-8" data-testid="pagination-next">Suivant</Button>
                      <Button size="sm" variant="outline" onClick={() => setProductPage(totalPages)} disabled={productPage === totalPages} className="border-slate-600 text-slate-300 h-8" data-testid="pagination-last">»</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            )}
          </div>
        )}

        {/* STOCK MAGASIN — Zone "manuelle uniquement" : pas de déstockage auto par les factures */}
        {activeSection === "magasin" && (
          <div className="space-y-4" data-testid="magasin-section">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Warehouse className="w-7 h-7 text-amber-400" />
                  Stock Magasin
                  <Badge className="bg-amber-500/20 text-amber-300 ml-1 text-xs">Déstockage manuel uniquement</Badge>
                </h2>
                <p className="text-slate-500 text-xs mt-0.5">
                  Cette zone n'est PAS affectée par les ventes Caisse. Toute sortie doit être enregistrée manuellement.
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                  onClick={() => { fetchMagasinProducts(); fetchMagasinMovements(); }}
                  data-testid="magasin-refresh-btn"
                >
                  <Activity className="w-4 h-4 mr-1" /> Actualiser
                </Button>
                <Button
                  onClick={() => {
                    const first = magasinProducts[0]?.id || "";
                    // "Nouveau Mouvement" magasin = usages rares (perte, casse, ajustement, retour fournisseur, entrée réappro)
                    // Pour une SORTIE vers cuisine, l'utilisateur doit utiliser le bouton "→ Cuisine" sur la ligne.
                    setMovementForm({ product_id: first, movement_type: "perte", quantity: 0, unit_price: 0, reason: "" });
                    setShowMovementModal(true);
                  }}
                  className="bg-amber-600 hover:bg-amber-700"
                  data-testid="magasin-new-movement-btn"
                  disabled={magasinProducts.length === 0}
                  title="Enregistrer une perte, casse, ajustement ou retour fournisseur"
                >
                  <Plus className="w-4 h-4 mr-1" /> Perte / Ajustement
                </Button>
                {isAdmin && (
                  <Button
                    onClick={() => {
                      setEditingItem(null);
                      setProductForm({
                        code: "", name: "", category_id: categories[0]?.id || "",
                        subcategory: "", unit: "piece", quantity: 0, stock_min: 5, stock_max: 100,
                        purchase_price: 0, sale_price: 0, supplier_id: "", storage_location: "",
                        storage_zone: "magasin", is_active: true, photo_url: "",
                        date_achat: "", date_peremption: "", observation: ""
                      });
                      setShowProductModal(true);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700"
                    data-testid="magasin-new-product-btn"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Produit magasin
                  </Button>
                )}
              </div>
            </div>

            {/* Info banner */}
            <div className="bg-amber-500/10 border border-amber-500/40 rounded-lg p-3 text-xs text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Comment ça fonctionne :</strong> les produits de cette zone ne sont <strong>jamais</strong> déstockés automatiquement par les factures Caisse.
                Pour sortir du stock magasin vers le restau (et bénéficier du déstockage automatique), cliquez sur <strong className="text-blue-300">"→ Restau"</strong> sur la ligne — cela crée atomiquement une sortie magasin + une entrée restau.
                Le bouton <em>Perte / Ajustement</em> ne sert qu'aux cas exceptionnels (casse, péremption, inventaire).
              </span>
            </div>

            {/* Products (real-time quantities) */}
            <Card className="bg-slate-900/80 border-slate-800">
              <CardHeader className="pb-2 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <CardTitle className="text-amber-300 text-lg flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Produits ({magasinProducts.length})
                </CardTitle>
                <Input
                  placeholder="Rechercher un produit..."
                  value={magasinSearch}
                  onChange={(e) => setMagasinSearch(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white w-full md:w-64"
                  data-testid="magasin-search"
                />
              </CardHeader>
              <CardContent className="p-0">
                {magasinProducts.length === 0 ? (
                  <div className="text-center py-10 text-slate-500">
                    <Warehouse className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Aucun produit dans le stock magasin pour l'instant.</p>
                    <p className="text-xs mt-1">Cliquez sur <strong>"Produit magasin"</strong> en haut pour en créer un.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-400 border-b border-slate-800 bg-slate-900/50">
                          <th className="p-3">Produit</th>
                          <th className="p-3">Catégorie</th>
                          <th className="p-3 text-right">Quantité</th>
                          <th className="p-3 text-right">Seuil min</th>
                          <th className="p-3 text-right">Valeur achat</th>
                          <th className="p-3 text-center">Statut</th>
                          <th className="p-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {magasinProducts
                          .filter(p => !magasinSearch || (p.name || "").toLowerCase().includes(magasinSearch.toLowerCase()))
                          .map(p => {
                            const qty = Number(p.quantity) || 0;
                            const smin = Number(p.stock_min) || 0;
                            const statut = qty <= 0 ? "rupture" : (qty <= smin ? "faible" : "normal");
                            const catName = categories.find(c => c.id === p.category_id)?.name || "—";
                            return (
                              <tr key={p.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                                <td className="p-3 text-white font-medium">{p.name} <span className="text-slate-500 text-xs">{p.code || ""}</span></td>
                                <td className="p-3 text-slate-400">{catName}</td>
                                <td className="p-3 text-right font-bold text-amber-300">{parseFloat(qty.toFixed(3))} {p.unit}</td>
                                <td className="p-3 text-right text-slate-500">{smin}</td>
                                <td className="p-3 text-right text-slate-300">{Math.round(qty * (p.purchase_price || 0)).toLocaleString('fr-FR')} F</td>
                                <td className="p-3 text-center">
                                  <Badge className={`text-xs ${
                                    statut === "rupture" ? "bg-red-500/20 text-red-400" :
                                    statut === "faible" ? "bg-orange-500/20 text-orange-400" :
                                    "bg-emerald-500/20 text-emerald-400"
                                  }`}>{statut}</Badge>
                                </td>
                                <td className="p-3 text-right">
                                  <div className="flex gap-1 justify-end">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setTransferForm({
                                          source_product_id: p.id,
                                          source_product_name: p.name,
                                          source_quantity: p.quantity,
                                          source_unit: p.unit,
                                          target_mode: "existing",
                                          target_product_id: "",
                                          target_name: p.name,
                                          quantity: "",
                                          reason: "",
                                        });
                                        setShowTransferModal(true);
                                      }}
                                      className="border-blue-500/40 text-blue-300 hover:bg-blue-500/10 h-7 px-2 text-xs"
                                      title="Transférer vers le restau (sera déstocké auto par les ventes)"
                                      data-testid={`magasin-transfer-${p.id}`}
                                    >
                                      → Restau
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setMovementForm({ product_id: p.id, movement_type: "entree", quantity: 0, unit_price: p.purchase_price || 0, reason: "Entrée magasin" });
                                        setShowMovementModal(true);
                                      }}
                                      className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 h-7 px-2 text-xs"
                                      title="Enregistrer une entrée (réapprovisionnement magasin)"
                                    >
                                      Entrée
                                    </Button>
                                    {isAdmin && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={async () => {
                                          if (!confirm(`Supprimer définitivement "${p.name}" du stock magasin ?\n\nCette action est irréversible.`)) return;
                                          try {
                                            await axios.delete(`${API}/products/${p.id}`);
                                            toast.success("Produit supprimé");
                                            fetchMagasinProducts();
                                            fetchMagasinMovements();
                                            fetchProducts();
                                          } catch (e) {
                                            toast.error(e?.response?.data?.detail || "Erreur de suppression");
                                          }
                                        }}
                                        className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 h-7 w-7 p-0"
                                        title="Supprimer ce produit"
                                        data-testid={`magasin-delete-${p.id}`}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Movements history (filtered on magasin products) */}
            <Card className="bg-slate-900/80 border-slate-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-amber-300 text-lg flex items-center gap-2">
                  <ArrowUpDown className="w-5 h-5" />
                  Historique des mouvements
                  <Badge className="bg-slate-700 text-slate-300 text-xs ml-1">
                    {(() => {
                      const magIds = new Set(magasinProducts.map(p => p.id));
                      return magasinMovements.filter(m => magIds.has(m.product_id)).length;
                    })()}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-800 bg-slate-900/50">
                        <th className="p-3">Date</th>
                        <th className="p-3">Produit</th>
                        <th className="p-3">Type</th>
                        <th className="p-3 text-right">Quantité</th>
                        <th className="p-3 text-right">Avant</th>
                        <th className="p-3 text-right">Après</th>
                        <th className="p-3">Motif</th>
                        <th className="p-3">Utilisateur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const magIds = new Set(magasinProducts.map(p => p.id));
                        const rows = magasinMovements.filter(m => magIds.has(m.product_id));
                        if (rows.length === 0) {
                          return (
                            <tr>
                              <td colSpan="8" className="p-8 text-center text-slate-500">
                                Aucun mouvement enregistré sur le stock magasin pour l'instant.
                              </td>
                            </tr>
                          );
                        }
                        return rows.map(m => (
                          <tr key={m.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                            <td className="p-3 text-slate-400 text-xs">
                              {new Date(m.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="p-3 text-white">{m.product_name}</td>
                            <td className="p-3">
                              <Badge className={`text-xs ${m.movement_type === 'entree' || m.movement_type === 'retour_fournisseur' ? 'bg-emerald-500/20 text-emerald-400' : m.movement_type === 'ajustement' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'}`}>
                                {MOVEMENT_TYPES.find(t => t.value === m.movement_type)?.label || m.movement_type}
                              </Badge>
                            </td>
                            <td className="p-3 text-right text-white font-medium">{m.quantity} {m.unit}</td>
                            <td className="p-3 text-right text-slate-500">{typeof m.previous_quantity === 'number' ? parseFloat(m.previous_quantity.toFixed(2)) : m.previous_quantity}</td>
                            <td className="p-3 text-right text-slate-300">{typeof m.new_quantity === 'number' ? parseFloat(m.new_quantity.toFixed(2)) : m.new_quantity}</td>
                            <td className="p-3 text-slate-400 text-xs max-w-[200px] truncate">{m.reason}</td>
                            <td className="p-3 text-slate-500 text-xs">{m.user_name}</td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}


        {/* MOVEMENTS */}
        {activeSection === "movements" && (() => {
          // Filter out magasin-side movements (they live only in the "Stock Magasin" section).
          // We exclude movements whose product is in magasin zone AND transfert_sortie (magasin outflow of a transfer).
          // transfert_entree stays visible because it is a legitimate cuisine inflow.
          const magIds = new Set(magasinProducts.map(p => p.id));

          // ====== Classification Boissons vs Autres ======
          // Heuristique : unité de conditionnement typiquement "boisson" OU mot-clé dans le nom.
          const BEVERAGE_UNITS = new Set(["bouteille", "brique", "canette", "litre", "cl", "l"]);
          const BEVERAGE_KEYWORDS = /\b(coca|fanta|sprite|pepsi|schweppes|jus|eau|bi[eè]re|biere|vin|whisky|whiskey|rhum|gin|vodka|champagne|cognac|martini|cocktail|soda|limonade|smoothie|caf[eé]|th[eé]|th\b|lait|yaourt|boisson)\b/i;
          const isBeverage = (m) => {
            const u = String(m.unit || "").toLowerCase().trim();
            if (BEVERAGE_UNITS.has(u)) return true;
            if (BEVERAGE_KEYWORDS.test(m.product_name || "")) return true;
            return false;
          };

          const allVisible = movements
            .filter(m => !magIds.has(m.product_id) && m.movement_type !== "transfert_sortie")
            .slice()
            .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

          const beverageMovements = allVisible.filter(isBeverage);
          const otherMovements = allVisible.filter(m => !isBeverage(m));

          const categoryView = movementCategoryView || "all";
          const visibleMovements =
            categoryView === "boissons" ? beverageMovements :
            categoryView === "autres" ? otherMovements :
            allVisible;

          return (
          <div className="space-y-6" data-testid="movements-section">
            {/* ─── HEADER : titre seul (ligne 1) + meta (ligne 2) ─── */}
            <div className="space-y-2">
              <div className="flex items-end justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">Mouvements de Stock</h2>
                  <p className="text-slate-500 text-xs mt-1">
                    {visibleMovements.length} ligne(s) affichée(s)
                    {movements.length - allVisible.length > 0 && (
                      <span className="ml-1.5 text-amber-400/80">
                        · {movements.length - allVisible.length} masqué(s)
                      </span>
                    )}
                  </p>
                </div>
                <p className="text-slate-500 text-[11px]" data-testid="movements-last-refresh">
                  {movementsAutoSyncing ? (
                    <span className="text-amber-400">⏳ Synchro…</span>
                  ) : movementsLastRefresh ? (
                    <>
                      <span className="text-emerald-400">✓</span> {movementsLastRefresh.toLocaleTimeString('fr-FR')}
                      <span className="text-slate-600"> · auto 60s</span>
                    </>
                  ) : (
                    <span className="text-slate-600">Chargement…</span>
                  )}
                </p>
              </div>

              {/* Ligne d'actions séparée, alignée à droite, avec espacement aéré */}
              <div className="flex gap-2 flex-wrap justify-end pt-1">
                <Button
                  onClick={async () => {
                    try {
                      toast.info("Re-sync en cours...");
                      const [r1, r2] = await Promise.all([
                        axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/invoices/resync-destockage`),
                        axios.post(`${API}/stock/portionnement/apply-daily`),
                      ]);
                      await Promise.all([
                        fetchMovements(),
                        fetchProducts(),
                        fetchDashboard(),
                      ]);
                      const r = r1.data || {};
                      const d = r2.data || {};
                      toast.success(
                        `Actualisé ✅ ${r.processed || 0} factures re-déstockées (${r.skipped_already_destocked || 0} déjà OK) · ${d.applied_count || 0} produits daily déstockés`,
                        { duration: 6000 }
                      );
                    } catch (e) {
                      toast.error(e?.response?.data?.detail || "Erreur lors de l'actualisation");
                    }
                  }}
                  size="sm"
                  variant="outline"
                  className="border-blue-500/40 text-blue-300 hover:bg-blue-500/10"
                  data-testid="movements-resync-btn"
                  title="Refresh + re-applique le déstockage automatique des factures du jour + consommation journalière"
                >
                  <Activity className="w-4 h-4 mr-1.5" /> Actualiser
                </Button>
                <Button
                  onClick={async () => {
                    if (!confirm("⚠️ Re-déstocker TOUTES les factures validées passées qui n'ont pas été synchronisées ?\n\nUtile après avoir créé/corrigé des recettes. Les factures déjà déstockées sont ignorées automatiquement.")) return;
                    try {
                      toast.info("Re-sync complet en cours...");
                      const r = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/invoices/resync-destockage?all_past=true`);
                      await Promise.all([fetchMovements(), fetchProducts(), fetchDashboard()]);
                      const d = r.data || {};
                      toast.success(
                        `Re-sync complet ✅ ${d.processed} factures rattrapées (${d.skipped_already_destocked} déjà OK, ${d.errors} erreurs)`,
                        { duration: 8000 }
                      );
                      if (d.errors > 0 && d.error_details?.length) {
                        console.warn("Resync errors:", d.error_details);
                      }
                    } catch (e) {
                      toast.error(e?.response?.data?.detail || "Erreur");
                    }
                  }}
                  size="sm"
                  variant="outline"
                  className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                  data-testid="movements-resync-all-btn"
                  title="Rattrape toutes les factures passées non-déstockées (utile après avoir créé des recettes)"
                >
                  ↺ Rattraper tout
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                  onClick={() => {
                    // Export CSV of current view
                    const headers = ["Date", "Produit", "Type", "Quantité", "Unité", "Avant", "Après", "Motif", "Utilisateur"];
                    const rows = visibleMovements.map(m => [
                      new Date(m.created_at).toLocaleString('fr-FR'),
                      m.product_name || "",
                      MOVEMENT_TYPES.find(t => t.value === m.movement_type)?.label || m.movement_type,
                      m.quantity,
                      m.unit || "",
                      m.previous_quantity,
                      m.new_quantity,
                      (m.reason || "").replace(/[\n\r,;]/g, " "),
                      m.user_name || "",
                    ]);
                    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
                    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `mouvements_stock_${new Date().toISOString().slice(0,10)}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  data-testid="movements-export-csv"
                >
                  <FileText className="w-4 h-4 mr-1.5" /> Export CSV
                </Button>
                <Button
                  size="sm"
                  onClick={() => { setMovementForm({ product_id: "", movement_type: "entree", quantity: 0, unit_price: 0, reason: "" }); setMovementProductSearch(""); setShowMovementModal(true); }}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Plus className="w-4 h-4 mr-1.5" /> Nouveau Mouvement
                </Button>
              </div>
            </div>

            {/* ─── Toggle catégorie + bouton filtres : ligne unique, aérée ─── */}
            <div className="flex flex-wrap items-center gap-2 py-1" data-testid="movements-category-toggle">
              <Button
                size="sm"
                variant={movementCategoryView === "all" ? "default" : "outline"}
                onClick={() => setMovementCategoryView("all")}
                className={movementCategoryView === "all" ? "bg-slate-700 hover:bg-slate-600 text-white" : "border-slate-700 text-slate-300 hover:bg-slate-800"}
                data-testid="movements-cat-all"
              >
                Tout · {allVisible.length}
              </Button>
              <Button
                size="sm"
                variant={movementCategoryView === "boissons" ? "default" : "outline"}
                onClick={() => setMovementCategoryView("boissons")}
                className={movementCategoryView === "boissons" ? "bg-orange-600 hover:bg-orange-700 text-white" : "border-orange-500/40 text-orange-300 hover:bg-orange-500/10"}
                data-testid="movements-cat-boissons"
                title="Bouteilles, briques, canettes, jus, sodas…"
              >
                🍹 Boissons · {beverageMovements.length}
              </Button>
              <Button
                size="sm"
                variant={movementCategoryView === "autres" ? "default" : "outline"}
                onClick={() => setMovementCategoryView("autres")}
                className={movementCategoryView === "autres" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"}
                data-testid="movements-cat-autres"
                title="Ingrédients cuisine, viandes, légumes, etc."
              >
                🍽️ Autres · {otherMovements.length}
              </Button>

              <div className="flex-1" />

              {/* Bouton repli / déploi filtres */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowMovementFilters(v => !v)}
                className={`border-slate-700 ${showMovementFilters ? "text-emerald-300 bg-emerald-500/5" : "text-slate-300 hover:bg-slate-800"}`}
                data-testid="movements-filters-toggle"
              >
                <FileText className="w-4 h-4 mr-1.5" />
                Filtres
                {(movementFilters.product_id || movementFilters.movement_type || movementFilters.date_from || movementFilters.date_to) && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
              </Button>
            </div>

            {/* Filters bar — repliable */}
            {showMovementFilters && (
            <Card className="bg-slate-900/60 border-slate-800">
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div>
                    <Label className="text-slate-400 text-xs uppercase">Produit</Label>
                    {(() => {
                      const allProducts = [...products].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
                      const q = (movementFilters._product_search || "").toLowerCase().trim();
                      const filtered = q
                        ? allProducts.filter(p =>
                            (p.name || "").toLowerCase().includes(q) ||
                            (p.code || "").toLowerCase().includes(q)
                          )
                        : allProducts;
                      const selected = allProducts.find(p => p.id === movementFilters.product_id);
                      const isSearching = movementFilters._product_search !== undefined && movementFilters._product_search !== null;
                      return (
                        <div className="relative">
                          <Input
                            value={isSearching ? movementFilters._product_search : (selected?.name || "")}
                            onChange={e => setMovementFilters(p => ({ ...p, _product_search: e.target.value, product_id: "" }))}
                            onFocus={() => setMovementFilters(p => ({ ...p, _product_search: p._product_search ?? "" }))}
                            placeholder="Tous les produits"
                            className="bg-slate-900 border-slate-700 text-white h-9 text-sm pr-8"
                            data-testid="movements-filter-product-search"
                          />
                          {(isSearching || selected) && (
                            <button
                              type="button"
                              onClick={() => setMovementFilters(p => ({ ...p, _product_search: undefined, product_id: "" }))}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
                              title="Réinitialiser"
                            >✕</button>
                          )}
                          {isSearching && !selected && (
                            <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-slate-800 border border-slate-700 rounded-lg shadow-xl">
                              {filtered.length === 0 ? (
                                <div className="px-3 py-3 text-slate-500 text-sm text-center">Aucun produit</div>
                              ) : (
                                filtered.slice(0, 50).map(p => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => setMovementFilters(f => ({ ...f, product_id: p.id, _product_search: undefined }))}
                                    className="w-full text-left px-3 py-2 hover:bg-slate-700 border-b border-slate-700/50 last:border-b-0 text-sm text-white"
                                  >
                                    {p.name} <span className="text-[10px] text-slate-500">{p.code || ""}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs uppercase">Type</Label>
                    <select
                      value={movementFilters.movement_type}
                      onChange={e => setMovementFilters(p => ({ ...p, movement_type: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded px-2 py-1.5"
                      data-testid="movements-filter-type"
                    >
                      <option value="">Tous types</option>
                      {MOVEMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs uppercase">Du</Label>
                    <Input
                      type="date"
                      value={movementFilters.date_from}
                      onChange={e => setMovementFilters(p => ({ ...p, date_from: e.target.value }))}
                      className="bg-slate-900 border-slate-700 text-white h-9 text-sm"
                      data-testid="movements-filter-from"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs uppercase">Au</Label>
                    <Input
                      type="date"
                      value={movementFilters.date_to}
                      onChange={e => setMovementFilters(p => ({ ...p, date_to: e.target.value }))}
                      className="bg-slate-900 border-slate-700 text-white h-9 text-sm"
                      data-testid="movements-filter-to"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <Button
                      onClick={fetchMovements}
                      className="bg-emerald-600 hover:bg-emerald-700 flex-1"
                      data-testid="movements-filter-apply"
                    >
                      Appliquer
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setMovementFilters({ product_id: "", movement_type: "", date_from: "", date_to: "", limit: 200 });
                      }}
                      className="border-slate-700 text-slate-400 hover:bg-slate-800"
                      data-testid="movements-filter-reset"
                      title="Réinitialiser"
                    >
                      ✕
                    </Button>
                  </div>
                </div>
                {(movementFilters.product_id || movementFilters.movement_type || movementFilters.date_from || movementFilters.date_to) && (
                  <div className="mt-2 pt-2 border-t border-slate-800 flex items-center gap-2 flex-wrap text-xs text-slate-400">
                    <span>Filtres actifs :</span>
                    {movementFilters.product_id && (
                      <Badge className="bg-emerald-500/20 text-emerald-300">
                        Produit : {products.find(p => p.id === movementFilters.product_id)?.name || "—"}
                      </Badge>
                    )}
                    {movementFilters.movement_type && (
                      <Badge className="bg-blue-500/20 text-blue-300">
                        Type : {MOVEMENT_TYPES.find(t => t.value === movementFilters.movement_type)?.label}
                      </Badge>
                    )}
                    {movementFilters.date_from && (
                      <Badge className="bg-purple-500/20 text-purple-300">
                        Du : {movementFilters.date_from}
                      </Badge>
                    )}
                    {movementFilters.date_to && (
                      <Badge className="bg-purple-500/20 text-purple-300">
                        Au : {movementFilters.date_to}
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            )}

            {isAdmin && <BulkBar count={selectedItems.filter(id => visibleMovements.some(m => m.id === id)).length} label="mouvement(s)" endpoint="movements/delete-bulk" ids={selectedItems.filter(id => visibleMovements.some(m => m.id === id))} refreshFn={fetchMovements} />}
            <Card className="bg-slate-900/80 border-slate-800"><CardContent className="p-0"><div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-400 border-b border-slate-800 bg-slate-900/50">
                  {isAdmin && <th className="p-4 w-8"><input type="checkbox" className="rounded bg-slate-800 border-slate-600" checked={visibleMovements.length > 0 && visibleMovements.every(m => selectedItems.includes(m.id))} onChange={() => toggleSelectAll(visibleMovements.map(m => m.id))} /></th>}
                  <th className="p-4 font-medium">Date</th>
                  <th className="p-4 font-medium">Produit</th>
                  <th className="p-4 font-medium">Type</th>
                  <th className="p-4 font-medium text-right">Quantité</th>
                  <th className="p-4 font-medium text-right hidden lg:table-cell">Avant</th>
                  <th className="p-4 font-medium text-right hidden lg:table-cell">Après</th>
                  <th className="p-4 font-medium hidden md:table-cell">Motif</th>
                  <th className="p-4 font-medium hidden xl:table-cell">Utilisateur</th>
                  {isAdmin && <th className="p-4 w-10"></th>}
                </tr></thead>
                <tbody>
                  {visibleMovements.map(m => (
                    <tr key={m.id} className={`border-b border-slate-800/50 hover:bg-slate-800/30 ${selectedItems.includes(m.id) ? 'bg-slate-800/50' : ''}`}>
                      {isAdmin && <td className="p-4"><input type="checkbox" className="rounded bg-slate-800 border-slate-600" checked={selectedItems.includes(m.id)} onChange={() => toggleSelect(m.id)} /></td>}
                      <td className="p-4 text-slate-400 text-xs whitespace-nowrap">{new Date(m.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="p-4 text-white">{m.product_name}</td>
                      <td className="p-4"><Badge className={`text-xs ${m.movement_type === 'entree' || m.movement_type === 'retour_fournisseur' || m.movement_type === 'transfert_entree' ? 'bg-emerald-500/20 text-emerald-400' : m.movement_type === 'ajustement' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'}`}>{MOVEMENT_TYPES.find(t => t.value === m.movement_type)?.label || m.movement_type}</Badge></td>
                      <td className="p-4 text-right text-white font-medium whitespace-nowrap">{m.quantity} {m.unit}</td>
                      <td className="p-4 text-right text-slate-500 hidden lg:table-cell">{typeof m.previous_quantity === 'number' ? parseFloat(m.previous_quantity.toFixed(2)) : m.previous_quantity}</td>
                      <td className="p-4 text-right text-slate-300 hidden lg:table-cell">{typeof m.new_quantity === 'number' ? parseFloat(m.new_quantity.toFixed(2)) : m.new_quantity}</td>
                      <td className="p-4 text-slate-400 text-xs max-w-[220px] truncate hidden md:table-cell">{m.reason}</td>
                      <td className="p-4 text-slate-500 text-xs hidden xl:table-cell">{m.user_name}</td>
                      {isAdmin && <td className="p-4"><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-red-400" onClick={() => deleteMovement(m.id)}><Trash2 className="w-3.5 h-3.5" /></Button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></CardContent></Card>
          </div>
          );
        })()}


        {/* RECIPES / FICHES TECHNIQUES */}
        {activeSection === "recipes" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Fiches Techniques / Recettes</h2>
              <div className="flex gap-2 flex-wrap">
                {isAdmin && (
                  <Button
                    onClick={async () => {
                      if (!window.confirm(
                        "Composer automatiquement des fiches techniques pour TOUS les plats Caisse non encore liés ?\n\n" +
                        "L'algorithme analyse le nom de chaque plat (Riz, Poulet, Salade, Sauce, Boisson…), trouve les ingrédients correspondants dans le stock, et crée une fiche avec 1 portion par défaut.\n\n" +
                        "✏️ Vous pourrez ensuite ajuster chaque fiche manuellement."
                      )) return;
                      try {
                        const res = await axios.post(`${API}/recipes/auto-compose`, {
                          only_unmatched: true,
                          skip_dishless: true,
                          dry_run: false,
                        });
                        toast.success(
                          `${res.data.created_count} fiche(s) créée(s) automatiquement`,
                          {
                            description: `${res.data.skipped_existing} déjà existantes ignorées · ${res.data.skipped_no_match_count} sans correspondance (boissons, services...)`,
                          }
                        );
                        fetchRecipes();
                      } catch (e) {
                        toast.error(e?.response?.data?.detail || "Erreur de composition automatique");
                      }
                    }}
                    className="bg-amber-600 hover:bg-amber-700"
                    data-testid="auto-compose-recipes-btn"
                    title="Génère automatiquement des fiches techniques pour les plats Caisse non liés (1 portion par défaut, basée sur les mots-clés)"
                  >
                    <BookOpen className="w-4 h-4 mr-1" /> Composer auto
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    onClick={async () => {
                      const maxStr = window.prompt(
                        "🤖 COMPOSITION IA (Gemini)\n\n" +
                        "L'IA analyse le nom de chaque plat + votre catalogue stock pour générer une fiche technique réaliste.\n\n" +
                        "Combien de plats traiter au maximum ? (jusqu'à 50)",
                        "20"
                      );
                      if (!maxStr) return;
                      const maxDishes = Math.min(50, Math.max(1, parseInt(maxStr, 10) || 20));
                      const dryRun = window.confirm(
                        `▶ APERÇU avant validation ?\n\n` +
                        `OK = Aperçu (dry-run) — l'IA propose les fiches sans rien enregistrer.\n` +
                        `Annuler = Création directe (les fiches seront créées et liées aux produits Caisse).`
                      );
                      const t = toast.loading(`IA en cours sur ${maxDishes} plats...`);
                      try {
                        const res = await axios.post(`${API}/recipes/auto-compose-ai`, {
                          only_unmatched: true,
                          dry_run: dryRun,
                          max_dishes: maxDishes,
                          batch_size: 10,
                          model: "gemini-2.5-flash",
                        }, { timeout: 180000 });
                        toast.dismiss(t);
                        const d = res.data;
                        if (dryRun) {
                          const lines = [
                            `📊 Aperçu IA (${d.scanned} plats analysés) :`,
                            `• ${d.created_count} fiches à créer`,
                            `• ${d.updated_count} fiches à mettre à jour`,
                            `• ${d.skipped_no_ingredients_count} sans ingrédients`,
                            `• ${d.unknown_products_count} produits inconnus écartés`,
                          ];
                          if (window.confirm(lines.join("\n") + "\n\n💾 Voulez-vous VALIDER et créer ces fiches maintenant ?")) {
                            const t2 = toast.loading(`Enregistrement de ${d.created_count + d.updated_count} fiches...`);
                            const res2 = await axios.post(`${API}/recipes/auto-compose-ai`, {
                              only_unmatched: true,
                              dry_run: false,
                              max_dishes: maxDishes,
                              batch_size: 10,
                              model: "gemini-2.5-flash",
                            }, { timeout: 180000 });
                            toast.dismiss(t2);
                            toast.success(`${res2.data.created_count} créées · ${res2.data.updated_count} mises à jour`);
                            fetchRecipes();
                          }
                        } else {
                          toast.success(`${d.created_count} créées · ${d.updated_count} mises à jour`, {
                            description: `${d.skipped_no_ingredients_count} sans ingrédients · ${d.unknown_products_count} produits IA inconnus`,
                          });
                          fetchRecipes();
                        }
                      } catch (e) {
                        toast.dismiss(t);
                        toast.error(e?.response?.data?.detail || "Erreur IA");
                      }
                    }}
                    className="bg-gradient-to-r from-fuchsia-600 to-violet-600 hover:from-fuchsia-700 hover:to-violet-700"
                    data-testid="ai-compose-recipes-btn"
                    title="L'IA Gemini analyse vos plats + stock pour proposer des fiches techniques précises"
                  >
                    <Sparkles className="w-4 h-4 mr-1" /> Composer avec IA
                  </Button>
                )}
                {recipes.length === 0 && (
                  <Button variant="outline" className="border-slate-700 text-slate-300" onClick={seedDemoRecipes} data-testid="seed-recipes-btn">
                    Charger demo (Poulet braise)
                  </Button>
                )}
                <Button onClick={() => { setEditingItem(null); setRecipeForm({ name: "", caisse_product_name: "", selling_price: 0, ingredients: [], notes: "" }); setRecipeIngredient({ product_id: "", quantity: 0 }); fetchAllProducts(); setShowRecipeModal(true); }}
                  className="bg-emerald-600 hover:bg-emerald-700" data-testid="new-recipe-btn"><Plus className="w-4 h-4 mr-1" /> Nouvelle Fiche</Button>
              </div>
            </div>

            <p className="text-slate-400 text-sm">Definissez la composition de chaque plat vendu a la Caisse. Lors de la validation d'une facture, les ingredients seront automatiquement deduits du stock.</p>

            {/* Search bar + select all visible */}
            {recipes.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[240px] max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    value={recipeSearch}
                    onChange={(e) => setRecipeSearch(e.target.value)}
                    placeholder="Rechercher (nom de fiche, plat Caisse, ingrédient…)"
                    className="bg-slate-900 border-slate-700 text-white pl-9 h-9"
                    data-testid="recipe-search"
                  />
                </div>
                {isAdmin && (() => {
                  const filteredRecipes = recipes.filter(r => {
                    const q = recipeSearch.trim().toLowerCase();
                    if (!q) return true;
                    if ((r.name || "").toLowerCase().includes(q)) return true;
                    if ((r.caisse_product_name || "").toLowerCase().includes(q)) return true;
                    if ((r.ingredients || []).some(i => (i.product_name || "").toLowerCase().includes(q))) return true;
                    return false;
                  });
                  const visibleIds = filteredRecipes.map(r => r.id);
                  const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedItems.includes(id));
                  const toggleAll = () => {
                    if (allSelected) {
                      setSelectedItems(prev => prev.filter(id => !visibleIds.includes(id)));
                    } else {
                      setSelectedItems(prev => [...new Set([...prev, ...visibleIds])]);
                    }
                  };
                  return (
                    <Button
                      variant="outline" size="sm"
                      onClick={toggleAll}
                      className={`h-9 border-slate-700 ${allSelected ? "bg-violet-500/20 text-violet-300" : "bg-slate-800 text-slate-300"}`}
                      data-testid="select-all-visible-recipes-btn"
                    >
                      <CheckSquare className="w-4 h-4 mr-1" />
                      {allSelected ? `Désélectionner (${visibleIds.length})` : `Tout sélectionner (${visibleIds.length})`}
                    </Button>
                  );
                })()}
                <span className="text-slate-500 text-xs">
                  {(() => {
                    const q = recipeSearch.trim().toLowerCase();
                    const filtered = q ? recipes.filter(r =>
                      (r.name || "").toLowerCase().includes(q) ||
                      (r.caisse_product_name || "").toLowerCase().includes(q) ||
                      (r.ingredients || []).some(i => (i.product_name || "").toLowerCase().includes(q))
                    ) : recipes;
                    return `${filtered.length} / ${recipes.length} fiche${recipes.length > 1 ? "s" : ""}`;
                  })()}
                </span>
              </div>
            )}
            {isAdmin && <BulkBar count={selectedItems.filter(id => recipes.some(r => r.id === id)).length} label="fiche(s)" endpoint="recipes/delete-bulk" ids={selectedItems.filter(id => recipes.some(r => r.id === id))} refreshFn={fetchRecipes} />}

            {recipes.length === 0 ? (
              <Card className="bg-slate-900/80 border-slate-800">
                <CardContent className="p-12 text-center">
                  <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 text-lg mb-2">Aucune fiche technique</p>
                  <p className="text-slate-500 text-sm mb-4">Creez votre premiere fiche pour lier un plat a ses ingredients</p>
                  <Button variant="outline" className="border-slate-700 text-slate-300" onClick={seedDemoRecipes}>Charger la fiche demo "Poulet braise"</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {recipes
                  .filter(r => {
                    const q = recipeSearch.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      (r.name || "").toLowerCase().includes(q) ||
                      (r.caisse_product_name || "").toLowerCase().includes(q) ||
                      (r.ingredients || []).some(i => (i.product_name || "").toLowerCase().includes(q))
                    );
                  })
                  .map(r => {
                  const marginColor = r.margin > 0 ? "text-emerald-400" : r.margin < 0 ? "text-red-400" : "text-slate-400";
                  return (
                    <Card key={r.id} className="bg-slate-900/80 border-slate-800" data-testid={`recipe-card-${r.id}`}>
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-start gap-3">
                            {isAdmin && <input type="checkbox" className="rounded bg-slate-800 border-slate-600 mt-1.5" checked={selectedItems.includes(r.id)} onChange={() => toggleSelect(r.id)} />}
                            <div>
                              <h3 className="text-white text-lg font-bold">{r.name}</h3>
                              <p className="text-slate-400 text-sm">Nom Caisse : <span className="text-amber-400">{r.caisse_product_name}</span></p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-blue-400" onClick={() => openEditRecipe(r)} data-testid={`edit-recipe-${r.id}`}><Edit2 className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-red-400" onClick={() => deleteRecipe(r.id)} data-testid={`delete-recipe-${r.id}`}><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mb-4">
                          <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                            <p className="text-slate-500 text-xs mb-1">Prix de vente</p>
                            <p className="text-white font-bold">{formatPrice(r.selling_price)} F</p>
                          </div>
                          <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                            <p className="text-slate-500 text-xs mb-1">Cout de revient</p>
                            <p className="text-orange-400 font-bold">{formatPrice(r.cost_price)} F</p>
                          </div>
                          <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                            <p className="text-slate-500 text-xs mb-1">Marge</p>
                            <p className={`font-bold ${marginColor}`}>{formatPrice(r.margin)} F ({r.margin_percent}%)</p>
                          </div>
                        </div>

                        <div>
                          <p className="text-slate-400 text-xs font-medium mb-2">Ingredients ({r.ingredients?.length || 0})</p>
                          <div className="bg-slate-800/30 rounded-lg overflow-hidden">
                            <table className="w-full text-xs">
                              <thead><tr className="text-slate-500 border-b border-slate-700/50">
                                <th className="text-left p-2">Ingredient</th>
                                <th className="text-right p-2">Quantite</th>
                                <th className="text-right p-2">Prix unit.</th>
                                <th className="text-right p-2">Sous-total</th>
                                <th className="text-right p-2">Stock actuel</th>
                              </tr></thead>
                              <tbody>
                                {(r.ingredients || []).map((ing, i) => (
                                  <tr key={i} className="border-b border-slate-800/30">
                                    <td className="p-2 text-white">{ing.product_name}</td>
                                    <td className="p-2 text-right text-slate-300">{ing.quantity} {ing.unit}</td>
                                    <td className="p-2 text-right text-slate-400">{formatPrice(ing.purchase_price || 0)} F</td>
                                    <td className="p-2 text-right text-amber-400">{formatPrice((ing.quantity || 0) * (ing.purchase_price || 0))} F</td>
                                    <td className="p-2 text-right">
                                      <span className={ing.current_stock <= 0 ? "text-red-400" : ing.current_stock <= 5 ? "text-orange-400" : "text-emerald-400"}>
                                        {ing.current_stock ?? "-"} {ing.unit}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                        {r.notes && <p className="text-slate-500 text-xs mt-3 italic">{r.notes}</p>}
                      </CardContent>
                    </Card>
                  );
                })}
                {(() => {
                  const q = recipeSearch.trim().toLowerCase();
                  if (!q) return null;
                  const matches = recipes.filter(r =>
                    (r.name || "").toLowerCase().includes(q) ||
                    (r.caisse_product_name || "").toLowerCase().includes(q) ||
                    (r.ingredients || []).some(i => (i.product_name || "").toLowerCase().includes(q))
                  );
                  if (matches.length === 0) {
                    return (
                      <Card className="bg-slate-900/80 border-slate-800">
                        <CardContent className="p-8 text-center">
                          <Search className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                          <p className="text-slate-400">Aucune fiche ne correspond à « {recipeSearch} »</p>
                        </CardContent>
                      </Card>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
          </div>
        )}


        {/* PRODUCT ANALYSIS — flux entrées/sorties + détection anomalies */}
        {activeSection === "product_analysis" && (
          <ProductAnalysisView />
        )}

        {/* REPORTS / RAPPORTS */}
        {activeSection === "reports" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Rapports de Stock</h2>
              <div className="flex gap-2">
                <Button variant="outline" className="border-red-700/50 text-red-400 hover:bg-red-900/20" onClick={() => exportReport("pdf")} data-testid="export-pdf-btn">
                  <Download className="w-4 h-4 mr-1" /> PDF
                </Button>
                <Button variant="outline" className="border-emerald-700/50 text-emerald-400 hover:bg-emerald-900/20" onClick={() => exportReport("excel")} data-testid="export-excel-btn">
                  <Download className="w-4 h-4 mr-1" /> Excel
                </Button>
              </div>
            </div>

            {/* Filters */}
            <Card className="bg-slate-900/80 border-slate-800">
              <CardContent className="p-4">
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="w-40">
                    <Label className="text-slate-400 text-xs mb-1 block">Type</Label>
                    <Select value={reportFilters.type} onValueChange={v => setReportFilters(f => ({...f, type: v}))}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-9" data-testid="report-filter-type"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="all" className="text-white">Tous les types</SelectItem>
                        <SelectItem value="entree" className="text-emerald-400">Entrees</SelectItem>
                        <SelectItem value="sortie" className="text-red-400">Sorties</SelectItem>
                        <SelectItem value="perte" className="text-orange-400">Pertes / Casses</SelectItem>
                        <SelectItem value="ajustement" className="text-blue-400">Ajustements</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs mb-1 block">Du</Label>
                    <Input type="date" value={reportFilters.date_from} onChange={e => setReportFilters(f => ({...f, date_from: e.target.value}))} className="bg-slate-800 border-slate-700 text-white h-9 w-40" data-testid="report-filter-from" />
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs mb-1 block">Au</Label>
                    <Input type="date" value={reportFilters.date_to} onChange={e => setReportFilters(f => ({...f, date_to: e.target.value}))} className="bg-slate-800 border-slate-700 text-white h-9 w-40" data-testid="report-filter-to" />
                  </div>
                  <div className="flex-1 min-w-[150px]">
                    <Label className="text-slate-400 text-xs mb-1 block">Produit</Label>
                    <Input placeholder="Rechercher un produit..." value={reportFilters.search} onChange={e => setReportFilters(f => ({...f, search: e.target.value}))} className="bg-slate-800 border-slate-700 text-white h-9" data-testid="report-filter-search" />
                  </div>
                  <Button className="bg-emerald-600 hover:bg-emerald-700 h-9" onClick={() => fetchReport()} data-testid="report-filter-apply">
                    <Filter className="w-4 h-4 mr-1" /> Filtrer
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Summary */}
            {report && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="bg-slate-900/80 border-slate-800"><CardContent className="p-4 text-center">
                    <p className="text-slate-500 text-xs">Total Mouvements</p>
                    <p className="text-2xl font-bold text-white">{report.total_movements}</p>
                  </CardContent></Card>
                  <Card className="bg-slate-900/80 border-slate-800"><CardContent className="p-4 text-center">
                    <p className="text-slate-500 text-xs">Quantite Totale</p>
                    <p className="text-2xl font-bold text-blue-400">{report.total_quantity?.toFixed(1)}</p>
                  </CardContent></Card>
                  <Card className="bg-slate-900/80 border-slate-800"><CardContent className="p-4 text-center">
                    <p className="text-slate-500 text-xs">Valeur Totale</p>
                    <p className="text-2xl font-bold text-emerald-400">{formatPrice(report.total_value)} F</p>
                  </CardContent></Card>
                  <Card className="bg-slate-900/80 border-slate-800"><CardContent className="p-4 text-center">
                    <p className="text-slate-500 text-xs">Par Type</p>
                    <div className="flex flex-wrap gap-1 justify-center mt-1">
                      {Object.entries(report.by_type || {}).map(([t, v]) => (
                        <Badge key={t} className={`text-xs ${t === 'entree' ? 'bg-emerald-500/20 text-emerald-400' : t === 'sortie' ? 'bg-red-500/20 text-red-400' : t === 'perte' || t === 'casse' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
                          {t}: {v.count}
                        </Badge>
                      ))}
                    </div>
                  </CardContent></Card>
                </div>

                {/* Top Products */}
                {report.top_products?.length > 0 && (
                  <Card className="bg-slate-900/80 border-slate-800">
                    <CardContent className="p-4">
                      <p className="text-slate-400 text-xs font-medium mb-3">Top Produits (par valeur)</p>
                      <div className="grid md:grid-cols-2 gap-2">
                        {report.top_products.slice(0, 10).map((tp, i) => (
                          <div key={i} className="flex items-center justify-between bg-slate-800/40 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-600 text-xs w-5">{i + 1}.</span>
                              <span className="text-white text-sm">{tp.name}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-slate-400 text-xs">{tp.count} mvt</span>
                              <span className="text-emerald-400 text-sm font-bold">{formatPrice(tp.value)} F</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Movements Table */}
                <Card className="bg-slate-900/80 border-slate-800">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" data-testid="report-table">
                        <thead><tr className="text-left text-slate-400 border-b border-slate-800 bg-slate-900/50 text-xs">
                          <th className="p-3">Date</th><th className="p-3">Produit</th><th className="p-3">Type</th>
                          <th className="p-3 text-right">Quantite</th><th className="p-3 text-right">Avant</th>
                          <th className="p-3 text-right">Apres</th><th className="p-3 text-right">Valeur</th><th className="p-3">Motif</th>
                        </tr></thead>
                        <tbody>
                          {(report.movements || []).map(m => {
                            const typeColor = m.movement_type === "entree" || m.movement_type === "retour_fournisseur" ? "bg-emerald-500/20 text-emerald-400" : m.movement_type === "sortie" ? "bg-red-500/20 text-red-400" : m.movement_type === "perte" || m.movement_type === "casse" ? "bg-orange-500/20 text-orange-400" : "bg-blue-500/20 text-blue-400";
                            const typeLabel = {entree: "Entree", sortie: "Sortie", perte: "Perte", casse: "Casse", ajustement: "Ajust.", retour_fournisseur: "Retour", inventaire: "Inventaire"}[m.movement_type] || m.movement_type;
                            return (
                              <tr key={m.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 text-xs">
                                <td className="p-2 text-slate-400">{(m.created_at || "").slice(0, 16).replace("T", " ")}</td>
                                <td className="p-2 text-white">{m.product_name}</td>
                                <td className="p-2"><Badge className={`${typeColor} text-xs`}>{typeLabel}</Badge></td>
                                <td className="p-2 text-right text-slate-300">{m.quantity} {m.unit}</td>
                                <td className="p-2 text-right text-slate-500">{typeof m.previous_quantity === 'number' ? parseFloat(m.previous_quantity.toFixed(2)) : m.previous_quantity}</td>
                                <td className="p-2 text-right text-slate-300">{typeof m.new_quantity === 'number' ? parseFloat(m.new_quantity.toFixed(2)) : m.new_quantity}</td>
                                <td className="p-2 text-right text-amber-400">{formatPrice(m.total_value)} F</td>
                                <td className="p-2 text-slate-500 max-w-[200px] truncate">{m.reason}</td>
                              </tr>
                            );
                          })}
                          {(!report.movements || report.movements.length === 0) && (
                            <tr><td colSpan={8} className="p-8 text-center text-slate-500">Aucun mouvement pour les filtres selectionnes</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {!report && !reportLoading && (
              <Card className="bg-slate-900/80 border-slate-800">
                <CardContent className="p-12 text-center">
                  <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 text-lg mb-2">Generez un rapport</p>
                  <p className="text-slate-500 text-sm">Selectionnez vos filtres et cliquez sur "Filtrer" pour afficher les mouvements</p>
                </CardContent>
              </Card>
            )}

            {reportLoading && (
              <div className="text-center py-12"><p className="text-slate-400">Chargement du rapport...</p></div>
            )}
          </div>
        )}


        {/* INVENTAIRE PHYSIQUE */}
        {activeSection === "inventory" && (
          <div className="space-y-4">
            {!activeInventory ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-white">Inventaire Physique</h2>
                  <Button onClick={() => createInventory()} className="bg-emerald-600 hover:bg-emerald-700" data-testid="new-inventory-btn">
                    <Plus className="w-4 h-4 mr-1" /> Nouvel Inventaire
                  </Button>
                </div>
                <p className="text-slate-400 text-sm">Comparez le stock theorique avec le stock physique reel. Saisissez les quantites comptees et validez pour ajuster le stock automatiquement.</p>

                {inventories.length === 0 ? (
                  <Card className="bg-slate-900/80 border-slate-800">
                    <CardContent className="p-12 text-center">
                      <ClipboardCheck className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                      <p className="text-slate-400 text-lg mb-2">Aucun inventaire</p>
                      <p className="text-slate-500 text-sm mb-4">Lancez votre premier inventaire physique</p>
                      <Button onClick={() => createInventory()} className="bg-emerald-600 hover:bg-emerald-700">Demarrer un inventaire</Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-3">
                    {inventories.map(inv => (
                      <Card key={inv.id} className="bg-slate-900/80 border-slate-800 hover:bg-slate-800/50 cursor-pointer" onClick={() => openInventory(inv.id)} data-testid={`inventory-card-${inv.id}`}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <ClipboardCheck className={`w-5 h-5 ${inv.status === 'valide' ? 'text-emerald-400' : 'text-amber-400'}`} />
                              <div>
                                <h3 className="text-white font-bold">{inv.name}</h3>
                                <p className="text-slate-500 text-xs">{new Date(inv.created_at).toLocaleString('fr-FR')} - par {inv.created_by}</p>
                              </div>
                              <Badge className={inv.status === 'valide' ? 'bg-emerald-500/20 text-emerald-400 text-xs' : 'bg-amber-500/20 text-amber-400 text-xs'}>
                                {inv.status === 'valide' ? 'Valide' : 'En cours'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <p className="text-white text-sm">{inv.counted_products}/{inv.total_products} comptes</p>
                                <p className={`text-xs font-bold ${inv.total_ecart_value > 0 ? 'text-emerald-400' : inv.total_ecart_value < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                                  Ecart: {formatPrice(inv.total_ecart_value)} F
                                </p>
                              </div>
                              {isAdmin && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-red-400" onClick={(e) => { e.stopPropagation(); deleteInventory(inv.id); }}><Trash2 className="w-3.5 h-3.5" /></Button>}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" className="text-slate-400 hover:text-white h-8 px-2" onClick={() => setActiveInventory(null)}>
                      <ChevronDown className="w-4 h-4 rotate-90" /> Retour
                    </Button>
                    <h2 className="text-xl font-bold text-white">{activeInventory.name}</h2>
                    <Badge className={activeInventory.status === 'valide' ? 'bg-emerald-500/20 text-emerald-400 text-xs' : 'bg-amber-500/20 text-amber-400 text-xs'}>
                      {activeInventory.status === 'valide' ? 'Valide' : 'En cours'}
                    </Badge>
                  </div>
                  {activeInventory.status === 'en_cours' && isAdmin && (
                    <Button onClick={validateInventory} className="bg-emerald-600 hover:bg-emerald-700" data-testid="validate-inventory-btn">
                      <Save className="w-4 h-4 mr-1" /> Valider l'inventaire
                    </Button>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="bg-slate-900/80 border-slate-800"><CardContent className="p-3 text-center">
                    <p className="text-slate-500 text-xs">Produits</p>
                    <p className="text-xl font-bold text-white">{activeInventory.total_products}</p>
                  </CardContent></Card>
                  <Card className="bg-slate-900/80 border-slate-800"><CardContent className="p-3 text-center">
                    <p className="text-slate-500 text-xs">Comptes</p>
                    <p className="text-xl font-bold text-blue-400">{activeInventory.counted_products}</p>
                  </CardContent></Card>
                  <Card className="bg-slate-900/80 border-slate-800"><CardContent className="p-3 text-center">
                    <p className="text-slate-500 text-xs">Restants</p>
                    <p className="text-xl font-bold text-amber-400">{activeInventory.total_products - activeInventory.counted_products}</p>
                  </CardContent></Card>
                  <Card className="bg-slate-900/80 border-slate-800"><CardContent className="p-3 text-center">
                    <p className="text-slate-500 text-xs">Ecart Total</p>
                    <p className={`text-xl font-bold ${activeInventory.total_ecart_value > 0 ? 'text-emerald-400' : activeInventory.total_ecart_value < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                      {formatPrice(activeInventory.total_ecart_value)} F
                    </p>
                  </CardContent></Card>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input value={inventorySearch} onChange={e => setInventorySearch(e.target.value)} placeholder="Rechercher un produit..."
                    className="bg-slate-900 border-slate-700 text-white pl-9" />
                </div>

                {/* Table */}
                <Card className="bg-slate-900/80 border-slate-800"><CardContent className="p-0"><div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="inventory-table">
                    <thead><tr className="text-left text-slate-400 border-b border-slate-800 bg-slate-900/50 text-xs">
                      <th className="p-2 pl-3">Produit</th>
                      <th className="p-2">Unite</th>
                      <th className="p-2 text-right">Stock Theorique</th>
                      <th className="p-2 text-center w-32">Quantite Physique</th>
                      <th className="p-2 text-right">Ecart</th>
                      <th className="p-2 text-right">Valeur Ecart</th>
                    </tr></thead>
                    <tbody>
                      {(activeInventory.items || [])
                        .filter(i => !inventorySearch || i.product_name.toLowerCase().includes(inventorySearch.toLowerCase()))
                        .map(item => {
                        const ecartColor = !item.counted ? 'text-slate-600' : item.ecart > 0 ? 'text-emerald-400' : item.ecart < 0 ? 'text-red-400' : 'text-slate-400';
                        return (
                          <tr key={item.product_id} className={`border-b border-slate-800/30 ${item.counted ? '' : 'opacity-70'}`}>
                            <td className="p-2 pl-3">
                              <div className="flex items-center gap-2">
                                {item.counted && <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />}
                                {!item.counted && <div className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />}
                                <span className="text-white text-xs">{item.product_name}</span>
                              </div>
                            </td>
                            <td className="p-2 text-slate-500 text-xs">{item.unit}</td>
                            <td className="p-2 text-right text-slate-300 text-xs">{typeof item.theoretical_quantity === 'number' ? parseFloat(item.theoretical_quantity.toFixed(2)) : item.theoretical_quantity}</td>
                            <td className="p-2 text-center">
                              {activeInventory.status === 'en_cours' ? (
                                <Input type="text" inputMode="decimal" min="0" step="0.01"
                                  value={item.physical_quantity ?? ""}
                                  onChange={e => updateCount(item.product_id, e.target.value)}
                                  className="bg-slate-800 border-slate-700 text-white h-7 text-xs text-center w-24 mx-auto"
                                  placeholder="---"
                                  data-testid={`count-${item.product_id}`} />
                              ) : (
                                <span className="text-white text-xs">{item.physical_quantity ?? "-"}</span>
                              )}
                            </td>
                            <td className={`p-2 text-right text-xs font-bold ${ecartColor}`}>
                              {item.counted ? (item.ecart > 0 ? '+' : '') + parseFloat((item.ecart || 0).toFixed(2)) : '-'}
                            </td>
                            <td className={`p-2 text-right text-xs ${ecartColor}`}>
                              {item.counted ? (item.ecart_value > 0 ? '+' : '') + formatPrice(item.ecart_value || 0) + ' F' : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div></CardContent></Card>
              </>
            )}
          </div>
        )}

        {/* FORECAST — Prévisions d'épuisement des stocks */}
        {activeSection === "forecast" && (
          <StockForecastPanel />
        )}

        {/* SNAPSHOT — Stock à une date donnée (Boissons) */}
        {activeSection === "snapshot" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Clock className="w-6 h-6 text-purple-400" />
                Stock à une date {snapshotOnlyDrinks ? "· Boissons" : "· Tous les produits"}
              </h2>
            </div>

            <Card className="bg-slate-900/60 border-slate-800">
              <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <div className="sm:col-span-2">
                  <Label className="text-xs text-slate-400">Date et heure de référence</Label>
                  <Input
                    type="datetime-local"
                    value={snapshotDate}
                    onChange={(e) => setSnapshotDate(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white"
                    data-testid="snapshot-date-input"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    L'état du stock est reconstruit à partir des mouvements postérieurs à cette date.
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-slate-400">Recherche</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 w-4 h-4 text-slate-500" />
                    <Input
                      value={snapshotSearch}
                      onChange={(e) => setSnapshotSearch(e.target.value)}
                      placeholder="Nom ou code..."
                      className="pl-8 bg-slate-800 border-slate-700 text-white"
                      data-testid="snapshot-search-input"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={fetchSnapshot}
                    disabled={snapshotLoading || !snapshotDate}
                    className="bg-purple-600 hover:bg-purple-700"
                    data-testid="snapshot-compute-btn"
                  >
                    <RefreshCw className={`w-4 h-4 mr-1 ${snapshotLoading ? "animate-spin" : ""}`} />
                    Calculer
                  </Button>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-300 sm:col-span-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={snapshotShowZero}
                    onChange={(e) => setSnapshotShowZero(e.target.checked)}
                    className="rounded"
                  />
                  Afficher aussi les produits avec un stock de 0 à cette date
                </label>
                {/* Périmètre + filtre catégorie */}
                <div className="sm:col-span-4 flex flex-wrap items-center gap-3 border-t border-slate-800 pt-3">
                  <div className="flex items-center gap-1 rounded-lg bg-slate-800/50 p-1 border border-slate-700">
                    <button
                      onClick={() => { setSnapshotOnlyDrinks(true); setSnapshotCategoryId("all"); }}
                      className={`px-3 py-1 rounded text-xs font-medium transition ${
                        snapshotOnlyDrinks ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
                      }`}
                      data-testid="snapshot-scope-drinks"
                    >
                      Boissons
                    </button>
                    <button
                      onClick={() => { setSnapshotOnlyDrinks(false); setSnapshotCategoryId("all"); }}
                      className={`px-3 py-1 rounded text-xs font-medium transition ${
                        !snapshotOnlyDrinks ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
                      }`}
                      data-testid="snapshot-scope-all"
                    >
                      Toutes catégories
                    </button>
                  </div>
                  {!snapshotOnlyDrinks && categories.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-slate-400 m-0">Catégorie</Label>
                      <select
                        value={snapshotCategoryId}
                        onChange={(e) => setSnapshotCategoryId(e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded-md text-white text-sm px-2 py-1.5"
                        data-testid="snapshot-category-filter"
                      >
                        <option value="all">Toutes ({categories.length})</option>
                        {[...categories].sort((a, b) => (a.name || "").localeCompare(b.name || "")).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* KPI summary */}
            {snapshotData && (
              <Card className="bg-gradient-to-br from-purple-900/30 to-slate-900/70 border-purple-500/30">
                <CardContent className="pt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-[10px] uppercase text-slate-400">Date interrogée</p>
                    <p className="text-base font-bold text-white">
                      {snapshotData.at?.replace("T", " · ").slice(0, 19)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-slate-400">{snapshotOnlyDrinks ? "Boissons trouvées" : "Produits trouvés"}</p>
                    <p className="text-2xl font-bold text-purple-300">{snapshotData.total_products}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-slate-400">Quantité totale (toutes unités)</p>
                    <p className="text-2xl font-bold text-emerald-300">
                      {Math.round(snapshotData.total_quantity || 0).toLocaleString("fr-FR")}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-slate-400">Valorisation stock</p>
                    <p className="text-2xl font-bold text-amber-300">
                      {Math.round(snapshotData.total_value || 0).toLocaleString("fr-FR")} F
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Liste des produits */}
            <Card className="bg-slate-900/60 border-slate-800">
              <CardContent className="pt-4">
                {snapshotLoading ? (
                  <div className="py-10 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Calcul du stock à la date demandée…
                  </div>
                ) : !snapshotData ? (
                  <div className="py-10 text-center text-slate-500 text-sm">
                    Choisissez une date puis cliquez sur "Calculer".
                  </div>
                ) : (
                  (() => {
                    const term = (snapshotSearch || "").toLowerCase().trim();
                    let rows = snapshotData.products || [];
                    if (!snapshotOnlyDrinks && snapshotCategoryId !== "all") {
                      rows = rows.filter((r) => r.category_id === snapshotCategoryId);
                    }
                    if (!snapshotShowZero) rows = rows.filter((r) => (r.quantity_at || 0) > 0);
                    if (term) rows = rows.filter((r) =>
                      (r.name || "").toLowerCase().includes(term)
                      || (r.code || "").toLowerCase().includes(term)
                      || (r.category_name || "").toLowerCase().includes(term)
                    );
                    if (rows.length === 0) {
                      return (
                        <div className="py-10 text-center text-slate-500 text-sm">
                          Aucun produit ne correspond.
                        </div>
                      );
                    }
                    return (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[11px] uppercase text-slate-400 border-b border-slate-800">
                              <th className="text-left p-2">Code</th>
                              <th className="text-left p-2">Produit</th>
                              <th className="text-left p-2">Catégorie</th>
                              <th className="text-right p-2">Stock à la date</th>
                              <th className="text-right p-2">Unité</th>
                              <th className="text-right p-2">Stock actuel</th>
                              <th className="text-right p-2">Δ depuis</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r) => {
                              const delta = r.delta_after || 0;
                              const lowStock = r.stock_min && r.quantity_at <= r.stock_min;
                              return (
                                <tr key={r.id} className="border-b border-slate-800/60 hover:bg-slate-800/40" data-testid={`snapshot-row-${r.id}`}>
                                  <td className="p-2 font-mono text-[11px] text-slate-400">{r.code || "—"}</td>
                                  <td className="p-2 text-white">{r.name}</td>
                                  <td className="p-2 text-slate-400 text-xs">{r.category_name}</td>
                                  <td className={`p-2 text-right font-bold ${lowStock ? "text-amber-300" : "text-white"}`}>
                                    {Number(r.quantity_at).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}
                                    {lowStock && <span className="ml-1 text-[10px]">⚠</span>}
                                  </td>
                                  <td className="p-2 text-right text-slate-400 text-xs">{r.unit}</td>
                                  <td className="p-2 text-right text-slate-300">
                                    {Number(r.current_quantity).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}
                                  </td>
                                  <td className={`p-2 text-right text-xs ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-slate-500"}`}>
                                    {delta > 0 ? "+" : ""}{Number(delta).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* DRINKS RESTOCK PLAN */}
        {activeSection === "drinks_restock" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <PackageCheck className="w-6 h-6 text-purple-400" />
                Plan d'approvisionnement · Boissons
              </h2>
            </div>
            <DrinksRestockTab />
          </div>
        )}

        {/* PURCHASES */}
        {activeSection === "purchases" && (() => {
          // Application des filtres Source + Réception
          const filteredPurchases = purchases.filter(p => {
            if (purchaseSourceFilter === "caisse" && p.source !== "caisse") return false;
            if (purchaseSourceFilter === "stock" && p.source === "caisse") return false;
            if (purchaseReceptionFilter === "expected" && (p.reception_status !== "expected" && p.source !== "caisse")) return false;
            if (purchaseReceptionFilter === "expected" && p.source === "caisse" && p.caisse_status !== "approved") return false;
            if (purchaseReceptionFilter === "received" && p.source === "caisse" && p.caisse_status !== "completed" && p.status !== "validated") return false;
            return true;
          });
          const caisseCount = purchases.filter(p => p.source === "caisse").length;
          const stockCount = purchases.filter(p => p.source !== "caisse").length;
          return (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-2xl font-bold text-white">Achats / Approvisionnement</h2>
              <Button onClick={() => { setPurchaseForm({ supplier_id: "", supplier_name: "", purchase_date: new Date().toISOString().slice(0, 10), items: [], notes: "" }); setShowPurchaseModal(true); }}
                className="bg-emerald-600 hover:bg-emerald-700" data-testid="new-purchase-btn"><Plus className="w-4 h-4 mr-1" /> Nouvel Achat</Button>
            </div>

            {/* Filtres Source + Réception */}
            <Card className="bg-slate-900/60 border-slate-700">
              <CardContent className="p-3 flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase text-slate-400 mr-1">Source :</span>
                <Button size="sm" variant={purchaseSourceFilter === "all" ? "default" : "outline"}
                  onClick={() => setPurchaseSourceFilter("all")}
                  className={`h-7 text-xs ${purchaseSourceFilter === "all" ? "bg-slate-600 text-white" : "border-slate-700 text-slate-300"}`}
                  data-testid="filter-source-all">
                  Tous ({purchases.length})
                </Button>
                <Button size="sm" variant={purchaseSourceFilter === "caisse" ? "default" : "outline"}
                  onClick={() => setPurchaseSourceFilter("caisse")}
                  className={`h-7 text-xs ${purchaseSourceFilter === "caisse" ? "bg-amber-600 text-white" : "border-amber-500/40 text-amber-300"}`}
                  data-testid="filter-source-caisse">
                  Caisse ({caisseCount})
                </Button>
                <Button size="sm" variant={purchaseSourceFilter === "stock" ? "default" : "outline"}
                  onClick={() => setPurchaseSourceFilter("stock")}
                  className={`h-7 text-xs ${purchaseSourceFilter === "stock" ? "bg-emerald-600 text-white" : "border-emerald-500/40 text-emerald-300"}`}
                  data-testid="filter-source-stock">
                  Stock direct ({stockCount})
                </Button>
                <div className="w-px h-6 bg-slate-700 mx-1" />
                <span className="text-xs uppercase text-slate-400 mr-1">Réception :</span>
                <Button size="sm" variant={purchaseReceptionFilter === "all" ? "default" : "outline"}
                  onClick={() => setPurchaseReceptionFilter("all")}
                  className={`h-7 text-xs ${purchaseReceptionFilter === "all" ? "bg-slate-600 text-white" : "border-slate-700 text-slate-300"}`}>
                  Tous
                </Button>
                <Button size="sm" variant={purchaseReceptionFilter === "expected" ? "default" : "outline"}
                  onClick={() => setPurchaseReceptionFilter("expected")}
                  className={`h-7 text-xs ${purchaseReceptionFilter === "expected" ? "bg-blue-600 text-white" : "border-blue-500/40 text-blue-300"}`}>
                  En attente
                </Button>
                <Button size="sm" variant={purchaseReceptionFilter === "received" ? "default" : "outline"}
                  onClick={() => setPurchaseReceptionFilter("received")}
                  className={`h-7 text-xs ${purchaseReceptionFilter === "received" ? "bg-emerald-600 text-white" : "border-emerald-500/40 text-emerald-300"}`}>
                  Reçu
                </Button>
              </CardContent>
            </Card>

            {isAdmin && <BulkBar count={selectedItems.filter(id => filteredPurchases.some(p => p.id === id && !id.startsWith('caisse-'))).length} label="achat(s)" endpoint="purchases/delete-bulk" ids={selectedItems.filter(id => filteredPurchases.some(p => p.id === id && !id.startsWith('caisse-')))} refreshFn={fetchPurchases} />}
            {filteredPurchases.map(p => {
              const statusBadge = p.source === "caisse" ? (
                p.caisse_status === "completed" || p.status === "validated" ? <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">Valide</Badge>
                : p.caisse_status === "approved" || p.status === "approuve" ? <Badge className="bg-blue-500/20 text-blue-400 text-xs">Approuve</Badge>
                : p.caisse_status === "revision_requested" || p.status === "en_revision" ? <Badge className="bg-orange-500/20 text-orange-400 text-xs">En revision</Badge>
                : p.caisse_status === "rejected" || p.status === "rejete" ? <Badge className="bg-red-500/20 text-red-400 text-xs">Rejete</Badge>
                : <Badge className="bg-slate-500/20 text-slate-400 text-xs">En attente</Badge>
              ) : <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">Valide</Badge>;
              const canDelete = isAdmin && !p.id.startsWith('caisse-');
              return (
              <Card key={p.id} className={`bg-slate-900/80 border-slate-800 ${selectedItems.includes(p.id) ? 'ring-1 ring-red-500/50' : ''}`} data-testid={`purchase-card-${p.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {canDelete && <input type="checkbox" className="rounded bg-slate-800 border-slate-600" checked={selectedItems.includes(p.id)} onChange={() => toggleSelect(p.id)} />}
                      <span className="text-slate-400 text-sm">{p.purchase_date}</span>
                      <span className="text-white font-bold">{p.supplier_name || "-"}</span>
                      {p.source === "caisse" && <Badge className="bg-amber-600/20 text-amber-400 text-xs border-amber-600/30">Caisse</Badge>}
                      {statusBadge}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-emerald-400 font-bold text-lg">{formatPrice(p.total_amount)} F</span>
                      <span className="text-slate-500 text-xs">{p.user_name}</span>
                      {canDelete && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-red-400" onClick={() => deletePurchase(p.id)}><Trash2 className="w-3.5 h-3.5" /></Button>}
                    </div>
                  </div>
                  {p.items && p.items.length > 0 && (
                    <div className="bg-slate-800/30 rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead><tr className="text-slate-500 border-b border-slate-700/40">
                          <th className="text-left p-2 pl-3">Designation</th>
                          <th className="text-right p-2">Quantite</th>
                          <th className="text-right p-2">Prix Unitaire</th>
                          <th className="text-right p-2 pr-3">Montant</th>
                        </tr></thead>
                        <tbody>
                          {p.items.map((item, idx) => (
                            <tr key={idx} className="border-t border-slate-700/20">
                              <td className="py-1.5 pl-3 text-white">{item.product_name || item.description || "-"}</td>
                              <td className="py-1.5 text-right text-slate-300">{item.quantity} {item.unit || ""}</td>
                              <td className="py-1.5 text-right text-slate-400">{formatPrice(item.unit_price)} F</td>
                              <td className="py-1.5 text-right pr-3 text-emerald-400 font-medium">{formatPrice((item.quantity || 0) * (item.unit_price || 0))} F</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot><tr className="border-t border-slate-600/50">
                          <td colSpan={3} className="pt-2 pb-1 pl-3 text-right text-slate-400 font-medium">Total</td>
                          <td className="pt-2 pb-1 text-right pr-3 text-emerald-400 font-bold">{formatPrice(p.total_amount)} F</td>
                        </tr></tfoot>
                      </table>
                    </div>
                  )}
                  {p.notes && <p className="text-slate-500 text-xs mt-2 italic">{p.notes}</p>}
                </CardContent>
              </Card>
              );
            })}
            {filteredPurchases.length === 0 && (
              <Card className="bg-slate-900/80 border-slate-800"><CardContent className="p-8 text-center text-slate-500">Aucun achat enregistre pour ces filtres</CardContent></Card>
            )}
          </div>
          );
        })()}

        {/* SUPPLIERS */}
        {activeSection === "suppliers" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Fournisseurs</h2>
              <Button onClick={() => { setEditingItem(null); setSupplierForm({ name: "", phone: "", email: "", address: "", product_types: "", notes: "" }); setShowSupplierModal(true); }}
                className="bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4 mr-1" /> Nouveau Fournisseur</Button>
            </div>
            {isAdmin && <BulkBar count={selectedItems.filter(id => suppliers.some(s => s.id === id)).length} label="fournisseur(s)" endpoint="suppliers/delete-bulk" ids={selectedItems.filter(id => suppliers.some(s => s.id === id))} refreshFn={fetchSuppliers} />}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {suppliers.map(s => (
                <Card key={s.id} className={`bg-slate-900/80 border-slate-800 ${selectedItems.includes(s.id) ? 'ring-1 ring-red-500/50' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        {isAdmin && <input type="checkbox" className="rounded bg-slate-800 border-slate-600" checked={selectedItems.includes(s.id)} onChange={() => toggleSelect(s.id)} />}
                        <h3 className="text-white font-bold">{s.name}</h3>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-blue-400" onClick={() => { setEditingItem(s); setSupplierForm(s); setShowSupplierModal(true); }}><Edit2 className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-red-400" onClick={() => deleteSupplier(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </div>
                    {s.phone && <p className="text-slate-400 text-sm">{s.phone}</p>}
                    {s.address && <p className="text-slate-500 text-xs">{s.address}</p>}
                    {s.product_types && <Badge className="bg-slate-700/50 text-slate-300 text-xs mt-2">{s.product_types}</Badge>}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* CATEGORIES */}
        {activeSection === "categories" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Categories</h2>
              <Button onClick={() => { setEditingItem(null); setCategoryForm({ name: "", description: "", color: "#3b82f6" }); setShowCategoryModal(true); }}
                className="bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4 mr-1" /> Nouvelle Categorie</Button>
            </div>
            {isAdmin && <BulkBar count={selectedItems.filter(id => categories.some(c => c.id === id)).length} label="categorie(s)" endpoint="categories/delete-bulk" ids={selectedItems.filter(id => categories.some(c => c.id === id))} refreshFn={fetchCategories} />}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {categories.map(c => {
                const count = products.filter(p => p.category_id === c.id).length;
                return (
                  <Card key={c.id} className={`bg-slate-900/80 border-slate-800 ${selectedItems.includes(c.id) ? 'ring-1 ring-red-500/50' : ''}`}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          {isAdmin && <input type="checkbox" className="rounded bg-slate-800 border-slate-600" checked={selectedItems.includes(c.id)} onChange={() => toggleSelect(c.id)} />}
                          <div className="w-3 h-3 rounded-full" style={{ background: c.color }} />
                          <h3 className="text-white font-medium">{c.name}</h3>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-blue-400" onClick={() => { setEditingItem(c); setCategoryForm({ name: c.name, description: c.description || "", color: c.color }); setShowCategoryModal(true); }}><Edit2 className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-red-400" onClick={() => deleteCategory(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </div>
                      <p className="text-slate-500 text-xs mt-1">{c.description}</p>
                      <Badge className="bg-slate-700/50 text-slate-300 text-xs mt-2">{count} produit(s)</Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* USERS - Admin only */}
        {activeSection === "users" && isAdmin && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Utilisateurs</h2>
              <Button onClick={() => { setEditingItem(null); setUserForm({ username: "", password: "", full_name: "", role: "magasinier" }); setShowUserModal(true); }}
                className="bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4 mr-1" /> Nouvel Utilisateur</Button>
            </div>
            <BulkBar count={selectedItems.filter(id => stockUsers.some(u => u.id === id)).length} label="utilisateur(s)" endpoint="auth/users/delete-bulk" ids={selectedItems.filter(id => stockUsers.some(u => u.id === id))} refreshFn={fetchUsers} />
            <Card className="bg-slate-900/80 border-slate-800"><CardContent className="p-0"><div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-400 border-b border-slate-800 bg-slate-900/50">
                  <th className="p-3 w-8"><input type="checkbox" className="rounded bg-slate-800 border-slate-600" checked={stockUsers.length > 0 && stockUsers.every(u => selectedItems.includes(u.id))} onChange={() => toggleSelectAll(stockUsers.map(u => u.id))} /></th>
                  <th className="p-3">Nom complet</th><th className="p-3">Identifiant</th><th className="p-3">Role</th><th className="p-3">Statut</th><th className="p-3">Derniere connexion</th><th className="p-3"></th>
                </tr></thead>
                <tbody>
                  {stockUsers.map(u => (
                    <tr key={u.id} className={`border-b border-slate-800/50 hover:bg-slate-800/30 ${selectedItems.includes(u.id) ? 'bg-slate-800/50' : ''}`}>
                      <td className="p-3"><input type="checkbox" className="rounded bg-slate-800 border-slate-600" checked={selectedItems.includes(u.id)} onChange={() => toggleSelect(u.id)} /></td>
                      <td className="p-3 text-white font-medium">{u.full_name}</td>
                      <td className="p-3 text-slate-400">{u.username}</td>
                      <td className="p-3"><Badge className={`text-xs ${u.role === 'administrateur' ? 'bg-red-500/20 text-red-400' : u.role === 'gerant' ? 'bg-blue-500/20 text-blue-400' : u.role === 'magasinier' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-500/20 text-slate-400'}`}>{u.role}</Badge></td>
                      <td className="p-3"><Badge className={u.is_active ? 'bg-emerald-500/20 text-emerald-400 text-xs' : 'bg-red-500/20 text-red-400 text-xs'}>{u.is_active ? 'Actif' : 'Inactif'}</Badge></td>
                      <td className="p-3 text-slate-500 text-xs">{u.last_login ? new Date(u.last_login).toLocaleString('fr-FR') : 'Jamais'}</td>
                      <td className="p-3"><div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-blue-400" onClick={() => { setEditingItem(u); setUserForm({ username: u.username, password: "", full_name: u.full_name, role: u.role }); setShowUserModal(true); }}><Edit2 className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-red-400" onClick={() => deleteUser(u.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></CardContent></Card>
          </div>
        )}
      </main>

      {/* ===== MODALS ===== */}
      {/* Product Modal */}
      <Dialog open={showProductModal} onOpenChange={setShowProductModal}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-white">{editingItem ? "Modifier le Produit" : "Nouveau Produit"}</DialogTitle><DialogDescription className="text-slate-400">Remplissez les informations du produit</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-slate-300 text-xs">Code produit</Label>
                <div className="flex gap-1">
                  <Input
                    value={productForm.code}
                    onChange={e => setProductForm(p => ({...p, code: e.target.value}))}
                    className="bg-slate-800 border-slate-700 text-white flex-1"
                    placeholder="Auto-généré si vide"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
                      setProductForm(p => ({ ...p, code: `PRD-${rand}` }));
                    }}
                    className="border-slate-700 text-slate-300 hover:bg-slate-700 px-2"
                    title="Générer un code automatiquement"
                  >
                    Auto
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-slate-300 text-xs">Nom du produit *</Label>
                {(() => {
                  const q = (productForm.name || "").toLowerCase().trim();
                  // Suggest only when typing AND not editing an existing product
                  const showSuggestions = !editingItem && q.length >= 2;
                  const matches = showSuggestions
                    ? products
                        .filter(p => (p.name || "").toLowerCase().includes(q))
                        .slice(0, 8)
                    : [];
                  return (
                    <div className="relative">
                      <Input
                        value={productForm.name}
                        onChange={e => setProductForm(p => ({...p, name: e.target.value}))}
                        className="bg-slate-800 border-slate-700 text-white"
                        placeholder="Tapez le nom — suggestions automatiques"
                        data-testid="product-name-input"
                      />
                      {matches.length > 0 && (
                        <div className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto bg-slate-800 border border-slate-700 rounded-lg shadow-xl">
                          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-slate-500 bg-slate-900/50">
                            Produits existants — cliquez pour charger
                          </div>
                          {matches.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setEditingItem(p);
                                setProductForm({
                                  code: p.code || "",
                                  name: p.name,
                                  category_id: p.category_id || "",
                                  subcategory: p.subcategory || "",
                                  unit: p.unit || "kg",
                                  quantity: p.quantity || 0,
                                  stock_min: p.stock_min || 0,
                                  stock_max: p.stock_max || 100,
                                  purchase_price: p.purchase_price || 0,
                                  sale_price: p.sale_price || 0,
                                  supplier_id: p.supplier_id || "",
                                  storage_location: p.storage_location || "",
                                  storage_zone: p.storage_zone || "cuisine",
                                  date_achat: p.date_achat || "",
                                  date_peremption: p.date_peremption || "",
                                  observation: p.observation || "",
                                });
                                toast.info(`Produit "${p.name}" chargé pour modification`);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-slate-700 border-b border-slate-700/40 last:border-b-0"
                              data-testid={`product-name-suggestion-${p.id}`}
                            >
                              <div className="text-white text-sm font-medium">{p.name}</div>
                              <div className="text-[11px] text-slate-400">
                                {p.code ? `${p.code} · ` : ""}
                                {(p.storage_zone || 'cuisine') === 'magasin' ? '🏬 Magasin' : '🏠 Restau'}
                                {" · "}qté : {p.quantity} {p.unit}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-slate-300 text-xs">Categorie *</Label>
                <Select value={productForm.category_id} onValueChange={v => setProductForm(p => ({...p, category_id: v, subcategory: ""}))}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">{categories.map(c => <SelectItem key={c.id} value={c.id} className="text-white">{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-slate-300 text-xs">Sous-categorie</Label>
                {(() => {
                  const selectedCat = categories.find(c => c.id === productForm.category_id);
                  const subs = selectedCat?.subcategories || [];
                  return subs.length > 0 ? (
                    <Select value={productForm.subcategory || "none"} onValueChange={v => setProductForm(p => ({...p, subcategory: v === "none" ? "" : v}))}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white"><SelectValue placeholder="Choisir" /></SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700"><SelectItem value="none" className="text-slate-400">Aucune</SelectItem>{subs.map(s => <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : <Input value={productForm.subcategory} onChange={e => setProductForm(p => ({...p, subcategory: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" placeholder="Sous-categorie" />;
                })()}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-slate-300 text-xs">Unite</Label>
                <Select value={productForm.unit} onValueChange={v => setProductForm(p => ({...p, unit: v}))}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 max-h-[200px]">{UNITS.map(u => <SelectItem key={u} value={u} className="text-white">{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-slate-300 text-xs">Fournisseur</Label>
                <Select value={productForm.supplier_id || "none"} onValueChange={v => setProductForm(p => ({...p, supplier_id: v === "none" ? "" : v}))}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white"><SelectValue placeholder="Aucun" /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700"><SelectItem value="none" className="text-slate-400">Aucun</SelectItem>{suppliers.map(s => <SelectItem key={s.id} value={s.id} className="text-white">{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-slate-300 text-xs">Quantite</Label><DecimalInput value={productForm.quantity} onChange={(n) => setProductForm(p => ({...p, quantity: n}))} className="bg-slate-800 border-slate-700 text-white" /></div>
              <div><Label className="text-slate-300 text-xs">Stock Min</Label><DecimalInput value={productForm.stock_min} onChange={(n) => setProductForm(p => ({...p, stock_min: n}))} className="bg-slate-800 border-slate-700 text-white" /></div>
              <div><Label className="text-slate-300 text-xs">Stock Max</Label><DecimalInput value={productForm.stock_max} onChange={(n) => setProductForm(p => ({...p, stock_max: n}))} className="bg-slate-800 border-slate-700 text-white" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-slate-300 text-xs">Prix d'achat (FCFA)</Label><DecimalInput value={productForm.purchase_price} onChange={(n) => setProductForm(p => ({...p, purchase_price: n}))} className="bg-slate-800 border-slate-700 text-white" /></div>
              <div><Label className="text-slate-300 text-xs">Prix de vente unitaire (FCFA)</Label><DecimalInput value={productForm.sale_price} onChange={(n) => setProductForm(p => ({...p, sale_price: n}))} className="bg-slate-800 border-slate-700 text-white" /></div>
              <div><Label className="text-slate-300 text-xs">Emplacement</Label><Input value={productForm.storage_location} onChange={e => setProductForm(p => ({...p, storage_location: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" placeholder="Reserve, Restau..." /></div>
            </div>

            {/* Storage zone selector */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
              <Label className="text-slate-300 text-xs uppercase tracking-wide mb-2 block">Zone de stockage</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: 'cuisine', l: 'Restau (auto)', d: 'Déstockage auto via factures/recettes', color: 'emerald' },
                  { v: 'magasin', l: 'Magasin (manuel)', d: 'Déstockage manuel uniquement', color: 'amber' },
                ].map(opt => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setProductForm(p => ({ ...p, storage_zone: opt.v }))}
                    data-testid={`storage-zone-${opt.v}`}
                    className={`px-3 py-2 rounded-lg border text-left transition-colors ${
                      (productForm.storage_zone || 'cuisine') === opt.v
                        ? (opt.v === 'magasin' ? 'bg-amber-500/20 border-amber-500/60 text-amber-100' : 'bg-emerald-500/20 border-emerald-500/60 text-emerald-100')
                        : 'bg-slate-900/40 border-slate-700 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <p className="font-bold text-sm">{opt.l}</p>
                    <p className="text-[11px] opacity-75">{opt.d}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-slate-300 text-xs">Date d'achat</Label><Input type="date" value={productForm.date_achat} onChange={e => setProductForm(p => ({...p, date_achat: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" /></div>
              <div><Label className="text-slate-300 text-xs">Date de peremption</Label><Input type="date" value={productForm.date_peremption} onChange={e => setProductForm(p => ({...p, date_peremption: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" /></div>
            </div>
            <div><Label className="text-slate-300 text-xs">Observation</Label><Textarea value={productForm.observation} onChange={e => setProductForm(p => ({...p, observation: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" rows={2} placeholder="Remarques..." /></div>

            {/* Photo produit (Phase 3) — upload base64 */}
            <div>
              <Label className="text-slate-300 text-xs flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5" /> Photo du produit (optionnel)
              </Label>
              <div className="mt-1 flex items-start gap-3">
                {productForm.photo_url ? (
                  <div className="relative">
                    <img
                      src={productForm.photo_url}
                      alt="Aperçu"
                      className="w-20 h-20 rounded-lg object-cover border border-slate-600"
                      data-testid="product-photo-preview"
                    />
                    <button
                      type="button"
                      onClick={() => setProductForm(p => ({ ...p, photo_url: "" }))}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow"
                      data-testid="product-photo-remove"
                      title="Retirer la photo"
                    >×</button>
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-lg border border-dashed border-slate-600 flex items-center justify-center bg-slate-800/40">
                    <ImageIcon className="w-6 h-6 text-slate-600" />
                  </div>
                )}
                <div className="flex-1 space-y-1">
                  <input
                    type="file"
                    accept="image/*"
                    id="product-photo-input"
                    data-testid="product-photo-input"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024) {
                        toast.error("Image trop lourde (max 2 Mo). Réduisez-la avant d'uploader.");
                        e.target.value = "";
                        return;
                      }
                      // Compress to ~500px max width via canvas before storing as base64
                      const img = new Image();
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        img.onload = () => {
                          const canvas = document.createElement("canvas");
                          const maxDim = 500;
                          const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
                          canvas.width = Math.round(img.width * ratio);
                          canvas.height = Math.round(img.height * ratio);
                          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                          const b64 = canvas.toDataURL("image/jpeg", 0.8);
                          setProductForm(p => ({ ...p, photo_url: b64 }));
                          toast.success("Photo prête");
                        };
                        img.src = ev.target.result;
                      };
                      reader.readAsDataURL(file);
                      e.target.value = "";
                    }}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => document.getElementById("product-photo-input").click()}
                    className="border-slate-600 text-slate-300 hover:bg-slate-800"
                    data-testid="product-photo-btn"
                  >
                    <Upload className="w-3.5 h-3.5 mr-1" />
                    {productForm.photo_url ? "Remplacer" : "Charger une photo"}
                  </Button>
                  <p className="text-[10px] text-slate-500">
                    JPEG / PNG, max 2 Mo. Redimensionnée à 500 px avant sauvegarde.
                  </p>
                </div>
              </div>
            </div>

            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={saveProduct}><Save className="w-4 h-4 mr-1" /> {editingItem ? "Mettre a jour" : "Enregistrer"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* === Modal AJUSTEMENT QUANTITÉ (motif obligatoire) === */}
      <Dialog open={adjustModalOpen} onOpenChange={(open) => { if (!open) { setAdjustModalOpen(false); setAdjustReason(""); setAdjustCustomReason(""); } }}>
        <DialogContent className="bg-slate-900 border-amber-500/50 text-white max-w-lg" data-testid="adjust-quantity-modal">
          <DialogHeader>
            <DialogTitle className="text-amber-300 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Ajustement de quantité — motif obligatoire
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-sm">
              Un mouvement d'ajustement sera créé pour tracer cette modification.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">Produit</p>
              <p className="text-white font-semibold mb-2">{adjustInfo.name}</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] uppercase text-slate-500 mb-0.5">Avant</p>
                  <p className="text-base font-bold text-slate-300">{adjustInfo.old}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-slate-500 mb-0.5">Delta</p>
                  <p className={`text-base font-bold ${adjustInfo.delta > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {adjustInfo.delta > 0 ? "+" : ""}{adjustInfo.delta}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-slate-500 mb-0.5">Après</p>
                  <p className="text-base font-bold text-amber-300">{adjustInfo.new}</p>
                </div>
              </div>
            </div>
            <div>
              <Label className="text-xs text-slate-300 mb-1 block">Motif de l'ajustement *</Label>
              <Select value={adjustReason} onValueChange={setAdjustReason}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white" data-testid="adjust-reason-select">
                  <SelectValue placeholder="Choisir un motif…" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {ADJUST_REASONS.map((r) => (
                    <SelectItem key={r} value={r} className="text-white">{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {adjustReason === "Inventaire physique" && Number(editingItem?.pending_destock_quantity || 0) > 0 && (
                <div className="mt-2 text-[11px] bg-emerald-500/10 border border-emerald-500/40 text-emerald-200 rounded p-2" data-testid="physical-inventory-info">
                  ℹ️ <strong>Mode comptage physique</strong> : tu as {Number(editingItem.pending_destock_quantity).toLocaleString("fr-FR")} {editingItem?.unit || ""} de
                  dette accumulée pendant la rupture. Cette dette sera <strong>effacée</strong> sans toucher au chiffre
                  saisi : le stock final restera {adjustInfo.new} {editingItem?.unit || ""}.
                </div>
              )}
              {adjustReason && adjustReason !== "Inventaire physique" && Number(editingItem?.pending_destock_quantity || 0) > 0 && (
                <div className="mt-2 text-[11px] bg-amber-500/10 border border-amber-500/40 text-amber-200 rounded p-2" data-testid="backlog-deduction-info">
                  ⚠️ <strong>Attention dette stock</strong> : {Number(editingItem.pending_destock_quantity).toLocaleString("fr-FR")} {editingItem?.unit || ""} seront <strong>déduits</strong> de {adjustInfo.new} →
                  stock final = {Math.max(0, adjustInfo.new - Number(editingItem.pending_destock_quantity))}. Choisis
                  "<em>Inventaire physique</em>" si tu veux que le chiffre saisi soit le stock final.
                </div>
              )}
            </div>
            {adjustReason === "Autre (préciser)" && (
              <div>
                <Label className="text-xs text-slate-300 mb-1 block">Précisez le motif *</Label>
                <Input
                  value={adjustCustomReason}
                  onChange={(e) => setAdjustCustomReason(e.target.value)}
                  placeholder="ex: Correction inventaire mensuel"
                  className="bg-slate-800 border-slate-700 text-white"
                  data-testid="adjust-custom-reason-input"
                />
                {adjustCustomReason && adjustCustomReason.trim().length < 3 && (
                  <p className="text-rose-400 text-[11px] mt-1">Motif trop court (min. 3 caractères)</p>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end pt-2 border-t border-slate-700">
            <Button variant="outline" className="border-slate-600 text-slate-300" onClick={() => { setAdjustModalOpen(false); setAdjustReason(""); setAdjustCustomReason(""); }} data-testid="adjust-cancel">
              Annuler
            </Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={confirmAdjustmentAndSave} data-testid="adjust-confirm">
              <Save className="w-4 h-4 mr-1" /> Confirmer & Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* Photo Zoom Modal — view product photo in full size */}
      <Dialog open={!!photoZoom} onOpenChange={(v) => { if (!v) setPhotoZoom(null); }}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl p-4" data-testid="photo-zoom-modal">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-emerald-400" /> {photoZoom?.name || "Photo produit"}
            </DialogTitle>
          </DialogHeader>
          {photoZoom?.url && (
            <div className="flex items-center justify-center bg-slate-950 rounded-lg border border-slate-700 overflow-hidden">
              <img src={photoZoom.url} alt={photoZoom.name} className="max-h-[70vh] w-auto object-contain" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Package Modal — saisie rapide X casiers @ Y F → +N unités */}
      <Dialog open={showAddPackageModal} onOpenChange={setShowAddPackageModal}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md" data-testid="add-package-modal">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-400" /> Ajouter par package
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {addPackageTarget ? (
                <>Entrée rapide pour <strong className="text-white">{addPackageTarget.name}</strong> (unité actuelle : {addPackageTarget.unit}).</>
              ) : "Ajouter une entrée par package"}
            </DialogDescription>
          </DialogHeader>
          {addPackageTarget && (
            <div className="space-y-4">
              <div className="bg-slate-800/50 border border-slate-700 rounded p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-slate-400">Stock actuel</span><span className="text-white font-semibold">{addPackageTarget.quantity} {addPackageTarget.unit}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Prix actuel</span><span className="text-white font-semibold">{formatPrice(addPackageTarget.purchase_price)} F / {addPackageTarget.unit}</span></div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-slate-300 text-xs">Nb packages *</Label>
                  <DecimalInput value={addPackageForm.package_qty}
                    onChange={(n) => setAddPackageForm({ ...addPackageForm, package_qty: n })}
                    className="bg-slate-800 border-slate-700 text-white" data-testid="add-pkg-qty" autoFocus />
                </div>
                <div>
                  <Label className="text-slate-300 text-xs">Prix / package *</Label>
                  <DecimalInput value={addPackageForm.package_price}
                    onChange={(n) => setAddPackageForm({ ...addPackageForm, package_price: n })}
                    placeholder="ex: 7200" className="bg-slate-800 border-slate-700 text-white" data-testid="add-pkg-price" />
                </div>
                <div>
                  <Label className="text-slate-300 text-xs">{addPackageTarget.unit}/package</Label>
                  <DecimalInput value={addPackageForm.items_per_package}
                    onChange={(n) => setAddPackageForm({ ...addPackageForm, items_per_package: n })}
                    className="bg-slate-800 border-slate-700 text-white" data-testid="add-pkg-items" />
                </div>
              </div>

              {(() => {
                const pq = parseFloat(addPackageForm.package_qty) || 0;
                const pp = parseFloat(addPackageForm.package_price) || 0;
                const ipp = parseInt(addPackageForm.items_per_package, 10) || 0;
                if (pq <= 0 || ipp <= 0) return null;
                const addedUnits = pq * ipp;
                const newQty = (addPackageTarget.quantity || 0) + addedUnits;
                const newPrice = pp / ipp;
                const totalSpent = pq * pp;
                return (
                  <div className="bg-emerald-900/20 border border-emerald-500/40 rounded p-3 text-sm space-y-1">
                    <p className="text-emerald-300 font-medium mb-1">📦 Après ajout :</p>
                    <div className="flex justify-between"><span className="text-slate-400">Unités ajoutées</span><span className="text-white font-bold">+{addedUnits} {addPackageTarget.unit}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Nouveau stock</span><span className="text-emerald-400 font-bold">{newQty} {addPackageTarget.unit}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Nouveau PU</span><span className="text-white font-bold">{formatPrice(newPrice)} F / {addPackageTarget.unit}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Total dépensé</span><span className="text-amber-400 font-bold">{formatPrice(totalSpent)} F</span></div>
                  </div>
                );
              })()}

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowAddPackageModal(false)} className="text-slate-400">Annuler</Button>
                <Button onClick={submitAddPackage} className="bg-emerald-600 hover:bg-emerald-700" data-testid="add-pkg-submit">
                  <Plus className="w-4 h-4 mr-1" /> Ajouter
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Unit Conversion Modal */}
      <Dialog open={showBulkConvertModal} onOpenChange={setShowBulkConvertModal}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md" data-testid="bulk-convert-modal">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2"><Package className="w-5 h-5 text-violet-400" /> Convertir par lot</DialogTitle>
            <DialogDescription className="text-slate-400">
              Convertit tous les produits d'une catégorie ayant l'unité sélectionnée. La valeur comptable est préservée (qté × prix inchangé).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-slate-300 text-xs">Catégorie</Label>
                <Select value={bulkConvertForm.category_id} onValueChange={(v) => setBulkConvertForm({ ...bulkConvertForm, category_id: v })}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white" data-testid="bulk-convert-cat-select"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 max-h-[250px]">
                    <SelectItem value="all" className="text-white">Toutes les catégories</SelectItem>
                    {categories.map(c => <SelectItem key={c.id} value={c.id} className="text-white">{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-300 text-xs">Unité actuelle à convertir *</Label>
                <Select value={bulkConvertForm.from_unit} onValueChange={(v) => {
                  // Smart defaults for multiplier when changing from_unit
                  const defaults = { casier: 24, pack: 6, carton: 12, bac: 24, caisse: 24, sac: 25, bidon: 20, pot: 1 };
                  const defaultsUnit = { sac: "kg", bidon: "litre" };
                  setBulkConvertForm({
                    ...bulkConvertForm,
                    from_unit: v,
                    multiplier: defaults[v] || bulkConvertForm.multiplier,
                    new_unit: defaultsUnit[v] || "bouteille",
                  });
                }}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white" data-testid="bulk-convert-from-select"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {["casier","pack","carton","bac","caisse","sac","bidon","pot","plateau","paquet","lot"].map(u => (
                      <SelectItem key={u} value={u} className="text-white">{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-slate-300 text-xs">Nombre par {bulkConvertForm.from_unit} *</Label>
                <Input type="text" inputMode="decimal" min="1" value={bulkConvertForm.multiplier}
                  onChange={(e) => setBulkConvertForm({ ...bulkConvertForm, multiplier: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-white" data-testid="bulk-convert-multiplier" />
              </div>
              <div>
                <Label className="text-slate-300 text-xs">Nouvelle unité *</Label>
                <Input value={bulkConvertForm.new_unit}
                  onChange={(e) => setBulkConvertForm({ ...bulkConvertForm, new_unit: e.target.value })}
                  placeholder="bouteille, litre..." className="bg-slate-800 border-slate-700 text-white" data-testid="bulk-convert-new-unit" />
              </div>
            </div>

            {/* Live preview: count of affected products */}
            {(() => {
              const affected = products.filter(p =>
                (p.unit || "").toLowerCase() === bulkConvertForm.from_unit.toLowerCase() &&
                (bulkConvertForm.category_id === "all" || p.category_id === bulkConvertForm.category_id)
              );
              const m = parseInt(bulkConvertForm.multiplier, 10) || 0;
              if (affected.length === 0) {
                return (
                  <div className="bg-emerald-900/20 border border-emerald-500/40 rounded p-3 text-sm" data-testid="bulk-convert-empty-msg">
                    <p className="text-emerald-300 font-medium flex items-center gap-2">
                      ✅ Aucune conversion nécessaire
                    </p>
                    <p className="text-slate-400 text-xs mt-1">
                      Aucun produit en <strong>{bulkConvertForm.from_unit}</strong>
                      {bulkConvertForm.category_id !== "all" && <> dans la catégorie sélectionnée</>}.
                      Changez de catégorie ou d'unité de départ ci-dessus si vous avez d'autres produits à convertir.
                    </p>
                  </div>
                );
              }
              return (
                <div className="bg-violet-900/20 border border-violet-500/40 rounded p-3 text-sm">
                  <p className="text-violet-300 font-medium">
                    📦 {affected.length} produit(s) seront convertis :
                  </p>
                  {affected.slice(0, 6).map(p => (
                    <div key={p.id} className="text-xs text-slate-300 mt-1">
                      <span className="font-mono text-slate-500">{p.code}</span> {p.name}
                      <span className="text-slate-500"> : {p.quantity} {p.unit} → </span>
                      <span className="text-emerald-300 font-medium">{p.quantity * m} {bulkConvertForm.new_unit}</span>
                    </div>
                  ))}
                  {affected.length > 6 && (
                    <div className="text-xs text-slate-500 mt-1">… et {affected.length - 6} autre(s)</div>
                  )}
                </div>
              );
            })()}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowBulkConvertModal(false)} className="text-slate-400">Annuler</Button>
              <Button
                onClick={submitBulkConvert}
                disabled={products.filter(p =>
                  (p.unit || "").toLowerCase() === bulkConvertForm.from_unit.toLowerCase() &&
                  (bulkConvertForm.category_id === "all" || p.category_id === bulkConvertForm.category_id)
                ).length === 0}
                className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="bulk-convert-submit"
              >
                <Package className="w-4 h-4 mr-1" /> Convertir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Unit Conversion Modal */}
      <Dialog open={showConvertModal} onOpenChange={setShowConvertModal}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md" data-testid="convert-unit-modal">
          <DialogHeader>
            <DialogTitle className="text-white">Convertir en unité interne</DialogTitle>
            <DialogDescription className="text-slate-400">
              {convertTarget ? (
                <>Convertir <strong className="text-white">{convertTarget.name}</strong> de <span className="text-amber-400">{convertTarget.unit}</span> vers l'unité individuelle (bouteille, litre, etc.).</>
              ) : "Convertir un produit en unité interne"}
            </DialogDescription>
          </DialogHeader>
          {convertTarget && (
            <div className="space-y-4">
              <div className="bg-slate-800/50 border border-slate-700 rounded p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-slate-400">Quantité actuelle</span><span className="text-white font-semibold">{convertTarget.quantity} {convertTarget.unit}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Prix actuel</span><span className="text-white font-semibold">{formatPrice(convertTarget.purchase_price)} F / {convertTarget.unit}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Valeur totale</span><span className="text-emerald-400 font-semibold">{formatPrice(convertTarget.quantity * convertTarget.purchase_price)} F</span></div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-slate-300 text-xs">Nombre par {convertTarget.unit} *</Label>
                  <Input
                    type="text" inputMode="decimal" min="1"
                    value={convertForm.multiplier}
                    onChange={(e) => setConvertForm({ ...convertForm, multiplier: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white"
                    data-testid="convert-multiplier-input"
                  />
                </div>
                <div>
                  <Label className="text-slate-300 text-xs">Nouvelle unité *</Label>
                  <Input
                    value={convertForm.new_unit}
                    onChange={(e) => setConvertForm({ ...convertForm, new_unit: e.target.value })}
                    placeholder="bouteille, litre, kg..."
                    className="bg-slate-800 border-slate-700 text-white"
                    data-testid="convert-new-unit-input"
                  />
                </div>
              </div>

              {(() => {
                const m = parseInt(convertForm.multiplier, 10) || 0;
                const nu = (convertForm.new_unit || "").trim() || "unité";
                if (m <= 0) return null;
                const newQty = convertTarget.quantity * m;
                const newPrice = convertTarget.purchase_price / m;
                const newValeur = newQty * newPrice;
                return (
                  <div className="bg-violet-900/20 border border-violet-500/40 rounded p-3 text-sm space-y-1">
                    <p className="text-violet-300 font-medium mb-1">📦 Après conversion :</p>
                    <div className="flex justify-between"><span className="text-slate-400">Quantité</span><span className="text-white font-bold">{newQty} {nu}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Prix unitaire</span><span className="text-white font-bold">{formatPrice(newPrice)} F / {nu}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Valeur totale</span><span className="text-emerald-400 font-bold">{formatPrice(newValeur)} F <span className="text-[10px] text-slate-500">(inchangée)</span></span></div>
                  </div>
                );
              })()}

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowConvertModal(false)} className="text-slate-400">Annuler</Button>
                <Button onClick={submitConvertUnit} className="bg-violet-600 hover:bg-violet-700" data-testid="convert-submit-btn">
                  <Package className="w-4 h-4 mr-1" /> Convertir
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Transfer Magasin → Restau Modal */}
      <Dialog open={showTransferModal} onOpenChange={setShowTransferModal}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-lg" data-testid="transfer-modal">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <ArrowUpDown className="w-5 h-5 text-blue-400" />
              Transfert Magasin → Restau
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Sortir du stock magasin (manuel) vers un produit restau qui sera déstocké automatiquement par les ventes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Source info */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <p className="text-amber-200 text-xs uppercase tracking-wide">Produit source (Magasin)</p>
              <p className="text-white font-bold text-lg">{transferForm.source_product_name}</p>
              <p className="text-slate-400 text-sm">Disponible : <strong className="text-amber-300">{transferForm.source_quantity} {transferForm.source_unit}</strong></p>
            </div>

            {/* Quantity */}
            <div>
              <Label className="text-slate-300 text-xs">Quantité à transférer *</Label>
              <div className="flex items-center gap-2">
                <DecimalInput
                  value={transferForm.quantity}
                  onChange={(v) => setTransferForm(p => ({ ...p, quantity: v }))}
                  className="bg-slate-800 border-slate-700 text-white flex-1"
                  placeholder="0"
                  data-testid="transfer-qty-input"
                />
                <span className="text-slate-400 text-sm w-12">{transferForm.source_unit}</span>
              </div>
            </div>

            {/* Target mode toggle */}
            <div>
              <Label className="text-slate-300 text-xs">Produit restau cible</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {[
                  { v: "existing", l: "Produit existant" },
                  { v: "new", l: "Créer un nouveau" },
                ].map(opt => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setTransferForm(p => ({ ...p, target_mode: opt.v, target_product_id: "" }))}
                    data-testid={`transfer-target-mode-${opt.v}`}
                    className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                      transferForm.target_mode === opt.v
                        ? "bg-blue-500/20 border-blue-500/60 text-blue-100"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                    }`}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>

            {transferForm.target_mode === "existing" ? (
              <div>
                <Label className="text-slate-300 text-xs">Sélectionnez le produit restau</Label>
                {(() => {
                  const cuisineProducts = [...products]
                    .filter(p => (p.storage_zone || 'cuisine') !== 'magasin')
                    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
                  const q = (transferForm._target_search || "").toLowerCase().trim();
                  const filtered = q
                    ? cuisineProducts.filter(p =>
                        (p.name || "").toLowerCase().includes(q) ||
                        (p.code || "").toLowerCase().includes(q)
                      )
                    : cuisineProducts;
                  const selected = cuisineProducts.find(p => p.id === transferForm.target_product_id);
                  return (
                    <div className="relative">
                      <Input
                        value={transferForm._target_search ?? (selected?.name || "")}
                        onChange={(e) => setTransferForm(p => ({ ...p, _target_search: e.target.value, target_product_id: "" }))}
                        onFocus={() => setTransferForm(p => ({ ...p, _target_search: p._target_search ?? "" }))}
                        placeholder="Tapez pour rechercher un produit..."
                        className="bg-slate-800 border-slate-700 text-white pr-8"
                        data-testid="transfer-target-search"
                      />
                      {(transferForm._target_search || selected) && (
                        <button
                          type="button"
                          onClick={() => setTransferForm(p => ({ ...p, _target_search: "", target_product_id: "" }))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                          title="Effacer"
                        >
                          ✕
                        </button>
                      )}
                      {transferForm._target_search !== undefined && transferForm._target_search !== null && !selected && (
                        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-slate-800 border border-slate-700 rounded-lg shadow-xl" data-testid="transfer-target-list">
                          {filtered.length === 0 ? (
                            <div className="px-3 py-4 text-slate-500 text-sm text-center">
                              Aucun produit trouvé
                              {q && (
                                <div className="text-[11px] text-slate-600 mt-1">
                                  Astuce : cliquez sur <strong>"Créer un nouveau"</strong> pour l'ajouter au restau.
                                </div>
                              )}
                            </div>
                          ) : (
                            filtered.slice(0, 50).map(p => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => setTransferForm(f => ({
                                  ...f,
                                  target_product_id: p.id,
                                  _target_search: undefined,
                                }))}
                                className="w-full text-left px-3 py-2 hover:bg-slate-700 border-b border-slate-700/50 last:border-b-0"
                                data-testid={`transfer-target-option-${p.id}`}
                              >
                                <div className="text-white text-sm font-medium">{p.name}</div>
                                <div className="text-[11px] text-slate-400">
                                  {p.code ? `${p.code} · ` : ""}qté actuelle : {p.quantity} {p.unit}
                                </div>
                              </button>
                            ))
                          )}
                          {filtered.length > 50 && (
                            <div className="px-3 py-2 text-slate-500 text-[11px] text-center border-t border-slate-700/50">
                              {filtered.length - 50} résultat(s) supplémentaire(s)… Tapez plus de caractères pour affiner.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
                <p className="text-slate-500 text-[11px] mt-1">
                  💡 Astuce : si un produit du même nom existe déjà, choisissez-le pour cumuler les quantités.
                </p>
              </div>
            ) : (
              <div>
                <Label className="text-slate-300 text-xs">Nom du nouveau produit restau</Label>
                <Input
                  value={transferForm.target_name}
                  onChange={(e) => setTransferForm(p => ({ ...p, target_name: e.target.value }))}
                  className="bg-slate-800 border-slate-700 text-white"
                  placeholder={`Par défaut : ${transferForm.source_product_name}`}
                  data-testid="transfer-target-name"
                />
                <p className="text-slate-500 text-[11px] mt-1">
                  Le produit sera créé automatiquement en <strong className="text-emerald-300">zone Restau</strong> (auto-déstockage activé).
                </p>
              </div>
            )}

            <div>
              <Label className="text-slate-300 text-xs">Motif (optionnel)</Label>
              <Input
                value={transferForm.reason}
                onChange={(e) => setTransferForm(p => ({ ...p, reason: e.target.value }))}
                className="bg-slate-800 border-slate-700 text-white"
                placeholder="Ex: Approvisionnement restau du jour"
                data-testid="transfer-reason"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowTransferModal(false)} className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800">
                Annuler
              </Button>
              <Button
                onClick={submitTransfer}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!transferForm.quantity || (transferForm.target_mode === "existing" && !transferForm.target_product_id)}
                data-testid="transfer-submit"
              >
                <ArrowUpDown className="w-4 h-4 mr-1" />
                Transférer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Movement Modal */}
      <Dialog open={showMovementModal} onOpenChange={setShowMovementModal}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
          <DialogHeader><DialogTitle className="text-white">Nouveau Mouvement</DialogTitle><DialogDescription className="text-slate-400">Enregistrer une entree, sortie ou ajustement</DialogDescription></DialogHeader>          <div className="space-y-3">
            <div>
              <Label className="text-slate-300 text-xs">Produit *</Label>
              {(() => {
                const selected = products.find(p => p.id === movementForm.product_id);
                const query = (movementProductSearch || "").trim().toLowerCase();
                const filtered = query.length === 0
                  ? products.slice(0, 30)
                  : products
                      .filter(p =>
                        (p.name || "").toLowerCase().includes(query) ||
                        (p.code || "").toLowerCase().includes(query)
                      )
                      .slice(0, 50);
                return (
                  <div className="space-y-1.5">
                    {/* Champ de recherche : tape le nom complet ou partiel */}
                    <div className="relative">
                      <Input
                        type="text"
                        value={movementProductSearch}
                        onChange={(e) => setMovementProductSearch(e.target.value)}
                        placeholder="Rechercher : nom complet ou partiel, ou code produit…"
                        className="bg-slate-800 border-slate-700 text-white pr-8"
                        data-testid="movement-product-search"
                        autoFocus
                      />
                      {movementProductSearch && (
                        <button
                          type="button"
                          onClick={() => setMovementProductSearch("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                          title="Effacer"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    {/* Sélection courante (badge) */}
                    {selected && (
                      <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/40 rounded px-2 py-1.5 text-xs" data-testid="movement-product-selected">
                        <span className="text-emerald-300 font-semibold">✓ Sélectionné :</span>
                        <span className="text-white flex-1 truncate">{selected.name}</span>
                        <span className="text-slate-300">{selected.quantity} {selected.unit}</span>
                        <button
                          type="button"
                          onClick={() => { setMovementForm(p => ({...p, product_id: ""})); setMovementProductSearch(""); }}
                          className="text-rose-300 hover:text-rose-200"
                          title="Changer"
                        >
                          ×
                        </button>
                      </div>
                    )}

                    {/* Liste des résultats : visible seulement si on tape OU rien n'est sélectionné */}
                    {(!selected || movementProductSearch) && (
                      <div className="bg-slate-800 border border-slate-700 rounded max-h-56 overflow-y-auto" data-testid="movement-product-results">
                        {filtered.length === 0 ? (
                          <p className="text-slate-500 text-xs text-center py-3">
                            Aucun produit ne correspond à "{movementProductSearch}".
                          </p>
                        ) : (
                          filtered.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setMovementForm(prev => ({
                                  ...prev,
                                  product_id: p.id,
                                  unit_price: prev.unit_price || p.purchase_price || 0,
                                }));
                                setMovementProductSearch("");
                              }}
                              className={`w-full text-left px-2 py-1.5 hover:bg-slate-700/60 text-xs flex items-center justify-between gap-2 border-b border-slate-700/40 last:border-b-0 ${movementForm.product_id === p.id ? 'bg-emerald-500/10' : ''}`}
                              data-testid={`movement-product-option-${p.id}`}
                            >
                              <span className="text-white truncate">
                                {p.code && <span className="text-slate-500 mr-1">{p.code}</span>}
                                {p.name}
                              </span>
                              <span className="text-slate-400 whitespace-nowrap">
                                {p.quantity} {p.unit}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            <div><Label className="text-slate-300 text-xs">Type de mouvement</Label>
              <Select value={movementForm.movement_type} onValueChange={v => setMovementForm(p => ({...p, movement_type: v}))}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">{MOVEMENT_TYPES.map(t => <SelectItem key={t.value} value={t.value} className="text-white">{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-slate-300 text-xs">Quantite *</Label><DecimalInput value={movementForm.quantity} onChange={(n) => setMovementForm(p => ({...p, quantity: n}))} className="bg-slate-800 border-slate-700 text-white" /></div>
              <div><Label className="text-slate-300 text-xs">Prix unitaire</Label><DecimalInput value={movementForm.unit_price} onChange={(n) => setMovementForm(p => ({...p, unit_price: n}))} className="bg-slate-800 border-slate-700 text-white" /></div>
            </div>
            <div><Label className="text-slate-300 text-xs">Motif / Observation</Label><Textarea value={movementForm.reason} onChange={e => setMovementForm(p => ({...p, reason: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" placeholder="Raison du mouvement..." /></div>
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={saveMovement}><Save className="w-4 h-4 mr-1" /> Enregistrer</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Purchase Modal */}
      <Dialog open={showPurchaseModal} onOpenChange={setShowPurchaseModal}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-white">Nouvel Achat</DialogTitle><DialogDescription className="text-slate-400">Enregistrer un approvisionnement</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-slate-300 text-xs">Fournisseur</Label>
                <Select value={purchaseForm.supplier_id || "none"} onValueChange={v => { const s = suppliers.find(x => x.id === v); setPurchaseForm(p => ({...p, supplier_id: v === "none" ? "" : v, supplier_name: s?.name || ""})); }}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700"><SelectItem value="none" className="text-slate-400">Aucun</SelectItem>{suppliers.map(s => <SelectItem key={s.id} value={s.id} className="text-white">{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-slate-300 text-xs">Date d'achat</Label><Input type="date" value={purchaseForm.purchase_date} onChange={e => setPurchaseForm(p => ({...p, purchase_date: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" /></div>
            </div>
            {/* Add items */}
            <Card className="bg-slate-800/50 border-slate-700"><CardContent className="p-3 space-y-2">
              <p className="text-slate-400 text-xs font-medium">Ajouter un article</p>
              <div className="flex gap-2 items-end">
                <div className="flex-1"><Select value={purchaseItem.product_id || "none"} onValueChange={v => setPurchaseItem(p => ({...p, product_id: v === "none" ? "" : v}))}>
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-white h-8 text-xs"><SelectValue placeholder="Produit" /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 max-h-[200px]">{products.map(p => <SelectItem key={p.id} value={p.id} className="text-white text-xs">{p.name}</SelectItem>)}</SelectContent>
                </Select></div>
                <Input type="text" inputMode="decimal" min="0" value={purchaseItem.quantity || ""} onChange={e => setPurchaseItem(p => ({...p, quantity: parseDecimal(e.target.value)}))} className="bg-slate-900 border-slate-700 text-white w-20 h-8 text-xs" placeholder="Qte" />
                <Input type="text" inputMode="decimal" min="0" value={purchaseItem.unit_price || ""} onChange={e => setPurchaseItem(p => ({...p, unit_price: parseDecimal(e.target.value)}))} className="bg-slate-900 border-slate-700 text-white w-24 h-8 text-xs" placeholder="Prix unit." />
                <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700" onClick={addPurchaseItem}><Plus className="w-3 h-3" /></Button>
              </div>
              {purchaseForm.items.length > 0 && (
                <div className="space-y-1 mt-2">
                  {purchaseForm.items.map((item, i) => (
                    <div key={i} className="flex justify-between items-center bg-slate-900/50 rounded px-2 py-1 text-xs">
                      <span className="text-white">{item.product_name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400">{item.quantity} x {formatPrice(item.unit_price)} F</span>
                        <span className="text-emerald-400 font-bold">{formatPrice(item.quantity * item.unit_price)} F</span>
                        <button className="text-red-400 hover:text-red-300" onClick={() => setPurchaseForm(p => ({...p, items: p.items.filter((_, j) => j !== i)}))}>
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="text-right pt-1 border-t border-slate-700">
                    <span className="text-emerald-400 font-bold">Total : {formatPrice(purchaseForm.items.reduce((s, i) => s + i.quantity * i.unit_price, 0))} F</span>
                  </div>
                </div>
              )}
            </CardContent></Card>
            <div><Label className="text-slate-300 text-xs">Notes</Label><Textarea value={purchaseForm.notes} onChange={e => setPurchaseForm(p => ({...p, notes: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" /></div>
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={savePurchase}><Save className="w-4 h-4 mr-1" /> Valider l'achat</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Supplier Modal */}
      <Dialog open={showSupplierModal} onOpenChange={setShowSupplierModal}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
          <DialogHeader><DialogTitle className="text-white">{editingItem ? "Modifier Fournisseur" : "Nouveau Fournisseur"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-slate-300 text-xs">Nom *</Label><Input value={supplierForm.name} onChange={e => setSupplierForm(p => ({...p, name: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-slate-300 text-xs">Telephone</Label><Input value={supplierForm.phone} onChange={e => setSupplierForm(p => ({...p, phone: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" /></div>
              <div><Label className="text-slate-300 text-xs">Email</Label><Input value={supplierForm.email} onChange={e => setSupplierForm(p => ({...p, email: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" /></div>
            </div>
            <div><Label className="text-slate-300 text-xs">Adresse</Label><Input value={supplierForm.address} onChange={e => setSupplierForm(p => ({...p, address: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" /></div>
            <div><Label className="text-slate-300 text-xs">Types de produits</Label><Input value={supplierForm.product_types} onChange={e => setSupplierForm(p => ({...p, product_types: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" placeholder="Ex: Boissons, Legumes..." /></div>
            <div><Label className="text-slate-300 text-xs">Notes</Label><Textarea value={supplierForm.notes} onChange={e => setSupplierForm(p => ({...p, notes: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" /></div>
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={saveSupplier}><Save className="w-4 h-4 mr-1" /> {editingItem ? "Mettre a jour" : "Enregistrer"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Modal */}
      <Dialog open={showCategoryModal} onOpenChange={setShowCategoryModal}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-sm">
          <DialogHeader><DialogTitle className="text-white">{editingItem ? "Modifier Categorie" : "Nouvelle Categorie"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-slate-300 text-xs">Nom *</Label><Input value={categoryForm.name} onChange={e => setCategoryForm(p => ({...p, name: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" /></div>
            <div><Label className="text-slate-300 text-xs">Description</Label><Input value={categoryForm.description} onChange={e => setCategoryForm(p => ({...p, description: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" /></div>
            <div><Label className="text-slate-300 text-xs">Couleur</Label><Input type="color" value={categoryForm.color} onChange={e => setCategoryForm(p => ({...p, color: e.target.value}))} className="bg-slate-800 border-slate-700 h-10 w-20" /></div>
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={saveCategory}><Save className="w-4 h-4 mr-1" /> {editingItem ? "Mettre a jour" : "Enregistrer"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* User Modal */}
      <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
          <DialogHeader><DialogTitle className="text-white">{editingItem ? "Modifier Utilisateur" : "Nouvel Utilisateur"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-slate-300 text-xs">Nom complet *</Label><Input value={userForm.full_name} onChange={e => setUserForm(p => ({...p, full_name: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" /></div>
            <div><Label className="text-slate-300 text-xs">Identifiant *</Label><Input value={userForm.username} onChange={e => setUserForm(p => ({...p, username: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" disabled={!!editingItem} /></div>
            <div><Label className="text-slate-300 text-xs">{editingItem ? "Nouveau mot de passe (laisser vide pour garder)" : "Mot de passe *"}</Label><Input type="password" value={userForm.password} onChange={e => setUserForm(p => ({...p, password: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" /></div>
            <div><Label className="text-slate-300 text-xs">Role *</Label>
              <Select value={userForm.role} onValueChange={v => setUserForm(p => ({...p, role: v}))}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">{ROLES.map(r => <SelectItem key={r.value} value={r.value} className="text-white">{r.label} - {r.desc}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={saveUser}><Save className="w-4 h-4 mr-1" /> {editingItem ? "Mettre a jour" : "Enregistrer"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recipe Modal */}
      <Dialog open={showRecipeModal} onOpenChange={setShowRecipeModal}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">{editingItem ? "Modifier la Fiche Technique" : "Nouvelle Fiche Technique"}</DialogTitle>
            <DialogDescription className="text-slate-400">Definissez la composition du plat en ingredients du stock</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-slate-300 text-xs">Nom de la fiche *</Label>
                <Input value={recipeForm.name} onChange={e => setRecipeForm(p => ({...p, name: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" placeholder="Ex: Poulet braise" /></div>
              <div><Label className="text-slate-300 text-xs">Nom sur la Caisse *</Label>
                <Input value={recipeForm.caisse_product_name} onChange={e => setRecipeForm(p => ({...p, caisse_product_name: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" placeholder="Nom exact du plat en Caisse" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-slate-300 text-xs">Prix de vente (FCFA)</Label>
                <DecimalInput min="0" value={recipeForm.selling_price} onChange={(v) => setRecipeForm(p => ({...p, selling_price: v}))} className="bg-slate-800 border-slate-700 text-white" placeholder="Prix de vente en Caisse" /></div>
              <div><Label className="text-slate-300 text-xs">Notes</Label>
                <Input value={recipeForm.notes} onChange={e => setRecipeForm(p => ({...p, notes: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" placeholder="Remarques..." /></div>
            </div>

            {/* Ingredient selector */}
            <Card className="bg-slate-800/50 border-slate-700"><CardContent className="p-3 space-y-2">
              <p className="text-slate-400 text-xs font-medium">Ajouter un ingredient</p>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Select value={recipeIngredient.product_id || "none"} onValueChange={v => setRecipeIngredient(p => ({...p, product_id: v === "none" ? "" : v}))}>
                    <SelectTrigger className="bg-slate-900 border-slate-700 text-white h-8 text-xs"><SelectValue placeholder="Choisir un ingredient" /></SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 max-h-[200px]">
                      {(allProducts.length > 0 ? allProducts : products)
                        .filter(p => !recipeForm.ingredients.some(i => i.product_id === p.id))
                        .map(p => (
                          <SelectItem key={p.id} value={p.id} className="text-white text-xs">{p.name} ({p.unit})</SelectItem>
                        ))}
                      {(allProducts.length > 0 ? allProducts : products).filter(p => !recipeForm.ingredients.some(i => i.product_id === p.id)).length === 0 && (
                        <div className="text-slate-400 text-xs px-2 py-2 italic">
                          Aucun produit disponible. Vérifiez la création d'un produit dans Stock.
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <DecimalInput min="0" value={recipeIngredient.quantity} onChange={(v) => setRecipeIngredient(p => ({...p, quantity: v}))} className="bg-slate-900 border-slate-700 text-white w-24 h-8 text-xs" placeholder="Quantite" data-testid="recipe-ingredient-quantity" />
                <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700" onClick={addRecipeIngredient}><Plus className="w-3 h-3" /></Button>
              </div>
              {recipeForm.ingredients.length > 0 && (
                <div className="space-y-1 mt-2">
                  {recipeForm.ingredients.map((ing, i) => {
                    const pool = allProducts.length > 0 ? allProducts : products;
                    const prod = pool.find(p => p.id === ing.product_id);
                    return (
                      <div key={i} className="flex justify-between items-center bg-slate-900/50 rounded px-2 py-1 text-xs">
                        <span className="text-white">{ing.product_name || prod?.name || "?"}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-400">{ing.quantity} {ing.unit || prod?.unit || ""}</span>
                          <button className="text-red-400 hover:text-red-300" onClick={() => setRecipeForm(p => ({...p, ingredients: p.ingredients.filter((_, j) => j !== i)}))}>
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent></Card>

            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={saveRecipe} data-testid="save-recipe-btn">
              <Save className="w-4 h-4 mr-1" /> {editingItem ? "Mettre a jour" : "Enregistrer la fiche"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      </div>
      )}
    </div>
  );
}
