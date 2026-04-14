import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { 
  Banknote, CreditCard, Smartphone, FileText, Wallet, 
  RefreshCw, Save, CheckCircle, X, AlertCircle, Lock, Calendar, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek, addDays, subWeeks, addWeeks } from "date-fns";
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
    cash_amount: 0,
    mobile_amount: 0,
    card_amount: 0,
    cheque_amount: 0,
    wallet_amount: 0,
    other_amount: 0,
    notes: ""
  });
  const [loading, setLoading] = useState(false);

  // Signature modal
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const computedTotal = parseFloat(form.cash_amount || 0) +
    parseFloat(form.mobile_amount || 0) +
    parseFloat(form.card_amount || 0) +
    parseFloat(form.cheque_amount || 0) +
    parseFloat(form.wallet_amount || 0) +
    parseFloat(form.other_amount || 0);

  // Determine if the form is editable
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
          cash_amount: p.cash_amount || 0,
          mobile_amount: p.mobile_amount || 0,
          card_amount: p.card_amount || 0,
          cheque_amount: p.cheque_amount || 0,
          wallet_amount: p.wallet_amount || 0,
          other_amount: p.other_amount || 0,
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

  useEffect(() => {
    fetchPoints();
  }, [fetchPoints]);

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
      if (currentPoint) {
        await axios.put(`${API}/financial-points/${currentPoint.id}`, {
          ...form,
          cash_amount: parseFloat(form.cash_amount || 0),
          mobile_amount: parseFloat(form.mobile_amount || 0),
          card_amount: parseFloat(form.card_amount || 0),
          cheque_amount: parseFloat(form.cheque_amount || 0),
          wallet_amount: parseFloat(form.wallet_amount || 0),
          other_amount: parseFloat(form.other_amount || 0),
          is_admin: isAdmin
        });
        toast.success("Point financier mis a jour");
      } else {
        await axios.post(`${API}/financial-points`, {
          date: periodType === "weekly" ? weekStart : selectedDate,
          end_date: periodType === "weekly" ? weekEnd : "",
          period_type: periodType,
          ...form,
          cash_amount: parseFloat(form.cash_amount || 0),
          mobile_amount: parseFloat(form.mobile_amount || 0),
          card_amount: parseFloat(form.card_amount || 0),
          cheque_amount: parseFloat(form.cheque_amount || 0),
          wallet_amount: parseFloat(form.wallet_amount || 0),
          other_amount: parseFloat(form.other_amount || 0),
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

  const signPoint = async (signatureDataUrl) => {
    if (!currentPoint) return;
    setLoading(true);
    try {
      await axios.post(`${API}/financial-points/${currentPoint.id}/sign`, {
        signature_data: signatureDataUrl,
        signer_name: currentUser?.full_name || currentUser?.username
      });
      toast.success("Point financier signe avec succes");
      setShowSignatureModal(false);
      fetchPoints();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur lors de la signature");
    } finally {
      setLoading(false);
    }
  };

  const deletePoint = async () => {
    if (!currentPoint) return;
    if (!window.confirm("Supprimer ce point financier ?")) return;
    setLoading(true);
    try {
      await axios.delete(`${API}/financial-points/${currentPoint.id}`, { params: { is_admin: isAdmin } });
      toast.success("Point financier supprime");
      fetchPoints();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur lors de la suppression");
    } finally {
      setLoading(false);
    }
  };

  // --- Signature Canvas Logic ---
  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  };

  const startDraw = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDraw = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const submitSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    signPoint(dataUrl);
  };

  // Period display label
  const periodLabel = periodType === "weekly"
    ? `Semaine du ${format(new Date(weekStart), "dd MMM", { locale: fr })} au ${format(new Date(weekEnd), "dd MMM yyyy", { locale: fr })}`
    : `Journee du ${format(new Date(selectedDate), "dd MMMM yyyy", { locale: fr })}`;

  // Status badge
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

        {/* Period toggle */}
        <div className="flex items-center gap-2">
          <Button
            data-testid="fp-period-weekly"
            variant={periodType === "weekly" ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriodType("weekly")}
            className={periodType === "weekly" ? "bg-green-600 hover:bg-green-700 text-white" : "border-slate-600 text-slate-300"}
          >
            <Calendar className="w-4 h-4 mr-1" /> Hebdomadaire
          </Button>
          <Button
            data-testid="fp-period-daily"
            variant={periodType === "daily" ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriodType("daily")}
            className={periodType === "daily" ? "bg-green-600 hover:bg-green-700 text-white" : "border-slate-600 text-slate-300"}
          >
            <Clock className="w-4 h-4 mr-1" /> Journalier
          </Button>
        </div>
      </div>

      {/* Date selector */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-4">
          {periodType === "weekly" ? (
            <div className="flex items-center justify-center gap-4">
              <Button variant="outline" size="sm" className="border-slate-600 text-slate-300" onClick={() => handleWeekChange("prev")}>
                &larr; Semaine precedente
              </Button>
              <span className="text-white font-medium text-lg" data-testid="fp-period-label">{periodLabel}</span>
              <Button variant="outline" size="sm" className="border-slate-600 text-slate-300" onClick={() => handleWeekChange("next")}>
                Semaine suivante &rarr;
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-4">
              <Label className="text-slate-300">Date :</Label>
              <Input
                data-testid="fp-date-input"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-slate-900/50 border-slate-600 text-white w-auto"
              />
              <Button variant="outline" size="sm" className="border-slate-600 text-slate-300" onClick={fetchPoints}>
                <RefreshCw className="w-4 h-4 mr-1" /> Actualiser
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Banner */}
      {currentPoint && (
        <Card className={`border ${
          isSigned ? "bg-emerald-900/20 border-emerald-500/40" :
          isAdminValidated ? "bg-blue-900/20 border-blue-500/40" :
          "bg-amber-900/20 border-amber-500/40"
        }`}>
          <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {statusBadge()}
              <span className="text-slate-300 text-sm">
                Cree par <span className="text-white font-medium">{currentPoint.created_by}</span>
                {currentPoint.admin_validated_by && (
                  <> - Valide par <span className="text-white font-medium">{currentPoint.admin_validated_by}</span></>
                )}
                {currentPoint.signed_by && (
                  <> - Signe par <span className="text-white font-medium">{currentPoint.signed_by}</span></>
                )}
              </span>
            </div>
            {isSigned && currentPoint.signature_data && (
              <img src={currentPoint.signature_data} alt="Signature" className="h-10 border border-slate-600 rounded bg-white" data-testid="fp-signature-img" />
            )}
          </CardContent>
        </Card>
      )}

      {/* Amount Entry Form */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Banknote className="w-5 h-5 text-green-400" />
            Saisie des Montants
            {isSigned && <Lock className="w-4 h-4 text-emerald-400 ml-2" />}
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
                  <Input
                    data-testid={`fp-input-${key}`}
                    type="number"
                    min="0"
                    value={form[key]}
                    onChange={(e) => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                    disabled={formDisabled}
                    className="bg-slate-900/50 border-slate-600 text-white text-lg font-bold pr-8 disabled:opacity-50"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">F</span>
                </div>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div className="mt-4">
            <Label className="text-slate-300 mb-2 block">Observations / Notes</Label>
            <Textarea
              data-testid="fp-notes"
              value={form.notes}
              onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
              disabled={formDisabled}
              placeholder="Notes supplementaires..."
              className="bg-slate-900/50 border-slate-600 text-white disabled:opacity-50"
            />
          </div>

          {/* Total */}
          <div className="mt-6 p-4 bg-gradient-to-r from-green-900/30 to-emerald-900/20 border border-green-500/40 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-medium text-lg">TOTAL</span>
              <span className="text-3xl font-bold text-green-400" data-testid="fp-total">
                {formatPrice(computedTotal)} F
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 justify-end">
        {/* Delete - only admin on non-signed, or admin on signed */}
        {currentPoint && isAdmin && (
          <Button
            data-testid="fp-delete-btn"
            variant="outline"
            className="border-red-500/50 text-red-400 hover:bg-red-500/10"
            onClick={deletePoint}
            disabled={loading}
          >
            <X className="w-4 h-4 mr-1" /> Supprimer
          </Button>
        )}

        {/* Save - manager or admin, only if not signed (admin can still edit signed) */}
        {canEdit && (!isSigned || isAdmin) && (
          <Button
            data-testid="fp-save-btn"
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={savePoint}
            disabled={loading || (isAdminValidated && !isAdmin)}
          >
            <Save className="w-4 h-4 mr-1" /> {currentPoint ? "Mettre a jour" : "Enregistrer"}
          </Button>
        )}

        {/* Admin Validate - only admin, only if pending */}
        {isAdmin && currentPoint && !isAdminValidated && !isSigned && (
          <Button
            data-testid="fp-admin-validate-btn"
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={adminValidate}
            disabled={loading}
          >
            <CheckCircle className="w-4 h-4 mr-1" /> Valider (Admin)
          </Button>
        )}

        {/* Sign - only after admin validation, and not yet signed */}
        {currentPoint && isAdminValidated && !isSigned && canEdit && (
          <Button
            data-testid="fp-sign-btn"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => setShowSignatureModal(true)}
            disabled={loading}
          >
            <Lock className="w-4 h-4 mr-1" /> Signer electroniquement
          </Button>
        )}
      </div>

      {/* Info about workflow */}
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
              3. Signature Electronique
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Recent Financial Points history */}
      {allPoints.length > 1 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-base">Historique des Points Financiers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {allPoints.slice(1).map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
                  <div>
                    <span className="text-white text-sm font-medium">
                      {p.period_type === "weekly" 
                        ? `Semaine ${format(new Date(p.date), "dd/MM")} - ${p.end_date ? format(new Date(p.end_date), "dd/MM/yyyy") : ""}`
                        : format(new Date(p.date), "dd/MM/yyyy")
                      }
                    </span>
                    <span className="text-slate-500 text-xs ml-2">par {p.created_by}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-green-400 font-bold text-sm">{formatPrice(p.total_amount)} F</span>
                    {p.signed ? (
                      <Badge className="bg-emerald-500/20 text-emerald-400 text-xs"><Lock className="w-3 h-3" /></Badge>
                    ) : p.admin_validated ? (
                      <Badge className="bg-blue-500/20 text-blue-400 text-xs"><CheckCircle className="w-3 h-3" /></Badge>
                    ) : (
                      <Badge className="bg-amber-500/20 text-amber-400 text-xs"><Clock className="w-3 h-3" /></Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Signature Modal */}
      <Dialog open={showSignatureModal} onOpenChange={setShowSignatureModal}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-emerald-400" />
              Signature Electronique
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-slate-400 text-sm">
              Dessinez votre signature ci-dessous. Une fois signe, le point financier sera verrouille.
            </p>
            {/* Summary */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 text-sm">
              <p className="text-slate-400">Periode : <span className="text-white">{periodLabel}</span></p>
              <p className="text-slate-400">Total : <span className="text-green-400 font-bold">{formatPrice(currentPoint?.total_amount || computedTotal)} F</span></p>
              <p className="text-slate-400">Valide par : <span className="text-blue-400">{currentPoint?.admin_validated_by}</span></p>
            </div>
            {/* Canvas */}
            <div className="border-2 border-dashed border-slate-600 rounded-lg overflow-hidden bg-white">
              <canvas
                ref={canvasRef}
                width={440}
                height={200}
                data-testid="fp-signature-canvas"
                className="cursor-crosshair w-full touch-none"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={endDraw}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                data-testid="fp-clear-signature-btn"
                variant="outline"
                className="border-slate-600 text-slate-300"
                onClick={clearCanvas}
              >
                Effacer
              </Button>
              <Button
                variant="outline"
                className="border-slate-600 text-slate-300"
                onClick={() => setShowSignatureModal(false)}
              >
                Annuler
              </Button>
              <Button
                data-testid="fp-submit-signature-btn"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={submitSignature}
              >
                <Lock className="w-4 h-4 mr-1" /> Confirmer & Signer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
