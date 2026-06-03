/**
 * MaintenancePanel — Section "Administration" cachée pour les opérations
 * destructrices (réservée à l'Admin Full).
 *
 * Workflow "Remise à zéro des Achats" :
 *   1. Affiche le résumé : ce qui va être archivé (Achats actifs + Appro Manager actifs)
 *   2. Demande le mot de passe Admin Full pour confirmer
 *   3. Archive (non destructif) : flag `archived=True` + horodatage + auteur
 *   4. Possibilité de restaurer en 1 clic si erreur
 *
 * L'historique des prix (`purchase_price_history`) est conservé.
 */
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Trash2, RotateCcw, Loader2, ShieldAlert, Eye, EyeOff } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MaintenancePanel = ({ currentUser }) => {
  const isAdmin = currentUser?.role === "admin";
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/admin/maintenance/archive-summary`);
      setSummary(r.data);
    } catch (e) {
      toast.error("Erreur chargement résumé");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  if (!isAdmin) {
    return (
      <Card className="bg-rose-950/30 border-rose-500/40">
        <CardContent className="py-8 text-center text-rose-300 text-sm">
          <ShieldAlert className="w-8 h-8 mx-auto mb-2" />
          Section réservée à l'administrateur.
        </CardContent>
      </Card>
    );
  }

  const closeAllDialogs = () => {
    setShowResetDialog(false);
    setShowRestoreDialog(false);
    setPassword("");
    setShowPwd(false);
  };

  const doReset = async () => {
    if (!password.trim()) {
      toast.error("Mot de passe requis");
      return;
    }
    setSubmitting(true);
    try {
      const r = await axios.post(`${API}/admin/maintenance/reset-purchases`, {
        actor_role: "admin",
        actor_name: currentUser?.full_name || currentUser?.username || "Admin",
        password: password.trim(),
      });
      toast.success(
        `Remise à zéro effectuée — ${r.data.expenses_archived} achats + ${r.data.appro_archived} articles Appro archivés`
      );
      closeAllDialogs();
      fetchSummary();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de la remise à zéro");
    } finally {
      setSubmitting(false);
    }
  };

  const doRestore = async () => {
    if (!password.trim()) {
      toast.error("Mot de passe requis");
      return;
    }
    setSubmitting(true);
    try {
      const r = await axios.post(`${API}/admin/maintenance/restore-purchases`, {
        actor_role: "admin",
        actor_name: currentUser?.full_name || currentUser?.username || "Admin",
        password: password.trim(),
      });
      toast.success(
        `Restauration effectuée — ${r.data.expenses_restored} achats + ${r.data.appro_restored} articles restaurés`
      );
      closeAllDialogs();
      fetchSummary();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de la restauration");
    } finally {
      setSubmitting(false);
    }
  };

  const expensesActive = summary?.expenses?.active ?? 0;
  const expensesArchived = summary?.expenses?.archived ?? 0;
  const approActive = summary?.appro_manager?.active ?? 0;
  const approArchived = summary?.appro_manager?.archived ?? 0;
  const totalActive = expensesActive + approActive;
  const totalArchived = expensesArchived + approArchived;

  return (
    <div className="space-y-3" data-testid="maintenance-panel">
      <Card className="bg-gradient-to-br from-rose-950/40 to-orange-950/30 border-rose-500/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap text-rose-200">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            Administration — Maintenance
            <Badge className="bg-rose-500/30 text-rose-200 text-[10px]">RISQUE</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs space-y-3 text-slate-200">
          <p className="text-amber-200">
            ⚠️ Ces actions sont <strong>sensibles</strong>. Elles n'écrasent pas les données mais les
            <strong> archivent</strong> (flag <code className="text-[10px] bg-slate-800 px-1 rounded">archived=true</code>).
            L'historique des prix d'achat est <strong>conservé</strong> dans tous les cas.
          </p>

          {/* État courant */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="bg-slate-900/50 rounded p-2 border border-slate-700">
              <p className="text-[10px] uppercase text-slate-400">Achats actifs</p>
              <p className="text-lg font-bold text-emerald-300 font-mono" data-testid="maint-expenses-active">{expensesActive}</p>
            </div>
            <div className="bg-slate-900/50 rounded p-2 border border-slate-700">
              <p className="text-[10px] uppercase text-slate-400">Appro Manager actifs</p>
              <p className="text-lg font-bold text-emerald-300 font-mono" data-testid="maint-appro-active">{approActive}</p>
            </div>
            <div className="bg-slate-900/50 rounded p-2 border border-slate-700">
              <p className="text-[10px] uppercase text-slate-400">Achats archivés</p>
              <p className="text-lg font-bold text-slate-400 font-mono" data-testid="maint-expenses-archived">{expensesArchived}</p>
            </div>
            <div className="bg-slate-900/50 rounded p-2 border border-slate-700">
              <p className="text-[10px] uppercase text-slate-400">Appro archivés</p>
              <p className="text-lg font-bold text-slate-400 font-mono" data-testid="maint-appro-archived">{approArchived}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap pt-1">
            <Button
              variant="destructive"
              onClick={() => setShowResetDialog(true)}
              disabled={loading || totalActive === 0}
              className="bg-rose-600 hover:bg-rose-700 text-white"
              data-testid="maint-reset-btn"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Remise à zéro des Achats ({totalActive})
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowRestoreDialog(true)}
              disabled={loading || totalArchived === 0}
              className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
              data-testid="maint-restore-btn"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Restaurer les éléments archivés ({totalArchived})
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dialog Reset */}
      {showResetDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" data-testid="maint-reset-dialog">
          <Card className="bg-slate-900 border-rose-500/50 w-full max-w-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-rose-300 flex items-center gap-2 text-base">
                <AlertTriangle className="w-5 h-5" />
                Confirmer la remise à zéro
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-200">
              <p>
                Vous êtes sur le point d'<strong className="text-rose-300">archiver</strong> :
              </p>
              <ul className="list-disc list-inside text-xs space-y-0.5 ml-2 text-slate-300">
                <li><strong className="text-rose-200">{expensesActive}</strong> demandes d'achat (toutes catégories / statuts)</li>
                <li><strong className="text-rose-200">{approActive}</strong> articles de l'Appro Manager</li>
              </ul>
              <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded p-2">
                ✅ L'historique des prix d'achat <strong>est conservé</strong>.
                Les listes pourront être restaurées via le bouton "Restaurer" si nécessaire.
              </p>
              <div className="space-y-1">
                <label className="text-[11px] text-slate-300 font-semibold uppercase tracking-wide">
                  Mot de passe Admin Full
                </label>
                <div className="relative">
                  <Input
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mot de passe…"
                    className="bg-slate-800 border-slate-600 text-white pr-10"
                    autoFocus
                    data-testid="maint-password-input"
                    onKeyDown={(e) => { if (e.key === "Enter") doReset(); }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    tabIndex={-1}
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={closeAllDialogs}
                  disabled={submitting}
                  className="flex-1 border-slate-600 text-slate-300"
                  data-testid="maint-cancel-btn"
                >
                  Annuler
                </Button>
                <Button
                  onClick={doReset}
                  disabled={submitting || !password.trim()}
                  className="flex-1 bg-rose-600 hover:bg-rose-700"
                  data-testid="maint-confirm-reset-btn"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Archivage…</>
                  ) : (
                    <><Trash2 className="w-4 h-4 mr-2" /> Confirmer la remise à zéro</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dialog Restore */}
      {showRestoreDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" data-testid="maint-restore-dialog">
          <Card className="bg-slate-900 border-amber-500/50 w-full max-w-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-amber-300 flex items-center gap-2 text-base">
                <RotateCcw className="w-5 h-5" />
                Restaurer les éléments archivés
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-200">
              <p>
                Restaurer <strong className="text-emerald-300">{expensesArchived}</strong> achats +
                {' '}<strong className="text-emerald-300">{approArchived}</strong> articles Appro
                actuellement archivés ?
              </p>
              <p className="text-[11px] text-slate-400">
                Ils redeviendront visibles dans les onglets "Achats" et "Appro Manager".
              </p>
              <div className="space-y-1">
                <label className="text-[11px] text-slate-300 font-semibold uppercase tracking-wide">
                  Mot de passe Admin Full
                </label>
                <Input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mot de passe…"
                  className="bg-slate-800 border-slate-600 text-white"
                  autoFocus
                  data-testid="maint-restore-password-input"
                  onKeyDown={(e) => { if (e.key === "Enter") doRestore(); }}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={closeAllDialogs}
                  disabled={submitting}
                  className="flex-1 border-slate-600 text-slate-300"
                >
                  Annuler
                </Button>
                <Button
                  onClick={doRestore}
                  disabled={submitting || !password.trim()}
                  className="flex-1 bg-amber-600 hover:bg-amber-700"
                  data-testid="maint-confirm-restore-btn"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Restauration…</>
                  ) : (
                    <><RotateCcw className="w-4 h-4 mr-2" /> Confirmer la restauration</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default MaintenancePanel;
