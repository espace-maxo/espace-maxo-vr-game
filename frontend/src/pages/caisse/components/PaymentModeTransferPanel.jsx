/**
 * PaymentModeTransferPanel — Permet à l'Admin de corriger les erreurs de mode de paiement
 * dans Appro Manager > Cumul mode de paiement.
 *
 * Deux mécanismes complémentaires :
 *  1. **Transfert libre** : Bouger un montant arbitraire FP↔CR (ajustement comptable
 *     qui n'altère AUCUN item, traçable, réversible).
 *  2. **Switch par item** : Lister les items "Acheté" et permettre de basculer leur
 *     mode individuellement (la quantité bascule "atomiquement").
 *
 * Visible uniquement quand on est dans le sous-onglet "Cumul mode de paiement".
 */
import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowRightLeft, Wallet, Banknote, Trash2, ChevronDown, ChevronUp, Repeat,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n || 0));

const ModeBadge = ({ mode }) =>
  mode === "fonds_propres" ? (
    <Badge className="bg-purple-500/20 text-purple-200 border border-purple-500/30 text-[10px]">
      <Wallet className="w-3 h-3 mr-1" /> Fonds Propres
    </Badge>
  ) : (
    <Badge className="bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 text-[10px]">
      <Banknote className="w-3 h-3 mr-1" /> Caisse Restau
    </Badge>
  );

