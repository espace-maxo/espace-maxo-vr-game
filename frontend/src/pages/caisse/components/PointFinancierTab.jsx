import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { 
  Banknote, CreditCard, Smartphone, FileText, Wallet, 
  RefreshCw, Save, CheckCircle, X, AlertCircle, Lock, Calendar, Clock,
  Download, Eye, Unlock, ShieldCheck
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

const formatPrice = (price) => {
  return new Intl.NumberFormat('fr-FR').format(price || 0);
};

export default function PointFinancierTab({ currentUser }) {
  const isAdmin = currentUser?.role === "admin";
  const isManager = currentUser?.role === "manager";
  const canEdit = isAdmin || isManager;

  // Period state
  const [periodType, setPeriodType] = useState("weekly");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [weekStart, setWeekStart] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [weekEnd, setWeekEnd] = useState(format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));

  // Financial point data
  const [currentPoint, setCurrentPoint] = useState(null);
  const [allPoints, setAllPoints] = useState([]);
  const [form, setForm] = useState({
    cash_amount: 0, mobile_amount: 0, card_amount: 0,
    cheque_amount: 0, wallet_amount: 0, other_amount: 0, notes: ""
  });
  const [loading, setLoading] = useState(false);

  // Signature consent modal
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);

  // PDF viewer
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);

  const computedTotal = parseFloat(form.cash_amount || 0) +
    parseFloat(form.mobile_amount || 0) +
    parseFloat(form.card_amount || 0) +
    parseFloat(form.cheque_amount || 0) +
    parseFloat(form.wallet_amount || 0) +
    parseFloat(form.other_amount || 0);

  const isSigned = currentPoint?.signed === true;
  const isAdminValidated = currentPoint?.admin_validated === true;
  const isPending = currentPoint?.status === "pending";
  const formDisabled = isSigned || (isAdminValidated && !isAdmin) || loading;

  const fetchPoints = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (periodType === "daily") {
        params.date = selectedDate;
        params.period_type = "daily";
      } else {
        params.date = weekStart;
        params.period_type = "weekly";
      }
      const res = await axios.get(`${API}/financial-points`, { params });
      const points = res.data.financial_points || [];
      setAllPoints(points);
      if (points.length > 0) {
        const p = points[0];
        setCurrentPoint(p);
        setForm({
          cash_amount: p.cash_amount || 0, mobile_amount: p.mobile_amount || 0,
          card_amount: p.card_amount || 0, cheque_amount: p.cheque_amount || 0,
          wallet_amount: p.wallet_amount || 0, other_amount: p.other_amount || 0,
          notes: p.notes || ""
        });
      } else {
        setCurrentPoint(null);
        setForm({ cash_amount: 0, mobile_amount: 0, card_amount: 0, cheque_amount: 0, wallet_amount: 0, other_amount: 0, notes: "" });
      }
    } catch (err) {
      console.error("Erreur chargement points financiers:", err);
    } finally {
      setLoading(false);
    }
  }, [periodType, selectedDate, weekStart]);

  useEffect(() => { fetchPoints(); }, [fetchPoints]);

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
        ...form,
        cash_amount: parseFloat(form.cash_amount || 0),
        mobile_amount: parseFloat(form.mobile_amount || 0),
        card_amount: parseFloat(form.card_amount || 0),
        cheque_amount: parseFloat(form.cheque_amount || 0),
        wallet_amount: parseFloat(form.wallet_amount || 0),
        other_amount: parseFloat(form.other_amount || 0),
      };
      if (currentPoint) {
        await axios.put(`${API}/financial-points/${currentPoint.id}`, { ...payload, is_admin: isAdmin });
        toast.success("Point financier mis a jour");
      } else {
        await axios.post(`${API}/financial-points`, {
          date: periodType === "weekly" ? weekStart : selectedDate,
          end_date: periodType === "weekly" ? weekEnd : "",
          period_type: periodType,
          ...payload,
          created_by: currentUser?.full_name || currentUser?.username
        });
        toast.success("Point financier cree");
      }
      fetchPoints();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  };

  const adminValidate = async () => {
    if (!currentPoint || !isAdmin) return;
    setLoading(true);
    try {
      await axios.post(`${API}/financial-points/${currentPoint.id}/admin-validate`, {
        admin_name: currentUser?.full_name || currentUser?.username || "Admin"
      });
      toast.success("Point financier valide par l'administrateur");
      fetchPoints();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur lors de la validation");
    } finally {
      setLoading(false);
    }
  };

  const signPoint = async () => {
    if (!currentPoint || !consentChecked) return;
    setLoading(true);
    try {
      await axios.post(`${API}/financial-points/${currentPoint.id}/sign`, {
        signer_name: currentUser?.full_name || currentUser?.username,
        consent_text: "Je certifie l'exactitude des montants renseignes dans ce point financier."
      });
      toast.success("Point financier signe avec succes");
      setShowConsentModal(false);
      setConsentChecked(false);
      fetchPoints();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur lors de la signature");
    } finally {
      setLoading(false);
    }
  };

  const unlockPoint = async () => {
    if (!currentPoint || !isAdmin) return;
    if (!window.confirm("Autoriser la modification de ce point financier signe ?")) return;
    setLoading(true);
    try {
      await axios.post(`${API}/financial-points/${currentPoint.id}/unlock`, {
        admin_name: currentUser?.full_name || currentUser?.username || "Admin"
      });
      toast.success("Point financier deverrouille pour modification");
      fetchPoints();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  const deletePoint = async () => {
    if (!currentPoint || !isAdmin) return;
    if (!window.confirm("Supprimer ce point financier ? Cette action est irreversible.")) return;
    setLoading(true);
    try {
      await axios.delete(`${API}/financial-points/${currentPoint.id}`, { params: { is_admin: true } });
      toast.success("Point financier supprime");
      fetchPoints();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur lors de la suppression");
    } finally {
      setLoading(false);
    }
  };

  const viewPdf = () => {
    if (!currentPoint) return;
    const url = `${API}/financial-points/${currentPoint.id}/pdf`;
    setPdfUrl(url);
    setShowPdfViewer(true);
  };

  const downloadPdf = () => {
    if (!currentPoint) return;
    const url = `${API}/financial-points/${currentPoint.id}/pdf`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `point_financier_${currentPoint.date}.pdf`);
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const periodLabel = periodType === "weekly"
    ? `Semaine du ${format(new Date(weekStart), "dd MMM", { locale: fr })} au ${format(new Date(weekEnd), "dd MMM yyyy", { locale: fr })}`
    : `Journee du ${format(new Date(selectedDate), "dd MMMM yyyy", { locale: fr })}`;

  const statusBadge = () => {
    if (!currentPoint) return null;
    if (currentPoint.signed) return <Badge data-testid="fp-status-badge" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"><Lock className="w-3 h-3 mr-1" /> Signe</Badge>;
    if (currentPoint.admin_validated) return <Badge data-testid="fp-status-badge" className="bg-blue-500/20 text-blue-400 border-blue-500/30"><CheckCircle className="w-3 h-3 mr-1" /> Valide par Admin</Badge>;
    return <Badge data-testid="fp-status-badge" className="bg-amber-500/20 text-amber-400 border-amber-500/30"><Clock className="w-3 h-3 mr-1" /> En attente de validation</Badge>;
  };

  const amountFields = [
    { key: "cash_amount", label: "Especes", icon: Banknote, color: "green" },
    { key: "mobile_amount", label: "Mobile Money", icon: Smartphone, color: "orange" },
    { key: "card_amount", label: "Carte Bancaire", icon: CreditCard, color: "blue" },
    { key: "cheque_amount", label: "Cheque", icon: FileText, color: "purple" },
    { key: "wallet_amount", label: "Portefeuille / Credit", icon: Wallet, color: "amber" },
    { key: "other_amount", label: "Autres", icon: Banknote, color: "slate" },
  ];

  // ====== SIGNED VIEW (PDF mode) ======
  if (isSigned && currentPoint) {
    return (
      <div className="space-y-6" data-testid="point-financier-tab">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Banknote className="w-6 h-6 text-green-400" />
              Point Financier
            </h2>
            <p className="text-slate-400 text-sm">Document signe et verrouille</p>
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

        {/* Date selector */}
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

        {/* Signed status banner */}
        <Card className="bg-emerald-900/20 border-emerald-500/40">
          <CardContent className="p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <p className="text-emerald-400 font-bold text-lg flex items-center gap-2">
                    Point Financier Signe {statusBadge()}
                  </p>
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
                <p className="text-slate-500 text-xs">Total general</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Amount summary cards (read-only) */}
        <div className="grid gap-3 md:grid-cols-3">
          {amountFields.map(({ key, label, icon: Icon, color }) => {
            const val = currentPoint[key] || 0;
            if (val === 0) return null;
            return (
              <Card key={key} className={`bg-${color}-900/10 border-${color}-500/20`}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full bg-${color}-500/20 flex items-center justify-center`}>
                      <Icon className={`w-4 h-4 text-${color}-400`} />
                    </div>
                    <span className="text-slate-300 text-sm">{label}</span>
                  </div>
                  <span className={`text-${color}-400 font-bold`}>{formatPrice(val)} F</span>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {currentPoint.notes && (
          <Card className="bg-slate-800/30 border-slate-700">
            <CardContent className="p-4">
              <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Notes</p>
              <p className="text-slate-300 text-sm">{currentPoint.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* PDF Actions */}
        <div className="flex flex-wrap gap-3 justify-center">
          <Button data-testid="fp-view-pdf-btn" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={viewPdf}>
            <Eye className="w-4 h-4 mr-2" /> Consulter le PDF
          </Button>
          <Button data-testid="fp-download-pdf-btn" className="bg-red-600 hover:bg-red-700 text-white" onClick={downloadPdf}>
            <Download className="w-4 h-4 mr-2" /> Telecharger le PDF
          </Button>
        </div>

        {/* Admin controls for signed point */}
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

        {/* PDF Viewer Modal */}
        <Dialog open={showPdfViewer} onOpenChange={setShowPdfViewer}>
          <DialogContent className="bg-slate-900 border-slate-700 max-w-4xl h-[80vh]">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                Point Financier - {periodLabel}
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                Document officiel signe
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-hidden rounded-lg border border-slate-700" style={{height: 'calc(80vh - 100px)'}}>
              {pdfUrl && (
                <iframe src={pdfUrl} className="w-full h-full bg-white" title="Point Financier PDF" />
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ====== EDIT/CREATE VIEW ======
  return (
    <div className="space-y-6" data-testid="point-financier-tab">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Banknote className="w-6 h-6 text-green-400" />
            Point Financier
          </h2>
          <p className="text-slate-400 text-sm">Remise de fonds manuelle par mode de paiement</p>
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

      {/* Date selector */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-4">
          {periodType === "weekly" ? (
            <div className="flex items-center justify-center gap-4">
              <Button variant="outline" size="sm" className="border-slate-600 text-slate-300" onClick={() => handleWeekChange("prev")}>&larr; Semaine precedente</Button>
              <span className="text-white font-medium text-lg" data-testid="fp-period-label">{periodLabel}</span>
              <Button variant="outline" size="sm" className="border-slate-600 text-slate-300" onClick={() => handleWeekChange("next")}>Semaine suivante &rarr;</Button>
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

      {/* Status Banner */}
      {currentPoint && (
        <Card className={`border ${isAdminValidated ? "bg-blue-900/20 border-blue-500/40" : "bg-amber-900/20 border-amber-500/40"}`}>
          <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {statusBadge()}
              <span className="text-slate-300 text-sm">
                Cree par <span className="text-white font-medium">{currentPoint.created_by}</span>
                {currentPoint.admin_validated_by && <> - Valide par <span className="text-white font-medium">{currentPoint.admin_validated_by}</span></>}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Amount Entry Form */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Banknote className="w-5 h-5 text-green-400" />
            Saisie des Montants
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                    className="bg-slate-900/50 border-slate-600 text-white text-lg font-bold pr-8 disabled:opacity-50"
                    placeholder="0" />
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
              <span className="text-slate-300 font-medium text-lg">TOTAL</span>
              <span className="text-3xl font-bold text-green-400" data-testid="fp-total">{formatPrice(computedTotal)} F</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 justify-end">
        {isAdmin && currentPoint && (
          <Button data-testid="fp-delete-btn" variant="outline" className="border-red-500/50 text-red-400 hover:bg-red-500/10" onClick={deletePoint} disabled={loading}>
            <X className="w-4 h-4 mr-1" /> Supprimer
          </Button>
        )}

        {canEdit && !isSigned && (!isAdminValidated || isAdmin) && (
          <Button data-testid="fp-save-btn" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={savePoint} disabled={loading}>
            <Save className="w-4 h-4 mr-1" /> {currentPoint ? "Mettre a jour" : "Enregistrer"}
          </Button>
        )}

        {isAdmin && currentPoint && !isAdminValidated && !isSigned && (
          <Button data-testid="fp-admin-validate-btn" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={adminValidate} disabled={loading}>
            <CheckCircle className="w-4 h-4 mr-1" /> Valider (Admin)
          </Button>
        )}

        {currentPoint && isAdminValidated && !isSigned && canEdit && (
          <Button data-testid="fp-sign-btn" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { setConsentChecked(false); setShowConsentModal(true); }} disabled={loading}>
            <ShieldCheck className="w-4 h-4 mr-1" /> Signer
          </Button>
        )}
      </div>

      {/* Empty state */}
      {!currentPoint && (
        <Card className="bg-slate-800/30 border-slate-700">
          <CardContent className="p-6 text-center">
            <AlertCircle className="w-10 h-10 text-slate-500 mx-auto mb-3" />
            <p className="text-slate-400">Aucun point financier pour cette periode.</p>
            {canEdit && <p className="text-slate-500 text-sm mt-1">Remplissez les montants et cliquez sur Enregistrer.</p>}
          </CardContent>
        </Card>
      )}

      {/* Workflow Guide */}
      <Card className="bg-slate-800/30 border-slate-700">
        <CardContent className="p-4">
          <p className="text-slate-500 text-xs font-medium mb-2 uppercase tracking-wider">Processus de validation</p>
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className={`px-3 py-1 rounded-full ${isPending || !currentPoint ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40' : 'bg-slate-700/50 text-slate-500'}`}>
              1. Saisie Gerante
            </span>
            <span className="text-slate-600">&rarr;</span>
            <span className={`px-3 py-1 rounded-full ${isAdminValidated && !isSigned ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/40' : 'bg-slate-700/50 text-slate-500'}`}>
              2. Validation Admin
            </span>
            <span className="text-slate-600">&rarr;</span>
            <span className={`px-3 py-1 rounded-full ${isSigned ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40' : 'bg-slate-700/50 text-slate-500'}`}>
              3. Signature & PDF
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Consent Signature Modal */}
      <Dialog open={showConsentModal} onOpenChange={setShowConsentModal}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Signature du Point Financier
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Veuillez confirmer votre consentement pour signer ce document.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Summary */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm space-y-1">
              <p className="text-slate-400">Periode : <span className="text-white font-medium">{periodLabel}</span></p>
              <p className="text-slate-400">Total : <span className="text-green-400 font-bold text-lg">{formatPrice(currentPoint?.total_amount || computedTotal)} F</span></p>
              <p className="text-slate-400">Valide par : <span className="text-blue-400">{currentPoint?.admin_validated_by}</span></p>
            </div>

            {/* Consent checkbox */}
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-slate-700 hover:border-emerald-500/40 transition-colors" data-testid="fp-consent-label">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-1 w-5 h-5 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500"
                data-testid="fp-consent-checkbox"
              />
              <span className="text-slate-300 text-sm leading-relaxed">
                Je certifie l'exactitude des montants renseignes dans ce point financier. 
                Une fois signe, ce document sera verrouille et seul l'administrateur pourra autoriser sa modification ou sa suppression.
              </span>
            </label>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" className="border-slate-600 text-slate-300" onClick={() => setShowConsentModal(false)}>
                Annuler
              </Button>
              <Button data-testid="fp-confirm-sign-btn" className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                onClick={signPoint} disabled={!consentChecked || loading}>
                <ShieldCheck className="w-4 h-4 mr-1" /> Je signe ce document
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
