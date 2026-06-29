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
  RefreshCw, LogOut, Hash, Volume2, VolumeX, History, Flame, MessageSquare, Send, BellRing, FileText, Boxes, ClipboardCheck,
} from "lucide-react";
import { beepNewOrder, playBeep } from "../lib/notificationBeep";
import DailyReportPanel from "../components/DailyReportPanel";
import CuisineStockTab from "./cuisine/CuisineStockTab";
import FieldStockReportModal from "./caisse/components/FieldStockReportModal";

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
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [daysBack, setDaysBack] = useState(14);

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/cuisine/orders`, {
        params: { actor_role: "cuisinier", status_filter: "done", days: daysBack },
        timeout: 15000,
      });
      setOrders(r.data.orders || []);
    } catch {
      toast.error("Erreur chargement historique");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [actorName, daysBack]);

  // Regroupement par date (YYYY-MM-DD) à partir de all_ready_at (sinon updated_at)
  const grouped = React.useMemo(() => {
    const byDate = {};
    for (const o of orders) {
      const ts = o.all_ready_at || o.updated_at || o.created_at || "";
      const day = (ts || "").slice(0, 10) || "—";
      if (!byDate[day]) byDate[day] = [];
      byDate[day].push(o);
    }
    // Trier les bons de chaque jour par all_ready_at desc
    Object.values(byDate).forEach((list) =>
      list.sort((a, b) => (b.all_ready_at || b.updated_at || "").localeCompare(a.all_ready_at || a.updated_at || ""))
    );
    // Trier les dates desc
    return Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0]));
  }, [orders]);

  const fmtDayHeader = (day) => {
    if (!day || day === "—") return "Date inconnue";
    try {
      return format(new Date(day + "T00:00:00"), "EEEE d MMMM yyyy", { locale: fr });
    } catch {
      return day;
    }
  };

  return (
    <Card className="bg-slate-800/60 border-purple-500/40" data-testid="cuisine-history-view">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-2">
            <History className="w-5 h-5 text-purple-400" />
            Historique des bons terminés
          </span>
          <div className="flex items-center gap-1">
            <select
              value={daysBack}
              onChange={(e) => setDaysBack(Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 rounded h-7 text-[11px] text-white px-1"
              data-testid="history-days-select"
            >
              <option value={1}>Aujourd'hui</option>
              <option value={3}>3 derniers jours</option>
              <option value={7}>7 derniers jours</option>
              <option value={14}>14 derniers jours</option>
              <option value={30}>30 derniers jours</option>
            </select>
            <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="text-slate-300 h-7 text-[11px]" data-testid="history-refresh">
              {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              Actualiser
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs space-y-3">
        {orders.length === 0 && !loading && (
          <p className="text-slate-500 italic text-center py-6">
            Aucun bon terminé sur la période sélectionnée.
          </p>
        )}
        {grouped.map(([day, list]) => (
          <div key={day} className="space-y-1.5" data-testid={`history-day-${day}`}>
            <div className="flex items-center gap-2 sticky top-0 bg-slate-800/95 backdrop-blur py-1 z-10 border-b border-purple-500/30">
              <div className="h-5 w-1 bg-purple-500 rounded" />
              <h3 className="text-[12px] font-bold text-purple-200 capitalize">
                {fmtDayHeader(day)}
              </h3>
              <Badge className="bg-purple-500/20 text-purple-200 text-[10px]">
                {list.length} bon{list.length > 1 ? "s" : ""}
              </Badge>
            </div>
            <div className="space-y-1.5 pl-2">
              {list.map((o) => {
                const totalQty = (o.items || []).reduce((s, it) => s + Number(it.quantity || 1), 0);
                const readyAt = o.all_ready_at ? format(new Date(o.all_ready_at), "HH:mm") : "";
                return (
                  <div
                    key={o.id}
                    className="rounded border border-slate-700 bg-slate-900/40 px-2.5 py-1.5"
                    data-testid={`history-order-${o.id}`}
                  >
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge className="bg-amber-500/20 text-amber-200 border border-amber-500/30">
                        <Hash className="w-3 h-3 mr-1 inline" /> T{o.table_number}
                      </Badge>
                      {o.server_name && (
                        <span className="text-[10px] text-slate-400 truncate max-w-[120px]">{o.server_name}</span>
                      )}
                      <Badge className="bg-emerald-500/20 text-emerald-200 text-[10px]">
                        <CheckCircle2 className="w-3 h-3 mr-1 inline" /> Prêt
                      </Badge>
                      {readyAt && (
                        <span className="text-[10px] text-emerald-300/70 font-mono ml-auto">{readyAt}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-slate-200">
                      {(o.items || []).map((it, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="truncate">{it.name}</span>
                          <span className="text-slate-400 font-mono shrink-0 ml-2">×{it.quantity || 1}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[9px] text-slate-500 mt-1">
                      Total : {totalQty} plat{totalQty > 1 ? "s" : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
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
        params: { actor_role: currentUser?.role || "cuisinier", status_filter: "active" },
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
  // Résultat éditable du scan (avant validation+envoi à l'admin)
  const [scanResult, setScanResult] = useState(null); // { recoupement_id, items, notes, image_preview }
  const [validatingScan, setValidatingScan] = useState(false);

  const handleScan = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/^image\/(png|jpeg|jpg|webp)$/.test(f.type)) {
      return toast.error("Format non supporté");
    }
    setScanning(true);
    try {
      const b64 = await fileToBase64(f);
      const imagePreview = URL.createObjectURL(f);
      const r = await axios.post(`${API}/cuisine/scan-bon`, {
        image_base64: b64,
        mime_type: f.type,
        actor_name: currentUser?.full_name || currentUser?.username,
        actor_role: currentUser?.role || "cuisinier",
      }, { timeout: 60000 });
      const items = (r.data.items || []).map((it) => ({
        name: it.name || "",
        quantity: Number(it.quantity || 1),
      }));
      setScanResult({
        recoupement_id: r.data.recoupement_id,
        items,
        notes: "",
        image_preview: imagePreview,
      });
      if (items.length === 0) {
        toast.warning("Aucun plat détecté — saisissez la liste manuellement");
      } else {
        toast.success(`${items.length} plat(s) extrait(s) — vérifiez et validez`);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur de scan");
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const updateScanItem = (idx, key, val) => {
    setScanResult((prev) => prev && ({
      ...prev,
      items: prev.items.map((it, i) => i === idx ? { ...it, [key]: key === "quantity" ? Number(val || 0) : val } : it),
    }));
  };
  const addScanRow = () => {
    setScanResult((prev) => prev && ({ ...prev, items: [...prev.items, { name: "", quantity: 1 }] }));
  };
  const removeScanRow = (idx) => {
    setScanResult((prev) => prev && ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  };

  const cancelScan = async () => {
    if (!scanResult?.recoupement_id) { setScanResult(null); return; }
    if (!window.confirm("Annuler ce scan ? La photo et la liste seront supprimées.")) return;
    try {
      await axios.delete(`${API}/cuisine/scan-bon/${scanResult.recoupement_id}`, {
        params: { actor_role: "cuisinier" },
      });
      toast.info("Scan annulé");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur d'annulation");
    } finally {
      setScanResult(null);
    }
  };

  const validateAndSendScan = async () => {
    if (!scanResult?.recoupement_id) return;
    const cleanItems = scanResult.items.filter((it) => (it.name || "").trim());
    if (cleanItems.length === 0) {
      return toast.error("Ajoutez au moins un plat avant de valider");
    }
    setValidatingScan(true);
    try {
      await axios.patch(`${API}/cuisine/scan-bon/${scanResult.recoupement_id}/validate`, {
        items: cleanItems,
        notes: scanResult.notes || "",
        actor_name: currentUser?.full_name || currentUser?.username,
        actor_role: currentUser?.role || "cuisinier",
      });
      toast.success(`Bon envoyé à l'administrateur (${cleanItems.length} plat(s))`);
      setScanResult(null);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur de validation");
    } finally {
      setValidatingScan(false);
    }
  };


  // ── UI ──
  const pendingCount = orders.filter((o) => !o.all_ready).length;
  // KPIs : servis du jour + messages non lus
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const servedTodayCount = orders.filter((o) => {
    if (!o.all_ready) return false;
    const ts = o.served_at || o.all_ready_at || o.updated_at || o.created_at || "";
    return String(ts).startsWith(todayStr);
  }).length;
  const unreadMessages = (messages || []).filter((m) => !m.read_by_cuisine && m.author_role !== "cuisinier").length;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-7xl mx-auto p-3 sm:p-5">
        {/* Header — Kitchen Command Center */}
        <div className="flex items-center justify-between mb-4 sm:mb-6 gap-2" data-testid="cuisine-header">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-12 h-12 rounded-xl bg-amber-500/15 ring-2 ring-amber-500/40 flex items-center justify-center shrink-0">
              <ChefHat className="w-7 h-7 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-black tracking-tight text-white truncate">
                {currentUser?.full_name || currentUser?.username}
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-400 uppercase tracking-widest font-semibold">
                Cuisine · {format(new Date(), "EEE d MMM", { locale: fr })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => setSoundOn((s) => !s)} className={`h-10 w-10 p-0 ${soundOn ? 'text-emerald-300' : 'text-slate-500'}`} title={soundOn ? "Couper le son" : "Activer le son"} data-testid="cuisine-sound-toggle">
              {soundOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => fetchOrders(false)} disabled={loading} className="text-slate-400 h-10 w-10 p-0" data-testid="cuisine-refresh">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={onLogout} className="text-rose-400 hover:text-rose-300 h-10 w-10 p-0" data-testid="cuisine-logout">
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* KPI Dashboard — Kitchen Command Center */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5" data-testid="cuisine-kpi-dashboard">
          {/* En attente */}
          <div className={`rounded-xl p-3 sm:p-4 border-2 ${pendingCount > 0 ? 'bg-amber-500/10 border-amber-500/40' : 'bg-slate-900 border-slate-800'}`} data-testid="kpi-waiting">
            <div className="flex items-center justify-between mb-1">
              <Flame className={`w-4 h-4 sm:w-5 sm:h-5 ${pendingCount > 0 ? 'text-amber-400' : 'text-slate-600'}`} />
              <span className="text-[9px] sm:text-[10px] uppercase tracking-widest font-bold text-slate-500">En attente</span>
            </div>
            <p className={`text-3xl sm:text-5xl font-black tracking-tighter leading-none ${pendingCount > 0 ? 'text-amber-300' : 'text-slate-600'}`}>{pendingCount}</p>
            <p className="text-[10px] text-slate-500 mt-1 truncate">bon{pendingCount > 1 ? 's' : ''} actif{pendingCount > 1 ? 's' : ''}</p>
          </div>
          {/* Servis aujourd'hui */}
          <div className="rounded-xl p-3 sm:p-4 border-2 bg-slate-900 border-slate-800" data-testid="kpi-served-today">
            <div className="flex items-center justify-between mb-1">
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
              <span className="text-[9px] sm:text-[10px] uppercase tracking-widest font-bold text-slate-500">Servis</span>
            </div>
            <p className="text-3xl sm:text-5xl font-black tracking-tighter leading-none text-emerald-300">{servedTodayCount}</p>
            <p className="text-[10px] text-slate-500 mt-1 truncate">aujourd&apos;hui</p>
          </div>
          {/* Messages non lus */}
          <div className={`rounded-xl p-3 sm:p-4 border-2 ${unreadMessages > 0 ? 'bg-rose-500/10 border-rose-500/40 animate-pulse' : 'bg-slate-900 border-slate-800'}`} data-testid="kpi-messages">
            <div className="flex items-center justify-between mb-1">
              <MessageSquare className={`w-4 h-4 sm:w-5 sm:h-5 ${unreadMessages > 0 ? 'text-rose-400' : 'text-slate-600'}`} />
              <span className="text-[9px] sm:text-[10px] uppercase tracking-widest font-bold text-slate-500">Messages</span>
            </div>
            <p className={`text-3xl sm:text-5xl font-black tracking-tighter leading-none ${unreadMessages > 0 ? 'text-rose-300' : 'text-slate-600'}`}>{unreadMessages}</p>
            <p className="text-[10px] text-slate-500 mt-1 truncate">non lu{unreadMessages > 1 ? 's' : ''}</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Navigation Pro — Kitchen Command Center : segmented control chunky avec
              icônes proéminentes, badges absolus de notification, états actifs colorés
              par couleur signature de l'onglet. */}
          {(() => {
            const MENU = [
              { id: "orders",      label: "Commandes",     short: "Cmd",  icon: Clock,           color: "amber",   testid: "cuisine-tab-orders",       badge: pendingCount,   badgePulse: pendingCount > 0 },
              { id: "scan",        label: "Scanner",       short: "Scan", icon: Camera,          color: "cyan",    testid: "cuisine-tab-scan" },
              { id: "messages",    label: "Messages",      short: "Msg",  icon: MessageSquare,   color: "rose",    testid: "cuisine-tab-messages",     badge: unreadMessages, badgePulse: unreadMessages > 0 },
              { id: "history",     label: "Historique",    short: "Hist", icon: History,         color: "purple",  testid: "cuisine-tab-history" },
              { id: "report",      label: "Rapport",       short: "Rap",  icon: FileText,        color: "emerald", testid: "cuisine-tab-report" },
              { id: "field_stock", label: "Point de stock",short: "Stock",icon: ClipboardCheck,  color: "amber",   testid: "cuisine-tab-field-stock" },
            ];
            const COLOR_MAP = {
              amber:   { active: "bg-amber-500 text-slate-950 shadow-amber-500/30",     bar: "bg-amber-500"   },
              cyan:    { active: "bg-cyan-500 text-slate-950 shadow-cyan-500/30",       bar: "bg-cyan-500"    },
              rose:    { active: "bg-rose-500 text-slate-950 shadow-rose-500/30",       bar: "bg-rose-500"    },
              purple:  { active: "bg-purple-500 text-slate-50 shadow-purple-500/30",    bar: "bg-purple-500"  },
              emerald: { active: "bg-emerald-500 text-slate-950 shadow-emerald-500/30", bar: "bg-emerald-500" },
            };
            return (
              <div className="mb-5 -mx-1 px-1 overflow-x-auto scrollbar-thin">
                <TabsList className="bg-transparent border-0 grid grid-cols-3 md:grid-cols-6 gap-2 h-auto p-0 w-full">
                  {MENU.map((m) => {
                    const Icon = m.icon;
                    const isActive = activeTab === m.id;
                    const c = COLOR_MAP[m.color];
                    return (
                      <TabsTrigger
                        key={m.id}
                        value={m.id}
                        data-testid={m.testid}
                        className={`
                          group relative rounded-xl overflow-hidden p-0 h-auto transition-all duration-200
                          border-2 ${isActive ? `${c.active} font-black shadow-lg border-transparent` : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-white hover:border-slate-700'}
                          active:scale-95
                        `}
                      >
                        <div className="w-full px-2 py-3 flex flex-col items-center gap-1.5">
                          <div className="relative">
                            <Icon className={`w-6 h-6 sm:w-7 sm:h-7 ${isActive ? '' : `text-${m.color}-400/80 group-hover:text-${m.color}-300`}`} strokeWidth={isActive ? 2.5 : 2} />
                            {!!m.badge && m.badge > 0 && (
                              <span
                                data-testid={`${m.testid}-badge`}
                                className={`absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center ring-2 ring-slate-950 shadow-lg ${m.badgePulse ? 'animate-pulse' : ''}`}
                              >
                                {m.badge > 99 ? '99+' : m.badge}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] sm:text-xs uppercase tracking-wider font-bold leading-none">
                            <span className="sm:hidden">{m.short}</span>
                            <span className="hidden sm:inline">{m.label}</span>
                          </span>
                        </div>
                        {/* Barre active en bas — accent visuel */}
                        {isActive && <div className={`absolute bottom-0 left-0 right-0 h-1 ${c.bar}`} />}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>
            );
          })()}

          {/* COMMANDES */}
          <TabsContent value="orders" className="mt-3 space-y-3">
            {orders.length === 0 && !loading && (
              <div className="text-center py-16 px-4" data-testid="cuisine-orders-empty">
                <div className="relative mx-auto w-32 h-32 mb-6">
                  <div className="absolute inset-0 bg-amber-500/5 rounded-full blur-2xl" />
                  <div className="relative w-full h-full rounded-full bg-slate-900/80 ring-2 ring-amber-500/20 flex items-center justify-center">
                    <ChefHat className="w-16 h-16 text-amber-400/70" />
                  </div>
                </div>
                <h3 className="text-2xl sm:text-3xl font-black text-slate-200 tracking-tight">Cuisine calme</h3>
                <p className="text-slate-500 text-sm mt-2 max-w-md mx-auto">
                  Aucun bon en cours. Les commandes apparaîtront automatiquement dès qu&apos;elles arrivent de la salle.
                </p>
                <Button
                  variant="outline"
                  onClick={() => fetchOrders(true)}
                  className="mt-6 border-slate-700 text-slate-300 hover:bg-slate-800 h-11 px-6"
                  data-testid="cuisine-orders-empty-refresh"
                >
                  <RefreshCw className="w-4 h-4 mr-2" /> Rafraîchir
                </Button>
              </div>
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
                {!scanResult && (
                  <>
                    <p className="text-xs text-slate-400">
                      Photographiez un bon reçu de la salle. L'IA extraira les plats — vous pourrez
                      les corriger avant de les <strong>envoyer à l'administrateur</strong>.
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
                  </>
                )}

                {scanResult && (
                  <div className="space-y-3" data-testid="scan-edit-panel">
                    {scanResult.image_preview && (
                      <div className="rounded border border-cyan-500/30 bg-slate-900/40 p-1">
                        <img
                          src={scanResult.image_preview}
                          alt="Bon scanné"
                          className="rounded max-h-48 mx-auto object-contain"
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <p className="text-xs text-cyan-200 font-semibold flex items-center gap-1.5">
                        <FileText className="w-4 h-4" />
                        Liste extraite ({scanResult.items.length} plat{scanResult.items.length > 1 ? "s" : ""}) — vérifiez et corrigez si besoin
                      </p>
                      <Button
                        type="button" variant="ghost" size="sm"
                        onClick={addScanRow}
                        className="h-7 text-[11px] text-emerald-300 hover:bg-emerald-500/10 border border-emerald-500/30"
                        data-testid="scan-add-row"
                      >
                        + Ajouter une ligne
                      </Button>
                    </div>

                    <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                      {scanResult.items.length === 0 && (
                        <p className="text-xs text-slate-500 italic text-center py-3">
                          Aucun plat détecté. Cliquez sur "Ajouter une ligne" pour saisir manuellement.
                        </p>
                      )}
                      {scanResult.items.map((it, i) => (
                        <div key={i} className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-700 rounded p-1.5" data-testid={`scan-row-${i}`}>
                          <input
                            type="text"
                            value={it.name}
                            onChange={(e) => updateScanItem(i, "name", e.target.value)}
                            placeholder="Nom du plat"
                            className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded h-8 text-sm text-white px-2"
                            data-testid={`scan-name-${i}`}
                          />
                          <input
                            type="number" step="0.5" min={0}
                            value={it.quantity}
                            onChange={(e) => updateScanItem(i, "quantity", e.target.value)}
                            className="w-16 bg-slate-900 border border-slate-700 rounded h-8 text-sm text-white px-2"
                            data-testid={`scan-qty-${i}`}
                          />
                          <Button
                            type="button" variant="ghost" size="sm"
                            onClick={() => removeScanRow(i)}
                            className="h-8 w-8 p-0 text-rose-400 hover:bg-rose-500/10"
                            data-testid={`scan-remove-${i}`}
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                    </div>

                    <textarea
                      value={scanResult.notes}
                      onChange={(e) => setScanResult((prev) => prev && ({ ...prev, notes: e.target.value }))}
                      placeholder="Remarque optionnelle (illisibilité, table, etc.)"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-white min-h-[60px]"
                      data-testid="scan-notes"
                    />

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={cancelScan}
                        disabled={validatingScan}
                        variant="ghost"
                        className="flex-1 h-10 text-rose-300 hover:bg-rose-500/10 border border-rose-500/40"
                        data-testid="scan-cancel-btn"
                      >
                        Annuler
                      </Button>
                      <Button
                        type="button"
                        onClick={validateAndSendScan}
                        disabled={validatingScan || scanResult.items.filter((it) => (it.name || "").trim()).length === 0}
                        className="flex-[2] h-10 bg-emerald-600 hover:bg-emerald-700 text-white"
                        data-testid="scan-validate-btn"
                      >
                        {validatingScan ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Envoi…</>
                        ) : (
                          <><Send className="w-4 h-4 mr-2" /> Valider et envoyer à l'admin</>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
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

          {/* STOCK CUISINE — désactivé (remplacé par Point de stock) */}

          {/* POINT DE STOCK CUISINE — saisie physique indépendante (justif appro) */}
          <TabsContent value="field_stock" className="mt-3">
            <FieldStockReportModal inline kind="kitchen" currentUser={currentUser} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default CuisinePage;
