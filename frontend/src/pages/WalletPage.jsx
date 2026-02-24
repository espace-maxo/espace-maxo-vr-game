import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Wallet, Phone, User, Plus, History, CreditCard, Loader2, ArrowDownLeft, ArrowUpRight, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const WalletPage = () => {
  const [step, setStep] = useState(1); // 1: search, 2: wallet view
  const [loading, setLoading] = useState(false);
  const [topupLoading, setTopupLoading] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [walletData, setWalletData] = useState(null);
  const [topupAmount, setTopupAmount] = useState("");
  const [paymentConfig, setPaymentConfig] = useState(null);

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

  const searchWallet = async () => {
    if (!phone || phone.length < 10) {
      toast.error("Veuillez entrer un numéro de téléphone valide");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.get(`${API}/wallet/${phone}`);
      
      if (!response.data.exists) {
        // Create wallet if doesn't exist
        if (!name) {
          toast.error("Veuillez entrer votre nom pour créer un portefeuille");
          setLoading(false);
          return;
        }
        await axios.post(`${API}/wallet/create`, { phone, name });
        const newResponse = await axios.get(`${API}/wallet/${phone}`);
        setWalletData(newResponse.data);
        toast.success("Portefeuille créé avec succès!");
      } else {
        setWalletData(response.data);
      }
      setStep(2);
    } catch (error) {
      toast.error("Erreur lors de la recherche du portefeuille");
    } finally {
      setLoading(false);
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
      const response = await axios.get(`${API}/wallet/${phone}`);
      setWalletData(response.data);
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

  const formatPrice = (price) => new Intl.NumberFormat('fr-FR').format(price);

  const predefinedAmounts = [1000, 2000, 5000, 10000, 20000];

  return (
    <div className="min-h-screen pt-20 bg-dark-bg" data-testid="wallet-page">
      {/* Hero */}
      <section className="py-12 px-4 bg-gradient-to-b from-green-900/20 to-dark-bg">
        <div className="max-w-2xl mx-auto text-center">
          <Wallet className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h1 className="font-orbitron font-black text-3xl sm:text-4xl uppercase tracking-tight mb-4">
            <span className="text-white">Ma</span>{" "}
            <span className="text-green-500">Provision</span>
          </h1>
          <p className="text-gray-400 font-outfit">
            Rechargez votre provision et payez facilement vos sessions de jeux, menus et événements
          </p>
        </div>
      </section>

      {/* Payment Methods */}
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

      <section className="py-12 px-4">
        <div className="max-w-xl mx-auto">
          {/* Step 1: Search/Create Wallet */}
          {step === 1 && (
            <Card className="bg-dark-card border-white/10">
              <CardHeader>
                <CardTitle className="font-orbitron text-lg text-white flex items-center gap-2">
                  <Phone className="w-5 h-5 text-green-500" />
                  Accéder à ma provision
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
                    className="bg-surface-highlight border-white/20 text-white"
                  />
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
                  onClick={searchWallet}
                  disabled={loading || phone.length < 10}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-rajdhani font-bold uppercase py-6"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  ) : (
                    <Wallet className="w-5 h-5 mr-2" />
                  )}
                  Accéder à ma provision
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Wallet View */}
          {step === 2 && walletData && (
            <div className="space-y-6">
              {/* Balance Card */}
              <Card className="bg-gradient-to-br from-green-900/30 to-green-600/10 border-green-500/30">
                <CardContent className="p-6 text-center">
                  <p className="text-gray-400 font-outfit mb-2">Solde disponible</p>
                  <p className="font-orbitron font-black text-4xl text-green-400">
                    {formatPrice(walletData.balance)} <span className="text-xl">FCFA</span>
                  </p>
                  <p className="text-gray-500 font-outfit text-sm mt-2">
                    {walletData.phone} • {walletData.name}
                  </p>
                </CardContent>
              </Card>

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

              {/* Back Button */}
              <Button
                variant="outline"
                onClick={() => {
                  setStep(1);
                  setWalletData(null);
                }}
                className="w-full border-white/20 text-gray-400"
              >
                Changer de numéro
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default WalletPage;
