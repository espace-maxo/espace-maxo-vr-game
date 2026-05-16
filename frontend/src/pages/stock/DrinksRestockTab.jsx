/**
 * DrinksRestockTab — Plan d'approvisionnement boissons
 *
 * Pour chaque boisson :
 *   - quantité actuelle / stock min
 *   - nombre de bouteilles manquantes pour compléter le casier en cours
 *   - quantité recommandée (arrondie au casier supérieur)
 *   - nombre de casiers à commander + coût estimé
 *
 * Boutons : Imprimer ticket (80mm), Imprimer / PDF A4.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  PackageCheck, RefreshCw, Printer, FileText, Search, Boxes,
  AlertTriangle, TrendingDown, CheckCircle2, ShoppingCart, X, Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => Math.round(Number(n || 0)).toLocaleString("fr-FR");

const DrinksRestockTab = () => {
  const [bottlesPerCrate, setBottlesPerCrate] = useState(24);
  const [daysHorizon, setDaysHorizon] = useState(7);
  const [lookbackDays, setLookbackDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("to_order"); // all | to_order | rupture | low | ok
  const [subtypeFilter, setSubtypeFilter] = useState("all"); // all | soda | biere | alcool_autre
  const [includeOk, setIncludeOk] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  // Convert-to-purchase modal
  const [convertOpen, setConvertOpen] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [convertSupplierId, setConvertSupplierId] = useState("");
  const [convertNotes, setConvertNotes] = useState("");
  const [converting, setConverting] = useState(false);
  // Per-product crate edit (inline)
  const [editingCrateId, setEditingCrateId] = useState(null);
  const [editingCrateValue, setEditingCrateValue] = useState("");

  const startEditCrate = (row) => {
    setEditingCrateId(row.id);
    setEditingCrateValue(row.is_custom_crate ? String(row.bottles_per_crate) : "");
  };

  const cancelEditCrate = () => {
    setEditingCrateId(null);
    setEditingCrateValue("");
  };

  const saveCrate = async (row) => {
    const v = parseInt(editingCrateValue, 10);
    if (Number.isNaN(v) || v < 0) {
      toast.error("Valeur invalide");
      return;
    }
    try {
      await axios.put(`${API}/stock/products/${row.id}/bottles-per-crate`, null, {
        params: { value: v },
      });
      if (v === 0) toast.success("Casier remis à la valeur globale");
      else toast.success(`Casier de ${row.name} fixé à ${v} bouteilles`);
      cancelEditCrate();
      fetchPlan();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur");
    }
  };

  const fetchPlan = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/stock/drinks-restock-plan`, {
        params: {
          bottles_per_crate: bottlesPerCrate || 24,
          days_horizon: daysHorizon || 7,
          lookback_days: lookbackDays || 30,
        },
      });
      setData(r.data);
    } catch (e) {
      toast.error("Erreur lors du calcul du plan");
    } finally {
      setLoading(false);
    }
  }, [bottlesPerCrate, daysHorizon, lookbackDays]);

  useEffect(() => { fetchPlan(); }, [fetchPlan]);

  // Fetch suppliers for the convert modal
  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get(`${API}/stock/suppliers`);
        setSuppliers(r.data?.suppliers || []);
      } catch {}
    })();
  }, []);

  const openConvert = () => {
    setConvertOpen(true);
    setConvertSupplierId("");
    setConvertNotes("Bon généré depuis le Plan d'approvisionnement boissons");
  };

  const confirmConvert = async () => {
    setConverting(true);
    try {
      const supplier = suppliers.find((s) => s.id === convertSupplierId);
      // Si une sélection est active, envoie uniquement ces items
      const sel = selectedRows.filter((r) => (r.recommended_qty || 0) > 0);
      const payload = {
        bottles_per_crate: bottlesPerCrate || 24,
        supplier_id: convertSupplierId || "",
        supplier_name: supplier ? supplier.name : "",
        notes: convertNotes,
      };
      if (selectedIds.size > 0) {
        payload.items = sel.map((r) => ({
          product_id: r.id,
          quantity: r.recommended_qty,
          unit_price: r.unit_purchase_price,
        }));
      }
      const r = await axios.post(`${API}/stock/drinks-restock-plan/convert`, payload);
      toast.success(
        `Bon d'achat créé (brouillon) : ${r.data.items_count} produits · ${fmt(r.data.total_amount)} F`,
        { description: "Ouvrez l'onglet Achats pour ajuster prix/quantités puis valider." },
      );
      setConvertOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur lors de la conversion");
    } finally {
      setConverting(false);
    }
  };

  const rows = useMemo(() => {
    if (!data) return [];
    let arr = data.products || [];
    if (subtypeFilter !== "all") arr = arr.filter((r) => r.drink_subtype === subtypeFilter);
    if (statusFilter === "to_order") arr = arr.filter((r) => (r.recommended_qty || 0) > 0);
    else if (statusFilter !== "all") arr = arr.filter((r) => r.status === statusFilter);
    if (!includeOk && statusFilter === "all") arr = arr.filter((r) => r.status !== "ok");
    const term = (search || "").trim().toLowerCase();
    if (term) arr = arr.filter((r) =>
      (r.name || "").toLowerCase().includes(term)
      || (r.code || "").toLowerCase().includes(term)
      || (r.category_name || "").toLowerCase().includes(term)
    );
    return arr;
  }, [data, statusFilter, subtypeFilter, includeOk, search]);

  // Selected rows used for printing / converting
  const selectedRows = useMemo(() => {
    if (selectedIds.size === 0) return rows; // pas de sélection = tout
    return rows.filter((r) => selectedIds.has(r.id));
  }, [rows, selectedIds]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelectedIds(new Set(rows.map((r) => r.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const selectedTotals = useMemo(() => {
    let bottles = 0, crates = 0, cost = 0;
    for (const r of selectedRows) {
      bottles += r.recommended_qty || 0;
      crates += r.recommended_crates || 0;
      cost += r.estimated_cost || 0;
    }
    return { bottles, crates, cost };
  }, [selectedRows]);

  // ============== IMPRESSION ==============
  const printAt = (cssMode) => {
    if (!data) return;
    const today = format(new Date(), "dd MMM yyyy à HH:mm", { locale: fr });
    const t = data.totals || {};
    const w = window.open("", "_blank", "width=900,height=900");
    if (!w) {
      toast.error("Veuillez autoriser les popups");
      return;
    }
    const isTicket = cssMode === "ticket";
    const printRows = (selectedRows.length > 0 ? selectedRows : rows).filter((r) => (r.recommended_qty || 0) > 0);

    const styles = isTicket ? `
      @page { size: 80mm auto; margin: 4mm; }
      body { font-family: 'Courier New', monospace; font-size: 11px; color:#000; }
      h1 { font-size:13px; text-align:center; margin:2px 0;}
      .meta { text-align:center; font-size:10px; margin-bottom:4px;}
      .sep { border-top:1px dashed #000; margin: 4px 0;}
      table { width:100%; border-collapse:collapse;}
      td, th { padding: 2px 0; vertical-align: top; font-size:10px;}
      .right { text-align:right; }
      .b { font-weight:bold; }
      .totals { margin-top:6px; border-top:1px solid #000; padding-top:4px; font-size:11px; }
      .ok { display:none; }
    ` : `
      @page { size: A4 portrait; margin: 12mm; }
      body { font-family: Arial, sans-serif; font-size:12px; color:#111; }
      h1 { font-size:18px; margin: 0 0 4px 0; }
      .meta { color:#555; margin-bottom: 14px; }
      table { width:100%; border-collapse: collapse; }
      th { background:#f3f4f6; text-align:left; font-size:11px; padding: 6px 8px; border-bottom: 1px solid #ccc;}
      td { padding: 5px 8px; border-bottom: 1px solid #eee; font-size:11.5px;}
      .right { text-align:right; }
      .b { font-weight:bold; }
      .rupture { color:#b91c1c; font-weight:bold; }
      .faible { color:#b45309; }
      .totals-card { margin-top:16px; padding:10px; background:#f9fafb; border-left:4px solid #6d28d9;}
      .footer { margin-top: 24px; font-size:10px; color:#777; }
    `;

    const totalsBlock = `
      <div class="totals-card">
        <div><strong>${t.products || 0}</strong> boissons analysées · ${t.rupture || 0} en rupture · ${t.low || 0} stock faible</div>
        <div>Recommandation : <strong>${fmt(t.recommended_bottles)}</strong> bouteilles soit <strong>${fmt(t.recommended_crates)}</strong> casiers (${data.bottles_per_crate}/casier)</div>
        <div>Coût estimé : <strong>${fmt(t.estimated_cost)} F CFA</strong></div>
      </div>
    `;

    const rowsHtml = printRows.map((r) => `
      <tr>
        <td>${r.code || "—"}</td>
        <td class="b">${r.name}</td>
        <td>${r.category_name}</td>
        <td class="right">${fmt(r.current_quantity)}</td>
        <td class="right">${fmt(r.stock_min)}</td>
        <td class="right b">${fmt(r.recommended_qty)}</td>
        <td class="right">${r.recommended_crates}</td>
        ${isTicket ? "" : `<td class="right">${fmt(r.estimated_cost)} F</td>`}
        <td class="${r.status}">${r.status === "rupture" ? "RUPTURE" : r.status === "faible" ? "Faible" : ""}</td>
      </tr>
    `).join("");

    w.document.write(`
      <html><head><meta charset="utf-8"><title>Plan d'approvisionnement boissons</title>
      <style>${styles}</style></head>
      <body>
        <h1>${isTicket ? "PLAN APPRO BOISSONS" : "Plan d'approvisionnement — Boissons"}</h1>
        <div class="meta">${today}${isTicket ? `<br>Casier = ${data.bottles_per_crate}` : ` · Casier = ${data.bottles_per_crate} bouteilles`}</div>
        ${isTicket ? '<div class="sep"></div>' : ""}
        <table>
          <thead>
            <tr>
              ${isTicket ? "" : "<th>Code</th>"}
              <th>${isTicket ? "Boisson" : "Produit"}</th>
              ${isTicket ? "" : "<th>Catégorie</th>"}
              <th class="right">${isTicket ? "Stock" : "Stock"}</th>
              ${isTicket ? "" : '<th class="right">Min</th>'}
              <th class="right">Cmd</th>
              <th class="right">Cas.</th>
              ${isTicket ? "" : '<th class="right">Coût est.</th><th>État</th>'}
            </tr>
          </thead>
          <tbody>${rowsHtml || `<tr><td colspan="9" style="text-align:center;color:#666">Aucune recommandation.</td></tr>`}</tbody>
        </table>
        ${isTicket ? `
          <div class="totals">
            Total: ${fmt(t.recommended_bottles)} bout. (${fmt(t.recommended_crates)} cas.)<br>
            Coût: ${fmt(t.estimated_cost)} F<br>
            Rupture: ${t.rupture || 0} · Faible: ${t.low || 0}
          </div>
          <div class="sep"></div>
          <div style="text-align:center;font-size:10px;">Espace Maxo</div>
        ` : totalsBlock}
        ${isTicket ? "" : '<div class="footer">Espace Maxo — Module Stock · Caisse Pro</div>'}
        <script>window.onload=()=>{setTimeout(()=>{window.print();},250);};</script>
      </body></html>
    `);
    w.document.close();
  };

  const totals = data?.totals || {};

  return (
    <div className="space-y-4" data-testid="drinks-restock-tab">
      {/* Toolbar */}
      <Card className="bg-slate-900/60 border-slate-800">
        <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-6 gap-3 items-end">
          <div>
            <Label className="text-xs text-slate-400">Bouteilles par casier</Label>
            <Input
              type="number"
              min={1}
              value={bottlesPerCrate}
              onChange={(e) => setBottlesPerCrate(parseInt(e.target.value) || 24)}
              className="bg-slate-800 border-slate-700 text-white"
              data-testid="restock-crate-size"
            />
            <p className="text-[10px] text-slate-500 mt-1">Casier par défaut (modifiable par produit)</p>
          </div>
          <div>
            <Label className="text-xs text-slate-400">Couvrir (jours)</Label>
            <Input
              type="number"
              min={1}
              value={daysHorizon}
              onChange={(e) => setDaysHorizon(parseInt(e.target.value) || 7)}
              className="bg-slate-800 border-slate-700 text-white"
              data-testid="restock-horizon"
            />
            <p className="text-[10px] text-slate-500 mt-1">Stock à constituer</p>
          </div>
          <div>
            <Label className="text-xs text-slate-400">Analyse (jours)</Label>
            <Input
              type="number"
              min={1}
              value={lookbackDays}
              onChange={(e) => setLookbackDays(parseInt(e.target.value) || 30)}
              className="bg-slate-800 border-slate-700 text-white"
              data-testid="restock-lookback"
            />
            <p className="text-[10px] text-slate-500 mt-1">Période rythme conso</p>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs text-slate-400">Recherche</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-slate-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nom, code ou catégorie..."
                className="pl-8 bg-slate-800 border-slate-700 text-white"
                data-testid="restock-search"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={fetchPlan}
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-700 w-full"
              data-testid="restock-refresh"
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
          </div>
          {/* Sub-type & status filters */}
          <div className="sm:col-span-6 flex flex-wrap items-center gap-3 border-t border-slate-800 pt-3">
            <div className="flex items-center gap-1 rounded-lg bg-slate-800/50 p-1 border border-slate-700">
              {[
                { k: "all", label: "Tous" },
                { k: "soda", label: "Sodas & non alcoolisés" },
                { k: "biere", label: "Bières" },
                { k: "alcool_autre", label: "Autres alcools" },
              ].map((f) => (
                <button
                  key={f.k}
                  onClick={() => setSubtypeFilter(f.k)}
                  className={`px-3 py-1 rounded text-xs font-medium transition ${
                    subtypeFilter === f.k ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                  data-testid={`restock-subtype-${f.k}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-400 m-0">État</Label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-md text-white text-sm px-2 py-1.5"
                data-testid="restock-status-filter"
              >
                <option value="to_order">À commander uniquement</option>
                <option value="all">Toutes</option>
                <option value="rupture">Rupture seulement</option>
                <option value="faible">Stock faible seulement</option>
                <option value="ok">OK seulement</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      {data && (
        <Card className="bg-gradient-to-br from-purple-900/30 to-slate-900/70 border-purple-500/30">
          <CardContent className="pt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <p className="text-[10px] uppercase text-slate-400">Boissons</p>
              <p className="text-2xl font-bold text-white">{totals.products || 0}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-rose-400" /> Rupture
              </p>
              <p className="text-2xl font-bold text-rose-300">{totals.rupture || 0}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-400 flex items-center gap-1">
                <TrendingDown className="w-3 h-3 text-amber-400" /> Stock faible
              </p>
              <p className="text-2xl font-bold text-amber-300">{totals.low || 0}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-400 flex items-center gap-1">
                <Boxes className="w-3 h-3 text-emerald-400" /> À commander
              </p>
              <p className="text-2xl font-bold text-emerald-300">
                {fmt(totals.recommended_crates)} <span className="text-sm text-slate-400">casier(s)</span>
              </p>
              <p className="text-[10px] text-slate-500">{fmt(totals.recommended_bottles)} bouteilles</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-400">Coût estimé</p>
              <p className="text-2xl font-bold text-purple-300">{fmt(totals.estimated_cost)} F</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Print buttons & selection */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={openConvert}
          disabled={!data || (selectedTotals.bottles || 0) === 0}
          className="bg-emerald-600 hover:bg-emerald-700"
          data-testid="restock-convert-btn"
          title="Créer un bon d'achat brouillon avec les produits sélectionnés"
        >
          <ShoppingCart className="w-4 h-4 mr-1" /> Convertir en achat
        </Button>
        <Button
          onClick={() => printAt("ticket")}
          disabled={!data || selectedRows.length === 0}
          className="bg-slate-700 hover:bg-slate-600"
          data-testid="restock-print-ticket"
          title="Format ticket 80mm pour imprimante thermique"
        >
          <Printer className="w-4 h-4 mr-1" /> Imprimer ticket
        </Button>
        <Button
          onClick={() => printAt("a4")}
          disabled={!data || selectedRows.length === 0}
          className="bg-slate-700 hover:bg-slate-600"
          data-testid="restock-print-pdf"
          title="Format A4"
        >
          <FileText className="w-4 h-4 mr-1" /> Imprimer / PDF A4
        </Button>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className="text-slate-400">
            {selectedIds.size > 0 ? (
              <>
                <span className="text-purple-300 font-bold">{selectedIds.size}</span> sélectionné(s) ·
                <span className="ml-1 text-emerald-300 font-bold">{fmt(selectedTotals.crates)}</span> casier(s) ·
                <span className="ml-1 text-purple-300 font-bold">{fmt(selectedTotals.cost)} F</span>
              </>
            ) : (
              <>Aucun produit sélectionné — opérations sur tous les <span className="text-white">{rows.length}</span> affichés</>
            )}
          </span>
          {selectedIds.size > 0 ? (
            <Button size="sm" variant="outline" onClick={clearSelection} className="border-slate-700 text-slate-300 h-7">
              <X className="w-3.5 h-3.5 mr-1" /> Vider
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={selectAll} className="border-slate-700 text-slate-300 h-7" data-testid="restock-select-all">
              Tout sélectionner
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <Card className="bg-slate-900/60 border-slate-800">
        <CardContent className="pt-4">
          {loading ? (
            <div className="py-10 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              Calcul en cours…
            </div>
          ) : !data ? (
            <div className="py-10 text-center text-slate-500 text-sm">Chargement…</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-emerald-400">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2" />
              Aucune commande nécessaire pour ce filtre.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase text-slate-400 border-b border-slate-800">
                    <th className="p-2 w-8">
                      <input
                        type="checkbox"
                        checked={rows.length > 0 && selectedIds.size === rows.length}
                        onChange={(e) => e.target.checked ? selectAll() : clearSelection()}
                        className="rounded"
                        title="Tout sélectionner / désélectionner"
                        data-testid="restock-select-toggle"
                      />
                    </th>
                    <th className="text-left p-2">Code</th>
                    <th className="text-left p-2">Boisson</th>
                    <th className="text-center p-2">Type</th>
                    <th className="text-right p-2">Stock</th>
                    <th className="text-right p-2" title={`Consommation moyenne sur ${lookbackDays} jours`}>Conso/j</th>
                    <th className="text-right p-2" title="Jours de stock restants au rythme actuel">Jours</th>
                    <th className="text-center p-2" title="Bouteilles par casier (modifiable)">Casier</th>
                    <th className="text-right p-2">Cmd reco.</th>
                    <th className="text-right p-2">Casiers</th>
                    <th className="text-right p-2">Coût est.</th>
                    <th className="text-center p-2">État</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isSelected = selectedIds.has(r.id);
                    const subBadge = r.drink_subtype === "soda"
                      ? { label: "Soda", color: "bg-cyan-500/20 text-cyan-300" }
                      : r.drink_subtype === "biere"
                        ? { label: "Bière", color: "bg-amber-500/20 text-amber-300" }
                        : { label: "Alcool", color: "bg-purple-500/20 text-purple-300" };
                    const daysWarn = r.days_of_stock != null && r.days_of_stock < daysHorizon;
                    return (
                    <tr key={r.id} className={`border-b border-slate-800/60 hover:bg-slate-800/40 ${isSelected ? "bg-purple-900/10" : ""}`} data-testid={`restock-row-${r.id}`}>
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(r.id)}
                          className="rounded"
                          data-testid={`restock-select-${r.id}`}
                        />
                      </td>
                      <td className="p-2 font-mono text-[11px] text-slate-400">{r.code || "—"}</td>
                      <td className="p-2 text-white">{r.name}</td>
                      <td className="p-2 text-center">
                        <Badge className={`${subBadge.color} text-[10px]`}>{subBadge.label}</Badge>
                      </td>
                      <td className="p-2 text-right text-slate-200">{fmt(r.current_quantity)}</td>
                      <td className="p-2 text-right text-xs text-slate-300">
                        {r.daily_consumption > 0 ? r.daily_consumption.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : <span className="text-slate-600">—</span>}
                      </td>
                      <td className={`p-2 text-right text-xs ${daysWarn ? "text-rose-300 font-bold" : "text-slate-300"}`}>
                        {r.days_of_stock != null ? `${r.days_of_stock}j` : <span className="text-slate-600">—</span>}
                      </td>
                      {/* Casier éditable inline */}
                      <td className="p-2 text-center">
                        {editingCrateId === r.id ? (
                          <div className="flex items-center gap-1 justify-center">
                            <Input
                              type="number"
                              min={0}
                              autoFocus
                              value={editingCrateValue}
                              placeholder="0=auto"
                              onChange={(e) => setEditingCrateValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveCrate(r);
                                if (e.key === "Escape") cancelEditCrate();
                              }}
                              className="h-6 w-16 text-center bg-slate-800 border-slate-600 text-white text-xs"
                              data-testid={`restock-crate-edit-${r.id}`}
                            />
                            <button
                              onClick={() => saveCrate(r)}
                              className="text-emerald-400 hover:text-emerald-300 text-xs px-1"
                              data-testid={`restock-crate-save-${r.id}`}
                              title="Enregistrer (Entrée)"
                            >✓</button>
                            <button
                              onClick={cancelEditCrate}
                              className="text-slate-400 hover:text-rose-300 text-xs px-1"
                              title="Annuler (Échap)"
                            >×</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEditCrate(r)}
                            className={`px-1.5 py-0.5 rounded text-xs hover:bg-slate-700 transition ${
                              r.is_custom_crate
                                ? "bg-purple-500/20 text-purple-200 border border-purple-500/40 font-bold"
                                : "text-slate-400 border border-transparent"
                            }`}
                            data-testid={`restock-crate-cell-${r.id}`}
                            title={r.is_custom_crate
                              ? "Valeur personnalisée — cliquez pour modifier (0 = auto)"
                              : "Cliquez pour personnaliser ce casier"
                            }
                          >
                            {r.bottles_per_crate}
                          </button>
                        )}
                      </td>
                      <td className="p-2 text-right font-bold text-emerald-300">
                        {r.recommended_qty > 0 ? fmt(r.recommended_qty) : "—"}
                      </td>
                      <td className="p-2 text-right text-purple-300 font-semibold">
                        {r.recommended_crates > 0 ? r.recommended_crates : "—"}
                      </td>
                      <td className="p-2 text-right text-slate-300 text-xs">
                        {r.estimated_cost > 0 ? `${fmt(r.estimated_cost)} F` : "—"}
                      </td>
                      <td className="p-2 text-center">
                        {r.status === "rupture" ? (
                          <Badge className="bg-rose-500/20 text-rose-300 text-[10px]">Rupture</Badge>
                        ) : r.status === "faible" ? (
                          <Badge className="bg-amber-500/20 text-amber-300 text-[10px]">Faible</Badge>
                        ) : (
                          <Badge className="bg-emerald-500/20 text-emerald-300 text-[10px]">OK</Badge>
                        )}
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Convert-to-purchase modal */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-lg" data-testid="restock-convert-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-300">
              <ShoppingCart className="w-5 h-5" /> Convertir en bon d'achat
            </DialogTitle>
          </DialogHeader>
          {data && (
            <div className="space-y-4 mt-2">
              <div className="rounded-lg bg-slate-800/60 border border-slate-700 p-3 grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-[10px] uppercase text-slate-400">Produits</p>
                  <p className="text-xl font-bold text-white">{(data.products || []).filter((p) => (p.recommended_qty || 0) > 0).length}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-slate-400">Casiers</p>
                  <p className="text-xl font-bold text-purple-300">{fmt(data.totals?.recommended_crates)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-slate-400">Coût estimé</p>
                  <p className="text-xl font-bold text-emerald-300">{fmt(data.totals?.estimated_cost)} F</p>
                </div>
              </div>

              <div>
                <Label className="text-xs text-slate-400">Fournisseur (optionnel)</Label>
                <select
                  value={convertSupplierId}
                  onChange={(e) => setConvertSupplierId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-md text-white text-sm px-2 py-2"
                  data-testid="restock-convert-supplier"
                >
                  <option value="">— Aucun (à renseigner plus tard) —</option>
                  {[...suppliers].sort((a, b) => (a.name || "").localeCompare(b.name || "")).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs text-slate-400">Notes</Label>
                <Input
                  value={convertNotes}
                  onChange={(e) => setConvertNotes(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                  data-testid="restock-convert-notes"
                />
              </div>

              <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded p-2">
                ℹ️ Le bon est créé en <strong>brouillon (status=pending)</strong>. Les stocks ne sont pas modifiés. Ouvrez l'onglet <strong>Achats</strong> pour ajuster les prix et quantités, puis validez à la livraison.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <Button variant="outline" onClick={() => setConvertOpen(false)} className="border-slate-700 text-slate-300">
                  <X className="w-4 h-4 mr-1" /> Annuler
                </Button>
                <Button
                  onClick={confirmConvert}
                  disabled={converting}
                  className="bg-emerald-600 hover:bg-emerald-700"
                  data-testid="restock-convert-confirm"
                >
                  {converting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ShoppingCart className="w-4 h-4 mr-1" />}
                  Créer le bon
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DrinksRestockTab;
