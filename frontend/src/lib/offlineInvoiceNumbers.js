/**
 * offlineInvoiceNumbers.js — Réservoir local de numéros de factures pré-alloués
 * pour permettre l'émission de factures en mode hors-ligne.
 *
 * Workflow :
 *   1. Au login (en ligne) ou périodiquement, appeler `refillIfLow(api, user, threshold)`.
 *      → demande de nouveaux numéros au backend si le pool descend sous `threshold`.
 *   2. Avant de créer une facture en local, appeler `consumeNumber()` pour récupérer
 *      un numéro inutilisé du pool (renvoie `null` si vide).
 *   3. Lors du sync, le numéro est envoyé tel quel au backend qui le marque comme consommé.
 *
 * Stockage : IndexedDB (réutilise `offlineCache`'s db) via une store dédiée
 * `prealloc_numbers`. Schéma :
 *   { number: "EM-YYYYMMDD-O0001", reserved_at, used:false, used_at, invoice_id }
 */
import axios from "axios";

const DB_NAME = "caissepro_offline";
const STORE_PREALLOC = "prealloc_numbers";
const DB_VERSION_PREALLOC = 2; // bump pour créer le store

let _dbPromise = null;
function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION_PREALLOC);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Préserver les stores existantes (snapshot, queue, meta)
      if (!db.objectStoreNames.contains("snapshot")) {
        db.createObjectStore("snapshot", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("queue")) {
        const q = db.createObjectStore("queue", { keyPath: "id" });
        q.createIndex("created_at", "created_at", { unique: false });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_PREALLOC)) {
        const p = db.createObjectStore(STORE_PREALLOC, { keyPath: "number" });
        p.createIndex("used", "used", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function txStore(mode = "readonly") {
  return openDb().then((db) => db.transaction(STORE_PREALLOC, mode).objectStore(STORE_PREALLOC));
}

function reqAsync(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Renvoie le nombre de numéros disponibles (non utilisés) en cache. */
export async function unusedCount() {
  const store = await txStore();
  return new Promise((resolve, reject) => {
    let count = 0;
    const req = store.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) {
        if (!cur.value.used) count++;
        cur.continue();
      } else {
        resolve(count);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/** Liste l'ensemble du cache (debug). */
export async function listAll() {
  const store = await txStore();
  return new Promise((resolve, reject) => {
    const items = [];
    const req = store.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) { items.push(cur.value); cur.continue(); }
      else resolve(items.sort((a, b) => a.number.localeCompare(b.number)));
    };
    req.onerror = () => reject(req.error);
  });
}

/** Récupère et stocke `count` nouveaux numéros depuis le backend. */
export async function fetchAndStore({ apiBase, user, count = 20 }) {
  const url = `${apiBase}/api/offline/preallocate?count=${encodeURIComponent(count)}`;
  const r = await axios.post(url, { user: user?.name || "", role: user?.role || "" }, { timeout: 10000 });
  const numbers = r?.data?.numbers || [];
  const reservedAt = r?.data?.reserved_at || new Date().toISOString();
  if (numbers.length === 0) return 0;

  const store = await txStore("readwrite");
  for (const n of numbers) {
    await reqAsync(store.put({
      number: n,
      reserved_at: reservedAt,
      used: false,
      used_at: null,
      invoice_id: null,
    }));
  }
  return numbers.length;
}

/** Si le nombre de numéros disponibles est inférieur au seuil, recharge. */
export async function refillIfLow({ apiBase, user, threshold = 10, batchSize = 30 }) {
  try {
    const avail = await unusedCount();
    if (avail >= threshold) return { refilled: 0, available: avail };
    const added = await fetchAndStore({ apiBase, user, count: batchSize });
    return { refilled: added, available: avail + added };
  } catch (e) {
    return { refilled: 0, available: await unusedCount().catch(() => 0), error: e.message };
  }
}

/** Consomme un numéro (le marque used localement). Renvoie le numéro ou null. */
export async function consumeNumber(invoiceId = null) {
  const store = await txStore("readwrite");
  return new Promise((resolve, reject) => {
    const req = store.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return resolve(null);
      if (!cur.value.used) {
        const updated = { ...cur.value, used: true, used_at: new Date().toISOString(), invoice_id: invoiceId };
        cur.update(updated);
        return resolve(updated.number);
      }
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

/** Vide les numéros déjà utilisés et synchronisés (housekeeping). */
export async function purgeUsed(olderThanDays = 7) {
  const cutoff = Date.now() - olderThanDays * 86400000;
  const store = await txStore("readwrite");
  return new Promise((resolve, reject) => {
    let removed = 0;
    const req = store.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return resolve(removed);
      const v = cur.value;
      if (v.used && v.used_at && new Date(v.used_at).getTime() < cutoff) {
        cur.delete(); removed++;
      }
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}
