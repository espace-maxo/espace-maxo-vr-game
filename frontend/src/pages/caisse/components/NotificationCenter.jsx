/**
 * NotificationCenter — visual components for Caisse Pro notifications.
 *
 * Exports:
 *   - NotifBadge        : small animated badge used on tabs
 *   - NotificationBell  : large profile-level bell + dropdown with mark-as-read
 *   - CrossRoleBanner   : full-width pulsing banner sticky under the header
 */
import React from "react";
import { Button } from "@/components/ui/button";
import { Bell, CheckCircle, ChevronRight, X } from "lucide-react";
import {
  COUNT_META,
  COLOR_BG,
  COLOR_BADGE,
  formatRelativeTime,
} from "../utils/notifications";

export const NotifBadge = ({ count, color = "red", testid }) => {
  if (!count || count <= 0) return null;
  const cls = COLOR_BADGE[color] || COLOR_BADGE.red;
  return (
    <span className="relative inline-flex ml-1" data-testid={testid}>
      <span className={`absolute inset-0 rounded-full ${cls} opacity-75 animate-ping`} />
      <span className={`relative inline-flex items-center justify-center rounded-full text-[10px] font-bold px-1.5 min-w-[18px] h-[18px] ${cls}`}>
        {count > 99 ? "99+" : count}
      </span>
    </span>
  );
};

export const NotificationBell = ({
  effectiveCounts,
  effectiveTotal,
  notifLatest,
  showNotifCenter,
  setShowNotifCenter,
  onOpenNotif,
  onMarkAllRead,
}) => {
  return (
    <div className="relative" data-testid="notif-center">
      <Button
        variant="ghost"
        onClick={() => setShowNotifCenter((s) => !s)}
        className="relative px-2 text-slate-200 hover:bg-slate-700/40"
        data-testid="notif-center-btn"
        title={effectiveTotal > 0 ? `${effectiveTotal} notification(s)` : "Aucune notification"}
      >
        <Bell className="w-6 h-6" />
        {effectiveTotal > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex pointer-events-none" data-testid="notif-center-badge">
            <span className="absolute inset-0 rounded-full bg-red-500 opacity-75 animate-ping" />
            <span className="relative rounded-full bg-red-500 text-white text-[11px] font-bold px-1.5 min-w-[22px] h-[22px] flex items-center justify-center shadow-lg">
              {effectiveTotal > 99 ? "99+" : effectiveTotal}
            </span>
          </span>
        )}
      </Button>
      {showNotifCenter && (
        <>
          <div
            className="fixed inset-0 z-[90]"
            onClick={() => setShowNotifCenter(false)}
            data-testid="notif-center-backdrop"
          />
          <div
            className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-1rem)] bg-slate-800 border border-slate-700 rounded-lg shadow-2xl z-[100] overflow-hidden"
            data-testid="notif-center-dropdown"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 bg-slate-900/50 border-b border-slate-700">
              <span className="text-slate-200 font-semibold text-sm flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-300" /> Notifications
              </span>
              {effectiveTotal > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="text-xs text-slate-300 hover:text-white bg-slate-700/60 hover:bg-slate-600 px-2 py-1 rounded cursor-pointer"
                  data-testid="notif-mark-all-read"
                >
                  Tout marquer lu
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-700/60">
              {effectiveTotal === 0 ? (
                <div className="p-6 text-center text-slate-500 text-sm">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-400 opacity-70" />
                  Aucune notification en attente
                </div>
              ) : (
                Object.entries(effectiveCounts)
                  .filter(([, v]) => (Number(v) || 0) > 0)
                  .sort((a, b) => (b[1] || 0) - (a[1] || 0))
                  .map(([key, count]) => {
                    const meta = COUNT_META[key] || { color: "red", label: key };
                    const color = COLOR_BG[meta.color] || COLOR_BG.slate;
                    const rel = formatRelativeTime(notifLatest?.[key]);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => onOpenNotif(key)}
                        className="w-full text-left px-3 py-2 hover:bg-slate-700/40 active:bg-slate-700/60 flex items-center justify-between gap-2 group cursor-pointer"
                        data-testid={`notif-item-${key}`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className={`w-2 h-2 rounded-full ${color} shrink-0`} />
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-slate-200 text-sm truncate">{meta.label}</span>
                            {rel && (
                              <span className="text-[11px] text-slate-500 truncate" data-testid={`notif-item-${key}-ts`}>{rel}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`${color} text-white text-xs font-bold rounded-full px-2 min-w-[24px] text-center`}>
                            {count}
                          </span>
                          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300" />
                        </div>
                      </button>
                    );
                  })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export const CrossRoleBanner = ({ crossRole, role, onOpenLatest, onDismiss }) => {
  if (!crossRole || crossRole.total <= 0) return null;
  if (role !== "admin" && role !== "manager") return null;

  const breakdown = Object.entries(crossRole.items)
    .filter(([, v]) => v.count > 0)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([k, v]) => `${v.count} ${(COUNT_META[k]?.label || k).toLowerCase()}`)
    .join(" • ");

  return (
    <div
      className={`sticky top-[60px] z-[80] w-full border-b-2 shadow-lg animate-pulse ${
        role === "manager"
          ? "bg-gradient-to-r from-amber-600/95 via-orange-600/95 to-amber-600/95 border-amber-300"
          : "bg-gradient-to-r from-emerald-600/95 via-teal-600/95 to-emerald-600/95 border-emerald-300"
      }`}
      data-testid="cross-role-banner"
    >
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={onOpenLatest}
          className="flex items-center gap-3 text-white font-semibold flex-1 min-w-0 text-left hover:opacity-90 transition-opacity"
          data-testid="cross-role-banner-link"
        >
          <span className="relative inline-flex shrink-0">
            <span className="absolute inset-0 rounded-full bg-white/40 opacity-75 animate-ping" />
            <span className="relative inline-flex items-center justify-center rounded-full bg-white text-slate-900 text-sm font-bold px-2.5 min-w-[32px] h-[32px]">
              {crossRole.total > 99 ? "99+" : crossRole.total}
            </span>
          </span>
          <div className="flex flex-col min-w-0">
            <span className="text-base sm:text-lg leading-tight">
              Nouvelle(s) information(s) de <span className="underline underline-offset-2">{crossRole.source_label}</span>
            </span>
            <span className="text-xs text-white/90 truncate">
              {breakdown}
              {crossRole.latest_timestamp && ` — ${formatRelativeTime(crossRole.latest_timestamp)}`}
            </span>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 text-white text-sm underline underline-offset-2 shrink-0 ml-auto">
            Ouvrir <ChevronRight className="w-4 h-4" />
          </span>
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-white/80 hover:text-white p-1.5 hover:bg-white/10 rounded"
          title="Masquer la bannière"
          data-testid="cross-role-banner-dismiss"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
