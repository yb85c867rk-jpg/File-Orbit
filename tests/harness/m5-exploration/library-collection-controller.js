/**
 * Shared linked-Map-Library collection controller.
 *
 * Owns only Library records, selected ID, access/listing status and collection
 * persistence coordination. It never owns document content, writable document
 * destinations, attachments, history, revision or serialization.
 */
export function createLibraryCollectionController({
  settings,
  createId = () => (globalThis.crypto?.randomUUID?.() || `library-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`),
  now = () => Date.now(),
  canPersist = () => true
} = {}) {
  if (!settings || typeof settings.saveCollection !== 'function') {
    throw new TypeError('Library collection controller requires collection settings.');
  }

  let records = [];
  let selectedId = null;
  let initialized = false;
  let disposed = false;
  let operationSeq = 0;
  const statuses = new Map();

  const snapshot = () => ({
    initialized,
    disposed,
    selectedId,
    libraries: records.map((record) => Object.freeze({ ...record })),
    selected: selectedId ? records.find((record) => record.id === selectedId) || null : null,
    statuses: new Map([...statuses].map(([id, status]) => [id, { ...status }]))
  });

  const statusFor = (id) => ({ permission: 'unknown', phase: 'idle', error: null, lastListedAt: null, ...(statuses.get(id) || {}) });

  function setStatus(id, patch = {}) {
    if (!id || disposed) return null;
    const next = { ...statusFor(id), ...patch };
    statuses.set(id, next);
    return next;
  }

  async function sameHandle(left, right) {
    if (!left || !right) return { ok: false, same: false };
    if (left === right) return { ok: true, same: true };
    if (typeof left.isSameEntry !== 'function') return { ok: false, same: false };
    try {
      return { ok: true, same: Boolean(await left.isSameEntry(right)) };
    } catch (error) {
      return { ok: false, same: false, error };
    }
  }

  async function findByHandle(handle) {
    for (const record of records) {
      const compared = await sameHandle(handle, record.handle);
      if (!compared.ok) return { ok: false, reason: 'identity-unverified', error: compared.error };
      if (compared.same) return { ok: true, record };
    }
    return { ok: true, record: null };
  }

  async function persistCollection() {
    if (disposed) return { ok: false, reason: 'disposed' };
    if (!canPersist()) return { ok: false, reason: 'storage-write-failed', message: 'Collection persistence is unavailable.' };
    return settings.saveCollection(records, selectedId);
  }

  async function initialize() {
    if (disposed) return { ok: false, reason: 'disposed' };
    const token = ++operationSeq;
    const migrated = await settings.migrateLegacyCollection();
    if (disposed || token !== operationSeq) return { ok: false, reason: 'stale' };
    if (!migrated.ok) return migrated;
    const loaded = await settings.loadCollection();
    if (disposed || token !== operationSeq) return { ok: false, reason: 'stale' };
    if (!loaded.ok) return loaded;
    records = loaded.libraries.map((record) => ({ ...record }));
    selectedId = loaded.selectedId;
    initialized = true;
    return {
      ok: true,
      migrated: Boolean(migrated.migrated),
      initialized: true,
      selectedId,
      libraries: records.map((record) => ({ ...record }))
    };
  }

  async function adopt(handle, { name = '', permission = 'granted' } = {}) {
    if (disposed) return { ok: false, reason: 'disposed' };
    if (!handle || handle.kind !== 'directory') return { ok: false, reason: 'invalid-handle' };
    if (!initialized) { const loaded = await initialize(); if (!loaded.ok) return loaded; }
    if (disposed) return { ok: false, reason: 'disposed' };
    const token = ++operationSeq;
    const found = await findByHandle(handle);
    if (disposed || token !== operationSeq) return { ok: false, reason: 'stale' };
    if (!found.ok) return found;
    const directoryName = String(name || handle.name || '').trim();
    if (!directoryName) return { ok: false, reason: 'invalid-name' };

    let record = found.record;
    let duplicate = Boolean(record);
    if (record) {
      record = { ...record, name: directoryName, updatedAt: now() };
      records = records.map((item) => item.id === record.id ? record : item);
    } else {
      record = { id: String(createId()), handle, name: directoryName, updatedAt: now() };
      records = [...records, record];
    }
    selectedId = record.id;
    setStatus(record.id, { permission, phase: 'ready', error: null });
    const persisted = await persistCollection();
    if (disposed || token !== operationSeq) return { ok: false, reason: 'stale' };
    return {
      ok: true,
      duplicate,
      library: { ...record },
      persisted: Boolean(persisted.ok),
      persistence: persisted.ok ? null : persisted
    };
  }

  function select(id, { persist = true } = {}) {
    if (disposed) return { ok: false, reason: 'disposed' };
    if (!initialized) return initialize().then((loaded) => loaded.ok ? select(id, { persist }) : loaded);
    const record = records.find((item) => item.id === id);
    if (!record) return { ok: false, reason: 'unknown-library' };
    const token = ++operationSeq;
    selectedId = record.id;
    if (!persist) return { ok: true, library: { ...record }, persisted: false };
    return persistCollection().then((result) => {
      if (disposed || token !== operationSeq) return { ok: false, reason: 'stale' };
      return { ok: Boolean(result.ok), library: { ...record }, persisted: Boolean(result.ok), persistence: result.ok ? null : result };
    });
  }

  async function relink(id, handle, name) {
    if (disposed) return { ok: false, reason: 'disposed' };
    if (!handle || handle.kind !== 'directory') return { ok: false, reason: 'invalid-handle' };
    if (!initialized) { const loaded = await initialize(); if (!loaded.ok) return loaded; }
    const token = ++operationSeq;
    const original = records.find((record) => record.id === id);
    if (!original) return { ok: false, reason: 'unknown-library' };
    const directoryName = String(name || handle.name || '').trim();
    if (!directoryName) return { ok: false, reason: 'invalid-name' };
    const sameOriginal = await sameHandle(handle, original.handle);
    if (!sameOriginal.ok) return { ok: false, reason: 'identity-unverified' };
    if (sameOriginal.same) return { ok: true, noChange: true, library: { ...original }, persisted: false };
    const duplicate = await findByHandle(handle);
    if (!duplicate.ok) return { ok: false, reason: 'identity-unverified' };
    if (duplicate.record && duplicate.record.id !== id) return { ok: false, reason: 'already-linked', existingId: duplicate.record.id, library: { ...duplicate.record } };
    if (disposed || token !== operationSeq) return { ok: false, reason: 'stale' };
    if (!canPersist()) return { ok: false, reason: 'storage-write-failed', message: 'Collection persistence is unavailable.' };
    const next = records.map((record) => record.id === id ? { ...record, handle, name: directoryName, updatedAt: now() } : record);
    const saved = await settings.saveCollection(next, id);
    if (!saved.ok) return saved;
    if (disposed || token !== operationSeq) return { ok: false, reason: 'stale' };
    records = next;
    selectedId = id;
    setStatus(id, { permission: 'granted', phase: 'ready', error: null, lastListedAt: now() });
    return { ok: true, library: { ...records.find((record) => record.id === id) }, persisted: true };
  }

  function markAccess(id, patch = {}) {
    if (!records.some((record) => record.id === id)) return null;
    return setStatus(id, patch);
  }

  function getStatus(id) { return statusFor(id); }

  function dispose() {
    disposed = true;
    operationSeq += 1;
    statuses.clear();
    records = [];
    selectedId = null;
  }

  return {
    initialize,
    adopt,
    relink,
    findByHandle,
    select,
    persist: persistCollection,
    markAccess,
    getStatus,
    snapshot,
    dispose,
    get disposed() { return disposed; }
  };
}
