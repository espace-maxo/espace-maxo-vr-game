/**
 * TipsTab — Gestion des pourboires.
 *
 * Rôles :
 *  - admin / manager : voient tout, créent/éditent/suppriment
 *  - server          : voit uniquement ses propres pourboires (read-only)
 *
 * Règles :
 *  - Par défaut attribution = 'pool'. Option 'server' avec sélection d'un agent.
 *  - Modes de paiement : cash, mobile_money, card, other.
 *  - Résumé : total jour + total semaine + classement agents (semaine).
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Trash2, Edit2, Coins, Trophy, Users as UsersIcon, Calendar, Wallet,
} from "lucide-react";

const API = (process.env.REACT_APP_BACKEND_URL || "") + "/api";
const formatPrice = (p) => new Intl.NumberFormat("fr-FR").format(Math.round(p || 0));

const PAYMENT_LABELS = {
  cash: "Espèces",
  mobile_money: "Mobile money",
  card: "Carte",
  other: "Autre",
};
const PAYMENT_COLORS = {
  cash: "bg-emerald-500/20 text-emerald-300",
  mobile_money: "bg-amber-500/20 text-amber-300",
  card: "bg-sky-500/20 text-sky-300",
  other: "bg-slate-500/20 text-slate-300",
};

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  amount: 0,
  payment_method: "cash",
  attribution_type: "pool",
  server_name: "",
  notes: "",
};

const TipsTab = ({ currentUser }) => {
  const role = currentUser?.role;
  const myName = currentUser?.full_name || currentUser?.username || "";
  const canEdit = role === "admin" || role === "manager";

  const [tips, setTips] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [servers, setServers] = useState([]);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const today = new Date().toISOString().slice(0, 10);

  // Apply server-side filter if role=server (security + UX)
  const fetchParams = useMemo(() => {
    const p = {};
    if (role === "server" && myName) p.server = myName;
    return p;
  }, [role, myName]);

  const fetchTips = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/tips`, { params: fetchParams });
      setTips(res.data.tips || []);
    } catch (e) {
      console.error("Error fetching tips:", e);
    } finally {
      setLoading(false);
    }
  }, [fetchParams]);

  const fetchSummary = useCallback(async () => {
    try {
      const params = { date: today };
      if (role === "server" && myName) params.server = myName;
      const res = await axios.get(`${API}/tips/summary`, { params });
      setSummary(res.data);
    } catch (e) {
      console.error("Error fetching summary:", e);
    }
  }, [today, role, myName]);

  const fetchServers = useCallback(async () => {
    if (!canEdit) return;
    try {
      const res = await axios.get(`${API}/caisse/users`);
      const all = res.data.users || [];
      setServers(all.filter((u) => u.role === "server").map((u) => u.full_name || u.username));
    } catch (e) {
      console.error("Error fetching servers:", e);
    }
  }, [canEdit]);

  useEffect(() => { fetchTips(); fetchSummary(); fetchServers(); }, [fetchTips, fetchSummary, fetchServers]);

  // ---- Actions ----
  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, date: today });
    setShowModal(true);
  };
  const openEdit = (tip) => {
    setEditing(tip);
    setForm({
      date: tip.date,
      amount: tip.amount,
      payment_method: tip.payment_method,
      attribution_type: tip.attribution_type,
      server_name: tip.server_name || "",
      notes: tip.notes || "",
    });
    setShowModal(true);
  };
  const saveTip = async () => {
    const amt = parseFloat(form.amount) || 0;
    if (amt <= 0) return toast.error("Montant requis");
    if (form.attribution_type === "server" && !form.server_name) return toast.error("Choisissez un agent");
    const payload = {
      date: form.date,
      amount: amt,
      payment_method: form.payment_method,
      attribution_type: form.attribution_type,
      server_name: form.attribution_type === "server" ? form.server_name : null,
      notes: form.notes,
      created_by: myName,
    };
    try {
      if (editing) {
        await axios.put(`${API}/tips/${editing.id}`, payload);
        toast.success("Pourboire mis à jour");
      } else {
        await axios.post(`${API}/tips`, payload);
        toast.success("Pourboire enregistré");
      }
      setShowModal(false);
      fetchTips();
      fetchSummary();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };
  const deleteTip = async (id) => {
    if (!confirm("Supprimer ce pourboire ?")) return;
    try {
      await axios.delete(`${API}/tips/${id}`);
      toast.success("Supprimé");
      fetchTips();
      fetchSummary();
    } catch {
      toast.error("Erreur");
    }
  };

  // ---- Render ----
  const dayTotal = summary?.day?.total || 0;
  const weekTotal = summary?.week?.total || 0;
  const poolWeek = summary?.week?.pool_total || 0;
  const serverWeek = summary?.week?.server_total || 0;
  const ranking = summary?.ranking || [];

  return (
    <div className="space-y-4" data-testid="tips-tab">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-amber-300 flex items-center gap-2">
          <Coins className="w-6 h-6" />
          Pourboires
          {role === "server" && (
            <Badge className="bg-slate-500/30 text-slate-300 text-xs ml-1">Vue personnelle</Badge>
          )}
        </h2>
        {canEdit && (
          <Button onClick={openCreate} className="bg-amber-600 hover:bg-amber-700" data-testid="new-tip-btn">
            <Plus className="w-4 h-4 mr-2" /> Nouveau pourboire
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-amber-900/20 border-amber-500/40">
          <CardContent className="p-3">
            <div className="text-xs text-amber-300 flex items-center gap-1"><Calendar className="w-3 h-3" /> Aujourd'hui</div>
            <div className="text-lg font-bold text-amber-200" data-testid="tips-day-total">{formatPrice(dayTotal)} F</div>
            <div className="text-[11px] text-slate-400">{summary?.day?.count || 0} entrée(s)</div>
          </CardContent>
        </Card>
        <Card className="bg-cyan-900/20 border-cyan-500/40">
          <CardContent className="p-3">
            <div className="text-xs text-cyan-300 flex items-center gap-1"><Calendar className="w-3 h-3" /> Semaine</div>
            <div className="text-lg font-bold text-cyan-200" data-testid="tips-week-total">{formatPrice(weekTotal)} F</div>
            <div className="text-[11px] text-slate-400">{summary?.week?.count || 0} entrée(s)</div>
          </CardContent>
        </Card>
        <Card className="bg-indigo-900/20 border-indigo-500/40">
          <CardContent className="p-3">
            <div className="text-xs text-indigo-300 flex items-center gap-1"><UsersIcon className="w-3 h-3" /> Pool (semaine)</div>
            <div className="text-lg font-bold text-indigo-200">{formatPrice(poolWeek)} F</div>
          </CardContent>
        </Card>
        <Card className="bg-emerald-900/20 border-emerald-500/40">
          <CardContent className="p-3">
            <div className="text-xs text-emerald-300 flex items-center gap-1"><Wallet className="w-3 h-3" /> Agents (semaine)</div>
            <div className="text-lg font-bold text-emerald-200">{formatPrice(serverWeek)} F</div>
          </CardContent>
        </Card>
      </div>

      {/* Ranking (admin/manager only, server doesn't need ranking) */}
      {canEdit && ranking.length > 0 && (
        <Card className="bg-slate-800/40 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-200 text-sm flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" /> Classement agents (semaine)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5" data-testid="tips-ranking">
              {ranking.map((r, idx) => {
                const medal = ["bg-yellow-500/20 text-yellow-300", "bg-slate-400/20 text-slate-200", "bg-orange-600/20 text-orange-300"][idx] || "bg-slate-700/30 text-slate-300";
                return (
                  <div key={r.server_name} className="flex items-center justify-between text-sm bg-slate-700/20 rounded px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <Badge className={`${medal} w-6 h-6 flex items-center justify-center rounded-full p-0 text-xs`}>{idx + 1}</Badge>
                      <span className="text-white font-medium">{r.server_name}</span>
                      <span className="text-slate-400 text-xs">({r.count})</span>
                    </div>
                    <span className="text-emerald-300 font-semibold">{formatPrice(r.total)} F</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tips list */}
      <Card className="bg-slate-800/40 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-slate-200 text-sm">Historique ({tips.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-slate-400 text-center py-8">Chargement…</div>
          ) : tips.length === 0 ? (
            <div className="text-slate-500 text-center py-10 flex flex-col items-center gap-2">
              <Coins className="w-10 h-10 opacity-40" />
              Aucun pourboire enregistré
            </div>
          ) : (
            <div className="space-y-1.5">
              {tips.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 bg-slate-700/20 rounded px-2 py-2" data-testid={`tip-row-${t.id}`}>
                  <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                    <Badge className="bg-slate-700/50 text-slate-300 text-xs shrink-0">{t.date}</Badge>
                    <Badge className={`${PAYMENT_COLORS[t.payment_method] || PAYMENT_COLORS.other} text-xs shrink-0`}>
                      {PAYMENT_LABELS[t.payment_method] || t.payment_method}
                    </Badge>
                    {t.attribution_type === "pool" ? (
                      <Badge className="bg-indigo-500/20 text-indigo-300 text-xs shrink-0">
                        <UsersIcon className="w-3 h-3 mr-1" /> Pool
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-500/20 text-emerald-300 text-xs shrink-0">
                        {t.server_name || "—"}
                      </Badge>
                    )}
                    {t.notes && <span className="text-slate-400 text-xs italic truncate">« {t.notes} »</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-amber-300 font-bold">{formatPrice(t.amount)} F</span>
                    {canEdit && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(t)} className="h-7 w-7 p-0 text-slate-300 hover:bg-slate-600/40" data-testid={`tip-edit-${t.id}`}>
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteTip(t.id)} className="h-7 w-7 p-0 text-rose-400 hover:bg-rose-500/20" data-testid={`tip-delete-${t.id}`}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-amber-300 flex items-center gap-2">
              <Coins className="w-5 h-5" /> {editing ? "Modifier le pourboire" : "Nouveau pourboire"}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Par défaut, le pourboire est versé au pool commun. Activez « Attribuer à un agent » pour le lier à une personne.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-slate-300 text-sm">Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="bg-slate-700/50 border-slate-600 text-white" data-testid="tip-date-input" />
              </div>
              <div>
                <Label className="text-slate-300 text-sm">Montant (F)</Label>
                <Input type="number" step="any" value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value.replace(",", ".")) || 0 })}
                  className="bg-slate-700/50 border-slate-600 text-white text-lg font-bold"
                  data-testid="tip-amount-input" />
              </div>
            </div>

            <div>
              <Label className="text-slate-300 text-sm">Mode de paiement</Label>
              <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white" data-testid="tip-method-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="cash">Espèces</SelectItem>
                  <SelectItem value="mobile_money">Mobile money</SelectItem>
                  <SelectItem value="card">Carte</SelectItem>
                  <SelectItem value="other">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-slate-900/40 rounded p-3 border border-slate-700 space-y-2">
              <Label className="text-slate-300 text-sm">Attribution</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={form.attribution_type === "pool" ? "default" : "outline"}
                  onClick={() => setForm({ ...form, attribution_type: "pool", server_name: "" })}
                  className={form.attribution_type === "pool" ? "bg-indigo-600 hover:bg-indigo-700 flex-1" : "border-slate-600 text-slate-300 flex-1"}
                  data-testid="tip-attr-pool"
                >
                  <UsersIcon className="w-4 h-4 mr-1" /> Pool (par défaut)
                </Button>
                <Button
                  type="button"
                  variant={form.attribution_type === "server" ? "default" : "outline"}
                  onClick={() => setForm({ ...form, attribution_type: "server" })}
                  className={form.attribution_type === "server" ? "bg-emerald-600 hover:bg-emerald-700 flex-1" : "border-slate-600 text-slate-300 flex-1"}
                  data-testid="tip-attr-server"
                >
                  <Trophy className="w-4 h-4 mr-1" /> Agent
                </Button>
              </div>
              {form.attribution_type === "server" && (
                <div>
                  <Label className="text-slate-300 text-xs">Agent bénéficiaire</Label>
                  <Select value={form.server_name} onValueChange={(v) => setForm({ ...form, server_name: v })}>
                    <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white" data-testid="tip-server-select">
                      <SelectValue placeholder="Choisir un agent" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {servers.length === 0 ? (
                        <SelectItem value="__none" disabled>Aucun agent disponible</SelectItem>
                      ) : servers.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div>
              <Label className="text-slate-300 text-sm">Notes (optionnel)</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="bg-slate-700/50 border-slate-600 text-white"
                placeholder="Table X, soirée anniv..." />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowModal(false)} className="border-slate-600 text-slate-300">Annuler</Button>
              <Button onClick={saveTip} className="bg-amber-600 hover:bg-amber-700" data-testid="tip-save-btn">
                {editing ? "Mettre à jour" : "Enregistrer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TipsTab;
