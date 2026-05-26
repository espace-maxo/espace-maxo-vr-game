/**
 * AuditorPanel — Auditeur intelligent qui scanne les ventes sur une période
 * et produit un rapport d'incohérences avec actions de remédiation.
 *
 * Visible uniquement pour Admin (le parent filtre via isAdmin).
 * Lance l'audit via POST /api/audit/run (manuel, à la demande).
 */
import React, { useState } from "react";
import axios from "axios";
import { format, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, AlertTriangle, AlertCircle, Info, CheckCircle2,
  Play, RefreshCw, ChevronDown, ChevronRight, TrendingUp, FileSearch,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n || 0));
const today = () => format(new Date(), "yyyy-MM-dd");
const yesterday = () => format(subDays(new Date(), 1), "yyyy-MM-dd");

const SEV_META = {
  critical: { label: "Critique", color: "bg-rose-500/20 text-rose-200 border-rose-500/40", Icon: AlertCircle, dot: "🔴" },
  warning:  { label: "Suspect",  color: "bg-amber-500/20 text-amber-200 border-amber-500/40", Icon: AlertTriangle, dot: "🟠" },
  info:     { label: "Info",     color: "bg-blue-500/20 text-blue-200 border-blue-500/40", Icon: Info, dot: "🔵" },
};

