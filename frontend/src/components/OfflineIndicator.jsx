/**
 * OfflineIndicator — Badge dans le header montrant l'état de connexion
 * + taille de la file d'attente (Phase 2).
 *
 * Comportement :
 *   - En ligne (online=true) : badge vert discret "Sync auto" + ping latency
 *   - Hors-ligne (online=false) : badge rouge animé "Hors-ligne" + compteur queue
 *   - Au survol/clic : popup avec dernier snapshot, dernière sync, items en queue
 */
import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Wifi, WifiOff, Cloud, CloudOff, RefreshCw, CheckCircle2, AlertTriangle, Database, ListTodo,
} from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import useOnlineStatus from "../hooks/useOnlineStatus";
import { getSnapshot, saveSnapshot, getMeta, listQueue } from "../lib/offlineCache";
import { processQueue, subscribe } from "../lib/offlineSync";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const AUTO_SNAPSHOT_INTERVAL = 5 * 60 * 1000; // 5 min

const LABEL_MAP = {
  create_table:   "Nouvelle table",
  update_table:   "MAJ table",
  delete_table:   "Fermer table",
  create_invoice: "Nouvelle facture",
};

const fmtAgo = (iso) => {
  if (!iso) return "jamais";
  const dt = (Date.now() - new Date(iso).getTime()) / 1000;
  if (dt < 60) return `il y a ${Math.round(dt)} s`;
  if (dt < 3600) return `il y a ${Math.round(dt / 60)} min`;
  if (dt < 86400) return `il y a ${Math.round(dt / 3600)} h`;
  return `il y a ${Math.round(dt / 86400)} j`;
};

