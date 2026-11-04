import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import {
  MAX_SAVED_MAP_NODES,
  MAX_SAVED_ATTACHMENT_BYTES,
  MAX_SAVED_MAP_ATTACHMENT_BYTES,
  buildSaveSnapshot,
  ownSaveSnapshot,
  buildRecoverySnapshot,
  ownValidatedRecoverySnapshot,
  reconstructSavedMapRuntime,
  createRecoveryWorkspaceId,
  createAttachmentId
} from '../../../src/engine/hypertree/persistence/index.js';
import { encodeBackup, decodeBackup } from '../../../src/engine/hypertree/persistence/backup.js';
import { createAttachmentRegistry } from '../../../src/engine/hypertree/editor/attachments.js';
import { EDITION_NODE_LIMITS } from '../../../src/engine/hypertree/edition/index.js';

const classification = { format: 'text', badge: 'TXT', needsReview: false };
function tree(count) {
  return {
    id: 'root', name: 'Map', kind: 'folder', data: {},
    children: Array.from({ length: count - 1 }, (_, index) => ({
      id: `n${index}`, name: `file-${index}.txt`, kind: 'file', data: { dataType: 'legacy' }, children: []
    }))
  };
}
function count(tree) { let n = 1; for (const child of tree.children || []) n += count(child); return n; }
const registry = new Map();
function saveSnapshot(t, limits = {}) {
  return buildSaveSnapshot({ tree: t, registry, datasetToken: 1, capturedRevision: 0, limits });
}
function loaded(t) {
  return { map: { mapId: 'map_test', generation: 1, nodeCount: count(t), attachmentBytes: 0 }, document: { tree: t }, attachments: [] };
}

test('saved-map node limit derives from the central free edition limit', () => {
  assert.equal(MAX_SAVED_MAP_NODES, 300);
  assert.equal(MAX_SAVED_MAP_NODES, EDITION_NODE_LIMITS.free);
  assert.equal(MAX_SAVED_ATTACHMENT_BYTES, 20 * 1024 * 1024);
  assert.equal(MAX_SAVED_MAP_ATTACHMENT_BYTES, 100 * 1024 * 1024);
});

test('snapshot admission accepts 300 and rejects 301 including root', () => {
  const at300 = saveSnapshot(tree(300));
  assert.equal(at300.nodeCount, 300);
  assert.equal(count(at300.tree), 300);
  assert.throws(() => saveSnapshot(tree(301)), (error) => error.code === 'node-limit' && /300 nodes/.test(error.message));
});

test('snapshot budgets tighten but cannot elevate the free limit', () => {
  const lower = saveSnapshot(tree(10), { maxNodes: 10 });
  assert.equal(lower.nodeCount, 10);
  assert.throws(() => saveSnapshot(tree(11), { maxNodes: 10 }), (error) => error.code === 'node-limit' && /10 nodes/.test(error.message));
  const elevated = saveSnapshot(tree(300), { maxNodes: 1000 });
  assert.equal(elevated.nodeCount, 300);
  assert.throws(() => saveSnapshot(tree(301), { maxNodes: 1000 }), (error) => error.code === 'node-limit' && /300 nodes/.test(error.message));
  for (const maxNodes of [0, -1, 1.5, NaN, Infinity, '300']) {
    assert.throws(() => saveSnapshot(tree(1), { maxNodes }), (error) => error.code === 'invalid-node-limit', String(maxNodes));
  }
});

test('declared count cannot override actual snapshot tree count', () => {
  const snapshot = saveSnapshot(tree(300));
  const forged = { ...snapshot, nodeCount: 299 };
  assert.throws(() => ownSaveSnapshot(forged), (error) => error.code === 'node-count-mismatch');
  const tooMany = saveSnapshot(tree(299));
  const over = { ...tooMany, tree: tree(301), nodeCount: 301 };
  assert.throws(() => ownSaveSnapshot(over), (error) => error.code === 'node-limit');
});

