/**
 * PromoPackEditDialog — Modale d'édition d'un pack Promo Vacances par l'Admin.
 *
 * Affiche tous les champs modifiables d'un pack (titre, prix, image, description, etc.).
 * Met à jour via PUT /api/promo-vacances/pack/{id}. Bouton "Restaurer défauts" (DELETE).
 *
 * Refetch automatique du parent après save/reset via la callback `onSaved`.
 */
import React, { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { Switch } from "../../../components/ui/switch";
import { Pencil, RotateCcw, Save, Loader2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const FIELD_DEFS = [
  { key: "title", label: "Titre", type: "text", maxLength: 80 },
  { key: "subtitle", label: "Sous-titre", type: "text", maxLength: 120 },
  { key: "highlight", label: "Badge prix (ex: 2 000 FCFA)", type: "text", maxLength: 40 },
  { key: "description", label: "Description", type: "textarea", maxLength: 400 },
  { key: "price", label: "Prix (FCFA)", type: "number" },
  { key: "old_price", label: "Prix barré ancien (FCFA)", type: "number" },
  { key: "regular_promo_price", label: "Prix après 100 premières (FCFA)", type: "number" },
  { key: "image", label: "URL de l'image", type: "text", maxLength: 500 },
  { key: "cta_label", label: "Texte du bouton CTA", type: "text", maxLength: 60 },
  { key: "included_games", label: "Jeux inclus", type: "number" },
  { key: "included_players", label: "Joueurs inclus", type: "number" },
];

export default function PromoPackEditDialog({ open, onOpenChange, pack, onSaved, actorName = "Admin" }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && pack) {
      // Pré-remplit avec les valeurs actuelles du pack
      const seed = {};
      FIELD_DEFS.forEach((f) => {
        seed[f.key] = pack[f.key] ?? (f.type === "number" ? "" : "");
      });
      seed.limit_100_first = !!pack.limit_100_first;
      setForm(seed);
    }
  }, [open, pack]);

  if (!pack) return null;

  const handleChange = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      // Convertit les champs numériques vides en null pour ne pas écraser avec 0
      const payload = { actor_name: actorName };
      FIELD_DEFS.forEach((f) => {
        const v = form[f.key];
        if (f.type === "number") {
          if (v !== "" && v !== null && v !== undefined) payload[f.key] = parseInt(v, 10);
        } else if (v !== "" && v !== null && v !== undefined) {
          payload[f.key] = String(v);
        }
      });
      payload.limit_100_first = !!form.limit_100_first;
      await axios.put(`${API}/promo-vacances/pack/${pack.id}`, payload);
      toast.success("Pack mis à jour");
      onSaved && onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Restaurer ce pack à ses valeurs par défaut ?\nLes modifications admin seront perdues.")) return;
    setSaving(true);
    try {
      await axios.delete(`${API}/promo-vacances/pack/${pack.id}`);
      toast.success("Pack restauré aux valeurs par défaut");
      onSaved && onSaved();
      onOpenChange(false);
    } catch (_) {
      toast.error("Erreur lors de la restauration");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-slate-900 border-amber-500/40 text-white max-w-2xl max-h-[90vh] overflow-y-auto"
        data-testid="promo-pack-edit-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-300">
            <Pencil className="w-4 h-4" />
            Modifier — {pack.title}
          </DialogTitle>
          <DialogDescription className="text-slate-400 text-xs">
            Les modifications s'appliquent en temps réel sur le site public.
            {pack.is_customized && (
              <span className="ml-2 inline-block text-emerald-300 text-[10px] uppercase tracking-wider">· Personnalisé</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Aperçu rapide de l'image */}
          {form.image ? (
            <div className="flex items-center gap-3 bg-slate-800/40 rounded-lg p-2">
              <img
                src={form.image}
                alt="Aperçu"
                className="w-16 h-16 rounded object-cover border border-slate-700"
                onError={(e) => { e.target.style.display = "none"; }}
              />
              <p className="text-[10px] text-slate-400">Aperçu de l'image actuelle</p>
            </div>
          ) : null}

          {FIELD_DEFS.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label htmlFor={`pf-${f.key}`} className="text-slate-300 text-xs">
                {f.label}
              </Label>
              {f.type === "textarea" ? (
                <Textarea
                  id={`pf-${f.key}`}
                  value={form[f.key] ?? ""}
                  onChange={(e) => handleChange(f.key, e.target.value)}
                  maxLength={f.maxLength}
                  className="bg-slate-800 border-slate-700 text-white min-h-[70px]"
                  data-testid={`pack-edit-${f.key}`}
                />
              ) : (
                <Input
                  id={`pf-${f.key}`}
                  type={f.type}
                  value={form[f.key] ?? ""}
                  onChange={(e) => handleChange(f.key, e.target.value)}
                  maxLength={f.maxLength}
                  className="bg-slate-800 border-slate-700 text-white"
                  data-testid={`pack-edit-${f.key}`}
                />
              )}
            </div>
          ))}

          <div className="flex items-center justify-between bg-slate-800/40 rounded-lg p-3">
            <div>
              <p className="text-sm text-white font-medium">Limite "100 premières"</p>
              <p className="text-[10px] text-slate-400">Affiche le badge et applique le prix régulier après 100 résa.</p>
            </div>
            <Switch
              checked={!!form.limit_100_first}
              onCheckedChange={(v) => handleChange("limit_100_first", v)}
              data-testid="pack-edit-limit-100-first"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          {pack.is_customized && (
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={saving}
              className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
              data-testid="pack-edit-reset"
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Restaurer défauts
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="text-slate-300"
          >
            Annuler
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold"
            data-testid="pack-edit-save"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
