import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LayoutGrid, RefreshCw, Clock, Timer, X } from "lucide-react";

const TablesTab = ({ 
  tablesStatus, 
  fetchTablesStatus, 
  stopTableService, 
  formatPrice 
}) => {
  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-teal-300 flex items-center gap-2">
          <LayoutGrid className="w-6 h-6" />
          Suivi des Tables
        </h2>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchTablesStatus}
            className="border-teal-500/50 text-teal-400 hover:bg-teal-500/20"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Actualiser
          </Button>
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
          <div className="w-4 h-4 rounded bg-slate-700 border-2 border-slate-600"></div>
          <span className="text-slate-400">Libre</span>
        </div>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-10 gap-2">
        {tablesStatus.tables?.map(table => (
          <div 
            key={table.table_number}
            className={`
              relative aspect-square rounded-lg border-2 flex flex-col items-center justify-center cursor-pointer
              transition-all hover:scale-105
              ${table.status === 'free' 
                ? 'bg-slate-800/50 border-slate-600 hover:border-slate-500' 
                : table.status_color === 'green'
                  ? 'bg-green-900/30 border-green-500 shadow-lg shadow-green-500/20'
                  : table.status_color === 'orange'
                    ? 'bg-orange-900/30 border-orange-500 shadow-lg shadow-orange-500/20 animate-pulse'
                    : 'bg-red-900/30 border-red-500 shadow-lg shadow-red-500/20 animate-pulse'
              }
            `}
            title={table.status === 'free' 
              ? `Table ${table.table_number} - Libre` 
              : `Table ${table.table_number}\nServeur: ${table.server_name}\nDurée: ${table.duration_formatted}\nArticles: ${table.items_count}\nTotal: ${formatPrice(table.total)} F`
            }
          >
            <span className={`text-lg font-bold ${
              table.status === 'free' ? 'text-slate-500' : 'text-white'
            }`}>
              {table.table_number}
            </span>
            {table.status === 'occupied' && (
              <>
                <span className={`text-xs font-bold ${
                  table.status_color === 'green' ? 'text-green-400' :
                  table.status_color === 'orange' ? 'text-orange-400' : 'text-red-400'
                }`}>
                  {table.duration_formatted}
                </span>
                <Timer className={`w-3 h-3 absolute top-1 right-1 ${
                  table.status_color === 'green' ? 'text-green-400' :
                  table.status_color === 'orange' ? 'text-orange-400' : 'text-red-400'
                }`} />
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
                    <th className="p-2">Serveur</th>
                    <th className="p-2">Client</th>
                    <th className="p-2 text-center">Articles</th>
                    <th className="p-2 text-right">Total</th>
                    <th className="p-2 text-center">Durée</th>
                    <th className="p-2 text-center">Statut</th>
                    <th className="p-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tablesStatus.tables?.filter(t => t.status === 'occupied')
                    .sort((a, b) => b.duration_minutes - a.duration_minutes)
                    .map(table => (
                    <tr key={table.table_number} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="p-2">
                        <Badge className="bg-teal-500/20 text-teal-400 font-bold">
                          Table {table.table_number}
                        </Badge>
                      </td>
                      <td className="p-2 text-white">{table.server_name}</td>
                      <td className="p-2 text-slate-400">{table.client_name}</td>
                      <td className="p-2 text-center text-white">{table.items_count}</td>
                      <td className="p-2 text-right font-bold text-amber-400">{formatPrice(table.total)} F</td>
                      <td className="p-2 text-center">
                        <span className={`font-bold ${
                          table.status_color === 'green' ? 'text-green-400' :
                          table.status_color === 'orange' ? 'text-orange-400' : 'text-red-400'
                        }`}>
                          {table.duration_formatted}
                        </span>
                      </td>
                      <td className="p-2 text-center">
                        <div className={`w-4 h-4 rounded-full mx-auto ${
                          table.status_color === 'green' ? 'bg-green-500' :
                          table.status_color === 'orange' ? 'bg-orange-500 animate-pulse' : 
                          'bg-red-500 animate-pulse'
                        }`}></div>
                      </td>
                      <td className="p-2 text-center">
                        <Button 
                          size="sm"
                          variant="outline"
                          onClick={() => stopTableService(table.table_id, table.table_number)}
                          className="border-red-500/50 text-red-400 hover:bg-red-500/20 h-8"
                        >
                          <X className="w-4 h-4 mr-1" />
                          Arrêter
                        </Button>
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
            <p className="text-slate-500 text-sm">Les tables s'afficheront ici dès qu'un serveur créera une commande</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TablesTab;
