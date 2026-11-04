import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { createHash } from 'node:crypto';
import { FakeIndexedDB } from '../persistence/fake-indexeddb.mjs';
import { buildSaveSnapshot, createPersistenceRepository, buildRecoverySnapshot, createRestoredAttachmentRegistry } from '../../../src/engine/hypertree/persistence/index.js';
import { createAttachmentRegistry } from '../../../src/engine/hypertree/editor/attachments.js';
import { countTreeNodes } from '../../../src/engine/hypertree/editor/validation.js';
import { FREE_POLICY_CONTEXT } from '../../../src/engine/hypertree/edition/index.js';
import { PAID_TEST_CONTEXT } from '../../helpers/stage3a-paid-context.mjs';
import { SHAPES, buildFixture } from '../../../analysis/stage2a/fixtures.mjs';
import { buildLodFixture } from '../../../analysis/stage3d/fixture.mjs';
import { createEditableLodRuntime } from '../../../src/engine/hypertree/editor/runtime/index.js';
const viewport = { width: 1280, height: 800 };
const ids = (root) => { const out = []; const walk = (n) => { out.push(n.id); for (const c of n.children || []) walk(c); }; walk(root); return out; };
const firstFile = (root) => { let found = null; const walk = (n) => { if (found) return; if (n.id !== root.id) { found = n; return; } for (const c of n.children || []) walk(c); }; walk(root); return found; };
const repoFor = (factory, name, context) => createPersistenceRepository({ indexedDB: factory, dbName: name, policyContext: context });
const snap = (tree, context, registry = new Map()) => buildSaveSnapshot({ tree, registry, datasetToken: 1, capturedRevision: 0, policyContext: context });
const simpleTree = (count) => ({ id: 'root', name: 'root', kind: 'folder', data: {}, children: Array.from({ length: count - 1 }, (_, i) => ({ id: `n${i}`, name: `node-${i}.txt`, kind: 'file', data: { description: `d${i}` }, children: [] })) });

test('Stage 3H all five fixtures at 300/1,000: rename, delete, undo, redo with exact IDs', async () => {
  for (const count of [300, 1000]) {
    const context = count === 300 ? FREE_POLICY_CONTEXT : PAID_TEST_CONTEXT;
    for (const shape of SHAPES) {
      const factory = new FakeIndexedDB(); const repo = repoFor(factory, `s3h-${shape}-${count}`, context);
      const tree = buildFixture(shape, count); const before = JSON.stringify(tree); const beforeIds = ids(tree);
      const saved = await repo.save(snap(tree, context)); const loaded = await repo.load(saved.mapId);
      const runtime = createEditableLodRuntime({ loaded, datasetToken: 1, viewport, policyContext: context });
      assert.equal(runtime.tree.id, 'root'); assert.deepEqual(ids(runtime.tree), beforeIds);
      const target = firstFile(runtime.tree); assert.ok(target, shape);
      const rename = runtime.prepare('rename', { targetId: target.id, draftName: '변경된-이름.txt' });
      assert.equal(rename.ok, true);
      const committed = runtime.commit(rename); assert.equal(committed.ok, true); assert.equal(runtime.dirty, true); assert.equal(runtime.revision, 1);
      assert.equal(JSON.stringify(tree), before, 'source tree unchanged');
      assert.ok(runtime.model.documentRecord(target.id));
      const undo = runtime.undo(); assert.equal(undo.ok, true, JSON.stringify(undo)); assert.equal(runtime.model.documentRecord(target.id).node.name, target.name);
      const redo = runtime.redo(); assert.equal(redo.ok, true, JSON.stringify(redo)); assert.equal(runtime.model.documentRecord(target.id).node.name, '변경된-이름.txt');
      const del = runtime.prepare('delete', { targetId: target.id }); assert.equal(del.ok, true);
      const deleted = runtime.commit(del); assert.equal(deleted.ok, true); assert.equal(runtime.model.documentRecord(target.id), null);
      const undoDelete = runtime.undo(); assert.equal(undoDelete.ok, true, JSON.stringify(undoDelete)); assert.ok(runtime.model.documentRecord(target.id)); assert.equal(runtime.model.documentRecord(target.id).node.name, '변경된-이름.txt');
      assert.deepEqual(ids(runtime.tree), beforeIds, 'undo restores exact IDs');
      assert.equal(runtime.redo().ok, true); assert.equal(runtime.undo().ok, true); assert.equal(runtime.redo().ok, true); assert.equal(runtime.undo().ok, true);
      runtime.dispose(); assert.throws(() => runtime.scene());
    }
  }
});

