/**
 * ExpenseAnalysisBadges — Badges d'analyse pour une demande d'achat admin.
 * Affiche: doublons, correspondances stock, impact trésorerie.
 */
import React from 'react';
import { Badge } from "@/components/ui/badge";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger
} from "@/components/ui/tooltip";
import { Copy, Package, Wallet, AlertTriangle } from 'lucide-react';

const formatPrice = (p) => new Intl.NumberFormat('fr-FR').format(Math.round(p || 0));

const LEVEL_COLORS = {
  low: "bg-green-500/20 text-green-400",
  moderate: "bg-yellow-500/20 text-yellow-400",
  warning: "bg-orange-500/20 text-orange-400",
  critical: "bg-rose-500/30 text-rose-300",
};

const LEVEL_LABELS = {
  low: "Impact faible",
  moderate: "Impact modéré",
  warning: "Impact élevé",
  critical: "IMPACT CRITIQUE",
};

const ExpenseAnalysisBadges = ({ analysis }) => {
  if (!analysis) return null;
  const { duplicates = [], duplicates_count = 0, stock_matches = [], stock_matches_count = 0, treasury_impact = {} } = analysis;
  const level = treasury_impact.level || "low";

  return (
    <div className="flex flex-wrap gap-1 mt-1" data-testid="expense-analysis-badges">
      {/* Duplicates */}
      {duplicates_count > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className="bg-rose-500/20 text-rose-400 cursor-help">
                <Copy className="w-3 h-3 mr-1" />
                {duplicates_count} doublon{duplicates_count > 1 ? "s" : ""}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-md bg-slate-900 border-slate-700 text-white">
              <p className="font-bold mb-2">Demandes similaires détectées (7 derniers jours)</p>
              <ul className="space-y-1 text-xs">
                {duplicates.map(d => (
                  <li key={d.id} className="border-b border-slate-700 pb-1">
                    <div className="flex justify-between">
                      <span>{(d.description || "-").slice(0, 40)}</span>
                      <span className="font-bold">{formatPrice(d.amount)} F</span>
                    </div>
                    <div className="text-slate-400">
                      {d.supplier || "-"} • {(d.created_at || "").slice(0, 10)} • statut: {d.status}
                    </div>
                    <div className="text-rose-300">
                      Score: {d.score}% — {d.reasons.join(", ")}
                    </div>
                  </li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Stock matches */}
      {stock_matches_count > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className={`cursor-help ${stock_matches.some(s => s.warning) ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400"}`}>
                <Package className="w-3 h-3 mr-1" />
                {stock_matches_count} en stock
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-md bg-slate-900 border-slate-700 text-white">
              <p className="font-bold mb-2">Correspondances dans le stock</p>
              <ul className="space-y-1 text-xs">
                {stock_matches.map((s, i) => (
                  <li key={i} className="border-b border-slate-700 pb-1">
                    <div className="flex justify-between">
                      <span className="font-medium">{s.product_name}</span>
                      <span className={s.warning ? "text-amber-300 font-bold" : "text-slate-300"}>
                        {s.current_quantity} {s.unit}
                      </span>
                    </div>
                    {s.warning && (
                      <div className="text-amber-400 text-xs flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Stock déjà suffisant (min: {s.stock_min})
                      </div>
                    )}
                    <div className="text-slate-500 text-xs">
                      Dernière entrée: {s.last_entry_date ? s.last_entry_date.slice(0, 10) : "-"} ({s.last_entry_qty} {s.unit})
                    </div>
                  </li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Treasury impact */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className={`${LEVEL_COLORS[level]} cursor-help`}>
              <Wallet className="w-3 h-3 mr-1" />
              {treasury_impact.ratio_pct !== null ? `${treasury_impact.ratio_pct}% trésorerie` : "Trésorerie = 0"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-md bg-slate-900 border-slate-700 text-white">
            <p className="font-bold">{LEVEL_LABELS[level]}</p>
            <div className="text-xs text-slate-300 mt-1 space-y-1">
              <div>Montant demandé: <span className="font-bold">{formatPrice(treasury_impact.amount)} F</span></div>
              <div>Trésorerie dispo: <span className="font-bold">{formatPrice(treasury_impact.available_now)} F</span></div>
              <div>Resterait après achat: <span className={`font-bold ${treasury_impact.would_remain < 0 ? "text-rose-400" : "text-emerald-400"}`}>{formatPrice(treasury_impact.would_remain)} F</span></div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

export default ExpenseAnalysisBadges;
