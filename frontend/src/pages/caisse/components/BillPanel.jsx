/**
 * Caisse Pro - Bill Panel Component
 * Shows current order/bill and payment options
 */
import { 
  Receipt, Trash2, Plus, Minus, X, FileText 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEPARTMENT_CONFIG, PAYMENT_METHODS, formatPrice } from "../constants";

const BillPanel = ({
  activeTable,
  activeTableId,
  currentBill,
  selectedClient,
  setSelectedClient,
  clients,
  paymentMethod,
  setPaymentMethod,
  discount,
  setDiscount,
  subtotal,
  discountAmount,
  total,
  totalByDepartment,
  clearBill,
  updateQuantity,
  removeItem,
  saveInvoice
}) => {
  return (
    <Card className="bg-slate-800/50 border-amber-500/30 lg:sticky lg:top-20">
      <CardHeader className="border-b border-slate-700 py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-amber-500 flex items-center gap-2 text-lg">
            <Receipt className="w-5 h-5" />
            {activeTable ? `Table ${activeTable.table_number}` : 'Facture'}
          </CardTitle>
          {currentBill.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearBill} className="text-red-400 hover:text-red-300">
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
        
        {/* Client selector */}
        <Select 
          value={selectedClient?.id || "anonymous"} 
          onValueChange={(v) => setSelectedClient(v === "anonymous" ? null : clients.find(c => c.id === v) || null)}
          disabled={!activeTableId}
        >
          <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white mt-2">
            <SelectValue placeholder="Sélectionner un client (optionnel)" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="anonymous" className="text-white">Client anonyme</SelectItem>
            {clients.map(client => (
              <SelectItem key={client.id} value={client.id} className="text-white">
                {client.name} {client.phone && `(${client.phone})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      
      <CardContent className="p-3">
        {!activeTableId ? (
          <p className="text-slate-500 text-center py-8">Ouvrez une table pour commencer</p>
        ) : currentBill.length === 0 ? (
          <p className="text-slate-500 text-center py-8">Aucun article</p>
        ) : (
          <div className="space-y-2 max-h-[250px] overflow-y-auto">
            {currentBill.map((item, index) => {
              const config = DEPARTMENT_CONFIG[item.department];
              return (
                <div key={index} className="flex items-center justify-between bg-slate-700/30 rounded-lg p-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{item.name}</p>
                    <p className={`text-xs ${config.color}`}>{config.label}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => updateQuantity(index, -1)} className="w-6 h-6 text-slate-400">
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span className="text-white w-6 text-center text-sm">{item.quantity}</span>
                    <Button size="icon" variant="ghost" onClick={() => updateQuantity(index, 1)} className="w-6 h-6 text-slate-400">
                      <Plus className="w-3 h-3" />
                    </Button>
                    <span className="text-amber-400 font-bold text-sm w-14 text-right">
                      {formatPrice(item.price * item.quantity)}
                    </span>
                    <Button size="icon" variant="ghost" onClick={() => removeItem(index)} className="w-6 h-6 text-red-400">
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {currentBill.length > 0 && (
          <>
            {/* Totals by department */}
            <div className="mt-3 pt-3 border-t border-slate-700 space-y-1">
              {Object.entries(totalByDepartment).map(([dept, amount]) => {
                if (amount === 0) return null;
                const config = DEPARTMENT_CONFIG[dept];
                return (
                  <div key={dept} className="flex justify-between text-xs">
                    <span className={config.color}>{config.label}</span>
                    <span className="text-white">{formatPrice(amount)} F</span>
                  </div>
                );
              })}
            </div>

            {/* Discount & Payment */}
            <div className="mt-3 pt-3 border-t border-slate-700 space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-slate-400 text-xs">Remise %</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={discount}
                  onChange={(e) => setDiscount(parseInt(e.target.value) || 0)}
                  className="w-16 bg-slate-700/50 border-slate-600 text-white text-sm h-8"
                />
              </div>
              
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Sous-total</span>
                  <span className="text-white">{formatPrice(subtotal)} F</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Remise ({discount}%)</span>
                    <span className="text-green-400">-{formatPrice(discountAmount)} F</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-slate-700">
                  <span className="text-white">TOTAL</span>
                  <span className="text-amber-500">{formatPrice(total)} FCFA</span>
                </div>
              </div>

              {/* Payment method */}
              <div className="grid grid-cols-2 gap-1">
                {PAYMENT_METHODS.map(method => {
                  const Icon = method.icon;
                  return (
                    <Button
                      key={method.value}
                      variant={paymentMethod === method.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPaymentMethod(method.value)}
                      className={paymentMethod === method.value ? "bg-amber-500 text-white" : "border-slate-600 text-slate-300"}
                    >
                      <Icon className="w-3 h-3 mr-1" />
                      {method.label}
                    </Button>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="pt-2">
                <Button 
                  onClick={saveInvoice} 
                  className="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-white font-bold py-6 text-lg"
                  data-testid="create-invoice-btn"
                >
                  <FileText className="w-5 h-5 mr-2" />
                  CRÉER FACTURE
                </Button>
                <p className="text-slate-500 text-xs text-center mt-2">La facture sera envoyée à la responsable op. & log pour validation</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default BillPanel;
