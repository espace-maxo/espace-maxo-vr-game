/**
 * ReceiptScanModal — Modal pour scanner un ticket/reçu via IA (Gemini).
 *
 * Workflow :
 *   1. L'utilisateur sélectionne une image (upload OU webcam)
 *   2. POST /api/receipt-scan/extract  → IA extrait fournisseur + items + total
 *   3. Côté backend : crée AUTOMATIQUEMENT une demande d'achat (status=pending)
 *   4. Toast de succès → ferme le modal → la liste se rafraîchit
 */
import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, Upload, ScanLine, X as XIcon, Loader2, CheckCircle2, RefreshCw } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND}/api`;
const fmt = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n || 0));

const ReceiptScanModal = ({ open, onClose, onCreated, currentUser }) => {
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [mode, setMode] = useState("upload"); // 'upload' | 'camera'
  const [receiptType, setReceiptType] = useState("auto"); // 'auto' | 'printed' | 'handwritten'
  const [imageData, setImageData] = useState(null); // dataURL
  const [busy, setBusy] = useState(false);
  const [streamActive, setStreamActive] = useState(false);
  const [extractResult, setExtractResult] = useState(null);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setImageData(null);
      setExtractResult(null);
      setMode("upload");
    }
  }, [open]);

  const stopCamera = () => {
    const v = videoRef.current;
    if (v && v.srcObject) {
      v.srcObject.getTracks().forEach((t) => t.stop());
      v.srcObject = null;
    }
    setStreamActive(false);
  };

  const startCamera = async () => {
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStreamActive(true);
      }
    } catch (e) {
      toast.error("Impossible d'accéder à la caméra : " + e.message);
    }
  };

  const captureFromCamera = () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    ctx.drawImage(v, 0, 0);
    const dataUrl = c.toDataURL("image/jpeg", 0.85);
    setImageData(dataUrl);
    stopCamera();
  };

  const onFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      toast.error("Image trop volumineuse (max 12 Mo)");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setImageData(ev.target.result);
    reader.readAsDataURL(file);
  };

  const submitScan = async () => {
    if (!imageData) {
      toast.error("Sélectionnez ou capturez une image");
      return;
    }
    setBusy(true);
    setExtractResult(null);
    try {
      const r = await axios.post(`${API}/receipt-scan/extract`, {
        image_base64: imageData,
        mime_type: "image/jpeg",
        auto_create_expense: true,
        receipt_type: receiptType,
        requested_by: currentUser?.full_name || currentUser?.username || "Gérante",
        requested_by_role: currentUser?.role || "manager",
      }, { timeout: 120000 });

      const extracted = r.data?.extracted || {};
      setExtractResult({ ...extracted, expense_id: r.data?.expense_id });

      const itemsCount = (extracted.items || []).length;
      if (r.data?.expense_id && itemsCount > 0) {
        toast.success(`✓ Ticket scanné · ${itemsCount} articles · ${fmt(extracted.total)} F · Demande d'achat créée`, {
          duration: 6000,
        });
        if (onCreated) onCreated(r.data.expense_id);
      } else {
        toast.warning("Scan effectué mais peu de données extraites. Vérifiez la qualité de l'image.");
      }
    } catch (e) {
      console.error("scan failed", e);
      toast.error(e?.response?.data?.detail || "Erreur lors du scan");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="bg-slate-900 border-amber-500/40 w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="receipt-scan-modal">
        <CardHeader className="pb-2 border-b border-slate-700 sticky top-0 bg-slate-900 z-10">
          <CardTitle className="text-white text-base flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <ScanLine className="w-5 h-5 text-amber-400" />
              Scanner un ticket / reçu d'achat
              <Badge className="bg-amber-500/20 text-amber-200 text-[10px]">IA Gemini</Badge>
            </span>
            <Button size="sm" variant="ghost" onClick={onClose} className="text-slate-300 h-7 w-7 p-0">
              <XIcon className="w-4 h-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-3">
          {!extractResult && (
            <>
              {/* Sélecteur Type de reçu */}
              <div>
                <p className="text-slate-300 text-xs uppercase tracking-wider mb-1.5">Type de reçu</p>
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { v: "auto", label: "🔍 Détection auto", desc: "Imprimé ou manuscrit" },
                    { v: "printed", label: "🖨️ Imprimé", desc: "Ticket de caisse, facture" },
                    { v: "handwritten", label: "✍️ Manuscrit", desc: "Reçu/cahier écrit à la main" },
                  ].map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setReceiptType(opt.v)}
                      title={opt.desc}
                      className={`text-[11px] px-3 py-1.5 rounded-full font-medium transition ${
                        receiptType === opt.v
                          ? "bg-amber-500 text-slate-900"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
                      }`}
                      data-testid={`scan-type-${opt.v}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {receiptType === "handwritten" && (
                  <p className="text-amber-300 text-[11px] mt-1.5 bg-amber-900/15 border border-amber-500/20 rounded px-2 py-1">
                    ✍️ Mode manuscrit activé : l'IA corrige les fautes d'orthographe et gère les prix barrés.
                  </p>
                )}
              </div>

              {/* Mode switcher */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={mode === "upload" ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setMode("upload"); stopCamera(); }}
                  className={mode === "upload" ? "bg-amber-600 hover:bg-amber-700" : "border-slate-700 text-slate-300"}
                  data-testid="scan-mode-upload"
                >
                  <Upload className="w-4 h-4 mr-1" /> Importer
                </Button>
                <Button
                  type="button"
                  variant={mode === "camera" ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setMode("camera"); setImageData(null); }}
                  className={mode === "camera" ? "bg-amber-600 hover:bg-amber-700" : "border-slate-700 text-slate-300"}
                  data-testid="scan-mode-camera"
                >
                  <Camera className="w-4 h-4 mr-1" /> Caméra
                </Button>
              </div>

              {/* Upload mode */}
              {mode === "upload" && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={onFileChange}
                    className="hidden"
                    data-testid="scan-file-input"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-amber-500/40 rounded-lg p-8 text-center hover:bg-amber-500/5 transition"
                    data-testid="scan-upload-zone"
                  >
                    <Upload className="w-10 h-10 mx-auto mb-2 text-amber-400" />
                    <p className="text-amber-200 font-semibold">Cliquez ici pour sélectionner une image</p>
                    <p className="text-slate-400 text-xs mt-1">JPG, PNG ou WEBP — max 12 Mo</p>
                  </button>
                </div>
              )}

              {/* Camera mode */}
              {mode === "camera" && (
                <div>
                  {!streamActive ? (
                    <Button onClick={startCamera} className="w-full bg-amber-600 hover:bg-amber-700" data-testid="scan-camera-start">
                      <Camera className="w-4 h-4 mr-2" /> Activer la caméra
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <video ref={videoRef} autoPlay playsInline className="w-full rounded border border-slate-700" />
                      <Button onClick={captureFromCamera} className="w-full bg-emerald-600 hover:bg-emerald-700" data-testid="scan-camera-capture">
                        <Camera className="w-4 h-4 mr-2" /> Capturer
                      </Button>
                    </div>
                  )}
                  <canvas ref={canvasRef} className="hidden" />
                </div>
              )}

              {/* Preview */}
              {imageData && (
                <div className="space-y-2">
                  <p className="text-slate-300 text-sm">Aperçu :</p>
                  <img src={imageData} alt="Ticket" className="w-full max-h-72 object-contain border border-slate-700 rounded bg-black/30" />
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setImageData(null)} className="border-slate-700 text-slate-300">
                      <RefreshCw className="w-3.5 h-3.5 mr-1" /> Changer
                    </Button>
                    <Button onClick={submitScan} disabled={busy} className="bg-amber-600 hover:bg-amber-700" data-testid="scan-submit">
                      {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ScanLine className="w-4 h-4 mr-1" />}
                      {busy ? "Analyse en cours..." : "Analyser le ticket"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Extraction result */}
          {extractResult && (
            <div className="space-y-3" data-testid="scan-result">
              <div className="bg-emerald-900/30 border border-emerald-500/40 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span className="text-emerald-300 font-bold">Ticket scanné</span>
                  <Badge className={
                    extractResult.confidence === "high" ? "bg-emerald-500/30 text-emerald-200 text-[10px]" :
                    extractResult.confidence === "low" ? "bg-rose-500/30 text-rose-200 text-[10px]" :
                    "bg-amber-500/30 text-amber-200 text-[10px]"
                  }>
                    Confiance : {extractResult.confidence}
                  </Badge>
                </div>
                <div className="text-sm text-white space-y-1">
                  <div><strong>Fournisseur :</strong> {extractResult.supplier}</div>
                  <div><strong>Total extrait :</strong> {fmt(extractResult.total)} F CFA</div>
                  <div><strong>Articles :</strong> {(extractResult.items || []).length}</div>
                </div>
              </div>

              <div className="bg-slate-800/50 rounded p-2 max-h-56 overflow-y-auto">
                <p className="text-slate-400 text-[10px] uppercase mb-1">Articles extraits</p>
                {(extractResult.items || []).map((it, idx) => (
                  <div key={idx} className="flex justify-between text-sm py-1 border-b border-slate-700/50 last:border-0">
                    <span className="text-white truncate flex-1">{it.description}</span>
                    <span className="text-slate-400 mx-2">{fmt(it.quantity)} × {fmt(it.unit_price)}</span>
                    <span className="text-amber-300 font-semibold">{fmt(it.amount)} F</span>
                  </div>
                ))}
                {(extractResult.items || []).length === 0 && (
                  <p className="text-slate-500 text-center py-4">Aucun article détecté</p>
                )}
              </div>

              {extractResult.expense_id ? (
                <div className="bg-emerald-900/20 border border-emerald-500/30 rounded p-2 text-sm text-emerald-300 text-center">
                  ✓ Demande d'achat créée automatiquement (statut <strong>en attente</strong>) — visible dans Achats
                </div>
              ) : (
                <div className="bg-rose-900/20 border border-rose-500/30 rounded p-2 text-sm text-rose-300 text-center">
                  ⚠ Demande d'achat non créée — données insuffisantes
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setImageData(null); setExtractResult(null); }} className="border-slate-700 text-slate-300">
                  Scanner un autre ticket
                </Button>
                <Button onClick={onClose} className="bg-amber-600 hover:bg-amber-700">
                  Fermer
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReceiptScanModal;
