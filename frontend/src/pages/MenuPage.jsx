import { useState, useEffect } from "react";
import axios from "axios";
import { 
  UtensilsCrossed, Star, Users, ShoppingCart, Minus, Plus, 
  Gamepad2, Calendar, Clock, Phone, User, CreditCard, Wallet,
  CheckCircle, Loader2, X, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { format, addDays, startOfToday } from "date-fns";
import { fr } from "date-fns/locale";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MenuPage = () => {
  const [combos, setCombos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState(1); // 1: cart, 2: game selection, 3: payment
  const [success, setSuccess] = useState(false);
  const [processing, setProcessing] = useState(false);
  
  // Game booking data
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [availableSlots, setAvailableSlots] = useState([]);
  const [gameType, setGameType] = useState("VR_360");
  const [numberOfPlayers, setNumberOfPlayers] = useState(1);
  const [numberOfGames, setNumberOfGames] = useState(1);
  
  // Customer data
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  
  // Wallet
  const [walletBalance, setWalletBalance] = useState(0);
  const [useWallet, setUseWallet] = useState(false);
  
  // Payment config
  const [paymentConfig, setPaymentConfig] = useState(null);

  // Generate available dates (next 30 days)
  const availableDates = Array.from({ length: 30 }, (_, i) => {
    const date = addDays(startOfToday(), i + 1);
    return {
      value: format(date, "yyyy-MM-dd"),
      label: format(date, "EEEE d MMMM", { locale: fr })
    };
  });

  useEffect(() => {
    fetchCombos();
    fetchPaymentConfig();
  }, []);

  // Fetch available slots when date changes
  useEffect(() => {
    if (selectedDate) {
      fetchSlots(selectedDate);
    }
  }, [selectedDate]);

  // Fetch wallet balance when phone changes
  useEffect(() => {
    const fetchWalletBalance = async () => {
      if (customerPhone && customerPhone.length >= 8) {
        try {
          const response = await axios.get(`${API}/wallet/${customerPhone}`);
          setWalletBalance(response.data.balance || 0);
        } catch (error) {
          setWalletBalance(0);
        }
      } else {
        setWalletBalance(0);
        setUseWallet(false);
      }
    };
    
    const timeoutId = setTimeout(fetchWalletBalance, 500);
    return () => clearTimeout(timeoutId);
  }, [customerPhone]);

  const fetchCombos = async () => {
    try {
      const response = await axios.get(`${API}/menu`);
      // Filter only combos
      const combosOnly = response.data.filter(item => item.is_combo === true);
      setCombos(combosOnly);
    } catch (error) {
      console.error("Error fetching combos:", error);
      toast.error("Erreur lors du chargement des combos");
    } finally {
      setLoading(false);
    }
  };

  const fetchPaymentConfig = async () => {
    try {
      const response = await axios.get(`${API}/payment/config`);
      setPaymentConfig(response.data);
    } catch (error) {
      console.error("Error fetching payment config:", error);
    }
  };

  const fetchSlots = async (date) => {
    try {
      const response = await axios.get(`${API}/slots/${date}`);
      setAvailableSlots(response.data.slots || []);
    } catch (error) {
      console.error("Error fetching slots:", error);
    }
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('fr-FR').format(price);
  };

  // Cart functions
  const addToCart = (combo) => {
    const existingItem = cart.find(item => item.id === combo.id);
    if (existingItem) {
      setCart(cart.map(item => 
        item.id === combo.id 
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, { ...combo, quantity: 1 }]);
    }
    toast.success(`${combo.name} ajouté au panier`);
  };

  const removeFromCart = (comboId) => {
    setCart(cart.filter(item => item.id !== comboId));
  };

  const updateQuantity = (comboId, delta) => {
    setCart(cart.map(item => {
      if (item.id === comboId) {
        const newQuantity = item.quantity + delta;
        if (newQuantity <= 0) return null;
        return { ...item, quantity: newQuantity };
      }
      return item;
    }).filter(Boolean));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  // Game price calculation
  const gamePrice = gameType === "RACING_SIMULATOR" ? 1500 : 2000;
  const gameTotal = gamePrice * numberOfPlayers * numberOfGames;
  
  const grandTotal = cartTotal + gameTotal;
  
  // Wallet calculation
  const walletAmountToUse = useWallet ? Math.min(walletBalance, grandTotal) : 0;
  const amountToPay = grandTotal - walletAmountToUse;

  const handleWalletOnlyPayment = async () => {
    setProcessing(true);
    try {
      // Deduct from wallet
      await axios.post(`${API}/wallet/use`, {
        phone: customerPhone,
        amount: walletAmountToUse,
        service_type: "combo",
        description: `Combo + Jeu Espace Maxo`
      });

      // Create combo order
      const orderData = {
        customer_name: customerName,
        customer_phone: customerPhone,
        items: cart.map(item => ({
          name: item.name,
          price: item.price,
          quantity: item.quantity
        })),
        game_type: gameType,
        number_of_players: numberOfPlayers,
        number_of_games: numberOfGames,
        booking_date: selectedDate,
        time_slot: selectedTime,
        payment_transaction_id: "wallet_payment",
        wallet_amount_used: walletAmountToUse
      };

      await axios.post(`${API}/combo-orders`, orderData);

      setSuccess(true);
      setCart([]);
      toast.success("Commande confirmée !");
    } catch (error) {
      console.error("Error:", error);
      toast.error(error.response?.data?.detail || "Erreur lors de la commande");
    } finally {
      setProcessing(false);
    }
  };

  const initiatePayment = () => {
    if (!paymentConfig || !window.openKkiapayWidget) {
      toast.error("Service de paiement non disponible");
      return;
    }

    window.openKkiapayWidget({
      amount: amountToPay,
      position: "center",
      theme: "#FF6B00",
      key: paymentConfig.public_key,
      sandbox: paymentConfig.sandbox,
      phone: customerPhone.replace(/\s/g, ''),
      name: customerName,
      description: `Combo + Jeu Espace Maxo - ${grandTotal} FCFA`
    });

    window.addSuccessListener(async (response) => {
      toast.success("Paiement réussi!");
      setProcessing(true);
      
      try {
        // Deduct wallet amount if used
        if (useWallet && walletAmountToUse > 0) {
          await axios.post(`${API}/wallet/use`, {
            phone: customerPhone,
            amount: walletAmountToUse,
            service_type: "combo",
            description: `Combo + Jeu (complément)`
          });
        }

        // Create combo order
        const orderData = {
          customer_name: customerName,
          customer_phone: customerPhone,
          items: cart.map(item => ({
            name: item.name,
            price: item.price,
            quantity: item.quantity
          })),
          game_type: gameType,
          number_of_players: numberOfPlayers,
          number_of_games: numberOfGames,
          booking_date: selectedDate,
          time_slot: selectedTime,
          payment_transaction_id: response.transactionId,
          wallet_amount_used: walletAmountToUse
        };

        await axios.post(`${API}/combo-orders`, orderData);

        setSuccess(true);
        setCart([]);
      } catch (error) {
        console.error("Error:", error);
        toast.error("Erreur lors de l'enregistrement. Contactez-nous.");
      } finally {
        setProcessing(false);
      }
    });
  };

  const handleCheckout = () => {
    if (!customerName || !customerPhone) {
      toast.error("Veuillez remplir votre nom et téléphone");
      return;
    }
    if (!selectedDate || !selectedTime) {
      toast.error("Veuillez sélectionner une date et un créneau horaire");
      return;
    }

    if (useWallet && amountToPay === 0) {
      handleWalletOnlyPayment();
    } else {
      initiatePayment();
    }
  };

  const resetOrder = () => {
    setSuccess(false);
    setShowCheckout(false);
    setCheckoutStep(1);
    setCart([]);
    setSelectedDate("");
    setSelectedTime("");
    setCustomerName("");
    setCustomerPhone("");
    setUseWallet(false);
  };

  // Success screen
  if (success) {
    return (
      <div className="min-h-screen pt-20 bg-dark-bg" data-testid="combo-success">
        <div className="max-w-2xl mx-auto px-4 py-16">
          <Card className="bg-dark-card border-green-500/30">
            <CardContent className="p-8 text-center">
              <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-6" />
              <h2 className="font-orbitron text-2xl text-white mb-4">
                Commande Confirmée !
              </h2>
              <p className="text-gray-300 mb-4">
                Votre commande combo + session de jeu est réservée pour le{" "}
                <span className="text-food-gold font-semibold">
                  {availableDates.find(d => d.value === selectedDate)?.label}
                </span>{" "}
                à <span className="text-food-gold font-semibold">{selectedTime}</span>
              </p>
              <div className="bg-neon-blue/10 border border-neon-blue/30 rounded-lg p-4 mb-6">
                <p className="text-neon-blue font-semibold">
                  Total payé : {formatPrice(grandTotal)} FCFA
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  Vos combos vous attendent sur place !
                </p>
              </div>
              <Button
                onClick={resetOrder}
                className="bg-neon-blue hover:bg-neon-blue/80"
              >
                Nouvelle commande
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 bg-dark-bg" data-testid="menu-page">
      {/* Hero */}
      <section className="py-16 px-4 bg-gradient-radial-blue" data-testid="menu-hero">
        <div className="max-w-7xl mx-auto text-center">
          <UtensilsCrossed className="w-12 h-12 text-food-gold mx-auto mb-4" />
          <h1 className="font-orbitron font-black text-4xl sm:text-5xl lg:text-6xl uppercase tracking-tight mb-4">
            <span className="text-white">Nos</span>{" "}
            <span className="text-food-gold">Combos</span>
          </h1>
          <p className="font-outfit text-lg text-gray-300 max-w-2xl mx-auto">
            Commandez vos combos et réservez votre session de jeu en un seul clic !
          </p>
          <p className="font-outfit text-base text-food-gold mt-4 italic">
            Consommation sur place uniquement
          </p>
        </div>
      </section>

      {/* Floating Cart Button */}
      {cart.length > 0 && !showCheckout && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50">
          <Button
            onClick={() => setShowCheckout(true)}
            className="bg-food-gold hover:bg-food-gold/90 text-black font-rajdhani font-bold text-lg px-8 py-7 rounded-full shadow-[0_0_30px_rgba(255,191,0,0.6)] hover:shadow-[0_0_40px_rgba(255,191,0,0.8)] transition-all border-2 border-food-gold"
            data-testid="open-cart-btn"
          >
            <ShoppingCart className="w-6 h-6 mr-3" />
            <span className="font-bold">{cart.length} article{cart.length > 1 ? 's' : ''}</span>
            <span className="mx-2">•</span>
            <span className="font-bold">{formatPrice(cartTotal)} FCFA</span>
          </Button>
        </div>
      )}

      {/* Checkout Modal */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-dark-card border border-white/10 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-dark-card border-b border-white/10 p-4 flex justify-between items-center">
              <h3 className="font-orbitron text-xl text-white flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-food-gold" />
                {checkoutStep === 1 ? "Votre Panier" : checkoutStep === 2 ? "Session de Jeu" : "Paiement"}
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowCheckout(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="p-6">
              {/* Step 1: Cart Review */}
              {checkoutStep === 1 && (
                <div className="space-y-4">
                  {cart.map(item => (
                    <div key={item.id} className="flex items-center gap-4 bg-surface-highlight rounded-lg p-4">
                      <img src={item.image_url} alt={item.name} className="w-16 h-16 object-cover rounded-lg" />
                      <div className="flex-1">
                        <h4 className="text-white font-semibold">{item.name}</h4>
                        <p className="text-food-gold">{formatPrice(item.price)} FCFA</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => updateQuantity(item.id, -1)}
                          className="w-8 h-8 border-white/20"
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <span className="text-white w-8 text-center">{item.quantity}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => updateQuantity(item.id, 1)}
                          className="w-8 h-8 border-white/20"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  <div className="border-t border-white/10 pt-4">
                    <div className="flex justify-between text-lg">
                      <span className="text-gray-300">Sous-total Combos</span>
                      <span className="text-food-gold font-bold">{formatPrice(cartTotal)} FCFA</span>
                    </div>
                  </div>

                  <Button
                    onClick={() => setCheckoutStep(2)}
                    className="w-full bg-food-gold hover:bg-food-gold/80 text-black font-rajdhani font-bold py-6"
                    data-testid="continue-to-game-btn"
                  >
                    Continuer - Choisir ma session de jeu
                  </Button>
                </div>
              )}

              {/* Step 2: Game Selection */}
              {checkoutStep === 2 && (
                <div className="space-y-6">
                  <div className="bg-neon-blue/10 border border-neon-blue/30 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Gamepad2 className="w-6 h-6 text-neon-blue flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-neon-blue font-semibold">Session de jeu incluse</p>
                        <p className="text-gray-300 text-sm">
                          Chaque combo inclut une session de jeu VR. Choisissez votre créneau !
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Game Type */}
                  <div className="space-y-3">
                    <Label className="text-gray-300">Type de jeu</Label>
                    <RadioGroup
                      value={gameType}
                      onValueChange={setGameType}
                      className="grid grid-cols-2 gap-3"
                    >
                      <div>
                        <RadioGroupItem value="VR_360" id="vr" className="peer sr-only" />
                        <Label
                          htmlFor="vr"
                          className="flex flex-col items-center p-4 rounded-lg border-2 border-white/20 bg-surface-highlight cursor-pointer transition-all peer-data-[state=checked]:border-neon-blue peer-data-[state=checked]:bg-neon-blue/10"
                        >
                          <span className="text-white font-semibold">VR 360°</span>
                          <span className="text-neon-blue text-sm">2 000 FCFA/partie</span>
                        </Label>
                      </div>
                      <div>
                        <RadioGroupItem value="RACING_SIMULATOR" id="racing" className="peer sr-only" />
                        <Label
                          htmlFor="racing"
                          className="flex flex-col items-center p-4 rounded-lg border-2 border-white/20 bg-surface-highlight cursor-pointer transition-all peer-data-[state=checked]:border-neon-blue peer-data-[state=checked]:bg-neon-blue/10"
                        >
                          <span className="text-white font-semibold">Simulateur</span>
                          <span className="text-neon-blue text-sm">1 500 FCFA/partie</span>
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Players & Games */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-gray-300">Nombre de joueurs</Label>
                      <Select value={numberOfPlayers.toString()} onValueChange={(v) => setNumberOfPlayers(parseInt(v))}>
                        <SelectTrigger className="bg-surface-highlight border-white/20 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-dark-card border-white/20">
                          {[1,2,3,4].map(n => (
                            <SelectItem key={n} value={n.toString()} className="text-white">{n} joueur{n > 1 ? 's' : ''}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-gray-300">Nombre de parties</Label>
                      <Select value={numberOfGames.toString()} onValueChange={(v) => setNumberOfGames(parseInt(v))}>
                        <SelectTrigger className="bg-surface-highlight border-white/20 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-dark-card border-white/20">
                          {[1,2,3,4,5].map(n => (
                            <SelectItem key={n} value={n.toString()} className="text-white">{n} partie{n > 1 ? 's' : ''}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Date & Time */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-gray-300 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-food-gold" />
                        Date
                      </Label>
                      <Select value={selectedDate} onValueChange={setSelectedDate}>
                        <SelectTrigger className="bg-surface-highlight border-white/20 text-white" data-testid="select-date">
                          <SelectValue placeholder="Choisir une date" />
                        </SelectTrigger>
                        <SelectContent className="bg-dark-card border-white/20 max-h-60">
                          {availableDates.map((date) => (
                            <SelectItem key={date.value} value={date.value} className="text-white capitalize">
                              {date.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-gray-300 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-food-gold" />
                        Créneau
                      </Label>
                      <Select value={selectedTime} onValueChange={setSelectedTime} disabled={!selectedDate}>
                        <SelectTrigger className="bg-surface-highlight border-white/20 text-white" data-testid="select-time">
                          <SelectValue placeholder={selectedDate ? "Choisir" : "Sélectionnez une date"} />
                        </SelectTrigger>
                        <SelectContent className="bg-dark-card border-white/20 max-h-60">
                          {availableSlots.filter(s => s.available).map((slot) => (
                            <SelectItem key={slot.time} value={slot.time} className="text-white">
                              {slot.time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Price Summary */}
                  <div className="bg-surface-highlight rounded-lg p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-300">Combos</span>
                      <span className="text-white">{formatPrice(cartTotal)} FCFA</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">Jeux ({numberOfPlayers}x{numberOfGames})</span>
                      <span className="text-white">{formatPrice(gameTotal)} FCFA</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-white/10">
                      <span className="text-white font-semibold">Total</span>
                      <span className="text-food-gold font-bold text-xl">{formatPrice(grandTotal)} FCFA</span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setCheckoutStep(1)}
                      className="flex-1 border-white/20"
                    >
                      Retour
                    </Button>
                    <Button
                      onClick={() => setCheckoutStep(3)}
                      disabled={!selectedDate || !selectedTime}
                      className="flex-1 bg-food-gold hover:bg-food-gold/80 text-black font-rajdhani font-bold"
                      data-testid="continue-to-payment-btn"
                    >
                      Continuer
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 3: Payment */}
              {checkoutStep === 3 && (
                <div className="space-y-6">
                  {/* Customer Info */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-gray-300 flex items-center gap-2">
                        <User className="w-4 h-4 text-food-gold" />
                        Nom complet *
                      </Label>
                      <Input
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Votre nom"
                        className="bg-surface-highlight border-white/20 text-white"
                        data-testid="input-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-gray-300 flex items-center gap-2">
                        <Phone className="w-4 h-4 text-food-gold" />
                        Téléphone *
                      </Label>
                      <Input
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="97 XX XX XX"
                        className="bg-surface-highlight border-white/20 text-white"
                        data-testid="input-phone"
                      />
                    </div>
                  </div>

                  {/* Wallet Option */}
                  {customerPhone && customerPhone.length >= 8 && (
                    <div className="space-y-3">
                      {walletBalance > 0 ? (
                        <div className="p-4 rounded-lg bg-neon-blue/10 border border-neon-blue/30">
                          <label className="flex items-start gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={useWallet}
                              onChange={(e) => setUseWallet(e.target.checked)}
                              className="w-5 h-5 mt-0.5 rounded border-white/20 bg-surface-highlight text-neon-blue focus:ring-neon-blue"
                            />
                            <div className="flex-1">
                              <span className="font-outfit text-white font-semibold flex items-center gap-2">
                                <Wallet className="w-4 h-4 text-neon-blue" />
                                Utiliser mon porte-monnaie
                                <span className="text-neon-blue text-sm">({formatPrice(walletBalance)} FCFA disponible)</span>
                              </span>
                              {useWallet && walletAmountToUse > 0 && (
                                <p className="text-sm text-neon-blue mt-1">
                                  -{formatPrice(walletAmountToUse)} FCFA sera déduit
                                </p>
                              )}
                            </div>
                          </label>
                        </div>
                      ) : (
                        <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                          <div className="flex items-start gap-3">
                            <Wallet className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="font-outfit text-yellow-400 font-semibold">
                                Porte-monnaie non disponible
                              </p>
                              <p className="text-sm text-gray-400 mt-1">
                                Rechargez votre porte-monnaie pour l'utiliser.
                              </p>
                              <a href="/provision" className="inline-flex items-center gap-1 text-neon-blue text-sm mt-2 hover:underline">
                                Recharger mon porte-monnaie
                              </a>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Order Summary */}
                  <div className="bg-food-gold/10 border border-food-gold/30 rounded-lg p-4 space-y-2">
                    <h4 className="text-white font-semibold mb-3">Récapitulatif</h4>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-300">Combos ({cart.length} article{cart.length > 1 ? 's' : ''})</span>
                      <span className="text-white">{formatPrice(cartTotal)} FCFA</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-300">Session jeu ({gameType === "VR_360" ? "VR" : "Simulateur"})</span>
                      <span className="text-white">{formatPrice(gameTotal)} FCFA</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-300">Date</span>
                      <span className="text-white">{availableDates.find(d => d.value === selectedDate)?.label}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-300">Heure</span>
                      <span className="text-white">{selectedTime}</span>
                    </div>
                    {useWallet && walletAmountToUse > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-300">Porte-monnaie</span>
                        <span className="text-neon-blue">-{formatPrice(walletAmountToUse)} FCFA</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-3 border-t border-food-gold/30">
                      <span className="text-white font-semibold">À payer</span>
                      <span className="font-rajdhani font-bold text-food-gold text-xl">
                        {formatPrice(amountToPay)} FCFA
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setCheckoutStep(2)}
                      className="flex-1 border-white/20"
                    >
                      Retour
                    </Button>
                    <Button
                      onClick={handleCheckout}
                      disabled={processing || !customerName || !customerPhone}
                      className="flex-1 bg-food-gold hover:bg-food-gold/80 text-black font-rajdhani font-bold py-6"
                      data-testid="pay-btn"
                    >
                      {processing ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin mr-2" />
                          Traitement...
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-5 h-5 mr-2" />
                          Payer {formatPrice(amountToPay)} FCFA
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Combos Grid */}
      <section className="py-12 px-4" data-testid="menu-items">
        <div className="max-w-7xl mx-auto">
          {loading ? (
            <div className="text-center py-20">
              <div className="w-12 h-12 border-4 border-neon-blue border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-gray-400 mt-4 font-outfit">Chargement des combos...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {combos.map((combo, index) => (
                <div
                  key={combo.id}
                  className="group bg-dark-card border border-food-gold/50 hover:border-food-gold rounded-lg overflow-hidden transition-all duration-300 hover-scale animate-fade-in-up shadow-[0_0_15px_rgba(255,191,0,0.1)]"
                  style={{ animationDelay: `${index * 100}ms` }}
                  data-testid={`combo-item-${combo.id}`}
                >
                  {/* Image */}
                  <div className="relative aspect-square overflow-hidden">
                    <img
                      src={combo.image_url}
                      alt={combo.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-dark-bg via-transparent to-transparent"></div>
                    
                    {/* Badges */}
                    <div className="absolute top-4 right-4 flex flex-col gap-2">
                      <Badge className="bg-food-gold text-black font-rajdhani font-bold uppercase flex items-center gap-1">
                        <Star className="w-3 h-3" />
                        COMBO
                      </Badge>
                      {combo.persons && (
                        <Badge className="bg-neon-purple text-white font-rajdhani flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {combo.persons} pers.
                        </Badge>
                      )}
                    </div>

                    {/* Promo Badge */}
                    {combo.original_price && (
                      <div className="absolute top-4 left-4">
                        <Badge className="bg-neon-red text-white font-rajdhani font-bold animate-pulse">
                          PROMO
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-6">
                    <h3 className="font-orbitron font-bold text-xl mb-2 text-food-gold group-hover:text-food-gold transition-colors">
                      {combo.name}
                    </h3>
                    <p className="text-gray-400 font-outfit text-sm mb-4 line-clamp-3">
                      {combo.description}
                    </p>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="font-rajdhani font-bold text-2xl text-food-gold">
                          {formatPrice(combo.price)}
                        </span>
                        <span className="text-sm text-gray-400">FCFA</span>
                        {combo.original_price && (
                          <span className="text-gray-500 line-through text-sm font-rajdhani">
                            {formatPrice(combo.original_price)}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="mb-4 pt-3 border-t border-white/10">
                      <span className="text-xs text-neon-blue font-outfit flex items-center gap-1">
                        <Gamepad2 className="w-3 h-3" />
                        Jeux VR inclus dans ce combo!
                      </span>
                    </div>

                    <Button
                      onClick={() => addToCart(combo)}
                      disabled={!combo.is_available}
                      className="w-full bg-food-gold hover:bg-food-gold/80 text-black font-rajdhani font-bold"
                      data-testid={`add-to-cart-${combo.id}`}
                    >
                      {combo.is_available ? (
                        <>
                          <ShoppingCart className="w-4 h-4 mr-2" />
                          Ajouter au panier
                        </>
                      ) : (
                        "Indisponible"
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && combos.length === 0 && (
            <div className="text-center py-20">
              <p className="text-gray-400 font-outfit text-lg">
                Aucun combo disponible pour le moment.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default MenuPage;
