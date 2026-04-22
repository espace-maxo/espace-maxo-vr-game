/**
 * PurchaseOrdersTab — Gestion complète du cycle d'achat :
 *   Fournisseurs (CRUD) + Bons de commande (workflow draft → sent → received → paid).
 *
 * Côté admin : accès complet.
 * Côté gérante : consultation + ouverture du modal de réception (BL) quand un BC est 'sent' ou 'partially_received'.
 */
import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus, Trash2, Edit2, Send, Package, Truck, DollarSign, X, Printer,
  Building2, Phone, Mail, MapPin, CreditCard, CheckCircle, FileText,
  ClipboardCheck, PackageCheck, Receipt,
} from "lucide-react";

const API = (process.env.REACT_APP_BACKEND_URL || "") + "/api";
const formatPrice = (p) => new Intl.NumberFormat("fr-FR").format(Math.round(p || 0));

const CATEGORIES = [
  { v: "cuisine", l: "Cuisine" },
  { v: "boissons", l: "Boissons" },
  { v: "materiel", l: "Matériel" },
  { v: "services", l: "Services" },
  { v: "hygiene", l: "Hygiène" },
  { v: "autres", l: "Autres" },
];
const PAYMENT_TERMS = [
  { v: "comptant", l: "Comptant" },
  { v: "15j", l: "À 15 jours" },
  { v: "30j", l: "À 30 jours" },
  { v: "60j", l: "À 60 jours" },
  { v: "autre", l: "Autre" },
];
const STATUS_META = {
  draft: { label: "Brouillon", color: "bg-slate-500/30 text-slate-300" },
  sent: { label: "Envoyé", color: "bg-blue-500/30 text-blue-300" },
  partially_received: { label: "Partiel", color: "bg-amber-500/30 text-amber-300" },
  received: { label: "Reçu", color: "bg-emerald-500/30 text-emerald-300" },
  paid: { label: "Payé", color: "bg-green-600/40 text-green-200" },
  cancelled: { label: "Annulé", color: "bg-rose-500/30 text-rose-300" },
};

const emptySupplier = {
  name: "", category: "cuisine", phone: "", email: "", address: "",
  ifu: "", payment_terms: "comptant", notes: "",
};
const emptyItem = { description: "", quantity_ordered: 1, unit_price: 0, unit: "pcs" };

