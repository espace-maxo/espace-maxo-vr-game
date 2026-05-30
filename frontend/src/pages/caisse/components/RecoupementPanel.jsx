/**
 * RecoupementPanel — Upload photo + OCR + édition + comparaison vs ventes système.
 *
 * Deux modes : "cuisine" et "jeux".
 * Workflow :
 *   1. Choisir la date
 *   2. Photographier / sélectionner image
 *   3. Bouton "Extraire avec l'IA" → appelle /api/recoupement/extract-{kind}
 *   4. Tableau éditable des items {name, quantity}
 *   5. Bouton "Comparer aux ventes système" → appelle /compare-{kind}
 *   6. Affichage du rapport d'écarts + sauvegarde + audit
 */
import React, { useState, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Camera, Upload, Loader2, Trash2, Plus, ArrowRight,
  AlertTriangle, CheckCircle2, ChefHat, Gamepad2, RefreshCw,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => Math.round(Number(n || 0)).toLocaleString("fr-FR");

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => {
    const result = r.result || "";
    const idx = String(result).indexOf("base64,");
    resolve(idx !== -1 ? String(result).slice(idx + 7) : String(result));
  };
  r.onerror = reject;
  r.readAsDataURL(file);
});

const KIND_META = {
  cuisine: {
    label: "Cuisine",
    Icon: ChefHat,
    accent: "amber",
    extract_url: "/recoupement/extract-cuisine",
    compare_url: "/recoupement/compare-cuisine",
    item_singular: "plat",
    item_plural: "plats",
  },
  jeux: {
    label: "Jeux",
    Icon: Gamepad2,
    accent: "purple",
    extract_url: "/recoupement/extract-jeux",
    compare_url: "/recoupement/compare-jeux",
    item_singular: "jeu",
    item_plural: "jeux/machines",
  },
};

