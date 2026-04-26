/**
 * NeedsTab — Liste de besoins (tous espaces).
 * Gérante : crée, édite, supprime ses besoins (brouillon).
 * Admin : voit tout, peut annuler, ou convertir en demande d'achats.
 * Réutilise l'analyse intelligente (doublons, stock, trésorerie) via /needs/analysis.
 */
import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus, Trash2, Send, ClipboardList, Flame, CheckCircle, X, Edit2,
  Home, Gamepad2, TreePine, UtensilsCrossed, Droplets, Package, ArrowRightCircle,
  FileText, FileSpreadsheet,
} from "lucide-react";
import ExpenseAnalysisBadges from "./ExpenseAnalysisBadges";

const API = (process.env.REACT_APP_BACKEND_URL || "") + "/api";
const formatPrice = (p) => new Intl.NumberFormat("fr-FR").format(Math.round(p || 0));

const LOCATIONS = [
  { value: "salle", label: "Salle", icon: Home, color: "bg-blue-500/20 text-blue-300" },
  { value: "salle_jeux", label: "Salle de jeux", icon: Gamepad2, color: "bg-fuchsia-500/20 text-fuchsia-300" },
  { value: "jardin", label: "Jardin", icon: TreePine, color: "bg-emerald-500/20 text-emerald-300" },
  { value: "cuisine", label: "Cuisine", icon: UtensilsCrossed, color: "bg-orange-500/20 text-orange-300" },
  { value: "toilettes", label: "Toilettes", icon: Droplets, color: "bg-cyan-500/20 text-cyan-300" },
  { value: "autres", label: "Autres", icon: Package, color: "bg-slate-500/20 text-slate-300" },
];
const LOC_MAP = Object.fromEntries(LOCATIONS.map((l) => [l.value, l]));

const STATUS_LABEL = {
  en_attente: { label: "En attente", class: "bg-amber-500/20 text-amber-300" },
  traite: { label: "Traité", class: "bg-emerald-500/20 text-emerald-300" },
  annule: { label: "Annulé", class: "bg-rose-500/20 text-rose-300" },
};

const emptyNewItem = { location: "cuisine", description: "", quantity: 1, unit_price: 0, notes: "" };

