import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  BarChart3, ChevronLeft, ChevronRight, Download, MessageCircle,
  Calendar, TrendingUp, ShoppingCart, DollarSign, Clock, AlertCircle, Timer, Building2,
  Link, Check
} from "lucide-react";
import { format, startOfWeek, addWeeks, subWeeks } from "date-fns";
import { fr } from "date-fns/locale";
import axios from "axios";
import { toast } from "sonner";

const HebdoReport = ({ 
  weeklyReport, 
  weekStartDate, 
  setWeekStartDate, 
  generateWeeklyPDF, 
  sendWeeklyWhatsApp, 
  formatPrice,
  API,
  refreshWeekly
}) => {
  const [showAttach, setShowAttach] = useState(false);
  const [unlinkedInvoices, setUnlinkedInvoices] = useState([]);
  const [unlinkedExpenses, setUnlinkedExpenses] = useState([]);
  const [selectedInvoices, setSelectedInvoices] = useState([]);
  const [selectedExpenses, setSelectedExpenses] = useState([]);
  const [attachDateFrom, setAttachDateFrom] = useState("");
  const [attachDateTo, setAttachDateTo] = useState("");
  const [loadingAttach, setLoadingAttach] = useState(false);

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

  // Ensure weekStartDate is always a Monday
  const handleWeekChange = (newDate) => {
    const date = new Date(newDate);
    const monday = startOfWeek(date, { weekStartsOn: 1 });
    setWeekStartDate(format(monday, "yyyy-MM-dd"));
  };

  // Navigate to previous/next week
  const navigateWeek = (direction) => {
    const currentDate = new Date(weekStartDate);
    const newDate = direction === 'prev' 
      ? subWeeks(currentDate, 1) 
      : addWeeks(currentDate, 1);
    setWeekStartDate(format(newDate, "yyyy-MM-dd"));
  };

  // Get current week label for display
  const getCurrentWeekLabel = () => {
    const weekStart = new Date(weekStartDate);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    return `Lun ${format(weekStart, "dd/MM")} → Dim ${format(weekEnd, "dd/MM/yyyy")}`;
  };

  return (
    <div className="space-y-4">
      {/* Header avec boutons d'action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-cyan-300 flex items-center gap-2">
          <BarChart3 className="w-6 h-6" />
          Point Hebdomadaire
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigateWeek('prev')}
            className="border-slate-600 text-slate-300"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          
          {/* Week Selector Dropdown */}
          <Select value={weekStartDate} onValueChange={handleWeekChange}>
            <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white w-[220px]">
              <Calendar className="w-4 h-4 mr-2 text-cyan-400" />
              <SelectValue placeholder="Sélectionner une semaine">
                {getCurrentWeekLabel()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              {weekOptions.map((week) => (
                <SelectItem 
                  key={week.value} 
                  value={week.value}
                  className="text-white hover:bg-slate-700 focus:bg-slate-700"
                >
                  <div className="flex items-center gap-2">
                    {week.isCurrentWeek && (
                      <Badge className="bg-cyan-500/20 text-cyan-400 text-xs">Cette semaine</Badge>
                    )}
                    <span>{week.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigateWeek('next')}
            className="border-slate-600 text-slate-300"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          {weeklyReport && (
            <>
              <Button 
                size="sm"
                onClick={() => generateWeeklyPDF()}
                className="bg-red-600 hover:bg-red-700"
              >
                <Download className="w-4 h-4 mr-1" />
                PDF
              </Button>
              <Button 
                size="sm"
                onClick={() => sendWeeklyWhatsApp()}
                className="bg-green-600 hover:bg-green-700"
              >
                <MessageCircle className="w-4 h-4 mr-1" />
                WhatsApp
              </Button>
              <Button 
                size="sm"
                onClick={() => setShowAttach(!showAttach)}
                className={showAttach ? "bg-cyan-700 hover:bg-cyan-800" : "bg-cyan-600 hover:bg-cyan-700"}
                data-testid="attach-btn"
              >
                <Link className="w-4 h-4 mr-1" />
                Rattacher
              </Button>
            </>
          )}
        </div>
      </div>

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

      {weeklyReport ? (
        <div className="space-y-4">
          {/* Titre de la semaine */}
          <div className="text-center">
            <p className="text-lg text-cyan-400 font-semibold">{weeklyReport.week_label}</p>
          </div>

          {/* Résumé en cartes */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
            <Card className="bg-gradient-to-br from-green-900/30 to-emerald-900/20 border-green-500/50">
              <CardContent className="p-4 text-center">
                <TrendingUp className="w-6 h-6 text-green-400 mx-auto mb-1" />
                <p className="text-2xl font-bold text-green-400">{formatPrice(weeklyReport.sales?.total || 0)} F</p>
                <p className="text-xs text-slate-400">{weeklyReport.sales?.count || 0} ventes</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-purple-900/30 to-violet-900/20 border-purple-500/50">
              <CardContent className="p-4 text-center">
                <Building2 className="w-6 h-6 text-purple-400 mx-auto mb-1" />
                <p className="text-2xl font-bold text-purple-400">{formatPrice(weeklyReport.locations?.total || 0)} F</p>
                <p className="text-xs text-slate-400">{weeklyReport.locations?.count || 0} locations</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-red-900/30 to-orange-900/20 border-red-500/50">
              <CardContent className="p-4 text-center">
                <ShoppingCart className="w-6 h-6 text-red-400 mx-auto mb-1" />
                <p className="text-2xl font-bold text-red-400">{formatPrice(weeklyReport.expenses?.total || 0)} F</p>
                <p className="text-xs text-slate-400">{weeklyReport.expenses?.count || 0} achats</p>
              </CardContent>
            </Card>
            <Card className={`bg-gradient-to-br ${weeklyReport.is_profitable ? 'from-emerald-900/30 to-green-900/20 border-emerald-500/50' : 'from-rose-900/30 to-red-900/20 border-rose-500/50'}`}>
              <CardContent className="p-4 text-center">
                <DollarSign className={`w-6 h-6 mx-auto mb-1 ${weeklyReport.is_profitable ? 'text-emerald-400' : 'text-rose-400'}`} />
                <p className={`text-2xl font-bold ${weeklyReport.is_profitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {weeklyReport.result >= 0 ? '+' : ''}{formatPrice(weeklyReport.result || 0)} F
                </p>
                <p className="text-xs text-slate-400">{weeklyReport.is_profitable ? 'Bénéfice' : 'Perte'}</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-cyan-900/30 to-blue-900/20 border-cyan-500/50">
              <CardContent className="p-4 text-center">
                <TrendingUp className="w-6 h-6 text-cyan-400 mx-auto mb-1" />
                <p className="text-2xl font-bold text-cyan-400">{formatPrice(weeklyReport.total_income || (weeklyReport.sales?.total || 0) + (weeklyReport.locations?.total || 0))} F</p>
                <p className="text-xs text-slate-400">Total Recettes</p>
              </CardContent>
            </Card>
          </div>

          {/* Tableau jour par jour */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-cyan-400 flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Détail Jour par Jour
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-700">
                      <th className="p-3">Jour</th>
                      <th className="p-3">Date</th>
                      <th className="p-3 text-right text-green-400">Ventes</th>
                      <th className="p-3 text-right text-purple-400">Locations</th>
                      <th className="p-3 text-right text-red-400">Dépenses</th>
                      <th className="p-3 text-right">Résultat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(weeklyReport.daily || {}).map(([date, data]) => (
                      <tr key={date} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="p-3 font-semibold text-white">{data.day_name}</td>
                        <td className="p-3 text-slate-400">{data.date_formatted}</td>
                        <td className="p-3 text-right">
                          <span className="text-green-400 font-bold">{formatPrice(data.sales?.total || 0)} F</span>
                          <span className="text-slate-500 text-xs ml-1">({data.sales?.count || 0})</span>
                        </td>
                        <td className="p-3 text-right">
                          <span className="text-purple-400 font-bold">{formatPrice(data.locations?.total || 0)} F</span>
                          <span className="text-slate-500 text-xs ml-1">({data.locations?.count || 0})</span>
                        </td>
                        <td className="p-3 text-right">
                          <span className="text-red-400 font-bold">{formatPrice(data.expenses?.total || 0)} F</span>
                          <span className="text-slate-500 text-xs ml-1">({data.expenses?.count || 0})</span>
                        </td>
                        <td className={`p-3 text-right font-bold ${data.result >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {data.result >= 0 ? '+' : ''}{formatPrice(data.result)} F
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-900/50 font-bold">
                      <td colSpan="2" className="p-3 text-white">TOTAL SEMAINE</td>
                      <td className="p-3 text-right text-green-400">{formatPrice(weeklyReport.sales?.total || 0)} F</td>
                      <td className="p-3 text-right text-purple-400">{formatPrice(weeklyReport.locations?.total || 0)} F</td>
                      <td className="p-3 text-right text-red-400">{formatPrice(weeklyReport.expenses?.total || 0)} F</td>
                      <td className={`p-3 text-right ${weeklyReport.is_profitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {weeklyReport.result >= 0 ? '+' : ''}{formatPrice(weeklyReport.result || 0)} F
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

          {/* Locations par Espace */}
          {weeklyReport.locations?.by_space && Object.keys(weeklyReport.locations.by_space).length > 0 && (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-purple-400 flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  Locations par Espace
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(weeklyReport.locations.by_space).map(([space, amount]) => (
                    <div key={space} className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3 text-center">
                      <p className="text-purple-300 text-sm">{space}</p>
                      <p className="text-purple-400 font-bold text-lg">{formatPrice(amount)} F</p>
                    </div>
                  ))}
                </div>
                
                {/* Liste détaillée des locations */}
                {weeklyReport.locations?.details?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-slate-400 text-sm mb-2">Détail des locations :</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {weeklyReport.locations.details.map((loc, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-slate-700/30 rounded-lg px-3 py-2">
                          <div>
                            <span className="text-white font-medium">{loc.customer_name}</span>
                            <span className="text-slate-400 text-sm ml-2">({loc.space_type})</span>
                            {loc.event_type && (
                              <Badge className="ml-2 bg-slate-600/50 text-slate-300 text-xs">{loc.event_type}</Badge>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-purple-400 font-bold">{formatPrice(loc.rental_amount)} F</p>
                            <p className="text-slate-500 text-xs">{loc.reservation_date}</p>
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
