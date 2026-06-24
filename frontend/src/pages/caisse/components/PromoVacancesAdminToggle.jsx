/**
 * PromoVacancesAdminToggle — Mini panneau Admin pour activer/désactiver
 * la section "Promo Vacances Maxo" affichée sur le site public.
 *
 * Affiche aussi un compteur des commandes de packs déjà enregistrées.
 */
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Switch } from "../../../components/ui/switch";
import { Sparkles, Flame, ShoppingBag } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function PromoVacancesAdminToggle({ actorName = "Admin" }) {
  const [active, setActive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ordersCount, setOrdersCount] = useState(0);
  const [packs, setPacks] = useState([]);

  const fetchData = useCallback(async () => {
    try {
      const [s, o] = await Promise.all([
        axios.get(`${API}/promo-vacances`),
        axios.get(`${API}/promo-vacances/orders?limit=500`).catch(() => ({ data: { orders: [] } })),
      ]);
      setActive(!!s.data?.active);
      setPacks(s.data?.packs || []);
      setOrdersCount((o.data?.orders || []).length);
    } catch (_) {
      setActive(true);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onToggle = async (next) => {
    setBusy(true);
    try {
      await axios.put(`${API}/promo-vacances/toggle`, { active: !!next, actor_name: actorName });
      setActive(!!next);
      toast.success(next ? "Promo Vacances activée sur le site public" : "Promo Vacances désactivée");
    } catch (e) {
      toast.error("Erreur lors du basculement");
    } finally {
      setBusy(false);
    }
  };

  if (active === null) return null;

  return (
    <Card
      className="bg-gradient-to-br from-amber-900/20 to-rose-900/15 border-amber-500/40"
      data-testid="promo-vacances-admin-card"
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-amber-300 flex items-center gap-2 flex-wrap">
          <Sparkles className="w-5 h-5" />
          Promo Vacances Maxo
          <Badge
            className={
              active
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : "bg-slate-700/60 text-slate-300 border border-slate-500/40"
            }
            data-testid="promo-vacances-status-badge"
          >
            {active ? "Affichée sur le site" : "Masquée"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Switch
              checked={active}
              onCheckedChange={onToggle}
              disabled={busy}
              data-testid="promo-vacances-toggle"
            />
            <span className="text-sm text-slate-200">
              {active
                ? "La promo est visible par tous les clients sur la page d'accueil."
                : "La promo est masquée. Activez-la pour la rendre visible."}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-slate-700/50 text-slate-200">
              <ShoppingBag className="w-3 h-3 mr-1" />
              {ordersCount} commandes
            </Badge>
            <Badge className="bg-slate-700/50 text-slate-200">
              <Flame className="w-3 h-3 mr-1" />
              {packs.length} packs
            </Badge>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {packs.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 bg-slate-800/60 border border-slate-700/60 rounded-lg p-2"
            >
              <img src={p.image} alt={p.title} className="w-10 h-10 rounded object-cover" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white font-semibold truncate">{p.title}</p>
                <p className="text-[10px] text-slate-400">
                  {p.price ? `${new Intl.NumberFormat("fr-FR").format(p.price)} F` : "—"}
                  {p.limit_100_first && " · 100 premières"}
                </p>
              </div>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          disabled={busy}
          className="border-amber-500/40 text-amber-200 hover:bg-amber-500/10"
          data-testid="promo-vacances-refresh"
        >
          Actualiser
        </Button>
      </CardContent>
    </Card>
  );
}
