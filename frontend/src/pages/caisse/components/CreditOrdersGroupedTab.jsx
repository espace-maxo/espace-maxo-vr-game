import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, UserCog } from "lucide-react";
import EmployeeOrdersTab from './EmployeeOrdersTab';
import ManagerOrdersTab from './ManagerOrdersTab';

/**
 * Onglet groupé "Bons à crédit" :
 *  - Employés : plafond 10 000 F/mois
 *  - Responsable Op. & Log  : plafond 25 000 F/mois
 *
 * Les deux partagent la mécanique : remise 50%, double autorisation séquentielle (Responsable Op. & Log → D.G.),
 * stock déduit après les 2 autorisations, clôture mensuelle qui retient sur salaires.
 */
const CreditOrdersGroupedTab = ({ currentUser, formatPrice, products }) => {
  return (
    <Tabs defaultValue="credit-employes" className="w-full" data-testid="credit-grouped-tab">
      <TabsList className="bg-slate-900/50 border border-slate-700/50 mb-4">
        <TabsTrigger value="credit-employes" className="data-[state=active]:bg-pink-500 data-[state=active]:text-white" data-testid="credit-tab-employes">
          <Users className="w-4 h-4 mr-1.5" /> Employés <span className="ml-2 text-[10px] opacity-70">10 000 F/mois</span>
        </TabsTrigger>
        <TabsTrigger value="credit-gerante" className="data-[state=active]:bg-violet-500 data-[state=active]:text-white" data-testid="credit-tab-gerante">
          <UserCog className="w-4 h-4 mr-1.5" /> Responsable Op. & Log <span className="ml-2 text-[10px] opacity-70">25 000 F/mois</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="credit-employes">
        <EmployeeOrdersTab currentUser={currentUser} formatPrice={formatPrice} products={products} />
      </TabsContent>

      <TabsContent value="credit-gerante">
        <ManagerOrdersTab currentUser={currentUser} formatPrice={formatPrice} products={products} />
      </TabsContent>
    </Tabs>
  );
};

export default CreditOrdersGroupedTab;
