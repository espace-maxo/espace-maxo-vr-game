/**
 * BonsTab - Bons de commande & factures en attente
 * Deux sous-onglets : Factures (bons en attente) et MANAGER GENERAL.
 * Tous les handlers et états sont gérés par CaissePage.jsx et passés en props.
 */
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Printer, UserCircle, AlertTriangle, Edit2, CheckCircle, Eye,
  Trash2, Wine, Gamepad2, FileText, CreditCard
} from 'lucide-react';
import SalaryCreditsBanner from './SalaryCreditsBanner';
import DGGroupedTab from './DGGroupedTab';
import CreditOrdersGroupedTab from './CreditOrdersGroupedTab';

const formatPrice = (p) => new Intl.NumberFormat('fr-FR').format(p || 0);

const BonsTab = ({
  currentUser,
  invoices = [],
  products = [],
  cancellationRequests = [],
  modificationRequests = [],
  filterDate,
  setFilterDate,
  // handlers
  approveCancellationRequest,
  rejectCancellationRequest,
  approveModificationRequest,
  rejectModificationRequest,
  printKitchenOrder,
  printBarOrder,
  printGamesOrder,
  setViewInvoice,
  startEditingInvoice,
  requestModification,
  requestCancellation,
  validateInvoice,
  deleteInvoice,
}) => {
  const isAdmin = currentUser?.role === 'admin';
  const isManager = currentUser?.role === 'manager';
  const isServer = currentUser?.role === 'server';
  const canManage = isAdmin || isManager;
  const serverName = currentUser?.full_name || currentUser?.username;

  const pendingInvoices = invoices.filter(i =>
    i.validation_status === 'pending' &&
    (!isServer || i.created_by === serverName)
  );

  return (
    <Tabs defaultValue="bons-factures" className="w-full" data-testid="bons-tab">
      {/* Admin-only banner: aperçu des crédits salaires du mois */}
      {isAdmin && <SalaryCreditsBanner formatPrice={formatPrice} />}
      <TabsList className="bg-slate-800/50 border-b border-slate-700 w-full justify-start mb-4">
        <TabsTrigger value="bons-factures" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">
          <Printer className="w-4 h-4 mr-2" />
          Factures
          {invoices.filter(i => i.validation_status === 'pending').length > 0 && (
            <Badge className="ml-1 bg-orange-600 text-white text-xs">
              {invoices.filter(i => i.validation_status === 'pending').length}
            </Badge>
          )}
        </TabsTrigger>
        {canManage && (
          <TabsTrigger value="bons-monsieur" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white" data-testid="tab-bons-dg">
            <UserCircle className="w-4 h-4 mr-2" />
            MME LA D.G.
          </TabsTrigger>
        )}
        {canManage && (
          <TabsTrigger value="bons-credit" className="data-[state=active]:bg-pink-500 data-[state=active]:text-white" data-testid="tab-bons-credit">
            <CreditCard className="w-4 h-4 mr-2" />
            BONS À CRÉDIT
          </TabsTrigger>
        )}
      </TabsList>

      {/* Factures sub-tab */}
      <TabsContent value="bons-factures">
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-xl font-bold text-orange-400 flex items-center gap-2">
              <Printer className="w-6 h-6" />
              Factures
              <Badge className="bg-orange-500/20 text-orange-300 text-lg px-3">
                {invoices.filter(i => i.validation_status === 'pending').length}
              </Badge>
            </h2>
            <Input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="bg-slate-800/50 border-slate-700 text-white w-auto"
              data-testid="bons-filter-date"
            />
          </div>

          {/* Cancellation requests (admin) */}
          {isAdmin && cancellationRequests.length > 0 && (
            <Card className="bg-gradient-to-br from-red-900/30 to-orange-900/20 border-red-500/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-red-400 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  DEMANDES D'ANNULATION
                  <Badge className="bg-red-500/30 text-red-300 ml-2">{cancellationRequests.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {cancellationRequests.map(req => (
                  <div key={req.id} className="flex items-center justify-between gap-2 bg-red-900/20 rounded-lg p-3 border border-red-500/30">
                    <div className="flex-1">
                      <p className="text-white font-medium">{req.invoice_number}</p>
                      <p className="text-slate-400 text-sm">Demandé par: {req.requested_by} • Motif: {req.reason}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => approveCancellationRequest(req.id)} className="bg-red-600 hover:bg-red-700">
                        <CheckCircle className="w-4 h-4 mr-1" />Annuler Facture
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => rejectCancellationRequest(req.id)} className="border-slate-600 text-slate-400">
                        Refuser
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Modification requests (admin/manager) */}
          {canManage && modificationRequests.length > 0 && (
            <Card className="bg-gradient-to-br from-blue-900/30 to-indigo-900/20 border-blue-500/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-blue-400 flex items-center gap-2">
                  <Edit2 className="w-5 h-5" />
                  DEMANDES DE MODIFICATION
                  <Badge className="bg-blue-500/30 text-blue-300 ml-2">{modificationRequests.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {modificationRequests.map(req => (
                  <div key={req.id} className="flex items-center justify-between gap-2 bg-blue-900/20 rounded-lg p-3 border border-blue-500/30">
                    <div className="flex-1">
                      <p className="text-white font-medium">{req.invoice_number}</p>
                      <p className="text-slate-400 text-sm">Demandé par: {req.requested_by} • Motif: {req.reason}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => approveModificationRequest(req.id)} className="bg-blue-600 hover:bg-blue-700">
                        <CheckCircle className="w-4 h-4 mr-1" />Autoriser
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => rejectModificationRequest(req.id)} className="border-slate-600 text-slate-400">
                        Refuser
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Workflow tip */}
          {canManage && (
            <div className="mb-4 p-3 bg-orange-900/20 border border-orange-500/30 rounded-lg">
              <p className="text-orange-300 text-sm flex items-center gap-2">
                <Printer className="w-4 h-4" />
                <span><strong>Workflow:</strong> 1. Imprimer les bons (Cuisine/Bar/Jeux) → 2. Cliquer sur "Bon-Client" pour transformer le bon en facture définitive</span>
              </p>
            </div>
          )}

          {/* Pending invoices list */}
          {pendingInvoices.length === 0 ? (
            <Card className="bg-slate-800/30 border-slate-700">
              <CardContent className="py-12 text-center">
                <Printer className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-500">Aucun facture en attente</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {pendingInvoices.map(invoice => (
                <Card key={invoice.id} className="bg-gradient-to-br from-orange-900/20 to-amber-800/10 border-orange-500/30">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex-1 cursor-pointer min-w-0" onClick={() => setViewInvoice(invoice)}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-bold text-lg">{invoice.invoice_number}</span>
                          {invoice.table_number && (
                            <Badge className="bg-amber-500/30 text-amber-300">Table {invoice.table_number}</Badge>
                          )}
                          {invoice.modification_allowed && (
                            <Badge className="bg-green-500/20 text-green-400 text-xs">✓ Modif. autorisée</Badge>
                          )}
                        </div>
                        <p className="text-slate-400 text-sm">
                          {invoice.customer_name} • <span className="text-amber-400 font-bold">{formatPrice(invoice.total)} F</span>
                        </p>
                        <p className="text-slate-500 text-xs">
                          Par: {invoice.created_by} • {new Date(invoice.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {invoice.items?.slice(0, 4).map((item, idx) => (
                            <span key={idx} className="text-xs bg-slate-700/50 text-slate-300 px-2 py-0.5 rounded">
                              {item.quantity}x {item.name}
                            </span>
                          ))}
                          {invoice.items?.length > 4 && (
                            <span className="text-xs text-slate-500">+{invoice.items.length - 4} autres</span>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-1 shrink-0 flex-wrap">
                        {canManage && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => printKitchenOrder(invoice)} className="border-green-500/50 text-green-400 hover:bg-green-500/20" title="Cuisine">
                              <Printer className="w-4 h-4 mr-1" />
                              <span className="hidden sm:inline">Cuisine</span>
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => printBarOrder(invoice)} className="border-orange-500/50 text-orange-400 hover:bg-orange-500/20" title="Bar">
                              <Wine className="w-4 h-4 mr-1" />
                              <span className="hidden sm:inline">Bar</span>
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => printGamesOrder(invoice)} className="border-blue-500/50 text-blue-400 hover:bg-blue-500/20" title="Jeux">
                              <Gamepad2 className="w-4 h-4 mr-1" />
                              <span className="hidden sm:inline">Jeux</span>
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setViewInvoice(invoice)} className="text-slate-400 hover:text-white">
                          <Eye className="w-4 h-4" />
                        </Button>
                        {isServer && invoice.created_by === serverName && (
                          invoice.modification_allowed ? (
                            <Button size="sm" onClick={() => startEditingInvoice(invoice)} className="bg-blue-600 hover:bg-blue-700 text-white">
                              <Edit2 className="w-4 h-4 mr-1" />
                              Modifier
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => requestModification(invoice)}
                              className="border-blue-500/50 text-blue-400 hover:bg-blue-500/20"
                              disabled={modificationRequests.some(r => r.invoice_id === invoice.id)}
                            >
                              {modificationRequests.some(r => r.invoice_id === invoice.id) ? (
                                <span className="text-xs">Envoyé</span>
                              ) : (
                                <span className="text-xs">Demander modif.</span>
                              )}
                            </Button>
                          )
                        )}
                        {canManage && (
                          <>
                            <Button size="sm" onClick={() => validateInvoice(invoice.id)} className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white">
                              <FileText className="w-4 h-4 mr-1" />
                              Bon-Client
                            </Button>
                            {/* Suppression directe : Admin only (24/05/2026)
                                La Gérante doit demander l'autorisation via "Demander annulation". */}
                            {isAdmin ? (
                              <Button size="sm" variant="ghost" onClick={() => deleteInvoice(invoice.id)} className="text-red-400 hover:text-red-300" title="Supprimer">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => requestCancellation(invoice)}
                                className="border-red-500/50 text-red-400 hover:bg-red-500/20"
                                disabled={cancellationRequests.some(r => r.invoice_id === invoice.id)}
                                data-testid={`bon-request-delete-${invoice.id}`}
                                title="Demander la suppression à l'administrateur"
                              >
                                <Trash2 className="w-4 h-4 mr-1" />
                                <span className="text-xs">
                                  {cancellationRequests.some(r => r.invoice_id === invoice.id) ? "Demande envoyée" : "Demander suppression"}
                                </span>
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </TabsContent>

      {/* Mme la D.G. (groupé : Actives + Archivées) */}
      {canManage && (
        <TabsContent value="bons-monsieur">
          <DGGroupedTab
            currentUser={currentUser}
            formatPrice={formatPrice}
            products={products}
          />
        </TabsContent>
      )}

      {/* Bons à crédit (groupé : Employés + Gérante) */}
      {canManage && (
        <TabsContent value="bons-credit">
          <CreditOrdersGroupedTab
            currentUser={currentUser}
            formatPrice={formatPrice}
            products={products}
          />
        </TabsContent>
      )}
    </Tabs>
  );
};

export default BonsTab;
