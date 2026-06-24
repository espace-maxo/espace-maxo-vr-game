/**
 * PromoVacancesSection — Section de promotion saisonnière "Vacances Maxo".
 *
 * Affichée juste après le Hero sur la HomePage. Récupère les packs et le statut
 * d'activation depuis `/api/promo-vacances`. Si la promo est désactivée par
 * l'Admin, la section ne s'affiche pas.
 *
 * Comportement :
 *   - Faux compteur "Plus que N/100 places" pour les packs limités (incitatif).
 *     Stocké en localStorage pour persister la valeur entre les visites.
 *   - Clic sur "Réserver" → redirige vers /booking?pack={booking_param}.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Flame, Sparkles, AlertTriangle } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const COUNTER_KEY = "promo_vacances_counters_v1";

// Fallback statique au cas où l'API ne répond pas (backend non déployé p. ex.).
// Source : routers/promo_vacances.py — PROMO_PACKS.
const FALLBACK_PACKS = [
  {
    id: "promo_vacances_25",
    title: "Promo Vacances Maxo · -25%",
    subtitle: "Réservez votre table en ligne",
    image:
      "https://customer-assets.emergentagent.com/job_3de0f0c6-25b2-49f2-827d-b5127dbc79ab/artifacts/agb5ia56_PHOTO-2026-06-21-11-13-38.jpg",
    price: null,
    old_price: null,
    limit_100_first: false,
    cta_label: "Réserver ma table",
    booking_param: "promo_vacances_25",
  },
  {
    id: "pack_game_fresh",
    title: "Pack Game Fresh Maxo",
    subtitle: "1 jeu au choix + 1 jus",
    image:
      "https://customer-assets.emergentagent.com/job_3de0f0c6-25b2-49f2-827d-b5127dbc79ab/artifacts/1l3ba1rv_PHOTO-2026-06-21-11-14-16.jpg",
    price: 2000,
    old_price: 3000,
    limit_100_first: false,
    cta_label: "Réserver le Pack Game Fresh",
    booking_param: "pack_game_fresh",
  },
  {
    id: "pack_solo_fun",
    title: "Pack Solo Fun Maxo",
    subtitle: "1 panini + 1 jeu au choix + 1 jus",
    image:
      "https://customer-assets.emergentagent.com/job_3de0f0c6-25b2-49f2-827d-b5127dbc79ab/artifacts/c30zz192_PHOTO-2026-06-21-11-14-52.jpg",
    price: 3500,
    old_price: 5000,
    limit_100_first: true,
    cta_label: "Réserver le Pack Solo Fun",
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
    cta_label: "Réserver le Pack Duo Snack VR",
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
    cta_label: "Réserver le Pack Fun Maxo",
    booking_param: "pack_fun_maxo_vacances",
  },
];

/** Renvoie un compteur entre 18 et 42 pour amorcer le faux décompte. */
function seedCounter() {
  return 18 + Math.floor(Math.random() * 25); // 18..42
}

/** Lit (ou initialise) le compteur de places restantes pour un pack. */
function readCounters(packs) {
  try {
    const raw = localStorage.getItem(COUNTER_KEY);
    const data = raw ? JSON.parse(raw) : {};
    const next = { ...data };
    let changed = false;
    for (const p of packs) {
      if (!p.limit_100_first) continue;
      if (typeof next[p.id] !== "number" || next[p.id] < 4) {
        next[p.id] = seedCounter();
        changed = true;
      }
    }
    if (changed) localStorage.setItem(COUNTER_KEY, JSON.stringify(next));
    return next;
  } catch {
    return {};
  }
}

