import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Banknote, Smartphone, FileText, Wallet,
  RefreshCw, Save, CheckCircle, X, AlertCircle, Lock, Calendar, Clock,
  Download, Eye, Unlock, ShieldCheck, TrendingUp, TrendingDown, ArrowUpDown, ChevronDown, ChevronUp,
  Building2, UserCheck, ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";
import { fr } from "date-fns/locale";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const formatPrice = (price) => new Intl.NumberFormat('fr-FR').format(price || 0);

const BILLS = [
  { value: 10000, label: "10 000", type: "billet" },
  { value: 5000, label: "5 000", type: "billet" },
  { value: 2000, label: "2 000", type: "billet" },
  { value: 1000, label: "1 000", type: "billet" },
  { value: 500, label: "500", type: "piece" },
];
const COINS = [
  { value: 200, label: "200", type: "piece" },
  { value: 100, label: "100", type: "piece" },
  { value: 50, label: "50", type: "piece" },
  { value: 25, label: "25", type: "piece" },
  { value: 10, label: "10", type: "piece" },
  { value: 5, label: "5", type: "piece" },
];
const ALL_DENOMS = [...BILLS, ...COINS];

// 4 catégories de reversements (1 par jour, indépendantes)
const CATEGORIES = [
  { value: "bar", label: "Bar", color: "orange", emoji: "Bar" },
  { value: "menu_combos", label: "Menu & Combos", color: "green", emoji: "Menu" },
  { value: "jeux", label: "Jeux", color: "blue", emoji: "Jeux" },
  { value: "locations", label: "Locations & Réservations", color: "purple", emoji: "Locations" },
];
const CATEGORY_LABEL = {
  bar: "Bar", menu_combos: "Menu & Combos", jeux: "Jeux", locations: "Locations & Réservations", all: "Reversement Global (legacy)",
};
const CATEGORY_BORDER_CLASS = {
  bar: "border-orange-500/50 bg-orange-500/5",
  menu_combos: "border-green-500/50 bg-green-500/5",
  jeux: "border-blue-500/50 bg-blue-500/5",
  locations: "border-purple-500/50 bg-purple-500/5",
};
const CATEGORY_TEXT_CLASS = {
  bar: "text-orange-400", menu_combos: "text-green-400", jeux: "text-blue-400", locations: "text-purple-400",
};

