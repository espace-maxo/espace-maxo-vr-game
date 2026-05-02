import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Banknote, Smartphone, FileText, Wallet,
  RefreshCw, Save, CheckCircle, X, AlertCircle, Lock, Calendar, Clock,
  Download, Eye, Unlock, ShieldCheck, TrendingUp, TrendingDown, ArrowUpDown, ChevronDown, ChevronUp,
  Building2, UserCheck
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

export default function PointFinancierTab({ currentUser }) {
  const isAdmin = currentUser?.role === "admin";
  const isManager = currentUser?.role === "manager";
  const canEdit = isAdmin || isManager;

  const [periodType, setPeriodType] = useState("weekly");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [weekStart, setWeekStart] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [weekEnd, setWeekEnd] = useState(format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));

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

  // Tous les points signés non encore validés (toute période confondue) — pour l'Admin/DG.
  // Évite que la DG "ne voie rien" si le point signé se trouve sur une autre semaine
  // que celle sélectionnée par défaut.
  const [pendingValidations, setPendingValidations] = useState([]);
  const fetchPendingValidations = useCallback(async () => {
    if (!isAdmin) return;
    try {
      // Récupère tous les points et filtre côté client — plus robuste que de se reposer
      // sur le seul statut "signed" (certains anciens points peuvent ne pas l'avoir).
      const res = await axios.get(`${API}/financial-points`);
      const all = res.data.financial_points || [];
      const pending = all.filter(p => p.signed === true && p.admin_validated !== true);
      // Tri par date décroissante pour voir les plus récents en premier
      pending.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      setPendingValidations(pending);
    } catch {
      setPendingValidations([]);
    }
  }, [isAdmin]);

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
      if (points.length > 0) {
        const p = points[0];
        setCurrentPoint(p);
        setForm({
          cash_amount: p.cash_amount || 0, mobile_amount: p.mobile_amount || 0,
          cheque_amount: p.cheque_amount || 0, wallet_amount: p.wallet_amount || 0,
          momo_number: p.momo_number || "", destination: p.destination || "admin", notes: p.notes || ""
        });
        setBillettage(p.billettage || {});
      } else {
        setCurrentPoint(null);
        setForm({ cash_amount: 0, mobile_amount: 0, cheque_amount: 0, wallet_amount: 0, momo_number: "", destination: "admin", notes: "" });
        setBillettage({});
      }
    } catch (err) { console.error("Erreur:", err); }
    finally { setLoading(false); }
  }, [periodType, selectedDate, weekStart]);

  const fetchRevenue = useCallback(async () => {
    try {
      const params = periodType === "weekly" ? { week_start: weekStart } : { date: selectedDate };
      const res = await axios.get(`${API}/reports/revenue-by-payment`, { params });
      setRevenueData(res.data);
    } catch { setRevenueData(null); }
  }, [periodType, selectedDate, weekStart]);

  useEffect(() => { fetchPoints(); fetchRevenue(); fetchPendingValidations(); }, [fetchPoints, fetchRevenue, fetchPendingValidations]);

  const handleWeekChange = (dir) => {
    const n = dir === "next" ? addWeeks(new Date(weekStart), 1) : subWeeks(new Date(weekStart), 1);
    setWeekStart(format(n, "yyyy-MM-dd"));
    setWeekEnd(format(endOfWeek(n, { weekStartsOn: 1 }), "yyyy-MM-dd"));
  };

  const applyBillettage = () => {
    setForm(prev => ({ ...prev, cash_amount: billettageTotal }));
    toast.success(`Especes mis a jour : ${formatPrice(billettageTotal)} F`);
  };

  const savePoint = async (silent = false) => {
    if (!canEdit) return null;
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
          end_date: periodType === "weekly" ? weekEnd : "", period_type: periodType, ...payload,
          created_by: currentUser?.full_name || currentUser?.username
        });
        saved = r.data?.financial_point || null;
        if (!silent) toast.success("Reversement enregistre");
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
  const billettageRequired = parseFloat(form.cash_amount || 0) > 0;
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
    { key: "cash_amount", label: "Especes", icon: Banknote, color: "green", revenueKey: "cash" },
    { key: "mobile_amount", label: "Mobile Money", icon: Smartphone, color: "orange", revenueKey: "mobile" },
    { key: "cheque_amount", label: "Cheque", icon: FileText, color: "purple", revenueKey: "cheque" },
    { key: "wallet_amount", label: "Credit", icon: Wallet, color: "amber", revenueKey: "wallet" },
  ];

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

  // ===== LOCKED VIEW =====
  if (isLocked && currentPoint) {
    const DestIcon = destIcon(currentPoint.destination);
    return (
      <div className="space-y-6" data-testid="point-financier-tab">
        <PendingValidationsBanner />
        <Header periodType={periodType} setPeriodType={setPeriodType} subtitle="Document verrouille" />
        <PeriodSelector {...{ periodType, weekStart, weekEnd, selectedDate, setSelectedDate, handleWeekChange, periodLabel, fetchPoints }} />
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
      <Header periodType={periodType} setPeriodType={setPeriodType} subtitle="Reversement des recettes par mode de paiement" />
      <PeriodSelector {...{ periodType, weekStart, weekEnd, selectedDate, setSelectedDate, handleWeekChange, periodLabel, fetchPoints }} />

      {currentPoint && (
        <Card className="bg-amber-900/20 border-amber-500/40"><CardContent className="p-4 flex items-center gap-3">
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30"><Clock className="w-3 h-3 mr-1" /> Brouillon</Badge>
          <span className="text-slate-300 text-sm">Cree par <span className="text-white font-medium">{currentPoint.created_by}</span></span>
        </CardContent></Card>
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
        <CardHeader><CardTitle className="text-white flex items-center gap-2"><Banknote className="w-5 h-5 text-green-400" />Saisie du Reversement</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {amountFields.map(({ key, label, icon: Icon, color }) => (
              <div key={key} className={`bg-${color}-900/10 border border-${color}-500/20 rounded-lg p-4`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full bg-${color}-500/20 flex items-center justify-center`}><Icon className={`w-4 h-4 text-${color}-400`} /></div>
                    <Label className="text-slate-300 font-medium">{label}</Label>
                  </div>
                  {key === "cash_amount" && !formDisabled && (
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

                {/* Billettage under Especes */}
                {key === "cash_amount" && showBillettage && !formDisabled && (
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
            ))}
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