const NeedsTab = ({ currentUser }) => {
  const [needs, setNeeds] = useState([]);
  const [analyses, setAnalyses] = useState({});
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");

  // Creation modal (list of items like shopping list)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingNeed, setEditingNeed] = useState(null);
  const [listItems, setListItems] = useState([]);
  const [listLocation, setListLocation] = useState("cuisine");
  const [listDescription, setListDescription] = useState("");
  const [listUrgency, setListUrgency] = useState("normale");
  const [listSupplier, setListSupplier] = useState("");
  const [listNotes, setListNotes] = useState("");
  const [newItem, setNewItem] = useState(emptyNewItem);

  const isAdmin = currentUser?.role === "admin";
  const isManager = currentUser?.role === "manager";
  const requesterName = currentUser?.name || currentUser?.username || "Gérante";

  const fetchNeeds = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== "all") params.status = statusFilter;
      if (locationFilter !== "all") params.location = locationFilter;
      const res = await axios.get(`${API}/needs`, { params });
      setNeeds(res.data.needs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, locationFilter]);

  const fetchAnalysis = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/needs/analysis`);
      const map = {};
      (res.data.analyses || []).forEach((a) => { map[a.need_id] = a; });
      setAnalyses(map);
    } catch (e) {
      // silent
    }
  }, []);

  useEffect(() => { fetchNeeds(); }, [fetchNeeds]);
  useEffect(() => { if (isAdmin) fetchAnalysis(); }, [isAdmin, needs, fetchAnalysis]);

  const resetListForm = () => {
    setListItems([]);
    setListLocation("cuisine");
    setListDescription("");
    setListUrgency("normale");
    setListSupplier("");
    setListNotes("");
    setNewItem(emptyNewItem);
    setEditingNeed(null);
  };

  const openCreate = () => {
    resetListForm();
    setShowCreateModal(true);
  };

  const openEdit = (need) => {
    setEditingNeed(need);
    setListItems((need.items || []).map((it, i) => ({
      id: i + Date.now(),
      location: it.location || need.location,
      description: it.description,
      quantity: it.quantity || 1,
      unit_price: it.unit_price || 0,
      amount: (it.quantity || 1) * (it.unit_price || 0),
      notes: it.notes || "",
    })));
    setListLocation(need.location || "cuisine");
    setListDescription(need.description || "");
    setListUrgency(need.urgency || "normale");
    setListSupplier(need.supplier || "");
    setListNotes(need.notes || "");
    setShowCreateModal(true);
  };

  const addItemToList = () => {
    if (!newItem.description.trim()) {
      toast.error("Description requise");
      return;
    }
    const amt = (newItem.quantity || 1) * (newItem.unit_price || 0);
    setListItems([...listItems, { ...newItem, amount: amt, id: Date.now() }]);
    setNewItem({ ...emptyNewItem, location: newItem.location });
  };

  const removeFromList = (id) => setListItems(listItems.filter((x) => x.id !== id));

  const getListTotal = () => listItems.reduce((s, it) => s + (it.amount || 0), 0);

  const saveNeed = async () => {
    if (listItems.length === 0) {
      toast.error("Ajoutez au moins un article");
      return;
    }
    const desc = listDescription.trim() || `Besoins ${LOC_MAP[listLocation]?.label || ""} - ${new Date().toLocaleDateString("fr-FR")}`;
    const payload = {
      location: listLocation,
      description: desc,
      items: listItems.map((it) => ({
        location: it.location || listLocation,
        description: it.description,
        quantity: it.quantity || 1,
        unit_price: it.unit_price || 0,
        amount: it.amount || (it.quantity || 1) * (it.unit_price || 0),
        notes: it.notes || "",
      })),
      quantity: listItems.length,
      amount: getListTotal(),
      supplier: listSupplier || null,
      urgency: listUrgency,
      notes: listNotes || "",
      requested_by: requesterName,
    };
    try {
      if (editingNeed) {
        await axios.put(`${API}/needs/${editingNeed.id}`, {
          ...payload,
          status: "en_attente",
        });
        toast.success("Besoin mis à jour");
      } else {
        await axios.post(`${API}/needs`, payload);
        toast.success(`Besoin créé avec ${listItems.length} article(s)`);
      }
      setShowCreateModal(false);
      resetListForm();
      fetchNeeds();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const deleteNeed = async (id) => {
    if (!confirm("Supprimer ce besoin ?")) return;
    try {
      await axios.delete(`${API}/needs/${id}`);
      toast.success("Supprimé");
      fetchNeeds();
    } catch (e) {
      toast.error("Erreur");
    }
  };

  const cancelNeed = async (id) => {
    const reason = prompt("Raison de l'annulation (optionnel) :", "");
    try {
      await axios.post(`${API}/needs/${id}/cancel`, { reason: reason || "" });
      toast.success("Besoin annulé");
      fetchNeeds();
    } catch (e) {
      toast.error("Erreur");
    }
  };

  const convertToExpense = async (id) => {
    if (!confirm("Convertir ce besoin en demande d'achats ?")) return;
    try {
      const res = await axios.post(`${API}/needs/${id}/convert-to-expense`, { category: "autres" });
      if (res.data?.success) {
        toast.success("Demande d'achats créée");
        fetchNeeds();
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const countByStatus = {
    en_attente: needs.filter((n) => n.status === "en_attente").length,
    traite: needs.filter((n) => n.status === "traite").length,
    annule: needs.filter((n) => n.status === "annule").length,
  };

  const exportNeeds = async (kind) => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (locationFilter !== "all") params.append("location", locationFilter);
      const url = `${API}/needs/export/${kind}${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await axios.get(url, { responseType: "blob" });
      const mime = kind === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const ext = kind === "pdf" ? "pdf" : "xlsx";
      const blob = new Blob([res.data], { type: mime });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `liste_besoins_${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(`Export ${ext.toUpperCase()} téléchargé`);
    } catch (e) {
      toast.error("Erreur lors de l'export");
    }
  };

  return (
    <div className="space-y-4" data-testid="needs-tab">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-indigo-300 flex items-center gap-2">
          <ClipboardList className="w-6 h-6" />
          Liste de besoins
          {countByStatus.en_attente > 0 && (
            <Badge className="bg-amber-500/30 text-amber-200 ml-2">{countByStatus.en_attente} en attente</Badge>
          )}
        </h2>
        {(isManager || isAdmin) && (
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => exportNeeds("pdf")}
              disabled={needs.length === 0}
              className="border-rose-500/50 text-rose-300 hover:bg-rose-500/20"
              data-testid="export-needs-pdf"
            >
              <FileText className="w-4 h-4 mr-2" /> PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => exportNeeds("excel")}
              disabled={needs.length === 0}
              className="border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/20"
              data-testid="export-needs-excel"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" /> Excel
            </Button>
            <Button
              onClick={openCreate}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
              data-testid="new-need-btn"
            >
              <Plus className="w-4 h-4 mr-2" /> Nouveau besoin
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 bg-slate-800/50 border-slate-700 text-white" data-testid="needs-status-filter">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="en_attente">En attente</SelectItem>
            <SelectItem value="traite">Traités</SelectItem>
            <SelectItem value="annule">Annulés</SelectItem>
          </SelectContent>
        </Select>
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="w-44 bg-slate-800/50 border-slate-700 text-white" data-testid="needs-location-filter">
            <SelectValue placeholder="Espace" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all">Tous les espaces</SelectItem>
            {LOCATIONS.map((l) => (
              <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2 ml-auto">
          <Badge className="bg-amber-500/20 text-amber-300">{countByStatus.en_attente} en attente</Badge>
          <Badge className="bg-emerald-500/20 text-emerald-300">{countByStatus.traite} traités</Badge>
          <Badge className="bg-rose-500/20 text-rose-300">{countByStatus.annule} annulés</Badge>
        </div>
      </div>

      {/* Needs grid */}
      {loading ? (
        <div className="text-center text-slate-400 py-10">Chargement…</div>
      ) : needs.length === 0 ? (
        <Card className="bg-slate-800/30 border-slate-700">
          <CardContent className="py-10 text-center text-slate-400">
            <ClipboardList className="w-12 h-12 mx-auto mb-2 opacity-40" />
            <p>Aucun besoin pour le moment</p>
            {(isManager || isAdmin) && (
              <Button variant="outline" size="sm" className="mt-3 border-slate-600 text-slate-300" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-1" /> Créer le premier
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {needs.map((n) => {
            const loc = LOC_MAP[n.location] || LOC_MAP.autres;
            const Icon = loc.icon;
            const st = STATUS_LABEL[n.status] || STATUS_LABEL.en_attente;
            const analysis = isAdmin ? analyses[n.id] : null;
            const isPending = n.status === "en_attente";
            return (
              <Card key={n.id} className="bg-slate-800/50 border-slate-700" data-testid={`need-card-${n.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={loc.color}>
                          <Icon className="w-3 h-3 mr-1" /> {loc.label}
                        </Badge>
                        <Badge className={st.class}>{st.label}</Badge>
                        {n.urgency === "urgente" && (
                          <Badge className="bg-rose-500/30 text-rose-200"><Flame className="w-3 h-3 mr-1" /> Urgent</Badge>
                        )}
                      </div>
                      <CardTitle className="text-white text-base">{n.description}</CardTitle>
                      <div className="text-xs text-slate-400 mt-1">
                        Par {n.requested_by} • {(n.created_at || "").slice(0, 10)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-indigo-300 font-bold">{formatPrice(n.amount)} F</div>
                      <div className="text-xs text-slate-500">{(n.items || []).length} article(s)</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(n.items || []).length > 0 && (
                    <div className="bg-slate-900/40 rounded p-2 max-h-32 overflow-y-auto">
                      <ul className="space-y-0.5 text-xs">
                        {(n.items || []).slice(0, 10).map((it, i) => (
                          <li key={i} className="flex justify-between gap-2">
                            <span className="text-slate-200 truncate">{it.description}</span>
                            <span className="text-slate-400 shrink-0">
                              {it.quantity || 1} × {formatPrice(it.unit_price || 0)} F
                            </span>
                          </li>
                        ))}
                        {(n.items || []).length > 10 && (
                          <li className="text-slate-500 italic text-center">
                            + {(n.items || []).length - 10} autre(s)
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  {n.notes && (
                    <div className="text-xs text-slate-400 italic">« {n.notes} »</div>
                  )}
                  {n.converted_to_expense_id && (
                    <div className="text-xs text-emerald-400 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Converti en demande d'achats
                    </div>
                  )}

                  {analysis && isPending && (
                    <div className="pt-1 border-t border-slate-700/50">
                      <ExpenseAnalysisBadges analysis={analysis} />
                    </div>
                  )}

                  <div className="flex gap-2 pt-2 flex-wrap">
                    {isPending && (isManager || isAdmin) && (
                      <>
                        <Button size="sm" variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700" onClick={() => openEdit(n)} data-testid={`edit-need-${n.id}`}>
                          <Edit2 className="w-3 h-3 mr-1" /> Modifier
                        </Button>
                        <Button size="sm" variant="outline" className="border-rose-600/60 text-rose-300 hover:bg-rose-500/20" onClick={() => deleteNeed(n.id)} data-testid={`delete-need-${n.id}`}>
                          <Trash2 className="w-3 h-3 mr-1" /> Supprimer
                        </Button>
                      </>
                    )}
                    {isPending && isAdmin && (
                      <>
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => convertToExpense(n.id)} data-testid={`convert-need-${n.id}`}>
                          <ArrowRightCircle className="w-3 h-3 mr-1" /> Convertir en achats
                        </Button>
                        <Button size="sm" variant="outline" className="border-rose-600/60 text-rose-300 hover:bg-rose-500/20" onClick={() => cancelNeed(n.id)} data-testid={`cancel-need-${n.id}`}>
                          <X className="w-3 h-3 mr-1" /> Annuler
                        </Button>
                      </>
                    )}
                    {/* Admin: bouton Supprimer disponible pour tous les statuts (traité, annulé) */}
                    {!isPending && isAdmin && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-rose-600/60 text-rose-300 hover:bg-rose-500/20"
                        onClick={() => deleteNeed(n.id)}
                        data-testid={`admin-delete-need-${n.id}`}
                        title="Supprimer définitivement ce besoin"
                      >
                        <Trash2 className="w-3 h-3 mr-1" /> Supprimer
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit modal (mirrors Shopping List) */}
      <Dialog open={showCreateModal} onOpenChange={(open) => {
        if (!open && listItems.length > 0 && !editingNeed) {
          if (!confirm("Articles non enregistrés. Fermer quand même ?")) return;
        }
        setShowCreateModal(open);
        if (!open) resetListForm();
      }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-indigo-300 flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              {editingNeed ? "Modifier le besoin" : "Nouveau besoin"}
              {listItems.length > 0 && (
                <Badge className="bg-indigo-500/30 text-indigo-200 ml-2">
                  {listItems.length} article(s) • {formatPrice(getListTotal())} F
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Renseignez les articles dont vous avez besoin, avec ou sans prix. L'admin pourra les convertir en demande d'achats.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Global list settings */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-700/30 rounded-lg p-3">
              <div>
                <Label className="text-slate-300 text-sm">Espace principal</Label>
                <Select value={listLocation} onValueChange={setListLocation}>
                  <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white" data-testid="need-location-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {LOCATIONS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-300 text-sm">Urgence</Label>
                <Select value={listUrgency} onValueChange={setListUrgency}>
                  <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="normale">Normale</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-slate-300 text-sm">Libellé du besoin (optionnel)</Label>
                <Input
                  value={listDescription}
                  onChange={(e) => setListDescription(e.target.value)}
                  placeholder="Ex : Besoins cuisine semaine 18"
                  className="bg-slate-700/50 border-slate-600 text-white"
                  data-testid="need-description-input"
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-slate-300 text-sm">Fournisseur ou fournisseur pressenti (optionnel)</Label>
                <Input
                  value={listSupplier}
                  onChange={(e) => setListSupplier(e.target.value)}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
            </div>

            {/* Add new article */}
            <Card className="bg-indigo-900/20 border-indigo-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-indigo-300 text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Ajouter un article
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
                  <Select value={newItem.location} onValueChange={(v) => setNewItem({ ...newItem, location: v })}>
                    <SelectTrigger className="w-full sm:w-[140px] bg-slate-700/50 border-slate-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {LOCATIONS.map((l) => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={newItem.description}
                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                    placeholder="Article / besoin"
                    className="flex-1 min-w-[150px] bg-slate-700/50 border-slate-600 text-white"
                    data-testid="new-item-desc"
                  />
                  <Input
                    type="number" min="0" step="any"
                    value={newItem.quantity || ""}
                    onChange={(e) => setNewItem({ ...newItem, quantity: parseFloat(e.target.value.replace(',', '.')) || 1 })}
                    placeholder="Qté"
                    className="w-full sm:w-[70px] bg-slate-700/50 border-slate-600 text-white"
                  />
                  <Input
                    type="number"
                    value={newItem.unit_price || ""}
                    onChange={(e) => setNewItem({ ...newItem, unit_price: parseFloat(e.target.value) || 0 })}
                    placeholder="Prix (opt.)"
                    className="w-full sm:w-[110px] bg-slate-700/50 border-slate-600 text-white"
                  />
                  <div className="flex items-center bg-indigo-900/30 rounded px-2 text-indigo-300 text-sm">
                    = {formatPrice((newItem.quantity || 1) * (newItem.unit_price || 0))} F
                  </div>
                  <Button onClick={addItemToList} className="bg-indigo-600 hover:bg-indigo-700" data-testid="add-item-btn">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-slate-500 mt-2">💡 Le prix est optionnel — laissez vide si vous ne le connaissez pas.</p>
              </CardContent>
            </Card>

            {/* Items list */}
            {listItems.length > 0 && (
              <Card className="bg-slate-700/30 border-slate-600">
                <CardHeader className="pb-2">
                  <CardTitle className="text-slate-300 text-sm">Articles du besoin</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 max-h-[220px] overflow-y-auto">
                  {listItems.map((it, idx) => {
                    const locItem = LOC_MAP[it.location] || LOC_MAP.autres;
                    return (
                      <div key={it.id} className="flex items-center justify-between gap-2 bg-slate-600/30 rounded-lg p-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-slate-400 text-sm font-mono">{idx + 1}.</span>
                          <Badge className={`text-xs shrink-0 ${locItem.color}`}>{locItem.label}</Badge>
                          <span className="text-white truncate">{it.description}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-slate-400 text-xs">
                            {it.quantity} × {formatPrice(it.unit_price)} = {formatPrice(it.amount)} F
                          </span>
                          <Button size="sm" variant="ghost" onClick={() => removeFromList(it.id)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/20 h-7 w-7 p-0">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Notes */}
            <div>
              <Label className="text-slate-300 text-sm">Notes complémentaires (optionnel)</Label>
              <Textarea
                value={listNotes}
                onChange={(e) => setListNotes(e.target.value)}
                className="bg-slate-700/50 border-slate-600 text-white min-h-[60px]"
                placeholder="Ex : besoin avant samedi, remplacement de l'ancien, etc."
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={saveNeed}
                className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                data-testid="save-need-btn"
              >
                <Send className="w-4 h-4 mr-2" />
                {editingNeed ? "Enregistrer" : `Soumettre ${listItems.length} article(s)`}
              </Button>
              <Button variant="outline" onClick={() => setShowCreateModal(false)} className="border-slate-600 text-slate-300">
                Annuler
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NeedsTab;
