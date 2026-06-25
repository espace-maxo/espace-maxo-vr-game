/**
 * LockScreen — Overlay plein écran (couleur sombre) qui masque la Caisse.
 *
 * Affiche : logo + nom de l'utilisateur actuel + heure + champ PIN.
 * Déverrouillage autorisé si le PIN saisi :
 *   - correspond à l'utilisateur en session (currentUser), OU
 *   - est un PIN admin valide (override pour reprendre la main en cas de besoin)
 *
 * Utilise l'endpoint /api/caisse/login pour valider (réutilise l'auth existante).
 * Aucune fuite du contenu de la Caisse : z-index 9999 + backdrop-blur fort.
 */
import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Lock, Loader2, Receipt, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function LockScreen({ currentUser, onUnlock }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(new Date());
  const inputRef = useRef(null);

  // Mise à jour de l'horloge chaque seconde
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-focus sur le champ PIN
  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  // Empêche le scroll du body pendant le verrouillage
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const submit = async () => {
    const cleanPin = (pin || "").trim();
    if (!cleanPin) {
      setError("Saisis ton PIN");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await axios.post(
        `${API}/caisse/login`,
        { pin: cleanPin, password: "" },
        { timeout: 8000 }
      );
      if (r.data?.success) {
        const u = r.data.user;
        const currentUid = currentUser?.id || currentUser?.username;
        const newUid = u?.id || u?.username;
        // Autorisé : même utilisateur OU admin override
        if (newUid === currentUid || u?.role === "admin") {
          toast.success("Caisse déverrouillée");
          setPin("");
          onUnlock(u);
          return;
        }
        setError("PIN invalide pour cette session. Demande à l'admin pour reprendre la main.");
      } else {
        setError("PIN incorrect");
      }
    } catch (e) {
      const msg = e?.response?.data?.detail || "PIN incorrect";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e) => {
    if (e.key === "Enter") submit();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center select-none"
      data-testid="caisse-lock-screen"
      role="dialog"
      aria-modal="true"
      aria-label="Caisse verrouillée"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(245,158,11,0.08),_transparent_60%)] pointer-events-none" />

      <div className="relative w-full max-w-md mx-auto px-6 py-8 space-y-6">
        {/* Logo + branding */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-xl shadow-amber-900/40">
            <Receipt className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-amber-400 tracking-wider">CAISSE PRO</h1>
          <p className="text-slate-400 text-xs">Espace Maxo</p>
        </div>

        {/* Horloge */}
        <div className="text-center">
          <p className="text-5xl font-bold text-white tabular-nums">
            {now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="text-slate-500 text-sm mt-1">
            {now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>

        {/* Card verrouillage */}
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 space-y-4">
          <div className="flex items-center gap-2 justify-center text-amber-300">
            <Lock className="w-4 h-4" />
            <span className="text-sm font-semibold uppercase tracking-wider">Caisse verrouillée</span>
          </div>

          {currentUser ? (
            <div className="flex items-center gap-2 bg-slate-800/60 rounded-lg p-2 text-sm">
              <UserIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span className="text-slate-300">Session : </span>
              <span className="text-white font-semibold truncate">
                {currentUser.full_name || currentUser.username}
              </span>
              {currentUser.role && (
                <span className="ml-auto text-[10px] uppercase text-amber-400 font-bold tracking-wider">
                  {currentUser.role}
                </span>
              )}
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="text-slate-300 text-xs font-medium" htmlFor="lock-pin-input">
              Saisis ton PIN pour reprendre
            </label>
            <Input
              ref={inputRef}
              id="lock-pin-input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                if (error) setError("");
              }}
              onKeyDown={onKey}
              placeholder="••••"
              disabled={busy}
              className="bg-slate-800 border-slate-700 text-white text-center text-xl tracking-widest h-12"
              data-testid="caisse-lock-pin-input"
            />
            {error ? (
              <p className="text-rose-400 text-xs" data-testid="caisse-lock-error">
                {error}
              </p>
            ) : (
              <p className="text-slate-500 text-[10px]">
                Un PIN administrateur peut aussi déverrouiller (override).
              </p>
            )}
          </div>

          <Button
            onClick={submit}
            disabled={busy || !pin}
            className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold h-11"
            data-testid="caisse-lock-unlock-btn"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Vérification…
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 mr-2" /> Déverrouiller
              </>
            )}
          </Button>
        </div>

        <p className="text-center text-slate-600 text-[11px]">
          Verrouillage automatique après 5 min d'inactivité · Aucune donnée n'est perdue.
        </p>
      </div>
    </div>
  );
}
