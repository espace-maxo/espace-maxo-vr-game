import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserCircle, AlertCircle, RotateCcw, FileWarning, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

/**
 * Sous-onglet ADMIN-ONLY : Factures impayées D.G.
 *
 * Liste les commandes de Mme la Directrice Générale qui :
 *  - étaient en statut "non_regle"
 *  - au moment où la gérante a signé un point financier couvrant leur date.
 *
 * Elles sont automatiquement archivées de la vue principale "Mme la D.G."
 * et apparaissent ici pour suivi/relance par l'administrateur.
 */
const ArchivedDGTab = ({ formatPrice }) => {
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/monsieur-orders/archived`);
      setOrders(res.data.orders || []);
      setStats(res.data.stats || {});
    } catch (e) {
      toast.error("Erreur chargement archives D.G.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const unarchive = async (order) => {
    if (!window.confirm(`Renvoyer cette commande (${formatPrice(order.total)} F) dans la vue active "Mme la Directrice Générale" pour règlement ?`)) return;
    try {
      await axios.post(`${API}/monsieur-orders/${order.id}/unarchive`);
      toast.success("Commande remise en actif");
      fetch();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const totalUnpaid = stats.total || 0;

  return (
    <div className="space-y-4" data-testid="archived-dg-tab">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-amber-300 flex items-center gap-2">
            <FileWarning className="w-6 h-6" />
            Factures impayées D.G.
          </h2>
          <Badge className="bg-amber-500/30 text-amber-200">Archives admin · post-signature</Badge>
        </div>
        <Button onClick={fetch} variant="outline" className="border-slate-600 text-slate-300" data-testid="archived-dg-refresh">
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Actualiser
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="bg-amber-900/20 border-amber-500/30">
          <CardContent className="p-3 text-center">
            <FileWarning className="w-5 h-5 text-amber-400 mx-auto mb-1" />
            <p className="text-amber-300 text-xs">Total impayé</p>
            <p className="text-amber-200 font-bold text-lg" data-testid="archived-total">{formatPrice(totalUnpaid)} F</p>
          </CardContent>
        </Card>
        <Card className="bg-red-900/20 border-red-500/30">
          <CardContent className="p-3 text-center">
            <AlertCircle className="w-5 h-5 text-red-400 mx-auto mb-1" />
            <p className="text-red-300 text-xs">Commandes archivées</p>
            <p className="text-red-200 font-bold text-lg">{stats.count || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/40 border-slate-600/40">
          <CardContent className="p-3 text-center">
            <UserCircle className="w-5 h-5 text-slate-300 mx-auto mb-1" />
            <p className="text-slate-300 text-xs">Non réglées</p>
            <p className="text-slate-200 font-bold text-lg">{stats.count_unpaid || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Info banner */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-xs text-amber-200 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <span>
          Ces commandes étaient impayées au moment où la gérante a signé un point financier les couvrant.
          Elles sont retirées de l'onglet "Mme la Directrice Générale" pour ne pas polluer la vue opérationnelle.
          Vous pouvez les renvoyer en actif via le bouton <strong>« Remettre en actif »</strong> pour relancer le règlement.
        </span>
      </div>

      {/* List */}
      {orders.length === 0 ? (
        <Card className="bg-slate-800/40 border-slate-700">
          <CardContent className="p-8 text-center text-slate-400">
            <FileWarning className="w-10 h-10 mx-auto mb-2 text-slate-600" />
            <p>Aucune facture archivée pour le moment</p>
            <p className="text-xs mt-1 text-slate-600">Les commandes D.G. impayées migrent ici lors de la signature d'un point financier.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2" data-testid="archived-orders-list">
          {orders.map(order => (
            <Card key={order.id} className="bg-slate-800/40 border-slate-700 hover:border-amber-500/40 transition-colors">
              <CardContent className="p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex-1 min-w-[250px]">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-purple-300 font-bold">{order.client_name || order.customer_name || "Mme la Directrice Générale"}</span>
                      <Badge className="bg-red-500/20 text-red-300 border border-red-500/40 text-[10px]">✗ Non réglé</Badge>
                      <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px]">Archivée</Badge>
                      <span className="text-slate-500 text-xs">
                        Créée le {format(new Date(order.created_at), "dd/MM/yyyy", { locale: fr })}
                      </span>
                      {order.archived_at && (
                        <span className="text-amber-400/80 text-[10px]">
                          · Archivée le {format(new Date(order.archived_at), "dd/MM HH:mm", { locale: fr })}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-300 text-xs mb-1">
                      {(order.items || []).map(it => `${it.quantity}× ${it.name}`).join(" · ")}
                    </p>
                    <span className="text-amber-300 font-bold">{formatPrice(order.total)} F</span>
                    {order.notes && (
                      <p className="text-slate-500 text-xs mt-1 italic">{order.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      onClick={() => unarchive(order)}
                      className="bg-emerald-600 hover:bg-emerald-700 h-7 text-xs"
                      data-testid={`archived-unarchive-${order.id}`}
                    >
                      <RotateCcw className="w-3 h-3 mr-1" /> Remettre en actif
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default ArchivedDGTab;
