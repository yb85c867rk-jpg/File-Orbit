import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { FakeIndexedDB } from './fake-indexeddb.mjs';
import {
  buildRecoverySnapshot,
  attachmentRefsFromSnapshot,
  buildSaveSnapshot,
  createPersistenceRepository,
  createRecoveryWorkspaceId,
  createRecoveryWorkspaceToken,
  createRecoveryCheckpointId,
  MAX_SAVED_ATTACHMENT_BYTES,
  MAX_SAVED_MAP_ATTACHMENT_BYTES,
  META_LIBRARY_USAGE,
  META_RECOVERY_USAGE,
  STORE_RECOVERY_ATTACHMENTS
} from '../../../src/engine/hypertree/persistence/index.js';
import { createAttachmentRegistry } from '../../../src/engine/hypertree/editor/attachments.js';

let sequence = 0;
const nextAttachmentId = () => `att_${String(++sequence).padStart(12, '0')}`;
const classification = { format: 'text', badge: 'TXT', needsReview: false };

function setup({ libraryHardCapBytes = 1024 * 1024 } = {}) {
  const factory = new FakeIndexedDB();
  const clock = { value: new Date('2026-01-01T00:00:00.000Z') };
  const repo = createPersistenceRepository({
    indexedDB: factory,
    dbName: `recovery-db-${++sequence}`,
    mapIdFactory: () => `map_${String(++sequence).padStart(12, '0')}`,
    libraryHardCapBytes,
    storageManager: null,
    now: () => clock.value
  });
  return { factory, repo, clock };
}

function fixtureTree(fileName = 'note.txt', bodies = ['hello'], repeated = false) {
  const registry = createAttachmentRegistry({ datasetToken: 1 });
  const children = [];
  let firstId = null;
  bodies.forEach((body, index) => {
    const nodeFileName = index === 0 ? fileName : 'copy-' + index + '.txt'; const file = new File([body], nodeFileName, { type: 'text/plain' });
    const staged = registry.stage(file, classification);
    registry.commit(staged.id);
    if (index === 0) firstId = staged.id;
    const node = {
      id: `file-${index}`, kind: 'file', name: index === 0 ? fileName : `copy-${index}.txt`,
      data: {
        dataType: 'file', description: `description ${index}`, link: null,
        attachmentId: staged.id, originalName: index === 0 ? fileName : `copy-${index}.txt`,
        sizeBytes: body.length, mime: 'text/plain', classification
      }
    };
    children.push(node);
  });
  if (repeated) children.push({ ...children[0], id: 'file-repeat', name: 'repeat.txt' });
  return { tree: { id: 'root', kind: 'folder', name: 'Recovery Map Ünïcode', children }, registry };
}

async function snapshotFor(workspaceId, { fileName = 'note.txt', bodies = ['hello'], repeated = false, revision = 1 } = {}) {
  const { tree, registry } = fixtureTree(fileName, bodies, repeated);
  return buildRecoverySnapshot({
    tree, registry, mapping: new Map(), datasetToken: 1,
    capturedRevision: revision, workspaceId,
    allocateAttachmentId: nextAttachmentId
  });
}

async function workspace(repo, extra = {}) {
  const workspaceId = createRecoveryWorkspaceId();
  const workspaceToken = createRecoveryWorkspaceToken();
  const created = await repo.createRecoveryWorkspace({ workspaceId, workspaceToken, ...extra });
  return { ...created.workspace, workspaceId, workspaceToken };
}

test('recovery workspace/checkpoint round trips exact tree, IDs, metadata and bytes', async () => {
  const { repo } = setup();
  const ws = await workspace(repo);
  const snapshot = await snapshotFor(ws.workspaceId, { bodies: ['hello', 'world'], repeated: true, revision: 12 });
  const saved = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, documentName: 'test.orbit', origin: 'new', snapshot });
  assert.equal(saved.ok, true);
  assert.equal(saved.generation, 1);
  const loaded = await repo.loadRecoveryCheckpoint(ws.workspaceId);
  assert.equal(loaded.checkpoint.checkpointGeneration, 1);
  assert.equal(loaded.checkpoint.capturedRevision, 12);
  assert.deepEqual(loaded.checkpoint.tree, snapshot.tree);
  assert.equal(loaded.checkpoint.attachmentCount, 2);
  assert.equal(loaded.attachments.length, 2);
  assert.equal(await loaded.attachments.find((row) => row.metadata.originalName === 'note.txt').blob.text(), 'hello');
  assert.equal(await loaded.attachments.find((row) => row.metadata.originalName === 'copy-1.txt').blob.text(), 'world');
  assert.deepEqual(loaded.attachments[0].sha256, snapshot.attachments[0].sha256);
  const candidates = await repo.listRecoveryCandidates();
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].checkpoint.checkpointId, saved.checkpoint.checkpointId);
  repo.close();
});

test('recovery checkpoint rejects stale controlVersion and writes no partial content', async () => {
  const { repo } = setup();
  const ws = await workspace(repo);
  const first = await snapshotFor(ws.workspaceId, { revision: 1 });
  const saved = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: first });
  const stale = await snapshotFor(ws.workspaceId, { bodies: ['new'], revision: 2 });
  await assert.rejects(() => repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: stale }), (error) => error.code === 'recovery-stale-owner');
  const loaded = await repo.loadRecoveryCheckpoint(ws.workspaceId);
  assert.equal(loaded.checkpoint.checkpointGeneration, saved.generation);
  assert.equal(await loaded.attachments[0].blob.text(), 'hello');
  repo.close();
});

test('recovery checkpoint can replace content and accounting stays exact', async () => {
  const { repo } = setup();
  const ws = await workspace(repo);
  const one = await snapshotFor(ws.workspaceId, { revision: 1 });
  const first = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: one });
  const two = await snapshotFor(ws.workspaceId, { bodies: ['new', 'copy'], revision: 2 });
  const second = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: first.workspace.controlVersion, snapshot: two });
  assert.equal(second.generation, 2);
  const loaded = await repo.loadRecoveryCheckpoint(ws.workspaceId);
  assert.equal(loaded.checkpoint.checkpointGeneration, 2);
  assert.deepEqual(loaded.attachments.map((row) => row.metadata.originalName).sort(), ['copy-1.txt', 'note.txt']);
  assert.equal((await repo.combinedUsage()).recoveryBytes, 7);
  repo.close();
});

test('discard tombstone prevents delayed recreation and preserves control row', async () => {
  const { repo } = setup();
  const ws = await workspace(repo);
  const snapshot = await snapshotFor(ws.workspaceId);
  const saved = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot });
  await repo.discardRecoveryWorkspace({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, ownerControlVersion: saved.workspace.controlVersion, expectedCheckpointGeneration: saved.generation, expectedCheckpointId: saved.checkpoint.checkpointId });
  await assert.rejects(() => repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: saved.workspace.controlVersion, snapshot }), (error) => error.code === 'recovery-tombstoned' || error.code === 'recovery-stale-owner');
  const record = await repo.loadRecoveryWorkspace(ws.workspaceId);
  assert.equal(record.state, 'discarded');
  assert.equal(record.activeCheckpointGeneration, null);
  assert.equal(await repo.loadRecoveryCheckpoint(ws.workspaceId).then((value) => value.checkpoint), null);
  assert.equal((await repo.combinedUsage()).recoveryBytes, 0);
  repo.close();
});

