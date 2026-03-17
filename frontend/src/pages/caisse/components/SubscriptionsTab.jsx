/**
 * SubscriptionsTab - Gestion des Abonnements et Factures Récurrentes
 * Pour la Gérante et l'Admin
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { 
  Plus, Edit2, Trash2, CreditCard, Calendar, AlertTriangle, 
  CheckCircle, Clock, Building2, User, Wifi, Tv, Home, Zap, 
  Droplets, Phone, Shield, MoreHorizontal, RefreshCw, Receipt,
  TrendingUp, TrendingDown, Bell, X
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Category configuration
const CATEGORY_CONFIG = {
  internet: { label: 'Internet', icon: Wifi, color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  tv: { label: 'TV / Canal+', icon: Tv, color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
  loyer: { label: 'Loyer', icon: Home, color: 'text-amber-400', bgColor: 'bg-amber-500/20' },
  electricite: { label: 'Électricité', icon: Zap, color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' },
  eau: { label: 'Eau', icon: Droplets, color: 'text-cyan-400', bgColor: 'bg-cyan-500/20' },
  telephone: { label: 'Téléphone', icon: Phone, color: 'text-green-400', bgColor: 'bg-green-500/20' },
  assurance: { label: 'Assurance', icon: Shield, color: 'text-indigo-400', bgColor: 'bg-indigo-500/20' },
  autre: { label: 'Autre', icon: MoreHorizontal, color: 'text-slate-400', bgColor: 'bg-slate-500/20' }
};

const FREQUENCY_LABELS = {
  weekly: 'Hebdomadaire',
  monthly: 'Mensuel',
  quarterly: 'Trimestriel',
  yearly: 'Annuel'
};

const PAYMENT_METHODS = {
  especes: 'Espèces',
  carte: 'Carte',
  mobile_money: 'Mobile Money',
  cheque: 'Chèque',
  virement: 'Virement'
};

const formatPrice = (price) => {
  return new Intl.NumberFormat('fr-FR').format(price || 0);
};

export default function SubscriptionsTab({ currentUser }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [alerts, setAlerts] = useState({ upcoming: [], overdue: [], due_today: [] });
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [filter, setFilter] = useState({ type: 'all', category: 'all' });

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    type: 'supplier',
    category: 'autre',
    contact_name: '',
    contact_phone: '',
    amount: '',
    frequency: 'monthly',
    start_date: new Date().toISOString().split('T')[0],
    next_due_date: new Date().toISOString().split('T')[0],
    payment_method: 'especes',
    notes: '',
    is_active: true
  });

  // Payment form state
  const [paymentData, setPaymentData] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'especes',
    notes: ''
  });

  useEffect(() => {
    fetchSubscriptions();
  }, [filter]);

  const fetchSubscriptions = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter.type !== 'all') params.append('type', filter.type);
      if (filter.category !== 'all') params.append('category', filter.category);
      
      const res = await axios.get(`${API}/subscriptions?${params.toString()}`);
      setSubscriptions(res.data.subscriptions || []);
      setAlerts(res.data.alerts || { upcoming: [], overdue: [], due_today: [] });
      setStats(res.data.stats || {});
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      toast.error('Erreur lors du chargement des abonnements');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingSubscription) {
        await axios.put(`${API}/subscriptions/${editingSubscription.id}`, formData);
        toast.success('Abonnement modifié avec succès');
      } else {
        await axios.post(`${API}/subscriptions`, formData);
        toast.success('Abonnement créé avec succès');
      }
      setShowForm(false);
      setEditingSubscription(null);
      resetForm();
      fetchSubscriptions();
    } catch (error) {
      console.error('Error saving subscription:', error);
      toast.error('Erreur lors de l\'enregistrement');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cet abonnement ?')) return;
    try {
      await axios.delete(`${API}/subscriptions/${id}`);
      toast.success('Abonnement supprimé');
      fetchSubscriptions();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/subscriptions/${selectedSubscription.id}/pay`, {
        subscription_id: selectedSubscription.id,
        amount: parseFloat(paymentData.amount),
        payment_date: paymentData.payment_date,
        payment_method: paymentData.payment_method,
        notes: paymentData.notes
      });
      toast.success('Paiement enregistré');
      setShowPaymentModal(false);
      setSelectedSubscription(null);
      setPaymentData({
        amount: '',
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'especes',
        notes: ''
      });
      fetchSubscriptions();
    } catch (error) {
      toast.error('Erreur lors de l\'enregistrement du paiement');
    }
  };

  const openDetail = async (subscription) => {
    setSelectedSubscription(subscription);
    try {
      const res = await axios.get(`${API}/subscriptions/${subscription.id}`);
      setPaymentHistory(res.data.payments || []);
      setShowDetailModal(true);
    } catch (error) {
      toast.error('Erreur lors du chargement des détails');
    }
  };

  const openEdit = (subscription) => {
    setEditingSubscription(subscription);
    setFormData({
      name: subscription.name,
      type: subscription.type,
      category: subscription.category,
      contact_name: subscription.contact_name,
      contact_phone: subscription.contact_phone || '',
      amount: subscription.amount.toString(),
      frequency: subscription.frequency,
      start_date: subscription.start_date,
      next_due_date: subscription.next_due_date,
      payment_method: subscription.payment_method || 'especes',
      notes: subscription.notes || '',
      is_active: subscription.is_active
    });
    setShowForm(true);
  };

  const openPayment = (subscription) => {
    setSelectedSubscription(subscription);
    setPaymentData({
      amount: subscription.amount.toString(),
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: subscription.payment_method || 'especes',
      notes: ''
    });
    setShowPaymentModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'supplier',
      category: 'autre',
      contact_name: '',
      contact_phone: '',
      amount: '',
      frequency: 'monthly',
      start_date: new Date().toISOString().split('T')[0],
      next_due_date: new Date().toISOString().split('T')[0],
      payment_method: 'especes',
      notes: '',
      is_active: true
    });
  };

  const getDaysUntilDueClass = (days) => {
    if (days < 0) return 'text-red-400 bg-red-500/20';
    if (days === 0) return 'text-orange-400 bg-orange-500/20';
    if (days <= 3) return 'text-amber-400 bg-amber-500/20';
    return 'text-green-400 bg-green-500/20';
  };

  const getDaysUntilDueText = (days) => {
    if (days < 0) return `En retard de ${Math.abs(days)} jour(s)`;
    if (days === 0) return 'Échéance aujourd\'hui';
    if (days === 1) return 'Échéance demain';
    return `Dans ${days} jours`;
  };

  // Calculate total alerts for display
  const totalAlerts = (alerts.overdue?.length || 0) + (alerts.upcoming?.length || 0) + (alerts.due_today?.length || 0);

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <RefreshCw className="w-6 h-6 text-teal-400" />
            Abonnements & Factures Récurrentes
          </h2>
          <p className="text-slate-400 mt-1">Gérez vos abonnements clients et fournisseurs</p>
        </div>
        <Button 
          onClick={() => { resetForm(); setEditingSubscription(null); setShowForm(true); }}
          className="bg-teal-600 hover:bg-teal-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nouvel Abonnement
        </Button>
      </div>

      {/* Alerts Section */}
      {totalAlerts > 0 && (
        <Card className="bg-gradient-to-r from-red-900/30 to-orange-900/30 border-red-500/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <Bell className="w-5 h-5 text-red-400 animate-pulse" />
              <span className="text-white font-semibold">Alertes ({totalAlerts})</span>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              {alerts.overdue?.length > 0 && (
                <div className="p-3 bg-red-500/20 rounded-lg border border-red-500/30">
                  <div className="flex items-center gap-2 text-red-400 font-medium mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    En retard ({alerts.overdue.length})
                  </div>
                  <div className="space-y-1 text-sm">
                    {alerts.overdue.slice(0, 3).map(sub => (
                      <div key={sub.id} className="text-slate-300 truncate">
                        {sub.name} - {formatPrice(sub.amount)} F
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {alerts.due_today?.length > 0 && (
                <div className="p-3 bg-orange-500/20 rounded-lg border border-orange-500/30">
                  <div className="flex items-center gap-2 text-orange-400 font-medium mb-2">
                    <Clock className="w-4 h-4" />
                    Aujourd'hui ({alerts.due_today.length})
                  </div>
                  <div className="space-y-1 text-sm">
                    {alerts.due_today.slice(0, 3).map(sub => (
                      <div key={sub.id} className="text-slate-300 truncate">
                        {sub.name} - {formatPrice(sub.amount)} F
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {alerts.upcoming?.length > 0 && (
                <div className="p-3 bg-amber-500/20 rounded-lg border border-amber-500/30">
                  <div className="flex items-center gap-2 text-amber-400 font-medium mb-2">
                    <Calendar className="w-4 h-4" />
                    Prochains 3 jours ({alerts.upcoming.length})
                  </div>
                  <div className="space-y-1 text-sm">
                    {alerts.upcoming.slice(0, 3).map(sub => (
                      <div key={sub.id} className="text-slate-300 truncate">
                        {sub.name} - {formatPrice(sub.amount)} F
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-teal-900/30 to-cyan-900/20 border-teal-500/50">
          <CardContent className="p-4 text-center">
            <RefreshCw className="w-6 h-6 text-teal-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-teal-400">{stats.total || 0}</p>
            <p className="text-slate-400 text-xs">Total Abonnements</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-900/30 to-indigo-900/20 border-blue-500/50">
          <CardContent className="p-4 text-center">
            <User className="w-6 h-6 text-blue-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-blue-400">{stats.client_count || 0}</p>
            <p className="text-slate-400 text-xs">Clients</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-900/30 to-pink-900/20 border-purple-500/50">
          <CardContent className="p-4 text-center">
            <Building2 className="w-6 h-6 text-purple-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-purple-400">{stats.supplier_count || 0}</p>
            <p className="text-slate-400 text-xs">Fournisseurs</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-900/30 to-orange-900/20 border-amber-500/50">
          <CardContent className="p-4 text-center">
            <TrendingDown className="w-6 h-6 text-amber-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-amber-400">{formatPrice(stats.monthly_total_suppliers || 0)} F</p>
            <p className="text-slate-400 text-xs">Charges Mensuelles</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filter.type} onValueChange={(v) => setFilter(f => ({ ...f, type: v }))}>
          <SelectTrigger className="w-40 bg-slate-800 border-slate-600 text-white">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-600">
            <SelectItem value="all" className="text-white">Tous les types</SelectItem>
            <SelectItem value="client" className="text-blue-400">Clients</SelectItem>
            <SelectItem value="supplier" className="text-purple-400">Fournisseurs</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filter.category} onValueChange={(v) => setFilter(f => ({ ...f, category: v }))}>
          <SelectTrigger className="w-40 bg-slate-800 border-slate-600 text-white">
            <SelectValue placeholder="Catégorie" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-600">
            <SelectItem value="all" className="text-white">Toutes catégories</SelectItem>
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key} className={config.color}>{config.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Subscriptions List */}
      {loading ? (
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 text-teal-400 mx-auto animate-spin mb-3" />
          <p className="text-slate-400">Chargement...</p>
        </div>
      ) : subscriptions.length === 0 ? (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="py-12 text-center">
            <RefreshCw className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">Aucun abonnement trouvé</p>
            <p className="text-slate-500 text-sm mt-1">Créez votre premier abonnement</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subscriptions.map(sub => {
            const CategoryIcon = CATEGORY_CONFIG[sub.category]?.icon || MoreHorizontal;
            const categoryConfig = CATEGORY_CONFIG[sub.category] || CATEGORY_CONFIG.autre;
            
            return (
              <Card 
                key={sub.id} 
                className={`bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-colors cursor-pointer ${
                  sub.days_until_due < 0 ? 'border-l-4 border-l-red-500' : 
                  sub.days_until_due === 0 ? 'border-l-4 border-l-orange-500' :
                  sub.days_until_due <= 3 ? 'border-l-4 border-l-amber-500' : ''
                }`}
                onClick={() => openDetail(sub)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${categoryConfig.bgColor}`}>
                        <CategoryIcon className={`w-5 h-5 ${categoryConfig.color}`} />
                      </div>
                      <div>
                        <h3 className="text-white font-medium">{sub.name}</h3>
                        <p className="text-slate-400 text-sm">{sub.contact_name}</p>
                      </div>
                    </div>
                    <Badge className={sub.type === 'client' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}>
                      {sub.type === 'client' ? 'Client' : 'Fournisseur'}
                    </Badge>
                  </div>

                  <div className="space-y-2 mb-3">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-sm">Montant</span>
                      <span className="text-amber-400 font-bold">{formatPrice(sub.amount)} F</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-sm">Fréquence</span>
                      <span className="text-white">{FREQUENCY_LABELS[sub.frequency]}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-sm">Prochaine échéance</span>
                      <span className="text-white">{new Date(sub.next_due_date).toLocaleDateString('fr-FR')}</span>
                    </div>
                  </div>

                  {sub.days_until_due !== undefined && (
                    <div className={`text-center py-2 rounded-lg text-sm font-medium ${getDaysUntilDueClass(sub.days_until_due)}`}>
                      {getDaysUntilDueText(sub.days_until_due)}
                    </div>
                  )}

                  <div className="flex gap-2 mt-3" onClick={e => e.stopPropagation()}>
                    <Button 
                      size="sm" 
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      onClick={() => openPayment(sub)}
                    >
                      <CreditCard className="w-3 h-3 mr-1" />
                      Payer
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="border-slate-600 hover:bg-slate-700"
                      onClick={() => openEdit(sub)}
                    >
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="border-red-500/50 text-red-400 hover:bg-red-500/20"
                      onClick={() => handleDelete(sub.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-teal-400" />
              {editingSubscription ? 'Modifier l\'abonnement' : 'Nouvel Abonnement'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-400">Type *</Label>
                <Select value={formData.type} onValueChange={v => setFormData(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="bg-slate-900 border-slate-600 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    <SelectItem value="client" className="text-blue-400">Client (Recettes)</SelectItem>
                    <SelectItem value="supplier" className="text-purple-400">Fournisseur (Charges)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-400">Catégorie *</Label>
                <Select value={formData.category} onValueChange={v => setFormData(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="bg-slate-900 border-slate-600 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key} className={config.color}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-slate-400">Nom de l'abonnement *</Label>
              <Input
                value={formData.name}
                onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Internet Orange, Canal+, Loyer..."
                className="bg-slate-900 border-slate-600 text-white mt-1"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-400">{formData.type === 'client' ? 'Nom du client' : 'Nom du fournisseur'} *</Label>
                <Input
                  value={formData.contact_name}
                  onChange={e => setFormData(f => ({ ...f, contact_name: e.target.value }))}
                  placeholder="Nom..."
                  className="bg-slate-900 border-slate-600 text-white mt-1"
                  required
                />
              </div>
              <div>
                <Label className="text-slate-400">Téléphone</Label>
                <Input
                  value={formData.contact_phone}
                  onChange={e => setFormData(f => ({ ...f, contact_phone: e.target.value }))}
                  placeholder="Téléphone..."
                  className="bg-slate-900 border-slate-600 text-white mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-400">Montant (FCFA) *</Label>
                <Input
                  type="number"
                  value={formData.amount}
                  onChange={e => setFormData(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                  className="bg-slate-900 border-slate-600 text-white mt-1"
                  required
                  min="0"
                />
              </div>
              <div>
                <Label className="text-slate-400">Fréquence *</Label>
                <Select value={formData.frequency} onValueChange={v => setFormData(f => ({ ...f, frequency: v }))}>
                  <SelectTrigger className="bg-slate-900 border-slate-600 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    <SelectItem value="weekly" className="text-white">Hebdomadaire</SelectItem>
                    <SelectItem value="monthly" className="text-white">Mensuel</SelectItem>
                    <SelectItem value="quarterly" className="text-white">Trimestriel</SelectItem>
                    <SelectItem value="yearly" className="text-white">Annuel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-400">Date de début</Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={e => setFormData(f => ({ ...f, start_date: e.target.value }))}
                  className="bg-slate-900 border-slate-600 text-white mt-1"
                />
              </div>
              <div>
                <Label className="text-slate-400">Prochaine échéance *</Label>
                <Input
                  type="date"
                  value={formData.next_due_date}
                  onChange={e => setFormData(f => ({ ...f, next_due_date: e.target.value }))}
                  className="bg-slate-900 border-slate-600 text-white mt-1"
                  required
                />
              </div>
            </div>

            <div>
              <Label className="text-slate-400">Mode de paiement</Label>
              <Select value={formData.payment_method} onValueChange={v => setFormData(f => ({ ...f, payment_method: v }))}>
                <SelectTrigger className="bg-slate-900 border-slate-600 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  {Object.entries(PAYMENT_METHODS).map(([key, label]) => (
                    <SelectItem key={key} value={key} className="text-white">{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-400">Notes / Autre info</Label>
              <Textarea
                value={formData.notes}
                onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                placeholder="Informations supplémentaires..."
                className="bg-slate-900 border-slate-600 text-white mt-1"
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="border-slate-600">
                Annuler
              </Button>
              <Button type="submit" className="bg-teal-600 hover:bg-teal-700">
                {editingSubscription ? 'Modifier' : 'Créer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment Modal */}
      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-green-400" />
              Enregistrer un paiement
            </DialogTitle>
          </DialogHeader>
          {selectedSubscription && (
            <form onSubmit={handlePayment} className="space-y-4">
              <div className="p-3 bg-slate-900/50 rounded-lg">
                <p className="text-white font-medium">{selectedSubscription.name}</p>
                <p className="text-slate-400 text-sm">{selectedSubscription.contact_name}</p>
              </div>

              <div>
                <Label className="text-slate-400">Montant payé (FCFA) *</Label>
                <Input
                  type="number"
                  value={paymentData.amount}
                  onChange={e => setPaymentData(p => ({ ...p, amount: e.target.value }))}
                  className="bg-slate-900 border-slate-600 text-white mt-1"
                  required
                  min="0"
                />
              </div>

              <div>
                <Label className="text-slate-400">Date du paiement *</Label>
                <Input
                  type="date"
                  value={paymentData.payment_date}
                  onChange={e => setPaymentData(p => ({ ...p, payment_date: e.target.value }))}
                  className="bg-slate-900 border-slate-600 text-white mt-1"
                  required
                />
              </div>

              <div>
                <Label className="text-slate-400">Mode de paiement</Label>
                <Select value={paymentData.payment_method} onValueChange={v => setPaymentData(p => ({ ...p, payment_method: v }))}>
                  <SelectTrigger className="bg-slate-900 border-slate-600 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    {Object.entries(PAYMENT_METHODS).map(([key, label]) => (
                      <SelectItem key={key} value={key} className="text-white">{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-slate-400">Notes</Label>
                <Input
                  value={paymentData.notes}
                  onChange={e => setPaymentData(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Référence, commentaire..."
                  className="bg-slate-900 border-slate-600 text-white mt-1"
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowPaymentModal(false)} className="border-slate-600">
                  Annuler
                </Button>
                <Button type="submit" className="bg-green-600 hover:bg-green-700">
                  Enregistrer le paiement
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-teal-400" />
              Détails de l'abonnement
            </DialogTitle>
          </DialogHeader>
          {selectedSubscription && (
            <div className="space-y-4">
              <Card className="bg-slate-900/50 border-slate-700">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    {(() => {
                      const CategoryIcon = CATEGORY_CONFIG[selectedSubscription.category]?.icon || MoreHorizontal;
                      const config = CATEGORY_CONFIG[selectedSubscription.category] || CATEGORY_CONFIG.autre;
                      return (
                        <div className={`p-2 rounded-lg ${config.bgColor}`}>
                          <CategoryIcon className={`w-6 h-6 ${config.color}`} />
                        </div>
                      );
                    })()}
                    <div>
                      <h3 className="text-white font-bold text-lg">{selectedSubscription.name}</h3>
                      <p className="text-slate-400">{selectedSubscription.contact_name}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-slate-400">Type:</span>
                      <span className="text-white ml-2">{selectedSubscription.type === 'client' ? 'Client' : 'Fournisseur'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Montant:</span>
                      <span className="text-amber-400 font-bold ml-2">{formatPrice(selectedSubscription.amount)} F</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Fréquence:</span>
                      <span className="text-white ml-2">{FREQUENCY_LABELS[selectedSubscription.frequency]}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Prochaine échéance:</span>
                      <span className="text-white ml-2">{new Date(selectedSubscription.next_due_date).toLocaleDateString('fr-FR')}</span>
                    </div>
                    {selectedSubscription.total_paid > 0 && (
                      <>
                        <div>
                          <span className="text-slate-400">Total payé:</span>
                          <span className="text-green-400 font-bold ml-2">{formatPrice(selectedSubscription.total_paid)} F</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Paiements:</span>
                          <span className="text-white ml-2">{selectedSubscription.payment_count}</span>
                        </div>
                      </>
                    )}
                  </div>
                  {selectedSubscription.notes && (
                    <div className="mt-3 p-2 bg-slate-800 rounded text-sm text-slate-300">
                      <span className="text-slate-400">Notes: </span>{selectedSubscription.notes}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Payment History */}
              <div>
                <h4 className="text-white font-medium mb-2 flex items-center gap-2">
                  <Receipt className="w-4 h-4" />
                  Historique des paiements ({paymentHistory.length})
                </h4>
                {paymentHistory.length === 0 ? (
                  <p className="text-slate-500 text-center py-4">Aucun paiement enregistré</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {paymentHistory.map(payment => (
                      <div key={payment.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                        <div>
                          <p className="text-white font-medium">{formatPrice(payment.amount)} F</p>
                          <p className="text-slate-400 text-xs">
                            {new Date(payment.payment_date).toLocaleDateString('fr-FR')} • {PAYMENT_METHODS[payment.payment_method]}
                          </p>
                        </div>
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDetailModal(false)} className="border-slate-600">
                  Fermer
                </Button>
                <Button className="bg-green-600 hover:bg-green-700" onClick={() => { setShowDetailModal(false); openPayment(selectedSubscription); }}>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Enregistrer un paiement
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
