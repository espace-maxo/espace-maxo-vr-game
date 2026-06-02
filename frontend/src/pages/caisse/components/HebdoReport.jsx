import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  BarChart3, ChevronLeft, ChevronRight, Download, MessageCircle,
  Calendar, TrendingUp, ShoppingCart, DollarSign, Clock, AlertCircle, Timer, Building2,
  Link, Check, Trash2, UserCircle, Wine, UtensilsCrossed, Gamepad2
} from "lucide-react";
import { format, startOfWeek, addWeeks, subWeeks } from "date-fns";
import { fr } from "date-fns/locale";
import axios from "axios";
import { toast } from "sonner";

const HebdoReport = ({ 
  weeklyReport, 
  weekStartDate, 
  setWeekStartDate, 
  weekEndDate,
  setWeekEndDate,
  generateWeeklyPDF, 
  sendWeeklyWhatsApp, 
  formatPrice,
  API,
  refreshWeekly,
  isAdmin,
  currentUser,
  onGoToReversement,
}) => {
  const [showAttach, setShowAttach] = useState(false);
  const [unlinkedInvoices, setUnlinkedInvoices] = useState([]);
  const [unlinkedExpenses, setUnlinkedExpenses] = useState([]);
  const [selectedInvoices, setSelectedInvoices] = useState([]);
  const [selectedExpenses, setSelectedExpenses] = useState([]);
  const [attachDateFrom, setAttachDateFrom] = useState("");
  const [attachDateTo, setAttachDateTo] = useState("");
  const [loadingAttach, setLoadingAttach] = useState(false);
  const [expandedDay, setExpandedDay] = useState(null);
  const [transferTarget, setTransferTarget] = useState("");
  const [transferItems, setTransferItems] = useState([]);
  const [transferType, setTransferType] = useState("sales");
  const [duplicates, setDuplicates] = useState([]);
  const [showDuplicates, setShowDuplicates] = useState(false);
  // Preset actif : "today" | "week" | "month" | "custom" — par défaut = Aujourd'hui
  const [periodPreset, setPeriodPreset] = useState("today");

  // Statut de validation du point pour la période active (utilisé pour bloquer le Reversement)
  const [pendingInvoicesCount, setPendingInvoicesCount] = useState(0);
  const [pointValidation, setPointValidation] = useState(null);
  const [validating, setValidating] = useState(false);

  // Vérifie les factures non validées + récupère l'éventuelle validation pour la période
  const refreshValidationState = React.useCallback(async () => {
    try {
      const from = weekStartDate;
      const to = weekEndDate || weekStartDate;
      const [invRes, valRes] = await Promise.all([
        axios.get(`${API}/invoices`, { params: { date_from: from, date_to: to } }),
        axios.get(`${API}/point-validations`, { params: {
          date: from,
          period_type: from === to ? "daily" : "weekly",
          ...(from === to ? {} : { end_date: to })
        } }).catch(() => ({ data: { validated: false } })),
      ]);
      const pending = (invRes.data.invoices || []).filter(i =>
        (i.validation_status === "pending" || !i.validation_status) &&
        (i.created_at || "").slice(0, 10) >= from &&
        (i.created_at || "").slice(0, 10) <= to
      ).length;
      setPendingInvoicesCount(pending);
      setPointValidation(valRes.data?.validated ? valRes.data.validation : null);
    } catch (e) {
      // Silent — non blocking
    }
  }, [weekStartDate, weekEndDate, API]);

  useEffect(() => { refreshValidationState(); }, [refreshValidationState, weeklyReport]);

  // Valide le point ET passe au Reversement (1 clic). Refuse si factures en attente.
  const validateAndGoToReversement = async () => {
    if (pendingInvoicesCount > 0 && !isAdmin) {
      toast.error(`Impossible de valider : ${pendingInvoicesCount} facture(s) en attente. Validez d'abord le détail des ventes.`);
      return;
    }
    setValidating(true);
    try {
      const from = weekStartDate;
      const to = weekEndDate || weekStartDate;
      await axios.post(`${API}/point-validations`, {
        date: from,
        end_date: from === to ? "" : to,
        period_type: from === to ? "daily" : "weekly",
        validated_by: currentUser?.full_name || currentUser?.username || "Responsable Op. & Log",
      });
      toast.success("Point validé — passage au Reversement");
      await refreshValidationState();
      if (onGoToReversement) onGoToReversement();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur lors de la validation");
    } finally {
      setValidating(false);
    }
  };

  // Au montage : si le parent a initialisé les dates sur la semaine complète,
  // on les resynchronise sur "aujourd'hui" pour coller au preset par défaut.
  React.useEffect(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    if (periodPreset === "today" && (weekStartDate !== today || weekEndDate !== today)) {
      setWeekStartDate(today);
      setWeekEndDate(today);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchUnlinked = async () => {
    if (!attachDateFrom) { toast.error("Selectionnez une date de debut"); return; }
    setLoadingAttach(true);
    try {
      const from = attachDateFrom;
      const to = attachDateTo || attachDateFrom;
      // Fetch invoices and expenses for the date range
      const [invRes, expRes] = await Promise.all([
        axios.get(`${API}/invoices`, { params: { date_from: from, date_to: to } }),
        axios.get(`${API}/expenses`)
      ]);
      const allInv = (invRes.data.invoices || []).filter(i => i.validation_status === "validated");
      const allExp = (expRes.data.expenses || []);
      
      // Filter by date range
      const filteredExp = allExp.filter(e => {
        const d = (e.created_at || "").slice(0, 10);
        return d >= from && d <= to;
      });
      
      setUnlinkedInvoices(allInv);
      setUnlinkedExpenses(filteredExp);
      setSelectedInvoices([]);
      setSelectedExpenses([]);
    } catch (e) {
      toast.error("Erreur de recherche");
    }
    setLoadingAttach(false);
  };

  const attachSelected = async () => {
    if (selectedInvoices.length === 0 && selectedExpenses.length === 0) {
      toast.error("Selectionnez au moins un element");
      return;
    }
    try {
      const promises = [];
      if (selectedInvoices.length > 0) {
        promises.push(axios.post(`${API}/invoices/assign-week-bulk`, { ids: selectedInvoices, week_start: weekStartDate }));
      }
      if (selectedExpenses.length > 0) {
        promises.push(axios.post(`${API}/expenses/assign-week-bulk`, { ids: selectedExpenses, week_start: weekStartDate }));
      }
      await Promise.all(promises);
      toast.success(`${selectedInvoices.length + selectedExpenses.length} element(s) rattache(s) a cette semaine`);
      setShowAttach(false);
      setSelectedInvoices([]);
      setSelectedExpenses([]);
      if (refreshWeekly) refreshWeekly();
    } catch (e) {
      toast.error("Erreur de rattachement");
    }
  };

  const toggleTransferItem = (id) => setTransferItems(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const transferSelected = async () => {
    if (transferItems.length === 0 || !transferTarget) {
      toast.error("Selectionnez des elements et une semaine de destination");
      return;
    }
    try {
      if (transferType === "sales") {
        await axios.post(`${API}/invoices/assign-week-bulk`, { ids: transferItems, week_start: transferTarget });
      } else {
        await axios.post(`${API}/expenses/assign-week-bulk`, { ids: transferItems, week_start: transferTarget });
      }
      toast.success(`${transferItems.length} element(s) transfere(s)`);
      setTransferItems([]);
      setExpandedDay(null);
      if (refreshWeekly) refreshWeekly();
    } catch (e) {
      toast.error("Erreur de transfert");
    }
  };

  const removeFromWeek = async () => {
    if (transferItems.length === 0) { toast.error("Selectionnez des elements"); return; }
    if (!window.confirm(`Retirer ${transferItems.length} element(s) de cette semaine ?\n\n(L'achat reste disponible dans la liste des achats — il est juste masqué de ce point hebdomadaire.)`)) return;
    try {
      const payload = { ids: transferItems, week_start: weekStartDate };
      if (transferType === "sales") {
        await axios.post(`${API}/invoices/exclude-from-week-bulk`, payload);
      } else {
        await axios.post(`${API}/expenses/exclude-from-week-bulk`, payload);
      }
      toast.success(`${transferItems.length} element(s) retire(s) de la semaine`);
      setTransferItems([]);
      setExpandedDay(null);
      if (refreshWeekly) refreshWeekly();
    } catch (e) {
      toast.error("Erreur");
    }
  };

  // Inline single-item delete (admin only) — used by the trash button on each
  // sale/expense row in the daily expanded view.
  const actorQs = () => {
    const name = encodeURIComponent(currentUser?.full_name || currentUser?.username || "Admin");
    const role = encodeURIComponent(currentUser?.role || "admin");
    return `actor_name=${name}&actor_role=${role}`;
  };

  const deleteOneSale = async (invoiceId, invoiceNumber) => {
    if (!isAdmin) return;
    if (!confirm(`Supprimer définitivement la facture ${invoiceNumber || invoiceId} ?\n\nCette action est tracée dans l'audit.`)) return;
    try {
      await axios.delete(`${API}/invoices/${invoiceId}?${actorQs()}`);
      toast.success("Facture supprimée");
      if (refreshWeekly) refreshWeekly();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de la suppression");
    }
  };

  const deleteOneExpense = async (expenseId, label) => {
    if (!isAdmin) return;
    if (!confirm(`Supprimer définitivement la dépense « ${label || expenseId} » ?`)) return;
    try {
      await axios.delete(`${API}/expenses/${expenseId}`);
      toast.success("Dépense supprimée");
      if (refreshWeekly) refreshWeekly();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de la suppression");
    }
  };

  const detectDuplicates = async () => {    try {
      const r = await axios.get(`${API}/reports/weekly/duplicates`, { params: { week_start: weekStartDate } });
      setDuplicates(r.data.duplicates || []);
      setShowDuplicates(true);
      if (r.data.count === 0) {
        toast.success("Aucun doublon detecte");
      } else {
        toast.warning(`${r.data.count} doublon(s) detecte(s)`);
      }
    } catch (e) { toast.error("Erreur detection doublons"); }
  };

  const fixDuplicate = async (dup) => {
    try {
      if (dup.type === "invoice") {
        await axios.post(`${API}/invoices/unassign-week-bulk`, { ids: [dup.id] });
      } else {
        await axios.post(`${API}/expenses/unassign-week-bulk`, { ids: [dup.id] });
      }
      toast.success("Doublon corrige");
      setDuplicates(prev => prev.filter(d => d.id !== dup.id));
      if (refreshWeekly) refreshWeekly();
    } catch (e) { toast.error("Erreur"); }
  };
  // Generate list of last 12 weeks (Lundi-Dimanche)
  const weekOptions = useMemo(() => {
    const weeks = [];
    const today = new Date();
    
    for (let i = 0; i < 12; i++) {
      const weekStart = startOfWeek(subWeeks(today, i), { weekStartsOn: 1 }); // 1 = Monday
      const weekEnd = addWeeks(weekStart, 1);
      weekEnd.setDate(weekEnd.getDate() - 1); // Sunday
      
      const value = format(weekStart, "yyyy-MM-dd");
      const label = `${format(weekStart, "dd MMM", { locale: fr })} - ${format(weekEnd, "dd MMM yyyy", { locale: fr })}`;
      const isCurrentWeek = i === 0;
      
      weeks.push({ value, label, isCurrentWeek });
    }
    
    return weeks;
  }, []);

  // Applique un preset de periode (Aujourd'hui / Semaine / Mois / Personnalise)
  const applyPreset = (preset) => {
    setPeriodPreset(preset);
    const now = new Date();
    if (preset === "today") {
      const d = format(now, "yyyy-MM-dd");
      setWeekStartDate(d);
      setWeekEndDate(d);
    } else if (preset === "week") {
      const monday = startOfWeek(now, { weekStartsOn: 1 });
      const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
      setWeekStartDate(format(monday, "yyyy-MM-dd"));
      setWeekEndDate(format(sunday, "yyyy-MM-dd"));
    } else if (preset === "month") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setWeekStartDate(format(first, "yyyy-MM-dd"));
      setWeekEndDate(format(last, "yyyy-MM-dd"));
    }
    // "custom" : on laisse les dates actuelles, l'utilisateur pilote les inputs
  };

  // Navigate to previous/next period (shift by same delta as current range)
  const navigatePeriod = (direction) => {
    const start = new Date(weekStartDate);
    const end = weekEndDate ? new Date(weekEndDate) : new Date(new Date(weekStartDate).setDate(start.getDate() + 6));
    const delta = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1; // inclusive
    const shift = direction === 'prev' ? -delta : delta;
    const newStart = new Date(start); newStart.setDate(start.getDate() + shift);
    const newEnd = new Date(end); newEnd.setDate(end.getDate() + shift);
    setWeekStartDate(format(newStart, "yyyy-MM-dd"));
    setWeekEndDate(format(newEnd, "yyyy-MM-dd"));
    setPeriodPreset("custom");
  };

  // Libelle lisible de la periode courante
  const getCurrentPeriodLabel = () => {
    const s = new Date(weekStartDate);
    const e = weekEndDate ? new Date(weekEndDate) : new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
    if (format(s, "yyyy-MM-dd") === format(e, "yyyy-MM-dd")) {
      return format(s, "EEEE dd MMM yyyy", { locale: fr });
    }
    return `${format(s, "dd MMM", { locale: fr })} → ${format(e, "dd MMM yyyy", { locale: fr })}`;
  };

  return (
    <div className="space-y-4">
      {/* Header avec titre et boutons d'action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-cyan-300 flex items-center gap-2">
          <BarChart3 className="w-6 h-6" />
          Faire le point
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          {weeklyReport && (
            <>
              {onGoToReversement && (
                <Button
                  size="sm"
                  onClick={validateAndGoToReversement}
                  disabled={validating || (pendingInvoicesCount > 0 && !isAdmin)}
                  className={`${pointValidation ? "bg-emerald-700 hover:bg-emerald-800" : "bg-emerald-600 hover:bg-emerald-700"} text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed`}
                  data-testid="validate-and-revers-btn"
                  title={pendingInvoicesCount > 0 && !isAdmin ? `${pendingInvoicesCount} facture(s) en attente à valider` : ""}
                >
                  <Check className="w-4 h-4 mr-1" />
                  {pointValidation ? "Aller au Reversement" : "Valider et passer au Reversement"}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Selecteur de periode : presets + plage personnalisee */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            {/* Presets */}
            <div className="flex items-center gap-1.5 flex-wrap" data-testid="period-presets">
              <Button size="sm" variant={periodPreset === "today" ? "default" : "outline"} onClick={() => applyPreset("today")} className={periodPreset === "today" ? "bg-cyan-600 hover:bg-cyan-700 h-8" : "border-slate-600 text-slate-300 h-8"} data-testid="preset-today">
                Aujourd'hui
              </Button>
              <Button size="sm" variant={periodPreset === "custom" ? "default" : "outline"} onClick={() => setPeriodPreset("custom")} className={periodPreset === "custom" ? "bg-cyan-600 hover:bg-cyan-700 h-8" : "border-slate-600 text-slate-300 h-8"} data-testid="preset-custom">
                Personnalisée
              </Button>
            </div>

            {/* Plage de dates */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <label className="text-slate-400 text-xs">Du</label>
                <Input
                  type="date"
                  value={weekStartDate}
                  onChange={(e) => { setWeekStartDate(e.target.value); setPeriodPreset("custom"); }}
                  className="bg-slate-800 border-slate-700 text-white h-8 w-[150px]"
                  data-testid="period-start-date"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-slate-400 text-xs">Au</label>
                <Input
                  type="date"
                  value={weekEndDate || ""}
                  min={weekStartDate}
                  onChange={(e) => { setWeekEndDate(e.target.value); setPeriodPreset("custom"); }}
                  className="bg-slate-800 border-slate-700 text-white h-8 w-[150px]"
                  data-testid="period-end-date"
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => navigatePeriod('prev')} className="border-slate-600 text-slate-300 h-8" data-testid="period-prev-btn">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigatePeriod('next')} className="border-slate-600 text-slate-300 h-8" data-testid="period-next-btn">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            <div className="text-xs text-slate-400 lg:ml-auto flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-cyan-300" data-testid="period-current-label">{getCurrentPeriodLabel()}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attach panel */}
      {showAttach && (
        <Card className="bg-cyan-900/20 border-cyan-700/50">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-cyan-400 font-bold flex items-center gap-2"><Link className="w-4 h-4" /> Rattacher des produits/charges a cette semaine</h3>
            <p className="text-slate-400 text-xs">Recherchez par date les factures validees et charges a rattacher au Point Hebdo de la semaine selectionnee.</p>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-slate-400 text-xs block mb-1">Date debut</label>
                <Input type="date" value={attachDateFrom} onChange={e => setAttachDateFrom(e.target.value)} className="bg-slate-800 border-slate-700 text-white h-8 w-40" data-testid="attach-date-from" />
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">Date fin</label>
                <Input type="date" value={attachDateTo} onChange={e => setAttachDateTo(e.target.value)} className="bg-slate-800 border-slate-700 text-white h-8 w-40" data-testid="attach-date-to" />
              </div>
              <Button size="sm" className="bg-cyan-600 hover:bg-cyan-700 h-8" onClick={searchUnlinked} disabled={loadingAttach} data-testid="attach-search-btn">
                Rechercher
              </Button>
            </div>

            {/* Results */}
            {(unlinkedInvoices.length > 0 || unlinkedExpenses.length > 0) && (
              <div className="space-y-3">
                {/* Invoices (Produits / Ventes) */}
                {unlinkedInvoices.length > 0 && (
                  <div>
                    <p className="text-green-400 text-sm font-medium mb-1">Ventes / Factures ({unlinkedInvoices.length})</p>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {unlinkedInvoices.map(inv => (
                        <label key={inv.id} className={`flex items-center gap-2 bg-slate-800/50 rounded px-3 py-1.5 cursor-pointer hover:bg-slate-800/70 ${selectedInvoices.includes(inv.id) ? 'ring-1 ring-cyan-500/50' : ''}`}>
                          <input type="checkbox" className="rounded bg-slate-700 border-slate-600" checked={selectedInvoices.includes(inv.id)} onChange={() => setSelectedInvoices(p => p.includes(inv.id) ? p.filter(x => x !== inv.id) : [...p, inv.id])} />
                          <span className="text-white text-xs flex-1">{inv.invoice_number || inv.id.slice(0, 8)}</span>
                          <span className="text-slate-400 text-xs">{(inv.created_at || "").slice(0, 10)}</span>
                          <span className="text-green-400 text-xs font-bold">{formatPrice(inv.total)} F</span>
                          {inv.assigned_week && <Badge className="bg-cyan-500/20 text-cyan-400 text-xs">S.{inv.assigned_week.slice(5)}</Badge>}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Expenses (Charges) */}
                {unlinkedExpenses.length > 0 && (
                  <div>
                    <p className="text-red-400 text-sm font-medium mb-1">Charges / Depenses ({unlinkedExpenses.length})</p>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {unlinkedExpenses.map(exp => (
                        <label key={exp.id} className={`flex items-center gap-2 bg-slate-800/50 rounded px-3 py-1.5 cursor-pointer hover:bg-slate-800/70 ${selectedExpenses.includes(exp.id) ? 'ring-1 ring-cyan-500/50' : ''}`}>
                          <input type="checkbox" className="rounded bg-slate-700 border-slate-600" checked={selectedExpenses.includes(exp.id)} onChange={() => setSelectedExpenses(p => p.includes(exp.id) ? p.filter(x => x !== exp.id) : [...p, exp.id])} />
                          <span className="text-white text-xs flex-1">{exp.description}</span>
                          <span className="text-slate-400 text-xs">{(exp.created_at || "").slice(0, 10)}</span>
                          <span className="text-red-400 text-xs font-bold">{formatPrice(exp.amount)} F</span>
                          {exp.assigned_week && <Badge className="bg-cyan-500/20 text-cyan-400 text-xs">S.{exp.assigned_week.slice(5)}</Badge>}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={attachSelected} data-testid="attach-confirm-btn">
                    <Check className="w-3 h-3 mr-1" /> Rattacher {selectedInvoices.length + selectedExpenses.length} element(s) a cette semaine
                  </Button>
                  <Button size="sm" variant="ghost" className="text-slate-400" onClick={() => { setShowAttach(false); setUnlinkedInvoices([]); setUnlinkedExpenses([]); }}>Fermer</Button>
                </div>
              </div>
            )}

            {loadingAttach && <p className="text-slate-400 text-sm">Recherche en cours...</p>}
          </CardContent>
        </Card>
      )}

      {/* Duplicates panel */}
      {showDuplicates && (
        <Card className="bg-amber-900/20 border-amber-700/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-amber-400 font-bold flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Detection des doublons</h3>
              <Button size="sm" variant="ghost" className="text-slate-400 h-7 text-xs" onClick={() => setShowDuplicates(false)}>Fermer</Button>
            </div>
            {duplicates.length === 0 ? (
              <p className="text-emerald-400 text-sm">Aucun doublon detecte pour cette semaine.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-amber-300 text-xs">{duplicates.length} doublon(s) detecte(s) :</p>
                {duplicates.map((dup, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-slate-800/50 rounded-lg px-3 py-2">
                    <Badge className={dup.type === 'invoice' ? 'bg-green-500/20 text-green-400 text-xs' : 'bg-red-500/20 text-red-400 text-xs'}>
                      {dup.type === 'invoice' ? 'Facture' : 'Charge'}
                    </Badge>
                    <span className="text-white text-xs flex-1">{dup.invoice_number || dup.description || dup.id.slice(0, 8)}</span>
                    <span className="text-amber-400 text-xs font-bold">{formatPrice(dup.total || dup.amount || 0)} F</span>
                    <span className="text-slate-500 text-xs max-w-[250px] truncate">{dup.issue}</span>
                    <Button size="sm" className="bg-red-600 hover:bg-red-700 h-6 text-xs px-2" onClick={() => fixDuplicate(dup)}>
                      Retirer l'assignation
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {weeklyReport ? (
        <div className="space-y-4">
          {/* Titre de la semaine */}
          <div className="text-center">
            <p className="text-lg text-cyan-400 font-semibold">{weeklyReport.week_label}</p>
          </div>

          {/* Bandeau d'état du point */}
          {(pendingInvoicesCount > 0 || pointValidation) && (
            <Card className={pointValidation ? "bg-emerald-900/20 border-emerald-500/40" : "bg-amber-900/20 border-amber-500/40"} data-testid="hebdo-validation-banner">
              <CardContent className="p-3 flex items-center gap-3 flex-wrap">
                {pointValidation ? (
                  <>
                    <Check className="w-5 h-5 text-emerald-400" />
                    <p className="text-emerald-300 text-sm font-medium">
                      Point validé par <span className="text-white">{pointValidation.validated_by}</span>
                      {pointValidation.validated_at && <span className="text-slate-400 text-xs ml-2">le {pointValidation.validated_at.slice(0, 10)}</span>}
                    </p>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5 text-amber-400" />
                    <p className="text-amber-300 text-sm font-medium">
                      {pendingInvoicesCount} facture{pendingInvoicesCount > 1 ? 's' : ''} en attente de validation
                    </p>
                    <span className="text-slate-400 text-xs">Validez le détail des ventes avant de pouvoir faire le point</span>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* ===== RECETTES PAR CATÉGORIE — 4 cartes principales ===== */}
          <div>
            <p className="text-slate-400 text-xs uppercase tracking-wider font-bold mb-2 px-1">Recettes par catégorie</p>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Card className="bg-gradient-to-br from-orange-900/30 to-amber-900/20 border-orange-500/50" data-testid="hebdo-card-bar">
                <CardContent className="p-4 text-center">
                  <Wine className="w-6 h-6 text-orange-400 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-orange-400">{formatPrice(weeklyReport.sales?.by_revenue_group?.bar || 0)} F</p>
                  <p className="text-xs text-slate-400">Bar</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-green-900/30 to-emerald-900/20 border-green-500/50" data-testid="hebdo-card-menu">
                <CardContent className="p-4 text-center">
                  <UtensilsCrossed className="w-6 h-6 text-green-400 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-green-400">{formatPrice(weeklyReport.sales?.by_revenue_group?.menu_combos || 0)} F</p>
                  <p className="text-xs text-slate-400">Menu & Combos</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-blue-900/30 to-indigo-900/20 border-blue-500/50" data-testid="hebdo-card-jeux">
                <CardContent className="p-4 text-center">
                  <Gamepad2 className="w-6 h-6 text-blue-400 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-blue-400">{formatPrice(weeklyReport.sales?.by_revenue_group?.jeux || 0)} F</p>
                  <p className="text-xs text-slate-400">Jeux</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-purple-900/30 to-violet-900/20 border-purple-500/50" data-testid="hebdo-card-locations">
                <CardContent className="p-4 text-center">
                  <Building2 className="w-6 h-6 text-purple-400 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-purple-400">{formatPrice(weeklyReport.locations?.total || 0)} F</p>
                  <p className="text-xs text-slate-400">Locations ({weeklyReport.locations?.count || 0})</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ===== SYNTHÈSE — Dépenses / Bénéfice / Total Recettes ===== */}
          <div>
            <p className="text-slate-400 text-xs uppercase tracking-wider font-bold mb-2 px-1">Synthèse de la période</p>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
              <Card className="bg-gradient-to-br from-red-900/30 to-orange-900/20 border-red-500/50" data-testid="hebdo-card-expenses">
                <CardContent className="p-4 text-center">
                  <ShoppingCart className="w-6 h-6 text-red-400 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-red-400">{formatPrice(weeklyReport.expenses?.total || 0)} F</p>
                  <p className="text-xs text-slate-400">{weeklyReport.expenses?.count || 0} dépense(s)</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-cyan-900/30 to-blue-900/20 border-cyan-500/50" data-testid="hebdo-card-total">
                <CardContent className="p-4 text-center">
                  <TrendingUp className="w-6 h-6 text-cyan-400 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-cyan-400">{formatPrice(weeklyReport.total_income || (weeklyReport.sales?.total || 0) + (weeklyReport.locations?.total || 0))} F</p>
                  <p className="text-xs text-slate-400">Total Recettes</p>
                </CardContent>
              </Card>
              <Card className={`bg-gradient-to-br ${weeklyReport.is_profitable ? 'from-emerald-900/30 to-green-900/20 border-emerald-500/50' : 'from-rose-900/30 to-red-900/20 border-rose-500/50'}`} data-testid="hebdo-card-result">
                <CardContent className="p-4 text-center">
                  <DollarSign className={`w-6 h-6 mx-auto mb-1 ${weeklyReport.is_profitable ? 'text-emerald-400' : 'text-rose-400'}`} />
                  <p className={`text-2xl font-bold ${weeklyReport.is_profitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {weeklyReport.result >= 0 ? '+' : ''}{formatPrice(weeklyReport.result || 0)} F
                  </p>
                  <p className="text-xs text-slate-400">{weeklyReport.is_profitable ? 'Bénéfice net' : 'Perte nette'}</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Mme la D.G. — affichée uniquement si activité */}
          {weeklyReport.manager_general && (weeklyReport.manager_general.orders_count > 0 || weeklyReport.manager_general.purchases_count > 0) && (
            <Card className="bg-gradient-to-br from-violet-900/20 to-purple-900/10 border-violet-500/40">
              <CardContent className="p-3 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <UserCircle className="w-5 h-5 text-violet-400" />
                  <span className="text-slate-300 text-sm">Mme la Directrice Générale</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-violet-300 font-bold">{formatPrice((weeklyReport.manager_general?.orders_total || 0) + (weeklyReport.manager_general?.purchases_total || 0))} F</span>
                  {weeklyReport.manager_general.orders_unpaid > 0 && <Badge className="bg-red-500/20 text-red-400 text-xs">{formatPrice(weeklyReport.manager_general.orders_unpaid)} F impayé</Badge>}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tableau jour par jour — aéré */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-cyan-400 flex items-center gap-2 text-base">
                <Calendar className="w-5 h-5" />
                Détail Jour par Jour
                <span className="text-slate-500 text-[11px] font-normal ml-2">cliquez sur un jour pour voir le détail</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-separate" style={{borderSpacing: "0 6px"}}>
                  <thead>
                    <tr className="text-left text-slate-400 uppercase text-[10px] tracking-wider">
                      <th className="px-3 py-1">Jour</th>
                      <th className="px-3 py-1">Date</th>
                      <th className="px-3 py-1 text-right text-orange-400" title="Recettes Bar">Bar</th>
                      <th className="px-3 py-1 text-right text-green-400" title="Carte Menu & Combos">Menu/Combo</th>
                      <th className="px-3 py-1 text-right text-blue-400" title="Recettes Jeux">Jeux</th>
                      <th className="px-3 py-1 text-right text-purple-400">Locations</th>
                      <th className="px-3 py-1 text-right text-red-400">Dépenses</th>
                      <th className="px-3 py-1 text-right">Résultat</th>
                      <th className="px-3 py-1 text-right text-violet-400">Mme la D.G.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(weeklyReport.daily || {}).map(([date, data]) => (
                      <React.Fragment key={date}>
                      <tr className={`bg-slate-900/40 hover:bg-slate-800/70 cursor-pointer transition-colors ${expandedDay === date ? 'ring-1 ring-cyan-500/40 bg-slate-800/80' : ''}`} onClick={() => { setExpandedDay(expandedDay === date ? null : date); setTransferItems([]); }}>
                        <td className="px-3 py-3 font-semibold text-white rounded-l-lg">
                          <div className="flex items-center gap-1.5">
                            <ChevronRight className={`w-3.5 h-3.5 text-slate-500 transition-transform ${expandedDay === date ? 'rotate-90 text-cyan-400' : ''}`} />
                            {data.day_name}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-400 whitespace-nowrap">{data.date_formatted}</td>
                        <td className="px-3 py-3 text-right">
                          <span className="text-orange-400 font-bold">{formatPrice(data.sales?.by_revenue_group?.bar || 0)} F</span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className="text-green-400 font-bold">{formatPrice(data.sales?.by_revenue_group?.menu_combos || 0)} F</span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className="text-blue-400 font-bold">{formatPrice(data.sales?.by_revenue_group?.jeux || 0)} F</span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className="text-purple-400 font-bold" title={`Total locations : ${formatPrice(data.locations?.total || 0)} F · Avances : ${formatPrice(data.locations?.advances || 0)} F · Solde : ${formatPrice(data.locations?.balance_due || 0)} F`}>
                            {formatPrice(data.locations?.advances || 0)} F
                          </span>
                          {(data.locations?.count || 0) > 0 && <span className="text-slate-500 text-[10px] ml-1">({data.locations.count})</span>}
                          {(data.locations?.balance_due || 0) > 0 && (
                            <span className="block text-amber-400/80 text-[10px] font-mono">+{formatPrice(data.locations.balance_due)} F à recevoir</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className="text-red-400 font-bold">{formatPrice(data.expenses?.total || 0)} F</span>
                          {(data.expenses?.count || 0) > 0 && <span className="text-slate-500 text-[10px] ml-1">({data.expenses.count})</span>}
                        </td>
                        <td className={`px-3 py-3 text-right font-bold ${data.result >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {data.result >= 0 ? '+' : ''}{formatPrice(data.result)} F
                        </td>
                        <td className="px-3 py-3 text-right rounded-r-lg">
                          <span className="text-violet-400 font-bold">{formatPrice((data.manager_general?.orders_total || 0) + (data.manager_general?.purchases_total || 0))} F</span>
                          {(data.manager_general?.orders_count || 0) + (data.manager_general?.purchases_count || 0) > 0 && <span className="text-slate-500 text-[10px] ml-1">({(data.manager_general?.orders_count || 0) + (data.manager_general?.purchases_count || 0)})</span>}
                        </td>
                      </tr>
                      {expandedDay === date && (
                      <tr><td colSpan={9} className="p-0">
                        <div className="bg-slate-900/50 border-y border-slate-700/30 px-4 py-3 space-y-3">
                          {/* Transfer/Delete bar - Admin only */}
                          {isAdmin && transferItems.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-2">
                              <span className="text-amber-400 text-xs font-medium">{transferItems.length} selectionne(s)</span>
                              <span className="text-slate-500 text-xs">|</span>
                              <span className="text-slate-400 text-xs">Transferer vers :</span>
                              <Select value={transferTarget || "none"} onValueChange={v => setTransferTarget(v === "none" ? "" : v)}>
                                <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-7 w-48 text-xs"><SelectValue placeholder="Choisir une semaine" /></SelectTrigger>
                                <SelectContent className="bg-slate-800 border-slate-700">
                                  {weekOptions.map(w => (
                                    <SelectItem key={w.value} value={w.value} className="text-white text-xs">{w.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button size="sm" className="bg-amber-600 hover:bg-amber-700 h-7 text-xs" onClick={transferSelected} disabled={!transferTarget}>
                                <ChevronRight className="w-3 h-3 mr-1" /> Transferer
                              </Button>
                              <span className="text-slate-600 text-xs">|</span>
                              <Button size="sm" className="bg-red-600 hover:bg-red-700 h-7 text-xs" onClick={removeFromWeek} data-testid="remove-from-week-btn">
                                <Trash2 className="w-3 h-3 mr-1" /> Retirer de cette semaine
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-400" onClick={() => setTransferItems([])}>Annuler</Button>
                            </div>
                          )}

                          {/* Sales detail */}
                          {data.sales?.items?.length > 0 && (
                            <div>
                              <p className="text-green-400 text-xs font-medium mb-1">Ventes ({data.sales.items.length})</p>
                              <div className="space-y-1">
                                {data.sales.items.map((item, idx) => (
                                  <label key={idx} className={`flex items-center gap-2 bg-slate-800/40 rounded px-3 py-1.5 ${isAdmin ? 'cursor-pointer hover:bg-slate-800/60' : ''} ${transferItems.includes(item.id) ? 'ring-1 ring-amber-500/50' : ''}`} onClick={e => e.stopPropagation()}>
                                    {isAdmin && <input type="checkbox" className="rounded bg-slate-700 border-slate-600" checked={transferItems.includes(item.id)} onChange={() => { setTransferType("sales"); toggleTransferItem(item.id); }} />}
                                    <span className="text-white text-xs flex-1">{item.invoice_number || `Facture`}</span>
                                    <span className="text-green-400 text-xs font-bold">{formatPrice(item.total)} F</span>
                                    {item.assigned_week && <Badge className="bg-cyan-500/20 text-cyan-400 text-xs">S.{item.assigned_week.slice(5)}</Badge>}
                                    {isAdmin && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 w-6 p-0 text-red-400 hover:bg-red-500/15 hover:text-red-300"
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteOneSale(item.id, item.invoice_number); }}
                                        data-testid={`hebdo-delete-sale-${item.id}`}
                                        title="Supprimer cette facture"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    )}
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Expenses detail */}
                          {data.expenses?.items?.length > 0 && (
                            <div>
                              <p className="text-red-400 text-xs font-medium mb-1">Charges ({data.expenses.items.length})</p>
                              <div className="space-y-1">
                                {data.expenses.items.map((item, idx) => (
                                  <label key={idx} className={`flex items-center gap-2 bg-slate-800/40 rounded px-3 py-1.5 ${isAdmin ? 'cursor-pointer hover:bg-slate-800/60' : ''} ${transferItems.includes(item.id) ? 'ring-1 ring-amber-500/50' : ''}`} onClick={e => e.stopPropagation()}>
                                    {isAdmin && <input type="checkbox" className="rounded bg-slate-700 border-slate-600" checked={transferItems.includes(item.id)} onChange={() => { setTransferType("expenses"); toggleTransferItem(item.id); }} />}
                                    <span className="text-white text-xs flex-1">{item.description}</span>
                                    <Badge className={`text-xs ${item.status === 'completed' ? 'bg-green-500/20 text-green-400' : item.status === 'approved' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-500/20 text-slate-400'}`}>{item.status}</Badge>
                                    <span className="text-red-400 text-xs font-bold">{formatPrice(item.amount)} F</span>
                                    {item.assigned_week && <Badge className="bg-cyan-500/20 text-cyan-400 text-xs">S.{item.assigned_week.slice(5)}</Badge>}
                                    {isAdmin && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 w-6 p-0 text-red-400 hover:bg-red-500/15 hover:text-red-300"
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteOneExpense(item.id, item.description); }}
                                        data-testid={`hebdo-delete-expense-${item.id}`}
                                        title="Supprimer cette dépense"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    )}
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Locations detail */}
                          {data.locations?.items?.length > 0 && (
                            <div>
                              <p className="text-purple-400 text-xs font-medium mb-1">Locations ({data.locations.items.length})</p>
                              <div className="space-y-1">
                                {data.locations.items.map((item, idx) => (
                                  <div key={idx} className="flex items-center gap-2 bg-slate-800/40 rounded px-3 py-1.5">
                                    <span className="text-white text-xs flex-1">{item.customer_name} ({item.space_type})</span>
                                    <span className="text-purple-400 text-xs font-bold">{formatPrice(item.rental_amount)} F</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {(!data.sales?.items?.length && !data.expenses?.items?.length && !data.locations?.items?.length) && (
                            <p className="text-slate-500 text-xs text-center py-2">Aucune donnee ce jour</p>
                          )}

                          {/* Manager General detail */}
                          {((data.manager_general?.orders_count || 0) > 0 || (data.manager_general?.purchases_count || 0) > 0) && (
                            <div>
                              <p className="text-violet-400 text-xs font-medium mb-1">Mme la Directrice Générale</p>
                              {data.manager_general?.orders_count > 0 && (
                                <p className="text-slate-300 text-xs bg-violet-900/20 rounded px-3 py-1.5 mb-1">
                                  Commandes repas : {data.manager_general.orders_count} - <span className="text-violet-400 font-bold">{formatPrice(data.manager_general.orders_total)} F</span>
                                </p>
                              )}
                              {data.manager_general?.purchases_count > 0 && (
                                <p className="text-slate-300 text-xs bg-violet-900/20 rounded px-3 py-1.5">
                                  Achats : {data.manager_general.purchases_count} - <span className="text-violet-400 font-bold">{formatPrice(data.manager_general.purchases_total)} F</span>
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </td></tr>
                      )}
                      </React.Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gradient-to-r from-cyan-900/30 to-blue-900/20 border-2 border-cyan-500/40 font-bold">
                      <td colSpan="2" className="px-3 py-3.5 text-cyan-300 rounded-l-lg">TOTAL PÉRIODE</td>
                      <td className="px-3 py-3.5 text-right text-orange-400">{formatPrice(weeklyReport.sales?.by_revenue_group?.bar || 0)} F</td>
                      <td className="px-3 py-3.5 text-right text-green-400">{formatPrice(weeklyReport.sales?.by_revenue_group?.menu_combos || 0)} F</td>
                      <td className="px-3 py-3.5 text-right text-blue-400">{formatPrice(weeklyReport.sales?.by_revenue_group?.jeux || 0)} F</td>
                      <td className="px-3 py-3.5 text-right text-purple-400">{formatPrice(weeklyReport.locations?.total || 0)} F</td>
                      <td className="px-3 py-3.5 text-right text-red-400">{formatPrice(weeklyReport.expenses?.total || 0)} F</td>
                      <td className={`px-3 py-3.5 text-right ${weeklyReport.is_profitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {weeklyReport.result >= 0 ? '+' : ''}{formatPrice(weeklyReport.result || 0)} F
                      </td>
                      <td className="px-3 py-3.5 text-right text-violet-400 rounded-r-lg">
                        {formatPrice((weeklyReport.manager_general?.orders_total || 0) + (weeklyReport.manager_general?.purchases_total || 0))} F
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Dépenses par catégorie */}
          {weeklyReport.expenses?.by_category && Object.keys(weeklyReport.expenses.by_category).length > 0 && (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-red-400 flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" />
                  Dépenses par Catégorie
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(weeklyReport.expenses.by_category).map(([cat, amount]) => (
                    <div key={cat} className="bg-slate-700/30 rounded-lg p-3 text-center">
                      <p className="text-slate-400 capitalize text-sm">{cat}</p>
                      <p className="text-red-400 font-bold text-lg">{formatPrice(amount)} F</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Manager General */}
          {weeklyReport.manager_general && (weeklyReport.manager_general.orders_count > 0 || weeklyReport.manager_general.purchases_count > 0) && (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-violet-400 flex items-center gap-2">
                  <UserCircle className="w-5 h-5" />
                  Situation Mme la Directrice Générale
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-violet-900/20 border border-violet-500/30 rounded-lg p-3 text-center">
                    <p className="text-violet-400 text-sm">Commandes repas</p>
                    <p className="text-violet-300 font-bold text-lg">{weeklyReport.manager_general.orders_count}</p>
                    <p className="text-violet-400 font-bold">{formatPrice(weeklyReport.manager_general.orders_total)} F</p>
                  </div>
                  <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 text-center">
                    <p className="text-red-400 text-sm">Impaye repas</p>
                    <p className="text-red-300 font-bold text-lg">{formatPrice(weeklyReport.manager_general.orders_unpaid)} F</p>
                  </div>
                  <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 text-center">
                    <p className="text-blue-400 text-sm">Achats perso</p>
                    <p className="text-blue-300 font-bold text-lg">{weeklyReport.manager_general.purchases_count}</p>
                    <p className="text-blue-400 font-bold">{formatPrice(weeklyReport.manager_general.purchases_total)} F</p>
                  </div>
                  <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3 text-center">
                    <p className="text-amber-400 text-sm">Total MG</p>
                    <p className="text-amber-300 font-bold text-lg">{formatPrice((weeklyReport.manager_general.orders_total || 0) + (weeklyReport.manager_general.purchases_total || 0))} F</p>
                  </div>
                </div>

                {/* Detail orders */}
                {weeklyReport.manager_general.orders?.length > 0 && (
                  <div>
                    <p className="text-slate-400 text-sm mb-2">Detail des commandes :</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {weeklyReport.manager_general.orders.map((o, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-slate-700/30 rounded px-3 py-1.5">
                          <div>
                            <span className="text-white text-xs">{o.items?.map(i => i.name || i.product_name).join(', ') || 'Commande'}</span>
                            <span className="text-slate-500 text-xs ml-2">{(o.created_at || '').slice(0, 10)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={o.status === 'regle' ? 'bg-green-500/20 text-green-400 text-xs' : 'bg-red-500/20 text-red-400 text-xs'}>
                              {o.status === 'regle' ? 'Regle' : 'Non regle'}
                            </Badge>
                            <span className="text-violet-400 font-bold text-xs">{formatPrice(o.total)} F</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Detail purchases */}
                {weeklyReport.manager_general.purchases?.length > 0 && (
                  <div>
                    <p className="text-slate-400 text-sm mb-2">Detail des achats :</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {weeklyReport.manager_general.purchases.map((p, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-slate-700/30 rounded px-3 py-1.5">
                          <div>
                            <span className="text-white text-xs">{p.description}</span>
                            <span className="text-slate-500 text-xs ml-2">{(p.created_at || '').slice(0, 10)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={p.status === 'regle' ? 'bg-green-500/20 text-green-400 text-xs' : 'bg-red-500/20 text-red-400 text-xs'}>
                              {p.status === 'regle' ? 'Regle' : 'Non regle'}
                            </Badge>
                            <span className="text-blue-400 font-bold text-xs">{formatPrice(p.amount)} F</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}


          {/* Locations par Espace */}
          {weeklyReport.locations?.by_space && Object.keys(weeklyReport.locations.by_space).length > 0 && (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-purple-400 flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  Locations & Réservations
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Récap financier locations : Total / Avances / Solde */}
                <div className="grid grid-cols-3 gap-3" data-testid="locations-financial-summary">
                  <div className="bg-purple-900/30 border border-purple-500/40 rounded-lg p-3 text-center">
                    <p className="text-purple-300 text-xs uppercase tracking-wider">Total locations</p>
                    <p className="text-purple-200 font-bold text-lg font-mono">{formatPrice(weeklyReport.locations.total || 0)} F</p>
                    <p className="text-slate-500 text-[10px]">{weeklyReport.locations.count || 0} réservation{(weeklyReport.locations.count || 0) > 1 ? "s" : ""}</p>
                  </div>
                  <div className="bg-emerald-900/30 border border-emerald-500/40 rounded-lg p-3 text-center">
                    <p className="text-emerald-300 text-xs uppercase tracking-wider">Avances reçues</p>
                    <p className="text-emerald-200 font-bold text-lg font-mono">{formatPrice(weeklyReport.locations.advances || 0)} F</p>
                    <p className="text-slate-500 text-[10px]">Comptées dans le résultat</p>
                  </div>
                  <div className="bg-amber-900/30 border border-amber-500/40 rounded-lg p-3 text-center">
                    <p className="text-amber-300 text-xs uppercase tracking-wider">Solde à payer</p>
                    <p className="text-amber-200 font-bold text-lg font-mono">{formatPrice(weeklyReport.locations.balance_due || 0)} F</p>
                    <p className="text-slate-500 text-[10px]">Reste dû par les clients</p>
                  </div>
                </div>

                <div>
                  <p className="text-slate-400 text-sm mb-2">Total par espace (montant contractuel) :</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.entries(weeklyReport.locations.by_space).map(([space, amount]) => (
                      <div key={space} className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3 text-center">
                        <p className="text-purple-300 text-sm">{space}</p>
                        <p className="text-purple-400 font-bold text-lg">{formatPrice(amount)} F</p>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Liste détaillée des locations */}
                {weeklyReport.locations?.details?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-slate-400 text-sm mb-2">Détail des locations :</p>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {weeklyReport.locations.details.map((loc, idx) => (
                        <div key={idx} className="bg-slate-700/30 rounded-lg px-3 py-2">
                          <div className="flex justify-between items-start mb-1 flex-wrap gap-1">
                            <div>
                              <span className="text-white font-medium">{loc.customer_name}</span>
                              <span className="text-slate-400 text-sm ml-2">({loc.space_type})</span>
                              {loc.event_type && (
                                <Badge className="ml-2 bg-slate-600/50 text-slate-300 text-xs">{loc.event_type}</Badge>
                              )}
                            </div>
                            <span className="text-slate-500 text-xs">{loc.reservation_date}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs font-mono">
                            <span className="text-purple-400">Total {formatPrice(loc.rental_amount)} F</span>
                            <span className="text-emerald-400">Avance {formatPrice(loc.deposit_paid || 0)} F</span>
                            <span className={`${(loc.balance_remaining || 0) > 0 ? "text-amber-400 font-bold" : "text-slate-500"}`}>
                              Solde {formatPrice(loc.balance_remaining || 0)} F
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Statut des demandes */}
          {weeklyReport.expenses?.by_status && (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-amber-400 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Statut des Demandes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3 text-center">
                    <p className="text-amber-400 text-sm">En attente</p>
                    <p className="text-amber-300 font-bold text-lg">{formatPrice(weeklyReport.expenses.by_status.pending || 0)} F</p>
                  </div>
                  <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 text-center">
                    <p className="text-blue-400 text-sm">Approuvées</p>
                    <p className="text-blue-300 font-bold text-lg">{formatPrice(weeklyReport.expenses.by_status.approved || 0)} F</p>
                  </div>
                  <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3 text-center">
                    <p className="text-green-400 text-sm">Terminées</p>
                    <p className="text-green-300 font-bold text-lg">{formatPrice(weeklyReport.expenses.by_status.completed || 0)} F</p>
                  </div>
                  <div className="bg-orange-900/20 border border-orange-500/30 rounded-lg p-3 text-center">
                    <p className="text-orange-400 text-sm">À réviser</p>
                    <p className="text-orange-300 font-bold text-lg">{formatPrice(weeklyReport.expenses.by_status.revision_requested || 0)} F</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Qualité de Service */}
          {weeklyReport.service_quality && weeklyReport.service_quality.total_services > 0 && (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-teal-400 flex items-center gap-2">
                  <Timer className="w-5 h-5" />
                  Qualité de Service (Semaine)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Summary stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-teal-900/20 border border-teal-500/30 rounded-lg p-3 text-center">
                    <p className="text-teal-400 text-sm">Services terminés</p>
                    <p className="text-teal-300 font-bold text-2xl">{weeklyReport.service_quality.total_services}</p>
                  </div>
                  <div className="bg-cyan-900/20 border border-cyan-500/30 rounded-lg p-3 text-center">
                    <p className="text-cyan-400 text-sm">Durée moyenne</p>
                    <p className="text-cyan-300 font-bold text-2xl">{weeklyReport.service_quality.avg_duration} min</p>
                  </div>
                  <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3 text-center">
                    <p className="text-green-400 text-sm">🟢 Excellent {"<15min"}</p>
                    <p className="text-green-300 font-bold text-2xl">{weeklyReport.service_quality.quality_breakdown?.excellent || 0}</p>
                  </div>
                  <div className="bg-orange-900/20 border border-orange-500/30 rounded-lg p-3 text-center">
                    <p className="text-orange-400 text-sm">🟠 Acceptable / 🔴 Lent</p>
                    <p className="text-orange-300 font-bold text-2xl">
                      {weeklyReport.service_quality.quality_breakdown?.acceptable || 0} / {weeklyReport.service_quality.quality_breakdown?.slow || 0}
                    </p>
                  </div>
                </div>

                {/* Daily breakdown table */}
                {Object.keys(weeklyReport.service_quality.by_day || {}).length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-400 border-b border-slate-700">
                          <th className="p-2">Jour</th>
                          <th className="p-2 text-center">Services</th>
                          <th className="p-2 text-center">Durée moy.</th>
                          <th className="p-2 text-center">🟢</th>
                          <th className="p-2 text-center">🟠</th>
                          <th className="p-2 text-center">🔴</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(weeklyReport.daily || {}).map(([date, data]) => (
                          <tr key={date} className="border-b border-slate-700/50">
                            <td className="p-2 text-white font-medium">{data.day_name}</td>
                            <td className="p-2 text-center text-teal-400">{data.service?.count || 0}</td>
                            <td className="p-2 text-center text-cyan-400">{data.service?.avg_duration || 0} min</td>
                            <td className="p-2 text-center text-green-400">{data.service?.excellent || 0}</td>
                            <td className="p-2 text-center text-orange-400">{data.service?.acceptable || 0}</td>
                            <td className="p-2 text-center text-red-400">{data.service?.slow || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card className="bg-slate-800/30 border-slate-700">
          <CardContent className="py-12 text-center">
            <BarChart3 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-500">Chargement des données...</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default HebdoReport;
