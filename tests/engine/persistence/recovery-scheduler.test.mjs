import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { FakeIndexedDB } from './fake-indexeddb.mjs';
import { createPersistenceRepository, createRecoveryScheduler, buildRecoverySnapshot } from '../../../src/engine/hypertree/persistence/index.js';
import { createAttachmentRegistry, sweepAttachmentOwnership } from '../../../src/engine/hypertree/editor/attachments.js';

const classification = { format: 'text', badge: 'TXT', needsReview: false };
let sequence = 0;
function setup() {
  const factory = new FakeIndexedDB();
  const repo = createPersistenceRepository({ indexedDB: factory, dbName: `scheduler-db-${++sequence}`, mapIdFactory: () => `map_${String(++sequence).padStart(12, '0')}`, storageManager: null });
  let registry = null;
  let tree = null;
  const make = (name = 'Scheduled') => {
    registry = createAttachmentRegistry({ datasetToken: 1 });
    const staged = registry.stage(new File(['hello'], 'note.txt', { type: 'text/plain' }), classification); registry.commit(staged.id);
    tree = { id: 'root', kind: 'folder', name, children: [{ id: 'file', kind: 'file', name: 'note.txt', data: { dataType: 'file', description: null, link: null, attachmentId: staged.id, originalName: 'note.txt', sizeBytes: 5, mime: 'text/plain', classification } }] };
  };
  make();
  const state = { session: 1, dataset: 1, revision: 0, dirty: true };
  const scheduler = createRecoveryScheduler({ repository: repo, debounceMs: 5, getSource: () => ({ tree, registry, revision: state.revision, dirty: state.dirty, session: state.session, dataset: state.dataset }) });
  return { repo, scheduler, state, get tree() { return tree; }, rename(name) { tree = { ...tree, name }; }, getRegistry: () => registry };
}

test('scheduler creates baselines, coalesces to latest state and serializes writes', async () => {
  const { repo, scheduler, state } = setup();
  const owner = await scheduler.beginWorkspace({ session: 1, dataset: 1 });
  assert.ok(owner);
  assert.equal(await scheduler.checkpointNow(), true);
  let first = await repo.loadRecoveryCheckpoint(owner.workspaceId);
  assert.equal(first.checkpoint.tree.name, 'Scheduled');

  let release; const gate = new Promise((resolve) => { release = resolve; }); let started; const startedPromise = new Promise((resolve) => { started = resolve; });
  scheduler.deferNextPreparation(() => { started(); return gate; });
  state.revision = 1; scheduler.schedule({ immediate: true });
  await startedPromise;
  state.revision = 2;
  scheduler.schedule({ immediate: true });
  release();
  await scheduler.flush();
  first = await repo.loadRecoveryCheckpoint(owner.workspaceId);
  assert.equal(first.checkpoint.capturedRevision, 2);
  assert.equal(scheduler.diagnostics.maxConcurrentWrites, 1);
  assert.equal(scheduler.diagnostics.writesStarted, 3);
  repo.close();
});

test('confirmed Save retires covered checkpoint and preserves later checkpoint', async () => {
  const { repo, scheduler, state } = setup();
  const owner = await scheduler.beginWorkspace({ session: 1, dataset: 1 });
  await scheduler.checkpointNow();
  const reservation = await scheduler.beginDocumentSave({ session: 1, dataset: 1, operation: 1, revision: 0 });
  assert.ok(reservation);
  assert.equal(await scheduler.retireDocumentSave(reservation), true);
  assert.equal(await repo.loadRecoveryCheckpoint(owner.workspaceId).then((value) => value.checkpoint), null);

  await scheduler.checkpointNow();
  const second = await scheduler.beginDocumentSave({ session: 1, dataset: 1, operation: 2, revision: 1 });
  state.revision = 2; state.dirty = true;
  scheduler.schedule({ immediate: true });
  await scheduler.flush();
  assert.equal(await scheduler.retireDocumentSave(second), true);
  const later = await repo.loadRecoveryCheckpoint(owner.workspaceId);
  assert.ok(later.checkpoint);
  assert.equal(later.checkpoint.capturedRevision, 2);
  repo.close();
});