test('save reservations require exact issued identity and retire only covered generations', async () => {
  const { repo } = setup();
  const ws = await workspace(repo);
  const g1 = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: await snapshotFor(ws.workspaceId, { revision: 1 }) });
  const reservation = await repo.beginRecoverySave({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken });
  await assert.rejects(() => repo.retireRecoveryThrough({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, saveId: 'sv_fabricated', saveSequence: reservation.saveSequence }), (error) => error.code === 'recovery-save-mismatch');
  await assert.rejects(() => repo.retireRecoveryThrough({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, saveId: reservation.saveId, saveSequence: reservation.saveSequence + 1 }), (error) => error.code === 'recovery-save-mismatch');
  const retired = await repo.retireRecoveryThrough({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, saveId: reservation.saveId, saveSequence: reservation.saveSequence });
  assert.deepEqual(retired.retiredGenerations, [g1.generation]);
  assert.equal(retired.activeCheckpointGeneration, null);
  const duplicate = await repo.retireRecoveryThrough({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, saveId: reservation.saveId, saveSequence: reservation.saveSequence });
  assert.equal(duplicate.duplicate, true);
  const later = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: retired.workspace.controlVersion, snapshot: await snapshotFor(ws.workspaceId, { revision: 2 }) });
  assert.equal((await repo.loadRecoveryCheckpoint(ws.workspaceId)).checkpoint.checkpointGeneration, later.generation);
  repo.close();
});

test('source supersession rejects an advanced source generation and preserves newer content', async () => {
  const { repo } = setup();
  const ws = await workspace(repo);
  const g5 = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: await snapshotFor(ws.workspaceId, { revision: 5 }) });
  const claim = await repo.claimRecoverySource({ workspaceId: ws.workspaceId });
  const child = await repo.createRecoveryWorkspace({ forkedFrom: { workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, checkpointId: g5.checkpoint.checkpointId, checkpointGeneration: g5.generation }, claimId: claim.claimId });
  const childSnapshot = await snapshotFor(child.workspace.workspaceId, { bodies: ['child'], revision: 1 });
  const childSaved = await repo.saveRecoveryCheckpoint({ workspaceId: child.workspace.workspaceId, workspaceToken: child.workspace.workspaceToken, expectedControlVersion: child.workspace.controlVersion, snapshot: childSnapshot });
  const g6 = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: claim.controlVersion, snapshot: await snapshotFor(ws.workspaceId, { bodies: ['newer'], revision: 6 }) });
  const before = await repo.loadRecoveryCheckpoint(ws.workspaceId);
  const beforeAttachmentBytes = await before.attachments[0].blob.text();
  const beforeUsage = await repo.combinedUsage();
  await assert.rejects(() => repo.supersedeRecoverySource({ sourceWorkspaceId: ws.workspaceId, sourceWorkspaceToken: ws.workspaceToken, sourceCheckpointId: g5.checkpoint.checkpointId, sourceCheckpointGeneration: g5.generation, childWorkspaceId: child.workspace.workspaceId, childCheckpointGeneration: childSaved.generation }), (error) => error.code === 'recovery-source-advanced');
  const after = await repo.loadRecoveryCheckpoint(ws.workspaceId);
  assert.equal(after.checkpoint.checkpointGeneration, g6.generation);
  assert.deepEqual(after.checkpoint.tree, before.checkpoint.tree);
  assert.equal(await after.attachments[0].blob.text(), beforeAttachmentBytes);
  assert.deepEqual((await repo.combinedUsage()).recoveryBytes, beforeUsage.recoveryBytes);
  repo.close();
});

