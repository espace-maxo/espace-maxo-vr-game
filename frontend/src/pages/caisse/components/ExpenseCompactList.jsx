/**
 * ExpenseCompactList — Vue "lignes avec tiret" pour l'onglet Achats.
 *
 * Affiche tous les achats visibles (selon le sous-onglet courant) groupés par
 * statut, sous forme de lignes compactes. Au clic sur une ligne, ouvre un
 * Dialog avec le détail complet + les actions adaptées au statut.
 *
 * Ce composant est rendu À LA PLACE des grandes cards quand l'utilisateur
 * active "Vue : lignes" depuis la toolbar.
 */
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  CheckCircle,
  Edit2,
  Trash2,
  Printer,
  X,
  Truck,
  Receipt,
  FileText,
  PackagePlus,
  Eye,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

const formatPrice = (p) => new Intl.NumberFormat("fr-FR").format(p || 0);

const STATUS_GROUPS = [
  {
    key: "pending",
    label: "À VALIDER",
    color: "purple",
    statuses: ["pending"],
    icon: AlertCircle,
  },
  {
    key: "admin_review",
    label: "EN COURS DE VALIDATION (admin)",
    color: "amber",
    statuses: ["admin_review"],
    icon: Eye,
  },
  {
    key: "revision_requested",
    label: "À RÉVISER",
    color: "orange",
    statuses: ["revision_requested"],
    icon: Edit2,
  },
  {
    key: "approved",
    label: "APPROUVÉS",
    color: "green",
    statuses: ["approved"],
    icon: CheckCircle,
  },
  {
    key: "completed",
    label: "TERMINÉS",
    color: "slate",
    statuses: ["completed"],
    icon: FileText,
  },
];

const COLOR_CLASSES = {
  purple: { border: "border-purple-500/40", text: "text-purple-300", bg: "from-purple-900/30 to-indigo-900/20" },
  amber: { border: "border-amber-500/40", text: "text-amber-300", bg: "from-amber-900/30 to-orange-900/20" },
  orange: { border: "border-orange-500/40", text: "text-orange-300", bg: "from-orange-900/30 to-rose-900/20" },
  green: { border: "border-green-500/40", text: "text-green-300", bg: "from-green-900/30 to-emerald-900/20" },
  slate: { border: "border-slate-600/50", text: "text-slate-200", bg: "from-slate-800/40 to-slate-900/30" },
};

