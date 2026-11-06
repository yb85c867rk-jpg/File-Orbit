import { openPersistenceDatabase } from '../../../src/engine/hypertree/persistence/idb.js';
import { DB_NAME, DB_VERSION, STORE_SETTINGS } from '../../../src/engine/hypertree/persistence/schema.js';

export const MAP_LIBRARY_SETTINGS_KEY = 'map-library-directory';

/**
 * Dedicated settings record for the File System Access directory handle.
 * The handle is stored as a structured-cloneable value, never JSON.
 * It is deliberately separate from map/recovery records.
 */
export function createMapLibrarySettings({ indexedDB = globalThis.indexedDB, now = () => Date.now() } = {}) {
  let writeSeq = 0;
  let writeQueue = Promise.resolve();

  async function withStore(mode, operation) {
    const db = await openPersistenceDatabase({ indexedDB, name: DB_NAME, version: DB_VERSION });
    try {
      const tx = db.transaction(STORE_SETTINGS, mode);
      const store = tx.objectStore(STORE_SETTINGS);
      return await operation(store, tx);
    } finally {
      db.close();
    }
  }

  async function load() {
    return withStore('readonly', async (store) => {
      const request = store.get(MAP_LIBRARY_SETTINGS_KEY);
      const value = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      if (!value) return { ok: true, record: null };
      if (!value.handle || typeof value.handle !== 'object') return { ok: true, record: null };
      return { ok: true, record: { handle: value.handle, name: String(value.name || value.handle.name || ''), updatedAt: Number(value.updatedAt) || 0 } };
    }).catch((error) => ({ ok: false, reason: 'storage-read-failed', message: String(error?.message || error) }));
  }

  function save(handle, name) {
    const sequence = ++writeSeq;
    const run = writeQueue.then(async () => {
      if (sequence !== writeSeq) return { ok: false, reason: 'superseded' };
      if (!handle || typeof handle !== 'object') return { ok: false, reason: 'invalid-handle' };
      try {
        await withStore('readwrite', async (store, tx) => {
          const request = store.put({
            key: MAP_LIBRARY_SETTINGS_KEY,
            handle,
            name: String(name || handle.name || ''),
            updatedAt: now()
          });
          await new Promise((resolve, reject) => {
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
          await new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
          });
        });
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: 'storage-write-failed', message: String(error?.message || error) };
      }
    });
    writeQueue = run.catch(() => {});
    return run;
  }

  function clear() {
    const sequence = ++writeSeq;
    const run = writeQueue.then(async () => {
      if (sequence !== writeSeq) return { ok: false, reason: 'superseded' };
      try {
        await withStore('readwrite', async (store, tx) => {
          const request = store.delete(MAP_LIBRARY_SETTINGS_KEY);
          await new Promise((resolve, reject) => {
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
          await new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
          });
        });
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: 'storage-write-failed', message: String(error?.message || error) };
      }
    });
    writeQueue = run.catch(() => {});
    return run;
  }

  return { load, save, clear };
}
