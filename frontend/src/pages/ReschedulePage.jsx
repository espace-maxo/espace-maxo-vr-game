import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { CalendarClock, AlertTriangle, CheckCircle, Gamepad2, Calendar, Clock, Users, Loader2, Search, Phone, User, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Helper to format date as dd/mm/yyyy
const formatDateFR = (dateStr) => {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
};

const ReschedulePage = () => {
  const navigate = useNavigate();

  // Search state
  const [searchPhone, setSearchPhone] = useState("");
  const [searchName, setSearchName] = useState("");
  const [searching, setSearching] = useState(false);
  
  // Booking state
  const [booking, setBooking] = useState(null);
  const [bookingInfo, setBookingInfo] = useState(null);
  
  // Reschedule state
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [error, setError] = useState(null);
  
  // Payment state
  const [paymentConfig, setPaymentConfig] = useState(null);
  const [awaitingPayment, setAwaitingPayment] = useState(false);

  // Fetch payment config on mount
  useEffect(() => {
    const fetchPaymentConfig = async () => {
      try {
        const response = await axios.get(`${API}/payment/config`);
        setPaymentConfig(response.data);
      } catch (error) {
        console.error("Error fetching payment config:", error);
      }
    };
    fetchPaymentConfig();
  }, []);

  // Load Kkiapay script
  useEffect(() => {
    if (!document.getElementById("kkiapay-script")) {
      const script = document.createElement("script");
      script.id = "kkiapay-script";
      script.src = "https://cdn.kkiapay.me/k.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  const handleSearch = async () => {
    if (!searchPhone || !searchName) {
      toast.error("Veuillez entrer votre numéro de téléphone et votre nom");
      return;
    }

    // Validate phone format (8 digits for Benin)
    const cleanPhone = searchPhone.replace(/\s/g, '');
    if (cleanPhone.length < 8) {
      toast.error("Le numéro doit contenir au moins 8 chiffres");
      return;
    }

    setSearching(true);
    setError(null);
    setBooking(null);
    setBookingInfo(null);

    try {
      const response = await axios.post(`${API}/bookings/find-for-reschedule`, {
        phone: cleanPhone,
        name: searchName.trim()
      });
      
      setBooking(response.data.booking);
      setBookingInfo(response.data);
      setNewDate(response.data.booking.date);
      setNewTime(response.data.booking.time_slot);
      toast.success("Réservation trouvée!");
    } catch (err) {
      const errorMsg = err.response?.data?.detail || "Aucune réservation trouvée avec ces informations";
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setSearching(false);
    }
  };

  const handleReschedule = async () => {
    if (!newDate || !newTime) {
      toast.error("Veuillez sélectionner une date et un créneau");
      return;
    }

    // Check if fee is required
    if (bookingInfo?.fee_required && bookingInfo?.fee_amount > 0) {
      // Initiate payment for rescheduling fee
      initiatePayment();
    } else {
      // No fee required, proceed directly
      executeReschedule();
    }
  };

  const initiatePayment = () => {
    if (!paymentConfig || !window.openKkiapayWidget) {
      toast.error("Service de paiement non disponible");
      return;
    }

    setAwaitingPayment(true);

    window.openKkiapayWidget({
      amount: bookingInfo.fee_amount,
      position: "center",
      callback: "",
      data: "",
      theme: "#007bff",
      key: paymentConfig.public_key,
      sandbox: paymentConfig.sandbox,
      phone: searchPhone.replace(/\s/g, ''),
      name: searchName,
      description: `Frais reprogrammation - ${formatDateFR(newDate)}`
    });

    // Listen for payment success
    window.addSuccessListener(async (response) => {
      console.log("Payment success:", response);
      toast.success("Paiement des frais réussi!");
      
      // Execute reschedule after successful payment
      await executeRescheduleWithPayment(response.transactionId);
    });

    window.addFailedListener((response) => {
      console.log("Payment failed:", response);
      setAwaitingPayment(false);
      toast.error("Le paiement a échoué. Veuillez réessayer.");
    });

    window.addKkiapayCloseListener(() => {
      setAwaitingPayment(false);
    });
  };

  const executeReschedule = async () => {
    setSubmitting(true);
    try {
      const response = await axios.post(
        `${API}/bookings/${booking.id}/reschedule-by-client`,
        { 
          new_date: newDate, 
          new_time_slot: newTime,
          phone: searchPhone.replace(/\s/g, ''),
          name: searchName.trim()
        }
      );
      
      setSuccess(true);
      setSuccessData(response.data);
      toast.success("Réservation reprogrammée avec succès!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur lors de la reprogrammation");
    } finally {
      setSubmitting(false);
    }
  };

  const executeRescheduleWithPayment = async (transactionId) => {
    setSubmitting(true);
    try {
      const response = await axios.post(
        `${API}/bookings/${booking.id}/reschedule-by-client`,
        { 
          new_date: newDate, 
          new_time_slot: newTime,
          phone: searchPhone.replace(/\s/g, ''),
          name: searchName.trim(),
          payment_transaction_id: transactionId
        }
      );
      
      setSuccess(true);
      setSuccessData(response.data);
      toast.success("Réservation reprogrammée avec succès!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur lors de la reprogrammation");
    } finally {
      setSubmitting(false);
      setAwaitingPayment(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen pt-20 bg-dark-bg flex items-center justify-center px-4">
        <Card className="bg-dark-card border-green-500/30 max-w-md w-full">
          <CardContent className="p-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="font-orbitron text-xl text-white mb-2">Reprogrammation réussie!</h2>
            <div className="text-gray-300 font-outfit space-y-2 mb-4">
              <p>Votre nouvelle réservation:</p>
              <p className="text-neon-blue font-semibold text-lg">
                {formatDateFR(successData?.new_date)} à {successData?.new_time_slot}
              </p>
              {successData?.fee_charged > 0 && (
                <p className="text-green-400 text-sm">
                  Frais de reprogrammation payés: {successData?.fee_charged} FCFA
                </p>
              )}
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-6">
              <p className="text-yellow-400 text-sm">{successData?.warning}</p>
            </div>
            <Button 
              onClick={() => navigate("/")}
              className="bg-neon-blue text-black font-rajdhani font-bold"
            >
              Retour à l'accueil
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 bg-dark-bg" data-testid="reschedule-page">
      {/* Hero */}
      <section className="py-12 px-4 bg-gradient-radial-blue">
        <div className="max-w-2xl mx-auto text-center">
          <CalendarClock className="w-12 h-12 text-neon-blue mx-auto mb-4" />
          <h1 className="font-orbitron font-black text-2xl sm:text-3xl lg:text-4xl uppercase tracking-tight mb-4">
            <span className="text-white">Reprogrammer</span><br />
            <span className="text-neon-blue">Session de Jeu</span>
          </h1>
          <p className="text-gray-300 font-outfit text-lg">
            Vous avez un imprévu ? Reprogrammez votre session en quelques clics
          </p>
        </div>
      </section>

      <section className="py-8 px-4">
        <div className="max-w-xl mx-auto">
          {/* Search Form */}
          {!booking && (
            <Card className="bg-dark-card border-white/10 mb-6">
              <CardHeader>
                <CardTitle className="font-orbitron text-lg text-white flex items-center gap-2">
                  <Search className="w-5 h-5 text-neon-blue" />
                  Rechercher ma réservation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="search-phone" className="text-gray-300 font-outfit flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Numéro de téléphone
                  </Label>
                  <Input
                    id="search-phone"
                    type="tel"
                    placeholder="97 XX XX XX"
                    value={searchPhone}
                    onChange={(e) => setSearchPhone(e.target.value)}
                    className="bg-surface-highlight border-white/20 text-white font-outfit"
                  />
                  <p className="text-xs text-gray-500">Format: 8 chiffres (ex: 97123456)</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="search-name" className="text-gray-300 font-outfit flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Nom exact de la réservation
                  </Label>
                  <Input
                    id="search-name"
                    type="text"
                    placeholder="Votre nom"
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    className="bg-surface-highlight border-white/20 text-white font-outfit"
                  />
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    <p className="text-red-400 text-sm flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      {error}
                    </p>
                  </div>
                )}

                <Button
                  onClick={handleSearch}
                  disabled={searching || !searchPhone || !searchName}
                  className="w-full bg-neon-blue text-black font-rajdhani font-bold uppercase py-6"
                >
                  {searching ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Recherche en cours...
                    </>
                  ) : (
                    <>
                      <Search className="w-5 h-5 mr-2" />
                      Rechercher ma réservation
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Booking Found - Show Reschedule Form */}
          {booking && (
            <>
              {/* Current Booking Info */}
              <Card className="bg-dark-card border-white/10 mb-6">
                <CardHeader>
                  <CardTitle className="font-orbitron text-lg text-white flex items-center gap-2">
                    <Gamepad2 className="w-5 h-5 text-neon-blue" />
                    Réservation trouvée
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-gray-300">
                    <Users className="w-4 h-4 text-gray-500" />
                    <span className="font-outfit">{booking.customer_name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-300">
                    <Gamepad2 className="w-4 h-4 text-gray-500" />
                    <span className="font-outfit">
                      {booking.game_type === "VR_360" ? "VR 360°" : "Simulateur"} - 
                      {booking.number_of_players} joueur(s) x {booking.number_of_games} partie(s)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-neon-red">
                    <Calendar className="w-4 h-4" />
                    <span className="font-outfit font-semibold">{formatDateFR(booking.date)}</span>
                    <Clock className="w-4 h-4 ml-2" />
                    <span className="font-outfit font-semibold">{booking.time_slot}</span>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setBooking(null);
                      setBookingInfo(null);
                      setError(null);
                    }}
                    className="mt-2 text-gray-400 border-gray-600"
                  >
                    Rechercher une autre réservation
                  </Button>
                </CardContent>
              </Card>

              {/* Warning */}
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-yellow-400 font-outfit text-sm">
                      {bookingInfo?.warning_message}
                    </p>
                    {bookingInfo?.fee_required && (
                      <div className="mt-2 bg-red-500/20 border border-red-500/30 rounded p-2">
                        <p className="text-red-400 font-semibold flex items-center gap-2">
                          <CreditCard className="w-4 h-4" />
                          Frais de reprogrammation: {bookingInfo?.fee_amount} FCFA
                        </p>
                        <p className="text-red-300 text-xs mt-1">
                          Ces frais seront prélevés par mobile money avant la reprogrammation.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* New Date/Time Selection */}
              <Card className="bg-dark-card border-neon-blue/30">
                <CardHeader>
                  <CardTitle className="font-orbitron text-lg text-neon-blue flex items-center gap-2">
                    <CalendarClock className="w-5 h-5" />
                    Nouvelle date et heure
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-date" className="text-gray-300 font-outfit">Nouvelle date</Label>
                    <Input
                      id="new-date"
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="bg-surface-highlight border-white/20 text-white font-outfit"
                    />
                    {newDate && (
                      <p className="text-neon-blue text-sm">
                        Nouvelle date: {formatDateFR(newDate)}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new-time" className="text-gray-300 font-outfit">Nouveau créneau</Label>
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

                  <Button
                    onClick={handleReschedule}
                    disabled={submitting || awaitingPayment || !newDate || !newTime}
                    className={`w-full font-rajdhani font-bold uppercase py-6 text-lg mt-4 ${
                      bookingInfo?.fee_required 
                        ? "bg-red-600 hover:bg-red-700 text-white" 
                        : "bg-neon-blue text-black"
                    }`}
                  >
                    {submitting || awaitingPayment ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        {awaitingPayment ? "Paiement en cours..." : "Reprogrammation en cours..."}
                      </>
                    ) : (
                      <>
                        {bookingInfo?.fee_required ? (
                          <>
                            <CreditCard className="w-5 h-5 mr-2" />
                            Payer {bookingInfo?.fee_amount} FCFA et reprogrammer
                          </>
                        ) : (
                          <>
                            <CalendarClock className="w-5 h-5 mr-2" />
                            Confirmer la reprogrammation (gratuit)
                          </>
                        )}
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default ReschedulePage;
