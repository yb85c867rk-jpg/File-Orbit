import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeIndexedDB } from './fake-indexeddb.mjs';
import { createPersistenceRepository } from '../../../src/engine/hypertree/persistence/repository.js';

function openRaw(indexedDB, version) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('fileorbit', version);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

test('fresh database creation and reopening the current schema work', async () => {
  const indexedDB = new FakeIndexedDB();
  const first = createPersistenceRepository({ indexedDB });
  assert.deepEqual(await first.list(), []);
  first.close();
  const second = createPersistenceRepository({ indexedDB });
  assert.deepEqual(await second.list(), []);
  second.close();
});

test('incompatible newer database version is rejected without erasing storage', async () => {
  const indexedDB = new FakeIndexedDB();
  const raw = await openRaw(indexedDB, 3);
  raw.close();
  const repo = createPersistenceRepository({ indexedDB });
  await assert.rejects(() => repo.open(), (error) => error.code === 'schema-version-mismatch');
  assert.equal(indexedDB.databases.has('fileorbit'), true);
  repo.close();
});

test('versionchange prevents reopen and further writes', async () => {
  const indexedDB = new FakeIndexedDB();
  let closed = 0;
  const repo = createPersistenceRepository({ indexedDB, onVersionChange: () => { closed += 1; } });
  await repo.open();
  indexedDB.fireVersionChange('fileorbit');
  assert.equal(closed, 1);
  assert.equal(repo.closed, true);
  await assert.rejects(() => repo.open(), (error) => error.code === 'idb-versionchange');
});

