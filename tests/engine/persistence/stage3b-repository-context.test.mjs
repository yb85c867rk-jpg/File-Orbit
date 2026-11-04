import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { createHash } from 'node:crypto';
import { FakeIndexedDB } from './fake-indexeddb.mjs';
import {
  buildSaveSnapshot, createAttachmentId, createPersistenceRepository,
  buildRecoverySnapshot, ownSaveSnapshot, snapshotPolicyContext
} from '../../../src/engine/hypertree/persistence/index.js';
import { createAttachmentRegistry } from '../../../src/engine/hypertree/editor/attachments.js';
import { createInternalPolicyContext } from '../../../src/engine/hypertree/edition/index.js';
import { PAID_TEST_CONTEXT } from '../../helpers/stage3a-paid-context.mjs';

const sha = async (blob) => createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');
const topology = (root) => { const out = []; const walk = (node) => { out.push({ id: node.id, name: node.name, kind: node.kind, description: node.data?.description ?? null }); for (const child of node.children || []) walk(child); }; walk(root); return out; };
const flat = (total) => ({ id: 'root', name: '한국어 루트', kind: 'folder', data: {}, children: Array.from({ length: total - 1 }, (_, i) => ({ id: `n${i + 1}`, name: `긴한국어이름-${i + 1}.txt`, kind: 'file', data: { description: `설명 ${i + 1}` } })) });
const classification = (format, badge, mime) => ({ format, badge, mime, needsReview: false });
function structured(total) {
  const registry = createAttachmentRegistry({ datasetToken: 9 });
  const folders = [0, 1, 2].map((i) => ({ id: `folder-${i}`, name: `폴더-${i}`, kind: 'folder', data: {}, children: [] }));
  const root = { id: 'root', name: '구조-한국어-루트', kind: 'folder', data: {}, children: folders };
  const payloads = [
    ['텍스트.txt', new TextEncoder().encode('텍스트'), 'text/plain', classification('text', 'TXT', 'text/plain')],
    ['이미지.png', new Uint8Array([137, 80, 78, 71, 1, 2, 3]), 'image/png', classification('image', 'PNG', 'image/png')],
    ['문서.pdf', new TextEncoder().encode('%PDF-1.7 한국어'), 'application/pdf', classification('pdf', 'PDF', 'application/pdf')],
    ['빈.txt', new Uint8Array(0), 'text/plain', classification('text', 'TXT', 'text/plain')]
  ].map(([name, bytes, mime, cl]) => { const f = new File([bytes], name, { type: mime }); const staged = registry.stage(f, cl); registry.commit(staged.id); return { name, bytes, mime, cl, id: staged.id }; });
  let count = total - 4;
  for (let i = 0; i < count; i += 1) {
    const folder = folders[i % 3];
    const attachment = i < payloads.length ? payloads[i] : null;
    folder.children.push(attachment ? {
      id: `leaf-${i}`, name: i < 3 ? '중복-한국어.txt' : `잎-${i}.txt`, kind: 'file',
      data: { dataType: 'file', description: `첨부 ${attachment.name}`, attachmentId: attachment.id, originalName: attachment.name, sizeBytes: attachment.bytes.length, mime: attachment.mime, classification: attachment.cl }
    } : { id: `leaf-${i}`, name: `잎-${i}.txt`, kind: 'file', data: { description: `일반 ${i}` } });
  }
  return { tree: root, registry, payloads };
}
let sequence = 0;
const mapIdFactory = () => `map_${String(++sequence).padStart(12, '0')}`;
const repo = (factory, name, policyContext) => createPersistenceRepository({ indexedDB: factory, dbName: name, mapIdFactory, policyContext });
const snap = (tree, registry = new Map(), context, limits = {}) => buildSaveSnapshot({ tree, registry, datasetToken: 1, capturedRevision: 0, policyContext: context, limits });

test('repository free/paid boundaries and malformed context rejection', async () => {
  for (const [total, context, ok] of [[299, undefined, true], [300, undefined, true], [301, undefined, false], [999, PAID_TEST_CONTEXT, true], [1000, PAID_TEST_CONTEXT, true], [1001, PAID_TEST_CONTEXT, false]]) {
    const factory = new FakeIndexedDB();
    const r = repo(factory, `boundary-${total}-${ok}`, context);
    if (ok) { const saved = await r.save(snap(flat(total), new Map(), context)); assert.equal((await r.load(saved.mapId)).map.nodeCount, total); }
    else await assert.rejects(async () => r.save(snap(flat(total), new Map(), context)), (error) => error.code === 'node-limit');
  }
  assert.throws(() => repo(new FakeIndexedDB(), 'bad-context', Object.freeze({ kind: 'fileorbit.internal-policy-context', version: 1, edition: 'paid', maxNodes: null })), /policy context/i);
  const lower = createInternalPolicyContext({ edition: 'paid', maxNodes: 500 });
  const lowerRepo = repo(new FakeIndexedDB(), 'lower', lower);
  await assert.rejects(async () => lowerRepo.save(snap(flat(501), new Map(), lower)), (error) => error.code === 'node-limit');
});