test('claims reject unexpired contention and allow an expired claim retry', async () => {
  const { repo, clock } = setup();
  const ws = await workspace(repo);
  await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: await snapshotFor(ws.workspaceId) });
  const first = await repo.claimRecoverySource({ workspaceId: ws.workspaceId, ttlMs: 60000 });
  await assert.rejects(() => repo.claimRecoverySource({ workspaceId: ws.workspaceId, ttlMs: 60000 }), (error) => error.code === 'recovery-claimed');
  clock.value = new Date(clock.value.getTime() + 120000);
  const second = await repo.claimRecoverySource({ workspaceId: ws.workspaceId, ttlMs: 60000 });
  assert.equal(second.ok, true);
  assert.notEqual(second.claimId, first.claimId);
  await repo.releaseRecoveryClaim({ workspaceId: ws.workspaceId, claimId: second.claimId });
  repo.close();
});
test('genuine v1 database upgrades additively and preserves original records/settings', async () => {
  const factory = new FakeIndexedDB();
  const dbName = 'genuine-v1-upgrade';
  const registry = createAttachmentRegistry({ datasetToken: 1 });
  const staging = registry.stage(new File(['legacy'], 'legacy.txt', { type: 'text/plain' }), classification);
  registry.commit(staging.id);
  const tree = { id: 'legacy-root', kind: 'folder', name: 'Legacy Map', children: [{ id: 'legacy-file', kind: 'file', name: 'legacy.txt', data: { dataType: 'file', description: null, link: null, attachmentId: staging.id, originalName: 'legacy.txt', sizeBytes: 6, mime: 'text/plain', classification } }] };
  const legacySnapshot = buildSaveSnapshot({ tree, registry, mapId: 'map_legacy_0001', expectedGeneration: 1, datasetToken: 1, capturedRevision: 1, allocateAttachmentId: nextAttachmentId });
  const raw = await new Promise((resolve, reject) => {
    const request = factory.open(dbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;
      const maps = tx.createObjectStore('maps', { keyPath: 'mapId' });
      maps.createIndex('by_modifiedAt', 'modifiedAt');
      tx.createObjectStore('mapDocuments', { keyPath: 'mapId' });
      const attachments = tx.createObjectStore('mapAttachments', { keyPath: ['mapId', 'attachmentId'] });
      attachments.createIndex('by_mapId', 'mapId');
      tx.createObjectStore('settings', { keyPath: 'key' });
      tx.createObjectStore('meta', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal(raw.objectStoreNames.contains('recoveryWorkspaces'), false);
  assert.equal(raw.objectStoreNames.contains('recoveryCheckpoints'), false);
  assert.equal(raw.objectStoreNames.contains('recoveryAttachments'), false);
  const savedAt = '2026-01-01T00:00:00.000Z';
  await new Promise((resolve, reject) => {
    const tx = raw.transaction(['maps', 'mapDocuments', 'mapAttachments', 'settings', 'meta'], 'readwrite');
    tx.objectStore('maps').put({ schemaVersion: 1, mapId: 'map_legacy_0001', name: 'Legacy Map', createdAt: savedAt, modifiedAt: savedAt, savedAt, generation: 1, nodeCount: 2, attachmentBytes: 6, storedAttachmentCount: 1 });
    tx.objectStore('mapDocuments').put({ schemaVersion: 1, mapId: 'map_legacy_0001', generation: 1, savedAt, tree: legacySnapshot.tree, attachmentRefs: attachmentRefsFromSnapshot(legacySnapshot) });
    tx.objectStore('mapAttachments').put({ mapId: 'map_legacy_0001', attachmentId: legacySnapshot.attachments[0].persistentId, blob: legacySnapshot.attachments[0].blob, originalName: 'legacy.txt', sizeBytes: 6, mime: 'text/plain', classification, sha256: null });
    tx.objectStore('settings').put({ key: 'editor.preferences', value: { density: 'compact' } });
    tx.objectStore('meta').put({ key: 'schema', schemaVersion: 1 });
    tx.objectStore('meta').put({ key: 'libraryUsage', storedAttachmentBytes: 6, updatedAt: savedAt });
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
  raw.close();
  const upgraded = createPersistenceRepository({ indexedDB: factory, dbName, mapIdFactory: () => 'map_unused_0001' });
  const listed = await upgraded.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].mapId, 'map_legacy_0001');
  const loaded = await upgraded.load('map_legacy_0001');
  assert.equal(JSON.stringify(loaded.document.tree), JSON.stringify(legacySnapshot.tree));
  assert.equal(loaded.document.generation, 1);
  assert.equal(await loaded.attachments[0].blob.text(), 'legacy');
  const opened = await upgraded.open();
  for (const name of ['recoveryWorkspaces', 'recoveryCheckpoints', 'recoveryAttachments']) assert.equal(opened.db.objectStoreNames.contains(name), true);
  const recoveryTx = opened.db.transaction(['recoveryWorkspaces', 'recoveryCheckpoints', 'recoveryAttachments'], 'readonly');
  assert.equal(recoveryTx.objectStore('recoveryWorkspaces').indexNames.contains('by_state_updatedAt'), true);
  assert.equal(recoveryTx.objectStore('recoveryCheckpoints').indexNames.contains('by_workspace'), true);
  assert.equal(recoveryTx.objectStore('recoveryAttachments').indexNames.contains('by_workspace_generation'), true);
  const settingsTx = opened.db.transaction(['settings'], 'readonly');
  const settings = await new Promise((resolve, reject) => { const request = settingsTx.objectStore('settings').get('editor.preferences'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  assert.deepEqual(settings.value, { density: 'compact' });
  upgraded.close();
  const reopened = createPersistenceRepository({ indexedDB: factory, dbName, mapIdFactory: () => 'map_unused_0002' });
  assert.equal((await reopened.list()).length, 1);
  assert.equal(await (await reopened.load('map_legacy_0001')).attachments[0].blob.text(), 'legacy');
  reopened.close();
});
async function legacySnapshot(body) {
  const { tree, registry } = fixtureTree('legacy.txt', [body]);
  return buildSaveSnapshot({ tree, registry, datasetToken: 1, capturedRevision: 1, allocateAttachmentId: nextAttachmentId });
}

test('combined cap is enforced at equality and from legacy and recovery writes', async () => {
  const { repo } = setup({ libraryHardCapBytes: 100 });
  await repo.save(await legacySnapshot('a'.repeat(50)));
  const ws = await workspace(repo);
  const first = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: await snapshotFor(ws.workspaceId, { bodies: ['b'.repeat(50)] }) });
  assert.equal((await repo.combinedUsage()).totalBytes, 100);
  const ws2 = await workspace(repo);
  const overCap = await snapshotFor(ws2.workspaceId, { bodies: ['c'.repeat(1)] });
  await assert.rejects(() => repo.saveRecoveryCheckpoint({ workspaceId: ws2.workspaceId, workspaceToken: ws2.workspaceToken, expectedControlVersion: ws2.controlVersion, snapshot: overCap }), (error) => error.code === 'recovery-capacity');
  assert.equal((await repo.loadRecoveryCheckpoint(ws.workspaceId)).checkpoint.attachmentBytes, 50);
  const overLegacy = await legacySnapshot('d'.repeat(1));
  await assert.rejects(() => repo.save(overLegacy), (error) => error.code === 'library-limit');
  repo.close();
});

test('concurrent legacy and recovery writes cannot both pass obsolete totals', { skip: 'FakeIndexedDB stages overlapping readwrite transactions; native IndexedDB serialization is NOT RUN' }, async () => {
  const { repo } = setup({ libraryHardCapBytes: 60 });
  await repo.save(await legacySnapshot('a'.repeat(10)));
  const ws = await workspace(repo);
  const initial = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: await snapshotFor(ws.workspaceId, { bodies: ['b'.repeat(10)] }) });
  const nextLegacy = await legacySnapshot('c'.repeat(40));
  const nextRecovery = await snapshotFor(ws.workspaceId, { bodies: ['d'.repeat(40)] });
  const results = await Promise.allSettled([
    repo.save(nextLegacy),
    repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: initial.workspace.controlVersion, snapshot: nextRecovery })
  ]);
  const fulfilled = results.filter((result) => result.status === 'fulfilled').length;
  const rejected = results.filter((result) => result.status === 'rejected').length;
  assert.equal(fulfilled, 1);
  assert.equal(rejected, 1);
  assert.ok((await repo.combinedUsage()).totalBytes <= 60);
  repo.close();
});

test('aborted recovery transaction keeps prior checkpoint, rows and accounting', async () => {
  const { factory, repo } = setup();
  const ws = await workspace(repo);
  const first = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: await snapshotFor(ws.workspaceId, { bodies: ['stable'] }) });
  const before = await repo.combinedUsage();
  factory.failNextWrite = STORE_RECOVERY_ATTACHMENTS;
  const replacement = await snapshotFor(ws.workspaceId, { bodies: ['replacement'] });
  await assert.rejects(() => repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: first.workspace.controlVersion, snapshot: replacement }));
  const loaded = await repo.loadRecoveryCheckpoint(ws.workspaceId);
  assert.equal(loaded.checkpoint.checkpointGeneration, first.generation);
  assert.equal(await loaded.attachments[0].blob.text(), 'stable');
  assert.deepEqual(await repo.combinedUsage(), before);
  repo.close();
});

test('repairUsage recomputes both storage domains from actual rows', async () => {
  const { repo } = setup();
  await repo.save(await legacySnapshot('legacy'));
  const ws = await workspace(repo);
  await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: await snapshotFor(ws.workspaceId, { bodies: ['recovery'] }) });
  const opened = await repo.open();
  const tx = opened.transaction(['meta'], 'readwrite');
  tx.objectStore('meta').put({ key: META_LIBRARY_USAGE, storedAttachmentBytes: 999 });
  tx.objectStore('meta').put({ key: META_RECOVERY_USAGE, storedAttachmentBytes: 999 });
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  await repo.repairUsage();
  const check = opened.transaction(['meta'], 'readonly');
  const library = await new Promise((resolve, reject) => { const request = check.objectStore('meta').get(META_LIBRARY_USAGE); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  const recovery = await new Promise((resolve, reject) => { const request = check.objectStore('meta').get(META_RECOVERY_USAGE); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  assert.equal(library.storedAttachmentBytes, 6);
  assert.equal(recovery.storedAttachmentBytes, 8);
  repo.close();
});
test('save reservation from another workspace/token is rejected and pre-save writers are fenced', async () => {
  const { repo } = setup();
  const ws = await workspace(repo);
  const g1 = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: await snapshotFor(ws.workspaceId, { revision: 1 }) });
  const other = await workspace(repo);
  const otherReservation = await repo.beginRecoverySave({ workspaceId: other.workspaceId, workspaceToken: other.workspaceToken });
  await assert.rejects(() => repo.retireRecoveryThrough({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, saveId: otherReservation.saveId, saveSequence: otherReservation.saveSequence }), (error) => error.code === 'recovery-save-mismatch');
  const reservation = await repo.beginRecoverySave({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken });
  const delayed = await snapshotFor(ws.workspaceId, { revision: 2 });
  await assert.rejects(() => repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: g1.workspace.controlVersion, snapshot: delayed }), (error) => error.code === 'recovery-stale-owner');
  await repo.retireRecoveryThrough({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, saveId: reservation.saveId, saveSequence: reservation.saveSequence });
  assert.equal((await repo.loadRecoveryCheckpoint(ws.workspaceId)).checkpoint, null);
  repo.close();
});

