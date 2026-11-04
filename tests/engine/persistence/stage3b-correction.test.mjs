import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeIndexedDB } from './fake-indexeddb.mjs';
import { File } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createAttachmentRegistry } from '../../../src/engine/hypertree/editor/attachments.js';
import {
  buildSaveSnapshot, createPersistenceRepository, buildRecoverySnapshot, openPersistenceDatabase, STORE_MAPS,
  ownValidatedRecoverySnapshot, snapshotPolicyContext
} from '../../../src/engine/hypertree/persistence/index.js';
import { FREE_POLICY_CONTEXT, createInternalPolicyContext } from '../../../src/engine/hypertree/edition/index.js';
import { PAID_TEST_CONTEXT } from '../../helpers/stage3a-paid-context.mjs';
const FREE = FREE_POLICY_CONTEXT;
const flat = (total) => ({ id: 'root', name: '보존-루트', kind: 'folder', data: {}, children: Array.from({ length: total - 1 }, (_, i) => ({ id: `n${i + 1}`, name: `보존-${i + 1}.txt`, kind: 'file', data: { description: `보존 ${i + 1}` } })) });
let seq = 0; const mapIdFactory = () => `map_${String(++seq).padStart(12, '0')}`;
const repo = (factory, name, policyContext, maxNodes = null) => createPersistenceRepository({ indexedDB: factory, dbName: name, mapIdFactory, policyContext: policyContext === 'lower' ? createInternalPolicyContext({ edition: 'paid', maxNodes: 500 }) : policyContext });
const snap = (tree, policyContext, extra = {}) => buildSaveSnapshot({ tree, registry: new Map(), datasetToken: 1, capturedRevision: 0, policyContext, ...extra });

test('free replacement of existing paid map is rejected atomically; paid replacement is authorized', async () => {
  const factory = new FakeIndexedDB(); const paid = repo(factory, 'oversized-map', PAID_TEST_CONTEXT); const free = repo(factory, 'oversized-map', FREE); const lowerContext = createInternalPolicyContext({ edition: 'paid', maxNodes: 500 }); const lower = repo(factory, 'oversized-map', lowerContext);
  const original = await paid.save(snap(flat(1000), PAID_TEST_CONTEXT));
  const before = await paid.load(original.mapId);
  const beforeUsage = await free.combinedUsage();
  const beforeFields = { ...before.map };
  const smallFree = snap(flat(1), FREE, { mapId: original.mapId, expectedGeneration: original.generation });
  await assert.rejects(() => free.save(smallFree), (error) => error.code === 'node-limit');
  const smallLower = snap(flat(1), lowerContext, { mapId: original.mapId, expectedGeneration: original.generation });
  await assert.rejects(() => lower.save(smallLower), (error) => error.code === 'node-limit');
  const after = await paid.load(original.mapId);
  assert.equal(after.map.nodeCount, 1000);
  assert.equal(after.map.generation, beforeFields.generation);
  assert.equal(after.map.savedAt, beforeFields.savedAt);
  assert.equal(after.map.modifiedAt, beforeFields.modifiedAt);
  assert.equal(after.document.tree.children.length, 999);
  assert.deepEqual(after.document.tree, before.document.tree);
  assert.equal(after.attachments.length, 0);
  assert.deepEqual(await free.combinedUsage(), beforeUsage);
  const smallPaid = snap(flat(1), PAID_TEST_CONTEXT, { mapId: original.mapId, expectedGeneration: original.generation });
  const replaced = await paid.save(smallPaid);
  assert.equal((await paid.load(replaced.mapId)).map.nodeCount, 1, 'sufficient paid context can replace');
});