function decrementOne(packs, counters) {
  // Décrémente aléatoirement 1 pack limité (parmi ceux > 4) toutes les 25-60s.
  const candidates = packs.filter((p) => p.limit_100_first && (counters[p.id] || 0) > 4);
  if (candidates.length === 0) return counters;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const next = { ...counters, [pick.id]: Math.max(4, (counters[pick.id] || 0) - 1) };
  try {
    localStorage.setItem(COUNTER_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

const formatFCFA = (n) =>
  new Intl.NumberFormat("fr-FR").format(n || 0).replace(/\s/g, " ");

export default function PromoVacancesSection() {
  const [active, setActive] = useState(true); // par défaut visible, désactivable côté Admin
  const [packs, setPacks] = useState(FALLBACK_PACKS);
  const [counters, setCounters] = useState(() => readCounters(FALLBACK_PACKS));
  const [loaded, setLoaded] = useState(true); // affichage immédiat avec fallback

  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${API}/promo-vacances`)
      .then(({ data }) => {
        if (cancelled) return;
        // Si le backend renvoie active=false, on masque la section.
        if (data && data.active === false) {
          setActive(false);
          return;
        }
        if (data?.packs?.length) {
          setPacks(data.packs);
          setCounters(readCounters(data.packs));
        }
      })
      .catch(() => {
        /* fallback déjà chargé */
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!active || packs.length === 0) return undefined;
    let timer;
    const schedule = () => {
      const delay = 25000 + Math.floor(Math.random() * 35000); // 25–60 s
      timer = setTimeout(() => {
        setCounters((c) => decrementOne(packs, c));
        schedule();
      }, delay);
    };
    schedule();
    return () => timer && clearTimeout(timer);
  }, [active, packs]);

  const cards = useMemo(() => packs, [packs]);

  if (!loaded || !active || cards.length === 0) return null;

  return (
    <section
      id="promo-vacances"
      className="relative py-12 sm:py-16 px-3 sm:px-4 bg-gradient-to-b from-[#08102a] via-[#0a1737] to-dark-bg"
      data-testid="promo-vacances-section"
    >
      {/* Fond décoratif */}
      <div className="absolute inset-0 pointer-events-none opacity-30">
        <div className="absolute top-10 left-10 w-72 h-72 bg-amber-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-10 right-10 w-80 h-80 bg-rose-500/20 rounded-full blur-3xl"></div>
      </div>

      <div className="relative max-w-7xl mx-auto">
        <div className="flex flex-col items-center text-center mb-8 sm:mb-12">
          <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-3 py-1 text-xs uppercase tracking-widest mb-3">
            <Sparkles className="w-3 h-3 mr-1" />
            Offre limitée vacances
          </Badge>
          <h2 className="font-orbitron font-black text-3xl sm:text-4xl lg:text-5xl uppercase tracking-tight">
            <span className="text-white">Promo</span>{" "}
            <span className="text-amber-400 text-glow-amber drop-shadow-[0_2px_4px_rgba(255,180,40,0.4)]">
              Vacances Maxo
            </span>
          </h2>
          <p className="font-outfit text-base sm:text-lg text-slate-300 max-w-2xl mt-3">
            Réservez vos packs et votre table en ligne avec une réduction réservée aux 100 premières réservations.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 max-w-6xl mx-auto">
          {cards.map((p) => {
            const remaining = counters[p.id];
            const isLowStock = p.limit_100_first && remaining !== undefined && remaining <= 15;
            return (
              <div
                key={p.id}
                className="group relative overflow-hidden rounded-2xl border-2 border-amber-500/30 bg-gradient-to-b from-slate-900/90 to-slate-950/95 hover:border-amber-400 transition-all duration-300 hover:shadow-[0_0_50px_rgba(255,180,40,0.35)] hover:-translate-y-1"
                data-testid={`promo-pack-card-${p.id}`}
              >
                {/* Image — ratio portrait pour afficher les affiches en entier */}
                <div className="relative aspect-[4/5] overflow-hidden bg-slate-950">
                  <img
                    src={p.image}
                    alt={p.title}
                    loading="lazy"
                    className="w-full h-full object-contain bg-slate-950 transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                  {/* Badge "100 premières" */}
                  {p.limit_100_first && (
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                      <Badge className="bg-red-600 text-white text-[11px] uppercase tracking-wider shadow-lg px-2.5 py-1">
                        <Flame className="w-3 h-3 mr-1" />
                        100 premières
                      </Badge>
                      {remaining !== undefined && (
                        <Badge
                          className={
                            isLowStock
                              ? "bg-red-500 text-white animate-pulse text-[11px] px-2.5 py-1"
                              : "bg-amber-500 text-slate-900 text-[11px] px-2.5 py-1 shadow-lg"
                          }
                          data-testid={`promo-pack-counter-${p.id}`}
                        >
                          {isLowStock && <AlertTriangle className="w-3 h-3 mr-0.5" />}
                          Plus que {remaining}/100
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                {/* Body */}
                <div className="p-4 sm:p-5 space-y-2.5">
                  <h3 className="font-orbitron font-bold text-white text-base sm:text-lg leading-tight uppercase">
                    {p.title}
                  </h3>
                  {p.subtitle && (
                    <p className="text-amber-200/90 text-sm font-medium">{p.subtitle}</p>
                  )}
                  <div className="flex items-end justify-between gap-2">
                    {p.price ? (
                      <div>
                        <span className="font-orbitron font-black text-amber-400 text-2xl sm:text-3xl leading-none">
                          {formatFCFA(p.price)}
                        </span>
                        <span className="text-amber-200 text-xs font-bold ml-1">FCFA</span>
                        {p.old_price && (
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            <span className="line-through">{formatFCFA(p.old_price)} F</span>
                            <span className="text-emerald-400 font-semibold ml-1">
                              -{formatFCFA(p.old_price - p.price)} F
                            </span>
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="font-orbitron font-bold text-amber-400 text-xl uppercase">
                        Promo -25%
                      </span>
                    )}
                  </div>
                  <Link
                    to={`/booking?pack=${encodeURIComponent(p.booking_param)}`}
                    data-testid={`promo-pack-cta-${p.id}`}
                  >
                    <Button
                      size="lg"
                      className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 font-bold uppercase tracking-wide text-sm mt-2 hover:from-amber-400 hover:to-orange-400 hover:shadow-[0_0_25px_rgba(255,140,0,0.6)] transition-all"
                    >
                      {p.cta_label || "Réserver"}
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center text-slate-400 text-xs sm:text-sm mt-8">
          Réservation en ligne obligatoire ·{" "}
          <span className="text-amber-300 font-semibold">www.espacemaxo.com</span>
        </p>
      </div>
    </section>
  );
}
