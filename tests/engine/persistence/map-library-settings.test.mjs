import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeIndexedDB } from './fake-indexeddb.mjs';
import { openPersistenceDatabase } from '../../../src/engine/hypertree/persistence/idb.js';
import { DB_NAME, DB_VERSION, STORE_SETTINGS } from '../../../src/engine/hypertree/persistence/schema.js';
import { createMapLibrarySettings, MAP_LIBRARY_SETTINGS_KEY, MAP_LIBRARIES_KEY, MAP_LIBRARIES_VERSION } from '../../harness/m5-exploration/map-library-settings.js';

const handle = (name) => ({ kind: 'directory', name });
function make(indexedDB, ids = ['id-1']) {
  let i = 0;
  return createMapLibrarySettings({ indexedDB, now: (() => { let t = 100; return () => ++t; })(), createId: () => ids[i++] || `id-${i}` });
}
async function raw(indexedDB, fn) {
  const db = await openPersistenceDatabase({ indexedDB, name: DB_NAME, version: DB_VERSION });
  try { return await fn(db); } finally { db.close(); }
}
async function putRaw(indexedDB, store, value) {
  return raw(indexedDB, (db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite'); const req = tx.objectStore(store).put(value);
    req.onerror = () => reject(req.error); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  }));
}
async function getRaw(indexedDB, store, key) {
  return raw(indexedDB, (db) => new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error);
  }));
}

test('no existing setting leaves collection uninitialized and migration is non-mutating', async () => {
  const indexedDB = new FakeIndexedDB(); const settings = make(indexedDB);
  const loaded = await settings.loadCollection();
  assert.equal(loaded.ok, true); assert.equal(loaded.initialized, false); assert.deepEqual(loaded.libraries, []);
  const migrated = await settings.migrateLegacyCollection();
  assert.equal(migrated.ok, true); assert.equal(migrated.migrated, false); assert.equal(migrated.initialized, false);
  assert.equal(await getRaw(indexedDB, STORE_SETTINGS, MAP_LIBRARIES_KEY), null);
});

test('loadCollection does not migrate or mutate storage merely by reading', async () => {
  const indexedDB = new FakeIndexedDB(); const settings = make(indexedDB);
  await settings.save(handle('Legacy Only'), 'Legacy Only');
  const loaded = await settings.loadCollection();
  assert.equal(loaded.ok, true); assert.equal(loaded.initialized, false); assert.deepEqual(loaded.libraries, []);
  const collection = await getRaw(indexedDB, STORE_SETTINGS, MAP_LIBRARIES_KEY);
  const legacy = await getRaw(indexedDB, STORE_SETTINGS, MAP_LIBRARY_SETTINGS_KEY);
  assert.equal(collection, null); assert.ok(legacy);
});

test('explicit legacy migration writes one stable record and keeps legacy compatibility record', async () => {
  const indexedDB = new FakeIndexedDB(); const settings = make(indexedDB, ['stable-1']);
  await settings.save(handle('Legacy Dir'), 'Legacy Dir');
  const migrated = await settings.migrateLegacyCollection();
  assert.equal(migrated.ok, true); assert.equal(migrated.migrated, true);
  assert.equal(migrated.libraries.length, 1); assert.equal(migrated.libraries[0].id, 'stable-1');
  assert.equal(migrated.libraries[0].name, 'Legacy Dir'); assert.equal(migrated.selectedId, 'stable-1');
  const stored = await getRaw(indexedDB, STORE_SETTINGS, MAP_LIBRARY_SETTINGS_KEY);
  assert.ok(stored); assert.equal(stored.handle.name, 'Legacy Dir');
  const loaded = await settings.loadCollection();
  assert.equal(loaded.initialized, true); assert.deepEqual(loaded.libraries, migrated.libraries);
});

