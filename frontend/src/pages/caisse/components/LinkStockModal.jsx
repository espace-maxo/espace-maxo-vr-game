import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, Link2, Link2Off, Package, X } from "lucide-react";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * LinkStockModal
 * Lets the manager/admin link a Caisse product to a Stock product so that each
 * sale automatically decrements the stock. Show current link + list with search
 * + quick "Délier" action.
 */
const LinkStockModal = ({ open, onClose, caisseProduct, onLinked }) => {
  const [stockProducts, setStockProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await axios.get(`${API}/stock/products`);
        if (!cancelled) setStockProducts(data.products || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    // Reset search when opening
    setSearch(caisseProduct?.name?.split(" ").slice(0, 2).join(" ") || "");
    return () => { cancelled = true; };
  }, [open, caisseProduct]);

  const filtered = useMemo(() => {
    if (!search.trim()) return stockProducts.slice(0, 30);
    const q = search.toLowerCase();
    return stockProducts
      .filter(p => p.name.toLowerCase().includes(q) || (p.code || "").toLowerCase().includes(q))
      .slice(0, 30);
  }, [stockProducts, search]);

  const currentlyLinked = caisseProduct?.stock_product_id
    ? stockProducts.find(p => p.id === caisseProduct.stock_product_id)
    : null;

  const link = async (stockProductId) => {
    try {
      await axios.put(`${API}/caisse/products/${caisseProduct.id}`, {
        stock_product_id: stockProductId,
      });
      toast.success(stockProductId ? "Produit lié au stock" : "Lien supprimé");
      onLinked?.();
      onClose();
    } catch (e) {
      toast.error("Erreur lors de la liaison");
    }
  };

  if (!caisseProduct) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl" data-testid="link-stock-modal">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Link2 className="w-5 h-5 text-violet-400" />
            Lier au stock
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Liez <strong className="text-white">{caisseProduct.name}</strong> à un produit du stock.
            Chaque vente décrementera automatiquement le stock de 1 unité.
          </DialogDescription>
        </DialogHeader>

        {currentlyLinked && (
          <div className="bg-emerald-900/20 border border-emerald-500/30 rounded px-3 py-2 flex items-center justify-between">
            <div className="text-sm">
              <span className="text-emerald-300 font-medium">Actuellement lié à : </span>
              <span className="text-white font-semibold">{currentlyLinked.name}</span>
              <span className="text-slate-400 text-xs ml-2">
                ({currentlyLinked.quantity} {currentlyLinked.unit} en stock)
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => link("")}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/20 h-7 text-xs"
              data-testid="unlink-btn"
            >
              <Link2Off className="w-3 h-3 mr-1" /> Délier
            </Button>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un produit stock..."
            className="bg-slate-800 border-slate-700 text-white pl-9"
            autoFocus
            data-testid="link-stock-search"
          />
        </div>

        <div className="max-h-[400px] overflow-y-auto space-y-1 pr-1">
          {loading && <p className="text-slate-500 text-sm text-center py-4">Chargement...</p>}
          {!loading && filtered.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-4">Aucun produit stock ne correspond.</p>
          )}
          {filtered.map((sp) => {
            const isThisLink = sp.id === caisseProduct.stock_product_id;
            return (
              <button
                key={sp.id}
                type="button"
                onClick={() => link(sp.id)}
                disabled={isThisLink}
                className={`w-full text-left bg-slate-800/50 border rounded px-3 py-2 flex items-center justify-between transition-colors ${
                  isThisLink
                    ? "border-emerald-500/40 opacity-60 cursor-default"
                    : "border-slate-700 hover:border-violet-500/60 hover:bg-violet-500/10"
                }`}
                data-testid={`stock-choice-${sp.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium text-sm">{sp.name}</span>
                    <span className="font-mono text-xs text-slate-500">{sp.code}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Stock : <span className={sp.quantity <= 0 ? "text-red-400" : "text-emerald-400"}>{sp.quantity} {sp.unit}</span>
                    <span className="text-slate-500"> · Prix achat : {new Intl.NumberFormat('fr-FR').format(sp.purchase_price || 0)} F</span>
                  </div>
                </div>
                {isThisLink && (
                  <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs">
                    Déjà lié
                  </Badge>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose} className="text-slate-400">
            <X className="w-4 h-4 mr-1" /> Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LinkStockModal;
