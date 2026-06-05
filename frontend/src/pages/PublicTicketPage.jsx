/**
 * PublicTicketPage — Page publique accessible via QR code imprimé sur le BON CLIENT.
 *
 * URL : /ticket/:id (où id est l'invoice.id)
 * Workflow :
 *  - Affiche le récap du ticket (articles, total, n° de bon)
 *  - Permet de laisser une note 1-5 étoiles + commentaire
 *  - Un seul avis par ticket
 *  - Aucune auth requise
 */
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Star, CheckCircle2, Loader2, Receipt, MapPin, Phone, AlertTriangle } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => Math.round(Number(n || 0)).toLocaleString("fr-FR");

const StarRating = ({ value, onChange, readOnly = false }) => {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1 justify-center" data-testid="ticket-star-rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = (hover || value) >= n;
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            onMouseEnter={() => !readOnly && setHover(n)}
            onMouseLeave={() => !readOnly && setHover(0)}
            onClick={() => !readOnly && onChange?.(n)}
            className={`transition-transform ${readOnly ? "cursor-default" : "hover:scale-110 cursor-pointer"}`}
            data-testid={`star-btn-${n}`}
            aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
          >
            <Star
              className={`w-9 h-9 sm:w-11 sm:h-11 ${
                filled ? "fill-amber-400 text-amber-400" : "text-slate-300"
              }`}
              strokeWidth={1.5}
            />
          </button>
        );
      })}
    </div>
  );
};

const RATING_LABELS = {
  1: "Très insatisfait",
  2: "Insatisfait",
  3: "Correct",
  4: "Satisfait",
  5: "Excellent !",
};