test('Stage 3H add boundary 299→300/999→1,000 and rejection without mutation', async () => {
  for (const [count, context] of [[299, FREE_POLICY_CONTEXT], [999, PAID_TEST_CONTEXT]]) {
    const factory = new FakeIndexedDB(); const repo = repoFor(factory, `s3h-add-${count}`, context);
    const loaded = await repo.load((await repo.save(snap(simpleTree(count), context))).mapId);
    const runtime = createEditableLodRuntime({ loaded, datasetToken: 1, viewport, policyContext: context });
    const original = JSON.stringify(runtime.tree);
    const add = runtime.prepare('add', { parentId: 'root', kind: 'folder', draftName: '새-폴더' }); assert.equal(add.ok, true);
    assert.equal(runtime.commit(add).ok, true); assert.equal(runtime.tree.children.length, count);
    const blocked = runtime.prepare('add', { parentId: 'root', kind: 'folder', draftName: '너무-많음' });
    assert.equal(blocked.ok, false); assert.equal(blocked.reason, 'editor-node-limit');
    assert.equal(runtime.undo().ok, true);
    assert.equal(JSON.stringify(runtime.tree), original);
    runtime.dispose();
  }
});

test('Stage 3H delete subtree with attachments/empty folder, Undo restores exact metadata and SHA', async () => {
  const factory = new FakeIndexedDB(); const repo = repoFor(factory, 's3h-attachments', FREE_POLICY_CONTEXT);
  const registry = createAttachmentRegistry({ datasetToken: 1 });
  const fixture = buildLodFixture(300, registry, File);
  const saved = await repo.save(buildSaveSnapshot({ tree: fixture.tree, registry, datasetToken: 1, capturedRevision: 0, policyContext: FREE_POLICY_CONTEXT }));
  const loaded = await repo.load(saved.mapId);
  const runtime = createEditableLodRuntime({ loaded, datasetToken: 1, viewport, policyContext: FREE_POLICY_CONTEXT });
  const docsBefore = JSON.stringify(runtime.model.documentRecord('folder-docs').node);
  const hashes = new Map();
  for (const a of loaded.attachments) hashes.set(a.attachmentId, createHash('sha256').update(Buffer.from(await a.blob.arrayBuffer())).digest('hex'));
  const remove = runtime.prepare('delete', { targetId: 'folder-docs' }); assert.equal(remove.ok, true);
  assert.equal(runtime.commit(remove).ok, true); assert.equal(runtime.model.documentRecord('folder-docs'), null);
  const undo = runtime.undo(); assert.equal(undo.ok, true, JSON.stringify(undo));
  assert.equal(JSON.stringify(runtime.model.documentRecord('folder-docs').node), docsBefore);
  for (const a of loaded.attachments) assert.equal(hashes.get(a.attachmentId), createHash('sha256').update(Buffer.from(await a.blob.arrayBuffer())).digest('hex'));
  runtime.dispose();
});

test('Stage 3H stale transaction/render failure/history branch preserve live state', async () => {
  const factory = new FakeIndexedDB(); const repo = repoFor(factory, 's3h-stale', PAID_TEST_CONTEXT);
  const loaded = await repo.load((await repo.save(snap(simpleTree(300), PAID_TEST_CONTEXT))).mapId);
  const runtime = createEditableLodRuntime({ loaded, datasetToken: 1, viewport, policyContext: PAID_TEST_CONTEXT });
  const before = JSON.stringify(runtime.tree);
  const first = runtime.prepare('rename', { targetId: 'n0', draftName: '첫번째.txt' });
  const second = runtime.prepare('rename', { targetId: 'n0', draftName: '두번째.txt' });
  assert.equal(runtime.commit(first).ok, true);
  const stale = runtime.commit(second); assert.equal(stale.ok, false); assert.equal(stale.reason, 'stale-revision');
  assert.equal(runtime.model.documentRecord('n0').node.name, '첫번째.txt'); assert.equal(JSON.stringify(loaded.document.tree), before, 'loaded source clean');
  assert.equal(runtime.undo().ok, true);
  const branch = runtime.prepare('rename', { targetId: 'n1', draftName: '분기.txt' }); assert.equal(runtime.commit(branch).ok, true); assert.equal(runtime.redoCount, 0, 'new command clears redo branch');
  const badRuntime = createEditableLodRuntime({ loaded, datasetToken: 1, viewport, policyContext: PAID_TEST_CONTEXT, candidateHostFactory: () => ({}) });
  const failed = badRuntime.prepare('rename', { targetId: 'n1', draftName: '실패.txt' });
  assert.equal(failed.ok, false, JSON.stringify(failed));
  badRuntime.dispose();
  runtime.dispose();
});

