import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "../../../components/ui/select";
import { Plus, X, Trash2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * ConditioningSuggester
 * Affiche :
 *  - les packages déjà enregistrés qui matchent le libellé en cours (prioritaires, violets)
 *  - les presets statiques (Casier×12/24, Pack×6/12/24) selon mot-clé ou catégorie=bar
 *  - un bouton « + Autre » qui ouvre un mini formulaire pour créer un package personnalisé
 *
 * Le composant ne s'affiche pas si rien à proposer.
 * Appelle `onApply(newDescription, newQty)` pour mettre à jour l'item parent.
 */
export const ConditioningSuggester = ({
  description,
  category,
  quantity,
  onApply,
  testIdPrefix = "suggest",
}) => {
  const [persisted, setPersisted] = useState([]);
  const [showCreator, setShowCreator] = useState(false);
  const [customTag, setCustomTag] = useState("Casier");
  const [customQty, setCustomQty] = useState(24);
  const [customUnit, setCustomUnit] = useState("bouteilles");
  const debounceRef = useRef(null);

  // Fetch persisted packages (debounced) when description or category changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = (description || "").trim();
    if (q.length < 3) {
      setPersisted([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const params = { q, limit: 8 };
        if (category) params.category = category;
        const { data } = await axios.get(`${API}/product-packages`, { params });
        setPersisted(data.packages || []);
      } catch (e) {
        // silent — feature is optional
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [description, category]);

  // Static presets (keyword-based + bar-wide fallback)
  const staticPresets = (() => {
    const d = (description || "").toLowerCase().trim();
    if (/(casier|pack)\s*(de|of)?\s*\d+/i.test(description || "")) return null;

    const BEER_SODA = /\b(biere|bière|beer|lager|beaufort|beaufor|castel|heineken|flag|33|eku|guinness|awooyo|awoyo|soda|coca|coca-cola|fanta|sprite|schweppes|youki|youkii|malta|mirinda|seven ?up|7up|pepsi|ginger|bissap|jus|cocktail|bmalt|malt)\b/;
    const WATER = /\b(eau|water|eau minerale|eau minérale|possotome|possotomé|okuta|oasis|awa|volvic|evian|aveyron|source)\b/;

    if (d.length >= 3 && WATER.test(d)) {
      return { label: "Eau minérale détectée", color: "sky",
        presets: [
          { tag: "Pack", qty: 6,  suffix: "(Pack de 6 bouteilles)" },
          { tag: "Pack", qty: 12, suffix: "(Pack de 12 bouteilles)" },
          { tag: "Pack", qty: 24, suffix: "(Pack de 24 bouteilles)" },
        ] };
    }
    if (d.length >= 3 && BEER_SODA.test(d)) {
      return { label: "Bière/Soda détecté", color: "amber",
        presets: [
          { tag: "Casier", qty: 12, suffix: "(Casier de 12 bouteilles)" },
          { tag: "Casier", qty: 24, suffix: "(Casier de 24 bouteilles)" },
        ] };
    }
    if (category === "bar") {
      return { label: "Produit Bar — conditionnement (optionnel)", color: "orange",
        presets: [
          { tag: "Casier", qty: 12, suffix: "(Casier de 12 bouteilles)" },
          { tag: "Casier", qty: 24, suffix: "(Casier de 24 bouteilles)" },
          { tag: "Pack",   qty: 6,  suffix: "(Pack de 6 bouteilles)" },
          { tag: "Pack",   qty: 12, suffix: "(Pack de 12 bouteilles)" },
        ] };
    }
    return null;
  })();

  const hasPersisted = persisted.length > 0;
  const hasStatic = staticPresets != null;
  // Show if either persisted packages OR static presets are available (or category==='bar' to allow manual creation)
  const shouldShow = hasPersisted || hasStatic || category === "bar";
  if (!shouldShow) return null;

  const colors = {
    amber:  { bg: "bg-amber-900/20 border-amber-500/30",  text: "text-amber-300",  btn: "border-amber-500/50 text-amber-300 hover:bg-amber-500/20" },
    sky:    { bg: "bg-sky-900/20 border-sky-500/30",      text: "text-sky-300",    btn: "border-sky-500/50 text-sky-300 hover:bg-sky-500/20" },
    orange: { bg: "bg-orange-900/20 border-orange-500/30",text: "text-orange-300", btn: "border-orange-500/50 text-orange-300 hover:bg-orange-500/20" },
  };
  const c = colors[staticPresets?.color] || colors.orange;

  const applyPreset = async (tag, qty, suffix) => {
    const newDesc = `${(description || "").trim()} ${suffix}`.trim();
    onApply(newDesc, quantity || 1);
    // persist (POST increments usage_count if exists)
    try {
      await axios.post(`${API}/product-packages`, {
        description: description || "",
        category: category || "bar",
        tag,
        qty,
        suffix,
      });
    } catch (e) { /* silent */ }
  };

  const applyCustom = async () => {
    const qty = parseInt(customQty, 10);
    if (!qty || qty <= 0) return;
    const tag = customTag || "Autre";
    const unit = (customUnit || "unités").trim();
    const suffix = `(${tag} de ${qty} ${unit})`;
    await applyPreset(tag, qty, suffix);
    setShowCreator(false);
  };

  const deletePackage = async (pkgId, e) => {
    e.stopPropagation();
    if (!window.confirm("Supprimer ce conditionnement enregistré ?")) return;
    try {
      await axios.delete(`${API}/product-packages/${pkgId}`);
      setPersisted((prev) => prev.filter((p) => p.id !== pkgId));
    } catch (err) { /* silent */ }
  };

  return (
    <div
      className={`mt-2 ${c.bg} border rounded px-3 py-2 flex items-start gap-2 flex-wrap`}
      data-testid={`${testIdPrefix}-conditioning-suggest`}
    >
      <span className={`${c.text} text-xs font-medium shrink-0 py-1`}>
        💡 {hasPersisted ? "Conditionnements enregistrés + presets" : (staticPresets?.label || "Conditionnement (optionnel)")}
      </span>

      {/* Persisted packages (violet) */}
      {persisted.map((p) => (
        <div key={p.id} className="inline-flex items-center group" data-testid={`${testIdPrefix}-persisted-${p.id}`}>
          <Button
            size="sm"
            variant="outline"
            type="button"
            onClick={() => applyPreset(p.tag, p.qty, p.suffix)}
            className="h-7 text-xs border-violet-500/50 text-violet-300 hover:bg-violet-500/20 rounded-r-none pr-2"
            title={`${p.description_sample} — utilisé ${p.usage_count}×`}
          >
            {p.tag} × {p.qty}
            <span className="ml-1 text-[9px] opacity-60">×{p.usage_count}</span>
          </Button>
          <button
            type="button"
            onClick={(e) => deletePackage(p.id, e)}
            className="h-7 px-1 border border-violet-500/50 border-l-0 text-violet-400/60 hover:text-red-400 hover:bg-red-500/20 rounded-r opacity-0 group-hover:opacity-100 transition-opacity"
            title="Supprimer ce conditionnement"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}

      {/* Static presets */}
      {hasStatic && staticPresets.presets.map((p, i) => (
        <Button
          key={`${p.tag}-${p.qty}-${i}`}
          size="sm"
          variant="outline"
          type="button"
          onClick={() => applyPreset(p.tag, p.qty, p.suffix)}
          className={`h-7 text-xs ${c.btn}`}
          data-testid={`${testIdPrefix}-cond-${p.tag.toLowerCase()}-${p.qty}`}
        >
          {p.tag} × {p.qty}
        </Button>
      ))}

      {/* Toggle custom creator */}
      {!showCreator && (
        <Button
          size="sm"
          variant="outline"
          type="button"
          onClick={() => setShowCreator(true)}
          className="h-7 text-xs border-dashed border-violet-500/40 text-violet-300 hover:bg-violet-500/20"
          data-testid={`${testIdPrefix}-add-custom-btn`}
        >
          <Plus className="w-3 h-3 mr-1" /> Autre
        </Button>
      )}

      {/* Custom creator inline */}
      {showCreator && (
        <div className="flex items-center gap-1 flex-wrap bg-violet-900/20 border border-violet-500/30 rounded px-2 py-1">
          <Select value={customTag} onValueChange={setCustomTag}>
            <SelectTrigger className="h-7 w-[90px] bg-slate-800 border-violet-500/30 text-white text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="Casier">Casier</SelectItem>
              <SelectItem value="Pack">Pack</SelectItem>
              <SelectItem value="Carton">Carton</SelectItem>
              <SelectItem value="Bac">Bac</SelectItem>
              <SelectItem value="Caisse">Caisse</SelectItem>
              <SelectItem value="Sac">Sac</SelectItem>
              <SelectItem value="Bidon">Bidon</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-violet-300 text-xs">de</span>
          <Input
            type="number" min="1"
            value={customQty}
            onChange={(e) => setCustomQty(e.target.value)}
            className="h-7 w-16 bg-slate-800 border-violet-500/30 text-white text-xs"
            data-testid={`${testIdPrefix}-custom-qty`}
          />
          <Input
            value={customUnit}
            onChange={(e) => setCustomUnit(e.target.value)}
            placeholder="bouteilles, litres..."
            className="h-7 w-36 bg-slate-800 border-violet-500/30 text-white text-xs"
            data-testid={`${testIdPrefix}-custom-unit`}
          />
          <Button
            size="sm"
            onClick={applyCustom}
            className="h-7 bg-violet-600 hover:bg-violet-700 text-xs"
            data-testid={`${testIdPrefix}-custom-apply`}
          >
            Enregistrer
          </Button>
          <button
            type="button"
            onClick={() => setShowCreator(false)}
            className="text-slate-400 hover:text-red-400 p-1"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};

export default ConditioningSuggester;
