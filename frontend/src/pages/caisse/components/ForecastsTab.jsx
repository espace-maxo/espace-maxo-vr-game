/**
 * ForecastsTab — Prévisions de décaissement (Admin only)
 * Saisie + suivi des prévisions (salaires, loyer, fournisseurs…).
 * Dashboard : trésorerie disponible + agenda 30j + montant manquant + totaux par catégorie.
 */
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine
} from "recharts";
import {
  TrendingDown, AlertTriangle, Plus, Edit2, Trash2,
  Calendar, Wallet, CalendarDays, CheckCircle, XCircle, Clock
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const formatPrice = (p) => new Intl.NumberFormat('fr-FR').format(Math.round(p || 0));

const CATEGORIES = [
  { value: "salaires", label: "Salaires", color: "bg-purple-500/20 text-purple-400" },
  { value: "loyer", label: "Loyer", color: "bg-blue-500/20 text-blue-400" },
  { value: "fournisseur", label: "Fournisseur", color: "bg-emerald-500/20 text-emerald-400" },
  { value: "charges", label: "Charges (électricité, eau...)", color: "bg-amber-500/20 text-amber-400" },
  { value: "impots", label: "Impôts / Taxes", color: "bg-rose-500/20 text-rose-400" },
  { value: "maintenance", label: "Maintenance", color: "bg-sky-500/20 text-sky-400" },
  { value: "autre", label: "Autre", color: "bg-slate-500/20 text-slate-300" },
];

const STATUSES = [
  { value: "prevu", label: "Prévue", color: "bg-amber-500/20 text-amber-400" },
  { value: "paye", label: "Payée", color: "bg-green-500/20 text-green-400" },
  { value: "reporte", label: "Reportée", color: "bg-blue-500/20 text-blue-400" },
  { value: "annule", label: "Annulée", color: "bg-slate-500/20 text-slate-400" },
];

const catMeta = (v) => CATEGORIES.find(c => c.value === v) || CATEGORIES[CATEGORIES.length - 1];
const statusMeta = (v) => STATUSES.find(c => c.value === v) || STATUSES[0];

const emptyForm = () => ({
  date: format(new Date(), "yyyy-MM-dd"),
  label: "",
  amount: 0,
  category: "autre",
  status: "prevu",
  recurrence: "none",
  recurrence_day: "",
  notes: "",
});

const ForecastsTab = () => {
  const [forecasts, setForecasts] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [horizon, setHorizon] = useState(30);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());

  const load = async () => {
    setLoading(true);
    try {
      const [listRes, dashRes] = await Promise.all([
        axios.get(`${API}/forecasts`),
        axios.get(`${API}/forecasts/dashboard`, { params: { horizon_days: horizon } }),
      ]);
      setForecasts(listRes.data.forecasts || []);
      setDashboard(dashRes.data || null);
    } catch (err) {
      console.error("load forecasts error", err);
      toast.error("Erreur de chargement des prévisions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [horizon]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowModal(true);
  };
  const openEdit = (fc) => {
    setEditing(fc);
    setForm({
      date: fc.date,
      label: fc.label,
      amount: fc.amount,
      category: fc.category,
      status: fc.status,
      recurrence: fc.recurrence || "none",
      recurrence_day: fc.recurrence_day || "",
      notes: fc.notes || "",
    });
    setShowModal(true);
  };
  const save = async () => {
    if (!form.label.trim() || !form.amount) {
      toast.error("Libellé et montant requis");
      return;
    }
    const payload = {
      ...form,
      amount: parseFloat(form.amount) || 0,
      recurrence_day: form.recurrence === "monthly" && form.recurrence_day ? parseInt(form.recurrence_day, 10) : null,
    };
    try {
      if (editing) {
        await axios.put(`${API}/forecasts/${editing.id}`, payload);
        toast.success("Prévision mise à jour");
      } else {
        await axios.post(`${API}/forecasts`, payload);
        toast.success("Prévision créée");
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur");
    }
  };
  const remove = async (id) => {
    if (!window.confirm("Supprimer cette prévision ?")) return;
    try {
      await axios.delete(`${API}/forecasts/${id}`);
      toast.success("Supprimée");
      load();
    } catch {
      toast.error("Erreur");
    }
  };
  const togglePaid = async (fc) => {
    const newStatus = fc.status === "paye" ? "prevu" : "paye";
    try {
      await axios.put(`${API}/forecasts/${fc.id}`, { status: newStatus });
      load();
    } catch {
      toast.error("Erreur");
    }
  };

  const chartData = useMemo(() => {
    if (!dashboard?.per_day) return [];
    return dashboard.per_day.map(d => ({
      date: d.date.slice(5),
      day: d.date,
      decaissement: d.decaissement,
      solde: d.running_balance,
    }));
  }, [dashboard]);

  const missing = dashboard?.missing_amount || 0;
  const minBal = dashboard?.min_running_balance ?? 0;
  const available = dashboard?.available_now || 0;

  return (
    <div className="space-y-6" data-testid="forecasts-tab">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <CalendarDays className="w-7 h-7 text-purple-400" />
            Prévisions de décaissement
          </h2>
          <p className="text-slate-400 text-sm mt-1">Planification des sorties d'argent & analyse de trésorerie</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={String(horizon)} onValueChange={(v) => setHorizon(parseInt(v, 10))}>
            <SelectTrigger className="w-36 bg-slate-800/50 border-slate-700 text-white" data-testid="forecasts-horizon">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 jours</SelectItem>
              <SelectItem value="14">14 jours</SelectItem>
              <SelectItem value="30">30 jours</SelectItem>
              <SelectItem value="60">60 jours</SelectItem>
              <SelectItem value="90">90 jours</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={openCreate} className="bg-purple-500 hover:bg-purple-600" data-testid="forecasts-add-btn">
            <Plus className="w-4 h-4 mr-2" /> Nouvelle prévision
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3" data-testid="forecasts-kpis">
        <Card className="bg-gradient-to-br from-emerald-900/30 to-green-900/20 border-emerald-500/40">
          <CardContent className="p-4">
            <p className="text-slate-400 text-xs uppercase">Trésorerie dispo.</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{formatPrice(available)} F</p>
            <p className="text-slate-500 text-xs mt-2">CA semaine − dépenses approuvées</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-900/30 to-orange-900/20 border-amber-500/40">
          <CardContent className="p-4">
            <p className="text-slate-400 text-xs uppercase">Total à décaisser ({horizon}j)</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{formatPrice(dashboard?.totals?.total_decaissements || 0)} F</p>
            <p className="text-slate-500 text-xs mt-2">{forecasts.length} prévision(s) enregistrée(s)</p>
          </CardContent>
        </Card>
        <Card className={`bg-gradient-to-br ${missing > 0 ? "from-rose-900/30 to-red-900/20 border-rose-500/50 animate-pulse" : "from-blue-900/30 to-indigo-900/20 border-blue-500/40"}`}>
          <CardContent className="p-4">
            <p className="text-slate-400 text-xs uppercase">{missing > 0 ? "Montant manquant" : "Couverture"}</p>
            <p className={`text-2xl font-bold mt-1 ${missing > 0 ? "text-rose-400" : "text-blue-400"}`} data-testid="forecasts-missing">
              {missing > 0 ? `-${formatPrice(missing)} F` : "OK"}
            </p>
            <p className="text-slate-500 text-xs mt-2">
              {missing > 0
                ? `Solde minimal prévu: ${formatPrice(minBal)} F`
                : "Trésorerie suffisante sur l'horizon"}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-900/30 to-pink-900/20 border-purple-500/40">
          <CardContent className="p-4">
            <p className="text-slate-400 text-xs uppercase">Solde final prévu</p>
            <p className={`text-2xl font-bold mt-1 ${available - (dashboard?.totals?.total_decaissements || 0) < 0 ? "text-rose-400" : "text-green-400"}`}>
              {formatPrice(available - (dashboard?.totals?.total_decaissements || 0))} F
            </p>
            <p className="text-slate-500 text-xs mt-2">Après tous les décaissements</p>
          </CardContent>
        </Card>
      </div>

      {/* Alert card */}
      {missing > 0 && (
        <Card className="bg-gradient-to-br from-rose-900/40 to-red-900/30 border-rose-500/70" data-testid="forecasts-alert">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0 mt-1" />
              <div>
                <p className="text-rose-300 font-bold">Trésorerie insuffisante sur l'horizon</p>
                <p className="text-slate-300 text-sm mt-1">
                  Le solde descendra à <span className="font-bold text-rose-400">{formatPrice(minBal)} F</span>.
                  Il faut trouver <span className="font-bold text-rose-300">{formatPrice(missing)} F</span> supplémentaires
                  ou reporter certaines prévisions.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Solde chart */}
      <Card className="bg-slate-800/50 border-slate-700" data-testid="forecasts-chart">
        <CardHeader className="pb-2">
          <CardTitle className="text-slate-200 text-sm">Évolution du solde prévisionnel</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => formatPrice(v)} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                labelFormatter={(_, p) => p?.[0]?.payload?.day || ""}
                formatter={(v) => [`${formatPrice(v)} F`, ""]}
              />
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" />
              <Line dataKey="solde" stroke="#22c55e" strokeWidth={2} dot={false} name="Solde" />
              <Line dataKey="decaissement" stroke="#f97316" strokeWidth={1.5} dot={false} name="Décaissement" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Agenda jour par jour */}
      <Card className="bg-slate-800/50 border-slate-700" data-testid="forecasts-agenda">
        <CardHeader className="pb-2">
          <CardTitle className="text-slate-200 text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4" /> Agenda de décaissements ({horizon}j)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[360px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-800">
                <tr className="text-left text-slate-400 border-b border-slate-700">
                  <th className="p-2">Date</th>
                  <th className="p-2">Éléments</th>
                  <th className="p-2 text-right">Décaissement</th>
                  <th className="p-2 text-right">Solde prévu</th>
                </tr>
              </thead>
              <tbody>
                {chartData.filter(d => d.decaissement > 0).length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-6 text-slate-500">Aucune prévision sur l'horizon</td></tr>
                ) : (dashboard?.per_day || []).filter(d => d.decaissement > 0).map(day => (
                  <tr key={day.date} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                    <td className="p-2 text-white font-medium">{format(parseISO(day.date), "EEE d MMM", { locale: fr })}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        {day.items.map((it, i) => (
                          <Badge key={i} className={`${catMeta(it.category).color} text-xs`}>
                            {it.label} ({formatPrice(it.amount)} F)
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="p-2 text-right text-amber-400 font-bold">{formatPrice(day.decaissement)} F</td>
                    <td className={`p-2 text-right font-bold ${day.running_balance < 0 ? "text-rose-400" : "text-green-400"}`}>
                      {formatPrice(day.running_balance)} F
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* List of all forecasts */}
      <Card className="bg-slate-800/50 border-slate-700" data-testid="forecasts-list">
        <CardHeader className="pb-2">
          <CardTitle className="text-slate-200 text-sm">Toutes les prévisions ({forecasts.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-800">
                <tr className="text-left text-slate-400 border-b border-slate-700">
                  <th className="p-2">Date</th>
                  <th className="p-2">Libellé</th>
                  <th className="p-2">Catégorie</th>
                  <th className="p-2">Récurrence</th>
                  <th className="p-2 text-right">Montant</th>
                  <th className="p-2">Statut</th>
                  <th className="p-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {forecasts.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-slate-500">Aucune prévision — cliquez sur "Nouvelle prévision"</td></tr>
                ) : forecasts.map(fc => (
                  <tr key={fc.id} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                    <td className="p-2 text-slate-300">{fc.date}</td>
                    <td className="p-2 text-white font-medium">{fc.label}</td>
                    <td className="p-2"><Badge className={catMeta(fc.category).color}>{catMeta(fc.category).label}</Badge></td>
                    <td className="p-2 text-slate-400 text-xs">{fc.recurrence === "none" ? "—" : (fc.recurrence === "monthly" ? `Mensuel (jour ${fc.recurrence_day || "?"})` : "Hebdo")}</td>
                    <td className="p-2 text-right text-amber-400 font-bold">{formatPrice(fc.amount)} F</td>
                    <td className="p-2"><Badge className={statusMeta(fc.status).color}>{statusMeta(fc.status).label}</Badge></td>
                    <td className="p-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => togglePaid(fc)} className={fc.status === "paye" ? "text-amber-400" : "text-green-400"} title={fc.status === "paye" ? "Marquer comme prévue" : "Marquer comme payée"} data-testid={`forecast-toggle-${fc.id}`}>
                          {fc.status === "paye" ? <Clock className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(fc)} className="text-slate-400" data-testid={`forecast-edit-${fc.id}`}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => remove(fc.id)} className="text-red-400" data-testid={`forecast-delete-${fc.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Totals by category */}
      {dashboard?.totals?.by_category && Object.keys(dashboard.totals.by_category).length > 0 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-200 text-sm">Répartition par catégorie ({horizon}j)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(dashboard.totals.by_category).map(([k, v]) => (
                <div key={k} className="bg-slate-700/30 rounded-lg p-3 flex flex-col">
                  <span className="text-slate-400 text-xs">{catMeta(k).label}</span>
                  <span className="text-white font-bold mt-1">{formatPrice(v)} F</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-lg" data-testid="forecast-modal">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier la prévision" : "Nouvelle prévision"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Libellé *</Label>
              <Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="Ex: Loyer décembre, Salaire responsable op. & log..." data-testid="forecast-label" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date *</Label>
                <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} data-testid="forecast-date" />
              </div>
              <div>
                <Label>Montant (F) *</Label>
                <Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} data-testid="forecast-amount" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Catégorie</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                  <SelectTrigger data-testid="forecast-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Statut</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger data-testid="forecast-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Récurrence</Label>
                <Select value={form.recurrence} onValueChange={v => setForm({ ...form, recurrence: v })}>
                  <SelectTrigger data-testid="forecast-recurrence"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune</SelectItem>
                    <SelectItem value="weekly">Hebdomadaire (même jour chaque semaine)</SelectItem>
                    <SelectItem value="monthly">Mensuelle (même jour chaque mois)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.recurrence === "monthly" && (
                <div>
                  <Label>Jour du mois (1-28)</Label>
                  <Input type="number" min={1} max={28} value={form.recurrence_day} onChange={e => setForm({ ...form, recurrence_day: e.target.value })} />
                </div>
              )}
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Annuler</Button>
            <Button onClick={save} className="bg-purple-500 hover:bg-purple-600" data-testid="forecast-save-btn">
              {editing ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ForecastsTab;
