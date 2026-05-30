/**
 * notificationBeep.js — Génère un bip audible avec Web Audio API.
 *
 * Pourquoi : les data:audio/wav minimalistes sont quasi inaudibles.
 * Ici on synthétise un vrai bip carré à 880 Hz pendant 300ms.
 */

let _ctx = null;

function getCtx() {
  if (typeof window === "undefined") return null;
  if (!_ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    _ctx = new Ctx();
  }
  return _ctx;
}

/**
 * Joue un bip.
 * @param {object} opts
 *   - freq:    fréquence en Hz (défaut 880)
 *   - duration: durée en secondes (défaut 0.25)
 *   - volume:  0..1 (défaut 0.6)
 *   - count:   nombre de bips successifs (défaut 1)
 *   - gap:     pause entre bips en secondes (défaut 0.1)
 *   - type:    "square" | "sine" | "triangle" | "sawtooth"
 */
export function playBeep({
  freq = 880,
  duration = 0.25,
  volume = 0.6,
  count = 1,
  gap = 0.1,
  type = "square",
} = {}) {
  const ctx = getCtx();
  if (!ctx) return;
  // Resume context (some browsers suspend it before user interaction)
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  let start = ctx.currentTime;
  for (let i = 0; i < count; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    // Enveloppe pour éviter clics : attaque/relâchement rapides
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.02);
    gain.gain.linearRampToValueAtTime(volume, start + duration - 0.05);
    gain.gain.linearRampToValueAtTime(0, start + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration);
    start += duration + gap;
  }
}

// Presets utiles
export const beepNewOrder = () => playBeep({ freq: 1200, duration: 0.18, volume: 0.7, count: 2, gap: 0.07 });
export const beepPlateReady = () => playBeep({ freq: 660, duration: 0.22, volume: 0.7, count: 3, gap: 0.08, type: "sine" });
