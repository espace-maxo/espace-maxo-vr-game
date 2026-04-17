/**
 * ClientsTab - Gestion des clients
 * Liste CRUD des clients, leurs totaux dépensés et nombre de visites.
 */
import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Edit2, Trash2, Users } from 'lucide-react';

const formatPrice = (p) => new Intl.NumberFormat('fr-FR').format(p || 0);

const ClientsTab = ({ clients = [], onAddClient, onEditClient, onDeleteClient }) => (
  <div className="space-y-4" data-testid="clients-tab">
    <div className="flex justify-between items-center">
      <h2 className="text-xl font-bold text-white">Gestion des clients</h2>
      <Button
        onClick={onAddClient}
        className="bg-pink-500 hover:bg-pink-600"
        data-testid="add-client-btn"
      >
        <UserPlus className="w-4 h-4 mr-2" />
        Ajouter un client
      </Button>
    </div>

    <div className="grid gap-3">
      {clients.map(client => (
        <Card key={client.id} className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">{client.name}</p>
                <p className="text-slate-400 text-sm">
                  {client.phone && `📞 ${client.phone}`}
                  {client.email && ` • ✉️ ${client.email}`}
                </p>
                <div className="flex gap-2 mt-1">
                  <Badge className="bg-amber-500/20 text-amber-400 text-xs">
                    Total: {formatPrice(client.total_spent || 0)} F
                  </Badge>
                  <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                    {client.visit_count || 0} visite{(client.visit_count || 0) > 1 ? 's' : ''}
                  </Badge>
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onEditClient(client)}
                  className="text-slate-400"
                  data-testid={`edit-client-${client.id}`}
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onDeleteClient(client.id)}
                  className="text-red-400"
                  data-testid={`delete-client-${client.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      {clients.length === 0 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">Aucun client enregistré</p>
          </CardContent>
        </Card>
      )}
    </div>
  </div>
);

export default ClientsTab;
