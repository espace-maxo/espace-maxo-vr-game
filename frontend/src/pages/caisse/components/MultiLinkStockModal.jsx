import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Link2, Package, CheckCircle, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * MultiLinkStockModal
 * Allows the user to link SEVERAL caisse products to the SAME stock product
 * in one action. Example: "Riz blanc (Caisse)", "Riz cantonais (Caisse)",
 * "Riz aux légumes (Caisse)" all → "Riz blanc" (Stock).
 */
const MultiLinkStockModal = ({ open, onClose, caisseProducts = [], onDone }) => {
  const [stockProducts, setStockProducts] = useState([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [stockSearch, setStockSearch] = useState("");
  const [selectedStock, setSelectedStock] = useState(null);

  const [caisseSearch, setCaisseSearch] = useState("");
  const [selectedCaisseIds, setSelectedCaisseIds] = useState(new Set());
  const [saving, setSaving] = useState(false);

  // Reset on open/close
  useEffect(() => {
    if (!open) return;
    setSelectedStock(null);
    setSelectedCaisseIds(new Set());
    setStockSearch("");
    setCaisseSearch("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingStock(true);
      try {
        const { data } = await axios.get(`${API}/stock/products`);
        if (!cancelled) setStockProducts(data.products || []);
      } finally {
        if (!cancelled) setLoadingStock(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const filteredStock = useMemo(() => {
    const q = stockSearch.trim().toLowerCase();
    if (!q) return stockProducts.slice(0, 20);
    return stockProducts
      .filter(p => p.name.toLowerCase().includes(q) || (p.code || "").toLowerCase().includes(q))
      .slice(0, 20);
  }, [stockProducts, stockSearch]);

  const filteredCaisse = useMemo(() => {
    const q = caisseSearch.trim().toLowerCase();
    if (!q) return caisseProducts;
    return caisseProducts.filter(p => p.name.toLowerCase().includes(q));
  }, [caisseProducts, caisseSearch]);

  const toggleCaisse = (id) => {
    setSelectedCaisseIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    const ids = filteredCaisse.map(p => p.id);
    setSelectedCaisseIds(new Set([...selectedCaisseIds, ...ids]));
  };
  const deselectAll = () => setSelectedCaisseIds(new Set());

  const doLinkAll = async () => {
    if (!selectedStock) return toast.error("Choisissez un produit stock cible");
    if (selectedCaisseIds.size === 0) return toast.error("Sélectionnez au moins un produit caisse à lier");

    setSaving(true);
    let ok = 0, ko = 0;
    const ids = Array.from(selectedCaisseIds);
    for (const id of ids) {
      try {
        await axios.put(`${API}/caisse/products/${id}`, { stock_product_id: selectedStock.id });
        ok += 1;
      } catch (e) {
        ko += 1;
      }
    }
    setSaving(false);
    if (ok > 0) {
      toast.success(`✓ ${ok} produit(s) caisse liés à "${selectedStock.name}"${ko > 0 ? ` — ${ko} échec(s)` : ""}`);
      onDone?.();
      onClose();
    } else {
      toast.error("Aucune liaison n'a abouti");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" data-testid="multi-link-modal">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Link2 className="w-5 h-5 text-violet-400" />
            Lier plusieurs produits Caisse au même produit Stock
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Idéal pour : plusieurs recettes à base d'un même ingrédient (ex: <i>Riz blanc</i>, <i>Riz cantonais</i>, <i>Riz aux légumes</i> → tous vers <i>Riz blanc</i> en stock).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-hidden">
          {/* LEFT: Caisse multi-select */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <p className="text-emerald-400 text-sm font-semibold">1. Produits Caisse ({selectedCaisseIds.size} sélectionné{selectedCaisseIds.size > 1 ? 's' : ''})</p>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={selectAllVisible} className="text-emerald-400 h-6 text-xs">Tous visibles</Button>
                <Button size="sm" variant="ghost" onClick={deselectAll} className="text-slate-400 h-6 text-xs">Vider</Button>
              </div>
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                value={caisseSearch}
                onChange={(e) => setCaisseSearch(e.target.value)}
                placeholder="Filtrer les produits caisse..."
                className="bg-slate-800 border-slate-700 text-white pl-9 h-9"
                data-testid="multi-link-caisse-search"
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 border border-slate-700 rounded p-2 min-h-[240px]">
              {filteredCaisse.map((cp) => {
                const isSel = selectedCaisseIds.has(cp.id);
                const isAlreadyLinked = !!cp.stock_product_id;
                return (
                  <button
                    key={cp.id}
                    type="button"
                    onClick={() => toggleCaisse(cp.id)}
                    className={`w-full text-left rounded px-2 py-1.5 text-sm flex items-center gap-2 transition-colors ${
                      isSel ? "bg-emerald-600/30 border border-emerald-500/60" : "bg-slate-800/50 border border-slate-700 hover:border-emerald-500/40"
                    }`}
                    data-testid={`multi-link-caisse-${cp.id}`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${isSel ? "bg-emerald-500 border-emerald-500" : "border-slate-500"}`}>
                      {isSel && <CheckCircle className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white truncate">{cp.name}</p>
                      <p className="text-slate-500 text-xs">
                        {cp.category || "—"}
                        {isAlreadyLinked && <span className="text-emerald-400 ml-1">· déjà lié (sera remplacé)</span>}
                      </p>
                    </div>
                  </button>
                );
              })}
              {filteredCaisse.length === 0 && (
                <p className="text-slate-500 text-sm text-center py-6">Aucun produit ne correspond.</p>
              )}
            </div>
          </div>

          {/* RIGHT: Stock single-select */}
          <div className="flex flex-col min-h-0">
            <p className="text-cyan-400 text-sm font-semibold mb-2">2. Produit Stock cible {selectedStock ? "✓" : "(choisir)"}</p>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                placeholder="Rechercher un produit stock..."
                className="bg-slate-800 border-slate-700 text-white pl-9 h-9"
                autoFocus
                data-testid="multi-link-stock-search"
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 border border-slate-700 rounded p-2 min-h-[240px]">
              {loadingStock && <p className="text-slate-500 text-sm text-center py-4">Chargement…</p>}
              {filteredStock.map((sp) => {
                const isSel = selectedStock?.id === sp.id;
                return (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => setSelectedStock(sp)}
                    className={`w-full text-left rounded px-2 py-1.5 text-sm flex items-center gap-2 transition-colors ${
                      isSel ? "bg-cyan-600/30 border border-cyan-500/60" : "bg-slate-800/50 border border-slate-700 hover:border-cyan-500/40"
                    }`}
                    data-testid={`multi-link-stock-${sp.id}`}
                  >
                    <Package className={`w-3 h-3 ${isSel ? "text-cyan-300" : "text-slate-500"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white truncate">{sp.name}</p>
                      <p className="text-slate-500 text-xs">
                        {sp.quantity ?? 0} {sp.unit || ""} · {sp.category || "—"}
                      </p>
                    </div>
                    {isSel && <CheckCircle className="w-4 h-4 text-cyan-300" />}
                  </button>
                );
              })}
              {!loadingStock && filteredStock.length === 0 && (
                <p className="text-slate-500 text-sm text-center py-6">Aucun produit stock ne correspond.</p>
              )}
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-700 mt-2">
          <div className="text-sm text-slate-400 flex-1 min-w-0 truncate">
            {selectedStock && selectedCaisseIds.size > 0 ? (
              <span>
                <Badge className="bg-emerald-500/20 text-emerald-300">{selectedCaisseIds.size}</Badge>
                <ArrowRight className="w-3 h-3 inline mx-1 text-slate-500" />
                <span className="text-cyan-300 font-semibold">{selectedStock.name}</span>
              </span>
            ) : (
              <span className="text-slate-500 italic">Sélectionnez ≥ 1 produit caisse et 1 produit stock</span>
            )}
          </div>
          <Button variant="ghost" onClick={onClose} className="text-slate-400">
            Annuler
          </Button>
          <Button
            onClick={doLinkAll}
            disabled={saving || !selectedStock || selectedCaisseIds.size === 0}
            className="bg-violet-600 hover:bg-violet-700"
            data-testid="multi-link-confirm-btn"
          >
            <Link2 className="w-4 h-4 mr-1" />
            {saving ? "Liaison en cours…" : `Lier ${selectedCaisseIds.size || ""} produit(s)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MultiLinkStockModal;
