import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeIndexedDB } from './fake-indexeddb.mjs';
import { createPersistenceRepository } from '../../../src/engine/hypertree/persistence/repository.js';
import { APPLICATION_LIBRARY_HARD_CAP_BYTES } from '../../../src/engine/hypertree/persistence/schema.js';

test('library usage exposes application bytes, cap, estimate, persisted, and persist outcomes', async () => {
  const indexedDB = new FakeIndexedDB();
  let persisted = false;
  let persistCalls = 0;
  const storageManager = {
    estimate: async () => ({ usage: 4096, quota: 8192 }),
    persisted: async () => persisted,
    persist: async () => { persistCalls += 1; persisted = true; return true; }
  };
  const repo = createPersistenceRepository({ indexedDB, storageManager });
  const usage = await repo.usage();
  assert.equal(usage.storedAttachmentBytes, 0);
  assert.equal(usage.libraryHardCapBytes, APPLICATION_LIBRARY_HARD_CAP_BYTES);
  assert.equal(usage.estimate.usage, 4096);
  assert.equal(usage.estimate.quota, 8192);
  assert.equal(usage.estimate.status, 'available');
  assert.equal(usage.estimate.persisted, false);
  const result = await repo.requestPersist();
  assert.equal(result.status, 'granted');
  assert.equal(result.granted, true);
  assert.equal(persisted, true);
  assert.equal(persistCalls, 1);
  repo.close();
});

test('missing storage manager reports unknown/unavailable states', async () => {
  const repo = createPersistenceRepository({ indexedDB: new FakeIndexedDB(), storageManager: null });
  const usage = await repo.usage();
  assert.equal(usage.estimate.status, 'unavailable');
  assert.equal(usage.estimate.usage, null);
  assert.equal(usage.estimate.persisted, null);
  const result = await repo.requestPersist();
  assert.equal(result.status, 'unavailable');
  repo.close();
});

test('close during pending open prevents a late connection from leaking or resurrecting', async () => {
  const repo = createPersistenceRepository({ indexedDB: new FakeIndexedDB() });
  const pending = repo.open();
  repo.close();
  await assert.rejects(pending, (error) => error.code === 'idb-closed');
  assert.equal(repo.closed, true);
  repo.close();
});

test('versionchange closes the connection and blocks further opens/writes', async () => {
  const indexedDB = new FakeIndexedDB();
  let versionChanges = 0;
  const repo = createPersistenceRepository({ indexedDB, onVersionChange: () => { versionChanges += 1; } });
  await repo.open();
  indexedDB.fireVersionChange('fileorbit');
  assert.equal(versionChanges, 1);
  assert.equal(repo.closed, true);
  await assert.rejects(() => repo.open(), (error) => error.code === 'idb-versionchange');
});
test('persist not-granted, error, and estimate-error outcomes are reported honestly', async () => {
  const denied = createPersistenceRepository({ indexedDB: new FakeIndexedDB(), storageManager: { estimate: async () => ({ usage: 1, quota: 2 }), persisted: async () => false, persist: async () => false } });
  const deniedResult = await denied.requestPersist();
  assert.equal(deniedResult.status, 'not-granted');
  assert.equal(deniedResult.granted, false);
  denied.close();
  const failure = createPersistenceRepository({ indexedDB: new FakeIndexedDB(), storageManager: { estimate: async () => { throw new Error('estimate failed'); }, persisted: async () => false, persist: async () => { throw new Error('persist failed'); } } });
  const usage = await failure.usage();
  assert.equal(usage.estimate.status, 'error');
  assert.equal(usage.estimate.usage, null);
  const result = await failure.requestPersist();
  assert.equal(result.status, 'error');
  assert.equal(result.granted, false);
  failure.close();
});
test('repository emits onOpenSuccess only for a current owned connection', async () => {
  const indexedDB = new FakeIndexedDB();
  let successes = 0;
  const repo = createPersistenceRepository({ indexedDB, onOpenSuccess: () => { successes += 1; } });
  await repo.open();
  assert.equal(successes, 1);
  repo.close();
  await repo.open();
  assert.equal(successes, 2);
  repo.close();
});

test('blocked open then success clears recoverable state', async () => {
  const indexedDB = new FakeIndexedDB();
  await createPersistenceRepository({ indexedDB }).open();
  let blocked = 0; let success = 0;
  const repo = createPersistenceRepository({ indexedDB, onBlocked: () => { blocked += 1; }, onOpenSuccess: () => { success += 1; } });
  indexedDB.blockNextOpen = 1;
  const pending = repo.open();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(blocked, 1);
  indexedDB.releaseBlockedOpen();
  await pending;
  assert.equal(success, 1);
  repo.close();
});

test('cancel during blocked open closes late connection and never publishes success', async () => {
  const indexedDB = new FakeIndexedDB();
  await createPersistenceRepository({ indexedDB }).open();
  let success = 0;
  const repo = createPersistenceRepository({ indexedDB, onOpenSuccess: () => { success += 1; } });
  indexedDB.blockNextOpen = 1;
  const pending = repo.open();
  await new Promise((resolve) => setTimeout(resolve, 0));
  repo.close();
  indexedDB.releaseBlockedOpen();
  await assert.rejects(pending, (error) => error.code === 'idb-closed');
  assert.equal(success, 0);
});

test('cancel then retry owns a fresh blocked request and succeeds once', async () => {
  const indexedDB = new FakeIndexedDB();
  await createPersistenceRepository({ indexedDB }).open();
  let success = 0;
  const repo = createPersistenceRepository({ indexedDB, onOpenSuccess: () => { success += 1; } });
  indexedDB.blockNextOpen = 1;
  const first = repo.open();
  await new Promise((resolve) => setTimeout(resolve, 0));
  repo.close();
  indexedDB.releaseBlockedOpen();
  await assert.rejects(first);
  indexedDB.blockNextOpen = 1;
  const second = repo.open();
  await new Promise((resolve) => setTimeout(resolve, 0));
  indexedDB.releaseBlockedOpen();
  await second;
  assert.equal(success, 1);
  repo.close();
});
