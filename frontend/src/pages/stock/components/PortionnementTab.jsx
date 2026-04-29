import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Scale, Save, RefreshCw, Search, Droplet, Package, Wand2, X,
  Calculator, ArrowRight, Filter,
} from "lucide-react";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * PortionnementTab (per-product rules)
 * Each stock product has its own rule: portions_per_unit + is_liquid.
 * No category-level rule. Default = 1 portion/unit, is_liquid auto-detected initially.
 */
export default function PortionnementTab() {
  const [rules, setRules] = useState([]); // [{stock_product_id, name, category_name, portions_per_unit, is_liquid, configured, ...}]
  const [originalRules, setOriginalRules] = useState({}); // map of id -> {ppu, liq}
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [onlyConfigured, setOnlyConfigured] = useState(false);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);
  // Simulator state
  const [simSearch, setSimSearch] = useState("");
  const [simProduct, setSimProduct] = useState(null);
  const [simQty, setSimQty] = useState("");

  const fetchRules = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/stock/portionnement/rules`);
      const list = r.data.product_rules || [];
      setRules(list);
      const orig = {};
      list.forEach(x => { orig[x.stock_product_id] = { ppu: x.portions_per_unit, liq: x.is_liquid, conf: x.configured }; });
      setOriginalRules(orig);
    } catch (e) {
      toast.error("Erreur chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRules(); }, []);

  // Reset to first page when filters change
  useEffect(() => { setPage(0); }, [search, categoryFilter, onlyConfigured]);

  const categories = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const r of rules) {
      const c = r.category_name || "(sans catégorie)";
      if (!seen.has(c)) { seen.add(c); list.push(c); }
    }
    list.sort();
    return list;
  }, [rules]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rules.filter(r => {
      if (categoryFilter && (r.category_name || "(sans catégorie)") !== categoryFilter) return false;
      if (onlyConfigured && !r.configured) return false;
      if (q && !r.stock_product_name.toLowerCase().includes(q) && !(r.stock_product_code || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rules, search, categoryFilter, onlyConfigured]);

  const paged = useMemo(() => {
    const start = page * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const updateRule = (productId, patch) => {
    setRules(prev => prev.map(r =>
      r.stock_product_id === productId
        ? { ...r, ...patch, configured: true }
        : r
    ));
  };

  const dirty = useMemo(() => {
    return rules.some(r => {
      const o = originalRules[r.stock_product_id];
      if (!o) return r.configured;
      const valChanged = parseFloat(r.portions_per_unit) !== parseFloat(o.ppu) || !!r.is_liquid !== !!o.liq;
      return valChanged;
    });
  }, [rules, originalRules]);

  const saveAll = async () => {
    setSaving(true);
    try {
      // Persist only rules that differ from default (ppu=1.0 + liq=auto) OR have been explicitly configured
      const overrides = rules
        .filter(r => r.configured) // keep all marked as configured (modified by user)
        .map(r => ({
          stock_product_id: r.stock_product_id,
          portions_per_unit: parseFloat(r.portions_per_unit) || 1.0,
          is_liquid: !!r.is_liquid,
        }));
      await axios.put(`${API}/stock/portionnement/rules`, {
        category_rules: [],
        product_overrides: overrides,
      });
      toast.success(`✓ ${overrides.length} règle${overrides.length > 1 ? "s" : ""} produit enregistrée${overrides.length > 1 ? "s" : ""}`);
      await fetchRules();
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
      toast.success(`✓ ${r.data.updated_to_portion} produits convertis (${r.data.kept_liquid} liquides conservés)`);
      await fetchRules();
    } catch (e) {
      toast.error("Erreur lors de l'application");
    } finally {
      setApplying(false);
    }
  };

  // -------- Stats --------
  const liquidCount = rules.filter(r => r.is_liquid).length;
  const configuredCount = rules.filter(r => r.configured).length;
  const portionCount = rules.length - liquidCount;

  // -------- Simulator --------
  const simSuggestions = useMemo(() => {
    if (!simSearch.trim() || simProduct) return [];
    const q = simSearch.toLowerCase();
    return rules
      .filter(p => p.stock_product_name.toLowerCase().includes(q) || (p.stock_product_code || "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [simSearch, rules, simProduct]);

  const simRule = simProduct;
  const simQtyNum = parseFloat(simQty) || 0;
  const simResult = simProduct
    ? (simRule.is_liquid ? simQtyNum : simQtyNum * (parseFloat(simRule.portions_per_unit) || 1))
    : 0;
  const simNewStock = simProduct ? (simProduct.current_quantity || 0) + simResult : 0;

  return (
    <div className="space-y-4" data-testid="portionnement-tab">
      {/* Header + KPIs */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <Scale className="w-5 h-5 text-amber-400" />
                Règles de Portionnement (par produit)
              </CardTitle>
              <p className="text-slate-400 text-sm mt-1 max-w-2xl">
                Définissez <strong className="text-amber-300">individuellement</strong> pour chaque produit combien de <strong>portions</strong> on obtient par unité d'achat. À chaque réception de Bon de Commande, le stock est converti automatiquement. Les <strong className="text-cyan-300">liquides</strong> ne sont jamais convertis. Par défaut : 1 portion/unité (neutre).
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={fetchRules} variant="outline" size="sm" className="bg-slate-800 border-slate-600 text-slate-300"
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
                disabled={saving || !dirty} data-testid="save-rules-btn">
                <Save className="w-4 h-4 mr-1" />
                {saving ? "Enregistrement..." : (dirty ? "Enregistrer les modifications" : "Aucune modification")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Kpi label="Produits" value={rules.length} color="text-slate-300" icon={<Package className="w-3 h-3" />} />
            <Kpi label="Configurés" value={configuredCount} color="text-violet-400" />
            <Kpi label="Liquides" value={liquidCount} color="text-cyan-400" icon={<Droplet className="w-3 h-3" />} />
            <Kpi label="En portions" value={portionCount} color="text-amber-400" />
          </div>
        </CardContent>
      </Card>

      {/* Filters + Table */}
      <Card className="bg-slate-800/50 border-slate-700" data-testid="rules-table-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-white text-base">Règles produit par produit</CardTitle>
            <div className="text-slate-500 text-xs">
              {filtered.length} / {rules.length} produits
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher (nom ou code)…"
                className="bg-slate-900 border-slate-700 text-white pl-9 h-9"
                data-testid="filter-search"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded text-white text-sm px-3 h-9 min-w-[180px]"
              data-testid="filter-category"
            >
              <option value="">Toutes les catégories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setOnlyConfigured(v => !v)}
              className={`px-3 h-9 rounded text-sm font-medium border flex items-center gap-1.5 transition-colors ${
                onlyConfigured
                  ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                  : "bg-slate-900 border-slate-700 text-slate-400 hover:text-white"
              }`}
              data-testid="filter-configured"
            >
              <Filter className="w-3 h-3" />
              {onlyConfigured ? "Configurés uniquement" : "Tous"}
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Header row */}
          <div className="hidden md:flex items-center px-4 py-2 text-xs text-slate-500 font-medium border-b border-slate-700">
            <span className="flex-1">Produit</span>
            <span className="w-44">Catégorie</span>
            <span className="w-28 text-center">Portions/unité</span>
            <span className="w-32 text-center">Type</span>
          </div>
          <div className="divide-y divide-slate-800">
            {paged.map(r => (
              <div key={r.stock_product_id} className="flex flex-col md:flex-row md:items-center gap-2 md:gap-0 px-4 py-2 hover:bg-slate-800/30">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white text-sm font-medium truncate">{r.stock_product_name}</span>
                    {r.stock_product_code && <span className="text-slate-500 text-[10px] font-mono">{r.stock_product_code}</span>}
                    {r.configured && <Badge className="bg-violet-500/20 text-violet-300 border border-violet-500/40 text-[10px] py-0">configuré</Badge>}
                  </div>
                  <div className="text-slate-500 text-[11px]">
                    Stock actuel : {(r.current_quantity || 0).toLocaleString('fr-FR')} {r.current_unit}
                    {r.purchase_unit && r.purchase_unit !== r.current_unit && <span> · achat en {r.purchase_unit}</span>}
                  </div>
                </div>
                <div className="w-full md:w-44 text-slate-400 text-xs truncate" title={r.category_name}>
                  {r.category_name || <span className="text-slate-600 italic">sans catégorie</span>}
                </div>
                <div className="w-full md:w-28 flex justify-center">
                  <Input
                    type="number" min="0.01" step="0.01"
                    value={r.portions_per_unit}
                    onChange={(e) => updateRule(r.stock_product_id, { portions_per_unit: e.target.value })}
                    disabled={r.is_liquid}
                    className="bg-slate-900 border-slate-700 text-white text-center h-8 w-24 disabled:opacity-50"
                    data-testid={`ppu-${r.stock_product_id}`}
                  />
                </div>
                <div className="w-full md:w-32 flex justify-center">
                  <button
                    type="button"
                    onClick={() => updateRule(r.stock_product_id, { is_liquid: !r.is_liquid })}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide transition-colors flex items-center gap-1 ${
                      r.is_liquid
                        ? "bg-cyan-500/30 text-cyan-200 border border-cyan-500/50"
                        : "bg-slate-700/50 text-slate-400 border border-slate-700 hover:border-slate-500"
                    }`}
                    data-testid={`liquid-${r.stock_product_id}`}
                  >
                    <Droplet className="w-3 h-3" />
                    {r.is_liquid ? "Liquide" : "Solide"}
                  </button>
                </div>
              </div>
            ))}
            {paged.length === 0 && (
              <p className="text-slate-500 text-sm text-center py-8">Aucun produit ne correspond aux filtres.</p>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700">
              <div className="flex items-center gap-2 text-slate-500 text-xs">
                <span>Affichés :</span>
                <select value={pageSize} onChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(0); }}
                  className="bg-slate-900 border border-slate-700 rounded text-white text-xs px-2 py-1">
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  className="text-slate-400 hover:text-white disabled:opacity-30">Précédent</Button>
                <span className="text-slate-400 text-xs">Page {page + 1} / {totalPages}</span>
                <Button size="sm" variant="ghost" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page + 1 >= totalPages}
                  className="text-slate-400 hover:text-white disabled:opacity-30">Suivant</Button>
              </div>
            </div>
          )}
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
            Vérifiez l'impact d'une réception sur le stock <strong>avant</strong> d'enregistrer un Bon de Commande.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="relative">
                <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Produit Stock</label>
                <Search className="absolute left-3 top-9 w-4 h-4 text-slate-500" />
                <Input
                  value={simProduct ? simProduct.stock_product_name : simSearch}
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
                        key={p.stock_product_id}
                        type="button"
                        onClick={() => { setSimProduct(p); setSimSearch(""); }}
                        className="w-full text-left px-3 py-2 hover:bg-emerald-500/10 flex items-center gap-2 text-sm"
                        data-testid={`sim-pick-${p.stock_product_id}`}
                      >
                        <Package className="w-3 h-3 text-emerald-400" />
                        <span className="text-white">{p.stock_product_name}</span>
                        <span className="text-slate-500 text-xs">{p.stock_product_code} · {p.current_unit}</span>
                      </button>
                    ))}
                  </div>
                )}
                {simProduct && (
                  <button
                    type="button"
                    onClick={() => { setSimProduct(null); setSimSearch(""); setSimQty(""); }}
                    className="absolute right-2 top-9 text-slate-500 hover:text-white p-1"
                    data-testid="sim-clear"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div>
                <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">
                  Quantité reçue {simProduct && <span className="text-slate-500">en {simProduct.purchase_unit || simProduct.current_unit || "unité"}</span>}
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
                      {simRule.is_liquid
                        ? <><Droplet className="w-3 h-3 mr-1 inline-block" /> Liquide (pas de conversion)</>
                        : `${simRule.portions_per_unit} portion${simRule.portions_per_unit > 1 ? "s" : ""}/unité`}
                      {simRule.configured && " ✓"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-700">
                    <span className="text-slate-400">Stock actuel</span>
                    <span className="text-white font-mono">{(simProduct.current_quantity || 0).toLocaleString('fr-FR')} {simProduct.current_unit}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Quantité achetée</span>
                    <span className="text-white font-mono">
                      {simQtyNum.toLocaleString('fr-FR')} {simProduct.purchase_unit || simProduct.current_unit}
                    </span>
                  </div>
                  {!simRule.is_liquid && parseFloat(simRule.portions_per_unit) !== 1 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Conversion</span>
                      <span className="text-amber-300 font-mono">×{simRule.portions_per_unit}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded px-3 py-2 mt-2">
                    <span className="text-emerald-300 text-sm font-medium flex items-center gap-1">
                      <ArrowRight className="w-4 h-4" />
                      Sera ajouté au stock
                    </span>
                    <span className="text-emerald-300 font-bold text-lg" data-testid="sim-result-portions">
                      +{simResult.toLocaleString('fr-FR')} {simProduct.current_unit}
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-slate-800/40 border border-slate-700 rounded px-3 py-2">
                    <span className="text-slate-300 text-sm font-medium">Stock après réception</span>
                    <span className="text-white font-bold text-lg" data-testid="sim-result-new-stock">
                      {simNewStock.toLocaleString('fr-FR')} {simProduct.current_unit}
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