test('repeated migration is idempotent and preserves stable ID', async () => {
  const indexedDB = new FakeIndexedDB(); const settings = make(indexedDB, ['stable-2']);
  await settings.save(handle('Legacy'), 'Legacy');
  const first = await settings.migrateLegacyCollection();
  const second = await settings.migrateLegacyCollection();
  assert.equal(first.migrated, true); assert.equal(second.migrated, false);
  assert.equal(second.libraries[0].id, first.libraries[0].id);
  assert.equal(second.libraries.length, 1);
});

test('existing collection is authoritative over legacy and an empty collection stays empty', async () => {
  const indexedDB = new FakeIndexedDB(); const settings = make(indexedDB, ['new-id']);
  await settings.save(handle('Legacy'), 'Legacy');
  await settings.saveCollection([], null);
  const migrated = await settings.migrateLegacyCollection();
  assert.equal(migrated.ok, true); assert.equal(migrated.migrated, false);
  assert.equal(migrated.initialized, true); assert.deepEqual(migrated.libraries, []);
  const loaded = await settings.loadCollection();
  assert.equal(loaded.initialized, true); assert.deepEqual(loaded.libraries, []);
});

test('same-named distinct directories are preserved by ID without name merging', async () => {
  const indexedDB = new FakeIndexedDB(); const settings = make(indexedDB);
  const a = { id: 'a', handle: handle('Shared'), name: 'Shared' };
  const b = { id: 'b', handle: handle('Shared'), name: 'Shared' };
  const saved = await settings.saveCollection([a, b], 'b');
  assert.equal(saved.ok, true);
  const loaded = await settings.loadCollection();
  assert.equal(loaded.libraries.length, 2);
  assert.deepEqual(loaded.libraries.map((r) => r.id), ['a', 'b']);
  assert.equal(loaded.selectedId, 'b');
});

test('valid selected ID round-trips and invalid selected ID is rejected', async () => {
  const indexedDB = new FakeIndexedDB(); const settings = make(indexedDB);
  const a = { id: 'a', handle: handle('A'), name: 'A' };
  assert.equal((await settings.saveCollection([a], 'a')).ok, true);
  assert.equal((await settings.loadCollection()).selectedId, 'a');
  const bad = await settings.saveCollection([a], 'missing');
  assert.equal(bad.ok, false); assert.equal(bad.reason, 'invalid-selected-id');
});

test('malformed and unsupported collection records fail without legacy fallback', async () => {
  for (const record of [
    { key: MAP_LIBRARIES_KEY, version: 999, libraries: [], selectedId: null },
    { key: MAP_LIBRARIES_KEY, version: MAP_LIBRARIES_VERSION, libraries: [{ id: 'x', handle: handle('X'), name: 'X' }], selectedId: 'missing' },
    { key: MAP_LIBRARIES_KEY, version: MAP_LIBRARIES_VERSION, libraries: [{ id: 'x', handle: handle('X'), name: 'X' }, { id: 'x', handle: handle('Y'), name: 'Y' }], selectedId: 'x' }
  ]) {
    const indexedDB = new FakeIndexedDB(); const settings = make(indexedDB);
    await settings.save(handle('Legacy'), 'Legacy');
    await putRaw(indexedDB, STORE_SETTINGS, record);
    const loaded = await settings.loadCollection();
    assert.equal(loaded.ok, false); assert.equal(loaded.reason, 'invalid-collection-record');
    const migrated = await settings.migrateLegacyCollection();
    assert.equal(migrated.ok, false); assert.equal(migrated.reason, 'invalid-collection-record');
  }
});

test('invalid records and duplicate IDs are rejected before writing', async () => {
  const indexedDB = new FakeIndexedDB(); const settings = make(indexedDB);
  assert.equal((await settings.saveCollection([{ id: '', handle: handle('A'), name: 'A' }], null)).reason, 'invalid-record');
  assert.equal((await settings.saveCollection([{ id: 'a', handle: null, name: 'A' }], null)).reason, 'invalid-record');
  assert.equal((await settings.saveCollection([{ id: 'a', handle: handle(''), name: '' }], null)).reason, 'invalid-record');
  assert.equal((await settings.saveCollection([{ id: 'a', handle: handle('A'), name: 'A' }, { id: 'a', handle: handle('B'), name: 'B' }], null)).reason, 'duplicate-id');
});

