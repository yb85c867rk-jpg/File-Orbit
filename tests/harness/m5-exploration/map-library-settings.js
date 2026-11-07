import { openPersistenceDatabase } from '../../../src/engine/hypertree/persistence/idb.js';
import { DB_NAME, DB_VERSION, STORE_SETTINGS } from '../../../src/engine/hypertree/persistence/schema.js';

export const MAP_LIBRARY_SETTINGS_KEY = 'map-library-directory';
export const MAP_LIBRARIES_KEY = 'map-libraries-v2';
export const MAP_LIBRARIES_VERSION = 2;

function failure(reason, message, extra = {}) {
  return { ok: false, reason, message: String(message || reason), ...extra };
}

function normalizeLibrary(record) {
  if (!record || typeof record !== 'object') return null;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (!id) return null;
  if (!record.handle || typeof record.handle !== 'object') return null;
  if (record.handle.kind !== 'directory') return null;
  const name = String(record.name || record.handle.name || '').trim();
  if (!name) return null;
  const updatedAt = Number(record.updatedAt);
  return { id, handle: record.handle, name, updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0 };
}

function normalizeCollection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Number(value.version) !== MAP_LIBRARIES_VERSION) return null;
  if (!Array.isArray(value.libraries)) return null;
  const libraries = [];
  const ids = new Set();
  for (const raw of value.libraries) {
    const record = normalizeLibrary(raw);
    if (!record || ids.has(record.id)) return null;
    ids.add(record.id);
    libraries.push(record);
  }
  const selectedId = value.selectedId === null || value.selectedId === undefined ? null : String(value.selectedId);
  if (selectedId !== null && !ids.has(selectedId)) return null;
  return {
    version: MAP_LIBRARIES_VERSION,
    libraries,
    selectedId,
    updatedAt: Number(value.updatedAt) || 0
  };
}

/**
 * Collection API contract
 *
 * load()/save()/clear(): legacy single-directory compatibility. These methods
 * remain unchanged for the current application until integration.
 *
 * loadCollection(): { ok:true, initialized, version, libraries, selectedId,
 * updatedAt } or { ok:false, reason, message }. Malformed/unsupported
 * collection records are reported, never replaced by the legacy record.
 *
 * migrateLegacyCollection(): explicit operation only. An existing valid
 * collection (including an empty one) is authoritative. If no collection
 * exists and a valid legacy record exists, one Library is written and the
 * legacy record is retained. Migration is serialized with collection writes
 * and rechecks collection absence inside its readwrite transaction. Repeating
 * migration returns the stored stable ID.
 *
 * saveCollection(libraries, selectedId = null): { ok:true } or failure.
 * Libraries are { id, handle, name, updatedAt }; handle.kind must be
 * 'directory'. All inputs are validated before the instance write sequence is
 * advanced, so invalid requests cannot supersede accepted queued writes.
 * Handles are structured-cloned by IndexedDB. Selected IDs must reference a
 * stored Library or be null.
 *
 * Writes are serialized in this instance with latest-wins ordering. This is
 * not cross-tab conflict protection.
 */