test('pre-Save delayed writer is fenced and failed Save preserves recovery', async () => {
  const { repo, scheduler } = setup();
  const owner = await scheduler.beginWorkspace({ session: 1, dataset: 1 });
  await scheduler.checkpointNow();
  let release; const gate = new Promise((resolve) => { release = resolve; }); let started; const startedPromise = new Promise((resolve) => { started = resolve; });
  scheduler.deferNextPreparation(() => { started(); return gate; });
  scheduler.schedule({ immediate: true });
  await startedPromise;
  const reservation = await scheduler.beginDocumentSave({ session: 1, dataset: 1, operation: 1, revision: 1 });
  release();
  await scheduler.flush();
  assert.equal(await scheduler.retireDocumentSave(reservation), true);
  assert.equal(await repo.loadRecoveryCheckpoint(owner.workspaceId).then((value) => value.checkpoint), null);

  await scheduler.checkpointNow();
  const failing = await scheduler.beginDocumentSave({ session: 1, dataset: 1, operation: 2, revision: 2 });
  await scheduler.abandonDocumentSave(failing);
  assert.ok((await repo.loadRecoveryCheckpoint(owner.workspaceId)).checkpoint);
  repo.close();
});

test('later edit after Save reserves a fresh control version and obtains a checkpoint', async () => {
  const { repo, scheduler, state } = setup();
  const owner = await scheduler.beginWorkspace({ session: 1, dataset: 1 });
  await scheduler.checkpointNow();
  const save = await scheduler.beginDocumentSave({ session: 1, dataset: 1, operation: 1 });
  await scheduler.retireDocumentSave(save);
  state.revision = 5; state.dirty = true;
  scheduler.schedule({ immediate: true });
  await scheduler.flush();
  const checkpoint = await repo.loadRecoveryCheckpoint(owner.workspaceId);
  assert.ok(checkpoint.checkpoint);
  assert.equal(checkpoint.checkpoint.capturedRevision, 5);
  assert.ok(checkpoint.checkpoint.checkpointGeneration > save.saveSequence);
  repo.close();
});
test('later edit pending in debounce survives Save retirement with exact revision and bytes', async () => {
  const { repo, scheduler, state, rename } = setup();
  const owner = await scheduler.beginWorkspace({ session: 1, dataset: 1 });
  await scheduler.checkpointNow();
  const save = await scheduler.beginDocumentSave({ session: 1, dataset: 1, operation: 1, revision: 0 });
  state.revision = 1; rename('After Save'); scheduler.schedule();
  assert.equal(await scheduler.retireDocumentSave(save), true);
  await scheduler.flush();
  const cp = await repo.loadRecoveryCheckpoint(owner.workspaceId);
  assert.ok(cp.checkpoint);
  assert.equal(cp.checkpoint.capturedRevision, 1);
  assert.equal(cp.checkpoint.tree.name, 'After Save');
  assert.equal(cp.attachments[0].sha256, cp.checkpoint.attachmentRefs[0].sha256);
  assert.ok(cp.checkpoint.checkpointGeneration > save.saveSequence);
  repo.close();
});

test('later edit preparing during retirement is freshly recaptured after stale conflict', async () => {
  const { repo, scheduler, state, rename } = setup();
  const owner = await scheduler.beginWorkspace({ session: 1, dataset: 1 });
  await scheduler.checkpointNow();
  const save = await scheduler.beginDocumentSave({ session: 1, dataset: 1, operation: 1, revision: 0 });
  state.revision = 1; rename('Preparing Later');
  let release; const gate = new Promise((resolve) => { release = resolve; }); let started; const startedPromise = new Promise((resolve) => { started = resolve; });
  scheduler.deferNextPreparation(() => { started(); return gate; });
  scheduler.schedule({ immediate: true });
  await startedPromise;
  assert.equal(await scheduler.retireDocumentSave(save), true);
  release();
  await scheduler.flush();
  const cp = await repo.loadRecoveryCheckpoint(owner.workspaceId);
  assert.ok(cp.checkpoint);
  assert.equal(cp.checkpoint.capturedRevision, 1);
  assert.equal(cp.checkpoint.tree.name, 'Preparing Later');
  assert.ok(cp.checkpoint.checkpointGeneration > save.saveSequence);
  repo.close();
});

test('later already-committed checkpoint survives retirement and pre-Save delayed work stays fenced', async () => {
  const { repo, scheduler, state, rename } = setup();
  const owner = await scheduler.beginWorkspace({ session: 1, dataset: 1 });
  await scheduler.checkpointNow();
  const save = await scheduler.beginDocumentSave({ session: 1, dataset: 1, operation: 1, revision: 0 });
  state.revision = 1; rename('Committed Later'); scheduler.schedule({ immediate: true }); await scheduler.flush();
  const committed = await repo.loadRecoveryCheckpoint(owner.workspaceId);
  assert.equal(committed.checkpoint.capturedRevision, 1);
  assert.equal(await scheduler.retireDocumentSave(save), true);
  await scheduler.flush();
  const cp = await repo.loadRecoveryCheckpoint(owner.workspaceId);
  assert.ok(cp.checkpoint);
  assert.equal(cp.checkpoint.capturedRevision, 1);

  state.revision = 0; rename('Second Baseline');
  const second = await scheduler.beginWorkspace({ session: 1, dataset: 1 });
  await scheduler.checkpointNow();
  let release; const gate = new Promise((resolve) => { release = resolve; }); let started; const startedPromise = new Promise((resolve) => { started = resolve; });
  scheduler.deferNextPreparation(() => { started(); return gate; });
  scheduler.schedule({ immediate: true });
  await startedPromise;
  const save2 = await scheduler.beginDocumentSave({ session: 1, dataset: 1, operation: 2, revision: 0 });
  assert.equal(await scheduler.retireDocumentSave(save2), true);
  release();
  await scheduler.flush();
  repo.close();
});

