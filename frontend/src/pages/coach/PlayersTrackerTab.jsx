/**
 * PlayersTrackerTab — Suivi consommation par joueur côté Coach Jeux.
 *
 * - Liste les joueurs ouverts du coach (cartes avec total live)
 * - Ajouter un joueur (nom + table optionnelle)
 * - Pour chaque joueur : bouton "+ Conso" qui ouvre un mini-form (jeu + parties OU forfait)
 *   et bouton trash sur chaque conso
 * - Cochage multiple → "Transmettre N joueurs sélectionnés" en 1 bon multi-lignes
 */
import React, { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, UserPlus, Trash2, Plus, Send, RefreshCw, Loader2, Gamepad2,
  Coins, Hash, Clock, X,
} from "lucide-react";

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

  // Add-consumption form (per player)
  const [consumeForm, setConsumeForm] = useState({}); // playerId -> {open, jeu, mode, parties, price, hours, rate, notes}

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
        player_name: name,
        coach_name: actorName,
        coach_role: actorRole,
        table_number: newTable ? Number(newTable) : null,
      });
      setNewName("");
      setNewTable("");
      toast.success(`Joueur ${name} ajouté`);
      fetchPlayers();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const deletePlayer = async (p) => {
    if (!window.confirm(`Supprimer le joueur "${p.player_name}" et toutes ses consommations ?`)) return;
    try {
      await axios.delete(`${API}/coach/players/${p.id}`, { params: { actor_role: actorRole } });
      toast.success("Joueur supprimé");
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

  const openForm = (playerId) => {
    setConsumeForm((f) => ({
      ...f,
      [playerId]: {
        open: true, jeu: "", mode: "parties",
        parties: 1, price: 0, hours: 1, rate: DEFAULT_HOURLY_RATE, notes: "",
      },
    }));
  };
  const closeForm = (playerId) => setConsumeForm((f) => ({ ...f, [playerId]: { ...(f[playerId] || {}), open: false } }));
  const updateForm = (playerId, patch) => setConsumeForm((f) => ({ ...f, [playerId]: { ...(f[playerId] || {}), ...patch } }));

  const submitConsumption = async (player) => {
    const f = consumeForm[player.id];
    if (!f) return;
    const product = catalog.find((p) => p.id === f.jeu);
    if (!product) return toast.error("Sélectionnez un jeu");
    try {
      const body = {
        jeu_product_id: product.id,
        jeu_name: product.name,
        billing_mode: f.mode,
        parties: f.mode === "parties" ? Number(f.parties) : 1,
        unit_price: f.mode === "parties" ? Number(f.price) : 0,
        hours: f.mode === "hourly" ? Number(f.hours) : null,
        hourly_rate: f.mode === "hourly" ? Number(f.rate) : null,
        duration_minutes: null,
        notes: (f.notes || "").trim(),
        actor_name: actorName,
        actor_role: actorRole,
      };
      await axios.post(`${API}/coach/players/${player.id}/consume`, body);
      toast.success(`Conso ajoutée à ${player.player_name}`);
      closeForm(player.id);
      fetchPlayers();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
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
        player_ids: selectedIds,
        actor_name: actorName,
        actor_role: actorRole,
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

      {/* Selection summary + transmit */}
      {selectedIds.length > 0 && (
        <Card className="bg-emerald-900/30 border-emerald-500/50 sticky top-2 z-10">
          <CardContent className="p-2.5 flex items-center justify-between gap-2 text-sm">
            <span className="text-emerald-100">
              <strong>{selectedIds.length}</strong> joueur(s) sélectionné(s) · <strong>{selectedTotal.toLocaleString("fr-FR")} F</strong>
            </span>
            <Button size="sm" onClick={transmitSelected}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white h-8"
                    data-testid="transmit-selected">
              <Send className="w-3.5 h-3.5 mr-1" /> Transmettre
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Players list */}
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
            Aucun joueur en cours. Ajoutez-en un ci-dessus.
          </CardContent>
        </Card>
      )}

      {players.map((p) => {
        const isSel = !!selected[p.id];
        const f = consumeForm[p.id] || {};
        const product = catalog.find((c) => c.id === f.jeu);
        const lineTotal = f.mode === "hourly"
          ? Math.round((Number(f.hours) || 0) * (Number(f.rate) || 0))
          : Math.round((Number(f.parties) || 0) * (Number(f.price) || 0));
        return (
          <Card key={p.id}
                className={`${isSel ? "bg-emerald-900/20 border-emerald-500/40" : "bg-slate-800/60 border-slate-700"}`}
                data-testid={`player-card-${p.id}`}>
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
                    <Badge className="bg-blue-500/30 text-blue-200 text-[10px]"><Hash className="w-2.5 h-2.5 mr-0.5" />Table {p.table_number}</Badge>
                  )}
                  <Badge className="bg-emerald-700/50 text-emerald-100 text-[10px]">
                    {(p.total || 0).toLocaleString("fr-FR")} F
                  </Badge>
                </label>
                <Button size="sm" variant="ghost" onClick={() => deletePlayer(p)}
                        className="text-rose-400 hover:text-rose-300 h-7 w-7 p-0"
                        title="Supprimer le joueur">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs">
              {/* Items list */}
              {(p.items || []).length === 0 && (
                <p className="text-slate-500 italic text-[11px]">Aucune consommation enregistrée pour ce joueur.</p>
              )}
              {(p.items || []).map((it, idx) => {
                const isH = it.billing_mode === "hourly";
                return (
                  <div key={idx} className="flex items-center gap-2 bg-slate-900/40 rounded p-1.5"
                       data-testid={`player-conso-${p.id}-${idx}`}>
                    <Gamepad2 className={`w-3 h-3 ${isH ? "text-amber-400" : "text-purple-400"} shrink-0`} />
                    <span className="flex-1 min-w-0 truncate text-slate-100">{it.jeu_name}</span>
                    {isH ? (
                      <Badge className="bg-amber-700/50 text-amber-100 text-[9px]">Forfait {it.hours}h</Badge>
                    ) : (
                      <Badge className="bg-slate-700 text-slate-200 text-[9px]">x{it.parties}</Badge>
                    )}
                    <span className="text-emerald-300 text-[10px] font-semibold">{(it.total || 0).toLocaleString("fr-FR")} F</span>
                    <Button size="sm" variant="ghost" onClick={() => removeConsumption(p.id, idx)}
                            className="text-rose-400 hover:text-rose-300 h-6 w-6 p-0">
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                );
              })}

              {/* + Conso form */}
              {!f.open && (
                <Button size="sm" onClick={() => openForm(p.id)}
                        className="w-full bg-purple-600/30 hover:bg-purple-600/60 text-purple-100 border border-purple-500/40 h-7 text-[11px]"
                        data-testid={`add-conso-btn-${p.id}`}>
                  <Plus className="w-3 h-3 mr-1" /> Ajouter une consommation
                </Button>
              )}
              {f.open && (
                <div className="space-y-2 bg-slate-900/60 rounded p-2 border border-purple-500/30">
                  <div className="grid grid-cols-2 gap-1 bg-slate-900 rounded p-1">
                    <button type="button" onClick={() => updateForm(p.id, { mode: "parties" })}
                            className={`text-[10px] py-1 rounded transition ${f.mode === "parties" ? "bg-purple-600 text-white font-semibold" : "text-slate-400"}`}>
                      Par parties
                    </button>
                    <button type="button" onClick={() => updateForm(p.id, { mode: "hourly" })}
                            className={`text-[10px] py-1 rounded transition ${f.mode === "hourly" ? "bg-amber-600 text-white font-semibold" : "text-slate-400"}`}>
                      Forfait horaire
                    </button>
                  </div>
                  <Select value={f.jeu} onValueChange={(v) => {
                    const prod = catalog.find((c) => c.id === v);
                    updateForm(p.id, { jeu: v, price: prod?.price || 0 });
                  }}>
                    <SelectTrigger className="bg-slate-900 border-slate-700 h-8 text-[11px]">
                      <SelectValue placeholder="Choisir un jeu" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      {catalog.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name} — {c.price} F</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-2 gap-1">
                    {f.mode === "parties" ? (
                      <>
                        <Input type="number" min={1} value={f.parties}
                               onChange={(e) => updateForm(p.id, { parties: e.target.value })}
                               placeholder="Parties"
                               className="bg-slate-900 border-slate-700 h-8 text-[11px]" />
                        <Input type="number" min={0} step="50" value={f.price}
                               onChange={(e) => updateForm(p.id, { price: e.target.value })}
                               placeholder="Prix"
                               className="bg-slate-900 border-slate-700 h-8 text-[11px]" />
                      </>
                    ) : (
                      <>
                        <Input type="number" min={0.5} step="0.5" value={f.hours}
                               onChange={(e) => updateForm(p.id, { hours: e.target.value })}
                               placeholder="Heures"
                               className="bg-slate-900 border-amber-500/40 h-8 text-[11px]" />
                        <Input type="number" min={0} step="500" value={f.rate}
                               onChange={(e) => updateForm(p.id, { rate: e.target.value })}
                               placeholder="F/h"
                               className="bg-slate-900 border-amber-500/40 h-8 text-[11px]" />
                      </>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-amber-200">Total : <strong>{lineTotal.toLocaleString("fr-FR")} F</strong></span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => closeForm(p.id)}
                              className="text-slate-300 h-7 text-[10px]">Annuler</Button>
                      <Button size="sm" onClick={() => submitConsumption(p)} disabled={!product}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-[10px]"
                              data-testid={`submit-conso-${p.id}`}>
                        <Plus className="w-3 h-3 mr-0.5" /> Ajouter
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default PlayersTrackerTab;
