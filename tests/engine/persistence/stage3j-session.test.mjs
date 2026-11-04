import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { createHash } from 'node:crypto';
import { FakeIndexedDB } from './fake-indexeddb.mjs';
import { createPersistenceRepository, buildSaveSnapshot, createRestoredAttachmentRegistry } from '../../../src/engine/hypertree/persistence/index.js';
import { encodeBackup, decodeBackup } from '../../../src/engine/hypertree/persistence/backup.js';
import { createAttachmentRegistry } from '../../../src/engine/hypertree/editor/attachments.js';
import { FREE_POLICY_CONTEXT } from '../../../src/engine/hypertree/edition/index.js';
import { PAID_TEST_CONTEXT } from '../../helpers/stage3a-paid-context.mjs';
import { SHAPES, buildFixture } from '../../../analysis/stage2a/fixtures.mjs';
import { buildLodFixture } from '../../../analysis/stage3d/fixture.mjs';
import { createStage3JSession } from '../../../src/app/stage3j/session.js';
const viewport = { width: 900, height: 600 };
const repoFor = (name, context) => createPersistenceRepository({ indexedDB: new FakeIndexedDB(), dbName: name, policyContext: context });
const backupFor = async (tree, context, attachments = []) => {
  const registry = createAttachmentRegistry({ datasetToken: 1 });
  for (const a of attachments) registry.adopt(a);
  return (await encodeBackup({ tree, registry, mapName: 'Stage 3J', policyContext: context })).blob;
};
test('Stage 3J opens an existing .orbit file at free 300 and paid 1,000 for all five shapes', async () => {
  for (const [count, context] of [[300, FREE_POLICY_CONTEXT], [1000, PAID_TEST_CONTEXT]]) {
    for (const shape of SHAPES) {
      const repo = repoFor(`s3j-${shape}-${count}`, context); const session = createStage3JSession({ repository: repo, policyContext: context, datasetToken: 1, viewport });
      const blob = await backupFor(buildFixture(shape, count), context); const opened = await session.openBackup(blob, { name: `${shape}.orbit` });
      assert.equal(opened.ok, true, JSON.stringify(opened)); assert.equal(opened.mapId, session.current.mapId); assert.equal(session.current.runtime.tree.id, 'root');
      const saved = await session.saveAs({ name: `${shape}-saved` }); assert.equal(saved.ok, true); assert.equal(saved.fileName, `${shape}-saved.orbit`);
      session.close(); assert.equal(session.disposed, true);
    }
  }
});
test('Stage 3J picker cancellation/invalid file preserve the live document', async () => {
  const context = FREE_POLICY_CONTEXT; const repo = repoFor('s3j-cancel', context); const session = createStage3JSession({ repository: repo, policyContext: context, datasetToken: 1, viewport });
  assert.equal((await session.openBackup(await backupFor(buildFixture('flat', 300), context), { isCancelled: () => true })).reason, 'cancelled');
  assert.equal((await session.openBackup(await backupFor(buildFixture('flat', 300), context))).ok, true);
  const before = JSON.stringify(session.current.runtime.tree); const liveMap = session.current.mapId;
  const invalid = await session.openBackup(new Blob([new Uint8Array([1, 2, 3])], { type: 'application/octet-stream' })); assert.equal(invalid.ok, false);
  assert.equal(session.current.mapId, liveMap); assert.equal(JSON.stringify(session.current.runtime.tree), before);
  session.close();
});
test('Stage 3J save/reopen preserves exact topology, metadata, attachment bytes and identity', async () => {
  const context = PAID_TEST_CONTEXT; const repo = repoFor('s3j-roundtrip', context); const session = createStage3JSession({ repository: repo, policyContext: context, datasetToken: 1, viewport });
  const registry = createAttachmentRegistry({ datasetToken: 1 }); const fixture = buildLodFixture(300, registry, File); const attachments = [...registry.snapshot?.() || []]; const records = [];
  for (const id of attachmentIds(fixture.tree)) records.push(registry.get(id));
  const blob = (await encodeBackup({ tree: fixture.tree, registry, mapName: 'Round Trip', policyContext: context })).blob;
  const openRound = await session.openBackup(blob, { name: 'Round Trip' }); assert.equal(openRound.ok, true, JSON.stringify(openRound));
  const runtime = session.current.runtime; const doc1 = runtime.tree.children.find((c) => c.id === 'folder-docs').children[0];
  assert.equal(runtime.commit(runtime.prepare('rename', { targetId: doc1.id, draftName: '저장-후.txt' })).ok, true);
  assert.equal(runtime.commit(runtime.prepare('add', { parentId: 'folder-docs', kind: 'folder', draftName: '새-폴더' })).ok, true); assert.equal(runtime.undo().ok, true); assert.equal(runtime.redo().ok, true);
  const saved = await session.saveAs({ name: 'Round Trip Saved' }); assert.equal(saved.ok, true);
  const reopened = createStage3JSession({ repository: repoFor('s3j-roundtrip-2', context), policyContext: context, datasetToken: 1, viewport }); const opened = await reopened.openBackup(saved.blob, { name: 'Round Trip Saved' });
  assert.equal(opened.ok, true, JSON.stringify(opened)); assert.equal(opened.mapId, reopened.current.mapId); assert.equal(reopened.current.runtime.tree.children.find((c) => c.id === 'folder-docs').children[0].name, '저장-후.txt');
  const original = await runtime.loaded.attachments[0].blob.arrayBuffer(); const again = await reopened.current.runtime.loaded.attachments[0].blob.arrayBuffer();
  assert.equal(createHash('sha256').update(Buffer.from(original)).digest('hex'), createHash('sha256').update(Buffer.from(again)).digest('hex'));
  session.close(); reopened.close();
});
function attachmentIds(tree) { const out = []; const walk = (n) => { if (n.data?.attachmentId) out.push(n.data.attachmentId); for (const c of n.children || []) walk(c); }; walk(tree); return out; }







