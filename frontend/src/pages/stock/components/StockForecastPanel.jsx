/**
 * StockForecastPanel — Panneau "Prévisions épuisement" des produits Stock.
 *
 * Affiche, pour chaque produit, le nombre de jours restants avant épuisement
 * basé sur la consommation moyenne quotidienne calculée sur 30 jours.
 *
 * 3 statuts urgences :
 *   - 🔴 Critical (<3j)  — agir immédiatement
 *   - 🟡 Warning  (<7j)  — à commander cette semaine
 *   - 🟢 OK       (≥7j)  — confortable
 *   - ⚪ No data  — aucun historique ni saisie manuelle
 *
 * Filtre par urgence + recherche par nom + filtre département.
 * Source : GET /api/stock/forecast?window_days=30
 *
 * Permet aussi à l'utilisateur de saisir une "conso journalière manuelle"
 * (fallback quand pas de mouvements) directement dans le panneau.
 */
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, RefreshCw, AlertTriangle, Search, Save, Loader2, CheckCircle, Clock, Target, ExternalLink } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmt = (n) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n || 0);

const URGENCY_META = {
  critical: { label: "Critique", color: "rose", icon: AlertTriangle, ring: "ring-rose-500/40", bg: "bg-rose-500/10", text: "text-rose-200", border: "border-rose-500/40" },
  warning: { label: "Bientôt", color: "amber", icon: Clock, ring: "ring-amber-500/40", bg: "bg-amber-500/10", text: "text-amber-200", border: "border-amber-500/40" },
  ok: { label: "OK", color: "emerald", icon: CheckCircle, ring: "ring-emerald-500/40", bg: "bg-emerald-500/10", text: "text-emerald-200", border: "border-emerald-500/40" },
  no_data: { label: "Sans donnée", color: "slate", icon: TrendingDown, ring: "ring-slate-500/40", bg: "bg-slate-700/30", text: "text-slate-300", border: "border-slate-600/40" },
};

