/**
 * AnalyticsTab - Dashboard Analytics Admin
 * Graphiques et KPI du mois avec comparaison vs mois précédent.
 */
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid
} from "recharts";
import {
  TrendingUp, TrendingDown, Minus, Users, CreditCard,
  Package, ShoppingBag, BarChart3
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const formatPrice = (p) => new Intl.NumberFormat('fr-FR').format(Math.round(p || 0));

const PAYMENT_COLORS = { cash: "#10b981", mobile: "#f59e0b", cheque: "#3b82f6", wallet: "#a855f7", other: "#64748b" };
const DEPT_COLORS = { salle_jardin: "#22c55e", jeux: "#3b82f6", bar: "#f97316", location: "#a855f7", autres: "#64748b" };

const GrowthBadge = ({ pct, inverse = false }) => {
  if (pct === null || pct === undefined) return <span className="text-slate-500 text-xs">—</span>;
  const positive = pct > 0;
  const negative = pct < 0;
  const isGood = inverse ? negative : positive;
  const color = pct === 0 ? 'text-slate-400' : (isGood ? 'text-emerald-400' : 'text-rose-400');
  const Icon = pct === 0 ? Minus : (positive ? TrendingUp : TrendingDown);
  return (
    <span className={`flex items-center gap-1 text-xs font-semibold ${color}`}>
      <Icon className="w-3 h-3" />
      {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
};

const AnalyticsTab = () => {
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const [y, m] = month.split("-");
    setLoading(true);
    axios.get(`${API}/analytics/dashboard`, { params: { year: parseInt(y, 10), month: parseInt(m, 10) } })
      .then(res => setData(res.data))
      .catch(err => console.error("analytics error", err))
      .finally(() => setLoading(false));
  }, [month]);

  const dailyChart = useMemo(() => {
    if (!data?.current?.daily_stats) return [];
    return Object.entries(data.current.daily_stats)
      .map(([d, v]) => ({ date: d.slice(8), day: d, revenue: v.revenue, count: v.count }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [data]);

  const serverChart = useMemo(() => {
    if (!data?.current?.by_server) return [];
    return Object.entries(data.current.by_server)
      .map(([name, v]) => ({ name: name.length > 15 ? name.slice(0, 15) + '…' : name, total: v.total, count: v.count }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [data]);

  const paymentChart = useMemo(() => {
    if (!data?.current?.by_payment_method) return [];
    return Object.entries(data.current.by_payment_method)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, color: PAYMENT_COLORS[name] || "#64748b" }));
  }, [data]);

  const deptChart = useMemo(() => {
    if (!data?.current?.by_department) return [];
    return Object.entries(data.current.by_department)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({
        name: name === 'salle_jardin' ? 'Salle & Jardin' : name.charAt(0).toUpperCase() + name.slice(1),
        value,
        color: DEPT_COLORS[name] || "#64748b"
      }));
  }, [data]);

  if (loading && !data) {
    return <div className="text-center py-12 text-slate-500" data-testid="analytics-loading">Chargement des analytics...</div>;
  }

  if (!data) {
    return <div className="text-center py-12 text-slate-500" data-testid="analytics-empty">Aucune donnée</div>;
  }

  const cur = data.current || {};
  const g = data.growth || {};
  const monthLabel = format(new Date(month + "-01"), "MMMM yyyy", { locale: fr });

  return (
    <div className="space-y-6" data-testid="analytics-tab">
      {/* Header with month picker */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-amber-400" />
            Dashboard Analytics
          </h2>
          <p className="text-slate-400 text-sm mt-1">Vue d'ensemble du mois — {monthLabel}</p>
        </div>
        <Input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="bg-slate-800/50 border-slate-700 text-white w-auto"
          data-testid="analytics-month-picker"
        />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="analytics-kpis">
        <Card className="bg-gradient-to-br from-emerald-900/30 to-green-900/20 border-emerald-500/40">
          <CardContent className="p-4">
            <p className="text-slate-400 text-xs uppercase tracking-wide">Chiffre d'affaires</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{formatPrice(cur.total_revenue)} F</p>
            <div className="mt-2"><GrowthBadge pct={g.revenue_pct} /></div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-900/30 to-indigo-900/20 border-blue-500/40">
          <CardContent className="p-4">
            <p className="text-slate-400 text-xs uppercase tracking-wide">Factures</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">{cur.invoice_count}</p>
            <div className="mt-2"><GrowthBadge pct={g.invoice_count_pct} /></div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-900/30 to-orange-900/20 border-amber-500/40">
          <CardContent className="p-4">
            <p className="text-slate-400 text-xs uppercase tracking-wide">Panier moyen</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{formatPrice(cur.avg_ticket)} F</p>
            <div className="mt-2"><GrowthBadge pct={g.avg_ticket_pct} /></div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-900/30 to-pink-900/20 border-purple-500/40">
          <CardContent className="p-4">
            <p className="text-slate-400 text-xs uppercase tracking-wide">Serveurs actifs</p>
            <p className="text-2xl font-bold text-purple-400 mt-1">{Object.keys(cur.by_server || {}).length}</p>
            <p className="text-slate-500 text-xs mt-2">Ce mois</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily revenue bar chart */}
      <Card className="bg-slate-800/50 border-slate-700" data-testid="analytics-daily-chart">
        <CardHeader className="pb-2">
          <CardTitle className="text-slate-200 text-sm flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-400" /> Revenus journaliers
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dailyChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dailyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => formatPrice(v)} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                  labelStyle={{ color: "#f1f5f9" }}
                  formatter={(v) => [`${formatPrice(v)} F`, "Revenu"]}
                  labelFormatter={(v, payload) => payload?.[0]?.payload?.day || v}
                />
                <Bar dataKey="revenue" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-500 text-center py-8 text-sm">Aucune vente ce mois-ci</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Top servers */}
        <Card className="bg-slate-800/50 border-slate-700" data-testid="analytics-top-servers">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-200 text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" /> Top serveurs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {serverChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={serverChart} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={10} tickFormatter={(v) => formatPrice(v)} />
                  <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} width={110} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                    formatter={(v) => [`${formatPrice(v)} F`, "Total"]}
                  />
                  <Bar dataKey="total" fill="#3b82f6" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-slate-500 text-center py-8 text-sm">Aucune donnée</p>
            )}
          </CardContent>
        </Card>

        {/* Payment method pie chart */}
        <Card className="bg-slate-800/50 border-slate-700" data-testid="analytics-payment-pie">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-200 text-sm flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-amber-400" /> Modes de paiement
            </CardTitle>
          </CardHeader>
          <CardContent>
            {paymentChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={paymentChart}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={3}
                  >
                    {paymentChart.map((e, i) => (<Cell key={i} fill={e.color} />))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                    formatter={(v) => [`${formatPrice(v)} F`, ""]}
                  />
                  <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-slate-500 text-center py-8 text-sm">Aucune donnée</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Department pie chart */}
        <Card className="bg-slate-800/50 border-slate-700" data-testid="analytics-dept-pie">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-200 text-sm flex items-center gap-2">
              <Package className="w-4 h-4 text-green-400" /> Répartition par département
            </CardTitle>
          </CardHeader>
          <CardContent>
            {deptChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={deptChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} label={(e) => e.name}>
                    {deptChart.map((e, i) => (<Cell key={i} fill={e.color} />))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                    formatter={(v) => [`${formatPrice(v)} F`, ""]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-slate-500 text-center py-8 text-sm">Aucune donnée</p>
            )}
          </CardContent>
        </Card>

        {/* Top products */}
        <Card className="bg-slate-800/50 border-slate-700" data-testid="analytics-top-products">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-200 text-sm flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-pink-400" /> Top produits (10 premiers)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[260px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-800">
                  <tr className="text-left text-slate-400 border-b border-slate-700">
                    <th className="p-2">#</th>
                    <th className="p-2">Produit</th>
                    <th className="p-2 text-center">Qté</th>
                    <th className="p-2 text-right">CA</th>
                  </tr>
                </thead>
                <tbody>
                  {(cur.top_products || []).length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-6 text-slate-500">Aucun produit vendu</td></tr>
                  ) : cur.top_products.map((p, i) => (
                    <tr key={i} className="border-b border-slate-700/30 hover:bg-slate-700/30">
                      <td className="p-2 text-slate-500 text-xs">{i + 1}</td>
                      <td className="p-2 text-white">{p.name}</td>
                      <td className="p-2 text-center text-slate-300">{p.quantity}</td>
                      <td className="p-2 text-right text-amber-400 font-bold">{formatPrice(p.revenue)} F</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Comparison summary */}
      <Card className="bg-gradient-to-br from-slate-900/60 to-slate-800/40 border-slate-700" data-testid="analytics-comparison">
        <CardHeader className="pb-2">
          <CardTitle className="text-slate-200 text-sm">Comparaison vs mois précédent</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-slate-500 text-xs">CA mois précédent</p>
              <p className="text-lg font-bold text-slate-300">{formatPrice(data.previous?.total_revenue || 0)} F</p>
              <GrowthBadge pct={g.revenue_pct} />
            </div>
            <div>
              <p className="text-slate-500 text-xs">Factures mois précédent</p>
              <p className="text-lg font-bold text-slate-300">{data.previous?.invoice_count || 0}</p>
              <GrowthBadge pct={g.invoice_count_pct} />
            </div>
            <div>
              <p className="text-slate-500 text-xs">Panier moyen précédent</p>
              <p className="text-lg font-bold text-slate-300">{formatPrice(data.previous?.avg_ticket || 0)} F</p>
              <GrowthBadge pct={g.avg_ticket_pct} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AnalyticsTab;
