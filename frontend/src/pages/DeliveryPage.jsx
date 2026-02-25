import { useState, useEffect } from "react";
import { 
  UtensilsCrossed, Salad, Drumstick, Beef, Fish, Pizza, 
  Sandwich, IceCream, GlassWater, ShoppingCart, Phone, 
  MapPin, Clock, ChefHat, Truck, Plus, Minus, X, Check,
  CreditCard, AlertTriangle, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Menu data - Prix réduits de 10% pour la livraison
const menuData = {
  salades: {
    name: "Salades",
    icon: Salad,
    color: "text-green-500",
    items: [
      { id: "sal1", name: "Salade niçoise", price: 3600 },
      { id: "sal2", name: "Salade crudités", price: 2200 },
      { id: "sal3", name: "Salade César", price: 4000 },
      { id: "sal4", name: "Salade Maxo", price: 4500, popular: true },
      { id: "sal5", name: "Salade Avocat crevettes", price: 4000 },
      { id: "sal6", name: "Salade au thon", price: 3600 }
    ]
  },
  entrees: {
    name: "Entrées",
    icon: ChefHat,
    color: "text-orange-500",
    items: [
      { id: "ent1", name: "Samossas au Poulet", price: 2200 },
      { id: "ent2", name: "Samossas à la viande", price: 2200 },
      { id: "ent3", name: "Neems Poulet ou Viande", price: 2200 }
    ]
  },
  volailles: {
    name: "Plats de Volaille",
    icon: Drumstick,
    color: "text-yellow-500",
    items: [
      { id: "vol1", name: "Sauce Poulet au Curry", price: 4900, description: "Poulet Chair ou Bicyclette" },
      { id: "vol2", name: "Choukouya Poulet Bicyclette", price: 5400, popular: true },
      { id: "vol3", name: "Choukouya Poulet Chair (Demi)", price: 4500 },
      { id: "vol4", name: "Poulet chair Frit/Grillé/BFW (Demi)", price: 4500 },
      { id: "vol5", name: "Poulet chair Frit/Grillé/BFW (Complet)", price: 8100 },
      { id: "vol6", name: "Poulet Bicyclette Frit/Braisé/Grillé", price: 5400 }
    ]
  },
  viandes: {
    name: "Plats de Viande Rouge",
    icon: Beef,
    color: "text-red-500",
    items: [
      { id: "via1", name: "Filet de Boeuf sauce champignons", price: 5400, description: "Sauce crème aux champignons" },
      { id: "via2", name: "Steaks Grillés", price: 4900 },
      { id: "via3", name: "Steak au poivre", price: 4900, popular: true },
      { id: "via4", name: "Choukouya Mouton", price: 4500 },
      { id: "via5", name: "Mouton frit/braisé/Grillé", price: 4500 },
      { id: "via6", name: "Langue de Boeuf Braisé/Grillé", price: 4500 },
      { id: "via7", name: "Agneau Frit/Braisé/Grillé", price: 4500 }
    ]
  },
  poissons: {
    name: "Plats de Poisson",
    icon: Fish,
    color: "text-blue-500",
    items: [
      { id: "poi1", name: "Poisson frit/Braisé/Grillé", price: 5400 },
      { id: "poi2", name: "Moyo Poisson", price: 5400, description: "Poisson au choix" }
    ]
  },
  divers: {
    name: "Plats Divers",
    icon: UtensilsCrossed,
    color: "text-purple-500",
    items: [
      { id: "div1", name: "Lapin frit/Braisé/Grillé (Portion)", price: 3600 },
      { id: "div2", name: "Aileron Frit/Braisé/Grillé", price: 4500 }
    ]
  },
  sauces: {
    name: "Sauces Traditionnelles",
    icon: ChefHat,
    color: "text-amber-600",
    items: [
      { id: "sau1", name: "Sauce Légume GBOMA/TCHIAVO/AMANVIVÈ", price: 4500 },
      { id: "sau2", name: "Sauce Légume Mixte", price: 4900, description: "Au choix de légume" },
      { id: "sau3", name: "Sauce Vassa", price: 4900, description: "Poulet Chair ou Bicyclette", popular: true },
      { id: "sau4", name: "Sauce Assrokouin", price: 4500 },
      { id: "sau5", name: "Sauce Arachide (Fromage/Poisson)", price: 4500 },
      { id: "sau6", name: "Agneau en Sauce Arachide", price: 4500 },
      { id: "sau7", name: "Agneau en Sauce Tomate", price: 4500 },
      { id: "sau8", name: "Sauce Goussi (Sésame)", price: 4500 }
    ]
  },
  pates: {
    name: "Pâtes & Accompagnements",
    icon: UtensilsCrossed,
    color: "text-yellow-600",
    items: [
      { id: "pat1", name: "Spaghetti bolognaise", price: 3600 },
      { id: "pat2", name: "Tagliatelles crevettes", price: 4500 },
      { id: "pat3", name: "Spaghetti (Sauté au beurre/au gras)", price: 900 },
      { id: "pat4", name: "Pïron (Rouge/Blanc)", price: 900 },
      { id: "pat5", name: "Couscous (au gras/Blanc)", price: 900 },
      { id: "pat6", name: "Pâte Blanche (Pâte de Maïs)", price: 900 },
      { id: "pat7", name: "Pâte Noire (Télibo)", price: 900 },
      { id: "pat8", name: "Pâte Rouge (Amiwo)", price: 900 }
    ]
  },
  accompagnements: {
    name: "Accompagnements",
    icon: UtensilsCrossed,
    color: "text-lime-500",
    items: [
      { id: "acc1", name: "Riz blanc", price: 900 },
      { id: "acc2", name: "Riz Cantonais", price: 1300 },
      { id: "acc3", name: "Riz aux légumes", price: 1300 },
      { id: "acc4", name: "Pomme sautée", price: 1300 },
      { id: "acc5", name: "Frite surgelée", price: 900 },
      { id: "acc6", name: "Frite Nature", price: 1300 },
      { id: "acc7", name: "Atiékè", price: 900 },
      { id: "acc8", name: "Akassa", price: 400 },
      { id: "acc9", name: "Salade verte", price: 1300 }
    ]
  },
  burgers: {
    name: "Burgers",
    icon: Sandwich,
    color: "text-orange-600",
    items: [
      { id: "bur1", name: "MeetBurger", price: 2200, description: "Viande burger, oignons, tomate, cornichons, salade" },
      { id: "bur2", name: "CheeseBurger", price: 2700, description: "Viande burger, cheese, oignons, tomate, cornichons" },
      { id: "bur3", name: "Double Cheese Burger", price: 4500, description: "Double viande, double cheese", popular: true },
      { id: "bur4", name: "KingBurger", price: 3100, description: "Viande, cheese, oeuf, oignons, tomate, cornichons" },
      { id: "bur5", name: "Burger Maxo", price: 3600, description: "Poulet crispy, cheese, oeuf, oignons, tomate", popular: true }
    ]
  },
  sandwichs: {
    name: "Sandwichs & Shawarmas",
    icon: Sandwich,
    color: "text-amber-500",
    items: [
      { id: "san1", name: "Chawarma Viande", price: 1800 },
      { id: "san2", name: "Chawarma Poulet", price: 1800 },
      { id: "san3", name: "Sandwich au Poisson + Frite", price: 2700 },
      { id: "san4", name: "Sandwich Fajitas + Frite", price: 2700 },
      { id: "san5", name: "Sandwich Philadelphia + Frite", price: 2700 },
      { id: "san6", name: "Sandwich MAXO + Frite", price: 2700, popular: true }
    ]
  },
  pizzas: {
    name: "Pizzas",
    icon: Pizza,
    color: "text-red-600",
    items: [
      { id: "piz1", name: "Pizza Reine", price: 4500, description: "Sauce tomate, Jambon, Champignon, fromage" },
      { id: "piz2", name: "Pizza 4 saisons", price: 4500, description: "Jambon, artichaut, champignon, poivron" },
      { id: "piz3", name: "Pizza Margherita", price: 4000, description: "Sauce tomate, olive, origan, fromage" },
      { id: "piz4", name: "Pizza Maxo", price: 5400, description: "Chorizo, champignon, poulet, origan, olive", popular: true },
      { id: "piz5", name: "Pizza Végétarienne", price: 4500, description: "Oignon, champignon, maïs, poivron, olive" },
      { id: "piz6", name: "Pizza Bolognaise", price: 4500, description: "Sauce tomate, viande hachée, fromage" }
    ]
  },
  desserts: {
    name: "Desserts",
    icon: IceCream,
    color: "text-pink-500",
    items: [
      { id: "des1", name: "Crêpe Nature (1 pièce)", price: 600 },
      { id: "des2", name: "Crêpe au Nutella (1 pièce)", price: 1300 },
      { id: "des3", name: "Salade de Fruit", price: 900 },
      { id: "des4", name: "Ananas Pirogue", price: 900 },
      { id: "des5", name: "Assiette de Fruit", price: 1300 },
      { id: "des6", name: "Glace Chocolat/Fraise/Vanille (boule)", price: 900 },
      { id: "des7", name: "Coupe de glace (3 boules + chantilly)", price: 2200, popular: true }
    ]
  },
  boissons: {
    name: "Boissons",
    icon: GlassWater,
    color: "text-cyan-500",
    items: [
      { id: "boi1", name: "Majestic / World cola", price: 900 },
      { id: "boi2", name: "Jus d'orange", price: 900 },
      { id: "boi3", name: "Jus d'ananas", price: 900 },
      { id: "boi4", name: "Jus de pastèque", price: 900 },
      { id: "boi5", name: "Jus Mixte (Mélange au choix)", price: 1300 },
      { id: "boi6", name: "Béninoises 0,33 cl", price: 900 },
      { id: "boi7", name: "Sombreros 0,33 cl", price: 900 },
      { id: "boi8", name: "Guinness 0,33 cl", price: 1300 },
      { id: "boi9", name: "Chill 0,33 cl", price: 900 }
    ]
  }
};

const DeliveryPage = () => {
  const [cart, setCart] = useState([]);
  const [activeCategory, setActiveCategory] = useState("salades");
  const [showCart, setShowCart] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [orderForm, setOrderForm] = useState({
    name: "",
    phone: "",
    address: "",
    notes: "",
    zone: "cotonou" // cotonou or outside
  });
  const [submitting, setSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [paymentConfig, setPaymentConfig] = useState(null);
  const [awaitingPayment, setAwaitingPayment] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState(null);

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

  // Add item to cart
  const addToCart = (item) => {
    const existing = cart.find(c => c.id === item.id);
    if (existing) {
      setCart(cart.map(c => 
        c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c
      ));
    } else {
      setCart([...cart, { ...item, quantity: 1 }]);
    }
    toast.success(`${item.name} ajouté au panier`);
  };

  // Remove item from cart
  const removeFromCart = (itemId) => {
    setCart(cart.filter(c => c.id !== itemId));
  };

  // Update quantity
  const updateQuantity = (itemId, delta) => {
    setCart(cart.map(c => {
      if (c.id === itemId) {
        const newQty = c.quantity + delta;
        return newQty > 0 ? { ...c, quantity: newQty } : c;
      }
      return c;
    }).filter(c => c.quantity > 0));
  };

  // Calculate total
  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const deliveryFee = orderForm.zone === "cotonou" ? 1000 : 0; // Frais uniquement pour Cotonou
  const totalWithDelivery = cartTotal + deliveryFee;

  // Create order in backend
  const createOrder = async (paymentStatus = "pending", transactionId = null) => {
    const orderData = {
      customer_name: orderForm.name,
      customer_phone: orderForm.phone,
      delivery_address: orderForm.address,
      delivery_zone: orderForm.zone,
      notes: orderForm.notes,
      items: cart.map(item => ({
        name: item.name,
        price: item.price,
        quantity: item.quantity
      })),
      subtotal: cartTotal,
      delivery_fee: deliveryFee,
      total: totalWithDelivery,
      payment_status: paymentStatus,
      payment_transaction_id: transactionId
    };

    const response = await axios.post(`${API}/delivery-orders`, orderData);
    return response.data;
  };

  // Handle order submission
  const handleSubmitOrder = async () => {
    if (!orderForm.name || !orderForm.phone || !orderForm.address) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }

    if (orderForm.zone === "cotonou") {
      // Cotonou: Payment required via Kkiapay
      initiatePayment();
    } else {
      // Outside Cotonou: Submit for validation
      await submitForValidation();
    }
  };

  // Initiate Kkiapay payment for Cotonou orders
  const initiatePayment = () => {
    if (!paymentConfig || !window.openKkiapayWidget) {
      toast.error("Service de paiement non disponible. Veuillez réessayer.");
      return;
    }

    setAwaitingPayment(true);

    window.openKkiapayWidget({
      amount: totalWithDelivery,
      position: "center",
      callback: "",
      data: "",
      theme: "#FF6B00",
      key: paymentConfig.public_key,
      sandbox: paymentConfig.sandbox,
      phone: orderForm.phone.replace(/\s/g, ''),
      name: orderForm.name,
      description: `Commande Livraison Espace Maxo`
    });

    // Listen for payment success
    window.addSuccessListener(async (response) => {
      console.log("Payment success:", response);
      toast.success("Paiement réussi!");
      
      try {
        // Create order with payment confirmed
        await createOrder("paid", response.transactionId);
        setOrderSuccess(true);
        setSuccessMessage("Votre commande est confirmée et en cours de préparation. Livraison dans 30-45 minutes!");
        setCart([]);
        setShowOrderForm(false);
      } catch (error) {
        console.error("Error creating order:", error);
        toast.error("Erreur lors de l'enregistrement. Contactez-nous avec votre ID de paiement.");
      }
      
      setAwaitingPayment(false);
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

  // Submit order for validation (outside Cotonou)
  const submitForValidation = async () => {
    setSubmitting(true);
    try {
      await createOrder("pending_validation", null);
      setOrderSuccess(true);
      setSuccessMessage("Votre commande a été soumise pour validation. Nous vous contacterons sous peu pour confirmer la disponibilité de livraison et les frais dans votre zone.");
      setCart([]);
      setShowOrderForm(false);
      toast.success("Commande soumise pour validation!");
    } catch (error) {
      console.error("Error submitting order:", error);
      toast.error("Erreur lors de l'envoi. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  };

  const categories = Object.keys(menuData);

  return (
    <div className="min-h-screen pt-20 bg-dark-bg" data-testid="delivery-page">
      {/* Hero */}
      <section className="py-12 px-4 bg-gradient-to-br from-food-orange/20 via-dark-bg to-food-gold/10">
        <div className="max-w-6xl mx-auto text-center">
          <Truck className="w-16 h-16 text-food-orange mx-auto mb-4" />
          <h1 className="font-orbitron font-black text-3xl sm:text-4xl lg:text-5xl uppercase tracking-tight mb-4">
            <span className="text-white">Livraison</span>{" "}
            <span className="text-food-orange">de Repas</span>
          </h1>
          <p className="text-gray-300 font-outfit text-lg max-w-2xl mx-auto mb-6">
            Savourez les délices d'Espace Maxo chez vous ! Commandez en ligne et faites-vous livrer.
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-sm">
            <Badge className="bg-food-gold/20 text-food-gold border-food-gold/30 px-4 py-2">
              <Clock className="w-4 h-4 mr-2" />
              Livraison 30-45 min
            </Badge>
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 px-4 py-2">
              <MapPin className="w-4 h-4 mr-2" />
              Cotonou: 1 000 FCFA
            </Badge>
            <Badge className="bg-neon-blue/20 text-neon-blue border-neon-blue/30 px-4 py-2">
              <CreditCard className="w-4 h-4 mr-2" />
              Paiement Mobile Money
            </Badge>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Categories Sidebar */}
            <div className="lg:w-64 flex-shrink-0">
              <div className="bg-dark-card rounded-xl p-4 sticky top-24">
                <h3 className="font-orbitron text-lg text-white mb-4">Catégories</h3>
                <div className="space-y-2">
                  {categories.map(catKey => {
                    const cat = menuData[catKey];
                    const Icon = cat.icon;
                    return (
                      <button
                        key={catKey}
                        onClick={() => setActiveCategory(catKey)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left ${
                          activeCategory === catKey 
                            ? "bg-food-orange/20 text-food-orange" 
                            : "text-gray-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        <Icon className={`w-5 h-5 ${cat.color}`} />
                        <span className="font-outfit text-sm">{cat.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className="flex-1">
              <div className="mb-6">
                <h2 className="font-orbitron text-2xl text-white flex items-center gap-3">
                  {(() => {
                    const Icon = menuData[activeCategory].icon;
                    return <Icon className={`w-7 h-7 ${menuData[activeCategory].color}`} />;
                  })()}
                  {menuData[activeCategory].name}
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {menuData[activeCategory].items.map(item => (
                  <Card 
                    key={item.id} 
                    className="bg-dark-card border-white/10 hover:border-food-orange/30 transition-colors"
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-outfit font-semibold text-white">{item.name}</h3>
                            {item.popular && (
                              <Badge className="bg-food-gold/20 text-food-gold text-xs">Populaire</Badge>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-gray-500 text-sm mt-1">{item.description}</p>
                          )}
                          <p className="text-food-orange font-rajdhani font-bold text-xl mt-2">
                            {item.price.toLocaleString()} FCFA
                          </p>
                        </div>
                        <Button
                          onClick={() => addToCart(item)}
                          size="sm"
                          className="bg-food-orange hover:bg-food-orange/80 text-white"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Floating Cart Button */}
      {cart.length > 0 && (
        <button
          onClick={() => setShowCart(true)}
          className="fixed bottom-6 right-6 bg-food-orange text-white p-4 rounded-full shadow-lg hover:bg-food-orange/90 transition-colors z-40"
          data-testid="cart-button"
        >
          <ShoppingCart className="w-6 h-6" />
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
            {cart.reduce((sum, item) => sum + item.quantity, 0)}
          </span>
        </button>
      )}

      {/* Cart Dialog */}
      <Dialog open={showCart} onOpenChange={setShowCart}>
        <DialogContent className="bg-dark-card border-white/20 text-white max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-orbitron text-xl flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-food-orange" />
              Votre Panier
            </DialogTitle>
          </DialogHeader>

          {cart.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Votre panier est vide</p>
          ) : (
            <>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {cart.map(item => (
                  <div key={item.id} className="flex items-center justify-between bg-white/5 rounded-lg p-3">
                    <div className="flex-1">
                      <p className="font-outfit text-sm text-white">{item.name}</p>
                      <p className="text-food-orange text-sm">{item.price.toLocaleString()} FCFA</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="p-1 hover:bg-white/10 rounded"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="p-1 hover:bg-white/10 rounded"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="p-1 hover:bg-red-500/20 rounded text-red-400"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-white/10 pt-4 space-y-2">
                <div className="flex justify-between text-gray-400">
                  <span>Sous-total</span>
                  <span>{cartTotal.toLocaleString()} FCFA</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Frais de livraison (Cotonou)</span>
                  <span>1 000 FCFA</span>
                </div>
                <div className="text-xs text-yellow-400">
                  * Hors Cotonou: frais à confirmer
                </div>
              </div>

              <Button
                onClick={() => {
                  setShowCart(false);
                  setShowOrderForm(true);
                }}
                className="w-full bg-food-orange hover:bg-food-orange/80 text-white font-rajdhani font-bold uppercase py-6"
              >
                Commander maintenant
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Order Form Dialog */}
      <Dialog open={showOrderForm} onOpenChange={setShowOrderForm}>
        <DialogContent className="bg-dark-card border-white/20 text-white max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-orbitron text-xl flex items-center gap-2">
              <Truck className="w-5 h-5 text-food-orange" />
              Informations de livraison
            </DialogTitle>
          </DialogHeader>

          {orderSuccess ? (
            <div className="text-center py-8">
              <Check className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="font-orbitron text-xl text-white mb-2">
                {orderForm.zone === "cotonou" ? "Commande confirmée!" : "Commande soumise!"}
              </h3>
              <p className="text-gray-400 mb-4">{successMessage}</p>
              <Button
                onClick={() => {
                  setShowOrderForm(false);
                  setOrderSuccess(false);
                  setSuccessMessage("");
                }}
                className="bg-food-orange hover:bg-food-orange/80"
              >
                Fermer
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {/* Zone Selection */}
                <div className="space-y-3">
                  <Label className="text-gray-300 font-semibold">Zone de livraison *</Label>
                  <RadioGroup
                    value={orderForm.zone}
                    onValueChange={(value) => setOrderForm({ ...orderForm, zone: value })}
                    className="flex flex-col gap-3"
                  >
                    <div className={`flex items-center space-x-3 p-3 rounded-lg border ${
                      orderForm.zone === "cotonou" 
                        ? "border-green-500 bg-green-500/10" 
                        : "border-white/20"
                    }`}>
                      <RadioGroupItem value="cotonou" id="cotonou" />
                      <Label htmlFor="cotonou" className="flex-1 cursor-pointer">
                        <span className="text-white font-semibold">Cotonou</span>
                        <span className="block text-sm text-green-400">Frais: 1 000 FCFA - Paiement immédiat</span>
                      </Label>
                    </div>
                    <div className={`flex items-center space-x-3 p-3 rounded-lg border ${
                      orderForm.zone === "outside" 
                        ? "border-yellow-500 bg-yellow-500/10" 
                        : "border-white/20"
                    }`}>
                      <RadioGroupItem value="outside" id="outside" />
                      <Label htmlFor="outside" className="flex-1 cursor-pointer">
                        <span className="text-white font-semibold">Hors Cotonou</span>
                        <span className="block text-sm text-yellow-400">Commande à valider - Nous vous contacterons</span>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <div>
                  <Label htmlFor="name" className="text-gray-300">Nom complet *</Label>
                  <Input
                    id="name"
                    value={orderForm.name}
                    onChange={(e) => setOrderForm({ ...orderForm, name: e.target.value })}
                    className="bg-surface-highlight border-white/20 text-white"
                    placeholder="Votre nom"
                  />
                </div>
                <div>
                  <Label htmlFor="phone" className="text-gray-300">Téléphone *</Label>
                  <Input
                    id="phone"
                    value={orderForm.phone}
                    onChange={(e) => setOrderForm({ ...orderForm, phone: e.target.value })}
                    className="bg-surface-highlight border-white/20 text-white"
                    placeholder="97 XX XX XX"
                  />
                </div>
                <div>
                  <Label htmlFor="address" className="text-gray-300">Adresse de livraison *</Label>
                  <Textarea
                    id="address"
                    value={orderForm.address}
                    onChange={(e) => setOrderForm({ ...orderForm, address: e.target.value })}
                    className="bg-surface-highlight border-white/20 text-white"
                    placeholder="Quartier, rue, repère..."
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="notes" className="text-gray-300">Instructions (optionnel)</Label>
                  <Input
                    id="notes"
                    value={orderForm.notes}
                    onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })}
                    className="bg-surface-highlight border-white/20 text-white"
                    placeholder="Ex: Sans oignons..."
                  />
                </div>
              </div>

              {/* Order Summary */}
              <div className={`rounded-lg p-4 mt-4 ${
                orderForm.zone === "cotonou" 
                  ? "bg-green-500/10 border border-green-500/30" 
                  : "bg-yellow-500/10 border border-yellow-500/30"
              }`}>
                {orderForm.zone === "cotonou" ? (
                  <>
                    <div className="flex justify-between text-gray-300 text-sm">
                      <span>Sous-total</span>
                      <span>{cartTotal.toLocaleString()} FCFA</span>
                    </div>
                    <div className="flex justify-between text-gray-300 text-sm">
                      <span>Livraison Cotonou</span>
                      <span>1 000 FCFA</span>
                    </div>
                    <div className="flex justify-between text-green-400 font-bold text-lg mt-2 pt-2 border-t border-green-500/30">
                      <span>Total à payer</span>
                      <span>{totalWithDelivery.toLocaleString()} FCFA</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-sm text-green-300">
                      <CreditCard className="w-4 h-4" />
                      <span>Paiement par Mobile Money (MTN, Moov, Celtiis)</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-2 text-yellow-400">
                      <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Commande hors Cotonou</p>
                        <p className="text-sm text-yellow-300">
                          Votre commande sera soumise pour validation. Nous vous contacterons pour confirmer 
                          la disponibilité de livraison et les frais dans votre zone.
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 text-gray-300">
                      <span>Sous-total: </span>
                      <span className="font-bold">{cartTotal.toLocaleString()} FCFA</span>
                      <span className="text-yellow-400 text-sm ml-2">(+ frais à confirmer)</span>
                    </div>
                  </>
                )}
              </div>

              <DialogFooter className="mt-4 flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowOrderForm(false)}
                  className="border-white/20 text-gray-300"
                  disabled={submitting || awaitingPayment}
                >
                  Annuler
                </Button>
                <Button
                  onClick={handleSubmitOrder}
                  disabled={submitting || awaitingPayment || !orderForm.name || !orderForm.phone || !orderForm.address}
                  className={`font-rajdhani font-bold flex-1 ${
                    orderForm.zone === "cotonou"
                      ? "bg-green-600 hover:bg-green-700"
                      : "bg-yellow-600 hover:bg-yellow-700"
                  }`}
                >
                  {submitting || awaitingPayment ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      {awaitingPayment ? "Paiement en cours..." : "Envoi..."}
                    </>
                  ) : orderForm.zone === "cotonou" ? (
                    <>
                      <CreditCard className="w-4 h-4 mr-2" />
                      Payer {totalWithDelivery.toLocaleString()} FCFA
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Soumettre pour validation
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DeliveryPage;
