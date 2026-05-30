/**
 * PointCaisseTab - "Point de la Caisse" (Z journalier)
 * Admin-only complete cash register view :
 *   - Live : situation temps réel pour aujourd'hui (encaissements par mode, pourboires, dépenses, solde net)
 *   - Z journalier : clôture du jour avec déclaration des espèces comptées + écart auto
 *   - Historique : Z des derniers jours (max 60), consultable + suppression admin
 */
import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Banknote, Smartphone, CreditCard, Building2, Wallet, Receipt,
  TrendingUp, TrendingDown, Lock, Unlock, History, RefreshCw, Trash2, AlertTriangle, CheckCircle2,
  HandCoins, Plus, Undo2,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmt = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n || 0));

const METHOD_META = {
  cash:            { label: "Espèces",         icon: Banknote,    color: "text-emerald-300", bg: "bg-emerald-500/15 border-emerald-500/40" },
  mobile:          { label: "Mobile Money",    icon: Smartphone,  color: "text-orange-300",  bg: "bg-orange-500/15 border-orange-500/40" },
  card:            { label: "Carte bancaire",  icon: CreditCard,  color: "text-blue-300",    bg: "bg-blue-500/15 border-blue-500/40" },
  transfer:        { label: "Virement / Chèque",icon: Building2,  color: "text-cyan-300",    bg: "bg-cyan-500/15 border-cyan-500/40" },
  current_account: { label: "Compte courant",  icon: Wallet,      color: "text-purple-300",  bg: "bg-purple-500/15 border-purple-500/40" },
  other:           { label: "Autre",           icon: Receipt,     color: "text-slate-300",   bg: "bg-slate-500/15 border-slate-500/40" },
};

const MethodCard = ({ method, data }) => {
  const meta = METHOD_META[method] || METHOD_META.other;
  const Icon = meta.icon;
  return (
    <Card className={`${meta.bg} border`}>
      <CardContent className="p-4 text-center">
        <Icon className={`w-6 h-6 mx-auto mb-1 ${meta.color}`} />
        <p className={`text-2xl font-bold ${meta.color}`}>{fmt(data.amount)} F</p>
        <p className="text-xs text-slate-400">{meta.label} · {data.count} fact.</p>
      </CardContent>
    </Card>
  );
};

