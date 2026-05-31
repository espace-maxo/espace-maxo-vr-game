/**
 * JournalTab — Timeline horodatée de la séance du Coach Jeux.
 *
 * Affiche chronologiquement tous les évènements du jour :
 *  - player_added : joueur ajouté
 *  - consume      : +1 partie ou +1h forfait
 *  - transmitted  : joueur transmis (bon créé)
 *  - bon_attached : bon attaché à une table (one-click depuis Caisse)
 *  - bon_standalone / bon_rejected : décisions Resp. Op.
 *
 * Bandeau supérieur : total du jour + transmis + ouvert + compteurs
 */
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Activity, RefreshCw, UserPlus, PlusCircle, Send, Link2,
  Receipt, XCircle, Loader2, TrendingUp, Wallet, Clock,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ICONS = {
  "user-plus": UserPlus,
  "plus-circle": PlusCircle,
  "send": Send,
  "link": Link2,
  "receipt": Receipt,
  "x-circle": XCircle,
};

const COLOR_CLASSES = {
  purple: "bg-purple-500/15 border-purple-500/40 text-purple-200",
  emerald: "bg-emerald-500/15 border-emerald-500/40 text-emerald-200",
  blue: "bg-blue-500/15 border-blue-500/40 text-blue-200",
  amber: "bg-amber-500/15 border-amber-500/40 text-amber-200",
  rose: "bg-rose-500/15 border-rose-500/40 text-rose-200",
};

const fmt = (n) => Math.round(Number(n || 0)).toLocaleString("fr-FR");
const hourMinFromIso = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso.slice(11, 16);
  }
};

export default function JournalTab({ currentUser }) {
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const actorRole = currentUser?.role || "coach_jeux";
  const actorName = currentUser?.full_name || currentUser?.username || "Coach";

  const fetchTimeline = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/coach/timeline`, {
        params: { coach_name: actorName, actor_role: actorRole },
      });
      setEvents(r.data.events || []);
      setStats(r.data.stats || null);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors du chargement du journal");
    } finally {
      setLoading(false);
    }
  }, [actorName, actorRole]);

  useEffect(() => {
    fetchTimeline();
    // Refresh toutes les 30s pour suivre la séance en direct
    const t = setInterval(fetchTimeline, 30000);
    return () => clearInterval(t);
  }, [fetchTimeline]);

  return (
    <div className="space-y-3" data-testid="coach-journal-tab">
      {/* Bandeau stats */}
      <Card className="bg-gradient-to-br from-purple-900/40 via-fuchsia-900/30 to-blue-900/30 border-purple-500/40">
        <CardContent className="p-3">
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-[10px] uppercase text-purple-300/80 tracking-wider">Total du jour</p>
              <p className="text-lg sm:text-xl font-bold text-white" data-testid="stat-total-day">
                {fmt(stats?.total_day)} F
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-blue-300/80 tracking-wider">Transmis</p>
              <p className="text-lg sm:text-xl font-bold text-blue-200" data-testid="stat-transmitted">
                {fmt(stats?.transmitted_total)} F
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-amber-300/80 tracking-wider">Ouvert</p>
              <p className="text-lg sm:text-xl font-bold text-amber-200" data-testid="stat-open">
                {fmt(stats?.open_amount)} F
              </p>
            </div>
            <div className="hidden sm:block">
              <p className="text-[10px] uppercase text-slate-400 tracking-wider">Activité</p>
              <p className="text-[11px] text-slate-300 leading-tight">
                <span className="text-purple-200 font-semibold">{stats?.players_count || 0}</span> joueurs<br />
                <span className="text-emerald-200 font-semibold">{stats?.consumed_count || 0}</span> consos<br />
                <span className="text-blue-200 font-semibold">{stats?.transmitted_count || 0}</span> transmis
              </p>
            </div>
          </div>
          {/* Activité compact pour mobile */}
          <div className="sm:hidden mt-2 flex justify-center gap-3 text-[11px] text-slate-300">
            <span><b className="text-purple-200">{stats?.players_count || 0}</b> joueurs</span>
            <span><b className="text-emerald-200">{stats?.consumed_count || 0}</b> consos</span>
            <span><b className="text-blue-200">{stats?.transmitted_count || 0}</b> transmis</span>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card className="bg-slate-800/60 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2 text-white">
              <Activity className="w-4 h-4 text-fuchsia-400" />
              Journal de la séance ({events.length})
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchTimeline}
              disabled={loading}
              className="text-slate-300 h-7 text-[11px]"
              data-testid="journal-refresh-btn"
            >
              {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              Actualiser
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          {events.length === 0 && !loading && (
            <div className="text-center py-8 px-4">
              <Clock className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Aucune activité pour le moment.</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Ajoutez votre premier joueur dans l'onglet Joueurs pour démarrer le suivi.
              </p>
            </div>
          )}
          {events.length > 0 && (
            <ol className="relative border-l border-slate-700 ml-3 space-y-2.5" data-testid="journal-events-list">
              {events.map((ev, idx) => {
                const Icon = ICONS[ev.icon] || Activity;
                const colorClass = COLOR_CLASSES[ev.color] || COLOR_CLASSES.purple;
                return (
                  <li
                    key={`${ev.at}-${idx}`}
                    className="ml-4 group"
                    data-testid={`journal-event-${idx}`}
                  >
                    <span className={`absolute -left-2 flex items-center justify-center w-4 h-4 rounded-full ${colorClass} border`}>
                      <Icon className="w-2.5 h-2.5" />
                    </span>
                    <div className={`rounded-md ${colorClass} border px-2.5 py-1.5 flex items-center justify-between gap-2`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] leading-tight font-medium truncate">
                          {ev.label}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                          <Clock className="w-2.5 h-2.5" />
                          {hourMinFromIso(ev.at)}
                          {ev.table_number != null && (
                            <Badge className="bg-blue-500/20 text-blue-200 text-[9px] px-1 py-0">
                              T{ev.table_number}
                            </Badge>
                          )}
                        </p>
                      </div>
                      {ev.amount > 0 && (
                        <span className="text-[11px] font-mono font-bold text-emerald-300 whitespace-nowrap">
                          +{fmt(ev.amount)} F
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      <p className="text-[10px] text-slate-500 italic text-center px-2">
        <TrendingUp className="w-3 h-3 inline mr-1" />
        Le journal se rafraîchit automatiquement toutes les 30 secondes.
        Utilisez-le pour justifier votre activité en fin de journée.
      </p>
    </div>
  );
}