export default function PointFinancierTab({ currentUser, onGotoHebdo, fixedCategory = null, hideBillettage = false }) {
  const isAdmin = currentUser?.role === "admin";
  const isManager = currentUser?.role === "manager";
  const canEdit = isAdmin || isManager;

  const [periodType, setPeriodType] = useState("weekly");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [weekStart, setWeekStart] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [weekEnd, setWeekEnd] = useState(format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));

  // Catégorie actuellement éditée : 1 reversement par catégorie par jour/semaine.
  // Si fixedCategory est fourni (chaque onglet "Reversement <X>"), on la verrouille.
  const [activeCategory, setActiveCategory] = useState(fixedCategory || "bar");
  useEffect(() => {
    if (fixedCategory) setActiveCategory(fixedCategory);
  }, [fixedCategory]);
  // Map catégorie -> point existant (pour pouvoir afficher les 4 statuts d'un coup)
  const [pointsByCategory, setPointsByCategory] = useState({});
  // Snapshot des montants pré-remplis automatiquement (pour afficher l'écart si éditée)
  const [autoFillSnapshot, setAutoFillSnapshot] = useState(null);

  const [currentPoint, setCurrentPoint] = useState(null);
  const [allPoints, setAllPoints] = useState([]);
  const [form, setForm] = useState({
    cash_amount: 0, mobile_amount: 0, cheque_amount: 0, wallet_amount: 0,
    momo_number: "", destination: "admin", notes: ""
  });
  const [loading, setLoading] = useState(false);

  const [billettage, setBillettage] = useState({});
  const [showBillettage, setShowBillettage] = useState(false);
  const billettageTotal = ALL_DENOMS.reduce((sum, d) => sum + (parseInt(billettage[d.value] || 0) * d.value), 0);

  const [revenueData, setRevenueData] = useState(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);

  // Tracking des ajustements (motif obligatoire pour chaque modification d'un champ montant)
  const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false);
  // pendingAdjustments: [{field, old, new}] détectés au save
  const [pendingAdjustments, setPendingAdjustments] = useState([]);
  // adjustmentReasons: {field: reason}
  const [adjustmentReasons, setAdjustmentReasons] = useState({});
  // pendingPayloadRef : sauvegarde du payload à envoyer après confirmation des motifs
  const [pendingSavePayload, setPendingSavePayload] = useState(null);
  // Affichage de l'historique des ajustements
  const [showAdjustmentHistory, setShowAdjustmentHistory] = useState(false);

  // Tous les points signés non encore validés (toute période confondue) — pour l'Admin/DG.
  // Évite que la DG "ne voie rien" si le point signé se trouve sur une autre semaine
  // que celle sélectionnée par défaut.
  const [pendingValidations, setPendingValidations] = useState([]);
  const fetchPendingValidations = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await axios.get(`${API}/financial-points`);
      const all = res.data.financial_points || [];
      const pending = all.filter(p => p.signed === true && p.admin_validated !== true);
      pending.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      setPendingValidations(pending);
    } catch {
      setPendingValidations([]);
    }
  }, [isAdmin]);

  // Validation préalable du "Faire le point" pour la période courante.
  // Sans cette validation, la Gérante ne peut PAS éditer le Reversement.
  const [pointValidation, setPointValidation] = useState(null);
  const [pointValidationLoading, setPointValidationLoading] = useState(true);
  const fetchPointValidation = useCallback(async () => {
    setPointValidationLoading(true);
    try {
      const dateKey = periodType === "weekly" ? weekStart : selectedDate;
      const r = await axios.get(`${API}/point-validations`, { params: {
        date: dateKey,
        period_type: periodType === "weekly" ? "weekly" : "daily",
        ...(periodType === "weekly" ? { end_date: weekEnd } : {}),
      } });
      setPointValidation(r.data?.validated ? r.data.validation : null);
    } catch {
      setPointValidation(null);
    } finally {
      setPointValidationLoading(false);
    }
  }, [periodType, selectedDate, weekStart, weekEnd]);

  const computedTotal = parseFloat(form.cash_amount || 0) + parseFloat(form.mobile_amount || 0) +
    parseFloat(form.cheque_amount || 0) + parseFloat(form.wallet_amount || 0);

  const isSigned = currentPoint?.signed === true;
  const isAdminValidated = currentPoint?.admin_validated === true;
  const isLocked = isSigned && isAdminValidated;
  const isPending = !currentPoint || currentPoint?.status === "pending";
  const formDisabled = isSigned || loading;

  const fetchPoints = useCallback(async () => {
    setLoading(true);
    try {
      const params = { period_type: periodType, date: periodType === "weekly" ? weekStart : selectedDate };
      const res = await axios.get(`${API}/financial-points`, { params });
      const points = res.data.financial_points || [];
      setAllPoints(points);

      // Indexer par catégorie (1 point max par catégorie)
      const byCat = {};
      for (const p of points) {
        const cat = p.category || "all";
        if (!byCat[cat]) byCat[cat] = p;
      }
      setPointsByCategory(byCat);

      const target = byCat[activeCategory] || null;
      if (target) {
        setCurrentPoint(target);
        setForm({
          cash_amount: target.cash_amount || 0, mobile_amount: target.mobile_amount || 0,
          cheque_amount: target.cheque_amount || 0, wallet_amount: target.wallet_amount || 0,
          momo_number: target.momo_number || "", destination: target.destination || "admin", notes: target.notes || ""
        });
        setBillettage(target.billettage || {});
      } else {
        // === Pas de point existant : on tente le pré-remplissage automatique
        // à partir des ventes validées du jour/semaine. La Gérante peut éditer librement.
        setCurrentPoint(null);
        try {
          const autoRes = await axios.get(`${API}/reversements/auto-fill`, {
            params: {
              date: periodType === "weekly" ? weekStart : selectedDate,
              period_type: periodType === "weekly" ? "weekly" : "daily",
              ...(periodType === "weekly" ? { end_date: weekEnd } : {}),
            }
          });
          const buckets = autoRes.data?.categories?.[activeCategory] || { cash: 0, mobile: 0, cheque: 0, wallet: 0 };
          const prefilled = {
            cash_amount: buckets.cash || 0,
            mobile_amount: buckets.mobile || 0,
            cheque_amount: buckets.cheque || 0,
            wallet_amount: buckets.wallet || 0,
            momo_number: "",
            destination: "admin",
            notes: "",
          };
          setForm(prefilled);
          // Mémoriser la valeur calculée pour pouvoir afficher l'écart si l'utilisateur édite
          setAutoFillSnapshot({ category: activeCategory, ...buckets });
        } catch {
          setForm({ cash_amount: 0, mobile_amount: 0, cheque_amount: 0, wallet_amount: 0, momo_number: "", destination: "admin", notes: "" });
          setAutoFillSnapshot(null);
        }
        setBillettage({});
      }
    } catch (err) { console.error("Erreur:", err); }
    finally { setLoading(false); }
  }, [periodType, selectedDate, weekStart, activeCategory]);

  const fetchRevenue = useCallback(async () => {
    try {
      const params = periodType === "weekly" ? { week_start: weekStart } : { date: selectedDate };
      const res = await axios.get(`${API}/reports/revenue-by-payment`, { params });
      setRevenueData(res.data);
    } catch { setRevenueData(null); }
  }, [periodType, selectedDate, weekStart]);

  useEffect(() => { fetchPoints(); fetchRevenue(); fetchPendingValidations(); fetchPointValidation(); }, [fetchPoints, fetchRevenue, fetchPendingValidations, fetchPointValidation]);

  const handleWeekChange = (dir) => {
    const n = dir === "next" ? addWeeks(new Date(weekStart), 1) : subWeeks(new Date(weekStart), 1);
    setWeekStart(format(n, "yyyy-MM-dd"));
    setWeekEnd(format(endOfWeek(n, { weekStartsOn: 1 }), "yyyy-MM-dd"));
  };

  const applyBillettage = () => {
    setForm(prev => ({ ...prev, cash_amount: billettageTotal }));
    toast.success(`Especes mis a jour : ${formatPrice(billettageTotal)} F`);
  };

  // Détecte les ajustements (changements de cash/mobile/cheque/wallet) entre l'état actuel et currentPoint
  const detectAdjustments = () => {
    if (!currentPoint) return [];
    const fields = ["cash_amount", "mobile_amount", "cheque_amount", "wallet_amount"];
    const adjs = [];
    for (const f of fields) {
      const oldV = parseFloat(currentPoint[f] || 0);
      const newV = parseFloat(form[f] || 0);
      if (Math.abs(oldV - newV) > 0.5) {
        adjs.push({ field: f, old: oldV, new: newV });
      }
    }
    return adjs;
  };

  const FIELD_LABEL = {
    cash_amount: "Espèces",
    mobile_amount: "Mobile Money",
    cheque_amount: "Chèque",
    wallet_amount: "Crédit",
  };

  const savePoint = async (silent = false) => {
    if (!canEdit) return null;
    // Si on modifie un point existant, détecter les ajustements et demander motif AVANT save
    if (currentPoint && !silent) {
      const adjs = detectAdjustments();
      if (adjs.length > 0) {
        // Ouvrir la modale de motifs
        setPendingAdjustments(adjs);
        const initReasons = {};
        adjs.forEach(a => { initReasons[a.field] = ""; });
        setAdjustmentReasons(initReasons);
        setPendingSavePayload({
          cash_amount: parseFloat(form.cash_amount || 0),
          mobile_amount: parseFloat(form.mobile_amount || 0),
          cheque_amount: parseFloat(form.cheque_amount || 0),
          wallet_amount: parseFloat(form.wallet_amount || 0),
          momo_number: form.momo_number,
          destination: form.destination,
          notes: form.notes,
          billettage,
        });
        setAdjustmentModalOpen(true);
        return null;
      }
    }
    setLoading(true);
    try {
      const payload = {
        cash_amount: parseFloat(form.cash_amount || 0), mobile_amount: parseFloat(form.mobile_amount || 0),
        cheque_amount: parseFloat(form.cheque_amount || 0), wallet_amount: parseFloat(form.wallet_amount || 0),
        momo_number: form.momo_number, destination: form.destination, notes: form.notes, billettage
      };
      let saved = null;
      if (currentPoint) {
        const r = await axios.put(`${API}/financial-points/${currentPoint.id}`, { ...payload, is_admin: isAdmin });
        saved = r.data?.financial_point || currentPoint;
        if (!silent) toast.success("Reversement mis a jour");
      } else {
        const r = await axios.post(`${API}/financial-points`, {
          date: periodType === "weekly" ? weekStart : selectedDate,
          end_date: periodType === "weekly" ? weekEnd : "", period_type: periodType,
          category: activeCategory,
          ...payload,
          created_by: currentUser?.full_name || currentUser?.username
        });
        saved = r.data?.financial_point || null;
        if (!silent) toast.success(`Reversement ${CATEGORY_LABEL[activeCategory]} enregistré`);
      }
      // Refresh local state IMMEDIATELY so currentPoint reflects the saved id
      if (saved) {
        setCurrentPoint(saved);
        setForm({
          cash_amount: saved.cash_amount || 0,
          mobile_amount: saved.mobile_amount || 0,
          cheque_amount: saved.cheque_amount || 0,
          wallet_amount: saved.wallet_amount || 0,
          momo_number: saved.momo_number || "",
          destination: saved.destination || "admin",
          notes: saved.notes || "",
        });
        setBillettage(saved.billettage || {});
      }
      fetchPoints();
      return saved;
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur");
      return null;
    } finally { setLoading(false); }
  };

  // Confirme la modale de motifs et envoie le PUT avec _adjustments
  const confirmAdjustmentsAndSave = async () => {
    // Tous les motifs doivent être saisis (>= 3 caractères)
    const missing = pendingAdjustments.filter(a => !(adjustmentReasons[a.field] || "").trim() || (adjustmentReasons[a.field] || "").trim().length < 3);
    if (missing.length > 0) {
      toast.error(`Motif obligatoire (≥3 caractères) pour : ${missing.map(m => FIELD_LABEL[m.field]).join(", ")}`);
      return;
    }
    setLoading(true);
    try {
      const _adjustments = pendingAdjustments.map(a => ({
        field: a.field,
        old_value: a.old,
        new_value: a.new,
        reason: (adjustmentReasons[a.field] || "").trim(),
        adjusted_by: currentUser?.full_name || currentUser?.username || "",
      }));
      const r = await axios.put(`${API}/financial-points/${currentPoint.id}`, {
        ...pendingSavePayload,
        is_admin: isAdmin,
        _adjustments,
      });
      const saved = r.data?.financial_point || currentPoint;
      toast.success(`Reversement ajusté (${_adjustments.length} modification${_adjustments.length > 1 ? "s" : ""} tracée${_adjustments.length > 1 ? "s" : ""})`);
      setCurrentPoint(saved);
      setForm({
        cash_amount: saved.cash_amount || 0,
        mobile_amount: saved.mobile_amount || 0,
        cheque_amount: saved.cheque_amount || 0,
        wallet_amount: saved.wallet_amount || 0,
        momo_number: saved.momo_number || "",
        destination: saved.destination || "admin",
        notes: saved.notes || "",
      });
      setBillettage(saved.billettage || {});
      setAdjustmentModalOpen(false);
      setPendingAdjustments([]);
      setAdjustmentReasons({});
      setPendingSavePayload(null);
      fetchPoints();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur");
    } finally { setLoading(false); }
  };

  const signPoint = async () => {
    if (!consentChecked) return;
    setLoading(true);
    try {
      // Auto-save unsaved changes BEFORE signing so the latest amounts are signed.
      let target = currentPoint;
      const cashF = parseFloat(form.cash_amount || 0);
      const mobF = parseFloat(form.mobile_amount || 0);
      const chqF = parseFloat(form.cheque_amount || 0);
      const walF = parseFloat(form.wallet_amount || 0);
      const dirty =
        !target ||
        Math.abs((target.cash_amount || 0) - cashF) > 0.5 ||
        Math.abs((target.mobile_amount || 0) - mobF) > 0.5 ||
        Math.abs((target.cheque_amount || 0) - chqF) > 0.5 ||
        Math.abs((target.wallet_amount || 0) - walF) > 0.5 ||
        (target.momo_number || "") !== (form.momo_number || "") ||
        (target.destination || "admin") !== (form.destination || "admin") ||
        (target.notes || "") !== (form.notes || "") ||
        JSON.stringify(target.billettage || {}) !== JSON.stringify(billettage || {});
      if (dirty) {
        target = await savePoint(true);
      }
      if (!target?.id) {
        toast.error("Impossible d'enregistrer le reversement avant signature");
        return;
      }
      await axios.post(`${API}/financial-points/${target.id}/sign`, {
        signer_name: currentUser?.full_name || currentUser?.username,
        consent_text: "Je certifie l'exactitude des montants reverses dans ce reversement."
      });
      toast.success("Reversement signe"); setShowConsentModal(false); setConsentChecked(false); fetchPoints();
    } catch (err) { toast.error(err.response?.data?.detail || "Erreur"); }
    finally { setLoading(false); }
  };

  // Avant la signature, on force la gerante a effectuer (et appliquer) le billetage des especes.
  // Regle : si cash_amount > 0 (il y a des especes a verser), le billetage doit etre saisi
  // ET coherent (tolerance 0.5 F pour absorber les imprecisions de parseFloat).
  // Si hideBillettage=true → le billettage est géré globalement par BillettageGlobalCard,
  // donc on n'impose plus la vérification locale ici.
  const billettageRequired = !hideBillettage && parseFloat(form.cash_amount || 0) > 0;
  const cashMatches = billettageRequired
    ? (billettageTotal > 0 && Math.abs(billettageTotal - parseFloat(form.cash_amount || 0)) <= 0.5)
    : true; // Pas d'especes -> billetage pas necessaire

  const handleSignClick = () => {
    // 1. Especes > 0 mais aucune saisie de billetage → on ouvre la section et on scrolle dessus.
    if (billettageRequired && billettageTotal === 0) {
      setShowBillettage(true);
      toast.warning("Veuillez d'abord effectuer le billettage des especes avant de signer.");
      setTimeout(() => {
        const el = document.querySelector('[data-testid="fp-billettage-section"]');
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 250);
      return;
    }
    // 2. Billetage saisi mais pas applique (ou modifie apres application) → on l'applique automatiquement
    //    si la difference est claire ; sinon on demande confirmation à l'utilisateur.
    if (billettageRequired && Math.abs(billettageTotal - parseFloat(form.cash_amount || 0)) > 0.5) {
      // Auto-apply le billetage comme nouveau cash_amount → plus besoin de cliquer "Appliquer"
      setForm(prev => ({ ...prev, cash_amount: billettageTotal }));
      toast.info(`Espèces ajustées au billetage : ${formatPrice(billettageTotal)} F`);
    }
    // 3. Tout est bon (ou ajusté) → ouvrir la modale de signature
    setConsentChecked(false);
    setShowConsentModal(true);
  };


  const adminValidate = async () => {
    if (!currentPoint || !isAdmin) return;
    setLoading(true);
    try {
      await axios.post(`${API}/financial-points/${currentPoint.id}/admin-validate`, { admin_name: currentUser?.full_name || currentUser?.username || "Admin" });
      toast.success("Reversement valide par l'administrateur");
      fetchPoints();
      fetchPendingValidations();
    } catch (err) { toast.error(err.response?.data?.detail || "Erreur"); }
    finally { setLoading(false); }
  };

  // Navigue vers la période d'un point en attente de validation (utilisé par la bannière DG)
  const goToPoint = (point) => {
    if (point.period_type === "weekly") {
      setPeriodType("weekly");
      setWeekStart(point.date);
      if (point.end_date) setWeekEnd(point.end_date);
    } else {
      setPeriodType("daily");
      setSelectedDate(point.date);
    }
    // fetchPoints se déclenchera via useEffect
  };

  const unlockPoint = async () => {
    if (!currentPoint || !isAdmin || !window.confirm("Autoriser la modification ?")) return;
    setLoading(true);
    try {
      await axios.post(`${API}/financial-points/${currentPoint.id}/unlock`, { admin_name: currentUser?.full_name || currentUser?.username || "Admin" });
      toast.success("Reversement deverrouille"); fetchPoints();
    } catch (err) { toast.error(err.response?.data?.detail || "Erreur"); }
    finally { setLoading(false); }
  };

  const deletePoint = async () => {
    if (!currentPoint || !isAdmin || !window.confirm("Supprimer ce reversement ?")) return;
    setLoading(true);
    try {
      await axios.delete(`${API}/financial-points/${currentPoint.id}`, { params: { is_admin: true } });
      toast.success("Reversement supprime"); fetchPoints();
    } catch (err) { toast.error(err.response?.data?.detail || "Erreur"); }
    finally { setLoading(false); }
  };

  const viewPdf = () => { if (currentPoint) { setPdfUrl(`${API}/financial-points/${currentPoint.id}/pdf`); setShowPdfViewer(true); } };
  const downloadPdf = () => {
    if (!currentPoint) return;
    const a = document.createElement('a'); a.href = `${API}/financial-points/${currentPoint.id}/pdf`;
    a.setAttribute('download', `reversement_${currentPoint.date}.pdf`); a.target = '_blank';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // PDF consolidé de la journée/semaine — tous les reversements (4 catégories) sur un seul document.
  const downloadCombinedPdf = () => {
    const dDate = periodType === "weekly" ? weekStart : selectedDate;
    if (Object.keys(pointsByCategory).length === 0) { toast.error("Aucun reversement à exporter"); return; }
    const url = `${API}/reversements/combined-pdf?date=${dDate}&period_type=${periodType}${periodType === "weekly" ? `&end_date=${weekEnd}` : ""}`;
    const a = document.createElement('a'); a.href = url;
    a.setAttribute('download', `reversements_${dDate}.pdf`); a.target = '_blank';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };
  const viewCombinedPdf = () => {
    const dDate = periodType === "weekly" ? weekStart : selectedDate;
    if (Object.keys(pointsByCategory).length === 0) { toast.error("Aucun reversement à voir"); return; }
    const url = `${API}/reversements/combined-pdf?date=${dDate}&period_type=${periodType}${periodType === "weekly" ? `&end_date=${weekEnd}` : ""}`;
    setPdfUrl(url); setShowPdfViewer(true);
  };

  const periodLabel = periodType === "weekly"
    ? `Semaine du ${format(new Date(weekStart), "dd MMM", { locale: fr })} au ${format(new Date(weekEnd), "dd MMM yyyy", { locale: fr })}`
    : `Journee du ${format(new Date(selectedDate), "dd MMMM yyyy", { locale: fr })}`;

  // Bannière admin : liste des reversements signés en attente de validation.
  // Se déclenche peu importe la période courante → la DG ne peut plus "rater" un point signé.
  const PendingValidationsBanner = () => {
    if (!isAdmin || pendingValidations.length === 0) return null;
    const total = pendingValidations.reduce((s, p) => s + (p.total_amount || 0), 0);
    return (
      <Card className="bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border-amber-500/50 shadow-lg shadow-amber-500/5" data-testid="pending-validations-banner">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center animate-pulse">
                <ShieldCheck className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-amber-200 font-bold">
                  {pendingValidations.length} reversement{pendingValidations.length > 1 ? "s" : ""} en attente de votre validation
                </p>
                <p className="text-xs text-amber-300/70">Total : {formatPrice(total)} F · Cliquez sur un reversement pour l'ouvrir et le valider</p>
              </div>
            </div>
          </div>
          <div className="grid gap-2">
            {pendingValidations.map((p) => {
              const isCurrent = currentPoint?.id === p.id;
              const periodStr = p.period_type === "weekly" && p.end_date
                ? `${format(new Date(p.date), "dd/MM")} → ${format(new Date(p.end_date), "dd/MM/yyyy")}`
                : format(new Date(p.date), "dd MMMM yyyy", { locale: fr });
              return (
                <button
                  key={p.id}
                  onClick={() => goToPoint(p)}
                  className={`flex items-center justify-between gap-3 p-2.5 rounded border text-left transition ${
                    isCurrent
                      ? "bg-blue-500/20 border-blue-500/50 ring-1 ring-blue-400/50"
                      : "bg-slate-900/60 border-slate-700 hover:bg-slate-800 hover:border-amber-500/50"
                  }`}
                  data-testid={`pending-row-${p.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm">{periodStr}</p>
                    <p className="text-xs text-slate-400">
                      Signé par <span className="text-white">{p.signed_by}</span>
                      {p.signed_at && <> · le {format(new Date(p.signed_at), "dd/MM HH:mm")}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-lg font-bold text-amber-300">{formatPrice(p.total_amount)} F</span>
                    {isCurrent ? (
                      <Badge className="bg-blue-500/30 text-blue-200">Ouvert</Badge>
                    ) : (
                      <Badge className="bg-amber-500/20 text-amber-300">Valider →</Badge>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  const amountFields = [
    { key: "cash_amount", label: "Especes", icon: Banknote, color: "green", revenueKey: "cash", autoKey: "cash" },
    { key: "mobile_amount", label: "Mobile Money", icon: Smartphone, color: "orange", revenueKey: "mobile", autoKey: "mobile" },
    { key: "cheque_amount", label: "Cheque", icon: FileText, color: "purple", revenueKey: "cheque", autoKey: "cheque" },
    { key: "wallet_amount", label: "Credit", icon: Wallet, color: "amber", revenueKey: "wallet", autoKey: "wallet" },
  ];

  // Helper : remet la valeur calculée automatiquement dans un champ
  const resetAutoFill = (fieldKey, autoKey) => {
    if (!autoFillSnapshot) return;
    setForm(p => ({ ...p, [fieldKey]: autoFillSnapshot[autoKey] || 0 }));
  };
  const resetAllAutoFill = () => {
    if (!autoFillSnapshot) return;
    setForm(p => ({
      ...p,
      cash_amount: autoFillSnapshot.cash || 0,
      mobile_amount: autoFillSnapshot.mobile || 0,
      cheque_amount: autoFillSnapshot.cheque || 0,
      wallet_amount: autoFillSnapshot.wallet || 0,
    }));
    toast.success("Valeurs réinitialisées à partir des ventes du jour");
  };
  // Indique si le champ a été modifié par rapport au calcul automatique
  const isFieldEdited = (fieldKey, autoKey) => {
    if (!autoFillSnapshot || currentPoint) return false;
    return Math.abs(parseFloat(form[fieldKey] || 0) - (autoFillSnapshot[autoKey] || 0)) > 0.5;
  };

  const comparison = amountFields.map(f => {
    const reversed = currentPoint ? (currentPoint[f.key] || 0) : parseFloat(form[f.key] || 0);
    const recorded = revenueData?.by_method?.[f.revenueKey] || 0;
    return { ...f, reversed, recorded, diff: reversed - recorded };
  });
  const totalReversed = comparison.reduce((s, c) => s + c.reversed, 0);
  const totalRecorded = revenueData?.total || 0;
  const totalDiff = totalReversed - totalRecorded;

  const destLabel = (d) => d === "banque" ? "Verse a la banque" : "Remis a l'administrateur";
  const destIcon = (d) => d === "banque" ? Building2 : UserCheck;

  // === SÉLECTEUR DE CATÉGORIE (réutilisable dans toutes les vues) ===
  // Caché quand on est dans un onglet dédié (fixedCategory) — l'utilisateur ne peut
  // pas changer de catégorie dans ce mode (chaque onglet est isolé).
  const hasAnyPoint = Object.keys(pointsByCategory).length > 0;
  const CategorySelector = fixedCategory ? (
    <Card className={`bg-slate-800/50 border ${CATEGORY_BORDER_CLASS[activeCategory]}`}>
      <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge className={`${CATEGORY_TEXT_CLASS[activeCategory]} bg-slate-900/40 text-sm py-1 px-3`}>
            {CATEGORY_LABEL[activeCategory]}
          </Badge>
          <span className="text-slate-400 text-xs">Reversement dédié à cette catégorie</span>
        </div>
        {hasAnyPoint && pointsByCategory[activeCategory] && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 h-7 text-xs" onClick={viewCombinedPdf} data-testid="fp-combined-pdf-view">
              <Eye className="w-3 h-3 mr-1" /> PDF du jour
            </Button>
            <Button size="sm" variant="outline" className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 h-7 text-xs" onClick={downloadCombinedPdf} data-testid="fp-combined-pdf-download">
              <Download className="w-3 h-3 mr-1" /> Télécharger
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  ) : (
    <Card className="bg-slate-800/50 border-slate-700" data-testid="fp-category-selector">
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-base flex items-center gap-2 flex-wrap">
          <span>Catégorie du reversement</span>
          <span className="text-slate-500 text-xs font-normal hidden sm:inline">— 1 reversement distinct par catégorie pour la même période</span>
          <div className="ml-auto flex gap-2">
            {hasAnyPoint && (
              <>
                <Button size="sm" variant="outline" className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 h-7 text-xs" onClick={viewCombinedPdf} data-testid="fp-combined-pdf-view">
                  <Eye className="w-3 h-3 mr-1" /> PDF du jour
                </Button>
                <Button size="sm" variant="outline" className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 h-7 text-xs" onClick={downloadCombinedPdf} data-testid="fp-combined-pdf-download">
                  <Download className="w-3 h-3 mr-1" /> Télécharger
                </Button>
              </>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {CATEGORIES.map((c) => {
            const p = pointsByCategory[c.value];
            const isActive = activeCategory === c.value;
            const statusBadge = p ? (
              p.admin_validated
                ? <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px]"><CheckCircle className="w-2.5 h-2.5 mr-1" /> Validé</Badge>
                : p.signed
                ? <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/40 text-[10px]"><ShieldCheck className="w-2.5 h-2.5 mr-1" /> Signé</Badge>
                : <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px]"><Clock className="w-2.5 h-2.5 mr-1" /> Brouillon</Badge>
            ) : (
              <Badge className="bg-slate-700/40 text-slate-400 border-slate-600 text-[10px]">Non saisi</Badge>
            );
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setActiveCategory(c.value)}
                className={`relative text-left p-3 rounded-lg border-2 transition-all ${isActive ? `${CATEGORY_BORDER_CLASS[c.value]} ring-2 ring-offset-2 ring-offset-slate-900 ring-${c.color}-500/40` : "border-slate-700 bg-slate-800/30 hover:border-slate-600"}`}
                data-testid={`fp-cat-${c.value}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className={`font-semibold text-sm ${isActive ? CATEGORY_TEXT_CLASS[c.value] : "text-slate-300"}`}>{c.label}</span>
                  {statusBadge}
                </div>
                <p className={`text-lg font-bold ${isActive ? CATEGORY_TEXT_CLASS[c.value] : "text-slate-200"}`}>
                  {p ? `${formatPrice(p.total_amount)} F` : "—"}
                </p>
                {p?.signed_by && <p className="text-[10px] text-slate-500 mt-1 truncate">Signé par {p.signed_by}</p>}
              </button>
            );
          })}
        </div>
        <p className="text-slate-400 text-xs mt-3 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 text-cyan-400" />
          Vue active : <strong className={CATEGORY_TEXT_CLASS[activeCategory]}>{CATEGORY_LABEL[activeCategory]}</strong>. Cliquez sur une autre catégorie pour basculer.
        </p>
      </CardContent>
    </Card>
  );

  // ===== BLOCAGE : Gérante doit valider "Faire le point" avant Reversement =====
  // Ne s'applique PAS à l'Admin (bypass), et seulement si aucun reversement n'a encore été créé.
  const needsValidation = !isAdmin && !pointValidation && Object.keys(pointsByCategory).length === 0;
  if (!pointValidationLoading && needsValidation) {
    return (
      <div className="space-y-6" data-testid="point-financier-tab">
        <Header periodType={periodType} setPeriodType={setPeriodType} subtitle="Validation préalable requise" />
        <PeriodSelector {...{ periodType, weekStart, weekEnd, selectedDate, setSelectedDate, handleWeekChange, periodLabel, fetchPoints }} />

        <Card className="bg-gradient-to-br from-amber-900/20 to-orange-900/10 border-2 border-amber-500/50">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-amber-500/20 rounded-full flex items-center justify-center">
              <Lock className="w-8 h-8 text-amber-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-amber-300 mb-2">Reversement bloqué</h3>
              <p className="text-slate-300 max-w-lg mx-auto">
                Vous devez d'abord <strong className="text-white">valider "Faire le point"</strong> de cette période avant de pouvoir saisir un reversement.
              </p>
              <p className="text-slate-400 text-sm mt-2">
                Cette étape garantit que toutes les ventes ont été contrôlées avant la remise des recettes.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
              <Button
                onClick={() => onGotoHebdo && onGotoHebdo()}
                className="bg-cyan-600 hover:bg-cyan-700 text-white"
                data-testid="reversement-goto-hebdo-btn"
              >
                <ArrowLeft className="w-4 h-4 mr-1" /> Aller à "Faire le point"
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ===== LOCKED VIEW =====
  if (isLocked && currentPoint) {
    const DestIcon = destIcon(currentPoint.destination);
    return (
      <div className="space-y-6" data-testid="point-financier-tab">
        <PendingValidationsBanner />
        <Header periodType={periodType} setPeriodType={setPeriodType} subtitle="Document verrouille" />
        <PeriodSelector {...{ periodType, weekStart, weekEnd, selectedDate, setSelectedDate, handleWeekChange, periodLabel, fetchPoints }} />
        {CategorySelector}
        <Card className="bg-emerald-900/20 border-emerald-500/40">
          <CardContent className="p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center"><ShieldCheck className="w-6 h-6 text-emerald-400" /></div>
                <div>
                  <p className="text-emerald-400 font-bold text-lg">Reversement Valide & Verrouille</p>
                  <p className="text-slate-400 text-sm">Signe par <span className="text-white font-medium">{currentPoint.signed_by}</span>
                    {currentPoint.signed_at && <> le {format(new Date(currentPoint.signed_at), "dd/MM/yyyy 'a' HH:mm", { locale: fr })}</>}</p>
                  <p className="text-slate-500 text-xs mt-1">Valide par {currentPoint.admin_validated_by}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-emerald-400">{formatPrice(currentPoint.total_amount)} F</p>
                <p className="text-slate-500 text-xs">Total reverse</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Destination + Momo */}
        <div className="flex flex-wrap gap-3">
          <Badge className={`px-3 py-1.5 text-sm ${currentPoint.destination === 'banque' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'}`}>
            <DestIcon className="w-4 h-4 mr-1.5" /> {destLabel(currentPoint.destination)}
          </Badge>
          {currentPoint.momo_number && (
            <Badge className="px-3 py-1.5 text-sm bg-orange-500/20 text-orange-400 border-orange-500/30">
              <Smartphone className="w-4 h-4 mr-1.5" /> Momo : {currentPoint.momo_number}
            </Badge>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {amountFields.map(({ key, label, icon: Icon, color }) => {
            const val = currentPoint[key] || 0; if (val === 0) return null;
            return (<Card key={key} className={`bg-${color}-900/10 border-${color}-500/20`}><CardContent className="p-4 flex items-center justify-between"><div className="flex items-center gap-2"><Icon className={`w-4 h-4 text-${color}-400`} /><span className="text-slate-300 text-sm">{label}</span></div><span className={`text-${color}-400 font-bold`}>{formatPrice(val)} F</span></CardContent></Card>);
          })}
        </div>
        {currentPoint.billettage && Object.values(currentPoint.billettage).some(v => parseInt(v) > 0) && <BillettageReadOnly billettage={currentPoint.billettage} />}
        <ComparisonCard comparison={comparison} totalReversed={totalReversed} totalRecorded={totalRecorded} totalDiff={totalDiff} />
        <div className="flex flex-wrap gap-3 justify-center">
          <Button data-testid="fp-view-pdf-btn" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={viewPdf}><Eye className="w-4 h-4 mr-2" /> Consulter le PDF</Button>
          <Button data-testid="fp-download-pdf-btn" className="bg-red-600 hover:bg-red-700 text-white" onClick={downloadPdf}><Download className="w-4 h-4 mr-2" /> Telecharger le PDF</Button>
        </div>
        {isAdmin && (<Card className="bg-slate-800/30 border-amber-500/30"><CardContent className="p-4"><p className="text-amber-400 text-xs uppercase tracking-wider mb-3 font-bold">Actions Administrateur</p><div className="flex gap-3">
          <Button data-testid="fp-unlock-btn" variant="outline" className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10" onClick={unlockPoint} disabled={loading}><Unlock className="w-4 h-4 mr-1" /> Autoriser la modification</Button>
          <Button data-testid="fp-delete-btn" variant="outline" className="border-red-500/50 text-red-400 hover:bg-red-500/10" onClick={deletePoint} disabled={loading}><X className="w-4 h-4 mr-1" /> Supprimer</Button>
        </div></CardContent></Card>)}
        <PdfViewerModal open={showPdfViewer} onOpenChange={setShowPdfViewer} pdfUrl={pdfUrl} periodLabel={periodLabel} />
      </div>
    );
  }

  // ===== SIGNED (attente validation admin) =====
  if (isSigned && !isAdminValidated && currentPoint) {
    const DestIcon = destIcon(currentPoint.destination);
    return (
      <div className="space-y-6" data-testid="point-financier-tab">
        <PendingValidationsBanner />
        <Header periodType={periodType} setPeriodType={setPeriodType} subtitle="En attente de validation administrateur" />
        <PeriodSelector {...{ periodType, weekStart, weekEnd, selectedDate, setSelectedDate, handleWeekChange, periodLabel, fetchPoints }} />
        {CategorySelector}
        <Card className="bg-blue-900/20 border-blue-500/40"><CardContent className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center"><Lock className="w-6 h-6 text-blue-400" /></div>
              <div>
                <p className="text-blue-400 font-bold text-lg flex items-center gap-2">Reversement Signe
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30"><Clock className="w-3 h-3 mr-1" /> Attente validation Admin</Badge></p>
                <p className="text-slate-400 text-sm">Signe par <span className="text-white font-medium">{currentPoint.signed_by}</span></p>
              </div>
            </div>
            <div className="text-right"><p className="text-3xl font-bold text-blue-400">{formatPrice(currentPoint.total_amount)} F</p></div>
          </div>
        </CardContent></Card>
        <div className="flex flex-wrap gap-3">
          <Badge className={`px-3 py-1.5 text-sm ${currentPoint.destination === 'banque' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'}`}>
            <DestIcon className="w-4 h-4 mr-1.5" /> {destLabel(currentPoint.destination)}
          </Badge>
          {currentPoint.momo_number && <Badge className="px-3 py-1.5 text-sm bg-orange-500/20 text-orange-400 border-orange-500/30"><Smartphone className="w-4 h-4 mr-1.5" /> Momo : {currentPoint.momo_number}</Badge>}
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {amountFields.map(({ key, label, icon: Icon, color }) => {
            const val = currentPoint[key] || 0; if (val === 0) return null;
            return (<Card key={key} className={`bg-${color}-900/10 border-${color}-500/20`}><CardContent className="p-4 flex items-center justify-between"><div className="flex items-center gap-2"><Icon className={`w-4 h-4 text-${color}-400`} /><span className="text-slate-300 text-sm">{label}</span></div><span className={`text-${color}-400 font-bold`}>{formatPrice(val)} F</span></CardContent></Card>);
          })}
        </div>
        {currentPoint.billettage && Object.values(currentPoint.billettage).some(v => parseInt(v) > 0) && <BillettageReadOnly billettage={currentPoint.billettage} />}
        <ComparisonCard comparison={comparison} totalReversed={totalReversed} totalRecorded={totalRecorded} totalDiff={totalDiff} />
        <div className="flex flex-wrap gap-3 justify-end">
          {isAdmin && (<>
            <Button data-testid="fp-admin-validate-btn" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={adminValidate} disabled={loading}><CheckCircle className="w-4 h-4 mr-1" /> Valider (Admin)</Button>
            <Button data-testid="fp-unlock-btn" variant="outline" className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10" onClick={unlockPoint} disabled={loading}><Unlock className="w-4 h-4 mr-1" /> Renvoyer pour modification</Button>
            <Button data-testid="fp-delete-btn" variant="outline" className="border-red-500/50 text-red-400 hover:bg-red-500/10" onClick={deletePoint} disabled={loading}><X className="w-4 h-4 mr-1" /> Supprimer</Button>
          </>)}
        </div>
        <WorkflowGuide step={2} />
      </div>
    );
  }

  // ===== EDIT/CREATE =====
  return (
    <div className="space-y-6" data-testid="point-financier-tab">
      <PendingValidationsBanner />
      <Header periodType={periodType} setPeriodType={setPeriodType} subtitle="Reversement des recettes par catégorie (Bar / Menu / Jeux / Locations)" />
      <PeriodSelector {...{ periodType, weekStart, weekEnd, selectedDate, setSelectedDate, handleWeekChange, periodLabel, fetchPoints }} />

      {CategorySelector}

      {currentPoint && (
        <Card className={`bg-slate-800/40 border ${CATEGORY_BORDER_CLASS[activeCategory]}`}>
          <CardContent className="p-4 flex items-center gap-3 flex-wrap">
            <Badge className={`bg-slate-900/40 ${CATEGORY_TEXT_CLASS[activeCategory]} text-xs`}>
              {CATEGORY_LABEL[activeCategory]}
            </Badge>
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30"><Clock className="w-3 h-3 mr-1" /> Brouillon</Badge>
            <span className="text-slate-300 text-sm">Cree par <span className="text-white font-medium">{currentPoint.created_by}</span></span>
          </CardContent>
        </Card>
      )}

      {/* Destination du versement */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-4">
          <Label className="text-slate-300 mb-3 block font-medium">Destination du versement</Label>
          <div className="flex gap-3">
            <button data-testid="fp-dest-admin" type="button" onClick={() => !formDisabled && setForm(p => ({ ...p, destination: "admin" }))}
              className={`flex-1 p-3 rounded-lg border-2 transition-all flex items-center gap-3 ${form.destination === 'admin' ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-700 bg-slate-800/30 hover:border-slate-600'} ${formDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
              <UserCheck className={`w-5 h-5 ${form.destination === 'admin' ? 'text-cyan-400' : 'text-slate-500'}`} />
              <div className="text-left">
                <p className={`font-medium text-sm ${form.destination === 'admin' ? 'text-cyan-400' : 'text-slate-400'}`}>Remis a l'administrateur</p>
                <p className="text-slate-500 text-xs">Remise en main propre</p>
              </div>
            </button>
            <button data-testid="fp-dest-banque" type="button" onClick={() => !formDisabled && setForm(p => ({ ...p, destination: "banque" }))}
              className={`flex-1 p-3 rounded-lg border-2 transition-all flex items-center gap-3 ${form.destination === 'banque' ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700 bg-slate-800/30 hover:border-slate-600'} ${formDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
              <Building2 className={`w-5 h-5 ${form.destination === 'banque' ? 'text-blue-400' : 'text-slate-500'}`} />
              <div className="text-left">
                <p className={`font-medium text-sm ${form.destination === 'banque' ? 'text-blue-400' : 'text-slate-400'}`}>Verse a la banque</p>
                <p className="text-slate-500 text-xs">Depot bancaire</p>
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Saisie */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2 flex-wrap">
            <Banknote className="w-5 h-5 text-green-400" />Saisie du Reversement
            {autoFillSnapshot && !currentPoint && autoFillSnapshot.total > 0 && (
              <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/40 text-[10px] ml-2">
                Auto-calculé depuis les ventes
              </Badge>
            )}
            {autoFillSnapshot && !currentPoint && autoFillSnapshot.total > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto text-cyan-300 hover:bg-cyan-500/10 h-7 text-xs"
                onClick={resetAllAutoFill}
                data-testid="fp-reset-autofill"
              >
                <RefreshCw className="w-3 h-3 mr-1" /> Réinitialiser tout
              </Button>
            )}
          </CardTitle>
          {autoFillSnapshot && !currentPoint && autoFillSnapshot.total > 0 && (
            <p className="text-cyan-300/80 text-xs mt-1">
              Les montants sont pré-remplis à partir des ventes <strong>{CATEGORY_LABEL[activeCategory]}</strong> de la période ({formatPrice(autoFillSnapshot.total)} F). Modifiez librement si différent.
            </p>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {amountFields.map(({ key, label, icon: Icon, color, autoKey }) => {
              const edited = isFieldEdited(key, autoKey);
              const autoVal = autoFillSnapshot?.[autoKey] || 0;
              return (
              <div key={key} className={`bg-${color}-900/10 border ${edited ? 'border-amber-500/50' : `border-${color}-500/20`} rounded-lg p-4 transition-colors`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full bg-${color}-500/20 flex items-center justify-center`}><Icon className={`w-4 h-4 text-${color}-400`} /></div>
                    <Label className="text-slate-300 font-medium">{label}</Label>
                  </div>
                  {key === "cash_amount" && !formDisabled && !hideBillettage && (
                    <Button variant="ghost" size="sm" className="text-green-400 hover:text-green-300 text-xs h-7 px-2"
                      onClick={() => setShowBillettage(!showBillettage)} data-testid="fp-toggle-billettage">
                      {showBillettage ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />} Billettage
                    </Button>
                  )}
                </div>
                <div className="relative">
                  <Input data-testid={`fp-input-${key}`} type="number" min="0" value={form[key]}
                    onChange={(e) => setForm(p => ({ ...p, [key]: e.target.value }))} disabled={formDisabled}
                    className="bg-slate-900/50 border-slate-600 text-white text-lg font-bold pr-8 disabled:opacity-50" placeholder="0" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">F</span>
                </div>
                {/* Indicateur auto-calcul */}
                {autoFillSnapshot && !currentPoint && (autoVal > 0 || edited) && (
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">
                      Calculé : <strong className="text-cyan-300">{formatPrice(autoVal)} F</strong>
                      {edited && (
                        <span className="ml-2 text-amber-300">
                          ({parseFloat(form[key] || 0) > autoVal ? '+' : ''}{formatPrice(parseFloat(form[key] || 0) - autoVal)} F)
                        </span>
                      )}
                    </span>
                    {edited && !formDisabled && (
                      <button
                        type="button"
                        onClick={() => resetAutoFill(key, autoKey)}
                        className="text-cyan-300 hover:text-cyan-200 text-[10px] underline"
                        data-testid={`fp-reset-${key}`}
                      >
                        Restaurer
                      </button>
                    )}
                  </div>
                )}

                {/* Badge "Ajusté" : affiche le DERNIER ajustement de ce champ s'il existe dans l'historique */}
                {currentPoint?.adjustments && currentPoint.adjustments.filter(a => a.field === key).length > 0 && (() => {
                  const adjs = currentPoint.adjustments.filter(a => a.field === key);
                  const last = adjs[adjs.length - 1];
                  const delta = (last.new_value || 0) - (last.old_value || 0);
                  return (
                    <div className="mt-2 flex items-center gap-2 text-[11px] bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5" data-testid={`adjusted-badge-${key}`}>
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      <span className="text-amber-300 font-semibold">Ajusté {delta > 0 ? "+" : ""}{formatPrice(delta)} F</span>
                      <span className="text-slate-400 truncate">· {last.reason}</span>
                      {adjs.length > 1 && (
                        <Badge className="bg-slate-700/40 text-slate-300 text-[9px] ml-auto flex-shrink-0">
                          +{adjs.length - 1} autre{adjs.length > 2 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                  );
                })()}

                {/* Billettage under Especes */}
                {key === "cash_amount" && showBillettage && !formDisabled && !hideBillettage && (
                  <div className="mt-3 bg-slate-900/60 rounded-lg p-4 border border-green-500/30" data-testid="fp-billettage-section">
                    <p className="text-green-400 text-xs font-bold uppercase tracking-wider mb-3">Billettage des Especes</p>
                    {/* Billets */}
                    <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Billets</p>
                    <div className="grid grid-cols-5 gap-2 mb-3">
                      {BILLS.map(d => {
                        const qty = parseInt(billettage[d.value] || 0);
                        const sub = qty * d.value;
                        return (
                          <div key={d.value} className={`rounded-lg border p-2 text-center transition-all ${qty > 0 ? 'border-green-500/40 bg-green-900/20' : 'border-slate-700/50 bg-slate-800/30'}`}>
                            <p className="text-green-400 font-bold text-xs mb-1">{d.label} F</p>
                            <Input data-testid={`fp-bill-${d.value}`} type="number" min="0"
                              value={billettage[d.value] || ""}
                              onChange={(e) => setBillettage(p => ({ ...p, [d.value]: e.target.value }))}
                              className="bg-slate-900/50 border-slate-700 text-white text-center h-8 text-sm mb-1" placeholder="0" />
                            {qty > 0 && <p className="text-green-400/80 text-[10px] font-medium">{formatPrice(sub)} F</p>}
                          </div>
                        );
                      })}
                    </div>
                    {/* Pieces */}
                    <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Pieces</p>
                    <div className="grid grid-cols-6 gap-2 mb-3">
                      {COINS.map(d => {
                        const qty = parseInt(billettage[d.value] || 0);
                        const sub = qty * d.value;
                        return (
                          <div key={d.value} className={`rounded-lg border p-2 text-center transition-all ${qty > 0 ? 'border-amber-500/40 bg-amber-900/20' : 'border-slate-700/50 bg-slate-800/30'}`}>
                            <p className="text-amber-400 font-bold text-xs mb-1">{d.label} F</p>
                            <Input data-testid={`fp-bill-${d.value}`} type="number" min="0"
                              value={billettage[d.value] || ""}
                              onChange={(e) => setBillettage(p => ({ ...p, [d.value]: e.target.value }))}
                              className="bg-slate-900/50 border-slate-700 text-white text-center h-8 text-sm mb-1" placeholder="0" />
                            {qty > 0 && <p className="text-amber-400/80 text-[10px] font-medium">{formatPrice(sub)} F</p>}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-green-500/30">
                      <span className="text-green-400 font-bold">Total : {formatPrice(billettageTotal)} F</span>
                      <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-8 text-xs" onClick={applyBillettage} data-testid="fp-apply-billettage">
                        Appliquer aux Especes
                      </Button>
                    </div>
                  </div>
                )}

                {/* Momo number under Mobile Money */}
                {key === "mobile_amount" && (
                  <div className="mt-2">
                    <div className="relative">
                      <Input data-testid="fp-momo-number" type="text" value={form.momo_number}
                        onChange={(e) => setForm(p => ({ ...p, momo_number: e.target.value }))} disabled={formDisabled}
                        className="bg-slate-900/50 border-slate-600 text-white text-sm disabled:opacity-50 pl-9" placeholder="Numero Momo (ex: +229 97 00 00 00)" />
                      <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400/60" />
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>

          <div className="mt-4">
            <Label className="text-slate-300 mb-2 block">Observations / Notes</Label>
            <Textarea data-testid="fp-notes" value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
              disabled={formDisabled} placeholder="Notes supplementaires..." className="bg-slate-900/50 border-slate-600 text-white disabled:opacity-50" />
          </div>

          <div className="mt-6 p-4 bg-gradient-to-r from-green-900/30 to-emerald-900/20 border border-green-500/40 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-medium text-lg">TOTAL REVERSEMENT</span>
              <span className="text-3xl font-bold text-green-400" data-testid="fp-total">{formatPrice(computedTotal)} F</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <ComparisonCard comparison={comparison} totalReversed={currentPoint ? currentPoint.total_amount : computedTotal} totalRecorded={totalRecorded} totalDiff={(currentPoint ? currentPoint.total_amount : computedTotal) - totalRecorded} />

      {/* Historique des ajustements (visible si au moins 1 ajustement) */}
      {currentPoint?.adjustments && currentPoint.adjustments.length > 0 && (
        <Card className="bg-slate-800/40 border-amber-500/30" data-testid="adjustment-history-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between text-amber-300">
              <span className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Historique des ajustements <Badge className="bg-amber-500/20 text-amber-300 text-[10px] ml-2">{currentPoint.adjustments.length}</Badge>
              </span>
              <Button variant="ghost" size="sm" onClick={() => setShowAdjustmentHistory(!showAdjustmentHistory)} className="text-slate-300 h-7 px-2 text-xs" data-testid="adjustment-history-toggle">
                {showAdjustmentHistory ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
                {showAdjustmentHistory ? "Masquer" : "Voir le détail"}
              </Button>
            </CardTitle>
          </CardHeader>
          {showAdjustmentHistory && (
            <CardContent className="pt-0">
              <div className="space-y-2">
                {[...currentPoint.adjustments].reverse().map((a, idx) => {
                  const delta = (a.new_value || 0) - (a.old_value || 0);
                  return (
                    <div key={a.id || idx} className="bg-slate-900/60 border border-slate-700 rounded-lg p-3" data-testid={`adjustment-entry-${idx}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                        <div className="flex items-center gap-2 text-sm">
                          <Badge className="bg-amber-500/20 text-amber-300 text-[10px]">{FIELD_LABEL[a.field] || a.field}</Badge>
                          <span className="text-slate-400">{formatPrice(a.old_value)} F</span>
                          <span className="text-amber-400">→</span>
                          <span className="text-amber-300 font-bold">{formatPrice(a.new_value)} F</span>
                          <Badge className={`text-[10px] ${delta > 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>
                            {delta > 0 ? "+" : ""}{formatPrice(delta)} F
                          </Badge>
                        </div>
                        <span className="text-[10px] text-slate-500">
                          {a.adjusted_at ? new Date(a.adjusted_at).toLocaleString("fr-FR") : "—"}
                          {a.adjusted_by ? ` · ${a.adjusted_by}` : ""}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 italic pl-1 border-l-2 border-amber-500/40 ml-1">"{a.reason}"</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      <div className="flex flex-wrap gap-3 justify-end">
        {isAdmin && currentPoint && <Button data-testid="fp-delete-btn" variant="outline" className="border-red-500/50 text-red-400 hover:bg-red-500/10" onClick={deletePoint} disabled={loading}><X className="w-4 h-4 mr-1" /> Supprimer</Button>}
        {canEdit && !isSigned && <Button data-testid="fp-save-btn" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={savePoint} disabled={loading}><Save className="w-4 h-4 mr-1" /> {currentPoint ? "Mettre a jour" : "Enregistrer"}</Button>}
        {canEdit && !isSigned && <Button data-testid="fp-sign-btn" className={cashMatches ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-amber-600 hover:bg-amber-700 text-white"} onClick={handleSignClick} disabled={loading || (computedTotal <= 0)}><ShieldCheck className="w-4 h-4 mr-1" /> {cashMatches ? "Signer (Gérante)" : "Compléter le billetage"}</Button>}
      </div>

      {!currentPoint && (<Card className="bg-slate-800/30 border-slate-700"><CardContent className="p-6 text-center"><AlertCircle className="w-10 h-10 text-slate-500 mx-auto mb-3" /><p className="text-slate-400">Aucun reversement pour cette periode.</p>{canEdit && <p className="text-slate-500 text-sm mt-1">Saisissez les montants et enregistrez.</p>}</CardContent></Card>)}
      <WorkflowGuide step={isPending || !currentPoint ? 1 : (isSigned && !isAdminValidated ? 2 : 3)} />

      {/* Consent Modal */}
      <Dialog open={showConsentModal} onOpenChange={setShowConsentModal}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-400" />Signature du Reversement</DialogTitle>
            <DialogDescription className="text-slate-400">Confirmez votre consentement.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm space-y-1">
              <p className="text-slate-400">Periode : <span className="text-white font-medium">{periodLabel}</span></p>
              <p className="text-slate-400">Total : <span className="text-green-400 font-bold text-lg">{formatPrice(currentPoint?.total_amount || computedTotal)} F</span></p>
              <p className="text-slate-400">Destination : <span className="text-white">{destLabel(form.destination)}</span></p>
              {form.momo_number && <p className="text-slate-400">Momo : <span className="text-orange-400">{form.momo_number}</span></p>}
            </div>

            {/* Recap detaille du billetage des especes (si applicable) */}
            {billettageRequired && billettageTotal > 0 && (
              <div className="bg-emerald-900/15 border border-emerald-500/30 rounded-lg p-3 text-xs" data-testid="fp-billettage-recap">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-emerald-400 font-bold uppercase tracking-wider text-[11px]">Récap. billetage des espèces</p>
                  <Badge className={`${billettageTotal === parseFloat(form.cash_amount || 0) ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'} text-[10px]`}>
                    {billettageTotal === parseFloat(form.cash_amount || 0) ? 'Cohérent' : 'Écart'}
                  </Badge>
                </div>
                <div className="space-y-1">
                  {ALL_DENOMS.filter(d => parseInt(billettage[d.value] || 0) > 0).map(d => {
                    const qty = parseInt(billettage[d.value] || 0);
                    const sub = qty * d.value;
                    const isBill = d.type === 'billet';
                    return (
                      <div key={d.value} className="flex items-center justify-between py-0.5">
                        <span className="text-slate-300">
                          <span className={isBill ? 'text-green-400' : 'text-amber-400'}>{qty}</span>
                          {' '}{isBill ? (qty > 1 ? 'billets' : 'billet') : (qty > 1 ? 'pièces' : 'pièce')} de{' '}
                          <span className="text-white font-medium">{d.label} F</span>
                        </span>
                        <span className={`font-medium ${isBill ? 'text-green-400' : 'text-amber-400'}`}>{formatPrice(sub)} F</span>
                      </div>
                    );
                  })}
                  <div className="border-t border-emerald-500/20 pt-1.5 mt-1.5 flex items-center justify-between">
                    <span className="text-emerald-300 font-bold">Total billetage</span>
                    <span className="text-emerald-300 font-bold text-sm">{formatPrice(billettageTotal)} F</span>
                  </div>
                </div>
              </div>
            )}

            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-slate-700 hover:border-emerald-500/40 transition-colors" data-testid="fp-consent-label">
              <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-1 w-5 h-5 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500" data-testid="fp-consent-checkbox" />
              <span className="text-slate-300 text-sm leading-relaxed">Je certifie l'exactitude des montants reverses.</span>
            </label>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" className="border-slate-600 text-slate-300" onClick={() => setShowConsentModal(false)}>Annuler</Button>
              <Button data-testid="fp-confirm-sign-btn" className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                onClick={signPoint} disabled={!consentChecked || loading}><ShieldCheck className="w-4 h-4 mr-1" /> Je signe</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <PdfViewerModal open={showPdfViewer} onOpenChange={setShowPdfViewer} pdfUrl={pdfUrl} periodLabel={periodLabel} />

      {/* === Modale Ajustement avec motif obligatoire === */}
      <Dialog open={adjustmentModalOpen} onOpenChange={(open) => { if (!open) { setAdjustmentModalOpen(false); setPendingAdjustments([]); setAdjustmentReasons({}); setPendingSavePayload(null); } }}>
        <DialogContent className="bg-slate-900 border-amber-500/40 text-white max-w-2xl" data-testid="adjustment-modal">
          <DialogHeader>
            <DialogTitle className="text-amber-300 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Motif d'ajustement obligatoire
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-sm">
              {pendingAdjustments.length} montant{pendingAdjustments.length > 1 ? "s" : ""} modifié{pendingAdjustments.length > 1 ? "s" : ""} — précisez le motif de chaque ajustement pour la traçabilité.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {pendingAdjustments.map((adj) => (
              <div key={adj.field} className="border border-slate-700 bg-slate-800/40 rounded-lg p-3" data-testid={`adjustment-row-${adj.field}`}>
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white">{FIELD_LABEL[adj.field]}</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400">{formatPrice(adj.old)} F</span>
                    <span className="text-amber-400">→</span>
                    <span className="text-amber-300 font-bold">{formatPrice(adj.new)} F</span>
                    <Badge className={`text-[10px] ${adj.new > adj.old ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>
                      {adj.new > adj.old ? "+" : ""}{formatPrice(adj.new - adj.old)} F
                    </Badge>
                  </div>
                </div>
                <Textarea
                  placeholder="Motif clair (ex: Erreur saisie table 5, Cash manquant constaté, Pourboire reversé…)"
                  value={adjustmentReasons[adj.field] || ""}
                  onChange={(e) => setAdjustmentReasons(p => ({ ...p, [adj.field]: e.target.value }))}
                  className="bg-slate-900/60 border-slate-700 text-white text-sm"
                  rows={2}
                  data-testid={`adjustment-reason-${adj.field}`}
                />
                {((adjustmentReasons[adj.field] || "").trim().length > 0 && (adjustmentReasons[adj.field] || "").trim().length < 3) && (
                  <p className="text-rose-400 text-[11px] mt-1">Motif trop court (min. 3 caractères)</p>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2 justify-end pt-2 border-t border-slate-700">
            <Button variant="outline" className="border-slate-600 text-slate-300" onClick={() => { setAdjustmentModalOpen(false); setPendingAdjustments([]); setAdjustmentReasons({}); setPendingSavePayload(null); }} data-testid="adjustment-cancel">
              Annuler
            </Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={confirmAdjustmentsAndSave} disabled={loading} data-testid="adjustment-confirm">
              <Save className="w-4 h-4 mr-1" /> Confirmer & Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Sub-components
function Header({ periodType, setPeriodType, subtitle }) {
  return (<div className="flex items-center justify-between flex-wrap gap-4"><div><h2 className="text-2xl font-bold text-white flex items-center gap-2"><Banknote className="w-6 h-6 text-green-400" />Reversement des Recettes</h2><p className="text-slate-400 text-sm">{subtitle}</p></div><div className="flex items-center gap-2">
    <Button data-testid="fp-period-weekly" variant={periodType === "weekly" ? "default" : "outline"} size="sm" onClick={() => setPeriodType("weekly")} className={periodType === "weekly" ? "bg-green-600 hover:bg-green-700 text-white" : "border-slate-600 text-slate-300"}><Calendar className="w-4 h-4 mr-1" /> Hebdomadaire</Button>
    <Button data-testid="fp-period-daily" variant={periodType === "daily" ? "default" : "outline"} size="sm" onClick={() => setPeriodType("daily")} className={periodType === "daily" ? "bg-green-600 hover:bg-green-700 text-white" : "border-slate-600 text-slate-300"}><Clock className="w-4 h-4 mr-1" /> Journalier</Button>
  </div></div>);
}

function PeriodSelector({ periodType, weekStart, weekEnd, selectedDate, setSelectedDate, handleWeekChange, periodLabel, fetchPoints }) {
  return (<Card className="bg-slate-800/50 border-slate-700"><CardContent className="p-4">{periodType === "weekly" ? (
    <div className="flex items-center justify-center gap-4"><Button variant="outline" size="sm" className="border-slate-600 text-slate-300" onClick={() => handleWeekChange("prev")}>&larr;</Button><span className="text-white font-medium text-lg" data-testid="fp-period-label">{periodLabel}</span><Button variant="outline" size="sm" className="border-slate-600 text-slate-300" onClick={() => handleWeekChange("next")}>&rarr;</Button></div>
  ) : (<div className="flex items-center justify-center gap-4"><Label className="text-slate-300">Date :</Label><Input data-testid="fp-date-input" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-slate-900/50 border-slate-600 text-white w-auto" /><Button variant="outline" size="sm" className="border-slate-600 text-slate-300" onClick={fetchPoints}><RefreshCw className="w-4 h-4 mr-1" /> Actualiser</Button></div>)}</CardContent></Card>);
}

function BillettageReadOnly({ billettage }) {
  const items = ALL_DENOMS.filter(d => parseInt(billettage[d.value] || 0) > 0);
  if (!items.length) return null;
  const total = items.reduce((s, d) => s + parseInt(billettage[d.value]) * d.value, 0);
  return (
    <Card className="bg-green-900/10 border-green-500/20"><CardContent className="p-4">
      <p className="text-green-400 text-xs font-bold uppercase tracking-wider mb-3">Billettage des Especes</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {items.map(d => {
          const qty = parseInt(billettage[d.value]);
          return (<div key={d.value} className="bg-slate-800/50 rounded-lg p-2 text-center border border-green-500/20">
            <p className="text-green-400 font-bold text-xs">{d.label} F</p>
            <p className="text-white font-medium text-lg">{qty}</p>
            <p className="text-green-400/70 text-[10px]">{formatPrice(qty * d.value)} F</p>
          </div>);
        })}
      </div>
      <p className="text-green-400 font-bold text-sm mt-3 text-right">Total billettage : {formatPrice(total)} F</p>
    </CardContent></Card>
  );
}

function ComparisonCard({ comparison, totalReversed, totalRecorded, totalDiff }) {
  if (!totalRecorded && !totalReversed) return null;
  return (<Card className="bg-slate-800/50 border-slate-700" data-testid="fp-comparison-card"><CardHeader className="pb-2"><CardTitle className="text-white flex items-center gap-2 text-base"><ArrowUpDown className="w-5 h-5 text-cyan-400" />Comparaison Reversement / Recettes Point Hebdo</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-slate-400 border-b border-slate-700"><th className="p-2">Mode</th><th className="p-2 text-right">Reverse</th><th className="p-2 text-right">Recettes (Systeme)</th><th className="p-2 text-right">Ecart</th></tr></thead><tbody>
    {comparison.map(c => (<tr key={c.key} className="border-b border-slate-700/50"><td className="p-2 text-slate-300 flex items-center gap-2"><c.icon className={`w-4 h-4 text-${c.color}-400`} />{c.label}</td><td className="p-2 text-right text-white font-medium">{formatPrice(c.reversed)} F</td><td className="p-2 text-right text-slate-400">{formatPrice(c.recorded)} F</td><td className={`p-2 text-right font-bold ${c.diff === 0 ? 'text-slate-500' : c.diff > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{c.diff === 0 ? '-' : `${c.diff > 0 ? '+' : ''}${formatPrice(c.diff)} F`}</td></tr>))}
  </tbody><tfoot><tr className="bg-slate-900/50 font-bold border-t-2 border-slate-600"><td className="p-2 text-white">TOTAL</td><td className="p-2 text-right text-green-400">{formatPrice(totalReversed)} F</td><td className="p-2 text-right text-slate-300">{formatPrice(totalRecorded)} F</td><td className={`p-2 text-right ${totalDiff === 0 ? 'text-slate-500' : totalDiff > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{totalDiff === 0 ? <span className="flex items-center justify-end gap-1"><CheckCircle className="w-4 h-4" /> Conforme</span> : <span className="flex items-center justify-end gap-1">{totalDiff > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}{totalDiff > 0 ? '+' : ''}{formatPrice(totalDiff)} F</span>}</td></tr></tfoot></table></div>
    {totalDiff !== 0 && (<div className={`mt-3 p-3 rounded-lg border text-sm ${totalDiff > 0 ? 'bg-emerald-900/10 border-emerald-500/30 text-emerald-400' : 'bg-red-900/10 border-red-500/30 text-red-400'}`}>{totalDiff > 0 ? `Excedent de ${formatPrice(totalDiff)} F` : `Deficit de ${formatPrice(Math.abs(totalDiff))} F`}</div>)}
  </CardContent></Card>);
}

function WorkflowGuide({ step }) {
  return (<Card className="bg-slate-800/30 border-slate-700"><CardContent className="p-4"><p className="text-slate-500 text-xs font-medium mb-2 uppercase tracking-wider">Processus de reversement</p><div className="flex items-center gap-2 text-sm flex-wrap">
    <span className={`px-3 py-1 rounded-full ${step === 1 ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40' : 'bg-slate-700/50 text-slate-500'}`}>1. Saisie Gerante</span><span className="text-slate-600">&rarr;</span>
    <span className={`px-3 py-1 rounded-full ${step === 2 ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/40' : 'bg-slate-700/50 text-slate-500'}`}>2. Signature Gerante</span><span className="text-slate-600">&rarr;</span>
    <span className={`px-3 py-1 rounded-full ${step === 3 ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40' : 'bg-slate-700/50 text-slate-500'}`}>3. Validation Admin & PDF</span>
  </div></CardContent></Card>);
}

function PdfViewerModal({ open, onOpenChange, pdfUrl, periodLabel }) {
  return (<Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="bg-slate-900 border-slate-700 max-w-4xl h-[80vh]"><DialogHeader><DialogTitle className="text-white flex items-center gap-2"><FileText className="w-5 h-5 text-blue-400" /> Reversement - {periodLabel}</DialogTitle><DialogDescription className="text-slate-400">Document officiel</DialogDescription></DialogHeader><div className="flex-1 overflow-hidden rounded-lg border border-slate-700" style={{height: 'calc(80vh - 100px)'}}>{pdfUrl && <iframe src={pdfUrl} className="w-full h-full bg-white" title="Reversement PDF" />}</div></DialogContent></Dialog>);
}
