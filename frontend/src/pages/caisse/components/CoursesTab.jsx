/**
 * CoursesTab — Suivi des achats à faire (Restaurant + Réservations).
 *
 * Vue principale :
 *  - Stats globales (total, faits, restant, montant estimé / réel)
 *  - Filtres : scope (Tous / Restaurant / Réservations) + statut (Tous / À faire / Faits)
 *  - Liste groupée par scope avec checkbox "Acheté"
 *  - Au clic checkbox : modal pour saisir prix réel + fournisseur
 *  - Ajout manuel d'un item
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, CheckCircle2, Circle, Trash2, Plus, Calendar, Building2, Filter, RefreshCw, X as XIcon, CheckSquare, Square, Tag, ScanLine, ArrowRight } from 'lucide-react';
import QuickProductPicker from './QuickProductPicker';
import ReceiptScanModal from './ReceiptScanModal';

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND}/api`;
const fmt = (n) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));

const CoursesTab = ({ currentUser }) => {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ total: 0, done: 0, pending: 0, estimated_total: 0, real_total_spent: 0 });
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterScope, setFilterScope] = useState('all'); // all | restaurant | reservation
  const [filterStatus, setFilterStatus] = useState('pending'); // all | pending | done

  // Mark-done modal
  const [markModalItem, setMarkModalItem] = useState(null);
  const [markRealPrice, setMarkRealPrice] = useState('');
  const [markSupplier, setMarkSupplier] = useState('');

  // Add manual item form
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addQty, setAddQty] = useState(1);
  const [addUnitPrice, setAddUnitPrice] = useState('');
  const [addScope, setAddScope] = useState('restaurant');

  // Scan receipt modal
  const [showScan, setShowScan] = useState(false);

  // Multi-select for "Transfer to Achats"
  const [selected, setSelected] = useState({}); // {id: true}
  const [transferring, setTransferring] = useState(false);
  const [transferSupplier, setTransferSupplier] = useState('');
  const [showTransferModal, setShowTransferModal] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterScope !== 'all') params.scope = filterScope;
      if (filterStatus !== 'all') params.status = filterStatus;
      const r = await axios.get(`${API}/shopping-list`, { params });
      setItems(r.data?.items || []);
      setStats(r.data?.stats || { total: 0, done: 0, pending: 0, estimated_total: 0, real_total_spent: 0 });
    } catch {
      setItems([]);
    } finally { setLoading(false); }
  }, [filterScope, filterStatus]);

  useEffect(() => { refresh(); }, [refresh]);

  // Group items by scope (and reservation for clarity)
  const grouped = useMemo(() => {
    const g = { restaurant: [], reservations: {} };
    items.forEach((it) => {
      if (it.scope === 'restaurant') {
        g.restaurant.push(it);
      } else if (it.scope === 'reservation') {
        const key = it.reservation_id || 'unknown';
        if (!g.reservations[key]) {
          g.reservations[key] = { label: it.reservation_label || 'Réservation', items: [] };
        }
        g.reservations[key].items.push(it);
      }
    });
    return g;
  }, [items]);

  const openMarkModal = (item) => {
    setMarkModalItem(item);
    setMarkRealPrice(String(item.estimated_unit_price || ''));
    setMarkSupplier('');
  };

  const confirmMarkDone = async () => {
    if (!markModalItem) return;
    try {
      await axios.post(`${API}/shopping-list/${markModalItem.id}/done`, {
        done_by: currentUser?.full_name || currentUser?.username || 'Gérante',
        real_unit_price: Number(markRealPrice) || 0,
        real_supplier: markSupplier,
      });
      toast.success("Achat enregistré ✅");
      setMarkModalItem(null);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const undoItem = async (id) => {
    try {
      await axios.post(`${API}/shopping-list/${id}/undo`);
      toast.info("Item remis « à acheter »");
      refresh();
    } catch {
      toast.error("Erreur");
    }
  };

  const deleteItem = async (id) => {
    if (!window.confirm("Supprimer cet item de la liste ?")) return;
    try {
      await axios.delete(`${API}/shopping-list/${id}`);
      toast.success("Item supprimé");
      refresh();
    } catch {
      toast.error("Erreur");
    }
  };

  const addItem = async () => {
    if (!addName.trim()) { toast.error("Saisissez un nom d'article"); return; }
    try {
      await axios.post(`${API}/shopping-list`, {
        name: addName,
        quantity: Number(addQty) || 1,
        estimated_unit_price: Number(addUnitPrice) || 0,
        scope: addScope,
        created_by: currentUser?.full_name || currentUser?.username || '',
      });
      toast.success("Article ajouté à la liste");
      setAddName(''); setAddQty(1); setAddUnitPrice('');
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);
  const toggleSelect = (id) => setSelected((s) => ({ ...s, [id]: !s[id] }));
  const selectAllVisible = () => {
    const sel = {};
    items.filter((i) => i.status === 'pending').forEach((i) => { sel[i.id] = true; });
    setSelected(sel);
  };
  const clearSelection = () => setSelected({});

  const handleTransfer = async () => {
    if (selectedIds.length === 0) {
      toast.error("Sélectionnez au moins un article");
      return;
    }
    setTransferring(true);
    try {
      const r = await axios.post(`${API}/shopping-list/to-expense`, {
        item_ids: selectedIds,
        supplier: transferSupplier,
        requested_by: currentUser?.full_name || currentUser?.username || 'Admin',
        requested_by_role: currentUser?.role || 'admin',
        mark_done: true,
      });
      toast.success(`${r.data?.items_transferred || selectedIds.length} articles transférés vers Achats (demande en attente)`, { duration: 6000 });
      setShowTransferModal(false);
      setTransferSupplier('');
      clearSelection();
      refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur lors du transfert");
    } finally { setTransferring(false); }
  };

  const StatusPill = ({ value }) => (
    <Badge className={value === 'done' ? "bg-emerald-500/20 text-emerald-300 text-[10px]" : "bg-amber-500/20 text-amber-200 text-[10px]"}>
      {value === 'done' ? 'Fait' : 'À faire'}
    </Badge>
  );

  const renderItem = (it) => {
    const isDone = it.status === 'done';
    const isSelected = !!selected[it.id];
    return (
      <div
        key={it.id}
        className={`flex items-center gap-2 p-2 rounded border ${isSelected ? 'bg-cyan-900/20 border-cyan-500/50' : isDone ? 'bg-emerald-900/15 border-emerald-500/30' : 'bg-amber-900/10 border-amber-500/30'}`}
        data-testid={`course-item-${it.id}`}
      >
        {!isDone && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelect(it.id)}
            className="w-4 h-4 accent-cyan-500 flex-shrink-0"
            data-testid={`select-${it.id}`}
            title="Sélectionner pour transférer en Achat"
          />
        )}
        <button
          type="button"
          onClick={() => isDone ? undoItem(it.id) : openMarkModal(it)}
          className={`flex-shrink-0 ${isDone ? 'text-emerald-400 hover:text-emerald-300' : 'text-amber-300 hover:text-amber-200'}`}
          title={isDone ? "Cliquer pour annuler" : "Cliquer pour marquer comme acheté"}
          data-testid={`course-toggle-${it.id}`}
        >
          {isDone ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-semibold ${isDone ? 'text-emerald-100 line-through opacity-80' : 'text-white'}`}>
              {it.name}
            </span>
            <span className="text-slate-400 text-xs">
              {fmt(it.quantity)} {it.unit || ''} × {fmt(it.estimated_unit_price)} F = <strong>{fmt(it.estimated_total)} F</strong>
            </span>
            {it.category && <Badge className="bg-slate-700 text-slate-300 text-[10px]">{it.category}</Badge>}
            <StatusPill value={it.status} />
          </div>
          {isDone && (
            <div className="text-xs text-emerald-300 mt-0.5">
              Acheté par <strong>{it.done_by}</strong>
              {it.done_at && (
                <> · {format(new Date(it.done_at), 'dd/MM HH:mm', { locale: fr })}</>
              )}
              {it.real_supplier && <> · <strong>{it.real_supplier}</strong></>}
              {(it.real_unit_price ?? null) !== null && it.real_unit_price !== it.estimated_unit_price && (
                <> · PU réel <strong>{fmt(it.real_unit_price)} F</strong> (estimé {fmt(it.estimated_unit_price)} F)</>
              )}
            </div>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={() => deleteItem(it.id)} className="text-red-400 hover:text-red-300 hover:bg-red-500/20 h-7 w-7 p-0 flex-shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  };

  const progress = stats.total > 0 ? (stats.done / stats.total) * 100 : 0;

  return (
    <div className="space-y-4" data-testid="courses-tab">
      {/* Header / Stats */}
      <Card className="bg-gradient-to-br from-amber-900/30 to-orange-900/20 border-amber-500/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-white flex items-center gap-2 flex-wrap justify-between">
            <span className="flex items-center gap-2">
              <ShoppingCart className="w-6 h-6 text-amber-400" />
              Appro Manager
              <Badge className="bg-amber-500/30 text-amber-100">{stats.done} / {stats.total}</Badge>
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button size="sm" onClick={() => setShowScan(true)} className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white h-8" data-testid="appro-scan-btn">
                <ScanLine className="w-3.5 h-3.5 mr-1" /> Scanner un reçu
              </Button>
              <Button size="sm" onClick={refresh} variant="outline" className="border-amber-500/40 text-amber-200 hover:bg-amber-500/10 h-8">
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Actualiser
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-slate-800/50 rounded p-2 text-center">
              <div className="text-slate-400 text-[10px] uppercase">À acheter</div>
              <div className="text-amber-200 font-bold text-lg">{stats.pending}</div>
            </div>
            <div className="bg-slate-800/50 rounded p-2 text-center">
              <div className="text-slate-400 text-[10px] uppercase">Achetés</div>
              <div className="text-emerald-300 font-bold text-lg">{stats.done}</div>
            </div>
            <div className="bg-slate-800/50 rounded p-2 text-center">
              <div className="text-slate-400 text-[10px] uppercase">Coût estimé</div>
              <div className="text-white font-bold text-lg">{fmt(stats.estimated_total)} F</div>
            </div>
            <div className="bg-slate-800/50 rounded p-2 text-center">
              <div className="text-slate-400 text-[10px] uppercase">Dépensé réel</div>
              <div className="text-emerald-300 font-bold text-lg">{fmt(stats.real_total_spent)} F</div>
            </div>
          </div>
          <div className="mt-3 h-2 bg-slate-800/60 rounded-full overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="bg-slate-900/60 border-slate-700">
        <CardContent className="py-3 flex items-center gap-2 flex-wrap">
          <span className="text-slate-400 text-xs flex items-center gap-1"><Filter className="w-3.5 h-3.5" />Filtrer :</span>
          <div className="flex gap-1">
            {['all', 'restaurant', 'reservation'].map((v) => (
              <button key={v} type="button" onClick={() => setFilterScope(v)} className={`text-[11px] px-2 py-1 rounded-full ${filterScope === v ? 'bg-amber-500 text-slate-900 font-semibold' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`} data-testid={`filter-scope-${v}`}>
                {v === 'all' ? 'Tous' : v === 'restaurant' ? '🍳 Restaurant' : '🎉 Réservations'}
              </button>
            ))}
          </div>
          <span className="text-slate-600 mx-1">|</span>
          <div className="flex gap-1">
            {['pending', 'done', 'all'].map((v) => (
              <button key={v} type="button" onClick={() => setFilterStatus(v)} className={`text-[11px] px-2 py-1 rounded-full ${filterStatus === v ? 'bg-amber-500 text-slate-900 font-semibold' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`} data-testid={`filter-status-${v}`}>
                {v === 'all' ? 'Tous' : v === 'pending' ? 'À acheter' : 'Achetés'}
              </button>
            ))}
          </div>
          <span className="ml-auto flex gap-1.5 flex-wrap">
            <Button size="sm" onClick={() => setShowAdd((s) => !s)} className="bg-amber-600 hover:bg-amber-700 text-white h-8" data-testid="course-add-toggle">
              <Plus className="w-3.5 h-3.5 mr-1" /> {showAdd ? 'Fermer' : 'Ajouter un article'}
            </Button>
          </span>
        </CardContent>
      </Card>

      {/* Sélection multi + bouton Transférer en Achat */}
      <Card className="bg-slate-900/60 border-slate-700">
        <CardContent className="py-2 flex items-center gap-2 flex-wrap text-sm">
          <button type="button" onClick={selectAllVisible} className="text-cyan-300 hover:text-cyan-200 text-xs underline" data-testid="appro-select-all">
            Tout sélectionner (à acheter)
          </button>
          <span className="text-slate-600 mx-1">·</span>
          <button type="button" onClick={clearSelection} className="text-slate-400 hover:text-white text-xs underline">
            Vider la sélection
          </button>
          <span className="text-slate-300 ml-2">
            <strong className="text-amber-300">{selectedIds.length}</strong> sélectionné(s)
          </span>
          <Button
            size="sm"
            onClick={() => setShowTransferModal(true)}
            disabled={selectedIds.length === 0}
            className="bg-cyan-600 hover:bg-cyan-700 text-white h-8 ml-auto"
            data-testid="appro-transfer-btn"
          >
            <ArrowRight className="w-3.5 h-3.5 mr-1" /> Transférer en Achat ({selectedIds.length})
          </Button>
        </CardContent>
      </Card>

      {/* Ajout manuel */}
      {showAdd && (
        <Card className="bg-amber-900/15 border-amber-500/30">
          <CardContent className="py-3 space-y-2">
            <div className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-12 sm:col-span-4">
                <Label className="text-xs text-slate-400">Nom *</Label>
                <Input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Ex: Oignons" className="bg-slate-800 border-slate-700 text-white h-9" data-testid="course-add-name" />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <Label className="text-xs text-slate-400">Qté</Label>
                <Input type="number" value={addQty} onChange={(e) => setAddQty(e.target.value)} className="bg-slate-800 border-slate-700 text-white h-9" />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <Label className="text-xs text-slate-400">PU estimé</Label>
                <Input type="number" value={addUnitPrice} onChange={(e) => setAddUnitPrice(e.target.value)} placeholder="0" className="bg-slate-800 border-slate-700 text-white h-9" />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <Label className="text-xs text-slate-400">Scope</Label>
                <select value={addScope} onChange={(e) => setAddScope(e.target.value)} className="w-full bg-slate-800 border border-slate-700 text-white rounded h-9 px-2 text-sm">
                  <option value="restaurant">🍳 Restaurant</option>
                  <option value="reservation">🎉 Réservation</option>
                </select>
              </div>
              <div className="col-span-12 sm:col-span-2">
                <Button onClick={addItem} className="w-full bg-amber-600 hover:bg-amber-700 h-9" data-testid="course-add-submit">
                  <Plus className="w-4 h-4 mr-1" /> Ajouter
                </Button>
              </div>
            </div>
            {/* Quick picker pour suggérer */}
            <QuickProductPicker
              dataTestidPrefix="course-qpp"
              onPick={(p) => {
                setAddName(p.unit ? `${p.name} (${p.unit})` : p.name);
                setAddUnitPrice(String(p.unit_cost || ''));
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Liste — Restaurant */}
      {(filterScope === 'all' || filterScope === 'restaurant') && grouped.restaurant.length > 0 && (
        <Card className="bg-slate-900/60 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base flex items-center gap-2">
              <Building2 className="w-5 h-5 text-amber-300" /> Restaurant
              <Badge className="bg-amber-500/30 text-amber-200 text-[10px]">{grouped.restaurant.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {grouped.restaurant.map(renderItem)}
          </CardContent>
        </Card>
      )}

      {/* Liste — Réservations */}
      {(filterScope === 'all' || filterScope === 'reservation') && Object.entries(grouped.reservations).map(([resId, payload]) => (
        <Card key={resId} className="bg-slate-900/60 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-300" /> {payload.label}
              <Badge className="bg-purple-500/30 text-purple-200 text-[10px]">{payload.items.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {payload.items.map(renderItem)}
          </CardContent>
        </Card>
      ))}

      {/* Empty */}
      {items.length === 0 && (
        <Card className="bg-slate-900/60 border-slate-700">
          <CardContent className="py-10 text-center text-slate-500">
            <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p>Aucun article dans la liste pour ce filtre.</p>
            <p className="text-xs mt-1">Ajoutez un article ou importez depuis une demande d'achat.</p>
          </CardContent>
        </Card>
      )}

      {/* Modal — Scan reçu */}
      <ReceiptScanModal
        open={showScan}
        onClose={() => setShowScan(false)}
        currentUser={currentUser}
        target="appro"
        onCreated={() => refresh()}
      />

      {/* Modal — Transférer en Achat */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowTransferModal(false)}>
          <Card className="bg-slate-900 border-cyan-500/40 w-full max-w-md" onClick={(e) => e.stopPropagation()} data-testid="appro-transfer-modal">
            <CardHeader className="pb-2 border-b border-slate-700">
              <CardTitle className="text-white text-base flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <ArrowRight className="w-5 h-5 text-cyan-400" />
                  Transférer en demande d'achat
                </span>
                <Button size="sm" variant="ghost" onClick={() => setShowTransferModal(false)} className="text-slate-300 h-7 w-7 p-0">
                  <XIcon className="w-4 h-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              <div className="bg-slate-800/50 rounded p-2 text-sm">
                <strong className="text-cyan-300">{selectedIds.length}</strong> article(s) seront transférés vers <strong className="text-white">Achats</strong> sous forme d'une nouvelle <strong>demande d'achat</strong> en attente de validation Admin.
              </div>
              <div>
                <Label className="text-slate-300 text-sm">Fournisseur (optionnel)</Label>
                <Input
                  value={transferSupplier}
                  onChange={(e) => setTransferSupplier(e.target.value)}
                  placeholder="Laisser vide pour détection auto"
                  className="bg-slate-800 border-slate-700 text-white"
                  data-testid="transfer-supplier"
                />
                <p className="text-slate-500 text-[11px] mt-1">Si vide : reprend le fournisseur du scan (si commun) ou « Multi ».</p>
              </div>
              <div className="bg-amber-900/15 border border-amber-500/20 rounded p-2 text-xs text-amber-300">
                ⚠️ Une fois transférés, les articles seront marqués comme <strong>achetés</strong> dans Appro Manager et la demande d'achat sera soumise à validation Admin.
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setShowTransferModal(false)} className="border-slate-700 text-slate-300">Annuler</Button>
                <Button onClick={handleTransfer} disabled={transferring} className="bg-cyan-600 hover:bg-cyan-700" data-testid="appro-transfer-confirm">
                  <ArrowRight className="w-4 h-4 mr-1" /> {transferring ? "Transfert..." : "Confirmer le transfert"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal — Marquer comme acheté */}
      {markModalItem && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setMarkModalItem(null)}>
          <Card className="bg-slate-900 border-emerald-500/40 w-full max-w-md" onClick={(e) => e.stopPropagation()} data-testid="course-done-modal">
            <CardHeader className="pb-2 border-b border-slate-700">
              <CardTitle className="text-white text-base flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  Marquer comme acheté
                </span>
                <Button size="sm" variant="ghost" onClick={() => setMarkModalItem(null)} className="text-slate-300 h-7 w-7 p-0">
                  <XIcon className="w-4 h-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              <div className="bg-slate-800/50 rounded p-2 text-sm">
                <p className="text-white font-semibold">{markModalItem.name}</p>
                <p className="text-slate-400 text-xs">
                  {fmt(markModalItem.quantity)} × {fmt(markModalItem.estimated_unit_price)} F (estimé)
                </p>
              </div>
              <div>
                <Label className="text-slate-300 text-sm flex items-center gap-1"><Tag className="w-3.5 h-3.5" />Prix unitaire réel payé</Label>
                <Input type="number" value={markRealPrice} onChange={(e) => setMarkRealPrice(e.target.value)} className="bg-slate-800 border-slate-700 text-white" data-testid="course-mark-price" />
              </div>
              <div>
                <Label className="text-slate-300 text-sm">Fournisseur (où acheté)</Label>
                <Input value={markSupplier} onChange={(e) => setMarkSupplier(e.target.value)} placeholder="Ex: Dantokpa, Champion..." className="bg-slate-800 border-slate-700 text-white" data-testid="course-mark-supplier" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setMarkModalItem(null)} className="border-slate-700 text-slate-300">Annuler</Button>
                <Button onClick={confirmMarkDone} className="bg-emerald-600 hover:bg-emerald-700" data-testid="course-mark-confirm">
                  <CheckCircle2 className="w-4 h-4 mr-1" /> Confirmer
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CoursesTab;
