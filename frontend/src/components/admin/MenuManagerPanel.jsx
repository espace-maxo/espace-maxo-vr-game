/**
 * MenuManagerPanel — Admin Dashboard panel pour gérer la carte de menus
 * publique (page /livraison).
 *
 * Permet à l'admin :
 *   - Voir tous les plats par catégorie
 *   - Ajouter un nouveau plat
 *   - Modifier nom, prix, description, badges (populaire, sur commande)
 *   - Vider le prix (= "Sur devis")
 *   - Désactiver / réactiver un plat (sans le supprimer)
 *   - Supprimer définitivement
 *
 * Auth : utilise le JWT admin déjà présent dans localStorage (adminToken).
 */
import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  UtensilsCrossed, Plus, Pencil, Trash2, Loader2, RefreshCw, Star,
  ChefHat, AlertTriangle, EyeOff, Eye, X,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CATEGORY_LABELS = {
  salades: "Salades",
  entrees: "Entrées",
  volailles: "Plats de Volaille",
  viandes: "Plats de Viande Rouge",
  poissons: "Plats de Poisson",
  divers: "Plats Divers",
  locaux: "Plats locaux sur commande",
  sauces: "Sauces Traditionnelles",
  pates: "Pâtes & Accompagnements",
  accompagnements: "Accompagnements",
  burgers: "Burgers",
  sandwichs: "Sandwichs & Shawarmas",
  pizzas: "Pizzas",
  desserts: "Desserts",
  boissons: "Boissons",
};

