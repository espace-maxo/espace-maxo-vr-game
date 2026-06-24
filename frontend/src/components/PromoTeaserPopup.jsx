/**
 * PromoTeaserPopup — Popup d'incitation qui apparaît 20s après le chargement
 * de la HomePage. Affiche un pack pris au hasard avec un compte à rebours
 * animé de 5 minutes (factice — sert à créer un sentiment d'urgence).
 *
 * Comportement :
 *   - N'apparaît que si la promo est active (`/api/promo-vacances` → active=true).
 *   - Ne réapparaît pas dans les 24h qui suivent (clic "Plus tard" ou fermeture).
 *   - Compte à rebours mm:ss, repart à 5:00 à chaque ouverture.
 *   - Clic "Réserver" → /booking?pack=<id>.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Flame, X, Clock, Sparkles } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const SEEN_KEY = "promo_teaser_seen_at_v1";
const DELAY_MS = 20000;
const SUPPRESS_FOR_MS = 24 * 60 * 60 * 1000; // 24h
const COUNTDOWN_SECONDS = 5 * 60;

// Fallback (synchronisé avec routers/promo_vacances.py)
const FALLBACK_PACKS = [
  {
    id: "pack_solo_fun",
    title: "Pack Solo Fun Maxo",
    subtitle: "1 panini + 1 jeu au choix + 1 jus",
    image:
      "https://customer-assets.emergentagent.com/job_3de0f0c6-25b2-49f2-827d-b5127dbc79ab/artifacts/c30zz192_PHOTO-2026-06-21-11-14-52.jpg",
    price: 3500,
    old_price: 5000,
    limit_100_first: true,
    booking_param: "pack_solo_fun",
  },
  {
    id: "pack_duo_snack_vr",
    title: "Pack Duo Snack VR",
    subtitle: "1 jeu VR + 1 burger + 1 chawarma + 2 jus",
    image:
      "https://customer-assets.emergentagent.com/job_3de0f0c6-25b2-49f2-827d-b5127dbc79ab/artifacts/4hm69l6i_PHOTO-2026-06-21-11-15-27.jpg",
    price: 5500,
    old_price: 8500,
    limit_100_first: true,
    booking_param: "pack_duo_snack_vr",
  },
  {
    id: "pack_fun_maxo_vacances",
    title: "Pack Fun Maxo Vacances",
    subtitle: "Pizza + VR + 2 jus",
    image:
      "https://customer-assets.emergentagent.com/job_3de0f0c6-25b2-49f2-827d-b5127dbc79ab/artifacts/x9kbexuk_PHOTO-2026-06-21-11-15-48.jpg",
    price: 6500,
    old_price: 10000,
    limit_100_first: true,
    booking_param: "pack_fun_maxo_vacances",
  },
];

function shouldShow() {
  try {
    const ts = parseInt(localStorage.getItem(SEEN_KEY) || "0", 10);
    if (!ts) return true;
    return Date.now() - ts > SUPPRESS_FOR_MS;
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, String(Date.now()));
  } catch {}
}

function pickRandomPack(packs) {
  if (!packs || packs.length === 0) return null;
  // Privilégie les packs avec la limitation 100 premières (plus incitatifs)
  const pool = packs.filter((p) => p.limit_100_first);
  const choices = pool.length > 0 ? pool : packs;
  return choices[Math.floor(Math.random() * choices.length)];
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const formatFCFA = (n) => new Intl.NumberFormat("fr-FR").format(n || 0);

export default function PromoTeaserPopup() {
  const [pack, setPack] = useState(null);
  const [visible, setVisible] = useState(false);
  const [seconds, setSeconds] = useState(COUNTDOWN_SECONDS);
  const intervalRef = useRef(null);

  // Charge la liste des packs et planifie l'ouverture
  useEffect(() => {
    if (!shouldShow()) return undefined;
    let cancelled = false;
    let openTimer = null;

    const scheduleOpen = (chosen) => {
      openTimer = setTimeout(() => {
        if (cancelled || !chosen) return;
        setPack(chosen);
        setVisible(true);
        setSeconds(COUNTDOWN_SECONDS);
      }, DELAY_MS);
    };

    axios
      .get(`${API}/promo-vacances`)
      .then(({ data }) => {
        if (cancelled) return;
        // Si l'admin a désactivé la promo, on ne montre pas le popup
        if (data && data.active === false) return;
        const list = data?.packs?.length ? data.packs : FALLBACK_PACKS;
        scheduleOpen(pickRandomPack(list));
      })
      .catch(() => {
        // Fallback si l'API est indisponible
        if (!cancelled) scheduleOpen(pickRandomPack(FALLBACK_PACKS));
      });

    return () => {
      cancelled = true;
      if (openTimer) clearTimeout(openTimer);
    };
  }, []);

  // Compte à rebours
  useEffect(() => {
    if (!visible) return undefined;
    intervalRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [visible]);

  const close = () => {
    setVisible(false);
    markSeen();
  };

  const progressPct = useMemo(() => {
    return Math.max(0, Math.min(100, (seconds / COUNTDOWN_SECONDS) * 100));
  }, [seconds]);

  if (!visible || !pack) return null;

  const urgent = seconds < 60;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center px-3 pb-4 sm:pb-0 pointer-events-none"
      data-testid="promo-teaser-popup"
    >
      {/* Backdrop léger */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto opacity-0 sm:opacity-100 transition-opacity duration-500"
        onClick={close}
      />

      {/* Carte popup */}
      <div className="relative w-full max-w-md pointer-events-auto animate-[fadeIn_.4s_ease-out]">
        <div className="relative bg-gradient-to-br from-slate-900 via-slate-950 to-amber-950/40 border-2 border-amber-400/60 rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(255,180,40,0.4)]">
          {/* Bouton fermer */}
          <button
            type="button"
            onClick={close}
            className="absolute top-2 right-2 z-20 bg-black/40 hover:bg-black/70 rounded-full w-8 h-8 flex items-center justify-center text-white"
            data-testid="promo-teaser-close"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Bandeau urgence */}
          <div
            className={`px-3 py-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest ${
              urgent ? "bg-red-600 text-white animate-pulse" : "bg-amber-500 text-slate-900"
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            Offre flash — Plus que
            <span className="font-orbitron font-black tabular-nums text-base" data-testid="promo-teaser-countdown">
              {fmtTime(seconds)}
            </span>
          </div>

          {/* Image du pack */}
          <div className="relative aspect-video bg-slate-900 overflow-hidden">
            <img
              src={pack.image}
              alt={pack.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {pack.limit_100_first && (
              <Badge className="absolute top-3 left-3 bg-red-600/95 text-white shadow-lg">
                <Sparkles className="w-3 h-3 mr-1" />
                100 premières seulement
              </Badge>
            )}
            {pack.price && (
              <div className="absolute bottom-3 right-3 bg-amber-500 text-slate-900 font-black px-3 py-1.5 rounded-lg shadow-lg">
                <span className="font-orbitron text-xl leading-none">{formatFCFA(pack.price)}</span>
                <span className="text-[10px] ml-0.5">FCFA</span>
              </div>
            )}
          </div>

          {/* Corps */}
          <div className="p-4 space-y-3">
            <h3 className="font-orbitron font-black text-white text-lg uppercase leading-tight">
              {pack.title}
            </h3>
            {pack.subtitle && (
              <p className="text-amber-200 text-sm font-medium">{pack.subtitle}</p>
            )}
            {pack.old_price && (
              <p className="text-xs text-slate-400">
                Prix habituel :{" "}
                <span className="line-through">{formatFCFA(pack.old_price)} FCFA</span>{" "}
                <Badge className="bg-emerald-500/20 text-emerald-300 ml-1 text-[10px]">
                  Économisez {formatFCFA(pack.old_price - (pack.price || 0))} FCFA
                </Badge>
              </p>
            )}

            {/* Barre de compte à rebours visuelle */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Disparait dans
                </span>
                <span className="font-orbitron font-bold tabular-nums text-amber-200">
                  {fmtTime(seconds)}
                </span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-1000 ${
                    urgent ? "bg-red-500" : "bg-gradient-to-r from-amber-500 to-orange-500"
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={close}
                className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800"
                data-testid="promo-teaser-later"
              >
                Plus tard
              </Button>
              <Link
                to={`/booking?pack=${encodeURIComponent(pack.booking_param)}`}
                onClick={close}
                className="flex-1"
                data-testid="promo-teaser-cta"
              >
                <Button className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 font-bold uppercase tracking-wide hover:from-amber-400 hover:to-orange-400">
                  Réserver maintenant
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px) scale(.95); }
          to   { opacity: 1; transform: translateY(0)   scale(1);   }
        }
      `}</style>
    </div>
  );
}
