/**
 * KitchenTrackerModal — Suivi temps réel des commandes en cuisine pour Resp. Op.
 *
 * - Liste des bons cuisine du jour avec statut par plat (4 états):
 *     received → in_progress → ready → served
 * - Boutons "Servi" par item (Resp. Op. confirme)
 * - Envoi de formules préenregistrées au cuisinier
 * - Réception des réponses du cuisinier (avec bip Web Audio API)
 * - Polling 5s, badge compteur de messages non lus
 */
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChefHat, MessageSquare, Send, CheckCircle2, Clock, Flame,
  Hash, RefreshCw, Loader2, BellRing,
} from "lucide-react";
import { playBeep } from "../../../lib/notificationBeep";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const POLL_MS = 5000;

const STATUS_META = {
  received:    { label: "Reçu",          color: "bg-slate-600/40 text-slate-200 border-slate-500/50",  icon: Clock      },
  in_progress: { label: "En préparation", color: "bg-amber-600/40 text-amber-100 border-amber-500/60", icon: Flame      },
  ready:       { label: "Prêt",           color: "bg-emerald-600/40 text-emerald-100 border-emerald-500/60", icon: CheckCircle2 },
  served:      { label: "Servi",          color: "bg-blue-600/40 text-blue-100 border-blue-500/60",    icon: BellRing   },
};

