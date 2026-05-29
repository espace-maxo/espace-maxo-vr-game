/**
 * RegularizationModal — Modal pour créer un bon rétroactif ou modifier la date d'un bon existant.
 *
 * Modes :
 *   - mode="create" : nouveau bon à date passée (Admin + Resp. Op.)
 *   - mode="update-date" : modifier la date d'un bon existant (Admin uniquement)
 *
 * Props :
 *   - open, onClose
 *   - mode : "create" | "update-date"
 *   - currentUser : {id, full_name, username, role}
 *   - existingInvoice (uniquement mode="update-date")
 *   - products : catalogue produits (pour ajouter des items en mode "create")
 *   - onSuccess(invoice) : callback
 */
import React, { useState, useMemo, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { format, subDays, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CalendarClock, AlertTriangle, Plus, Minus, Trash2, Check, Lock, Search } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const MAX_BACKDATE_DAYS = 7;

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtPrice = (n) => Math.round(Number(n || 0)).toLocaleString("fr-FR");

const RegularizationModal = ({ open, onClose, mode, currentUser, existingInvoice, products, onSuccess }) => {
  const isUpdateMode = mode === "update-date";
  const isAdmin = currentUser?.role === "admin";

  // Form state
  const minDate = format(subDays(new Date(), MAX_BACKDATE_DAYS), "yyyy-MM-dd");
  const [targetDate, setTargetDate] = useState(format(subDays(new Date(), 1), "yyyy-MM-dd"));
  const [imputeCaTo, setImputeCaTo] = useState("target_date"); // ou "today"
  const [reason, setReason] = useState("");
  const [confirmPostClosure, setConfirmPostClosure] = useState(false);
  const [items, setItems] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [customerName, setCustomerName] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  // Reset when re-opening
  useEffect(() => {
    if (!open) return;
    if (isUpdateMode && existingInvoice) {
      setTargetDate((existingInvoice.created_at || todayStr()).slice(0, 10));
    } else {
      setTargetDate(format(subDays(new Date(), 1), "yyyy-MM-dd"));
    }
    setReason("");
    setConfirmPostClosure(false);
    setProductSearch("");
    setActiveCategory("all");
    if (!isUpdateMode) {
      setItems([]);
      setPaymentMethod("cash");
      setCustomerName("");
      setTableNumber("");
    }
  }, [open, isUpdateMode, existingInvoice]);

  // ── Items management (create mode) ──
  const addItem = (product) => {
    setItems((arr) => {
      const idx = arr.findIndex((i) => i.product_id === product.id);
      if (idx !== -1) {
        const copy = [...arr];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + 1 };
        return copy;
      }
      return [...arr, {
        product_id: product.id,
        name: product.name,
        price: product.price,
        quantity: 1,
        department: product.department || product.category || "",
      }];
    });
  };
  const removeItem = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i));
  const updateQty = (i, qty) => {
    const q = Math.max(1, parseInt(qty || 1, 10));
    setItems((arr) => arr.map((it, idx) => idx === i ? { ...it, quantity: q } : it));
  };

  const subtotal = useMemo(() => items.reduce((s, it) => s + (Number(it.price) * Number(it.quantity)), 0), [items]);
  const totalsByDept = useMemo(() => {
    const m = {};
    items.forEach((it) => {
      const d = it.department || "autres";
      m[d] = (m[d] || 0) + (Number(it.price) * Number(it.quantity));
    });
    return m;
  }, [items]);

  // Catalogue : catégories et liste filtrée
  const categories = useMemo(() => {
    const set = new Set();
    (products || []).forEach((p) => {
      const c = p.category || p.department || "Autres";
      if (c) set.add(c);
    });
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b, "fr"))];
  }, [products]);

  const filteredProducts = useMemo(() => {
    let arr = products || [];
    if (activeCategory !== "all") {
      arr = arr.filter((p) => (p.category || p.department || "Autres") === activeCategory);
    }
    const q = productSearch.trim().toLowerCase();
    if (q) {
      arr = arr.filter((p) =>
        (p.name || "").toLowerCase().includes(q)
        || (p.category || "").toLowerCase().includes(q)
        || (p.department || "").toLowerCase().includes(q)
      );
    }
    return arr;
  }, [products, activeCategory, productSearch]);

  // Block update-date if current user is not admin (after all hooks)
  if (isUpdateMode && !isAdmin) {
    return null;
  }

  // ── Submit ──
  const handleSubmit = async () => {
    if (reason.trim().length < 3) {
      toast.error("Le motif est obligatoire (minimum 3 caractères)");
      return;
    }
    if (!isUpdateMode && items.length === 0) {
      toast.error("Ajoutez au moins un article au bon");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        regularization_reason: reason.trim(),
        confirm_post_closure: confirmPostClosure,
        impute_ca_to: imputeCaTo,
        actor_name: currentUser.full_name || currentUser.username,
        actor_role: currentUser.role,
      };
      let res;
      if (isUpdateMode) {
        payload.new_target_date = targetDate;
        res = await axios.patch(
          `${API}/regularization/update-invoice-date/${existingInvoice.id}`,
          payload,
        );
      } else {
        Object.assign(payload, {
          target_date: targetDate,
          items,
          subtotal,
          discount: 0,
          discount_amount: 0,
          total: subtotal,
          payment_method: paymentMethod,
          customer_name: customerName,
          table_number: tableNumber ? parseInt(tableNumber, 10) : null,
          totals_by_department: totalsByDept,
          validation_status: "validated",
        });
        res = await axios.post(`${API}/regularization/create-invoice`, payload);
      }
      toast.success(isUpdateMode ? "Date du bon mise à jour" : `Bon régularisé ${res.data.invoice.invoice_number}`);
      if (res.data.warnings?.length) {
        res.data.warnings.forEach((w) => toast.warning(w));
      }
      onSuccess?.(res.data.invoice);
      onClose();
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (e.response?.status === 423) {
        toast.error(detail || "Journée clôturée — cochez la confirmation post-clôture");
      } else {
        toast.error(detail || "Erreur lors de la régularisation");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-3xl bg-slate-900 border-slate-700 text-white max-h-[92vh] overflow-y-auto"
        data-testid="regularization-modal"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-300">
            <CalendarClock className="w-5 h-5" />
            {isUpdateMode
              ? "Modifier la date d'un bon existant"
              : "Régulariser un bon (date antérieure)"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Bandeau d'info */}
          <div className="rounded bg-amber-900/20 border border-amber-500/30 p-2.5 text-xs text-amber-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              {isUpdateMode ? (
                <p>Vous allez modifier la date d'imputation du bon <strong>#{existingInvoice?.invoice_number}</strong> ({fmtPrice(existingInvoice?.total)} F).</p>
              ) : (
                <p>Création d'un bon rétroactif. Date autorisée : <strong>{minDate} → {todayStr()}</strong> (7 derniers jours).</p>
              )}
              <p className="mt-1">Cette opération est <strong>tracée dans l'audit</strong>. Si la journée cible est clôturée (Z imprimé), cochez la confirmation post-clôture.</p>
            </div>
          </div>

          {/* Date cible + imputation CA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-400 mb-1 block">Date {isUpdateMode ? "cible" : "du bon"}</Label>
              <Input
                type="date"
                min={minDate}
                max={todayStr()}
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
                data-testid="regul-target-date"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-400 mb-1 block">Imputer le CA</Label>
              <Select value={imputeCaTo} onValueChange={setImputeCaTo}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white" data-testid="regul-impute-ca">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 text-white border-slate-700">
                  <SelectItem value="target_date">À la date du bon (rétroactif)</SelectItem>
                  <SelectItem value="today">À aujourd'hui (mention "Régularisation du …")</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Items pour mode CREATE */}
          {!isUpdateMode && (
            <div className="space-y-2">
              <Label className="text-xs text-slate-400">Articles du bon</Label>

              {/* Items sélectionnés */}
              {items.length === 0 ? (
                <p className="text-xs text-slate-500 italic">Aucun article. Cliquez sur un produit ci-dessous pour l'ajouter.</p>
              ) : (
                <div className="space-y-1 max-h-32 overflow-y-auto" data-testid="regul-selected-items">
                  {items.map((it, i) => (
                    <div key={i} className="flex items-center gap-2 bg-slate-800/60 rounded px-2 py-1 text-xs">
                      <span className="flex-1 truncate text-slate-200">{it.name}</span>
                      <Badge className="bg-slate-700 text-slate-300 text-[9px]">{it.department || it.category || "autres"}</Badge>
                      <Button
                        type="button" variant="ghost" size="icon"
                        className="h-6 w-6 text-slate-300 hover:bg-slate-700"
                        onClick={() => updateQty(i, Math.max(1, it.quantity - 1))}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        value={it.quantity}
                        onChange={(e) => updateQty(i, e.target.value)}
                        className="w-14 h-7 text-xs bg-slate-700 border-slate-600 text-white"
                      />
                      <Button
                        type="button" variant="ghost" size="icon"
                        className="h-6 w-6 text-slate-300 hover:bg-slate-700"
                        onClick={() => updateQty(i, it.quantity + 1)}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                      <span className="text-amber-300 font-mono w-24 text-right">{fmtPrice(it.price * it.quantity)} F</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(i)}>
                        <Trash2 className="w-3 h-3 text-rose-400" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Sélecteur produits enrichi */}
              <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-2 space-y-2">
                {/* Search bar */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-slate-500" />
                  <Input
                    placeholder="Rechercher un produit…"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="pl-7 h-8 text-xs bg-slate-900 border-slate-700 text-white"
                    data-testid="regul-product-search"
                  />
                </div>

                {/* Tabs catégories */}
                <div className="flex flex-wrap gap-1">
                  {categories.map((c) => (
                    <Button
                      key={c}
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveCategory(c)}
                      className={`h-6 text-[10px] px-2 ${
                        activeCategory === c
                          ? "bg-amber-500/30 text-amber-200 border border-amber-500/40"
                          : "bg-slate-700/40 text-slate-300 hover:bg-slate-700/70"
                      }`}
                      data-testid={`regul-cat-${c}`}
                    >
                      {c === "all" ? "Tous" : c}
                    </Button>
                  ))}
                </div>

                {/* Liste filtrée */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto p-1">
                  {filteredProducts.length === 0 && (
                    <p className="col-span-full text-center text-[10px] text-slate-500 italic py-2">
                      Aucun produit trouvé pour cette recherche.
                    </p>
                  )}
                  {filteredProducts.map((p) => (
                    <Button
                      key={p.id}
                      type="button"
                      variant="ghost"
                      onClick={() => addItem(p)}
                      className="h-auto py-1.5 px-2 bg-slate-900/70 hover:bg-cyan-700/40 text-slate-200 flex flex-col items-start justify-start text-left"
                      data-testid={`regul-product-${p.id}`}
                    >
                      <span className="text-[11px] font-medium leading-tight truncate w-full">{p.name}</span>
                      <span className="text-[10px] text-amber-300 font-mono mt-0.5">{fmtPrice(p.price)} F</span>
                    </Button>
                  ))}
                </div>
                <p className="text-[9px] text-slate-500 text-right">
                  {filteredProducts.length} produit{filteredProducts.length > 1 ? "s" : ""}
                  {productSearch && ` correspondant à « ${productSearch} »`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Label className="text-xs text-slate-400 mb-1 block">Mode de paiement</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 text-white border-slate-700">
                      <SelectItem value="cash">Espèces</SelectItem>
                      <SelectItem value="card">Carte</SelectItem>
                      <SelectItem value="mobile_money">Mobile money</SelectItem>
                      <SelectItem value="credit">Crédit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label className="text-xs text-slate-400 mb-1 block">N° de table (optionnel)</Label>
                  <Input
                    type="number"
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-slate-400 mb-1 block">Client (optionnel)</Label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nom du client"
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
              <div className="text-right text-sm">
                <span className="text-slate-400">Total : </span>
                <span className="text-amber-300 font-bold text-base" data-testid="regul-total">{fmtPrice(subtotal)} F</span>
              </div>
            </div>
          )}

          {/* Motif obligatoire */}
          <div>
            <Label className="text-xs text-slate-400 mb-1 block">Motif de la régularisation <span className="text-rose-400">*</span></Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Bon oublié en cuisine — vente du 25/05, paiement reçu en espèces…"
              className="bg-slate-800 border-slate-700 text-white min-h-[60px]"
              data-testid="regul-reason"
            />
          </div>

          {/* Confirm post-closure */}
          <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmPostClosure}
              onChange={(e) => setConfirmPostClosure(e.target.checked)}
              className="mt-0.5"
              data-testid="regul-confirm-closure"
            />
            <span>
              <Lock className="w-3 h-3 inline mr-1" />
              Je confirme que la régularisation peut s'imputer sur une journée déjà clôturée si nécessaire (Z déjà imprimé).
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-slate-600 text-slate-300">Annuler</Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            data-testid="regul-submit"
          >
            <Check className="w-4 h-4 mr-1" />
            {isUpdateMode ? "Modifier la date" : "Régulariser le bon"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RegularizationModal;