test('source supersession requires durable child and preserves rows on failure', async () => {
  const { repo } = setup();
  const ws = await workspace(repo);
  const source = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: await snapshotFor(ws.workspaceId) });
  const claim = await repo.claimRecoverySource({ workspaceId: ws.workspaceId });
  const child = await repo.createRecoveryWorkspace({ forkedFrom: { workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, checkpointId: source.checkpoint.checkpointId, checkpointGeneration: source.generation }, claimId: claim.claimId });
  await assert.rejects(() => repo.supersedeRecoverySource({ sourceWorkspaceId: ws.workspaceId, sourceWorkspaceToken: ws.workspaceToken, sourceCheckpointId: source.checkpoint.checkpointId, sourceCheckpointGeneration: source.generation, childWorkspaceId: child.workspace.workspaceId, childCheckpointGeneration: 1 }), (error) => error.code === 'recovery-child-not-durable');
  const sourceRecord = await repo.loadRecoveryWorkspace(ws.workspaceId);
  assert.equal(sourceRecord.state, 'active');
  assert.equal((await repo.loadRecoveryCheckpoint(ws.workspaceId)).checkpoint.checkpointGeneration, source.generation);
  const childSnapshot = await snapshotFor(child.workspace.workspaceId, { bodies: ['child'] });
  const childSaved = await repo.saveRecoveryCheckpoint({ workspaceId: child.workspace.workspaceId, workspaceToken: child.workspace.workspaceToken, expectedControlVersion: child.workspace.controlVersion, snapshot: childSnapshot });
  const superseded = await repo.supersedeRecoverySource({ sourceWorkspaceId: ws.workspaceId, sourceWorkspaceToken: ws.workspaceToken, sourceCheckpointId: source.checkpoint.checkpointId, sourceCheckpointGeneration: source.generation, childWorkspaceId: child.workspace.workspaceId, childCheckpointGeneration: childSaved.generation });
  assert.equal(superseded.ok, true);
  const after = await repo.loadRecoveryWorkspace(ws.workspaceId);
  assert.equal(after.state, 'superseded');
  await assert.rejects(() => repo.loadRecoveryCheckpoint(ws.workspaceId), (error) => error.code === 'recovery-checkpoint-inactive');
  repo.close();
});

test('expired/replaced claim cannot authorize a fork of a newer source generation', async () => {
  const { repo, clock } = setup();
  const ws = await workspace(repo);
  const source = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: await snapshotFor(ws.workspaceId) });
  const first = await repo.claimRecoverySource({ workspaceId: ws.workspaceId, ttlMs: 1000 });
  clock.value = new Date(clock.value.getTime() + 5000);
  const second = await repo.claimRecoverySource({ workspaceId: ws.workspaceId, ttlMs: 60000 });
  await assert.rejects(() => repo.createRecoveryWorkspace({ forkedFrom: { workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, checkpointId: source.checkpoint.checkpointId, checkpointGeneration: source.generation }, claimId: first.claimId }), (error) => error.code === 'recovery-checkpoint-invalid' || error.code === 'recovery-claim-mismatch' || error.code === 'recovery-source-advanced');
  assert.equal((await repo.loadRecoveryWorkspace(ws.workspaceId)).claim.claimId, second.claimId);
  repo.close();
});

test('recovery snapshot owns detached bytes after its source is invalidated', async () => {
  const invalidatable = { invalid: false, bytes: new TextEncoder().encode('detached'), size: 8, type: 'text/plain', slice(start, end) { return { async arrayBuffer() { if (invalidatable.invalid) throw new Error('source invalid'); return invalidatable.bytes.slice(start, end).buffer; } }; }, async arrayBuffer() { if (invalidatable.invalid) throw new Error('source invalid'); return invalidatable.bytes.buffer; } };
  const registry = createAttachmentRegistry({ datasetToken: 1 });
  const adopted = registry.adopt({ attachmentId: 'att_source_1234', file: invalidatable, metadata: { attachmentId: 'att_source_1234', originalName: 'source.txt', sizeBytes: 8, mime: 'text/plain', classification } });
  assert.equal(adopted.ok, true);
  const tree = { id: 'root', kind: 'folder', name: 'Detached', children: [{ id: 'file', kind: 'file', name: 'source.txt', data: { dataType: 'file', description: null, link: null, attachmentId: 'att_source_1234', originalName: 'source.txt', sizeBytes: 8, mime: 'text/plain', classification } }] };
  const wsId = createRecoveryWorkspaceId();
  const snapshot = await buildRecoverySnapshot({ tree, registry, datasetToken: 1, capturedRevision: 1, workspaceId: wsId, allocateAttachmentId: nextAttachmentId });
  invalidatable.invalid = true;
  assert.equal(await snapshot.attachments[0].blob.text(), 'detached');
});

test('recovery snapshot preserves zero-byte attachments and repository limits reject fabricated counts', async () => {
  const { repo } = setup();
  const ws = await workspace(repo);
  const zero = await snapshotFor(ws.workspaceId, { bodies: [''] });
  const saved = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: zero });
  const loaded = await repo.loadRecoveryCheckpoint(ws.workspaceId);
  assert.equal(loaded.checkpoint.attachmentBytes, 0);
  assert.equal(await loaded.attachments[0].blob.text(), '');
  const bad = Object.freeze({ ...zero, nodeCount: 1000000, attachments: zero.attachments, attachmentRefs: zero.attachmentRefs, attachmentCount: zero.attachmentCount, totalAttachmentBytes: zero.totalAttachmentBytes });
  await assert.rejects(() => repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: saved.workspace.controlVersion, snapshot: bad }), (error) => error.code === 'recovery-node-count-mismatch');
  repo.close();
});
test('recovery snapshot cancellation rejects before writing', async () => {
  const { tree, registry } = fixtureTree();
  await assert.rejects(() => buildRecoverySnapshot({ tree, registry, datasetToken: 1, capturedRevision: 1, workspaceId: createRecoveryWorkspaceId(), allocateAttachmentId: nextAttachmentId, isCancelled: () => true }), (error) => error.code === 'recovery-cancelled');
});

