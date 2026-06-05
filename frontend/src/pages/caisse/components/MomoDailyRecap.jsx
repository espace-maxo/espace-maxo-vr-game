/**
 * MomoDailyRecap — Récapitulatif des Momo envoyés jour par jour
 *
 * Affiché dans le sous-menu Reversement. Liste pour chaque date :
 *   - Tous les reversements ayant un montant Momo > 0
 *   - Pour chaque ligne : numéro Momo, destination, signataire, statut
 *   - Total cumulé par jour + grand total période
 *
 * Source : GET /api/reversements/momo-daily?start_date&end_date
 */
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Smartphone, RefreshCw, Loader2, CalendarDays, CheckCircle2, Clock } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const formatPrice = (p) => new Intl.NumberFormat("fr-FR").format(Math.round(p || 0));

const MomoDailyRecap = ({ currentUser }) => {
  const today = new Date();
  const [start, setStart] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [end, setEnd] = useState(format(endOfMonth(today), "yyyy-MM-dd"));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/reversements/momo-daily`, {
        params: { start_date: start, end_date: end },
      });
      setData(r.data);
    } catch (e) {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formatDate = (s) => {
    try { return format(parseISO(s), "EEE dd MMM yyyy", { locale: fr }); }
    catch { return s; }
  };

  const grandTotal = data?.grand_total_mobile || 0;
  const daysCount = data?.days_count || 0;

  return (
    <Card className="bg-gradient-to-br from-pink-900/15 to-rose-900/10 border-pink-500/40" data-testid="momo-daily-recap">
      <CardHeader className="pb-2">
        <CardTitle className="text-pink-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span className="flex items-center gap-2 text-base">
            <Smartphone className="w-5 h-5 text-pink-300" />
            Momo envoyés — jour par jour
          </span>
          <div className="flex items-center gap-2 text-xs">
            <Badge className="bg-pink-500/20 text-pink-200 border border-pink-500/40">
              Total : {formatPrice(grandTotal)} F
            </Badge>
            <Badge className="bg-slate-700/60 text-slate-200">
              {daysCount} jour{daysCount > 1 ? "s" : ""}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Date range picker */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[140px]">
            <Label className="text-[10px] uppercase text-slate-400">Du</Label>
            <Input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white h-8 text-xs"
              data-testid="momo-recap-start"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <Label className="text-[10px] uppercase text-slate-400">Au</Label>
            <Input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white h-8 text-xs"
              data-testid="momo-recap-end"
            />
          </div>
          <Button
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="bg-pink-600 hover:bg-pink-700 h-8"
            data-testid="momo-recap-refresh"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
            Actualiser
          </Button>
        </div>

        {/* Listing groupé par jour */}
        {loading ? (
          <p className="text-slate-500 text-sm text-center py-6">Chargement…</p>
        ) : !data || data.days?.length === 0 ? (
          <div className="bg-slate-800/30 rounded-lg p-6 text-center">
            <Smartphone className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <p className="text-slate-500 text-sm">Aucun Momo envoyé sur cette période.</p>
            <p className="text-slate-600 text-[11px] mt-1">
              Les Momo apparaîtront ici dès qu'un reversement Mobile Money sera enregistré.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.days.map((day) => (
              <div
                key={day.date}
                className="bg-slate-800/40 border border-slate-700/50 rounded-lg overflow-hidden"
                data-testid={`momo-day-${day.date}`}
              >
                <div className="flex items-center justify-between px-3 py-2 bg-slate-800/60 border-b border-slate-700/50">
                  <span className="text-slate-200 text-sm font-semibold flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-pink-300" />
                    {formatDate(day.date)}
                  </span>
                  <span className="text-pink-300 font-bold text-sm">
                    {formatPrice(day.total_mobile)} F
                  </span>
                </div>

                <div className="divide-y divide-slate-700/40">
                  {day.items.map((m, idx) => (
                    <div
                      key={m.id || idx}
                      className="px-3 py-2 text-xs grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-1.5 hover:bg-slate-800/30"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className="bg-pink-500/20 text-pink-200 text-[10px] uppercase">
                            {m.category}
                          </Badge>
                          {m.momo_number && (
                            <span className="text-white font-mono">
                              {m.momo_number}
                            </span>
                          )}
                          {!m.momo_number && (
                            <span className="text-slate-500 italic">(numéro non renseigné)</span>
                          )}
                          {m.destination && (
                            <span className="text-slate-400">→ {m.destination}</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 flex flex-wrap gap-x-3">
                          {m.signed_by && <span>Signé par <strong className="text-slate-200">{m.signed_by}</strong></span>}
                          {m.status === "validated" && m.validated_by ? (
                            <span className="flex items-center gap-1 text-emerald-300">
                              <CheckCircle2 className="w-3 h-3" /> Validé par {m.validated_by}
                            </span>
                          ) : m.status === "signed" ? (
                            <span className="flex items-center gap-1 text-amber-300">
                              <Clock className="w-3 h-3" /> En attente de validation
                            </span>
                          ) : null}
                        </div>
                        {m.notes && (
                          <p className="text-[10px] text-slate-400 italic mt-0.5">
                            {m.notes}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-pink-300 font-bold">
                          {formatPrice(m.mobile_amount)} F
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MomoDailyRecap;
