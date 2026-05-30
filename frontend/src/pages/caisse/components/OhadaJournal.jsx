/**
 * OhadaJournal — Brouillard comptable selon le plan OHADA.
 *
 * Sources mappées en écritures (D/C) :
 *   - Factures validées, Achats finalisés, Reversements, Avances Responsable Op. & Log,
 *     Fonds Propres, Ouvertures de journée
 *
 * Deux vues au choix :
 *   - "Brouillard" : tableau classique Date | Libellé | Compte D | Compte C | Débit | Crédit
 *   - "Colonnes"   : 2 colonnes côte à côte (Débits chrono / Crédits chrono)
 *
 * Filtres : période (date-range), compte, recherche libre.
 * Export : PDF (impression) + Excel (CSV téléchargeable).
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { format, subDays, startOfMonth } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  BookText, Download, Printer, RefreshCw, Search, Columns, TableProperties,
  Calendar as CalIcon, TrendingDown, TrendingUp, ArrowRight,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n || 0));
const today = () => format(new Date(), "yyyy-MM-dd");

const OhadaJournal = () => {
  const [start, setStart] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [end, setEnd] = useState(today());
  const [accountFilter, setAccountFilter] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("brouillard"); // brouillard | columns

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = { start_date: start, end_date: end };
      if (accountFilter) params.account = accountFilter;
      if (search) params.search = search;
      const r = await axios.get(`${API}/journal/ohada`, { params });
      setData(r.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur de chargement");
    } finally { setLoading(false); }
  }, [start, end, accountFilter, search]);

  useEffect(() => { refresh(); }, [refresh]);

  const applyPreset = (p) => {
    if (p === "today") { setStart(today()); setEnd(today()); }
    else if (p === "yesterday") {
      const y = format(subDays(new Date(), 1), "yyyy-MM-dd"); setStart(y); setEnd(y);
    } else if (p === "week") {
      setStart(format(subDays(new Date(), 6), "yyyy-MM-dd")); setEnd(today());
    } else if (p === "month") {
      setStart(format(startOfMonth(new Date()), "yyyy-MM-dd")); setEnd(today());
    }
  };

  const entries = data?.entries || [];
  const accounts = data?.accounts || [];

  // Pour la vue "Colonnes" : liste des débits et crédits triés
  const debits = useMemo(
    () => entries.map((e) => ({ ...e, side: "D", num: e.debit_num, label: e.debit_label })),
    [entries]
  );
  const credits = useMemo(
    () => entries.map((e) => ({ ...e, side: "C", num: e.credit_num, label: e.credit_label })),
    [entries]
  );

  // ───── Export CSV (Excel-compatible) ─────
  const exportCsv = () => {
    const headers = ["Date", "Libellé", "N° Débit", "Compte Débit", "N° Crédit", "Compte Crédit", "Montant", "Source", "Auteur"];
    const rows = entries.map((e) => [
      e.date?.slice(0, 16).replace("T", " ") || "",
      `"${(e.libelle || "").replace(/"/g, '""')}"`,
      e.debit_num, `"${e.debit_label}"`,
      e.credit_num, `"${e.credit_label}"`,
      e.amount, e.source, `"${e.author || ""}"`,
    ]);
    const csv = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `journal-ohada-${start}-${end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Fichier Excel (CSV) téléchargé");
  };

  // ───── Export PDF (impression) ─────
  const exportPdf = () => {
    const html = `
      <html><head><meta charset="UTF-8"><title>Journal OHADA ${start} → ${end}</title>
      <style>
        body{font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#111;margin:20px;}
        h1{font-size:18px;margin:0 0 4px 0;}
        h2{font-size:14px;color:#555;margin:0 0 12px 0;}
        table{width:100%;border-collapse:collapse;margin-top:8px;}
        th,td{border:1px solid #999;padding:5px 6px;text-align:left;font-size:10px;}
        th{background:#eee;}
        td.num{text-align:right;font-family:monospace;}
        tr.tot td{font-weight:bold;background:#fafafa;}
        .accounts{margin-top:14px;}
      </style></head><body>
      <h1>Journal comptable — Plan OHADA</h1>
      <h2>Période : ${start} → ${end}</h2>
      <table><thead><tr>
        <th>Date</th><th>Libellé</th><th>N° Débit</th><th>Compte Débit</th>
        <th>N° Crédit</th><th>Compte Crédit</th><th class="num">Débit</th><th class="num">Crédit</th>
      </tr></thead><tbody>
        ${entries.map((e) => `<tr>
          <td>${(e.date || "").slice(0, 16).replace("T", " ")}</td>
          <td>${(e.libelle || "").replace(/</g, "&lt;")}</td>
          <td>${e.debit_num}</td><td>${e.debit_label}</td>
          <td>${e.credit_num}</td><td>${e.credit_label}</td>
          <td class="num">${fmt(e.amount)} F</td><td class="num">${fmt(e.amount)} F</td>
        </tr>`).join("")}
        <tr class="tot"><td colspan="6">TOTAUX</td>
          <td class="num">${fmt(data?.total_debit)} F</td>
          <td class="num">${fmt(data?.total_credit)} F</td>
        </tr>
      </tbody></table>
      <div class="accounts"><h2>Soldes par compte</h2>
        <table><thead><tr><th>N°</th><th>Libellé</th><th class="num">Débit</th><th class="num">Crédit</th><th class="num">Solde</th></tr></thead><tbody>
          ${accounts.map((a) => `<tr>
            <td>${a.num}</td><td>${a.label}</td>
            <td class="num">${fmt(a.debit)} F</td>
            <td class="num">${fmt(a.credit)} F</td>
            <td class="num">${fmt(a.debit - a.credit)} F</td>
          </tr>`).join("")}
        </tbody></table>
      </div>
      </body></html>`;
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  return (
    <Card className="bg-gradient-to-br from-slate-900/80 to-slate-800/40 border-cyan-500/30" data-testid="ohada-journal">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-cyan-200">
          <BookText className="w-5 h-5" /> Journal comptable — Plan OHADA
          <Badge className="bg-cyan-500/20 text-cyan-200 text-[10px] ml-2">Brouillard chronologique</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* ─ Filtres ─ */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex gap-1">
            {[
              { k: "today", l: "Aujourd'hui" },
              { k: "yesterday", l: "Hier" },
              { k: "week", l: "7 jours" },
              { k: "month", l: "Mois en cours" },
            ].map((p) => (
              <button key={p.k} type="button" onClick={() => applyPreset(p.k)}
                className="text-[11px] px-2 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                data-testid={`ohada-preset-${p.k}`}>{p.l}</button>
            ))}
          </div>
          <div>
            <Label className="text-slate-400 text-[10px]">Du</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white h-8 w-[140px]" data-testid="ohada-start" />
          </div>
          <div>
            <Label className="text-slate-400 text-[10px]">Au</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white h-8 w-[140px]" data-testid="ohada-end" />
          </div>
          <div>
            <Label className="text-slate-400 text-[10px]">Compte</Label>
            <Input type="text" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}
              placeholder="Ex: 571" className="bg-slate-800 border-slate-700 text-white h-8 w-[100px]" data-testid="ohada-account" />
          </div>
          <div>
            <Label className="text-slate-400 text-[10px]">Recherche</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-slate-500" />
              <Input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Libellé / auteur" className="bg-slate-800 border-slate-700 text-white h-8 pl-7 w-[180px]" data-testid="ohada-search" />
            </div>
          </div>
          <Button onClick={refresh} disabled={loading} variant="outline" size="sm" className="border-slate-700 text-slate-200" data-testid="ohada-refresh">
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </Button>
          <Button onClick={exportCsv} disabled={!entries.length} variant="outline" size="sm" className="border-emerald-600 text-emerald-300 hover:bg-emerald-700/20" data-testid="ohada-export-csv">
            <Download className="w-3.5 h-3.5 mr-1" /> Excel
          </Button>
          <Button onClick={exportPdf} disabled={!entries.length} variant="outline" size="sm" className="border-rose-600 text-rose-300 hover:bg-rose-700/20" data-testid="ohada-export-pdf">
            <Printer className="w-3.5 h-3.5 mr-1" /> PDF
          </Button>
        </div>

        {/* ─ Switch vue ─ */}
        <div className="flex items-center gap-2 border-b border-slate-700 pb-2">
          <button type="button" onClick={() => setView("brouillard")}
            className={`text-[11px] px-3 py-1.5 rounded-t font-bold ${view === "brouillard" ? "bg-cyan-500 text-slate-900" : "bg-slate-800 text-slate-300"}`}
            data-testid="ohada-view-brouillard">
            <TableProperties className="w-3.5 h-3.5 inline mr-1" /> Brouillard (5 colonnes)
          </button>
          <button type="button" onClick={() => setView("columns")}
            className={`text-[11px] px-3 py-1.5 rounded-t font-bold ${view === "columns" ? "bg-cyan-500 text-slate-900" : "bg-slate-800 text-slate-300"}`}
            data-testid="ohada-view-columns">
            <Columns className="w-3.5 h-3.5 inline mr-1" /> Vue 2 colonnes (Débit | Crédit)
          </button>
        </div>

        {/* ─ KPI ─ */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="bg-emerald-900/20 border border-emerald-500/30 rounded p-2 text-center">
            <p className="text-[10px] text-emerald-300 uppercase">Total Débit</p>
            <p className="text-lg font-bold text-emerald-200" data-testid="ohada-total-debit">{fmt(data?.total_debit)} F</p>
          </div>
          <div className="bg-rose-900/20 border border-rose-500/30 rounded p-2 text-center">
            <p className="text-[10px] text-rose-300 uppercase">Total Crédit</p>
            <p className="text-lg font-bold text-rose-200">{fmt(data?.total_credit)} F</p>
          </div>
          <div className="bg-slate-800/40 border border-slate-700 rounded p-2 text-center">
            <p className="text-[10px] text-slate-400 uppercase">Écritures</p>
            <p className="text-lg font-bold text-white">{entries.length}</p>
          </div>
          <div className="bg-slate-800/40 border border-slate-700 rounded p-2 text-center">
            <p className="text-[10px] text-slate-400 uppercase">Équilibre</p>
            <p className="text-lg font-bold text-emerald-300">{data?.balanced ? "✓ OK" : "✗"}</p>
          </div>
        </div>

        {/* ─ Vue Brouillard ─ */}
        {view === "brouillard" && (
          <div className="overflow-x-auto rounded border border-slate-700 max-h-[600px] overflow-y-auto" data-testid="ohada-brouillard-table">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-800 sticky top-0">
                <tr className="text-slate-300">
                  <th className="px-2 py-2 text-left">Date</th>
                  <th className="px-2 py-2 text-left">Libellé</th>
                  <th className="px-2 py-2 text-left">N° Débit</th>
                  <th className="px-2 py-2 text-left">Compte Débit</th>
                  <th className="px-2 py-2 text-left">N° Crédit</th>
                  <th className="px-2 py-2 text-left">Compte Crédit</th>
                  <th className="px-2 py-2 text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr><td colSpan="7" className="text-center text-slate-500 py-6 italic">Aucune écriture sur cette période</td></tr>
                ) : entries.map((e, i) => (
                  <tr key={i} className="border-t border-slate-700 hover:bg-slate-800/40">
                    <td className="px-2 py-1.5 text-slate-300">{(e.date || "").slice(0, 16).replace("T", " ")}</td>
                    <td className="px-2 py-1.5 text-white truncate max-w-[260px]" title={e.libelle}>{e.libelle}</td>
                    <td className="px-2 py-1.5 text-emerald-300 font-mono">{e.debit_num}</td>
                    <td className="px-2 py-1.5 text-emerald-200">{e.debit_label}</td>
                    <td className="px-2 py-1.5 text-rose-300 font-mono">{e.credit_num}</td>
                    <td className="px-2 py-1.5 text-rose-200">{e.credit_label}</td>
                    <td className="px-2 py-1.5 text-right text-amber-300 font-bold font-mono">{fmt(e.amount)} F</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ─ Vue 2 colonnes ─ */}
        {view === "columns" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="ohada-columns-view">
            <div className="bg-emerald-900/10 border border-emerald-500/30 rounded p-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-emerald-300 font-bold text-sm flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" /> Débits ({debits.length})
                </p>
                <Badge className="bg-emerald-500/20 text-emerald-200 text-[10px]">{fmt(data?.total_debit)} F</Badge>
              </div>
              <div className="space-y-1 max-h-[600px] overflow-y-auto">
                {debits.length === 0 && <p className="text-slate-500 text-xs italic text-center py-4">Aucun débit</p>}
                {debits.map((e, i) => (
                  <div key={i} className="bg-slate-800/40 rounded p-1.5 text-[11px] border-l-2 border-emerald-500/50">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400 shrink-0">{(e.date || "").slice(5, 16).replace("T", " ")}</span>
                      <span className="font-mono text-emerald-300 shrink-0">{e.num}</span>
                    </div>
                    <p className="text-white truncate" title={e.libelle}>{e.libelle}</p>
                    <p className="text-right text-amber-300 font-bold font-mono">{fmt(e.amount)} F</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-rose-900/10 border border-rose-500/30 rounded p-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-rose-300 font-bold text-sm flex items-center gap-1">
                  <TrendingDown className="w-4 h-4" /> Crédits ({credits.length})
                </p>
                <Badge className="bg-rose-500/20 text-rose-200 text-[10px]">{fmt(data?.total_credit)} F</Badge>
              </div>
              <div className="space-y-1 max-h-[600px] overflow-y-auto">
                {credits.length === 0 && <p className="text-slate-500 text-xs italic text-center py-4">Aucun crédit</p>}
                {credits.map((e, i) => (
                  <div key={i} className="bg-slate-800/40 rounded p-1.5 text-[11px] border-l-2 border-rose-500/50">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400 shrink-0">{(e.date || "").slice(5, 16).replace("T", " ")}</span>
                      <span className="font-mono text-rose-300 shrink-0">{e.num}</span>
                    </div>
                    <p className="text-white truncate" title={e.libelle}>{e.libelle}</p>
                    <p className="text-right text-amber-300 font-bold font-mono">{fmt(e.amount)} F</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─ Soldes par compte ─ */}
        {accounts.length > 0 && (
          <div className="bg-slate-900/40 rounded border border-slate-700 p-2">
            <p className="text-slate-300 text-xs font-bold mb-2 flex items-center gap-1">
              <ArrowRight className="w-3 h-3" /> Soldes par compte ({accounts.length})
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {accounts.map((a) => {
                const solde = a.debit - a.credit;
                return (
                  <div key={a.num} className="bg-slate-800/40 rounded p-2 text-[11px]" data-testid={`ohada-account-${a.num}`}>
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-cyan-300 font-bold">{a.num}</span>
                      <span className="text-slate-200 truncate">{a.label}</span>
                    </div>
                    <div className="flex justify-between text-[10px] mt-0.5">
                      <span className="text-emerald-300">D {fmt(a.debit)} F</span>
                      <span className="text-rose-300">C {fmt(a.credit)} F</span>
                      <span className={solde >= 0 ? "text-emerald-200" : "text-rose-200"}>
                        Solde {fmt(solde)} F
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OhadaJournal;
