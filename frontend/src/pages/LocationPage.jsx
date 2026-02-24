import { useState } from "react";
import axios from "axios";
import { 
  PartyPopper, User, Phone, Mail, Building2, Calendar, Clock, Users,
  CheckCircle, Loader2, Send, Cake, Heart, Briefcase, Wine, Rocket, Star,
  Music, Monitor, Gamepad2, Camera, Shield, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const EVENT_TYPES = [
  { id: "anniversaire", label: "Anniversaire", icon: Cake },
  { id: "mariage", label: "Mariage / Fiançailles", icon: Heart },
  { id: "seminaire", label: "Séminaire / Formation", icon: Briefcase },
  { id: "afterwork", label: "Afterwork", icon: Wine },
  { id: "soiree", label: "Soirée privée", icon: Star },
  { id: "lancement", label: "Lancement de produit", icon: Rocket },
];

const FORMULAS = [
  { id: "location_simple", label: "Location simple de l'espace" },
  { id: "location_restauration", label: "Location + Restauration" },
  { id: "location_restauration_boissons", label: "Location + Restauration + Boissons" },
  { id: "personnalisee", label: "Formule personnalisée" },
];

const BUDGETS = [
  { id: "moins_300k", label: "Moins de 300.000 FCFA" },
  { id: "300k_700k", label: "300.000 – 700.000 FCFA" },
  { id: "700k_1500k", label: "700.000 – 1.500.000 FCFA" },
  { id: "plus_1500k", label: "Plus de 1.500.000 FCFA" },
];

const SERVICES = [
  { id: "decoration", label: "Décoration", icon: Sparkles },
  { id: "dj", label: "DJ / Animation", icon: Music },
  { id: "ecran", label: "Écran / Vidéoprojecteur", icon: Monitor },
  { id: "jeux", label: "Jeux immersifs / simulateurs", icon: Gamepad2 },
  { id: "photo", label: "Photographe / Vidéaste", icon: Camera },
  { id: "securite", label: "Sécurité", icon: Shield },
];

const LocationPage = () => {
  const [formData, setFormData] = useState({
    // Section 1: Demandeur
    fullName: "",
    phone: "",
    email: "",
    company: "",
    // Section 2: Événement
    eventType: "",
    otherEventType: "",
    eventDate: "",
    startTime: "",
    endTime: "",
    guestCount: "",
    // Section 3: Formule
    formula: "",
    budget: "",
    // Section 4: Services
    services: [],
    otherService: "",
    // Section 5: Message
    message: "",
    // Section 6: Validation
    confirmInfo: false,
    acceptContact: false,
  });

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleService = (serviceId) => {
    setFormData(prev => ({
      ...prev,
      services: prev.services.includes(serviceId)
        ? prev.services.filter(s => s !== serviceId)
        : [...prev.services, serviceId]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!formData.fullName || !formData.phone) {
      toast.error("Veuillez remplir votre nom et téléphone");
      return;
    }
    if (!formData.eventType) {
      toast.error("Veuillez sélectionner un type d'événement");
      return;
    }
    if (!formData.eventDate) {
      toast.error("Veuillez sélectionner une date");
      return;
    }
    if (!formData.confirmInfo || !formData.acceptContact) {
      toast.error("Veuillez valider les conditions");
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/location-requests`, formData);
      setSubmitted(true);
      toast.success("Demande envoyée avec succès !");
    } catch (error) {
      console.error("Error submitting:", error);
      toast.error("Erreur lors de l'envoi. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen pt-20 bg-dark-bg flex items-center justify-center px-4">
        <div className="max-w-lg text-center">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h1 className="font-orbitron font-bold text-3xl text-white mb-4">
            Demande Envoyée !
          </h1>
          <p className="text-gray-400 font-outfit text-lg mb-8">
            Merci pour votre demande de location. Notre équipe vous contactera sous 24h avec une proposition adaptée à votre budget.
          </p>
          <a href="/">
            <Button className="bg-neon-blue text-black font-rajdhani font-bold px-8 py-6 text-lg">
              Retour à l'accueil
            </Button>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 bg-dark-bg" data-testid="location-page">
      {/* Hero */}
      <section className="py-12 px-4 bg-gradient-to-b from-neon-purple/20 to-transparent">
        <div className="max-w-4xl mx-auto text-center">
          <div className="w-16 h-16 bg-neon-purple/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <PartyPopper className="w-8 h-8 text-neon-purple" />
          </div>
          <h1 className="font-orbitron font-bold text-3xl md:text-5xl mb-4">
            <span className="text-white">Location</span>{" "}
            <span className="text-neon-purple">Événementielle</span>
          </h1>
          <p className="text-gray-400 font-outfit text-lg max-w-2xl mx-auto">
            Anniversaires, mariages, séminaires, soirées privées... 
            Transformez Espace Maxo en lieu unique pour vos événements !
          </p>
        </div>
      </section>

      {/* Form */}
      <section className="py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="space-y-8">
            
            {/* Section 1: Informations du demandeur */}
            <div className="bg-dark-card rounded-xl p-6 md:p-8 border border-white/10">
              <h2 className="font-orbitron font-bold text-xl text-neon-blue mb-6 flex items-center gap-2">
                <User className="w-5 h-5" />
                1. Informations du demandeur
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-rajdhani font-semibold text-white">Nom & Prénom *</Label>
                  <Input
                    placeholder="Votre nom complet"
                    value={formData.fullName}
                    onChange={(e) => handleInputChange("fullName", e.target.value)}
                    className="bg-surface-highlight border-white/20 text-white"
                    data-testid="input-fullname"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="font-rajdhani font-semibold text-white">Téléphone (WhatsApp) *</Label>
                  <Input
                    placeholder="01 XX XX XX XX"
                    value={formData.phone}
                    onChange={(e) => handleInputChange("phone", e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="bg-surface-highlight border-white/20 text-white"
                    data-testid="input-phone"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="font-rajdhani font-semibold text-white">Email</Label>
                  <Input
                    type="email"
                    placeholder="votre@email.com"
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    className="bg-surface-highlight border-white/20 text-white"
                    data-testid="input-email"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="font-rajdhani font-semibold text-white">Entreprise / Organisation</Label>
                  <Input
                    placeholder="Si applicable"
                    value={formData.company}
                    onChange={(e) => handleInputChange("company", e.target.value)}
                    className="bg-surface-highlight border-white/20 text-white"
                    data-testid="input-company"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Informations sur l'événement */}
            <div className="bg-dark-card rounded-xl p-6 md:p-8 border border-white/10">
              <h2 className="font-orbitron font-bold text-xl text-neon-blue mb-6 flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                2. Informations sur l'événement
              </h2>
              
              <div className="space-y-6">
                {/* Event Type */}
                <div className="space-y-3">
                  <Label className="font-rajdhani font-semibold text-white">Type d'événement *</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {EVENT_TYPES.map((type) => {
                      const Icon = type.icon;
                      return (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => handleInputChange("eventType", type.id)}
                          className={`p-4 rounded-lg border-2 text-left transition-all flex items-center gap-3 ${
                            formData.eventType === type.id
                              ? "border-neon-purple bg-neon-purple/10"
                              : "border-white/10 hover:border-white/30"
                          }`}
                        >
                          <Icon className={`w-5 h-5 ${formData.eventType === type.id ? "text-neon-purple" : "text-gray-400"}`} />
                          <span className={`font-outfit text-sm ${formData.eventType === type.id ? "text-neon-purple" : "text-white"}`}>
                            {type.label}
                          </span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => handleInputChange("eventType", "autre")}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        formData.eventType === "autre"
                          ? "border-neon-purple bg-neon-purple/10"
                          : "border-white/10 hover:border-white/30"
                      }`}
                    >
                      <span className={`font-outfit text-sm ${formData.eventType === "autre" ? "text-neon-purple" : "text-white"}`}>
                        Autre
                      </span>
                    </button>
                  </div>
                  {formData.eventType === "autre" && (
                    <Input
                      placeholder="Précisez le type d'événement"
                      value={formData.otherEventType}
                      onChange={(e) => handleInputChange("otherEventType", e.target.value)}
                      className="bg-surface-highlight border-white/20 text-white mt-2"
                    />
                  )}
                </div>

                {/* Date & Time */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="font-rajdhani font-semibold text-white">Date souhaitée *</Label>
                    <Input
                      type="date"
                      value={formData.eventDate}
                      onChange={(e) => handleInputChange("eventDate", e.target.value)}
                      className="bg-surface-highlight border-white/20 text-white"
                      data-testid="input-date"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="font-rajdhani font-semibold text-white">Heure de début</Label>
                    <Input
                      type="time"
                      value={formData.startTime}
                      onChange={(e) => handleInputChange("startTime", e.target.value)}
                      className="bg-surface-highlight border-white/20 text-white"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="font-rajdhani font-semibold text-white">Heure de fin</Label>
                    <Input
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => handleInputChange("endTime", e.target.value)}
                      className="bg-surface-highlight border-white/20 text-white"
                    />
                  </div>
                </div>

                {/* Guest Count */}
                <div className="space-y-2">
                  <Label className="font-rajdhani font-semibold text-white">Nombre estimé d'invités</Label>
                  <Input
                    type="number"
                    placeholder="Ex: 50"
                    value={formData.guestCount}
                    onChange={(e) => handleInputChange("guestCount", e.target.value)}
                    className="bg-surface-highlight border-white/20 text-white max-w-xs"
                    data-testid="input-guests"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Formule souhaitée */}
            <div className="bg-dark-card rounded-xl p-6 md:p-8 border border-white/10">
              <h2 className="font-orbitron font-bold text-xl text-neon-blue mb-6 flex items-center gap-2">
                <Star className="w-5 h-5" />
                3. Formule souhaitée
              </h2>
              
              <div className="space-y-6">
                {/* Formulas */}
                <div className="space-y-3">
                  {FORMULAS.map((formula) => (
                    <label
                      key={formula.id}
                      className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        formData.formula === formula.id
                          ? "border-food-gold bg-food-gold/10"
                          : "border-white/10 hover:border-white/30"
                      }`}
                    >
                      <input
                        type="radio"
                        name="formula"
                        value={formula.id}
                        checked={formData.formula === formula.id}
                        onChange={(e) => handleInputChange("formula", e.target.value)}
                        className="w-4 h-4 accent-food-gold"
                      />
                      <span className={`font-outfit ${formData.formula === formula.id ? "text-food-gold" : "text-white"}`}>
                        {formula.label}
                      </span>
                    </label>
                  ))}
                </div>

                {/* Budget */}
                <div className="space-y-3">
                  <Label className="font-rajdhani font-semibold text-white">Budget estimatif</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {BUDGETS.map((budget) => (
                      <label
                        key={budget.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          formData.budget === budget.id
                            ? "border-green-500 bg-green-500/10"
                            : "border-white/10 hover:border-white/30"
                        }`}
                      >
                        <input
                          type="radio"
                          name="budget"
                          value={budget.id}
                          checked={formData.budget === budget.id}
                          onChange={(e) => handleInputChange("budget", e.target.value)}
                          className="w-4 h-4 accent-green-500"
                        />
                        <span className={`font-outfit text-sm ${formData.budget === budget.id ? "text-green-400" : "text-white"}`}>
                          {budget.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 4: Besoins spécifiques */}
            <div className="bg-dark-card rounded-xl p-6 md:p-8 border border-white/10">
              <h2 className="font-orbitron font-bold text-xl text-neon-blue mb-6 flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                4. Besoins spécifiques
              </h2>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {SERVICES.map((service) => {
                  const Icon = service.icon;
                  const isSelected = formData.services.includes(service.id);
                  return (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => toggleService(service.id)}
                      className={`p-4 rounded-lg border-2 text-left transition-all flex items-center gap-3 ${
                        isSelected
                          ? "border-neon-red bg-neon-red/10"
                          : "border-white/10 hover:border-white/30"
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${isSelected ? "text-neon-red" : "text-gray-400"}`} />
                      <span className={`font-outfit text-sm ${isSelected ? "text-neon-red" : "text-white"}`}>
                        {service.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              
              <div className="mt-4 space-y-2">
                <Label className="font-rajdhani font-semibold text-white">Autre besoin</Label>
                <Input
                  placeholder="Précisez si nécessaire..."
                  value={formData.otherService}
                  onChange={(e) => handleInputChange("otherService", e.target.value)}
                  className="bg-surface-highlight border-white/20 text-white"
                />
              </div>
            </div>

            {/* Section 5: Message complémentaire */}
            <div className="bg-dark-card rounded-xl p-6 md:p-8 border border-white/10">
              <h2 className="font-orbitron font-bold text-xl text-neon-blue mb-6 flex items-center gap-2">
                <Mail className="w-5 h-5" />
                5. Message complémentaire
              </h2>
              
              <Textarea
                placeholder="Expliquez-nous votre vision de l'événement..."
                value={formData.message}
                onChange={(e) => handleInputChange("message", e.target.value)}
                className="bg-surface-highlight border-white/20 text-white min-h-[150px]"
                data-testid="input-message"
              />
            </div>

            {/* Section 6: Validation */}
            <div className="bg-dark-card rounded-xl p-6 md:p-8 border border-white/10">
              <h2 className="font-orbitron font-bold text-xl text-neon-blue mb-6 flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                6. Validation
              </h2>
              
              <div className="space-y-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.confirmInfo}
                    onChange={(e) => handleInputChange("confirmInfo", e.target.checked)}
                    className="mt-1 w-5 h-5 accent-neon-blue rounded"
                  />
                  <span className="text-gray-300 font-outfit">
                    Je confirme que ces informations sont exactes
                  </span>
                </label>
                
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.acceptContact}
                    onChange={(e) => handleInputChange("acceptContact", e.target.checked)}
                    className="mt-1 w-5 h-5 accent-neon-blue rounded"
                  />
                  <span className="text-gray-300 font-outfit">
                    J'accepte d'être contacté par Espace Maxo
                  </span>
                </label>
              </div>
              
              <div className="mt-8">
                <Button
                  type="submit"
                  disabled={loading || !formData.confirmInfo || !formData.acceptContact}
                  className="w-full bg-gradient-to-r from-neon-purple to-neon-blue text-white font-rajdhani font-bold text-lg py-6 hover:shadow-[0_0_30px_rgba(139,92,246,0.5)] disabled:opacity-50"
                  data-testid="submit-button"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Envoi en cours...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5 mr-2" />
                      Demander un devis personnalisé
                    </>
                  )}
                </Button>
                
                <p className="text-center text-gray-500 font-outfit text-sm mt-4">
                  Notre équipe vous contacte sous 24h avec une proposition adaptée à votre budget.
                </p>
              </div>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
};

export default LocationPage;
