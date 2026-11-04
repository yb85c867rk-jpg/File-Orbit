import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { createHash } from 'node:crypto';
import { FakeIndexedDB } from './fake-indexeddb.mjs';
import {
  buildSaveSnapshot, createPersistenceRepository, admitSavedMapRuntime,
  reconstructSavedMapRuntime, loadSavedMapRuntime
} from '../../../src/engine/hypertree/persistence/index.js';
import { createAttachmentRegistry } from '../../../src/engine/hypertree/editor/attachments.js';
import { createInternalPolicyContext, FREE_POLICY_CONTEXT } from '../../../src/engine/hypertree/edition/index.js';
import { PAID_TEST_CONTEXT } from '../../helpers/stage3a-paid-context.mjs';

const code = (expected) => (error) => error?.code === expected;
const viewport = { width: 1600, height: 1000 };
const sha = async (blob) => createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');
function tree(count) {
  return { id: 'root', name: 'Stage 3C 루트', kind: 'folder', data: {}, children: Array.from({ length: count - 1 }, (_, i) => ({ id: `n${i}`, name: `노드-${i}.txt`, kind: 'file', data: { description: `설명 ${i}` }, children: [] })) };
}
const loaded = (t, declared = null, attachments = []) => ({ map: { mapId: 'map_stage3c', generation: 3, nodeCount: declared ?? count(t), attachmentBytes: attachments.reduce((n, a) => n + a.metadata.sizeBytes, 0) }, document: { tree: t }, attachments });
function count(root) { let n = 0; const walk = (node) => { n += 1; for (const child of node.children || []) walk(child); }; walk(root); return n; }

test('Stage 3C admission free 299/300 accepted; 301 rejected', () => {
  for (const n of [299, 300]) {
    const admitted = admitSavedMapRuntime({ loaded: loaded(tree(n)), datasetToken: 1, viewport, policyContext: FREE_POLICY_CONTEXT });
    assert.equal(admitted.nodeCount, n); assert.equal(admitted.edition, 'free');
  }
  assert.throws(() => admitSavedMapRuntime({ loaded: loaded(tree(301)), datasetToken: 1, viewport }), code('node-limit'));
});

test('Stage 3C admission paid 999/1,000 accepted; 1,001 rejected with typed node-limit', () => {
  for (const n of [999, 1000]) {
    const admitted = admitSavedMapRuntime({ loaded: loaded(tree(n)), datasetToken: 1, viewport, policyContext: PAID_TEST_CONTEXT });
    assert.equal(admitted.nodeCount, n); assert.equal(admitted.edition, 'paid');
  }
  assert.throws(() => admitSavedMapRuntime({ loaded: loaded(tree(1001)), datasetToken: 1, viewport, policyContext: PAID_TEST_CONTEXT }), code('node-limit'));
});

test('Stage 3C lower caller/context budgets tighten and cannot elevate', () => {
  const lower = createInternalPolicyContext({ edition: 'paid', maxNodes: 500 });
  assert.throws(() => admitSavedMapRuntime({ loaded: loaded(tree(501)), datasetToken: 1, viewport, policyContext: lower }), code('node-limit'));
  assert.equal(admitSavedMapRuntime({ loaded: loaded(tree(500)), datasetToken: 1, viewport, policyContext: lower }).nodeCount, 500);
  assert.throws(() => admitSavedMapRuntime({ loaded: loaded(tree(300)), datasetToken: 1, viewport, maxNodes: 100 }), code('node-limit'));
  assert.throws(() => admitSavedMapRuntime({ loaded: loaded(tree(1001)), datasetToken: 1, viewport, policyContext: FREE_POLICY_CONTEXT, maxNodes: 1000 }), code('node-limit'));
});

test('Stage 3C malformed/forged contexts and forged counts fail closed', () => {
  assert.throws(() => admitSavedMapRuntime({ loaded: loaded(tree(1)), datasetToken: 1, viewport, policyContext: Object.freeze({ edition: 'paid' }) }), code('invalid-policy-context'));
  assert.throws(() => admitSavedMapRuntime({ loaded: loaded(tree(2), 1), datasetToken: 1, viewport }), code('node-count-inconsistent'));
  const forged = { ...loaded(tree(1000)), map: { ...loaded(tree(1000)).map, nodeCount: 999 } };
  assert.throws(() => admitSavedMapRuntime({ loaded: forged, datasetToken: 1, viewport, policyContext: PAID_TEST_CONTEXT }), code('node-count-inconsistent'));
});

