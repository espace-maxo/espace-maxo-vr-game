/**
 * PointsHistoryTab — Historique de tous les reversements (points financiers).
 * Liste daily + weekly, statuts (brouillon/signé/validé), filtres, PDF, suppression admin.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  History, FileText, Download, CheckCircle2, Lock, Clock, Trash2, Search,
  Calendar, ShieldCheck, AlertTriangle, RefreshCw, TrendingUp, Unlock, Eye,
} from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND}/api`;
const fmt = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n || 0));

const PointsHistoryTab = ({ currentUser }) => {
  const isAdmin = currentUser?.role === "admin";

  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | pending | signed | admin_validated
  const [periodFilter, setPeriodFilter] = useState("all"); // all | daily | weekly
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/financial-points`);
      const all = res.data.financial_points || [];
      all.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      setPoints(all);
    } catch (e) {
      toast.error("Erreur de chargement de l'historique");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const getStatus = (p) => {
    if (p.admin_validated) return { key: "admin_validated", label: "Validé", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", icon: CheckCircle2 };
    if (p.signed) return { key: "signed", label: "Signé — attente DG", color: "bg-blue-500/20 text-blue-300 border-blue-500/40", icon: Lock };
    return { key: "pending", label: "Brouillon", color: "bg-amber-500/20 text-amber-300 border-amber-500/40", icon: Clock };
  };

  const filtered = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    return points.filter((p) => {
      const st = getStatus(p).key;
      if (statusFilter !== "all" && st !== statusFilter) return false;
      if (periodFilter !== "all" && p.period_type !== periodFilter) return false;
      if (dateFrom && String(p.date || "") < dateFrom) return false;
      if (dateTo && String(p.date || "") > dateTo) return false;
      if (q) {
        const hay = [
          p.signed_by, p.admin_validated_by, p.created_by, p.notes,
          p.date, p.end_date, p.momo_number,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [points, search, statusFilter, periodFilter, dateFrom, dateTo]);

  const stats = useMemo(() => {
    return {
      total: filtered.length,
      pending: filtered.filter(p => !p.signed).length,
      signed: filtered.filter(p => p.signed && !p.admin_validated).length,
      validated: filtered.filter(p => p.admin_validated).length,
      total_amount: filtered.reduce((s, p) => s + (p.total_amount || 0), 0),
    };
  }, [filtered]);

  const viewPdf = (p) => {
    window.open(`${API}/financial-points/${p.id}/pdf`, "_blank");
  };

  const downloadPdf = (p) => {
    const a = document.createElement("a");
    a.href = `${API}/financial-points/${p.id}/pdf`;
    a.setAttribute("download", `reversement_${p.date}_${p.id.slice(0,8)}.pdf`);
    a.target = "_blank";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const unlockPoint = async (p) => {
    if (!isAdmin) return;
    if (!window.confirm(`Renvoyer ce reversement pour modification ?\n\nLa Gérante pourra à nouveau le modifier avant re-signature.`)) return;
    try {
      await axios.post(`${API}/financial-points/${p.id}/unlock`, {
        admin_name: currentUser?.full_name || currentUser?.username || "Admin",
      });
      toast.success("Reversement déverrouillé");
      fetchAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur");
    }
  };

  const deletePoint = async (p) => {
    if (!isAdmin) return;
    if (!window.confirm(`Supprimer définitivement ce reversement du ${formatPeriod(p)} ?`)) return;
    try {
      await axios.delete(`${API}/financial-points/${p.id}`, { params: { is_admin: true } });
      toast.success("Reversement supprimé");
      fetchAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur");
    }
  };

  const resetFilters = () => {
    setSearch(""); setStatusFilter("all"); setPeriodFilter("all");
    setDateFrom(""); setDateTo("");
  };

  return (
    <div className="space-y-4" data-testid="points-history-tab">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-cyan-300 flex items-center gap-2">
            <History className="w-6 h-6" />
            Historique des reversements
          </h2>
          <p className="text-slate-400 text-xs mt-0.5">
            Tous les points financiers · {filtered.length} résultat(s) · Total : {fmt(stats.total_amount)} F
          </p>
        </div>
        <Button size="sm" onClick={fetchAll} disabled={loading} className="bg-cyan-600 hover:bg-cyan-700" data-testid="history-refresh">
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Actualiser
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-amber-500/10 border-amber-500/30">
          <CardContent className="p-3">
            <p className="text-xs text-amber-300/80 uppercase">Brouillons</p>
            <p className="text-2xl font-bold text-amber-300">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-500/10 border-blue-500/30">
          <CardContent className="p-3">
            <p className="text-xs text-blue-300/80 uppercase">En attente DG</p>
            <p className="text-2xl font-bold text-blue-300">{stats.signed}</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-500/10 border-emerald-500/30">
          <CardContent className="p-3">
            <p className="text-xs text-emerald-300/80 uppercase">Validés</p>
            <p className="text-2xl font-bold text-emerald-300">{stats.validated}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/60 border-slate-700">
          <CardContent className="p-3">
            <p className="text-xs text-slate-400 uppercase">Montant total</p>
            <p className="text-2xl font-bold text-white">{fmt(stats.total_amount)} F</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-slate-900/60 border-slate-700">
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher (signataire, notes, date, momo)…"
                className="bg-slate-800 border-slate-700 text-white pl-9"
                data-testid="history-search"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white" data-testid="history-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 text-white border-slate-700">
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="pending">Brouillons</SelectItem>
                <SelectItem value="signed">En attente DG</SelectItem>
                <SelectItem value="admin_validated">Validés</SelectItem>
              </SelectContent>
            </Select>
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white" data-testid="history-period-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 text-white border-slate-700">
                <SelectItem value="all">Toutes périodes</SelectItem>
                <SelectItem value="daily">Journalier</SelectItem>
                <SelectItem value="weekly">Hebdomadaire</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={resetFilters} className="border-slate-700 text-slate-300" data-testid="history-reset-filters">
              Réinitialiser
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-[auto_1fr_auto_1fr] gap-2 items-center">
            <Label className="text-slate-400 text-xs">Du</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-slate-800 border-slate-700 text-white" data-testid="history-date-from" />
            <Label className="text-slate-400 text-xs">Au</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-slate-800 border-slate-700 text-white" data-testid="history-date-to" />
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card className="bg-slate-900/60 border-slate-700">
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              Chargement…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <History className="w-8 h-8 mx-auto mb-2 opacity-60" />
              Aucun reversement trouvé avec ces critères.
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {filtered.map((p) => {
                const st = getStatus(p);
                const StIcon = st.icon;
                return (
                  <div
                    key={p.id}
                    className="p-3 sm:p-4 hover:bg-slate-800/40 transition"
                    data-testid={`history-row-${p.id}`}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge className={`${st.color} text-xs`}>
                            <StIcon className="w-3 h-3 mr-1" />
                            {st.label}
                          </Badge>
                          <Badge variant="outline" className="border-slate-600 text-slate-300 text-xs">
                            <Calendar className="w-3 h-3 mr-1" />
                            {p.period_type === "weekly" ? "Hebdo" : "Journalier"}
                          </Badge>
                          <span className="text-white font-medium">{formatPeriod(p)}</span>
                        </div>
                        <div className="text-xs text-slate-400 space-y-0.5">
                          <p>Créé par <span className="text-slate-200">{p.created_by || "—"}</span></p>
                          {p.signed && (
                            <p>Signé par <span className="text-blue-300">{p.signed_by || "—"}</span>{p.signed_at && <> · {format(parseISO(p.signed_at), "dd/MM/yyyy HH:mm")}</>}</p>
                          )}
                          {p.admin_validated && (
                            <p>Validé par <span className="text-emerald-300">{p.admin_validated_by || "—"}</span>{p.admin_validated_at && <> · {format(parseISO(p.admin_validated_at), "dd/MM/yyyy HH:mm")}</>}</p>
                          )}
                          {p.notes && <p className="italic text-slate-500">"{p.notes.slice(0, 120)}"</p>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xl font-bold text-white">{fmt(p.total_amount)} F</p>
                        <div className="flex gap-1 justify-end flex-wrap mt-1">
                          <Button size="sm" variant="outline" onClick={() => viewPdf(p)} className="border-slate-700 text-slate-300 h-7 px-2 text-xs" data-testid={`history-view-${p.id}`}>
                            <Eye className="w-3.5 h-3.5 mr-1" /> PDF
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => downloadPdf(p)} className="border-slate-700 text-slate-300 h-7 px-2 text-xs">
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                          {isAdmin && p.admin_validated && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => unlockPoint(p)}
                              className="border-amber-500/50 text-amber-300 hover:bg-amber-500/10 h-7 px-2 text-xs"
                              data-testid={`history-unlock-${p.id}`}
                            >
                              <Unlock className="w-3.5 h-3.5 mr-1" /> Rouvrir
                            </Button>
                          )}
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => deletePoint(p)}
                              className="border-rose-500/50 text-rose-300 hover:bg-rose-500/10 h-7 px-2"
                              data-testid={`history-delete-${p.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Amount breakdown (compact) */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-3 text-xs">
                      {p.cash_amount > 0 && (
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded px-2 py-1">
                          <span className="text-emerald-300/80">Espèces : </span>
                          <span className="text-emerald-300 font-semibold">{fmt(p.cash_amount)} F</span>
                        </div>
                      )}
                      {p.mobile_amount > 0 && (
                        <div className="bg-orange-500/5 border border-orange-500/20 rounded px-2 py-1">
                          <span className="text-orange-300/80">Mobile : </span>
                          <span className="text-orange-300 font-semibold">{fmt(p.mobile_amount)} F</span>
                        </div>
                      )}
                      {p.cheque_amount > 0 && (
                        <div className="bg-purple-500/5 border border-purple-500/20 rounded px-2 py-1">
                          <span className="text-purple-300/80">Chèque : </span>
                          <span className="text-purple-300 font-semibold">{fmt(p.cheque_amount)} F</span>
                        </div>
                      )}
                      {p.wallet_amount > 0 && (
                        <div className="bg-amber-500/5 border border-amber-500/20 rounded px-2 py-1">
                          <span className="text-amber-300/80">Crédit : </span>
                          <span className="text-amber-300 font-semibold">{fmt(p.wallet_amount)} F</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// Helper: period label for a point
const formatPeriod = (p) => {
  try {
    if (p.period_type === "weekly" && p.end_date) {
      return `${format(parseISO(p.date), "dd/MM")} → ${format(parseISO(p.end_date), "dd/MM/yyyy")}`;
    }
    return format(parseISO(p.date), "EEEE dd MMMM yyyy", { locale: fr });
  } catch {
    return p.date || "—";
  }
};

export default PointsHistoryTab;
