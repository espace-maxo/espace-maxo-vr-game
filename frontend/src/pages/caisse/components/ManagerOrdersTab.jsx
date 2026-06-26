import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  UserCog, Plus, Check, X, Edit2, Trash2, ShieldCheck, AlertCircle,
  Search, Minus, Clock, Calendar, Lock
} from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const MAX_PER_MONTH = 25000;
const DISCOUNT_RATE = 0.5;

const STATUS_BADGE = {
  pending_manager: { label: "Auto-confirmation Resp. Op. en attente", className: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
  pending_director: { label: "En attente Directrice", className: "bg-blue-500/20 text-blue-300 border-blue-500/40" },
  authorized: { label: "Autorisé", className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
  settled: { label: "Réglé sur salaire", className: "bg-slate-500/20 text-slate-300 border-slate-500/40" },
  cancelled: { label: "Annulé", className: "bg-red-500/20 text-red-300 border-red-500/40" },
};

const monthKey = (d = new Date()) => format(d, "yyyy-MM");

const ManagerOrdersTab = ({ currentUser, formatPrice, products = [] }) => {
  const isAdmin = currentUser?.role === 'admin';
  const isManager = currentUser?.role === 'manager';
  const defaultManagerName = currentUser?.full_name || currentUser?.name || currentUser?.username || "Responsable Op. & Log";

  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [filterMonth, setFilterMonth] = useState(monthKey());

  const [showModal, setShowModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [employeeName, setEmployeeName] = useState(defaultManagerName);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItems, setSelectedItems] = useState([]);
  const [notes, setNotes] = useState("");
  const [capStatus, setCapStatus] = useState(null);

  const [showClosureModal, setShowClosureModal] = useState(false);
  const [closurePreview, setClosurePreview] = useState(null);

  useEffect(() => { fetchOrders(); }, [filterMonth]);

  const fetchOrders = async () => {
    try {
      const res = await axios.get(`${API}/manager-orders`, { params: { month: filterMonth } });
      setOrders(res.data.orders || []);
      setStats(res.data.stats || {});
    } catch (e) { console.error("fetch manager-orders err", e); }
  };

  const fetchCap = async (name) => {
    if (!name?.trim()) { setCapStatus(null); return; }
    try {
      const res = await axios.get(`${API}/manager-orders/cap-status`, { params: { employee_name: name.trim(), month: monthKey() } });
      setCapStatus(res.data);
    } catch { setCapStatus(null); }
  };

  useEffect(() => {
    const t = setTimeout(() => fetchCap(employeeName), 300);
    return () => clearTimeout(t);
  }, [employeeName]);

  const resetForm = () => {
    setEditingOrder(null);
    setEmployeeName(defaultManagerName);
    setSearchTerm("");
    setSelectedItems([]);
    setNotes("");
  };

  const openCreateModal = () => { resetForm(); setShowModal(true); };

  const openEditModal = (order) => {
    if (order.status !== "pending_manager") {
      toast.error("Cette commande ne peut plus être modifiée");
      return;
    }
    setEditingOrder(order);
    setEmployeeName(order.employee_name || defaultManagerName);
    setSelectedItems(order.items || []);
    setNotes(order.notes || "");
    setShowModal(true);
  };

  const filteredProducts = products.filter(p =>
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addProduct = (product) => {
    const existing = selectedItems.find(it => it.product_id === product.id);
    if (existing) {
      setSelectedItems(selectedItems.map(it => it.product_id === product.id ? { ...it, quantity: it.quantity + 1 } : it));
    } else {
      setSelectedItems([...selectedItems, { product_id: product.id, name: product.name, price: product.price, quantity: 1, category: product.category }]);
    }
  };

  const decreaseProduct = (productId) => {
    const existing = selectedItems.find(it => it.product_id === productId);
    if (existing && existing.quantity > 1) {
      setSelectedItems(selectedItems.map(it => it.product_id === productId ? { ...it, quantity: it.quantity - 1 } : it));
    } else {
      setSelectedItems(selectedItems.filter(it => it.product_id !== productId));
    }
  };

  const subtotal = useMemo(() => selectedItems.reduce((s, it) => s + (it.price * it.quantity), 0), [selectedItems]);
  const discount = subtotal * DISCOUNT_RATE;
  const totalAfter = subtotal - discount;

  const projectedUsed = (capStatus?.used || 0) + (editingOrder ? -editingOrder.total : 0) + totalAfter;
  const willExceedCap = projectedUsed > MAX_PER_MONTH + 0.01;

  const handleSubmit = async () => {
    if (!employeeName.trim()) { toast.error("Nom de la responsable op. & log requis"); return; }
    if (selectedItems.length === 0) { toast.error("Au moins un article requis"); return; }
    if (willExceedCap) { toast.error(`Plafond mensuel dépassé (max ${formatPrice(MAX_PER_MONTH)} F/mois)`); return; }
    setLoading(true);
    try {
      const payload = {
        employee_name: employeeName.trim(),
        employee_position: "Responsable Op. & Log",
        items: selectedItems,
        notes,
        created_by: currentUser?.full_name || currentUser?.name || currentUser?.username || "Responsable Op. & Log",
      };
      if (editingOrder) {
        await axios.put(`${API}/manager-orders/${editingOrder.id}`, payload);
        toast.success("Commande modifiée");
      } else {
        await axios.post(`${API}/manager-orders`, payload);
        toast.success("Commande responsable op. & log enregistrée — auto-confirmation requise");
      }
      setShowModal(false);
      resetForm();
      fetchOrders();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de l'enregistrement");
    } finally { setLoading(false); }
  };

  const authorize = async (order, role) => {
    const label = role === "manager" ? "Responsable Op. & Log (auto-confirmation)" : "la Direction";
    if (!window.confirm(`Autoriser cette commande responsable op. & log en tant que ${label} ?\n\nMontant à retenir : ${formatPrice(order.total)} F`)) return;
    try {
      await axios.put(`${API}/manager-orders/${order.id}/authorize`, {
        by_role: role,
        signer_name: currentUser?.full_name || currentUser?.name || currentUser?.username || label,
      });
      toast.success(`Autorisé par ${label}` + (role === "director" ? " — stock décrémenté" : ""));
      fetchOrders();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur d'autorisation"); }
  };

  const cancelOrder = async (order) => {
    if (!window.confirm(`Annuler cette commande responsable op. & log (${formatPrice(order.total)} F) ?`)) return;
    try {
      await axios.delete(`${API}/manager-orders/${order.id}`);
      toast.success("Commande annulée");
      fetchOrders();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const previewClosure = () => {
    const target = filterMonth || monthKey();
    const eligible = orders.filter(o => o.month_period === target && o.status === "authorized");
    if (eligible.length === 0) { toast.warning("Aucune commande autorisée à clôturer"); return; }
    const byEmp = {};
    eligible.forEach(o => {
      const k = o.employee_name;
      if (!byEmp[k]) byEmp[k] = { name: k, position: o.employee_position, count: 0, total: 0 };
      byEmp[k].count += 1;
      byEmp[k].total += o.total;
    });
    setClosurePreview({
      month: target,
      total_count: eligible.length,
      total_amount: eligible.reduce((s, o) => s + o.total, 0),
      by_employee: Object.values(byEmp).sort((a, b) => a.name.localeCompare(b.name)),
    });
    setShowClosureModal(true);
  };

  const confirmClosure = async () => {
    if (!closurePreview) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API}/manager-orders/close-month`, {
        month: closurePreview.month,
        closed_by: currentUser?.full_name || currentUser?.name || "Admin",
      });
      toast.success(`Mois clôturé : ${res.data.settled_count} commande(s) déduite(s) du salaire`);
      setShowClosureModal(false);
      setClosurePreview(null);
      fetchOrders();
      window.open(`${API}/manager-orders/closure-pdf?month=${closurePreview.month}`, "_blank");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur de clôture");
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4" data-testid="manager-orders-tab">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-violet-300 flex items-center gap-2">
            <UserCog className="w-6 h-6" />
            Bons RESPONSABLE OP. & LOG
          </h2>
          <Badge className="bg-violet-500/30 text-violet-200">Crédit salaire · 25 000 F/mois</Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="bg-slate-800 border-slate-700 text-white h-9 w-44"
            data-testid="mgr-filter-month"
          />
          <Button onClick={openCreateModal} className="bg-violet-600 hover:bg-violet-700" data-testid="mgr-create-btn">
            <Plus className="w-4 h-4 mr-1" /> Nouvelle commande
          </Button>
          {isAdmin && (
            <Button onClick={previewClosure} variant="outline" className="border-purple-500/50 text-purple-300 hover:bg-purple-500/10" data-testid="mgr-close-month-btn">
              <Lock className="w-4 h-4 mr-1" /> Clôturer le mois
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-amber-900/20 border-amber-500/30">
          <CardContent className="p-3 text-center">
            <Clock className="w-5 h-5 text-amber-400 mx-auto mb-1" />
            <p className="text-amber-300 text-xs">En attente (G+D)</p>
            <p className="text-amber-200 font-bold text-lg">{(stats.count_pending_manager || 0) + (stats.count_pending_director || 0)}</p>
            <p className="text-amber-400/70 text-[10px]">{formatPrice(stats.total_pending || 0)} F</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-900/20 border-emerald-500/30">
          <CardContent className="p-3 text-center">
            <ShieldCheck className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
            <p className="text-emerald-300 text-xs">Autorisés</p>
            <p className="text-emerald-200 font-bold text-lg">{stats.count_authorized || 0}</p>
            <p className="text-emerald-400/70 text-[10px]">{formatPrice(stats.total_authorized || 0)} F</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/40 border-slate-600/40">
          <CardContent className="p-3 text-center">
            <Check className="w-5 h-5 text-slate-300 mx-auto mb-1" />
            <p className="text-slate-300 text-xs">Réglés (salaire)</p>
            <p className="text-slate-200 font-bold text-lg">{stats.count_settled || 0}</p>
            <p className="text-slate-400/70 text-[10px]">{formatPrice(stats.total_settled || 0)} F</p>
          </CardContent>
        </Card>
        <Card className="bg-violet-900/20 border-violet-500/30">
          <CardContent className="p-3 text-center">
            <Calendar className="w-5 h-5 text-violet-400 mx-auto mb-1" />
            <p className="text-violet-300 text-xs">Mois</p>
            <p className="text-violet-200 font-bold text-lg">{filterMonth}</p>
            <p className="text-violet-400/70 text-[10px]">Plafond {formatPrice(MAX_PER_MONTH)} F</p>
          </CardContent>
        </Card>
      </div>

      {orders.length === 0 ? (
        <Card className="bg-slate-800/40 border-slate-700">
          <CardContent className="p-8 text-center text-slate-400">
            <UserCog className="w-10 h-10 mx-auto mb-2 text-slate-600" />
            <p>Aucune commande responsable op. & log pour {filterMonth}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2" data-testid="mgr-orders-list">
          {orders.map(order => {
            const badge = STATUS_BADGE[order.status] || { label: order.status, className: "bg-slate-500/20 text-slate-300" };
            const canManagerAuth = isManager && order.status === "pending_manager";
            const canDirectorAuth = isAdmin && order.status === "pending_director";
            const canEdit = order.status === "pending_manager";
            const canCancel = (isAdmin || isManager) && order.status !== "settled";
            return (
              <Card key={order.id} className="bg-slate-800/40 border-slate-700 hover:border-violet-500/40 transition-colors">
                <CardContent className="p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex-1 min-w-[250px]">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-violet-300 font-bold">{order.employee_name}</span>
                        <Badge className="bg-slate-700 text-slate-300 text-[10px]">{order.employee_position}</Badge>
                        <Badge className={`${badge.className} border text-[10px]`}>{badge.label}</Badge>
                        <span className="text-slate-500 text-xs">{format(new Date(order.created_at), "dd/MM HH:mm", { locale: fr })}</span>
                      </div>
                      <p className="text-slate-300 text-xs">
                        {(order.items || []).map(it => `${it.quantity}× ${it.name}`).join(" · ")}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 mt-1">
                        <span className="text-slate-400 text-xs">Sous-total : <span className="text-white">{formatPrice(order.subtotal)} F</span></span>
                        <span className="text-slate-400 text-xs">Remise 50% : <span className="text-emerald-400">-{formatPrice(order.discount_amount)} F</span></span>
                        <span className="text-violet-300 font-bold">À retenir : {formatPrice(order.total)} F</span>
                      </div>
                      {(order.authorizations?.manager || order.authorizations?.director) && (
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          {order.authorizations?.manager && (
                            <span className="text-emerald-400 text-[10px] flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" /> Resp. Op.: {order.authorizations.manager.name}
                            </span>
                          )}
                          {order.authorizations?.director && (
                            <span className="text-emerald-400 text-[10px] flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" /> D.G.: {order.authorizations.director.name}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      {canManagerAuth && (
                        <Button size="sm" onClick={() => authorize(order, "manager")} className="bg-amber-600 hover:bg-amber-700 h-7 text-xs" data-testid={`mgr-auth-manager-${order.id}`}>
                          <ShieldCheck className="w-3 h-3 mr-1" /> Auto-confirmer (Resp. Op.)
                        </Button>
                      )}
                      {canDirectorAuth && (
                        <Button size="sm" onClick={() => authorize(order, "director")} className="bg-blue-600 hover:bg-blue-700 h-7 text-xs" data-testid={`mgr-auth-director-${order.id}`}>
                          <ShieldCheck className="w-3 h-3 mr-1" /> Autoriser (D.G.)
                        </Button>
                      )}
                      {canEdit && (
                        <Button size="sm" variant="ghost" onClick={() => openEditModal(order)} className="h-7 text-slate-400 hover:bg-slate-700">
                          <Edit2 className="w-3 h-3" />
                        </Button>
                      )}
                      {canCancel && (
                        <Button size="sm" variant="ghost" onClick={() => cancelOrder(order)} className="h-7 text-red-400 hover:bg-red-500/20" data-testid={`mgr-cancel-${order.id}`}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-violet-300 flex items-center gap-2">
              <UserCog className="w-5 h-5" />
              {editingOrder ? "Modifier la commande responsable op. & log" : "Nouvelle commande RESPONSABLE OP. & LOG"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-violet-900/15 border border-violet-500/30 rounded-lg p-3 space-y-3">
              <p className="text-violet-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                Identité de la responsable op. & log (obligatoire)
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-slate-300 text-xs mb-1 block">Nom de la responsable op. & log *</Label>
                  <Input
                    value={employeeName}
                    onChange={(e) => setEmployeeName(e.target.value)}
                    placeholder="Nom de la responsable op. & log en exercice"
                    className="bg-slate-800 border-slate-700 text-white"
                    data-testid="mgr-input-name"
                  />
                </div>
                <div>
                  <Label className="text-slate-300 text-xs mb-1 block">Poste</Label>
                  <Input
                    value="Responsable Op. & Log"
                    disabled
                    className="bg-slate-800/60 border-slate-700 text-slate-300"
                  />
                </div>
              </div>

              {capStatus && (
                <div className="bg-slate-900/50 rounded-md p-2.5 text-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-slate-400">Plafond mensuel ({capStatus.month}) :</span>
                    <span className={`font-bold ${capStatus.is_capped ? 'text-red-400' : 'text-emerald-300'}`}>
                      {formatPrice(capStatus.used)} / {formatPrice(MAX_PER_MONTH)} F
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${projectedUsed > MAX_PER_MONTH ? 'bg-red-500' : 'bg-violet-500'}`}
                      style={{ width: `${Math.min(100, (projectedUsed / MAX_PER_MONTH) * 100)}%` }}
                      data-testid="mgr-cap-bar"
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1.5 text-[10px]">
                    <span className="text-slate-500">Cette commande : <span className="text-violet-300">{formatPrice(totalAfter)} F</span></span>
                    {willExceedCap && (
                      <span className="text-red-400 font-bold flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Dépasse le plafond !</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label className="text-slate-300 text-xs mb-1 block">Rechercher un produit</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Nom du produit..." className="bg-slate-800 border-slate-700 text-white pl-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto">
              {filteredProducts.slice(0, 12).map(p => (
                <Button key={p.id} variant="outline" onClick={() => addProduct(p)} className="h-auto py-2 px-3 border-slate-600 text-left justify-start hover:bg-violet-500/20 hover:border-violet-500" data-testid={`mgr-add-product-${p.id}`}>
                  <div className="w-full">
                    <p className="text-white text-sm font-medium truncate">{p.name}</p>
                    <p className="text-amber-400 text-xs">{formatPrice(p.price)} F</p>
                  </div>
                </Button>
              ))}
            </div>

            {selectedItems.length > 0 && (
              <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 space-y-2">
                <p className="text-slate-400 text-xs font-bold uppercase">Commande</p>
                {selectedItems.map((it, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => decreaseProduct(it.product_id)} className="h-6 w-6 p-0 text-red-400 hover:bg-red-500/20"><Minus className="w-3 h-3" /></Button>
                      <span className="text-white text-sm">{it.quantity}× {it.name}</span>
                      <Button size="sm" variant="ghost" onClick={() => addProduct({ id: it.product_id, name: it.name, price: it.price })} className="h-6 w-6 p-0 text-green-400 hover:bg-green-500/20"><Plus className="w-3 h-3" /></Button>
                    </div>
                    <span className="text-amber-400 font-medium text-sm">{formatPrice(it.price * it.quantity)} F</span>
                  </div>
                ))}
                <div className="border-t border-slate-700 pt-2 space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Sous-total</span>
                    <span className="text-white">{formatPrice(subtotal)} F</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-emerald-400">Remise (50%)</span>
                    <span className="text-emerald-400">-{formatPrice(discount)} F</span>
                  </div>
                  <div className="flex items-center justify-between text-base">
                    <span className="text-violet-300 font-bold">À retenir sur salaire</span>
                    <span className="text-violet-300 font-bold" data-testid="mgr-total-after">{formatPrice(totalAfter)} F</span>
                  </div>
                </div>
              </div>
            )}

            <div>
              <Label className="text-slate-300 text-xs mb-1 block">Notes (optionnel)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes..." className="bg-slate-800 border-slate-700 text-white min-h-[60px]" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)} className="border-slate-600 text-slate-400">
              <X className="w-4 h-4 mr-1" /> Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={loading || willExceedCap || !employeeName.trim() || selectedItems.length === 0} className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50" data-testid="mgr-submit-btn">
              <Check className="w-4 h-4 mr-1" /> {editingOrder ? "Mettre à jour" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Closure Modal */}
      <Dialog open={showClosureModal} onOpenChange={setShowClosureModal}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-purple-300 flex items-center gap-2">
              <Lock className="w-5 h-5" /> Clôture mensuelle — Bons RESPONSABLE OP. & LOG
            </DialogTitle>
          </DialogHeader>
          {closurePreview && (
            <div className="space-y-3">
              <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3 text-sm">
                <p className="text-slate-300">Mois : <span className="text-white font-bold">{closurePreview.month}</span></p>
                <p className="text-slate-300">Commandes à clôturer : <span className="text-purple-300 font-bold">{closurePreview.total_count}</span></p>
                <p className="text-slate-300">Total à retenir sur salaire : <span className="text-violet-300 font-bold text-lg">{formatPrice(closurePreview.total_amount)} F</span></p>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1.5">
                {closurePreview.by_employee.map((e, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-800/50 rounded px-3 py-1.5">
                    <div>
                      <span className="text-white text-sm">{e.name}</span>
                      <span className="text-slate-500 text-xs ml-2">{e.position} · {e.count} cmd</span>
                    </div>
                    <span className="text-violet-300 font-bold text-sm">{formatPrice(e.total)} F</span>
                  </div>
                ))}
              </div>
              <p className="text-amber-400 text-xs flex items-start gap-1">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                Cette action est irréversible. Les commandes passeront en "Réglé sur salaire" et un PDF sera ouvert.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClosureModal(false)} className="border-slate-600 text-slate-400">
              Annuler
            </Button>
            <Button onClick={confirmClosure} disabled={loading} className="bg-purple-600 hover:bg-purple-700" data-testid="mgr-confirm-closure-btn">
              <Lock className="w-4 h-4 mr-1" /> Confirmer la clôture
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManagerOrdersTab;
