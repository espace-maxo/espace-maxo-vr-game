/**
 * PendingProductsPanel — Panneau Admin pour valider/rejeter les produits
 * Caisse créés par les utilisateurs non-admin (Gérante, Serveurs).
 *
 * Affiché uniquement aux Admins. Recharge automatique toutes les 60s.
 */
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Textarea } from "../../../components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { ShieldCheck, X, Clock, AlertTriangle, Trash } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const formatPrice = (p) => new Intl.NumberFormat("fr-FR").format(p || 0);

export default function PendingProductsPanel({ actorName = "Admin", onChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [duplicates, setDuplicates] = useState(null);
  const [showDedupModal, setShowDedupModal] = useState(false);
  const [dedupBusy, setDedupBusy] = useState(false);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/caisse/products/pending`);
      setItems(r.data?.products || []);
    } catch (e) {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDuplicates = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/caisse/products/duplicates`);
      setDuplicates(r.data || { groups: [], total_groups: 0 });
    } catch (e) {
      setDuplicates({ groups: [], total_groups: 0 });
    }
  }, []);

  useEffect(() => {
    fetchPending();
    fetchDuplicates();
    const t = setInterval(() => {
      fetchPending();
      fetchDuplicates();
    }, 60000);
    return () => clearInterval(t);
  }, [fetchPending, fetchDuplicates]);

  const approve = async (id) => {
    try {
      await axios.post(`${API}/caisse/products/${id}/approve`, { actor_name: actorName });
      toast.success("Produit approuvé");
      await fetchPending();
      if (onChange) onChange();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur");
    }
  };

  const openReject = (item) => {
    setRejectTarget(item);
    setRejectReason("");
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    try {
      await axios.post(`${API}/caisse/products/${rejectTarget.id}/reject`, {
        reason: rejectReason || "",
        actor_name: actorName,
      });
      toast.success("Produit rejeté");
      setRejectTarget(null);
      setRejectReason("");
      await fetchPending();
      if (onChange) onChange();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur");
    }
  };

  const runDedup = async () => {
    if (!window.confirm(
      "Supprimer les doublons ?\n\nCette action conserve, pour chaque groupe de doublons, " +
      "le produit avec le plus d'historique (factures + achats). Les autres seront supprimés."
    )) return;
    setDedupBusy(true);
    try {
      const r = await axios.post(`${API}/caisse/products/deduplicate`, {
        dry_run: false,
        actor_name: actorName,
      });
      toast.success(`${r.data?.deleted_count || 0} doublon(s) supprimé(s)`);
      setShowDedupModal(false);
      await fetchDuplicates();
      if (onChange) onChange();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur");
    } finally {
      setDedupBusy(false);
    }
  };

  const hasDuplicates = (duplicates?.total_groups || 0) > 0;
  const hasPending = items.length > 0;
  if (!hasPending && !hasDuplicates) return null;

  return (
    <>
      {/* PENDING APPROVALS */}
      {hasPending && (
        <Card
          className="bg-gradient-to-br from-amber-900/20 to-orange-900/15 border-amber-500/40"
          data-testid="pending-products-card"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-amber-300 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Produits en attente d'approbation
              <Badge className="bg-amber-500/30 text-amber-200 ml-2">{items.length}</Badge>
            </CardTitle>
            <p className="text-xs text-amber-200/70 mt-1">
              Créés par les utilisateurs non-admin. Invisibles à la Caisse tant que vous ne les avez pas validés.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {items.map((p) => (
              <div
                key={p.id}
                className="bg-slate-800/60 border border-amber-500/20 rounded-lg p-3 flex items-start justify-between gap-3 flex-wrap"
                data-testid={`pending-product-${p.id}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold truncate">{p.name}</p>
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    <Badge className="bg-emerald-500/20 text-emerald-300 text-[10px]">
                      {formatPrice(p.price)} F / {p.unit}
                    </Badge>
                    {p.department && (
                      <Badge className="bg-slate-700/70 text-slate-300 text-[10px]">{p.department}</Badge>
                    )}
                    {p.category && (
                      <Badge className="bg-slate-700/70 text-slate-300 text-[10px]">{p.category}</Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Créé par{" "}
                    <span className="text-amber-200 font-semibold">{p.created_by || "—"}</span>
                    {p.created_by_role && (
                      <span className="text-slate-500"> ({p.created_by_role})</span>
                    )}
                    {p.created_at && (
                      <span className="text-slate-500">
                        {" · "}
                        {new Date(p.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    onClick={() => approve(p.id)}
                    className="bg-emerald-600 hover:bg-emerald-700"
                    data-testid={`approve-product-${p.id}`}
                  >
                    <ShieldCheck className="w-4 h-4 mr-1" /> Approuver
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openReject(p)}
                    className="border-red-500/60 text-red-300 hover:bg-red-500/10"
                    data-testid={`reject-product-${p.id}`}
                  >
                    <X className="w-4 h-4 mr-1" /> Rejeter
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* DUPLICATES NOTICE */}
      {hasDuplicates && (
        <Card
          className="bg-gradient-to-br from-red-900/20 to-rose-900/15 border-red-500/40"
          data-testid="duplicates-warning-card"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Doublons détectés
              <Badge className="bg-red-500/30 text-red-200 ml-2">{duplicates.total_groups} groupe(s)</Badge>
            </CardTitle>
            <p className="text-xs text-red-200/70 mt-1">
              Des produits ont des noms quasi-identiques (insensible à la casse/accents/espaces).
              La déduplication conserve celui avec le plus d'historique.
            </p>
          </CardHeader>
          <CardContent className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={() => setShowDedupModal(true)}
              variant="outline"
              className="border-red-500/50 text-red-200 hover:bg-red-500/10"
              data-testid="open-dedup-modal"
            >
              Voir le détail
            </Button>
            <Button
              size="sm"
              onClick={runDedup}
              disabled={dedupBusy}
              className="bg-red-600 hover:bg-red-700"
              data-testid="run-dedup-btn"
            >
              <Trash className="w-4 h-4 mr-1" />
              {dedupBusy ? "Suppression…" : "Supprimer les doublons"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* REJECT MODAL */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-red-300">Rejeter le produit ?</DialogTitle>
          </DialogHeader>
          {rejectTarget && (
            <div className="space-y-3 text-sm">
              <p>
                <strong className="text-white">{rejectTarget.name}</strong> —{" "}
                {formatPrice(rejectTarget.price)} F / {rejectTarget.unit}
              </p>
              <p className="text-slate-400">
                Le produit sera supprimé et une trace conservée dans l'audit.
              </p>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Motif du rejet (optionnel)…"
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                data-testid="reject-reason-input"
              />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectTarget(null)} className="border-slate-600">
              Annuler
            </Button>
            <Button onClick={confirmReject} className="bg-red-600 hover:bg-red-700" data-testid="confirm-reject-btn">
              <X className="w-4 h-4 mr-1" /> Rejeter et supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DEDUP DETAIL MODAL */}
      <Dialog open={showDedupModal} onOpenChange={setShowDedupModal}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Détail des doublons
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {(duplicates?.groups || []).map((g, i) => (
              <div key={i} className="border border-slate-700 rounded-lg p-3 bg-slate-800/50">
                <p className="text-amber-300 font-semibold mb-2">
                  Groupe « {g.normalized} » · {g.count} entrée(s)
                </p>
                <ul className="space-y-1">
                  {g.items.map((it) => (
                    <li
                      key={it.id}
                      className={`flex items-center justify-between p-2 rounded ${
                        it.id === g.keeper_id ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-slate-700/30"
                      }`}
                    >
                      <span className="truncate">
                        {it.id === g.keeper_id && (
                          <Badge className="bg-emerald-500/30 text-emerald-200 mr-2 text-[10px]">À CONSERVER</Badge>
                        )}
                        {it.name} — {formatPrice(it.price)} F
                      </span>
                      <span className="text-xs text-slate-400 ml-2">
                        {it._history_count || 0} usage(s)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {duplicates && duplicates.total_groups === 0 && (
              <p className="text-slate-400 text-center py-6">Aucun doublon détecté ✓</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDedupModal(false)} className="border-slate-600">
              Fermer
            </Button>
            <Button onClick={runDedup} disabled={dedupBusy} className="bg-red-600 hover:bg-red-700">
              <Trash className="w-4 h-4 mr-1" />
              {dedupBusy ? "Suppression…" : `Supprimer les ${duplicates?.groups?.reduce((s, g) => s + (g.items.length - 1), 0) || 0} doublon(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
