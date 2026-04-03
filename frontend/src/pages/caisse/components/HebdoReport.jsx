import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  BarChart3, ChevronLeft, ChevronRight, Download, MessageCircle,
  Calendar, TrendingUp, ShoppingCart, DollarSign, Clock, AlertCircle, Timer
} from "lucide-react";
import { format, startOfWeek, addWeeks, subWeeks } from "date-fns";
import { fr } from "date-fns/locale";

const HebdoReport = ({ 
  weeklyReport, 
  weekStartDate, 
  setWeekStartDate, 
  generateWeeklyPDF, 
  sendWeeklyWhatsApp, 
  formatPrice 
}) => {
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
            </>
          )}
        </div>
      </div>

      {weeklyReport ? (
        <div className="space-y-4">
          {/* Titre de la semaine */}
          <div className="text-center">
            <p className="text-lg text-cyan-400 font-semibold">{weeklyReport.week_label}</p>
          </div>

          {/* Résumé en cartes */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <Card className="bg-gradient-to-br from-green-900/30 to-emerald-900/20 border-green-500/50">
              <CardContent className="p-4 text-center">
                <TrendingUp className="w-6 h-6 text-green-400 mx-auto mb-1" />
                <p className="text-2xl font-bold text-green-400">{formatPrice(weeklyReport.sales?.total || 0)} F</p>
                <p className="text-xs text-slate-400">{weeklyReport.sales?.count || 0} ventes</p>
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
            <Card className="bg-gradient-to-br from-amber-900/30 to-orange-900/20 border-amber-500/50">
              <CardContent className="p-4 text-center">
                <Clock className="w-6 h-6 text-amber-400 mx-auto mb-1" />
                <p className="text-2xl font-bold text-amber-400">{weeklyReport.expenses?.all_count || 0}</p>
                <p className="text-xs text-slate-400">Demandes totales</p>
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
                      <th className="p-3 text-right text-green-400">Recettes</th>
                      <th className="p-3 text-right text-red-400">Dépenses</th>
                      <th className="p-3 text-right">Résultat</th>
                      <th className="p-3 text-center">Détails Achats</th>
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
                          <span className="text-red-400 font-bold">{formatPrice(data.expenses?.total || 0)} F</span>
                          <span className="text-slate-500 text-xs ml-1">({data.expenses?.count || 0})</span>
                        </td>
                        <td className={`p-3 text-right font-bold ${data.result >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {data.result >= 0 ? '+' : ''}{formatPrice(data.result)} F
                        </td>
                        <td className="p-3">
                          {data.expenses?.items?.length > 0 ? (
                            <div className="space-y-1 max-h-24 overflow-y-auto">
                              {data.expenses.items.map((exp, idx) => (
                                <div key={idx} className="text-xs flex justify-between items-center bg-slate-700/30 rounded px-2 py-1">
                                  <span className="text-slate-300 truncate max-w-[150px]" title={exp.description}>
                                    {exp.is_group ? '📦 ' : ''}{exp.description}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <Badge className={`text-xs ${
                                      exp.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                                      exp.status === 'approved' ? 'bg-blue-500/20 text-blue-400' :
                                      exp.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                                      'bg-orange-500/20 text-orange-400'
                                    }`}>
                                      {exp.status === 'completed' ? '✓' : exp.status === 'approved' ? '→' : exp.status === 'pending' ? '?' : '↻'}
                                    </Badge>
                                    <span className="text-slate-400">{formatPrice(exp.amount)} F</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-600 text-xs">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-900/50 font-bold">
                      <td colSpan="2" className="p-3 text-white">TOTAL SEMAINE</td>
                      <td className="p-3 text-right text-green-400">{formatPrice(weeklyReport.sales?.total || 0)} F</td>
                      <td className="p-3 text-right text-red-400">{formatPrice(weeklyReport.expenses?.total || 0)} F</td>
                      <td className={`p-3 text-right ${weeklyReport.is_profitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {weeklyReport.result >= 0 ? '+' : ''}{formatPrice(weeklyReport.result || 0)} F
                      </td>
                      <td className="p-3"></td>
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
