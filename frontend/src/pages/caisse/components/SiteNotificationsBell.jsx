/**
 * SiteNotificationsBell — Cloche Admin unifiée pour les notifications du site
 * public (www.espacemaxo.com) :
 *   • Réservations de table (BookingPage)
 *   • Commandes packs promo
 *   • Avis clients
 *   • Provisions Mobile Money / wallet
 *   • Candidatures "Nous rejoindre"
 *
 * Affiche un badge avec le compteur global "unread" + dropdown avec onglets.
 * Polling 60s.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Bell, BellRing, Calendar, ShoppingBag, Star, Wallet, UserPlus, Globe, Check } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TYPE_META = {
  booking: { label: "Réservations", icon: Calendar, color: "text-sky-300" },
  promo_order: { label: "Packs Promo", icon: ShoppingBag, color: "text-amber-300" },
  review: { label: "Avis", icon: Star, color: "text-yellow-300" },
  wallet: { label: "Mobile Money", icon: Wallet, color: "text-emerald-300" },
  join: { label: "Candidatures", icon: UserPlus, color: "text-violet-300" },
};

const fmt = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "";
  }
};

export default function SiteNotificationsBell({ actorName = "Admin" }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("all");

  const fetchData = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/admin/site-notifications?since_hours=168&limit_per_type=20`);
      setData(data);
    } catch (_) {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 60000);
    return () => clearInterval(t);
  }, [fetchData]);

  const unread = data?.summary?.unread_total || 0;

  const items = useMemo(() => {
    if (!data) return [];
    if (tab === "all") return data.items || [];
    return (data.by_type?.[tab + "s"] || data.by_type?.[tab] || []);
  }, [data, tab]);

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
    try {
      await axios.post(`${API}/admin/site-notifications/mark-all-read`, {
        since_hours: 168,
        actor_name: actorName,
      });
      toast.success("Toutes les notifications du site marquées comme lues");
      await fetchData();
    } catch (_) {
      toast.error("Erreur lors du marquage");
    }
  };

  if (!data) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10 hidden sm:inline-flex"
          data-testid="site-notifications-bell"
          title="Notifications du site public"
        >
          <Globe className="w-4 h-4 mr-1" />
          {unread > 0 ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
          {unread > 0 && (
            <Badge
              className="absolute -top-2 -right-2 bg-red-500 text-white px-1.5 py-0 text-[10px] min-w-[18px] h-[18px] flex items-center justify-center rounded-full"
              data-testid="site-notifications-count"
            >
              {unread > 99 ? "99+" : unread}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[420px] sm:w-[480px] bg-slate-900 border-slate-700 text-white p-0 max-h-[80vh] overflow-hidden"
        align="end"
      >
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
          <div>
            <p className="font-bold text-emerald-300 text-sm flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Notifications · espacemaxo.com
            </p>
            <p className="text-[11px] text-slate-400">7 derniers jours</p>
          </div>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAll}
              className="text-[11px] text-emerald-300 hover:bg-emerald-500/10"
              data-testid="site-notifications-mark-all"
            >
              <Check className="w-3 h-3 mr-1" /> Tout lire
            </Button>
          )}
        </div>

        <Tabs value={tab} onValueChange={setTab} className="px-2 py-2">
          <TabsList className="grid grid-cols-6 bg-slate-800 h-8">
            <TabsTrigger value="all" className="text-[10px] data-[state=active]:bg-emerald-500/20">
              Tout
              {unread > 0 && <Badge className="ml-1 bg-red-500 text-white text-[9px] px-1 py-0">{unread}</Badge>}
            </TabsTrigger>
            {Object.entries(TYPE_META).map(([k, meta]) => {
              const sk = k + (k === "wallet" ? "s" : k.endsWith("s") ? "" : "s");
              const sum = data.summary?.[sk] || data.summary?.[k + "s"] || data.summary?.[k] || { total: 0, unread: 0 };
              const Icon = meta.icon;
              return (
                <TabsTrigger
                  key={k}
                  value={k}
                  className={`text-[10px] data-[state=active]:bg-emerald-500/20 ${meta.color}`}
                  data-testid={`site-notif-tab-${k}`}
                >
                  <Icon className="w-3 h-3" />
                  {sum.unread > 0 && (
                    <Badge className="ml-0.5 bg-red-500 text-white text-[9px] px-1 py-0">{sum.unread}</Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value={tab} className="mt-2 overflow-y-auto max-h-[60vh]">
            {items.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-sm">
                Aucune notification dans les 7 derniers jours.
              </div>
            ) : (
              <div className="space-y-1.5">
                {items.map((it) => {
                  const meta = TYPE_META[it.type] || { label: it.type, icon: Bell, color: "text-slate-300" };
                  const Icon = meta.icon;
                  return (
                    <div
                      key={`${it.type}-${it.id}`}
                      onClick={() => markOne(it)}
                      className={`p-2.5 rounded-lg cursor-pointer transition-colors border ${
                        it.read
                          ? "bg-slate-800/40 border-transparent hover:bg-slate-800/70"
                          : "bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/15"
                      }`}
                      data-testid={`site-notif-item-${it.type}-${it.id}`}
                    >
                      <div className="flex items-start gap-2">
                        <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${meta.color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className={`font-semibold truncate text-xs ${it.read ? "text-slate-300" : "text-white"}`}>
                              {it.title}
                            </p>
                            <span className="text-[10px] text-slate-500 flex-shrink-0">{fmt(it.created_at)}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5 break-words">{it.subtitle}</p>
                          <div className="flex items-center gap-1 mt-1">
                            <Badge className={`text-[9px] px-1.5 py-0 ${meta.color} bg-slate-800/80 border border-slate-700`}>
                              {meta.label}
                            </Badge>
                            {it.amount ? (
                              <Badge className="text-[9px] px-1.5 py-0 bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                {new Intl.NumberFormat("fr-FR").format(it.amount)} F
                              </Badge>
                            ) : null}
                            {!it.read && (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-1" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
