import {
  DB_NAME, DB_VERSION, STORE_ATTACHMENTS, STORE_DOCUMENTS, STORE_MAPS, STORE_META, STORE_RECOVERY_ATTACHMENTS, STORE_RECOVERY_CHECKPOINTS, STORE_RECOVERY_WORKSPACES, STORE_SETTINGS, PersistenceError
} from './schema.js';

export function normalizeIdbError(error, code = 'idb-error') {
  if (error instanceof PersistenceError) return error;
  const name = String(error?.name || 'Error');
  const message = String(error?.message || error || 'IndexedDB operation failed.');
  const mapped = name === 'QuotaExceededError' ? 'quota-exceeded'
    : name === 'AbortError' ? 'transaction-aborted'
      : name === 'InvalidStateError' ? 'idb-invalid-state'
        : name === 'VersionError' ? 'schema-version-mismatch'
          : name === 'ConstraintError' ? 'idb-constraint'
            : code;
  return new PersistenceError(mapped, message, { cause: error, details: { idbName: name } });
}

export function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(normalizeIdbError(request.error, 'idb-request-failed'));
  });
}

export function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(normalizeIdbError(transaction.error, 'transaction-failed'));
    transaction.onabort = () => reject(transaction.error
      ? normalizeIdbError(transaction.error, 'transaction-aborted')
      : new PersistenceError('transaction-aborted', 'The storage transaction was aborted.'));
  });
}

export function createSchema(indexedDB, name = DB_NAME, version = DB_VERSION) {
  const request = indexedDB.open(name, version);
  const stores = new Set([STORE_MAPS, STORE_DOCUMENTS, STORE_ATTACHMENTS, STORE_SETTINGS, STORE_META, STORE_RECOVERY_WORKSPACES, STORE_RECOVERY_CHECKPOINTS, STORE_RECOVERY_ATTACHMENTS]);
  request.onupgradeneeded = () => {
    const db = request.result;
    for (const storeName of stores) {
      if (db.objectStoreNames.contains(storeName)) continue;
      if (storeName === STORE_ATTACHMENTS) db.createObjectStore(storeName, { keyPath: ['mapId', 'attachmentId'] });
      else if (storeName === STORE_RECOVERY_CHECKPOINTS) db.createObjectStore(storeName, { keyPath: ['workspaceId', 'checkpointGeneration'] });
      else if (storeName === STORE_RECOVERY_ATTACHMENTS) db.createObjectStore(storeName, { keyPath: ['workspaceId', 'checkpointGeneration', 'attachmentId'] });
      else if (storeName === STORE_RECOVERY_WORKSPACES) db.createObjectStore(storeName, { keyPath: 'workspaceId' });
      else db.createObjectStore(storeName, { keyPath: storeName === STORE_SETTINGS || storeName === STORE_META ? 'key' : 'mapId' });
    }
    const tx = request.transaction;
    if (tx) {
      const maps = tx.objectStore(STORE_MAPS);
      if (!maps.indexNames.contains('by_modifiedAt')) maps.createIndex('by_modifiedAt', 'modifiedAt');
      const attachments = tx.objectStore(STORE_ATTACHMENTS);
      if (!attachments.indexNames.contains('by_mapId')) attachments.createIndex('by_mapId', 'mapId');
      const workspaces = tx.objectStore(STORE_RECOVERY_WORKSPACES);
      if (!workspaces.indexNames.contains('by_state_updatedAt')) workspaces.createIndex('by_state_updatedAt', ['state', 'updatedAt']);
      const checkpoints = tx.objectStore(STORE_RECOVERY_CHECKPOINTS);
      if (!checkpoints.indexNames.contains('by_workspace')) checkpoints.createIndex('by_workspace', 'workspaceId');
      const recoveryAttachments = tx.objectStore(STORE_RECOVERY_ATTACHMENTS);
      if (!recoveryAttachments.indexNames.contains('by_workspace_generation')) recoveryAttachments.createIndex('by_workspace_generation', ['workspaceId', 'checkpointGeneration']);
      const meta = tx.objectStore(STORE_META);
      meta.put({ key: 'schema', schemaVersion: DB_VERSION });
    }
  };
  return request;
}

export function openPersistenceDatabase({
  indexedDB = globalThis.indexedDB,
  name = DB_NAME,
  version = DB_VERSION,
  onBlocked = () => {},
  onVersionChange = () => {}
} = {}) {
  if (!indexedDB || typeof indexedDB.open !== 'function') {
    return Promise.reject(new PersistenceError('idb-unavailable', 'IndexedDB is not available in this browser context.'));
  }
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = createSchema(indexedDB, name, version);
    } catch (error) {
      reject(normalizeIdbError(error, 'idb-open-failed'));
      return;
    }
    let settled = false;
    request.onblocked = () => {
      try { onBlocked({ name, version }); } catch {}
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(normalizeIdbError(request.error, 'idb-open-failed'));
    };
    request.onsuccess = () => {
      if (settled) return;
      const db = request.result;
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        try { db.close(); } catch {}
      };
      db.onversionchange = () => {
        close();
        try { onVersionChange({ name, version }); } catch {}
      };
      db.onclose = () => {
        closed = true;
      };
      settled = true;
      resolve({
        db,
        name,
        version,
        get closed() { return closed; },
        close,
        transaction(storeNames, mode = 'readonly') {
          if (closed) throw new PersistenceError('idb-closed', 'The persistence connection is closed.');
          return db.transaction(storeNames, mode);
        }
      });
    };
  });
}

export async function deletePersistenceDatabase({
  indexedDB = globalThis.indexedDB,
  name = DB_NAME,
  onBlocked = () => {}
} = {}) {
  if (!indexedDB || typeof indexedDB.deleteDatabase !== 'function') {
    throw new PersistenceError('idb-unavailable', 'IndexedDB is not available in this browser context.');
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onblocked = () => { try { onBlocked({ name }); } catch {} };
    request.onerror = () => reject(normalizeIdbError(request.error, 'idb-delete-failed'));
    request.onsuccess = () => resolve(true);
  });
}
