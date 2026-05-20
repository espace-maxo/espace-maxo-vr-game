/**
 * DrinkPurchaseDialog
 * Formulaire dédié pour l'achat de boissons avec rattachement DIRECT au stock par id.
 * - Liste déroulante des produits Boissons (depuis /api/stock/drinks-products)
 * - Multi-lignes
 * - Saisie : quantité TOTALE de bouteilles (4b) + prix unitaire
 * - À la création : statut "pending". Une fois validé (status=completed) ou via
 *   "Recevoir en stock", la quantité est ajoutée directement au stock.
 */
import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { Plus, Trash2, Wine, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatPrice = (n) => Number(n || 0).toLocaleString("fr-FR");

export default function DrinkPurchaseDialog({ open, onClose, currentUser, onCreated }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([
    { stock_product_id: "", quantity: 1, unit_price: 0 },
  ]);

  useEffect(() => {
    if (!open) return;
    axios.get(`${API}/stock/drinks-products`)
      .then(r => setProducts(r.data.products || []))
      .catch(() => toast.error("Impossible de charger les boissons"));
  }, [open]);

  const filteredProducts = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return products;
    return products.filter(p => p.name.toLowerCase().includes(s));
  }, [products, search]);

  const totalAmount = useMemo(() =>
    lines.reduce((sum, l) => sum + (parseFloat(l.quantity || 0) * parseFloat(l.unit_price || 0)), 0),
    [lines]
  );

  const addLine = () => setLines([...lines, { stock_product_id: "", quantity: 1, unit_price: 0 }]);
  const removeLine = (idx) => setLines(lines.filter((_, i) => i !== idx));
  const updateLine = (idx, patch) => {
    setLines(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      // Si on sélectionne un produit, pré-remplir le prix d'achat
      if (patch.stock_product_id !== undefined) {
        const p = products.find(pp => pp.id === patch.stock_product_id);
        if (p && (!next[idx].unit_price || next[idx].unit_price === 0)) {
          next[idx].unit_price = p.purchase_price || 0;
        }
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    const valid = lines.filter(l => l.stock_product_id && parseFloat(l.quantity || 0) > 0);
    if (valid.length === 0) {
      toast.error("Ajoutez au moins une boisson");
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${API}/expenses/drinks`, {
        items: valid.map(l => ({
          stock_product_id: l.stock_product_id,
          quantity: parseFloat(l.quantity),
          unit_price: parseFloat(l.unit_price || 0),
        })),
        supplier: supplier,
        requested_by: currentUser?.full_name || currentUser?.username || "Gérante",
        notes: notes,
      });
      if (res.data?.success) {
        toast.success(`Achat boissons créé : ${formatPrice(res.data.expense.amount)} F`);
        if (onCreated) onCreated(res.data.expense);
        // Reset
        setLines([{ stock_product_id: "", quantity: 1, unit_price: 0 }]);
        setSupplier("");
        setNotes("");
        onClose();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur lors de la création");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="drinks-purchase-dialog">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Wine className="w-5 h-5 text-orange-400" />
            Achat Boissons — liaison directe au stock
          </DialogTitle>
          <p className="text-slate-400 text-xs mt-1">
            Les boissons sont rattachées au stock par leur identifiant. Une fois validé, les bouteilles sont automatiquement ajoutées.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Fournisseur */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300 text-sm">Fournisseur</Label>
              <Input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Ex: SOBEBRA, Distributeur Castel..."
                className="bg-slate-800 border-slate-600 text-white mt-1"
                data-testid="drinks-supplier"
              />
            </div>
            <div>
              <Label className="text-slate-300 text-sm">Notes (optionnel)</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observations..."
                className="bg-slate-800 border-slate-600 text-white mt-1"
                data-testid="drinks-notes"
              />
            </div>
          </div>

          {/* Recherche */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrer la liste des boissons..."
              className="bg-slate-800 border-slate-600 text-white pl-9"
              data-testid="drinks-search"
            />
          </div>

          {/* Lignes */}
          <div className="space-y-2">
            {lines.map((line, idx) => {
              const product = products.find(p => p.id === line.stock_product_id);
              const subtotal = parseFloat(line.quantity || 0) * parseFloat(line.unit_price || 0);
              return (
                <div key={idx} className="bg-slate-800/60 border border-slate-700 rounded-lg p-3" data-testid={`drinks-line-${idx}`}>
                  <div className="grid grid-cols-12 gap-2 items-end">
                    {/* Produit */}
                    <div className="col-span-12 md:col-span-5">
                      <Label className="text-slate-400 text-[10px] uppercase">Boisson</Label>
                      <select
                        value={line.stock_product_id}
                        onChange={(e) => updateLine(idx, { stock_product_id: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-600 text-white rounded h-9 px-2 text-sm"
                        data-testid={`drinks-select-${idx}`}
                      >
                        <option value="">— Sélectionner —</option>
                        {filteredProducts.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} (stock: {p.quantity} {p.unit})
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* Quantité */}
                    <div className="col-span-5 md:col-span-2">
                      <Label className="text-slate-400 text-[10px] uppercase">Bouteilles</Label>
                      <Input
                        type="number"
                        min="0"
                        value={line.quantity}
                        onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                        className="bg-slate-900 border-slate-600 text-white h-9"
                        data-testid={`drinks-qty-${idx}`}
                      />
                    </div>
                    {/* Prix unitaire */}
                    <div className="col-span-5 md:col-span-2">
                      <Label className="text-slate-400 text-[10px] uppercase">P.U. (F)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={line.unit_price}
                        onChange={(e) => updateLine(idx, { unit_price: e.target.value })}
                        className="bg-slate-900 border-slate-600 text-white h-9"
                        data-testid={`drinks-pu-${idx}`}
                      />
                    </div>
                    {/* Sous-total */}
                    <div className="col-span-2 md:col-span-2 text-right">
                      <p className="text-[10px] text-slate-500 uppercase">Sous-total</p>
                      <p className="text-orange-400 font-bold text-sm h-9 flex items-center justify-end">
                        {formatPrice(subtotal)} F
                      </p>
                    </div>
                    {/* Bouton suppression */}
                    <div className="col-span-12 md:col-span-1 flex justify-end">
                      {lines.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLine(idx)}
                          className="h-9 w-9 text-red-400 hover:bg-red-500/10"
                          data-testid={`drinks-remove-${idx}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {product && (
                    <div className="mt-2 flex gap-2 flex-wrap text-[10px]">
                      <Badge className="bg-slate-700/40 text-slate-300">Stock actuel : {product.quantity} {product.unit}</Badge>
                      <Badge className="bg-slate-700/40 text-slate-300">Prix d'achat ref : {formatPrice(product.purchase_price)} F</Badge>
                      <Badge className="bg-cyan-500/20 text-cyan-300">Nouveau stock : {Number(product.quantity) + parseFloat(line.quantity || 0)} {product.unit}</Badge>
                    </div>
                  )}
                </div>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              onClick={addLine}
              className="border-orange-500/50 text-orange-300 hover:bg-orange-500/10"
              data-testid="drinks-add-line"
            >
              <Plus className="w-4 h-4 mr-1" /> Ajouter une boisson
            </Button>
          </div>

          {/* Total */}
          <div className="bg-gradient-to-r from-orange-900/30 to-amber-900/20 border-2 border-orange-500/40 rounded-lg p-4 flex items-center justify-between">
            <span className="text-orange-300 font-bold">TOTAL ACHAT</span>
            <span className="text-orange-400 font-bold text-2xl" data-testid="drinks-total">{formatPrice(totalAmount)} F</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-slate-600 text-slate-300">
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || totalAmount <= 0}
            className="bg-orange-600 hover:bg-orange-700 text-white"
            data-testid="drinks-submit"
          >
            <Wine className="w-4 h-4 mr-1" />
            {loading ? "Création..." : "Créer l'achat boissons"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
