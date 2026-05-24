/**
 * AchatsManagerPanels — 3 panneaux du sous-menu "Achats Manager" (Admin only) :
 *   1. À acheter (a_acheter) — items source=appro_manager, payment_mode null
 *      → permet édition PU/Qté via modal + transfert "Marquer acheté" avec choix du mode de paiement
 *   2. Acheté (achete) — items source=appro_manager, payment_mode set
 *      → affiche le mode de paiement, possibilité de remboursement Fonds Propres
 *   3. Cumul mode de paiement (cumul_paiement) — récap Fonds Propres / Caisse Restau
 *
 * Visible UNIQUEMENT pour l'admin (le parent filtre déjà via isAdminUser).
 */
import React from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ShoppingCart, Edit2, CheckCircle2, Wallet, Banknote, Coins, Undo2, Trash2, Receipt,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n || 0));

const PaymentBadge = ({ mode }) => {
  if (mode === "fonds_propres") {
    return (
      <Badge className="bg-purple-500/20 text-purple-300 border border-purple-500/30">
        <Wallet className="w-3 h-3 mr-1" /> Fonds Propres
      </Badge>
    );
  }
  if (mode === "caisse_restau") {
    return (
      <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
        <Banknote className="w-3 h-3 mr-1" /> Caisse Restau
      </Badge>
    );
  }
  return null;
};

/**
 * Modal d'édition PU / Qté (item simple OU items d'une liste groupée).
 * Total est recalculé automatiquement.
 */
