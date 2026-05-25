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
import PaymentModeTransferPanel from "./PaymentModeTransferPanel";
import { ShoppingCart, CheckCircle2, Circle, Trash2, Plus, Calendar, Building2, Filter, RefreshCw, X as XIcon, CheckSquare, Square, Tag, ScanLine, ArrowRight, ArrowRightLeft, Edit2, Wallet, Banknote, Undo2, Coins } from 'lucide-react';
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
  const [filterStatus, setFilterStatus] = useState('pending'); // 'pending' | 'done' | 'cumul'
  const isAdmin = currentUser?.role === 'admin';

  // Edit item modal (PU + Qté)
  const [editItem, setEditItem] = useState(null);
  const [editQty, setEditQty] = useState(0);
  const [editPU, setEditPU] = useState(0);
  const [editSaving, setEditSaving] = useState(false);

  // Cumul mode de paiement (récap)
  const [cumul, setCumul] = useState(null);
  const [cumulLoading, setCumulLoading] = useState(false);

  // Mark-done modal
  const [markModalItem, setMarkModalItem] = useState(null);
  const [markRealPrice, setMarkRealPrice] = useState('');
  const [markSupplier, setMarkSupplier] = useState('');
  const [markPaymentMode, setMarkPaymentMode] = useState('fonds_propres');

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
      // Only pass status filter if not 'all' (cumul is virtual)
      if (filterStatus === 'pending' || filterStatus === 'done') params.status = filterStatus;
      const r = await axios.get(`${API}/shopping-list`, { params });
      setItems(r.data?.items || []);
      setStats(r.data?.stats || { total: 0, done: 0, pending: 0, estimated_total: 0, real_total_spent: 0 });
    } catch {
      setItems([]);
    } finally { setLoading(false); }
  }, [filterScope, filterStatus]);

  const loadCumul = useCallback(async () => {
    setCumulLoading(true);
    try {
      const r = await axios.get(`${API}/shopping-list/payment-mode-cumul`);
      setCumul(r.data);
    } catch {
      setCumul(null);
    } finally { setCumulLoading(false); }
  }, []);

  useEffect(() => {
    if (filterStatus === 'cumul') loadCumul();
    else refresh();
  }, [filterStatus, refresh, loadCumul]);

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
    setMarkPaymentMode('fonds_propres');
  };

  const confirmMarkDone = async () => {
    if (!markModalItem) return;
    try {
      await axios.post(`${API}/shopping-list/${markModalItem.id}/done`, {
        done_by: currentUser?.full_name || currentUser?.username || 'Gérante',
        real_unit_price: Number(markRealPrice) || 0,
        real_supplier: markSupplier,
        payment_mode: markPaymentMode,
      });
      toast.success("Achat enregistré ✅");
      setMarkModalItem(null);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  // ===== Edit PU/Qté =====
  const openEditModal = (item) => {
    setEditItem(item);
    setEditQty(item.quantity || 0);
    setEditPU(item.estimated_unit_price || 0);
  };
  const editTotal = useMemo(() => (Number(editQty) || 0) * (Number(editPU) || 0), [editQty, editPU]);
  const saveEdit = async () => {
    if (!editItem) return;
    setEditSaving(true);
    try {
      await axios.patch(`${API}/shopping-list/${editItem.id}`, {
        quantity: Number(editQty) || 0,
        estimated_unit_price: Number(editPU) || 0,
      });
      toast.success("Article modifié");
      setEditItem(null);
      refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur");
    } finally { setEditSaving(false); }
  };

  // ===== Remboursement Fonds Propres =====
  const reimburseOne = async (item) => {
    const amt = item.real_total || item.estimated_total || 0;
    if (!window.confirm(`Rembourser ${fmt(amt)} F (${item.name}) depuis la caisse ?`)) return;
    try {
      await axios.post(`${API}/shopping-list/${item.id}/reimburse`, {
        reimbursed_by: currentUser?.full_name || currentUser?.username || 'Administrateur',
      });
      toast.success("Remboursement enregistré");
      refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur");
    }
  };
  const reimburseAll = async () => {
    const pending = items.filter((i) => i.payment_mode === 'fonds_propres' && !i.reimbursed && i.status === 'done');
    if (pending.length === 0) { toast.info("Aucun Fonds Propres en attente"); return; }
    const total = pending.reduce((s, i) => s + (i.real_total || i.estimated_total || 0), 0);
    if (!window.confirm(`Rembourser TOUS les Fonds Propres en attente ?\n${pending.length} ligne(s) — Total ${fmt(total)} F`)) return;
    try {
      const r = await axios.post(`${API}/shopping-list/reimburse-all`, {
        reimbursed_by: currentUser?.full_name || currentUser?.username || 'Administrateur',
      });
      toast.success(`${r.data.count} item(s) remboursé(s) · ${fmt(r.data.total_amount)} F`);
      refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur");
    }
  };

  // ===== Transfert vers Achats Manager (Caisse Restau uniquement) =====
  const transferOneToAchat = async (item) => {
    if (item.transferred_to_achat) { toast.info("Déjà transféré"); return; }
    const amt = item.real_total || item.estimated_total || 0;
    if (!window.confirm(`Transférer "${item.name}" (${fmt(amt)} F) vers Achats > Achats Manager ?`)) return;
    try {
      await axios.post(`${API}/shopping-list/${item.id}/transfer-to-achat-restau`, {
        requested_by: currentUser?.full_name || currentUser?.username || 'Administrateur',
      });
      toast.success("Transféré dans Achats Manager ✅");
      refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur");
    }
  };

  const transferAllCaisseToAchat = async () => {
    const elig = items.filter((i) =>
      i.status === 'done' && i.payment_mode === 'caisse_restau' && !i.transferred_to_achat
    );
    if (elig.length === 0) { toast.info("Aucun item Caisse Restau à transférer"); return; }
    const total = elig.reduce((s, i) => s + (i.real_total || i.estimated_total || 0), 0);
    if (!window.confirm(`Transférer TOUS les ${elig.length} achats Caisse Restau (${fmt(total)} F) vers Achats Manager ?`)) return;
    try {
      const r = await axios.post(`${API}/shopping-list/transfer-all-caisse-to-achat-restau`, {
        requested_by: currentUser?.full_name || currentUser?.username || 'Administrateur',
      });
      toast.success(`${r.data.count} achat(s) transféré(s) — ${fmt(r.data.total_amount)} F`);
      refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur");
    }
  };

  // Bascule FP <-> Caisse Restau pour un item (Admin only)
  const switchItemMode = async (item) => {
    const target = item.payment_mode === 'fonds_propres' ? 'caisse_restau' : 'fonds_propres';
    const amt = item.real_total || item.estimated_total || 0;
    const label = target === 'fonds_propres' ? 'Fonds Propres' : 'Caisse Restau';
    if (!window.confirm(`Basculer "${item.name}" (${fmt(amt)} F) en ${label} ?`)) return;
    try {
      await axios.post(`${API}/shopping-list/${item.id}/switch-payment-mode`, {
        target_mode: target,
        switched_by: currentUser?.full_name || currentUser?.username || 'Administrateur',
      });
      toast.success(`Item basculé en ${label}`);
      refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur");
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
            <div className="text-xs text-emerald-300 mt-0.5 flex items-center gap-2 flex-wrap">
              <span>
                Acheté par <strong>{it.done_by}</strong>
                {it.done_at && (<> · {format(new Date(it.done_at), 'dd/MM HH:mm', { locale: fr })}</>)}
                {it.real_supplier && <> · <strong>{it.real_supplier}</strong></>}
                {(it.real_unit_price ?? null) !== null && it.real_unit_price !== it.estimated_unit_price && (
                  <> · PU réel <strong>{fmt(it.real_unit_price)} F</strong></>
                )}
              </span>
              {it.payment_mode === 'fonds_propres' && (
                <Badge className="bg-purple-500/20 text-purple-200 border border-purple-500/30 text-[10px]">
                  <Wallet className="w-3 h-3 mr-1" /> Fonds Propres
                  {it.reimbursed
                    ? <span className="ml-1 text-emerald-300">· ✓ Remboursé</span>
                    : <span className="ml-1 text-rose-300">· À rembourser</span>}
                </Badge>
              )}
              {it.payment_mode === 'caisse_restau' && (
                <Badge className="bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 text-[10px]">
                  <Banknote className="w-3 h-3 mr-1" /> Caisse Restau
                </Badge>
              )}
            </div>
          )}
        </div>
        {!isDone && (
          <Button size="sm" variant="ghost" onClick={() => openEditModal(it)} className="text-amber-300 hover:text-amber-200 hover:bg-amber-500/20 h-7 w-7 p-0 flex-shrink-0" title="Modifier PU/Qté" data-testid={`course-edit-${it.id}`}>
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
        )}
        {isAdmin && isDone && it.payment_mode === 'fonds_propres' && !it.reimbursed && (
          <Button size="sm" onClick={() => reimburseOne(it)} className="bg-purple-600 hover:bg-purple-700 h-7 px-2 text-[11px] flex-shrink-0" data-testid={`course-reimburse-${it.id}`}>
            <Undo2 className="w-3 h-3 mr-1" /> Rembourser
          </Button>
        )}
        {/* Bascule rapide FP <-> Caisse Restau (Admin only, item FP non remboursé OU item CR) */}
        {isAdmin && isDone && (
          (it.payment_mode === 'fonds_propres' && !it.reimbursed) ||
          it.payment_mode === 'caisse_restau'
        ) && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => switchItemMode(it)}
            className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 h-7 px-2 text-[11px] flex-shrink-0"
            data-testid={`course-switch-${it.id}`}
            title={it.payment_mode === 'fonds_propres' ? 'Basculer en Caisse Restau' : 'Basculer en Fonds Propres'}
          >
            <ArrowRightLeft className="w-3 h-3 mr-1" />
            {it.payment_mode === 'fonds_propres' ? '→ Caisse' : '→ FP'}
          </Button>
        )}
        {/* Transfert Caisse Restau → Achats Manager (1 expense par item) */}
        {isAdmin && isDone && it.payment_mode === 'caisse_restau' && !it.transferred_to_achat && (
          <Button
            size="sm"
            onClick={() => transferOneToAchat(it)}
            className="bg-emerald-600 hover:bg-emerald-700 h-7 px-2 text-[11px] flex-shrink-0"
            data-testid={`course-transfer-achat-${it.id}`}
            title="Transférer en Achat Restau (Achats Manager)"
          >
            <ArrowRight className="w-3 h-3 mr-1" />
            Achat Restau
          </Button>
        )}
        {isAdmin && isDone && it.transferred_to_achat && (
          <Badge className="bg-slate-700/60 text-slate-300 border border-slate-500/30 text-[10px] h-6 px-2 flex-shrink-0">
            ✓ Transféré en Achats
          </Badge>
        )}
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

      {/* === 3 SOUS-MENUS principaux : À acheter / Acheté / Cumul mode de paiement === */}
      <div className="flex items-center gap-2 border-b border-slate-700 pb-2 overflow-x-auto" data-testid="appro-main-subtabs">
        {[
          { key: 'pending', label: 'À ACHETER', color: 'amber' },
          { key: 'done', label: 'ACHETÉ', color: 'emerald' },
          ...(isAdmin ? [{ key: 'cumul', label: 'CUMUL MODE DE PAIEMENT', color: 'cyan' }] : []),
        ].map((t) => {
          const isActive = filterStatus === t.key;
          const colorMap = {
            amber: isActive ? 'bg-amber-500 text-slate-900' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50',
            emerald: isActive ? 'bg-emerald-500 text-slate-900' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50',
            cyan: isActive ? 'bg-cyan-500 text-slate-900' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50',
          };
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilterStatus(t.key)}
              data-testid={`appro-subtab-${t.key}`}
              className={`px-3 py-2 rounded-t text-sm font-bold transition-colors whitespace-nowrap ${colorMap[t.color]}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Filtres scope (visibles uniquement en mode liste) */}
      {filterStatus !== 'cumul' && (
      <Card className="bg-slate-900/60 border-slate-700">
        <CardContent className="py-3 flex items-center gap-2 flex-wrap">
          <span className="text-slate-400 text-xs flex items-center gap-1"><Filter className="w-3.5 h-3.5" />Périmètre :</span>
          <div className="flex gap-1">
            {['all', 'restaurant', 'reservation'].map((v) => (
              <button key={v} type="button" onClick={() => setFilterScope(v)} className={`text-[11px] px-2 py-1 rounded-full ${filterScope === v ? 'bg-amber-500 text-slate-900 font-semibold' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`} data-testid={`filter-scope-${v}`}>
                {v === 'all' ? 'Tous' : v === 'restaurant' ? '🍳 Restaurant' : '🎉 Réservations'}
              </button>
            ))}
          </div>
          {isAdmin && filterStatus === 'done' && (
            <>
              <Button size="sm" onClick={reimburseAll} className="bg-purple-600 hover:bg-purple-700 text-white h-8 ml-2" data-testid="appro-reimburse-all-btn">
                <Undo2 className="w-3.5 h-3.5 mr-1" /> Rembourser tous les Fonds Propres
              </Button>
              <Button size="sm" onClick={transferAllCaisseToAchat} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8" data-testid="appro-transfer-all-caisse-btn">
                <ArrowRight className="w-3.5 h-3.5 mr-1" /> Transférer tout Caisse Restau → Achats
              </Button>
            </>
          )}
          <span className="ml-auto flex gap-1.5 flex-wrap">
            <Button size="sm" onClick={() => setShowAdd((s) => !s)} className="bg-amber-600 hover:bg-amber-700 text-white h-8" data-testid="course-add-toggle">
              <Plus className="w-3.5 h-3.5 mr-1" /> {showAdd ? 'Fermer' : 'Ajouter un article'}
            </Button>
          </span>
        </CardContent>
      </Card>
      )}

      {/* === LISTE (pending / done) === */}
      {filterStatus !== 'cumul' && (
      <>
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
      </>
      )}

      {/* === CUMUL MODE DE PAIEMENT (Admin only) === */}
      {filterStatus === 'cumul' && isAdmin && (
        <Card className="bg-gradient-to-br from-cyan-900/30 to-indigo-900/20 border-cyan-500/40" data-testid="appro-cumul-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-cyan-200 flex items-center gap-2">
              <Coins className="w-5 h-5" /> CUMUL — MODE DE PAIEMENT
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cumulLoading || !cumul ? (
              <p className="text-slate-400 text-center py-6">Chargement…</p>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Card className="bg-purple-900/20 border-purple-500/40" data-testid="appro-cumul-fonds-propres">
                    <CardContent className="py-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Wallet className="w-5 h-5 text-purple-300" />
                        <p className="text-purple-200 font-bold uppercase text-sm">Fonds Propres</p>
                      </div>
                      <p className="text-3xl font-bold text-purple-100">{fmt(cumul.fonds_propres.total)} <span className="text-base text-purple-400/70">F</span></p>
                      <p className="text-purple-300/70 text-xs mt-1">{cumul.fonds_propres.count} achat{cumul.fonds_propres.count > 1 ? 's' : ''}</p>
                      <div className="mt-3 space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-emerald-300">✓ Remboursés</span>
                          <span className="text-emerald-200 font-bold">{fmt(cumul.fonds_propres.reimbursed_total)} F ({cumul.fonds_propres.reimbursed_count})</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-rose-300">⏳ En attente</span>
                          <span className="text-rose-200 font-bold">{fmt(cumul.fonds_propres.pending_total)} F ({cumul.fonds_propres.pending_count})</span>
                        </div>
                      </div>
                      {cumul.fonds_propres.pending_count > 0 && (
                        <Button size="sm" onClick={reimburseAll} className="w-full mt-3 bg-purple-600 hover:bg-purple-700" data-testid="cumul-reimburse-all-btn">
                          <Undo2 className="w-3.5 h-3.5 mr-1" /> Rembourser tout en attente
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                  <Card className="bg-emerald-900/20 border-emerald-500/40" data-testid="appro-cumul-caisse-restau">
                    <CardContent className="py-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Banknote className="w-5 h-5 text-emerald-300" />
                        <p className="text-emerald-200 font-bold uppercase text-sm">Caisse Restau</p>
                      </div>
                      <p className="text-3xl font-bold text-emerald-100">{fmt(cumul.caisse_restau.total)} <span className="text-base text-emerald-400/70">F</span></p>
                      <p className="text-emerald-300/70 text-xs mt-1">{cumul.caisse_restau.count} achat{cumul.caisse_restau.count > 1 ? 's' : ''}</p>
                      <p className="text-emerald-300/60 text-[11px] italic mt-3">
                        Ces dépenses sont déjà déduites du CA du jour dans le Point de la Caisse.
                      </p>
                    </CardContent>
                  </Card>
                </div>
                <div className="bg-slate-800/40 rounded p-3 border border-slate-700 text-xs text-slate-400">
                  <p>💡 <strong className="text-slate-200">Fonds Propres</strong> : avance personnelle — à rembourser depuis la caisse. Le remboursement apparaît dans le Point journalier le jour où il est effectué.</p>
                  <p className="mt-1">💡 <strong className="text-slate-200">Caisse Restau</strong> : payé directement depuis les recettes de la caisse — déjà reflété dans le CA.</p>
                </div>
                <PaymentModeTransferPanel
                  cumul={cumul}
                  onChanged={loadCumul}
                  currentUser={currentUser}
                />
              </>
            )}
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
              <div>
                <Label className="text-slate-300 text-sm mb-2 block">Mode de paiement</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMarkPaymentMode("fonds_propres")}
                    data-testid="course-pm-fonds-propres"
                    className={`p-3 rounded-lg border-2 transition ${
                      markPaymentMode === "fonds_propres"
                        ? "bg-purple-500/20 border-purple-400 text-purple-200"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                    }`}
                  >
                    <Wallet className="w-5 h-5 mx-auto mb-1" />
                    <p className="text-xs font-bold">Fonds Propres</p>
                    <p className="text-[9px] opacity-80">Remboursable</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMarkPaymentMode("caisse_restau")}
                    data-testid="course-pm-caisse-restau"
                    className={`p-3 rounded-lg border-2 transition ${
                      markPaymentMode === "caisse_restau"
                        ? "bg-emerald-500/20 border-emerald-400 text-emerald-200"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                    }`}
                  >
                    <Banknote className="w-5 h-5 mx-auto mb-1" />
                    <p className="text-xs font-bold">Caisse Restau</p>
                    <p className="text-[9px] opacity-80">Affecte le CA</p>
                  </button>
                </div>
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
      {/* Modal — Modifier PU / Qté */}
      {editItem && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setEditItem(null)}>
          <Card className="bg-slate-900 border-amber-500/40 w-full max-w-md" onClick={(e) => e.stopPropagation()} data-testid="course-edit-modal">
            <CardHeader className="pb-2 border-b border-slate-700">
              <CardTitle className="text-white text-base flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Edit2 className="w-5 h-5 text-amber-400" />
                  Modifier — {editItem.name}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setEditItem(null)} className="text-slate-300 h-7 w-7 p-0">
                  <XIcon className="w-4 h-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-slate-300 text-sm">Quantité</Label>
                  <Input
                    type="number" min="0" step="0.01"
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white"
                    data-testid="course-edit-qty"
                  />
                </div>
                <div>
                  <Label className="text-slate-300 text-sm">Prix unitaire (F)</Label>
                  <Input
                    type="number" min="0" step="1"
                    value={editPU}
                    onChange={(e) => setEditPU(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white"
                    data-testid="course-edit-pu"
                  />
                </div>
              </div>
              <div className="flex justify-end items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded p-3">
                <span className="text-amber-300 text-sm uppercase">Total</span>
                <span className="text-amber-200 text-2xl font-bold" data-testid="course-edit-total">{fmt(editTotal)} F</span>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setEditItem(null)} className="border-slate-700 text-slate-300">Annuler</Button>
                <Button onClick={saveEdit} disabled={editSaving} className="bg-amber-600 hover:bg-amber-700" data-testid="course-edit-save">
                  {editSaving ? "Enregistrement…" : "Enregistrer"}
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
