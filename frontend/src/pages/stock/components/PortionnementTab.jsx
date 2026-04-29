import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Scale, Save, RefreshCw, Search, Droplet, Package, AlertCircle, Wand2, Plus, X,
  Calculator, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * PortionnementTab
 * UI for managing portion rules per category + product overrides.
 * - Edit portions_per_unit and is_liquid for each category
 * - Add product-level overrides
 * - "Appliquer les unités" button: switches all non-liquid stock units to "portion"
 */
export default function PortionnementTab() {
  const [categoryRules, setCategoryRules] = useState([]);
  const [productOverrides, setProductOverrides] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [search, setSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  // Simulator state
  const [simSearch, setSimSearch] = useState("");
  const [simProduct, setSimProduct] = useState(null);
  const [simQty, setSimQty] = useState("");

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([
        axios.get(`${API}/stock/portionnement/rules`),
        axios.get(`${API}/stock/products`),
      ]);
      setCategoryRules(r.data.category_rules || []);
      setProductOverrides(r.data.product_overrides || []);
      setAllProducts(p.data.products || []);
    } catch (e) {
      toast.error("Erreur chargement des règles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const filteredCategoryRules = useMemo(() => {
    if (!search.trim()) return categoryRules;
    const q = search.toLowerCase();
    return categoryRules.filter(c => c.category_name.toLowerCase().includes(q));
  }, [categoryRules, search]);

  const updateCatRule = (idx, patch) => {
    setCategoryRules(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const addProductOverride = (product) => {
    if (productOverrides.some(o => o.stock_product_id === product.id)) {
      toast.info("Override déjà présent pour ce produit");
      return;
    }
    setProductOverrides(prev => [...prev, {
      stock_product_id: product.id,
      stock_product_name: product.name,
      category_id: product.category_id || "",
      portions_per_unit: 1.0,
      is_liquid: null,
    }]);
    setProductSearch("");
  };

  const updateOverride = (idx, patch) => {
    setProductOverrides(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const removeOverride = (idx) => {
    setProductOverrides(prev => prev.filter((_, i) => i !== idx));
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const payload = {
        category_rules: categoryRules.map(c => ({
          category_id: c.category_id,
          portions_per_unit: parseFloat(c.portions_per_unit) || 1.0,
          is_liquid: !!c.is_liquid,
        })),
        product_overrides: productOverrides.map(o => ({
          stock_product_id: o.stock_product_id,
          portions_per_unit: parseFloat(o.portions_per_unit) || 1.0,
          is_liquid: o.is_liquid,
        })),
      };
      await axios.put(`${API}/stock/portionnement/rules`, payload);
      toast.success("Règles enregistrées");
      await fetchAll();
    } catch (e) {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const applyUnits = async () => {
    if (!confirm("Convertir toutes les unités des produits NON-liquides en 'portion' ?\n\nLes quantités actuelles seront conservées (juste l'unité d'affichage change).")) return;
    setApplying(true);
    try {
      const r = await axios.post(`${API}/stock/portionnement/apply-units`);
      toast.success(`✓ ${r.data.updated_to_portion} produits convertis en "portion" (${r.data.kept_liquid} liquides conservés)`);
    } catch (e) {
      toast.error("Erreur lors de l'application");
    } finally {
      setApplying(false);
    }
  };

  const productSuggestions = useMemo(() => {
    if (!productSearch.trim()) return [];
    const q = productSearch.toLowerCase();
    const overrideIds = new Set(productOverrides.map(o => o.stock_product_id));
    return allProducts
      .filter(p => !overrideIds.has(p.id) && (p.name.toLowerCase().includes(q) || (p.code || "").toLowerCase().includes(q)))
      .slice(0, 8);
  }, [productSearch, allProducts, productOverrides]);

  const liquidCount = categoryRules.filter(c => c.is_liquid).length;
  const portionCount = categoryRules.length - liquidCount;

  // Resolve the effective portion rule for a product (override → category → defaults)
  const resolveRule = (product) => {
    if (!product) return null;
    const override = productOverrides.find(o => o.stock_product_id === product.id);
    const catRule = categoryRules.find(c => c.category_id === product.category_id);
    if (override) {
      const isLiquid = override.is_liquid === true ? true
        : override.is_liquid === false ? false
        : (catRule?.is_liquid || false);
      return {
        portions_per_unit: parseFloat(override.portions_per_unit) || 1.0,
        is_liquid: isLiquid,
        source: "override",
      };
    }
    if (catRule) {
      return {
        portions_per_unit: parseFloat(catRule.portions_per_unit) || 1.0,
        is_liquid: !!catRule.is_liquid,
        source: "category",
      };
    }
    return { portions_per_unit: 1.0, is_liquid: false, source: "default" };
  };

  // Simulator suggestions: products matching search, only if non-empty
  const simSuggestions = useMemo(() => {
    if (!simSearch.trim() || simProduct) return [];
    const q = simSearch.toLowerCase();
    return allProducts
      .filter(p => p.name.toLowerCase().includes(q) || (p.code || "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [simSearch, allProducts, simProduct]);

  const simRule = simProduct ? resolveRule(simProduct) : null;
  const simQtyNum = parseFloat(simQty) || 0;
  const simResult = simProduct && simRule
    ? (simRule.is_liquid ? simQtyNum : simQtyNum * simRule.portions_per_unit)
    : 0;
  const simNewStock = simProduct ? (simProduct.quantity || 0) + simResult : 0;

  return (
    <div className="space-y-4" data-testid="portionnement-tab">
      {/* Header */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <Scale className="w-5 h-5 text-amber-400" />
                Règles de Portionnement
              </CardTitle>
              <p className="text-slate-400 text-sm mt-1 max-w-2xl">
                Définissez combien de <strong className="text-amber-300">portions</strong> on obtient par unité d'achat (kg, piece). À chaque réception de Bon de Commande, le stock sera automatiquement converti en portions. Les <strong className="text-cyan-300">liquides</strong> (boissons, huiles…) restent dans leur unité d'origine.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={fetchAll} variant="outline" size="sm" className="bg-slate-800 border-slate-600 text-slate-300"
                disabled={loading} data-testid="refresh-portion-btn">
                <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
                Rafraîchir
              </Button>
              <Button onClick={applyUnits} variant="outline" size="sm" className="bg-amber-600/20 border-amber-500/40 text-amber-300 hover:bg-amber-600/30"
                disabled={applying} data-testid="apply-units-btn">
                <Wand2 className={`w-4 h-4 mr-1 ${applying ? "animate-spin" : ""}`} />
                Appliquer les unités
              </Button>
              <Button onClick={saveAll} className="bg-violet-600 hover:bg-violet-700"
                disabled={saving} data-testid="save-rules-btn">
                <Save className="w-4 h-4 mr-1" />
                {saving ? "Enregistrement..." : "Enregistrer les règles"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Kpi label="Catégories" value={categoryRules.length} color="text-slate-300" />
            <Kpi label="Liquides" value={liquidCount} color="text-cyan-400" icon={<Droplet className="w-3 h-3" />} />
            <Kpi label="Portions" value={portionCount} color="text-amber-400" icon={<Package className="w-3 h-3" />} />
            <Kpi label="Overrides produits" value={productOverrides.length} color="text-violet-400" />
          </div>
        </CardContent>
      </Card>

      {/* Category rules */}
      <Card className="bg-slate-800/50 border-slate-700" data-testid="category-rules-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-white text-base">Règles par catégorie</CardTitle>
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrer..."
                className="bg-slate-900 border-slate-700 text-white pl-9 h-8 text-sm"
                data-testid="filter-cat-rules"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-700">
            <div className="hidden md:flex items-center px-4 py-2 text-xs text-slate-500 font-medium">
              <span className="flex-1">Catégorie</span>
              <span className="w-32 text-center">Portions / unité</span>
              <span className="w-32 text-center">Liquide ?</span>
            </div>
            {filteredCategoryRules.map((c, idx) => {
              const realIdx = categoryRules.indexOf(c);
              return (
                <div key={c.category_id} className="flex flex-col md:flex-row md:items-center gap-2 md:gap-0 px-4 py-2.5 hover:bg-slate-800/30">
                  <div className="flex-1 min-w-0">
                    <span className="text-white text-sm font-medium">{c.category_name}</span>
                    {!c.configured && <Badge className="ml-2 bg-slate-700 text-slate-400 text-[10px] py-0">par défaut</Badge>}
                  </div>
                  <div className="w-full md:w-32 flex items-center gap-2">
                    <Input
                      type="number" min="0.01" step="0.01"
                      value={c.portions_per_unit}
                      onChange={(e) => updateCatRule(realIdx, { portions_per_unit: e.target.value })}
                      disabled={c.is_liquid}
                      className="bg-slate-900 border-slate-700 text-white text-center h-8 disabled:opacity-50"
                      data-testid={`portion-factor-${c.category_id}`}
                    />
                  </div>
                  <div className="w-full md:w-32 flex justify-center">
                    <button
                      type="button"
                      onClick={() => updateCatRule(realIdx, { is_liquid: !c.is_liquid })}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide transition-colors flex items-center gap-1 ${
                        c.is_liquid
                          ? "bg-cyan-500/30 text-cyan-200 border border-cyan-500/50"
                          : "bg-slate-700/50 text-slate-400 border border-slate-700 hover:border-slate-500"
                      }`}
                      data-testid={`liquid-toggle-${c.category_id}`}
                    >
                      <Droplet className="w-3 h-3" />
                      {c.is_liquid ? "Liquide" : "Solide"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Product overrides */}
      <Card className="bg-slate-800/50 border-slate-700" data-testid="product-overrides-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-base flex items-center gap-2">
            Surcharges par produit
            <Badge className="bg-violet-500/30 text-violet-200 border border-violet-500/50 text-[10px] py-0">{productOverrides.length}</Badge>
          </CardTitle>
          <p className="text-slate-500 text-xs">Cas particuliers où la règle de catégorie ne convient pas (ex: "Poulet entier" = 4 portions, mais "Mouton" = 8 portions/kg).</p>
        </CardHeader>
        <CardContent>
          {/* Add new override */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Rechercher un produit pour ajouter une surcharge…"
              className="bg-slate-900 border-slate-700 text-white pl-9"
              data-testid="add-override-search"
            />
            {productSuggestions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                {productSuggestions.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProductOverride(p)}
                    className="w-full text-left px-3 py-2 hover:bg-violet-500/10 flex items-center gap-2 text-sm"
                    data-testid={`add-override-${p.id}`}
                  >
                    <Plus className="w-3 h-3 text-emerald-400" />
                    <span className="text-white">{p.name}</span>
                    <span className="text-slate-500 text-xs">{p.code} · {p.unit}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {productOverrides.length === 0 && (
            <div className="bg-slate-900/40 border border-slate-700 rounded p-4 text-center">
              <AlertCircle className="w-6 h-6 text-slate-500 mx-auto mb-1" />
              <p className="text-slate-500 text-sm">Aucune surcharge produit pour l'instant. Les règles par catégorie s'appliquent à tous les produits.</p>
            </div>
          )}

          <div className="space-y-1">
            {productOverrides.map((o, idx) => (
              <div key={o.stock_product_id} className="flex flex-col md:flex-row md:items-center gap-2 bg-slate-900/40 border border-slate-700 rounded px-3 py-2">
                <div className="flex-1 min-w-0">
                  <span className="text-white text-sm font-medium">{o.stock_product_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 text-xs">Portions/u :</span>
                  <Input
                    type="number" min="0.01" step="0.01"
                    value={o.portions_per_unit}
                    onChange={(e) => updateOverride(idx, { portions_per_unit: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white text-center h-8 w-24"
                    data-testid={`override-portion-${o.stock_product_id}`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => updateOverride(idx, { is_liquid: o.is_liquid === true ? null : true })}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide transition-colors flex items-center gap-1 ${
                    o.is_liquid === true
                      ? "bg-cyan-500/30 text-cyan-200 border border-cyan-500/50"
                      : "bg-slate-700/50 text-slate-400 border border-slate-700"
                  }`}
                  title={o.is_liquid === true ? "Forcer comme liquide" : "Hériter de la catégorie"}
                  data-testid={`override-liquid-${o.stock_product_id}`}
                >
                  <Droplet className="w-3 h-3" />
                  {o.is_liquid === true ? "Liquide forcé" : "Hérite de la cat."}
                </button>
                <Button
                  size="icon" variant="ghost"
                  onClick={() => removeOverride(idx)}
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/20 w-8 h-8"
                  data-testid={`remove-override-${o.stock_product_id}`}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* SIMULATEUR */}
      <Card className="bg-gradient-to-br from-emerald-900/20 via-slate-800/50 to-slate-800/50 border-emerald-500/30" data-testid="simulator-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Calculator className="w-5 h-5 text-emerald-400" />
            Simulateur d'achat
          </CardTitle>
          <p className="text-slate-400 text-sm">
            Vérifiez l'impact d'une réception sur le stock <strong>avant</strong> d'enregistrer un Bon de Commande. Calcul instantané selon les règles configurées.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: product picker + qty */}
            <div className="space-y-3">
              <div className="relative">
                <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Produit Stock</label>
                <Search className="absolute left-3 top-9 w-4 h-4 text-slate-500" />
                <Input
                  value={simProduct ? simProduct.name : simSearch}
                  onChange={(e) => {
                    setSimSearch(e.target.value);
                    if (simProduct) setSimProduct(null);
                  }}
                  placeholder="Rechercher (ex: riz, poulet, mouton…)"
                  className="bg-slate-900 border-slate-700 text-white pl-9"
                  data-testid="sim-product-search"
                />
                {simSuggestions.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {simSuggestions.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setSimProduct(p); setSimSearch(""); }}
                        className="w-full text-left px-3 py-2 hover:bg-emerald-500/10 flex items-center gap-2 text-sm"
                        data-testid={`sim-pick-${p.id}`}
                      >
                        <Package className="w-3 h-3 text-emerald-400" />
                        <span className="text-white">{p.name}</span>
                        <span className="text-slate-500 text-xs">{p.code} · {p.unit}</span>
                      </button>
                    ))}
                  </div>
                )}
                {simProduct && (
                  <button
                    type="button"
                    onClick={() => { setSimProduct(null); setSimSearch(""); setSimQty(""); }}
                    className="absolute right-2 top-9 text-slate-500 hover:text-white p-1"
                    title="Effacer"
                    data-testid="sim-clear"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div>
                <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">
                  Quantité reçue {simProduct && <span className="text-slate-500">en {simProduct.purchase_unit || simProduct.unit || "unité"}</span>}
                </label>
                <Input
                  type="number" min="0" step="0.01"
                  value={simQty}
                  onChange={(e) => setSimQty(e.target.value)}
                  placeholder="Ex: 10"
                  className="bg-slate-900 border-slate-700 text-white"
                  disabled={!simProduct}
                  data-testid="sim-qty"
                />
              </div>
            </div>

            {/* Right: result */}
            <div className="bg-slate-900/40 border border-slate-700 rounded p-4">
              {!simProduct && (
                <div className="text-center py-6">
                  <Calculator className="w-10 h-10 text-slate-700 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm">Sélectionnez un produit et une quantité pour simuler.</p>
                </div>
              )}
              {simProduct && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Règle appliquée</span>
                    <Badge className={`${
                      simRule.is_liquid
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                        : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    } text-[10px] py-0`}>
                      {simRule.is_liquid ? <><Droplet className="w-3 h-3 mr-1 inline-block" /> Liquide (pas de conversion)</> : `${simRule.portions_per_unit} portion${simRule.portions_per_unit > 1 ? "s" : ""}/unité`}
                      {simRule.source === "override" && " (override)"}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-700">
                    <span className="text-slate-400">Stock actuel</span>
                    <span className="text-white font-mono">{(simProduct.quantity || 0).toLocaleString('fr-FR')} {simProduct.unit}</span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Quantité achetée</span>
                    <span className="text-white font-mono">
                      {simQtyNum.toLocaleString('fr-FR')} {simProduct.purchase_unit || simProduct.unit}
                    </span>
                  </div>

                  {!simRule.is_liquid && simRule.portions_per_unit !== 1 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Conversion</span>
                      <span className="text-amber-300 font-mono">
                        ×{simRule.portions_per_unit}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded px-3 py-2 mt-2">
                    <span className="text-emerald-300 text-sm font-medium flex items-center gap-1">
                      <ArrowRight className="w-4 h-4" />
                      Sera ajouté au stock
                    </span>
                    <span className="text-emerald-300 font-bold text-lg" data-testid="sim-result-portions">
                      +{simResult.toLocaleString('fr-FR')} {simProduct.unit}
                    </span>
                  </div>

                  <div className="flex items-center justify-between bg-slate-800/40 border border-slate-700 rounded px-3 py-2">
                    <span className="text-slate-300 text-sm font-medium">Stock après réception</span>
                    <span className="text-white font-bold text-lg" data-testid="sim-result-new-stock">
                      {simNewStock.toLocaleString('fr-FR')} {simProduct.unit}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const Kpi = ({ label, value, color, icon }) => (
  <div className="bg-slate-900/50 border border-slate-700 rounded p-2.5">
    <p className="text-slate-500 text-[11px] uppercase tracking-wide flex items-center gap-1">
      {icon}
      {label}
    </p>
    <p className={`${color} font-bold text-2xl mt-0.5`}>{value}</p>
  </div>
);
