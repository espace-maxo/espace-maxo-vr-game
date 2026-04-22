/**
 * Notification helpers + constants used across Caisse Pro.
 * Keep this module FRAMEWORK-FREE (no React) — it's imported by both UI components and hooks.
 */

// Discrete "ding" played via Web Audio API (no external asset, CSP-friendly).
export const playDing = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12); // E6
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => ctx.close();
  } catch {
    /* silent */
  }
};

// Best-effort browser notification (requires user permission).
export const sendBrowserNotification = (title, body) => {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      const n = new Notification(title, {
        body,
        icon: "/favicon.ico",
        tag: "caisse-pro-notif",
        silent: false,
      });
      setTimeout(() => { try { n.close(); } catch { /* noop */ } }, 6000);
    }
  } catch {
    /* silent */
  }
};

// Format relative time "il y a X min/h/j".
export const formatRelativeTime = (isoStr) => {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    const diff = Math.max(0, Date.now() - d.getTime());
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return "à l'instant";
    const min = Math.floor(sec / 60);
    if (min < 60) return `il y a ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `il y a ${h} h`;
    const days = Math.floor(h / 24);
    if (days < 30) return `il y a ${days} j`;
    return d.toLocaleDateString("fr-FR");
  } catch {
    return "";
  }
};

// Human-readable label per count key (singular form)
export const COUNT_LABELS = {
  needs: "nouveau besoin",
  purchase_orders: "nouveau bon de commande",
  expenses: "nouvelle demande d'achats",
  cancellation_requests: "demande d'annulation",
  modification_requests: "demande de modification",
  invoices: "facture à valider",
  financial_points: "point financier à valider",
  tips_today: "nouveau pourboire",
  notes: "nouvelle note",
};

// Map notification key → destination tab value (for click-to-navigate)
export const COUNT_TO_TAB = {
  needs: "needs",
  purchase_orders: "po",
  expenses: "achats",
  cancellation_requests: "bons",
  modification_requests: "bons",
  invoices: "bons",
  financial_points: "stats",
  tips_today: "tips",
  notes: "instructions",
};

// Icon color + label per notification key
export const COUNT_META = {
  needs: { color: "red", label: "Besoins" },
  purchase_orders: { color: "sky", label: "Bons de commande" },
  expenses: { color: "purple", label: "Achats" },
  cancellation_requests: { color: "red", label: "Annulations" },
  modification_requests: { color: "orange", label: "Modifications" },
  invoices: { color: "orange", label: "Factures à valider" },
  financial_points: { color: "red", label: "Points financiers" },
  tips_today: { color: "amber", label: "Pourboires" },
  notes: { color: "red", label: "Notes" },
};

// Tailwind class for background by color key (shared by badge + dropdown + banner).
export const COLOR_BG = {
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  sky: "bg-sky-500",
  emerald: "bg-emerald-500",
  slate: "bg-slate-500",
};

// Tailwind class for text+bg (used by NotifBadge).
export const COLOR_BADGE = {
  red: "bg-red-500 text-white",
  orange: "bg-orange-500 text-white",
  amber: "bg-amber-500 text-white",
  blue: "bg-blue-500 text-white",
  purple: "bg-purple-500 text-white",
  emerald: "bg-emerald-500 text-white",
  sky: "bg-sky-500 text-white",
};
