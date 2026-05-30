import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, Users, UserCog, AlertCircle, TrendingDown } from "lucide-react";
import axios from "axios";
import { format } from "date-fns";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

/**
 * Mini dashboard "Crédits sur salaires du mois" — visible UNIQUEMENT pour l'admin.
 * Agrège en temps réel :
 *  - Bons EMPLOYÉS (pending + authorized, montant total)
 *  - Bons RESPONSABLE OP. & LOG  (pending + authorized, montant total)
 *  - Total prévisionnel à retenir sur les paies (autorisés uniquement)
 */
const SalaryCreditsBanner = ({ formatPrice }) => {
  const [emp, setEmp] = useState({ count: 0, pending_total: 0, authorized_total: 0 });
  const [mgr, setMgr] = useState({ count: 0, pending_total: 0, authorized_total: 0 });

  const month = format(new Date(), "yyyy-MM");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [empRes, mgrRes] = await Promise.all([
          axios.get(`${API}/employee-orders`, { params: { month } }),
          axios.get(`${API}/manager-orders`, { params: { month } }),
        ]);
        if (cancelled) return;
        const empOrders = empRes.data.orders || [];
        const mgrOrders = mgrRes.data.orders || [];
        const sum = (arr, fn) => arr.reduce((s, o) => s + (fn(o) ? o.total || 0 : 0), 0);
        const isPending = (o) => o.status === "pending_manager" || o.status === "pending_director";
        const isAuth = (o) => o.status === "authorized";
        setEmp({
          count: empOrders.filter(o => isPending(o) || isAuth(o)).length,
          pending_total: sum(empOrders, isPending),
          authorized_total: sum(empOrders, isAuth),
        });
        setMgr({
          count: mgrOrders.filter(o => isPending(o) || isAuth(o)).length,
          pending_total: sum(mgrOrders, isPending),
          authorized_total: sum(mgrOrders, isAuth),
        });
      } catch (e) {
        // silent: banner is informative only
      }
    };
    load();
    const id = setInterval(load, 30000); // refresh chaque 30s
    return () => { cancelled = true; clearInterval(id); };
  }, [month]);

  const totalToDeduct = emp.authorized_total + mgr.authorized_total;
  const totalPending = emp.pending_total + mgr.pending_total;
  const totalCount = emp.count + mgr.count;

  if (totalCount === 0 && totalToDeduct === 0 && totalPending === 0) {
    return null; // pas de bruit si rien
  }

  return (
    <Card className="bg-gradient-to-r from-violet-900/30 via-pink-900/20 to-violet-900/30 border-violet-500/40 mb-3" data-testid="salary-credits-banner">
      <CardContent className="p-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-violet-300" />
            <div>
              <p className="text-violet-200 font-bold text-sm leading-tight">Crédits sur salaires — {month}</p>
              <p className="text-slate-400 text-[11px]">Aperçu admin · à retenir sur les paies de fin de mois</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* EMPLOYÉS */}
            <div className="flex items-center gap-2 bg-pink-900/20 border border-pink-500/30 rounded-md px-3 py-1.5" data-testid="banner-employes">
              <Users className="w-4 h-4 text-pink-300" />
              <div className="text-right">
                <p className="text-pink-300 text-[10px] font-bold uppercase tracking-wider">Employés</p>
                <p className="text-pink-200 font-bold text-sm leading-tight">{formatPrice(emp.authorized_total)} F</p>
                {emp.pending_total > 0 && (
                  <p className="text-amber-400 text-[10px]">+ {formatPrice(emp.pending_total)} F en attente</p>
                )}
              </div>
            </div>

            {/* RESPONSABLE OP. & LOG */}
            <div className="flex items-center gap-2 bg-violet-900/20 border border-violet-500/30 rounded-md px-3 py-1.5" data-testid="banner-gerante">
              <UserCog className="w-4 h-4 text-violet-300" />
              <div className="text-right">
                <p className="text-violet-300 text-[10px] font-bold uppercase tracking-wider">Resp. Op.</p>
                <p className="text-violet-200 font-bold text-sm leading-tight">{formatPrice(mgr.authorized_total)} F</p>
                {mgr.pending_total > 0 && (
                  <p className="text-amber-400 text-[10px]">+ {formatPrice(mgr.pending_total)} F en attente</p>
                )}
              </div>
            </div>

            {/* TOTAL */}
            <div className="flex items-center gap-2 bg-emerald-900/30 border-2 border-emerald-500/50 rounded-md px-3 py-1.5" data-testid="banner-total">
              <TrendingDown className="w-4 h-4 text-emerald-300" />
              <div className="text-right">
                <p className="text-emerald-300 text-[10px] font-bold uppercase tracking-wider">Total à retenir</p>
                <p className="text-emerald-200 font-bold text-base leading-tight">{formatPrice(totalToDeduct)} F</p>
                {totalPending > 0 && (
                  <p className="text-amber-400 text-[10px] flex items-center gap-1 justify-end">
                    <AlertCircle className="w-3 h-3" />
                    {formatPrice(totalPending)} F en attente d'autorisation
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SalaryCreditsBanner;
