/**
 * ProductsTab - Gestion des produits par département
 * Liste des produits regroupés par département. Add/Edit/Delete réservés au Manager/Admin.
 */
import React, { useState, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit2, Trash2, Link2, Link2Off, Wand2, Filter } from 'lucide-react';
import PendingProductsPanel from "./PendingProductsPanel";
import PromoVacancesAdminToggle from "./PromoVacancesAdminToggle";
import PromoOrdersDashboard from "./PromoOrdersDashboard";
import CaisseThresholdsAdminCard from "./CaisseThresholdsAdminCard";

const formatPrice = (p) => new Intl.NumberFormat('fr-FR').format(p || 0);
const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ProductsTab = ({
  catalog = {},
  departmentConfig = {},
  canManage = false,
  isAdmin = false,
  currentUserName = "",
  onAddProduct,
  onEditProduct,
  onDeleteProduct,
  onLinkStock,
  onMultiLinkStock,
  onProductsRefresh,
}) => {
  const [showOnlyUnlinked, setShowOnlyUnlinked] = useState(false);
  const [autoLinking, setAutoLinking] = useState(false);

  // Compute counters across all departments
  const { totalProducts, linkedCount, unlinkedCount } = useMemo(() => {
    let total = 0, linked = 0;
    Object.values(catalog).forEach((arr) => {
      (arr || []).forEach((p) => {
        total += 1;
        if (p.stock_product_id) linked += 1;
      });
    });
    return { totalProducts: total, linkedCount: linked, unlinkedCount: total - linked };
  }, [catalog]);

  const handleAutoLink = async () => {
    if (!window.confirm(
      `Lier automatiquement tous les produits Caisse non liés au produit Stock le mieux correspondant (par mots-clés : poulet, poisson, frite, riz, agneau, etc.) ?\n\n` +
      `${unlinkedCount} produit(s) à analyser. Les liaisons seront appliquées immédiatement.\n\n` +
      `Une fois lié, chaque vente déstocke automatiquement le produit (sans passer par les recettes).`
    )) return;
    setAutoLinking(true);
    try {
      // Use smart-link (keyword-based) as primary strategy.
      const { data } = await axios.post(`${API}/caisse/products/smart-link-to-stock`);
      const lines = [
        `📊 ${data.scanned} produit(s) Caisse analysés :`,
        `  ✓ ${data.linked_count} liaison(s) créée(s) par mot-clé`,
        `  ✗ ${data.no_match_count} sans correspondance (composés, salades, sauces locales…)`,
        data.already_linked > 0 ? `  • ${data.already_linked} déjà liés` : null,
      ].filter(Boolean).join('\n');
      toast.success("Liaison automatique terminée", { description: lines });
      if (onProductsRefresh) await onProductsRefresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur lors de la liaison automatique");
    } finally {
      setAutoLinking(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="products-tab">
      {isAdmin && (
        <PendingProductsPanel actorName={currentUserName || "Admin"} onChange={onProductsRefresh} />
      )}
      {isAdmin && (
        <PromoVacancesAdminToggle actorName={currentUserName || "Admin"} />
      )}
      {isAdmin && (
        <CaisseThresholdsAdminCard actorName={currentUserName || "Admin"} />
      )}
      {isAdmin && (
        <PromoOrdersDashboard />
      )}
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-white">Gestion des produits</h2>
          {totalProducts > 0 && (
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <Badge className={`${linkedCount === totalProducts ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'} border border-current/30`}
                     data-testid="link-counter-badge">
                <Link2 className="w-3 h-3 mr-1" />
                {linkedCount}/{totalProducts} liés au stock
              </Badge>
              {unlinkedCount > 0 && (
                <Badge className="bg-slate-700/50 text-slate-300 cursor-pointer hover:bg-slate-600/50"
                       onClick={() => setShowOnlyUnlinked((v) => !v)}
                       data-testid="filter-unlinked-toggle">
                  <Filter className="w-3 h-3 mr-1" />
                  {showOnlyUnlinked ? 'Voir tous' : `Voir uniquement les ${unlinkedCount} non liés`}
                </Badge>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {canManage && unlinkedCount > 0 && (
            <Button
              onClick={handleAutoLink}
              disabled={autoLinking}
              className="bg-amber-600 hover:bg-amber-700"
              data-testid="auto-link-btn"
              title="Trouve automatiquement la meilleure correspondance Stock pour chaque produit Caisse non lié (similarité ≥ 80%)"
            >
              <Wand2 className="w-4 h-4 mr-2" />
              {autoLinking ? "Liaison…" : "🔗 Lier automatiquement"}
            </Button>
          )}
          {canManage && onMultiLinkStock && (
            <Button
              onClick={onMultiLinkStock}
              variant="outline"
              className="border-violet-500/60 text-violet-300 hover:bg-violet-500/10"
              data-testid="multi-link-btn"
              title="Lier plusieurs produits Caisse au même produit Stock en une action"
            >
              <Link2 className="w-4 h-4 mr-2" />
              Liaison multiple
            </Button>
          )}
          {canManage && (
            <Button
              onClick={onAddProduct}
              className="bg-purple-500 hover:bg-purple-600"
              data-testid="add-product-btn"
            >
              <Plus className="w-4 h-4 mr-2" />
              Ajouter un produit
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(departmentConfig).map(([dept, config]) => {
          const Icon = config.icon;
          const allDeptProducts = catalog[dept] || [];
          const deptProducts = showOnlyUnlinked
            ? allDeptProducts.filter((p) => !p.stock_product_id)
            : allDeptProducts;
          return (
            <Card key={dept} className={`bg-slate-800/50 ${config.borderColor} border`}>
              <CardHeader className="py-3">
                <CardTitle className={`${config.color} flex items-center gap-2`}>
                  <Icon className="w-5 h-5" />
                  {config.label} ({deptProducts.length}{showOnlyUnlinked && allDeptProducts.length !== deptProducts.length ? `/${allDeptProducts.length}` : ''})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-96 overflow-y-auto">
                {deptProducts.map((product, idx) => {
                  const isLinked = !!product.stock_product_id;
                  return (
                    <div
                      key={`${dept}-${product.id}-${idx}`}
                      className="flex items-center justify-between bg-slate-700/30 rounded-lg p-2"
                      data-testid={`caisse-product-row-${product.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate flex items-center gap-1">
                          {product.name}
                          {isLinked && <Link2 className="w-3 h-3 text-emerald-400 shrink-0" title="Lié au stock — décrément auto à la vente" />}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-slate-400 text-xs">
                            {formatPrice(product.price)} F/{product.unit}
                          </p>
                          {product.category && (
                            <Badge className="bg-slate-600/50 text-slate-300 text-xs">
                              {product.category}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {canManage && (
                        <div className="flex gap-1 ml-2">
                          {onLinkStock && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => onLinkStock(product, dept)}
                              className={`w-7 h-7 ${isLinked ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20' : 'text-slate-400 hover:text-violet-300 hover:bg-violet-500/20'}`}
                              data-testid={`link-stock-${product.id}`}
                              title={isLinked ? "Produit lié au stock" : "Lier au stock"}
                            >
                              {isLinked ? <Link2 className="w-3 h-3" /> : <Link2Off className="w-3 h-3" />}
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => onEditProduct(product, dept)}
                            className="w-7 h-7 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20"
                            data-testid={`edit-product-${product.id}`}
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => onDeleteProduct(product.id)}
                            className="w-7 h-7 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                            data-testid={`delete-product-${product.id}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {deptProducts.length === 0 && (
                  <p className="text-slate-500 text-center py-4 text-sm">
                    {showOnlyUnlinked ? "Tous les produits sont liés ✓" : "Aucun produit"}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default ProductsTab;
