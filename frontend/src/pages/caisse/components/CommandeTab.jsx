/**
 * CommandeTab — Onglet FACTURES/Commande extrait de CaissePage.jsx.
 *
 * Reçoit un prop `ctx` contenant tout le state + handlers requis.
 * Extraction pure — aucune logique n'est modifiée.
 */
import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, Minus, Trash2, Edit2, Printer, Save, Search, X, CheckCircle, AlertCircle,
  MessageCircle, ShoppingCart, Users, Ban, Check, FileText, Utensils, Gift,
  UserCircle, Clock, ChevronLeft, ChevronRight, AlertTriangle, Receipt, Calculator, Send, Eye,
} from "lucide-react";
import { format } from "date-fns";
import ExpenseAnalysisBadges from "./ExpenseAnalysisBadges";

const CommandeTab = ({ ctx }) => {
  const {
    currentUser,
    cancellationRequests,
    modificationRequests,
    activeTable,
    activeTableId,
    activeDepartment, setActiveDepartment,
    currentBill,
    customItem, setCustomItem,
    discount, setDiscount,
    notes, setNotes,
    paymentMethod, setPaymentMethod,
    productSearch, setProductSearch,
    selectedClient, setSelectedClient,
    expenses,
    expenseAnalyses,
    availableTableNumbers,
    catalog,
    openTables,
    clients,
    formatPrice,
    approveCancellationRequest, rejectCancellationRequest,
    approveModificationRequest, rejectModificationRequest,
    printTicket,
    cancelValidatedInvoice,
    requestCancellation,
    selectTable,
    addToBill, addCustomItem, clearBill,
    saveInvoice, updateQuantity, removeItem,
    setShowNewTableModal,
    setShowFreeAccompModal,
    setViewInvoice,
    // Additional props needed for CommandeTab
    invoices,
    total,
    subtotal,
    discountAmount,
    totalByDepartment,
    DEPARTMENT_CONFIG,
    PAYMENT_METHODS,
    closeTable,
    tableCoachPlayers,
    transmitCoachPlayersOnTable,
  } = ctx;
  return (
    <>
            {/* ============== ADMIN VIEW: Priority on validations (sections de validation) ============== */}
            {currentUser?.role === 'admin' && (
              <div className="space-y-4">
                {/* ADMIN ONLY: Cancellation Requests */}
                {currentUser?.role === 'admin' && cancellationRequests.length > 0 && (
                  <Card className="bg-gradient-to-br from-red-900/30 to-orange-900/20 border-red-500/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-red-400 flex items-center gap-2">
                        <MessageCircle className="w-6 h-6" />
                        DEMANDES D'ANNULATION
                        <Badge className="bg-red-500/30 text-red-300 ml-2 text-lg px-3 animate-pulse">
                          {cancellationRequests.length}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {cancellationRequests.map(request => (
                        <div key={request.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-red-900/30 rounded-lg p-3 border border-red-500/30">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white font-bold">{request.invoice_number}</span>
                              <Badge className="bg-orange-500/20 text-orange-400 text-xs">Demande d'annulation</Badge>
                            </div>
                            <p className="text-slate-400 text-sm mt-1">
                              <strong>Demandé par:</strong> {request.requested_by}
                            </p>
                            <p className="text-red-300 text-sm">
                              <strong>Motif:</strong> {request.reason}
                            </p>
                            <p className="text-slate-500 text-xs mt-1">
                              {request.created_at && format(new Date(request.created_at), "dd/MM/yyyy HH:mm")}
                            </p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button 
                              size="sm"
                              onClick={() => approveCancellationRequest(request.id)}
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Approuver
                            </Button>
                            <Button 
                              size="sm"
                              variant="ghost"
                              onClick={() => rejectCancellationRequest(request.id)}
                              className="text-red-400 hover:bg-red-500/20"
                            >
                              <X className="w-4 h-4 mr-1" />
                              Rejeter
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* MANAGER: Modification Requests from Servers */}
                {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && modificationRequests.length > 0 && (
                  <Card className="bg-gradient-to-br from-blue-900/30 to-cyan-900/20 border-blue-500/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-blue-400 flex items-center gap-2">
                        <Edit2 className="w-6 h-6" />
                        DEMANDES DE MODIFICATION
                        <Badge className="bg-blue-500/30 text-blue-300 ml-2 text-lg px-3 animate-pulse">
                          {modificationRequests.length}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {modificationRequests.map(request => (
                        <div key={request.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-blue-900/30 rounded-lg p-3 border border-blue-500/30">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white font-bold">{request.invoice_number}</span>
                              <Badge className="bg-blue-500/20 text-blue-400 text-xs">Demande de modification</Badge>
                            </div>
                            <p className="text-slate-400 text-sm mt-1">
                              <strong>Demandé par:</strong> {request.requested_by}
                            </p>
                            <p className="text-blue-300 text-sm">
                              <strong>Motif:</strong> {request.reason}
                            </p>
                            <p className="text-slate-500 text-xs mt-1">
                              {request.created_at && format(new Date(request.created_at), "dd/MM/yyyy HH:mm")}
                            </p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button 
                              size="sm"
                              onClick={() => approveModificationRequest(request.id)}
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Autoriser
                            </Button>
                            <Button 
                              size="sm"
                              variant="ghost"
                              onClick={() => rejectModificationRequest(request.id)}
                              className="text-red-400 hover:bg-red-500/20"
                            >
                              <X className="w-4 h-4 mr-1" />
                              Refuser
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* ADMIN DASHBOARD: Everything pending from servers and manager */}
                <Card className="bg-gradient-to-br from-amber-900/20 to-orange-900/10 border-amber-500/40">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-amber-400 flex items-center gap-2">
                      <Clock className="w-6 h-6" />
                      EN ATTENTE
                      <Badge className="bg-amber-500/30 text-amber-300 ml-2 text-lg px-3">
                        {(invoices.filter(i => i.validation_status === 'pending').length) + 
                         (expenses.filter(e => e.status === 'pending' || e.status === 'revision_requested').length)}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Pending invoices from servers */}
                    {invoices.filter(i => i.validation_status === 'pending').length > 0 && (
                      <div>
                        <p className="text-orange-400 text-sm font-medium mb-2 flex items-center gap-1">
                          <Printer className="w-4 h-4" /> Factures en attente de validation ({invoices.filter(i => i.validation_status === 'pending').length})
                        </p>
                        <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                          {invoices.filter(i => i.validation_status === 'pending').map(inv => (
                            <div key={inv.id} className="flex items-center justify-between bg-orange-900/20 rounded-lg px-3 py-2 border border-orange-500/20">
                              <div className="flex items-center gap-2">
                                <span className="text-white text-sm font-bold">{inv.invoice_number}</span>
                                <span className="text-slate-400 text-xs">par {inv.created_by}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-orange-400 text-sm font-bold">{formatPrice(inv.total)} F</span>
                                <span className="text-slate-500 text-xs">{inv.created_at?.slice(11, 16)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Pending expenses */}
                    {expenses.filter(e => e.status === 'pending').length > 0 && (
                      <div>
                        <p className="text-yellow-400 text-sm font-medium mb-2 flex items-center gap-1">
                          <ShoppingCart className="w-4 h-4" /> Achats en attente d'approbation ({expenses.filter(e => e.status === 'pending').length})
                        </p>
                        <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                          {expenses.filter(e => e.status === 'pending').map(exp => (
                            <div key={exp.id} className="flex flex-col gap-1 bg-yellow-900/20 rounded-lg px-3 py-2 border border-yellow-500/20">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-white text-sm">{exp.description?.slice(0, 40)}</span>
                                  <span className="text-slate-400 text-xs">par {exp.requested_by}</span>
                                </div>
                                <span className="text-yellow-400 text-sm font-bold whitespace-nowrap">{formatPrice(exp.amount)} F</span>
                              </div>
                              {currentUser?.role === 'admin' && expenseAnalyses[exp.id] && (
                                <ExpenseAnalysisBadges analysis={expenseAnalyses[exp.id]} />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Revision requested expenses */}
                    {expenses.filter(e => e.status === 'revision_requested').length > 0 && (
                      <div>
                        <p className="text-red-400 text-sm font-medium mb-2 flex items-center gap-1">
                          <AlertTriangle className="w-4 h-4" /> Achats a reviser ({expenses.filter(e => e.status === 'revision_requested').length})
                        </p>
                        <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                          {expenses.filter(e => e.status === 'revision_requested').map(exp => (
                            <div key={exp.id} className="flex flex-col gap-1 bg-red-900/20 rounded-lg px-3 py-2 border border-red-500/20">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-white text-sm">{exp.description?.slice(0, 40)}</span>
                                  <Badge className="bg-red-500/20 text-red-400 text-xs">A reviser</Badge>
                                </div>
                                <span className="text-red-400 text-sm font-bold whitespace-nowrap">{formatPrice(exp.amount)} F</span>
                              </div>
                              {currentUser?.role === 'admin' && expenseAnalyses[exp.id] && (
                                <ExpenseAnalysisBadges analysis={expenseAnalyses[exp.id]} />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {invoices.filter(i => i.validation_status === 'pending').length === 0 && 
                     expenses.filter(e => e.status === 'pending' || e.status === 'revision_requested').length === 0 && (
                      <p className="text-slate-500 text-center py-4">Aucun element en attente</p>
                    )}
                  </CardContent>
                </Card>

                {/* Priority Section: Invoices to Print */}
                <Card className="bg-gradient-to-br from-green-900/30 to-emerald-900/20 border-green-500/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-green-400 flex items-center gap-2">
                      <Printer className="w-6 h-6" />
                      FACTURES À IMPRIMER
                      <Badge className="bg-green-500/30 text-green-300 ml-2 text-lg px-3">
                        {invoices.filter(i => i.validation_status === 'validated').length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {invoices.filter(i => i.validation_status === 'validated').length === 0 ? (
                      <p className="text-slate-400 text-center py-4">Aucune facture validé à imprimer</p>
                    ) : (
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {invoices.filter(i => i.validation_status === 'validated').map(invoice => (
                          <div key={invoice.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-green-900/30 rounded-lg p-3 border border-green-500/30">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-white font-bold">{invoice.invoice_number}</span>
                                <Badge className="bg-green-500/30 text-green-300 text-xs">✓ Validée</Badge>
                              </div>
                              <p className="text-slate-400 text-sm">
                                {invoice.customer_name} • <span className="text-green-400 font-bold">{formatPrice(invoice.total)} F</span>
                              </p>
                              <p className="text-slate-500 text-xs">
                                Par: {invoice.created_by} • Validée par: {invoice.validated_by}
                              </p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              {/* Print button - Manager/Admin only */}
                              {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
                                <Button 
                                  onClick={() => printTicket(invoice)} 
                                  className="bg-green-600 hover:bg-green-700 text-white"
                                  size="sm"
                                >
                                  <Printer className="w-4 h-4 mr-2" />
                                  IMPRIMER
                                </Button>
                              )}
                              {/* Admin can cancel directly, Manager can request cancellation */}
                              {currentUser?.role === 'admin' ? (
                                <Button 
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => cancelValidatedInvoice(invoice.id)}
                                  className="text-red-400 hover:text-red-300 hover:bg-red-500/20"
                                  title="Annuler cette facture"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              ) : currentUser?.role === 'manager' && (
                                <Button 
                                  size="sm"
                                  variant="outline"
                                  onClick={() => requestCancellation(invoice)}
                                  className="border-orange-500/50 text-orange-400 hover:bg-orange-500/20"
                                  title="Demander l'annulation à l'admin"
                                  disabled={cancellationRequests.some(r => r.invoice_id === invoice.id)}
                                >
                                  {cancellationRequests.some(r => r.invoice_id === invoice.id) ? (
                                    <span className="text-xs">Demande envoyée</span>
                                  ) : (
                                    <>
                                      <MessageCircle className="w-4 h-4 mr-1" />
                                      <span className="text-xs">Demander</span>
                                    </>
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Section "Créer une facture" supprimée — l'admin a maintenant accès à la vue de création complète ci-dessous */}
              </div>
            )}
            {/* ============== UNIFIED CREATION VIEW (Server + Manager + Admin) ============== */}
            {(currentUser?.role === 'admin') && (
              <div className="mb-3 mt-6 flex items-center gap-2 pb-2 border-b border-slate-700">
                <Plus className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-bold text-amber-400">Créer une facture</h3>
                <Badge className="bg-amber-500/20 text-amber-300 text-xs">
                  Mode complet
                </Badge>
              </div>
            )}
            {(currentUser?.role === 'server' || currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
              <>
            {/* Multi-Table Bar */}
            <div className="mb-4 bg-slate-800/70 rounded-lg border border-slate-700 p-2">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <span className="text-slate-400 text-sm font-medium px-2 whitespace-nowrap">Tables:</span>
                
                {openTables.map(table => (
                  <div
                    key={table.id}
                    className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer transition-all whitespace-nowrap ${
                      activeTableId === table.id
                        ? 'bg-amber-500 text-white shadow-lg'
                        : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'
                    }`}
                    onClick={() => selectTable(table)}
                  >
                    <span className="font-bold">T{table.table_number}</span>
                    {table.items?.length > 0 && (
                      <Badge className={`ml-1 ${activeTableId === table.id ? 'bg-white/20 text-white' : 'bg-amber-500/20 text-amber-400'}`}>
                        {table.items.length}
                      </Badge>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (table.items?.length > 0) {
                          if (confirm(`Fermer la Table ${table.table_number} ? Les articles non facturés seront perdus.`)) {
                            closeTable(table.id);
                          }
                        } else {
                          closeTable(table.id);
                        }
                      }}
                      className={`ml-1 p-0.5 rounded hover:bg-red-500/30 ${activeTableId === table.id ? 'text-white/70 hover:text-white' : 'text-slate-500 hover:text-red-400'}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                
                {/* New Table Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowNewTableModal(true)}
                  className="border-dashed border-slate-600 text-slate-400 hover:text-white hover:border-amber-500 whitespace-nowrap"
                  disabled={availableTableNumbers.length === 0}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Nouvelle Table
                </Button>
                
                {openTables.length === 0 && (
                  <span className="text-slate-500 text-sm italic">Aucune table ouverte - Cliquez sur "Nouvelle Table" pour commencer</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Left: Products */}
              <div className="lg:col-span-2 space-y-4">
                {/* Search bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Rechercher un produit... (ex: poulet, pizza, bière)"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="pl-10 bg-slate-800/50 border-slate-700 text-white h-12 text-lg"
                    disabled={!activeTableId}
                  />
                  {productSearch && (
                    <button 
                      onClick={() => setProductSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>

                {/* Search Results */}
                {productSearch.length >= 2 && activeTableId && (
                  <Card className="bg-amber-500/10 border-amber-500/30">
                    <CardHeader className="py-2 px-4">
                      <CardTitle className="text-amber-400 text-sm flex items-center gap-2">
                        <Search className="w-4 h-4" />
                        Résultats pour "{productSearch}"
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-2">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[200px] overflow-y-auto">
                        {(() => {
                          const searchLower = productSearch.toLowerCase();
                          const results = [];
                          Object.entries(catalog).forEach(([dept, items]) => {
                            (items || []).forEach(item => {
                              if (item.name.toLowerCase().includes(searchLower) || 
                                  (item.category && item.category.toLowerCase().includes(searchLower))) {
                                results.push({ ...item, department: dept });
                              }
                            });
                          });
                          if (results.length === 0) {
                            return <p className="col-span-full text-slate-400 text-center py-4">Aucun résultat</p>;
                          }
                          return results.slice(0, 12).map((item, idx) => {
                            const config = DEPARTMENT_CONFIG[item.department] || DEPARTMENT_CONFIG.autres;
                            return (
                              <button
                                key={`search-${idx}`}
                                onClick={() => {
                                  addToBill(item, item.department);
                                  setProductSearch("");
                                }}
                                className={`p-2 rounded-lg ${config.bgColor} border ${config.borderColor} hover:scale-[1.02] transition-all text-left`}
                              >
                                <p className={`font-semibold text-xs ${config.color}`}>{item.name}</p>
                                <p className="text-white font-bold text-sm">{formatPrice(item.price)} F</p>
                                <p className="text-slate-500 text-xs">{config.label}</p>
                              </button>
                            );
                          });
                        })()}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Department tabs */}
                <div className="flex gap-2 flex-wrap bg-slate-800/50 p-2 rounded-lg border border-slate-700">
                  {Object.entries(DEPARTMENT_CONFIG).map(([key, config]) => {
                    const Icon = config.icon;
                    return (
                      <Button
                        key={key}
                        variant={activeDepartment === key ? "default" : "ghost"}
                        onClick={() => { setActiveDepartment(key); setProductSearch(""); }}
                        className={activeDepartment === key 
                          ? `bg-gradient-to-r ${key === 'jeux' ? 'from-blue-500 to-blue-600' : key === 'bar' ? 'from-orange-500 to-orange-600' : key === 'accompagnements' ? 'from-yellow-500 to-yellow-600' : 'from-green-500 to-green-600'} text-white` 
                          : "text-slate-300 hover:text-white"
                        }
                        disabled={!activeTableId}
                      >
                        <Icon className="w-4 h-4 mr-2" />
                        {config.label}
                      </Button>
                    );
                  })}
                </div>

                {/* Products grid */}
                {activeTableId ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {(catalog[activeDepartment] || []).map((item) => {
                      const config = DEPARTMENT_CONFIG[activeDepartment];
                      return (
                        <button
                          key={`${activeDepartment}-${item.id}`}
                          onClick={() => addToBill(item, activeDepartment)}
                          className={`p-3 rounded-lg ${config.bgColor} border ${config.borderColor} hover:scale-[1.02] transition-all text-left`}
                        >
                          <p className={`font-semibold text-sm ${config.color}`}>{item.name}</p>
                          <p className="text-white font-bold">{formatPrice(item.price)} F</p>
                          <p className="text-slate-500 text-xs">/{item.unit}</p>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <Card className="bg-slate-800/30 border-slate-700 border-dashed">
                    <CardContent className="py-12 text-center">
                      <Calculator className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                      <p className="text-slate-400 mb-4">Sélectionnez ou créez une table pour commencer</p>
                      <Button onClick={() => setShowNewTableModal(true)} className="bg-amber-500 hover:bg-amber-600">
                        <Plus className="w-4 h-4 mr-2" />
                        Ouvrir une Table
                      </Button>
                    </CardContent>
                  </Card>
                )}
                
                {/* Custom item form for "Autres" department - Manager/Admin only */}
                {activeDepartment === "autres" && activeTableId && (currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
                  <Card className="mt-4 bg-slate-700/30 border-slate-600">
                    <CardContent className="p-4">
                      <h4 className="text-slate-300 font-semibold mb-3">Saisie manuelle</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-slate-400 text-xs">Nom du produit</Label>
                          <Input
                            value={customItem.name}
                            onChange={(e) => setCustomItem({ ...customItem, name: e.target.value })}
                            placeholder="Ex: Service spécial"
                            className="bg-slate-800 border-slate-600 text-white mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-slate-400 text-xs">Prix (FCFA)</Label>
                          <Input
                            type="number"
                            value={customItem.price || ""}
                            onChange={(e) => setCustomItem({ ...customItem, price: parseInt(e.target.value) || 0 })}
                            placeholder="0"
                            className="bg-slate-800 border-slate-600 text-white mt-1"
                          />
                        </div>
                      </div>
                      <Button 
                        onClick={addCustomItem} 
                        className="w-full mt-3 bg-slate-600 hover:bg-slate-500"
                        disabled={!customItem.name || customItem.price <= 0}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Ajouter à la facture
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Right: Current Bill - Fixed on desktop */}
              <div className="lg:col-span-1">
                <div className="lg:sticky lg:top-20 space-y-4">
                  <Card className="bg-slate-800/50 border-amber-500/30">
                    <CardHeader className="border-b border-slate-700 py-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-amber-500 flex items-center gap-2 text-lg">
                          <Receipt className="w-5 h-5" />
                          {activeTable ? `Table ${activeTable.table_number}` : 'Facture'}
                        </CardTitle>
                        {currentBill.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (window.confirm("Vider toute la commande de cette table ?")) clearBill();
                            }}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 text-xs gap-1"
                            data-testid="clear-bill-btn-commande"
                            title="Vider la commande"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Vider
                          </Button>
                        )}
                      </div>
                      
                      {/* Client selector */}
                      <Select 
                        value={selectedClient?.id || "anonymous"} 
                        onValueChange={(v) => setSelectedClient(v === "anonymous" ? null : clients.find(c => c.id === v) || null)}
                        disabled={!activeTableId}
                      >
                        <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white mt-2">
                          <SelectValue placeholder="Sélectionner un client (optionnel)" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          <SelectItem value="anonymous" className="text-white">Client anonyme</SelectItem>
                          {clients.map(client => (
                            <SelectItem key={client.id} value={client.id} className="text-white">
                              {client.name} {client.phone && `(${client.phone})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </CardHeader>
                  
                  <CardContent className="p-3">
                    {!activeTableId ? (
                      <p className="text-slate-500 text-center py-8">Ouvrez une table pour commencer</p>
                    ) : currentBill.length === 0 ? (
                      <p className="text-slate-500 text-center py-8">Aucun article</p>
                    ) : (
                      <div className="space-y-2 max-h-[250px] overflow-y-auto">
                        {currentBill.map((item, index) => {
                          const config = DEPARTMENT_CONFIG[item.department];
                          return (
                            <div key={index} className="flex items-center justify-between bg-slate-700/30 rounded-lg p-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-medium truncate">{item.name}</p>
                                <p className={`text-xs ${config.color}`}>{config.label}</p>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button size="icon" variant="ghost" onClick={() => updateQuantity(index, -1)} className="w-6 h-6 text-slate-400">
                                  <Minus className="w-3 h-3" />
                                </Button>
                                <span className="text-white w-6 text-center text-sm">{item.quantity}</span>
                                <Button size="icon" variant="ghost" onClick={() => updateQuantity(index, 1)} className="w-6 h-6 text-slate-400">
                                  <Plus className="w-3 h-3" />
                                </Button>
                                <span className="text-amber-400 font-bold text-sm w-14 text-right">
                                  {formatPrice(item.price * item.quantity)}
                                </span>
                                <Button size="icon" variant="ghost" onClick={() => removeItem(index)} className="w-6 h-6 text-red-400">
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {currentBill.length > 0 && (
                      <>
                        {/* Free Accompaniment Button */}
                        <Button
                          onClick={() => setShowFreeAccompModal(true)}
                          variant="outline"
                          size="sm"
                          className="w-full mt-2 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/20"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Accomp. Gratuit
                        </Button>
                        
                        {/* Totals by department */}
                        <div className="mt-3 pt-3 border-t border-slate-700 space-y-1">
                          {Object.entries(totalByDepartment).map(([dept, amount]) => {
                            if (amount === 0) return null;
                            const config = DEPARTMENT_CONFIG[dept];
                            return (
                              <div key={dept} className="flex justify-between text-xs">
                                <span className={config.color}>{config.label}</span>
                                <span className="text-white">{formatPrice(amount)} F</span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Coach Players sur cette table — vue 360° */}
                        {tableCoachPlayers && tableCoachPlayers.count > 0 && (
                          <div className="mt-3 pt-3 border-t border-purple-500/30 bg-purple-950/30 -mx-3 px-3 py-2 rounded">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-purple-300 text-xs font-semibold flex items-center gap-1.5">
                                🎮 {tableCoachPlayers.count} joueur{tableCoachPlayers.count > 1 ? "s" : ""} Coach sur cette table
                              </span>
                              <span className="text-purple-200 text-xs font-bold">
                                +{formatPrice(tableCoachPlayers.grand_total)} F
                              </span>
                            </div>
                            <div className="space-y-1" data-testid="table-coach-players-panel">
                              {tableCoachPlayers.players.map((p) => (
                                <div key={p.id} className="flex items-center justify-between text-[11px] bg-purple-900/30 rounded px-2 py-1">
                                  <span className="text-purple-100 truncate">
                                    <span className="font-medium">{p.player_name}</span>
                                    <span className="text-purple-400/80 ml-1">
                                      · {(p.items || []).reduce((s, it) => s + (it.parties || 0), 0)} partie(s)
                                      {(p.items || []).some(it => it.billing_mode === "hourly") && (
                                        <span> · forfait h</span>
                                      )}
                                    </span>
                                  </span>
                                  <span className="text-emerald-300 font-mono whitespace-nowrap ml-2">
                                    {formatPrice(p.total || 0)} F
                                  </span>
                                </div>
                              ))}
                            </div>
                            {/* Bouton 1-clic : transmet + ajoute à la commande */}
                            {transmitCoachPlayersOnTable && tableCoachPlayers.grand_total > 0 && (
                              <Button
                                onClick={transmitCoachPlayersOnTable}
                                size="sm"
                                className="w-full mt-2 h-8 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700 text-white text-xs font-semibold"
                                data-testid="transmit-coach-players-now-btn"
                              >
                                ⚡ Facturer maintenant ({formatPrice(tableCoachPlayers.grand_total)} F)
                              </Button>
                            )}
                            <p className="text-[10px] text-purple-400/70 italic mt-1.5">
                              {transmitCoachPlayersOnTable
                                ? "Clic = ajoute les articles à la commande + marque les joueurs transmis"
                                : "Ces montants seront ajoutés au bon lors de la transmission du Coach"}
                            </p>
                          </div>
                        )}

                        {/* Discount & Payment */}
                        <div className="mt-3 pt-3 border-t border-slate-700 space-y-3">
                          <div className="flex items-center gap-2">
                            <Label className="text-slate-400 text-xs">Remise %</Label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={discount}
                              onChange={(e) => setDiscount(parseInt(e.target.value) || 0)}
                              className="w-16 bg-slate-700/50 border-slate-600 text-white text-sm h-8"
                            />
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-400">Sous-total</span>
                              <span className="text-white">{formatPrice(subtotal)} F</span>
                            </div>
                            {discount > 0 && (
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Remise ({discount}%)</span>
                                <span className="text-green-400">-{formatPrice(discountAmount)} F</span>
                              </div>
                            )}
                            <div className="flex justify-between text-lg font-bold pt-2 border-t border-slate-700">
                              <span className="text-white">TOTAL</span>
                              <span className="text-amber-500">{formatPrice(total)} FCFA</span>
                            </div>
                          </div>

                          {/* Payment method */}
                          <div className="grid grid-cols-2 gap-1">
                            {PAYMENT_METHODS.map(method => {
                              const Icon = method.icon;
                              return (
                                <Button
                                  key={method.value}
                                  variant={paymentMethod === method.value ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => setPaymentMethod(method.value)}
                                  className={paymentMethod === method.value ? "bg-amber-500 text-white" : "border-slate-600 text-slate-300"}
                                >
                                  <Icon className="w-3 h-3 mr-1" />
                                  {method.label}
                                </Button>
                              );
                            })}
                          </div>

                          {/* Instructions spéciales client */}
                          <div className="pt-2 border-t border-slate-700">
                            <Label className="text-slate-400 text-sm flex items-center gap-2 mb-2">
                              <MessageCircle className="w-4 h-4" />
                              Instructions particulières du client
                            </Label>
                            <Textarea
                              value={notes}
                              onChange={(e) => setNotes(e.target.value)}
                              placeholder="Ex: Sans oignon, bien cuit, allergie aux arachides..."
                              className="bg-slate-800 border-slate-600 text-white text-sm"
                              rows={2}
                            />
                          </div>

                          {/* Actions */}
                          <div className="pt-2">
                            <Button onClick={saveInvoice} className="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-white font-bold py-6 text-lg">
                              <Send className="w-5 h-5 mr-2" />
                              ENVOYER LA COMMANDE
                            </Button>
                            <p className="text-slate-500 text-xs text-center mt-2">
                              La commande sera envoyée à la responsable op. & log pour validation
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* ============== FACTURES À IMPRIMER (Validated invoices) - Admin/Manager only ============== */}
                {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && 
                  invoices.filter(i => i.validation_status === 'validated').length > 0 && (
                  <Card className="bg-gradient-to-br from-green-900/30 to-green-800/20 border-green-500/50 mt-4">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-green-400 flex items-center gap-2 text-base">
                        <Printer className="w-5 h-5" />
                        FACTURES À IMPRIMER
                        <Badge className="bg-green-500/30 text-green-300 ml-2">
                          {invoices.filter(i => i.validation_status === 'validated').length}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 max-h-[250px] overflow-y-auto">
                      {invoices.filter(i => i.validation_status === 'validated').slice(0, 5).map(invoice => (
                        <div key={invoice.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-green-900/30 rounded-lg p-3 border border-green-500/30">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white font-bold text-sm">{invoice.invoice_number}</span>
                              <Badge className="bg-green-500/30 text-green-300 text-xs">✓ Validée</Badge>
                            </div>
                            <p className="text-slate-400 text-xs mt-1 truncate">
                              {invoice.customer_name} • {formatPrice(invoice.total)} FCFA
                            </p>
                          </div>
                          <Button 
                            onClick={() => printTicket(invoice)} 
                            className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto shrink-0"
                            size="sm"
                          >
                            <Printer className="w-4 h-4 mr-2" />
                            IMPRIMER
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* ============== FACTURES DÉFINITIVES DU JOUR (Server view - read only) ============== */}
                {currentUser?.role === 'server' && 
                  invoices.filter(i => i.validation_status === 'validated').length > 0 && (
                  <Card className="bg-gradient-to-br from-slate-800/50 to-slate-700/30 border-slate-600/50 mt-4">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-slate-300 flex items-center gap-2 text-base">
                        <FileText className="w-5 h-5" />
                        FACTURES DÉFINITIVES DU JOUR
                        <Badge className="bg-slate-600/50 text-slate-300 ml-2">
                          {invoices.filter(i => i.validation_status === 'validated').length}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
                      {invoices.filter(i => i.validation_status === 'validated').map(invoice => (
                        <div key={invoice.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-700/30 rounded-lg p-3 border border-slate-600/30">
                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setViewInvoice(invoice)}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white font-bold text-sm">{invoice.invoice_number}</span>
                              <Badge className="bg-green-500/30 text-green-300 text-xs">✓ Définitive</Badge>
                              {invoice.table_number && (
                                <Badge className="bg-amber-500/20 text-amber-400 text-xs">Table {invoice.table_number}</Badge>
                              )}
                            </div>
                            <p className="text-slate-400 text-xs mt-1">
                              {invoice.customer_name} • <span className="text-amber-400 font-semibold">{formatPrice(invoice.total)} F</span>
                            </p>
                            <p className="text-slate-500 text-xs">
                              Agent: {invoice.created_by} • Validé par: {invoice.validated_by}
                            </p>
                          </div>
                          <Button 
                            variant="outline"
                            onClick={() => setViewInvoice(invoice)} 
                            className="border-slate-600 text-slate-300 hover:bg-slate-700 w-full sm:w-auto shrink-0"
                            size="sm"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Voir
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                </div>
              </div>
            </div>
              </>
            )}

    </>
  );
};

export default CommandeTab;
