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
import PlayersTrackerTab from "./coach/PlayersTrackerTab";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const DEFAULT_HOURLY_RATE = 12000;  // 12 000 F / heure (forfait global)

const STATUS_META = {
  pending:  { label: "En attente",       color: "bg-amber-500/30 text-amber-200 border-amber-500/40",   icon: Clock },
  attached: { label: "Rattaché à table", color: "bg-blue-500/30 text-blue-200 border-blue-500/40",     icon: Hash },
  invoiced: { label: "Facturé direct",   color: "bg-emerald-500/30 text-emerald-100 border-emerald-500/40", icon: Receipt },
  rejected: { label: "Refusé",           color: "bg-rose-500/30 text-rose-100 border-rose-500/40",      icon: XCircle },
};

const CoachJeuxPage = ({ currentUser, onLogout }) => {
  const [activeTab, setActiveTab] = useState("players");

  // --- Catalog ---
  const [catalog, setCatalog] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // --- Bon (panier) ---
  const [cart, setCart] = useState([]); // [{jeu_product_id, jeu_name, parties, unit_price, duration_minutes, notes}]
  const [players, setPlayers] = useState("");
  const [bonNotes, setBonNotes] = useState("");

  // --- Form add line ---
  const [billingMode, setBillingMode] = useState("parties"); // "parties" | "hourly"
  const [lineJeu, setLineJeu] = useState("");
  const [lineParties, setLineParties] = useState(1);
  const [linePrice, setLinePrice] = useState(0);
  const [lineHours, setLineHours] = useState(1);
  const [lineHourlyRate, setLineHourlyRate] = useState(DEFAULT_HOURLY_RATE);
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
    setLineHours(1);
    setLineHourlyRate(DEFAULT_HOURLY_RATE);
    setLineDuration("");
    setLineNotes("");
    setBillingMode("parties");
  };

  const addLineToCart = () => {
    if (!selectedProduct) return toast.error("Sélectionnez un jeu");

    if (billingMode === "hourly") {
      const h = Number(lineHours) || 0;
      const rate = Number(lineHourlyRate) || 0;
      if (h <= 0) return toast.error("Nombre d'heures invalide");
      if (rate < 0) return toast.error("Tarif horaire invalide");
      const lineTotal = Math.round(h * rate);
      // Stockage: parties=1 (placeholder), unit_price=lineTotal (pour total)
      setCart((c) => [...c, {
        jeu_product_id: selectedProduct.id,
        jeu_name: selectedProduct.name,
        parties: 1,
        unit_price: lineTotal,
        duration_minutes: Math.round(h * 60),
        notes: lineNotes.trim(),
        billing_mode: "hourly",
        hours: h,
        hourly_rate: rate,
      }]);
      resetLineForm();
      toast.success(`Forfait ajouté : ${selectedProduct.name} · ${h}h`);
      return;
    }

    // Mode parties
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
      billing_mode: "parties",
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
            <TabsTrigger value="players" className="data-[state=active]:bg-fuchsia-600 data-[state=active]:text-white"
                         data-testid="coach-tab-players">
              <Users className="w-4 h-4 mr-1" />
              Joueurs
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
                            {items.map((it, idx) => {
                              const isH = it.billing_mode === "hourly";
                              return (
                              <div key={idx} className="text-[11px] text-slate-300 flex items-center gap-1.5 flex-wrap">
                                <Gamepad2 className={`w-3 h-3 ${isH ? "text-amber-400" : "text-purple-400"}`} />
                                <span>{it.jeu_name}</span>
                                {isH ? (
                                  <Badge className="bg-amber-700/50 text-amber-100 text-[9px]">Forfait {it.hours}h</Badge>
                                ) : (
                                  <Badge className="bg-slate-700 text-slate-200 text-[9px]">x{it.parties}</Badge>
                                )}
                                <span className="text-slate-400">{(it.total || 0).toLocaleString("fr-FR")} F</span>
                                {!isH && it.duration_minutes && <span className="text-slate-500">· {it.duration_minutes} min</span>}
                              </div>
                              );
                            })}
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

          {/* JOUEURS — Suivi consommation par joueur */}
          <TabsContent value="players" className="mt-3">
            <PlayersTrackerTab currentUser={currentUser} catalog={catalog} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default CoachJeuxPage;