test('unavailable IndexedDB reports read and write failures', async () => {
  const settings = createMapLibrarySettings({ indexedDB: null });
  assert.equal((await settings.loadCollection()).reason, 'storage-read-failed');
  assert.equal((await settings.migrateLegacyCollection()).reason, 'storage-read-failed');
  const write = await settings.saveCollection([{ id: 'a', handle: handle('A'), name: 'A' }], 'a');
  assert.equal(write.ok, false); assert.equal(write.reason, 'storage-write-failed');
});

test('newest accepted collection write wins over older queued write', async () => {
  const indexedDB = new FakeIndexedDB(); const settings = make(indexedDB);
  const a = { id: 'a', handle: handle('A'), name: 'A' };
  const b = { id: 'b', handle: handle('B'), name: 'B' };
  const first = settings.saveCollection([a], 'a');
  const second = settings.saveCollection([b], 'b');
  const [older, newer] = await Promise.all([first, second]);
  assert.equal(older.ok, false); assert.equal(older.reason, 'superseded');
  assert.equal(newer.ok, true);
  const loaded = await settings.loadCollection();
  assert.deepEqual(loaded.libraries.map((r) => r.id), ['b']); assert.equal(loaded.selectedId, 'b');
});

function failingOpen({ synchronous = false, name = 'DataCloneError' } = {}) {
  return async () => ({
    close() {},
    transaction() {
      return {
        oncomplete: null, onerror: null, onabort: null,
        objectStore() {
          return {
            put() {
              if (synchronous) throw Object.assign(new Error('structured clone failed'), { name });
              const request = {};
              queueMicrotask(() => { request.error = Object.assign(new Error('transaction aborted'), { name }); request.onerror?.(); });
              return request;
            }
          };
        }
      };
    }
  });
}

test('clone and transaction-abort failures are reported without claiming success', async () => {
  const clone = createMapLibrarySettings({ indexedDB: new FakeIndexedDB(), openDatabase: failingOpen({ synchronous: true, name: 'DataCloneError' }) });
  const cloneResult = await clone.saveCollection([{ id: 'a', handle: handle('A'), name: 'A' }], 'a');
  assert.equal(cloneResult.ok, false); assert.equal(cloneResult.reason, 'storage-write-failed');
  const aborted = createMapLibrarySettings({ indexedDB: new FakeIndexedDB(), openDatabase: failingOpen({ synchronous: false, name: 'AbortError' }) });
  const abortResult = await aborted.saveCollection([{ id: 'a', handle: handle('A'), name: 'A' }], 'a');
  assert.equal(abortResult.ok, false); assert.equal(abortResult.reason, 'storage-write-failed');
});

test('legacy single-directory load/save/clear compatibility remains intact', async () => {
  const indexedDB = new FakeIndexedDB(); const settings = make(indexedDB);
  assert.equal((await settings.load()).record, null);
  await settings.save(handle('Single'), 'Single');
  const loaded = await settings.load();
  assert.equal(loaded.record.name, 'Single'); assert.equal(loaded.record.handle.name, 'Single');
  await settings.clear();
  assert.equal((await settings.load()).record, null);
});

test('collection writes do not touch map or other settings stores', async () => {
  const indexedDB = new FakeIndexedDB(); const settings = make(indexedDB);
  await putRaw(indexedDB, 'maps', { mapId: 'm1', modifiedAt: 5, name: 'Keep' });
  await putRaw(indexedDB, STORE_SETTINGS, { key: 'unrelated', value: 'keep' });
  await settings.saveCollection([{ id: 'a', handle: handle('A'), name: 'A' }], 'a');
  assert.deepEqual(await getRaw(indexedDB, 'maps', 'm1'), { mapId: 'm1', modifiedAt: 5, name: 'Keep' });
  assert.deepEqual(await getRaw(indexedDB, STORE_SETTINGS, 'unrelated'), { key: 'unrelated', value: 'keep' });
});

