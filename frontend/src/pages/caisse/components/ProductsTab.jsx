/**
 * ProductsTab - Gestion des produits par département
 * Liste des produits regroupés par département. Add/Edit/Delete réservés au Manager/Admin.
 */
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit2, Trash2, Link2, Link2Off } from 'lucide-react';

const formatPrice = (p) => new Intl.NumberFormat('fr-FR').format(p || 0);

const ProductsTab = ({
  catalog = {},
  departmentConfig = {},
  canManage = false,
  onAddProduct,
  onEditProduct,
  onDeleteProduct,
  onLinkStock,
}) => (
  <div className="space-y-4" data-testid="products-tab">
    <div className="flex justify-between items-center">
      <h2 className="text-xl font-bold text-white">Gestion des produits</h2>
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

    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {Object.entries(departmentConfig).map(([dept, config]) => {
        const Icon = config.icon;
        const deptProducts = catalog[dept] || [];
        return (
          <Card key={dept} className={`bg-slate-800/50 ${config.borderColor} border`}>
            <CardHeader className="py-3">
              <CardTitle className={`${config.color} flex items-center gap-2`}>
                <Icon className="w-5 h-5" />
                {config.label} ({deptProducts.length})
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
                <p className="text-slate-500 text-center py-4 text-sm">Aucun produit</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  </div>
);

export default ProductsTab;