const RecoupementCard = ({ kind, currentUser }) => {
  const meta = KIND_META[kind];
  const Icon = meta.Icon;
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState("");
  const [summary, setSummary] = useState(null);
  const fileRef = useRef(null);

  const handleFileSelect = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/^image\/(png|jpeg|jpg|webp)$/.test(f.type)) {
      toast.error("Format non supporté. Utilisez PNG, JPEG ou WEBP.");
      return;
    }
    try {
      const b64 = await fileToBase64(f);
      setImageBase64(b64);
      setImagePreview(URL.createObjectURL(f));
      setSummary(null);
    } catch {
      toast.error("Erreur de lecture du fichier");
    }
  };

  const extract = async () => {
    if (!imageBase64) return toast.error("Sélectionnez une image");
    setExtracting(true);
    try {
      const r = await axios.post(`${API}${meta.extract_url}`, {
        image_base64: imageBase64,
        mime_type: "image/jpeg",
        actor_name: currentUser?.full_name || currentUser?.username,
        actor_role: currentUser?.role,
      }, { timeout: 60000 });
      const arr = (r.data.items || []).map((it) => ({
        name: it.name || "",
        quantity: Number(it.quantity || 0),
      }));
      setItems(arr);
      if (r.data.notes) setNotes(r.data.notes);
      toast.success(`${arr.length} ${meta.item_plural} extraits. Corrigez si besoin avant de comparer.`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur d'extraction IA");
    } finally {
      setExtracting(false);
    }
  };

  const compare = async () => {
    if (items.length === 0) return toast.error(`Ajoutez au moins un ${meta.item_singular}`);
    setComparing(true);
    try {
      const r = await axios.post(`${API}${meta.compare_url}`, {
        date,
        declared: items.filter((it) => (it.name || "").trim()),
        notes,
        actor_name: currentUser?.full_name || currentUser?.username,
        actor_role: currentUser?.role,
      }, { timeout: 30000 });
      setSummary(r.data.summary);
      if (r.data.audit_critical) {
        toast.warning("Écarts critiques détectés — entrée audit créée");
      } else {
        toast.success("Recoupement enregistré");
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur de comparaison");
    } finally {
      setComparing(false);
    }
  };

  const addRow = () => setItems((a) => [...a, { name: "", quantity: 0 }]);
  const removeRow = (i) => setItems((a) => a.filter((_, idx) => idx !== i));
  const updateRow = (i, k, v) => setItems((a) => a.map((it, idx) => idx === i ? { ...it, [k]: v } : it));

  const reset = () => {
    setImagePreview(null);
    setImageBase64(null);
    setItems([]);
    setNotes("");
    setSummary(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const accent = meta.accent === "purple"
    ? "from-purple-900/30 to-fuchsia-900/10 border-purple-500/40 text-purple-300"
    : "from-amber-900/30 to-orange-900/10 border-amber-500/40 text-amber-300";

  return (
    <Card className={`bg-gradient-to-br ${accent} border`} data-testid={`recoup-card-${kind}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="w-5 h-5" />
          Recoupement {meta.label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs text-slate-300 mb-1 block">Date du point</Label>
            <Input
              type="date"
              value={date}
              max={format(new Date(), "yyyy-MM-dd")}
              onChange={(e) => setDate(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white text-xs"
              data-testid={`recoup-date-${kind}`}
            />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileSelect}
            className="hidden"
            data-testid={`recoup-file-${kind}`}
          />
          <Button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="bg-slate-700 hover:bg-slate-600 text-white text-xs"
            data-testid={`recoup-upload-${kind}`}
          >
            <Upload className="w-4 h-4 mr-1" />
            Choisir une photo
          </Button>
          {imageBase64 && (
            <>
              <Button
                type="button"
                onClick={extract}
                disabled={extracting}
                className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs"
                data-testid={`recoup-extract-${kind}`}
              >
                {extracting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Camera className="w-4 h-4 mr-1" />}
                Extraire avec l'IA
              </Button>
              <Button type="button" variant="ghost" onClick={reset} className="text-slate-300 text-xs">
                <RefreshCw className="w-3 h-3 mr-1" />
                Recommencer
              </Button>
            </>
          )}
        </div>

        {imagePreview && (
          <div className="rounded border border-slate-700 p-1 bg-slate-900/40 max-w-xs">
            <img src={imagePreview} alt="Aperçu" className="rounded max-h-40 object-contain" />
          </div>
        )}

        {/* Tableau éditable */}
        {items.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-slate-300">{meta.item_plural.charAt(0).toUpperCase() + meta.item_plural.slice(1)} déclarés</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addRow} className="h-6 text-[10px]">
                <Plus className="w-3 h-3 mr-1" /> Ajouter
              </Button>
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-800/50 rounded p-1.5">
                  <Input
                    value={it.name}
                    onChange={(e) => updateRow(i, "name", e.target.value)}
                    placeholder="Nom"
                    className="flex-1 h-7 text-xs bg-slate-900 border-slate-700 text-white"
                    data-testid={`recoup-item-name-${kind}-${i}`}
                  />
                  <Input
                    type="number"
                    step="0.5"
                    min={0}
                    value={it.quantity}
                    onChange={(e) => updateRow(i, "quantity", Number(e.target.value || 0))}
                    className="w-20 h-7 text-xs bg-slate-900 border-slate-700 text-white"
                    data-testid={`recoup-item-qty-${kind}-${i}`}
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRow(i)}>
                    <Trash2 className="w-3 h-3 text-rose-400" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {items.length > 0 && (
          <>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Remarques (illisibilité, ratures, etc.)"
              className="bg-slate-800 border-slate-700 text-white text-xs min-h-[50px]"
            />
            <Button
              type="button"
              onClick={compare}
              disabled={comparing}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid={`recoup-compare-${kind}`}
            >
              {comparing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-1" />}
              Comparer aux ventes système
            </Button>
          </>
        )}

        {/* Rapport d'écarts */}
        {summary && (
          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-2 mt-2" data-testid={`recoup-summary-${kind}`}>
            <div className="flex items-center gap-2 mb-2 flex-wrap text-xs">
              <Badge className="bg-slate-700 text-slate-200">Déclaré: {fmt(summary.total_declared_qty)}</Badge>
              <Badge className="bg-slate-700 text-slate-200">Système: {fmt(summary.total_system_qty)}</Badge>
              <Badge className="bg-amber-500/30 text-amber-200">CA système: {fmt(summary.total_system_revenue)} F</Badge>
              {summary.alerts_count > 0 ? (
                <Badge className="bg-rose-500/30 text-rose-200">
                  <AlertTriangle className="w-3 h-3 mr-1 inline" /> {summary.alerts_count} alertes
                </Badge>
              ) : (
                <Badge className="bg-emerald-500/30 text-emerald-200">
                  <CheckCircle2 className="w-3 h-3 mr-1 inline" /> Aucun écart
                </Badge>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-700">
                    <th className="text-left py-1 pr-2">Plat / Jeu</th>
                    <th className="text-right py-1 px-1">Déclaré</th>
                    <th className="text-right py-1 px-1">Système</th>
                    <th className="text-right py-1 px-1">Écart</th>
                    <th className="text-right py-1 pl-1">%</th>
                    <th className="text-left py-1 pl-2">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((r, i) => (
                    <tr key={i} className={r.alert ? "bg-rose-900/15" : ""}>
                      <td className="py-1 pr-2 text-slate-200">
                        {r.name_declared || r.name_system}
                        {r.name_declared && r.name_system && r.name_declared.toLowerCase() !== r.name_system.toLowerCase() && (
                          <span className="text-[9px] text-slate-500 ml-1">({r.name_system})</span>
                        )}
                      </td>
                      <td className="text-right text-slate-300 px-1">{fmt(r.quantity_declared)}</td>
                      <td className="text-right text-slate-300 px-1">{fmt(r.quantity_system)}</td>
                      <td className={`text-right font-mono px-1 ${r.diff_quantity > 0 ? "text-amber-300" : r.diff_quantity < 0 ? "text-rose-300" : "text-slate-400"}`}>
                        {r.diff_quantity > 0 ? "+" : ""}{fmt(r.diff_quantity)}
                      </td>
                      <td className="text-right text-slate-400 pl-1">{r.diff_pct}%</td>
                      <td className="pl-2 text-[10px]">
                        {r.status === "ok" && <Badge className="bg-emerald-500/20 text-emerald-300">OK</Badge>}
                        {r.status === "over_declared" && <Badge className="bg-amber-500/20 text-amber-300">Sur-déclaré</Badge>}
                        {r.status === "under_declared" && <Badge className="bg-rose-500/20 text-rose-300">Sous-déclaré</Badge>}
                        {r.status === "missing_in_system" && <Badge className="bg-orange-500/20 text-orange-300">Absent système</Badge>}
                        {r.status === "missing_in_declaration" && <Badge className="bg-fuchsia-500/20 text-fuchsia-300">Absent déclaration</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const RecoupementPanel = ({ currentUser }) => {
  return (
    <div className="space-y-4" data-testid="recoupement-panel">
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-3 text-xs text-slate-300">
          <p>
            <strong className="text-cyan-300">Recoupement IA</strong> — Photographiez le point manuscrit du cuisinier
            ou le compteur des jeux. L'IA Gemini Vision extrait la liste, vous corrigez si besoin, puis le système compare
            avec les ventes validées du jour. Les écarts sont enregistrés dans l'audit.
          </p>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RecoupementCard kind="cuisine" currentUser={currentUser} />
        <RecoupementCard kind="jeux" currentUser={currentUser} />
      </div>
    </div>
  );
};

export default RecoupementPanel;
