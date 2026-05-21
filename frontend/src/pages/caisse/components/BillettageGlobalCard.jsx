/**
 * BillettageGlobalCard — Billettage UNIQUE pour tous les reversements du jour.
 *
 * Affiche un formulaire de comptage par dénomination (10 000 / 5 000 / 2 000 /
 * 1 000 / 500 / 200 / 100 / 50 / 25 / 10 / 5 FCFA) et calcule le total compté.
 * Compare avec la somme attendue des cash_amount des 4 reversements daily du
 * jour (réconciliation : compté vs attendu, différence visible).
 *
 * Stocké côte serveur : POST /api/billettage (upsert par date).
 */
import React, { useEffect, useMemo, useState, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Coins, Save, RefreshCw, CheckCircle2, AlertTriangle, Banknote } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND}/api`;

// Dénominations FCFA — billets (en haut) puis pièces.
const BILLS = [10000, 5000, 2000, 1000, 500];
const COINS = [200, 100, 50, 25, 10, 5];
const ALL_DENOMS = [...BILLS, ...COINS];

const fmt = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n || 0));

const BillettageGlobalCard = ({ date, currentUser }) => {
  const [denoms, setDenoms] = useState({});
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reconciliation, setReconciliation] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [savedBy, setSavedBy] = useState("");

  const fetchData = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    try {
      const [bRes, rRes] = await Promise.all([
        axios.get(`${API}/billettage/${date}`),
        axios.get(`${API}/billettage/${date}/reconciliation`),
      ]);
      const b = bRes.data || {};
      setDenoms(b.denominations || {});
      setNotes(b.notes || "");
      setLastSavedAt(b.updated_at || b.created_at || null);
      setSavedBy(b.updated_by || b.created_by || "");
      setReconciliation(rRes.data || null);
    } catch (e) {
      toast.error("Erreur de chargement du billettage");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const total = useMemo(() => {
    return ALL_DENOMS.reduce((s, d) => s + d * (parseInt(denoms[String(d)] || 0, 10) || 0), 0);
  }, [denoms]);

  const expected = reconciliation?.expected || 0;
  const difference = total - expected;
  const hasExpected = expected > 0;
  const isMatch = hasExpected && Math.abs(difference) <= 0.5;

  const handleQty = (denom, val) => {
    const cleaned = (val ?? "").toString().replace(/[^0-9]/g, "");
    setDenoms((p) => ({ ...p, [String(denom)]: cleaned === "" ? "" : parseInt(cleaned, 10) }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const cleanDenoms = {};
      for (const d of ALL_DENOMS) {
        const v = parseInt(denoms[String(d)] || 0, 10) || 0;
        if (v > 0) cleanDenoms[String(d)] = v;
      }
      const res = await axios.post(`${API}/billettage`, {
        date,
        denominations: cleanDenoms,
        notes,
        actor_name: currentUser?.full_name || currentUser?.username || "Caisse",
      });
      if (res.data?.success) {
        toast.success(`Billettage enregistré : ${fmt(total)} F`);
        await fetchData();
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur d'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-gradient-to-br from-amber-950/40 to-slate-900/60 border-amber-500/30" data-testid="billettage-global-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-base flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-400" />
            Billettage du jour <span className="text-xs text-slate-400 font-normal">— unique pour les 4 reversements</span>
          </span>
          <div className="flex items-center gap-2">
            <Badge className="bg-amber-500/20 text-amber-300 text-xs">
              Total compté&nbsp;: <strong className="ml-1">{fmt(total)} F</strong>
            </Badge>
            <Button size="sm" variant="outline" onClick={fetchData} disabled={loading} className="border-slate-700 text-slate-300 h-8" data-testid="billettage-refresh">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Réconciliation */}
        {hasExpected && (
          <div className={`rounded-lg p-3 border-2 ${isMatch ? "bg-emerald-500/10 border-emerald-500/40" : "bg-rose-500/10 border-rose-500/40"}`} data-testid="billettage-reconciliation">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                {isMatch ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                )}
                <div>
                  <p className={`text-sm font-semibold ${isMatch ? "text-emerald-300" : "text-rose-300"}`}>
                    {isMatch ? "Cash compté = cash attendu" : `Écart de ${fmt(Math.abs(difference))} F`}
                  </p>
                  <p className="text-xs text-slate-400">
                    Compté&nbsp;: <strong className="text-white">{fmt(total)} F</strong> · Attendu (cash des 4 reversements)&nbsp;: <strong className="text-white">{fmt(expected)} F</strong>
                  </p>
                </div>
              </div>
              {!isMatch && (
                <p className={`text-sm font-bold ${difference > 0 ? "text-blue-300" : "text-rose-300"}`}>
                  {difference > 0 ? "+ " : "- "}{fmt(Math.abs(difference))} F
                </p>
              )}
            </div>
          </div>
        )}

        {/* Saisie par dénomination */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs uppercase text-slate-400 mb-2 flex items-center gap-1">
              <Banknote className="w-3.5 h-3.5" /> Billets
            </Label>
            <div className="space-y-1.5">
              {BILLS.map((d) => {
                const qty = parseInt(denoms[String(d)] || 0, 10) || 0;
                return (
                  <div key={d} className="grid grid-cols-[1fr_80px_100px] items-center gap-2 bg-slate-900/40 rounded px-2 py-1.5">
                    <span className="text-sm text-slate-200 font-medium">{fmt(d)} F</span>
                    <Input
                      type="number" min="0" inputMode="numeric"
                      value={denoms[String(d)] ?? ""}
                      onChange={(e) => handleQty(d, e.target.value)}
                      placeholder="0"
                      className="bg-slate-800 border-slate-700 text-white text-right h-8"
                      data-testid={`bill-${d}`}
                    />
                    <span className="text-sm text-right text-amber-300 font-semibold">{qty > 0 ? `${fmt(d * qty)} F` : "—"}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase text-slate-400 mb-2 flex items-center gap-1">
              <Coins className="w-3.5 h-3.5" /> Pièces
            </Label>
            <div className="space-y-1.5">
              {COINS.map((d) => {
                const qty = parseInt(denoms[String(d)] || 0, 10) || 0;
                return (
                  <div key={d} className="grid grid-cols-[1fr_80px_100px] items-center gap-2 bg-slate-900/40 rounded px-2 py-1.5">
                    <span className="text-sm text-slate-200 font-medium">{fmt(d)} F</span>
                    <Input
                      type="number" min="0" inputMode="numeric"
                      value={denoms[String(d)] ?? ""}
                      onChange={(e) => handleQty(d, e.target.value)}
                      placeholder="0"
                      className="bg-slate-800 border-slate-700 text-white text-right h-8"
                      data-testid={`coin-${d}`}
                    />
                    <span className="text-sm text-right text-amber-300 font-semibold">{qty > 0 ? `${fmt(d * qty)} F` : "—"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Notes + Save */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
          <div>
            <Label className="text-xs text-slate-400 mb-1">Notes (optionnel)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ex: 2 billets de 1000 abîmés, bondé en main"
              className="bg-slate-800 border-slate-700 text-white"
              data-testid="billettage-notes"
            />
          </div>
          <Button onClick={handleSave} disabled={saving} className="bg-amber-600 hover:bg-amber-700 h-10" data-testid="billettage-save">
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>

        {lastSavedAt && (
          <p className="text-[11px] text-slate-500 text-right">
            Dernière mise à jour&nbsp;: {new Date(lastSavedAt).toLocaleString("fr-FR")}{savedBy ? ` par ${savedBy}` : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default BillettageGlobalCard;