test('Stage 3H save/reopen and recovery round trips after edit', async () => {
  const factory = new FakeIndexedDB(); const repo = repoFor(factory, 's3h-save', PAID_TEST_CONTEXT);
  const loaded = await repo.load((await repo.save(snap(simpleTree(300), PAID_TEST_CONTEXT))).mapId);
  const runtime = createEditableLodRuntime({ loaded, datasetToken: 1, viewport, policyContext: PAID_TEST_CONTEXT });
  const rename = runtime.prepare('rename', { targetId: 'n0', draftName: '저장-이름.txt' }); assert.equal(runtime.commit(rename).ok, true);
  const restored = createRestoredAttachmentRegistry({ attachments: loaded.attachments, datasetToken: 1 }); const identityMapping = new Map(loaded.attachments.map((a) => [a.attachmentId, a.attachmentId]));
  const snapshot = buildSaveSnapshot({ tree: runtime.tree, registry: restored.registry, mapping: identityMapping, datasetToken: 1, capturedRevision: 0, mapId: loaded.map.mapId, expectedGeneration: loaded.map.generation, policyContext: PAID_TEST_CONTEXT });
  const saved = await repo.save(snapshot); const reopened = await repo.load(saved.mapId);
  assert.equal(reopened.map.mapId, loaded.map.mapId); assert.equal(reopened.map.generation, loaded.map.generation + 1);
  assert.equal(reopened.document.tree.children[0].name, '저장-이름.txt');
  const ws = await repo.createRecoveryWorkspace({ origin: 'stage3h' });
  const recovery = await buildRecoverySnapshot({ tree: runtime.tree, registry: restored.registry, workspaceId: ws.workspace.workspaceId, capturedRevision: 3, datasetToken: 1, policyContext: PAID_TEST_CONTEXT });
  const checkpoint = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspace.workspaceId, workspaceToken: ws.workspace.workspaceToken, expectedControlVersion: ws.workspace.controlVersion, snapshot: recovery });
  const recovered = await repo.loadRecoveryCheckpoint(ws.workspace.workspaceId);
  assert.equal(recovered.checkpoint.nodeCount, runtime.tree.children.length + 1); assert.equal(recovered.checkpoint.checkpointGeneration, checkpoint.checkpoint.generation ?? checkpoint.generation);
  runtime.dispose();
});






test('Stage 3H transactions are runtime-owned, single-use, non-forgeable, and cancellation-safe', async () => {
  const factory = new FakeIndexedDB();
  const paidRepo = createPersistenceRepository({ indexedDB: factory, dbName: 's3h-owned-paid', policyContext: PAID_TEST_CONTEXT });
  const freeRepo = createPersistenceRepository({ indexedDB: new FakeIndexedDB(), dbName: 's3h-owned-free', policyContext: FREE_POLICY_CONTEXT });
  const paidLoaded = await paidRepo.load((await paidRepo.save(snap(simpleTree(500), PAID_TEST_CONTEXT))).mapId);
  const freeLoaded = await freeRepo.load((await freeRepo.save(snap(simpleTree(20), FREE_POLICY_CONTEXT))).mapId);
  const paid = createEditableLodRuntime({ loaded: paidLoaded, datasetToken: 1, viewport, policyContext: PAID_TEST_CONTEXT });
  const free = createEditableLodRuntime({ loaded: freeLoaded, datasetToken: 1, viewport, policyContext: FREE_POLICY_CONTEXT });
  const foreignHandle = paid.prepare('rename', { targetId: 'n0', draftName: 'paid-only.txt' });
  const rejected = free.commit(foreignHandle);
  assert.equal(rejected.ok, false); assert.equal(rejected.reason, 'foreign-transaction');
  assert.equal(free.tree.children.length, 19); assert.equal(free.loaded.map.mapId, freeLoaded.map.mapId);
  assert.equal(paid.commit(foreignHandle).ok, true);
  assert.equal(paid.model.documentRecord('n0').node.name, 'paid-only.txt');
  const replay = paid.commit(foreignHandle);
  assert.equal(replay.ok, false); assert.equal(replay.reason, 'consumed-transaction');
  assert.equal(paid.scene().items.length > 0, true, 'duplicate commit must not dispose live bridge');
  assert.equal(paid.commit({ ok: true }).reason, 'foreign-transaction');
  const cancelled = paid.prepare('rename', { targetId: 'n1', draftName: 'cancelled.txt' });
  assert.equal(paid.cancel(cancelled), true);
  assert.equal(paid.commit(cancelled).reason, 'consumed-transaction');
  assert.equal(paid.model.documentRecord('n1').node.name, 'node-1.txt');
  const pending = paid.prepare('rename', { targetId: 'n2', draftName: 'pending.txt' });
  paid.dispose(); assert.equal(paid.commit(pending).ok, false); assert.equal(free.scene().items.length > 0, true);
  free.dispose();
});