test('a checkpoint committed after save reservation is newer and survives retirement', async () => {
  const { repo } = setup();
  const ws = await workspace(repo);
  const first = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: await snapshotFor(ws.workspaceId, { revision: 1 }) });
  const reservation = await repo.beginRecoverySave({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken });
  const newer = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: reservation.controlVersion, snapshot: await snapshotFor(ws.workspaceId, { revision: 2 }) });
  const retired = await repo.retireRecoveryThrough({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, saveId: reservation.saveId, saveSequence: reservation.saveSequence });
  assert.equal(retired.activeCheckpointGeneration, newer.generation);
  assert.equal((await repo.loadRecoveryCheckpoint(ws.workspaceId)).checkpoint.checkpointGeneration, newer.generation);
  assert.equal((await repo.loadRecoveryCheckpoint(ws.workspaceId)).checkpoint.capturedRevision, 2);
  repo.close();
});
test('repository rejects fabricated per-file and per-workspace attachment totals', async () => {
  const { repo } = setup();
  const ws = await workspace(repo);
  const snapshot = await snapshotFor(ws.workspaceId);
  const tooLargeFile = { ...snapshot, attachments: [{ ...snapshot.attachments[0], sizeBytes: MAX_SAVED_ATTACHMENT_BYTES + 1 }] };
  await assert.rejects(() => repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: tooLargeFile }), (error) => error.code === 'recovery-attachment-size-mismatch');
  const tooLargeWorkspace = { ...snapshot, totalAttachmentBytes: MAX_SAVED_MAP_ATTACHMENT_BYTES + 1 };
  await assert.rejects(() => repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: tooLargeWorkspace }), (error) => error.code === 'recovery-attachment-total-mismatch');
  repo.close();
});
test('reservation token/workspace mismatch and later checkpoint survive older retirement', async () => {
  const { repo } = setup();
  const ws = await workspace(repo);
  const first = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: await snapshotFor(ws.workspaceId, { revision: 1 }) });
  const reservation = await repo.beginRecoverySave({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken });
  await assert.rejects(() => repo.retireRecoveryThrough({ workspaceId: ws.workspaceId, workspaceToken: createRecoveryWorkspaceToken(), saveId: reservation.saveId, saveSequence: reservation.saveSequence }), (error) => error.code === 'recovery-workspace-token-mismatch');
  const later = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: reservation.controlVersion, snapshot: await snapshotFor(ws.workspaceId, { revision: 2 }) });
  const retired = await repo.retireRecoveryThrough({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, saveId: reservation.saveId, saveSequence: reservation.saveSequence });
  assert.equal(retired.activeCheckpointGeneration, later.generation);
  assert.equal((await repo.loadRecoveryCheckpoint(ws.workspaceId)).checkpoint.checkpointGeneration, later.generation);
  repo.close();
});
test('source claim discard is bound to exact generation and rejects stale/expired/replaced claims', async () => {
  const { repo, clock } = setup();
  const ws = await workspace(repo);
  const g1 = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: await snapshotFor(ws.workspaceId, { revision: 1 }) });
  const claim1 = await repo.claimRecoverySource({ workspaceId: ws.workspaceId, ttlMs: 60000 });
  const g2 = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: claim1.controlVersion, snapshot: await snapshotFor(ws.workspaceId, { bodies: ['newer'], revision: 2 }) });
  const before = await repo.combinedUsage();
  await assert.rejects(() => repo.discardRecoveryWorkspace({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, claimId: claim1.claimId, expectedCheckpointGeneration: g1.generation, expectedCheckpointId: g1.checkpoint.checkpointId }), (error) => error.code === 'recovery-source-advanced' || error.code === 'recovery-claim-generation-mismatch');
  assert.equal((await repo.loadRecoveryCheckpoint(ws.workspaceId)).checkpoint.checkpointGeneration, g2.generation);
  assert.equal((await repo.combinedUsage()).recoveryBytes, before.recoveryBytes);
  await assert.rejects(() => repo.claimRecoverySource({ workspaceId: ws.workspaceId, ttlMs: 60000 }), (error) => error.code === 'recovery-claimed');
  clock.value = new Date(clock.value.getTime() + 120000);
  const claim2 = await repo.claimRecoverySource({ workspaceId: ws.workspaceId, ttlMs: 60000 });
  await assert.rejects(() => repo.discardRecoveryWorkspace({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, claimId: claim1.claimId, expectedCheckpointGeneration: g2.generation, expectedCheckpointId: g2.checkpoint.checkpointId }), (error) => error.code === 'recovery-claim-mismatch');
  assert.equal((await repo.loadRecoveryCheckpoint(ws.workspaceId)).checkpoint.checkpointGeneration, g2.generation);
  assert.equal((await repo.combinedUsage()).recoveryBytes, before.recoveryBytes);
  await assert.rejects(() => repo.discardRecoveryWorkspace({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, claimId: claim2.claimId, expectedCheckpointGeneration: g2.generation, expectedCheckpointId: g1.checkpoint.checkpointId }), (error) => error.code === 'recovery-claim-generation-mismatch');
  assert.equal((await repo.loadRecoveryCheckpoint(ws.workspaceId)).checkpoint.checkpointGeneration, g2.generation);
  assert.equal((await repo.combinedUsage()).recoveryBytes, before.recoveryBytes);
  clock.value = new Date(clock.value.getTime() + 120000);
  const expired = await repo.claimRecoverySource({ workspaceId: ws.workspaceId, ttlMs: 60000 });
  clock.value = new Date(clock.value.getTime() + 120000);
  await assert.rejects(() => repo.discardRecoveryWorkspace({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, claimId: expired.claimId, expectedCheckpointGeneration: g2.generation, expectedCheckpointId: g2.checkpoint.checkpointId }), (error) => error.code === 'recovery-claim-expired');
  assert.equal((await repo.loadRecoveryCheckpoint(ws.workspaceId)).checkpoint.checkpointGeneration, g2.generation);
  assert.equal((await repo.combinedUsage()).recoveryBytes, before.recoveryBytes);
  const validClaim = await repo.claimRecoverySource({ workspaceId: ws.workspaceId, ttlMs: 60000 });
  const discarded = await repo.discardRecoveryWorkspace({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, claimId: validClaim.claimId, expectedCheckpointGeneration: g2.generation, expectedCheckpointId: g2.checkpoint.checkpointId });
  assert.equal(discarded.ok, true);
  assert.equal((await repo.loadRecoveryWorkspace(ws.workspaceId)).state, 'discarded');
  assert.equal((await repo.combinedUsage()).recoveryBytes, before.libraryBytes);
  repo.close();
});
async function withRecoveryTx(repo, mode, fn) {
  const opened = await repo.open();
  const tx = opened.transaction(['recoveryCheckpoints', 'recoveryAttachments', 'meta'], mode);
  await fn(tx);
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
}

