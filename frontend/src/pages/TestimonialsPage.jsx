import { useState } from "react";
import { Star, Quote, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const TESTIMONIALS = [
  {
    id: 1,
    name: "Kossi Adjonou",
    role: "Client régulier",
    avatar: "KA",
    rating: 5,
    text: "Espace Maxo c'est vraiment le top à Cotonou ! Les jeux VR sont incroyables, mes enfants adorent. Et les burgers sont délicieux. On y va chaque weekend maintenant !",
    date: "Janvier 2026"
  },
  {
    id: 2,
    name: "Mariette Dossou",
    role: "Anniversaire enfant",
    avatar: "MD",
    rating: 5,
    text: "J'ai organisé l'anniversaire de mon fils ici. Le personnel est très accueillant, les enfants se sont éclatés avec le simulateur de course. Le combo burger + jeu est parfait !",
    date: "Décembre 2025"
  },
  {
    id: 3,
    name: "Patrick Hounkpatin",
    role: "Amateur de gaming",
    avatar: "PH",
    rating: 5,
    text: "Le simulateur SONY est vraiment professionnel, on se croirait dans une vraie voiture de course ! Et à 1500 FCFA la partie c'est vraiment abordable. Je recommande à 100%.",
    date: "Février 2026"
  },
  {
    id: 4,
    name: "Aïcha Mama",
    role: "Sortie entre amis",
    avatar: "AM",
    rating: 4,
    text: "Cadre très sympa pour sortir entre amis. On a testé le VR 360° et on a bien rigolé ! La Pizza Maxo est excellente. Seul petit bémol : parfois il y a du monde le weekend.",
    date: "Janvier 2026"
  },
  {
    id: 5,
    name: "Rodrigue Assogba",
    role: "Famille",
    avatar: "RA",
    rating: 5,
    text: "Enfin un endroit à Cotonou où on peut manger et s'amuser en famille ! Le personnel est aux petits soins. Les combos sont généreux. On reviendra c'est sûr !",
    date: "Février 2026"
  },
  {
    id: 6,
    name: "Grâce Tossou",
    role: "Première visite",
    avatar: "GT",
    rating: 5,
    text: "J'ai découvert Espace Maxo grâce à un ami. L'expérience VR est impressionnante ! Le cocktail de fruits frais est délicieux. L'ambiance gaming est vraiment unique.",
    date: "Février 2026"
  }
];

const StarRating = ({ rating }) => (
  <div className="flex gap-1">
    {[1, 2, 3, 4, 5].map((star) => (
      <Star
        key={star}
        className={`w-4 h-4 ${
          star <= rating ? "text-food-gold fill-food-gold" : "text-gray-600"
        }`}
      />
    ))}
  </div>
);

const TestimonialCard = ({ testimonial, featured = false }) => (
  <div
    className={`bg-dark-card border border-white/10 rounded-xl p-6 hover:border-neon-blue/30 transition-all ${
      featured ? "md:col-span-2 lg:col-span-1" : ""
    }`}
    data-testid={`testimonial-${testimonial.id}`}
  >
    <div className="flex items-start gap-4 mb-4">
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-neon-blue to-neon-purple flex items-center justify-center text-white font-bold font-rajdhani">
        {testimonial.avatar}
      </div>
      <div className="flex-1">
        <h4 className="font-outfit font-semibold text-white">{testimonial.name}</h4>
        <p className="text-gray-500 text-sm">{testimonial.role}</p>
      </div>
      <Quote className="w-8 h-8 text-neon-blue/30" />
    </div>
    
    <StarRating rating={testimonial.rating} />
    
    <p className="text-gray-300 font-outfit mt-4 leading-relaxed">
      "{testimonial.text}"
    </p>
    
    <p className="text-gray-600 text-sm mt-4 font-outfit">{testimonial.date}</p>
  </div>
);

// Section for HomePage
export const TestimonialsSection = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const displayedTestimonials = TESTIMONIALS.slice(0, 3);

  return (
    <section className="py-20 px-4 bg-dark-bg" data-testid="testimonials-section">
      <div className="max-w-7xl mx-auto">
        <h2 className="font-orbitron font-bold text-3xl md:text-5xl text-center mb-4">
          <span className="text-white">Ils nous ont</span>{" "}
          <span className="text-neon-blue">fait confiance</span>
        </h2>
        <p className="text-gray-400 text-center font-outfit text-lg mb-12 max-w-2xl mx-auto">
          Découvrez les avis de nos clients satisfaits
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedTestimonials.map((testimonial) => (
            <TestimonialCard key={testimonial.id} testimonial={testimonial} />
          ))}
        </div>

        {/* Stats */}
        <div className="mt-12 grid grid-cols-3 gap-4 max-w-2xl mx-auto">
          <div className="text-center">
            <p className="font-rajdhani font-bold text-3xl text-neon-blue">500+</p>
            <p className="text-gray-500 text-sm font-outfit">Clients satisfaits</p>
          </div>
          <div className="text-center">
            <p className="font-rajdhani font-bold text-3xl text-food-gold">4.8</p>
            <p className="text-gray-500 text-sm font-outfit">Note moyenne</p>
          </div>
          <div className="text-center">
            <p className="font-rajdhani font-bold text-3xl text-neon-red">98%</p>
            <p className="text-gray-500 text-sm font-outfit">Recommandent</p>
          </div>
        </div>
      </div>
    </section>
  );
};

