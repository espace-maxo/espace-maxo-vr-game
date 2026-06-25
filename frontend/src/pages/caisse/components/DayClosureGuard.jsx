/**
 * DayClosureGuard - Bloque l'accès à "Faire le point" tant que la journée n'est pas fermée.
 *
 * Workflow :
 *  - Affiche la liste des agents avec le statut de leur "Point Agent"
 *  - Quand TOUS les agents ont fait leur point → bouton "Fermer la journée" actif
 *  - Une fois fermée : la Responsable Op. & Log voit le statut "Verrouillée" + accès à Faire le point
 *  - Seul l'Admin peut "Rouvrir la journée"
 */
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Lock, Unlock, CheckCircle2, Clock, AlertTriangle, UserCheck, RefreshCw, Calendar, ChevronRight, Loader2, WifiOff } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatPrice = (n) => Number(n || 0).toLocaleString("fr-FR");

export default function DayClosureGuard({ currentUser, children }) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [date, setDate] = useState(today);
  const [status, setStatus] = useState({ status: "open", closure: null });
  const [serverStatus, setServerStatus] = useState({ servers: [], validated_count: 0, total_servers: 0, all_validated: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(null);
  // Dialog "mot de passe Journée" (remplace window.prompt)
  const [pwDialog, setPwDialog] = useState({ open: false, value: "", force: false });

  const isAdmin = currentUser?.role === "admin";
  const isManager = currentUser?.role === "manager";
  const isServer = currentUser?.role === "server";

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [closureRes, serversRes] = await Promise.all([
        axios.get(`${API}/day-closures/${date}`),
        axios.get(`${API}/server-points/status`, { params: { date } }),
      ]);
      setStatus(closureRes.data);
      setServerStatus(serversRes.data);
    } catch (e) {
      console.error(e);
      const msg = e?.response?.data?.detail
        || (e?.message?.includes("Network") ? "Connexion réseau indisponible" : "Impossible de charger le statut de la journée");
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { refresh(); }, [refresh]);

  const validateMyPoint = async () => {
    if (!isServer) return;
    setBusy(true);
    try {
      await axios.post(`${API}/server-points`, {
        date,
        server_id: currentUser.id,
        server_name: currentUser.full_name || currentUser.username,
      });
      toast.success("Votre point a été validé");
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally { setBusy(false); }
  };

  const closeDayHandler = async (force = false, password = null) => {
    setBusy(true);
    try {
      const payload = {
        closed_by: currentUser?.full_name || currentUser?.username || "Responsable Op. & Log",
        closed_by_role: currentUser?.role || "",
        force,
      };
      if (password) payload.password = password;
      await axios.post(`${API}/day-closures/${date}/close`, payload);
      toast.success("Journée fermée");
      setPwDialog({ open: false, value: "", force: false });
      refresh();
    } catch (e) {
      const detail = e.response?.data?.detail || "Erreur de fermeture";
      const httpStatus = e.response?.status;
      // Si non-admin et mot de passe requis → afficher le Dialog (au lieu du window.prompt)
      if (httpStatus === 401 && !isAdmin) {
        setPwDialog({ open: true, value: "", force });
      } else if (httpStatus === 403 && !isAdmin) {
        toast.error(detail);
      } else {
        toast.error(detail);
      }
    } finally { setBusy(false); }
  };

  const submitPasswordDialog = () => {
    const pw = (pwDialog.value || "").trim();
    if (!pw) {
      toast.error("Le mot de passe ne peut pas être vide");
      return;
    }
    closeDayHandler(pwDialog.force, pw);
  };

  const reopenDay = async () => {
    if (!isAdmin) { toast.error("Réservé à l'Administrateur"); return; }
    if (!window.confirm("Ré-ouvrir cette journée ? Cela permettra à nouveau les modifications.")) return;
    setBusy(true);
    try {
      await axios.post(`${API}/day-closures/${date}/reopen`, {
        reopened_by: currentUser?.full_name || currentUser?.username,
        reason: "Ré-ouverture manuelle",
      });
      toast.success("Journée ré-ouverte");
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally { setBusy(false); }
  };

  // Skeleton / loader pendant le premier chargement
  if (loading && !status?.closure && serverStatus.servers.length === 0) {
    return (
      <div className="space-y-4" data-testid="day-closure-loading">
        <Card className="bg-slate-900/60 border-slate-700">
          <CardContent className="p-6 flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
            <p className="text-slate-300 text-sm">Chargement du statut de la journée…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // État d'erreur de chargement : on offre un Réessayer plutôt que rester bloqué silencieusement
  if (loadError && !status?.closure) {
    return (
      <div className="space-y-4" data-testid="day-closure-error">
        <Card className="bg-rose-900/20 border-rose-500/40">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-rose-300">
              <WifiOff className="w-5 h-5" />
              <p className="font-semibold">Impossible de charger la journée</p>
            </div>
            <p className="text-rose-200/80 text-sm">{loadError}</p>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                onClick={refresh}
                className="bg-rose-600 hover:bg-rose-700 text-white"
                data-testid="day-closure-retry-btn"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Réessayer
              </Button>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white h-9 w-[160px]"
                data-testid="day-closure-date-retry"
              />
            </div>
            <p className="text-slate-500 text-xs">
              Si le problème persiste : vérifie ta connexion Internet ou contacte l'Admin.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Si journée FERMÉE → on rend les enfants (l'écran "Faire le point")
  // avec un bandeau de statut "verrouillée" + bouton de réouverture admin.
  if (!loading && status.status === "closed") {
    return (
      <div className="space-y-3">
        <Card className="bg-emerald-900/20 border-emerald-500/40" data-testid="day-closed-banner">
          <CardContent className="p-3 flex items-center gap-3 flex-wrap">
            <Lock className="w-5 h-5 text-emerald-400" />
            <div className="flex-1 min-w-0">
              <p className="text-emerald-300 text-sm font-medium">
                Journée du <strong className="text-white">{format(new Date(date), "EEEE d MMMM yyyy", { locale: fr })}</strong> fermée
              </p>
              <p className="text-slate-400 text-xs">
                Par {status.closure?.closed_by} · {status.closure?.closed_at?.slice(0, 16).replace("T", " à ")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white h-8 w-[150px]"
                data-testid="day-closure-date-picker"
              />
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={reopenDay}
                  disabled={busy}
                  className="border-amber-500/50 text-amber-300 hover:bg-amber-500/10 h-8"
                  data-testid="reopen-day-btn"
                >
                  <Unlock className="w-3.5 h-3.5 mr-1" /> Rouvrir
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        {children}
      </div>
    );
  }

  // Sinon : écran de fermeture obligatoire
  return (
    <div className="space-y-4" data-testid="day-closure-guard">
      <Card className="bg-gradient-to-br from-amber-900/20 to-orange-900/10 border-2 border-amber-500/50">
        <CardHeader>
          <CardTitle className="text-amber-300 flex items-center gap-2 flex-wrap">
            <Lock className="w-5 h-5" />
            Fermez la journée avant de faire le point
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white h-8 ml-auto w-[150px]"
              data-testid="day-closure-date-input"
            />
            <Button size="sm" variant="ghost" onClick={refresh} className="text-slate-300 h-8" data-testid="day-closure-refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-slate-300 text-sm flex items-center gap-1">
            <Calendar className="w-4 h-4 text-amber-400" />
            Journée du <strong className="text-white">{format(new Date(date), "EEEE d MMMM yyyy", { locale: fr })}</strong> — non fermée
          </p>

          {/* Statut des points agents */}
          <div className="bg-slate-900/50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <p className="text-slate-300 text-sm font-semibold">Points des agents</p>
              <Badge className={serverStatus.all_validated ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}>
                {serverStatus.validated_count}/{serverStatus.total_servers} validés
              </Badge>
            </div>
            {serverStatus.servers.length === 0 ? (
              <p className="text-slate-500 text-xs italic">Aucun agent actif</p>
            ) : (
              <div className="space-y-1.5">
                {serverStatus.servers.map((s) => {
                  const isMine = isServer && s.server_id === currentUser?.id;
                  return (
                  <div key={s.server_id} className={`flex items-center justify-between p-2 rounded ${s.validated ? "bg-emerald-900/20 border border-emerald-500/30" : "bg-slate-800/60 border border-slate-700"}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      {s.validated ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <Clock className="w-4 h-4 text-slate-400 shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate flex items-center gap-2">
                          {s.server_name}
                          {isMine && <Badge className="bg-cyan-500/20 text-cyan-300 text-[10px]">Vous</Badge>}
                        </p>
                        {s.validated && (
                          <p className="text-slate-400 text-[10px]">
                            {s.total_invoices} facture(s) · {formatPrice(s.total_amount)} F · validé à {s.validated_at?.slice(11, 16)}
                          </p>
                        )}
                      </div>
                    </div>
                    {!s.validated && isMine && (
                      <Button
                        size="sm"
                        onClick={validateMyPoint}
                        disabled={busy}
                        className="bg-cyan-600 hover:bg-cyan-700 text-white h-7 text-xs"
                        data-testid="self-validate-server-point"
                      >
                        <UserCheck className="w-3 h-3 mr-1" /> Je valide mon service
                      </Button>
                    )}
                    {!s.validated && !isMine && (
                      <Badge className="bg-amber-500/20 text-amber-300 text-[10px]">En attente</Badge>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions de fermeture (Responsable Op. & Log / Admin) */}
          {(isManager || isAdmin) && (
            <div className="space-y-2">
              {!serverStatus.all_validated && (
                <div className="bg-amber-500/10 border border-amber-500/40 rounded p-2 text-amber-200 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  La fermeture sera bloquée tant que tous les agents n'auront pas validé leur point.
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={() => closeDayHandler(false)}
                  disabled={busy || !serverStatus.all_validated}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="close-day-btn"
                  title={!serverStatus.all_validated ? "Tous les agents doivent avoir fait leur point" : ""}
                >
                  <Lock className="w-4 h-4 mr-1" /> Fermer la journée
                </Button>
                {isAdmin && !serverStatus.all_validated && (
                  <Button
                    onClick={() => {
                      if (window.confirm("Forcer la fermeture sans attendre tous les agents ?")) {
                        closeDayHandler(true);
                      }
                    }}
                    disabled={busy}
                    variant="outline"
                    className="border-red-500/50 text-red-300 hover:bg-red-500/10"
                    data-testid="force-close-day-btn"
                  >
                    Forcer (admin)
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Aide */}
          <div className="bg-slate-900/40 rounded p-2 text-slate-400 text-xs flex items-start gap-2">
            <ChevronRight className="w-3.5 h-3.5 shrink-0 mt-0.5 text-cyan-400" />
            Une fois la journée fermée : plus de modifications possibles. Seul l'Administrateur peut rouvrir une journée fermée.
          </div>
        </CardContent>
      </Card>

      {/* Dialog mot de passe (remplace window.prompt — UX cohérente avec le reste de l'app) */}
      <Dialog
        open={pwDialog.open}
        onOpenChange={(o) => !o && setPwDialog({ open: false, value: "", force: false })}
      >
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              Mot de passe Journée requis
            </DialogTitle>
            <p className="text-xs text-slate-400 mt-1">
              Pour fermer la journée du <strong className="text-slate-200">{format(new Date(date), "d MMMM yyyy", { locale: fr })}</strong>, saisis le mot de passe de fermeture défini par l'Administrateur.
            </p>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="day-pw-input" className="text-slate-300 text-sm">Mot de passe</Label>
            <Input
              id="day-pw-input"
              type="password"
              autoFocus
              value={pwDialog.value}
              onChange={(e) => setPwDialog((s) => ({ ...s, value: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && submitPasswordDialog()}
              className="bg-slate-800 border-slate-700 text-white"
              placeholder="••••••••"
              data-testid="day-closure-pw-input"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setPwDialog({ open: false, value: "", force: false })}
              disabled={busy}
              className="text-slate-300"
            >
              Annuler
            </Button>
            <Button
              onClick={submitPasswordDialog}
              disabled={busy || !pwDialog.value}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="day-closure-pw-submit"
            >
              {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Lock className="w-4 h-4 mr-1" />}
              Confirmer la fermeture
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