const EditExpenseModal = ({ open, expense, onClose, onSaved }) => {
  const [draft, setDraft] = React.useState(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!expense) { setDraft(null); return; }
    if (expense.is_group) {
      setDraft({
        is_group: true,
        items: (expense.items || []).map((it) => ({
          ...it,
          quantity: Number(it.quantity || 0),
          unit_price: Number(it.unit_price || 0),
        })),
      });
    } else {
      setDraft({
        is_group: false,
        quantity: Number(expense.quantity || 1),
        unit_price: Number(expense.unit_price || expense.amount || 0),
      });
    }
  }, [expense]);

  const total = React.useMemo(() => {
    if (!draft) return 0;
    if (draft.is_group) {
      return (draft.items || []).reduce(
        (s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
    }
    return (Number(draft.quantity) || 0) * (Number(draft.unit_price) || 0);
  }, [draft]);

  const updateItem = (idx, patch) => {
    setDraft((d) => {
      const items = [...(d.items || [])];
      items[idx] = { ...items[idx], ...patch };
      return { ...d, items };
    });
  };

  const handleSave = async () => {
    if (!expense || !draft) return;
    setSaving(true);
    try {
      const payload = draft.is_group
        ? {
            items: draft.items.map((it) => ({
              category: it.category,
              description: it.description,
              quantity: Number(it.quantity) || 0,
              unit_price: Number(it.unit_price) || 0,
              amount: (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
              struck: !!it.struck,
              strike_reason: it.struck ? (it.strike_reason || "autres") : null,
              strike_note: it.struck ? (it.strike_note || "") : null,
            })),
            amount: total,
          }
        : {
            quantity: Number(draft.quantity) || 0,
            unit_price: Number(draft.unit_price) || 0,
            amount: total,
          };
      await axios.put(`${API}/expenses/${expense.id}`, payload);
      toast.success("Dépense modifiée");
      onSaved && onSaved();
      onClose && onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur de sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  if (!expense) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose && onClose()}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-amber-300 flex items-center gap-2">
            <Edit2 className="w-5 h-5" /> Modifier — {expense.description}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {!draft?.is_group ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-slate-300">Quantité</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={draft?.quantity ?? 0}
                  onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))}
                  data-testid="edit-quantity-input"
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-300">Prix unitaire (F)</Label>
                <Input
                  type="number" min="0" step="1"
                  value={draft?.unit_price ?? 0}
                  onChange={(e) => setDraft((d) => ({ ...d, unit_price: e.target.value }))}
                  data-testid="edit-unit-price-input"
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {(draft?.items || []).map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-800/40 rounded p-2 border border-slate-700">
                  <div className="col-span-5 text-sm text-white truncate" title={it.description}>{idx + 1}. {it.description}</div>
                  <Input
                    type="number" min="0" step="0.01"
                    value={it.quantity ?? 0}
                    onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                    className="col-span-3 bg-slate-900 border-slate-700 text-white text-sm h-8"
                    data-testid={`edit-item-qty-${idx}`}
                  />
                  <Input
                    type="number" min="0" step="1"
                    value={it.unit_price ?? 0}
                    onChange={(e) => updateItem(idx, { unit_price: e.target.value })}
                    className="col-span-3 bg-slate-900 border-slate-700 text-white text-sm h-8"
                    data-testid={`edit-item-pu-${idx}`}
                  />
                  <span className="col-span-1 text-right text-amber-300 text-xs font-bold">
                    {fmt((Number(it.quantity) || 0) * (Number(it.unit_price) || 0))}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded p-3">
            <span className="text-amber-300 text-sm uppercase">Total</span>
            <span className="text-amber-200 text-2xl font-bold" data-testid="edit-total-amount">{fmt(total)} F</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-slate-600 text-slate-300">Annuler</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-amber-600 hover:bg-amber-700" data-testid="edit-save-btn">
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Modal de choix du mode de paiement lors du transfert "À acheter → Acheté".
 */
const MarkBoughtModal = ({ open, expense, onClose, onDone, currentUser }) => {
  const [mode, setMode] = React.useState("fonds_propres");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => { if (open) setMode("fonds_propres"); }, [open]);

  const handleConfirm = async () => {
    if (!expense) return;
    setSaving(true);
    try {
      await axios.post(`${API}/expenses/${expense.id}/mark-bought`, {
        payment_mode: mode,
        paid_by: currentUser?.full_name || currentUser?.username || "Administrateur",
      });
      toast.success(`Dépense marquée comme achetée (${mode === "fonds_propres" ? "Fonds Propres" : "Caisse Restau"})`);
      onDone && onDone();
      onClose && onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur");
    } finally {
      setSaving(false);
    }
  };

  if (!expense) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose && onClose()}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" /> Marquer comme acheté
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            <span className="font-semibold text-white">{expense.description}</span><br/>
            <span className="text-amber-300 font-bold text-lg">{fmt(expense.amount)} F</span>
          </p>
          <div>
            <Label className="text-slate-300 mb-2 block">Mode de paiement</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("fonds_propres")}
                data-testid="payment-mode-fonds-propres"
                className={`p-4 rounded-lg border-2 transition ${
                  mode === "fonds_propres"
                    ? "bg-purple-500/20 border-purple-400 text-purple-200"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                }`}
              >
                <Wallet className="w-6 h-6 mx-auto mb-1" />
                <p className="text-sm font-bold">Fonds Propres</p>
                <p className="text-[10px] opacity-80">Remboursable</p>
              </button>
              <button
                type="button"
                onClick={() => setMode("caisse_restau")}
                data-testid="payment-mode-caisse-restau"
                className={`p-4 rounded-lg border-2 transition ${
                  mode === "caisse_restau"
                    ? "bg-emerald-500/20 border-emerald-400 text-emerald-200"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                }`}
              >
                <Banknote className="w-6 h-6 mx-auto mb-1" />
                <p className="text-sm font-bold">Caisse Restau</p>
                <p className="text-[10px] opacity-80">Affecte le CA</p>
              </button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-slate-600 text-slate-300">Annuler</Button>
          <Button onClick={handleConfirm} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700" data-testid="confirm-mark-bought-btn">
            {saving ? "…" : "Confirmer l'achat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ========== Panel 1 : À acheter ========== */
const ToBuyPanel = ({ expenses, formatPrice, deleteExpense, onChanged, currentUser }) => {
  const [editTarget, setEditTarget] = React.useState(null);
  const [markTarget, setMarkTarget] = React.useState(null);
  const list = expenses.filter((e) => e.source === "appro_manager" && !e.payment_mode);
  if (list.length === 0) {
    return (
      <Card className="bg-slate-800/30 border-slate-700">
        <CardContent className="py-12 text-center">
          <ShoppingCart className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-500">Aucun achat en attente</p>
          <p className="text-slate-600 text-xs mt-1">
            Transférez des courses depuis <strong>Appro Manager</strong> pour les voir ici.
          </p>
        </CardContent>
      </Card>
    );
  }
  const total = list.reduce((s, e) => s + (e.amount || 0), 0);
  return (
    <>
      <Card className="bg-gradient-to-br from-amber-900/30 to-orange-900/20 border-amber-500/50" data-testid="achats-manager-to-buy-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-amber-200 flex items-center gap-2 flex-wrap">
            <ShoppingCart className="w-5 h-5" />
            À ACHETER
            <Badge className="bg-amber-500/30 text-amber-200 ml-2">{list.length}</Badge>
            <Badge className="bg-emerald-500/30 text-emerald-300">Total : {formatPrice(total)} F</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[640px] overflow-y-auto">
          {list.map((expense) => (
            <div key={expense.id} className="bg-slate-800/40 rounded-lg p-3 border border-amber-500/20" data-testid={`tobuy-${expense.id}`}>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {expense.is_group ? (
                      <Badge className="text-xs bg-indigo-500/30 text-indigo-300">📦 Liste ({expense.items?.length || 0} articles)</Badge>
                    ) : (
                      <Badge className="text-xs bg-slate-500/20 text-slate-400">{expense.category || "autres"}</Badge>
                    )}
                    <span className="text-white font-medium">{expense.description}</span>
                  </div>
                  {!expense.is_group && (
                    <div className="text-slate-300 text-sm mt-1">
                      Qté : <span className="font-bold">{expense.quantity || 1}</span> × PU : <span className="font-bold">{formatPrice(expense.unit_price || expense.amount)} F</span>
                    </div>
                  )}
                  <p className="text-amber-300 font-bold text-lg mt-1">{formatPrice(expense.amount)} F</p>
                </div>
                <div className="flex gap-2 flex-wrap shrink-0">
                  <Button size="sm" variant="outline" onClick={() => setEditTarget(expense)}
                    className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                    data-testid={`tobuy-edit-${expense.id}`}>
                    <Edit2 className="w-4 h-4 mr-1" /> Modifier
                  </Button>
                  <Button size="sm" onClick={() => setMarkTarget(expense)}
                    className="bg-emerald-600 hover:bg-emerald-700"
                    data-testid={`tobuy-markbought-${expense.id}`}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Marquer acheté
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteExpense(expense.id)}
                    className="h-9 text-rose-400 hover:bg-rose-500/20" title="Supprimer">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {expense.is_group && expense.items?.length > 0 && (
                <div className="bg-slate-900/40 rounded p-2 mt-2">
                  {expense.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs border-b border-slate-700/50 pb-1">
                      <span className="text-slate-300">{idx + 1}. {it.description}</span>
                      <span className="text-amber-300">{it.quantity} × {formatPrice(it.unit_price)} = <b>{formatPrice(it.amount)} F</b></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      <EditExpenseModal open={!!editTarget} expense={editTarget} onClose={() => setEditTarget(null)} onSaved={onChanged} />
      <MarkBoughtModal open={!!markTarget} expense={markTarget} onClose={() => setMarkTarget(null)} onDone={onChanged} currentUser={currentUser} />
    </>
  );
};

/* ========== Panel 2 : Acheté ========== */
const BoughtPanel = ({ expenses, formatPrice, deleteExpense, onChanged, currentUser }) => {
  const list = expenses.filter((e) => e.source === "appro_manager" && e.payment_mode);
  const pendingFP = list.filter((e) => e.payment_mode === "fonds_propres" && !e.reimbursed);
  const reimburseOne = async (exp) => {
    if (!window.confirm(`Marquer ${formatPrice(exp.amount)} F (${exp.description}) comme remboursé depuis la caisse ?`)) return;
    try {
      await axios.post(`${API}/expenses/${exp.id}/reimburse-fonds-propres`, {
        reimbursed_by: currentUser?.full_name || currentUser?.username || "Administrateur",
      });
      toast.success("Remboursement enregistré");
      onChanged && onChanged();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur");
    }
  };
  const reimburseAll = async () => {
    if (pendingFP.length === 0) return;
    const total = pendingFP.reduce((s, e) => s + (e.amount || 0), 0);
    if (!window.confirm(`Rembourser TOUS les Fonds Propres en attente ?\n${pendingFP.length} ligne(s) — Total ${formatPrice(total)} F`)) return;
    try {
      const r = await axios.post(`${API}/expenses/reimburse-all-fonds-propres`, {
        reimbursed_by: currentUser?.full_name || currentUser?.username || "Administrateur",
      });
      toast.success(`${r.data.count} dépense(s) remboursée(s) · ${formatPrice(r.data.total_amount)} F`);
      onChanged && onChanged();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur");
    }
  };

  if (list.length === 0) {
    return (
      <Card className="bg-slate-800/30 border-slate-700">
        <CardContent className="py-12 text-center">
          <Receipt className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-500">Aucun achat finalisé</p>
        </CardContent>
      </Card>
    );
  }
  const total = list.reduce((s, e) => s + (e.amount || 0), 0);
  return (
    <Card className="bg-gradient-to-br from-emerald-900/30 to-slate-900/30 border-emerald-500/40" data-testid="achats-manager-bought-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-emerald-200 flex items-center gap-2 flex-wrap">
          <CheckCircle2 className="w-5 h-5" /> ACHETÉ
          <Badge className="bg-emerald-500/30 text-emerald-200 ml-2">{list.length}</Badge>
          <Badge className="bg-emerald-500/30 text-emerald-300">Total : {formatPrice(total)} F</Badge>
          {pendingFP.length > 0 && (
            <Button size="sm" onClick={reimburseAll} className="ml-auto bg-purple-600 hover:bg-purple-700"
              data-testid="reimburse-all-fonds-propres-btn">
              <Undo2 className="w-4 h-4 mr-1" /> Rembourser tous les Fonds Propres ({pendingFP.length})
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[640px] overflow-y-auto">
        {list.map((expense) => (
          <div key={expense.id} className="bg-slate-800/40 rounded-lg p-3 border border-emerald-500/20" data-testid={`bought-${expense.id}`}>
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {expense.is_group && (
                    <Badge className="text-xs bg-indigo-500/30 text-indigo-300">📦 ({expense.items?.length || 0})</Badge>
                  )}
                  <span className="text-white font-medium">{expense.description}</span>
                  <PaymentBadge mode={expense.payment_mode} />
                  {expense.payment_mode === "fonds_propres" && (
                    expense.reimbursed
                      ? <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px]">✓ Remboursé</Badge>
                      : <Badge className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px]">À rembourser</Badge>
                  )}
                </div>
                <p className="text-emerald-300 font-bold text-lg mt-1">{formatPrice(expense.amount)} F</p>
                <p className="text-slate-500 text-xs">
                  Acheté le {expense.paid_at?.slice(0, 10) || "—"} · par {expense.paid_by || "—"}
                  {expense.reimbursed && <span className="text-emerald-400"> · Remboursé le {expense.reimbursed_at?.slice(0, 10)}</span>}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap shrink-0">
                {expense.payment_mode === "fonds_propres" && !expense.reimbursed && (
                  <Button size="sm" onClick={() => reimburseOne(expense)}
                    className="bg-purple-600 hover:bg-purple-700"
                    data-testid={`reimburse-${expense.id}`}>
                    <Undo2 className="w-4 h-4 mr-1" /> Rembourser
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => deleteExpense(expense.id)}
                  className="h-9 text-rose-400 hover:bg-rose-500/20" title="Supprimer">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

/* ========== Panel 3 : Cumul mode de paiement ========== */
const CumulPanel = ({ formatPrice }) => {
  const [cumul, setCumul] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/expenses/payment-mode-cumul`, { params: { source: "appro_manager" } });
      setCumul(r.data);
    } catch (e) {
      toast.error("Erreur de chargement du cumul");
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  if (loading || !cumul) return <Card className="bg-slate-800/30 border-slate-700"><CardContent className="py-8 text-center text-slate-500">Chargement…</CardContent></Card>;
  const fp = cumul.fonds_propres;
  const cr = cumul.caisse_restau;
  return (
    <Card className="bg-gradient-to-br from-cyan-900/30 to-indigo-900/20 border-cyan-500/40" data-testid="achats-manager-cumul-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-cyan-200 flex items-center gap-2">
          <Coins className="w-5 h-5" /> CUMUL — MODE DE PAIEMENT (Achats Manager)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Fonds Propres */}
          <Card className="bg-purple-900/20 border-purple-500/40" data-testid="cumul-fonds-propres">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 mb-3">
                <Wallet className="w-5 h-5 text-purple-300" />
                <p className="text-purple-200 font-bold uppercase text-sm">Fonds Propres</p>
              </div>
              <p className="text-3xl font-bold text-purple-100">{formatPrice(fp.total)} <span className="text-base text-purple-400/70">F</span></p>
              <p className="text-purple-300/70 text-xs mt-1">{fp.count} dépense{fp.count > 1 ? "s" : ""}</p>
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-emerald-300">✓ Remboursés</span>
                  <span className="text-emerald-200 font-bold">{formatPrice(fp.reimbursed_total)} F ({fp.reimbursed_count})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-rose-300">⏳ En attente</span>
                  <span className="text-rose-200 font-bold">{formatPrice(fp.pending_total)} F ({fp.pending_count})</span>
                </div>
              </div>
            </CardContent>
          </Card>
          {/* Caisse Restau */}
          <Card className="bg-emerald-900/20 border-emerald-500/40" data-testid="cumul-caisse-restau">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 mb-3">
                <Banknote className="w-5 h-5 text-emerald-300" />
                <p className="text-emerald-200 font-bold uppercase text-sm">Caisse Restau</p>
              </div>
              <p className="text-3xl font-bold text-emerald-100">{formatPrice(cr.total)} <span className="text-base text-emerald-400/70">F</span></p>
              <p className="text-emerald-300/70 text-xs mt-1">{cr.count} dépense{cr.count > 1 ? "s" : ""}</p>
              <p className="text-emerald-300/60 text-[11px] italic mt-3">
                Ces dépenses sont déjà déduites du CA du jour dans le Point de la Caisse.
              </p>
            </CardContent>
          </Card>
        </div>
        <div className="bg-slate-800/40 rounded p-3 border border-slate-700 text-xs text-slate-400">
          <p>💡 <strong className="text-slate-200">Fonds Propres</strong> : avance personnelle (gérante / admin) — à rembourser depuis la caisse, apparaît dans le Point journalier le jour du remboursement.</p>
          <p className="mt-1">💡 <strong className="text-slate-200">Caisse Restau</strong> : payé directement depuis les recettes de la caisse — déjà reflété dans le CA.</p>
        </div>
      </CardContent>
    </Card>
  );
};

const AchatsManagerPanels = ({ subView, expenses, formatPrice, deleteExpense, onChanged, currentUser }) => {
  if (subView === "a_acheter") return <ToBuyPanel expenses={expenses} formatPrice={formatPrice} deleteExpense={deleteExpense} onChanged={onChanged} currentUser={currentUser} />;
  if (subView === "achete") return <BoughtPanel expenses={expenses} formatPrice={formatPrice} deleteExpense={deleteExpense} onChanged={onChanged} currentUser={currentUser} />;
  if (subView === "cumul_paiement") return <CumulPanel formatPrice={formatPrice} />;
  return null;
};

export default AchatsManagerPanels;
