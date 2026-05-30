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
  DollarSign, Printer, ArrowRight, Clock, AlertCircle, Package, Save
} from "lucide-react";
import { toast } from "sonner";
import { LOGO_BASE64 } from "../constants_logo";
import QRCode from "qrcode";

const API = process.env.REACT_APP_BACKEND_URL + '/api';

const ProformaTab = ({ currentUser, formatPrice, catalog }) => {
  const [proformas, setProformas] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [deleteRequests, setDeleteRequests] = useState([]); // Demandes de suppression en attente
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingProforma, setViewingProforma] = useState(null);
  const [editingProforma, setEditingProforma] = useState(null);
  const [showDeleteRequestsModal, setShowDeleteRequestsModal] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    proforma_title: "",
    client_name: "",
    client_phone: "",
    client_email: "",
    client_address: "",
    client_ifu: "",
    items: [],
    subtotal: 0,
    discount: 0,
    tax: 0,
    total: 0,
    notes: "",
    validity_days: 30,
    apply_tva: true,
    tva_exempt_mention: "exonere",  // 'exonere' | 'non_applicable' — used when apply_tva=false
    // Reservation payment conditions
    payment_mode: "total",  // 'total' = paiement intégral avant événement | 'percent' = acompte %
    payment_percentage: 50,  // used when payment_mode = 'percent' (acompte, solde dû avant l'événement)
    // Modalités de paiement acceptées (multi-sélection)
    payment_methods: ["especes", "virement", "mobile_money"],  // possibles: especes | cheque | virement | mobile_money
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
  // Inline edit of an existing item in the proforma items list
  const [editingItemIndex, setEditingItemIndex] = useState(null);
  const [editingItemDraft, setEditingItemDraft] = useState(null);

  const saveEditingItem = (index) => {
    if (!editingItemDraft || !editingItemDraft.name?.trim()) {
      toast.error("Désignation obligatoire");
      return;
    }
    const price = parseFloat(editingItemDraft.unit_price) || 0;
    const qty = parseFloat(editingItemDraft.quantity) || 0;
    const isPreset = !!formData.items[index]?.preset_kind;
    // A preset item is never a label (it always carries a status), even if price=0
    const isLabel = !isPreset && price <= 0;
    const updated = {
      ...formData.items[index],
      name: editingItemDraft.name.trim(),
      quantity: qty,
      unit_price: price,
      subtotal: isLabel ? 0 : qty * price,
      is_label: isLabel,
    };
    const newItems = [...formData.items];
    newItems[index] = updated;
    const { subtotal, tvaAmount, total } = calculateTotals(newItems, formData.discount, formData.apply_tva);
    setFormData({ ...formData, items: newItems, subtotal, tax: tvaAmount, total });
    setEditingItemIndex(null);
    setEditingItemDraft(null);
    toast.success("Article modifié");
  };

  // Add a preset (equipment/service) directly to the items list with default "Fourni" status
  const addPresetItem = (name, kind) => {
    const existingIndex = formData.items.findIndex(i => i.name === name && i.preset_kind === kind);
    let newItems;
    if (existingIndex >= 0) {
      newItems = [...formData.items];
      newItems[existingIndex].quantity = (newItems[existingIndex].quantity || 1) + 1;
      newItems[existingIndex].subtotal = newItems[existingIndex].quantity * (newItems[existingIndex].unit_price || 0);
    } else {
      newItems = [...formData.items, {
        name,
        quantity: 1,
        unit_price: 0,
        subtotal: 0,
        department: "autres",
        preset_kind: kind,         // 'equipment' | 'service'
        provided_status: "fourni", // default: provided
        is_label: false,           // preset items are real items with status, not labels
      }];
    }
    const { subtotal, tvaAmount, total } = calculateTotals(newItems, formData.discount, formData.apply_tva);
    setFormData({ ...formData, items: newItems, subtotal, tax: tvaAmount, total });
    toast.success(`${name} ajouté (Fourni)`);
  };

  // Toggle Fourni / Non fourni for a preset item
  const togglePresetStatus = (index) => {
    const item = formData.items[index];
    if (!item?.preset_kind) return;
    const newItems = [...formData.items];
    newItems[index] = {
      ...item,
      provided_status: item.provided_status === "fourni" ? "non_fourni" : "fourni",
    };
    setFormData({ ...formData, items: newItems });
  };

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
    const price = parseFloat(manualProduct.unit_price) || 0;
    const qty = manualProduct.quantity || 1;
    const isLabelOnly = price <= 0;

    const newItem = {
      name: manualProduct.name.trim(),
      quantity: qty,  // Keep user-entered quantity even for labels (e.g. "50 personnes")
      unit_price: price,
      subtotal: isLabelOnly ? 0 : qty * price,
      department: "autres",
      is_label: isLabelOnly,  // Line without price (section/title/note)
    };
    
    const newItems = [...formData.items, newItem];
    const { subtotal, montantHT, tvaAmount, total } = calculateTotals(newItems, formData.discount, formData.apply_tva);
    setFormData({ ...formData, items: newItems, subtotal, tax: tvaAmount, total });
    
    // Reset manual product form
    setManualProduct({ name: "", quantity: 1, unit_price: 0 });
    toast.success(isLabelOnly ? `Libellé "${newItem.name}" ajouté` : `${newItem.name} ajouté`);
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
      proforma_title: "",
      client_name: "",
      client_phone: "",
      client_email: "",
      client_address: "",
      client_ifu: "",
      items: [],
      subtotal: 0,
      discount: 0,
      tax: 0,
      total: 0,
      notes: "",
      validity_days: 30,
      apply_tva: true,
      tva_exempt_mention: "exonere",
      payment_mode: "total",
      payment_percentage: 50,
      payment_methods: ["especes", "virement", "mobile_money"],
    });
    setEditingProforma(null);
  };

  const openEditModal = (proforma) => {
    setEditingProforma(proforma);
    const applyTva = proforma.apply_tva !== false; // Default to true if not set
    const { subtotal, montantHT, tvaAmount, total } = calculateTotals(proforma.items || [], proforma.discount || 0, applyTva);
    setFormData({
      proforma_title: proforma.proforma_title || "",
      client_name: proforma.client_name,
      client_phone: proforma.client_phone || "",
      client_email: proforma.client_email || "",
      client_address: proforma.client_address || "",
      client_ifu: proforma.client_ifu || "",
      items: proforma.items || [],
      subtotal: subtotal,
      discount: proforma.discount || 0,
      tax: tvaAmount,
      total: total,
      notes: proforma.notes || "",
      validity_days: proforma.validity_days || 30,
      apply_tva: applyTva,
      tva_exempt_mention: proforma.tva_exempt_mention || "exonere",
      payment_mode: proforma.payment_mode || "total",
      payment_percentage: proforma.payment_percentage || 50,
      payment_methods: proforma.payment_methods && proforma.payment_methods.length > 0
        ? proforma.payment_methods
        : ["especes", "virement", "mobile_money"],
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

  // Demande de suppression par la gérante
  const requestDeleteProforma = async (proforma) => {
    if (!confirm(`Demander l'autorisation de supprimer la proforma ${proforma.proforma_number} ?`)) return;
    
    try {
      await axios.post(`${API}/proforma-delete-requests`, {
        proforma_id: proforma.id,
        proforma_number: proforma.proforma_number,
        client_name: proforma.client_name,
        total: proforma.total,
        requested_by: currentUser?.full_name || "Gérante"
      });
      toast.success("Demande de suppression envoyée à l'administrateur");
      fetchDeleteRequests();
    } catch (error) {
      console.error("Error requesting delete:", error);
      toast.error(error.response?.data?.detail || "Erreur lors de la demande");
    }
  };

  // Récupérer les demandes de suppression (pour admin)
  const fetchDeleteRequests = async () => {
    try {
      const res = await axios.get(`${API}/proforma-delete-requests`);
      setDeleteRequests(res.data.requests || []);
    } catch (error) {
      console.error("Error fetching delete requests:", error);
    }
  };

  // Approuver une demande de suppression (admin seulement)
  const approveDeleteRequest = async (request) => {
    if (!confirm(`Approuver la suppression de la proforma ${request.proforma_number} ?`)) return;
    
    try {
      await axios.post(`${API}/proforma-delete-requests/${request.id}/approve`, {
        approved_by: currentUser?.full_name || "Admin"
      });
      toast.success("Proforma supprimée avec succès");
      fetchDeleteRequests();
      fetchProformas();
    } catch (error) {
      console.error("Error approving delete:", error);
      toast.error("Erreur lors de l'approbation");
    }
  };

  // Rejeter une demande de suppression (admin seulement)
  const rejectDeleteRequest = async (request) => {
    if (!confirm(`Rejeter la demande de suppression de ${request.proforma_number} ?`)) return;
    
    try {
      await axios.post(`${API}/proforma-delete-requests/${request.id}/reject`, {
        rejected_by: currentUser?.full_name || "Admin"
      });
      toast.success("Demande rejetée");
      fetchDeleteRequests();
    } catch (error) {
      console.error("Error rejecting delete:", error);
      toast.error("Erreur lors du rejet");
    }
  };

  // Vérifier si une proforma a une demande de suppression en attente
  const hasPendingDeleteRequest = (proformaId) => {
    return deleteRequests.some(r => r.proforma_id === proformaId && r.status === 'pending');
  };

  // Charger les demandes de suppression au démarrage
  useEffect(() => {
    if (currentUser?.role === 'admin') {
      fetchDeleteRequests();
    }
  }, [currentUser]);

  // Function to convert number to French words
  const numberToFrenchWords = (num) => {
    const units = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
    const tens = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];
    
    if (num === 0) return 'zéro';
    if (num < 0) return 'moins ' + numberToFrenchWords(-num);
    
    let words = '';
    
    if (num >= 1000000) {
      const millions = Math.floor(num / 1000000);
      words += (millions === 1 ? 'un million ' : numberToFrenchWords(millions) + ' millions ');
      num %= 1000000;
    }
    
    if (num >= 1000) {
      const thousands = Math.floor(num / 1000);
      words += (thousands === 1 ? 'mille ' : numberToFrenchWords(thousands) + ' mille ');
      num %= 1000;
    }
    
    if (num >= 100) {
      const hundreds = Math.floor(num / 100);
      words += (hundreds === 1 ? 'cent ' : units[hundreds] + ' cent ');
      num %= 100;
      if (num === 0 && hundreds > 1) words = words.trim() + 's ';
    }
    
    if (num >= 20) {
      const ten = Math.floor(num / 10);
      const unit = num % 10;
      
      if (ten === 7 || ten === 9) {
        words += tens[ten] + '-';
        num = (ten === 7 ? 10 : 10) + unit;
      } else {
        words += tens[ten];
        if (unit === 1 && ten !== 8) words += '-et';
        if (unit > 0) words += '-' + units[unit];
        else if (ten === 8) words += 's';
        num = 0;
      }
    }
    
    if (num > 0 && num < 20) {
      words += units[num];
    }
    
    return words.trim().replace(/\s+/g, ' ');
  };

  const printProforma = async (proforma) => {
    const applyTva = proforma.apply_tva !== false;
    const subtotalCalc = proforma.items?.reduce((sum, item) => sum + item.subtotal, 0) || 0;
    const montantHT = subtotalCalc - (proforma.discount || 0);
    const tvaAmount = applyTva ? Math.round(montantHT * 0.18) : 0;
    const totalTTC = montantHT + tvaAmount;
    
    // Convert total to words
    const totalInWords = numberToFrenchWords(totalTTC) + ' francs CFA';
    
    // Format date in French
    const dateCreation = new Date(proforma.created_at);
    const moisFr = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const dateFormatted = `Cotonou, le ${dateCreation.getDate()} ${moisFr[dateCreation.getMonth()]} ${dateCreation.getFullYear()}`;
    
    const proformaNum = proforma.proforma_number || 'N/A';
    
    // Generate QR code data URL pointing to public view
    const publicUrl = `${window.location.origin}/proforma/${proforma.id}`;
    let qrDataUrl = "";
    try {
      qrDataUrl = await QRCode.toDataURL(publicUrl, {
        margin: 1,
        width: 160,
        color: { dark: "#0f172a", light: "#ffffff" },
      });
    } catch (_) {
      qrDataUrl = "";
    }
    
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Proforma ${proforma.proforma_number}</title>
        <style>
          @page { margin: 8mm; size: A4; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { 
            font-family: Arial, Helvetica, sans-serif; 
            padding: 6px 22px; 
            max-width: 800px; 
            margin: 0 auto;
            color: #333;
            font-size: 9.5pt;
            line-height: 1.3;
          }
          
          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
            padding-bottom: 10px;
            border-bottom: 3px solid #1e3a8a;
          }
          .logo-section {
            width: 80px;
            height: 80px;
            flex-shrink: 0;
          }
          .logo-section img {
            width: 100%;
            height: 100%;
            object-fit: contain;
          }
          .header-center {
            flex: 1;
            text-align: center;
            padding: 0 20px;
          }
          .header-center .brand {
            font-size: 17pt;
            font-weight: 700;
            letter-spacing: 1px;
            color: #0f172a;
          }
          .header-center .brand-sub {
            font-size: 8.5pt;
            color: #475569;
            margin-top: 3px;
            letter-spacing: 2px;
            text-transform: uppercase;
          }
          .header-right {
            text-align: right;
            font-size: 8.5pt;
            color: #334155;
            line-height: 1.6;
            white-space: nowrap;
          }
          .header-right strong { color: #0f172a; }
          
          .doc-title-section {
            text-align: center;
            margin: 10px 0 8px;
          }
          .doc-title {
            font-size: 15pt;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 3px;
            color: #1e3a8a;
            margin-bottom: 4px;
          }
          .doc-info-line {
            font-size: 9.5pt;
            color: #475569;
          }
          .doc-number {
            font-weight: 700;
            color: #0f172a;
          }
          
          .client-section {
            margin: 10px 0;
            padding: 10px 14px;
            border: 1px solid #cbd5e1;
            border-left: 4px solid #1e3a8a;
            border-radius: 4px;
            background: #f8fafc;
          }
          .client-label {
            font-weight: bold;
            font-size: 9pt;
            text-transform: uppercase;
            margin-bottom: 5px;
            color: #555;
          }
          .client-name {
            font-size: 11pt;
            font-weight: bold;
            color: #000;
          }
          .client-details {
            font-size: 9pt;
            color: #333;
            margin-top: 5px;
          }
          .client-details p { margin: 2px 0; }
          
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 10px 0;
            font-size: 9pt;
          }
          thead tr {
            background: #0f172a;
            color: #fff;
          }
          th { 
            padding: 8px 9px; 
            text-align: left;
            font-weight: 700;
            text-transform: uppercase;
            font-size: 8pt;
            letter-spacing: 0.4px;
          }
          th:nth-child(2), th:nth-child(3), th:nth-child(4) {
            text-align: right;
          }
          td { 
            padding: 6px 9px; 
            border-bottom: 1px solid #e5e7eb;
            vertical-align: middle;
          }
          tbody tr:nth-child(even) td { background: #fafafa; }
          td:nth-child(2), td:nth-child(3), td:nth-child(4) {
            text-align: right;
          }
          
          .totals-section {
            margin-top: 10px;
            display: flex;
            justify-content: flex-end;
          }
          .totals-table {
            width: 260px;
            font-size: 9pt;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            overflow: hidden;
          }
          .totals-table tr {
            border-bottom: 1px solid #e5e7eb;
          }
          .totals-table td {
            padding: 6px 10px;
          }
          .totals-table .label {
            text-align: left;
            color: #4b5563;
          }
          .totals-table .value {
            text-align: right;
            font-weight: 600;
          }
          .totals-table .total-row {
            background: #1e3a8a;
            color: #fff;
            border: none;
          }
          .totals-table .total-row td {
            font-size: 11pt;
            font-weight: 700;
            padding: 8px 10px;
          }
          
          .amount-words {
            margin-top: 10px;
            padding: 7px 12px;
            background: #eff6ff;
            border-left: 3px solid #1e3a8a;
            font-size: 9pt;
            color: #1e293b;
          }
          .amount-words strong {
            font-weight: 700;
          }
          
          .conditions-section {
            margin-top: 10px;
            padding: 9px 14px;
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            page-break-inside: avoid;
          }
          .conditions-section .title {
            font-size: 9pt;
            font-weight: 700;
            color: #1e293b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 3px;
          }
          .conditions-section .item {
            font-size: 8.5pt;
            color: #334155;
            line-height: 1.45;
            margin: 2px 0;
          }
          .conditions-section .highlight {
            font-weight: 700;
            color: #1e3a8a;
          }
          
          .notes-section {
            margin-top: 8px;
            padding: 7px 12px;
            font-size: 8.5pt;
            font-style: italic;
            color: #4b5563;
            background: #f9fafb;
            border-radius: 4px;
          }
          
          .footer {
            margin-top: 14px;
            padding-top: 10px;
            border-top: 1px solid #e5e7eb;
            page-break-inside: avoid;
          }
          .thank-you {
            text-align: center;
            font-size: 9pt;
            font-style: italic;
            color: #4b5563;
            margin-bottom: 10px;
          }
          .signature-section {
            text-align: right;
            padding-right: 30px;
          }
          .signature-name {
            font-weight: 700;
            font-size: 9.5pt;
            color: #1f2937;
          }
          .signature-title {
            font-size: 8pt;
            color: #6b7280;
            margin-top: 2px;
          }
          
          @media print { 
            body { padding: 5px 18px; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo-section">
            <img src="${LOGO_BASE64}" alt="Logo" />
          </div>
          <div class="header-center">
            <div class="brand">ESPACE MAXO</div>
            <div class="brand-sub">Restaurant &middot; Événementiel &middot; Jeux VR</div>
          </div>
          <div class="header-right">
            <p><strong>Tél</strong> : +229 01 4147 0000</p>
            <p><strong>RCCM</strong> : RB/COT/22 B 32037</p>
            <p>Fidjrossè, Cotonou - Bénin</p>
          </div>
        </div>
        
        <div class="doc-title-section">
          <div class="doc-title">Facture Proforma</div>
          <div class="doc-info-line">
            <span class="doc-number">N° ${proformaNum}</span> &nbsp;|&nbsp; ${dateFormatted}
          </div>
        </div>
        
        <div class="client-section">
          <div class="client-label">Client</div>
          <div class="client-name">${proforma.client_name}</div>
          <div class="client-details">
            ${proforma.client_phone ? `<p>Tél: ${proforma.client_phone}</p>` : ''}
            ${proforma.client_email ? `<p>Email: ${proforma.client_email}</p>` : ''}
            ${proforma.client_address ? `<p>${proforma.client_address}</p>` : ''}
            ${proforma.client_ifu ? `<p><strong>IFU:</strong> ${proforma.client_ifu}</p>` : ''}
          </div>
        </div>
        
        ${proforma.proforma_title ? `
          <div style="margin: 20px 0 10px; padding: 10px 14px; background:#eff6ff; border-left: 4px solid #1e3a8a; border-radius: 4px;">
            <div style="font-size: 11px; color:#1e3a8a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Objet de la réservation</div>
            <div style="font-size: 15px; font-weight: 700; color:#0f172a;">${proforma.proforma_title}</div>
          </div>
        ` : ''}
        
        <table>
          <thead>
            <tr>
              <th style="width: 50%;">Description</th>
              <th style="width: 10%;">Qté</th>
              <th style="width: 20%;">Prix Unit.</th>
              <th style="width: 20%;">Montant</th>
            </tr>
          </thead>
          <tbody>
            ${proforma.items.map(item => {
              const isPreset = !!item.preset_kind;
              const isLabel = !isPreset && (item.is_label || !(item.unit_price > 0));
              if (isLabel) {
                const qty = item.quantity && item.quantity > 0 ? item.quantity : '';
                return `
                  <tr style="background: #eff6ff;">
                    <td style="font-weight: 700; color:#1e3a8a; padding: 8px 10px;">
                      ${item.name}
                    </td>
                    <td style="text-align: right; font-weight: 700; color:#1e3a8a;">${qty}</td>
                    <td style="color:#475569;">—</td>
                    <td style="color:#475569;">—</td>
                  </tr>
                `;
              }
              const statusBadge = isPreset ? (
                item.provided_status === 'non_fourni'
                  ? `<span style="display:inline-block; margin-left:6px; padding:1px 6px; border-radius:8px; background:#fee2e2; color:#991b1b; font-size:9px; font-weight:700; letter-spacing:0.3px; text-transform:uppercase; vertical-align:middle;">Non fourni</span>`
                  : `<span style="display:inline-block; margin-left:6px; padding:1px 6px; border-radius:8px; background:#dcfce7; color:#166534; font-size:9px; font-weight:700; letter-spacing:0.3px; text-transform:uppercase; vertical-align:middle;">Fourni</span>`
              ) : '';
              const priceCell = item.unit_price > 0 ? `${item.unit_price.toLocaleString('fr-FR')} F` : '—';
              const subtotalCell = item.unit_price > 0 ? `${(item.subtotal || 0).toLocaleString('fr-FR')} F` : '—';
              return `
                <tr>
                  <td>${item.name}${statusBadge}</td>
                  <td>${item.quantity}</td>
                  <td>${priceCell}</td>
                  <td>${subtotalCell}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        
        <div class="totals-section">
          <table class="totals-table">
            ${proforma.discount > 0 ? `
              <tr>
                <td class="label">Sous-total</td>
                <td class="value">${subtotalCalc.toLocaleString('fr-FR')} F</td>
              </tr>
              <tr>
                <td class="label">Remise</td>
                <td class="value">-${proforma.discount?.toLocaleString('fr-FR')} F</td>
              </tr>
            ` : ''}
            <tr>
              <td class="label">Montant HT</td>
              <td class="value">${montantHT.toLocaleString('fr-FR')} F</td>
            </tr>
            <tr>
              <td class="label">TVA (18%)</td>
              <td class="value">${applyTva ? tvaAmount.toLocaleString('fr-FR') + ' F' : (proforma.tva_exempt_mention === 'non_applicable' ? 'Non applicable' : 'Exonéré')}</td>
            </tr>
            <tr class="total-row">
              <td class="label">Total TTC</td>
              <td class="value">${totalTTC.toLocaleString('fr-FR')} F CFA</td>
            </tr>
          </table>
        </div>
        
        <div class="amount-words">
          Arrêtée la présente facture proforma à la somme de : <strong>${totalInWords}</strong>
        </div>

        ${(() => {
          const mode = proforma.payment_mode || 'total';
          const pct = proforma.payment_percentage || 50;
          const acompte = Math.round(totalTTC * pct / 100);
          const solde = totalTTC - acompte;
          const validity = proforma.validity_days || 30;
          const methods = proforma.payment_methods && proforma.payment_methods.length > 0
            ? proforma.payment_methods
            : ['especes', 'virement', 'mobile_money'];
          const labels = { especes: 'espèces', cheque: 'chèque', virement: 'virement bancaire', mobile_money: 'Mobile Money' };
          const methodsStr = methods.map(m => labels[m] || m).join(', ');
          let paymentLine = '';
          if (mode === 'percent') {
            paymentLine = `
              <div class="item">• <span class="highlight">Acompte de ${pct}% (${acompte.toLocaleString('fr-FR')} F CFA)</span> à verser à la confirmation de la réservation.</div>
              <div class="item">• <span class="highlight">Solde de ${solde.toLocaleString('fr-FR')} F CFA</span> à régler au plus tard le jour de l'événement, avant le début des prestations.</div>
            `;
          } else {
            paymentLine = `
              <div class="item">• <span class="highlight">Paiement intégral de ${totalTTC.toLocaleString('fr-FR')} F CFA</span> exigé à la confirmation de la réservation, avant la tenue de l'événement.</div>
            `;
          }
          return `
            <div class="conditions-section">
              <div class="title">Conditions de réservation</div>
              ${paymentLine}
              <div class="item">• Modes de paiement acceptés : ${methodsStr}.</div>
              <div class="item">• Proforma valable <span class="highlight">${validity} jour(s)</span> · Annulation &lt; 48h : retenue de l'acompte.</div>
            </div>
          `;
        })()}
        
        ${proforma.notes ? `
          <div class="notes-section">
            <strong>Notes :</strong> ${proforma.notes}
          </div>
        ` : ''}
        
        <div class="footer">
          <p class="thank-you">Nous vous remercions de votre confiance.</p>
          <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 4px;">
            ${qrDataUrl ? `
              <div style="text-align: center; font-size: 7.5pt; color:#475569;">
                <img src="${qrDataUrl}" alt="QR" style="width: 72px; height: 72px; border: 1px solid #e2e8f0; border-radius: 4px; padding: 3px; background: #fff;" />
                <div style="margin-top: 3px; max-width: 100px;">Scanner pour consulter</div>
              </div>
            ` : '<div></div>'}
            <div class="signature-section">
              <p class="signature-name">AHOUANDJINOU Mères</p>
              <p class="signature-title">La Gérante</p>
            </div>
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
          {/* Bouton demandes de suppression pour Admin */}
          {currentUser?.role === 'admin' && deleteRequests.length > 0 && (
            <Button 
              onClick={() => setShowDeleteRequestsModal(true)} 
              variant="outline" 
              className="border-orange-500 text-orange-400 hover:bg-orange-500/20"
            >
              <AlertCircle className="w-4 h-4 mr-2" />
              Demandes ({deleteRequests.length})
            </Button>
          )}
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
                      <p className="text-blue-200 font-bold text-lg">{formatPrice(proforma.total)} F</p>
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
                          {/* Admin peut supprimer directement, Gérante doit demander l'autorisation */}
                          {currentUser?.role === 'admin' ? (
                            <Button size="icon" variant="ghost" onClick={() => deleteProforma(proforma.id)} className="w-8 h-8 text-red-400 hover:text-red-300" title="Supprimer">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          ) : (
                            hasPendingDeleteRequest(proforma.id) ? (
                              <Button size="icon" variant="ghost" disabled className="w-8 h-8 text-yellow-400" title="Demande en attente">
                                <Clock className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button size="icon" variant="ghost" onClick={() => requestDeleteProforma(proforma)} className="w-8 h-8 text-orange-400 hover:text-orange-300" title="Demander la suppression">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )
                          )}
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

      {/* Modal des demandes de suppression (Admin seulement) */}
      {currentUser?.role === 'admin' && deleteRequests.length > 0 && (
        <Dialog open={showDeleteRequestsModal} onOpenChange={setShowDeleteRequestsModal}>
          <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-amber-400 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Demandes de suppression ({deleteRequests.length})
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {deleteRequests.map((request) => (
                <div key={request.id} className="bg-slate-900/50 rounded-lg p-3 border border-slate-700">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-white">{request.proforma_number}</p>
                      <p className="text-sm text-slate-400">{request.client_name}</p>
                      <p className="text-sm text-blue-200">{formatPrice(request.total)} F CFA</p>
                    </div>
                    <Badge className="bg-yellow-500/20 text-yellow-400">En attente</Badge>
                  </div>
                  <p className="text-xs text-slate-500 mb-2">
                    Demandé par: {request.requested_by} • {new Date(request.created_at).toLocaleDateString('fr-FR')}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => approveDeleteRequest(request)} className="flex-1 bg-green-600 hover:bg-green-700">
                      <CheckCircle className="w-4 h-4 mr-1" /> Approuver
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => rejectDeleteRequest(request)} className="flex-1 border-red-500 text-red-400 hover:bg-red-500/20">
                      Rejeter
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
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
          
          <div className="space-y-4 py-4">
            {/* Titre général de la proforma (optionnel) */}
            <div>
              <Label className="text-slate-400 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                Titre général de la réservation (optionnel)
              </Label>
              <Input
                value={formData.proforma_title}
                onChange={(e) => setFormData({ ...formData, proforma_title: e.target.value })}
                placeholder='Ex: "Réservation Anniversaire 12 ans" ou "Mariage Famille KOFFI"'
                className="bg-slate-900/50 border-slate-700 text-white mt-1"
                data-testid="proforma-title-input"
              />
              <p className="text-slate-500 text-xs mt-1">
                S'affichera en haut de la proforma imprimée, sous le numéro.
              </p>
            </div>
          </div>
          
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
                <Label className="text-slate-400 text-sm">Numéro IFU</Label>
                <Input
                  value={formData.client_ifu}
                  onChange={(e) => setFormData({ ...formData, client_ifu: e.target.value })}
                  placeholder="Identifiant Fiscal Unique"
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
                      <Label className="text-slate-500 text-xs">Prix unitaire (F CFA)</Label>
                      <Input
                        data-testid="proforma-item-price"
                        type="number"
                        min="0"
                        value={manualProduct.unit_price}
                        onChange={(e) => setManualProduct({ ...manualProduct, unit_price: parseFloat(e.target.value) || 0 })}
                        placeholder="0 = libellé sans prix"
                        className="bg-slate-800 border-slate-600 text-white mt-1"
                      />
                    </div>
                  </div>
                  <p className="text-slate-500 text-[11px] -mt-2">
                    💡 Laissez le prix à <span className="text-amber-400">0</span> pour ajouter un libellé/section sans montant (ex : "— Prestations incluses —", "Forfait à confirmer").
                  </p>
                  <Button 
                    data-testid="proforma-add-item-btn"
                    onClick={addManualProduct}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter l'article
                  </Button>

                  {/* Services prédéfinis cliquables */}
                  <div className="border-t border-slate-700 pt-2 mt-1">
                    <p className="text-slate-400 text-xs font-medium mb-1.5">📦 Équipements (1 clic = ajoute la ligne avec statut <span className="text-emerald-400 font-semibold">Fourni</span>, basculable dans le tableau)</p>
                    <div className="flex flex-wrap gap-1">
                      {[
                        "Tables", "Chaises", "Tables et chaises",
                        "Sonorisation", "Microphone", "Vidéo projecteur", "Écran",
                        "Nappes", "Serviettes", "Vaisselle",
                      ].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => addPresetItem(s, "equipment")}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-emerald-600/30 hover:border-emerald-500 border border-slate-700 text-slate-300 text-xs transition-colors"
                          data-testid={`preset-eq-${s.replace(/\s+/g, '-').toLowerCase()}`}
                        >
                          + {s}
                        </button>
                      ))}
                    </div>

                    <p className="text-slate-400 text-xs font-medium mt-3 mb-1.5">🎯 Autres services / animations (statut <span className="text-emerald-400 font-semibold">Fourni</span> par défaut)</p>
                    <div className="flex flex-wrap gap-1">
                      {[
                        "Agents", "Cuisinier", "DJ / Animation",
                        "Décoration florale", "Photographe",
                        "Table de billard", "Trampoline", "Château gonflable",
                        "Animation enfants", "Sécurité",
                      ].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => addPresetItem(s, "service")}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-violet-600/30 hover:border-violet-500 border border-slate-700 text-slate-300 text-xs transition-colors"
                          data-testid={`preset-svc-${s.replace(/\s+/g, '-').toLowerCase()}`}
                        >
                          + {s}
                        </button>
                      ))}
                    </div>
                  </div>
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
                    {formData.items.map((item, index) => {
                      const isPreset = !!item.preset_kind;
                      const isLabel = !isPreset && (item.is_label || (!(item.unit_price > 0)));
                      const isEditing = editingItemIndex === index;
                      if (isEditing) {
                        return (
                          <div key={index} className="bg-blue-900/30 border border-blue-500/50 rounded p-2 space-y-2" data-testid={`edit-item-${index}`}>
                            <Input
                              autoFocus
                              value={editingItemDraft.name}
                              onChange={(e) => setEditingItemDraft({ ...editingItemDraft, name: e.target.value })}
                              placeholder="Désignation"
                              className="bg-slate-800 border-slate-600 text-white text-sm h-8"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                type="number" min="0"
                                value={editingItemDraft.quantity}
                                onChange={(e) => setEditingItemDraft({ ...editingItemDraft, quantity: parseFloat(e.target.value) || 0 })}
                                placeholder="Qté"
                                className="bg-slate-800 border-slate-600 text-white text-sm h-8"
                              />
                              <Input
                                type="number" min="0"
                                value={editingItemDraft.unit_price}
                                onChange={(e) => setEditingItemDraft({ ...editingItemDraft, unit_price: parseFloat(e.target.value) || 0 })}
                                placeholder="Prix unit. (0 = libellé)"
                                className="bg-slate-800 border-slate-600 text-white text-sm h-8"
                              />
                            </div>
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" onClick={() => { setEditingItemIndex(null); setEditingItemDraft(null); }} variant="ghost" className="h-7 text-xs text-slate-400">
                                Annuler
                              </Button>
                              <Button size="sm" onClick={() => saveEditingItem(index)} className="h-7 text-xs bg-blue-600 hover:bg-blue-700" data-testid={`save-edit-${index}`}>
                                <Save className="w-3 h-3 mr-1" /> Enregistrer
                              </Button>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={index} className={`flex items-center justify-between rounded p-2 ${isLabel ? 'bg-amber-900/20 border border-amber-500/30' : (isPreset ? (item.provided_status === 'non_fourni' ? 'bg-rose-900/20 border border-rose-500/30' : 'bg-emerald-900/20 border border-emerald-500/30') : 'bg-slate-800/50')}`}>
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span className={`text-sm truncate block ${isLabel ? 'text-amber-200 italic' : 'text-white'}`}>
                              {isLabel && <span className="text-amber-400 mr-1">📝</span>}
                              {isPreset && (
                                <span className="mr-1" title={item.preset_kind === 'equipment' ? 'Équipement' : 'Service'}>
                                  {item.preset_kind === 'equipment' ? '📦' : '🎯'}
                                </span>
                              )}
                              {item.name}
                            </span>
                            {isPreset && (
                              <button
                                type="button"
                                onClick={() => togglePresetStatus(index)}
                                title="Cliquer pour basculer"
                                data-testid={`toggle-status-${index}`}
                                className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide transition-colors ${
                                  item.provided_status === 'non_fourni'
                                    ? 'bg-rose-500/30 text-rose-300 hover:bg-rose-500/40 border border-rose-500/50'
                                    : 'bg-emerald-500/30 text-emerald-300 hover:bg-emerald-500/40 border border-emerald-500/50'
                                }`}
                              >
                                {item.provided_status === 'non_fourni' ? '✗ Non fourni' : '✓ Fourni'}
                              </button>
                            )}
                          </div>
                          {isLabel ? (
                            <span className="text-amber-300/70 text-[10px] italic w-44 text-center">— libellé sans prix —</span>
                          ) : (
                            <>
                              <div className="flex items-center gap-1 w-20 justify-center">
                                <Button size="icon" variant="ghost" onClick={() => updateItemQuantity(index, item.quantity - 1)} className="w-5 h-5 text-slate-400 hover:text-white p-0">-</Button>
                                <span className="text-white w-6 text-center text-sm">{item.quantity}</span>
                                <Button size="icon" variant="ghost" onClick={() => updateItemQuantity(index, item.quantity + 1)} className="w-5 h-5 text-slate-400 hover:text-white p-0">+</Button>
                              </div>
                              <span className="text-slate-400 text-xs w-20 text-right">{item.unit_price > 0 ? `${formatPrice(item.unit_price)} F` : '—'}</span>
                              <span className="text-blue-300 text-sm w-24 text-right font-medium">{item.unit_price > 0 ? `${formatPrice(item.subtotal)} F` : '—'}</span>
                            </>
                          )}
                          <Button
                            size="icon" variant="ghost"
                            onClick={() => { setEditingItemIndex(index); setEditingItemDraft({ ...item }); }}
                            className="w-6 h-6 text-blue-400 hover:text-blue-300 ml-1"
                            title="Modifier"
                            data-testid={`edit-item-btn-${index}`}
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => removeItemFromForm(index)} className="w-6 h-6 text-red-400 hover:text-red-300 ml-1">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      );
                    })}
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
                {/* TVA exempt mention: exonéré vs non applicable */}
                {!formData.apply_tva && (
                  <div className="flex items-center justify-between text-xs bg-slate-900/40 rounded px-2 py-1.5">
                    <span className="text-slate-500">Mention TVA :</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, tva_exempt_mention: "exonere" })}
                        className={`px-2 py-1 rounded text-xs ${formData.tva_exempt_mention === "exonere" ? "bg-blue-600/30 text-blue-300" : "text-slate-400 hover:bg-slate-700"}`}
                        data-testid="tva-mention-exonere"
                      >
                        Exonéré
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, tva_exempt_mention: "non_applicable" })}
                        className={`px-2 py-1 rounded text-xs ${formData.tva_exempt_mention === "non_applicable" ? "bg-blue-600/30 text-blue-300" : "text-slate-400 hover:bg-slate-700"}`}
                        data-testid="tva-mention-non-applicable"
                      >
                        Non applicable
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-slate-700">
                  <span className="text-white">MONTANT TTC:</span>
                  <span className="text-blue-950 bg-white px-3 py-1 rounded shadow-sm">{formatPrice(formData.total)} F CFA</span>
                </div>
              </div>
            </div>
          </div>

          {/* Conditions de réservation */}
          <div className="border-t border-slate-700 pt-4">
            <Label className="text-slate-300 text-sm font-medium flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-blue-400" />
              Conditions de réservation
            </Label>
            <p className="text-slate-500 text-xs mb-2">À respecter par le client avant la tenue de l'événement.</p>
            <div className="flex gap-2 flex-wrap mb-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, payment_mode: "total" })}
                className={`px-3 py-1.5 rounded text-sm ${formData.payment_mode === "total" ? "bg-blue-600/30 text-blue-300 border border-blue-500/40" : "bg-slate-800 text-slate-400 border border-slate-700"}`}
                data-testid="payment-mode-total"
              >
                Paiement intégral
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, payment_mode: "percent" })}
                className={`px-3 py-1.5 rounded text-sm ${formData.payment_mode === "percent" ? "bg-blue-600/30 text-blue-300 border border-blue-500/40" : "bg-slate-800 text-slate-400 border border-slate-700"}`}
                data-testid="payment-mode-percent"
              >
                Acompte en %
              </button>
            </div>
            {formData.payment_mode === "percent" && (
              <div className="flex items-center gap-2">
                <Label className="text-slate-400 text-xs">Pourcentage acompte :</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={formData.payment_percentage}
                  onChange={(e) => setFormData({ ...formData, payment_percentage: Math.min(100, Math.max(1, parseInt(e.target.value) || 1)) })}
                  className="w-20 h-8 bg-slate-800 border-slate-700 text-white text-right"
                  data-testid="payment-percentage-input"
                />
                <span className="text-slate-400 text-sm">%</span>
                <span className="text-slate-500 text-xs ml-2">
                  = <span className="text-blue-300 font-semibold">{formatPrice(Math.round(formData.total * formData.payment_percentage / 100))} F</span> à payer à la réservation
                </span>
              </div>
            )}

            {/* Modalités de paiement acceptées (multi-sélection) */}
            <div className="mt-3">
              <Label className="text-slate-400 text-xs">Modalités de paiement acceptées :</Label>
              <div className="flex gap-2 flex-wrap mt-1">
                {[
                  { id: "especes", label: "Espèces" },
                  { id: "cheque", label: "Chèque" },
                  { id: "virement", label: "Virement bancaire" },
                  { id: "mobile_money", label: "Mobile Money" },
                ].map((m) => {
                  const active = formData.payment_methods?.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        const current = formData.payment_methods || [];
                        const next = active ? current.filter(x => x !== m.id) : [...current, m.id];
                        setFormData({ ...formData, payment_methods: next });
                      }}
                      className={`px-3 py-1.5 rounded text-sm border transition-colors ${
                        active
                          ? "bg-emerald-600/30 text-emerald-200 border-emerald-500/60"
                          : "bg-slate-800 text-slate-400 border-slate-700 hover:border-emerald-500/40"
                      }`}
                      data-testid={`payment-method-${m.id}`}
                    >
                      {active ? "✓ " : ""}{m.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-slate-500 text-xs mt-1">
                Cliquez pour activer / désactiver les modes acceptés. Ils apparaîtront dans les conditions du PDF.
              </p>
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
                {viewingProforma.client_ifu && <p className="text-slate-300 text-sm">IFU: {viewingProforma.client_ifu}</p>}
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
