/**
 * useOnlineStatus.js — Hook React qui détecte l'état de connexion.
 *
 * Stratégie de stabilité (anti-faux-positifs) :
 *   - Hystérésis : il faut FAILURE_THRESHOLD (3) échecs consécutifs avant de basculer offline.
 *     Un seul ping réussi suffit à repasser online (récupération rapide).
 *   - Timeout généreux (10s) pour tolérer 3G/4G/Wi-Fi lents typiques au Bénin.
 *   - Retry rapide : après un échec, on retest sous 2.5s (au lieu d'attendre 20s) avant de marquer offline.
 *   - Polling adaptatif : 25s en régime online, 5s tant que le statut est instable.
 *   - navigator.onLine `false` ne suffit PAS seul à passer offline : on revérifie via ping.
 *     (les Wi-Fi captifs / Mobiles MEA mentent souvent sur navigator.onLine)
 *
 * Retourne :
 *   - online (bool)
 *   - lastSeen (ISO string du dernier ping OK)
 *   - latency (ms du dernier ping OK)
 *   - source ("navigator" | "ping")
 */
import { useEffect, useRef, useState } from "react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PING_INTERVAL_STABLE_MS = 25000; // 25s en régime online stable
const PING_INTERVAL_UNSTABLE_MS = 5000; // 5s tant qu'on a au moins un échec récent
const PING_TIMEOUT_MS = 10000; // 10s (tolérant 3G/4G)
const FAILURE_THRESHOLD = 3; // 3 échecs consécutifs avant offline
const QUICK_RETRY_DELAY_MS = 2500; // retry rapide après un échec

export default function useOnlineStatus() {
  const initialOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  const [online, setOnline] = useState(initialOnline);
  const [lastSeen, setLastSeen] = useState(null);
  const [latency, setLatency] = useState(null);
  const [source, setSource] = useState("navigator");

  // Refs pour éviter stale closure dans setInterval
  const failureCountRef = useRef(0);
  const onlineRef = useRef(initialOnline);
  const timerRef = useRef(null);
  const quickRetryRef = useRef(null);
  const mountedRef = useRef(true);

  // Garde onlineRef en phase avec le state
  onlineRef.current = online;

  const scheduleNextPing = (instable) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const delay = instable ? PING_INTERVAL_UNSTABLE_MS : PING_INTERVAL_STABLE_MS;
    timerRef.current = setTimeout(doPing, delay);
  };

  const doPing = async () => {
    if (!mountedRef.current) return;
    try {
      const t0 = performance.now();
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
      const r = await fetch(`${API}/sync/ping`, { signal: ctrl.signal, cache: "no-store" });
      clearTimeout(tid);
      if (r.ok) {
        const dt = Math.round(performance.now() - t0);
        // Récupération immédiate : un seul succès suffit
        failureCountRef.current = 0;
        setOnline(true);
        setLastSeen(new Date().toISOString());
        setLatency(dt);
        setSource("ping");
        scheduleNextPing(false);
        return;
      }
      // HTTP non-OK = échec
      handlePingFailure();
    } catch (_e) {
      handlePingFailure();
    }
  };

  const handlePingFailure = () => {
    if (!mountedRef.current) return;
    failureCountRef.current += 1;

    // Encore sous le seuil : retry rapide, on ne bascule pas offline
    if (failureCountRef.current < FAILURE_THRESHOLD) {
      if (quickRetryRef.current) clearTimeout(quickRetryRef.current);
      quickRetryRef.current = setTimeout(doPing, QUICK_RETRY_DELAY_MS);
      // Programme aussi le prochain ping régulier (instable)
      scheduleNextPing(true);
      return;
    }

    // Seuil atteint → offline
    setOnline(false);
    setSource("ping");
    // En mode offline on garde un ping toutes les 5s pour revenir vite
    scheduleNextPing(true);
  };

  useEffect(() => {
    mountedRef.current = true;
    const onUp = () => {
      // navigator dit "online" : on revérifie immédiatement
      doPing();
    };
    const onDown = () => {
      // navigator dit "offline" : on NE bascule PAS encore. On revérifie via ping
      // (les Wi-Fi captifs / réseaux MEA mentent souvent).
      doPing();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("online", onUp);
      window.addEventListener("offline", onDown);
    }
    doPing();
    return () => {
      mountedRef.current = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onUp);
        window.removeEventListener("offline", onDown);
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      if (quickRetryRef.current) clearTimeout(quickRetryRef.current);
    };
  }, []);

  return { online, lastSeen, latency, source };
}
