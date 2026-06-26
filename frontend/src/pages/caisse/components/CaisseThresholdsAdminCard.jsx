/**
 * CaisseThresholdsAdminCard — Panneau Admin pour configurer les seuils des bons à crédit.
 *
 * Permet de modifier :
 *   - Plafond mensuel + taux remise des bons Responsable Op. & Log
 *   - Plafond mensuel + taux remise des bons "la Direction"
 *   - Plafond mensuel + taux remise des bons Employé
 *
 * Endpoints : GET / PUT / DELETE /api/admin/caisse-thresholds
 */
import React, { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Coins, Save, RotateCcw, Loader2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ROW_DEFS = [
  {
    title: "Responsable Op. & Log",
    capField: "manager_monthly_cap",
    rateField: "manager_discount_rate",
    color: "amber",
  },
  {
    title: "la Direction",
    capField: "director_monthly_cap",
    rateField: "director_discount_rate",
    color: "purple",
    capHint: "0 = pas de plafond",
  },
  {
    title: "Employés (caissières, serveuses)",
    capField: "employee_monthly_cap",
    rateField: "employee_discount_rate",
    color: "cyan",
  },
];

const fmt = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n || 0));

export default function CaisseThresholdsAdminCard({ actorName = "Admin" }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/admin/caisse-thresholds`);
      setData(r.data);
      const seed = {};
      ROW_DEFS.forEach((row) => {
        seed[row.capField] = String(r.data[row.capField] ?? "");
        seed[row.rateField] = String(Math.round((r.data[row.rateField] ?? 0) * 100));
      });
      setForm(seed);
    } catch (e) {
      toast.error("Impossible de charger les seuils");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const save = async () => {
    setBusy(true);
    try {
      const payload = { actor_name: actorName };
      ROW_DEFS.forEach((row) => {
        const cap = parseFloat(form[row.capField]);
        const rate = parseFloat(form[row.rateField]) / 100;
        if (Number.isFinite(cap)) payload[row.capField] = cap;
        if (Number.isFinite(rate)) payload[row.rateField] = rate;
      });
      const r = await axios.put(`${API}/admin/caisse-thresholds`, payload);
      setData(r.data);
      toast.success("Seuils mis à jour");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!window.confirm("Restaurer tous les seuils aux valeurs par défaut ?")) return;
    setBusy(true);
    try {
      const r = await axios.delete(`${API}/admin/caisse-thresholds`);
      setData(r.data);
      // Re-seed le formulaire avec les valeurs reset
      const seed = {};
      ROW_DEFS.forEach((row) => {
        seed[row.capField] = String(r.data[row.capField] ?? "");
        seed[row.rateField] = String(Math.round((r.data[row.rateField] ?? 0) * 100));
      });
      setForm(seed);
      toast.success("Seuils restaurés aux valeurs par défaut");
    } catch (_) {
      toast.error("Erreur de restauration");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="bg-slate-900/70 border-amber-500/30" data-testid="caisse-thresholds-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-amber-200 flex items-center gap-2 text-base">
          <Coins className="w-4 h-4" />
          Seuils des bons à crédit
          {data?.is_customized && (
            <span className="text-[9px] uppercase tracking-wider text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 rounded px-1.5 py-0.5 font-bold">
              Personnalisé
            </span>
          )}
        </CardTitle>
        <p className="text-xs text-slate-400">
          Plafond mensuel et taux de remise appliqués automatiquement à la création des bons.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
          </div>
        ) : (
          <>
            {ROW_DEFS.map((row) => (
              <div
                key={row.title}
                className={`bg-slate-800/50 rounded-lg p-3 border border-${row.color}-500/20`}
                data-testid={`threshold-row-${row.capField}`}
              >
                <p className={`text-${row.color}-300 text-sm font-semibold mb-2`}>{row.title}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-slate-400 uppercase tracking-wider">
                      Plafond mensuel (FCFA){row.capHint && <span className="ml-1 text-slate-500 lowercase normal-case">— {row.capHint}</span>}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="500"
                      value={form[row.capField] ?? ""}
                      onChange={(e) => setForm((p) => ({ ...p, [row.capField]: e.target.value }))}
                      className="bg-slate-900 border-slate-700 text-white mt-1 h-8 text-sm"
                      data-testid={`threshold-input-${row.capField}`}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-slate-400 uppercase tracking-wider">Remise (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="5"
                      value={form[row.rateField] ?? ""}
                      onChange={(e) => setForm((p) => ({ ...p, [row.rateField]: e.target.value }))}
                      className="bg-slate-900 border-slate-700 text-white mt-1 h-8 text-sm"
                      data-testid={`threshold-input-${row.rateField}`}
                    />
                  </div>
                </div>
              </div>
            ))}

            <div className="flex gap-2 justify-end pt-2 flex-wrap">
              {data?.is_customized && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={reset}
                  disabled={busy}
                  className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
                  data-testid="threshold-reset"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  Défauts
                </Button>
              )}
              <Button
                size="sm"
                onClick={save}
                disabled={busy}
                className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold"
                data-testid="threshold-save"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                Enregistrer
              </Button>
            </div>
            {data?.updated_at && (
              <p className="text-[10px] text-slate-500 text-right">
                Dernière modif : {new Date(data.updated_at).toLocaleString("fr-FR")}
                {data.updated_by && ` par ${data.updated_by}`}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