// Full Page Component
const TestimonialsPage = () => {
  const averageRating = (TESTIMONIALS.reduce((acc, t) => acc + t.rating, 0) / TESTIMONIALS.length).toFixed(1);

  return (
    <div className="min-h-screen pt-20 bg-dark-bg" data-testid="testimonials-page">
      {/* Hero */}
      <section className="py-16 px-4 bg-dark-card border-b border-white/10">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="font-orbitron font-bold text-3xl md:text-5xl mb-4">
            <span className="text-white">Avis</span>{" "}
            <span className="text-neon-blue">Clients</span>
          </h1>
          <p className="text-gray-400 font-outfit text-lg mb-8">
            Ce que nos clients pensent d'Espace Maxo
          </p>

          {/* Overall Rating */}
          <div className="inline-flex items-center gap-4 bg-surface-highlight px-8 py-4 rounded-xl">
            <div className="text-center">
              <p className="font-rajdhani font-bold text-5xl text-food-gold">{averageRating}</p>
              <div className="flex gap-1 justify-center mt-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star key={star} className="w-5 h-5 text-food-gold fill-food-gold" />
                ))}
              </div>
            </div>
            <div className="h-12 w-px bg-white/20"></div>
            <div className="text-left">
              <p className="text-white font-outfit font-semibold">{TESTIMONIALS.length} avis</p>
              <p className="text-gray-500 text-sm">clients vérifiés</p>
            </div>
          </div>
        </div>
      </section>

      {/* All Testimonials */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {TESTIMONIALS.map((testimonial) => (
              <TestimonialCard key={testimonial.id} testimonial={testimonial} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 bg-gradient-radial-blue">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-orbitron font-bold text-2xl md:text-3xl text-white mb-4">
            Prêt à vivre l'expérience ?
          </h2>
          <p className="text-gray-300 font-outfit mb-6">
            Rejoignez nos clients satisfaits et découvrez Espace Maxo !
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/booking">
              <Button className="bg-neon-red text-white font-rajdhani font-bold px-8 py-6 text-lg">
                Réserver maintenant
              </Button>
            </a>
            <a href="https://wa.me/22901414700">
              <Button variant="outline" className="border-white text-white font-rajdhani font-bold px-8 py-6 text-lg hover:bg-white/10">
                Nous contacter
              </Button>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};

export default TestimonialsPage;
