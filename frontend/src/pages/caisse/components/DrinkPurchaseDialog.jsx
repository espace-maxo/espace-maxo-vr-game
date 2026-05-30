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
import { Plus, Trash2, Wine, Search, Sparkles } from "lucide-react";
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
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([
    { stock_product_id: "", quantity: 1, unit_price: 0 },
  ]);

  // === Sous-modale : créer une nouvelle boisson à la volée ===
  const [createForLine, setCreateForLine] = useState(null); // index de la ligne
  const [creating, setCreating] = useState(false);
  const [newDrink, setNewDrink] = useState({
    name: "", category_id: "", unit: "bouteille",
    purchase_price: 0, sale_price: 0, stock_min: 12, stock_max: 240,
  });

  const reloadProducts = async () => {
    try {
      const r = await axios.get(`${API}/stock/drinks-products`);
      setProducts(r.data.products || []);
      return r.data.products || [];
    } catch {
      toast.error("Impossible de charger les boissons");
      return [];
    }
  };

  useEffect(() => {
    if (!open) return;
    reloadProducts();
    axios.get(`${API}/stock/categories`).then(r => {
      // Garder uniquement les catégories de type Boissons/Bar
      const cats = (r.data.categories || r.data || []).filter(c => {
        const n = (c.name || "").toLowerCase();
        return n.includes("boisson") || n.includes("bar") || n.includes("cocktail");
      });
      setCategories(cats);
      if (cats.length > 0 && !newDrink.category_id) {
        setNewDrink(p => ({ ...p, category_id: cats[0].id }));
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const openCreateDrink = (lineIdx) => {
    setCreateForLine(lineIdx);
    setNewDrink({
      name: search || "",  // pré-remplit avec le filtre courant
      category_id: categories[0]?.id || "",
      unit: "bouteille", purchase_price: 0, sale_price: 0, stock_min: 12, stock_max: 240,
    });
  };

  const submitNewDrink = async () => {
    if (!newDrink.name.trim()) { toast.error("Nom requis"); return; }
    if (!newDrink.category_id) { toast.error("Catégorie requise"); return; }
    setCreating(true);
    try {
      const r = await axios.post(`${API}/stock/products`, {
        name: newDrink.name.trim(),
        category_id: newDrink.category_id,
        unit: newDrink.unit || "bouteille",
        quantity: 0,
        purchase_price: parseFloat(newDrink.purchase_price || 0),
        sale_price: parseFloat(newDrink.sale_price || 0),
        stock_min: parseFloat(newDrink.stock_min || 0),
        stock_max: parseFloat(newDrink.stock_max || 0),
      });
      const newId = r.data?.product?.id;
      if (newId) {
        const refreshed = await reloadProducts();
        // Auto-select dans la ligne d'origine
        if (createForLine !== null) {
          const px = refreshed.find(pp => pp.id === newId);
          setLines(prev => {
            const next = [...prev];
            next[createForLine] = {
              ...next[createForLine],
              stock_product_id: newId,
              unit_price: px?.purchase_price || parseFloat(newDrink.purchase_price || 0),
            };
            return next;
          });
        }
        toast.success(`Boisson "${newDrink.name}" créée et ajoutée à votre achat`);
        setCreateForLine(null);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur lors de la création de la boisson");
    } finally {
      setCreating(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return products;
    return products.filter(p => p.name.toLowerCase().includes(s));
  }, [products, search]);

  const totalAmount = useMemo(() =>
    lines.reduce((sum, l) => sum + (parseFloat(l.quantity || 0) * parseFloat(l.unit_price || 0)), 0),
    [lines]
  );

  const addLine = () => setLines([...lines, { stock_product_id: "", quantity: 1, unit_price: 0, case_qty: 24, case_total: 0, show_case: false }]);
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

  // Toggle "Calculateur par casier" pour une ligne donnée
  const toggleCaseCalc = (idx) => {
    setLines(prev => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        show_case: !next[idx].show_case,
        case_qty: next[idx].case_qty || 24,
        case_total: next[idx].case_total || 0,
      };
      return next;
    });
  };

  // Recalcule le P.U. à partir du total casier / nb bouteilles dans le casier.
  // Met aussi à jour la quantité totale = nb_casiers × bottles_per_case si l'utilisateur
  // a indiqué un nombre de casiers (champ case_count, optionnel).
  const recomputeFromCase = (idx, patch) => {
    setLines(prev => {
      const next = [...prev];
      const merged = { ...next[idx], ...patch };
      const caseQty = parseFloat(merged.case_qty || 0);
      const caseTotal = parseFloat(merged.case_total || 0);
      if (caseQty > 0 && caseTotal > 0) {
        merged.unit_price = +(caseTotal / caseQty).toFixed(2);
      }
      // Si l'utilisateur a indiqué un nombre de casiers, calcule la quantité totale
      const caseCount = parseFloat(merged.case_count || 0);
      if (caseCount > 0 && caseQty > 0) {
        merged.quantity = caseCount * caseQty;
      }
      next[idx] = merged;
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
        requested_by: currentUser?.full_name || currentUser?.username || "Responsable Op. & Log",
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
          <DialogTitle className="text-white flex items-center gap-2 flex-wrap">
            <Wine className="w-5 h-5 text-orange-400" />
            Achat Boissons — liaison directe au stock
            <Button
              size="sm"
              onClick={() => openCreateDrink(lines.length - 1)}
              className="ml-auto bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"
              data-testid="drinks-header-create-new"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1" /> Nouvelle boisson
            </Button>
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
            {search.trim() && filteredProducts.length === 0 && (
              <div className="mt-2 bg-emerald-900/20 border border-emerald-500/40 rounded-lg p-2.5 flex items-center justify-between gap-2 flex-wrap" data-testid="drinks-no-results-hint">
                <span className="text-emerald-300 text-xs">
                  Aucune boisson nommée <strong>« {search} »</strong>. Créez-la directement :
                </span>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-xs"
                  onClick={() => openCreateDrink(lines.length - 1)}
                  data-testid="drinks-create-from-search"
                >
                  <Sparkles className="w-3 h-3 mr-1" /> Créer « {search} »
                </Button>
              </div>
            )}
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
                      <div className="flex gap-1">
                        <select
                          value={line.stock_product_id}
                          onChange={(e) => updateLine(idx, { stock_product_id: e.target.value })}
                          className="flex-1 bg-slate-900 border border-slate-600 text-white rounded h-9 px-2 text-sm"
                          data-testid={`drinks-select-${idx}`}
                        >
                          <option value="">— Sélectionner —</option>
                          {filteredProducts.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.name} (stock: {p.quantity} {p.unit})
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openCreateDrink(idx)}
                          className="border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10 h-9 px-2"
                          title="Créer une nouvelle boisson"
                          data-testid={`drinks-create-new-${idx}`}
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                        </Button>
                      </div>
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
                    <div className="mt-2 flex gap-2 flex-wrap text-[10px] items-center">
                      <Badge className="bg-slate-700/40 text-slate-300">Stock actuel : {product.quantity} {product.unit}</Badge>
                      <Badge className="bg-slate-700/40 text-slate-300">Prix d'achat ref : {formatPrice(product.purchase_price)} F</Badge>
                      <Badge className="bg-cyan-500/20 text-cyan-300">Nouveau stock : {Number(product.quantity) + parseFloat(line.quantity || 0)} {product.unit}</Badge>
                      <button
                        type="button"
                        onClick={() => toggleCaseCalc(idx)}
                        className={`ml-auto text-[10px] px-2 py-0.5 rounded border ${line.show_case ? 'bg-amber-500/20 text-amber-300 border-amber-500/50' : 'bg-slate-700/40 text-slate-300 border-slate-600 hover:border-amber-500/40'}`}
                        data-testid={`drinks-case-toggle-${idx}`}
                      >
                        🍱 Calculateur par casier
                      </button>
                    </div>
                  )}
                  {/* Calculateur par casier */}
                  {line.show_case && (
                    <div className="mt-2 bg-amber-900/10 border border-amber-500/30 rounded-lg p-3" data-testid={`drinks-case-calc-${idx}`}>
                      <p className="text-amber-300 text-[11px] font-semibold mb-2 flex items-center gap-1">
                        🍱 Saisissez le casier → P.U. calculé automatiquement
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                        <div>
                          <Label className="text-slate-400 text-[10px] uppercase">Nb casiers</Label>
                          <Input
                            type="number" min="0" placeholder="1"
                            value={line.case_count || ""}
                            onChange={(e) => recomputeFromCase(idx, { case_count: e.target.value })}
                            className="bg-slate-900 border-slate-600 text-white h-8 text-sm"
                            data-testid={`drinks-case-count-${idx}`}
                          />
                        </div>
                        <div>
                          <Label className="text-slate-400 text-[10px] uppercase">Bout./casier</Label>
                          <Input
                            type="number" min="1" placeholder="24"
                            value={line.case_qty || ""}
                            onChange={(e) => recomputeFromCase(idx, { case_qty: e.target.value })}
                            className="bg-slate-900 border-slate-600 text-white h-8 text-sm"
                            data-testid={`drinks-case-qty-${idx}`}
                          />
                        </div>
                        <div>
                          <Label className="text-slate-400 text-[10px] uppercase">Prix total casier (F)</Label>
                          <Input
                            type="number" min="0" placeholder="ex: 7200"
                            value={line.case_total || ""}
                            onChange={(e) => recomputeFromCase(idx, { case_total: e.target.value })}
                            className="bg-slate-900 border-slate-600 text-white h-8 text-sm"
                            data-testid={`drinks-case-total-${idx}`}
                          />
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-400 uppercase">P.U. calculé</p>
                          <p className="text-amber-400 font-bold text-base" data-testid={`drinks-case-pu-${idx}`}>
                            {formatPrice(line.unit_price || 0)} F
                          </p>
                        </div>
                      </div>
                      {parseFloat(line.case_count || 0) > 0 && parseFloat(line.case_qty || 0) > 0 && (
                        <p className="text-cyan-300 text-[11px] mt-2">
                          → {line.case_count} casier(s) × {line.case_qty} bouteilles = <strong>{parseFloat(line.case_count) * parseFloat(line.case_qty)} bouteilles au total</strong>
                          {' '}({formatPrice(parseFloat(line.case_total || 0) * parseFloat(line.case_count || 0))} F au total)
                        </p>
                      )}
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

      {/* ===== Sous-modale : Création d'une nouvelle boisson ===== */}
      <Dialog open={createForLine !== null} onOpenChange={(o) => !o && setCreateForLine(null)}>
        <DialogContent className="bg-slate-900 border-emerald-500/40 max-w-md" data-testid="new-drink-dialog">
          <DialogHeader>
            <DialogTitle className="text-emerald-300 flex items-center gap-2">
              <Sparkles className="w-5 h-5" /> Nouvelle boisson
            </DialogTitle>
            <p className="text-slate-400 text-xs">Elle sera ajoutée au Stock et automatiquement sélectionnée dans votre achat.</p>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-slate-300 text-xs">Nom *</Label>
              <Input value={newDrink.name} onChange={(e) => setNewDrink(p => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Heineken 33cl" className="bg-slate-800 border-slate-600 text-white mt-1"
                data-testid="new-drink-name" autoFocus />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Catégorie *</Label>
              <select value={newDrink.category_id} onChange={(e) => setNewDrink(p => ({ ...p, category_id: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 text-white rounded h-9 px-2 mt-1 text-sm"
                data-testid="new-drink-category">
                <option value="">— Choisir —</option>
                {categories.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-slate-300 text-xs">Unité</Label>
                <select value={newDrink.unit} onChange={(e) => setNewDrink(p => ({ ...p, unit: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 text-white rounded h-9 px-2 mt-1 text-sm"
                  data-testid="new-drink-unit">
                  <option value="bouteille">bouteille</option>
                  <option value="canette">canette</option>
                  <option value="brique">brique</option>
                  <option value="L">L (litre)</option>
                  <option value="cl">cl</option>
                </select>
              </div>
              <div>
                <Label className="text-slate-300 text-xs">Prix d'achat (F)</Label>
                <Input type="number" min="0" value={newDrink.purchase_price}
                  onChange={(e) => setNewDrink(p => ({ ...p, purchase_price: e.target.value }))}
                  className="bg-slate-800 border-slate-600 text-white mt-1"
                  data-testid="new-drink-purchase-price" />
              </div>
              <div>
                <Label className="text-slate-300 text-xs">Prix de vente (F)</Label>
                <Input type="number" min="0" value={newDrink.sale_price}
                  onChange={(e) => setNewDrink(p => ({ ...p, sale_price: e.target.value }))}
                  className="bg-slate-800 border-slate-600 text-white mt-1"
                  data-testid="new-drink-sale-price" />
              </div>
              <div>
                <Label className="text-slate-300 text-xs">Stock min (alerte)</Label>
                <Input type="number" min="0" value={newDrink.stock_min}
                  onChange={(e) => setNewDrink(p => ({ ...p, stock_min: e.target.value }))}
                  className="bg-slate-800 border-slate-600 text-white mt-1"
                  data-testid="new-drink-stock-min" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateForLine(null)} className="border-slate-600 text-slate-300">
              Annuler
            </Button>
            <Button onClick={submitNewDrink} disabled={creating || !newDrink.name.trim() || !newDrink.category_id}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="new-drink-submit">
              <Sparkles className="w-4 h-4 mr-1" />
              {creating ? "Création..." : "Créer & ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
