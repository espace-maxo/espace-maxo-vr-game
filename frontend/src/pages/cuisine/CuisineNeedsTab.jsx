/**
 * CuisineNeedsTab — Onglet "Besoin en cuisine" du profil cuisinier.
 *
 * Permet au cuisinier de transmettre à l'administrateur une liste de produits
 * nécessaires (réappro, manque urgent). Mode panier multi-lignes.
 *
 * Workflow :
 *  - Sélection produit (dropdown exhaustif des produits zone="cuisine")
 *  - Saisie qty + unité + urgence (normal/urgent)
 *  - Ajout au panier
 *  - Transmission → status=pending côté Admin (avec alerte)
 *  - Historique des besoins transmis (statut + horodatage)
 */
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Package, Plus, Trash2, Send, AlertTriangle, Clock, CheckCircle2,
  Eye, XCircle, ChefHat, RefreshCw, Loader2,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_META = {
  pending:   { label: "En attente",   icon: Clock,        color: "bg-amber-500/20 text-amber-200 border-amber-500/40" },
  seen:      { label: "Vu Admin",     icon: Eye,          color: "bg-blue-500/20 text-blue-200 border-blue-500/40" },
  fulfilled: { label: "Approvisionné", icon: CheckCircle2, color: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40" },
  rejected:  { label: "Refusé",       icon: XCircle,      color: "bg-rose-500/20 text-rose-200 border-rose-500/40" },
};

const CuisineNeedsTab = ({ currentUser }) => {
  const requesterName = currentUser?.full_name || currentUser?.username || "Cuisinier";
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]); // [{product_id, product_name, unit, quantity, note}]
  const [selProductId, setSelProductId] = useState("");
  const [qty, setQty] = useState("");
  const [lineNote, setLineNote] = useState("");
  const [urgency, setUrgency] = useState("normal");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchProducts = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/cuisine/products`);
      setProducts(r.data.products || []);
    } catch (e) {
      toast.error("Impossible de charger les produits cuisine");
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const r = await axios.get(`${API}/cuisine/needs`, {
        params: { requested_by: requesterName, limit: 30 },
      });
      setHistory(r.data.items || []);
    } catch {}
    finally { setLoadingHistory(false); }
  }, [requesterName]);

  useEffect(() => { fetchProducts(); fetchHistory(); }, [fetchProducts, fetchHistory]);

  const selectedProduct = products.find((p) => p.id === selProductId);

  const addLine = () => {
    if (!selProductId) return toast.error("Choisissez un produit");
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) return toast.error("Quantité invalide");
    if (cart.some((c) => c.product_id === selProductId)) {
      return toast.error("Ce produit est déjà dans la liste");
    }
    const p = selectedProduct;
    setCart((prev) => [...prev, {
      product_id: p.id,
      product_name: p.name,
      unit: p.unit,
      quantity: q,
      note: lineNote.trim(),
    }]);
    setSelProductId(""); setQty(""); setLineNote("");
  };

  const removeLine = (productId) => {
    setCart((prev) => prev.filter((c) => c.product_id !== productId));
  };

  const submit = async () => {
    if (cart.length === 0) return toast.error("Ajoutez au moins un produit");
    setSubmitting(true);
    try {
      await axios.post(`${API}/cuisine/needs`, {
        requested_by: requesterName,
        items: cart,
        urgency,
        notes: notes.trim(),
      });
      toast.success(`Besoin transmis à l'administrateur (${cart.length} produit${cart.length > 1 ? "s" : ""})`);
      setCart([]); setNotes(""); setUrgency("normal");
      fetchHistory();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de la transmission");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-3" data-testid="cuisine-needs-tab">
      {/* Formulaire ajout produit */}
      <Card className="bg-slate-800/60 border-amber-500/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-white">
            <ChefHat className="w-4 h-4 text-amber-400" />
            Besoin en cuisine — produits à transmettre à l'Admin
            <Badge className="bg-amber-500/20 text-amber-200 text-[10px] ml-auto">
              {products.length} produit{products.length > 1 ? "s" : ""} au catalogue
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <div className="sm:col-span-6">
              <Select value={selProductId || "none"} onValueChange={(v) => setSelProductId(v === "none" ? "" : v)}>
                <SelectTrigger className="bg-slate-900 border-slate-700 h-9 text-sm" data-testid="need-product-select">
                  <SelectValue placeholder="Choisir un produit…" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 max-h-[300px]">
                  <SelectItem value="none" className="text-slate-500 italic">— Sélectionner —</SelectItem>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-white text-sm" data-testid={`need-product-${p.id}`}>
                      <span className="flex items-center justify-between gap-2 w-full">
                        <span className="truncate">{p.name}</span>
                        {p.unit && <span className="text-[10px] text-slate-400 ml-2">({p.unit})</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-3 flex items-center gap-1">
              <Input
                type="number" min="0" step="0.01" value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="Quantité"
                className="bg-slate-900 border-slate-700 h-9 text-sm"
                data-testid="need-quantity-input"
              />
              <span className="text-xs text-slate-400 whitespace-nowrap">
                {selectedProduct?.unit || "—"}
              </span>
            </div>
            <div className="sm:col-span-3">
              <Button
                onClick={addLine}
                disabled={!selProductId || !qty}
                className="w-full h-9 bg-amber-600 hover:bg-amber-700 text-white text-sm"
                data-testid="need-add-line-btn"
              >
                <Plus className="w-4 h-4 mr-1" /> Ajouter
              </Button>
            </div>
          </div>
          <Input
            value={lineNote} onChange={(e) => setLineNote(e.target.value)}
            placeholder="Note pour ce produit (optionnel)"
            className="bg-slate-900 border-slate-700 h-8 text-xs"
            data-testid="need-line-note"
          />

          {/* Panier */}
          {cart.length > 0 && (
            <div className="border-t border-slate-700 pt-2 mt-2 space-y-1.5" data-testid="needs-cart-list">
              <p className="text-xs font-semibold text-amber-200 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" />
                Liste à transmettre ({cart.length})
              </p>
              {cart.map((c) => (
                <div key={c.product_id} className="flex items-center justify-between bg-slate-900/60 rounded px-2 py-1.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="text-white truncate">
                      <span className="font-medium">{c.product_name}</span>
                      <span className="text-amber-200 ml-2 font-mono">{c.quantity} {c.unit}</span>
                    </p>
                    {c.note && <p className="text-[11px] text-slate-400 italic truncate">{c.note}</p>}
                  </div>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => removeLine(c.product_id)}
                    className="h-7 w-7 p-0 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                    data-testid={`need-remove-${c.product_id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Urgence + Notes globales + Soumettre */}
          {cart.length > 0 && (
            <div className="border-t border-slate-700 pt-2 mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setUrgency("normal")}
                  className={`h-8 text-xs ${urgency === "normal" ? "bg-blue-600 hover:bg-blue-700" : "bg-slate-700 hover:bg-slate-600"}`}
                  data-testid="urgency-normal-btn"
                >
                  Normal
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setUrgency("urgent")}
                  className={`h-8 text-xs ${urgency === "urgent" ? "bg-rose-600 hover:bg-rose-700" : "bg-slate-700 hover:bg-slate-600"}`}
                  data-testid="urgency-urgent-btn"
                >
                  <AlertTriangle className="w-3 h-3 mr-1" /> Urgent
                </Button>
              </div>
              <Textarea
                value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Note globale pour l'admin (optionnel)"
                className="bg-slate-900 border-slate-700 text-sm min-h-[60px]"
                data-testid="need-global-notes"
              />
              <Button
                onClick={submit}
                disabled={submitting || cart.length === 0}
                className="w-full h-9 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-sm font-semibold"
                data-testid="need-submit-btn"
              >
                {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                Transmettre à l'Administrateur
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historique */}
      <Card className="bg-slate-800/60 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between text-white">
            <span className="flex items-center gap-2">
              <Package className="w-4 h-4 text-purple-400" />
              Mes derniers besoins ({history.length})
            </span>
            <Button variant="ghost" size="sm" onClick={fetchHistory} disabled={loadingHistory} className="text-slate-300 h-7 text-[11px]" data-testid="needs-history-refresh">
              {loadingHistory ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              Actualiser
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 && !loadingHistory && (
            <p className="text-xs text-slate-500 text-center italic py-3">
              Aucun besoin transmis pour l'instant.
            </p>
          )}
          {history.map((n) => {
            const meta = STATUS_META[n.status] || STATUS_META.pending;
            const Icon = meta.icon;
            return (
              <div key={n.id} className={`rounded border ${meta.color} px-2.5 py-1.5`} data-testid={`need-item-${n.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      {n.urgency === "urgent" && <AlertTriangle className="w-3 h-3 text-rose-300" />}
                      {n.items_count} produit{n.items_count > 1 ? "s" : ""}
                      <span className="text-slate-400 text-[10px]">
                        · {n.requested_at ? new Date(n.requested_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—"}
                      </span>
                    </p>
                    <div className="text-[11px] text-slate-300 mt-1 space-y-0.5">
                      {(n.items || []).slice(0, 4).map((it, i) => (
                        <p key={i} className="truncate">
                          • {it.product_name} <span className="text-amber-200 font-mono">{it.quantity} {it.unit}</span>
                        </p>
                      ))}
                      {n.items && n.items.length > 4 && (
                        <p className="text-[10px] text-slate-500 italic">… +{n.items.length - 4} autres</p>
                      )}
                    </div>
                    {n.notes && <p className="text-[10px] text-slate-400 italic mt-1">{n.notes}</p>}
                    {n.status === "rejected" && n.rejection_reason && (
                      <p className="text-[10px] text-rose-300 mt-1">Motif refus : {n.rejection_reason}</p>
                    )}
                  </div>
                  <Badge className={`${meta.color} text-[10px] border shrink-0`}>
                    <Icon className="w-3 h-3 mr-1" /> {meta.label}
                  </Badge>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};

export default CuisineNeedsTab;
