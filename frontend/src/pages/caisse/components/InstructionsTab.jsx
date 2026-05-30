import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  FileText, Plus, Edit2, Trash2, CheckCircle, X, Eye, Archive,
  AlertCircle, Clock, User, CheckSquare, Square, MessageSquare,
  Send, ArrowUpDown, Bell
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PRIORITY_CONFIG = {
  low: { label: "Basse", color: "text-slate-400", bgColor: "bg-slate-500/20" },
  normal: { label: "Normale", color: "text-blue-400", bgColor: "bg-blue-500/20" },
  high: { label: "Haute", color: "text-orange-400", bgColor: "bg-orange-500/20" },
  urgent: { label: "Urgente", color: "text-red-400", bgColor: "bg-red-500/20 animate-pulse" }
};

const InstructionsTab = ({ currentUser, formatPrice, onNotesRead }) => {
  const [instructions, setInstructions] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingInstruction, setEditingInstruction] = useState(null);
  const [viewingInstruction, setViewingInstruction] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [newTaskText, setNewTaskText] = useState("");
  
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    instruction_type: "note",
    tasks: [],
    priority: "normal"
  });

  const isAdmin = currentUser?.role === 'admin';
  const isManager = currentUser?.role === 'manager';

  useEffect(() => {
    fetchInstructions();
  }, [showArchived]);

  // Mark all notes as read when component mounts
  useEffect(() => {
    const markAllAsRead = async () => {
      if (currentUser?.role) {
        try {
          await axios.put(`${API}/instructions/mark-all-read`, { reader_role: currentUser.role });
          if (onNotesRead) onNotesRead();
        } catch (e) {
          console.error("Error marking notes as read:", e);
        }
      }
    };
    markAllAsRead();
  }, [currentUser?.role]);

  const fetchInstructions = async () => {
    try {
      const res = await axios.get(`${API}/instructions`, {
        params: { is_archived: showArchived, reader_role: currentUser?.role }
      });
      setInstructions(res.data.instructions || []);
    } catch (error) {
      console.error("Error fetching instructions:", error);
      toast.error("Erreur lors du chargement des notes");
    }
  };

  // Check if an instruction is unread for current user
  const isUnread = (instruction) => {
    if (!currentUser?.role) return false;
    if (instruction.sender_role === currentUser.role) return false; // Own notes are always "read"
    const readBy = instruction.read_by || [];
    return !readBy.includes(currentUser.role);
  };

  const handleSubmit = async () => {
    if (!formData.title) {
      toast.error("Veuillez saisir un titre");
      return;
    }

    try {
      const payload = {
        ...formData,
        sender_role: currentUser.role,
        sender_name: currentUser.full_name || currentUser.username
      };

      if (editingInstruction) {
        await axios.put(`${API}/instructions/${editingInstruction.id}`, payload);
        toast.success("Note modifiée avec succès");
      } else {
        await axios.post(`${API}/instructions`, payload);
        toast.success("Note créée avec succès");
      }
      setShowModal(false);
      setEditingInstruction(null);
      resetForm();
      fetchInstructions();
    } catch (error) {
      console.error("Error saving instruction:", error);
      toast.error("Erreur lors de l'enregistrement");
    }
  };

  const handleDelete = async (instructionId) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cette note ?")) return;
    
    try {
      await axios.delete(`${API}/instructions/${instructionId}`);
      toast.success("Note supprimée");
      fetchInstructions();
    } catch (error) {
      console.error("Error deleting instruction:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleArchive = async (instructionId, archive = true) => {
    try {
      await axios.put(`${API}/instructions/${instructionId}`, { is_archived: archive });
      toast.success(archive ? "Note archivée" : "Note restaurée");
      fetchInstructions();
    } catch (error) {
      console.error("Error archiving instruction:", error);
      toast.error("Erreur lors de l'archivage");
    }
  };

  const handleMarkRead = async (instructionId) => {
    try {
      await axios.put(`${API}/instructions/${instructionId}`, { is_read: true });
      fetchInstructions();
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  const handleToggleTask = async (instructionId, taskIndex, completed) => {
    try {
      await axios.put(`${API}/instructions/${instructionId}/task/${taskIndex}`, { completed });
      fetchInstructions();
      // Update viewing instruction if open
      if (viewingInstruction?.id === instructionId) {
        const updated = await axios.get(`${API}/instructions`);
        const found = updated.data.instructions.find(i => i.id === instructionId);
        if (found) setViewingInstruction(found);
      }
    } catch (error) {
      console.error("Error toggling task:", error);
      toast.error("Erreur lors de la mise à jour de la tâche");
    }
  };

  const openEditModal = (instruction) => {
    setEditingInstruction(instruction);
    setFormData({
      title: instruction.title,
      content: instruction.content || "",
      instruction_type: instruction.instruction_type || "note",
      tasks: instruction.tasks || [],
      priority: instruction.priority || "normal"
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      title: "",
      content: "",
      instruction_type: "note",
      tasks: [],
      priority: "normal"
    });
    setNewTaskText("");
  };

  const addTask = () => {
    if (!newTaskText.trim()) return;
    setFormData({
      ...formData,
      tasks: [...formData.tasks, { text: newTaskText.trim(), completed: false }]
    });
    setNewTaskText("");
  };

  const removeTask = (index) => {
    setFormData({
      ...formData,
      tasks: formData.tasks.filter((_, i) => i !== index)
    });
  };

  const filteredInstructions = instructions.filter(inst => {
    if (filterType === "notes" && inst.instruction_type !== "note") return false;
    if (filterType === "tasks" && inst.instruction_type !== "task_list") return false;
    if (filterType === "from_admin" && inst.sender_role !== "admin") return false;
    if (filterType === "from_manager" && inst.sender_role !== "manager") return false;
    return true;
  });

  const unreadCount = instructions.filter(i => !i.is_read && !i.is_archived).length;

  const formatDate = (dateStr) => {
    try {
      return format(new Date(dateStr), "dd MMM yyyy 'à' HH:mm", { locale: fr });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-bold text-cyan-300 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="hidden sm:inline">Instructions & Notes</span>
            <span className="sm:hidden">Notes</span>
            {unreadCount > 0 && (
              <Badge className="bg-red-500 text-white text-xs">{unreadCount}</Badge>
            )}
          </h2>
          <Button 
            onClick={() => { resetForm(); setEditingInstruction(null); setShowModal(true); }}
            className="bg-cyan-600 hover:bg-cyan-700"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Nouvelle Note</span>
            <span className="sm:hidden">Nouveau</span>
          </Button>
        </div>
        {/* Filters - separate row on mobile */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[110px] sm:w-[140px] bg-slate-800/50 border-slate-700 text-white text-sm">
              <SelectValue placeholder="Filtrer" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="all">Tout</SelectItem>
              <SelectItem value="notes">Notes</SelectItem>
              <SelectItem value="tasks">Listes de tâches</SelectItem>
              <SelectItem value="from_admin">De l'Admin</SelectItem>
              <SelectItem value="from_manager">De la Responsable Op. & Log</SelectItem>
            </SelectContent>
          </Select>
          
          <Button
            variant={showArchived ? "default" : "outline"}
            size="sm"
            onClick={() => setShowArchived(!showArchived)}
            className={showArchived ? "bg-slate-600" : "border-slate-600 text-slate-300"}
          >
            <Archive className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Archives</span>
          </Button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-cyan-900/30 border-cyan-500/50 border">
          <CardContent className="p-4 text-center">
            <FileText className="w-6 h-6 text-cyan-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-cyan-400">
              {instructions.filter(i => i.instruction_type === "note" && !i.is_archived).length}
            </p>
            <p className="text-xs text-slate-400">Notes</p>
          </CardContent>
        </Card>
        <Card className="bg-purple-900/30 border-purple-500/50 border">
          <CardContent className="p-4 text-center">
            <CheckSquare className="w-6 h-6 text-purple-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-purple-400">
              {instructions.filter(i => i.instruction_type === "task_list" && !i.is_archived).length}
            </p>
            <p className="text-xs text-slate-400">Listes de tâches</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-900/30 border-amber-500/50 border">
          <CardContent className="p-4 text-center">
            <Bell className="w-6 h-6 text-amber-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-amber-400">{unreadCount}</p>
            <p className="text-xs text-slate-400">Non lues</p>
          </CardContent>
        </Card>
        <Card className="bg-red-900/30 border-red-500/50 border">
          <CardContent className="p-4 text-center">
            <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-red-400">
              {instructions.filter(i => (i.priority === "urgent" || i.priority === "high") && !i.is_archived).length}
            </p>
            <p className="text-xs text-slate-400">Urgentes</p>
          </CardContent>
        </Card>
      </div>

      {/* Instructions List */}
      {filteredInstructions.length === 0 ? (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-8 text-center">
            <MessageSquare className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">
              {showArchived ? "Aucune note archivée" : "Aucune note ou instruction"}
            </p>
            <p className="text-slate-500 text-sm">Cliquez sur "Nouvelle Note" pour en créer une</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredInstructions.map(instruction => {
            const priorityConfig = PRIORITY_CONFIG[instruction.priority] || PRIORITY_CONFIG.normal;
            const isTaskList = instruction.instruction_type === "task_list";
            const completedTasks = instruction.tasks?.filter(t => t.completed).length || 0;
            const totalTasks = instruction.tasks?.length || 0;
            
            return (
              <Card 
                key={instruction.id} 
                className={`bg-slate-800/50 border-slate-700 ${!instruction.is_read ? 'border-l-4 border-l-cyan-500' : ''}`}
                onClick={() => {
                  if (!instruction.is_read) handleMarkRead(instruction.id);
                  setViewingInstruction(instruction);
                }}
              >
                <CardContent className="p-4 cursor-pointer hover:bg-slate-700/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {isTaskList ? (
                          <CheckSquare className="w-4 h-4 text-purple-400" />
                        ) : (
                          <FileText className="w-4 h-4 text-cyan-400" />
                        )}
                        <h3 className="text-white font-semibold">{instruction.title}</h3>
                        <Badge className={`${priorityConfig.bgColor} ${priorityConfig.color}`}>
                          {priorityConfig.label}
                        </Badge>
                        {!instruction.is_read && (
                          <Badge className="bg-cyan-500/20 text-cyan-400">Nouveau</Badge>
                        )}
                      </div>
                      
                      <p className="text-slate-400 text-sm line-clamp-2 mb-2">
                        {instruction.content || (isTaskList ? `${completedTasks}/${totalTasks} tâches complétées` : "Pas de contenu")}
                      </p>
                      
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {instruction.sender_name} ({instruction.sender_role === "admin" ? "Admin" : "Responsable Op. & Log"})
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(instruction.created_at)}
                        </span>
                      </div>
                      
                      {/* Task Progress Bar */}
                      {isTaskList && totalTasks > 0 && (
                        <div className="mt-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-green-500 transition-all"
                                style={{ width: `${(completedTasks / totalTasks) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-400">{completedTasks}/{totalTasks}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Right: Actions */}
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      {(isAdmin || instruction.sender_role === currentUser.role) && (
                        <>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => openEditModal(instruction)}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => handleArchive(instruction.id, !instruction.is_archived)}
                            className="text-slate-400 hover:text-slate-300"
                          >
                            <Archive className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => handleDelete(instruction.id)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-cyan-400 flex items-center gap-2">
              {editingInstruction ? <Edit2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
              {editingInstruction ? "Modifier la Note" : "Nouvelle Note"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Type Selection */}
            <div className="space-y-2">
              <Label className="text-slate-300">Type</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setFormData({...formData, instruction_type: "note"})}
                  className={`p-3 rounded-lg border transition-all flex items-center gap-2 ${
                    formData.instruction_type === "note" 
                      ? 'bg-cyan-900/30 border-cyan-500/50 text-cyan-400' 
                      : 'bg-slate-700/30 border-slate-600 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <FileText className="w-5 h-5" />
                  <span>Note simple</span>
                </button>
                <button
                  onClick={() => setFormData({...formData, instruction_type: "task_list"})}
                  className={`p-3 rounded-lg border transition-all flex items-center gap-2 ${
                    formData.instruction_type === "task_list" 
                      ? 'bg-purple-900/30 border-purple-500/50 text-purple-400' 
                      : 'bg-slate-700/30 border-slate-600 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <CheckSquare className="w-5 h-5" />
                  <span>Liste de tâches</span>
                </button>
              </div>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label className="text-slate-300">Titre *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                placeholder="Titre de la note..."
                className="bg-slate-700/50 border-slate-600 text-white"
              />
            </div>

            {/* Priority */}
            <div className="space-y-2">
              <Label className="text-slate-300">Priorité</Label>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => setFormData({...formData, priority: key})}
                    className={`p-2 rounded-lg border transition-all text-center text-sm ${
                      formData.priority === key 
                        ? `${config.bgColor} border-current ${config.color}` 
                        : 'bg-slate-700/30 border-slate-600 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    {config.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content (for notes) */}
            {formData.instruction_type === "note" && (
              <div className="space-y-2">
                <Label className="text-slate-300">Contenu</Label>
                <Textarea
                  value={formData.content}
                  onChange={(e) => setFormData({...formData, content: e.target.value})}
                  placeholder="Écrivez votre note ici..."
                  className="bg-slate-700/50 border-slate-600 text-white min-h-[150px]"
                />
              </div>
            )}

            {/* Tasks (for task lists) */}
            {formData.instruction_type === "task_list" && (
              <div className="space-y-2">
                <Label className="text-slate-300">Tâches</Label>
                
                {/* Add new task */}
                <div className="flex gap-2">
                  <Input
                    value={newTaskText}
                    onChange={(e) => setNewTaskText(e.target.value)}
                    placeholder="Nouvelle tâche..."
                    className="bg-slate-700/50 border-slate-600 text-white flex-1"
                    onKeyPress={(e) => e.key === 'Enter' && addTask()}
                  />
                  <Button onClick={addTask} size="sm" className="bg-purple-600 hover:bg-purple-700">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                
                {/* Task list */}
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {formData.tasks.map((task, index) => (
                    <div key={index} className="flex items-center gap-2 bg-slate-700/30 rounded-lg p-2">
                      <Square className="w-4 h-4 text-slate-500" />
                      <span className="flex-1 text-white text-sm">{task.text}</span>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => removeTask(index)}
                        className="text-red-400 hover:text-red-300 h-6 w-6 p-0"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                  {formData.tasks.length === 0 && (
                    <p className="text-slate-500 text-sm text-center py-4">
                      Aucune tâche ajoutée
                    </p>
                  )}
                </div>

                {/* Description */}
                <div className="space-y-2 mt-4">
                  <Label className="text-slate-300">Description (optionnel)</Label>
                  <Textarea
                    value={formData.content}
                    onChange={(e) => setFormData({...formData, content: e.target.value})}
                    placeholder="Description de la liste..."
                    className="bg-slate-700/50 border-slate-600 text-white min-h-[80px]"
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleSubmit}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700"
              >
                <Send className="w-4 h-4 mr-2" />
                {editingInstruction ? "Modifier" : "Envoyer"}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setShowModal(false); setEditingInstruction(null); }}
                className="border-slate-600 text-slate-300"
              >
                Annuler
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Details Modal */}
      <Dialog open={!!viewingInstruction} onOpenChange={(open) => !open && setViewingInstruction(null)}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-cyan-400 flex items-center gap-2">
              {viewingInstruction?.instruction_type === "task_list" ? (
                <CheckSquare className="w-5 h-5 text-purple-400" />
              ) : (
                <FileText className="w-5 h-5" />
              )}
              {viewingInstruction?.title}
            </DialogTitle>
          </DialogHeader>
          
          {viewingInstruction && (
            <div className="space-y-4 py-4">
              {/* Meta info */}
              <div className="flex items-center gap-3 flex-wrap">
                <Badge className={`${PRIORITY_CONFIG[viewingInstruction.priority]?.bgColor} ${PRIORITY_CONFIG[viewingInstruction.priority]?.color}`}>
                  {PRIORITY_CONFIG[viewingInstruction.priority]?.label}
                </Badge>
                <span className="text-slate-400 text-sm flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {viewingInstruction.sender_name}
                </span>
                <span className="text-slate-400 text-sm flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDate(viewingInstruction.created_at)}
                </span>
              </div>

              {/* Content */}
              {viewingInstruction.content && (
                <div className="bg-slate-700/30 rounded-lg p-4">
                  <p className="text-white whitespace-pre-wrap">{viewingInstruction.content}</p>
                </div>
              )}

              {/* Task List */}
              {viewingInstruction.instruction_type === "task_list" && viewingInstruction.tasks?.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-slate-300 font-medium">Tâches</h4>
                  {viewingInstruction.tasks.map((task, index) => (
                    <div 
                      key={index} 
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        task.completed ? 'bg-green-900/20 border border-green-500/30' : 'bg-slate-700/30 hover:bg-slate-700/50'
                      }`}
                      onClick={() => handleToggleTask(viewingInstruction.id, index, !task.completed)}
                    >
                      {task.completed ? (
                        <CheckSquare className="w-5 h-5 text-green-400" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-500" />
                      )}
                      <span className={`flex-1 ${task.completed ? 'text-slate-400 line-through' : 'text-white'}`}>
                        {task.text}
                      </span>
                    </div>
                  ))}
                  
                  {/* Progress */}
                  <div className="mt-3 pt-3 border-t border-slate-700">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Progression</span>
                      <span className="text-green-400 font-medium">
                        {viewingInstruction.tasks.filter(t => t.completed).length}/{viewingInstruction.tasks.length} complétées
                      </span>
                    </div>
                    <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-green-500 transition-all"
                        style={{ 
                          width: `${(viewingInstruction.tasks.filter(t => t.completed).length / viewingInstruction.tasks.length) * 100}%` 
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InstructionsTab;
