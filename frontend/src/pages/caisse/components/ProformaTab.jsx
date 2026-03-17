import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  FileText, Plus, Trash2, Edit2, Eye, Send, CheckCircle, 
  RefreshCw, Search, Calendar, User, Phone, Mail, MapPin,
  DollarSign, Printer, ArrowRight, Clock, AlertCircle, Package
} from "lucide-react";
import { toast } from "sonner";
import { LOGO_BASE64 } from "../constants_logo";

const API = process.env.REACT_APP_BACKEND_URL + '/api';

const ProformaTab = ({ currentUser, formatPrice, catalog }) => {
  const [proformas, setProformas] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingProforma, setViewingProforma] = useState(null);
  const [editingProforma, setEditingProforma] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    client_name: "",
    client_phone: "",
    client_email: "",
    client_address: "",
    items: [],
    subtotal: 0,
    discount: 0,
    tax: 0,
    total: 0,
    notes: "",
    validity_days: 30,
    apply_tva: true  // Option pour activer/désactiver la TVA
  });
  
  // Product selection
  const [selectedDept, setSelectedDept] = useState("salle_jardin");
  const [productSearch, setProductSearch] = useState("");
  
  // Manual product entry
  const [manualProduct, setManualProduct] = useState({
    name: "",
    quantity: 1,
    unit_price: 0
  });

  useEffect(() => {
    fetchProformas();
  }, []);

  const fetchProformas = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/proforma-invoices`);
      setProformas(res.data.proformas || []);
      setStats(res.data.stats || {});
    } catch (error) {
      console.error("Error fetching proformas:", error);
      toast.error("Erreur lors du chargement des proformas");
    } finally {
      setLoading(false);
    }
  };

  const TVA_RATE = 0.18; // Taux de TVA 18%

  const calculateTotals = (items, discount = 0, applyTva = true) => {
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const montantHT = subtotal - discount;
    const tvaAmount = applyTva ? Math.round(montantHT * TVA_RATE) : 0;
    const total = montantHT + tvaAmount;
    return { subtotal, montantHT, tvaAmount, total };
  };

  const addItemToForm = (product, dept) => {
    const existingIndex = formData.items.findIndex(i => i.name === product.name);
    let newItems;
    
    if (existingIndex >= 0) {
      newItems = [...formData.items];
      newItems[existingIndex].quantity += 1;
      newItems[existingIndex].subtotal = newItems[existingIndex].quantity * newItems[existingIndex].unit_price;
    } else {
      newItems = [...formData.items, {
        name: product.name,
        quantity: 1,
        unit_price: product.price,
        subtotal: product.price,
        department: dept
      }];
    }
    
    const { subtotal, montantHT, tvaAmount, total } = calculateTotals(newItems, formData.discount, formData.apply_tva);
    setFormData({ ...formData, items: newItems, subtotal, tax: tvaAmount, total });
  };

  // Add manual product entry
  const addManualProduct = () => {
    if (!manualProduct.name.trim()) {
      toast.error("Veuillez entrer une désignation");
      return;
    }
    if (manualProduct.unit_price <= 0) {
      toast.error("Veuillez entrer un prix unitaire valide");
      return;
    }
    
    const newItem = {
      name: manualProduct.name.trim(),
      quantity: manualProduct.quantity || 1,
      unit_price: parseFloat(manualProduct.unit_price),
      subtotal: (manualProduct.quantity || 1) * parseFloat(manualProduct.unit_price),
      department: "autres"
    };
    
    const newItems = [...formData.items, newItem];
    const { subtotal, montantHT, tvaAmount, total } = calculateTotals(newItems, formData.discount, formData.apply_tva);
    setFormData({ ...formData, items: newItems, subtotal, tax: tvaAmount, total });
    
    // Reset manual product form
    setManualProduct({ name: "", quantity: 1, unit_price: 0 });
    toast.success(`${newItem.name} ajouté`);
  };

  const updateItemQuantity = (index, quantity) => {
    if (quantity < 1) return;
    const newItems = [...formData.items];
    newItems[index].quantity = quantity;
    newItems[index].subtotal = quantity * newItems[index].unit_price;
    
    const { subtotal, montantHT, tvaAmount, total } = calculateTotals(newItems, formData.discount, formData.apply_tva);
    setFormData({ ...formData, items: newItems, subtotal, tax: tvaAmount, total });
  };

  const removeItemFromForm = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    const { subtotal, montantHT, tvaAmount, total } = calculateTotals(newItems, formData.discount, formData.apply_tva);
    setFormData({ ...formData, items: newItems, subtotal, tax: tvaAmount, total });
  };

  const updateDiscount = (discount) => {
    const d = parseFloat(discount) || 0;
    const { subtotal, montantHT, tvaAmount, total } = calculateTotals(formData.items, d, formData.apply_tva);
    setFormData({ ...formData, discount: d, subtotal, tax: tvaAmount, total });
  };

  const toggleTva = () => {
    const newApplyTva = !formData.apply_tva;
    const { subtotal, montantHT, tvaAmount, total } = calculateTotals(formData.items, formData.discount, newApplyTva);
    setFormData({ ...formData, apply_tva: newApplyTva, tax: tvaAmount, total });
  };

  const handleSubmit = async () => {
    if (!formData.client_name) {
      toast.error("Le nom du client est obligatoire");
      return;
    }
    if (formData.items.length === 0) {
      toast.error("Ajoutez au moins un article");
      return;
    }

    try {
      const payload = {
        ...formData,
        created_by: currentUser?.full_name || currentUser?.username || ""
      };

      if (editingProforma) {
        await axios.put(`${API}/proforma-invoices/${editingProforma.id}`, payload);
        toast.success("Proforma mise à jour");
      } else {
        await axios.post(`${API}/proforma-invoices`, payload);
        toast.success("Proforma créée avec succès");
      }

      setShowCreateModal(false);
      resetForm();
      fetchProformas();
    } catch (error) {
      console.error("Error saving proforma:", error);
      toast.error("Erreur lors de l'enregistrement");
    }
  };

  const resetForm = () => {
    setFormData({
      client_name: "",
      client_phone: "",
      client_email: "",
      client_address: "",
      items: [],
      subtotal: 0,
      discount: 0,
      tax: 0,
      total: 0,
      notes: "",
      validity_days: 30,
      apply_tva: true
    });
    setEditingProforma(null);
  };

  const openEditModal = (proforma) => {
    setEditingProforma(proforma);
    const applyTva = proforma.apply_tva !== false; // Default to true if not set
    const { subtotal, montantHT, tvaAmount, total } = calculateTotals(proforma.items || [], proforma.discount || 0, applyTva);
    setFormData({
      client_name: proforma.client_name,
      client_phone: proforma.client_phone || "",
      client_email: proforma.client_email || "",
      client_address: proforma.client_address || "",
      items: proforma.items || [],
      subtotal: subtotal,
      discount: proforma.discount || 0,
      tax: tvaAmount,
      total: total,
      notes: proforma.notes || "",
      validity_days: proforma.validity_days || 30,
      apply_tva: applyTva
    });
    setShowCreateModal(true);
  };

  const updateStatus = async (proformaId, newStatus) => {
    try {
      await axios.put(`${API}/proforma-invoices/${proformaId}`, { status: newStatus });
      toast.success(`Statut mis à jour: ${getStatusLabel(newStatus)}`);
      fetchProformas();
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Erreur lors de la mise à jour");
    }
  };

  const convertToInvoice = async (proforma) => {
    if (!confirm(`Convertir la proforma ${proforma.proforma_number} en facture définitive ?`)) return;
    
    try {
      const res = await axios.post(`${API}/proforma-invoices/${proforma.id}/convert`, null, {
        params: { converted_by: currentUser?.full_name || "" }
      });
      toast.success(res.data.message);
      fetchProformas();
    } catch (error) {
      console.error("Error converting proforma:", error);
      toast.error("Erreur lors de la conversion");
    }
  };

  const deleteProforma = async (proformaId) => {
    if (!confirm("Supprimer cette proforma ?")) return;
    
    try {
      await axios.delete(`${API}/proforma-invoices/${proformaId}`);
      toast.success("Proforma supprimée");
      fetchProformas();
    } catch (error) {
      console.error("Error deleting proforma:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  const printProforma = (proforma) => {
    const applyTva = proforma.apply_tva !== false;
    const subtotalCalc = proforma.items?.reduce((sum, item) => sum + item.subtotal, 0) || 0;
    const montantHT = subtotalCalc - (proforma.discount || 0);
    const tvaAmount = applyTva ? Math.round(montantHT * 0.18) : 0;
    const totalTTC = montantHT + tvaAmount;
    
    // Format date in French
    const dateCreation = new Date(proforma.created_at);
    const moisFr = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const dateFormatted = `${dateCreation.getDate()} ${moisFr[dateCreation.getMonth()]} ${dateCreation.getFullYear()}`;
    
    // Generate proforma number in format: 00 XX /MM/YY/ES
    const proformaNum = proforma.proforma_number || 'N/A';
    
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Proforma ${proforma.proforma_number}</title>
        <style>
          @page { margin: 15mm; size: A4; }
          * { box-sizing: border-box; }
          body { 
            font-family: 'Times New Roman', Times, serif; 
            padding: 20px 40px; 
            max-width: 800px; 
            margin: 0 auto;
            color: #000;
            font-size: 12pt;
            line-height: 1.4;
          }
          
          /* Header with logo */
          .header {
            display: flex;
            align-items: flex-start;
            gap: 20px;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 3px solid #1a237e;
          }
          .logo-section {
            width: 120px;
            height: 120px;
            flex-shrink: 0;
          }
          .logo-section img {
            width: 100%;
            height: 100%;
            object-fit: contain;
          }
          .company-info {
            flex: 1;
          }
          .company-name {
            font-size: 28pt;
            font-weight: bold;
            color: #1a237e;
            margin: 0;
            letter-spacing: 2px;
          }
          .company-location {
            font-size: 14pt;
            color: #333;
            margin: 5px 0;
          }
          .company-date {
            font-size: 12pt;
            color: #555;
          }
          
          /* Contact and document info */
          .doc-info {
            display: flex;
            justify-content: space-between;
            margin: 20px 0;
            padding: 15px;
            background: #f9f9f9;
            border-left: 4px solid #8b0000;
          }
          .doc-info-left {
            text-align: left;
          }
          .doc-info-right {
            text-align: right;
          }
          .doc-title {
            font-size: 18pt;
            font-weight: bold;
            color: #8b0000;
            margin-bottom: 10px;
          }
          .doc-number {
            font-size: 14pt;
            font-weight: bold;
            letter-spacing: 1px;
            color: #1a237e;
          }
          .rccm {
            font-size: 10pt;
            color: #666;
            margin-top: 5px;
          }
          
          /* Client section */
          .client-section {
            margin: 25px 0;
            padding: 15px;
            border: 2px solid #1a237e;
            border-radius: 8px;
          }
          .client-label {
            font-weight: bold;
            font-size: 14pt;
            color: #1a237e;
            margin-bottom: 10px;
          }
          .client-name {
            font-size: 16pt;
            font-weight: bold;
          }
          .client-details {
            font-size: 11pt;
            color: #333;
            margin-top: 5px;
          }
          
          /* Table */
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 20px 0;
          }
          thead tr {
            background: #1a237e;
            color: white;
          }
          th { 
            padding: 12px 10px; 
            text-align: left;
            font-weight: bold;
            font-size: 11pt;
          }
          th:nth-child(2), th:nth-child(3), th:nth-child(4) {
            text-align: center;
          }
          th:last-child {
            text-align: right;
          }
          td { 
            padding: 10px; 
            border-bottom: 1px solid #ddd;
            font-size: 11pt;
          }
          td:nth-child(2), td:nth-child(3) {
            text-align: center;
          }
          td:last-child {
            text-align: right;
            font-weight: 500;
          }
          tbody tr:nth-child(even) {
            background: #fafafa;
          }
          tbody tr:hover {
            background: #e8eaf6;
          }
          
          /* Totals */
          .totals-section {
            margin-top: 20px;
            display: flex;
            justify-content: flex-end;
          }
          .totals-table {
            width: 350px;
            border: 2px solid #1a237e;
            border-radius: 8px;
            overflow: hidden;
          }
          .totals-table tr {
            border-bottom: 1px solid #eee;
          }
          .totals-table td {
            padding: 10px 15px;
            border: none;
          }
          .totals-table .label {
            text-align: left;
            color: #333;
            font-size: 11pt;
          }
          .totals-table .value {
            text-align: right;
            font-weight: 600;
            font-size: 11pt;
          }
          .totals-table .total-row {
            background: #8b0000;
            color: white;
          }
          .totals-table .total-row td {
            font-size: 14pt;
            font-weight: bold;
            padding: 12px 15px;
          }
          
          /* Notes */
          .notes-section {
            margin-top: 20px;
            padding: 15px;
            background: #e8eaf6;
            border-left: 4px solid #1a237e;
            font-style: italic;
          }
          
          /* Footer */
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #8b0000;
          }
          .thank-you {
            text-align: center;
            font-size: 12pt;
            color: #8b0000;
            font-weight: bold;
            margin-bottom: 30px;
          }
          .signature-section {
            text-align: right;
            margin-top: 20px;
          }
          .signature-name {
            font-weight: bold;
            font-size: 12pt;
          }
          .signature-title {
            font-style: italic;
            color: #666;
          }
          
          @media print { 
            body { padding: 0; }
            .header { break-inside: avoid; }
            table { break-inside: auto; }
            tr { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <!-- Header with Logo -->
        <div class="header">
          <div class="logo-section">
            <img src="${LOGO_BASE64}" alt="ESPACE MAXO" />
          </div>
          <div class="company-info">
            <h1 class="company-name">ESPACE MAXO</h1>
            <p class="company-location">Cotonou, Fidjrossè</p>
            <p class="company-date">${dateFormatted}</p>
          </div>
        </div>
        
        <!-- Document Info -->
        <div class="doc-info">
          <div class="doc-info-left">
            <p style="margin: 0;"><strong>Tél:</strong> +229 01 4147 0000</p>
            <p class="rccm">RCCM RB/COT/22 B 32037</p>
          </div>
          <div class="doc-info-right">
            <div class="doc-title">FACTURE PROFORMA</div>
            <div class="doc-number">N° ${proformaNum}</div>
          </div>
        </div>
        
        <!-- Client Section -->
        <div class="client-section">
          <div class="client-label">CLIENT :</div>
          <div class="client-name">${proforma.client_name}</div>
          <div class="client-details">
            ${proforma.client_phone ? `<p style="margin: 2px 0;">Tél: ${proforma.client_phone}</p>` : ''}
            ${proforma.client_email ? `<p style="margin: 2px 0;">Email: ${proforma.client_email}</p>` : ''}
            ${proforma.client_address ? `<p style="margin: 2px 0;">Adresse: ${proforma.client_address}</p>` : ''}
          </div>
        </div>
        
        <!-- Items Table -->
        <table>
          <thead>
            <tr>
              <th style="width: 50%;">DESCRIPTION</th>
              <th style="width: 10%;">QTÉ</th>
              <th style="width: 20%;">PRIX UNITAIRE</th>
              <th style="width: 20%;">MONTANT</th>
            </tr>
          </thead>
          <tbody>
            ${proforma.items.map(item => `
              <tr>
                <td>${item.name}</td>
                <td>${item.quantity}</td>
                <td>${item.unit_price?.toLocaleString('fr-FR')} F</td>
                <td>${item.subtotal?.toLocaleString('fr-FR')} F</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <!-- Totals -->
        <div class="totals-section">
          <table class="totals-table">
            <tr>
              <td class="label">Sous-total</td>
              <td class="value">${subtotalCalc.toLocaleString('fr-FR')} F</td>
            </tr>
            ${proforma.discount > 0 ? `
              <tr>
                <td class="label">Remise</td>
                <td class="value">-${proforma.discount?.toLocaleString('fr-FR')} F</td>
              </tr>
            ` : ''}
            <tr>
              <td class="label"><strong>Montant HT</strong></td>
              <td class="value"><strong>${montantHT.toLocaleString('fr-FR')} F</strong></td>
            </tr>
            <tr>
              <td class="label">TVA (18%)</td>
              <td class="value">${applyTva ? tvaAmount.toLocaleString('fr-FR') + ' F' : 'Exonéré'}</td>
            </tr>
            <tr class="total-row">
              <td class="label">MONTANT TTC</td>
              <td class="value">${totalTTC.toLocaleString('fr-FR')} F CFA</td>
            </tr>
          </table>
        </div>
        
        ${proforma.notes ? `
          <div class="notes-section">
            <strong>Notes :</strong><br/>
            ${proforma.notes}
          </div>
        ` : ''}
        
        <!-- Footer -->
        <div class="footer">
          <p class="thank-you">NOUS VOUS REMERCIONS DE VOTRE CONFIANCE ET À BIENTÔT !</p>
          
          <div class="signature-section">
            <p class="signature-name">AHOUANDJINOU MÈRES</p>
            <p class="signature-title">LA GÉRANTE</p>
          </div>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const getStatusLabel = (status) => {
    const labels = {
      draft: 'Brouillon',
      sent: 'Envoyée',
      accepted: 'Acceptée',
      rejected: 'Refusée',
      converted: 'Convertie'
    };
    return labels[status] || status;
  };

  const getStatusBadge = (status) => {
    const styles = {
      draft: 'bg-slate-500/20 text-slate-400',
      sent: 'bg-blue-500/20 text-blue-400',
      accepted: 'bg-green-500/20 text-green-400',
      rejected: 'bg-red-500/20 text-red-400',
      converted: 'bg-purple-500/20 text-purple-400'
    };
    return <Badge className={styles[status] || 'bg-slate-500/20 text-slate-400'}>{getStatusLabel(status)}</Badge>;
  };

  const filteredProformas = proformas.filter(p => {
    const matchesSearch = p.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         p.proforma_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Get products from catalog for selection
  const availableProducts = catalog[selectedDept] || [];
  const filteredProducts = availableProducts.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-xl font-bold text-blue-300 flex items-center gap-2">
          <FileText className="w-6 h-6" />
          Factures Proforma
        </h2>
        <div className="flex items-center gap-3">
          <Button onClick={fetchProformas} variant="outline" className="border-slate-600 text-slate-300">
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualiser
          </Button>
          <Button onClick={() => { resetForm(); setShowCreateModal(true); }} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            Nouvelle Proforma
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4 text-center">
            <FileText className="w-6 h-6 text-slate-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-white">{stats.total || 0}</p>
            <p className="text-xs text-slate-400">Total</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-600">
          <CardContent className="p-4 text-center">
            <Edit2 className="w-6 h-6 text-slate-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-slate-400">{stats.draft || 0}</p>
            <p className="text-xs text-slate-400">Brouillons</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-900/30 border-blue-500/50">
          <CardContent className="p-4 text-center">
            <Send className="w-6 h-6 text-blue-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-blue-400">{stats.sent || 0}</p>
            <p className="text-xs text-slate-400">Envoyées</p>
          </CardContent>
        </Card>
        <Card className="bg-green-900/30 border-green-500/50">
          <CardContent className="p-4 text-center">
            <CheckCircle className="w-6 h-6 text-green-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-green-400">{stats.accepted || 0}</p>
            <p className="text-xs text-slate-400">Acceptées</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-900/30 border-amber-500/50">
          <CardContent className="p-4 text-center">
            <DollarSign className="w-6 h-6 text-amber-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-amber-400">{formatPrice(stats.total_value || 0)} F</p>
            <p className="text-xs text-slate-400">Valeur totale</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Rechercher par client ou numéro..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-slate-800/50 border-slate-700 text-white"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px] bg-slate-800/50 border-slate-700 text-white">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="draft">Brouillons</SelectItem>
            <SelectItem value="sent">Envoyées</SelectItem>
            <SelectItem value="accepted">Acceptées</SelectItem>
            <SelectItem value="rejected">Refusées</SelectItem>
            <SelectItem value="converted">Converties</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Proformas List */}
      {loading ? (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-8 text-center">
            <RefreshCw className="w-8 h-8 text-blue-400 mx-auto animate-spin mb-3" />
            <p className="text-slate-400">Chargement...</p>
          </CardContent>
        </Card>
      ) : filteredProformas.length === 0 ? (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-8 text-center">
            <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">Aucune proforma trouvée</p>
            <p className="text-slate-500 text-sm mt-1">Créez votre première facture proforma</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredProformas.map(proforma => (
            <Card key={proforma.id} className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-colors">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  {/* Left: Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-bold">{proforma.proforma_number}</span>
                      {getStatusBadge(proforma.status)}
                      {proforma.status === 'converted' && proforma.converted_to_invoice && (
                        <Badge className="bg-purple-500/20 text-purple-300">→ {proforma.converted_to_invoice}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <span className="text-slate-300 flex items-center gap-1">
                        <User className="w-4 h-4" />
                        {proforma.client_name}
                      </span>
                      {proforma.client_phone && (
                        <span className="text-slate-400 flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {proforma.client_phone}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(proforma.created_at).toLocaleDateString('fr-FR')}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Valide jusqu'au {new Date(proforma.valid_until).toLocaleDateString('fr-FR')}
                      </span>
                      <span>{proforma.items?.length || 0} article(s)</span>
                    </div>
                  </div>
                  
                  {/* Right: Amount & Actions */}
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-amber-400 font-bold text-lg">{formatPrice(proforma.total)} F</p>
                      <p className="text-slate-500 text-xs">Total TTC</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => { setViewingProforma(proforma); setShowViewModal(true); }} className="w-8 h-8 text-slate-400 hover:text-white">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => printProforma(proforma)} className="w-8 h-8 text-slate-400 hover:text-white">
                        <Printer className="w-4 h-4" />
                      </Button>
                      {proforma.status !== 'converted' && (
                        <>
                          <Button size="icon" variant="ghost" onClick={() => openEditModal(proforma)} className="w-8 h-8 text-blue-400 hover:text-blue-300">
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          {proforma.status === 'accepted' && (
                            <Button size="icon" variant="ghost" onClick={() => convertToInvoice(proforma)} className="w-8 h-8 text-purple-400 hover:text-purple-300" title="Convertir en facture">
                              <ArrowRight className="w-4 h-4" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" onClick={() => deleteProforma(proforma.id)} className="w-8 h-8 text-red-400 hover:text-red-300">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <FileText className="w-6 h-6 text-blue-400" />
              {editingProforma ? 'Modifier la Proforma' : 'Nouvelle Facture Proforma'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
            {/* Left: Client Info */}
            <div className="space-y-4">
              <h3 className="text-slate-300 font-medium flex items-center gap-2">
                <User className="w-4 h-4" />
                Informations Client
              </h3>
              
              <div>
                <Label className="text-slate-400 text-sm">Nom du client *</Label>
                <Input
                  value={formData.client_name}
                  onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                  placeholder="Nom complet"
                  className="bg-slate-900/50 border-slate-700 text-white mt-1"
                />
              </div>
              
              <div>
                <Label className="text-slate-400 text-sm">Téléphone</Label>
                <Input
                  value={formData.client_phone}
                  onChange={(e) => setFormData({ ...formData, client_phone: e.target.value })}
                  placeholder="+229 XX XX XX XX"
                  className="bg-slate-900/50 border-slate-700 text-white mt-1"
                />
              </div>
              
              <div>
                <Label className="text-slate-400 text-sm">Email</Label>
                <Input
                  type="email"
                  value={formData.client_email}
                  onChange={(e) => setFormData({ ...formData, client_email: e.target.value })}
                  placeholder="email@exemple.com"
                  className="bg-slate-900/50 border-slate-700 text-white mt-1"
                />
              </div>
              
              <div>
                <Label className="text-slate-400 text-sm">Adresse</Label>
                <Input
                  value={formData.client_address}
                  onChange={(e) => setFormData({ ...formData, client_address: e.target.value })}
                  placeholder="Adresse complète"
                  className="bg-slate-900/50 border-slate-700 text-white mt-1"
                />
              </div>
              
              <div>
                <Label className="text-slate-400 text-sm">Validité (jours)</Label>
                <Input
                  type="number"
                  value={formData.validity_days}
                  onChange={(e) => setFormData({ ...formData, validity_days: parseInt(e.target.value) || 30 })}
                  className="bg-slate-900/50 border-slate-700 text-white mt-1"
                />
              </div>
              
              <div>
                <Label className="text-slate-400 text-sm">Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Conditions particulières, remarques..."
                  className="bg-slate-900/50 border-slate-700 text-white mt-1"
                />
              </div>
            </div>
            
            {/* Right: Products & Summary */}
            <div className="space-y-4">
              <h3 className="text-slate-300 font-medium flex items-center gap-2">
                <Package className="w-4 h-4" />
                Articles
              </h3>
              
              {/* Manual Product Entry */}
              <div className="bg-slate-900/50 rounded-lg p-4 space-y-3 border border-slate-700">
                <h4 className="text-slate-400 text-sm font-medium">Ajouter un article</h4>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <Label className="text-slate-500 text-xs">Désignation *</Label>
                    <Input
                      data-testid="proforma-item-designation"
                      value={manualProduct.name}
                      onChange={(e) => setManualProduct({ ...manualProduct, name: e.target.value })}
                      placeholder="Nom du produit ou service"
                      className="bg-slate-800 border-slate-600 text-white mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-slate-500 text-xs">Quantité</Label>
                      <Input
                        data-testid="proforma-item-quantity"
                        type="number"
                        min="1"
                        value={manualProduct.quantity}
                        onChange={(e) => setManualProduct({ ...manualProduct, quantity: parseInt(e.target.value) || 1 })}
                        className="bg-slate-800 border-slate-600 text-white mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-500 text-xs">Prix unitaire (F CFA) *</Label>
                      <Input
                        data-testid="proforma-item-price"
                        type="number"
                        min="0"
                        value={manualProduct.unit_price}
                        onChange={(e) => setManualProduct({ ...manualProduct, unit_price: parseFloat(e.target.value) || 0 })}
                        className="bg-slate-800 border-slate-600 text-white mt-1"
                      />
                    </div>
                  </div>
                  <Button 
                    data-testid="proforma-add-item-btn"
                    onClick={addManualProduct}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter l'article
                  </Button>
                </div>
              </div>
              
              {/* Selected Items */}
              <div className="bg-slate-900/50 rounded-lg p-3 max-h-52 overflow-y-auto">
                <h4 className="text-slate-400 text-sm mb-2">Articles de la proforma ({formData.items.length})</h4>
                {formData.items.length === 0 ? (
                  <p className="text-slate-500 text-center py-6 text-sm">Ajoutez des articles ci-dessus</p>
                ) : (
                  <div className="space-y-2">
                    {/* Header row */}
                    <div className="flex items-center justify-between text-xs text-slate-500 px-2 pb-1 border-b border-slate-700">
                      <span className="flex-1">Désignation</span>
                      <span className="w-20 text-center">Qté</span>
                      <span className="w-20 text-right">P.U.</span>
                      <span className="w-24 text-right">Montant</span>
                      <span className="w-8"></span>
                    </div>
                    {formData.items.map((item, index) => (
                      <div key={index} className="flex items-center justify-between bg-slate-800/50 rounded p-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-white text-sm truncate block">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-1 w-20 justify-center">
                          <Button size="icon" variant="ghost" onClick={() => updateItemQuantity(index, item.quantity - 1)} className="w-5 h-5 text-slate-400 hover:text-white p-0">-</Button>
                          <span className="text-white w-6 text-center text-sm">{item.quantity}</span>
                          <Button size="icon" variant="ghost" onClick={() => updateItemQuantity(index, item.quantity + 1)} className="w-5 h-5 text-slate-400 hover:text-white p-0">+</Button>
                        </div>
                        <span className="text-slate-400 text-xs w-20 text-right">{formatPrice(item.unit_price)} F</span>
                        <span className="text-amber-400 text-sm w-24 text-right font-medium">{formatPrice(item.subtotal)} F</span>
                        <Button size="icon" variant="ghost" onClick={() => removeItemFromForm(index)} className="w-6 h-6 text-red-400 hover:text-red-300 ml-1">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Totals */}
              <div className="bg-slate-900/50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Sous-total:</span>
                  <span className="text-white">{formatPrice(formData.subtotal)} F</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">Remise:</span>
                  <Input
                    type="number"
                    value={formData.discount}
                    onChange={(e) => updateDiscount(e.target.value)}
                    className="w-24 h-8 bg-slate-800 border-slate-700 text-white text-right"
                  />
                </div>
                <div className="flex justify-between text-sm border-t border-slate-700 pt-2">
                  <span className="text-slate-300 font-medium">Montant HT:</span>
                  <span className="text-white font-medium">{formatPrice(formData.subtotal - formData.discount)} F</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">TVA (18%):</span>
                    <button
                      type="button"
                      onClick={toggleTva}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        formData.apply_tva 
                          ? 'bg-green-600/30 text-green-400 hover:bg-green-600/40' 
                          : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                      }`}
                    >
                      {formData.apply_tva ? 'Activée' : 'Désactivée'}
                    </button>
                  </div>
                  <span className="text-white">{formData.apply_tva ? `${formatPrice(formData.tax)} F` : '—'}</span>
                </div>
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-slate-700">
                  <span className="text-white">MONTANT TTC:</span>
                  <span className="text-amber-400">{formatPrice(formData.total)} F CFA</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-slate-700">
            <Button variant="outline" onClick={() => { setShowCreateModal(false); resetForm(); }} className="flex-1 border-slate-600 text-slate-300">
              Annuler
            </Button>
            <Button onClick={handleSubmit} className="flex-1 bg-blue-600 hover:bg-blue-700">
              <CheckCircle className="w-4 h-4 mr-2" />
              {editingProforma ? 'Mettre à jour' : 'Créer la Proforma'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Modal */}
      <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <FileText className="w-6 h-6 text-blue-400" />
              {viewingProforma?.proforma_number}
              {viewingProforma && getStatusBadge(viewingProforma.status)}
            </DialogTitle>
          </DialogHeader>
          
          {viewingProforma && (
            <div className="space-y-4 py-4">
              {/* Client Info */}
              <div className="bg-slate-900/50 rounded-lg p-4">
                <h4 className="text-slate-400 text-sm mb-2">Client</h4>
                <p className="text-white font-medium">{viewingProforma.client_name}</p>
                {viewingProforma.client_phone && <p className="text-slate-300 text-sm">{viewingProforma.client_phone}</p>}
                {viewingProforma.client_email && <p className="text-slate-300 text-sm">{viewingProforma.client_email}</p>}
                {viewingProforma.client_address && <p className="text-slate-300 text-sm">{viewingProforma.client_address}</p>}
              </div>
              
              {/* Items */}
              <div className="bg-slate-900/50 rounded-lg p-4">
                <h4 className="text-slate-400 text-sm mb-2">Articles</h4>
                {/* Header */}
                <div className="flex justify-between text-xs text-slate-500 mb-2 pb-1 border-b border-slate-700">
                  <span className="flex-1">Désignation</span>
                  <span className="w-12 text-center">Qté</span>
                  <span className="w-20 text-right">P.U.</span>
                  <span className="w-24 text-right">Montant</span>
                </div>
                <div className="space-y-2">
                  {viewingProforma.items?.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-white flex-1">{item.name}</span>
                      <span className="text-slate-400 w-12 text-center">{item.quantity}</span>
                      <span className="text-slate-400 w-20 text-right">{formatPrice(item.unit_price)} F</span>
                      <span className="text-amber-400 w-24 text-right">{formatPrice(item.subtotal)} F</span>
                    </div>
                  ))}
                </div>
                {/* Totals */}
                {(() => {
                  const applyTva = viewingProforma.apply_tva !== false;
                  const subtotalCalc = viewingProforma.items?.reduce((sum, item) => sum + item.subtotal, 0) || 0;
                  const discountVal = viewingProforma.discount || 0;
                  const montantHT = subtotalCalc - discountVal;
                  const tvaAmount = applyTva ? Math.round(montantHT * 0.18) : 0;
                  const totalTTC = montantHT + tvaAmount;
                  return (
                    <div className="border-t border-slate-700 mt-3 pt-3 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Sous-total</span>
                        <span className="text-white">{formatPrice(subtotalCalc)} F</span>
                      </div>
                      {discountVal > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-400">Remise</span>
                          <span className="text-red-400">-{formatPrice(discountVal)} F</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-medium">
                        <span className="text-slate-300">Montant HT</span>
                        <span className="text-white">{formatPrice(montantHT)} F</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">TVA (18%)</span>
                        <span className="text-white">{applyTva ? `${formatPrice(tvaAmount)} F` : 'Non applicable'}</span>
                      </div>
                      <div className="flex justify-between font-bold pt-2 border-t border-slate-600">
                        <span className="text-white">Montant TTC</span>
                        <span className="text-amber-400">{formatPrice(totalTTC)} F CFA</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
              
              {/* Validity */}
              <div className="bg-blue-900/30 rounded-lg p-4 text-center">
                <Clock className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                <p className="text-blue-300">Valide jusqu'au {new Date(viewingProforma.valid_until).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
              </div>
              
              {/* Actions */}
              {viewingProforma.status !== 'converted' && (
                <div className="flex gap-2 pt-2">
                  {viewingProforma.status === 'draft' && (
                    <Button onClick={() => { updateStatus(viewingProforma.id, 'sent'); setShowViewModal(false); }} className="flex-1 bg-blue-600 hover:bg-blue-700">
                      <Send className="w-4 h-4 mr-2" />
                      Marquer envoyée
                    </Button>
                  )}
                  {viewingProforma.status === 'sent' && (
                    <>
                      <Button onClick={() => { updateStatus(viewingProforma.id, 'accepted'); setShowViewModal(false); }} className="flex-1 bg-green-600 hover:bg-green-700">
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Acceptée
                      </Button>
                      <Button onClick={() => { updateStatus(viewingProforma.id, 'rejected'); setShowViewModal(false); }} variant="destructive" className="flex-1">
                        <AlertCircle className="w-4 h-4 mr-2" />
                        Refusée
                      </Button>
                    </>
                  )}
                  {viewingProforma.status === 'accepted' && (
                    <Button onClick={() => { convertToInvoice(viewingProforma); setShowViewModal(false); }} className="flex-1 bg-purple-600 hover:bg-purple-700">
                      <ArrowRight className="w-4 h-4 mr-2" />
                      Convertir en Facture
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProformaTab;
