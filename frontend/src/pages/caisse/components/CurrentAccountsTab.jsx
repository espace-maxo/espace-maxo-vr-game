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
  CheckCircle, DollarSign, ChevronDown, ChevronUp, Banknote, Save, X,
  HandCoins, ExternalLink,
} from "lucide-react";

const API = (process.env.REACT_APP_BACKEND_URL || "") + "/api";
const formatPrice = (p) => new Intl.NumberFormat("fr-FR").format(Math.round(p || 0));

const emptyAccount = {
  name: "",
  total_advance: 0,
  received_date: "",
  description: "",
  notes: "",
  auto_deduct_enabled: false,
  repayment_percentage: "",
  repayment_fixed_amount: "",
  repayment_fixed_period: "weekly",
  repayment_fixed_start_date: "",
};
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

  // ============ GÉRANTE ADVANCES (read-only view, actions in Point Caisse) ============
  const [geranteAdvances, setGeranteAdvances] = useState([]);
  const [geranteFilter, setGeranteFilter] = useState("pending"); // pending | reimbursed | all
  const [geranteExpanded, setGeranteExpanded] = useState(false);

  const fetchGeranteAdvances = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/gerante-advances`, { params: { status: geranteFilter, limit: 500 } });
      setGeranteAdvances(r.data.advances || []);
    } catch {
      // silent
    }
  }, [geranteFilter]);

  useEffect(() => { fetchGeranteAdvances(); }, [fetchGeranteAdvances]);

  const geranteStats = React.useMemo(() => {
    const pending = geranteAdvances.filter((a) => a.status === "pending");
    const reimbursed = geranteAdvances.filter((a) => a.status === "reimbursed");
    return {
      pending_total: pending.reduce((s, a) => s + (a.amount || 0), 0),
      pending_count: pending.length,
      reimbursed_total: reimbursed.reduce((s, a) => s + (a.amount || 0), 0),
      reimbursed_count: reimbursed.length,
    };
  }, [geranteAdvances]);

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
      repayment_percentage: acc.repayment_percentage ?? "",
      repayment_fixed_amount: acc.repayment_fixed_amount ?? "",
      repayment_fixed_period: acc.repayment_fixed_period || "weekly",
      repayment_fixed_start_date: acc.repayment_fixed_start_date || "",
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
      repayment_percentage: accountForm.repayment_percentage === "" ? null : parseFloat(accountForm.repayment_percentage) || null,
      repayment_fixed_amount: accountForm.repayment_fixed_amount === "" ? null : parseFloat(accountForm.repayment_fixed_amount) || null,
      repayment_fixed_period: accountForm.repayment_fixed_amount ? accountForm.repayment_fixed_period : null,
      repayment_fixed_start_date: accountForm.repayment_fixed_amount ? (accountForm.repayment_fixed_start_date || null) : null,
      schedule: accountSched.map((s) => ({
        ...(s.id ? { id: s.id } : {}),
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

  // ---- Top-up ----
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAccount, setTopUpAccount] = useState(null);
  const [topUpForm, setTopUpForm] = useState({ amount: "", label: "Recharge manuelle" });

  const openTopUp = (acc) => {
    setTopUpAccount(acc);
    setTopUpForm({ amount: "", label: "Recharge manuelle" });
    setShowTopUpModal(true);
  };
  const saveTopUp = async () => {
    const amt = parseFloat(topUpForm.amount) || 0;
    if (amt <= 0) return toast.error("Montant requis (> 0)");
    try {
      await axios.post(`${API}/current-accounts/${topUpAccount.id}/top-up`, {
        amount: amt,
        label: topUpForm.label || "Recharge manuelle",
      });
      toast.success(`Compte rechargé de ${formatPrice(amt)} F`);
      setShowTopUpModal(false);
      fetchAccounts();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  // ---- Schedule edit + mark-paid ----
  const [editingScheduleId, setEditingScheduleId] = useState(null);
  const [scheduleEditForm, setScheduleEditForm] = useState({ label: "", due_date: "", expected_amount: 0 });

  const startEditSchedule = (s) => {
    setEditingScheduleId(s.id);
    setScheduleEditForm({
      label: s.label || "",
      due_date: s.due_date || "",
      expected_amount: s.expected_amount || 0,
    });
  };
  const cancelEditSchedule = () => setEditingScheduleId(null);

  const saveScheduleEdit = async (accountId, scheduleId) => {
    if (!scheduleEditForm.due_date) return toast.error("Date requise");
    const amt = parseFloat(scheduleEditForm.expected_amount) || 0;
    if (amt <= 0) return toast.error("Montant > 0 requis");
    try {
      await axios.put(`${API}/current-accounts/${accountId}/schedule/${scheduleId}`, {
        label: scheduleEditForm.label,
        due_date: scheduleEditForm.due_date,
        expected_amount: amt,
      });
      toast.success("Échéance mise à jour");
      setEditingScheduleId(null);
      fetchAccounts();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const deleteScheduleEntry = async (accountId, scheduleId) => {
    if (!window.confirm("Supprimer cette échéance ?")) return;
    try {
      await axios.delete(`${API}/current-accounts/${accountId}/schedule/${scheduleId}`);
      toast.success("Échéance supprimée");
      fetchAccounts();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const markScheduleAsPaid = async (accountId, sched) => {
    if (!window.confirm(
      `Marquer l'échéance "${sched.label || sched.due_date}" comme payée ?\n\n` +
      `Un remboursement de ${formatPrice(sched.expected_amount)} F sera créé automatiquement.`
    )) return;
    try {
      await axios.post(`${API}/current-accounts/${accountId}/schedule/${sched.id}/mark-paid`, {});
      toast.success("Échéance marquée comme payée");
      fetchAccounts();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  // Quick "Marquer payé" sur la carte du compte. Logique :
  //  1) S'il existe une échéance non-payée → on la marque payée (utilise mark-paid)
  //  2) Sinon, on enregistre un remboursement direct avec montant proposé
  //     (repayment_fixed_amount si défini, sinon balance_remaining)
  const quickMarkPaid = async (acc) => {
    const nextSched = (acc.schedule || []).find((s) => !s.paid);
    if (nextSched) {
      return markScheduleAsPaid(acc.id, nextSched);
    }
    const fixedAmt = parseFloat(acc.repayment_fixed_amount) || 0;
    const remaining = parseFloat(acc.balance_remaining) || 0;
    const proposed = fixedAmt > 0 && fixedAmt <= remaining ? fixedAmt : remaining;
    if (proposed <= 0) {
      return toast.error("Aucun montant à rembourser (compte déjà soldé)");
    }
    if (!window.confirm(
      `Enregistrer un remboursement de ${formatPrice(proposed)} F pour "${acc.name}" ?\n\n` +
      `(Montant ${fixedAmt > 0 ? "basé sur la planification fixe" : "= solde restant"})`
    )) return;
    try {
      await axios.post(`${API}/current-accounts/${acc.id}/repayments`, {
        repayment_date: new Date().toISOString().slice(0, 10),
        amount: proposed,
        method: "cash",
        reference: "Marqué payé",
        notes: "",
      });
      toast.success(`Remboursement de ${formatPrice(proposed)} F enregistré`);
      fetchAccounts();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
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

      {/* ============ DETTE CAISSE → GÉRANTE (avances Gérante pour monnaie) ============ */}
      <Card
        className={`border ${geranteStats.pending_total > 0 ? "bg-gradient-to-br from-purple-900/30 to-fuchsia-900/10 border-purple-500/50" : "bg-slate-900/40 border-slate-700"}`}
        data-testid="gerante-debt-card"
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${geranteStats.pending_total > 0 ? "bg-purple-500/30 text-purple-200" : "bg-slate-700/50 text-slate-400"}`}>
                <HandCoins className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-purple-200 flex items-center gap-2">
                  Dette caisse → Gérante
                  {geranteStats.pending_total > 0 && (
                    <Badge className="bg-purple-500/30 text-purple-100">
                      {formatPrice(geranteStats.pending_total)} F dû
                    </Badge>
                  )}
                </h3>
                <p className="text-xs text-slate-400">
                  Avances personnelles de la Gérante pour rendre la monnaie aux clients
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={geranteFilter} onValueChange={setGeranteFilter}>
                <SelectTrigger className="w-[180px] h-8 bg-slate-800 border-slate-700 text-white text-xs" data-testid="gerante-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 text-white border-slate-700">
                  <SelectItem value="pending">Dettes en cours</SelectItem>
                  <SelectItem value="reimbursed">Remboursées</SelectItem>
                  <SelectItem value="all">Tout l'historique</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { window.location.hash = "point-caisse"; toast.info("Allez dans l'onglet 'Point de la caisse' pour gérer les avances"); }}
                className="border-purple-500/50 text-purple-200 hover:bg-purple-500/10 h-8"
                data-testid="gerante-manage-link"
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1" /> Gérer
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setGeranteExpanded((v) => !v)}
                className="text-slate-300 hover:bg-slate-800 h-8"
                data-testid="gerante-toggle-history"
              >
                {geranteExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                <span className="ml-1 text-xs">{geranteExpanded ? "Masquer" : "Détails"}</span>
              </Button>
            </div>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-purple-500/10 border border-purple-500/30 rounded p-2">
              <p className="text-[10px] text-purple-300/80 uppercase">En cours</p>
              <p className="text-lg font-bold text-purple-300">{formatPrice(geranteStats.pending_total)} F</p>
              <p className="text-[10px] text-slate-500">{geranteStats.pending_count} avance(s)</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded p-2">
              <p className="text-[10px] text-emerald-300/80 uppercase">Remboursées (vue)</p>
              <p className="text-lg font-bold text-emerald-300">{formatPrice(geranteStats.reimbursed_total)} F</p>
              <p className="text-[10px] text-slate-500">{geranteStats.reimbursed_count} avance(s)</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded p-2">
              <p className="text-[10px] text-slate-400 uppercase">Total cumulé</p>
              <p className="text-lg font-bold text-slate-200">
                {formatPrice(geranteStats.pending_total + geranteStats.reimbursed_total)} F
              </p>
              <p className="text-[10px] text-slate-500">
                {geranteStats.pending_count + geranteStats.reimbursed_count} avance(s)
              </p>
            </div>
            <div className={`border rounded p-2 ${geranteStats.pending_total > 0 ? "bg-amber-500/10 border-amber-500/30" : "bg-slate-800/60 border-slate-700"}`}>
              <p className={`text-[10px] uppercase ${geranteStats.pending_total > 0 ? "text-amber-300" : "text-slate-400"}`}>Statut</p>
              <p className={`text-sm font-bold ${geranteStats.pending_total > 0 ? "text-amber-300" : "text-emerald-300"}`}>
                {geranteStats.pending_total > 0 ? "Dette active" : "Tout est réglé ✓"}
              </p>
            </div>
          </div>

          {/* Expanded history */}
          {geranteExpanded && (
            <div className="bg-slate-900/60 border border-slate-700 rounded" data-testid="gerante-history">
              {geranteAdvances.length === 0 ? (
                <p className="text-slate-500 text-sm italic text-center py-6">
                  Aucune avance{geranteFilter === "pending" ? " en cours" : geranteFilter === "reimbursed" ? " remboursée" : ""}.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-700 bg-slate-900/80">
                        <th className="p-2">Date</th>
                        <th className="p-2">Motif</th>
                        <th className="p-2 text-right">Montant</th>
                        <th className="p-2">Statut</th>
                        <th className="p-2">Remboursée le</th>
                        <th className="p-2">Par</th>
                      </tr>
                    </thead>
                    <tbody>
                      {geranteAdvances.map((a) => (
                        <tr key={a.id} className="border-b border-slate-800/50 hover:bg-slate-800/40" data-testid={`gerante-debt-row-${a.id}`}>
                          <td className="p-2 text-slate-400">{(a.created_at || "").slice(0, 16).replace("T", " ")}</td>
                          <td className="p-2 text-white">{a.reason || <em className="text-slate-500">—</em>}</td>
                          <td className="p-2 text-right font-bold text-purple-300">{formatPrice(a.amount)} F</td>
                          <td className="p-2">
                            {a.status === "pending" ? (
                              <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/40">En cours</Badge>
                            ) : (
                              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40">Remboursée</Badge>
                            )}
                          </td>
                          <td className="p-2 text-slate-400">{a.reimbursed_at ? a.reimbursed_at.slice(0, 16).replace("T", " ") : "—"}</td>
                          <td className="p-2 text-slate-500">{a.reimbursed_by || a.created_by || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
                            <TrendingDown className="w-3 h-3 mr-1" /> Planning
                          </Badge>
                        )}
                        {acc.repayment_percentage > 0 && (
                          <Badge className="bg-purple-500/30 text-purple-200" data-testid={`pct-badge-${acc.id}`}>
                            {acc.repayment_percentage}% / jour
                          </Badge>
                        )}
                        {acc.repayment_fixed_amount > 0 && acc.repayment_fixed_period && (
                          <Badge className="bg-amber-500/30 text-amber-200" data-testid={`fixed-badge-${acc.id}`}>
                            {formatPrice(acc.repayment_fixed_amount)} F / {
                              { daily: "jour", weekly: "semaine", monthly: "mois", yearly: "an" }[acc.repayment_fixed_period]
                            }
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
                      <Button size="sm" onClick={() => quickMarkPaid(acc)}
                        className="bg-blue-600 hover:bg-blue-700" data-testid={`quick-mark-paid-${acc.id}`}>
                        <CheckCircle className="w-3 h-3 mr-1" /> Marquer payé
                      </Button>
                    )}
                    {!isFull && (
                      <Button size="sm" onClick={() => openRepay(acc)}
                        className="bg-emerald-600 hover:bg-emerald-700" data-testid={`repay-btn-${acc.id}`}>
                        <DollarSign className="w-3 h-3 mr-1" /> Enregistrer un remboursement
                      </Button>
                    )}
                    <Button size="sm" onClick={() => openTopUp(acc)}
                      className="bg-amber-600 hover:bg-amber-700" data-testid={`topup-btn-${acc.id}`}>
                      <Plus className="w-3 h-3 mr-1" /> Recharger
                    </Button>
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
                          <div className="bg-slate-900/40 rounded p-2 space-y-1" data-testid={`schedule-list-${acc.id}`}>
                            {(acc.schedule || []).map((s, i) => {
                              const isEditing = editingScheduleId === s.id;
                              if (isEditing) {
                                return (
                                  <div key={s.id || i} className="flex flex-wrap items-center gap-2 text-xs bg-slate-800/60 border border-blue-500/40 rounded p-2" data-testid={`schedule-edit-${s.id}`}>
                                    <Input
                                      type="date"
                                      value={scheduleEditForm.due_date}
                                      onChange={(e) => setScheduleEditForm({ ...scheduleEditForm, due_date: e.target.value })}
                                      className="h-7 w-36 bg-slate-900 border-slate-600 text-white text-xs"
                                    />
                                    <Input
                                      placeholder="Libellé"
                                      value={scheduleEditForm.label}
                                      onChange={(e) => setScheduleEditForm({ ...scheduleEditForm, label: e.target.value })}
                                      className="h-7 flex-1 min-w-[140px] bg-slate-900 border-slate-600 text-white text-xs"
                                    />
                                    <Input
                                      type="number"
                                      step="any"
                                      placeholder="Montant"
                                      value={scheduleEditForm.expected_amount}
                                      onChange={(e) => setScheduleEditForm({ ...scheduleEditForm, expected_amount: e.target.value })}
                                      className="h-7 w-28 bg-slate-900 border-slate-600 text-white text-xs text-right"
                                    />
                                    <Button size="sm" onClick={() => saveScheduleEdit(acc.id, s.id)}
                                      className="h-7 px-2 bg-blue-600 hover:bg-blue-700" data-testid={`schedule-save-${s.id}`}>
                                      <Save className="w-3 h-3" />
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={cancelEditSchedule} className="h-7 px-2 text-slate-400">
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </div>
                                );
                              }
                              return (
                                <div key={s.id || i} className="flex justify-between items-center text-xs" data-testid={`schedule-row-${s.id}`}>
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    {s.paid ? <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" /> :
                                      s.is_late ? <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" /> :
                                      <Calendar className="w-3 h-3 text-slate-400 shrink-0" />}
                                    <span className={`truncate ${s.paid ? "text-emerald-300 line-through" : s.is_late ? "text-rose-300" : "text-slate-300"}`}>
                                      {s.due_date}{s.label ? ` • ${s.label}` : ""}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <span className={s.paid ? "text-emerald-300" : "text-slate-200"}>
                                      {formatPrice(s.expected_amount)} F
                                    </span>
                                    {!s.paid && (
                                      <Button size="sm" variant="ghost"
                                        onClick={() => markScheduleAsPaid(acc.id, s)}
                                        className="h-6 w-6 p-0 text-emerald-400 hover:bg-emerald-500/20"
                                        title="Marquer comme payé"
                                        data-testid={`schedule-mark-paid-${s.id}`}>
                                        <CheckCircle className="w-3.5 h-3.5" />
                                      </Button>
                                    )}
                                    <Button size="sm" variant="ghost"
                                      onClick={() => startEditSchedule(s)}
                                      className="h-6 w-6 p-0 text-blue-400 hover:bg-blue-500/20"
                                      title="Modifier les conditions"
                                      data-testid={`schedule-edit-btn-${s.id}`}>
                                      <Edit2 className="w-3 h-3" />
                                    </Button>
                                    <Button size="sm" variant="ghost"
                                      onClick={() => deleteScheduleEntry(acc.id, s.id)}
                                      className="h-6 w-6 p-0 text-rose-400 hover:bg-rose-500/20"
                                      title="Supprimer"
                                      data-testid={`schedule-delete-${s.id}`}>
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
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

                      {/* Top-ups history (manual + auto from expense over-allocation) */}
                      {(acc.top_ups || []).length > 0 && (
                        <div>
                          <div className="text-slate-300 text-xs font-medium mb-1 flex items-center gap-1">
                            <Plus className="w-3 h-3 text-amber-400" /> Recharges ({(acc.top_ups || []).length})
                          </div>
                          <div className="bg-amber-900/15 border border-amber-500/20 rounded p-2 space-y-1" data-testid={`top-ups-list-${acc.id}`}>
                            {(acc.top_ups || []).slice().reverse().map((t) => (
                              <div key={t.id} className="flex justify-between items-center text-xs">
                                <div className="text-slate-300">
                                  <span className="text-amber-300 mr-2">+</span>
                                  {(t.received_date || (t.created_at || '').slice(0,10))} — {t.label}
                                </div>
                                <span className="text-amber-300 font-medium">+{formatPrice(t.amount)} F</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

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
                      <TrendingDown className="w-4 h-4" /> Prélèvement selon l'échéancier prévu
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Prélève automatiquement les échéances dues définies ci-dessous sur les recettes validées du jour.
                    </div>
                  </div>
                </label>
              </div>

              {/* MODE 2 — Pourcentage des recettes */}
              <div className="sm:col-span-2 bg-purple-900/20 border border-purple-500/30 rounded p-3">
                <div className="flex items-center gap-2 mb-2">
                  <label className="flex items-center gap-2 cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={Number(accountForm.repayment_percentage) > 0}
                      onChange={(e) => setAccountForm({
                        ...accountForm,
                        repayment_percentage: e.target.checked ? (accountForm.repayment_percentage || 5) : "",
                      })}
                      className="w-4 h-4 accent-purple-400"
                      data-testid="pct-mode-toggle"
                    />
                    <span className="text-purple-300 text-sm font-medium">% des recettes journalières (cumul soir)</span>
                  </label>
                  <Input
                    type="number" min="0" max="100" step="0.1"
                    value={accountForm.repayment_percentage ?? ""}
                    onChange={(e) => setAccountForm({
                      ...accountForm,
                      repayment_percentage: e.target.value === "" ? "" : parseFloat(e.target.value.replace(",", ".")),
                    })}
                    placeholder="5"
                    className="w-[90px] bg-slate-700/50 border-slate-600 text-white text-right"
                    data-testid="pct-value-input"
                  />
                  <span className="text-purple-300 text-sm">%</span>
                </div>
                <div className="text-xs text-slate-400">
                  Chaque soir, ce pourcentage est prélevé sur les recettes validées du jour.
                </div>
              </div>

              {/* MODE 3 — Montant fixe par période */}
              <div className="sm:col-span-2 bg-amber-900/20 border border-amber-500/30 rounded p-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Number(accountForm.repayment_fixed_amount) > 0}
                    onChange={(e) => setAccountForm({
                      ...accountForm,
                      repayment_fixed_amount: e.target.checked ? (accountForm.repayment_fixed_amount || 10000) : "",
                    })}
                    className="w-4 h-4 accent-amber-400"
                    data-testid="fixed-mode-toggle"
                  />
                  <span className="text-amber-300 text-sm font-medium">Montant fixe par période (fin de période)</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-slate-400 text-xs">Montant (F)</Label>
                    <Input
                      type="number" min="0" step="any"
                      value={accountForm.repayment_fixed_amount ?? ""}
                      onChange={(e) => setAccountForm({
                        ...accountForm,
                        repayment_fixed_amount: e.target.value === "" ? "" : parseFloat(e.target.value.replace(",", ".")),
                      })}
                      placeholder="10000"
                      className="bg-slate-700/50 border-slate-600 text-white"
                      data-testid="fixed-amount-input"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs">Période</Label>
                    <select
                      value={accountForm.repayment_fixed_period || "weekly"}
                      onChange={(e) => setAccountForm({ ...accountForm, repayment_fixed_period: e.target.value })}
                      className="w-full bg-slate-700/50 border border-slate-600 text-white rounded px-2 py-2 text-sm"
                      data-testid="fixed-period-select"
                    >
                      <option value="daily">Chaque jour</option>
                      <option value="weekly">Chaque semaine (dimanche)</option>
                      <option value="monthly">Chaque mois (dernier jour)</option>
                      <option value="yearly">Chaque année (31 déc.)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <Label className="text-slate-400 text-xs">Date de démarrage (optionnel)</Label>
                  <Input
                    type="date"
                    value={accountForm.repayment_fixed_start_date || ""}
                    onChange={(e) => setAccountForm({ ...accountForm, repayment_fixed_start_date: e.target.value })}
                    className="bg-slate-700/50 border-slate-600 text-white"
                    data-testid="fixed-start-input"
                  />
                </div>
                <div className="text-xs text-slate-400">
                  Le prélèvement est effectué automatiquement le dernier jour de chaque période.
                </div>
              </div>

              <div className="sm:col-span-2 text-[11px] text-slate-400 bg-slate-700/20 rounded p-2 border border-slate-600/30">
                💡 Vous pouvez cumuler ces 3 modes automatiques + ajouter des <b className="text-slate-200">remboursements manuels</b> à tout moment depuis la fiche du compte.
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

      {/* ============== TOP-UP MODAL ============== */}
      <Dialog open={showTopUpModal} onOpenChange={setShowTopUpModal}>
        <DialogContent className="bg-slate-900 border-amber-500/40 text-white sm:max-w-md" data-testid="topup-modal">
          <DialogHeader>
            <DialogTitle className="text-amber-300">
              ➕ Recharger « {topUpAccount?.name} »
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Augmenter le solde de l'avance promoteur. Le solde actuel passera de{" "}
              <strong className="text-white">{formatPrice(topUpAccount?.total_advance || 0)} F</strong>{" "}
              à{" "}
              <strong className="text-amber-300">
                {formatPrice((topUpAccount?.total_advance || 0) + (parseFloat(topUpForm.amount) || 0))} F
              </strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label className="text-slate-300">Montant à recharger (F CFA)</Label>
              <Input
                type="number"
                step="any"
                value={topUpForm.amount}
                onChange={(e) => setTopUpForm({ ...topUpForm, amount: e.target.value })}
                placeholder="0"
                className="bg-slate-700/50 border-slate-600 text-white"
                data-testid="topup-amount-input"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-slate-300">Libellé (optionnel)</Label>
              <Input
                value={topUpForm.label}
                onChange={(e) => setTopUpForm({ ...topUpForm, label: e.target.value })}
                placeholder="Recharge manuelle"
                className="bg-slate-700/50 border-slate-600 text-white"
                data-testid="topup-label-input"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowTopUpModal(false)} className="border-slate-600 text-slate-300">
                Annuler
              </Button>
              <Button onClick={saveTopUp} className="bg-amber-600 hover:bg-amber-700" data-testid="save-topup-btn">
                <Plus className="w-4 h-4 mr-2" /> Recharger
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default CurrentAccountsTab;
