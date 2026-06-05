/**
 * MomoDailyRecap — Récapitulatif des Momo envoyés sous forme de bulles mensuelles cliquables.
 *
 * Affiché dans le sous-menu Reversement.
 *   - Une bulle par mois (12 derniers mois par défaut) avec total Momo + compteur.
 *   - Clic sur une bulle → affiche le détail JOUR PAR JOUR avec tirets et totaux.
 *   - Clic sur un jour → expand inline avec la liste des Momo (numéro, destination, signataire).
 *
 * Source : GET /api/reversements/momo-daily?start_date&end_date
 */
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  addMonths,
  parseISO,
} from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Smartphone,
  Loader2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmtPrice = (p) => new Intl.NumberFormat("fr-FR").format(Math.round(p || 0));

const MomoDailyRecap = ({ currentUser, monthsToShow = 12 }) => {
  const [months, setMonths] = useState([]);          // [{ key:"2026-06", label:"juin 2026", total, count, days:[] }]
  const [loading, setLoading] = useState(false);
  const [openMonth, setOpenMonth] = useState(null);  // "YYYY-MM"
  const [openDay, setOpenDay] = useState(null);      // "YYYY-MM-DD"

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const requests = [];
      const meta = [];
      for (let i = 0; i < monthsToShow; i++) {
        const ref = subMonths(now, i);
        const start = format(startOfMonth(ref), "yyyy-MM-dd");
        const end = format(endOfMonth(ref), "yyyy-MM-dd");
        const key = start.slice(0, 7);
        const label = format(ref, "MMMM yyyy", { locale: fr });
        meta.push({ key, label, start, end });
        requests.push(
          axios.get(`${API}/reversements/momo-daily`, {
            params: { start_date: start, end_date: end },
          }).then((r) => r.data).catch(() => ({ days: [], grand_total_mobile: 0, days_count: 0 }))
        );
      }
      const results = await Promise.all(requests);
      const merged = meta.map((m, idx) => ({
        ...m,
        total: results[idx]?.grand_total_mobile || 0,
        count: results[idx]?.days_count || 0,
        days: results[idx]?.days || [],
      }));
      setMonths(merged);
      // Auto-open current month if it has data
      const currentKey = format(now, "yyyy-MM");
      const current = merged.find((m) => m.key === currentKey);
      if (current && current.total > 0) setOpenMonth(currentKey);
    } finally {
      setLoading(false);
    }
  }, [monthsToShow]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const grandTotal = months.reduce((s, m) => s + (m.total || 0), 0);
  const monthsWithData = months.filter((m) => m.total > 0);

  return (
    <Card
      className="bg-gradient-to-br from-pink-900/15 to-rose-900/10 border-pink-500/40"
      data-testid="momo-daily-recap"
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-pink-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span className="flex items-center gap-2 text-base">
            <Smartphone className="w-5 h-5 text-pink-300" />
            Momo envoyés — par mois
          </span>
          <div className="flex items-center gap-2 text-xs">
            <Badge className="bg-pink-500/20 text-pink-200 border border-pink-500/40">
              Total : {fmtPrice(grandTotal)} F
            </Badge>
            <Badge className="bg-slate-700/60 text-slate-200">
              {monthsWithData.length} mois actifs
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-400 text-sm">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Chargement des Momo…
          </div>
        ) : monthsWithData.length === 0 ? (
          <div className="text-center py-8 bg-slate-800/30 rounded-lg">
            <Smartphone className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <p className="text-slate-500 text-sm">Aucun Momo envoyé sur les 12 derniers mois.</p>
          </div>
        ) : (
          <>
            {/* Grid des bulles mensuelles */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {months.map((m) => {
                const isOpen = openMonth === m.key;
                const isEmpty = m.total === 0;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => {
                      if (isEmpty) return;
                      setOpenMonth(isOpen ? null : m.key);
                      setOpenDay(null);
                    }}
                    disabled={isEmpty}
                    className={`relative rounded-xl border px-3 py-2 text-left transition-all ${
                      isEmpty
                        ? "border-slate-800/60 bg-slate-900/30 opacity-50 cursor-not-allowed"
                        : isOpen
                          ? "border-pink-400 bg-pink-500/20 ring-2 ring-pink-400/40 scale-[1.02]"
                          : "border-pink-500/30 bg-pink-500/10 hover:bg-pink-500/15 hover:border-pink-400/60"
                    }`}
                    data-testid={`momo-bubble-${m.key}`}
                  >
                    <div className="text-[10px] uppercase tracking-wide text-slate-300 truncate">
                      {m.label}
                    </div>
                    <div className={`font-bold text-base mt-0.5 ${isEmpty ? "text-slate-600" : "text-pink-200"}`}>
                      {fmtPrice(m.total)} F
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {m.count > 0 ? `${m.count} jour${m.count > 1 ? "s" : ""}` : "—"}
                    </div>
                    {!isEmpty && (
                      <div className="absolute top-1.5 right-1.5">
                        {isOpen ? (
                          <ChevronDown className="w-3.5 h-3.5 text-pink-300" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-pink-400/70" />
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Détail du mois sélectionné */}
            {openMonth && (() => {
              const m = months.find((x) => x.key === openMonth);
              if (!m || m.days.length === 0) return null;
              return (
                <div
                  className="mt-4 bg-slate-900/40 border border-pink-500/30 rounded-lg overflow-hidden"
                  data-testid={`momo-month-detail-${openMonth}`}
                >
                  <div className="px-3 py-2 bg-pink-500/10 border-b border-pink-500/20 flex items-center justify-between">
                    <span className="text-pink-200 font-semibold text-sm capitalize">
                      Détail de {m.label}
                    </span>
                    <span className="text-pink-300 font-bold text-sm">
                      {fmtPrice(m.total)} F
                    </span>
                  </div>
                  <div className="divide-y divide-slate-700/40">
                    {m.days.map((day) => {
                      const dayOpen = openDay === day.date;
                      let dayLabel = day.date;
                      try {
                        dayLabel = format(parseISO(day.date), "EEEE dd MMM", { locale: fr });
                      } catch {}
                      return (
                        <div key={day.date}>
                          <button
                            type="button"
                            onClick={() => setOpenDay(dayOpen ? null : day.date)}
                            className="w-full text-left flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800/40 text-sm group"
                            data-testid={`momo-day-row-${day.date}`}
                          >
                            <span className="text-pink-400/70 group-hover:text-pink-300 select-none">—</span>
                            <span className="text-slate-200 flex-1 truncate capitalize">{dayLabel}</span>
                            <span className="text-[10px] text-slate-500">
                              {day.count} momo
                            </span>
                            <span className="text-pink-300 font-bold whitespace-nowrap">
                              {fmtPrice(day.total_mobile)} F
                            </span>
                            {dayOpen ? (
                              <ChevronDown className="w-3 h-3 text-slate-400" />
                            ) : (
                              <ChevronRight className="w-3 h-3 text-slate-500" />
                            )}
                          </button>

                          {/* Détail des Momo du jour */}
                          {dayOpen && (
                            <div className="px-3 py-2 bg-slate-900/60 border-t border-slate-700/30 space-y-1.5" data-testid={`momo-day-detail-${day.date}`}>
                              {day.items.map((mi, idx) => (
                                <div
                                  key={mi.id || idx}
                                  className="bg-slate-800/40 rounded p-2 text-xs grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-1.5"
                                >
                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Badge className="bg-pink-500/20 text-pink-200 text-[10px] uppercase">
                                        {mi.category}
                                      </Badge>
                                      {mi.momo_number ? (
                                        <span className="text-white font-mono">{mi.momo_number}</span>
                                      ) : (
                                        <span className="text-slate-500 italic">(n° non renseigné)</span>
                                      )}
                                      {mi.destination && (
                                        <span className="text-slate-400">→ {mi.destination}</span>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-slate-400 flex flex-wrap gap-x-3">
                                      {mi.signed_by && (
                                        <span>Signé par <strong className="text-slate-200">{mi.signed_by}</strong></span>
                                      )}
                                      {mi.status === "validated" && mi.validated_by ? (
                                        <span className="flex items-center gap-1 text-emerald-300">
                                          <CheckCircle2 className="w-3 h-3" /> Validé par {mi.validated_by}
                                        </span>
                                      ) : mi.status === "signed" ? (
                                        <span className="flex items-center gap-1 text-amber-300">
                                          <Clock className="w-3 h-3" /> En attente
                                        </span>
                                      ) : null}
                                    </div>
                                    {mi.notes && (
                                      <p className="text-[10px] text-slate-400 italic">{mi.notes}</p>
                                    )}
                                  </div>
                                  <div className="text-right">
                                    <span className="text-pink-300 font-bold">{fmtPrice(mi.mobile_amount)} F</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default MomoDailyRecap;
