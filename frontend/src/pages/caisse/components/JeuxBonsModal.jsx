/**
 * JeuxBonsModal — Modal Resp. Op./Admin pour traiter les bons jeux transmis par le coach.
 *
 * Actions par bon (status === "pending") :
 *   - Rattacher à une table existante (select)
 *   - Facturer directement (sans table) — création invoice pending
 *   - Refuser (avec motif)
 *
 * Affiche aussi l'historique (tous les bons du jour, peu importe le statut).
 */
import React, { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Gamepad2, Hash, Receipt, XCircle, CheckCircle2, RefreshCw,
  Loader2, Users, Send, FileText,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const POLL_MS = 8000;

const JeuxBonsModal = ({ open, onOpenChange, currentUser, openTables = [] }) => {
  const [bons, setBons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [selectedTable, setSelectedTable] = useState({}); // bonId -> tableId
  const [customerName, setCustomerName] = useState({});  // bonId -> name
  const [rejectMode, setRejectMode] = useState({});      // bonId -> {open: bool, reason: ""}

  const actorRole = currentUser?.role || "manager";
  const actorName = currentUser?.full_name || currentUser?.username || "Resp. Op.";

  const fetchBons = useCallback(async (silent = true) => {
    if (!silent) setLoading(true);
    try {
      const r = await axios.get(`${API}/jeux/bons`, {
        params: { actor_role: actorRole, actor_name: actorName, limit: 200 },
        timeout: 10000,
      });
      setBons(r.data.bons || []);
    } catch (e) {
      if (!silent) toast.error("Erreur chargement bons");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [actorRole, actorName]);

  useEffect(() => {
    if (!open) return;
    fetchBons(false);
    const id = setInterval(() => fetchBons(true), POLL_MS);
    return () => clearInterval(id);
  }, [open, fetchBons]);

  const pendingBons = useMemo(() => bons.filter((b) => b.status === "pending"), [bons]);
  const processedBons = useMemo(() => bons.filter((b) => b.status !== "pending"), [bons]);

  const handleAttach = async (bon) => {
    const tableId = selectedTable[bon.id];
    if (!tableId) return toast.error("Sélectionnez une table");
    setProcessingId(bon.id);
    try {
      const r = await axios.post(`${API}/jeux/bons/${bon.id}/attach`, {
        table_id: tableId,
        actor_role: actorRole,
        actor_name: actorName,
      });
      toast.success(`Bon rattaché à la table ${r.data.table_number}`);
      fetchBons(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setProcessingId(null);
    }
  };

  const handleStandalone = async (bon) => {
    setProcessingId(bon.id);
    try {
      const r = await axios.post(`${API}/jeux/bons/${bon.id}/standalone`, {
        customer_name: customerName[bon.id] || "Client de passage",
        payment_method: "especes",
        actor_role: actorRole,
        actor_name: actorName,
      });
      toast.success(`Facture créée : ${r.data.invoice_number}`);
      fetchBons(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (bon) => {
    const rs = rejectMode[bon.id];
    const reason = (rs?.reason || "").trim();
    if (!reason) return toast.error("Motif requis");
    setProcessingId(bon.id);
    try {
      await axios.post(`${API}/jeux/bons/${bon.id}/reject`, {
        reason,
        actor_role: actorRole,
        actor_name: actorName,
      });
      toast.success("Bon refusé");
      setRejectMode((m) => ({ ...m, [bon.id]: { open: false, reason: "" } }));
      fetchBons(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[98vw] sm:w-auto max-h-[95vh] sm:max-h-[90vh] bg-slate-900 border-purple-500/40 text-white p-0 overflow-hidden">
        <DialogHeader className="p-2 sm:p-4 border-b border-slate-700 bg-gradient-to-r from-purple-900/50 to-slate-800">
          <DialogTitle className="flex items-center justify-between gap-2 text-sm sm:text-base">
            <span className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
              <Gamepad2 className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400 shrink-0" />
              <span className="truncate">Bons Jeux</span>
              <Badge className="bg-amber-500/30 text-amber-100 text-[10px] sm:text-xs">
                {pendingBons.length} en attente
              </Badge>
            </span>
            <Button variant="ghost" size="sm" onClick={() => fetchBons(false)} disabled={loading}
                    className="text-slate-300 h-7 w-7 sm:h-8 sm:w-8 p-0 shrink-0" data-testid="jeux-bons-refresh">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[calc(95vh-60px)] sm:h-[calc(90vh-70px)] p-2 sm:p-3">
          <div className="space-y-3">
            {/* PENDING */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-amber-400 mb-2 font-semibold">
                En attente de traitement
              </h3>
              {pendingBons.length === 0 && (
                <Card className="bg-slate-800/40 border-slate-700">
                  <CardContent className="p-4 text-center text-sm text-slate-500 italic">
                    Aucun bon en attente.
                  </CardContent>
                </Card>
              )}
              <div className="space-y-2">
                {pendingBons.map((b) => {
                  const isProcessing = processingId === b.id;
                  const isRejecting = rejectMode[b.id]?.open;
                  // Compat: anciens bons mono-jeu
                  const items = b.items && b.items.length
                    ? b.items
                    : (b.jeu_product_id ? [{ jeu_name: b.jeu_name, parties: b.parties, total: b.total, duration_minutes: b.duration_minutes }] : []);
                  const totalDuration = items.reduce((s, it) => s + (Number(it.duration_minutes) || 0), 0);
                  return (
                    <Card key={b.id}
                          className="bg-slate-800/60 border-amber-500/40"
                          data-testid={`pending-bon-${b.id}`}>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                              <Receipt className="w-4 h-4 text-amber-400" />
                              <span className="font-semibold text-sm">Bon · {items.length} ligne{items.length > 1 ? "s" : ""}</span>
                              <Badge className="bg-emerald-700/50 text-emerald-100 text-[10px]">
                                {(b.total || 0).toLocaleString("fr-FR")} F
                              </Badge>
                              {totalDuration > 0 && (
                                <Badge className="bg-blue-700/50 text-blue-100 text-[10px]">{totalDuration} min</Badge>
                              )}
                            </div>
                            {/* Liste des lignes */}
                            <div className="space-y-0.5 pl-1 border-l-2 border-purple-500/40 ml-1">
                              {items.map((it, idx) => (
                                <div key={idx} className="text-[11px] text-slate-300 flex items-center gap-1.5 flex-wrap pl-2">
                                  <Gamepad2 className="w-3 h-3 text-purple-400" />
                                  <span className="font-medium">{it.jeu_name}</span>
                                  <Badge className="bg-slate-700 text-slate-200 text-[9px]">x{it.parties}</Badge>
                                  <span className="text-slate-400">{(it.total || 0).toLocaleString("fr-FR")} F</span>
                                  {it.duration_minutes ? <span className="text-slate-500">· {it.duration_minutes} min</span> : null}
                                  {it.notes && <span className="text-slate-500 italic truncate">· {it.notes}</span>}
                                </div>
                              ))}
                            </div>
                            {b.players && (
                              <p className="text-[11px] text-slate-300 mt-1.5">
                                <Users className="w-3 h-3 inline mr-1" /> {b.players}
                              </p>
                            )}
                            {b.notes && (
                              <p className="text-[10px] text-slate-400 italic mt-0.5">{b.notes}</p>
                            )}
                          </div>
                          <div className="text-right text-[10px] text-slate-400 shrink-0">
                            <div>Coach : <span className="text-purple-300">{b.coach_name}</span></div>
                            <div>{b.created_at ? format(new Date(b.created_at), "HH:mm") : ""}</div>
                          </div>
                        </div>

                        {!isRejecting ? (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 border-t border-slate-700">
                            {/* Rattacher à table */}
                            <div className="space-y-1">
                              <Select
                                value={selectedTable[b.id] || ""}
                                onValueChange={(v) => setSelectedTable((s) => ({ ...s, [b.id]: v }))}
                              >
                                <SelectTrigger className="h-8 text-[11px] bg-slate-900 border-slate-700"
                                               data-testid={`select-table-${b.id}`}>
                                  <SelectValue placeholder="Choisir une table…" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-700">
                                  {openTables.length === 0 && (
                                    <SelectItem value="__empty" disabled>Aucune table ouverte</SelectItem>
                                  )}
                                  {openTables.map((t) => (
                                    <SelectItem key={t.id} value={t.id}>
                                      Table {t.table_number} {t.server_name ? `— ${t.server_name}` : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button size="sm" disabled={isProcessing || !selectedTable[b.id]}
                                      onClick={() => handleAttach(b)}
                                      className="w-full bg-blue-600 hover:bg-blue-700 text-white h-7 text-[11px]"
                                      data-testid={`btn-attach-${b.id}`}>
                                <Hash className="w-3 h-3 mr-1" /> Rattacher
                              </Button>
                            </div>

                            {/* Facturer direct */}
                            <div className="space-y-1">
                              <Input
                                placeholder="Nom client (optionnel)"
                                value={customerName[b.id] || ""}
                                onChange={(e) => setCustomerName((s) => ({ ...s, [b.id]: e.target.value }))}
                                className="h-8 text-[11px] bg-slate-900 border-slate-700"
                                data-testid={`input-customer-${b.id}`}
                              />
                              <Button size="sm" disabled={isProcessing}
                                      onClick={() => handleStandalone(b)}
                                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-[11px]"
                                      data-testid={`btn-standalone-${b.id}`}>
                                <Receipt className="w-3 h-3 mr-1" /> Facturer direct
                              </Button>
                            </div>

                            {/* Refuser */}
                            <div className="space-y-1 flex flex-col justify-end">
                              <Button size="sm" variant="ghost" disabled={isProcessing}
                                      onClick={() => setRejectMode((m) => ({ ...m, [b.id]: { open: true, reason: "" } }))}
                                      className="w-full bg-rose-700/40 hover:bg-rose-700/70 text-rose-100 border border-rose-500/40 h-7 text-[11px]"
                                      data-testid={`btn-reject-open-${b.id}`}>
                                <XCircle className="w-3 h-3 mr-1" /> Refuser
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2 pt-2 border-t border-rose-500/30">
                            <Input
                              placeholder="Motif du refus (obligatoire)"
                              value={rejectMode[b.id]?.reason || ""}
                              onChange={(e) => setRejectMode((m) => ({
                                ...m,
                                [b.id]: { ...(m[b.id] || {}), open: true, reason: e.target.value },
                              }))}
                              className="h-8 text-xs bg-slate-900 border-rose-500/40"
                              data-testid={`input-reason-${b.id}`}
                            />
                            <div className="flex gap-2">
                              <Button size="sm" disabled={isProcessing}
                                      onClick={() => handleReject(b)}
                                      className="flex-1 bg-rose-600 hover:bg-rose-700 text-white h-7 text-[11px]"
                                      data-testid={`btn-reject-confirm-${b.id}`}>
                                Confirmer refus
                              </Button>
                              <Button size="sm" variant="ghost"
                                      onClick={() => setRejectMode((m) => ({ ...m, [b.id]: { open: false, reason: "" } }))}
                                      className="text-slate-300 h-7 text-[11px]">
                                Annuler
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* PROCESSED */}
            {processedBons.length > 0 && (
              <div className="pt-3">
                <h3 className="text-xs uppercase tracking-wider text-slate-400 mb-2 font-semibold">
                  Récemment traités
                </h3>
                <div className="space-y-1.5">
                  {processedBons.slice(0, 30).map((b) => {
                    const lines = b.items && b.items.length
                      ? b.items
                      : (b.jeu_product_id ? [{ jeu_name: b.jeu_name, parties: b.parties }] : []);
                    const summary = lines.map((it) => `${it.jeu_name} x${it.parties}`).join(", ");
                    return (
                    <div key={b.id}
                         className="bg-slate-800/40 border border-slate-700 rounded p-2 text-xs flex items-center justify-between gap-2"
                         data-testid={`processed-bon-${b.id}`}>
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-slate-200 truncate block">{summary || "—"}</span>
                        <span className="text-slate-400 text-[10px]">{(b.total || 0).toLocaleString("fr-FR")} F · par {b.coach_name}</span>
                      </div>
                      <div className="text-[10px] text-right shrink-0">
                        {b.status === "attached" && (
                          <Badge className="bg-blue-500/30 text-blue-200"><Hash className="w-3 h-3 mr-1" /> Table {b.table_number}</Badge>
                        )}
                        {b.status === "invoiced" && (
                          <Badge className="bg-emerald-500/30 text-emerald-200"><Receipt className="w-3 h-3 mr-1" /> {b.invoice_number}</Badge>
                        )}
                        {b.status === "rejected" && (
                          <Badge className="bg-rose-500/30 text-rose-200" title={b.rejection_reason}>
                            <XCircle className="w-3 h-3 mr-1" /> Refusé
                          </Badge>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default JeuxBonsModal;
