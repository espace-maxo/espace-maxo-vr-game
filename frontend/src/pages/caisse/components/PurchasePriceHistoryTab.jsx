/**
 * PurchasePriceHistoryTab — Répertoire des prix d'achat
 *
 * Affiche l'historique des prix payés pour chaque produit (alimentation
 * automatique à la complétion d'un achat Caisse).
 * 2 vues : Liste plate / Par produit (avec stats min/max/avg/last).
 */
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { History, Search, Calendar, Package, TrendingUp, TrendingDown, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND}/api`;

const fmt = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n || 0));

const PurchasePriceHistoryTab = () => {
  const [activeView, setActiveView] = useState("by-product");
  const [history, setHistory] = useState([]);
  const [byProduct, setByProduct] = useState([]);
  const [filters, setFilters] = useState({ date_from: "", date_to: "", product_name: "", supplier: "" });
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({}); // {product_name: true}

  const fetchAll = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      if (filters.product_name) params.product_name = filters.product_name;
      if (filters.supplier) params.supplier = filters.supplier;
      const [hR, bR] = await Promise.all([
        axios.get(`${API}/purchase-price-history`, { params }),
        axios.get(`${API}/purchase-price-history/by-product`, {
          params: { date_from: params.date_from, date_to: params.date_to },
        }),
      ]);
      setHistory(hR.data?.history || []);
      setByProduct(bR.data?.products || []);
    } catch (e) {
      toast.error("Erreur de chargement");
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const backfill = async () => {
    try {
      const r = await axios.post(`${API}/purchase-price-history/backfill`);
      toast.success(`Backfill effectué : ${r.data?.inserted || 0} entrée(s) ajoutée(s)`);
      fetchAll();
    } catch (e) {
      toast.error("Erreur backfill");
    }
  };

  // Filtre client pour la vue "Par produit" (sur le nom uniquement)
  const filteredByProduct = useMemo(() => {
    const q = (filters.product_name || "").toLowerCase().trim();
    if (!q) return byProduct;
    return byProduct.filter((p) => (p.product_name || "").toLowerCase().includes(q));
  }, [byProduct, filters.product_name]);

  return (
    <div className="space-y-4" data-testid="purchase-price-history-tab">
      <Card className="bg-slate-900/60 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-white flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-2 text-base">
              <History className="w-5 h-5 text-cyan-400" />
              Répertoire des prix d'achat
              <Badge className="bg-cyan-500/20 text-cyan-300 text-[10px]">
                {byProduct.length} produits · {history.length} achats
              </Badge>
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={fetchAll} disabled={loading} className="border-slate-700 text-slate-300 h-8" data-testid="pph-refresh">
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Actualiser
              </Button>
              <Button size="sm" variant="outline" onClick={backfill} className="border-amber-500/40 text-amber-300 h-8 text-xs" data-testid="pph-backfill">
                Régénérer depuis l'historique
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Filtres */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <Label className="text-xs text-slate-400">Du</Label>
              <Input type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
                className="bg-slate-800 border-slate-700 text-white h-9" />
            </div>
            <div>
              <Label className="text-xs text-slate-400">Au</Label>
              <Input type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
                className="bg-slate-800 border-slate-700 text-white h-9" />
            </div>
            <div>
              <Label className="text-xs text-slate-400">Produit</Label>
              <Input value={filters.product_name} onChange={(e) => setFilters({ ...filters, product_name: e.target.value })}
                placeholder="Nom du produit" className="bg-slate-800 border-slate-700 text-white h-9" data-testid="pph-filter-product" />
            </div>
            <div>
              <Label className="text-xs text-slate-400">Fournisseur</Label>
              <Input value={filters.supplier} onChange={(e) => setFilters({ ...filters, supplier: e.target.value })}
                placeholder="Nom du fournisseur" className="bg-slate-800 border-slate-700 text-white h-9" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={fetchAll} className="bg-cyan-600 hover:bg-cyan-700 h-8" data-testid="pph-apply-filters">
              <Search className="w-3.5 h-3.5 mr-1" /> Filtrer
            </Button>
          </div>

          {/* Vues : Par produit / Liste */}
          <Tabs value={activeView} onValueChange={setActiveView}>
            <TabsList className="bg-slate-800/50 border border-slate-700">
              <TabsTrigger value="by-product" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white" data-testid="pph-view-by-product">
                <Package className="w-3.5 h-3.5 mr-1" /> Par produit
              </TabsTrigger>
              <TabsTrigger value="list" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white" data-testid="pph-view-list">
                <History className="w-3.5 h-3.5 mr-1" /> Liste
              </TabsTrigger>
            </TabsList>

            <TabsContent value="by-product">
              {filteredByProduct.length === 0 ? (
                <p className="text-slate-500 text-center py-8 text-sm">Aucun produit dans le répertoire pour ces filtres</p>
              ) : (
                <div className="space-y-2 mt-3">
                  {filteredByProduct.map((p) => {
                    const isOpen = !!expanded[p.product_name];
                    const trend = p.last_price > p.avg_price * 1.05 ? "up" : p.last_price < p.avg_price * 0.95 ? "down" : "stable";
                    const productPurchases = history.filter((h) => (h.product_name || "").toLowerCase() === (p.product_name || "").toLowerCase());
                    return (
                      <Card key={p.product_name} className="bg-slate-800/40 border-slate-700" data-testid={`pph-product-${p.product_name}`}>
                        <CardContent className="p-3">
                          <button
                            type="button"
                            onClick={() => setExpanded({ ...expanded, [p.product_name]: !isOpen })}
                            className="w-full text-left flex items-center justify-between gap-2 flex-wrap"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                              <span className="text-white font-semibold truncate">{p.product_name}</span>
                              <Badge className="bg-cyan-500/20 text-cyan-300 text-[10px] flex-shrink-0">{p.count} achat(s)</Badge>
                              {trend === "up" && <Badge className="bg-rose-500/20 text-rose-300 text-[10px]"><TrendingUp className="w-2.5 h-2.5 mr-0.5" />Hausse</Badge>}
                              {trend === "down" && <Badge className="bg-emerald-500/20 text-emerald-300 text-[10px]"><TrendingDown className="w-2.5 h-2.5 mr-0.5" />Baisse</Badge>}
                            </div>
                            <div className="flex items-center gap-3 text-xs flex-shrink-0">
                              <span><span className="text-slate-400">Min :</span> <strong className="text-emerald-400">{fmt(p.min_price)} F</strong></span>
                              <span><span className="text-slate-400">Max :</span> <strong className="text-rose-400">{fmt(p.max_price)} F</strong></span>
                              <span><span className="text-slate-400">Moy. :</span> <strong className="text-cyan-300">{fmt(p.avg_price)} F</strong></span>
                              <span className="border-l border-slate-700 pl-3"><span className="text-slate-400">Dernier :</span> <strong className="text-amber-300">{fmt(p.last_price)} F</strong></span>
                            </div>
                          </button>

                          {isOpen && productPurchases.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-700">
                              <div className="space-y-1.5">
                                {productPurchases.map((h) => (
                                  <div key={h.id} className="grid grid-cols-12 gap-2 text-xs items-center bg-slate-900/40 rounded px-2 py-1.5">
                                    <span className="col-span-2 text-slate-400 flex items-center gap-1"><Calendar className="w-3 h-3" />{h.purchase_date}</span>
                                    <span className="col-span-3 text-slate-300 truncate" title={h.supplier}>{h.supplier || "(sans fournisseur)"}</span>
                                    <span className="col-span-2 text-slate-400">{h.quantity} unité(s)</span>
                                    <span className="col-span-2 text-amber-300 font-semibold">{fmt(h.unit_price)} F /u</span>
                                    <span className="col-span-3 text-right text-white font-bold">{fmt(h.total_amount)} F</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="list">
              {history.length === 0 ? (
                <p className="text-slate-500 text-center py-8 text-sm">Aucune entrée dans le répertoire pour ces filtres</p>
              ) : (
                <div className="space-y-1 mt-3 max-h-[600px] overflow-y-auto">
                  {history.map((h) => (
                    <div key={h.id} className="grid grid-cols-12 gap-2 text-sm items-center bg-slate-800/40 border border-slate-700 rounded px-3 py-2 hover:bg-slate-800/60" data-testid={`pph-row-${h.id}`}>
                      <span className="col-span-2 text-slate-400 flex items-center gap-1 text-xs"><Calendar className="w-3 h-3" />{h.purchase_date}</span>
                      <span className="col-span-3 text-white truncate" title={h.product_name}>{h.product_name}</span>
                      <span className="col-span-2 text-slate-400 truncate text-xs" title={h.supplier}>{h.supplier || "—"}</span>
                      <span className="col-span-1 text-slate-300 text-xs">{h.quantity}</span>
                      <span className="col-span-2 text-amber-300 font-semibold text-xs">{fmt(h.unit_price)} F</span>
                      <span className="col-span-2 text-right text-white font-bold text-xs">{fmt(h.total_amount)} F</span>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default PurchasePriceHistoryTab;
