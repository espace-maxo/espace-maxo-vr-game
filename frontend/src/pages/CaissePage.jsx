import { useState, useEffect } from "react";
import axios from "axios";
import { 
  Receipt, Plus, Minus, Trash2, Printer, Save, Search,
  Gamepad2, Wine, TreePine, Calculator, Clock, User,
  CreditCard, Wallet, CheckCircle, X, Eye, Download,
  BarChart3, TrendingUp, Calendar, Filter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Predefined items by department
const CATALOG = {
  jeux: [
    { id: "vr360", name: "VR 360°", price: 2000, unit: "partie" },
    { id: "simulateur", name: "Simulateur Course", price: 1500, unit: "partie" },
  ],
  bar: [
    { id: "coca", name: "Coca-Cola", price: 500, unit: "bouteille" },
    { id: "fanta", name: "Fanta", price: 500, unit: "bouteille" },
    { id: "sprite", name: "Sprite", price: 500, unit: "bouteille" },
    { id: "eau", name: "Eau minérale", price: 300, unit: "bouteille" },
    { id: "jus_orange", name: "Jus d'orange", price: 800, unit: "verre" },
    { id: "jus_ananas", name: "Jus d'ananas", price: 800, unit: "verre" },
    { id: "biere_locale", name: "Bière locale", price: 800, unit: "bouteille" },
    { id: "biere_import", name: "Bière importée", price: 1500, unit: "bouteille" },
    { id: "cafe", name: "Café", price: 500, unit: "tasse" },
    { id: "the", name: "Thé", price: 400, unit: "tasse" },
  ],
  jardin: [
    { id: "table_jardin", name: "Table jardin (1h)", price: 2000, unit: "heure" },
    { id: "parasol", name: "Parasol", price: 500, unit: "unité" },
    { id: "chaise_longue", name: "Chaise longue", price: 1000, unit: "heure" },
    { id: "espace_prive", name: "Espace privé (2h)", price: 5000, unit: "réservation" },
  ]
};

const DEPARTMENT_CONFIG = {
  jeux: { label: "Salle de Jeux", icon: Gamepad2, color: "text-neon-blue", bgColor: "bg-neon-blue/10", borderColor: "border-neon-blue/30" },
  bar: { label: "Bar", icon: Wine, color: "text-food-orange", bgColor: "bg-food-orange/10", borderColor: "border-food-orange/30" },
  jardin: { label: "Jardin", icon: TreePine, color: "text-green-400", bgColor: "bg-green-400/10", borderColor: "border-green-400/30" }
};

const CaissePage = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState("caisse");
  const [activeDepartment, setActiveDepartment] = useState("jeux");
  
  // Current bill
  const [currentBill, setCurrentBill] = useState([]);
  const [customerName, setCustomerName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [discount, setDiscount] = useState(0);
  
  // History
  const [invoices, setInvoices] = useState([]);
  const [stats, setStats] = useState(null);
  const [filterDate, setFilterDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [viewInvoice, setViewInvoice] = useState(null);
  
  // Custom item
  const [showCustomItem, setShowCustomItem] = useState(false);
  const [customItem, setCustomItem] = useState({ name: "", price: 0, department: "bar" });

  const formatPrice = (price) => new Intl.NumberFormat('fr-FR').format(price);

  // Authentication
  const handleLogin = () => {
    if (password === "Esp@ceM@xo2026" || password === "Caisse2026") {
      setIsAuthenticated(true);
      toast.success("Connexion réussie");
      fetchData();
    } else {
      toast.error("Mot de passe incorrect");
    }
  };

  const fetchData = async () => {
    try {
      const [invoicesRes, statsRes] = await Promise.all([
        axios.get(`${API}/invoices`, { params: { date: filterDate } }),
        axios.get(`${API}/invoices/stats`, { params: { date: filterDate } })
      ]);
      setInvoices(invoicesRes.data.invoices || []);
      setStats(statsRes.data);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [filterDate, isAuthenticated]);

  // Bill management
  const addToBill = (item, department) => {
    const existingIndex = currentBill.findIndex(i => i.id === item.id && i.department === department);
    if (existingIndex >= 0) {
      const updated = [...currentBill];
      updated[existingIndex].quantity += 1;
      setCurrentBill(updated);
    } else {
      setCurrentBill([...currentBill, { ...item, department, quantity: 1 }]);
    }
    toast.success(`${item.name} ajouté`);
  };

  const updateQuantity = (index, delta) => {
    const updated = [...currentBill];
    updated[index].quantity += delta;
    if (updated[index].quantity <= 0) {
      updated.splice(index, 1);
    }
    setCurrentBill(updated);
  };

  const removeItem = (index) => {
    const updated = [...currentBill];
    updated.splice(index, 1);
    setCurrentBill(updated);
  };

  const addCustomItem = () => {
    if (!customItem.name || customItem.price <= 0) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }
    const newItem = {
      id: `custom_${Date.now()}`,
      name: customItem.name,
      price: customItem.price,
      department: customItem.department,
      quantity: 1,
      unit: "unité"
    };
    setCurrentBill([...currentBill, newItem]);
    setShowCustomItem(false);
    setCustomItem({ name: "", price: 0, department: "bar" });
    toast.success("Article personnalisé ajouté");
  };

  // Calculate totals
  const subtotal = currentBill.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discountAmount = (subtotal * discount) / 100;
  const total = subtotal - discountAmount;

  const totalByDepartment = {
    jeux: currentBill.filter(i => i.department === "jeux").reduce((sum, i) => sum + (i.price * i.quantity), 0),
    bar: currentBill.filter(i => i.department === "bar").reduce((sum, i) => sum + (i.price * i.quantity), 0),
    jardin: currentBill.filter(i => i.department === "jardin").reduce((sum, i) => sum + (i.price * i.quantity), 0)
  };

  // Save invoice
  const saveInvoice = async () => {
    if (currentBill.length === 0) {
      toast.error("La facture est vide");
      return;
    }

    try {
      const invoiceData = {
        customer_name: customerName || "Client",
        items: currentBill,
        subtotal,
        discount,
        discount_amount: discountAmount,
        total,
        payment_method: paymentMethod,
        totals_by_department: totalByDepartment
      };

      await axios.post(`${API}/invoices`, invoiceData);
      toast.success("Facture enregistrée !");
      
      // Reset
      setCurrentBill([]);
      setCustomerName("");
      setDiscount(0);
      fetchData();
    } catch (error) {
      console.error("Error saving invoice:", error);
      toast.error("Erreur lors de l'enregistrement");
    }
  };

  // Print invoice
  const printInvoice = () => {
    const printWindow = window.open('', '_blank');
    const itemsHtml = currentBill.map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${formatPrice(item.price)} F</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${formatPrice(item.price * item.quantity)} F</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Facture Espace Maxo</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; max-width: 400px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h1 { margin: 0; font-size: 24px; }
            .header p { margin: 5px 0; color: #666; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th { background: #f5f5f5; padding: 8px; text-align: left; }
            .totals { margin-top: 20px; }
            .totals div { display: flex; justify-content: space-between; padding: 5px 0; }
            .grand-total { font-size: 18px; font-weight: bold; border-top: 2px solid #000; padding-top: 10px; }
            .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>ESPACE MAXO</h1>
            <p>Restaurant & Centre de Jeux VR</p>
            <p>Fidjrossè Plage, Cotonou</p>
            <p>Tél: 01 41 47 00 00</p>
            <hr>
            <p><strong>Date:</strong> ${format(new Date(), "dd/MM/yyyy HH:mm")}</p>
            <p><strong>Client:</strong> ${customerName || "Client"}</p>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Article</th>
                <th style="text-align: center;">Qté</th>
                <th style="text-align: right;">P.U.</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          
          <div class="totals">
            <div><span>Sous-total:</span><span>${formatPrice(subtotal)} FCFA</span></div>
            ${discount > 0 ? `<div><span>Remise (${discount}%):</span><span>-${formatPrice(discountAmount)} FCFA</span></div>` : ''}
            <div class="grand-total"><span>TOTAL:</span><span>${formatPrice(total)} FCFA</span></div>
            <div><span>Paiement:</span><span>${paymentMethod === 'cash' ? 'Espèces' : paymentMethod === 'mobile' ? 'Mobile Money' : 'Carte'}</span></div>
          </div>
          
          <div class="footer">
            <p>Merci de votre visite !</p>
            <p>À bientôt chez Espace Maxo</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4" data-testid="caisse-login">
        <Card className="bg-gray-800/50 border-food-gold/30 w-full max-w-md backdrop-blur-sm">
          <CardHeader className="text-center pb-2">
            <div className="w-20 h-20 bg-food-gold/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Receipt className="w-10 h-10 text-food-gold" />
            </div>
            <CardTitle className="font-orbitron text-3xl text-food-gold">CAISSE</CardTitle>
            <p className="text-xl text-white font-semibold">Espace Maxo</p>
            <p className="text-gray-400 text-sm">Logiciel de facturation</p>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label className="text-gray-300">Mot de passe</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                className="bg-gray-700/50 border-gray-600 text-white text-lg py-6"
                placeholder="Entrez le mot de passe"
              />
            </div>
            <Button onClick={handleLogin} className="w-full bg-food-gold hover:bg-food-gold/80 text-black font-bold py-6 text-lg">
              Accéder à la Caisse
            </Button>
            <p className="text-center text-gray-500 text-xs mt-4">
              Version 1.0 - Espace Maxo
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900" data-testid="caisse-page">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Receipt className="w-10 h-10 text-food-gold" />
            <div>
              <h1 className="font-orbitron text-2xl text-white">Caisse Espace Maxo</h1>
              <p className="text-gray-400">{format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}</p>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-dark-card border border-white/10 mb-6">
            <TabsTrigger value="caisse" className="data-[state=active]:bg-food-gold data-[state=active]:text-black font-rajdhani font-bold">
              <Calculator className="w-4 h-4 mr-2" />
              Caisse
            </TabsTrigger>
            <TabsTrigger value="historique" className="data-[state=active]:bg-neon-blue data-[state=active]:text-black font-rajdhani font-bold">
              <Clock className="w-4 h-4 mr-2" />
              Historique
            </TabsTrigger>
            <TabsTrigger value="stats" className="data-[state=active]:bg-green-500 data-[state=active]:text-black font-rajdhani font-bold">
              <BarChart3 className="w-4 h-4 mr-2" />
              Statistiques
            </TabsTrigger>
          </TabsList>

          {/* CAISSE TAB */}
          <TabsContent value="caisse">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Catalog */}
              <div className="lg:col-span-2 space-y-4">
                {/* Department tabs */}
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(DEPARTMENT_CONFIG).map(([key, config]) => {
                    const Icon = config.icon;
                    return (
                      <Button
                        key={key}
                        variant={activeDepartment === key ? "default" : "outline"}
                        onClick={() => setActiveDepartment(key)}
                        className={activeDepartment === key 
                          ? `${config.bgColor} ${config.color} border ${config.borderColor}` 
                          : "border-white/20 text-gray-300"
                        }
                      >
                        <Icon className="w-4 h-4 mr-2" />
                        {config.label}
                      </Button>
                    );
                  })}
                  <Button
                    variant="outline"
                    onClick={() => setShowCustomItem(true)}
                    className="border-white/20 text-gray-300"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Article personnalisé
                  </Button>
                </div>

                {/* Items grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {CATALOG[activeDepartment].map((item) => {
                    const config = DEPARTMENT_CONFIG[activeDepartment];
                    return (
                      <button
                        key={item.id}
                        onClick={() => addToBill(item, activeDepartment)}
                        className={`p-4 rounded-lg ${config.bgColor} border ${config.borderColor} hover:scale-105 transition-transform text-left`}
                      >
                        <p className={`font-semibold ${config.color}`}>{item.name}</p>
                        <p className="text-white font-bold">{formatPrice(item.price)} F</p>
                        <p className="text-gray-500 text-xs">/{item.unit}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right: Current Bill */}
              <div className="lg:col-span-1">
                <Card className="bg-dark-card border-food-gold/30 sticky top-24">
                  <CardHeader className="border-b border-white/10">
                    <CardTitle className="font-orbitron text-food-gold flex items-center gap-2">
                      <Receipt className="w-5 h-5" />
                      Facture en cours
                    </CardTitle>
                    <Input
                      placeholder="Nom du client (optionnel)"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="bg-surface-highlight border-white/20 text-white mt-2"
                    />
                  </CardHeader>
                  <CardContent className="p-4">
                    {currentBill.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">Aucun article</p>
                    ) : (
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {currentBill.map((item, index) => {
                          const config = DEPARTMENT_CONFIG[item.department];
                          return (
                            <div key={index} className="flex items-center justify-between bg-surface-highlight rounded-lg p-2">
                              <div className="flex-1">
                                <p className="text-white text-sm font-medium">{item.name}</p>
                                <p className={`text-xs ${config.color}`}>{config.label}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button size="icon" variant="ghost" onClick={() => updateQuantity(index, -1)} className="w-6 h-6">
                                  <Minus className="w-3 h-3" />
                                </Button>
                                <span className="text-white w-6 text-center">{item.quantity}</span>
                                <Button size="icon" variant="ghost" onClick={() => updateQuantity(index, 1)} className="w-6 h-6">
                                  <Plus className="w-3 h-3" />
                                </Button>
                                <span className="text-food-gold font-bold text-sm w-16 text-right">
                                  {formatPrice(item.price * item.quantity)}
                                </span>
                                <Button size="icon" variant="ghost" onClick={() => removeItem(index)} className="w-6 h-6 text-red-400">
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Totals by department */}
                    {currentBill.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-white/10 space-y-1">
                        {Object.entries(totalByDepartment).map(([dept, amount]) => {
                          if (amount === 0) return null;
                          const config = DEPARTMENT_CONFIG[dept];
                          return (
                            <div key={dept} className="flex justify-between text-sm">
                              <span className={config.color}>{config.label}</span>
                              <span className="text-white">{formatPrice(amount)} F</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Discount */}
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <div className="flex items-center gap-2 mb-2">
                        <Label className="text-gray-300 text-sm">Remise (%)</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={discount}
                          onChange={(e) => setDiscount(parseInt(e.target.value) || 0)}
                          className="w-20 bg-surface-highlight border-white/20 text-white text-sm"
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Sous-total</span>
                          <span className="text-white">{formatPrice(subtotal)} F</span>
                        </div>
                        {discount > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">Remise ({discount}%)</span>
                            <span className="text-green-400">-{formatPrice(discountAmount)} F</span>
                          </div>
                        )}
                        <div className="flex justify-between text-xl font-bold pt-2 border-t border-white/10">
                          <span className="text-white">TOTAL</span>
                          <span className="text-food-gold">{formatPrice(total)} FCFA</span>
                        </div>
                      </div>
                    </div>

                    {/* Payment method */}
                    <div className="mt-4 space-y-2">
                      <Label className="text-gray-300 text-sm">Mode de paiement</Label>
                      <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                        <SelectTrigger className="bg-surface-highlight border-white/20 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-dark-card border-white/20">
                          <SelectItem value="cash" className="text-white">Espèces</SelectItem>
                          <SelectItem value="mobile" className="text-white">Mobile Money</SelectItem>
                          <SelectItem value="card" className="text-white">Carte bancaire</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Actions */}
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Button onClick={printInvoice} variant="outline" className="border-white/20" disabled={currentBill.length === 0}>
                        <Printer className="w-4 h-4 mr-2" />
                        Imprimer
                      </Button>
                      <Button onClick={saveInvoice} className="bg-food-gold hover:bg-food-gold/80 text-black font-bold" disabled={currentBill.length === 0}>
                        <Save className="w-4 h-4 mr-2" />
                        Enregistrer
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* HISTORIQUE TAB */}
          <TabsContent value="historique">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-gray-400" />
                  <Input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="bg-surface-highlight border-white/20 text-white w-auto"
                  />
                </div>
                <Badge className="bg-neon-blue/20 text-neon-blue">
                  {invoices.length} facture{invoices.length > 1 ? 's' : ''}
                </Badge>
              </div>

              {invoices.length === 0 ? (
                <div className="text-center py-12 bg-dark-card rounded-lg border border-white/10">
                  <Receipt className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">Aucune facture pour cette date</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {invoices.map((invoice) => (
                    <Card key={invoice.id} className="bg-dark-card border-white/10">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-3 mb-1">
                              <span className="font-orbitron text-white">#{invoice.invoice_number}</span>
                              <Badge className="bg-food-gold/20 text-food-gold">{formatPrice(invoice.total)} FCFA</Badge>
                            </div>
                            <p className="text-gray-400 text-sm">
                              {invoice.customer_name} • {format(new Date(invoice.created_at), "HH:mm")}
                            </p>
                            <div className="flex gap-2 mt-2">
                              {invoice.totals_by_department?.jeux > 0 && (
                                <Badge className="bg-neon-blue/20 text-neon-blue text-xs">
                                  Jeux: {formatPrice(invoice.totals_by_department.jeux)}
                                </Badge>
                              )}
                              {invoice.totals_by_department?.bar > 0 && (
                                <Badge className="bg-food-orange/20 text-food-orange text-xs">
                                  Bar: {formatPrice(invoice.totals_by_department.bar)}
                                </Badge>
                              )}
                              {invoice.totals_by_department?.jardin > 0 && (
                                <Badge className="bg-green-400/20 text-green-400 text-xs">
                                  Jardin: {formatPrice(invoice.totals_by_department.jardin)}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => setViewInvoice(invoice)} className="border-white/20">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* STATS TAB */}
          <TabsContent value="stats">
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <Calendar className="w-5 h-5 text-gray-400" />
                <Input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="bg-surface-highlight border-white/20 text-white w-auto"
                />
              </div>

              {stats && (
                <>
                  {/* Summary cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card className="bg-dark-card border-food-gold/30">
                      <CardContent className="p-4 text-center">
                        <TrendingUp className="w-8 h-8 text-food-gold mx-auto mb-2" />
                        <p className="text-gray-400 text-sm">Chiffre d'affaires</p>
                        <p className="font-orbitron text-2xl text-food-gold">{formatPrice(stats.total_revenue)} F</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-dark-card border-neon-blue/30">
                      <CardContent className="p-4 text-center">
                        <Gamepad2 className="w-8 h-8 text-neon-blue mx-auto mb-2" />
                        <p className="text-gray-400 text-sm">Salle de Jeux</p>
                        <p className="font-orbitron text-2xl text-neon-blue">{formatPrice(stats.by_department?.jeux || 0)} F</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-dark-card border-food-orange/30">
                      <CardContent className="p-4 text-center">
                        <Wine className="w-8 h-8 text-food-orange mx-auto mb-2" />
                        <p className="text-gray-400 text-sm">Bar</p>
                        <p className="font-orbitron text-2xl text-food-orange">{formatPrice(stats.by_department?.bar || 0)} F</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-dark-card border-green-400/30">
                      <CardContent className="p-4 text-center">
                        <TreePine className="w-8 h-8 text-green-400 mx-auto mb-2" />
                        <p className="text-gray-400 text-sm">Jardin</p>
                        <p className="font-orbitron text-2xl text-green-400">{formatPrice(stats.by_department?.jardin || 0)} F</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Additional stats */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-dark-card border-white/10">
                      <CardContent className="p-4">
                        <p className="text-gray-400 text-sm">Nombre de factures</p>
                        <p className="font-orbitron text-3xl text-white">{stats.invoice_count}</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-dark-card border-white/10">
                      <CardContent className="p-4">
                        <p className="text-gray-400 text-sm">Panier moyen</p>
                        <p className="font-orbitron text-3xl text-white">{formatPrice(stats.average_ticket || 0)} F</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-dark-card border-white/10">
                      <CardContent className="p-4">
                        <p className="text-gray-400 text-sm">Remises accordées</p>
                        <p className="font-orbitron text-3xl text-white">{formatPrice(stats.total_discounts || 0)} F</p>
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Custom Item Dialog */}
      <Dialog open={showCustomItem} onOpenChange={setShowCustomItem}>
        <DialogContent className="bg-dark-card border-white/20 text-white">
          <DialogHeader>
            <DialogTitle className="font-orbitron">Article personnalisé</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-gray-300">Nom de l'article</Label>
              <Input
                value={customItem.name}
                onChange={(e) => setCustomItem({ ...customItem, name: e.target.value })}
                className="bg-surface-highlight border-white/20 text-white"
                placeholder="Ex: Service spécial"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Prix (FCFA)</Label>
              <Input
                type="number"
                value={customItem.price}
                onChange={(e) => setCustomItem({ ...customItem, price: parseInt(e.target.value) || 0 })}
                className="bg-surface-highlight border-white/20 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Département</Label>
              <Select value={customItem.department} onValueChange={(v) => setCustomItem({ ...customItem, department: v })}>
                <SelectTrigger className="bg-surface-highlight border-white/20 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-dark-card border-white/20">
                  <SelectItem value="jeux" className="text-white">Salle de Jeux</SelectItem>
                  <SelectItem value="bar" className="text-white">Bar</SelectItem>
                  <SelectItem value="jardin" className="text-white">Jardin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addCustomItem} className="w-full bg-food-gold hover:bg-food-gold/80 text-black font-bold">
              Ajouter
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Invoice Dialog */}
      <Dialog open={!!viewInvoice} onOpenChange={() => setViewInvoice(null)}>
        <DialogContent className="bg-dark-card border-white/20 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="font-orbitron">Facture #{viewInvoice?.invoice_number}</DialogTitle>
          </DialogHeader>
          {viewInvoice && (
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Client</span>
                <span className="text-white">{viewInvoice.customer_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Date</span>
                <span className="text-white">{format(new Date(viewInvoice.created_at), "dd/MM/yyyy HH:mm")}</span>
              </div>
              
              <div className="border-t border-white/10 pt-4">
                <p className="text-gray-400 text-sm mb-2">Articles</p>
                {viewInvoice.items?.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm py-1">
                    <span className="text-white">{item.name} x{item.quantity}</span>
                    <span className="text-food-gold">{formatPrice(item.price * item.quantity)} F</span>
                  </div>
                ))}
              </div>
              
              <div className="border-t border-white/10 pt-4 space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-400">Sous-total</span>
                  <span className="text-white">{formatPrice(viewInvoice.subtotal)} F</span>
                </div>
                {viewInvoice.discount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Remise ({viewInvoice.discount}%)</span>
                    <span className="text-green-400">-{formatPrice(viewInvoice.discount_amount)} F</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-white/10">
                  <span className="text-white">TOTAL</span>
                  <span className="text-food-gold">{formatPrice(viewInvoice.total)} FCFA</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CaissePage;
