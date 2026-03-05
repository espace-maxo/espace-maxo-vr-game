/**
 * Caisse Pro - Table Bar Component
 * Displays and manages multiple open tables
 */
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const TableBar = ({ 
  openTables, 
  activeTableId, 
  selectTable, 
  closeTable, 
  setShowNewTableModal,
  availableTableNumbers 
}) => {
  return (
    <div className="mb-4 bg-slate-800/70 rounded-lg border border-slate-700 p-2">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-slate-400 text-sm font-medium px-2 whitespace-nowrap">Tables:</span>
        
        {openTables.map(table => (
          <div
            key={table.id}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer transition-all whitespace-nowrap ${
              activeTableId === table.id
                ? 'bg-amber-500 text-white shadow-lg'
                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'
            }`}
            onClick={() => selectTable(table)}
            data-testid={`table-tab-${table.table_number}`}
          >
            <span className="font-bold">T{table.table_number}</span>
            {table.items?.length > 0 && (
              <Badge className={`ml-1 ${activeTableId === table.id ? 'bg-white/20 text-white' : 'bg-amber-500/20 text-amber-400'}`}>
                {table.items.length}
              </Badge>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (table.items?.length > 0) {
                  if (confirm(`Fermer la Table ${table.table_number} ? Les articles non facturés seront perdus.`)) {
                    closeTable(table.id);
                  }
                } else {
                  closeTable(table.id);
                }
              }}
              className={`ml-1 p-0.5 rounded hover:bg-red-500/30 ${activeTableId === table.id ? 'text-white/70 hover:text-white' : 'text-slate-500 hover:text-red-400'}`}
              data-testid={`table-close-${table.table_number}`}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        
        {/* New Table Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowNewTableModal(true)}
          className="border-dashed border-slate-600 text-slate-400 hover:text-white hover:border-amber-500 whitespace-nowrap"
          disabled={availableTableNumbers.length === 0}
          data-testid="new-table-btn"
        >
          <Plus className="w-4 h-4 mr-1" />
          Nouvelle Table
        </Button>
        
        {openTables.length === 0 && (
          <span className="text-slate-500 text-sm italic">Aucune table ouverte - Cliquez sur "Nouvelle Table" pour commencer</span>
        )}
      </div>
    </div>
  );
};

export default TableBar;
