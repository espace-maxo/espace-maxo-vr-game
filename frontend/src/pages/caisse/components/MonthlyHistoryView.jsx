/**
 * MonthlyHistoryView — Sous-vue "Historique mensuel & rapport mois par mois"
 *
 * Liste verticale de cartes pliables (un mois par carte, le plus récent en haut).
 * Pour chaque mois affiche : CA total, ventilation par catégorie/département,
 * achats/dépenses (avec mode de paiement), locations.
 * Bouton "PDF" qui imprime un rapport mensuel.
 *
 * Source : GET /api/reports/monthly-history?start_year=2026&start_month=1
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar, TrendingUp, ChevronDown, ChevronRight, FileText,
  Wine, Utensils, Gamepad2, Receipt, Wallet, CreditCard, Smartphone,
  RefreshCw, Loader2, Printer, Banknote,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmt = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(Number(n || 0)));

const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const PAYMENT_META = {
  cash:   { label: "Espèces",   Icon: Banknote,   cls: "bg-emerald-500/15 text-emerald-300" },
  mobile: { label: "Mobile",    Icon: Smartphone, cls: "bg-blue-500/15 text-blue-300" },
  cheque: { label: "Chèque",    Icon: CreditCard, cls: "bg-amber-500/15 text-amber-300" },
  wallet: { label: "Bon client", Icon: Wallet,    cls: "bg-fuchsia-500/15 text-fuchsia-300" },
};

const GROUP_META = {
  bar:         { label: "Bar (boissons)", Icon: Wine,     cls: "text-cyan-300" },
  menu_combos: { label: "Plats & menus",  Icon: Utensils, cls: "text-orange-300" },
  jeux:        { label: "Jeux",           Icon: Gamepad2, cls: "text-purple-300" },
  autres:      { label: "Autres",         Icon: Receipt,  cls: "text-slate-300" },
};

/** Génère et ouvre un PDF pour un mois donné. */
function openMonthlyPdf(m) {
  const w = window.open("", "_blank", "width=900,height=1200");
  if (!w) {
    toast.error("Bloqueur de popups actif — autorisez les fenêtres pour imprimer");
    return;
  }
  const monthLabel = `${MONTH_NAMES[m.month - 1]} ${m.year}`;
  const totalIncome = (m.total_revenue || 0) + (m.locations_advances || 0);
  const marge = totalIncome - (m.expenses_total || 0);

  const groupRows = Object.entries(GROUP_META).map(([k, meta]) => `
    <tr><td>${meta.label}</td><td style="text-align:right;font-family:monospace">${fmt(m.by_revenue_group?.[k] || 0)} F</td></tr>
  `).join("");

  const paymentRows = Object.entries(PAYMENT_META).map(([k, meta]) => `
    <tr><td>${meta.label}</td><td style="text-align:right;font-family:monospace">${fmt(m.by_payment?.[k] || 0)} F</td></tr>
  `).join("");

  const expCatRows = Object.entries(m.by_expense_category || {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<tr><td>${k}</td><td style="text-align:right;font-family:monospace">${fmt(v)} F</td></tr>`)
    .join("");

  const expPayRows = Object.entries(m.by_expense_payment_mode || {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => {
      const lbl = k === "fonds_propres" ? "Fonds propres" : k === "caisse_restau" ? "Caisse Restau" : "Autre";
      return `<tr><td>${lbl}</td><td style="text-align:right;font-family:monospace">${fmt(v)} F</td></tr>`;
    }).join("");

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<title>Rapport mensuel — ${monthLabel}</title>
<style>
  body{font-family:Arial,sans-serif;margin:24px;color:#222}
  h1{margin:0 0 4px 0;font-size:22px;color:#1a3a52}
  h2{font-size:14px;color:#1a3a52;margin:14px 0 6px 0;border-bottom:1px solid #ddd;padding-bottom:3px}
  .meta{font-size:11px;color:#666;margin-bottom:10px}
  .kpis{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
  .kpi{background:#f4f6fa;border:1px solid #d3d8e0;border-radius:6px;padding:8px 12px;font-size:11px;min-width:140px}
  .kpi b{display:block;font-size:16px;color:#1a3a52;margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:11px;margin-top:4px}
  th,td{border:1px solid #ccd0d8;padding:5px 8px;text-align:left}
  th{background:#1a3a52;color:#fff;font-weight:bold}
  .footer{margin-top:18px;font-size:9px;color:#777;border-top:1px solid #ddd;padding-top:6px}
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  @media print { body{margin:10px} }
</style></head>
<body>
  <h1>Rapport mensuel — ${monthLabel}</h1>
  <div class="meta">Espace Maxo · Généré le ${new Date().toLocaleString("fr-FR")}</div>
  <div class="kpis">
    <div class="kpi"><span>CA Caisse</span><b>${fmt(m.total_revenue)} F</b></div>
    <div class="kpi" style="background:#f5ecfc"><span>Total Locations</span><b style="color:#6b21a8">${fmt(m.locations_total)} F</b></div>
    <div class="kpi" style="background:#e2f5e9"><span>Avances Locations</span><b style="color:#197d3a">${fmt(m.locations_advances)} F</b></div>
    <div class="kpi" style="background:#fff3e0"><span>Solde locations à encaisser</span><b style="color:#b07a00">${fmt(m.locations_balance_due)} F</b></div>
    <div class="kpi" style="background:#e2f5e9"><span>TOTAL Recettes (CA + avances)</span><b style="color:#197d3a">${fmt(totalIncome)} F</b></div>
    <div class="kpi" style="background:#fdecec"><span>Dépenses & Achats</span><b style="color:#a01010">${fmt(m.expenses_total)} F</b></div>
    <div class="kpi" style="background:${marge >= 0 ? "#e7f5ec" : "#fde2e2"}"><span>Marge brute</span><b style="color:${marge >= 0 ? "#197d3a" : "#a01010"}">${fmt(marge)} F</b></div>
    <div class="kpi"><span>Factures validées</span><b>${m.invoice_count}</b></div>
  </div>
  <div class="two-col">
    <div>
      <h2>CA Caisse par catégorie</h2>
      <table>${groupRows}</table>
    </div>
    <div>
      <h2>CA Caisse par mode de paiement</h2>
      <table>${paymentRows}</table>
    </div>
  </div>
  <h2>Locations & Réservations (${m.locations_count}) — Total ${fmt(m.locations_total)} F · Avances ${fmt(m.locations_advances)} F · Solde ${fmt(m.locations_balance_due)} F</h2>
  ${(m.locations_details || []).length === 0
    ? '<p style="font-size:11px;color:#666">Aucune location ce mois.</p>'
    : `<table><tr><th>Date</th><th>Client</th><th style="text-align:right">Total</th><th style="text-align:right">Avance</th><th style="text-align:right">Solde</th><th>Statut</th></tr>${
        (m.locations_details || []).map(l => `<tr><td>${l.reservation_date || ""}</td><td>${l.client_name || "—"}</td><td style="text-align:right;font-family:monospace">${fmt(l.rental_amount)} F</td><td style="text-align:right;font-family:monospace;color:#197d3a">${fmt(l.deposit_paid)} F</td><td style="text-align:right;font-family:monospace;color:${(l.balance_remaining || 0) > 0 ? "#b07a00" : "#999"}">${fmt(l.balance_remaining || 0)} F</td><td>${l.status || ""}</td></tr>`).join("")
      }</table>`}
  <div class="two-col">
    <div>
      <h2>Dépenses par catégorie</h2>
      ${expCatRows ? `<table><tr><th>Catégorie</th><th style="text-align:right">Montant</th></tr>${expCatRows}</table>` : '<p style="font-size:11px;color:#666">Aucune dépense ce mois.</p>'}
    </div>
    <div>
      <h2>Dépenses par mode de paiement</h2>
      ${expPayRows ? `<table><tr><th>Mode</th><th style="text-align:right">Montant</th></tr>${expPayRows}</table>` : '<p style="font-size:11px;color:#666">Aucune dépense ce mois.</p>'}
    </div>
  </div>
  <div class="footer">
    Rapport généré par Caisse Pro — Espace Maxo. Toutes les valeurs sont en F CFA.<br>
    <b>Total Locations</b> = montant total facturé sur le mois. <b>Avances</b> = effectivement encaissé. <b>Solde</b> = reste dû par les clients.<br>
    Les factures transférées (assigned_week) sont prises en compte sur leur mois cible.
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print();},300)}</script>
</body></html>`;
  w.document.write(html);
  w.document.close();
}

const MonthCard = ({ m, open, onToggle }) => {
  const totalIncome = (m.total_revenue || 0) + (m.locations_advances || 0);
  const marge = totalIncome - (m.expenses_total || 0);
  const monthLabel = `${MONTH_NAMES[m.month - 1]} ${m.year}`;
  return (
    <Card className={`border ${open ? "bg-slate-800/70 border-amber-500/40" : "bg-slate-800/40 border-slate-700"}`} data-testid={`monthly-card-${m.month_label}`}>
      <CardHeader className="pb-2 cursor-pointer" onClick={onToggle}>
        <CardTitle className="flex items-center gap-2 flex-wrap text-base">
          {open ? <ChevronDown className="w-5 h-5 text-amber-300" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
          <Calendar className="w-4 h-4 text-amber-300" />
          <span className="text-amber-100">{monthLabel}</span>
          <Badge className="bg-emerald-500/20 text-emerald-300 ml-1">{fmt(totalIncome)} F encaissé</Badge>
          {(m.locations_balance_due || 0) > 0 && (
            <Badge className="bg-amber-500/20 text-amber-200" title="Solde locations restant à encaisser">À encaisser {fmt(m.locations_balance_due)} F</Badge>
          )}
          {(m.expenses_total || 0) > 0 && (
            <Badge className="bg-rose-500/20 text-rose-300">− {fmt(m.expenses_total)} F dépenses</Badge>
          )}
          <Badge className={`${marge >= 0 ? "bg-amber-500/20 text-amber-200" : "bg-rose-500/30 text-rose-200"}`}>
            Marge {fmt(marge)} F
          </Badge>
          <Badge className="bg-slate-700 text-slate-300">{m.invoice_count} fact.</Badge>
          <Button
            variant="ghost" size="sm"
            onClick={(e) => { e.stopPropagation(); openMonthlyPdf(m); }}
            className="ml-auto h-7 text-[11px] text-cyan-300 hover:bg-cyan-500/10 border border-cyan-500/30"
            data-testid={`monthly-pdf-${m.month_label}`}
            title="Imprimer / télécharger PDF"
          >
            <Printer className="w-3.5 h-3.5 mr-1" /> PDF
          </Button>
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3 text-xs">
          {/* KPIs principaux */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-slate-900/50 rounded p-2">
              <p className="text-[10px] uppercase text-slate-400">CA Caisse</p>
              <p className="text-base font-bold text-amber-300 font-mono">{fmt(m.total_revenue)} F</p>
            </div>
            <div className="bg-emerald-900/30 rounded p-2 border border-emerald-500/30">
              <p className="text-[10px] uppercase text-emerald-300">Total recettes encaissées</p>
              <p className="text-base font-bold text-emerald-300 font-mono">{fmt(totalIncome)} F</p>
              <p className="text-[9px] text-slate-500">CA Caisse + Avances</p>
            </div>
            <div className="bg-purple-900/20 rounded p-2 border border-purple-500/30">
              <p className="text-[10px] uppercase text-purple-300">Total des locations</p>
              <p className="text-base font-bold text-purple-300 font-mono">{fmt(m.locations_total)} F</p>
              <p className="text-[9px] text-slate-500">{m.locations_count} réservation{m.locations_count > 1 ? "s" : ""}</p>
            </div>
            <div className="bg-rose-900/20 rounded p-2 border border-rose-500/30">
              <p className="text-[10px] uppercase text-rose-300">Dépenses</p>
              <p className="text-base font-bold text-rose-300 font-mono">{fmt(m.expenses_total)} F</p>
              <p className="text-[9px] text-slate-500">{m.expenses_count} opération{m.expenses_count > 1 ? "s" : ""}</p>
            </div>
          </div>

          {/* Détail Locations : Avances reçues vs Solde à payer */}
          {(m.locations_total || 0) > 0 && (
            <div className="bg-slate-900/40 rounded border border-purple-500/30 p-2">
              <p className="text-[11px] font-semibold text-purple-200 mb-1.5">Détail Locations & Réservations</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-purple-900/30 rounded p-1.5">
                  <p className="text-[10px] text-purple-300/80">Total locations</p>
                  <p className="text-sm font-mono font-bold text-purple-200">{fmt(m.locations_total)} F</p>
                </div>
                <div className="bg-emerald-900/30 rounded p-1.5">
                  <p className="text-[10px] text-emerald-300/80">Avances reçues</p>
                  <p className="text-sm font-mono font-bold text-emerald-200">{fmt(m.locations_advances)} F</p>
                </div>
                <div className="bg-amber-900/30 rounded p-1.5">
                  <p className="text-[10px] text-amber-300/80">Solde à payer</p>
                  <p className="text-sm font-mono font-bold text-amber-200">{fmt(m.locations_balance_due)} F</p>
                </div>
              </div>
            </div>
          )}

          {/* CA par catégorie */}
          <div>
            <p className="text-[11px] font-semibold text-amber-200 mb-1.5 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> CA Caisse par catégorie
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(GROUP_META).map(([k, meta]) => {
                const Ic = meta.Icon;
                const val = m.by_revenue_group?.[k] || 0;
                return (
                  <div key={k} className="bg-slate-900/40 rounded p-1.5 border border-slate-700">
                    <p className={`text-[10px] flex items-center gap-1 ${meta.cls}`}>
                      <Ic className="w-3 h-3" /> {meta.label}
                    </p>
                    <p className="text-sm font-mono text-white">{fmt(val)} F</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* CA par mode de paiement */}
          <div>
            <p className="text-[11px] font-semibold text-amber-200 mb-1.5">Mode de paiement (CA)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(PAYMENT_META).map(([k, meta]) => {
                const Ic = meta.Icon;
                const val = m.by_payment?.[k] || 0;
                return (
                  <div key={k} className={`rounded p-1.5 ${meta.cls}`}>
                    <p className="text-[10px] flex items-center gap-1">
                      <Ic className="w-3 h-3" /> {meta.label}
                    </p>
                    <p className="text-sm font-mono">{fmt(val)} F</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Locations détails */}
          {(m.locations_details || []).length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-amber-200 mb-1.5">
                Locations & Réservations ({m.locations_count})
              </p>
              <div className="bg-slate-900/40 rounded border border-slate-700 max-h-44 overflow-y-auto">
                <table className="w-full text-[10px]">
                  <thead className="sticky top-0 bg-slate-800">
                    <tr className="text-slate-400">
                      <th className="text-left py-1 px-2">Date</th>
                      <th className="text-left py-1 px-2">Client</th>
                      <th className="text-right py-1 px-2">Total</th>
                      <th className="text-right py-1 px-2">Avance</th>
                      <th className="text-right py-1 px-2">Solde</th>
                      <th className="text-left py-1 px-2">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(m.locations_details || []).map((l) => (
                      <tr key={l.id} className="border-t border-slate-800">
                        <td className="py-1 px-2 text-slate-300 font-mono">{l.reservation_date}</td>
                        <td className="py-1 px-2 text-slate-200 truncate max-w-[120px]">{l.client_name || "—"}</td>
                        <td className="py-1 px-2 text-right font-mono text-purple-300">{fmt(l.rental_amount)} F</td>
                        <td className="py-1 px-2 text-right font-mono text-emerald-300">{fmt(l.deposit_paid)} F</td>
                        <td className={`py-1 px-2 text-right font-mono ${(l.balance_remaining || 0) > 0 ? "text-amber-300" : "text-slate-500"}`}>
                          {fmt(l.balance_remaining || 0)} F
                        </td>
                        <td className="py-1 px-2 text-[9px] text-slate-400">{l.status}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-purple-500/50 bg-slate-800/80">
                      <td className="py-1.5 px-2 text-[10px] uppercase text-purple-200 font-bold" colSpan={2}>TOTAL ({m.locations_count})</td>
                      <td className="py-1.5 px-2 text-right font-mono font-bold text-purple-200">{fmt(m.locations_total)} F</td>
                      <td className="py-1.5 px-2 text-right font-mono font-bold text-emerald-300">{fmt(m.locations_advances)} F</td>
                      <td className="py-1.5 px-2 text-right font-mono font-bold text-amber-300">{fmt(m.locations_balance_due)} F</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Dépenses */}
          {(m.expenses_total || 0) > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <p className="text-[11px] font-semibold text-rose-200 mb-1">Dépenses par catégorie</p>
                <div className="bg-slate-900/40 rounded border border-rose-500/20 max-h-32 overflow-y-auto">
                  {Object.entries(m.by_expense_category || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                    <div key={k} className="flex justify-between py-0.5 px-2 border-b border-slate-800 last:border-b-0 text-[11px]">
                      <span className="text-slate-300 truncate mr-2">{k}</span>
                      <span className="text-rose-300 font-mono shrink-0">{fmt(v)} F</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-rose-200 mb-1">Dépenses par mode</p>
                <div className="bg-slate-900/40 rounded border border-rose-500/20">
                  {Object.entries(m.by_expense_payment_mode || {}).filter(([, v]) => v > 0).map(([k, v]) => {
                    const lbl = k === "fonds_propres" ? "Fonds propres" : k === "caisse_restau" ? "Caisse Restau" : "Autre";
                    return (
                      <div key={k} className="flex justify-between py-0.5 px-2 border-b border-slate-800 last:border-b-0 text-[11px]">
                        <span className="text-slate-300">{lbl}</span>
                        <span className="text-rose-300 font-mono">{fmt(v)} F</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

const MonthlyHistoryView = () => {
  const [months, setMonths] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openIds, setOpenIds] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/reports/monthly-history`, {
        params: { start_year: 2026, start_month: 1 },
        timeout: 60000,
      });
      const list = r.data.months || [];
      setMonths(list);
      // Ouvrir automatiquement le mois en cours
      if (list.length > 0) {
        setOpenIds(new Set([list[0].month_label]));
      }
    } catch (e) {
      toast.error("Erreur chargement historique mensuel");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (id) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const totals = useMemo(() => {
    return months.reduce((acc, m) => {
      acc.revenue += m.total_revenue || 0;
      acc.locations_total += m.locations_total || 0;
      acc.locations_advances += m.locations_advances || 0;
      acc.locations_balance_due += m.locations_balance_due || 0;
      acc.expenses += m.expenses_total || 0;
      acc.invoices += m.invoice_count || 0;
      return acc;
    }, { revenue: 0, locations_total: 0, locations_advances: 0, locations_balance_due: 0, expenses: 0, invoices: 0 });
  }, [months]);

  return (
    <div className="space-y-3" data-testid="monthly-history-view">
      <Card className="bg-gradient-to-br from-amber-900/30 to-orange-900/20 border-amber-500/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base flex-wrap">
            <Calendar className="w-5 h-5 text-amber-300" />
            <span className="text-amber-100">Historique mensuel — depuis Janvier 2026</span>
            <Button
              variant="ghost" size="sm" onClick={load} disabled={loading}
              className="ml-auto h-7 text-[11px] text-slate-300"
              data-testid="monthly-refresh"
            >
              {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              Actualiser
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
          <div className="bg-slate-900/50 rounded p-2">
            <p className="text-[10px] uppercase text-slate-400">CA Caisse cumulé</p>
            <p className="text-base font-bold text-amber-300 font-mono">{fmt(totals.revenue)} F</p>
          </div>
          <div className="bg-purple-900/30 rounded p-2 border border-purple-500/30">
            <p className="text-[10px] uppercase text-purple-300">Total locations</p>
            <p className="text-base font-bold text-purple-300 font-mono">{fmt(totals.locations_total)} F</p>
          </div>
          <div className="bg-slate-900/50 rounded p-2 border border-emerald-500/30">
            <p className="text-[10px] uppercase text-emerald-300">Avances locations</p>
            <p className="text-base font-bold text-emerald-300 font-mono">{fmt(totals.locations_advances)} F</p>
          </div>
          <div className="bg-amber-900/20 rounded p-2 border border-amber-500/30">
            <p className="text-[10px] uppercase text-amber-300">Solde à encaisser</p>
            <p className="text-base font-bold text-amber-300 font-mono">{fmt(totals.locations_balance_due)} F</p>
          </div>
          <div className="bg-rose-900/20 rounded p-2 border border-rose-500/30">
            <p className="text-[10px] uppercase text-rose-300">Dépenses cumulées</p>
            <p className="text-base font-bold text-rose-300 font-mono">{fmt(totals.expenses)} F</p>
          </div>
        </CardContent>
      </Card>

      {loading && months.length === 0 && (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Chargement…
        </div>
      )}

      {!loading && months.length === 0 && (
        <p className="text-center text-slate-500 italic py-8">
          Aucun mois disponible depuis Janvier 2026.
        </p>
      )}

      <div className="space-y-2">
        {months.map((m) => (
          <MonthCard
            key={m.month_label}
            m={m}
            open={openIds.has(m.month_label)}
            onToggle={() => toggle(m.month_label)}
          />
        ))}
      </div>
    </div>
  );
};

export default MonthlyHistoryView;
