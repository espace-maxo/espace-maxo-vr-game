import { useState, useEffect } from "react";
import axios from "axios";
import { UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      setCategories(["Tous", ...catRes.data.categories]);
    } catch (error) {
      console.error("Error fetching menu:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = selectedCategory === "Tous"
    ? menuItems
    : menuItems.filter(item => item.category === selectedCategory);

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
            Découvrez nos délicieux plats préparés avec passion dans une ambiance gaming unique
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
                    ? "bg-neon-blue text-black hover:bg-neon-blue/90"
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
              {filteredItems.map((item, index) => (
                <div
                  key={item.id}
                  className="group bg-dark-card border border-white/10 rounded-lg overflow-hidden hover:border-food-gold/50 transition-all duration-300 hover-scale animate-fade-in-up"
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
                    <span className="absolute top-4 right-4 bg-food-gold text-black px-3 py-1 rounded-full font-rajdhani font-bold text-sm uppercase">
                      {item.category}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="p-6">
                    <h3 className="font-orbitron font-bold text-xl text-white mb-2 group-hover:text-food-gold transition-colors">
                      {item.name}
                    </h3>
                    <p className="text-gray-400 font-outfit text-sm mb-4 line-clamp-2">
                      {item.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="font-rajdhani font-bold text-2xl text-neon-blue">
                        {formatPrice(item.price)} <span className="text-sm text-gray-400">FCFA</span>
                      </span>
                      {!item.is_available && (
                        <span className="text-neon-red font-rajdhani text-sm uppercase">
                          Indisponible
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && filteredItems.length === 0 && (
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
