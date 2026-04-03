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
  FileText, Calendar, AlertCircle, CheckCircle, Receipt
} from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const MonsieurTab = ({ currentUser, formatPrice }) => {
  const [purchases, setPurchases] = useState([]);
  const [stats, setStats] = useState({ total_unpaid: 0, total_paid: 0, count_unpaid: 0, count_paid: 0 });
  const [showModal, setShowModal] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [filter, setFilter] = useState("all"); // all, non_regle, regle
  
  const [formData, setFormData] = useState({
    description: "",
    amount: "",
    supplier: "",
    invoice_number: "",
    invoice_date: format(new Date(), "yyyy-MM-dd"),
    notes: ""
  });

  useEffect(() => {
    fetchPurchases();
  }, []);

  const fetchPurchases = async () => {
    try {
      const res = await axios.get(`${API}/monsieur-purchases`);
      setPurchases(res.data.purchases || []);
      setStats(res.data.stats || { total_unpaid: 0, total_paid: 0, count_unpaid: 0, count_paid: 0 });
    } catch (error) {
      console.error("Error fetching monsieur purchases:", error);
      toast.error("Erreur lors du chargement des achats Monsieur");
    }
  };

  const resetForm = () => {
    setFormData({
      description: "",
      amount: "",
      supplier: "",
      invoice_number: "",
      invoice_date: format(new Date(), "yyyy-MM-dd"),
      notes: ""
    });
    setEditingPurchase(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (purchase) => {
    setEditingPurchase(purchase);
    setFormData({
      description: purchase.description || "",
      amount: purchase.amount || "",
      supplier: purchase.supplier || "",
      invoice_number: purchase.invoice_number || "",
      invoice_date: purchase.invoice_date || format(new Date(), "yyyy-MM-dd"),
      notes: purchase.notes || ""
    });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!formData.description || !formData.amount) {
      toast.error("Veuillez remplir la description et le montant");
      return;
    }

    try {
      if (editingPurchase) {
        await axios.put(`${API}/monsieur-purchases/${editingPurchase.id}`, {
          ...formData,
          amount: parseFloat(formData.amount)
        });
        toast.success("Achat modifié avec succès");
      } else {
        await axios.post(`${API}/monsieur-purchases`, {
          ...formData,
          amount: parseFloat(formData.amount),
          created_by: currentUser?.name || "Gérante"
        });
        toast.success("Achat enregistré avec succès");
      }
      
      setShowModal(false);
      resetForm();
      fetchPurchases();
    } catch (error) {
      console.error("Error saving purchase:", error);
      toast.error("Erreur lors de l'enregistrement");
    }
  };

  const toggleStatus = async (purchase) => {
    const newStatus = purchase.status === "regle" ? "non_regle" : "regle";
    try {
      await axios.put(`${API}/monsieur-purchases/${purchase.id}`, {
        status: newStatus,
        paid_by: newStatus === "regle" ? (currentUser?.name || "Gérante") : null
      });
      toast.success(newStatus === "regle" ? "Marqué comme réglé" : "Marqué comme non réglé");
      fetchPurchases();
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Erreur lors de la mise à jour du statut");
    }
  };

  const deletePurchase = async (purchaseId) => {
    if (!confirm("Supprimer cet achat ?")) return;
    try {
      await axios.delete(`${API}/monsieur-purchases/${purchaseId}`);
      toast.success("Achat supprimé");
      fetchPurchases();
    } catch (error) {
      console.error("Error deleting purchase:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  const filteredPurchases = purchases.filter(p => {
    if (filter === "all") return true;
    return p.status === filter;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-purple-300 flex items-center gap-2">
          <UserCircle className="w-6 h-6" />
          Achats Monsieur
          <Badge className="bg-purple-500/30 text-purple-300 ml-2">
            Propriétaire
          </Badge>
        </h2>
        <Button 
          onClick={openCreateModal}
          className="bg-purple-600 hover:bg-purple-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nouvel Achat
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-red-900/30 to-red-800/20 border-red-500/30">
          <CardContent className="p-4 text-center">
            <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-red-400">{formatPrice(stats.total_unpaid)} F</p>
            <p className="text-xs text-red-300/70">Non réglés ({stats.count_unpaid})</p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-green-900/30 to-green-800/20 border-green-500/30">
          <CardContent className="p-4 text-center">
            <CheckCircle className="w-6 h-6 text-green-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-green-400">{formatPrice(stats.total_paid)} F</p>
            <p className="text-xs text-green-300/70">Réglés ({stats.count_paid})</p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 border-purple-500/30 col-span-2">
          <CardContent className="p-4 text-center">
            <Receipt className="w-6 h-6 text-purple-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-purple-400">{formatPrice(stats.total_unpaid + stats.total_paid)} F</p>
            <p className="text-xs text-purple-300/70">Total général</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant={filter === "all" ? "default" : "outline"}
          onClick={() => setFilter("all")}
          className={filter === "all" ? "bg-purple-600" : "border-slate-600 text-slate-400"}
        >
          Tous ({purchases.length})
        </Button>
        <Button
          size="sm"
          variant={filter === "non_regle" ? "default" : "outline"}
          onClick={() => setFilter("non_regle")}
          className={filter === "non_regle" ? "bg-red-600" : "border-red-500/50 text-red-400"}
        >
          Non réglés ({stats.count_unpaid})
        </Button>
        <Button
          size="sm"
          variant={filter === "regle" ? "default" : "outline"}
          onClick={() => setFilter("regle")}
          className={filter === "regle" ? "bg-green-600" : "border-green-500/50 text-green-400"}
        >
          Réglés ({stats.count_paid})
        </Button>
      </div>

      {/* Purchases List */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-4">
          {filteredPurchases.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <UserCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Aucun achat enregistré</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPurchases.map(purchase => (
                <div 
                  key={purchase.id}
                  className={`rounded-lg p-4 border ${
                    purchase.status === "regle" 
                      ? "bg-green-900/20 border-green-500/30" 
                      : "bg-red-900/20 border-red-500/30"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`text-xs ${
                          purchase.status === "regle" 
                            ? "bg-green-500/20 text-green-400" 
                            : "bg-red-500/20 text-red-400"
                        }`}>
                          {purchase.status === "regle" ? "✓ Réglé" : "✗ Non réglé"}
                        </Badge>
                        {purchase.invoice_number && (
                          <Badge className="bg-slate-600/30 text-slate-400 text-xs">
                            N° {purchase.invoice_number}
                          </Badge>
                        )}
                      </div>
                      <p className="text-white font-medium mt-1">{purchase.description}</p>
                      <p className={`text-xl font-bold ${
                        purchase.status === "regle" ? "text-green-400" : "text-red-400"
                      }`}>
                        {formatPrice(purchase.amount)} F
                      </p>
                      <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                        {purchase.supplier && <p>Fournisseur: {purchase.supplier}</p>}
                        {purchase.invoice_date && (
                          <p>Date facture: {format(new Date(purchase.invoice_date), "dd/MM/yyyy", { locale: fr })}</p>
                        )}
                        <p>Créé le: {format(new Date(purchase.created_at), "dd/MM/yyyy à HH:mm", { locale: fr })}</p>
                        {purchase.status === "regle" && purchase.paid_at && (
                          <p className="text-green-400">
                            Réglé le: {format(new Date(purchase.paid_at), "dd/MM/yyyy", { locale: fr })}
                            {purchase.paid_by && ` par ${purchase.paid_by}`}
                          </p>
                        )}
                      </div>
                      {purchase.notes && (
                        <p className="text-slate-400 text-sm mt-2 italic">"{purchase.notes}"</p>
                      )}
                    </div>
                    
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => toggleStatus(purchase)}
                        className={purchase.status === "regle" 
                          ? "bg-red-600 hover:bg-red-700" 
                          : "bg-green-600 hover:bg-green-700"
                        }
                      >
                        {purchase.status === "regle" ? (
                          <><X className="w-4 h-4 mr-1" /> Non réglé</>
                        ) : (
                          <><Check className="w-4 h-4 mr-1" /> Réglé</>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditModal(purchase)}
                        className="border-slate-600 text-slate-400 hover:bg-slate-700"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deletePurchase(purchase.id)}
                        className="border-red-600/50 text-red-400 hover:bg-red-600/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={(open) => {
        setShowModal(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-400">
              <UserCircle className="w-5 h-5" />
              {editingPurchase ? "Modifier l'achat" : "Nouvel achat Monsieur"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-slate-400 text-sm">Description *</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Ex: Matériaux de construction"
                className="bg-slate-900/50 border-slate-700 text-white mt-1"
              />
            </div>
            
            <div>
              <Label className="text-slate-400 text-sm">Montant (F CFA) *</Label>
              <Input
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="0"
                className="bg-slate-900/50 border-slate-700 text-white mt-1"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-slate-400 text-sm">Fournisseur</Label>
                <Input
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  placeholder="Nom du fournisseur"
                  className="bg-slate-900/50 border-slate-700 text-white mt-1"
                />
              </div>
              <div>
                <Label className="text-slate-400 text-sm">N° Facture</Label>
                <Input
                  value={formData.invoice_number}
                  onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                  placeholder="FAC-001"
                  className="bg-slate-900/50 border-slate-700 text-white mt-1"
                />
              </div>
            </div>
            
            <div>
              <Label className="text-slate-400 text-sm">Date de facture</Label>
              <Input
                type="date"
                value={formData.invoice_date}
                onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                className="bg-slate-900/50 border-slate-700 text-white mt-1"
              />
            </div>
            
            <div>
              <Label className="text-slate-400 text-sm">Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notes supplémentaires..."
                className="bg-slate-900/50 border-slate-700 text-white mt-1 min-h-[80px]"
              />
            </div>
            
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleSubmit}
                className="flex-1 bg-purple-600 hover:bg-purple-700"
              >
                {editingPurchase ? "Modifier" : "Enregistrer"}
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
    </div>
  );
};

export default MonsieurTab;