test('abandoned Save with queued newer work still recovers the newer revision', async () => {
  const { repo, scheduler, state, rename } = setup();
  const owner = await scheduler.beginWorkspace({ session: 1, dataset: 1 });
  await scheduler.checkpointNow();
  const save = await scheduler.beginDocumentSave({ session: 1, dataset: 1, operation: 1, revision: 0 });
  state.revision = 1; rename('Abandoned Later'); scheduler.schedule();
  assert.equal(await scheduler.abandonDocumentSave(save), true);
  await scheduler.flush();
  const cp = await repo.loadRecoveryCheckpoint(owner.workspaceId);
  assert.ok(cp.checkpoint);
  assert.equal(cp.checkpoint.capturedRevision, 1);
  assert.equal(cp.checkpoint.tree.name, 'Abandoned Later');
  assert.equal(cp.attachments[0].metadata.sizeBytes, 5);
  repo.close();
});
test('delayed retirement cannot mutate a replacement workspace or publish diagnostics into it', async () => {
  const { repo, scheduler, state } = setup();
  const a = await scheduler.beginWorkspace({ session: 1, dataset: 1 });
  await scheduler.checkpointNow();
  const save = await scheduler.beginDocumentSave({ session: 1, dataset: 1, operation: 1, revision: 0 });
  let release; const gate = new Promise((resolve) => { release = resolve; });
  const originalRetire = repo.retireRecoveryThrough.bind(repo);
  repo.retireRecoveryThrough = async (...args) => { await gate; return originalRetire(...args); };
  const retiring = scheduler.retireDocumentSave(save);
  state.session = 2; state.dataset = 2;
  const b = await scheduler.beginWorkspace({ session: 2, dataset: 2 });
  const bVersion = b.controlVersion;
  release();
  assert.equal(await retiring, false);
  assert.equal(scheduler.workspace, b);
  assert.equal(b.controlVersion, bVersion);
  assert.equal(scheduler.diagnostics.workspaceId, b.workspaceId);
  assert.equal(scheduler.diagnostics.lastError, null);
  assert.equal(scheduler.diagnostics.lastRetirement, null);
  const aControl = await repo.loadRecoveryWorkspace(a.workspaceId);
  assert.equal(aControl.state, 'active');
  repo.close();
});

test('delayed retirement failure is not reported into a newer workspace', async () => {
  const { repo, scheduler, state } = setup();
  const a = await scheduler.beginWorkspace({ session: 1, dataset: 1 });
  await scheduler.checkpointNow();
  const save = await scheduler.beginDocumentSave({ session: 1, dataset: 1, operation: 1, revision: 0 });
  let release; const gate = new Promise((resolve) => { release = resolve; });
  repo.retireRecoveryThrough = async () => { await gate; throw Object.assign(new Error('injected retire failure'), { code: 'recovery-retire-failed' }); };
  const retiring = scheduler.retireDocumentSave(save);
  state.session = 2; state.dataset = 2;
  const b = await scheduler.beginWorkspace({ session: 2, dataset: 2 });
  const bVersion = b.controlVersion;
  release();
  assert.equal(await retiring, false);
  assert.equal(scheduler.workspace, b);
  assert.equal(b.controlVersion, bVersion);
  assert.equal(scheduler.diagnostics.workspaceId, b.workspaceId);
  assert.equal(scheduler.diagnostics.lastError, null);
  assert.equal(scheduler.diagnostics.lastRetirement, null);
  assert.ok(a.workspaceId);
  repo.close();
});

