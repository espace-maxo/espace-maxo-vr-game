/**
 * DailyReportsList — Sous-menu "Rapports" pour l'admin dans Recoupement IA.
 *
 * - Liste les rapports cuisine + coach_jeux transmis (status=submitted)
 * - Filtrable par date / kind / status
 * - Cliquer ouvre le détail avec comparaison automatique aux ventes système (rows par item + total global)
 */
import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  FileText, RefreshCw, Loader2, ChefHat, Gamepad2, Lock, CheckCircle2,
  AlertTriangle, Eye, XCircle, TrendingUp, TrendingDown, Equal, Trash2,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_COLORS = {
  ok:                       { color: "bg-emerald-500/30 text-emerald-200 border-emerald-500/40", icon: Equal,         label: "OK" },
  over_declared:            { color: "bg-amber-500/30  text-amber-200  border-amber-500/40",   icon: TrendingUp,    label: "Surdéclaré" },
  under_declared:           { color: "bg-rose-500/30   text-rose-200   border-rose-500/40",    icon: TrendingDown,  label: "Sous-déclaré" },
  missing_in_system:        { color: "bg-rose-500/30   text-rose-200   border-rose-500/40",    icon: AlertTriangle, label: "Absent système" },
  missing_in_declaration:   { color: "bg-purple-500/30 text-purple-200 border-purple-500/40",  icon: AlertTriangle, label: "Non déclaré" },
};

