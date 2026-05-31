/**
 * CuisineNeedsAdminList — Vue admin de tous les besoins transmis par le cuisinier.
 *
 * Affiche les besoins pending en premier (avec alerte visuelle), puis l'historique.
 * Permet à l'admin de marquer un besoin :
 *  - "Vu" (seen) : signalement reçu
 *  - "Approvisionné" (fulfilled) : ✓ approvisionnement effectué
 *  - "Refusé" (rejected) : non disponible, avec motif
 */
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Package, AlertTriangle, Eye, CheckCircle2, XCircle, Clock, RefreshCw, Loader2, ChefHat,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_META = {
  pending:   { label: "EN ATTENTE",    color: "bg-amber-500/20 text-amber-200 border-amber-500/40", icon: Clock },
  seen:      { label: "Vu",            color: "bg-blue-500/20 text-blue-200 border-blue-500/40",   icon: Eye },
  fulfilled: { label: "Approvisionné", color: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40", icon: CheckCircle2 },
  rejected:  { label: "Refusé",        color: "bg-rose-500/20 text-rose-200 border-rose-500/40",    icon: XCircle },
};

const CuisineNeedsAdminList = ({ currentUser }) => {
  const [needs, setNeeds] = useState([]);
  const [counts, setCounts] = useState({});
  const [pendingCount, setPendingCount] = useState(0);
  const [urgentCount, setUrgentCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("pending");

  const actorName = currentUser?.full_name || currentUser?.username || "Admin";
  const actorRole = currentUser?.role || "admin";

  const fetchNeeds = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter === "all" ? {} : { status: filter };
      const r = await axios.get(`${API}/cuisine/needs`, { params: { ...params, limit: 100 } });
      setNeeds(r.data.items || []);
      setCounts(r.data.counts_by_status || {});
      setPendingCount(r.data.pending_count || 0);
      setUrgentCount(r.data.urgent_pending_count || 0);
    } catch (e) {
      toast.error("Erreur de chargement des besoins");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchNeeds();
    const t = setInterval(fetchNeeds, 30000);
    return () => clearInterval(t);
  }, [fetchNeeds]);

  const updateStatus = async (id, status, rejection_reason = "") => {
    try {
      await axios.patch(`${API}/cuisine/needs/${id}`, {
        status, actor_role: actorRole, actor_name: actorName, rejection_reason,
      });
      const labels = { seen: "marqué vu", fulfilled: "marqué approvisionné", rejected: "refusé" };
      toast.success(`Besoin ${labels[status] || status}`);
      fetchNeeds();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const rejectWithReason = (id) => {
    const reason = window.prompt("Motif du refus :", "Non disponible");
    if (reason === null) return;
    updateStatus(id, "rejected", reason.trim() || "Refusé");
  };

  return (
    <Card className="bg-slate-800/40 border-orange-500/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2 text-white">
          <span className="flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-orange-400" />
            Besoins en cuisine (transmis par le cuisinier)
            {pendingCount > 0 && (
              <Badge className="bg-amber-500 text-white animate-pulse ml-1" data-testid="needs-pending-badge">
                {pendingCount} en attente
              </Badge>
            )}
            {urgentCount > 0 && (
              <Badge className="bg-rose-600 text-white animate-pulse">
                <AlertTriangle className="w-3 h-3 mr-1" /> {urgentCount} urgent{urgentCount > 1 ? "s" : ""}
              </Badge>
            )}
          </span>
          <Button variant="ghost" size="sm" onClick={fetchNeeds} disabled={loading} className="text-slate-300 h-7 text-[11px]">
            {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
            Actualiser
          </Button>
        </CardTitle>
        {/* Filtres */}
        <div className="flex gap-1.5 flex-wrap pt-1">
          {["pending", "seen", "fulfilled", "rejected", "all"].map((s) => (
            <Button
              key={s}
              size="sm"
              variant={filter === s ? "default" : "outline"}
              onClick={() => setFilter(s)}
              className={`h-6 text-[10px] ${filter === s ? "bg-orange-600 hover:bg-orange-700 text-white" : "bg-transparent border-slate-600 text-slate-400 hover:text-white"}`}
              data-testid={`needs-filter-${s}`}
            >
              {s === "all" ? "Tous" : (STATUS_META[s]?.label || s)}
              <span className="ml-1 opacity-70">({s === "all" ? Object.values(counts).reduce((a, b) => a + b, 0) : (counts[s] || 0)})</span>
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {needs.length === 0 && !loading && (
          <p className="text-sm text-slate-500 italic text-center py-6">
            <Package className="w-8 h-8 mx-auto mb-2 text-slate-700" />
            Aucun besoin {filter !== "all" ? STATUS_META[filter]?.label.toLowerCase() : ""}.
          </p>
        )}
        {needs.map((n) => {
          const meta = STATUS_META[n.status] || STATUS_META.pending;
          const Icon = meta.icon;
          const isUrgent = n.urgency === "urgent";
          return (
            <div
              key={n.id}
              className={`rounded border ${meta.color} px-3 py-2 ${isUrgent && n.status === "pending" ? "ring-2 ring-rose-500/50" : ""}`}
              data-testid={`admin-need-${n.id}`}
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold flex items-center gap-1.5 flex-wrap">
                    {isUrgent && (
                      <Badge className="bg-rose-600 text-white text-[9px] px-1.5">
                        <AlertTriangle className="w-2.5 h-2.5 mr-0.5" /> URGENT
                      </Badge>
                    )}
                    <span className="text-sm">{n.items_count} produit{n.items_count > 1 ? "s" : ""}</span>
                    <span className="text-[11px] text-slate-400">
                      · par <b>{n.requested_by}</b> · {n.requested_at ? new Date(n.requested_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </span>
                  </p>
                  <div className="mt-1.5 space-y-0.5">
                    {(n.items || []).map((it, i) => (
                      <p key={i} className="text-[12px] text-slate-200 flex items-center gap-2">
                        <span className="text-amber-300">•</span>
                        <span className="flex-1">{it.product_name}</span>
                        <span className="font-mono text-amber-200 font-bold">{it.quantity} {it.unit}</span>
                      </p>
                    ))}
                  </div>
                  {n.notes && (
                    <p className="text-[11px] text-slate-300 italic mt-1.5 bg-slate-900/40 rounded px-2 py-1">
                      💬 {n.notes}
                    </p>
                  )}
                  {n.status === "rejected" && n.rejection_reason && (
                    <p className="text-[11px] text-rose-300 mt-1">Motif refus : {n.rejection_reason}</p>
                  )}
                  {n.status === "fulfilled" && n.fulfilled_at && (
                    <p className="text-[10px] text-emerald-300 mt-0.5">
                      ✓ Approvisionné par {n.fulfilled_by} le {new Date(n.fulfilled_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  )}
                </div>
                <Badge className={`${meta.color} border text-[10px] shrink-0`}>
                  <Icon className="w-3 h-3 mr-1" /> {meta.label}
                </Badge>
              </div>

              {/* Actions admin */}
              {n.status === "pending" && (
                <div className="flex gap-1.5 mt-2 pt-2 border-t border-slate-700/40">
                  <Button size="sm" onClick={() => updateStatus(n.id, "seen")} className="h-7 text-[10px] bg-blue-600 hover:bg-blue-700" data-testid={`need-seen-${n.id}`}>
                    <Eye className="w-3 h-3 mr-1" /> Vu
                  </Button>
                  <Button size="sm" onClick={() => updateStatus(n.id, "fulfilled")} className="h-7 text-[10px] bg-emerald-600 hover:bg-emerald-700" data-testid={`need-fulfill-${n.id}`}>
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Approvisionné
                  </Button>
                  <Button size="sm" onClick={() => rejectWithReason(n.id)} className="h-7 text-[10px] bg-rose-600 hover:bg-rose-700" data-testid={`need-reject-${n.id}`}>
                    <XCircle className="w-3 h-3 mr-1" /> Refuser
                  </Button>
                </div>
              )}
              {n.status === "seen" && (
                <div className="flex gap-1.5 mt-2 pt-2 border-t border-slate-700/40">
                  <Button size="sm" onClick={() => updateStatus(n.id, "fulfilled")} className="h-7 text-[10px] bg-emerald-600 hover:bg-emerald-700" data-testid={`need-fulfill-${n.id}`}>
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Marquer approvisionné
                  </Button>
                  <Button size="sm" onClick={() => rejectWithReason(n.id)} className="h-7 text-[10px] bg-rose-600 hover:bg-rose-700">
                    <XCircle className="w-3 h-3 mr-1" /> Refuser
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default CuisineNeedsAdminList;
