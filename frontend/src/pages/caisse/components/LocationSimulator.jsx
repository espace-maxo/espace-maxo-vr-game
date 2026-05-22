/**
 * LocationSimulator — Simulateur de devis Locations.
 *
 * Fonctions :
 * - Ajout d'articles libres + sélection depuis Stock (catalogue produits)
 *   + sélection depuis Caisse (catalogue produits)
 * - Saisie du nombre de personnes
 * - Marge au choix : pourcentage OU montant fixe
 * - Affichage simultané : prix de revient + prix global + prix par personne
 * - Sauvegarde / Chargement / Suppression de simulations
 */
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, Save, Trash2, Plus, Percent, Banknote, Users, Package, Wine, Pen, RefreshCw, ChevronDown, ChevronUp, CalendarCheck, ShoppingBasket, Settings, Edit3, X as XIcon } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND}/api`;

const fmt = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n || 0));

const emptyForm = () => ({
  id: null,
  name: "",
  client_name: "",
  event_date: "",
  num_persons: 1,
  items: [],
  margin_type: "percent",
  margin_value: 30,
  notes: "",
});

const LocationSimulator = ({ currentUser, onCreateReservation }) => {
  const [form, setForm] = useState(emptyForm());
  const [stockProducts, setStockProducts] = useState([]);
  const [caisseProducts, setCaisseProducts] = useState([]);
  const [simulations, setSimulations] = useState([]);
  const [pickerType, setPickerType] = useState("libre"); // 'libre' | 'stock' | 'caisse'
  const [pickerRefId, setPickerRefId] = useState("");
  const [newItem, setNewItem] = useState({ label: "", unit_cost: 0, quantity: 1 });
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productCatFilter, setProductCatFilter] = useState("all");
  // Catalogue Marché/Supermarché (référentiel éditable)
  const [marketProducts, setMarketProducts] = useState([]);
  const [showMarketEditor, setShowMarketEditor] = useState(false);
  const [editingMarketProd, setEditingMarketProd] = useState(null);
  const [marketProdForm, setMarketProdForm] = useState({ name: "", category: "Boissons", unit_cost: 0, unit: "" });

  // Catégories pour le filtre (depuis les produits chargés)
  const stockCategories = useMemo(() => {
    const s = new Set();
    stockProducts.forEach((p) => p.category_name && s.add(p.category_name));
    return Array.from(s).sort();
  }, [stockProducts]);
  const caisseCategories = useMemo(() => {
    const s = new Set();
    caisseProducts.forEach((p) => p.category && s.add(p.category));
    return Array.from(s).sort();
  }, [caisseProducts]);
  const marketCategories = useMemo(() => {
    const s = new Set();
    marketProducts.forEach((p) => p.category && s.add(p.category));
    return Array.from(s).sort();
  }, [marketProducts]);

  // Produits filtrés pour la grille cliquable
  const filteredCatalogProducts = useMemo(() => {
    if (pickerType === "libre") return [];
    const src = pickerType === "stock" ? stockProducts
              : pickerType === "caisse" ? caisseProducts
              : marketProducts;
    const q = productSearch.toLowerCase().trim();
    return src.filter((p) => {
      const catKey = pickerType === "stock" ? p.category_name : p.category;
      if (productCatFilter !== "all" && catKey !== productCatFilter) return false;
      if (q && !(p.name || "").toLowerCase().includes(q)) return false;
      return true;
    }).slice(0, 300);
  }, [pickerType, stockProducts, caisseProducts, marketProducts, productSearch, productCatFilter]);

  // Ajoute directement un produit catalogue à la simulation (clic sur tuile)
  const quickAddCatalogProduct = (p) => {
    const unit = pickerType === "stock"
      ? (p.purchase_price || 0)
      : pickerType === "caisse"
        ? (p.purchase_price || p.cost || 0)
        : (p.unit_cost || 0);
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          type: pickerType,
          ref_id: p.id,
          label: p.name + (p.unit && pickerType === "market" ? ` (${p.unit})` : ""),
          unit_cost: unit,
          quantity: 1,
        },
      ],
    }));
    toast.success(`✓ ${p.name} ajouté`, { duration: 1500 });
  };

  // CRUD Marché — éditeur du référentiel
  const refreshMarket = async () => {
    try {
      const mR = await axios.get(`${API}/quick-products`);
      setMarketProducts(mR.data?.products || []);
    } catch {}
  };
  const saveMarketProduct = async () => {
    if (!(marketProdForm.name || "").trim()) {
      toast.error("Nom obligatoire");
      return;
    }
    try {
      const payload = {
        name: marketProdForm.name.trim(),
        category: marketProdForm.category || "Autres",
        unit_cost: parseFloat(marketProdForm.unit_cost) || 0,
        unit: marketProdForm.unit || "",
      };
      if (editingMarketProd?.id) {
        await axios.put(`${API}/quick-products/${editingMarketProd.id}`, payload);
        toast.success("Produit mis à jour");
      } else {
        await axios.post(`${API}/quick-products`, payload);
        toast.success("Produit ajouté");
      }
      setEditingMarketProd(null);
      setMarketProdForm({ name: "", category: "Boissons", unit_cost: 0, unit: "" });
      refreshMarket();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur");
    }
  };
  const deleteMarketProduct = async (id) => {
    if (!window.confirm("Supprimer ce produit du référentiel ?")) return;
    try {
      await axios.delete(`${API}/quick-products/${id}`);
      toast.success("Produit supprimé");
      refreshMarket();
    } catch (e) {
      toast.error("Erreur de suppression");
    }
  };

  useEffect(() => {
    (async () => {
      try {
        // Stock catalog (purchase price)
        const sR = await axios.get(`${API}/stock/products`);
        setStockProducts(sR.data?.products || []);
      } catch {}
      try {
        // Caisse catalog (purchase price if available)
        const cR = await axios.get(`${API}/caisse/products`);
        setCaisseProducts(cR.data?.products || []);
      } catch {}
      try {
        // Market / Supermarket reference catalog
        const mR = await axios.get(`${API}/quick-products`);
        setMarketProducts(mR.data?.products || []);
      } catch {}
    })();
    fetchSimulations();
  }, []);

  const fetchSimulations = async () => {
    try {
      const r = await axios.get(`${API}/location-simulations`);
      setSimulations(r.data?.simulations || []);
    } catch {
      // silent
    }
  };

  // Auto-fill libellé + coût depuis le picker stock/caisse/market
  const handlePickerSelect = (refId) => {
    setPickerRefId(refId);
    if (!refId) return;
    if (pickerType === "stock") {
      const p = stockProducts.find((x) => x.id === refId);
      if (p) setNewItem({ label: p.name, unit_cost: p.purchase_price || 0, quantity: 1 });
    } else if (pickerType === "caisse") {
      const p = caisseProducts.find((x) => x.id === refId);
      if (p) setNewItem({ label: p.name, unit_cost: p.purchase_price || p.cost || 0, quantity: 1 });
    } else if (pickerType === "market") {
      const p = marketProducts.find((x) => x.id === refId);
      if (p) setNewItem({ label: p.name + (p.unit ? ` (${p.unit})` : ""), unit_cost: p.unit_cost || 0, quantity: 1 });
    }
  };

  const addItem = () => {
    if (!newItem.label || newItem.label.trim().length === 0) {
      toast.error("Libellé requis");
      return;
    }
    setForm((p) => ({
      ...p,
      items: [
        ...p.items,
        {
          type: pickerType,
          ref_id: pickerType === "libre" ? null : pickerRefId || null,
          label: newItem.label.trim(),
          unit_cost: parseFloat(newItem.unit_cost) || 0,
          quantity: parseFloat(newItem.quantity) || 1,
        },
      ],
    }));
    setNewItem({ label: "", unit_cost: 0, quantity: 1 });
    setPickerRefId("");
    setPickerType("libre");
  };

  const removeItem = (idx) => {
    setForm((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));
  };

  // Live computations (côté client — pas besoin d'aller-retour serveur)
  const totals = useMemo(() => {
    const totalCost = form.items.reduce((s, it) => s + (parseFloat(it.unit_cost) || 0) * (parseFloat(it.quantity) || 0), 0);
    const sale = form.margin_type === "fixed"
      ? totalCost + (parseFloat(form.margin_value) || 0)
      : totalCost * (1 + (parseFloat(form.margin_value) || 0) / 100);
    const persons = Math.max(1, parseInt(form.num_persons) || 1);
    return {
      totalCost,
      saleGlobal: sale,
      pricePerPerson: sale / persons,
      marginAmount: sale - totalCost,
    };
  }, [form.items, form.margin_type, form.margin_value, form.num_persons]);

  const saveSimulation = async () => {
    if (!form.name || form.name.trim().length === 0) {
      toast.error("Nom de la simulation requis");
      return;
    }
    if (form.items.length === 0) {
      toast.error("Ajoutez au moins un article");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        client_name: form.client_name,
        event_date: form.event_date,
        num_persons: parseInt(form.num_persons) || 1,
        items: form.items.map((it) => ({
          type: it.type,
          ref_id: it.ref_id,
          label: it.label,
          unit_cost: parseFloat(it.unit_cost) || 0,
          quantity: parseFloat(it.quantity) || 1,
        })),
        margin_type: form.margin_type,
        margin_value: parseFloat(form.margin_value) || 0,
        notes: form.notes,
        created_by: currentUser?.full_name || currentUser?.username || "",
      };
      const r = form.id
        ? await axios.put(`${API}/location-simulations/${form.id}`, payload)
        : await axios.post(`${API}/location-simulations`, payload);
      toast.success(form.id ? "Simulation mise à jour" : "Simulation sauvegardée");
      setForm({ ...form, id: r.data?.simulation?.id });
      fetchSimulations();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur d'enregistrement");
    } finally { setSaving(false); }
  };

  const loadSimulation = (sim) => {
    setForm({
      id: sim.id,
      name: sim.name || "",
      client_name: sim.client_name || "",
      event_date: sim.event_date || "",
      num_persons: sim.num_persons || 1,
      items: sim.items || [],
      margin_type: sim.margin_type || "percent",
      margin_value: sim.margin_value || 0,
      notes: sim.notes || "",
    });
    toast.success("Simulation chargée");
    setShowHistory(false);
  };

  const deleteSimulation = async (sim) => {
    if (!window.confirm(`Supprimer la simulation "${sim.name}" ?`)) return;
    try {
      await axios.delete(`${API}/location-simulations/${sim.id}`);
      toast.success("Simulation supprimée");
      fetchSimulations();
      if (form.id === sim.id) setForm(emptyForm());
    } catch (e) {
      toast.error("Erreur de suppression");
    }
  };

  return (
    <div className="space-y-4" data-testid="location-simulator">
      <Card className="bg-gradient-to-br from-purple-950/40 to-slate-900/60 border-purple-500/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-white flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-2 text-base">
              <Calculator className="w-5 h-5 text-purple-400" />
              Simulateur de devis Location
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setForm(emptyForm())} className="border-slate-700 text-slate-300 h-8" data-testid="sim-new">
                <Plus className="w-3.5 h-3.5 mr-1" /> Nouvelle
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowHistory(!showHistory)} className="border-slate-700 text-slate-300 h-8" data-testid="sim-toggle-history">
                {showHistory ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
                Historique ({simulations.length})
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* HISTORY */}
          {showHistory && (
            <Card className="bg-slate-800/40 border-slate-700">
              <CardContent className="p-3 space-y-2">
                {simulations.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-4">Aucune simulation sauvegardée</p>
                ) : (
                  simulations.map((s) => (
                    <div key={s.id} className="bg-slate-900/60 border border-slate-700 rounded-lg p-2 flex items-center justify-between gap-2 flex-wrap" data-testid={`sim-row-${s.id}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-medium truncate">{s.name}</span>
                          {s.client_name && <Badge className="bg-slate-700 text-slate-300 text-[10px]">{s.client_name}</Badge>}
                          <Badge className="bg-purple-500/20 text-purple-300 text-[10px]">{s.num_persons} pers.</Badge>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Coût {fmt(s.total_cost)} F · Vente {fmt(s.sale_price_global)} F · {fmt(s.sale_price_per_person)} F/pers.
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => loadSimulation(s)} className="border-purple-500/40 text-purple-300 h-7 px-2 text-xs">
                          <Pen className="w-3 h-3 mr-1" /> Charger
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => deleteSimulation(s)} className="border-rose-500/40 text-rose-300 h-7 px-2">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}

          {/* HEADER */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs text-slate-400">Nom *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="ex: Anniversaire Sarah" className="bg-slate-800 border-slate-700 text-white"
                data-testid="sim-name" />
            </div>
            <div>
              <Label className="text-xs text-slate-400">Client</Label>
              <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                placeholder="Nom du client" className="bg-slate-800 border-slate-700 text-white" />
            </div>
            <div>
              <Label className="text-xs text-slate-400">Date événement</Label>
              <Input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                className="bg-slate-800 border-slate-700 text-white" />
            </div>
            <div>
              <Label className="text-xs text-slate-400 flex items-center gap-1"><Users className="w-3 h-3" /> Nombre de personnes</Label>
              <Input type="number" min="1" value={form.num_persons} onChange={(e) => setForm({ ...form, num_persons: e.target.value })}
                className="bg-slate-800 border-slate-700 text-white" data-testid="sim-persons" />
            </div>
          </div>

          {/* ADD ITEM */}
          <Card className="bg-slate-800/40 border-slate-700">
            <CardContent className="p-3 space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[140px]">
                  <Label className="text-xs text-slate-400">Source</Label>
                  <Select value={pickerType} onValueChange={(v) => { setPickerType(v); setPickerRefId(""); setNewItem({ label: "", unit_cost: 0, quantity: 1 }); }}>
                    <SelectTrigger className="bg-slate-900 border-slate-700 text-white h-9" data-testid="sim-source">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="libre" className="text-white"><Pen className="inline w-3 h-3 mr-1" /> Libre</SelectItem>
                      <SelectItem value="market" className="text-white"><ShoppingBasket className="inline w-3 h-3 mr-1" /> Marché / Supermarché</SelectItem>
                      <SelectItem value="stock" className="text-white"><Package className="inline w-3 h-3 mr-1" /> Stock</SelectItem>
                      <SelectItem value="caisse" className="text-white"><Wine className="inline w-3 h-3 mr-1" /> Caisse</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {pickerType !== "libre" && (
                  <div className="flex-1 min-w-[200px]">
                    <Label className="text-xs text-slate-400">
                      {pickerType === "stock" ? "Produit Stock" : pickerType === "caisse" ? "Produit Caisse" : "Produit Marché"}
                    </Label>
                    <Select value={pickerRefId} onValueChange={handlePickerSelect}>
                      <SelectTrigger className="bg-slate-900 border-slate-700 text-white h-9">
                        <SelectValue placeholder="Choisir un produit…" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700 max-h-[300px]">
                        {(pickerType === "stock" ? stockProducts : pickerType === "caisse" ? caisseProducts : marketProducts).map((p) => (
                          <SelectItem key={p.id} value={p.id} className="text-white">
                            {p.name} {pickerType === "market" ? `— ${fmt(p.unit_cost)} F` : (p.purchase_price ? `— ${fmt(p.purchase_price)} F` : "")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex-1 min-w-[180px]">
                  <Label className="text-xs text-slate-400">Libellé</Label>
                  <Input value={newItem.label} onChange={(e) => setNewItem({ ...newItem, label: e.target.value })}
                    placeholder="ex: Décoration ballon"
                    className="bg-slate-900 border-slate-700 text-white h-9"
                    data-testid="sim-item-label" />
                </div>
                <div className="w-[120px]">
                  <Label className="text-xs text-slate-400">Coût unité (F)</Label>
                  <Input type="number" value={newItem.unit_cost} onChange={(e) => setNewItem({ ...newItem, unit_cost: e.target.value })}
                    className="bg-slate-900 border-slate-700 text-white h-9 text-right"
                    data-testid="sim-item-unit-cost" />
                </div>
                <div className="w-[90px]">
                  <Label className="text-xs text-slate-400">Quantité</Label>
                  <Input type="number" min="0" step="0.1" value={newItem.quantity} onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                    className="bg-slate-900 border-slate-700 text-white h-9 text-right"
                    data-testid="sim-item-qty" />
                </div>
                <Button onClick={addItem} className="bg-purple-600 hover:bg-purple-700 h-9" data-testid="sim-add-item">
                  <Plus className="w-4 h-4 mr-1" /> Ajouter
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* === GRILLE PRODUITS CLIQUABLES (Stock / Caisse) === */}
          {pickerType !== "libre" && (
            <Card className="bg-slate-800/40 border-slate-700" data-testid="catalog-grid">
              <CardContent className="p-3 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs uppercase text-slate-400 font-semibold">
                    Catalogue {pickerType === "stock" ? "Stock" : pickerType === "caisse" ? "Caisse" : "Marché / Supermarché"} — clic = ajout direct
                  </span>
                  <Badge className="bg-purple-500/20 text-purple-300 text-[10px]">
                    {filteredCatalogProducts.length} produit(s)
                  </Badge>
                  <div className="ml-auto flex items-center gap-2 flex-wrap">
                    <Input
                      type="text"
                      placeholder="Rechercher…"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="bg-slate-900 border-slate-700 text-white h-8 w-[180px] text-sm"
                      data-testid="catalog-search"
                    />
                    <Select value={productCatFilter} onValueChange={setProductCatFilter}>
                      <SelectTrigger className="bg-slate-900 border-slate-700 text-white h-8 w-[170px] text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="all" className="text-white">Toutes catégories</SelectItem>
                        {(pickerType === "stock" ? stockCategories : pickerType === "caisse" ? caisseCategories : marketCategories).map((c) => (
                          <SelectItem key={c} value={c} className="text-white">{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {pickerType === "market" && (
                      <Button size="sm" variant="outline" onClick={() => setShowMarketEditor(true)} className="border-purple-500/40 text-purple-300 h-8 text-xs" data-testid="market-edit-btn">
                        <Settings className="w-3.5 h-3.5 mr-1" /> Gérer
                      </Button>
                    )}
                  </div>
                </div>

                {filteredCatalogProducts.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-6">Aucun produit ne correspond aux filtres</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-[420px] overflow-y-auto pr-1">
                    {filteredCatalogProducts.map((p) => {
                      const unit = pickerType === "stock"
                        ? (p.purchase_price || 0)
                        : pickerType === "caisse"
                          ? (p.purchase_price || p.cost || 0)
                          : (p.unit_cost || 0);
                      const Icon = pickerType === "stock" ? Package : pickerType === "caisse" ? Wine : ShoppingBasket;
                      const colorClass = pickerType === "stock"
                        ? "border-emerald-500/30 bg-emerald-900/10 hover:bg-emerald-900/25"
                        : pickerType === "caisse"
                          ? "border-amber-500/30 bg-amber-900/10 hover:bg-amber-900/25"
                          : "border-purple-500/30 bg-purple-900/10 hover:bg-purple-900/25";
                      const iconColor = pickerType === "stock" ? "text-emerald-400"
                        : pickerType === "caisse" ? "text-amber-400"
                        : "text-purple-300";
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => quickAddCatalogProduct(p)}
                          className={`group relative border-2 rounded-lg p-2 text-left transition transform hover:scale-105 ${colorClass}`}
                          data-testid={`catalog-tile-${p.id}`}
                        >
                          <div className="flex items-start gap-1.5">
                            <Icon className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${iconColor}`} />
                            <span className="text-white text-xs font-medium leading-tight line-clamp-2 flex-1">{p.name}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1.5 flex items-center justify-between">
                            <span className={iconColor}><strong>{fmt(unit)}</strong> F</span>
                            <Plus className="w-3 h-3 text-slate-500 group-hover:text-white opacity-60 group-hover:opacity-100 transition" />
                          </p>
                          {pickerType === "stock" && p.quantity != null && (
                            <p className="text-[9px] text-slate-500 truncate mt-0.5">
                              Stock&nbsp;: {p.quantity} {p.unit || ""}
                            </p>
                          )}
                          {pickerType === "market" && p.unit && (
                            <p className="text-[9px] text-slate-500 truncate mt-0.5">{p.unit}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ITEMS LIST */}
          {form.items.length > 0 && (
            <Card className="bg-slate-800/40 border-slate-700">
              <CardContent className="p-0">
                <div className="divide-y divide-slate-700">
                  {form.items.map((it, idx) => {
                    const lineTotal = (parseFloat(it.unit_cost) || 0) * (parseFloat(it.quantity) || 0);
                    const Icon = it.type === "stock" ? Package : it.type === "caisse" ? Wine : Pen;
                    const iconColor = it.type === "stock" ? "text-emerald-400" : it.type === "caisse" ? "text-amber-400" : "text-slate-400";
                    return (
                      <div key={idx} className="p-2 flex items-center gap-2 hover:bg-slate-800/30" data-testid={`sim-line-${idx}`}>
                        <Icon className={`w-4 h-4 flex-shrink-0 ${iconColor}`} />
                        <span className="text-slate-300 text-sm flex-1 min-w-0 truncate">{it.label}</span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Input type="number" value={it.unit_cost}
                            onChange={(e) => setForm((p) => ({ ...p, items: p.items.map((x, i) => i === idx ? { ...x, unit_cost: parseFloat(e.target.value) || 0 } : x) }))}
                            className="bg-slate-900 border-slate-700 text-white h-7 w-[90px] text-right text-xs" />
                          <span className="text-slate-500 text-xs">×</span>
                          <Input type="number" value={it.quantity} step="0.1"
                            onChange={(e) => setForm((p) => ({ ...p, items: p.items.map((x, i) => i === idx ? { ...x, quantity: parseFloat(e.target.value) || 0 } : x) }))}
                            className="bg-slate-900 border-slate-700 text-white h-7 w-[70px] text-right text-xs" />
                          <span className="text-purple-300 font-semibold text-sm w-[90px] text-right">{fmt(lineTotal)} F</span>
                          <Button size="sm" variant="ghost" onClick={() => removeItem(idx)} className="text-rose-400 h-7 w-7 p-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* MARGIN */}
          <Card className="bg-slate-800/40 border-slate-700">
            <CardContent className="p-3 flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs text-slate-400">Marge</Label>
                <div className="flex gap-1 mt-1">
                  <Button size="sm" onClick={() => setForm({ ...form, margin_type: "percent" })}
                    className={`h-9 ${form.margin_type === "percent" ? "bg-purple-600 text-white" : "bg-slate-900 text-slate-400 border border-slate-700"}`}
                    data-testid="sim-margin-pct">
                    <Percent className="w-3.5 h-3.5 mr-1" /> Pourcentage
                  </Button>
                  <Button size="sm" onClick={() => setForm({ ...form, margin_type: "fixed" })}
                    className={`h-9 ${form.margin_type === "fixed" ? "bg-purple-600 text-white" : "bg-slate-900 text-slate-400 border border-slate-700"}`}
                    data-testid="sim-margin-fix">
                    <Banknote className="w-3.5 h-3.5 mr-1" /> Montant fixe
                  </Button>
                </div>
              </div>
              <div className="w-[160px]">
                <Label className="text-xs text-slate-400">Valeur ({form.margin_type === "percent" ? "%" : "F"})</Label>
                <Input type="number" value={form.margin_value}
                  onChange={(e) => setForm({ ...form, margin_value: e.target.value })}
                  className="bg-slate-900 border-slate-700 text-white h-9 text-right"
                  data-testid="sim-margin-value" />
              </div>
              <div className="text-sm text-slate-400">
                = <strong className="text-emerald-400">{fmt(totals.marginAmount)} F</strong> de marge
              </div>
            </CardContent>
          </Card>

          {/* TOTALS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] uppercase text-slate-500 mb-1">Prix de revient</p>
                <p className="text-2xl font-bold text-slate-200" data-testid="sim-total-cost">{fmt(totals.totalCost)} F</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-purple-950/60 to-slate-900 border-purple-500/40">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] uppercase text-purple-300/80 mb-1">Prix de vente global</p>
                <p className="text-2xl font-bold text-purple-300" data-testid="sim-sale-global">{fmt(totals.saleGlobal)} F</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-emerald-950/60 to-slate-900 border-emerald-500/40">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] uppercase text-emerald-300/80 mb-1">Par personne ({form.num_persons || 1})</p>
                <p className="text-2xl font-bold text-emerald-300" data-testid="sim-sale-per-person">{fmt(totals.pricePerPerson)} F</p>
              </CardContent>
            </Card>
          </div>

          {/* NOTES + SAVE */}
          <div>
            <Label className="text-xs text-slate-400">Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Conditions particulières, contraintes…"
              className="bg-slate-800 border-slate-700 text-white" rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            {onCreateReservation && (
              <Button
                onClick={() => onCreateReservation({
                  ...form,
                  sale_price_global: totals.saleGlobal,
                  total_cost: totals.totalCost,
                  margin_amount: totals.marginAmount,
                })}
                disabled={form.items.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700"
                data-testid="sim-create-reservation"
              >
                <CalendarCheck className="w-4 h-4 mr-1" />
                Créer la réservation
              </Button>
            )}
            <Button onClick={saveSimulation} disabled={saving} className="bg-purple-600 hover:bg-purple-700" data-testid="sim-save">
              {saving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              {form.id ? "Mettre à jour" : "Sauvegarder"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* === Modal Gérer le catalogue Marché === */}
      {showMarketEditor && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowMarketEditor(false)}>
          <Card className="bg-slate-900 border-purple-500/40 w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()} data-testid="market-editor-modal">
            <CardHeader className="pb-2 border-b border-slate-700">
              <CardTitle className="text-white flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-base">
                  <ShoppingBasket className="w-5 h-5 text-purple-400" />
                  Catalogue Marché / Supermarché
                  <Badge className="bg-purple-500/20 text-purple-300 text-[10px]">{marketProducts.length}</Badge>
                </span>
                <Button size="sm" variant="ghost" onClick={() => setShowMarketEditor(false)} className="text-slate-300 h-7 w-7 p-0">
                  <XIcon className="w-4 h-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 overflow-y-auto flex-1 space-y-3">
              {/* Formulaire ajout / édition */}
              <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-3">
                <p className="text-xs uppercase text-slate-400 font-semibold mb-2">
                  {editingMarketProd ? "Modifier le produit" : "Ajouter un produit"}
                </p>
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-12 sm:col-span-4">
                    <Label className="text-xs text-slate-400">Nom *</Label>
                    <Input value={marketProdForm.name}
                      onChange={(e) => setMarketProdForm({ ...marketProdForm, name: e.target.value })}
                      className="bg-slate-900 border-slate-700 text-white h-9" data-testid="market-form-name" />
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <Label className="text-xs text-slate-400">Catégorie</Label>
                    <Input value={marketProdForm.category}
                      onChange={(e) => setMarketProdForm({ ...marketProdForm, category: e.target.value })}
                      list="market-cats" className="bg-slate-900 border-slate-700 text-white h-9" />
                    <datalist id="market-cats">
                      {marketCategories.map((c) => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <Label className="text-xs text-slate-400">Prix (F)</Label>
                    <Input type="number" value={marketProdForm.unit_cost}
                      onChange={(e) => setMarketProdForm({ ...marketProdForm, unit_cost: e.target.value })}
                      className="bg-slate-900 border-slate-700 text-white h-9 text-right" data-testid="market-form-price" />
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <Label className="text-xs text-slate-400">Unité</Label>
                    <Input value={marketProdForm.unit}
                      onChange={(e) => setMarketProdForm({ ...marketProdForm, unit: e.target.value })}
                      placeholder="kg, pièce…" className="bg-slate-900 border-slate-700 text-white h-9" />
                  </div>
                  <div className="col-span-6 sm:col-span-1 flex gap-1">
                    <Button onClick={saveMarketProduct} className="bg-purple-600 hover:bg-purple-700 h-9 flex-1" data-testid="market-form-save">
                      <Save className="w-4 h-4" />
                    </Button>
                    {editingMarketProd && (
                      <Button variant="outline" onClick={() => { setEditingMarketProd(null); setMarketProdForm({ name: "", category: "Boissons", unit_cost: 0, unit: "" }); }} className="h-9 border-slate-600 text-slate-300">
                        <XIcon className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Liste par catégorie */}
              {marketCategories.map((cat) => {
                const prods = marketProducts.filter((p) => p.category === cat);
                return (
                  <div key={cat}>
                    <p className="text-xs uppercase text-purple-300 font-semibold mb-1">{cat} ({prods.length})</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                      {prods.map((p) => (
                        <div key={p.id} className="bg-slate-800/60 border border-slate-700 rounded px-2 py-1.5 flex items-center gap-2" data-testid={`market-row-${p.id}`}>
                          <span className="text-sm text-slate-200 flex-1 truncate" title={p.name}>{p.name}</span>
                          <span className="text-xs text-purple-300 font-semibold whitespace-nowrap">{fmt(p.unit_cost)} F</span>
                          {p.unit && <Badge className="bg-slate-700/40 text-slate-400 text-[9px]">{p.unit}</Badge>}
                          <Button size="sm" variant="ghost" onClick={() => { setEditingMarketProd(p); setMarketProdForm({ name: p.name, category: p.category, unit_cost: p.unit_cost, unit: p.unit || "" }); }}
                            className="text-slate-300 h-6 w-6 p-0" data-testid={`market-edit-${p.id}`}>
                            <Edit3 className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteMarketProduct(p.id)} className="text-rose-400 h-6 w-6 p-0">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default LocationSimulator;
