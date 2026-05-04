/**
 * LocationCalendarTab — Vue de disponibilité des espaces.
 *
 * Regroupe sur un même calendrier (jour/mois) :
 *   - les RÉSERVATIONS confirmées (collection `locations`)
 *   - les DEMANDES de PROFORMA (collection `proforma_invoices`)
 *
 * But : en un coup d'œil, voir si une date est libre ou déjà sollicitée
 * (réservée OU en attente de validation client).
 */
import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Calendar, ChevronLeft, ChevronRight, RefreshCw, Building2,
  FileText, Clock, Users, Eye, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO, isValid } from "date-fns";
import { fr } from "date-fns/locale";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SPACE_LABELS = {
  salle_fete: "Salle de Fête",
  espace_jardin: "Espace Jardin",
  salle_jeux: "Salle de Jeux",
};

const SPACE_COLORS = {
  salle_fete: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  espace_jardin: "bg-green-500/20 text-green-300 border-green-500/40",
  salle_jeux: "bg-blue-500/20 text-blue-300 border-blue-500/40",
};

const PROFORMA_STATUS_META = {
  draft: { label: "Brouillon", color: "bg-slate-500/20 text-slate-300" },
  sent: { label: "Envoyée", color: "bg-amber-500/20 text-amber-300" },
  accepted: { label: "Acceptée", color: "bg-emerald-500/20 text-emerald-300" },
  converted: { label: "Convertie", color: "bg-blue-500/20 text-blue-300" },
  rejected: { label: "Refusée", color: "bg-rose-500/20 text-rose-300" },
};

// Essaie d'extraire une date d'événement depuis le titre, les notes ou les items
// d'un proforma. Retourne une string YYYY-MM-DD ou null.
const extractEventDateFromProforma = (p) => {
  const blobs = [
    p.proforma_title || "",
    p.notes || "",
    ...(p.items || []).map((i) => `${i.name || ""} ${i.description || ""}`),
  ].join(" ");
  // Motifs : JJ/MM/AAAA, JJ-MM-AAAA, AAAA-MM-JJ
  const m1 = blobs.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
  const m2 = blobs.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
  return null;
};

// Détermine si un proforma est très probablement lié à une location d'espace.
const isLocationRelated = (p) => {
  const txt = [
    p.proforma_title || "",
    p.notes || "",
    ...(p.items || []).map((i) => `${i.name || ""} ${i.description || ""}`),
  ].join(" ").toLowerCase();
  return /(location|reservation|réservation|salle|jardin|espace|jeu|fête|fete|événement|evenement|mariage|anniversaire|bapt|pack)/i.test(txt);
};

