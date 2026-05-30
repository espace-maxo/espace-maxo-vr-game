/**
 * CoachJeuxPage — Page dédiée au profil "coach_jeux".
 *
 * - Onglet "Nouveau bon" : sélection jeu (catalogue dept=jeux), nb parties,
 *   joueurs (texte libre), prix unitaire modifiable, durée optionnelle, notes.
 *   Transmission au Resp. Op. (statut pending, lecture seule).
 * - Onglet "Mes bons" : historique avec statut (pending/attached/invoiced/rejected).
 *
 * Pas d'accès aux factures, caisse, stocks.
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
  Clock, CheckCircle2, XCircle, FileText, Receipt, Hash, Coins,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_META = {
  pending:  { label: "En attente",      color: "bg-amber-500/30 text-amber-200 border-amber-500/40",   icon: Clock },
  attached: { label: "Rattaché à table", color: "bg-blue-500/30 text-blue-200 border-blue-500/40",     icon: Hash },
  invoiced: { label: "Facturé direct",  color: "bg-emerald-500/30 text-emerald-100 border-emerald-500/40", icon: Receipt },
  rejected: { label: "Refusé",          color: "bg-rose-500/30 text-rose-100 border-rose-500/40",      icon: XCircle },
};

const CoachJeuxPage = ({ currentUser, onLogout }) => {
  const [activeTab, setActiveTab] = useState("new");

  // --- Catalog ---
  const [catalog, setCatalog] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // --- Form state ---
  const [selectedId, setSelectedId] = useState("");
  const [parties, setParties] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [players, setPlayers] = useState("");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // --- History ---
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const actorRole = currentUser?.role || "coach_jeux";
  const actorName = currentUser?.full_name || currentUser?.username || "Coach";

  const selectedProduct = useMemo(
    () => catalog.find((p) => p.id === selectedId),
    [catalog, selectedId],
  );

  const total = useMemo(
    () => Math.round((Number(unitPrice) || 0) * (Number(parties) || 0)),
    [unitPrice, parties],
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

  // Reset price when product changes
  useEffect(() => {
    if (selectedProduct) setUnitPrice(selectedProduct.price || 0);
  }, [selectedProduct]);

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
    if (!selectedProduct) return toast.error("Sélectionnez un jeu");
    if (!parties || parties < 1) return toast.error("Nombre de parties invalide");
    if (unitPrice < 0) return toast.error("Prix invalide");
    setSubmitting(true);
    try {
      await axios.post(`${API}/jeux/bons`, {
        jeu_product_id: selectedProduct.id,
        jeu_name: selectedProduct.name,
        parties: Number(parties),
        unit_price: Number(unitPrice),
        players: players.trim(),
        duration_minutes: duration ? Number(duration) : null,
        notes: notes.trim(),
        coach_name: actorName,
        coach_role: actorRole,
      });
      toast.success("Bon transmis au Responsable des Opérations");
      // Reset form
      setSelectedId("");
      setParties(1);
      setUnitPrice(0);
      setPlayers("");
      setDuration("");
      setNotes("");
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
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="text-rose-400 hover:text-rose-300 h-8"
            data-testid="coach-jeux-logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-slate-800/60 border border-slate-700">
            <TabsTrigger value="new" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white"
                         data-testid="coach-tab-new">
              <Send className="w-4 h-4 mr-1" />
              Nouveau bon
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
          </TabsList>

          {/* NOUVEAU BON */}
          <TabsContent value="new" className="mt-3">
            <Card className="bg-slate-800/60 border-purple-500/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Gamepad2 className="w-5 h-5 text-purple-400" />
                  Nouveau bon de jeu
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-slate-300">Jeu *</Label>
                    <Select value={selectedId} onValueChange={setSelectedId}>
                      <SelectTrigger className="bg-slate-900 border-slate-700" data-testid="coach-select-jeu">
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
                    <Label className="text-xs text-slate-300">Nombre de parties *</Label>
                    <Input type="number" min={1} value={parties}
                           onChange={(e) => setParties(e.target.value)}
                           className="bg-slate-900 border-slate-700"
                           data-testid="coach-input-parties" />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-300 flex items-center gap-1">
                      <Coins className="w-3 h-3" /> Prix unitaire (modifiable)
                    </Label>
                    <Input type="number" min={0} step="50" value={unitPrice}
                           onChange={(e) => setUnitPrice(e.target.value)}
                           className="bg-slate-900 border-slate-700"
                           data-testid="coach-input-price" />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-300">Durée (min) — optionnel</Label>
                    <Input type="number" min={0} value={duration}
                           onChange={(e) => setDuration(e.target.value)}
                           placeholder="Ex: 30"
                           className="bg-slate-900 border-slate-700"
                           data-testid="coach-input-duration" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-slate-300 flex items-center gap-1">
                    <Users className="w-3 h-3" /> Joueurs (texte libre)
                  </Label>
                  <Textarea value={players} onChange={(e) => setPlayers(e.target.value)}
                            placeholder="Ex: Jean, Marie, Paul…"
                            className="bg-slate-900 border-slate-700 min-h-[60px]"
                            data-testid="coach-input-players" />
                </div>
                <div>
                  <Label className="text-xs text-slate-300">Notes / commentaire</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                            placeholder="Notes éventuelles…"
                            className="bg-slate-900 border-slate-700 min-h-[50px]"
                            data-testid="coach-input-notes" />
                </div>

                <div className="flex items-center justify-between bg-purple-900/30 border border-purple-500/40 rounded p-3">
                  <span className="text-sm text-purple-100">Total à transmettre :</span>
                  <span className="text-xl font-bold text-purple-200" data-testid="coach-total">
                    {total.toLocaleString("fr-FR")} F
                  </span>
                </div>

                <Button
                  onClick={handleSubmit}
                  disabled={submitting || !selectedProduct}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white h-11"
                  data-testid="coach-submit-bon"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Envoi…</>
                  ) : (
                    <><Send className="w-4 h-4 mr-2" /> Transmettre au Responsable</>
                  )}
                </Button>
              </CardContent>
            </Card>
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
                  <Button variant="ghost" size="sm" onClick={loadHistory}
                          disabled={loadingHistory} className="text-slate-300 h-7 text-[11px]"
                          data-testid="coach-history-refresh">
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
                  return (
                    <div key={b.id}
                         className={`rounded border ${meta.color} p-2.5`}
                         data-testid={`coach-bon-${b.id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Gamepad2 className="w-3.5 h-3.5 shrink-0" />
                            <span className="font-semibold text-sm truncate">{b.jeu_name}</span>
                            <Badge className="bg-slate-700 text-slate-200 text-[10px]">x{b.parties} parties</Badge>
                            <Badge className="bg-emerald-700/50 text-emerald-100 text-[10px]">{b.total.toLocaleString("fr-FR")} F</Badge>
                          </div>
                          {b.players && (
                            <p className="text-[11px] text-slate-300 mt-0.5 truncate">
                              <Users className="w-3 h-3 inline mr-1" /> {b.players}
                            </p>
                          )}
                          {b.duration_minutes ? (
                            <p className="text-[10px] text-slate-400 mt-0.5">Durée : {b.duration_minutes} min</p>
                          ) : null}
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
                        {b.processed_by && (
                          <span>par {b.processed_by}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default CoachJeuxPage;
