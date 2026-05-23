/**
 * QuickProductPicker — Picker rapide pour les produits du Catalogue Marché.
 *
 * Réutilisable sur :
 *   - Le formulaire de Nouvelle demande d'achat (Caisse → Achats)
 *   - Le Simulateur de devis Location (déjà existant via marketProducts)
 *
 * Comportement :
 *   - Recherche par nom + filtre catégorie
 *   - Affiche les produits sous forme de chips cliquables groupés par catégorie
 *   - Au clic : pré-remplit description + prix unitaire dans le formulaire parent
 *   - Bouton "Importer les produits par défaut" si liste vide (admin only friendly)
 */
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ShoppingBasket, Search, RefreshCw, Download } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND}/api`;
const fmt = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n || 0));

const QuickProductPicker = ({ onPick, dataTestidPrefix = "qpp" }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [collapsed, setCollapsed] = useState(false);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/quick-products`);
      setProducts(r.data?.products || []);
    } catch {
      setProducts([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchProducts(); }, []);

  const categories = useMemo(() => {
    const s = new Set();
    products.forEach((p) => p.category && s.add(p.category));
    return ["all", ...Array.from(s).sort()];
  }, [products]);

  const filtered = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    return products
      .filter((p) => catFilter === "all" || p.category === catFilter)
      .filter((p) => !q || (p.name || "").toLowerCase().includes(q));
  }, [products, search, catFilter]);

  // Group filtered by category for clearer layout (only when no search active)
  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach((p) => {
      const c = p.category || "Autres";
      if (!g[c]) g[c] = [];
      g[c].push(p);
    });
    return g;
  }, [filtered]);

  const importDefault = async () => {
    try {
      const r = await axios.post(`${API}/quick-products/import-missing`);
      const ins = r.data?.inserted || 0;
      if (ins > 0) toast.success(`${ins} produits importés ✅`);
      else toast.info("Catalogue déjà à jour");
      fetchProducts();
    } catch {
      toast.error("Erreur d'import");
    }
  };

  return (
    <Card className="bg-slate-800/60 border-slate-700 mt-2" data-testid={`${dataTestidPrefix}-root`}>
      <CardContent className="p-2 sm:p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex items-center gap-2 text-amber-300 hover:text-amber-200 text-sm font-semibold"
            data-testid={`${dataTestidPrefix}-toggle`}
          >
            <ShoppingBasket className="w-4 h-4" />
            Catalogue produits cliquable
            <Badge className="bg-amber-500/20 text-amber-200 text-[10px]">{products.length}</Badge>
            <span className="text-slate-400 text-xs">{collapsed ? "▸ Afficher" : "▾ Masquer"}</span>
          </button>
          <div className="flex items-center gap-1">
            {products.length === 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={importDefault}
                className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 h-7 text-[11px]"
                data-testid={`${dataTestidPrefix}-import`}
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                Importer les produits par défaut
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={fetchProducts}
              disabled={loading}
              className="text-slate-300 h-7 w-7 p-0"
              data-testid={`${dataTestidPrefix}-refresh`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {!collapsed && (
          <>
            {/* Search + category filter */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un produit..."
                  className="bg-slate-900 border-slate-700 text-white h-8 pl-7 text-sm"
                  data-testid={`${dataTestidPrefix}-search`}
                />
              </div>
              <div className="flex gap-1 flex-wrap max-w-full">
                {categories.slice(0, 10).map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setCatFilter(c)}
                    className={`text-[10px] px-2 py-1 rounded-full font-medium transition ${
                      catFilter === c
                        ? "bg-amber-500 text-slate-900"
                        : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                    }`}
                    data-testid={`${dataTestidPrefix}-cat-${c}`}
                  >
                    {c === "all" ? `Toutes (${products.length})` : c}
                  </button>
                ))}
              </div>
            </div>

            {/* Empty state */}
            {filtered.length === 0 ? (
              <div className="text-center py-4 text-slate-500 text-sm">
                {products.length === 0
                  ? "Catalogue vide. Cliquez sur « Importer les produits par défaut » au-dessus."
                  : "Aucun produit ne correspond à votre recherche"}
              </div>
            ) : (
              <div className="max-h-[280px] overflow-y-auto space-y-2 pr-1">
                {Object.entries(grouped).map(([cat, items]) => (
                  <div key={cat}>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1 sticky top-0 bg-slate-800/95 py-1">
                      {cat} <span className="text-slate-600">·  {items.length}</span>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          onClick={() => onPick && onPick(p)}
                          className="bg-slate-700/60 hover:bg-amber-500/30 hover:text-amber-100 text-slate-200 text-xs px-2 py-1 rounded border border-slate-600 hover:border-amber-400 transition group flex items-center gap-1"
                          title={`Ajouter ${p.name} — ${fmt(p.unit_cost)} F / ${p.unit || "u"}`}
                          data-testid={`${dataTestidPrefix}-item-${p.id}`}
                        >
                          <span className="font-medium">{p.name}</span>
                          <span className="text-amber-300 group-hover:text-amber-100 font-bold text-[10px]">
                            {fmt(p.unit_cost)} F
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default QuickProductPicker;
