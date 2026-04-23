/**
 * AchatsTab — Onglet Achats & Dépenses extrait de CaissePage.jsx.
 *
 * Reçoit un `ctx` contenant tous les state + handlers requis. Ce composant est
 * purement "présentation" : toute la logique métier (fetch, create, update, revise,
 * convertToPO, print, modals) reste côté parent CaissePage.jsx.
 *
 * Ainsi l'extraction ne change rien au comportement existant (itérations 42-49).
 */
import React from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ShoppingCart, Plus, Eye, CheckCircle, AlertCircle, Edit2, Trash2,
  FileText, Printer, Receipt, Calendar, X, Truck,
} from "lucide-react";
import ExpenseAnalysisBadges from "./ExpenseAnalysisBadges";

const AchatsTab = ({ ctx }) => {
  const {
    currentUser,
    expenses,
    shoppingList,
    achatsSubView, setAchatsSubView,
    showAllExpenses, setShowAllExpenses,
    expenseRatioAlert,
    expenseAnalyses,
    formatPrice,
    setShowExpenseModal,
    setShowShoppingListModal,
    setExpenseToAssign,
    setShowWeekAssignModal,
    printExpensesTicket,
    printAllExpensesList,
    printAllApprovedExpenses,
    printExpensePDF,
    openExpenseForEdit,
    deleteExpense,
    updateExpense,
    openReviseModal,
    convertExpenseToPO,
    availableAccounts,
    allocateExpenseToAccount,
  } = ctx;
  return (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-xl font-bold text-purple-300 flex items-center gap-2">
                  <ShoppingCart className="w-6 h-6" />
                  Achats & Dépenses
                </h2>
                {currentUser?.role === 'manager' && (
                  <div className="flex gap-2 flex-wrap">
                    <Button 
                      onClick={() => setShowExpenseModal(true)}
                      className="bg-purple-600 hover:bg-purple-700"
                      data-testid="new-expense-btn"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Achats communs
                    </Button>
                    <Button 
                      onClick={() => setShowShoppingListModal(true)}
                      className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                    >
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      Achats Fournisseurs
                      {shoppingList.length > 0 && (
                        <Badge className="ml-2 bg-white/20 text-white">{shoppingList.length}</Badge>
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {/* Sub-navigation: Validation en cours / À réviser / Validés / Rejetés */}
              <div className="flex items-center gap-2 border-b border-slate-700 pb-2 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setAchatsSubView('en_cours')}
                  data-testid="achats-subtab-en-cours"
                  className={`px-3 py-2 rounded-t text-sm font-medium transition-colors whitespace-nowrap ${
                    achatsSubView === 'en_cours'
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50'
                  }`}
                >
                  Validation en cours
                  <Badge className="ml-2 bg-white/20 text-white text-xs">
                    {expenses.filter(e => e.status === 'pending').length}
                  </Badge>
                </button>
                <button
                  type="button"
                  onClick={() => setAchatsSubView('a_reviser')}
                  data-testid="achats-subtab-a-reviser"
                  className={`px-3 py-2 rounded-t text-sm font-medium transition-colors whitespace-nowrap ${
                    achatsSubView === 'a_reviser'
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50'
                  }`}
                >
                  <Edit2 className="w-4 h-4 mr-1 inline" />
                  À réviser
                  <Badge className="ml-2 bg-white/20 text-white text-xs">
                    {expenses.filter(e => e.status === 'revision_requested').length}
                  </Badge>
                </button>
                <button
                  type="button"
                  onClick={() => setAchatsSubView('valides')}
                  data-testid="achats-subtab-valides"
                  className={`px-3 py-2 rounded-t text-sm font-medium transition-colors whitespace-nowrap ${
                    achatsSubView === 'valides'
                      ? 'bg-green-600 text-white'
                      : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50'
                  }`}
                >
                  <CheckCircle className="w-4 h-4 mr-1 inline" />
                  Achats validés
                  <Badge className="ml-2 bg-white/20 text-white text-xs">
                    {expenses.filter(e => ['approved', 'completed'].includes(e.status)).length}
                  </Badge>
                </button>
                <button
                  type="button"
                  onClick={() => setAchatsSubView('rejetes')}
                  data-testid="achats-subtab-rejetes"
                  className={`px-3 py-2 rounded-t text-sm font-medium transition-colors whitespace-nowrap ${
                    achatsSubView === 'rejetes'
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50'
                  }`}
                >
                  <X className="w-4 h-4 mr-1 inline" />
                  Rejetés
                  <Badge className="ml-2 bg-white/20 text-white text-xs">
                    {expenses.filter(e => e.status === 'rejected').length}
                  </Badge>
                </button>
              </div>

              {/* Categories legend */}
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <div className="flex flex-wrap gap-2">
                  <Badge className="bg-green-500/20 text-green-400">Cuisine</Badge>
                  <Badge className="bg-orange-500/20 text-orange-400">Bar</Badge>
                  <Badge className="bg-blue-500/20 text-blue-400">Paiement</Badge>
                  <Badge className="bg-slate-500/20 text-slate-400">Autres</Badge>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowAllExpenses(!showAllExpenses)}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  <Eye className="w-4 h-4 mr-1" />
                  {showAllExpenses ? 'Masquer détails' : 'Voir tout en détail'}
                </Button>
              </div>

              {/* ALERT: Expense ratio > 40% */}
              {currentUser?.role === 'admin' && expenseRatioAlert?.isOverLimit && (
                <Card className="bg-gradient-to-br from-red-900/40 to-rose-900/30 border-red-500/70 animate-pulse" data-testid="expense-ratio-alert">
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-red-500 rounded-full p-2">
                        <AlertCircle className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-red-400 font-bold text-lg">Alerte : Ratio Dépenses/CA élevé</p>
                        <p className="text-red-300">
                          Les dépenses de la semaine représentent <span className="font-bold text-xl">{expenseRatioAlert.ratio}%</span> du CA validé de la semaine
                        </p>
                        <p className="text-slate-400 text-sm mt-1">
                          Dépenses semaine: {formatPrice(expenseRatioAlert.expenses)} F • CA semaine: {formatPrice(expenseRatioAlert.ca)} F • Seuil: 40%
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Ratio indicator (non-alert) */}
              {currentUser?.role === 'admin' && expenseRatioAlert && !expenseRatioAlert.isOverLimit && (
                <div className="flex items-center gap-2 text-sm bg-slate-800/30 rounded-lg p-2" data-testid="expense-ratio-ok">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-slate-400">Ratio Dépenses/CA (semaine): </span>
                  <span className="text-green-400 font-bold">{expenseRatioAlert.ratio}%</span>
                  <span className="text-slate-500">(seuil: 40%)</span>
                </div>
              )}

              {/* Summary stats */}
              <div className="flex items-center gap-2 text-sm text-slate-400 flex-wrap">
                <span>Total: <span className="text-white font-bold">{expenses.length}</span> demandes</span>
                <span>•</span>
                <span className="text-amber-400">{expenses.filter(e => e.status === 'pending').length} en attente</span>
                <span>•</span>
                <span className="text-orange-400">{expenses.filter(e => e.status === 'revision_requested').length} à réviser</span>
                <span>•</span>
                <span className="text-green-400">{expenses.filter(e => e.status === 'approved').length} approuvées</span>
                <span>•</span>
                <span className="text-slate-500">{expenses.filter(e => e.status === 'completed').length} terminées</span>
              </div>

              {/* Summary card with totals */}
              {expenses.length > 0 && (
                <Card className="bg-slate-800/30 border-slate-700">
                  <CardContent className="py-3">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
                      <div>
                        <p className="text-slate-500 text-xs">En attente</p>
                        <p className="text-amber-400 font-bold">{formatPrice(expenses.filter(e => e.status === 'pending').reduce((sum, e) => sum + e.amount, 0))} F</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">À réviser</p>
                        <p className="text-orange-400 font-bold">{formatPrice(expenses.filter(e => e.status === 'revision_requested').reduce((sum, e) => sum + e.amount, 0))} F</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Approuvées</p>
                        <p className="text-green-400 font-bold">{formatPrice(expenses.filter(e => e.status === 'approved').reduce((sum, e) => sum + e.amount, 0))} F</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Terminées</p>
                        <p className="text-slate-400 font-bold">{formatPrice(expenses.filter(e => e.status === 'completed').reduce((sum, e) => sum + e.amount, 0))} F</p>
                      </div>
                      <div className="border-l border-slate-700 pl-4">
                        <p className="text-slate-500 text-xs">TOTAL GÉNÉRAL</p>
                        <p className="text-white font-bold text-lg">{formatPrice(expenses.reduce((sum, e) => sum + e.amount, 0))} F</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* FULL DETAIL VIEW - All expenses */}
              {showAllExpenses && expenses.length > 0 && (
                <Card className="bg-gradient-to-br from-indigo-900/20 to-purple-900/20 border-indigo-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-indigo-400 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        VUE COMPLÈTE - Toutes les demandes ({expenses.length})
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          size="sm"
                          variant="outline"
                          onClick={printExpensesTicket}
                          className="border-amber-500/50 text-amber-400 hover:bg-amber-500/20"
                          title="Format ticket thermique 80mm"
                        >
                          <Receipt className="w-4 h-4 mr-1" />
                          Ticket 80mm
                        </Button>
                        <Button 
                          size="sm"
                          variant="outline"
                          onClick={printAllExpensesList}
                          className="border-indigo-500/50 text-indigo-400 hover:bg-indigo-500/20"
                        >
                          <Printer className="w-4 h-4 mr-1" />
                          Imprimer A4
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-[500px] overflow-y-auto">
                    <p className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                      <Edit2 className="w-3 h-3" />
                      Cliquez sur une ligne pour modifier la demande
                    </p>
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-800">
                        <tr className="text-left text-slate-400 border-b border-slate-700">
                          <th className="p-2">#</th>
                          <th className="p-2">Catégorie</th>
                          <th className="p-2">Libellé</th>
                          <th className="p-2 text-center">Qté</th>
                          <th className="p-2 text-right">P.U.</th>
                          <th className="p-2 text-right">Total</th>
                          <th className="p-2">Statut</th>
                          <th className="p-2">Semaine</th>
                          {currentUser?.role === 'admin' && <th className="p-2 text-center">Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.map((expense, index) => (
                          <>
                            <tr 
                              key={expense.id} 
                              className={`border-b border-slate-700/50 hover:bg-indigo-500/10 cursor-pointer transition-colors group ${expense.is_group ? 'bg-indigo-900/20' : ''}`}
                              onClick={() => openExpenseForEdit(expense)}
                              title="Cliquer pour modifier"
                            >
                              <td className="p-2 text-slate-500">{index + 1}</td>
                              <td className="p-2">
                                {expense.is_group ? (
                                  <Badge className="text-xs bg-indigo-500/30 text-indigo-300">
                                    📦 Liste
                                  </Badge>
                                ) : (
                                  <Badge className={`text-xs ${
                                    expense.category === 'cuisine' ? 'bg-green-500/20 text-green-400' :
                                    expense.category === 'bar' ? 'bg-orange-500/20 text-orange-400' :
                                    expense.category === 'paiement' ? 'bg-blue-500/20 text-blue-400' :
                                    'bg-slate-500/20 text-slate-400'
                                  }`}>{expense.category}</Badge>
                                )}
                              </td>
                              <td className="p-2 text-white flex items-center gap-2">
                                {expense.is_group ? (
                                  <span className="font-semibold">{expense.description} ({expense.items?.length || 0} articles)</span>
                                ) : expense.description}
                                <Edit2 className="w-3 h-3 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </td>
                              <td className="p-2 text-center text-slate-300">{expense.is_group ? expense.items?.length : (expense.quantity || 1)}</td>
                              <td className="p-2 text-right text-slate-400">{expense.is_group ? '-' : formatPrice(expense.unit_price || expense.amount) + ' F'}</td>
                              <td className="p-2 text-right font-bold text-amber-400">{formatPrice(expense.amount)} F</td>
                              <td className="p-2">
                                <Badge className={`text-xs ${
                                  expense.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                                  expense.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                                  expense.status === 'completed' ? 'bg-slate-500/20 text-slate-400' :
                                  expense.status === 'revision_requested' ? 'bg-orange-500/20 text-orange-400' :
                                  'bg-red-500/20 text-red-400'
                                }`}>
                                  {expense.status === 'pending' ? 'En attente' :
                                   expense.status === 'approved' ? 'Approuvée' :
                                   expense.status === 'completed' ? 'Terminée' :
                                   expense.status === 'revision_requested' ? 'À réviser' : 'Refusée'}
                                </Badge>
                              </td>
                              <td className="p-2">
                                {expense.assigned_week ? (
                                  <Badge className="text-xs bg-cyan-500/20 text-cyan-400">
                                    {format(new Date(expense.assigned_week), "dd/MM")}
                                  </Badge>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={(e) => { 
                                      e.stopPropagation(); 
                                      setExpenseToAssign(expense);
                                      setShowWeekAssignModal(true);
                                    }}
                                    className="h-6 text-xs text-slate-500 hover:text-cyan-400 p-1"
                                  >
                                    <Calendar className="w-3 h-3 mr-1" />
                                    Rattacher
                                  </Button>
                                )}
                              </td>
                              {currentUser?.role === 'admin' && (
                                <td className="p-2 text-center">
                                  <Button 
                                    size="sm"
                                    variant="ghost"
                                    onClick={(e) => { e.stopPropagation(); deleteExpense(expense.id); }}
                                    className="h-7 w-7 p-0 text-red-500 hover:bg-red-700/20"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </td>
                              )}
                            </tr>
                            {/* Show sub-items for grouped lists */}
                            {expense.is_group && expense.items && expense.items.map((item, subIndex) => (
                              <tr key={`${expense.id}-${subIndex}`} className="bg-slate-800/30 border-b border-slate-700/30 text-xs">
                                <td className="p-1 pl-6 text-slate-600">↳</td>
                                <td className="p-1">
                                  <Badge className={`text-xs ${
                                    item.category === 'cuisine' ? 'bg-green-500/10 text-green-500' :
                                    item.category === 'bar' ? 'bg-orange-500/10 text-orange-500' :
                                    item.category === 'paiement' ? 'bg-blue-500/10 text-blue-500' :
                                    'bg-slate-500/10 text-slate-500'
                                  }`}>{item.category}</Badge>
                                </td>
                                <td className="p-1 text-slate-400">{item.description}</td>
                                <td className="p-1 text-center text-slate-500">{item.quantity}</td>
                                <td className="p-1 text-right text-slate-500">{formatPrice(item.unit_price)} F</td>
                                <td className="p-1 text-right text-slate-400">{formatPrice(item.amount)} F</td>
                                <td className="p-1"></td>
                                <td className="p-1"></td>
                                {currentUser?.role === 'admin' && <td className="p-1"></td>}
                              </tr>
                            ))}
                          </>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-800 font-bold">
                          <td colSpan="5" className="p-2 text-right text-slate-400">TOTAL GÉNÉRAL:</td>
                          <td className="p-2 text-right text-lg text-indigo-400">{formatPrice(expenses.reduce((sum, e) => sum + e.amount, 0))} F</td>
                          <td colSpan={currentUser?.role === 'admin' ? 3 : 2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </CardContent>
                </Card>
              )}

              {/* Pending expenses that need manager revision (revision_requested) */}
              {achatsSubView === 'a_reviser' && currentUser?.role === 'manager' && expenses.filter(e => e.status === 'revision_requested').length > 0 && (
                <Card className="bg-gradient-to-br from-amber-900/30 to-orange-900/20 border-amber-500/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-amber-400 flex items-center gap-2">
                      <AlertCircle className="w-5 h-5" />
                      À RÉVISER
                      <Badge className="bg-amber-500/30 text-amber-300 ml-2">
                        {expenses.filter(e => e.status === 'revision_requested').length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {expenses.filter(e => e.status === 'revision_requested').map(expense => (
                      <div key={expense.id} className="bg-amber-900/20 rounded-lg p-3 border border-amber-500/30">
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {expense.is_group ? (
                                  <Badge className="text-xs bg-indigo-500/30 text-indigo-300">📦 Liste</Badge>
                                ) : (
                                  <Badge className={`text-xs ${
                                    expense.category === 'cuisine' ? 'bg-green-500/20 text-green-400' :
                                    expense.category === 'bar' ? 'bg-orange-500/20 text-orange-400' :
                                    expense.category === 'paiement' ? 'bg-blue-500/20 text-blue-400' :
                                    'bg-slate-500/20 text-slate-400'
                                  }`}>{expense.category}</Badge>
                                )}
                                <span className="text-white font-medium">{expense.description}</span>
                              </div>
                              {!expense.is_group && (
                                <div className="text-slate-400 text-sm mt-1">
                                  Qté: <span className="text-white">{expense.quantity || 1}</span> × 
                                  PU: <span className="text-white">{formatPrice(expense.unit_price || expense.amount)} F</span>
                                </div>
                              )}
                              <p className="text-amber-400 font-bold text-lg">{formatPrice(expense.amount)} F</p>
                              {expense.admin_notes && (
                                <p className="text-amber-300 text-sm mt-1">
                                  <strong>Note admin:</strong> {expense.admin_notes}
                                </p>
                              )}
                            </div>
                            <Button 
                              size="sm"
                              onClick={() => openExpenseForEdit(expense)}
                              className="bg-amber-600 hover:bg-amber-700"
                            >
                              <Edit2 className="w-4 h-4 mr-1" />
                              Modifier
                            </Button>
                          </div>
                          {/* Show sub-items for grouped lists */}
                          {expense.is_group && expense.items && expense.items.length > 0 && (
                            <div className="bg-slate-800/50 rounded p-2 mt-1">
                              <p className="text-xs text-slate-400 mb-2">Détails de la liste ({expense.items.length} articles):</p>
                              <div className="space-y-1">
                                {expense.items.map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-sm border-b border-slate-700/50 pb-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-slate-500">{idx + 1}.</span>
                                      <Badge className={`text-xs ${
                                        item.category === 'cuisine' ? 'bg-green-500/10 text-green-500' :
                                        item.category === 'bar' ? 'bg-orange-500/10 text-orange-500' :
                                        item.category === 'paiement' ? 'bg-blue-500/10 text-blue-500' :
                                        'bg-slate-500/10 text-slate-500'
                                      }`}>{item.category}</Badge>
                                      <span className="text-white">{item.description}</span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-slate-400 text-xs">{item.quantity} × {formatPrice(item.unit_price)} = </span>
                                      <span className="text-amber-400 font-bold">{formatPrice(item.amount)} F</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Admin: Purchases sent for manager revision — still visible to admin with re-approve/re-revise controls */}
              {achatsSubView === 'a_reviser' && currentUser?.role === 'admin' && expenses.filter(e => e.status === 'revision_requested').length > 0 && (
                <Card className="bg-gradient-to-br from-orange-900/30 to-amber-900/20 border-orange-500/50" data-testid="admin-revision-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-orange-400 flex items-center gap-2">
                      <Edit2 className="w-5 h-5" />
                      MODIFIÉS — EN COURS DE RÉVISION CHEZ LA GÉRANTE
                      <Badge className="bg-orange-500/30 text-orange-300 ml-2">
                        {expenses.filter(e => e.status === 'revision_requested').length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-slate-400">
                      Ces demandes ont été modifiées par vous et renvoyées à la gérante. Vous pouvez les approuver directement ou demander une nouvelle révision.
                    </p>
                    {expenses.filter(e => e.status === 'revision_requested').map(expense => (
                      <div key={expense.id} className="bg-orange-900/20 rounded-lg p-3 border border-orange-500/30">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-start justify-between flex-wrap gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {expense.is_group ? (
                                  <Badge className="text-xs bg-indigo-500/30 text-indigo-300">📦 Liste ({expense.items?.length || 0} articles)</Badge>
                                ) : (
                                  <Badge className={`text-xs ${
                                    expense.category === 'cuisine' ? 'bg-green-500/20 text-green-400' :
                                    expense.category === 'bar' ? 'bg-orange-500/20 text-orange-400' :
                                    expense.category === 'paiement' ? 'bg-blue-500/20 text-blue-400' :
                                    'bg-slate-500/20 text-slate-400'
                                  }`}>{expense.category}</Badge>
                                )}
                                <span className="text-white font-medium">{expense.description}</span>
                              </div>
                              <p className="text-orange-300 font-bold text-lg mt-1">{formatPrice(expense.amount)} F</p>
                              {expense.supplier && <p className="text-slate-500 text-xs">Fournisseur: {expense.supplier}</p>}
                              <p className="text-slate-500 text-xs">
                                Demandé par: {expense.requested_by} • Modifié le {expense.updated_at ? new Date(expense.updated_at).toLocaleDateString('fr-FR') : '-'}
                              </p>
                              {expense.admin_notes && (
                                <p className="text-orange-200 text-sm mt-1 italic">
                                  <strong>Note:</strong> {expense.admin_notes}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-2 flex-wrap shrink-0">
                              <Button
                                size="sm"
                                onClick={() => updateExpense(expense.id, { status: "approved", approved_by: "Administrateur" })}
                                className="bg-green-600 hover:bg-green-700"
                                data-testid={`admin-revision-approve-${expense.id}`}
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Approuver
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openReviseModal(expense)}
                                className="border-amber-500/50 text-amber-400 hover:bg-amber-500/20"
                                data-testid={`admin-revision-revise-${expense.id}`}
                              >
                                <Edit2 className="w-4 h-4 mr-1" />
                                Nouvelle révision
                              </Button>
                            </div>
                          </div>
                          {/* Sub-items for grouped lists */}
                          {expense.is_group && expense.items && expense.items.length > 0 && (
                            <div className="bg-slate-800/50 rounded p-2 mt-1">
                              <p className="text-xs text-slate-400 mb-2">📋 Détails de la liste:</p>
                              <div className="space-y-1">
                                {expense.items.map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-xs border-b border-slate-700/50 pb-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-slate-500">{idx + 1}.</span>
                                      <span className="text-white">{item.description}</span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-slate-400">{item.quantity} × {formatPrice(item.unit_price)} = </span>
                                      <span className="text-orange-300 font-bold">{formatPrice(item.amount)} F</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Pending validations (admin: full controls, manager: read-only) */}
              {achatsSubView === 'en_cours' && expenses.filter(e => e.status === 'pending').length > 0 && (
                <Card className="bg-gradient-to-br from-purple-900/30 to-indigo-900/20 border-purple-500/50" data-testid="pending-expenses-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-purple-400 flex items-center gap-2">
                      <ShoppingCart className="w-5 h-5" />
                      {currentUser?.role === 'admin' ? 'DEMANDES À VALIDER' : 'EN ATTENTE DE VALIDATION'}
                      <Badge className="bg-purple-500/30 text-purple-300 ml-2">
                        {expenses.filter(e => e.status === 'pending').length}
                      </Badge>
                      {currentUser?.role !== 'admin' && (
                        <Badge className="bg-slate-500/30 text-slate-300 ml-auto text-xs">
                          Lecture seule
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {expenses.filter(e => e.status === 'pending').map(expense => (
                      <div key={expense.id} className="bg-purple-900/20 rounded-lg p-4 border border-purple-500/30">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {expense.is_group ? (
                                  <Badge className="text-xs bg-indigo-500/30 text-indigo-300">📦 Liste ({expense.items?.length || 0} articles)</Badge>
                                ) : (
                                  <Badge className={`text-xs ${
                                    expense.category === 'cuisine' ? 'bg-green-500/20 text-green-400' :
                                    expense.category === 'bar' ? 'bg-orange-500/20 text-orange-400' :
                                    expense.category === 'paiement' ? 'bg-blue-500/20 text-blue-400' :
                                    'bg-slate-500/20 text-slate-400'
                                  }`}>{expense.category}</Badge>
                                )}
                                <span className="text-white font-bold">{expense.description}</span>
                              </div>
                              {/* Show quantity and unit price for single items */}
                              {!expense.is_group && (
                                <div className="text-slate-300 text-sm mt-1 bg-slate-800/50 rounded px-2 py-1 inline-block">
                                  <span className="text-slate-400">Qté:</span> <span className="font-bold">{expense.quantity || 1}</span>
                                  <span className="mx-2">×</span>
                                  <span className="text-slate-400">PU:</span> <span className="font-bold">{formatPrice(expense.unit_price || expense.amount)} F</span>
                                  <span className="mx-2">=</span>
                                  <span className="text-amber-400 font-bold">{formatPrice(expense.amount)} F</span>
                                </div>
                              )}
                              {expense.is_group && (
                                <p className="text-amber-400 font-bold text-lg mt-1">Total: {formatPrice(expense.amount)} F</p>
                              )}
                              <p className="text-slate-400 text-sm mt-1">
                                Demandé par: {expense.requested_by} • {new Date(expense.created_at).toLocaleDateString('fr-FR')}
                              </p>
                              {expense.supplier && <p className="text-slate-500 text-sm">Fournisseur: {expense.supplier}</p>}
                              {expense.planned_date && <p className="text-slate-500 text-sm">Prévu le: {expense.planned_date}</p>}
                              {/* Badges d'analyse admin (doublons, stock, trésorerie) */}
                              {currentUser?.role === 'admin' && expenseAnalyses[expense.id] && (
                                <div className="mt-2">
                                  <ExpenseAnalysisBadges analysis={expenseAnalyses[expense.id]} />
                                </div>
                              )}
                              {expense.receipt_image && (
                                <div className="mt-2">
                                  <img 
                                    src={expense.receipt_image} 
                                    alt="Reçu" 
                                    className="max-w-[200px] max-h-[100px] object-cover rounded border border-slate-600 cursor-pointer"
                                    onClick={() => window.open(expense.receipt_image, '_blank')}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                          {/* Show sub-items for grouped lists */}
                          {expense.is_group && expense.items && expense.items.length > 0 && (
                            <div className="bg-slate-800/50 rounded p-3 border border-slate-700">
                              <p className="text-xs text-slate-400 mb-2 font-semibold">📋 Détails de la liste:</p>
                              <div className="space-y-2">
                                {expense.items.map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-sm bg-slate-900/30 rounded p-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-slate-500 font-mono">{idx + 1}.</span>
                                      <Badge className={`text-xs ${
                                        item.category === 'cuisine' ? 'bg-green-500/20 text-green-400' :
                                        item.category === 'bar' ? 'bg-orange-500/20 text-orange-400' :
                                        item.category === 'paiement' ? 'bg-blue-500/20 text-blue-400' :
                                        'bg-slate-500/20 text-slate-400'
                                      }`}>{item.category}</Badge>
                                      <span className="text-white font-medium">{item.description}</span>
                                    </div>
                                    <div className="text-right flex items-center gap-2">
                                      <span className="text-slate-400 text-xs">
                                        {item.quantity} × {formatPrice(item.unit_price)} F
                                      </span>
                                      <span className="text-amber-400 font-bold">{formatPrice(item.amount)} F</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="border-t border-slate-700 mt-2 pt-2 flex justify-end">
                                <span className="text-slate-400">Total liste:</span>
                                <span className="text-amber-400 font-bold ml-2">{formatPrice(expense.amount)} F</span>
                              </div>
                            </div>
                          )}
                          {/* Admin: Montant modifiable directement */}
                          {currentUser?.role === 'admin' && (
                          <>
                          <div className="flex items-center gap-3 flex-wrap bg-slate-800/50 rounded-lg p-3">
                            <div className="flex items-center gap-2">
                              <Label className="text-slate-400 text-sm">Montant total:</Label>
                              <Input
                                type="number"
                                defaultValue={expense.amount}
                                className="w-32 bg-slate-700/50 border-slate-600 text-white text-lg font-bold"
                                id={`admin-amount-${expense.id}`}
                              />
                              <span className="text-slate-400">F</span>
                            </div>
                            <Input
                              placeholder="Note pour la gérante (optionnel)"
                              className="flex-1 min-w-[200px] bg-slate-700/50 border-slate-600 text-white text-sm"
                              id={`admin-note-${expense.id}`}
                            />
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <Button 
                              size="sm"
                              onClick={() => {
                                const newAmount = parseFloat(document.getElementById(`admin-amount-${expense.id}`)?.value) || expense.amount;
                                updateExpense(expense.id, { status: "approved", approved_by: "Administrateur", amount: newAmount });
                              }}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Approuver
                            </Button>
                            <Button 
                              size="sm"
                              variant="outline"
                              onClick={() => openReviseModal(expense)}
                              className="border-amber-500/50 text-amber-400 hover:bg-amber-500/20"
                              data-testid={`revise-btn-${expense.id}`}
                            >
                              <Edit2 className="w-4 h-4 mr-1" />
                              Modifier & renvoyer
                            </Button>
                            <Button 
                              size="sm"
                              variant="outline"
                              onClick={() => updateExpense(expense.id, { status: "rejected" })}
                              className="border-red-500/50 text-red-400 hover:bg-red-500/20"
                            >
                              <X className="w-4 h-4 mr-1" />
                              Refuser
                            </Button>
                            <Button 
                              size="sm"
                              variant="outline"
                              onClick={() => deleteExpense(expense.id)}
                              className="border-red-700/50 text-red-500 hover:bg-red-700/20"
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Supprimer
                            </Button>
                          </div>
                          </>
                          )}
                          {/* Manager: read-only banner */}
                          {currentUser?.role !== 'admin' && (
                            <div className="bg-slate-800/50 rounded-lg p-3 text-slate-400 text-sm flex items-center gap-2">
                              <ShoppingCart className="w-4 h-4 text-purple-400" />
                              Demande transmise à l'administrateur — en attente de validation.
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Approved expenses (ready for purchase) */}
              {achatsSubView === 'valides' && expenses.filter(e => e.status === 'approved').length > 0 && (
                <Card className="bg-gradient-to-br from-green-900/30 to-emerald-900/20 border-green-500/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-green-400 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5" />
                        APPROUVÉS - Prêts à acheter
                        <Badge className="bg-green-500/30 text-green-300 ml-2">
                          {expenses.filter(e => e.status === 'approved').length}
                        </Badge>
                        <Badge className="bg-emerald-500/30 text-emerald-300">
                          Total: {formatPrice(expenses.filter(e => e.status === 'approved').reduce((sum, e) => sum + e.amount, 0))} F
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          size="sm"
                          variant="outline"
                          onClick={printExpensesTicket}
                          className="border-amber-500/50 text-amber-400 hover:bg-amber-500/20"
                        >
                          <Receipt className="w-4 h-4 mr-1" />
                          Ticket 80mm
                        </Button>
                        <Button 
                          size="sm"
                          onClick={printAllApprovedExpenses}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Printer className="w-4 h-4 mr-1" />
                          Imprimer A4
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {expenses.filter(e => e.status === 'approved').map(expense => (
                      <div key={expense.id} className="bg-green-900/20 rounded-lg p-3 border border-green-500/30">
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {expense.is_group ? (
                                  <Badge className="text-xs bg-indigo-500/30 text-indigo-300">📦 Liste ({expense.items?.length || 0} articles)</Badge>
                                ) : (
                                  <Badge className={`text-xs ${
                                    expense.category === 'cuisine' ? 'bg-green-500/20 text-green-400' :
                                    expense.category === 'bar' ? 'bg-orange-500/20 text-orange-400' :
                                    expense.category === 'paiement' ? 'bg-blue-500/20 text-blue-400' :
                                    'bg-slate-500/20 text-slate-400'
                                  }`}>{expense.category}</Badge>
                                )}
                                <span className="text-white font-medium">{expense.description}</span>
                              </div>
                              {/* Show quantity and unit price for single items */}
                              {!expense.is_group && (
                                <div className="text-slate-300 text-sm mt-1">
                                  <span className="text-slate-400">Qté:</span> <span className="font-bold">{expense.quantity || 1}</span>
                                  <span className="mx-2">×</span>
                                  <span className="text-slate-400">PU:</span> <span className="font-bold">{formatPrice(expense.unit_price || expense.amount)} F</span>
                                </div>
                              )}
                              <p className="text-green-400 font-bold text-lg">{formatPrice(expense.amount)} F</p>
                              {expense.supplier && <p className="text-slate-500 text-sm">Fournisseur: {expense.supplier}</p>}
                              {expense.planned_date && <p className="text-slate-500 text-sm">Prévu le: {expense.planned_date}</p>}
                              <p className="text-slate-500 text-xs">Approuvé par: {expense.approved_by}</p>
                              {/* Badges d'analyse admin (doublons, stock, trésorerie) */}
                              {currentUser?.role === 'admin' && expenseAnalyses[expense.id] && (
                                <div className="mt-2">
                                  <ExpenseAnalysisBadges analysis={expenseAnalyses[expense.id]} />
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2 flex-wrap shrink-0">
                              {/* Week assignment button */}
                              <Button 
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setExpenseToAssign(expense);
                                  setShowWeekAssignModal(true);
                                }}
                                className={`border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/20 ${expense.assigned_week ? 'bg-cyan-500/20' : ''}`}
                              >
                                <Calendar className="w-4 h-4 mr-1" />
                                {expense.assigned_week ? format(new Date(expense.assigned_week), "dd/MM") : 'Semaine'}
                              </Button>
                              <Button 
                                size="sm"
                                variant="outline"
                                onClick={() => printExpensePDF(expense)}
                                className="border-green-500/50 text-green-400 hover:bg-green-500/20"
                              >
                                <Printer className="w-4 h-4 mr-1" />
                                PDF
                              </Button>
                              {currentUser?.role === 'manager' && (
                                <Button 
                                  size="sm"
                                  onClick={() => updateExpense(expense.id, { status: "completed" })}
                                  className="bg-emerald-600 hover:bg-emerald-700"
                                >
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  Acheté
                                </Button>
                              )}
                              {currentUser?.role === 'admin' && (
                                <Button 
                                  size="sm"
                                  onClick={() => convertExpenseToPO(expense)}
                                  disabled={!!expense.converted_to_po_id}
                                  className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50"
                                  data-testid={`convert-po-${expense.id}`}
                                >
                                  <Truck className="w-4 h-4 mr-1" />
                                  {expense.converted_to_po_id ? `BC ${expense.converted_to_po_number || ''}` : 'Convertir en BC'}
                                </Button>
                              )}
                              {currentUser?.role === 'admin' && (
                                <Button 
                                  size="sm"
                                  variant="outline"
                                  onClick={() => deleteExpense(expense.id)}
                                  className="border-red-700/50 text-red-500 hover:bg-red-700/20"
                                >
                                  <Trash2 className="w-4 h-4 mr-1" />
                                  Supprimer
                                </Button>
                              )}
                            </div>
                          </div>
                          {/* Funding source control (admin only) */}
                          {currentUser?.role === 'admin' && availableAccounts && availableAccounts.length > 0 && (
                            <div className="mt-2 flex items-center gap-2 bg-cyan-900/10 border border-cyan-500/20 rounded px-2 py-1.5">
                              <span className="text-[11px] text-cyan-300 shrink-0">💰 Payé depuis :</span>
                              <select
                                value={expense.funded_by_account_id || ""}
                                onChange={(e) => allocateExpenseToAccount(expense, e.target.value, expense.funded_affects_ca !== false)}
                                className="flex-1 bg-slate-800/60 border border-slate-600 text-white text-xs rounded px-2 py-1 min-w-0"
                                data-testid={`funding-source-${expense.id}`}
                              >
                                <option value="">Recettes de la caisse</option>
                                {availableAccounts.map((acc) => (
                                  <option key={acc.id} value={acc.id}>
                                    📒 {acc.name} — Dispo : {formatPrice(acc.balance_available || 0)} F
                                  </option>
                                ))}
                              </select>
                              {expense.funded_by_account_name && (
                                <Badge className="bg-cyan-500/30 text-cyan-200 text-[10px] shrink-0">
                                  imputé
                                </Badge>
                              )}
                            </div>
                          )}
                          {/* Show sub-items for grouped lists */}
                          {expense.is_group && expense.items && expense.items.length > 0 && (
                            <div className="bg-slate-800/50 rounded p-2 mt-1">
                              <p className="text-xs text-slate-400 mb-2">📋 Détails de la liste:</p>
                              <div className="space-y-1">
                                {expense.items.map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-sm border-b border-slate-700/50 pb-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-slate-500">{idx + 1}.</span>
                                      <Badge className={`text-xs ${
                                        item.category === 'cuisine' ? 'bg-green-500/10 text-green-500' :
                                        item.category === 'bar' ? 'bg-orange-500/10 text-orange-500' :
                                        item.category === 'paiement' ? 'bg-blue-500/10 text-blue-500' :
                                        'bg-slate-500/10 text-slate-500'
                                      }`}>{item.category}</Badge>
                                      <span className="text-white">{item.description}</span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-slate-400 text-xs">{item.quantity} × {formatPrice(item.unit_price)} = </span>
                                      <span className="text-green-400 font-bold">{formatPrice(item.amount)} F</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Completed expenses (history) */}
              {achatsSubView === 'valides' && expenses.filter(e => e.status === 'completed').length > 0 && (
                <Card className="bg-slate-800/30 border-slate-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-slate-400 flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Historique des achats
                      <Badge className="bg-slate-600/50 text-slate-300 ml-2">
                        {expenses.filter(e => e.status === 'completed').length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
                    {expenses.filter(e => e.status === 'completed').slice(0, 20).map(expense => (
                      <div key={expense.id} className="flex items-center justify-between gap-2 bg-slate-700/30 rounded-lg p-2 border border-slate-600/30">
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs ${
                            expense.category === 'cuisine' ? 'bg-green-500/20 text-green-400' :
                            expense.category === 'bar' ? 'bg-orange-500/20 text-orange-400' :
                            expense.category === 'jeux' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-slate-500/20 text-slate-400'
                          }`}>{expense.category}</Badge>
                          <span className="text-slate-300 text-sm">{expense.description}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 text-sm">{formatPrice(expense.amount)} F</span>
                          <span className="text-slate-500 text-xs">{expense.completed_at?.slice(0, 10)}</span>
                          {currentUser?.role === 'admin' && (
                            <Button 
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteExpense(expense.id)}
                              className="h-6 w-6 p-0 text-red-500 hover:bg-red-700/20"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Rejected expenses */}
              {achatsSubView === 'rejetes' && expenses.filter(e => e.status === 'rejected').length > 0 && (
                <Card className="bg-rose-900/20 border-rose-500/30" data-testid="rejected-expenses-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-rose-300 flex items-center gap-2">
                      <X className="w-5 h-5" />
                      Achats rejetés
                      <Badge className="bg-rose-500/30 text-rose-200 ml-2">
                        {expenses.filter(e => e.status === 'rejected').length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
                    {expenses.filter(e => e.status === 'rejected').map(expense => (
                      <div key={expense.id} className="flex items-center justify-between gap-2 bg-rose-800/10 rounded-lg p-2 border border-rose-500/20" data-testid={`rejected-expense-${expense.id}`}>
                        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                          <Badge className={`text-xs ${
                            expense.category === 'cuisine' ? 'bg-green-500/20 text-green-400' :
                            expense.category === 'bar' ? 'bg-orange-500/20 text-orange-400' :
                            expense.category === 'jeux' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-slate-500/20 text-slate-400'
                          }`}>{expense.category}</Badge>
                          <span className="text-slate-200 text-sm truncate">{expense.description}</span>
                          {expense.admin_notes && (
                            <span className="text-rose-300 text-xs italic">
                              — {expense.admin_notes}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-rose-300 font-semibold text-sm">{formatPrice(expense.amount)} F</span>
                          {currentUser?.role === 'admin' && (
                            <Button size="sm" variant="ghost"
                              onClick={() => deleteExpense(expense.id)}
                              className="h-7 w-7 p-0 text-rose-400 hover:bg-rose-500/20">
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {expenses.length === 0 && (
                <Card className="bg-slate-800/30 border-slate-700">
                  <CardContent className="py-12 text-center">
                    <ShoppingCart className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-500">Aucune demande d'achat</p>
                  </CardContent>
                </Card>
              )}
            </div>

  );
};

export default AchatsTab;
