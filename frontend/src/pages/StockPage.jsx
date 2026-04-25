import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import {
  Package, BarChart3, TrendingUp, TrendingDown, AlertTriangle,
  Plus, Search, Filter, Edit2, Trash2, ArrowUpDown, ShoppingCart,
  Truck, ClipboardList, Settings, LogOut, Warehouse, ArrowDown, ArrowUp,
  RefreshCw, X, Save, Eye, ChevronDown, Users, BookOpen, FileText, Download, ClipboardCheck, CheckSquare
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
];

const NAV_ITEMS = [
  { id: "dashboard", label: "Tableau de bord", icon: BarChart3 },
  { id: "products", label: "Produits", icon: Package },
  { id: "recipes", label: "Fiches Techniques", icon: BookOpen },
  { id: "movements", label: "Mouvements", icon: ArrowUpDown },
  { id: "reports", label: "Rapports", icon: FileText },
  { id: "inventory", label: "Inventaire", icon: ClipboardCheck },
  { id: "purchases", label: "Achats", icon: ShoppingCart },
  { id: "suppliers", label: "Fournisseurs", icon: Truck },
  { id: "categories", label: "Categories", icon: ClipboardList },
  { id: "users", label: "Utilisateurs", icon: Users },
];

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
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [movements, setMovements] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [stockUsers, setStockUsers] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [report, setReport] = useState(null);
  const [reportFilters, setReportFilters] = useState({ type: "all", date_from: "", date_to: "", search: "" });
  const [reportLoading, setReportLoading] = useState(false);
  const [inventories, setInventories] = useState([]);
  const [activeInventory, setActiveInventory] = useState(null);
  const [inventorySearch, setInventorySearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [seeded, setSeeded] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterAlert, setFilterAlert] = useState("all");

  // Modals
  const [showProductModal, setShowProductModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
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
      await axios.post(`${API}/stock/products/${addPackageTarget.id}/add-package`, {
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
      const { data } = await axios.post(`${API}/stock/products/convert-unit-bulk`, payload);
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
    if (u === "pack") m = 6;
    else if (u === "carton") m = 12;
    else if (u === "sac") { m = 25; nu = "kg"; }
    else if (u === "bidon") { m = 20; nu = "litre"; }
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
      await axios.post(`${API}/stock/products/${convertTarget.id}/convert-unit`, { multiplier: m, new_unit: nu });
      toast.success(`${convertTarget.name} converti en ${nu}`);
      setShowConvertModal(false);
      setConvertTarget(null);
      fetchProducts();
      fetchDashboard();
    } catch (e) {
      toast.error("Erreur lors de la conversion");
    }
  };

  // Forms
  const [productForm, setProductForm] = useState({ code: "", name: "", category_id: "", subcategory: "", unit: "kg", quantity: 0, stock_min: 5, stock_max: 100, purchase_price: 0, supplier_id: "", storage_location: "", date_achat: "", date_peremption: "", observation: "" });
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

  const fetchCategories = useCallback(async () => {
    try { const r = await axios.get(`${API}/categories`); setCategories(r.data.categories); } catch {}
  }, []);

  const fetchSuppliers = useCallback(async () => {
    try { const r = await axios.get(`${API}/suppliers`); setSuppliers(r.data.suppliers); } catch {}
  }, []);

  const fetchMovements = useCallback(async () => {
    try { const r = await axios.get(`${API}/movements`, { params: { limit: 50 } }); setMovements(r.data.movements); } catch {}
  }, []);

  const fetchPurchases = useCallback(async () => {
    try { const r = await axios.get(`${API}/purchases`); setPurchases(r.data.purchases); } catch {}
  }, []);

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
    fetchDashboard(); fetchProducts(); fetchCategories(); fetchSuppliers(); fetchMovements(); fetchPurchases(); fetchUsers(); fetchRecipes(); fetchInventories();
  }, [fetchDashboard, fetchProducts, fetchCategories, fetchSuppliers, fetchMovements, fetchPurchases, fetchUsers, fetchRecipes, fetchInventories]);

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

  // Products sorted so that items with a filled quantity or purchase_price appear first.
  // "Filled" score: +2 if both quantity and price > 0, +1 if only one, 0 if empty.
  // Array.prototype.sort is stable (ES2019+) so original order is kept within each score group.
  const sortedProducts = useMemo(() => {
    const score = (p) => (p.quantity > 0 ? 1 : 0) + (p.purchase_price > 0 ? 1 : 0);
    return [...products].sort((a, b) => score(b) - score(a));
  }, [products]);

  // Auto-seed if database is empty on first load
  useEffect(() => {
    if (dashboard && dashboard.total_products === 0 && !seeded && !loading) {
      seed();
    }
  }, [dashboard]);

  // Product CRUD
  const saveProduct = async () => {
    try {
      if (editingItem) {
        await axios.put(`${API}/products/${editingItem.id}`, productForm);
        toast.success("Produit mis a jour");
      } else {
        await axios.post(`${API}/products`, productForm);
        toast.success("Produit cree");
      }
      setShowProductModal(false); setEditingItem(null); fetchProducts(); fetchDashboard();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const deleteProduct = async (id) => {
    if (!window.confirm("Supprimer ce produit ?")) return;
    try { await axios.delete(`${API}/products/${id}`); toast.success("Produit supprime"); fetchProducts(); fetchDashboard(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const openEditProduct = (p) => {
    setEditingItem(p);
    setProductForm({ code: p.code, name: p.name, category_id: p.category_id, subcategory: p.subcategory || "", unit: p.unit, quantity: p.quantity, stock_min: p.stock_min, stock_max: p.stock_max, purchase_price: p.purchase_price, supplier_id: p.supplier_id || "", storage_location: p.storage_location || "", date_achat: p.date_achat || "", date_peremption: p.date_peremption || "", observation: p.observation || "" });
    setShowProductModal(true);
  };

  // Movement
  const saveMovement = async () => {
    if (!movementForm.product_id || movementForm.quantity <= 0) { toast.error("Selectionnez un produit et une quantite"); return; }
    try {
      await axios.post(`${API}/movements`, { ...movementForm, user_name: "Administrateur" });
      toast.success("Mouvement enregistre");
      setShowMovementModal(false); fetchMovements(); fetchProducts(); fetchDashboard();
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
    const p = products.find(x => x.id === recipeIngredient.product_id);
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
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 sticky top-0 h-screen">
        <div className="p-5 border-b border-slate-800">
          <h1 className="text-xl font-bold text-white flex items-center gap-2"><Warehouse className="w-6 h-6 text-emerald-400" /> Gestion Stock</h1>
          <p className="text-slate-500 text-xs mt-1">Espace Maxo</p>
        </div>
        <div className="px-4 py-3 border-b border-slate-800">
          <p className="text-white text-sm font-medium">{currentUser.full_name}</p>
          <Badge className="bg-emerald-500/20 text-emerald-400 text-xs mt-1">{currentUser.role}</Badge>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.filter(item => {
            if (item.id === "users") return isAdmin;
            return true;
          }).map(item => (
            <button key={item.id} onClick={() => { setActiveSection(item.id); clearSelection(); }} data-testid={`nav-${item.id}`}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${activeSection === item.id ? 'bg-emerald-500/15 text-emerald-400 font-medium' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}>
              <item.icon className="w-4 h-4" /> {item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-800 space-y-1">
          <button onClick={handleLogout} className="flex items-center gap-2 text-slate-500 hover:text-white text-sm px-3 py-2 w-full"><LogOut className="w-4 h-4" /> Deconnexion</button>
          <a href="/caisse" className="flex items-center gap-2 text-slate-500 hover:text-white text-sm px-3 py-2"><LogOut className="w-4 h-4" /> Retour Caisse</a>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-auto">
        {/* DASHBOARD */}
        {activeSection === "dashboard" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Tableau de Bord</h2>
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
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {[
                    { label: "Produits", value: dashboard.total_products, icon: Package, color: "blue" },
                    { label: "Critiques", value: dashboard.critical_products, icon: AlertTriangle, color: "red" },
                    { label: "Valeur Stock", value: `${formatPrice(dashboard.total_value)} F`, icon: TrendingUp, color: "emerald", small: true },
                    { label: "Entrees Aujourd'hui", value: dashboard.entrees_today, icon: ArrowDown, color: "green" },
                    { label: "Sorties Aujourd'hui", value: dashboard.sorties_today, icon: ArrowUp, color: "orange" },
                  ].map((c, i) => (
                    <Card key={i} className="bg-slate-900/80 border-slate-800">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-slate-400 text-xs">{c.label}</span>
                          <c.icon className={`w-4 h-4 text-${c.color}-400`} />
                        </div>
                        <p className={`${c.small ? 'text-lg' : 'text-2xl'} font-bold text-white`}>{c.value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

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
                <Button onClick={() => { setShowMovementModal(true); setMovementForm({ product_id: "", movement_type: "entree", quantity: 0, unit_price: 0, reason: "" }); }}
                  className="bg-blue-600 hover:bg-blue-700" data-testid="new-movement-btn"><ArrowUpDown className="w-4 h-4 mr-1" /> Mouvement</Button>
                {isAdmin && (
                  <Button onClick={() => setShowBulkConvertModal(true)}
                    className="bg-violet-600 hover:bg-violet-700" data-testid="bulk-convert-btn" title="Convertir toutes les unités package d'une catégorie en unité interne">
                    <Package className="w-4 h-4 mr-1" /> Convertir par lot
                  </Button>
                )}
                <Button onClick={() => { setEditingItem(null); setProductForm({ code: "", name: "", category_id: categories[0]?.id || "", subcategory: "", unit: "kg", quantity: 0, stock_min: 5, stock_max: 100, purchase_price: 0, supplier_id: "", storage_location: "", date_achat: "", date_peremption: "", observation: "" }); setShowProductModal(true); }}
                  className="bg-emerald-600 hover:bg-emerald-700" data-testid="new-product-btn"><Plus className="w-4 h-4 mr-1" /> Nouveau Produit</Button>
              </div>
            </div>

            {/* KPI Summary Cards */}
            {products.length > 0 && (() => {
              const totalProducts = products.length;
              const renseigned = products.filter(p => p.quantity > 0 || p.purchase_price > 0).length;
              const totalValue = products.reduce((s, p) => s + (p.quantity * p.purchase_price || 0), 0);
              const rupture = products.filter(p => p.quantity <= 0).length;
              const faible = products.filter(p => p.quantity > 0 && p.quantity <= p.stock_min).length;
              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="products-kpi-cards">
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
                          <p className="text-cyan-300 text-xs uppercase tracking-wider">Valeur totale</p>
                          <p className="text-2xl font-bold text-white mt-1" data-testid="kpi-value">{formatPrice(totalValue)}</p>
                          <p className="text-slate-500 text-[11px] mt-0.5">F CFA</p>
                        </div>
                        <TrendingUp className="w-8 h-8 text-cyan-400/60" />
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
            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Rechercher un produit..."
                  className="bg-slate-900 border-slate-700 text-white pl-9" data-testid="product-search" />
              </div>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-white w-[200px]"><SelectValue placeholder="Categorie" /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all" className="text-white">Toutes les categories</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={c.id} className="text-white">{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterAlert} onValueChange={setFilterAlert}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-white w-[180px]"><SelectValue placeholder="Alerte" /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all" className="text-white">Tous niveaux</SelectItem>
                  <SelectItem value="rupture" className="text-red-400">Rupture</SelectItem>
                  <SelectItem value="faible" className="text-orange-400">Stock faible</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="text-slate-500 text-sm flex items-center gap-3">
              <span>{products.length} produit(s)</span>
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
                        <th className="p-3 font-semibold uppercase text-[11px] tracking-wider text-right">Valeur</th>
                        <th className="p-3 font-semibold uppercase text-[11px] tracking-wider">Statut</th>
                        <th className="p-3 font-semibold uppercase text-[11px] tracking-wider">Lieu</th>
                        <th className="p-3 font-semibold uppercase text-[11px] tracking-wider"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedProducts.map((p, idx) => {
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
                            {/* Produit: code + nom empilés */}
                            <td className="p-3">
                              <div className="flex flex-col">
                                <span className="text-white font-medium leading-tight">{p.name}</span>
                                <span className="text-slate-500 font-mono text-[11px] mt-0.5">{p.code}</span>
                                {isEmpty && <Badge className="bg-slate-700/60 text-slate-400 text-[9px] mt-1 w-fit border border-slate-600/40">Non renseigné</Badge>}
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
                              <span className={p.quantity * p.purchase_price > 0 ? 'text-emerald-400 font-semibold' : 'text-slate-600'}>
                                {p.quantity * p.purchase_price > 0 ? `${formatPrice(p.quantity * p.purchase_price)} F` : '—'}
                              </span>
                            </td>
                            <td className="p-3"><Badge className={status.color + " text-[10px] border border-current/20"}>{status.label}</Badge></td>
                            <td className="p-3 text-slate-500 text-xs">{p.storage_location || '—'}</td>
                            <td className="p-3">
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10" onClick={() => openEditProduct(p)} title="Modifier"><Edit2 className="w-3.5 h-3.5" /></Button>
                                {isAdmin && ['casier','pack','carton','bac','caisse','sac','bidon','pot','plateau','paquet','lot'].includes((p.unit||'').toLowerCase()) && (
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-violet-400 hover:bg-violet-500/10" onClick={() => openConvertUnit(p)} title="Convertir en unité interne (ex: casier → bouteille)" data-testid={`convert-unit-${p.id}`}>
                                    <Package className="w-3.5 h-3.5" />
                                  </Button>
                                )}
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
              </CardContent>
            </Card>
            )}
          </div>
        )}

        {/* MOVEMENTS */}
        {activeSection === "movements" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Mouvements de Stock</h2>
              <Button onClick={() => { setMovementForm({ product_id: "", movement_type: "entree", quantity: 0, unit_price: 0, reason: "" }); setShowMovementModal(true); }}
                className="bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4 mr-1" /> Nouveau Mouvement</Button>
            </div>
            {isAdmin && <BulkBar count={selectedItems.filter(id => movements.some(m => m.id === id)).length} label="mouvement(s)" endpoint="movements/delete-bulk" ids={selectedItems.filter(id => movements.some(m => m.id === id))} refreshFn={fetchMovements} />}
            <Card className="bg-slate-900/80 border-slate-800"><CardContent className="p-0"><div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-400 border-b border-slate-800 bg-slate-900/50">
                  {isAdmin && <th className="p-3 w-8"><input type="checkbox" className="rounded bg-slate-800 border-slate-600" checked={movements.length > 0 && movements.every(m => selectedItems.includes(m.id))} onChange={() => toggleSelectAll(movements.map(m => m.id))} /></th>}
                  <th className="p-3">Date</th><th className="p-3">Produit</th><th className="p-3">Type</th><th className="p-3 text-right">Quantite</th><th className="p-3 text-right">Avant</th><th className="p-3 text-right">Apres</th><th className="p-3">Motif</th><th className="p-3">Utilisateur</th>{isAdmin && <th className="p-3"></th>}
                </tr></thead>
                <tbody>
                  {movements.map(m => (
                    <tr key={m.id} className={`border-b border-slate-800/50 hover:bg-slate-800/30 ${selectedItems.includes(m.id) ? 'bg-slate-800/50' : ''}`}>
                      {isAdmin && <td className="p-3"><input type="checkbox" className="rounded bg-slate-800 border-slate-600" checked={selectedItems.includes(m.id)} onChange={() => toggleSelect(m.id)} /></td>}
                      <td className="p-3 text-slate-400 text-xs">{new Date(m.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="p-3 text-white">{m.product_name}</td>
                      <td className="p-3"><Badge className={`text-xs ${m.movement_type === 'entree' || m.movement_type === 'retour_fournisseur' ? 'bg-emerald-500/20 text-emerald-400' : m.movement_type === 'ajustement' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'}`}>{MOVEMENT_TYPES.find(t => t.value === m.movement_type)?.label || m.movement_type}</Badge></td>
                      <td className="p-3 text-right text-white font-medium">{m.quantity} {m.unit}</td>
                      <td className="p-3 text-right text-slate-500">{typeof m.previous_quantity === 'number' ? parseFloat(m.previous_quantity.toFixed(2)) : m.previous_quantity}</td>
                      <td className="p-3 text-right text-slate-300">{typeof m.new_quantity === 'number' ? parseFloat(m.new_quantity.toFixed(2)) : m.new_quantity}</td>
                      <td className="p-3 text-slate-400 text-xs max-w-[200px] truncate">{m.reason}</td>
                      <td className="p-3 text-slate-500 text-xs">{m.user_name}</td>
                      {isAdmin && <td className="p-3"><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-red-400" onClick={() => deleteMovement(m.id)}><Trash2 className="w-3.5 h-3.5" /></Button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></CardContent></Card>
          </div>
        )}


        {/* RECIPES / FICHES TECHNIQUES */}
        {activeSection === "recipes" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Fiches Techniques / Recettes</h2>
              <div className="flex gap-2">
                {recipes.length === 0 && (
                  <Button variant="outline" className="border-slate-700 text-slate-300" onClick={seedDemoRecipes} data-testid="seed-recipes-btn">
                    Charger demo (Poulet braise)
                  </Button>
                )}
                <Button onClick={() => { setEditingItem(null); setRecipeForm({ name: "", caisse_product_name: "", selling_price: 0, ingredients: [], notes: "" }); setRecipeIngredient({ product_id: "", quantity: 0 }); setShowRecipeModal(true); }}
                  className="bg-emerald-600 hover:bg-emerald-700" data-testid="new-recipe-btn"><Plus className="w-4 h-4 mr-1" /> Nouvelle Fiche</Button>
              </div>
            </div>

            <p className="text-slate-400 text-sm">Definissez la composition de chaque plat vendu a la Caisse. Lors de la validation d'une facture, les ingredients seront automatiquement deduits du stock.</p>
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
                {recipes.map(r => {
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
              </div>
            )}
          </div>
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



        {/* PURCHASES */}
        {activeSection === "purchases" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Achats / Approvisionnement</h2>
              <Button onClick={() => { setPurchaseForm({ supplier_id: "", supplier_name: "", purchase_date: new Date().toISOString().slice(0, 10), items: [], notes: "" }); setShowPurchaseModal(true); }}
                className="bg-emerald-600 hover:bg-emerald-700" data-testid="new-purchase-btn"><Plus className="w-4 h-4 mr-1" /> Nouvel Achat</Button>
            </div>
            {isAdmin && <BulkBar count={selectedItems.filter(id => purchases.some(p => p.id === id && !id.startsWith('caisse-'))).length} label="achat(s)" endpoint="purchases/delete-bulk" ids={selectedItems.filter(id => purchases.some(p => p.id === id && !id.startsWith('caisse-')))} refreshFn={fetchPurchases} />}
            {purchases.map(p => {
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
            {purchases.length === 0 && (
              <Card className="bg-slate-900/80 border-slate-800"><CardContent className="p-8 text-center text-slate-500">Aucun achat enregistre</CardContent></Card>
            )}
          </div>
        )}

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
              <div><Label className="text-slate-300 text-xs">Code produit</Label><Input value={productForm.code} onChange={e => setProductForm(p => ({...p, code: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" placeholder="Auto" /></div>
              <div><Label className="text-slate-300 text-xs">Nom du produit *</Label><Input value={productForm.name} onChange={e => setProductForm(p => ({...p, name: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" /></div>
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
              <div><Label className="text-slate-300 text-xs">Emplacement</Label><Input value={productForm.storage_location} onChange={e => setProductForm(p => ({...p, storage_location: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" placeholder="Reserve, Cuisine..." /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-slate-300 text-xs">Date d'achat</Label><Input type="date" value={productForm.date_achat} onChange={e => setProductForm(p => ({...p, date_achat: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" /></div>
              <div><Label className="text-slate-300 text-xs">Date de peremption</Label><Input type="date" value={productForm.date_peremption} onChange={e => setProductForm(p => ({...p, date_peremption: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" /></div>
            </div>
            <div><Label className="text-slate-300 text-xs">Observation</Label><Textarea value={productForm.observation} onChange={e => setProductForm(p => ({...p, observation: e.target.value}))} className="bg-slate-800 border-slate-700 text-white" rows={2} placeholder="Remarques..." /></div>
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={saveProduct}><Save className="w-4 h-4 mr-1" /> {editingItem ? "Mettre a jour" : "Enregistrer"}</Button>
          </div>
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

      {/* Movement Modal */}
      <Dialog open={showMovementModal} onOpenChange={setShowMovementModal}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
          <DialogHeader><DialogTitle className="text-white">Nouveau Mouvement</DialogTitle><DialogDescription className="text-slate-400">Enregistrer une entree, sortie ou ajustement</DialogDescription></DialogHeader>          <div className="space-y-3">
            <div><Label className="text-slate-300 text-xs">Produit *</Label>
              <Select value={movementForm.product_id} onValueChange={v => setMovementForm(p => ({...p, product_id: v}))}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white"><SelectValue placeholder="Choisir un produit" /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 max-h-[200px]">{products.map(p => <SelectItem key={p.id} value={p.id} className="text-white">{p.name} ({p.quantity} {p.unit})</SelectItem>)}</SelectContent>
              </Select>
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
                <Input type="text" inputMode="decimal" min="0" value={recipeForm.selling_price || ""} onChange={e => setRecipeForm(p => ({...p, selling_price: parseDecimal(e.target.value)}))} className="bg-slate-800 border-slate-700 text-white" placeholder="Prix de vente en Caisse" /></div>
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
                      {products.filter(p => !recipeForm.ingredients.some(i => i.product_id === p.id)).map(p => (
                        <SelectItem key={p.id} value={p.id} className="text-white text-xs">{p.name} ({p.unit})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input type="text" inputMode="decimal" min="0" step="0.01" value={recipeIngredient.quantity || ""} onChange={e => setRecipeIngredient(p => ({...p, quantity: parseDecimal(e.target.value)}))} className="bg-slate-900 border-slate-700 text-white w-24 h-8 text-xs" placeholder="Quantite" />
                <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700" onClick={addRecipeIngredient}><Plus className="w-3 h-3" /></Button>
              </div>
              {recipeForm.ingredients.length > 0 && (
                <div className="space-y-1 mt-2">
                  {recipeForm.ingredients.map((ing, i) => {
                    const prod = products.find(p => p.id === ing.product_id);
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