test('delayed reservation and abandonment cannot clear a newer workspace pending Save state', async () => {
  const { repo, scheduler, state } = setup();
  const a = await scheduler.beginWorkspace({ session: 1, dataset: 1 });
  await scheduler.checkpointNow();
  let release; const gate = new Promise((resolve) => { release = resolve; });
  const originalBegin = repo.beginRecoverySave.bind(repo);
  repo.beginRecoverySave = async (...args) => { await gate; return originalBegin(...args); };
  const pendingReservation = scheduler.beginDocumentSave({ session: 1, dataset: 1, operation: 1, revision: 0 });
  state.session = 2; state.dataset = 2;
  const b = await scheduler.beginWorkspace({ session: 2, dataset: 2 });
  const bVersion = b.controlVersion;
  release();
  assert.equal(await pendingReservation, null);
  assert.equal(scheduler.workspace, b);
  assert.equal(b.controlVersion, bVersion);
  assert.equal(scheduler.diagnostics.lastError, null);
  repo.close();
});

test('delayed workspace creation is cancelled by invalidation and destroy', async () => {
  const { repo, scheduler } = setup();
  let release; const gate = new Promise((resolve) => { release = resolve; });
  const originalCreate = repo.createRecoveryWorkspace.bind(repo);
  repo.createRecoveryWorkspace = async (...args) => { await gate; return originalCreate(...args); };
  const pending = scheduler.beginWorkspace({ session: 1, dataset: 1 });
  scheduler.invalidate();
  release();
  assert.equal(await pending, null);
  assert.equal(scheduler.workspace, null);
  assert.equal(scheduler.diagnostics.workspaceId, null);
  repo.close();
});
test('real scheduler coalescing preserves a shared attachment until the final request releases its lease', async () => {
  const { scheduler, getRegistry } = setup();
  await scheduler.beginWorkspace({ session: 1, dataset: 1 });
  const registry = getRegistry(); const id = registry.snapshot()[0].attachmentId;
  let releaseFirst; const firstGate = new Promise((resolve) => { releaseFirst = resolve; }); let firstStarted; const firstStartedPromise = new Promise((resolve) => { firstStarted = resolve; });
  scheduler.deferNextPreparation(() => { firstStarted(); return firstGate; });
  scheduler.schedule({ immediate: true });
  await firstStartedPromise;
  scheduler.schedule({ immediate: true });
  let releaseSecond; const secondGate = new Promise((resolve) => { releaseSecond = resolve; }); let secondStarted; const secondStartedPromise = new Promise((resolve) => { secondStarted = resolve; });
  scheduler.deferNextPreparation(() => { secondStarted(); return secondGate; });
  releaseFirst();
  await secondStartedPromise;
  assert.equal(registry.isRetained(id), true);
  const during = sweepAttachmentOwnership(registry, { tree: { id: 'r', kind: 'folder', children: [] }, entries: [] });
  assert.deepEqual(during.released, []);
  assert.equal(registry.has(id), true);
  releaseSecond(); await scheduler.flush();
  assert.equal(registry.isRetained(id), false);
  const after = sweepAttachmentOwnership(registry, { tree: { id: 'r', kind: 'folder', children: [] }, entries: [] });
  assert.deepEqual(after.released, [id]);
  assert.equal(registry.totalBytes, 0);
});
test('preparation failure and invalidation release only scheduler leases', async () => {
  const { scheduler, getRegistry } = setup();
  await scheduler.beginWorkspace({ session: 1, dataset: 1 });
  const registry = getRegistry(); const id = registry.snapshot()[0].attachmentId;
  scheduler.deferNextPreparation(async () => { throw Object.assign(new Error('injected prep failure'), { code: 'injected-prep' }); });
  scheduler.schedule({ immediate: true }); await scheduler.flush();
  assert.equal(registry.isRetained(id), false);
  assert.equal(registry.has(id), true);
  let release; const gate = new Promise((resolve) => { release = resolve; }); let started; const startedPromise = new Promise((resolve) => { started = resolve; });
  scheduler.deferNextPreparation(() => { started(); return gate; });
  scheduler.schedule({ immediate: true }); await startedPromise;
  scheduler.invalidate(); release(); await scheduler.flush();
  assert.equal(registry.isRetained(id), false);
  assert.equal(registry.has(id), true);
  const swept = sweepAttachmentOwnership(registry, { tree: { id: 'r', kind: 'folder', children: [] }, entries: [] });
  assert.deepEqual(swept.released, [id]);
});
test('adoptWorkspace continues checkpointing in the validated forked child', async () => {
  const { repo, scheduler, state, rename, getRegistry, tree } = setup();
  const source = await repo.createRecoveryWorkspace({ origin: 'edit' });
  const sourceSnapshot = await buildRecoverySnapshot({ tree, registry: getRegistry(), datasetToken: 1, capturedRevision: 0, workspaceId: null, allocateAttachmentId: () => 'att_adopt_0001' });
  const sourceSaved = await repo.saveRecoveryCheckpoint({ workspaceId: source.workspace.workspaceId, workspaceToken: source.workspace.workspaceToken, expectedControlVersion: source.workspace.controlVersion, snapshot: sourceSnapshot });
  const claim = await repo.claimRecoverySource({ workspaceId: source.workspace.workspaceId });
  const child = await repo.createRecoveryWorkspace({ forkedFrom: { workspaceId: source.workspace.workspaceId, workspaceToken: source.workspace.workspaceToken, checkpointId: sourceSaved.checkpoint.checkpointId, checkpointGeneration: sourceSaved.generation }, claimId: claim.claimId });
  assert.ok(child.workspace.forkedFrom);
  const adopted = await scheduler.adoptWorkspace({ workspaceId: child.workspace.workspaceId, workspaceToken: child.workspace.workspaceToken, session: 1, dataset: 1 });
  assert.ok(adopted);
  await scheduler.checkpointNow();
  state.revision = 1; rename('Adopted child'); scheduler.schedule({ immediate: true }); await scheduler.flush();
  const cp = await repo.loadRecoveryCheckpoint(child.workspace.workspaceId);
  assert.ok(cp.checkpoint);
  assert.equal(cp.checkpoint.tree.name, 'Adopted child');
  repo.close();
});
test('stale adoption cannot invalidate or mutate the current owner', async () => {
  const { repo, scheduler, state, rename } = setup();
  await scheduler.beginWorkspace({ session: 1, dataset: 1 });
  const stale = await repo.createRecoveryWorkspace({ origin: 'edit', documentName: 'A' });
  state.session = 2; state.dataset = 2;
  const b = await scheduler.beginWorkspace({ session: 2, dataset: 2 });
  let releasePrep; let startedPrep; const prepGate = new Promise((resolve) => { releasePrep = resolve; }); const prepStarted = new Promise((resolve) => { startedPrep = resolve; });
  scheduler.deferNextPreparation(() => { startedPrep(); return prepGate; });
  state.revision = 1; rename('B queued'); scheduler.schedule({ immediate: true }); await prepStarted;
  const beforeDiagnostics = JSON.stringify(scheduler.diagnostics);
  assert.equal(await scheduler.adoptWorkspace({ workspaceId: stale.workspace.workspaceId, workspaceToken: stale.workspace.workspaceToken, session: 1, dataset: 1 }), null);
  assert.equal(scheduler.workspace, b); assert.equal(scheduler.workspace.controlVersion, b.controlVersion);
  assert.equal(JSON.stringify(scheduler.diagnostics), beforeDiagnostics);
  releasePrep(); await scheduler.flush(); const queuedCp = await repo.loadRecoveryCheckpoint(b.workspaceId); assert.equal(queuedCp.checkpoint.tree.name, 'B queued');
  const other = await repo.createRecoveryWorkspace({ origin: 'edit', documentName: 'C' });
  assert.equal(await scheduler.adoptWorkspace({ workspaceId: other.workspace.workspaceId, workspaceToken: 'wst_wrong_adopt_token', session: 2, dataset: 2, authorized: () => false }), null);
  assert.equal(scheduler.workspace, b);
  assert.equal(await scheduler.adoptWorkspace({ workspaceId: other.workspace.workspaceId, workspaceToken: 'wst_wrong_adopt_token', session: 2, dataset: 2 }), null);
  assert.equal(scheduler.workspace, b);
  repo.close();
});

test('deferred stale adoption preserves owner established while durable load is pending', async () => {
  const { repo, scheduler, state } = setup();
  const stale = await repo.createRecoveryWorkspace({ origin: 'edit', documentName: 'A' });
  await scheduler.beginWorkspace({ session: 1, dataset: 1 });
  const original = repo.loadRecoveryWorkspace;
  let release; const gate = new Promise((resolve) => { release = resolve; });
  let started; const startedPromise = new Promise((resolve) => { started = resolve; });
  repo.loadRecoveryWorkspace = async (workspaceId) => { started(); await gate; return original.call(repo, workspaceId); };
  const pending = scheduler.adoptWorkspace({ workspaceId: stale.workspace.workspaceId, workspaceToken: stale.workspace.workspaceToken, session: 1, dataset: 1 });
  await startedPromise;
  state.session = 2; state.dataset = 2;
  const b = await scheduler.beginWorkspace({ session: 2, dataset: 2 });
  release();
  assert.equal(await pending, null);
  assert.equal(scheduler.workspace, b); assert.equal(scheduler.workspace.workspaceId, b.workspaceId); assert.equal(scheduler.workspace.controlVersion, b.controlVersion);
  repo.close();
});
