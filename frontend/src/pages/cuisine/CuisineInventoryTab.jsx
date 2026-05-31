/**
 * CuisineInventoryTab — Inventaire personnel du cuisinier.
 *
 * Isolé du stock administrateur. Le cuisinier saisit ses propres produits
 * et leurs quantités physiques. Polling 15s pour la mise à jour "temps réel".
 *
 * Actions :
 *  - Ajouter un produit (nom + unité + qty + seuil min)
 *  - Mettre à jour la quantité (avec historique des 50 dernières mesures)
 *  - Régler le seuil min (alerte rouge si qty <= seuil)
 *  - Supprimer une ligne
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Boxes, Plus, Pencil, Trash2, AlertTriangle, Search, RefreshCw, Loader2, History, ChevronDown,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const UNIT_OPTIONS = [
  "portion", "pièce", "kg", "g", "L", "cl", "ml", "boîte", "sachet", "bouteille", "carton", "paquet", "bidon",
];

const CuisineInventoryTab = ({ currentUser }) => {
  const owner = currentUser?.full_name || currentUser?.username || "Cuisinier";
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

  // Catalogue exhaustif des produits (pour autocomplétion 3+ lettres)
  const [catalog, setCatalog] = useState([]);
  const [showSuggest, setShowSuggest] = useState(false);

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

  useEffect(() => {
    fetchInventory();
    fetchCatalog();
    const t = setInterval(fetchInventory, 15000);
    return () => clearInterval(t);
  }, [fetchInventory, fetchCatalog]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((it) => (it.product_name || "").toLowerCase().includes(q));
  }, [items, search]);

  // Suggestions catalogue : actif à partir de 3 lettres, max 8 résultats,
  // exclut les produits déjà présents dans l'inventaire perso
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

  return (
    <div className="space-y-3" data-testid="cuisine-inventory-tab">
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
            Inventaire personnel — séparé du stock administrateur. Refresh auto 15s.
          </p>
        </CardContent>
      </Card>

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
                {/* Dropdown suggestions */}
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
                {/* Indicateur < 3 lettres */}
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

      {/* Liste */}
      <Card className="bg-slate-800/60 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-white">
            <Boxes className="w-4 h-4 text-cyan-400" />
            Mon stock ({filtered.length}{filtered.length !== items.length ? ` / ${items.length}` : ""})
            {lowCount > 0 && (
              <Badge className="bg-rose-500/30 text-rose-200 border border-rose-500/40 ml-auto">
                <AlertTriangle className="w-3 h-3 mr-1" /> {lowCount} en alerte
              </Badge>
            )}
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
                    <span className={`font-mono font-bold text-base whitespace-nowrap ${isLow ? "text-rose-200" : "text-cyan-200"}`} data-testid={`inv-qty-${it.id}`}>
                      {it.quantity ?? 0} <span className="text-xs font-normal text-slate-400">{it.unit}</span>
                    </span>
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
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-white flex-1 truncate">{it.product_name}</span>
                    <Input
                      type="number" min="0" step="0.01"
                      value={editQty}
                      onChange={(e) => setEditQty(e.target.value)}
                      className="bg-slate-900 border-slate-700 h-8 text-sm w-20"
                      placeholder="Qté"
                      data-testid={`inv-edit-qty-${it.id}`}
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
    </div>
  );
};

export default CuisineInventoryTab;
