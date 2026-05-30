/**
 * CoachJeuxPage — Page dédiée au profil "coach_jeux".
 *
 * - Onglet "Nouveau bon" : panier multi-lignes (un bon peut contenir plusieurs jeux/sessions).
 *   Pour chaque ligne : Jeu, Nb parties, Prix unitaire (modifiable), Durée (option), Note ligne (option).
 *   Champs globaux du bon : Joueurs (texte libre), Notes générales.
 * - Onglet "Mes bons" : historique avec statut (pending/attached/invoiced/rejected).
 *
 * Une fois transmis, le bon est verrouillé en lecture seule.
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Gamepad2, Send, History, RefreshCw, Loader2, LogOut, Users,
  Clock, CheckCircle2, XCircle, Receipt, Hash, Coins, Plus, Trash2, FileText,
} from "lucide-react";
import DailyReportPanel from "../components/DailyReportPanel";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_META = {
  pending:  { label: "En attente",       color: "bg-amber-500/30 text-amber-200 border-amber-500/40",   icon: Clock },
  attached: { label: "Rattaché à table", color: "bg-blue-500/30 text-blue-200 border-blue-500/40",     icon: Hash },
  invoiced: { label: "Facturé direct",   color: "bg-emerald-500/30 text-emerald-100 border-emerald-500/40", icon: Receipt },
  rejected: { label: "Refusé",           color: "bg-rose-500/30 text-rose-100 border-rose-500/40",      icon: XCircle },
};

const CoachJeuxPage = ({ currentUser, onLogout }) => {
  const [activeTab, setActiveTab] = useState("new");

  // --- Catalog ---
  const [catalog, setCatalog] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // --- Bon (panier) ---
  const [cart, setCart] = useState([]); // [{jeu_product_id, jeu_name, parties, unit_price, duration_minutes, notes}]
  const [players, setPlayers] = useState("");
  const [bonNotes, setBonNotes] = useState("");

  // --- Form add line ---
  const [lineJeu, setLineJeu] = useState("");
  const [lineParties, setLineParties] = useState(1);
  const [linePrice, setLinePrice] = useState(0);
  const [lineDuration, setLineDuration] = useState("");
  const [lineNotes, setLineNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);

  // --- History ---
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const actorRole = currentUser?.role || "coach_jeux";
  const actorName = currentUser?.full_name || currentUser?.username || "Coach";

  const selectedProduct = useMemo(
    () => catalog.find((p) => p.id === lineJeu),
    [catalog, lineJeu],
  );

  const cartTotal = useMemo(
    () => cart.reduce((sum, l) => sum + (Number(l.unit_price) || 0) * (Number(l.parties) || 0), 0),
    [cart],
  );

  const cartDuration = useMemo(
    () => cart.reduce((sum, l) => sum + (Number(l.duration_minutes) || 0), 0),
    [cart],
  );

  // Load catalog once
  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const r = await axios.get(`${API}/jeux/catalog`, { params: { actor_role: actorRole } });
      setCatalog(r.data.products || []);
    } catch (e) {
      toast.error("Erreur chargement catalogue");
    } finally {
      setLoadingCatalog(false);
    }
  }, [actorRole]);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  // Auto-fill price when product selection changes
  useEffect(() => {
    if (selectedProduct) setLinePrice(selectedProduct.price || 0);
  }, [selectedProduct]);

  const resetLineForm = () => {
    setLineJeu("");
    setLineParties(1);
    setLinePrice(0);
    setLineDuration("");
    setLineNotes("");
  };

  const addLineToCart = () => {
    if (!selectedProduct) return toast.error("Sélectionnez un jeu");
    const p = Number(lineParties) || 0;
    if (p < 1) return toast.error("Nombre de parties invalide");
    if (Number(linePrice) < 0) return toast.error("Prix invalide");
    setCart((c) => [...c, {
      jeu_product_id: selectedProduct.id,
      jeu_name: selectedProduct.name,
      parties: p,
      unit_price: Number(linePrice),
      duration_minutes: lineDuration ? Number(lineDuration) : null,
      notes: lineNotes.trim(),
    }]);
    resetLineForm();
    toast.success(`Ligne ajoutée : ${selectedProduct.name} x${p}`);
  };

  const removeLine = (idx) => {
    setCart((c) => c.filter((_, i) => i !== idx));
  };

  // Load history when switching tab
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const r = await axios.get(`${API}/jeux/bons`, {
        params: { actor_role: actorRole, actor_name: actorName, limit: 100 },
      });
      setHistory(r.data.bons || []);
    } catch {
      toast.error("Erreur chargement historique");
    } finally {
      setLoadingHistory(false);
    }
  }, [actorRole, actorName]);

  useEffect(() => {
    if (activeTab === "history") loadHistory();
  }, [activeTab, loadHistory]);

  const handleSubmit = async () => {
    if (cart.length === 0) return toast.error("Ajoutez au moins une ligne au bon");
    setSubmitting(true);
    try {
      await axios.post(`${API}/jeux/bons`, {
        items: cart,
        players: players.trim(),
        notes: bonNotes.trim(),
        coach_name: actorName,
        coach_role: actorRole,
      });
      toast.success(`Bon transmis au Responsable (${cart.length} ligne${cart.length > 1 ? "s" : ""})`);
      // Reset
      setCart([]);
      setPlayers("");
      setBonNotes("");
      resetLineForm();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur d'envoi");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950/30 to-slate-900 text-white">
      <div className="max-w-5xl mx-auto p-3 sm:p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-7 h-7 text-purple-400" />
            <div>
              <h1 className="text-lg sm:text-xl font-bold">
                Coach Jeux — {actorName}
              </h1>
              <p className="text-[10px] text-slate-400">
                {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onLogout}
                  className="text-rose-400 hover:text-rose-300 h-8" data-testid="coach-jeux-logout">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-slate-800/60 border border-slate-700">
            <TabsTrigger value="new" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white"
                         data-testid="coach-tab-new">
              <Send className="w-4 h-4 mr-1" />
              Nouveau bon
              {cart.length > 0 && (
                <Badge className="ml-2 bg-amber-500 text-white text-[10px]">{cart.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                         data-testid="coach-tab-history">
              <History className="w-4 h-4 mr-1" />
              Mes bons
              {history.filter((b) => b.status === "pending").length > 0 && (
                <Badge className="ml-2 bg-amber-500 text-white text-[10px]">
                  {history.filter((b) => b.status === "pending").length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="report" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
                         data-testid="coach-tab-report">
              <FileText className="w-4 h-4 mr-1" />
              Rapport du jour
            </TabsTrigger>
          </TabsList>

          {/* NOUVEAU BON */}
          <TabsContent value="new" className="mt-3 space-y-3">
            {/* Sub-form: ajouter une ligne */}
            <Card className="bg-slate-800/60 border-purple-500/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4 text-purple-400" />
                  Ajouter une ligne au bon
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] text-slate-300">Jeu *</Label>
                    <Select value={lineJeu} onValueChange={setLineJeu}>
                      <SelectTrigger className="bg-slate-900 border-slate-700 h-9 text-sm" data-testid="coach-select-jeu">
                        <SelectValue placeholder={loadingCatalog ? "Chargement…" : "Choisir un jeu"} />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        {catalog.length === 0 && (
                          <SelectItem value="__empty" disabled>Aucun jeu au catalogue</SelectItem>
                        )}
                        {catalog.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} — {p.price} F
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-slate-300">Nb parties *</Label>
                    <Input type="number" min={1} value={lineParties}
                           onChange={(e) => setLineParties(e.target.value)}
                           className="bg-slate-900 border-slate-700 h-9 text-sm"
                           data-testid="coach-input-parties" />
                  </div>
                  <div>
                    <Label className="text-[11px] text-slate-300 flex items-center gap-1">
                      <Coins className="w-3 h-3" /> Prix unitaire
                    </Label>
                    <Input type="number" min={0} step="50" value={linePrice}
                           onChange={(e) => setLinePrice(e.target.value)}
                           className="bg-slate-900 border-slate-700 h-9 text-sm"
                           data-testid="coach-input-price" />
                  </div>
                  <div>
                    <Label className="text-[11px] text-slate-300">Durée (min)</Label>
                    <Input type="number" min={0} value={lineDuration}
                           onChange={(e) => setLineDuration(e.target.value)}
                           placeholder="Optionnel"
                           className="bg-slate-900 border-slate-700 h-9 text-sm"
                           data-testid="coach-input-duration" />
                  </div>
                </div>
                <div>
                  <Label className="text-[11px] text-slate-300">Note de cette ligne (optionnelle)</Label>
                  <Input value={lineNotes} onChange={(e) => setLineNotes(e.target.value)}
                         placeholder="Ex: Tournoi, gain spécial…"
                         className="bg-slate-900 border-slate-700 h-9 text-sm"
                         data-testid="coach-input-line-notes" />
                </div>
                <Button onClick={addLineToCart} disabled={!selectedProduct}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white h-9 text-sm"
                        data-testid="coach-add-line">
                  <Plus className="w-4 h-4 mr-1" /> Ajouter cette ligne au bon
                </Button>
              </CardContent>
            </Card>

            {/* Panier */}
            {cart.length > 0 && (
              <Card className="bg-slate-800/60 border-amber-500/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-amber-400" />
                      Lignes du bon ({cart.length})
                    </span>
                    <span className="text-amber-200 font-bold" data-testid="cart-total">
                      {cartTotal.toLocaleString("fr-FR")} F
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {cart.map((l, idx) => (
                    <div key={idx}
                         className="flex items-center gap-2 bg-slate-900/50 rounded p-2 text-xs"
                         data-testid={`cart-line-${idx}`}>
                      <Gamepad2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-slate-100 truncate">{l.jeu_name}</span>
                          <Badge className="bg-slate-700 text-slate-200 text-[10px]">x{l.parties}</Badge>
                          <Badge className="bg-emerald-700/50 text-emerald-100 text-[10px]">
                            {(l.unit_price * l.parties).toLocaleString("fr-FR")} F
                          </Badge>
                          {l.duration_minutes && (
                            <Badge className="bg-blue-700/50 text-blue-100 text-[10px]">{l.duration_minutes} min</Badge>
                          )}
                        </div>
                        {l.notes && <p className="text-[10px] text-slate-400 italic mt-0.5">{l.notes}</p>}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => removeLine(idx)}
                              className="text-rose-400 hover:text-rose-300 h-7 w-7 p-0"
                              data-testid={`cart-remove-${idx}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Infos globales */}
            <Card className="bg-slate-800/60 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-300" />
                  Informations globales du bon
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <Label className="text-[11px] text-slate-300">Joueurs (texte libre)</Label>
                  <Textarea value={players} onChange={(e) => setPlayers(e.target.value)}
                            placeholder="Ex: Jean, Marie, Paul…"
                            className="bg-slate-900 border-slate-700 min-h-[50px] text-sm"
                            data-testid="coach-input-players" />
                </div>
                <div>
                  <Label className="text-[11px] text-slate-300">Notes générales du bon</Label>
                  <Textarea value={bonNotes} onChange={(e) => setBonNotes(e.target.value)}
                            placeholder="Notes éventuelles applicables à tout le bon…"
                            className="bg-slate-900 border-slate-700 min-h-[40px] text-sm"
                            data-testid="coach-input-notes" />
                </div>
              </CardContent>
            </Card>

            {/* Total + Submit */}
            <div className="flex items-center justify-between bg-purple-900/30 border border-purple-500/40 rounded p-3">
              <div>
                <span className="text-sm text-purple-100">Total à transmettre :</span>
                {cartDuration > 0 && (
                  <span className="text-[11px] text-slate-400 ml-2">· {cartDuration} min cumulées</span>
                )}
              </div>
              <span className="text-xl font-bold text-purple-200" data-testid="coach-total">
                {cartTotal.toLocaleString("fr-FR")} F
              </span>
            </div>

            <Button onClick={handleSubmit} disabled={submitting || cart.length === 0}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-11"
                    data-testid="coach-submit-bon">
              {submitting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Envoi…</>
              ) : (
                <><Send className="w-4 h-4 mr-2" /> Transmettre au Responsable ({cart.length} ligne{cart.length > 1 ? "s" : ""})</>
              )}
            </Button>
          </TabsContent>

          {/* MES BONS */}
          <TabsContent value="history" className="mt-3">
            <Card className="bg-slate-800/60 border-blue-500/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <History className="w-5 h-5 text-blue-400" />
                    Historique de mes bons
                  </span>
                  <Button variant="ghost" size="sm" onClick={loadHistory} disabled={loadingHistory}
                          className="text-slate-300 h-7 text-[11px]" data-testid="coach-history-refresh">
                    {loadingHistory ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                    Actualiser
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {history.length === 0 && !loadingHistory && (
                  <p className="text-slate-500 italic text-center py-6">
                    Aucun bon transmis pour l'instant.
                  </p>
                )}
                {history.map((b) => {
                  const meta = STATUS_META[b.status] || STATUS_META.pending;
                  const Icon = meta.icon;
                  // Compat: anciens bons mono-jeu
                  const items = b.items && b.items.length
                    ? b.items
                    : (b.jeu_product_id ? [{ jeu_name: b.jeu_name, parties: b.parties, total: b.total, duration_minutes: b.duration_minutes }] : []);
                  return (
                    <div key={b.id}
                         className={`rounded border ${meta.color} p-2.5`}
                         data-testid={`coach-bon-${b.id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            <Receipt className="w-3.5 h-3.5 shrink-0" />
                            <span className="font-semibold text-sm">Bon · {items.length} ligne{items.length > 1 ? "s" : ""}</span>
                            <Badge className="bg-emerald-700/50 text-emerald-100 text-[10px]">
                              {(b.total || 0).toLocaleString("fr-FR")} F
                            </Badge>
                          </div>
                          {/* Lignes */}
                          <div className="space-y-0.5 ml-1">
                            {items.map((it, idx) => (
                              <div key={idx} className="text-[11px] text-slate-300 flex items-center gap-1.5">
                                <Gamepad2 className="w-3 h-3 text-purple-400" />
                                <span>{it.jeu_name}</span>
                                <Badge className="bg-slate-700 text-slate-200 text-[9px]">x{it.parties}</Badge>
                                <span className="text-slate-400">{(it.total || 0).toLocaleString("fr-FR")} F</span>
                                {it.duration_minutes && <span className="text-slate-500">· {it.duration_minutes} min</span>}
                              </div>
                            ))}
                          </div>
                          {b.players && (
                            <p className="text-[11px] text-slate-300 mt-1">
                              <Users className="w-3 h-3 inline mr-1" /> {b.players}
                            </p>
                          )}
                          {b.notes && <p className="text-[10px] text-slate-400 italic mt-0.5">{b.notes}</p>}
                        </div>
                        <Badge className={`${meta.color} text-[10px] border shrink-0`}>
                          <Icon className="w-3 h-3 mr-1" /> {meta.label}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 flex flex-wrap gap-x-3">
                        <span>Créé : {b.created_at ? format(new Date(b.created_at), "HH:mm") : "—"}</span>
                        {b.status === "attached" && b.table_number != null && (
                          <span className="text-blue-300">→ Table {b.table_number}</span>
                        )}
                        {b.status === "invoiced" && b.invoice_number && (
                          <span className="text-emerald-300">→ Facture {b.invoice_number}</span>
                        )}
                        {b.status === "rejected" && b.rejection_reason && (
                          <span className="text-rose-300">Motif : {b.rejection_reason}</span>
                        )}
                        {b.processed_by && <span>par {b.processed_by}</span>}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          {/* RAPPORT DU JOUR */}
          <TabsContent value="report" className="mt-3">
            <DailyReportPanel currentUser={currentUser} kind="coach_jeux" />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default CoachJeuxPage;