test('Stage 3H no-op commands commit successfully without revision, dirty, history, or bridge work', async () => {
  const factory = new FakeIndexedDB(); const repo = createPersistenceRepository({ indexedDB: factory, dbName: 's3h-noop', policyContext: FREE_POLICY_CONTEXT });
  const loaded = await repo.load((await repo.save(snap(simpleTree(300), FREE_POLICY_CONTEXT))).mapId);
  const runtime = createEditableLodRuntime({ loaded, datasetToken: 1, viewport, policyContext: FREE_POLICY_CONTEXT });
  for (const [kind, args] of [
    ['rename', { targetId: 'n0', draftName: 'node-0.txt' }],
    ['metadata', { targetId: 'n0', description: 'd0', link: null, linkProvided: false }],
    ['edit-folder', { targetId: 'root', draftName: 'root', draftDescription: null }],
    ['edit-data', { targetId: 'n0', draftName: 'node-0.txt', description: 'd0', link: null, linkProvided: false }]
  ]) {
    const before = { revision: runtime.revision, dirty: runtime.dirty, undo: runtime.undoCount };
    const handle = runtime.prepare(kind, args); assert.equal(handle.ok, true); assert.equal(handle.noop, true);
    const committed = runtime.commit(handle); assert.equal(committed.ok, true); assert.equal(committed.noop, true);
    assert.equal(runtime.revision, before.revision); assert.equal(runtime.dirty, before.dirty); assert.equal(runtime.undoCount, before.undo);
    assert.equal(runtime.scene().items.length > 0, true);
  }
  runtime.dispose();
});

test('Stage 3H reconciles cluster/selected state at 41→40 and back', async () => {
  const factory = new FakeIndexedDB(); const repo = createPersistenceRepository({ indexedDB: factory, dbName: 's3h-cluster-boundary', policyContext: FREE_POLICY_CONTEXT });
  const tree = { id: 'root', name: 'root', kind: 'folder', data: {}, children: Array.from({ length: 41 }, (_, i) => ({ id: `n${i}`, name: `n${i}.txt`, kind: 'file', data: {}, children: [] })) };
  const loaded = await repo.load((await repo.save(snap(tree, FREE_POLICY_CONTEXT))).mapId);
  const runtime = createEditableLodRuntime({ loaded, datasetToken: 1, viewport, policyContext: FREE_POLICY_CONTEXT });
  const lastProxy = runtime.bridge.proxyIds.at(-1); runtime.bridge.expandCluster(lastProxy);
  const member = runtime.scene().items[0].id; runtime.select(member);
  const remove = runtime.prepare('delete', { targetId: member }); assert.equal(remove.ok, true, JSON.stringify(remove));
  assert.equal(runtime.commit(remove).ok, true); assert.equal(runtime.tree.children.length, 40); assert.equal(runtime.scene().mode, 'folder');
  assert.equal(runtime.undo().ok, true); assert.equal(runtime.tree.children.length, 41); assert.equal(runtime.scene().mode, 'cluster');
  assert.equal(runtime.redo().ok, true); assert.equal(runtime.tree.children.length, 40);
  runtime.dispose();
});