const OfflineIndicator = () => {
  const { online, latency } = useOnlineStatus();
  const [meta, setMeta] = useState({ lastSnapshotAt: null, queueSize: 0 });
  const [snapInfo, setSnapInfo] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [wasOnline, setWasOnline] = useState(online);
  const [queueDetail, setQueueDetail] = useState([]);

  const refreshMeta = useCallback(async () => {
    try {
      const m = await getMeta();
      setMeta(m);
      const q = await listQueue();
      setQueueDetail(q);
      const snap = await getSnapshot();
      if (snap) {
        setSnapInfo({
          products: snap.counts?.products || (snap.products || []).length,
          clients: snap.counts?.clients || (snap.clients || []).length,
          tables: snap.counts?.tables || (snap.tables || []).length,
          users: snap.counts?.users || (snap.users || []).length,
          today: snap.today,
          day_opened: !!snap.day_opening,
        });
      }
    } catch (e) {
      // IndexedDB not available — silent fail
    }
  }, []);

  // S'abonner aux changements de queue
  useEffect(() => {
    const unsub = subscribe(() => refreshMeta());
    return unsub;
  }, [refreshMeta]);

  const doSync = useCallback(async () => {
    if (!online) return;
    setSyncing(true);
    try {
      const r = await processQueue();
      if (r.processed > 0) {
        const parts = [];
        if (r.ok > 0) parts.push(`${r.ok} succès`);
        if (r.duplicate > 0) parts.push(`${r.duplicate} déjà sync.`);
        if (r.conflict > 0) parts.push(`${r.conflict} en conflit (Admin gagne)`);
        if (r.error > 0) parts.push(`${r.error} échec(s)`);
        toast.success(`Sync : ${parts.join(" · ")}`);
      }
      await refreshMeta();
    } finally {
      setSyncing(false);
    }
  }, [online, refreshMeta]);

  const doSnapshot = useCallback(async (silent = false) => {
    if (!online) return;
    setRefreshing(true);
    try {
      const r = await axios.get(`${API}/sync/snapshot`, { timeout: 15000 });
      await saveSnapshot(r.data);
      await refreshMeta();
      if (!silent) toast.success("Données locales mises à jour");
    } catch (e) {
      if (!silent) toast.error("Impossible de mettre à jour le cache hors-ligne");
    } finally {
      setRefreshing(false);
    }
  }, [online, refreshMeta]);

  // Initial load
  useEffect(() => {
    refreshMeta();
  }, [refreshMeta]);

  // Auto snapshot every 5 min when online
  useEffect(() => {
    if (!online) return;
    doSnapshot(true);
    const id = setInterval(() => doSnapshot(true), AUTO_SNAPSHOT_INTERVAL);
    return () => clearInterval(id);
  }, [online, doSnapshot]);

  // Toast on connection change + auto-sync queue
  useEffect(() => {
    if (online === wasOnline) return;
    if (online) {
      toast.success("Connexion rétablie — synchronisation en cours…", { duration: 4000 });
      doSnapshot(true);
      doSync();
    } else {
      toast.warning("Mode hors-ligne activé — vos actions seront synchronisées au retour", { duration: 5000 });
    }
    setWasOnline(online);
  }, [online, wasOnline, doSnapshot, doSync]);

  // Refresh queue indicator every 10s
  useEffect(() => {
    const id = setInterval(refreshMeta, 10000);
    return () => clearInterval(id);
  }, [refreshMeta]);

  const queue = meta.queueSize;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-bold transition ${
            online
              ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20"
              : "bg-rose-500/15 border-rose-500/40 text-rose-200 hover:bg-rose-500/25 animate-pulse"
          }`}
          data-testid="offline-indicator"
          title={online ? "En ligne — synchronisation auto" : "Hors-ligne — données locales utilisées"}
        >
          {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{online ? "Sync auto" : "Hors-ligne"}</span>
          {queue > 0 && (
            <Badge className="bg-amber-500 text-slate-900 text-[9px] px-1 py-0 ml-1" data-testid="offline-queue-badge">
              {queue}
            </Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 bg-slate-900 border-slate-700 text-white" align="end" data-testid="offline-popover">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {online ? <Cloud className="w-5 h-5 text-emerald-400" /> : <CloudOff className="w-5 h-5 text-rose-400" />}
            <div>
              <p className="font-bold text-sm">{online ? "Connecté au serveur" : "Mode hors-ligne"}</p>
              <p className="text-[10px] text-slate-400">
                {online ? `Latence ${latency || "?"} ms` : "Les données locales sont utilisées"}
              </p>
            </div>
          </div>

          {!online && (
            <div className="bg-amber-900/20 border border-amber-500/30 rounded p-2 text-[11px] text-amber-200">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
              Vous pouvez continuer à travailler. Les actions seront synchronisées dès le retour de la connexion.
            </div>
          )}

          <div className="bg-slate-800/40 rounded p-2 space-y-1.5 text-[11px]">
            <p className="text-slate-300 font-bold flex items-center gap-1 mb-1">
              <Database className="w-3.5 h-3.5" /> Cache local
            </p>
            <p className="text-slate-400">
              Dernière sync : <span className="text-slate-200">{fmtAgo(meta.lastSnapshotAt)}</span>
            </p>
            {snapInfo ? (
              <div className="grid grid-cols-2 gap-1 text-[10px] mt-1">
                <span className="text-slate-400">Produits : <span className="text-slate-200">{snapInfo.products}</span></span>
                <span className="text-slate-400">Clients : <span className="text-slate-200">{snapInfo.clients}</span></span>
                <span className="text-slate-400">Tables : <span className="text-slate-200">{snapInfo.tables}</span></span>
                <span className="text-slate-400">Utilisateurs : <span className="text-slate-200">{snapInfo.users}</span></span>
                <span className="col-span-2 text-slate-400">
                  Journée {snapInfo.today} :
                  <span className={snapInfo.day_opened ? "text-emerald-300 ml-1" : "text-rose-300 ml-1"}>
                    {snapInfo.day_opened ? "ouverte" : "non ouverte"}
                  </span>
                </span>
              </div>
            ) : (
              <p className="text-slate-500 italic text-[10px]">Aucun cache local. Appuyez sur « Synchroniser maintenant ».</p>
            )}
          </div>

          <div className="bg-slate-800/40 rounded p-2 text-[11px]">
            <p className="text-slate-300 font-bold flex items-center gap-1 mb-1">
              <ListTodo className="w-3.5 h-3.5" /> File d'attente
            </p>
            {queue > 0 ? (
              <>
                <p className="text-amber-300 mb-1.5">
                  {queue} action{queue > 1 ? "s" : ""} en attente de synchronisation
                </p>
                <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                  {queueDetail.slice(0, 6).map((q) => (
                    <div key={q.id} className="bg-slate-900/60 rounded px-1.5 py-1 text-[10px]" data-testid={`queue-item-${q.id}`}>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-slate-300 truncate">{LABEL_MAP[q.type] || q.type}</span>
                        <span className="text-slate-500 shrink-0">{q.queued_at ? fmtAgo(q.queued_at) : ""}</span>
                      </div>
                      {q.payload?.table_number !== undefined && (
                        <span className="text-cyan-300">Table {q.payload.table_number}</span>
                      )}
                      {q.payload?.total !== undefined && (
                        <span className="text-amber-300 ml-2">{Math.round(q.payload.total)} F</span>
                      )}
                    </div>
                  ))}
                  {queueDetail.length > 6 && (
                    <p className="text-slate-500 italic text-[10px]">+ {queueDetail.length - 6} autres…</p>
                  )}
                </div>
                <Button
                  onClick={doSync}
                  disabled={!online || syncing}
                  size="sm"
                  className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 h-7 text-[11px]"
                  data-testid="offline-process-queue"
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${syncing ? "animate-spin" : ""}`} />
                  Synchroniser la file ({queue})
                </Button>
              </>
            ) : (
              <p className="text-emerald-300 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Tout est synchronisé
              </p>
            )}
          </div>

          <Button
            onClick={() => doSnapshot(false)}
            disabled={!online || refreshing}
            size="sm"
            className="w-full bg-cyan-600 hover:bg-cyan-700"
            data-testid="offline-sync-now"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
            Synchroniser maintenant
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default OfflineIndicator;