const ExpenseCompactList = ({
  expenses,
  currentUser,
  achatsSubView,
  matchesAuthorFilter,
  isFinished,
  sortExpenses,
  // Actions
  updateExpense,
  deleteExpense,
  openExpenseForEdit,
  openReviseModal,
  convertExpenseToPO,
  printSingleExpenseTicket,
  printExpensePDF,
  allocateExpenseToAccount,
  availableAccounts,
  receiveExpenseStock,
}) => {
  const [selected, setSelected] = useState(null);
  const isAdmin = currentUser?.role === "admin";

  // Filtre principal : selon sous-onglet
  let visible = expenses;
  if (achatsSubView === "en_cours") {
    visible = expenses.filter(
      (e) =>
        (e.status === "pending" || e.status === "admin_review") &&
        (isAdmin ? matchesAuthorFilter?.(e) ?? true : true)
    );
  } else if (achatsSubView === "a_reviser") {
    visible = expenses.filter((e) => e.status === "revision_requested");
  } else if (achatsSubView === "valides") {
    // Validés + Terminés (pour Admin), Approuvés seuls pour Manager
    visible = expenses.filter(
      (e) => e.status === "approved" || (isAdmin && isFinished?.(e))
    );
  } else if (achatsSubView === "mes_demandes") {
    const me = currentUser?.full_name || currentUser?.username || "";
    visible = expenses.filter(
      (e) => e.requested_by === me || e.requested_by === currentUser?.username
    );
  } else if (achatsSubView === "achete") {
    visible = expenses.filter((e) => e.source === "appro_manager" && e.payment_mode);
  }

  // Groupement par statut
  const grouped = STATUS_GROUPS.map((g) => {
    const items = visible.filter((e) => {
      if (g.key === "completed") return isFinished?.(e);
      return g.statuses.includes(e.status);
    });
    return { ...g, items: sortExpenses ? sortExpenses(items) : items };
  }).filter((g) => g.items.length > 0);

  const formatDateLine = (e) => {
    const raw = e?.completed_at || e?.approved_at || e?.created_at || "";
    try { return raw ? format(parseISO(raw), "dd/MM", { locale: fr }) : ""; }
    catch { return ""; }
  };

  if (visible.length === 0) {
    return (
      <Card className="bg-slate-800/30 border-slate-700">
        <CardContent className="py-8 text-center text-slate-500 text-sm">
          Aucune demande dans cette vue.
        </CardContent>
      </Card>
    );
  }

  const selectedExpense = selected ? visible.find((e) => e.id === selected) : null;
  const colorBySelected = selectedExpense
    ? STATUS_GROUPS.find((g) => g.key === "completed" && isFinished?.(selectedExpense))
      || STATUS_GROUPS.find((g) => g.statuses.includes(selectedExpense.status))
    : null;

  return (
    <>
      <div className="space-y-2" data-testid="expense-compact-list">
        {grouped.map((g) => {
          const c = COLOR_CLASSES[g.color];
          const Icon = g.icon;
          const total = g.items.reduce((s, e) => s + (e.amount || 0), 0);
          return (
            <Card
              key={g.key}
              className={`bg-gradient-to-br ${c.bg} ${c.border}`}
            >
              <CardHeader className="pb-1 pt-3">
                <CardTitle className={`${c.text} text-sm flex items-center justify-between gap-2`}>
                  <span className="flex items-center gap-2">
                    <Icon className="w-4 h-4" /> {g.label}
                    <Badge className="bg-white/10 text-white text-[10px]">{g.items.length}</Badge>
                  </span>
                  <span className="text-[11px] font-bold text-white/90">
                    {formatPrice(total)} F
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-3 space-y-0.5">
                {g.items.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setSelected(e.id)}
                    className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 transition-colors text-sm border border-transparent hover:border-white/10 group"
                    data-testid={`expense-row-${e.id}`}
                  >
                    <span className="text-slate-500 group-hover:text-amber-400 select-none">—</span>
                    <span className="text-slate-200 flex-1 truncate">
                      {e.description || "(sans description)"}
                    </span>
                    {e.is_group && e.items?.length > 0 && (
                      <span className="text-[10px] text-indigo-300 bg-indigo-500/20 border border-indigo-500/30 rounded px-1.5 py-0.5 whitespace-nowrap">
                        📦 {e.items.length}
                      </span>
                    )}
                    {e.assigned_date && (
                      <span className="text-[10px] text-purple-200 bg-purple-500/20 border border-purple-500/30 rounded px-1.5 py-0.5 whitespace-nowrap">
                        📌 {e.assignment_precision === 'month' ? e.assigned_date.slice(0,7) : e.assigned_date}
                      </span>
                    )}
                    <span className="text-amber-400 font-bold whitespace-nowrap">
                      {formatPrice(e.amount)} F
                    </span>
                    <span className="text-slate-500 text-xs whitespace-nowrap w-10 text-right">
                      {formatDateLine(e)}
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selectedExpense} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-3xl max-h-[92vh] overflow-y-auto">
          {selectedExpense && (() => {
            const e = selectedExpense;
            const finished = isFinished?.(e);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className={`${colorBySelected ? COLOR_CLASSES[colorBySelected.color].text : 'text-amber-400'} text-lg flex items-center gap-2`}>
                    {e.is_group ? '📦' : '🛒'} {e.description || "Détail de l'achat"}
                  </DialogTitle>
                  <DialogDescription className="text-slate-400 text-xs flex flex-wrap gap-x-3 gap-y-1">
                    <span>Statut : <strong className="text-white">{finished ? 'terminé' : (e.status || '—')}</strong></span>
                    {e.category && <span>Catégorie : <strong className="text-white">{e.category}</strong></span>}
                    {e.requested_by && <span>Demandé par : <strong className="text-white">{e.requested_by}</strong></span>}
                    {e.created_at && (() => {
                      try { return <span>Créé le : <strong className="text-white">{format(parseISO(e.created_at), "dd/MM/yyyy HH:mm", { locale: fr })}</strong></span>; }
                      catch { return null; }
                    })()}
                    {e.completed_at && (() => {
                      try { return <span>Terminé le : <strong className="text-white">{format(parseISO(e.completed_at), "dd/MM/yyyy HH:mm", { locale: fr })}</strong></span>; }
                      catch { return null; }
                    })()}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 pt-2">
                  {/* Montant + supplier */}
                  <div className="bg-slate-800/40 rounded-lg p-3 flex items-center justify-between flex-wrap gap-2">
                    <div className="text-sm text-slate-300">
                      {e.supplier && <span className="mr-3">Fournisseur : <strong className="text-white">{e.supplier}</strong></span>}
                      {e.planned_date && <span>Prévu : <strong className="text-white">{e.planned_date}</strong></span>}
                    </div>
                    <div className="text-2xl font-bold text-amber-400">
                      {formatPrice(e.amount)} F
                    </div>
                  </div>

                  {/* Items if grouped */}
                  {e.is_group && e.items?.length > 0 && (
                    <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/40">
                      <p className="text-slate-300 text-xs uppercase font-bold mb-2">Détails de la liste ({e.items.length} article{e.items.length > 1 ? 's' : ''})</p>
                      <div className="space-y-1 max-h-60 overflow-y-auto">
                        {e.items.map((it, idx) => (
                          <div key={idx} className={`flex items-center justify-between text-sm py-1 px-2 rounded ${it.struck ? 'opacity-50 line-through' : 'bg-slate-900/40'}`}>
                            <span className="text-white">{idx + 1}. {it.description}</span>
                            <span className="text-slate-400">
                              {it.quantity} × {formatPrice(it.unit_price)} = <strong className="text-amber-300">{formatPrice(it.amount)} F</strong>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes admin */}
                  {e.admin_notes && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                      <p className="text-amber-300 text-xs uppercase font-bold mb-1">Note admin</p>
                      <p className="text-amber-100 text-sm whitespace-pre-wrap">{e.admin_notes}</p>
                    </div>
                  )}

                  {/* Actions selon statut */}
                  <div className="border-t border-slate-700 pt-3 flex flex-wrap gap-2">
                    {/* PENDING / ADMIN_REVIEW : admin → valider/réviser/rejeter */}
                    {isAdmin && (e.status === 'pending' || e.status === 'admin_review') && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => { updateExpense?.(e.id, { status: 'approved' }); setSelected(null); }}
                          className="bg-green-600 hover:bg-green-700"
                          data-testid={`detail-approve-${e.id}`}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" /> Valider
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { openReviseModal?.(e); setSelected(null); }}
                          className="border-orange-500/50 text-orange-300 hover:bg-orange-500/10"
                          data-testid={`detail-revise-${e.id}`}
                        >
                          <Edit2 className="w-4 h-4 mr-1" /> Demander révision
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { updateExpense?.(e.id, { status: 'rejected' }); setSelected(null); }}
                          className="border-red-500/50 text-red-300 hover:bg-red-500/10"
                          data-testid={`detail-reject-${e.id}`}
                        >
                          <X className="w-4 h-4 mr-1" /> Rejeter
                        </Button>
                      </>
                    )}

                    {/* REVISION_REQUESTED : Responsable Op. & Log → corriger */}
                    {!isAdmin && e.status === 'revision_requested' && (
                      <Button
                        size="sm"
                        onClick={() => { openExpenseForEdit?.(e); setSelected(null); }}
                        className="bg-orange-600 hover:bg-orange-700"
                        data-testid={`detail-edit-revision-${e.id}`}
                      >
                        <Edit2 className="w-4 h-4 mr-1" /> Corriger & renvoyer
                      </Button>
                    )}

                    {/* APPROVED : convertir en PO / marquer acheté */}
                    {e.status === 'approved' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => { convertExpenseToPO?.(e); setSelected(null); }}
                          className="bg-blue-600 hover:bg-blue-700"
                          data-testid={`detail-convert-po-${e.id}`}
                        >
                          <Truck className="w-4 h-4 mr-1" /> Bon de commande
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { receiveExpenseStock?.(e); setSelected(null); }}
                          className="border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10"
                          data-testid={`detail-receive-stock-${e.id}`}
                        >
                          <PackagePlus className="w-4 h-4 mr-1" /> Réceptionner stock
                        </Button>
                      </>
                    )}

                    {/* Impressions toujours dispo */}
                    {printSingleExpenseTicket && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => printSingleExpenseTicket(e)}
                        className="border-amber-500/50 text-amber-300 hover:bg-amber-500/10"
                        data-testid={`detail-print-ticket-${e.id}`}
                      >
                        <Receipt className="w-4 h-4 mr-1" /> Ticket 80mm
                      </Button>
                    )}
                    {printExpensePDF && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => printExpensePDF(e)}
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      >
                        <Printer className="w-4 h-4 mr-1" /> PDF A4
                      </Button>
                    )}

                    {/* Edit / Delete (admin) */}
                    {isAdmin && !finished && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { openExpenseForEdit?.(e); setSelected(null); }}
                          className="border-slate-600 text-slate-300 hover:bg-slate-700"
                        >
                          <Edit2 className="w-4 h-4 mr-1" /> Modifier
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { if (window.confirm("Supprimer définitivement cette demande ?")) { deleteExpense?.(e.id); setSelected(null); } }}
                          className="border-red-500/50 text-red-300 hover:bg-red-500/10"
                          data-testid={`detail-delete-${e.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-1" /> Supprimer
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ExpenseCompactList;
