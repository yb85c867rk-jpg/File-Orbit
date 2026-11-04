import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
import { createPcRuntimeAccess } from '../../../src/app/pc/runtime-access.js';
import { buildSaveSnapshot } from '../../../src/engine/hypertree/persistence/index.js';
import { createAttachmentRegistry } from '../../../src/engine/hypertree/editor/attachments.js';
import { decodeBackup } from '../../../src/engine/hypertree/persistence/backup.js';
import { FREE_POLICY_CONTEXT } from '../../../src/engine/hypertree/edition/index.js';
const main = readFileSync(new URL('../../harness/m5-exploration/main.mjs', import.meta.url), 'utf8');
const treeFor = (name) => ({ id: 'root', name, kind: 'folder', data: {}, children: [] });
test('Stage 3J-2A actual main routes toolbar and serialization through runtime access', () => {
  assert.equal((main.match(/createHistoryToolbarController\(/g) || []).length, 2);
  assert.equal((main.match(/createHistoryToolbarController\(\{[\s\S]{0,240}?runtimeAccess\.history\(\)/g) || []).length, 2);
  assert.equal((main.match(/createHistoryToolbarController\(\{[\s\S]{0,300}?runtimeAccess\.move\(direction\)/g) || []).length, 2);
  assert.equal((main.match(/runtimeAccess\.serializationState\(\)/g) || []).length, 2);
  assert.match(main, /downloadBackup[\s\S]*?runtimeAccess\.serializationState\(\)[\s\S]*?encodeBackup\(\{ tree: source\.tree, registry: source\.registry/);
  assert.match(main, /async function saveCurrentDocument[\s\S]*?runtimeAccess\.serializationState\(\)[\s\S]*?encodeBackup\(\{ tree: source\.tree, registry: source\.registry/);
  assert.match(main, /snapshotCopyAttachments[\s\S]*?encodeBackup\(\{ tree: snapshot\.tree, registry: snapshot\.registry/);
  assert.match(main, /prepared = await encodeBackup\(\{ tree: preview\.tree, registry: preview\.registry/);
});
test('Stage 3J-2A snapshot maps live revision to capturedRevision and ignores caller state', () => {
  let tree = treeFor('A'); let registry = createAttachmentRegistry({ datasetToken: 1 }); let revision = 4;
  const access = createPcRuntimeAccess({ getTree: () => tree, getRegistry: () => registry, getRevision: () => revision, getHistory: () => ({ undo: [], redo: [] }), advanceRevision: () => ++revision, historyMove: () => ({ ok: true }), buildSnapshot: buildSaveSnapshot, disposeRuntime: () => {} });
  const snapshot = access.snapshot({ datasetToken: 1, policyContext: FREE_POLICY_CONTEXT }); assert.equal(snapshot.capturedRevision, 4); assert.equal(snapshot.tree.name, 'A');
  const stale = access.snapshot({ datasetToken: 1, policyContext: FREE_POLICY_CONTEXT, capturedRevision: 0, tree: treeFor('WRONG'), registry: createAttachmentRegistry({ datasetToken: 1 }) }); assert.equal(stale.capturedRevision, 4); assert.equal(stale.tree.name, 'A');
  tree = treeFor('B'); registry = createAttachmentRegistry({ datasetToken: 2 }); revision = 5; const next = access.snapshot({ datasetToken: 1, policyContext: FREE_POLICY_CONTEXT }); assert.equal(next.tree.name, 'B'); assert.equal(next.capturedRevision, 5);
});
test('Stage 3J-2A encoding uses live state, succeeds with valid input, and rejects invalid input explicitly', async () => {
  let tree = treeFor('Encoded'); let registry = createAttachmentRegistry({ datasetToken: 1 });
  const access = createPcRuntimeAccess({ getTree: () => tree, getRegistry: () => registry, getRevision: () => 1, getHistory: () => ({ undo: [], redo: [] }), advanceRevision: () => 2, historyMove: () => ({ ok: true }), buildSnapshot: buildSaveSnapshot, disposeRuntime: () => {} });
  const pack = await access.encode({ mapName: 'Encoded', policyContext: FREE_POLICY_CONTEXT }); assert.ok(pack.blob); const decoded = await decodeBackup(pack.blob, { policyContext: FREE_POLICY_CONTEXT }); assert.equal(decoded.tree.name, 'Encoded');
  registry = null; await assert.rejects(() => access.encode({ mapName: 'Fail', policyContext: FREE_POLICY_CONTEXT }));
});
