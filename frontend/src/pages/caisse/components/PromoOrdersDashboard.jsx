/**
 * PromoOrdersDashboard — Dashboard Admin listant les réservations issues
 * des packs Promo Vacances. Permet d'appeler/WhatsApper directement le client.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Input } from "../../../components/ui/input";
import { Phone, MessageCircle, RefreshCw, Search, ShoppingBag } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const formatFCFA = (n) => new Intl.NumberFormat("fr-FR").format(n || 0);

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function buildWhatsAppLink(phone, packTitle) {
  const clean = String(phone || "").replace(/[^\d+]/g, "");
  const msg = encodeURIComponent(`Bonjour ! Concernant votre réservation du « ${packTitle} » à Espace Maxo…`);
  return `https://wa.me/${clean}?text=${msg}`;
}

export default function PromoOrdersDashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [packs, setPacks] = useState([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [o, p] = await Promise.all([
        axios.get(`${API}/promo-vacances/orders?limit=500`),
        axios.get(`${API}/promo-vacances`),
      ]);
      setOrders(o.data?.orders || []);
      setPacks(p.data?.packs || []);
    } catch (_) {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 60000);
    return () => clearInterval(t);
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) =>
      [o.customer_name, o.customer_phone, o.pack_title, o.date]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [orders, search]);

  const countsByPack = useMemo(() => {
    const acc = {};
    for (const o of orders) {
      acc[o.pack_id] = (acc[o.pack_id] || 0) + 1;
    }
    return acc;
  }, [orders]);

  return (
    <Card className="bg-gradient-to-br from-slate-900/80 to-amber-950/20 border-amber-500/30" data-testid="promo-orders-dashboard">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-amber-300 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5" />
            Commandes Promo Vacances
            <Badge className="bg-amber-500/20 text-amber-200 ml-2">{orders.length}</Badge>
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={fetchAll}
            disabled={loading}
            className="border-amber-500/40 text-amber-200 hover:bg-amber-500/10"
            data-testid="promo-orders-refresh"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Compteurs par pack */}
        {packs.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {packs.map((p) => (
              <div
                key={p.id}
                className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-2 flex items-center gap-2"
                data-testid={`promo-orders-pack-${p.id}`}
              >
                <img src={p.image} alt={p.title} className="w-9 h-9 rounded object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-white font-semibold truncate">{p.title}</p>
                  <p className="text-[10px] text-amber-200">
                    {countsByPack[p.id] || 0} commande(s)
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recherche */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, téléphone, pack…"
            className="pl-8 bg-slate-800 border-slate-700 text-white"
            data-testid="promo-orders-search"
          />
        </div>

        {/* Liste */}
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            {orders.length === 0
              ? "Aucune commande de pack pour l'instant."
              : "Aucune commande ne correspond à votre recherche."}
          </div>
        ) : (
          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {filtered.map((o) => (
              <div
                key={o.id}
                className="bg-slate-800/60 border border-slate-700/40 rounded-lg p-3 flex items-start justify-between gap-3 flex-wrap"
                data-testid={`promo-order-${o.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white font-semibold truncate">{o.customer_name || "—"}</p>
                    <Badge className="bg-amber-500/20 text-amber-200 text-[10px]">
                      {o.pack_title}
                    </Badge>
                    {o.pack_price && (
                      <span className="text-emerald-300 text-xs font-semibold">
                        {formatFCFA(o.pack_price)} F
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {o.customer_phone || "—"}
                    {o.date && ` · ${o.date}`}
                    {o.time_slot && ` · ${o.time_slot}`}
                    {typeof o.party_size === "number" && ` · ${o.party_size} pers.`}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Reçue le {fmtDate(o.created_at)}
                  </p>
                  {o.notes && (
                    <p className="text-[11px] text-slate-300/80 mt-1 italic">{o.notes}</p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {o.customer_phone && (
                    <>
                      <a
                        href={`tel:${o.customer_phone}`}
                        data-testid={`promo-order-call-${o.id}`}
                      >
                        <Button size="sm" variant="outline" className="border-slate-600 text-slate-200">
                          <Phone className="w-4 h-4" />
                        </Button>
                      </a>
                      <a
                        href={buildWhatsAppLink(o.customer_phone, o.pack_title)}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`promo-order-whatsapp-${o.id}`}
                      >
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                          <MessageCircle className="w-4 h-4" />
                        </Button>
                      </a>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
