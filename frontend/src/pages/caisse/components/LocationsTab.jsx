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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  Calendar, Building2, TreePine, Gamepad2, Plus, Edit2, Trash2, 
  Users, Clock, Phone, DollarSign, CheckCircle, X, Eye, FileText, Printer, Receipt,
  CalendarDays, List, Calculator,
} from "lucide-react";
import { LOGO_BASE64 } from "../constants_logo";
import LocationCalendarTab from "./LocationCalendarTab";
import LocationSimulator from "./LocationSimulator";

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
  const [proformas, setProformas] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState("list");

  // Append actor (manager/admin) info to write requests so they appear
  // in the admin audit trail.
  const actorQs = () => {
    const n = encodeURIComponent(currentUser?.full_name || currentUser?.username || "—");
    const r = encodeURIComponent(currentUser?.role || "manager");
    return `actor_name=${n}&actor_role=${r}`;
  };
  const [editingLocation, setEditingLocation] = useState(null);
  // Items issus du simulateur en attente d'import dans la liste de courses,
  // déclenché à la sauvegarde de la réservation.
  const [pendingCoursesSimItems, setPendingCoursesSimItems] = useState([]);
  const [viewingLocation, setViewingLocation] = useState(null);
  const [filterSpace, setFilterSpace] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showInvoiceChoice, setShowInvoiceChoice] = useState(false);
  const [invoiceLocation, setInvoiceLocation] = useState(null);
  
  const [formData, setFormData] = useState({
    space_types: ["salle_fete"], // Array for multiple spaces
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
  const canGenerateLocationInvoices = isManager; // Only manager can generate invoices for locations

  // Calculate total price based on selected spaces
  const calculateTotalPrice = (selectedSpaces) => {
    return selectedSpaces.reduce((total, space) => {
      return total + (SPACE_CONFIG[space]?.defaultPrice || 0);
    }, 0);
  };

  // Toggle space selection for combined rentals
  const toggleSpaceSelection = (spaceKey) => {
    const currentSpaces = formData.space_types || [];
    let newSpaces;
    
    if (currentSpaces.includes(spaceKey)) {
      newSpaces = currentSpaces.filter(s => s !== spaceKey);
      if (newSpaces.length === 0) newSpaces = [spaceKey];
    } else {
      newSpaces = [...currentSpaces, spaceKey];
    }
    
    setFormData({
      ...formData,
      space_types: newSpaces,
      rental_amount: calculateTotalPrice(newSpaces)
    });
  };

  useEffect(() => {
    fetchLocations();
    fetchProformas();
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

  const fetchProformas = async () => {
    try {
      const res = await axios.get(`${API}/proforma-invoices`);
      setProformas(res.data.proformas || []);
    } catch (error) {
      console.error("Error fetching proformas:", error);
    }
  };

  // Détecte les conflits sur la date/les espaces sélectionnés
  // vs. réservations confirmées + proformas (hors rejetés/convertis/brouillons cachés).
  const dateConflicts = React.useMemo(() => {
    const d = formData.reservation_date;
    if (!d) return { reservations: [], proformas: [] };
    const selectedSpaces = formData.space_types || [];
    const overlaps = (spaceType) => {
      if (!spaceType) return false;
      const booked = spaceType.split("+").filter(Boolean);
      if (selectedSpaces.length === 0) return true;
      return booked.some((s) => selectedSpaces.includes(s));
    };
    // Proforma : heuristique "location" + extraction de date dans titre/notes/items
    const extractDate = (p) => {
      const blob = [
        p.proforma_title || "",
        p.notes || "",
        ...(p.items || []).map((i) => `${i.name || ""} ${i.description || ""}`),
      ].join(" ");
      const m1 = blob.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
      if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
      const m2 = blob.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
      if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
      return null;
    };
    const looksLocation = (p) => {
      const txt = [
        p.proforma_title || "",
        p.notes || "",
        ...(p.items || []).map((i) => `${i.name || ""} ${i.description || ""}`),
      ].join(" ").toLowerCase();
      return /(location|reservation|réservation|salle|jardin|espace|jeu|fête|fete|événement|evenement|mariage|anniversaire|bapt|pack)/i.test(txt);
    };
    const res = locations.filter((l) =>
      l.id !== editingLocation?.id
      && l.reservation_date === d
      && l.status !== "cancelled"
      && overlaps(l.space_type)
    );
    const pro = proformas.filter((p) => {
      if (p.status === "rejected" || p.status === "converted") return false;
      if (!looksLocation(p)) return false;
      const evDate = extractDate(p);
      return evDate === d;
    });
    return { reservations: res, proformas: pro };
  }, [formData.reservation_date, formData.space_types, locations, proformas, editingLocation]);

  const handleSpaceChange = (spaceType) => {
    // For single space selection (backward compatibility)
    setFormData({
      ...formData,
      space_types: [spaceType],
      rental_amount: SPACE_CONFIG[spaceType]?.defaultPrice || 50000
    });
  };

  const handleSubmit = async () => {
    if (!formData.customer_name || !formData.customer_phone || !formData.reservation_date) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }

    try {
      // Convert space_types array to space_type string for backend
      const submitData = {
        ...formData,
        space_type: formData.space_types.join('+'), // Combined spaces like "salle_fete+espace_jardin"
        is_combined: formData.space_types.length > 1
      };
      delete submitData.space_types;

      if (editingLocation) {
        await axios.put(`${API}/locations/${editingLocation.id}?${actorQs()}`, submitData);
        toast.success("Location modifiée avec succès");
      } else {
        const r = await axios.post(`${API}/locations?${actorQs()}`, submitData);
        toast.success("Location créée avec succès");
        // === Auto-import items de la simulation dans la liste de courses ===
        if (pendingCoursesSimItems && pendingCoursesSimItems.length > 0) {
          const reservationId = r.data?.location?.id || r.data?.id;
          if (reservationId && window.confirm(`Importer les ${pendingCoursesSimItems.length} articles de la simulation dans la liste de courses ?`)) {
            try {
              await axios.post(`${API}/shopping-list/from-reservation`, {
                reservation_id: reservationId,
                reservation_label: `${submitData.customer_name || 'Réservation'} — ${submitData.reservation_date || ''}`,
                items: pendingCoursesSimItems,
                created_by: currentUser?.full_name || currentUser?.username || '',
              });
              toast.success(`${pendingCoursesSimItems.length} articles ajoutés à la liste de courses 🛒`);
            } catch {
              toast.error("Erreur lors de l'import en liste de courses");
            }
          }
          setPendingCoursesSimItems([]);
        }
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
      await axios.delete(`${API}/locations/${locationId}?${actorQs()}`);
      toast.success("Location supprimée");
      fetchLocations();
    } catch (error) {
      console.error("Error deleting location:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleStatusChange = async (locationId, newStatus) => {
    try {
      await axios.put(`${API}/locations/${locationId}?${actorQs()}`, { status: newStatus });
      toast.success("Statut mis à jour");
      fetchLocations();
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Erreur lors de la mise à jour");
    }
  };

  const openEditModal = (location) => {
    setEditingLocation(location);
    // Parse combined spaces
    const spaceTypes = location.space_type?.includes('+') 
      ? location.space_type.split('+') 
      : [location.space_type];
    setFormData({
      space_types: spaceTypes,
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
      space_types: ["salle_fete"],
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
  const generateContract = (location) => {
    // Parse combined spaces from space_type field
    const allSpaces = location.space_type?.includes('+') 
      ? location.space_type.split('+') 
      : [location.space_type];
    const isMultiSpace = allSpaces.length > 1;
    const spacesLabel = getSpaceLabel(location.space_type);
    const primarySpace = allSpaces[0];
    const spaceConfig = SPACE_CONFIG[primarySpace] || SPACE_CONFIG.salle_fete;

    const contractHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Contrat de Location - Espace Maxo</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; line-height: 1.5; font-size: 11pt; }
          .page-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 10px; margin-bottom: 15px; }
          .logo { width: 80px; height: 80px; }
          .logo img { width: 100%; height: 100%; object-fit: contain; }
          .header-center { text-align: center; flex: 1; }
          .header-title { font-size: 16pt; font-weight: bold; text-transform: uppercase; }
          .contract-type { background: ${isMultiSpace ? '#6f42c1' : spaceConfig.color === 'text-purple-400' ? '#6f42c1' : spaceConfig.color === 'text-green-400' ? '#28a745' : '#17a2b8'}; color: white; padding: 5px 15px; display: inline-block; margin: 8px 0; font-weight: bold; font-size: 10pt; }
          .header-right { text-align: right; font-size: 9pt; }
          h2 { color: #333; margin-top: 15px; font-size: 11pt; }
          .info-box { background: #f8f9fa; padding: 12px; margin: 12px 0; border: 1px solid #ddd; }
          .info-row { display: flex; justify-content: space-between; margin: 4px 0; padding: 3px 0; border-bottom: 1px dotted #ddd; font-size: 10pt; }
          .info-row:last-child { border-bottom: none; }
          .label { font-weight: bold; color: #333; }
          .value { color: #555; }
          .amount { font-size: 11pt; color: #dc3545; font-weight: bold; }
          .rules { background: #fff3cd; padding: 12px; border-left: 3px solid #ffc107; margin: 12px 0; font-size: 9pt; }
          .rules-garden { background: #d4edda; border-left-color: #28a745; }
          .rules-salle { background: #e7e3ff; border-left-color: #6f42c1; }
          .rules-jeux { background: #d1ecf1; border-left-color: #17a2b8; }
          .rules h3 { margin-top: 0; font-size: 10pt; }
          .rules ul { margin: 8px 0; padding-left: 18px; }
          .rules li { margin: 4px 0; }
          .signature-section { margin-top: 25px; display: flex; justify-content: space-between; page-break-inside: avoid; }
          .signature-box { width: 45%; text-align: center; }
          .signature-line { border-top: 1px solid #333; margin-top: 40px; padding-top: 5px; font-size: 9pt; }
          .caution-box { background: #f8d7da; padding: 12px; border: 1px solid #f5c6cb; margin: 12px 0; font-size: 9pt; }
          .caution-box h3 { color: #721c24; margin-top: 0; font-size: 10pt; }
          .footer { margin-top: 15px; text-align: center; font-size: 9pt; color: #666; border-top: 1px solid #ddd; padding-top: 8px; }
          @media print { body { padding: 10px; font-size: 10pt; } .rules { page-break-inside: avoid; } }
        </style>
      </head>
      <body>
        <div class="page-header">
          <div class="logo"><img src="${LOGO_BASE64}" alt="Logo" /></div>
          <div class="header-center">
            <div class="header-title">Contrat de Location</div>
            <div class="contract-type">${isMultiSpace ? 'PACK COMBINÉ' : location.space_type === 'salle_fete' ? 'SALLE DE FÊTE' : location.space_type === 'espace_jardin' ? 'ESPACE JARDIN' : 'SALLE DE JEUX'}</div>
          </div>
          <div class="header-right">
            <p>Tél: +229 01 4147 0000</p>
            <p>Fidjrossè, Cotonou</p>
          </div>
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

  // Get space label (handle combined spaces)
  const getSpaceLabel = (spaceType) => {
    if (spaceType?.includes('+')) {
      return spaceType.split('+').map(s => SPACE_CONFIG[s]?.label || s).join(' + ');
    }
    return SPACE_CONFIG[spaceType]?.label || spaceType;
  };

  // Convert location to invoice - LARGE FORMAT (A4)
  const convertToInvoiceLarge = (location) => {
    const spacesLabel = getSpaceLabel(location.space_type);
    const invoiceNumber = `FAC-LOC-${Date.now().toString().slice(-6)}`;
    
    const invoiceHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Facture ${invoiceNumber} - Espace Maxo</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; line-height: 1.4; font-size: 10pt; }
          .invoice-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 10px; margin-bottom: 15px; }
          .logo { width: 80px; height: 80px; }
          .logo img { width: 100%; height: 100%; object-fit: contain; }
          .header-center { flex: 1; padding: 0 20px; }
          .header-center h1 { margin: 0; font-size: 14pt; text-transform: uppercase; }
          .invoice-info { text-align: right; }
          .invoice-number { font-size: 14pt; font-weight: bold; }
          .status-badge { display: inline-block; padding: 3px 10px; font-weight: bold; font-size: 9pt; margin-top: 5px; border: 1px solid; }
          .status-paid { border-color: #28a745; color: #28a745; }
          .status-partial { border-color: #ffc107; color: #856404; }
          .status-pending { border-color: #dc3545; color: #dc3545; }
          .client-section { display: flex; justify-content: space-between; margin: 15px 0; gap: 15px; }
          .client-box, .event-box { width: 48%; background: #f8f9fa; padding: 12px; border: 1px solid #ddd; }
          .client-box h3, .event-box h3 { margin-top: 0; font-size: 10pt; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 9pt; }
          thead tr { border-top: 2px solid #333; border-bottom: 2px solid #333; }
          th { padding: 8px; text-align: left; font-weight: bold; text-transform: uppercase; font-size: 8pt; }
          td { padding: 8px; border-bottom: 1px solid #ddd; }
          .text-right { text-align: right; }
          .total-section { padding: 10px; border: 1px solid #ddd; margin-top: 15px; font-size: 9pt; }
          .total-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dotted #ddd; }
          .total-row:last-child { border-bottom: none; }
          .grand-total { font-size: 12pt; font-weight: bold; background: #333; color: white; padding: 12px; margin-top: 10px; display: flex; justify-content: space-between; }
          .payment-info { margin-top: 15px; padding: 10px; background: #f5f5f5; border-left: 3px solid #333; font-size: 9pt; }
          .footer { margin-top: 20px; text-align: center; font-size: 9pt; color: #666; border-top: 1px solid #ddd; padding-top: 10px; }
          @media print { body { padding: 10px; } }
        </style>
      </head>
      <body>
        <div class="invoice-header">
          <div class="logo"><img src="${LOGO_BASE64}" alt="Logo" /></div>
          <div class="header-center">
            <h1>Facture de Location</h1>
            <p style="margin: 5px 0; font-size: 9pt;">Fidjrossè, Cotonou | Tél: +229 01 4147 0000</p>
          </div>
          <div class="invoice-info">
            <div class="invoice-number">${invoiceNumber}</div>
            <p style="font-size: 9pt; margin: 5px 0;"><strong>Date :</strong> ${new Date().toLocaleDateString('fr-FR')}</p>
            <span class="status-badge ${location.balance_remaining <= 0 ? 'status-paid' : location.deposit_paid > 0 ? 'status-partial' : 'status-pending'}">
              ${location.balance_remaining <= 0 ? 'PAYÉE' : location.deposit_paid > 0 ? 'ACOMPTE VERSÉ' : 'EN ATTENTE'}
            </span>
          </div>
        </div>

        <div class="client-section">
          <div class="client-box">
            <h3>Client</h3>
            <p><strong>${location.customer_name}</strong><br>Tél: ${location.customer_phone}</p>
          </div>
          <div class="event-box">
            <h3>Événement</h3>
            <p><strong>Type :</strong> ${location.event_type || 'Non précisé'}<br>
            <strong>Date :</strong> ${location.reservation_date}<br>
            <strong>Horaires :</strong> ${location.start_time} - ${location.end_time}<br>
            <strong>Personnes :</strong> ${location.number_of_guests}</p>
          </div>
        </div>

        <table>
          <thead>
            <tr><th>Désignation</th><th>Qté</th><th class="text-right">Prix Unit.</th><th class="text-right">Total</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Location ${spacesLabel}</strong><br><small style="color: #666;">${location.start_time} - ${location.end_time}</small></td>
              <td>1</td>
              <td class="text-right">${formatPrice(location.rental_amount)} F</td>
              <td class="text-right"><strong>${formatPrice(location.rental_amount)} F</strong></td>
            </tr>
            <tr>
              <td><strong>Caution (remboursable)</strong><br><small style="color: #666;">Restituée après état des lieux</small></td>
              <td>1</td>
              <td class="text-right">${formatPrice(CAUTION_AMOUNT)} F</td>
              <td class="text-right"><strong>${formatPrice(CAUTION_AMOUNT)} F</strong></td>
            </tr>
          </tbody>
        </table>

        <div class="total-section">
          <div class="total-row"><span>Sous-total Location</span><span>${formatPrice(location.rental_amount)} F CFA</span></div>
          <div class="total-row"><span>Caution</span><span>${formatPrice(CAUTION_AMOUNT)} F CFA</span></div>
          <div class="total-row"><span><strong>Total à payer</strong></span><span><strong>${formatPrice(location.rental_amount + CAUTION_AMOUNT)} F CFA</strong></span></div>
          <div class="total-row"><span>Acompte versé</span><span style="color: #28a745;">- ${formatPrice(location.deposit_paid || 0)} F CFA</span></div>
        </div>

        <div class="grand-total"><span>RESTE À PAYER</span><span>${formatPrice((location.rental_amount + CAUTION_AMOUNT) - (location.deposit_paid || 0))} F CFA</span></div>

        <div class="payment-info">
          <p style="margin: 0;"><strong>Modalités de paiement :</strong> Espèces sur place | Mobile Money: +229 01 4147 0000</p>
          <p style="margin: 5px 0 0 0;"><em>La caution sera restituée après l'événement, sous réserve de l'état des lieux.</em></p>
        </div>

        <div class="footer">
          <p>Facture N° ${invoiceNumber} | Contrat N° ${location.id?.substring(0, 8).toUpperCase() || 'XXXX'}</p>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(invoiceHTML);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
    toast.success("Facture A4 générée !");
  };

  // Convert location to invoice - SMALL FORMAT (Thermal Printer 58/80mm)
  const convertToInvoiceSmall = (location) => {
    const spacesLabel = getSpaceLabel(location.space_type);
    const invoiceNumber = `FAC-${Date.now().toString().slice(-6)}`;
    const totalToPay = (location.rental_amount + CAUTION_AMOUNT) - (location.deposit_paid || 0);
    
    const invoiceHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Ticket ${invoiceNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Courier New', monospace; 
            width: 80mm; 
            padding: 5mm;
            font-size: 12px;
            line-height: 1.4;
          }
          .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
          .logo { width: 50px; height: 50px; margin: 0 auto 5px; }
          .logo img { width: 100%; height: 100%; object-fit: contain; }
          .header p { font-size: 10px; }
          .invoice-num { text-align: center; font-size: 11px; margin: 5px 0; padding: 5px; background: #f0f0f0; }
          .section { margin: 8px 0; padding: 5px 0; border-bottom: 1px dashed #000; }
          .section-title { font-weight: bold; font-size: 11px; margin-bottom: 5px; }
          .row { display: flex; justify-content: space-between; margin: 3px 0; }
          .row-label { flex: 1; }
          .row-value { text-align: right; font-weight: bold; }
          .item-row { margin: 5px 0; }
          .item-name { font-weight: bold; }
          .item-details { font-size: 10px; color: #666; }
          .total-section { margin-top: 10px; padding-top: 8px; border-top: 2px solid #000; }
          .grand-total { font-size: 14px; font-weight: bold; text-align: center; padding: 8px; background: #000; color: #fff; margin: 8px 0; }
          .status { text-align: center; padding: 5px; margin: 5px 0; font-weight: bold; }
          .status-paid { background: #d4edda; }
          .status-partial { background: #fff3cd; }
          .status-pending { background: #f8d7da; }
          .footer { text-align: center; font-size: 10px; margin-top: 10px; padding-top: 8px; border-top: 1px dashed #000; }
          .footer p { margin: 3px 0; }
          .cut-line { text-align: center; margin-top: 15px; font-size: 10px; color: #999; }
          @media print { 
            body { width: 80mm; }
            @page { size: 80mm auto; margin: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo"><img src="${LOGO_BASE64}" alt="Logo" /></div>
          <p>Fidjrossè, Cotonou</p>
          <p>Tél: +229 01 4147 0000</p>
        </div>

        <div class="invoice-num">
          <strong style="font-size: 9px; letter-spacing: 1px;">BON DE COMMANDE</strong><br>
          <strong>N° ${invoiceNumber}</strong><br>
          ${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}
        </div>

        <div class="section">
          <div class="section-title">CLIENT</div>
          <div>${location.customer_name}</div>
          <div style="font-size: 10px;">${location.customer_phone}</div>
        </div>

        <div class="section">
          <div class="section-title">ÉVÉNEMENT</div>
          <div class="row"><span>Date:</span><span class="row-value">${location.reservation_date}</span></div>
          <div class="row"><span>Horaires:</span><span class="row-value">${location.start_time}-${location.end_time}</span></div>
          <div class="row"><span>Personnes:</span><span class="row-value">${location.number_of_guests}</span></div>
          ${location.event_type ? `<div class="row"><span>Type:</span><span class="row-value">${location.event_type}</span></div>` : ''}
        </div>

        <div class="section">
          <div class="section-title">DÉTAIL</div>
          <div class="item-row">
            <div class="item-name">${spacesLabel}</div>
            <div class="row"><span>Location</span><span class="row-value">${formatPrice(location.rental_amount)} F</span></div>
          </div>
          <div class="item-row">
            <div class="row"><span>Caution</span><span class="row-value">${formatPrice(CAUTION_AMOUNT)} F</span></div>
            <div class="item-details">(remboursable)</div>
          </div>
        </div>

        <div class="total-section">
          <div class="row"><span>Sous-total</span><span class="row-value">${formatPrice(location.rental_amount + CAUTION_AMOUNT)} F</span></div>
          <div class="row"><span>Acompte versé</span><span class="row-value" style="color: green;">-${formatPrice(location.deposit_paid || 0)} F</span></div>
        </div>

        <div class="grand-total">
          RESTE À PAYER: ${formatPrice(totalToPay)} F
        </div>

        <div class="status ${totalToPay <= 0 ? 'status-paid' : location.deposit_paid > 0 ? 'status-partial' : 'status-pending'}">
          ${totalToPay <= 0 ? 'PAYÉE' : location.deposit_paid > 0 ? 'ACOMPTE VERSÉ' : 'EN ATTENTE'}
        </div>

        <div class="footer">
          <p>Mobile Money: +229 01 4147 0000</p>
          <p>Merci de votre confiance !</p>
          <p style="margin-top: 5px;">Contrat N° ${location.id?.substring(0, 8).toUpperCase() || 'XXXX'}</p>
        </div>

        <div class="cut-line">- - - - - - - - - - -</div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(invoiceHTML);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
    toast.success("Ticket généré !");
  };

  // Open invoice choice modal
  const openInvoiceChoice = (location) => {
    setInvoiceLocation(location);
    setShowInvoiceChoice(true);
  };

  const filteredLocations = locations.filter(loc => {
    // Handle combined space filter - show if the filter matches any space in combined type
    if (filterSpace !== "all") {
      if (filterSpace === "combined") {
        // Filter only combined rentals
        if (!loc.space_type?.includes('+')) return false;
      } else if (loc.space_type?.includes('+')) {
        // For combined spaces, check if any of the spaces match the filter
        const spaces = loc.space_type.split('+');
        if (!spaces.includes(filterSpace)) return false;
      } else if (loc.space_type !== filterSpace) {
        return false;
      }
    }
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
    <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="w-full">
      <TabsList className="bg-slate-800/50 border border-slate-700 mb-4">
        <TabsTrigger value="list" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white" data-testid="loc-subtab-list">
          <List className="w-4 h-4 mr-1" /> Liste des réservations
        </TabsTrigger>
        <TabsTrigger value="calendar" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white" data-testid="loc-subtab-calendar">
          <CalendarDays className="w-4 h-4 mr-1" /> Calendrier de disponibilité
        </TabsTrigger>
        <TabsTrigger value="simulator" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white" data-testid="loc-subtab-simulator">
          <Calculator className="w-4 h-4 mr-1" /> Simulateur de devis
        </TabsTrigger>
      </TabsList>
      <TabsContent value="calendar">
        <LocationCalendarTab formatPrice={formatPrice} />
      </TabsContent>
      <TabsContent value="simulator">
        <LocationSimulator
          currentUser={currentUser}
          onCreateReservation={(sim) => {
            // Pré-remplit le formulaire d'ajout de réservation avec les données de la simulation
            setEditingLocation(null);
            setPendingCoursesSimItems(sim.items || []);
            setFormData({
              space_types: ["salle_fete"],
              customer_name: sim.client_name || "",
              customer_phone: "",
              reservation_date: sim.event_date || "",
              start_time: "",
              end_time: "",
              number_of_guests: sim.num_persons || 1,
              event_type: "",
              rental_amount: sim.sale_price_global || 0,
              deposit_amount: 0,
              notes: (sim.notes ? sim.notes + "\n\n" : "") + `(Issu de la simulation « ${sim.name} » — ${sim.items?.length || 0} article(s), marge ${sim.margin_type === "fixed" ? `+${sim.margin_value} F` : `+${sim.margin_value}%`})`,
            });
            setActiveSubTab("list");
            setShowModal(true);
            toast.success(`Réservation pré-remplie depuis « ${sim.name} »`);
          }}
        />
      </TabsContent>
      <TabsContent value="list">
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
              <SelectItem value="combined">📦 Packs combinés</SelectItem>
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Object.entries(SPACE_CONFIG).map(([key, config]) => {
          const Icon = config.icon;
          // Count includes both single and combined spaces
          const count = locations.filter(l => {
            if (l.status !== "confirmed") return false;
            if (l.space_type?.includes('+')) {
              return l.space_type.split('+').includes(key);
            }
            return l.space_type === key;
          }).length;
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
        {/* Combined Packs Stats */}
        <Card className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border-purple-500/50 border">
          <CardContent className="p-4 text-center">
            <Building2 className="w-6 h-6 text-purple-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-purple-400">
              {locations.filter(l => l.space_type?.includes('+') && l.status === "confirmed").length}
            </p>
            <p className="text-xs text-slate-400">Packs Combinés</p>
          </CardContent>
        </Card>
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
            // Handle combined spaces (e.g., "salle_fete+espace_jardin+salle_jeux")
            const allSpaces = location.space_type?.includes('+') 
              ? location.space_type.split('+') 
              : [location.space_type];
            const isCombined = allSpaces.length > 1;
            const primarySpace = allSpaces[0];
            const spaceConfig = SPACE_CONFIG[primarySpace] || SPACE_CONFIG.salle_fete;
            const SpaceIcon = isCombined ? Building2 : spaceConfig.icon; // Use building icon for combined
            const spacesLabel = getSpaceLabel(location.space_type);
            return (
              <Card key={location.id} className={`${isCombined ? 'bg-gradient-to-r from-purple-900/30 via-green-900/20 to-blue-900/30 border-purple-500/50' : spaceConfig.bgColor + ' ' + spaceConfig.borderColor} border`}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    {/* Left: Info */}
                    <div className="flex items-start gap-3 flex-1">
                      <div className={`p-2 rounded-lg ${isCombined ? 'bg-purple-900/50' : spaceConfig.bgColor}`}>
                        <SpaceIcon className={`w-6 h-6 ${isCombined ? 'text-purple-400' : spaceConfig.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-white font-semibold">{location.customer_name}</h3>
                          {getStatusBadge(location.status)}
                          {isCombined && (
                            <Badge className="bg-purple-500/20 text-purple-300 border border-purple-500/50">📦 Pack combiné</Badge>
                          )}
                          {location.event_type && (
                            <Badge className="bg-slate-700/50 text-slate-300">{location.event_type}</Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm">
                          <span className={isCombined ? 'text-purple-300 font-medium' : spaceConfig.color}>{spacesLabel}</span>
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
                        {canGenerateLocationInvoices && (
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => openInvoiceChoice(location)}
                          className="text-amber-400 hover:text-amber-300"
                          title="Générer une facture"
                        >
                          <Receipt className="w-4 h-4" />
                        </Button>
                        )}
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
            {/* Space Type Selection - Multiple selection */}
            <div className="space-y-2">
              <Label className="text-slate-300">Espace(s) à louer * <span className="text-xs text-purple-400">(cliquez pour sélectionner plusieurs)</span></Label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(SPACE_CONFIG).map(([key, config]) => {
                  const Icon = config.icon;
                  const isSelected = formData.space_types?.includes(key);
                  return (
                    <button
                      key={key}
                      onClick={() => toggleSpaceSelection(key)}
                      className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-1 relative ${
                        isSelected 
                          ? `${config.bgColor} ${config.borderColor} ${config.color}` 
                          : 'bg-slate-700/30 border-slate-600 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      {isSelected && (
                        <CheckCircle className="w-4 h-4 absolute top-1 right-1 text-green-400" />
                      )}
                      <Icon className="w-5 h-5" />
                      <span className="text-xs text-center">{config.label}</span>
                      <span className="text-xs opacity-60">{formatPrice(config.defaultPrice)} F</span>
                    </button>
                  );
                })}
              </div>
              {formData.space_types?.length > 1 && (
                <div className="bg-purple-900/30 border border-purple-500/50 rounded-lg p-2 text-center">
                  <span className="text-purple-400 text-sm font-medium">
                    📦 Pack combiné : {formData.space_types.map(s => SPACE_CONFIG[s]?.label).join(' + ')}
                  </span>
                </div>
              )}
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
                  className={`bg-slate-700/50 border-slate-600 text-white ${
                    (dateConflicts.reservations.length > 0 || dateConflicts.proformas.length > 0)
                      ? "ring-2 ring-amber-500/60" : ""
                  }`}
                  data-testid="location-date-input"
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

            {/* Conflit de date : réservations + proformas */}
            {formData.reservation_date && (dateConflicts.reservations.length > 0 || dateConflicts.proformas.length > 0) && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2" data-testid="location-conflict-alert">
                <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  Attention — Cette date est déjà sollicitée
                </div>
                {dateConflicts.reservations.length > 0 && (
                  <div className="text-xs text-amber-200/90 space-y-1">
                    <div className="font-medium text-amber-300">{dateConflicts.reservations.length} réservation(s) existante(s) :</div>
                    {dateConflicts.reservations.map((l) => (
                      <div key={l.id} className="pl-2 border-l-2 border-amber-500/40">
                        <span className="text-white">{l.customer_name}</span>
                        {" · "}
                        <span className="text-amber-200/80">
                          {(l.space_type || "").split("+").map((s) => SPACE_CONFIG[s]?.label || s).join(" + ")}
                        </span>
                        {l.start_time && <span className="text-slate-400"> · {l.start_time}→{l.end_time || "?"}</span>}
                        {l.event_type && <span className="text-slate-400"> · {l.event_type}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {dateConflicts.proformas.length > 0 && (
                  <div className="text-xs text-amber-200/90 space-y-1">
                    <div className="font-medium text-amber-300">{dateConflicts.proformas.length} proforma(s) en cours pour cette date :</div>
                    {dateConflicts.proformas.map((p) => (
                      <div key={p.id} className="pl-2 border-l-2 border-amber-500/40">
                        <span className="text-white">{p.client_name}</span>
                        {" · "}
                        <span className="text-slate-400 font-mono">{p.proforma_number}</span>
                        {p.proforma_title && <span className="text-slate-400"> · {p.proforma_title}</span>}
                        <Badge className={`ml-2 text-[10px] ${
                          p.status === "sent" ? "bg-amber-500/20 text-amber-300" :
                          p.status === "accepted" ? "bg-emerald-500/20 text-emerald-300" :
                          "bg-slate-500/20 text-slate-300"
                        }`}>{p.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-[10px] text-slate-400 italic">
                  Vous pouvez quand même confirmer si ces demandes concernent d'autres espaces ou créneaux.
                </div>
              </div>
            )}

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
                  const allSpaces = viewingLocation.space_type?.includes('+') 
                    ? viewingLocation.space_type.split('+') 
                    : [viewingLocation.space_type];
                  const isCombined = allSpaces.length > 1;
                  const primarySpace = allSpaces[0];
                  const config = SPACE_CONFIG[primarySpace] || SPACE_CONFIG.salle_fete;
                  const Icon = isCombined ? Building2 : config.icon;
                  return (
                    <div className={`p-3 rounded-lg ${isCombined ? 'bg-purple-900/50' : config.bgColor}`}>
                      <Icon className={`w-8 h-8 ${isCombined ? 'text-purple-400' : config.color}`} />
                    </div>
                  );
                })()}
                <div>
                  <h3 className="text-white font-bold text-lg">{viewingLocation.customer_name}</h3>
                  <p className={viewingLocation.space_type?.includes('+') ? 'text-purple-300 font-medium' : 'text-slate-400'}>{getSpaceLabel(viewingLocation.space_type)}</p>
                </div>
                {viewingLocation.space_type?.includes('+') && (
                  <Badge className="bg-purple-500/20 text-purple-300 border border-purple-500/50">📦 Pack</Badge>
                )}
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
              <div className={`grid ${canGenerateLocationInvoices ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                {/* Print Contract Button */}
                <Button
                  onClick={() => generateContract(viewingLocation)}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Contrat
                </Button>

                {/* Generate Invoice Button - Manager only */}
                {canGenerateLocationInvoices && (
                <Button
                  onClick={() => openInvoiceChoice(viewingLocation)}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  <Receipt className="w-4 h-4 mr-2" />
                  Facture
                </Button>
                )}
              </div>

              {/* Manager/Admin Actions */}
              {canManageLocations && viewingLocation.status === "confirmed" && (
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    onClick={async () => {
                      const remaining = Number(viewingLocation.balance_remaining || 0);
                      const total = Number(viewingLocation.rental_amount || 0);
                      const msg = remaining > 0
                        ? `Solder la réservation de ${viewingLocation.customer_name} ?\n\nMontant total : ${total.toLocaleString("fr-FR")} F\nReste à payer : ${remaining.toLocaleString("fr-FR")} F\n\nLe solde sera enregistré dans les recettes d'aujourd'hui.`
                        : `Marquer la réservation comme soldée ?\n\nMontant : ${total.toLocaleString("fr-FR")} F déjà perçus.`;
                      if (!window.confirm(msg)) return;
                      try {
                        await axios.post(`${API}/locations/${viewingLocation.id}/settle?${actorQs()}`);
                        toast.success("Réservation soldée — recette ajoutée à aujourd'hui");
                        setViewingLocation(null);
                        fetchLocations();
                      } catch (e) {
                        toast.error(e?.response?.data?.detail || "Erreur lors du solde");
                      }
                    }}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    data-testid="location-settle-btn"
                    title="Marque comme payée intégralement + enregistre la recette à la date du jour"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Solder en 1 clic
                  </Button>
                  <Button
                    onClick={() => { handleStatusChange(viewingLocation.id, "completed"); setViewingLocation(null); }}
                    className="bg-green-700 hover:bg-green-800"
                    title="Termine sans toucher au solde"
                  >
                    Terminée
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

      {/* Invoice Format Choice Modal */}
      <Dialog open={showInvoiceChoice} onOpenChange={setShowInvoiceChoice}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              Choisir le format
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-3 py-4">
            <p className="text-slate-400 text-sm text-center">Sélectionnez le format de la facture :</p>
            
            <Button
              onClick={() => { convertToInvoiceLarge(invoiceLocation); setShowInvoiceChoice(false); }}
              className="w-full bg-amber-600 hover:bg-amber-700 h-16"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8" />
                <div className="text-left">
                  <p className="font-bold">Grand Format (A4)</p>
                  <p className="text-xs opacity-75">Facture complète à imprimer</p>
                </div>
              </div>
            </Button>
            
            <Button
              onClick={() => { convertToInvoiceSmall(invoiceLocation); setShowInvoiceChoice(false); }}
              className="w-full bg-slate-600 hover:bg-slate-500 h-16"
            >
              <div className="flex items-center gap-3">
                <Receipt className="w-8 h-8" />
                <div className="text-left">
                  <p className="font-bold">Petit Format (Ticket)</p>
                  <p className="text-xs opacity-75">Pour imprimante thermique</p>
                </div>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
      </TabsContent>
    </Tabs>
  );
};

export default LocationsTab;
