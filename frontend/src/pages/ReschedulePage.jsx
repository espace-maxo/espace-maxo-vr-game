import { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { CalendarClock, AlertTriangle, CheckCircle, Gamepad2, Calendar, Clock, Users, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ReschedulePage = () => {
  const { bookingId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [bookingInfo, setBookingInfo] = useState(null);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [success, setSuccess] = useState(false);
  const [successData, setSuccessData] = useState(null);

  useEffect(() => {
    if (!token) {
      setError("Token de reprogrammation manquant");
      setLoading(false);
      return;
    }

    const fetchBookingInfo = async () => {
      try {
        const response = await axios.get(`${API}/bookings/${bookingId}/reschedule-info?token=${token}`);
        setBookingInfo(response.data);
        setNewDate(response.data.booking.date);
        setNewTime(response.data.booking.time_slot);
      } catch (err) {
        setError(err.response?.data?.detail || "Erreur lors du chargement de la réservation");
      } finally {
        setLoading(false);
      }
    };

    fetchBookingInfo();
  }, [bookingId, token]);

  const handleReschedule = async () => {
    if (!newDate || !newTime) {
      toast.error("Veuillez sélectionner une date et un créneau");
      return;
    }

    setSubmitting(true);
    try {
      const response = await axios.post(
        `${API}/bookings/${bookingId}/reschedule?token=${token}`,
        { new_date: newDate, new_time_slot: newTime }
      );
      
      setSuccess(true);
      setSuccessData(response.data);
      toast.success("Réservation reprogrammée avec succès!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur lors de la reprogrammation");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-20 bg-dark-bg flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-neon-blue animate-spin mx-auto mb-4" />
          <p className="text-gray-400 font-outfit">Chargement de votre réservation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen pt-20 bg-dark-bg flex items-center justify-center px-4">
        <Card className="bg-dark-card border-neon-red/30 max-w-md w-full">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-16 h-16 text-neon-red mx-auto mb-4" />
            <h2 className="font-orbitron text-xl text-white mb-2">Erreur</h2>
            <p className="text-gray-400 font-outfit">{error}</p>
            <Button 
              onClick={() => navigate("/")}
              className="mt-6 bg-neon-blue text-black font-rajdhani font-bold"
            >
              Retour à l'accueil
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen pt-20 bg-dark-bg flex items-center justify-center px-4">
        <Card className="bg-dark-card border-green-500/30 max-w-md w-full">
          <CardContent className="p-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="font-orbitron text-xl text-white mb-2">Reprogrammation réussie!</h2>
            <div className="text-gray-300 font-outfit space-y-2 mb-4">
              <p>Votre nouvelle réservation:</p>
              <p className="text-neon-blue font-semibold">{successData?.new_date} à {successData?.new_time_slot}</p>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-6">
              <p className="text-yellow-400 text-sm">{successData?.warning}</p>
            </div>
            <Button 
              onClick={() => navigate("/")}
              className="bg-neon-blue text-black font-rajdhani font-bold"
            >
              Retour à l'accueil
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 bg-dark-bg" data-testid="reschedule-page">
      {/* Hero */}
      <section className="py-12 px-4 bg-gradient-radial-blue">
        <div className="max-w-2xl mx-auto text-center">
          <CalendarClock className="w-12 h-12 text-neon-blue mx-auto mb-4" />
          <h1 className="font-orbitron font-black text-3xl sm:text-4xl uppercase tracking-tight mb-4">
            <span className="text-white">Reprogrammer</span>{" "}
            <span className="text-neon-blue">Ma Réservation</span>
          </h1>
        </div>
      </section>

      <section className="py-8 px-4">
        <div className="max-w-xl mx-auto">
          {/* Current Booking Info */}
          <Card className="bg-dark-card border-white/10 mb-6">
            <CardHeader>
              <CardTitle className="font-orbitron text-lg text-white flex items-center gap-2">
                <Gamepad2 className="w-5 h-5 text-neon-blue" />
                Réservation actuelle
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-gray-300">
                <Users className="w-4 h-4 text-gray-500" />
                <span className="font-outfit">{bookingInfo?.booking?.customer_name}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-300">
                <Gamepad2 className="w-4 h-4 text-gray-500" />
                <span className="font-outfit">
                  {bookingInfo?.booking?.game_type === "VR_360" ? "VR 360°" : "Simulateur"} - 
                  {bookingInfo?.booking?.number_of_players} joueur(s) x {bookingInfo?.booking?.number_of_games} partie(s)
                </span>
              </div>
              <div className="flex items-center gap-2 text-neon-red">
                <Calendar className="w-4 h-4" />
                <span className="font-outfit font-semibold">{bookingInfo?.booking?.date}</span>
                <Clock className="w-4 h-4 ml-2" />
                <span className="font-outfit font-semibold">{bookingInfo?.booking?.time_slot}</span>
              </div>
            </CardContent>
          </Card>

          {/* Warning */}
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-yellow-400 font-outfit text-sm">
                  {bookingInfo?.warning_message}
                </p>
                {bookingInfo?.fee_required && (
                  <p className="text-yellow-300 font-semibold mt-2">
                    Frais de reprogrammation: {bookingInfo?.fee_amount} FCFA
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* New Date/Time Selection */}
          <Card className="bg-dark-card border-neon-blue/30">
            <CardHeader>
              <CardTitle className="font-orbitron text-lg text-neon-blue flex items-center gap-2">
                <CalendarClock className="w-5 h-5" />
                Nouvelle date et heure
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-date" className="text-gray-300 font-outfit">Nouvelle date</Label>
                <Input
                  id="new-date"
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="bg-surface-highlight border-white/20 text-white font-outfit"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-time" className="text-gray-300 font-outfit">Nouveau créneau</Label>
                <Select value={newTime} onValueChange={setNewTime}>
                  <SelectTrigger className="bg-surface-highlight border-white/20 text-white">
                    <SelectValue placeholder="Sélectionner un créneau" />
                  </SelectTrigger>
                  <SelectContent className="bg-dark-card border-white/20">
                    {["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"].map((time) => (
                      <SelectItem key={time} value={time} className="text-white">
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleReschedule}
                disabled={submitting || !newDate || !newTime}
                className="w-full bg-neon-blue text-black font-rajdhani font-bold uppercase py-6 text-lg mt-4"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Reprogrammation en cours...
                  </>
                ) : (
                  <>
                    <CalendarClock className="w-5 h-5 mr-2" />
                    Confirmer la reprogrammation
                    {bookingInfo?.fee_required && ` (${bookingInfo?.fee_amount} FCFA)`}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default ReschedulePage;
