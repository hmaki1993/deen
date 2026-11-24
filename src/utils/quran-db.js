/**
 * Asynchronous IndexedDB + In-Memory LRU Cache for Quran data.
 * Replaces the old synchronous 5MB localStorage blob that caused UI freezes
 * and QuotaExceededError on mobile WebView.
 */

const DB_NAME = 'deen-quran-db';
const DB_VERSION = 1;
const STORE_NAME = 'cache';
const LEGACY_LS_KEY = 'deen-quran-cache';

const MAX_MEMORY_ENTRIES = 50;
const memoryCache = new Map();

let dbPromise = null;
let legacyCleaned = false;

function cleanupLegacyLocalStorage() {
  if (legacyCleaned) return;
  legacyCleaned = true;
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(LEGACY_LS_KEY)) {
      localStorage.removeItem(LEGACY_LS_KEY);
    }
  } catch {
    // Ignore storage access errors
  }
}

function setMemory(key, value) {
  if (memoryCache.has(key)) {
    memoryCache.delete(key);
  }
  memoryCache.set(key, value);
  if (memoryCache.size > MAX_MEMORY_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    memoryCache.delete(oldestKey);
  }
}

function openDB() {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

export async function getQuranCache(key) {
  cleanupLegacyLocalStorage();

  if (memoryCache.has(key)) {
    const val = memoryCache.get(key);
    // Refresh LRU recency
    memoryCache.delete(key);
    memoryCache.set(key, val);
    return val;
  }

  const db = await openDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const result = req.result ?? null;
        if (result !== null) {
          setMemory(key, result);
        }
        resolve(result);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function setQuranCache(key, data) {
  setMemory(key, data);

  const db = await openDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(data, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export function getQuranMemoryCache(key) {
  return memoryCache.get(key) ?? null;
}
