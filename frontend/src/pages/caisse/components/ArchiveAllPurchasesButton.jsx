/**
 * ArchiveAllPurchasesButton — Raccourci visible dans l'onglet Achats (Admin only)
 *
 * Déclenche la même action que `MaintenancePanel` (Statistiques → Administration) :
 *   POST /api/admin/maintenance/reset-purchases
 *
 * Non destructif : flag `archived=true` + horodatage + auteur.
 * Mot de passe Admin Full requis. Restaurable via le panneau Administration.
 */
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Archive, Loader2, Eye, EyeOff } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ArchiveAllPurchasesButton = ({ currentUser, onArchived }) => {
  const [summary, setSummary] = useState(null);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchSummary = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/admin/maintenance/archive-summary`);
      setSummary(r.data);
    } catch (e) {
      // silencieux : on n'affiche pas d'erreur sur ce raccourci
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const close = () => {
    setOpen(false);
    setPassword("");
    setShowPwd(false);
  };

  const doReset = async () => {
    if (!password.trim()) {
      toast.error("Mot de passe Admin requis");
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
        `Archivés : ${r.data.expenses_archived} achats + ${r.data.appro_archived} articles Appro`
      );
      close();
      fetchSummary();
      if (typeof onArchived === "function") {
        try { onArchived(); } catch (_) { /* noop */ }
      }
      // Compat : autres composants peuvent écouter cet event
      window.dispatchEvent(new CustomEvent("purchases-archived"));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de l'archivage");
    } finally {
      setSubmitting(false);
    }
  };

  const expensesActive = summary?.expenses?.active ?? 0;
  const approActive = summary?.appro_manager?.active ?? 0;
  const totalActive = expensesActive + approActive;

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={totalActive === 0}
        className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
        data-testid="archive-all-purchases-btn"
        title={
          totalActive === 0
            ? "Aucun achat actif à archiver"
            : `Archiver les ${totalActive} demandes/articles actifs (non destructif, restaurable)`
        }
      >
        <Archive className="w-4 h-4 mr-2" />
        Archiver les achats
        {totalActive > 0 && (
          <span className="ml-2 text-[10px] bg-rose-500/30 text-rose-200 rounded-full px-1.5 py-0.5">
            {totalActive}
          </span>
        )}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          data-testid="archive-all-dialog"
        >
          <Card className="bg-slate-900 border-rose-500/50 w-full max-w-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-rose-300 flex items-center gap-2 text-base">
                <AlertTriangle className="w-5 h-5" />
                Archiver tous les achats
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-200">
              <p>
                Cette action <strong className="text-rose-300">archive</strong> (non destructif) :
              </p>
              <ul className="list-disc list-inside text-xs space-y-0.5 ml-2 text-slate-300">
                <li>
                  <strong className="text-rose-200">{expensesActive}</strong> demandes d'achat actives
                </li>
                <li>
                  <strong className="text-rose-200">{approActive}</strong> articles de l'Appro Manager
                </li>
              </ul>
              <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded p-2">
                ✅ L'historique des prix d'achat <strong>est conservé</strong>. Tu peux restaurer via
                {' '}<em>Statistiques → Administration → Restaurer</em>.
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
                    data-testid="archive-all-password-input"
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
                  onClick={close}
                  disabled={submitting}
                  className="flex-1 border-slate-600 text-slate-300"
                  data-testid="archive-all-cancel-btn"
                >
                  Annuler
                </Button>
                <Button
                  onClick={doReset}
                  disabled={submitting || !password.trim()}
                  className="flex-1 bg-rose-600 hover:bg-rose-700"
                  data-testid="archive-all-confirm-btn"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Archivage…</>
                  ) : (
                    <><Archive className="w-4 h-4 mr-2" /> Confirmer</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
};

export default ArchiveAllPurchasesButton;
