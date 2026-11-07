import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibraryCollectionController } from '../../harness/m5-exploration/library-collection-controller.js';

const dir = (name, token = name) => ({ kind: 'directory', name, token, async isSameEntry(other) { return other?.token === token; } });
function settingsStub({ libraries = [], selectedId = null, failSave = false, failLoad = false } = {}) {
  const state = { libraries: libraries.map((r) => ({ ...r })), selectedId, saves: 0, writes: [], failSave };
  return {
    state,
    async migrateLegacyCollection() { return { ok: true, migrated: false, initialized: true, libraries: state.libraries, selectedId: state.selectedId }; },
    async loadCollection() {
      if (failLoad) return { ok: false, reason: 'storage-read-failed', message: 'read failed' };
      return { ok: true, initialized: true, libraries: state.libraries.map((r) => ({ ...r })), selectedId: state.selectedId };
    },
    async saveCollection(libraries, selectedId) {
      if (state.failSave) return { ok: false, reason: 'storage-write-failed', message: 'write failed' };
      state.saves += 1; state.libraries = libraries.map((r) => ({ ...r })); state.selectedId = selectedId; state.writes.push({ ids: libraries.map((r) => r.id), selectedId });
      return { ok: true };
    }
  };
}

test('controller initializes migration/collection and selected Library', async () => {
  const a = { id: 'a', handle: dir('A'), name: 'A' };
  const settings = settingsStub({ libraries: [a], selectedId: 'a' });
  const controller = createLibraryCollectionController({ settings, createId: () => 'new' });
  const loaded = await controller.initialize();
  assert.equal(loaded.ok, true); assert.equal(loaded.selectedId, 'a');
  assert.equal(controller.snapshot().libraries.length, 1);
});

test('controller adopts A and B, deduplicates A, and keeps same-named distinct records', async () => {
  const settings = settingsStub();
  const controller = createLibraryCollectionController({ settings, createId: (() => { let i = 0; return () => `id-${++i}`; })() });
  await controller.initialize();
  const a = await controller.adopt(dir('Same'), { name: 'Same' });
  const b = await controller.adopt(dir('Same', 'b'), { name: 'Same' });
  assert.equal(a.duplicate, false); assert.equal(b.duplicate, false);
  assert.equal(controller.snapshot().libraries.length, 2);
  assert.equal(controller.snapshot().libraries[0].name, 'Same');
  const again = await controller.adopt(dir('Same'), { name: 'Same' });
  assert.equal(again.duplicate, true);
  assert.equal(controller.snapshot().libraries.length, 2);
  assert.equal(controller.snapshot().selectedId, again.library.id);
});

test('identity comparison failure is explicit and does not merge by name', async () => {
  const existing = { id: 'a', handle: dir('Same'), name: 'Same' };
  const settings = settingsStub({ libraries: [existing], selectedId: 'a' });
  const controller = createLibraryCollectionController({ settings, createId: () => 'new' });
  await controller.initialize();
  const broken = { kind: 'directory', name: 'Same', async isSameEntry() { throw new Error('compare failed'); } };
  const result = await controller.adopt(broken, { name: 'Same' });
  assert.equal(result.ok, false); assert.equal(result.reason, 'identity-unverified');
  assert.equal(controller.snapshot().libraries.length, 1);
});

test('storage write failure keeps the adopted collection and selection in session', async () => {
  const settings = settingsStub({ failSave: true });
  const controller = createLibraryCollectionController({ settings, createId: () => 'a' });
  await controller.initialize();
  const result = await controller.adopt(dir('A'), { name: 'A' });
  assert.equal(result.ok, true); assert.equal(result.persisted, false);
  assert.equal(controller.snapshot().libraries.length, 1);
  assert.equal(controller.snapshot().selectedId, 'a');
});

test('read failure is truthful and disposal prevents later adoption', async () => {
  const settings = settingsStub({ failLoad: true });
  const controller = createLibraryCollectionController({ settings });
  const failed = await controller.initialize();
  assert.equal(failed.ok, false); assert.equal(failed.reason, 'storage-read-failed');
  controller.dispose();
  const result = await controller.adopt(dir('A'), { name: 'A' });
  assert.equal(result.ok, false); assert.equal(result.reason, 'disposed');
  assert.equal(controller.snapshot().libraries.length, 0);
});

test('relink replaces the same ID only after persistence and preserves other records', async () => {
  const a = { id: 'a', handle: dir('A'), name: 'A' }; const other = { id: 'b', handle: dir('B'), name: 'B' };
  const settings = settingsStub({ libraries: [a, other], selectedId: 'a' });
  const controller = createLibraryCollectionController({ settings });
  await controller.initialize();
  const replacement = dir('A2');
  const result = await controller.relink('a', replacement, 'A2');
  assert.equal(result.ok, true); assert.equal(result.persisted, true);
  assert.equal(controller.snapshot().selectedId, 'a');
  const records = controller.snapshot().libraries;
  assert.equal(records.length, 2); assert.equal(records[0].id, 'a'); assert.equal(records[0].name, 'A2'); assert.equal(records[1].id, 'b');
  assert.deepEqual(settings.state.libraries.map((r) => r.id), ['a', 'b']);
});

