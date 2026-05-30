/**
 * UsersTab - Gestion des utilisateurs (Admin only)
 * Affiche la liste des utilisateurs avec actions d'édition/suppression.
 * Les modales Add/Edit sont gérées dans CaissePage (état partagé via props).
 */
import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Edit2, Trash2 } from 'lucide-react';

const roleLabel = (role) => {
  switch (role) {
    case 'admin': return 'Admin';
    case 'manager': return 'Resp. Op.';
    case 'cuisinier': return 'Cuisinier';
    case 'coach_jeux': return 'Coach Jeux';
    default: return 'Agent';
  }
};

const roleBadgeClass = (role) => {
  switch (role) {
    case 'admin': return 'bg-amber-500/20 text-amber-400';
    case 'manager': return 'bg-blue-500/20 text-blue-400';
    case 'cuisinier': return 'bg-green-500/20 text-green-400';
    case 'coach_jeux': return 'bg-purple-500/20 text-purple-400';
    default: return 'bg-slate-500/20 text-slate-400';
  }
};

const UsersTab = ({ users = [], onAddUser, onEditUser, onDeleteUser }) => (
  <div className="space-y-4" data-testid="users-tab">
    <div className="flex justify-between items-center">
      <h2 className="text-xl font-bold text-white">Gestion des utilisateurs</h2>
      <Button
        onClick={onAddUser}
        className="bg-red-500 hover:bg-red-600"
        data-testid="add-user-btn"
      >
        <UserPlus className="w-4 h-4 mr-2" />
        Ajouter un utilisateur
      </Button>
    </div>

    <div className="grid gap-3">
      {users.map(user => (
        <Card key={user.id} className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-white font-medium">{user.full_name || user.username}</p>
                  <Badge className={roleBadgeClass(user.role)}>
                    {roleLabel(user.role)}
                  </Badge>
                  {!user.is_active && <Badge className="bg-red-500/20 text-red-400">Inactif</Badge>}
                </div>
                <p className="text-slate-400 text-sm">
                  @{user.username}
                  {user.pin && <span className="ml-2 font-mono bg-slate-700 px-2 py-0.5 rounded text-xs">PIN: {user.pin}</span>}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onEditUser(user)}
                  className="text-slate-400"
                  data-testid={`edit-user-${user.id}`}
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onDeleteUser(user.id)}
                  className="text-red-400"
                  data-testid={`delete-user-${user.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  </div>
);

export default UsersTab;
