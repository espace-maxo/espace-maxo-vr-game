/**
 * AssignDateDialog — Dialog pour rattacher manuellement un ou plusieurs
 * achats/dépenses/factures à un jour ou un mois donné.
 *
 * Backend : POST /api/admin/assign-date/bulk
 *
 * Utilisation :
 *   <AssignDateDialog
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     collection="expenses"            // ou "shopping_list_items", "invoices"
 *     ids={selectedIds}
 *     currentUser={currentUser}
 *     onDone={() => fetchExpenses()}
 *   />
 */
import React, { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarDays, X, Loader2, Pin } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const COLLECTION_LABELS = {
  expenses: "achat(s)",
  shopping_list_items: "article(s) Appro",
  invoices: "facture(s)",
};

const AssignDateDialog = ({ open, onClose, collection, ids, currentUser, onDone }) => {
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  const [precision, setPrecision] = useState("day"); // "day" | "month"
  const [dayValue, setDayValue] = useState(today);
  const [monthValue, setMonthValue] = useState(thisMonth);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const count = ids?.length || 0;
  const label = COLLECTION_LABELS[collection] || "élément(s)";

  const doAssign = async (unassign = false) => {
    if (!unassign && count === 0) {
      toast.error("Aucun élément sélectionné");
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        collection,
        ids,
        assigned_date: unassign
          ? null
          : precision === "day"
            ? dayValue
            : monthValue, // YYYY-MM format → backend normalise
        precision,
        actor_role: currentUser?.role || "admin",
        actor_name: currentUser?.full_name || currentUser?.username || "Admin",
      };
      const r = await axios.post(`${API}/admin/assign-date/bulk`, body);
      toast.success(
        unassign
          ? `${r.data.modified} rattachement(s) retiré(s)`
          : `${r.data.modified} ${label} rattaché(s) à ${
              precision === "month" ? monthValue : dayValue
            }`
      );
      onClose();
      if (typeof onDone === "function") onDone();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors du rattachement");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      data-testid="assign-date-dialog"
    >
      <Card className="bg-slate-900 border-purple-500/50 w-full max-w-md">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-purple-200 flex items-center gap-2 text-base">
            <Pin className="w-5 h-5 text-purple-300" />
            Rattacher à une période
          </CardTitle>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-200">
          <p>
            <strong className="text-purple-300">{count}</strong> {label} seront rattachés.
            Le total apparaîtra dans la période choisie (statistiques mensuelles, compte
            courant) ; la date d'origine reste conservée pour traçabilité.
          </p>

          {/* Toggle précision */}
          <div className="flex gap-2">
            <Button
              variant={precision === "day" ? "default" : "outline"}
              size="sm"
              onClick={() => setPrecision("day")}
              className={
                precision === "day"
                  ? "bg-purple-600 hover:bg-purple-700"
                  : "border-slate-600 text-slate-300"
              }
              data-testid="assign-date-precision-day"
            >
              <CalendarDays className="w-4 h-4 mr-1.5" /> Jour précis
            </Button>
            <Button
              variant={precision === "month" ? "default" : "outline"}
              size="sm"
              onClick={() => setPrecision("month")}
              className={
                precision === "month"
                  ? "bg-purple-600 hover:bg-purple-700"
                  : "border-slate-600 text-slate-300"
              }
              data-testid="assign-date-precision-month"
            >
              <CalendarDays className="w-4 h-4 mr-1.5" /> Mois entier
            </Button>
          </div>

          {/* Picker */}
          {precision === "day" ? (
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-slate-300">
                Date de rattachement
              </Label>
              <Input
                type="date"
                value={dayValue}
                onChange={(e) => setDayValue(e.target.value)}
                className="bg-slate-800 border-slate-600 text-white"
                data-testid="assign-date-day-input"
              />
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-slate-300">
                Mois de rattachement
              </Label>
              <Input
                type="month"
                value={monthValue}
                onChange={(e) => setMonthValue(e.target.value)}
                className="bg-slate-800 border-slate-600 text-white"
                data-testid="assign-date-month-input"
              />
            </div>
          )}

          <div className="flex gap-2 pt-2 border-t border-slate-700">
            <Button
              variant="outline"
              onClick={() => doAssign(true)}
              disabled={submitting || count === 0}
              className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
              data-testid="assign-date-unassign-btn"
              title="Retirer le rattachement (revenir à la date d'origine)"
            >
              Retirer
            </Button>
            <div className="flex-1" />
            <Button
              variant="outline"
              onClick={onClose}
              disabled={submitting}
              className="border-slate-600 text-slate-300"
              data-testid="assign-date-cancel-btn"
            >
              Annuler
            </Button>
            <Button
              onClick={() => doAssign(false)}
              disabled={submitting || count === 0}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="assign-date-confirm-btn"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Rattachement…</>
              ) : (
                <>Rattacher</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AssignDateDialog;
