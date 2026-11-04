import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  buildSaveSnapshot,
  ownSaveSnapshot,
  snapshotPolicyContext
} from '../../../src/engine/hypertree/persistence/index.js';
import { encodeBackup, decodeBackup } from '../../../src/engine/hypertree/persistence/backup.js';
import { createAttachmentRegistry } from '../../../src/engine/hypertree/editor/attachments.js';
import {
  FREE_POLICY_CONTEXT,
  createInternalPolicyContext,
  resolvePolicyContext,
  evaluateContextNodeAccess
} from '../../../src/engine/hypertree/edition/index.js';
import { resolveSavedMapNodeLimit } from '../../../src/engine/hypertree/persistence/node-limit.js';
import { PAID_TEST_CONTEXT } from '../../helpers/stage3a-paid-context.mjs';

const cryptoApi = globalThis.crypto;
const hashBytes = (bytes) => createHash('sha256').update(Buffer.from(bytes)).digest('hex');
const flatten = (root) => { const out = []; const walk = (node) => { out.push({ id: node.id, name: node.name, kind: node.kind, description: node.data?.description ?? null }); for (const child of node.children || []) walk(child); }; walk(root); return out; };
const count = (root) => flatten(root).length;

function flatTree(total, label = 'node') {
  return {
    id: 'root', name: `${label}-한국어-루트`, kind: 'folder', data: {},
    children: Array.from({ length: total - 1 }, (_, index) => ({
      id: `${label}-${index + 1}`, name: `${label}-긴한국어이름-${index + 1}.txt`, kind: 'file', data: { description: `설명 ${index + 1}` }
    }))
  };
}
const classifications = {
  text: { format: 'text', badge: 'TXT', needsReview: false },
  image: { format: 'image', badge: 'PNG', needsReview: false },
  pdf: { format: 'pdf', badge: 'PDF', needsReview: false }
};
function structuredTree(total = 300) {
  const registry = createAttachmentRegistry({ datasetToken: 3 });
  const root = { id: 'root', name: '구조-한국어-루트', kind: 'folder', data: {}, children: [] };
  const folders = ['폴더-가', '폴더-나', '폴더-다'].map((name, index) => ({ id: `folder-${index}`, name, kind: 'folder', data: {}, children: [] }));
  root.children.push(...folders);
  const payloads = [
    { name: '텍스트-한국어.txt', bytes: new TextEncoder().encode('텍스트 payload'), type: 'text/plain', classification: classifications.text },
    { name: '이미지-한국어.png', bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]), type: 'image/png', classification: classifications.image },
    { name: '문서-한국어.pdf', bytes: new TextEncoder().encode('%PDF-1.7\n한국어 PDF payload'), type: 'application/pdf', classification: classifications.pdf },
    { name: '빈-한국어.txt', bytes: new Uint8Array(0), type: 'text/plain', classification: classifications.text }
  ];
  const staged = payloads.map((payload) => { const file = new File([payload.bytes], payload.name, { type: payload.type }); const s = registry.stage(file, payload.classification); registry.commit(s.id); return { ...payload, id: s.id, size: payload.bytes.length }; });
  let next = 1;
  const leaves = total - 1 - folders.length;
  for (let index = 0; index < leaves; index += 1) {
    const folder = folders[index % folders.length];
    const attachment = index < staged.length ? staged[index] : null;
    const node = {
      id: `leaf-${next}`, name: index < 3 ? `중복-이름-한국어.txt` : `잎-한국어-${next}.txt`, kind: 'file',
      data: attachment ? {
        description: `첨부 ${attachment.name}`, dataType: 'file', attachmentId: attachment.id,
        originalName: attachment.name, sizeBytes: attachment.size, mime: attachment.type, classification: attachment.classification
      } : { description: `일반 ${next}` }
    };
    folder.children.push(node);
    next += 1;
  }
  return { tree: root, registry, payloads: staged };
}
const snapshotFor = (tree, registry, policyContext, limits = {}) => buildSaveSnapshot({ tree, registry, datasetToken: 1, capturedRevision: 0, policyContext, limits });

