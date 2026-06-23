import React, { useEffect, useState, useCallback } from "react";
import { Wifi, WifiOff, Hash, RefreshCw } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { toast } from "sonner";
import {
  unusedCount,
  refillIfLow,
  fetchAndStore,
} from "../../../lib/offlineInvoiceNumbers";

const API_BASE = process.env.REACT_APP_BACKEND_URL;

/**
 * Petit badge affichant le nombre de numéros de factures pré-alloués
 * disponibles pour le mode hors-ligne, avec un bouton de recharge manuelle.
 *
 * Props :
 *   - user        : { name, role } courant
 *   - threshold   : alerte si pool < threshold (défaut 5)
 *   - batchSize   : taille de la recharge (défaut 30)
 *   - className   : classes externes optionnelles
 */
export default function OfflinePreallocBadge({
  user,
  threshold = 5,
  batchSize = 30,
  className = "",
}) {
  const [count, setCount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  const refresh = useCallback(async () => {
    try {
      const c = await unusedCount();
      setCount(c);
    } catch (_) {
      setCount(0);
    }
  }, []);

  // Recharge auto si pool bas et online
  const autoRefill = useCallback(async () => {
    if (!isOnline || !user) return;
    try {
      const r = await refillIfLow({
        apiBase: API_BASE,
        user,
        threshold,
        batchSize,
      });
      if (r.refilled > 0) {
        toast.success(`${r.refilled} numéros pré-alloués ajoutés (pool : ${r.available})`);
      }
      await refresh();
    } catch (_) {
      // ignore
    }
  }, [isOnline, user, threshold, batchSize, refresh]);

  useEffect(() => {
    refresh();
    autoRefill();
    const onOn = () => setIsOnline(true);
    const onOff = () => setIsOnline(false);
    window.addEventListener("online", onOn);
    window.addEventListener("offline", onOff);
    const t = setInterval(refresh, 30000);
    return () => {
      window.removeEventListener("online", onOn);
      window.removeEventListener("offline", onOff);
      clearInterval(t);
    };
  }, [refresh, autoRefill]);

  const handleManualRefill = async () => {
    if (!isOnline) {
      toast.error("Connexion requise pour recharger les numéros");
      return;
    }
    setBusy(true);
    try {
      const added = await fetchAndStore({
        apiBase: API_BASE,
        user,
        count: batchSize,
      });
      toast.success(`+${added} numéros réservés pour le mode hors-ligne`);
      await refresh();
    } catch (e) {
      toast.error(`Échec de la réservation : ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  if (count === null) return null;

  const low = count < threshold;
  const color = low
    ? "bg-red-500/20 text-red-200 border-red-500/40"
    : "bg-emerald-500/15 text-emerald-200 border-emerald-500/30";

  return (
    <div
      className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${color} ${className}`}
      data-testid="offline-prealloc-badge"
      title={
        isOnline
          ? `${count} numéros de factures pré-alloués (utilisables hors-ligne)`
          : "Mode hors-ligne — pool local de numéros pré-alloués"
      }
    >
      {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
      <Hash className="w-3.5 h-3.5 -ml-1" />
      <span className="text-xs font-semibold tabular-nums" data-testid="offline-prealloc-count">
        {count}
      </span>
      {low && (
        <Badge className="bg-red-600/40 text-red-100 text-[10px] py-0 px-1.5 border-red-500/50">
          BAS
        </Badge>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="h-5 w-5 p-0 ml-0.5 hover:bg-white/10"
        onClick={handleManualRefill}
        disabled={busy || !isOnline}
        data-testid="offline-prealloc-refill"
        title="Recharger le pool de numéros"
      >
        <RefreshCw className={`w-3 h-3 ${busy ? "animate-spin" : ""}`} />
      </Button>
    </div>
  );
}
