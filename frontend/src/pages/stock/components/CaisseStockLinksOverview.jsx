import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Link2, RefreshCw, Search, ArrowRightLeft, Package, ShoppingBasket,
  Save, X, Check, AlertTriangle, BookOpen, Activity, ChevronDown, Wrench, Stethoscope, Zap
} from "lucide-react";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * CaisseStockLinksOverview
 * Bi-directional Caisse↔Stock link manager (Stock-side).
 * - View 1 (Caisse → Stock): each Caisse product with its multi-link target stock products.
 * - View 2 (Stock → Caisse): each Stock product with the list of Caisse products consuming it.
 * - Edit links from BOTH sides (modal).
 */
export default function CaisseStockLinksOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("caisse_to_stock"); // 'caisse_to_stock' | 'stock_to_caisse'
  const [search, setSearch] = useState("");

  // Health check state
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthExpanded, setHealthExpanded] = useState(false);
  const [repairing, setRepairing] = useState(false);

  // Edit modal state
  const [editTarget, setEditTarget] = useState(null); // { side, item }
  const [allStockProducts, setAllStockProducts] = useState([]);
  const [allCaisseProducts, setAllCaisseProducts] = useState([]);
  const [editSelected, setEditSelected] = useState(new Set()); // selected stock_ids when editing a caisse row
  const [editCaisseSelected, setEditCaisseSelected] = useState(new Set()); // selected caisse_ids when editing a stock row
  const [editSearch, setEditSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/stock/links-overview`);
      setData(r.data);
    } catch (e) {
      toast.error("Erreur lors du chargement des liaisons");
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const [sp, cp] = await Promise.all([
        axios.get(`${API}/stock/products`),
        axios.get(`${API}/caisse/products`),
      ]);
      setAllStockProducts(sp.data.products || []);
      setAllCaisseProducts(cp.data.products || []);
    } catch (e) {
      toast.error("Erreur lors du chargement des produits");
    }
  };

  const fetchHealth = async () => {
    setHealthLoading(true);
    try {
      const r = await axios.get(`${API}/caisse/products/health-check`);
      setHealth(r.data);
    } catch {
      toast.error("Erreur diagnostic santé");
    } finally {
      setHealthLoading(false);
    }
  };

  const repairOrphans = async () => {
    if (!window.confirm("Nettoyer les liaisons orphelines (qui pointent vers des stock_products supprimés) ?\n\nAction sûre : ne supprime que les références cassées.")) return;
    setRepairing(true);
    try {
      const r = await axios.post(`${API}/caisse/products/health-repair-orphans`);
      toast.success(`${r.data.repaired_count} produit(s) nettoyé(s)`);
      await Promise.all([fetchHealth(), fetchData()]);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setRepairing(false);
    }
  };

  const runSmartLink = async () => {
    if (!window.confirm("Lancer l'auto-liaison intelligente pour tous les produits Caisse non liés ?\n\nUtilise un dictionnaire de mots-clés (poulet, bœuf, poisson, etc.) pour faire les liaisons probables. Vous pourrez toujours ajuster manuellement après.")) return;
    setRepairing(true);
    try {
      const r = await axios.post(`${API}/caisse/products/smart-link-to-stock`);
      toast.success(`${r.data.linked_count || 0} produit(s) auto-liés · ${r.data.no_match_count || 0} sans correspondance`);
      await Promise.all([fetchHealth(), fetchData()]);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setRepairing(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchProducts();
    fetchHealth();
  }, []);

  const filteredCaisse = useMemo(() => {
    const list = data?.caisse_to_stock || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(c =>
      c.caisse_name.toLowerCase().includes(q) ||
      (c.category || "").toLowerCase().includes(q) ||
      (c.links || []).some(l => l.stock_name.toLowerCase().includes(q))
    );
  }, [data, search]);

  const filteredStock = useMemo(() => {
    const list = data?.stock_to_caisse || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(s =>
      s.stock_name.toLowerCase().includes(q) ||
      (s.stock_code || "").toLowerCase().includes(q) ||
      (s.consumers || []).some(c => c.caisse_name.toLowerCase().includes(q))
    );
  }, [data, search]);

  // ---- Edit modal handlers ----
  const openEditCaisse = (item) => {
    setEditTarget({ side: "caisse", item });
    setEditSelected(new Set((item.links || []).map(l => l.stock_id)));
    setEditCaisseSelected(new Set());
    setEditSearch("");
  };

  const openEditStock = (item) => {
    setEditTarget({ side: "stock", item });
    setEditCaisseSelected(new Set((item.consumers || []).map(c => c.caisse_id)));
    setEditSelected(new Set());
    setEditSearch("");
  };

  const closeEdit = () => { setEditTarget(null); setEditSearch(""); };

  const toggleEditStock = (id) => {
    setEditSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleEditCaisse = (id) => {
    setEditCaisseSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const saveCaisseEdit = async () => {
    if (!editTarget?.item) return;
    setSaving(true);
    try {
      await axios.put(`${API}/caisse/products/${editTarget.item.caisse_id}`, {
        stock_links: Array.from(editSelected),
        stock_recipe_id: "",
      });
      toast.success("Liaisons mises à jour");
      closeEdit();
      await fetchData();
    } catch (e) {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const saveStockEdit = async () => {
    // For stock-side editing: for each caisse product in allCaisseProducts:
    //   - if newly selected: add stock_id to its stock_links (if not already there)
    //   - if removed (was consumer, now unselected): remove stock_id from its stock_links
    if (!editTarget?.item) return;
    const stockId = editTarget.item.stock_id;
    const originalConsumers = new Set((editTarget.item.consumers || []).map(c => c.caisse_id));
    const toAdd = [];
    const toRemove = [];
    for (const id of editCaisseSelected) {
      if (!originalConsumers.has(id)) toAdd.push(id);
    }
    for (const id of originalConsumers) {
      if (!editCaisseSelected.has(id)) toRemove.push(id);
    }

    if (toAdd.length === 0 && toRemove.length === 0) {
      toast.info("Aucun changement");
      return;
    }

    setSaving(true);
    try {
      // Sequentially update each affected caisse product
      const cpById = Object.fromEntries(allCaisseProducts.map(p => [p.id, p]));
      for (const cpId of toAdd) {
        const cp = cpById[cpId];
        if (!cp) continue;
        const current = (cp.stock_links && cp.stock_links.length > 0)
          ? new Set(cp.stock_links)
          : (cp.stock_product_id ? new Set([cp.stock_product_id]) : new Set());
        current.add(stockId);
        await axios.put(`${API}/caisse/products/${cpId}`, {
          stock_links: Array.from(current),
          stock_recipe_id: "",
        });
      }
      for (const cpId of toRemove) {
        const cp = cpById[cpId];
        if (!cp) continue;
        const current = (cp.stock_links && cp.stock_links.length > 0)
          ? new Set(cp.stock_links)
          : (cp.stock_product_id ? new Set([cp.stock_product_id]) : new Set());
        current.delete(stockId);
        await axios.put(`${API}/caisse/products/${cpId}`, {
          stock_links: Array.from(current),
          stock_recipe_id: "",
        });
      }
      toast.success(`✓ ${toAdd.length} ajouts, ${toRemove.length} retraits`);
      closeEdit();
      await fetchData();
      await fetchProducts();
    } catch (e) {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const filteredEditList = useMemo(() => {
    if (editTarget?.side === "caisse") {
      const q = editSearch.toLowerCase();
      return (q ? allStockProducts.filter(p => p.name.toLowerCase().includes(q) || (p.code || "").toLowerCase().includes(q)) : allStockProducts).slice(0, 80);
    }
    if (editTarget?.side === "stock") {
      const q = editSearch.toLowerCase();
      return (q ? allCaisseProducts.filter(p => p.name.toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q)) : allCaisseProducts).slice(0, 80);
    }
    return [];
  }, [editTarget, editSearch, allStockProducts, allCaisseProducts]);

  const summary = data?.summary || {};

  return (
    <div className="space-y-4" data-testid="caisse-stock-links-tab">
      {/* Header */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-violet-400" />
                Liaisons Caisse ↔ Stock
              </CardTitle>
              <p className="text-slate-400 text-sm mt-1">
                Gérez d'un coup d'œil quels produits Caisse consomment quels produits Stock — dans <strong>les deux sens</strong>. Multi-liaison directe sans passer par une recette.
              </p>
            </div>
            <Button onClick={fetchData} variant="outline" size="sm" className="bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"
              disabled={loading} data-testid="refresh-links-btn">
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Rafraîchir
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2" data-testid="links-kpis">
            <Kpi label="Produits Caisse" value={summary.total_caisse_products || 0} color="text-slate-300" />
            <Kpi label="Suivis Stock" value={summary.trackable_caisse_products || 0} color="text-slate-300" />
            <Kpi label="Liés" value={summary.caisse_with_links || 0} color="text-emerald-400" />
            <Kpi label="Multi-cibles" value={summary.caisse_with_multi_links || 0} color="text-violet-400" />
            <Kpi label="Via Recette" value={summary.caisse_with_recipe || 0} color="text-amber-400" />
            <Kpi label="Services" value={summary.caisse_services || 0} color="text-cyan-400" />
          </div>
          {data?.services && data.services.length > 0 && (
            <div className="mt-3 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3" data-testid="services-list">
              <div className="flex items-center justify-between mb-2">
                <span className="text-amber-300 text-sm font-medium flex items-center gap-1.5">
                  <ShoppingBasket className="w-4 h-4" />
                  Produits "Service" (sans déstockage)
                </span>
                <span className="text-amber-200/70 text-xs">{data.services.length} produit{data.services.length > 1 ? "s" : ""}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {data.services.map(s => (
                  <span key={s.caisse_id} className="bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs rounded-full px-2 py-0.5">
                    {s.caisse_name}
                    {s.department && <span className="text-amber-300/60 ml-1">· {s.department}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diagnostic Santé Caisse↔Stock (Phase 4) */}
      {health && (
        <Card className={`border ${
          health.summary.health_score >= 90 ? 'bg-emerald-900/10 border-emerald-500/30'
          : health.summary.health_score >= 70 ? 'bg-amber-900/10 border-amber-500/30'
          : 'bg-red-900/10 border-red-500/30'
        }`} data-testid="health-check-card">
          <CardContent className="p-4">
            <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
              <div className="flex items-center gap-3">
                <Stethoscope className={`w-7 h-7 ${
                  health.summary.health_score >= 90 ? 'text-emerald-400'
                  : health.summary.health_score >= 70 ? 'text-amber-400'
                  : 'text-red-400'
                }`} />
                <div>
                  <p className="text-white font-bold text-lg">
                    Diagnostic santé : <span className={`${
                      health.summary.health_score >= 90 ? 'text-emerald-300'
                      : health.summary.health_score >= 70 ? 'text-amber-300'
                      : 'text-red-300'
                    }`}>{health.summary.health_score}/100</span>
                  </p>
                  <p className="text-slate-400 text-xs">
                    {health.summary.unlinked_count} non liés · {health.summary.orphans_count} orphelins · {health.summary.duplicates_count} doublons · {health.summary.stock_unused_count} stock inutilisés
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button onClick={fetchHealth} variant="outline" size="sm" disabled={healthLoading} className="border-slate-600 text-slate-300 hover:bg-slate-800" data-testid="health-refresh-btn">
                  <RefreshCw className={`w-3.5 h-3.5 mr-1 ${healthLoading ? 'animate-spin' : ''}`} /> Rediagnostiquer
                </Button>
                {health.summary.unlinked_count > 0 && (
                  <Button onClick={runSmartLink} size="sm" disabled={repairing} className="bg-violet-600 hover:bg-violet-700" data-testid="smart-link-btn">
                    <Zap className="w-3.5 h-3.5 mr-1" /> Auto-lier ({health.summary.unlinked_count})
                  </Button>
                )}
                {health.summary.orphans_count > 0 && (
                  <Button onClick={repairOrphans} size="sm" disabled={repairing} className="bg-amber-600 hover:bg-amber-700" data-testid="repair-orphans-btn">
                    <Wrench className="w-3.5 h-3.5 mr-1" /> Réparer orphelins ({health.summary.orphans_count})
                  </Button>
                )}
                <Button onClick={() => setHealthExpanded(v => !v)} variant="ghost" size="sm" className="text-slate-400 hover:text-white" data-testid="health-toggle-btn">
                  <ChevronDown className={`w-4 h-4 mr-1 transition-transform ${healthExpanded ? 'rotate-180' : ''}`} />
                  {healthExpanded ? "Masquer détails" : "Voir détails"}
                </Button>
              </div>
            </div>

            {healthExpanded && (
              <div className="space-y-3 mt-3 border-t border-slate-700/50 pt-3">
                {health.unlinked.length > 0 && (
                  <div data-testid="health-unlinked-list">
                    <p className="text-red-300 text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Produits Caisse non liés ({health.unlinked.length})
                    </p>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                      {health.unlinked.slice(0, 50).map(p => (
                        <span key={p.id} className="bg-red-500/15 border border-red-500/40 text-red-200 text-[11px] rounded-full px-2 py-0.5">{p.name}</span>
                      ))}
                      {health.unlinked.length > 50 && (
                        <span className="text-slate-500 text-[10px]">… +{health.unlinked.length - 50} autres</span>
                      )}
                    </div>
                  </div>
                )}

                {health.orphans.length > 0 && (
                  <div data-testid="health-orphans-list">
                    <p className="text-amber-300 text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Liaisons cassées ({health.orphans.length})
                    </p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {health.orphans.slice(0, 20).map(o => (
                        <div key={o.caisse_id} className="text-xs text-amber-200">
                          <strong>{o.caisse_name}</strong> → {o.broken_link_ids.length} liaison(s) cassée(s)
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {health.duplicates.length > 0 && (
                  <div data-testid="health-duplicates-list">
                    <p className="text-violet-300 text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5" /> Stock partagés ({health.duplicates.length})
                      <span className="text-slate-500 text-[10px] font-normal ml-1">(info, pas forcément un bug)</span>
                    </p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {health.duplicates.slice(0, 20).map(d => (
                        <div key={d.stock_id} className="text-xs text-violet-200">
                          <strong>{d.stock_name}</strong> ← {d.consumers.map(c => c.caisse_name).join(" · ")}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* View toggle */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setView("caisse_to_stock")}
          className={`px-3 py-2 rounded text-sm font-medium flex items-center gap-1.5 ${
            view === "caisse_to_stock" ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
          }`}
          data-testid="view-c2s-btn"
        >
          <ShoppingBasket className="w-4 h-4" /> Caisse → Stock
        </button>
        <button
          onClick={() => setView("stock_to_caisse")}
          className={`px-3 py-2 rounded text-sm font-medium flex items-center gap-1.5 ${
            view === "stock_to_caisse" ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
          }`}
          data-testid="view-s2c-btn"
        >
          <Package className="w-4 h-4" /> Stock → Caisse
        </button>
        <div className="flex-1 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="bg-slate-800 border-slate-700 text-white pl-9"
            data-testid="links-search"
          />
        </div>
      </div>

      {/* Lists */}
      {loading && <p className="text-slate-500 text-sm text-center py-6">Chargement...</p>}

      {!loading && view === "caisse_to_stock" && (
        <Card className="bg-slate-800/50 border-slate-700" data-testid="c2s-list">
          <CardContent className="p-0">
            <div className="divide-y divide-slate-700">
              {filteredCaisse.length === 0 && (
                <p className="text-slate-500 text-sm text-center py-6">Aucun produit Caisse correspondant.</p>
              )}
              {filteredCaisse.map(c => (
                <div key={c.caisse_id} className="px-3 py-2.5 flex items-start gap-3 hover:bg-slate-800/40">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium text-sm">{c.caisse_name}</span>
                      {c.category && <Badge className="bg-slate-700 text-slate-300 text-[10px] py-0">{c.category}</Badge>}
                      {c.links_count > 1 && (
                        <Badge className="bg-violet-500/20 text-violet-300 border border-violet-500/40 text-[10px] py-0">
                          {c.links_count} cibles
                        </Badge>
                      )}
                      {c.links_count === 0 && (
                        <Badge className="bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] py-0">
                          <AlertTriangle className="w-2.5 h-2.5 mr-0.5" /> non lié
                        </Badge>
                      )}
                    </div>
                    {c.links_count > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {c.links.map(l => (
                          <span key={l.stock_id} className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] rounded-full px-2 py-0.5">
                            {l.stock_name}
                            <span className="text-slate-500 ml-1 text-[10px]">({l.current_quantity} {l.unit})</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => openEditCaisse(c)}
                    className="text-violet-400 hover:text-violet-300 hover:bg-violet-500/20"
                    data-testid={`edit-c2s-${c.caisse_id}`}>
                    <Link2 className="w-3.5 h-3.5 mr-1" /> Modifier
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && view === "stock_to_caisse" && (
        <Card className="bg-slate-800/50 border-slate-700" data-testid="s2c-list">
          <CardContent className="p-0">
            <div className="divide-y divide-slate-700">
              {filteredStock.length === 0 && (
                <p className="text-slate-500 text-sm text-center py-6">Aucun produit Stock correspondant.</p>
              )}
              {filteredStock.map(s => (
                <div key={s.stock_id} className="px-3 py-2.5 flex items-start gap-3 hover:bg-slate-800/40">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium text-sm">{s.stock_name}</span>
                      {s.stock_code && <span className="font-mono text-xs text-slate-500">{s.stock_code}</span>}
                      <span className="text-xs text-slate-400">
                        Stock: <span className={s.current_quantity <= 0 ? "text-red-400" : "text-emerald-400"}>{s.current_quantity} {s.unit}</span>
                      </span>
                      {s.consumers_count > 0 ? (
                        <Badge className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] py-0">
                          {s.consumers_count} consommateur{s.consumers_count > 1 ? "s" : ""}
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-600/30 text-slate-400 border border-slate-600 text-[10px] py-0">
                          aucun consommateur Caisse
                        </Badge>
                      )}
                    </div>
                    {s.consumers_count > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {s.consumers.map(cs => (
                          <span key={cs.caisse_id} className="bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 text-[11px] rounded-full px-2 py-0.5">
                            {cs.caisse_name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => openEditStock(s)}
                    className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/20"
                    data-testid={`edit-s2c-${s.stock_id}`}>
                    <Link2 className="w-3.5 h-3.5 mr-1" /> Modifier
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit modal — common for both sides */}
      <Dialog open={!!editTarget} onOpenChange={(v) => !v && closeEdit()}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl" data-testid="edit-links-modal">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Link2 className="w-5 h-5 text-violet-400" />
              {editTarget?.side === "caisse" ? "Liaisons stock pour ce produit Caisse" : "Produits Caisse alimentés par ce stock"}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {editTarget?.side === "caisse" ? (
                <>Sélectionnez les <strong className="text-white">produits stock</strong> qui seront déstockés à chaque vente de <strong className="text-violet-300">{editTarget.item.caisse_name}</strong>.</>
              ) : (
                <>Sélectionnez les <strong className="text-white">produits Caisse</strong> qui consomment <strong className="text-cyan-300">{editTarget?.item?.stock_name}</strong> à chaque vente.</>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input value={editSearch} onChange={(e) => setEditSearch(e.target.value)}
              placeholder="Filtrer..." className="bg-slate-800 border-slate-700 text-white pl-9" />
          </div>

          <div className="max-h-[400px] overflow-y-auto space-y-1 pr-1">
            {filteredEditList.map(p => {
              const id = p.id;
              const checked = editTarget?.side === "caisse" ? editSelected.has(id) : editCaisseSelected.has(id);
              const onToggle = editTarget?.side === "caisse" ? toggleEditStock : toggleEditCaisse;
              const subInfo = editTarget?.side === "caisse"
                ? <>Stock : <span className={p.quantity <= 0 ? "text-red-400" : "text-emerald-400"}>{p.quantity} {p.unit}</span></>
                : <>{p.category || p.department || "—"}{p.stock_recipe_id ? " · ⚠ liée à recette" : ""}</>;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onToggle(id)}
                  className={`w-full text-left bg-slate-800/50 border rounded px-3 py-2 flex items-center gap-3 transition-colors ${
                    checked ? "border-emerald-500/60 bg-emerald-500/10" : "border-slate-700 hover:border-violet-500/60 hover:bg-violet-500/10"
                  }`}
                  data-testid={`edit-choice-${id}`}
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    checked ? "bg-emerald-500 border-emerald-500" : "border-slate-500"
                  }`}>
                    {checked && <Check className="w-3 h-3 text-white" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-sm truncate">{p.name}</span>
                      {p.code && <span className="font-mono text-xs text-slate-500">{p.code}</span>}
                      {editTarget?.side === "stock" && p.stock_recipe_id && (
                        <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] py-0">
                          <BookOpen className="w-2.5 h-2.5 mr-0.5" /> Recette
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{subInfo}</div>
                  </div>
                </button>
              );
            })}
            {filteredEditList.length === 0 && <p className="text-slate-500 text-sm text-center py-4">Aucun résultat.</p>}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-700">
            <Button variant="ghost" onClick={closeEdit} className="text-slate-400">
              <X className="w-4 h-4 mr-1" /> Annuler
            </Button>
            <Button
              onClick={editTarget?.side === "caisse" ? saveCaisseEdit : saveStockEdit}
              disabled={saving}
              className="bg-violet-600 hover:bg-violet-700"
              data-testid="save-links-btn"
            >
              <Save className="w-4 h-4 mr-1" /> {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Kpi = ({ label, value, color }) => (
  <div className="bg-slate-900/50 border border-slate-700 rounded p-2.5">
    <p className="text-slate-500 text-[11px] uppercase tracking-wide">{label}</p>
    <p className={`${color} font-bold text-2xl mt-0.5`}>{value}</p>
  </div>
);
