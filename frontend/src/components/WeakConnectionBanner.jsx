/**
 * WeakConnectionBanner — Bandeau orange non-bloquant qui s'affiche quand
 * la connexion est ONLINE mais la latence dépasse le seuil (Wi-Fi faible).
 *
 * Déclenchement : 3 pings consécutifs > 1500ms (logique gérée dans useOnlineStatus).
 * Disparition : dès qu'un ping repasse sous le seuil.
 *
 * But : permettre à la gérante de savoir que le réseau est lent AVANT
 * qu'il ne bascule en hors-ligne, et l'inciter à basculer sur 4G manuellement.
 */
import React, { useState } from "react";
import { AlertTriangle, X, Wifi } from "lucide-react";
import useOnlineStatus from "../hooks/useOnlineStatus";

const WeakConnectionBanner = () => {
  const { online, weakConnection, latency } = useOnlineStatus();
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissal quand la connexion redevient bonne
  React.useEffect(() => {
    if (!weakConnection) setDismissed(false);
  }, [weakConnection]);

  if (!online || !weakConnection || dismissed) return null;

  return (
    <div
      className="w-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-b border-amber-500/40 backdrop-blur-sm"
      data-testid="weak-connection-banner"
      role="status"
      aria-live="polite"
    >
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-amber-100 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0 animate-pulse" />
          <Wifi className="w-4 h-4 text-amber-300 flex-shrink-0" />
          <span>
            <strong className="font-bold">Connexion lente détectée</strong>
            {latency ? (
              <span className="ml-1 text-amber-200/80 text-xs">
                (~{latency} ms · réseau Wi-Fi/3G fragile)
              </span>
            ) : null}
            <span className="hidden sm:inline ml-2 text-amber-200/80 text-xs">
              · Pensez à basculer sur 4G pour éviter une bascule hors-ligne.
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-amber-200 hover:text-white hover:bg-amber-500/20 rounded p-1 transition flex-shrink-0"
          aria-label="Masquer l'avertissement"
          data-testid="weak-connection-dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default WeakConnectionBanner;
