/**
 * RespOpWelcome — Bandeau d'accueil personnalisé pour la Resp. Op. (Gérante).
 * Affiche :
 *   - Salutation contextuelle (Bonjour / Bonsoir) + nom + rôle
 *   - 5 KPI cliquables : Journée, Tables ouvertes, Bons à valider, Besoins, Pourboires
 * Visible UNIQUEMENT pour role='manager'.
 * Collapsible (l'utilisateur peut le replier pour gagner de la place).
 */
import React, { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sun, Moon, Cloud, ChevronUp, ChevronDown,
  Lock, Unlock, Users, Printer, AlertTriangle, Coins,
} from "lucide-react";

const greetByHour = (h) => {
  if (h < 6)  return { txt: "Bonne nuit", Icon: Moon,  color: "text-indigo-300" };
  if (h < 12) return { txt: "Bonjour",    Icon: Sun,   color: "text-amber-300" };
  if (h < 18) return { txt: "Bon après-midi", Icon: Cloud, color: "text-sky-300" };
  return { txt: "Bonsoir", Icon: Moon, color: "text-purple-300" };
};

const Kpi = ({ icon: Icon, label, value, sub, color, onClick, testid, urgent }) => (
  <button
    type="button"
    onClick={onClick}
    data-testid={testid}
    className={`flex-1 min-w-[140px] text-left bg-slate-800/40 hover:bg-slate-800/60 transition-colors rounded-lg p-3 border ${
      urgent ? "border-rose-500/60 animate-pulse" : "border-slate-700"
    }`}
  >
    <div className="flex items-center gap-2 mb-1">
      <Icon className={`w-4 h-4 ${color}`} />
      <span className={`text-[11px] uppercase tracking-wider ${color}`}>{label}</span>
    </div>
    <p className="text-2xl font-bold text-white leading-tight">{value}</p>
    {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
  </button>
);

const RespOpWelcome = ({
  currentUser,
  tables = [],
  invoices = [],
  effectiveCounts = {},
  isJourneeOpen,
  onGoTo,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const now = new Date();
  const { txt: greetTxt, Icon: GreetIcon, color: greetColor } = greetByHour(now.getHours());

  const openTablesCount = useMemo(
    () => (tables || []).length,
    [tables]
  );
  const pendingBons = useMemo(
    () => (invoices || []).filter((i) => i.validation_status === "pending").length,
    [invoices]
  );
  const needsCount = effectiveCounts.needs || 0;
  const tipsCount = effectiveCounts.tips_today || 0;

  const firstName = (currentUser?.full_name || currentUser?.username || "")
    .split(" ")[0];
  const dateStr = now.toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <Card className="bg-gradient-to-br from-amber-900/30 via-orange-900/20 to-slate-900/40 border-amber-500/30 mb-4" data-testid="respop-welcome">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-11 h-11 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center shrink-0`}>
              <GreetIcon className={`w-6 h-6 ${greetColor}`} />
            </div>
            <div className="min-w-0">
              <p className="text-white text-base sm:text-lg font-bold leading-tight truncate">
                {greetTxt}, {firstName || "Resp. Op."} <span className="text-amber-300">👋</span>
              </p>
              <p className="text-amber-200/70 text-xs capitalize">
                {dateStr} · <span className="text-amber-300">Resp. Op.</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="text-slate-400 hover:text-white p-1.5 rounded hover:bg-slate-700/50"
            data-testid="respop-welcome-toggle"
            title={collapsed ? "Afficher mes tâches" : "Masquer"}
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>

        {!collapsed && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Kpi
              icon={isJourneeOpen ? Unlock : Lock}
              label={isJourneeOpen ? "Journée ouverte" : "Journée fermée"}
              value={isJourneeOpen ? "OK" : "À ouvrir"}
              sub={isJourneeOpen ? "Prête pour les ventes" : "Cliquez pour ouvrir"}
              color={isJourneeOpen ? "text-emerald-300" : "text-amber-300"}
              urgent={!isJourneeOpen}
              onClick={() => onGoTo && onGoTo("journee")}
              testid="respop-kpi-journee"
            />
            <Kpi
              icon={Users}
              label="Tables ouvertes"
              value={openTablesCount}
              sub="Tables actives en service"
              color="text-blue-300"
              onClick={() => onGoTo && onGoTo("tables")}
              testid="respop-kpi-tables"
            />
            <Kpi
              icon={Printer}
              label="Bons à valider"
              value={pendingBons}
              sub={pendingBons > 0 ? "À imprimer pour le client" : "Tout est à jour"}
              color="text-orange-300"
              urgent={pendingBons > 5}
              onClick={() => onGoTo && onGoTo("bons")}
              testid="respop-kpi-bons"
            />
            <Kpi
              icon={AlertTriangle}
              label="Besoins en attente"
              value={needsCount}
              sub={needsCount > 0 ? "Demandes des serveurs" : "Aucune demande"}
              color="text-rose-300"
              urgent={needsCount > 0}
              onClick={() => onGoTo && onGoTo("needs")}
              testid="respop-kpi-needs"
            />
            <Kpi
              icon={Coins}
              label="Pourboires du jour"
              value={tipsCount}
              sub="Saisies du jour"
              color="text-amber-300"
              onClick={() => onGoTo && onGoTo("tips")}
              testid="respop-kpi-tips"
            />
          </div>
        )}
      </div>
    </Card>
  );
};

export default RespOpWelcome;
