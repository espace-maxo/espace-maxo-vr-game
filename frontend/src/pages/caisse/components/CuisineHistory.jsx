/**
 * CuisineHistory — Historique des actions cuisine (admin only).
 *
 * Affiche : plats marqués prêts, "tous prêts", scans de bons.
 * Admin peut supprimer chaque entrée. Suppression tracée dans audit_logs.
 */
import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChefHat, History, RefreshCw, Trash2, Loader2, CheckCircle2, CheckSquare, Camera } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ACTION_META = {
  item_ready: { label: "Plat prêt", color: "bg-emerald-500/20 text-emerald-300", Icon: CheckCircle2 },
  all_ready:  { label: "Bon entier prêt", color: "bg-emerald-600/30 text-emerald-200", Icon: CheckSquare },
  scan_bon:   { label: "Scan bon", color: "bg-cyan-500/20 text-cyan-300", Icon: Camera },
};

const CuisineHistory = ({ currentUser }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/cuisine/events`, {
        params: { actor_role: "admin", limit: 200 },
        timeout: 15000,
      });
      setItems(r.data.items || []);
    } catch (e) {
      toast.error("Erreur chargement historique cuisine");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (ev) => {
    if (!window.confirm(`Supprimer cette entrée d'historique ?\n\n${ACTION_META[ev.action]?.label}${ev.table_number ? ` · Table ${ev.table_number}` : ""}${ev.item_name ? ` · ${ev.item_name}` : ""}\n\nCette suppression sera tracée dans l'audit.`)) return;
    try {
      await axios.delete(`${API}/cuisine/events/${ev.id}`, {
        params: { actor_role: "admin", actor_name: currentUser?.full_name || currentUser?.username || "admin" },
        timeout: 10000,
      });
      toast.success("Entrée supprimée");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const filtered = filter === "all" ? items : items.filter((i) => i.action === filter);

  return (
    <Card className="bg-slate-800/40 border-slate-700" data-testid="cuisine-history-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg text-amber-300">
          <ChefHat className="w-5 h-5" /> Historique Cuisine
          <span className="text-xs text-slate-400 font-normal ml-2">(actions du cuisinier)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { v: "all", label: "Tous" },
            { v: "item_ready", label: "Plats prêts" },
            { v: "all_ready", label: "Bons entiers prêts" },
            { v: "scan_bon", label: "Scans" },
          ].map((f) => (
            <Button
              key={f.v}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFilter(f.v)}
              className={`h-7 text-[11px] px-2 ${
                filter === f.v
                  ? "bg-amber-600/30 text-amber-200 border border-amber-500/40"
                  : "bg-slate-700/40 text-slate-300 hover:bg-slate-700"
              }`}
              data-testid={`cuisine-history-filter-${f.v}`}
            >
              {f.label}
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={load}
            className="ml-auto h-7 text-[11px] text-slate-300"
            disabled={loading}
            data-testid="cuisine-history-refresh"
          >
            {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
            Actualiser
          </Button>
        </div>

        {filtered.length === 0 && !loading && (
          <p className="text-xs text-slate-500 italic text-center py-6">
            Aucune action cuisine enregistrée pour ce filtre.
          </p>
        )}

        {filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700">
                  <th className="text-left py-1.5 pr-2">Quand</th>
                  <th className="text-left py-1.5 px-1">Action</th>
                  <th className="text-left py-1.5 px-1">Table</th>
                  <th className="text-left py-1.5 px-1">Détail</th>
                  <th className="text-left py-1.5 px-1">Par</th>
                  <th className="text-right py-1.5 pl-1">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ev) => {
                  const meta = ACTION_META[ev.action] || { label: ev.action, color: "bg-slate-700 text-slate-300", Icon: History };
                  const Ic = meta.Icon;
                  return (
                    <tr key={ev.id} className="border-b border-slate-800 hover:bg-slate-700/20" data-testid={`cuisine-history-row-${ev.id}`}>
                      <td className="py-1.5 pr-2 text-slate-300 font-mono text-[10px]">
                        {ev.created_at ? format(new Date(ev.created_at), "dd/MM HH:mm:ss") : ""}
                      </td>
                      <td className="px-1">
                        <Badge className={meta.color}><Ic className="w-3 h-3 mr-1 inline" />{meta.label}</Badge>
                      </td>
                      <td className="px-1 text-slate-200">{ev.table_number != null ? `T${ev.table_number}` : "—"}</td>
                      <td className="px-1 text-slate-300">
                        {ev.action === "item_ready" && (
                          <span>{ev.item_name} <span className="text-slate-500">x{ev.item_quantity || 1}</span></span>
                        )}
                        {ev.action === "all_ready" && (
                          <span className="text-slate-400">{ev.items_count} plat(s) : {(ev.items_names || []).slice(0, 3).join(", ")}{(ev.items_names || []).length > 3 ? "…" : ""}</span>
                        )}
                        {ev.action === "scan_bon" && (
                          <span className="text-slate-400">{ev.items_count} plat(s) extrait(s) — <span className="text-cyan-300">Recoupement #{(ev.recoupement_id || "").slice(0, 8)}</span></span>
                        )}
                      </td>
                      <td className="px-1 text-slate-400 text-[10px]">{ev.actor_name || "—"}</td>
                      <td className="text-right pl-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(ev)}
                          className="h-6 w-7 text-rose-400 hover:text-rose-300 hover:bg-rose-900/30 px-0"
                          data-testid={`cuisine-history-delete-${ev.id}`}
                          title="Supprimer cette entrée"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CuisineHistory;
