/**
 * JournalTab — Vue consolidée temps réel + prévisionnelle.
 * Sous-onglets : Réel · Prévisionnel.
 * KPIs en haut, alertes intelligentes, projections 7j/30j.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Wallet, TrendingUp, TrendingDown, AlertTriangle, BookOpen, CalendarRange,
  RefreshCw, ArrowDownCircle, ArrowUpCircle, ChefHat, Receipt, Users, Package,
  Send, Bot, Trash2, Sparkles, Plus, Loader2,
} from "lucide-react";
import ForecastsTab from "./ForecastsTab";
import { Input } from "@/components/ui/input";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND}/api`;
const fmt = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n || 0));

const CAT_META = {
  cuisine: { label: "Cuisine", color: "bg-green-500/20 text-green-300 border-green-500/40", icon: ChefHat },
  charges: { label: "Charges", color: "bg-blue-500/20 text-blue-300 border-blue-500/40", icon: Receipt },
  salaires: { label: "Salaires", color: "bg-amber-500/20 text-amber-300 border-amber-500/40", icon: Users },
  divers: { label: "Divers", color: "bg-slate-500/20 text-slate-300 border-slate-500/40", icon: Package },
  ventes: { label: "Ventes", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", icon: TrendingUp },
};

const ALERT_STYLES = {
  critical: "bg-rose-500/15 border-rose-500/40 text-rose-200",
  warning: "bg-amber-500/15 border-amber-500/40 text-amber-200",
  info: "bg-blue-500/15 border-blue-500/40 text-blue-200",
};

const JournalTab = () => {
  const [view, setView] = useState("real"); // real | forecast
  const [dashboard, setDashboard] = useState(null);
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);

  // Chat assistant state
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState([]); // [{role, text, ts}]
  const [chatLoading, setChatLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, opsRes] = await Promise.all([
        axios.get(`${API}/journal/dashboard`, { params: { days } }),
        axios.get(`${API}/journal/realtime`, { params: { days, limit: 500 } }),
      ]);
      setDashboard(dashRes.data || null);
      setOperations(opsRes.data?.operations || []);
    } catch (e) {
      toast.error("Erreur de chargement du journal");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const sendChat = async () => {
    const msg = (chatMessage || "").trim();
    if (!msg || chatLoading) return;
    setChatLoading(true);
    setChatHistory(h => [...h, { role: "user", text: msg, ts: new Date().toISOString() }]);
    setChatMessage("");
    try {
      const res = await axios.post(`${API}/journal/chat`, { message: msg });
      const data = res.data || {};
      setChatHistory(h => [...h, { role: "assistant", text: data.explain || "—", ts: new Date().toISOString(), executed: data.executed }]);
      if (data.executed) {
        await load();
      }
    } catch (e) {
      const errMsg = e?.response?.data?.detail || "Erreur LLM";
      setChatHistory(h => [...h, { role: "assistant", text: `❌ ${errMsg}`, ts: new Date().toISOString() }]);
    } finally {
      setChatLoading(false);
    }
  };

  const onChatKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  };

  const deleteOp = async (op) => {
    if (!op.deletable) return;
    if (!window.confirm(`Supprimer "${op.label}" (${fmt(op.amount)} F) ?`)) return;
    try {
      await axios.delete(`${API}/journal/manual/${op.ref_id}`);
      toast.success("Opération supprimée");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur");
    }
  };

  const kpiClass = (v) => v >= 0 ? "text-emerald-300" : "text-rose-300";
  const balanceTrendIcon = (cur, projected) => {
    if (projected > cur) return <TrendingUp className="w-4 h-4 text-emerald-400" />;
    if (projected < cur) return <TrendingDown className="w-4 h-4 text-rose-400" />;
    return null;
  };

  const filteredOps = useMemo(() => operations || [], [operations]);

  return (
    <div className="space-y-4" data-testid="journal-tab">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-purple-400" />
            Journal de trésorerie
          </h2>
          <p className="text-slate-400 text-xs mt-0.5">
            Suivi temps réel des entrées/sorties + prévisions sur {days} jours
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="bg-slate-800 border border-slate-700 text-white text-sm rounded px-2 py-1.5"
            data-testid="journal-horizon"
          >
            <option value={7}>7 jours</option>
            <option value={30}>30 jours</option>
            <option value={60}>60 jours</option>
            <option value={90}>90 jours</option>
          </select>
          <Button size="sm" onClick={load} disabled={loading} className="bg-purple-600 hover:bg-purple-700" data-testid="journal-refresh">
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </Button>
        </div>
      </div>

      {/* KPIs */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-gradient-to-br from-emerald-500/15 to-emerald-700/5 border-emerald-500/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-emerald-300/80 text-xs uppercase tracking-wide">
                <Wallet className="w-4 h-4" /> Solde actuel
              </div>
              <p className={`text-3xl font-bold mt-1 ${kpiClass(dashboard.actual.balance)}`}>{fmt(dashboard.actual.balance)} F</p>
              <p className="text-xs text-slate-500 mt-1">
                {dashboard.actual.invoices_count} factures · {dashboard.actual.expenses_count} dépenses
              </p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-500/15 to-blue-700/5 border-blue-500/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-blue-300/80 text-xs uppercase tracking-wide">
                <CalendarRange className="w-4 h-4" /> Solde prévu à 7 jours
                {balanceTrendIcon(dashboard.actual.balance, dashboard.forecast.balance_7d)}
              </div>
              <p className={`text-3xl font-bold mt-1 ${kpiClass(dashboard.forecast.balance_7d)}`}>{fmt(dashboard.forecast.balance_7d)} F</p>
              <p className="text-xs text-slate-500 mt-1">- {fmt(dashboard.forecast.out_7d)} F prévus</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-500/15 to-purple-700/5 border-purple-500/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-purple-300/80 text-xs uppercase tracking-wide">
                <CalendarRange className="w-4 h-4" /> Solde prévu à 30 jours
                {balanceTrendIcon(dashboard.actual.balance, dashboard.forecast.balance_30d)}
              </div>
              <p className={`text-3xl font-bold mt-1 ${kpiClass(dashboard.forecast.balance_30d)}`}>{fmt(dashboard.forecast.balance_30d)} F</p>
              <p className="text-xs text-slate-500 mt-1">- {fmt(dashboard.forecast.out_30d)} F prévus</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-amber-500/15 to-amber-700/5 border-amber-500/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-amber-300/80 text-xs uppercase tracking-wide">
                <TrendingDown className="w-4 h-4" /> Sorties cumulées
              </div>
              <p className="text-3xl font-bold text-amber-300 mt-1">{fmt(dashboard.actual.total_out)} F</p>
              {dashboard.actual.total_in > 0 && (
                <p className="text-xs text-slate-500 mt-1">
                  Ratio {((dashboard.actual.total_out / dashboard.actual.total_in) * 100).toFixed(0)}% du CA
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Alertes */}
      {dashboard?.alerts?.length > 0 && (
        <div className="space-y-1.5" data-testid="journal-alerts">
          {dashboard.alerts.map((al, idx) => (
            <div key={idx} className={`flex items-center gap-2 px-3 py-2 rounded border text-sm ${ALERT_STYLES[al.level] || ALERT_STYLES.info}`}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">{al.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-2">
        <Button
          variant={view === "real" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("real")}
          className={view === "real" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "border-slate-700 text-slate-300 hover:bg-slate-800"}
          data-testid="journal-view-real"
        >
          <BookOpen className="w-4 h-4 mr-1" /> Journal réel
        </Button>
        <Button
          variant={view === "forecast" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("forecast")}
          className={view === "forecast" ? "bg-purple-600 hover:bg-purple-700 text-white" : "border-slate-700 text-slate-300 hover:bg-slate-800"}
          data-testid="journal-view-forecast"
        >
          <CalendarRange className="w-4 h-4 mr-1" /> Prévisionnel
        </Button>
      </div>

      {view === "forecast" && <ForecastsTab />}

      {view === "real" && (
        <>
          {/* === ASSISTANT CONVERSATIONNEL === */}
          <Card className="bg-gradient-to-br from-purple-900/30 to-fuchsia-900/15 border-purple-500/40" data-testid="journal-chat">
            <CardContent className="p-3 sm:p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-purple-500/30 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-purple-200" />
                </div>
                <div className="flex-1">
                  <p className="text-purple-200 font-bold text-sm flex items-center gap-1">
                    Assistant financier <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  </p>
                  <p className="text-xs text-slate-400">
                    Tapez : <em>"ENTRÉE 25000 vente du soir"</em> · <em>"DÉPENSE 5000 taxi"</em> · <em>"PRÉVISION DÉPENSE 100000 loyer 2026-06-01"</em> · <em>"SITUATION"</em>
                  </p>
                </div>
              </div>
              {chatHistory.length > 0 && (
                <div className="bg-slate-900/60 border border-slate-700 rounded p-2 max-h-48 overflow-y-auto space-y-1.5" data-testid="chat-history">
                  {chatHistory.slice(-8).map((m, idx) => (
                    <div
                      key={idx}
                      className={`text-xs px-2 py-1 rounded ${m.role === "user" ? "bg-blue-500/15 text-blue-100 self-end ml-auto max-w-[85%]" : (m.executed ? "bg-emerald-500/15 text-emerald-100" : "bg-slate-800 text-slate-200")}`}
                    >
                      {m.role === "user" && <span className="text-blue-300 mr-1">›</span>}
                      {m.text}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyDown={onChatKey}
                  placeholder="Tapez votre commande…"
                  disabled={chatLoading}
                  className="bg-slate-800 border-slate-700 text-white"
                  data-testid="chat-input"
                />
                <Button onClick={sendChat} disabled={chatLoading || !chatMessage.trim()} className="bg-purple-600 hover:bg-purple-700" data-testid="chat-send">
                  {chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Répartition par catégorie */}
          {dashboard?.actual?.out_by_category && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(dashboard.actual.out_by_category).map(([cat, val]) => {
                const meta = CAT_META[cat] || CAT_META.divers;
                const Icon = meta.icon;
                const pct = dashboard.actual.total_out > 0 ? ((val / dashboard.actual.total_out) * 100).toFixed(0) : 0;
                return (
                  <div key={cat} className={`border rounded p-2.5 ${meta.color}`}>
                    <div className="flex items-center gap-1.5 text-xs uppercase">
                      <Icon className="w-3.5 h-3.5" /> {meta.label}
                    </div>
                    <p className="text-lg font-bold mt-0.5">{fmt(val)} F</p>
                    <p className="text-[10px] opacity-70">{pct}% des sorties</p>
                  </div>
                );
              })}
            </div>
          )}

          <Card className="bg-slate-900/60 border-slate-700">
            <CardContent className="p-0">
              {loading ? (
                <div className="py-12 text-center text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Chargement…
                </div>
              ) : filteredOps.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-60" />
                  Aucune opération sur les {days} derniers jours.
                </div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {filteredOps.map((op) => {
                    const isIn = op.type === "entree";
                    const meta = CAT_META[op.category] || CAT_META.divers;
                    const Icon = isIn ? ArrowUpCircle : ArrowDownCircle;
                    return (
                      <div
                        key={op.id}
                        className="flex items-center gap-3 p-3 hover:bg-slate-800/40 transition"
                        data-testid={`journal-op-${op.id}`}
                      >
                        <Icon className={`w-5 h-5 flex-shrink-0 ${isIn ? "text-emerald-400" : "text-rose-400"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">{op.label}</p>
                          <p className="text-xs text-slate-500">
                            {op.created_at ? format(parseISO(op.created_at), "dd/MM/yyyy HH:mm", { locale: fr }) : "—"}
                            {op.by && <> · par <span className="text-slate-300">{op.by}</span></>}
                          </p>
                        </div>
                        <Badge className={`${meta.color} text-[10px]`}>{meta.label}</Badge>
                        <span className={`font-bold whitespace-nowrap text-base ${isIn ? "text-emerald-300" : "text-rose-300"}`}>
                          {isIn ? "+" : "−"} {fmt(op.amount)} F
                        </span>
                        {op.deletable && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteOp(op)}
                            className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 h-7 px-1.5 ml-1"
                            data-testid={`journal-delete-${op.ref_id}`}
                            title="Supprimer cette opération manuelle"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default JournalTab;