test('rejected smaller free replacement preserves paid attachments, bytes, and hashes', async () => {
  const factory = new FakeIndexedDB(); const paid = repo(factory, 'attachment-preserve', PAID_TEST_CONTEXT); const free = repo(factory, 'attachment-preserve', FREE);
  const tree = flat(1000); const registry = createAttachmentRegistry({ datasetToken: 1 });
  const bytes = new TextEncoder().encode('보존 첨부');
  const staged = registry.stage(new File([bytes], '보존.txt', { type: 'text/plain' }), { format: 'text', badge: 'TXT', mime: 'text/plain', needsReview: false });
  registry.commit(staged.id);
  tree.children[0].data = { dataType: 'file', attachmentId: staged.id, originalName: '보존.txt', sizeBytes: bytes.length, mime: 'text/plain', classification: { format: 'text', badge: 'TXT', mime: 'text/plain', needsReview: false } };
  const original = await paid.save(buildSaveSnapshot({ tree, registry, datasetToken: 1, capturedRevision: 0, policyContext: PAID_TEST_CONTEXT }));
  const before = await paid.load(original.mapId); const beforeUsage = await free.combinedUsage();
  const beforeHash = createHash('sha256').update(Buffer.from(await before.attachments[0].blob.arrayBuffer())).digest('hex');
  const freeSmall = snap(flat(1), FREE, { mapId: original.mapId, expectedGeneration: original.generation });
  await assert.rejects(() => free.save(freeSmall), (error) => error.code === 'node-limit');
  const after = await paid.load(original.mapId);
  assert.equal(after.attachments.length, 1);
  assert.equal(after.attachments[0].metadata.originalName, '보존.txt');
  assert.equal(createHash('sha256').update(Buffer.from(await after.attachments[0].blob.arrayBuffer())).digest('hex'), beforeHash);
  assert.deepEqual(await free.combinedUsage(), beforeUsage);
});
test('free recovery replacement of existing paid checkpoint is rejected atomically; paid replacement is authorized', async () => {
  const factory = new FakeIndexedDB(); const paid = repo(factory, 'oversized-checkpoint', PAID_TEST_CONTEXT); const free = repo(factory, 'oversized-checkpoint', FREE);
  const ws = await paid.createRecoveryWorkspace({ documentName: 'paid.orbit', origin: 'test' });
  const paidSnapshot = await buildRecoverySnapshot({ tree: flat(1000), registry: new Map(), workspaceId: ws.workspace.workspaceId, capturedRevision: 3, datasetToken: 1, policyContext: PAID_TEST_CONTEXT });
  const saved = await paid.saveRecoveryCheckpoint({ workspaceId: ws.workspace.workspaceId, workspaceToken: ws.workspace.workspaceToken, expectedControlVersion: ws.workspace.controlVersion, snapshot: paidSnapshot });
  const beforeCheckpoint = await paid.loadRecoveryCheckpoint(ws.workspace.workspaceId);
  const beforeWorkspace = await paid.loadRecoveryWorkspace(ws.workspace.workspaceId);
  const beforeUsage = await free.combinedUsage();
  const freeSnapshot = await buildRecoverySnapshot({ tree: flat(1), registry: new Map(), workspaceId: ws.workspace.workspaceId, capturedRevision: 4, datasetToken: 1, policyContext: FREE });
  await assert.rejects(() => free.saveRecoveryCheckpoint({ workspaceId: ws.workspace.workspaceId, workspaceToken: ws.workspace.workspaceToken, expectedControlVersion: saved.workspace.controlVersion, snapshot: freeSnapshot }), (error) => error.code === 'node-limit');
  const afterCheckpoint = await paid.loadRecoveryCheckpoint(ws.workspace.workspaceId);
  const afterWorkspace = await paid.loadRecoveryWorkspace(ws.workspace.workspaceId);
  assert.equal(afterCheckpoint.checkpoint.checkpointId, beforeCheckpoint.checkpoint.checkpointId);
  assert.equal(afterCheckpoint.checkpoint.checkpointGeneration, beforeCheckpoint.checkpoint.checkpointGeneration);
  assert.equal(afterCheckpoint.checkpoint.nodeCount, 1000);
  assert.deepEqual(afterCheckpoint.checkpoint.tree, beforeCheckpoint.checkpoint.tree);
  assert.deepEqual(afterCheckpoint.attachments.map((item) => item.sha256), beforeCheckpoint.attachments.map((item) => item.sha256));
  assert.deepEqual(afterCheckpoint.workspace, beforeWorkspace);
  assert.deepEqual(await free.combinedUsage(), beforeUsage);
  const paidSmall = await buildRecoverySnapshot({ tree: flat(1), registry: new Map(), workspaceId: ws.workspace.workspaceId, capturedRevision: 5, datasetToken: 1, policyContext: PAID_TEST_CONTEXT });
  const replaced = await paid.saveRecoveryCheckpoint({ workspaceId: ws.workspace.workspaceId, workspaceToken: ws.workspace.workspaceToken, expectedControlVersion: afterWorkspace.controlVersion, snapshot: paidSmall });
  assert.equal((await paid.loadRecoveryCheckpoint(ws.workspace.workspaceId)).checkpoint.nodeCount, 1);
});

test('recovery snapshots preserve trusted context; ownership inherits and explicit free override yields node-limit', async () => {
  const factory = new FakeIndexedDB(); const paid = repo(factory, 'recovery-owner', PAID_TEST_CONTEXT); const free = repo(factory, 'recovery-owner', FREE);
  const ws = await paid.createRecoveryWorkspace({ origin: 'test' });
  const paidSnapshot = await buildRecoverySnapshot({ tree: flat(1000), registry: new Map(), workspaceId: ws.workspace.workspaceId, capturedRevision: 1, datasetToken: 1, policyContext: PAID_TEST_CONTEXT });
  assert.equal(snapshotPolicyContext(paidSnapshot), PAID_TEST_CONTEXT);
  const owned = await ownValidatedRecoverySnapshot(paidSnapshot);
  assert.equal(owned.nodeCount, 1000);
  assert.equal(snapshotPolicyContext(owned), PAID_TEST_CONTEXT);
  await assert.rejects(() => ownValidatedRecoverySnapshot(paidSnapshot, { policyContext: FREE }), (error) => error.code === 'node-limit');
  await assert.rejects(() => free.saveRecoveryCheckpoint({ workspaceId: ws.workspace.workspaceId, workspaceToken: ws.workspace.workspaceToken, expectedControlVersion: ws.workspace.controlVersion, snapshot: paidSnapshot }), (error) => error.code === 'node-limit');
  const forged = { ...paidSnapshot, nodeCount: 999 };
  await assert.rejects(() => ownValidatedRecoverySnapshot(forged, { policyContext: PAID_TEST_CONTEXT }), (error) => error.code === 'recovery-node-count-mismatch');
  const plain = { ...paidSnapshot };
  await assert.rejects(() => ownValidatedRecoverySnapshot(plain), (error) => error.code === 'node-limit');
  assert.equal(snapshotPolicyContext(plain), null, 'forged plain object has no authority');
});

