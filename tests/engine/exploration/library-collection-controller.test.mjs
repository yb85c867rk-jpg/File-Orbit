import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibraryCollectionController } from '../../harness/m5-exploration/library-collection-controller.js';

const dir = (name, token = name) => ({ kind: 'directory', name, token, async isSameEntry(other) { return other?.token === token; } });
function settingsStub({ libraries = [], selectedId = null, failSave = false, failLoad = false } = {}) {
  const state = { libraries: libraries.map((r) => ({ ...r })), selectedId, saves: 0, writes: [] };
  return {
    state,
    async migrateLegacyCollection() { return { ok: true, migrated: false, initialized: true, libraries: state.libraries, selectedId: state.selectedId }; },
    async loadCollection() {
      if (failLoad) return { ok: false, reason: 'storage-read-failed', message: 'read failed' };
      return { ok: true, initialized: true, libraries: state.libraries.map((r) => ({ ...r })), selectedId: state.selectedId };
    },
    async saveCollection(libraries, selectedId) {
      if (failSave) return { ok: false, reason: 'storage-write-failed', message: 'write failed' };
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