test('backup encode/decode preserves 300-node integrity and rejects 301', async () => {
  const at300 = tree(300);
  const encoded = await encodeBackup({ tree: at300, registry: new Map(), mapName: 'Boundary 300', cryptoApi: globalThis.crypto });
  const decoded = await decodeBackup(encoded.blob, { cryptoApi: globalThis.crypto });
  assert.equal(decoded.manifest.nodeCount, 300);
  assert.equal(count(decoded.tree), 300);
  assert.deepEqual(decoded.tree.children.map((node) => node.id), at300.children.map((node) => node.id));
  await assert.rejects(() => encodeBackup({ tree: tree(301), registry: new Map(), mapName: 'Boundary 301', cryptoApi: globalThis.crypto }), (error) => error.code === 'node-limit' && /300 nodes/.test(error.message));
});

test('backup caller budgets tighten, cannot elevate, and invalid limits fail', async () => {
  const lower = await encodeBackup({ tree: tree(10), registry: new Map(), mapName: 'Lower', cryptoApi: globalThis.crypto, limits: { maxNodes: 10 } });
  assert.equal(lower.manifest?.nodeCount ?? 10, 10);
  await assert.rejects(() => encodeBackup({ tree: tree(11), registry: new Map(), mapName: 'Lower+', cryptoApi: globalThis.crypto, limits: { maxNodes: 10 } }), (error) => error.code === 'node-limit' && /10 nodes/.test(error.message));
  const elevated = await encodeBackup({ tree: tree(300), registry: new Map(), mapName: 'Elevated', cryptoApi: globalThis.crypto, limits: { maxNodes: 1000 } });
  await assert.rejects(() => encodeBackup({ tree: tree(301), registry: new Map(), mapName: 'Elevated+', cryptoApi: globalThis.crypto, limits: { maxNodes: 1000 } }), (error) => error.code === 'node-limit' && /300 nodes/.test(error.message));
  for (const maxNodes of [0, NaN, '300']) {
    await assert.rejects(() => encodeBackup({ tree: tree(1), registry: new Map(), mapName: 'Bad', cryptoApi: globalThis.crypto, limits: { maxNodes } }), (error) => error.code === 'invalid-node-limit');
  }
  await assert.rejects(() => decodeBackup(elevated.blob, { cryptoApi: globalThis.crypto, limits: { maxNodes: 299 } }), (error) => error.code === 'node-limit');
  const decoded = await decodeBackup(elevated.blob, { cryptoApi: globalThis.crypto, limits: { maxNodes: 1000 } });
  assert.equal(decoded.manifest.nodeCount, 300);
});

test('backup preserves one attachment payload at the 300-node boundary', async () => {
  const attachmentRegistry = createAttachmentRegistry({ datasetToken: 2 });
  const file = new File([new Uint8Array([1, 2, 3, 4])], 'note.txt', { type: 'text/plain' });
  const staged = attachmentRegistry.stage(file, classification);
  attachmentRegistry.commit(staged.id);
  const t = tree(300);
  t.children[0].data = {
    dataType: 'file', description: 'note', attachmentId: staged.id,
    originalName: 'note.txt', sizeBytes: 4, mime: 'text/plain', classification
  };
  const encoded = await encodeBackup({ tree: t, registry: attachmentRegistry, mapName: 'With attachment', cryptoApi: globalThis.crypto });
  const decoded = await decodeBackup(encoded.blob, { cryptoApi: globalThis.crypto });
  assert.equal(count(decoded.tree), 300);
  assert.equal(decoded.attachments.length, 1);
  assert.deepEqual(Array.from(new Uint8Array(await decoded.attachments[0].blob.arrayBuffer())), [1, 2, 3, 4]);
});