test('free retire and discard of retained paid checkpoint are rejected without mutation', async () => {
  const factory = new FakeIndexedDB(); const paid = repo(factory, 'retire-paid', PAID_TEST_CONTEXT); const free = repo(factory, 'retire-paid', FREE);
  const ws = await paid.createRecoveryWorkspace({ origin: 'test' });
  const snapshot = await buildRecoverySnapshot({ tree: flat(1000), registry: new Map(), workspaceId: ws.workspace.workspaceId, capturedRevision: 1, datasetToken: 1, policyContext: PAID_TEST_CONTEXT });
  const saved = await paid.saveRecoveryCheckpoint({ workspaceId: ws.workspace.workspaceId, workspaceToken: ws.workspace.workspaceToken, expectedControlVersion: ws.workspace.controlVersion, snapshot });
  const beforeCheckpoint = await paid.loadRecoveryCheckpoint(ws.workspace.workspaceId);
  const begin = await paid.beginRecoverySave({ workspaceId: ws.workspace.workspaceId, workspaceToken: ws.workspace.workspaceToken });
  const controlBefore = await paid.loadRecoveryWorkspace(ws.workspace.workspaceId);
  await assert.rejects(() => free.retireRecoveryThrough({ workspaceId: ws.workspace.workspaceId, workspaceToken: ws.workspace.workspaceToken, saveId: begin.saveId, saveSequence: begin.saveSequence }), (error) => error.code === 'node-limit');
  assert.deepEqual(await paid.loadRecoveryWorkspace(ws.workspace.workspaceId), controlBefore);
  assert.equal((await paid.loadRecoveryCheckpoint(ws.workspace.workspaceId)).checkpoint.checkpointId, beforeCheckpoint.checkpoint.checkpointId);
  await assert.rejects(() => free.discardRecoveryWorkspace({ workspaceId: ws.workspace.workspaceId, workspaceToken: ws.workspace.workspaceToken, expectedCheckpointId: saved.checkpoint.checkpointId, expectedCheckpointGeneration: saved.checkpoint.checkpointGeneration, ownerControlVersion: controlBefore.controlVersion }), (error) => error.code === 'node-limit');
  assert.equal((await paid.loadRecoveryCheckpoint(ws.workspace.workspaceId)).checkpoint.nodeCount, 1000);
  assert.deepEqual(await paid.loadRecoveryWorkspace(ws.workspace.workspaceId), controlBefore);
});

test('forged stored map count is node-count-mismatch, not capacity or corruption', async () => {
  const factory = new FakeIndexedDB(); const paid = repo(factory, 'forged-map', PAID_TEST_CONTEXT); const free = repo(factory, 'forged-map', FREE);
  const original = await paid.save(snap(flat(1000), PAID_TEST_CONTEXT));
  paid.close();
  const db = await openPersistenceDatabase({ indexedDB: factory, name: 'forged-map' });
  const tx = db.transaction([STORE_MAPS], 'readwrite');
  const store = tx.objectStore(STORE_MAPS);
  const rec = await new Promise((resolve, reject) => { const request = store.get(original.mapId); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  rec.nodeCount = 999; store.put(rec);
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
  const freeSnapshot = snap(flat(1), FREE, { mapId: original.mapId, expectedGeneration: original.generation });
  await assert.rejects(() => free.save(freeSnapshot), (error) => error.code === 'node-count-mismatch');
  await assert.rejects(() => paid.load(original.mapId), (error) => error.code === 'node-count-inconsistent');
});
test('free/paid boundaries remain 299/300 and 999/1000 with 301/1001 rejected', async () => {
  for (const [total, context, allowed] of [[299, FREE, true], [300, FREE, true], [301, FREE, false], [999, PAID_TEST_CONTEXT, true], [1000, PAID_TEST_CONTEXT, true], [1001, PAID_TEST_CONTEXT, false]]) {
    const r = repo(new FakeIndexedDB(), `b-${total}-${allowed}`, context);
    if (allowed) { const saved = await r.save(snap(flat(total), context)); assert.equal((await r.load(saved.mapId)).map.nodeCount, total); }
    else await assert.rejects(async () => r.save(snap(flat(total), context)), (error) => error.code === 'node-limit');
  }
});








