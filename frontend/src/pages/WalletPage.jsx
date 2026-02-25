import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Wallet, Phone, User, Plus, History, CreditCard, Loader2, ArrowDownLeft, ArrowUpRight, Smartphone, KeyRound, ShieldCheck, Gift, Star, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const WalletPage = () => {
  const [step, setStep] = useState(1); // 1: phone input, 2: OTP verification, 3: wallet view
  const [loading, setLoading] = useState(false);
  const [topupLoading, setTopupLoading] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [walletData, setWalletData] = useState(null);
  const [loyaltyData, setLoyaltyData] = useState(null);
  const [topupAmount, setTopupAmount] = useState("");
  const [paymentConfig, setPaymentConfig] = useState(null);
  const [otpSent, setOtpSent] = useState(false);

  // Load payment config
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await axios.get(`${API}/payment/config`);
        setPaymentConfig(response.data);
      } catch (error) {
        console.error("Error fetching payment config:", error);
      }
    };
    fetchConfig();

    // Load Kkiapay script
    const loadKkiapayScript = () => {
      if (window.openKkiapayWidget) return;
      const existingScript = document.querySelector('script[src*="kkiapay"]');
      if (existingScript) return;
      const script = document.createElement("script");
      script.src = "https://cdn.kkiapay.me/k.js";
      script.async = true;
      document.head.appendChild(script);
    };
    loadKkiapayScript();
  }, []);

  const sendOTP = async () => {
    if (!phone || phone.length < 8) {
      toast.error("Veuillez entrer un numéro de téléphone valide");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API}/wallet/send-otp`, { 
        phone, 
        name: name || undefined 
      });
      
      setOtpSent(true);
      setStep(2);
      toast.success("Code de vérification envoyé par SMS!");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de l'envoi du code");
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      toast.error("Veuillez entrer le code à 6 chiffres");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API}/wallet/verify-otp`, { 
        phone, 
        otp 
      });
      
      setSessionToken(response.data.session_token);
      setWalletData(response.data.wallet);
      setLoyaltyData(response.data.loyalty);
      setStep(3);
      toast.success("Vérification réussie!");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Code incorrect");
    } finally {
      setLoading(false);
    }
  };

  const refreshWallet = async () => {
    if (!sessionToken) return;
    
    try {
      const response = await axios.get(`${API}/wallet/${phone}/secure?token=${sessionToken}`);
      setWalletData(response.data);
      setLoyaltyData(response.data.loyalty);
    } catch (error) {
      if (error.response?.status === 401) {
        toast.error("Session expirée. Veuillez vous reconnecter.");
        resetToStart();
      }
    }
  };

  const handleTopupSuccess = useCallback(async (transactionId) => {
    setTopupLoading(true);
    try {
      await axios.post(`${API}/wallet/topup`, {
        phone: phone,
        amount: parseFloat(topupAmount),
        transaction_id: transactionId
      });
      
      // Refresh wallet data
      await refreshWallet();
      setTopupAmount("");
      toast.success(`Recharge de ${topupAmount} FCFA effectuée avec succès!`);
    } catch (error) {
      console.error("Topup error:", error);
      toast.error("Erreur lors de la recharge");
    } finally {
      setTopupLoading(false);
    }
  }, [phone, topupAmount]);

  const handleTopup = async () => {
    if (!topupAmount || parseFloat(topupAmount) < 500) {
      toast.error("Le montant minimum de recharge est 500 FCFA");
      return;
    }

    if (!paymentConfig || !window.openKkiapayWidget) {
      toast.error("Module de paiement non disponible");
      return;
    }

    const cleanPhone = phone.replace(/\s/g, '').replace(/^\+229/, '');

    try {
      window.openKkiapayWidget({
        amount: parseFloat(topupAmount),
        api_key: paymentConfig.public_key,
        sandbox: paymentConfig.sandbox || false,
        phone: cleanPhone,
        name: walletData?.name || name,
        reason: "Recharge Provision Espace Maxo",
        theme: "#22c55e"
      });

      if (typeof window.addSuccessListener === "function") {
        window.addSuccessListener((response) => {
          if (response && response.transactionId) {
            handleTopupSuccess(response.transactionId);
          }
        });
      }

      if (typeof window.addFailedListener === "function") {
        window.addFailedListener((error) => {
          toast.error("Le paiement a échoué");
        });
      }
    } catch (error) {
      console.error("Kkiapay error:", error);
      toast.error("Erreur lors de l'ouverture du paiement");
    }
  };

  const resetToStart = () => {
    setStep(1);
    setOtp("");
    setOtpSent(false);
    setSessionToken("");
    setWalletData(null);
    setLoyaltyData(null);
  };

  const formatPrice = (price) => new Intl.NumberFormat('fr-FR').format(price);

  const predefinedAmounts = [1000, 2000, 5000, 10000, 20000];

  return (
    <div className="min-h-screen pt-20 bg-dark-bg" data-testid="wallet-page">
      {/* Hero */}
      <section className="py-12 px-4 bg-gradient-to-b from-green-900/20 to-dark-bg">
        <div className="max-w-2xl mx-auto text-center">
          <Wallet className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h1 className="font-orbitron font-black text-3xl sm:text-4xl uppercase tracking-tight mb-4">
            <span className="text-white">Mon</span>{" "}
            <span className="text-green-500">Porte-Monnaie</span>
          </h1>
          <p className="text-gray-400 font-outfit">
            Rechargez votre porte-monnaie et payez facilement vos sessions de jeux, menus et événements
          </p>
        </div>
      </section>

      {/* Security Notice */}
      <section className="py-4 px-4 bg-green-500/10 border-y border-green-500/30">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-3 text-green-400">
          <ShieldCheck className="w-5 h-5" />
          <span className="font-outfit text-sm">Accès sécurisé par code SMS</span>
        </div>
      </section>

      {/* Payment Methods */}
      <section className="py-4 px-4 bg-dark-card border-b border-white/10">
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

      <section className="py-12 px-4">
        <div className="max-w-xl mx-auto">
          
          {/* Step 1: Phone Input */}
          {step === 1 && (
            <Card className="bg-dark-card border-white/10">
              <CardHeader>
                <CardTitle className="font-orbitron text-lg text-white flex items-center gap-2">
                  <Phone className="w-5 h-5 text-green-500" />
                  Accéder à mon porte-monnaie
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-4">
                  <p className="text-green-400 font-outfit text-sm">
                    🔐 Un code de vérification sera envoyé par SMS pour sécuriser l'accès à votre porte-monnaie.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-gray-300 font-outfit">
                    Numéro de téléphone *
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="01 XX XX XX XX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="bg-surface-highlight border-white/20 text-white text-lg tracking-wider"
                  />
                  <p className="text-gray-500 text-xs">Format: 8 chiffres (ex: 97123456)</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name" className="text-gray-300 font-outfit">
                    Nom (pour nouveau portefeuille)
                  </Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Votre nom"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-surface-highlight border-white/20 text-white"
                  />
                </div>

                <Button
                  onClick={sendOTP}
                  disabled={loading || phone.length < 8}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-rajdhani font-bold uppercase py-6"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  ) : (
                    <KeyRound className="w-5 h-5 mr-2" />
                  )}
                  Recevoir le code par SMS
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 2: OTP Verification */}
          {step === 2 && (
            <Card className="bg-dark-card border-green-500/30">
              <CardHeader>
                <CardTitle className="font-orbitron text-lg text-green-500 flex items-center gap-2">
                  <KeyRound className="w-5 h-5" />
                  Vérification du code
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-surface-highlight rounded-lg p-4 text-center">
                  <p className="text-gray-400 font-outfit text-sm mb-1">Code envoyé au numéro</p>
                  <p className="text-white font-rajdhani font-bold text-xl tracking-wider">{phone}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="otp" className="text-gray-300 font-outfit">
                    Entrez le code à 6 chiffres
                  </Label>
                  <Input
                    id="otp"
                    type="text"
                    placeholder="• • • • • •"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="bg-surface-highlight border-white/20 text-white text-center text-2xl tracking-[0.5em] font-mono"
                    maxLength={6}
                  />
                </div>

                <Button
                  onClick={verifyOTP}
                  disabled={loading || otp.length !== 6}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-rajdhani font-bold uppercase py-6"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  ) : (
                    <ShieldCheck className="w-5 h-5 mr-2" />
                  )}
                  Vérifier le code
                </Button>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={sendOTP}
                    disabled={loading}
                    className="flex-1 border-white/20 text-gray-400"
                  >
                    Renvoyer le code
                  </Button>
                  <Button
                    variant="outline"
                    onClick={resetToStart}
                    className="flex-1 border-white/20 text-gray-400"
                  >
                    Changer de numéro
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Wallet View */}
          {step === 3 && walletData && (
            <div className="space-y-6">
              {/* Balance Card */}
              <Card className="bg-gradient-to-br from-green-900/30 to-green-600/10 border-green-500/30">
                <CardContent className="p-6 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <ShieldCheck className="w-5 h-5 text-green-500" />
                    <span className="text-green-400 font-outfit text-sm">Accès vérifié</span>
                  </div>
                  <p className="text-gray-400 font-outfit mb-2">Solde disponible</p>
                  <p className="font-orbitron font-black text-4xl text-green-400">
                    {formatPrice(walletData.balance)} <span className="text-xl">FCFA</span>
                  </p>
                  <p className="text-gray-500 font-outfit text-sm mt-2">
                    {walletData.phone} • {walletData.name}
                  </p>
                </CardContent>
              </Card>

              {/* Loyalty Points Card */}
              {loyaltyData && (
                <Card className="bg-gradient-to-br from-food-gold/20 to-yellow-600/10 border-food-gold/30">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-food-gold/20 flex items-center justify-center">
                          <Trophy className="w-6 h-6 text-food-gold" />
                        </div>
                        <div>
                          <p className="text-gray-400 font-outfit text-sm">Points de fidélité</p>
                          <p className="font-orbitron font-bold text-2xl text-food-gold">
                            {loyaltyData.points} <span className="text-sm">points</span>
                          </p>
                        </div>
                      </div>
                      {loyaltyData.free_games_available > 0 && (
                        <div className="text-right bg-food-gold/20 rounded-lg px-4 py-2">
                          <p className="text-food-gold font-rajdhani font-bold text-lg">
                            {loyaltyData.free_games_available}
                          </p>
                          <p className="text-food-gold/80 font-outfit text-xs">
                            partie{loyaltyData.free_games_available > 1 ? 's' : ''} gratuite{loyaltyData.free_games_available > 1 ? 's' : ''}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 pt-4 border-t border-food-gold/20">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400 font-outfit">Prochain bonus</span>
                        <span className="text-food-gold font-rajdhani font-bold">
                          {100 - (loyaltyData.points % 100)} points restants
                        </span>
                      </div>
                      <div className="w-full bg-dark-bg rounded-full h-2 mt-2">
                        <div 
                          className="bg-food-gold h-2 rounded-full transition-all"
                          style={{ width: `${(loyaltyData.points % 100)}%` }}
                        />
                      </div>
                      <p className="text-gray-500 font-outfit text-xs mt-2 text-center">
                        100 points = 1 partie gratuite • Gagnez 10 points par partie
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Topup Card */}
              <Card className="bg-dark-card border-white/10">
                <CardHeader>
                  <CardTitle className="font-orbitron text-lg text-green-500 flex items-center gap-2">
                    <Plus className="w-5 h-5" />
                    Recharger ma provision
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Predefined amounts */}
                  <div className="grid grid-cols-3 gap-2">
                    {predefinedAmounts.map((amount) => (
                      <Button
                        key={amount}
                        variant="outline"
                        onClick={() => setTopupAmount(amount.toString())}
                        className={`border-white/20 font-rajdhani font-bold ${
                          topupAmount === amount.toString() 
                            ? 'bg-green-600 text-white border-green-500' 
                            : 'text-white hover:bg-green-600/20'
                        }`}
                      >
                        {formatPrice(amount)}
                      </Button>
                    ))}
                  </div>

                  {/* Custom amount */}
                  <div className="space-y-2">
                    <Label className="text-gray-300 font-outfit">Ou montant personnalisé</Label>
                    <Input
                      type="number"
                      placeholder="Montant en FCFA"
                      value={topupAmount}
                      onChange={(e) => setTopupAmount(e.target.value)}
                      min={500}
                      className="bg-surface-highlight border-white/20 text-white"
                    />
                  </div>

                  <Button
                    onClick={handleTopup}
                    disabled={topupLoading || !topupAmount || parseFloat(topupAmount) < 500}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-rajdhani font-bold uppercase py-6"
                  >
                    {topupLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    ) : (
                      <CreditCard className="w-5 h-5 mr-2" />
                    )}
                    Recharger {topupAmount ? `${formatPrice(topupAmount)} FCFA` : ''}
                  </Button>
                </CardContent>
              </Card>

              {/* Transaction History */}
              {walletData.transactions && walletData.transactions.length > 0 && (
                <Card className="bg-dark-card border-white/10">
                  <CardHeader>
                    <CardTitle className="font-orbitron text-lg text-white flex items-center gap-2">
                      <History className="w-5 h-5 text-gray-400" />
                      Historique
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {walletData.transactions.slice().reverse().map((tx, index) => (
                        <div 
                          key={tx.id || index}
                          className="flex items-center justify-between py-3 border-b border-white/10 last:border-0"
                        >
                          <div className="flex items-center gap-3">
                            {tx.type === 'topup' ? (
                              <ArrowDownLeft className="w-5 h-5 text-green-500" />
                            ) : (
                              <ArrowUpRight className="w-5 h-5 text-red-500" />
                            )}
                            <div>
                              <p className="text-white font-outfit text-sm">{tx.description}</p>
                              <p className="text-gray-500 text-xs">
                                {new Date(tx.date).toLocaleDateString('fr-FR', {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                            </div>
                          </div>
                          <span className={`font-rajdhani font-bold ${
                            tx.amount > 0 ? 'text-green-500' : 'text-red-500'
                          }`}>
                            {tx.amount > 0 ? '+' : ''}{formatPrice(tx.amount)} FCFA
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Logout Button */}
              <Button
                variant="outline"
                onClick={resetToStart}
                className="w-full border-white/20 text-gray-400"
              >
                Se déconnecter
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default WalletPage;
