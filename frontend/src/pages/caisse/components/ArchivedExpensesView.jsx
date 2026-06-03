/**
 * ArchivedExpensesView — Dossier "Archives" visible dans l'onglet Achats (Admin).
 *
 * Liste tous les achats archivés via la "Remise à zéro" Admin
 * (flag `archived=true`). Permet de :
 *   - Consulter chaque ligne d'achat archivé avec métadonnées
 *     (qui a archivé, quand, statut au moment de l'archivage)
 *   - Restaurer un ou plusieurs achats individuellement
 *   - Voir les totaux groupés par mois
 *
 * Source des données : GET /api/expenses?only_archived=true
 */
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Archive, RotateCcw, RefreshCw, Loader2, FileText, ShieldAlert } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatPrice = (p) => new Intl.NumberFormat("fr-FR").format(p || 0);

const ArchivedExpensesView = ({ currentUser }) => {
  const isAdmin = currentUser?.role === "admin";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [restoring, setRestoring] = useState(false);

  const fetchArchived = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/expenses`, {
        params: { only_archived: true },
      });
      const list = Array.isArray(r.data) ? r.data : r.data.expenses || [];
      list.sort((a, b) =>
        String(b.archived_at || b.created_at || "").localeCompare(
          String(a.archived_at || a.created_at || "")
        )
      );
      setItems(list);
    } catch (e) {
      toast.error("Erreur chargement des archives");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchArchived();
  }, [fetchArchived, isAdmin]);

  if (!isAdmin) {
    return (
      <Card className="bg-rose-950/30 border-rose-500/40">
        <CardContent className="py-8 text-center text-rose-300 text-sm">
          <ShieldAlert className="w-8 h-8 mx-auto mb-2" />
          Dossier réservé à l'administrateur.
        </CardContent>
      </Card>
    );
  }

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((e) => e.id)));
  };

  const restoreSelected = async () => {
    if (selected.size === 0) return;
    setRestoring(true);
    try {
      const r = await axios.post(`${API}/admin/maintenance/restore-one`, {
        ids: Array.from(selected),
        actor_role: "admin",
        actor_name: currentUser?.full_name || currentUser?.username || "Admin",
      });
      toast.success(`${r.data.restored} achat(s) restauré(s)`);
      setSelected(new Set());
      fetchArchived();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de la restauration");
    } finally {
      setRestoring(false);
    }
  };

  // Groupement par mois d'archivage (yyyy-MM)
  const groups = items.reduce((acc, e) => {
    const d = e.archived_at || e.created_at || "";
    const key = d ? d.slice(0, 7) : "—";
    if (!acc[key]) acc[key] = { month: key, items: [], total: 0 };
    acc[key].items.push(e);
    acc[key].total += e.amount || 0;
    return acc;
  }, {});
  const groupKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  const grandTotal = items.reduce((s, e) => s + (e.amount || 0), 0);

  return (
    <div className="space-y-3" data-testid="archived-expenses-view">
      {/* Header / summary */}
      <Card className="bg-gradient-to-br from-slate-900/60 to-slate-800/40 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-slate-200 flex items-center justify-between gap-2 flex-wrap text-base">
            <div className="flex items-center gap-2">
              <Archive className="w-5 h-5 text-amber-300" />
              Dossier Archives — Achats
              <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px]">
                {items.length} ligne{items.length > 1 ? "s" : ""}
              </Badge>
              <Badge className="bg-slate-700/60 text-slate-200 text-[10px]">
                Total : {formatPrice(grandTotal)} F
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchArchived}
                disabled={loading}
                className="border-slate-600 text-slate-300"
                data-testid="archived-refresh-btn"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                Actualiser
              </Button>
              <Button
                size="sm"
                onClick={toggleAll}
                variant="outline"
                disabled={items.length === 0}
                className="border-slate-600 text-slate-300"
                data-testid="archived-toggle-all-btn"
              >
                {selected.size === items.length && items.length > 0 ? "Tout décocher" : "Tout cocher"}
              </Button>
              <Button
                size="sm"
                onClick={restoreSelected}
                disabled={selected.size === 0 || restoring}
                className="bg-emerald-600 hover:bg-emerald-700"
                data-testid="archived-restore-btn"
              >
                {restoring ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Restauration…</>
                ) : (
                  <><RotateCcw className="w-4 h-4 mr-1" /> Restaurer la sélection ({selected.size})</>
                )}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-[11px] text-slate-400 pt-2 border-t border-slate-700/50">
          Ces achats ont été archivés via la fonction "Remise à zéro" Admin. Ils
          n'apparaissent plus dans les totaux (statistiques, compte courant) mais
          restent ici pour consultation et restauration éventuelle.
        </CardContent>
      </Card>

      {/* Listing groupé par mois */}
      {items.length === 0 ? (
        <Card className="bg-slate-800/30 border-slate-700">
          <CardContent className="py-12 text-center">
            <Archive className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-500">Aucun achat archivé pour l'instant.</p>
            <p className="text-slate-600 text-xs mt-1">
              Lorsque tu cliques sur "Archiver les achats" (bouton rouge), tous
              les achats actifs s'y retrouvent.
            </p>
          </CardContent>
        </Card>
      ) : (
        groupKeys.map((key) => {
          const g = groups[key];
          return (
            <Card key={key} className="bg-slate-800/30 border-slate-700">
              <CardHeader className="pb-1">
                <CardTitle className="text-slate-200 text-sm flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400" />
                    Archivé{g.items.length > 1 ? "s" : ""} en {key === "—" ? "période inconnue" : (
                      (() => {
                        try { return format(parseISO(key + "-01"), "MMMM yyyy", { locale: fr }); }
                        catch { return key; }
                      })()
                    )}
                    <Badge className="text-[10px] bg-slate-700/60 text-slate-200">
                      {g.items.length}
                    </Badge>
                  </span>
                  <span className="text-amber-300 text-xs font-bold">
                    {formatPrice(g.total)} F
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {g.items.map((e) => (
                  <div
                    key={e.id}
                    className={`flex items-center gap-2 p-2 rounded border ${
                      selected.has(e.id)
                        ? "bg-emerald-900/20 border-emerald-500/50"
                        : "bg-slate-900/40 border-slate-700/50"
                    }`}
                    data-testid={`archived-expense-${e.id}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(e.id)}
                      onChange={() => toggle(e.id)}
                      className="w-4 h-4 accent-emerald-500 cursor-pointer flex-shrink-0"
                      data-testid={`archived-select-${e.id}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white text-sm font-medium truncate">
                          {e.description || "—"}
                        </span>
                        {e.category && (
                          <Badge className="text-[10px] bg-slate-700/60 text-slate-300">
                            {e.category}
                          </Badge>
                        )}
                        {e.status && (
                          <Badge className="text-[10px] bg-amber-500/20 text-amber-300">
                            {e.status}
                          </Badge>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 flex flex-wrap gap-x-3">
                        {e.created_at && (
                          <span>
                            Créé le {format(parseISO(e.created_at), "dd/MM/yyyy", { locale: fr })}
                          </span>
                        )}
                        {e.archived_at && (
                          <span>
                            Archivé le {format(parseISO(e.archived_at), "dd/MM/yyyy HH:mm", { locale: fr })}
                            {e.archived_by ? ` par ${e.archived_by}` : ""}
                          </span>
                        )}
                        {e.requested_by && (
                          <span>Demandé par {e.requested_by}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-amber-300 font-bold text-sm whitespace-nowrap">
                      {formatPrice(e.amount)} F
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
};

export default ArchivedExpensesView;