test('internal policy context defaults free, supports paid tests, and rejects forged/unknown contexts', () => {
  const missing = resolvePolicyContext(undefined);
  assert.equal(missing.ok, true);
  assert.equal(missing.context.edition, 'free');
  assert.equal(missing.defaulted, true);
  const paid = createInternalPolicyContext({ edition: 'paid' });
  assert.equal(resolvePolicyContext(paid).ok, true);
  const forged = Object.freeze({ kind: 'fileorbit.internal-policy-context', version: 1, edition: 'paid', maxNodes: null });
  assert.equal(resolvePolicyContext(forged).ok, false, 'a structured JSON-like object cannot grant paid access');
  assert.equal(resolvePolicyContext({ edition: 'paid' }).ok, false);
  assert.throws(() => createInternalPolicyContext({ edition: 'enterprise' }));
  assert.equal(resolveSavedMapNodeLimit().limit, 300);
  assert.equal(resolveSavedMapNodeLimit(undefined, PAID_TEST_CONTEXT).limit, 1000);
  assert.equal(evaluateContextNodeAccess(FREE_POLICY_CONTEXT, 301).decision.allowed, false);
  assert.equal(evaluateContextNodeAccess(PAID_TEST_CONTEXT, 1000).decision.allowed, true);
  const lower = createInternalPolicyContext({ edition: 'paid', maxNodes: 500 });
  assert.equal(evaluateContextNodeAccess(lower, 500, 1000).decision.effectiveLimit, 500);
  assert.equal(evaluateContextNodeAccess(PAID_TEST_CONTEXT, 1000, 1000).decision.effectiveLimit, 1000);
});

test('snapshot construction owns free 299/300/301 and paid 999/1000/1001 boundaries', () => {
  const registry = createAttachmentRegistry({ datasetToken: 1 });
  const at = (total, context) => snapshotFor(flatTree(total), registry, context);
  for (const total of [299, 300]) assert.equal(at(total, FREE_POLICY_CONTEXT).nodeCount, total);
  assert.throws(() => at(301, FREE_POLICY_CONTEXT), (error) => error.code === 'node-limit' && /300/.test(error.message));
  for (const total of [999, 1000]) assert.equal(at(total, PAID_TEST_CONTEXT).nodeCount, total);
  assert.throws(() => at(1001, PAID_TEST_CONTEXT), (error) => error.code === 'node-limit' && /1000/.test(error.message));
  assert.throws(() => at(301), (error) => error.code === 'node-limit', 'missing context defaults free');
  assert.throws(() => at(301, Object.freeze({ kind: 'fileorbit.internal-policy-context', version: 1, edition: 'paid', maxNodes: null })), (error) => error.code === 'invalid-policy-context');
});

test('context and caller budgets tighten paid/free limits and cannot elevate them', () => {
  const registry = createAttachmentRegistry({ datasetToken: 1 });
  const freeLower = snapshotFor(flatTree(250), registry, createInternalPolicyContext({ edition: 'free', maxNodes: 250 }));
  assert.equal(freeLower.nodeCount, 250);
  assert.throws(() => snapshotFor(flatTree(251), registry, createInternalPolicyContext({ edition: 'free', maxNodes: 250 })), (error) => error.code === 'node-limit');
  assert.throws(() => snapshotFor(flatTree(301), registry, FREE_POLICY_CONTEXT, { maxNodes: 1000 }), (error) => error.code === 'node-limit' && /300/.test(error.message));
  assert.equal(snapshotFor(flatTree(300), registry, PAID_TEST_CONTEXT, { maxNodes: 300 }).nodeCount, 300);
  assert.throws(() => snapshotFor(flatTree(301), registry, PAID_TEST_CONTEXT, { maxNodes: 300 }), (error) => error.code === 'node-limit');
  assert.throws(() => snapshotFor(flatTree(501), registry, createInternalPolicyContext({ edition: 'paid', maxNodes: 500 }), { maxNodes: 1000 }), (error) => error.code === 'node-limit');
});

