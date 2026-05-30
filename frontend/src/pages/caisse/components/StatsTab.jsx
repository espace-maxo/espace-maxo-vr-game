/**
 * StatsTab - Statistiques & Rapport journalier
 * Affiche le CA du mois par département + le rapport journalier signable.
 * Toute la data vient en props depuis CaissePage.jsx.
 */
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Calendar, TrendingUp, TreePine, Gamepad2, Wine, Package,
  BarChart3, FileText, CheckCircle, Clock, Users, Eye, Printer,
  Download, MessageCircle, RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import ProductSalesTab from './ProductSalesTab';

const formatPrice = (p) => new Intl.NumberFormat('fr-FR').format(p || 0);

const StatsTab = ({
  filterMonth,
  setFilterMonth,
  monthlyStats,
  rapportDate,
  setRapportDate,
  rapportData,
  fetchRapportData,
  signature,
  setSignature,
  generateRapportPDF,
  sendRapportWhatsApp,
  viewServerDetail,
}) => {
  const [view, setView] = useState("overview"); // overview | by_product
  return (
  <div className="space-y-4" data-testid="stats-tab">
    {/* Sub-view toggle */}
    <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
      <Button
        variant={view === "overview" ? "default" : "outline"}
        size="sm"
        onClick={() => setView("overview")}
        className={view === "overview" ? "bg-amber-600 hover:bg-amber-700 text-white" : "border-slate-700 text-slate-300 hover:bg-slate-800"}
        data-testid="stats-view-overview"
      >
        <BarChart3 className="w-4 h-4 mr-1" /> Vue mensuelle & rapport
      </Button>
      <Button
        variant={view === "by_product" ? "default" : "outline"}
        size="sm"
        onClick={() => setView("by_product")}
        className={view === "by_product" ? "bg-amber-600 hover:bg-amber-700 text-white" : "border-slate-700 text-slate-300 hover:bg-slate-800"}
        data-testid="stats-view-by-product"
      >
        <Package className="w-4 h-4 mr-1" /> Ventes par produit
      </Button>
    </div>

    {view === "by_product" && <ProductSalesTab />}

    {view === "overview" && (
    <>
    {/* Month selector */}
    <div className="flex items-center gap-2">
      <Calendar className="w-5 h-5 text-slate-400 hidden sm:block" />
      <Input
        type="month"
        value={filterMonth}
        onChange={(e) => setFilterMonth(e.target.value)}
        className="bg-slate-800/50 border-slate-700 text-white w-full sm:w-auto"
        data-testid="stats-month-picker"
      />
    </div>

    {monthlyStats && (
      <>
        <Card className="bg-gradient-to-br from-amber-500/20 to-amber-600/10 border-amber-500/30">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Chiffre d'affaires du mois</p>
                <p className="text-2xl sm:text-3xl font-bold text-amber-500" data-testid="stats-total-revenue">{formatPrice(monthlyStats.total_revenue)} F</p>
                {(monthlyStats.locations_income || 0) > 0 && (
                  <p className="text-xs text-purple-300 mt-1">
                    + Locations & Réservations : <span className="font-bold">{formatPrice(monthlyStats.locations_income)} F</span>
                    {' '}<span className="text-slate-400">= Total Recettes <span className="text-emerald-400 font-bold">{formatPrice(monthlyStats.total_income || (monthlyStats.total_revenue + (monthlyStats.locations_income || 0)))} F</span></span>
                  </p>
                )}
              </div>
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-amber-500/20 rounded-full flex items-center justify-center">
                <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500" />
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-amber-500/20">
              <p className="text-slate-400 text-xs">
                {monthlyStats.validated_invoices} factures validées sur {monthlyStats.total_invoices} total
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3" data-testid="stats-revenue-groups">
          <Card className="bg-gradient-to-br from-orange-500/20 to-orange-600/10 border-orange-500/40">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-1">
                <Wine className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400" />
                <p className="text-slate-400 text-xs">Bar</p>
              </div>
              <p className="text-base sm:text-lg font-bold text-orange-400" data-testid="stats-group-bar">{formatPrice(monthlyStats.by_revenue_group?.bar || monthlyStats.by_department?.bar || 0)} F</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/40">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-1">
                <TreePine className="w-4 h-4 sm:w-5 sm:h-5 text-green-400" />
                <p className="text-slate-400 text-xs">Menu & Combos</p>
              </div>
              <p className="text-base sm:text-lg font-bold text-green-400" data-testid="stats-group-menu">
                {formatPrice(monthlyStats.by_revenue_group?.menu_combos || ((monthlyStats.by_department?.salle_jardin || 0) + (monthlyStats.by_department?.accompagnements || 0)))} F
              </p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/40">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-1">
                <Gamepad2 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
                <p className="text-slate-400 text-xs">Jeux</p>
              </div>
              <p className="text-base sm:text-lg font-bold text-blue-400" data-testid="stats-group-jeux">{formatPrice(monthlyStats.by_revenue_group?.jeux || monthlyStats.by_department?.jeux || 0)} F</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/40">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
                <p className="text-slate-400 text-xs">Locations & Réservations</p>
              </div>
              <p className="text-base sm:text-lg font-bold text-purple-400" data-testid="stats-group-locations">
                {formatPrice(monthlyStats.locations_income || monthlyStats.by_department?.location || 0)} F
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">Salle de fête, Jardin, Salle de jeux</p>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2 px-3 sm:px-6">
            <CardTitle className="text-white text-base sm:text-lg flex items-center gap-2">
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
              Détail par jour
              <span className="text-slate-500 text-[10px] font-normal ml-2">Bar · Menu · Jeux</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            <div className="space-y-1.5 sm:space-y-2 max-h-[420px] sm:max-h-[480px] overflow-y-auto">
              {Object.entries(monthlyStats.daily_stats || {}).sort((a, b) => b[0].localeCompare(a[0])).map(([date, data]) => {
                const g = data.by_revenue_group || {};
                const isToday = date === format(new Date(), "yyyy-MM-dd");
                return (
                <div key={date} className={`rounded-lg p-2.5 sm:p-3 ${isToday ? "bg-emerald-900/30 border border-emerald-500/40 ring-1 ring-emerald-500/30" : "bg-slate-700/30"}`} data-testid={isToday ? "stats-daily-today" : `stats-daily-${date}`}>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className={`font-medium text-sm sm:text-base truncate flex items-center gap-1.5 ${isToday ? "text-emerald-200" : "text-white"}`}>
                        {format(new Date(date), "EEE d MMM", { locale: fr })}
                        {isToday && (
                          <span className="text-[9px] uppercase font-bold bg-emerald-500 text-slate-900 px-1.5 py-0.5 rounded">Aujourd'hui</span>
                        )}
                      </p>
                      <p className="text-slate-400 text-xs">{data.count} bon{data.count > 1 ? 's' : ''}{isToday && data.count === 0 ? " · aucune facture validée pour l'instant" : ""}</p>
                    </div>
                    <p className={`font-bold text-sm sm:text-lg ml-2 whitespace-nowrap ${isToday ? "text-emerald-300" : "text-amber-500"}`}>
                      {formatPrice(data.revenue)} F
                    </p>
                  </div>
                  {(g.bar || g.menu_combos || g.jeux || g.autres) > 0 && (
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                      <span className="text-orange-300"><Wine className="w-3 h-3 inline mr-0.5" />Bar : <strong className="text-orange-400">{formatPrice(g.bar || 0)} F</strong></span>
                      <span className="text-green-300"><TreePine className="w-3 h-3 inline mr-0.5" />Menu : <strong className="text-green-400">{formatPrice(g.menu_combos || 0)} F</strong></span>
                      <span className="text-blue-300"><Gamepad2 className="w-3 h-3 inline mr-0.5" />Jeux : <strong className="text-blue-400">{formatPrice(g.jeux || 0)} F</strong></span>
                      {(g.autres || 0) > 0 && (
                        <span className="text-slate-400">Autres : <strong>{formatPrice(g.autres || 0)} F</strong></span>
                      )}
                    </div>
                  )}
                </div>
              );})}
              {Object.keys(monthlyStats.daily_stats || {}).length === 0 && (
                <p className="text-slate-500 text-center py-8 text-sm">Aucune donnée pour ce mois</p>
              )}
            </div>
          </CardContent>
        </Card>
      </>
    )}

    {!monthlyStats && (
      <div className="text-center py-12">
        <BarChart3 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <p className="text-slate-500">Chargement des statistiques...</p>
      </div>
    )}

    {/* ==================== RAPPORT JOURNALIER ==================== */}
    <div className="border-t border-slate-700/50 pt-6 mt-6" data-testid="stats-rapport-section">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Rapport Journalier</h2>
          <p className="text-slate-400 text-sm">Point de caisse quotidien</p>
        </div>
        <div className="flex items-center gap-4">
          <Input
            type="date"
            value={rapportDate}
            onChange={(e) => setRapportDate(e.target.value)}
            className="bg-slate-800/50 border-slate-700 text-white"
            data-testid="stats-rapport-date"
          />
          <Button onClick={() => fetchRapportData()} variant="outline" className="border-slate-600 text-slate-300" data-testid="stats-rapport-refresh">
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualiser
          </Button>
        </div>
      </div>

      {rapportData ? (
        <div className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/30">
              <CardContent className="p-4 text-center">
                <FileText className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                <p className="text-3xl font-bold text-blue-400">{rapportData.totalInvoices}</p>
                <p className="text-slate-400 text-sm">Factures Total</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/30">
              <CardContent className="p-4 text-center">
                <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-3xl font-bold text-green-400">{rapportData.validatedInvoices}</p>
                <p className="text-slate-400 text-sm">Validees</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border-yellow-500/30">
              <CardContent className="p-4 text-center">
                <Clock className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                <p className="text-3xl font-bold text-yellow-400">{rapportData.pendingInvoices}</p>
                <p className="text-slate-400 text-sm">En attente</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-amber-500/20 to-amber-600/10 border-amber-500/30">
              <CardContent className="p-4 text-center">
                <TrendingUp className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-amber-500">{formatPrice(rapportData.validatedRevenue)} F</p>
                <p className="text-slate-400 text-sm">CA Valide</p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-400" />
                Recapitulatif par Agent
              </CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-2 text-slate-400 text-sm">Agent</th>
                    <th className="text-center py-2 text-slate-400 text-sm">Factures</th>
                    <th className="text-center py-2 text-slate-400 text-sm">Validees</th>
                    <th className="text-center py-2 text-slate-400 text-sm">En attente</th>
                    <th className="text-right py-2 text-slate-400 text-sm">Total</th>
                    <th className="text-center py-2 text-slate-400 text-sm">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(rapportData.byServer).map(([server, data]) => (
                    <tr key={server} className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer" onClick={() => viewServerDetail(server)}>
                      <td className="py-3 text-white font-medium">{server}</td>
                      <td className="py-3 text-center text-slate-300">{data.count}</td>
                      <td className="py-3 text-center text-green-400">{data.validated}</td>
                      <td className="py-3 text-center text-yellow-400">{data.pending}</td>
                      <td className="py-3 text-right text-amber-400 font-bold">{formatPrice(data.total)} F</td>
                      <td className="py-3 text-center">
                        <Button size="sm" variant="ghost" className="text-blue-400" onClick={(e) => { e.stopPropagation(); viewServerDetail(server); }}>
                          <Eye className="w-4 h-4 mr-1" />Detail
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-900/30 to-amber-800/20 border-amber-500/30">
            <CardHeader>
              <CardTitle className="text-amber-400">Generer le Rapport PDF</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Signature numerique (Gerante)</Label>
                <Input
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="Tapez votre nom pour signer..."
                  className="bg-slate-700/50 border-slate-600 text-white font-serif italic text-lg"
                  data-testid="stats-signature-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Button onClick={generateRapportPDF} className="bg-amber-500 hover:bg-amber-600 text-white"><Printer className="w-4 h-4 mr-2" />Imprimer</Button>
                <Button onClick={generateRapportPDF} variant="outline" className="border-amber-500 text-amber-500"><Download className="w-4 h-4 mr-2" />PDF</Button>
              </div>
              <Button onClick={sendRapportWhatsApp} className="w-full bg-green-600 hover:bg-green-700 text-white">
                <MessageCircle className="w-5 h-5 mr-2" />Envoyer par WhatsApp
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="py-8 text-center">
            <p className="text-slate-500">Cliquez "Actualiser" pour charger le rapport</p>
          </CardContent>
        </Card>
      )}
    </div>
    </>
    )}
  </div>
  );
};

export default StatsTab;