const KitchenTrackerModal = ({ open, onOpenChange, currentUser }) => {
  const [orders, setOrders] = useState([]);
  const [messages, setMessages] = useState([]);
  const [presets, setPresets] = useState({ manager_to_cuisinier: [], cuisinier_to_manager: [] });
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [activeTarget, setActiveTarget] = useState(null); // {table_id, table_number, item_name?} for message context
  const lastMsgIdsRef = useRef(new Set());

  const actorRole = currentUser?.role || "manager";
  const actorName = currentUser?.full_name || currentUser?.username || "Resp. Op.";

  const fetchAll = useCallback(async (silent = true) => {
    if (!silent) setLoading(true);
    try {
      const [oRes, mRes] = await Promise.all([
        axios.get(`${API}/cuisine/orders`, { params: { actor_role: actorRole }, timeout: 10000 }),
        axios.get(`${API}/cuisine/messages`, { params: { actor_role: actorRole, since_minutes: 240 }, timeout: 10000 }),
      ]);
      const newOrders = oRes.data.orders || [];
      const newMsgs = mRes.data.messages || [];
      // Detect new incoming messages (bip)
      const currentIds = new Set(newMsgs.map((m) => m.id));
      const incoming = [...currentIds].filter((id) => !lastMsgIdsRef.current.has(id));
      if (lastMsgIdsRef.current.size > 0 && incoming.length > 0) {
        try { playBeep({ freq: 1500, duration: 0.15, volume: 0.7, count: 2, gap: 0.08 }); } catch {}
        const fresh = newMsgs.find((m) => m.id === incoming[0]);
        toast.info(`Cuisinier: ${fresh?.label || "Nouveau message"}`);
      }
      lastMsgIdsRef.current = currentIds;
      setOrders(newOrders);
      setMessages(newMsgs);
    } catch (e) {
      if (!silent) toast.error("Erreur de chargement");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [actorRole]);

  // Fetch presets once when modal opens
  useEffect(() => {
    if (!open) return;
    axios.get(`${API}/cuisine/messages/presets`, { params: { actor_role: actorRole } })
      .then((r) => setPresets(r.data || { manager_to_cuisinier: [], cuisinier_to_manager: [] }))
      .catch(() => {});
  }, [open, actorRole]);

  // Polling while open
  useEffect(() => {
    if (!open) return;
    fetchAll(false);
    const id = setInterval(() => fetchAll(true), POLL_MS);
    return () => clearInterval(id);
  }, [open, fetchAll]);

  const markServed = async (tableId, itemIndex) => {
    try {
      await axios.patch(
        `${API}/cuisine/orders/${tableId}/items/${itemIndex}/served`,
        null,
        { params: { actor_role: actorRole, actor_name: actorName }, timeout: 10000 },
      );
      toast.success("Plat marqué servi");
      fetchAll(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const sendMessage = async (preset) => {
    setSending(true);
    try {
      await axios.post(`${API}/cuisine/messages`, {
        code: preset.code,
        label: preset.label,
        from_role: actorRole,
        from_name: actorName,
        to_role: "cuisinier",
        table_id: activeTarget?.table_id || null,
        table_number: activeTarget?.table_number ?? null,
        item_name: activeTarget?.item_name || null,
      });
      toast.success("Message envoyé au cuisinier");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur d'envoi");
    } finally {
      setSending(false);
    }
  };

  const markAllRead = async () => {
    try {
      await axios.post(`${API}/cuisine/messages/read-all`, null, { params: { actor_role: actorRole } });
      fetchAll(true);
    } catch {}
  };

  const unreadCount = useMemo(() => messages.filter((m) => !m.read_at).length, [messages]);
  const pendingOrders = useMemo(() => orders.filter((o) => !o.all_served), [orders]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[98vw] sm:w-auto max-h-[95vh] sm:max-h-[90vh] bg-slate-900 border-amber-500/40 text-white p-0 overflow-hidden">
        <DialogHeader className="p-2 sm:p-4 border-b border-slate-700 bg-gradient-to-r from-amber-900/50 to-slate-800">
          <DialogTitle className="flex items-center justify-between gap-2 text-sm sm:text-base">
            <span className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
              <ChefHat className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 shrink-0" />
              <span className="truncate">Suivi Cuisine</span>
              <Badge className="bg-amber-500/30 text-amber-100 text-[10px] sm:text-xs">
                {pendingOrders.length} bon(s)
              </Badge>
              {unreadCount > 0 && (
                <Badge className="bg-rose-500 text-white animate-pulse text-[10px] sm:text-xs">
                  {unreadCount} msg
                </Badge>
              )}
            </span>
            <Button variant="ghost" size="sm" onClick={() => fetchAll(false)} disabled={loading}
                    className="text-slate-300 h-7 w-7 sm:h-8 sm:w-8 p-0 shrink-0" data-testid="kitchen-tracker-refresh">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col lg:grid lg:grid-cols-3 gap-2 sm:gap-3 p-2 sm:p-3 overflow-hidden" style={{ height: "calc(95vh - 60px)" }}>
          {/* LEFT — Orders */}
          <ScrollArea className="lg:col-span-2 flex-1 min-h-0 pr-1 sm:pr-2">
            <div className="space-y-3">
              {orders.length === 0 && !loading && (
                <Card className="bg-slate-800/40 border-slate-700">
                  <CardContent className="p-6 text-center">
                    <ChefHat className="w-10 h-10 mx-auto text-slate-500 mb-2" />
                    <p className="text-slate-400 text-sm">Aucun bon cuisine en cours.</p>
                  </CardContent>
                </Card>
              )}

              {orders.map((o) => (
                <Card key={o.id}
                      className={`border ${o.all_served ? "bg-blue-900/20 border-blue-500/40 opacity-70" : "bg-slate-800/60 border-amber-500/30"}`}
                      data-testid={`kt-order-${o.id}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Hash className="w-4 h-4 text-amber-400" />
                        Table {o.table_number}
                        <span className="text-[10px] text-slate-400 ml-2 font-normal">
                          Agent: {o.server_name || "—"}
                        </span>
                      </span>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost"
                                onClick={() => setActiveTarget({ table_id: o.id, table_number: o.table_number, item_name: null })}
                                className="text-amber-300 hover:text-amber-200 h-6 text-[10px] px-2"
                                data-testid={`kt-target-table-${o.id}`}>
                          <MessageSquare className="w-3 h-3 mr-1" /> Cibler ce bon
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5 text-xs">
                    {o.items.map((it) => {
                      const meta = STATUS_META[it.status] || STATUS_META.received;
                      const Icon = meta.icon;
                      return (
                        <div key={it.index}
                             className={`flex items-center gap-2 p-1.5 rounded border ${meta.color}`}>
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span className="flex-1 text-slate-100">{it.name}</span>
                          <Badge className="bg-slate-700 text-slate-300 text-[9px]">x{it.quantity}</Badge>
                          <Badge className={`${meta.color} text-[9px] border`}>{meta.label}</Badge>
                          {it.status === "ready" && (
                            <Button size="sm" onClick={() => markServed(o.id, it.index)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white h-6 text-[10px] px-2"
                                    data-testid={`kt-served-${o.id}-${it.index}`}>
                              Servi
                            </Button>
                          )}
                          {it.status !== "ready" && it.status !== "served" && (
                            <Button size="sm" variant="ghost"
                                    onClick={() => setActiveTarget({ table_id: o.id, table_number: o.table_number, item_name: it.name })}
                                    className="text-amber-300 hover:text-amber-200 h-6 text-[10px] px-1"
                                    title="Questionner sur ce plat">
                              <MessageSquare className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>

          {/* RIGHT — Messages (1/3 width on desktop, max-h on mobile) */}
          <div className="flex flex-col bg-slate-800/40 rounded border border-slate-700 overflow-hidden max-h-[40vh] lg:max-h-none lg:h-full shrink-0 lg:shrink">
            {/* Cible */}
            <div className="p-2 border-b border-slate-700 bg-slate-900/60 text-[11px]">
              <div className="text-slate-400">Cible du message :</div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <div className="text-amber-200 font-medium truncate">
                  {activeTarget
                    ? `Table ${activeTarget.table_number}${activeTarget.item_name ? ` — ${activeTarget.item_name}` : ""}`
                    : "Général (sans bon précis)"}
                </div>
                {activeTarget && (
                  <Button size="sm" variant="ghost" onClick={() => setActiveTarget(null)}
                          className="text-slate-400 h-6 text-[10px] px-1.5">
                    Effacer
                  </Button>
                )}
              </div>
            </div>

            {/* Formules à envoyer */}
            <div className="p-2 border-b border-slate-700">
              <div className="text-[11px] text-slate-400 mb-1.5 flex items-center gap-1">
                <Send className="w-3 h-3" /> Demander au cuisinier :
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {presets.manager_to_cuisinier.map((p) => (
                  <Button key={p.code} size="sm" disabled={sending}
                          onClick={() => sendMessage(p)}
                          className="bg-amber-600/30 hover:bg-amber-600/60 text-amber-100 border border-amber-500/40 justify-start text-[11px] h-7"
                          data-testid={`kt-send-${p.code}`}>
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Inbox cuisinier */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="p-2 border-b border-slate-700 flex items-center justify-between">
                <div className="text-[11px] text-slate-400 flex items-center gap-1">
                  <BellRing className="w-3 h-3" /> Réponses du cuisinier
                </div>
                {unreadCount > 0 && (
                  <Button size="sm" variant="ghost" onClick={markAllRead}
                          className="text-slate-300 h-6 text-[10px] px-2"
                          data-testid="kt-read-all">
                    Tout lire ({unreadCount})
                  </Button>
                )}
              </div>
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1.5">
                  {messages.length === 0 && (
                    <p className="text-slate-500 italic text-[11px] text-center py-4">
                      Aucun message reçu.
                    </p>
                  )}
                  {messages.map((m) => (
                    <div key={m.id}
                         className={`p-1.5 rounded border text-[11px] ${m.read_at
                           ? "bg-slate-900/40 border-slate-700 text-slate-400"
                           : "bg-emerald-900/30 border-emerald-500/40 text-emerald-100"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{m.label}</span>
                        <span className="text-[9px] text-slate-500 shrink-0">
                          {m.created_at ? format(new Date(m.created_at), "HH:mm") : ""}
                        </span>
                      </div>
                      {(m.table_number || m.item_name) && (
                        <div className="text-[9px] text-slate-400 mt-0.5">
                          {m.table_number ? `Table ${m.table_number}` : ""}
                          {m.item_name ? ` · ${m.item_name}` : ""}
                        </div>
                      )}
                      <div className="text-[9px] text-slate-500 italic mt-0.5">
                        — {m.from_name}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default KitchenTrackerModal;
