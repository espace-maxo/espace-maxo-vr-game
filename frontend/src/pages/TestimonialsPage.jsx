import { useState, useEffect } from "react";
import axios from "axios";
import { Star, Quote, Send, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Default testimonials (shown if no approved reviews)
const DEFAULT_TESTIMONIALS = [
  {
    id: "default-1",
    customer_name: "Kossi Adjonou",
    rating: 5,
    comment: "Espace Maxo c'est vraiment le top à Cotonou ! Les jeux VR sont incroyables, mes enfants adorent. Et les burgers sont délicieux. On y va chaque weekend maintenant !",
    created_at: "2026-01-15"
  },
  {
    id: "default-2",
    customer_name: "Mariette Dossou",
    rating: 5,
    comment: "J'ai organisé l'anniversaire de mon fils ici. Le personnel est très accueillant, les enfants se sont éclatés avec le simulateur de course. Le combo burger + jeu est parfait !",
    created_at: "2025-12-20"
  },
  {
    id: "default-3",
    customer_name: "Patrick Hounkpatin",
    rating: 5,
    comment: "Le simulateur SONY est vraiment professionnel, on se croirait dans une vraie voiture de course ! Et à 1500 FCFA la partie c'est vraiment abordable. Je recommande à 100%.",
    created_at: "2026-02-10"
  },
  {
    id: "default-4",
    customer_name: "Aïcha Mama",
    rating: 4,
    comment: "Cadre très sympa pour sortir entre amis. On a testé le VR 360° et on a bien rigolé ! La Pizza Maxo est excellente. Seul petit bémol : parfois il y a du monde le weekend.",
    created_at: "2026-01-25"
  },
  {
    id: "default-5",
    customer_name: "Rodrigue Assogba",
    rating: 5,
    comment: "Enfin un endroit à Cotonou où on peut manger et s'amuser en famille ! Le personnel est aux petits soins. Les combos sont généreux. On reviendra c'est sûr !",
    created_at: "2026-02-05"
  },
  {
    id: "default-6",
    customer_name: "Grâce Tossou",
    rating: 5,
    comment: "J'ai découvert Espace Maxo grâce à un ami. L'expérience VR est impressionnante ! Le cocktail de fruits frais est délicieux. L'ambiance gaming est vraiment unique.",
    created_at: "2026-02-18"
  }
];

const StarRating = ({ rating, interactive = false, onRate = () => {} }) => (
  <div className="flex gap-1">
    {[1, 2, 3, 4, 5].map((star) => (
      <Star
        key={star}
        onClick={() => interactive && onRate(star)}
        className={`w-5 h-5 transition-all ${
          star <= rating ? "text-food-gold fill-food-gold" : "text-gray-600"
        } ${interactive ? "cursor-pointer hover:scale-110" : ""}`}
      />
    ))}
  </div>
);

const TestimonialCard = ({ testimonial }) => {
  const initials = testimonial.customer_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const formatDate = (dateStr) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    } catch {
      return "";
    }
  };

  return (
    <div
      className="bg-dark-card border border-white/10 rounded-xl p-6 hover:border-neon-blue/30 transition-all"
      data-testid={`testimonial-${testimonial.id}`}
    >
      <div className="flex items-start gap-4 mb-4">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-neon-blue to-neon-purple flex items-center justify-center text-white font-bold font-rajdhani">
          {initials}
        </div>
        <div className="flex-1">
          <h4 className="font-outfit font-semibold text-white">{testimonial.customer_name}</h4>
          <p className="text-gray-500 text-sm">Client vérifié</p>
        </div>
        <Quote className="w-8 h-8 text-neon-blue/30" />
      </div>

      <StarRating rating={testimonial.rating} />

      <p className="text-gray-300 font-outfit mt-4 leading-relaxed">
        "{testimonial.comment}"
      </p>

      <p className="text-gray-600 text-sm mt-4 font-outfit capitalize">
        {formatDate(testimonial.created_at)}
      </p>
    </div>
  );
};

