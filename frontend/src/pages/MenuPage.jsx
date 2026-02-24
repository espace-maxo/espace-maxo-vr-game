import { useState, useEffect } from "react";
import axios from "axios";
import { UtensilsCrossed, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MenuPage = () => {
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("Tous");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMenu();
  }, []);

  const fetchMenu = async () => {
    try {
      const [menuRes, catRes] = await Promise.all([
        axios.get(`${API}/menu`),
        axios.get(`${API}/menu/categories`)
      ]);
      setMenuItems(menuRes.data);
      // Sort categories to put Combos first
      const cats = catRes.data.categories;
      const sortedCats = ["Combos", ...cats.filter(c => c !== "Combos")];
      setCategories(["Tous", ...sortedCats]);
    } catch (error) {
      console.error("Error fetching menu:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = selectedCategory === "Tous"
    ? menuItems
    : menuItems.filter(item => item.category === selectedCategory);

  // Sort to show combos first
  const sortedItems = [...filteredItems].sort((a, b) => {
    if (a.is_combo && !b.is_combo) return -1;
    if (!a.is_combo && b.is_combo) return 1;
    return 0;
  });

  const formatPrice = (price) => {
    return new Intl.NumberFormat('fr-FR').format(price);
  };

  return (
    <div className="min-h-screen pt-20 bg-dark-bg" data-testid="menu-page">
      {/* Hero */}
      <section className="py-16 px-4 bg-gradient-radial-blue" data-testid="menu-hero">
        <div className="max-w-7xl mx-auto text-center">
          <UtensilsCrossed className="w-12 h-12 text-food-gold mx-auto mb-4" />
          <h1 className="font-orbitron font-black text-4xl sm:text-5xl lg:text-6xl uppercase tracking-tight mb-4">
            <span className="text-white">Notre</span>{" "}
            <span className="text-food-gold">Menu</span>
          </h1>
          <p className="font-outfit text-lg text-gray-300 max-w-2xl mx-auto">
            Découvrez nos délicieux plats et combos exclusifs avec jeux VR inclus!
          </p>
          <p className="font-outfit text-base text-food-gold mt-4 italic">
            Carte de menus à consulter sur place
          </p>
        </div>
      </section>

      {/* Category Filter */}
      <section className="py-8 px-4 bg-dark-card sticky top-16 md:top-20 z-40" data-testid="menu-categories">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap justify-center gap-3">
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                onClick={() => setSelectedCategory(category)}
                className={`font-rajdhani font-semibold uppercase transition-all ${
                  selectedCategory === category
                    ? category === "Combos" 
                      ? "bg-food-gold text-black hover:bg-food-gold/90"
                      : "bg-neon-blue text-black hover:bg-neon-blue/90"
                    : "border-white/20 text-gray-300 hover:border-neon-blue hover:text-neon-blue"
                }`}
                data-testid={`category-${category.toLowerCase()}`}
              >
                {category}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {/* Menu Grid */}
      <section className="py-12 px-4" data-testid="menu-items">
        <div className="max-w-7xl mx-auto">
          {loading ? (
            <div className="text-center py-20">
              <div className="w-12 h-12 border-4 border-neon-blue border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-gray-400 mt-4 font-outfit">Chargement du menu...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {sortedItems.map((item, index) => (
                <div
                  key={item.id}
                  className={`group bg-dark-card border rounded-lg overflow-hidden transition-all duration-300 hover-scale animate-fade-in-up ${
                    item.is_combo 
                      ? "border-food-gold/50 hover:border-food-gold shadow-[0_0_15px_rgba(255,191,0,0.1)]" 
                      : "border-white/10 hover:border-food-gold/50"
                  }`}
                  style={{ animationDelay: `${index * 100}ms` }}
                  data-testid={`menu-item-${item.id}`}
                >
                  {/* Image */}
                  <div className="relative aspect-square overflow-hidden">
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-dark-bg via-transparent to-transparent"></div>
                    
                    {/* Badges */}
                    <div className="absolute top-4 right-4 flex flex-col gap-2">
                      {item.is_combo && (
                        <Badge className="bg-food-gold text-black font-rajdhani font-bold uppercase flex items-center gap-1">
                          <Star className="w-3 h-3" />
                          COMBO
                        </Badge>
                      )}
                      {item.persons && (
                        <Badge className="bg-neon-purple text-white font-rajdhani flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {item.persons} pers.
                        </Badge>
                      )}
                      {!item.is_combo && (
                        <Badge className="bg-surface-highlight text-gray-300 font-rajdhani uppercase">
                          {item.category}
                        </Badge>
                      )}
                    </div>

                    {/* Promo Badge */}
                    {item.original_price && (
                      <div className="absolute top-4 left-4">
                        <Badge className="bg-neon-red text-white font-rajdhani font-bold animate-pulse">
                          PROMO
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-6">
                    <h3 className={`font-orbitron font-bold text-xl mb-2 group-hover:text-food-gold transition-colors ${
                      item.is_combo ? "text-food-gold" : "text-white"
                    }`}>
                      {item.name}
                    </h3>
                    <p className="text-gray-400 font-outfit text-sm mb-4 line-clamp-3">
                      {item.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`font-rajdhani font-bold text-2xl ${
                          item.is_combo ? "text-food-gold" : "text-neon-blue"
                        }`}>
                          {formatPrice(item.price)}
                        </span>
                        <span className="text-sm text-gray-400">FCFA</span>
                        {item.original_price && (
                          <span className="text-gray-500 line-through text-sm font-rajdhani">
                            {formatPrice(item.original_price)}
                          </span>
                        )}
                      </div>
                      {!item.is_available && (
                        <span className="text-neon-red font-rajdhani text-sm uppercase">
                          Indisponible
                        </span>
                      )}
                    </div>
                    
                    {item.is_combo && (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        <span className="text-xs text-neon-blue font-outfit">
                          🎮 Jeux VR inclus dans ce combo!
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && sortedItems.length === 0 && (
            <div className="text-center py-20">
              <p className="text-gray-400 font-outfit text-lg">
                Aucun plat trouvé dans cette catégorie.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default MenuPage;