test('Stage 3H new file add requires payload, previews, Undo/Redo, save/reopen and recovery with SHA', async () => {
  const factory = new FakeIndexedDB(); const repo = createPersistenceRepository({ indexedDB: factory, dbName: 's3h-attach-add', policyContext: PAID_TEST_CONTEXT });
  const registry = createAttachmentRegistry({ datasetToken: 1 }); const fixture = buildLodFixture(300, registry, File);
  const loaded = await repo.load((await repo.save(buildSaveSnapshot({ tree: fixture.tree, registry, datasetToken: 1, capturedRevision: 0, policyContext: PAID_TEST_CONTEXT }))).mapId);
  const runtime = createEditableLodRuntime({ loaded, datasetToken: 1, viewport, policyContext: PAID_TEST_CONTEXT });
  const bytes = new TextEncoder().encode('new payload'); const meta = { attachmentId: 'att_new_stage3h', originalName: 'new.txt', sizeBytes: bytes.length, mime: 'text/plain', classification: { format: 'text', badge: 'TXT', mime: 'text/plain', needsReview: false } };
  const missing = runtime.prepare('add', { parentId: 'folder-docs', kind: 'file', draftName: 'new.txt', draftDataType: 'file', draftAttachment: meta, draftDescription: 'desc' }); assert.equal(missing.ok, false); assert.equal(missing.reason, 'attachment-payload-required');
  const wrong = runtime.prepare('add', { parentId: 'folder-docs', kind: 'file', draftName: 'new.txt', draftDataType: 'file', draftAttachment: meta, draftDescription: 'desc', attachmentFile: new File([new Uint8Array(1)], 'new.txt', { type: 'text/plain' }) }); assert.equal(wrong.reason, 'attachment-size-mismatch');
  const add = runtime.prepare('add', { parentId: 'folder-docs', kind: 'file', draftName: 'new.txt', draftDataType: 'file', draftAttachment: meta, draftDescription: 'desc', attachmentFile: new File([bytes], 'new.txt', { type: 'text/plain' }) }); assert.equal(add.ok, true, JSON.stringify(add));
  assert.equal(runtime.commit(add).ok, true);
  const node = runtime.tree.children[1].children.at(-1); assert.equal(node.data.attachmentId, meta.attachmentId);
  const first = runtime.preview(node.id); assert.ok(first); assert.equal(await (await fetch(first.url)).text(), 'new payload');
  const digest = createHash('sha256').update(Buffer.from(await (await fetch(first.url)).arrayBuffer())).digest('hex');
  assert.equal(runtime.undo().ok, true); assert.equal(runtime.preview(node.id), null); assert.equal(runtime.redo().ok, true); assert.ok(runtime.preview(node.id));
  const restored = createRestoredAttachmentRegistry({ attachments: runtime.loaded.attachments, datasetToken: 1 }); const mapping = new Map(runtime.loaded.attachments.map((a) => [a.attachmentId, a.attachmentId]));
  const saved = await repo.save(buildSaveSnapshot({ tree: runtime.tree, registry: restored.registry, mapping, datasetToken: 1, capturedRevision: 0, mapId: runtime.loaded.map.mapId, expectedGeneration: runtime.loaded.map.generation, policyContext: PAID_TEST_CONTEXT }));
  const reopened = await repo.load(saved.mapId); const reread = createRestoredAttachmentRegistry({ attachments: reopened.attachments, datasetToken: 2 }); const record = reread.registry.get(meta.attachmentId); assert.ok(record); assert.equal(createHash('sha256').update(Buffer.from(await record.file.arrayBuffer())).digest('hex'), digest);
  const ws = await repo.createRecoveryWorkspace({ origin: 'stage3h' }); const recovery = await buildRecoverySnapshot({ tree: runtime.tree, registry: restored.registry, workspaceId: ws.workspace.workspaceId, capturedRevision: 4, datasetToken: 1, policyContext: PAID_TEST_CONTEXT }); const cp = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspace.workspaceId, workspaceToken: ws.workspace.workspaceToken, expectedControlVersion: ws.workspace.controlVersion, snapshot: recovery }); const rec = await repo.loadRecoveryCheckpoint(ws.workspace.workspaceId); assert.equal(rec.checkpoint.nodeCount, countTreeNodes(runtime.tree)); assert.equal(rec.checkpoint.checkpointGeneration, cp.checkpoint.checkpointGeneration);
  assert.equal(runtime.preview(node.id).url.slice(0, 5), 'blob:'); runtime.dispose();
});