export function createMapLibrarySettings({
  indexedDB = globalThis.indexedDB,
  openDatabase = openPersistenceDatabase,
  now = () => Date.now(),
  createId = () => (globalThis.crypto?.randomUUID?.() || `library-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)
} = {}) {
  let writeSeq = 0;
  let writeQueue = Promise.resolve();

  async function withStore(mode, operation) {
    const db = await openDatabase({ indexedDB, name: DB_NAME, version: DB_VERSION });
    try {
      const tx = db.transaction(STORE_SETTINGS, mode);
      const store = tx.objectStore(STORE_SETTINGS);
      const result = await operation(store, tx);
      if (mode === 'readwrite') await transactionDone(tx);
      return result;
    } finally {
      db.close();
    }
  }

  function transactionDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Transaction failed.'));
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted.'));
    });
  }

  function requestDone(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
    });
  }

  async function readSettingsRecord(store, key) {
    return requestDone(store.get(key));
  }

  async function readCollectionRecord(store) {
    const value = await readSettingsRecord(store, MAP_LIBRARIES_KEY);
    if (!value) return { initialized: false, collection: null };
    const collection = normalizeCollection(value);
    if (!collection) return { initialized: true, collection: null, corrupt: true };
    return { initialized: true, collection };
  }

  async function load() {
    try {
      return await withStore('readonly', async (store) => {
        const value = await readSettingsRecord(store, MAP_LIBRARY_SETTINGS_KEY);
        if (!value) return { ok: true, record: null };
        if (!value.handle || typeof value.handle !== 'object') return { ok: true, record: null };
        return { ok: true, record: { handle: value.handle, name: String(value.name || value.handle.name || ''), updatedAt: Number(value.updatedAt) || 0 } };
      });
    } catch (error) {
      return failure('storage-read-failed', error?.message || error);
    }
  }

  function save(handle, name) {
    const sequence = ++writeSeq;
    const run = writeQueue.then(async () => {
      if (sequence !== writeSeq) return failure('superseded', 'A newer settings write superseded this request.');
      if (!handle || typeof handle !== 'object') return failure('invalid-handle', 'A directory handle is required.');
      try {
        await withStore('readwrite', async (store) => {
          await requestDone(store.put({
            key: MAP_LIBRARY_SETTINGS_KEY,
            handle,
            name: String(name || handle.name || ''),
            updatedAt: now()
          }));
        });
        return { ok: true };
      } catch (error) {
        return failure('storage-write-failed', error?.message || error);
      }
    });
    writeQueue = run.catch(() => {});
    return run;
  }

  function clear() {
    const sequence = ++writeSeq;
    const run = writeQueue.then(async () => {
      if (sequence !== writeSeq) return failure('superseded', 'A newer settings write superseded this request.');
      try {
        await withStore('readwrite', async (store) => {
          await requestDone(store.delete(MAP_LIBRARY_SETTINGS_KEY));
        });
        return { ok: true };
      } catch (error) {
        return failure('storage-write-failed', error?.message || error);
      }
    });
    writeQueue = run.catch(() => {});
    return run;
  }

  async function loadCollection() {
    try {
      return await withStore('readonly', async (store) => {
        const read = await readCollectionRecord(store);
        if (read.corrupt) return failure('invalid-collection-record', 'The stored Map Library collection is invalid.');
        if (!read.initialized) return { ok: true, initialized: false, version: MAP_LIBRARIES_VERSION, libraries: [], selectedId: null, updatedAt: 0 };
        return {
          ok: true,
          initialized: true,
          version: MAP_LIBRARIES_VERSION,
          libraries: read.collection.libraries,
          selectedId: read.collection.selectedId,
          updatedAt: read.collection.updatedAt
        };
      });
    } catch (error) {
      return failure('storage-read-failed', error?.message || error);
    }
  }

  function saveCollection(libraries, selectedId = null) {
    const list = Array.isArray(libraries) ? libraries : null;
    if (!list) return Promise.resolve(failure('invalid-record', 'Libraries must be an array.'));
    const normalized = [];
    const ids = new Set();
    for (const record of list) {
      if (record && typeof record === 'object' && record.handle && typeof record.handle === 'object' && record.handle.kind !== 'directory') {
        return Promise.resolve(failure('invalid-handle', 'Map Library handles must be directory handles.'));
      }
      const item = normalizeLibrary(record);
      if (!item) return Promise.resolve(failure('invalid-record', 'Every Library needs an id, directory handle, and directory name.'));
      if (ids.has(item.id)) return Promise.resolve(failure('duplicate-id', 'Library IDs must be unique.'));
      ids.add(item.id);
      normalized.push({ ...item, updatedAt: item.updatedAt || now() });
    }
    const selected = selectedId === null || selectedId === undefined ? null : String(selectedId);
    if (selected !== null && !ids.has(selected)) return Promise.resolve(failure('invalid-selected-id', 'The selected Library must be one of the stored Libraries.'));
    const sequence = ++writeSeq;

    const run = writeQueue.then(async () => {
      if (sequence !== writeSeq) return failure('superseded', 'A newer collection write superseded this request.');
      try {
        await withStore('readwrite', async (store) => {
          await requestDone(store.put({
            key: MAP_LIBRARIES_KEY,
            version: MAP_LIBRARIES_VERSION,
            libraries: normalized,
            selectedId: selected,
            updatedAt: now()
          }));
        });
        return { ok: true, selectedId: selected };
      } catch (error) {
        return failure('storage-write-failed', error?.message || error);
      }
    });
    writeQueue = run.catch(() => {});
    return run;
  }

  function migrateLegacyCollection() {
    const run = writeQueue.then(async () => {
      try {
        return await withStore('readwrite', async (store) => {
          const current = await readSettingsRecord(store, MAP_LIBRARIES_KEY);
          if (current) {
            const collection = normalizeCollection(current);
            if (!collection) return failure('invalid-collection-record', 'The stored Map Library collection is invalid.');
            return { ok: true, migrated: false, initialized: true, libraries: collection.libraries, selectedId: collection.selectedId };
          }
          const legacy = await readSettingsRecord(store, MAP_LIBRARY_SETTINGS_KEY);
          if (!legacy?.handle || typeof legacy.handle !== 'object') {
            return { ok: true, migrated: false, initialized: false, libraries: [], selectedId: null };
          }
          const record = normalizeLibrary({
            id: String(createId()),
            handle: legacy.handle,
            name: String(legacy.name || legacy.handle.name || '').trim(),
            updatedAt: Number(legacy.updatedAt) || now()
          });
          if (!record) return failure('invalid-legacy-record', 'The legacy Library has no valid directory handle or directory name.');
          await requestDone(store.put({
            key: MAP_LIBRARIES_KEY,
            version: MAP_LIBRARIES_VERSION,
            libraries: [record],
            selectedId: record.id,
            updatedAt: now()
          }));
          return { ok: true, migrated: true, initialized: true, libraries: [record], selectedId: record.id };
        });
      } catch (error) {
        return failure('storage-write-failed', error?.message || error);
      }
    });
    writeQueue = run.catch(() => {});
    return run;
  }

  return { load, save, clear, loadCollection, saveCollection, migrateLegacyCollection };
}
