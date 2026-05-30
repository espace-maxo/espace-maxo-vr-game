/**
 * AuditLogsTab — Historique des modifications de factures et bons.
 * Visible uniquement pour le profil Admin.
 *
 * Affiche : qui a fait quoi (création / modification / validation / annulation /
 * suppression), avec un diff condensé des champs modifiés. Filtres par type
 * d'entité (factures vs bons), rôle de l'auteur, action, période, recherche.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ClipboardList, Search, RefreshCw, ShieldAlert, FilePen, Trash2, FileCheck2,
  CheckCircle2, XCircle, FilePlus2, Eye, User, Clock,
} from "lucide-react";
import AuditorPanel from "./AuditorPanel";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND}/api`;
const fmt = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n || 0));

const ACTION_META = {
  create:   { label: "Création",      color: "bg-blue-500/20 text-blue-300 border-blue-500/40",     icon: FilePlus2 },
  update:   { label: "Modification",  color: "bg-amber-500/20 text-amber-300 border-amber-500/40",  icon: FilePen },
  validate: { label: "Validation",    color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", icon: FileCheck2 },
  cancel:   { label: "Annulation",    color: "bg-orange-500/20 text-orange-300 border-orange-500/40", icon: XCircle },
  delete:   { label: "Suppression",   color: "bg-red-500/20 text-red-300 border-red-500/40",        icon: Trash2 },
};

const ROLE_META = {
  admin:   { label: "Admin",   color: "bg-purple-500/20 text-purple-300" },
  manager: { label: "Resp. Op.", color: "bg-amber-500/20 text-amber-300" },
  server:  { label: "Agent", color: "bg-sky-500/20 text-sky-300" },
};

const FIELD_LABELS = {
  items: "Articles",
  total: "Total",
  subtotal: "Sous-total",
  discount: "Remise (%)",
  discount_amount: "Montant remise",
  payment_method: "Mode paiement",
  validation_status: "Statut",
  customer_name: "Client",
  client_name: "Client",
  notes: "Notes",
  table_number: "Table",
  cancelled_by: "Annulé par",
  cancellation_reason: "Motif annulation",
  validated_by: "Validé par",
  created_at: "Date facture",
  totals_by_department: "Totaux par département",
};

const formatVal = (v) => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return fmt(v);
  if (typeof v === "object") {
    if ("count" in v && "qty" in v) {
      return `${v.count} ligne(s) · ${v.qty} qté${v.amount !== undefined ? ` · ${fmt(v.amount)} F` : ""}`;
    }
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
};

const AuditLogsTab = ({ currentUser }) => {
  const isAdmin = currentUser?.role === "admin";

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ total: 0, by_action: {}, by_actor: {} });

  // Filters
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all"); // all | invoice | table
  const [actorRoleFilter, setActorRoleFilter] = useState("non_admin"); // all | non_admin | manager | server
  const [actionFilter, setActionFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Detail modal
  const [selected, setSelected] = useState(null);

  const fetchLogs = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const params = { role: "admin", limit: 500 };
      if (entityFilter !== "all") params.entity_type = entityFilter;
      if (actorRoleFilter !== "all" && actorRoleFilter !== "non_admin") params.actor_role = actorRoleFilter;
      if (actionFilter !== "all") params.action = actionFilter;
      if (dateFrom) params.start_date = dateFrom;
      if (dateTo) params.end_date = dateTo;
      if (search) params.search = search;

      const { data } = await axios.get(`${API}/audit/logs`, { params });
      let items = data.logs || [];
      // Client-side: hide admin's own actions when "non_admin" is selected
      if (actorRoleFilter === "non_admin") {
        items = items.filter((lg) => lg.actor_role !== "admin");
      }
      setLogs(items);
      setStats({
        total: data.total || items.length,
        by_action: data.by_action || {},
        by_actor: data.by_actor || {},
      });
    } catch (e) {
      console.error("Audit logs fetch error:", e);
      toast.error("Impossible de charger l'historique");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, entityFilter, actorRoleFilter, actionFilter, dateFrom, dateTo, search]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Auto-refresh every 60s
  useEffect(() => {
    if (!isAdmin) return;
    const t = setInterval(fetchLogs, 60000);
    return () => clearInterval(t);
  }, [isAdmin, fetchLogs]);

  const summary = useMemo(() => {
    const counts = { create: 0, update: 0, validate: 0, cancel: 0, delete: 0 };
    for (const lg of logs) {
      if (counts[lg.action] !== undefined) counts[lg.action] += 1;
    }
    return counts;
  }, [logs]);

  if (!isAdmin) {
    return (
      <Card className="bg-slate-900/60 border-slate-800">
        <CardContent className="py-10 text-center text-slate-400">
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-amber-400" />
          Section réservée à l'administrateur principal.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="audit-logs-tab">
      {/* Auditeur intelligent — rapport d'incohérences sur une période */}
      <AuditorPanel />
      {/* Header + KPIs */}
      <Card className="bg-gradient-to-br from-slate-900/80 to-slate-800/60 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-amber-300">
            <ClipboardList className="w-5 h-5" />
            Historique des modifications · Factures &amp; Bons
          </CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            Trace toutes les actions effectuées par la responsable op. & log et les agents sur les factures
            et bons de commande. Visible uniquement par l'administrateur principal.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <div className="rounded-lg bg-slate-800/50 px-3 py-2 border border-slate-700">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Total</div>
            <div className="text-xl font-bold text-white">{stats.total}</div>
          </div>
          {Object.entries(ACTION_META).map(([key, m]) => {
            const Icon = m.icon;
            return (
              <div key={key} className="rounded-lg bg-slate-800/50 px-3 py-2 border border-slate-700">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Icon className="w-3 h-3" /> {m.label}
                </div>
                <div className="text-xl font-bold text-white">{summary[key] || 0}</div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="bg-slate-900/60 border-slate-800">
        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-2">
            <Label className="text-xs text-slate-400">Recherche</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-slate-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="N° facture ou nom utilisateur"
                className="pl-8 bg-slate-800 border-slate-700 text-white"
                data-testid="audit-search-input"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-400">Type</Label>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white" data-testid="audit-entity-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="invoice">Factures</SelectItem>
                <SelectItem value="table">Bons (tables)</SelectItem>
                <SelectItem value="location">Locations</SelectItem>
                <SelectItem value="expense">Achats / dépenses</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-slate-400">Auteur</Label>
            <Select value={actorRoleFilter} onValueChange={setActorRoleFilter}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white" data-testid="audit-actor-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="non_admin">Responsable Op. & Log &amp; agents</SelectItem>
                <SelectItem value="manager">Responsable Op. & Log seulement</SelectItem>
                <SelectItem value="server">Agents seulement</SelectItem>
                <SelectItem value="all">Tous (incl. admin)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-slate-400">Action</Label>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white" data-testid="audit-action-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="create">Créations</SelectItem>
                <SelectItem value="update">Modifications</SelectItem>
                <SelectItem value="validate">Validations</SelectItem>
                <SelectItem value="cancel">Annulations</SelectItem>
                <SelectItem value="delete">Suppressions</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              onClick={fetchLogs}
              disabled={loading}
              variant="outline"
              className="w-full border-slate-700 text-slate-200 hover:bg-slate-800"
              data-testid="audit-refresh-btn"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
          </div>

          <div>
            <Label className="text-xs text-slate-400">Du</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white"
              data-testid="audit-date-from"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-400">Au</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white"
              data-testid="audit-date-to"
            />
          </div>
        </CardContent>
      </Card>

      {/* Logs list */}
      <Card className="bg-slate-900/60 border-slate-800">
        <CardContent className="pt-4">
          {logs.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">
              {loading ? "Chargement..." : "Aucun événement trouvé pour ces filtres."}
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((lg) => {
                const am = ACTION_META[lg.action] || ACTION_META.update;
                const rm = ROLE_META[lg.actor_role] || ROLE_META.manager;
                const Icon = am.icon;
                const dateStr = lg.created_at
                  ? format(parseISO(lg.created_at), "dd MMM yyyy · HH:mm:ss", { locale: fr })
                  : "—";
                const changesCount = Object.keys(lg.changes || {}).length;
                return (
                  <div
                    key={lg.id}
                    className="rounded-lg border border-slate-800 bg-slate-900/40 hover:bg-slate-800/40 transition-colors p-3"
                    data-testid={`audit-row-${lg.id}`}
                  >
                    <div className="flex flex-wrap items-center gap-2 justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`${am.color} border`}>
                          <Icon className="w-3 h-3 mr-1" />{am.label}
                        </Badge>
                        <Badge variant="outline" className="border-slate-600 text-slate-300">
                          {lg.entity_type === "table" ? "Bon (table)"
                            : lg.entity_type === "location" ? "Location"
                            : lg.entity_type === "expense" ? "Achat"
                            : "Facture"}
                        </Badge>
                        {lg.invoice_number && (
                          <span className="text-sm font-mono text-slate-200">{lg.invoice_number}</span>
                        )}
                        {lg.table_number != null && (
                          <span className="text-xs text-slate-400">Table {lg.table_number}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={rm.color}>
                          <User className="w-3 h-3 mr-1" />{lg.actor_name}
                          <span className="ml-1 opacity-70">({rm.label})</span>
                        </Badge>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />{dateStr}
                        </span>
                      </div>
                    </div>

                    {/* Compact diff preview */}
                    {changesCount > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {Object.entries(lg.changes || {}).slice(0, 4).map(([field, val]) => (
                          <span
                            key={field}
                            className="text-[11px] rounded bg-slate-800 border border-slate-700 px-2 py-0.5 text-slate-300"
                          >
                            <span className="text-amber-300">{FIELD_LABELS[field] || field}</span>
                            <span className="mx-1 text-slate-500">:</span>
                            <span className="line-through text-slate-500">{formatVal(val.from)}</span>
                            <span className="mx-1 text-slate-500">→</span>
                            <span className="text-emerald-300">{formatVal(val.to)}</span>
                          </span>
                        ))}
                        {changesCount > 4 && (
                          <span className="text-[11px] text-slate-400 px-2 py-0.5">
                            +{changesCount - 4} autre(s)
                          </span>
                        )}
                      </div>
                    )}

                    <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                      <div className="flex items-center gap-3">
                        {lg.snapshot?.total != null && (
                          <span>Total : <span className="text-slate-200">{fmt(lg.snapshot.total)} F</span></span>
                        )}
                        {lg.snapshot?.items_count != null && (
                          <span>{lg.snapshot.items_count} ligne(s)</span>
                        )}
                        {lg.snapshot?.client_name && (
                          <span>Client : <span className="text-slate-200">{lg.snapshot.client_name}</span></span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-slate-300 hover:bg-slate-700"
                        onClick={() => setSelected(lg)}
                        data-testid={`audit-detail-${lg.id}`}
                      >
                        <Eye className="w-3 h-3 mr-1" />Détails
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail modal */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-amber-400" />
              Détail de l'événement
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded bg-slate-800 px-3 py-2">
                  <div className="text-[10px] uppercase text-slate-400">Action</div>
                  <div className="font-semibold">{(ACTION_META[selected.action] || {}).label || selected.action}</div>
                </div>
                <div className="rounded bg-slate-800 px-3 py-2">
                  <div className="text-[10px] uppercase text-slate-400">Type</div>
                  <div className="font-semibold">
                    {selected.entity_type === "table" ? "Bon (table)"
                      : selected.entity_type === "location" ? "Location"
                      : selected.entity_type === "expense" ? "Achat"
                      : "Facture"}
                  </div>
                </div>
                <div className="rounded bg-slate-800 px-3 py-2">
                  <div className="text-[10px] uppercase text-slate-400">Auteur</div>
                  <div className="font-semibold">{selected.actor_name}
                    <span className="ml-2 text-xs text-slate-400">({(ROLE_META[selected.actor_role] || {}).label || selected.actor_role})</span>
                  </div>
                </div>
                <div className="rounded bg-slate-800 px-3 py-2">
                  <div className="text-[10px] uppercase text-slate-400">Date</div>
                  <div className="font-semibold">
                    {selected.created_at ? format(parseISO(selected.created_at), "dd MMM yyyy · HH:mm:ss", { locale: fr }) : "—"}
                  </div>
                </div>
                {selected.invoice_number && (
                  <div className="rounded bg-slate-800 px-3 py-2 col-span-2">
                    <div className="text-[10px] uppercase text-slate-400">Référence</div>
                    <div className="font-mono">{selected.invoice_number}{selected.table_number != null ? ` · Table ${selected.table_number}` : ""}</div>
                  </div>
                )}
              </div>

              {/* Résumé monétaire */}
              {selected.snapshot && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {selected.snapshot.total != null && (
                    <div className="rounded bg-amber-900/30 border border-amber-500/40 px-3 py-2">
                      <div className="text-[10px] uppercase text-amber-300">Total</div>
                      <div className="font-bold text-amber-200">{fmt(selected.snapshot.total)} F</div>
                    </div>
                  )}
                  {selected.snapshot.subtotal != null && (
                    <div className="rounded bg-slate-800 px-3 py-2">
                      <div className="text-[10px] uppercase text-slate-400">Sous-total</div>
                      <div className="font-mono text-slate-200">{fmt(selected.snapshot.subtotal)} F</div>
                    </div>
                  )}
                  {selected.snapshot.discount_amount != null && selected.snapshot.discount_amount > 0 && (
                    <div className="rounded bg-slate-800 px-3 py-2">
                      <div className="text-[10px] uppercase text-slate-400">Remise</div>
                      <div className="font-mono text-slate-200">- {fmt(selected.snapshot.discount_amount)} F ({selected.snapshot.discount || 0}%)</div>
                    </div>
                  )}
                  {selected.snapshot.payment_method && (
                    <div className="rounded bg-slate-800 px-3 py-2">
                      <div className="text-[10px] uppercase text-slate-400">Mode paiement</div>
                      <div className="text-slate-200">{selected.snapshot.payment_method}</div>
                    </div>
                  )}
                  {selected.snapshot.validation_status && (
                    <div className="rounded bg-slate-800 px-3 py-2">
                      <div className="text-[10px] uppercase text-slate-400">Statut</div>
                      <div className={selected.snapshot.validation_status === "validated" ? "font-bold text-rose-300" : "text-slate-200"}>
                        {selected.snapshot.validation_status}
                        {selected.snapshot.validation_status === "validated" && " ⚠️"}
                      </div>
                    </div>
                  )}
                  {selected.snapshot.client_name && (
                    <div className="rounded bg-slate-800 px-3 py-2">
                      <div className="text-[10px] uppercase text-slate-400">Client</div>
                      <div className="text-slate-200 truncate">{selected.snapshot.client_name}</div>
                    </div>
                  )}
                  {selected.snapshot.server_name && (
                    <div className="rounded bg-slate-800 px-3 py-2">
                      <div className="text-[10px] uppercase text-slate-400">Agent</div>
                      <div className="text-slate-200 truncate">{selected.snapshot.server_name}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Articles détaillés (nouvelles suppressions uniquement) */}
              {Array.isArray(selected.snapshot?.items) && selected.snapshot.items.length > 0 ? (
                <div className="rounded border border-slate-700 p-3" data-testid="audit-items-detail">
                  <div className="text-xs text-amber-300 mb-2 font-bold flex items-center gap-1">
                    <FilePen className="w-3.5 h-3.5" /> Articles ({selected.snapshot.items.length})
                  </div>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {selected.snapshot.items.map((it, i) => {
                      const qty = Number(it.quantity || 1);
                      const price = Number(it.price || 0);
                      const lineTotal = qty * price;
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-slate-800 last:border-0">
                          <span className="text-slate-200 flex-1 truncate">{it.name || it.product_name || "?"}</span>
                          {(it.department || it.category) && (
                            <Badge className="bg-slate-700 text-slate-300 text-[9px] border-0">
                              {it.department || it.category}
                            </Badge>
                          )}
                          <span className="text-slate-400 font-mono">x{qty}</span>
                          <span className="text-slate-400 font-mono">@{fmt(price)}</span>
                          <span className="text-amber-200 font-mono font-bold w-20 text-right">{fmt(lineTotal)} F</span>
                        </div>
                      );
                    })}
                  </div>
                  {selected.snapshot.totals_by_department && Object.keys(selected.snapshot.totals_by_department).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-800 flex flex-wrap gap-1.5">
                      {Object.entries(selected.snapshot.totals_by_department).map(([dept, val]) => (
                        <Badge key={dept} className="bg-cyan-500/15 text-cyan-200 border border-cyan-500/30 text-[10px]">
                          {dept}: {fmt(val)} F
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ) : selected.snapshot?.items_count > 0 && (
                <div className="rounded border border-slate-700 bg-slate-800/40 p-3 text-xs text-slate-400" data-testid="audit-items-legacy">
                  <p className="text-amber-300 font-medium mb-1">⚠️ Articles non disponibles</p>
                  <p>
                    Cette suppression a été enregistrée avant l'activation de la traçabilité détaillée des articles
                    (mise en place le 27/05/2026). Seul le résumé est conservé : <strong className="text-slate-200">{selected.snapshot.items_count} ligne(s)</strong> pour un total de <strong className="text-amber-200">{fmt(selected.snapshot.total || 0)} F</strong>.
                  </p>
                  <p className="mt-1 text-slate-500">Les prochaines suppressions afficheront le détail complet de chaque article.</p>
                </div>
              )}

              {/* Detailed diff (modifications) */}
              {selected.changes && Object.keys(selected.changes).length > 0 && (
                <div className="rounded border border-slate-700 p-3">
                  <div className="text-xs text-amber-300 mb-2 font-bold">Modifications appliquées</div>
                  <div className="space-y-1.5">
                    {Object.entries(selected.changes).map(([field, val]) => (
                      <div key={field} className="text-xs flex flex-wrap gap-1 items-center">
                        <span className="text-amber-300 font-medium">{FIELD_LABELS[field] || field}</span>
                        <span className="text-slate-500">:</span>
                        <span className="line-through text-slate-500 break-all">{formatVal(val.from)}</span>
                        <span className="text-slate-500">→</span>
                        <span className="text-emerald-300 break-all">{formatVal(val.to)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AuditLogsTab;