const Finding = ({ f }) => {
  const [open, setOpen] = useState(true);
  const meta = SEV_META[f.severity] || SEV_META.info;
  const Ic = meta.Icon;
  return (
    <Card className={`bg-slate-900/40 border ${meta.color.split(" ").find((c) => c.startsWith("border-")) || "border-slate-700"}`} data-testid={`audit-finding-${f.code}`}>
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <CardTitle className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <Ic className={`w-5 h-5 mt-0.5 shrink-0 ${meta.color.split(" ").find((c) => c.startsWith("text-"))}`} />
            <div className="min-w-0">
              <p className={`text-sm font-bold ${meta.color.split(" ").find((c) => c.startsWith("text-"))}`}>
                {meta.dot} {f.title}
              </p>
              <p className="text-slate-400 text-xs mt-0.5">{f.detail}</p>
              <Badge className="bg-slate-800/60 text-slate-400 text-[9px] mt-1 font-mono">{(f.code || '').toLowerCase().replace(/_/g, ' ')}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {f.amount > 0 && <Badge className="bg-slate-800 text-slate-200 text-[10px]">{fmt(f.amount)} F</Badge>}
            {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          </div>
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="space-y-2 pt-1">
          {f.actions && f.actions.length > 0 && (
            <div className="bg-slate-800/40 rounded p-2 border border-slate-700/40">
              <p className="text-[10px] uppercase text-slate-500 mb-1 tracking-wider">Actions recommandées</p>
              <ul className="space-y-0.5">
                {f.actions.map((a, i) => (
                  <li key={i} className="text-xs text-slate-300 flex items-start gap-1">
                    <span className="text-cyan-400">→</span><span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {f.items && f.items.length > 0 && (
            <details className="bg-slate-800/30 rounded p-2 border border-slate-700/30">
              <summary className="text-[10px] uppercase text-slate-500 cursor-pointer tracking-wider">Détails ({f.items.length} élément{f.items.length > 1 ? "s" : ""})</summary>
              <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                {f.items.map((it, i) => (
                  <div key={i} className="text-[11px] text-slate-300 px-2 py-1 bg-slate-900/40 rounded flex items-center justify-between gap-2">
                    <span className="truncate">{it.label}</span>
                    {it.by && <span className="text-slate-500 shrink-0">par {it.by}</span>}
                  </div>
                ))}
              </div>
            </details>
          )}
        </CardContent>
      )}
    </Card>
  );
};

const AuditorPanel = () => {
  const [periodType, setPeriodType] = useState("yesterday"); // today | yesterday | day | range
  const [startDate, setStartDate] = useState(yesterday());
  const [endDate, setEndDate] = useState(yesterday());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const applyPreset = (p) => {
    setPeriodType(p);
    if (p === "today") { setStartDate(today()); setEndDate(today()); }
    else if (p === "yesterday") { setStartDate(yesterday()); setEndDate(yesterday()); }
    else if (p === "week") {
      setStartDate(format(subDays(new Date(), 6), "yyyy-MM-dd"));
      setEndDate(today());
    }
  };

  const runAudit = async () => {
    setLoading(true);
    setReport(null);
    try {
      const r = await axios.post(`${API}/audit/run`, {
        start_date: startDate,
        end_date: endDate,
      });
      setReport(r.data);
      const n = r.data.counts;
      if (n.total === 0) toast.success("Audit terminé — aucune incohérence détectée");
      else toast.info(`Audit terminé — ${n.critical} critique(s) · ${n.warning} suspect(s)`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur d'audit");
    } finally { setLoading(false); }
  };

  const sortedFindings = report?.findings
    ? [...report.findings].sort((a, b) => {
        const order = { critical: 0, warning: 1, info: 2 };
        return order[a.severity] - order[b.severity];
      })
    : [];

  const scoreColor = report
    ? report.score >= 90 ? "text-emerald-300"
    : report.score >= 70 ? "text-amber-300"
    : "text-rose-300"
    : "text-slate-400";

  return (
    <Card className="bg-gradient-to-br from-cyan-950/40 via-slate-900/40 to-purple-950/30 border-cyan-500/30 mb-4" data-testid="auditor-panel">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-cyan-200">
            <FileSearch className="w-5 h-5" />
            <span className="text-base">Auditeur intelligent</span>
          </div>
          <Badge className="bg-cyan-500/20 text-cyan-300 text-[10px]">
            10 contrôles automatiques
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Sélecteur de période */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex gap-1">
            {[
              { k: "today", l: "Aujourd'hui" },
              { k: "yesterday", l: "Hier" },
              { k: "week", l: "7 jours" },
              { k: "day", l: "Date" },
              { k: "range", l: "Plage" },
            ].map((p) => (
              <button
                key={p.k}
                type="button"
                onClick={() => applyPreset(p.k)}
                data-testid={`audit-preset-${p.k}`}
                className={`text-[11px] px-2 py-1.5 rounded ${
                  periodType === p.k
                    ? "bg-cyan-500 text-slate-900 font-bold"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {p.l}
              </button>
            ))}
          </div>
          <div>
            <Label className="text-slate-400 text-[10px]">Du</Label>
            <Input
              type="date" value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPeriodType(e.target.value === endDate ? "day" : "range"); }}
              className="bg-slate-800 border-slate-700 text-white h-8 w-[140px]"
              data-testid="audit-start-date"
            />
          </div>
          {periodType === "range" || startDate !== endDate ? (
            <div>
              <Label className="text-slate-400 text-[10px]">Au</Label>
              <Input
                type="date" value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white h-8 w-[140px]"
                data-testid="audit-end-date"
              />
            </div>
          ) : null}
          <Button
            onClick={runAudit}
            disabled={loading}
            className="bg-cyan-600 hover:bg-cyan-700 ml-auto"
            data-testid="audit-run-btn"
          >
            {loading
              ? <><RefreshCw className="w-4 h-4 mr-1 animate-spin" /> Analyse…</>
              : <><Play className="w-4 h-4 mr-1" /> Lancer l'audit</>}
          </Button>
        </div>

        {/* Rapport */}
        {report && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <div className="bg-slate-800/40 rounded p-2 text-center border border-slate-700">
                <p className="text-[10px] uppercase text-slate-500">Score</p>
                <p className={`text-2xl font-bold ${scoreColor}`} data-testid="audit-score">{report.score}<span className="text-sm">/100</span></p>
              </div>
              <div className="bg-rose-900/30 rounded p-2 text-center border border-rose-500/30">
                <p className="text-[10px] uppercase text-rose-300">Critiques</p>
                <p className="text-2xl font-bold text-rose-200">{report.counts.critical}</p>
              </div>
              <div className="bg-amber-900/30 rounded p-2 text-center border border-amber-500/30">
                <p className="text-[10px] uppercase text-amber-300">Suspects</p>
                <p className="text-2xl font-bold text-amber-200">{report.counts.warning}</p>
              </div>
              <div className="bg-emerald-900/30 rounded p-2 text-center border border-emerald-500/30">
                <p className="text-[10px] uppercase text-emerald-300">Factures OK</p>
                <p className="text-2xl font-bold text-emerald-200">{report.summary.invoices_validated}</p>
              </div>
              <div className="bg-blue-900/30 rounded p-2 text-center border border-blue-500/30">
                <p className="text-[10px] uppercase text-blue-300">CA validé</p>
                <p className="text-base font-bold text-blue-200">{fmt(report.summary.ca_validated)} F</p>
              </div>
            </div>

            {sortedFindings.length === 0 ? (
              <div className="bg-emerald-900/20 border border-emerald-500/30 rounded p-4 text-center" data-testid="audit-clean">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-300" />
                <p className="text-emerald-200 font-bold">Aucune incohérence détectée</p>
                <p className="text-emerald-300/70 text-xs">Période du {report.start_date} au {report.end_date} — tout est cohérent.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedFindings.map((f, i) => <Finding key={i} f={f} />)}
              </div>
            )}

            <p className="text-[10px] text-slate-500 text-center italic">
              Généré le {report.generated_at ? format(new Date(report.generated_at), "dd/MM/yyyy 'à' HH:mm", { locale: fr }) : ""}
            </p>
          </div>
        )}

        {!report && !loading && (
          <p className="text-slate-500 text-xs italic text-center py-3">
            Cliquez sur <strong>Lancer l'audit</strong> pour analyser les incohérences sur la période sélectionnée.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default AuditorPanel;
