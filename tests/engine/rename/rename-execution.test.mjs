import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { encodeBackup, decodeBackup } from '../../../src/engine/hypertree/persistence/backup.js';
import { buildRenamePreflight, prepareRenameCandidate, createRenameExecutor, buildRenameRemovalRetryPlan } from '../../../src/engine/hypertree/rename/index.js';

const cryptoApi = webcrypto;
let idSeq = 0;
const sourceBytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
const attachmentBytes = new Uint8Array([65, 66, 67, 68, 69]);
const attachmentFile = new File([attachmentBytes], 'payload.bin', { type: 'application/octet-stream' });
const registry = {
  get(id) {
    if (id !== 'att_source') return null;
    return { file: attachmentFile, metadata: { originalName: 'payload.bin', sizeBytes: attachmentBytes.length, mime: 'application/octet-stream' }, name: 'payload.bin', classification: null };
  }
};
function tree(title = 'Old Map') {
  return {
    id: 'root', kind: 'folder', name: title, data: {},
    children: [{ id: 'file-1', kind: 'file', name: 'Payload', data: { attachmentId: 'att_source', originalName: 'payload.bin', sizeBytes: attachmentBytes.length, mime: 'application/octet-stream' }, children: [] }]
  };
}
async function sha256(blob) { const bytes = await blob.arrayBuffer(); return Array.from(new Uint8Array(await cryptoApi.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join(''); }

function fileHandle(name, blob, identity = 'file-' + (++idSeq)) {
  const value = {
    kind: 'file', name, id: identity, blob,
    async getFile() { return new File([value.blob], name, { type: 'application/x-orbit' }); },
    async isSameEntry(other) { return Boolean(other && other.id === value.id); }
  };
  return value;
}
function directoryHandle(name, store, identity = 'dir-' + (++idSeq)) {
  const value = {
    kind: 'directory', name, id: identity, store,
    async getFileHandle(childName) {
      const entry = value.store.get(childName);
      if (!entry) throw new DOMException('not found', 'NotFoundError');
      return entry.handle;
    },
    async isSameEntry(other) { return Boolean(other && other.id === value.id); }
  };
  return value;
}
function fakeAdapter({ name = 'Old Map.orbit' } = {}) {
  const store = new Map();
  const parent = directoryHandle('Library', store);
  const sourceBlob = new Blob([sourceBytes], { type: 'application/x-orbit' });
  const source = fileHandle(name, sourceBlob);
  store.set(name, { handle: source, blob: sourceBlob });
  const calls = { list: 0, create: 0, write: 0, remove: 0, permission: 0, move: 0, order: [] };
  const state = { failCreate: false, failWrite: false, failClose: false, failRemove: false, corruptWrite: false, replaceOnWrite: false, changeSourceAfterWrite: false, replaceNewAfterWrite: false, removeNewAfterRemove: false, replaceNewAfterRemove: false, reuseSourceAfterRemove: false, removeThrowsAfterDelete: false, sourceReadErrorAfterRemove: false, readErrorAfterRemove: false, deferOwnershipAtCreate: false, deferOwnershipAtWrite: false, deferOwnershipAtRemove: false, revision: 12, cancelAt: null, staleAt: null, writeGate: null };
  const adapter = {
    parent, store, source, calls, state,
    async getFileHandle(_directory, entryName) {
      if (state.readErrorAfterRemove && entryName === 'Old Map.orbit') throw new Error('read-failed-after-remove');
      const entry = store.get(entryName);
      if (!entry) throw new DOMException('not found', 'NotFoundError');
      return entry.handle;
    },
    async listEntries() {
      calls.list += 1; calls.order.push('list');
      return { ok: true, entries: [...store].map(([entryName, entry]) => ({ name: entryName, handle: entry.handle, kind: 'file' })), truncated: false };
    },
    async createFile(_directory, entryName, options = {}) {
      calls.create += 1; calls.order.push('create');
      if (state.deferOwnershipAtCreate) { state.revision = 13; try { await options.assertCurrent?.(); } catch { return { ok: false, reason: 'stale' }; } }
      if (state.failCreate) return { ok: false, reason: 'create-failed' };
      if (store.has(entryName)) return { ok: false, reason: 'exists' };
      const handle = fileHandle(entryName, new Blob([]));
      store.set(entryName, { handle, blob: new Blob([]) });
      return { ok: true, handle };
    },
    async writeFile(handle, blob, options = {}) {
      calls.write += 1; calls.order.push('write');
      if (state.deferOwnershipAtWrite) { state.revision = 13; try { await options.assertCurrent?.(); } catch { return { ok: false, reason: 'stale' }; } }
      if (state.writeGate) await state.writeGate;
      if (state.failWrite) return { ok: false, reason: 'write-failed' };
      const bytes = state.corruptWrite ? new Uint8Array(await blob.arrayBuffer()).reverse() : blob;
      const entry = store.get(handle.name);
      if (!entry) return { ok: false, reason: 'missing-handle' };
      entry.blob = new Blob([bytes], { type: 'application/x-orbit' });
      entry.handle.blob = entry.blob;
      if (state.replaceOnWrite) { const replacement = fileHandle(handle.name, entry.blob, 'replace-' + (++idSeq)); store.set(handle.name, { handle: replacement, blob: entry.blob }); }
      if (state.changeSourceAfterWrite) { const old = store.get('Old Map.orbit'); if (old) { old.blob = new Blob(['changed-after-write']); old.handle.blob = old.blob; } }
      if (state.replaceNewAfterWrite) { const replacement = fileHandle('New Map.orbit', new Blob(['replaced-after-write']), 'replace-' + (++idSeq)); store.set('New Map.orbit', { handle: replacement, blob: new Blob(['replaced-after-write']) }); }
      return { ok: true, close: !state.failClose };
    },
    async removeFile(_directory, entryName, options = {}) {
      calls.remove += 1; calls.order.push('remove');
      if (state.deferOwnershipAtRemove) { state.revision = 13; try { await options.assertCurrent?.(); } catch { return { ok: false, reason: 'stale' }; } }
      if (state.changeSourceBeforeRemove) {
        const entry = store.get('Old Map.orbit'); if (entry) { entry.blob = new Blob(['changed']); entry.handle.blob = entry.blob; }
      }
      if (state.replaceNewBeforeRemove) {
        const entry = store.get('New Map.orbit'); if (entry) { const replacement = fileHandle('New Map.orbit', new Blob(['replaced']), 'replace-' + (++idSeq)); store.set('New Map.orbit', { handle: replacement, blob: new Blob(['replaced']) }); }
      }
      if (state.failRemove) return { ok: false, reason: 'remove-failed' };
      const entry = store.get(entryName);
      calls.sourceBlobAtRemove = entry?.blob || null;
      if (!entry || entry.handle !== options.expectedHandle) return { ok: false, reason: 'target-changed' };
      store.delete(entryName);
      calls.physicalRemove = (calls.physicalRemove || 0) + 1;
      if (state.sourceReadErrorAfterRemove) state.readErrorAfterRemove = true;
      if (state.removeThrowsAfterDelete) throw new Error('remove-ack-lost');
      if (state.removeNewAfterRemove) store.delete('New Map.orbit');
      if (state.replaceNewAfterRemove) { const replacement = fileHandle('New Map.orbit', new Blob([await sourceBytes]), 'replace-' + (++idSeq)); store.set('New Map.orbit', { handle: replacement, blob: new Blob([sourceBytes]) }); }
      if (state.reuseSourceAfterRemove) { const replacement = fileHandle('Old Map.orbit', new Blob(['reused']), 'reuse-' + (++idSeq)); store.set('Old Map.orbit', { handle: replacement, blob: new Blob(['reused']) }); }
      return { ok: true };
    }
  };
  return adapter;
}

async function makePlan(adapter, proposedName = 'New Map', currentTitle = 'Old Map') {
  const sourceBlob = adapter.store.get('Old Map.orbit').blob;
  const sourceDigest = await sha256(sourceBlob);
  const source = adapter.source;
  const entries = [...adapter.store].map(([name, entry]) => ({ name, handle: entry.handle, kind: 'file' }));
  const plan = buildRenamePreflight({
    tree: tree(currentTitle),
    activeHandle: source,
    activeDocumentName: 'Old Map.orbit',
    documentIdentity: 'orbit:r3',
    baseline: { handle: source, documentIdentity: 'orbit:r3', digest: sourceDigest, size: sourceBlob.size },
    current: { datasetToken: 'dataset-r3', session: 6, ownership: 4, revision: 12, handle: source, documentIdentity: 'orbit:r3', savedRevision: 12 },
    captured: { datasetToken: 'dataset-r3', session: 6, ownership: 4, revision: 12, handle: source, documentIdentity: 'orbit:r3', savedRevision: 12 },
    parent: {
      ok: true,
      parent: { handle: adapter.parent, name: 'Library', libraryId: 'lib-r3' },
      entry: { ...entries[0], active: true },
      entries: entries.map((entry) => entry.handle === source ? { ...entry, active: true } : entry),
      candidates: []
    },
    proposedName,
    backend: 'opfs'
  });
  return plan;
}
async function makeCandidate(plan) { return prepareRenameCandidate({ plan, tree: tree(plan.current.title), registry, cryptoApi }); }
function outcomeState(handle, revision = 12) { return { datasetToken: 'dataset-r3', session: 6, ownership: 4, revision, handle, documentIdentity: 'orbit:r3' }; }
function executeOptions(adapter, candidate, extra = {}) {
  return {
    plan: extra.plan,
    candidate,
    permissions: { sourceRead: true, parentRead: true, parentWrite: true, sourceRemove: true },
    getState: () => outcomeState(adapter.source, extra.revision ?? adapter.state.revision ?? 12),
    isCancelled: extra.isCancelled || (() => false)
  };
}

test('prepares a validated candidate without mutating the live tree or registry', async () => {
  const adapter = fakeAdapter();
  const plan = await makePlan(adapter);
  const live = tree('Old Map');
  const beforeTree = JSON.stringify(live);
  const candidate = await prepareRenameCandidate({ plan, tree: live, registry, cryptoApi });
  assert.equal(candidate.ok, true);
  assert.equal(candidate.title, 'New Map');
  assert.equal(candidate.filename, 'New Map.orbit');
  assert.equal(candidate.manifest.mapName, 'New Map.orbit');
  assert.equal(candidate.manifest.sourceMapId, null);
  assert.equal(candidate.validated.rootTitle, 'New Map');
  assert.equal(candidate.validated.mapName, 'New Map.orbit');
  assert.equal(JSON.stringify(live), beforeTree);
  const decoded = await decodeBackup(candidate.blob, { cryptoApi });
  assert.equal(decoded.tree.name, 'New Map');
  assert.equal(decoded.attachments.length, 1);
  assert.deepEqual(new Uint8Array(await decoded.attachments[0].blob.arrayBuffer()), attachmentBytes);
});

test('successful distinct-name rename writes one new file, verifies it and removes one original', async () => {
  const adapter = fakeAdapter();
  const plan = await makePlan(adapter);
  assert.equal(plan.kind, 'both');
  const candidate = await makeCandidate(plan);
  const executor = createRenameExecutor({ adapter, cryptoApi });
  const outcome = await executor.execute(executeOptions(adapter, candidate, { plan }));
  assert.equal(outcome.ok, true);
  assert.equal(outcome.status, 'filesystem-complete-adoption-required');
  assert.equal(outcome.filesystemComplete, true);
  assert.equal(outcome.adoptionRequired, true);
  assert.deepEqual(outcome.mutations, { createCalls: 1, writeCalls: 1, removeCalls: 1 });
  assert.equal(adapter.store.has('Old Map.orbit'), false);
  assert.equal(adapter.store.has('New Map.orbit'), true);
  assert.equal(outcome.files.destination.present, true);
  assert.equal(outcome.files.destination.verified, true);
  assert.deepEqual(adapter.calls.order, ['list', 'create', 'write', 'remove']);
  assert.deepEqual(new Uint8Array(await adapter.calls.sourceBlobAtRemove.arrayBuffer()), sourceBytes);
  const decoded = await decodeBackup(adapter.store.get('New Map.orbit').blob, { cryptoApi });
  assert.equal(decoded.tree.name, 'New Map');
  assert.deepEqual(new Uint8Array(await decoded.attachments[0].blob.arrayBuffer()), attachmentBytes);
});

test('candidate content includes dirty edits while the original remains until removal', async () => {
  const adapter = fakeAdapter();
  const plan = await makePlan(adapter);
  const dirty = tree('Old Map');
  dirty.children.push({ id: 'dirty-folder', kind: 'folder', name: 'Dirty Folder', data: {}, children: [] });
  const candidate = await prepareRenameCandidate({ plan, tree: dirty, registry, cryptoApi });
  assert.equal(candidate.ok, true);
  const outcome = await createRenameExecutor({ adapter, cryptoApi }).execute(executeOptions(adapter, candidate, { plan }));
  assert.equal(outcome.ok, true);
  const decoded = await decodeBackup(adapter.store.get('New Map.orbit').blob, { cryptoApi });
  assert.equal(decoded.tree.children.some((node) => node.id === 'dirty-folder' && node.name === 'Dirty Folder'), true);
  assert.deepEqual(new Uint8Array(await adapter.calls.sourceBlobAtRemove.arrayBuffer()), sourceBytes);
});

test('no-op and title-only/filename-only cases do not write', async () => {
  const noopAdapter = fakeAdapter();
  const noopPlan = await makePlan(noopAdapter, 'Old Map');
  const noopCandidate = await makeCandidate(noopPlan);
  const noop = await createRenameExecutor({ adapter: noopAdapter, cryptoApi }).execute(executeOptions(noopAdapter, noopCandidate, { plan: noopPlan }));
  assert.equal(noop.ok, true);
  assert.equal(noop.status, 'noop');
  assert.deepEqual(noop.mutations, { createCalls: 0, writeCalls: 0, removeCalls: 0 });

  const titleAdapter = fakeAdapter();
  const titlePlan = await makePlan(titleAdapter, 'Old Map', 'Old Name');
  assert.equal(titlePlan.kind, 'title-only');
  const titleCandidate = await makeCandidate(titlePlan);
  const title = await createRenameExecutor({ adapter: titleAdapter, cryptoApi }).execute(executeOptions(titleAdapter, titleCandidate, { plan: titlePlan }));
  assert.equal(title.ok, true);
  assert.equal(title.status, 'requires-in-place-save');
  assert.equal(titleAdapter.calls.create, 0);
  assert.equal(titleAdapter.calls.write, 0);
  assert.equal(titleAdapter.calls.remove, 0);
});

test('case-only and normalization-equivalent changes are rejected without writing', async () => {
  const adapter = fakeAdapter();
  const plan = await makePlan(adapter, 'old map');
  assert.equal(plan.change.caseOnlyFilenameChange, true);
  const candidate = await makeCandidate(plan);
  const outcome = await createRenameExecutor({ adapter, cryptoApi }).execute(executeOptions(adapter, candidate, { plan }));
  assert.equal(outcome.ok, false);
  assert.equal(outcome.status, 'unsupported-case-only');
  assert.deepEqual(outcome.mutations, { createCalls: 0, writeCalls: 0, removeCalls: 0 });
  assert.equal(adapter.store.has('Old Map.orbit'), true);
});

test('normalization-equivalent and other deferred filename plans do not write', async () => {
  const adapter = fakeAdapter();
  const plan = await makePlan(adapter);
  const deferred = { ...plan, change: { ...plan.change, caseOnlyFilenameChange: false, normalizationEquivalentFilenameChange: true } };
  const outcome = await createRenameExecutor({ adapter, cryptoApi }).execute({ plan: deferred, candidate: null, permissions: { sourceRead: true, parentRead: true, parentWrite: true, sourceRemove: true }, getState: () => outcomeState(adapter.source), isCancelled: () => false });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.status, 'unsupported-case-only');
  assert.deepEqual(outcome.mutations, { createCalls: 0, writeCalls: 0, removeCalls: 0 });
});

test('destination collision and decoy are protected before create', async () => {
  const adapter = fakeAdapter();
  const plan = await makePlan(adapter);
  const candidate = await makeCandidate(plan);
  const decoy = new Blob(['decoy']);
  adapter.store.set('New Map.orbit', { handle: fileHandle('New Map.orbit', decoy), blob: decoy });
  const outcome = await createRenameExecutor({ adapter, cryptoApi }).execute(executeOptions(adapter, candidate, { plan }));
  assert.equal(outcome.status, 'blocked');
  assert.equal(outcome.reason, 'destination-exists');
  assert.equal(adapter.calls.create, 0);
  assert.equal(adapter.calls.write, 0);
  assert.equal(adapter.calls.remove, 0);
  assert.equal(adapter.store.get('New Map.orbit').blob.size, 5);
});

test('permission confirmation is required and never requested by the backend', async () => {
  const adapter = fakeAdapter();
  const plan = await makePlan(adapter);
  const candidate = await makeCandidate(plan);
  const outcome = await createRenameExecutor({ adapter, cryptoApi }).execute({ plan, candidate, getState: () => outcomeState(adapter.source) });
  assert.equal(outcome.status, 'permission-required');
  assert.equal(adapter.calls.create, 0);
  assert.equal(adapter.calls.permission, 0);
});

test('write and verification failures preserve the original and do not remove anything', async () => {
  for (const statePatch of [{ failWrite: true }, { failClose: true }, { corruptWrite: true }]) {
    const adapter = fakeAdapter();
    Object.assign(adapter.state, statePatch);
    const plan = await makePlan(adapter);
    const candidate = await makeCandidate(plan);
    const outcome = await createRenameExecutor({ adapter, cryptoApi }).execute(executeOptions(adapter, candidate, { plan }));
    assert.equal(outcome.ok, false);
    assert.equal(outcome.partial, true);
    assert.equal(outcome.files.source.present, true);
    assert.equal(adapter.store.has('Old Map.orbit'), true);
    assert.equal(adapter.calls.remove, 0);
    assert.equal(outcome.recovery.actions.includes('retry-remove-original'), false);
    if (statePatch.failClose) assert.equal(outcome.closeFailed, true);
  }
});

test('source or new-file replacement before removal preserves both and never removes', async () => {
  for (const statePatch of [{ changeSourceAfterWrite: true }, { replaceNewAfterWrite: true }]) {
    const adapter = fakeAdapter();
    Object.assign(adapter.state, statePatch);
    const plan = await makePlan(adapter);
    const candidate = await makeCandidate(plan);
    const outcome = await createRenameExecutor({ adapter, cryptoApi }).execute(executeOptions(adapter, candidate, { plan }));
    assert.equal(outcome.ok, false);
    assert.notEqual(outcome.status, 'filesystem-complete-adoption-required');
    assert.equal(outcome.files.source.present, true);
    assert.equal(adapter.store.has('New Map.orbit'), true);
    assert.equal(adapter.calls.remove, 0);
  }
});

test('original removal failure preserves both and returns a recovery plan', async () => {
  const adapter = fakeAdapter();
  adapter.state.failRemove = true;
  const plan = await makePlan(adapter);
  const candidate = await makeCandidate(plan);
  const outcome = await createRenameExecutor({ adapter, cryptoApi }).execute(executeOptions(adapter, candidate, { plan }));
  assert.equal(outcome.ok, false);
  assert.equal(outcome.status, 'verified-new-original-retained');
  assert.equal(outcome.recovery.required, true);
  assert.equal(outcome.recovery.requiresExplicitConfirmation, true);
  assert.equal(outcome.recovery.automatic, false);
  assert.equal(outcome.recovery.actions.includes('retry-remove-original'), true);
  assert.equal(adapter.store.has('Old Map.orbit'), true);
  assert.equal(adapter.store.has('New Map.orbit'), true);
  assert.equal(adapter.calls.remove, 1);
});

test('explicit removal retry reuses only a verified unchanged outcome and is non-automatic', async () => {
  const adapter = fakeAdapter();
  adapter.state.failRemove = true;
  const plan = await makePlan(adapter);
  const candidate = await makeCandidate(plan);
  const outcome = await createRenameExecutor({ adapter, cryptoApi }).execute(executeOptions(adapter, candidate, { plan }));
  const before = { create: adapter.calls.create, write: adapter.calls.write, remove: adapter.calls.remove };
  const retry = buildRenameRemovalRetryPlan({ outcome });
  assert.equal(retry.ok, true);
  assert.equal(retry.requiresExplicitConfirmation, true);
  assert.equal(retry.automatic, false);
  assert.equal(retry.sourceDigest, outcome.files.source.digest);
  assert.equal(retry.destinationDigest, outcome.files.destination.digest);
  assert.deepEqual({ create: adapter.calls.create, write: adapter.calls.write, remove: adapter.calls.remove }, before);
  const changed = buildRenameRemovalRetryPlan({ outcome: { ...outcome, files: { ...outcome.files, destination: { ...outcome.files.destination, verified: false } } } });
  assert.equal(changed.ok, false);
  assert.equal(changed.reason, 'retry-not-available');
});

test('stale ownership and cancellation block before creation', async () => {
  const staleAdapter = fakeAdapter();
  const stalePlan = await makePlan(staleAdapter);
  const staleCandidate = await makeCandidate(stalePlan);
  const stale = await createRenameExecutor({ adapter: staleAdapter, cryptoApi }).execute(executeOptions(staleAdapter, staleCandidate, { plan: stalePlan, revision: 13 }));
  assert.equal(stale.status, 'stale');
  assert.equal(staleAdapter.calls.create, 0);

  const cancelAdapter = fakeAdapter();
  cancelAdapter.state.cancelAt = 'list';
  const cancelPlan = await makePlan(cancelAdapter);
  const cancelCandidate = await makeCandidate(cancelPlan);
  const cancelled = await createRenameExecutor({ adapter: cancelAdapter, cryptoApi }).execute(executeOptions(cancelAdapter, cancelCandidate, { plan: cancelPlan, isCancelled: () => cancelAdapter.calls.list > 0 }));
  assert.equal(cancelled.ok, false);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelAdapter.calls.create, 0);
});