export default function StockForecastPanel({ onNavigateToProducts } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterUrgency, setFilterUrgency] = useState("all"); // all|critical|warning|ok|no_data
  const [savingId, setSavingId] = useState(null);
  const [manualEdits, setManualEdits] = useState({});
  const [untrackingId, setUntrackingId] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/stock/forecast?window_days=30`);
      setData(r.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur de chargement des prévisions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  // Retire un produit du suivi prévisionnel (geste rapide depuis ce panneau)
  const untrack = async (productId, productName) => {
    setUntrackingId(productId);
    try {
      await axios.patch(`${API}/stock/products/${productId}/track`, { is_tracked: false });
      toast.success(`« ${productName} » retiré du suivi`);
      await refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur");
    } finally {
      setUntrackingId(null);
    }
  };

  // Sauvegarde le champ manuel daily_consumption_manual sur le produit
  const saveManual = async (item, value) => {
    setSavingId(item.product_id);
    try {
      const num = parseFloat(value);
      if (!Number.isFinite(num) || num < 0) {
        toast.error("Valeur invalide");
        return;
      }
      await axios.put(`${API}/stock/products/${item.product_id}`, {
        daily_consumption_manual: num,
      });
      toast.success(`Conso journalière enregistrée pour ${item.name}`);
      setManualEdits((s) => { const c = { ...s }; delete c[item.product_id]; return c; });
      await refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur d'enregistrement");
    } finally {
      setSavingId(null);
    }
  };

  // Filtrage en mémoire
  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    const q = search.trim().toLowerCase();
    return data.items.filter((i) => {
      if (filterUrgency !== "all" && i.urgency !== filterUrgency) return false;
      if (q && !i.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, search, filterUrgency]);

  const summary = data?.summary || { critical: 0, warning: 0, ok: 0, no_data: 0, total_products: 0, window_days: 30 };

  return (
    <Card className="bg-slate-900/70 border-slate-800" data-testid="stock-forecast-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-amber-200 flex items-center gap-2">
              <TrendingDown className="w-5 h-5" />
              Prévisions d'épuisement des stocks
            </CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              Conso moyenne calculée sur les {summary.window_days} derniers jours · Fallback manuel si pas d'historique
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={refresh}
            disabled={loading}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
            data-testid="forecast-refresh"
          >
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Actualiser
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Empty state — aucun produit suivi */}
        {!loading && summary.total_products === 0 ? (
          <div className="text-center py-10 px-4" data-testid="forecast-empty-state">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30 flex items-center justify-center mb-4">
              <Target className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-white text-lg font-semibold mb-2">Aucun produit suivi pour l'instant</h3>
            <p className="text-slate-400 text-sm max-w-md mx-auto mb-5">
              Les Prévisions d'épuisement affichent uniquement les produits que vous décidez de suivre.
              Activez le suivi depuis l'onglet <span className="text-emerald-300 font-semibold">Produits</span> ou
              <span className="text-emerald-300 font-semibold"> Mouvements</span> en cliquant sur l'icône
              <Target className="inline w-3.5 h-3.5 text-emerald-400 mx-1" /> à côté d'un produit.
            </p>
            {onNavigateToProducts && (
              <Button
                onClick={onNavigateToProducts}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                data-testid="forecast-empty-cta"
              >
                <ExternalLink className="w-4 h-4 mr-1.5" /> Aller à la liste des Produits
              </Button>
            )}
          </div>
        ) : (
          <>
        {/* Cartes résumé urgences */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="forecast-summary">
          {["critical", "warning", "ok", "no_data"].map((k) => {
            const meta = URGENCY_META[k];
            const Icon = meta.icon;
            const count = summary[k] || 0;
            const isActive = filterUrgency === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setFilterUrgency(isActive ? "all" : k)}
                className={`text-left rounded-lg p-3 border transition-all ${meta.border} ${meta.bg} hover:brightness-125 ${isActive ? `ring-2 ${meta.ring}` : ""}`}
                data-testid={`forecast-filter-${k}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Icon className={`w-4 h-4 ${meta.text}`} />
                  <span className={`text-2xl font-bold tabular-nums ${meta.text}`}>{count}</span>
                </div>
                <p className={`text-[11px] uppercase tracking-wider font-bold ${meta.text}`}>{meta.label}</p>
                <p className="text-[9px] text-slate-400 mt-0.5">
                  {k === "critical" && "Reste < 3j"}
                  {k === "warning" && "Reste 3-7j"}
                  {k === "ok" && "Reste ≥ 7j"}
                  {k === "no_data" && "Pas d'historique"}
                </p>
              </button>
            );
          })}
        </div>

        {/* Recherche + filtre actif */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un produit…"
              className="bg-slate-800 border-slate-700 text-white pl-8 h-9"
              data-testid="forecast-search"
            />
          </div>
          {filterUrgency !== "all" && (
            <Badge
              className="bg-amber-500/15 border border-amber-500/40 text-amber-200 cursor-pointer"
              onClick={() => setFilterUrgency("all")}
            >
              Filtre : {URGENCY_META[filterUrgency].label} · ✕
            </Badge>
          )}
          <span className="text-[11px] text-slate-500 ml-auto">
            {filteredItems.length} / {summary.total_products} affiché(s)
          </span>
        </div>

        {/* Liste des produits */}
        {loading && !data ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement des prévisions…
          </div>
        ) : filteredItems.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-6">Aucun produit ne correspond aux filtres.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="forecast-table">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-800 text-xs uppercase tracking-wider">
                  <th className="p-3 font-medium">Produit</th>
                  <th className="p-3 font-medium text-right">Stock actuel</th>
                  <th className="p-3 font-medium text-right hidden md:table-cell">Conso/jour</th>
                  <th className="p-3 font-medium text-right">Jours restants</th>
                  <th className="p-3 font-medium hidden lg:table-cell">Conso manuelle (fallback)</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((i) => {
                  const meta = URGENCY_META[i.urgency];
                  const inputVal = manualEdits[i.product_id] ?? (i.daily_consumption_manual ?? "");
                  return (
                    <tr
                      key={i.product_id}
                      className="border-b border-slate-800/60 hover:bg-slate-800/40"
                      data-testid={`forecast-row-${i.product_id}`}
                    >
                      <td className="p-3 text-white">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => untrack(i.product_id, i.name)}
                            disabled={untrackingId === i.product_id}
                            title="Retirer du suivi prévisionnel"
                            className="shrink-0 p-1 rounded text-emerald-400 hover:text-rose-400 hover:bg-rose-500/10 transition disabled:opacity-50"
                            data-testid={`forecast-untrack-${i.product_id}`}
                          >
                            {untrackingId === i.product_id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Target className="w-3.5 h-3.5 fill-current" />}
                          </button>
                          <span className={`w-2 h-2 rounded-full ${meta.bg.replace("/10", "/60")}`} />
                          <span className="truncate max-w-[200px]">{i.name}</span>
                          {i.department && (
                            <span className="text-[9px] text-slate-500 uppercase">[{i.department}]</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right text-slate-300 tabular-nums whitespace-nowrap">
                        {fmt(i.current_quantity)} <span className="text-slate-500 text-xs">{i.unit}</span>
                      </td>
                      <td className="p-3 text-right text-slate-300 tabular-nums whitespace-nowrap hidden md:table-cell">
                        {i.daily_avg > 0 ? (
                          <>
                            {fmt(i.daily_avg)}
                            <span className="text-[10px] text-slate-500 ml-1">
                              {i.source === "manual" ? "(saisi)" : i.source === "movements" ? `(${i.movement_count} mvt)` : ""}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        {i.days_remaining === null ? (
                          <span className="text-slate-500 text-xs">—</span>
                        ) : (
                          <Badge className={`${meta.bg} ${meta.text} ${meta.border} border tabular-nums font-bold`}>
                            ≈ {i.days_remaining} j
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 hidden lg:table-cell">
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={inputVal}
                            placeholder="—"
                            onChange={(e) => setManualEdits((s) => ({ ...s, [i.product_id]: e.target.value }))}
                            className="bg-slate-800 border-slate-700 text-white h-7 text-xs w-20"
                            data-testid={`forecast-manual-${i.product_id}`}
                          />
                          {manualEdits[i.product_id] !== undefined && (
                            <Button
                              size="sm"
                              onClick={() => saveManual(i, manualEdits[i.product_id])}
                              disabled={savingId === i.product_id}
                              className="bg-amber-500 hover:bg-amber-600 text-slate-900 h-7 px-2"
                              data-testid={`forecast-manual-save-${i.product_id}`}
                            >
                              {savingId === i.product_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
