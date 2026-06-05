/**
 * RecoupementSyntheseTable — Tableau de synthèse comparative sur une période.
 *
 * Pour kind="cuisine" : compare les bons de cuisine (terrain) vs les ventes système
 * Pour kind="jeux"    : compare les jeux déclarés par le coach vs facturés en caisse
 *
 * Source : GET /api/recoupement/synthese?kind&start_date&end_date
 *
 * Affichage :
 *   - KPI : Total déclaré / Total système / Écart global / Nb alertes
 *   - Tableau : ligne par plat/jeu avec sévérité (ok / warning / alert)
 *   - Filtres : sévérité + date range
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { format, startOfMonth, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ScrollText,
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Gamepad2,
  ChefHat,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n || 0));

const SEVERITY_TONE = {
  ok: { color: "emerald", icon: CheckCircle2, label: "OK" },
  warning: { color: "amber", icon: AlertTriangle, label: "Écart léger" },
  alert: { color: "rose", icon: AlertOctagon, label: "Alerte" },
};

const RecoupementSyntheseTable = ({ kind = "cuisine", title }) => {
  const today = format(new Date(), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(today);
  const [filterSev, setFilterSev] = useState("all");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/recoupement/synthese`, {
        params: { kind, start_date: start, end_date: end },
      });
      setData(r.data);
    } catch (e) {
      toast.error("Erreur chargement synthèse");
    } finally {
      setLoading(false);
    }
  }, [kind, start, end]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    if (filterSev === "all") return data.rows;
    return data.rows.filter((r) => r.severity === filterSev);
  }, [data, filterSev]);

  const summary = data?.summary || {};
  const Icon = kind === "cuisine" ? ChefHat : Gamepad2;
  const titleColor = kind === "cuisine" ? "text-orange-200" : "text-blue-200";

  const globalDiff = summary.global_diff_revenue || 0;
  const globalDiffPct = (summary.global_diff_pct || 0) * 100;

  return (
    <Card className={`bg-gradient-to-br ${kind === "cuisine" ? "from-orange-900/15 to-red-900/10 border-orange-500/40" : "from-blue-900/15 to-indigo-900/10 border-blue-500/40"}`} data-testid={`recoupement-synthese-${kind}`}>
      <CardHeader className="pb-2">
        <CardTitle className={`${titleColor} flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2`}>
          <span className="flex items-center gap-2 text-base">
            <Icon className="w-5 h-5" />
            {title || (kind === "cuisine" ? "Recoupement Cuisine — Bons vs Ventes" : "Recoupement Jeux — Coach vs Caisse")}
          </span>
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <Badge className={`bg-${kind === "cuisine" ? "orange" : "blue"}-500/20 text-white border border-${kind === "cuisine" ? "orange" : "blue"}-500/40`}>
              {summary.days_covered?.length || 0} jour{(summary.days_covered?.length || 0) > 1 ? "s" : ""}
            </Badge>
            <Badge className="bg-rose-500/20 text-rose-200 border border-rose-500/30">
              {summary.alert_rows || 0} alertes
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Date range + refresh */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[140px]">
            <Label className="text-[10px] uppercase text-slate-400">Du</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="bg-slate-800 border-slate-700 text-white h-8 text-xs" data-testid={`synthese-${kind}-start`} />
          </div>
          <div className="flex-1 min-w-[140px]">
            <Label className="text-[10px] uppercase text-slate-400">Au</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="bg-slate-800 border-slate-700 text-white h-8 text-xs" data-testid={`synthese-${kind}-end`} />
          </div>
          <Button size="sm" onClick={fetchData} disabled={loading} className={`${kind === "cuisine" ? "bg-orange-600 hover:bg-orange-700" : "bg-blue-600 hover:bg-blue-700"} h-8`} data-testid={`synthese-${kind}-refresh`}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
            Actualiser
          </Button>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <KpiCell label={kind === "cuisine" ? "Déclaré cuisinier" : "Déclaré coach"} value={`${fmt(summary.declared_total_revenue)} F`} sub={`${fmt(summary.declared_total_quantity)} unités`} testid="kpi-declared" />
          <KpiCell label={kind === "cuisine" ? "Facturé système" : "Facturé caisse"} value={`${fmt(summary.system_total_revenue)} F`} sub={`${fmt(summary.system_total_quantity)} unités`} testid="kpi-system" />
          <KpiCell
            label="Écart global"
            value={`${globalDiff >= 0 ? "+" : ""}${fmt(globalDiff)} F`}
            sub={`${globalDiffPct.toFixed(1)}%`}
            tone={Math.abs(globalDiffPct) < 5 ? "ok" : Math.abs(globalDiffPct) < 15 ? "warning" : "alert"}
            testid="kpi-diff"
          />
          <KpiCell label="Lignes" value={`${summary.total_rows || 0}`} sub={`${summary.alert_rows || 0} alertes · ${summary.warning_rows || 0} avert.`} testid="kpi-rows" />
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {[
            { key: "all", label: `Toutes (${summary.total_rows || 0})` },
            { key: "alert", label: `Alertes (${summary.alert_rows || 0})` },
            { key: "warning", label: `Écarts légers (${summary.warning_rows || 0})` },
            { key: "ok", label: `OK (${summary.ok_rows || 0})` },
          ].map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filterSev === f.key ? "default" : "outline"}
              onClick={() => setFilterSev(f.key)}
              className={filterSev === f.key
                ? "bg-slate-700 text-white h-7"
                : "border-slate-600 text-slate-300 h-7"}
              data-testid={`synthese-${kind}-filter-${f.key}`}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <p className="text-center text-slate-500 py-6 text-sm">Chargement…</p>
        ) : filteredRows.length === 0 ? (
          <div className="text-center py-8 bg-slate-800/30 rounded-lg">
            <ScrollText className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <p className="text-slate-500 text-sm">Aucune donnée pour ce filtre / cette période.</p>
            {summary.days_covered?.length === 0 && (
              <p className="text-slate-600 text-[11px] mt-1">
                Pour démarrer : {kind === "cuisine" ? "scanner un bon de cuisine ou valider un recoupement" : "saisir un compteur de jeux côté coach"}.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto bg-slate-900/40 rounded-lg border border-slate-700/40">
            <table className="w-full text-xs">
              <thead className="bg-slate-800/60">
                <tr className="text-slate-400">
                  <th className="text-left px-2 py-2">État</th>
                  <th className="text-left px-2 py-2">{kind === "cuisine" ? "Plat / Article" : "Jeu / Article"}</th>
                  <th className="text-right px-2 py-2">Déclaré (qté)</th>
                  <th className="text-right px-2 py-2">Système (qté)</th>
                  <th className="text-right px-2 py-2">Écart qté</th>
                  <th className="text-right px-2 py-2">Écart valeur</th>
                  <th className="text-right px-2 py-2">%</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r, idx) => {
                  const tone = SEVERITY_TONE[r.severity] || SEVERITY_TONE.ok;
                  const SevIcon = tone.icon;
                  const diffPositive = r.diff_value >= 0;
                  return (
                    <tr
                      key={r.name + idx}
                      className={`border-t border-slate-700/40 hover:bg-slate-800/40 ${
                        r.severity === "alert" ? "bg-rose-500/5" : r.severity === "warning" ? "bg-amber-500/5" : ""
                      }`}
                      data-testid={`synthese-row-${kind}-${idx}`}
                    >
                      <td className="px-2 py-1.5">
                        <span className={`inline-flex items-center gap-1 text-[10px] text-${tone.color}-300`}>
                          <SevIcon className="w-3 h-3" /> {tone.label}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-white">
                        {r.name}
                        {!r.in_declared && (
                          <span className="ml-1 text-[10px] text-amber-400">(non recoupé)</span>
                        )}
                        {!r.in_system && (
                          <span className="ml-1 text-[10px] text-rose-400">(non facturé)</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-200">{fmt(r.declared_quantity)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-200">{fmt(r.system_quantity)}</td>
                      <td className={`px-2 py-1.5 text-right font-bold ${r.diff_quantity === 0 ? "text-slate-400" : r.diff_quantity > 0 ? "text-emerald-300" : "text-rose-300"}`}>
                        {r.diff_quantity > 0 ? "+" : ""}{fmt(r.diff_quantity)}
                      </td>
                      <td className={`px-2 py-1.5 text-right font-bold flex items-center justify-end gap-1 ${r.diff_value === 0 ? "text-slate-400" : diffPositive ? "text-emerald-300" : "text-rose-300"}`}>
                        {r.diff_value > 0 ? <TrendingUp className="w-3 h-3" /> : r.diff_value < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                        {r.diff_value > 0 ? "+" : ""}{fmt(r.diff_value)} F
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-300">
                        {(r.pct * 100).toFixed(0)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {summary.days_covered?.length > 0 && (
                <tfoot className="bg-slate-800/60 text-slate-300">
                  <tr className="border-t-2 border-slate-700">
                    <td colSpan={2} className="px-2 py-2 font-bold">Total période</td>
                    <td className="px-2 py-2 text-right font-bold">{fmt(summary.declared_total_quantity)}</td>
                    <td className="px-2 py-2 text-right font-bold">{fmt(summary.system_total_quantity)}</td>
                    <td className="px-2 py-2"></td>
                    <td className={`px-2 py-2 text-right font-bold ${globalDiff === 0 ? "text-slate-400" : globalDiff > 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      {globalDiff > 0 ? "+" : ""}{fmt(globalDiff)} F
                    </td>
                    <td className="px-2 py-2 text-right font-bold text-slate-200">{globalDiffPct.toFixed(1)}%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const KpiCell = ({ label, value, sub, tone = "neutral", testid }) => {
  const cls = {
    neutral: "border-slate-700 bg-slate-800/40",
    ok: "border-emerald-500/40 bg-emerald-500/10",
    warning: "border-amber-500/40 bg-amber-500/10",
    alert: "border-rose-500/40 bg-rose-500/10",
  }[tone] || "border-slate-700 bg-slate-800/40";
  return (
    <div className={`rounded-lg border ${cls} p-2`} data-testid={testid}>
      <div className="text-[10px] uppercase text-slate-400 tracking-wide">{label}</div>
      <div className="text-base font-bold text-white">{value}</div>
      <div className="text-[10px] text-slate-400">{sub}</div>
    </div>
  );
};

export default RecoupementSyntheseTable;