test('Stage 3H installation/history/teardown failures obey the commit point', async () => {
  const factory = new FakeIndexedDB(); const repo = createPersistenceRepository({ indexedDB: factory, dbName: 's3h-failures', policyContext: FREE_POLICY_CONTEXT });
  const loaded = await repo.load((await repo.save(snap(simpleTree(300), FREE_POLICY_CONTEXT))).mapId);
  const faults = { historyPublish: true };
  const runtime = createEditableLodRuntime({ loaded, datasetToken: 1, viewport, policyContext: FREE_POLICY_CONTEXT, faults });
  const before = JSON.stringify(runtime.tree); const rev = runtime.revision; const dirty = runtime.dirty; const undo = runtime.undoCount;
  const edit = runtime.prepare('rename', { targetId: 'n0', draftName: 'history-fail.txt' });
  const failed = runtime.commit(edit); assert.equal(failed.ok, false); assert.equal(failed.reason, 'history-publish-failed');
  assert.equal(JSON.stringify(runtime.tree), before); assert.equal(runtime.loaded.document.tree.children[0].name, 'node-0.txt'); assert.equal(runtime.revision, rev); assert.equal(runtime.dirty, dirty); assert.equal(runtime.undoCount, undo);
  faults.historyPublish = false; faults.hostReplace = true;
  const install = runtime.prepare('rename', { targetId: 'n0', draftName: 'install-fail.txt' }); const installFail = runtime.commit(install); assert.equal(installFail.ok, false); assert.equal(installFail.reason, 'install-failed');
  assert.equal(JSON.stringify(runtime.tree), before); assert.equal(runtime.revision, rev); assert.equal(runtime.undoCount, undo);
  faults.hostReplace = false;
  const ok = runtime.prepare('rename', { targetId: 'n0', draftName: 'teardown.txt' }); runtime.bridge.dispose = () => { throw new Error('teardown failure'); }; const committed = runtime.commit(ok); assert.equal(committed.ok, true); assert.match(committed.teardownError, /teardown failure/); assert.equal(runtime.model.documentRecord('n0').node.name, 'teardown.txt'); assert.equal(runtime.revision, rev + 1); assert.equal(runtime.scene().items.length > 0, true);
  runtime.dispose();
});







test('Stage 3H Undo/Redo history failure is null-safe without DOM hosts', async () => {
  const factory = new FakeIndexedDB(); const repo = createPersistenceRepository({ indexedDB: factory, dbName: 's3h-undo-fail', policyContext: FREE_POLICY_CONTEXT });
  const loaded = await repo.load((await repo.save(snap(simpleTree(300), FREE_POLICY_CONTEXT))).mapId);
  const faults = { historyPublish: false };
  const runtime = createEditableLodRuntime({ loaded, datasetToken: 1, viewport, policyContext: FREE_POLICY_CONTEXT, faults });
  assert.equal(runtime.commit(runtime.prepare('rename', { targetId: 'n0', draftName: 'before-undo.txt' })).ok, true);
  const before = { rev: runtime.revision, dirty: runtime.dirty, undo: runtime.undoCount, redo: runtime.redoCount, json: JSON.stringify(runtime.tree) };
  faults.historyPublish = true;
  const undo = runtime.undo(); assert.equal(undo.ok, false); assert.equal(undo.reason, 'history-publish-failed');
  assert.equal(runtime.revision, before.rev); assert.equal(runtime.dirty, before.dirty); assert.equal(runtime.undoCount, before.undo); assert.equal(runtime.redoCount, before.redo); assert.equal(JSON.stringify(runtime.tree), before.json); assert.equal(runtime.scene().items.length > 0, true);
  faults.historyPublish = false; assert.equal(runtime.undo().ok, true); assert.equal(runtime.model.documentRecord('n0').node.name, 'node-0.txt');
  faults.historyPublish = true; const redo = runtime.redo(); assert.equal(redo.reason, 'history-publish-failed'); assert.equal(runtime.model.documentRecord('n0').node.name, 'node-0.txt'); assert.equal(runtime.scene().items.length > 0, true);
  runtime.dispose();
});

