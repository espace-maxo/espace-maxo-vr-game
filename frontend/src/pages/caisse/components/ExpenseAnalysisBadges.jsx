/**
 * ExpenseAnalysisBadges — Affichage riche de l'analyse d'une demande d'achat (Admin).
 * Mode compact (badges) + mode détaillé (accordéon avec toutes les alertes).
 */
import React, { useState } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Copy, Package, Wallet, AlertTriangle, ChevronDown, ChevronUp,
  CalendarClock, TrendingDown, ShoppingBag, Info
} from 'lucide-react';

const formatPrice = (p) => new Intl.NumberFormat('fr-FR').format(Math.round(p || 0));

const LEVEL_COLORS = {
  low: "bg-green-500/20 text-green-400 border-green-500/30",
  moderate: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  warning: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  critical: "bg-rose-500/30 text-rose-300 border-rose-500/40",
};
const LEVEL_LABELS = {
  low: "Impact faible",
  moderate: "Impact modéré",
  warning: "Impact élevé",
  critical: "IMPACT CRITIQUE",
};
const DUP_LEVEL_COLORS = {
  certain: "bg-rose-500/30 text-rose-300",
  probable: "bg-orange-500/20 text-orange-400",
  possible: "bg-yellow-500/20 text-yellow-400",
};

