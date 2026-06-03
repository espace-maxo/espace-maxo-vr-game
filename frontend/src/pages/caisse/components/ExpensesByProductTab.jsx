/**
 * ExpensesByProductTab — Vue "Achats regroupés par produit".
 *
 * Grille de bulles colorées triées par montant total décroissant.
 * Chaque bulle = 1 produit unique avec :
 *   - Nom + nombre d'achats
 *   - Quantité totale cumulée
 *   - Montant total dépensé
 *   - Prix moyen unitaire
 * Au clic : ouvre un panneau de détail avec historique chronologique.
 *
 * Source : GET /api/expenses/by-product?include_archived=true
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Package, Search, RefreshCw, Loader2, X, Calendar, TrendingUp,
  ArrowDownUp, Archive,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmt = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(Number(n || 0)));
const fmtQty = (n) => {
  const x = Number(n || 0);
  return Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/\.?0+$/, "");
};

// Color palette par tranche de montant (du plus cher au moins cher)
const colorFor = (amount, max) => {
  const ratio = max > 0 ? amount / max : 0;
  if (ratio >= 0.7) return { bg: "bg-rose-900/40", border: "border-rose-500/50", text: "text-rose-100", accent: "text-rose-300" };
  if (ratio >= 0.4) return { bg: "bg-amber-900/40", border: "border-amber-500/50", text: "text-amber-100", accent: "text-amber-300" };
  if (ratio >= 0.2) return { bg: "bg-cyan-900/40", border: "border-cyan-500/50", text: "text-cyan-100", accent: "text-cyan-300" };
  return { bg: "bg-slate-800/60", border: "border-slate-700", text: "text-slate-200", accent: "text-slate-400" };
};

const formatDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso?.slice(0, 10) || "—"; }
};

const ExpensesByProductTab = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("amount_desc"); // amount_desc | amount_asc | name_asc | qty_desc | count_desc | recent
  const [selectedProduct, setSelectedProduct] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/expenses/by-product`, {
        params: { include_archived: true },
      });
      setData(r.data);
    } catch {
      toast.error("Erreur chargement vue par produit");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const list = [...(data.products || [])];
    const q = search.trim().toLowerCase();
    const filtered = q ? list.filter((p) => (p.display_name || "").toLowerCase().includes(q)) : list;
    const cmp = (a, b) => {
      switch (sortBy) {
        case "amount_asc":  return a.total_amount - b.total_amount;
        case "name_asc":    return (a.display_name || "").localeCompare(b.display_name || "", "fr", { sensitivity: "base" });
        case "qty_desc":    return b.total_quantity - a.total_quantity;
        case "count_desc":  return b.count - a.count;
        case "recent":      return (b.last_purchase_date || "").localeCompare(a.last_purchase_date || "");
        case "amount_desc":
        default:            return b.total_amount - a.total_amount;
      }
    };
    return filtered.sort(cmp);
  }, [data, search, sortBy]);

  const maxAmount = useMemo(() => filtered.reduce((m, p) => Math.max(m, p.total_amount || 0), 0), [filtered]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Chargement…
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="expenses-by-product-view">
      {/* Bandeau résumé */}
      <Card className="bg-gradient-to-br from-blue-900/30 to-cyan-900/20 border-cyan-500/40">
        <CardContent className="py-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
            <div className="bg-slate-900/50 rounded p-2">
              <p className="text-[10px] uppercase text-slate-400">Produits distincts</p>
              <p className="text-lg font-bold text-cyan-300 font-mono" data-testid="bp-products-count">{data?.total_products || 0}</p>
            </div>
            <div className="bg-slate-900/50 rounded p-2">
              <p className="text-[10px] uppercase text-slate-400">Total achats</p>
              <p className="text-lg font-bold text-amber-300 font-mono">{data?.total_purchases || 0}</p>
            </div>
            <div className="bg-slate-900/50 rounded p-2">
              <p className="text-[10px] uppercase text-slate-400">Qté cumulée</p>
              <p className="text-lg font-bold text-purple-300 font-mono">{fmtQty(data?.total_quantity || 0)}</p>
            </div>
            <div className="bg-emerald-900/30 rounded p-2 border border-emerald-500/30">
              <p className="text-[10px] uppercase text-emerald-300">Montant total</p>
              <p className="text-lg font-bold text-emerald-300 font-mono">{fmt(data?.total_amount || 0)} F</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Barre recherche + tri */}
      <Card className="bg-slate-900/60 border-slate-700">
        <CardContent className="py-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
            <Input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un produit…"
              className="bg-slate-800 border-slate-700 h-9 text-sm pl-7"
              data-testid="bp-search"
            />
          </div>
          <span className="text-slate-400 text-xs flex items-center gap-1"><ArrowDownUp className="w-3 h-3" />Tri :</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-[11px] rounded px-2 py-1.5 h-9"
            data-testid="bp-sort-select"
          >
            <option value="amount_desc">Montant ↓ (défaut)</option>
            <option value="amount_asc">Montant ↑</option>
            <option value="qty_desc">Quantité ↓</option>
            <option value="count_desc">Nb achats ↓</option>
            <option value="name_asc">A → Z</option>
            <option value="recent">Plus récent</option>
          </select>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="h-9 text-slate-300" data-testid="bp-refresh">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </CardContent>
      </Card>

      {/* Grille de bulles */}
      {filtered.length === 0 && (
        <p className="text-center text-slate-500 italic py-8 text-sm">
          {search ? "Aucun produit ne correspond à votre recherche." : "Aucun achat enregistré."}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3" data-testid="bp-bubbles-grid">
        {filtered.map((p) => {
          const c = colorFor(p.total_amount, maxAmount);
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setSelectedProduct(p)}
              className={`text-left rounded-xl border p-3 ${c.bg} ${c.border} hover:scale-[1.02] hover:shadow-lg transition-all cursor-pointer`}
              data-testid={`bp-bubble-${p.key}`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <h4 className={`font-semibold text-sm capitalize truncate flex-1 ${c.text}`} title={p.display_name}>
                  {p.display_name}
                </h4>
                <Badge className={`${c.accent} bg-slate-900/40 text-[10px] shrink-0`}>
                  ×{p.count}
                </Badge>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className={`text-[10px] uppercase ${c.accent}`}>Total dépensé</p>
                  <p className={`text-lg font-bold font-mono ${c.text}`}>{fmt(p.total_amount)} <span className="text-[10px] opacity-70">F</span></p>
                </div>
                <div className="text-right">
                  <p className={`text-[10px] uppercase ${c.accent}`}>Quantité</p>
                  <p className={`text-sm font-mono ${c.text}`}>{fmtQty(p.total_quantity)}</p>
                </div>
              </div>
              <div className="mt-1.5 pt-1.5 border-t border-slate-700/60 flex items-center justify-between gap-2 text-[10px]">
                <span className={c.accent}>Moy. {fmt(p.avg_unit_price)} F</span>
                <span className={c.accent}>{formatDate(p.last_purchase_date)}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Dialog historique */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setSelectedProduct(null)} data-testid="bp-detail-dialog">
          <Card className="bg-slate-900 border-cyan-500/40 w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="pb-2 border-b border-slate-700">
              <CardTitle className="flex items-center gap-2 flex-wrap">
                <Package className="w-5 h-5 text-cyan-400" />
                <span className="capitalize text-cyan-100">{selectedProduct.display_name}</span>
                <Badge className="bg-cyan-500/20 text-cyan-300">{selectedProduct.count} achat{selectedProduct.count > 1 ? "s" : ""}</Badge>
                <Button variant="ghost" size="sm" onClick={() => setSelectedProduct(null)} className="ml-auto h-7 w-7 p-0 text-slate-400 hover:text-white" data-testid="bp-detail-close">
                  <X className="w-4 h-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-y-auto py-3 space-y-3">
              {/* Mini KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                <div className="bg-slate-800/60 rounded p-2">
                  <p className="text-[10px] uppercase text-slate-400">Total dépensé</p>
                  <p className="text-base font-bold text-emerald-300 font-mono">{fmt(selectedProduct.total_amount)} F</p>
                </div>
                <div className="bg-slate-800/60 rounded p-2">
                  <p className="text-[10px] uppercase text-slate-400">Quantité cumulée</p>
                  <p className="text-base font-bold text-purple-300 font-mono">{fmtQty(selectedProduct.total_quantity)}</p>
                </div>
                <div className="bg-slate-800/60 rounded p-2">
                  <p className="text-[10px] uppercase text-slate-400">Prix moyen</p>
                  <p className="text-base font-bold text-amber-300 font-mono">{fmt(selectedProduct.avg_unit_price)} F</p>
                </div>
                <div className="bg-slate-800/60 rounded p-2">
                  <p className="text-[10px] uppercase text-slate-400">Dernier prix</p>
                  <p className="text-base font-bold text-cyan-300 font-mono">{fmt(selectedProduct.last_unit_price)} F</p>
                </div>
              </div>

              {/* Historique */}
              <div>
                <p className="text-[11px] font-semibold text-cyan-200 mb-1.5 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Historique des achats ({selectedProduct.history.length})
                </p>
                <div className="bg-slate-800/40 rounded border border-slate-700 max-h-[40vh] overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-slate-800 text-slate-400">
                      <tr>
                        <th className="text-left py-1.5 px-2">Date</th>
                        <th className="text-right py-1.5 px-2">Qté</th>
                        <th className="text-right py-1.5 px-2">PU</th>
                        <th className="text-right py-1.5 px-2">Total</th>
                        <th className="text-left py-1.5 px-2">Fournisseur</th>
                        <th className="text-left py-1.5 px-2">Cat.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProduct.history.map((h, i) => (
                        <tr key={i} className="border-t border-slate-700/50 hover:bg-slate-800/50">
                          <td className="py-1.5 px-2 text-slate-300">
                            <div className="flex items-center gap-1">
                              {h.archived && <Archive className="w-3 h-3 text-slate-500" title="Archivé" />}
                              <Calendar className="w-3 h-3 text-slate-500" />
                              <span className="font-mono">{formatDate(h.date)}</span>
                            </div>
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-purple-300">{fmtQty(h.quantity)}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-amber-300">{fmt(h.unit_price)} F</td>
                          <td className="py-1.5 px-2 text-right font-mono text-emerald-300 font-bold">{fmt(h.amount)} F</td>
                          <td className="py-1.5 px-2 text-slate-300 truncate max-w-[120px]" title={h.supplier}>{h.supplier || "—"}</td>
                          <td className="py-1.5 px-2 text-[10px] text-slate-400">{h.category || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ExpensesByProductTab;
