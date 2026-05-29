/**
 * offlineCache.js — Cache IndexedDB pour le mode hors-ligne.
 *
 * Stocke :
 *   - snapshot (catalogue produits, clients, tables, users, jour)
 *   - queue (actions en attente de synchronisation — Phase 2/3)
 *
 * API publique (toutes async) :
 *   - saveSnapshot(snap)         : enregistre/écrase le snapshot
 *   - getSnapshot()              : récupère le snapshot complet
 *   - enqueue(action)            : ajoute une action à la queue
 *   - dequeue(id)                : retire une action après sync OK
 *   - listQueue()                : renvoie la queue triée (ordre FIFO)
 *   - clearQueue()               : vide la queue (debug)
 *   - getMeta()                  : { lastSnapshotAt, queueSize }
 */

const DB_NAME = "caissepro_offline";
const DB_VERSION = 1;
const STORE_SNAPSHOT = "snapshot";
const STORE_QUEUE = "queue";
const STORE_META = "meta";

let _dbPromise = null;

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SNAPSHOT)) {
        db.createObjectStore(STORE_SNAPSHOT, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const q = db.createObjectStore(STORE_QUEUE, { keyPath: "id" });
        q.createIndex("created_at", "created_at", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(storeName, mode = "readonly") {
  return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function reqAsync(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ────────── Snapshot ──────────
export async function saveSnapshot(snap) {
  const store = await tx(STORE_SNAPSHOT, "readwrite");
  await reqAsync(store.put({ key: "current", data: snap, saved_at: new Date().toISOString() }));
  const meta = await tx(STORE_META, "readwrite");
  await reqAsync(meta.put({ key: "lastSnapshotAt", value: new Date().toISOString() }));
  return true;
}

export async function getSnapshot() {
  const store = await tx(STORE_SNAPSHOT);
  const r = await reqAsync(store.get("current"));
  return r ? r.data : null;
}

// ────────── Queue ──────────
export async function enqueue(action) {
  const item = {
    id: action.id || `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
    attempts: 0,
    ...action,
  };
  const store = await tx(STORE_QUEUE, "readwrite");
  await reqAsync(store.put(item));
  return item.id;
}

export async function dequeue(id) {
  const store = await tx(STORE_QUEUE, "readwrite");
  await reqAsync(store.delete(id));
  return true;
}

export async function listQueue() {
  const store = await tx(STORE_QUEUE);
  return new Promise((resolve, reject) => {
    const out = [];
    const req = store.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) { out.push(cur.value); cur.continue(); }
      else resolve(out.sort((a, b) => a.created_at.localeCompare(b.created_at)));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearQueue() {
  const store = await tx(STORE_QUEUE, "readwrite");
  await reqAsync(store.clear());
  return true;
}

// ────────── Meta ──────────
export async function getMeta() {
  const store = await tx(STORE_META);
  const last = await reqAsync(store.get("lastSnapshotAt"));
  const queue = await listQueue();
  return {
    lastSnapshotAt: last ? last.value : null,
    queueSize: queue.length,
  };
}