const ExpenseAnalysisBadges = ({ analysis }) => {
  const [expanded, setExpanded] = useState(false);
  if (!analysis) return null;
  const {
    duplicates = [], duplicates_count = 0,
    stock_matches = [], stock_matches_count = 0,
    redundant_items = [], redundant_items_count = 0, redundant_estimated_waste = 0,
    recent_purchases = [], recent_purchases_count = 0,
    treasury_impact = {},
  } = analysis;
  const level = treasury_impact.level || "low";

  const hasCritical = duplicates_count > 0 || redundant_items_count > 0 || level === "critical" || level === "warning";

  return (
    <div className="space-y-2" data-testid="expense-analysis-badges">
      {/* Compact badge row */}
      <div className="flex flex-wrap gap-1 items-center">
        <Badge className={duplicates_count > 0 ? "bg-rose-500/20 text-rose-400" : "bg-slate-700/50 text-slate-400"}>
          <Copy className="w-3 h-3 mr-1" />
          {duplicates_count} doublon{duplicates_count > 1 ? "s" : ""}
        </Badge>

        <Badge className={stock_matches_count > 0 ? (redundant_items_count > 0 ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400") : "bg-slate-700/50 text-slate-400"}>
          <Package className="w-3 h-3 mr-1" />
          {stock_matches_count} en stock {redundant_items_count > 0 && <span className="ml-1 text-rose-300">({redundant_items_count} en trop)</span>}
        </Badge>

        <Badge className={`${LEVEL_COLORS[level]} border`}>
          <Wallet className="w-3 h-3 mr-1" />
          {treasury_impact.ratio_pct !== null ? `${treasury_impact.ratio_pct}% trésorerie` : "Trésorerie = 0"}
        </Badge>

        {recent_purchases_count > 0 && (
          <Badge className="bg-blue-500/20 text-blue-400">
            <CalendarClock className="w-3 h-3 mr-1" />
            {recent_purchases_count} achat{recent_purchases_count > 1 ? "s" : ""} récent{recent_purchases_count > 1 ? "s" : ""}
          </Badge>
        )}

        {hasCritical && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-slate-300 hover:text-white"
            onClick={() => setExpanded(!expanded)}
            data-testid="expense-analysis-toggle"
          >
            {expanded ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
            {expanded ? "Réduire" : "Détails"}
          </Button>
        )}
      </div>

      {/* Quick summary chips */}
      {!expanded && hasCritical && (
        <div className="flex flex-wrap gap-2 text-xs">
          {redundant_estimated_waste > 0 && (
            <span className="text-amber-300 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              ~{formatPrice(redundant_estimated_waste)} F potentiellement évitables (stock suffisant)
            </span>
          )}
          {treasury_impact.would_remain < 0 && (
            <span className="text-rose-300 flex items-center gap-1">
              <TrendingDown className="w-3 h-3" />
              Déficit trésorerie: {formatPrice(treasury_impact.would_remain)} F
            </span>
          )}
        </div>
      )}

      {/* Detailed panel */}
      {expanded && (
        <div className="mt-2 space-y-3 bg-slate-900/50 rounded-lg p-3 border border-slate-700" data-testid="expense-analysis-detail">
          {/* Treasury */}
          <div className="bg-slate-800/60 rounded-lg p-2">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-4 h-4 text-amber-400" />
              <span className="text-slate-200 font-medium text-sm">{LEVEL_LABELS[level]}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-slate-400">Demandé</div>
                <div className="text-white font-bold">{formatPrice(treasury_impact.amount)} F</div>
              </div>
              <div>
                <div className="text-slate-400">Trésorerie dispo.</div>
                <div className="text-white font-bold">{formatPrice(treasury_impact.available_now)} F</div>
              </div>
              <div>
                <div className="text-slate-400">Resterait après</div>
                <div className={`font-bold ${treasury_impact.would_remain < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                  {formatPrice(treasury_impact.would_remain)} F
                </div>
              </div>
            </div>
          </div>

          {/* Duplicates */}
          {duplicates.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Copy className="w-4 h-4 text-rose-400" />
                <span className="text-slate-200 font-medium text-sm">Demandes similaires ({duplicates.length})</span>
              </div>
              <div className="space-y-1">
                {duplicates.map(d => (
                  <div key={d.id} className="bg-slate-800/40 rounded px-2 py-1.5 border-l-2 border-rose-500/60 text-xs">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1">
                        <div className="text-white">{(d.description || "-").slice(0, 60)}</div>
                        <div className="text-slate-400">
                          {d.supplier ? `${d.supplier} • ` : ""}{(d.created_at || "").slice(0, 10)} • {d.requested_by}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge className={`${DUP_LEVEL_COLORS[d.level] || "bg-slate-600"} text-xs`}>
                          {d.score}%
                        </Badge>
                        <div className="text-amber-400 font-bold mt-1">{formatPrice(d.amount)} F</div>
                      </div>
                    </div>
                    <div className="text-slate-500 mt-1">
                      Match: {d.reasons.join(" • ")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Redundant items */}
          {redundant_items.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-slate-200 font-medium text-sm">Stock déjà suffisant ({redundant_items.length})</span>
                <span className="text-amber-300 text-xs ml-auto">
                  ~{formatPrice(redundant_estimated_waste)} F évitables
                </span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700">
                    <th className="p-1">Produit</th>
                    <th className="p-1 text-right">Demandé</th>
                    <th className="p-1 text-right">En stock</th>
                    <th className="p-1 text-right">Min</th>
                  </tr>
                </thead>
                <tbody>
                  {redundant_items.map((r, i) => (
                    <tr key={i} className="border-b border-slate-700/30">
                      <td className="p-1 text-white">{r.product_name}</td>
                      <td className="p-1 text-right text-slate-300">{r.requested_qty} {r.unit}</td>
                      <td className="p-1 text-right text-amber-300 font-bold">{r.current_quantity} {r.unit}</td>
                      <td className="p-1 text-right text-slate-500">{r.stock_min}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Stock matches full list */}
          {stock_matches.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-emerald-400" />
                <span className="text-slate-200 font-medium text-sm">Correspondances stock ({stock_matches.length})</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-xs">
                {stock_matches.map((s, i) => (
                  <div key={i} className={`rounded px-2 py-1 border ${s.warning ? "bg-amber-900/20 border-amber-500/30" : "bg-emerald-900/10 border-emerald-500/20"}`}>
                    <div className="text-white font-medium truncate">{s.product_name}</div>
                    <div className={s.warning ? "text-amber-300" : "text-emerald-400"}>
                      {s.current_quantity} {s.unit} {s.warning && "⚠"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent purchases */}
          {recent_purchases.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ShoppingBag className="w-4 h-4 text-blue-400" />
                <span className="text-slate-200 font-medium text-sm">Achats récents de ces produits (14j)</span>
              </div>
              <div className="max-h-[120px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-700">
                      <th className="p-1">Date</th>
                      <th className="p-1">Produit</th>
                      <th className="p-1 text-right">Qté</th>
                      <th className="p-1 text-right">PU</th>
                      <th className="p-1">Fournisseur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent_purchases.map((h, i) => (
                      <tr key={i} className="border-b border-slate-700/30">
                        <td className="p-1 text-slate-400">{h.purchase_date}</td>
                        <td className="p-1 text-white">{h.product_name}</td>
                        <td className="p-1 text-right">{h.quantity} {h.unit}</td>
                        <td className="p-1 text-right text-amber-400">{formatPrice(h.unit_price)}</td>
                        <td className="p-1 text-slate-400">{h.supplier_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Summary note */}
          <div className="bg-slate-800/40 rounded p-2 text-xs text-slate-400 flex items-start gap-2">
            <Info className="w-3 h-3 mt-0.5 shrink-0" />
            <span>
              Cette analyse compare la demande avec l'historique des 14 derniers jours (demandes + achats stock).
              Un score ≥ 70% = doublon certain, 50-69% = probable, 30-49% = possible.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseAnalysisBadges;
