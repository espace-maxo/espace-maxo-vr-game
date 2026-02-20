import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Gamepad2, UtensilsCrossed, Calendar, Phone, ChevronRight } from "lucide-react";

const HomePage = () => {
  return (
    <div className="min-h-screen" data-testid="home-page">
      {/* Hero Section */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden" data-testid="hero-section">
        {/* Background Image */}
        <div className="absolute inset-0">
          <img
            src="https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/caxe4zas_52ccd1b2-bdd5-4dc7-835c-75cef471dbeb%202.JPG"
            alt="Espace Maxo VR Gaming"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-dark-bg/80 via-dark-bg/60 to-dark-bg"></div>
        </div>

        {/* Radial Glow */}
        <div className="absolute inset-0 bg-gradient-radial-blue opacity-50"></div>

        {/* Content */}
        <div className="relative z-10 text-center px-4 max-w-5xl mx-auto animate-fade-in-up">
          <h1 className="font-orbitron font-black text-4xl sm:text-5xl lg:text-7xl uppercase tracking-tight mb-6">
            <span className="text-white">Bienvenue à</span>
            <br />
            <span className="text-neon-blue text-glow-blue">Espace Maxo</span>
          </h1>
          <p className="font-outfit text-lg md:text-xl text-gray-300 max-w-2xl mx-auto mb-8">
            Restaurant & Centre de Jeux VR 360° à Cotonou. 
            Savourez nos délicieux plats et plongez dans des mondes virtuels incroyables!
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/booking" data-testid="hero-cta-reserver">
              <Button
                size="lg"
                className="bg-neon-red text-white font-rajdhani font-bold text-lg uppercase px-8 py-6 hover:shadow-[0_0_30px_rgba(255,0,60,0.5)] transition-all btn-skewed"
              >
                <span className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Réserver maintenant
                </span>
              </Button>
            </Link>
            <Link to="/menu" data-testid="hero-cta-menu">
              <Button
                size="lg"
                variant="outline"
                className="border-neon-blue text-neon-blue font-rajdhani font-bold text-lg uppercase px-8 py-6 hover:bg-neon-blue/10 transition-all btn-skewed"
              >
                <span className="flex items-center gap-2">
                  Voir le Menu
                  <ArrowRight className="w-5 h-5" />
                </span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronRight className="w-8 h-8 text-neon-blue rotate-90" />
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-dark-bg" data-testid="features-section">
        <div className="max-w-7xl mx-auto">
          <h2 className="font-orbitron font-bold text-3xl md:text-5xl text-center mb-4">
            <span className="text-white">Une Expérience</span>{" "}
            <span className="text-neon-blue">Unique</span>
          </h2>
          <p className="text-gray-400 text-center font-outfit text-lg mb-16 max-w-2xl mx-auto">
            Découvrez nos trois univers pour une expérience inoubliable
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* VR Gaming */}
            <div className="group relative overflow-hidden rounded-lg bg-dark-card border border-white/10 hover:border-neon-blue/50 transition-all duration-500 hover-scale" data-testid="feature-vr">
              <div className="aspect-video overflow-hidden">
                <img
                  src="https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/caxe4zas_52ccd1b2-bdd5-4dc7-835c-75cef471dbeb%202.JPG"
                  alt="VR Gaming Espace Maxo"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>
              <div className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Gamepad2 className="w-6 h-6 text-neon-blue" />
                  <h3 className="font-orbitron font-bold text-xl text-neon-blue">VR 360°</h3>
                </div>
                <p className="text-gray-400 font-outfit mb-4">
                  Immergez-vous dans des mondes virtuels avec notre casque VR dernière génération.
                </p>
                <p className="font-rajdhani font-bold text-food-gold text-lg">
                  1.500 FCFA / partie
                </p>
              </div>
            </div>

            {/* Racing Simulator */}
            <div className="group relative overflow-hidden rounded-lg bg-dark-card border border-white/10 hover:border-neon-red/50 transition-all duration-500 hover-scale" data-testid="feature-racing">
              <div className="aspect-video overflow-hidden">
                <img
                  src="https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/zovejuia_Combo%204.JPG"
                  alt="Simulateur Course Espace Maxo"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>
              <div className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Gamepad2 className="w-6 h-6 text-neon-red" />
                  <h3 className="font-orbitron font-bold text-xl text-neon-red">Simulateur Course</h3>
                </div>
                <p className="text-gray-400 font-outfit mb-4">
                  Vivez l'adrénaline de la course avec notre simulateur SONY professionnel.
                </p>
                <p className="font-rajdhani font-bold text-food-gold text-lg">
                  1.500 FCFA / partie
                </p>
              </div>
            </div>

            {/* Restaurant */}
            <div className="group relative overflow-hidden rounded-lg bg-dark-card border border-white/10 hover:border-food-gold/50 transition-all duration-500 hover-scale" data-testid="feature-restaurant">
              <div className="aspect-video overflow-hidden">
                <img
                  src="https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/pegoox6o_Combo1.JPG"
                  alt="Restaurant Espace Maxo"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>
              <div className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <UtensilsCrossed className="w-6 h-6 text-food-gold" />
                  <h3 className="font-orbitron font-bold text-xl text-food-gold">Restaurant</h3>
                </div>
                <p className="text-gray-400 font-outfit mb-4">
                  Savourez nos burgers, pizzas et cocktails dans une ambiance gaming unique.
                </p>
                <Link to="/menu" className="font-rajdhani font-bold text-neon-blue text-lg hover:underline">
                  Voir le menu →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Gallery Section - Restaurant Interior */}
      <section className="py-20 px-4 bg-dark-card" data-testid="gallery-section">
        <div className="max-w-7xl mx-auto">
          <h2 className="font-orbitron font-bold text-3xl md:text-5xl text-center mb-4">
            <span className="text-white">Notre</span>{" "}
            <span className="text-food-gold">Espace</span>
          </h2>
          <p className="text-gray-400 text-center font-outfit text-lg mb-12 max-w-2xl mx-auto">
            Un cadre élégant et chaleureux pour vos repas et moments gaming
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              "https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/xp3vbhr5_IMG_8872.jpeg",
              "https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/5hl3uu83_IMG_8873.jpeg",
              "https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/ngci0xn4_IMG_8871.jpeg",
              "https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/u6mhfjga_IMG_8870.jpeg",
              "https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/o2ezqt66_IMG_8869.jpeg"
            ].map((img, index) => (
              <div 
                key={index} 
                className="group relative aspect-square overflow-hidden rounded-lg border border-white/10 hover:border-food-gold/50 transition-all duration-300"
              >
                <img
                  src={img}
                  alt={`Intérieur Espace Maxo ${index + 1}`}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-dark-bg/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-radial-red" data-testid="cta-section">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-orbitron font-bold text-3xl md:text-5xl mb-6">
            <span className="text-white">Prêt à</span>{" "}
            <span className="text-neon-red text-glow-red">Jouer?</span>
          </h2>
          <p className="text-gray-300 font-outfit text-lg mb-8 max-w-2xl mx-auto">
            Réservez votre créneau dès maintenant et venez vivre une expérience gaming inoubliable!
            <br />
            <span className="text-food-gold font-semibold">Frais de réservation: 500 FCFA</span>
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/booking" data-testid="cta-booking-button">
              <Button
                size="lg"
                className="bg-neon-blue text-black font-rajdhani font-bold text-lg uppercase px-8 py-6 hover:shadow-[0_0_30px_rgba(0,240,255,0.5)] transition-all pulse-glow"
              >
                Réserver une session
              </Button>
            </Link>
            <a href="https://wa.me/22901414700" data-testid="cta-whatsapp-button">
              <Button
                size="lg"
                variant="outline"
                className="border-white/30 text-white font-rajdhani font-bold text-lg uppercase px-8 py-6 hover:bg-white/10 transition-all"
              >
                <Phone className="w-5 h-5 mr-2" />
                WhatsApp
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Info Section */}
      <section className="py-20 px-4 bg-dark-card" data-testid="info-section">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="font-orbitron font-bold text-3xl md:text-4xl mb-6">
                <span className="text-white">Trouvez-nous à</span>
                <br />
                <span className="text-neon-blue">Cotonou</span>
              </h2>
              <div className="space-y-4 text-gray-300 font-outfit">
                <p className="text-lg">
                  <span className="text-neon-blue font-semibold">Adresse:</span><br />
                  Rue allant à la pharmacie Fidjrossè Plage, Cotonou
                </p>
                <p className="text-lg">
                  <span className="text-neon-blue font-semibold">Téléphone:</span><br />
                  01 41 47 00 00 / 01 62 39 62 39
                </p>
                <p className="text-lg">
                  <span className="text-neon-blue font-semibold">Horaires:</span><br />
                  9h - 23h (Tous les jours)
                </p>
              </div>
            </div>
            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1621886289714-384b89bcff3c?crop=entropy&cs=srgb&fm=jpg"
                alt="VR Experience"
                className="rounded-lg shadow-2xl w-full aspect-video object-cover"
              />
              <div className="absolute -bottom-4 -right-4 bg-neon-blue text-black p-4 rounded-lg font-rajdhani font-bold">
                <span className="text-2xl">1.500 FCFA</span>
                <span className="block text-sm">par partie</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
