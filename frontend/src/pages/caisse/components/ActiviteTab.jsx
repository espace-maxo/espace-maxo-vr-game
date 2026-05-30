/**
 * ActiviteTab - Activité & Historique du jour
 * Affiche les statistiques en temps réel des factures/dépenses du jour +
 * un historique des factures par date.
 */
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Activity, Users, ShoppingCart, Calendar, CheckCircle
} from 'lucide-react';

const formatPrice = (price) => new Intl.NumberFormat('fr-FR').format(price || 0);

const ActiviteTab = ({ invoices = [], expenses = [], historyInvoices = [], historyDate, setHistoryDate }) => {
  const todayInvs = invoices.filter(i => i.validation_status === 'validated');
  const todayPending = invoices.filter(i => i.validation_status === 'pending');
  const totalRecettes = todayInvs.reduce((s, i) => s + (i.total || 0), 0);
  const totalPending = todayPending.reduce((s, i) => s + (i.total || 0), 0);
  const completedExp = expenses.filter(e => e.status === 'completed');
  const pendingExp = expenses.filter(e => e.status === 'pending' || e.status === 'revision_requested');
  const totalDepenses = completedExp.reduce((s, e) => s + (e.amount || 0), 0);
  const totalPendingExp = pendingExp.reduce((s, e) => s + (e.amount || 0), 0);
  const resultat = totalRecettes - totalDepenses;

  const byServer = {};
  todayInvs.forEach(inv => {
    const srv = inv.created_by || 'Inconnu';
    if (!byServer[srv]) byServer[srv] = { count: 0, total: 0, validated: 0, pending: 0 };
    byServer[srv].count++;
    byServer[srv].total += inv.total || 0;
    byServer[srv].validated++;
  });
  todayPending.forEach(inv => {
    const srv = inv.created_by || 'Inconnu';
    if (!byServer[srv]) byServer[srv] = { count: 0, total: 0, validated: 0, pending: 0 };
    byServer[srv].count++;
    byServer[srv].total += inv.total || 0;
    byServer[srv].pending++;
  });

  const byDept = {};
  todayInvs.forEach(inv => {
    const depts = inv.totals_by_department || {};
    Object.entries(depts).forEach(([d, v]) => { byDept[d] = (byDept[d] || 0) + v; });
  });

  const byPayment = {};
  todayInvs.forEach(inv => {
    const pm = inv.payment_mode || inv.payment_method || 'autre';
    byPayment[pm] = (byPayment[pm] || 0) + (inv.total || 0);
  });

  return (
    <div className="space-y-4" data-testid="activite-tab">
      <h2 className="text-xl font-bold text-emerald-300 flex items-center gap-2">
        <Activity className="w-6 h-6" />
        Activite & Historique du jour
      </h2>

      {/* Summary cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <Card className="bg-gradient-to-br from-green-900/30 to-emerald-900/20 border-green-500/50">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-400">CA VALIDE</p>
            <p className="text-2xl font-bold text-green-400">{formatPrice(totalRecettes)} F</p>
            <p className="text-slate-500 text-xs">{todayInvs.length} facture(s)</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-900/30 to-orange-900/20 border-red-500/50">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-400">DEPENSES</p>
            <p className="text-2xl font-bold text-red-400">{formatPrice(totalDepenses)} F</p>
            <p className="text-slate-500 text-xs">{completedExp.length} achat(s)</p>
          </CardContent>
        </Card>
        <Card className={`bg-gradient-to-br ${resultat >= 0 ? 'from-emerald-900/30 to-green-900/20 border-emerald-500/50' : 'from-red-900/30 to-rose-900/20 border-red-500/50'}`}>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-400">RESULTAT</p>
            <p className={`text-2xl font-bold ${resultat >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{resultat >= 0 ? '+' : ''}{formatPrice(resultat)} F</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-900/20 to-orange-900/10 border-amber-500/40">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-400">EN ATTENTE</p>
            <p className="text-2xl font-bold text-amber-400">{formatPrice(totalPending + totalPendingExp)} F</p>
            <p className="text-slate-500 text-xs">{todayPending.length} fact. + {pendingExp.length} ach.</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-900/20 to-blue-900/10 border-blue-500/40">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-400">TOTAL FACTURES</p>
            <p className="text-2xl font-bold text-blue-400">{invoices.length}</p>
            <p className="text-slate-500 text-xs">{todayInvs.length} val. / {todayPending.length} att.</p>
          </CardContent>
        </Card>
      </div>

      {/* Detail par agent */}
      {Object.keys(byServer).length > 0 && (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-slate-300 flex items-center gap-2"><Users className="w-5 h-5" /> Performance par Agent</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {Object.entries(byServer).map(([server, data]) => (
              <div key={server} className="bg-slate-700/30 rounded-lg p-3">
                <p className="text-white font-medium">{server}</p>
                <p className="text-green-400 font-bold">{formatPrice(data.total)} F</p>
                <div className="flex gap-2 mt-1">
                  <span className="text-green-400 text-xs">{data.validated} val.</span>
                  {data.pending > 0 && <span className="text-yellow-400 text-xs">{data.pending} att.</span>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      )}

      {/* Detail par departement et paiement */}
      <div className="grid gap-4 md:grid-cols-2">
        {Object.keys(byDept).length > 0 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2"><CardTitle className="text-green-400 text-sm">Par Departement</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(byDept).filter(([,v]) => v > 0).map(([dept, amount]) => (
              <div key={dept} className="flex justify-between bg-slate-700/30 rounded px-3 py-2">
                <span className="text-slate-300 capitalize text-sm">{dept.replace('_', ' ')}</span>
                <span className="text-green-400 font-bold text-sm">{formatPrice(amount)} F</span>
              </div>
            ))}
          </CardContent>
        </Card>
        )}
        {Object.keys(byPayment).length > 0 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2"><CardTitle className="text-blue-400 text-sm">Par Mode de Paiement</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(byPayment).map(([method, amount]) => (
              <div key={method} className="flex justify-between bg-slate-700/30 rounded px-3 py-2">
                <span className="text-slate-300 text-sm">{method}</span>
                <span className="text-blue-400 font-bold text-sm">{formatPrice(amount)} F</span>
              </div>
            ))}
          </CardContent>
        </Card>
        )}
      </div>

      {/* En attente detail */}
      {(todayPending.length > 0 || pendingExp.length > 0) && (
      <div className="grid gap-4 md:grid-cols-2">
        {todayPending.length > 0 && (
        <Card className="bg-amber-900/10 border-amber-500/30">
          <CardHeader className="pb-2"><CardTitle className="text-amber-400 text-sm">Factures en attente ({todayPending.length})</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {todayPending.map(inv => (
              <div key={inv.id} className="flex justify-between items-center bg-amber-900/20 rounded px-3 py-1.5">
                <div><span className="text-white text-sm font-bold">{inv.invoice_number}</span> <span className="text-slate-400 text-xs ml-1">par {inv.created_by}</span></div>
                <span className="text-amber-400 text-sm font-bold">{formatPrice(inv.total)} F</span>
              </div>
            ))}
          </CardContent>
        </Card>
        )}
        {pendingExp.length > 0 && (
        <Card className="bg-yellow-900/10 border-yellow-500/30">
          <CardHeader className="pb-2"><CardTitle className="text-yellow-400 text-sm">Achats en attente ({pendingExp.length})</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {pendingExp.map(exp => (
              <div key={exp.id} className="flex justify-between items-center bg-yellow-900/20 rounded px-3 py-1.5">
                <span className="text-white text-sm">{exp.description?.slice(0, 35)}</span>
                <span className="text-yellow-400 text-sm font-bold">{formatPrice(exp.amount)} F</span>
              </div>
            ))}
          </CardContent>
        </Card>
        )}
      </div>
      )}

      {/* Factures validees du jour */}
      {todayInvs.length > 0 && (
      <Card className="bg-slate-800/50 border-slate-700" data-testid="activity-validated-invoices">
        <CardHeader className="pb-2">
          <CardTitle className="text-green-400 text-sm flex items-center gap-2">
            <CheckCircle className="w-4 h-4" /> Factures validees ({todayInvs.length}) - {formatPrice(totalRecettes)} F
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-800">
                <tr className="text-left text-slate-400 border-b border-slate-700">
                  <th className="p-2">Facture</th>
                  <th className="p-2">Client</th>
                  <th className="p-2">Agent</th>
                  <th className="p-2">Mode</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2">Heure</th>
                </tr>
              </thead>
              <tbody>
                {todayInvs.map(inv => (
                  <tr key={inv.id} className="border-b border-slate-700/30 hover:bg-slate-700/30">
                    <td className="p-2 text-white font-medium">{inv.invoice_number}</td>
                    <td className="p-2 text-slate-300">{inv.client_name || inv.customer_name || "-"}</td>
                    <td className="p-2 text-slate-300">{inv.created_by}</td>
                    <td className="p-2 text-slate-400 text-xs">{inv.payment_mode || inv.payment_method || "-"}</td>
                    <td className="p-2 text-right text-green-400 font-bold">{formatPrice(inv.total)} F</td>
                    <td className="p-2 text-slate-500 text-xs">{(inv.created_at || '').slice(11, 16)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Depenses completees */}
      {completedExp.length > 0 && (
      <Card className="bg-slate-800/50 border-slate-700" data-testid="activity-completed-expenses">
        <CardHeader className="pb-2"><CardTitle className="text-red-400 text-sm flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> Depenses completees ({completedExp.length}) - {formatPrice(totalDepenses)} F</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-800">
                <tr className="text-left text-slate-400 border-b border-slate-700">
                  <th className="p-2">Description</th>
                  <th className="p-2">Fournisseur</th>
                  <th className="p-2">Categorie</th>
                  <th className="p-2 text-right">Montant</th>
                  <th className="p-2">Heure</th>
                </tr>
              </thead>
              <tbody>
                {completedExp.map(exp => (
                  <tr key={exp.id} className="border-b border-slate-700/30 hover:bg-slate-700/30">
                    <td className="p-2 text-white">{exp.description || '-'}</td>
                    <td className="p-2 text-slate-400">{exp.supplier || '-'}</td>
                    <td className="p-2 text-slate-400 text-xs">{exp.category || '-'}</td>
                    <td className="p-2 text-right text-red-400 font-bold">{formatPrice(exp.amount)} F</td>
                    <td className="p-2 text-slate-500 text-xs">{(exp.completed_at || exp.created_at || '').slice(11, 16)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      )}

      {/* ==================== HISTORIQUE DES FACTURES ==================== */}
      <div className="border-t border-slate-700/50 pt-6 mt-6">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
          <h2 className="text-xl font-bold text-slate-300 flex items-center gap-2">
            <Calendar className="w-6 h-6" /> Historique des Factures
          </h2>
          <Input
            type="date"
            value={historyDate}
            onChange={(e) => setHistoryDate(e.target.value)}
            className="bg-slate-800/50 border-slate-700 text-white w-auto"
            data-testid="history-date-picker"
          />
        </div>
        {historyInvoices.length > 0 ? (
          <Card className="bg-slate-800/50 border-slate-700"><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-400 border-b border-slate-700">
                <th className="p-3">Facture</th><th className="p-3">Client</th><th className="p-3">Agent</th>
                <th className="p-3 text-right">Total</th><th className="p-3">Mode</th><th className="p-3">Statut</th><th className="p-3">Heure</th>
              </tr></thead>
              <tbody>
                {historyInvoices.map(inv => (
                  <tr key={inv.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="p-3 text-white font-medium">{inv.invoice_number}</td>
                    <td className="p-3 text-slate-300">{inv.client_name || "-"}</td>
                    <td className="p-3 text-slate-300">{inv.created_by}</td>
                    <td className="p-3 text-right text-amber-400 font-bold">{formatPrice(inv.total)} F</td>
                    <td className="p-3 text-slate-400">{inv.payment_mode || inv.payment_method || "-"}</td>
                    <td className="p-3"><Badge className={inv.validation_status === 'validated' ? 'bg-green-500/20 text-green-400 text-xs' : 'bg-yellow-500/20 text-yellow-400 text-xs'}>{inv.validation_status === 'validated' ? 'Validee' : 'En attente'}</Badge></td>
                    <td className="p-3 text-slate-500 text-xs">{(inv.created_at || '').slice(11, 16)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent></Card>
        ) : (
          <Card className="bg-slate-800/50 border-slate-700"><CardContent className="py-8 text-center text-slate-500">Aucune facture pour cette date</CardContent></Card>
        )}
      </div>
    </div>
  );
};

export default ActiviteTab;