const PaymentModeTransferPanel = ({ cumul, onChanged, currentUser }) => {
  const [fromMode, setFromMode] = useState("fonds_propres");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [transfers, setTransfers] = useState([]);
  const [showItems, setShowItems] = useState(false);
  const [items, setItems] = useState([]);

  const toMode = fromMode === "fonds_propres" ? "caisse_restau" : "fonds_propres";
  const maxAvail = fromMode === "fonds_propres"
    ? Number(cumul?.fonds_propres?.pending_total || 0)
    : Number(cumul?.caisse_restau?.total || 0);

  const loadTransfers = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/shopping-list/payment-mode-transfers`);
      setTransfers(r.data?.transfers || []);
    } catch { setTransfers([]); }
  }, []);

  const loadItems = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/shopping-list`, { params: { status: "done" } });
      const list = (r.data?.items || []).filter(
        (it) => it.payment_mode === "fonds_propres" || it.payment_mode === "caisse_restau"
      );
      setItems(list);
    } catch { setItems([]); }
  }, []);

  useEffect(() => { loadTransfers(); }, [loadTransfers]);
  useEffect(() => { if (showItems) loadItems(); }, [showItems, loadItems]);

  const handleTransfer = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Montant invalide"); return; }
    if (amt > maxAvail + 0.01) {
      toast.error(`Solde insuffisant. Disponible : ${fmt(maxAvail)} F`); return;
    }
    setSaving(true);
    try {
      await axios.post(`${API}/shopping-list/payment-mode-transfer`, {
        from_mode: fromMode,
        to_mode: toMode,
        amount: amt,
        note,
        created_by: currentUser?.full_name || currentUser?.username || "Administrateur",
      });
      toast.success(`Transfert ${fmt(amt)} F effectué`);
      setAmount(""); setNote("");
      await loadTransfers();
      onChanged && onChanged();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur");
    } finally { setSaving(false); }
  };

  const undoTransfer = async (t) => {
    if (!window.confirm(`Annuler ce transfert de ${fmt(t.amount)} F (${t.from_mode} → ${t.to_mode}) ?`)) return;
    try {
      await axios.delete(`${API}/shopping-list/payment-mode-transfers/${t.id}`);
      toast.success("Transfert annulé");
      await loadTransfers();
      onChanged && onChanged();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur");
    }
  };

  const switchItem = async (it, newMode) => {
    if (it.payment_mode === newMode) return;
    if (!window.confirm(`Basculer "${it.name}" (${fmt(it.real_total || it.estimated_total)} F) en ${newMode === "fonds_propres" ? "Fonds Propres" : "Caisse Restau"} ?`)) return;
    try {
      await axios.post(`${API}/shopping-list/${it.id}/switch-payment-mode`, {
        target_mode: newMode,
        switched_by: currentUser?.full_name || currentUser?.username || "Administrateur",
      });
      toast.success("Mode de paiement modifié");
      await loadItems();
      onChanged && onChanged();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur");
    }
  };

  return (
    <div className="space-y-4">
      {/* === TRANSFERT LIBRE === */}
      <Card className="bg-slate-900/60 border-amber-500/30" data-testid="payment-transfer-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-amber-200 flex items-center gap-2 text-sm">
            <ArrowRightLeft className="w-4 h-4" /> Transfert d'ajustement (corriger une erreur)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-slate-300 text-xs">De</Label>
              <select
                value={fromMode}
                onChange={(e) => setFromMode(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded px-2 py-2 text-sm"
                data-testid="transfer-from-mode"
              >
                <option value="fonds_propres">Fonds Propres (en attente)</option>
                <option value="caisse_restau">Caisse Restau</option>
              </select>
              <p className="text-[10px] text-slate-500 mt-1">Disponible : {fmt(maxAvail)} F</p>
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Vers</Label>
              <div className="flex items-center h-9 px-2 bg-slate-800/50 border border-slate-700 rounded text-sm text-slate-200">
                <ArrowRightLeft className="w-3 h-3 mr-2 text-amber-400" />
                {toMode === "fonds_propres" ? "Fonds Propres" : "Caisse Restau"}
              </div>
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Montant (F)</Label>
              <Input
                type="number" min="0" step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="bg-slate-800 border-slate-700 text-white"
                data-testid="transfer-amount-input"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleTransfer}
                disabled={saving || !amount}
                className="w-full bg-amber-600 hover:bg-amber-700"
                data-testid="transfer-submit-btn"
              >
                <Repeat className="w-4 h-4 mr-1" />
                {saving ? "…" : "Transférer"}
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-slate-300 text-xs">Note (optionnel)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Motif du transfert (ex: erreur de saisie sur achat de samedi)"
              rows={2}
              className="bg-slate-800 border-slate-700 text-white text-sm"
              data-testid="transfer-note-input"
            />
          </div>
        </CardContent>
      </Card>

      {/* === HISTORIQUE TRANSFERTS === */}
      {transfers.length > 0 && (
        <Card className="bg-slate-900/60 border-slate-700" data-testid="transfers-history-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-200 text-sm">Transferts récents ({transfers.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[200px] overflow-y-auto">
            {transfers.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 bg-slate-800/40 rounded p-2 border border-slate-700/50" data-testid={`transfer-${t.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <ModeBadge mode={t.from_mode} />
                    <ArrowRightLeft className="w-3 h-3 text-slate-500" />
                    <ModeBadge mode={t.to_mode} />
                    <span className="text-amber-300 font-bold text-sm">{fmt(t.amount)} F</span>
                  </div>
                  <p className="text-slate-500 text-[10px] mt-0.5">
                    Par {t.created_by} · {t.created_at ? format(new Date(t.created_at), "dd/MM/yyyy HH:mm", { locale: fr }) : ""}
                    {t.note ? ` · "${t.note}"` : ""}
                  </p>
                </div>
                <Button
                  size="sm" variant="ghost"
                  onClick={() => undoTransfer(t)}
                  className="text-rose-400 hover:bg-rose-500/20 h-7 w-7 p-0"
                  data-testid={`transfer-undo-${t.id}`}
                  title="Annuler ce transfert"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* === SWITCH PAR ITEM === */}
      <Card className="bg-slate-900/60 border-slate-700">
        <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowItems((s) => !s)}>
          <CardTitle className="text-slate-200 flex items-center justify-between text-sm">
            <span>Switch par item (basculer un achat précis)</span>
            {showItems ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </CardTitle>
        </CardHeader>
        {showItems && (
          <CardContent className="space-y-1 max-h-[400px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-slate-500 text-xs italic text-center py-4">Aucun item acheté à afficher</p>
            ) : (
              items.map((it) => {
                const otherMode = it.payment_mode === "fonds_propres" ? "caisse_restau" : "fonds_propres";
                const canSwitch = !(it.payment_mode === "fonds_propres" && it.reimbursed);
                return (
                  <div key={it.id} className="flex items-center justify-between gap-2 bg-slate-800/40 rounded p-2 border border-slate-700/40" data-testid={`switch-item-${it.id}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{it.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <ModeBadge mode={it.payment_mode} />
                        <span className="text-emerald-300 text-xs font-bold">{fmt(it.real_total || it.estimated_total)} F</span>
                        {it.payment_mode === "fonds_propres" && it.reimbursed && (
                          <Badge className="bg-emerald-500/10 text-emerald-300 text-[9px]">remboursé</Badge>
                        )}
                      </div>
                    </div>
                    {canSwitch ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => switchItem(it, otherMode)}
                        className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 h-7 text-[11px]"
                        data-testid={`switch-btn-${it.id}`}
                      >
                        <ArrowRightLeft className="w-3 h-3 mr-1" />
                        → {otherMode === "fonds_propres" ? "FP" : "CR"}
                      </Button>
                    ) : (
                      <span className="text-[10px] text-slate-500 italic">Déjà remboursé</span>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
};

export default PaymentModeTransferPanel;