test('loadCheckpoint rejects missing and extra attachment rows', async () => {
  const { repo } = setup();
  const ws = await workspace(repo);
  const snapshot = await snapshotFor(ws.workspaceId);
  const saved = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot });
  await withRecoveryTx(repo, 'readwrite', (tx) => {
    tx.objectStore('recoveryAttachments').delete([ws.workspaceId, saved.generation, snapshot.attachments[0].persistentId]);
  });
  await assert.rejects(() => repo.loadRecoveryCheckpoint(ws.workspaceId), (error) => error.code === 'recovery-checkpoint-incomplete');
  repo.close();

  const second = setup(); const ws2 = await workspace(second.repo); const snap2 = await snapshotFor(ws2.workspaceId);
  const saved2 = await second.repo.saveRecoveryCheckpoint({ workspaceId: ws2.workspaceId, workspaceToken: ws2.workspaceToken, expectedControlVersion: ws2.controlVersion, snapshot: snap2 });
  await withRecoveryTx(second.repo, 'readwrite', async (tx) => {
    const base = (await new Promise((resolve, reject) => { const request = tx.objectStore('recoveryAttachments').getAll(); request.onsuccess = () => resolve(request.result[0]); request.onerror = () => reject(request.error); }));
    tx.objectStore('recoveryAttachments').put({ ...base, attachmentId: 'att_extra_12345' });
  });
  await assert.rejects(() => second.repo.loadRecoveryCheckpoint(ws2.workspaceId), (error) => error.code === 'recovery-checkpoint-incomplete' || error.code === 'recovery-attachment-missing');
  second.repo.close();
});

test('loadCheckpoint rejects same-size hash corruption and count/total mismatch without deleting data', async () => {
  const { repo } = setup();
  const ws = await workspace(repo);
  const snapshot = await snapshotFor(ws.workspaceId, { bodies: ['hello'] });
  const saved = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot });
  await withRecoveryTx(repo, 'readwrite', async (tx) => {
    const row = (await new Promise((resolve, reject) => { const request = tx.objectStore('recoveryAttachments').getAll(); request.onsuccess = () => resolve(request.result[0]); request.onerror = () => reject(request.error); }));
    tx.objectStore('recoveryAttachments').put({ ...row, blob: new Blob(['HELLO'], { type: 'text/plain' }) });
  });
  await assert.rejects(() => repo.loadRecoveryCheckpoint(ws.workspaceId), (error) => error.code === 'recovery-hash-mismatch');
  assert.equal((await repo.loadRecoveryWorkspace(ws.workspaceId)).state, 'active');
  repo.close();
});

test('loadCheckpoint rejects wrong generation and counts, and incomplete child cannot supersede', async () => {
  const { repo } = setup();
  const ws = await workspace(repo);
  const snapshot = await snapshotFor(ws.workspaceId);
  const source = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot });
  await assert.rejects(() => repo.loadRecoveryCheckpoint(ws.workspaceId, 999), (error) => error.code === 'recovery-checkpoint-inactive' || error.code === 'recovery-checkpoint-missing');
  await withRecoveryTx(repo, 'readwrite', (tx) => {
    const record = { ...source.checkpoint, attachmentCount: 0 };
    tx.objectStore('recoveryCheckpoints').put(record);
  });
  await assert.rejects(() => repo.loadRecoveryCheckpoint(ws.workspaceId), (error) => error.code === 'recovery-checkpoint-invalid' || error.code === 'recovery-attachment-count-mismatch');
  await withRecoveryTx(repo, 'readwrite', (tx) => { tx.objectStore('recoveryCheckpoints').put(source.checkpoint); });
  const claim = await repo.claimRecoverySource({ workspaceId: ws.workspaceId });
  const child = await repo.createRecoveryWorkspace({ forkedFrom: { workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, checkpointId: source.checkpoint.checkpointId, checkpointGeneration: source.generation }, claimId: claim.claimId });
  const childSnapshot = await snapshotFor(child.workspace.workspaceId, { bodies: ['child'] });
  const childSaved = await repo.saveRecoveryCheckpoint({ workspaceId: child.workspace.workspaceId, workspaceToken: child.workspace.workspaceToken, expectedControlVersion: child.workspace.controlVersion, snapshot: childSnapshot });
  await withRecoveryTx(repo, 'readwrite', (tx) => {
    tx.objectStore('recoveryAttachments').delete([child.workspace.workspaceId, childSaved.generation, childSnapshot.attachments[0].persistentId]);
  });
  await assert.rejects(() => repo.supersedeRecoverySource({ sourceWorkspaceId: ws.workspaceId, sourceWorkspaceToken: ws.workspaceToken, sourceCheckpointId: source.checkpoint.checkpointId, sourceCheckpointGeneration: source.generation, childWorkspaceId: child.workspace.workspaceId, childCheckpointGeneration: childSaved.generation }), (error) => error.code === 'recovery-child-not-durable');
  assert.equal((await repo.loadRecoveryWorkspace(ws.workspaceId)).state, 'active');
  repo.close();
});
test('saveRecoveryCheckpoint derives totals and rejects under/over totals, mismatched payloads, duplicate/missing IDs', async () => {
  const { repo } = setup();
  const ws = await workspace(repo);
  const base = await snapshotFor(ws.workspaceId, { bodies: ['hello'] });
  const saved = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: base });
  const before = await repo.combinedUsage();
  const beforeControl = saved.workspace.controlVersion;
  const bads = [
    [{ ...base, totalAttachmentBytes: 0 }, 'recovery-attachment-total-mismatch'],
    [{ ...base, totalAttachmentBytes: base.totalAttachmentBytes + 1 }, 'recovery-attachment-total-mismatch'],
    [{ ...base, attachments: [{ ...base.attachments[0], blob: new Blob(['HELLO'], { type: 'text/plain' }) }] }, 'recovery-hash-mismatch'],
    [{ ...base, attachments: [...base.attachments, base.attachments[0]], attachmentCount: 2 }, 'recovery-attachment-duplicate'],
    [{ ...base, attachments: [], attachmentCount: 0 }, 'recovery-attachment-missing'],
    [{ ...base, attachmentCount: base.attachmentCount + 1 }, null]
  ];
  for (const [bad, expected] of bads) {
    await assert.rejects(() => repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: beforeControl, snapshot: bad }), (error) => expected === null ? error instanceof Error : error.code === expected);
    assert.equal((await repo.loadRecoveryCheckpoint(ws.workspaceId)).checkpoint.checkpointGeneration, saved.generation);
    assert.equal((await repo.loadRecoveryWorkspace(ws.workspaceId)).controlVersion, beforeControl);
    assert.deepEqual(await repo.combinedUsage(), before);
  }
  repo.close();
});

