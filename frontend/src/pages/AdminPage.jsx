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
  Mail, Building2, CalendarDays, DollarSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: "all", booking_status: "all" });
  const [activeTab, setActiveTab] = useState("bookings");

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
      const [statsRes, bookingsRes, loyaltyRes, reviewsRes, locationRes] = await Promise.all([
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
        axios.get(`${API}/admin/location-requests`, { headers }).catch(() => ({ data: { requests: [], stats: {} } }))
      ]);
      setStats(statsRes.data);
      setBookings(bookingsRes.data.bookings);
      setLoyaltyAccounts(loyaltyRes.data.accounts || []);
      setLoyaltyStats(loyaltyRes.data.stats || {});
      setReviews(reviewsRes.data.reviews || []);
      setReviewStats(reviewsRes.data.stats || {});
      setLocationRequests(locationRes.data.requests || []);
      setLocationStats(locationRes.data.stats || {});
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
                <h2 className="font-orbitron font-bold text-xl text-white mb-4">
                  Réservations ({bookings.length})
                </h2>
                
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
                            {booking.date}
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
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
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
                <h2 className="font-orbitron font-bold text-xl text-white mb-4 flex items-center gap-2">
                  <Star className="w-5 h-5 text-food-gold" />
                  Membres Fidélité ({loyaltyAccounts.length})
                </h2>
                
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
          </Tabs>
        </div>
      </section>
    </div>
  );
};

export default AdminPage;
