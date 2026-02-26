import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { 
  BarChart3, Calendar, Users, CreditCard, Clock, 
  Phone, Gamepad2, CheckCircle, XCircle, AlertCircle,
  RefreshCw, Filter, MessageCircle, TrendingUp, LogOut,
  Star, Gift, Trophy, MessageSquare, Trash2, PartyPopper,
  Mail, Building2, CalendarDays, DollarSign, CalendarClock,
  Download, FileSpreadsheet, Briefcase, FileText, Eye, Truck, MapPin
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Helper to format date as dd/mm/yyyy
const formatDateFR = (dateStr) => {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
};

// Helper to get auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem("adminToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Helper to check if token is expired
const isTokenValid = () => {
  const token = localStorage.getItem("adminToken");
  const expiresAt = localStorage.getItem("adminTokenExpires");
  
  if (!token || !expiresAt) return false;
  
  const expirationDate = new Date(expiresAt);
  return expirationDate > new Date();
};

const AdminPage = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loyaltyAccounts, setLoyaltyAccounts] = useState([]);
  const [loyaltyStats, setLoyaltyStats] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [reviewStats, setReviewStats] = useState(null);
  const [locationRequests, setLocationRequests] = useState([]);
  const [locationStats, setLocationStats] = useState(null);
  const [jobApplications, setJobApplications] = useState([]);
  const [jobApplicationsStats, setJobApplicationsStats] = useState({ pending: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: "all", booking_status: "all" });
  const [activeTab, setActiveTab] = useState("bookings");
  
  // Reschedule modal state
  const [rescheduleModal, setRescheduleModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  
  // Delete modal state
  const [deleteModal, setDeleteModal] = useState(false);
  const [bookingToDelete, setBookingToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  // Delete location request modal state
  const [deleteLocationModal, setDeleteLocationModal] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState(null);
  const [deleteLocationLoading, setDeleteLocationLoading] = useState(false);
  
  // CV viewer modal state
  const [cvViewerModal, setCvViewerModal] = useState(false);
  const [selectedCV, setSelectedCV] = useState(null);
  const [cvLoading, setCvLoading] = useState(false);
  
  // Detail modals state
  const [bookingDetailModal, setBookingDetailModal] = useState(false);
  const [bookingDetail, setBookingDetail] = useState(null);
  const [deliveryDetailModal, setDeliveryDetailModal] = useState(false);
  const [deliveryDetail, setDeliveryDetail] = useState(null);
  const [locationDetailModal, setLocationDetailModal] = useState(false);
  const [locationDetail, setLocationDetail] = useState(null);
  const [deliveryOrders, setDeliveryOrders] = useState([]);

  // Check authentication
  useEffect(() => {
    if (!isTokenValid()) {
      localStorage.removeItem("adminToken");
      localStorage.removeItem("adminTokenExpires");
      toast.error("Session expirée. Veuillez vous reconnecter.");
      navigate("/admin");
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminTokenExpires");
    toast.success("Déconnexion réussie");
    navigate("/admin");
  };

  const fetchData = useCallback(async () => {
    if (!isTokenValid()) {
      navigate("/admin");
      return;
    }

    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const [statsRes, bookingsRes, loyaltyRes, reviewsRes, locationRes, jobAppsRes, deliveryRes] = await Promise.all([
        axios.get(`${API}/admin/stats`, { headers }),
        axios.get(`${API}/admin/bookings`, {
          headers,
          params: {
            status: filter.status !== "all" ? filter.status : undefined,
            booking_status: filter.booking_status !== "all" ? filter.booking_status : undefined,
            limit: 100
          }
        }),
        axios.get(`${API}/admin/loyalty/accounts`, { headers }).catch(() => ({ data: { accounts: [], stats: {} } })),
        axios.get(`${API}/admin/reviews`, { headers }).catch(() => ({ data: { reviews: [], stats: {} } })),
        axios.get(`${API}/admin/location-requests`, { headers }).catch(() => ({ data: { requests: [], stats: {} } })),
        axios.get(`${API}/admin/job-applications`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/admin/delivery-orders`, { headers }).catch(() => ({ data: { orders: [] } }))
      ]);
      setStats(statsRes.data);
      setBookings(bookingsRes.data.bookings);
      setLoyaltyAccounts(loyaltyRes.data.accounts || []);
      setLoyaltyStats(loyaltyRes.data.stats || {});
      setReviews(reviewsRes.data.reviews || []);
      setReviewStats(reviewsRes.data.stats || {});
      setLocationRequests(locationRes.data.requests || []);
      setLocationStats(locationRes.data.stats || {});
      setDeliveryOrders(deliveryRes.data.orders || []);
      
      // Process job applications
      const jobApps = jobAppsRes.data || [];
      setJobApplications(jobApps);
      setJobApplicationsStats({
        pending: jobApps.filter(app => app.status === "pending").length,
        total: jobApps.length
      });
    } catch (error) {
      console.error("Error fetching admin data:", error);
      if (error.response?.status === 401) {
        localStorage.removeItem("adminToken");
        localStorage.removeItem("adminTokenExpires");
        toast.error("Session expirée. Veuillez vous reconnecter.");
        navigate("/admin");
      } else {
        toast.error("Erreur lors du chargement des données");
      }
    } finally {
      setLoading(false);
    }
  }, [filter, navigate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateBookingStatus = async (bookingId, newStatus) => {
    try {
      const headers = getAuthHeaders();
      await axios.put(`${API}/admin/bookings/${bookingId}`, {
        booking_status: newStatus
      }, { headers });
      toast.success("Statut mis à jour");
      fetchData();
    } catch (error) {
      if (error.response?.status === 401) {
        navigate("/admin");
      } else {
        toast.error("Erreur lors de la mise à jour");
      }
    }
  };

  const cancelBooking = async (bookingId) => {
    if (!window.confirm("Êtes-vous sûr de vouloir annuler cette réservation?")) return;
    
    try {
      const headers = getAuthHeaders();
      await axios.delete(`${API}/admin/bookings/${bookingId}`, { headers });
      toast.success("Réservation annulée");
      fetchData();
    } catch (error) {
      if (error.response?.status === 401) {
        navigate("/admin");
      } else {
        toast.error("Erreur lors de l'annulation");
      }
    }
  };

  const deleteBookingPermanently = async (bookingId, customerName) => {
    // Open confirmation modal instead of window.confirm
    setBookingToDelete({ id: bookingId, name: customerName });
    setDeleteModal(true);
  };

  const confirmDeleteBooking = async () => {
    if (!bookingToDelete) return;
    
    setDeleteLoading(true);
    try {
      const headers = getAuthHeaders();
      await axios.delete(`${API}/admin/bookings/${bookingToDelete.id}/permanent`, { headers });
      toast.success("Réservation supprimée définitivement");
      setDeleteModal(false);
      setBookingToDelete(null);
      fetchData();
    } catch (error) {
      if (error.response?.status === 401) {
        navigate("/admin");
      } else {
        toast.error("Erreur lors de la suppression");
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const updateReviewStatus = async (reviewId, status) => {
    try {
      const headers = getAuthHeaders();
      await axios.put(`${API}/admin/reviews/${reviewId}`, { status }, { headers });
      toast.success(status === "approved" ? "Avis approuvé !" : "Avis rejeté");
      fetchData();
    } catch (error) {
      if (error.response?.status === 401) {
        navigate("/admin");
      } else {
        toast.error("Erreur lors de la mise à jour");
      }
    }
  };

  const deleteReview = async (reviewId) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cet avis?")) return;
    
    try {
      const headers = getAuthHeaders();
      await axios.delete(`${API}/admin/reviews/${reviewId}`, { headers });
      toast.success("Avis supprimé");
      fetchData();
    } catch (error) {
      if (error.response?.status === 401) {
        navigate("/admin");
      } else {
        toast.error("Erreur lors de la suppression");
      }
    }
  };

  const updateLocationStatus = async (requestId, newStatus) => {
    try {
      const headers = getAuthHeaders();
      await axios.put(`${API}/admin/location-requests/${requestId}?status=${newStatus}`, {}, { headers });
      toast.success(
        newStatus === "confirmed" ? "Demande confirmée !" : 
        newStatus === "rejected" ? "Demande rejetée" : "Statut mis à jour"
      );
      fetchData();
    } catch (error) {
      if (error.response?.status === 401) {
        navigate("/admin");
      } else {
        toast.error("Erreur lors de la mise à jour");
      }
    }
  };

  const openDeleteLocationModal = (request) => {
    setLocationToDelete(request);
    setDeleteLocationModal(true);
  };

  const handleDeleteLocation = async () => {
    if (!locationToDelete) return;
    
    setDeleteLocationLoading(true);
    try {
      const headers = getAuthHeaders();
      await axios.delete(`${API}/admin/location-requests/${locationToDelete.id}`, { headers });
      toast.success("Demande supprimée définitivement");
      setDeleteLocationModal(false);
      setLocationToDelete(null);
      fetchData();
    } catch (error) {
      if (error.response?.status === 401) {
        navigate("/admin");
      } else {
        toast.error("Erreur lors de la suppression");
      }
    } finally {
      setDeleteLocationLoading(false);
    }
  };

  // Export functions
  const handleExportBookings = async () => {
    try {
      const headers = getAuthHeaders();
      const response = await axios.get(`${API}/admin/export/bookings`, {
        headers,
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `reservations_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Export des réservations téléchargé!");
    } catch (error) {
      toast.error("Erreur lors de l'export");
    }
  };

  const handleExportLocationRequests = async () => {
    try {
      const headers = getAuthHeaders();
      const response = await axios.get(`${API}/admin/export/location-requests`, {
        headers,
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `demandes_location_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Export des demandes téléchargé!");
    } catch (error) {
      toast.error("Erreur lors de l'export");
    }
  };

  const handleExportLoyalty = async () => {
    try {
      const headers = getAuthHeaders();
      const response = await axios.get(`${API}/admin/export/loyalty`, {
        headers,
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `fidelite_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Export fidélité téléchargé!");
    } catch (error) {
      toast.error("Erreur lors de l'export");
    }
  };

  const openRescheduleModal = (booking) => {
    if (booking.has_been_rescheduled) {
      toast.error("Cette réservation a déjà été reprogrammée. Les frais ne sont pas remboursables.");
      return;
    }
    if (booking.payment_status !== "paid") {
      toast.error("Seules les réservations payées peuvent être reprogrammées");
      return;
    }
    setSelectedBooking(booking);
    setNewDate(booking.date);
    setNewTime(booking.time_slot);
    setRescheduleModal(true);
  };

  const handleReschedule = async () => {
    if (!newDate || !newTime) {
      toast.error("Veuillez sélectionner une date et un créneau");
      return;
    }
    
    setRescheduleLoading(true);
    try {
      const headers = getAuthHeaders();
      const response = await axios.post(
        `${API}/admin/bookings/${selectedBooking.id}/reschedule`,
        { new_date: newDate, new_time_slot: newTime },
        { headers }
      );
      
      toast.success("Réservation reprogrammée avec succès!");
      
      // Open WhatsApp link to notify client
      if (response.data.client_whatsapp_link) {
        window.open(response.data.client_whatsapp_link, '_blank');
      }
      
      setRescheduleModal(false);
      setSelectedBooking(null);
      fetchData();
    } catch (error) {
      if (error.response?.status === 401) {
        navigate("/admin");
      } else {
        toast.error(error.response?.data?.detail || "Erreur lors de la reprogrammation");
      }
    } finally {
      setRescheduleLoading(false);
    }
  };

  const formatPrice = (price) => new Intl.NumberFormat('fr-FR').format(price);

  const getStatusBadge = (status) => {
    const statusConfig = {
      paid: { label: "Payé", variant: "default", className: "bg-green-500" },
      pending: { label: "En attente", variant: "secondary", className: "bg-yellow-500" },
      initiated: { label: "Initié", variant: "outline", className: "bg-blue-500" }
    };
    const config = statusConfig[status] || statusConfig.pending;
    return <Badge className={`${config.className} text-white`}>{config.label}</Badge>;
  };

  const getBookingStatusBadge = (status) => {
    const statusConfig = {
      active: { label: "Actif", className: "bg-neon-blue" },
      completed: { label: "Terminé", className: "bg-gray-500" },
      cancelled: { label: "Annulé", className: "bg-neon-red" }
    };
    const config = statusConfig[status] || statusConfig.active;
    return <Badge className={`${config.className} text-white`}>{config.label}</Badge>;
  };

  return (
    <div className="min-h-screen pt-20 bg-dark-bg" data-testid="admin-page">
      {/* Header */}
      <section className="py-8 px-4 bg-dark-card border-b border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="font-orbitron font-bold text-2xl md:text-3xl text-white flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-neon-blue" />
              Dashboard Admin
            </h1>
            <p className="text-gray-400 font-outfit mt-1">Gérez vos réservations et suivez vos performances</p>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              onClick={fetchData} 
              className="bg-neon-blue text-black font-rajdhani font-bold"
              disabled={loading}
              data-testid="refresh-button"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>
            <Button 
              onClick={handleLogout}
              variant="outline"
              className="border-neon-red text-neon-red hover:bg-neon-red/10 font-rajdhani font-bold"
              data-testid="logout-button"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Déconnexion
            </Button>
          </div>
        </div>
      </section>

      {/* Stats Cards */}
      {stats && (
        <section className="py-8 px-4" data-testid="stats-section">
          <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-dark-card border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-outfit text-gray-400 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-neon-blue" />
                  Aujourd'hui
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-rajdhani font-bold text-neon-blue">{stats.today_bookings}</p>
                <p className="text-xs text-gray-500">{stats.today}</p>
              </CardContent>
            </Card>

            <Card className="bg-dark-card border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-outfit text-gray-400 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Payées
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-rajdhani font-bold text-green-500">{stats.paid_bookings}</p>
                <p className="text-xs text-gray-500">sur {stats.total_bookings} total</p>
              </CardContent>
            </Card>

            <Card className="bg-dark-card border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-outfit text-gray-400 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-food-gold" />
                  Revenus totaux
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-rajdhani font-bold text-food-gold">{formatPrice(stats.total_revenue)}</p>
                <p className="text-xs text-gray-500">FCFA</p>
              </CardContent>
            </Card>

            <Card className="bg-dark-card border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-outfit text-gray-400 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-neon-purple" />
                  Frais collectés
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-rajdhani font-bold text-neon-purple">{formatPrice(stats.total_fees_collected)}</p>
                <p className="text-xs text-gray-500">FCFA (500/résa)</p>
              </CardContent>
            </Card>
          </div>

          {/* Game Stats */}
          <div className="max-w-7xl mx-auto mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-dark-card border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-outfit text-gray-400">VR 360°</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-rajdhani font-bold text-neon-blue">
                  {stats.bookings_by_game?.VR_360 || 0}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-dark-card border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-outfit text-gray-400">Simulateur</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-rajdhani font-bold text-neon-red">
                  {stats.bookings_by_game?.RACING_SIMULATOR || 0}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-dark-card border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-outfit text-gray-400">En attente</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-rajdhani font-bold text-yellow-500">{stats.pending_bookings}</p>
              </CardContent>
            </Card>

            <Card className="bg-dark-card border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-outfit text-gray-400">7 derniers jours</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-rajdhani font-bold text-white">{stats.recent_bookings_7_days}</p>
              </CardContent>
            </Card>
          </div>

          {/* Loyalty Stats */}
          {loyaltyStats && loyaltyStats.total_accounts > 0 && (
            <div className="max-w-7xl mx-auto mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
              <Card className="bg-gradient-to-r from-food-gold/10 to-neon-purple/10 border-food-gold/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-outfit text-gray-400 flex items-center gap-2">
                    <Star className="w-4 h-4 text-food-gold" />
                    Membres Fidélité
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-rajdhani font-bold text-food-gold">{loyaltyStats.total_accounts}</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-r from-food-gold/10 to-neon-purple/10 border-food-gold/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-outfit text-gray-400 flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-neon-purple" />
                    Points Distribués
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-rajdhani font-bold text-neon-purple">{loyaltyStats.total_points_issued}</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-r from-food-gold/10 to-neon-purple/10 border-food-gold/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-outfit text-gray-400 flex items-center gap-2">
                    <Gift className="w-4 h-4 text-green-400" />
                    Parties Gratuites
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-rajdhani font-bold text-green-400">{loyaltyStats.total_free_games_earned}</p>
                </CardContent>
              </Card>
            </div>
          )}
        </section>
      )}

      {/* Tabs for Bookings, Loyalty and Reviews */}
      <section className="px-4 pb-4">
        <div className="max-w-7xl mx-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-dark-card border border-white/10 mb-4">
              <TabsTrigger value="bookings" className="data-[state=active]:bg-neon-blue data-[state=active]:text-black font-rajdhani font-bold">
                <Calendar className="w-4 h-4 mr-2" />
                Réservations
              </TabsTrigger>
              <TabsTrigger value="location" className="data-[state=active]:bg-neon-red data-[state=active]:text-white font-rajdhani font-bold relative">
                <PartyPopper className="w-4 h-4 mr-2" />
                Location
                {locationStats && locationStats.pending > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-food-gold text-black text-xs rounded-full flex items-center justify-center">
                    {locationStats.pending}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="loyalty" className="data-[state=active]:bg-food-gold data-[state=active]:text-black font-rajdhani font-bold">
                <Star className="w-4 h-4 mr-2" />
                Fidélité
              </TabsTrigger>
              <TabsTrigger value="reviews" className="data-[state=active]:bg-neon-purple data-[state=active]:text-white font-rajdhani font-bold relative">
                <MessageSquare className="w-4 h-4 mr-2" />
                Avis
                {reviewStats && reviewStats.pending > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-neon-red text-white text-xs rounded-full flex items-center justify-center">
                    {reviewStats.pending}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="candidatures" className="data-[state=active]:bg-green-600 data-[state=active]:text-white font-rajdhani font-bold relative">
                <Briefcase className="w-4 h-4 mr-2" />
                Candidatures
                {jobApplicationsStats.pending > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-food-orange text-white text-xs rounded-full flex items-center justify-center">
                    {jobApplicationsStats.pending}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="livraisons" className="data-[state=active]:bg-food-orange data-[state=active]:text-white font-rajdhani font-bold relative">
                <Truck className="w-4 h-4 mr-2" />
                Livraisons
                {deliveryOrders.filter(o => o.status === "pending").length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-neon-blue text-white text-xs rounded-full flex items-center justify-center">
                    {deliveryOrders.filter(o => o.status === "pending").length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="bookings">
              {/* Filters */}
              <div className="flex flex-wrap items-center gap-4 bg-dark-card p-4 rounded-lg border border-white/10 mb-4" data-testid="filters-section">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-400 font-outfit text-sm">Filtres:</span>
                </div>
                
                <Select value={filter.status} onValueChange={(v) => setFilter(f => ({...f, status: v}))}>
                  <SelectTrigger className="w-40 bg-surface-highlight border-white/20 text-white" data-testid="filter-payment">
                    <SelectValue placeholder="Paiement" />
                  </SelectTrigger>
                  <SelectContent className="bg-dark-card border-white/20">
                    <SelectItem value="all" className="text-white">Tous</SelectItem>
                    <SelectItem value="paid" className="text-white">Payé</SelectItem>
                    <SelectItem value="pending" className="text-white">En attente</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filter.booking_status} onValueChange={(v) => setFilter(f => ({...f, booking_status: v}))}>
                  <SelectTrigger className="w-40 bg-surface-highlight border-white/20 text-white" data-testid="filter-booking">
                    <SelectValue placeholder="Statut" />
                  </SelectTrigger>
                  <SelectContent className="bg-dark-card border-white/20">
                    <SelectItem value="all" className="text-white">Tous</SelectItem>
                    <SelectItem value="active" className="text-white">Actif</SelectItem>
                    <SelectItem value="completed" className="text-white">Terminé</SelectItem>
                    <SelectItem value="cancelled" className="text-white">Annulé</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Bookings List */}
              <div data-testid="bookings-section">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-orbitron font-bold text-xl text-white">
                    Réservations ({bookings.length})
                  </h2>
                  <Button
                    onClick={handleExportBookings}
                    variant="outline"
                    size="sm"
                    className="border-green-500 text-green-500 hover:bg-green-500/10"
                    data-testid="export-bookings-btn"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Exporter CSV
                  </Button>
                </div>
                
                {loading ? (
                  <div className="text-center py-12">
                    <RefreshCw className="w-8 h-8 text-neon-blue animate-spin mx-auto" />
                  </div>
                ) : bookings.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    Aucune réservation trouvée
                  </div>
                ) : (
                  <div className="space-y-4">
                    {bookings.map((booking) => (
                      <Card 
                        key={booking.id} 
                        className="bg-dark-card border-white/10 hover:border-neon-blue/30 transition-colors"
                        data-testid={`booking-${booking.id}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            {/* Customer Info */}
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Users className="w-4 h-4 text-neon-blue" />
                                <span className="font-outfit font-semibold text-white">{booking.customer_name}</span>
                          {getStatusBadge(booking.payment_status)}
                          {getBookingStatusBadge(booking.booking_status)}
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {booking.customer_phone}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDateFR(booking.date)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {booking.time_slot}
                          </span>
                          <span className="flex items-center gap-1">
                            <Gamepad2 className="w-3 h-3" />
                            {booking.game_type === "VR_360" ? "VR 360°" : "Simulateur"}
                          </span>
                        </div>
                      </div>

                      {/* Pricing */}
                      <div className="text-right">
                        <p className="font-rajdhani font-bold text-food-gold text-lg">
                          {formatPrice(booking.total_amount)} FCFA
                        </p>
                        <p className="text-xs text-gray-500">
                          {booking.number_of_players} joueur(s) x {booking.number_of_games} partie(s)
                        </p>
                        {booking.has_been_rescheduled && (
                          <Badge className="bg-orange-500/20 text-orange-400 text-xs mt-1">
                            Reprogrammée
                          </Badge>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {/* View details button */}
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="border-neon-blue/50 text-neon-blue hover:bg-neon-blue/10"
                          onClick={() => {
                            setBookingDetail(booking);
                            setBookingDetailModal(true);
                          }}
                          data-testid={`view-booking-${booking.id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        
                        {booking.whatsapp_link && (
                          <a href={booking.whatsapp_link} target="_blank" rel="noopener noreferrer">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="border-green-500 text-green-500 hover:bg-green-500/10"
                              data-testid={`whatsapp-${booking.id}`}
                            >
                              <MessageCircle className="w-4 h-4" />
                            </Button>
                          </a>
                        )}
                        
                        {/* Reschedule button - only for paid, active bookings that haven't been rescheduled */}
                        {booking.payment_status === "paid" && 
                         booking.booking_status === "active" && 
                         !booking.has_been_rescheduled && (
                          <Button 
                            size="sm"
                            variant="outline"
                            onClick={() => openRescheduleModal(booking)}
                            className="border-neon-blue text-neon-blue hover:bg-neon-blue/10"
                            data-testid={`reschedule-${booking.id}`}
                          >
                            <CalendarClock className="w-4 h-4" />
                          </Button>
                        )}
                        
                        {booking.booking_status === "active" && (
                          <>
                            <Button 
                              size="sm"
                              onClick={() => updateBookingStatus(booking.id, "completed")}
                              className="bg-green-600 hover:bg-green-700"
                              data-testid={`complete-${booking.id}`}
                            >
                              <CheckCircle className="w-4 h-4" />
                            </Button>
                            <Button 
                              size="sm"
                              variant="destructive"
                              onClick={() => cancelBooking(booking.id)}
                              data-testid={`cancel-${booking.id}`}
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        
                        {/* Delete permanently button - always visible */}
                        <Button 
                          size="sm"
                          variant="outline"
                          onClick={() => deleteBookingPermanently(booking.id, booking.customer_name)}
                          className="border-red-800 text-red-500 hover:bg-red-900/20"
                          data-testid={`delete-${booking.id}`}
                          title="Supprimer définitivement"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Location Requests Tab */}
            <TabsContent value="location">
              <div data-testid="location-section">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-orbitron font-bold text-xl text-white flex items-center gap-2">
                    <PartyPopper className="w-5 h-5 text-neon-red" />
                    Demandes de Location ({locationRequests.length})
                  </h2>
                  <div className="flex items-center gap-4">
                    {locationStats && (
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-yellow-500">{locationStats.pending} en attente</span>
                        <span className="text-green-500">{locationStats.total - locationStats.pending} traitées</span>
                      </div>
                    )}
                    <Button
                      onClick={handleExportLocationRequests}
                      variant="outline"
                      size="sm"
                      className="border-green-500 text-green-500 hover:bg-green-500/10"
                      data-testid="export-location-btn"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Exporter CSV
                    </Button>
                  </div>
                </div>

                {loading ? (
                  <div className="text-center py-12">
                    <RefreshCw className="w-8 h-8 text-neon-red animate-spin mx-auto" />
                  </div>
                ) : locationRequests.length === 0 ? (
                  <div className="text-center py-12">
                    <PartyPopper className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-400 font-outfit">Aucune demande de location pour le moment</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {locationRequests.map((request) => (
                      <Card 
                        key={request.id}
                        className={`bg-dark-card border-white/10 hover:border-neon-red/30 transition-colors ${
                          request.status === "pending" ? "border-l-4 border-l-yellow-500" : ""
                        }`}
                        data-testid={`location-${request.id}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                            <div className="flex-1 space-y-3">
                              {/* Header */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-outfit font-semibold text-white text-lg">{request.fullName}</span>
                                <Badge className={`${
                                  request.status === "pending" ? "bg-yellow-500" :
                                  request.status === "confirmed" ? "bg-green-500" : "bg-red-500"
                                } text-white`}>
                                  {request.status === "pending" ? "En attente" :
                                   request.status === "confirmed" ? "Confirmé" : "Rejeté"}
                                </Badge>
                                <Badge className="bg-neon-red/20 text-neon-red border border-neon-red/30">
                                  {request.eventType === "other" ? request.otherEventType : request.eventType}
                                </Badge>
                              </div>

                              {/* Contact Info */}
                              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3 h-3" />
                                  {request.phone}
                                </span>
                                {request.email && (
                                  <span className="flex items-center gap-1">
                                    <Mail className="w-3 h-3" />
                                    {request.email}
                                  </span>
                                )}
                                {request.company && (
                                  <span className="flex items-center gap-1">
                                    <Building2 className="w-3 h-3" />
                                    {request.company}
                                  </span>
                                )}
                              </div>

                              {/* Event Details */}
                              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-300">
                                <span className="flex items-center gap-1">
                                  <CalendarDays className="w-3 h-3 text-neon-blue" />
                                  {formatDateFR(request.eventDate)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-neon-blue" />
                                  {request.startTime} - {request.endTime}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Users className="w-3 h-3 text-neon-blue" />
                                  {request.guestCount} invités
                                </span>
                              </div>

                              {/* Formula & Budget */}
                              <div className="flex flex-wrap items-center gap-4 text-sm">
                                <span className="text-food-gold font-semibold">
                                  Formule: {request.formula === "location_simple" ? "Location simple" :
                                           request.formula === "location_restauration" ? "Location + Restauration" :
                                           request.formula === "location_boissons" ? "Location + Boissons" : "Formule personnalisée"}
                                </span>
                                <span className="flex items-center gap-1 text-green-400">
                                  <DollarSign className="w-3 h-3" />
                                  Budget: {request.budget?.replace("_", " - ").replace("moins", "< ").replace("plus", "> ")}
                                </span>
                              </div>

                              {/* Additional Services */}
                              {request.services && request.services.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {request.services.map((service, idx) => (
                                    <Badge key={idx} variant="outline" className="text-gray-400 border-gray-600 text-xs">
                                      {service}
                                    </Badge>
                                  ))}
                                </div>
                              )}

                              {/* Message */}
                              {request.message && (
                                <p className="text-gray-400 font-outfit text-sm italic">
                                  "{request.message}"
                                </p>
                              )}

                              <p className="text-gray-600 text-xs">
                                Demande reçue le {new Date(request.created_at).toLocaleDateString("fr-FR", { 
                                  day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
                                })}
                              </p>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2">
                              {/* View details button */}
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="border-neon-blue/50 text-neon-blue hover:bg-neon-blue/10"
                                onClick={() => {
                                  setLocationDetail(request);
                                  setLocationDetailModal(true);
                                }}
                                data-testid={`view-location-${request.id}`}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              
                              {/* WhatsApp Contact */}
                              <a 
                                href={`https://wa.me/229${request.phone.replace(/\s/g, '')}?text=Bonjour ${request.fullName}, concernant votre demande de location pour ${request.eventType}...`}
                                target="_blank" 
                                rel="noopener noreferrer"
                              >
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="border-green-500 text-green-500 hover:bg-green-500/10"
                                  data-testid={`whatsapp-location-${request.id}`}
                                >
                                  <MessageCircle className="w-4 h-4" />
                                </Button>
                              </a>

                              {request.status === "pending" && (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => updateLocationStatus(request.id, "confirmed")}
                                    className="bg-green-600 hover:bg-green-700"
                                    data-testid={`confirm-location-${request.id}`}
                                  >
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    Confirmer
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => updateLocationStatus(request.id, "rejected")}
                                    data-testid={`reject-location-${request.id}`}
                                  >
                                    <XCircle className="w-4 h-4 mr-1" />
                                    Rejeter
                                  </Button>
                                </>
                              )}
                              
                              {/* Delete button - always visible */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openDeleteLocationModal(request)}
                                className="border-red-500 text-red-500 hover:bg-red-500/10"
                                data-testid={`delete-location-${request.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Loyalty Tab */}
            <TabsContent value="loyalty">
              <div data-testid="loyalty-section">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-orbitron font-bold text-xl text-white flex items-center gap-2">
                    <Star className="w-5 h-5 text-food-gold" />
                    Membres Fidélité ({loyaltyAccounts.length})
                  </h2>
                  <Button
                    onClick={handleExportLoyalty}
                    variant="outline"
                    size="sm"
                    className="border-green-500 text-green-500 hover:bg-green-500/10"
                    data-testid="export-loyalty-btn"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Exporter CSV
                  </Button>
                </div>
                
                {loading ? (
                  <div className="text-center py-12">
                    <RefreshCw className="w-8 h-8 text-food-gold animate-spin mx-auto" />
                  </div>
                ) : loyaltyAccounts.length === 0 ? (
                  <div className="text-center py-12">
                    <Gift className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-400 font-outfit">Aucun membre fidélité pour le moment</p>
                    <p className="text-gray-500 font-outfit text-sm mt-2">
                      Les clients reçoivent 1 point par partie jouée. 10 points = 1 partie gratuite!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {loyaltyAccounts.map((account) => {
                      const freeGamesAvailable = (account.free_games_earned || 0) - (account.free_games_used || 0);
                      return (
                        <Card 
                          key={account.id} 
                          className="bg-dark-card border-white/10 hover:border-food-gold/30 transition-colors"
                          data-testid={`loyalty-${account.id}`}
                        >
                          <CardContent className="p-4">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <Star className="w-4 h-4 text-food-gold" />
                                  <span className="font-outfit font-semibold text-white">{account.customer_name}</span>
                                  {freeGamesAvailable > 0 && (
                                    <Badge className="bg-green-500 text-white">
                                      <Gift className="w-3 h-3 mr-1" />
                                      {freeGamesAvailable} gratuite(s)
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                                  <span className="flex items-center gap-1">
                                    <Phone className="w-3 h-3" />
                                    {account.phone}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Gamepad2 className="w-3 h-3" />
                                    {account.total_games_played} parties
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-6">
                                <div className="text-center">
                                  <p className="text-2xl font-rajdhani font-bold text-food-gold">{account.available_points}</p>
                                  <p className="text-xs text-gray-500">Points</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-2xl font-rajdhani font-bold text-green-400">{freeGamesAvailable}</p>
                                  <p className="text-xs text-gray-500">Gratuites</p>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Reviews Tab */}
            <TabsContent value="reviews">
              <div data-testid="reviews-section">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-orbitron font-bold text-xl text-white flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-neon-purple" />
                    Gestion des Avis ({reviews.length})
                  </h2>
                  {reviewStats && (
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-yellow-500">{reviewStats.pending} en attente</span>
                      <span className="text-green-500">{reviewStats.approved} approuvés</span>
                      <span className="text-red-500">{reviewStats.rejected} rejetés</span>
                    </div>
                  )}
                </div>

                {loading ? (
                  <div className="text-center py-12">
                    <RefreshCw className="w-8 h-8 text-neon-purple animate-spin mx-auto" />
                  </div>
                ) : reviews.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageSquare className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-400 font-outfit">Aucun avis pour le moment</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reviews.map((review) => (
                      <Card 
                        key={review.id}
                        className={`bg-dark-card border-white/10 hover:border-neon-purple/30 transition-colors ${
                          review.status === "pending" ? "border-l-4 border-l-yellow-500" : ""
                        }`}
                        data-testid={`review-${review.id}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="font-outfit font-semibold text-white">{review.customer_name}</span>
                                <Badge className={`${
                                  review.status === "pending" ? "bg-yellow-500" :
                                  review.status === "approved" ? "bg-green-500" : "bg-red-500"
                                } text-white`}>
                                  {review.status === "pending" ? "En attente" :
                                   review.status === "approved" ? "Approuvé" : "Rejeté"}
                                </Badge>
                              </div>
                              
                              {/* Stars */}
                              <div className="flex gap-1 mb-2">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <Star
                                    key={star}
                                    className={`w-4 h-4 ${
                                      star <= review.rating ? "text-food-gold fill-food-gold" : "text-gray-600"
                                    }`}
                                  />
                                ))}
                              </div>

                              <p className="text-gray-300 font-outfit">"{review.comment}"</p>
                              
                              <p className="text-gray-600 text-xs mt-2">
                                {new Date(review.created_at).toLocaleDateString("fr-FR", { 
                                  day: "numeric", month: "long", year: "numeric" 
                                })}
                              </p>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2">
                              {review.status === "pending" && (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => updateReviewStatus(review.id, "approved")}
                                    className="bg-green-600 hover:bg-green-700"
                                    data-testid={`approve-${review.id}`}
                                  >
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    Approuver
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => updateReviewStatus(review.id, "rejected")}
                                    data-testid={`reject-${review.id}`}
                                  >
                                    <XCircle className="w-4 h-4 mr-1" />
                                    Rejeter
                                  </Button>
                                </>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => deleteReview(review.id)}
                                className="border-red-500/50 text-red-500 hover:bg-red-500/10"
                                data-testid={`delete-${review.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Candidatures Tab */}
            <TabsContent value="candidatures">
              <div className="space-y-4">
                {/* Header with Export */}
                <div className="flex flex-wrap items-center justify-between gap-4 bg-dark-card p-4 rounded-lg border border-white/10">
                  <div className="flex items-center gap-4">
                    <div className="text-gray-300">
                      <span className="font-semibold text-white">{jobApplications.length}</span> candidature(s)
                      {jobApplicationsStats.pending > 0 && (
                        <span className="ml-2 text-food-orange">
                          ({jobApplicationsStats.pending} en attente)
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = `${API}/admin/export/job-applications`;
                      link.setAttribute('download', '');
                      const headers = getAuthHeaders();
                      fetch(`${API}/admin/export/job-applications`, { headers })
                        .then(res => res.blob())
                        .then(blob => {
                          const url = window.URL.createObjectURL(blob);
                          link.href = url;
                          link.click();
                          window.URL.revokeObjectURL(url);
                        })
                        .catch(() => toast.error("Erreur lors de l'export"));
                    }}
                    className="border-green-500/50 text-green-400 hover:bg-green-500/10"
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Export CSV
                  </Button>
                </div>

                {/* Applications List */}
                {jobApplications.length === 0 ? (
                  <Card className="bg-dark-card border-white/10">
                    <CardContent className="p-8 text-center">
                      <Briefcase className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-400">Aucune candidature reçue</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4">
                    {jobApplications.map((app) => (
                      <Card key={app.id} className="bg-dark-card border-white/10">
                        <CardContent className="p-4">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="space-y-2">
                              <div className="flex items-center gap-3">
                                <h3 className="font-outfit font-semibold text-white text-lg">{app.full_name}</h3>
                                <Badge className={
                                  app.status === "pending" ? "bg-yellow-500/20 text-yellow-400" :
                                  app.status === "reviewed" ? "bg-blue-500/20 text-blue-400" :
                                  app.status === "contacted" ? "bg-purple-500/20 text-purple-400" :
                                  app.status === "hired" ? "bg-green-500/20 text-green-400" :
                                  "bg-red-500/20 text-red-400"
                                }>
                                  {app.status === "pending" ? "En attente" :
                                   app.status === "reviewed" ? "Examiné" :
                                   app.status === "contacted" ? "Contacté" :
                                   app.status === "hired" ? "Embauché" : "Rejeté"}
                                </Badge>
                              </div>
                              
                              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                                <span className="flex items-center gap-1">
                                  <Briefcase className="w-4 h-4 text-green-400" />
                                  {app.position === "serveur" ? "Serveur/Serveuse" :
                                   app.position === "cuisinier" ? "Cuisinier/Cuisinière" :
                                   app.position === "barman" ? "Barman/Barmaid" :
                                   app.position === "caissier" ? "Caissier/Caissière" :
                                   app.position === "livreur" ? "Livreur" :
                                   app.position === "animateur_vr" ? "Animateur VR" :
                                   app.position === "manager" ? "Manager" : app.position}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Phone className="w-4 h-4 text-neon-blue" />
                                  {app.phone}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Mail className="w-4 h-4 text-neon-purple" />
                                  {app.email}
                                </span>
                              </div>
                              
                              {app.message && (
                                <p className="text-gray-500 text-sm mt-2 line-clamp-2">
                                  "{app.message}"
                                </p>
                              )}
                              
                              <p className="text-gray-600 text-xs">
                                Reçue le {app.created_at ? new Date(app.created_at).toLocaleDateString('fr-FR') : "N/A"}
                              </p>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-2">
                              {app.cv_filename && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    setCvLoading(true);
                                    try {
                                      const headers = getAuthHeaders();
                                      const res = await axios.get(`${API}/admin/job-applications/${app.id}`, { headers });
                                      if (res.data.cv_data) {
                                        setSelectedCV({
                                          name: res.data.cv_filename,
                                          data: res.data.cv_data
                                        });
                                        setCvViewerModal(true);
                                      } else {
                                        toast.error("CV non disponible");
                                      }
                                    } catch (err) {
                                      toast.error("Erreur lors du chargement du CV");
                                    } finally {
                                      setCvLoading(false);
                                    }
                                  }}
                                  className="border-neon-blue/50 text-neon-blue hover:bg-neon-blue/10"
                                  disabled={cvLoading}
                                >
                                  <FileText className="w-4 h-4 mr-1" />
                                  CV
                                </Button>
                              )}
                              
                              <Select
                                value={app.status}
                                onValueChange={async (newStatus) => {
                                  try {
                                    const headers = getAuthHeaders();
                                    await axios.put(`${API}/admin/job-applications/${app.id}/status`, 
                                      { status: newStatus }, 
                                      { headers }
                                    );
                                    toast.success("Statut mis à jour");
                                    fetchData();
                                  } catch (err) {
                                    toast.error("Erreur lors de la mise à jour");
                                  }
                                }}
                              >
                                <SelectTrigger className="w-32 bg-surface-highlight border-white/20 text-white text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-dark-card border-white/20">
                                  <SelectItem value="pending" className="text-yellow-400">En attente</SelectItem>
                                  <SelectItem value="reviewed" className="text-blue-400">Examiné</SelectItem>
                                  <SelectItem value="contacted" className="text-purple-400">Contacté</SelectItem>
                                  <SelectItem value="hired" className="text-green-400">Embauché</SelectItem>
                                  <SelectItem value="rejected" className="text-red-400">Rejeté</SelectItem>
                                </SelectContent>
                              </Select>
                              
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  if (!window.confirm(`Supprimer la candidature de ${app.full_name} ?`)) return;
                                  try {
                                    const headers = getAuthHeaders();
                                    await axios.delete(`${API}/admin/job-applications/${app.id}`, { headers });
                                    toast.success("Candidature supprimée");
                                    fetchData();
                                  } catch (err) {
                                    toast.error("Erreur lors de la suppression");
                                  }
                                }}
                                className="border-red-500/50 text-red-500 hover:bg-red-500/10"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Livraisons Tab */}
            <TabsContent value="livraisons">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-orbitron font-bold text-xl text-white flex items-center gap-2">
                    <Truck className="w-5 h-5 text-food-orange" />
                    Commandes Livraison ({deliveryOrders.length})
                  </h2>
                </div>

                {loading ? (
                  <div className="text-center py-12">
                    <RefreshCw className="w-8 h-8 text-food-orange animate-spin mx-auto" />
                  </div>
                ) : deliveryOrders.length === 0 ? (
                  <Card className="bg-dark-card border-white/10">
                    <CardContent className="p-8 text-center">
                      <Truck className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-400">Aucune commande de livraison</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4">
                    {deliveryOrders.map((order) => (
                      <Card key={order.id} className="bg-dark-card border-white/10 hover:border-food-orange/30 transition-colors">
                        <CardContent className="p-4">
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="font-outfit font-semibold text-white">{order.customer_name}</span>
                                <Badge className={
                                  order.payment_status === "paid" ? "bg-green-500/20 text-green-400" :
                                  order.payment_status === "pending_validation" ? "bg-yellow-500/20 text-yellow-400" :
                                  "bg-gray-500/20 text-gray-400"
                                }>
                                  {order.payment_status === "paid" ? "Payé" :
                                   order.payment_status === "pending_validation" ? "Validation" : "En attente"}
                                </Badge>
                                <Badge className={
                                  order.status === "delivered" ? "bg-green-500/20 text-green-400" :
                                  order.status === "preparing" ? "bg-blue-500/20 text-blue-400" :
                                  order.status === "confirmed" ? "bg-purple-500/20 text-purple-400" :
                                  "bg-yellow-500/20 text-yellow-400"
                                }>
                                  {order.status === "delivered" ? "Livré" :
                                   order.status === "preparing" ? "En préparation" :
                                   order.status === "confirmed" ? "Confirmé" : "En attente"}
                                </Badge>
                              </div>
                              
                              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3 h-3" />
                                  {order.customer_phone}
                                </span>
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {order.delivery_zone === "cotonou" ? "Cotonou" : "Hors Cotonou"}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {order.created_at ? new Date(order.created_at).toLocaleDateString('fr-FR') : "N/A"}
                                </span>
                              </div>
                              
                              <p className="text-gray-500 text-xs">
                                {order.items?.length || 0} article(s) - {order.delivery_address?.substring(0, 50)}...
                              </p>
                            </div>
                            
                            <div className="text-right">
                              <p className="font-rajdhani font-bold text-food-gold text-lg">
                                {order.total?.toLocaleString()} FCFA
                              </p>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="border-neon-blue/50 text-neon-blue hover:bg-neon-blue/10"
                                onClick={() => {
                                  setDeliveryDetail(order);
                                  setDeliveryDetailModal(true);
                                }}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              
                              <a href={`https://wa.me/229${order.customer_phone?.replace(/\s/g, '')}`} target="_blank" rel="noopener noreferrer">
                                <Button size="sm" variant="outline" className="border-green-500 text-green-500 hover:bg-green-500/10">
                                  <MessageCircle className="w-4 h-4" />
                                </Button>
                              </a>
                              
                              <Select
                                value={order.status}
                                onValueChange={async (newStatus) => {
                                  try {
                                    const headers = getAuthHeaders();
                                    await axios.put(`${API}/admin/delivery-orders/${order.id}`, 
                                      { status: newStatus }, 
                                      { headers }
                                    );
                                    toast.success("Statut mis à jour");
                                    fetchData();
                                  } catch (err) {
                                    toast.error("Erreur lors de la mise à jour");
                                  }
                                }}
                              >
                                <SelectTrigger className="w-32 bg-surface-highlight border-white/20 text-white text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-dark-card border-white/20">
                                  <SelectItem value="pending" className="text-yellow-400">En attente</SelectItem>
                                  <SelectItem value="confirmed" className="text-purple-400">Confirmé</SelectItem>
                                  <SelectItem value="preparing" className="text-blue-400">En préparation</SelectItem>
                                  <SelectItem value="delivered" className="text-green-400">Livré</SelectItem>
                                  <SelectItem value="cancelled" className="text-red-400">Annulé</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* CV Viewer Modal */}
      <Dialog open={cvViewerModal} onOpenChange={setCvViewerModal}>
        <DialogContent className="bg-dark-card border-white/10 text-white max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="font-orbitron text-neon-blue flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {selectedCV?.name || "CV"}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            {selectedCV?.data && (
              <div className="space-y-4">
                <Button
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = `data:application/pdf;base64,${selectedCV.data}`;
                    link.download = selectedCV.name;
                    link.click();
                  }}
                  className="bg-neon-blue hover:bg-neon-blue/80"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Télécharger le CV
                </Button>
                <iframe
                  src={`data:application/pdf;base64,${selectedCV.data}`}
                  className="w-full h-[60vh] rounded-lg border border-white/10"
                  title="CV Viewer"
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reschedule Modal */}
      <Dialog open={rescheduleModal} onOpenChange={setRescheduleModal}>
        <DialogContent className="bg-dark-card border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="font-orbitron text-neon-blue flex items-center gap-2">
              <CalendarClock className="w-5 h-5" />
              Reprogrammer la réservation
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              {selectedBooking && (
                <>
                  Client: <span className="text-white">{selectedBooking.customer_name}</span>
                  <br />
                  Actuelle: <span className="text-white">{formatDateFR(selectedBooking.date)} à {selectedBooking.time_slot}</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
              <p className="text-yellow-400 text-sm font-outfit">
                ⚠️ <strong>Attention:</strong> Le client ne pourra reprogrammer qu'une seule fois. 
                Après cette reprogrammation, les frais de réservation ne seront pas remboursables.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-date" className="text-gray-300">Nouvelle date</Label>
              <Input
                id="new-date"
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="bg-surface-highlight border-white/20 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-time" className="text-gray-300">Nouveau créneau</Label>
              <Select value={newTime} onValueChange={setNewTime}>
                <SelectTrigger className="bg-surface-highlight border-white/20 text-white">
                  <SelectValue placeholder="Sélectionner un créneau" />
                </SelectTrigger>
                <SelectContent className="bg-dark-card border-white/20">
                  {["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"].map((time) => (
                    <SelectItem key={time} value={time} className="text-white">
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRescheduleModal(false)}
              className="border-white/20 text-gray-300"
            >
              Annuler
            </Button>
            <Button
              onClick={handleReschedule}
              disabled={rescheduleLoading || !newDate || !newTime}
              className="bg-neon-blue text-black font-rajdhani font-bold"
            >
              {rescheduleLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CalendarClock className="w-4 h-4 mr-2" />
              )}
              Reprogrammer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteModal} onOpenChange={setDeleteModal}>
        <DialogContent className="bg-dark-card border-red-500/30 text-white">
          <DialogHeader>
            <DialogTitle className="font-orbitron text-red-500 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              Supprimer définitivement
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              {bookingToDelete && (
                <>
                  Voulez-vous vraiment supprimer la réservation de <span className="text-white font-semibold">{bookingToDelete.name}</span> ?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <p className="text-red-400 text-sm font-outfit">
                ⚠️ <strong>ATTENTION:</strong> Cette action est <strong>IRRÉVERSIBLE</strong>. 
                La réservation sera définitivement supprimée de la base de données.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteModal(false);
                setBookingToDelete(null);
              }}
              className="border-white/20 text-gray-300"
            >
              Annuler
            </Button>
            <Button
              onClick={confirmDeleteBooking}
              disabled={deleteLoading}
              className="bg-red-600 hover:bg-red-700 text-white font-rajdhani font-bold"
            >
              {deleteLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Location Request Modal */}
      <Dialog open={deleteLocationModal} onOpenChange={setDeleteLocationModal}>
        <DialogContent className="bg-dark-card border-red-500/30 text-white">
          <DialogHeader>
            <DialogTitle className="font-orbitron text-red-500 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              Supprimer la demande de location
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              {locationToDelete && (
                <>
                  Voulez-vous vraiment supprimer la demande de <span className="text-white font-semibold">{locationToDelete.fullName}</span> pour l'événement <span className="text-neon-red">{locationToDelete.eventType}</span> ?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <p className="text-red-400 text-sm font-outfit">
                ⚠️ <strong>ATTENTION:</strong> Cette action est <strong>IRRÉVERSIBLE</strong>. 
                La demande sera définitivement supprimée de la base de données.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteLocationModal(false);
                setLocationToDelete(null);
              }}
              className="border-white/20 text-gray-300"
            >
              Annuler
            </Button>
            <Button
              onClick={handleDeleteLocation}
              disabled={deleteLocationLoading}
              className="bg-red-600 hover:bg-red-700 text-white font-rajdhani font-bold"
            >
              {deleteLocationLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPage;
