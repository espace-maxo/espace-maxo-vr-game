import { useState, useEffect } from "react";
import { 
  UtensilsCrossed, Calendar, Clock, Users, Phone, User, 
  CreditCard, Wallet, PartyPopper, MessageSquare, CheckCircle,
  Loader2, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import axios from "axios";
import { format, addDays, startOfToday } from "date-fns";
import { fr } from "date-fns/locale";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const depositOptions = [
  { value: 5000, label: "5 000 FCFA" },
  { value: 10000, label: "10 000 FCFA" },
  { value: 15000, label: "15 000 FCFA" },
  { value: 20000, label: "20 000 FCFA" },
  { value: 25000, label: "25 000 FCFA" }
];

const occasionOptions = [
  { value: "aucune", label: "Aucune occasion particulière" },
  { value: "anniversaire", label: "Anniversaire" },
  { value: "fiancailles", label: "Fiançailles" },
  { value: "mariage", label: "Célébration de mariage" },
  { value: "affaires", label: "Repas d'affaires" },
  { value: "famille", label: "Réunion de famille" },
  { value: "autre", label: "Autre" }
];

const timeSlots = [
  "12:00", "12:30", "13:00", "13:30", "14:00", 
  "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"
];

const TableReservationPage = () => {
  const [formData, setFormData] = useState({
    customer_name: "",
    customer_phone: "",
    reservation_date: "",
    reservation_time: "",
    number_of_guests: 2,
    special_occasion: "aucune",
    notes: "",
    deposit_amount: 5000
  });
  
  const [walletBalance, setWalletBalance] = useState(0);
  const [useWallet, setUseWallet] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [paymentConfig, setPaymentConfig] = useState(null);

  // Generate available dates (next 30 days)
  const availableDates = Array.from({ length: 30 }, (_, i) => {
    const date = addDays(startOfToday(), i + 1);
    return {
      value: format(date, "yyyy-MM-dd"),
      label: format(date, "EEEE d MMMM", { locale: fr })
    };
  });

  // Fetch payment config
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

  // Fetch wallet balance when phone changes
  useEffect(() => {
    const fetchWalletBalance = async () => {
      if (formData.customer_phone && formData.customer_phone.length >= 8) {
        try {
          const response = await axios.get(`${API}/wallet/${formData.customer_phone}`);
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
  }, [formData.customer_phone]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const walletAmountToUse = useWallet ? Math.min(walletBalance, formData.deposit_amount) : 0;
  const amountToPay = formData.deposit_amount - walletAmountToUse;

  const handleWalletOnlyPayment = async () => {
    setLoading(true);
    try {
      // Deduct from wallet
      await axios.post(`${API}/wallet/use`, {
        phone: formData.customer_phone,
        amount: walletAmountToUse,
        description: `Acompte réservation table Espace Maxo`
      });

      // Create reservation
      await axios.post(`${API}/table-reservations`, {
        ...formData,
        payment_transaction_id: "wallet_payment",
        wallet_amount_used: walletAmountToUse
      });

      setSuccess(true);
      setWalletBalance(prev => prev - walletAmountToUse);
      toast.success("Réservation confirmée !");
    } catch (error) {
      console.error("Error:", error);
      toast.error(error.response?.data?.detail || "Erreur lors de la réservation");
    } finally {
      setLoading(false);
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
      phone: formData.customer_phone.replace(/\s/g, ''),
      name: formData.customer_name,
      description: `Acompte table Espace Maxo - ${formData.deposit_amount} FCFA`
    });

    window.addSuccessListener(async (response) => {
      toast.success("Paiement réussi!");
      setLoading(true);
      
      try {
        // Deduct wallet amount if used
        if (useWallet && walletAmountToUse > 0) {
          await axios.post(`${API}/wallet/use`, {
            phone: formData.customer_phone,
            amount: walletAmountToUse,
            description: `Acompte réservation table (complément)`
          });
          setWalletBalance(prev => prev - walletAmountToUse);
        }

        // Create reservation
        await axios.post(`${API}/table-reservations`, {
          ...formData,
          payment_transaction_id: response.transactionId,
          wallet_amount_used: walletAmountToUse
        });

        setSuccess(true);
      } catch (error) {
        console.error("Error:", error);
        toast.error("Erreur lors de l'enregistrement. Contactez-nous.");
      } finally {
        setLoading(false);
      }
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.customer_name || !formData.customer_phone || !formData.reservation_date || !formData.reservation_time) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }

    if (useWallet && amountToPay === 0) {
      handleWalletOnlyPayment();
    } else {
      initiatePayment();
    }
  };

  if (success) {
    return (
      <div className="min-h-screen pt-20 bg-dark-bg" data-testid="table-reservation-page">
        <div className="max-w-2xl mx-auto px-4 py-16">
          <Card className="bg-dark-card border-green-500/30">
            <CardContent className="p-8 text-center">
              <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-6" />
              <h2 className="font-orbitron text-2xl text-white mb-4">
                Table Réservée !
              </h2>
              <p className="text-gray-300 mb-4">
                Votre réservation pour le <span className="text-food-gold font-semibold">
                {availableDates.find(d => d.value === formData.reservation_date)?.label}
                </span> à <span className="text-food-gold font-semibold">{formData.reservation_time}</span> est confirmée.
              </p>
              <div className="bg-neon-blue/10 border border-neon-blue/30 rounded-lg p-4 mb-6">
                <p className="text-neon-blue font-semibold">
                  Acompte versé : {formData.deposit_amount.toLocaleString()} FCFA
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  Ce montant sera déduit de votre addition finale
                </p>
              </div>
              <Button
                onClick={() => {
                  setSuccess(false);
                  setFormData({
                    customer_name: "",
                    customer_phone: "",
                    reservation_date: "",
                    reservation_time: "",
                    number_of_guests: 2,
                    special_occasion: "",
                    notes: "",
                    deposit_amount: 5000
                  });
                  setUseWallet(false);
                }}
                className="bg-neon-blue hover:bg-neon-blue/80"
              >
                Nouvelle réservation
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 bg-dark-bg" data-testid="table-reservation-page">
      {/* Hero */}
      <section className="py-12 px-4 bg-gradient-to-br from-food-gold/20 via-dark-bg to-food-orange/10">
        <div className="max-w-4xl mx-auto text-center">
          <UtensilsCrossed className="w-16 h-16 text-food-gold mx-auto mb-4" />
          <h1 className="font-orbitron font-black text-3xl sm:text-4xl lg:text-5xl uppercase tracking-tight mb-4">
            <span className="text-white">Réserver une</span>{" "}
            <span className="text-food-gold">Table</span>
          </h1>
          <p className="text-gray-300 font-outfit text-lg max-w-2xl mx-auto">
            Réservez votre table et profitez d'un moment unique chez Espace Maxo
          </p>
        </div>
      </section>

      {/* Info Banner */}
      <section className="py-4 px-4 bg-neon-blue/10 border-y border-neon-blue/30">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-neon-blue flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-neon-blue font-semibold">Acompte déductible</p>
              <p className="text-gray-300 text-sm">
                L'acompte que vous versez sera <strong>entièrement déduit de votre addition finale</strong>. 
                Ce n'est pas un frais de réservation mais une avance sur votre consommation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <Card className="bg-dark-card border-white/10">
            <CardHeader>
              <CardTitle className="font-orbitron text-xl text-white flex items-center gap-2">
                <Calendar className="w-6 h-6 text-food-gold" />
                Informations de réservation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Name & Phone */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-300 flex items-center gap-2">
                      <User className="w-4 h-4 text-food-gold" />
                      Nom complet *
                    </Label>
                    <Input
                      value={formData.customer_name}
                      onChange={(e) => handleInputChange("customer_name", e.target.value)}
                      placeholder="Votre nom"
                      className="bg-surface-highlight border-white/20 text-white"
                      required
                      data-testid="input-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-300 flex items-center gap-2">
                      <Phone className="w-4 h-4 text-food-gold" />
                      Téléphone *
                    </Label>
                    <Input
                      value={formData.customer_phone}
                      onChange={(e) => handleInputChange("customer_phone", e.target.value)}
                      placeholder="97 XX XX XX"
                      className="bg-surface-highlight border-white/20 text-white"
                      required
                      data-testid="input-phone"
                    />
                  </div>
                </div>

                {/* Date & Time */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-300 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-food-gold" />
                      Date *
                    </Label>
                    <Select
                      value={formData.reservation_date}
                      onValueChange={(value) => handleInputChange("reservation_date", value)}
                    >
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
                      Heure *
                    </Label>
                    <Select
                      value={formData.reservation_time}
                      onValueChange={(value) => handleInputChange("reservation_time", value)}
                    >
                      <SelectTrigger className="bg-surface-highlight border-white/20 text-white" data-testid="select-time">
                        <SelectValue placeholder="Choisir une heure" />
                      </SelectTrigger>
                      <SelectContent className="bg-dark-card border-white/20">
                        {timeSlots.map((time) => (
                          <SelectItem key={time} value={time} className="text-white">
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Guests & Occasion */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-300 flex items-center gap-2">
                      <Users className="w-4 h-4 text-food-gold" />
                      Nombre de personnes *
                    </Label>
                    <Select
                      value={formData.number_of_guests.toString()}
                      onValueChange={(value) => handleInputChange("number_of_guests", parseInt(value))}
                    >
                      <SelectTrigger className="bg-surface-highlight border-white/20 text-white" data-testid="select-guests">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-dark-card border-white/20">
                        {[1,2,3,4,5,6,7,8,9,10,12,15,20].map((num) => (
                          <SelectItem key={num} value={num.toString()} className="text-white">
                            {num} personne{num > 1 ? "s" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-300 flex items-center gap-2">
                      <PartyPopper className="w-4 h-4 text-food-gold" />
                      Occasion spéciale
                    </Label>
                    <Select
                      value={formData.special_occasion}
                      onValueChange={(value) => handleInputChange("special_occasion", value)}
                    >
                      <SelectTrigger className="bg-surface-highlight border-white/20 text-white" data-testid="select-occasion">
                        <SelectValue placeholder="Aucune" />
                      </SelectTrigger>
                      <SelectContent className="bg-dark-card border-white/20">
                        {occasionOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value} className="text-white">
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label className="text-gray-300 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-food-gold" />
                    Notes (optionnel)
                  </Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => handleInputChange("notes", e.target.value)}
                    placeholder="Demandes spéciales, allergies, etc."
                    className="bg-surface-highlight border-white/20 text-white min-h-[80px]"
                    data-testid="input-notes"
                  />
                </div>

                {/* Deposit Amount */}
                <div className="space-y-3">
                  <Label className="text-gray-300 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-food-gold" />
                    Montant de l'acompte *
                  </Label>
                  <RadioGroup
                    value={formData.deposit_amount.toString()}
                    onValueChange={(value) => handleInputChange("deposit_amount", parseInt(value))}
                    className="grid grid-cols-2 md:grid-cols-5 gap-3"
                  >
                    {depositOptions.map((option) => (
                      <div key={option.value}>
                        <RadioGroupItem
                          value={option.value.toString()}
                          id={`deposit-${option.value}`}
                          className="peer sr-only"
                        />
                        <Label
                          htmlFor={`deposit-${option.value}`}
                          className="flex items-center justify-center p-3 rounded-lg border-2 border-white/20 bg-surface-highlight cursor-pointer transition-all peer-data-[state=checked]:border-food-gold peer-data-[state=checked]:bg-food-gold/10 hover:border-food-gold/50"
                        >
                          <span className="text-white font-semibold text-sm">{option.label}</span>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                {/* Wallet Option */}
                {formData.customer_phone && formData.customer_phone.length >= 8 && (
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
                              <span className="text-neon-blue text-sm">({walletBalance.toLocaleString()} FCFA disponible)</span>
                            </span>
                            {useWallet && walletAmountToUse > 0 && (
                              <p className="text-sm text-neon-blue mt-1">
                                -{walletAmountToUse.toLocaleString()} FCFA sera déduit
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
                              Recharger mon porte-monnaie →
                            </a>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Summary */}
                <div className="bg-food-gold/10 border border-food-gold/30 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-300">Acompte</span>
                    <span className="text-white">{formData.deposit_amount.toLocaleString()} FCFA</span>
                  </div>
                  {useWallet && walletAmountToUse > 0 && (
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-gray-300">Porte-monnaie</span>
                      <span className="text-neon-blue">-{walletAmountToUse.toLocaleString()} FCFA</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-2 border-t border-food-gold/30">
                    <span className="text-white font-semibold">À payer</span>
                    <span className="font-rajdhani font-bold text-food-gold text-xl">
                      {amountToPay.toLocaleString()} FCFA
                    </span>
                  </div>
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  disabled={loading || !formData.customer_name || !formData.customer_phone || !formData.reservation_date || !formData.reservation_time}
                  className="w-full bg-food-gold hover:bg-food-gold/80 text-black font-rajdhani font-bold uppercase py-6 text-lg"
                  data-testid="submit-reservation-btn"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Traitement...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5 mr-2" />
                      Réserver et payer {amountToPay.toLocaleString()} FCFA
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default TableReservationPage;