test('paid snapshot ownership inherits its internal context; explicit free ownership rejects', () => {
  const registry = createAttachmentRegistry({ datasetToken: 1 });
  const snapshot = snapshotFor(flatTree(1000), registry, PAID_TEST_CONTEXT);
  assert.equal(snapshotPolicyContext(snapshot).edition, 'paid');
  const owned = ownSaveSnapshot(snapshot);
  assert.equal(owned.nodeCount, 1000);
  assert.equal(snapshotPolicyContext(owned).edition, 'paid');
  assert.equal(JSON.stringify(snapshot).includes('paid'), false, 'context is not serialized');
  assert.throws(() => ownSaveSnapshot(snapshot, { policyContext: FREE_POLICY_CONTEXT }), (error) => error.code === 'node-limit');
  const forgedCount = { ...snapshot, nodeCount: 999 };
  assert.throws(() => ownSaveSnapshot(forgedCount, { policyContext: PAID_TEST_CONTEXT }), (error) => error.code === 'node-count-mismatch');
});

test('caller input mutation does not alter owned snapshots or encoded package bytes', async () => {
  const { tree, registry } = structuredTree(300);
  const snapshot = snapshotFor(tree, registry, FREE_POLICY_CONTEXT);
  const before = flatten(snapshot.tree);
  tree.children[0].name = 'CALLER-MUTATED';
  tree.children[0].children[0].name = 'CALLER-MUTATED-LEAF';
  assert.deepEqual(flatten(snapshot.tree), before);
  const encoded = await encodeBackup({ tree, registry, mapName: 'mutation', cryptoApi });
  const decoded = await decodeBackup(encoded.blob, { cryptoApi, policyContext: FREE_POLICY_CONTEXT });
  assert.equal(decoded.tree.children[0].name, 'CALLER-MUTATED');
  const sourceBytes = new Uint8Array(await encoded.blob.arrayBuffer());
  const sourceHash = hashBytes(sourceBytes);
  await assert.rejects(() => decodeBackup(encoded.blob, { cryptoApi, policyContext: createInternalPolicyContext({ edition: 'free', maxNodes: 100 }) }), (error) => error.code === 'node-limit');
  assert.equal(hashBytes(new Uint8Array(await encoded.blob.arrayBuffer())), sourceHash);
});

test('format round-trips names, IDs, topology, metadata, and attachment SHA-256 at free and paid limits', async () => {
  for (const [total, context] of [[300, FREE_POLICY_CONTEXT], [1000, PAID_TEST_CONTEXT]]) {
    const { tree, registry, payloads } = structuredTree(total);
    const encoded = await encodeBackup({ tree, registry, mapName: '한국어-라운드트립', cryptoApi, policyContext: context });
    const manifestText = JSON.stringify(encoded.manifest);
    assert.equal(/edition|license|policy|purchase|entitlement/i.test(manifestText), false, 'context is not serialized');
    const decoded = await decodeBackup(encoded.blob, { cryptoApi, policyContext: context });
    assert.deepEqual(flatten(decoded.tree), flatten(tree));
    assert.equal(count(decoded.tree), total);
    assert.equal(decoded.attachments.length, 4);
    for (const payload of payloads) {
      const attachment = decoded.attachments.find((item) => item.metadata.originalName === payload.name);
      assert.ok(attachment, payload.name);
      const bytes = new Uint8Array(await attachment.blob.arrayBuffer());
      assert.equal(hashBytes(bytes), hashBytes(payload.bytes), payload.name);
    }
  }
});

