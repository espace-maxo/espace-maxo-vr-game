/**
 * FieldStockReportModal — Modal de "Point de stock terrain" pour le Resp. Op.
 *
 * Workflow :
 *  - Le Resp Op crée un nouveau relevé : choisit des catégories, saisit ses qty comptées,
 *    ajoute des notes, et soumet.
 *  - Tous les rôles (manager + admin) peuvent voir l'historique des relevés.
 *    Manager : ses propres relevés. Admin : tous.
 *  - Admin peut "Rapprocher" un relevé (ajuste le stock système).
 *
 * Le stock système n'est PAS impacté par la création/soumission. Seul le bouton
 * "Rapprocher" (Admin) déclenche des mouvements d'ajustement.
 */
import React, { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { Badge } from "../../../components/ui/badge";
import { Card, CardContent } from "../../../components/ui/card";
import {
  X, Plus, ClipboardCheck, Search, Save, AlertTriangle, CheckCircle2, FileText,
  Trash2, RefreshCw, Loader2, ChevronRight, ChevronLeft, Layers, BadgeCheck, ArrowUpDown,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function FieldStockReportModal({ open, onClose, currentUser, inline = false, kind = "ops" }) {
  const isAdmin = currentUser?.role === "admin";
  const userId = currentUser?.id || currentUser?.username || "unknown";
  const userName = currentUser?.full_name || currentUser?.username || "Resp. Op.";
  const kindLabel = kind === "kitchen" ? "cuisine" : "ops";

  const [tab, setTab] = useState("new"); // "new" | "history" | "detail"
  const [categories, setCategories] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // ----- Nouveau relevé -----
  const [selectedCats, setSelectedCats] = useState([]);
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState({}); // { product_id: counted_qty }
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Tri (Admin uniquement — pour repérer rapidement les stocks importants/faibles)
  const [sortMode, setSortMode] = useState("name_asc"); // name_asc | qty_desc | qty_asc | category

  // ----- Création express de produit -----
  const [showAddProd, setShowAddProd] = useState(false);
  const [newProdName, setNewProdName] = useState("");
  const [newProdCat, setNewProdCat] = useState("");
  // Unité par défaut adaptée au kind : portion pour la cuisine, unite sinon
  const [newProdUnit, setNewProdUnit] = useState(kind === "kitchen" ? "portion" : "unite");
  const [newProdQty, setNewProdQty] = useState("");
  const [creatingProd, setCreatingProd] = useState(false);

  // ----- Historique -----
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [reconciling, setReconciling] = useState(false);
  // Filtre kind dans l'historique (Admin uniquement)
  const [historyKindFilter, setHistoryKindFilter] = useState(kind); // ops | kitchen | all

  // ----------------------------------------------------------------
  // Chargement initial
  // ----------------------------------------------------------------
  const fetchCategories = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/stock/categories`);
      setCategories(r.data?.categories || r.data || []);
    } catch {
      setCategories([]);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const r = await axios.get(`${API}/stock/products`);
      const prods = r.data?.products || r.data || [];
      // Tri alphabétique pour faciliter la saisie
      prods.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setAllProducts(prods);
    } catch {
      setAllProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  const fetchReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const params = new URLSearchParams();
      // Admin : peut basculer le filtre kind (ops/kitchen/all)
      // Non-admin : forcé sur le kind du contexte + filtre user_id
      if (isAdmin) {
        if (historyKindFilter && historyKindFilter !== "all") params.set("kind", historyKindFilter);
      } else {
        params.set("kind", kind);
        params.set("role", currentUser?.role || "manager");
        params.set("user_id", userId);
      }
      const r = await axios.get(`${API}/field-stock/reports?${params.toString()}`);
      setReports(r.data?.reports || []);
    } catch {
      setReports([]);
    } finally {
      setReportsLoading(false);
    }
  }, [isAdmin, userId, kind, currentUser?.role, historyKindFilter]);

  useEffect(() => {
    if (!open && !inline) return;
    fetchCategories();
    fetchProducts();
    fetchReports();
  }, [open, inline, fetchCategories, fetchProducts, fetchReports]);

  // ----------------------------------------------------------------
  // Catégories sélectionnées → produits filtrés affichés
  // ----------------------------------------------------------------
  const visibleProducts = useMemo(() => {
    let list = allProducts;
    if (selectedCats.length > 0) {
      list = list.filter((p) => selectedCats.includes(p.category_id));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => (p.name || "").toLowerCase().includes(q));
    }
    // Tri (Admin uniquement — Resp Op reste en alphabétique pour ne pas révéler les qty)
    if (isAdmin) {
      const sorted = [...list];
      if (sortMode === "qty_desc") sorted.sort((a, b) => (b.quantity || 0) - (a.quantity || 0));
      else if (sortMode === "qty_asc") sorted.sort((a, b) => (a.quantity || 0) - (b.quantity || 0));
      else if (sortMode === "category") sorted.sort((a, b) => (a.category_id || "").localeCompare(b.category_id || "") || (a.name || "").localeCompare(b.name || ""));
      else sorted.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      return sorted;
    }
    return list;
  }, [allProducts, selectedCats, search, isAdmin, sortMode]);

  const countedItems = useMemo(() => {
    return Object.entries(counts)
      .filter(([, v]) => v !== "" && !Number.isNaN(parseFloat(v)))
      .map(([product_id, v]) => ({ product_id, counted_qty: parseFloat(v) }));
  }, [counts]);

  const totalLignes = countedItems.length;

  // ----------------------------------------------------------------
  // Actions
  // ----------------------------------------------------------------
  const toggleCategory = (catId) => {
    setSelectedCats((prev) => prev.includes(catId) ? prev.filter((c) => c !== catId) : [...prev, catId]);
  };

  const updateCount = (productId, value) => {
    setCounts((prev) => ({ ...prev, [productId]: value }));
  };

  const resetForm = () => {
    setSelectedCats([]);
    setSearch("");
    setCounts({});
    setNotes("");
  };

  // Création express d'un nouveau produit dans le catalogue Stock (sans prix → pending Admin)
  const createQuickProduct = async () => {
    const name = newProdName.trim();
    if (!name) { toast.error("Saisissez un nom"); return; }
    if (!newProdCat) { toast.error("Sélectionnez une catégorie"); return; }
    setCreatingProd(true);
    try {
      const params = new URLSearchParams({ x_user_name: userName }).toString();
      const qty = parseFloat(newProdQty || "0") || 0;
      const r = await axios.post(`${API}/field-stock/quick-add-product?${params}`, {
        name,
        category_id: newProdCat,
        unit: newProdUnit || "unite",
        counted_qty: qty,
        kind,
      });
      const created = r.data;
      // 1. L'ajouter en mémoire pour qu'il apparaisse dans la liste
      setAllProducts((prev) => {
        const next = [...prev, created];
        next.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        return next;
      });
      // 2. Pré-remplir la quantité comptée si fournie
      if (qty > 0) {
        setCounts((prev) => ({ ...prev, [created.id]: String(qty) }));
      }
      // 3. Si une catégorie filtrée est active, l'ajouter pour que le produit reste visible
      if (selectedCats.length > 0 && !selectedCats.includes(newProdCat)) {
        setSelectedCats((prev) => [...prev, newProdCat]);
      }
      toast.success(`« ${created.name} » créé · à compléter par l'Admin`);
      setShowAddProd(false);
      setNewProdName("");
      setNewProdQty("");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de la création");
    } finally {
      setCreatingProd(false);
    }
  };

  const submitReport = async () => {
    if (countedItems.length === 0) {
      toast.error("Saisissez au moins une quantité comptée");
      return;
    }
    setSubmitting(true);
    try {
      const params = new URLSearchParams({ x_user_id: userId, x_user_name: userName }).toString();
      await axios.post(`${API}/field-stock/reports?${params}`, {
        category_ids: selectedCats,
        items: countedItems,
        notes: notes.trim(),
        kind,
      });
      toast.success(`Point de stock soumis (${countedItems.length} ligne${countedItems.length > 1 ? "s" : ""}) ✅`);
      resetForm();
      await fetchReports();
      setTab("history");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de la soumission");
    } finally {
      setSubmitting(false);
    }
  };

  const openReport = async (reportId) => {
    try {
      const r = await axios.get(`${API}/field-stock/reports/${reportId}`);
      setSelectedReport(r.data);
      setTab("detail");
    } catch {
      toast.error("Impossible de charger le rapport");
    }
  };

  const deleteReport = async (reportId) => {
    if (!confirm("Supprimer ce rapport ?")) return;
    try {
      const params = new URLSearchParams({
        x_user_id: userId,
        x_user_role: isAdmin ? "admin" : "manager",
      }).toString();
      await axios.delete(`${API}/field-stock/reports/${reportId}?${params}`);
      toast.success("Rapport supprimé");
      await fetchReports();
      if (selectedReport?.id === reportId) { setSelectedReport(null); setTab("history"); }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const reconcile = async (reportId) => {
    if (!isAdmin) return;
    if (!confirm("Rapprocher ce point de stock au stock système ?\n\nUn mouvement d'ajustement sera créé pour chaque écart non nul.")) return;
    setReconciling(true);
    try {
      const params = new URLSearchParams({ x_user_name: userName }).toString();
      const r = await axios.post(`${API}/field-stock/reports/${reportId}/reconcile?${params}`);
      toast.success(`Rapprochement effectué — ${r.data.movements_count} mouvement(s) créé(s) ✅`);
      await fetchReports();
      if (selectedReport?.id === reportId) {
        const refreshed = await axios.get(`${API}/field-stock/reports/${reportId}`);
        setSelectedReport(refreshed.data);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setReconciling(false);
    }
  };

  // ----------------------------------------------------------------
  // Rendu
  // ----------------------------------------------------------------
  if (!inline && !open) return null;

  const body = (
    <>
        {/* Header (modal mode only) */}
        {!inline && (
          <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-800/60 to-slate-900/40">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/30">
                <ClipboardCheck className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-white font-semibold text-lg leading-tight">Point de stock terrain</h2>
                <p className="text-slate-400 text-xs">
                  {isAdmin ? "Supervisor view — tous les rapports" : "Saisie libre · indépendant du stock système"}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-white" data-testid="field-stock-close">
              <X className="w-5 h-5" />
            </Button>
          </div>
        )}

        {/* Inline header */}
        {inline && (
          <div className="flex items-center gap-3 mb-3">
            <div className={`p-2 rounded-lg ring-1 ${kind === "kitchen" ? "bg-amber-500/15 ring-amber-500/30" : "bg-emerald-500/15 ring-emerald-500/30"}`}>
              <ClipboardCheck className={`w-5 h-5 ${kind === "kitchen" ? "text-amber-400" : "text-emerald-400"}`} />
            </div>
            <div>
              <h2 className="text-white font-semibold text-lg leading-tight">
                Point de stock {kind === "kitchen" ? "cuisine" : "terrain"}
              </h2>
              <p className="text-slate-400 text-xs">
                {isAdmin
                  ? `Supervisor view — rapports ${kindLabel}`
                  : `Saisie libre du stock physique (${kind === "kitchen" ? "produits cuisine" : "boissons + accessoires"}) · indépendant du stock système`}
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className={`${inline ? '' : 'px-5'} pt-1 border-b border-slate-800 flex gap-1`}>
          {[
            { id: "new", label: "Nouveau relevé", icon: Plus },
            { id: "history", label: isAdmin ? "Tous les rapports" : "Mes rapports", icon: FileText },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSelectedReport(null); }}
              data-testid={`field-stock-tab-${t.id}`}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-t-md text-sm font-medium transition-all ${
                tab === t.id
                  ? "bg-slate-800 text-emerald-300 border-x border-t border-slate-700"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className={`${inline ? 'p-3' : 'flex-1 overflow-auto p-5'}`}>
          {/* === Nouveau relevé === */}
          {tab === "new" && (
            <div className="space-y-4">
              {/* Recherche + saisie quantités */}
              <div>
                <p className="text-slate-300 text-xs uppercase tracking-wider mb-2">1. Saisissez les quantités comptées</p>
                <div className="relative mb-2 flex gap-2 items-center flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Rechercher un produit..."
                      className="bg-slate-950 border-slate-700 text-white pl-9 h-9"
                      data-testid="field-stock-search"
                    />
                  </div>
                  {/* Bouton de tri — Admin uniquement (le Resp Op ne voit pas les qty système) */}
                  {isAdmin && (
                    <div className="flex items-center gap-1 bg-slate-900/80 border border-slate-700 rounded-md px-1 h-9" data-testid="field-stock-sort-group">
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 ml-1" />
                      {[
                        { id: "name_asc", label: "A→Z", title: "Trier par nom" },
                        { id: "qty_desc", label: "Stock ↓", title: "Stock système — du plus grand au plus petit" },
                        { id: "qty_asc", label: "Stock ↑", title: "Stock système — du plus petit au plus grand" },
                        { id: "category", label: "Catég.", title: "Regrouper par catégorie" },
                      ].map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSortMode(s.id)}
                          title={s.title}
                          data-testid={`field-stock-sort-${s.id}`}
                          className={`text-[11px] px-2 py-1 rounded transition ${
                            sortMode === s.id
                              ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                              : "text-slate-400 hover:text-white hover:bg-slate-800"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Bouton "Nouveau produit" — saisie rapide pour produits manquants au catalogue */}
                  <Button
                    type="button"
                    onClick={() => setShowAddProd(true)}
                    size="sm"
                    className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
                    data-testid="field-stock-add-product"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Nouveau produit
                  </Button>
                </div>

                {/* Liste produits */}
                <div className="border border-slate-800 rounded-md max-h-[40vh] overflow-auto bg-slate-950/40">
                  {loadingProducts ? (
                    <div className="p-6 text-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
                  ) : visibleProducts.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-sm">Aucun produit ne correspond aux filtres</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-900 z-10">
                        <tr className="border-b border-slate-800 text-xs uppercase text-slate-500">
                          <th className="px-3 py-2 text-left">Produit</th>
                          {isAdmin && <th className="px-3 py-2 text-right hidden md:table-cell">Stock système</th>}
                          <th className="px-3 py-2 text-right">Compté</th>
                          <th className="px-3 py-2 text-right hidden md:table-cell">Unité</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleProducts.map((p) => {
                          const val = counts[p.id] ?? "";
                          const hasValue = val !== "" && !Number.isNaN(parseFloat(val));
                          return (
                            <tr key={p.id} className={`border-b border-slate-800/60 hover:bg-slate-800/30 ${hasValue ? 'bg-emerald-500/5' : ''}`}>
                              <td className="px-3 py-2 text-slate-200 truncate max-w-[280px]">{p.name}</td>
                              {isAdmin && <td className="px-3 py-2 text-right text-slate-500 text-xs hidden md:table-cell">{p.quantity ?? 0}</td>}
                              <td className="px-3 py-2 text-right">
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  step="0.01"
                                  min="0"
                                  value={val}
                                  onChange={(e) => updateCount(p.id, e.target.value)}
                                  className="bg-slate-900 border-slate-700 text-white h-7 w-24 text-right ml-auto"
                                  placeholder="—"
                                  data-testid={`field-stock-input-${p.id}`}
                                />
                              </td>
                              <td className="px-3 py-2 text-right text-slate-500 text-xs hidden md:table-cell">{p.unit || "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  {visibleProducts.length > 500 && (
                    <div className="p-2 text-center text-amber-300 text-xs bg-amber-500/5">
                      ⚠️ {visibleProducts.length} produits affichés — utilisez la recherche ou les catégories pour affiner
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <p className="text-slate-300 text-xs uppercase tracking-wider mb-2">2. Notes (justification pour l&apos;Admin)</p>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Justif appro — boissons en rupture vendredi soir, contrôle frigo cave..."
                  rows={2}
                  className="bg-slate-950 border-slate-700 text-white text-sm resize-none"
                  data-testid="field-stock-notes"
                />
              </div>

              {/* Footer actions */}
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800 sticky bottom-0 bg-slate-900/95 -mx-5 px-5 pb-1">
                <div className="text-slate-400 text-sm">
                  <Badge className="bg-emerald-500/15 text-emerald-300 mr-2">{totalLignes}</Badge>
                  ligne{totalLignes > 1 ? "s" : ""} saisie{totalLignes > 1 ? "s" : ""}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={resetForm} className="border-slate-700 text-slate-300" data-testid="field-stock-reset">
                    <RefreshCw className="w-4 h-4 mr-1" /> Réinitialiser
                  </Button>
                  <Button
                    onClick={submitReport}
                    disabled={submitting || totalLignes === 0}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    data-testid="field-stock-submit"
                  >
                    {submitting
                      ? <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      : <Save className="w-4 h-4 mr-1" />}
                    Soumettre le relevé
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* === Historique === */}
          {tab === "history" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-slate-300 text-sm">
                    {reports.length} rapport{reports.length > 1 ? "s" : ""}
                  </p>
                  {/* Filtre kind — Admin uniquement (Resp Op / Chef voient leur propre kind) */}
                  {isAdmin && (
                    <div className="flex items-center gap-1 bg-slate-900/80 border border-slate-700 rounded-md px-1 h-8" data-testid="field-stock-kind-filter">
                      {[
                        { id: "all", label: "Tous" },
                        { id: "ops", label: "Resp. Op." },
                        { id: "kitchen", label: "Cuisine" },
                      ].map((k) => (
                        <button
                          key={k.id}
                          type="button"
                          onClick={() => setHistoryKindFilter(k.id)}
                          data-testid={`field-stock-kind-${k.id}`}
                          className={`text-[11px] px-2 py-1 rounded transition ${
                            historyKindFilter === k.id
                              ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                              : "text-slate-400 hover:text-white hover:bg-slate-800"
                          }`}
                        >
                          {k.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={fetchReports} className="border-slate-700 text-slate-300" data-testid="field-stock-refresh">
                  <RefreshCw className="w-3.5 h-3.5 mr-1" /> Actualiser
                </Button>
              </div>

              {reportsLoading ? (
                <div className="p-8 text-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
              ) : reports.length === 0 ? (
                <Card className="bg-slate-950/40 border-slate-800">
                  <CardContent className="p-8 text-center">
                    <ClipboardCheck className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-400 text-sm">Aucun rapport pour le moment.</p>
                    <Button onClick={() => setTab("new")} className="mt-3 bg-emerald-600 hover:bg-emerald-700" data-testid="field-stock-create-cta">
                      <Plus className="w-4 h-4 mr-1" /> Créer un relevé
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2" data-testid="field-stock-reports-list">
                  {reports.map((r) => (
                    <Card key={r.id} className="bg-slate-950/40 border-slate-800 hover:border-slate-700 transition cursor-pointer" onClick={() => openReport(r.id)} data-testid={`field-stock-report-${r.id}`}>
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${r.status === "reconciled" ? "bg-emerald-500/15" : "bg-amber-500/15"}`}>
                          {r.status === "reconciled"
                            ? <BadgeCheck className="w-5 h-5 text-emerald-400" />
                            : <ClipboardCheck className="w-5 h-5 text-amber-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white font-medium text-sm">{r.created_by_name}</span>
                            {r.kind === "kitchen" ? (
                              <Badge className="text-[10px] bg-amber-500/15 text-amber-300">🍳 Cuisine</Badge>
                            ) : (
                              <Badge className="text-[10px] bg-cyan-500/15 text-cyan-300">📋 Resp. Op.</Badge>
                            )}
                            <Badge className={`text-[10px] ${r.status === "reconciled" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
                              {r.status === "reconciled" ? "Rapproché" : "Soumis"}
                            </Badge>
                            <span className="text-slate-500 text-xs">
                              {new Date(r.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-400 flex-wrap">
                            <span>{r.items_count} ligne{r.items_count > 1 ? "s" : ""}</span>
                            {r.rupture_count > 0 && <span className="text-rose-400">• {r.rupture_count} rupture(s) constatées</span>}
                            {isAdmin && r.total_ecart_positif > 0 && <span className="text-emerald-400">• +{r.total_ecart_positif}</span>}
                            {isAdmin && r.total_ecart_negatif < 0 && <span className="text-rose-400">• {r.total_ecart_negatif}</span>}
                            {r.notes && <span className="text-slate-500 truncate max-w-[260px]">— {r.notes}</span>}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* === Detail === */}
          {tab === "detail" && selectedReport && (
            <div className="space-y-3">
              {/* Header detail */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedReport(null); setTab("history"); }} className="text-slate-400" data-testid="field-stock-back">
                    <ChevronLeft className="w-4 h-4 mr-1" /> Retour
                  </Button>
                  <div>
                    <p className="text-white font-medium text-sm">{selectedReport.created_by_name}</p>
                    <p className="text-slate-500 text-xs">
                      {new Date(selectedReport.created_at).toLocaleString("fr-FR")}
                      {selectedReport.reconciled_at && (
                        <span className="text-emerald-400 ml-2">• Rapproché par {selectedReport.reconciled_by} le {new Date(selectedReport.reconciled_at).toLocaleString("fr-FR")}</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedReport.status === "submitted" && isAdmin && (
                    <Button
                      onClick={() => reconcile(selectedReport.id)}
                      disabled={reconciling}
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      data-testid="field-stock-reconcile"
                    >
                      {reconciling ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <BadgeCheck className="w-4 h-4 mr-1" />}
                      Rapprocher au stock système
                    </Button>
                  )}
                  {selectedReport.status === "submitted" && (
                    <Button onClick={() => deleteReport(selectedReport.id)} variant="outline" size="sm" className="border-rose-500/30 text-rose-300 hover:bg-rose-500/10" data-testid="field-stock-delete">
                      <Trash2 className="w-4 h-4 mr-1" /> Supprimer
                    </Button>
                  )}
                </div>
              </div>

              {selectedReport.notes && (
                <Card className="bg-slate-950/40 border-slate-800">
                  <CardContent className="p-3">
                    <p className="text-slate-300 text-xs uppercase mb-1">Notes</p>
                    <p className="text-slate-200 text-sm whitespace-pre-wrap">{selectedReport.notes}</p>
                  </CardContent>
                </Card>
              )}

              {/* Stats */}
              <div className={`grid grid-cols-2 ${isAdmin ? 'md:grid-cols-4' : 'md:grid-cols-2'} gap-2`}>
                <Card className="bg-slate-950/40 border-slate-800">
                  <CardContent className="p-3">
                    <p className="text-slate-400 text-[10px] uppercase">Lignes</p>
                    <p className="text-white font-bold text-lg">{selectedReport.items_count}</p>
                  </CardContent>
                </Card>
                <Card className="bg-rose-500/5 border-rose-500/20">
                  <CardContent className="p-3">
                    <p className="text-rose-300 text-[10px] uppercase">Ruptures constatées</p>
                    <p className="text-white font-bold text-lg">{selectedReport.rupture_count || 0}</p>
                  </CardContent>
                </Card>
                {isAdmin && (
                  <Card className="bg-emerald-500/5 border-emerald-500/20">
                    <CardContent className="p-3">
                      <p className="text-emerald-300 text-[10px] uppercase">Écart positif</p>
                      <p className="text-white font-bold text-lg">+{selectedReport.total_ecart_positif || 0}</p>
                    </CardContent>
                  </Card>
                )}
                {isAdmin && (
                  <Card className="bg-amber-500/5 border-amber-500/20">
                    <CardContent className="p-3">
                      <p className="text-amber-300 text-[10px] uppercase">Écart négatif</p>
                      <p className="text-white font-bold text-lg">{selectedReport.total_ecart_negatif || 0}</p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Items */}
              <div className="border border-slate-800 rounded-md max-h-[50vh] overflow-auto bg-slate-950/40">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-900 z-10">
                    <tr className="border-b border-slate-800 text-xs uppercase text-slate-500">
                      <th className="px-3 py-2 text-left">Produit</th>
                      {isAdmin && <th className="px-3 py-2 text-right">Sys. au moment</th>}
                      <th className="px-3 py-2 text-right">Compté</th>
                      {isAdmin && <th className="px-3 py-2 text-right">Écart</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedReport.items.map((it) => {
                      const e = it.ecart || 0;
                      const cls = e > 0 ? "text-emerald-400" : e < 0 ? "text-rose-400" : "text-slate-500";
                      return (
                        <tr key={it.product_id} className="border-b border-slate-800/60">
                          <td className="px-3 py-2 text-slate-200">
                            {it.product_name}
                            {it.counted_qty <= 0 && <Badge className="ml-2 bg-rose-500/15 text-rose-300 text-[10px]">Rupture</Badge>}
                          </td>
                          {isAdmin && <td className="px-3 py-2 text-right text-slate-400 text-xs">{it.system_qty_at_submit} <span className="text-slate-600">{it.unit}</span></td>}
                          <td className="px-3 py-2 text-right text-white">{it.counted_qty} <span className="text-slate-500 text-xs">{it.unit}</span></td>
                          {isAdmin && (
                            <td className={`px-3 py-2 text-right font-bold ${cls}`}>
                              {e > 0 ? "+" : ""}{e}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
    </>
  );

  if (inline) {
    return (
      <>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden" data-testid="field-stock-inline">
          {body}
        </div>
        <QuickAddProductDialog
          open={showAddProd}
          onClose={() => setShowAddProd(false)}
          categories={categories}
          name={newProdName} setName={setNewProdName}
          cat={newProdCat} setCat={setNewProdCat}
          unit={newProdUnit} setUnit={setNewProdUnit}
          qty={newProdQty} setQty={setNewProdQty}
          loading={creatingProd}
          onCreate={createQuickProduct}
        />
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 md:p-6" data-testid="field-stock-modal">
        <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden">
          {body}
        </div>
      </div>
      <QuickAddProductDialog
        open={showAddProd}
        onClose={() => setShowAddProd(false)}
        categories={categories}
        name={newProdName} setName={setNewProdName}
        cat={newProdCat} setCat={setNewProdCat}
        unit={newProdUnit} setUnit={setNewProdUnit}
        qty={newProdQty} setQty={setNewProdQty}
        loading={creatingProd}
        onCreate={createQuickProduct}
      />
    </>
  );
}

// Petit dialog simple pour la création express d'un produit
function QuickAddProductDialog({ open, onClose, categories, name, setName, cat, setCat, unit, setUnit, qty, setQty, loading, onCreate }) {
  if (!open) return null;
  const COMMON_UNITS = [
    "portion", "ration", "unite", "piece",
    "bouteille", "verre", "gobelet", "casier",
    "carton", "boite", "sachet", "sac", "paquet",
    "litre", "centilitre", "millilitre",
    "kg", "g",
    "douzaine", "plat",
  ];
  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3" data-testid="quick-add-product-dialog">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/30">
            <Plus className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold">Nouveau produit (rapide)</h3>
            <p className="text-slate-400 text-xs">Les prix et seuils seront complétés par l'Admin</p>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-slate-300 text-xs mb-1 block">Nom du produit *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: YOUZOU"
              className="bg-slate-950 border-slate-700 text-white"
              data-testid="quick-prod-name"
              autoFocus
            />
          </div>
          <div>
            <label className="text-slate-300 text-xs mb-1 block">Catégorie *</label>
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-white rounded-md px-3 py-2 text-sm"
              data-testid="quick-prod-cat"
            >
              <option value="">— Sélectionner —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-300 text-xs mb-1 block">Unité</label>
              <Input
                list="quick-prod-units-list"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="portion, bouteille, kg..."
                className="bg-slate-950 border-slate-700 text-white"
                data-testid="quick-prod-unit"
              />
              <datalist id="quick-prod-units-list">
                {COMMON_UNITS.map((u) => <option key={u} value={u} />)}
              </datalist>
            </div>
            <div>
              <label className="text-slate-300 text-xs mb-1 block">Quantité comptée</label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="0"
                className="bg-slate-950 border-slate-700 text-white"
                data-testid="quick-prod-qty"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" size="sm" onClick={onClose} className="border-slate-700 text-slate-300" disabled={loading} data-testid="quick-prod-cancel">
            Annuler
          </Button>
          <Button onClick={onCreate} disabled={loading} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="quick-prod-create">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Créer
          </Button>
        </div>
      </div>
    </div>
  );
}