const DailyReportsList = ({ currentUser }) => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterKind, setFilterKind] = useState("all");
  const [filterDate, setFilterDate] = useState("");
  const [detailReport, setDetailReport] = useState(null);
  const [detailComparison, setDetailComparison] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const actorRole = currentUser?.role || "admin";

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/daily-reports`, {
        params: {
          actor_role: actorRole,
          kind: filterKind === "all" ? undefined : filterKind,
          date: filterDate || undefined,
          status: "submitted",
          limit: 100,
        },
      });
      setReports(r.data.reports || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur chargement rapports");
    } finally {
      setLoading(false);
    }
  }, [actorRole, filterKind, filterDate]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const openDetail = async (rep) => {
    setDetailReport(rep);
    setDetailLoading(true);
    setDetailComparison(null);
    try {
      const r = await axios.get(`${API}/daily-reports/${rep.id}`, { params: { actor_role: actorRole } });
      setDetailComparison(r.data.comparison);
    } catch (e) {
      toast.error("Erreur chargement comparaison");
    } finally {
      setDetailLoading(false);
    }
  };

  const deleteReport = async (e, rep) => {
    e.stopPropagation();
    if (!window.confirm(`Supprimer le rapport ${rep.kind === "cuisine" ? "cuisinier" : "coach"} ${rep.actor_name} du ${rep.date} ?`)) return;
    try {
      await axios.delete(`${API}/daily-reports/${rep.id}`, { params: { actor_role: actorRole } });
      toast.success("Rapport supprimé");
      fetchReports();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  return (
    <Card className="bg-slate-800/50 border-slate-700" data-testid="daily-reports-list">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-cyan-400" />
            Rapports du terrain (cuisinier + coach jeux)
            <Badge className="bg-cyan-500/20 text-cyan-200">{reports.length}</Badge>
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filterKind} onValueChange={setFilterKind}>
              <SelectTrigger className="bg-slate-900 border-slate-700 h-8 text-xs w-[140px]" data-testid="reports-filter-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                <SelectItem value="all">Tous les profils</SelectItem>
                <SelectItem value="cuisine">Cuisinier</SelectItem>
                <SelectItem value="coach_jeux">Coach Jeux</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}
                   className="bg-slate-900 border-slate-700 h-8 text-xs w-[140px]" data-testid="reports-filter-date" />
            <Button variant="ghost" size="sm" onClick={fetchReports} disabled={loading}
                    className="text-slate-300 h-8 text-[11px]" data-testid="reports-refresh">
              {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              Actualiser
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {reports.length === 0 && !loading && (
          <p className="text-slate-500 italic text-center py-4 text-sm">
            Aucun rapport transmis pour les filtres actuels.
          </p>
        )}
        {reports.map((r) => {
          const KIcon = r.kind === "cuisine" ? ChefHat : Gamepad2;
          const accent = r.kind === "cuisine" ? "amber" : "purple";
          const s = r.auto_summary || {};
          return (
            <div key={r.id}
                 className="bg-slate-900/50 border border-slate-700 rounded p-2.5 text-xs hover:border-cyan-500/40 transition cursor-pointer"
                 onClick={() => openDetail(r)}
                 data-testid={`daily-report-row-${r.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <KIcon className={`w-4 h-4 text-${accent}-400`} />
                    <span className="font-semibold text-slate-100">
                      {r.kind === "cuisine" ? "Cuisinier" : "Coach Jeux"}
                    </span>
                    <span className="text-slate-400">— {r.actor_name}</span>
                    <Badge className="bg-slate-700 text-slate-200 text-[10px]">
                      {r.date}
                    </Badge>
                    <Badge className="bg-emerald-500/30 text-emerald-200 text-[10px]">
                      <Lock className="w-2.5 h-2.5 mr-0.5" /> Transmis {r.submitted_at ? format(new Date(r.submitted_at), "HH:mm") : ""}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap gap-x-3">
                    {r.kind === "cuisine" ? (
                      <>
                        <span>{s.total_quantity || 0} plat(s)</span>
                        <span>· {s.items_count || 0} types</span>
                        <span>· {s.scans_count || 0} scans</span>
                      </>
                    ) : (
                      <>
                        <span>{s.bons_total || 0} bons</span>
                        <span>· {s.total_quantity || 0} parties</span>
                        <span>· {(s.total_revenue || 0).toLocaleString("fr-FR")} F</span>
                      </>
                    )}
                  </div>
                  {r.observations && (
                    <p className="text-[10px] text-slate-400 italic mt-0.5 line-clamp-1">
                      « {r.observations} »
                    </p>
                  )}
                </div>
                <Button size="sm" variant="ghost" className="text-cyan-300 h-7 text-[10px] shrink-0">
                  <Eye className="w-3 h-3 mr-1" /> Voir
                </Button>
                <Button size="sm" variant="ghost"
                        onClick={(e) => deleteReport(e, r)}
                        className="text-rose-400 hover:text-rose-300 h-7 w-7 p-0 shrink-0"
                        data-testid={`daily-report-delete-${r.id}`}
                        title="Supprimer (admin)">
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>

      {/* Detail Modal with comparison */}
      <Dialog open={!!detailReport} onOpenChange={(o) => { if (!o) { setDetailReport(null); setDetailComparison(null); } }}>
        <DialogContent className="max-w-3xl w-[98vw] sm:w-auto max-h-[90vh] bg-slate-900 border-cyan-500/40 text-white p-0 overflow-hidden">
          <DialogHeader className="p-3 border-b border-slate-700">
            <DialogTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              Rapport {detailReport?.kind === "cuisine" ? "Cuisinier" : "Coach Jeux"} — {detailReport?.actor_name} — {detailReport?.date}
            </DialogTitle>
          </DialogHeader>
          <div className="p-3 overflow-y-auto max-h-[calc(90vh-60px)] space-y-3">
            {detailLoading && (
              <div className="text-center py-6">
                <Loader2 className="w-5 h-5 mx-auto animate-spin text-slate-400" />
              </div>
            )}
            {detailReport && !detailLoading && detailComparison && (
              <>
                {/* Observations */}
                {detailReport.observations && (
                  <Card className="bg-slate-800/40 border-slate-700">
                    <CardContent className="p-3 text-xs">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Observations</div>
                      <p className="text-slate-200 whitespace-pre-wrap">{detailReport.observations}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Totaux globaux */}
                <Card className="bg-slate-800/40 border-cyan-500/40">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Totaux globaux du jour</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="bg-slate-900/50 rounded p-2">
                      <div className="text-[10px] text-slate-400">Qté déclarée</div>
                      <div className="text-lg font-bold text-amber-200">{detailComparison.total_declared_qty}</div>
                    </div>
                    <div className="bg-slate-900/50 rounded p-2">
                      <div className="text-[10px] text-slate-400">Qté système</div>
                      <div className="text-lg font-bold text-blue-200">{detailComparison.total_system_qty}</div>
                    </div>
                    <div className="bg-slate-900/50 rounded p-2">
                      <div className="text-[10px] text-slate-400">CA déclaré</div>
                      <div className="text-sm font-bold text-amber-200">{(detailComparison.total_declared_revenue || 0).toLocaleString("fr-FR")} F</div>
                    </div>
                    <div className="bg-slate-900/50 rounded p-2">
                      <div className="text-[10px] text-slate-400">CA système</div>
                      <div className="text-sm font-bold text-blue-200">{(detailComparison.total_system_revenue || 0).toLocaleString("fr-FR")} F</div>
                    </div>
                  </CardContent>
                  <CardContent className="pt-0">
                    <div className={`text-center p-2 rounded text-sm font-bold ${detailComparison.alerts_count > 0
                      ? "bg-rose-900/40 text-rose-200 border border-rose-500/40"
                      : "bg-emerald-900/40 text-emerald-200 border border-emerald-500/40"}`}>
                      {detailComparison.alerts_count > 0 ? (
                        <><AlertTriangle className="w-4 h-4 inline mr-1" /> {detailComparison.alerts_count} écart(s) détecté(s) · Gap : {detailComparison.global_gap?.toLocaleString("fr-FR")} F</>
                      ) : (
                        <><CheckCircle2 className="w-4 h-4 inline mr-1" /> Aucun écart détecté · Déclaration en cohérence avec le système</>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Tableau par item */}
                <Card className="bg-slate-800/40 border-slate-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Comparaison détaillée par {detailReport?.kind === "cuisine" ? "plat" : "jeu"}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-900/60 text-slate-400 text-[10px] uppercase">
                            <th className="text-left p-2">Item</th>
                            <th className="text-right p-2">Qté déclarée</th>
                            <th className="text-right p-2">Qté système</th>
                            <th className="text-right p-2">Écart</th>
                            <th className="text-right p-2">CA système</th>
                            <th className="text-center p-2">Statut</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailComparison.rows.length === 0 && (
                            <tr><td colSpan="6" className="p-3 text-center text-slate-500 italic">Aucune ligne</td></tr>
                          )}
                          {detailComparison.rows.map((row, idx) => {
                            const meta = STATUS_COLORS[row.status] || STATUS_COLORS.ok;
                            const Icon = meta.icon;
                            return (
                              <tr key={idx} className="border-t border-slate-700/50 hover:bg-slate-900/30">
                                <td className="p-2 text-slate-200">{row.name}</td>
                                <td className="p-2 text-right text-amber-200">{row.qty_declared}</td>
                                <td className="p-2 text-right text-blue-200">{row.qty_system}</td>
                                <td className={`p-2 text-right font-semibold ${row.gap > 0 ? "text-amber-300" : row.gap < 0 ? "text-rose-300" : "text-slate-400"}`}>
                                  {row.gap > 0 ? `+${row.gap}` : row.gap}
                                </td>
                                <td className="p-2 text-right text-slate-300">{(row.total_system || 0).toLocaleString("fr-FR")} F</td>
                                <td className="p-2 text-center">
                                  <Badge className={`${meta.color} text-[9px] border`}>
                                    <Icon className="w-2.5 h-2.5 mr-0.5" /> {meta.label}
                                  </Badge>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default DailyReportsList;