test('relink no-op, duplicate-linked, failure and identity cases preserve committed state', async () => {
  const a = { id: 'a', handle: dir('A'), name: 'A' }; const b = { id: 'b', handle: dir('B'), name: 'B' };
  const base = settingsStub({ libraries: [a, b], selectedId: 'a' });
  const controller = createLibraryCollectionController({ settings: base });
  await controller.initialize();
  const noChange = await controller.relink('a', dir('A'), 'A');
  assert.equal(noChange.ok, true); assert.equal(noChange.noChange, true); assert.equal(base.state.saves, 0);
  const duplicate = await controller.relink('a', dir('B'), 'B');
  assert.equal(duplicate.ok, false); assert.equal(duplicate.reason, 'already-linked'); assert.equal(duplicate.existingId, 'b');
  assert.deepEqual(controller.snapshot().libraries.map((r) => r.id), ['a', 'b']);
  const failing = settingsStub({ libraries: [a, b], selectedId: 'a', failSave: true });
  const failed = createLibraryCollectionController({ settings: failing });
  await failed.initialize();
  const write = await failed.relink('a', dir('New'), 'New');
  assert.equal(write.ok, false); assert.equal(write.reason, 'storage-write-failed');
  assert.equal(failed.snapshot().libraries[0].name, 'A');
  const broken = createLibraryCollectionController({ settings: base });
  await broken.initialize();
  const unknown = await broken.relink('a', { kind: 'directory', name: 'X', async isSameEntry() { throw new Error('no'); } }, 'X');
  assert.equal(unknown.ok, false); assert.equal(unknown.reason, 'identity-unverified');
  assert.equal(broken.snapshot().libraries[0].name, 'A');
});