test('Stage 3H attachment ID collisions are rejected and explicit retained reuse is intentional', async () => {
  const factory = new FakeIndexedDB(); const repo = createPersistenceRepository({ indexedDB: factory, dbName: 's3h-attach-collision', policyContext: PAID_TEST_CONTEXT });
  const registry = createAttachmentRegistry({ datasetToken: 1 }); const fixture = buildLodFixture(300, registry, File);
  const loaded = await repo.load((await repo.save(buildSaveSnapshot({ tree: fixture.tree, registry, datasetToken: 1, capturedRevision: 0, policyContext: PAID_TEST_CONTEXT }))).mapId);
  const runtime = createEditableLodRuntime({ loaded, datasetToken: 1, viewport, policyContext: PAID_TEST_CONTEXT });
  const retained = loaded.attachments[0]; const meta = { attachmentId: retained.attachmentId, originalName: retained.metadata.originalName, sizeBytes: retained.metadata.sizeBytes, mime: retained.metadata.mime, classification: retained.metadata.classification };
  const baseline = { rev: runtime.revision, dirty: runtime.dirty, undo: runtime.undoCount, count: runtime.loaded.attachments.length, tree: JSON.stringify(runtime.tree) };
  const collision = runtime.prepare('add', { parentId: 'folder-docs', kind: 'file', draftName: 'collision.txt', draftDescription: 'x', draftDataType: 'file', draftAttachment: meta, attachmentFile: new File([new Uint8Array(retained.blob.size)], 'x.txt', { type: retained.metadata.mime }) });
  assert.equal(collision.ok, false); assert.equal(collision.reason, 'attachment-id-collision');
  assert.equal(runtime.revision, baseline.rev); assert.equal(runtime.dirty, baseline.dirty); assert.equal(runtime.undoCount, baseline.undo); assert.equal(runtime.loaded.attachments.length, baseline.count); assert.equal(JSON.stringify(runtime.tree), baseline.tree);
  const ambiguous = runtime.prepare('add', { parentId: 'folder-docs', kind: 'file', draftName: 'ambiguous.txt', draftDescription: 'x', draftDataType: 'file', draftAttachment: meta });
  assert.equal(ambiguous.reason, 'attachment-reference-required');
  const mismatch = runtime.prepare('add', { parentId: 'folder-docs', kind: 'file', draftName: 'mismatch.txt', draftDescription: 'x', draftDataType: 'file', draftAttachment: { ...meta, originalName: 'different.txt' }, reuseAttachment: true });
  assert.equal(mismatch.reason, 'attachment-mismatch');
  const reuse = runtime.prepare('add', { parentId: 'folder-docs', kind: 'file', draftName: 'reuse.txt', draftDescription: 'x', draftDataType: 'file', draftAttachment: meta, reuseAttachment: true }); assert.equal(reuse.ok, true, JSON.stringify(reuse));
  assert.equal(runtime.commit(reuse).ok, true); const reuseNode = runtime.tree.children[1].children.at(-1); assert.equal(reuseNode.data.attachmentId, retained.attachmentId);
  const preview = runtime.preview(reuseNode.id); assert.ok(preview); const digest = createHash('sha256').update(Buffer.from(await (await fetch(preview.url)).arrayBuffer())).digest('hex'); assert.equal(digest, createHash('sha256').update(Buffer.from(await retained.blob.arrayBuffer())).digest('hex'));
  assert.equal(runtime.undo().ok, true); assert.equal(runtime.redo().ok, true); assert.equal(runtime.preview(reuseNode.id).url.slice(0, 5), 'blob:');
  const distinctBytes = new TextEncoder().encode('distinct payload'); const distinctMeta = { attachmentId: 'att_distinct', originalName: 'distinct.txt', sizeBytes: distinctBytes.length, mime: 'text/plain', classification: { format: 'text', badge: 'TXT', mime: 'text/plain', needsReview: false } };
  const distinct = runtime.prepare('add', { parentId: 'folder-docs', kind: 'file', draftName: 'distinct.txt', draftDescription: 'x', draftDataType: 'file', draftAttachment: distinctMeta, attachmentFile: new File([distinctBytes], 'distinct.txt', { type: 'text/plain' }) }); assert.equal(distinct.ok, true, JSON.stringify(distinct)); assert.equal(runtime.commit(distinct).ok, true);
  const distinctNode = runtime.tree.children[1].children.at(-1); const dpreview = runtime.preview(distinctNode.id); assert.equal(await (await fetch(dpreview.url)).text(), 'distinct payload');
  runtime.dispose();
});