test('Stage 3J async save is bound to its originating document and never updates B', async () => {
  const context = FREE_POLICY_CONTEXT; const base = repoFor('s3j-save-owner', context); let release; const gate = new Promise((resolve) => { release = resolve; }); let delayed = false;
  const repository = { ...base, save: async (snapshot) => { if (delayed) await gate; return base.save(snapshot); } };
  const session = createStage3JSession({ repository, policyContext: context, datasetToken: 1, viewport });
  const a = await backupFor(buildFixture('flat', 300), context); const b = await backupFor(buildFixture('wide', 300), context);
  assert.equal((await session.openBackup(a, { name: 'A' })).ok, true); const docA = session.current;
  const loadedB = await repository.load((await repository.save((await import('../../../src/engine/hypertree/persistence/index.js')).buildSaveSnapshot({ tree: buildFixture('wide', 300), registry: createAttachmentRegistry({ datasetToken: 1 }), datasetToken: 1, capturedRevision: 0, policyContext: context }))).mapId); delayed = true;
  const savingA = session.save(); await Promise.resolve();
  session.switchDocument(loadedB); const docB = session.current; const generationB = docB.generation;
  release(); const completed = await savingA;
  assert.equal(completed.ok, false); assert.equal(completed.reason, 'stale-operation');
  assert.equal(session.current, docB); assert.equal(docB.generation, generationB); assert.equal(docA.generation, 1);
  session.close();
});

test('Stage 3J save completion after close or edits acknowledges only the captured revision', async () => {
  const context = FREE_POLICY_CONTEXT; const base = repoFor('s3j-save-close', context); let release; const gate = new Promise((resolve) => { release = resolve; }); let delayed = false;
  const repository = { ...base, save: async (snapshot) => { if (delayed) await gate; return base.save(snapshot); } };
  const session = createStage3JSession({ repository, policyContext: context, datasetToken: 1, viewport });
  assert.equal((await session.openBackup(await backupFor(buildFixture('flat', 300), context), { name: 'A' })).ok, true); delayed = true;
  const saving = session.save(); await Promise.resolve(); session.close(); release(); assert.equal((await saving).reason, 'stale-operation');
  const second = createStage3JSession({ repository, policyContext: context, datasetToken: 1, viewport }); assert.equal((await second.openBackup(await backupFor(buildFixture('flat', 300), context), { name: 'B' })).ok, true);
  let release2; const gate2 = new Promise((resolve) => { release2 = resolve; }); let delayed2 = false; const repo2 = { ...repository, save: async (snapshot) => { if (delayed2) await gate2; return base.save(snapshot); } }; second.close();
  const third = createStage3JSession({ repository: repo2, policyContext: context, datasetToken: 1, viewport }); assert.equal((await third.openBackup(await backupFor(buildFixture('balanced', 300), context), { name: 'C' })).ok, true); delayed2 = true;
  const pending = third.save(); await Promise.resolve(); const edited = third.current.runtime.commit(third.current.runtime.prepare('rename', { targetId: third.current.runtime.tree.id, draftName: '편집-중.txt' })); assert.equal(edited.ok, true, JSON.stringify(edited)); release2(); const done = await pending;
  assert.equal(done.ok, true); assert.equal(done.dirty, true); assert.equal(done.currentRevision, 1); assert.equal(third.isDirty, true);
  third.close();
});
function firstFileId(tree) { let id = null; const walk = (n) => { if (id) return; if (n.kind === 'file') { id = n.id; return; } for (const c of n.children || []) walk(c); }; walk(tree); return id; }






