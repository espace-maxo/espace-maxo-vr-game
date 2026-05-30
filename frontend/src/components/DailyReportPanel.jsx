/**
 * DailyReportPanel — Panneau "Rapport du jour" pour cuisinier ET coach_jeux.
 *
 * - Récupère/crée le brouillon du jour (auto-summary)
 * - Affiche les chiffres auto-calculés
 * - Champ "Observations libres" (édition tant que pas soumis)
 * - Bouton "Transmettre à l'administrateur" (verrouille en lecture seule)
 */
import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText, Send, RefreshCw, Loader2, CheckCircle2, Lock,
  Hash, Coins, ChefHat, Gamepad2,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DailyReportPanel = ({ currentUser, kind }) => {
  // kind: "cuisine" | "coach_jeux"
  const [report, setReport] = useState(null);
  const [observations, setObservations] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);

  const actorRole = currentUser?.role;
  const actorName = currentUser?.full_name || currentUser?.username || "";

  const loadDraft = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.post(`${API}/daily-reports/draft`, {
        kind, actor_name: actorName, actor_role: actorRole,
      });
      setReport(r.data.report);
      setObservations(r.data.report?.observations || "");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur chargement rapport");
    } finally {
      setLoading(false);
    }
  }, [kind, actorName, actorRole]);

  useEffect(() => { loadDraft(); }, [loadDraft]);

  const saveObservations = async () => {
    if (!report || report.status !== "draft") return;
    setSaving(true);
    try {
      await axios.post(`${API}/daily-reports/${report.id}/observations`, {
        observations, actor_name: actorName, actor_role: actorRole,
      });
      toast.success("Observations enregistrées");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const submitReport = async () => {
    if (!report) return;
    if (!window.confirm("Transmettre le rapport à l'administrateur ? Action irréversible.")) return;
    setSubmitting(true);
    try {
      // Sauvegarde observations puis submit
      if (observations !== report.observations) {
        await axios.post(`${API}/daily-reports/${report.id}/observations`, {
          observations, actor_name: actorName, actor_role: actorRole,
        });
      }
      await axios.post(`${API}/daily-reports/${report.id}/submit`, {
        actor_name: actorName, actor_role: actorRole,
      });
      toast.success("Rapport transmis à l'administrateur");
      loadDraft();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur d'envoi");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !report) {
    return (
      <Card className="bg-slate-800/40 border-slate-700">
        <CardContent className="p-8 text-center">
          <Loader2 className="w-6 h-6 mx-auto animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  const submitted = report.status === "submitted";
  const s = report.auto_summary || {};
  const items = s.items || [];

  const KindIcon = kind === "cuisine" ? ChefHat : Gamepad2;
  const accentColor = kind === "cuisine" ? "amber" : "purple";

  return (
    <div className="space-y-3" data-testid={`daily-report-${kind}`}>
      {/* Statut */}
      <Card className={submitted ? "bg-emerald-900/30 border-emerald-500/50" : `bg-slate-800/60 border-${accentColor}-500/40`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className={`w-5 h-5 text-${accentColor}-400`} />
              Rapport du {format(new Date(report.date), "EEEE d MMMM yyyy", { locale: fr })}
            </span>
            {submitted ? (
              <Badge className="bg-emerald-500 text-white">
                <Lock className="w-3 h-3 mr-1" /> Transmis · {report.submitted_at ? format(new Date(report.submitted_at), "HH:mm") : ""}
              </Badge>
            ) : (
              <Badge className="bg-amber-500/30 text-amber-200">Brouillon</Badge>
            )}
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Auto-summary */}
      <Card className="bg-slate-800/60 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <KindIcon className={`w-4 h-4 text-${accentColor}-400`} />
              Récapitulatif automatique
            </span>
            {!submitted && (
              <Button variant="ghost" size="sm" onClick={loadDraft}
                      className="text-slate-300 h-7 text-[11px]" data-testid="report-refresh">
                <RefreshCw className="w-3 h-3 mr-1" /> Rafraîchir
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs space-y-2">
          {/* Stats globales selon kind */}
          {kind === "cuisine" ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-900/50 rounded p-2 text-center">
                <div className="text-[10px] text-slate-400">Plats préparés</div>
                <div className="text-lg font-bold text-amber-300">{s.total_quantity || 0}</div>
              </div>
              <div className="bg-slate-900/50 rounded p-2 text-center">
                <div className="text-[10px] text-slate-400">Types de plats</div>
                <div className="text-lg font-bold text-amber-300">{s.items_count || 0}</div>
              </div>
              <div className="bg-slate-900/50 rounded p-2 text-center">
                <div className="text-[10px] text-slate-400">Scans bons</div>
                <div className="text-lg font-bold text-cyan-300">{s.scans_count || 0}</div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-slate-900/50 rounded p-2 text-center">
                <div className="text-[10px] text-slate-400">Bons transmis</div>
                <div className="text-lg font-bold text-purple-300">{s.bons_total || 0}</div>
              </div>
              <div className="bg-slate-900/50 rounded p-2 text-center">
                <div className="text-[10px] text-slate-400">Parties</div>
                <div className="text-lg font-bold text-purple-300">{s.total_quantity || 0}</div>
              </div>
              <div className="bg-slate-900/50 rounded p-2 text-center">
                <div className="text-[10px] text-slate-400">Revenus déclarés</div>
                <div className="text-sm font-bold text-emerald-300">{(s.total_revenue || 0).toLocaleString("fr-FR")} F</div>
              </div>
              <div className="bg-slate-900/50 rounded p-2 text-center">
                <div className="text-[10px] text-slate-400">Refusés</div>
                <div className="text-lg font-bold text-rose-300">{s.bons_rejected || 0}</div>
              </div>
            </div>
          )}

          {/* Détail items */}
          {items.length > 0 ? (
            <div>
              <div className="text-[11px] text-slate-400 mb-1 uppercase tracking-wider">Détail</div>
              <div className="space-y-0.5 max-h-[200px] overflow-y-auto pr-1">
                {items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-900/40 rounded px-2 py-1">
                    <span className="text-slate-200 truncate flex-1">{it.name}</span>
                    <Badge className={`bg-${accentColor}-700/50 text-${accentColor}-100 text-[10px] mx-1`}>x{it.quantity}</Badge>
                    {it.total != null && (
                      <span className="text-emerald-300 text-[10px] ml-1">{Number(it.total).toLocaleString("fr-FR")} F</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-slate-500 italic text-center py-3">
              Aucune activité enregistrée aujourd'hui (encore).
            </p>
          )}
        </CardContent>
      </Card>

      {/* Observations */}
      <Card className="bg-slate-800/60 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Observations libres</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {submitted ? (
            <p className="text-xs text-slate-300 whitespace-pre-wrap p-2 bg-slate-900/40 rounded min-h-[40px]">
              {report.observations || <span className="text-slate-500 italic">Aucune observation transmise.</span>}
            </p>
          ) : (
            <>
              <Textarea
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                placeholder="Notes, remarques, incidents éventuels du jour…"
                className="bg-slate-900 border-slate-700 min-h-[100px] text-sm"
                data-testid="report-observations"
              />
              <Button variant="ghost" size="sm" disabled={saving}
                      onClick={saveObservations}
                      className="text-slate-300 h-7 text-[11px]"
                      data-testid="report-save-obs">
                {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                Enregistrer les observations
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Submit */}
      {!submitted && (
        <Button
          onClick={submitReport}
          disabled={submitting}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-11"
          data-testid="report-submit"
        >
          {submitting ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Transmission…</>
          ) : (
            <><Send className="w-4 h-4 mr-2" /> Transmettre à l'administrateur</>
          )}
        </Button>
      )}
      {submitted && (
        <div className="bg-emerald-900/30 border border-emerald-500/40 rounded p-3 text-sm text-emerald-100 flex items-center gap-2"
             data-testid="report-locked">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          Rapport transmis à l'administrateur. Plus de modification possible.
        </div>
      )}
    </div>
  );
};

export default DailyReportPanel;
