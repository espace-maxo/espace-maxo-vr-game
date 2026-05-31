/**
 * CuisinePage — Page dédiée au profil "cuisinier".
 *
 * Seules deux actions :
 *   1) Voir les bons cuisine envoyés par la salle (auto-refresh 5s + son)
 *   2) Scanner un bon papier (photo IA → archivé dans recoupements kind=cuisine_scan)
 *
 * Marquer plat prêt :
 *   - par item (checkbox)
 *   - tout le bon
 *
 * Pas d'accès aux factures, caisse, stocks.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChefHat, CheckCircle2, Clock, Bell, Camera, Upload, Loader2,
  RefreshCw, LogOut, Hash, Volume2, VolumeX, History, Flame, MessageSquare, Send, BellRing, FileText, Package,
} from "lucide-react";
import { beepNewOrder, playBeep } from "../lib/notificationBeep";
import DailyReportPanel from "../components/DailyReportPanel";
import CuisineNeedsTab from "./cuisine/CuisineNeedsTab";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const POLL_INTERVAL = 5000;
const NEW_ORDER_SOUND = null; // remplacé par beepNewOrder() (Web Audio API)

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => {
    const s = String(r.result || "");
    const idx = s.indexOf("base64,");
    resolve(idx !== -1 ? s.slice(idx + 7) : s);
  };
  r.onerror = reject;
  r.readAsDataURL(file);
});

const ACTION_META = {
  item_ready: { label: "Plat prêt", color: "bg-emerald-500/20 text-emerald-300" },
  all_ready:  { label: "Bon entier prêt", color: "bg-emerald-600/30 text-emerald-200" },
  scan_bon:   { label: "Scan bon", color: "bg-cyan-500/20 text-cyan-300" },
};

const CuisineHistoryView = ({ actorName }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/cuisine/events`, {
        params: { actor_role: "cuisinier", actor_name: actorName, limit: 200 },
        timeout: 15000,
      });
      setItems(r.data.items || []);
    } catch {
      toast.error("Erreur chargement historique");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [actorName]);

  return (
    <Card className="bg-slate-800/60 border-purple-500/40" data-testid="cuisine-history-view">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <History className="w-5 h-5 text-purple-400" />
            Mon historique d'aujourd'hui
          </span>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="text-slate-300 h-7 text-[11px]">
            {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
            Actualiser
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs">
        {items.length === 0 && !loading && (
          <p className="text-slate-500 italic text-center py-6">
            Aucune action enregistrée pour l'instant.
          </p>
        )}
        {items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700">
                  <th className="text-left py-1.5 pr-2">Heure</th>
                  <th className="text-left py-1.5 px-1">Action</th>
                  <th className="text-left py-1.5 px-1">Table</th>
                  <th className="text-left py-1.5 px-1">Détail</th>
                </tr>
              </thead>
              <tbody>
                {items.map((ev) => {
                  const meta = ACTION_META[ev.action] || { label: ev.action, color: "bg-slate-700 text-slate-300" };
                  return (
                    <tr key={ev.id} className="border-b border-slate-800">
                      <td className="py-1.5 pr-2 text-slate-300 font-mono text-[10px]">
                        {ev.created_at ? format(new Date(ev.created_at), "HH:mm:ss") : ""}
                      </td>
                      <td className="px-1"><Badge className={meta.color}>{meta.label}</Badge></td>
                      <td className="px-1 text-slate-200">{ev.table_number != null ? `T${ev.table_number}` : "—"}</td>
                      <td className="px-1 text-slate-300">
                        {ev.action === "item_ready" && <span>{ev.item_name} x{ev.item_quantity || 1}</span>}
                        {ev.action === "all_ready" && <span className="text-slate-400">{ev.items_count} plat(s)</span>}
                        {ev.action === "scan_bon" && <span className="text-slate-400">{ev.items_count} plat(s) extrait(s)</span>}
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

const CuisinePage = ({ currentUser, onLogout }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("orders");
  const [soundOn, setSoundOn] = useState(true);
  const lastIdsRef = useRef(new Set());

  // Messagerie Resp. Op. ⇄ Cuisinier
  const [messages, setMessages] = useState([]);
  const [unreadMsgs, setUnreadMsgs] = useState(0);
  const [presets, setPresets] = useState({ manager_to_cuisinier: [], cuisinier_to_manager: [] });
  const [sendingMsg, setSendingMsg] = useState(false);
  const lastMsgIdsRef = useRef(new Set());

  // ── Fetch loop ──
  const fetchOrders = useCallback(async (silent = true) => {
    if (!silent) setLoading(true);
    try {
      const r = await axios.get(`${API}/cuisine/orders`, {
        params: { actor_role: currentUser?.role || "cuisinier" },
        timeout: 10000,
      });
      const list = r.data.orders || [];
      // Détecter nouveaux bons
      const currentIds = new Set(list.map((o) => o.id));
      const newOnes = [...currentIds].filter((id) => !lastIdsRef.current.has(id));
      if (lastIdsRef.current.size > 0 && newOnes.length > 0 && soundOn) {
        try { beepNewOrder(); } catch {}
        toast.info(`Nouveau bon reçu — Table ${list.find((o) => o.id === newOnes[0])?.table_number || "?"}`);
      }
      lastIdsRef.current = currentIds;
      setOrders(list);
    } catch (e) {
      if (!silent) toast.error("Erreur récupération des commandes");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [currentUser, soundOn]);

  useEffect(() => {
    fetchOrders(false);
    const id = setInterval(() => fetchOrders(true), POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchOrders]);

  // ── Messages: fetch presets once + poll inbox ──
  useEffect(() => {
    axios.get(`${API}/cuisine/messages/presets`, { params: { actor_role: currentUser?.role || "cuisinier" } })
      .then((r) => setPresets(r.data || { manager_to_cuisinier: [], cuisinier_to_manager: [] }))
      .catch(() => {});
  }, [currentUser?.role]);

  const fetchMessages = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/cuisine/messages`, {
        params: { actor_role: currentUser?.role || "cuisinier", since_minutes: 240 },
        timeout: 10000,
      });
      const msgs = r.data.messages || [];
      const unread = r.data.unread || 0;
      // bip si nouveau message non lu
      const currIds = new Set(msgs.filter((m) => !m.read_at).map((m) => m.id));
      const incoming = [...currIds].filter((id) => !lastMsgIdsRef.current.has(id));
      if (lastMsgIdsRef.current.size > 0 && incoming.length > 0 && soundOn) {
        try { playBeep({ freq: 1500, duration: 0.15, volume: 0.8, count: 2, gap: 0.08 }); } catch {}
        const fresh = msgs.find((m) => m.id === incoming[0]);
        if (fresh) toast.info(`Resp. Op. : ${fresh.label}`);
      }
      lastMsgIdsRef.current = currIds;
      setMessages(msgs);
      setUnreadMsgs(unread);
    } catch {}
  }, [currentUser?.role, soundOn]);

  useEffect(() => {
    fetchMessages();
    const id = setInterval(fetchMessages, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchMessages]);

  const sendReply = async (preset) => {
    setSendingMsg(true);
    try {
      await axios.post(`${API}/cuisine/messages`, {
        code: preset.code,
        label: preset.label,
        from_role: currentUser?.role || "cuisinier",
        from_name: currentUser?.full_name || currentUser?.username || "Cuisinier",
        to_role: "manager",
      });
      toast.success("Réponse envoyée");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur d'envoi");
    } finally {
      setSendingMsg(false);
    }
  };

  const markAllMsgsRead = async () => {
    try {
      await axios.post(`${API}/cuisine/messages/read-all`, null, { params: { actor_role: currentUser?.role || "cuisinier" } });
      fetchMessages();
    } catch {}
  };

  // ── Mark item ready ──
  const markItem = async (tableId, itemIndex) => {
    try {
      await axios.patch(`${API}/cuisine/orders/${tableId}/items/${itemIndex}/ready`, null, {
        params: { actor_role: currentUser?.role, actor_name: currentUser?.full_name || currentUser?.username },
        timeout: 10000,
      });
      toast.success("Plat marqué prêt — salle notifiée");
      fetchOrders(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const markItemInProgress = async (tableId, itemIndex) => {
    try {
      await axios.patch(`${API}/cuisine/orders/${tableId}/items/${itemIndex}/start`, null, {
        params: { actor_role: currentUser?.role, actor_name: currentUser?.full_name || currentUser?.username },
        timeout: 10000,
      });
      toast.success("Plat en préparation — Resp. Op. notifié");
      fetchOrders(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const markAllReady = async (tableId) => {
    if (!window.confirm("Marquer TOUT le bon comme prêt ?")) return;
    try {
      await axios.patch(`${API}/cuisine/orders/${tableId}/ready`, null, {
        params: { actor_role: currentUser?.role, actor_name: currentUser?.full_name || currentUser?.username },
        timeout: 10000,
      });
      toast.success("Bon entier marqué prêt");
      fetchOrders(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  // ── Scan bon ──
  const fileRef = useRef(null);
  const [scanning, setScanning] = useState(false);

  const handleScan = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/^image\/(png|jpeg|jpg|webp)$/.test(f.type)) {
      return toast.error("Format non supporté");
    }
    setScanning(true);
    try {
      const b64 = await fileToBase64(f);
      const r = await axios.post(`${API}/cuisine/scan-bon`, {
        image_base64: b64,
        mime_type: f.type,
        actor_name: currentUser?.full_name || currentUser?.username,
        actor_role: currentUser?.role || "cuisinier",
      }, { timeout: 60000 });
      toast.success(`Bon scanné et archivé (${r.data.items_extracted} plats détectés)`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur de scan");
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ── UI ──
  const pendingCount = orders.filter((o) => !o.all_ready).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-amber-950/30 to-slate-900 text-white">
      <div className="max-w-6xl mx-auto p-3 sm:p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 sm:mb-5 gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <ChefHat className="w-6 h-6 sm:w-7 sm:h-7 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-bold truncate">
                <span className="sm:hidden">{currentUser?.full_name || currentUser?.username}</span>
                <span className="hidden sm:inline">Cuisine — {currentUser?.full_name || currentUser?.username}</span>
              </h1>
              <p className="text-[10px] text-slate-400 truncate">{format(new Date(), "EEE d MMM yyyy", { locale: fr })}</p>
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSoundOn((s) => !s)}
              className="text-slate-300 h-8 w-8 p-0"
              title={soundOn ? "Couper le son" : "Activer le son"}
              data-testid="cuisine-sound-toggle"
            >
              {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchOrders(false)}
              disabled={loading}
              className="text-slate-300 h-8 w-8 p-0"
              data-testid="cuisine-refresh"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onLogout}
              className="text-rose-400 hover:text-rose-300 h-8 w-8 p-0"
              data-testid="cuisine-logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Onglets : scroll horizontal sur mobile, icônes seules + badge.
              Texte affiché à partir de sm: pour ne pas déborder sur petit écran */}
          <div className="-mx-3 px-3 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-thin">
            <TabsList className="bg-slate-800/60 border border-slate-700 inline-flex w-auto sm:flex">
              <TabsTrigger value="orders" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white px-2 sm:px-3" data-testid="cuisine-tab-orders" title="Commandes">
                <Clock className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Commandes</span>
                {pendingCount > 0 && (
                  <Badge className="ml-1 sm:ml-2 bg-rose-500 text-white text-[10px]">{pendingCount}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="scan" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white px-2 sm:px-3" data-testid="cuisine-tab-scan" title="Scanner un bon">
                <Camera className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Scanner</span>
              </TabsTrigger>
              <TabsTrigger value="messages" className="data-[state=active]:bg-rose-600 data-[state=active]:text-white relative px-2 sm:px-3" data-testid="cuisine-tab-messages" title="Messages">
                <MessageSquare className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Messages</span>
                {unreadMsgs > 0 && (
                  <Badge className="ml-1 sm:ml-2 bg-rose-500 text-white text-[10px] animate-pulse">{unreadMsgs}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="history" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white px-2 sm:px-3" data-testid="cuisine-tab-history" title="Mon historique">
                <History className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Historique</span>
              </TabsTrigger>
              <TabsTrigger value="report" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white px-2 sm:px-3" data-testid="cuisine-tab-report" title="Rapport du jour">
                <FileText className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Rapport</span>
              </TabsTrigger>
              <TabsTrigger value="needs" className="data-[state=active]:bg-orange-600 data-[state=active]:text-white px-2 sm:px-3" data-testid="cuisine-tab-needs" title="Besoin cuisine">
                <Package className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Besoin</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* COMMANDES */}
          <TabsContent value="orders" className="mt-3 space-y-3">
            {orders.length === 0 && !loading && (
              <Card className="bg-slate-800/40 border-slate-700">
                <CardContent className="p-8 text-center">
                  <ChefHat className="w-10 h-10 mx-auto text-slate-500 mb-2" />
                  <p className="text-slate-400 text-sm">Aucun bon cuisine en cours.</p>
                  <p className="text-slate-500 text-xs mt-1">Les commandes de la salle apparaîtront ici automatiquement.</p>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {orders.map((o) => {
                const allReady = o.all_ready;
                return (
                  <Card
                    key={o.id}
                    className={`border ${allReady ? "bg-emerald-900/20 border-emerald-500/40" : "bg-slate-800/60 border-amber-500/30"}`}
                    data-testid={`cuisine-order-${o.id}`}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Hash className="w-4 h-4 text-amber-400" />
                          Table {o.table_number}
                        </span>
                        {allReady ? (
                          <Badge className="bg-emerald-500/30 text-emerald-200 border border-emerald-500/50">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Prêt
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/30 text-amber-200">{o.items.filter(i => !i.ready).length} en cours</Badge>
                        )}
                      </CardTitle>
                      <p className="text-[10px] text-slate-400">
                        Agent: {o.server_name || "—"} · {o.client_name ? `Client: ${o.client_name}` : ""}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-1.5 text-xs">
                      {o.items.map((it) => {
                        const isInProgress = !!it.started_at && !it.ready;
                        return (
                        <div
                          key={it.index}
                          className={`flex items-center gap-2 p-1.5 rounded ${it.ready ? "bg-emerald-900/25" : isInProgress ? "bg-amber-900/30" : "bg-slate-900/50 hover:bg-slate-700/40"}`}
                        >
                          <input
                            type="checkbox"
                            checked={!!it.ready}
                            disabled={it.ready}
                            onChange={() => markItem(o.id, it.index)}
                            className="w-4 h-4 accent-emerald-500 cursor-pointer"
                            data-testid={`cuisine-item-check-${o.id}-${it.index}`}
                          />
                          <span className={`flex-1 ${it.ready ? "line-through text-slate-500" : "text-slate-100"}`}>
                            {it.name}
                          </span>
                          <Badge className="bg-slate-700 text-slate-300 text-[9px]">x{it.quantity}</Badge>
                          {!it.ready && !isInProgress && (
                            <Button
                              size="sm"
                              onClick={() => markItemInProgress(o.id, it.index)}
                              className="bg-amber-600/40 hover:bg-amber-600/70 text-amber-100 border border-amber-500/50 h-6 text-[10px] px-2"
                              data-testid={`cuisine-item-start-${o.id}-${it.index}`}
                              title="Marquer en préparation"
                            >
                              <Flame className="w-3 h-3 mr-0.5" /> Démarrer
                            </Button>
                          )}
                          {isInProgress && (
                            <Badge className="bg-amber-500/30 text-amber-200 text-[9px] border border-amber-500/50">
                              <Flame className="w-2.5 h-2.5 mr-0.5" /> En cours
                            </Badge>
                          )}
                          {it.ready && (
                            <span className="text-[9px] text-emerald-400">
                              ✓ {it.ready_at ? format(new Date(it.ready_at), "HH:mm") : ""}
                            </span>
                          )}
                        </div>
                        );
                      })}
                      {!allReady && (
                        <Button
                          size="sm"
                          onClick={() => markAllReady(o.id)}
                          className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-xs"
                          data-testid={`cuisine-mark-all-${o.id}`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Tout marquer prêt
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* SCAN */}
          <TabsContent value="scan" className="mt-3">
            <Card className="bg-slate-800/60 border-cyan-500/40">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Camera className="w-5 h-5 text-cyan-400" />
                  Scanner un bon papier
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-slate-400">
                  Photographiez le bon reçu de la salle. Le bon sera archivé dans <strong>Recoupement IA</strong> (visible par l'administrateur)
                  et les plats seront extraits automatiquement.
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  capture="environment"
                  onChange={handleScan}
                  className="hidden"
                  data-testid="cuisine-scan-input"
                />
                <Button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={scanning}
                  className="w-full bg-cyan-600 hover:bg-cyan-700 text-white h-12 text-sm"
                  data-testid="cuisine-scan-btn"
                >
                  {scanning ? (
                    <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Extraction en cours…</>
                  ) : (
                    <><Upload className="w-5 h-5 mr-2" /> Prendre / choisir une photo du bon</>
                  )}
                </Button>
                <div className="text-[11px] text-slate-500 italic">
                  Astuce : sur mobile, l'appareil photo se déclenche automatiquement.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* HISTORIQUE */}
          <TabsContent value="history" className="mt-3">
            <CuisineHistoryView actorName={currentUser?.full_name || currentUser?.username} />
          </TabsContent>

          {/* MESSAGES */}
          <TabsContent value="messages" className="mt-3 space-y-3">
            <Card className="bg-slate-800/60 border-rose-500/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <BellRing className="w-5 h-5 text-rose-400" />
                    Messages reçus du Responsable
                    {unreadMsgs > 0 && (
                      <Badge className="bg-rose-500 text-white">{unreadMsgs} non lu(s)</Badge>
                    )}
                  </span>
                  {unreadMsgs > 0 && (
                    <Button size="sm" variant="ghost" onClick={markAllMsgsRead}
                            className="text-slate-300 h-7 text-[11px]" data-testid="cuisine-read-all-msgs">
                      Tout marquer lu
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs max-h-[40vh] overflow-y-auto">
                {messages.length === 0 && (
                  <p className="text-slate-500 italic text-center py-4">Aucun message reçu.</p>
                )}
                {messages.map((m) => (
                  <div key={m.id}
                       className={`p-2 rounded border ${m.read_at
                         ? "bg-slate-900/40 border-slate-700 text-slate-400"
                         : "bg-rose-900/30 border-rose-500/40 text-rose-100"}`}
                       data-testid={`cuisine-msg-${m.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-sm">{m.label}</span>
                      <span className="text-[10px] text-slate-500 shrink-0">
                        {m.created_at ? format(new Date(m.created_at), "HH:mm") : ""}
                      </span>
                    </div>
                    {(m.table_number || m.item_name) && (
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {m.table_number ? `Table ${m.table_number}` : ""}
                        {m.item_name ? ` · ${m.item_name}` : ""}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-500 italic mt-0.5">
                      — {m.from_name}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-slate-800/60 border-emerald-500/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Send className="w-5 h-5 text-emerald-400" />
                  Répondre au Responsable
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                {presets.cuisinier_to_manager.map((p) => (
                  <Button key={p.code} size="sm" disabled={sendingMsg}
                          onClick={() => sendReply(p)}
                          className="bg-emerald-600/30 hover:bg-emerald-600/60 text-emerald-100 border border-emerald-500/40 justify-start text-[11px] h-9"
                          data-testid={`cuisine-reply-${p.code}`}>
                    {p.label}
                  </Button>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* RAPPORT DU JOUR */}
          <TabsContent value="report" className="mt-3">
            <DailyReportPanel currentUser={currentUser} kind="cuisine" />
          </TabsContent>

          {/* BESOIN EN CUISINE */}
          <TabsContent value="needs" className="mt-3">
            <CuisineNeedsTab currentUser={currentUser} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default CuisinePage;