test('non-persisted selection invalidates a delayed adoption continuation', async () => {
  const a = { id: 'a', handle: dir('A'), name: 'A' };
  const settings = settingsStub({ libraries: [a], selectedId: 'a' });
  const controller = createLibraryCollectionController({ settings, createId: () => 'new' });
  await controller.initialize();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const delayed = { kind: 'directory', name: 'B', async isSameEntry() { await gate; return false; } };
  const adoption = controller.adopt(delayed, { name: 'B' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const selected = controller.select('a', { persist: false });
  assert.equal(selected.ok, true);
  release();
  const adopted = await adoption;
  assert.equal(adopted.reason, 'stale');
  assert.equal(controller.snapshot().selectedId, 'a');
  assert.deepEqual(controller.snapshot().libraries.map((r) => r.id), ['a']);
});

test('select rejects unknown IDs and persists valid selection', async () => {
  const a = { id: 'a', handle: dir('A'), name: 'A' }; const b = { id: 'b', handle: dir('B'), name: 'B' };
  const settings = settingsStub({ libraries: [a, b], selectedId: 'a' });
  const controller = createLibraryCollectionController({ settings });
  await controller.initialize();
  assert.equal((await controller.select('missing')).reason, 'unknown-library');
  const selected = await controller.select('b');
  assert.equal(selected.ok, true);
  assert.equal(settings.state.selectedId, 'b');
});


test('unlink non-selected Library preserves selected ID and persists exact next collection', async () => {
  const a = { id: 'a', handle: dir('A'), name: 'A' }; const b = { id: 'b', handle: dir('B'), name: 'B' };
  const settings = settingsStub({ libraries: [a, b], selectedId: 'a' });
  const controller = createLibraryCollectionController({ settings });
  await controller.initialize();
  const result = await controller.unlink('b', { expectedHandle: a.handle === b.handle ? a.handle : dir('B') });
  assert.equal(result.ok, true); assert.equal(result.selectedId, 'a'); assert.equal(result.removed.id, 'b');
  assert.deepEqual(controller.snapshot().libraries.map((r) => r.id), ['a']);
  assert.equal(controller.snapshot().selectedId, 'a');
  assert.deepEqual(settings.state.writes.at(-1), { ids: ['a'], selectedId: 'a' });
});

test('unlink selected Library sets selectedId null without choosing another', async () => {
  const a = { id: 'a', handle: dir('A'), name: 'A' }; const b = { id: 'b', handle: dir('B'), name: 'B' };
  const settings = settingsStub({ libraries: [a, b], selectedId: 'b' });
  const controller = createLibraryCollectionController({ settings });
  await controller.initialize();
  const result = await controller.unlink('b', { expectedHandle: dir('B') });
  assert.equal(result.ok, true); assert.equal(result.selectedId, null);
  assert.equal(controller.snapshot().selectedId, null);
  assert.deepEqual(controller.snapshot().libraries.map((r) => r.id), ['a']);
  assert.deepEqual(settings.state.writes.at(-1), { ids: ['a'], selectedId: null });
  assert.equal(controller.getStatus('b').phase, 'idle');
});

test('unlink final Library persists an authoritative empty collection', async () => {
  const a = { id: 'a', handle: dir('A'), name: 'A' };
  const settings = settingsStub({ libraries: [a], selectedId: 'a' });
  const controller = createLibraryCollectionController({ settings });
  await controller.initialize();
  const result = await controller.unlink('a', { expectedHandle: dir('A') });
  assert.equal(result.ok, true);
  assert.deepEqual(settings.state.libraries, []);
  assert.equal(settings.state.selectedId, null);
  assert.deepEqual(settings.state.writes.at(-1), { ids: [], selectedId: null });
  assert.deepEqual(controller.snapshot().libraries, []);
  assert.equal(controller.snapshot().selectedId, null);
});

test('unlink storage failure preserves collection/selection and can be retried', async () => {
  const a = { id: 'a', handle: dir('A'), name: 'A' }; const b = { id: 'b', handle: dir('B'), name: 'B' };
  const settings = settingsStub({ libraries: [a, b], selectedId: 'b', failSave: true });
  const controller = createLibraryCollectionController({ settings });
  await controller.initialize();
  const before = controller.snapshot();
  const failed = await controller.unlink('b', { expectedHandle: dir('B') });
  assert.equal(failed.ok, false); assert.equal(failed.reason, 'storage-write-failed');
  assert.deepEqual(controller.snapshot().libraries.map((r) => r.id), before.libraries.map((r) => r.id));
  assert.equal(controller.snapshot().selectedId, 'b');
  settings.state.failSave = false;
  const retried = await controller.unlink('b', { expectedHandle: dir('B') });
  assert.equal(retried.ok, true);
  assert.deepEqual(controller.snapshot().libraries.map((r) => r.id), ['a']);
  assert.equal(controller.snapshot().selectedId, null);
});

test('unlink rejects unknown, changed, unverifiable and repeated targets without mutation', async () => {
  const a = { id: 'a', handle: dir('A'), name: 'A' }; const b = { id: 'b', handle: dir('B'), name: 'B' };
  const settings = settingsStub({ libraries: [a, b], selectedId: 'a' });
  const controller = createLibraryCollectionController({ settings });
  await controller.initialize();
  assert.equal((await controller.unlink('missing', { expectedHandle: dir('X') })).reason, 'unknown-library');
  assert.equal((await controller.unlink('b', { expectedHandle: dir('B', 'other') })).reason, 'target-changed');
  assert.equal((await controller.unlink('b', { expectedHandle: dir('B'), expectedName: 'Renamed B' })).reason, 'target-changed');
  assert.equal((await controller.unlink('b')).reason, 'identity-required');
  const broken = { kind: 'directory', name: 'B', async isSameEntry() { throw new Error('compare failed'); } };
  assert.equal((await controller.unlink('b', { expectedHandle: broken })).reason, 'identity-unverified');
  assert.deepEqual(controller.snapshot().libraries.map((r) => r.id), ['a', 'b']);
  assert.equal((await controller.unlink('b', { expectedHandle: dir('B') })).ok, true);
  assert.equal((await controller.unlink('b', { expectedHandle: dir('B') })).reason, 'unknown-library');
  assert.deepEqual(settings.state.libraries.map((r) => r.id), ['a']);
});

test('unlink uses only collection persistence and never a file/directory mutation API', async () => {
  const calls = [];
  const handle = { kind: 'directory', name: 'A', async isSameEntry() { calls.push('isSameEntry'); return true; } };
  const settings = settingsStub({ libraries: [{ id: 'a', handle, name: 'A' }], selectedId: 'a' });
  settings.saveCollection = async (libraries, selectedId) => { calls.push('saveCollection'); return { ok: true, libraries, selectedId }; };
  const controller = createLibraryCollectionController({ settings });
  await controller.initialize();
  const result = await controller.unlink('a', { expectedHandle: handle });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['saveCollection']);
  assert.equal(calls.some((call) => /remove|delete|rename|write|createWritable/.test(call)), false);
});


test('delayed unlink identity check becomes stale after a newer collection operation', async () => {
  const a = { id: 'a', handle: dir('A'), name: 'A' };
  const settings = settingsStub({ libraries: [a], selectedId: 'a' });
  const controller = createLibraryCollectionController({ settings });
  await controller.initialize();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const delayed = { kind: 'directory', name: 'A', async isSameEntry() { await gate; return true; } };
  const pending = controller.unlink('a', { expectedHandle: delayed, expectedName: 'A' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal((await controller.select('a', { persist: false })).ok, true);
  release();
  const result = await pending;
  assert.equal(result.reason, 'stale');
  assert.deepEqual(controller.snapshot().libraries.map((r) => r.id), ['a']);
  assert.equal(settings.state.libraries.length, 1);
});
