/**
 * DailyReportsBubbles — Affiche les rapports du terrain (cuisinier + coach jeux)
 * sous forme de bulles cliquables. Au clic, ouvre un dialog avec les bons scannés
 * par le cuisinier ce jour-là et le détail du rapport.
 *
 * Source backend :
 *   - GET /api/daily-reports?limit=200 (les rapports)
 *   - GET /api/recoupements?kind=cuisine_scan&date=YYYY-MM-DD (les bons scannés du jour)
 */
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Loader2,
  CalendarDays,
  ChefHat,
  Gamepad2,
  ScrollText,
  CheckCircle2,
  Clock,
  Camera,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n || 0));

const DailyReportsBubbles = ({ currentUser }) => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [scans, setScans] = useState([]);
  const [loadingScans, setLoadingScans] = useState(false);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/daily-reports`, { params: { limit: 200 } });
      const list = Array.isArray(r.data) ? r.data : r.data?.reports || [];
      // Regroupement par date
      const byDate = {};
      list.forEach((rep) => {
        const d = (rep.report_date || rep.date || rep.created_at || "").slice(0, 10);
        if (!d) return;
        if (!byDate[d]) byDate[d] = { date: d, items: [], roles: new Set(), total_value: 0 };
        byDate[d].items.push(rep);
        if (rep.author_role) byDate[d].roles.add(rep.author_role);
        // Estimation de la valeur (si présente)
        byDate[d].total_value += parseFloat(rep.total_value || 0) || 0;
      });
      const groups = Object.values(byDate)
        .map((g) => ({ ...g, roles: Array.from(g.roles) }))
        .sort((a, b) => b.date.localeCompare(a.date));
      setReports(groups);
    } catch (e) {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const openBubble = async (date) => {
    setSelectedDate(date);
    setLoadingScans(true);
    setScans([]);
    try {
      const r = await axios.get(`${API}/recoupement/list`, {
        params: { kind: "cuisine_scan", start_date: date, end_date: date, include_scans: true, limit: 200 },
      });
      const items = Array.isArray(r.data) ? r.data : r.data?.items || [];
      setScans(items);
    } catch (e) {
      setScans([]);
    } finally {
      setLoadingScans(false);
    }
  };

  const formatDate = (s) => {
    try { return format(parseISO(s), "EEEE dd MMM yyyy", { locale: fr }); }
    catch { return s; }
  };

  return (
    <Card className="bg-gradient-to-br from-emerald-900/15 to-cyan-900/10 border-emerald-500/40" data-testid="daily-reports-bubbles">
      <CardHeader className="pb-2">
        <CardTitle className="text-emerald-200 flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-emerald-300" />
            Rapports du terrain — Cliquez sur une bulle pour voir les bons scannés
          </span>
          <Badge className="bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 text-xs">
            {reports.length} jour{reports.length > 1 ? "s" : ""}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-center text-slate-500 py-6 text-sm flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
          </p>
        ) : reports.length === 0 ? (
          <p className="text-center text-slate-500 py-6 text-sm">
            Aucun rapport de fin de journée enregistré pour le moment.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {reports.slice(0, 30).map((day) => (
              <button
                key={day.date}
                type="button"
                onClick={() => openBubble(day.date)}
                className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 hover:border-emerald-400/60 px-3 py-2 text-left transition-all"
                data-testid={`daily-report-bubble-${day.date}`}
              >
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-300/80">
                  <CalendarDays className="w-3 h-3" />
                  {(() => {
                    try { return format(parseISO(day.date), "dd MMM", { locale: fr }); }
                    catch { return day.date; }
                  })()}
                </div>
                <div className="font-bold text-base text-emerald-100 mt-0.5">
                  {day.items.length} rapport{day.items.length > 1 ? "s" : ""}
                </div>
                <div className="flex flex-wrap gap-0.5 mt-1">
                  {day.roles.includes("cuisinier") && (
                    <ChefHat className="w-3 h-3 text-orange-300" title="Cuisinier" />
                  )}
                  {day.roles.includes("coach_jeux") && (
                    <Gamepad2 className="w-3 h-3 text-blue-300" title="Coach Jeux" />
                  )}
                  {day.total_value > 0 && (
                    <span className="text-[10px] text-emerald-200/80">
                      {fmt(day.total_value)} F
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>

      {/* Dialog : détails du jour + bons scannés */}
      <Dialog open={!!selectedDate} onOpenChange={(v) => !v && setSelectedDate(null)}>
        <DialogContent className="bg-slate-900 border-emerald-500/40 max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-emerald-200 capitalize flex items-center gap-2">
              <CalendarDays className="w-5 h-5" />
              {selectedDate && formatDate(selectedDate)}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Rapports du terrain et bons cuisine scannés ce jour-là.
            </DialogDescription>
          </DialogHeader>

          {selectedDate && (() => {
            const day = reports.find((d) => d.date === selectedDate);
            return (
              <div className="space-y-3 pt-2">
                {/* Rapports textuels */}
                {day?.items?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-emerald-300 text-xs uppercase font-bold tracking-wide">
                      Rapports ({day.items.length})
                    </p>
                    {day.items.map((rep, idx) => {
                      const role = rep.author_role || "";
                      const RoleIcon = role === "cuisinier" ? ChefHat : role === "coach_jeux" ? Gamepad2 : ScrollText;
                      const roleColor = role === "cuisinier" ? "text-orange-300" : role === "coach_jeux" ? "text-blue-300" : "text-slate-300";
                      return (
                        <div
                          key={rep.id || idx}
                          className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-3 text-sm"
                          data-testid={`daily-report-${rep.id || idx}`}
                        >
                          <div className="flex items-center gap-2 text-xs mb-1">
                            <RoleIcon className={`w-4 h-4 ${roleColor}`} />
                            <span className="text-white font-semibold">{rep.author_name || "Anonyme"}</span>
                            <Badge className="bg-slate-700/60 text-slate-200 text-[10px] uppercase">{role || "—"}</Badge>
                            {rep.total_value > 0 && (
                              <Badge className="bg-emerald-500/20 text-emerald-200 text-[10px]">{fmt(rep.total_value)} F</Badge>
                            )}
                          </div>
                          {rep.notes && (
                            <p className="text-slate-300 italic text-xs whitespace-pre-wrap mt-1">
                              {rep.notes}
                            </p>
                          )}
                          {rep.items?.length > 0 && (
                            <ul className="text-xs text-slate-300 mt-2 space-y-0.5 ml-3">
                              {rep.items.slice(0, 30).map((it, i) => (
                                <li key={i} className="flex justify-between">
                                  <span>— {it.name}</span>
                                  <span className="text-slate-400">{fmt(it.quantity)} {it.unit || ""}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Bons cuisine scannés */}
                <div className="space-y-2">
                  <p className="text-cyan-300 text-xs uppercase font-bold tracking-wide flex items-center gap-2">
                    <Camera className="w-3 h-3" />
                    Bons cuisine scannés ({scans.length})
                  </p>
                  {loadingScans ? (
                    <p className="text-slate-500 text-xs text-center py-3">Chargement…</p>
                  ) : scans.length === 0 ? (
                    <p className="text-slate-600 text-xs text-center py-3 italic">
                      Aucun bon scanné par le cuisinier ce jour-là.
                    </p>
                  ) : (
                    scans.map((sc, idx) => (
                      <div
                        key={sc.id || idx}
                        className="bg-slate-800/40 border border-cyan-500/30 rounded-lg p-3 text-sm"
                        data-testid={`bubble-scan-${sc.id || idx}`}
                      >
                        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                          <div className="flex items-center gap-2 text-xs">
                            <Camera className="w-3 h-3 text-cyan-300" />
                            <span className="text-white font-mono">
                              {sc.created_at && (() => {
                                try { return format(parseISO(sc.created_at), "HH:mm", { locale: fr }); }
                                catch { return ""; }
                              })()}
                            </span>
                            {sc.author_name && <span className="text-slate-300">par {sc.author_name}</span>}
                          </div>
                          <Badge className={`text-[10px] ${sc.status === "validated" ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200"}`}>
                            {sc.status === "validated" ? (
                              <><CheckCircle2 className="w-3 h-3 mr-1" /> Validé</>
                            ) : (
                              <><Clock className="w-3 h-3 mr-1" /> En attente</>
                            )}
                          </Badge>
                        </div>
                        {sc.items?.length > 0 ? (
                          <ul className="text-xs space-y-0.5">
                            {sc.items.map((it, i) => (
                              <li key={i} className="flex justify-between text-slate-200">
                                <span>— {it.name}</span>
                                <span className="text-slate-400">
                                  {fmt(it.quantity)} {it.price ? `· ${fmt(it.price)} F` : ""}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-slate-500 text-xs italic">— Bon scanné sans détails extraits —</p>
                        )}
                        {sc.notes && (
                          <p className="text-slate-400 italic text-[11px] mt-2">{sc.notes}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default DailyReportsBubbles;
