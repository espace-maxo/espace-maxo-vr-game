/**
 * offlineSync.js — Wrapper offline-aware pour les actions critiques.
 *
 * API publique :
 *   - trySync(action)
 *       Tente d'envoyer l'action en direct au backend. Si offline ou erreur
 *       réseau, l'action est mise en queue IndexedDB et résolue localement
 *       (avec un id temporaire). Une promise résolue est toujours renvoyée
 *       (avec un flag `queued: true` si offline).
 *
 *   - processQueue()
 *       Vide la queue en envoyant un batch à /api/sync/queue/process.
 *       À appeler manuellement et automatiquement au retour de connexion.
 *
 *   - subscribe(listener)
 *       S'abonner aux changements de queue (pour mettre à jour le badge).
 *
 * Actions supportées (Phase 2) :
 *   - create_table     POST /api/caisse/tables
 *   - update_table     PUT  /api/caisse/tables/{id}
 *   - delete_table     DELETE /api/caisse/tables/{id}
 *   - create_invoice   POST /api/invoices
 *
 * Idempotency :
 *   Chaque action porte un `client_id` (UUID v4) injecté ici.
 */
import axios from "axios";
import { enqueue, listQueue, dequeue } from "./offlineCache";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Map type → endpoint REST (utilisé en mode online)
const REST_MAP = {
  create_table:   { method: "post",   url: () => "/caisse/tables" },
  update_table:   { method: "put",    url: (p) => `/caisse/tables/${p.id}` },
  delete_table:   { method: "delete", url: (p) => `/caisse/tables/${p.id}` },
  create_invoice: { method: "post",   url: () => "/invoices" },
};

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "off-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const listeners = new Set();
function notify() { listeners.forEach((fn) => { try { fn(); } catch {} }); }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Lance l'envoi direct (mode online). Erreur réseau → throw. */
async function sendDirect(action) {
  const map = REST_MAP[action.type];
  if (!map) throw new Error(`Type inconnu : ${action.type}`);
  const url = `${API}${map.url(action.payload)}`;
  const config = { timeout: 15000 };
  const data = action.payload;
  let res;
  if (map.method === "post") res = await axios.post(url, data, config);
  else if (map.method === "put") res = await axios.put(url, data, config);
  else if (map.method === "delete") res = await axios.delete(url, config);
  return res.data;
}

function isNetworkError(err) {
  if (!err) return false;
  if (err.code === "ERR_NETWORK") return true;
  if (err.message && /Network Error|timeout/i.test(err.message)) return true;
  if (!err.response && err.request) return true;
  // navigator offline ?
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return false;
}

/**
 * Tente l'envoi direct si possible, sinon met en queue.
 * @param {object} action {type, payload, user?}
 * @returns {Promise<{queued:boolean, data?:object, client_id:string}>}
 */
export async function trySync(action) {
  const client_id = action.client_id || uuid();
  const enriched = { ...action, client_id };

  // Si navigateur dit offline, on enqueue direct sans tenter le réseau
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await enqueue({ id: client_id, ...enriched, queued_at: new Date().toISOString() });
    notify();
    return { queued: true, client_id, data: null };
  }

  try {
    const data = await sendDirect(enriched);
    return { queued: false, client_id, data };
  } catch (err) {
    if (isNetworkError(err)) {
      await enqueue({ id: client_id, ...enriched, queued_at: new Date().toISOString() });
      notify();
      return { queued: true, client_id, data: null, error: err.message };
    }
    // Erreur métier (4xx/5xx) → on ne met PAS en queue, on relance.
    throw err;
  }
}

/**
 * Vide la queue en batch côté backend.
 * @returns {Promise<{processed:number, ok:number, conflict:number, error:number, results:Array}>}
 */
export async function processQueue() {
  const queue = await listQueue();
  if (queue.length === 0) return { processed: 0, ok: 0, conflict: 0, error: 0, results: [] };

  const actions = queue.map((q) => ({
    client_id: q.client_id || q.id,
    type: q.type,
    payload: q.payload,
    queued_at: q.queued_at || q.created_at,
    user: q.user || null,
  }));

  try {
    const r = await axios.post(`${API}/sync/queue/process`, { actions }, { timeout: 30000 });
    const results = r.data.results || [];
    let ok = 0, conflict = 0, error = 0, dup = 0;
    for (const res of results) {
      if (res.status === "ok" || res.status === "duplicate") {
        // Supprimer de la queue locale dans les deux cas (succès ou déjà traité)
        await dequeue(res.client_id);
        if (res.status === "duplicate") dup++; else ok++;
      } else if (res.status === "conflict") {
        conflict++;
        // On retire de la queue (Admin gagne) — l'action ne pourra pas être réessayée
        await dequeue(res.client_id);
      } else {
        error++;
        // On garde dans la queue pour retry ultérieur
      }
    }
    notify();
    return { processed: results.length, ok, conflict, error, duplicate: dup, results };
  } catch (err) {
    // Erreur réseau globale → on ne touche pas à la queue
    return { processed: 0, ok: 0, conflict: 0, error: queue.length, network_error: true, results: [] };
  }
}
