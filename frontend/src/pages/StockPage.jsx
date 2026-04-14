import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Package, BarChart3, TrendingUp, TrendingDown, AlertTriangle,
  Plus, Search, Filter, Edit2, Trash2, ArrowUpDown, ShoppingCart,
  Truck, ClipboardList, Settings, LogOut, Warehouse, ArrowDown, ArrowUp,
  RefreshCw, X, Save, Eye, ChevronDown, Users
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

const UNITS = ["kg","g","litre","ml","bouteille","casier","carton","sachet","paquet","piece","bac","sac","bidon","pot","pack","unite","regime","botte","boite","plateau","paire","rame","cartouche","rouleau","bloc","lot","aerosol","douzaine","barquette","brique","plaquette","bombe","fagot","flacon","tablette"];
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
  { id: "movements", label: "Mouvements", icon: ArrowUpDown },
  { id: "purchases", label: "Achats", icon: ShoppingCart },
  { id: "suppliers", label: "Fournisseurs", icon: Truck },
  { id: "categories", label: "Categories", icon: ClipboardList },
];

export default function StockPage() {
  const [activeSection, setActiveSection] = useState("dashboard");
  const [dashboard, setDashboard] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [movements, setMovements] = useState([]);
  const [purchases, setPurchases] = useState([]);
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
  const [editingItem, setEditingItem] = useState(null);

  // Forms
  const [productForm, setProductForm] = useState({ code: "", name: "", category_id: "", subcategory: "", unit: "kg", quantity: 0, stock_min: 5, stock_max: 100, purchase_price: 0, supplier_id: "", storage_location: "", date_achat: "", date_peremption: "", observation: "" });
  const [movementForm, setMovementForm] = useState({ product_id: "", movement_type: "entree", quantity: 0, unit_price: 0, reason: "" });
  const [purchaseForm, setPurchaseForm] = useState({ supplier_id: "", supplier_name: "", purchase_date: "", items: [], notes: "" });
  const [purchaseItem, setPurchaseItem] = useState({ product_id: "", quantity: 0, unit_price: 0 });
  const [supplierForm, setSupplierForm] = useState({ name: "", phone: "", email: "", address: "", product_types: "", notes: "" });
  const [categoryForm, setCategoryForm] = useState({ name: "", description: "", color: "#3b82f6" });

  const seed = async () => {
    try {
      await axios.post(`${API}/seed`);
      setSeeded(true);
      fetchAll();
      toast.success("Donnees de demonstration chargees");
    } catch { toast.error("Erreur"); }
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

  const fetchAll = useCallback(() => {
    fetchDashboard(); fetchProducts(); fetchCategories(); fetchSuppliers(); fetchMovements(); fetchPurchases();
  }, [fetchDashboard, fetchProducts, fetchCategories, fetchSuppliers, fetchMovements, fetchPurchases]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { fetchProducts(); }, [searchQuery, filterCategory, filterAlert, fetchProducts]);

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

  const catName = (id) => categories.find(c => c.id === id)?.name || "-";
  const supName = (id) => suppliers.find(s => s.id === id)?.name || "-";

  const stockStatus = (p) => {
    if (p.quantity <= 0) return { label: "Rupture", color: "bg-red-500/20 text-red-400" };
    if (p.quantity <= p.stock_min) return { label: "Faible", color: "bg-orange-500/20 text-orange-400" };
    return { label: "Normal", color: "bg-emerald-500/20 text-emerald-400" };
  };

  return (
    <div className="min-h-screen bg-slate-950 flex" data-testid="stock-page">
      <Toaster richColors position="top-right" />
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 sticky top-0 h-screen">
        <div className="p-5 border-b border-slate-800">
          <h1 className="text-xl font-bold text-white flex items-center gap-2"><Warehouse className="w-6 h-6 text-emerald-400" /> Gestion Stock</h1>
          <p className="text-slate-500 text-xs mt-1">Espace Maxo</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map(item => (
            <button key={item.id} onClick={() => setActiveSection(item.id)} data-testid={`nav-${item.id}`}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${activeSection === item.id ? 'bg-emerald-500/15 text-emerald-400 font-medium' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}>
              <item.icon className="w-4 h-4" /> {item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-800">
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
                <Button variant="outline" className="border-slate-700 text-slate-300" onClick={fetchAll}><RefreshCw className="w-4 h-4 mr-1" /> Actualiser</Button>
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
              <h2 className="text-2xl font-bold text-white">Produits</h2>
              <div className="flex gap-2">
                <Button onClick={() => { setShowMovementModal(true); setMovementForm({ product_id: "", movement_type: "entree", quantity: 0, unit_price: 0, reason: "" }); }}
                  className="bg-blue-600 hover:bg-blue-700" data-testid="new-movement-btn"><ArrowUpDown className="w-4 h-4 mr-1" /> Mouvement</Button>
                <Button onClick={() => { setEditingItem(null); setProductForm({ code: "", name: "", category_id: categories[0]?.id || "", subcategory: "", unit: "kg", quantity: 0, stock_min: 5, stock_max: 100, purchase_price: 0, supplier_id: "", storage_location: "", date_achat: "", date_peremption: "", observation: "" }); setShowProductModal(true); }}
                  className="bg-emerald-600 hover:bg-emerald-700" data-testid="new-product-btn"><Plus className="w-4 h-4 mr-1" /> Nouveau Produit</Button>
              </div>
            </div>

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

            <div className="text-slate-500 text-sm">{products.length} produit(s)</div>

            {/* Product Table */}
            <Card className="bg-slate-900/80 border-slate-800">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-slate-400 border-b border-slate-800 bg-slate-900/50">
                      <th className="p-3">Code</th><th className="p-3">Produit</th><th className="p-3">Categorie</th><th className="p-3">Sous-cat.</th><th className="p-3">Stock</th><th className="p-3">Min</th><th className="p-3">Unite</th><th className="p-3 text-right">Prix Achat</th><th className="p-3 text-right">Valeur</th><th className="p-3">Statut</th><th className="p-3">Lieu</th><th className="p-3"></th>
                    </tr></thead>
                    <tbody>
                      {products.map(p => {
                        const status = stockStatus(p);
                        return (
                          <tr key={p.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                            <td className="p-3 text-slate-500 font-mono text-xs">{p.code}</td>
                            <td className="p-3 text-white font-medium">{p.name}</td>
                            <td className="p-3 text-slate-400 text-xs">{catName(p.category_id)}</td>
                            <td className="p-3 text-slate-500 text-xs">{p.subcategory || "-"}</td>
                            <td className="p-3"><span className={`font-bold ${p.quantity <= 0 ? 'text-red-400' : p.quantity <= p.stock_min ? 'text-orange-400' : 'text-emerald-400'}`}>{p.quantity}</span></td>
                            <td className="p-3 text-slate-500">{p.stock_min}</td>
                            <td className="p-3 text-slate-400">{p.unit}</td>
                            <td className="p-3 text-right text-slate-300">{formatPrice(p.purchase_price)} F</td>
                            <td className="p-3 text-right text-emerald-400">{formatPrice(p.quantity * p.purchase_price)} F</td>
                            <td className="p-3"><Badge className={status.color + " text-xs"}>{status.label}</Badge></td>
                            <td className="p-3 text-slate-500 text-xs">{p.storage_location}</td>
                            <td className="p-3">
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-blue-400" onClick={() => openEditProduct(p)}><Edit2 className="w-3.5 h-3.5" /></Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-red-400" onClick={() => deleteProduct(p.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
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
            <Card className="bg-slate-900/80 border-slate-800"><CardContent className="p-0"><div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-400 border-b border-slate-800 bg-slate-900/50">
                  <th className="p-3">Date</th><th className="p-3">Produit</th><th className="p-3">Type</th><th className="p-3 text-right">Quantite</th><th className="p-3 text-right">Avant</th><th className="p-3 text-right">Apres</th><th className="p-3">Motif</th><th className="p-3">Utilisateur</th>
                </tr></thead>
                <tbody>
                  {movements.map(m => (
                    <tr key={m.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="p-3 text-slate-400 text-xs">{new Date(m.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="p-3 text-white">{m.product_name}</td>
                      <td className="p-3"><Badge className={`text-xs ${m.movement_type === 'entree' || m.movement_type === 'retour_fournisseur' ? 'bg-emerald-500/20 text-emerald-400' : m.movement_type === 'ajustement' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'}`}>{MOVEMENT_TYPES.find(t => t.value === m.movement_type)?.label || m.movement_type}</Badge></td>
                      <td className="p-3 text-right text-white font-medium">{m.quantity} {m.unit}</td>
                      <td className="p-3 text-right text-slate-500">{m.previous_quantity}</td>
                      <td className="p-3 text-right text-slate-300">{m.new_quantity}</td>
                      <td className="p-3 text-slate-400 text-xs max-w-[200px] truncate">{m.reason}</td>
                      <td className="p-3 text-slate-500 text-xs">{m.user_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></CardContent></Card>
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
            <Card className="bg-slate-900/80 border-slate-800"><CardContent className="p-0"><div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-400 border-b border-slate-800 bg-slate-900/50">
                  <th className="p-3">Date</th><th className="p-3">Fournisseur</th><th className="p-3">Articles</th><th className="p-3 text-right">Montant Total</th><th className="p-3">Utilisateur</th>
                </tr></thead>
                <tbody>
                  {purchases.map(p => (
                    <tr key={p.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="p-3 text-slate-400">{p.purchase_date}</td>
                      <td className="p-3 text-white">{p.supplier_name || "-"}</td>
                      <td className="p-3 text-slate-300">{p.items?.length || 0} article(s)</td>
                      <td className="p-3 text-right text-emerald-400 font-bold">{formatPrice(p.total_amount)} F</td>
                      <td className="p-3 text-slate-500">{p.user_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></CardContent></Card>
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
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {suppliers.map(s => (
                <Card key={s.id} className="bg-slate-900/80 border-slate-800">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-white font-bold">{s.name}</h3>
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
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {categories.map(c => {
                const count = products.filter(p => p.category_id === c.id).length;
                return (
                  <Card key={c.id} className="bg-slate-900/80 border-slate-800">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
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
              <div><Label className="text-slate-300 text-xs">Quantite</Label><Input type="number" value={productForm.quantity} onChange={e => setProductForm(p => ({...p, quantity: parseFloat(e.target.value)||0}))} className="bg-slate-800 border-slate-700 text-white" /></div>
              <div><Label className="text-slate-300 text-xs">Stock Min</Label><Input type="number" value={productForm.stock_min} onChange={e => setProductForm(p => ({...p, stock_min: parseFloat(e.target.value)||0}))} className="bg-slate-800 border-slate-700 text-white" /></div>
              <div><Label className="text-slate-300 text-xs">Stock Max</Label><Input type="number" value={productForm.stock_max} onChange={e => setProductForm(p => ({...p, stock_max: parseFloat(e.target.value)||0}))} className="bg-slate-800 border-slate-700 text-white" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-slate-300 text-xs">Prix d'achat (FCFA)</Label><Input type="number" value={productForm.purchase_price} onChange={e => setProductForm(p => ({...p, purchase_price: parseFloat(e.target.value)||0}))} className="bg-slate-800 border-slate-700 text-white" /></div>
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

      {/* Movement Modal */}
      <Dialog open={showMovementModal} onOpenChange={setShowMovementModal}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
          <DialogHeader><DialogTitle className="text-white">Nouveau Mouvement</DialogTitle><DialogDescription className="text-slate-400">Enregistrer une entree, sortie ou ajustement</DialogDescription></DialogHeader>
          <div className="space-y-3">
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
              <div><Label className="text-slate-300 text-xs">Quantite *</Label><Input type="number" min="0" value={movementForm.quantity} onChange={e => setMovementForm(p => ({...p, quantity: parseFloat(e.target.value)||0}))} className="bg-slate-800 border-slate-700 text-white" /></div>
              <div><Label className="text-slate-300 text-xs">Prix unitaire</Label><Input type="number" min="0" value={movementForm.unit_price} onChange={e => setMovementForm(p => ({...p, unit_price: parseFloat(e.target.value)||0}))} className="bg-slate-800 border-slate-700 text-white" /></div>
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
                <Input type="number" min="0" value={purchaseItem.quantity || ""} onChange={e => setPurchaseItem(p => ({...p, quantity: parseFloat(e.target.value)||0}))} className="bg-slate-900 border-slate-700 text-white w-20 h-8 text-xs" placeholder="Qte" />
                <Input type="number" min="0" value={purchaseItem.unit_price || ""} onChange={e => setPurchaseItem(p => ({...p, unit_price: parseFloat(e.target.value)||0}))} className="bg-slate-900 border-slate-700 text-white w-24 h-8 text-xs" placeholder="Prix unit." />
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
    </div>
  );
}
