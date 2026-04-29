import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { 
  UserCircle, Plus, Check, X, Edit2, Trash2, 
  UtensilsCrossed, Calendar, AlertCircle, CheckCircle, Receipt,
  Search, Minus, FileText, Printer
} from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const MonsieurTab = ({ currentUser, formatPrice, products = [] }) => {
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({ total_unpaid: 0, total_paid: 0, count_unpaid: 0, count_paid: 0 });
  const [showModal, setShowModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  
  // Order creation state
  const [selectedItems, setSelectedItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const res = await axios.get(`${API}/monsieur-orders`);
      setOrders(res.data.orders || []);
      setStats(res.data.stats || { total_unpaid: 0, total_paid: 0, count_unpaid: 0, count_paid: 0 });
    } catch (error) {
      console.error("Error fetching monsieur orders:", error);
      // If endpoint doesn't exist yet, use the old one
      try {
        const res = await axios.get(`${API}/monsieur-purchases`);
        setOrders(res.data.purchases || []);
        setStats(res.data.stats || { total_unpaid: 0, total_paid: 0, count_unpaid: 0, count_paid: 0 });
      } catch (e) {
        console.error("Fallback also failed:", e);
      }
    }
  };

  const resetForm = () => {
    setSelectedItems([]);
    setSearchTerm("");
    setNotes("");
    setEditingOrder(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (order) => {
    setEditingOrder(order);
    setSelectedItems(order.items || []);
    setNotes(order.notes || "");
    setShowModal(true);
  };

  // Filter products based on search term
  const filteredProducts = products.filter(p => 
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Add product to order
  const addProduct = (product) => {
    const existing = selectedItems.find(item => item.product_id === product.id);
    if (existing) {
      setSelectedItems(selectedItems.map(item => 
        item.product_id === product.id 
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setSelectedItems([...selectedItems, {
        product_id: product.id,
        name: product.name,
        price: product.price,
        quantity: 1,
        category: product.category
      }]);
    }
  };

  // Remove or decrease product quantity
  const decreaseProduct = (productId) => {
    const existing = selectedItems.find(item => item.product_id === productId);
    if (existing && existing.quantity > 1) {
      setSelectedItems(selectedItems.map(item => 
        item.product_id === productId 
          ? { ...item, quantity: item.quantity - 1 }
          : item
      ));
    } else {
      setSelectedItems(selectedItems.filter(item => item.product_id !== productId));
    }
  };

  // Calculate total
  const calculateTotal = () => {
    return selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const handleSubmit = async () => {
    if (selectedItems.length === 0) {
      toast.error("Veuillez sélectionner au moins un produit");
      return;
    }

    const total = calculateTotal();
    const orderData = {
      items: selectedItems,
      total: total,
      notes: notes,
      created_by: currentUser?.name || "Gérante"
    };

    try {
      if (editingOrder) {
        await axios.put(`${API}/monsieur-orders/${editingOrder.id}`, orderData);
        toast.success("Commande modifiée avec succès");
      } else {
        await axios.post(`${API}/monsieur-orders`, orderData);
        toast.success("Commande Manager General enregistrée");
      }
      
      setShowModal(false);
      resetForm();
      fetchOrders();
    } catch (error) {
      console.error("Error saving order:", error);
      toast.error("Erreur lors de l'enregistrement");
    }
  };

  const [pendingPayment, setPendingPayment] = useState(null); // order being paid (modal open)
  const [paymentMethod, setPaymentMethod] = useState("especes");

  const toggleStatus = async (order) => {
    if (order.status === "regle") {
      // Annul: confirm + send directly
      if (!confirm("Annuler le règlement de cette commande ?\n\nLa facture Caisse liée sera marquée 'annulée' (le stock n'est pas réintégré).")) return;
      try {
        await axios.put(`${API}/monsieur-orders/${order.id}`, {
          status: "non_regle",
          paid_by: null,
        });
        toast.success("Règlement annulé · facture Caisse marquée 'annulée'");
        fetchOrders();
      } catch (error) {
        toast.error("Erreur lors de l'annulation");
      }
      return;
    }
    // unpaid -> paid: open the payment method picker
    setPaymentMethod("especes");
    setPendingPayment(order);
  };

  const confirmPayment = async () => {
    if (!pendingPayment) return;
    try {
      await axios.put(`${API}/monsieur-orders/${pendingPayment.id}`, {
        status: "regle",
        paid_by: currentUser?.name || "Gérante",
        payment_method: paymentMethod,
      });
      toast.success(`Réglée (${labelForMethod(paymentMethod)}) · ajoutée aux Factures du jour comme « Manager General »`);
      setPendingPayment(null);
      fetchOrders();
    } catch (error) {
      toast.error("Erreur lors du règlement");
    }
  };

  const labelForMethod = (m) => {
    switch (m) {
      case "especes": return "Espèces";
      case "virement": return "Virement";
      case "mobile_money": return "Mobile Money";
      case "cheque": return "Chèque";
      case "carte": return "Carte bancaire";
      case "compte_courant": return "Compte courant";
      default: return m;
    }
  };

  const deleteOrder = async (orderId) => {
    if (!confirm("Supprimer cette commande Manager General ?")) return;
    try {
      await axios.delete(`${API}/monsieur-orders/${orderId}`);
      toast.success("Commande supprimée");
      fetchOrders();
    } catch (error) {
      console.error("Error deleting order:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  const convertToInvoice = async (order) => {
    if (!confirm(`Passer cette commande (${formatPrice(order.total)} F) en facture ?`)) return;
    try {
      const invoiceData = {
        server_name: "Manager General",
        created_by: currentUser?.full_name || currentUser?.name || "Manager General",
        items: (order.items || []).map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          department: "salle_jardin"
        })),
        department: "salle_jardin",
        subtotal: order.total,
        total: order.total,
        discount: 0,
        discount_amount: 0,
        client_name: "Manager General",
        notes: order.notes || ""
      };
      const resp = await axios.post(`${API}/invoices`, invoiceData);
      const inv = resp.data?.invoice;
      toast.success(`Facture ${inv?.invoice_number || ''} creee a partir de la commande MG`);
      // Mark order as paid
      await axios.put(`${API}/monsieur-orders/${order.id}`, { status: "regle", paid_by: "Facture" });
      fetchOrders();
    } catch (error) {
      console.error("Error converting to invoice:", error);
      toast.error("Erreur lors de la conversion en facture");
    }
  };

  const printOrder = (order) => {
    const w = window.open('', '_blank', 'width=350,height=500');
    const itemsHtml = (order.items || []).map(i => 
      `<tr><td>${i.quantity}x ${i.name}</td><td style="text-align:right">${formatPrice(i.price * i.quantity)} F</td></tr>`
    ).join('');
    w.document.write(`
      <html><head><title>Bon Manager General</title>
      <style>body{font-family:monospace;font-size:12px;padding:10px}table{width:100%;border-collapse:collapse}td{padding:3px 0}hr{border:none;border-top:1px dashed #000}.total{font-size:16px;font-weight:bold;text-align:center;margin:10px 0}</style>
      </head><body>
      <div style="text-align:center"><strong>ESPACE MAXO</strong><br>Manager General</div>
      <hr>
      <p>Date: ${format(new Date(order.created_at), "dd/MM/yyyy HH:mm", { locale: fr })}</p>
      <p>Statut: ${order.status === 'regle' ? 'REGLE' : 'NON REGLE'}</p>
      <hr>
      <table>${itemsHtml}</table>
      <hr>
      <div class="total">TOTAL: ${formatPrice(order.total)} F</div>
      ${order.notes ? `<p>Notes: ${order.notes}</p>` : ''}
      <hr>
      <div style="text-align:center;font-size:10px;margin-top:10px">Espace Maxo - Cotonou</div>
      </body></html>
    `);
    w.document.close();
    w.print();
  };

  // Affiche STRICTEMENT les commandes non réglées (les réglées sont basculées en factures Caisse)
  const visibleOrders = orders.filter(o => o.status !== "regle");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-purple-300 flex items-center gap-2">
          <UserCircle className="w-6 h-6" />
          Commandes Manager General
          <Badge className="bg-purple-500/30 text-purple-300 ml-2">
            Promoteur
          </Badge>
        </h2>
        <Button 
          onClick={openCreateModal}
          className="bg-purple-600 hover:bg-purple-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nouvelle Commande
        </Button>
      </div>

      {/* Stats Cards — uniquement non réglés (les réglées sont automatiquement basculées en facture Caisse) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="bg-gradient-to-br from-red-900/30 to-red-800/20 border-red-500/30">
          <CardContent className="p-4 text-center">
            <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-red-400">{formatPrice(stats.total_unpaid)} F</p>
            <p className="text-xs text-red-300/70">À encaisser ({stats.count_unpaid})</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 border-purple-500/30">
          <CardContent className="p-4 text-center">
            <CheckCircle className="w-6 h-6 text-purple-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-purple-400">{stats.count_paid}</p>
            <p className="text-xs text-purple-300/70">Déjà réglées (basculées en factures Caisse)</p>
          </CardContent>
        </Card>
      </div>

      {/* Info banner */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-xs text-amber-200 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <span>
          ℹ️ Cette vue n'affiche que les commandes <strong className="text-amber-300">non réglées</strong>.
          Dès qu'une commande est encaissée, elle disparaît d'ici et apparaît dans les <strong className="text-emerald-300">Factures du jour</strong> de la Caisse.
        </span>
      </div>

      {/* Orders List — uniquement non réglées */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-4">
          {visibleOrders.length === 0 ? (
            <div className="text-center py-8 text-slate-500" data-testid="monsieur-empty-state">
              <UtensilsCrossed className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Aucune commande en attente de paiement</p>
              <p className="text-xs mt-1 text-slate-600">Les commandes réglées sont automatiquement basculées dans les Factures du jour.</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="bg-red-500/20 text-red-300 border border-red-500/40 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide flex items-center gap-1.5">
                  <X className="w-3 h-3" />
                  À encaisser
                </span>
                <span className="text-red-400 text-sm font-medium">
                  {visibleOrders.length} facture{visibleOrders.length > 1 ? "s" : ""}
                </span>
                <span className="text-slate-500 text-xs">
                  · Total {formatPrice(visibleOrders.reduce((s, o) => s + (o.total || 0), 0))} F
                </span>
              </div>
              <div className="space-y-3" data-testid="unpaid-section">
                {visibleOrders.map(order => (
                  <div
                    key={order.id}
                    className="rounded-lg p-4 border bg-red-900/20 border-red-500/30"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <Badge className="text-xs bg-red-500/20 text-red-400">
                            ✗ Non réglé
                          </Badge>
                          <Badge className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/40">
                            ⏸ En attente d'encaissement
                          </Badge>
                          <span className="text-slate-500 text-xs">
                            {format(new Date(order.created_at), "dd/MM/yyyy à HH:mm", { locale: fr })}
                          </span>
                        </div>

                        {/* Items list */}
                        <div className="space-y-1 mb-2">
                          {(order.items || []).map((item, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span className="text-slate-300">
                                {item.quantity}x {item.name}
                              </span>
                              <span className="text-slate-400">
                                {formatPrice(item.price * item.quantity)} F
                              </span>
                            </div>
                          ))}
                        </div>

                        <p className="text-xl font-bold text-red-400">
                          Total: {formatPrice(order.total)} F
                        </p>

                        {order.notes && (
                          <p className="text-slate-400 text-sm mt-2 italic">"{order.notes}"</p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => printOrder(order)}
                          className="bg-slate-600 hover:bg-slate-700"
                          data-testid={`print-order-${order.id}`}
                        >
                          <Printer className="w-4 h-4 mr-1" /> Imprimer
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => toggleStatus(order)}
                          title="Cliquer pour MARQUER comme RÉGLÉE (bascule en facture Caisse)"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/40 shadow-md animate-pulse"
                          data-testid={`toggle-paid-${order.id}`}
                        >
                          <Check className="w-4 h-4 mr-1" /> Encaisser maintenant
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditModal(order)}
                          className="border-slate-600 text-slate-400 hover:bg-slate-700"
                          data-testid={`edit-order-${order.id}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteOrder(order.id)}
                          className="border-red-600/50 text-red-400 hover:bg-red-600/20"
                          data-testid={`delete-order-${order.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={(open) => {
        setShowModal(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-400">
              <UtensilsCrossed className="w-5 h-5" />
              {editingOrder ? "Modifier la commande" : "Nouvelle commande Manager General"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Search Products */}
            <div>
              <Label className="text-slate-400 text-sm">Rechercher un produit</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Rechercher..."
                  className="bg-slate-900/50 border-slate-700 text-white pl-10"
                />
              </div>
            </div>
            
            {/* Products Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
              {filteredProducts.slice(0, 12).map(product => (
                <Button
                  key={product.id}
                  variant="outline"
                  onClick={() => addProduct(product)}
                  className="h-auto py-2 px-3 border-slate-600 text-left justify-start hover:bg-purple-500/20 hover:border-purple-500"
                >
                  <div className="w-full">
                    <p className="text-white text-sm font-medium truncate">{product.name}</p>
                    <p className="text-amber-400 text-xs">{formatPrice(product.price)} F</p>
                  </div>
                </Button>
              ))}
            </div>
            
            {/* Selected Items */}
            {selectedItems.length > 0 && (
              <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700">
                <h4 className="text-slate-400 text-sm mb-2">Commande</h4>
                <div className="space-y-2">
                  {selectedItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => decreaseProduct(item.product_id)}
                          className="h-6 w-6 p-0 text-red-400 hover:bg-red-500/20"
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="text-white text-sm">
                          {item.quantity}x {item.name}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => addProduct({ id: item.product_id, name: item.name, price: item.price })}
                          className="h-6 w-6 p-0 text-green-400 hover:bg-green-500/20"
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                      <span className="text-amber-400 font-medium">
                        {formatPrice(item.price * item.quantity)} F
                      </span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-slate-700 mt-3 pt-3 flex justify-between">
                  <span className="text-white font-bold">TOTAL</span>
                  <span className="text-purple-400 font-bold text-lg">{formatPrice(calculateTotal())} F</span>
                </div>
              </div>
            )}
            
            {/* Notes */}
            <div>
              <Label className="text-slate-400 text-sm">Notes (optionnel)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes sur la commande..."
                className="bg-slate-900/50 border-slate-700 text-white mt-1 min-h-[60px]"
              />
            </div>
            
            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleSubmit}
                disabled={selectedItems.length === 0}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
              >
                {editingOrder ? "Modifier" : "Enregistrer"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowModal(false)}
                className="border-slate-600 text-slate-400"
              >
                Annuler
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment method picker */}
      <Dialog open={!!pendingPayment} onOpenChange={(v) => !v && setPendingPayment(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md" data-testid="payment-method-dialog">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Receipt className="w-5 h-5 text-emerald-400" />
              Encaisser cette commande
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-slate-800/40 border border-slate-700 rounded p-3 space-y-1">
              <p className="text-slate-400 text-xs">Total à encaisser</p>
              <p className="text-white text-2xl font-bold">{formatPrice(pendingPayment?.total || 0)} F CFA</p>
              <p className="text-slate-500 text-xs">Sera ajoutée aux Factures du jour avec le client « Manager General »</p>
            </div>
            <div>
              <Label className="text-slate-300 text-sm mb-2 block">Mode de règlement</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "especes", label: "Espèces", icon: "💵" },
                  { id: "virement", label: "Virement", icon: "🏦" },
                  { id: "mobile_money", label: "Mobile Money", icon: "📱" },
                  { id: "cheque", label: "Chèque", icon: "📝" },
                  { id: "carte", label: "Carte bancaire", icon: "💳" },
                  { id: "compte_courant", label: "Compte courant", icon: "📒" },
                ].map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    data-testid={`pay-method-${m.id}`}
                    className={`px-3 py-2.5 rounded-lg border text-left transition-colors ${
                      paymentMethod === m.id
                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-200"
                        : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    <span className="mr-1.5">{m.icon}</span>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-700">
              <Button variant="outline" onClick={() => setPendingPayment(null)} className="border-slate-600 text-slate-400">
                <X className="w-4 h-4 mr-1" /> Annuler
              </Button>
              <Button onClick={confirmPayment} className="bg-emerald-600 hover:bg-emerald-700" data-testid="confirm-payment-btn">
                <Check className="w-4 h-4 mr-1" /> Confirmer le règlement
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MonsieurTab;
