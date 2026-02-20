import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Gamepad2, UtensilsCrossed, Calendar, Phone, ChevronRight } from "lucide-react";
import ImageLightbox from "@/components/ImageLightbox";
import { TestimonialsSection } from "@/pages/TestimonialsPage";

const INTERIOR_IMAGES = [
  "https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/xp3vbhr5_IMG_8872.jpeg",
  "https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/5hl3uu83_IMG_8873.jpeg",
  "https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/ngci0xn4_IMG_8871.jpeg",
  "https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/u6mhfjga_IMG_8870.jpeg",
  "https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/o2ezqt66_IMG_8869.jpeg"
];

const HomePage = () => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const openLightbox = (index) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  return (
    <div className="min-h-screen" data-testid="home-page">
      {/* Lightbox */}
      <ImageLightbox 
        images={INTERIOR_IMAGES}
        initialIndex={lightboxIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
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
                  src="https://customer-assets.emergentagent.com/job_ef6106ad-2a78-46b4-9069-e8f0a2d9a6b0/artifacts/lby7ebs2_Simulateur.JPG"
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
                  src="https://customer-assets.emergentagent.com/job_vr-gaming-hub-1/artifacts/xp3vbhr5_IMG_8872.jpeg"
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
            {INTERIOR_IMAGES.map((img, index) => (
              <button
                key={index}
                onClick={() => openLightbox(index)}
                className="group relative aspect-square overflow-hidden rounded-lg border border-white/10 hover:border-food-gold/50 transition-all duration-300 cursor-pointer"
                data-testid={`gallery-image-${index}`}
              >
                <img
                  src={img}
                  alt={`Intérieur Espace Maxo ${index + 1}`}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-dark-bg/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="bg-food-gold/90 text-black px-3 py-1 rounded-full text-sm font-outfit font-semibold transform translate-y-4 group-hover:translate-y-0 transition-transform">
                    Voir
                  </span>
                </div>
              </button>
            ))}
          </div>
          
          <p className="text-center text-gray-500 text-sm mt-4 font-outfit">
            Cliquez sur une image pour l'agrandir
          </p>
        </div>
      </section>

      {/* Testimonials Section */}
      <TestimonialsSection />

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
                  À côté de la Pharmacie Fidjrossè Plage<br />
                  Cotonou, Bénin
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
              
              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3 mt-6">
                <a 
                  href="https://maps.google.com/?q=Pharmacie+Fidjrosse+Plage+Cotonou+Benin"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-neon-blue text-black px-4 py-2 rounded-lg font-rajdhani font-bold hover:shadow-[0_0_20px_rgba(0,240,255,0.5)] transition-all"
                  data-testid="open-google-maps"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                  </svg>
                  Itinéraire
                </a>
                <a 
                  href="https://wa.me/22901414700"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg font-rajdhani font-bold hover:bg-green-500 transition-all"
                  data-testid="contact-whatsapp"
                >
                  <Phone className="w-5 h-5" />
                  WhatsApp
                </a>
              </div>
            </div>
            
            {/* Google Maps Embed */}
            <div className="relative">
              <div className="rounded-xl overflow-hidden border-2 border-white/10 shadow-2xl">
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d1982.8!2d2.3156!3d6.3478!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x1024a9b5c3d5f7a7%3A0x8f7c5e7c5b5f5f5f!2sPharmacie%20Fidjross%C3%A8%20Plage!5e0!3m2!1sfr!2sbj!4v1700000000000!5m2!1sfr!2sbj"
                  width="100%"
                  height="350"
                  style={{ border: 0 }}
                  allowFullScreen=""
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Espace Maxo - À côté de la Pharmacie Fidjrossè Plage, Cotonou"
                  className="grayscale hover:grayscale-0 transition-all duration-500"
                  data-testid="google-map-embed"
                ></iframe>
              </div>
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