// Review Form Component
const ReviewForm = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    customer_name: "",
    rating: 0,
    comment: ""
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.customer_name.trim()) {
      toast.error("Veuillez entrer votre nom");
      return;
    }
    if (formData.rating === 0) {
      toast.error("Veuillez donner une note");
      return;
    }
    if (!formData.comment.trim()) {
      toast.error("Veuillez écrire un commentaire");
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/reviews`, formData);
      setSubmitted(true);
      toast.success("Merci pour votre avis !");
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Error submitting review:", error);
      toast.error("Erreur lors de l'envoi. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-dark-card border border-green-500/30 rounded-xl p-8 text-center">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h3 className="font-orbitron font-bold text-xl text-white mb-2">
          Merci pour votre avis !
        </h3>
        <p className="text-gray-400 font-outfit">
          Votre avis sera publié après validation par notre équipe.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-dark-card border border-white/10 rounded-xl p-6 md:p-8">
      <h3 className="font-orbitron font-bold text-xl text-neon-blue mb-6 flex items-center gap-2">
        <Send className="w-5 h-5" />
        Laissez votre avis
      </h3>

      <div className="space-y-6">
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="name" className="font-rajdhani font-semibold text-white">
            Votre nom *
          </Label>
          <Input
            id="name"
            placeholder="Ex: Jean Dupont"
            value={formData.customer_name}
            onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
            className="bg-surface-highlight border-white/20 text-white placeholder:text-gray-500"
            data-testid="review-name-input"
          />
        </div>

        {/* Rating */}
        <div className="space-y-2">
          <Label className="font-rajdhani font-semibold text-white">
            Votre note *
          </Label>
          <div className="flex items-center gap-4">
            <StarRating
              rating={formData.rating}
              interactive={true}
              onRate={(rating) => setFormData({ ...formData, rating })}
            />
            <span className="text-gray-400 font-outfit text-sm">
              {formData.rating > 0 ? `${formData.rating}/5` : "Cliquez pour noter"}
            </span>
          </div>
        </div>

        {/* Comment */}
        <div className="space-y-2">
          <Label htmlFor="comment" className="font-rajdhani font-semibold text-white">
            Votre commentaire *
          </Label>
          <Textarea
            id="comment"
            placeholder="Partagez votre expérience chez Espace Maxo..."
            value={formData.comment}
            onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
            className="bg-surface-highlight border-white/20 text-white placeholder:text-gray-500 min-h-[120px]"
            data-testid="review-comment-input"
          />
        </div>

        {/* Submit */}
        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-neon-blue text-black font-rajdhani font-bold text-lg py-6 hover:shadow-[0_0_20px_rgba(0,240,255,0.5)]"
          data-testid="review-submit-button"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Envoi en cours...
            </>
          ) : (
            <>
              <Send className="w-5 h-5 mr-2" />
              Envoyer mon avis
            </>
          )}
        </Button>

        <p className="text-gray-500 text-xs text-center font-outfit">
          Votre avis sera publié après validation par notre équipe.
        </p>
      </div>
    </form>
  );
};

// Section for HomePage
export const TestimonialsSection = () => {
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    const fetchReviews = async () => {
      try {
        const response = await axios.get(`${API}/reviews`);
        if (response.data.reviews && response.data.reviews.length > 0) {
          setReviews(response.data.reviews.slice(0, 3));
        } else {
          setReviews(DEFAULT_TESTIMONIALS.slice(0, 3));
        }
      } catch {
        setReviews(DEFAULT_TESTIMONIALS.slice(0, 3));
      }
    };
    fetchReviews();
  }, []);

  const displayedTestimonials = reviews.length > 0 ? reviews : DEFAULT_TESTIMONIALS.slice(0, 3);

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

        {/* Laisser un avis button */}
        <div className="mt-12 text-center">
          <a 
            href="/avis" 
            className="inline-flex items-center gap-2 bg-neon-blue hover:bg-neon-blue/80 text-black font-rajdhani font-bold text-lg px-8 py-4 rounded-full shadow-[0_0_20px_rgba(0,240,255,0.4)] hover:shadow-[0_0_30px_rgba(0,240,255,0.6)] transition-all"
            data-testid="leave-review-btn"
          >
            <Star className="w-5 h-5" />
            LAISSER UN AVIS
          </a>
        </div>
      </div>
    </section>
  );
};

// Full Page Component
const TestimonialsPage = () => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchReviews = async () => {
    try {
      const response = await axios.get(`${API}/reviews`);
      if (response.data.reviews && response.data.reviews.length > 0) {
        setReviews(response.data.reviews);
      } else {
        setReviews(DEFAULT_TESTIMONIALS);
      }
    } catch {
      setReviews(DEFAULT_TESTIMONIALS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  const displayedTestimonials = reviews.length > 0 ? reviews : DEFAULT_TESTIMONIALS;
  const averageRating = (
    displayedTestimonials.reduce((acc, t) => acc + t.rating, 0) / displayedTestimonials.length
  ).toFixed(1);

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
              <p className="text-white font-outfit font-semibold">{displayedTestimonials.length} avis</p>
              <p className="text-gray-500 text-sm">clients vérifiés</p>
            </div>
          </div>
        </div>
      </section>

      {/* All Testimonials */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedTestimonials.map((testimonial) => (
              <TestimonialCard key={testimonial.id} testimonial={testimonial} />
            ))}
          </div>
        </div>
      </section>

      {/* Review Form */}
      <section className="py-16 px-4 bg-dark-card border-t border-white/10">
        <div className="max-w-2xl mx-auto">
          <ReviewForm onSuccess={fetchReviews} />
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
            <a href="https://wa.me/2290141470000">
              <Button
                variant="outline"
                className="border-white text-white font-rajdhani font-bold px-8 py-6 text-lg hover:bg-white/10"
              >
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