test('caller mutation during asynchronous recovery preparation cannot change the admitted snapshot', async () => {
  const { repo } = setup();
  const ws = await workspace(repo);
  const base = await snapshotFor(ws.workspaceId, { bodies: ['hello'] });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const slow = { size: 5, arrayBuffer: () => gate.then(() => new TextEncoder().encode('hello').buffer) };
  const mutable = { ...base, tree: structuredClone(base.tree), attachments: [{ ...base.attachments[0], blob: slow }] };
  const pending = repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: mutable });
  mutable.tree.name = 'MUTATED';
  mutable.attachments[0].originalName = 'MUTATED.txt';
  release();
  const saved = await pending;
  const loaded = await repo.loadRecoveryCheckpoint(ws.workspaceId);
  assert.equal(loaded.checkpoint.tree.name, 'Recovery Map Ünïcode');
  assert.equal(loaded.checkpoint.checkpointGeneration, saved.generation);
  assert.equal(loaded.attachments[0].metadata.originalName, 'note.txt');
  assert.equal(await loaded.attachments[0].blob.text(), 'hello');
  repo.close();
});
test('loadCheckpoint rejects attachment metadata corruption and checkpoint total mismatch', async () => {
  const { repo } = setup();
  const ws = await workspace(repo);
  const saved = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: await snapshotFor(ws.workspaceId) });
  await withRecoveryTx(repo, 'readwrite', async (tx) => {
    const row = await new Promise((resolve, reject) => { const request = tx.objectStore('recoveryAttachments').getAll(); request.onsuccess = () => resolve(request.result[0]); request.onerror = () => reject(request.error); });
    tx.objectStore('recoveryAttachments').put({ ...row, originalName: 'mismatch.txt' });
  });
  await assert.rejects(() => repo.loadRecoveryCheckpoint(ws.workspaceId), (error) => error.code === 'recovery-attachment-mismatch');
  await withRecoveryTx(repo, 'readwrite', (tx) => { tx.objectStore('recoveryCheckpoints').put({ ...saved.checkpoint, attachmentBytes: saved.checkpoint.attachmentBytes + 1 }); });
  await assert.rejects(() => repo.loadRecoveryCheckpoint(ws.workspaceId), (error) => error.code === 'recovery-attachment-total-mismatch' || error.code === 'recovery-checkpoint-incomplete');
  assert.equal((await repo.loadRecoveryWorkspace(ws.workspaceId)).state, 'active');
  repo.close();
});
async function assertForkRejected(repo, { workspaceId, workspaceToken, forkedFrom, claimId, childId, code }) {
  const before = await repo.loadRecoveryWorkspace(workspaceId);
  const beforeCheckpoint = await repo.loadRecoveryCheckpoint(workspaceId);
  const beforeUsage = await repo.combinedUsage();
  await assert.rejects(() => repo.createRecoveryWorkspace({ workspaceId: childId, workspaceToken: createRecoveryWorkspaceToken(), forkedFrom, claimId }), (error) => error.code === code);
  assert.equal(await repo.loadRecoveryWorkspace(childId), null);
  const after = await repo.loadRecoveryWorkspace(workspaceId);
  assert.deepEqual(after, before);
  const afterCheckpoint = await repo.loadRecoveryCheckpoint(workspaceId);
  assert.deepEqual(afterCheckpoint.checkpoint, beforeCheckpoint.checkpoint);
  assert.equal(await afterCheckpoint.attachments[0].blob.text(), await beforeCheckpoint.attachments[0].blob.text());
  assert.deepEqual(await repo.combinedUsage(), beforeUsage);
}

