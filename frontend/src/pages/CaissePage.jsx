import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { 
  Receipt, Plus, Minus, Trash2, Printer, Save, Search,
  Gamepad2, Wine, TreePine, Calculator, Clock, User,
  CreditCard, Wallet, CheckCircle, X, Eye, Download,
  BarChart3, TrendingUp, Calendar, Filter, Users, Package,
  Edit2, Settings, LogOut, FileText, ChevronLeft, ChevronRight,
  DollarSign, Banknote, Smartphone, ChevronsUpDown, UserPlus
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
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { fr } from "date-fns/locale";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Default catalog items
const DEFAULT_CATALOG = {
  salle_jardin: [
    { id: "table_jardin", name: "Table jardin (1h)", price: 2000, unit: "heure", category: "Mobilier" },
    { id: "parasol", name: "Parasol", price: 500, unit: "unité", category: "Mobilier" },
    { id: "chaise_longue", name: "Chaise longue", price: 1000, unit: "heure", category: "Mobilier" },
    { id: "espace_prive", name: "Espace privé (2h)", price: 5000, unit: "réservation", category: "Réservation" },
  ],
  jeux: [
    { id: "vr360", name: "VR 360°", price: 2000, unit: "partie", category: "Jeux VR" },
    { id: "simulateur", name: "Simulateur Course", price: 1500, unit: "partie", category: "Simulateur" },
  ],
  bar: [
    { id: "coca", name: "Coca-Cola", price: 500, unit: "bouteille", category: "Sodas" },
    { id: "fanta", name: "Fanta", price: 500, unit: "bouteille", category: "Sodas" },
    { id: "sprite", name: "Sprite", price: 500, unit: "bouteille", category: "Sodas" },
    { id: "eau", name: "Eau minérale", price: 300, unit: "bouteille", category: "Boissons" },
    { id: "jus_orange", name: "Jus d'orange", price: 800, unit: "verre", category: "Jus" },
    { id: "jus_ananas", name: "Jus d'ananas", price: 800, unit: "verre", category: "Jus" },
    { id: "biere_locale", name: "Bière locale", price: 800, unit: "bouteille", category: "Bières" },
    { id: "biere_import", name: "Bière importée", price: 1500, unit: "bouteille", category: "Bières" },
    { id: "cafe", name: "Café", price: 500, unit: "tasse", category: "Chaud" },
    { id: "the", name: "Thé", price: 400, unit: "tasse", category: "Chaud" },
  ],
  location: [
    { id: "salle_complete", name: "Location salle complète", price: 50000, unit: "journée", category: "Location" },
    { id: "salle_demi", name: "Location demi-journée", price: 30000, unit: "demi-journée", category: "Location" },
    { id: "espace_vip", name: "Espace VIP", price: 25000, unit: "soirée", category: "Location" },
  ],
  autres: []
};

const DEPARTMENT_CONFIG = {
  salle_jardin: { label: "Salle & Jardin", icon: TreePine, color: "text-green-400", bgColor: "bg-green-500/10", borderColor: "border-green-500/30" },
  jeux: { label: "Jeux", icon: Gamepad2, color: "text-blue-400", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/30" },
  bar: { label: "Bar", icon: Wine, color: "text-orange-400", bgColor: "bg-orange-500/10", borderColor: "border-orange-500/30" },
  location: { label: "Location", icon: Calendar, color: "text-purple-400", bgColor: "bg-purple-500/10", borderColor: "border-purple-500/30" },
  autres: { label: "Autres", icon: Package, color: "text-slate-400", bgColor: "bg-slate-500/10", borderColor: "border-slate-500/30" }
};

const PAYMENT_METHODS = [
  { value: "cash", label: "Espèces", icon: Banknote },
  { value: "card", label: "Carte bancaire", icon: CreditCard },
  { value: "mobile", label: "Mobile Money", icon: Smartphone },
  { value: "check", label: "Chèque", icon: FileText },
];

const CaissePage = () => {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ pin: "", password: "" });
  const [loginMode, setLoginMode] = useState("pin"); // pin or admin
  
  // Main state
  const [activeTab, setActiveTab] = useState("caisse");
  const [activeDepartment, setActiveDepartment] = useState("salle_jardin");
  
  // Catalog/Products
  const [products, setProducts] = useState([]);
  const [catalog, setCatalog] = useState(DEFAULT_CATALOG);
  
  // Current bill
  const [currentBill, setCurrentBill] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState("");
  
  // Custom item form (for "Autres" department)
  const [customItem, setCustomItem] = useState({ name: "", price: 0 });
  
  // Data
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [monthlyStats, setMonthlyStats] = useState(null);
  
  // Filters
  const [filterDate, setFilterDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [filterMonth, setFilterMonth] = useState(format(new Date(), "yyyy-MM"));
  const [filterValidation, setFilterValidation] = useState("all"); // all, pending, validated
  
  // Modals
  const [viewInvoice, setViewInvoice] = useState(null);
  const [editInvoice, setEditInvoice] = useState(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [editClient, setEditClient] = useState(null);
  const [editUser, setEditUser] = useState(null);
  
  // Forms
  const [productForm, setProductForm] = useState({ name: "", price: 0, department: "bar", unit: "unité", category: "" });
  const [clientForm, setClientForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [userForm, setUserForm] = useState({ username: "", email: "", password: "", pin: "", role: "server", full_name: "" });

  const formatPrice = (price) => new Intl.NumberFormat('fr-FR').format(price);

  // ============== AUTH ==============
  const handleLogin = async () => {
    try {
      const response = await axios.post(`${API}/caisse/login`, loginForm);
      if (response.data.success) {
        setIsAuthenticated(true);
        setCurrentUser(response.data.user);
        toast.success(`Bienvenue ${response.data.user.full_name || response.data.user.username}`);
        fetchAllData();
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Identifiants incorrects");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setCurrentBill([]);
  };

  // ============== DATA FETCHING ==============
  const fetchAllData = async () => {
    try {
      // Build query params for invoices based on user role
      const invoiceParams = { date: filterDate };
      if (currentUser?.role === 'server') {
        invoiceParams.role = 'server';
        invoiceParams.created_by = currentUser?.full_name || currentUser?.username;
      }

      const [invoicesRes, clientsRes, usersRes, productsRes, statsRes] = await Promise.all([
        axios.get(`${API}/invoices`, { params: invoiceParams }),
        axios.get(`${API}/caisse/clients`),
        axios.get(`${API}/caisse/users`),
        axios.get(`${API}/caisse/products`),
        axios.get(`${API}/invoices/stats`, { params: { date: filterDate } })
      ]);
      
      setInvoices(invoicesRes.data.invoices || []);
      setClients(clientsRes.data.clients || []);
      setUsers(usersRes.data.users || []);
      setStats(statsRes.data);
      
      // Merge custom products with default catalog
      const customProducts = productsRes.data.products || [];
      if (customProducts.length > 0) {
        const newCatalog = { ...DEFAULT_CATALOG };
        customProducts.forEach(p => {
          if (!newCatalog[p.department]) newCatalog[p.department] = [];
          newCatalog[p.department].push(p);
        });
        setCatalog(newCatalog);
      }
      setProducts(customProducts);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  const fetchMonthlyStats = async () => {
    try {
      const [year, month] = filterMonth.split("-");
      const response = await axios.get(`${API}/invoices/stats/monthly`, {
        params: { year: parseInt(year), month: parseInt(month) }
      });
      setMonthlyStats(response.data);
    } catch (error) {
      console.error("Error fetching monthly stats:", error);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchAllData();
    }
  }, [filterDate, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && activeTab === "stats") {
      fetchMonthlyStats();
    }
  }, [filterMonth, activeTab, isAuthenticated]);

  // ============== BILL MANAGEMENT ==============
  const addToBill = (item, department) => {
    const existingIndex = currentBill.findIndex(i => i.id === item.id && i.department === department);
    if (existingIndex >= 0) {
      const updated = [...currentBill];
      updated[existingIndex].quantity += 1;
      setCurrentBill(updated);
    } else {
      setCurrentBill([...currentBill, { ...item, department, quantity: 1 }]);
    }
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

  const clearBill = () => {
    setCurrentBill([]);
    setSelectedClient(null);
    setDiscount(0);
    setNotes("");
  };

  // Calculate totals
  const subtotal = currentBill.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discountAmount = (subtotal * discount) / 100;
  const total = subtotal - discountAmount;

  const totalByDepartment = {
    salle_jardin: currentBill.filter(i => i.department === "salle_jardin").reduce((sum, i) => sum + (i.price * i.quantity), 0),
    jeux: currentBill.filter(i => i.department === "jeux").reduce((sum, i) => sum + (i.price * i.quantity), 0),
    bar: currentBill.filter(i => i.department === "bar").reduce((sum, i) => sum + (i.price * i.quantity), 0),
    location: currentBill.filter(i => i.department === "location").reduce((sum, i) => sum + (i.price * i.quantity), 0),
    autres: currentBill.filter(i => i.department === "autres").reduce((sum, i) => sum + (i.price * i.quantity), 0)
  };

  // Add custom item to bill (for "Autres" department)
  const addCustomItem = () => {
    if (!customItem.name || customItem.price <= 0) {
      toast.error("Veuillez saisir un nom et un prix valide");
      return;
    }
    const newItem = {
      id: `custom-${Date.now()}`,
      name: customItem.name,
      price: customItem.price,
      unit: "unité",
      department: "autres",
      quantity: 1
    };
    setCurrentBill([...currentBill, newItem]);
    setCustomItem({ name: "", price: 0 });
    toast.success(`${customItem.name} ajouté`);
  };

  // ============== INVOICE ACTIONS ==============
  const saveInvoice = async () => {
    if (currentBill.length === 0) {
      toast.error("La facture est vide");
      return;
    }

    try {
      const invoiceData = {
        customer_name: selectedClient?.name || "Client",
        customer_phone: selectedClient?.phone || "",
        items: currentBill,
        subtotal,
        discount,
        discount_amount: discountAmount,
        total,
        payment_method: paymentMethod,
        totals_by_department: totalByDepartment,
        notes,
        created_by: currentUser?.full_name || currentUser?.username || "admin",
        validation_status: "pending" // New: needs manager validation
      };

      await axios.post(`${API}/invoices`, invoiceData);
      
      // Update client stats if selected
      if (selectedClient) {
        await axios.put(`${API}/caisse/clients/${selectedClient.id}`, {
          total_spent: (selectedClient.total_spent || 0) + total,
          visit_count: (selectedClient.visit_count || 0) + 1
        });
      }
      
      toast.success("Facture enregistrée !");
      clearBill();
      fetchAllData();
    } catch (error) {
      console.error("Error saving invoice:", error);
      toast.error("Erreur lors de l'enregistrement");
    }
  };

  const validateInvoice = async (invoiceId) => {
    try {
      await axios.put(`${API}/invoices/${invoiceId}`, {
        validation_status: "validated",
        validated_by: currentUser?.full_name || currentUser?.username || "Gérante",
        validated_at: new Date().toISOString()
      });
      toast.success("Facture validée !");
      fetchAllData();
    } catch (error) {
      console.error("Error validating invoice:", error);
      toast.error("Erreur lors de la validation");
    }
  };

  const deleteInvoice = async (invoiceId) => {
    if (!confirm("Supprimer cette facture ?")) return;
    try {
      await axios.delete(`${API}/invoices/${invoiceId}`);
      toast.success("Facture supprimée");
      fetchAllData();
    } catch (error) {
      toast.error("Erreur lors de la suppression");
    }
  };

  // ============== TICKET THERMIQUE (80mm) ==============
  const printTicket = (invoice) => {
    const printWindow = window.open('', '_blank', 'width=300,height=600');
    const itemsHtml = (invoice.items || []).map(item => `
      <tr>
        <td style="padding: 2px 0; font-size: 11px;">${item.name}</td>
        <td style="padding: 2px 0; text-align: center; font-size: 11px;">${item.quantity}</td>
        <td style="padding: 2px 0; text-align: right; font-size: 11px;">${formatPrice(item.price * item.quantity)}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Ticket ${invoice.invoice_number}</title>
          <style>
            @page { size: 80mm auto; margin: 0; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Courier New', monospace; 
              width: 80mm; 
              padding: 5mm; 
              font-size: 12px;
              line-height: 1.3;
            }
            .header { text-align: center; margin-bottom: 8px; border-bottom: 1px dashed #000; padding-bottom: 8px; }
            .header h1 { font-size: 16px; font-weight: bold; }
            .header p { font-size: 10px; }
            .info { margin: 8px 0; font-size: 11px; }
            .info div { display: flex; justify-content: space-between; }
            table { width: 100%; border-collapse: collapse; margin: 8px 0; }
            th { text-align: left; font-size: 10px; border-bottom: 1px solid #000; padding: 2px 0; }
            .totals { border-top: 1px dashed #000; margin-top: 8px; padding-top: 8px; }
            .totals div { display: flex; justify-content: space-between; font-size: 11px; margin: 2px 0; }
            .grand-total { font-size: 14px !important; font-weight: bold; border-top: 1px solid #000; padding-top: 5px; margin-top: 5px; }
            .footer { text-align: center; margin-top: 10px; font-size: 10px; border-top: 1px dashed #000; padding-top: 8px; }
            .server { font-size: 10px; margin-top: 5px; }
            .validation { font-size: 10px; margin-top: 3px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>ESPACE MAXO</h1>
            <p>Restaurant & Jeux VR</p>
            <p>Tel: 01 41 47 00 00</p>
          </div>
          
          <div class="info">
            <div><span>N°:</span><span><b>${invoice.invoice_number}</b></span></div>
            <div><span>Date:</span><span>${format(new Date(invoice.created_at), "dd/MM/yy HH:mm")}</span></div>
            <div><span>Client:</span><span>${invoice.customer_name}</span></div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th style="width: 50%;">Article</th>
                <th style="text-align: center;">Qté</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          
          <div class="totals">
            <div><span>Sous-total:</span><span>${formatPrice(invoice.subtotal)} F</span></div>
            ${invoice.discount > 0 ? `<div><span>Remise (${invoice.discount}%):</span><span>-${formatPrice(invoice.discount_amount)} F</span></div>` : ''}
            <div class="grand-total"><span>TOTAL:</span><span>${formatPrice(invoice.total)} FCFA</span></div>
            <div><span>Paiement:</span><span>${PAYMENT_METHODS.find(p => p.value === invoice.payment_method)?.label || invoice.payment_method}</span></div>
          </div>
          
          <div class="server">
            Serveur: ${invoice.created_by || '-'}
          </div>
          ${invoice.validation_status === 'validated' ? `
          <div class="validation">
            ✓ Validé par: ${invoice.validated_by || 'Gérante'}
          </div>
          ` : `
          <div class="validation" style="color: red;">
            ⏳ En attente de validation
          </div>
          `}
          
          <div class="footer">
            <p>Merci de votre visite !</p>
            <p>À bientôt chez Espace Maxo</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  };

  // Download PDF from backend
  const downloadPDF = async (invoice) => {
    if (!invoice.id || invoice.id === "PREVIEW") {
      toast.error("Veuillez d'abord enregistrer la facture");
      return;
    }
    try {
      const response = await axios.get(`${API}/invoices/${invoice.id}/pdf`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `facture_${invoice.invoice_number || invoice.id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("PDF téléchargé");
    } catch (error) {
      console.error("Error downloading PDF:", error);
      toast.error("Erreur lors du téléchargement du PDF");
    }
  };

  // ============== CRUD OPERATIONS ==============
  const saveProduct = async () => {
    try {
      if (editProduct) {
        await axios.put(`${API}/caisse/products/${editProduct.id}`, productForm);
        toast.success("Produit modifié");
      } else {
        await axios.post(`${API}/caisse/products`, productForm);
        toast.success("Produit ajouté");
      }
      setShowProductModal(false);
      setEditProduct(null);
      setProductForm({ name: "", price: 0, department: "bar", unit: "unité", category: "" });
      fetchAllData();
    } catch (error) {
      toast.error("Erreur");
    }
  };

  const deleteProduct = async (productId) => {
    if (!confirm("Supprimer ce produit ?")) return;
    try {
      await axios.delete(`${API}/caisse/products/${productId}`);
      toast.success("Produit supprimé");
      fetchAllData();
    } catch (error) {
      toast.error("Erreur");
    }
  };

  const saveClient = async () => {
    try {
      if (editClient) {
        await axios.put(`${API}/caisse/clients/${editClient.id}`, clientForm);
        toast.success("Client modifié");
      } else {
        await axios.post(`${API}/caisse/clients`, clientForm);
        toast.success("Client ajouté");
      }
      setShowClientModal(false);
      setEditClient(null);
      setClientForm({ name: "", phone: "", email: "", notes: "" });
      fetchAllData();
    } catch (error) {
      toast.error("Erreur");
    }
  };

  const deleteClient = async (clientId) => {
    if (!confirm("Supprimer ce client ?")) return;
    try {
      await axios.delete(`${API}/caisse/clients/${clientId}`);
      toast.success("Client supprimé");
      fetchAllData();
    } catch (error) {
      toast.error("Erreur");
    }
  };

  const saveUser = async () => {
    try {
      if (!userForm.username) {
        toast.error("Le nom d'utilisateur est requis");
        return;
      }
      if (!editUser && !userForm.pin) {
        toast.error("Le code PIN est requis");
        return;
      }
      if (userForm.pin && (userForm.pin.length < 4 || userForm.pin.length > 6)) {
        toast.error("Le code PIN doit contenir 4 à 6 chiffres");
        return;
      }
      
      if (editUser) {
        await axios.put(`${API}/caisse/users/${editUser.id}`, userForm);
        toast.success("Utilisateur modifié");
      } else {
        await axios.post(`${API}/caisse/users`, userForm);
        toast.success("Utilisateur créé");
      }
      setShowUserModal(false);
      setEditUser(null);
      setUserForm({ username: "", email: "", password: "", pin: "", role: "server", full_name: "" });
      fetchAllData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur");
    }
  };

  const deleteUser = async (userId) => {
    if (!confirm("Supprimer cet utilisateur ?")) return;
    try {
      await axios.delete(`${API}/caisse/users/${userId}`);
      toast.success("Utilisateur supprimé");
      fetchAllData();
    } catch (error) {
      toast.error("Erreur");
    }
  };

  // ============== RENDER LOGIN ==============
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <Card className="bg-slate-800/80 border-amber-500/30 w-full max-w-md backdrop-blur-sm shadow-2xl">
          <CardHeader className="text-center pb-2">
            <div className="w-24 h-24 bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Receipt className="w-12 h-12 text-white" />
            </div>
            <CardTitle className="text-3xl font-bold text-amber-500">CAISSE PRO</CardTitle>
            <p className="text-xl text-white font-semibold mt-1">Espace Maxo</p>
            <p className="text-slate-400 text-sm">Système de facturation</p>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            {/* Toggle between PIN and Admin login */}
            <div className="flex gap-2 mb-4">
              <Button 
                variant={loginMode === "pin" ? "default" : "outline"}
                onClick={() => setLoginMode("pin")}
                className={loginMode === "pin" ? "flex-1 bg-amber-500 hover:bg-amber-600" : "flex-1 border-slate-600 text-slate-400"}
              >
                Serveur (PIN)
              </Button>
              <Button 
                variant={loginMode === "admin" ? "default" : "outline"}
                onClick={() => setLoginMode("admin")}
                className={loginMode === "admin" ? "flex-1 bg-amber-500 hover:bg-amber-600" : "flex-1 border-slate-600 text-slate-400"}
              >
                Admin
              </Button>
            </div>

            {loginMode === "pin" ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Code PIN (4-6 chiffres)</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={loginForm.pin}
                    onChange={(e) => setLoginForm({ ...loginForm, pin: e.target.value.replace(/\D/g, '') })}
                    onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                    className="bg-slate-700/50 border-slate-600 text-white text-3xl py-8 text-center tracking-[0.5em] font-mono"
                    placeholder="••••••"
                  />
                </div>
                <p className="text-slate-500 text-xs text-center">Entrez votre code PIN personnel</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Mot de passe administrateur</Label>
                  <Input
                    type="password"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                    className="bg-slate-700/50 border-slate-600 text-white text-lg py-6"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            )}

            <Button onClick={handleLogin} className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold py-6 text-lg shadow-lg">
              Se connecter
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============== MAIN RENDER ==============
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-800/90 border-b border-slate-700 sticky top-0 z-50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg flex items-center justify-center">
                <Receipt className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-amber-500">CAISSE PRO</h1>
                <p className="text-slate-400 text-xs">{format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right hidden md:block">
                <p className="text-white font-medium">{currentUser?.full_name || currentUser?.username}</p>
                <Badge className={currentUser?.role === 'admin' ? 'bg-amber-500/20 text-amber-400' : currentUser?.role === 'manager' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-500/20 text-slate-400'}>
                  {currentUser?.role === 'admin' ? 'Administrateur' : currentUser?.role === 'manager' ? 'Manager' : 'Serveur'}
                </Badge>
              </div>
              <Button variant="ghost" onClick={handleLogout} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-slate-800/50 border border-slate-700 mb-4 flex-wrap h-auto p-1">
            <TabsTrigger value="caisse" className="data-[state=active]:bg-amber-500 data-[state=active]:text-white">
              <Calculator className="w-4 h-4 mr-2" />Caisse
            </TabsTrigger>
            <TabsTrigger value="invoices" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">
              <FileText className="w-4 h-4 mr-2" />Factures
            </TabsTrigger>
            <TabsTrigger value="stats" className="data-[state=active]:bg-green-500 data-[state=active]:text-white">
              <BarChart3 className="w-4 h-4 mr-2" />Statistiques
            </TabsTrigger>
            <TabsTrigger value="products" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
              <Package className="w-4 h-4 mr-2" />Produits
            </TabsTrigger>
            <TabsTrigger value="clients" className="data-[state=active]:bg-pink-500 data-[state=active]:text-white">
              <Users className="w-4 h-4 mr-2" />Clients
            </TabsTrigger>
            {currentUser?.role === 'admin' && (
              <TabsTrigger value="users" className="data-[state=active]:bg-red-500 data-[state=active]:text-white">
                <Settings className="w-4 h-4 mr-2" />Utilisateurs
              </TabsTrigger>
            )}
          </TabsList>

          {/* ==================== CAISSE TAB ==================== */}
          <TabsContent value="caisse">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Left: Products */}
              <div className="lg:col-span-2 space-y-4">
                {/* Department tabs */}
                <div className="flex gap-2 flex-wrap bg-slate-800/50 p-2 rounded-lg border border-slate-700">
                  {Object.entries(DEPARTMENT_CONFIG).map(([key, config]) => {
                    const Icon = config.icon;
                    return (
                      <Button
                        key={key}
                        variant={activeDepartment === key ? "default" : "ghost"}
                        onClick={() => setActiveDepartment(key)}
                        className={activeDepartment === key 
                          ? `bg-gradient-to-r ${key === 'jeux' ? 'from-blue-500 to-blue-600' : key === 'bar' ? 'from-orange-500 to-orange-600' : 'from-green-500 to-green-600'} text-white` 
                          : "text-slate-300 hover:text-white"
                        }
                      >
                        <Icon className="w-4 h-4 mr-2" />
                        {config.label}
                      </Button>
                    );
                  })}
                </div>

                {/* Products grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {(catalog[activeDepartment] || []).map((item) => {
                    const config = DEPARTMENT_CONFIG[activeDepartment];
                    return (
                      <button
                        key={`${activeDepartment}-${item.id}`}
                        onClick={() => addToBill(item, activeDepartment)}
                        className={`p-3 rounded-lg ${config.bgColor} border ${config.borderColor} hover:scale-[1.02] transition-all text-left`}
                      >
                        <p className={`font-semibold text-sm ${config.color}`}>{item.name}</p>
                        <p className="text-white font-bold">{formatPrice(item.price)} F</p>
                        <p className="text-slate-500 text-xs">/{item.unit}</p>
                      </button>
                    );
                  })}
                </div>
                
                {/* Custom item form for "Autres" department */}
                {activeDepartment === "autres" && (
                  <Card className="mt-4 bg-slate-700/30 border-slate-600">
                    <CardContent className="p-4">
                      <h4 className="text-slate-300 font-semibold mb-3">Saisie manuelle</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-slate-400 text-xs">Nom du produit</Label>
                          <Input
                            value={customItem.name}
                            onChange={(e) => setCustomItem({ ...customItem, name: e.target.value })}
                            placeholder="Ex: Service spécial"
                            className="bg-slate-800 border-slate-600 text-white mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-slate-400 text-xs">Prix (FCFA)</Label>
                          <Input
                            type="number"
                            value={customItem.price || ""}
                            onChange={(e) => setCustomItem({ ...customItem, price: parseInt(e.target.value) || 0 })}
                            placeholder="0"
                            className="bg-slate-800 border-slate-600 text-white mt-1"
                          />
                        </div>
                      </div>
                      <Button 
                        onClick={addCustomItem} 
                        className="w-full mt-3 bg-slate-600 hover:bg-slate-500"
                        disabled={!customItem.name || customItem.price <= 0}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Ajouter à la facture
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Right: Current Bill */}
              <div className="lg:col-span-1">
                <Card className="bg-slate-800/50 border-amber-500/30 sticky top-20">
                  <CardHeader className="border-b border-slate-700 py-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-amber-500 flex items-center gap-2 text-lg">
                        <Receipt className="w-5 h-5" />
                        Facture
                      </CardTitle>
                      {currentBill.length > 0 && (
                        <Button variant="ghost" size="sm" onClick={clearBill} className="text-red-400 hover:text-red-300">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    
                    {/* Client selector */}
                    <Select value={selectedClient?.id || "anonymous"} onValueChange={(v) => setSelectedClient(v === "anonymous" ? null : clients.find(c => c.id === v) || null)}>
                      <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white mt-2">
                        <SelectValue placeholder="Sélectionner un client (optionnel)" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="anonymous" className="text-white">Client anonyme</SelectItem>
                        {clients.map(client => (
                          <SelectItem key={client.id} value={client.id} className="text-white">
                            {client.name} {client.phone && `(${client.phone})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardHeader>
                  
                  <CardContent className="p-3">
                    {currentBill.length === 0 ? (
                      <p className="text-slate-500 text-center py-8">Aucun article</p>
                    ) : (
                      <div className="space-y-2 max-h-[250px] overflow-y-auto">
                        {currentBill.map((item, index) => {
                          const config = DEPARTMENT_CONFIG[item.department];
                          return (
                            <div key={index} className="flex items-center justify-between bg-slate-700/30 rounded-lg p-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-medium truncate">{item.name}</p>
                                <p className={`text-xs ${config.color}`}>{config.label}</p>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button size="icon" variant="ghost" onClick={() => updateQuantity(index, -1)} className="w-6 h-6 text-slate-400">
                                  <Minus className="w-3 h-3" />
                                </Button>
                                <span className="text-white w-6 text-center text-sm">{item.quantity}</span>
                                <Button size="icon" variant="ghost" onClick={() => updateQuantity(index, 1)} className="w-6 h-6 text-slate-400">
                                  <Plus className="w-3 h-3" />
                                </Button>
                                <span className="text-amber-400 font-bold text-sm w-14 text-right">
                                  {formatPrice(item.price * item.quantity)}
                                </span>
                                <Button size="icon" variant="ghost" onClick={() => removeItem(index)} className="w-6 h-6 text-red-400">
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {currentBill.length > 0 && (
                      <>
                        {/* Totals by department */}
                        <div className="mt-3 pt-3 border-t border-slate-700 space-y-1">
                          {Object.entries(totalByDepartment).map(([dept, amount]) => {
                            if (amount === 0) return null;
                            const config = DEPARTMENT_CONFIG[dept];
                            return (
                              <div key={dept} className="flex justify-between text-xs">
                                <span className={config.color}>{config.label}</span>
                                <span className="text-white">{formatPrice(amount)} F</span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Discount & Payment */}
                        <div className="mt-3 pt-3 border-t border-slate-700 space-y-3">
                          <div className="flex items-center gap-2">
                            <Label className="text-slate-400 text-xs">Remise %</Label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={discount}
                              onChange={(e) => setDiscount(parseInt(e.target.value) || 0)}
                              className="w-16 bg-slate-700/50 border-slate-600 text-white text-sm h-8"
                            />
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-400">Sous-total</span>
                              <span className="text-white">{formatPrice(subtotal)} F</span>
                            </div>
                            {discount > 0 && (
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Remise ({discount}%)</span>
                                <span className="text-green-400">-{formatPrice(discountAmount)} F</span>
                              </div>
                            )}
                            <div className="flex justify-between text-lg font-bold pt-2 border-t border-slate-700">
                              <span className="text-white">TOTAL</span>
                              <span className="text-amber-500">{formatPrice(total)} FCFA</span>
                            </div>
                          </div>

                          {/* Payment method */}
                          <div className="grid grid-cols-2 gap-1">
                            {PAYMENT_METHODS.map(method => {
                              const Icon = method.icon;
                              return (
                                <Button
                                  key={method.value}
                                  variant={paymentMethod === method.value ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => setPaymentMethod(method.value)}
                                  className={paymentMethod === method.value ? "bg-amber-500 text-white" : "border-slate-600 text-slate-300"}
                                >
                                  <Icon className="w-3 h-3 mr-1" />
                                  {method.label}
                                </Button>
                              );
                            })}
                          </div>

                          {/* Actions */}
                          <div className="grid grid-cols-2 gap-2 pt-2">
                            <Button onClick={() => generatePDF({ ...{ items: currentBill, subtotal, discount, discount_amount: discountAmount, total, payment_method: paymentMethod, customer_name: selectedClient?.name || "Client", customer_phone: selectedClient?.phone || "", invoice_number: "PREVIEW", created_at: new Date().toISOString(), totals_by_department: totalByDepartment } })} variant="outline" className="border-slate-600 text-slate-300">
                              <Printer className="w-4 h-4 mr-2" />
                              Imprimer
                            </Button>
                            <Button onClick={saveInvoice} className="bg-gradient-to-r from-amber-500 to-amber-600 text-white font-bold">
                              <Save className="w-4 h-4 mr-2" />
                              Enregistrer
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ==================== INVOICES TAB ==================== */}
          <TabsContent value="invoices">
            <div className="space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-slate-400" />
                  <Input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="bg-slate-800/50 border-slate-700 text-white w-auto"
                  />
                </div>
                <Select value={filterValidation} onValueChange={setFilterValidation}>
                  <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="all" className="text-white">Toutes</SelectItem>
                    <SelectItem value="pending" className="text-yellow-400">En attente</SelectItem>
                    <SelectItem value="validated" className="text-green-400">Validées</SelectItem>
                  </SelectContent>
                </Select>
                <Badge className="bg-blue-500/20 text-blue-400">
                  {invoices.filter(i => filterValidation === 'all' || i.validation_status === filterValidation).length} facture(s)
                </Badge>
                {stats && (
                  <Badge className="bg-amber-500/20 text-amber-400">
                    CA: {formatPrice(stats.total_revenue)} F
                  </Badge>
                )}
              </div>

              {invoices.filter(i => filterValidation === 'all' || i.validation_status === filterValidation).length === 0 ? (
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardContent className="py-12 text-center">
                    <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">Aucune facture pour cette date</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {invoices.filter(i => filterValidation === 'all' || i.validation_status === filterValidation).map((invoice) => (
                    <Card key={invoice.id} className={`bg-slate-800/50 ${invoice.validation_status === 'validated' ? 'border-green-500/30' : 'border-yellow-500/30'}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-3 mb-1 flex-wrap">
                              <span className="font-bold text-white">{invoice.invoice_number}</span>
                              <Badge className="bg-amber-500/20 text-amber-400">{formatPrice(invoice.total)} F</Badge>
                              <Badge className={invoice.payment_method === 'cash' ? 'bg-green-500/20 text-green-400' : invoice.payment_method === 'card' ? 'bg-blue-500/20 text-blue-400' : invoice.payment_method === 'mobile' ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-500/20 text-slate-400'}>
                                {PAYMENT_METHODS.find(p => p.value === invoice.payment_method)?.label}
                              </Badge>
                              {invoice.validation_status === 'validated' ? (
                                <Badge className="bg-green-500/20 text-green-400">✓ Validée</Badge>
                              ) : (
                                <Badge className="bg-yellow-500/20 text-yellow-400">⏳ En attente</Badge>
                              )}
                            </div>
                            <p className="text-slate-400 text-sm">
                              {invoice.customer_name} • {format(new Date(invoice.created_at), "HH:mm")}
                              {invoice.created_by && ` • Serveur: ${invoice.created_by}`}
                            </p>
                            {invoice.validated_by && (
                              <p className="text-green-400 text-xs mt-1">
                                Validé par: {invoice.validated_by}
                              </p>
                            )}
                            <div className="flex gap-2 mt-2 flex-wrap">
                              {invoice.totals_by_department?.salle_jardin > 0 && (
                                <Badge className="bg-green-500/20 text-green-400 text-xs">Salle&Jardin: {formatPrice(invoice.totals_by_department.salle_jardin)}</Badge>
                              )}
                              {invoice.totals_by_department?.jeux > 0 && (
                                <Badge className="bg-blue-500/20 text-blue-400 text-xs">Jeux: {formatPrice(invoice.totals_by_department.jeux)}</Badge>
                              )}
                              {invoice.totals_by_department?.bar > 0 && (
                                <Badge className="bg-orange-500/20 text-orange-400 text-xs">Bar: {formatPrice(invoice.totals_by_department.bar)}</Badge>
                              )}
                              {invoice.totals_by_department?.location > 0 && (
                                <Badge className="bg-purple-500/20 text-purple-400 text-xs">Location: {formatPrice(invoice.totals_by_department.location)}</Badge>
                              )}
                              {invoice.totals_by_department?.autres > 0 && (
                                <Badge className="bg-slate-500/20 text-slate-400 text-xs">Autres: {formatPrice(invoice.totals_by_department.autres)}</Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setViewInvoice(invoice)} className="text-slate-400 hover:text-white">
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => printTicket(invoice)} className="text-slate-400 hover:text-white" title="Imprimer ticket">
                              <Printer className="w-4 h-4" />
                            </Button>
                            {invoice.validation_status !== 'validated' && currentUser?.role === 'admin' && (
                              <Button variant="ghost" size="sm" onClick={() => validateInvoice(invoice.id)} className="text-green-400 hover:text-green-300" title="Valider">
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                            )}
                            {currentUser?.role === 'admin' && (
                              <Button variant="ghost" size="sm" onClick={() => deleteInvoice(invoice.id)} className="text-red-400 hover:text-red-300">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ==================== STATS TAB ==================== */}
          <TabsContent value="stats">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Input
                  type="month"
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className="bg-slate-800/50 border-slate-700 text-white w-auto"
                />
              </div>

              {monthlyStats && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <Card className="bg-gradient-to-br from-amber-500/20 to-amber-600/10 border-amber-500/30">
                      <CardContent className="p-4 text-center">
                        <TrendingUp className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                        <p className="text-slate-400 text-sm">Chiffre d'affaires</p>
                        <p className="text-2xl font-bold text-amber-500">{formatPrice(monthlyStats.total_revenue)} F</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/30">
                      <CardContent className="p-4 text-center">
                        <TreePine className="w-6 h-6 text-green-400 mx-auto mb-2" />
                        <p className="text-slate-400 text-xs">Salle & Jardin</p>
                        <p className="text-xl font-bold text-green-400">{formatPrice(monthlyStats.by_department?.salle_jardin || 0)} F</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/30">
                      <CardContent className="p-4 text-center">
                        <Gamepad2 className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                        <p className="text-slate-400 text-xs">Jeux</p>
                        <p className="text-xl font-bold text-blue-400">{formatPrice(monthlyStats.by_department?.jeux || 0)} F</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-orange-500/20 to-orange-600/10 border-orange-500/30">
                      <CardContent className="p-4 text-center">
                        <Wine className="w-6 h-6 text-orange-400 mx-auto mb-2" />
                        <p className="text-slate-400 text-xs">Bar</p>
                        <p className="text-xl font-bold text-orange-400">{formatPrice(monthlyStats.by_department?.bar || 0)} F</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/30">
                      <CardContent className="p-4 text-center">
                        <Calendar className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                        <p className="text-slate-400 text-xs">Location</p>
                        <p className="text-xl font-bold text-purple-400">{formatPrice(monthlyStats.by_department?.location || 0)} F</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-slate-500/20 to-slate-600/10 border-slate-500/30">
                      <CardContent className="p-4 text-center">
                        <Package className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                        <p className="text-slate-400 text-xs">Autres</p>
                        <p className="text-xl font-bold text-slate-400">{formatPrice(monthlyStats.by_department?.autres || 0)} F</p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardHeader>
                      <CardTitle className="text-white">Détail par jour</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {Object.entries(monthlyStats.daily_stats || {}).sort((a, b) => b[0].localeCompare(a[0])).map(([date, data]) => (
                          <div key={date} className="flex items-center justify-between bg-slate-700/30 rounded-lg p-3">
                            <div>
                              <p className="text-white font-medium">{format(new Date(date), "EEEE d MMMM", { locale: fr })}</p>
                              <p className="text-slate-400 text-sm">{data.count} facture{data.count > 1 ? 's' : ''}</p>
                            </div>
                            <p className="text-amber-500 font-bold text-lg">{formatPrice(data.revenue)} F</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </TabsContent>

          {/* ==================== PRODUCTS TAB ==================== */}
          <TabsContent value="products">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">Gestion des produits</h2>
                <Button onClick={() => { setEditProduct(null); setProductForm({ name: "", price: 0, department: "bar", unit: "unité", category: "" }); setShowProductModal(true); }} className="bg-purple-500 hover:bg-purple-600">
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter un produit
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.entries(DEPARTMENT_CONFIG).map(([dept, config]) => {
                  const Icon = config.icon;
                  const deptProducts = products.filter(p => p.department === dept);
                  return (
                    <Card key={dept} className={`bg-slate-800/50 ${config.borderColor} border`}>
                      <CardHeader className="py-3">
                        <CardTitle className={`${config.color} flex items-center gap-2`}>
                          <Icon className="w-5 h-5" />
                          {config.label} ({deptProducts.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {deptProducts.map((product, idx) => (
                          <div key={`${dept}-${product.id}-${idx}`} className="flex items-center justify-between bg-slate-700/30 rounded-lg p-2">
                            <div>
                              <p className="text-white text-sm">{product.name}</p>
                              <p className="text-slate-400 text-xs">{formatPrice(product.price)} F/{product.unit}</p>
                            </div>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" onClick={() => { setEditProduct(product); setProductForm(product); setShowProductModal(true); }} className="w-7 h-7 text-slate-400">
                                <Edit2 className="w-3 h-3" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => deleteProduct(product.id)} className="w-7 h-7 text-red-400">
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        {deptProducts.length === 0 && (
                          <p className="text-slate-500 text-center py-4 text-sm">Aucun produit personnalisé</p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* ==================== CLIENTS TAB ==================== */}
          <TabsContent value="clients">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">Gestion des clients</h2>
                <Button onClick={() => { setEditClient(null); setClientForm({ name: "", phone: "", email: "", notes: "" }); setShowClientModal(true); }} className="bg-pink-500 hover:bg-pink-600">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Ajouter un client
                </Button>
              </div>

              <div className="grid gap-3">
                {clients.map(client => (
                  <Card key={client.id} className="bg-slate-800/50 border-slate-700">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium">{client.name}</p>
                          <p className="text-slate-400 text-sm">
                            {client.phone && `📞 ${client.phone}`}
                            {client.email && ` • ✉️ ${client.email}`}
                          </p>
                          <div className="flex gap-2 mt-1">
                            <Badge className="bg-amber-500/20 text-amber-400 text-xs">
                              Total: {formatPrice(client.total_spent || 0)} F
                            </Badge>
                            <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                              {client.visit_count || 0} visite{(client.visit_count || 0) > 1 ? 's' : ''}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => { setEditClient(client); setClientForm(client); setShowClientModal(true); }} className="text-slate-400">
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => deleteClient(client.id)} className="text-red-400">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {clients.length === 0 && (
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardContent className="py-12 text-center">
                      <Users className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                      <p className="text-slate-400">Aucun client enregistré</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ==================== USERS TAB ==================== */}
          {currentUser?.role === 'admin' && (
            <TabsContent value="users">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-white">Gestion des utilisateurs</h2>
                  <Button onClick={() => { setEditUser(null); setUserForm({ username: "", email: "", password: "", pin: "", role: "server", full_name: "" }); setShowUserModal(true); }} className="bg-red-500 hover:bg-red-600">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Ajouter un utilisateur
                  </Button>
                </div>

                <div className="grid gap-3">
                  {users.map(user => (
                    <Card key={user.id} className="bg-slate-800/50 border-slate-700">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-white font-medium">{user.full_name || user.username}</p>
                              <Badge className={user.role === 'admin' ? 'bg-amber-500/20 text-amber-400' : user.role === 'manager' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-500/20 text-slate-400'}>
                                {user.role === 'admin' ? 'Admin' : user.role === 'manager' ? 'Manager' : 'Serveur'}
                              </Badge>
                              {!user.is_active && <Badge className="bg-red-500/20 text-red-400">Inactif</Badge>}
                            </div>
                            <p className="text-slate-400 text-sm">
                              @{user.username}
                              {user.pin && <span className="ml-2 font-mono bg-slate-700 px-2 py-0.5 rounded text-xs">PIN: {user.pin}</span>}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => { setEditUser(user); setUserForm({ ...user, password: "", pin: user.pin || "" }); setShowUserModal(true); }} className="text-slate-400">
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => deleteUser(user.id)} className="text-red-400">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* ==================== MODALS ==================== */}
      
      {/* View Invoice Modal */}
      <Dialog open={!!viewInvoice} onOpenChange={() => setViewInvoice(null)}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Facture {viewInvoice?.invoice_number}</DialogTitle>
          </DialogHeader>
          {viewInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-400">Client:</span> {viewInvoice.customer_name}</div>
                <div><span className="text-slate-400">Date:</span> {format(new Date(viewInvoice.created_at), "dd/MM/yyyy HH:mm")}</div>
                <div><span className="text-slate-400">Serveur:</span> {viewInvoice.created_by || '-'}</div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Statut:</span>
                  {viewInvoice.validation_status === 'validated' ? (
                    <Badge className="bg-green-500/20 text-green-400">✓ Validée par {viewInvoice.validated_by}</Badge>
                  ) : (
                    <Badge className="bg-yellow-500/20 text-yellow-400">⏳ En attente de validation</Badge>
                  )}
                </div>
              </div>
              <div className="border-t border-slate-700 pt-4">
                {viewInvoice.items?.map((item, idx) => (
                  <div key={idx} className="flex justify-between py-1 text-sm">
                    <span>{item.name} x{item.quantity}</span>
                    <span className="text-amber-400">{formatPrice(item.price * item.quantity)} F</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-700 pt-4 space-y-1">
                <div className="flex justify-between"><span className="text-slate-400">Sous-total</span><span>{formatPrice(viewInvoice.subtotal)} F</span></div>
                {viewInvoice.discount > 0 && <div className="flex justify-between"><span className="text-slate-400">Remise ({viewInvoice.discount}%)</span><span className="text-green-400">-{formatPrice(viewInvoice.discount_amount)} F</span></div>}
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-slate-700"><span>TOTAL</span><span className="text-amber-500">{formatPrice(viewInvoice.total)} FCFA</span></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => printTicket(viewInvoice)} variant="outline" className="border-amber-500 text-amber-500 hover:bg-amber-500/10">
                  <Printer className="w-4 h-4 mr-2" />
                  Ticket 80mm
                </Button>
                <Button onClick={() => downloadPDF(viewInvoice)} className="bg-amber-500 hover:bg-amber-600">
                  <Download className="w-4 h-4 mr-2" />
                  PDF A4
                </Button>
              </div>
              {viewInvoice.validation_status !== 'validated' && currentUser?.role === 'admin' && (
                <Button onClick={() => { validateInvoice(viewInvoice.id); setViewInvoice(null); }} className="w-full bg-green-600 hover:bg-green-700">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Valider cette facture
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Product Modal */}
      <Dialog open={showProductModal} onOpenChange={setShowProductModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>{editProduct ? "Modifier le produit" : "Ajouter un produit"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom</Label>
              <Input value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} className="bg-slate-700 border-slate-600" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prix (FCFA)</Label>
                <Input type="number" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: parseFloat(e.target.value) || 0 })} className="bg-slate-700 border-slate-600" />
              </div>
              <div className="space-y-2">
                <Label>Unité</Label>
                <Input value={productForm.unit} onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })} className="bg-slate-700 border-slate-600" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Département</Label>
              <Select value={productForm.department} onValueChange={(v) => setProductForm({ ...productForm, department: v })}>
                <SelectTrigger className="bg-slate-700 border-slate-600"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="salle_jardin">Salle & Jardin</SelectItem>
                  <SelectItem value="jeux">Jeux</SelectItem>
                  <SelectItem value="bar">Bar</SelectItem>
                  <SelectItem value="location">Location</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={saveProduct} className="w-full bg-purple-500 hover:bg-purple-600">Enregistrer</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Client Modal */}
      <Dialog open={showClientModal} onOpenChange={setShowClientModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>{editClient ? "Modifier le client" : "Ajouter un client"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom *</Label>
              <Input value={clientForm.name} onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })} className="bg-slate-700 border-slate-600" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input value={clientForm.phone} onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })} className="bg-slate-700 border-slate-600" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={clientForm.email} onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })} className="bg-slate-700 border-slate-600" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={clientForm.notes} onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })} className="bg-slate-700 border-slate-600" />
            </div>
            <Button onClick={saveClient} className="w-full bg-pink-500 hover:bg-pink-600">Enregistrer</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* User Modal */}
      <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>{editUser ? "Modifier l'utilisateur" : "Ajouter un utilisateur"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom complet</Label>
              <Input value={userForm.full_name} onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })} className="bg-slate-700 border-slate-600" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nom d'utilisateur *</Label>
                <Input value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} className="bg-slate-700 border-slate-600" />
              </div>
              <div className="space-y-2">
                <Label>Code PIN (4-6 chiffres) *</Label>
                <Input 
                  type="text" 
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={userForm.pin} 
                  onChange={(e) => setUserForm({ ...userForm, pin: e.target.value.replace(/\D/g, '') })} 
                  className="bg-slate-700 border-slate-600 font-mono tracking-widest" 
                  placeholder="Ex: 1234"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email (optionnel)</Label>
                <Input value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} className="bg-slate-700 border-slate-600" />
              </div>
              <div className="space-y-2">
                <Label>Rôle</Label>
                <Select value={userForm.role} onValueChange={(v) => setUserForm({ ...userForm, role: v })}>
                  <SelectTrigger className="bg-slate-700 border-slate-600"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="server">Serveur</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Administrateur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={saveUser} className="w-full bg-red-500 hover:bg-red-600">Enregistrer</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CaissePage;