const PointCaisseTab = ({ currentUser }) => {
  const today = format(new Date(), "yyyy-MM-dd");
  const [date, setDate] = useState(today);
  // Force la Resp. Op. à toujours rester sur la date du jour
  useEffect(() => {
    if (currentUser && currentUser.role !== 'admin' && date !== today) {
      setDate(today);
    }
  }, [currentUser, date, today]);
  const [snapshot, setSnapshot] = useState(null);
  const [closures, setClosures] = useState([]);
  const [declaredCash, setDeclaredCash] = useState(0);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [view, setView] = useState("live"); // live | history
  const [expandedId, setExpandedId] = useState(null);

  // ============ Avances Responsable Op. & Log ============
  const [advances, setAdvances] = useState([]);
  const [advanceForm, setAdvanceForm] = useState({ amount: "", reason: "" });
  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [advanceLoading, setAdvanceLoading] = useState(false);

  const fetchAdvances = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/gerante-advances`, { params: { status: "pending" } });
      setAdvances(r.data.advances || []);
    } catch {
      // silent
    }
  }, []);

  const createAdvance = async () => {
    const amount = Number(advanceForm.amount);
    if (!amount || amount <= 0) {
      toast.error("Montant invalide");
      return;
    }
    setAdvanceLoading(true);
    try {
      await axios.post(`${API}/gerante-advances`, {
        amount,
        reason: advanceForm.reason || "",
        created_by: currentUser?.full_name || currentUser?.username || "Responsable Op. & Log",
      });
      toast.success(`Avance de ${fmt(amount)} F enregistrée`);
      setAdvanceForm({ amount: "", reason: "" });
      setShowAdvanceForm(false);
      await Promise.all([fetchAdvances(), fetchSnapshot(date)]);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur enregistrement");
    } finally {
      setAdvanceLoading(false);
    }
  };

  const reimburseAdvance = async (id, amount) => {
    if (!confirm(`Rembourser ${fmt(amount)} F à la Responsable Op. & Log depuis la caisse ?\n\nCela retire cette somme du surplus espèces attendu.`)) return;
    try {
      await axios.post(`${API}/gerante-advances/${id}/reimburse`, {
        reimbursed_by: currentUser?.full_name || currentUser?.username || "Responsable Op. & Log",
      });
      toast.success("Avance remboursée");
      await Promise.all([fetchAdvances(), fetchSnapshot(date)]);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur remboursement");
    }
  };

  const reimburseAllAdvances = async () => {
    if (advances.length === 0) return;
    const totalPending = advances.reduce((s, a) => s + (a.amount || 0), 0);
    if (!confirm(`Rembourser TOUTES les avances en attente (${advances.length} × total ${fmt(totalPending)} F) ?`)) return;
    try {
      const r = await axios.post(`${API}/gerante-advances/reimburse-all`, {
        reimbursed_by: currentUser?.full_name || currentUser?.username || "Responsable Op. & Log",
      });
      toast.success(`${r.data.count} avance(s) remboursée(s) · ${fmt(r.data.total_amount)} F`);
      await Promise.all([fetchAdvances(), fetchSnapshot(date)]);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur remboursement groupé");
    }
  };

  const deleteAdvance = async (id) => {
    if (!confirm("Supprimer cette avance ?")) return;
    try {
      await axios.delete(`${API}/gerante-advances/${id}`);
      toast.success("Avance supprimée");
      await Promise.all([fetchAdvances(), fetchSnapshot(date)]);
    } catch (e) {
      toast.error("Erreur suppression");
    }
  };

  const fetchSnapshot = async (d = date) => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/cash-closures/live`, { params: { date: d } });
      setSnapshot(r.data.snapshot);
    } catch (e) {
      toast.error("Erreur chargement snapshot");
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const r = await axios.get(`${API}/cash-closures`, { params: { limit: 60 } });
      setClosures(r.data.closures || []);
    } catch (e) {
      // silent
    }
  };

  useEffect(() => {
    fetchSnapshot(date);
    fetchHistory();
    fetchAdvances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const closeDay = async () => {
    if (!confirm(`Clôturer la caisse du ${format(parseISO(date), "dd/MM/yyyy")} ?\n\nUn Z sera enregistré et apparaîtra dans l'historique.`)) return;
    setClosing(true);
    try {
      await axios.post(`${API}/cash-closures`, {
        date,
        declared_cash: Number(declaredCash) || 0,
        notes: notes || null,
        closed_by: currentUser?.full_name || currentUser?.username || "Administrateur",
      });
      toast.success("Caisse clôturée — Z enregistré");
      setDeclaredCash(0);
      setNotes("");
      await Promise.all([fetchSnapshot(date), fetchHistory()]);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur clôture");
    } finally {
      setClosing(false);
    }
  };

  const deleteClosure = async (id) => {
    if (!confirm("Supprimer ce Z et rouvrir la journée ?")) return;
    try {
      await axios.delete(`${API}/cash-closures/${id}`);
      toast.success("Z supprimé");
      await Promise.all([fetchSnapshot(date), fetchHistory()]);
    } catch (e) {
      toast.error("Erreur suppression");
    }
  };

  const printZ = (closure) => {
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    const s = closure.snapshot;
    const rows = Object.entries(s.per_method)
      .filter(([_, v]) => v.count > 0)
      .map(([k, v]) => `<tr><td>${METHOD_META[k]?.label || k}</td><td style="text-align:right">${fmt(v.amount)} F</td></tr>`)
      .join("");
    w.document.write(`
      <html><head><title>Z ${closure.date}</title>
      <style>body{font-family:monospace;font-size:12px;padding:10px}table{width:100%;border-collapse:collapse}td{padding:3px 0}hr{border:none;border-top:1px dashed #000}.b{font-weight:bold}.c{text-align:center}.r{text-align:right}</style>
      </head><body>
      <div class="c"><strong>ESPACE MAXO</strong><br>POINT DE LA CAISSE - Z<br>${format(parseISO(closure.date), "dd/MM/yyyy")}</div>
      <hr>
      <p>Clôturé par : ${closure.closed_by}</p>
      <p>Heure : ${format(parseISO(closure.created_at), "HH:mm")}</p>
      <hr>
      <p class="b">ENCAISSEMENTS PAR MODE</p>
      <table>${rows || "<tr><td>—</td></tr>"}</table>
      <hr>
      <table>
        <tr><td>Total factures</td><td class="r">${fmt(s.invoices_total)} F (${s.invoices_count})</td></tr>
        <tr><td>Pourboires</td><td class="r">${fmt(s.tips_total)} F</td></tr>
        <tr><td>Dépenses payées</td><td class="r">- ${fmt(s.expenses_total)} F</td></tr>
        <tr class="b"><td>SOLDE NET</td><td class="r">${fmt(s.net_balance)} F</td></tr>
      </table>
      <hr>
      <p class="b">CONTRÔLE ESPÈCES</p>
      <table>
        <tr><td>Théorique</td><td class="r">${fmt(s.per_method.cash.amount)} F</td></tr>
        <tr><td>Déclaré</td><td class="r">${fmt(closure.declared_cash || 0)} F</td></tr>
        <tr class="b"><td>Écart</td><td class="r">${(closure.gap_cash >= 0 ? "+" : "")}${fmt(closure.gap_cash)} F</td></tr>
      </table>
      ${closure.notes ? `<hr><p>Notes : ${closure.notes}</p>` : ""}
      <hr>
      <p class="c">Espace Maxo - Cotonou</p>
      </body></html>
    `);
    w.document.close();
    w.print();
  };

  const s = snapshot;
  const isToday = date === today;
  const expectedCash = s?.expected_cash_in_drawer ?? s?.per_method?.cash?.amount ?? 0;
  const cashGapPreview = (Number(declaredCash) || 0) - expectedCash;
  const pendingAdvancesTotal = advances.reduce((sum, a) => sum + (a.amount || 0), 0);

  return (
    <div className="space-y-4" data-testid="point-caisse-tab">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-emerald-300 flex items-center gap-2">
          <Receipt className="w-7 h-7" />
          Point de la Caisse
          <Badge className="bg-emerald-500/30 text-emerald-200 ml-2">Z journalier</Badge>
        </h2>
        <div className="flex items-center gap-2">
          {/* Date picker — Admin only (la Resp. Op. ne voit que le jour) */}
          {currentUser?.role === 'admin' ? (
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white w-auto"
              data-testid="point-caisse-date"
            />
          ) : (
            <Badge className="bg-slate-700 text-slate-300">Aujourd'hui</Badge>
          )}
          <Button onClick={() => fetchSnapshot(date)} variant="outline" size="sm" className="border-slate-700 text-slate-300">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <Tabs value={view} onValueChange={setView}>
        <TabsList className="bg-slate-800/60 border border-slate-700">
          <TabsTrigger value="live" className="data-[state=active]:bg-emerald-600" data-testid="point-caisse-tab-live">
            <TrendingUp className="w-4 h-4 mr-1" /> Vue {isToday ? "live" : "du jour"}
          </TabsTrigger>
          {currentUser?.role === 'admin' && (
            <TabsTrigger value="history" className="data-[state=active]:bg-cyan-600" data-testid="point-caisse-tab-history">
              <History className="w-4 h-4 mr-1" /> Historique ({closures.length})
            </TabsTrigger>
          )}
        </TabsList>

        {/* ============== LIVE ============== */}
        <TabsContent value="live" className="space-y-4 mt-4">
          {!s ? (
            <p className="text-slate-400 text-center py-8">Chargement…</p>
          ) : (
            <>
              {s.already_closed && (
                <div className="bg-amber-500/10 border border-amber-500/40 rounded-lg p-3 flex items-start gap-2 text-amber-200 text-sm">
                  <Lock className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Cette journée est <strong>déjà clôturée</strong>. Allez dans l'onglet <em>Historique</em> pour la consulter ou la supprimer.</span>
                </div>
              )}

              {/* Encaissements par mode */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-emerald-300 text-base">Encaissements par mode de paiement</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {["cash", "mobile", "card", "transfer", "current_account", "other"].map(m => (
                      <MethodCard key={m} method={m} data={s.per_method[m]} />
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Synthèse */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-cyan-300 text-base">Synthèse de la journée</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-3 text-center">
                      <p className="text-xs text-emerald-300/70 uppercase">Total factures</p>
                      <p className="text-2xl font-bold text-emerald-300">{fmt(s.invoices_total)} F</p>
                      <p className="text-xs text-slate-400">{s.invoices_count} facture(s)</p>
                    </div>
                    <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3 text-center">
                      <p className="text-xs text-amber-300/70 uppercase">Pourboires</p>
                      <p className="text-2xl font-bold text-amber-300">{fmt(s.tips_total)} F</p>
                    </div>
                    <div className="bg-rose-900/20 border border-rose-500/30 rounded-lg p-3 text-center">
                      <p className="text-xs text-rose-300/70 uppercase">Dépenses payées</p>
                      <p className="text-2xl font-bold text-rose-300">- {fmt(s.expenses_total)} F</p>
                      <p className="text-xs text-slate-400">{s.expenses_count} dépense(s)</p>
                    </div>
                    <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 text-center">
                      <p className="text-xs text-blue-300/70 uppercase">Solde net</p>
                      <p className={`text-2xl font-bold ${s.net_balance >= 0 ? "text-blue-300" : "text-rose-300"}`}>
                        {fmt(s.net_balance)} F
                      </p>
                    </div>
                  </div>
                  {/* === Achats Manager — Fonds Propres remboursés aujourd'hui === */}
                  {(s.fonds_propres_reimbursed_today_count > 0 || s.fonds_propres_pending_count > 0) && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="fonds-propres-summary">
                      <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Wallet className="w-4 h-4 text-purple-300" />
                          <p className="text-xs text-purple-300/80 uppercase tracking-wider">Fonds Propres remboursés (jour)</p>
                        </div>
                        <p className="text-2xl font-bold text-purple-200" data-testid="fp-reimbursed-today-amount">
                          - {fmt(s.fonds_propres_reimbursed_today_total)} F
                        </p>
                        <p className="text-xs text-purple-300/60">
                          {s.fonds_propres_reimbursed_today_count} remboursement(s) effectué(s) aujourd'hui
                        </p>
                      </div>
                      <div className="bg-rose-900/20 border border-rose-500/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Wallet className="w-4 h-4 text-rose-300" />
                          <p className="text-xs text-rose-300/80 uppercase tracking-wider">Fonds Propres en attente</p>
                        </div>
                        <p className="text-2xl font-bold text-rose-200">
                          {fmt(s.fonds_propres_pending_total)} F
                        </p>
                        <p className="text-xs text-rose-300/60">
                          {s.fonds_propres_pending_count} dépense(s) à rembourser (Achats Manager)
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ============ AVANCES RESPONSABLE OP. & LOG ============ */}
              <Card className="bg-gradient-to-br from-purple-900/20 to-fuchsia-900/10 border-purple-500/40" data-testid="gerante-advances-section">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-purple-200 flex items-center gap-2 text-base">
                      <HandCoins className="w-5 h-5" />
                      Avances de la Responsable Op. & Log (monnaie sur fonds personnels)
                      {pendingAdvancesTotal > 0 && (
                        <Badge className="bg-purple-500/30 text-purple-100 ml-1">
                          {fmt(pendingAdvancesTotal)} F en attente
                        </Badge>
                      )}
                    </CardTitle>
                    <div className="flex gap-2">
                      {advances.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={reimburseAllAdvances}
                          className="border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10"
                          data-testid="reimburse-all-advances"
                        >
                          <Undo2 className="w-4 h-4 mr-1" /> Tout rembourser
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={() => setShowAdvanceForm((v) => !v)}
                        className="bg-purple-600 hover:bg-purple-700"
                        data-testid="toggle-advance-form"
                      >
                        <Plus className="w-4 h-4 mr-1" /> Nouvelle avance
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Quand la caisse n'a pas de monnaie à rendre, la Responsable Op. & Log peut avancer ses propres fonds. Elle se fait rembourser plus tard depuis la caisse.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {showAdvanceForm && (
                    <div className="grid grid-cols-1 md:grid-cols-[140px_1fr_auto] gap-2 p-3 bg-slate-900/60 border border-purple-500/30 rounded-lg">
                      <div>
                        <Label className="text-slate-300 text-xs">Montant (F)</Label>
                        <Input
                          type="number"
                          value={advanceForm.amount}
                          onChange={(e) => setAdvanceForm((f) => ({ ...f, amount: e.target.value }))}
                          placeholder="2000"
                          className="bg-slate-800 border-slate-700 text-white font-bold"
                          data-testid="advance-amount-input"
                        />
                      </div>
                      <div>
                        <Label className="text-slate-300 text-xs">Motif (optionnel)</Label>
                        <Input
                          value={advanceForm.reason}
                          onChange={(e) => setAdvanceForm((f) => ({ ...f, reason: e.target.value }))}
                          placeholder="Ex: Monnaie client facture 0012"
                          className="bg-slate-800 border-slate-700 text-white"
                          data-testid="advance-reason-input"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <Button
                          onClick={createAdvance}
                          disabled={advanceLoading}
                          className="bg-purple-600 hover:bg-purple-700"
                          data-testid="advance-save-btn"
                        >
                          {advanceLoading ? "…" : "Enregistrer"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => { setShowAdvanceForm(false); setAdvanceForm({ amount: "", reason: "" }); }}
                          className="border-slate-700 text-slate-300"
                        >
                          Annuler
                        </Button>
                      </div>
                    </div>
                  )}

                  {advances.length === 0 ? (
                    <p className="text-slate-500 text-sm italic text-center py-3">Aucune avance en attente ✓</p>
                  ) : (
                    <div className="space-y-1">
                      {advances.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between p-2.5 bg-slate-900/50 border border-slate-700 rounded hover:bg-slate-900/80"
                          data-testid={`advance-row-${a.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium">
                              <span className="text-purple-300 font-bold">{fmt(a.amount)} F</span>
                              {a.reason && <span className="text-slate-400 text-sm ml-2">— {a.reason}</span>}
                            </p>
                            <p className="text-xs text-slate-500">
                              {format(parseISO(a.created_at), "dd/MM HH:mm")} · par {a.created_by}
                            </p>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => reimburseAdvance(a.id, a.amount)}
                              className="border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10"
                              data-testid={`reimburse-advance-${a.id}`}
                            >
                              <Undo2 className="w-4 h-4 mr-1" /> Rembourser
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => deleteAdvance(a.id)}
                              className="border-rose-500/50 text-rose-300 hover:bg-rose-500/10"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {s.gerante_reimbursed_today_total > 0 && (
                    <p className="text-xs text-emerald-300/80 flex items-center gap-1 pl-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {s.gerante_reimbursed_today_count} avance(s) déjà remboursée(s) aujourd'hui pour un total de {fmt(s.gerante_reimbursed_today_total)} F
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Clôture du jour */}
              {!s.already_closed && (
                <Card className="bg-gradient-to-br from-emerald-900/30 to-blue-900/20 border-emerald-500/40">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-emerald-200 flex items-center gap-2 text-base">
                      <Lock className="w-5 h-5" /> Clôturer la caisse — Enregistrer le Z
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-slate-300 text-sm">Espèces attendues dans la caisse</Label>
                        <div className="mt-1 px-3 py-2 bg-slate-900/60 border border-slate-700 rounded text-emerald-300 font-bold text-lg">
                          {fmt(expectedCash)} F
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">
                          = {fmt(s.per_method.cash.amount)} F encaissés
                          {s.gerante_pending_total > 0 && (
                            <> + {fmt(s.gerante_pending_total)} F avance(s) Responsable Op. & Log en attente</>
                          )}
                          {s.gerante_reimbursed_today_total > 0 && (
                            <> − {fmt(s.gerante_reimbursed_today_total)} F remboursement(s) du jour</>
                          )}
                        </p>
                      </div>
                      <div>
                        <Label className="text-slate-300 text-sm">Espèces comptées physiquement *</Label>
                        <Input
                          type="number"
                          value={declaredCash}
                          onChange={(e) => setDeclaredCash(e.target.value)}
                          placeholder="0"
                          className="bg-slate-900/60 border-slate-700 text-white text-lg font-bold"
                          data-testid="point-caisse-declared-cash"
                        />
                      </div>
                    </div>

                    {/* Gap preview */}
                    {Number(declaredCash) > 0 && (
                      <div className={`rounded-lg p-3 border flex items-center justify-between ${
                        cashGapPreview === 0
                          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
                          : cashGapPreview > 0
                            ? "bg-blue-500/15 border-blue-500/40 text-blue-200"
                            : "bg-rose-500/15 border-rose-500/40 text-rose-200"
                      }`}>
                        <span className="text-sm flex items-center gap-2">
                          {cashGapPreview === 0 ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                          Écart prévu : {cashGapPreview === 0 ? "Aucun écart" : (cashGapPreview > 0 ? "Excédent" : "Manquant")}
                        </span>
                        <span className="text-lg font-bold">
                          {cashGapPreview >= 0 ? "+" : ""}{fmt(cashGapPreview)} F
                        </span>
                      </div>
                    )}

                    <div>
                      <Label className="text-slate-300 text-sm">Notes (optionnel)</Label>
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Remarques sur la journée…"
                        className="bg-slate-900/60 border-slate-700 text-white min-h-[60px]"
                        data-testid="point-caisse-notes"
                      />
                    </div>

                    <Button
                      onClick={closeDay}
                      disabled={closing}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                      data-testid="point-caisse-close-btn"
                    >
                      <Lock className="w-4 h-4 mr-2" />
                      {closing ? "Clôture en cours…" : `Clôturer le ${format(parseISO(date), "dd/MM/yyyy")}`}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ============== HISTORY (Admin only) ============== */}
        {currentUser?.role === 'admin' && (
        <TabsContent value="history" className="space-y-3 mt-4">
          {closures.length === 0 ? (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="text-center py-10 text-slate-500">
                <History className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Aucune clôture enregistrée</p>
                <p className="text-xs mt-1">Les Z journaliers apparaîtront ici dès la première clôture.</p>
              </CardContent>
            </Card>
          ) : (
            closures.map((c) => {
              const expanded = expandedId === c.id;
              const isPositiveGap = c.gap_cash > 0;
              const isNegativeGap = c.gap_cash < 0;
              return (
                <Card key={c.id} className="bg-slate-800/50 border-slate-700" data-testid={`closure-row-${c.date}`}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <button
                        onClick={() => setExpandedId(expanded ? null : c.id)}
                        className="flex-1 text-left flex items-center gap-3 min-w-0"
                      >
                        <div className="bg-emerald-500/15 border border-emerald-500/40 rounded-lg w-12 h-12 flex flex-col items-center justify-center text-emerald-300 flex-shrink-0">
                          <span className="text-[10px] uppercase">{format(parseISO(c.date), "MMM", { locale: fr })}</span>
                          <span className="text-base font-bold">{format(parseISO(c.date), "dd")}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-bold">
                            {format(parseISO(c.date), "EEEE dd MMMM yyyy", { locale: fr })}
                          </p>
                          <p className="text-xs text-slate-400">
                            Total : <span className="text-emerald-300 font-bold">{fmt(c.snapshot?.invoices_total)} F</span>
                            {" · "}
                            Solde : <span className="text-blue-300 font-bold">{fmt(c.snapshot?.net_balance)} F</span>
                            {" · "}Par {c.closed_by}
                          </p>
                        </div>
                        <Badge className={`ml-1 ${
                          c.gap_cash === 0
                            ? "bg-emerald-500/20 text-emerald-300"
                            : isPositiveGap
                              ? "bg-blue-500/20 text-blue-300"
                              : "bg-rose-500/20 text-rose-300"
                        }`}>
                          {isPositiveGap && <TrendingUp className="w-3 h-3 mr-1 inline" />}
                          {isNegativeGap && <TrendingDown className="w-3 h-3 mr-1 inline" />}
                          Écart : {c.gap_cash >= 0 ? "+" : ""}{fmt(c.gap_cash)} F
                        </Badge>
                      </button>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button size="sm" variant="outline" onClick={() => printZ(c)} className="border-slate-600 text-slate-300">
                          <Receipt className="w-4 h-4 mr-1" /> Imprimer
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => deleteClosure(c.id)} className="border-rose-500/50 text-rose-300 hover:bg-rose-500/10" data-testid={`delete-closure-${c.id}`}>
                          <Unlock className="w-4 h-4 mr-1" /> Rouvrir
                        </Button>
                      </div>
                    </div>

                    {expanded && c.snapshot && (
                      <div className="mt-3 pt-3 border-t border-slate-700 space-y-2">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                          {Object.entries(c.snapshot.per_method).filter(([_, v]) => v.count > 0).map(([k, v]) => (
                            <div key={k} className="bg-slate-900/40 border border-slate-700 rounded p-2 text-center">
                              <p className="text-xs text-slate-400">{METHOD_META[k]?.label || k}</p>
                              <p className="text-sm text-white font-bold">{fmt(v.amount)} F</p>
                              <p className="text-[10px] text-slate-500">{v.count} fact.</p>
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="bg-slate-900/40 rounded p-2 text-xs">
                            <p className="text-slate-400">Théorique espèces</p>
                            <p className="text-emerald-300 font-bold">{fmt(c.snapshot.per_method.cash.amount)} F</p>
                          </div>
                          <div className="bg-slate-900/40 rounded p-2 text-xs">
                            <p className="text-slate-400">Déclaré</p>
                            <p className="text-white font-bold">{fmt(c.declared_cash)} F</p>
                          </div>
                          <div className="bg-slate-900/40 rounded p-2 text-xs">
                            <p className="text-slate-400">Pourboires</p>
                            <p className="text-amber-300 font-bold">{fmt(c.snapshot.tips_total)} F</p>
                          </div>
                          <div className="bg-slate-900/40 rounded p-2 text-xs">
                            <p className="text-slate-400">Dépenses</p>
                            <p className="text-rose-300 font-bold">- {fmt(c.snapshot.expenses_total)} F</p>
                          </div>
                        </div>
                        {c.notes && (
                          <p className="text-slate-400 text-xs italic">"{c.notes}"</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default PointCaisseTab;
