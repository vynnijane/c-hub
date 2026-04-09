/* ── DATABASE ──────────────────────────────────────────────────────────────
 * Wraps IndexedDB with a simple Promise API.
 * Stores: cards | lorebooks | personas | presets | notes
 * ─────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const DB_NAME = 'jai-creator-studio';
  const DB_VER  = 2;
  const STORES  = ['cards', 'lorebooks', 'personas', 'presets', 'notes'];

  let db = null;

  function init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);

      req.onupgradeneeded = e => {
        const d = e.target.result;
        STORES.forEach(name => {
          if (!d.objectStoreNames.contains(name)) {
            d.createObjectStore(name, { keyPath: 'id' });
          }
        });
      };

      req.onsuccess = e => { db = e.target.result; resolve(); };
      req.onerror   = () => reject(req.error);
    });
  }

  function _tx(store, mode) {
    if (!db) throw new Error('DB not initialised');
    return db.transaction(store, mode).objectStore(store);
  }

  function put(store, value) {
    return new Promise((resolve, reject) => {
      const req = _tx(store, 'readwrite').put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  function get(store, key) {
    return new Promise((resolve, reject) => {
      const req = _tx(store, 'readonly').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  function getAll(store) {
    return new Promise((resolve, reject) => {
      const req = _tx(store, 'readonly').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  function del(store, key) {
    return new Promise((resolve, reject) => {
      const req = _tx(store, 'readwrite').delete(key);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  // Bulk read all stores (for workspace export)
  async function exportAll() {
    const result = {};
    for (const s of STORES) {
      result[s] = await getAll(s);
    }
    return result;
  }

  // Bulk write all stores (for workspace import — overwrites!)
  async function importAll(data) {
    for (const s of STORES) {
      if (!Array.isArray(data[s])) continue;
      const store = _tx(s, 'readwrite');
      // Clear existing
      await new Promise((res, rej) => {
        const r = store.clear();
        r.onsuccess = res;
        r.onerror = () => rej(r.error);
      });
      // Re-add
      for (const item of data[s]) {
        await put(s, item);
      }
    }
  }

  window.App = window.App || {};
  window.App.DB = { init, put, get, getAll, del, exportAll, importAll, STORES };
})();