test('fork creation requires exact source workspace token, checkpoint and claim identity', async () => {
  const { repo, clock } = setup();
  const ws = await workspace(repo);
  const g1 = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: await snapshotFor(ws.workspaceId, { revision: 1 }) });
  const claim1 = await repo.claimRecoverySource({ workspaceId: ws.workspaceId, ttlMs: 60000 });
  const wrongToken = createRecoveryWorkspaceToken();
  await assertForkRejected(repo, { workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, forkedFrom: { workspaceId: ws.workspaceId, workspaceToken: wrongToken, checkpointId: g1.checkpoint.checkpointId, checkpointGeneration: g1.generation }, claimId: claim1.claimId, childId: createRecoveryWorkspaceId(), code: 'recovery-checkpoint-identity-mismatch' });

  const g2 = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: claim1.controlVersion, snapshot: await snapshotFor(ws.workspaceId, { bodies: ['newer'], revision: 2 }) });
  await assertForkRejected(repo, { workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, forkedFrom: { workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, checkpointId: g2.checkpoint.checkpointId, checkpointGeneration: g2.generation }, claimId: claim1.claimId, childId: createRecoveryWorkspaceId(), code: 'recovery-claim-generation-mismatch' });

  clock.value = new Date(clock.value.getTime() + 120000);
  const claim2 = await repo.claimRecoverySource({ workspaceId: ws.workspaceId, ttlMs: 60000 });
  await withRecoveryTx(repo, 'readwrite', async (tx) => {
    const control = await new Promise((resolve, reject) => { const request = tx.objectStore('recoveryWorkspaces').get(ws.workspaceId); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    control.claim.checkpointId = createRecoveryCheckpointId();
    tx.objectStore('recoveryWorkspaces').put(control);
  });
  await assertForkRejected(repo, { workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, forkedFrom: { workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, checkpointId: g2.checkpoint.checkpointId, checkpointGeneration: g2.generation }, claimId: claim2.claimId, childId: createRecoveryWorkspaceId(), code: 'recovery-claim-generation-mismatch' });

  clock.value = new Date(clock.value.getTime() + 120000);
  const expired = await repo.claimRecoverySource({ workspaceId: ws.workspaceId, ttlMs: 60000 });
  clock.value = new Date(clock.value.getTime() + 120000);
  await assertForkRejected(repo, { workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, forkedFrom: { workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, checkpointId: g2.checkpoint.checkpointId, checkpointGeneration: g2.generation }, claimId: expired.claimId, childId: createRecoveryWorkspaceId(), code: 'recovery-claim-expired' });

  const validClaim = await repo.claimRecoverySource({ workspaceId: ws.workspaceId, ttlMs: 60000 });
  const childId = createRecoveryWorkspaceId();
  const child = await repo.createRecoveryWorkspace({ workspaceId: childId, workspaceToken: createRecoveryWorkspaceToken(), forkedFrom: { workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, checkpointId: g2.checkpoint.checkpointId, checkpointGeneration: g2.generation }, claimId: validClaim.claimId });
  assert.equal(child.workspace.forkedFrom.workspaceToken, ws.workspaceToken);
  assert.equal(child.workspace.forkedFrom.checkpointId, g2.checkpoint.checkpointId);
  repo.close();
});
test('checkpoint identity must match its workspace control and cannot authorize supersession', async () => {
  const { repo } = setup();
  const ws = await workspace(repo);
  const source = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: await snapshotFor(ws.workspaceId) });
  const beforeUsage = await repo.combinedUsage();
  const beforeWorkspace = await repo.loadRecoveryWorkspace(ws.workspaceId);
  await withRecoveryTx(repo, 'readwrite', async (tx) => {
    const checkpoint = await new Promise((resolve, reject) => { const request = tx.objectStore('recoveryCheckpoints').get([ws.workspaceId, source.generation]); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    checkpoint.workspaceToken = createRecoveryWorkspaceToken();
    tx.objectStore('recoveryCheckpoints').put(checkpoint);
  });
  await assert.rejects(() => repo.loadRecoveryCheckpoint(ws.workspaceId), (error) => error.code === 'recovery-checkpoint-identity-mismatch');
  assert.equal((await repo.listRecoveryCandidates()).length, 0);
  assert.deepEqual(await repo.loadRecoveryWorkspace(ws.workspaceId), beforeWorkspace);
  assert.deepEqual(await repo.combinedUsage(), beforeUsage);

  const second = setup(); const ws2 = await workspace(second.repo);
  const source2 = await second.repo.saveRecoveryCheckpoint({ workspaceId: ws2.workspaceId, workspaceToken: ws2.workspaceToken, expectedControlVersion: ws2.controlVersion, snapshot: await snapshotFor(ws2.workspaceId) });
  const openedSecond = await second.repo.open();
  const secondStore = openedSecond.db._stores.get('recoveryCheckpoints');
  const secondKey = JSON.stringify([ws2.workspaceId, source2.generation]);
  const secondRecord = secondStore.records.get(secondKey);
  secondRecord.workspaceId = createRecoveryWorkspaceId();
  secondStore.records.set(secondKey, secondRecord);
  await assert.rejects(() => second.repo.loadRecoveryCheckpoint(ws2.workspaceId), (error) => error.code === 'recovery-checkpoint-identity-mismatch');
  assert.equal((await second.repo.listRecoveryCandidates()).length, 0);
  second.repo.close();

  const third = setup(); const ws3 = await workspace(third.repo);
  const source3 = await third.repo.saveRecoveryCheckpoint({ workspaceId: ws3.workspaceId, workspaceToken: ws3.workspaceToken, expectedControlVersion: ws3.controlVersion, snapshot: await snapshotFor(ws3.workspaceId) });
  const claim = await third.repo.claimRecoverySource({ workspaceId: ws3.workspaceId });
  const child = await third.repo.createRecoveryWorkspace({ forkedFrom: { workspaceId: ws3.workspaceId, workspaceToken: ws3.workspaceToken, checkpointId: source3.checkpoint.checkpointId, checkpointGeneration: source3.generation }, claimId: claim.claimId });
  const childSource = await snapshotFor(child.workspace.workspaceId, { bodies: ['child'] });
  const childSaved = await third.repo.saveRecoveryCheckpoint({ workspaceId: child.workspace.workspaceId, workspaceToken: child.workspace.workspaceToken, expectedControlVersion: child.workspace.controlVersion, snapshot: childSource });
  await withRecoveryTx(third.repo, 'readwrite', async (tx) => {
    const checkpoint = await new Promise((resolve, reject) => { const request = tx.objectStore('recoveryCheckpoints').get([child.workspace.workspaceId, childSaved.generation]); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    checkpoint.workspaceToken = createRecoveryWorkspaceToken();
    tx.objectStore('recoveryCheckpoints').put(checkpoint);
  });
  await assert.rejects(() => third.repo.supersedeRecoverySource({ sourceWorkspaceId: ws3.workspaceId, sourceWorkspaceToken: ws3.workspaceToken, sourceCheckpointId: source3.checkpoint.checkpointId, sourceCheckpointGeneration: source3.generation, childWorkspaceId: child.workspace.workspaceId, childCheckpointGeneration: childSaved.generation }), (error) => error.code === 'recovery-child-not-durable');
  assert.equal((await third.repo.loadRecoveryWorkspace(ws3.workspaceId)).state, 'active');
  assert.equal((await third.repo.loadRecoveryCheckpoint(ws3.workspaceId)).checkpoint.checkpointGeneration, source3.generation);
  third.repo.close();
});
test('inconsistent source identity cannot authorize supersession', async () => {
  const { repo } = setup();
  const ws = await workspace(repo);
  const source = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: await snapshotFor(ws.workspaceId) });
  const claim = await repo.claimRecoverySource({ workspaceId: ws.workspaceId });
  const child = await repo.createRecoveryWorkspace({ forkedFrom: { workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, checkpointId: source.checkpoint.checkpointId, checkpointGeneration: source.generation }, claimId: claim.claimId });
  const childSaved = await repo.saveRecoveryCheckpoint({ workspaceId: child.workspace.workspaceId, workspaceToken: child.workspace.workspaceToken, expectedControlVersion: child.workspace.controlVersion, snapshot: await snapshotFor(child.workspace.workspaceId, { bodies: ['child'] }) });
  const beforeUsage = await repo.combinedUsage();
  const beforeSource = await repo.loadRecoveryWorkspace(ws.workspaceId);
  await withRecoveryTx(repo, 'readwrite', async (tx) => {
    const checkpoint = await new Promise((resolve, reject) => { const request = tx.objectStore('recoveryCheckpoints').get([ws.workspaceId, source.generation]); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    checkpoint.workspaceToken = createRecoveryWorkspaceToken();
    tx.objectStore('recoveryCheckpoints').put(checkpoint);
  });
  await assert.rejects(() => repo.supersedeRecoverySource({ sourceWorkspaceId: ws.workspaceId, sourceWorkspaceToken: ws.workspaceToken, sourceCheckpointId: source.checkpoint.checkpointId, sourceCheckpointGeneration: source.generation, childWorkspaceId: child.workspace.workspaceId, childCheckpointGeneration: childSaved.generation }), (error) => error.code === 'recovery-checkpoint-identity-mismatch');
  assert.deepEqual(await repo.loadRecoveryWorkspace(ws.workspaceId), beforeSource);
  assert.deepEqual(await repo.combinedUsage(), beforeUsage);
  repo.close();
});


test('recovery checkpoint accepts 300 nodes and a rejected 301 snapshot preserves the existing checkpoint', async () => {
  const { repo } = setup();
  const ws = await workspace(repo);
  const makeTree = (count) => ({
    id: 'root', name: 'Recovery Boundary', kind: 'folder', data: {},
    children: Array.from({ length: count - 1 }, (_, index) => ({
      id: `n-${index}`, name: `n-${index}.txt`, kind: 'file', data: { dataType: 'legacy' }
    }))
  });
  const good = await buildRecoverySnapshot({
    tree: makeTree(300), registry: new Map(), datasetToken: 1, capturedRevision: 4,
    workspaceId: ws.workspaceId, allocateAttachmentId: nextAttachmentId
  });
  assert.equal(good.nodeCount, 300);
  const saved = await repo.saveRecoveryCheckpoint({
    workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken,
    expectedControlVersion: ws.controlVersion, documentName: 'boundary.orbit', origin: 'new', snapshot: good
  });
  assert.equal(saved.ok, true);
  const before = await repo.loadRecoveryCheckpoint(ws.workspaceId);
  assert.equal(before.checkpoint.nodeCount, 300);
  assert.equal(before.checkpoint.tree.children.length, 299);
  const generation = before.checkpoint.checkpointGeneration;
  const forged = { ...good, tree: makeTree(301), nodeCount: 301 };
  await assert.rejects(() => repo.saveRecoveryCheckpoint({
    workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken,
    expectedControlVersion: saved.workspace.controlVersion, documentName: 'boundary.orbit', origin: 'new', snapshot: forged
  }), (error) => error.code === 'recovery-tree-invalid' || error.code === 'node-limit');
  const after = await repo.loadRecoveryCheckpoint(ws.workspaceId);
  assert.equal(after.checkpoint.checkpointGeneration, generation);
  assert.equal(after.checkpoint.nodeCount, 300);
  assert.equal(after.checkpoint.tree.children.length, 299);
  repo.close();
});