test('free packages decode in paid context; oversized paid packages fail as limits, not corruption, preserving bytes', async () => {
  const free = structuredTree(300);
  const freeEncoded = await encodeBackup({ tree: free.tree, registry: free.registry, mapName: 'free', cryptoApi, policyContext: FREE_POLICY_CONTEXT });
  const paidDecoded = await decodeBackup(freeEncoded.blob, { cryptoApi, policyContext: PAID_TEST_CONTEXT });
  assert.equal(count(paidDecoded.tree), 300);

  const paid = structuredTree(1000);
  const paidEncoded = await encodeBackup({ tree: paid.tree, registry: paid.registry, mapName: 'paid', cryptoApi, policyContext: PAID_TEST_CONTEXT });
  const paidBytes = new Uint8Array(await paidEncoded.blob.arrayBuffer());
  const paidHash = hashBytes(paidBytes);
  await assert.rejects(() => decodeBackup(paidEncoded.blob, { cryptoApi, policyContext: FREE_POLICY_CONTEXT }), (error) => error.code === 'node-limit' && /300/.test(error.message));
  assert.equal(hashBytes(new Uint8Array(await paidEncoded.blob.arrayBuffer())), paidHash);

  const at301 = structuredTree(301);
  const encoded301 = await encodeBackup({ tree: at301.tree, registry: at301.registry, mapName: '301', cryptoApi, policyContext: PAID_TEST_CONTEXT });
  const bytes301 = new Uint8Array(await encoded301.blob.arrayBuffer());
  const hash301 = hashBytes(bytes301);
  await assert.rejects(() => decodeBackup(encoded301.blob, { cryptoApi, policyContext: FREE_POLICY_CONTEXT }), (error) => error.code === 'node-limit');
  assert.equal(hashBytes(new Uint8Array(await encoded301.blob.arrayBuffer())), hash301);
});

test('invalid context and payload integrity failures do not mutate caller inputs', async () => {
  const { tree, registry } = structuredTree(20);
  const before = JSON.stringify(tree);
  await assert.rejects(() => encodeBackup({ tree, registry, mapName: 'bad', cryptoApi, policyContext: Object.freeze({ kind: 'fileorbit.internal-policy-context', version: 1, edition: 'paid', maxNodes: null }) }), (error) => error.code === 'invalid-policy-context');
  assert.equal(JSON.stringify(tree), before);
  const encoded = await encodeBackup({ tree, registry, mapName: 'bad2', cryptoApi, policyContext: FREE_POLICY_CONTEXT });
  const clone = encoded.blob.slice(0, encoded.blob.size);
  await assert.rejects(() => decodeBackup(clone, { cryptoApi, policyContext: Object.freeze({ kind: 'fileorbit.internal-policy-context', version: 1, edition: 'paid', maxNodes: null }) }), (error) => error.code === 'invalid-policy-context');
});




test('caller mutation during asynchronous encode cannot alter the package payload or tree snapshot', async () => {
  const bytes = new TextEncoder().encode('async-payload-한국어');
  let release; let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const file = { size: bytes.length, type: 'text/plain', slice() { markStarted(); return { arrayBuffer: () => gate }; } };
  const registry = new Map([['att_async', { file, metadata: { originalName: '비동기-한국어.txt', sizeBytes: bytes.length, mime: 'text/plain', classification: classifications.text } }]]);
  const tree = {
    id: 'root', name: '비동기-루트', kind: 'folder', data: {},
    children: [{ id: 'leaf', name: '원래-이름.txt', kind: 'file', data: {
      dataType: 'file', description: '비동기', attachmentId: 'att_async', originalName: '비동기-한국어.txt',
      sizeBytes: bytes.length, mime: 'text/plain', classification: classifications.text
    } }]
  };
  const pending = encodeBackup({ tree, registry, mapName: '비동기', cryptoApi, policyContext: FREE_POLICY_CONTEXT });
  await started;
  tree.children[0].name = 'CALLER-MUTATED-DURING-ENCODE';
  tree.name = 'CALLER-MUTATED-ROOT';
  release(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const encoded = await pending;
  const decoded = await decodeBackup(encoded.blob, { cryptoApi, policyContext: FREE_POLICY_CONTEXT });
  assert.equal(decoded.tree.name, '비동기-루트');
  assert.equal(decoded.tree.children[0].name, '원래-이름.txt');
  assert.equal(JSON.stringify(encoded.manifest).includes('CALLER-MUTATED'), false);
  assert.equal(new Uint8Array(await decoded.attachments[0].blob.arrayBuffer()).length, bytes.length);
});
