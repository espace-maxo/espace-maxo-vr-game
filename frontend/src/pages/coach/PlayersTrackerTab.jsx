/**
 * PlayersTrackerTab — Suivi consommation par joueur avec historique horodaté.
 *
 * Workflow:
 *   - Coach ajoute un joueur (nom + table optionnelle)
 *   - Choisit un jeu actif pour le joueur
 *   - À chaque partie : clique "+1 partie" (incrément immédiat au prix catalogue)
 *   - Ou bien "+1h forfait" à 12 000 F (tarif global)
 *   - L'historique horodaté s'affiche en dessous (Partie 1 à 14h05 · +6 000 F …)
 *   - À chaque clic : micro-animation "+ X F" qui pop + bip sonore
 *   - Cocher plusieurs joueurs → transmettre tous en 1 bon
 */
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, UserPlus, Trash2, Plus, Send, RefreshCw, Loader2, Gamepad2,
  Hash, Clock, X, History,
} from "lucide-react";
import { playBeep } from "../../lib/notificationBeep";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const DEFAULT_HOURLY_RATE = 12000;

const PlayersTrackerTab = ({ currentUser, catalog }) => {
  const actorRole = currentUser?.role || "coach_jeux";
  const actorName = currentUser?.full_name || currentUser?.username || "Coach";

  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTable, setNewTable] = useState("");
  const [selected, setSelected] = useState({});
  const [activeJeu, setActiveJeu] = useState({}); // playerId -> jeu_product_id
  const [pendingIncrement, setPendingIncrement] = useState(null); // {playerId, amount, ts}
  const [busy, setBusy] = useState({}); // playerId -> bool
  const flashRef = useRef({}); // playerId -> last increment animation key

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/coach/players`, {
        params: { actor_role: actorRole, actor_name: actorName, status: "open" },
      });
      setPlayers(r.data.players || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setLoading(false);
    }
  }, [actorRole, actorName]);

  useEffect(() => { fetchPlayers(); }, [fetchPlayers]);

  const addPlayer = async () => {
    const name = newName.trim();
    if (!name) return toast.error("Nom du joueur requis");
    try {
      await axios.post(`${API}/coach/players`, {
        player_name: name, coach_name: actorName, coach_role: actorRole,
        table_number: newTable ? Number(newTable) : null,
      });
      setNewName(""); setNewTable("");
      toast.success(`Joueur ${name} ajouté`);
      fetchPlayers();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const deletePlayer = async (p) => {
    if (!window.confirm(`Supprimer "${p.player_name}" et toutes ses parties ?`)) return;
    try {
      await axios.delete(`${API}/coach/players/${p.id}`, { params: { actor_role: actorRole } });
      fetchPlayers();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const removeConsumption = async (playerId, idx) => {
    try {
      await axios.delete(`${API}/coach/players/${playerId}/consume/${idx}`, { params: { actor_role: actorRole } });
      fetchPlayers();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const flash = (playerId, amount) => {
    const key = Date.now();
    flashRef.current[playerId] = key;
    setPendingIncrement({ playerId, amount, key });
    setTimeout(() => {
      setPendingIncrement((cur) => (cur && cur.key === key ? null : cur));
    }, 1200);
    try { playBeep({ freq: 1500, duration: 0.06, volume: 0.5, count: 1, gap: 0 }); } catch {}
  };

  const addParty = async (p) => {
    const jeuId = activeJeu[p.id];
    const product = catalog.find((c) => c.id === jeuId);
    if (!product) return toast.error("Choisissez un jeu actif pour ce joueur");
    setBusy((b) => ({ ...b, [p.id]: true }));
    try {
      await axios.post(`${API}/coach/players/${p.id}/consume`, {
        jeu_product_id: product.id,
        jeu_name: product.name,
        billing_mode: "parties",
        parties: 1,
        unit_price: product.price || 0,
        actor_name: actorName, actor_role: actorRole,
      });
      flash(p.id, product.price || 0);
      fetchPlayers();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setBusy((b) => ({ ...b, [p.id]: false }));
    }
  };

  const addHour = async (p) => {
    const jeuId = activeJeu[p.id];
    const product = catalog.find((c) => c.id === jeuId);
    if (!product) return toast.error("Choisissez un jeu actif pour ce joueur");
    setBusy((b) => ({ ...b, [p.id]: true }));
    try {
      await axios.post(`${API}/coach/players/${p.id}/consume`, {
        jeu_product_id: product.id,
        jeu_name: product.name,
        billing_mode: "hourly",
        hours: 1,
        hourly_rate: DEFAULT_HOURLY_RATE,
        actor_name: actorName, actor_role: actorRole,
      });
      flash(p.id, DEFAULT_HOURLY_RATE);
      fetchPlayers();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setBusy((b) => ({ ...b, [p.id]: false }));
    }
  };

  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);
  const selectedTotal = useMemo(
    () => players.filter((p) => selected[p.id]).reduce((s, p) => s + (Number(p.total) || 0), 0),
    [selected, players],
  );

  const transmitSelected = async () => {
    if (selectedIds.length === 0) return toast.error("Cochez au moins un joueur");
    if (!window.confirm(`Transmettre ${selectedIds.length} joueur(s) en un seul bon ?`)) return;
    try {
      const r = await axios.post(`${API}/coach/players/transmit`, {
        player_ids: selectedIds, actor_name: actorName, actor_role: actorRole,
      });
      toast.success(`Bon transmis · ${r.data.total.toLocaleString("fr-FR")} F`);
      setSelected({});
      fetchPlayers();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  return (
    <div className="space-y-3" data-testid="players-tracker-tab">
      {/* Add player */}
      <Card className="bg-slate-800/60 border-purple-500/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-purple-400" />
            Ajouter un joueur à suivre
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)}
                 placeholder="Nom du joueur"
                 className="bg-slate-900 border-slate-700 h-9 text-sm sm:col-span-2"
                 data-testid="new-player-name" />
          <Input type="number" value={newTable} onChange={(e) => setNewTable(e.target.value)}
                 placeholder="N° table (optionnel)"
                 className="bg-slate-900 border-slate-700 h-9 text-sm" />
          <Button onClick={addPlayer} disabled={!newName.trim()}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white h-9 text-sm sm:col-span-3"
                  data-testid="add-player-btn">
            <UserPlus className="w-4 h-4 mr-1" /> Démarrer le suivi
          </Button>
        </CardContent>
      </Card>

      {/* Selection summary */}
      {selectedIds.length > 0 && (
        <Card className="bg-emerald-900/30 border-emerald-500/50 sticky top-2 z-10">
          <CardContent className="p-2.5 flex items-center justify-between gap-2 text-sm">
            <span className="text-emerald-100">
              <strong>{selectedIds.length}</strong> joueur(s) · <strong>{selectedTotal.toLocaleString("fr-FR")} F</strong>
            </span>
            <Button size="sm" onClick={transmitSelected}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white h-8"
                    data-testid="transmit-selected">
              <Send className="w-3.5 h-3.5 mr-1" /> Transmettre
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm text-slate-300 font-semibold flex items-center gap-2">
          <Users className="w-4 h-4 text-purple-400" /> Joueurs en cours ({players.length})
        </h3>
        <Button variant="ghost" size="sm" onClick={fetchPlayers} disabled={loading}
                className="text-slate-300 h-7 text-[11px]">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
        </Button>
      </div>

      {players.length === 0 && !loading && (
        <Card className="bg-slate-800/40 border-slate-700">
          <CardContent className="p-6 text-center text-slate-500 italic text-sm">
            Aucun joueur en cours.
          </CardContent>
        </Card>
      )}

      {players.map((p) => {
        const isSel = !!selected[p.id];
        const jeuId = activeJeu[p.id];
        const product = catalog.find((c) => c.id === jeuId);
        const isFlash = pendingIncrement && pendingIncrement.playerId === p.id;
        const isBusy = !!busy[p.id];
        // Compteur parties / forfait par jeu (résumé)
        const summary = (p.items || []).reduce((acc, it) => {
          const key = it.jeu_name + "|" + (it.billing_mode || "parties");
          if (!acc[key]) acc[key] = { jeu_name: it.jeu_name, mode: it.billing_mode || "parties", count: 0, total: 0, hours: 0 };
          acc[key].count += (it.parties || 1);
          acc[key].total += (it.total || 0);
          if (it.billing_mode === "hourly") acc[key].hours += (it.hours || 0);
          return acc;
        }, {});

        return (
          <Card key={p.id}
                className={`relative overflow-hidden ${isSel ? "bg-emerald-900/20 border-emerald-500/40" : "bg-slate-800/60 border-slate-700"}`}
                data-testid={`player-card-${p.id}`}>
            {/* Animation +X F */}
            {isFlash && (
              <div key={pendingIncrement.key}
                   className="absolute top-2 right-2 z-20 pointer-events-none text-emerald-300 font-bold text-lg"
                   style={{
                     animation: "popUp 1.1s ease-out forwards",
                   }}>
                +{pendingIncrement.amount.toLocaleString("fr-FR")} F
              </div>
            )}
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                  <input type="checkbox" checked={isSel}
                         onChange={(e) => setSelected((s) => ({ ...s, [p.id]: e.target.checked }))}
                         className="w-4 h-4 accent-emerald-500"
                         data-testid={`player-select-${p.id}`} />
                  <Users className="w-4 h-4 text-purple-400 shrink-0" />
                  <span className="truncate">{p.player_name}</span>
                  {p.table_number != null && (
                    <Badge className="bg-blue-500/30 text-blue-200 text-[10px]"><Hash className="w-2.5 h-2.5 mr-0.5" />T{p.table_number}</Badge>
                  )}
                  <Badge className="bg-emerald-700/50 text-emerald-100 text-[11px]">
                    {(p.total || 0).toLocaleString("fr-FR")} F
                  </Badge>
                </label>
                <Button size="sm" variant="ghost" onClick={() => deletePlayer(p)}
                        className="text-rose-400 hover:text-rose-300 h-7 w-7 p-0"
                        title="Supprimer">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {/* Résumé par jeu */}
              {Object.keys(summary).length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {Object.values(summary).map((s, i) => (
                    <div key={i} className={`flex items-center gap-1.5 rounded p-1.5 ${s.mode === "hourly" ? "bg-amber-900/30 border border-amber-500/30" : "bg-purple-900/30 border border-purple-500/30"}`}>
                      <Gamepad2 className={`w-3 h-3 ${s.mode === "hourly" ? "text-amber-400" : "text-purple-400"}`} />
                      <span className="flex-1 truncate text-slate-200 text-[11px]">{s.jeu_name}</span>
                      {s.mode === "hourly" ? (
                        <Badge className="bg-amber-700/50 text-amber-100 text-[9px]">{s.hours}h</Badge>
                      ) : (
                        <Badge className="bg-purple-700/50 text-purple-100 text-[9px]">x{s.count}</Badge>
                      )}
                      <span className="text-emerald-300 text-[10px] font-bold">{s.total.toLocaleString("fr-FR")} F</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick-add controls */}
              <div className="border-t border-slate-700 pt-2 space-y-1.5">
                <Select value={jeuId || ""} onValueChange={(v) => setActiveJeu((a) => ({ ...a, [p.id]: v }))}>
                  <SelectTrigger className="bg-slate-900 border-slate-700 h-8 text-[11px]"
                                 data-testid={`active-jeu-${p.id}`}>
                    <SelectValue placeholder="Choisir un jeu actif…" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    {catalog.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name} — {c.price} F</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button size="sm" disabled={!product || isBusy}
                          onClick={() => addParty(p)}
                          className="bg-purple-600 hover:bg-purple-700 text-white h-9 text-xs font-semibold active:scale-95 transition"
                          data-testid={`add-party-${p.id}`}>
                    <Plus className="w-4 h-4 mr-0.5" /> +1 partie
                    {product && <span className="ml-1 text-[10px] opacity-80">({product.price} F)</span>}
                  </Button>
                  <Button size="sm" disabled={!product || isBusy}
                          onClick={() => addHour(p)}
                          className="bg-amber-600 hover:bg-amber-700 text-white h-9 text-xs font-semibold active:scale-95 transition"
                          data-testid={`add-hour-${p.id}`}>
                    <Clock className="w-4 h-4 mr-0.5" /> +1h forfait
                    <span className="ml-1 text-[10px] opacity-80">({DEFAULT_HOURLY_RATE.toLocaleString("fr-FR")} F)</span>
                  </Button>
                </div>
              </div>

              {/* Historique horodaté */}
              {(p.items || []).length > 0 && (
                <div className="border-t border-slate-700 pt-2">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <History className="w-3 h-3" /> Historique ({p.items.length})
                  </div>
                  <div className="space-y-0.5 max-h-[140px] overflow-y-auto pr-1">
                    {(p.items || []).slice().reverse().map((it, idx) => {
                      const realIdx = p.items.length - 1 - idx;
                      const isH = it.billing_mode === "hourly";
                      const partyNumber = p.items.slice(0, realIdx + 1).filter((x) => x.jeu_name === it.jeu_name && (x.billing_mode || "parties") === (it.billing_mode || "parties")).length;
                      return (
                        <div key={realIdx} className="flex items-center gap-2 bg-slate-900/40 rounded px-2 py-1 text-[11px]"
                             data-testid={`player-history-${p.id}-${realIdx}`}>
                          <span className="text-slate-500 text-[10px] w-12 shrink-0">
                            {it.added_at ? format(new Date(it.added_at), "HH:mm") : "—"}
                          </span>
                          <Gamepad2 className={`w-3 h-3 ${isH ? "text-amber-400" : "text-purple-400"} shrink-0`} />
                          <span className="flex-1 min-w-0 truncate text-slate-200">
                            {isH ? `Forfait ${it.hours}h` : `Partie #${partyNumber}`}
                            {" · "}
                            <span className="text-slate-400">{it.jeu_name}</span>
                          </span>
                          <span className="text-emerald-300 font-semibold">+{(it.total || 0).toLocaleString("fr-FR")} F</span>
                          <Button size="sm" variant="ghost" onClick={() => removeConsumption(p.id, realIdx)}
                                  className="text-rose-400 hover:text-rose-300 h-5 w-5 p-0">
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <style>{`
        @keyframes popUp {
          0%   { opacity: 0; transform: translateY(20px) scale(0.7); }
          15%  { opacity: 1; transform: translateY(0) scale(1.2); }
          40%  { opacity: 1; transform: translateY(-10px) scale(1); }
          100% { opacity: 0; transform: translateY(-50px) scale(0.9); }
        }
      `}</style>
    </div>
  );
};

export default PlayersTrackerTab;