export default function PublicTicketPage() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [existingReview, setExistingReview] = useState(null);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [thanks, setThanks] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await axios.get(`${API}/public/ticket/${id}`, { timeout: 15000 });
        if (!mounted) return;
        setTicket(r.data.ticket);
        setAlreadyReviewed(!!r.data.review_submitted);
        setExistingReview(r.data.review);
      } catch (e) {
        if (!mounted) return;
        setError(e?.response?.data?.detail || "Ticket introuvable");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  const submit = async () => {
    if (rating < 1) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/public/ticket/${id}/review`, {
        rating,
        comment: comment.trim(),
        customer_name: name.trim(),
        customer_phone: phone.trim(),
      }, { timeout: 15000 });
      setThanks(true);
    } catch (e) {
      const msg = e?.response?.data?.detail || "Erreur lors de l'envoi";
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center px-4">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-amber-600 animate-spin mx-auto mb-3" />
          <p className="text-slate-700">Chargement du ticket…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center" data-testid="public-ticket-error">
          <AlertTriangle className="w-14 h-14 text-amber-500 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-slate-800 mb-2">Ticket introuvable</h1>
          <p className="text-slate-600 text-sm">{error}</p>
          <p className="text-slate-400 text-xs mt-4">
            Si vous pensez qu'il s'agit d'une erreur, contactez la caisse de l'Espace Maxo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 py-6 px-3 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* En-tête */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 rounded-2xl shadow-lg p-5 text-white" data-testid="public-ticket-header">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-amber-100">Espace Maxo</p>
              <h1 className="text-xl font-bold">Restaurant & Jeux VR</h1>
            </div>
          </div>
          <p className="text-sm text-amber-50 mt-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Merci pour votre visite — voici votre ticket
          </p>
        </div>

        {/* Ticket */}
        <div className="bg-white rounded-2xl shadow-lg p-5" data-testid="public-ticket-body">
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3 pb-3 border-b border-slate-200">
            <div>
              {ticket?.bon_number && (
                <p className="text-2xl font-extrabold text-amber-600 leading-tight" data-testid="ticket-bon-number">
                  {ticket.bon_number}
                </p>
              )}
              <p className="text-xs text-slate-500 mt-0.5">N° {ticket?.invoice_number}</p>
            </div>
            <div className="text-right">
              {ticket?.table_number != null && (
                <p className="text-sm text-slate-600">Table <b className="text-slate-800">{ticket.table_number}</b></p>
              )}
              <p className="text-xs text-slate-400 mt-0.5">
                {ticket?.created_at ? new Date(ticket.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : ""}
              </p>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs">
                <th className="text-left pb-1.5">Article</th>
                <th className="text-center pb-1.5">Qté</th>
                <th className="text-right pb-1.5">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(ticket?.items || []).map((it, i) => (
                <tr key={i}>
                  <td className="py-1.5 text-slate-800">{it.name}</td>
                  <td className="text-center text-slate-600">{it.quantity}</td>
                  <td className="text-right text-slate-700 font-mono">{fmt(it.price * it.quantity)} F</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t border-dashed border-slate-300 mt-3 pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Sous-total</span>
              <span className="font-mono">{fmt(ticket?.subtotal)} F</span>
            </div>
            {Number(ticket?.discount_amount || 0) > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Remise ({ticket?.discount}%)</span>
                <span className="font-mono">- {fmt(ticket?.discount_amount)} F</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-slate-900 pt-2 border-t border-slate-200">
              <span>Total</span>
              <span className="font-mono text-amber-600" data-testid="ticket-total">{fmt(ticket?.total)} F</span>
            </div>
          </div>
        </div>

        {/* Avis */}
        {thanks ? (
          <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl shadow-lg p-6 text-center" data-testid="review-thanks">
            <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-emerald-800 mb-1">Merci pour votre retour !</h2>
            <p className="text-sm text-emerald-700">Votre avis nous aide à nous améliorer chaque jour.</p>
            <p className="text-xs text-emerald-600 mt-3">Au plaisir de vous revoir à l'Espace Maxo 💛</p>
          </div>
        ) : alreadyReviewed ? (
          <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl shadow-lg p-6 text-center" data-testid="review-already-submitted">
            <CheckCircle2 className="w-12 h-12 text-slate-400 mx-auto mb-2" />
            <h2 className="text-lg font-bold text-slate-700 mb-2">Avis déjà déposé</h2>
            {existingReview && (
              <div className="bg-white rounded-xl p-3 mb-2">
                <StarRating value={existingReview.rating} readOnly />
                {existingReview.comment && (
                  <p className="text-sm text-slate-600 italic mt-2">"{existingReview.comment}"</p>
                )}
              </div>
            )}
            <p className="text-xs text-slate-500">Merci pour votre retour précédent.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg p-5 space-y-4" data-testid="review-form">
            <div className="text-center">
              <h2 className="text-lg font-bold text-slate-800">Comment s'est passée votre visite ?</h2>
              <p className="text-xs text-slate-500 mt-0.5">Notez votre expérience en un clic</p>
            </div>

            <div className="space-y-2">
              <StarRating value={rating} onChange={setRating} />
              <p className="text-center text-sm font-medium text-amber-600 min-h-[20px]">
                {rating > 0 ? RATING_LABELS[rating] : "Touchez les étoiles pour noter"}
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-slate-600">Votre prénom (optionnel)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex : Marie"
                maxLength={120}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                data-testid="review-name-input"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-slate-600">Téléphone (optionnel — pour vous rappeler en cas de gain)</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+229 ..."
                maxLength={40}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                data-testid="review-phone-input"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-slate-600">Un commentaire ? (optionnel)</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Ce que vous avez aimé, ce qu'on pourrait améliorer…"
                maxLength={1000}
                rows={4}
                style={{ color: "#0f172a", backgroundColor: "#ffffff", fontSize: "16px", lineHeight: 1.45 }}
                className="w-full px-3 py-2 text-base border-2 border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 resize-none placeholder:text-slate-400"
                data-testid="review-comment-input"
              />
              <p className="text-[10px] text-slate-400 text-right">{comment.length} / 1000</p>
            </div>

            <button
              onClick={submit}
              disabled={rating < 1 || submitting}
              className={`w-full py-3 rounded-xl font-bold text-white text-sm transition-all ${
                rating < 1 || submitting
                  ? "bg-slate-300 cursor-not-allowed"
                  : "bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-md hover:shadow-lg"
              }`}
              data-testid="review-submit-btn"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Envoi…
                </span>
              ) : (
                "Envoyer mon avis"
              )}
            </button>
          </div>
        )}

        {/* Footer contact */}
        <div className="bg-white/60 backdrop-blur rounded-2xl p-4 text-center text-xs text-slate-600 space-y-1">
          <p className="flex items-center justify-center gap-2"><Phone className="w-3.5 h-3.5" /> +229 01 4147 0000</p>
          <p className="flex items-center justify-center gap-2"><MapPin className="w-3.5 h-3.5" /> Espace Maxo · Restaurant & Jeux VR</p>
          <p className="text-slate-400 mt-2">Document personnel — ne pas partager ce lien</p>
        </div>
      </div>
    </div>
  );
}
