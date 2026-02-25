import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, Gamepad2, Phone, Lock, CalendarClock, Truck, Wallet, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const navLinks = [
    { label: "Accueil", path: "/" },
    { label: "Combos", path: "/menu" },
    { label: "Livraison", path: "/livraison", icon: "truck" },
    { label: "Nous Rejoindre", path: "/rejoindre", icon: "users" },
    { label: "Mon Porte-Monnaie", path: "/provision", icon: "wallet" },
    { label: "Avis", path: "/avis" },
    { label: "Admin", path: "/admin", icon: "lock" },
  ];

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + "/");

  const getIcon = (iconType) => {
    switch (iconType) {
      case "wallet":
        return <Wallet className="w-4 h-4" />;
      case "lock":
        return <Lock className="w-4 h-4" />;
      case "truck":
        return <Truck className="w-4 h-4" />;
      case "users":
        return <Users className="w-4 h-4" />;
      default:
        return null;
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-card" data-testid="navbar">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2" data-testid="logo-link">
            <Gamepad2 className="w-8 h-8 text-neon-blue" />
            <span className="font-orbitron font-bold text-xl md:text-2xl tracking-wider text-white">
              ESPACE <span className="text-neon-blue">MAXO</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`font-rajdhani font-semibold text-base uppercase tracking-wide transition-all duration-300 hover:text-neon-blue flex items-center gap-1 ${
                  isActive(link.path) ? "text-neon-blue text-glow-blue" : "text-gray-300"
                }`}
                data-testid={`nav-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {link.icon && getIcon(link.icon)}
                {link.label}
              </Link>
            ))}
            <Link to="/reprogrammer" data-testid="nav-reprogrammer">
              <Button
                variant="outline"
                className="border-neon-blue text-neon-blue font-rajdhani font-bold uppercase px-3 py-2 hover:bg-neon-blue/10 transition-all flex items-center gap-2 text-sm"
              >
                <CalendarClock className="w-4 h-4" />
                Reprogrammer session
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden text-white p-2"
            onClick={() => setIsOpen(!isOpen)}
            data-testid="mobile-menu-button"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="lg:hidden py-4 border-t border-white/10" data-testid="mobile-menu">
            <div className="flex flex-col gap-4">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`font-rajdhani font-semibold text-lg uppercase tracking-wide py-2 transition-all flex items-center gap-2 ${
                    isActive(link.path) ? "text-neon-blue" : "text-gray-300"
                  }`}
                  onClick={() => setIsOpen(false)}
                  data-testid={`mobile-nav-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {link.icon && getIcon(link.icon)}
                  {link.label}
                </Link>
              ))}
              <Link to="/reprogrammer" onClick={() => setIsOpen(false)}>
                <Button
                  variant="outline"
                  className="w-full border-neon-blue text-neon-blue font-rajdhani font-bold uppercase py-3 flex items-center justify-center gap-2"
                  data-testid="mobile-nav-reprogrammer"
                >
                  <CalendarClock className="w-4 h-4" />
                  Reprogrammer session de jeu
                </Button>
              </Link>
              <a
                href="https://wa.me/2290141470000"
                className="flex items-center gap-2 text-green-500 font-rajdhani font-semibold"
                data-testid="mobile-whatsapp-link"
              >
                <Phone className="w-5 h-5" />
                WhatsApp: 01 41 47 00 00
              </a>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
