/**
 * CuisineMessagesAdminList — Vue admin de tous les messages cuisinier ↔ Resp. Op.
 * avec suppression individuelle.
 */
import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Trash2, RefreshCw, Loader2, ArrowRight } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CuisineMessagesAdminList = ({ currentUser }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const actorRole = currentUser?.role || "admin";

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/cuisine/messages/all`, { params: { actor_role: actorRole } });
      setMessages(r.data.messages || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setLoading(false);
    }
  }, [actorRole]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const deleteMsg = async (m) => {
    if (!window.confirm(`Supprimer ce message « ${m.label} » ?`)) return;
    try {
      await axios.delete(`${API}/cuisine/messages/${m.id}`, { params: { actor_role: actorRole } });
      toast.success("Message supprimé");
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  return (
    <Card className="bg-slate-800/50 border-slate-700" data-testid="cuisine-messages-admin-list">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-rose-400" />
            Messages cuisinier ↔ Resp. Op.
            <Badge className="bg-rose-500/20 text-rose-200">{messages.length}</Badge>
          </span>
          <Button variant="ghost" size="sm" onClick={fetchAll} disabled={loading}
                  className="text-slate-300 h-7 text-[11px]" data-testid="msgs-admin-refresh">
            {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
            Actualiser
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px]">
          <div className="space-y-1.5 pr-2">
            {messages.length === 0 && !loading && (
              <p className="text-slate-500 italic text-center py-4 text-sm">Aucun message.</p>
            )}
            {messages.map((m) => (
              <div key={m.id}
                   className="flex items-center gap-2 bg-slate-900/40 rounded p-2 text-xs border border-slate-700"
                   data-testid={`admin-msg-${m.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge className={m.from_role === "cuisinier" ? "bg-emerald-500/30 text-emerald-100 text-[10px]" : "bg-amber-500/30 text-amber-100 text-[10px]"}>
                      {m.from_role === "cuisinier" ? "Cuisinier" : "Resp. Op."}
                    </Badge>
                    <ArrowRight className="w-3 h-3 text-slate-500" />
                    <Badge className="bg-slate-700 text-slate-300 text-[10px]">
                      {m.to_role === "cuisinier" ? "Cuisinier" : "Resp. Op."}
                    </Badge>
                    <span className="font-medium text-slate-100">{m.label}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {m.from_name} · {m.created_at ? format(new Date(m.created_at), "dd/MM HH:mm") : ""}
                    {m.table_number ? ` · Table ${m.table_number}` : ""}
                    {m.item_name ? ` · ${m.item_name}` : ""}
                    {m.read_at ? " · lu" : ""}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => deleteMsg(m)}
                        className="text-rose-400 hover:text-rose-300 h-7 w-7 p-0 shrink-0"
                        data-testid={`admin-msg-delete-${m.id}`}
                        title="Supprimer">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default CuisineMessagesAdminList;