test('cancellation after removal is reported as completed disk work requiring adoption', async () => {
  const adapter = fakeAdapter();
  const plan = await makePlan(adapter);
  const candidate = await makeCandidate(plan);
  const outcome = await createRenameExecutor({ adapter, cryptoApi }).execute(executeOptions(adapter, candidate, { plan, isCancelled: () => adapter.calls.remove > 0 }));
  assert.equal(outcome.ok, true);
  assert.equal(outcome.filesystemComplete, true);
  assert.equal(outcome.cancelledAfterRemoval, true);
  assert.equal(adapter.store.has('Old Map.orbit'), false);
  assert.equal(adapter.store.has('New Map.orbit'), true);
});

test('double execution is rejected while the first operation is in flight', async () => {
  const adapter = fakeAdapter();
  const plan = await makePlan(adapter);
  const candidate = await makeCandidate(plan);
  let release;
  adapter.state.writeGate = new Promise((resolve) => { release = resolve; });
  const executor = createRenameExecutor({ adapter, cryptoApi });
  const first = executor.execute(executeOptions(adapter, candidate, { plan }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = await executor.execute(executeOptions(adapter, candidate, { plan }));
  assert.equal(second.status, 'busy');
  assert.equal(second.reason, 'in-flight');
  release();
  const settled = await first;
  assert.equal(settled.ok, true);
});

test('ownership revalidation at create/write/remove boundaries prevents physical mutation', async () => {
  for (const [statePatch, expectedStage, expectedCreate, expectedWrite, expectedPhysical] of [
    [{ deferOwnershipAtCreate: true }, 'create', 1, 0, 0],
    [{ deferOwnershipAtWrite: true }, 'write', 1, 1, 0],
    [{ deferOwnershipAtRemove: true }, 'remove', 1, 1, 0]
  ]) {
    const adapter = fakeAdapter();
    Object.assign(adapter.state, statePatch);
    const plan = await makePlan(adapter);
    const candidate = await makeCandidate(plan);
    const outcome = await createRenameExecutor({ adapter, cryptoApi }).execute(executeOptions(adapter, candidate, { plan }));
    assert.equal(outcome.ok, false);
    assert.equal(adapter.calls.physicalRemove || 0, expectedPhysical);
    assert.equal(adapter.store.has('Old Map.orbit'), true);
    assert.equal(adapter.store.has('New Map.orbit'), expectedStage !== 'create');
    assert.equal(adapter.calls.remove, expectedStage === 'remove' ? 1 : 0);
    if (expectedStage === 'create') assert.equal(outcome.stage, 'create');
    if (expectedStage === 'write') assert.equal(outcome.stage, 'write');
    if (expectedStage === 'remove') assert.equal(outcome.stage, 'remove');
  }
});

test('removal that physically completes but loses acknowledgement is uncertain', async () => {
  const adapter = fakeAdapter();
  adapter.state.removeThrowsAfterDelete = true;
  const plan = await makePlan(adapter);
  const candidate = await makeCandidate(plan);
  const outcome = await createRenameExecutor({ adapter, cryptoApi }).execute(executeOptions(adapter, candidate, { plan }));
  assert.equal(outcome.status, 'post-removal-uncertain');
  assert.equal(outcome.removalAcknowledged, false);
  assert.equal(outcome.filesystemComplete, false);
  assert.equal(outcome.adoptionBlocked, true);
  assert.equal(outcome.files.source.status, 'absent');
  assert.equal(adapter.calls.physicalRemove, 1);
  assert.equal(adapter.store.has('New Map.orbit'), true);
});

test('same executor is released after success, cancellation and failure', async () => {
  const successAdapter = fakeAdapter();
  const successPlan = await makePlan(successAdapter);
  const successCandidate = await makeCandidate(successPlan);
  const successExecutor = createRenameExecutor({ adapter: successAdapter, cryptoApi });
  const success = await successExecutor.execute(executeOptions(successAdapter, successCandidate, { plan: successPlan }));
  assert.equal(success.ok, true);
  assert.equal(successExecutor.busy, false);
  const afterSuccess = await successExecutor.execute({});
  assert.notEqual(afterSuccess.status, 'busy');

  const cancelAdapter = fakeAdapter();
  const cancelPlan = await makePlan(cancelAdapter);
  const cancelCandidate = await makeCandidate(cancelPlan);
  const cancelExecutor = createRenameExecutor({ adapter: cancelAdapter, cryptoApi });
  const cancelled = await cancelExecutor.execute(executeOptions(cancelAdapter, cancelCandidate, { plan: cancelPlan, isCancelled: () => true }));
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelExecutor.busy, false);
  const afterCancel = await cancelExecutor.execute({});
  assert.notEqual(afterCancel.status, 'busy');

  const failureAdapter = fakeAdapter();
  failureAdapter.state.failRemove = true;
  const failurePlan = await makePlan(failureAdapter);
  const failureCandidate = await makeCandidate(failurePlan);
  const failureExecutor = createRenameExecutor({ adapter: failureAdapter, cryptoApi });
  const failure = await failureExecutor.execute(executeOptions(failureAdapter, failureCandidate, { plan: failurePlan }));
  assert.equal(failure.status, 'verified-new-original-retained');
  assert.equal(failureExecutor.busy, false);
  const afterFailure = await failureExecutor.execute({});
  assert.notEqual(afterFailure.status, 'busy');
});

test('an unexpected thrown error releases the in-flight guard', async () => {
  const adapter = fakeAdapter();
  const plan = await makePlan(adapter);
  const broken = { ok: true, schema: 'fileorbit-rename-candidate-v1', filename: plan.filename, blob: new Blob(['x']), packageSize: 1 };
  Object.defineProperty(broken, 'title', { get() { throw new Error('injected candidate getter'); } });
  const executor = createRenameExecutor({ adapter, cryptoApi });
  await assert.rejects(() => executor.execute(executeOptions(adapter, broken, { plan })), /injected candidate getter/);
  assert.equal(executor.busy, false);
  const later = await executor.execute({});
  assert.notEqual(later.status, 'busy');
});

test('post-removal uncertainty is separate from verified filesystem completion', async () => {
  const scenarios = [
    { patch: { removeNewAfterRemove: true }, expectedSource: 'absent', expectedDestination: 'absent' },
    { patch: { replaceNewAfterRemove: true }, expectedSource: 'absent', expectedDestination: 'present' },
    { patch: { reuseSourceAfterRemove: true }, expectedSource: 'present', expectedDestination: 'present' },
    { patch: { sourceReadErrorAfterRemove: true }, expectedSource: 'read-error', expectedDestination: 'present' }
  ];
  for (const scenario of scenarios) {
    const adapter = fakeAdapter();
    Object.assign(adapter.state, scenario.patch);
    const plan = await makePlan(adapter);
    const candidate = await makeCandidate(plan);
    const outcome = await createRenameExecutor({ adapter, cryptoApi }).execute(executeOptions(adapter, candidate, { plan }));
    assert.equal(outcome.ok, false);
    assert.equal(outcome.status, 'post-removal-uncertain');
    assert.equal(outcome.removalAcknowledged, true);
    assert.equal(outcome.filesystemComplete, false);
    assert.equal(outcome.adoptionBlocked, true);
    assert.equal(outcome.requiresReinspection, true);
    assert.equal(outcome.recovery.automatic, false);
    assert.equal(outcome.recovery.actions.includes('retry-remove-original'), false);
    assert.equal(outcome.files.source.status, scenario.expectedSource);
    assert.equal(outcome.files.destination.status, scenario.expectedDestination);
    assert.equal(adapter.calls.physicalRemove, 1);
    assert.equal(buildRenameRemovalRetryPlan({ outcome }).ok, false);
  }
});