test('Stage 3J competing saves, conflict, and cancelled Save As preserve ownership', async () => {
  const context = FREE_POLICY_CONTEXT; const base = repoFor('s3j-compete', context); const session = createStage3JSession({ repository: base, policyContext: context, datasetToken: 1, viewport });
  assert.equal((await session.openBackup(await backupFor(buildFixture('flat', 300), context), { name: 'A' })).ok, true); const before = session.current.generation;
  const first = await session.save(); assert.equal(first.ok, true); const gen = session.current.generation;
  const external = await base.save((await import('../../../src/engine/hypertree/persistence/index.js')).buildSaveSnapshot({ tree: buildFixture('flat', 300), registry: createAttachmentRegistry({ datasetToken: 1 }), datasetToken: 1, capturedRevision: 0, mapId: session.current.mapId, expectedGeneration: gen, policyContext: context }));
  const conflict = await session.save(); assert.equal(conflict.ok, false); assert.equal(conflict.reason, 'stale-generation'); assert.equal(session.current.generation, gen);
  const cancelled = await session.saveAs({ name: 'cancelled', isCancelled: () => true }); assert.equal(cancelled.ok, false); assert.equal(cancelled.reason, 'backup-cancelled'); assert.equal(session.current.generation, gen);
  session.close();
});


test('Stage 3J overlapping save acknowledges the successful write and coalesces duplicate requests', async () => {
  const context = FREE_POLICY_CONTEXT; const base = repoFor('s3j-overlap', context); let release; const gate = new Promise((resolve) => { release = resolve; }); let delayed = false;
  const repository = { ...base, save: async (snapshot) => { const result = await base.save(snapshot); if (delayed) await gate; return result; } };
  const session = createStage3JSession({ repository, policyContext: context, datasetToken: 1, viewport });
  assert.equal((await session.openBackup(await backupFor(buildFixture('flat', 300), context), { name: 'A' })).ok, true); const mapId = session.current.mapId; delayed = true;
  const first = session.save(); const end = Date.now() + 3000; let stored; while (Date.now() < end) { stored = await base.load(mapId); if (stored.map.generation === 2) break; await new Promise((resolve) => setTimeout(resolve, 5)); }
  assert.equal(stored.map.generation, 2); const second = session.save(); release(); const [a, b] = await Promise.all([first, second]);
  assert.equal(a.ok, true); assert.equal(b.ok, true); assert.equal(session.current.generation, 2); assert.equal(session.current.baseline.generation, 2);
  const retry = await session.save(); assert.equal(retry.ok, true); assert.equal(session.current.generation, 3);
  session.close();
});

test('Stage 3J accepted switch invalidates an older pending Open completion', async () => {
  const context = FREE_POLICY_CONTEXT; const base = repoFor('s3j-stale-open', context); let release; const gate = new Promise((resolve) => { release = resolve; }); let delayed = false; let loadedSignal; const loadedAt = new Promise((resolve) => { loadedSignal = resolve; });
  const repository = { ...base, load: async (id) => { const result = await base.load(id); if (delayed) { delayed = false; loadedSignal(); await gate; } return result; } };
  const session = createStage3JSession({ repository, policyContext: context, datasetToken: 1, viewport });
  assert.equal((await session.openBackup(await backupFor(buildFixture('flat', 300), context), { name: 'A' })).ok, true);
  delayed = true;
  const openingC = session.openBackup(await backupFor(buildFixture('balanced', 300), context), { name: 'C' }); await loadedAt;
  const loadedB = await base.load((await base.save((await import('../../../src/engine/hypertree/persistence/index.js')).buildSaveSnapshot({ tree: buildFixture('wide', 300), registry: createAttachmentRegistry({ datasetToken: 1 }), datasetToken: 1, capturedRevision: 0, policyContext: context }))).mapId);
  const switched = session.switchDocument(loadedB); assert.equal(switched.mapId, session.current.mapId); const bRuntime = session.current.runtime; const bTree = JSON.stringify(session.current.runtime.tree);
  release(); const c = await openingC; assert.equal(c.ok, false); assert.equal(c.reason, 'stale-operation');
  assert.equal(session.current.runtime, bRuntime); assert.equal(JSON.stringify(session.current.runtime.tree), bTree); assert.equal(session.current.runtime.scene().items.length > 0, true);
  session.close();
});

test('Stage 3J switchDocument after close is rejected without runtime resurrection', async () => {
  const context = FREE_POLICY_CONTEXT; const base = repoFor('s3j-close-switch', context); const session = createStage3JSession({ repository: base, policyContext: context, datasetToken: 1, viewport }); const loadedB = await base.load((await base.save((await import('../../../src/engine/hypertree/persistence/index.js')).buildSaveSnapshot({ tree: buildFixture('wide', 300), registry: createAttachmentRegistry({ datasetToken: 1 }), datasetToken: 1, capturedRevision: 0, policyContext: context }))).mapId);
  session.close(); assert.equal(session.disposed, true); assert.equal(session.current, null); const result = session.switchDocument(loadedB);
  assert.equal(result.ok, false); assert.equal(result.reason, 'disposed-session'); assert.equal(session.current, null);
});


