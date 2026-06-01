/**
 * CuisineScansAdminList — Affiche la liste des scans de bons validés par
 * le cuisinier (côté Admin, dans l'onglet Recoupement IA → Rapports).
 *
 * Endpoint backend : GET /api/cuisine/scans/list?validated_only=true
 */
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, RefreshCw, Loader2, Trash2, ChefHat } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CuisineScansAdminList = ({ currentUser }) => {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/cuisine/scans/list`, {
        params: { validated_only: true, limit: 50 },
      });
      setScans(r.data.items || []);
    } catch (e) {
      toast.error("Erreur chargement scans");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const removeScan = async (id) => {
    if (!window.confirm("Supprimer ce scan ?")) return;
    try {
      await axios.delete(`${API}/cuisine/scan-bon/${id}`, {
        params: { actor_role: "admin" },
      });
      toast.success("Scan supprimé");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur de suppression");
    }
  };

  return (
    <Card className="bg-slate-800/40 border-slate-700" data-testid="cuisine-scans-admin-list">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-cyan-300">
          <Camera className="w-5 h-5" />
          Scans de bons envoyés par le cuisinier ({scans.length})
          <Button
            variant="ghost" size="sm" onClick={load} disabled={loading}
            className="ml-auto h-7 text-[11px] text-slate-300"
            data-testid="cuisine-scans-refresh"
          >
            {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
            Actualiser
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {scans.length === 0 && !loading && (
          <p className="text-xs text-slate-500 italic text-center py-6">
            Aucun scan validé pour l'instant. Les bons photographiés et validés par le cuisinier apparaîtront ici.
          </p>
        )}
        {scans.map((s) => {
          const items = s.declared || [];
          const dt = s.validated_at || s.created_at;
          return (
            <div
              key={s.id}
              className="rounded border border-slate-700 bg-slate-900/50 px-3 py-2"
              data-testid={`cuisine-scan-${s.id}`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    <ChefHat className="w-3 h-3 mr-1 inline" /> {s.validated_by || s.actor_name || "Cuisinier"}
                  </Badge>
                  <Badge className="bg-amber-500/20 text-amber-200">
                    {items.length} plat{items.length > 1 ? "s" : ""}
                  </Badge>
                  <span className="text-[11px] text-slate-400 font-mono">{s.date}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-500">
                    {dt ? new Date(dt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : ""}
                  </span>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => removeScan(s.id)}
                    className="h-7 w-7 p-0 text-rose-400 hover:bg-rose-500/10"
                    data-testid={`cuisine-scan-del-${s.id}`}
                    title="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              {items.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-[12px] text-slate-200 mt-1">
                  {items.map((it, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="truncate">{it.name}</span>
                      <span className="text-slate-400 font-mono shrink-0 ml-2">×{Number(it.quantity || 0)}</span>
                    </div>
                  ))}
                </div>
              )}
              {s.notes && (
                <p className="text-[10px] text-slate-400 italic mt-1.5 pt-1 border-t border-slate-700/60">
                  {s.notes}
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default CuisineScansAdminList;
