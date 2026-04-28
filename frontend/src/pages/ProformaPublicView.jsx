import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { FileText, Phone, Mail, MapPin, Calendar, CheckCircle2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Public viewing page for a proforma invoice.
 * Accessible via QR code scan → shown on client's phone.
 */
const ProformaPublicView = () => {
  const { id } = useParams();
  const [proforma, setProforma] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/proforma-invoices/${id}`);
        if (!cancelled) setProforma(data.proforma || data);
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.detail || "Proforma introuvable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const formatPrice = (n) => (Math.round(n || 0)).toLocaleString("fr-FR");

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-slate-600">Chargement de la proforma…</div>
    </div>
  );
  if (error || !proforma) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white border rounded-lg p-6 text-center max-w-md">
        <FileText className="w-10 h-10 text-red-400 mx-auto mb-2" />
        <p className="text-slate-800 font-semibold">Proforma introuvable</p>
        <p className="text-slate-500 text-sm mt-1">{error || "Le lien est invalide ou expiré."}</p>
      </div>
    </div>
  );

  const applyTva = proforma.apply_tva !== false;
  const items = proforma.items || [];
  const hasRealItems = items.some(i => (i.unit_price || 0) > 0);
  const mode = proforma.payment_mode || "total";
  const pct = proforma.payment_percentage || 50;
  const acompte = Math.round((proforma.total || 0) * pct / 100);
  const solde = (proforma.total || 0) - acompte;

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4">
      <div className="max-w-2xl mx-auto bg-white shadow-lg rounded-lg overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div>
            <p className="text-slate-300 text-xs uppercase tracking-wider">Espace Maxo</p>
            <h1 className="text-xl font-bold mt-1">Facture Proforma</h1>
            <p className="text-slate-400 text-sm mt-0.5">{proforma.proforma_number}</p>
          </div>
          <Badge className="bg-blue-600 text-white">{proforma.status || "draft"}</Badge>
        </div>

        {/* Title objet */}
        {proforma.proforma_title && (
          <div className="bg-blue-50 border-l-4 border-blue-700 p-4">
            <p className="text-blue-700 text-xs uppercase tracking-wider font-medium">Objet de la réservation</p>
            <p className="text-slate-900 font-semibold text-base mt-0.5">{proforma.proforma_title}</p>
          </div>
        )}

        {/* Client */}
        <div className="p-5 border-b border-slate-200">
          <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Destinataire</p>
          <p className="text-slate-900 font-semibold">{proforma.client_name}</p>
          {proforma.client_phone && <p className="text-slate-600 text-sm flex items-center gap-1 mt-1"><Phone className="w-3 h-3" /> {proforma.client_phone}</p>}
          {proforma.client_email && <p className="text-slate-600 text-sm flex items-center gap-1"><Mail className="w-3 h-3" /> {proforma.client_email}</p>}
          {proforma.client_address && <p className="text-slate-600 text-sm flex items-center gap-1"><MapPin className="w-3 h-3" /> {proforma.client_address}</p>}
        </div>

        {/* Items */}
        <div className="p-5 border-b border-slate-200">
          <p className="text-slate-500 text-xs uppercase tracking-wider mb-3">Détails</p>
          <div className="space-y-2">
            {items.map((it, idx) => {
              const isLabel = it.is_label || !(it.unit_price > 0);
              if (isLabel) {
                return (
                  <div key={idx} className="bg-blue-50 border-l-4 border-blue-700 p-2 text-sm">
                    <span className="font-semibold text-blue-900">{it.name}</span>
                    {it.quantity > 0 && <span className="text-blue-700 ml-2">({it.quantity})</span>}
                  </div>
                );
              }
              return (
                <div key={idx} className="flex justify-between items-start gap-2 text-sm">
                  <div className="flex-1">
                    <p className="text-slate-800">{it.name}</p>
                    <p className="text-slate-500 text-xs">{it.quantity} × {formatPrice(it.unit_price)} F</p>
                  </div>
                  <span className="text-slate-900 font-semibold">{formatPrice(it.subtotal)} F</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Totals */}
        {hasRealItems && (
          <div className="p-5 border-b border-slate-200 space-y-1.5 text-sm">
            {proforma.discount > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Remise</span><span>-{formatPrice(proforma.discount)} F</span>
              </div>
            )}
            <div className="flex justify-between text-slate-700">
              <span>Montant HT</span>
              <span>{formatPrice((proforma.subtotal || 0) - (proforma.discount || 0))} F</span>
            </div>
            <div className="flex justify-between text-slate-700">
              <span>TVA (18%)</span>
              <span>{applyTva ? `${formatPrice(proforma.tax)} F` : (proforma.tva_exempt_mention === "non_applicable" ? "Non applicable" : "Exonéré")}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-300 text-lg font-bold text-blue-800 mt-2">
              <span>Total TTC</span>
              <span>{formatPrice(proforma.total)} F</span>
            </div>
          </div>
        )}

        {/* Conditions de réservation */}
        <div className="p-5 bg-slate-50 border-b border-slate-200">
          <p className="text-slate-700 font-semibold text-sm flex items-center gap-1 mb-2"><CheckCircle2 className="w-4 h-4 text-blue-700" /> Conditions de réservation</p>
          <ul className="text-slate-700 text-sm space-y-1.5">
            {mode === "percent" ? (
              <>
                <li>• <strong>Acompte de {pct}% ({formatPrice(acompte)} F CFA)</strong> à verser à la confirmation.</li>
                <li>• <strong>Solde de {formatPrice(solde)} F CFA</strong> à régler avant le début de l'événement.</li>
              </>
            ) : (
              <li>• <strong>Paiement intégral de {formatPrice(proforma.total)} F CFA</strong> à la confirmation, avant la tenue de l'événement.</li>
            )}
            <li>• Modes acceptés : espèces, virement bancaire, Mobile Money.</li>
            <li>• Proforma valable <strong>{proforma.validity_days || 30} jour(s)</strong>.</li>
            <li>• Annulation &lt; 48h avant l'événement : retenue de l'acompte.</li>
          </ul>
        </div>

        {/* Footer */}
        <div className="p-5 text-center text-slate-600 text-sm">
          <p>Espace Maxo · Fidjrossè, Cotonou</p>
          <p className="mt-1">Tél : +229 01 4147 0000 · RCCM RB/COT/22 B 32037</p>
          {proforma.created_at && (
            <p className="mt-2 text-xs text-slate-400 flex items-center justify-center gap-1">
              <Calendar className="w-3 h-3" /> Émise le {format(new Date(proforma.created_at), "dd MMMM yyyy", { locale: fr })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProformaPublicView;
