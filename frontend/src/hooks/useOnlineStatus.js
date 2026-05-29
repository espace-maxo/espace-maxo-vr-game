/**
 * useOnlineStatus.js — Hook React qui détecte l'état de connexion.
 *
 * Combine :
 *   - navigator.onLine (signal navigateur)
 *   - ping HTTP régulier sur /api/sync/ping (fiable car certains réseaux
 *     restent "connectés" mais sans accès Internet)
 *
 * Retourne :
 *   - online (bool)
 *   - lastSeen (ISO string du dernier ping OK)
 *   - latency (ms du dernier ping OK)
 *   - source ("navigator" | "ping")
 */
import { useEffect, useRef, useState } from "react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PING_INTERVAL_MS = 15000; // 15s
const PING_TIMEOUT_MS = 5000;

export default function useOnlineStatus() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [lastSeen, setLastSeen] = useState(null);
  const [latency, setLatency] = useState(null);
  const [source, setSource] = useState("navigator");
  const timerRef = useRef(null);

  const doPing = async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setOnline(false);
      setSource("navigator");
      return;
    }
    try {
      const t0 = performance.now();
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
      const r = await fetch(`${API}/sync/ping`, { signal: ctrl.signal, cache: "no-store" });
      clearTimeout(tid);
      if (r.ok) {
        const dt = Math.round(performance.now() - t0);
        setOnline(true);
        setLastSeen(new Date().toISOString());
        setLatency(dt);
        setSource("ping");
      } else {
        setOnline(false);
        setSource("ping");
      }
    } catch (e) {
      setOnline(false);
      setSource("ping");
    }
  };

  useEffect(() => {
    const onUp = () => { setOnline(true); setSource("navigator"); doPing(); };
    const onDown = () => { setOnline(false); setSource("navigator"); };
    if (typeof window !== "undefined") {
      window.addEventListener("online", onUp);
      window.addEventListener("offline", onDown);
    }
    doPing();
    timerRef.current = setInterval(doPing, PING_INTERVAL_MS);
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onUp);
        window.removeEventListener("offline", onDown);
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { online, lastSeen, latency, source };
}
