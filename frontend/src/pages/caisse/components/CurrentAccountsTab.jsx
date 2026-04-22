/**
 * CurrentAccountsTab — Compte courant (avances du promoteur à l'entreprise).
 * Admin-only. Gestion multi-comptes avec échéancier + remboursements.
 */
import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus, Trash2, Edit2, Wallet, TrendingDown, Calendar, AlertTriangle,
  CheckCircle, DollarSign, ChevronDown, ChevronUp, Banknote,
} from "lucide-react";

const API = (process.env.REACT_APP_BACKEND_URL || "") + "/api";
const formatPrice = (p) => new Intl.NumberFormat("fr-FR").format(Math.round(p || 0));

const emptyAccount = { name: "", total_advance: 0, received_date: "", description: "", notes: "", auto_deduct_enabled: false };
const emptySchedEntry = { label: "", due_date: "", expected_amount: 0 };
const emptyRepay = { repayment_date: new Date().toISOString().slice(0, 10), amount: 0, method: "cash", reference: "", notes: "" };

const CurrentAccountsTab = () => {
  const [accounts, setAccounts] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [accountForm, setAccountForm] = useState(emptyAccount);
  const [accountSched, setAccountSched] = useState([]);
  const [newSched, setNewSched] = useState(emptySchedEntry);

  const [showRepayModal, setShowRepayModal] = useState(false);
  const [repayingAccount, setRepayingAccount] = useState(null);
  const [repayForm, setRepayForm] = useState(emptyRepay);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/current-accounts`);
      setAccounts(res.data.accounts || []);
      setSummary(res.data.summary || {});
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  // ---- Account CRUD ----
  const openAccountCreate = () => {
    setEditingAccount(null);
    setAccountForm({ ...emptyAccount, received_date: new Date().toISOString().slice(0, 10) });
    setAccountSched([]);
    setNewSched(emptySchedEntry);
    setShowAccountModal(true);
  };
  const openAccountEdit = (acc) => {
    setEditingAccount(acc);
    setAccountForm({
      name: acc.name, total_advance: acc.total_advance, received_date: acc.received_date || "",
      description: acc.description || "", notes: acc.notes || "",
      auto_deduct_enabled: !!acc.auto_deduct_enabled,
    });
    setAccountSched((acc.schedule || []).map((s, i) => ({
      id: s.id, label: s.label || "", due_date: s.due_date, expected_amount: s.expected_amount, _k: i + Date.now(),
    })));
    setShowAccountModal(true);
  };
  const addSchedEntry = () => {
    if (!newSched.due_date || !newSched.expected_amount) return toast.error("Date + montant requis");
    setAccountSched([...accountSched, { ...newSched, _k: Date.now() }]);
    setNewSched(emptySchedEntry);
  };
  const removeSchedEntry = (_k) => setAccountSched(accountSched.filter((s) => (s._k ?? s.id) !== _k));
  const saveAccount = async () => {
    if (!accountForm.name.trim() || !accountForm.total_advance) return toast.error("Nom et montant requis");
    const payload = {
      ...accountForm,
      total_advance: parseFloat(accountForm.total_advance) || 0,
      auto_deduct_enabled: !!accountForm.auto_deduct_enabled,
      schedule: accountSched.map((s) => ({
        label: s.label || "",
        due_date: s.due_date,
        expected_amount: parseFloat(s.expected_amount) || 0,
      })),
    };
    try {
      if (editingAccount) await axios.put(`${API}/current-accounts/${editingAccount.id}`, payload);
      else await axios.post(`${API}/current-accounts`, payload);
      toast.success(editingAccount ? "Compte mis à jour" : "Compte créé");
      setShowAccountModal(false);
      fetchAccounts();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };
  const deleteAccount = async (id) => {
    if (!confirm("Supprimer ce compte et tous ses remboursements ?")) return;
    try { await axios.delete(`${API}/current-accounts/${id}`); toast.success("Supprimé"); fetchAccounts(); }
    catch (e) { toast.error("Erreur"); }
  };

  // ---- Repayment ----
  const openRepay = (acc) => {
    setRepayingAccount(acc);
    setRepayForm({
      ...emptyRepay,
      amount: acc.next_due_amount || Math.min(acc.balance_remaining, 0) || 0,
    });
    setShowRepayModal(true);
  };
  const saveRepay = async () => {
    const amt = parseFloat(repayForm.amount) || 0;
    if (amt <= 0) return toast.error("Montant requis");
    try {
      await axios.post(`${API}/current-accounts/${repayingAccount.id}/repayments`, {
        ...repayForm,
        amount: amt,
      });
      toast.success("Remboursement enregistré");
      setShowRepayModal(false);
      fetchAccounts();
    } catch (e) { toast.error("Erreur"); }
  };
  const deleteRepay = async (accountId, repayId) => {
    if (!confirm("Supprimer ce remboursement ?")) return;
    try {
      await axios.delete(`${API}/current-accounts/${accountId}/repayments/${repayId}`);
      toast.success("Supprimé");
      fetchAccounts();
    } catch (e) { toast.error("Erreur"); }
  };

  // ---- Auto-deduction ----
  const runAutoDeduction = async () => {
    if (!confirm("Lancer le prélèvement automatique sur les recettes du jour ?")) return;
    try {
      const res = await axios.post(`${API}/current-accounts/run-auto-deduction`, {
        date: new Date().toISOString().slice(0, 10),
      });
      const nbCreated = res.data?.repayments_created || 0;
      const amount = res.data?.total_deducted || 0;
      if (nbCreated > 0) {
        toast.success(`${nbCreated} remboursement(s) auto pour un total de ${formatPrice(amount)} F`);
      } else {
        toast.info("Aucun prélèvement effectué (pas de recettes suffisantes ou aucune échéance due)");
      }
      fetchAccounts();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors du prélèvement");
    }
  };

  return (
    <div className="space-y-4" data-testid="current-accounts-tab">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-emerald-300 flex items-center gap-2">
          <Wallet className="w-6 h-6" />
          Compte courant — Avances du promoteur
        </h2>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={runAutoDeduction} variant="outline"
            className="border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/20"
            data-testid="run-auto-deduction-btn">
            <TrendingDown className="w-4 h-4 mr-2" /> Prélèvement auto du jour
          </Button>
          <Button onClick={openAccountCreate} className="bg-emerald-600 hover:bg-emerald-700" data-testid="new-account-btn">
            <Plus className="w-4 h-4 mr-2" /> Nouvelle avance
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-3">
            <div className="text-xs text-slate-400">Total avancé</div>
            <div className="text-lg font-bold text-slate-200">{formatPrice(summary.total_advance || 0)} F</div>
          </CardContent>
        </Card>
        <Card className="bg-emerald-900/30 border-emerald-500/50">
          <CardContent className="p-3">
            <div className="text-xs text-emerald-300">Total remboursé</div>
            <div className="text-lg font-bold text-emerald-300">{formatPrice(summary.total_repaid || 0)} F</div>
          </CardContent>
        </Card>
        <Card className="bg-amber-900/30 border-amber-500/50">
          <CardContent className="p-3">
            <div className="text-xs text-amber-300">Solde restant</div>
            <div className="text-lg font-bold text-amber-300">{formatPrice(summary.total_balance || 0)} F</div>
          </CardContent>
        </Card>
        <Card className={`${(summary.total_late || 0) > 0 ? "bg-rose-900/40 border-rose-500/60" : "bg-slate-800/50 border-slate-700"}`}>
          <CardContent className="p-3">
            <div className="text-xs text-rose-300">Retards</div>
            <div className="text-lg font-bold text-rose-300">{formatPrice(summary.total_late || 0)} F</div>
          </CardContent>
        </Card>
      </div>

      {/* Accounts list */}
      {loading ? (
        <div className="text-center text-slate-400 py-10">Chargement…</div>
      ) : accounts.length === 0 ? (
        <Card className="bg-slate-800/30 border-slate-700">
          <CardContent className="py-10 text-center text-slate-400">
            <Wallet className="w-12 h-12 mx-auto mb-2 opacity-40" />
            Aucune avance enregistrée
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {accounts.map((acc) => {
            const isExpanded = !!expanded[acc.id];
            const isFull = acc.is_fully_repaid;
            return (
              <Card key={acc.id} className={`${isFull ? "bg-emerald-900/20 border-emerald-600/40" : "bg-slate-800/50 border-slate-700"}`} data-testid={`account-card-${acc.id}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-start gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-bold">{acc.name}</span>
                        {isFull && (
                          <Badge className="bg-emerald-500/30 text-emerald-300">
                            <CheckCircle className="w-3 h-3 mr-1" /> Soldé
                          </Badge>
                        )}
                        {acc.auto_deduct_enabled && (
                          <Badge className="bg-cyan-500/30 text-cyan-300" data-testid={`auto-deduct-badge-${acc.id}`}>
                            <TrendingDown className="w-3 h-3 mr-1" /> Auto
                          </Badge>
                        )}
                        {acc.late_count > 0 && (
                          <Badge className="bg-rose-500/30 text-rose-300">
                            <AlertTriangle className="w-3 h-3 mr-1" /> {acc.late_count} retard(s)
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Reçu le {acc.received_date} • {(acc.description || "").slice(0, 80)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-slate-200">
                        {formatPrice(acc.total_repaid)} / {formatPrice(acc.total_advance)} F
                      </div>
                      <div className="text-xs text-slate-400">Solde : <b className="text-amber-300">{formatPrice(acc.balance_remaining)} F</b></div>
                      {(acc.allocated_to_expenses || 0) > 0 && (
                        <div className="text-[11px] text-cyan-300 mt-0.5" data-testid={`allocated-${acc.id}`}>
                          ↳ {formatPrice(acc.allocated_to_expenses)} F utilisés pour achats
                        </div>
                      )}
                      <div className="text-[11px] text-emerald-300 font-semibold mt-0.5" data-testid={`available-${acc.id}`}>
                        Disponible : {formatPrice(acc.balance_available || 0)} F
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-700/40 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full ${isFull ? "bg-emerald-500" : "bg-amber-500"} transition-all`}
                      style={{ width: `${Math.min(100, acc.progress_pct)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">{acc.progress_pct}% remboursé</span>
                    {acc.next_due_date && !isFull && (
                      <span className="text-slate-300">
                        <Calendar className="w-3 h-3 inline mr-1" />
                        Prochaine échéance : {acc.next_due_date} • {formatPrice(acc.next_due_amount)} F
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap">
                    {!isFull && (
                      <Button size="sm" onClick={() => openRepay(acc)}
                        className="bg-emerald-600 hover:bg-emerald-700" data-testid={`repay-btn-${acc.id}`}>
                        <DollarSign className="w-3 h-3 mr-1" /> Enregistrer un remboursement
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setExpanded({ ...expanded, [acc.id]: !isExpanded })}
                      className="border-slate-600 text-slate-300 hover:bg-slate-700">
                      {isExpanded ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                      Détails
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openAccountEdit(acc)}
                      className="border-slate-600 text-slate-300 hover:bg-slate-700">
                      <Edit2 className="w-3 h-3 mr-1" /> Modifier
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => deleteAccount(acc.id)}
                      className="border-rose-500/50 text-rose-300 hover:bg-rose-500/20">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>

                  {/* Details */}
                  {isExpanded && (
                    <div className="space-y-3 pt-2 border-t border-slate-700">
                      {/* Schedule */}
                      {(acc.schedule || []).length > 0 && (
                        <div>
                          <div className="text-slate-300 text-xs font-medium mb-1 flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Échéancier prévu
                          </div>
                          <div className="bg-slate-900/40 rounded p-2 space-y-1">
                            {(acc.schedule || []).map((s, i) => (
                              <div key={s.id || i} className="flex justify-between items-center text-xs">
                                <div className="flex items-center gap-2">
                                  {s.paid ? <CheckCircle className="w-3 h-3 text-emerald-400" /> :
                                    s.is_late ? <AlertTriangle className="w-3 h-3 text-rose-400" /> :
                                    <Calendar className="w-3 h-3 text-slate-400" />}
                                  <span className={s.paid ? "text-emerald-300 line-through" : s.is_late ? "text-rose-300" : "text-slate-300"}>
                                    {s.due_date}{s.label ? ` • ${s.label}` : ""}
                                  </span>
                                </div>
                                <span className={s.paid ? "text-emerald-300" : "text-slate-200"}>
                                  {formatPrice(s.expected_amount)} F
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Repayments */}
                      <div>
                        <div className="text-slate-300 text-xs font-medium mb-1 flex items-center gap-1">
                          <Banknote className="w-3 h-3" /> Remboursements effectués ({(acc.repayments || []).length})
                        </div>
                        {(acc.repayments || []).length === 0 ? (
                          <div className="text-slate-500 text-xs italic">Aucun remboursement pour le moment</div>
                        ) : (
                          <div className="bg-slate-900/40 rounded p-2 space-y-1">
                            {(acc.repayments || []).slice().reverse().map((r) => (
                              <div key={r.id} className="flex justify-between items-center text-xs">
                                <div className="text-slate-300">
                                  <span className="text-emerald-400 mr-2">✓</span>
                                  {r.repayment_date} — {r.method === 'auto_deduction' ? 'Prélèvement auto' : r.method}
                                  {r.auto && <Badge className="ml-1 bg-cyan-500/30 text-cyan-300 text-[10px] py-0 px-1">AUTO</Badge>}
                                  {r.reference && <span className="text-slate-500"> ({r.reference})</span>}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-emerald-300 font-medium">{formatPrice(r.amount)} F</span>
                                  <Button size="sm" variant="ghost" onClick={() => deleteRepay(acc.id, r.id)}
                                    className="text-rose-400 h-5 w-5 p-0">
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {acc.notes && <div className="text-xs text-slate-400 italic">« {acc.notes} »</div>}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ======= Account modal ======= */}
      <Dialog open={showAccountModal} onOpenChange={setShowAccountModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-emerald-300">
              {editingAccount ? "Modifier l'avance" : "Nouvelle avance du promoteur"}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Enregistrez le montant total reçu et planifiez les remboursements. L'échéancier est optionnel.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label className="text-slate-300 text-sm">Nom / Libellé *</Label>
                <Input value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                  placeholder="Ex : Avance équipement cuisine"
                  className="bg-slate-700/50 border-slate-600 text-white"
                  data-testid="account-name-input" />
              </div>
              <div>
                <Label className="text-slate-300 text-sm">Montant total (F) *</Label>
                <Input type="number" value={accountForm.total_advance} onChange={(e) => setAccountForm({ ...accountForm, total_advance: e.target.value })}
                  className="bg-slate-700/50 border-slate-600 text-white text-lg font-bold"
                  data-testid="account-amount-input" />
              </div>
              <div>
                <Label className="text-slate-300 text-sm">Date de réception</Label>
                <Input type="date" value={accountForm.received_date} onChange={(e) => setAccountForm({ ...accountForm, received_date: e.target.value })}
                  className="bg-slate-700/50 border-slate-600 text-white" />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-slate-300 text-sm">Description</Label>
                <Input value={accountForm.description} onChange={(e) => setAccountForm({ ...accountForm, description: e.target.value })}
                  placeholder="But de l'avance..."
                  className="bg-slate-700/50 border-slate-600 text-white" />
              </div>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 bg-cyan-900/20 border border-cyan-500/30 rounded p-3 cursor-pointer hover:bg-cyan-900/30">
                  <input
                    type="checkbox"
                    checked={!!accountForm.auto_deduct_enabled}
                    onChange={(e) => setAccountForm({ ...accountForm, auto_deduct_enabled: e.target.checked })}
                    className="w-4 h-4 accent-cyan-400"
                    data-testid="auto-deduct-toggle"
                  />
                  <div className="flex-1">
                    <div className="text-cyan-300 text-sm font-medium flex items-center gap-2">
                      <TrendingDown className="w-4 h-4" /> Prélèvement automatique sur recettes quotidiennes
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Les échéances dues seront automatiquement déduites des recettes validées du jour.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <Card className="bg-emerald-900/20 border-emerald-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-emerald-300 text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Échéancier prévu
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Input value={newSched.label} onChange={(e) => setNewSched({ ...newSched, label: e.target.value })}
                    placeholder="Libellé (ex: Mois 1)"
                    className="flex-1 min-w-[120px] bg-slate-700/50 border-slate-600 text-white" />
                  <Input type="date" value={newSched.due_date} onChange={(e) => setNewSched({ ...newSched, due_date: e.target.value })}
                    className="w-[160px] bg-slate-700/50 border-slate-600 text-white" />
                  <Input type="number" value={newSched.expected_amount || ""} onChange={(e) => setNewSched({ ...newSched, expected_amount: parseFloat(e.target.value) || 0 })}
                    placeholder="Montant" className="w-[120px] bg-slate-700/50 border-slate-600 text-white" />
                  <Button onClick={addSchedEntry} className="bg-emerald-600 hover:bg-emerald-700" data-testid="add-schedule-btn">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {accountSched.length > 0 && (
                  <div className="bg-slate-800/50 rounded p-2 space-y-1 max-h-[180px] overflow-y-auto">
                    {accountSched.map((s) => (
                      <div key={s._k || s.id} className="flex justify-between items-center text-xs bg-slate-700/30 rounded px-2 py-1">
                        <span className="text-slate-300">{s.due_date} • {s.label || "—"}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-300 font-medium">{formatPrice(s.expected_amount)} F</span>
                          <Button size="sm" variant="ghost" onClick={() => removeSchedEntry(s._k || s.id)} className="text-rose-400 h-6 w-6 p-0">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div>
              <Label className="text-slate-300 text-sm">Notes</Label>
              <Textarea value={accountForm.notes} onChange={(e) => setAccountForm({ ...accountForm, notes: e.target.value })}
                className="bg-slate-700/50 border-slate-600 text-white" />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowAccountModal(false)} className="border-slate-600 text-slate-300">Annuler</Button>
              <Button onClick={saveAccount} className="bg-emerald-600 hover:bg-emerald-700" data-testid="save-account-btn">
                <CheckCircle className="w-4 h-4 mr-2" /> Enregistrer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ======= Repayment modal ======= */}
      <Dialog open={showRepayModal} onOpenChange={setShowRepayModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-emerald-300 flex items-center gap-2">
              <DollarSign className="w-5 h-5" /> Remboursement — {repayingAccount?.name}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Solde restant : <b className="text-amber-300">{formatPrice(repayingAccount?.balance_remaining || 0)} F</b>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-slate-300 text-sm">Date</Label>
              <Input type="date" value={repayForm.repayment_date} onChange={(e) => setRepayForm({ ...repayForm, repayment_date: e.target.value })}
                className="bg-slate-700/50 border-slate-600 text-white" />
            </div>
            <div>
              <Label className="text-slate-300 text-sm">Montant (F)</Label>
              <Input type="number" value={repayForm.amount} onChange={(e) => setRepayForm({ ...repayForm, amount: e.target.value })}
                className="bg-slate-700/50 border-slate-600 text-white text-lg font-bold"
                data-testid="repay-amount-input" />
            </div>
            <div>
              <Label className="text-slate-300 text-sm">Méthode</Label>
              <Select value={repayForm.method} onValueChange={(v) => setRepayForm({ ...repayForm, method: v })}>
                <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="cash">Espèces</SelectItem>
                  <SelectItem value="bank_transfer">Virement bancaire</SelectItem>
                  <SelectItem value="mobile_money">Mobile money</SelectItem>
                  <SelectItem value="cheque">Chèque</SelectItem>
                  <SelectItem value="autre">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300 text-sm">Référence</Label>
              <Input value={repayForm.reference} onChange={(e) => setRepayForm({ ...repayForm, reference: e.target.value })}
                placeholder="VIR-001, REC-123..."
                className="bg-slate-700/50 border-slate-600 text-white" />
            </div>
            <div>
              <Label className="text-slate-300 text-sm">Notes</Label>
              <Input value={repayForm.notes} onChange={(e) => setRepayForm({ ...repayForm, notes: e.target.value })}
                className="bg-slate-700/50 border-slate-600 text-white" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowRepayModal(false)} className="border-slate-600 text-slate-300">Annuler</Button>
              <Button onClick={saveRepay} className="bg-emerald-600 hover:bg-emerald-700" data-testid="save-repay-btn">
                <CheckCircle className="w-4 h-4 mr-2" /> Enregistrer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CurrentAccountsTab;
