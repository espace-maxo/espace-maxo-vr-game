import { useState } from "react";
import { HelpCircle, X, Wallet, Calendar, CalendarClock, Gift, Star, Phone, CreditCard, MapPin, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const HelpButton = () => {
  const [isOpen, setIsOpen] = useState(false);

  const helpSections = [
    {
      icon: <Calendar className="w-6 h-6 text-neon-blue" />,
      title: "Réserver une session",
      steps: [
        "Cliquez sur 'RÉSERVER' dans le menu",
        "Remplissez vos informations (nom, téléphone)",
        "Choisissez le type de jeu (VR 360° ou Simulateur)",
        "Sélectionnez une date et un créneau horaire",
        "Payez les frais de réservation (500 FCFA) via Mobile Money",
        "Recevez votre confirmation!"
      ]
    },
    {
      icon: <Wallet className="w-6 h-6 text-green-500" />,
      title: "Ma Provision (Portefeuille)",
      steps: [
        "Accédez à 'Ma Provision' via le footer",
        "Entrez votre numéro de téléphone",
        "Rechargez votre solde via MTN, Moov ou Celtiis",
        "Utilisez votre solde pour payer vos réservations",
        "Consultez l'historique de vos transactions"
      ]
    },
    {
      icon: <CalendarClock className="w-6 h-6 text-neon-blue" />,
      title: "Reprogrammer une réservation",
      steps: [
        "Cliquez sur 'REPROGRAMMER' dans le menu",
        "Entrez votre numéro de téléphone et nom exact",
        "Choisissez une nouvelle date et heure",
        "Gratuit si > 15 min avant la session",
        "⚠️ Une seule reprogrammation autorisée"
      ]
    },
    {
      icon: <Gift className="w-6 h-6 text-food-gold" />,
      title: "Programme de Fidélité",
      steps: [
        "Gagnez 10 points par partie payée",
        "100 points = 1 partie gratuite",
        "Points liés à votre numéro de téléphone",
        "Consultez vos points lors de la réservation"
      ]
    },
    {
      icon: <PartyPopper className="w-6 h-6 text-neon-red" />,
      title: "Location pour Événements",
      steps: [
        "Accédez à 'Location événementielle' via le footer",
        "Remplissez le formulaire de demande",
        "Anniversaires, séminaires, team building...",
        "Nous vous recontacterons sous 24h"
      ]
    },
    {
      icon: <Star className="w-6 h-6 text-yellow-500" />,
      title: "Laisser un Avis",
      steps: [
        "Cliquez sur 'AVIS' dans le menu",
        "Remplissez le formulaire d'avis",
        "Votre avis sera publié après validation"
      ]
    }
  ];

  return (
    <>
      {/* Floating Help Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-6 z-50 bg-neon-blue text-black p-4 rounded-full shadow-lg hover:shadow-[0_0_20px_rgba(0,240,255,0.5)] transition-all duration-300 group"
        data-testid="help-button"
      >
        <HelpCircle className="w-6 h-6" />
        <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-dark-card text-white px-3 py-1 rounded-lg text-sm font-outfit whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
          Aide & Assistance
        </span>
      </button>

      {/* Help Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="bg-dark-card border-white/10 text-white max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-orbitron text-2xl text-neon-blue flex items-center gap-3">
              <HelpCircle className="w-7 h-7" />
              Aide & Assistance
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4 space-y-6">
            {/* Contact Info */}
            <div className="bg-neon-blue/10 border border-neon-blue/30 rounded-lg p-4">
              <h3 className="font-rajdhani font-bold text-lg text-neon-blue mb-2">Besoin d'aide ?</h3>
              <div className="flex flex-wrap gap-4 text-sm">
                <a href="tel:+2290141470000" className="flex items-center gap-2 text-gray-300 hover:text-white">
                  <Phone className="w-4 h-4 text-neon-blue" />
                  01 41 47 00 00
                </a>
                <a href="https://wa.me/2290141470000" className="flex items-center gap-2 text-gray-300 hover:text-green-500">
                  <Phone className="w-4 h-4 text-green-500" />
                  WhatsApp
                </a>
                <span className="flex items-center gap-2 text-gray-300">
                  <MapPin className="w-4 h-4 text-neon-red" />
                  Fidjrossè Plage, Cotonou
                </span>
              </div>
            </div>

            {/* Help Sections */}
            {helpSections.map((section, index) => (
              <div key={index} className="border border-white/10 rounded-lg p-4 hover:border-white/20 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  {section.icon}
                  <h3 className="font-rajdhani font-bold text-lg text-white">{section.title}</h3>
                </div>
                <ol className="space-y-2 ml-9">
                  {section.steps.map((step, stepIndex) => (
                    <li key={stepIndex} className="text-gray-400 font-outfit text-sm flex items-start gap-2">
                      <span className="text-neon-blue font-bold min-w-[20px]">{stepIndex + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}

            {/* Payment Methods */}
            <div className="bg-surface-highlight rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <CreditCard className="w-6 h-6 text-food-gold" />
                <h3 className="font-rajdhani font-bold text-lg text-white">Moyens de Paiement</h3>
              </div>
              <div className="flex flex-wrap gap-4 ml-9">
                <span className="text-food-gold font-rajdhani font-bold">MTN MoMo</span>
                <span className="text-neon-blue font-rajdhani font-bold">Moov Money</span>
                <span className="text-neon-red font-rajdhani font-bold">Celtiis</span>
              </div>
            </div>

            {/* Opening Hours */}
            <div className="text-center text-gray-500 font-outfit text-sm border-t border-white/10 pt-4">
              <p>🕘 Ouvert tous les jours de <strong className="text-white">9h à 23h</strong></p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default HelpButton;
