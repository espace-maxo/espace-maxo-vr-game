import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { 
  BarChart3, Calendar, Users, CreditCard, Clock, 
  Phone, Gamepad2, CheckCircle, XCircle, AlertCircle,
  RefreshCw, Filter, MessageCircle, TrendingUp, LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const AdminPage = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: "all", booking_status: "all" });

  // Check authentication
  useEffect(() => {
    const isAuth = sessionStorage.getItem("adminAuth");
    if (!isAuth) {
      navigate("/admin");
    }
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem("adminAuth");
    toast.success("Déconnexion réussie");
    navigate("/admin");
  };

  useEffect(() => {
    fetchData();
  }, [filter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, bookingsRes] = await Promise.all([
        axios.get(`${API}/admin/stats`),
        axios.get(`${API}/admin/bookings`, {
          params: {
            status: filter.status !== "all" ? filter.status : undefined,
            booking_status: filter.booking_status !== "all" ? filter.booking_status : undefined,
            limit: 100
          }
        })
      ]);
      setStats(statsRes.data);
      setBookings(bookingsRes.data.bookings);
    } catch (error) {
      console.error("Error fetching admin data:", error);
      toast.error("Erreur lors du chargement des données");
    } finally {
      setLoading(false);
    }
  };

  const updateBookingStatus = async (bookingId, newStatus) => {
    try {
      await axios.put(`${API}/admin/bookings/${bookingId}`, {
        booking_status: newStatus
      });
      toast.success("Statut mis à jour");
      fetchData();
    } catch (error) {
      toast.error("Erreur lors de la mise à jour");
    }
  };

  const cancelBooking = async (bookingId) => {
    if (!window.confirm("Êtes-vous sûr de vouloir annuler cette réservation?")) return;
    
    try {
      await axios.delete(`${API}/admin/bookings/${bookingId}`);
      toast.success("Réservation annulée");
      fetchData();
    } catch (error) {
      toast.error("Erreur lors de l'annulation");
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
          <Button 
            onClick={fetchData} 
            className="bg-neon-blue text-black font-rajdhani font-bold"
            disabled={loading}
            data-testid="refresh-button"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
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
        </section>
      )}

      {/* Filters */}
      <section className="px-4 pb-4" data-testid="filters-section">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-4 bg-dark-card p-4 rounded-lg border border-white/10">
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
      </section>

      {/* Bookings Table */}
      <section className="px-4 pb-12" data-testid="bookings-section">
        <div className="max-w-7xl mx-auto">
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
      </section>
    </div>
  );
};

export default AdminPage;
