/**
 * CuisineStockTab — Onglet "Stock" du profil cuisinier.
 *
 * Fusion de l'ancien "Mon stock" (inventaire personnel) + "Besoin cuisine"
 * (transmission de listes à l'admin).
 *
 * Workflow :
 *  1. Le cuisinier renseigne son stock physique (autocomplétion 3+ lettres
 *     sur le catalogue cuisine) — séparé du stock Admin.
 *  2. Il décrémente manuellement (édition de la quantité observée).
 *  3. Une section "Alerte stock" liste automatiquement les produits en rupture
 *     ou proches du seuil. Le cuisinier coche ceux à réapprovisionner.
 *  4. Bouton "Envoyer la liste à l'administrateur" : crée un Besoin (status=pending)
 *     côté admin avec badge urgent côté Caisse.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Boxes, Plus, Pencil, Trash2, AlertTriangle, Search, RefreshCw, Loader2,
  History, ChevronDown, Send, ChefHat, Clock, CheckCircle2, Eye, XCircle,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const UNIT_OPTIONS = [
  "portion", "pièce", "kg", "g", "L", "cl", "ml", "boîte", "sachet", "bouteille", "carton", "paquet", "bidon",
];

const STATUS_META = {
  pending:   { label: "En attente",    Icon: Clock,        cls: "bg-amber-500/20 text-amber-200" },
  seen:      { label: "Vu Admin",      Icon: Eye,          cls: "bg-blue-500/20 text-blue-200" },
  fulfilled: { label: "Approvisionné", Icon: CheckCircle2, cls: "bg-emerald-500/20 text-emerald-200" },
  rejected:  { label: "Refusé",        Icon: XCircle,      cls: "bg-rose-500/20 text-rose-200" },
};

const CuisineStockTab = ({ currentUser }) => {
  const owner = currentUser?.full_name || currentUser?.username || "Cuisinier";

  // Inventaire perso
  const [items, setItems] = useState([]);
  const [lowCount, setLowCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ product_name: "", unit: "portion", quantity: 0, low_threshold: 5, notes: "" });
  const [editingId, setEditingId] = useState(null);
  const [editQty, setEditQty] = useState("");
  const [editThreshold, setEditThreshold] = useState("");
  const [historyOpen, setHistoryOpen] = useState(null);

  // Catalogue produits (autocomplétion 3+ lettres)
  const [catalog, setCatalog] = useState([]);
  const [showSuggest, setShowSuggest] = useState(false);

  // Sélection pour envoi à l'admin
  const [selectedForAdmin, setSelectedForAdmin] = useState({}); // {itemId: qty}
  const [adminNotes, setAdminNotes] = useState("");
  const [urgency, setUrgency] = useState("normal");
  const [submittingNeed, setSubmittingNeed] = useState(false);

  // Historique besoins transmis
  const [needsHistory, setNeedsHistory] = useState([]);

  const fetchCatalog = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/cuisine/products`);
      setCatalog(r.data.products || []);
    } catch {}
  }, []);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/cuisine/inventory`, { params: { owner } });
      setItems(r.data.items || []);
      setLowCount(r.data.low_count || 0);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur de chargement");
    } finally { setLoading(false); }
  }, [owner]);

  const fetchNeedsHistory = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/cuisine/needs`, { params: { requested_by: owner, limit: 10 } });
      setNeedsHistory(r.data.items || []);
    } catch {}
  }, [owner]);

  useEffect(() => {
    fetchInventory();
    fetchCatalog();
    fetchNeedsHistory();
    const t = setInterval(() => { fetchInventory(); fetchNeedsHistory(); }, 15000);
    return () => clearInterval(t);
  }, [fetchInventory, fetchCatalog, fetchNeedsHistory]);

  // Items en alerte (rupture ou proche seuil)
  const lowItems = useMemo(() => {
    return items.filter((it) => (it.low_threshold || 0) > 0 && (it.quantity || 0) <= (it.low_threshold || 0));
  }, [items]);

  const ruptureItems = useMemo(() => lowItems.filter((i) => (i.quantity || 0) <= 0), [lowItems]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((it) => (it.product_name || "").toLowerCase().includes(q));
  }, [items, search]);

  const suggestions = useMemo(() => {
    const q = (form.product_name || "").trim().toLowerCase();
    if (q.length < 3) return [];
    const ownedNames = new Set(items.map((i) => (i.product_name || "").toLowerCase()));
    return catalog
      .filter((p) => p.name.toLowerCase().includes(q) && !ownedNames.has(p.name.toLowerCase()))
      .slice(0, 8);
  }, [catalog, form.product_name, items]);

  const pickSuggestion = (p) => {
    setForm({ ...form, product_name: p.name, unit: p.unit || form.unit });
    setShowSuggest(false);
  };

  const addItem = async () => {
    const name = form.product_name.trim();
    if (!name) return toast.error("Nom du produit requis");
    try {
      await axios.post(`${API}/cuisine/inventory`, { ...form, product_name: name, owner });
      toast.success(`${name} ajouté à votre stock`);
      setForm({ product_name: "", unit: "portion", quantity: 0, low_threshold: 5, notes: "" });
      setShowAdd(false);
      fetchInventory();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const saveEdit = async (id) => {
    const qty = Number(editQty);
    const thr = editThreshold === "" ? undefined : Number(editThreshold);
    if (!Number.isFinite(qty) || qty < 0) return toast.error("Quantité invalide");
    try {
      await axios.patch(`${API}/cuisine/inventory/${id}`, {
        quantity: qty,
        low_threshold: thr,
        by: owner,
        action: "update",
      });
      setEditingId(null);
      fetchInventory();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const deleteItem = async (id, name) => {
    if (!window.confirm(`Supprimer "${name}" de votre inventaire ?`)) return;
    try {
      await axios.delete(`${API}/cuisine/inventory/${id}`, { params: { owner } });
      fetchInventory();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  // ----- Sélection / envoi à l'admin -----
  const toggleSelectForAdmin = (it) => {
    setSelectedForAdmin((prev) => {
      const next = { ...prev };
      if (next[it.id] != null) {
        delete next[it.id];
      } else {
        // Suggestion de qté = différence pour atteindre 2 × seuil (ou 5 par défaut)
        const suggested = Math.max(1, Math.ceil(((it.low_threshold || 5) * 2) - (it.quantity || 0)));
        next[it.id] = suggested;
      }
      return next;
    });
  };

  const updateSelectedQty = (id, val) => {
    const q = Number(val);
    setSelectedForAdmin((prev) => ({ ...prev, [id]: Number.isFinite(q) && q > 0 ? q : 0 }));
  };

  const selectAllLow = () => {
    const next = {};
    lowItems.forEach((it) => {
      const suggested = Math.max(1, Math.ceil(((it.low_threshold || 5) * 2) - (it.quantity || 0)));
      next[it.id] = suggested;
    });
    setSelectedForAdmin(next);
  };

  const clearSelection = () => setSelectedForAdmin({});

  const selectedItems = useMemo(() => {
    return items
      .filter((it) => selectedForAdmin[it.id] != null && selectedForAdmin[it.id] > 0)
      .map((it) => ({
        product_name: it.product_name,
        quantity: selectedForAdmin[it.id],
        unit: it.unit || "",
        observed_stock: it.quantity ?? 0,
        note: (it.quantity || 0) <= 0 ? "RUPTURE" : "Stock bas",
      }));
  }, [items, selectedForAdmin]);

  const sendNeedToAdmin = async () => {
    if (selectedItems.length === 0) return toast.error("Cochez au moins un produit à demander");
    setSubmittingNeed(true);
    try {
      await axios.post(`${API}/cuisine/needs`, {
        requested_by: owner,
        items: selectedItems,
        urgency,
        notes: adminNotes.trim(),
      });
      toast.success(`Liste envoyée à l'administrateur (${selectedItems.length} produit${selectedItems.length > 1 ? "s" : ""})`);
      setSelectedForAdmin({});
      setAdminNotes("");
      setUrgency("normal");
      fetchNeedsHistory();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur d'envoi");
    } finally {
      setSubmittingNeed(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="cuisine-stock-tab">
      {/* Bandeau résumé */}
      <Card className="bg-gradient-to-br from-cyan-900/40 to-blue-900/30 border-cyan-500/40">
        <CardContent className="p-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] uppercase text-cyan-300/80 tracking-wider">Produits</p>
              <p className="text-xl font-bold text-white" data-testid="stat-inv-total">{items.length}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-rose-300/80 tracking-wider">En alerte</p>
              <p className="text-xl font-bold text-rose-200" data-testid="stat-inv-low">{lowCount}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-emerald-300/80 tracking-wider">À jour</p>
              <p className="text-xl font-bold text-emerald-200">{items.length - lowCount}</p>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 text-center mt-2 italic">
            Inventaire personnel — décrémentation manuelle. Refresh auto 15s.
          </p>
        </CardContent>
      </Card>

      {/* ALERTE STOCK + envoi à l'admin */}
      {lowItems.length > 0 && (
        <Card className="bg-rose-950/30 border-rose-500/50" data-testid="cuisine-stock-alerts">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-rose-200 flex-wrap">
              <AlertTriangle className="w-4 h-4 animate-pulse" />
              Alerte stock — {lowItems.length} produit{lowItems.length > 1 ? "s" : ""}
              {ruptureItems.length > 0 && (
                <Badge className="bg-rose-500/40 text-rose-100">{ruptureItems.length} en rupture</Badge>
              )}
              <div className="ml-auto flex gap-1">
                <Button
                  variant="ghost" size="sm"
                  onClick={selectAllLow}
                  className="h-7 text-[10px] text-rose-100 hover:bg-rose-500/20"
                  data-testid="select-all-low-btn"
                >
                  Tout cocher
                </Button>
                {Object.keys(selectedForAdmin).length > 0 && (
                  <Button
                    variant="ghost" size="sm"
                    onClick={clearSelection}
                    className="h-7 text-[10px] text-slate-300"
                  >
                    Vider
                  </Button>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {lowItems.map((it) => {
              const isRupture = (it.quantity || 0) <= 0;
              const checked = selectedForAdmin[it.id] != null;
              return (
                <div
                  key={it.id}
                  className={`flex items-center gap-2 rounded px-2 py-1.5 ${
                    isRupture ? "bg-rose-950/50 border border-rose-500/40" : "bg-amber-950/30 border border-amber-500/30"
                  }`}
                  data-testid={`alert-row-${it.id}`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleSelectForAdmin(it)}
                    className="border-rose-400"
                    data-testid={`alert-check-${it.id}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{it.product_name}</p>
                    <p className="text-[10px] text-slate-400">
                      {isRupture ? (
                        <span className="text-rose-300 font-semibold">RUPTURE</span>
                      ) : (
                        <span className="text-amber-300">Stock bas</span>
                      )}
                      {" "}· Reste {it.quantity ?? 0} {it.unit} · Seuil {it.low_threshold || 0}
                    </p>
                  </div>
                  {checked && (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number" min="0" step="0.5"
                        value={selectedForAdmin[it.id]}
                        onChange={(e) => updateSelectedQty(it.id, e.target.value)}
                        className="w-16 h-7 text-xs bg-slate-900 border-slate-700"
                        data-testid={`alert-qty-${it.id}`}
                      />
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">{it.unit}</span>
                    </div>
                  )}
                </div>
              );
            })}

            {Object.keys(selectedForAdmin).length > 0 && (
              <div className="mt-2 pt-2 border-t border-rose-500/30 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm" variant={urgency === "normal" ? "default" : "ghost"}
                    onClick={() => setUrgency("normal")}
                    className={`h-7 text-[11px] ${urgency === "normal" ? "bg-blue-600 hover:bg-blue-700" : "text-slate-300"}`}
                    data-testid="urgency-normal"
                  >
                    Normal
                  </Button>
                  <Button
                    size="sm" variant={urgency === "urgent" ? "default" : "ghost"}
                    onClick={() => setUrgency("urgent")}
                    className={`h-7 text-[11px] ${urgency === "urgent" ? "bg-rose-600 hover:bg-rose-700 animate-pulse" : "text-slate-300"}`}
                    data-testid="urgency-urgent"
                  >
                    <AlertTriangle className="w-3 h-3 mr-1" /> Urgent
                  </Button>
                </div>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Note pour l'administrateur (optionnel)"
                  className="bg-slate-900 border-slate-700 text-white text-xs min-h-[50px]"
                  data-testid="need-admin-notes"
                />
                <Button
                  onClick={sendNeedToAdmin}
                  disabled={submittingNeed || selectedItems.length === 0}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 h-9"
                  data-testid="send-need-btn"
                >
                  {submittingNeed
                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    : <Send className="w-4 h-4 mr-2" />}
                  Envoyer la liste à l'administrateur ({selectedItems.length})
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recherche + Ajout */}
      <Card className="bg-slate-800/60 border-slate-700">
        <CardContent className="p-2 space-y-2">
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
              <Input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un produit…"
                className="bg-slate-900 border-slate-700 h-9 text-sm pl-7"
                data-testid="inventory-search"
              />
            </div>
            <Button
              onClick={fetchInventory} variant="ghost" size="sm" disabled={loading}
              className="text-slate-300 h-9 px-2"
              data-testid="inventory-refresh"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
            <Button
              onClick={() => setShowAdd((s) => !s)}
              className="bg-cyan-600 hover:bg-cyan-700 text-white h-9 px-3 text-sm"
              data-testid="inventory-toggle-add"
            >
              <Plus className="w-4 h-4 mr-1" /> Ajouter
            </Button>
          </div>

          {showAdd && (
            <div className="bg-slate-900/60 border border-cyan-500/30 rounded p-2 space-y-2" data-testid="inventory-add-form">
              <div className="relative">
                <Input
                  value={form.product_name}
                  onChange={(e) => { setForm({ ...form, product_name: e.target.value }); setShowSuggest(true); }}
                  onFocus={() => setShowSuggest(true)}
                  onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
                  placeholder="Tapez 3 lettres pour rechercher un produit…"
                  className="bg-slate-900 border-slate-700 h-9 text-sm pr-7"
                  data-testid="inventory-name-input"
                />
                {form.product_name.trim().length >= 3 && (
                  <ChevronDown className="w-4 h-4 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2" />
                )}
                {showSuggest && suggestions.length > 0 && (
                  <div
                    className="absolute z-20 mt-1 left-0 right-0 bg-slate-800 border border-cyan-500/40 rounded shadow-lg max-h-[240px] overflow-y-auto"
                    data-testid="inventory-suggestions"
                  >
                    {suggestions.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); pickSuggestion(p); }}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-white text-sm hover:bg-cyan-600/30 border-b border-slate-700 last:border-b-0"
                        data-testid={`suggest-${p.id}`}
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="text-[10px] text-slate-400 shrink-0">({p.unit})</span>
                      </button>
                    ))}
                  </div>
                )}
                {form.product_name.trim().length > 0 && form.product_name.trim().length < 3 && (
                  <p className="text-[10px] text-amber-400 mt-1 italic">
                    Tapez au moins 3 lettres pour voir les suggestions…
                  </p>
                )}
                {showSuggest && form.product_name.trim().length >= 3 && suggestions.length === 0 && (
                  <p className="text-[10px] text-slate-400 mt-1 italic">
                    Aucun produit trouvé — vous pouvez tout de même ajouter ce nom personnalisé.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <select
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="bg-slate-900 border border-slate-700 rounded h-9 text-sm text-white px-2"
                  data-testid="inventory-unit-select"
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u} value={u} className="bg-slate-800">{u}</option>
                  ))}
                </select>
                <Input
                  type="number" min="0" step="0.01"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                  placeholder="Qté"
                  className="bg-slate-900 border-slate-700 h-9 text-sm"
                  data-testid="inventory-qty-input"
                />
                <Input
                  type="number" min="0" step="0.01"
                  value={form.low_threshold}
                  onChange={(e) => setForm({ ...form, low_threshold: Number(e.target.value) })}
                  placeholder="Seuil"
                  className="bg-slate-900 border-slate-700 h-9 text-sm"
                  data-testid="inventory-threshold-input"
                />
              </div>
              <Button
                onClick={addItem}
                disabled={!form.product_name.trim()}
                className="w-full bg-cyan-600 hover:bg-cyan-700 h-9 text-sm"
                data-testid="inventory-add-submit"
              >
                Ajouter à mon stock
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Liste complète du stock */}
      <Card className="bg-slate-800/60 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-white">
            <Boxes className="w-4 h-4 text-cyan-400" />
            Mon stock ({filtered.length}{filtered.length !== items.length ? ` / ${items.length}` : ""})
            <span className="text-[10px] text-slate-400 ml-auto italic hidden sm:inline">
              Cliquez sur la quantité pour décrémenter manuellement
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {filtered.length === 0 && !loading && (
            <p className="text-xs text-slate-500 italic text-center py-4">
              {items.length === 0 ? "Votre inventaire est vide. Cliquez sur Ajouter." : "Aucun résultat."}
            </p>
          )}
          {filtered.map((it) => {
            const isLow = (it.low_threshold || 0) > 0 && (it.quantity || 0) <= (it.low_threshold || 0);
            const isEditing = editingId === it.id;
            const showHist = historyOpen === it.id;
            return (
              <div
                key={it.id}
                className={`rounded border px-2.5 py-1.5 ${isLow ? "bg-rose-900/20 border-rose-500/40" : "bg-slate-900/40 border-slate-700"}`}
                data-testid={`inv-item-${it.id}`}
              >
                {!isEditing ? (
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate flex items-center gap-1.5">
                        {it.product_name}
                        {isLow && <AlertTriangle className="w-3.5 h-3.5 text-rose-300" />}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        Seuil : {it.low_threshold || 0} {it.unit} · Maj{" "}
                        {it.last_observed_at ? new Date(it.last_observed_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(it.id);
                        setEditQty(String(it.quantity ?? 0));
                        setEditThreshold(String(it.low_threshold ?? 0));
                      }}
                      className={`font-mono font-bold text-base whitespace-nowrap px-2 py-0.5 rounded hover:bg-slate-700/50 ${isLow ? "text-rose-200" : "text-cyan-200"}`}
                      data-testid={`inv-qty-${it.id}`}
                      title="Cliquer pour décrémenter / modifier"
                    >
                      {it.quantity ?? 0} <span className="text-xs font-normal text-slate-400">{it.unit}</span>
                    </button>
                    <div className="flex gap-0.5">
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => {
                          setEditingId(it.id);
                          setEditQty(String(it.quantity ?? 0));
                          setEditThreshold(String(it.low_threshold ?? 0));
                        }}
                        className="h-7 w-7 p-0 text-cyan-300 hover:bg-cyan-500/10"
                        data-testid={`inv-edit-${it.id}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => setHistoryOpen(showHist ? null : it.id)}
                        className="h-7 w-7 p-0 text-slate-400 hover:bg-slate-700"
                      >
                        <History className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => deleteItem(it.id, it.product_name)}
                        className="h-7 w-7 p-0 text-rose-400 hover:bg-rose-500/10"
                        data-testid={`inv-del-${it.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <span className="text-sm font-medium text-white truncate block">{it.product_name}</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Input
                        type="number" min="0" step="0.01"
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                        className="bg-slate-900 border-slate-700 h-8 text-sm w-20"
                        placeholder="Qté"
                        data-testid={`inv-edit-qty-${it.id}`}
                        autoFocus
                      />
                      <span className="text-xs text-slate-400">{it.unit}</span>
                      <Input
                        type="number" min="0" step="0.01"
                        value={editThreshold}
                        onChange={(e) => setEditThreshold(e.target.value)}
                        className="bg-slate-900 border-slate-700 h-8 text-sm w-20"
                        placeholder="Seuil"
                        title="Seuil d'alerte"
                      />
                      <Button size="sm" onClick={() => saveEdit(it.id)} className="h-8 bg-emerald-600 hover:bg-emerald-700 text-xs">OK</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-8 text-slate-400 text-xs">Annuler</Button>
                    </div>
                    {/* Boutons rapides de décrémentation */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[10px] text-slate-400">Rapide :</span>
                      {[1, 2, 5, 10].map((d) => (
                        <Button
                          key={d}
                          size="sm" variant="ghost"
                          onClick={() => setEditQty(String(Math.max(0, Number(editQty || 0) - d)))}
                          className="h-6 text-[10px] px-1.5 text-rose-300 hover:bg-rose-500/10 border border-rose-500/30"
                          data-testid={`inv-quick-dec-${it.id}-${d}`}
                        >
                          -{d}
                        </Button>
                      ))}
                      {[1, 5].map((d) => (
                        <Button
                          key={`p${d}`}
                          size="sm" variant="ghost"
                          onClick={() => setEditQty(String(Number(editQty || 0) + d))}
                          className="h-6 text-[10px] px-1.5 text-emerald-300 hover:bg-emerald-500/10 border border-emerald-500/30"
                        >
                          +{d}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {showHist && (
                  <div className="mt-1.5 pt-1.5 border-t border-slate-700/60 space-y-0.5 text-[10px] text-slate-400">
                    <p className="font-semibold text-slate-300">Historique (5 derniers) :</p>
                    {((it.history || []).slice(-5).reverse()).map((h, i) => (
                      <p key={i}>
                        {h.at?.slice(11, 16) || ""}{" "}
                        {h.previous_qty != null && `${h.previous_qty} → `}
                        <b>{h.qty}</b> {it.unit} · {h.by} · {h.action}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Historique des besoins transmis */}
      {needsHistory.length > 0 && (
        <Card className="bg-slate-800/40 border-slate-700" data-testid="needs-history-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-200">
              <ChefHat className="w-4 h-4 text-amber-300" />
              Mes listes envoyées ({needsHistory.length})
              <Button
                variant="ghost" size="sm" onClick={fetchNeedsHistory}
                className="ml-auto h-6 w-6 p-0 text-slate-400"
              >
                <RefreshCw className="w-3 h-3" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {needsHistory.slice(0, 5).map((n) => {
              const meta = STATUS_META[n.status] || STATUS_META.pending;
              const Ic = meta.Icon;
              return (
                <div key={n.id} className="rounded border border-slate-700 bg-slate-900/40 px-2 py-1.5 text-xs">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <Badge className={meta.cls}>
                      <Ic className="w-3 h-3 mr-1 inline" /> {meta.label}
                    </Badge>
                    {n.urgency === "urgent" && (
                      <Badge className="bg-rose-500/30 text-rose-200">URGENT</Badge>
                    )}
                    <span className="text-slate-400 text-[10px] ml-auto">
                      {n.requested_at ? new Date(n.requested_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : ""}
                    </span>
                  </div>
                  <p className="text-slate-300">
                    {n.items_count} produit{n.items_count > 1 ? "s" : ""} · {(n.items || []).map((i) => i.product_name).slice(0, 3).join(", ")}
                    {(n.items || []).length > 3 && ` +${(n.items || []).length - 3}`}
                  </p>
                  {n.rejection_reason && (
                    <p className="text-rose-300 text-[10px] italic mt-0.5">Refusé : {n.rejection_reason}</p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CuisineStockTab;
