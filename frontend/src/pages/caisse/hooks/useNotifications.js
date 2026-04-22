/**
 * useNotifications — custom hook managing notification state + polling for Caisse Pro.
 *
 * Responsibilities:
 *  - Poll /api/notifications/counts every 10s.
 *  - Detect deltas vs previous snapshot → play ding + fire browser Notification (admin/manager only, if enabled).
 *  - Expose: counts, effective counts (raw - ack), cross-role data, handlers (mark-read, open-and-navigate, dismiss).
 *
 * @param {object} params
 * @param {boolean} params.isAuthenticated
 * @param {object}  params.currentUser — { role, full_name, username, ... }
 * @param {string}  params.apiBase     — REACT_APP_BACKEND_URL + "/api"
 * @param {(tab:string)=>void} params.onNavigateTab — called when user clicks a notification to open a tab
 */
import axios from "axios";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COUNT_LABELS,
  COUNT_TO_TAB,
  playDing,
  sendBrowserNotification,
} from "../utils/notifications";

const ACK_KEY = "caisse_notif_ack";
const ENABLED_KEY = "caisse_notif_enabled";
const POLL_MS = 10000;

export function useNotifications({ isAuthenticated, currentUser, apiBase, onNavigateTab }) {
  const [notifCounts, setNotifCounts] = useState({});
  const [notifLatest, setNotifLatest] = useState({});
  const [notifCrossRole, setNotifCrossRole] = useState(null);

  const prevNotifCountsRef = useRef(null);
  const notifInitRef = useRef(false);

  const [notifEnabled, setNotifEnabled] = useState(() => {
    try { return localStorage.getItem(ENABLED_KEY) !== "0"; } catch { return true; }
  });
  const notifEnabledRef = useRef(notifEnabled);
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );

  const [acknowledgedCounts, setAcknowledgedCounts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(ACK_KEY) || "{}"); } catch { return {}; }
  });
  const [showNotifCenter, setShowNotifCenter] = useState(false);

  const persistAck = (ack) => {
    try { localStorage.setItem(ACK_KEY, JSON.stringify(ack)); } catch { /* noop */ }
  };

  // ---- Fetch + delta detection ----
  const fetchNotifCounts = useCallback(async () => {
    if (!currentUser?.role) return;
    try {
      const res = await axios.get(`${apiBase}/notifications/counts`, {
        params: {
          role: currentUser.role,
          user: currentUser.full_name || currentUser.username || "",
        },
      });
      const newCounts = res.data?.counts || {};
      setNotifCounts(newCounts);
      setNotifLatest(res.data?.latest_by_category || {});
      setNotifCrossRole(res.data?.cross_role || null);

      const prev = prevNotifCountsRef.current;
      const alertRoles = currentUser?.role === "admin" || currentUser?.role === "manager";
      if (alertRoles && notifInitRef.current && prev && notifEnabledRef.current) {
        const deltas = [];
        Object.keys(newCounts).forEach((k) => {
          const curr = Number(newCounts[k] || 0);
          const old = Number(prev[k] || 0);
          if (curr > old) deltas.push({ key: k, delta: curr - old });
        });
        if (deltas.length > 0) {
          playDing();
          const lines = deltas.slice(0, 4).map((d) => {
            const label = COUNT_LABELS[d.key] || d.key;
            return d.delta > 1 ? `• ${d.delta} ${label}s` : `• ${d.delta} ${label}`;
          });
          sendBrowserNotification("Espace Maxo — Nouvelle notification", lines.join("\n"));
        }
      }
      prevNotifCountsRef.current = newCounts;
      notifInitRef.current = true;
    } catch {
      /* silencieux — badges ne doivent pas bloquer l'UI */
    }
  }, [apiBase, currentUser]);

  // Request permission for admin/manager shortly after login (one-shot).
  useEffect(() => {
    if (!isAuthenticated) return;
    if (typeof Notification === "undefined") return;
    if (currentUser?.role !== "admin" && currentUser?.role !== "manager") return;
    if (Notification.permission === "default") {
      const t = setTimeout(() => {
        Notification.requestPermission()
          .then((p) => setNotifPermission(p))
          .catch(() => {});
      }, 1500);
      return () => clearTimeout(t);
    }
    setNotifPermission(Notification.permission);
  }, [isAuthenticated, currentUser]);

  // Polling
  useEffect(() => {
    if (!isAuthenticated) return;
    prevNotifCountsRef.current = null;
    notifInitRef.current = false;
    fetchNotifCounts();
    const id = setInterval(fetchNotifCounts, POLL_MS);
    return () => clearInterval(id);
  }, [isAuthenticated, currentUser, fetchNotifCounts]);

  const toggleNotifEnabled = () => {
    const next = !notifEnabled;
    setNotifEnabled(next);
    notifEnabledRef.current = next;
    try { localStorage.setItem(ENABLED_KEY, next ? "1" : "0"); } catch { /* noop */ }
    if (next && typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().then((p) => setNotifPermission(p)).catch(() => {});
    }
    if (next) playDing();
  };

  // ---- Mark-as-read / Navigate ----
  const markAllNotifsRead = () => {
    setAcknowledgedCounts({ ...notifCounts });
    persistAck({ ...notifCounts });
    setShowNotifCenter(false);
  };
  const markOneNotifRead = (key) => {
    const next = { ...acknowledgedCounts, [key]: notifCounts[key] || 0 };
    setAcknowledgedCounts(next);
    persistAck(next);
  };
  const openNotifAndNavigate = (key) => {
    const tab = COUNT_TO_TAB[key];
    if (tab && onNavigateTab) onNavigateTab(tab);
    markOneNotifRead(key);
    setShowNotifCenter(false);
  };

  // ---- Effective counts (raw - ack, clamped ≥0) ----
  const effectiveCounts = useMemo(() => {
    const out = {};
    Object.keys(notifCounts || {}).forEach((k) => {
      out[k] = Math.max(0, (Number(notifCounts[k]) || 0) - (Number(acknowledgedCounts[k]) || 0));
    });
    return out;
  }, [notifCounts, acknowledgedCounts]);

  const effectiveTotal = useMemo(
    () => Object.values(effectiveCounts).reduce((s, v) => s + (Number(v) || 0), 0),
    [effectiveCounts]
  );

  // Cross-role banner
  const effectiveCrossRole = useMemo(() => {
    if (!notifCrossRole || !notifCrossRole.items) return null;
    const adjusted = {};
    let total = 0;
    let latestCategory = null;
    let latestTs = "";
    Object.entries(notifCrossRole.items).forEach(([key, v]) => {
      const raw = Number(v?.count) || 0;
      const ack = Number(acknowledgedCounts[key]) || 0;
      const eff = Math.max(0, raw - ack);
      adjusted[key] = { count: eff, latest: v?.latest || "" };
      total += eff;
      if (eff > 0 && v?.latest && v.latest > latestTs) {
        latestTs = v.latest;
        latestCategory = key;
      }
    });
    return {
      source_role: notifCrossRole.source_role,
      source_label: notifCrossRole.source_label,
      items: adjusted,
      total,
      latest_category: latestCategory,
      latest_timestamp: latestTs,
    };
  }, [notifCrossRole, acknowledgedCounts]);

  const openCrossRoleLatest = () => {
    if (!effectiveCrossRole || effectiveCrossRole.total === 0) return;
    const key = effectiveCrossRole.latest_category
      || Object.keys(effectiveCrossRole.items).find((k) => effectiveCrossRole.items[k].count > 0);
    if (!key) return;
    const tab = COUNT_TO_TAB[key];
    if (tab && onNavigateTab) onNavigateTab(tab);
    markOneNotifRead(key);
  };

  const dismissCrossRoleBanner = () => {
    if (!effectiveCrossRole) return;
    const next = { ...acknowledgedCounts };
    Object.keys(effectiveCrossRole.items || {}).forEach((k) => {
      next[k] = Number(notifCounts[k]) || 0;
    });
    setAcknowledgedCounts(next);
    persistAck(next);
  };

  return {
    // raw
    notifCounts,
    notifLatest,
    // computed
    effectiveCounts,
    effectiveTotal,
    effectiveCrossRole,
    // ui state
    showNotifCenter,
    setShowNotifCenter,
    // enable toggle
    notifEnabled,
    notifPermission,
    toggleNotifEnabled,
    // handlers
    markAllNotifsRead,
    markOneNotifRead,
    openNotifAndNavigate,
    openCrossRoleLatest,
    dismissCrossRoleBanner,
  };
}
