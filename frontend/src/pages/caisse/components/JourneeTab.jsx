/**
 * JourneeTab - Module Ouverture / Fermeture de la journée.
 *
 * Trois sous-onglets :
 *  - Ouverture : statut du jour, fonds de caisse optionnel, garde-fou
 *    « jour précédent fermé », bouton OUVRIR (Gérante + Admin).
 *  - Fermeture : reprend le composant existant `DayClosureGuard` qui gère
 *    les points serveurs, le billettage, la réconciliation.
 *  - Historique : journées passées (date / ouverture / fermeture / écart).
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sunrise, Lock, History, AlertTriangle, CheckCircle2, UnlockKeyhole, Banknote, Calendar as CalendarIcon, RefreshCw, ShieldAlert, KeyRound, Settings as SettingsIcon, Eye, EyeOff } from 'lucide-react';
import DayClosureGuard from './DayClosureGuard';

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND}/api`;
const fmt = (n) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));

const JourneeTab = ({ currentUser }) => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const isAdmin = currentUser?.role === 'admin';
  const isManager = currentUser?.role === 'manager';
  const canOpen = isAdmin || isManager;

  const [activeSubTab, setActiveSubTab] = useState('ouverture');
  const [opening, setOpening] = useState(null);
  const [openingStatus, setOpeningStatus] = useState('not_opened');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  // Form ouverture
  const [initialCash, setInitialCash] = useState('');
  const [notes, setNotes] = useState('');

  // Mot de passe Journée
  const [pwStatus, setPwStatus] = useState({ is_set: false });
  const [pwModalOpen, setPwModalOpen] = useState(false);  // modal "saisir mot de passe"
  const [pwModalContext, setPwModalContext] = useState(null);  // 'open' | 'close'
  const [pwInput, setPwInput] = useState('');
  const [pwShow, setPwShow] = useState(false);
  // Form admin (paramètres)
  const [adminNewPw, setAdminNewPw] = useState('');
  const [adminConfirmPw, setAdminConfirmPw] = useState('');
  const [adminPwShow, setAdminPwShow] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [opRes, histRes, pwRes] = await Promise.all([
        axios.get(`${API}/day-openings/${today}`),
        axios.get(`${API}/day-openings/history/list`, { params: { limit: 30 } }),
        axios.get(`${API}/journee-settings/password-status`),
      ]);
      setOpening(opRes.data?.opening || null);
      setOpeningStatus(opRes.data?.status || 'not_opened');
      setHistory(histRes.data?.history || []);
      setPwStatus(pwRes.data || { is_set: false });
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  }, [today]);

  useEffect(() => { refresh(); }, [refresh]);

  // ------------------ MOT DE PASSE — ADMIN (Paramètres) ------------------
  const handleSavePassword = async () => {
    if (!isAdmin) return;
    if (!adminNewPw || adminNewPw.length < 4) {
      toast.error("Le mot de passe doit comporter au moins 4 caractères");
      return;
    }
    if (adminNewPw !== adminConfirmPw) {
      toast.error("Les deux mots de passe ne correspondent pas");
      return;
    }
    setSavingPw(true);
    try {
      const r = await axios.post(`${API}/journee-settings/set-password`, {
        new_password: adminNewPw,
        actor_name: currentUser?.full_name || currentUser?.username || 'admin',
      });
      toast.success(r.data?.created ? "Mot de passe Journée créé ✅" : "Mot de passe Journée mis à jour ✅");
      setAdminNewPw('');
      setAdminConfirmPw('');
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de l'enregistrement");
    } finally { setSavingPw(false); }
  };

  const handleDeletePassword = async () => {
    if (!isAdmin) return;
    if (!window.confirm("Supprimer le mot de passe Journée ? La Gérante ne pourra plus ouvrir/fermer tant qu'un nouveau ne sera pas créé.")) return;
    try {
      await axios.delete(`${API}/journee-settings/password`);
      toast.success("Mot de passe supprimé");
      refresh();
    } catch (e) {
      toast.error("Erreur");
    }
  };

  // ------------------ OUVERTURE ------------------
  // Pour la Gérante : on ouvre la modale de saisie du mot de passe d'abord.
  const requestOpen = () => {
    if (!canOpen) { toast.error("Réservé à la Gérante ou à l'Admin"); return; }
    if (isAdmin) return handleOpen(false, null); // Admin bypasses pw
    // Non-admin : modale pw
    if (!pwStatus?.is_set) {
      toast.error("Aucun mot de passe Journée n'a été créé. Demandez à l'Administrateur.");
      return;
    }
    setPwModalContext('open');
    setPwInput('');
    setPwShow(false);
    setPwModalOpen(true);
  };

  const handleOpen = async (force = false, password = null) => {
    if (!canOpen) { toast.error("Réservé à la Gérante ou à l'Admin"); return; }
    try {
      const payload = {
        opened_by: currentUser?.full_name || currentUser?.username || 'Gérante',
        opened_by_role: currentUser?.role || '',
        initial_cash: Number(initialCash || 0),
        notes,
        force,
      };
      if (password) payload.password = password;
      const r = await axios.post(`${API}/day-openings/${today}/open`, payload);
      if (r.data?.success) {
        toast.success("Journée ouverte avec succès ✅");
        setInitialCash('');
        setNotes('');
        setPwModalOpen(false);
        setPwInput('');
        refresh();
      }
    } catch (e) {
      const detail = e.response?.data?.detail || 'Erreur lors de l\'ouverture';
      if (detail.includes("précédente") || detail.includes("activité")) {
        // Garde-fou — propose force si admin
        if (isAdmin && window.confirm(`${detail}\n\nForcer l'ouverture quand même ? (Admin)`)) {
          return handleOpen(true, password);
        }
      }
      toast.error(detail);
    }
  };

  const submitPwModal = () => {
    if (!pwInput) { toast.error("Saisissez votre mot de passe"); return; }
    if (pwModalContext === 'open') {
      handleOpen(false, pwInput);
    }
    // (la fermeture est gérée par DayClosureGuard via sa propre modale UI)
  };

  const isOpen = openingStatus === 'open';
  const isClosed = openingStatus === 'closed';

  return (
    <div className="space-y-4" data-testid="journee-tab">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="bg-slate-800/50 border border-slate-700">
          <TabsTrigger value="ouverture" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white" data-testid="journee-tab-ouverture">
            <Sunrise className="w-4 h-4 mr-2" /> Ouverture
            {isOpen && <Badge className="ml-2 bg-emerald-500/30 text-emerald-300 text-[10px]">Ouverte</Badge>}
            {openingStatus === 'not_opened' && <Badge className="ml-2 bg-rose-500/30 text-rose-300 text-[10px]">À ouvrir</Badge>}
          </TabsTrigger>
          <TabsTrigger value="fermeture" className="data-[state=active]:bg-rose-600 data-[state=active]:text-white" data-testid="journee-tab-fermeture">
            <Lock className="w-4 h-4 mr-2" /> Fermeture
          </TabsTrigger>
          <TabsTrigger value="historique" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white" data-testid="journee-tab-historique">
            <History className="w-4 h-4 mr-2" /> Historique
            <Badge className="ml-2 bg-cyan-500/20 text-cyan-300 text-[10px]">{history.length}</Badge>
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="parametres" className="data-[state=active]:bg-slate-600 data-[state=active]:text-white" data-testid="journee-tab-parametres">
              <SettingsIcon className="w-4 h-4 mr-2" /> Paramètres
              {!pwStatus?.is_set && <Badge className="ml-2 bg-rose-500/30 text-rose-300 text-[10px]">À config.</Badge>}
            </TabsTrigger>
          )}
        </TabsList>

        {/* ============== OUVERTURE ============== */}
        <TabsContent value="ouverture">
          <Card className={`border-2 ${isOpen ? 'bg-emerald-900/20 border-emerald-500/40' : 'bg-amber-900/20 border-amber-500/40'}`}>
            <CardHeader>
              <CardTitle className="text-white flex items-center justify-between flex-wrap gap-2">
                <span className="flex items-center gap-2">
                  <Sunrise className={`w-6 h-6 ${isOpen ? 'text-emerald-400' : 'text-amber-400'}`} />
                  Ouverture de la journée — {format(new Date(today), "EEEE d MMMM yyyy", { locale: fr })}
                </span>
                <Button size="sm" variant="outline" onClick={refresh} disabled={loading} className="border-slate-700 text-slate-300 h-8" data-testid="journee-refresh-btn">
                  <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Actualiser
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status badge */}
              {isOpen ? (
                <div className="bg-emerald-900/30 border border-emerald-500/40 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-emerald-300 font-semibold">Journée ouverte</p>
                      <p className="text-slate-300 text-sm mt-1">
                        Par <strong>{opening?.opened_by}</strong> ({opening?.opened_by_role || '—'})
                        {opening?.opened_at && (
                          <> · le {format(new Date(opening.opened_at), "dd/MM HH:mm", { locale: fr })}</>
                        )}
                      </p>
                      {opening?.initial_cash > 0 && (
                        <p className="text-slate-300 text-sm mt-1">
                          <Banknote className="w-4 h-4 inline mr-1 text-amber-300" />
                          Fonds initial : <strong className="text-amber-300">{fmt(opening.initial_cash)} F</strong>
                        </p>
                      )}
                      {opening?.notes && (
                        <p className="text-slate-400 text-xs mt-2 italic">« {opening.notes} »</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : isClosed ? (
                <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <Lock className="w-6 h-6 text-slate-400" />
                    <div>
                      <p className="text-white font-semibold">Journée déjà clôturée</p>
                      <p className="text-slate-400 text-sm">Cette journée a été ouverte puis fermée. Voir l'onglet Historique.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="bg-rose-900/20 border border-rose-500/40 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle className="w-6 h-6 text-rose-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-rose-300 font-semibold">Journée non ouverte</p>
                      <p className="text-slate-300 text-sm mt-1">
                        Aucune vente ne pourra être enregistrée tant que vous n'aurez pas cliqué sur le bouton ci-dessous.
                      </p>
                    </div>
                  </div>

                  {/* Formulaire */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-300 text-sm mb-1 flex items-center gap-1">
                        <Banknote className="w-4 h-4 text-amber-300" />
                        Fonds de caisse initial (optionnel)
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={initialCash}
                        onChange={(e) => setInitialCash(e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white"
                        data-testid="journee-initial-cash"
                      />
                      <p className="text-slate-500 text-xs mt-1">Montant en F CFA présent dans la caisse à l'ouverture.</p>
                    </div>
                    <div>
                      <Label className="text-slate-300 text-sm mb-1">Notes du jour (optionnel)</Label>
                      <Textarea
                        rows={3}
                        placeholder="Évènements particuliers, météo, conditions..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white"
                        data-testid="journee-notes"
                      />
                    </div>
                  </div>

                  {!canOpen ? (
                    <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-3 flex items-center gap-2">
                      <ShieldAlert className="w-5 h-5 text-amber-400" />
                      <p className="text-slate-400 text-sm">
                        Seul·e la <strong>Gérante</strong> ou un·e <strong>Administrateur·rice</strong> peut ouvrir la journée.
                      </p>
                    </div>
                  ) : (
                    <Button
                      onClick={requestOpen}
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold py-6 text-lg"
                      data-testid="journee-open-btn"
                    >
                      <UnlockKeyhole className="w-5 h-5 mr-2" /> OUVRIR LA JOURNÉE
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============== FERMETURE ============== */}
        <TabsContent value="fermeture">
          <DayClosureGuard currentUser={currentUser}>
            <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-4 mt-3">
              <p className="text-emerald-300 text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Journée fermée. Vous pouvez consulter le « Faire le point » via le menu principal.
              </p>
            </div>
          </DayClosureGuard>
        </TabsContent>

        {/* ============== HISTORIQUE ============== */}
        <TabsContent value="historique">
          <Card className="bg-slate-900/60 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-white flex items-center gap-2 text-base">
                <History className="w-5 h-5 text-cyan-400" />
                Historique des journées
                <Badge className="bg-cyan-500/20 text-cyan-300 text-[10px]">{history.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-slate-500 text-center py-8 text-sm">Aucune journée dans l'historique</p>
              ) : (
                <div className="space-y-1.5">
                  {history.map((h) => {
                    const isHOpen = h.status === 'open';
                    return (
                      <div key={h.id} className="grid grid-cols-12 gap-2 items-center bg-slate-800/40 border border-slate-700 rounded px-3 py-2 text-sm" data-testid={`journee-history-${h.date}`}>
                        <span className="col-span-2 text-white font-semibold flex items-center gap-1">
                          <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
                          {h.date}
                        </span>
                        <span className="col-span-3 text-slate-300 truncate">Ouvert·e par <strong>{h.opened_by}</strong></span>
                        <span className="col-span-2 text-slate-400 text-xs">
                          {h.opened_at ? format(new Date(h.opened_at), "HH:mm", { locale: fr }) : '—'}
                        </span>
                        <span className="col-span-2 text-amber-300 text-xs">
                          {h.initial_cash > 0 ? `${fmt(h.initial_cash)} F` : '—'}
                        </span>
                        <span className="col-span-3 text-right">
                          {isHOpen ? (
                            <Badge className="bg-emerald-500/20 text-emerald-300 text-[10px]">Ouverte</Badge>
                          ) : (
                            <Badge className="bg-slate-600/40 text-slate-300 text-[10px]">Fermée</Badge>
                          )}
                          {h.closure && (
                            <Badge className="ml-1 bg-cyan-500/20 text-cyan-300 text-[10px]">Pt. fait</Badge>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============== PARAMÈTRES (Admin only) ============== */}
        {isAdmin && (
        <TabsContent value="parametres">
          <Card className="bg-slate-900/60 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-white flex items-center gap-2 text-base">
                <KeyRound className="w-5 h-5 text-amber-400" />
                Mot de passe « Journée »
                {pwStatus?.is_set ? (
                  <Badge className="bg-emerald-500/20 text-emerald-300 text-[10px]">Configuré</Badge>
                ) : (
                  <Badge className="bg-rose-500/30 text-rose-300 text-[10px]">Non configuré</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 text-sm text-slate-300">
                <p>Ce mot de passe est demandé à la <strong className="text-white">Gérante</strong> chaque fois qu'elle ouvre ou ferme la journée. L'<strong className="text-white">Administrateur</strong> n'a pas à le saisir.</p>
                <p className="text-slate-400 text-xs mt-2">Si le mot de passe est supprimé, la Gérante sera <strong className="text-rose-300">bloquée</strong> jusqu'à ce qu'un nouveau soit créé.</p>
              </div>

              {pwStatus?.is_set && (
                <div className="text-xs text-slate-500">
                  Créé par <strong className="text-slate-300">{pwStatus.set_by || '—'}</strong>
                  {pwStatus.last_updated_at && (
                    <> · Dernière modif : <strong className="text-slate-300">{format(new Date(pwStatus.last_updated_at), "dd/MM/yyyy HH:mm", { locale: fr })}</strong> par <strong className="text-slate-300">{pwStatus.last_updated_by || '—'}</strong></>
                  )}
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-slate-300 text-sm">Nouveau mot de passe</Label>
                  <div className="relative">
                    <Input
                      type={adminPwShow ? "text" : "password"}
                      placeholder="Min. 4 caractères"
                      value={adminNewPw}
                      onChange={(e) => setAdminNewPw(e.target.value)}
                      className="bg-slate-900 border-slate-700 text-white pr-10"
                      data-testid="journee-admin-new-pw"
                    />
                    <button
                      type="button"
                      onClick={() => setAdminPwShow((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      tabIndex={-1}
                    >
                      {adminPwShow ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label className="text-slate-300 text-sm">Confirmer</Label>
                  <Input
                    type={adminPwShow ? "text" : "password"}
                    placeholder="Confirmer le mot de passe"
                    value={adminConfirmPw}
                    onChange={(e) => setAdminConfirmPw(e.target.value)}
                    className="bg-slate-900 border-slate-700 text-white"
                    data-testid="journee-admin-confirm-pw"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 justify-end">
                {pwStatus?.is_set && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDeletePassword}
                    className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
                    data-testid="journee-admin-delete-pw"
                  >
                    Supprimer le mot de passe
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={handleSavePassword}
                  disabled={savingPw || !adminNewPw || adminNewPw !== adminConfirmPw}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  data-testid="journee-admin-save-pw"
                >
                  <KeyRound className="w-4 h-4 mr-1" />
                  {pwStatus?.is_set ? "Mettre à jour" : "Créer le mot de passe"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        )}
      </Tabs>

      {/* ============== MODAL : SAISIE MOT DE PASSE (Gérante) ============== */}
      {pwModalOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setPwModalOpen(false)}>
          <Card className="bg-slate-900 border-amber-500/40 w-full max-w-md" onClick={(e) => e.stopPropagation()} data-testid="journee-pw-modal">
            <CardHeader className="pb-2 border-b border-slate-700">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-400" />
                Mot de passe Journée requis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              <p className="text-slate-300 text-sm">
                {pwModalContext === 'open'
                  ? "Saisissez le mot de passe Journée pour ouvrir."
                  : "Saisissez le mot de passe Journée pour fermer."}
              </p>
              <div className="relative">
                <Input
                  type={pwShow ? "text" : "password"}
                  autoFocus
                  value={pwInput}
                  onChange={(e) => setPwInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitPwModal(); }}
                  placeholder="••••••••"
                  className="bg-slate-800 border-slate-700 text-white pr-10"
                  data-testid="journee-pw-input"
                />
                <button
                  type="button"
                  onClick={() => setPwShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  tabIndex={-1}
                >
                  {pwShow ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPwModalOpen(false)}
                  className="border-slate-700 text-slate-300"
                  data-testid="journee-pw-cancel"
                >
                  Annuler
                </Button>
                <Button
                  type="button"
                  onClick={submitPwModal}
                  className="bg-amber-600 hover:bg-amber-700"
                  data-testid="journee-pw-submit"
                >
                  Valider
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default JourneeTab;
