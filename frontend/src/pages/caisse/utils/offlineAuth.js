/**
 * offlineAuth — Cache local des identifiants pour permettre la connexion
 * lorsque l'application n'a plus accès à Internet.
 *
 * Principe :
 *   - Après une connexion en ligne RÉUSSIE, on stocke dans localStorage :
 *       { pin_hash | password_hash, user_data, cached_at }
 *   - Les codes (PIN, mot de passe) ne sont JAMAIS stockés en clair.
 *   - À la prochaine tentative de connexion, si l'API renvoie une erreur réseau
 *     (axios `Network Error`), on tente une validation locale en comparant
 *     le hash du code saisi avec les hashes cachés.
 *
 * Sécurité :
 *   - SHA-256 via Web Crypto API (natif, sans dépendance).
 *   - Cache limité à 7 jours (expire automatiquement).
 *   - Effacé à la déconnexion explicite si demandé.
 */

const STORAGE_KEY = "caisse_offline_auth_v1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function readCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { entries: [] };
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.entries)) return { entries: [] };
    return data;
  } catch (_) {
    return { entries: [] };
  }
}

function writeCache(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (_) {
    // Ignore quota errors
  }
}

/** Met à jour le cache après une connexion réussie en ligne. */
export async function rememberLogin({ pin, password, user }) {
  if (!user) return;
  try {
    const now = Date.now();
    const cache = readCache();
    const newEntries = cache.entries.filter((e) => {
      // Drop expired
      if (now - (e.cached_at || 0) > MAX_AGE_MS) return false;
      // Replace if same user
      if (user.id && e.user?.id === user.id) return false;
      if (!user.id && e.user?.username === user.username) return false;
      return true;
    });
    const entry = {
      user,
      cached_at: now,
      pin_hash: pin ? await sha256(String(pin)) : null,
      password_hash: password ? await sha256(String(password)) : null,
    };
    newEntries.push(entry);
    writeCache({ entries: newEntries.slice(-20) }); // cap to 20 users
  } catch (_) {
    // noop
  }
}

/** Tente une authentification locale. Renvoie {success, user} ou {success:false}. */
export async function tryLocalLogin({ pin, password }) {
  try {
    const now = Date.now();
    const cache = readCache();
    const candidates = cache.entries.filter(
      (e) => now - (e.cached_at || 0) <= MAX_AGE_MS
    );
    if (pin) {
      const pinHash = await sha256(String(pin));
      const match = candidates.find((e) => e.pin_hash && e.pin_hash === pinHash);
      if (match) return { success: true, user: match.user, offline: true };
    }
    if (password) {
      const pwdHash = await sha256(String(password));
      const match = candidates.find(
        (e) => e.password_hash && e.password_hash === pwdHash
      );
      if (match) return { success: true, user: match.user, offline: true };
    }
    return { success: false };
  } catch (_) {
    return { success: false };
  }
}

/** Vide tout le cache local (utilisé sur déconnexion forcée). */
export function clearOfflineAuth() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    // noop
  }
}

/** Renvoie true si l'erreur axios est due à un problème réseau (pas une 401/403). */
export function isNetworkError(err) {
  if (!err) return false;
  // Pas de réponse du serveur OU code spécifique
  if (err.code === "ECONNABORTED") return true;
  if (err.message === "Network Error") return true;
  if (!err.response) return true; // request sent but no response (offline)
  return false;
}