const PurchaseOrdersTab = ({ currentUser }) => {
  const isAdmin = currentUser?.role === "admin";

  const [suppliers, setSuppliers] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  // Supplier modal
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [supplierForm, setSupplierForm] = useState(emptySupplier);

  // PO creation modal
  const [showPoModal, setShowPoModal] = useState(false);
  const [editingPo, setEditingPo] = useState(null);
  const [poSupplierId, setPoSupplierId] = useState("");
  const [poItems, setPoItems] = useState([]);
  const [poNewItem, setPoNewItem] = useState(emptyItem);
  const [poNotes, setPoNotes] = useState("");

  // Receive modal
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receivingPo, setReceivingPo] = useState(null);
  const [receiveQuantities, setReceiveQuantities] = useState({});
  const [receiveRef, setReceiveRef] = useState("");
  const [receiveNotes, setReceiveNotes] = useState("");

  // Payment modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [payingPo, setPayingPo] = useState(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState("cash");
  const [payRef, setPayRef] = useState("");

  // Filters
  const [activeTab, setActiveTab] = useState("orders");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([
        axios.get(`${API}/suppliers`),
        axios.get(`${API}/purchase-orders${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`),
      ]);
      setSuppliers(s.data.suppliers || []);
      setPurchaseOrders(p.data.purchase_orders || []);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ---------- Suppliers ----------
  const openSupplierCreate = () => {
    setEditingSupplier(null);
    setSupplierForm(emptySupplier);
    setShowSupplierModal(true);
  };
  const openSupplierEdit = (s) => {
    setEditingSupplier(s);
    setSupplierForm({ ...emptySupplier, ...s });
    setShowSupplierModal(true);
  };
  const saveSupplier = async () => {
    if (!supplierForm.name.trim()) return toast.error("Nom requis");
    try {
      if (editingSupplier) {
        await axios.put(`${API}/suppliers/${editingSupplier.id}`, supplierForm);
        toast.success("Fournisseur mis à jour");
      } else {
        await axios.post(`${API}/suppliers`, supplierForm);
        toast.success("Fournisseur créé");
      }
      setShowSupplierModal(false);
      fetchData();
    } catch (e) { toast.error("Erreur"); }
  };
  const deleteSupplier = async (id) => {
    if (!confirm("Supprimer ce fournisseur ?")) return;
    try { await axios.delete(`${API}/suppliers/${id}`); toast.success("Supprimé"); fetchData(); }
    catch (e) { toast.error("Erreur"); }
  };

  // ---------- PO ----------
  const openPoCreate = () => {
    setEditingPo(null);
    setPoSupplierId(suppliers[0]?.id || "");
    setPoItems([]);
    setPoNewItem(emptyItem);
    setPoNotes("");
    setShowPoModal(true);
  };
  const openPoEdit = (po) => {
    if (po.status !== "draft") return toast.error("Seul un brouillon est modifiable");
    setEditingPo(po);
    setPoSupplierId(po.supplier_id || "");
    setPoItems((po.items || []).map((it, i) => ({ ...it, _k: i + Date.now() })));
    setPoNotes(po.notes || "");
    setShowPoModal(true);
  };
  const addPoItem = () => {
    if (!poNewItem.description.trim()) return toast.error("Description requise");
    const amt = (poNewItem.quantity_ordered || 1) * (poNewItem.unit_price || 0);
    setPoItems([...poItems, { ...poNewItem, amount: amt, _k: Date.now() }]);
    setPoNewItem(emptyItem);
  };
  const removePoItem = (k) => setPoItems(poItems.filter((i) => i._k !== k));
  const poTotal = () => poItems.reduce((s, it) => s + (it.amount || ((it.quantity_ordered || 1) * (it.unit_price || 0))), 0);
  const savePo = async () => {
    if (poItems.length === 0) return toast.error("Ajoutez au moins 1 article");
    const supplier = suppliers.find((s) => s.id === poSupplierId);
    const payload = {
      supplier_id: poSupplierId || null,
      supplier_name: supplier?.name || null,
      items: poItems.map((it) => ({
        description: it.description,
        quantity_ordered: it.quantity_ordered || 1,
        quantity_received: it.quantity_received || 0,
        unit_price: it.unit_price || 0,
        amount: it.amount || (it.quantity_ordered || 1) * (it.unit_price || 0),
        unit: it.unit || "pcs",
      })),
      notes: poNotes,
      created_by: currentUser?.name || currentUser?.username || "Admin",
    };
    try {
      if (editingPo) await axios.put(`${API}/purchase-orders/${editingPo.id}`, payload);
      else await axios.post(`${API}/purchase-orders`, payload);
      toast.success(editingPo ? "BC mis à jour" : "Bon de commande créé");
      setShowPoModal(false);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };
  const sendPo = async (po) => {
    if (!confirm(`Envoyer le BC ${po.number} au fournisseur ?`)) return;
    try {
      await axios.post(`${API}/purchase-orders/${po.id}/send`, { user_name: currentUser?.name || "Admin" });
      toast.success("BC marqué comme envoyé");
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };
  const cancelPo = async (po) => {
    const reason = prompt("Raison de l'annulation (optionnel) :", "");
    try {
      await axios.post(`${API}/purchase-orders/${po.id}/cancel`, { reason: reason || "" });
      toast.success("BC annulé");
      fetchData();
    } catch (e) { toast.error("Erreur"); }
  };
  const deletePo = async (po) => {
    if (!confirm(`Supprimer le BC ${po.number} ?`)) return;
    try { await axios.delete(`${API}/purchase-orders/${po.id}`); toast.success("Supprimé"); fetchData(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  // ---------- Reception ----------
  const openReceive = (po) => {
    setReceivingPo(po);
    const q = {};
    (po.items || []).forEach((it, i) => {
      q[i] = Math.max(0, (it.quantity_ordered || 0) - (it.quantity_received || 0));
    });
    setReceiveQuantities(q);
    setReceiveRef("");
    setReceiveNotes("");
    setShowReceiveModal(true);
  };
  const submitReceive = async () => {
    const items = (receivingPo.items || [])
      .map((it, i) => ({ description: it.description, quantity_received: parseFloat(receiveQuantities[i] || 0) }))
      .filter((x) => x.quantity_received > 0);
    if (items.length === 0) return toast.error("Aucune quantité saisie");
    try {
      const res = await axios.post(`${API}/purchase-orders/${receivingPo.id}/receive`, {
        items,
        user_name: currentUser?.name || "Admin",
        delivery_note_ref: receiveRef,
        notes: receiveNotes,
      });
      toast.success(`Bordereau enregistré (${res.data.status === "received" ? "complet" : "partiel"})`);
      setShowReceiveModal(false);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  // ---------- Payment ----------
  const openPay = (po) => {
    setPayingPo(po);
    setPayAmount(po.total_amount || 0);
    setPayMethod("cash");
    setPayRef("");
    setShowPayModal(true);
  };
  const submitPay = async () => {
    try {
      await axios.post(`${API}/purchase-orders/${payingPo.id}/pay`, {
        amount: parseFloat(payAmount) || 0,
        method: payMethod,
        reference: payRef,
        user_name: currentUser?.name || "Admin",
      });
      toast.success("Paiement enregistré");
      setShowPayModal(false);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  // ---------- Print thermal 80mm ----------
  const printPO = (po, mode) => {
    const w = window.open("", "_blank");
    if (!w) return;
    const title = mode === "delivery" ? "BORDEREAU LIVRAISON" : "BON DE COMMANDE";
    const items = (po.items || []).map(
      (it) => `
        <div style="display:flex;justify-content:space-between;font-size:11px;">
          <span>${it.description}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;padding-left:8px;">
          <span>${mode === "delivery" ? `${it.quantity_received}/${it.quantity_ordered}` : it.quantity_ordered} x ${formatPrice(it.unit_price)}</span>
          <span><b>${formatPrice((mode === "delivery" ? it.quantity_received : it.quantity_ordered) * it.unit_price)} F</b></span>
        </div>
        <div style="border-bottom:1px dashed #999;margin:4px 0;"></div>`
    ).join("");
    const total = mode === "delivery"
      ? (po.items || []).reduce((s, it) => s + it.quantity_received * it.unit_price, 0)
      : po.total_amount;
    const bls = (po.delivery_notes || []).map(
      (d) => `<div>BL ${d.ref || "-"} • ${(d.date || "").slice(0, 10)}</div>`
    ).join("");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${po.number}</title>
      <style>
        @page { size: 80mm auto; margin: 2mm; }
        body { font-family: 'Courier New', monospace; width: 76mm; padding: 0; margin: 0; font-size: 11px; color:#000; }
        h2 { text-align:center; margin:2px 0; font-size: 13px; }
        h3 { text-align:center; margin:1px 0; font-size: 11px; }
        .hdr { text-align:center; }
        .box { border:1px solid #000; padding:3px; margin:4px 0; }
        .total { font-size:13px; font-weight:bold; text-align:right; border-top:2px solid #000; padding-top:4px; margin-top:4px; }
      </style></head><body>
        <div class="hdr">
          <h2>ESPACE MAXO</h2>
          <h3>${title}</h3>
          <div style="font-size:10px">N° ${po.number}</div>
          <div style="font-size:10px">${new Date().toLocaleString("fr-FR")}</div>
        </div>
        <div class="box">
          <b>Fournisseur:</b> ${po.supplier_name || "-"}<br>
          ${mode === "delivery" ? `<b>Ref BL:</b> ${(po.delivery_notes || []).slice(-1)[0]?.ref || "-"}<br>` : ""}
          ${po.notes ? `<br><i>${po.notes}</i>` : ""}
        </div>
        <div style="border-bottom:1px solid #000;margin:4px 0;"></div>
        ${items}
        <div class="total">TOTAL: ${formatPrice(total)} F CFA</div>
        ${mode === "delivery" && bls ? `<div style="font-size:9px;margin-top:6px;">Historique:<br>${bls}</div>` : ""}
        <div style="text-align:center;font-size:10px;margin-top:8px">
          ${mode === "delivery" ? "Réceptionné par: __________" : "Signature/Cachet: __________"}
        </div>
        <div style="text-align:center;font-size:9px;margin-top:4px;color:#555">Espace Maxo — Cotonou</div>
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 250);
  };

  // ==================== RENDER ====================
  return (
    <div className="space-y-4" data-testid="purchase-orders-tab">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-sky-300 flex items-center gap-2">
          <Truck className="w-6 h-6" />
          Fournisseurs & Bons de commande
        </h2>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-800/50">
          <TabsTrigger value="orders" data-testid="po-tab-orders">
            <FileText className="w-4 h-4 mr-2" /> Bons de commande ({purchaseOrders.length})
          </TabsTrigger>
          <TabsTrigger value="suppliers" data-testid="po-tab-suppliers">
            <Building2 className="w-4 h-4 mr-2" /> Fournisseurs ({suppliers.length})
          </TabsTrigger>
        </TabsList>

        {/* ---------- ORDERS ---------- */}
        <TabsContent value="orders" className="space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48 bg-slate-800/50 border-slate-700 text-white" data-testid="po-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all">Tous les statuts</SelectItem>
                {Object.entries(STATUS_META).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAdmin && (
              <Button onClick={openPoCreate} className="ml-auto bg-sky-600 hover:bg-sky-700" data-testid="new-po-btn">
                <Plus className="w-4 h-4 mr-2" /> Nouveau BC
              </Button>
            )}
          </div>

          {loading ? (
            <div className="text-center text-slate-400 py-10">Chargement…</div>
          ) : purchaseOrders.length === 0 ? (
            <Card className="bg-slate-800/30 border-slate-700">
              <CardContent className="py-10 text-center text-slate-400">
                <FileText className="w-12 h-12 mx-auto mb-2 opacity-40" />
                Aucun bon de commande
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {purchaseOrders.map((po) => {
                const st = STATUS_META[po.status] || STATUS_META.draft;
                const canReceive = po.status === "sent" || po.status === "partially_received";
                const canPay = po.status === "received" || po.status === "partially_received";
                return (
                  <Card key={po.id} className="bg-slate-800/50 border-slate-700" data-testid={`po-card-${po.id}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex justify-between items-start gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sky-300 font-bold">{po.number}</span>
                            <Badge className={st.color}>{st.label}</Badge>
                            <Badge className="bg-slate-700/50 text-slate-300">
                              <Building2 className="w-3 h-3 mr-1" /> {po.supplier_name}
                            </Badge>
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            Créé {po.created_at?.slice(0, 10)} par {po.created_by}
                            {po.expense_id ? ` • depuis dépense ${po.expense_id.slice(0, 8)}` : ""}
                          </div>
                          {po.notes && <div className="text-xs text-slate-500 italic mt-1">« {po.notes} »</div>}
                        </div>
                        <div className="text-right">
                          <div className="text-sky-300 font-bold text-lg">{formatPrice(po.total_amount)} F</div>
                          <div className="text-xs text-slate-500">{(po.items || []).length} article(s)</div>
                        </div>
                      </div>

                      {/* Items */}
                      <div className="bg-slate-900/40 rounded p-2 max-h-36 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="text-slate-400">
                            <tr>
                              <th className="text-left py-1">Article</th>
                              <th className="text-right">Cmd</th>
                              <th className="text-right">Reçu</th>
                              <th className="text-right">PU</th>
                              <th className="text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(po.items || []).map((it, i) => {
                              const full = it.quantity_received >= it.quantity_ordered;
                              return (
                                <tr key={i} className="border-t border-slate-700/40">
                                  <td className="py-1 text-slate-200">{it.description}</td>
                                  <td className="text-right text-slate-300">{it.quantity_ordered} {it.unit || ""}</td>
                                  <td className={`text-right ${full ? "text-emerald-400" : "text-amber-400"}`}>
                                    {it.quantity_received}
                                  </td>
                                  <td className="text-right text-slate-400">{formatPrice(it.unit_price)}</td>
                                  <td className="text-right text-slate-200">{formatPrice(it.amount)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Delivery notes */}
                      {(po.delivery_notes || []).length > 0 && (
                        <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                          <ClipboardCheck className="w-3 h-3" />
                          BL : {(po.delivery_notes || []).map((d, i) => (
                            <span key={i} className="bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded">
                              {d.ref || "-"} ({(d.date || "").slice(0, 10)})
                            </span>
                          ))}
                        </div>
                      )}
                      {po.payment && (
                        <div className="text-xs text-green-400 flex items-center gap-2">
                          <DollarSign className="w-3 h-3" /> Payé : {formatPrice(po.payment.amount)} F — {po.payment.method}
                          {po.payment.reference ? ` (${po.payment.reference})` : ""}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 flex-wrap pt-1">
                        <Button size="sm" variant="outline" onClick={() => printPO(po, "order")}
                          className="border-sky-500/50 text-sky-300 hover:bg-sky-500/20" data-testid={`print-po-${po.id}`}>
                          <Printer className="w-3 h-3 mr-1" /> Imprimer BC
                        </Button>
                        {(po.delivery_notes || []).length > 0 && (
                          <Button size="sm" variant="outline" onClick={() => printPO(po, "delivery")}
                            className="border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/20">
                            <Receipt className="w-3 h-3 mr-1" /> Imprimer BL
                          </Button>
                        )}
                        {isAdmin && po.status === "draft" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => openPoEdit(po)}
                              className="border-slate-600 text-slate-300 hover:bg-slate-700" data-testid={`edit-po-${po.id}`}>
                              <Edit2 className="w-3 h-3 mr-1" /> Modifier
                            </Button>
                            <Button size="sm" onClick={() => sendPo(po)} className="bg-blue-600 hover:bg-blue-700"
                              data-testid={`send-po-${po.id}`}>
                              <Send className="w-3 h-3 mr-1" /> Envoyer
                            </Button>
                          </>
                        )}
                        {canReceive && (
                          <Button size="sm" onClick={() => openReceive(po)}
                            className="bg-amber-600 hover:bg-amber-700" data-testid={`receive-po-${po.id}`}>
                            <PackageCheck className="w-3 h-3 mr-1" /> Réceptionner
                          </Button>
                        )}
                        {isAdmin && canPay && (
                          <Button size="sm" onClick={() => openPay(po)}
                            className="bg-green-600 hover:bg-green-700" data-testid={`pay-po-${po.id}`}>
                            <DollarSign className="w-3 h-3 mr-1" /> Enregistrer paiement
                          </Button>
                        )}
                        {isAdmin && !["received", "paid", "cancelled"].includes(po.status) && (
                          <Button size="sm" variant="outline" onClick={() => cancelPo(po)}
                            className="border-rose-500/50 text-rose-300 hover:bg-rose-500/20">
                            <X className="w-3 h-3 mr-1" /> Annuler
                          </Button>
                        )}
                        {isAdmin && ["draft", "cancelled"].includes(po.status) && (
                          <Button size="sm" variant="outline" onClick={() => deletePo(po)}
                            className="border-red-700/50 text-red-500 hover:bg-red-700/20">
                            <Trash2 className="w-3 h-3 mr-1" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ---------- SUPPLIERS ---------- */}
        <TabsContent value="suppliers" className="space-y-3">
          {isAdmin && (
            <div className="flex justify-end">
              <Button onClick={openSupplierCreate} className="bg-sky-600 hover:bg-sky-700" data-testid="new-supplier-btn">
                <Plus className="w-4 h-4 mr-2" /> Nouveau fournisseur
              </Button>
            </div>
          )}
          {suppliers.length === 0 ? (
            <Card className="bg-slate-800/30 border-slate-700">
              <CardContent className="py-10 text-center text-slate-400">
                <Building2 className="w-12 h-12 mx-auto mb-2 opacity-40" />
                Aucun fournisseur enregistré
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {suppliers.map((s) => (
                <Card key={s.id} className="bg-slate-800/50 border-slate-700" data-testid={`supplier-card-${s.id}`}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Building2 className="w-4 h-4 text-sky-400" />
                          <span className="text-white font-bold">{s.name}</span>
                          <Badge className="bg-slate-700/50 text-slate-300 text-xs">
                            {CATEGORIES.find((c) => c.v === s.category)?.l || s.category}
                          </Badge>
                          <Badge className="bg-indigo-500/20 text-indigo-300 text-xs">
                            <CreditCard className="w-3 h-3 mr-1" />
                            {PAYMENT_TERMS.find((p) => p.v === s.payment_terms)?.l || s.payment_terms}
                          </Badge>
                        </div>
                        <div className="space-y-0.5 text-xs text-slate-400">
                          {s.phone && <div><Phone className="w-3 h-3 inline mr-1" /> {s.phone}</div>}
                          {s.email && <div><Mail className="w-3 h-3 inline mr-1" /> {s.email}</div>}
                          {s.address && <div><MapPin className="w-3 h-3 inline mr-1" /> {s.address}</div>}
                          {s.ifu && <div>IFU : {s.ifu}</div>}
                        </div>
                        {s.notes && <div className="text-xs text-slate-500 italic mt-2">« {s.notes} »</div>}
                      </div>
                      {isAdmin && (
                        <div className="flex flex-col gap-1">
                          <Button size="sm" variant="outline" onClick={() => openSupplierEdit(s)}
                            className="border-slate-600 text-slate-300 hover:bg-slate-700 h-7 w-7 p-0">
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => deleteSupplier(s.id)}
                            className="border-rose-500/50 text-rose-300 hover:bg-rose-500/20 h-7 w-7 p-0">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ======= Supplier modal ======= */}
      <Dialog open={showSupplierModal} onOpenChange={setShowSupplierModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-sky-300">{editingSupplier ? "Modifier" : "Nouveau"} fournisseur</DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Les informations sont utilisées dans les bons de commande et bordereaux de livraison.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label className="text-slate-300 text-sm">Nom *</Label>
              <Input value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                className="bg-slate-700/50 border-slate-600 text-white" data-testid="supplier-name-input" />
            </div>
            <div>
              <Label className="text-slate-300 text-sm">Catégorie</Label>
              <Select value={supplierForm.category} onValueChange={(v) => setSupplierForm({ ...supplierForm, category: v })}>
                <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {CATEGORIES.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300 text-sm">Conditions paiement</Label>
              <Select value={supplierForm.payment_terms} onValueChange={(v) => setSupplierForm({ ...supplierForm, payment_terms: v })}>
                <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {PAYMENT_TERMS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300 text-sm">Téléphone</Label>
              <Input value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                className="bg-slate-700/50 border-slate-600 text-white" />
            </div>
            <div>
              <Label className="text-slate-300 text-sm">Email</Label>
              <Input value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                className="bg-slate-700/50 border-slate-600 text-white" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-slate-300 text-sm">Adresse</Label>
              <Input value={supplierForm.address} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                className="bg-slate-700/50 border-slate-600 text-white" />
            </div>
            <div>
              <Label className="text-slate-300 text-sm">IFU</Label>
              <Input value={supplierForm.ifu} onChange={(e) => setSupplierForm({ ...supplierForm, ifu: e.target.value })}
                className="bg-slate-700/50 border-slate-600 text-white" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-slate-300 text-sm">Notes</Label>
              <Textarea value={supplierForm.notes} onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })}
                className="bg-slate-700/50 border-slate-600 text-white" />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setShowSupplierModal(false)} className="border-slate-600 text-slate-300">Annuler</Button>
            <Button onClick={saveSupplier} className="bg-sky-600 hover:bg-sky-700" data-testid="save-supplier-btn">
              <CheckCircle className="w-4 h-4 mr-2" /> Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ======= PO modal ======= */}
      <Dialog open={showPoModal} onOpenChange={setShowPoModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sky-300">{editingPo ? `Modifier ${editingPo.number}` : "Nouveau bon de commande"}</DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Sélectionnez un fournisseur puis ajoutez les articles commandés avec quantité et prix unitaire.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300 text-sm">Fournisseur *</Label>
              <Select value={poSupplierId} onValueChange={setPoSupplierId}>
                <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white" data-testid="po-supplier-select">
                  <SelectValue placeholder="Choisir un fournisseur" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Card className="bg-sky-900/20 border-sky-500/30">
              <CardContent className="p-3">
                <div className="flex gap-2 flex-wrap">
                  <Input value={poNewItem.description} onChange={(e) => setPoNewItem({ ...poNewItem, description: e.target.value })}
                    placeholder="Description de l'article" className="flex-1 min-w-[150px] bg-slate-700/50 border-slate-600 text-white"
                    data-testid="po-new-item-desc" />
                  <Input type="number" value={poNewItem.quantity_ordered || ""} onChange={(e) => setPoNewItem({ ...poNewItem, quantity_ordered: parseFloat(e.target.value) || 1 })}
                    placeholder="Qté" className="w-20 bg-slate-700/50 border-slate-600 text-white" />
                  <Input value={poNewItem.unit} onChange={(e) => setPoNewItem({ ...poNewItem, unit: e.target.value })}
                    placeholder="Unité" className="w-20 bg-slate-700/50 border-slate-600 text-white" />
                  <Input type="number" value={poNewItem.unit_price || ""} onChange={(e) => setPoNewItem({ ...poNewItem, unit_price: parseFloat(e.target.value) || 0 })}
                    placeholder="PU" className="w-24 bg-slate-700/50 border-slate-600 text-white" />
                  <Button onClick={addPoItem} className="bg-sky-600 hover:bg-sky-700" data-testid="po-add-item-btn">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {poItems.length > 0 && (
              <div className="bg-slate-700/20 rounded p-2 space-y-1 max-h-60 overflow-y-auto">
                {poItems.map((it, i) => (
                  <div key={it._k} className="flex justify-between items-center gap-2 bg-slate-800/50 rounded p-2 text-sm">
                    <span className="text-slate-500 font-mono w-6">{i + 1}.</span>
                    <span className="flex-1 text-white truncate">{it.description}</span>
                    <span className="text-slate-400">
                      {it.quantity_ordered} {it.unit} × {formatPrice(it.unit_price)} = <b className="text-sky-300">{formatPrice((it.quantity_ordered || 1) * (it.unit_price || 0))} F</b>
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => removePoItem(it._k)} className="text-rose-400 h-7 w-7 p-0">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex justify-end pt-2 border-t border-slate-700 font-bold text-sky-300">
                  Total : {formatPrice(poTotal())} F CFA
                </div>
              </div>
            )}

            <div>
              <Label className="text-slate-300 text-sm">Notes / Conditions</Label>
              <Textarea value={poNotes} onChange={(e) => setPoNotes(e.target.value)}
                className="bg-slate-700/50 border-slate-600 text-white" placeholder="Livraison avant... / Paiement à..." />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowPoModal(false)} className="border-slate-600 text-slate-300">Annuler</Button>
              <Button onClick={savePo} className="bg-sky-600 hover:bg-sky-700" data-testid="save-po-btn">
                <CheckCircle className="w-4 h-4 mr-2" /> Enregistrer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ======= Reception modal ======= */}
      <Dialog open={showReceiveModal} onOpenChange={setShowReceiveModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-amber-300 flex items-center gap-2">
              <PackageCheck className="w-5 h-5" /> Réception — {receivingPo?.number}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Saisissez les quantités réellement reçues. Le stock sera automatiquement mis à jour et un bordereau de livraison généré.
            </DialogDescription>
          </DialogHeader>
          {receivingPo && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-slate-300 text-sm">Référence BL (optionnel)</Label>
                  <Input value={receiveRef} onChange={(e) => setReceiveRef(e.target.value)}
                    placeholder="Ex: BL-2026-001" className="bg-slate-700/50 border-slate-600 text-white" data-testid="bl-ref-input" />
                </div>
                <div>
                  <Label className="text-slate-300 text-sm">Notes</Label>
                  <Input value={receiveNotes} onChange={(e) => setReceiveNotes(e.target.value)}
                    placeholder="Écarts éventuels" className="bg-slate-700/50 border-slate-600 text-white" />
                </div>
              </div>
              <div className="space-y-2">
                {(receivingPo.items || []).map((it, i) => {
                  const remaining = (it.quantity_ordered || 0) - (it.quantity_received || 0);
                  return (
                    <Card key={i} className="bg-slate-700/30 border-slate-600">
                      <CardContent className="p-3 flex items-center gap-3 flex-wrap">
                        <div className="flex-1 min-w-[150px]">
                          <div className="text-white font-medium">{it.description}</div>
                          <div className="text-xs text-slate-400">
                            Commandé : {it.quantity_ordered} {it.unit} • Déjà reçu : {it.quantity_received}
                            {remaining > 0 && <span className="text-amber-400"> • Reste : {remaining}</span>}
                            {remaining <= 0 && <span className="text-emerald-400"> • Complet</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-slate-300 text-xs">Reçu :</Label>
                          <Input type="number" min="0" max={remaining}
                            value={receiveQuantities[i] ?? ""}
                            onChange={(e) => setReceiveQuantities({ ...receiveQuantities, [i]: parseFloat(e.target.value) || 0 })}
                            className="w-24 bg-slate-800/50 border-slate-600 text-white"
                            data-testid={`receive-qty-${i}`} />
                          <span className="text-slate-400 text-xs">{it.unit}</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setShowReceiveModal(false)} className="border-slate-600 text-slate-300">Annuler</Button>
                <Button onClick={submitReceive} className="bg-amber-600 hover:bg-amber-700" data-testid="submit-receive-btn">
                  <ClipboardCheck className="w-4 h-4 mr-2" /> Valider la réception
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ======= Payment modal ======= */}
      <Dialog open={showPayModal} onOpenChange={setShowPayModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-green-300 flex items-center gap-2">
              <DollarSign className="w-5 h-5" /> Paiement — {payingPo?.number}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Enregistrement du paiement effectué au fournisseur. Le BC passera au statut "Payé".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-slate-300 text-sm">Montant (F CFA)</Label>
              <Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                className="bg-slate-700/50 border-slate-600 text-white text-lg font-bold" data-testid="pay-amount-input" />
            </div>
            <div>
              <Label className="text-slate-300 text-sm">Méthode</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="cash">Espèces</SelectItem>
                  <SelectItem value="bank_transfer">Virement bancaire</SelectItem>
                  <SelectItem value="mobile_money">Mobile money</SelectItem>
                  <SelectItem value="cheque">Chèque</SelectItem>
                  <SelectItem value="autre">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300 text-sm">Référence (optionnel)</Label>
              <Input value={payRef} onChange={(e) => setPayRef(e.target.value)}
                placeholder="Ex: REC-001, TRX-4321" className="bg-slate-700/50 border-slate-600 text-white" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowPayModal(false)} className="border-slate-600 text-slate-300">Annuler</Button>
              <Button onClick={submitPay} className="bg-green-600 hover:bg-green-700" data-testid="submit-pay-btn">
                <CheckCircle className="w-4 h-4 mr-2" /> Valider
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PurchaseOrdersTab;