const LocationCalendarTab = ({ formatPrice }) => {
  const [loading, setLoading] = useState(false);
  const [locations, setLocations] = useState([]);
  const [proformas, setProformas] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [filter, setFilter] = useState("all"); // all | reservations | proformas
  const [onlyLocationProformas, setOnlyLocationProformas] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [locRes, proRes] = await Promise.all([
        axios.get(`${API}/locations`),
        axios.get(`${API}/proforma-invoices`),
      ]);
      setLocations(locRes.data.locations || []);
      setProformas(proRes.data.proformas || []);
    } catch (e) {
      console.error("Calendar fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // ============ Événements calendaires ============
  const events = useMemo(() => {
    const rows = [];

    if (filter === "all" || filter === "reservations") {
      for (const loc of locations) {
        if (loc.status === "cancelled") continue;
        const d = loc.reservation_date;
        if (!d) continue;
        rows.push({
          id: `loc-${loc.id}`,
          kind: "reservation",
          date: d,
          status: loc.status,
          customer_name: loc.customer_name,
          phone: loc.customer_phone,
          guests: loc.number_of_guests,
          event_type: loc.event_type,
          start_time: loc.start_time,
          end_time: loc.end_time,
          spaces: (loc.space_type || "").split("+").filter(Boolean),
          amount: loc.rental_amount,
          raw: loc,
        });
      }
    }

    if (filter === "all" || filter === "proformas") {
      for (const p of proformas) {
        if (p.status === "rejected") continue;
        if (onlyLocationProformas && !isLocationRelated(p)) continue;
        // Priorité : date trouvée dans le titre/notes, sinon created_at.
        const extracted = extractEventDateFromProforma(p);
        const date = extracted || (p.created_at ? String(p.created_at).slice(0, 10) : null);
        if (!date) continue;
        rows.push({
          id: `pro-${p.id}`,
          kind: "proforma",
          date,
          date_is_event: !!extracted,   // true = date réelle extraite ; false = juste date de demande
          status: p.status,
          customer_name: p.client_name,
          phone: p.client_phone,
          title: p.proforma_title || "—",
          amount: p.total,
          proforma_number: p.proforma_number,
          raw: p,
        });
      }
    }

    // Sort desc (plus récents / futurs d'abord)
    rows.sort((a, b) => (a.date < b.date ? 1 : -1));
    return rows;
  }, [locations, proformas, filter, onlyLocationProformas]);

  // Group by ISO date
  const eventsByDate = useMemo(() => {
    const m = new Map();
    for (const ev of events) {
      const k = ev.date;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(ev);
    }
    return m;
  }, [events]);

  // Days of current month
  const daysOfMonth = useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(currentMonth),
      end: endOfMonth(currentMonth),
    });
  }, [currentMonth]);

  // Status counts
  const stats = useMemo(() => {
    const reservationDates = new Set();
    const proformaDates = new Set();
    let conflicts = 0;
    for (const [date, evs] of eventsByDate.entries()) {
      const r = evs.some((e) => e.kind === "reservation");
      const p = evs.some((e) => e.kind === "proforma" && e.date_is_event);
      if (r) reservationDates.add(date);
      if (p) proformaDates.add(date);
      if (r && p) conflicts += 1;
    }
    return {
      reservations: reservationDates.size,
      proformas: proformaDates.size,
      conflicts,
      total_events: events.length,
    };
  }, [eventsByDate, events]);

  const selectedEvents = selectedDate
    ? (eventsByDate.get(format(selectedDate, "yyyy-MM-dd")) || [])
    : events.slice(0, 30);

  return (
    <div className="space-y-4" data-testid="location-calendar-tab">
      {/* Header + stats */}
      <Card className="bg-gradient-to-br from-purple-900/30 to-slate-900/60 border-purple-500/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-purple-300 text-lg">
            <Calendar className="w-5 h-5" />
            Calendrier de disponibilité · Réservations &amp; Proformas
          </CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            Vérifie si une date est déjà prise par une réservation confirmée ou sollicitée via un proforma en cours.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="rounded bg-slate-800/60 border border-slate-700 px-3 py-2">
            <div className="text-[10px] uppercase text-slate-400">Dates réservées</div>
            <div className="text-2xl font-bold text-purple-300">{stats.reservations}</div>
          </div>
          <div className="rounded bg-slate-800/60 border border-slate-700 px-3 py-2">
            <div className="text-[10px] uppercase text-slate-400">Dates sollicitées (proforma)</div>
            <div className="text-2xl font-bold text-amber-300">{stats.proformas}</div>
          </div>
          <div className="rounded bg-slate-800/60 border border-slate-700 px-3 py-2">
            <div className="text-[10px] uppercase text-slate-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-rose-400" /> Conflits
            </div>
            <div className="text-2xl font-bold text-rose-300">{stats.conflicts}</div>
          </div>
          <div className="rounded bg-slate-800/60 border border-slate-700 px-3 py-2">
            <div className="text-[10px] uppercase text-slate-400">Événements totaux</div>
            <div className="text-2xl font-bold text-white">{stats.total_events}</div>
          </div>
        </CardContent>
      </Card>

      {/* Filtres */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 rounded-lg bg-slate-800/50 p-1 border border-slate-700">
          {[
            { k: "all", label: "Tous" },
            { k: "reservations", label: "Réservations" },
            { k: "proformas", label: "Proformas" },
          ].map((f) => (
            <button
              key={f.k}
              onClick={() => setFilter(f.k)}
              className={`px-3 py-1 rounded text-xs font-medium transition ${
                filter === f.k ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
              }`}
              data-testid={`calendar-filter-${f.k}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyLocationProformas}
            onChange={(e) => setOnlyLocationProformas(e.target.checked)}
            className="rounded"
          />
          Proformas liées à une location uniquement
        </label>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchAll}
          disabled={loading}
          className="border-slate-700 text-slate-300 hover:bg-slate-800"
          data-testid="calendar-refresh"
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {/* Calendar + details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Calendar grid */}
        <Card className="bg-slate-900/60 border-slate-800 lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="border-slate-700 h-7 w-7 p-0">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="text-white font-semibold text-base">
                {format(currentMonth, "MMMM yyyy", { locale: fr })}
              </div>
              <Button size="sm" variant="outline" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="border-slate-700 h-7 w-7 p-0">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setCurrentMonth(new Date()); setSelectedDate(new Date()); }}
              className="border-slate-700 text-slate-300 h-7"
            >
              Aujourd'hui
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 text-center">
              {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
                <div key={d} className="text-[10px] uppercase text-slate-400 font-semibold py-1">{d}</div>
              ))}
              {/* Padding for week start (Monday) */}
              {(() => {
                const first = daysOfMonth[0];
                const dow = (first.getDay() + 6) % 7; // 0=Mon
                return Array.from({ length: dow }).map((_, i) => <div key={`pad-${i}`} />);
              })()}
              {daysOfMonth.map((d) => {
                const iso = format(d, "yyyy-MM-dd");
                const evs = eventsByDate.get(iso) || [];
                const hasReservation = evs.some((e) => e.kind === "reservation");
                const hasProforma = evs.some((e) => e.kind === "proforma" && e.date_is_event);
                const isSelected = selectedDate && isSameDay(selectedDate, d);
                const isToday = isSameDay(d, new Date());
                const base = "rounded-lg py-2 px-1 text-xs cursor-pointer transition border";
                let cls = "bg-slate-800/40 border-slate-700/40 text-slate-300 hover:bg-slate-700/40";
                if (hasReservation && hasProforma) cls = "bg-rose-500/20 border-rose-500/40 text-white";
                else if (hasReservation) cls = "bg-purple-500/20 border-purple-500/40 text-purple-200";
                else if (hasProforma) cls = "bg-amber-500/20 border-amber-500/40 text-amber-200";
                if (isSelected) cls += " ring-2 ring-white";
                if (isToday) cls += " outline outline-1 outline-cyan-500";
                return (
                  <button
                    key={iso}
                    onClick={() => setSelectedDate(d)}
                    className={`${base} ${cls}`}
                    data-testid={`calendar-day-${iso}`}
                  >
                    <div className="font-semibold">{format(d, "d")}</div>
                    {evs.length > 0 && (
                      <div className="mt-1 text-[9px] font-bold">{evs.length} ev.</div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Légende */}
            <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-slate-400">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-500/50 border border-purple-500/40" /> Réservation</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500/50 border border-amber-500/40" /> Proforma (date événement)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-500/50 border border-rose-500/40" /> Conflit (les deux)</span>
            </div>
          </CardContent>
        </Card>

        {/* Details panel */}
        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white">
              {selectedDate ? (
                <>Événements du <span className="text-purple-300">{format(selectedDate, "EEEE dd MMM yyyy", { locale: fr })}</span></>
              ) : (
                <>Prochains événements</>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[500px] overflow-y-auto space-y-2">
            {selectedEvents.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-emerald-400" />
                Aucun événement {selectedDate ? "ce jour" : ""}. Date libre !
              </div>
            ) : (
              selectedEvents.map((ev) => (
                <div
                  key={ev.id}
                  className={`rounded-lg border p-2 ${
                    ev.kind === "reservation"
                      ? "bg-purple-500/5 border-purple-500/30"
                      : "bg-amber-500/5 border-amber-500/30"
                  }`}
                  data-testid={`calendar-event-${ev.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {ev.kind === "reservation" ? (
                          <Badge className="bg-purple-500/25 text-purple-200 text-[10px]">
                            <Building2 className="w-3 h-3 mr-0.5" />Réservation
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/25 text-amber-200 text-[10px]">
                            <FileText className="w-3 h-3 mr-0.5" />Proforma
                          </Badge>
                        )}
                        {ev.kind === "reservation" && (
                          <Badge className={`text-[10px] ${
                            ev.status === "confirmed" ? "bg-blue-500/20 text-blue-300" :
                            ev.status === "completed" ? "bg-emerald-500/20 text-emerald-300" :
                            "bg-slate-500/20 text-slate-300"
                          }`}>
                            {ev.status === "confirmed" ? "Confirmée" : ev.status === "completed" ? "Terminée" : ev.status}
                          </Badge>
                        )}
                        {ev.kind === "proforma" && (
                          <Badge className={`text-[10px] ${(PROFORMA_STATUS_META[ev.status] || {}).color}`}>
                            {(PROFORMA_STATUS_META[ev.status] || {}).label || ev.status}
                          </Badge>
                        )}
                        {ev.kind === "proforma" && !ev.date_is_event && (
                          <Badge className="bg-slate-500/20 text-slate-400 text-[10px]" title="Date de demande (pas d'événement précisé)">
                            <Clock className="w-3 h-3 mr-0.5" />date demande
                          </Badge>
                        )}
                      </div>
                      <div className="text-white text-sm font-medium mt-1 truncate">
                        {ev.customer_name || "—"}
                      </div>
                      {ev.kind === "reservation" && (
                        <div className="text-[11px] text-slate-400 mt-0.5 space-y-0.5">
                          {ev.spaces?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {ev.spaces.map((sp) => (
                                <span key={sp} className={`px-1.5 py-0.5 rounded text-[10px] border ${SPACE_COLORS[sp] || "bg-slate-700"}`}>
                                  {SPACE_LABELS[sp] || sp}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-2 flex-wrap">
                            {(ev.start_time || ev.end_time) && (
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{ev.start_time || "—"} → {ev.end_time || "—"}</span>
                            )}
                            {ev.guests && (
                              <span className="flex items-center gap-1"><Users className="w-3 h-3" />{ev.guests} invités</span>
                            )}
                          </div>
                          {ev.event_type && (
                            <div>{ev.event_type}</div>
                          )}
                        </div>
                      )}
                      {ev.kind === "proforma" && (
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          <div className="truncate">{ev.title}</div>
                          {ev.proforma_number && (
                            <div className="font-mono text-slate-500">{ev.proforma_number}</div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-right whitespace-nowrap">
                      {ev.amount != null && (
                        <div className="text-sm font-bold text-amber-300">
                          {typeof formatPrice === "function"
                            ? `${formatPrice(ev.amount)} F`
                            : `${Math.round(ev.amount).toLocaleString("fr-FR")} F`}
                        </div>
                      )}
                      {ev.phone && (
                        <div className="text-[10px] text-slate-500 mt-0.5">{ev.phone}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LocationCalendarTab;
