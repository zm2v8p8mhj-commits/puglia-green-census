/* Puglia Green Census — Persistenza offline su IndexedDB */
(function (global) {
  'use strict';

  const DB_NAME = 'puglia-green-census';
  const DB_VERSION = 1;
  const STORES = ['progetto', 'aree', 'alberi', 'elementi', 'foto'];

  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('progetto')) {
          db.createObjectStore('progetto', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('aree')) {
          const s = db.createObjectStore('aree', { keyPath: 'id' });
          s.createIndex('codice', 'codice', { unique: false });
        }
        if (!db.objectStoreNames.contains('alberi')) {
          const s = db.createObjectStore('alberi', { keyPath: 'id' });
          s.createIndex('area_id', 'area_id', { unique: false });
          s.createIndex('codice', 'codice', { unique: false });
        }
        if (!db.objectStoreNames.contains('elementi')) {
          const s = db.createObjectStore('elementi', { keyPath: 'id' });
          s.createIndex('area_id', 'area_id', { unique: false });
        }
        if (!db.objectStoreNames.contains('foto')) {
          db.createObjectStore('foto', { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function tx(store, mode) {
    return open().then((db) => db.transaction(store, mode).objectStore(store));
  }

  function put(store, value) {
    return tx(store, 'readwrite').then((os) => new Promise((res, rej) => {
      const r = os.put(value);
      r.onsuccess = () => res(value);
      r.onerror = () => rej(r.error);
    }));
  }

  function get(store, key) {
    return tx(store, 'readonly').then((os) => new Promise((res, rej) => {
      const r = os.get(key);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => rej(r.error);
    }));
  }

  function all(store) {
    return tx(store, 'readonly').then((os) => new Promise((res, rej) => {
      const r = os.getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    }));
  }

  function byIndex(store, index, value) {
    return tx(store, 'readonly').then((os) => new Promise((res, rej) => {
      const r = os.index(index).getAll(value);
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    }));
  }

  function del(store, key) {
    return tx(store, 'readwrite').then((os) => new Promise((res, rej) => {
      const r = os.delete(key);
      r.onsuccess = () => res(true);
      r.onerror = () => rej(r.error);
    }));
  }

  function clearAll() {
    return open().then((db) => Promise.all(STORES.map((s) => new Promise((res, rej) => {
      const r = db.transaction(s, 'readwrite').objectStore(s).clear();
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    }))));
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 8);
  }

  global.GC_DB = { open, put, get, all, byIndex, del, clearAll, uid };
})(window);
