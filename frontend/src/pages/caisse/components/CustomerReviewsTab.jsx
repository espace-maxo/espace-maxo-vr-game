/**
 * CustomerReviewsTab — Onglet "Avis des Clients" pour l'admin.
 *
 * Affiche tous les avis laissés par les clients via le QR code du BON CLIENT.
 *
 * Source backend :
 *   - GET  /api/public/reviews?only_unread=&min_rating=&max_rating=
 *   - POST /api/public/reviews/{id}/read
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Star,
  Star as StarOutline,
  MessageSquare,
  RefreshCw,
  Loader2,
  CheckCircle,
  Filter as FilterIcon,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const StarRow = ({ rating, size = "w-4 h-4" }) => (
  <div className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((n) => (
      <Star
        key={n}
        className={`${size} ${
          n <= (rating || 0)
            ? "text-amber-400 fill-amber-400"
            : "text-slate-600"
        }`}
      />
    ))}
  </div>
);

const RATING_TONE = {
  5: { bg: "from-emerald-900/30 to-green-900/20", border: "border-emerald-500/40", chip: "bg-emerald-500/20 text-emerald-200", label: "Très satisfait" },
  4: { bg: "from-green-900/30 to-emerald-900/20", border: "border-green-500/40", chip: "bg-green-500/20 text-green-200", label: "Satisfait" },
  3: { bg: "from-yellow-900/30 to-amber-900/20", border: "border-yellow-500/40", chip: "bg-yellow-500/20 text-yellow-200", label: "Neutre" },
  2: { bg: "from-orange-900/30 to-amber-900/20", border: "border-orange-500/40", chip: "bg-orange-500/20 text-orange-200", label: "Peu satisfait" },
  1: { bg: "from-rose-900/30 to-red-900/20", border: "border-rose-500/40", chip: "bg-rose-500/20 text-rose-200", label: "Insatisfait" },
};

const CustomerReviewsTab = ({ currentUser }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all"); // all | unread | positive (4-5) | negative (1-3)
  const [marking, setMarking] = useState(null);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter === "unread") params.only_unread = true;
      else if (filter === "positive") params.min_rating = 4;
      else if (filter === "negative") params.max_rating = 3;
      const r = await axios.get(`${API}/public/reviews`, { params });
      setData(r.data);
    } catch (e) {
      toast.error("Erreur chargement des avis");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const markAsRead = async (id) => {
    setMarking(id);
    try {
      await axios.post(`${API}/public/reviews/${id}/read`);
      fetchReviews();
    } catch (e) {
      toast.error("Erreur lors du marquage");
    } finally {
      setMarking(null);
    }
  };

  // Stats répartition par note
  const distribution = useMemo(() => {
    const items = data?.items || [];
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    items.forEach((r) => {
      if (r.rating >= 1 && r.rating <= 5) dist[r.rating]++;
    });
    return dist;
  }, [data]);

  const items = data?.items || [];

  return (
    <div className="space-y-4" data-testid="customer-reviews-tab">
      {/* KPI Card */}
      <Card className="bg-gradient-to-br from-amber-900/15 to-orange-900/10 border-amber-500/30">
        <CardContent className="py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <p className="text-[10px] uppercase text-slate-400 tracking-wide">Total avis</p>
              <p className="text-2xl font-bold text-white">{data?.total ?? 0}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-400 tracking-wide">Non lus</p>
              <p className={`text-2xl font-bold ${data?.unread ? "text-rose-300" : "text-slate-400"}`}>
                {data?.unread ?? 0}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-400 tracking-wide">Note moyenne</p>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold text-amber-300">
                  {data?.average_rating ?? "—"}
                </p>
                {data?.average_rating && <StarRow rating={Math.round(data.average_rating)} size="w-3.5 h-3.5" />}
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-400 tracking-wide">Répartition</p>
              <div className="flex items-center gap-0.5 mt-1">
                {[5, 4, 3, 2, 1].map((n) => (
                  <div
                    key={n}
                    className="flex flex-col items-center"
                    title={`${distribution[n]} avis à ${n} étoile${n > 1 ? "s" : ""}`}
                  >
                    <span className="text-[10px] text-amber-300">{n}★</span>
                    <span className="text-[10px] text-slate-300">{distribution[n]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterIcon className="w-4 h-4 text-slate-400" />
        {[
          { key: "all", label: "Tous" },
          { key: "unread", label: "Non lus" },
          { key: "positive", label: "Positifs (4-5★)", icon: ThumbsUp },
          { key: "negative", label: "Négatifs (1-3★)", icon: ThumbsDown },
        ].map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? "default" : "outline"}
            onClick={() => setFilter(f.key)}
            className={
              filter === f.key
                ? "bg-amber-600 hover:bg-amber-700 text-white"
                : "border-slate-600 text-slate-300"
            }
            data-testid={`reviews-filter-${f.key}`}
          >
            {f.icon ? <f.icon className="w-3.5 h-3.5 mr-1" /> : null}
            {f.label}
          </Button>
        ))}
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          onClick={fetchReviews}
          disabled={loading}
          className="border-slate-600 text-slate-300"
          data-testid="reviews-refresh"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Actualiser
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-center text-slate-500 py-10">Chargement…</p>
      ) : items.length === 0 ? (
        <Card className="bg-slate-800/30 border-slate-700">
          <CardContent className="py-12 text-center">
            <MessageSquare className="w-12 h-12 mx-auto text-slate-600 mb-3" />
            <p className="text-slate-400">Aucun avis pour ce filtre.</p>
            <p className="text-slate-600 text-xs mt-2">
              Les clients laissent un avis en scannant le QR code imprimé sur leur BON CLIENT.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((r) => {
            const tone = RATING_TONE[r.rating] || RATING_TONE[3];
            return (
              <Card
                key={r.id}
                className={`bg-gradient-to-br ${tone.bg} ${tone.border} ${!r.is_read ? "ring-1 ring-amber-400/40" : ""}`}
                data-testid={`review-card-${r.id}`}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-white flex items-center justify-between gap-2 text-base flex-wrap">
                    <span className="flex items-center gap-2 flex-wrap">
                      <StarRow rating={r.rating} />
                      <Badge className={`${tone.chip} text-[10px]`}>
                        {tone.label}
                      </Badge>
                      {!r.is_read && (
                        <Badge className="bg-amber-500/30 text-amber-200 text-[10px] animate-pulse">
                          Nouveau
                        </Badge>
                      )}
                      {r.invoice_number && (
                        <span className="text-slate-400 text-xs font-normal">
                          Facture {r.invoice_number}
                        </span>
                      )}
                    </span>
                    <span className="text-slate-300 text-xs font-normal">
                      {r.created_at && (() => {
                        try { return format(parseISO(r.created_at), "dd MMM yyyy · HH:mm", { locale: fr }); }
                        catch { return r.created_at; }
                      })()}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {r.comment ? (
                    <p className="text-slate-100 text-sm italic bg-slate-900/40 p-3 rounded-lg border border-slate-700/40">
                      «&nbsp;{r.comment}&nbsp;»
                    </p>
                  ) : (
                    <p className="text-slate-500 text-xs italic">— Aucun commentaire —</p>
                  )}
                  <div className="flex items-center justify-between gap-2 mt-2 text-[11px] text-slate-400 flex-wrap">
                    <div className="flex flex-wrap gap-x-3">
                      {r.customer_name && <span>Client : <strong className="text-slate-200">{r.customer_name}</strong></span>}
                      {r.table_label && <span>Table : <strong className="text-slate-200">{r.table_label}</strong></span>}
                      {r.served_by && <span>Servi par : <strong className="text-slate-200">{r.served_by}</strong></span>}
                    </div>
                    {!r.is_read && (
                      <Button
                        size="sm"
                        onClick={() => markAsRead(r.id)}
                        disabled={marking === r.id}
                        variant="outline"
                        className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 h-7"
                        data-testid={`review-mark-read-${r.id}`}
                      >
                        {marking === r.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <><CheckCircle className="w-3 h-3 mr-1" /> Marquer lu</>
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CustomerReviewsTab;