test('Stage 3I host configuration requires staging host for rendered runtimes', async () => {
  const factory = new FakeIndexedDB(); const repo = createPersistenceRepository({ indexedDB: factory, dbName: 's3i-host-config', policyContext: FREE_POLICY_CONTEXT });
  const loaded = await repo.load((await repo.save(snap(simpleTree(300), FREE_POLICY_CONTEXT))).mapId);
  assert.throws(() => createEditableLodRuntime({ loaded, datasetToken: 1, viewport, policyContext: FREE_POLICY_CONTEXT, host: {} }), /candidateHostFactory/);
  const modelOnly = createEditableLodRuntime({ loaded, datasetToken: 1, viewport, policyContext: FREE_POLICY_CONTEXT }); assert.equal(modelOnly.scene().items.length > 0, true); modelOnly.dispose();
});

test('Stage 3I attachment usage separates current and history retention and releases on eviction', async () => {
  const factory = new FakeIndexedDB(); const repo = createPersistenceRepository({ indexedDB: factory, dbName: 's3i-retention', policyContext: FREE_POLICY_CONTEXT });
  const registry = createAttachmentRegistry({ datasetToken: 1 }); const fixture = buildLodFixture(300, registry, File);
  const loaded = await repo.load((await repo.save(buildSaveSnapshot({ tree: fixture.tree, registry, datasetToken: 1, capturedRevision: 0, policyContext: FREE_POLICY_CONTEXT }))).mapId);
  const runtime = createEditableLodRuntime({ loaded, datasetToken: 1, viewport, policyContext: FREE_POLICY_CONTEXT });
  const initial = runtime.usage; assert.ok(initial.currentBytes > 0); assert.equal(initial.historyBytes, 0);
  const attachmentId = loaded.document.tree.children.find((c) => c.id === 'folder-docs').children[0].data.attachmentId; const beforeDeleteBytes = runtime.usage.currentBytes;
  assert.equal(runtime.commit(runtime.prepare('delete', { targetId: 'doc-0' })).ok, true);
  const deletedUsage = runtime.usage; assert.ok(deletedUsage.currentBytes < beforeDeleteBytes); assert.ok(deletedUsage.historyBytes > 0); assert.ok(runtime.loaded.attachments.some((a) => a.attachmentId === attachmentId));
  assert.equal(runtime.undo().ok, true); assert.ok(runtime.usage.currentBytes > deletedUsage.currentBytes);
  assert.equal(runtime.redo().ok, true);
  for (let i = 0; i < 20; i += 1) { const target = ['doc-1', 'doc-2', 'doc-3'][i % 3]; const tx = runtime.prepare('rename', { targetId: target, draftName: `evict-${i}.txt` }); assert.equal(tx.ok, true, JSON.stringify(tx)); assert.equal(runtime.commit(tx).ok, true); }
  assert.equal(runtime.undoCount, 20);
  assert.equal(runtime.loaded.attachments.some((a) => a.attachmentId === attachmentId), false, 'evicted history payload is released');
  const pendingFile = new File([new TextEncoder().encode('pending bytes')], 'pending.txt', { type: 'text/plain' }); const pendingMeta = { attachmentId: 'att_pending', originalName: 'pending.txt', sizeBytes: pendingFile.size, mime: 'text/plain', classification: { format: 'text', badge: 'TXT', mime: 'text/plain', needsReview: false } };
  const pending = runtime.prepare('add', { parentId: 'folder-docs', kind: 'file', draftName: 'pending.txt', draftDescription: 'pending', draftDataType: 'file', draftAttachment: pendingMeta, attachmentFile: pendingFile }); assert.equal(pending.ok, true); assert.ok(runtime.usage.pendingBytes > 0);
  assert.equal(runtime.cancel(pending), true); assert.equal(runtime.usage.pendingBytes, 0); assert.equal(runtime.loaded.attachments.some((a) => a.attachmentId === 'att_pending'), false);
  runtime.dispose();
});




