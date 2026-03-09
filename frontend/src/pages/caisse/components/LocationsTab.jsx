import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  Calendar, Building2, TreePine, Gamepad2, Plus, Edit2, Trash2, 
  Users, Clock, Phone, DollarSign, CheckCircle, X, Eye
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SPACE_CONFIG = {
  salle_fete: { 
    label: "Salle de Fête", 
    icon: Building2, 
    color: "text-purple-400",
    bgColor: "bg-purple-900/30",
    borderColor: "border-purple-500/50",
    defaultPrice: 50000
  },
  espace_jardin: { 
    label: "Espace Jardin", 
    icon: TreePine, 
    color: "text-green-400",
    bgColor: "bg-green-900/30",
    borderColor: "border-green-500/50",
    defaultPrice: 30000
  },
  salle_jeux: { 
    label: "Salle de Jeux", 
    icon: Gamepad2, 
    color: "text-blue-400",
    bgColor: "bg-blue-900/30",
    borderColor: "border-blue-500/50",
    defaultPrice: 25000
  }
};

const EVENT_TYPES = [
  "Anniversaire",
  "Mariage",
  "Baptême",
  "Réunion d'entreprise",
  "Conférence",
  "Fête privée",
  "Séminaire",
  "Autre"
];

const LocationsTab = ({ currentUser, formatPrice }) => {
  const [locations, setLocations] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [viewingLocation, setViewingLocation] = useState(null);
  const [filterSpace, setFilterSpace] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  
  const [formData, setFormData] = useState({
    space_type: "salle_fete",
    customer_name: "",
    customer_phone: "",
    reservation_date: "",
    start_time: "",
    end_time: "",
    number_of_guests: 1,
    event_type: "",
    rental_amount: 50000,
    deposit_amount: 0,
    notes: ""
  });

  const isAdmin = currentUser?.role === 'admin';
  const isManager = currentUser?.role === 'manager';
  const canManageLocations = isAdmin || isManager; // Both can create/edit/delete

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      const res = await axios.get(`${API}/locations`);
      setLocations(res.data.locations || []);
    } catch (error) {
      console.error("Error fetching locations:", error);
      toast.error("Erreur lors du chargement des locations");
    }
  };

  const handleSpaceChange = (spaceType) => {
    setFormData({
      ...formData,
      space_type: spaceType,
      rental_amount: SPACE_CONFIG[spaceType]?.defaultPrice || 50000
    });
  };

  const handleSubmit = async () => {
    if (!formData.customer_name || !formData.customer_phone || !formData.reservation_date) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }

    try {
      if (editingLocation) {
        await axios.put(`${API}/locations/${editingLocation.id}`, formData);
        toast.success("Location modifiée avec succès");
      } else {
        await axios.post(`${API}/locations`, formData);
        toast.success("Location créée avec succès");
      }
      setShowModal(false);
      setEditingLocation(null);
      resetForm();
      fetchLocations();
    } catch (error) {
      console.error("Error saving location:", error);
      toast.error("Erreur lors de l'enregistrement");
    }
  };

  const handleDelete = async (locationId) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cette réservation ?")) return;
    
    try {
      await axios.delete(`${API}/locations/${locationId}`);
      toast.success("Location supprimée");
      fetchLocations();
    } catch (error) {
      console.error("Error deleting location:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleStatusChange = async (locationId, newStatus) => {
    try {
      await axios.put(`${API}/locations/${locationId}`, { status: newStatus });
      toast.success("Statut mis à jour");
      fetchLocations();
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Erreur lors de la mise à jour");
    }
  };

  const openEditModal = (location) => {
    setEditingLocation(location);
    setFormData({
      space_type: location.space_type,
      customer_name: location.customer_name,
      customer_phone: location.customer_phone,
      reservation_date: location.reservation_date,
      start_time: location.start_time,
      end_time: location.end_time,
      number_of_guests: location.number_of_guests,
      event_type: location.event_type || "",
      rental_amount: location.rental_amount,
      deposit_amount: location.deposit_amount || 0,
      notes: location.notes || ""
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      space_type: "salle_fete",
      customer_name: "",
      customer_phone: "",
      reservation_date: "",
      start_time: "",
      end_time: "",
      number_of_guests: 1,
      event_type: "",
      rental_amount: 50000,
      deposit_amount: 0,
      notes: ""
    });
  };

  const filteredLocations = locations.filter(loc => {
    if (filterSpace !== "all" && loc.space_type !== filterSpace) return false;
    if (filterStatus !== "all" && loc.status !== filterStatus) return false;
    return true;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case "confirmed":
        return <Badge className="bg-blue-500/20 text-blue-400">Confirmée</Badge>;
      case "completed":
        return <Badge className="bg-green-500/20 text-green-400">Terminée</Badge>;
      case "cancelled":
        return <Badge className="bg-red-500/20 text-red-400">Annulée</Badge>;
      default:
        return <Badge className="bg-slate-500/20 text-slate-400">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-bold text-purple-300 flex items-center gap-2">
            <Building2 className="w-5 h-5 sm:w-6 sm:h-6" />
            Gestion des Locations
          </h2>
          {canManageLocations && (
            <Button 
              onClick={() => { resetForm(); setEditingLocation(null); setShowModal(true); }}
              className="bg-purple-600 hover:bg-purple-700"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Nouvelle Location</span>
              <span className="sm:hidden">Nouveau</span>
            </Button>
          )}
        </div>
        {/* Filters - separate row on mobile */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterSpace} onValueChange={setFilterSpace}>
            <SelectTrigger className="w-[120px] sm:w-[140px] bg-slate-800/50 border-slate-700 text-white text-sm">
              <SelectValue placeholder="Espace" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="all">Tous les espaces</SelectItem>
              {Object.entries(SPACE_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>{config.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[110px] sm:w-[130px] bg-slate-800/50 border-slate-700 text-white text-sm">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="all">Tous statuts</SelectItem>
              <SelectItem value="confirmed">Confirmées</SelectItem>
              <SelectItem value="completed">Terminées</SelectItem>
              <SelectItem value="cancelled">Annulées</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(SPACE_CONFIG).map(([key, config]) => {
          const Icon = config.icon;
          const count = locations.filter(l => l.space_type === key && l.status === "confirmed").length;
          return (
            <Card key={key} className={`${config.bgColor} ${config.borderColor} border`}>
              <CardContent className="p-4 text-center">
                <Icon className={`w-6 h-6 ${config.color} mx-auto mb-1`} />
                <p className={`text-2xl font-bold ${config.color}`}>{count}</p>
                <p className="text-xs text-slate-400">{config.label}</p>
              </CardContent>
            </Card>
          );
        })}
        <Card className="bg-amber-900/30 border-amber-500/50 border">
          <CardContent className="p-4 text-center">
            <DollarSign className="w-6 h-6 text-amber-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-amber-400">
              {formatPrice(locations.filter(l => l.status === "confirmed").reduce((sum, l) => sum + (l.rental_amount || 0), 0))}
            </p>
            <p className="text-xs text-slate-400">Total Confirmé</p>
          </CardContent>
        </Card>
      </div>

      {/* Locations List */}
      {filteredLocations.length === 0 ? (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-8 text-center">
            <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">Aucune réservation de location</p>
            {canManageLocations && (
              <p className="text-slate-500 text-sm">Cliquez sur "Nouveau" pour en créer une</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredLocations.map(location => {
            const spaceConfig = SPACE_CONFIG[location.space_type] || SPACE_CONFIG.salle_fete;
            const SpaceIcon = spaceConfig.icon;
            return (
              <Card key={location.id} className={`${spaceConfig.bgColor} ${spaceConfig.borderColor} border`}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    {/* Left: Info */}
                    <div className="flex items-start gap-3 flex-1">
                      <div className={`p-2 rounded-lg ${spaceConfig.bgColor}`}>
                        <SpaceIcon className={`w-6 h-6 ${spaceConfig.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-white font-semibold">{location.customer_name}</h3>
                          {getStatusBadge(location.status)}
                          {location.event_type && (
                            <Badge className="bg-slate-700/50 text-slate-300">{location.event_type}</Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm">
                          <span className={spaceConfig.color}>{spaceConfig.label}</span>
                          <span className="text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {location.reservation_date}
                          </span>
                          <span className="text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {location.start_time} - {location.end_time}
                          </span>
                          <span className="text-slate-400 flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {location.number_of_guests} pers.
                          </span>
                          <span className="text-slate-400 flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {location.customer_phone}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Right: Price & Actions */}
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-amber-400 font-bold">{formatPrice(location.rental_amount)} F</p>
                        {location.deposit_paid > 0 && (
                          <p className="text-green-400 text-xs">Acompte: {formatPrice(location.deposit_paid)} F</p>
                        )}
                        {location.balance_remaining > 0 && (
                          <p className="text-red-400 text-xs">Reste: {formatPrice(location.balance_remaining)} F</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => setViewingLocation(location)}
                          className="text-slate-400 hover:text-white"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {canManageLocations && (
                          <>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              onClick={() => openEditModal(location)}
                              className="text-blue-400 hover:text-blue-300"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              onClick={() => handleDelete(location.id)}
                              className="text-red-400 hover:text-red-300"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-purple-400 flex items-center gap-2">
              {editingLocation ? <Edit2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
              {editingLocation ? "Modifier la Location" : "Nouvelle Location"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Space Type Selection */}
            <div className="space-y-2">
              <Label className="text-slate-300">Type d'espace *</Label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(SPACE_CONFIG).map(([key, config]) => {
                  const Icon = config.icon;
                  return (
                    <button
                      key={key}
                      onClick={() => handleSpaceChange(key)}
                      className={`p-3 rounded-lg border transition-all flex flex-col items-center gap-1 ${
                        formData.space_type === key 
                          ? `${config.bgColor} ${config.borderColor} ${config.color}` 
                          : 'bg-slate-700/30 border-slate-600 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs">{config.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Customer Info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-slate-300">Nom du client *</Label>
                <Input
                  value={formData.customer_name}
                  onChange={(e) => setFormData({...formData, customer_name: e.target.value})}
                  placeholder="Nom complet"
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Téléphone *</Label>
                <Input
                  value={formData.customer_phone}
                  onChange={(e) => setFormData({...formData, customer_phone: e.target.value})}
                  placeholder="+229..."
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="text-slate-300">Date *</Label>
                <Input
                  type="date"
                  value={formData.reservation_date}
                  onChange={(e) => setFormData({...formData, reservation_date: e.target.value})}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Heure début</Label>
                <Input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({...formData, start_time: e.target.value})}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Heure fin</Label>
                <Input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({...formData, end_time: e.target.value})}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
            </div>

            {/* Event Info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-slate-300">Nombre de personnes</Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.number_of_guests}
                  onChange={(e) => setFormData({...formData, number_of_guests: parseInt(e.target.value) || 1})}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Type d'événement</Label>
                <Select value={formData.event_type} onValueChange={(v) => setFormData({...formData, event_type: v})}>
                  <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                    <SelectValue placeholder="Sélectionner..." />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {EVENT_TYPES.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Pricing */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-slate-300">Montant location (F CFA)</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.rental_amount}
                  onChange={(e) => setFormData({...formData, rental_amount: parseInt(e.target.value) || 0})}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Acompte versé (F CFA)</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.deposit_amount}
                  onChange={(e) => setFormData({...formData, deposit_amount: parseInt(e.target.value) || 0})}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
            </div>

            {/* Balance Preview */}
            <div className="bg-slate-700/30 rounded-lg p-3 flex justify-between items-center">
              <span className="text-slate-400">Solde restant à payer :</span>
              <span className="text-amber-400 font-bold text-lg">
                {formatPrice(Math.max(0, formData.rental_amount - formData.deposit_amount))} F
              </span>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-slate-300">Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                placeholder="Informations supplémentaires..."
                className="bg-slate-700/50 border-slate-600 text-white min-h-[80px]"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleSubmit}
                className="flex-1 bg-purple-600 hover:bg-purple-700"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {editingLocation ? "Modifier" : "Créer"}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setShowModal(false); setEditingLocation(null); }}
                className="border-slate-600 text-slate-300"
              >
                Annuler
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Details Modal */}
      <Dialog open={!!viewingLocation} onOpenChange={(open) => !open && setViewingLocation(null)}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-purple-400 flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Détails de la Location
            </DialogTitle>
          </DialogHeader>
          
          {viewingLocation && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3">
                {(() => {
                  const config = SPACE_CONFIG[viewingLocation.space_type] || SPACE_CONFIG.salle_fete;
                  const Icon = config.icon;
                  return (
                    <div className={`p-3 rounded-lg ${config.bgColor}`}>
                      <Icon className={`w-8 h-8 ${config.color}`} />
                    </div>
                  );
                })()}
                <div>
                  <h3 className="text-white font-bold text-lg">{viewingLocation.customer_name}</h3>
                  <p className="text-slate-400">{SPACE_CONFIG[viewingLocation.space_type]?.label}</p>
                </div>
                {getStatusBadge(viewingLocation.status)}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <p className="text-slate-400">Date</p>
                  <p className="text-white font-medium">{viewingLocation.reservation_date}</p>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <p className="text-slate-400">Horaires</p>
                  <p className="text-white font-medium">{viewingLocation.start_time} - {viewingLocation.end_time}</p>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <p className="text-slate-400">Personnes</p>
                  <p className="text-white font-medium">{viewingLocation.number_of_guests}</p>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <p className="text-slate-400">Téléphone</p>
                  <p className="text-white font-medium">{viewingLocation.customer_phone}</p>
                </div>
              </div>

              {viewingLocation.event_type && (
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <p className="text-slate-400 text-sm">Type d'événement</p>
                  <p className="text-white font-medium">{viewingLocation.event_type}</p>
                </div>
              )}

              <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Montant total</span>
                  <span className="text-amber-400 font-bold">{formatPrice(viewingLocation.rental_amount)} F</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Acompte versé</span>
                  <span className="text-green-400">{formatPrice(viewingLocation.deposit_paid || 0)} F</span>
                </div>
                <div className="flex justify-between border-t border-slate-600 pt-2">
                  <span className="text-slate-300 font-medium">Solde restant</span>
                  <span className="text-red-400 font-bold">{formatPrice(viewingLocation.balance_remaining || 0)} F</span>
                </div>
              </div>

              {viewingLocation.notes && (
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <p className="text-slate-400 text-sm">Notes</p>
                  <p className="text-white">{viewingLocation.notes}</p>
                </div>
              )}

              {/* Manager/Admin Actions */}
              {canManageLocations && viewingLocation.status === "confirmed" && (
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => { handleStatusChange(viewingLocation.id, "completed"); setViewingLocation(null); }}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Marquer Terminée
                  </Button>
                  <Button
                    onClick={() => { handleStatusChange(viewingLocation.id, "cancelled"); setViewingLocation(null); }}
                    variant="outline"
                    className="border-red-500/50 text-red-400 hover:bg-red-500/20"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Annuler
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LocationsTab;
