/**
 * SiteNotificationsPanel — Vue tableau de bord Admin regroupant
 * toutes les notifications du site public sous forme de cartes
 * rectangulaires (grille responsive).
 *
 * Affiche à la fois :
 *   • Compteurs par catégorie en haut (5 mini-cartes)
 *   • Grille de cartes rectangulaires : chaque notification = 1 carte
 *   • Recherche + filtres par type + bouton "Tout lire"
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Calendar,
  ShoppingBag,
  Star,
  Wallet,
  UserPlus,
  Globe,
  Check,
  Bell,
  RefreshCw,
  Search,
  Phone,
  MessageCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Input } from "../../../components/ui/input";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TYPE_META = {
  booking: {
    label: "Réservation",
    icon: Calendar,
    color: "sky",
    tw: "from-sky-500/15 to-sky-900/10 border-sky-500/40 text-sky-300",
    badge: "bg-sky-500/20 text-sky-200 border-sky-500/40",
  },
  promo_order: {
    label: "Pack Promo",
    icon: ShoppingBag,
    color: "amber",
    tw: "from-amber-500/15 to-amber-900/10 border-amber-500/40 text-amber-300",
    badge: "bg-amber-500/20 text-amber-200 border-amber-500/40",
  },
  review: {
    label: "Avis client",
    icon: Star,
    color: "yellow",
    tw: "from-yellow-500/15 to-yellow-900/10 border-yellow-500/40 text-yellow-200",
    badge: "bg-yellow-500/20 text-yellow-200 border-yellow-500/40",
  },
  wallet: {
    label: "Mobile Money",
    icon: Wallet,
    color: "emerald",
    tw: "from-emerald-500/15 to-emerald-900/10 border-emerald-500/40 text-emerald-300",
    badge: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
  },
  join: {
    label: "Candidature",
    icon: UserPlus,
    color: "violet",
    tw: "from-violet-500/15 to-violet-900/10 border-violet-500/40 text-violet-300",
    badge: "bg-violet-500/20 text-violet-200 border-violet-500/40",
  },
};

const SUMMARY_KEY_BY_TYPE = {
  booking: "bookings",
  promo_order: "promo_orders",
  review: "reviews",
  wallet: "wallets",
  join: "joins",
};

const fmtDate = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "";
  }
};

const formatFCFA = (n) => new Intl.NumberFormat("fr-FR").format(n || 0);

const buildWaLink = (phone, title) => {
  const clean = String(phone || "").replace(/[^\d+]/g, "");
  const msg = encodeURIComponent(`Bonjour ! Concernant votre ${title} chez Espace Maxo…`);
  return `https://wa.me/${clean}?text=${msg}`;
};

const extractPhone = (subtitle) => {
  if (!subtitle) return null;
  const m = String(subtitle).match(/(?:\+229)?[\s.-]?(\d{8,10})/);
  return m ? m[0].replace(/[\s.-]/g, "") : null;
};

export default function SiteNotificationsPanel({ actorName = "Admin" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/admin/site-notifications?since_hours=168&limit_per_type=50`);
      setData(data);
    } catch (_) {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 60000);
    return () => clearInterval(t);
  }, [fetchData]);

  const markOne = async (item) => {
    try {
      await axios.post(`${API}/admin/site-notifications/mark-read`, {
        type: item.type,
        id: item.id,
        actor_name: actorName,
      });
      await fetchData();
    } catch (_) {
      /* silent */
    }
  };

  const markAll = async () => {
    if (!window.confirm("Marquer toutes les notifications du site (7 derniers jours) comme lues ?")) return;
    try {
      const { data } = await axios.post(`${API}/admin/site-notifications/mark-all-read`, {
        since_hours: 168,
        actor_name: actorName,
      });
      toast.success(`${data?.marked || 0} notification(s) marquée(s) comme lue(s)`);
      await fetchData();
    } catch (_) {
      toast.error("Erreur");
    }
  };

  const items = useMemo(() => {
    if (!data) return [];
    let list = data.items || [];
    if (filterType !== "all") {
      list = list.filter((i) => i.type === filterType);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((i) =>
        [i.title, i.subtitle].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
      );
    }
    return list;
  }, [data, filterType, search]);

  if (!data) {
    return (
      <Card className="bg-slate-900/60 border-slate-700/60">
        <CardContent className="py-10 text-center text-slate-400 text-sm">
          Chargement des notifications…
        </CardContent>
      </Card>
    );
  }

  const unread = data?.summary?.unread_total || 0;

  return (
    <div className="space-y-4" data-testid="site-notifications-panel">
      {/* Compteurs en mini-cartes */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {Object.entries(TYPE_META).map(([k, meta]) => {
          const sumKey = SUMMARY_KEY_BY_TYPE[k];
          const sum = data.summary?.[sumKey] || { total: 0, unread: 0 };
          const Icon = meta.icon;
          const active = filterType === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setFilterType(active ? "all" : k)}
              className={`text-left rounded-xl border bg-gradient-to-br ${meta.tw} p-3 transition-all hover:scale-[1.02] ${
                active ? "ring-2 ring-white/40" : ""
              }`}
              data-testid={`notif-counter-${k}`}
            >
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4" />
                <span className="text-[11px] uppercase font-bold tracking-wider">{meta.label}</span>
              </div>
              <p className="text-2xl font-orbitron font-black mt-1 leading-none text-white">
                {sum.total}
              </p>
              {sum.unread > 0 && (
                <Badge className="bg-red-500/90 text-white text-[10px] mt-1">
                  {sum.unread} non lu(s)
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Header avec actions */}
      <Card className="bg-gradient-to-br from-slate-900/60 to-emerald-950/20 border-emerald-500/30">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-emerald-300 flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Notifications · espacemaxo.com
              {unread > 0 && (
                <Badge className="bg-red-500 text-white ml-2" data-testid="site-panel-unread-count">
                  {unread} non lu(s)
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={fetchData}
                disabled={loading}
                className="border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10"
                data-testid="site-panel-refresh"
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
                Actualiser
              </Button>
              {unread > 0 && (
                <Button
                  size="sm"
                  onClick={markAll}
                  className="bg-emerald-600 hover:bg-emerald-700"
                  data-testid="site-panel-mark-all"
                >
                  <Check className="w-4 h-4 mr-1" />
                  Tout marquer comme lu
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Recherche */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, téléphone, pack…"
              className="pl-8 bg-slate-800 border-slate-700 text-white"
              data-testid="site-panel-search"
            />
          </div>

          {/* Grille de cartes rectangulaires */}
          {items.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              {(data.items || []).length === 0
                ? "Aucune notification dans les 7 derniers jours."
                : "Aucun résultat ne correspond à votre recherche."}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {items.map((it) => {
                const meta = TYPE_META[it.type] || {
                  label: it.type,
                  icon: Bell,
                  tw: "from-slate-700/20 to-slate-900/10 border-slate-600/40 text-slate-300",
                  badge: "bg-slate-700 text-slate-200",
                };
                const Icon = meta.icon;
                const phone = extractPhone(it.subtitle);
                return (
                  <div
                    key={`${it.type}-${it.id}`}
                    className={`rounded-xl border bg-gradient-to-br ${meta.tw} p-3 flex flex-col gap-2 transition-all ${
                      !it.read ? "ring-1 ring-emerald-400/50 shadow-[0_0_20px_rgba(16,185,129,0.15)]" : "opacity-90"
                    }`}
                    data-testid={`site-panel-item-${it.type}-${it.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Badge className={`${meta.badge} text-[10px] uppercase tracking-wider`}>
                        <Icon className="w-3 h-3 mr-1" />
                        {meta.label}
                      </Badge>
                      {!it.read && (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-300 font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          NOUVEAU
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm truncate">{it.title}</p>
                      <p className="text-xs text-slate-300/90 mt-0.5 break-words line-clamp-3">
                        {it.subtitle}
                      </p>
                      {it.amount ? (
                        <p className="text-amber-300 font-orbitron font-bold text-base mt-1.5">
                          {formatFCFA(it.amount)} F
                        </p>
                      ) : null}
                    </div>
                    <p className="text-[10px] text-slate-500">{fmtDate(it.created_at)}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {phone && (
                        <>
                          <a href={`tel:${phone}`} title="Appeler" data-testid={`site-panel-call-${it.id}`}>
                            <Button size="sm" variant="outline" className="h-7 w-7 p-0 border-slate-600 text-slate-200">
                              <Phone className="w-3.5 h-3.5" />
                            </Button>
                          </a>
                          <a
                            href={buildWaLink(phone, it.title || meta.label)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="WhatsApp"
                            data-testid={`site-panel-wa-${it.id}`}
                          >
                            <Button size="sm" className="h-7 w-7 p-0 bg-emerald-600 hover:bg-emerald-700">
                              <MessageCircle className="w-3.5 h-3.5" />
                            </Button>
                          </a>
                        </>
                      )}
                      <div className="flex-1" />
                      {!it.read && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => markOne(it)}
                          className="h-7 px-2 text-[11px] text-emerald-300 hover:bg-emerald-500/10"
                          data-testid={`site-panel-mark-${it.id}`}
                        >
                          <Check className="w-3.5 h-3.5 mr-1" />
                          Marquer lu
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
