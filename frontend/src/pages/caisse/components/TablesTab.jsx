import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { LayoutGrid, RefreshCw, Clock, Timer, X, User, ShoppingCart, Eye, Zap } from "lucide-react";
import { toast } from "sonner";

const TablesTab = ({ 
  tablesStatus, 
  fetchTablesStatus, 
  stopTableService, 
  formatPrice,
  openTables = [],  // Add openTables prop for order details
  onTakeOrder,      // Callback to navigate to order tab with selected table
  currentUser,      // Current user for role-based features
  onPrintClientReceipt  // (22/05/2026) — Crée la facture en BDD + imprime le ticket client
}) => {
  const [selectedTable, setSelectedTable] = useState(null);
  const [autoStopEnabled, setAutoStopEnabled] = useState(() => {
    // Load from localStorage
    const saved = localStorage.getItem('caisse_auto_stop_tables');
    return saved === 'true';
  });

  // Auto-stop invoiced tables when feature is enabled
  useEffect(() => {
    if (autoStopEnabled && tablesStatus.tables) {
      const invoicedTables = tablesStatus.tables.filter(t => t.status === 'invoiced');
      if (invoicedTables.length > 0) {
        // Stop each invoiced table automatically
        invoicedTables.forEach(async (table) => {
          if (table.table_id) {
            try {
              await stopTableService(table.table_id, table.table_number, true); // silent mode
            } catch (e) {
              console.log(`Auto-stop failed for table ${table.table_number}`);
            }
          }
        });
      }
    }
  }, [tablesStatus.tables, autoStopEnabled, stopTableService]);

  // Save preference to localStorage
  const handleAutoStopToggle = (enabled) => {
    setAutoStopEnabled(enabled);
    localStorage.setItem('caisse_auto_stop_tables', enabled.toString());
    if (enabled) {
      toast.success("Arrêt automatique activé - Les tables facturées seront libérées automatiquement");
    } else {
      toast.info("Arrêt automatique désactivé");
    }
  };

  // Find table details from openTables
  const getTableDetails = (tableNumber) => {
    return openTables.find(t => t.table_number === tableNumber);
  };

  const handleTableClick = (table) => {
    if (table.status === 'occupied') {
      const tableDetails = getTableDetails(table.table_number);
      setSelectedTable({ ...table, items: tableDetails?.items || [] });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-teal-300 flex items-center gap-2">
          <LayoutGrid className="w-6 h-6" />
          Suivi des Tables
        </h2>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Auto-stop toggle */}
          <div className="flex items-center gap-2 bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-700">
            <Zap className={`w-4 h-4 ${autoStopEnabled ? 'text-amber-400' : 'text-slate-500'}`} />
            <span className="text-sm text-slate-300">Arrêt auto</span>
            <Switch
              checked={autoStopEnabled}
              onCheckedChange={handleAutoStopToggle}
              className="data-[state=checked]:bg-amber-500"
            />
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchTablesStatus}
            className="border-teal-500/50 text-teal-400 hover:bg-teal-500/20"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Actualiser
          </Button>
          {/* Manager: Quick access to take order */}
          {currentUser?.role === 'manager' && onTakeOrder && (
            <Button 
              size="sm" 
              onClick={() => onTakeOrder(null)}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              <ShoppingCart className="w-4 h-4 mr-1" />
              Prendre une commande
            </Button>
          )}
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-teal-900/30 to-cyan-900/20 border-teal-500/50">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-teal-400">{tablesStatus.stats?.occupied || 0}</p>
            <p className="text-sm text-slate-400">Tables occupées</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-slate-800/50 to-slate-900/30 border-slate-600/50">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-slate-300">{tablesStatus.stats?.free || 20}</p>
            <p className="text-sm text-slate-400">Tables libres</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-900/30 to-orange-900/20 border-amber-500/50">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-amber-400">{tablesStatus.stats?.avg_duration_minutes || 0}</p>
            <p className="text-sm text-slate-400">Durée moy. (min)</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-slate-800/50 to-slate-900/30 border-slate-600/50">
          <CardContent className="p-4 text-center">
            <div className="flex justify-center gap-2">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-green-400 font-bold">{tablesStatus.stats?.service_quality?.green || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                <span className="text-orange-400 font-bold">{tablesStatus.stats?.service_quality?.orange || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-red-400 font-bold">{tablesStatus.stats?.service_quality?.red || 0}</span>
              </div>
            </div>
            <p className="text-sm text-slate-400 mt-1">Qualité service</p>
          </CardContent>
        </Card>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-500/30 border-2 border-green-500"></div>
          <span className="text-slate-400">{"< 15 min (Excellent)"}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-orange-500/30 border-2 border-orange-500"></div>
          <span className="text-slate-400">15-30 min (À surveiller)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-red-500/30 border-2 border-red-500"></div>
          <span className="text-slate-400">{"> 30 min (Critique)"}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-500/30 border-2 border-blue-500"></div>
          <span className="text-slate-400">Facturée</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-slate-700 border-2 border-slate-600"></div>
          <span className="text-slate-400">Libre</span>
        </div>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-10 gap-2">
        {tablesStatus.tables?.map(table => (
          <div 
            key={table.table_number}
            onClick={() => handleTableClick(table)}
            className={`
              relative aspect-square rounded-lg border-2 flex flex-col items-center justify-center cursor-pointer
              transition-all hover:scale-105
              ${table.status === 'free' 
                ? 'bg-slate-800/50 border-slate-600 hover:border-slate-500' 
                : table.status === 'invoiced'
                  ? 'bg-blue-900/30 border-blue-500 shadow-lg shadow-blue-500/20'
                  : table.status === 'ready_to_invoice'
                    ? 'bg-amber-900/30 border-amber-500 shadow-lg shadow-amber-500/20 animate-pulse'
                  : table.status_color === 'green'
                    ? 'bg-green-900/30 border-green-500 shadow-lg shadow-green-500/20'
                    : table.status_color === 'orange'
                      ? 'bg-orange-900/30 border-orange-500 shadow-lg shadow-orange-500/20 animate-pulse'
                      : 'bg-red-900/30 border-red-500 shadow-lg shadow-red-500/20 animate-pulse'
              }
            `}
            title={table.status === 'free' 
              ? `Table ${table.table_number} - Libre` 
              : table.status === 'invoiced'
                ? `Table ${table.table_number} - Facturée`
                : table.status === 'ready_to_invoice'
                  ? `Table ${table.table_number} - Commande envoyée, à facturer`
                : `Cliquez pour voir les détails`
            }
          >
            <span className={`text-lg font-bold ${
              table.status === 'free' ? 'text-slate-500' : 'text-white'
            }`}>
              {table.table_number}
            </span>
            {(table.status === 'occupied' || table.status === 'invoiced' || table.status === 'ready_to_invoice') && (
              <>
                <span className={`text-xs font-bold ${
                  table.status === 'ready_to_invoice' ? 'text-amber-300' :
                  table.status_color === 'green' ? 'text-green-400' :
                  table.status_color === 'orange' ? 'text-orange-400' : 'text-red-400'
                }`}>
                  {table.duration_formatted}
                </span>
                <Timer className={`w-3 h-3 absolute top-1 right-1 ${
                  table.status === 'ready_to_invoice' ? 'text-amber-300' :
                  table.status_color === 'green' ? 'text-green-400' :
                  table.status_color === 'orange' ? 'text-orange-400' : 'text-red-400'
                }`} />
                <Eye className="w-3 h-3 absolute bottom-1 right-1 text-white/50" />
              </>
            )}
          </div>
        ))}
      </div>

      {/* Detailed List of Occupied Tables */}
      {tablesStatus.tables?.filter(t => t.status === 'occupied').length > 0 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-teal-400 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Détails des Tables Occupées
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700">
                    <th className="p-2">Table</th>
                    <th className="p-2">Agent</th>
                    <th className="p-2">Client</th>
                    <th className="p-2 text-center">Articles</th>
                    <th className="p-2 text-right">Total</th>
                    <th className="p-2 text-center">Durée</th>
                    <th className="p-2 text-center">Statut</th>
                    <th className="p-2 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tablesStatus.tables?.filter(t => t.status === 'occupied' || t.status === 'invoiced' || t.status === 'ready_to_invoice')
                    .sort((a, b) => b.duration_minutes - a.duration_minutes)
                    .map(table => (
                    <tr key={table.table_number} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="p-2">
                        <Badge className={
                          table.status === 'invoiced' ? "bg-blue-500/20 text-blue-400 font-bold"
                          : table.status === 'ready_to_invoice' ? "bg-amber-500/20 text-amber-300 font-bold"
                          : "bg-teal-500/20 text-teal-400 font-bold"
                        }>
                          Table {table.table_number}
                        </Badge>
                      </td>
                      <td className="p-2 text-white">{table.server_name}</td>
                      <td className="p-2 text-slate-400">{table.client_name}</td>
                      <td className="p-2 text-center text-white">{table.items_count}</td>
                      <td className="p-2 text-right font-bold text-amber-400">{formatPrice(table.total)} F</td>
                      <td className="p-2 text-center">
                        <span className={`font-bold ${
                          table.status === 'invoiced' ? 'text-blue-400' :
                          table.status === 'ready_to_invoice' ? 'text-amber-300' :
                          table.status_color === 'green' ? 'text-green-400' :
                          table.status_color === 'orange' ? 'text-orange-400' : 'text-red-400'
                        }`}>
                          {table.status === 'invoiced' ? 'Facturée' : table.status === 'ready_to_invoice' ? 'À facturer' : table.duration_formatted}
                        </span>
                      </td>
                      <td className="p-2 text-center">
                        <div className={`w-4 h-4 rounded-full mx-auto ${
                          table.status === 'ready_to_invoice' ? 'bg-amber-400 animate-pulse' :
                          table.status_color === 'green' ? 'bg-green-500' :
                          table.status_color === 'orange' ? 'bg-orange-500 animate-pulse' : 
                          'bg-red-500 animate-pulse'
                        }`}></div>
                      </td>
                      <td className="p-2 text-center">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {currentUser?.role === 'manager' && onTakeOrder && table.status !== 'invoiced' && table.status !== 'ready_to_invoice' && (
                            <Button 
                              size="sm"
                              onClick={() => onTakeOrder(table.table_number)}
                              className="bg-amber-500 hover:bg-amber-600 text-white h-8"
                            >
                              <ShoppingCart className="w-4 h-4 mr-1" />
                              Commander
                            </Button>
                          )}
                          {/* NEW (22/05/2026) : Imprimer le bon client → crée la facture en BDD */}
                          {table.status === 'ready_to_invoice' && onPrintClientReceipt && (
                            <Button 
                              size="sm"
                              onClick={() => onPrintClientReceipt({ id: table.table_id, table_number: table.table_number })}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white h-8"
                              data-testid={`print-client-receipt-${table.table_number}`}
                            >
                              <Zap className="w-4 h-4 mr-1" />
                              Imprimer le bon client
                            </Button>
                          )}
                          <Button 
                            size="sm"
                            variant="outline"
                            onClick={() => stopTableService(table.table_id, table.table_number)}
                            className="border-red-500/50 text-red-400 hover:bg-red-500/20 h-8"
                          >
                            <X className="w-4 h-4 mr-1" />
                            Arrêter
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {tablesStatus.tables?.filter(t => t.status === 'occupied').length === 0 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-8 text-center">
            <LayoutGrid className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">Toutes les tables sont libres</p>
            <p className="text-slate-500 text-sm">Les tables s'afficheront ici dès qu'un agent créera une commande</p>
          </CardContent>
        </Card>
      )}

      {/* Table Details Modal */}
      <Dialog open={!!selectedTable} onOpenChange={(open) => !open && setSelectedTable(null)}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <LayoutGrid className={`w-6 h-6 ${
                selectedTable?.status_color === 'green' ? 'text-green-400' :
                selectedTable?.status_color === 'orange' ? 'text-orange-400' : 'text-red-400'
              }`} />
              Table {selectedTable?.table_number}
            </DialogTitle>
          </DialogHeader>
          {selectedTable && (
            <div className="space-y-4 py-4">
              {/* Info Row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-700/30 rounded-lg p-3 text-center">
                  <User className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                  <p className="text-white font-medium">{selectedTable.server_name || 'N/A'}</p>
                  <p className="text-xs text-slate-400">Agent</p>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-3 text-center">
                  <Clock className={`w-5 h-5 mx-auto mb-1 ${
                    selectedTable.status_color === 'green' ? 'text-green-400' :
                    selectedTable.status_color === 'orange' ? 'text-orange-400' : 'text-red-400'
                  }`} />
                  <p className={`font-bold ${
                    selectedTable.status_color === 'green' ? 'text-green-400' :
                    selectedTable.status_color === 'orange' ? 'text-orange-400' : 'text-red-400'
                  }`}>{selectedTable.duration_formatted}</p>
                  <p className="text-xs text-slate-400">Durée</p>
                </div>
              </div>

              {/* Items List */}
              <div className="bg-slate-900/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-3">
                  <ShoppingCart className="w-4 h-4 text-teal-400" />
                  <h4 className="text-teal-400 font-medium">Commande en cours</h4>
                </div>
                {selectedTable.items?.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {selectedTable.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center text-sm py-1 border-b border-slate-700/50 last:border-0">
                        <div className="flex-1">
                          <span className="text-white">{item.name}</span>
                          <span className="text-slate-500 ml-2">x{item.quantity}</span>
                        </div>
                        <span className="text-amber-400 font-medium">{formatPrice(item.price * item.quantity)} F</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm text-center py-4">Aucun article dans la commande</p>
                )}
              </div>

              {/* Total */}
              <div className="flex justify-between items-center bg-gradient-to-r from-amber-900/30 to-orange-900/20 rounded-lg p-4">
                <span className="text-slate-300 font-medium">Total</span>
                <span className="text-2xl font-bold text-amber-400">{formatPrice(selectedTable.total)} F</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TablesTab;
