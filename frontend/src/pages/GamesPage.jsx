import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Gamepad2, Clock, Users, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const GamesPage = () => {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    try {
      const response = await axios.get(`${API}/games`);
      setGames(response.data);
    } catch (error) {
      console.error("Error fetching games:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('fr-FR').format(price);
  };

  return (
    <div className="min-h-screen pt-20 bg-dark-bg" data-testid="games-page">
      {/* Hero */}
      <section className="py-16 px-4 bg-gradient-radial-blue" data-testid="games-hero">
        <div className="max-w-7xl mx-auto text-center">
          <Gamepad2 className="w-12 h-12 text-neon-blue mx-auto mb-4" />
          <h1 className="font-orbitron font-black text-4xl sm:text-5xl lg:text-6xl uppercase tracking-tight mb-4">
            <span className="text-white">Nos</span>{" "}
            <span className="text-neon-blue">Jeux</span>
          </h1>
          <p className="font-outfit text-lg text-gray-300 max-w-2xl mx-auto">
            Plongez dans des mondes virtuels avec notre VR 360° ou vivez l'adrénaline de la course avec notre simulateur SONY
          </p>
        </div>
      </section>

      {/* Pricing Banner */}
      <section className="py-6 px-4 bg-dark-card border-y border-white/10" data-testid="pricing-banner">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-center gap-4 md:gap-12">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-neon-blue animate-pulse"></div>
            <span className="font-rajdhani font-bold text-xl text-white">
              Prix par partie: <span className="text-food-gold">1.500 FCFA</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-neon-red animate-pulse"></div>
            <span className="font-rajdhani font-bold text-xl text-white">
              Frais de réservation: <span className="text-food-gold">500 FCFA</span>
            </span>
          </div>
        </div>
      </section>

      {/* Games Grid */}
      <section className="py-16 px-4" data-testid="games-list">
        <div className="max-w-7xl mx-auto">
          {loading ? (
            <div className="text-center py-20">
              <div className="w-12 h-12 border-4 border-neon-blue border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-gray-400 mt-4 font-outfit">Chargement des jeux...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {games.map((game, index) => (
                <div
                  key={game.id}
                  className={`group relative overflow-hidden rounded-xl border transition-all duration-500 hover-scale animate-fade-in-up ${
                    game.game_type === "VR_360"
                      ? "border-neon-blue/30 hover:border-neon-blue"
                      : "border-neon-red/30 hover:border-neon-red"
                  }`}
                  style={{ animationDelay: `${index * 150}ms` }}
                  data-testid={`game-${game.id}`}
                >
                  {/* Background Image */}
                  <div className="relative aspect-video">
                    <img
                      src={game.image_url}
                      alt={game.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-dark-bg via-dark-bg/50 to-transparent"></div>
                  </div>

                  {/* Content */}
                  <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4 ${
                      game.game_type === "VR_360"
                        ? "bg-neon-blue/20 text-neon-blue"
                        : "bg-neon-red/20 text-neon-red"
                    }`}>
                      <Gamepad2 className="w-4 h-4" />
                      <span className="font-rajdhani font-semibold text-sm uppercase">
                        {game.game_type === "VR_360" ? "Réalité Virtuelle" : "Simulateur"}
                      </span>
                    </div>

                    <h2 className={`font-orbitron font-bold text-2xl md:text-3xl mb-3 ${
                      game.game_type === "VR_360" ? "text-neon-blue" : "text-neon-red"
                    }`}>
                      {game.name}
                    </h2>

                    <p className="font-outfit text-gray-300 mb-4 line-clamp-2">
                      {game.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 mb-6">
                      <div className="flex items-center gap-2 text-gray-400">
                        <Clock className="w-4 h-4" />
                        <span className="font-outfit text-sm">{game.duration_minutes} min / partie</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-400">
                        <Users className="w-4 h-4" />
                        <span className="font-outfit text-sm">1-4 joueurs</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-rajdhani font-bold text-3xl text-food-gold">
                          {formatPrice(game.price_per_game)}
                        </span>
                        <span className="text-gray-400 font-outfit text-sm ml-2">FCFA / partie</span>
                      </div>
                      <Link to={`/booking?game=${game.game_type}`} data-testid={`book-${game.id}`}>
                        <Button
                          className={`font-rajdhani font-bold uppercase transition-all ${
                            game.game_type === "VR_360"
                              ? "bg-neon-blue text-black hover:shadow-[0_0_20px_rgba(0,240,255,0.5)]"
                              : "bg-neon-red text-white hover:shadow-[0_0_20px_rgba(255,0,60,0.5)]"
                          }`}
                        >
                          Réserver
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4 bg-dark-card" data-testid="games-features">
        <div className="max-w-7xl mx-auto">
          <h2 className="font-orbitron font-bold text-2xl md:text-3xl text-center mb-12">
            <span className="text-white">Pourquoi choisir</span>{" "}
            <span className="text-neon-blue">Espace Maxo</span>?
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center p-6 rounded-lg glass-card" data-testid="feature-equipment">
              <div className="w-16 h-16 rounded-full bg-neon-blue/20 flex items-center justify-center mx-auto mb-4">
                <Gamepad2 className="w-8 h-8 text-neon-blue" />
              </div>
              <h3 className="font-orbitron font-bold text-lg text-white mb-2">Équipement Pro</h3>
              <p className="text-gray-400 font-outfit text-sm">
                Casques VR dernière génération et simulateur SONY professionnel
              </p>
            </div>

            <div className="text-center p-6 rounded-lg glass-card" data-testid="feature-games">
              <div className="w-16 h-16 rounded-full bg-neon-red/20 flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-neon-red" />
              </div>
              <h3 className="font-orbitron font-bold text-lg text-white mb-2">Sessions de 15 min</h3>
              <p className="text-gray-400 font-outfit text-sm">
                Parties de 15 minutes pour profiter pleinement de chaque jeu
              </p>
            </div>

            <div className="text-center p-6 rounded-lg glass-card" data-testid="feature-ambiance">
              <div className="w-16 h-16 rounded-full bg-food-gold/20 flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-food-gold" />
              </div>
              <h3 className="font-orbitron font-bold text-lg text-white mb-2">Ambiance Unique</h3>
              <p className="text-gray-400 font-outfit text-sm">
                Jouez et savourez nos délicieux plats dans une ambiance gaming
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 bg-gradient-radial-red" data-testid="games-cta">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-orbitron font-bold text-2xl md:text-4xl mb-4">
            <span className="text-white">Prêt pour</span>{" "}
            <span className="text-neon-red text-glow-red">l'aventure</span>?
          </h2>
          <p className="text-gray-300 font-outfit mb-8">
            Réservez votre créneau maintenant et venez vivre une expérience gaming inoubliable!
          </p>
          <Link to="/booking" data-testid="games-cta-button">
            <Button
              size="lg"
              className="bg-neon-blue text-black font-rajdhani font-bold text-lg uppercase px-8 py-6 hover:shadow-[0_0_30px_rgba(0,240,255,0.5)] transition-all pulse-glow"
            >
              Réserver maintenant
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
};

export default GamesPage;
