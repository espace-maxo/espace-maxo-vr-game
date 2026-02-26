import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { format, addDays, startOfToday } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar, Clock, User, Phone, Gamepad2, Users, CreditCard, Loader2, Smartphone, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import LoyaltyCard from "@/components/LoyaltyCard";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BookingPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const preselectedGame = searchParams.get("game");
  const [freeGamesAvailable, setFreeGamesAvailable] = useState(0);
  const [useFreeGame, setUseFreeGame] = useState(false);
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [paymentConfig, setPaymentConfig] = useState(null);
  const [currentBookingId, setCurrentBookingId] = useState(null);
  
  const [formData, setFormData] = useState({
    customerName: "",
    customerPhone: "",
    gameType: preselectedGame || "VR_360",
    date: null,
    timeSlot: "",
    numberOfPlayers: 1,
    numberOfGames: 1,
    payFullAmount: false,
    useWallet: false
  });
  
  // Wallet state
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletExists, setWalletExists] = useState(false);

  const today = startOfToday();
  const maxDate = addDays(today, 30);

  // Load payment config on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await axios.get(`${API}/payment/config`);
        console.log("Payment config loaded:", response.data);
        setPaymentConfig(response.data);
      } catch (error) {
        console.error("Error fetching payment config:", error);
        toast.error("Erreur de chargement de la configuration de paiement");
      }
    };
    fetchConfig();

    // Load Kkiapay script immediately
    const loadKkiapayScript = () => {
      if (window.openKkiapayWidget) {
        console.log("Kkiapay already loaded");
        return;
      }

      const existingScript = document.querySelector('script[src*="kkiapay"]');
      if (existingScript) {
        console.log("Kkiapay script already exists");
        return;
      }

      const script = document.createElement("script");
      script.src = "https://cdn.kkiapay.me/k.js";
      script.async = true;
      script.onload = () => console.log("Kkiapay script loaded successfully");
      script.onerror = (err) => console.error("Failed to load Kkiapay:", err);
      document.head.appendChild(script);
    };
    
    loadKkiapayScript();
  }, []);

  // Fetch wallet balance when phone changes
  useEffect(() => {
    const fetchWalletBalance = async () => {
      if (formData.customerPhone && formData.customerPhone.length >= 10) {
        try {
          const response = await axios.get(`${API}/wallet/${formData.customerPhone}`);
          setWalletBalance(response.data.balance || 0);
          setWalletExists(response.data.exists || false);
        } catch (error) {
          setWalletBalance(0);
          setWalletExists(false);
        }
      }
    };
    fetchWalletBalance();
  }, [formData.customerPhone]);

  useEffect(() => {
    if (formData.date) {
      fetchSlots(format(formData.date, "yyyy-MM-dd"));
    }
  }, [formData.date]);

  const fetchSlots = async (date) => {
    setSlotsLoading(true);
    try {
      const response = await axios.get(`${API}/slots/${date}`);
      setSlots(response.data.slots);
    } catch (error) {
      console.error("Error fetching slots:", error);
      toast.error("Erreur lors du chargement des créneaux");
    } finally {
      setSlotsLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const calculateTotal = () => {
    // Prix différents selon le type de jeu
    const gamePrice = formData.gameType === "RACING_SIMULATOR" ? 1500 : 2000;
    const reservationFee = 500;
    const totalGames = formData.numberOfPlayers * formData.numberOfGames;
    const gamesPrice = totalGames * gamePrice;
    const total = gamesPrice + reservationFee;
    
    // Calculate amount to pay based on options
    let amountToPay = reservationFee; // Default: just reservation fee
    if (formData.payFullAmount) {
      amountToPay = total;
    }
    
    // Apply wallet balance if enabled
    let walletUsed = 0;
    if (formData.useWallet && walletBalance > 0) {
      walletUsed = Math.min(walletBalance, amountToPay);
      amountToPay = amountToPay - walletUsed;
    }
    
    return {
      gamesPrice,
      reservationFee,
      total,
      amountToPay,
      walletUsed,
      gamePrice
    };
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('fr-FR').format(price);
  };

  // Handle Kkiapay payment success
  const handlePaymentSuccess = useCallback(async (transactionId, bookingId) => {
    setLoading(true);
    try {
      const response = await axios.post(`${API}/payment/verify`, {
        transaction_id: transactionId,
        booking_id: bookingId
      });
      
      if (response.data.status === "success") {
        toast.success("Paiement réussi!");
        navigate(`/booking/confirmation?booking_id=${bookingId}&status=success`);
      } else {
        toast.error("Erreur lors de la vérification du paiement");
        setLoading(false);
      }
    } catch (error) {
      console.error("Payment verification error:", error);
      toast.error("Erreur lors de la vérification");
      setLoading(false);
    }
  }, [navigate]);

  // Open Kkiapay widget
  const openPaymentWidget = async (bookingId) => {
    console.log("Opening payment widget for booking:", bookingId);
    console.log("Payment config:", paymentConfig);
    
    // Check if we have a valid public key
    if (!paymentConfig || !paymentConfig.public_key) {
      console.error("Payment config missing:", paymentConfig);
      toast.error("Configuration de paiement manquante. Veuillez rafraîchir la page.");
      setLoading(false);
      return;
    }

    // Check if Kkiapay is loaded
    if (typeof window.openKkiapayWidget !== "function") {
      console.error("Kkiapay widget not loaded");
      toast.error("Le module de paiement n'est pas chargé. Veuillez rafraîchir la page.");
      setLoading(false);
      return;
    }

    // Clean phone number
    const cleanPhone = formData.customerPhone.replace(/\s/g, '').replace(/^\+229/, '');
    console.log("Clean phone:", cleanPhone);

    // Calculate the amount to pay
    const { amountToPay, walletUsed } = calculateTotal();
    
    // If wallet covers everything, skip Kkiapay
    if (amountToPay === 0 && walletUsed > 0) {
      // Process wallet payment directly
      try {
        // Use wallet balance
        await axios.post(`${API}/wallet/use`, {
          phone: cleanPhone,
          amount: walletUsed,
          service_type: "games",
          description: `Réservation ${formData.gameType === "VR_360" ? "VR 360°" : "Simulateur"} - ${formData.date ? format(formData.date, "dd/MM/yyyy") : ""}`
        });
        
        // Mark booking as paid
        await axios.post(`${API}/payment/verify`, {
          transaction_id: `WALLET-${Date.now()}`,
          booking_id: bookingId,
          wallet_payment: true,
          wallet_amount: walletUsed
        });
        
        toast.success("Paiement par provision effectué!");
        navigate(`/booking/confirmation?booking_id=${bookingId}`);
      } catch (error) {
        console.error("Wallet payment error:", error);
        toast.error("Erreur lors du paiement par provision");
        setLoading(false);
      }
      return;
    }

    try {
      // Open the Kkiapay widget with calculated amount
      window.openKkiapayWidget({
        amount: amountToPay,
        api_key: paymentConfig.public_key,
        sandbox: paymentConfig.sandbox || false,
        phone: cleanPhone,
        name: formData.customerName,
        reason: "Reservation Espace Maxo",
        data: bookingId,
        theme: "#00f0ff"
      });

      console.log("Kkiapay widget opened with amount:", amountToPay);

      // Set up success listener
      if (typeof window.addSuccessListener === "function") {
        window.addSuccessListener((response) => {
          console.log("Payment success:", response);
          if (response && response.transactionId) {
            handlePaymentSuccess(response.transactionId, bookingId);
          }
        });
      }

      // Set up failed listener
      if (typeof window.addFailedListener === "function") {
        window.addFailedListener((error) => {
          console.error("Payment failed:", error);
          toast.error("Le paiement a échoué. Veuillez réessayer.");
          setLoading(false);
        });
      }

      // Set up close listener
      if (typeof window.addKkiapayCloseListener === "function") {
        window.addKkiapayCloseListener(() => {
          console.log("Payment widget closed");
          setTimeout(() => setLoading(false), 500);
        });
      }

    } catch (error) {
      console.error("Kkiapay widget error:", error);
      toast.error("Erreur lors de l'ouverture du paiement. Veuillez réessayer.");
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.customerName || !formData.customerPhone || !formData.date || !formData.timeSlot) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }

    setLoading(true);
    try {
      // Create booking with payment options
      const bookingResponse = await axios.post(`${API}/bookings`, {
        customer_name: formData.customerName,
        customer_phone: formData.customerPhone,
        game_type: formData.gameType,
        date: format(formData.date, "yyyy-MM-dd"),
        time_slot: formData.timeSlot,
        number_of_players: formData.numberOfPlayers,
        number_of_games: formData.numberOfGames,
        pay_full_amount: formData.payFullAmount,
        use_wallet: formData.useWallet
      });

      const booking = bookingResponse.data;
      setCurrentBookingId(booking.id);
      
      // Open payment widget
      openPaymentWidget(booking.id);
      
    } catch (error) {
      console.error("Error creating booking:", error);
      const message = error.response?.data?.detail || "Erreur lors de la réservation";
      toast.error(message);
      setLoading(false);
    }
  };

  const isPhoneValid = formData.customerPhone.length === 10 && formData.customerPhone.startsWith('01');
  const canProceedToStep2 = formData.customerName && isPhoneValid;
  const canProceedToStep3 = formData.date && formData.timeSlot;

  return (
    <div className="min-h-screen pt-20 bg-dark-bg" data-testid="booking-page">
      {/* Hero */}
      <section className="py-12 px-4 bg-gradient-radial-blue" data-testid="booking-hero">
        <div className="max-w-7xl mx-auto text-center">
          <Calendar className="w-12 h-12 text-neon-blue mx-auto mb-4" />
          <h1 className="font-orbitron font-black text-4xl sm:text-5xl uppercase tracking-tight mb-4">
            <span className="text-white">Réserver</span>{" "}
            <span className="text-neon-blue">une Session</span>
          </h1>
          <p className="font-outfit text-lg text-gray-300 max-w-2xl mx-auto">
            Payez par <span className="text-food-gold font-semibold">MTN Mobile Money</span>, <span className="text-neon-blue font-semibold">Moov Money</span> ou <span className="text-neon-red font-semibold">Celtiis</span>
          </p>
        </div>
      </section>

      {/* Payment Methods Banner */}
      <section className="py-4 px-4 bg-dark-card border-y border-white/10">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-center gap-6">
          <div className="flex items-center gap-2 text-food-gold">
            <Smartphone className="w-5 h-5" />
            <span className="font-rajdhani font-bold">MTN MoMo</span>
          </div>
          <div className="flex items-center gap-2 text-neon-blue">
            <Smartphone className="w-5 h-5" />
            <span className="font-rajdhani font-bold">Moov Money</span>
          </div>
          <div className="flex items-center gap-2 text-neon-red">
            <Smartphone className="w-5 h-5" />
            <span className="font-rajdhani font-bold">Celtiis</span>
          </div>
        </div>
      </section>

      {/* Progress Steps */}
      <section className="py-6 px-4 bg-dark-card" data-testid="booking-progress">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between">
            {[
              { num: 1, label: "Informations" },
              { num: 2, label: "Date & Heure" },
              { num: 3, label: "Paiement" }
            ].map((s, i) => (
              <div key={s.num} className="flex items-center">
                <div 
                  className={`flex items-center justify-center w-10 h-10 rounded-full font-rajdhani font-bold transition-all ${
                    step >= s.num 
                      ? "bg-neon-blue text-black" 
                      : "bg-surface-highlight text-gray-400"
                  }`}
                >
                  {s.num}
                </div>
                <span className={`ml-2 font-outfit text-sm hidden sm:inline ${
                  step >= s.num ? "text-white" : "text-gray-400"
                }`}>
                  {s.label}
                </span>
                {i < 2 && (
                  <div className={`w-12 sm:w-20 h-0.5 mx-4 ${
                    step > s.num ? "bg-neon-blue" : "bg-surface-highlight"
                  }`}></div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="py-12 px-4" data-testid="booking-form">
        <div className="max-w-4xl mx-auto">
          {/* Step 1: Personal Info */}
          {step === 1 && (
            <div className="space-y-8 animate-fade-in-up" data-testid="step-1">
              <div className="bg-dark-card rounded-xl p-6 md:p-8 border border-white/10">
                <h2 className="font-orbitron font-bold text-xl text-neon-blue mb-6 flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Vos Informations
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="font-rajdhani font-semibold text-white">
                      Nom complet *
                    </Label>
                    <Input
                      id="name"
                      placeholder="Votre nom"
                      value={formData.customerName}
                      onChange={(e) => handleInputChange("customerName", e.target.value)}
                      className="bg-surface-highlight border-white/20 text-white placeholder:text-gray-500 focus:border-neon-blue"
                      data-testid="input-name"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="font-rajdhani font-semibold text-white">
                      Téléphone (MTN/Moov/Celtiis) *
                    </Label>
                    <Input
                      id="phone"
                      placeholder="Ex: 0197000000"
                      value={formData.customerPhone}
                      onChange={(e) => {
                        // Only allow digits and limit to 10 characters
                        const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                        handleInputChange("customerPhone", value);
                      }}
                      maxLength={10}
                      className="bg-surface-highlight border-white/20 text-white placeholder:text-gray-500 focus:border-neon-blue"
                      data-testid="input-phone"
                    />
                    {formData.customerPhone && formData.customerPhone.length > 0 && (
                      <p className={`text-xs ${
                        formData.customerPhone.length === 10 && formData.customerPhone.startsWith('01')
                          ? 'text-green-500'
                          : 'text-yellow-500'
                      }`}>
                        {formData.customerPhone.length === 10 && formData.customerPhone.startsWith('01')
                          ? 'Format valide'
                          : `Format requis: 01XXXXXXXX (${formData.customerPhone.length}/10 chiffres)`
                        }
                      </p>
                    )}
                  </div>
                </div>

                {/* Loyalty Card */}
                {formData.customerPhone && formData.customerPhone.length === 10 && (
                  <div className="mt-6">
                    <LoyaltyCard 
                      phone={formData.customerPhone} 
                      onFreeGamesAvailable={setFreeGamesAvailable}
                    />
                  </div>
                )}
              </div>

              <div className="bg-dark-card rounded-xl p-6 md:p-8 border border-white/10">
                <h2 className="font-orbitron font-bold text-xl text-neon-blue mb-6 flex items-center gap-2">
                  <Gamepad2 className="w-5 h-5" />
                  Type de Jeu
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { type: "VR_360", label: "VR 360°", color: "neon-blue", desc: "Réalité Virtuelle immersive" },
                    { type: "RACING_SIMULATOR", label: "Simulateur Course", color: "neon-red", desc: "Simulateur professionnel" }
                  ].map((game) => (
                    <button
                      key={game.type}
                      onClick={() => handleInputChange("gameType", game.type)}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        formData.gameType === game.type
                          ? game.color === "neon-blue"
                            ? "border-neon-blue bg-neon-blue/10"
                            : "border-neon-red bg-neon-red/10"
                          : "border-white/10 hover:border-white/30"
                      }`}
                      data-testid={`game-${game.type.toLowerCase()}`}
                    >
                      <div className={`font-orbitron font-bold text-lg ${
                        formData.gameType === game.type 
                          ? game.color === "neon-blue" ? "text-neon-blue" : "text-neon-red"
                          : "text-white"
                      }`}>
                        {game.label}
                      </div>
                      <div className="text-gray-400 font-outfit text-sm mt-1">
                        {game.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-dark-card rounded-xl p-6 md:p-8 border border-white/10">
                <h2 className="font-orbitron font-bold text-xl text-neon-blue mb-6 flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Nombre de Joueurs & Parties
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="font-rajdhani font-semibold text-white">
                      Nombre de joueurs
                    </Label>
                    <Select 
                      value={formData.numberOfPlayers.toString()} 
                      onValueChange={(v) => handleInputChange("numberOfPlayers", parseInt(v))}
                    >
                      <SelectTrigger className="bg-surface-highlight border-white/20 text-white" data-testid="select-players">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-dark-card border-white/20">
                        {[1, 2, 3, 4].map((n) => (
                          <SelectItem key={n} value={n.toString()} className="text-white hover:bg-surface-highlight">
                            {n} joueur{n > 1 ? "s" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="font-rajdhani font-semibold text-white">
                      Parties par joueur
                    </Label>
                    <Select 
                      value={formData.numberOfGames.toString()} 
                      onValueChange={(v) => handleInputChange("numberOfGames", parseInt(v))}
                    >
                      <SelectTrigger className="bg-surface-highlight border-white/20 text-white" data-testid="select-games">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-dark-card border-white/20">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <SelectItem key={n} value={n.toString()} className="text-white hover:bg-surface-highlight">
                            {n} partie{n > 1 ? "s" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => setStep(2)}
                  disabled={!canProceedToStep2}
                  className="bg-neon-blue text-black font-rajdhani font-bold uppercase px-8 py-3 hover:shadow-[0_0_20px_rgba(0,240,255,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="next-step-1"
                >
                  Continuer
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Date & Time */}
          {step === 2 && (
            <div className="space-y-8 animate-fade-in-up" data-testid="step-2">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-dark-card rounded-xl p-6 md:p-8 border border-white/10">
                  <h2 className="font-orbitron font-bold text-xl text-neon-blue mb-6 flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Choisir une Date
                  </h2>
                  
                  <div className="flex justify-center">
                    <CalendarUI
                      mode="single"
                      selected={formData.date}
                      onSelect={(date) => handleInputChange("date", date)}
                      disabled={(date) => date < today || date > maxDate}
                      locale={fr}
                      className="rounded-lg border border-white/10"
                      data-testid="calendar"
                    />
                  </div>
                </div>

                <div className="bg-dark-card rounded-xl p-6 md:p-8 border border-white/10">
                  <h2 className="font-orbitron font-bold text-xl text-neon-blue mb-6 flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Choisir un Créneau
                  </h2>
                  
                  {!formData.date ? (
                    <div className="text-center py-12 text-gray-400 font-outfit">
                      Sélectionnez d'abord une date
                    </div>
                  ) : slotsLoading ? (
                    <div className="text-center py-12">
                      <Loader2 className="w-8 h-8 text-neon-blue animate-spin mx-auto" />
                      <p className="text-gray-400 mt-4 font-outfit">Chargement...</p>
                    </div>
                  ) : (
                    <>
                      {/* Legend */}
                      <div className="flex flex-wrap gap-4 mb-4 text-sm font-outfit">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded bg-surface-highlight border border-white/20"></div>
                          <span className="text-gray-400">Disponible</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded bg-neon-red/30 border border-neon-red"></div>
                          <span className="text-gray-400">Réservé</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded bg-gray-700 border border-gray-600"></div>
                          <span className="text-gray-400">Passé</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded bg-neon-blue"></div>
                          <span className="text-gray-400">Sélectionné</span>
                        </div>
                      </div>
                      
                      {/* Available count */}
                      <div className="mb-4 p-3 rounded-lg bg-surface-highlight/50">
                        <p className="text-sm font-outfit">
                          <span className="text-green-400 font-semibold">{slots.filter(s => s.available).length}</span>
                          <span className="text-gray-400"> créneaux disponibles</span>
                          {slots.filter(s => !s.available && !s.is_past).length > 0 && (
                            <>
                              <span className="text-gray-500"> • </span>
                              <span className="text-neon-red font-semibold">{slots.filter(s => !s.available && !s.is_past).length}</span>
                              <span className="text-gray-400"> réservés</span>
                            </>
                          )}
                          {slots.filter(s => s.is_past).length > 0 && (
                            <>
                              <span className="text-gray-500"> • </span>
                              <span className="text-gray-500 font-semibold">{slots.filter(s => s.is_past).length}</span>
                              <span className="text-gray-400"> passés</span>
                            </>
                          )}
                        </p>
                      </div>

                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-80 overflow-y-auto" data-testid="time-slots">
                        {slots.map((slot) => (
                          <button
                            key={slot.time}
                            onClick={() => slot.available && handleInputChange("timeSlot", slot.time)}
                            disabled={!slot.available}
                            className={`py-3 px-3 rounded-lg font-rajdhani font-semibold text-sm transition-all relative ${
                              formData.timeSlot === slot.time
                                ? "bg-neon-blue text-black ring-2 ring-neon-blue ring-offset-2 ring-offset-dark-bg"
                                : slot.available
                                ? "bg-surface-highlight text-white hover:bg-neon-blue/20 hover:text-neon-blue border border-white/10"
                                : slot.is_past
                                ? "bg-gray-800/50 text-gray-600 cursor-not-allowed border border-gray-700 line-through"
                                : "bg-neon-red/20 text-neon-red/60 cursor-not-allowed border border-neon-red/30"
                            }`}
                            data-testid={`slot-${slot.time.replace(":", "")}`}
                          >
                            {slot.time}
                            {!slot.available && !slot.is_past && (
                              <span className="absolute -top-1 -right-1 w-3 h-3 bg-neon-red rounded-full"></span>
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex justify-between">
                <Button
                  onClick={() => setStep(1)}
                  variant="outline"
                  className="border-white/20 text-white font-rajdhani font-bold uppercase px-8 py-3 hover:bg-white/10"
                  data-testid="back-step-2"
                >
                  Retour
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  disabled={!canProceedToStep3}
                  className="bg-neon-blue text-black font-rajdhani font-bold uppercase px-8 py-3 hover:shadow-[0_0_20px_rgba(0,240,255,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="next-step-2"
                >
                  Continuer
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Confirmation & Payment */}
          {step === 3 && (
            <div className="space-y-8 animate-fade-in-up" data-testid="step-3">
              <div className="bg-dark-card rounded-xl p-6 md:p-8 border border-white/10">
                <h2 className="font-orbitron font-bold text-xl text-neon-blue mb-6 flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  Récapitulatif
                </h2>
                
                <div className="space-y-4">
                  <div className="flex justify-between py-3 border-b border-white/10">
                    <span className="text-gray-400 font-outfit">Nom</span>
                    <span className="text-white font-outfit font-semibold">{formData.customerName}</span>
                  </div>
                  <div className="flex justify-between py-3 border-b border-white/10">
                    <span className="text-gray-400 font-outfit">Téléphone</span>
                    <span className="text-white font-outfit font-semibold">{formData.customerPhone}</span>
                  </div>
                  <div className="flex justify-between py-3 border-b border-white/10">
                    <span className="text-gray-400 font-outfit">Type de jeu</span>
                    <span className="text-white font-outfit font-semibold">
                      {formData.gameType === "VR_360" ? "VR 360°" : "Simulateur Course"}
                    </span>
                  </div>
                  <div className="flex justify-between py-3 border-b border-white/10">
                    <span className="text-gray-400 font-outfit">Date</span>
                    <span className="text-white font-outfit font-semibold">
                      {formData.date && format(formData.date, "EEEE d MMMM yyyy", { locale: fr })}
                    </span>
                  </div>
                  <div className="flex justify-between py-3 border-b border-white/10">
                    <span className="text-gray-400 font-outfit">Heure</span>
                    <span className="text-white font-outfit font-semibold">{formData.timeSlot}</span>
                  </div>
                  <div className="flex justify-between py-3 border-b border-white/10">
                    <span className="text-gray-400 font-outfit">Joueurs</span>
                    <span className="text-white font-outfit font-semibold">{formData.numberOfPlayers}</span>
                  </div>
                  <div className="flex justify-between py-3 border-b border-white/10">
                    <span className="text-gray-400 font-outfit">Parties par joueur</span>
                    <span className="text-white font-outfit font-semibold">{formData.numberOfGames}</span>
                  </div>
                </div>
              </div>

              <div className="bg-dark-card rounded-xl p-6 md:p-8 border border-neon-blue/30">
                <h2 className="font-orbitron font-bold text-xl text-food-gold mb-6">
                  Détails du Paiement
                </h2>
                
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-outfit">
                      {formData.numberOfPlayers} joueur(s) x {formData.numberOfGames} partie(s) x {formatPrice(calculateTotal().gamePrice)} FCFA
                    </span>
                    <span className="text-white font-rajdhani font-bold">
                      {formatPrice(calculateTotal().gamesPrice)} FCFA
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-outfit">Frais de réservation</span>
                    <span className="text-white font-rajdhani font-bold">
                      {formatPrice(calculateTotal().reservationFee)} FCFA
                    </span>
                  </div>
                  <div className="border-t border-white/10 pt-3 mt-3">
                    <div className="flex justify-between">
                      <span className="text-white font-outfit font-semibold">Total</span>
                      <span className="text-food-gold font-rajdhani font-bold text-2xl">
                        {formatPrice(calculateTotal().total)} FCFA
                      </span>
                    </div>
                  </div>
                </div>

                {/* Payment Options */}
                <div className="mt-6 space-y-4">
                  <h3 className="font-rajdhani font-bold text-white text-lg">Options de paiement</h3>
                  
                  {/* Full Payment Option */}
                  <label className="flex items-start gap-3 p-4 rounded-lg bg-surface-highlight/50 border border-white/10 cursor-pointer hover:border-neon-blue/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.payFullAmount}
                      onChange={(e) => handleInputChange("payFullAmount", e.target.checked)}
                      className="w-5 h-5 mt-0.5 rounded border-white/20 bg-surface-highlight text-neon-blue focus:ring-neon-blue"
                    />
                    <div className="flex-1">
                      <span className="font-outfit text-white font-semibold">Payer le montant total en ligne</span>
                      <p className="text-sm text-gray-400 mt-1">
                        Payez {formatPrice(calculateTotal().total)} FCFA maintenant et profitez directement de votre session sans paiement sur place
                      </p>
                    </div>
                  </label>

                  {/* Wallet Option */}
                  {walletBalance > 0 ? (
                    <label className="flex items-start gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/30 cursor-pointer hover:border-green-500/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.useWallet}
                        onChange={(e) => handleInputChange("useWallet", e.target.checked)}
                        className="w-5 h-5 mt-0.5 rounded border-white/20 bg-surface-highlight text-green-500 focus:ring-green-500"
                      />
                      <div className="flex-1">
                        <span className="font-outfit text-white font-semibold flex items-center gap-2">
                          Utiliser mon porte-monnaie
                          <span className="text-green-400 text-sm">({formatPrice(walletBalance)} FCFA disponible)</span>
                        </span>
                        <p className="text-sm text-gray-400 mt-1">
                          Déduire le montant de votre solde porte-monnaie
                        </p>
                      </div>
                    </label>
                  ) : walletExists ? (
                    <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                      <div className="flex items-start gap-3">
                        <Wallet className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="font-outfit text-yellow-400 font-semibold">
                            Solde porte-monnaie insuffisant
                          </p>
                          <p className="text-sm text-gray-400 mt-1">
                            Votre porte-monnaie est vide. Rechargez-le pour l'utiliser lors de vos prochaines réservations.
                          </p>
                          <a 
                            href="/provision" 
                            className="inline-flex items-center gap-1 text-neon-blue text-sm mt-2 hover:underline"
                          >
                            Recharger mon porte-monnaie →
                          </a>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Summary Box */}
                <div className="mt-6 p-4 rounded-lg bg-neon-blue/10 border border-neon-blue/30">
                  <div className="space-y-2">
                    {formData.useWallet && calculateTotal().walletUsed > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-green-400 font-outfit">Provision utilisée</span>
                        <span className="text-green-400 font-rajdhani font-bold">
                          - {formatPrice(calculateTotal().walletUsed)} FCFA
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-neon-blue font-outfit font-semibold">
                        {calculateTotal().amountToPay > 0 ? "À payer maintenant" : "Rien à payer"}
                      </span>
                      <span className="text-neon-blue font-rajdhani font-bold text-xl">
                        {formatPrice(calculateTotal().amountToPay)} FCFA
                      </span>
                    </div>
                    {!formData.payFullAmount && calculateTotal().amountToPay > 0 && (
                      <p className="text-gray-400 font-outfit text-xs mt-2">
                        Reste à payer sur place: {formatPrice(calculateTotal().total - calculateTotal().amountToPay - calculateTotal().walletUsed)} FCFA
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-between">
                <Button
                  onClick={() => setStep(2)}
                  variant="outline"
                  className="border-white/20 text-white font-rajdhani font-bold uppercase px-8 py-3 hover:bg-white/10"
                  data-testid="back-step-3"
                >
                  Retour
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="bg-food-gold text-black font-rajdhani font-bold uppercase px-8 py-3 hover:shadow-[0_0_20px_rgba(255,191,0,0.5)] disabled:opacity-50"
                  data-testid="submit-booking"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Paiement en cours...
                    </>
                  ) : (
                    <>
                      <Smartphone className="w-5 h-5 mr-2" />
                      Payer 500 FCFA
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default BookingPage;
