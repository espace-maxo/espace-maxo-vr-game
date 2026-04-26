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
import { Checkbox } from "@/components/ui/checkbox";
import {
  ShoppingCart, Plus, Eye, CheckCircle, AlertCircle, Edit2, Trash2,
  FileText, Printer, Receipt, Calendar, X, Truck, Wallet, Ban,
} from "lucide-react";
import ExpenseAnalysisBadges from "./ExpenseAnalysisBadges";

const STRIKE_REASONS = [
  { value: "pas_opportun", label: "Pas opportun" },
  { value: "a_reporter", label: "À reporter" },
  { value: "a_abandonner", label: "À abandonner" },
  { value: "autres", label: "Autres" },
];

const STRIKE_LABEL = STRIKE_REASONS.reduce((acc, r) => ({ ...acc, [r.value]: r.label }), {});

/**
 * Compare original_items (manager's submission snapshot) with current items
 * (final corrected version) and return a structured audit trail.
 *
 * Returns: { added[], removed[], modified[], struck[], unchangedCount, hasChanges }
 *
 * Matching is done by normalized description (lowercase + trimmed). When an item's
 * description was edited by admin, we treat it as removed+added pair.
 */
const computeAuditTrail = (expense) => {
  const originals = expense?.original_items || [];
  const finals = expense?.items || [];
  if (!expense?.original_items) {
    return { added: [], removed: [], modified: [], struck: [], unchangedCount: 0, hasChanges: false };
  }
  const norm = (s) => String(s || "").trim().toLowerCase();
  const finalsByDesc = new Map();
  finals.forEach((it, i) => {
    const k = norm(it.description);
    if (!finalsByDesc.has(k)) finalsByDesc.set(k, []);
    finalsByDesc.get(k).push({ ...it, _i: i });
  });
  const added = [];
  const removed = [];
  const modified = [];
  const struck = [];
  let unchangedCount = 0;

  const matchedFinalIdx = new Set();
  originals.forEach((orig) => {
    const k = norm(orig.description);
    const candidates = finalsByDesc.get(k) || [];
    const match = candidates.find((c) => !matchedFinalIdx.has(c._i));
    if (!match) {
      removed.push(orig);
      return;
    }
    matchedFinalIdx.add(match._i);
    if (match.struck) {
      struck.push({ ...match, original: orig });
      return;
    }
    const qtyChanged = Number(match.quantity) !== Number(orig.quantity);
    const puChanged = Number(match.unit_price) !== Number(orig.unit_price);
    if (qtyChanged || puChanged) {
      modified.push({ original: orig, current: match, qtyChanged, puChanged });
    } else {
      unchangedCount += 1;
    }
  });
  finals.forEach((it, i) => {
    if (!matchedFinalIdx.has(i)) {
      // New line added by admin (not present in originals)
      if (!it.struck) added.push(it);
    }
  });
  const hasChanges = added.length > 0 || removed.length > 0 || modified.length > 0 || struck.length > 0;
  return { added, removed, modified, struck, unchangedCount, hasChanges };
};

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
    printApprovedExpensesDetailed,
    printCompletedExpensesTicket,
    printAllCompletedExpenses,
    printSingleExpenseTicket,
    printExpensePDF,
    openExpenseForEdit,
    deleteExpense,
    updateExpense,
    openReviseModal,
    convertExpenseToPO,
    availableAccounts,
    allocateExpenseToAccount,
  } = ctx;

  // Local state for "rayer une ligne" edits per pending grouped expense.
  // Shape: { [expenseId]: [ { ...item, struck, strike_reason, strike_note } ] }
  const [strikeEdits, setStrikeEdits] = React.useState({});

  // Toggle which list to display for admin_review expenses: 'original' | 'corrected'.
  // Defaults to 'corrected' for admin (their work-in-progress) and 'original' for manager.
  const [reviewViewMode, setReviewViewMode] = React.useState({});
  const getReviewViewMode = (expenseId, defaultMode) =>
    reviewViewMode[expenseId] || defaultMode;
  const setReviewViewModeFor = (expenseId, mode) =>
    setReviewViewMode((prev) => ({ ...prev, [expenseId]: mode }));

  const getEditedItems = (expense) => {
    if (strikeEdits[expense.id]) return strikeEdits[expense.id];
    return (expense.items || []).map((it) => ({
      ...it,
      struck: !!it.struck,
      strike_reason: it.strike_reason || "",
      strike_note: it.strike_note || "",
    }));
  };

  const updateStrikeItem = (expenseId, idx, patch) => {
    setStrikeEdits((prev) => {
      const current = prev[expenseId] ? [...prev[expenseId]] : (
        (expenses.find((e) => e.id === expenseId)?.items || []).map((it) => ({
          ...it,
          struck: !!it.struck,
          strike_reason: it.strike_reason || "",
          strike_note: it.strike_note || "",
        }))
      );
      current[idx] = { ...current[idx], ...patch };
      return { ...prev, [expenseId]: current };
    });
  };

  const handleAdminFirstValidation = (expense) => {
    const adminAmountInput = document.getElementById(`admin-amount-${expense.id}`);
    const editedItems = getEditedItems(expense);
    // First validation: status -> admin_review (stays in admin's profile)
    const payload = { status: "admin_review", approved_by: "Administrateur" };

    if (expense.is_group && editedItems.length > 0) {
      payload.items = editedItems.map((it) => ({
        category: it.category,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        amount: it.amount,
        struck: !!it.struck,
        strike_reason: it.struck ? (it.strike_reason || "autres") : null,
        strike_note: it.struck ? (it.strike_note || "") : null,
      }));
    } else if (adminAmountInput) {
      payload.amount = parseFloat(adminAmountInput.value) || expense.amount;
    }
    updateExpense(expense.id, payload);
  };

  // Direct approval: skip admin_review entirely, go straight to "approved"
  // (use this when the admin has nothing to modify in the manager's list).
  const handleApproveDirectly = (expense) => {
    const editedItems = getEditedItems(expense);
    const hasStruck = expense.is_group && editedItems.some((it) => it.struck);
    const baseMsg = `Valider directement cette demande sans la modifier ?\n\n${expense.description}\n` +
      (expense.is_group ? `(${editedItems.filter(it => !it.struck).length} articles)` : "");
    const warn = hasStruck
      ? "\n\n⚠ Vous avez coché des lignes à rayer — elles seront prises en compte. Pour modifier davantage, utilisez plutôt 'Première validation'."
      : "\n\nLa liste est envoyée à la gérante telle quelle.";
    if (!window.confirm(baseMsg + warn)) return;

    const adminAmountInput = document.getElementById(`admin-amount-${expense.id}`);
    const payload = { status: "approved", approved_by: "Administrateur" };
    if (expense.is_group && editedItems.length > 0) {
      payload.items = editedItems.map((it) => ({
        category: it.category,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        amount: it.amount,
        struck: !!it.struck,
        strike_reason: it.struck ? (it.strike_reason || "autres") : null,
        strike_note: it.struck ? (it.strike_note || "") : null,
      }));
    } else if (adminAmountInput) {
      payload.amount = parseFloat(adminAmountInput.value) || expense.amount;
    }
    updateExpense(expense.id, payload);
  };

  const handleSendToManager = (expense) => {
    if (!window.confirm(`Envoyer cette liste corrigée à la gérante pour achat ?\n\n${expense.description}`)) return;
    const editedItems = getEditedItems(expense);
    const payload = { status: "approved", approved_by: "Administrateur" };
    if (expense.is_group && editedItems.length > 0) {
      payload.items = editedItems.map((it) => ({
        category: it.category,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        amount: it.amount,
        struck: !!it.struck,
        strike_reason: it.struck ? (it.strike_reason || "autres") : null,
        strike_note: it.struck ? (it.strike_note || "") : null,
      }));
    }
    updateExpense(expense.id, payload);
  };

  const handleSaveAdminReviewEdits = (expense) => {
    const editedItems = getEditedItems(expense);
    if (!expense.is_group || editedItems.length === 0) return;
    updateExpense(expense.id, {
      status: "admin_review",
      items: editedItems.map((it) => ({
        category: it.category,
        description: it.description,
        quantity: parseFloat(it.quantity) || 0,
        unit_price: parseFloat(it.unit_price) || 0,
        amount: (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0),
        struck: !!it.struck,
        strike_reason: it.struck ? (it.strike_reason || "autres") : null,
        strike_note: it.struck ? (it.strike_note || "") : null,
      })),
    });
  };

  const updateAdminReviewItem = (expense, idx, patch) => {
    setStrikeEdits((prev) => {
      const current = prev[expense.id] ? [...prev[expense.id]] : (expense.items || []).map((it) => ({ ...it }));
      const next = { ...current[idx], ...patch };
      if ("quantity" in patch || "unit_price" in patch) {
        const q = parseFloat(next.quantity) || 0;
        const p = parseFloat(next.unit_price) || 0;
        next.amount = q * p;
      }
      current[idx] = next;
      return { ...prev, [expense.id]: current };
    });
  };

  const addAdminReviewItem = (expense) => {
    setStrikeEdits((prev) => {
      const current = prev[expense.id] ? [...prev[expense.id]] : (expense.items || []).map((it) => ({ ...it }));
      current.push({
        category: expense.category || "autres",
        description: "",
        quantity: 1,
        unit_price: 0,
        amount: 0,
        struck: false,
        strike_reason: "",
        strike_note: "",
      });
      return { ...prev, [expense.id]: current };
    });
  };

  const removeAdminReviewItem = (expense, idx) => {
    setStrikeEdits((prev) => {
      const current = prev[expense.id] ? [...prev[expense.id]] : (expense.items || []).map((it) => ({ ...it }));
      current.splice(idx, 1);
      return { ...prev, [expense.id]: current };
    });
  };

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
                    {expenses.filter(e => e.status === 'pending' || e.status === 'admin_review').length}
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
                    {expenses.filter(e => e.status === 'approved').length}
                  </Badge>
                </button>
                <button
                  type="button"
                  onClick={() => setAchatsSubView('termines')}
                  data-testid="achats-subtab-termines"
                  className={`px-3 py-2 rounded-t text-sm font-medium transition-colors whitespace-nowrap ${
                    achatsSubView === 'termines'
                      ? 'bg-slate-600 text-white'
                      : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50'
                  }`}
                >
                  <FileText className="w-4 h-4 mr-1 inline" />
                  Achats terminés
                  <Badge className="ml-2 bg-white/20 text-white text-xs">
                    {expenses.filter(e => e.status === 'completed').length}
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

              {/* ALERT: Expense ratio > 40% (gardée car critique) */}
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

              {/* === KPI Cards aérées (regroupement par état) === */}
              {expenses.length > 0 && (() => {
                const sumBy = (statuses) => expenses
                  .filter(e => statuses.includes(e.status))
                  .reduce((s, e) => s + (e.amount || 0), 0);
                const cntBy = (statuses) => expenses.filter(e => statuses.includes(e.status)).length;
                const aTraiterAmount = sumBy(['pending', 'admin_review', 'revision_requested']);
                const aTraiterCount = cntBy(['pending', 'admin_review', 'revision_requested']);
                const validesAmount = sumBy(['approved', 'completed']);
                const validesCount = cntBy(['approved', 'completed']);
                const totalAmount = expenses.reduce((s, e) => s + (e.amount || 0), 0);
                const isAdmin = currentUser?.role === 'admin';

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="achats-kpi-cards">
                    {/* À TRAITER → onglet Validation en cours */}
                    <button
                      type="button"
                      onClick={() => setAchatsSubView('en_cours')}
                      className="text-left group focus:outline-none focus:ring-2 focus:ring-amber-500/60 rounded-lg"
                      data-testid="kpi-a-traiter-card"
                    >
                      <Card className="bg-gradient-to-br from-amber-900/30 to-orange-900/20 border-amber-500/40 hover:border-amber-400 hover:from-amber-900/50 hover:to-orange-900/30 transition-all cursor-pointer h-full">
                        <CardContent className="py-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-amber-300/80 text-xs uppercase tracking-wider font-medium">À traiter</p>
                              <p className="text-amber-300 font-bold text-2xl mt-1" data-testid="kpi-a-traiter-amount">
                                {formatPrice(aTraiterAmount)} <span className="text-base text-amber-400/70">F</span>
                              </p>
                              <p className="text-slate-400 text-xs mt-1">{aTraiterCount} demande{aTraiterCount > 1 ? 's' : ''} • <span className="text-amber-400/80 group-hover:underline">voir →</span></p>
                            </div>
                            <AlertCircle className="w-7 h-7 text-amber-400/60 flex-shrink-0 group-hover:text-amber-300 transition-colors" />
                          </div>
                        </CardContent>
                      </Card>
                    </button>

                    {/* VALIDÉS → onglet Achats validés */}
                    <button
                      type="button"
                      onClick={() => setAchatsSubView('valides')}
                      className="text-left group focus:outline-none focus:ring-2 focus:ring-green-500/60 rounded-lg"
                      data-testid="kpi-valides-card"
                    >
                      <Card className="bg-gradient-to-br from-green-900/30 to-emerald-900/20 border-green-500/40 hover:border-green-400 hover:from-green-900/50 hover:to-emerald-900/30 transition-all cursor-pointer h-full">
                        <CardContent className="py-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-green-300/80 text-xs uppercase tracking-wider font-medium">Validés &amp; terminés</p>
                              <p className="text-green-300 font-bold text-2xl mt-1" data-testid="kpi-valides-amount">
                                {formatPrice(validesAmount)} <span className="text-base text-green-400/70">F</span>
                              </p>
                              <p className="text-slate-400 text-xs mt-1">{validesCount} demande{validesCount > 1 ? 's' : ''} • <span className="text-green-400/80 group-hover:underline">voir →</span></p>
                            </div>
                            <CheckCircle className="w-7 h-7 text-green-400/60 flex-shrink-0 group-hover:text-green-300 transition-colors" />
                          </div>
                        </CardContent>
                      </Card>
                    </button>

                    {/* TOTAL GÉNÉRAL → vue détaillée */}
                    <button
                      type="button"
                      onClick={() => setShowAllExpenses(true)}
                      className="text-left group focus:outline-none focus:ring-2 focus:ring-purple-500/60 rounded-lg"
                      data-testid="kpi-total-card"
                    >
                      <Card className="bg-gradient-to-br from-purple-900/30 to-indigo-900/20 border-purple-500/40 hover:border-purple-400 hover:from-purple-900/50 hover:to-indigo-900/30 transition-all cursor-pointer h-full">
                        <CardContent className="py-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-purple-300/80 text-xs uppercase tracking-wider font-medium">Total général</p>
                              <p className="text-white font-bold text-2xl mt-1" data-testid="kpi-total-amount">
                                {formatPrice(totalAmount)} <span className="text-base text-purple-400/70">F</span>
                              </p>
                              {isAdmin && expenseRatioAlert ? (
                                <p
                                  className={`text-xs mt-1 ${expenseRatioAlert.isOverLimit ? 'text-red-400' : 'text-green-400'}`}
                                  data-testid="expense-ratio-ok"
                                >
                                  Ratio Dép./CA sem. : <span className="font-bold">{expenseRatioAlert.ratio}%</span>
                                  <span className="text-slate-500"> • </span>
                                  <span className="text-purple-400/80 group-hover:underline">détails →</span>
                                </p>
                              ) : (
                                <p className="text-slate-400 text-xs mt-1">{expenses.length} demande{expenses.length > 1 ? 's' : ''} • <span className="text-purple-400/80 group-hover:underline">détails →</span></p>
                              )}
                            </div>
                            <Wallet className="w-7 h-7 text-purple-400/60 flex-shrink-0 group-hover:text-purple-300 transition-colors" />
                          </div>
                        </CardContent>
                      </Card>
                    </button>
                  </div>
                );
              })()}

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
                          {expense.is_group && expense.items && expense.items.length > 0 && (() => {
                            const isAdmin = currentUser?.role === 'admin';
                            const editedItems = isAdmin ? getEditedItems(expense) : expense.items;
                            const keptTotal = editedItems.reduce(
                              (s, it) => s + (it.struck ? 0 : (it.amount || 0)), 0
                            );
                            const struckCount = editedItems.filter((it) => it.struck).length;
                            return (
                            <div className="bg-slate-800/50 rounded p-3 border border-slate-700" data-testid={`pending-items-${expense.id}`}>
                              <p className="text-xs text-slate-400 mb-2 font-semibold flex items-center gap-2">
                                📋 Détails de la liste
                                {isAdmin && (
                                  <span className="text-[10px] text-slate-500 font-normal italic">
                                    — cochez les lignes à rayer puis approuvez
                                  </span>
                                )}
                              </p>
                              <div className="space-y-2">
                                {editedItems.map((item, idx) => {
                                  const struck = !!item.struck;
                                  return (
                                  <div
                                    key={idx}
                                    className={`flex flex-col gap-2 text-sm rounded p-2 transition-colors ${
                                      struck
                                        ? 'bg-red-900/20 border border-red-500/30 opacity-60'
                                        : 'bg-slate-900/30'
                                    }`}
                                    data-testid={`pending-item-${expense.id}-${idx}`}
                                  >
                                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                        {isAdmin && (
                                          <Checkbox
                                            checked={struck}
                                            onCheckedChange={(checked) => updateStrikeItem(expense.id, idx, {
                                              struck: !!checked,
                                              strike_reason: checked ? (item.strike_reason || 'pas_opportun') : '',
                                              strike_note: checked ? item.strike_note : '',
                                            })}
                                            className="border-red-400 data-[state=checked]:bg-red-600 shrink-0"
                                            data-testid={`strike-checkbox-${expense.id}-${idx}`}
                                          />
                                        )}
                                        <span className={`text-slate-500 font-mono shrink-0 ${struck ? 'line-through' : ''}`}>{idx + 1}.</span>
                                        <Badge className={`text-xs shrink-0 ${
                                          item.category === 'cuisine' ? 'bg-green-500/20 text-green-400' :
                                          item.category === 'bar' ? 'bg-orange-500/20 text-orange-400' :
                                          item.category === 'paiement' ? 'bg-blue-500/20 text-blue-400' :
                                          'bg-slate-500/20 text-slate-400'
                                        }`}>{item.category}</Badge>
                                        <span className={`text-white font-medium truncate ${struck ? 'line-through text-slate-400' : ''}`}>{item.description}</span>
                                      </div>
                                      <div className="text-right flex items-center gap-2 shrink-0 pl-7 sm:pl-0">
                                        <span className={`text-slate-400 text-xs ${struck ? 'line-through' : ''}`}>
                                          {item.quantity} × {formatPrice(item.unit_price)} F
                                        </span>
                                        <span className={`font-bold ${struck ? 'line-through text-slate-500' : 'text-amber-400'}`}>{formatPrice(item.amount)} F</span>
                                      </div>
                                    </div>
                                    {/* Strike reason controls (admin + struck) */}
                                    {isAdmin && struck && (
                                      <div className="flex items-center gap-2 pl-7 flex-wrap">
                                        <Ban className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                        <span className="text-[11px] text-red-300">Motif :</span>
                                        <select
                                          value={item.strike_reason || 'pas_opportun'}
                                          onChange={(e) => updateStrikeItem(expense.id, idx, { strike_reason: e.target.value })}
                                          className="bg-slate-800 border border-red-500/40 rounded px-2 py-1 text-xs text-red-200"
                                          data-testid={`strike-reason-${expense.id}-${idx}`}
                                        >
                                          {STRIKE_REASONS.map((r) => (
                                            <option key={r.value} value={r.value}>{r.label}</option>
                                          ))}
                                        </select>
                                        {item.strike_reason === 'autres' && (
                                          <Input
                                            placeholder="Préciser…"
                                            value={item.strike_note || ''}
                                            onChange={(e) => updateStrikeItem(expense.id, idx, { strike_note: e.target.value })}
                                            className="h-7 flex-1 min-w-[140px] bg-slate-800 border-red-500/40 text-xs text-red-200"
                                            data-testid={`strike-note-${expense.id}-${idx}`}
                                          />
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  );
                                })}
                              </div>
                              <div className="border-t border-slate-700 mt-2 pt-2 flex justify-end items-center gap-3">
                                {isAdmin && struckCount > 0 && (
                                  <span className="text-[11px] text-red-300">
                                    {struckCount} ligne{struckCount > 1 ? 's' : ''} rayée{struckCount > 1 ? 's' : ''} — total recalculé
                                  </span>
                                )}
                                <span className="text-slate-400">Total {isAdmin && struckCount > 0 ? 'à approuver' : 'liste'} :</span>
                                <span className="text-amber-400 font-bold ml-2" data-testid={`pending-kept-total-${expense.id}`}>{formatPrice(keptTotal)} F</span>
                              </div>
                            </div>
                            );
                          })()}
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
                              onClick={() => handleAdminFirstValidation(expense)}
                              className="bg-amber-600 hover:bg-amber-700"
                              data-testid={`first-validate-btn-${expense.id}`}
                              title="Sauvegarde dans votre profil — vous pourrez encore modifier avant l'envoi à la gérante"
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Première validation
                            </Button>
                            <Button 
                              size="sm"
                              onClick={() => handleApproveDirectly(expense)}
                              className="bg-green-600 hover:bg-green-700"
                              data-testid={`direct-approve-btn-${expense.id}`}
                              title="Valider directement sans modification — la liste est envoyée à la gérante telle quelle"
                            >
                              <Truck className="w-4 h-4 mr-1" />
                              Valider sans modifier
                            </Button>
                            <Button 
                              size="sm"
                              variant="outline"
                              onClick={() => updateExpense(expense.id, { status: "rejected" })}
                              className="border-red-500/50 text-red-400 hover:bg-red-500/20"
                              data-testid={`reject-btn-${expense.id}`}
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

              {/* ============================================================
                   ADMIN REVIEW SECTION (status='admin_review')
                   - Admin: full inline editing of items, PDF preview, send to manager
                   - Manager: read-only with original list snapshot + locked banner
                  ============================================================ */}
              {achatsSubView === 'en_cours' && expenses.filter(e => e.status === 'admin_review').length > 0 && (
                <Card className={`bg-gradient-to-br ${currentUser?.role === 'admin' ? 'from-amber-900/30 to-orange-900/20 border-amber-500/50' : 'from-slate-900/40 to-slate-800/20 border-slate-600/50'}`} data-testid="admin-review-expenses-card">
                  <CardHeader className="pb-2">
                    <CardTitle className={`flex items-center gap-2 ${currentUser?.role === 'admin' ? 'text-amber-300' : 'text-slate-300'}`}>
                      <Edit2 className="w-5 h-5" />
                      {currentUser?.role === 'admin'
                        ? 'EN COURS DE CORRECTION (votre profil)'
                        : 'EN COURS DE VALIDATION PAR L\'ADMIN'}
                      <Badge className={`ml-2 ${currentUser?.role === 'admin' ? 'bg-amber-500/30 text-amber-200' : 'bg-slate-500/30 text-slate-300'}`}>
                        {expenses.filter(e => e.status === 'admin_review').length}
                      </Badge>
                      {currentUser?.role !== 'admin' && (
                        <Badge className="ml-auto bg-slate-700/40 text-slate-300 text-xs flex items-center gap-1">
                          🔒 Lecture seule
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {expenses.filter(e => e.status === 'admin_review').map(expense => {
                      const isAdmin = currentUser?.role === 'admin';
                      // Manager sees the ORIGINAL snapshot (before admin started correcting)
                      const managerItems = expense.original_items || expense.items || [];
                      const managerAmount = expense.original_amount || expense.amount;
                      const correctedItems = isAdmin ? getEditedItems(expense) : (expense.items || []);
                      const correctedAmount = correctedItems.reduce((s, it) => s + (it.struck ? 0 : (it.amount || 0)), 0);
                      // Default view: admin sees their corrections, gérante sees the original
                      const viewMode = getReviewViewMode(expense.id, isAdmin ? 'corrected' : 'original');
                      const showOriginal = viewMode === 'original';
                      const hasOriginalSnapshot = !!expense.original_items;
                      const editedItems = isAdmin ? correctedItems : managerItems;
                      const keptTotal = showOriginal ? managerAmount : correctedAmount;
                      const struckCount = isAdmin ? correctedItems.filter(it => it.struck).length : 0;
                      return (
                        <div key={expense.id} className={`rounded-lg p-4 border ${isAdmin ? 'bg-amber-900/15 border-amber-500/30' : 'bg-slate-800/40 border-slate-600/40'}`}>
                          {/* Header */}
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {expense.is_group ? (
                                  <Badge className="text-xs bg-indigo-500/30 text-indigo-300">
                                    📦 Liste ({(isAdmin ? editedItems : managerItems).length} articles)
                                  </Badge>
                                ) : (
                                  <Badge className="text-xs bg-slate-500/20 text-slate-400">{expense.category}</Badge>
                                )}
                                <span className="text-white font-bold">{expense.description}</span>
                                {!isAdmin && (
                                  <Badge className="text-xs bg-slate-700/40 text-slate-300 border border-slate-500/40 flex items-center gap-1">
                                    🔒 En cours de validation par l'admin
                                  </Badge>
                                )}
                              </div>
                              <p className="text-slate-400 text-sm mt-1">
                                Demandé par : {expense.requested_by} • {new Date(expense.created_at).toLocaleDateString('fr-FR')}
                                {expense.admin_review_at && (
                                  <> • <span className="text-amber-300">Validation initiale : {new Date(expense.admin_review_at).toLocaleString('fr-FR')}</span></>
                                )}
                              </p>
                            </div>
                          </div>

                          {/* === Toggle: Liste d'origine / Liste corrigée === */}
                          {expense.is_group && hasOriginalSnapshot && (
                            <div className="mt-3 flex items-center gap-1 bg-slate-900/40 border border-slate-700 rounded p-1 w-fit" data-testid={`review-view-toggle-${expense.id}`}>
                              <button
                                type="button"
                                onClick={() => setReviewViewModeFor(expense.id, 'original')}
                                className={`px-3 py-1 text-xs rounded transition-colors ${
                                  showOriginal
                                    ? 'bg-slate-600 text-white font-semibold'
                                    : 'text-slate-400 hover:text-slate-200'
                                }`}
                                data-testid={`review-view-original-${expense.id}`}
                              >
                                📋 Liste d'origine
                              </button>
                              <button
                                type="button"
                                onClick={() => setReviewViewModeFor(expense.id, 'corrected')}
                                className={`px-3 py-1 text-xs rounded transition-colors ${
                                  !showOriginal
                                    ? 'bg-amber-600 text-white font-semibold'
                                    : 'text-slate-400 hover:text-slate-200'
                                }`}
                                data-testid={`review-view-corrected-${expense.id}`}
                              >
                                ✏️ Liste corrigée
                              </button>
                            </div>
                          )}

                          {/* === ADMIN: full inline editor (only when 'corrected' view) === */}
                          {isAdmin && expense.is_group && !showOriginal && (
                            <div className="mt-3 bg-slate-900/40 rounded p-3 border border-amber-500/20" data-testid={`admin-review-editor-${expense.id}`}>
                              <p className="text-xs text-amber-200 mb-2 font-semibold">
                                ✏️ Édition libre — vous pouvez modifier les quantités, prix, ajouter/retirer des lignes ou raturer.
                              </p>
                              <div className="space-y-2">
                                {editedItems.map((item, idx) => {
                                  const struck = !!item.struck;
                                  return (
                                    <div
                                      key={idx}
                                      className={`flex flex-col gap-2 rounded p-2 transition-colors ${
                                        struck ? 'bg-red-900/20 border border-red-500/30 opacity-70' : 'bg-slate-800/50 border border-slate-700'
                                      }`}
                                      data-testid={`admin-review-item-${expense.id}-${idx}`}
                                    >
                                      {/* MOBILE-FRIENDLY: row 1 = top controls; row 2 = numeric controls */}
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <Checkbox
                                          checked={struck}
                                          onCheckedChange={(checked) => updateAdminReviewItem(expense, idx, {
                                            struck: !!checked,
                                            strike_reason: checked ? (item.strike_reason || 'pas_opportun') : '',
                                            strike_note: checked ? item.strike_note : '',
                                          })}
                                          className="border-red-400 data-[state=checked]:bg-red-600 shrink-0"
                                          data-testid={`admin-review-strike-${expense.id}-${idx}`}
                                        />
                                        <span className={`text-slate-500 font-mono text-xs shrink-0 ${struck ? 'line-through' : ''}`}>{idx + 1}.</span>
                                        <Input
                                          value={item.description}
                                          onChange={(e) => updateAdminReviewItem(expense, idx, { description: e.target.value })}
                                          placeholder="Description"
                                          className={`flex-1 min-w-[120px] h-8 bg-slate-900 border-slate-600 text-white text-sm ${struck ? 'line-through' : ''}`}
                                          data-testid={`admin-review-desc-${expense.id}-${idx}`}
                                        />
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => removeAdminReviewItem(expense, idx)}
                                          className="h-8 w-8 p-0 text-red-400 hover:bg-red-500/20 shrink-0"
                                          title="Supprimer la ligne"
                                          data-testid={`admin-review-remove-${expense.id}-${idx}`}
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </div>
                                      <div className="flex items-center gap-2 flex-wrap pl-7">
                                        <select
                                          value={item.category}
                                          onChange={(e) => updateAdminReviewItem(expense, idx, { category: e.target.value })}
                                          className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white shrink-0"
                                        >
                                          <option value="cuisine">🍳 Cuisine</option>
                                          <option value="bar">🍹 Bar</option>
                                          <option value="paiement">💳 Paiement</option>
                                          <option value="autres">📦 Autres</option>
                                        </select>
                                        <div className="flex items-center gap-1">
                                          <span className="text-slate-500 text-[10px]">Qté</span>
                                          <Input
                                            type="number"
                                            step="any"
                                            value={item.quantity}
                                            onChange={(e) => updateAdminReviewItem(expense, idx, { quantity: e.target.value })}
                                            placeholder="0"
                                            className="w-16 h-8 bg-slate-900 border-slate-600 text-white text-sm text-right"
                                            data-testid={`admin-review-qty-${expense.id}-${idx}`}
                                          />
                                        </div>
                                        <span className="text-slate-500 text-xs">×</span>
                                        <div className="flex items-center gap-1">
                                          <span className="text-slate-500 text-[10px]">PU</span>
                                          <Input
                                            type="number"
                                            step="any"
                                            value={item.unit_price}
                                            onChange={(e) => updateAdminReviewItem(expense, idx, { unit_price: e.target.value })}
                                            placeholder="0"
                                            className="w-24 h-8 bg-slate-900 border-slate-600 text-white text-sm text-right"
                                            data-testid={`admin-review-pu-${expense.id}-${idx}`}
                                          />
                                        </div>
                                        <span className="text-slate-500 text-xs">=</span>
                                        <span className={`font-bold text-sm ml-auto ${struck ? 'line-through text-slate-500' : 'text-amber-400'}`}>
                                          {formatPrice((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0))} F
                                        </span>
                                      </div>
                                      {struck && (
                                        <div className="flex items-center gap-2 pl-7 flex-wrap">
                                          <Ban className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                          <span className="text-[11px] text-red-300">Motif :</span>
                                          <select
                                            value={item.strike_reason || 'pas_opportun'}
                                            onChange={(e) => updateAdminReviewItem(expense, idx, { strike_reason: e.target.value })}
                                            className="bg-slate-900 border border-red-500/40 rounded px-2 py-1 text-xs text-red-200"
                                          >
                                            {STRIKE_REASONS.map((r) => (
                                              <option key={r.value} value={r.value}>{r.label}</option>
                                            ))}
                                          </select>
                                          {item.strike_reason === 'autres' && (
                                            <Input
                                              placeholder="Préciser…"
                                              value={item.strike_note || ''}
                                              onChange={(e) => updateAdminReviewItem(expense, idx, { strike_note: e.target.value })}
                                              className="h-7 flex-1 min-w-[140px] bg-slate-900 border-red-500/40 text-xs text-red-200"
                                            />
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-amber-500/20 pt-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => addAdminReviewItem(expense)}
                                  className="border-amber-500/50 text-amber-300 hover:bg-amber-500/20 h-8"
                                  data-testid={`admin-review-add-${expense.id}`}
                                >
                                  <Plus className="w-4 h-4 mr-1" />
                                  Ajouter une ligne
                                </Button>
                                <div className="flex items-center gap-3">
                                  {struckCount > 0 && (
                                    <span className="text-[11px] text-red-300">
                                      {struckCount} ligne{struckCount > 1 ? 's' : ''} rayée{struckCount > 1 ? 's' : ''}
                                    </span>
                                  )}
                                  <span className="text-slate-300 text-sm">Total provisoire :</span>
                                  <span className="text-amber-300 font-bold text-lg" data-testid={`admin-review-total-${expense.id}`}>
                                    {formatPrice(keptTotal)} F
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* === READ-ONLY VIEW: shown to manager always, and to admin when 'original' is selected === */}
                          {expense.is_group && (!isAdmin || showOriginal) && (
                            <div className={`mt-3 rounded p-3 border ${showOriginal ? 'bg-slate-900/40 border-slate-600/40' : 'bg-amber-900/10 border-amber-500/30'}`}
                                 data-testid={`review-readonly-list-${expense.id}`}>
                              <p className={`text-xs mb-2 italic ${showOriginal ? 'text-slate-400' : 'text-amber-200'}`}>
                                {showOriginal
                                  ? "Liste d'origine (telle que soumise par la gérante)"
                                  : "Liste corrigée par l'admin (en cours de validation)"}
                                  :
                              </p>
                              <div className="space-y-1">
                                {(showOriginal ? managerItems : (expense.items || [])).map((item, idx) => {
                                  const struck = !!item.struck;
                                  return (
                                    <div key={idx} className={`flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-sm rounded p-2 ${
                                      struck ? 'bg-red-900/15 border border-red-500/20 opacity-70' : 'bg-slate-800/40'
                                    }`}>
                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <span className={`text-slate-500 font-mono text-xs shrink-0 ${struck ? 'line-through' : ''}`}>{idx + 1}.</span>
                                        <Badge className={`text-[10px] shrink-0 ${
                                          item.category === 'cuisine' ? 'bg-green-500/10 text-green-400' :
                                          item.category === 'bar' ? 'bg-orange-500/10 text-orange-400' :
                                          item.category === 'paiement' ? 'bg-blue-500/10 text-blue-400' :
                                          'bg-slate-500/10 text-slate-400'
                                        }`}>{item.category}</Badge>
                                        <span className={`text-slate-200 truncate ${struck ? 'line-through text-slate-400' : ''}`}>{item.description}</span>
                                      </div>
                                      <div className="text-right text-xs shrink-0 pl-7 sm:pl-0">
                                        <span className={`text-slate-400 ${struck ? 'line-through' : ''}`}>{item.quantity} × {formatPrice(item.unit_price)} = </span>
                                        <span className={`font-bold ${struck ? 'line-through text-slate-500' : 'text-slate-200'}`}>{formatPrice(item.amount)} F</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="mt-2 pt-2 border-t border-slate-700 flex flex-wrap justify-end items-center gap-2">
                                <span className="text-slate-400 text-sm">
                                  {showOriginal ? "Total d'origine :" : "Total corrigé :"}
                                </span>
                                <span className={`font-bold ${showOriginal ? 'text-slate-200' : 'text-amber-300'}`}>
                                  {formatPrice(showOriginal ? managerAmount : correctedAmount)} F
                                </span>
                              </div>
                            </div>
                          )}

                          {/* === ACTIONS === */}
                          {isAdmin && (
                            <div className="mt-3 flex gap-2 flex-wrap">
                              <Button
                                size="sm"
                                onClick={() => handleSaveAdminReviewEdits(expense)}
                                className="bg-slate-600 hover:bg-slate-700"
                                data-testid={`admin-review-save-${expense.id}`}
                              >
                                <Edit2 className="w-4 h-4 mr-1" />
                                Enregistrer modifications
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  // Build a temp expense reflecting current edits for the PDF preview.
                                  const editedSnapshot = {
                                    ...expense,
                                    items: getEditedItems(expense).map((it) => ({
                                      ...it,
                                      amount: (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0),
                                    })),
                                  };
                                  printExpensePDF(editedSnapshot);
                                }}
                                className="border-blue-500/50 text-blue-300 hover:bg-blue-500/20"
                                data-testid={`admin-review-preview-${expense.id}`}
                              >
                                <FileText className="w-4 h-4 mr-1" />
                                Aperçu PDF
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleSendToManager(expense)}
                                className="bg-green-600 hover:bg-green-700"
                                data-testid={`admin-review-send-${expense.id}`}
                              >
                                <Truck className="w-4 h-4 mr-1" />
                                Envoyer à la gérante
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateExpense(expense.id, { status: "pending" })}
                                className="border-purple-500/50 text-purple-300 hover:bg-purple-500/20"
                                data-testid={`admin-review-back-${expense.id}`}
                                title="Revenir à l'étape précédente (annule la première validation)"
                              >
                                <X className="w-4 h-4 mr-1" />
                                Annuler validation
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
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
                      <div className="flex gap-2 flex-wrap">
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
                        <Button
                          size="sm"
                          onClick={printApprovedExpensesDetailed}
                          className="bg-indigo-600 hover:bg-indigo-700"
                          data-testid="print-approved-detailed-btn"
                        >
                          <FileText className="w-4 h-4 mr-1" />
                          Détail par achat
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
                                {expense.is_group ? (() => {
                                  const visible = (expense.items || []).filter(it => !it.struck).length;
                                  const struck = (expense.items || []).filter(it => it.struck).length;
                                  return (
                                    <>
                                      <Badge className="text-xs bg-indigo-500/30 text-indigo-300">📦 Liste ({visible} articles)</Badge>
                                      {struck > 0 && currentUser?.role === 'admin' && (
                                        <Badge className="text-xs bg-red-500/20 text-red-300 border border-red-500/40" data-testid={`struck-count-${expense.id}`}>
                                          🚫 {struck} ligne{struck > 1 ? 's' : ''} rayée{struck > 1 ? 's' : ''} (masquée{struck > 1 ? 's' : ''} à l'impression)
                                        </Badge>
                                      )}
                                    </>
                                  );
                                })() : (
                                  <Badge className={`text-xs ${
                                    expense.category === 'cuisine' ? 'bg-green-500/20 text-green-400' :
                                    expense.category === 'bar' ? 'bg-orange-500/20 text-orange-400' :
                                    expense.category === 'paiement' ? 'bg-blue-500/20 text-blue-400' :
                                    'bg-slate-500/20 text-slate-400'
                                  }`}>{expense.category}</Badge>
                                )}
                                <span className="text-white font-medium">{expense.description}</span>
                                {expense.category === 'paiement' && expense.is_paid && (
                                  <Badge className="text-xs bg-amber-500/30 text-amber-300 border border-amber-500/50" data-testid={`paid-badge-${expense.id}`}>
                                    💰 Payé
                                  </Badge>
                                )}
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
                              {/* === Trace d'audit (corrections admin) === */}
                              {expense.is_group && expense.original_items && (() => {
                                const audit = computeAuditTrail(expense);
                                if (!audit.hasChanges) return null;
                                const showDetails = currentUser?.role === 'admin';
                                return (
                                  <details className="mt-2 bg-slate-800/40 border border-slate-600/40 rounded p-2" data-testid={`audit-trail-${expense.id}`}>
                                    <summary className="cursor-pointer text-xs text-amber-200 font-semibold flex items-center gap-2">
                                      📜 Liste corrigée par {expense.approved_by || 'Admin'}
                                      <span className="text-slate-400 font-normal">
                                        ({audit.added.length > 0 && `+${audit.added.length} ajoutée${audit.added.length > 1 ? 's' : ''}`}
                                        {audit.removed.length > 0 && (audit.added.length ? ', ' : '') + `−${audit.removed.length} supprimée${audit.removed.length > 1 ? 's' : ''}`}
                                        {audit.struck.length > 0 && ((audit.added.length || audit.removed.length) ? ', ' : '') + `${audit.struck.length} rayée${audit.struck.length > 1 ? 's' : ''}`}
                                        {audit.modified.length > 0 && ((audit.added.length || audit.removed.length || audit.struck.length) ? ', ' : '') + `${audit.modified.length} modifiée${audit.modified.length > 1 ? 's' : ''}`})
                                      </span>
                                    </summary>
                                    <div className="mt-2 space-y-1.5 text-xs">
                                      {audit.added.map((it, i) => (
                                        <div key={`a-${i}`} className="flex items-start gap-2 bg-emerald-900/20 border border-emerald-500/30 rounded px-2 py-1">
                                          <span className="text-emerald-400 font-bold shrink-0">＋</span>
                                          <span className="text-emerald-200">
                                            <strong>Ajoutée :</strong> {it.description}
                                            <span className="text-slate-400"> — {it.quantity} × {formatPrice(it.unit_price)} F = {formatPrice(it.amount)} F</span>
                                          </span>
                                        </div>
                                      ))}
                                      {audit.removed.map((it, i) => (
                                        <div key={`r-${i}`} className="flex items-start gap-2 bg-rose-900/20 border border-rose-500/30 rounded px-2 py-1">
                                          <span className="text-rose-400 font-bold shrink-0">−</span>
                                          <span className="text-rose-200">
                                            <strong>Supprimée :</strong> {it.description}
                                            <span className="text-slate-400"> — {it.quantity} × {formatPrice(it.unit_price)} F = {formatPrice(it.amount)} F</span>
                                          </span>
                                        </div>
                                      ))}
                                      {audit.struck.map((it, i) => (
                                        <div key={`s-${i}`} className="flex items-start gap-2 bg-red-900/20 border border-red-500/30 rounded px-2 py-1">
                                          <span className="text-red-400 font-bold shrink-0">🚫</span>
                                          <span className="text-red-200">
                                            <strong>Rayée :</strong> {it.description}
                                            {showDetails && (
                                              <span className="text-slate-400"> — motif : <em>{STRIKE_LABEL[it.strike_reason] || it.strike_reason || '—'}</em>{it.strike_note ? ` (${it.strike_note})` : ''}</span>
                                            )}
                                          </span>
                                        </div>
                                      ))}
                                      {audit.modified.map((m, i) => (
                                        <div key={`m-${i}`} className="flex items-start gap-2 bg-blue-900/20 border border-blue-500/30 rounded px-2 py-1">
                                          <span className="text-blue-400 font-bold shrink-0">✎</span>
                                          <span className="text-blue-200">
                                            <strong>Modifiée :</strong> {m.current.description}
                                            <span className="text-slate-400"> — </span>
                                            {m.qtyChanged && (
                                              <span className="text-slate-300">qté <s className="text-slate-500">{m.original.quantity}</s> → <strong>{m.current.quantity}</strong></span>
                                            )}
                                            {m.qtyChanged && m.puChanged && <span className="text-slate-500"> · </span>}
                                            {m.puChanged && (
                                              <span className="text-slate-300">PU <s className="text-slate-500">{formatPrice(m.original.unit_price)} F</s> → <strong>{formatPrice(m.current.unit_price)} F</strong></span>
                                            )}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </details>
                                );
                              })()}
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
                              {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && expense.category === 'paiement' && (
                                <Button
                                  size="sm"
                                  variant={expense.is_paid ? "default" : "outline"}
                                  onClick={() => {
                                    const willPay = !expense.is_paid;
                                    const msg = willPay
                                      ? `Confirmer le paiement de :\n\n${expense.description}\nMontant : ${formatPrice(expense.amount)} F`
                                      : `Marquer cette prestation comme NON payée ?`;
                                    if (window.confirm(msg)) {
                                      updateExpense(expense.id, {
                                        is_paid: willPay,
                                        paid_at: willPay ? new Date().toISOString() : null,
                                        paid_by: willPay ? (currentUser?.username || currentUser?.role || '') : null,
                                      });
                                    }
                                  }}
                                  className={expense.is_paid
                                    ? "bg-amber-600 hover:bg-amber-700 text-white"
                                    : "border-amber-500/50 text-amber-400 hover:bg-amber-500/20"}
                                  data-testid={`mark-paid-${expense.id}`}
                                  title={expense.is_paid ? `Payé le ${expense.paid_at?.slice(0,10) || '—'} par ${expense.paid_by || '—'}` : "Marquer la prestation comme payée"}
                                >
                                  <Wallet className="w-4 h-4 mr-1" />
                                  {expense.is_paid ? "Payé ✓" : "Payé"}
                                </Button>
                              )}
                              {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
                                <Button 
                                  size="sm"
                                  onClick={() => {
                                    if (window.confirm(`Confirmez-vous avoir bien payé/réceptionné cet achat ?\n\n${expense.description}\nMontant : ${formatPrice(expense.amount)} F\n\nLe stock sera automatiquement mis à jour.`)) {
                                      updateExpense(expense.id, { status: "completed" });
                                    }
                                  }}
                                  className="bg-emerald-600 hover:bg-emerald-700"
                                  data-testid={`mark-completed-${expense.id}`}
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
                          {/* Funding source control (admin only) — also visible when no account exists yet */}
                          {currentUser?.role === 'admin' && (
                            <div className="mt-2 flex items-center gap-2 bg-cyan-900/10 border border-cyan-500/20 rounded px-2 py-1.5 flex-wrap">
                              <span className="text-[11px] text-cyan-300 shrink-0">💰 Payé depuis :</span>
                              <select
                                value={expense.funded_by_account_id || ""}
                                onChange={(e) => allocateExpenseToAccount(expense, e.target.value, expense.funded_affects_ca !== false)}
                                className="flex-1 bg-slate-800/60 border border-slate-600 text-white text-xs rounded px-2 py-1 min-w-0"
                                data-testid={`funding-source-${expense.id}`}
                              >
                                <option value="">Recettes de la caisse</option>
                                {availableAccounts && availableAccounts.map((acc) => (
                                  <option key={acc.id} value={acc.id}>
                                    📒 {acc.name} — Dispo : {formatPrice(acc.balance_available || 0)} F
                                  </option>
                                ))}
                                <option value="__create_new__" className="text-emerald-300 font-semibold">
                                  ➕ Créer un nouveau compte courant ({formatPrice(expense.amount)} F)
                                </option>
                              </select>
                              {expense.funded_by_account_name && (
                                <Badge className="bg-cyan-500/30 text-cyan-200 text-[10px] shrink-0">
                                  imputé : {expense.funded_by_account_name}
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

              {/* Completed expenses (Achats terminés — dedicated sub-menu) */}
              {achatsSubView === 'termines' && (
                expenses.filter(e => e.status === 'completed').length > 0 ? (
                  <Card className="bg-gradient-to-br from-slate-800/40 to-slate-900/30 border-slate-600/50" data-testid="completed-expenses-card">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-slate-200 flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <FileText className="w-5 h-5" />
                          Achats terminés
                          <Badge className="bg-slate-500/30 text-slate-200 ml-2">
                            {expenses.filter(e => e.status === 'completed').length}
                          </Badge>
                          <Badge className="bg-emerald-500/30 text-emerald-300">
                            Total: {formatPrice(expenses.filter(e => e.status === 'completed').reduce((s, e) => s + (e.amount || 0), 0))} F
                          </Badge>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={printCompletedExpensesTicket}
                            className="border-amber-500/50 text-amber-400 hover:bg-amber-500/20"
                            data-testid="print-completed-ticket-btn"
                          >
                            <Receipt className="w-4 h-4 mr-1" />
                            Ticket 80mm
                          </Button>
                          <Button
                            size="sm"
                            onClick={printAllCompletedExpenses}
                            className="bg-slate-600 hover:bg-slate-700"
                            data-testid="print-completed-a4-btn"
                          >
                            <Printer className="w-4 h-4 mr-1" />
                            Imprimer A4
                          </Button>
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
                      {expenses.filter(e => e.status === 'completed').map(expense => (
                        <div key={expense.id} className="bg-slate-700/20 rounded-lg p-3 border border-slate-600/30" data-testid={`completed-expense-${expense.id}`}>
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
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
                                {!expense.is_group && (
                                  <div className="text-slate-300 text-sm mt-1">
                                    <span className="text-slate-400">Qté:</span> <span className="font-bold">{expense.quantity || 1}</span>
                                    <span className="mx-2">×</span>
                                    <span className="text-slate-400">PU:</span> <span className="font-bold">{formatPrice(expense.unit_price || expense.amount)} F</span>
                                  </div>
                                )}
                                <p className="text-emerald-400 font-bold text-lg">{formatPrice(expense.amount)} F</p>
                                {expense.supplier && <p className="text-slate-500 text-sm">Fournisseur: {expense.supplier}</p>}
                                <p className="text-slate-500 text-xs">Terminé le {expense.completed_at?.slice(0, 10) || '—'}</p>
                              </div>
                              <div className="flex gap-2 flex-wrap shrink-0">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => printSingleExpenseTicket(expense)}
                                  className="border-amber-500/50 text-amber-400 hover:bg-amber-500/20"
                                  data-testid={`print-ticket-${expense.id}`}
                                >
                                  <Receipt className="w-4 h-4 mr-1" />
                                  Ticket 80mm
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => printExpensePDF(expense)}
                                  className="border-slate-500/50 text-slate-300 hover:bg-slate-500/20"
                                  data-testid={`print-pdf-${expense.id}`}
                                >
                                  <Printer className="w-4 h-4 mr-1" />
                                  PDF
                                </Button>
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
                            {/* Funding source control (admin only) — also on completed */}
                            {currentUser?.role === 'admin' && (
                              <div className="mt-2 flex items-center gap-2 bg-cyan-900/10 border border-cyan-500/20 rounded px-2 py-1.5 flex-wrap">
                                <span className="text-[11px] text-cyan-300 shrink-0">💰 Payé depuis :</span>
                                <select
                                  value={expense.funded_by_account_id || ""}
                                  onChange={(e) => allocateExpenseToAccount(expense, e.target.value, expense.funded_affects_ca !== false)}
                                  className="flex-1 min-w-[160px] bg-slate-800/60 border border-slate-600 text-white text-xs rounded px-2 py-1"
                                  data-testid={`funding-source-completed-${expense.id}`}
                                >
                                  <option value="">Recettes de la caisse</option>
                                  {availableAccounts && availableAccounts.map((acc) => (
                                    <option key={acc.id} value={acc.id}>
                                      📒 {acc.name} — Dispo : {formatPrice(acc.balance_available || 0)} F
                                    </option>
                                  ))}
                                  <option value="__create_new__" className="text-emerald-300 font-semibold">
                                    ➕ Créer un nouveau compte courant ({formatPrice(expense.amount)} F)
                                  </option>
                                </select>
                                {expense.funded_by_account_name && (
                                  <Badge className="bg-cyan-500/30 text-cyan-200 text-[10px] shrink-0">
                                    imputé : {expense.funded_by_account_name}
                                  </Badge>
                                )}
                              </div>
                            )}
                            {expense.is_group && expense.items && expense.items.length > 0 && (
                              <div className="bg-slate-800/40 rounded p-2 mt-1">
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
                                        <span className="text-emerald-400 font-bold">{formatPrice(item.amount)} F</span>
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
                ) : (
                  <Card className="bg-slate-800/30 border-slate-700">
                    <CardContent className="py-12 text-center">
                      <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                      <p className="text-slate-500">Aucun achat terminé</p>
                    </CardContent>
                  </Card>
                )
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
