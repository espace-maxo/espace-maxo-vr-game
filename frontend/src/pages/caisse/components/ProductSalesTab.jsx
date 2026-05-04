/**
 * ProductSalesTab - Statistiques de vente par produit
 * Affiche la quantité vendue et le chiffre d'affaires par produit sur une période.
 * Filtres : période (preset + custom), département, recherche, tri.
 * Export CSV des résultats filtrés.
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Package, TrendingUp, BarChart3, FileText, Search, RefreshCw, ArrowUpDown,
} from 'lucide-react';

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND}/api`;

const formatPrice = (p) => new Intl.NumberFormat('fr-FR').format(Math.round(p || 0));
const formatQty = (q) => {
  if (q == null) return "0";
  const n = Number(q);
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2).replace(/\.?0+$/, "");
};

const DEPT_LABELS = {
  salle_jardin: "Plats",
  accompagnements: "Accomp.",
  jeux: "Jeux",
  bar: "Bar",
  location: "Location",
  autres: "Autres",
  jardin: "Jardin",
};

const DEPT_COLORS = {
  salle_jardin: "bg-green-500/20 text-green-300 border-green-500/40",
  accompagnements: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  jeux: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  bar: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  location: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  autres: "bg-slate-500/20 text-slate-300 border-slate-500/40",
  jardin: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
};

const isoDay = (d) => d.toISOString().slice(0, 10);

const ProductSalesTab = () => {
  const today = new Date();
  const last30 = new Date();
  last30.setDate(today.getDate() - 29);

  const [startDate, setStartDate] = useState(isoDay(last30));
  const [endDate, setEndDate] = useState(isoDay(today));
  const [department, setDepartment] = useState("all");
  const [validatedOnly, setValidatedOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("quantity_sold"); // quantity_sold | revenue | invoice_count | avg_price | name
  const [sortDir, setSortDir] = useState("desc");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (department && department !== "all") params.department = department;
      params.validated_only = validatedOnly;
      const r = await axios.get(`${API}/invoices/stats/by-product`, { params });
      setData(r.data);
    } catch (e) {
      setError(e?.response?.data?.detail || "Erreur lors du chargement des statistiques");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, department, validatedOnly]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const setPreset = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days + 1);
    setStartDate(isoDay(start));
    setEndDate(isoDay(end));
  };

  const setCurrentMonth = () => {
    const now = new Date();
    setStartDate(isoDay(new Date(now.getFullYear(), now.getMonth(), 1)));
    setEndDate(isoDay(now));
  };

  const setPreviousMonth = () => {
    const now = new Date();
    const firstPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastPrev = new Date(now.getFullYear(), now.getMonth(), 0);
    setStartDate(isoDay(firstPrev));
    setEndDate(isoDay(lastPrev));
  };

  const filteredSortedProducts = useMemo(() => {
    const rows = (data?.products || []).filter((p) => {
      const q = (search || "").trim().toLowerCase();
      if (!q) return true;
      return (p.name || "").toLowerCase().includes(q) || (p.department || "").toLowerCase().includes(q);
    });
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (sortKey === "name") {
        return (a.name || "").localeCompare(b.name || "") * dir;
      }
      return ((a[sortKey] || 0) - (b[sortKey] || 0)) * dir;
    });
    return rows;
  }, [data, search, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const exportCSV = () => {
    const headers = ["Produit", "Département", "Unité", "Quantité", "CA (F)", "Factures", "Prix moyen (F)", "Prix min (F)", "Prix max (F)", "Part CA (%)", "Première vente", "Dernière vente"];
    const rows = filteredSortedProducts.map((p) => [
      p.name,
      DEPT_LABELS[p.department] || p.department,
      p.unit || "",
      formatQty(p.quantity_sold),
      Math.round(p.revenue),
      p.invoice_count,
      Math.round(p.avg_price),
      p.min_price != null ? Math.round(p.min_price) : "",
      p.max_price != null ? Math.round(p.max_price) : "",
      p.revenue_share_pct,
      (p.first_sold_at || "").slice(0, 10),
      (p.last_sold_at || "").slice(0, 10),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventes_par_produit_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const maxRevenue = useMemo(() => {
    return Math.max(...(filteredSortedProducts.map((p) => p.revenue || 0)), 1);
  }, [filteredSortedProducts]);

  const SortBtn = ({ k, children }) => (
    <button
      type="button"
      onClick={() => toggleSort(k)}
      className={`inline-flex items-center gap-1 hover:text-white transition ${sortKey === k ? "text-white" : "text-slate-400"}`}
      data-testid={`product-sales-sort-${k}`}
    >
      {children}
      <ArrowUpDown className={`w-3 h-3 ${sortKey === k ? "text-amber-400" : "text-slate-600"}`} />
    </button>
  );

  return (
    <div className="space-y-4" data-testid="product-sales-tab">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Package className="w-6 h-6 text-amber-400" />
          Statistiques de ventes par produit
        </h2>
        <p className="text-slate-400 text-sm mt-0.5">
          Quantité vendue et chiffre d'affaires par produit sur la période choisie.
        </p>
      </div>

      {/* Filters */}
      <Card className="bg-slate-900/70 border-slate-800">
        <CardContent className="p-3 sm:p-4 space-y-3">
          {/* Presets */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setPreset(7)} className="border-slate-700 text-slate-200 hover:bg-slate-800" data-testid="preset-7j">7 jours</Button>
            <Button size="sm" variant="outline" onClick={() => setPreset(30)} className="border-slate-700 text-slate-200 hover:bg-slate-800" data-testid="preset-30j">30 jours</Button>
            <Button size="sm" variant="outline" onClick={setCurrentMonth} className="border-slate-700 text-slate-200 hover:bg-slate-800" data-testid="preset-month">Mois en cours</Button>
            <Button size="sm" variant="outline" onClick={setPreviousMonth} className="border-slate-700 text-slate-200 hover:bg-slate-800" data-testid="preset-prev-month">Mois précédent</Button>
            <Button size="sm" variant="outline" onClick={() => setPreset(90)} className="border-slate-700 text-slate-200 hover:bg-slate-800" data-testid="preset-90j">90 jours</Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2">
            <div>
              <Label className="text-slate-400 text-xs uppercase">Du</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-slate-800 border-slate-700 text-white" data-testid="product-sales-start" />
            </div>
            <div>
              <Label className="text-slate-400 text-xs uppercase">Au</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-slate-800 border-slate-700 text-white" data-testid="product-sales-end" />
            </div>
            <div>
              <Label className="text-slate-400 text-xs uppercase">Département</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white" data-testid="product-sales-dept">
                  <SelectValue placeholder="Tous" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 text-white border-slate-700">
                  <SelectItem value="all">Tous les départements</SelectItem>
                  {Object.entries(DEPT_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-400 text-xs uppercase">Statut</Label>
              <Select value={validatedOnly ? "validated" : "all"} onValueChange={(v) => setValidatedOnly(v === "validated")}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white" data-testid="product-sales-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 text-white border-slate-700">
                  <SelectItem value="validated">Factures validées</SelectItem>
                  <SelectItem value="all">Toutes (incl. en attente)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={fetchStats} disabled={loading} className="bg-amber-600 hover:bg-amber-700 text-white w-full" data-testid="product-sales-refresh">
                <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
                Actualiser
              </Button>
            </div>
          </div>

          <div className="flex gap-2 items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un produit…"
                className="bg-slate-800 border-slate-700 text-white pl-9"
                data-testid="product-sales-search"
              />
            </div>
            <Button variant="outline" onClick={exportCSV} className="border-slate-700 text-slate-200" data-testid="product-sales-export-csv">
              <FileText className="w-4 h-4 mr-1" /> Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-gradient-to-br from-amber-500/20 to-amber-600/10 border-amber-500/30">
            <CardContent className="p-4">
              <p className="text-slate-400 text-xs">Chiffre d'affaires</p>
              <p className="text-2xl font-bold text-amber-400">{formatPrice(data.total_revenue)} F</p>
              <p className="text-slate-500 text-xs mt-1">sur {data.invoices_scanned} factures</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border-emerald-500/30">
            <CardContent className="p-4">
              <p className="text-slate-400 text-xs">Quantité totale</p>
              <p className="text-2xl font-bold text-emerald-400">{formatQty(data.total_quantity)}</p>
              <p className="text-slate-500 text-xs mt-1">unités vendues</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/30">
            <CardContent className="p-4">
              <p className="text-slate-400 text-xs">Produits distincts</p>
              <p className="text-2xl font-bold text-blue-400">{data.distinct_products}</p>
              <p className="text-slate-500 text-xs mt-1">références vendues</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/30">
            <CardContent className="p-4">
              <p className="text-slate-400 text-xs">Panier moyen produit</p>
              <p className="text-2xl font-bold text-purple-400">
                {data.total_quantity > 0 ? formatPrice(data.total_revenue / data.total_quantity) : 0} F
              </p>
              <p className="text-slate-500 text-xs mt-1">par unité vendue</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* By department breakdown */}
      {data && Object.keys(data.by_department || {}).length > 0 && (
        <Card className="bg-slate-900/70 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-amber-400" />
              Répartition par département
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {Object.entries(data.by_department)
                .sort((a, b) => b[1].revenue - a[1].revenue)
                .map(([dept, v]) => (
                  <div key={dept} className={`rounded border p-2.5 ${DEPT_COLORS[dept] || DEPT_COLORS.autres}`}>
                    <p className="text-xs opacity-80">{DEPT_LABELS[dept] || dept}</p>
                    <p className="text-lg font-bold">{formatPrice(v.revenue)} F</p>
                    <p className="text-[11px] opacity-70">{formatQty(v.quantity_sold)} unité(s) · {v.products} produit(s)</p>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Product table */}
      <Card className="bg-slate-900/70 border-slate-800">
        <CardContent className="p-0">
          {loading && (
            <div className="py-12 text-center text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              Chargement des statistiques…
            </div>
          )}
          {error && (
            <div className="py-12 text-center text-red-400">{error}</div>
          )}
          {!loading && !error && data && filteredSortedProducts.length === 0 && (
            <div className="py-12 text-center text-slate-500">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-60" />
              Aucune vente sur la période / critères sélectionnés.
            </div>
          )}
          {!loading && !error && filteredSortedProducts.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-slate-800 bg-slate-900/50 text-slate-400">
                    <th className="p-3 w-10">#</th>
                    <th className="p-3"><SortBtn k="name">Produit</SortBtn></th>
                    <th className="p-3">Dépt.</th>
                    <th className="p-3 text-right"><SortBtn k="quantity_sold">Quantité</SortBtn></th>
                    <th className="p-3 text-right"><SortBtn k="revenue">CA</SortBtn></th>
                    <th className="p-3 text-right w-[180px]">Part CA</th>
                    <th className="p-3 text-right"><SortBtn k="invoice_count">Factures</SortBtn></th>
                    <th className="p-3 text-right"><SortBtn k="avg_price">Prix moyen</SortBtn></th>
                    <th className="p-3 text-right text-[11px]">Min → Max</th>
                    <th className="p-3 text-[11px]">Dernière vente</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSortedProducts.map((p, idx) => {
                    const pct = maxRevenue > 0 ? (p.revenue / maxRevenue) * 100 : 0;
                    return (
                      <tr key={`${p.name}-${p.department}-${idx}`} className="border-b border-slate-800/50 hover:bg-slate-800/40" data-testid="product-sales-row">
                        <td className="p-3 text-slate-500">{idx + 1}</td>
                        <td className="p-3 text-white font-medium">{p.name}</td>
                        <td className="p-3">
                          <Badge className={`text-[10px] ${DEPT_COLORS[p.department] || DEPT_COLORS.autres}`}>
                            {DEPT_LABELS[p.department] || p.department}
                          </Badge>
                        </td>
                        <td className="p-3 text-right text-emerald-400 font-medium">
                          {formatQty(p.quantity_sold)}
                          <span className="text-slate-500 text-xs ml-1">{p.unit}</span>
                        </td>
                        <td className="p-3 text-right text-amber-400 font-bold whitespace-nowrap">{formatPrice(p.revenue)} F</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center gap-2 justify-end">
                            <div className="w-24 h-1.5 bg-slate-800 rounded overflow-hidden">
                              <div className="h-full bg-amber-500" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-slate-400 text-xs w-10 text-right">{p.revenue_share_pct}%</span>
                          </div>
                        </td>
                        <td className="p-3 text-right text-slate-300">{p.invoice_count}</td>
                        <td className="p-3 text-right text-slate-300">{formatPrice(p.avg_price)} F</td>
                        <td className="p-3 text-right text-slate-500 text-xs whitespace-nowrap">
                          {p.min_price != null ? formatPrice(p.min_price) : "-"} → {p.max_price != null ? formatPrice(p.max_price) : "-"}
                        </td>
                        <td className="p-3 text-slate-500 text-xs">{(p.last_sold_at || "").slice(0, 10)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductSalesTab;
