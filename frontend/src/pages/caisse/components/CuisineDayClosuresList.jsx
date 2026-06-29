/**
 * CuisineDayClosuresList — Liste & détail des clôtures de journée Cuisine.
 *
 * Profil ADMIN uniquement. Affiche dans l'onglet "Rapports Cuisine & Jeux" :
 *   - une vue résumé (stats agrégées) du Chef après "Clôture de journée"
 *   - le détail par bon (table, agent, plats, heures)
 *   - top des plats les plus préparés
 */
import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ChefHat, RefreshCw, Loader2, Lock, Eye, Hash, CheckCircle2, Clock,
  Trash2, Flame, Trophy, FileText, Calendar,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => Math.round(Number(n || 0)).toLocaleString("fr-FR");

const CuisineDayClosuresList = ({ currentUser }) => {
  const [closures, setClosures] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const actorRole = currentUser?.role || "admin";

  const fetchClosures = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/cuisine/day-closures`, {
        params: {
          actor_role: actorRole,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        },
      });
      setClosures(r.data.closures || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur chargement clôtures");
    } finally {
      setLoading(false);
    }
  }, [actorRole, dateFrom, dateTo]);

  useEffect(() => { fetchClosures(); }, [fetchClosures]);

  const openDetail = async (c) => {
    setDetail({ ...c, orders: null });
    setDetailLoading(true);
    try {
      const r = await axios.get(`${API}/cuisine/day-closures/${c.id}`, {
        params: { actor_role: actorRole },
      });
      setDetail(r.data);
    } catch (e) {
      toast.error("Erreur chargement détail");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const deleteClosure = async (e, c) => {
    e.stopPropagation();
    if (!window.confirm(`Supprimer la clôture du ${c.date} (${c.total_orders} bon(s)) ?`)) return;
    try {
      await axios.delete(`${API}/cuisine/day-closures/${c.id}`, {
        params: { actor_role: actorRole, actor_name: currentUser?.full_name || currentUser?.username || "Admin" },
      });
      toast.success("Clôture supprimée");
      fetchClosures();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  // Stats agrégées de la liste (résumé tout en haut)
  const totals = closures.reduce((acc, c) => ({
    orders: acc.orders + (c.total_orders || 0),
    items: acc.items + (c.total_items || 0),
    quantity: acc.quantity + (c.total_quantity || 0),
    revenue: acc.revenue + (c.total_revenue || 0),
  }), { orders: 0, items: 0, quantity: 0, revenue: 0 });

  return (
    <Card className="bg-slate-800/50 border-amber-500/30" data-testid="cuisine-day-closures-list">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-amber-400" />
            Clôtures de journée — Chef Cuisinier
            <Badge className="bg-amber-500/20 text-amber-200">{closures.length}</Badge>
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 text-[10px] text-slate-400">
              <Calendar className="w-3.5 h-3.5" /> du
            </div>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                   className="bg-slate-900 border-slate-700 h-8 text-xs w-[140px]" data-testid="closures-date-from" />
            <span className="text-[10px] text-slate-400">au</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                   className="bg-slate-900 border-slate-700 h-8 text-xs w-[140px]" data-testid="closures-date-to" />
            <Button variant="ghost" size="sm" onClick={fetchClosures} disabled={loading}
                    className="text-slate-300 h-8 text-[11px]" data-testid="closures-refresh">
              {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              Actualiser
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      {/* Résumé agrégé */}
      {closures.length > 0 && (
        <CardContent className="pt-0 pb-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="closures-aggregate">
            <div className="bg-slate-900/60 rounded p-2 text-center border border-slate-700">
              <p className="text-[9px] text-slate-400 uppercase tracking-wider">Bons</p>
              <p className="text-xl font-black text-amber-300">{totals.orders}</p>
            </div>
            <div className="bg-slate-900/60 rounded p-2 text-center border border-slate-700">
              <p className="text-[9px] text-slate-400 uppercase tracking-wider">Lignes</p>
              <p className="text-xl font-black text-cyan-300">{totals.items}</p>
            </div>
            <div className="bg-slate-900/60 rounded p-2 text-center border border-slate-700">
              <p className="text-[9px] text-slate-400 uppercase tracking-wider">Plats préparés</p>
              <p className="text-xl font-black text-emerald-300">{Math.round(totals.quantity)}</p>
            </div>
            <div className="bg-slate-900/60 rounded p-2 text-center border border-slate-700">
              <p className="text-[9px] text-slate-400 uppercase tracking-wider">CA cuisine</p>
              <p className="text-xl font-black text-purple-300">{fmt(totals.revenue)} F</p>
            </div>
          </div>
        </CardContent>
      )}

      <CardContent className="space-y-2">
        {closures.length === 0 && !loading && (
          <p className="text-slate-500 italic text-center py-6 text-sm" data-testid="closures-empty">
            Aucune clôture de journée transmise par le Chef pour la période sélectionnée.
          </p>
        )}
        {closures.map((c) => (
          <div key={c.id}
               className="bg-slate-900/60 border border-slate-700 rounded-lg p-3 text-xs hover:border-amber-500/40 transition cursor-pointer"
               onClick={() => openDetail(c)}
               data-testid={`closure-row-${c.id}`}>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <ChefHat className="w-4 h-4 text-amber-400" />
                  <span className="font-bold text-slate-100">{c.closed_by}</span>
                  <Badge className="bg-slate-700 text-slate-200 text-[10px]">
                    {(() => {
                      try { return format(new Date(c.date + "T00:00:00"), "EEE d MMM yyyy", { locale: fr }); }
                      catch { return c.date; }
                    })()}
                  </Badge>
                  <Badge className="bg-emerald-500/30 text-emerald-200 text-[10px]">
                    <Lock className="w-2.5 h-2.5 mr-0.5" />
                    Clôturé {c.closed_at ? format(new Date(c.closed_at), "HH:mm") : ""}
                  </Badge>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap gap-x-3">
                  <span><strong className="text-amber-300">{c.total_orders}</strong> bon{c.total_orders > 1 ? "s" : ""}</span>
                  <span>· <strong className="text-cyan-300">{c.total_items}</strong> ligne{c.total_items > 1 ? "s" : ""}</span>
                  <span>· <strong className="text-emerald-300">{Math.round(c.total_quantity || 0)}</strong> plat{c.total_quantity > 1 ? "s" : ""}</span>
                  <span>· <strong className="text-purple-300">{fmt(c.total_revenue)}</strong> F</span>
                </div>
                {c.top_items && c.top_items.length > 0 && (
                  <p className="text-[10px] text-slate-500 mt-1 truncate">
                    <Trophy className="w-3 h-3 inline mr-0.5 text-amber-500" />
                    Top : {c.top_items.slice(0, 3).map(t => `${t.name} (×${Math.round(t.quantity)})`).join(", ")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="ghost" className="text-cyan-300 h-7 text-[10px]">
                  <Eye className="w-3 h-3 mr-1" /> Voir détail
                </Button>
                <Button size="sm" variant="ghost"
                        onClick={(e) => deleteClosure(e, c)}
                        className="text-rose-400 hover:text-rose-300 h-7 w-7 p-0"
                        data-testid={`closure-delete-${c.id}`}
                        title="Supprimer (admin)">
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>

      {/* MODAL — Détail d'une clôture */}
      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="max-w-4xl w-[98vw] max-h-[92vh] bg-slate-900 border-amber-500/40 text-white p-0 overflow-hidden">
          <DialogHeader className="p-3 border-b border-slate-700">
            <DialogTitle className="text-sm flex items-center gap-2">
              <ChefHat className="w-4 h-4 text-amber-400" />
              Clôture Cuisine — {detail?.date} — {detail?.closed_by}
            </DialogTitle>
          </DialogHeader>
          <div className="p-3 overflow-y-auto max-h-[calc(92vh-60px)] space-y-3">
            {detailLoading && (
              <div className="text-center py-6">
                <Loader2 className="w-5 h-5 mx-auto animate-spin text-slate-400" />
              </div>
            )}
            {detail && !detailLoading && (
              <>
                {/* Totaux */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-slate-800/60 rounded p-2 text-center border border-slate-700">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider">Bons</p>
                    <p className="text-2xl font-black text-amber-300">{detail.total_orders || 0}</p>
                  </div>
                  <div className="bg-slate-800/60 rounded p-2 text-center border border-slate-700">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider">Lignes</p>
                    <p className="text-2xl font-black text-cyan-300">{detail.total_items || 0}</p>
                  </div>
                  <div className="bg-slate-800/60 rounded p-2 text-center border border-slate-700">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider">Plats</p>
                    <p className="text-2xl font-black text-emerald-300">{Math.round(detail.total_quantity || 0)}</p>
                  </div>
                  <div className="bg-slate-800/60 rounded p-2 text-center border border-slate-700">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider">CA cuisine</p>
                    <p className="text-xl font-black text-purple-300">{fmt(detail.total_revenue)} F</p>
                  </div>
                </div>

                {/* Top items */}
                {detail.top_items && detail.top_items.length > 0 && (
                  <Card className="bg-slate-800/40 border-amber-500/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-amber-400" />
                        Top plats préparés
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {detail.top_items.map((it, i) => (
                          <div key={i} className="flex items-center justify-between bg-slate-900/50 rounded px-2.5 py-1.5 text-xs border border-slate-700">
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span className="text-amber-400 font-bold w-5">{i + 1}.</span>
                              <span className="truncate text-slate-100">{it.name}</span>
                            </span>
                            <Badge className="bg-amber-500/30 text-amber-200 text-[10px] shrink-0">
                              ×{Math.round(it.quantity)}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Détail par bon */}
                <Card className="bg-slate-800/40 border-slate-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="w-4 h-4 text-cyan-400" />
                      Détail des {detail.orders?.length || 0} bon{(detail.orders?.length || 0) > 1 ? "s" : ""}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(detail.orders || []).map((o, idx) => (
                      <div key={o.table_id || idx} className="border border-slate-700 bg-slate-900/40 rounded p-2 text-xs" data-testid={`closure-detail-order-${idx}`}>
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge className="bg-amber-500/20 text-amber-200">
                            <Hash className="w-3 h-3 mr-0.5 inline" /> T{o.table_number}
                          </Badge>
                          {o.server_name && <span className="text-[10px] text-slate-400">Agent : {o.server_name}</span>}
                          {o.client_name && <span className="text-[10px] text-slate-400">Client : {o.client_name}</span>}
                          {o.all_ready_at && (
                            <Badge className="bg-emerald-500/20 text-emerald-200 text-[10px] ml-auto">
                              <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                              Prêt {format(new Date(o.all_ready_at), "HH:mm")}
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5">
                          {(o.items || []).map((it, j) => (
                            <div key={j} className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-200 truncate flex items-center gap-1">
                                {it.ready_at ? (
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                ) : (
                                  <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                                )}
                                {it.name}
                              </span>
                              <span className="text-slate-400 font-mono shrink-0 ml-2">×{Math.round(it.quantity)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default CuisineDayClosuresList;
