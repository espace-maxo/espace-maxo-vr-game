/**
 * useInactivityLock — Hook qui surveille l'inactivité utilisateur et déclenche
 * un verrouillage automatique de l'écran après LOCK_AFTER_MS de pause.
 *
 * Activité détectée : mousemove, mousedown, keydown, touchstart, scroll, wheel.
 * Reset du timer à chaque événement détecté.
 *
 * Le hook expose :
 *   - locked (bool)
 *   - lock() : verrouillage manuel immédiat
 *   - unlock() : à appeler après vérification PIN
 *   - remainingSec (int, 0 si pas armé) — pour afficher un compte à rebours optionnel
 *
 * Quand `disabled` (ex : pas encore authentifié), aucun listener n'est branché.
 */
import { useEffect, useRef, useState, useCallback } from "react";

const LOCK_AFTER_MS = 5 * 60 * 1000; // 5 minutes d'inactivité
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"];

export default function useInactivityLock({ disabled = false } = {}) {
  const [locked, setLocked] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const timerRef = useRef(null);

  const lock = useCallback(() => setLocked(true), []);
  const unlock = useCallback(() => {
    setLocked(false);
    lastActivityRef.current = Date.now();
  }, []);

  const handleActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (disabled || locked) {
      // Quand on est verrouillé, on n'écoute plus l'activité (le LockScreen prend le contrôle)
      if (timerRef.current) clearInterval(timerRef.current);
      return undefined;
    }

    // Branche les listeners
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, handleActivity, { passive: true }));

    // Check périodique : si écart > LOCK_AFTER_MS depuis dernière activité → lock
    timerRef.current = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= LOCK_AFTER_MS) {
        setLocked(true);
      }
    }, 5000); // check toutes les 5s

    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, handleActivity));
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [disabled, locked, handleActivity]);

  return { locked, lock, unlock, lockTimeoutMs: LOCK_AFTER_MS };
}
