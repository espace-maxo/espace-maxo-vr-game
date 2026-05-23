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
import { Sunrise, Lock, History, AlertTriangle, CheckCircle2, UnlockKeyhole, Banknote, Calendar as CalendarIcon, RefreshCw, ShieldAlert } from 'lucide-react';
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

  // Form
  const [initialCash, setInitialCash] = useState('');
  const [notes, setNotes] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [opRes, histRes] = await Promise.all([
        axios.get(`${API}/day-openings/${today}`),
        axios.get(`${API}/day-openings/history/list`, { params: { limit: 30 } }),
      ]);
      setOpening(opRes.data?.opening || null);
      setOpeningStatus(opRes.data?.status || 'not_opened');
      setHistory(histRes.data?.history || []);
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  }, [today]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleOpen = async (force = false) => {
    if (!canOpen) { toast.error("Réservé à la Gérante ou à l'Admin"); return; }
    try {
      const payload = {
        opened_by: currentUser?.full_name || currentUser?.username || 'Gérante',
        opened_by_role: currentUser?.role || '',
        initial_cash: Number(initialCash || 0),
        notes,
        force,
      };
      const r = await axios.post(`${API}/day-openings/${today}/open`, payload);
      if (r.data?.success) {
        toast.success("Journée ouverte avec succès ✅");
        setInitialCash('');
        setNotes('');
        refresh();
      }
    } catch (e) {
      const detail = e.response?.data?.detail || 'Erreur lors de l\'ouverture';
      if (detail.includes("précédente") || detail.includes("activité")) {
        // Garde-fou — propose force si admin
        if (isAdmin && window.confirm(`${detail}\n\nForcer l'ouverture quand même ? (Admin)`)) {
          return handleOpen(true);
        }
      }
      toast.error(detail);
    }
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
                      onClick={() => handleOpen(false)}
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
      </Tabs>
    </div>
  );
};

export default JourneeTab;
