import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  Calendar, Building2, TreePine, Gamepad2, Plus, Edit2, Trash2, 
  Users, Clock, Phone, DollarSign, CheckCircle, X, Eye, FileText, Printer, Receipt
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Caution amount
const CAUTION_AMOUNT = 50000;

const SPACE_CONFIG = {
  salle_fete: { 
    label: "Salle de Fête", 
    icon: Building2, 
    color: "text-purple-400",
    bgColor: "bg-purple-900/30",
    borderColor: "border-purple-500/50",
    defaultPrice: 50000
  },
  espace_jardin: { 
    label: "Espace Jardin", 
    icon: TreePine, 
    color: "text-green-400",
    bgColor: "bg-green-900/30",
    borderColor: "border-green-500/50",
    defaultPrice: 30000
  },
  salle_jeux: { 
    label: "Salle de Jeux", 
    icon: Gamepad2, 
    color: "text-blue-400",
    bgColor: "bg-blue-900/30",
    borderColor: "border-blue-500/50",
    defaultPrice: 25000
  }
};

const EVENT_TYPES = [
  "Anniversaire",
  "Mariage",
  "Baptême",
  "Réunion d'entreprise",
  "Conférence",
  "Fête privée",
  "Séminaire",
  "Autre"
];

const LocationsTab = ({ currentUser, formatPrice }) => {
  const [locations, setLocations] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [viewingLocation, setViewingLocation] = useState(null);
  const [filterSpace, setFilterSpace] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  
  const [formData, setFormData] = useState({
    space_type: "salle_fete",
    customer_name: "",
    customer_phone: "",
    reservation_date: "",
    start_time: "",
    end_time: "",
    number_of_guests: 1,
    event_type: "",
    rental_amount: 50000,
    deposit_amount: 0,
    notes: ""
  });

  const isAdmin = currentUser?.role === 'admin';
  const isManager = currentUser?.role === 'manager';
  const canManageLocations = isAdmin || isManager; // Both can create/edit/delete

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      const res = await axios.get(`${API}/locations`);
      setLocations(res.data.locations || []);
    } catch (error) {
      console.error("Error fetching locations:", error);
      toast.error("Erreur lors du chargement des locations");
    }
  };

  const handleSpaceChange = (spaceType) => {
    setFormData({
      ...formData,
      space_type: spaceType,
      rental_amount: SPACE_CONFIG[spaceType]?.defaultPrice || 50000
    });
  };

  const handleSubmit = async () => {
    if (!formData.customer_name || !formData.customer_phone || !formData.reservation_date) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }

    try {
      if (editingLocation) {
        await axios.put(`${API}/locations/${editingLocation.id}`, formData);
        toast.success("Location modifiée avec succès");
      } else {
        await axios.post(`${API}/locations`, formData);
        toast.success("Location créée avec succès");
      }
      setShowModal(false);
      setEditingLocation(null);
      resetForm();
      fetchLocations();
    } catch (error) {
      console.error("Error saving location:", error);
      toast.error("Erreur lors de l'enregistrement");
    }
  };

  const handleDelete = async (locationId) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cette réservation ?")) return;
    
    try {
      await axios.delete(`${API}/locations/${locationId}`);
      toast.success("Location supprimée");
      fetchLocations();
    } catch (error) {
      console.error("Error deleting location:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleStatusChange = async (locationId, newStatus) => {
    try {
      await axios.put(`${API}/locations/${locationId}`, { status: newStatus });
      toast.success("Statut mis à jour");
      fetchLocations();
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Erreur lors de la mise à jour");
    }
  };

  const openEditModal = (location) => {
    setEditingLocation(location);
    setFormData({
      space_type: location.space_type,
      customer_name: location.customer_name,
      customer_phone: location.customer_phone,
      reservation_date: location.reservation_date,
      start_time: location.start_time,
      end_time: location.end_time,
      number_of_guests: location.number_of_guests,
      event_type: location.event_type || "",
      rental_amount: location.rental_amount,
      deposit_amount: location.deposit_amount || 0,
      notes: location.notes || ""
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      space_type: "salle_fete",
      customer_name: "",
      customer_phone: "",
      reservation_date: "",
      start_time: "",
      end_time: "",
      number_of_guests: 1,
      event_type: "",
      rental_amount: 50000,
      deposit_amount: 0,
      notes: ""
    });
  };

  // Get specific rules for each space type
  const getSpaceSpecificRules = (spaceType) => {
    switch (spaceType) {
      case 'salle_fete':
        return `
          <div class="rules rules-salle">
            <h3>🎉 CONDITIONS SPÉCIFIQUES - SALLE DE FÊTE</h3>
            <p><strong>La Salle de Fête est un espace clos et équipé. Le locataire s'engage à :</strong></p>
            <ul>
              <li><strong>RESPECT DU MATÉRIEL</strong> : Tables, chaises, nappes et équipements fournis doivent être restitués en bon état.</li>
              <li><strong>DÉCORATION</strong> : Aucune fixation au mur (clous, vis, adhésifs forts) sans autorisation préalable.</li>
              <li><strong>SONORISATION</strong> : Le volume sonore doit respecter les normes de voisinage. Réduction obligatoire après 23h.</li>
              <li><strong>CAPACITÉ MAXIMALE</strong> : Ne pas dépasser le nombre de personnes autorisé pour des raisons de sécurité.</li>
              <li><strong>CUISINE</strong> : L'utilisation de la cuisine doit être faite dans le respect des règles d'hygiène.</li>
              <li><strong>NETTOYAGE</strong> : La salle doit être rendue balayée et débarrassée des déchets.</li>
              <li><strong>INTERDICTION DE FUMER</strong> : Il est strictement interdit de fumer à l'intérieur de la salle.</li>
            </ul>
            <p style="color: #856404; font-weight: bold;">⚠️ Tout dommage constaté sur le mobilier ou les installations entraînera la retenue de la caution.</p>
          </div>
        `;
      case 'espace_jardin':
        return `
          <div class="rules rules-garden">
            <h3>🌿 CONDITIONS SPÉCIFIQUES - ESPACE JARDIN</h3>
            <p><strong>L'Espace Jardin est un espace vert qui nécessite un soin particulier. Le locataire s'engage à :</strong></p>
            <ul>
              <li><strong>PRÉSERVER L'ÉTAT DE L'ESPACE VERT</strong> : Ne pas arracher, piétiner ou endommager les plantes, fleurs et pelouse.</li>
              <li><strong>INTERDICTION DE DANSER SUR LA PELOUSE</strong> : Les danses et activités physiques intenses doivent se faire uniquement sur les zones pavées ou prévues à cet effet.</li>
              <li><strong>NE PAS PLANTER DE PIQUETS OU STRUCTURES</strong> dans le sol sans autorisation préalable.</li>
              <li><strong>INTERDICTION DE FEUX</strong> : Aucun feu, barbecue ou source de chaleur directement sur l'herbe.</li>
              <li><strong>GESTION DES DÉCHETS</strong> : Tous les déchets doivent être ramassés et déposés dans les poubelles prévues.</li>
              <li><strong>PROTECTION DES ARBRES</strong> : Ne rien accrocher aux arbres sans autorisation (décorations, hamacs, etc.).</li>
              <li><strong>VÉHICULES INTERDITS</strong> : Aucun véhicule motorisé n'est autorisé sur l'espace vert.</li>
              <li><strong>ARROSAGE</strong> : Ne pas gêner le système d'arrosage automatique s'il est en place.</li>
            </ul>
            <p style="color: #155724; font-weight: bold;">⚠️ Tout dommage constaté sur l'espace vert entraînera la retenue totale ou partielle de la caution, et pourra faire l'objet d'une facturation supplémentaire.</p>
          </div>
        `;
      case 'salle_jeux':
        return `
          <div class="rules rules-jeux">
            <h3>🎮 CONDITIONS SPÉCIFIQUES - SALLE DE JEUX</h3>
            <p><strong>La Salle de Jeux contient du matériel électronique et ludique de valeur. Le locataire s'engage à :</strong></p>
            <ul>
              <li><strong>MANIPULATION DU MATÉRIEL</strong> : Les consoles, manettes, casques VR et autres équipements doivent être manipulés avec soin.</li>
              <li><strong>SUPERVISION DES ENFANTS</strong> : Les enfants de moins de 12 ans doivent être supervisés en permanence par un adulte.</li>
              <li><strong>NOURRITURE ET BOISSONS</strong> : Interdiction de consommer nourriture et boissons à proximité des équipements électroniques.</li>
              <li><strong>SIGNALEMENT DE PANNE</strong> : Tout dysfonctionnement doit être signalé immédiatement au personnel.</li>
              <li><strong>CASQUES VR</strong> : Les casques de réalité virtuelle doivent être utilisés conformément aux instructions données.</li>
              <li><strong>BILLARD</strong> : Ne pas s'asseoir sur les tables de billard. Utiliser la craie uniquement sur les queues.</li>
              <li><strong>BABY-FOOT</strong> : Ne pas faire tourner les barres à 360°.</li>
              <li><strong>TEMPS D'UTILISATION</strong> : Respecter les créneaux horaires attribués pour chaque équipement.</li>
            </ul>
            <p style="color: #0c5460; font-weight: bold;">⚠️ Tout équipement endommagé ou cassé sera facturé au prix de remplacement. La caution sera retenue en conséquence.</p>
          </div>
        `;
      default:
        return '';
    }
  };

  // Generate and print contract for single or multiple spaces
  const generateContract = (location, additionalSpaces = []) => {
    const spaceConfig = SPACE_CONFIG[location.space_type] || SPACE_CONFIG.salle_fete;
    const allSpaces = [location.space_type, ...additionalSpaces];
    const isMultiSpace = additionalSpaces.length > 0;
    
    // Calculate total for multi-space
    let totalAmount = location.rental_amount;
    let spacesLabel = spaceConfig.label;
    
    if (isMultiSpace) {
      spacesLabel = allSpaces.map(s => SPACE_CONFIG[s]?.label || s).join(' + ');
      // For demo, we just use the location amount
    }

    const contractHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Contrat de Location - Espace Maxo</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; line-height: 1.6; font-size: 14px; }
          h1 { text-align: center; color: #1a1a2e; border-bottom: 3px solid #16213e; padding-bottom: 10px; font-size: 24px; }
          h2 { color: #16213e; margin-top: 20px; font-size: 16px; }
          .header { text-align: center; margin-bottom: 20px; }
          .contract-type { background: ${isMultiSpace ? '#6f42c1' : spaceConfig.color === 'text-purple-400' ? '#6f42c1' : spaceConfig.color === 'text-green-400' ? '#28a745' : '#17a2b8'}; color: white; padding: 8px 20px; border-radius: 20px; display: inline-block; margin: 10px 0; font-weight: bold; }
          .info-box { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #dee2e6; }
          .info-row { display: flex; justify-content: space-between; margin: 6px 0; padding: 4px 0; border-bottom: 1px dotted #dee2e6; }
          .info-row:last-child { border-bottom: none; }
          .label { font-weight: bold; color: #333; }
          .value { color: #495057; }
          .amount { font-size: 1.1em; color: #dc3545; font-weight: bold; }
          .rules { background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin: 15px 0; }
          .rules-garden { background: #d4edda; border-left-color: #28a745; }
          .rules-salle { background: #e7e3ff; border-left-color: #6f42c1; }
          .rules-jeux { background: #d1ecf1; border-left-color: #17a2b8; }
          .rules h3 { margin-top: 0; font-size: 14px; }
          .rules ul { margin: 10px 0; padding-left: 20px; }
          .rules li { margin: 6px 0; font-size: 13px; }
          .signature-section { margin-top: 30px; display: flex; justify-content: space-between; page-break-inside: avoid; }
          .signature-box { width: 45%; text-align: center; }
          .signature-line { border-top: 1px solid #333; margin-top: 50px; padding-top: 8px; font-size: 12px; }
          .caution-box { background: #f8d7da; padding: 15px; border-radius: 8px; border: 2px solid #f5c6cb; margin: 15px 0; }
          .caution-box h3 { color: #721c24; margin-top: 0; font-size: 14px; }
          .footer { margin-top: 20px; text-align: center; font-size: 11px; color: #6c757d; border-top: 1px solid #dee2e6; padding-top: 10px; }
          @media print { 
            body { padding: 10px; font-size: 12px; }
            .rules { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>CONTRAT DE LOCATION</h1>
          <div class="contract-type">${isMultiSpace ? '📦 PACK COMBINÉ' : location.space_type === 'salle_fete' ? '🎉 SALLE DE FÊTE' : location.space_type === 'espace_jardin' ? '🌿 ESPACE JARDIN' : '🎮 SALLE DE JEUX'}</div>
          <p><strong>ESPACE MAXO</strong><br>Fidjrossè Plage, Cotonou<br>Tél: +229 91 00 50 84</p>
        </div>

        <div class="info-box">
          <h2 style="margin-top: 0;">📋 Informations de la Réservation</h2>
          <div class="info-row"><span class="label">Espace(s) loué(s) :</span><span class="value" style="color: #6f42c1; font-weight: bold;">${spacesLabel}</span></div>
          <div class="info-row"><span class="label">Client :</span><span class="value">${location.customer_name}</span></div>
          <div class="info-row"><span class="label">Téléphone :</span><span class="value">${location.customer_phone}</span></div>
          <div class="info-row"><span class="label">Date de l'événement :</span><span class="value">${location.reservation_date}</span></div>
          <div class="info-row"><span class="label">Horaires :</span><span class="value">${location.start_time} - ${location.end_time}</span></div>
          <div class="info-row"><span class="label">Nombre de personnes :</span><span class="value">${location.number_of_guests} personnes</span></div>
          <div class="info-row"><span class="label">Type d'événement :</span><span class="value">${location.event_type || 'Non précisé'}</span></div>
        </div>

        <div class="info-box">
          <h2 style="margin-top: 0;">💰 Conditions Financières</h2>
          <div class="info-row"><span class="label">Montant de la location :</span><span class="amount">${formatPrice(location.rental_amount)} F CFA</span></div>
          <div class="info-row"><span class="label">Acompte versé :</span><span class="value">${formatPrice(location.deposit_paid || 0)} F CFA</span></div>
          <div class="info-row"><span class="label">Solde restant :</span><span class="value" style="color: #dc3545;">${formatPrice(location.balance_remaining || 0)} F CFA</span></div>
        </div>

        <div class="caution-box">
          <h3>⚠️ CAUTION OBLIGATOIRE</h3>
          <p>Une caution de <strong>${formatPrice(CAUTION_AMOUNT)} F CFA</strong> est exigée avant la mise à disposition de l'espace.</p>
          <p>Cette caution sera restituée intégralement après l'événement, sous réserve que :</p>
          <ul style="margin: 8px 0; padding-left: 20px; font-size: 13px;">
            <li>L'espace soit rendu dans son état initial</li>
            <li>Aucune dégradation ne soit constatée</li>
            <li>Toutes les conditions du présent contrat soient respectées</li>
          </ul>
        </div>

        <div class="rules">
          <h3>📋 CONDITIONS GÉNÉRALES</h3>
          <ul>
            <li>Le locataire s'engage à respecter les horaires convenus.</li>
            <li>Tout dépassement horaire sera facturé selon le tarif en vigueur.</li>
            <li>Le locataire est responsable des dommages causés pendant la durée de la location.</li>
            <li>L'espace doit être laissé propre et en ordre après utilisation.</li>
            <li>La sous-location est strictement interdite.</li>
            <li>Le nombre maximum de personnes indiqué doit être respecté.</li>
          </ul>
        </div>

        ${allSpaces.map(space => getSpaceSpecificRules(space)).join('')}

        <div class="signature-section">
          <div class="signature-box">
            <p><strong>Le Locataire</strong></p>
            <p style="font-size: 12px;">Lu et approuvé,<br>"Bon pour accord"</p>
            <div class="signature-line">${location.customer_name}</div>
          </div>
          <div class="signature-box">
            <p><strong>Espace Maxo</strong></p>
            <p style="font-size: 12px;">Le Responsable</p>
            <div class="signature-line">Signature et cachet</div>
          </div>
        </div>

        <div class="footer">
          <p>Contrat N° ${location.id?.substring(0, 8).toUpperCase() || 'XXXX'} - Établi le ${new Date().toLocaleDateString('fr-FR')} à Cotonou</p>
          <p><strong>ESPACE MAXO</strong> - Fidjrossè Plage, Cotonou - Tél: +229 91 00 50 84</p>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(contractHTML);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  // Convert location to invoice
  const convertToInvoice = async (location) => {
    const spaceConfig = SPACE_CONFIG[location.space_type] || SPACE_CONFIG.salle_fete;
    
    // Generate invoice HTML
    const invoiceNumber = `FAC-LOC-${Date.now().toString().slice(-6)}`;
    const invoiceHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Facture ${invoiceNumber} - Espace Maxo</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; line-height: 1.5; }
          .invoice-header { display: flex; justify-content: space-between; align-items: start; border-bottom: 3px solid #1a1a2e; padding-bottom: 20px; margin-bottom: 20px; }
          .company-info { text-align: left; }
          .company-info h1 { margin: 0; color: #1a1a2e; font-size: 28px; }
          .invoice-info { text-align: right; }
          .invoice-number { font-size: 24px; color: #dc3545; font-weight: bold; }
          .client-section { display: flex; justify-content: space-between; margin: 20px 0; }
          .client-box, .event-box { width: 48%; background: #f8f9fa; padding: 15px; border-radius: 8px; }
          .client-box h3, .event-box h3 { margin-top: 0; color: #1a1a2e; border-bottom: 2px solid #dee2e6; padding-bottom: 8px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th { background: #1a1a2e; color: white; padding: 12px; text-align: left; }
          td { padding: 12px; border-bottom: 1px solid #dee2e6; }
          .text-right { text-align: right; }
          .total-section { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-top: 20px; }
          .total-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dotted #dee2e6; }
          .total-row:last-child { border-bottom: none; }
          .grand-total { font-size: 20px; color: #dc3545; font-weight: bold; background: #1a1a2e; color: white; padding: 15px; border-radius: 8px; margin-top: 10px; }
          .payment-info { margin-top: 20px; padding: 15px; background: #d4edda; border-radius: 8px; border-left: 4px solid #28a745; }
          .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #6c757d; border-top: 1px solid #dee2e6; padding-top: 15px; }
          .status-badge { display: inline-block; padding: 5px 15px; border-radius: 20px; font-weight: bold; }
          .status-paid { background: #d4edda; color: #155724; }
          .status-partial { background: #fff3cd; color: #856404; }
          .status-pending { background: #f8d7da; color: #721c24; }
          @media print { body { padding: 10px; } }
        </style>
      </head>
      <body>
        <div class="invoice-header">
          <div class="company-info">
            <h1>ESPACE MAXO</h1>
            <p>Fidjrossè Plage, Cotonou<br>
            Tél: +229 91 00 50 84<br>
            Email: contact@espacemaxo.com</p>
          </div>
          <div class="invoice-info">
            <div class="invoice-number">${invoiceNumber}</div>
            <p><strong>Date :</strong> ${new Date().toLocaleDateString('fr-FR')}<br>
            <strong>Échéance :</strong> ${location.reservation_date}</p>
            <span class="status-badge ${location.balance_remaining <= 0 ? 'status-paid' : location.deposit_paid > 0 ? 'status-partial' : 'status-pending'}">
              ${location.balance_remaining <= 0 ? '✓ PAYÉE' : location.deposit_paid > 0 ? '◐ ACOMPTE VERSÉ' : '○ EN ATTENTE'}
            </span>
          </div>
        </div>

        <div class="client-section">
          <div class="client-box">
            <h3>👤 Client</h3>
            <p><strong>${location.customer_name}</strong><br>
            Tél: ${location.customer_phone}</p>
          </div>
          <div class="event-box">
            <h3>📅 Événement</h3>
            <p><strong>Type :</strong> ${location.event_type || 'Non précisé'}<br>
            <strong>Date :</strong> ${location.reservation_date}<br>
            <strong>Horaires :</strong> ${location.start_time} - ${location.end_time}<br>
            <strong>Personnes :</strong> ${location.number_of_guests}</p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Désignation</th>
              <th>Qté</th>
              <th class="text-right">Prix Unit.</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>Location ${spaceConfig.label}</strong><br>
                <small style="color: #6c757d;">Du ${location.start_time} au ${location.end_time}</small>
              </td>
              <td>1</td>
              <td class="text-right">${formatPrice(location.rental_amount)} F</td>
              <td class="text-right"><strong>${formatPrice(location.rental_amount)} F</strong></td>
            </tr>
            <tr>
              <td>
                <strong>Caution (remboursable)</strong><br>
                <small style="color: #6c757d;">Restituée après vérification de l'état des lieux</small>
              </td>
              <td>1</td>
              <td class="text-right">${formatPrice(CAUTION_AMOUNT)} F</td>
              <td class="text-right"><strong>${formatPrice(CAUTION_AMOUNT)} F</strong></td>
            </tr>
          </tbody>
        </table>

        <div class="total-section">
          <div class="total-row">
            <span>Sous-total Location</span>
            <span>${formatPrice(location.rental_amount)} F CFA</span>
          </div>
          <div class="total-row">
            <span>Caution</span>
            <span>${formatPrice(CAUTION_AMOUNT)} F CFA</span>
          </div>
          <div class="total-row">
            <span><strong>Total à payer</strong></span>
            <span><strong>${formatPrice(location.rental_amount + CAUTION_AMOUNT)} F CFA</strong></span>
          </div>
          <div class="total-row">
            <span>Acompte versé</span>
            <span style="color: #28a745;">- ${formatPrice(location.deposit_paid || 0)} F CFA</span>
          </div>
        </div>

        <div class="grand-total" style="display: flex; justify-content: space-between;">
          <span>RESTE À PAYER</span>
          <span>${formatPrice((location.rental_amount + CAUTION_AMOUNT) - (location.deposit_paid || 0))} F CFA</span>
        </div>

        <div class="payment-info">
          <h4 style="margin-top: 0;">💳 Modalités de paiement</h4>
          <p>
            <strong>Espèces :</strong> À régler sur place<br>
            <strong>Mobile Money :</strong> +229 91 00 50 84<br>
            <strong>Virement :</strong> Contactez-nous pour les coordonnées bancaires
          </p>
          <p><em>La caution de ${formatPrice(CAUTION_AMOUNT)} F CFA sera restituée après l'événement, sous réserve de l'état des lieux.</em></p>
        </div>

        <div class="footer">
          <p>Facture N° ${invoiceNumber} | Contrat N° ${location.id?.substring(0, 8).toUpperCase() || 'XXXX'}</p>
          <p><strong>ESPACE MAXO</strong> - Fidjrossè Plage, Cotonou - Tél: +229 91 00 50 84</p>
          <p style="font-size: 10px;">Merci de votre confiance !</p>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(invoiceHTML);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
    
    toast.success("Facture générée avec succès !");
  };

  const filteredLocations = locations.filter(loc => {
    if (filterSpace !== "all" && loc.space_type !== filterSpace) return false;
    if (filterStatus !== "all" && loc.status !== filterStatus) return false;
    return true;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case "confirmed":
        return <Badge className="bg-blue-500/20 text-blue-400">Confirmée</Badge>;
      case "completed":
        return <Badge className="bg-green-500/20 text-green-400">Terminée</Badge>;
      case "cancelled":
        return <Badge className="bg-red-500/20 text-red-400">Annulée</Badge>;
      default:
        return <Badge className="bg-slate-500/20 text-slate-400">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-bold text-purple-300 flex items-center gap-2">
            <Building2 className="w-5 h-5 sm:w-6 sm:h-6" />
            Gestion des Locations
          </h2>
          {canManageLocations && (
            <Button 
              onClick={() => { resetForm(); setEditingLocation(null); setShowModal(true); }}
              className="bg-purple-600 hover:bg-purple-700"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Nouvelle Location</span>
              <span className="sm:hidden">Nouveau</span>
            </Button>
          )}
        </div>
        {/* Filters - separate row on mobile */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterSpace} onValueChange={setFilterSpace}>
            <SelectTrigger className="w-[120px] sm:w-[140px] bg-slate-800/50 border-slate-700 text-white text-sm">
              <SelectValue placeholder="Espace" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="all">Tous les espaces</SelectItem>
              {Object.entries(SPACE_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>{config.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[110px] sm:w-[130px] bg-slate-800/50 border-slate-700 text-white text-sm">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="all">Tous statuts</SelectItem>
              <SelectItem value="confirmed">Confirmées</SelectItem>
              <SelectItem value="completed">Terminées</SelectItem>
              <SelectItem value="cancelled">Annulées</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(SPACE_CONFIG).map(([key, config]) => {
          const Icon = config.icon;
          const count = locations.filter(l => l.space_type === key && l.status === "confirmed").length;
          return (
            <Card key={key} className={`${config.bgColor} ${config.borderColor} border`}>
              <CardContent className="p-4 text-center">
                <Icon className={`w-6 h-6 ${config.color} mx-auto mb-1`} />
                <p className={`text-2xl font-bold ${config.color}`}>{count}</p>
                <p className="text-xs text-slate-400">{config.label}</p>
              </CardContent>
            </Card>
          );
        })}
        <Card className="bg-amber-900/30 border-amber-500/50 border">
          <CardContent className="p-4 text-center">
            <DollarSign className="w-6 h-6 text-amber-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-amber-400">
              {formatPrice(locations.filter(l => l.status === "confirmed").reduce((sum, l) => sum + (l.rental_amount || 0), 0))}
            </p>
            <p className="text-xs text-slate-400">Total Confirmé</p>
          </CardContent>
        </Card>
      </div>

      {/* Locations List */}
      {filteredLocations.length === 0 ? (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-8 text-center">
            <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">Aucune réservation de location</p>
            {canManageLocations && (
              <p className="text-slate-500 text-sm">Cliquez sur "Nouveau" pour en créer une</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredLocations.map(location => {
            const spaceConfig = SPACE_CONFIG[location.space_type] || SPACE_CONFIG.salle_fete;
            const SpaceIcon = spaceConfig.icon;
            return (
              <Card key={location.id} className={`${spaceConfig.bgColor} ${spaceConfig.borderColor} border`}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    {/* Left: Info */}
                    <div className="flex items-start gap-3 flex-1">
                      <div className={`p-2 rounded-lg ${spaceConfig.bgColor}`}>
                        <SpaceIcon className={`w-6 h-6 ${spaceConfig.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-white font-semibold">{location.customer_name}</h3>
                          {getStatusBadge(location.status)}
                          {location.event_type && (
                            <Badge className="bg-slate-700/50 text-slate-300">{location.event_type}</Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm">
                          <span className={spaceConfig.color}>{spaceConfig.label}</span>
                          <span className="text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {location.reservation_date}
                          </span>
                          <span className="text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {location.start_time} - {location.end_time}
                          </span>
                          <span className="text-slate-400 flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {location.number_of_guests} pers.
                          </span>
                          <span className="text-slate-400 flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {location.customer_phone}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Right: Price & Actions */}
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-amber-400 font-bold">{formatPrice(location.rental_amount)} F</p>
                        {location.deposit_paid > 0 && (
                          <p className="text-green-400 text-xs">Acompte: {formatPrice(location.deposit_paid)} F</p>
                        )}
                        {location.balance_remaining > 0 && (
                          <p className="text-red-400 text-xs">Reste: {formatPrice(location.balance_remaining)} F</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => setViewingLocation(location)}
                          className="text-slate-400 hover:text-white"
                          title="Voir les détails"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => generateContract(location)}
                          className="text-purple-400 hover:text-purple-300"
                          title="Imprimer le contrat"
                        >
                          <FileText className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => convertToInvoice(location)}
                          className="text-amber-400 hover:text-amber-300"
                          title="Générer une facture"
                        >
                          <Receipt className="w-4 h-4" />
                        </Button>
                        {canManageLocations && (
                          <>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              onClick={() => openEditModal(location)}
                              className="text-blue-400 hover:text-blue-300"
                              title="Modifier"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              onClick={() => handleDelete(location.id)}
                              className="text-red-400 hover:text-red-300"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-purple-400 flex items-center gap-2">
              {editingLocation ? <Edit2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
              {editingLocation ? "Modifier la Location" : "Nouvelle Location"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Space Type Selection */}
            <div className="space-y-2">
              <Label className="text-slate-300">Type d'espace *</Label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(SPACE_CONFIG).map(([key, config]) => {
                  const Icon = config.icon;
                  return (
                    <button
                      key={key}
                      onClick={() => handleSpaceChange(key)}
                      className={`p-3 rounded-lg border transition-all flex flex-col items-center gap-1 ${
                        formData.space_type === key 
                          ? `${config.bgColor} ${config.borderColor} ${config.color}` 
                          : 'bg-slate-700/30 border-slate-600 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs">{config.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Customer Info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-slate-300">Nom du client *</Label>
                <Input
                  value={formData.customer_name}
                  onChange={(e) => setFormData({...formData, customer_name: e.target.value})}
                  placeholder="Nom complet"
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Téléphone *</Label>
                <Input
                  value={formData.customer_phone}
                  onChange={(e) => setFormData({...formData, customer_phone: e.target.value})}
                  placeholder="+229..."
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="text-slate-300">Date *</Label>
                <Input
                  type="date"
                  value={formData.reservation_date}
                  onChange={(e) => setFormData({...formData, reservation_date: e.target.value})}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Heure début</Label>
                <Input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({...formData, start_time: e.target.value})}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Heure fin</Label>
                <Input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({...formData, end_time: e.target.value})}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
            </div>

            {/* Event Info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-slate-300">Nombre de personnes</Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.number_of_guests}
                  onChange={(e) => setFormData({...formData, number_of_guests: parseInt(e.target.value) || 1})}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Type d'événement</Label>
                <Select value={formData.event_type} onValueChange={(v) => setFormData({...formData, event_type: v})}>
                  <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                    <SelectValue placeholder="Sélectionner..." />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {EVENT_TYPES.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Pricing */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-slate-300">Montant location (F CFA)</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.rental_amount}
                  onChange={(e) => setFormData({...formData, rental_amount: parseInt(e.target.value) || 0})}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Acompte versé (F CFA)</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.deposit_amount}
                  onChange={(e) => setFormData({...formData, deposit_amount: parseInt(e.target.value) || 0})}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
            </div>

            {/* Balance Preview */}
            <div className="bg-slate-700/30 rounded-lg p-3 flex justify-between items-center">
              <span className="text-slate-400">Solde restant à payer :</span>
              <span className="text-amber-400 font-bold text-lg">
                {formatPrice(Math.max(0, formData.rental_amount - formData.deposit_amount))} F
              </span>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-slate-300">Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                placeholder="Informations supplémentaires..."
                className="bg-slate-700/50 border-slate-600 text-white min-h-[80px]"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleSubmit}
                className="flex-1 bg-purple-600 hover:bg-purple-700"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {editingLocation ? "Modifier" : "Créer"}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setShowModal(false); setEditingLocation(null); }}
                className="border-slate-600 text-slate-300"
              >
                Annuler
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Details Modal */}
      <Dialog open={!!viewingLocation} onOpenChange={(open) => !open && setViewingLocation(null)}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-purple-400 flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Détails de la Location
            </DialogTitle>
          </DialogHeader>
          
          {viewingLocation && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3">
                {(() => {
                  const config = SPACE_CONFIG[viewingLocation.space_type] || SPACE_CONFIG.salle_fete;
                  const Icon = config.icon;
                  return (
                    <div className={`p-3 rounded-lg ${config.bgColor}`}>
                      <Icon className={`w-8 h-8 ${config.color}`} />
                    </div>
                  );
                })()}
                <div>
                  <h3 className="text-white font-bold text-lg">{viewingLocation.customer_name}</h3>
                  <p className="text-slate-400">{SPACE_CONFIG[viewingLocation.space_type]?.label}</p>
                </div>
                {getStatusBadge(viewingLocation.status)}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <p className="text-slate-400">Date</p>
                  <p className="text-white font-medium">{viewingLocation.reservation_date}</p>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <p className="text-slate-400">Horaires</p>
                  <p className="text-white font-medium">{viewingLocation.start_time} - {viewingLocation.end_time}</p>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <p className="text-slate-400">Personnes</p>
                  <p className="text-white font-medium">{viewingLocation.number_of_guests}</p>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <p className="text-slate-400">Téléphone</p>
                  <p className="text-white font-medium">{viewingLocation.customer_phone}</p>
                </div>
              </div>

              {viewingLocation.event_type && (
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <p className="text-slate-400 text-sm">Type d'événement</p>
                  <p className="text-white font-medium">{viewingLocation.event_type}</p>
                </div>
              )}

              <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Montant total</span>
                  <span className="text-amber-400 font-bold">{formatPrice(viewingLocation.rental_amount)} F</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Acompte versé</span>
                  <span className="text-green-400">{formatPrice(viewingLocation.deposit_paid || 0)} F</span>
                </div>
                <div className="flex justify-between border-t border-slate-600 pt-2">
                  <span className="text-slate-300 font-medium">Solde restant</span>
                  <span className="text-red-400 font-bold">{formatPrice(viewingLocation.balance_remaining || 0)} F</span>
                </div>
              </div>

              {viewingLocation.notes && (
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <p className="text-slate-400 text-sm">Notes</p>
                  <p className="text-white">{viewingLocation.notes}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2">
                {/* Print Contract Button */}
                <Button
                  onClick={() => generateContract(viewingLocation)}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Contrat
                </Button>

                {/* Generate Invoice Button */}
                <Button
                  onClick={() => convertToInvoice(viewingLocation)}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  <Receipt className="w-4 h-4 mr-2" />
                  Facture
                </Button>
              </div>

              {/* Manager/Admin Actions */}
              {canManageLocations && viewingLocation.status === "confirmed" && (
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => { handleStatusChange(viewingLocation.id, "completed"); setViewingLocation(null); }}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Marquer Terminée
                  </Button>
                  <Button
                    onClick={() => { handleStatusChange(viewingLocation.id, "cancelled"); setViewingLocation(null); }}
                    variant="outline"
                    className="border-red-500/50 text-red-400 hover:bg-red-500/20"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Annuler
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LocationsTab;