const getAuthHeaders = () => {
  const token = localStorage.getItem("adminToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const emptyForm = {
  id: null,
  category_key: "divers",
  name: "",
  price: "",
  description: "",
  popular: false,
  on_demand: false,
  active: true,
  clear_price: false,
};

const MenuManagerPanel = () => {
  const [grouped, setGrouped] = useState({});
  const [loading, setLoading] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchMenu = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/admin/delivery-menu`, { headers: getAuthHeaders() });
      setGrouped(r.data.items_by_category || {});
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur chargement menu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMenu(); }, [fetchMenu]);

  const openCreate = (catKey) => {
    setForm({ ...emptyForm, category_key: catKey || "divers" });
    setEditOpen(true);
  };

  const openEdit = (item) => {
    setForm({
      id: item.id,
      category_key: item.category_key,
      name: item.name,
      price: item.price === null || item.price === undefined ? "" : String(item.price),
      description: item.description || "",
      popular: !!item.popular,
      on_demand: !!item.on_demand,
      active: item.active !== false,
      clear_price: false,
    });
    setEditOpen(true);
  };

  const saveItem = async () => {
    if (!form.name?.trim()) {
      toast.error("Le nom est obligatoire");
      return;
    }
    setSaving(true);
    try {
      // Construit le payload : si on a vidé le prix → clear_price=true
      const priceStr = String(form.price ?? "").trim();
      const priceNum = priceStr === "" ? null : Number(priceStr);
      if (priceStr !== "" && !Number.isFinite(priceNum)) {
        toast.error("Prix invalide");
        setSaving(false);
        return;
      }

      if (form.id) {
        // PATCH
        const payload = {
          category_key: form.category_key,
          name: form.name.trim(),
          description: form.description?.trim() || "",
          popular: !!form.popular,
          on_demand: !!form.on_demand,
          active: !!form.active,
        };
        if (priceStr === "") {
          payload.clear_price = true;
        } else {
          payload.price = priceNum;
        }
        await axios.patch(`${API}/admin/delivery-menu/items/${form.id}`, payload, {
          headers: getAuthHeaders(),
        });
        toast.success("Plat modifié");
      } else {
        // POST
        const payload = {
          category_key: form.category_key,
          name: form.name.trim(),
          price: priceStr === "" ? null : priceNum,
          description: form.description?.trim() || "",
          popular: !!form.popular,
          on_demand: !!form.on_demand,
          active: !!form.active,
        };
        await axios.post(`${API}/admin/delivery-menu/items`, payload, {
          headers: getAuthHeaders(),
        });
        toast.success("Plat ajouté");
      }
      setEditOpen(false);
      fetchMenu();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (item) => {
    if (!window.confirm(`Supprimer définitivement « ${item.name} » ?`)) return;
    try {
      await axios.delete(`${API}/admin/delivery-menu/items/${item.id}`, {
        headers: getAuthHeaders(),
      });
      toast.success("Plat supprimé");
      fetchMenu();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const toggleActive = async (item) => {
    try {
      await axios.patch(`${API}/admin/delivery-menu/items/${item.id}`, {
        active: !item.active,
      }, { headers: getAuthHeaders() });
      toast.success(item.active ? "Plat désactivé" : "Plat réactivé");
      fetchMenu();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const visibleCategories = filterCategory === "all"
    ? Object.keys(CATEGORY_LABELS)
    : [filterCategory];

  const totalItems = Object.values(grouped).reduce((s, l) => s + (l?.length || 0), 0);
  const itemsWithoutPrice = Object.values(grouped).flat().filter((it) => it.price === null || it.price === undefined).length;

  return (
    <Card className="bg-dark-card border-white/10" data-testid="menu-manager-panel">
      <CardHeader>
        <CardTitle className="text-white font-orbitron flex items-center justify-between flex-wrap gap-3">
          <span className="flex items-center gap-2">
            <UtensilsCrossed className="w-5 h-5 text-food-orange" />
            Carte de menus — Page /livraison
            <Badge className="bg-food-orange/20 text-food-orange">{totalItems} plats</Badge>
            {itemsWithoutPrice > 0 && (
              <Badge className="bg-amber-500/20 text-amber-300">{itemsWithoutPrice} sur devis</Badge>
            )}
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="bg-dark-bg border-white/20 text-white h-9 w-[210px]" data-testid="menu-filter-category">
                <SelectValue placeholder="Catégorie" />
              </SelectTrigger>
              <SelectContent className="bg-dark-card border-white/20 text-white">
                <SelectItem value="all">Toutes les catégories</SelectItem>
                {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => openCreate(filterCategory === "all" ? "divers" : filterCategory)}
                    className="bg-food-orange hover:bg-food-orange/80 text-white h-9"
                    data-testid="menu-create-btn">
              <Plus className="w-4 h-4 mr-1" /> Ajouter un plat
            </Button>
            <Button variant="outline" onClick={fetchMenu} disabled={loading}
                    className="border-white/20 text-gray-300 h-9" data-testid="menu-refresh">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {visibleCategories.map((catKey) => {
          const items = grouped[catKey] || [];
          if (filterCategory === "all" && items.length === 0) return null;
          return (
            <div key={catKey} className="rounded-lg border border-white/10 bg-white/[0.02] p-3" data-testid={`menu-cat-${catKey}`}>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <h3 className="font-orbitron text-base text-white flex items-center gap-2">
                  {catKey === "locaux" && <ChefHat className="w-4 h-4 text-amber-400" />}
                  {CATEGORY_LABELS[catKey] || catKey}
                  <Badge className="bg-white/10 text-gray-300 text-[10px]">{items.length}</Badge>
                </h3>
                <Button size="sm" variant="ghost" onClick={() => openCreate(catKey)}
                        className="text-food-orange hover:bg-food-orange/10 h-7 text-xs"
                        data-testid={`menu-add-${catKey}`}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Ajouter ici
                </Button>
              </div>
              {items.length === 0 ? (
                <p className="text-gray-500 italic text-sm py-2 px-2">Aucun plat dans cette catégorie.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {items.map((it) => {
                    const noPrice = it.price === null || it.price === undefined;
                    return (
                      <div key={it.id}
                           className={`bg-dark-bg rounded-md border p-2.5 text-xs transition-colors ${
                             !it.active ? "border-rose-500/30 opacity-50" :
                             it.on_demand ? "border-amber-500/30" : "border-white/10"
                           }`}
                           data-testid={`menu-item-${it.id}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                              <span className="font-semibold text-white truncate" title={it.name}>{it.name}</span>
                              {it.popular && <Star className="w-3 h-3 text-food-gold shrink-0" />}
                              {it.on_demand && (
                                <Badge className="bg-amber-500/20 text-amber-300 text-[9px] px-1 py-0">🍲</Badge>
                              )}
                              {!it.active && (
                                <Badge className="bg-rose-500/20 text-rose-300 text-[9px] px-1 py-0">Masqué</Badge>
                              )}
                            </div>
                            {it.description && (
                              <p className="text-gray-500 text-[10px] line-clamp-2">{it.description}</p>
                            )}
                            <p className={`font-bold text-sm mt-1 ${noPrice ? "text-amber-300 italic" : "text-food-orange"}`}>
                              {noPrice ? "Sur devis" : `${it.price.toLocaleString()} FCFA`}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1 shrink-0">
                            <Button size="sm" variant="ghost"
                                    onClick={() => openEdit(it)}
                                    className="text-cyan-400 hover:bg-cyan-500/10 h-7 w-7 p-0"
                                    data-testid={`menu-edit-${it.id}`}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost"
                                    onClick={() => toggleActive(it)}
                                    className={`h-7 w-7 p-0 ${it.active ? "text-amber-400 hover:bg-amber-500/10" : "text-emerald-400 hover:bg-emerald-500/10"}`}
                                    data-testid={`menu-toggle-${it.id}`}
                                    title={it.active ? "Masquer du public" : "Réactiver"}>
                              {it.active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </Button>
                            <Button size="sm" variant="ghost"
                                    onClick={() => deleteItem(it)}
                                    className="text-rose-400 hover:bg-rose-500/10 h-7 w-7 p-0"
                                    data-testid={`menu-delete-${it.id}`}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>

      {/* MODAL — Ajout / Modification */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-dark-card border-food-orange/40 text-white max-w-md" data-testid="menu-edit-modal">
          <DialogHeader>
            <DialogTitle className="font-orbitron flex items-center gap-2">
              {form.id ? <Pencil className="w-4 h-4 text-cyan-400" /> : <Plus className="w-4 h-4 text-food-orange" />}
              {form.id ? "Modifier le plat" : "Ajouter un plat"}
            </DialogTitle>
            <DialogDescription className="text-gray-400 text-xs">
              Laissez le prix vide pour afficher <strong className="text-amber-300">« Sur devis »</strong> sur la page publique.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-gray-300 text-xs">Catégorie *</Label>
              <Select value={form.category_key} onValueChange={(v) => setForm({ ...form, category_key: v })}>
                <SelectTrigger className="bg-dark-bg border-white/20 text-white h-9" data-testid="menu-form-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-dark-card border-white/20 text-white max-h-72">
                  {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Nom du plat *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                     placeholder="Ex: Poulet braisé"
                     className="bg-dark-bg border-white/20 text-white"
                     data-testid="menu-form-name" />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Prix (FCFA) — vide = Sur devis</Label>
              <Input type="number" min="0" step="100"
                     value={form.price}
                     onChange={(e) => setForm({ ...form, price: e.target.value })}
                     placeholder="Ex: 4500 (ou laisser vide)"
                     className="bg-dark-bg border-white/20 text-white"
                     data-testid="menu-form-price" />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Description (optionnel)</Label>
              <Textarea value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        placeholder="Ex: Servi avec sauce arachide"
                        className="bg-dark-bg border-white/20 text-white text-sm min-h-[60px]"
                        data-testid="menu-form-description" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="flex items-center gap-2 rounded border border-white/10 bg-dark-bg p-2 cursor-pointer hover:border-food-gold/40">
                <Switch checked={form.popular} onCheckedChange={(v) => setForm({ ...form, popular: v })}
                        data-testid="menu-form-popular" />
                <span className="text-[11px] flex items-center gap-1">
                  <Star className="w-3 h-3 text-food-gold" /> Populaire
                </span>
              </label>
              <label className="flex items-center gap-2 rounded border border-white/10 bg-dark-bg p-2 cursor-pointer hover:border-amber-500/40">
                <Switch checked={form.on_demand} onCheckedChange={(v) => setForm({ ...form, on_demand: v })}
                        data-testid="menu-form-on-demand" />
                <span className="text-[11px]">🍲 Sur commande</span>
              </label>
              <label className="flex items-center gap-2 rounded border border-white/10 bg-dark-bg p-2 cursor-pointer hover:border-emerald-500/40">
                <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })}
                        data-testid="menu-form-active" />
                <span className="text-[11px]">{form.active ? "Visible" : "Masqué"}</span>
              </label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}
                    className="border-white/20 text-gray-300">
              <X className="w-4 h-4 mr-1" /> Annuler
            </Button>
            <Button onClick={saveItem} disabled={saving}
                    className="bg-food-orange hover:bg-food-orange/80 text-white"
                    data-testid="menu-form-save">
              {saving ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Enregistrement…</>
              ) : (
                <>{form.id ? "Modifier" : "Ajouter"}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default MenuManagerPanel;
