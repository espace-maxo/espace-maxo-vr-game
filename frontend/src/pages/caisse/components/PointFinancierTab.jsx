import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { 
  Banknote, Smartphone, FileText, Wallet, 
  RefreshCw, Save, CheckCircle, X, AlertCircle, Lock, Calendar, Clock,
  Download, Eye, Unlock, ShieldCheck, TrendingUp, TrendingDown, ArrowUpDown
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
    cash_amount: 0, mobile_amount: 0, cheque_amount: 0, wallet_amount: 0, notes: ""
  });
  const [loading, setLoading] = useState(false);

  // Revenue comparison data from point hebdo
  const [revenueData, setRevenueData] = useState(null);

  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);

  const computedTotal = parseFloat(form.cash_amount || 0) +
    parseFloat(form.mobile_amount || 0) +
    parseFloat(form.cheque_amount || 0) +
    parseFloat(form.wallet_amount || 0);

  const isSigned = currentPoint?.signed === true;
  const isAdminValidated = currentPoint?.admin_validated === true;
  const isLocked = isSigned && isAdminValidated; // Fully locked
  const isPending = !currentPoint || currentPoint?.status === "pending";
  const formDisabled = isSigned || loading;

  const fetchPoints = useCallback(async () => {
    setLoading(true);
    try {
      const params = { period_type: periodType };
      params.date = periodType === "weekly" ? weekStart : selectedDate;
      const res = await axios.get(`${API}/financial-points`, { params });
      const points = res.data.financial_points || [];
      setAllPoints(points);
      if (points.length > 0) {
        const p = points[0];
        setCurrentPoint(p);
        setForm({
          cash_amount: p.cash_amount || 0, mobile_amount: p.mobile_amount || 0,
          cheque_amount: p.cheque_amount || 0, wallet_amount: p.wallet_amount || 0,
          notes: p.notes || ""
        });
      } else {
        setCurrentPoint(null);
        setForm({ cash_amount: 0, mobile_amount: 0, cheque_amount: 0, wallet_amount: 0, notes: "" });
      }
    } catch (err) {
      console.error("Erreur chargement:", err);
    } finally {
      setLoading(false);
    }
  }, [periodType, selectedDate, weekStart]);

  // Fetch revenue data for comparison
  const fetchRevenue = useCallback(async () => {
    try {
      const params = periodType === "weekly" ? { week_start: weekStart } : { date: selectedDate };
      const res = await axios.get(`${API}/reports/revenue-by-payment`, { params });
      setRevenueData(res.data);
    } catch (err) {
      console.error("Erreur chargement recettes:", err);
      setRevenueData(null);
    }
  }, [periodType, selectedDate, weekStart]);

  useEffect(() => { fetchPoints(); fetchRevenue(); }, [fetchPoints, fetchRevenue]);

  const handleWeekChange = (direction) => {
    const current = new Date(weekStart);
    const newStart = direction === "next" ? addWeeks(current, 1) : subWeeks(current, 1);
    setWeekStart(format(newStart, "yyyy-MM-dd"));
    setWeekEnd(format(endOfWeek(newStart, { weekStartsOn: 1 }), "yyyy-MM-dd"));
  };

  const savePoint = async () => {
    if (!canEdit) return;
    setLoading(true);
    try {
      const payload = {
        cash_amount: parseFloat(form.cash_amount || 0),
        mobile_amount: parseFloat(form.mobile_amount || 0),
        cheque_amount: parseFloat(form.cheque_amount || 0),
        wallet_amount: parseFloat(form.wallet_amount || 0),
        notes: form.notes
      };
      if (currentPoint) {
        await axios.put(`${API}/financial-points/${currentPoint.id}`, { ...payload, is_admin: isAdmin });
        toast.success("Reversement mis a jour");
      } else {
        await axios.post(`${API}/financial-points`, {
          date: periodType === "weekly" ? weekStart : selectedDate,
          end_date: periodType === "weekly" ? weekEnd : "",
          period_type: periodType, ...payload,
          created_by: currentUser?.full_name || currentUser?.username
        });
        toast.success("Reversement enregistre");
      }
      fetchPoints();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur");
    } finally { setLoading(false); }
  };

  // Gerante signs (step 1)
  const signPoint = async () => {
    if (!currentPoint || !consentChecked) return;
    setLoading(true);
    try {
      await axios.post(`${API}/financial-points/${currentPoint.id}/sign`, {
        signer_name: currentUser?.full_name || currentUser?.username,
        consent_text: "Je certifie l'exactitude des montants reverses dans ce point financier."
      });
      toast.success("Reversement signe par la gerante");
      setShowConsentModal(false);
      setConsentChecked(false);
      fetchPoints();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur");
    } finally { setLoading(false); }
  };

  // Admin validates (step 2 - final lock)
  const adminValidate = async () => {
    if (!currentPoint || !isAdmin) return;
    setLoading(true);
    try {
      await axios.post(`${API}/financial-points/${currentPoint.id}/admin-validate`, {
        admin_name: currentUser?.full_name || currentUser?.username || "Admin"
      });
      toast.success("Reversement valide par l'administrateur");
      fetchPoints();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur");
    } finally { setLoading(false); }
  };

  const unlockPoint = async () => {
    if (!currentPoint || !isAdmin) return;
    if (!window.confirm("Autoriser la modification de ce reversement ?")) return;
    setLoading(true);
    try {
      await axios.post(`${API}/financial-points/${currentPoint.id}/unlock`, {
        admin_name: currentUser?.full_name || currentUser?.username || "Admin"
      });
      toast.success("Reversement deverrouille");
      fetchPoints();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur");
    } finally { setLoading(false); }
  };

  const deletePoint = async () => {
    if (!currentPoint || !isAdmin) return;
    if (!window.confirm("Supprimer ce reversement ? Action irreversible.")) return;
    setLoading(true);
    try {
      await axios.delete(`${API}/financial-points/${currentPoint.id}`, { params: { is_admin: true } });
      toast.success("Reversement supprime");
      fetchPoints();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur");
    } finally { setLoading(false); }
  };

  const viewPdf = () => {
    if (!currentPoint) return;
    setPdfUrl(`${API}/financial-points/${currentPoint.id}/pdf`);
    setShowPdfViewer(true);
  };

  const downloadPdf = () => {
    if (!currentPoint) return;
    const link = document.createElement('a');
    link.href = `${API}/financial-points/${currentPoint.id}/pdf`;
    link.setAttribute('download', `reversement_${currentPoint.date}.pdf`);
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const periodLabel = periodType === "weekly"
    ? `Semaine du ${format(new Date(weekStart), "dd MMM", { locale: fr })} au ${format(new Date(weekEnd), "dd MMM yyyy", { locale: fr })}`
    : `Journee du ${format(new Date(selectedDate), "dd MMMM yyyy", { locale: fr })}`;

  const amountFields = [
    { key: "cash_amount", label: "Especes", icon: Banknote, color: "green", revenueKey: "cash" },
    { key: "mobile_amount", label: "Mobile Money", icon: Smartphone, color: "orange", revenueKey: "mobile" },
    { key: "cheque_amount", label: "Cheque", icon: FileText, color: "purple", revenueKey: "cheque" },
    { key: "wallet_amount", label: "Portefeuille / Credit", icon: Wallet, color: "amber", revenueKey: "wallet" },
  ];

  // Compute comparison data
  const comparison = amountFields.map(f => {
    const reversed = currentPoint ? (currentPoint[f.key] || 0) : parseFloat(form[f.key] || 0);
    const recorded = revenueData?.by_method?.[f.revenueKey] || 0;
    const diff = reversed - recorded;
    return { ...f, reversed, recorded, diff };
  });
  const totalReversed = comparison.reduce((s, c) => s + c.reversed, 0);
  const totalRecorded = revenueData?.total || 0;
  const totalDiff = totalReversed - totalRecorded;

  // ====== LOCKED VIEW (signed + admin validated = PDF mode) ======
  if (isLocked && currentPoint) {
    return (
      <div className="space-y-6" data-testid="point-financier-tab">
        <Header periodType={periodType} setPeriodType={setPeriodType} subtitle="Document verrouille" />
        <PeriodSelector periodType={periodType} weekStart={weekStart} weekEnd={weekEnd} selectedDate={selectedDate}
          setSelectedDate={setSelectedDate} handleWeekChange={handleWeekChange} periodLabel={periodLabel} fetchPoints={fetchPoints} />

        {/* Locked banner */}
        <Card className="bg-emerald-900/20 border-emerald-500/40">
          <CardContent className="p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <p className="text-emerald-400 font-bold text-lg">Reversement Valide & Verrouille</p>
                  <p className="text-slate-400 text-sm">
                    Signe par <span className="text-white font-medium">{currentPoint.signed_by}</span>
                    {currentPoint.signed_at && <> le {format(new Date(currentPoint.signed_at), "dd/MM/yyyy 'a' HH:mm", { locale: fr })}</>}
                  </p>
                  <p className="text-slate-500 text-xs mt-1">
                    Valide par {currentPoint.admin_validated_by} - Cree par {currentPoint.created_by}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-emerald-400">{formatPrice(currentPoint.total_amount)} F</p>
                <p className="text-slate-500 text-xs">Total reverse</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Amount summary */}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {amountFields.map(({ key, label, icon: Icon, color }) => {
            const val = currentPoint[key] || 0;
            if (val === 0) return null;
            return (
              <Card key={key} className={`bg-${color}-900/10 border-${color}-500/20`}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 text-${color}-400`} />
                    <span className="text-slate-300 text-sm">{label}</span>
                  </div>
                  <span className={`text-${color}-400 font-bold`}>{formatPrice(val)} F</span>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Comparison with hebdo */}
        <ComparisonCard comparison={comparison} totalReversed={totalReversed} totalRecorded={totalRecorded} totalDiff={totalDiff} />

        {/* PDF Actions */}
        <div className="flex flex-wrap gap-3 justify-center">
          <Button data-testid="fp-view-pdf-btn" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={viewPdf}>
            <Eye className="w-4 h-4 mr-2" /> Consulter le PDF
          </Button>
          <Button data-testid="fp-download-pdf-btn" className="bg-red-600 hover:bg-red-700 text-white" onClick={downloadPdf}>
            <Download className="w-4 h-4 mr-2" /> Telecharger le PDF
          </Button>
        </div>

        {/* Admin controls */}
        {isAdmin && (
          <Card className="bg-slate-800/30 border-amber-500/30">
            <CardContent className="p-4">
              <p className="text-amber-400 text-xs uppercase tracking-wider mb-3 font-bold">Actions Administrateur</p>
              <div className="flex gap-3">
                <Button data-testid="fp-unlock-btn" variant="outline" className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10" onClick={unlockPoint} disabled={loading}>
                  <Unlock className="w-4 h-4 mr-1" /> Autoriser la modification
                </Button>
                <Button data-testid="fp-delete-btn" variant="outline" className="border-red-500/50 text-red-400 hover:bg-red-500/10" onClick={deletePoint} disabled={loading}>
                  <X className="w-4 h-4 mr-1" /> Supprimer
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <PdfViewerModal open={showPdfViewer} onOpenChange={setShowPdfViewer} pdfUrl={pdfUrl} periodLabel={periodLabel} />
      </div>
    );
  }

  // ====== SIGNED but not yet validated by admin ======
  if (isSigned && !isAdminValidated && currentPoint) {
    return (
      <div className="space-y-6" data-testid="point-financier-tab">
        <Header periodType={periodType} setPeriodType={setPeriodType} subtitle="En attente de validation administrateur" />
        <PeriodSelector periodType={periodType} weekStart={weekStart} weekEnd={weekEnd} selectedDate={selectedDate}
          setSelectedDate={setSelectedDate} handleWeekChange={handleWeekChange} periodLabel={periodLabel} fetchPoints={fetchPoints} />

        <Card className="bg-blue-900/20 border-blue-500/40">
          <CardContent className="p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <Lock className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <p className="text-blue-400 font-bold text-lg flex items-center gap-2">
                    Reversement Signe
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30"><Clock className="w-3 h-3 mr-1" /> En attente validation Admin</Badge>
                  </p>
                  <p className="text-slate-400 text-sm">
                    Signe par <span className="text-white font-medium">{currentPoint.signed_by}</span>
                    {currentPoint.signed_at && <> le {format(new Date(currentPoint.signed_at), "dd/MM/yyyy 'a' HH:mm", { locale: fr })}</>}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-blue-400">{formatPrice(currentPoint.total_amount)} F</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {amountFields.map(({ key, label, icon: Icon, color }) => {
            const val = currentPoint[key] || 0;
            if (val === 0) return null;
            return (
              <Card key={key} className={`bg-${color}-900/10 border-${color}-500/20`}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2"><Icon className={`w-4 h-4 text-${color}-400`} /><span className="text-slate-300 text-sm">{label}</span></div>
                  <span className={`text-${color}-400 font-bold`}>{formatPrice(val)} F</span>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <ComparisonCard comparison={comparison} totalReversed={totalReversed} totalRecorded={totalRecorded} totalDiff={totalDiff} />

        <div className="flex flex-wrap gap-3 justify-end">
          {isAdmin && (
            <>
              <Button data-testid="fp-admin-validate-btn" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={adminValidate} disabled={loading}>
                <CheckCircle className="w-4 h-4 mr-1" /> Valider (Admin)
              </Button>
              <Button data-testid="fp-unlock-btn" variant="outline" className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10" onClick={unlockPoint} disabled={loading}>
                <Unlock className="w-4 h-4 mr-1" /> Renvoyer pour modification
              </Button>
              <Button data-testid="fp-delete-btn" variant="outline" className="border-red-500/50 text-red-400 hover:bg-red-500/10" onClick={deletePoint} disabled={loading}>
                <X className="w-4 h-4 mr-1" /> Supprimer
              </Button>
            </>
          )}
        </div>

        <WorkflowGuide step={2} />
      </div>
    );
  }

  // ====== EDIT/CREATE VIEW (pending) ======
  return (
    <div className="space-y-6" data-testid="point-financier-tab">
      <Header periodType={periodType} setPeriodType={setPeriodType} subtitle="Reversement des recettes par mode de paiement" />
      <PeriodSelector periodType={periodType} weekStart={weekStart} weekEnd={weekEnd} selectedDate={selectedDate}
        setSelectedDate={setSelectedDate} handleWeekChange={handleWeekChange} periodLabel={periodLabel} fetchPoints={fetchPoints} />

      {currentPoint && (
        <Card className="bg-amber-900/20 border-amber-500/40">
          <CardContent className="p-4 flex items-center gap-3">
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30"><Clock className="w-3 h-3 mr-1" /> Brouillon</Badge>
            <span className="text-slate-300 text-sm">Cree par <span className="text-white font-medium">{currentPoint.created_by}</span></span>
          </CardContent>
        </Card>
      )}

      {/* Amount Entry Form */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Banknote className="w-5 h-5 text-green-400" />
            Saisie du Reversement
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {amountFields.map(({ key, label, icon: Icon, color }) => (
              <div key={key} className={`bg-${color}-900/10 border border-${color}-500/20 rounded-lg p-4`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-8 h-8 rounded-full bg-${color}-500/20 flex items-center justify-center`}>
                    <Icon className={`w-4 h-4 text-${color}-400`} />
                  </div>
                  <Label className="text-slate-300 font-medium">{label}</Label>
                </div>
                <div className="relative">
                  <Input data-testid={`fp-input-${key}`} type="number" min="0" value={form[key]}
                    onChange={(e) => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                    disabled={formDisabled}
                    className="bg-slate-900/50 border-slate-600 text-white text-lg font-bold pr-8 disabled:opacity-50" placeholder="0" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">F</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <Label className="text-slate-300 mb-2 block">Observations / Notes</Label>
            <Textarea data-testid="fp-notes" value={form.notes}
              onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
              disabled={formDisabled} placeholder="Notes supplementaires..."
              className="bg-slate-900/50 border-slate-600 text-white disabled:opacity-50" />
          </div>

          <div className="mt-6 p-4 bg-gradient-to-r from-green-900/30 to-emerald-900/20 border border-green-500/40 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-medium text-lg">TOTAL REVERSEMENT</span>
              <span className="text-3xl font-bold text-green-400" data-testid="fp-total">{formatPrice(computedTotal)} F</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comparison */}
      <ComparisonCard comparison={comparison} totalReversed={currentPoint ? currentPoint.total_amount : computedTotal} totalRecorded={totalRecorded} totalDiff={(currentPoint ? currentPoint.total_amount : computedTotal) - totalRecorded} />

      {/* Actions */}
      <div className="flex flex-wrap gap-3 justify-end">
        {isAdmin && currentPoint && (
          <Button data-testid="fp-delete-btn" variant="outline" className="border-red-500/50 text-red-400 hover:bg-red-500/10" onClick={deletePoint} disabled={loading}>
            <X className="w-4 h-4 mr-1" /> Supprimer
          </Button>
        )}
        {canEdit && !isSigned && (
          <Button data-testid="fp-save-btn" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={savePoint} disabled={loading}>
            <Save className="w-4 h-4 mr-1" /> {currentPoint ? "Mettre a jour" : "Enregistrer"}
          </Button>
        )}
        {currentPoint && !isSigned && canEdit && (
          <Button data-testid="fp-sign-btn" className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => { setConsentChecked(false); setShowConsentModal(true); }} disabled={loading}>
            <ShieldCheck className="w-4 h-4 mr-1" /> Signer (Gerante)
          </Button>
        )}
      </div>

      {!currentPoint && (
        <Card className="bg-slate-800/30 border-slate-700">
          <CardContent className="p-6 text-center">
            <AlertCircle className="w-10 h-10 text-slate-500 mx-auto mb-3" />
            <p className="text-slate-400">Aucun reversement pour cette periode.</p>
            {canEdit && <p className="text-slate-500 text-sm mt-1">Saisissez les montants reverses et enregistrez.</p>}
          </CardContent>
        </Card>
      )}

      <WorkflowGuide step={isPending || !currentPoint ? 1 : (isSigned && !isAdminValidated ? 2 : 3)} />

      {/* Consent Modal */}
      <Dialog open={showConsentModal} onOpenChange={setShowConsentModal}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Signature du Reversement
            </DialogTitle>
            <DialogDescription className="text-slate-400">Confirmez votre consentement pour signer ce reversement.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm space-y-1">
              <p className="text-slate-400">Periode : <span className="text-white font-medium">{periodLabel}</span></p>
              <p className="text-slate-400">Total reverse : <span className="text-green-400 font-bold text-lg">{formatPrice(currentPoint?.total_amount || computedTotal)} F</span></p>
              {totalDiff !== 0 && (
                <p className={`text-sm ${totalDiff > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  Ecart avec recettes : {totalDiff > 0 ? '+' : ''}{formatPrice(totalDiff)} F
                </p>
              )}
            </div>
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-slate-700 hover:border-emerald-500/40 transition-colors" data-testid="fp-consent-label">
              <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-1 w-5 h-5 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500" data-testid="fp-consent-checkbox" />
              <span className="text-slate-300 text-sm leading-relaxed">
                Je certifie l'exactitude des montants reverses. Apres signature, seul l'administrateur pourra autoriser la modification ou la suppression.
              </span>
            </label>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" className="border-slate-600 text-slate-300" onClick={() => setShowConsentModal(false)}>Annuler</Button>
              <Button data-testid="fp-confirm-sign-btn" className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                onClick={signPoint} disabled={!consentChecked || loading}>
                <ShieldCheck className="w-4 h-4 mr-1" /> Je signe ce reversement
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PdfViewerModal open={showPdfViewer} onOpenChange={setShowPdfViewer} pdfUrl={pdfUrl} periodLabel={periodLabel} />
    </div>
  );
}

// ===== Sub-components =====

function Header({ periodType, setPeriodType, subtitle }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-4">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Banknote className="w-6 h-6 text-green-400" />
          Reversement des Recettes
        </h2>
        <p className="text-slate-400 text-sm">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button data-testid="fp-period-weekly" variant={periodType === "weekly" ? "default" : "outline"} size="sm"
          onClick={() => setPeriodType("weekly")}
          className={periodType === "weekly" ? "bg-green-600 hover:bg-green-700 text-white" : "border-slate-600 text-slate-300"}>
          <Calendar className="w-4 h-4 mr-1" /> Hebdomadaire
        </Button>
        <Button data-testid="fp-period-daily" variant={periodType === "daily" ? "default" : "outline"} size="sm"
          onClick={() => setPeriodType("daily")}
          className={periodType === "daily" ? "bg-green-600 hover:bg-green-700 text-white" : "border-slate-600 text-slate-300"}>
          <Clock className="w-4 h-4 mr-1" /> Journalier
        </Button>
      </div>
    </div>
  );
}

function PeriodSelector({ periodType, weekStart, weekEnd, selectedDate, setSelectedDate, handleWeekChange, periodLabel, fetchPoints }) {
  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardContent className="p-4">
        {periodType === "weekly" ? (
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="sm" className="border-slate-600 text-slate-300" onClick={() => handleWeekChange("prev")}>&larr;</Button>
            <span className="text-white font-medium text-lg" data-testid="fp-period-label">{periodLabel}</span>
            <Button variant="outline" size="sm" className="border-slate-600 text-slate-300" onClick={() => handleWeekChange("next")}>&rarr;</Button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-4">
            <Label className="text-slate-300">Date :</Label>
            <Input data-testid="fp-date-input" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-slate-900/50 border-slate-600 text-white w-auto" />
            <Button variant="outline" size="sm" className="border-slate-600 text-slate-300" onClick={fetchPoints}>
              <RefreshCw className="w-4 h-4 mr-1" /> Actualiser
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ComparisonCard({ comparison, totalReversed, totalRecorded, totalDiff }) {
  if (!totalRecorded && !totalReversed) return null;
  return (
    <Card className="bg-slate-800/50 border-slate-700" data-testid="fp-comparison-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-white flex items-center gap-2 text-base">
          <ArrowUpDown className="w-5 h-5 text-cyan-400" />
          Comparaison Reversement / Recettes Point Hebdo
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-700">
                <th className="p-2">Mode</th>
                <th className="p-2 text-right">Reverse</th>
                <th className="p-2 text-right">Recettes (Systeme)</th>
                <th className="p-2 text-right">Ecart</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map(c => (
                <tr key={c.key} className="border-b border-slate-700/50">
                  <td className="p-2 text-slate-300 flex items-center gap-2"><c.icon className={`w-4 h-4 text-${c.color}-400`} />{c.label}</td>
                  <td className="p-2 text-right text-white font-medium">{formatPrice(c.reversed)} F</td>
                  <td className="p-2 text-right text-slate-400">{formatPrice(c.recorded)} F</td>
                  <td className={`p-2 text-right font-bold ${c.diff === 0 ? 'text-slate-500' : c.diff > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {c.diff === 0 ? '-' : `${c.diff > 0 ? '+' : ''}${formatPrice(c.diff)} F`}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900/50 font-bold border-t-2 border-slate-600">
                <td className="p-2 text-white">TOTAL</td>
                <td className="p-2 text-right text-green-400">{formatPrice(totalReversed)} F</td>
                <td className="p-2 text-right text-slate-300">{formatPrice(totalRecorded)} F</td>
                <td className={`p-2 text-right ${totalDiff === 0 ? 'text-slate-500' : totalDiff > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {totalDiff === 0 ? (
                    <span className="flex items-center justify-end gap-1"><CheckCircle className="w-4 h-4" /> Conforme</span>
                  ) : (
                    <span className="flex items-center justify-end gap-1">
                      {totalDiff > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      {totalDiff > 0 ? '+' : ''}{formatPrice(totalDiff)} F
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {totalDiff !== 0 && (
          <div className={`mt-3 p-3 rounded-lg border text-sm ${totalDiff > 0 ? 'bg-emerald-900/10 border-emerald-500/30 text-emerald-400' : 'bg-red-900/10 border-red-500/30 text-red-400'}`}>
            {totalDiff > 0 
              ? `Excedent de ${formatPrice(totalDiff)} F : le reversement depasse les recettes enregistrees.`
              : `Deficit de ${formatPrice(Math.abs(totalDiff))} F : le reversement est inferieur aux recettes enregistrees.`
            }
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WorkflowGuide({ step }) {
  return (
    <Card className="bg-slate-800/30 border-slate-700">
      <CardContent className="p-4">
        <p className="text-slate-500 text-xs font-medium mb-2 uppercase tracking-wider">Processus de reversement</p>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className={`px-3 py-1 rounded-full ${step === 1 ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40' : 'bg-slate-700/50 text-slate-500'}`}>
            1. Saisie Gerante
          </span>
          <span className="text-slate-600">&rarr;</span>
          <span className={`px-3 py-1 rounded-full ${step === 2 ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/40' : 'bg-slate-700/50 text-slate-500'}`}>
            2. Signature Gerante
          </span>
          <span className="text-slate-600">&rarr;</span>
          <span className={`px-3 py-1 rounded-full ${step === 3 ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40' : 'bg-slate-700/50 text-slate-500'}`}>
            3. Validation Admin & PDF
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function PdfViewerModal({ open, onOpenChange, pdfUrl, periodLabel }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-4xl h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2"><FileText className="w-5 h-5 text-blue-400" /> Reversement - {periodLabel}</DialogTitle>
          <DialogDescription className="text-slate-400">Document officiel</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-hidden rounded-lg border border-slate-700" style={{height: 'calc(80vh - 100px)'}}>
          {pdfUrl && <iframe src={pdfUrl} className="w-full h-full bg-white" title="Reversement PDF" />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
