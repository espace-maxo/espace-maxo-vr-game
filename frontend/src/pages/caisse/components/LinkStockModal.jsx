import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Link2, Link2Off, Package, X, BookOpen } from "lucide-react";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * LinkStockModal
 * Links a Caisse product to EITHER:
 *  - a single Stock product (simple 1:1 decrement), OR
 *  - a stock_recipe (composed product — decrements multiple ingredients).
 * Tabs switch between the two modes; mutually exclusive on the backend.
 */
const LinkStockModal = ({ open, onClose, caisseProduct, onLinked }) => {
  const [mode, setMode] = useState("stock"); // 'stock' | 'recipe'
  const [stockProducts, setStockProducts] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [sp, rp] = await Promise.all([
          axios.get(`${API}/stock/products`),
          axios.get(`${API}/stock/recipes`),
        ]);
        if (!cancelled) {
          setStockProducts(sp.data.products || []);
          setRecipes(rp.data.recipes || []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    // Seed initial tab based on what's currently linked
    if (caisseProduct?.stock_recipe_id) setMode("recipe");
    else setMode("stock");
    setSearch(caisseProduct?.name?.split(" ").slice(0, 2).join(" ") || "");
    return () => { cancelled = true; };
  }, [open, caisseProduct]);

  const filteredStock = useMemo(() => {
    if (!search.trim()) return stockProducts.slice(0, 30);
    const q = search.toLowerCase();
    return stockProducts
      .filter(p => p.name.toLowerCase().includes(q) || (p.code || "").toLowerCase().includes(q))
      .slice(0, 30);
  }, [stockProducts, search]);

  const filteredRecipes = useMemo(() => {
    if (!search.trim()) return recipes.slice(0, 30);
    const q = search.toLowerCase();
    return recipes
      .filter(r => r.name.toLowerCase().includes(q) || (r.caisse_product_name || "").toLowerCase().includes(q))
      .slice(0, 30);
  }, [recipes, search]);

  const currentlyLinked = useMemo(() => {
    if (caisseProduct?.stock_product_id) {
      const sp = stockProducts.find(p => p.id === caisseProduct.stock_product_id);
      return sp ? { type: "stock", entity: sp } : null;
    }
    if (caisseProduct?.stock_recipe_id) {
      const rp = recipes.find(r => r.id === caisseProduct.stock_recipe_id);
      return rp ? { type: "recipe", entity: rp } : null;
    }
    return null;
  }, [caisseProduct, stockProducts, recipes]);

  const linkToStock = async (stockProductId) => {
    try {
      await axios.put(`${API}/caisse/products/${caisseProduct.id}`, {
        stock_product_id: stockProductId,
      });
      toast.success(stockProductId ? "Lié à un produit stock" : "Lien supprimé");
      onLinked?.();
      onClose();
    } catch (e) {
      toast.error("Erreur lors de la liaison");
    }
  };

  const linkToRecipe = async (recipeId) => {
    try {
      await axios.put(`${API}/caisse/products/${caisseProduct.id}`, {
        stock_recipe_id: recipeId,
      });
      toast.success(recipeId ? "Lié à une recette composée" : "Lien supprimé");
      onLinked?.();
      onClose();
    } catch (e) {
      toast.error("Erreur lors de la liaison");
    }
  };

  const unlinkAll = async () => {
    try {
      await axios.put(`${API}/caisse/products/${caisseProduct.id}`, {
        stock_product_id: "",
        stock_recipe_id: "",
      });
      toast.success("Lien supprimé");
      onLinked?.();
      onClose();
    } catch (e) {
      toast.error("Erreur lors du retrait du lien");
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
            Liez <strong className="text-white">{caisseProduct.name}</strong> à un produit stock simple
            <span className="text-slate-500"> ou à une recette composée</span>.
            Chaque vente déstockera automatiquement.
          </DialogDescription>
        </DialogHeader>

        {currentlyLinked && (
          <div className="bg-emerald-900/20 border border-emerald-500/30 rounded px-3 py-2 flex items-center justify-between">
            <div className="text-sm">
              <span className="text-emerald-300 font-medium">
                {currentlyLinked.type === "recipe" ? "Recette actuelle : " : "Produit stock actuel : "}
              </span>
              <span className="text-white font-semibold">{currentlyLinked.entity.name}</span>
              {currentlyLinked.type === "stock" && (
                <span className="text-slate-400 text-xs ml-2">
                  ({currentlyLinked.entity.quantity} {currentlyLinked.entity.unit} en stock)
                </span>
              )}
              {currentlyLinked.type === "recipe" && (
                <span className="text-slate-400 text-xs ml-2">
                  ({(currentlyLinked.entity.ingredients || []).length} ingrédient(s))
                </span>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={unlinkAll}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/20 h-7 text-xs"
              data-testid="unlink-btn"
            >
              <Link2Off className="w-3 h-3 mr-1" /> Délier
            </Button>
          </div>
        )}

        {/* Mode toggle */}
        <div className="flex gap-2 border-b border-slate-700 pb-2">
          <button
            type="button"
            onClick={() => setMode("stock")}
            className={`flex-1 py-2 px-3 rounded-t text-sm font-medium flex items-center justify-center gap-1.5 ${
              mode === "stock" ? "bg-violet-500/20 text-violet-300 border border-violet-500/40" : "text-slate-400 hover:text-white"
            }`}
            data-testid="mode-stock-btn"
          >
            <Package className="w-4 h-4" /> Produit stock simple
          </button>
          <button
            type="button"
            onClick={() => setMode("recipe")}
            className={`flex-1 py-2 px-3 rounded-t text-sm font-medium flex items-center justify-center gap-1.5 ${
              mode === "recipe" ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" : "text-slate-400 hover:text-white"
            }`}
            data-testid="mode-recipe-btn"
          >
            <BookOpen className="w-4 h-4" /> Recette composée ({recipes.length})
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={mode === "stock" ? "Rechercher un produit stock..." : "Rechercher une recette composée..."}
            className="bg-slate-800 border-slate-700 text-white pl-9"
            autoFocus
            data-testid="link-stock-search"
          />
        </div>

        <div className="max-h-[400px] overflow-y-auto space-y-1 pr-1">
          {loading && <p className="text-slate-500 text-sm text-center py-4">Chargement...</p>}

          {mode === "stock" && !loading && filteredStock.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-4">Aucun produit stock ne correspond.</p>
          )}
          {mode === "stock" && filteredStock.map((sp) => {
            const isThisLink = sp.id === caisseProduct.stock_product_id;
            return (
              <button
                key={sp.id}
                type="button"
                onClick={() => linkToStock(sp.id)}
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
                  </div>
                </div>
                {isThisLink && (
                  <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs">Déjà lié</Badge>
                )}
              </button>
            );
          })}

          {mode === "recipe" && !loading && filteredRecipes.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-4">Aucune recette ne correspond. <br />Créez une fiche technique dans <i>Stock → Fiches Techniques</i>.</p>
          )}
          {mode === "recipe" && filteredRecipes.map((rp) => {
            const isThisLink = rp.id === caisseProduct.stock_recipe_id;
            const ingredients = rp.ingredients || [];
            return (
              <button
                key={rp.id}
                type="button"
                onClick={() => linkToRecipe(rp.id)}
                disabled={isThisLink}
                className={`w-full text-left bg-slate-800/50 border rounded px-3 py-2 transition-colors ${
                  isThisLink
                    ? "border-amber-500/40 opacity-60 cursor-default"
                    : "border-slate-700 hover:border-amber-500/60 hover:bg-amber-500/10"
                }`}
                data-testid={`recipe-choice-${rp.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-3 h-3 text-amber-400 flex-shrink-0" />
                      <span className="text-white font-medium text-sm">{rp.name}</span>
                      {rp.caisse_product_name && rp.caisse_product_name !== rp.name && (
                        <span className="text-slate-500 text-xs truncate">→ {rp.caisse_product_name}</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-1">
                      {ingredients.slice(0, 4).map((ing, i) => (
                        <span key={i} className="bg-slate-700/60 px-1.5 py-0.5 rounded text-[10px]">
                          {ing.quantity} {ing.unit || ""} {ing.product_name}
                        </span>
                      ))}
                      {ingredients.length > 4 && <span className="text-slate-500 text-[10px]">+{ingredients.length - 4}</span>}
                    </div>
                  </div>
                  {isThisLink && (
                    <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs">Déjà lié</Badge>
                  )}
                </div>
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
