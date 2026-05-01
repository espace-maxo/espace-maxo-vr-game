import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart2, TrendingUp, TrendingDown, AlertTriangle, ShieldCheck,
  Search, Calendar, Package, Activity, Info
} from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { format, subDays, startOfMonth } from "date-fns";
import { fr } from "date-fns/locale";

const API = `${process.env.REACT_APP_BACKEND_URL}/api/stock`;

const SEVERITY_THEME = {
  ok:       { bg: "bg-emerald-900/15 border-emerald-500/30", text: "text-emerald-300", icon: ShieldCheck, label: "OK — aucune anomalie" },
  warning:  { bg: "bg-amber-900/15 border-amber-500/40",    text: "text-amber-300",    icon: AlertTriangle, label: "Alerte — à vérifier" },
  critical: { bg: "bg-red-900/20 border-red-500/50",        text: "text-red-300",      icon: AlertTriangle, label: "Critique — anomalie détectée" },
};

const ProductAnalysisView = () => {
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState("");
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    axios.get(`${API}/products`)
      .then(r => setProducts(r.data.products || []))
      .catch(() => {});
  }, []);

  const filteredProducts = useMemo(() => {
    if (!search) return products.slice(0, 50);
    const q = search.toLowerCase();
    return products.filter(p =>
      p.name?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [products, search]);

  const loadAnalysis = async () => {
    if (!productId) { toast.error("Choisissez un produit"); return; }
    if (!startDate || !endDate) { toast.error("Choisissez une période"); return; }
    if (startDate > endDate) { toast.error("La date de début doit précéder la date de fin"); return; }
    setLoading(true);
    try {
      const r = await axios.get(`${API}/products/${productId}/analysis`, {
        params: { start_date: startDate, end_date: endDate }
      });
      setResult(r.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur analyse");
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (preset) => {
    const now = new Date();
    if (preset === "7d") { setStartDate(format(subDays(now, 6), "yyyy-MM-dd")); setEndDate(format(now, "yyyy-MM-dd")); }
    else if (preset === "30d") { setStartDate(format(subDays(now, 29), "yyyy-MM-dd")); setEndDate(format(now, "yyyy-MM-dd")); }
    else if (preset === "month") { setStartDate(format(startOfMonth(now), "yyyy-MM-dd")); setEndDate(format(now, "yyyy-MM-dd")); }
    else if (preset === "90d") { setStartDate(format(subDays(now, 89), "yyyy-MM-dd")); setEndDate(format(now, "yyyy-MM-dd")); }
  };

  const theme = result ? SEVERITY_THEME[result.severity] || SEVERITY_THEME.ok : null;

  return (
    <div className="space-y-4" data-testid="product-analysis-view">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart2 className="w-7 h-7 text-cyan-400" />
        <div>
          <h2 className="text-2xl font-bold text-white">Analyse produit</h2>
          <p className="text-slate-400 text-sm">Flux entrées/sorties, détection de gaspillage et d'anomalies sur une période.</p>
        </div>
      </div>

      {/* Selector */}
      <Card className="bg-slate-800/40 border-slate-700">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300 text-xs mb-1 block">Produit *</Label>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un produit..." className="bg-slate-900 border-slate-700 text-white pl-9 h-9" data-testid="analysis-search" />
              </div>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-white" data-testid="analysis-product-select">
                  <SelectValue placeholder="Choisir un produit" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 max-h-[300px]">
                  {filteredProducts.map(p => (
                    <SelectItem key={p.id} value={p.id} className="text-white">
                      {p.name} <span className="text-slate-500 text-xs ml-1">({p.code})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-300 text-xs mb-1 block">Période *</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                <Button size="sm" variant="outline" onClick={() => applyPreset("7d")} className="border-slate-600 text-slate-300 h-7 text-xs" data-testid="preset-7d">7 jours</Button>
                <Button size="sm" variant="outline" onClick={() => applyPreset("30d")} className="border-slate-600 text-slate-300 h-7 text-xs" data-testid="preset-30d">30 jours</Button>
                <Button size="sm" variant="outline" onClick={() => applyPreset("month")} className="border-slate-600 text-slate-300 h-7 text-xs" data-testid="preset-month">Mois en cours</Button>
                <Button size="sm" variant="outline" onClick={() => applyPreset("90d")} className="border-slate-600 text-slate-300 h-7 text-xs" data-testid="preset-90d">90 jours</Button>
              </div>
              <div className="flex gap-2">
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-slate-900 border-slate-700 text-white h-9" data-testid="analysis-start" />
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-slate-900 border-slate-700 text-white h-9" data-testid="analysis-end" />
              </div>
            </div>
          </div>
          <Button onClick={loadAnalysis} disabled={loading || !productId} className="bg-cyan-600 hover:bg-cyan-700 w-full sm:w-auto" data-testid="analysis-run-btn">
            <BarChart2 className="w-4 h-4 mr-1" /> {loading ? "Analyse en cours..." : "Lancer l'analyse"}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <>
          {/* Severity banner */}
          <Card className={`${theme.bg} border`} data-testid="analysis-severity-banner">
            <CardContent className="p-3 flex items-start gap-3">
              <theme.icon className={`w-6 h-6 ${theme.text} flex-shrink-0 mt-0.5`} />
              <div className="flex-1">
                <p className={`${theme.text} font-bold`}>{theme.label}</p>
                <p className="text-slate-400 text-xs">
                  {result.product.name} · Période du {format(new Date(result.period.start_date), "dd/MM/yyyy", { locale: fr })} au {format(new Date(result.period.end_date), "dd/MM/yyyy", { locale: fr })}
                  {" · "}{result.period.movements_count} mouvement{result.period.movements_count > 1 ? 's' : ''}
                </p>
                {result.anomalies.length > 0 && (
                  <ul className="mt-2 space-y-1" data-testid="analysis-anomalies-list">
                    {result.anomalies.map((a, i) => (
                      <li key={i} className="text-xs flex items-start gap-1.5">
                        <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${a.severity === 'critical' ? 'text-red-400' : 'text-amber-400'}`} />
                        <span className={a.severity === 'critical' ? 'text-red-200' : 'text-amber-200'}>{a.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="bg-emerald-900/20 border-emerald-500/30"><CardContent className="p-3 text-center">
              <TrendingUp className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
              <p className="text-emerald-300 text-[10px] uppercase font-bold">Entrées</p>
              <p className="text-emerald-200 font-bold text-xl" data-testid="kpi-entrees">{result.total_entrees}</p>
              <p className="text-emerald-400/70 text-[10px]">{result.product.unit}</p>
            </CardContent></Card>

            <Card className="bg-red-900/20 border-red-500/30"><CardContent className="p-3 text-center">
              <TrendingDown className="w-5 h-5 text-red-400 mx-auto mb-1" />
              <p className="text-red-300 text-[10px] uppercase font-bold">Sorties</p>
              <p className="text-red-200 font-bold text-xl" data-testid="kpi-sorties">{result.total_sorties}</p>
              <p className="text-red-400/70 text-[10px]">{result.product.unit}</p>
            </CardContent></Card>

            <Card className="bg-cyan-900/20 border-cyan-500/30"><CardContent className="p-3 text-center">
              <Activity className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
              <p className="text-cyan-300 text-[10px] uppercase font-bold">Net</p>
              <p className={`font-bold text-xl ${result.net_movement >= 0 ? 'text-emerald-200' : 'text-red-200'}`}>{result.net_movement >= 0 ? '+' : ''}{result.net_movement}</p>
              <p className="text-cyan-400/70 text-[10px]">{result.product.unit}</p>
            </CardContent></Card>

            <Card className="bg-slate-800/60 border-slate-600"><CardContent className="p-3 text-center">
              <Package className="w-5 h-5 text-slate-300 mx-auto mb-1" />
              <p className="text-slate-300 text-[10px] uppercase font-bold">Solde actuel</p>
              <p className="text-white font-bold text-xl">{result.balance.current}</p>
              <p className="text-slate-500 text-[10px]">min: {result.product.stock_min}</p>
            </CardContent></Card>

            <Card className={`${result.balance.ecart && Math.abs(result.balance.ecart) > 0.1 ? 'bg-amber-900/20 border-amber-500/30' : 'bg-slate-800/60 border-slate-600'}`}>
              <CardContent className="p-3 text-center">
                <Info className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                <p className="text-amber-300 text-[10px] uppercase font-bold">Écart</p>
                <p className={`font-bold text-xl ${result.balance.ecart && Math.abs(result.balance.ecart) > 0.1 ? 'text-amber-200' : 'text-slate-400'}`} data-testid="kpi-ecart">
                  {result.balance.ecart !== null && result.balance.ecart !== undefined ? (result.balance.ecart > 0 ? '+' : '') + result.balance.ecart : '—'}
                </p>
                <p className="text-amber-400/70 text-[10px]">théorique vs réel</p>
              </CardContent>
            </Card>
          </div>

          {/* Détail par type */}
          <Card className="bg-slate-800/40 border-slate-700">
            <CardContent className="p-4">
              <h3 className="text-white font-bold mb-3">Détail par type de mouvement</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                {[
                  { k: "entree", label: "Achats / Entrées", color: "text-emerald-400" },
                  { k: "retour_fournisseur", label: "Retours fournisseur", color: "text-emerald-400" },
                  { k: "transfert_entree", label: "Transferts entrants", color: "text-cyan-400" },
                  { k: "ajustement_positif", label: "Ajustements +", color: "text-emerald-400" },
                  { k: "sortie", label: "Sorties (ventes/déstock)", color: "text-red-400" },
                  { k: "perte", label: "Pertes", color: "text-orange-400" },
                  { k: "casse", label: "Casses", color: "text-orange-400" },
                  { k: "transfert_sortie", label: "Transferts sortants", color: "text-cyan-400" },
                  { k: "ajustement_negatif", label: "Ajustements -", color: "text-red-400" },
                  { k: "inventaire", label: "Inventaires", color: "text-slate-400" },
                ].map(row => (
                  <div key={row.k} className="flex items-center justify-between bg-slate-900/50 rounded px-2.5 py-1.5">
                    <span className="text-slate-400 text-xs">{row.label}</span>
                    <span className={`font-bold ${row.color}`}>{result.totals[row.k] || 0}</span>
                  </div>
                ))}
              </div>

              {/* Sorties breakdown */}
              {result.total_sorties > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-700/50">
                  <h4 className="text-slate-300 text-xs font-bold uppercase mb-2">Répartition des sorties</h4>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge className="bg-red-500/20 text-red-300">Auto (factures) : {result.sorties_breakdown.auto_facture}</Badge>
                    <Badge className="bg-orange-500/20 text-orange-300">Manuelles : {result.sorties_breakdown.manuel}</Badge>
                    <Badge className="bg-cyan-500/20 text-cyan-300">Transferts : {result.sorties_breakdown.transfert}</Badge>
                    <Badge className="bg-slate-500/20 text-slate-300">Autres : {result.sorties_breakdown.autre_sortie}</Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Breakdown quotidien */}
          {result.daily.length > 0 && (
            <Card className="bg-slate-800/40 border-slate-700">
              <CardContent className="p-4">
                <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-cyan-400" /> Évolution quotidienne
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-400 text-xs border-b border-slate-700/50">
                        <th className="text-left p-2">Date</th>
                        <th className="text-right p-2">Entrées</th>
                        <th className="text-right p-2">Sorties</th>
                        <th className="text-right p-2">Net</th>
                      </tr>
                    </thead>
                    <tbody data-testid="analysis-daily-table">
                      {result.daily.map((d, i) => (
                        <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-700/20">
                          <td className="p-2 text-slate-300">{format(new Date(d.date), "EEE dd MMM", { locale: fr })}</td>
                          <td className="p-2 text-right text-emerald-400">{d.entrees > 0 ? `+${d.entrees}` : '—'}</td>
                          <td className="p-2 text-right text-red-400">{d.sorties > 0 ? `-${d.sorties}` : '—'}</td>
                          <td className={`p-2 text-right font-bold ${d.net >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{d.net >= 0 ? '+' : ''}{d.net}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default ProductAnalysisView;
