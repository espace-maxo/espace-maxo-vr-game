import { useState, useEffect } from "react";
import axios from "axios";
import { Gift, Star, Trophy, Gamepad2, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LoyaltyCard = ({ phone, onFreeGamesAvailable }) => {
  const [loyalty, setLoyalty] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (phone && phone.length >= 8) {
      fetchLoyaltyStatus();
    } else {
      setLoyalty(null);
    }
  }, [phone]);

  const fetchLoyaltyStatus = async () => {
    setLoading(true);
    try {
      const cleanPhone = phone.replace(/\s/g, '').replace(/^\+229/, '');
      const response = await axios.get(`${API}/loyalty/${cleanPhone}`);
      setLoyalty(response.data);
      
      // Notify parent about free games
      if (onFreeGamesAvailable && response.data.free_games_available > 0) {
        onFreeGamesAvailable(response.data.free_games_available);
      }
    } catch (error) {
      console.error("Error fetching loyalty:", error);
      setLoyalty(null);
    } finally {
      setLoading(false);
    }
  };

  if (!phone || phone.length < 8) return null;

  if (loading) {
    return (
      <Card className="bg-gradient-to-r from-food-gold/20 to-neon-purple/20 border-food-gold/30">
        <CardContent className="p-4 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-food-gold" />
          <span className="ml-2 text-gray-400 font-outfit text-sm">Chargement fidélité...</span>
        </CardContent>
      </Card>
    );
  }

  if (!loyalty) return null;

  const progressPercent = loyalty.exists 
    ? ((loyalty.available_points % 10) / 10) * 100 
    : 0;

  return (
    <Card className="bg-gradient-to-r from-food-gold/10 to-neon-purple/10 border-food-gold/30 overflow-hidden" data-testid="loyalty-card">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-food-gold/20 flex items-center justify-center">
              <Star className="w-4 h-4 text-food-gold" />
            </div>
            <span className="font-orbitron font-bold text-food-gold text-sm">Programme Fidélité</span>
          </div>
          {loyalty.exists && loyalty.free_games_available > 0 && (
            <div className="flex items-center gap-1 bg-green-500/20 px-2 py-1 rounded-full">
              <Gift className="w-3 h-3 text-green-400" />
              <span className="text-green-400 font-rajdhani font-bold text-xs">
                {loyalty.free_games_available} gratuite(s)!
              </span>
            </div>
          )}
        </div>

        {loyalty.exists ? (
          <>
            {/* Points Display */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="text-center">
                <p className="text-2xl font-rajdhani font-bold text-neon-blue">{loyalty.available_points}</p>
                <p className="text-xs text-gray-400 font-outfit">Points</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-rajdhani font-bold text-food-gold">{loyalty.total_games_played}</p>
                <p className="text-xs text-gray-400 font-outfit">Parties jouées</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-rajdhani font-bold text-green-400">{loyalty.free_games_available}</p>
                <p className="text-xs text-gray-400 font-outfit">Gratuites</p>
              </div>
            </div>

            {/* Progress to next free game */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400 font-outfit">Progression vers partie gratuite</span>
                <span className="text-food-gold font-rajdhani font-bold">
                  {loyalty.available_points % 10}/10
                </span>
              </div>
              <Progress value={progressPercent} className="h-2 bg-surface-highlight" />
              {loyalty.games_until_free > 0 && (
                <p className="text-xs text-gray-500 font-outfit">
                  Plus que {loyalty.games_until_free} partie(s) pour une partie gratuite!
                </p>
              )}
            </div>
          </>
        ) : (
          /* New Customer */
          <div className="text-center py-2">
            <Gamepad2 className="w-8 h-8 text-gray-500 mx-auto mb-2" />
            <p className="text-sm text-gray-400 font-outfit">
              Nouveau client? Gagnez <span className="text-food-gold font-semibold">1 point par partie</span>!
            </p>
            <p className="text-xs text-gray-500 font-outfit mt-1">
              10 points = 1 partie gratuite
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LoyaltyCard;