test('paid repository load followed by admission with the same explicit context', async () => {
  const factory = new FakeIndexedDB(); const repo = createPersistenceRepository({ indexedDB: factory, dbName: 'stage3c-paid-load', policyContext: PAID_TEST_CONTEXT });
  const saved = await repo.save(buildSaveSnapshot({ tree: tree(1000), registry: new Map(), datasetToken: 1, capturedRevision: 0, policyContext: PAID_TEST_CONTEXT }));
  const loadedRecord = await repo.load(saved.mapId);
  const admitted = admitSavedMapRuntime({ loaded: loadedRecord, datasetToken: 7, viewport, policyContext: PAID_TEST_CONTEXT });
  assert.equal(admitted.nodeCount, 1000); assert.equal(admitted.mapId, saved.mapId);
  assert.throws(() => admitSavedMapRuntime({ loaded: loadedRecord, datasetToken: 7, viewport, policyContext: FREE_POLICY_CONTEXT }), code('node-limit'));
});

test('runtime reconstruction 300 preserves attachment bytes/SHA and repeated dispose is safe', async () => {
  const registry = createAttachmentRegistry({ datasetToken: 1 });
  const payloads = [
    ['글.txt', Buffer.from('텍스트'), 'text/plain', { format: 'text', badge: 'TXT', mime: 'text/plain', needsReview: false }],
    ['그림.png', Buffer.from([137, 80, 78, 71, 0, 1]), 'image/png', { format: 'image', badge: 'PNG', mime: 'image/png', needsReview: false }],
    ['문서.pdf', Buffer.from('%PDF-1.7 한국어'), 'application/pdf', { format: 'pdf', badge: 'PDF', mime: 'application/pdf', needsReview: false }],
    ['빈.txt', Buffer.alloc(0), 'text/plain', { format: 'text', badge: 'TXT', mime: 'text/plain', needsReview: false }]
  ];
  const t = tree(300); let i = 0;
  for (const [name, bytes, mime, cl] of payloads) {
    const staged = registry.stage(new File([bytes], name, { type: mime }), cl); registry.commit(staged.id);
    const node = t.children[i++]; node.data = { dataType: 'file', attachmentId: staged.id, originalName: name, sizeBytes: bytes.length, mime, classification: cl };
  }
  const snapshot = buildSaveSnapshot({ tree: t, registry, datasetToken: 1, capturedRevision: 0, policyContext: FREE_POLICY_CONTEXT });
  const loadedAttachments = snapshot.attachments.map((a) => ({ attachmentId: a.persistentId, blob: a.blob, metadata: { attachmentId: a.persistentId, originalName: a.originalName, sizeBytes: a.sizeBytes, mime: a.mime, classification: a.classification ?? null } }));
  const runtime = reconstructSavedMapRuntime({ loaded: loaded(t, 300, loadedAttachments), datasetToken: 1, viewport });
  assert.equal(runtime.nodeCount, 300); assert.equal(runtime.registry.size, 4);
  for (let index = 0; index < payloads.length; index += 1) {
    const attachment = runtime.registry.get(loadedAttachments[index].attachmentId);
    assert.equal(await sha(attachment.file), createHash('sha256').update(payloads[index][1]).digest('hex'));
  }
  runtime.dispose(); runtime.dispose();
  const again = reconstructSavedMapRuntime({ loaded: loaded(t, 300, loadedAttachments), datasetToken: 2, viewport });
  assert.equal(again.nodeCount, 300); again.dispose();
});

test('paid 1,000 admission succeeds while V2 reconstruction geometry remains a reported blocker', () => {
  const admitted = admitSavedMapRuntime({ loaded: loaded(tree(1000)), datasetToken: 1, viewport, policyContext: PAID_TEST_CONTEXT });
  assert.equal(admitted.nodeCount, 1000);
  assert.throws(
    () => reconstructSavedMapRuntime({ loaded: loaded(tree(1000)), datasetToken: 1, viewport, policyContext: PAID_TEST_CONTEXT }),
    (error) => error?.code === 'runtime-reconstruction-failed' && /angular clearance|workspace scale|experimental-v2/.test(String(error.message))
  );
});

test('loadSavedMapRuntime threads context and fails typed for free/paid mismatch', async () => {
  const factory = new FakeIndexedDB(); const paid = createPersistenceRepository({ indexedDB: factory, dbName: 'stage3c-load-runtime', policyContext: PAID_TEST_CONTEXT });
  const saved = await paid.save(buildSaveSnapshot({ tree: tree(1000), registry: new Map(), datasetToken: 1, capturedRevision: 0, policyContext: PAID_TEST_CONTEXT }));
  await assert.rejects(() => loadSavedMapRuntime({ repository: paid, mapId: saved.mapId, datasetToken: 1, viewport, policyContext: FREE_POLICY_CONTEXT }), code('node-limit'));
  const admitted = admitSavedMapRuntime({ loaded: await paid.load(saved.mapId), datasetToken: 1, viewport, policyContext: PAID_TEST_CONTEXT });
  assert.equal(admitted.nodeCount, 1000);
});