test('paid repository round trip preserves topology/metadata/attachment hashes; free load/remove preserve and account for record', async () => {
  const factory = new FakeIndexedDB(); const paid = repo(factory, 'repository-context', PAID_TEST_CONTEXT); const free = repo(factory, 'repository-context', undefined);
  const { tree, registry, payloads } = structured(1000);
  const snapshot = snap(tree, registry, PAID_TEST_CONTEXT);
  const saved = await paid.save(snapshot);
  const loaded = await paid.load(saved.mapId);
  assert.equal(loaded.map.nodeCount, 1000);
  assert.equal(loaded.document.tree.children.length, 3);
  assert.deepEqual(loaded.document.tree.children.map((folder) => folder.name), ['폴더-0', '폴더-1', '폴더-2']);
  assert.deepEqual(topology(loaded.document.tree), topology(tree));
  assert.equal(loaded.attachments.length, 4);
  for (const payload of payloads) {
    const attachment = loaded.attachments.find((item) => item.metadata.originalName === payload.name);
    assert.equal(await sha(attachment.blob), createHash('sha256').update(Buffer.from(payload.bytes)).digest('hex'));
  }
  await assert.rejects(() => free.load(saved.mapId), (error) => error.code === 'node-limit');
  await assert.rejects(() => free.remove(saved.mapId), (error) => error.code === 'node-limit');
  assert.equal((await paid.load(saved.mapId)).map.generation, saved.generation, 'free rejection does not alter paid record');
  const usage = await free.combinedUsage();
  assert.ok(usage.libraryBytes > 0, 'paid record attachment bytes remain in accounting');
  const repaired = await free.repairUsage();
  assert.ok(repaired.libraryBytes > 0);
  assert.equal((await free.list()).length, 1, 'metadata record remains visible and is not deleted');
});

test('refuses a paid-bound snapshot when used through a free repository', async () => {
  const paidSnapshot = snap(flat(1000), new Map(), PAID_TEST_CONTEXT);
  const free = repo(new FakeIndexedDB(), 'cross-context', undefined);
  await assert.rejects(() => free.save(paidSnapshot), (error) => error.code === 'node-limit');
  const forged = { ...paidSnapshot, nodeCount: 999 };
  assert.throws(() => ownSaveSnapshot(forged, { policyContext: PAID_TEST_CONTEXT }), (error) => error.code === 'node-count-mismatch');
});

test('recovery checkpoint paid round trip, free capacity rejection, and retained accounting', async () => {
  const factory = new FakeIndexedDB(); const paid = repo(factory, 'recovery-context', PAID_TEST_CONTEXT); const free = repo(factory, 'recovery-context', undefined);
  const { tree, registry } = structured(1000);
  const ws = await paid.createRecoveryWorkspace({ documentName: 'paid.orbit', origin: 'test' });
  const recovery = await buildRecoverySnapshot({ tree, registry, workspaceId: ws.workspace.workspaceId, capturedRevision: 4, datasetToken: 1, policyContext: PAID_TEST_CONTEXT, allocateAttachmentId: createAttachmentId });
  const saved = await paid.saveRecoveryCheckpoint({ workspaceId: ws.workspace.workspaceId, workspaceToken: ws.workspace.workspaceToken, expectedControlVersion: ws.workspace.controlVersion, snapshot: recovery });
  const loaded = await paid.loadRecoveryCheckpoint(ws.workspace.workspaceId);
  assert.equal(loaded.checkpoint.nodeCount, 1000);
  assert.equal(loaded.checkpoint.nodeCount, saved.checkpoint.nodeCount);
  await assert.rejects(() => free.loadRecoveryCheckpoint(ws.workspace.workspaceId), (error) => error.code === 'node-limit');
  const retained = await paid.loadRecoveryCheckpoint(ws.workspace.workspaceId);
  assert.equal(retained.checkpoint.checkpointGeneration, saved.checkpoint.checkpointGeneration, 'free rejection preserves paid checkpoint');
  const usage = await free.combinedUsage();
  assert.ok(usage.recoveryBytes > 0, 'paid recovery bytes remain counted');
  assert.equal((await free.listRecoveryCandidates()).length, 1);
});

test('free recovery checkpoint boundary remains 300 and paid checkpoint rejects at 1001', async () => {
  const free = repo(new FakeIndexedDB(), 'free-recovery-boundary', undefined);
  const freeWs = await free.createRecoveryWorkspace({ origin: 'test' });
  const freeRecovery = await buildRecoverySnapshot({ tree: flat(300), registry: new Map(), workspaceId: freeWs.workspace.workspaceId, capturedRevision: 0, datasetToken: 1, policyContext: undefined });
  assert.equal((await free.saveRecoveryCheckpoint({ workspaceId: freeWs.workspace.workspaceId, workspaceToken: freeWs.workspace.workspaceToken, expectedControlVersion: freeWs.workspace.controlVersion, snapshot: freeRecovery })).checkpoint.nodeCount, 300);
  const paid = repo(new FakeIndexedDB(), 'paid-recovery-over', PAID_TEST_CONTEXT);
  const paidWs = await paid.createRecoveryWorkspace({ origin: 'test' });
  await assert.rejects(() => buildRecoverySnapshot({ tree: flat(1001), registry: new Map(), workspaceId: paidWs.workspace.workspaceId, capturedRevision: 0, datasetToken: 1, policyContext: PAID_TEST_CONTEXT }), (error) => error.code === 'node-limit');
});





