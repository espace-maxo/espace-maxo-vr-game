import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import axios from "axios";
import { CheckCircle, XCircle, Loader2, Calendar, Clock, Gamepad2, Phone, Home, MessageCircle, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ConfirmationPage = () => {
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get("booking_id");
  const paymentStatus = searchParams.get("status");
  
  const [status, setStatus] = useState(paymentStatus === "success" ? "success" : "loading");
  const [booking, setBooking] = useState(null);
  const [whatsappLink, setWhatsappLink] = useState(null);
  const [attempts, setAttempts] = useState(0);
  const maxAttempts = 10;

  useEffect(() => {
    if (bookingId) {
      fetchBookingDetails();
    }
  }, [bookingId]);

  const fetchBookingDetails = async () => {
    try {
      const response = await axios.get(`${API}/bookings/${bookingId}`);
      setBooking(response.data);
      setWhatsappLink(response.data.whatsapp_link);
      
      if (response.data.payment_status === "paid") {
        setStatus("success");
      } else if (paymentStatus !== "success") {
        // Poll for payment status
        pollPaymentStatus();
      } else {
        setStatus("success");
      }
    } catch (error) {
      console.error("Error fetching booking:", error);
      setStatus("error");
    }
  };

  const pollPaymentStatus = async () => {
    if (attempts >= maxAttempts) {
      setStatus("error");
      return;
    }

    try {
      const response = await axios.get(`${API}/payment/status/${bookingId}`);
      
      if (response.data.payment_status === "paid") {
        setStatus("success");
        setWhatsappLink(response.data.whatsapp_link);
      } else {
        setAttempts(prev => prev + 1);
        setTimeout(pollPaymentStatus, 2000);
      }
    } catch (error) {
      console.error("Error polling payment status:", error);
      setAttempts(prev => prev + 1);
      if (attempts < maxAttempts - 1) {
        setTimeout(pollPaymentStatus, 2000);
      } else {
        setStatus("error");
      }
    }
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('fr-FR').format(price);
  };

  return (
    <div className="min-h-screen pt-20 bg-dark-bg flex items-center" data-testid="confirmation-page">
      <div className="max-w-2xl mx-auto px-4 py-16 w-full">
        {status === "loading" && (
          <div className="text-center animate-fade-in-up" data-testid="loading-state">
            <div className="w-24 h-24 rounded-full bg-neon-blue/20 flex items-center justify-center mx-auto mb-6">
              <Loader2 className="w-12 h-12 text-neon-blue animate-spin" />
            </div>
            <h1 className="font-orbitron font-bold text-2xl md:text-3xl text-white mb-4">
              Vérification du paiement...
            </h1>
            <p className="text-gray-400 font-outfit">
              Veuillez patienter pendant que nous confirmons votre paiement Mobile Money.
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="text-center animate-fade-in-up" data-testid="success-state">
            <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-12 h-12 text-green-500" />
            </div>
            <h1 className="font-orbitron font-bold text-2xl md:text-3xl text-green-500 mb-4">
              Réservation Confirmée!
            </h1>
            <p className="text-gray-300 font-outfit mb-8">
              Merci pour votre réservation. Nous avons hâte de vous accueillir chez Espace Maxo!
            </p>

            {booking && (
              <div className="bg-dark-card rounded-xl p-6 md:p-8 border border-green-500/30 text-left mb-8" data-testid="booking-details">
                <h2 className="font-orbitron font-bold text-xl text-neon-blue mb-6">
                  Détails de la Réservation
                </h2>
                
                <div className="space-y-4">
                  <div className="flex items-center gap-3 py-3 border-b border-white/10">
                    <Calendar className="w-5 h-5 text-neon-blue" />
                    <div>
                      <span className="text-gray-400 font-outfit text-sm block">Date</span>
                      <span className="text-white font-outfit font-semibold">{booking.date}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 py-3 border-b border-white/10">
                    <Clock className="w-5 h-5 text-neon-blue" />
                    <div>
                      <span className="text-gray-400 font-outfit text-sm block">Heure</span>
                      <span className="text-white font-outfit font-semibold">{booking.time_slot}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 py-3 border-b border-white/10">
                    <Gamepad2 className="w-5 h-5 text-neon-blue" />
                    <div>
                      <span className="text-gray-400 font-outfit text-sm block">Type de jeu</span>
                      <span className="text-white font-outfit font-semibold">
                        {booking.game_type === "VR_360" ? "VR 360°" : "Simulateur Course"}
                      </span>
                    </div>
                  </div>
                  
                  <div className="py-3 border-b border-white/10">
                    <span className="text-gray-400 font-outfit text-sm block">Joueurs & Parties</span>
                    <span className="text-white font-outfit font-semibold">
                      {booking.number_of_players} joueur(s) x {booking.number_of_games} partie(s)
                    </span>
                  </div>
                  
                  <div className="pt-3">
                    <div className="flex justify-between mb-2">
                      <span className="text-gray-400 font-outfit">Total jeux</span>
                      <span className="text-white font-rajdhani font-bold">
                        {formatPrice(booking.total_game_price)} FCFA
                      </span>
                    </div>
                    <div className="flex justify-between mb-2">
                      <span className="text-gray-400 font-outfit">Frais réservation (payé)</span>
                      <span className="text-green-500 font-rajdhani font-bold">
                        {formatPrice(booking.reservation_fee)} FCFA ✓
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-white/10">
                      <span className="text-white font-outfit font-semibold">Reste à payer sur place</span>
                      <span className="text-food-gold font-rajdhani font-bold text-xl">
                        {formatPrice(booking.total_game_price)} FCFA
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* WhatsApp Confirmation */}
            {whatsappLink && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6 mb-8" data-testid="whatsapp-section">
                <div className="flex items-center gap-3 mb-4">
                  <MessageCircle className="w-8 h-8 text-green-500" />
                  <div className="text-left">
                    <h3 className="font-orbitron font-bold text-lg text-white">
                      Confirmez sur WhatsApp
                    </h3>
                    <p className="text-gray-400 font-outfit text-sm">
                      Cliquez pour envoyer une confirmation au restaurant
                    </p>
                  </div>
                </div>
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer" data-testid="whatsapp-confirm-btn">
                  <Button className="w-full bg-green-500 hover:bg-green-600 text-white font-rajdhani font-bold uppercase py-4">
                    <MessageCircle className="w-5 h-5 mr-2" />
                    Confirmer sur WhatsApp
                  </Button>
                </a>
              </div>
            )}

            {/* Payment Method Info */}
            <div className="bg-food-gold/10 border border-food-gold/30 rounded-xl p-4 mb-8">
              <div className="flex items-center gap-2 text-food-gold">
                <Smartphone className="w-5 h-5" />
                <span className="font-rajdhani font-bold">Paiement effectué via Mobile Money</span>
              </div>
            </div>

            <div className="bg-dark-card rounded-xl p-6 border border-white/10 mb-8">
              <h3 className="font-orbitron font-bold text-lg text-white mb-4">
                Informations Importantes
              </h3>
              <ul className="space-y-2 text-gray-300 font-outfit text-sm text-left">
                <li>• Présentez-vous 10 minutes avant votre créneau</li>
                <li>• Le reste du montant sera payé sur place</li>
                <li>• En cas d'annulation, contactez-nous par WhatsApp</li>
                <li>• Adresse: Fidjrossè Plage, rue en face de l'EPP Jacquot</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/" data-testid="home-button">
                <Button className="bg-neon-blue text-black font-rajdhani font-bold uppercase px-6 py-3 hover:shadow-[0_0_20px_rgba(0,240,255,0.5)]">
                  <Home className="w-5 h-5 mr-2" />
                  Retour à l'accueil
                </Button>
              </Link>
              <a href="https://wa.me/22901414700" data-testid="whatsapp-button">
                <Button variant="outline" className="border-green-500 text-green-500 font-rajdhani font-bold uppercase px-6 py-3 hover:bg-green-500/10">
                  <Phone className="w-5 h-5 mr-2" />
                  +229 01 41 47 00 00
                </Button>
              </a>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="text-center animate-fade-in-up" data-testid="error-state">
            <div className="w-24 h-24 rounded-full bg-neon-red/20 flex items-center justify-center mx-auto mb-6">
              <XCircle className="w-12 h-12 text-neon-red" />
            </div>
            <h1 className="font-orbitron font-bold text-2xl md:text-3xl text-neon-red mb-4">
              Paiement Non Confirmé
            </h1>
            <p className="text-gray-300 font-outfit mb-8">
              Nous n'avons pas pu confirmer votre paiement Mobile Money. 
              Si vous avez été débité, veuillez nous contacter par WhatsApp.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/booking" data-testid="retry-button">
                <Button className="bg-neon-blue text-black font-rajdhani font-bold uppercase px-6 py-3 hover:shadow-[0_0_20px_rgba(0,240,255,0.5)]">
                  Réessayer
                </Button>
              </Link>
              <a href="https://wa.me/22901414700" data-testid="contact-whatsapp">
                <Button variant="outline" className="border-white/20 text-white font-rajdhani font-bold uppercase px-6 py-3 hover:bg-white/10">
                  <Phone className="w-5 h-5 mr-2" />
                  Contactez-nous
                </Button>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConfirmationPage;
