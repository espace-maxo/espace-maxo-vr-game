import { Link } from "react-router-dom";
import { Phone, MapPin, Clock, Gamepad2, CalendarClock } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-dark-card border-t border-white/10 py-12" data-testid="footer">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Gamepad2 className="w-8 h-8 text-neon-blue" />
              <span className="font-orbitron font-bold text-xl tracking-wider text-white">
                ESPACE <span className="text-neon-blue">MAXO</span>
              </span>
            </div>
            <p className="text-gray-400 font-outfit">
              Restaurant et centre de jeux VR à Cotonou. Vivez une expérience unique!
            </p>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h3 className="font-orbitron font-bold text-lg text-neon-blue uppercase">Liens utiles</h3>
            <div className="space-y-3">
              <Link
                to="/reprogrammer"
                className="flex items-center gap-3 text-gray-300 hover:text-neon-blue transition-colors"
                data-testid="footer-reschedule"
              >
                <CalendarClock className="w-5 h-5 text-neon-blue" />
                <span className="font-outfit">Reprogrammer ma réservation</span>
              </Link>
              <Link
                to="/location"
                className="flex items-center gap-3 text-gray-300 hover:text-food-gold transition-colors"
                data-testid="footer-location"
              >
                <Gamepad2 className="w-5 h-5 text-food-gold" />
                <span className="font-outfit">Location événementielle</span>
              </Link>
            </div>
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <h3 className="font-orbitron font-bold text-lg text-neon-blue uppercase">Contact</h3>
            <div className="space-y-3">
              <a
                href="tel:+2290141470000"
                className="flex items-center gap-3 text-gray-300 hover:text-neon-blue transition-colors"
                data-testid="footer-phone-1"
              >
                <Phone className="w-5 h-5 text-neon-blue" />
                <span className="font-outfit">01 41 47 00 00</span>
              </a>
              <a
                href="https://wa.me/2290141470000"
                className="flex items-center gap-3 text-gray-300 hover:text-green-500 transition-colors"
                data-testid="footer-whatsapp"
              >
                <Phone className="w-5 h-5 text-green-500" />
                <span className="font-outfit">WhatsApp: 01 41 47 00 00</span>
              </a>
            </div>
          </div>

          {/* Address & Hours */}
          <div className="space-y-4">
            <h3 className="font-orbitron font-bold text-lg text-neon-blue uppercase">Adresse</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3 text-gray-300">
                <MapPin className="w-5 h-5 text-neon-blue flex-shrink-0 mt-1" />
                <span className="font-outfit">
                  À côté de la Pharmacie Fidjrossè Plage<br />
                  Cotonou, Bénin
                </span>
              </div>
              <div className="flex items-center gap-3 text-gray-300">
                <Clock className="w-5 h-5 text-neon-blue" />
                <span className="font-outfit">9h - 23h (Tous les jours)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 pt-8 border-t border-white/10 text-center">
          <p className="text-gray-500 font-outfit text-sm">
            © 2024 Espace Maxo. Tous droits réservés.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