test('recovery snapshot admission and actual-count checks stay free-bound', async () => {
  const at300 = tree(300);
  const built = await buildRecoverySnapshot({
    tree: at300, registry: new Map(), datasetToken: 1, capturedRevision: 0,
    workspaceId: createRecoveryWorkspaceId(), allocateAttachmentId: createAttachmentId,
    cryptoApi: globalThis.crypto
  });
  assert.equal(built.nodeCount, 300);
  await assert.rejects(() => buildRecoverySnapshot({
    tree: tree(301), registry: new Map(), datasetToken: 1, capturedRevision: 0,
    workspaceId: createRecoveryWorkspaceId(), allocateAttachmentId: createAttachmentId,
    cryptoApi: globalThis.crypto
  }), (error) => error.code === 'node-limit' && /300 nodes/.test(error.message));
  const lower = await buildRecoverySnapshot({
    tree: tree(10), registry: new Map(), datasetToken: 1, capturedRevision: 0,
    workspaceId: createRecoveryWorkspaceId(), allocateAttachmentId: createAttachmentId,
    cryptoApi: globalThis.crypto, limits: { maxNodes: 10 }
  });
  assert.equal(lower.nodeCount, 10);
  await assert.rejects(() => buildRecoverySnapshot({
    tree: tree(11), registry: new Map(), datasetToken: 1, capturedRevision: 0,
    workspaceId: createRecoveryWorkspaceId(), allocateAttachmentId: createAttachmentId,
    cryptoApi: globalThis.crypto, limits: { maxNodes: 10 }
  }), (error) => error.code === 'node-limit');
  const elevated = await buildRecoverySnapshot({
    tree: tree(300), registry: new Map(), datasetToken: 1, capturedRevision: 0,
    workspaceId: createRecoveryWorkspaceId(), allocateAttachmentId: createAttachmentId,
    cryptoApi: globalThis.crypto, limits: { maxNodes: 1000 }
  });
  assert.equal(elevated.nodeCount, 300);
  await assert.rejects(() => buildRecoverySnapshot({
    tree: tree(301), registry: new Map(), datasetToken: 1, capturedRevision: 0,
    workspaceId: createRecoveryWorkspaceId(), allocateAttachmentId: createAttachmentId,
    cryptoApi: globalThis.crypto, limits: { maxNodes: 1000 }
  }), (error) => error.code === 'node-limit');
  const forged = { ...built, nodeCount: 299 };
  await assert.rejects(() => ownValidatedRecoverySnapshot(forged, { cryptoApi: globalThis.crypto }), (error) => error.code === 'recovery-node-count-mismatch');
  for (const maxNodes of [0, NaN, '300']) {
    await assert.rejects(() => buildRecoverySnapshot({
      tree: tree(1), registry: new Map(), datasetToken: 1, capturedRevision: 0,
      workspaceId: createRecoveryWorkspaceId(), allocateAttachmentId: createAttachmentId,
      cryptoApi: globalThis.crypto, limits: { maxNodes }
    }), (error) => error.code === 'invalid-node-limit');
  }
});

test('runtime reconstruction uses the free boundary and rejects invalid/lower budgets', () => {
  const t = tree(300);
  const runtime = reconstructSavedMapRuntime({ loaded: loaded(t), datasetToken: 1, viewport: { width: 1600, height: 1000 }, baseRadiusCss: 420, maxNodes: 1000 });
  assert.equal(runtime.nodeCount, 300);
  assert.equal(runtime.tree.children.length, 299);
  assert.throws(() => reconstructSavedMapRuntime({ loaded: loaded(t), datasetToken: 1, viewport: { width: 1600, height: 1000 }, baseRadiusCss: 420, maxNodes: 299 }), /node/i);
  assert.throws(() => reconstructSavedMapRuntime({ loaded: loaded(tree(301)), datasetToken: 1, viewport: { width: 1600, height: 1000 }, baseRadiusCss: 420, maxNodes: 1000 }), (error) => error.code === 'node-limit');
  assert.throws(() => reconstructSavedMapRuntime({ loaded: loaded(t), datasetToken: 1, viewport: { width: 1600, height: 1000 }, baseRadiusCss: 420, maxNodes: 0 }), (error) => error.code === 'invalid-node-limit');
});



