import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserCircle, FileWarning } from "lucide-react";
import MonsieurTab from './MonsieurTab';
import ArchivedDGTab from './ArchivedDGTab';

/**
 * Onglet groupé "Mme la D.G." :
 *  - Actives : MonsieurTab (commandes D.G. en attente de paiement)
 *  - Archivées : ArchivedDGTab (admin only, commandes archivées post-signature)
 */
const DGGroupedTab = ({ currentUser, formatPrice, products }) => {
  const isAdmin = currentUser?.role === 'admin';

  return (
    <Tabs defaultValue="dg-actives" className="w-full" data-testid="dg-grouped-tab">
      <TabsList className="bg-slate-900/50 border border-slate-700/50 mb-4">
        <TabsTrigger value="dg-actives" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white" data-testid="dg-tab-actives">
          <UserCircle className="w-4 h-4 mr-1.5" /> Actives
        </TabsTrigger>
        {isAdmin && (
          <TabsTrigger value="dg-archived" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white" data-testid="dg-tab-archived">
            <FileWarning className="w-4 h-4 mr-1.5" /> Archivées (admin)
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="dg-actives">
        <MonsieurTab currentUser={currentUser} formatPrice={formatPrice} products={products} />
      </TabsContent>

      {isAdmin && (
        <TabsContent value="dg-archived">
          <ArchivedDGTab formatPrice={formatPrice} />
        </TabsContent>
      )}
    </Tabs>
  );
};

export default DGGroupedTab;
