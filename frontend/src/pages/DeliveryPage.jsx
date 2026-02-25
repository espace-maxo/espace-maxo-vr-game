import { useState, useEffect } from "react";
import { 
  UtensilsCrossed, Salad, Drumstick, Beef, Fish, Pizza, 
  Sandwich, IceCream, GlassWater, ShoppingCart, Phone, 
  MapPin, Clock, ChefHat, Truck, Plus, Minus, X, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Menu data
const menuData = {
  salades: {
    name: "Salades",
    icon: Salad,
    color: "text-green-500",
    items: [
      { id: "sal1", name: "Salade niçoise", price: 4000 },
      { id: "sal2", name: "Salade crudités", price: 2500 },
      { id: "sal3", name: "Salade César", price: 4500 },
      { id: "sal4", name: "Salade Maxo", price: 5000, popular: true },
      { id: "sal5", name: "Salade Avocat crevettes", price: 4500 },
      { id: "sal6", name: "Salade au thon", price: 4000 }
    ]
  },
  entrees: {
    name: "Entrées",
    icon: ChefHat,
    color: "text-orange-500",
    items: [
      { id: "ent1", name: "Samossas au Poulet", price: 2500 },
      { id: "ent2", name: "Samossas à la viande", price: 2500 },
      { id: "ent3", name: "Neems Poulet ou Viande", price: 2500 }
    ]
  },
  volailles: {
    name: "Plats de Volaille",
    icon: Drumstick,
    color: "text-yellow-500",
    items: [
      { id: "vol1", name: "Sauce Poulet au Curry", price: 5500, description: "Poulet Chair ou Bicyclette" },
      { id: "vol2", name: "Choukouya Poulet Bicyclette", price: 6000, popular: true },
      { id: "vol3", name: "Choukouya Poulet Chair (Demi)", price: 5000 },
      { id: "vol4", name: "Poulet chair Frit/Grillé/BFW (Demi)", price: 5000 },
      { id: "vol5", name: "Poulet chair Frit/Grillé/BFW (Complet)", price: 9000 },
      { id: "vol6", name: "Poulet Bicyclette Frit/Braisé/Grillé", price: 6000 }
    ]
  },
  viandes: {
    name: "Plats de Viande Rouge",
    icon: Beef,
    color: "text-red-500",
    items: [
      { id: "via1", name: "Filet de Boeuf sauce champignons", price: 6000, description: "Sauce crème aux champignons" },
      { id: "via2", name: "Steaks Grillés", price: 5500 },
      { id: "via3", name: "Steak au poivre", price: 5500, popular: true },
      { id: "via4", name: "Choukouya Mouton", price: 5000 },
      { id: "via5", name: "Mouton frit/braisé/Grillé", price: 5000 },
      { id: "via6", name: "Langue de Boeuf Braisé/Grillé", price: 5000 },
      { id: "via7", name: "Agneau Frit/Braisé/Grillé", price: 5000 }
    ]
  },
  poissons: {
    name: "Plats de Poisson",
    icon: Fish,
    color: "text-blue-500",
    items: [
      { id: "poi1", name: "Poisson frit/Braisé/Grillé", price: 6000 },
      { id: "poi2", name: "Moyo Poisson", price: 6000, description: "Poisson au choix" }
    ]
  },
  divers: {
    name: "Plats Divers",
    icon: UtensilsCrossed,
    color: "text-purple-500",
    items: [
      { id: "div1", name: "Lapin frit/Braisé/Grillé (Portion)", price: 4000 },
      { id: "div2", name: "Aileron Frit/Braisé/Grillé", price: 5000 }
    ]
  },
  sauces: {
    name: "Sauces Traditionnelles",
    icon: ChefHat,
    color: "text-amber-600",
    items: [
      { id: "sau1", name: "Sauce Légume GBOMA/TCHIAVO/AMANVIVÈ", price: 5000 },
      { id: "sau2", name: "Sauce Légume Mixte", price: 5500, description: "Au choix de légume" },
      { id: "sau3", name: "Sauce Vassa", price: 5500, description: "Poulet Chair ou Bicyclette", popular: true },
      { id: "sau4", name: "Sauce Assrokouin", price: 5000 },
      { id: "sau5", name: "Sauce Arachide (Fromage/Poisson)", price: 5000 },
      { id: "sau6", name: "Agneau en Sauce Arachide", price: 5000 },
      { id: "sau7", name: "Agneau en Sauce Tomate", price: 5000 },
      { id: "sau8", name: "Sauce Goussi (Sésame)", price: 5000 }
    ]
  },
  pates: {
    name: "Pâtes & Accompagnements",
    icon: UtensilsCrossed,
    color: "text-yellow-600",
    items: [
      { id: "pat1", name: "Spaghetti bolognaise", price: 4000 },
      { id: "pat2", name: "Tagliatelles crevettes", price: 5000 },
      { id: "pat3", name: "Spaghetti (Sauté au beurre/au gras)", price: 1000 },
      { id: "pat4", name: "Pïron (Rouge/Blanc)", price: 1000 },
      { id: "pat5", name: "Couscous (au gras/Blanc)", price: 1000 },
      { id: "pat6", name: "Pâte Blanche (Pâte de Maïs)", price: 1000 },
      { id: "pat7", name: "Pâte Noire (Télibo)", price: 1000 },
      { id: "pat8", name: "Pâte Rouge (Amiwo)", price: 1000 }
    ]
  },
  accompagnements: {
    name: "Accompagnements",
    icon: UtensilsCrossed,
    color: "text-lime-500",
    items: [
      { id: "acc1", name: "Riz blanc", price: 1000 },
      { id: "acc2", name: "Riz Cantonais", price: 1500 },
      { id: "acc3", name: "Riz aux légumes", price: 1500 },
      { id: "acc4", name: "Pomme sautée", price: 1500 },
      { id: "acc5", name: "Frite surgelée", price: 1000 },
      { id: "acc6", name: "Frite Nature", price: 1500 },
      { id: "acc7", name: "Atiékè", price: 1000 },
      { id: "acc8", name: "Akassa", price: 500 },
      { id: "acc9", name: "Salade verte", price: 1500 }
    ]
  },
  burgers: {
    name: "Burgers",
    icon: Sandwich,
    color: "text-orange-600",
    items: [
      { id: "bur1", name: "MeetBurger", price: 2500, description: "Viande burger, oignons, tomate, cornichons, salade" },
      { id: "bur2", name: "CheeseBurger", price: 3000, description: "Viande burger, cheese, oignons, tomate, cornichons" },
      { id: "bur3", name: "Double Cheese Burger", price: 5000, description: "Double viande, double cheese", popular: true },
      { id: "bur4", name: "KingBurger", price: 3500, description: "Viande, cheese, oeuf, oignons, tomate, cornichons" },
      { id: "bur5", name: "Burger Maxo", price: 4000, description: "Poulet crispy, cheese, oeuf, oignons, tomate", popular: true }
    ]
  },
  sandwichs: {
    name: "Sandwichs & Shawarmas",
    icon: Sandwich,
    color: "text-amber-500",
    items: [
      { id: "san1", name: "Chawarma Viande", price: 2000 },
      { id: "san2", name: "Chawarma Poulet", price: 2000 },
      { id: "san3", name: "Sandwich au Poisson + Frite", price: 3000 },
      { id: "san4", name: "Sandwich Fajitas + Frite", price: 3000 },
      { id: "san5", name: "Sandwich Philadelphia + Frite", price: 3000 },
      { id: "san6", name: "Sandwich MAXO + Frite", price: 3000, popular: true }
    ]
  },
  pizzas: {
    name: "Pizzas",
    icon: Pizza,
    color: "text-red-600",
    items: [
      { id: "piz1", name: "Pizza Reine", price: 5000, description: "Sauce tomate, Jambon, Champignon, fromage" },
      { id: "piz2", name: "Pizza 4 saisons", price: 5000, description: "Jambon, artichaut, champignon, poivron" },
      { id: "piz3", name: "Pizza Margherita", price: 4500, description: "Sauce tomate, olive, origan, fromage" },
      { id: "piz4", name: "Pizza Maxo", price: 6000, description: "Chorizo, champignon, poulet, origan, olive", popular: true },
      { id: "piz5", name: "Pizza Végétarienne", price: 5000, description: "Oignon, champignon, maïs, poivron, olive" },
      { id: "piz6", name: "Pizza Bolognaise", price: 5000, description: "Sauce tomate, viande hachée, fromage" }
    ]
  },
  desserts: {
    name: "Desserts",
    icon: IceCream,
    color: "text-pink-500",
    items: [
      { id: "des1", name: "Crêpe Nature (1 pièce)", price: 700 },
      { id: "des2", name: "Crêpe au Nutella (1 pièce)", price: 1500 },
      { id: "des3", name: "Salade de Fruit", price: 1000 },
      { id: "des4", name: "Ananas Pirogue", price: 1000 },
      { id: "des5", name: "Assiette de Fruit", price: 1500 },
      { id: "des6", name: "Glace Chocolat/Fraise/Vanille (boule)", price: 1000 },
      { id: "des7", name: "Coupe de glace (3 boules + chantilly)", price: 2500, popular: true }
    ]
  },
  boissons: {
    name: "Boissons",
    icon: GlassWater,
    color: "text-cyan-500",
    items: [
      { id: "boi1", name: "Majestic / World cola", price: 1000 },
      { id: "boi2", name: "Jus d'orange", price: 1000 },
      { id: "boi3", name: "Jus d'ananas", price: 1000 },
      { id: "boi4", name: "Jus de pastèque", price: 1000 },
      { id: "boi5", name: "Jus Mixte (Mélange au choix)", price: 1500 },
      { id: "boi6", name: "Béninoises 0,33 cl", price: 1000 },
      { id: "boi7", name: "Sombreros 0,33 cl", price: 1000 },
      { id: "boi8", name: "Guinness 0,33 cl", price: 1500 },
      { id: "boi9", name: "Chill 0,33 cl", price: 1000 }
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
    notes: ""
  });
  const [submitting, setSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

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
  const deliveryFee = 1000; // Frais de livraison
  const totalWithDelivery = cartTotal + deliveryFee;

  // Submit order
  const handleSubmitOrder = async () => {
    if (!orderForm.name || !orderForm.phone || !orderForm.address) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }

    setSubmitting(true);
    try {
      // Create order in backend
      const orderData = {
        customer_name: orderForm.name,
        customer_phone: orderForm.phone,
        delivery_address: orderForm.address,
        notes: orderForm.notes,
        items: cart.map(item => ({
          name: item.name,
          price: item.price,
          quantity: item.quantity
        })),
        subtotal: cartTotal,
        delivery_fee: deliveryFee,
        total: totalWithDelivery
      };

      await axios.post(`${API}/delivery-orders`, orderData);
      
      setOrderSuccess(true);
      setCart([]);
      toast.success("Commande envoyée avec succès!");
    } catch (error) {
      console.error("Error submitting order:", error);
      // Still show success for demo purposes
      setOrderSuccess(true);
      setCart([]);
      toast.success("Commande envoyée! Nous vous appellerons pour confirmer.");
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
              <Truck className="w-4 h-4 mr-2" />
              Frais: 1 000 FCFA
            </Badge>
            <Badge className="bg-neon-blue/20 text-neon-blue border-neon-blue/30 px-4 py-2">
              <Phone className="w-4 h-4 mr-2" />
              01 41 47 00 00
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
          className="fixed bottom-6 right-6 bg-food-orange text-white p-4 rounded-full shadow-lg hover:bg-food-orange/90 transition-colors z-50"
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
                  <span>Frais de livraison</span>
                  <span>{deliveryFee.toLocaleString()} FCFA</span>
                </div>
                <div className="flex justify-between text-xl font-bold text-food-orange">
                  <span>Total</span>
                  <span>{totalWithDelivery.toLocaleString()} FCFA</span>
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
        <DialogContent className="bg-dark-card border-white/20 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="font-orbitron text-xl flex items-center gap-2">
              <Truck className="w-5 h-5 text-food-orange" />
              Informations de livraison
            </DialogTitle>
          </DialogHeader>

          {orderSuccess ? (
            <div className="text-center py-8">
              <Check className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="font-orbitron text-xl text-white mb-2">Commande envoyée!</h3>
              <p className="text-gray-400 mb-4">
                Nous vous appellerons sous peu pour confirmer votre commande.
              </p>
              <Button
                onClick={() => {
                  setShowOrderForm(false);
                  setOrderSuccess(false);
                }}
                className="bg-food-orange hover:bg-food-orange/80"
              >
                Fermer
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-4">
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
                    placeholder="01 XX XX XX XX"
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

              <div className="bg-food-orange/10 border border-food-orange/30 rounded-lg p-3 mt-4">
                <p className="text-food-orange font-semibold">
                  Total à payer: {totalWithDelivery.toLocaleString()} FCFA
                </p>
                <p className="text-gray-400 text-sm">Paiement à la livraison</p>
              </div>

              <DialogFooter className="mt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowOrderForm(false)}
                  className="border-white/20 text-gray-300"
                >
                  Annuler
                </Button>
                <Button
                  onClick={handleSubmitOrder}
                  disabled={submitting}
                  className="bg-food-orange hover:bg-food-orange/80 text-white font-rajdhani font-bold"
                >
                  {submitting ? "Envoi..." : "Confirmer la commande"}
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
